import {
  auditFinalCandidate,
  compileOutcome as compileCoreOutcome,
  proposeFinalCandidate
} from "@deliberum/core";
import type { OutcomeCompilationResult } from "@deliberum/core";
import {
  ProviderSecretResolutionError,
  FinalizationContextError,
  FinalizationValidationError,
  RunFinalizationRoundError,
  RunStoreNotFoundError
} from "./errors";
import { buildFinalizationContext } from "./finalization-context";
import {
  validateFinalAuditGeneratorResult,
  validateFinalCandidateGeneratorResult
} from "./finalization-validation";
import { resolveProviderRuntimeConfig } from "./provider-secret-resolver";
import {
  FinalizationRunErrorCategorySchema,
  RunSafeProviderResponseShapeSchema
} from "./types";
import type {
  DeliberationRunRecord,
  ExplicitFinalCandidateDraft,
  FinalAuditGenerationState,
  FinalAuditRoundResult,
  FinalCandidateGenerationState,
  FinalCandidateRoundResult,
  FinalizationContext,
  FinalizationRunErrorCategory,
  FinalizationRoundState,
  OutcomeCompilationMetadata,
  RoundExecutionClaim,
  RunFinalizationRoundInput,
  RunFinalizationRoundOptions,
  RunFinalizationRoundResult,
  RunSafeDiagnostics
} from "./types";

const DEFAULT_FINALIZATION_ROUND_ID = "initial" as const;
const DEFAULT_EXECUTION_CLAIM_TTL_MS = 5 * 60 * 1000;
const EXPLICIT_FINAL_CANDIDATE_SOURCE_ID = "explicit-final-candidate" as const;

type FinalCandidateSource =
  | {
      sourceType: "explicit";
      sourceId: typeof EXPLICIT_FINAL_CANDIDATE_SOURCE_ID;
      draft: ExplicitFinalCandidateDraft;
    }
  | {
      sourceType: "generator";
      sourceId: string;
    };

type FinalizationRoundClaimAcquisition =
  | {
      status: "acquired";
      ownerId: string;
      run: DeliberationRunRecord;
    }
  | {
      status: "already_running";
      run: DeliberationRunRecord;
      round: FinalizationRoundState;
    }
  | {
      status: "already_completed";
      run: DeliberationRunRecord;
      round: FinalizationRoundState;
    };

export async function runFinalizationRound(
  input: RunFinalizationRoundInput,
  options: RunFinalizationRoundOptions
): Promise<RunFinalizationRoundResult> {
  const existingRun = options.runStore.getRun(input.runId);
  if (!existingRun) {
    throw new RunStoreNotFoundError(input.runId);
  }

  const roundId = input.roundId ?? DEFAULT_FINALIZATION_ROUND_ID;
  const sourceProposalReviewRoundId = resolveSourceProposalReviewRoundId(input, existingRun);
  const finalCandidateSource = resolveFinalCandidateSource(input, options);
  const auditorIds = resolveAuditorIds(input, options);
  const acquisition = acquireFinalizationRoundExecutionClaim(
    input.runId,
    roundId,
    sourceProposalReviewRoundId,
    finalCandidateSource,
    auditorIds,
    options
  );

  if (acquisition.status === "already_running") {
    return createResultFromFinalizationRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_running"
    );
  }

  if (acquisition.status === "already_completed") {
    return createResultFromFinalizationRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_completed"
    );
  }

  try {
    const result = await executeClaimedFinalizationRound(
      acquisition.run,
      input,
      options,
      roundId,
      sourceProposalReviewRoundId,
      finalCandidateSource,
      auditorIds,
      acquisition.ownerId
    );
    const releasedRun = releaseFinalizationRoundExecutionClaim(
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
    releaseFinalizationRoundExecutionClaim(options, input.runId, roundId, acquisition.ownerId);
    throw error;
  }
}

