import { proposeExtraction } from "@deliberum/core";
import {
  CandidateRepairContextError,
  ExtractionGeneratorValidationError,
  ProviderSecretResolutionError,
  RunCandidateRepairRoundError,
  RunStoreNotFoundError
} from "./errors";
import { buildCandidateRepairContext } from "./candidate-repair-context";
import { validateExtractionGeneratorResultForAllowedSourceEventIds } from "./extraction-validation";
import { resolveProviderRuntimeConfig } from "./provider-secret-resolver";
import {
  CandidateRepairRunErrorCategorySchema,
  RunSafeProviderResponseShapeSchema
} from "./types";
import type {
  CandidateRepairContext,
  CandidateRepairGeneratorRoundResult,
  CandidateRepairGeneratorState,
  CandidateRepairRoundState,
  CandidateRepairRunErrorCategory,
  DeliberationRunRecord,
  RoundExecutionClaim,
  RunCandidateRepairRoundInput,
  RunCandidateRepairRoundOptions,
  RunCandidateRepairRoundResult,
  RunSafeDiagnostics
} from "./types";

const DEFAULT_CANDIDATE_REPAIR_ROUND_ID = "initial" as const;
const DEFAULT_EXECUTION_CLAIM_TTL_MS = 5 * 60 * 1000;

type CandidateRepairRoundClaimAcquisition =
  | {
      status: "acquired";
      ownerId: string;
      run: DeliberationRunRecord;
    }
  | {
      status: "already_running";
      run: DeliberationRunRecord;
      round: CandidateRepairRoundState;
    }
  | {
      status: "already_completed";
      run: DeliberationRunRecord;
      round: CandidateRepairRoundState;
    };

export async function runCandidateRepairRound(
  input: RunCandidateRepairRoundInput,
  options: RunCandidateRepairRoundOptions
): Promise<RunCandidateRepairRoundResult> {
  const run = options.runStore.getRun(input.runId);
  if (!run) {
    throw new RunStoreNotFoundError(input.runId);
  }

  const roundId = input.roundId ?? DEFAULT_CANDIDATE_REPAIR_ROUND_ID;
  const generatorIds = resolveGeneratorIds(input, options);
  const context = buildCandidateRepairContext({
    run,
    eventStore: options.eventStore,
    targetCandidateIds: input.targetCandidateIds
  });
  const targetCandidateIds = context.metadata.targetCandidateIds;
  const acquisition = acquireCandidateRepairRoundExecutionClaim(
    input.runId,
    roundId,
    targetCandidateIds,
    generatorIds,
    options
  );

  if (acquisition.status === "already_running") {
    return createResultFromCandidateRepairRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_running"
    );
  }

  if (acquisition.status === "already_completed") {
    return createResultFromCandidateRepairRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_completed"
    );
  }

  try {
    const result = await executeClaimedCandidateRepairRound(
      acquisition.run,
      input,
      options,
      roundId,
      context,
      generatorIds,
      acquisition.ownerId
    );
    const releasedRun = releaseCandidateRepairRoundExecutionClaim(
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
    releaseCandidateRepairRoundExecutionClaim(options, input.runId, roundId, acquisition.ownerId);
    throw error;
  }
}

