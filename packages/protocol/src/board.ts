import { z } from "zod";
import { IdSchema, NonEmptyStringSchema, SourceEventIdsSchema } from "./common";

export const BoardObjectKindSchema = z.enum([
  "topic",
  "candidate",
  "claim",
  "objection",
  "evidence",
  "risk",
  "question",
  "decision",
  "process",
  "branch"
]);
export type BoardObjectKind = z.infer<typeof BoardObjectKindSchema>;

export const BoardObjectStatusSchema = z.enum([
  "draft",
  "open",
  "challenged",
  "accepted_for_now",
  "rejected",
  "resolved"
]);
export type BoardObjectStatus = z.infer<typeof BoardObjectStatusSchema>;

export const BoardObjectSchema = z
  .object({
    id: IdSchema,
    kind: BoardObjectKindSchema,
    title: NonEmptyStringSchema,
    body: NonEmptyStringSchema.optional(),
    sourceEventIds: SourceEventIdsSchema,
    status: BoardObjectStatusSchema.optional()
  })
  .strict();
export type BoardObject = z.infer<typeof BoardObjectSchema>;

export const BoardRelationTypeSchema = z.enum([
  "supports",
  "attacks",
  "depends_on",
  "duplicates",
  "contradicts",
  "refines",
  "answers",
  "replaces"
]);
export type BoardRelationType = z.infer<typeof BoardRelationTypeSchema>;

export const BoardRelationSchema = z
  .object({
    id: IdSchema,
    from: IdSchema,
    to: IdSchema,
    relation: BoardRelationTypeSchema,
    sourceEventIds: SourceEventIdsSchema
  })
  .strict();
export type BoardRelation = z.infer<typeof BoardRelationSchema>;

