import { z } from "zod";
import { IdSchema, NonEmptyStringSchema, SourceEventIdsSchema } from "./common";

export const CandidateStatusSchema = z.enum([
  "active",
  "revised",
  "absorbed",
  "rejected",
  "forked",
  "archived"
]);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const CandidateSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    sourceEventIds: SourceEventIdsSchema,
    status: CandidateStatusSchema,
    supportedBy: z.array(IdSchema),
    attackedBy: z.array(IdSchema),
    qualityObligationIds: z.array(IdSchema),
    assumptions: z.array(NonEmptyStringSchema),
    tradeoffs: z.array(NonEmptyStringSchema),
    applicableWhen: z.array(NonEmptyStringSchema).optional()
  })
  .strict();
export type Candidate = z.infer<typeof CandidateSchema>;

export const CandidateListSchema = z.array(CandidateSchema);
export type CandidateList = z.infer<typeof CandidateListSchema>;

export const ClaimScopeSchema = z.enum([
  "factual",
  "design",
  "preference",
  "risk",
  "process",
  "definition"
]);
export type ClaimScope = z.infer<typeof ClaimScopeSchema>;

export const ClaimSchema = z
  .object({
    id: IdSchema,
    content: NonEmptyStringSchema,
    scope: ClaimScopeSchema,
    sourceEventIds: SourceEventIdsSchema,
    supports: z.array(IdSchema).optional(),
    dependsOn: z.array(IdSchema).optional(),
    challengedBy: z.array(IdSchema).optional()
  })
  .strict();
export type Claim = z.infer<typeof ClaimSchema>;

export const ObjectionSeverityClaimSchema = z.enum(["minor", "major", "blocking"]);
export type ObjectionSeverityClaim = z.infer<typeof ObjectionSeverityClaimSchema>;

export const ObjectionStatusSchema = z.enum([
  "open",
  "answered",
  "partially_answered",
  "accepted",
  "downgraded",
  "unresolved",
  "archived"
]);
export type ObjectionStatus = z.infer<typeof ObjectionStatusSchema>;

export const ObjectionSchema = z
  .object({
    id: IdSchema,
    targetId: IdSchema,
    failureMode: NonEmptyStringSchema,
    consequence: NonEmptyStringSchema,
    severityClaim: ObjectionSeverityClaimSchema,
    status: ObjectionStatusSchema,
    sourceEventIds: SourceEventIdsSchema,
    responses: z.array(IdSchema).optional()
  })
  .strict();
export type Objection = z.infer<typeof ObjectionSchema>;

export const QualityObligationScopeSchema = z.enum(["topic", "candidate", "branch", "final_output"]);
export type QualityObligationScope = z.infer<typeof QualityObligationScopeSchema>;

export const QualityObligationStatusSchema = z.enum([
  "unanswered",
  "answered",
  "partially_answered",
  "challenged",
  "waived",
  "unresolved"
]);
export type QualityObligationStatus = z.infer<typeof QualityObligationStatusSchema>;

export const QualityObligationSchema = z
  .object({
    id: IdSchema,
    scope: QualityObligationScopeSchema,
    targetCandidateId: IdSchema.optional(),
    requirement: NonEmptyStringSchema,
    status: QualityObligationStatusSchema,
    sourceEventIds: SourceEventIdsSchema,
    supportingRefIds: z.array(IdSchema),
    unresolvedObjectionIds: z.array(IdSchema),
    waiverReason: NonEmptyStringSchema.optional()
  })
  .strict();
export type QualityObligation = z.infer<typeof QualityObligationSchema>;

export const EvidenceNeedRequiredKindSchema = z.enum([
  "web",
  "paper",
  "file",
  "code",
  "calculation",
  "human_confirmation",
  "tool"
]);
export type EvidenceNeedRequiredKind = z.infer<typeof EvidenceNeedRequiredKindSchema>;

export const EvidenceNeedPrioritySchema = z.enum(["low", "medium", "high"]);
export type EvidenceNeedPriority = z.infer<typeof EvidenceNeedPrioritySchema>;

export const EvidenceNeedStatusSchema = z.enum([
  "open",
  "in_progress",
  "satisfied",
  "waived",
  "unresolved"
]);
export type EvidenceNeedStatus = z.infer<typeof EvidenceNeedStatusSchema>;

export const EvidenceNeedSchema = z
  .object({
    id: IdSchema,
    targetClaimId: IdSchema,
    requiredKind: EvidenceNeedRequiredKindSchema,
    reason: NonEmptyStringSchema,
    priority: EvidenceNeedPrioritySchema,
    status: EvidenceNeedStatusSchema,
    sourceEventIds: SourceEventIdsSchema
  })
  .strict();
export type EvidenceNeed = z.infer<typeof EvidenceNeedSchema>;

export const EvidenceResultSchema = z
  .object({
    id: IdSchema,
    evidenceNeedId: IdSchema,
    source: NonEmptyStringSchema,
    summary: NonEmptyStringSchema,
    resourceIds: z.array(IdSchema).optional(),
    limitations: z.array(NonEmptyStringSchema),
    challengedBy: z.array(IdSchema).optional()
  })
  .strict();
export type EvidenceResult = z.infer<typeof EvidenceResultSchema>;
