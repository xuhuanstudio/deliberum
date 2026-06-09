import { z } from "zod";
import { IdSchema, NonEmptyStringSchema } from "./common";

export const ReferenceTargetTypeSchema = z.enum([
  "message",
  "text_span",
  "candidate",
  "claim",
  "objection",
  "evidence",
  "board_node",
  "board_edge",
  "board_region",
  "resource",
  "version"
]);
export type ReferenceTargetType = z.infer<typeof ReferenceTargetTypeSchema>;

export const ReferenceSelectorTypeSchema = z.enum([
  "paragraph",
  "sentence",
  "clause",
  "char_range",
  "object_part",
  "board_selection"
]);
export type ReferenceSelectorType = z.infer<typeof ReferenceSelectorTypeSchema>;

export const ReferenceSelectorSchema = z
  .object({
    type: ReferenceSelectorTypeSchema,
    value: z.unknown()
  })
  .strict();
export type ReferenceSelector = z.infer<typeof ReferenceSelectorSchema>;

export const ReferenceRelationSchema = z.enum([
  "mentions",
  "replies_to",
  "supports",
  "attacks",
  "depends_on",
  "challenges",
  "revises",
  "asks_about"
]);
export type ReferenceRelation = z.infer<typeof ReferenceRelationSchema>;

export const ReferenceContextPolicySchema = z.enum([
  "minimal",
  "local",
  "parent",
  "expanded",
  "full_trace"
]);
export type ReferenceContextPolicy = z.infer<typeof ReferenceContextPolicySchema>;

export const ReferenceSchema = z
  .object({
    id: IdSchema,
    targetId: IdSchema,
    targetType: ReferenceTargetTypeSchema,
    targetVersion: NonEmptyStringSchema.optional(),
    selector: ReferenceSelectorSchema.optional(),
    relation: ReferenceRelationSchema,
    contextPolicy: ReferenceContextPolicySchema,
    quoteSnapshot: NonEmptyStringSchema.optional()
  })
  .strict();
export type Reference = z.infer<typeof ReferenceSchema>;

