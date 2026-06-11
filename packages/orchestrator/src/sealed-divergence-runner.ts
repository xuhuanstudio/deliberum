import {
  closeSealedBatch,
  openSealedBatch,
  submitSealedContribution
} from "@deliberum/core";
import type { JsonValue } from "@deliberum/protocol";
import { RunStoreNotFoundError, RunSealedDivergenceRoundError } from "./errors";
import { buildParticipantDispatchInput } from "./dispatch-input";
import { ParticipantRegistry } from "./participant-registry";
import { ProviderSecretResolutionError } from "./errors";
import { RunErrorCategorySchema } from "./types";
import type {
  DeliberationRunRecord,
  ParticipantDispatchState,
  ParticipantRoundResult,
  RoundExecutionClaim,
  RunErrorCategory,
  RunSealedDivergenceRoundInput,
  RunSealedDivergenceRoundOptions,
  RunSealedDivergenceRoundResult,
  SealedDivergenceRoundState
} from "./types";

const DEFAULT_ROUND_ID = "initial" as const;
const DEFAULT_EXECUTION_CLAIM_TTL_MS = 5 * 60 * 1000;

type RoundExecutionClaimAcquisition =
  | {
      status: "acquired";
      ownerId: string;
      run: DeliberationRunRecord;
    }
  | {
      status: "already_running";
      run: DeliberationRunRecord;
      round: SealedDivergenceRoundState;
    }
  | {
      status: "already_revealed";
      run: DeliberationRunRecord;
      round: SealedDivergenceRoundState;
    };

type AdapterExecutionOutcome =
  | {
      kind: "completed";
      payload: JsonValue;
    }
  | {
      kind: "failed";
      errorCategory: RunErrorCategory;
    }
  | {
      kind: "timed_out";
      errorCategory: "adapter_timed_out";
    };

export async function runSealedDivergenceRound(
  input: RunSealedDivergenceRoundInput,
  options: RunSealedDivergenceRoundOptions
): Promise<RunSealedDivergenceRoundResult> {
  if (!options.runStore.getRun(input.runId)) {
    throw new RunStoreNotFoundError(input.runId);
  }

  const roundId = input.roundId ?? DEFAULT_ROUND_ID;
  const acquisition = acquireRoundExecutionClaim(input.runId, roundId, options);

  if (acquisition.status === "already_running") {
    return createResultFromRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_running"
    );
  }

  if (acquisition.status === "already_revealed") {
    return createResultFromRound(
      acquisition.run,
      acquisition.round,
      roundId,
      "already_revealed"
    );
  }

  try {
    const result = await executeClaimedSealedDivergenceRound(
      acquisition.run,
      input,
      options,
      roundId,
      acquisition.ownerId
    );
    const releasedRun = releaseRoundExecutionClaim(
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
    releaseRoundExecutionClaim(options, input.runId, roundId, acquisition.ownerId);
    throw error;
  }
}

