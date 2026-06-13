import {
  EventEnvelopeSchema,
  type EventEnvelope,
  type EventVisibility
} from "@deliberum/protocol";
import type {
  AppendEventInput,
  AppendEventResult,
  EventStore
} from "./event-store";
import { isCompatibleIdempotentEventInput } from "./idempotency";
import { attachEventIntegrity, validateEventIntegrityChain } from "./integrity";
import { cloneAndFreezeEvent, type StoredEvent } from "./immutable";
import { dirname, resolve } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";

export const JSON_EVENT_STORE_SCHEMA_VERSION = 1 as const;

export class JsonFileEventStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonFileEventStoreError";
  }
}

export type JsonFileEventStoreFileSystem = {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  writeFileSync: typeof writeFileSync;
};

export type JsonFileEventStoreOptions = {
  filePath?: string;
  clock?: () => string;
  fileSystem?: Partial<JsonFileEventStoreFileSystem>;
  tempFileName?: () => string;
};

type PersistedLedger = {
  schemaVersion: typeof JSON_EVENT_STORE_SCHEMA_VERSION;
  events: EventEnvelope[];
};

const defaultFileSystem: JsonFileEventStoreFileSystem = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
};

export function defaultStorePath(cwd = process.cwd()): string {
  return resolve(cwd, ".deliberum", "events.json");
}

export class JsonFileEventStore implements EventStore {
  private readonly filePath: string;
  private readonly clock: () => string;
  private readonly fileSystem: JsonFileEventStoreFileSystem;
  private readonly tempFileName: () => string;
  private readonly eventsById = new Map<string, EventEnvelope>();
  private readonly eventsBySession = new Map<string, EventEnvelope[]>();
  private readonly idempotencyBySessionAndKey = new Map<string, EventEnvelope>();
  private readonly nextSequenceBySession = new Map<string, number>();

  constructor(options: JsonFileEventStoreOptions = {}) {
    this.filePath = options.filePath ?? defaultStorePath();
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.fileSystem = {
      ...defaultFileSystem,
      ...options.fileSystem
    };
    this.tempFileName =
      options.tempFileName ??
      (() => `${this.filePath}.${process.pid}.${Date.now()}.tmp`);

    this.load();
  }

  appendEvent<TPayload = unknown>(input: AppendEventInput<TPayload>): StoredEvent<TPayload> {
    return this.appendEventResult(input).event;
  }

  appendEventResult<TPayload = unknown>(
    input: AppendEventInput<TPayload>
  ): AppendEventResult<TPayload> {
    this.rejectStoreAssignedFields(input);

    const idempotencyLookupKey = this.createIdempotencyLookupKey(input);
    if (idempotencyLookupKey) {
      const existing = this.idempotencyBySessionAndKey.get(idempotencyLookupKey);
      if (existing) {
        if (!isCompatibleIdempotentEventInput(existing, input)) {
          throw new JsonFileEventStoreError(
            "Idempotency key was reused for a different event input."
          );
        }

        return {
          event: cloneAndFreezeEvent(existing as EventEnvelope<TPayload>),
          appended: false
        };
      }
    }

    if (this.eventsById.has(input.id)) {
      throw new JsonFileEventStoreError(`Duplicate event id: ${input.id}`);
    }

    const sequence = this.nextSequenceBySession.get(input.sessionId) ?? 0;
    const eventWithoutIntegrity = EventEnvelopeSchema.parse({
      ...input,
      sequence,
      recordedAt: this.clock()
    } satisfies EventEnvelope<TPayload>) as EventEnvelope<TPayload>;
    const parsedEvent = EventEnvelopeSchema.parse(
      attachEventIntegrity(
        eventWithoutIntegrity,
        this.getSessionEvents(eventWithoutIntegrity.sessionId).at(-1)
      )
    ) as EventEnvelope<TPayload>;

    this.storeEvent(parsedEvent);
    this.persist();

    return {
      event: cloneAndFreezeEvent(parsedEvent),
      appended: true
    };
  }

