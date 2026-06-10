import { ProposalReviewValidationError } from "./errors";
import {
  ProposalReviewGeneratorResultSchema,
  type ProposalReviewChallengeDraft,
  type ProposalReviewContext,
  type ProposalReviewGeneratorResult
} from "./types";

export type ValidatedProposalReviewResult = {
  challenges: ProposalReviewChallengeDraft[];
  notes: string[];
};

export function validateProposalReviewGeneratorResult(
  result: unknown,
  context: ProposalReviewContext
): ValidatedProposalReviewResult {
  const parsed = ProposalReviewGeneratorResultSchema.safeParse(result);

  if (!parsed.success) {
    throw new ProposalReviewValidationError(
      "Proposal review generator returned invalid review material."
    );
  }

  const allowedProposalEventIds = new Set(context.metadata.proposalEventIds);
  const seenTargets = new Set<string>();
  const challenges: ProposalReviewChallengeDraft[] = [];

  for (const challenge of parsed.data.challenges ?? []) {
    if (!allowedProposalEventIds.has(challenge.targetProposalEventId)) {
      throw new ProposalReviewValidationError(
        "Proposal review challenge target is not in the source extraction round."
      );
    }

    if (seenTargets.has(challenge.targetProposalEventId)) {
      continue;
    }

    seenTargets.add(challenge.targetProposalEventId);
    challenges.push({
      targetProposalEventId: challenge.targetProposalEventId,
      reason: challenge.reason
    });
  }

  return {
    challenges,
    notes: [...((parsed.data as ProposalReviewGeneratorResult).notes ?? [])]
  };
}
