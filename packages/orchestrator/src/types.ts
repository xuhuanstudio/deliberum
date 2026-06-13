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
  DerivedCandidate,
  DerivedClaim,
  DerivedEvidenceNeed,
  DerivedObjection,
  DerivedQualityObligation,
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
export const OpenAICompatibleTokenParameterSchema = z.enum([
  "none",
  "max_tokens",
  "max_completion_tokens"
]);
export const OpenAICompatibleThinkingSchema = z.literal("disabled");
export const OpenAICompatibleResponseFormatSchema = z.literal("json_object");
export const OpenAICompatibleRequestOptionsSchema = z
  .object({
    tokenParameter: OpenAICompatibleTokenParameterSchema.optional(),
    maxCompletionTokens: z.number().int().positive().optional(),
    temperature: z.number().finite().min(0).max(2).optional(),
    topP: z.number().finite().min(0).max(1).optional(),
    stream: z.boolean().optional(),
    frequencyPenalty: z.number().finite().min(-2).max(2).optional(),
    presencePenalty: z.number().finite().min(-2).max(2).optional(),
    thinking: OpenAICompatibleThinkingSchema.optional(),
    responseFormat: OpenAICompatibleResponseFormatSchema.optional()
  })
  .strict();
export type OpenAICompatibleRequestOptions = z.infer<
  typeof OpenAICompatibleRequestOptionsSchema
>;
export const HttpTemplateRuntimeConfigSchema = z
  .object({
    variables: JsonRecordSchema.optional()
  })
  .strict();
export type HttpTemplateRuntimeConfig = z.infer<typeof HttpTemplateRuntimeConfigSchema>;

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
    timeoutMs: z.number().int().positive().optional(),
    tokenParameter: OpenAICompatibleTokenParameterSchema.optional(),
    maxCompletionTokens: z.number().int().positive().optional(),
    temperature: z.number().finite().min(0).max(2).optional(),
    topP: z.number().finite().min(0).max(1).optional(),
    stream: z.boolean().optional(),
    frequencyPenalty: z.number().finite().min(-2).max(2).optional(),
    presencePenalty: z.number().finite().min(-2).max(2).optional(),
    thinking: OpenAICompatibleThinkingSchema.optional(),
    httpTemplate: HttpTemplateRuntimeConfigSchema.optional()
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

export const RunSafeProviderResponseShapeSchema = z.enum([
  "empty_text",
  "invalid_json_object",
  "json_array",
  "json_non_object",
  "prose_with_json_object",
  "single_fenced_invalid_json",
  "single_fenced_json_array",
  "single_fenced_json_non_object",
  "single_fenced_other_text",
  "other_text"
]);
export type RunSafeProviderResponseShape = z.infer<
  typeof RunSafeProviderResponseShapeSchema
>;

export const RunSafeDiagnosticsSchema = z
  .object({
    httpStatus: z.number().int().min(100).max(599).optional(),
    providerResponseShape: RunSafeProviderResponseShapeSchema.optional()
  })
  .strict();
export type RunSafeDiagnostics = z.infer<typeof RunSafeDiagnosticsSchema>;

export const ExtractionRunErrorCategorySchema = z.enum([
  "extraction_context_unavailable",
  "extraction_generator_failed",
  "extraction_output_invalid",
  "extraction_validation_failed",
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
  "core_lifecycle_failed",
  "round_conflict"
]);
export type ExtractionRunErrorCategory = z.infer<typeof ExtractionRunErrorCategorySchema>;

export const CandidateRepairRunErrorCategorySchema = z.enum([
  "candidate_repair_context_unavailable",
  "candidate_repair_generator_failed",
  "candidate_repair_validation_failed",
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
  "core_lifecycle_failed",
  "round_conflict"
]);
export type CandidateRepairRunErrorCategory = z.infer<
  typeof CandidateRepairRunErrorCategorySchema
>;

export const EvidenceCheckRunErrorCategorySchema = z.enum([
  "evidence_check_context_unavailable",
  "evidence_check_generator_failed",
  "evidence_check_validation_failed",
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
  "core_lifecycle_failed",
  "round_conflict"
]);
export type EvidenceCheckRunErrorCategory = z.infer<
  typeof EvidenceCheckRunErrorCategorySchema
>;