async function executeClaimedCandidateRepairRound(
  run: DeliberationRunRecord,
  input: RunCandidateRepairRoundInput,
  options: RunCandidateRepairRoundOptions,
  roundId: string,
  context: CandidateRepairContext,
  generatorIds: readonly string[],
  claimOwnerId: string
): Promise<RunCandidateRepairRoundResult> {
  let workingRun = run;

  try {
    assertCandidateRepairRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);
  } catch (error) {
    markCandidateRepairRoundFailed(
      workingRun,
      options,
      roundId,
      context.metadata.targetCandidateIds,
      generatorIds,
      "round_conflict",
      claimOwnerId
    );

    if (error instanceof RunCandidateRepairRoundError) {
      throw error;
    }

    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round execution claim could not be confirmed."
    );
  }

  const existingRound = findCandidateRepairRound(workingRun, roundId);
  const generatorStates = createGeneratorStates(generatorIds, existingRound);
  const generatorsToExecute = getGeneratorsToExecute(
    generatorStates,
    Boolean(input.retryFailedGenerators)
  );
  const startedAt = getClock(options)();

  workingRun = setCandidateRepairRoundState(workingRun, options, {
    roundId,
    targetCandidateIds: context.metadata.targetCandidateIds,
    status: "running",
    generatorStates: markGeneratorsRunning(generatorStates, generatorsToExecute, startedAt),
    proposalEventIds: existingRound?.proposalEventIds ?? [],
    startedAt: existingRound?.startedAt ?? startedAt,
    updatedAt: startedAt
  }, claimOwnerId);

  const proposalResults = await Promise.all(
    generatorIds.map(async (generatorId): Promise<CandidateRepairGeneratorRoundResult> => {
      const state = workingRun.candidateRepairRounds
        ?.find((round) => round.roundId === roundId)
        ?.generatorStates.find((generatorState) => generatorState.generatorId === generatorId);

      if (!generatorsToExecute.includes(generatorId)) {
        return {
          generatorId,
          status: "skipped",
          proposalEventId: state?.proposalEventId,
          errorCategory: state?.errorCategory,
          safeDiagnostics: state?.safeDiagnostics
        };
      }

      return executeCandidateRepairGenerator({
        run: workingRun,
        context,
        generatorId,
        roundId,
        claimOwnerId,
        options
      });
    })
  );

  const updatedRound = findCandidateRepairRound(workingRun, roundId)!;
  const updatedGeneratorStates = mergeGeneratorResults(
    updatedRound.generatorStates,
    proposalResults,
    getClock(options)()
  );
  const proposalEventIds = collectProposalEventIds(
    updatedRound.proposalEventIds,
    proposalResults
  );
  const lastErrorCategory = getLastCandidateRepairErrorCategory(updatedGeneratorStates);
  const hasFailedGenerator = updatedGeneratorStates.some(
    (generatorState) => generatorState.status === "failed"
  );
  const hasPendingGenerator = updatedGeneratorStates.some(
    (generatorState) =>
      generatorState.status === "pending" || generatorState.status === "running"
  );
  const status = hasFailedGenerator || hasPendingGenerator
    ? "waiting_for_generators"
    : "completed";

  const finalRun = setCandidateRepairRoundState(workingRun, options, {
    ...updatedRound,
    status,
    generatorStates: updatedGeneratorStates,
    proposalEventIds,
    lastErrorCategory,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  return {
    run: finalRun,
    roundId,
    executionStatus: "executed",
    proposalResults
  };
}

async function executeCandidateRepairGenerator(input: {
  run: DeliberationRunRecord;
  context: CandidateRepairContext;
  generatorId: string;
  roundId: string;
  claimOwnerId: string;
  options: RunCandidateRepairRoundOptions;
}): Promise<CandidateRepairGeneratorRoundResult> {
  try {
    assertCandidateRepairRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const generator = input.options.candidateRepairGeneratorRegistry.require(input.generatorId);
    const providerRuntimeConfig = resolveCandidateRepairGeneratorRuntimeConfig(
      input.run,
      generator,
      input.options.env
    );
    const generatorResult = await Promise.resolve().then(() =>
      generator.repairCandidate(
        {
          instructions:
            "Prepare traceable candidate repair proposal material for the target accepted active candidates. Return proposal material only.",
          context: structuredClone(input.context)
        },
        structuredClone(input.context),
        providerRuntimeConfig
      )
    );
    const draft = validateExtractionGeneratorResultForAllowedSourceEventIds(
      generatorResult,
      input.context.metadata.allowedSourceEventIds
    );

    assertCandidateRepairRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const proposed = proposeExtraction(
      {
        sessionId: input.run.sessionId,
        authorId: input.generatorId,
        candidates: draft.candidates,
        claims: draft.claims,
        objections: draft.objections,
        evidenceNeeds: draft.evidenceNeeds,
        qualityObligations: draft.qualityObligations,
        rationale: draft.rationale,
        idempotencyKey: createCandidateRepairProposalIdempotencyKey(
          input.run.id,
          input.roundId,
          input.generatorId,
          input.context.metadata.targetCandidateIds
        )
      },
      input.options
    );

    return {
      generatorId: input.generatorId,
      status: "proposed",
      proposalEventId: proposed.proposalEvent.id,
      appended: proposed.appended
    };
  } catch (error) {
    const failure = getCandidateRepairGeneratorFailure(error);

    return {
      generatorId: input.generatorId,
      status: "failed",
      errorCategory: failure.errorCategory,
      safeDiagnostics: failure.safeDiagnostics
    };
  }
}

function resolveGeneratorIds(
  input: RunCandidateRepairRoundInput,
  options: RunCandidateRepairRoundOptions
): string[] {
  const generatorIds = input.generatorIds?.length
    ? [...input.generatorIds]
    : options.candidateRepairGeneratorRegistry.list().map((entry) => entry.generatorId);

  if (generatorIds.length === 0) {
    throw new RunCandidateRepairRoundError(
      "candidate_repair_validation_failed",
      "Candidate repair round requires at least one generator."
    );
  }

  const seen = new Set<string>();
  for (const generatorId of generatorIds) {
    if (seen.has(generatorId)) {
      throw new RunCandidateRepairRoundError(
        "candidate_repair_validation_failed",
        "Candidate repair round contains duplicate generator ids."
      );
    }

    options.candidateRepairGeneratorRegistry.require(generatorId);
    seen.add(generatorId);
  }

  return generatorIds;
}

function createGeneratorStates(
  generatorIds: readonly string[],
  existingRound: CandidateRepairRoundState | undefined
): CandidateRepairGeneratorState[] {
  const existingByGenerator = new Map(
    existingRound?.generatorStates.map((generatorState) => [
      generatorState.generatorId,
      generatorState
    ]) ?? []
  );

  return generatorIds.map((generatorId) => {
    const existing = existingByGenerator.get(generatorId);

    return existing
      ? structuredClone(existing)
      : {
          generatorId,
          status: "pending",
          attempts: 0
        };
  });
}

function getGeneratorsToExecute(
  generatorStates: readonly CandidateRepairGeneratorState[],
  retryFailedGenerators: boolean
): string[] {
  return generatorStates
    .filter((generatorState) => {
      if (generatorState.status === "proposed" && generatorState.proposalEventId) {
        return false;
      }

      if (generatorState.status === "failed" && !retryFailedGenerators) {
        return false;
      }

      return true;
    })
    .map((generatorState) => generatorState.generatorId);
}

function markGeneratorsRunning(
  generatorStates: readonly CandidateRepairGeneratorState[],
  generatorsToExecute: readonly string[],
  startedAt: string
): CandidateRepairGeneratorState[] {
  const generatorsToExecuteSet = new Set(generatorsToExecute);

  return generatorStates.map((generatorState) => {
    if (!generatorsToExecuteSet.has(generatorState.generatorId)) {
      return structuredClone(generatorState);
    }

    return {
      ...generatorState,
      status: "running",
      attempts: generatorState.attempts + 1,
      startedAt,
      completedAt: undefined
    };
  });
}

function mergeGeneratorResults(
  generatorStates: readonly CandidateRepairGeneratorState[],
  proposalResults: readonly CandidateRepairGeneratorRoundResult[],
  completedAt: string
): CandidateRepairGeneratorState[] {
  const resultByGenerator = new Map(
    proposalResults.map((result) => [result.generatorId, result])
  );

  return generatorStates.map((generatorState) => {
    const result = resultByGenerator.get(generatorState.generatorId);

    if (!result || result.status === "skipped") {
      return structuredClone(generatorState);
    }

    const previousErrorCategories = mergePreviousCandidateRepairErrors(
      generatorState,
      result.errorCategory
    );

    return {
      ...generatorState,
      status: result.status,
      proposalEventId: result.proposalEventId,
      errorCategory: result.status === "proposed" ? undefined : result.errorCategory,
      safeDiagnostics: result.status === "proposed" ? undefined : result.safeDiagnostics,
      previousErrorCategories,
      completedAt
    };
  });
}

function mergePreviousCandidateRepairErrors(
  generatorState: CandidateRepairGeneratorState,
  resultErrorCategory: CandidateRepairRunErrorCategory | undefined
): CandidateRepairRunErrorCategory[] | undefined {
  const previous = [...(generatorState.previousErrorCategories ?? [])];

  if (generatorState.errorCategory && generatorState.errorCategory !== resultErrorCategory) {
    previous.push(generatorState.errorCategory);
  }

  return previous.length > 0 ? previous : undefined;
}

function collectProposalEventIds(
  existingProposalEventIds: readonly string[],
  proposalResults: readonly CandidateRepairGeneratorRoundResult[]
): string[] {
  const ids = new Set(existingProposalEventIds);

  for (const result of proposalResults) {
    if (result.proposalEventId) {
      ids.add(result.proposalEventId);
    }
  }

  return [...ids];
}

function getLastCandidateRepairErrorCategory(
  generatorStates: readonly CandidateRepairGeneratorState[]
): CandidateRepairRunErrorCategory | undefined {
  for (let index = generatorStates.length - 1; index >= 0; index -= 1) {
    const generatorState = generatorStates[index];
    if (generatorState?.errorCategory) {
      return generatorState.errorCategory;
    }
  }

  return undefined;
}

function acquireCandidateRepairRoundExecutionClaim(
  runId: string,
  roundId: string,
  targetCandidateIds: readonly string[],
  generatorIds: readonly string[],
  options: RunCandidateRepairRoundOptions
): CandidateRepairRoundClaimAcquisition {
  const acquiredAt = getClock(options)();
  const ownerId = createCandidateRepairExecutionClaimOwnerId(options);
  const acquisitionStatus: {
    current: CandidateRepairRoundClaimAcquisition["status"];
  } = {
    current: "acquired"
  };

  const run = options.runStore.updateRun(runId, (currentRun) => {
    const existingRound = getExistingCandidateRepairRound(currentRun, roundId);

    if (existingRound?.targetCandidateIds !== undefined) {
      assertSameTargetCandidateIds(existingRound, targetCandidateIds);
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

    const generatorStates = createGeneratorStates(generatorIds, existingRound);
    const executionClaim: RoundExecutionClaim = {
      ownerId,
      acquiredAt,
      expiresAt: addMilliseconds(
        acquiredAt,
        getCandidateRepairExecutionClaimTtlMs(currentRun, options)
      ),
      status: "active"
    };
    const round: CandidateRepairRoundState = {
      roundId,
      targetCandidateIds: [...targetCandidateIds],
      status: "running",
      generatorStates,
      proposalEventIds: existingRound?.proposalEventIds ?? [],
      lastErrorCategory: existingRound?.lastErrorCategory,
      executionClaim,
      startedAt: existingRound?.startedAt ?? acquiredAt,
      updatedAt: acquiredAt
    };

    acquisitionStatus.current = "acquired";

    return upsertCandidateRepairRound(currentRun, round, acquiredAt);
  });
  const round = findCandidateRepairRound(run, roundId);

  if (!round) {
    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round claim could not be resolved."
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

function releaseCandidateRepairRoundExecutionClaim(
  options: RunCandidateRepairRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): DeliberationRunRecord {
  return options.runStore.updateRun(runId, (currentRun) => {
    const round = findCandidateRepairRound(currentRun, roundId);

    if (!round || round.executionClaim?.ownerId !== ownerId) {
      return currentRun;
    }

    const releasedRound = structuredClone(round);
    delete releasedRound.executionClaim;

    return upsertCandidateRepairRound(currentRun, releasedRound, getClock(options)());
  });
}

function assertCandidateRepairRoundExecutionClaimOwned(
  options: RunCandidateRepairRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): void {
  const run = options.runStore.getRun(runId);
  const claim = findCandidateRepairRound(run, roundId)?.executionClaim;

  if (!run || claim?.ownerId !== ownerId || claim?.status !== "active") {
    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round execution claim is no longer active."
    );
  }
}

function setCandidateRepairRoundState(
  run: DeliberationRunRecord,
  options: RunCandidateRepairRoundOptions,
  round: CandidateRepairRoundState,
  claimOwnerId?: string
): DeliberationRunRecord {
  return options.runStore.updateRun(run.id, (currentRun) => {
    if (claimOwnerId) {
      assertCurrentCandidateRepairRoundClaimOwner(currentRun, round.roundId, claimOwnerId);
    }

    const existingRound = findCandidateRepairRound(currentRun, round.roundId);
    const existingClaim = existingRound?.executionClaim;
    const nextRound =
      round.executionClaim || !existingClaim
        ? round
        : {
            ...round,
            executionClaim: existingClaim
          };

    return upsertCandidateRepairRound(
      currentRun,
      nextRound,
      nextRound.updatedAt ?? getClock(options)()
    );
  });
}

function markCandidateRepairRoundFailed(
  run: DeliberationRunRecord,
  options: RunCandidateRepairRoundOptions,
  roundId: string,
  targetCandidateIds: readonly string[],
  generatorIds: readonly string[],
  errorCategory: CandidateRepairRunErrorCategory,
  claimOwnerId?: string
): DeliberationRunRecord {
  const timestamp = getClock(options)();
  const existingRound = findCandidateRepairRound(run, roundId);

  return setCandidateRepairRoundState(run, options, {
    roundId,
    targetCandidateIds: [...targetCandidateIds],
    status: "failed",
    generatorStates: createGeneratorStates(generatorIds, existingRound),
    proposalEventIds: existingRound?.proposalEventIds ?? [],
    lastErrorCategory: errorCategory,
    startedAt: existingRound?.startedAt ?? timestamp,
    updatedAt: timestamp
  }, claimOwnerId);
}

function assertCurrentCandidateRepairRoundClaimOwner(
  run: DeliberationRunRecord,
  roundId: string,
  ownerId: string
): void {
  const round = findCandidateRepairRound(run, roundId);

  if (round?.executionClaim?.ownerId !== ownerId) {
    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round execution claim is no longer active."
    );
  }
}

function getExistingCandidateRepairRound(
  run: DeliberationRunRecord,
  roundId: string
): CandidateRepairRoundState | undefined {
  const existingRounds = run.candidateRepairRounds ?? [];
  const existingRound = existingRounds.find((round) => round.roundId === roundId);

  if (existingRound) {
    return structuredClone(existingRound);
  }

  return undefined;
}

function findCandidateRepairRound(
  run: DeliberationRunRecord | undefined,
  roundId: string
): CandidateRepairRoundState | undefined {
  return run?.candidateRepairRounds?.find((round) => round.roundId === roundId);
}

function assertSameTargetCandidateIds(
  existingRound: CandidateRepairRoundState,
  targetCandidateIds: readonly string[]
): void {
  if (stableJoin(existingRound.targetCandidateIds) !== stableJoin(targetCandidateIds)) {
    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round already targets different candidates."
    );
  }
}

function upsertCandidateRepairRound(
  run: DeliberationRunRecord,
  round: CandidateRepairRoundState,
  updatedAt: string
): DeliberationRunRecord {
  const existingRounds = run.candidateRepairRounds ?? [];
  const replaced = existingRounds.some((existingRound) => existingRound.roundId === round.roundId);
  const candidateRepairRounds = replaced
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
    candidateRepairRounds,
    updatedAt
  };
}