async function executeClaimedSealedDivergenceRound(
  run: DeliberationRunRecord,
  input: RunSealedDivergenceRoundInput,
  options: RunSealedDivergenceRoundOptions,
  roundId: string,
  claimOwnerId: string
): Promise<RunSealedDivergenceRoundResult> {
  const participantIds = getRoundParticipantIds(run);
  const participantRegistry = new ParticipantRegistry(run.plan.participants);
  const existingRound = getExistingRound(run, roundId);

  const dispatchStates = createDispatchStates(run, participantIds, existingRound);
  const participantsToExecute = getParticipantsToExecute(
    dispatchStates,
    Boolean(input.retryFailedParticipants)
  );

  try {
    assertBudgetAllowsRound({
      run,
      round: existingRound,
      participantsToExecute,
      eventCount: options.eventStore.listEvents(run.sessionId).length,
      willAttemptReveal: canAttemptRevealAfterDispatch(run, existingRound, participantsToExecute, input)
    });
  } catch (error) {
    if (error instanceof RunSealedDivergenceRoundError) {
      markRunFailed(
        run,
        options,
        roundId,
        dispatchStates,
        error.category as RunErrorCategory,
        existingRound?.batchId,
        existingRound?.openedEventId,
        claimOwnerId
      );
    }

    throw error;
  }

  let openedAppended = false;
  let openedEventId = existingRound?.openedEventId;
  let batchId = existingRound?.batchId;
  let workingRun = run;

  if (!batchId || !openedEventId) {
    try {
      assertRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);

      const opened = openSealedBatch(
        {
          sessionId: run.sessionId,
          purpose: run.plan.sealedDivergence.purpose,
          participantIds,
          revealPolicy: run.plan.sealedDivergence.revealPolicy,
          idempotencyKey: createRoundIdempotencyKey(run.id, roundId, "open")
        },
        options
      );

      openedAppended = opened.appended;
      openedEventId = opened.openedEvent.id;
      batchId = opened.batchId;
    } catch (error) {
      if (error instanceof RunSealedDivergenceRoundError) {
        throw error;
      }

      workingRun = markRunFailed(
        run,
        options,
        roundId,
        dispatchStates,
        "core_lifecycle_failed",
        undefined,
        undefined,
        claimOwnerId
      );
      throw new RunSealedDivergenceRoundError(
        "core_lifecycle_failed",
        "Sealed divergence round could not open a batch."
      );
    }
  }

  workingRun = setRoundState(workingRun, options, {
    roundId,
    status: "running",
    batchId,
    openedEventId,
    participantDispatches: markDispatchesRunning(
      dispatchStates,
      participantsToExecute,
      getClock(options)()
    ),
    providerCallCount: (existingRound?.providerCallCount ?? 0) + participantsToExecute.length,
    startedAt: existingRound?.startedAt ?? getClock(options)(),
    updatedAt: getClock(options)()
  }, claimOwnerId);

  const participantResults = await Promise.all(
    participantIds.map(async (participantId): Promise<ParticipantRoundResult> => {
      const state = workingRun.sealedDivergenceRound?.participantDispatches.find(
        (dispatch) => dispatch.participantId === participantId
      );

      if (!participantsToExecute.includes(participantId)) {
        return {
          participantId,
          adapterId: participantRegistry.require(participantId).adapterId,
          status: "skipped",
          contributionEventId: state?.contributionEventId,
          errorCategory: state?.errorCategory
        };
      }

      return executeParticipant({
        run: workingRun,
        participantId,
        batchId,
        roundId,
        claimOwnerId,
        env: input.env,
        options
      });
    })
  );

  const updatedDispatches = mergeParticipantResults(
    workingRun.sealedDivergenceRound!.participantDispatches,
    participantResults,
    getClock(options)()
  );
  const allParticipantsSubmitted = participantIds.every((participantId) =>
    updatedDispatches.some(
      (dispatch) =>
        dispatch.participantId === participantId &&
        dispatch.status === "submitted" &&
        Boolean(dispatch.contributionEventId)
    )
  );
  const lastErrorCategory = getLastErrorCategory(updatedDispatches);

  if (!allParticipantsSubmitted) {
    const finalRun = setRoundState(workingRun, options, {
      ...workingRun.sealedDivergenceRound!,
      status: "waiting_for_participants",
      participantDispatches: updatedDispatches,
      lastErrorCategory,
      updatedAt: getClock(options)()
    }, claimOwnerId);

    return {
      run: finalRun,
      executionStatus: "executed",
      roundId,
      batchId,
      openedEventId,
      openedAppended,
      participantResults
    };
  }

  const shouldReveal =
    run.plan.sealedDivergence.revealPolicy === "all_completed" ||
    (run.plan.sealedDivergence.revealPolicy === "manual" && input.autoCloseManual === true);

  if (!shouldReveal) {
    const finalRun = setRoundState(workingRun, options, {
      ...workingRun.sealedDivergenceRound!,
      status: "waiting_for_reveal",
      participantDispatches: updatedDispatches,
      updatedAt: getClock(options)()
    }, claimOwnerId);

    return {
      run: finalRun,
      executionStatus: "executed",
      roundId,
      batchId,
      openedEventId,
      openedAppended,
      participantResults
    };
  }

  let revealedEventId = workingRun.sealedDivergenceRound?.revealedEventId;
  let revealAppended = false;

  try {
    assertRoundExecutionClaimOwned(options, run.id, roundId, claimOwnerId);

    const revealed = closeSealedBatch(
      {
        sessionId: run.sessionId,
        batchId,
        idempotencyKey: createRoundIdempotencyKey(run.id, roundId, "close")
      },
      options
    );

    revealedEventId = revealed.revealedEvent.id;
    revealAppended = revealed.appended;
  } catch (error) {
    if (error instanceof RunSealedDivergenceRoundError) {
      throw error;
    }

    const failedRun = markRunFailed(
      workingRun,
      options,
      roundId,
      updatedDispatches,
      "core_lifecycle_failed",
      batchId,
      openedEventId,
      claimOwnerId
    );
    throw new RunSealedDivergenceRoundError(
      "core_lifecycle_failed",
      "Sealed divergence round could not reveal the batch."
    );
  }

  const finalRun = setRoundState(workingRun, options, {
    ...workingRun.sealedDivergenceRound!,
    status: "revealed",
    participantDispatches: updatedDispatches,
    revealedEventId,
    updatedAt: getClock(options)()
  }, claimOwnerId);

  return {
    run: finalRun,
    executionStatus: "executed",
    roundId,
    batchId,
    openedEventId,
    openedAppended,
    participantResults,
    revealedEventId,
    revealAppended
  };
}

