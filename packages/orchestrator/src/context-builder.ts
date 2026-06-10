import {
  SEALED_BATCH_REVEALED_EVENT_TYPE,
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE
} from "@deliberum/core";
import { EventTraceSchema, JsonValueSchema, type JsonValue } from "@deliberum/protocol";
import type { StoredEvent } from "@deliberum/storage";
import { ContextBuilderError } from "./errors";
import { ParticipantRegistry } from "./participant-registry";
import type {
  BuildParticipantContextInput,
  ParticipantContextMetadata,
  ParticipantDeliberationContext,
  RedactedEventPayload,
  VisibleContextEvent
} from "./types";

export function buildParticipantContext(
  input: BuildParticipantContextInput
): ParticipantDeliberationContext {
  const participant = new ParticipantRegistry(input.run.plan.participants).get(input.participantId);

  if (!participant) {
    throw new ContextBuilderError(`Participant was not found: ${input.participantId}`);
  }

  const events = input.eventStore
    .listEvents(input.run.sessionId)
    .sort((left, right) => left.sequence - right.sequence);
  const visibleEvents = events.map((event) => sanitizeEventForContext(event, events));

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    participant,
    topic: input.run.plan.topic,
    goals: [...input.run.plan.goals],
    constraints: [...input.run.plan.constraints],
    output: structuredClone(input.run.plan.output),
    resources: structuredClone(input.run.plan.resources ?? []),
    events: visibleEvents,
    metadata: createContextMetadata(events, visibleEvents)
  };
}

function sanitizeEventForContext(
  event: StoredEvent,
  allEvents: readonly StoredEvent[]
): VisibleContextEvent {
  const redactedPayload = getRedactedPayload(event, allEvents);
  const payload = redactedPayload ?? cloneJsonPayloadOrRedact(event.payload);

  return {
    id: event.id,
    type: event.type,
    sessionId: event.sessionId,
    sequence: event.sequence,
    authorId: event.authorId,
    createdAt: event.createdAt,
    recordedAt: event.recordedAt,
    visibility: event.visibility,
    ...(event.batchId ? { batchId: event.batchId } : {}),
    basedOnEventIds: [...event.basedOnEventIds],
    trace: EventTraceSchema.parse(event.trace),
    payload
  };
}

function getRedactedPayload(
  event: StoredEvent,
  allEvents: readonly StoredEvent[]
): RedactedEventPayload | undefined {
  if (event.type === SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE) {
    return canExposeSealedContribution(event, allEvents)
      ? undefined
      : {
          redacted: true,
          reason: "sealed_until_reveal"
        };
  }

  if (event.visibility !== "public") {
    return {
      redacted: true,
      reason: "event_visibility"
    };
  }

  return undefined;
}

function canExposeSealedContribution(
  event: StoredEvent,
  allEvents: readonly StoredEvent[]
): boolean {
  if (
    event.type !== SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE ||
    event.visibility !== "sealed" ||
    !event.batchId
  ) {
    return false;
  }

  return allEvents.some(
    (candidate) =>
      candidate.type === SEALED_BATCH_REVEALED_EVENT_TYPE &&
      candidate.visibility === "public" &&
      candidate.sessionId === event.sessionId &&
      candidate.batchId === event.batchId &&
      candidate.basedOnEventIds.includes(event.id)
  );
}

function cloneJsonPayloadOrRedact(payload: unknown): JsonValue | RedactedEventPayload {
  const parsed = JsonValueSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      redacted: true,
      reason: "event_visibility"
    };
  }

  return structuredClone(parsed.data);
}

function createContextMetadata(
  events: readonly StoredEvent[],
  visibleEvents: readonly VisibleContextEvent[]
): ParticipantContextMetadata {
  return {
    version: "1",
    eventRange:
      events.length === 0
        ? null
        : {
            fromSequence: events[0]!.sequence,
            toSequence: events[events.length - 1]!.sequence
          },
    eventIds: events.map((event) => event.id),
    redactedEventIds: visibleEvents
      .filter((event) => isRedactedPayload(event.payload))
      .map((event) => event.id)
  };
}

function isRedactedPayload(payload: JsonValue | RedactedEventPayload): payload is RedactedEventPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).redacted === true
  );
}
