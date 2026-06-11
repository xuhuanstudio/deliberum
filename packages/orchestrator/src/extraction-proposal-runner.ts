import { proposeExtraction } from "@deliberum/core";
import {
  ExtractionContextError,
  ExtractionGeneratorValidationError,
  ProviderSecretResolutionError,
  RunStoreNotFoundError,
  RunExtractionProposalRoundError
} from "./errors";
import { buildExtractionContext } from "./extraction-context";
import { validateExtractionGeneratorResult } from "./extraction-validation";
import { resolveProviderRuntimeConfig } from "./provider-secret-resolver";
import {
  ExtractionRunErrorCategorySchema,
  RunSafeProviderResponseShapeSchema
} from "./types";
import type {
  DeliberationRunRecord,
  ExtractionContext,
  ExtractionGeneratorRoundResult,
  ExtractionGeneratorState,
  ExtractionRoundState,
  RoundExecutionClaim,
  RunExtractionProposalRoundInput,
  RunExtractionProposalRoundOptions,
  RunExtractionProposalRoundResult,
  ExtractionRunErrorCategory,
  RunSafeDiagnostics
} from "./types";

const DEFAULT_EXTRACTION_ROUND_ID = "initial" as const;
const DEFAULT_EXECUTION_CLAIM_TTL_MS = 5 * 60 * 1000;

type ExtractionRoundClaimAcquisition =
  | {
      status: "acquired";
      ownerId: string;
      run: DeliberationRunRecord;
    }
  | {
      status: "already_running";
      run: DeliberationRunRecord;
      round: ExtractionRoundState;
    }
  | {
      status: "already_completed";
      run: DeliberationRunRecord;
      round: ExtractionRoundState;
    };

export async function runExtractionProposalRound(
  input: RunExtractionProposalRoundInput,
  options: RunExtractionProposalRoundOptions
): Promise<RunExtractionProposalRoundResult> {
  if (!options.runStore.getRun(input.runId)) {
    throw new RunStoreNotFoundError(input.runId);
  }

  const roundId = input.roundId ?? DEFAULT_EXTRACTION_ROUND_ID;
  const generatorIds = resolveGeneratorIds(input, options);
  const sourceSealedDivergenceRoundId = resolveSourceSealedDivergenceRoundId(
    input,
    options.runStore.getRun(input.runId)
  );
  const acquisition = acquireExtractionRoundExecutionClaim(
    input.runId,
    roundId,
    sourceSealedDivergenceRoundId,
    generatorIds,
    options
  );

  if (acquisition.status === "already_running") {
    return createResultFromExtractionRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_running"
    );
  }

  if (acquisition.status === "already_completed") {
    return createResultFromExtractionRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_completed"
    );
  }

  try {
    const result = await executeClaimedExtractionRound(
      acquisition.run,
      input,
      options,
      roundId,
      sourceSealedDivergenceRoundId,
      generatorIds,
      acquisition.ownerId
    );
    const releasedRun = releaseExtractionRoundExecutionClaim(
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
    releaseExtractionRoundExecutionClaim(options, input.runId, roundId, acquisition.ownerId);
    throw error;
  }
}