function createResultFromCandidateRepairRound(
  run: DeliberationRunRecord,
  round: CandidateRepairRoundState,
  roundId: string,
  executionStatus: RunCandidateRepairRoundResult["executionStatus"]
): RunCandidateRepairRoundResult {
  return {
    run,
    roundId,
    executionStatus,
    proposalResults: round.generatorStates.map((generatorState) => ({
      generatorId: generatorState.generatorId,
      status: "skipped",
      proposalEventId: generatorState.proposalEventId,
      errorCategory: generatorState.errorCategory,
      safeDiagnostics: generatorState.safeDiagnostics
    }))
  };
}

function resolveCandidateRepairGeneratorRuntimeConfig(
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
    throw new RunCandidateRepairRoundError(
      "provider_config_invalid",
      "Candidate repair generator provider config was not found."
    );
  }

  if (generator.adapterId && providerConfig.adapterId !== generator.adapterId) {
    throw new RunCandidateRepairRoundError(
      "provider_config_invalid",
      "Candidate repair generator provider config adapter is invalid."
    );
  }

  return resolveProviderRuntimeConfig({
    providerConfig,
    env
  });
}

function getCandidateRepairGeneratorFailure(error: unknown): {
  errorCategory: CandidateRepairRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
} {
  return {
    errorCategory: getCandidateRepairGeneratorErrorCategory(error),
    safeDiagnostics: getSafeCandidateRepairDiagnostics(error)
  };
}

