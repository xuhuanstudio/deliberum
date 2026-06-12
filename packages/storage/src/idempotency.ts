import type { EventEnvelope } from "@deliberum/protocol";
import type { AppendEventInput } from "./event-store";

const GENERATED_EVENT_FIELDS = new Set(["id", "sequence", "recordedAt", "createdAt"]);
const GENERATED_NESTED_FIELDS = new Set(["committedAt"]);
const GENERATED_ROOT_PAYLOAD_FIELDS_BY_EVENT_TYPE = new Map<string, Set<string>>([
  ["sealed_batch_opened", new Set(["id", "openedAt"])],
  ["sealed_batch_revealed", new Set(["revealedAt"])],
  ["extraction_proposed", new Set(["id"])],
  ["proposal_challenged", new Set(["id"])],
  ["proposal_accepted", new Set(["id"])],
  ["final_candidate_proposed", new Set(["id"])],
  ["final_audit_recorded", new Set(["id"])],
  ["resource_delivery_planned", new Set(["id"])],
  ["resource_access_grant_created", new Set(["id"])],
  ["resource_access_grant_revoked", new Set(["id"])]
]);
const GENERATED_TRACE_FIELDS_BY_EVENT_TYPE = new Map<string, Set<string>>([
  ["resource_delivery_planned", new Set(["resourceDeliveryIds"])],
  ["resource_access_grant_created", new Set(["resourceDeliveryIds"])],
  ["resource_access_grant_revoked", new Set(["resourceDeliveryIds"])]
]);

export function isCompatibleIdempotentEventInput(
  existing: EventEnvelope,
  input: AppendEventInput
): boolean {
  return stableStringify(toComparableEvent(existing)) === stableStringify(toComparableEvent(input));
}

function toComparableEvent(event: EventEnvelope | AppendEventInput): unknown {
  const record = event as Record<string, unknown>;
  const comparable: Record<string, unknown> = {};
  const eventType = typeof record.type === "string" ? record.type : "";

  for (const key of Object.keys(record).sort()) {
    if (GENERATED_EVENT_FIELDS.has(key) || key === "idempotencyKey") {
      continue;
    }

    if (key === "batchId" && eventType === "sealed_batch_opened") {
      continue;
    }

    if (key === "payload") {
      comparable[key] = normalizePayload(record[key], eventType);
      continue;
    }

    if (key === "trace") {
      comparable[key] = normalizeTrace(record[key], eventType);
      continue;
    }

    comparable[key] = normalizeValue(record[key], false);
  }

  return comparable;
}

function normalizeTrace(value: unknown, eventType: string): unknown {
  if (!isPlainRecord(value)) {
    return normalizeValue(value, false);
  }

  const generatedFields = GENERATED_TRACE_FIELDS_BY_EVENT_TYPE.get(eventType) ?? new Set<string>();
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (generatedFields.has(key)) {
      continue;
    }

    normalized[key] = normalizeValue(value[key], false);
  }

  return normalized;
}

function normalizePayload(value: unknown, eventType: string): unknown {
  if (!isPlainRecord(value)) {
    return normalizeValue(value, false);
  }

  const generatedRootPayloadFields =
    GENERATED_ROOT_PAYLOAD_FIELDS_BY_EVENT_TYPE.get(eventType) ?? new Set<string>();
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (generatedRootPayloadFields.has(key)) {
      continue;
    }

    normalized[key] = normalizeValue(value[key], true);
  }

  return normalized;
}

function normalizeValue(value: unknown, nestedPayload: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, nestedPayload));
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (nestedPayload && GENERATED_NESTED_FIELDS.has(key)) {
      continue;
    }

    normalized[key] = normalizeValue(value[key], nestedPayload);
  }

  return normalized;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}
