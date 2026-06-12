import { ExtractionGeneratorValidationError } from "./errors";
import {
  ExtractionGeneratorResultSchema,
  type ExtractionContext,
  type ExtractionGeneratorDraft,
  type ExtractionGeneratorResult
} from "./types";

type DraftObject = {
  id: string;
  sourceEventIds: string[];
};

export function validateExtractionGeneratorResult(
  result: unknown,
  context: ExtractionContext
): ExtractionGeneratorDraft {
  return validateExtractionGeneratorResultForAllowedSourceEventIds(
    result,
    context.metadata.allowedSourceEventIds
  );
}

export function validateExtractionGeneratorResultForAllowedSourceEventIds(
  result: unknown,
  allowedSourceEventIds: readonly string[]
): ExtractionGeneratorDraft {
  const parsed = ExtractionGeneratorResultSchema.safeParse(result);

  if (!parsed.success) {
    throw new ExtractionGeneratorValidationError("Extraction generator result is invalid.");
  }

  const draft = normalizeDraft(parsed.data);
  const proposedObjectCount =
    draft.candidates.length +
    draft.claims.length +
    draft.objections.length +
    draft.evidenceNeeds.length +
    draft.qualityObligations.length;

  if (proposedObjectCount === 0) {
    throw new ExtractionGeneratorValidationError(
      "Extraction generator result must contain at least one proposed object."
    );
  }

  assertUniqueObjectIds([
    ...draft.candidates,
    ...draft.claims,
    ...draft.objections,
    ...draft.evidenceNeeds,
    ...draft.qualityObligations
  ]);
  assertSourceTraceability(draft, allowedSourceEventIds);
  assertDraftReferences(draft);

  return draft;
}

function normalizeDraft(result: ExtractionGeneratorResult): ExtractionGeneratorDraft {
  return {
    candidates: result.candidates ?? [],
    claims: result.claims ?? [],
    objections: result.objections ?? [],
    evidenceNeeds: result.evidenceNeeds ?? [],
    qualityObligations: result.qualityObligations ?? [],
    rationale: result.rationale
  };
}

function assertUniqueObjectIds(objects: readonly DraftObject[]): void {
  const seen = new Set<string>();

  for (const object of objects) {
    if (seen.has(object.id)) {
      throw new ExtractionGeneratorValidationError(
        "Extraction generator result contains duplicate object ids."
      );
    }

    seen.add(object.id);
  }
}

function assertSourceTraceability(
  draft: ExtractionGeneratorDraft,
  allowedSourceEventIds: readonly string[]
): void {
  const allowedSourceEventIdSet = new Set(allowedSourceEventIds);
  const objects: DraftObject[] = [
    ...draft.candidates,
    ...draft.claims,
    ...draft.objections,
    ...draft.evidenceNeeds,
    ...draft.qualityObligations
  ];

  for (const object of objects) {
    for (const sourceEventId of object.sourceEventIds) {
      if (!allowedSourceEventIdSet.has(sourceEventId)) {
        throw new ExtractionGeneratorValidationError(
          "Extraction generator result references a disallowed source event."
        );
      }
    }
  }
}

function assertDraftReferences(draft: ExtractionGeneratorDraft): void {
  const candidateIds = new Set(draft.candidates.map((candidate) => candidate.id));
  const claimIds = new Set(draft.claims.map((claim) => claim.id));
  const objectionIds = new Set(draft.objections.map((objection) => objection.id));
  const qualityObligationIds = new Set(
    draft.qualityObligations.map((qualityObligation) => qualityObligation.id)
  );
  const candidateOrClaimIds = new Set([...candidateIds, ...claimIds]);

  for (const candidate of draft.candidates) {
    assertKnownReferences(candidate.supportedBy, claimIds);
    assertKnownReferences(candidate.attackedBy, objectionIds);
    assertKnownReferences(candidate.qualityObligationIds, qualityObligationIds);
  }

  for (const claim of draft.claims) {
    assertKnownReferences(claim.supports ?? [], candidateOrClaimIds);
    assertKnownReferences(claim.dependsOn ?? [], claimIds);
    assertKnownReferences(claim.challengedBy ?? [], objectionIds);
  }

  for (const objection of draft.objections) {
    assertKnownReferences([objection.targetId], candidateOrClaimIds);
    assertKnownReferences(objection.responses ?? [], claimIds);
  }

  for (const evidenceNeed of draft.evidenceNeeds) {
    assertKnownReferences([evidenceNeed.targetClaimId], claimIds);
  }

  for (const qualityObligation of draft.qualityObligations) {
    assertKnownReferences(
      qualityObligation.targetCandidateId ? [qualityObligation.targetCandidateId] : [],
      candidateIds
    );
    assertKnownReferences(qualityObligation.supportingRefIds, claimIds);
    assertKnownReferences(qualityObligation.unresolvedObjectionIds, objectionIds);
  }
}

function assertKnownReferences(
  references: readonly string[],
  allowedIds: ReadonlySet<string>
): void {
  for (const reference of references) {
    if (!allowedIds.has(reference)) {
      throw new ExtractionGeneratorValidationError(
        "Extraction generator result contains an untraceable object reference."
      );
    }
  }
}
