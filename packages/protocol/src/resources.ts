import { z } from "zod";
import { HashStringSchema, IdSchema, NonEmptyStringSchema, TimestampStringSchema } from "./common";

export const ResourceKindSchema = z.enum([
  "image",
  "pdf",
  "audio",
  "video",
  "html",
  "text",
  "file",
  "board_snapshot"
]);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

export const ResourcePrivacySchema = z.enum(["public", "private", "sensitive"]);
export type ResourcePrivacy = z.infer<typeof ResourcePrivacySchema>;

export const ResourceVariantModeSchema = z.enum(["url", "base64", "summary", "ocr", "caption"]);
export type ResourceVariantMode = z.infer<typeof ResourceVariantModeSchema>;

export const ResourceUrlExposureSchema = z.enum(["localhost", "lan", "public"]);
export type ResourceUrlExposure = z.infer<typeof ResourceUrlExposureSchema>;

export const ResourceVariantSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("url"),
      url: NonEmptyStringSchema,
      exposure: ResourceUrlExposureSchema,
      expiresAt: TimestampStringSchema.optional()
    })
    .strict(),
  z
    .object({
      mode: z.literal("base64"),
      mime: NonEmptyStringSchema,
      dataRef: NonEmptyStringSchema,
      sizeBytes: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      mode: z.literal("summary"),
      text: NonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      mode: z.literal("ocr"),
      text: NonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      mode: z.literal("caption"),
      text: NonEmptyStringSchema
    })
    .strict()
]);
export type ResourceVariant = z.infer<typeof ResourceVariantSchema>;

export const ResourceSchema = z
  .object({
    id: IdSchema,
    kind: ResourceKindSchema,
    mime: NonEmptyStringSchema,
    sizeBytes: z.number().int().nonnegative(),
    hash: HashStringSchema,
    privacy: ResourcePrivacySchema,
    variants: z.array(ResourceVariantSchema)
  })
  .strict();
export type Resource = z.infer<typeof ResourceSchema>;

