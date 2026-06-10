import { z } from "zod";
import {
  IdSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  ParticipantCapabilitiesSchema,
  ParticipantKindSchema,
  SealedBatchPurposeSchema,
  type EventTrace,
  type EventVisibility,
  type ParticipantCapabilities,
  type ParticipantKind,
  type JsonValue,
  type SealedBatchPurpose,
  type TopicContract
} from "@deliberum/protocol";
import type {
  Clock,
  CreateSessionOptions,
  IdGenerator,
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
  "provider_secret_missing",
  "round_conflict",
  "unsupported_reveal_policy"
]);
export type RunErrorCategory = z.infer<typeof RunErrorCategorySchema>;

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
