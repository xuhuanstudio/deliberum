import {
  FINAL_CANDIDATE_PROPOSED_EVENT_TYPE,
  compileOutcome,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectProcessProposalStates,
  type Clock,
  type IdGenerator,
  type OutcomeCompilationResult
} from "@deliberum/core";
import {
  InMemoryRunStore,
  createDeliberationRun,
  runCandidateRepairRound,
  runEvidenceCheckRound,
  runExtractionProposalRound,
  runFinalizationRound,
  runProposalReviewRound,
  runSealedDivergenceRound,
  suggestAdaptivePrimitiveProposals,
  type AdaptivePrimitiveSchedulerResult,
  type DeliberationRunRecord,
  type ExtractionAcceptancePolicy,
  type ExtractionGeneratorRegistryEntry,
  type ExplicitFinalCandidateDraft,
  type FinalAuditGeneratorRegistryEntry,
  type FinalCandidateGeneratorRegistryEntry,
  type ProposalReviewGeneratorRegistryEntry,
  type RunExtractionProposalRoundOptions,
  type RunCandidateRepairRoundOptions,
  type RunEvidenceCheckRoundOptions,
  type RunFinalizationRoundOptions,
  type RunProposalReviewRoundOptions,
  type RunSealedDivergenceRoundOptions,
  type RunStore
} from "@deliberum/orchestrator";
import type { JsonValue } from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import type { DaemonEventBus } from "./event-stream";

