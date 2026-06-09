import { z } from "zod";
import { IdSchema, NonEmptyStringSchema } from "./common";
import { BudgetLeaseSchema } from "./core";

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

