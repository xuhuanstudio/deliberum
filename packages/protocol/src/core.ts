import { z } from "zod";
import { IdSchema, JsonRecordSchema, NonEmptyStringSchema, TimestampStringSchema } from "./common";

// Minimal Stage 1 placeholder: docs name this object but do not define policy semantics yet.
export const BudgetLeaseSchema = JsonRecordSchema;
export type BudgetLease = z.infer<typeof BudgetLeaseSchema>;

// Minimal Stage 1 placeholder: docs name this object but do not define governance semantics yet.
export const GovernanceRuleSchema = JsonRecordSchema;
export type GovernanceRule = z.infer<typeof GovernanceRuleSchema>;

// Minimal Stage 1 placeholder: docs name this object but do not define resource policy semantics yet.
export const ResourcePolicySchema = JsonRecordSchema;
export type ResourcePolicy = z.infer<typeof ResourcePolicySchema>;

// Minimal Stage 1 placeholder: docs name this object but do not define capability semantics yet.
export const ParticipantCapabilitiesSchema = JsonRecordSchema;
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

export const SealedBatchPurposeSchema = z.enum([
  "initial_divergence",
  "relation_mapping",
  "final_contest",
  "blind_reframe"
]);
export type SealedBatchPurpose = z.infer<typeof SealedBatchPurposeSchema>;

export const SealedBatchStatusSchema = z.enum(["open", "sealed", "revealed", "cancelled"]);
export type SealedBatchStatus = z.infer<typeof SealedBatchStatusSchema>;

export const SealedBatchRevealPolicySchema = z.enum(["all_completed", "quorum", "deadline"]);
export type SealedBatchRevealPolicy = z.infer<typeof SealedBatchRevealPolicySchema>;

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