async function executeParticipant(input: {
  run: DeliberationRunRecord;
  participantId: string;
  batchId: string;
  roundId: string;
  claimOwnerId: string;
  env?: Record<string, string | undefined>;
  options: RunSealedDivergenceRoundOptions;
}): Promise<ParticipantRoundResult> {
  const participant = new ParticipantRegistry(input.run.plan.participants).require(input.participantId);

  let outcome: AdapterExecutionOutcome;

  try {
    assertRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const dispatchEnvelope = buildParticipantDispatchInput({
      run: input.run,
      eventStore: input.options.eventStore,
      adapterRegistry: input.options.adapterRegistry,
      participantId: input.participantId,
      env: input.env
    });

    outcome = await executeAdapterWithTimeout(
      () =>
        dispatchEnvelope.adapter.prepareContribution(
          dispatchEnvelope.adapterInput,
          dispatchEnvelope.adapterContext,
          dispatchEnvelope.providerRuntimeConfig
        ),
      input.run.plan.timeouts.participantMs
    );
  } catch (error) {
    return {
      participantId: input.participantId,
      adapterId: participant.adapterId,
      status: "failed",
      errorCategory: getParticipantErrorCategory(error)
    };
  }

  if (outcome.kind !== "completed") {
    return {
      participantId: input.participantId,
      adapterId: participant.adapterId,
      status: outcome.kind === "timed_out" ? "timed_out" : "failed",
      errorCategory: outcome.errorCategory
    };
  }

  try {
    assertRoundExecutionClaimOwned(
      input.options,
      input.run.id,
      input.roundId,
      input.claimOwnerId
    );

    const contribution = submitSealedContribution(
      {
        sessionId: input.run.sessionId,
        batchId: input.batchId,
        authorId: input.participantId,
        visibility: "sealed",
        payload: outcome.payload,
        idempotencyKey: createRoundIdempotencyKey(
          input.run.id,
          input.roundId,
          `contribution:${input.participantId}`
        )
      },
      input.options
    );

    return {
      participantId: input.participantId,
      adapterId: participant.adapterId,
      status: "submitted",
      contributionEventId: contribution.contributionEvent.id,
      appended: contribution.appended
    };
  } catch (error) {
    return {
      participantId: input.participantId,
      adapterId: participant.adapterId,
      status: "failed",
      errorCategory: error instanceof RunSealedDivergenceRoundError
        ? (error.category as RunErrorCategory)
        : "core_lifecycle_failed"
    };
  }
}

