import {
  ExtractionProposalSchema,
  ProposalAcceptancePayloadSchema,
  ProposalChallengePayloadSchema,
  type Claim,
  type EvidenceNeed,
  type ExtractionProposal,
  type Objection,
  type QualityObligation
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  PROPOSAL_CHALLENGED_EVENT_TYPE
} from "./extraction-proposals";
import { InvalidProjectionInputError } from "./errors";

export type ProjectionInput =
  | {
      eventStore: EventStore;
      sessionId: string;
    }
  | {
      events: readonly StoredEvent[];
      sessionId?: string;
    };

export type ExtractionProposalState = {
  proposalEventId: string;
  proposalId: string;
  sessionId: string;
  sequence: number;
  sourceEventIds: string[];
  proposal: ExtractionProposal;
  challengeEventIds: string[];
  acceptanceEventIds: string[];
  isChallenged: boolean;
  isAcceptedForNow: boolean;
};

export type DerivedCandidate = {
  object: ExtractionProposal["candidates"][number];
  proposalEventId: string;
  proposalId: string;
  acceptedByEventIds: string[];
  sourceEventIds: string[];
};

export type DerivedClaim = {
  object: Claim;
  proposalEventId: string;
  proposalId: string;
  acceptedByEventIds: string[];
  sourceEventIds: string[];
};

export type DerivedObjection = {
  object: Objection;
  proposalEventId: string;
  proposalId: string;
  acceptedByEventIds: string[];
  sourceEventIds: string[];
};

export type DerivedEvidenceNeed = {
  object: EvidenceNeed;
  proposalEventId: string;
  proposalId: string;
  acceptedByEventIds: string[];
  sourceEventIds: string[];
};

export type DerivedQualityObligation = {
  object: QualityObligation;
  proposalEventId: string;
  proposalId: string;
  acceptedByEventIds: string[];
  sourceEventIds: string[];
};

export type AcceptedDeliberationObjectsProjection = {
  candidates: DerivedCandidate[];
  claims: DerivedClaim[];
  objections: DerivedObjection[];
  evidenceNeeds: DerivedEvidenceNeed[];
  qualityObligations: DerivedQualityObligation[];
};

export type CandidateFrontierProjection = {
  basis: "accepted_active_candidates";
  candidates: DerivedCandidate[];
};

export type QualityObligationsProjection = {
  qualityObligations: DerivedQualityObligation[];
};

export function projectExtractionProposalStates(
  input: ProjectionInput
): ExtractionProposalState[] {
  const events = resolveProjectionEvents(input);
  const statesByEventId = new Map<string, MutableExtractionProposalState>();

  for (const event of events) {
    if (event.type === EXTRACTION_PROPOSED_EVENT_TYPE) {
      const parsedProposal = ExtractionProposalSchema.safeParse(event.payload);

      if (!parsedProposal.success) {
        continue;
      }

      statesByEventId.set(event.id, {
        proposalEventId: event.id,
        proposalId: parsedProposal.data.id,
        sessionId: event.sessionId,
        sequence: event.sequence,
        sourceEventIds: [...parsedProposal.data.sourceEventIds],
        proposal: clonePlain(parsedProposal.data),
        challengeEventIds: [],
        acceptanceEventIds: [],
        isChallenged: false,
        isAcceptedForNow: false
      });

      continue;
    }

    if (event.type === PROPOSAL_CHALLENGED_EVENT_TYPE) {
      const parsedChallenge = ProposalChallengePayloadSchema.safeParse(event.payload);

      if (!parsedChallenge.success) {
        continue;
      }

      const targetState = statesByEventId.get(parsedChallenge.data.targetProposalEventId);
      if (!canLifecycleEventAffectProposal(event, targetState)) {
        continue;
      }

      targetState.challengeEventIds.push(event.id);
      targetState.isChallenged = true;
      continue;
    }

    if (event.type === PROPOSAL_ACCEPTED_EVENT_TYPE) {
      const parsedAcceptance = ProposalAcceptancePayloadSchema.safeParse(event.payload);

      if (!parsedAcceptance.success) {
        continue;
      }

      const targetState = statesByEventId.get(parsedAcceptance.data.targetProposalEventId);
      if (!canLifecycleEventAffectProposal(event, targetState)) {
        continue;
      }

      targetState.acceptanceEventIds.push(event.id);
      targetState.isAcceptedForNow = true;
    }
  }

  return [...statesByEventId.values()].map((state) => ({
    ...state,
    sourceEventIds: [...state.sourceEventIds],
    proposal: clonePlain(state.proposal),
    challengeEventIds: [...state.challengeEventIds],
    acceptanceEventIds: [...state.acceptanceEventIds]
  }));
}

