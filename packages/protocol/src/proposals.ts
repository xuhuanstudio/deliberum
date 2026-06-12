import { z } from "zod";
import { IdSchema, NonEmptyStringSchema, SourceEventIdsSchema } from "./common";
import { BudgetLeaseSchema } from "./core";
import {
  CandidateSchema,
  ClaimSchema,
  EvidenceNeedSchema,
  ObjectionSchema,
  QualityObligationSchema
} from "./deliberation";

export const SemanticProposalStatusSchema = z.enum([
  "proposed",
  "challenged",
  "accepted_for_now",
  "superseded",
  "rejected"
]);
export type SemanticProposalStatus = z.infer<typeof SemanticProposalStatusSchema>;

export const ProcessProposalStatusSchema = z.enum([
  "proposed",
  "accepted",
  "challenged",
  "deferred",
  "rejected"
]);
export type ProcessProposalStatus = z.infer<typeof ProcessProposalStatusSchema>;

export const ProcessProposalSchema = z
  .object({
    id: IdSchema,
    primitive: NonEmptyStringSchema,
    targetIds: z.array(IdSchema),
    expectedQualityGain: NonEmptyStringSchema,
    riskIfSkipped: NonEmptyStringSchema,
    requestedBudget: BudgetLeaseSchema.optional(),
    status: ProcessProposalStatusSchema
  })
  .strict();
export type ProcessProposal = z.infer<typeof ProcessProposalSchema>;

export const ProcessProposalChallengePayloadSchema = z
  .object({
    id: IdSchema,
    targetProcessProposalEventId: IdSchema,
    reason: NonEmptyStringSchema,
    status: z.literal("challenged")
  })
  .strict();
export type ProcessProposalChallengePayload = z.infer<
  typeof ProcessProposalChallengePayloadSchema
>;

export const ProcessProposalDecisionStatusSchema = z.enum([
  "accepted",
  "deferred",
  "rejected"
]);
export type ProcessProposalDecisionStatus = z.infer<
  typeof ProcessProposalDecisionStatusSchema
>;

export const ProcessProposalDecisionPayloadSchema = z
  .object({
    id: IdSchema,
    targetProcessProposalEventId: IdSchema,
    rationale: NonEmptyStringSchema,
    status: ProcessProposalDecisionStatusSchema
  })
  .strict();
export type ProcessProposalDecisionPayload = z.infer<
  typeof ProcessProposalDecisionPayloadSchema
>;

export const SummaryProposalSchema = z
  .object({
    id: IdSchema,
    includedEventIds: z.array(IdSchema),
    omittedEventIds: z.array(IdSchema),
    summary: NonEmptyStringSchema,
    rationale: NonEmptyStringSchema,
    status: SemanticProposalStatusSchema
  })
  .strict();
export type SummaryProposal = z.infer<typeof SummaryProposalSchema>;

const NonEmptySourceEventIdsSchema = SourceEventIdsSchema.min(1);

export const ExtractionCandidateSchema = CandidateSchema.extend({
  sourceEventIds: NonEmptySourceEventIdsSchema
}).strict();
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;

export const ExtractionClaimSchema = ClaimSchema.extend({
  sourceEventIds: NonEmptySourceEventIdsSchema
}).strict();
export type ExtractionClaim = z.infer<typeof ExtractionClaimSchema>;

export const ExtractionObjectionSchema = ObjectionSchema.extend({
  sourceEventIds: NonEmptySourceEventIdsSchema
}).strict();
export type ExtractionObjection = z.infer<typeof ExtractionObjectionSchema>;

export const ExtractionEvidenceNeedSchema = EvidenceNeedSchema.extend({
  sourceEventIds: NonEmptySourceEventIdsSchema
}).strict();
export type ExtractionEvidenceNeed = z.infer<typeof ExtractionEvidenceNeedSchema>;

export const ExtractionQualityObligationSchema = QualityObligationSchema.extend({
  sourceEventIds: NonEmptySourceEventIdsSchema
}).strict();
export type ExtractionQualityObligation = z.infer<typeof ExtractionQualityObligationSchema>;

