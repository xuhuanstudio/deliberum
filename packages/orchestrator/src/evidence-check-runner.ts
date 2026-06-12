import { recordEvidenceResult } from "@deliberum/core";
import {
  EvidenceCheckContextError,
  EvidenceCheckValidationError,
  ProviderSecretResolutionError,
  RunEvidenceCheckRoundError,
  RunStoreNotFoundError
} from "./errors";
import { buildEvidenceCheckContext } from "./evidence-check-context";
import { validateEvidenceCheckGeneratorResult } from "./evidence-check-validation";
import { resolveProviderRuntimeConfig } from "./provider-secret-resolver";
import {
  EvidenceCheckRunErrorCategorySchema,
  RunSafeProviderResponseShapeSchema
} from "./types";
import type {
  DeliberationRunRecord,
  EvidenceCheckContext,
  EvidenceCheckGeneratorRoundResult,
  EvidenceCheckGeneratorState,
  EvidenceCheckRoundState,
  EvidenceCheckRunErrorCategory,
  RoundExecutionClaim,
  RunEvidenceCheckRoundInput,
  RunEvidenceCheckRoundOptions,
  RunEvidenceCheckRoundResult,
  RunSafeDiagnostics
} from "./types";

const DEFAULT_EVIDENCE_CHECK_ROUND_ID = "initial" as const;
const DEFAULT_EXECUTION_CLAIM_TTL_MS = 5 * 60 * 1000;

type EvidenceCheckRoundClaimAcquisition =
  | {
      status: "acquired";
      ownerId: string;
      run: DeliberationRunRecord;
    }
  | {
      status: "already_running";
      run: DeliberationRunRecord;
      round: EvidenceCheckRoundState;
    }
  | {
      status: "already_completed";
      run: DeliberationRunRecord;
      round: EvidenceCheckRoundState;
    };

export async function runEvidenceCheckRound(
  input: RunEvidenceCheckRoundInput,
  options: RunEvidenceCheckRoundOptions
): Promise<RunEvidenceCheckRoundResult> {
  const run = options.runStore.getRun(input.runId);
  if (!run) {
    throw new RunStoreNotFoundError(input.runId);
  }

  const roundId = input.roundId ?? DEFAULT_EVIDENCE_CHECK_ROUND_ID;
  const generatorIds = resolveGeneratorIds(input, options);
  const context = buildEvidenceCheckContext({
    run,
    eventStore: options.eventStore,
    targetEvidenceNeedIds: input.targetEvidenceNeedIds
  });
  const targetEvidenceNeedIds = context.metadata.targetEvidenceNeedIds;
  const acquisition = acquireEvidenceCheckRoundExecutionClaim(
    input.runId,
    roundId,
    targetEvidenceNeedIds,
    generatorIds,
    options
  );

  if (acquisition.status === "already_running") {
    return createResultFromEvidenceCheckRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_running"
    );
  }

  if (acquisition.status === "already_completed") {
    return createResultFromEvidenceCheckRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_completed"
    );
  }

  try {
    const result = await executeClaimedEvidenceCheckRound(
      acquisition.run,
      input,
      options,
      roundId,
      context,
      generatorIds,
      acquisition.ownerId
    );
    const releasedRun = releaseEvidenceCheckRoundExecutionClaim(
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
    releaseEvidenceCheckRoundExecutionClaim(options, input.runId, roundId, acquisition.ownerId);
    throw error;
  }
}