export type DaemonRunOrchestrationOptions = {
  eventStore: EventStore;
  runStore?: RunStore;
  eventBus: DaemonEventBus;
  idGenerator: IdGenerator;
  clock?: Clock;
  adapterRegistry?: RunSealedDivergenceRoundOptions["adapterRegistry"];
  extractionGeneratorRegistry?: RunExtractionProposalRoundOptions["extractionGeneratorRegistry"];
  candidateRepairGeneratorRegistry?: RunCandidateRepairRoundOptions["candidateRepairGeneratorRegistry"];
  evidenceCheckGeneratorRegistry?: RunEvidenceCheckRoundOptions["evidenceCheckGeneratorRegistry"];
  proposalReviewGeneratorRegistry?: RunProposalReviewRoundOptions["proposalReviewGeneratorRegistry"];
  finalCandidateGeneratorRegistry?: RunFinalizationRoundOptions["finalCandidateGeneratorRegistry"];
  finalAuditGeneratorRegistry?: RunFinalizationRoundOptions["finalAuditGeneratorRegistry"];
  env?: Record<string, string | undefined>;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type DaemonRunPlanView = {
  title?: string;
  topic: string;
  goals: string[];
  constraints: string[];
  participants: Array<{
    id: string;
    kind: string;
    displayName: string;
    adapterId: string;
    providerConfigId?: string;
    profileId?: string;
    capabilities?: unknown;
  }>;
  providerConfigs: Array<{
    id: string;
    adapterId: string;
    providerConfigId?: string;
    modelId?: string;
    timeoutMs?: number;
    requestOptions?: unknown;
    httpTemplate?: unknown;
    hasApiKeyEnvVar: boolean;
  }>;
  budget: unknown;
  timeouts: unknown;
  output: unknown;
  sealedDivergence: unknown;
  resources?: unknown[];
};

export type DaemonRunSummaryView = {
  runId: string;
  sessionId: string;
  status: string;
  topic: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  sealedDivergenceStatus?: string;
  latestExtractionStatus?: string;
  latestCandidateRepairStatus?: string;
  latestEvidenceCheckStatus?: string;
  latestProposalReviewStatus?: string;
  latestFinalizationStatus?: string;
};

export type DaemonRunDetailView = DaemonRunSummaryView & {
  schemaVersion: string;
  topicContractEventId: string;
  currentBatchId?: string;
  plan: DaemonRunPlanView;
  ledger: {
    eventCount: number;
  };
  rounds: {
    sealedDivergence?: JsonValue;
    extraction: JsonValue[];
    candidateRepair: JsonValue[];
    evidenceCheck: JsonValue[];
    proposalReview: JsonValue[];
    finalization: JsonValue[];
  };
};

export type DaemonRunStartRequest = {
  sealedDivergence?: {
    roundId?: string;
    autoCloseManual?: boolean;
    retryFailedParticipants?: boolean;
  };
  extraction?: {
    roundId?: string;
    sealedDivergenceRoundId?: string;
    generatorIds?: string[];
    retryFailedGenerators?: boolean;
  };
  review?: {
    roundId?: string;
    extractionRoundId?: string;
    reviewerIds?: string[];
    retryFailedReviewers?: boolean;
    acceptancePolicy?: ExtractionAcceptancePolicy;
  };
  candidateRepair?: {
    roundId?: string;
    targetCandidateIds?: string[];
    generatorIds?: string[];
    retryFailedGenerators?: boolean;
  };
  evidenceCheck?: {
    roundId?: string;
    targetEvidenceNeedIds?: string[];
    generatorIds?: string[];
    retryFailedGenerators?: boolean;
  };
  finalization?: {
    roundId?: string;
    proposalReviewRoundId?: string;
    finalCandidateDraft?: ExplicitFinalCandidateDraft;
    finalCandidateProposalEventId?: string;
    finalCandidateGeneratorId?: string;
    auditGeneratorIds?: string[];
    retryFailedFinalCandidate?: boolean;
    retryFailedAuditors?: boolean;
    compileOutcome?: boolean;
  };
};

export type DaemonRunStageResult = {
  stage:
    | "sealed_divergence"
    | "extraction"
    | "proposal_review"
    | "candidate_repair"
    | "evidence_check"
    | "finalization";
  executionStatus: string;
  roundId: string;
  status?: string;
  eventIds: string[];
  result: JsonValue;
};

export type DaemonRunStartResponse = {
  run: DaemonRunDetailView;
  stages: DaemonRunStageResult[];
  stopped: boolean;
  stopReason?: string;
};

export type DaemonRunProcessProposalExecutionResponse = DaemonRunStartResponse & {
  processProposal: {
    proposalEventId: string;
    proposalId: string;
    primitive: string;
    latestStatus: string;
  };
  startRequest: DaemonRunStartRequest;
};

export type DaemonProcessProposalExecutionReadiness = {
  proposalEventId: string;
  proposalId: string;
  primitive: string;
  latestStatus: string;
  executable: boolean;
  status: "ready" | "not_accepted" | "unsupported_primitive" | "invalid_target";
  reason: string;
  startRequestPreview?: DaemonRunStartRequest;
};

export type DaemonRunProcessProposalsResponse = AdaptivePrimitiveSchedulerResult & {
  executionPolicy: {
    automaticExecution: false;
    explicitExecutionRequired: true;
    supportedPrimitives: string[];
    notes: string[];
  };
  executionReadiness: DaemonProcessProposalExecutionReadiness[];
};

export type DaemonRunOutcomeOptions = {
  finalCandidateProposalEventId?: string;
};

export type DaemonRunOutcomeResponse =
  | {
      runId: string;
      sessionId: string;
      status: "compiled";
      draftStatus: string;
      outcome: OutcomeCompilationResult;
    }
  | {
      runId: string;
      sessionId: string;
      status: "not_available";
      reason: string;
    };

export class DaemonRunOrchestrationError extends Error {
  readonly code: string;
  readonly safeMessage: string;
  readonly status: 400 | 404 | 409;

  constructor(code: string, safeMessage: string, status: 400 | 404 | 409 = 400) {
    super(safeMessage);
    this.name = "DaemonRunOrchestrationError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.status = status;
  }
}

type StageExecutionResult<TResult> = {
  result: TResult;
  eventIds: string[];
};

export class DaemonRunOrchestrationService {
  readonly runStore: RunStore;
  private readonly eventStore: EventStore;
  private readonly eventBus: DaemonEventBus;
  private readonly idGenerator: IdGenerator;
  private readonly clock?: Clock;
  private readonly adapterRegistry?: DaemonRunOrchestrationOptions["adapterRegistry"];
  private readonly extractionGeneratorRegistry?: DaemonRunOrchestrationOptions["extractionGeneratorRegistry"];
  private readonly candidateRepairGeneratorRegistry?: DaemonRunOrchestrationOptions["candidateRepairGeneratorRegistry"];
  private readonly evidenceCheckGeneratorRegistry?: DaemonRunOrchestrationOptions["evidenceCheckGeneratorRegistry"];
  private readonly proposalReviewGeneratorRegistry?: DaemonRunOrchestrationOptions["proposalReviewGeneratorRegistry"];
  private readonly finalCandidateGeneratorRegistry?: DaemonRunOrchestrationOptions["finalCandidateGeneratorRegistry"];
  private readonly finalAuditGeneratorRegistry?: DaemonRunOrchestrationOptions["finalAuditGeneratorRegistry"];
  private readonly env?: Record<string, string | undefined>;
  private readonly executionClaimTtlMs?: number;
  private readonly executionClaimOwnerIdGenerator?: () => string;

  constructor(options: DaemonRunOrchestrationOptions) {
    this.eventStore = options.eventStore;
    this.runStore = options.runStore ?? new InMemoryRunStore();
    this.eventBus = options.eventBus;
    this.idGenerator = options.idGenerator;
    this.clock = options.clock;
    this.adapterRegistry = options.adapterRegistry;
    this.extractionGeneratorRegistry = options.extractionGeneratorRegistry;
    this.candidateRepairGeneratorRegistry = options.candidateRepairGeneratorRegistry;
    this.evidenceCheckGeneratorRegistry = options.evidenceCheckGeneratorRegistry;
    this.proposalReviewGeneratorRegistry = options.proposalReviewGeneratorRegistry;
    this.finalCandidateGeneratorRegistry = options.finalCandidateGeneratorRegistry;
    this.finalAuditGeneratorRegistry = options.finalAuditGeneratorRegistry;
    this.env = options.env;
    this.executionClaimTtlMs = options.executionClaimTtlMs;
    this.executionClaimOwnerIdGenerator = options.executionClaimOwnerIdGenerator;
  }

  createRun(input: { runPlan: unknown }): {
    run: DaemonRunDetailView;
    session: { sessionId: string };
    event: StoredEvent;
  } {
    const result = createDeliberationRun(
      {
        runPlan: input.runPlan
      },
      {
        eventStore: this.eventStore,
        runStore: this.runStore,
        idGenerator: this.idGenerator,
        clock: this.clock
      }
    );

    this.eventBus.publish(result.topicContractEvent);

    return {
      run: this.toRunDetail(result.run),
      session: result.session,
      event: result.topicContractEvent
    };
  }

  listRuns(): DaemonRunSummaryView[] {
    return this.runStore
      .listRuns()
      .map((run) => this.toRunSummary(run))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getRun(runId: string): DaemonRunDetailView {
    return this.toRunDetail(this.requireRun(runId));
  }

  getRunSessionId(runId: string): string {
    return this.requireRun(runId).sessionId;
  }

  async startRun(runId: string, request: DaemonRunStartRequest): Promise<DaemonRunStartResponse> {
    rejectUnsafeRequestMaterial(request, "start");
    this.requireRun(runId);
    this.assertRequestedComponentsAvailable(runId, request);

    const stages: DaemonRunStageResult[] = [];
    let stopped = false;
    let stopReason: string | undefined;

    if (request.sealedDivergence) {
      const executed = await this.executeWithEventPublishing(runId, () =>
        runSealedDivergenceRound(
          {
            runId,
            roundId: request.sealedDivergence?.roundId,
            autoCloseManual: request.sealedDivergence?.autoCloseManual,
            retryFailedParticipants: request.sealedDivergence?.retryFailedParticipants,
            env: this.env
          },
          {
            eventStore: this.eventStore,
            runStore: this.runStore,
            adapterRegistry: this.requireAdapterRegistry(),
            idGenerator: this.idGenerator,
            clock: this.clock,
            executionClaimTtlMs: this.executionClaimTtlMs,
            executionClaimOwnerIdGenerator: this.executionClaimOwnerIdGenerator
          }
        )
      );
      const round = executed.result.run.sealedDivergenceRound;

      stages.push({
        stage: "sealed_divergence",
        executionStatus: executed.result.executionStatus,
        roundId: executed.result.roundId,
        status: round?.status,
        eventIds: executed.eventIds,
        result: toJsonValue({
          participantResults: executed.result.participantResults,
          batchId: executed.result.batchId,
          openedEventId: executed.result.openedEventId,
          revealedEventId: executed.result.revealedEventId
        })
      });

      stopReason = stopReasonForRound(
        executed.result.executionStatus,
        round?.status,
        ["waiting_for_participants", "waiting_for_reveal", "failed"]
      );
      stopped = Boolean(stopReason);
    }

    if (!stopped && request.extraction) {
      const executed = await this.executeWithEventPublishing(runId, () =>
        runExtractionProposalRound(
          {
            runId,
            roundId: request.extraction?.roundId,
            sealedDivergenceRoundId: request.extraction?.sealedDivergenceRoundId,
            generatorIds: request.extraction?.generatorIds,
            retryFailedGenerators: request.extraction?.retryFailedGenerators
          },
          {
            eventStore: this.eventStore,
            runStore: this.runStore,
            extractionGeneratorRegistry: this.requireExtractionGeneratorRegistry(),
            idGenerator: this.idGenerator,
            clock: this.clock,
            env: this.env,
            executionClaimTtlMs: this.executionClaimTtlMs,
            executionClaimOwnerIdGenerator: this.executionClaimOwnerIdGenerator
          }
        )
      );
      const round = executed.result.run.extractionRounds?.find(
        (candidate) => candidate.roundId === executed.result.roundId
      );

      stages.push({
        stage: "extraction",
        executionStatus: executed.result.executionStatus,
        roundId: executed.result.roundId,
        status: round?.status,
        eventIds: executed.eventIds,
        result: toJsonValue({
          proposalResults: executed.result.proposalResults
        })
      });

      stopReason = stopReasonForRound(
        executed.result.executionStatus,
        round?.status,
        ["waiting_for_generators", "failed"]
      );
      stopped = Boolean(stopReason);
    }

    if (!stopped && request.review) {
      const executed = await this.executeWithEventPublishing(runId, () =>
        runProposalReviewRound(
          {
            runId,
            roundId: request.review?.roundId,
            extractionRoundId: request.review?.extractionRoundId,
            reviewerIds: request.review?.reviewerIds,
            retryFailedReviewers: request.review?.retryFailedReviewers,
            acceptancePolicy: request.review?.acceptancePolicy
          },
          {
            eventStore: this.eventStore,
            runStore: this.runStore,
            proposalReviewGeneratorRegistry: this.requireProposalReviewGeneratorRegistry(),
            idGenerator: this.idGenerator,
            clock: this.clock,
            env: this.env,
            executionClaimTtlMs: this.executionClaimTtlMs,
            executionClaimOwnerIdGenerator: this.executionClaimOwnerIdGenerator
          }
        )
      );
      const round = executed.result.run.proposalReviewRounds?.find(
        (candidate) => candidate.roundId === executed.result.roundId
      );

      stages.push({
        stage: "proposal_review",
        executionStatus: executed.result.executionStatus,
        roundId: executed.result.roundId,
        status: round?.status,
        eventIds: executed.eventIds,
        result: toJsonValue({
          reviewResults: executed.result.reviewResults,
          acceptanceResults: executed.result.acceptanceResults
        })
      });

      stopReason = stopReasonForRound(
        executed.result.executionStatus,
        round?.status,
        ["waiting_for_reviewers", "failed"]
      );
      stopped = Boolean(stopReason);
    }

    if (!stopped && request.evidenceCheck) {
      const executed = await this.executeWithEventPublishing(runId, () =>
        runEvidenceCheckRound(
          {
            runId,
            roundId: request.evidenceCheck?.roundId,
            targetEvidenceNeedIds: request.evidenceCheck?.targetEvidenceNeedIds,
            generatorIds: request.evidenceCheck?.generatorIds,
            retryFailedGenerators: request.evidenceCheck?.retryFailedGenerators
          },
          {
            eventStore: this.eventStore,
            runStore: this.runStore,
            evidenceCheckGeneratorRegistry: this.requireEvidenceCheckGeneratorRegistry(),
            idGenerator: this.idGenerator,
            clock: this.clock,
            env: this.env,
            executionClaimTtlMs: this.executionClaimTtlMs,
            executionClaimOwnerIdGenerator: this.executionClaimOwnerIdGenerator
          }
        )
      );
      const round = executed.result.run.evidenceCheckRounds?.find(
        (candidate) => candidate.roundId === executed.result.roundId
      );

      stages.push({
        stage: "evidence_check",
        executionStatus: executed.result.executionStatus,
        roundId: executed.result.roundId,
        status: round?.status,
        eventIds: executed.eventIds,
        result: toJsonValue({
          evidenceResults: executed.result.evidenceResults
        })
      });

      stopReason = stopReasonForRound(
        executed.result.executionStatus,
        round?.status,
        ["waiting_for_generators", "failed"]
      );
      stopped = Boolean(stopReason);
    }

    if (!stopped && request.candidateRepair) {
      const executed = await this.executeWithEventPublishing(runId, () =>
        runCandidateRepairRound(
          {
            runId,
            roundId: request.candidateRepair?.roundId,
            targetCandidateIds: request.candidateRepair?.targetCandidateIds,
            generatorIds: request.candidateRepair?.generatorIds,
            retryFailedGenerators: request.candidateRepair?.retryFailedGenerators
          },
          {
            eventStore: this.eventStore,
            runStore: this.runStore,
            candidateRepairGeneratorRegistry: this.requireCandidateRepairGeneratorRegistry(),
            idGenerator: this.idGenerator,
            clock: this.clock,
            env: this.env,
            executionClaimTtlMs: this.executionClaimTtlMs,
            executionClaimOwnerIdGenerator: this.executionClaimOwnerIdGenerator
          }
        )
      );
      const round = executed.result.run.candidateRepairRounds?.find(
        (candidate) => candidate.roundId === executed.result.roundId
      );

      stages.push({
        stage: "candidate_repair",
        executionStatus: executed.result.executionStatus,
        roundId: executed.result.roundId,
        status: round?.status,
        eventIds: executed.eventIds,
        result: toJsonValue({
          proposalResults: executed.result.proposalResults
        })
      });

      stopReason = stopReasonForRound(
        executed.result.executionStatus,
        round?.status,
        ["waiting_for_generators", "failed"]
      );
      stopped = Boolean(stopReason);
    }

    if (!stopped && request.finalization) {
      const executed = await this.executeWithEventPublishing(runId, () =>
        runFinalizationRound(
          {
            runId,
            roundId: request.finalization?.roundId,
            proposalReviewRoundId: request.finalization?.proposalReviewRoundId,
            finalCandidateDraft: request.finalization?.finalCandidateDraft,
            finalCandidateProposalEventId:
              request.finalization?.finalCandidateProposalEventId,
            finalCandidateGeneratorId: request.finalization?.finalCandidateGeneratorId,
            auditGeneratorIds: request.finalization?.auditGeneratorIds,
            retryFailedFinalCandidate: request.finalization?.retryFailedFinalCandidate,
            retryFailedAuditors: request.finalization?.retryFailedAuditors,
            compileOutcome: request.finalization?.compileOutcome
          },
          {
            eventStore: this.eventStore,
            runStore: this.runStore,
            finalCandidateGeneratorRegistry: this.finalCandidateGeneratorRegistry,
            finalAuditGeneratorRegistry: this.requireFinalAuditGeneratorRegistry(),
            idGenerator: this.idGenerator,
            clock: this.clock,
            env: this.env,
            executionClaimTtlMs: this.executionClaimTtlMs,
            executionClaimOwnerIdGenerator: this.executionClaimOwnerIdGenerator
          }
        )
      );
      const round = executed.result.run.finalizationRounds?.find(
        (candidate) => candidate.roundId === executed.result.roundId
      );

      stages.push({
        stage: "finalization",
        executionStatus: executed.result.executionStatus,
        roundId: executed.result.roundId,
        status: round?.status,
        eventIds: executed.eventIds,
        result: toJsonValue({
          finalCandidateResult: executed.result.finalCandidateResult,
          auditResults: executed.result.auditResults,
          outcomeCompilation: executed.result.outcomeCompilation
        })
      });

      stopReason = stopReasonForRound(
        executed.result.executionStatus,
        round?.status,
        ["waiting_for_final_candidate", "waiting_for_auditors", "failed"]
      );
      stopped = Boolean(stopReason);
    }

    return {
      run: this.toRunDetail(this.requireRun(runId)),
      stages,
      stopped,
      ...(stopReason ? { stopReason } : {})
    };
  }

  getOutcome(
    runId: string,
    options: DaemonRunOutcomeOptions = {}
  ): DaemonRunOutcomeResponse {
    const run = this.requireRun(runId);
    const requestedFinalCandidateProposalEventId =
      options.finalCandidateProposalEventId?.trim();
    const finalCandidateProposalEventId = requestedFinalCandidateProposalEventId
      ? {
          status: "available" as const,
          eventId: requestedFinalCandidateProposalEventId
        }
      : resolveFinalCandidateProposalEventId(run, this.eventStore);

    if (finalCandidateProposalEventId.status === "not_available") {
      return {
        runId: run.id,
        sessionId: run.sessionId,
        status: "not_available",
        reason: finalCandidateProposalEventId.reason
      };
    }

    try {
      const outcome = compileOutcome({
        eventStore: this.eventStore,
        sessionId: run.sessionId,
        finalCandidateProposalEventId: finalCandidateProposalEventId.eventId
      });

      return {
        runId: run.id,
        sessionId: run.sessionId,
        status: "compiled",
        draftStatus: outcome.draftStatus,
        outcome
      };
    } catch {
      return {
        runId: run.id,
        sessionId: run.sessionId,
        status: "not_available",
        reason: "outcome_compilation_unavailable"
      };
    }
  }

  getProcessProposals(runId: string): DaemonRunProcessProposalsResponse {
    const run = this.requireRun(runId);
    const suggestionResult = suggestAdaptivePrimitiveProposals({
      run,
      eventStore: this.eventStore
    });
    const processProposalStates = projectProcessProposalStates({
      eventStore: this.eventStore,
      sessionId: run.sessionId
    }).proposalStates;

    return {
      ...suggestionResult,
      executionPolicy: createProcessProposalExecutionPolicy(),
      executionReadiness: processProposalStates.map((proposalState) =>
        createProcessProposalExecutionReadiness(proposalState, run, this.eventStore)
      )
    };
  }

  async executeAcceptedProcessProposal(
    runId: string,
    proposalEventId: string
  ): Promise<DaemonRunProcessProposalExecutionResponse> {
    const run = this.requireRun(runId);
    const proposalState = projectProcessProposalStates({
      eventStore: this.eventStore,
      sessionId: run.sessionId
    }).proposalStates.find((state) => state.proposalEventId === proposalEventId);

    if (!proposalState) {
      throw new DaemonRunOrchestrationError(
        "process_proposal_not_found",
        "Process proposal was not found.",
        404
      );
    }

    if (proposalState.latestStatus !== "accepted") {
      throw new DaemonRunOrchestrationError(
        "process_proposal_not_accepted",
        "Process proposal must be accepted before execution.",
        409
      );
    }

    const startRequest = createStartRequestForAcceptedProcessProposal(
      proposalState,
      run,
      this.eventStore
    );
    const startResponse = await this.startRun(runId, startRequest);

    return {
      ...startResponse,
      processProposal: {
        proposalEventId: proposalState.proposalEventId,
        proposalId: proposalState.proposalId,
        primitive: proposalState.proposal.primitive,
        latestStatus: proposalState.latestStatus
      },
      startRequest
    };
  }

  private requireRun(runId: string): DeliberationRunRecord {
    const run = this.runStore.getRun(runId);

    if (!run) {
      throw new DaemonRunOrchestrationError(
        "run_not_found",
        "Run was not found.",
        404
      );
    }

    return run;
  }

  private async executeWithEventPublishing<TResult>(
    runId: string,
    execute: () => Promise<TResult>
  ): Promise<StageExecutionResult<TResult>> {
    const sessionId = this.requireRun(runId).sessionId;
    const beforeEventIds = new Set(
      this.eventStore.listEvents(sessionId).map((event) => event.id)
    );

    try {
      const result = await execute();
      const eventIds = this.publishNewEvents(sessionId, beforeEventIds);

      return {
        result,
        eventIds
      };
    } catch (error) {
      this.publishNewEvents(sessionId, beforeEventIds);
      throw error;
    }
  }

  private publishNewEvents(sessionId: string, beforeEventIds: ReadonlySet<string>): string[] {
    const newEvents = this.eventStore
      .listEvents(sessionId)
      .filter((event) => !beforeEventIds.has(event.id))
      .sort((left, right) => left.sequence - right.sequence);

    for (const event of newEvents) {
      this.eventBus.publish(event);
    }

    return newEvents.map((event) => event.id);
  }

  private assertRequestedComponentsAvailable(
    runId: string,
    request: DaemonRunStartRequest
  ): void {
    const run = this.requireRun(runId);

    if (request.sealedDivergence) {
      const registry = this.requireAdapterRegistry();
      const participantIds =
        run.plan.sealedDivergence.participantIds?.length
          ? run.plan.sealedDivergence.participantIds
          : run.plan.participants.map((participant) => participant.id);

      for (const participantId of participantIds) {
        const participant = run.plan.participants.find(
          (candidate) => candidate.id === participantId
        );

        if (!participant) {
          throw new DaemonRunOrchestrationError(
            "orchestration_component_unavailable",
            "Required orchestration component is unavailable."
          );
        }

        tryRequireComponent(() => registry.require(participant.adapterId));
      }
    }

    if (request.extraction) {
      const registry = this.requireExtractionGeneratorRegistry();
      const generatorIds = request.extraction.generatorIds ?? registry.list().map((entry) => entry.generatorId);

      if (generatorIds.length === 0) {
        throw new DaemonRunOrchestrationError(
          "orchestration_component_unavailable",
          "Required orchestration component is unavailable."
        );
      }

      for (const generatorId of generatorIds) {
        tryRequireComponent(() => registry.require(generatorId));
      }
    }

    if (request.review) {
      const registry = this.requireProposalReviewGeneratorRegistry();
      const reviewerIds = request.review.reviewerIds ?? registry.list().map((entry) => entry.reviewerId);

      for (const reviewerId of reviewerIds) {
        tryRequireComponent(() => registry.require(reviewerId));
      }
    }

    if (request.candidateRepair) {
      const registry = this.requireCandidateRepairGeneratorRegistry();
      const generatorIds =
        request.candidateRepair.generatorIds ?? registry.list().map((entry) => entry.generatorId);

      if (generatorIds.length === 0) {
        throw new DaemonRunOrchestrationError(
          "orchestration_component_unavailable",
          "Required orchestration component is unavailable."
        );
      }

      for (const generatorId of generatorIds) {
        tryRequireComponent(() => registry.require(generatorId));
      }
    }

    if (request.evidenceCheck) {
      const registry = this.requireEvidenceCheckGeneratorRegistry();
      const generatorIds =
        request.evidenceCheck.generatorIds ?? registry.list().map((entry) => entry.generatorId);

      if (generatorIds.length === 0) {
        throw new DaemonRunOrchestrationError(
          "orchestration_component_unavailable",
          "Required orchestration component is unavailable."
        );
      }

      for (const generatorId of generatorIds) {
        tryRequireComponent(() => registry.require(generatorId));
      }
    }

    if (request.finalization) {
      const finalAuditRegistry = this.requireFinalAuditGeneratorRegistry();
      const needsFinalCandidateGenerator =
        !request.finalization.finalCandidateDraft &&
        !request.finalization.finalCandidateProposalEventId;

      if (needsFinalCandidateGenerator) {
        const finalCandidateRegistry = this.requireFinalCandidateGeneratorRegistry();
        const generatorIds = request.finalization.finalCandidateGeneratorId
          ? [request.finalization.finalCandidateGeneratorId]
          : finalCandidateRegistry.list().map((entry) => entry.generatorId);

        if (generatorIds.length !== 1) {
          throw new DaemonRunOrchestrationError(
            "orchestration_component_unavailable",
            "Required orchestration component is unavailable."
          );
        }

        for (const generatorId of generatorIds) {
          tryRequireComponent(() => finalCandidateRegistry.require(generatorId));
        }
      }

      const auditorIds =
        request.finalization.auditGeneratorIds ??
        finalAuditRegistry.list().map((entry) => entry.auditorId);

      for (const auditorId of auditorIds) {
        tryRequireComponent(() => finalAuditRegistry.require(auditorId));
      }
    }
  }

  private requireAdapterRegistry(): NonNullable<DaemonRunOrchestrationOptions["adapterRegistry"]> {
    if (!this.adapterRegistry) {
      throw new DaemonRunOrchestrationError(
        "orchestration_component_unavailable",
        "Required orchestration component is unavailable."
      );
    }

    return this.adapterRegistry;
  }

  private requireExtractionGeneratorRegistry(): NonNullable<
    DaemonRunOrchestrationOptions["extractionGeneratorRegistry"]
  > {
    if (!this.extractionGeneratorRegistry) {
      throw new DaemonRunOrchestrationError(
        "orchestration_component_unavailable",
        "Required orchestration component is unavailable."
      );
    }

    return this.extractionGeneratorRegistry;
  }

  private requireCandidateRepairGeneratorRegistry(): NonNullable<
    DaemonRunOrchestrationOptions["candidateRepairGeneratorRegistry"]
  > {
    if (!this.candidateRepairGeneratorRegistry) {
      throw new DaemonRunOrchestrationError(
        "orchestration_component_unavailable",
        "Required orchestration component is unavailable."
      );
    }

    return this.candidateRepairGeneratorRegistry;
  }

  private requireEvidenceCheckGeneratorRegistry(): NonNullable<
    DaemonRunOrchestrationOptions["evidenceCheckGeneratorRegistry"]
  > {
    if (!this.evidenceCheckGeneratorRegistry) {
      throw new DaemonRunOrchestrationError(
        "orchestration_component_unavailable",
        "Required orchestration component is unavailable."
      );
    }

    return this.evidenceCheckGeneratorRegistry;
  }

  private requireProposalReviewGeneratorRegistry(): NonNullable<
    DaemonRunOrchestrationOptions["proposalReviewGeneratorRegistry"]
  > {
    if (!this.proposalReviewGeneratorRegistry) {
      throw new DaemonRunOrchestrationError(
        "orchestration_component_unavailable",
        "Required orchestration component is unavailable."
      );
    }

    return this.proposalReviewGeneratorRegistry;
  }

  private requireFinalCandidateGeneratorRegistry(): NonNullable<
    DaemonRunOrchestrationOptions["finalCandidateGeneratorRegistry"]
  > {
    if (!this.finalCandidateGeneratorRegistry) {
      throw new DaemonRunOrchestrationError(
        "orchestration_component_unavailable",
        "Required orchestration component is unavailable."
      );
    }

    return this.finalCandidateGeneratorRegistry;
  }

  private requireFinalAuditGeneratorRegistry(): NonNullable<
    DaemonRunOrchestrationOptions["finalAuditGeneratorRegistry"]
  > {
    if (!this.finalAuditGeneratorRegistry) {
      throw new DaemonRunOrchestrationError(
        "orchestration_component_unavailable",
        "Required orchestration component is unavailable."
      );
    }

    return this.finalAuditGeneratorRegistry;
  }

  private toRunSummary(run: DeliberationRunRecord): DaemonRunSummaryView {
    const latestExtractionRound = run.extractionRounds?.at(-1);
    const latestCandidateRepairRound = run.candidateRepairRounds?.at(-1);
    const latestEvidenceCheckRound = run.evidenceCheckRounds?.at(-1);
    const latestProposalReviewRound = run.proposalReviewRounds?.at(-1);
    const latestFinalizationRound = run.finalizationRounds?.at(-1);

    return {
      runId: run.id,
      sessionId: run.sessionId,
      status: run.status,
      topic: run.plan.topic,
      ...(run.plan.title ? { title: run.plan.title } : {}),
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      ...(run.sealedDivergenceRound
        ? { sealedDivergenceStatus: run.sealedDivergenceRound.status }
        : {}),
      ...(latestExtractionRound ? { latestExtractionStatus: latestExtractionRound.status } : {}),
      ...(latestCandidateRepairRound
        ? { latestCandidateRepairStatus: latestCandidateRepairRound.status }
        : {}),
      ...(latestEvidenceCheckRound
        ? { latestEvidenceCheckStatus: latestEvidenceCheckRound.status }
        : {}),
      ...(latestProposalReviewRound
        ? { latestProposalReviewStatus: latestProposalReviewRound.status }
        : {}),
      ...(latestFinalizationRound
        ? { latestFinalizationStatus: latestFinalizationRound.status }
        : {})
    };
  }

  private toRunDetail(run: DeliberationRunRecord): DaemonRunDetailView {
    return {
      ...this.toRunSummary(run),
      schemaVersion: run.schemaVersion,
      topicContractEventId: run.topicContractEventId,
      ...(run.currentBatchId ? { currentBatchId: run.currentBatchId } : {}),
      plan: safePlanView(run),
      ledger: {
        eventCount: this.eventStore.listEvents(run.sessionId).length
      },
      rounds: {
        ...(run.sealedDivergenceRound
          ? { sealedDivergence: toJsonValue(withoutExecutionClaim(run.sealedDivergenceRound)) }
          : {}),
        extraction: (run.extractionRounds ?? []).map((round) =>
          toJsonValue(withoutExecutionClaim(round))
        ),
        candidateRepair: (run.candidateRepairRounds ?? []).map((round) =>
          toJsonValue(withoutExecutionClaim(round))
        ),
        evidenceCheck: (run.evidenceCheckRounds ?? []).map((round) =>
          toJsonValue(withoutExecutionClaim(round))
        ),
        proposalReview: (run.proposalReviewRounds ?? []).map((round) =>
          toJsonValue(withoutExecutionClaim(round))
        ),
        finalization: (run.finalizationRounds ?? []).map((round) =>
          toJsonValue(withoutExecutionClaim(round))
        )
      }
    };
  }
}

function tryRequireComponent(requireComponent: () => unknown): void {
  try {
    requireComponent();
  } catch {
    throw new DaemonRunOrchestrationError(
      "orchestration_component_unavailable",
      "Required orchestration component is unavailable."
    );
  }
}

function stopReasonForRound(
  executionStatus: string,
  roundStatus: string | undefined,
  stopStatuses: readonly string[]
): string | undefined {
  if (executionStatus === "already_running") {
    return "already_running";
  }

  if (roundStatus && stopStatuses.includes(roundStatus)) {
    return roundStatus;
  }

  return undefined;
}

type ProcessProposalExecutionState = ReturnType<
  typeof projectProcessProposalStates
>["proposalStates"][number];

function createStartRequestForAcceptedProcessProposal(
  proposalState: ProcessProposalExecutionState,
  run: DeliberationRunRecord,
  eventStore: EventStore
): DaemonRunStartRequest {
  const primitive = proposalState.proposal.primitive;

  if (primitive === "sealed_divergence") {
    return {
      sealedDivergence: {
        autoCloseManual: true
      }
    };
  }

  if (primitive === "relation_mapping") {
    return {
      extraction: {}
    };
  }

  if (primitive === "red_team") {
    return {
      review: {}
    };
  }

  if (primitive === "candidate_repair") {
    return {
      candidateRepair: {
        roundId: createProcessProposalExecutionRoundId(
          proposalState.proposalEventId,
          primitive
        ),
        targetCandidateIds: resolveCandidateRepairTargetIds(
          proposalState,
          run,
          eventStore
        ),
        retryFailedGenerators: true
      }
    };
  }

  if (primitive === "evidence_check") {
    return {
      evidenceCheck: {
        roundId: createProcessProposalExecutionRoundId(
          proposalState.proposalEventId,
          primitive
        ),
        targetEvidenceNeedIds: resolveEvidenceCheckTargetIds(
          proposalState,
          run,
          eventStore
        ),
        retryFailedGenerators: true
      }
    };
  }

  if (primitive === "final_contest") {
    return {
      finalization: {
        compileOutcome: true
      }
    };
  }

  if (primitive === "final_audit" || primitive === "omission_audit") {
    return {
      finalization: {
        roundId: createProcessProposalExecutionRoundId(
          proposalState.proposalEventId,
          primitive
        ),
        finalCandidateProposalEventId: resolveFinalAuditTargetEventId(
          proposalState,
          run,
          eventStore,
          primitive
        ),
        retryFailedAuditors: true
      }
    };
  }

  throw new DaemonRunOrchestrationError(
    "process_proposal_primitive_unsupported",
    "Process proposal primitive is not executable by the daemon yet.",
    409
  );
}

const SUPPORTED_PROCESS_PROPOSAL_EXECUTION_PRIMITIVES = [
  "sealed_divergence",
  "relation_mapping",
  "red_team",
  "candidate_repair",
  "evidence_check",
  "final_contest",
  "final_audit",
  "omission_audit"
];

function createProcessProposalExecutionPolicy(): DaemonRunProcessProposalsResponse["executionPolicy"] {
  return {
    automaticExecution: false,
    explicitExecutionRequired: true,
    supportedPrimitives: [...SUPPORTED_PROCESS_PROPOSAL_EXECUTION_PRIMITIVES],
    notes: [
      "Accepted process proposals require explicit operator execution.",
      "Readiness is a read-only projection and does not append ledger events.",
      "Unsupported primitives remain challengeable process material but are not daemon-executable."
    ]
  };
}

function createProcessProposalExecutionReadiness(
  proposalState: ProcessProposalExecutionState,
  run: DeliberationRunRecord,
  eventStore: EventStore
): DaemonProcessProposalExecutionReadiness {
  const base = {
    proposalEventId: proposalState.proposalEventId,
    proposalId: proposalState.proposalId,
    primitive: proposalState.proposal.primitive,
    latestStatus: proposalState.latestStatus
  };

  if (proposalState.latestStatus !== "accepted") {
    return {
      ...base,
      executable: false,
      status: "not_accepted",
      reason: "Process proposal must be accepted before execution."
    };
  }

  try {
    const startRequestPreview = createStartRequestForAcceptedProcessProposal(
      proposalState,
      run,
      eventStore
    );

    return {
      ...base,
      executable: true,
      status: "ready",
      reason: "Accepted process proposal can be explicitly executed through the daemon run start path.",
      startRequestPreview
    };
  } catch (error) {
    if (error instanceof DaemonRunOrchestrationError) {
      return {
        ...base,
        executable: false,
        status:
          error.code === "process_proposal_primitive_unsupported"
            ? "unsupported_primitive"
            : "invalid_target",
        reason: error.safeMessage
      };
    }

    throw error;
  }
}

function resolveCandidateRepairTargetIds(
  proposalState: ProcessProposalExecutionState,
  run: DeliberationRunRecord,
  eventStore: EventStore
): string[] {
  const targetCandidateIds = unique(proposalState.proposal.targetIds);

  if (targetCandidateIds.length === 0) {
    throw new DaemonRunOrchestrationError(
      "process_proposal_target_invalid",
      "Candidate repair process proposal must target at least one active candidate.",
      409
    );
  }

  const activeCandidateIds = new Set(
    projectCandidateFrontier({
      events: eventStore.listEvents(run.sessionId),
      sessionId: run.sessionId
    }).candidates.map((candidate) => candidate.object.id)
  );

  for (const targetCandidateId of targetCandidateIds) {
    if (!activeCandidateIds.has(targetCandidateId)) {
      throw new DaemonRunOrchestrationError(
        "process_proposal_target_invalid",
        "Candidate repair process proposal targets must be accepted active candidates.",
        409
      );
    }
  }

  return targetCandidateIds;
}

function resolveEvidenceCheckTargetIds(
  proposalState: ProcessProposalExecutionState,
  run: DeliberationRunRecord,
  eventStore: EventStore
): string[] {
  const targetEvidenceNeedIds = unique(proposalState.proposal.targetIds);

  if (targetEvidenceNeedIds.length === 0) {
    throw new DaemonRunOrchestrationError(
      "process_proposal_target_invalid",
      "Evidence check process proposal must target at least one accepted evidence need.",
      409
    );
  }

  const acceptedEvidenceNeedIds = new Set(
    projectAcceptedDeliberationObjects({
      events: eventStore.listEvents(run.sessionId),
      sessionId: run.sessionId
    }).evidenceNeeds.map((evidenceNeed) => evidenceNeed.object.id)
  );

  for (const targetEvidenceNeedId of targetEvidenceNeedIds) {
    if (!acceptedEvidenceNeedIds.has(targetEvidenceNeedId)) {
      throw new DaemonRunOrchestrationError(
        "process_proposal_target_invalid",
        "Evidence check process proposal targets must be accepted evidence needs.",
        409
      );
    }
  }

  return targetEvidenceNeedIds;
}

function resolveFinalAuditTargetEventId(
  proposalState: ProcessProposalExecutionState,
  run: DeliberationRunRecord,
  eventStore: EventStore,
  primitive: string
): string {
  const label = primitive === "omission_audit" ? "Omission audit" : "Final audit";

  if (proposalState.proposal.targetIds.length !== 1) {
    throw new DaemonRunOrchestrationError(
      "process_proposal_target_invalid",
      `${label} process proposal must target exactly one final candidate proposal event.`,
      409
    );
  }

  const targetEventId = proposalState.proposal.targetIds[0]!;
  const targetEvent = eventStore.getEvent(targetEventId);

  if (
    !targetEvent ||
    targetEvent.sessionId !== run.sessionId ||
    targetEvent.type !== FINAL_CANDIDATE_PROPOSED_EVENT_TYPE ||
    targetEvent.visibility !== "public"
  ) {
    throw new DaemonRunOrchestrationError(
      "process_proposal_target_invalid",
      `${label} process proposal must target a final candidate proposal event.`,
      409
    );
  }

  return targetEventId;
}

function createProcessProposalExecutionRoundId(
  proposalEventId: string,
  primitive: string
): string {
  return `process-proposal:${proposalEventId}:${primitive}`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function safePlanView(run: DeliberationRunRecord): DaemonRunPlanView {
  return {
    ...(run.plan.title ? { title: run.plan.title } : {}),
    topic: run.plan.topic,
    goals: [...run.plan.goals],
    constraints: [...run.plan.constraints],
    participants: run.plan.participants.map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      displayName: participant.displayName,
      adapterId: participant.adapterId,
      ...(participant.providerConfigId ? { providerConfigId: participant.providerConfigId } : {}),
      ...(participant.profileId ? { profileId: participant.profileId } : {}),
      ...(participant.capabilities ? { capabilities: structuredClone(participant.capabilities) } : {})
    })),
    providerConfigs: run.plan.providerConfigs.map((providerConfig) => {
      const requestOptions = safeProviderRequestOptions(providerConfig);

      return {
        id: providerConfig.id,
        adapterId: providerConfig.adapterId,
        ...(providerConfig.providerConfigId
          ? { providerConfigId: providerConfig.providerConfigId }
          : {}),
        ...(providerConfig.modelId ? { modelId: providerConfig.modelId } : {}),
        ...(providerConfig.timeoutMs ? { timeoutMs: providerConfig.timeoutMs } : {}),
        ...(requestOptions ? { requestOptions } : {}),
        ...(providerConfig.httpTemplate
          ? { httpTemplate: structuredClone(providerConfig.httpTemplate) }
          : {}),
        hasApiKeyEnvVar: Boolean(providerConfig.apiKeyEnvVar)
      };
    }),
    budget: structuredClone(run.plan.budget),
    timeouts: structuredClone(run.plan.timeouts),
    output: structuredClone(run.plan.output),
    sealedDivergence: structuredClone(run.plan.sealedDivergence),
    ...(run.plan.resources ? { resources: structuredClone(run.plan.resources) } : {})
  };
}

