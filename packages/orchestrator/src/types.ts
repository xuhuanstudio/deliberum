import { z } from "zod";
import {
  IdSchema,
  ExtractionCandidateSchema,
  ExtractionClaimSchema,
  ExtractionEvidenceNeedSchema,
  ExtractionObjectionSchema,
  ExtractionQualityObligationSchema,
  FinalAuditSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  ParticipantCapabilitiesSchema,
  ParticipantKindSchema,
  SealedBatchPurposeSchema,
  type EventTrace,
  type EventVisibility,
  type ExtractionCandidate,
  type ExtractionClaim,
  type ExtractionEvidenceNeed,
  type ExtractionObjection,
  type ExtractionQualityObligation,
  type FinalAudit,
  type ParticipantCapabilities,
  type ParticipantKind,
  type JsonValue,
  type SealedBatchPurpose,
  type TopicContract
} from "@deliberum/protocol";
import type {
  AcceptedDeliberationObjectsProjection,
  CandidateFrontierProjection,
  Clock,
  CreateSessionOptions,
  IdGenerator,
  ExtractionProposalState,
  OutcomeCompilationResult,
  ProjectionMetadata,
  QualityObligationsProjection,
  SealedDivergenceOptions
} from "@deliberum/core";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import type { AdapterCapabilities, ParticipantAdapter, ParticipantAdapterContext, ParticipantAdapterInput } from "@deliberum/adapters";

export const ORCHESTRATOR_RUN_SCHEMA_VERSION = "1" as const;

export const EnvVarNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

export const RunParticipantSchema = z
  .object({
    id: IdSchema,
    kind: ParticipantKindSchema,
    displayName: NonEmptyStringSchema,
    adapterId: IdSchema,
    providerConfigId: IdSchema.optional(),
    profileId: IdSchema.optional(),
    capabilities: ParticipantCapabilitiesSchema.optional()
  })
  .strict();
export type RunParticipant = z.infer<typeof RunParticipantSchema>;

export const ProviderModelConfigRefSchema = z
  .object({
    id: IdSchema,
    adapterId: IdSchema,
    providerConfigId: IdSchema.optional(),
    modelId: NonEmptyStringSchema.optional(),
    baseUrl: NonEmptyStringSchema.optional(),
    endpointPath: NonEmptyStringSchema.optional(),
    apiKeyEnvVar: EnvVarNameSchema.optional(),
    timeoutMs: z.number().int().positive().optional()
  })
  .strict();
export type ProviderModelConfigRef = z.infer<typeof ProviderModelConfigRefSchema>;

export const RunBudgetSchema = z
  .object({
    maxEvents: z.number().int().positive().optional(),
    maxProviderCalls: z.number().int().nonnegative().optional(),
    maxEstimatedCostCents: z.number().int().nonnegative().optional(),
    maxRunSeconds: z.number().int().positive().optional()
  })
  .strict();
export type RunBudget = z.infer<typeof RunBudgetSchema>;

export const RunTimeoutsSchema = z
  .object({
    participantMs: z.number().int().positive().optional(),
    overallMs: z.number().int().positive().optional()
  })
  .strict();
export type RunTimeouts = z.infer<typeof RunTimeoutsSchema>;

export const RunOutputPreferencesSchema = z
  .object({
    language: NonEmptyStringSchema.optional(),
    style: NonEmptyStringSchema.optional(),
    expectations: z.array(NonEmptyStringSchema)
  })
  .strict();
export type RunOutputPreferences = z.infer<typeof RunOutputPreferencesSchema>;

export const RunSealedDivergenceConfigSchema = z
  .object({
    purpose: SealedBatchPurposeSchema,
    revealPolicy: z.enum(["all_completed", "manual"]),
    participantIds: z.array(IdSchema).optional()
  })
  .strict();
export type RunSealedDivergenceConfig = z.infer<typeof RunSealedDivergenceConfigSchema>;

export const RunResourceReferenceSchema = z
  .object({
    resourceId: IdSchema,
    required: z.boolean().optional(),
    preferredDeliveryMode: z.enum(["url", "base64", "none"]).optional()
  })
  .strict();
export type RunResourceReference = z.infer<typeof RunResourceReferenceSchema>;