  appendEvents<TPayload = unknown>(inputs: AppendEventInput<TPayload>[]): StoredEvent<TPayload>[] {
    return inputs.map((input) => this.appendEvent(input));
  }

  getEvent<TPayload = unknown>(eventId: string): StoredEvent<TPayload> | undefined {
    const event = this.eventsById.get(eventId);
    return event ? cloneAndFreezeEvent(event as EventEnvelope<TPayload>) : undefined;
  }

  listSessionIds(): string[] {
    return Array.from(this.eventsBySession.keys()).sort();
  }

  listEvents(sessionId: string): StoredEvent[] {
    return this.cloneEvents(this.getSessionEvents(sessionId));
  }

  listEventsByRange(sessionId: string, fromSequence: number, toSequence: number): StoredEvent[] {
    if (!Number.isInteger(fromSequence) || !Number.isInteger(toSequence)) {
      throw new JsonFileEventStoreError("Sequence range bounds must be integers.");
    }

    if (fromSequence < 0 || toSequence < 0 || fromSequence > toSequence) {
      throw new JsonFileEventStoreError("Sequence range is invalid.");
    }

    return this.cloneEvents(
      this
        .getSessionEvents(sessionId)
        .filter((event) => event.sequence >= fromSequence && event.sequence <= toSequence)
    );
  }

  listEventsByType(sessionId: string, type: string): StoredEvent[] {
    return this.cloneEvents(this.getSessionEvents(sessionId).filter((event) => event.type === type));
  }

  listEventsByBatch(sessionId: string, batchId: string): StoredEvent[] {
    return this.cloneEvents(
      this.getSessionEvents(sessionId).filter((event) => event.batchId === batchId)
    );
  }

  listEventsByVisibility(sessionId: string, visibility: EventVisibility): StoredEvent[] {
    return this.cloneEvents(
      this.getSessionEvents(sessionId).filter((event) => event.visibility === visibility)
    );
  }

