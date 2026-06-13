import {
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectProcessProposalStates,
  type ProcessProposalState
} from "@deliberum/core";
import {
  ProcessProposalSchema,
  type ProcessProposal
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import type { DeliberationRunRecord } from "./types";

export const ADAPTIVE_PRIMITIVE_SUGGESTION_VERSION = "1" as const;

export type AdaptivePrimitiveSchedulerInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  maxProposals?: number;
};

export type AdaptivePrimitiveSchedulerResult = {
  runId: string;
  sessionId: string;
  proposals: ProcessProposal[];
  observations: string[];
  metadata: {
    version: typeof ADAPTIVE_PRIMITIVE_SUGGESTION_VERSION;
    eventRange: {
      fromSequence: number;
      toSequence: number;
    } | null;
    eventIds: string[];
  };
};

type ProposalDraft = Omit<ProcessProposal, "id" | "status">;

const DEFAULT_MAX_PROPOSALS = 5;
const UNRESOLVED_OBJECTION_STATUSES = new Set([
  "open",
  "partially_answered",
  "accepted",
  "unresolved"
]);
const UNRESOLVED_QUALITY_OBLIGATION_STATUSES = new Set([
  "unanswered",
  "partially_answered",
  "challenged",
  "unresolved"
]);
const OPEN_EVIDENCE_NEED_STATUSES = new Set(["open", "in_progress", "unresolved"]);