export const DeliberationRunPlanSchema = z
  .object({
    title: NonEmptyStringSchema.optional(),
    topic: NonEmptyStringSchema,
    goals: z.array(NonEmptyStringSchema),
    constraints: z.array(NonEmptyStringSchema),
    participants: z.array(RunParticipantSchema).min(1),
    providerConfigs: z.array(ProviderModelConfigRefSchema),
    budget: RunBudgetSchema,
    timeouts: RunTimeoutsSchema,
    output: RunOutputPreferencesSchema,
    sealedDivergence: RunSealedDivergenceConfigSchema,
    resources: z.array(RunResourceReferenceSchema).optional()
  })
  .strict();
export type DeliberationRunPlan = z.infer<typeof DeliberationRunPlanSchema>;

export const RunErrorCategorySchema = z.enum([
  "adapter_failed",
  "adapter_timed_out",
  "budget_exceeded",
  "core_lifecycle_failed",
  "provider_auth_failed",
  "provider_not_found",
  "provider_rate_limited",
  "provider_timeout",
  "provider_network_error",
  "provider_http_error",
  "provider_malformed_response",
  "provider_config_invalid",
  "provider_response_empty",
  "provider_response_missing_content",
  "provider_secret_missing",
  "provider_unknown_error",
  "round_conflict",
  "unsupported_reveal_policy"
]);
export type RunErrorCategory = z.infer<typeof RunErrorCategorySchema>;

export const RunSafeDiagnosticsSchema = z
  .object({
    httpStatus: z.number().int().min(100).max(599).optional()
  })
  .strict();
export type RunSafeDiagnostics = z.infer<typeof RunSafeDiagnosticsSchema>;

export const ExtractionRunErrorCategorySchema = z.enum([
  "extraction_context_unavailable",
  "extraction_generator_failed",
  "extraction_validation_failed",
  "core_lifecycle_failed",
  "round_conflict"
]);
export type ExtractionRunErrorCategory = z.infer<typeof ExtractionRunErrorCategorySchema>;

export const ProposalReviewRunErrorCategorySchema = z.enum([
  "proposal_review_context_unavailable",
  "proposal_review_generator_failed",
  "proposal_review_validation_failed",
  "core_lifecycle_failed",
  "round_conflict"
]);
export type ProposalReviewRunErrorCategory = z.infer<
  typeof ProposalReviewRunErrorCategorySchema
>;

export const FinalizationRunErrorCategorySchema = z.enum([
  "finalization_context_unavailable",
  "final_candidate_generator_failed",
  "final_candidate_validation_failed",
  "final_audit_generator_failed",
  "final_audit_validation_failed",
  "core_lifecycle_failed",
  "outcome_compilation_failed",
  "round_conflict"
]);
export type FinalizationRunErrorCategory = z.infer<
  typeof FinalizationRunErrorCategorySchema
>;

export const ParticipantDispatchStatusSchema = z.enum([
  "pending",
  "running",
  "submitted",
  "failed",
  "timed_out",
  "skipped"
]);
export type ParticipantDispatchStatus = z.infer<typeof ParticipantDispatchStatusSchema>;

