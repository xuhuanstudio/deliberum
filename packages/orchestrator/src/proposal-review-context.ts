import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  PROPOSAL_CHALLENGED_EVENT_TYPE,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectExtractionProposalStates,
  projectQualityObligations,
  type ProjectionMetadata
} from "@deliberum/core";
import type { StoredEvent } from "@deliberum/storage";
import { ProposalReviewContextError } from "./errors";
import type {
  BuildProposalReviewContextInput,
  ExtractionRoundState,
  ProposalReviewContext
} from "./types";

export function buildProposalReviewContext(
  input: BuildProposalReviewContextInput
): ProposalReviewContext {
  const sourceRound = resolveSourceExtractionRound(input);
  const events = input.eventStore
    .listEvents(input.run.sessionId)
    .sort((left, right) => left.sequence - right.sequence);
  const proposalStatesProjection = projectExtractionProposalStates({
    events,
    sessionId: input.run.sessionId
  });
  const proposalStatesByEventId = new Map(
    proposalStatesProjection.proposalStates.map((state) => [state.proposalEventId, state])
  );
  const proposalStates = sourceRound.proposalEventIds.map((proposalEventId) => {
    const state = proposalStatesByEventId.get(proposalEventId);

    if (!state) {
      throw new ProposalReviewContextError(
        "Proposal review source extraction round references an unavailable proposal event."
      );
    }

    return structuredClone(state);
  });
  const acceptedObjects = projectAcceptedDeliberationObjects({
    events,
    sessionId: input.run.sessionId
  });
  const frontier = projectCandidateFrontier({
    events,
    sessionId: input.run.sessionId
  });
  const qualityObligations = projectQualityObligations({
    events,
    sessionId: input.run.sessionId
  });
  const safeProjection = createSafeProposalLifecycleProjectionMetadata(events);

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    topic: input.run.plan.topic,
    goals: [...input.run.plan.goals],
    constraints: [...input.run.plan.constraints],
    output: structuredClone(input.run.plan.output),
    sourceExtractionRoundId: sourceRound.roundId,
    proposalStates,
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
    metadata: {
      version: "1",
      sourceExtractionRoundId: sourceRound.roundId,
      proposalEventIds: [...sourceRound.proposalEventIds],
      eventRange: safeProjection.eventRange,
      eventIds: [...safeProjection.eventIds]
    },
    runMetadata: {
      status: input.run.status,
      participantIds: input.run.plan.participants.map((participant) => participant.id),
      extractionRoundStatus: sourceRound.status
    }
  };
}

function cloneProjectionMetadata(metadata: ProjectionMetadata): ProjectionMetadata {
  return {
    version: metadata.version,
    eventRange: metadata.eventRange ? { ...metadata.eventRange } : null,
    eventIds: [...metadata.eventIds]
  };
}

function resolveSourceExtractionRound(
  input: BuildProposalReviewContextInput
): ExtractionRoundState {
  const extractionRoundId =
    input.extractionRoundId ?? input.run.extractionRounds?.at(-1)?.roundId;
  const round = input.run.extractionRounds?.find(
    (candidateRound) => candidateRound.roundId === extractionRoundId
  );

  if (!round) {
    throw new ProposalReviewContextError("Proposal review source extraction round was not found.");
  }

  if (round.proposalEventIds.length === 0) {
    throw new ProposalReviewContextError(
      "Proposal review requires at least one extraction proposal event."
    );
  }

  return structuredClone(round);
}

function createSafeProposalLifecycleProjectionMetadata(
  events: readonly StoredEvent[]
): ProjectionMetadata {
  const lifecycleEvents = events.filter(
    (event) =>
      event.visibility === "public" &&
      (event.type === EXTRACTION_PROPOSED_EVENT_TYPE ||
        event.type === PROPOSAL_CHALLENGED_EVENT_TYPE ||
        event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)
  );

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