async function executeClaimedEvidenceCheckRound(
  run: DeliberationRunRecord,
  input: RunEvidenceCheckRoundInput,
  options: RunEvidenceCheckRoundOptions,
  roundId: string,
  context: EvidenceCheckContext,
  generatorIds: readonly string[],
  claimOwnerId: string
): Promise<RunEvidenceCheckRoundResult> {
  let workingRun = run;

  try {
    assertEvidenceCheckRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);
  } catch (error) {
    markEvidenceCheckRoundFailed(
      workingRun,
      options,
      roundId,
      context.metadata.targetEvidenceNeedIds,
      generatorIds,
      "round_conflict",
      claimOwnerId
    );

    if (error instanceof RunEvidenceCheckRoundError) {
      throw error;
    }

    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round execution claim could not be confirmed."
    );
  }

  const existingRound = findEvidenceCheckRound(workingRun, roundId);
  const generatorStates = createGeneratorStates(generatorIds, existingRound);
  const generatorsToExecute = getGeneratorsToExecute(
    generatorStates,
    Boolean(input.retryFailedGenerators)
  );
  const startedAt = getClock(options)();

  workingRun = setEvidenceCheckRoundState(workingRun, options, {
    roundId,
    targetEvidenceNeedIds: context.metadata.targetEvidenceNeedIds,
    status: "running",
    generatorStates: markGeneratorsRunning(generatorStates, generatorsToExecute, startedAt),
    evidenceResultEventIds: existingRound?.evidenceResultEventIds ?? [],
    startedAt: existingRound?.startedAt ?? startedAt,
    updatedAt: startedAt
  }, claimOwnerId);

  const evidenceResults = await Promise.all(
    generatorIds.map(async (generatorId): Promise<EvidenceCheckGeneratorRoundResult> => {
      const state = workingRun.evidenceCheckRounds
        ?.find((round) => round.roundId === roundId)
        ?.generatorStates.find((generatorState) => generatorState.generatorId === generatorId);

      if (!generatorsToExecute.includes(generatorId)) {
        return {
          generatorId,
          status: "skipped",
          evidenceResultEventIds: state?.evidenceResultEventIds,
          errorCategory: state?.errorCategory,
          safeDiagnostics: state?.safeDiagnostics
        };
      }

      return executeEvidenceCheckGenerator({
        run: workingRun,
        context,
        generatorId,
        roundId,
        claimOwnerId,
        options
      });
    })
  );

  const updatedRound = findEvidenceCheckRound(workingRun, roundId)!;
  const updatedGeneratorStates = mergeGeneratorResults(
    updatedRound.generatorStates,
    evidenceResults,
    getClock(options)()
  );
  const evidenceResultEventIds = collectEvidenceResultEventIds(
    updatedRound.evidenceResultEventIds,
    evidenceResults
  );
  const lastErrorCategory = getLastEvidenceCheckErrorCategory(updatedGeneratorStates);
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

  const finalRun = setEvidenceCheckRoundState(workingRun, options, {
    ...updatedRound,
    status,
    generatorStates: updatedGeneratorStates,
    evidenceResultEventIds,
    lastErrorCategory,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  return {
    run: finalRun,
    roundId,
    executionStatus: "executed",
    evidenceResults
  };
}

async function executeEvidenceCheckGenerator(input: {
  run: DeliberationRunRecord;
  context: EvidenceCheckContext;
  generatorId: string;
  roundId: string;
  claimOwnerId: string;
  options: RunEvidenceCheckRoundOptions;
}): Promise<EvidenceCheckGeneratorRoundResult> {
  try {
    assertEvidenceCheckRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const generator = input.options.evidenceCheckGeneratorRegistry.require(input.generatorId);
    const providerRuntimeConfig = resolveEvidenceCheckGeneratorRuntimeConfig(
      input.run,
      generator,
      input.options.env
    );
    const generatorResult = await Promise.resolve().then(() =>
      generator.checkEvidence(
        {
          instructions:
            "Record reported evidence results for the target accepted evidence needs. Do not claim verification unless the source and limitations support it.",
          context: structuredClone(input.context)
        },
        structuredClone(input.context),
        providerRuntimeConfig
      )
    );
    const draft = validateEvidenceCheckGeneratorResult(generatorResult, input.context);
    const evidenceResultEventIds: string[] = [];
    let appended = false;

    for (const evidenceResult of draft.results) {
      assertEvidenceCheckRoundExecutionClaimOwned(
        input.options,
        input.run.id,
        input.roundId,
        input.claimOwnerId
      );

      const recorded = recordEvidenceResult(
        {
          sessionId: input.run.sessionId,
          evidenceNeedId: evidenceResult.evidenceNeedId,
          authorId: input.generatorId,
          source: evidenceResult.source,
          summary: evidenceResult.summary,
          resourceIds: evidenceResult.resourceIds,
          limitations: evidenceResult.limitations,
          challengedBy: evidenceResult.challengedBy,
          idempotencyKey: createEvidenceResultIdempotencyKey(
            input.run.id,
            input.roundId,
            input.generatorId,
            evidenceResult.evidenceNeedId
          )
        },
        input.options
      );

      evidenceResultEventIds.push(recorded.evidenceResultEvent.id);
      appended = appended || recorded.appended;
    }

    return {
      generatorId: input.generatorId,
      status: "recorded",
      evidenceResultEventIds,
      appended
    };
  } catch (error) {
    const failure = getEvidenceCheckGeneratorFailure(error);

    return {
      generatorId: input.generatorId,
      status: "failed",
      errorCategory: failure.errorCategory,
      safeDiagnostics: failure.safeDiagnostics
    };
  }
}

function resolveGeneratorIds(
  input: RunEvidenceCheckRoundInput,
  options: RunEvidenceCheckRoundOptions
): string[] {
  const generatorIds = input.generatorIds?.length
    ? [...input.generatorIds]
    : options.evidenceCheckGeneratorRegistry.list().map((entry) => entry.generatorId);

  if (generatorIds.length === 0) {
    throw new RunEvidenceCheckRoundError(
      "evidence_check_validation_failed",
      "Evidence check round requires at least one generator."
    );
  }

  const seen = new Set<string>();
  for (const generatorId of generatorIds) {
    if (seen.has(generatorId)) {
      throw new RunEvidenceCheckRoundError(
        "evidence_check_validation_failed",
        "Evidence check round contains duplicate generator ids."
      );
    }

    options.evidenceCheckGeneratorRegistry.require(generatorId);
    seen.add(generatorId);
  }

  return generatorIds;
}

function createGeneratorStates(
  generatorIds: readonly string[],
  existingRound: EvidenceCheckRoundState | undefined
): EvidenceCheckGeneratorState[] {
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
  generatorStates: readonly EvidenceCheckGeneratorState[],
  retryFailedGenerators: boolean
): string[] {
  return generatorStates
    .filter((generatorState) => {
      if (generatorState.status === "recorded" && generatorState.evidenceResultEventIds?.length) {
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
  generatorStates: readonly EvidenceCheckGeneratorState[],
  generatorsToExecute: readonly string[],
  startedAt: string
): EvidenceCheckGeneratorState[] {
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
  generatorStates: readonly EvidenceCheckGeneratorState[],
  evidenceResults: readonly EvidenceCheckGeneratorRoundResult[],
  completedAt: string
): EvidenceCheckGeneratorState[] {
  const resultByGenerator = new Map(
    evidenceResults.map((result) => [result.generatorId, result])
  );

  return generatorStates.map((generatorState) => {
    const result = resultByGenerator.get(generatorState.generatorId);

    if (!result || result.status === "skipped") {
      return structuredClone(generatorState);
    }

    const previousErrorCategories = mergePreviousEvidenceCheckErrors(
      generatorState,
      result.errorCategory
    );

    return {
      ...generatorState,
      status: result.status,
      evidenceResultEventIds: result.evidenceResultEventIds,
      errorCategory: result.status === "recorded" ? undefined : result.errorCategory,
      safeDiagnostics: result.status === "recorded" ? undefined : result.safeDiagnostics,
      previousErrorCategories,
      completedAt
    };
  });
}

function mergePreviousEvidenceCheckErrors(
  generatorState: EvidenceCheckGeneratorState,
  resultErrorCategory: EvidenceCheckRunErrorCategory | undefined
): EvidenceCheckRunErrorCategory[] | undefined {
  const previous = [...(generatorState.previousErrorCategories ?? [])];

  if (generatorState.errorCategory && generatorState.errorCategory !== resultErrorCategory) {
    previous.push(generatorState.errorCategory);
  }

  return previous.length > 0 ? previous : undefined;
}

function collectEvidenceResultEventIds(
  existingEvidenceResultEventIds: readonly string[],
  evidenceResults: readonly EvidenceCheckGeneratorRoundResult[]
): string[] {
  const ids = new Set(existingEvidenceResultEventIds);

  for (const result of evidenceResults) {
    for (const eventId of result.evidenceResultEventIds ?? []) {
      ids.add(eventId);
    }
  }

  return [...ids];
}

function getLastEvidenceCheckErrorCategory(
  generatorStates: readonly EvidenceCheckGeneratorState[]
): EvidenceCheckRunErrorCategory | undefined {
  for (let index = generatorStates.length - 1; index >= 0; index -= 1) {
    const generatorState = generatorStates[index];
    if (generatorState?.errorCategory) {
      return generatorState.errorCategory;
    }
  }

  return undefined;
}

function acquireEvidenceCheckRoundExecutionClaim(
  runId: string,
  roundId: string,
  targetEvidenceNeedIds: readonly string[],
  generatorIds: readonly string[],
  options: RunEvidenceCheckRoundOptions
): EvidenceCheckRoundClaimAcquisition {
  const acquiredAt = getClock(options)();
  const ownerId = createEvidenceCheckExecutionClaimOwnerId(options);
  const acquisitionStatus: {
    current: EvidenceCheckRoundClaimAcquisition["status"];
  } = {
    current: "acquired"
  };

  const run = options.runStore.updateRun(runId, (currentRun) => {
    const existingRound = getExistingEvidenceCheckRound(currentRun, roundId);

    if (existingRound?.targetEvidenceNeedIds !== undefined) {
      assertSameTargetEvidenceNeedIds(existingRound, targetEvidenceNeedIds);
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
        getEvidenceCheckExecutionClaimTtlMs(currentRun, options)
      ),
      status: "active"
    };
    const round: EvidenceCheckRoundState = {
      roundId,
      targetEvidenceNeedIds: [...targetEvidenceNeedIds],
      status: "running",
      generatorStates,
      evidenceResultEventIds: existingRound?.evidenceResultEventIds ?? [],
      lastErrorCategory: existingRound?.lastErrorCategory,
      executionClaim,
      startedAt: existingRound?.startedAt ?? acquiredAt,
      updatedAt: acquiredAt
    };

    acquisitionStatus.current = "acquired";

    return upsertEvidenceCheckRound(currentRun, round, acquiredAt);
  });
  const round = findEvidenceCheckRound(run, roundId);

  if (!round) {
    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round claim could not be resolved."
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

function releaseEvidenceCheckRoundExecutionClaim(
  options: RunEvidenceCheckRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): DeliberationRunRecord {
  return options.runStore.updateRun(runId, (currentRun) => {
    const round = findEvidenceCheckRound(currentRun, roundId);

    if (!round || round.executionClaim?.ownerId !== ownerId) {
      return currentRun;
    }

    const releasedRound = structuredClone(round);
    delete releasedRound.executionClaim;

    return upsertEvidenceCheckRound(currentRun, releasedRound, getClock(options)());
  });
}

function assertEvidenceCheckRoundExecutionClaimOwned(
  options: RunEvidenceCheckRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): void {
  const run = options.runStore.getRun(runId);
  const claim = findEvidenceCheckRound(run, roundId)?.executionClaim;

  if (!run || claim?.ownerId !== ownerId || claim?.status !== "active") {
    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round execution claim is no longer active."
    );
  }
}

function setEvidenceCheckRoundState(
  run: DeliberationRunRecord,
  options: RunEvidenceCheckRoundOptions,
  round: EvidenceCheckRoundState,
  claimOwnerId?: string
): DeliberationRunRecord {
  return options.runStore.updateRun(run.id, (currentRun) => {
    if (claimOwnerId) {
      assertCurrentEvidenceCheckRoundClaimOwner(currentRun, round.roundId, claimOwnerId);
    }

    const existingRound = findEvidenceCheckRound(currentRun, round.roundId);
    const existingClaim = existingRound?.executionClaim;
    const nextRound =
      round.executionClaim || !existingClaim
        ? round
        : {
            ...round,
            executionClaim: existingClaim
          };

    return upsertEvidenceCheckRound(
      currentRun,
      nextRound,
      nextRound.updatedAt ?? getClock(options)()
    );
  });
}

function markEvidenceCheckRoundFailed(
  run: DeliberationRunRecord,
  options: RunEvidenceCheckRoundOptions,
  roundId: string,
  targetEvidenceNeedIds: readonly string[],
  generatorIds: readonly string[],
  errorCategory: EvidenceCheckRunErrorCategory,
  claimOwnerId?: string
): DeliberationRunRecord {
  const timestamp = getClock(options)();
  const existingRound = findEvidenceCheckRound(run, roundId);

  return setEvidenceCheckRoundState(run, options, {
    roundId,
    targetEvidenceNeedIds: [...targetEvidenceNeedIds],
    status: "failed",
    generatorStates: createGeneratorStates(generatorIds, existingRound),
    evidenceResultEventIds: existingRound?.evidenceResultEventIds ?? [],
    lastErrorCategory: errorCategory,
    startedAt: existingRound?.startedAt ?? timestamp,
    updatedAt: timestamp
  }, claimOwnerId);
}

function assertCurrentEvidenceCheckRoundClaimOwner(
  run: DeliberationRunRecord,
  roundId: string,
  ownerId: string
): void {
  const round = findEvidenceCheckRound(run, roundId);

  if (round?.executionClaim?.ownerId !== ownerId) {
    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round execution claim is no longer active."
    );
  }
}

function getExistingEvidenceCheckRound(
  run: DeliberationRunRecord,
  roundId: string
): EvidenceCheckRoundState | undefined {
  const existingRounds = run.evidenceCheckRounds ?? [];
  const existingRound = existingRounds.find((round) => round.roundId === roundId);

  if (existingRound) {
    return structuredClone(existingRound);
  }

  return undefined;
}

function findEvidenceCheckRound(
  run: DeliberationRunRecord | undefined,
  roundId: string
): EvidenceCheckRoundState | undefined {
  return run?.evidenceCheckRounds?.find((round) => round.roundId === roundId);
}

function assertSameTargetEvidenceNeedIds(
  existingRound: EvidenceCheckRoundState,
  targetEvidenceNeedIds: readonly string[]
): void {
  if (stableJoin(existingRound.targetEvidenceNeedIds) !== stableJoin(targetEvidenceNeedIds)) {
    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round already targets different evidence needs."
    );
  }
}

function upsertEvidenceCheckRound(
  run: DeliberationRunRecord,
  round: EvidenceCheckRoundState,
  updatedAt: string
): DeliberationRunRecord {
  const existingRounds = run.evidenceCheckRounds ?? [];
  const replaced = existingRounds.some((existingRound) => existingRound.roundId === round.roundId);
  const evidenceCheckRounds = replaced
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
    evidenceCheckRounds,
    updatedAt
  };
}

function createResultFromEvidenceCheckRound(
  run: DeliberationRunRecord,
  round: EvidenceCheckRoundState,
  roundId: string,
  executionStatus: RunEvidenceCheckRoundResult["executionStatus"]
): RunEvidenceCheckRoundResult {
  return {
    run,
    roundId,
    executionStatus,
    evidenceResults: round.generatorStates.map((generatorState) => ({
      generatorId: generatorState.generatorId,
      status: "skipped",
      evidenceResultEventIds: generatorState.evidenceResultEventIds,
      errorCategory: generatorState.errorCategory,
      safeDiagnostics: generatorState.safeDiagnostics
    }))
  };
}

function resolveEvidenceCheckGeneratorRuntimeConfig(
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
    throw new RunEvidenceCheckRoundError(
      "provider_config_invalid",
      "Evidence check generator provider config was not found."
    );
  }

  if (generator.adapterId && providerConfig.adapterId !== generator.adapterId) {
    throw new RunEvidenceCheckRoundError(
      "provider_config_invalid",
      "Evidence check generator provider config adapter is invalid."
    );
  }

  return resolveProviderRuntimeConfig({
    providerConfig,
    env
  });
}