function getParticipantErrorCategory(error: unknown): RunErrorCategory {
  if (error instanceof ProviderSecretResolutionError) {
    return "provider_secret_missing";
  }

  if (error instanceof RunSealedDivergenceRoundError) {
    return error.category as RunErrorCategory;
  }

  const safeAdapterCategory = getSafeAdapterErrorCategory(error);
  if (safeAdapterCategory) {
    return safeAdapterCategory;
  }

  return "adapter_failed";
}

async function executeAdapterWithTimeout(
  execute: () => unknown,
  timeoutMs: number | undefined
): Promise<AdapterExecutionOutcome> {
  const adapterPromise = Promise.resolve()
    .then(execute)
    .then((result) => ({
      kind: "completed" as const,
      payload: (result as { payload: JsonValue }).payload
    }))
    .catch((error) => ({
      kind: "failed" as const,
      errorCategory: getParticipantErrorCategory(error)
    }));

  if (timeoutMs === undefined) {
    return adapterPromise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<AdapterExecutionOutcome>((resolve) => {
    timeoutId = setTimeout(
      () =>
        resolve({
          kind: "timed_out",
          errorCategory: "adapter_timed_out"
        }),
      timeoutMs
    );
  });

  const outcome = await Promise.race([adapterPromise, timeoutPromise]);

  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }

  return outcome;
}

function getSafeAdapterErrorCategory(error: unknown): RunErrorCategory | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const safeCategory = (error as { safeCategory?: unknown }).safeCategory;
  if (typeof safeCategory !== "string") {
    return undefined;
  }

  const parsed = RunErrorCategorySchema.safeParse(safeCategory);
  return parsed.success ? parsed.data : undefined;
}

function getRoundParticipantIds(run: DeliberationRunRecord): string[] {
  return run.plan.sealedDivergence.participantIds?.length
    ? [...run.plan.sealedDivergence.participantIds]
    : run.plan.participants.map((participant) => participant.id);
}

function getExistingRound(
  run: DeliberationRunRecord,
  roundId: string
): SealedDivergenceRoundState | undefined {
  if (!run.sealedDivergenceRound) {
    return undefined;
  }

  if (run.sealedDivergenceRound.roundId !== roundId) {
    throw new RunSealedDivergenceRoundError(
      "round_conflict",
      "A different sealed divergence round already exists for this run."
    );
  }

  return structuredClone(run.sealedDivergenceRound);
}

function createDispatchStates(
  run: DeliberationRunRecord,
  participantIds: readonly string[],
  existingRound: SealedDivergenceRoundState | undefined
): ParticipantDispatchState[] {
  const registry = new ParticipantRegistry(run.plan.participants);
  const existingByParticipant = new Map(
    existingRound?.participantDispatches.map((dispatch) => [dispatch.participantId, dispatch]) ?? []
  );

  return participantIds.map((participantId) => {
    const participant = registry.require(participantId);
    const existing = existingByParticipant.get(participantId);

    return existing
      ? structuredClone(existing)
      : {
          participantId,
          adapterId: participant.adapterId,
          status: "pending",
          attempts: 0
        };
  });
}

function getParticipantsToExecute(
  dispatchStates: readonly ParticipantDispatchState[],
  retryFailedParticipants: boolean
): string[] {
  return dispatchStates
    .filter((dispatch) => {
      if (dispatch.status === "submitted" && dispatch.contributionEventId) {
        return false;
      }

      if (
        (dispatch.status === "failed" || dispatch.status === "timed_out") &&
        !retryFailedParticipants
      ) {
        return false;
      }

      return true;
    })
    .map((dispatch) => dispatch.participantId);
}

function markDispatchesRunning(
  dispatchStates: readonly ParticipantDispatchState[],
  participantsToExecute: readonly string[],
  startedAt: string
): ParticipantDispatchState[] {
  const participantsToExecuteSet = new Set(participantsToExecute);

  return dispatchStates.map((dispatch) => {
    if (!participantsToExecuteSet.has(dispatch.participantId)) {
      return structuredClone(dispatch);
    }

    return {
      ...dispatch,
      status: "running",
      attempts: dispatch.attempts + 1,
      startedAt,
      completedAt: undefined
    };
  });
}