export function projectAcceptedDeliberationObjects(
  input: ProjectionInput
): AcceptedDeliberationObjectsProjection {
  const acceptedStates = projectExtractionProposalStates(input).filter(
    (state) => state.isAcceptedForNow
  );
  const result: AcceptedDeliberationObjectsProjection = {
    candidates: [],
    claims: [],
    objections: [],
    evidenceNeeds: [],
    qualityObligations: []
  };

  for (const state of acceptedStates) {
    for (const candidate of state.proposal.candidates) {
      result.candidates.push(createDerivedObject(candidate, state));
    }

    for (const claim of state.proposal.claims) {
      result.claims.push(createDerivedObject(claim, state));
    }

    for (const objection of state.proposal.objections) {
      result.objections.push(createDerivedObject(objection, state));
    }

    for (const evidenceNeed of state.proposal.evidenceNeeds) {
      result.evidenceNeeds.push(createDerivedObject(evidenceNeed, state));
    }

    for (const qualityObligation of state.proposal.qualityObligations) {
      result.qualityObligations.push(createDerivedObject(qualityObligation, state));
    }
  }

  return result;
}

export function projectCandidateFrontier(input: ProjectionInput): CandidateFrontierProjection {
  const acceptedObjects = projectAcceptedDeliberationObjects(input);

  return {
    basis: "accepted_active_candidates",
    candidates: acceptedObjects.candidates.filter(
      (candidate) => candidate.object.status === "active"
    )
  };
}

export function projectQualityObligations(input: ProjectionInput): QualityObligationsProjection {
  return {
    qualityObligations: projectAcceptedDeliberationObjects(input).qualityObligations
  };
}

type MutableExtractionProposalState = ExtractionProposalState;

function resolveProjectionEvents(input: ProjectionInput): StoredEvent[] {
  const events =
    "eventStore" in input ? input.eventStore.listEvents(input.sessionId) : [...input.events];
  const sessionId = "sessionId" in input ? input.sessionId : undefined;
  const filteredEvents = sessionId
    ? events.filter((event) => event.sessionId === sessionId)
    : rejectMixedSessionEvents(events);

  return [...filteredEvents].sort((left, right) => left.sequence - right.sequence);
}

function rejectMixedSessionEvents(events: readonly StoredEvent[]): StoredEvent[] {
  const sessionIds = new Set(events.map((event) => event.sessionId));

  if (sessionIds.size > 1) {
    throw new InvalidProjectionInputError(
      "Projection event arrays must include one session or an explicit sessionId."
    );
  }

  return [...events];
}

function canLifecycleEventAffectProposal(
  lifecycleEvent: StoredEvent,
  targetState: MutableExtractionProposalState | undefined
): targetState is MutableExtractionProposalState {
  return (
    Boolean(targetState) &&
    targetState?.sessionId === lifecycleEvent.sessionId &&
    targetState.sequence < lifecycleEvent.sequence
  );
}

function createDerivedObject<TObject extends { sourceEventIds: string[] }>(
  object: TObject,
  state: ExtractionProposalState
) {
  return {
    object: clonePlain(object),
    proposalEventId: state.proposalEventId,
    proposalId: state.proposalId,
    acceptedByEventIds: [...state.acceptanceEventIds],
    sourceEventIds: [...object.sourceEventIds]
  };
}

function clonePlain<TValue>(value: TValue): TValue {
  return structuredClone(value);
}
