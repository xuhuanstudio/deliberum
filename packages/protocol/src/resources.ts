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

export const ResourceDeliveryModeSchema = z.enum(["url", "base64", "none"]);
export type ResourceDeliveryMode = z.infer<typeof ResourceDeliveryModeSchema>;

export const ResourceAccessGrantModeSchema = z.enum(["redirect", "content"]);
export type ResourceAccessGrantMode = z.infer<typeof ResourceAccessGrantModeSchema>;

export const ResourceDeliveryPolicyAuditSchema = z
  .object({
    requestedMode: ResourceDeliveryModeSchema.optional(),
    preferredModes: z.array(ResourceDeliveryModeSchema).optional(),
    allowLocalhostUrl: z.boolean().optional(),
    allowLanUrl: z.boolean().optional(),
    allowPublicUrl: z.boolean().optional(),
    allowBase64: z.boolean().optional(),
    maxBase64SizeBytes: z.number().int().nonnegative().optional(),
    allowHostedContentUrl: z.boolean().optional(),
    maxHostedContentSizeBytes: z.number().int().nonnegative().optional()
  })
  .strict();
export type ResourceDeliveryPolicyAudit = z.infer<
  typeof ResourceDeliveryPolicyAuditSchema
>;

export const ResourceDeliveryPlannedPayloadSchema = z
  .object({
    id: IdSchema,
    resourceId: IdSchema,
    participantId: IdSchema,
    resource: z
      .object({
        kind: ResourceKindSchema,
        mime: NonEmptyStringSchema,
        sizeBytes: z.number().int().nonnegative(),
        hash: NonEmptyStringSchema,
        privacy: ResourcePrivacySchema
      })
      .strict(),
    request: z
      .object({
        policy: ResourceDeliveryPolicyAuditSchema.optional()
      })
      .strict(),
    result: z
      .object({
        selectedMode: ResourceDeliveryModeSchema,
        allowed: z.boolean(),
        reason: NonEmptyStringSchema,
        warnings: z.array(NonEmptyStringSchema),
        materialKind: z.enum(["url", "base64"]).optional()
      })
      .strict()
  })
  .strict();
export type ResourceDeliveryPlannedPayload = z.infer<
  typeof ResourceDeliveryPlannedPayloadSchema
>;

export const ResourceAccessGrantSummarySchema = z
  .object({
    mode: ResourceAccessGrantModeSchema,
    exposure: ResourceUrlExposureSchema,
    tokenHash: HashStringSchema,
    expiresAt: TimestampStringSchema,
    content: z
      .object({
        mime: NonEmptyStringSchema,
        sizeBytes: z.number().int().nonnegative(),
        hash: HashStringSchema
      })
      .strict()
      .optional()
  })
  .strict();
export type ResourceAccessGrantSummary = z.infer<
  typeof ResourceAccessGrantSummarySchema
>;

export const ResourceAccessGrantCreatedPayloadSchema = z
  .object({
    id: IdSchema,
    resourceAccessId: IdSchema,
    resourceId: IdSchema,
    participantId: IdSchema,
    resource: z
      .object({
        kind: ResourceKindSchema,
        mime: NonEmptyStringSchema,
        sizeBytes: z.number().int().nonnegative(),
        hash: NonEmptyStringSchema,
        privacy: ResourcePrivacySchema
      })
      .strict(),
    grant: ResourceAccessGrantSummarySchema
  })
  .strict();
export type ResourceAccessGrantCreatedPayload = z.infer<
  typeof ResourceAccessGrantCreatedPayloadSchema
>;

export const ResourceAccessGrantRevokedPayloadSchema = z
  .object({
    id: IdSchema,
    resourceAccessId: IdSchema,
    resourceId: IdSchema,
    participantId: IdSchema,
    grant: ResourceAccessGrantSummarySchema,
    revokedAt: TimestampStringSchema
  })
  .strict();
export type ResourceAccessGrantRevokedPayload = z.infer<
  typeof ResourceAccessGrantRevokedPayloadSchema
>;