function safeProviderRequestOptions(
  providerConfig: DeliberationRunRecord["plan"]["providerConfigs"][number]
): unknown | undefined {
  const requestOptions = {
    ...(providerConfig.tokenParameter ? { tokenParameter: providerConfig.tokenParameter } : {}),
    ...(providerConfig.maxCompletionTokens !== undefined
      ? { maxCompletionTokens: providerConfig.maxCompletionTokens }
      : {}),
    ...(providerConfig.temperature !== undefined ? { temperature: providerConfig.temperature } : {}),
    ...(providerConfig.topP !== undefined ? { topP: providerConfig.topP } : {}),
    ...(providerConfig.stream !== undefined ? { stream: providerConfig.stream } : {}),
    ...(providerConfig.frequencyPenalty !== undefined
      ? { frequencyPenalty: providerConfig.frequencyPenalty }
      : {}),
    ...(providerConfig.presencePenalty !== undefined
      ? { presencePenalty: providerConfig.presencePenalty }
      : {}),
    ...(providerConfig.thinking ? { thinking: providerConfig.thinking } : {})
  };

  return Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
}

function withoutExecutionClaim<TRecord extends { executionClaim?: unknown }>(
  record: TRecord
): Omit<TRecord, "executionClaim"> {
  const clone = structuredClone(record);
  delete clone.executionClaim;

  return clone;
}