function getEvidenceCheckGeneratorFailure(error: unknown): {
  errorCategory: EvidenceCheckRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
} {
  return {
    errorCategory: getEvidenceCheckGeneratorErrorCategory(error),
    safeDiagnostics: getSafeEvidenceCheckDiagnostics(error)
  };
}

function getEvidenceCheckGeneratorErrorCategory(error: unknown): EvidenceCheckRunErrorCategory {
  if (error instanceof EvidenceCheckContextError) {
    return "evidence_check_context_unavailable";
  }

  if (error instanceof ProviderSecretResolutionError) {
    return "provider_secret_missing";
  }

  if (
    error instanceof RunEvidenceCheckRoundError &&
    error.category === "round_conflict"
  ) {
    return "round_conflict";
  }

  if (
    error instanceof RunEvidenceCheckRoundError &&
    error.category === "evidence_check_generator_failed"
  ) {
    return "evidence_check_generator_failed";
  }

  if (error instanceof EvidenceCheckValidationError) {
    return "evidence_check_validation_failed";
  }

  const safeCategory = getSafeEvidenceCheckErrorCategory(error);
  if (safeCategory) {
    return safeCategory;
  }

  if (isCoreLifecycleError(error)) {
    return "core_lifecycle_failed";
  }

  return error instanceof RunEvidenceCheckRoundError
    ? (error.category as EvidenceCheckRunErrorCategory)
    : "evidence_check_generator_failed";
}

