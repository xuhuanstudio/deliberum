import {
  acceptProposal,
  challengeProposal,
  projectExtractionProposalStates
} from "@deliberum/core";
import {
  ProviderSecretResolutionError,
  ProposalReviewContextError,
  ProposalReviewValidationError,
  RunProposalReviewRoundError,
  RunStoreNotFoundError
} from "./errors";
import { buildProposalReviewContext } from "./proposal-review-context";
import { validateProposalReviewGeneratorResult } from "./proposal-review-validation";
import { resolveProviderRuntimeConfig } from "./provider-secret-resolver";
import {
  ExtractionAcceptancePolicySchema,
  ProposalReviewRunErrorCategorySchema,
  RunSafeProviderResponseShapeSchema,
  type DeliberationRunRecord,
  type ExtractionAcceptancePolicy,
  type ProposalAcceptanceRoundResult,
  type ProposalReviewContext,
  type ProposalReviewRunErrorCategory,
  type ProposalReviewRoundState,
  type ProposalReviewerRoundResult,
  type ProposalReviewerState,
  type RoundExecutionClaim,
  type RunProposalReviewRoundInput,
  type RunProposalReviewRoundOptions,
  type RunProposalReviewRoundResult,
  type RunSafeDiagnostics
} from "./types";

const DEFAULT_PROPOSAL_REVIEW_ROUND_ID = "initial" as const;
const DEFAULT_EXECUTION_CLAIM_TTL_MS = 5 * 60 * 1000;

type ProposalReviewRoundClaimAcquisition =
  | {
      status: "acquired";
      ownerId: string;
      run: DeliberationRunRecord;
    }
  | {
      status: "already_running";
      run: DeliberationRunRecord;
      round: ProposalReviewRoundState;
    }
  | {
      status: "already_completed";
      run: DeliberationRunRecord;
      round: ProposalReviewRoundState;
    };

export async function runProposalReviewRound(
  input: RunProposalReviewRoundInput,
  options: RunProposalReviewRoundOptions
): Promise<RunProposalReviewRoundResult> {
  const existingRun = options.runStore.getRun(input.runId);
  if (!existingRun) {
    throw new RunStoreNotFoundError(input.runId);
  }

  const roundId = input.roundId ?? DEFAULT_PROPOSAL_REVIEW_ROUND_ID;
  const sourceExtractionRoundId = resolveSourceExtractionRoundId(input, existingRun);
  const reviewerIds = resolveReviewerIds(input, options);
  const acceptancePolicy = parseAcceptancePolicy(input.acceptancePolicy);
  const acquisition = acquireProposalReviewRoundExecutionClaim(
    input.runId,
    roundId,
    sourceExtractionRoundId,
    reviewerIds,
    options
  );

  if (acquisition.status === "already_running") {
    return createResultFromProposalReviewRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_running"
    );
  }

  if (acquisition.status === "already_completed") {
    return createResultFromProposalReviewRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_completed"
    );
  }

  try {
    const result = await executeClaimedProposalReviewRound(
      acquisition.run,
      input,
      options,
      roundId,
      sourceExtractionRoundId,
      reviewerIds,
      acceptancePolicy,
      acquisition.ownerId
    );
    const releasedRun = releaseProposalReviewRoundExecutionClaim(
      options,
      input.runId,
      roundId,
      acquisition.ownerId
    );

    return {
      ...result,
      run: releasedRun
    };
  } catch (error) {
    releaseProposalReviewRoundExecutionClaim(options, input.runId, roundId, acquisition.ownerId);
    throw error;
  }
}

