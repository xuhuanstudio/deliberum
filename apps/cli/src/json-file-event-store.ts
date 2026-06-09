import {
  EventEnvelopeSchema,
  type EventEnvelope,
  type EventVisibility
} from "@deliberum/protocol";
import type { AppendEventInput, EventStore, StoredEvent } from "@deliberum/storage";
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
    this.rejectStoreAssignedFields(input);

    const idempotencyLookupKey = this.createIdempotencyLookupKey(input);
    if (idempotencyLookupKey) {
      const existing = this.idempotencyBySessionAndKey.get(idempotencyLookupKey);
      if (existing) {
        return cloneAndFreeze(existing as EventEnvelope<TPayload>);
      }
    }

    if (this.eventsById.has(input.id)) {
      throw new JsonFileEventStoreError(`Duplicate event id: ${input.id}`);
    }

    const sequence = this.nextSequenceBySession.get(input.sessionId) ?? 0;
    const event = {
      ...input,
      sequence,
      recordedAt: this.clock()
    } satisfies EventEnvelope<TPayload>;
    const parsedEvent = EventEnvelopeSchema.parse(event) as EventEnvelope<TPayload>;

    this.storeEvent(parsedEvent);
    this.persist();

    return cloneAndFreeze(parsedEvent);
  }

  appendEvents<TPayload = unknown>(inputs: AppendEventInput<TPayload>[]): StoredEvent<TPayload>[] {
    return inputs.map((input) => this.appendEvent(input));
  }

  getEvent<TPayload = unknown>(eventId: string): StoredEvent<TPayload> | undefined {
    const event = this.eventsById.get(eventId);
    return event ? cloneAndFreeze(event as EventEnvelope<TPayload>) : undefined;
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

    return {
      schemaVersion: JSON_EVENT_STORE_SCHEMA_VERSION,
      events: ledger.events.map((event) => {
        const parsedEvent = EventEnvelopeSchema.safeParse(event);
        if (!parsedEvent.success) {
          throw new JsonFileEventStoreError(parsedEvent.error.message);
        }

        return parsedEvent.data;
      })
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
  }

  private createIdempotencyLookupKey(input: AppendEventInput): string | undefined {
    return input.idempotencyKey ? `${input.sessionId}:${input.idempotencyKey}` : undefined;
  }

  private getSessionEvents(sessionId: string): EventEnvelope[] {
    return this.eventsBySession.get(sessionId) ?? [];
  }

  private cloneEvents(events: readonly EventEnvelope[]): StoredEvent[] {
    return events.map((event) => cloneAndFreeze(event));
  }
}

function compareEvents(left: EventEnvelope, right: EventEnvelope): number {
  if (left.sessionId === right.sessionId) {
    return left.sequence - right.sequence;
  }

  return left.sessionId.localeCompare(right.sessionId);
}

function cloneAndFreeze<TPayload>(event: EventEnvelope<TPayload>): StoredEvent<TPayload> {
  return deepFreeze(structuredClone(event)) as StoredEvent<TPayload>;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    const nested = (value as Record<PropertyKey, unknown>)[key];
    if (typeof nested === "object" && nested !== null && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }

  return Object.freeze(value);
}
