import { z } from "zod";

export const NonEmptyStringSchema = z.string().min(1);
export const IdSchema = NonEmptyStringSchema;
export const TimestampStringSchema = NonEmptyStringSchema;
export const HashStringSchema = NonEmptyStringSchema;

export const SourceEventIdsSchema = z.array(IdSchema);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
);

export const JsonRecordSchema = z.record(z.string(), JsonValueSchema);
export type JsonRecord = z.infer<typeof JsonRecordSchema>;