async function executeClaimedFinalizationRound(
  run: DeliberationRunRecord,
  input: RunFinalizationRoundInput,
  options: RunFinalizationRoundOptions,
  roundId: string,
  sourceProposalReviewRoundId: string | undefined,
  finalCandidateSource: FinalCandidateSource,
  auditorIds: readonly string[],
  claimOwnerId: string
): Promise<RunFinalizationRoundResult> {
  let workingRun = run;
  let context: FinalizationContext;

  try {
    assertFinalizationRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);
    context = buildFinalizationContext({
      run: workingRun,
      eventStore: options.eventStore,
      proposalReviewRoundId: sourceProposalReviewRoundId
    });
  } catch (error) {
    markFinalizationRoundFailed(
      workingRun,
      options,
      roundId,
      sourceProposalReviewRoundId,
      finalCandidateSource,
      auditorIds,
      "finalization_context_unavailable",
      claimOwnerId
    );

    if (error instanceof RunFinalizationRoundError) {
      throw error;
    }

    throw new RunFinalizationRoundError(
      "finalization_context_unavailable",
      "Finalization context could not be built from accepted projections."
    );
  }

  const existingRound = findFinalizationRound(workingRun, roundId);
  const finalCandidateState = createFinalCandidateState(finalCandidateSource, existingRound);
  const finalCandidateShouldExecute = shouldExecuteFinalCandidate(
    finalCandidateState,
    Boolean(input.retryFailedFinalCandidate)
  );
  const startedAt = getClock(options)();

  workingRun = setFinalizationRoundState(workingRun, options, {
    roundId,
    sourceProposalReviewRoundId,
    status: "running",
    finalCandidate: finalCandidateShouldExecute
      ? markFinalCandidateRunning(finalCandidateState, startedAt)
      : finalCandidateState,
    auditorStates: createAuditStates(auditorIds, existingRound),
    finalCandidateProposalEventId: existingRound?.finalCandidateProposalEventId,
    auditEventIds: existingRound?.auditEventIds ?? [],
    outcomeCompilation: existingRound?.outcomeCompilation,
    lastErrorCategory: existingRound?.lastErrorCategory,
    startedAt: existingRound?.startedAt ?? startedAt,
    updatedAt: startedAt
  }, claimOwnerId);

  const finalCandidateResult = finalCandidateShouldExecute
    ? await executeFinalCandidateSource({
        run: workingRun,
        context,
        finalCandidateSource,
        roundId,
        claimOwnerId,
        options
      })
    : createSkippedFinalCandidateResult(finalCandidateState);
  const updatedRound = findFinalizationRound(workingRun, roundId)!;
  const updatedFinalCandidateState = mergeFinalCandidateResult(
    updatedRound.finalCandidate ?? finalCandidateState,
    finalCandidateResult,
    getClock(options)()
  );
  const finalCandidateProposalEventId =
    finalCandidateResult.proposalEventId ?? updatedRound.finalCandidateProposalEventId;

  workingRun = setFinalizationRoundState(workingRun, options, {
    ...updatedRound,
    status:
      updatedFinalCandidateState.status === "proposed"
        ? "running"
        : "waiting_for_final_candidate",
    finalCandidate: updatedFinalCandidateState,
    finalCandidateProposalEventId,
    lastErrorCategory: updatedFinalCandidateState.errorCategory,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  if (!finalCandidateProposalEventId || updatedFinalCandidateState.status !== "proposed") {
    return {
      run: workingRun,
      roundId,
      executionStatus: "executed",
      finalCandidateResult,
      auditResults: [],
      outcomeCompilation: findFinalizationRound(workingRun, roundId)?.outcomeCompilation
    };
  }

  const roundBeforeAudits = findFinalizationRound(workingRun, roundId)!;
  const auditStates = createAuditStates(auditorIds, roundBeforeAudits);
  const auditorsToExecute = getAuditorsToExecute(
    auditStates,
    Boolean(input.retryFailedAuditors)
  );
  const auditStartedAt = getClock(options)();

  workingRun = setFinalizationRoundState(workingRun, options, {
    ...roundBeforeAudits,
    status: "running",
    auditorStates: markAuditorsRunning(auditStates, auditorsToExecute, auditStartedAt),
    updatedAt: auditStartedAt
  }, claimOwnerId);

  const auditResults = await Promise.all(
    auditorIds.map(async (auditorId): Promise<FinalAuditRoundResult> => {
      const state = workingRun.finalizationRounds
        ?.find((round) => round.roundId === roundId)
        ?.auditorStates.find((auditorState) => auditorState.auditorId === auditorId);

      if (!auditorsToExecute.includes(auditorId)) {
        return {
          auditorId,
          status: "skipped",
          auditEventId: state?.auditEventId,
          errorCategory: state?.errorCategory,
          safeDiagnostics: state?.safeDiagnostics
        };
      }

      return executeFinalAuditGenerator({
        run: workingRun,
        context,
        auditorId,
        finalCandidateProposalEventId,
        roundId,
        claimOwnerId,
        options
      });
    })
  );
  const roundAfterAudits = findFinalizationRound(workingRun, roundId)!;
  const updatedAuditorStates = mergeAuditResults(
    roundAfterAudits.auditorStates,
    auditResults,
    getClock(options)()
  );
  const auditEventIds = collectEventIds(
    roundAfterAudits.auditEventIds,
    auditResults.flatMap((result) => (result.auditEventId ? [result.auditEventId] : []))
  );
  const auditErrorCategory = getLastFinalizationErrorCategory(updatedAuditorStates);
  const auditIsIncomplete = updatedAuditorStates.some(isAuditorIncomplete);

  workingRun = setFinalizationRoundState(workingRun, options, {
    ...roundAfterAudits,
    status: auditIsIncomplete ? "waiting_for_auditors" : "running",
    auditorStates: updatedAuditorStates,
    auditEventIds,
    lastErrorCategory: auditErrorCategory,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  if (auditIsIncomplete) {
    return {
      run: workingRun,
      roundId,
      executionStatus: "executed",
      finalCandidateResult,
      auditResults,
      outcomeCompilation: findFinalizationRound(workingRun, roundId)?.outcomeCompilation
    };
  }

  const outcomeCompilation = input.compileOutcome
    ? compileOutcomeForRound({
        run: workingRun,
        options,
        roundId,
        finalCandidateProposalEventId,
        claimOwnerId
      })
    : {
        metadata: {
          status: "not_requested"
        } satisfies OutcomeCompilationMetadata,
        outcome: undefined
      };
  const finalStatus = outcomeCompilation.metadata.status === "failed" ? "failed" : "completed";
  const finalRun = setFinalizationRoundState(workingRun, options, {
    ...findFinalizationRound(workingRun, roundId)!,
    status: finalStatus,
    outcomeCompilation: outcomeCompilation.metadata,
    lastErrorCategory:
      outcomeCompilation.metadata.errorCategory ?? auditErrorCategory,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  return {
    run: finalRun,
    roundId,
    executionStatus: "executed",
    finalCandidateResult,
    auditResults,
    outcomeCompilation: outcomeCompilation.metadata,
    outcome: outcomeCompilation.outcome
  };
}

async function executeFinalCandidateSource(input: {
  run: DeliberationRunRecord;
  context: FinalizationContext;
  finalCandidateSource: FinalCandidateSource;
  roundId: string;
  claimOwnerId: string;
  options: RunFinalizationRoundOptions;
}): Promise<FinalCandidateRoundResult> {
  try {
    assertFinalizationRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const generatorResult = input.finalCandidateSource.sourceType === "explicit"
      ? input.finalCandidateSource.draft
      : await (async () => {
          const generator = input.options.finalCandidateGeneratorRegistry.require(
            input.finalCandidateSource.sourceId
          );
          const providerRuntimeConfig = resolveFinalCandidateRuntimeConfig(
            input.run,
            generator,
            input.options.env
          );

          return Promise.resolve()
            .then(() =>
              generator.proposeFinalCandidate(
                {
                  instructions:
                    "Prepare final candidate proposal material only. Do not return authority or single-answer semantics.",
                  context: structuredClone(input.context)
                },
                structuredClone(input.context),
                providerRuntimeConfig
              )
            )
            .catch((error) => {
              if (isSafeFinalizationGeneratorFailure(error)) {
                throw error;
              }

              throw new RunFinalizationRoundError(
                "final_candidate_generator_failed",
                "Final candidate generator failed to produce proposal material."
              );
            });
        })();
    const draft = validateFinalCandidateGeneratorResult(generatorResult, input.context);

    assertFinalizationRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const proposed = proposeFinalCandidate(
      {
        sessionId: input.run.sessionId,
        authorId: input.finalCandidateSource.sourceId,
        candidateIds: draft.candidateIds,
        recommendation: draft.recommendation,
        applicabilityConditions: draft.applicabilityConditions,
        rationale: draft.rationale,
        limitations: draft.limitations,
        idempotencyKey: createFinalCandidateIdempotencyKey(
          input.run.id,
          input.roundId,
          input.finalCandidateSource.sourceId
        )
      },
      input.options
    );

    return {
      sourceId: input.finalCandidateSource.sourceId,
      sourceType: input.finalCandidateSource.sourceType,
      status: "proposed",
      proposalEventId: proposed.proposalEvent.id,
      appended: proposed.appended
    };
  } catch (error) {
    const failure = getFinalCandidateFailure(error);

    return {
      sourceId: input.finalCandidateSource.sourceId,
      sourceType: input.finalCandidateSource.sourceType,
      status: "failed",
      errorCategory: failure.errorCategory,
      safeDiagnostics: failure.safeDiagnostics
    };
  }
}

async function executeFinalAuditGenerator(input: {
  run: DeliberationRunRecord;
  context: FinalizationContext;
  auditorId: string;
  finalCandidateProposalEventId: string;
  roundId: string;
  claimOwnerId: string;
  options: RunFinalizationRoundOptions;
}): Promise<FinalAuditRoundResult> {
  try {
    assertFinalizationRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const generator = input.options.finalAuditGeneratorRegistry.require(input.auditorId);
    const providerRuntimeConfig = resolveFinalAuditRuntimeConfig(
      input.run,
      generator,
      input.options.env
    );
    const generatorResult = await Promise.resolve()
      .then(() =>
        generator.auditFinalCandidate(
          {
            instructions:
              "Prepare final audit material using findings, risks, unresolved issues, omissions, limitations, and continuation suggestions only.",
            context: structuredClone(input.context),
            finalCandidateProposalEventId: input.finalCandidateProposalEventId
          },
          structuredClone(input.context),
          providerRuntimeConfig
        )
      )
      .catch((error) => {
        if (isSafeFinalizationGeneratorFailure(error)) {
          throw error;
        }

        throw new RunFinalizationRoundError(
          "final_audit_generator_failed",
          "Final audit generator failed to produce audit material."
        );
      });
    const audit = validateFinalAuditGeneratorResult(generatorResult, input.context);

    assertFinalizationRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const recorded = auditFinalCandidate(
      {
        sessionId: input.run.sessionId,
        targetFinalCandidateProposalEventId: input.finalCandidateProposalEventId,
        authorId: input.auditorId,
        findings: audit.findings,
        risks: audit.risks,
        unresolvedObjectionIds: audit.unresolvedObjectionIds,
        qualityObligationIds: audit.qualityObligationIds,
        evidenceNeedIds: audit.evidenceNeedIds,
        omissions: audit.omissions,
        compressionProblems: audit.compressionProblems,
        limitations: audit.limitations,
        continuationSuggestions: audit.continuationSuggestions,
        idempotencyKey: createFinalAuditIdempotencyKey(
          input.run.id,
          input.roundId,
          input.auditorId,
          input.finalCandidateProposalEventId
        )
      },
      input.options
    );

    return {
      auditorId: input.auditorId,
      status: "recorded",
      auditEventId: recorded.auditEvent.id,
      appended: recorded.appended
    };
  } catch (error) {
    const failure = getFinalAuditFailure(error);

    return {
      auditorId: input.auditorId,
      status: "failed",
      errorCategory: failure.errorCategory,
      safeDiagnostics: failure.safeDiagnostics
    };
  }
}

function compileOutcomeForRound(input: {
  run: DeliberationRunRecord;
  options: RunFinalizationRoundOptions;
  roundId: string;
  finalCandidateProposalEventId: string;
  claimOwnerId: string;
}): {
  metadata: OutcomeCompilationMetadata;
  outcome?: OutcomeCompilationResult;
} {
  try {
    assertFinalizationRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const outcome = compileCoreOutcome({
      eventStore: input.options.eventStore,
      sessionId: input.run.sessionId,
      finalCandidateProposalEventId: input.finalCandidateProposalEventId
    });
    const compiledAt = getClock(input.options)();

    return {
      metadata: {
        status: "compiled",
        compiledAt,
        projectionVersion: outcome.provenance.projectionVersion,
        eventRange: { ...outcome.provenance.eventRange },
        eventIds: [...outcome.provenance.eventIds],
        finalCandidateProposalEventId: outcome.provenance.finalCandidateProposalEventId,
        finalAuditEventIds: [...outcome.provenance.finalAuditEventIds]
      } satisfies OutcomeCompilationMetadata,
      outcome
    };
  } catch {
    return {
      metadata: {
        status: "failed",
        errorCategory: "outcome_compilation_failed"
      } satisfies OutcomeCompilationMetadata,
      outcome: undefined
    };
  }
}

function resolveFinalCandidateSource(
  input: RunFinalizationRoundInput,
  options: RunFinalizationRoundOptions
): FinalCandidateSource {
  if (input.finalCandidateDraft && input.finalCandidateGeneratorId) {
    throw new RunFinalizationRoundError(
      "final_candidate_validation_failed",
      "Finalization must use either an explicit final candidate draft or one generator."
    );
  }

  if (input.finalCandidateDraft) {
    return {
      sourceType: "explicit",
      sourceId: EXPLICIT_FINAL_CANDIDATE_SOURCE_ID,
      draft: input.finalCandidateDraft
    };
  }

  if (input.finalCandidateGeneratorId) {
    options.finalCandidateGeneratorRegistry.require(input.finalCandidateGeneratorId);

    return {
      sourceType: "generator",
      sourceId: input.finalCandidateGeneratorId
    };
  }

  const generatorIds = options.finalCandidateGeneratorRegistry
    .list()
    .map((entry) => entry.generatorId);

  if (generatorIds.length !== 1) {
    throw new RunFinalizationRoundError(
      "final_candidate_validation_failed",
      "Finalization requires exactly one final candidate generator when no explicit draft is provided."
    );
  }

  options.finalCandidateGeneratorRegistry.require(generatorIds[0]!);

  return {
    sourceType: "generator",
    sourceId: generatorIds[0]!
  };
}

function resolveAuditorIds(
  input: RunFinalizationRoundInput,
  options: RunFinalizationRoundOptions
): string[] {
  const auditorIds = input.auditGeneratorIds
    ? [...input.auditGeneratorIds]
    : options.finalAuditGeneratorRegistry.list().map((entry) => entry.auditorId);
  const seen = new Set<string>();

  for (const auditorId of auditorIds) {
    if (seen.has(auditorId)) {
      throw new RunFinalizationRoundError(
        "final_audit_validation_failed",
        "Finalization round contains duplicate auditor ids."
      );
    }

    options.finalAuditGeneratorRegistry.require(auditorId);
    seen.add(auditorId);
  }

  return auditorIds;
}

function resolveSourceProposalReviewRoundId(
  input: RunFinalizationRoundInput,
  run: DeliberationRunRecord
): string | undefined {
  return input.proposalReviewRoundId ?? run.proposalReviewRounds?.at(-1)?.roundId;
}

function acquireFinalizationRoundExecutionClaim(
  runId: string,
  roundId: string,
  sourceProposalReviewRoundId: string | undefined,
  finalCandidateSource: FinalCandidateSource,
  auditorIds: readonly string[],
  options: RunFinalizationRoundOptions
): FinalizationRoundClaimAcquisition {
  const acquiredAt = getClock(options)();
  const ownerId = createFinalizationExecutionClaimOwnerId(options);
  const acquisitionStatus: {
    current: FinalizationRoundClaimAcquisition["status"];
  } = {
    current: "acquired"
  };

  const run = options.runStore.updateRun(runId, (currentRun) => {
    const existingRound = getExistingFinalizationRound(currentRun, roundId);

    if (existingRound?.sourceProposalReviewRoundId !== undefined) {
      assertSameSourceProposalReviewRound(existingRound, sourceProposalReviewRoundId);
    }

    if (existingRound?.finalCandidate !== undefined) {
      assertSameFinalCandidateSource(existingRound.finalCandidate, finalCandidateSource);
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

    const executionClaim: RoundExecutionClaim = {
      ownerId,
      acquiredAt,
      expiresAt: addMilliseconds(
        acquiredAt,
        getFinalizationExecutionClaimTtlMs(currentRun, options)
      ),
      status: "active"
    };
    const round: FinalizationRoundState = {
      roundId,
      sourceProposalReviewRoundId,
      status: "running",
      finalCandidate: createFinalCandidateState(finalCandidateSource, existingRound),
      auditorStates: createAuditStates(auditorIds, existingRound),
      finalCandidateProposalEventId: existingRound?.finalCandidateProposalEventId,
      auditEventIds: existingRound?.auditEventIds ?? [],
      outcomeCompilation: existingRound?.outcomeCompilation,
      lastErrorCategory: existingRound?.lastErrorCategory,
      executionClaim,
      startedAt: existingRound?.startedAt ?? acquiredAt,
      updatedAt: acquiredAt
    };

    acquisitionStatus.current = "acquired";

    return upsertFinalizationRound(currentRun, round, acquiredAt);
  });
  const round = findFinalizationRound(run, roundId);

  if (!round) {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round claim could not be resolved."
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

function releaseFinalizationRoundExecutionClaim(
  options: RunFinalizationRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): DeliberationRunRecord {
  return options.runStore.updateRun(runId, (currentRun) => {
    const round = findFinalizationRound(currentRun, roundId);

    if (!round || round.executionClaim?.ownerId !== ownerId) {
      return currentRun;
    }

    const releasedRound = structuredClone(round);
    delete releasedRound.executionClaim;

    return upsertFinalizationRound(currentRun, releasedRound, getClock(options)());
  });
}

function assertFinalizationRoundExecutionClaimOwned(
  options: RunFinalizationRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): void {
  const run = options.runStore.getRun(runId);
  const claim = findFinalizationRound(run, roundId)?.executionClaim;

  if (!run || claim?.ownerId !== ownerId || claim?.status !== "active") {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round execution claim is no longer active."
    );
  }
}

function setFinalizationRoundState(
  run: DeliberationRunRecord,
  options: RunFinalizationRoundOptions,
  round: FinalizationRoundState,
  claimOwnerId?: string
): DeliberationRunRecord {
  return options.runStore.updateRun(run.id, (currentRun) => {
    if (claimOwnerId) {
      assertCurrentFinalizationRoundClaimOwner(currentRun, round.roundId, claimOwnerId);
    }

    const existingRound = findFinalizationRound(currentRun, round.roundId);
    const existingClaim = existingRound?.executionClaim;
    const nextRound =
      round.executionClaim || !existingClaim
        ? round
        : {
            ...round,
            executionClaim: existingClaim
          };

    return upsertFinalizationRound(currentRun, nextRound, nextRound.updatedAt ?? getClock(options)());
  });
}

function markFinalizationRoundFailed(
  run: DeliberationRunRecord,
  options: RunFinalizationRoundOptions,
  roundId: string,
  sourceProposalReviewRoundId: string | undefined,
  finalCandidateSource: FinalCandidateSource,
  auditorIds: readonly string[],
  errorCategory: FinalizationRunErrorCategory,
  claimOwnerId?: string
): DeliberationRunRecord {
  const timestamp = getClock(options)();
  const existingRound = findFinalizationRound(run, roundId);

  return setFinalizationRoundState(run, options, {
    roundId,
    sourceProposalReviewRoundId,
    status: "failed",
    finalCandidate: createFinalCandidateState(finalCandidateSource, existingRound),
    auditorStates: createAuditStates(auditorIds, existingRound),
    finalCandidateProposalEventId: existingRound?.finalCandidateProposalEventId,
    auditEventIds: existingRound?.auditEventIds ?? [],
    outcomeCompilation: existingRound?.outcomeCompilation,
    lastErrorCategory: errorCategory,
    startedAt: existingRound?.startedAt ?? timestamp,
    updatedAt: timestamp
  }, claimOwnerId);
}

function createFinalCandidateState(
  source: FinalCandidateSource,
  existingRound: FinalizationRoundState | undefined
): FinalCandidateGenerationState {
  const existing = existingRound?.finalCandidate;

  if (existing) {
    assertSameFinalCandidateSource(existing, source);
    return structuredClone(existing);
  }

  return {
    sourceId: source.sourceId,
    sourceType: source.sourceType,
    status: "pending",
    attempts: 0
  };
}

function createAuditStates(
  auditorIds: readonly string[],
  existingRound: FinalizationRoundState | undefined
): FinalAuditGenerationState[] {
  const existingByAuditor = new Map(
    existingRound?.auditorStates.map((auditorState) => [
      auditorState.auditorId,
      auditorState
    ]) ?? []
  );

  return auditorIds.map((auditorId) => {
    const existing = existingByAuditor.get(auditorId);

    return existing
      ? structuredClone(existing)
      : {
          auditorId,
          status: "pending",
          attempts: 0
        };
  });
}

function shouldExecuteFinalCandidate(
  state: FinalCandidateGenerationState,
  retryFailedFinalCandidate: boolean
): boolean {
  if (state.status === "proposed") {
    return false;
  }

  if (state.status === "failed" && !retryFailedFinalCandidate) {
    return false;
  }

  return true;
}

function markFinalCandidateRunning(
  state: FinalCandidateGenerationState,
  startedAt: string
): FinalCandidateGenerationState {
  return {
    ...state,
    status: "running",
    attempts: state.attempts + 1,
    startedAt,
    completedAt: undefined
  };
}

function createSkippedFinalCandidateResult(
  state: FinalCandidateGenerationState
): FinalCandidateRoundResult {
  return {
    sourceId: state.sourceId,
    sourceType: state.sourceType,
    status: "skipped",
    proposalEventId: state.proposalEventId,
    errorCategory: state.errorCategory,
    safeDiagnostics: state.safeDiagnostics
  };
}

function mergeFinalCandidateResult(
  state: FinalCandidateGenerationState,
  result: FinalCandidateRoundResult,
  completedAt: string
): FinalCandidateGenerationState {
  if (result.status === "skipped") {
    return structuredClone(state);
  }

  const previousErrorCategories = mergePreviousFinalizationErrors(
    state,
    result.errorCategory
  );

  return {
    ...state,
    status: result.status,
    proposalEventId: result.proposalEventId,
    errorCategory: result.status === "proposed" ? undefined : result.errorCategory,
    safeDiagnostics: result.status === "proposed" ? undefined : result.safeDiagnostics,
    previousErrorCategories,
    completedAt
  };
}

function getAuditorsToExecute(
  auditorStates: readonly FinalAuditGenerationState[],
  retryFailedAuditors: boolean
): string[] {
  return auditorStates
    .filter((auditorState) => {
      if (auditorState.status === "recorded") {
        return false;
      }

      if (auditorState.status === "failed" && !retryFailedAuditors) {
        return false;
      }

      return true;
    })
    .map((auditorState) => auditorState.auditorId);
}

function markAuditorsRunning(
  auditorStates: readonly FinalAuditGenerationState[],
  auditorsToExecute: readonly string[],
  startedAt: string
): FinalAuditGenerationState[] {
  const auditorsToExecuteSet = new Set(auditorsToExecute);

  return auditorStates.map((auditorState) => {
    if (!auditorsToExecuteSet.has(auditorState.auditorId)) {
      return structuredClone(auditorState);
    }

    return {
      ...auditorState,
      status: "running",
      attempts: auditorState.attempts + 1,
      startedAt,
      completedAt: undefined
    };
  });
}

function mergeAuditResults(
  auditorStates: readonly FinalAuditGenerationState[],
  auditResults: readonly FinalAuditRoundResult[],
  completedAt: string
): FinalAuditGenerationState[] {
  const resultByAuditor = new Map(auditResults.map((result) => [result.auditorId, result]));

  return auditorStates.map((auditorState) => {
    const result = resultByAuditor.get(auditorState.auditorId);

    if (!result || result.status === "skipped") {
      return structuredClone(auditorState);
    }

    const previousErrorCategories = mergePreviousFinalizationErrors(
      auditorState,
      result.errorCategory
    );

    return {
      ...auditorState,
      status: result.status,
      auditEventId: result.auditEventId,
      errorCategory: result.status === "recorded" ? undefined : result.errorCategory,
      safeDiagnostics: result.status === "recorded" ? undefined : result.safeDiagnostics,
      previousErrorCategories,
      completedAt
    };
  });
}

function isAuditorIncomplete(auditorState: FinalAuditGenerationState): boolean {
  return (
    auditorState.status === "failed" ||
    auditorState.status === "pending" ||
    auditorState.status === "running"
  );
}

function mergePreviousFinalizationErrors(
  state: {
    errorCategory?: FinalizationRunErrorCategory;
    previousErrorCategories?: FinalizationRunErrorCategory[];
  },
  resultErrorCategory: FinalizationRunErrorCategory | undefined
): FinalizationRunErrorCategory[] | undefined {
  const previous = [...(state.previousErrorCategories ?? [])];

  if (state.errorCategory && state.errorCategory !== resultErrorCategory) {
    previous.push(state.errorCategory);
  }

  return previous.length > 0 ? previous : undefined;
}

function getLastFinalizationErrorCategory(
  auditorStates: readonly FinalAuditGenerationState[]
): FinalizationRunErrorCategory | undefined {
  for (let index = auditorStates.length - 1; index >= 0; index -= 1) {
    const auditorState = auditorStates[index];
    if (auditorState?.errorCategory) {
      return auditorState.errorCategory;
    }
  }

  return undefined;
}

function assertCurrentFinalizationRoundClaimOwner(
  run: DeliberationRunRecord,
  roundId: string,
  ownerId: string
): void {
  const round = findFinalizationRound(run, roundId);

  if (round?.executionClaim?.ownerId !== ownerId) {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round execution claim is no longer active."
    );
  }
}

function getExistingFinalizationRound(
  run: DeliberationRunRecord,
  roundId: string
): FinalizationRoundState | undefined {
  const existingRounds = run.finalizationRounds ?? [];
  const existingRound = existingRounds.find((round) => round.roundId === roundId);

  return existingRound ? structuredClone(existingRound) : undefined;
}

function findFinalizationRound(
  run: DeliberationRunRecord | undefined,
  roundId: string
): FinalizationRoundState | undefined {
  return run?.finalizationRounds?.find((round) => round.roundId === roundId);
}

function assertSameSourceProposalReviewRound(
  existingRound: FinalizationRoundState,
  sourceProposalReviewRoundId: string | undefined
): void {
  if (existingRound.sourceProposalReviewRoundId !== sourceProposalReviewRoundId) {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round already targets a different proposal review round."
    );
  }
}

function assertSameFinalCandidateSource(
  existing: FinalCandidateGenerationState,
  source: FinalCandidateSource
): void {
  if (existing.sourceId !== source.sourceId || existing.sourceType !== source.sourceType) {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round already uses a different final candidate source."
    );
  }
}

function upsertFinalizationRound(
  run: DeliberationRunRecord,
  round: FinalizationRoundState,
  updatedAt: string
): DeliberationRunRecord {
  const existingRounds = run.finalizationRounds ?? [];
  const replaced = existingRounds.some((existingRound) => existingRound.roundId === round.roundId);
  const finalizationRounds = replaced
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
    finalizationRounds,
    updatedAt
  };
}

function createResultFromFinalizationRound(
  run: DeliberationRunRecord,
  round: FinalizationRoundState,
  roundId: string,
  executionStatus: RunFinalizationRoundResult["executionStatus"]
): RunFinalizationRoundResult {
  return {
    run,
    roundId,
    executionStatus,
    finalCandidateResult: round.finalCandidate
      ? {
          sourceId: round.finalCandidate.sourceId,
          sourceType: round.finalCandidate.sourceType,
          status: "skipped",
          proposalEventId: round.finalCandidate.proposalEventId,
          errorCategory: round.finalCandidate.errorCategory,
          safeDiagnostics: round.finalCandidate.safeDiagnostics
        }
      : undefined,
    auditResults: round.auditorStates.map((auditorState) => ({
      auditorId: auditorState.auditorId,
      status: "skipped",
      auditEventId: auditorState.auditEventId,
      errorCategory: auditorState.errorCategory,
      safeDiagnostics: auditorState.safeDiagnostics
    })),
    outcomeCompilation: round.outcomeCompilation
  };
}

function resolveFinalCandidateRuntimeConfig(
  run: DeliberationRunRecord,
  generator: {
    adapterId?: string;
    providerConfigId?: string;
  },
  env: Record<string, string | undefined> | undefined
) {
  if (!generator.providerConfigId) {
    return undefined;
  }

  const providerConfig = run.plan.providerConfigs.find(
    (candidate) => candidate.id === generator.providerConfigId
  );

  if (!providerConfig) {
    throw new RunFinalizationRoundError(
      "provider_config_invalid",
      "Final candidate generator provider config was not found."
    );
  }

  if (generator.adapterId && providerConfig.adapterId !== generator.adapterId) {
    throw new RunFinalizationRoundError(
      "provider_config_invalid",
      "Final candidate generator provider config adapter is invalid."
    );
  }

  return resolveProviderRuntimeConfig({
    providerConfig,
    env
  });
}

function resolveFinalAuditRuntimeConfig(
  run: DeliberationRunRecord,
  auditor: {
    adapterId?: string;
    providerConfigId?: string;
  },
  env: Record<string, string | undefined> | undefined
) {
  if (!auditor.providerConfigId) {
    return undefined;
  }

  const providerConfig = run.plan.providerConfigs.find(
    (candidate) => candidate.id === auditor.providerConfigId
  );

  if (!providerConfig) {
    throw new RunFinalizationRoundError(
      "provider_config_invalid",
      "Final audit generator provider config was not found."
    );
  }

  if (auditor.adapterId && providerConfig.adapterId !== auditor.adapterId) {
    throw new RunFinalizationRoundError(
      "provider_config_invalid",
      "Final audit generator provider config adapter is invalid."
    );
  }

  return resolveProviderRuntimeConfig({
    providerConfig,
    env
  });
}

function getFinalCandidateFailure(error: unknown): {
  errorCategory: FinalizationRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
} {
  return {
    errorCategory: getFinalCandidateErrorCategory(error),
    safeDiagnostics: getSafeFinalizationDiagnostics(error)
  };
}

function getFinalCandidateErrorCategory(error: unknown): FinalizationRunErrorCategory {
  if (error instanceof FinalizationContextError) {
    return "finalization_context_unavailable";
  }

  if (error instanceof ProviderSecretResolutionError) {
    return "provider_secret_missing";
  }

  if (error instanceof FinalizationValidationError) {
    return "final_candidate_validation_failed";
  }

  if (
    error instanceof RunFinalizationRoundError &&
    error.category === "round_conflict"
  ) {
    return "round_conflict";
  }

  if (
    error instanceof RunFinalizationRoundError &&
    error.category === "final_candidate_generator_failed"
  ) {
    return "final_candidate_generator_failed";
  }

  const safeCategory = getSafeFinalizationErrorCategory(error);
  if (safeCategory) {
    return safeCategory;
  }

  return error instanceof RunFinalizationRoundError
    ? (error.category as FinalizationRunErrorCategory)
    : "core_lifecycle_failed";
}

function getFinalAuditFailure(error: unknown): {
  errorCategory: FinalizationRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
} {
  return {
    errorCategory: getFinalAuditErrorCategory(error),
    safeDiagnostics: getSafeFinalizationDiagnostics(error)
  };
}

function getFinalAuditErrorCategory(error: unknown): FinalizationRunErrorCategory {
  if (error instanceof FinalizationContextError) {
    return "finalization_context_unavailable";
  }

  if (error instanceof ProviderSecretResolutionError) {
    return "provider_secret_missing";
  }

  if (error instanceof FinalizationValidationError) {
    return "final_audit_validation_failed";
  }

  if (
    error instanceof RunFinalizationRoundError &&
    error.category === "round_conflict"
  ) {
    return "round_conflict";
  }

  if (
    error instanceof RunFinalizationRoundError &&
    error.category === "final_audit_generator_failed"
  ) {
    return "final_audit_generator_failed";
  }

  const safeCategory = getSafeFinalizationErrorCategory(error);
  if (safeCategory) {
    return safeCategory;
  }

  return error instanceof RunFinalizationRoundError
    ? (error.category as FinalizationRunErrorCategory)
    : "core_lifecycle_failed";
}

function isSafeFinalizationGeneratorFailure(error: unknown): boolean {
  return error instanceof ProviderSecretResolutionError ||
    Boolean(getSafeFinalizationErrorCategory(error));
}

function getSafeFinalizationErrorCategory(
  error: unknown
): FinalizationRunErrorCategory | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const safeCategory = (error as { safeCategory?: unknown }).safeCategory;
  if (typeof safeCategory !== "string") {
    return undefined;
  }

  const parsed = FinalizationRunErrorCategorySchema.safeParse(safeCategory);
  return parsed.success ? parsed.data : undefined;
}

function getSafeFinalizationDiagnostics(error: unknown): RunSafeDiagnostics | undefined {
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

function createFinalizationExecutionClaimOwnerId(
  options: RunFinalizationRoundOptions
): string {
  const ownerId =
    options.executionClaimOwnerIdGenerator?.() ??
    `finalization-claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (ownerId.trim().length === 0) {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round execution claim owner is invalid."
    );
  }

  return ownerId;
}

function getFinalizationExecutionClaimTtlMs(
  run: DeliberationRunRecord,
  options: RunFinalizationRoundOptions
): number {
  const ttlMs =
    options.executionClaimTtlMs ??
    run.plan.timeouts.overallMs ??
    DEFAULT_EXECUTION_CLAIM_TTL_MS;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round execution claim TTL is invalid."
    );
  }

  return ttlMs;
}

function isExecutionClaimExpired(claim: RoundExecutionClaim, now: string): boolean {
  return parseTimestampMs(claim.expiresAt) <= parseTimestampMs(now);
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(parseTimestampMs(timestamp) + milliseconds).toISOString();
}

function parseTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);

  if (Number.isNaN(parsed)) {
    throw new RunFinalizationRoundError(
      "round_conflict",
      "Finalization round execution claim timestamp is invalid."
    );
  }

  return parsed;
}

function getClock(options: RunFinalizationRoundOptions): () => string {
  return options.clock ?? (() => new Date().toISOString());
}

function createFinalCandidateIdempotencyKey(
  runId: string,
  roundId: string,
  sourceId: string
): string {
  return `orchestrator:${runId}:finalization:${roundId}:final-candidate:${sourceId}`;
}

function createFinalAuditIdempotencyKey(
  runId: string,
  roundId: string,
  auditorId: string,
  finalCandidateProposalEventId: string
): string {
  return `orchestrator:${runId}:finalization:${roundId}:audit:${auditorId}:${finalCandidateProposalEventId}`;
}

function collectEventIds(existingIds: readonly string[], newIds: readonly string[]): string[] {
  return [...new Set([...existingIds, ...newIds])];
}
