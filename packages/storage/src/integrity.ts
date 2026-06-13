import { createHash } from "node:crypto";
import type { EventEnvelope } from "@deliberum/protocol";

export const EVENT_HASH_ALGORITHM = "sha256" as const;

export function attachEventIntegrity<TPayload>(
  event: EventEnvelope<TPayload>,
  previousEvent?: EventEnvelope
): EventEnvelope<TPayload> {
  const previousEventHash = previousEvent ? computeEventHash(previousEvent) : undefined;
  const eventWithPreviousHash = {
    ...event,
    integrity:
      previousEventHash === undefined
        ? {}
        : {
            previousEventHash
          }
  } satisfies EventEnvelope<TPayload>;
  const eventHash = computeEventHash(eventWithPreviousHash);

  return {
    ...eventWithPreviousHash,
    integrity: {
      ...eventWithPreviousHash.integrity,
      eventHash
    }
  } satisfies EventEnvelope<TPayload>;
}

export function computeEventHash(event: EventEnvelope): string {
  return `${EVENT_HASH_ALGORITHM}:${createHash(EVENT_HASH_ALGORITHM)
    .update(stableStringify(normalizeEventForHash(event)))
    .digest("hex")}`;
}

export function validateEventIntegrityChain(events: readonly EventEnvelope[]): string | undefined {
  const eventsBySession = new Map<string, EventEnvelope[]>();
  for (const event of events) {
    const sessionEvents = eventsBySession.get(event.sessionId) ?? [];
    sessionEvents.push(event);
    eventsBySession.set(event.sessionId, sessionEvents);
  }

  for (const [sessionId, sessionEvents] of eventsBySession) {
    sessionEvents.sort((left, right) => left.sequence - right.sequence);

    let previousEvent: EventEnvelope | undefined;
    for (const event of sessionEvents) {
      if (event.integrity) {
        const expectedEventHash = computeEventHash(event);
        const expectedPreviousEventHash = previousEvent
          ? computeEventHash(previousEvent)
          : undefined;

        if (!event.integrity.eventHash) {
          return `Missing eventHash in event integrity for session ${sessionId} sequence ${event.sequence}.`;
        }

        if (event.integrity.eventHash !== expectedEventHash) {
          return `Invalid eventHash in event integrity for session ${sessionId} sequence ${event.sequence}.`;
        }

        if ((event.integrity.previousEventHash ?? undefined) !== expectedPreviousEventHash) {
          return `Invalid previousEventHash in event integrity for session ${sessionId} sequence ${event.sequence}.`;
        }
      }

      previousEvent = event;
    }
  }

  return undefined;
}

function normalizeEventForHash(event: EventEnvelope): unknown {
  const { integrity, ...eventWithoutIntegrity } = event;
  const integrityWithoutEventHash =
    integrity?.previousEventHash === undefined
      ? undefined
      : {
          previousEventHash: integrity.previousEventHash
        };

  if (integrityWithoutEventHash === undefined) {
    return eventWithoutIntegrity;
  }

  return {
    ...eventWithoutIntegrity,
    integrity: integrityWithoutEventHash
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) {
      continue;
    }

    normalized[key] = normalizeValue(child);
  }

  return normalized;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
