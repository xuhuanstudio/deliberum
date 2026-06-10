import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  PROPOSAL_CHALLENGED_EVENT_TYPE,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectQualityObligations,
  type ProjectionMetadata
} from "@deliberum/core";
import type { StoredEvent } from "@deliberum/storage";
import { FinalizationContextError } from "./errors";
import type {
  BuildFinalizationContextInput,
  FinalizationContext,
  FinalizationContextPublicEvent,
  ProposalReviewRoundState
} from "./types";

export function buildFinalizationContext(
  input: BuildFinalizationContextInput
): FinalizationContext {
  const sourceRound = resolveSourceProposalReviewRound(input);
  const events = input.eventStore
    .listEvents(input.run.sessionId)
    .sort((left, right) => left.sequence - right.sequence);
  const safeLifecycleEvents = filterSafeProposalLifecycleEvents(events);
  const safeProjection = createProjectionMetadata(safeLifecycleEvents);
  const acceptedObjects = projectAcceptedDeliberationObjects({
    events: safeLifecycleEvents,
    sessionId: input.run.sessionId
  });
  const frontier = projectCandidateFrontier({
    events: safeLifecycleEvents,
    sessionId: input.run.sessionId
  });
  const qualityObligations = projectQualityObligations({
    events: safeLifecycleEvents,
    sessionId: input.run.sessionId
  });

  if (frontier.candidates.length === 0) {
    throw new FinalizationContextError(
      "Finalization requires at least one accepted active candidate."
    );
  }

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    topic: input.run.plan.topic,
    goals: [...input.run.plan.goals],
    constraints: [...input.run.plan.constraints],
    output: structuredClone(input.run.plan.output),
    acceptedObjects: {
      ...structuredClone(acceptedObjects),
      projection: cloneProjectionMetadata(safeProjection)
    },
    frontier: {
      ...structuredClone(frontier),
      projection: cloneProjectionMetadata(safeProjection)
    },
    qualityObligations: {
      ...structuredClone(qualityObligations),
      projection: cloneProjectionMetadata(safeProjection)
    },
    unresolvedObjectionIds: acceptedObjects.objections
      .filter((objection) =>
        ["open", "partially_answered", "accepted", "unresolved"].includes(
          objection.object.status
        )
      )
      .map((objection) => objection.object.id),
    evidenceNeedIds: acceptedObjects.evidenceNeeds.map((evidenceNeed) => evidenceNeed.object.id),
    publicEvents: events
      .filter((event) => event.visibility === "public")
      .map(toPublicEventMetadata),
    metadata: {
      version: "1",
      sourceProposalReviewRoundId: sourceRound?.roundId,
      acceptanceEventIds: sourceRound
        ? [...sourceRound.acceptanceEventIds]
        : safeLifecycleEvents
            .filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)
            .map((event) => event.id),
      eventRange: safeProjection.eventRange,
      eventIds: [...safeProjection.eventIds]
    },
    runMetadata: {
      status: input.run.status,
      participantIds: input.run.plan.participants.map((participant) => participant.id),
      proposalReviewRoundStatus: sourceRound?.status
    }
  };
}

function resolveSourceProposalReviewRound(
  input: BuildFinalizationContextInput
): ProposalReviewRoundState | undefined {
  const roundId =
    input.proposalReviewRoundId ?? input.run.proposalReviewRounds?.at(-1)?.roundId;

  if (!roundId) {
    return undefined;
  }

  const round = input.run.proposalReviewRounds?.find(
    (candidateRound) => candidateRound.roundId === roundId
  );

  if (!round) {
    throw new FinalizationContextError("Finalization source proposal review round was not found.");
  }

  return structuredClone(round);
}

function filterSafeProposalLifecycleEvents(events: readonly StoredEvent[]): StoredEvent[] {
  return events.filter(
    (event) =>
      event.visibility === "public" &&
      (event.type === EXTRACTION_PROPOSED_EVENT_TYPE ||
        event.type === PROPOSAL_CHALLENGED_EVENT_TYPE ||
        event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)
  );
}

function toPublicEventMetadata(event: StoredEvent): FinalizationContextPublicEvent {
  return {
    id: event.id,
    type: event.type,
    sessionId: event.sessionId,
    sequence: event.sequence,
    authorId: event.authorId,
    createdAt: event.createdAt,
    recordedAt: event.recordedAt,
    visibility: event.visibility,
    basedOnEventIds: [...event.basedOnEventIds],
    trace: {
      ...event.trace,
      resourceDeliveryIds: event.trace.resourceDeliveryIds
        ? [...event.trace.resourceDeliveryIds]
        : undefined
    }
  };
}

function createProjectionMetadata(lifecycleEvents: readonly StoredEvent[]): ProjectionMetadata {
  return {
    version: "1",
    eventRange:
      lifecycleEvents.length === 0
        ? null
        : {
            fromSequence: lifecycleEvents[0]!.sequence,
            toSequence: lifecycleEvents[lifecycleEvents.length - 1]!.sequence
          },
    eventIds: lifecycleEvents.map((event) => event.id)
  };
}

function cloneProjectionMetadata(metadata: ProjectionMetadata): ProjectionMetadata {
  return {
    version: metadata.version,
    eventRange: metadata.eventRange ? { ...metadata.eventRange } : null,
    eventIds: [...metadata.eventIds]
  };
}