function getCandidateRepairGeneratorErrorCategory(
  error: unknown
): CandidateRepairRunErrorCategory {
  if (error instanceof CandidateRepairContextError) {
    return "candidate_repair_context_unavailable";
  }

  if (error instanceof ProviderSecretResolutionError) {
    return "provider_secret_missing";
  }

  if (
    error instanceof RunCandidateRepairRoundError &&
    error.category === "round_conflict"
  ) {
    return "round_conflict";
  }

  if (
    error instanceof RunCandidateRepairRoundError &&
    error.category === "candidate_repair_generator_failed"
  ) {
    return "candidate_repair_generator_failed";
  }

  if (error instanceof ExtractionGeneratorValidationError) {
    return "candidate_repair_validation_failed";
  }

  const safeCategory = getSafeCandidateRepairErrorCategory(error);
  if (safeCategory) {
    return safeCategory;
  }

  if (isCoreLifecycleError(error)) {
    return "core_lifecycle_failed";
  }

  return error instanceof RunCandidateRepairRoundError
    ? (error.category as CandidateRepairRunErrorCategory)
    : "candidate_repair_generator_failed";
}

function getSafeCandidateRepairErrorCategory(
  error: unknown
): CandidateRepairRunErrorCategory | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const safeCategory = (error as { safeCategory?: unknown }).safeCategory;
  if (typeof safeCategory !== "string") {
    return undefined;
  }

  const parsed = CandidateRepairRunErrorCategorySchema.safeParse(safeCategory);
  return parsed.success ? parsed.data : undefined;
}