async function executeClaimedProposalReviewRound(
  run: DeliberationRunRecord,
  input: RunProposalReviewRoundInput,
  options: RunProposalReviewRoundOptions,
  roundId: string,
  sourceExtractionRoundId: string,
  reviewerIds: readonly string[],
  acceptancePolicy: ExtractionAcceptancePolicy,
  claimOwnerId: string
): Promise<RunProposalReviewRoundResult> {
  let workingRun = run;
  let context: ProposalReviewContext;

  try {
    assertProposalReviewRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);
    context = buildProposalReviewContext({
      run: workingRun,
      eventStore: options.eventStore,
      extractionRoundId: sourceExtractionRoundId
    });
  } catch (error) {
    markProposalReviewRoundFailed(
      workingRun,
      options,
      roundId,
      sourceExtractionRoundId,
      reviewerIds,
      [],
      "proposal_review_context_unavailable",
      claimOwnerId
    );

    if (error instanceof RunProposalReviewRoundError) {
      throw error;
    }

    throw new RunProposalReviewRoundError(
      "proposal_review_context_unavailable",
      "Proposal review context could not be built from extraction proposals."
    );
  }

  const existingRound = findProposalReviewRound(workingRun, roundId);
  const reviewerStates = createReviewerStates(reviewerIds, existingRound);
  const reviewersToExecute = getReviewersToExecute(
    reviewerStates,
    Boolean(input.retryFailedReviewers)
  );
  const startedAt = getClock(options)();

  workingRun = setProposalReviewRoundState(workingRun, options, {
    roundId,
    sourceExtractionRoundId,
    status: "running",
    reviewerStates: markReviewersRunning(reviewerStates, reviewersToExecute, startedAt),
    proposalEventIds: [...context.metadata.proposalEventIds],
    challengeEventIds: existingRound?.challengeEventIds ?? [],
    acceptanceEventIds: existingRound?.acceptanceEventIds ?? [],
    startedAt: existingRound?.startedAt ?? startedAt,
    updatedAt: startedAt
  }, claimOwnerId);

  const reviewResults = await Promise.all(
    reviewerIds.map(async (reviewerId): Promise<ProposalReviewerRoundResult> => {
      const state = workingRun.proposalReviewRounds
        ?.find((round) => round.roundId === roundId)
        ?.reviewerStates.find((reviewerState) => reviewerState.reviewerId === reviewerId);

      if (!reviewersToExecute.includes(reviewerId)) {
        return {
          reviewerId,
          status: "skipped",
          challengeEventIds: state?.challengeEventIds,
          errorCategory: state?.errorCategory,
          safeDiagnostics: state?.safeDiagnostics
        };
      }

      return executeProposalReviewer({
        run: workingRun,
        context,
        reviewerId,
        roundId,
        claimOwnerId,
        options
      });
    })
  );

  const updatedRound = findProposalReviewRound(workingRun, roundId)!;
  const updatedReviewerStates = mergeReviewerResults(
    updatedRound.reviewerStates,
    reviewResults,
    getClock(options)()
  );
  const challengeEventIds = collectEventIds(
    updatedRound.challengeEventIds,
    reviewResults.flatMap((result) => result.challengeEventIds ?? [])
  );
  const reviewErrorCategory = getLastProposalReviewErrorCategory(updatedReviewerStates);
  const reviewIsIncomplete = updatedReviewerStates.some(isReviewerIncomplete);

  workingRun = setProposalReviewRoundState(workingRun, options, {
    ...updatedRound,
    status: reviewIsIncomplete ? "waiting_for_reviewers" : "running",
    reviewerStates: updatedReviewerStates,
    challengeEventIds,
    lastErrorCategory: reviewErrorCategory,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  assertProposalReviewRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);
  const acceptanceResults = reviewIsIncomplete
    ? []
    : runAcceptancePolicy({
        run: workingRun,
        roundId,
        sourceExtractionRoundId,
        proposalEventIds: context.metadata.proposalEventIds,
        acceptancePolicy,
        options
      });
  const acceptanceEventIds = collectEventIds(
    findProposalReviewRound(workingRun, roundId)?.acceptanceEventIds ?? [],
    acceptanceResults.flatMap((result) => result.acceptanceEventId ? [result.acceptanceEventId] : [])
  );
  const acceptanceErrorCategory = getLastAcceptanceErrorCategory(acceptanceResults);
  const finalErrorCategory = reviewIsIncomplete
    ? reviewErrorCategory
    : acceptanceErrorCategory ?? reviewErrorCategory;
  const finalStatus = reviewIsIncomplete ? "waiting_for_reviewers" : "completed";
  const finalRun = setProposalReviewRoundState(workingRun, options, {
    ...findProposalReviewRound(workingRun, roundId)!,
    status: finalStatus,
    reviewerStates: updatedReviewerStates,
    challengeEventIds,
    acceptanceEventIds,
    lastErrorCategory: finalErrorCategory,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  return {
    run: finalRun,
    roundId,
    executionStatus: "executed",
    reviewResults,
    acceptanceResults
  };
}

async function executeProposalReviewer(input: {
  run: DeliberationRunRecord;
  context: ProposalReviewContext;
  reviewerId: string;
  roundId: string;
  claimOwnerId: string;
  options: RunProposalReviewRoundOptions;
}): Promise<ProposalReviewerRoundResult> {
  try {
    assertProposalReviewRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const reviewer = input.options.proposalReviewGeneratorRegistry.require(input.reviewerId);
    const providerRuntimeConfig = resolveProposalReviewerRuntimeConfig(
      input.run,
      reviewer,
      input.options.env
    );
    const generatorResult = await Promise.resolve()
      .then(() =>
        reviewer.reviewProposals(
          {
            instructions:
              "Review extraction proposal events. Return challenge drafts only; do not return acceptance decisions.",
            context: structuredClone(input.context)
          },
          structuredClone(input.context),
          providerRuntimeConfig
        )
      )
      .catch((error) => {
        if (isSafeProposalReviewGeneratorFailure(error)) {
          throw error;
        }

        throw new RunProposalReviewRoundError(
          "proposal_review_generator_failed",
          "Proposal review generator failed to produce review material."
        );
      });
    const review = validateProposalReviewGeneratorResult(generatorResult, input.context);
    const challengeEventIds: string[] = [];
    const appendedChallengeEventIds: string[] = [];

    assertProposalReviewRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    for (const challenge of review.challenges) {
      const challenged = challengeProposal(
        {
          sessionId: input.run.sessionId,
          targetProposalEventId: challenge.targetProposalEventId,
          authorId: input.reviewerId,
          reason: challenge.reason,
          idempotencyKey: createChallengeIdempotencyKey(
            input.run.id,
            input.roundId,
            input.reviewerId,
            challenge.targetProposalEventId
          )
        },
        input.options
      );

      challengeEventIds.push(challenged.challengeEvent.id);
      if (challenged.appended) {
        appendedChallengeEventIds.push(challenged.challengeEvent.id);
      }
    }

    return {
      reviewerId: input.reviewerId,
      status: "reviewed",
      challengeEventIds,
      appendedChallengeEventIds
    };
  } catch (error) {
    const failure = getProposalReviewerFailure(error);

    return {
      reviewerId: input.reviewerId,
      status: "failed",
      errorCategory: failure.errorCategory,
      safeDiagnostics: failure.safeDiagnostics
    };
  }
}

function runAcceptancePolicy(input: {
  run: DeliberationRunRecord;
  roundId: string;
  sourceExtractionRoundId: string;
  proposalEventIds: readonly string[];
  acceptancePolicy: ExtractionAcceptancePolicy;
  options: RunProposalReviewRoundOptions;
}): ProposalAcceptanceRoundResult[] {
  if (input.acceptancePolicy.mode === "none") {
    return [];
  }

  const acceptancePolicy = input.acceptancePolicy;
  const proposalEventIds = resolveAcceptanceProposalEventIds(input);
  const proposalStates = projectExtractionProposalStates({
    eventStore: input.options.eventStore,
    sessionId: input.run.sessionId
  }).proposalStates;
  const proposalStateByEventId = new Map(
    proposalStates.map((state) => [state.proposalEventId, state])
  );

  return proposalEventIds.map((proposalEventId): ProposalAcceptanceRoundResult => {
    const state = proposalStateByEventId.get(proposalEventId);

    if (!state || !input.proposalEventIds.includes(proposalEventId)) {
      return {
        proposalEventId,
        status: "rejected",
        errorCategory: "proposal_review_validation_failed"
      };
    }

    if (
      acceptancePolicy.mode === "explicit_proposal_event_ids" &&
      state.isChallenged &&
      !acceptancePolicy.allowChallenged
    ) {
      return {
        proposalEventId,
        status: "rejected",
        errorCategory: "proposal_review_validation_failed"
      };
    }

    try {
      const accepted = acceptProposal(
        {
          sessionId: input.run.sessionId,
          targetProposalEventId: proposalEventId,
          authorId: acceptancePolicy.authorId,
          rationale: acceptancePolicy.rationale,
          idempotencyKey: createAcceptanceIdempotencyKey(
            input.run.id,
            input.roundId,
            proposalEventId
          )
        },
        input.options
      );

      return {
        proposalEventId,
        status: "accepted",
        acceptanceEventId: accepted.acceptanceEvent.id,
        appended: accepted.appended
      };
    } catch {
      return {
        proposalEventId,
        status: "rejected",
        errorCategory: "core_lifecycle_failed"
      };
    }
  });
}

function isReviewerIncomplete(reviewerState: ProposalReviewerState): boolean {
  return (
    reviewerState.status === "failed" ||
    reviewerState.status === "pending" ||
    reviewerState.status === "running" ||
    reviewerState.status === "timed_out"
  );
}

function resolveAcceptanceProposalEventIds(input: {
  acceptancePolicy: ExtractionAcceptancePolicy;
  proposalEventIds: readonly string[];
  run: DeliberationRunRecord;
  options: RunProposalReviewRoundOptions;
}): string[] {
  if (input.acceptancePolicy.mode === "explicit_proposal_event_ids") {
    return uniqueIds(input.acceptancePolicy.proposalEventIds);
  }

  const states = projectExtractionProposalStates({
    eventStore: input.options.eventStore,
    sessionId: input.run.sessionId
  }).proposalStates;
  const stateByEventId = new Map(states.map((state) => [state.proposalEventId, state]));

  return input.proposalEventIds.filter((proposalEventId) => {
    const state = stateByEventId.get(proposalEventId);

    return Boolean(state && !state.isChallenged);
  });
}

function resolveReviewerIds(
  input: RunProposalReviewRoundInput,
  options: RunProposalReviewRoundOptions
): string[] {
  const reviewerIds = input.reviewerIds
    ? [...input.reviewerIds]
    : options.proposalReviewGeneratorRegistry.list().map((entry) => entry.reviewerId);
  const seen = new Set<string>();

  for (const reviewerId of reviewerIds) {
    if (seen.has(reviewerId)) {
      throw new RunProposalReviewRoundError(
        "proposal_review_validation_failed",
        "Proposal review round contains duplicate reviewer ids."
      );
    }

    options.proposalReviewGeneratorRegistry.require(reviewerId);
    seen.add(reviewerId);
  }

  return reviewerIds;
}

function parseAcceptancePolicy(
  policy: ExtractionAcceptancePolicy | undefined
): ExtractionAcceptancePolicy {
  const parsed = ExtractionAcceptancePolicySchema.safeParse(policy ?? { mode: "none" });

  if (!parsed.success) {
    throw new RunProposalReviewRoundError(
      "proposal_review_validation_failed",
      "Proposal review acceptance policy is invalid."
    );
  }

  return parsed.data;
}

function resolveSourceExtractionRoundId(
  input: RunProposalReviewRoundInput,
  run: DeliberationRunRecord
): string {
  const roundId = input.extractionRoundId ?? run.extractionRounds?.at(-1)?.roundId;

  if (!roundId) {
    throw new RunProposalReviewRoundError(
      "proposal_review_context_unavailable",
      "Proposal review source extraction round was not found."
    );
  }

  return roundId;
}

function createReviewerStates(
  reviewerIds: readonly string[],
  existingRound: ProposalReviewRoundState | undefined
): ProposalReviewerState[] {
  const existingByReviewer = new Map(
    existingRound?.reviewerStates.map((reviewerState) => [
      reviewerState.reviewerId,
      reviewerState
    ]) ?? []
  );

  return reviewerIds.map((reviewerId) => {
    const existing = existingByReviewer.get(reviewerId);

    return existing
      ? structuredClone(existing)
      : {
          reviewerId,
          status: "pending",
          attempts: 0
        };
  });
}

function getReviewersToExecute(
  reviewerStates: readonly ProposalReviewerState[],
  retryFailedReviewers: boolean
): string[] {
  return reviewerStates
    .filter((reviewerState) => {
      if (reviewerState.status === "reviewed") {
        return false;
      }

      if (reviewerState.status === "failed" && !retryFailedReviewers) {
        return false;
      }

      return true;
    })
    .map((reviewerState) => reviewerState.reviewerId);
}

function markReviewersRunning(
  reviewerStates: readonly ProposalReviewerState[],
  reviewersToExecute: readonly string[],
  startedAt: string
): ProposalReviewerState[] {
  const reviewersToExecuteSet = new Set(reviewersToExecute);

  return reviewerStates.map((reviewerState) => {
    if (!reviewersToExecuteSet.has(reviewerState.reviewerId)) {
      return structuredClone(reviewerState);
    }

    return {
      ...reviewerState,
      status: "running",
      attempts: reviewerState.attempts + 1,
      startedAt,
      completedAt: undefined
    };
  });
}

function mergeReviewerResults(
  reviewerStates: readonly ProposalReviewerState[],
  reviewResults: readonly ProposalReviewerRoundResult[],
  completedAt: string
): ProposalReviewerState[] {
  const resultByReviewer = new Map(
    reviewResults.map((result) => [result.reviewerId, result])
  );

  return reviewerStates.map((reviewerState) => {
    const result = resultByReviewer.get(reviewerState.reviewerId);

    if (!result || result.status === "skipped") {
      return structuredClone(reviewerState);
    }

    const previousErrorCategories = mergePreviousProposalReviewErrors(
      reviewerState,
      result.errorCategory
    );

    return {
      ...reviewerState,
      status: result.status,
      challengeEventIds: result.challengeEventIds,
      errorCategory: result.status === "reviewed" ? undefined : result.errorCategory,
      safeDiagnostics: result.status === "reviewed" ? undefined : result.safeDiagnostics,
      previousErrorCategories,
      completedAt
    };
  });
}

function mergePreviousProposalReviewErrors(
  reviewerState: ProposalReviewerState,
  resultErrorCategory: ProposalReviewRunErrorCategory | undefined
): ProposalReviewRunErrorCategory[] | undefined {
  const previous = [...(reviewerState.previousErrorCategories ?? [])];

  if (reviewerState.errorCategory && reviewerState.errorCategory !== resultErrorCategory) {
    previous.push(reviewerState.errorCategory);
  }

  return previous.length > 0 ? previous : undefined;
}

function collectEventIds(
  existingIds: readonly string[],
  newIds: readonly string[]
): string[] {
  return uniqueIds([...existingIds, ...newIds]);
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function getLastProposalReviewErrorCategory(
  reviewerStates: readonly ProposalReviewerState[]
): ProposalReviewRunErrorCategory | undefined {
  for (let index = reviewerStates.length - 1; index >= 0; index -= 1) {
    const reviewerState = reviewerStates[index];
    if (reviewerState?.errorCategory) {
      return reviewerState.errorCategory;
    }
  }

  return undefined;
}

function getLastAcceptanceErrorCategory(
  acceptanceResults: readonly ProposalAcceptanceRoundResult[]
): ProposalReviewRunErrorCategory | undefined {
  for (let index = acceptanceResults.length - 1; index >= 0; index -= 1) {
    const result = acceptanceResults[index];
    if (result?.errorCategory) {
      return result.errorCategory;
    }
  }

  return undefined;
}

function acquireProposalReviewRoundExecutionClaim(
  runId: string,
  roundId: string,
  sourceExtractionRoundId: string,
  reviewerIds: readonly string[],
  options: RunProposalReviewRoundOptions
): ProposalReviewRoundClaimAcquisition {
  const acquiredAt = getClock(options)();
  const ownerId = createProposalReviewExecutionClaimOwnerId(options);
  const acquisitionStatus: {
    current: ProposalReviewRoundClaimAcquisition["status"];
  } = {
    current: "acquired"
  };

  const run = options.runStore.updateRun(runId, (currentRun) => {
    const existingRound = getExistingProposalReviewRound(currentRun, roundId);

    if (existingRound?.sourceExtractionRoundId !== undefined) {
      assertSameSourceExtractionRound(existingRound, sourceExtractionRoundId);
    }

    if (existingRound?.status === "completed") {
      acquisitionStatus.current = "already_completed";
      return currentRun;
    }

    if (
      existingRound?.executionClaim &&
      !isExecutionClaimExpired(existingRound.executionClaim, acquiredAt)
    ) {
      acquisitionStatus.current = "already_running";
      return currentRun;
    }

    const reviewerStates = createReviewerStates(reviewerIds, existingRound);
    const executionClaim: RoundExecutionClaim = {
      ownerId,
      acquiredAt,
      expiresAt: addMilliseconds(
        acquiredAt,
        getProposalReviewExecutionClaimTtlMs(currentRun, options)
      ),
      status: "active"
    };
    const round: ProposalReviewRoundState = {
      roundId,
      sourceExtractionRoundId,
      status: "running",
      reviewerStates,
      proposalEventIds: existingRound?.proposalEventIds ?? [],
      challengeEventIds: existingRound?.challengeEventIds ?? [],
      acceptanceEventIds: existingRound?.acceptanceEventIds ?? [],
      lastErrorCategory: existingRound?.lastErrorCategory,
      executionClaim,
      startedAt: existingRound?.startedAt ?? acquiredAt,
      updatedAt: acquiredAt
    };

    acquisitionStatus.current = "acquired";

    return upsertProposalReviewRound(currentRun, round, acquiredAt);
  });
  const round = findProposalReviewRound(run, roundId);

  if (!round) {
    throw new RunProposalReviewRoundError(
      "round_conflict",
      "Proposal review round claim could not be resolved."
    );
  }

  if (acquisitionStatus.current === "already_running") {
    return {
      status: "already_running",
      run,
      round
    };
  }

  if (acquisitionStatus.current === "already_completed") {
    return {
      status: "already_completed",
      run,
      round
    };
  }

  return {
    status: "acquired",
    ownerId,
    run
  };
}

function releaseProposalReviewRoundExecutionClaim(
  options: RunProposalReviewRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): DeliberationRunRecord {
  return options.runStore.updateRun(runId, (currentRun) => {
    const round = findProposalReviewRound(currentRun, roundId);

    if (!round || round.executionClaim?.ownerId !== ownerId) {
      return currentRun;
    }

    const releasedRound = structuredClone(round);
    delete releasedRound.executionClaim;

    return upsertProposalReviewRound(currentRun, releasedRound, getClock(options)());
  });
}

function assertProposalReviewRoundExecutionClaimOwned(
  options: RunProposalReviewRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): void {
  const run = options.runStore.getRun(runId);
  const claim = findProposalReviewRound(run, roundId)?.executionClaim;

  if (!run || claim?.ownerId !== ownerId || claim?.status !== "active") {
    throw new RunProposalReviewRoundError(
      "round_conflict",
      "Proposal review round execution claim is no longer active."
    );
  }
}

function setProposalReviewRoundState(
  run: DeliberationRunRecord,
  options: RunProposalReviewRoundOptions,
  round: ProposalReviewRoundState,
  claimOwnerId?: string
): DeliberationRunRecord {
  return options.runStore.updateRun(run.id, (currentRun) => {
    if (claimOwnerId) {
      assertCurrentProposalReviewRoundClaimOwner(currentRun, round.roundId, claimOwnerId);
    }

    const existingRound = findProposalReviewRound(currentRun, round.roundId);
    const existingClaim = existingRound?.executionClaim;
    const nextRound =
      round.executionClaim || !existingClaim
        ? round
        : {
            ...round,
            executionClaim: existingClaim
          };

    return upsertProposalReviewRound(
      currentRun,
      nextRound,
      nextRound.updatedAt ?? getClock(options)()
    );
  });
}

function markProposalReviewRoundFailed(
  run: DeliberationRunRecord,
  options: RunProposalReviewRoundOptions,
  roundId: string,
  sourceExtractionRoundId: string,
  reviewerIds: readonly string[],
  proposalEventIds: readonly string[],
  errorCategory: ProposalReviewRunErrorCategory,
  claimOwnerId?: string
): DeliberationRunRecord {
  const timestamp = getClock(options)();
  const existingRound = findProposalReviewRound(run, roundId);

  return setProposalReviewRoundState(run, options, {
    roundId,
    sourceExtractionRoundId,
    status: "failed",
    reviewerStates: createReviewerStates(reviewerIds, existingRound),
    proposalEventIds: [...proposalEventIds],
    challengeEventIds: existingRound?.challengeEventIds ?? [],
    acceptanceEventIds: existingRound?.acceptanceEventIds ?? [],
    lastErrorCategory: errorCategory,
    startedAt: existingRound?.startedAt ?? timestamp,
    updatedAt: timestamp
  }, claimOwnerId);
}

function assertCurrentProposalReviewRoundClaimOwner(
  run: DeliberationRunRecord,
  roundId: string,
  ownerId: string
): void {
  const round = findProposalReviewRound(run, roundId);

  if (round?.executionClaim?.ownerId !== ownerId) {
    throw new RunProposalReviewRoundError(
      "round_conflict",
      "Proposal review round execution claim is no longer active."
    );
  }
}

function getExistingProposalReviewRound(
  run: DeliberationRunRecord,
  roundId: string
): ProposalReviewRoundState | undefined {
  const existingRounds = run.proposalReviewRounds ?? [];
  const existingRound = existingRounds.find((round) => round.roundId === roundId);

  return existingRound ? structuredClone(existingRound) : undefined;
}

function findProposalReviewRound(
  run: DeliberationRunRecord | undefined,
  roundId: string
): ProposalReviewRoundState | undefined {
  return run?.proposalReviewRounds?.find((round) => round.roundId === roundId);
}

function assertSameSourceExtractionRound(
  existingRound: ProposalReviewRoundState,
  sourceExtractionRoundId: string
): void {
  if (existingRound.sourceExtractionRoundId !== sourceExtractionRoundId) {
    throw new RunProposalReviewRoundError(
      "round_conflict",
      "Proposal review round already targets a different source extraction round."
    );
  }
}

function upsertProposalReviewRound(
  run: DeliberationRunRecord,
  round: ProposalReviewRoundState,
  updatedAt: string
): DeliberationRunRecord {
  const existingRounds = run.proposalReviewRounds ?? [];
  const replaced = existingRounds.some((existingRound) => existingRound.roundId === round.roundId);
  const proposalReviewRounds = replaced
    ? existingRounds.map((existingRound) =>
        existingRound.roundId === round.roundId
          ? structuredClone(round)
          : structuredClone(existingRound)
      )
    : [
        ...existingRounds.map((existingRound) => structuredClone(existingRound)),
        structuredClone(round)
      ];

  return {
    ...run,
    proposalReviewRounds,
    updatedAt
  };
}

function createResultFromProposalReviewRound(
  run: DeliberationRunRecord,
  round: ProposalReviewRoundState,
  roundId: string,
  executionStatus: RunProposalReviewRoundResult["executionStatus"]
): RunProposalReviewRoundResult {
  return {
    run,
    roundId,
    executionStatus,
    reviewResults: round.reviewerStates.map((reviewerState) => ({
      reviewerId: reviewerState.reviewerId,
      status: "skipped",
      challengeEventIds: reviewerState.challengeEventIds,
      errorCategory: reviewerState.errorCategory,
      safeDiagnostics: reviewerState.safeDiagnostics
    })),
    acceptanceResults: []
  };
}

function resolveProposalReviewerRuntimeConfig(
  run: DeliberationRunRecord,
  reviewer: {
    adapterId?: string;
    providerConfigId?: string;
  },
  env: Record<string, string | undefined> | undefined
) {
  if (!reviewer.providerConfigId) {
    return undefined;
  }

  const providerConfig = run.plan.providerConfigs.find(
    (candidate) => candidate.id === reviewer.providerConfigId
  );

  if (!providerConfig) {
    throw new RunProposalReviewRoundError(
      "provider_config_invalid",
      "Proposal reviewer provider config was not found."
    );
  }

  if (reviewer.adapterId && providerConfig.adapterId !== reviewer.adapterId) {
    throw new RunProposalReviewRoundError(
      "provider_config_invalid",
      "Proposal reviewer provider config adapter is invalid."
    );
  }

  return resolveProviderRuntimeConfig({
    providerConfig,
    env
  });
}

function getProposalReviewerFailure(error: unknown): {
  errorCategory: ProposalReviewRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
} {
  return {
    errorCategory: getProposalReviewerErrorCategory(error),
    safeDiagnostics: getSafeProposalReviewDiagnostics(error)
  };
}

function getProposalReviewerErrorCategory(error: unknown): ProposalReviewRunErrorCategory {
  if (error instanceof ProposalReviewContextError) {
    return "proposal_review_context_unavailable";
  }

  if (error instanceof ProviderSecretResolutionError) {
    return "provider_secret_missing";
  }

  if (
    error instanceof RunProposalReviewRoundError &&
    error.category === "round_conflict"
  ) {
    return "round_conflict";
  }

  if (
    error instanceof RunProposalReviewRoundError &&
    error.category === "proposal_review_generator_failed"
  ) {
    return "proposal_review_generator_failed";
  }

  if (error instanceof ProposalReviewValidationError) {
    return "proposal_review_validation_failed";
  }

  const safeCategory = getSafeProposalReviewErrorCategory(error);
  if (safeCategory) {
    return safeCategory;
  }

  return error instanceof RunProposalReviewRoundError
    ? (error.category as ProposalReviewRunErrorCategory)
    : "core_lifecycle_failed";
}

function isSafeProposalReviewGeneratorFailure(error: unknown): boolean {
  return error instanceof ProviderSecretResolutionError ||
    Boolean(getSafeProposalReviewErrorCategory(error));
}

function getSafeProposalReviewErrorCategory(
  error: unknown
): ProposalReviewRunErrorCategory | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const safeCategory = (error as { safeCategory?: unknown }).safeCategory;
  if (typeof safeCategory !== "string") {
    return undefined;
  }

  const parsed = ProposalReviewRunErrorCategorySchema.safeParse(safeCategory);
  return parsed.success ? parsed.data : undefined;
}

function getSafeProposalReviewDiagnostics(error: unknown): RunSafeDiagnostics | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const diagnostics = (error as { safeDiagnostics?: unknown }).safeDiagnostics;
  if (typeof diagnostics !== "object" || diagnostics === null || Array.isArray(diagnostics)) {
    return undefined;
  }

  const safeDiagnostics: RunSafeDiagnostics = {};
  const httpStatus = (diagnostics as { httpStatus?: unknown }).httpStatus;
  if (
    typeof httpStatus === "number" &&
    Number.isFinite(httpStatus) &&
    Number.isInteger(httpStatus) &&
    httpStatus >= 100 &&
    httpStatus <= 599
  ) {
    safeDiagnostics.httpStatus = httpStatus;
  }

  const providerResponseShape = (diagnostics as {
    providerResponseShape?: unknown;
  }).providerResponseShape;
  const parsedProviderResponseShape =
    RunSafeProviderResponseShapeSchema.safeParse(providerResponseShape);
  if (parsedProviderResponseShape.success) {
    safeDiagnostics.providerResponseShape = parsedProviderResponseShape.data;
  }

  return Object.keys(safeDiagnostics).length > 0 ? safeDiagnostics : undefined;
}

function createProposalReviewExecutionClaimOwnerId(
  options: RunProposalReviewRoundOptions
): string {
  const ownerId =
    options.executionClaimOwnerIdGenerator?.() ??
    `proposal-review-claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (ownerId.trim().length === 0) {
    throw new RunProposalReviewRoundError(
      "round_conflict",
      "Proposal review round execution claim owner is invalid."
    );
  }

  return ownerId;
}

function getProposalReviewExecutionClaimTtlMs(
  run: DeliberationRunRecord,
  options: RunProposalReviewRoundOptions
): number {
  const ttlMs =
    options.executionClaimTtlMs ??
    run.plan.timeouts.overallMs ??
    DEFAULT_EXECUTION_CLAIM_TTL_MS;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RunProposalReviewRoundError(
      "round_conflict",
      "Proposal review round execution claim TTL is invalid."
    );
  }

  return ttlMs;
}

function isExecutionClaimExpired(
  claim: RoundExecutionClaim,
  now: string
): boolean {
  return parseTimestampMs(claim.expiresAt) <= parseTimestampMs(now);
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(parseTimestampMs(timestamp) + milliseconds).toISOString();
}

function parseTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);

  if (Number.isNaN(parsed)) {
    throw new RunProposalReviewRoundError(
      "round_conflict",
      "Proposal review round execution claim timestamp is invalid."
    );
  }

  return parsed;
}

function getClock(options: RunProposalReviewRoundOptions): () => string {
  return options.clock ?? (() => new Date().toISOString());
}

function createChallengeIdempotencyKey(
  runId: string,
  roundId: string,
  reviewerId: string,
  proposalEventId: string
): string {
  return `orchestrator:${runId}:proposal-review:${roundId}:challenge:${reviewerId}:${proposalEventId}`;
}

function createAcceptanceIdempotencyKey(
  runId: string,
  roundId: string,
  proposalEventId: string
): string {
  return `orchestrator:${runId}:proposal-review:${roundId}:accept:${proposalEventId}`;
}