function resolveFinalCandidateProposalEventId(
  run: DeliberationRunRecord,
  eventStore: EventStore
):
  | {
      status: "available";
      eventId: string;
    }
  | {
      status: "not_available";
      reason: string;
    } {
  const roundEventId = run.finalizationRounds
    ?.slice()
    .reverse()
    .find((round) => Boolean(round.finalCandidateProposalEventId))
    ?.finalCandidateProposalEventId;

  if (roundEventId) {
    return {
      status: "available",
      eventId: roundEventId
    };
  }

  const finalCandidateEvents = eventStore.listEventsByType(
    run.sessionId,
    FINAL_CANDIDATE_PROPOSED_EVENT_TYPE
  );

  if (finalCandidateEvents.length === 1) {
    return {
      status: "available",
      eventId: finalCandidateEvents[0]!.id
    };
  }

  if (finalCandidateEvents.length > 1) {
    return {
      status: "not_available",
      reason: "final_candidate_proposal_ambiguous"
    };
  }

  return {
    status: "not_available",
    reason: "final_candidate_proposal_unavailable"
  };
}

function rejectUnsafeRequestMaterial(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (containsSecretLikeValue(value) || looksLikePrivateLocalPath(value)) {
      throw new DaemonRunOrchestrationError(
        "unsafe_run_request",
        "Run request contains unsafe inline material."
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectUnsafeRequestMaterial(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "env" || SECRET_KEY_NAMES.has(normalizeKey(key))) {
      throw new DaemonRunOrchestrationError(
        "unsafe_run_request",
        "Run request contains unsafe inline material."
      );
    }

    rejectUnsafeRequestMaterial(nestedValue, `${path}.${key}`);
  }
}

const SECRET_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "authtoken",
  "auth_token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "secret",
  "clientsecret",
  "client_secret",
  "password",
  "privatekey",
  "private_key",
  "privatetoken",
  "private_token",
  "credential",
  "credentials"
]);

function normalizeKey(key: string): string {
  return key.replace(/[-\s]/g, "").toLowerCase();
}

function containsSecretLikeValue(value: string): boolean {
  return (
    /bearer\s+[a-z0-9._~+/-]{8,}/i.test(value) ||
    /\bsk-[a-z0-9_-]{8,}\b/i.test(value) ||
    /\b(api[_-]?key|secret|access[_-]?token|private[_-]?token|authorization)=\S{4,}/i.test(value) ||
    /\b(auth(orization)?):\s*\S{8,}/i.test(value)
  );
}

function looksLikePrivateLocalPath(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith("file:") ||
    normalized.startsWith("/users/") ||
    normalized.startsWith("/home/") ||
    normalized.startsWith("/private/") ||
    normalized.startsWith("~/.ssh/") ||
    /^[a-z]:\\users\\/i.test(value) ||
    normalized.includes("/.ssh/")
  );
}

function toJsonValue(value: unknown): JsonValue {
  return structuredClone(value) as JsonValue;
}
