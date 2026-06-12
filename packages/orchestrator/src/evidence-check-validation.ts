import { EvidenceCheckValidationError } from "./errors";
import {
  EvidenceCheckGeneratorResultSchema,
  type EvidenceCheckContext,
  type EvidenceCheckGeneratorResult
} from "./types";

export function validateEvidenceCheckGeneratorResult(
  result: unknown,
  context: EvidenceCheckContext
): EvidenceCheckGeneratorResult {
  const parsed = EvidenceCheckGeneratorResultSchema.safeParse(result);

  if (!parsed.success) {
    throw new EvidenceCheckValidationError(
      "Evidence check generator returned invalid evidence material."
    );
  }

  if (parsed.data.results.length === 0) {
    throw new EvidenceCheckValidationError(
      "Evidence check generator result must contain at least one evidence result."
    );
  }

  const targetEvidenceNeedIds = new Set(context.metadata.targetEvidenceNeedIds);
  const seenEvidenceNeedIds = new Set<string>();

  for (const evidenceResult of parsed.data.results) {
    if (!targetEvidenceNeedIds.has(evidenceResult.evidenceNeedId)) {
      throw new EvidenceCheckValidationError(
        "Evidence check generator result references an unknown target evidence need."
      );
    }

    if (seenEvidenceNeedIds.has(evidenceResult.evidenceNeedId)) {
      throw new EvidenceCheckValidationError(
        "Evidence check generator result contains duplicate evidence need results."
      );
    }

    seenEvidenceNeedIds.add(evidenceResult.evidenceNeedId);
  }

  return {
    results: parsed.data.results.map((evidenceResult) => ({
      evidenceNeedId: evidenceResult.evidenceNeedId,
      source: evidenceResult.source,
      summary: evidenceResult.summary,
      resourceIds: [...(evidenceResult.resourceIds ?? [])],
      limitations: [...(evidenceResult.limitations ?? [])],
      challengedBy: [...(evidenceResult.challengedBy ?? [])]
    })),
    rationale: parsed.data.rationale
  };
}