async function executeClaimedExtractionRound(
  run: DeliberationRunRecord,
  input: RunExtractionProposalRoundInput,
  options: RunExtractionProposalRoundOptions,
  roundId: string,
  sourceSealedDivergenceRoundId: string,
  generatorIds: readonly string[],
  claimOwnerId: string
): Promise<RunExtractionProposalRoundResult> {
  let workingRun = run;
  let context: ExtractionContext;

  try {
    assertExtractionRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);
    context = buildExtractionContext({
      run: workingRun,
      eventStore: options.eventStore,
      sealedDivergenceRoundId: sourceSealedDivergenceRoundId
    });
  } catch (error) {
    markExtractionRoundFailed(
      workingRun,
      options,
      roundId,
      sourceSealedDivergenceRoundId,
      generatorIds,
      "extraction_context_unavailable",
      claimOwnerId
    );

    if (error instanceof RunExtractionProposalRoundError) {
      throw error;
    }

    throw new RunExtractionProposalRoundError(
      "extraction_context_unavailable",
      "Extraction context could not be built from the revealed round."
    );
  }

  const existingRound = findExtractionRound(workingRun, roundId);
  const generatorStates = createGeneratorStates(generatorIds, existingRound);
  const generatorsToExecute = getGeneratorsToExecute(
    generatorStates,
    Boolean(input.retryFailedGenerators)
  );
  const startedAt = getClock(options)();

  workingRun = setExtractionRoundState(workingRun, options, {
    roundId,
    sourceSealedDivergenceRoundId,
    status: "running",
    generatorStates: markGeneratorsRunning(generatorStates, generatorsToExecute, startedAt),
    proposalEventIds: existingRound?.proposalEventIds ?? [],
    startedAt: existingRound?.startedAt ?? startedAt,
    updatedAt: startedAt
  }, claimOwnerId);

  const proposalResults = await Promise.all(
    generatorIds.map(async (generatorId): Promise<ExtractionGeneratorRoundResult> => {
      const state = workingRun.extractionRounds
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

      return executeExtractionGenerator({
        run: workingRun,
        context,
        generatorId,
        roundId,
        claimOwnerId,
        options
      });
    })
  );

  const updatedRound = findExtractionRound(workingRun, roundId)!;
  const updatedGeneratorStates = mergeGeneratorResults(
    updatedRound.generatorStates,
    proposalResults,
    getClock(options)()
  );
  const proposalEventIds = collectProposalEventIds(
    updatedRound.proposalEventIds,
    proposalResults
  );
  const lastErrorCategory = getLastExtractionErrorCategory(updatedGeneratorStates);
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

  const finalRun = setExtractionRoundState(workingRun, options, {
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

async function executeExtractionGenerator(input: {
  run: DeliberationRunRecord;
  context: ExtractionContext;
  generatorId: string;
  roundId: string;
  claimOwnerId: string;
  options: RunExtractionProposalRoundOptions;
}): Promise<ExtractionGeneratorRoundResult> {
  try {
    assertExtractionRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const generator = input.options.extractionGeneratorRegistry.require(input.generatorId);
    const providerRuntimeConfig = resolveExtractionGeneratorRuntimeConfig(
      input.run,
      generator,
      input.options.env
    );
    const generatorResult = await Promise.resolve().then(() =>
      generator.generateExtractionProposal(
        {
          instructions:
            "Prepare a traceable extraction proposal draft from the revealed deliberation contributions. Return proposal material only.",
          context: structuredClone(input.context)
        },
        structuredClone(input.context),
        providerRuntimeConfig
      )
    );
    const draft = validateExtractionGeneratorResult(generatorResult, input.context);

    assertExtractionRoundExecutionClaimOwned(
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
        idempotencyKey: createExtractionProposalIdempotencyKey(
          input.run.id,
          input.roundId,
          input.generatorId
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
    const failure = getExtractionGeneratorFailure(error);

    return {
      generatorId: input.generatorId,
      status: "failed",
      errorCategory: failure.errorCategory,
      safeDiagnostics: failure.safeDiagnostics
    };
  }
}

function resolveGeneratorIds(
  input: RunExtractionProposalRoundInput,
  options: RunExtractionProposalRoundOptions
): string[] {
  const generatorIds = input.generatorIds?.length
    ? [...input.generatorIds]
    : options.extractionGeneratorRegistry.list().map((entry) => entry.generatorId);

  if (generatorIds.length === 0) {
    throw new RunExtractionProposalRoundError(
      "extraction_validation_failed",
      "Extraction proposal round requires at least one generator."
    );
  }

  const seen = new Set<string>();
  for (const generatorId of generatorIds) {
    if (seen.has(generatorId)) {
      throw new RunExtractionProposalRoundError(
        "extraction_validation_failed",
        "Extraction proposal round contains duplicate generator ids."
      );
    }

    options.extractionGeneratorRegistry.require(generatorId);
    seen.add(generatorId);
  }

  return generatorIds;
}

function resolveSourceSealedDivergenceRoundId(
  input: RunExtractionProposalRoundInput,
  run: DeliberationRunRecord | undefined
): string {
  const roundId = input.sealedDivergenceRoundId ?? run?.sealedDivergenceRound?.roundId;

  if (!roundId) {
    throw new RunExtractionProposalRoundError(
      "extraction_context_unavailable",
      "Extraction source sealed divergence round was not found."
    );
  }

  return roundId;
}

function createGeneratorStates(
  generatorIds: readonly string[],
  existingRound: ExtractionRoundState | undefined
): ExtractionGeneratorState[] {
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
  generatorStates: readonly ExtractionGeneratorState[],
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
  generatorStates: readonly ExtractionGeneratorState[],
  generatorsToExecute: readonly string[],
  startedAt: string
): ExtractionGeneratorState[] {
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
  generatorStates: readonly ExtractionGeneratorState[],
  proposalResults: readonly ExtractionGeneratorRoundResult[],
  completedAt: string
): ExtractionGeneratorState[] {
  const resultByGenerator = new Map(
    proposalResults.map((result) => [result.generatorId, result])
  );

  return generatorStates.map((generatorState) => {
    const result = resultByGenerator.get(generatorState.generatorId);

    if (!result || result.status === "skipped") {
      return structuredClone(generatorState);
    }

    const previousErrorCategories = mergePreviousExtractionErrors(
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

function mergePreviousExtractionErrors(
  generatorState: ExtractionGeneratorState,
  resultErrorCategory: ExtractionRunErrorCategory | undefined
): ExtractionRunErrorCategory[] | undefined {
  const previous = [...(generatorState.previousErrorCategories ?? [])];

  if (generatorState.errorCategory && generatorState.errorCategory !== resultErrorCategory) {
    previous.push(generatorState.errorCategory);
  }

  return previous.length > 0 ? previous : undefined;
}

function collectProposalEventIds(
  existingProposalEventIds: readonly string[],
  proposalResults: readonly ExtractionGeneratorRoundResult[]
): string[] {
  const ids = new Set(existingProposalEventIds);

  for (const result of proposalResults) {
    if (result.proposalEventId) {
      ids.add(result.proposalEventId);
    }
  }

  return [...ids];
}

function getLastExtractionErrorCategory(
  generatorStates: readonly ExtractionGeneratorState[]
): ExtractionRunErrorCategory | undefined {
  for (let index = generatorStates.length - 1; index >= 0; index -= 1) {
    const generatorState = generatorStates[index];
    if (generatorState?.errorCategory) {
      return generatorState.errorCategory;
    }
  }

  return undefined;
}

function acquireExtractionRoundExecutionClaim(
  runId: string,
  roundId: string,
  sourceSealedDivergenceRoundId: string,
  generatorIds: readonly string[],
  options: RunExtractionProposalRoundOptions
): ExtractionRoundClaimAcquisition {
  const acquiredAt = getClock(options)();
  const ownerId = createExtractionExecutionClaimOwnerId(options);
  const acquisitionStatus: {
    current: ExtractionRoundClaimAcquisition["status"];
  } = {
    current: "acquired"
  };

  const run = options.runStore.updateRun(runId, (currentRun) => {
    const existingRound = getExistingExtractionRound(currentRun, roundId);

    if (existingRound?.sourceSealedDivergenceRoundId !== undefined) {
      assertSameSourceRound(existingRound, sourceSealedDivergenceRoundId);
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
      expiresAt: addMilliseconds(acquiredAt, getExtractionExecutionClaimTtlMs(currentRun, options)),
      status: "active"
    };
    const round: ExtractionRoundState = {
      roundId,
      sourceSealedDivergenceRoundId,
      status: "running",
      generatorStates,
      proposalEventIds: existingRound?.proposalEventIds ?? [],
      lastErrorCategory: existingRound?.lastErrorCategory,
      executionClaim,
      startedAt: existingRound?.startedAt ?? acquiredAt,
      updatedAt: acquiredAt
    };

    acquisitionStatus.current = "acquired";

    return upsertExtractionRound(currentRun, round, acquiredAt);
  });
  const round = findExtractionRound(run, roundId);

  if (!round) {
    throw new RunExtractionProposalRoundError(
      "round_conflict",
      "Extraction proposal round claim could not be resolved."
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

function releaseExtractionRoundExecutionClaim(
  options: RunExtractionProposalRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): DeliberationRunRecord {
  return options.runStore.updateRun(runId, (currentRun) => {
    const round = findExtractionRound(currentRun, roundId);

    if (!round || round.executionClaim?.ownerId !== ownerId) {
      return currentRun;
    }

    const releasedRound = structuredClone(round);
    delete releasedRound.executionClaim;

    return upsertExtractionRound(currentRun, releasedRound, getClock(options)());
  });
}

function assertExtractionRoundExecutionClaimOwned(
  options: RunExtractionProposalRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): void {
  const run = options.runStore.getRun(runId);
  const claim = findExtractionRound(run, roundId)?.executionClaim;

  if (!run || claim?.ownerId !== ownerId || claim?.status !== "active") {
    throw new RunExtractionProposalRoundError(
      "round_conflict",
      "Extraction proposal round execution claim is no longer active."
    );
  }
}

function setExtractionRoundState(
  run: DeliberationRunRecord,
  options: RunExtractionProposalRoundOptions,
  round: ExtractionRoundState,
  claimOwnerId?: string
): DeliberationRunRecord {
  return options.runStore.updateRun(run.id, (currentRun) => {
    if (claimOwnerId) {
      assertCurrentExtractionRoundClaimOwner(currentRun, round.roundId, claimOwnerId);
    }

    const existingRound = findExtractionRound(currentRun, round.roundId);
    const existingClaim = existingRound?.executionClaim;
    const nextRound =
      round.executionClaim || !existingClaim
        ? round
        : {
            ...round,
            executionClaim: existingClaim
          };

    return upsertExtractionRound(currentRun, nextRound, nextRound.updatedAt ?? getClock(options)());
  });
}

function markExtractionRoundFailed(
  run: DeliberationRunRecord,
  options: RunExtractionProposalRoundOptions,
  roundId: string,
  sourceSealedDivergenceRoundId: string,
  generatorIds: readonly string[],
  errorCategory: ExtractionRunErrorCategory,
  claimOwnerId?: string
): DeliberationRunRecord {
  const timestamp = getClock(options)();
  const existingRound = findExtractionRound(run, roundId);

  return setExtractionRoundState(run, options, {
    roundId,
    sourceSealedDivergenceRoundId,
    status: "failed",
    generatorStates: createGeneratorStates(generatorIds, existingRound),
    proposalEventIds: existingRound?.proposalEventIds ?? [],
    lastErrorCategory: errorCategory,
    startedAt: existingRound?.startedAt ?? timestamp,
    updatedAt: timestamp
  }, claimOwnerId);
}

function assertCurrentExtractionRoundClaimOwner(
  run: DeliberationRunRecord,
  roundId: string,
  ownerId: string
): void {
  const round = findExtractionRound(run, roundId);

  if (round?.executionClaim?.ownerId !== ownerId) {
    throw new RunExtractionProposalRoundError(
      "round_conflict",
      "Extraction proposal round execution claim is no longer active."
    );
  }
}

function getExistingExtractionRound(
  run: DeliberationRunRecord,
  roundId: string
): ExtractionRoundState | undefined {
  const existingRounds = run.extractionRounds ?? [];
  const existingRound = existingRounds.find((round) => round.roundId === roundId);

  if (existingRound) {
    return structuredClone(existingRound);
  }

  return undefined;
}

function findExtractionRound(
  run: DeliberationRunRecord | undefined,
  roundId: string
): ExtractionRoundState | undefined {
  return run?.extractionRounds?.find((round) => round.roundId === roundId);
}

function assertSameSourceRound(
  existingRound: ExtractionRoundState,
  sourceSealedDivergenceRoundId: string
): void {
  if (existingRound.sourceSealedDivergenceRoundId !== sourceSealedDivergenceRoundId) {
    throw new RunExtractionProposalRoundError(
      "round_conflict",
      "Extraction proposal round already targets a different source round."
    );
  }
}

function upsertExtractionRound(
  run: DeliberationRunRecord,
  round: ExtractionRoundState,
  updatedAt: string
): DeliberationRunRecord {
  const existingRounds = run.extractionRounds ?? [];
  const replaced = existingRounds.some((existingRound) => existingRound.roundId === round.roundId);
  const extractionRounds = replaced
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
    extractionRounds,
    updatedAt
  };
}

function createResultFromExtractionRound(
  run: DeliberationRunRecord,
  round: ExtractionRoundState,
  roundId: string,
  executionStatus: RunExtractionProposalRoundResult["executionStatus"]
): RunExtractionProposalRoundResult {
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

function resolveExtractionGeneratorRuntimeConfig(
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
    throw new RunExtractionProposalRoundError(
      "provider_config_invalid",
      "Extraction generator provider config was not found."
    );
  }

  if (generator.adapterId && providerConfig.adapterId !== generator.adapterId) {
    throw new RunExtractionProposalRoundError(
      "provider_config_invalid",
      "Extraction generator provider config adapter is invalid."
    );
  }

  return resolveProviderRuntimeConfig({
    providerConfig,
    env
  });
}

function getExtractionGeneratorFailure(error: unknown): {
  errorCategory: ExtractionRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
} {
  return {
    errorCategory: getExtractionGeneratorErrorCategory(error),
    safeDiagnostics: getSafeExtractionDiagnostics(error)
  };
}

function getExtractionGeneratorErrorCategory(error: unknown): ExtractionRunErrorCategory {
  if (error instanceof ExtractionContextError) {
    return "extraction_context_unavailable";
  }

  if (error instanceof ProviderSecretResolutionError) {
    return "provider_secret_missing";
  }

  if (
    error instanceof RunExtractionProposalRoundError &&
    error.category === "round_conflict"
  ) {
    return "round_conflict";
  }

  if (
    error instanceof RunExtractionProposalRoundError &&
    error.category === "extraction_generator_failed"
  ) {
    return "extraction_generator_failed";
  }

  if (error instanceof ExtractionGeneratorValidationError) {
    return "extraction_validation_failed";
  }

  const safeCategory = getSafeExtractionErrorCategory(error);
  if (safeCategory) {
    return safeCategory;
  }

  return error instanceof RunExtractionProposalRoundError
    ? (error.category as ExtractionRunErrorCategory)
    : "extraction_generator_failed";
}

function getSafeExtractionErrorCategory(error: unknown): ExtractionRunErrorCategory | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const safeCategory = (error as { safeCategory?: unknown }).safeCategory;
  if (typeof safeCategory !== "string") {
    return undefined;
  }

  const parsed = ExtractionRunErrorCategorySchema.safeParse(safeCategory);
  return parsed.success ? parsed.data : undefined;
}

function getSafeExtractionDiagnostics(error: unknown): RunSafeDiagnostics | undefined {
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

function createExtractionExecutionClaimOwnerId(
  options: RunExtractionProposalRoundOptions
): string {
  const ownerId =
    options.executionClaimOwnerIdGenerator?.() ??
    `extraction-claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (ownerId.trim().length === 0) {
    throw new RunExtractionProposalRoundError(
      "round_conflict",
      "Extraction proposal round execution claim owner is invalid."
    );
  }

  return ownerId;
}

function getExtractionExecutionClaimTtlMs(
  run: DeliberationRunRecord,
  options: RunExtractionProposalRoundOptions
): number {
  const ttlMs =
    options.executionClaimTtlMs ??
    run.plan.timeouts.overallMs ??
    DEFAULT_EXECUTION_CLAIM_TTL_MS;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RunExtractionProposalRoundError(
      "round_conflict",
      "Extraction proposal round execution claim TTL is invalid."
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
    throw new RunExtractionProposalRoundError(
      "round_conflict",
      "Extraction proposal round execution claim timestamp is invalid."
    );
  }

  return parsed;
}

function getClock(options: RunExtractionProposalRoundOptions): () => string {
  return options.clock ?? (() => new Date().toISOString());
}

function createExtractionProposalIdempotencyKey(
  runId: string,
  roundId: string,
  generatorId: string
): string {
  return `orchestrator:${runId}:extraction:${roundId}:proposal:${generatorId}`;
}