function mergeParticipantResults(
  dispatchStates: readonly ParticipantDispatchState[],
  participantResults: readonly ParticipantRoundResult[],
  completedAt: string
): ParticipantDispatchState[] {
  const resultByParticipant = new Map(
    participantResults.map((result) => [result.participantId, result])
  );

  return dispatchStates.map((dispatch) => {
    const result = resultByParticipant.get(dispatch.participantId);

    if (!result || result.status === "skipped") {
      return structuredClone(dispatch);
    }

    const previousErrorCategories = mergePreviousErrors(dispatch, result.errorCategory);

    return {
      ...dispatch,
      status: result.status,
      contributionEventId: result.contributionEventId,
      errorCategory: result.status === "submitted" ? undefined : result.errorCategory,
      previousErrorCategories,
      completedAt
    };
  });
}

function mergePreviousErrors(
  dispatch: ParticipantDispatchState,
  resultErrorCategory: RunErrorCategory | undefined
): RunErrorCategory[] | undefined {
  const previous = [...(dispatch.previousErrorCategories ?? [])];

  if (dispatch.errorCategory && dispatch.errorCategory !== resultErrorCategory) {
    previous.push(dispatch.errorCategory);
  }

  return previous.length > 0 ? previous : undefined;
}

function getLastErrorCategory(
  dispatchStates: readonly ParticipantDispatchState[]
): RunErrorCategory | undefined {
  for (let index = dispatchStates.length - 1; index >= 0; index -= 1) {
    const dispatch = dispatchStates[index];
    if (dispatch?.errorCategory) {
      return dispatch.errorCategory;
    }
  }

  return undefined;
}

function canAttemptRevealAfterDispatch(
  run: DeliberationRunRecord,
  existingRound: SealedDivergenceRoundState | undefined,
  participantsToExecute: readonly string[],
  input: RunSealedDivergenceRoundInput
): boolean {
  if (existingRound?.revealedEventId) {
    return false;
  }

  if (
    run.plan.sealedDivergence.revealPolicy === "manual" &&
    input.autoCloseManual !== true
  ) {
    return false;
  }

  const participantIds = getRoundParticipantIds(run);
  const submitted = new Set(
    existingRound?.participantDispatches
      .filter((dispatch) => dispatch.status === "submitted" && dispatch.contributionEventId)
      .map((dispatch) => dispatch.participantId) ?? []
  );

  for (const participantId of participantsToExecute) {
    submitted.add(participantId);
  }

  return participantIds.every((participantId) => submitted.has(participantId));
}

function assertBudgetAllowsRound(input: {
  run: DeliberationRunRecord;
  round: SealedDivergenceRoundState | undefined;
  participantsToExecute: readonly string[];
  eventCount: number;
  willAttemptReveal: boolean;
}): void {
  const maxProviderCalls = input.run.plan.budget.maxProviderCalls;
  const existingProviderCallCount = input.round?.providerCallCount ?? 0;

  if (
    maxProviderCalls !== undefined &&
    existingProviderCallCount + input.participantsToExecute.length > maxProviderCalls
  ) {
    throw new RunSealedDivergenceRoundError(
      "budget_exceeded",
      "Run budget does not allow additional participant dispatches."
    );
  }

  const maxEvents = input.run.plan.budget.maxEvents;
  const estimatedNewEvents =
    (input.round?.openedEventId ? 0 : 1) +
    input.participantsToExecute.length +
    (input.willAttemptReveal ? 1 : 0);

  if (maxEvents !== undefined && input.eventCount + estimatedNewEvents > maxEvents) {
    throw new RunSealedDivergenceRoundError(
      "budget_exceeded",
      "Run budget does not allow additional ledger events."
    );
  }
}