function getSafeEvidenceCheckErrorCategory(
  error: unknown
): EvidenceCheckRunErrorCategory | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const safeCategory = (error as { safeCategory?: unknown }).safeCategory;
  if (typeof safeCategory !== "string") {
    return undefined;
  }

  const parsed = EvidenceCheckRunErrorCategorySchema.safeParse(safeCategory);
  return parsed.success ? parsed.data : undefined;
}

function getSafeEvidenceCheckDiagnostics(error: unknown): RunSafeDiagnostics | undefined {
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
  return name === "EvidenceNeedNotFoundError" || name === "InvalidEvidenceResultInputError";
}

function createEvidenceCheckExecutionClaimOwnerId(
  options: RunEvidenceCheckRoundOptions
): string {
  const ownerId =
    options.executionClaimOwnerIdGenerator?.() ??
    `evidence-check-claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (ownerId.trim().length === 0) {
    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round execution claim owner is invalid."
    );
  }

  return ownerId;
}

function getEvidenceCheckExecutionClaimTtlMs(
  run: DeliberationRunRecord,
  options: RunEvidenceCheckRoundOptions
): number {
  const ttlMs =
    options.executionClaimTtlMs ??
    run.plan.timeouts.overallMs ??
    DEFAULT_EXECUTION_CLAIM_TTL_MS;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round execution claim TTL is invalid."
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
    throw new RunEvidenceCheckRoundError(
      "round_conflict",
      "Evidence check round execution claim timestamp is invalid."
    );
  }

  return parsed;
}

function getClock(options: RunEvidenceCheckRoundOptions): () => string {
  return options.clock ?? (() => new Date().toISOString());
}

function createEvidenceResultIdempotencyKey(
  runId: string,
  roundId: string,
  generatorId: string,
  evidenceNeedId: string
): string {
  return `orchestrator:${runId}:evidence-check:${roundId}:result:${generatorId}:${evidenceNeedId}`;
}

function stableJoin(values: readonly string[]): string {
  return [...values].sort().join(",");
}
