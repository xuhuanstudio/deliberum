import {
  SEALED_BATCH_REVEALED_EVENT_TYPE,
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE
} from "@deliberum/core";
import { EventTraceSchema, JsonValueSchema } from "@deliberum/protocol";
import type { StoredEvent } from "@deliberum/storage";
import { ExtractionContextError } from "./errors";
import type {
  BuildExtractionContextInput,
  ExtractionContext,
  ExtractionContextContribution,
  ExtractionContextPublicEvent
} from "./types";

export function buildExtractionContext(
  input: BuildExtractionContextInput
): ExtractionContext {
  const sourceRound = resolveSourceRound(input);
  const events = input.eventStore
    .listEvents(input.run.sessionId)
    .sort((left, right) => left.sequence - right.sequence);
  const revealedEvent = findRevealedBatchEvent(events, sourceRound.revealedEventId);
  const contributions = findRevealedContributionEvents(events, revealedEvent);

  if (contributions.length === 0) {
    throw new ExtractionContextError("Extraction requires revealed contribution events.");
  }

  const publicEvents = events
    .filter((event) => event.visibility === "public")
    .map(toPublicEventMetadata);

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    topic: input.run.plan.topic,
    goals: [...input.run.plan.goals],
    constraints: [...input.run.plan.constraints],
    output: structuredClone(input.run.plan.output),
    participants: input.run.plan.participants.map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      displayName: participant.displayName,
      adapterId: participant.adapterId,
      profileId: participant.profileId,
      capabilities: participant.capabilities
    })),
    contributions: contributions.map(toContributionContext),
    publicEvents,
    metadata: {
      version: "1",
      sourceSealedDivergenceRoundId: sourceRound.roundId,
      batchId: revealedEvent.batchId!,
      revealedEventId: revealedEvent.id,
      allowedSourceEventIds: contributions.map((event) => event.id),
      eventRange:
        events.length === 0
          ? null
          : {
              fromSequence: events[0]!.sequence,
              toSequence: events[events.length - 1]!.sequence
            }
    }
  };
}

function resolveSourceRound(input: BuildExtractionContextInput) {
  const round = input.run.sealedDivergenceRound;
  const expectedRoundId = input.sealedDivergenceRoundId ?? round?.roundId;

  if (!round || !expectedRoundId || round.roundId !== expectedRoundId) {
    throw new ExtractionContextError("Extraction source sealed divergence round was not found.");
  }

  if (round.status !== "revealed" || !round.revealedEventId || !round.batchId) {
    throw new ExtractionContextError("Extraction source sealed divergence round is not revealed.");
  }

  return round;
}

function findRevealedBatchEvent(
  events: readonly StoredEvent[],
  revealedEventId: string | undefined
): StoredEvent {
  const revealedEvent = events.find(
    (event) =>
      event.id === revealedEventId &&
      event.type === SEALED_BATCH_REVEALED_EVENT_TYPE &&
      event.visibility === "public" &&
      Boolean(event.batchId)
  );

  if (!revealedEvent) {
    throw new ExtractionContextError("Extraction reveal event was not found.");
  }

  return revealedEvent;
}

function findRevealedContributionEvents(
  events: readonly StoredEvent[],
  revealedEvent: StoredEvent
): StoredEvent[] {
  const revealedContributionIds = new Set(revealedEvent.basedOnEventIds);

  return events.filter(
    (event) =>
      event.type === SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE &&
      event.visibility === "sealed" &&
      event.sessionId === revealedEvent.sessionId &&
      event.batchId === revealedEvent.batchId &&
      revealedContributionIds.has(event.id)
  );
}

function toPublicEventMetadata(event: StoredEvent): ExtractionContextPublicEvent {
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
    trace: EventTraceSchema.parse(event.trace)
  };
}

function toContributionContext(event: StoredEvent): ExtractionContextContribution {
  const metadata = toPublicEventMetadata(event);
  const payload = JsonValueSchema.parse(event.payload);

  return {
    ...metadata,
    participantId: event.authorId,
    payload: structuredClone(payload)
  };
}