export const ExtractionProposalSchema = z
  .object({
    id: IdSchema,
    sourceEventIds: NonEmptySourceEventIdsSchema,
    candidates: z.array(ExtractionCandidateSchema),
    claims: z.array(ExtractionClaimSchema),
    objections: z.array(ExtractionObjectionSchema),
    evidenceNeeds: z.array(ExtractionEvidenceNeedSchema),
    qualityObligations: z.array(ExtractionQualityObligationSchema),
    rationale: NonEmptyStringSchema,
    status: SemanticProposalStatusSchema
  })
  .strict();
export type ExtractionProposal = z.infer<typeof ExtractionProposalSchema>;

export const ProposalChallengePayloadSchema = z
  .object({
    id: IdSchema,
    targetProposalEventId: IdSchema,
    reason: NonEmptyStringSchema,
    status: z.literal("challenged")
  })
  .strict();
export type ProposalChallengePayload = z.infer<typeof ProposalChallengePayloadSchema>;

export const ProposalAcceptancePayloadSchema = z
  .object({
    id: IdSchema,
    targetProposalEventId: IdSchema,
    rationale: NonEmptyStringSchema,
    status: z.literal("accepted_for_now")
  })
  .strict();
export type ProposalAcceptancePayload = z.infer<typeof ProposalAcceptancePayloadSchema>;

export const MergeProposalSchema = z
  .object({
    id: IdSchema,
    targetIds: z.array(IdSchema),
    mergedObjectDraft: z.unknown(),
    reason: NonEmptyStringSchema,
    status: SemanticProposalStatusSchema
  })
  .strict();
export type MergeProposal = z.infer<typeof MergeProposalSchema>;

export const RankingProposalSchema = z
  .object({
    id: IdSchema,
    targetIds: z.array(IdSchema),
    rationale: NonEmptyStringSchema,
    status: SemanticProposalStatusSchema
  })
  .strict();
export type RankingProposal = z.infer<typeof RankingProposalSchema>;

export const BoardViewProposalSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyStringSchema,
    boardObjectIds: z.array(IdSchema),
    boardRelationIds: z.array(IdSchema),
    rationale: NonEmptyStringSchema,
    status: SemanticProposalStatusSchema
  })
  .strict();
export type BoardViewProposal = z.infer<typeof BoardViewProposalSchema>;

export const FinalDraftProposalSchema = z
  .object({
    id: IdSchema,
    candidateIds: z.array(IdSchema),
    objectionIds: z.array(IdSchema),
    evidenceResultIds: z.array(IdSchema),
    draft: NonEmptyStringSchema,
    rationale: NonEmptyStringSchema,
    status: SemanticProposalStatusSchema
  })
  .strict();
export type FinalDraftProposal = z.infer<typeof FinalDraftProposalSchema>;

export const FinalCandidateProposalSchema = z
  .object({
    id: IdSchema,
    candidateIds: z.array(IdSchema).min(1),
    alternativeCandidateIds: z.array(IdSchema),
    sourceEventIds: SourceEventIdsSchema.min(1),
    recommendation: NonEmptyStringSchema,
    applicabilityConditions: z.array(NonEmptyStringSchema),
    rationale: NonEmptyStringSchema,
    limitations: z.array(NonEmptyStringSchema),
    status: SemanticProposalStatusSchema
  })
  .strict();
export type FinalCandidateProposal = z.infer<typeof FinalCandidateProposalSchema>;

export const FinalAuditSchema = z
  .object({
    id: IdSchema,
    targetFinalCandidateProposalEventId: IdSchema,
    findings: z.array(NonEmptyStringSchema),
    risks: z.array(NonEmptyStringSchema),
    unresolvedObjectionIds: z.array(IdSchema),
    qualityObligationIds: z.array(IdSchema),
    evidenceNeedIds: z.array(IdSchema),
    omissions: z.array(NonEmptyStringSchema),
    compressionProblems: z.array(NonEmptyStringSchema),
    limitations: z.array(NonEmptyStringSchema),
    continuationSuggestions: z.array(NonEmptyStringSchema),
    status: z.literal("recorded")
  })
  .strict();
export type FinalAudit = z.infer<typeof FinalAuditSchema>;