function acquireRoundExecutionClaim(
  runId: string,
  roundId: string,
  options: RunSealedDivergenceRoundOptions
): RoundExecutionClaimAcquisition {
  const acquiredAt = getClock(options)();
  const ownerId = createExecutionClaimOwnerId(options);
  const acquisitionStatus: {
    current: RoundExecutionClaimAcquisition["status"];
  } = {
    current: "acquired"
  };

  const run = options.runStore.updateRun(runId, (currentRun) => {
    const existingRound = getExistingRound(currentRun, roundId);

    if (existingRound?.status === "revealed") {
      acquisitionStatus.current = "already_revealed";
      return currentRun;
    }

    if (
      existingRound?.executionClaim &&
      !isExecutionClaimExpired(existingRound.executionClaim, acquiredAt)
    ) {
      acquisitionStatus.current = "already_running";
      return currentRun;
    }

    const participantIds = getRoundParticipantIds(currentRun);
    const dispatchStates = createDispatchStates(currentRun, participantIds, existingRound);
    const executionClaim: RoundExecutionClaim = {
      ownerId,
      acquiredAt,
      expiresAt: addMilliseconds(acquiredAt, getExecutionClaimTtlMs(currentRun, options)),
      status: "active"
    };
    const round: SealedDivergenceRoundState = {
      roundId,
      status: "running",
      batchId: existingRound?.batchId,
      openedEventId: existingRound?.openedEventId,
      revealedEventId: existingRound?.revealedEventId,
      participantDispatches: dispatchStates,
      providerCallCount: existingRound?.providerCallCount ?? 0,
      lastErrorCategory: existingRound?.lastErrorCategory,
      executionClaim,
      startedAt: existingRound?.startedAt ?? acquiredAt,
      updatedAt: acquiredAt
    };

    acquisitionStatus.current = "acquired";

    return {
      ...currentRun,
      status: "running",
      currentBatchId: round.batchId,
      sealedDivergenceRound: round,
      updatedAt: acquiredAt
    };
  });

  const round = run.sealedDivergenceRound;

  if (!round || round.roundId !== roundId) {
    throw new RunSealedDivergenceRoundError(
      "round_conflict",
      "Sealed divergence round claim could not be resolved."
    );
  }

  if (acquisitionStatus.current === "already_running") {
    return {
      status: "already_running",
      run,
      round
    };
  }

  if (acquisitionStatus.current === "already_revealed") {
    return {
      status: "already_revealed",
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

function releaseRoundExecutionClaim(
  options: RunSealedDivergenceRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): DeliberationRunRecord {
  return options.runStore.updateRun(runId, (currentRun) => {
    const round = currentRun.sealedDivergenceRound;

    if (
      !round ||
      round.roundId !== roundId ||
      round.executionClaim?.ownerId !== ownerId
    ) {
      return currentRun;
    }

    const releasedRound = structuredClone(round);
    delete releasedRound.executionClaim;

    return {
      ...currentRun,
      sealedDivergenceRound: releasedRound,
      updatedAt: getClock(options)()
    };
  });
}

function assertRoundExecutionClaimOwned(
  options: RunSealedDivergenceRoundOptions,
  runId: string,
  roundId: string,
  ownerId: string
): void {
  const run = options.runStore.getRun(runId);
  const claim = run?.sealedDivergenceRound?.executionClaim;

  if (
    !run ||
    run.sealedDivergenceRound?.roundId !== roundId ||
    claim?.ownerId !== ownerId ||
    claim?.status !== "active"
  ) {
    throw new RunSealedDivergenceRoundError(
      "round_conflict",
      "Sealed divergence round execution claim is no longer active."
    );
  }
}

function createExecutionClaimOwnerId(options: RunSealedDivergenceRoundOptions): string {
  const ownerId =
    options.executionClaimOwnerIdGenerator?.() ??
    `execution-claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (ownerId.trim().length === 0) {
    throw new RunSealedDivergenceRoundError(
      "round_conflict",
      "Sealed divergence round execution claim owner is invalid."
    );
  }

  return ownerId;
}

function getExecutionClaimTtlMs(
  run: DeliberationRunRecord,
  options: RunSealedDivergenceRoundOptions
): number {
  const ttlMs =
    options.executionClaimTtlMs ??
    run.plan.timeouts.overallMs ??
    DEFAULT_EXECUTION_CLAIM_TTL_MS;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RunSealedDivergenceRoundError(
      "round_conflict",
      "Sealed divergence round execution claim TTL is invalid."
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
    throw new RunSealedDivergenceRoundError(
      "round_conflict",
      "Sealed divergence round execution claim timestamp is invalid."
    );
  }

  return parsed;
}

function setRoundState(
  run: DeliberationRunRecord,
  options: RunSealedDivergenceRoundOptions,
  round: SealedDivergenceRoundState,
  claimOwnerId?: string
): DeliberationRunRecord {
  return options.runStore.updateRun(run.id, (currentRun) => {
    if (claimOwnerId) {
      assertCurrentRoundClaimOwner(currentRun, round.roundId, claimOwnerId);
    }

    const existingClaim =
      currentRun.sealedDivergenceRound?.roundId === round.roundId
        ? currentRun.sealedDivergenceRound.executionClaim
        : undefined;
    const nextRound =
      round.executionClaim || !existingClaim
        ? round
        : {
            ...round,
            executionClaim: existingClaim
          };

    return {
      ...currentRun,
      status: getRunStatusForRound(nextRound),
      currentBatchId: nextRound.batchId,
      sealedDivergenceRound: structuredClone(nextRound),
      updatedAt: nextRound.updatedAt ?? getClock(options)()
    };
  });
}

function markRunFailed(
  run: DeliberationRunRecord,
  options: RunSealedDivergenceRoundOptions,
  roundId: string,
  dispatchStates: readonly ParticipantDispatchState[],
  errorCategory: RunErrorCategory,
  batchId?: string,
  openedEventId?: string,
  claimOwnerId?: string
): DeliberationRunRecord {
  const timestamp = getClock(options)();

  return setRoundState(run, options, {
    roundId,
    status: "failed",
    batchId,
    openedEventId,
    participantDispatches: dispatchStates.map((dispatch) => structuredClone(dispatch)),
    providerCallCount: run.sealedDivergenceRound?.providerCallCount ?? 0,
    lastErrorCategory: errorCategory,
    startedAt: run.sealedDivergenceRound?.startedAt ?? timestamp,
    updatedAt: timestamp
  }, claimOwnerId);
}

function assertCurrentRoundClaimOwner(
  run: DeliberationRunRecord,
  roundId: string,
  ownerId: string
): void {
  if (
    run.sealedDivergenceRound?.roundId !== roundId ||
    run.sealedDivergenceRound?.executionClaim?.ownerId !== ownerId
  ) {
    throw new RunSealedDivergenceRoundError(
      "round_conflict",
      "Sealed divergence round execution claim is no longer active."
    );
  }
}

function getRunStatusForRound(
  round: SealedDivergenceRoundState
): DeliberationRunRecord["status"] {
  if (round.status === "running") {
    return "running";
  }

  if (round.status === "waiting_for_participants") {
    return "waiting_for_participants";
  }

  if (round.status === "waiting_for_reveal") {
    return "waiting_for_reveal";
  }

  if (round.status === "revealed") {
    return "revealed";
  }

  return "failed";
}

function createResultFromRound(
  run: DeliberationRunRecord,
  round: SealedDivergenceRoundState,
  roundId: string,
  executionStatus: RunSealedDivergenceRoundResult["executionStatus"]
): RunSealedDivergenceRoundResult {
  return {
    run,
    executionStatus,
    roundId,
    batchId: round.batchId,
    openedEventId: round.openedEventId,
    participantResults: round.participantDispatches.map((dispatch) => ({
      participantId: dispatch.participantId,
      adapterId: dispatch.adapterId,
      status: "skipped",
      contributionEventId: dispatch.contributionEventId,
      errorCategory: dispatch.errorCategory
    })),
    revealedEventId: round.revealedEventId
  };
}

function createRoundIdempotencyKey(
  runId: string,
  roundId: string,
  action: string
): string {
  return `orchestrator:${runId}:sealed-divergence:${roundId}:${action}`;
}

function getClock(options: RunSealedDivergenceRoundOptions): () => string {
  return options.clock ?? (() => new Date().toISOString());
}
