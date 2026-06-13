import { z } from "zod";
import { IdSchema, JsonValueSchema, NonEmptyStringSchema, TimestampStringSchema } from "./common";

const NonnegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();

export const SealedBatchPurposeSchema = z.enum([
  "initial_divergence",
  "relation_mapping",
  "final_contest",
  "blind_reframe"
]);
export type SealedBatchPurpose = z.infer<typeof SealedBatchPurposeSchema>;

export const SealedBatchRevealPolicySchema = z.enum([
  "all_completed",
  "quorum",
  "deadline",
  "manual"
]);
export type SealedBatchRevealPolicy = z.infer<typeof SealedBatchRevealPolicySchema>;

export const BudgetLeaseSchema = z
  .object({
    maxEvents: PositiveIntegerSchema.optional(),
    maxProviderCalls: NonnegativeIntegerSchema.optional(),
    maxEstimatedCostCents: NonnegativeIntegerSchema.optional(),
    maxRunSeconds: PositiveIntegerSchema.optional(),
    participantTimeoutMs: PositiveIntegerSchema.optional(),
    overallTimeoutMs: PositiveIntegerSchema.optional()
  })
  .catchall(JsonValueSchema);
export type BudgetLease = z.infer<typeof BudgetLeaseSchema>;

export const GovernanceRuleSchema = z
  .object({
    id: IdSchema.optional(),
    description: NonEmptyStringSchema.optional(),
    orchestratedRun: z.boolean().optional(),
    runSchemaVersion: NonEmptyStringSchema.optional(),
    sealedDivergencePurpose: SealedBatchPurposeSchema.optional(),
    sealedDivergenceRevealPolicy: SealedBatchRevealPolicySchema.optional(),
    requiresExplicitProcessDecisions: z.boolean().optional()
  })
  .catchall(JsonValueSchema);
export type GovernanceRule = z.infer<typeof GovernanceRuleSchema>;

export const ResourcePolicyResourceRefSchema = z
  .object({
    resourceId: IdSchema,
    required: z.boolean().optional(),
    preferredDeliveryMode: NonEmptyStringSchema.optional(),
    allowedDeliveryModes: z.array(NonEmptyStringSchema).optional(),
    maxBase64SizeBytes: NonnegativeIntegerSchema.optional(),
    allowHostedContentUrl: z.boolean().optional()
  })
  .catchall(JsonValueSchema);
export type ResourcePolicyResourceRef = z.infer<typeof ResourcePolicyResourceRefSchema>;

export const ResourcePolicySchema = z
  .object({
    resourceRefs: z.array(ResourcePolicyResourceRefSchema).optional(),
    defaultRequired: z.boolean().optional(),
    defaultDeliveryModes: z.array(NonEmptyStringSchema).optional()
  })
  .catchall(JsonValueSchema);
export type ResourcePolicy = z.infer<typeof ResourcePolicySchema>;

export const ParticipantCapabilityInputSchema = z
  .object({
    text: z.boolean().optional(),
    markdown: z.boolean().optional(),
    json: z.boolean().optional(),
    imageUrl: z.boolean().optional(),
    imageBase64: z.boolean().optional(),
    pdfUrl: z.boolean().optional(),
    fileUrl: z.boolean().optional(),
    webBrowsing: z.boolean().optional()
  })
  .catchall(JsonValueSchema);
export type ParticipantCapabilityInput = z.infer<typeof ParticipantCapabilityInputSchema>;

export const ParticipantCapabilityOutputSchema = z
  .object({
    structuredJson: z.boolean().optional(),
    markdown: z.boolean().optional(),
    streaming: z.boolean().optional(),
    manualPaste: z.boolean().optional()
  })
  .catchall(JsonValueSchema);
export type ParticipantCapabilityOutput = z.infer<typeof ParticipantCapabilityOutputSchema>;

export const ParticipantCapabilityLimitsSchema = z
  .object({
    maxPromptChars: PositiveIntegerSchema.optional(),
    maxInputTokens: PositiveIntegerSchema.optional(),
    maxOutputTokens: PositiveIntegerSchema.optional(),
    maxUrlChars: PositiveIntegerSchema.optional(),
    maxResourceSizeBytes: PositiveIntegerSchema.optional()
  })
  .catchall(JsonValueSchema);
export type ParticipantCapabilityLimits = z.infer<typeof ParticipantCapabilityLimitsSchema>;

export const ParticipantReliabilitySchema = z.enum([
  "high",
  "medium",
  "low",
  "experimental"
]);
export type ParticipantReliability = z.infer<typeof ParticipantReliabilitySchema>;

export const ParticipantCapabilitiesSchema = z
  .object({
    input: ParticipantCapabilityInputSchema.optional(),
    output: ParticipantCapabilityOutputSchema.optional(),
    limits: ParticipantCapabilityLimitsSchema.optional(),
    reliability: ParticipantReliabilitySchema.optional(),
    notes: z.array(NonEmptyStringSchema).optional()
  })
  .catchall(JsonValueSchema);
export type ParticipantCapabilities = z.infer<typeof ParticipantCapabilitiesSchema>;

export const TopicContractSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyStringSchema,
    topic: NonEmptyStringSchema,
    goals: z.array(NonEmptyStringSchema),
    constraints: z.array(NonEmptyStringSchema),
    outputExpectations: z.array(NonEmptyStringSchema),
    participantIds: z.array(IdSchema),
    allowedAdapters: z.array(IdSchema),
    budgetLease: BudgetLeaseSchema,
    governanceRules: z.array(GovernanceRuleSchema),
    resourcePolicy: ResourcePolicySchema.optional()
  })
  .strict();
export type TopicContract = z.infer<typeof TopicContractSchema>;

export const ParticipantKindSchema = z.enum([
  "human",
  "model",
  "tool",
  "external_system",
  "manual_bridge",
  "webget"
]);
export type ParticipantKind = z.infer<typeof ParticipantKindSchema>;

export const ParticipantSchema = z
  .object({
    id: IdSchema,
    kind: ParticipantKindSchema,
    displayName: NonEmptyStringSchema,
    adapterId: IdSchema.optional(),
    profileId: IdSchema.optional(),
    capabilities: ParticipantCapabilitiesSchema.optional(),
    reliabilityNotes: z.array(NonEmptyStringSchema).optional()
  })
  .strict();
export type Participant = z.infer<typeof ParticipantSchema>;

export const SealedBatchStatusSchema = z.enum(["open", "sealed", "revealed", "cancelled"]);
export type SealedBatchStatus = z.infer<typeof SealedBatchStatusSchema>;

export const SealedBatchSchema = z
  .object({
    id: IdSchema,
    sessionId: IdSchema,
    purpose: SealedBatchPurposeSchema,
    status: SealedBatchStatusSchema,
    participantIds: z.array(IdSchema),
    openedAt: TimestampStringSchema,
    revealedAt: TimestampStringSchema.optional(),
    revealPolicy: SealedBatchRevealPolicySchema
  })
  .strict();
export type SealedBatch = z.infer<typeof SealedBatchSchema>;

export const SessionLifecycleStateValues = [
  "created",
  "topic_contract_published",
  "initial_sealed_divergence_open",
  "initial_sealed_divergence_revealed",
  "structuring",
  "deliberating",
  "final_contest",
  "final_audit",
  "outcome_compiled",
  "archived"
] as const;

export const SessionLifecycleStateSchema = z.enum(SessionLifecycleStateValues);
export type SessionLifecycleState = z.infer<typeof SessionLifecycleStateSchema>;
