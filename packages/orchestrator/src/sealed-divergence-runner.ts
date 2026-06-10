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
import type {
  DeliberationRunRecord,
  ParticipantDispatchState,
  ParticipantRoundResult,
  RunErrorCategory,
  RunSealedDivergenceRoundInput,
  RunSealedDivergenceRoundOptions,
  RunSealedDivergenceRoundResult,
  SealedDivergenceRoundState
} from "./types";

const DEFAULT_ROUND_ID = "initial" as const;

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
  const run = options.runStore.getRun(input.runId);

  if (!run) {
    throw new RunStoreNotFoundError(input.runId);
  }

  const roundId = input.roundId ?? DEFAULT_ROUND_ID;
  const participantIds = getRoundParticipantIds(run);
  const participantRegistry = new ParticipantRegistry(run.plan.participants);
  const existingRound = getExistingRound(run, roundId);

  if (existingRound?.status === "revealed") {
    return createResultFromRound(run, existingRound, roundId);
  }

  const dispatchStates = createDispatchStates(run, participantIds, existingRound);
  const participantsToExecute = getParticipantsToExecute(
    dispatchStates,
    Boolean(input.retryFailedParticipants)
  );

  assertBudgetAllowsRound({
    run,
    round: existingRound,
    participantsToExecute,
    eventCount: options.eventStore.listEvents(run.sessionId).length,
    willAttemptReveal: canAttemptRevealAfterDispatch(run, existingRound, participantsToExecute, input)
  });

  let openedAppended = false;
  let openedEventId = existingRound?.openedEventId;
  let batchId = existingRound?.batchId;
  let workingRun = run;

  if (!batchId || !openedEventId) {
    try {
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
    } catch {
      workingRun = markRunFailed(run, options, roundId, dispatchStates, "core_lifecycle_failed");
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
  });

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
    });

    return {
      run: finalRun,
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
    });

    return {
      run: finalRun,
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
  } catch {
    const failedRun = markRunFailed(
      workingRun,
      options,
      roundId,
      updatedDispatches,
      "core_lifecycle_failed",
      batchId,
      openedEventId
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
  });

  return {
    run: finalRun,
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
  env?: Record<string, string | undefined>;
  options: RunSealedDivergenceRoundOptions;
}): Promise<ParticipantRoundResult> {
  const participant = new ParticipantRegistry(input.run.plan.participants).require(input.participantId);

  let outcome: AdapterExecutionOutcome;

  try {
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
          dispatchEnvelope.adapterContext
        ),
      input.run.plan.timeouts.participantMs
    );
  } catch (error) {
    return {
      participantId: input.participantId,
      adapterId: participant.adapterId,
      status: "failed",
      errorCategory: error instanceof ProviderSecretResolutionError
        ? "provider_secret_missing"
        : "adapter_failed"
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
  } catch {
    return {
      participantId: input.participantId,
      adapterId: participant.adapterId,
      status: "failed",
      errorCategory: "core_lifecycle_failed"
    };
  }
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
    .catch(() => ({
      kind: "failed" as const,
      errorCategory: "adapter_failed" as const
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

function setRoundState(
  run: DeliberationRunRecord,
  options: RunSealedDivergenceRoundOptions,
  round: SealedDivergenceRoundState
): DeliberationRunRecord {
  return options.runStore.updateRun(run.id, (currentRun) => ({
    ...currentRun,
    status: getRunStatusForRound(round),
    currentBatchId: round.batchId,
    sealedDivergenceRound: structuredClone(round),
    updatedAt: round.updatedAt ?? getClock(options)()
  }));
}

function markRunFailed(
  run: DeliberationRunRecord,
  options: RunSealedDivergenceRoundOptions,
  roundId: string,
  dispatchStates: readonly ParticipantDispatchState[],
  errorCategory: RunErrorCategory,
  batchId?: string,
  openedEventId?: string
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
  });
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
  roundId: string
): RunSealedDivergenceRoundResult {
  return {
    run,
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