export function suggestAdaptivePrimitiveProposals(
  input: AdaptivePrimitiveSchedulerInput
): AdaptivePrimitiveSchedulerResult {
  const events = input.eventStore
    .listEvents(input.run.sessionId)
    .sort((left, right) => left.sequence - right.sequence);
  const acceptedObjects = projectAcceptedDeliberationObjects({
    events,
    sessionId: input.run.sessionId
  });
  const frontier = projectCandidateFrontier({
    events,
    sessionId: input.run.sessionId
  });
  const processProposalStates = projectProcessProposalStates({
    events,
    sessionId: input.run.sessionId
  }).proposalStates;
  const proposals: ProcessProposal[] = [];
  const observations: string[] = [];
  const maxProposals = normalizeMaxProposals(input.maxProposals);

  const addProposal = (draft: ProposalDraft): void => {
    if (proposals.length >= maxProposals) {
      return;
    }

    proposals.push(createProcessProposal(input.run, draft));
  };

  if (!input.run.sealedDivergenceRound) {
    addProposal({
      primitive: "sealed_divergence",
      targetIds: [input.run.topicContractEventId],
      expectedQualityGain: "Collect independent initial positions before convergence pressure appears.",
      riskIfSkipped: "The run may collapse into a single framing without preserved divergence.",
      requestedBudget: {
        maxProviderCalls: input.run.plan.participants.length,
        maxEvents: input.run.plan.participants.length + 2
      }
    });
    observations.push("No sealed divergence round is recorded for this run.");

    return createResult(input.run, events, proposals, observations);
  }

  if (input.run.sealedDivergenceRound.status === "failed") {
    addProposal({
      primitive: "sealed_divergence",
      targetIds: [input.run.sealedDivergenceRound.roundId],
      expectedQualityGain: "Retry or replace the failed independent divergence step.",
      riskIfSkipped: "The run cannot establish independently generated starting material.",
      requestedBudget: {
        maxEvents: input.run.plan.participants.length + 2
      }
    });
    observations.push("The sealed divergence round is failed.");

    return createResult(input.run, events, proposals, observations);
  }

  if (input.run.sealedDivergenceRound.status !== "revealed") {
    observations.push("The sealed divergence round is not revealed yet.");

    return createResult(input.run, events, proposals, observations);
  }

  const latestExtractionRound = input.run.extractionRounds?.at(-1);
  if (!latestExtractionRound || latestExtractionRound.proposalEventIds.length === 0) {
    const contributionEventIds = findRevealedContributionEventIds(events, input.run.currentBatchId);
    addProposal({
      primitive: "relation_mapping",
      targetIds:
        contributionEventIds.length > 0
          ? contributionEventIds
          : [input.run.sealedDivergenceRound.revealedEventId ?? input.run.sealedDivergenceRound.roundId],
      expectedQualityGain: "Convert revealed contributions into traceable candidates, claims, objections, and quality obligations.",
      riskIfSkipped: "Raw contributions remain unstructured and later review cannot trace deliberation objects.",
      requestedBudget: {
        maxEvents: 2,
        maxProviderCalls: 1
      }
    });
    observations.push("No extraction proposal round with proposal events is available.");

    return createResult(input.run, events, proposals, observations);
  }

  const latestProposalReviewRound = input.run.proposalReviewRounds?.at(-1);
  if (!latestProposalReviewRound || latestProposalReviewRound.status !== "completed") {
    addProposal({
      primitive: "red_team",
      targetIds: [...latestExtractionRound.proposalEventIds],
      expectedQualityGain: "Challenge extraction proposal material before it changes derived deliberation state.",
      riskIfSkipped: "Weak candidates, unsupported claims, or missing objections may be accepted without adversarial review.",
      requestedBudget: {
        maxEvents: latestExtractionRound.proposalEventIds.length + 1,
        maxProviderCalls: 1
      }
    });
    observations.push("Extraction proposal material has not completed proposal review.");
  }

  const openEvidenceNeedIds = acceptedObjects.evidenceNeeds
    .filter((evidenceNeed) => OPEN_EVIDENCE_NEED_STATUSES.has(evidenceNeed.object.status))
    .map((evidenceNeed) => evidenceNeed.object.id);
  if (openEvidenceNeedIds.length > 0) {
    addProposal({
      primitive: "evidence_check",
      targetIds: openEvidenceNeedIds,
      expectedQualityGain: "Route unresolved evidence needs to verifiable checks instead of relying on discussion alone.",
      riskIfSkipped: "The outcome may present unresolved or unverified claims as sufficiently supported.",
      requestedBudget: {
        maxEvents: openEvidenceNeedIds.length
      }
    });
    observations.push("Accepted proposal material contains open evidence needs.");
  }

  const activeCandidateIds = new Set(
    frontier.candidates.map((candidate) => candidate.object.id)
  );
  const unresolvedObjectionTargetIds = unique(
    acceptedObjects.objections
      .filter(
        (objection) =>
          activeCandidateIds.has(objection.object.targetId) &&
          UNRESOLVED_OBJECTION_STATUSES.has(objection.object.status)
      )
      .map((objection) => objection.object.targetId)
  );
  const unresolvedQualityTargetIds = unique(
    acceptedObjects.qualityObligations
      .filter(
        (obligation) =>
          Boolean(obligation.object.targetCandidateId) &&
          activeCandidateIds.has(obligation.object.targetCandidateId!) &&
          UNRESOLVED_QUALITY_OBLIGATION_STATUSES.has(obligation.object.status)
      )
      .map((obligation) => obligation.object.targetCandidateId!)
  );
  const repairTargetIds = unique([...unresolvedObjectionTargetIds, ...unresolvedQualityTargetIds]);
  if (repairTargetIds.length > 0) {
    addProposal({
      primitive: "candidate_repair",
      targetIds: repairTargetIds,
      expectedQualityGain: "Repair candidates against unresolved objections or unanswered quality obligations.",
      riskIfSkipped: "Known candidate weaknesses remain unresolved before finalization pressure increases.",
      requestedBudget: {
        maxEvents: repairTargetIds.length + 1,
        maxProviderCalls: 1
      }
    });
    observations.push("Accepted proposal material contains unresolved objections or quality obligations.");
  }

  const latestFinalizationRound = input.run.finalizationRounds?.at(-1);
  if (latestFinalizationRound?.finalCandidateProposalEventId) {
    if (latestFinalizationRound.auditEventIds.length === 0) {
      addProposal({
        primitive: "final_audit",
        targetIds: [latestFinalizationRound.finalCandidateProposalEventId],
        expectedQualityGain: "Audit final candidate proposal material before outcome compilation.",
        riskIfSkipped: "The compiled outcome may omit unresolved limitations or audit findings.",
        requestedBudget: {
          maxEvents: 1,
          maxProviderCalls: 1
        }
      });
      observations.push("A final candidate proposal exists without recorded final audit events.");
    } else if (
      !hasActiveProcessProposalTarget(
        processProposalStates,
        "omission_audit",
        latestFinalizationRound.finalCandidateProposalEventId
      )
    ) {
      addProposal({
        primitive: "omission_audit",
        targetIds: [latestFinalizationRound.finalCandidateProposalEventId],
        expectedQualityGain: "Check whether audited final candidate material dropped important insights before outcome compilation.",
        riskIfSkipped: "The compiled outcome may preserve a coherent summary while omitting relevant accepted material or unresolved limitations.",
        requestedBudget: {
          maxEvents: 1,
          maxProviderCalls: 1
        }
      });
      observations.push("Audited final candidate material is available without an active omission audit proposal.");
    }
  } else if (
    frontier.candidates.length > 0 &&
    openEvidenceNeedIds.length === 0 &&
    repairTargetIds.length === 0
  ) {
    addProposal({
      primitive: "final_contest",
      targetIds: frontier.candidates.map((candidate) => candidate.object.id),
      expectedQualityGain: "Generate final candidate proposal material from the accepted active candidate frontier.",
      riskIfSkipped: "The run may stop before final candidate alternatives are explicitly proposed and auditable.",
      requestedBudget: {
        maxEvents: 2,
        maxProviderCalls: 1
      }
    });
    observations.push("Accepted active candidates are available without open evidence or repair targets.");
  }

  if (proposals.length === 0) {
    observations.push("No explicit adaptive primitive gap was detected.");
  }

  return createResult(input.run, events, proposals, observations);
}

