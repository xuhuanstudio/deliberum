import { EventEnvelopeSchema, type EventEnvelope, type EventVisibility } from "@deliberum/protocol";
import { DuplicateEventIdError, InvalidEventInputError, InvalidEventRangeError } from "./errors";
import type { AppendEventInput, AppendEventResult, EventStore } from "./event-store";
import { isCompatibleIdempotentEventInput } from "./idempotency";
import { cloneAndFreezeEvent, type StoredEvent } from "./immutable";

export type InMemoryEventStoreOptions = {
  clock?: () => string;
};

export class InMemoryEventStore implements EventStore {
  private readonly clock: () => string;
  private readonly eventsById = new Map<string, StoredEvent>();
  private readonly eventsBySession = new Map<string, StoredEvent[]>();
  private readonly idempotencyBySessionAndKey = new Map<string, StoredEvent>();
  private readonly nextSequenceBySession = new Map<string, number>();

  constructor(options: InMemoryEventStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date().toISOString());
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
        if (!isCompatibleIdempotentEventInput(existing as EventEnvelope, input)) {
          throw new InvalidEventInputError(
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
      throw new DuplicateEventIdError(input.id);
    }

    const sequence = this.nextSequenceBySession.get(input.sessionId) ?? 0;
    const event = {
      ...input,
      sequence,
      recordedAt: this.clock()
    } satisfies EventEnvelope<TPayload>;

    const parsedEvent = EventEnvelopeSchema.parse(event) as EventEnvelope<TPayload>;
    const storedEvent = cloneAndFreezeEvent(parsedEvent);
    const sessionEvents = this.eventsBySession.get(storedEvent.sessionId) ?? [];

    sessionEvents.push(storedEvent);
    this.eventsBySession.set(storedEvent.sessionId, sessionEvents);
    this.eventsById.set(storedEvent.id, storedEvent);
    this.nextSequenceBySession.set(storedEvent.sessionId, sequence + 1);

    if (idempotencyLookupKey) {
      this.idempotencyBySessionAndKey.set(idempotencyLookupKey, storedEvent);
    }

    return {
      event: cloneAndFreezeEvent(storedEvent as EventEnvelope<TPayload>),
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
    this.validateRange(fromSequence, toSequence);

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

  private rejectStoreAssignedFields(input: unknown): void {
    if (typeof input !== "object" || input === null) {
      throw new InvalidEventInputError("Event input must be an object.");
    }

    if ("sequence" in input) {
      throw new InvalidEventInputError("Event sequence is assigned by the store.");
    }

    if ("recordedAt" in input) {
      throw new InvalidEventInputError("Event recordedAt is assigned by the store.");
    }
  }

  private createIdempotencyLookupKey(input: AppendEventInput): string | undefined {
    return input.idempotencyKey ? `${input.sessionId}:${input.idempotencyKey}` : undefined;
  }

  private getSessionEvents(sessionId: string): StoredEvent[] {
    return this.eventsBySession.get(sessionId) ?? [];
  }

  private cloneEvents(events: readonly StoredEvent[]): StoredEvent[] {
    return events.map((event) => cloneAndFreezeEvent(event as EventEnvelope));
  }

  private validateRange(fromSequence: number, toSequence: number): void {
    if (!Number.isInteger(fromSequence) || !Number.isInteger(toSequence)) {
      throw new InvalidEventRangeError("Sequence range bounds must be integers.");
    }

    if (fromSequence < 0 || toSequence < 0) {
      throw new InvalidEventRangeError("Sequence range bounds must be non-negative.");
    }

    if (fromSequence > toSequence) {
      throw new InvalidEventRangeError("Sequence range start must be less than or equal to end.");
    }
  }
}
