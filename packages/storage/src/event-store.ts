import type { EventEnvelope, EventVisibility } from "@deliberum/protocol";
import type { StoredEvent } from "./immutable";

export type AppendEventInput<TPayload = unknown> = Omit<
  EventEnvelope<TPayload>,
  "sequence" | "recordedAt"
> & {
  sequence?: never;
  recordedAt?: never;
};

export type AppendEventResult<TPayload = unknown> = {
  event: StoredEvent<TPayload>;
  appended: boolean;
};

export interface EventStore {
  appendEvent<TPayload = unknown>(input: AppendEventInput<TPayload>): StoredEvent<TPayload>;
  appendEventResult<TPayload = unknown>(
    input: AppendEventInput<TPayload>
  ): AppendEventResult<TPayload>;
  appendEvents<TPayload = unknown>(inputs: AppendEventInput<TPayload>[]): StoredEvent<TPayload>[];
  getEvent<TPayload = unknown>(eventId: string): StoredEvent<TPayload> | undefined;
  listSessionIds(): string[];
  listEvents(sessionId: string): StoredEvent[];
  listEventsByRange(sessionId: string, fromSequence: number, toSequence: number): StoredEvent[];
  listEventsByType(sessionId: string, type: string): StoredEvent[];
  listEventsByBatch(sessionId: string, batchId: string): StoredEvent[];
  listEventsByVisibility(sessionId: string, visibility: EventVisibility): StoredEvent[];
}