  private load(): void {
    if (!this.fileSystem.existsSync(this.filePath)) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.fileSystem.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new JsonFileEventStoreError(
        `Unable to read JSON event store: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const ledger = this.parsePersistedLedger(parsed);
    for (const event of ledger.events) {
      this.storeEvent(event);
    }
  }

  private parsePersistedLedger(input: unknown): PersistedLedger {
    if (typeof input !== "object" || input === null) {
      throw new JsonFileEventStoreError("JSON event store must be an object.");
    }

    const ledger = input as { schemaVersion?: unknown; events?: unknown };
    if (ledger.schemaVersion !== JSON_EVENT_STORE_SCHEMA_VERSION) {
      throw new JsonFileEventStoreError(
        `Unsupported JSON event store schemaVersion: ${String(ledger.schemaVersion)}`
      );
    }

    if (!Array.isArray(ledger.events)) {
      throw new JsonFileEventStoreError("JSON event store events must be an array.");
    }

    const events = ledger.events.map((event) => {
      const parsedEvent = EventEnvelopeSchema.safeParse(event);
      if (!parsedEvent.success) {
        throw new JsonFileEventStoreError(parsedEvent.error.message);
      }

      return parsedEvent.data;
    });

    validatePersistedLedgerIntegrity(events);

    return {
      schemaVersion: JSON_EVENT_STORE_SCHEMA_VERSION,
      events
    };
  }

  private storeEvent(event: EventEnvelope): void {
    if (this.eventsById.has(event.id)) {
      throw new JsonFileEventStoreError(`Duplicate event id in JSON event store: ${event.id}`);
    }

    const sessionEvents = this.eventsBySession.get(event.sessionId) ?? [];
    sessionEvents.push(event);
    sessionEvents.sort((left, right) => left.sequence - right.sequence);
    this.eventsBySession.set(event.sessionId, sessionEvents);
    this.eventsById.set(event.id, event);
    this.nextSequenceBySession.set(
      event.sessionId,
      Math.max(this.nextSequenceBySession.get(event.sessionId) ?? 0, event.sequence + 1)
    );

    if (event.idempotencyKey) {
      this.idempotencyBySessionAndKey.set(
        `${event.sessionId}:${event.idempotencyKey}`,
        event
      );
    }
  }

  private persist(): void {
    const directory = dirname(this.filePath);
    this.fileSystem.mkdirSync(directory, { recursive: true });

    const tmpPath = this.tempFileName();
    const ledger: PersistedLedger = {
      schemaVersion: JSON_EVENT_STORE_SCHEMA_VERSION,
      events: [...this.eventsById.values()].sort(compareEvents)
    };

    this.fileSystem.writeFileSync(tmpPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    this.fileSystem.renameSync(tmpPath, this.filePath);
  }

  private rejectStoreAssignedFields(input: unknown): void {
    if (typeof input !== "object" || input === null) {
      throw new JsonFileEventStoreError("Event input must be an object.");
    }

    if ("sequence" in input) {
      throw new JsonFileEventStoreError("Event sequence is assigned by the store.");
    }

    if ("recordedAt" in input) {
      throw new JsonFileEventStoreError("Event recordedAt is assigned by the store.");
    }

    if ("integrity" in input) {
      throw new JsonFileEventStoreError("Event integrity is assigned by the store.");
    }
  }

  private createIdempotencyLookupKey(input: AppendEventInput): string | undefined {
    return input.idempotencyKey ? `${input.sessionId}:${input.idempotencyKey}` : undefined;
  }

  private getSessionEvents(sessionId: string): EventEnvelope[] {
    return this.eventsBySession.get(sessionId) ?? [];
  }

  private cloneEvents(events: readonly EventEnvelope[]): StoredEvent[] {
    return events.map((event) => cloneAndFreezeEvent(event));
  }
}

function compareEvents(left: EventEnvelope, right: EventEnvelope): number {
  if (left.sessionId === right.sessionId) {
    return left.sequence - right.sequence;
  }

  return left.sessionId.localeCompare(right.sessionId);
}

function validatePersistedLedgerIntegrity(events: readonly EventEnvelope[]): void {
  const eventIds = new Set<string>();
  const sequencesBySession = new Map<string, Set<number>>();
  const eventCountsBySession = new Map<string, number>();
  const idempotencyEventIds = new Map<string, string>();

  for (const event of events) {
    if (eventIds.has(event.id)) {
      throw new JsonFileEventStoreError(`Duplicate event id in JSON event store: ${event.id}`);
    }
    eventIds.add(event.id);

    if (!Number.isInteger(event.sequence) || event.sequence < 0) {
      throw new JsonFileEventStoreError(
        `Invalid sequence in JSON event store for session ${event.sessionId}.`
      );
    }

    const sessionSequences = sequencesBySession.get(event.sessionId) ?? new Set<number>();
    if (sessionSequences.has(event.sequence)) {
      throw new JsonFileEventStoreError(
        `Duplicate sequence in JSON event store for session ${event.sessionId}: ${event.sequence}`
      );
    }
    sessionSequences.add(event.sequence);
    sequencesBySession.set(event.sessionId, sessionSequences);
    eventCountsBySession.set(event.sessionId, (eventCountsBySession.get(event.sessionId) ?? 0) + 1);

    if (event.idempotencyKey) {
      const idempotencyLookupKey = `${event.sessionId}:${event.idempotencyKey}`;
      const existingEventId = idempotencyEventIds.get(idempotencyLookupKey);
      if (existingEventId !== undefined && existingEventId !== event.id) {
        throw new JsonFileEventStoreError(
          `Conflicting idempotency key in JSON event store for session ${event.sessionId}.`
        );
      }
      idempotencyEventIds.set(idempotencyLookupKey, event.id);
    }
  }

  for (const [sessionId, sequences] of sequencesBySession) {
    const expectedCount = eventCountsBySession.get(sessionId) ?? 0;
    for (let sequence = 0; sequence < expectedCount; sequence += 1) {
      if (!sequences.has(sequence)) {
        throw new JsonFileEventStoreError(
          `JSON event store sequences for session ${sessionId} must be contiguous from 0.`
        );
      }
    }
  }

  const integrityError = validateEventIntegrityChain(events);
  if (integrityError) {
    throw new JsonFileEventStoreError(integrityError);
  }
}
