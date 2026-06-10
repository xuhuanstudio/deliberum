import { FinalizationValidationError } from "./errors";
import {
  FinalAuditGeneratorResultSchema,
  FinalCandidateGeneratorResultSchema,
  type FinalAuditGeneratorResult,
  type FinalCandidateGeneratorResult,
  type FinalizationContext
} from "./types";

export function validateFinalCandidateGeneratorResult(
  result: unknown,
  context: FinalizationContext
): FinalCandidateGeneratorResult {
  const parsed = FinalCandidateGeneratorResultSchema.safeParse(result);

  if (!parsed.success) {
    throw new FinalizationValidationError(
      "Final candidate generator returned invalid proposal material."
    );
  }

  if (context.frontier.basis !== "accepted_active_candidates") {
    throw new FinalizationValidationError(
      "Final candidate proposal requires the accepted active candidate frontier."
    );
  }

  const allowedCandidateIds = new Set(
    context.frontier.candidates.map((candidate) => candidate.object.id)
  );
  const candidateIds = uniqueIds(parsed.data.candidateIds);

  for (const candidateId of candidateIds) {
    if (!allowedCandidateIds.has(candidateId)) {
      throw new FinalizationValidationError(
        "Final candidate proposal references a candidate outside the Candidate Frontier."
      );
    }
  }

  return {
    candidateIds,
    recommendation: parsed.data.recommendation,
    applicabilityConditions: [...(parsed.data.applicabilityConditions ?? [])],
    rationale: parsed.data.rationale,
    limitations: [...(parsed.data.limitations ?? [])]
  };
}

export function validateFinalAuditGeneratorResult(
  result: unknown,
  context: FinalizationContext
): Required<FinalAuditGeneratorResult> {
  const parsed = FinalAuditGeneratorResultSchema.safeParse(result);

  if (!parsed.success) {
    throw new FinalizationValidationError(
      "Final audit generator returned invalid audit material."
    );
  }

  const audit = {
    findings: [...(parsed.data.findings ?? [])],
    risks: [...(parsed.data.risks ?? [])],
    unresolvedObjectionIds: [...(parsed.data.unresolvedObjectionIds ?? [])],
    qualityObligationIds: [...(parsed.data.qualityObligationIds ?? [])],
    evidenceNeedIds: [...(parsed.data.evidenceNeedIds ?? [])],
    omissions: [...(parsed.data.omissions ?? [])],
    compressionProblems: [...(parsed.data.compressionProblems ?? [])],
    limitations: [...(parsed.data.limitations ?? [])],
    continuationSuggestions: [...(parsed.data.continuationSuggestions ?? [])]
  };

  assertKnownIds(
    audit.unresolvedObjectionIds,
    context.acceptedObjects.objections.map((objection) => objection.object.id),
    "Final audit references an unknown objection."
  );
  assertKnownIds(
    audit.qualityObligationIds,
    context.acceptedObjects.qualityObligations.map((obligation) => obligation.object.id),
    "Final audit references an unknown quality obligation."
  );
  assertKnownIds(
    audit.evidenceNeedIds,
    context.acceptedObjects.evidenceNeeds.map((evidenceNeed) => evidenceNeed.object.id),
    "Final audit references an unknown evidence need."
  );

  return audit;
}

function assertKnownIds(
  referencedIds: readonly string[],
  knownIds: readonly string[],
  message: string
): void {
  const known = new Set(knownIds);

  for (const referencedId of referencedIds) {
    if (!known.has(referencedId)) {
      throw new FinalizationValidationError(message);
    }
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