function createProcessProposal(run: DeliberationRunRecord, draft: ProposalDraft): ProcessProposal {
  const proposal = {
    ...draft,
    id: createStableProposalId(run, draft),
    status: "proposed"
  } satisfies ProcessProposal;

  return ProcessProposalSchema.parse(proposal);
}

function createStableProposalId(run: DeliberationRunRecord, draft: ProposalDraft): string {
  return [
    "adaptive",
    run.id,
    draft.primitive,
    stableHash([draft.targetIds, draft.expectedQualityGain, draft.riskIfSkipped])
  ].join(":");
}

function createResult(
  run: DeliberationRunRecord,
  events: readonly StoredEvent[],
  proposals: readonly ProcessProposal[],
  observations: readonly string[]
): AdaptivePrimitiveSchedulerResult {
  return {
    runId: run.id,
    sessionId: run.sessionId,
    proposals: proposals.map((proposal) => structuredClone(proposal)),
    observations: [...observations],
    metadata: {
      version: ADAPTIVE_PRIMITIVE_SUGGESTION_VERSION,
      eventRange:
        events.length === 0
          ? null
          : {
              fromSequence: events[0]!.sequence,
              toSequence: events[events.length - 1]!.sequence
            },
      eventIds: events.map((event) => event.id)
    }
  };
}

function findRevealedContributionEventIds(
  events: readonly StoredEvent[],
  batchId: string | undefined
): string[] {
  return events
    .filter(
      (event) =>
        event.type === SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE &&
        event.visibility === "sealed" &&
        (!batchId || event.batchId === batchId)
    )
    .map((event) => event.id);
}

function normalizeMaxProposals(maxProposals: number | undefined): number {
  if (maxProposals === undefined) {
    return DEFAULT_MAX_PROPOSALS;
  }

  if (!Number.isInteger(maxProposals) || maxProposals < 1) {
    return DEFAULT_MAX_PROPOSALS;
  }

  return maxProposals;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function hasActiveProcessProposalTarget(
  proposalStates: readonly ProcessProposalState[],
  primitive: string,
  targetId: string
): boolean {
  return proposalStates.some(
    (state) =>
      state.latestStatus !== "rejected" &&
      state.proposal.primitive === primitive &&
      state.proposal.targetIds.length === 1 &&
      state.proposal.targetIds[0] === targetId
  );
}

function stableHash(input: unknown): string {
  const text = stableStringify(input);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
