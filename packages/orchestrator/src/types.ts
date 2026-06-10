import { z } from "zod";
import {
  IdSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  ParticipantCapabilitiesSchema,
  ParticipantKindSchema,
  SealedBatchPurposeSchema,
  type ParticipantCapabilities,
  type ParticipantKind,
  type SealedBatchPurpose,
  type TopicContract
} from "@deliberum/protocol";
import type { CreateSessionOptions } from "@deliberum/core";
import type { StoredEvent } from "@deliberum/storage";

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

export const DeliberationRunStatusSchema = z.enum(["created"]);
export type DeliberationRunStatus = z.infer<typeof DeliberationRunStatusSchema>;

export const DeliberationRunRecordSchema = z
  .object({
    id: IdSchema,
    schemaVersion: z.literal(ORCHESTRATOR_RUN_SCHEMA_VERSION),
    sessionId: IdSchema,
    status: DeliberationRunStatusSchema,
    plan: DeliberationRunPlanSchema,
    topicContractEventId: IdSchema,
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
  getRun(runId: string): DeliberationRunRecord | undefined;
  listRuns(): DeliberationRunRecord[];
}

export type TopicContractBudgetLease = z.infer<typeof JsonRecordSchema>;
export type RunTopicContractPurpose = SealedBatchPurpose;