function getSafeCandidateRepairDiagnostics(error: unknown): RunSafeDiagnostics | undefined {
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

function isCoreLifecycleError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const name = (error as { name?: unknown }).name;
  return (
    name === "InvalidExtractionProposalInputError" ||
    name === "ExtractionSourceEventNotFoundError" ||
    name === "MissingSessionDependencyError"
  );
}

function createCandidateRepairExecutionClaimOwnerId(
  options: RunCandidateRepairRoundOptions
): string {
  const ownerId =
    options.executionClaimOwnerIdGenerator?.() ??
    `candidate-repair-claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (ownerId.trim().length === 0) {
    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round execution claim owner is invalid."
    );
  }

  return ownerId;
}

function getCandidateRepairExecutionClaimTtlMs(
  run: DeliberationRunRecord,
  options: RunCandidateRepairRoundOptions
): number {
  const ttlMs =
    options.executionClaimTtlMs ??
    run.plan.timeouts.overallMs ??
    DEFAULT_EXECUTION_CLAIM_TTL_MS;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round execution claim TTL is invalid."
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
    throw new RunCandidateRepairRoundError(
      "round_conflict",
      "Candidate repair round execution claim timestamp is invalid."
    );
  }

  return parsed;
}

function getClock(options: RunCandidateRepairRoundOptions): () => string {
  return options.clock ?? (() => new Date().toISOString());
}

function createCandidateRepairProposalIdempotencyKey(
  runId: string,
  roundId: string,
  generatorId: string,
  targetCandidateIds: readonly string[]
): string {
  return `orchestrator:${runId}:candidate-repair:${roundId}:proposal:${generatorId}:${stableJoin(targetCandidateIds)}`;
}

function stableJoin(values: readonly string[]): string {
  return [...values].sort().join(",");
}