export const ParticipantDispatchStateSchema = z
  .object({
    participantId: IdSchema,
    adapterId: IdSchema,
    status: ParticipantDispatchStatusSchema,
    contributionEventId: IdSchema.optional(),
    errorCategory: RunErrorCategorySchema.optional(),
    safeDiagnostics: RunSafeDiagnosticsSchema.optional(),
    previousErrorCategories: z.array(RunErrorCategorySchema).optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: NonEmptyStringSchema.optional(),
    completedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type ParticipantDispatchState = z.infer<typeof ParticipantDispatchStateSchema>;

export const SealedDivergenceRoundStatusSchema = z.enum([
  "running",
  "waiting_for_participants",
  "waiting_for_reveal",
  "revealed",
  "failed"
]);
export type SealedDivergenceRoundStatus = z.infer<typeof SealedDivergenceRoundStatusSchema>;

export const RoundExecutionClaimSchema = z
  .object({
    ownerId: NonEmptyStringSchema,
    acquiredAt: NonEmptyStringSchema,
    expiresAt: NonEmptyStringSchema,
    status: z.literal("active")
  })
  .strict();
export type RoundExecutionClaim = z.infer<typeof RoundExecutionClaimSchema>;

export const SealedDivergenceRoundStateSchema = z
  .object({
    roundId: IdSchema,
    status: SealedDivergenceRoundStatusSchema,
    batchId: IdSchema.optional(),
    openedEventId: IdSchema.optional(),
    revealedEventId: IdSchema.optional(),
    participantDispatches: z.array(ParticipantDispatchStateSchema),
    providerCallCount: z.number().int().nonnegative(),
    lastErrorCategory: RunErrorCategorySchema.optional(),
    executionClaim: RoundExecutionClaimSchema.optional(),
    startedAt: NonEmptyStringSchema.optional(),
    updatedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type SealedDivergenceRoundState = z.infer<typeof SealedDivergenceRoundStateSchema>;

export const ExtractionGeneratorRunStatusSchema = z.enum([
  "pending",
  "running",
  "proposed",
  "failed",
  "skipped"
]);
export type ExtractionGeneratorRunStatus = z.infer<
  typeof ExtractionGeneratorRunStatusSchema
>;

export const ExtractionGeneratorStateSchema = z
  .object({
    generatorId: IdSchema,
    status: ExtractionGeneratorRunStatusSchema,
    proposalEventId: IdSchema.optional(),
    errorCategory: ExtractionRunErrorCategorySchema.optional(),
    previousErrorCategories: z.array(ExtractionRunErrorCategorySchema).optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: NonEmptyStringSchema.optional(),
    completedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type ExtractionGeneratorState = z.infer<typeof ExtractionGeneratorStateSchema>;

export const ExtractionRoundStatusSchema = z.enum([
  "running",
  "waiting_for_generators",
  "completed",
  "failed"
]);
export type ExtractionRoundStatus = z.infer<typeof ExtractionRoundStatusSchema>;

export const ExtractionRoundStateSchema = z
  .object({
    roundId: IdSchema,
    sourceSealedDivergenceRoundId: IdSchema,
    status: ExtractionRoundStatusSchema,
    generatorStates: z.array(ExtractionGeneratorStateSchema),
    proposalEventIds: z.array(IdSchema),
    lastErrorCategory: ExtractionRunErrorCategorySchema.optional(),
    executionClaim: RoundExecutionClaimSchema.optional(),
    startedAt: NonEmptyStringSchema.optional(),
    updatedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type ExtractionRoundState = z.infer<typeof ExtractionRoundStateSchema>;

export const ProposalReviewerRunStatusSchema = z.enum([
  "pending",
  "running",
  "reviewed",
  "failed",
  "timed_out",
  "skipped"
]);
export type ProposalReviewerRunStatus = z.infer<typeof ProposalReviewerRunStatusSchema>;

export const ProposalReviewerStateSchema = z
  .object({
    reviewerId: IdSchema,
    status: ProposalReviewerRunStatusSchema,
    challengeEventIds: z.array(IdSchema).optional(),
    errorCategory: ProposalReviewRunErrorCategorySchema.optional(),
    previousErrorCategories: z.array(ProposalReviewRunErrorCategorySchema).optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: NonEmptyStringSchema.optional(),
    completedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type ProposalReviewerState = z.infer<typeof ProposalReviewerStateSchema>;

export const ProposalReviewRoundStatusSchema = z.enum([
  "running",
  "waiting_for_reviewers",
  "completed",
  "failed"
]);
export type ProposalReviewRoundStatus = z.infer<typeof ProposalReviewRoundStatusSchema>;

export const ProposalReviewRoundStateSchema = z
  .object({
    roundId: IdSchema,
    sourceExtractionRoundId: IdSchema,
    status: ProposalReviewRoundStatusSchema,
    reviewerStates: z.array(ProposalReviewerStateSchema),
    proposalEventIds: z.array(IdSchema),
    challengeEventIds: z.array(IdSchema),
    acceptanceEventIds: z.array(IdSchema),
    lastErrorCategory: ProposalReviewRunErrorCategorySchema.optional(),
    executionClaim: RoundExecutionClaimSchema.optional(),
    startedAt: NonEmptyStringSchema.optional(),
    updatedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type ProposalReviewRoundState = z.infer<typeof ProposalReviewRoundStateSchema>;

export const FinalCandidateGenerationStatusSchema = z.enum([
  "pending",
  "running",
  "proposed",
  "failed",
  "skipped"
]);
export type FinalCandidateGenerationStatus = z.infer<
  typeof FinalCandidateGenerationStatusSchema
>;

export const FinalCandidateGenerationStateSchema = z
  .object({
    sourceId: IdSchema,
    sourceType: z.enum(["explicit", "generator"]),
    status: FinalCandidateGenerationStatusSchema,
    proposalEventId: IdSchema.optional(),
    errorCategory: FinalizationRunErrorCategorySchema.optional(),
    previousErrorCategories: z.array(FinalizationRunErrorCategorySchema).optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: NonEmptyStringSchema.optional(),
    completedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type FinalCandidateGenerationState = z.infer<
  typeof FinalCandidateGenerationStateSchema
>;

export const FinalAuditGenerationStatusSchema = z.enum([
  "pending",
  "running",
  "recorded",
  "failed",
  "skipped"
]);
export type FinalAuditGenerationStatus = z.infer<typeof FinalAuditGenerationStatusSchema>;

export const FinalAuditGenerationStateSchema = z
  .object({
    auditorId: IdSchema,
    status: FinalAuditGenerationStatusSchema,
    auditEventId: IdSchema.optional(),
    errorCategory: FinalizationRunErrorCategorySchema.optional(),
    previousErrorCategories: z.array(FinalizationRunErrorCategorySchema).optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: NonEmptyStringSchema.optional(),
    completedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type FinalAuditGenerationState = z.infer<typeof FinalAuditGenerationStateSchema>;

export const OutcomeCompilationMetadataSchema = z
  .object({
    status: z.enum(["not_requested", "compiled", "failed"]),
    compiledAt: NonEmptyStringSchema.optional(),
    projectionVersion: NonEmptyStringSchema.optional(),
    eventRange: z
      .object({
        fromSequence: z.number().int().nonnegative().nullable(),
        toSequence: z.number().int().nonnegative().nullable()
      })
      .strict()
      .optional(),
    eventIds: z.array(IdSchema).optional(),
    finalCandidateProposalEventId: IdSchema.optional(),
    finalAuditEventIds: z.array(IdSchema).optional(),
    errorCategory: FinalizationRunErrorCategorySchema.optional()
  })
  .strict();
export type OutcomeCompilationMetadata = z.infer<typeof OutcomeCompilationMetadataSchema>;

export const FinalizationRoundStatusSchema = z.enum([
  "running",
  "waiting_for_final_candidate",
  "waiting_for_auditors",
  "completed",
  "failed"
]);
export type FinalizationRoundStatus = z.infer<typeof FinalizationRoundStatusSchema>;

export const FinalizationRoundStateSchema = z
  .object({
    roundId: IdSchema,
    sourceProposalReviewRoundId: IdSchema.optional(),
    status: FinalizationRoundStatusSchema,
    finalCandidate: FinalCandidateGenerationStateSchema.optional(),
    auditorStates: z.array(FinalAuditGenerationStateSchema),
    finalCandidateProposalEventId: IdSchema.optional(),
    auditEventIds: z.array(IdSchema),
    outcomeCompilation: OutcomeCompilationMetadataSchema.optional(),
    lastErrorCategory: FinalizationRunErrorCategorySchema.optional(),
    executionClaim: RoundExecutionClaimSchema.optional(),
    startedAt: NonEmptyStringSchema.optional(),
    updatedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type FinalizationRoundState = z.infer<typeof FinalizationRoundStateSchema>;

export const DeliberationRunStatusSchema = z.enum([
  "created",
  "running",
  "waiting_for_participants",
  "waiting_for_reveal",
  "revealed",
  "failed",
  "cancelled"
]);
export type DeliberationRunStatus = z.infer<typeof DeliberationRunStatusSchema>;
export type RunOperationalStatus = DeliberationRunStatus;

export const DeliberationRunRecordSchema = z
  .object({
    id: IdSchema,
    schemaVersion: z.literal(ORCHESTRATOR_RUN_SCHEMA_VERSION),
    sessionId: IdSchema,
    status: DeliberationRunStatusSchema,
    plan: DeliberationRunPlanSchema,
    topicContractEventId: IdSchema,
    currentBatchId: IdSchema.optional(),
    sealedDivergenceRound: SealedDivergenceRoundStateSchema.optional(),
    extractionRounds: z.array(ExtractionRoundStateSchema).optional(),
    proposalReviewRounds: z.array(ProposalReviewRoundStateSchema).optional(),
    finalizationRounds: z.array(FinalizationRoundStateSchema).optional(),
    createdAt: NonEmptyStringSchema,
    updatedAt: NonEmptyStringSchema
  })
  .strict();
export type DeliberationRunRecord = z.infer<typeof DeliberationRunRecordSchema>;

export type ParticipantRegistryEntry = {
  id: string;
  kind: ParticipantKind;
  displayName: string;
  adapterId: string;
  providerConfigId?: string;
  profileId?: string;
  capabilities?: ParticipantCapabilities;
};

export type CreateDeliberationRunInput = {
  runPlan: unknown;
};

export type CreateDeliberationRunOptions = Pick<
  CreateSessionOptions,
  "eventStore" | "idGenerator" | "clock" | "schemaVersion"
> & {
  runStore: RunStore;
};

export type CreateDeliberationRunResult = {
  run: DeliberationRunRecord;
  session: {
    sessionId: string;
  };
  topicContractEvent: StoredEvent<TopicContract>;
};

export interface RunStore {
  createRun(input: DeliberationRunRecord): DeliberationRunRecord;
  updateRun(runId: string, update: RunStoreUpdate): DeliberationRunRecord;
  getRun(runId: string): DeliberationRunRecord | undefined;
  listRuns(): DeliberationRunRecord[];
}

export type RunStoreUpdate = (run: DeliberationRunRecord) => DeliberationRunRecord;

export type TopicContractBudgetLease = z.infer<typeof JsonRecordSchema>;
export type RunTopicContractPurpose = SealedBatchPurpose;

export const ExtractionGeneratorResultSchema = z
  .object({
    candidates: z.array(ExtractionCandidateSchema).optional(),
    claims: z.array(ExtractionClaimSchema).optional(),
    objections: z.array(ExtractionObjectionSchema).optional(),
    evidenceNeeds: z.array(ExtractionEvidenceNeedSchema).optional(),
    qualityObligations: z.array(ExtractionQualityObligationSchema).optional(),
    rationale: NonEmptyStringSchema
  })
  .strict();
export type ExtractionGeneratorResult = z.infer<typeof ExtractionGeneratorResultSchema>;

export type RedactedEventPayload = {
  redacted: true;
  reason: "event_visibility" | "sealed_until_reveal";
};

export type VisibleContextEvent = {
  id: string;
  type: string;
  sessionId: string;
  sequence: number;
  authorId: string;
  createdAt: string;
  recordedAt: string;
  visibility: EventVisibility | string;
  batchId?: string;
  basedOnEventIds: string[];
  trace: EventTrace;
  payload: JsonValue | RedactedEventPayload;
};

export type ParticipantContextMetadata = {
  version: "1";
  eventRange: {
    fromSequence: number;
    toSequence: number;
  } | null;
  eventIds: string[];
  redactedEventIds: string[];
};

export type ContextResourceReference = RunResourceReference;

export type ParticipantDeliberationContext = {
  runId: string;
  sessionId: string;
  participant: ParticipantRegistryEntry;
  topic: string;
  goals: string[];
  constraints: string[];
  output: RunOutputPreferences;
  resources: ContextResourceReference[];
  events: VisibleContextEvent[];
  metadata: ParticipantContextMetadata;
};

export type ExtractionContextPublicEvent = {
  id: string;
  type: string;
  sessionId: string;
  sequence: number;
  authorId: string;
  createdAt: string;
  recordedAt: string;
  visibility: EventVisibility | string;
  batchId?: string;
  basedOnEventIds: string[];
  trace: EventTrace;
};

export type ExtractionContextContribution = ExtractionContextPublicEvent & {
  participantId: string;
  payload: JsonValue;
};

export type ExtractionContextMetadata = {
  version: "1";
  sourceSealedDivergenceRoundId: string;
  batchId: string;
  revealedEventId: string;
  allowedSourceEventIds: string[];
  eventRange: {
    fromSequence: number;
    toSequence: number;
  } | null;
};

export type ExtractionContext = {
  runId: string;
  sessionId: string;
  topic: string;
  goals: string[];
  constraints: string[];
  output: RunOutputPreferences;
  participants: ParticipantRegistryEntry[];
  contributions: ExtractionContextContribution[];
  publicEvents: ExtractionContextPublicEvent[];
  metadata: ExtractionContextMetadata;
};

export type BuildExtractionContextInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  sealedDivergenceRoundId?: string;
};

export type BuildParticipantContextInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  participantId: string;
};

export type AdapterRegistryEntry = {
  adapterId: string;
  capabilities: AdapterCapabilities;
};

export type RegisteredParticipantAdapter = ParticipantAdapter;

export type ProviderRuntimeConfig = {
  id: string;
  adapterId: string;
  providerConfigId?: string;
  modelId?: string;
  baseUrl?: string;
  endpointPath?: string;
  timeoutMs?: number;
  apiKeyEnvVar?: string;
  apiKey?: string;
};

export type ProviderConfigSafeView = {
  id: string;
  adapterId: string;
  providerConfigId?: string;
  modelId?: string;
  baseUrl?: string;
  endpointPath?: string;
  timeoutMs?: number;
  apiKeyEnvVar?: string;
  hasApiKey: boolean;
};

export type ProviderSecretResolverInput = {
  providerConfig: ProviderModelConfigRef;
  env?: Record<string, string | undefined>;
};

export type BuildParticipantDispatchInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  adapterRegistry: {
    require(adapterId: string): RegisteredParticipantAdapter;
  };
  participantId: string;
  env?: Record<string, string | undefined>;
};

export type ParticipantDispatchEnvelope = {
  runId: string;
  sessionId: string;
  participantId: string;
  adapterId: string;
  adapter: RegisteredParticipantAdapter;
  context: ParticipantDeliberationContext;
  adapterInput: ParticipantAdapterInput;
  adapterContext: ParticipantAdapterContext;
  providerSafeView?: ProviderConfigSafeView;
  providerRuntimeConfig?: ProviderRuntimeConfig;
};

export type ExtractionGeneratorInput = {
  instructions: string;
  context: ExtractionContext;
};

export interface ExtractionGenerator {
  generatorId: string;
  generateExtractionProposal(
    input: ExtractionGeneratorInput,
    context: ExtractionContext
  ): Promise<ExtractionGeneratorResult> | ExtractionGeneratorResult;
}

export type ExtractionGeneratorRegistryEntry = {
  generatorId: string;
};

export type ExtractionGeneratorDraft = {
  candidates: ExtractionCandidate[];
  claims: ExtractionClaim[];
  objections: ExtractionObjection[];
  evidenceNeeds: ExtractionEvidenceNeed[];
  qualityObligations: ExtractionQualityObligation[];
  rationale: string;
};

export type RunSealedDivergenceRoundInput = {
  runId: string;
  roundId?: string;
  autoCloseManual?: boolean;
  retryFailedParticipants?: boolean;
  env?: Record<string, string | undefined>;
};

export type RunSealedDivergenceRoundOptions = Pick<
  SealedDivergenceOptions,
  "eventStore" | "schemaVersion"
> & {
  runStore: RunStore;
  adapterRegistry: {
    require(adapterId: string): RegisteredParticipantAdapter;
  };
  idGenerator: IdGenerator;
  clock?: Clock;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type ParticipantRoundResult = {
  participantId: string;
  adapterId: string;
  status: ParticipantDispatchStatus;
  contributionEventId?: string;
  appended?: boolean;
  errorCategory?: RunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
};

export type RunSealedDivergenceRoundResult = {
  run: DeliberationRunRecord;
  roundId: string;
  executionStatus: "executed" | "already_running" | "already_revealed";
  batchId?: string;
  openedEventId?: string;
  openedAppended?: boolean;
  participantResults: ParticipantRoundResult[];
  revealedEventId?: string;
  revealAppended?: boolean;
};

export type RunExtractionProposalRoundInput = {
  runId: string;
  roundId?: string;
  sealedDivergenceRoundId?: string;
  generatorIds?: readonly string[];
  retryFailedGenerators?: boolean;
};

export type RunExtractionProposalRoundOptions = {
  eventStore: EventStore;
  runStore: RunStore;
  extractionGeneratorRegistry: {
    require(generatorId: string): ExtractionGenerator;
    list(): ExtractionGeneratorRegistryEntry[];
  };
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type ExtractionGeneratorRoundResult = {
  generatorId: string;
  status: ExtractionGeneratorRunStatus;
  proposalEventId?: string;
  appended?: boolean;
  errorCategory?: ExtractionRunErrorCategory;
};

export type RunExtractionProposalRoundResult = {
  run: DeliberationRunRecord;
  roundId: string;
  executionStatus: "executed" | "already_running" | "already_completed";
  proposalResults: ExtractionGeneratorRoundResult[];
};

export const ProposalReviewChallengeDraftSchema = z
  .object({
    targetProposalEventId: IdSchema,
    reason: NonEmptyStringSchema
  })
  .strict();
export type ProposalReviewChallengeDraft = z.infer<
  typeof ProposalReviewChallengeDraftSchema
>;

export const ProposalReviewGeneratorResultSchema = z
  .object({
    challenges: z.array(ProposalReviewChallengeDraftSchema).optional(),
    notes: z.array(NonEmptyStringSchema).optional()
  })
  .strict();
export type ProposalReviewGeneratorResult = z.infer<
  typeof ProposalReviewGeneratorResultSchema
>;

export type ProposalReviewContextMetadata = {
  version: "1";
  sourceExtractionRoundId: string;
  proposalEventIds: string[];
  eventRange: {
    fromSequence: number;
    toSequence: number;
  } | null;
  eventIds: string[];
};

export type ProposalReviewContext = {
  runId: string;
  sessionId: string;
  topic: string;
  goals: string[];
  constraints: string[];
  output: RunOutputPreferences;
  sourceExtractionRoundId: string;
  proposalStates: ExtractionProposalState[];
  acceptedObjects: AcceptedDeliberationObjectsProjection;
  frontier: CandidateFrontierProjection;
  qualityObligations: QualityObligationsProjection;
  metadata: ProposalReviewContextMetadata;
  runMetadata: {
    status: RunOperationalStatus;
    participantIds: string[];
    extractionRoundStatus: ExtractionRoundStatus;
  };
};

export type ProposalReviewGeneratorInput = {
  instructions: string;
  context: ProposalReviewContext;
};

export interface ProposalReviewGenerator {
  reviewerId: string;
  reviewProposals(
    input: ProposalReviewGeneratorInput,
    context: ProposalReviewContext
  ): Promise<ProposalReviewGeneratorResult> | ProposalReviewGeneratorResult;
}

export type ProposalReviewGeneratorRegistryEntry = {
  reviewerId: string;
};

export const ExtractionAcceptancePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }).strict(),
  z
    .object({
      mode: z.literal("explicit_proposal_event_ids"),
      proposalEventIds: z.array(IdSchema),
      authorId: IdSchema,
      rationale: NonEmptyStringSchema,
      allowChallenged: z.boolean().optional()
    })
    .strict(),
  z
    .object({
      mode: z.literal("all_generated_unchallenged"),
      authorId: IdSchema,
      rationale: NonEmptyStringSchema
    })
    .strict()
]);
export type ExtractionAcceptancePolicy = z.infer<typeof ExtractionAcceptancePolicySchema>;

export type BuildProposalReviewContextInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  extractionRoundId?: string;
};

export type RunProposalReviewRoundInput = {
  runId: string;
  roundId?: string;
  extractionRoundId?: string;
  reviewerIds?: readonly string[];
  retryFailedReviewers?: boolean;
  acceptancePolicy?: ExtractionAcceptancePolicy;
};

export type RunProposalReviewRoundOptions = {
  eventStore: EventStore;
  runStore: RunStore;
  proposalReviewGeneratorRegistry: {
    require(reviewerId: string): ProposalReviewGenerator;
    list(): ProposalReviewGeneratorRegistryEntry[];
  };
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type ProposalReviewerRoundResult = {
  reviewerId: string;
  status: ProposalReviewerRunStatus;
  challengeEventIds?: string[];
  appendedChallengeEventIds?: string[];
  errorCategory?: ProposalReviewRunErrorCategory;
};

export type ProposalAcceptanceRoundResult = {
  proposalEventId: string;
  status: "accepted" | "skipped" | "rejected";
  acceptanceEventId?: string;
  appended?: boolean;
  errorCategory?: ProposalReviewRunErrorCategory;
};

export type RunProposalReviewRoundResult = {
  run: DeliberationRunRecord;
  roundId: string;
  executionStatus: "executed" | "already_running" | "already_completed";
  reviewResults: ProposalReviewerRoundResult[];
  acceptanceResults: ProposalAcceptanceRoundResult[];
};

export const FinalCandidateGeneratorResultSchema = z
  .object({
    candidateIds: z.array(IdSchema).min(1),
    recommendation: NonEmptyStringSchema,
    applicabilityConditions: z.array(NonEmptyStringSchema).optional(),
    rationale: NonEmptyStringSchema,
    limitations: z.array(NonEmptyStringSchema).optional()
  })
  .strict();
export type FinalCandidateGeneratorResult = z.infer<
  typeof FinalCandidateGeneratorResultSchema
>;
export type ExplicitFinalCandidateDraft = FinalCandidateGeneratorResult;

export const FinalAuditGeneratorResultSchema = FinalAuditSchema.omit({
  id: true,
  targetFinalCandidateProposalEventId: true,
  status: true
}).partial();
export type FinalAuditGeneratorResult = z.infer<typeof FinalAuditGeneratorResultSchema>;

export type FinalizationContextPublicEvent = {
  id: string;
  type: string;
  sessionId: string;
  sequence: number;
  authorId: string;
  createdAt: string;
  recordedAt: string;
  visibility: EventVisibility | string;
  basedOnEventIds: string[];
  trace: EventTrace;
};

export type FinalizationContextMetadata = {
  version: "1";
  sourceProposalReviewRoundId?: string;
  acceptanceEventIds: string[];
  eventRange: ProjectionMetadata["eventRange"];
  eventIds: string[];
};

export type FinalizationContext = {
  runId: string;
  sessionId: string;
  topic: string;
  goals: string[];
  constraints: string[];
  output: RunOutputPreferences;
  acceptedObjects: AcceptedDeliberationObjectsProjection;
  frontier: CandidateFrontierProjection;
  qualityObligations: QualityObligationsProjection;
  unresolvedObjectionIds: string[];
  evidenceNeedIds: string[];
  publicEvents: FinalizationContextPublicEvent[];
  metadata: FinalizationContextMetadata;
  runMetadata: {
    status: RunOperationalStatus;
    participantIds: string[];
    proposalReviewRoundStatus?: ProposalReviewRoundStatus;
  };
};

export type BuildFinalizationContextInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  proposalReviewRoundId?: string;
};

export type FinalCandidateGeneratorInput = {
  instructions: string;
  context: FinalizationContext;
};

export interface FinalCandidateGenerator {
  generatorId: string;
  proposeFinalCandidate(
    input: FinalCandidateGeneratorInput,
    context: FinalizationContext
  ): Promise<FinalCandidateGeneratorResult> | FinalCandidateGeneratorResult;
}

export type FinalCandidateGeneratorRegistryEntry = {
  generatorId: string;
};

export type FinalAuditGeneratorInput = {
  instructions: string;
  context: FinalizationContext;
  finalCandidateProposalEventId: string;
};

export interface FinalAuditGenerator {
  auditorId: string;
  auditFinalCandidate(
    input: FinalAuditGeneratorInput,
    context: FinalizationContext
  ): Promise<FinalAuditGeneratorResult> | FinalAuditGeneratorResult;
}

export type FinalAuditGeneratorRegistryEntry = {
  auditorId: string;
};

export type RunFinalizationRoundInput = {
  runId: string;
  roundId?: string;
  proposalReviewRoundId?: string;
  finalCandidateDraft?: ExplicitFinalCandidateDraft;
  finalCandidateGeneratorId?: string;
  auditGeneratorIds?: readonly string[];
  retryFailedFinalCandidate?: boolean;
  retryFailedAuditors?: boolean;
  compileOutcome?: boolean;
};

export type RunFinalizationRoundOptions = {
  eventStore: EventStore;
  runStore: RunStore;
  finalCandidateGeneratorRegistry: {
    require(generatorId: string): FinalCandidateGenerator;
    list(): FinalCandidateGeneratorRegistryEntry[];
  };
  finalAuditGeneratorRegistry: {
    require(auditorId: string): FinalAuditGenerator;
    list(): FinalAuditGeneratorRegistryEntry[];
  };
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type FinalCandidateRoundResult = {
  sourceId: string;
  sourceType: "explicit" | "generator";
  status: FinalCandidateGenerationStatus;
  proposalEventId?: string;
  appended?: boolean;
  errorCategory?: FinalizationRunErrorCategory;
};

export type FinalAuditRoundResult = {
  auditorId: string;
  status: FinalAuditGenerationStatus;
  auditEventId?: string;
  appended?: boolean;
  errorCategory?: FinalizationRunErrorCategory;
};

export type RunFinalizationRoundResult = {
  run: DeliberationRunRecord;
  roundId: string;
  executionStatus: "executed" | "already_running" | "already_completed";
  finalCandidateResult?: FinalCandidateRoundResult;
  auditResults: FinalAuditRoundResult[];
  outcomeCompilation?: OutcomeCompilationMetadata;
  outcome?: OutcomeCompilationResult;
};