export const ProposalReviewRunErrorCategorySchema = z.enum([
  "proposal_review_context_unavailable",
  "proposal_review_generator_failed",
  "proposal_review_validation_failed",
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
    safeDiagnostics: RunSafeDiagnosticsSchema.optional(),
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

export const CandidateRepairGeneratorRunStatusSchema = z.enum([
  "pending",
  "running",
  "proposed",
  "failed",
  "skipped"
]);
export type CandidateRepairGeneratorRunStatus = z.infer<
  typeof CandidateRepairGeneratorRunStatusSchema
>;

export const CandidateRepairGeneratorStateSchema = z
  .object({
    generatorId: IdSchema,
    status: CandidateRepairGeneratorRunStatusSchema,
    proposalEventId: IdSchema.optional(),
    errorCategory: CandidateRepairRunErrorCategorySchema.optional(),
    safeDiagnostics: RunSafeDiagnosticsSchema.optional(),
    previousErrorCategories: z.array(CandidateRepairRunErrorCategorySchema).optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: NonEmptyStringSchema.optional(),
    completedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type CandidateRepairGeneratorState = z.infer<
  typeof CandidateRepairGeneratorStateSchema
>;

export const CandidateRepairRoundStatusSchema = z.enum([
  "running",
  "waiting_for_generators",
  "completed",
  "failed"
]);
export type CandidateRepairRoundStatus = z.infer<
  typeof CandidateRepairRoundStatusSchema
>;

export const CandidateRepairRoundStateSchema = z
  .object({
    roundId: IdSchema,
    targetCandidateIds: z.array(IdSchema),
    status: CandidateRepairRoundStatusSchema,
    generatorStates: z.array(CandidateRepairGeneratorStateSchema),
    proposalEventIds: z.array(IdSchema),
    lastErrorCategory: CandidateRepairRunErrorCategorySchema.optional(),
    executionClaim: RoundExecutionClaimSchema.optional(),
    startedAt: NonEmptyStringSchema.optional(),
    updatedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type CandidateRepairRoundState = z.infer<typeof CandidateRepairRoundStateSchema>;

export const EvidenceCheckGeneratorRunStatusSchema = z.enum([
  "pending",
  "running",
  "recorded",
  "failed",
  "skipped"
]);
export type EvidenceCheckGeneratorRunStatus = z.infer<
  typeof EvidenceCheckGeneratorRunStatusSchema
>;

export const EvidenceCheckGeneratorStateSchema = z
  .object({
    generatorId: IdSchema,
    status: EvidenceCheckGeneratorRunStatusSchema,
    evidenceResultEventIds: z.array(IdSchema).optional(),
    errorCategory: EvidenceCheckRunErrorCategorySchema.optional(),
    safeDiagnostics: RunSafeDiagnosticsSchema.optional(),
    previousErrorCategories: z.array(EvidenceCheckRunErrorCategorySchema).optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: NonEmptyStringSchema.optional(),
    completedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type EvidenceCheckGeneratorState = z.infer<typeof EvidenceCheckGeneratorStateSchema>;

export const EvidenceCheckRoundStatusSchema = z.enum([
  "running",
  "waiting_for_generators",
  "completed",
  "failed"
]);
export type EvidenceCheckRoundStatus = z.infer<typeof EvidenceCheckRoundStatusSchema>;

export const EvidenceCheckRoundStateSchema = z
  .object({
    roundId: IdSchema,
    targetEvidenceNeedIds: z.array(IdSchema),
    status: EvidenceCheckRoundStatusSchema,
    generatorStates: z.array(EvidenceCheckGeneratorStateSchema),
    evidenceResultEventIds: z.array(IdSchema),
    lastErrorCategory: EvidenceCheckRunErrorCategorySchema.optional(),
    executionClaim: RoundExecutionClaimSchema.optional(),
    startedAt: NonEmptyStringSchema.optional(),
    updatedAt: NonEmptyStringSchema.optional()
  })
  .strict();
export type EvidenceCheckRoundState = z.infer<typeof EvidenceCheckRoundStateSchema>;

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
    safeDiagnostics: RunSafeDiagnosticsSchema.optional(),
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
    sourceType: z.enum(["explicit", "generator", "existing_proposal"]),
    status: FinalCandidateGenerationStatusSchema,
    proposalEventId: IdSchema.optional(),
    errorCategory: FinalizationRunErrorCategorySchema.optional(),
    safeDiagnostics: RunSafeDiagnosticsSchema.optional(),
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
    safeDiagnostics: RunSafeDiagnosticsSchema.optional(),
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
    candidateRepairRounds: z.array(CandidateRepairRoundStateSchema).optional(),
    evidenceCheckRounds: z.array(EvidenceCheckRoundStateSchema).optional(),
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

export type CandidateRepairContextMetadata = {
  version: "1";
  targetCandidateIds: string[];
  allowedSourceEventIds: string[];
  eventRange: {
    fromSequence: number;
    toSequence: number;
  } | null;
  eventIds: string[];
};

export type CandidateRepairContext = {
  runId: string;
  sessionId: string;
  topic: string;
  goals: string[];
  constraints: string[];
  output: RunOutputPreferences;
  targetCandidates: DerivedCandidate[];
  unresolvedObjections: DerivedObjection[];
  qualityObligations: DerivedQualityObligation[];
  acceptedObjects: AcceptedDeliberationObjectsProjection;
  frontier: CandidateFrontierProjection;
  metadata: CandidateRepairContextMetadata;
};

export type BuildCandidateRepairContextInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  targetCandidateIds?: readonly string[];
};

export type EvidenceCheckContextMetadata = {
  version: "1";
  targetEvidenceNeedIds: string[];
  eventRange: {
    fromSequence: number;
    toSequence: number;
  } | null;
  eventIds: string[];
};

export type EvidenceCheckContext = {
  runId: string;
  sessionId: string;
  topic: string;
  goals: string[];
  constraints: string[];
  output: RunOutputPreferences;
  targetEvidenceNeeds: DerivedEvidenceNeed[];
  targetClaims: DerivedClaim[];
  acceptedObjects: AcceptedDeliberationObjectsProjection;
  metadata: EvidenceCheckContextMetadata;
};

export type BuildEvidenceCheckContextInput = {
  run: DeliberationRunRecord;
  eventStore: EventStore;
  targetEvidenceNeedIds?: readonly string[];
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
  requestOptions?: OpenAICompatibleRequestOptions;
  httpTemplate?: HttpTemplateRuntimeConfig;
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
  requestOptions?: OpenAICompatibleRequestOptions;
  httpTemplate?: HttpTemplateRuntimeConfig;
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
  adapterId?: string;
  providerConfigId?: string;
  generateExtractionProposal(
    input: ExtractionGeneratorInput,
    context: ExtractionContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
  ): Promise<ExtractionGeneratorResult> | ExtractionGeneratorResult;
}

export type ExtractionGeneratorRegistryEntry = {
  generatorId: string;
};

export type CandidateRepairGeneratorResult = ExtractionGeneratorResult;

export type CandidateRepairGeneratorInput = {
  instructions: string;
  context: CandidateRepairContext;
};

export interface CandidateRepairGenerator {
  generatorId: string;
  adapterId?: string;
  providerConfigId?: string;
  repairCandidate(
    input: CandidateRepairGeneratorInput,
    context: CandidateRepairContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
  ): Promise<CandidateRepairGeneratorResult> | CandidateRepairGeneratorResult;
}

export type CandidateRepairGeneratorRegistryEntry = {
  generatorId: string;
};

export const EvidenceCheckResultDraftSchema = z
  .object({
    evidenceNeedId: IdSchema,
    source: NonEmptyStringSchema,
    summary: NonEmptyStringSchema,
    resourceIds: z.array(IdSchema).optional(),
    limitations: z.array(NonEmptyStringSchema).optional(),
    challengedBy: z.array(IdSchema).optional()
  })
  .strict();
export type EvidenceCheckResultDraft = z.infer<typeof EvidenceCheckResultDraftSchema>;

export const EvidenceCheckGeneratorResultSchema = z
  .object({
    results: z.array(EvidenceCheckResultDraftSchema),
    rationale: NonEmptyStringSchema
  })
  .strict();
export type EvidenceCheckGeneratorResult = z.infer<
  typeof EvidenceCheckGeneratorResultSchema
>;

export type EvidenceCheckGeneratorInput = {
  instructions: string;
  context: EvidenceCheckContext;
};

export interface EvidenceCheckGenerator {
  generatorId: string;
  adapterId?: string;
  providerConfigId?: string;
  checkEvidence(
    input: EvidenceCheckGeneratorInput,
    context: EvidenceCheckContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
  ): Promise<EvidenceCheckGeneratorResult> | EvidenceCheckGeneratorResult;
}

export type EvidenceCheckGeneratorRegistryEntry = {
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
  env?: Record<string, string | undefined>;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type ExtractionGeneratorRoundResult = {
  generatorId: string;
  status: ExtractionGeneratorRunStatus;
  proposalEventId?: string;
  appended?: boolean;
  errorCategory?: ExtractionRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
};

export type RunExtractionProposalRoundResult = {
  run: DeliberationRunRecord;
  roundId: string;
  executionStatus: "executed" | "already_running" | "already_completed";
  proposalResults: ExtractionGeneratorRoundResult[];
};

export type RunCandidateRepairRoundInput = {
  runId: string;
  roundId?: string;
  targetCandidateIds?: readonly string[];
  generatorIds?: readonly string[];
  retryFailedGenerators?: boolean;
};

export type RunCandidateRepairRoundOptions = {
  eventStore: EventStore;
  runStore: RunStore;
  candidateRepairGeneratorRegistry: {
    require(generatorId: string): CandidateRepairGenerator;
    list(): CandidateRepairGeneratorRegistryEntry[];
  };
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
  env?: Record<string, string | undefined>;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type CandidateRepairGeneratorRoundResult = {
  generatorId: string;
  status: CandidateRepairGeneratorRunStatus;
  proposalEventId?: string;
  appended?: boolean;
  errorCategory?: CandidateRepairRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
};

export type RunCandidateRepairRoundResult = {
  run: DeliberationRunRecord;
  roundId: string;
  executionStatus: "executed" | "already_running" | "already_completed";
  proposalResults: CandidateRepairGeneratorRoundResult[];
};

export type RunEvidenceCheckRoundInput = {
  runId: string;
  roundId?: string;
  targetEvidenceNeedIds?: readonly string[];
  generatorIds?: readonly string[];
  retryFailedGenerators?: boolean;
};

export type RunEvidenceCheckRoundOptions = {
  eventStore: EventStore;
  runStore: RunStore;
  evidenceCheckGeneratorRegistry: {
    require(generatorId: string): EvidenceCheckGenerator;
    list(): EvidenceCheckGeneratorRegistryEntry[];
  };
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
  env?: Record<string, string | undefined>;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type EvidenceCheckGeneratorRoundResult = {
  generatorId: string;
  status: EvidenceCheckGeneratorRunStatus;
  evidenceResultEventIds?: string[];
  appended?: boolean;
  errorCategory?: EvidenceCheckRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
};

export type RunEvidenceCheckRoundResult = {
  run: DeliberationRunRecord;
  roundId: string;
  executionStatus: "executed" | "already_running" | "already_completed";
  evidenceResults: EvidenceCheckGeneratorRoundResult[];
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
  adapterId?: string;
  providerConfigId?: string;
  reviewProposals(
    input: ProposalReviewGeneratorInput,
    context: ProposalReviewContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
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
  env?: Record<string, string | undefined>;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type ProposalReviewerRoundResult = {
  reviewerId: string;
  status: ProposalReviewerRunStatus;
  challengeEventIds?: string[];
  appendedChallengeEventIds?: string[];
  errorCategory?: ProposalReviewRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
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
  adapterId?: string;
  providerConfigId?: string;
  proposeFinalCandidate(
    input: FinalCandidateGeneratorInput,
    context: FinalizationContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
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
  adapterId?: string;
  providerConfigId?: string;
  auditFinalCandidate(
    input: FinalAuditGeneratorInput,
    context: FinalizationContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
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
  finalCandidateProposalEventId?: string;
  finalCandidateGeneratorId?: string;
  auditGeneratorIds?: readonly string[];
  retryFailedFinalCandidate?: boolean;
  retryFailedAuditors?: boolean;
  compileOutcome?: boolean;
};

export type RunFinalizationRoundOptions = {
  eventStore: EventStore;
  runStore: RunStore;
  finalCandidateGeneratorRegistry?: {
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
  env?: Record<string, string | undefined>;
  executionClaimTtlMs?: number;
  executionClaimOwnerIdGenerator?: () => string;
};

export type FinalCandidateRoundResult = {
  sourceId: string;
  sourceType: "explicit" | "generator" | "existing_proposal";
  status: FinalCandidateGenerationStatus;
  proposalEventId?: string;
  appended?: boolean;
  errorCategory?: FinalizationRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
};

export type FinalAuditRoundResult = {
  auditorId: string;
  status: FinalAuditGenerationStatus;
  auditEventId?: string;
  appended?: boolean;
  errorCategory?: FinalizationRunErrorCategory;
  safeDiagnostics?: RunSafeDiagnostics;
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
