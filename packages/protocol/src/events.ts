import { z } from "zod";
import { HashStringSchema, IdSchema, NonEmptyStringSchema, TimestampStringSchema } from "./common";

export const EventVisibilitySchema = z.enum(["public", "sealed", "private", "redacted"]);
export type EventVisibility = z.infer<typeof EventVisibilitySchema>;

export const EventTraceSchema = z
  .object({
    adapterId: IdSchema.optional(),
    participantId: IdSchema.optional(),
    modelId: NonEmptyStringSchema.optional(),
    contextCapsuleId: IdSchema.optional(),
    resourceDeliveryIds: z.array(IdSchema).optional(),
    promptHash: HashStringSchema.optional(),
    rawOutputHash: HashStringSchema.optional()
  })
  .strict();
export type EventTrace = z.infer<typeof EventTraceSchema>;

export const EventIntegritySchema = z
  .object({
    previousEventHash: HashStringSchema.optional(),
    eventHash: HashStringSchema.optional()
  })
  .strict();
export type EventIntegrity = z.infer<typeof EventIntegritySchema>;

const EventEnvelopeBaseSchema = z
  .object({
    id: IdSchema,
    sessionId: IdSchema,
    schemaVersion: NonEmptyStringSchema,
    type: NonEmptyStringSchema,
    sequence: z.number().int().nonnegative(),
    authorId: z.union([IdSchema, z.literal("system")]),
    createdAt: TimestampStringSchema,
    recordedAt: TimestampStringSchema,
    basedOnEventIds: z.array(IdSchema),
    batchId: IdSchema.optional(),
    visibility: EventVisibilitySchema,
    idempotencyKey: NonEmptyStringSchema.optional(),
    integrity: EventIntegritySchema.optional(),
    trace: EventTraceSchema
  })
  .strict();

export const createEventEnvelopeSchema = <TPayloadSchema extends z.ZodType>(
  payloadSchema: TPayloadSchema
) =>
  EventEnvelopeBaseSchema.extend({
    payload: payloadSchema
  }).strict();

export const EventEnvelopeSchema = createEventEnvelopeSchema(z.unknown());
export type EventEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof EventEnvelopeSchema>,
  "payload"
> & {
  payload: TPayload;
};
