import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  InvalidResourceDeliveryAuditInputError,
  RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE,
  RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE,
  RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
  recordResourceAccessGrantCreated,
  recordResourceAccessGrantRevoked,
  recordResourceDeliveryPlan
} from "../src";

function createStore() {
  return new InMemoryEventStore({
    clock: () => "2026-06-12T00:00:00.000Z"
  });
}

function createIds(ids: string[]) {
  let index = 0;

  return () => ids[index++] ?? `generated-${index}`;
}

function auditInput() {
  return {
    sessionId: "session-1",
    resourceId: "resource-1",
    participantId: "participant-1",
    resource: {
      kind: "text",
      mime: "text/plain",
      sizeBytes: 11,
      hash: "sha256:abc",
      privacy: "public"
    },
    request: {
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 64
      }
    },
    result: {
      selectedMode: "base64",
      allowed: true,
      reason: "Base64 delivery is explicitly allowed by policy.",
      warnings: [],
      materialKind: "base64"
    },
    basedOnEventIds: ["resource-reference-event-1"]
  } as const;
}

function accessGrantSummary() {
  return {
    mode: "redirect",
    exposure: "public",
    tokenHash: "sha256:token-hash",
    expiresAt: "2026-06-12T00:05:00.000Z"
  } as const;
}

describe("resource delivery audit", () => {
  it("records safe resource delivery planning metadata without delivery material", () => {
    const eventStore = createStore();
    const result = recordResourceDeliveryPlan(auditInput(), {
      eventStore,
      idGenerator: createIds(["delivery-1", "event-1"]),
      clock: () => "2026-06-12T00:00:01.000Z"
    });
    const serializedEvent = JSON.stringify(result.deliveryEvent);

    expect(result.appended).toBe(true);
    expect(result.deliveryEvent).toMatchObject({
      id: "event-1",
      type: RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
      sessionId: "session-1",
      authorId: "system",
      visibility: "public",
      basedOnEventIds: ["resource-reference-event-1"],
      trace: {
        participantId: "participant-1",
        resourceDeliveryIds: ["delivery-1"]
      },
      payload: {
        id: "delivery-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        result: {
          selectedMode: "base64",
          allowed: true,
          materialKind: "base64"
        }
      }
    });
    expect(eventStore.listEvents("session-1")).toHaveLength(1);
    expect(serializedEvent).not.toContain("hello world");
    expect(serializedEvent).not.toContain("dataRef");
    expect(serializedEvent).not.toContain("https://");
    expect(serializedEvent).not.toContain("api_key");
    expect(serializedEvent).not.toContain("secret");
  });

  it("returns the existing event on idempotent retries", () => {
    const eventStore = createStore();
    const first = recordResourceDeliveryPlan(
      {
        ...auditInput(),
        idempotencyKey: "same-delivery-plan"
      },
      {
        eventStore,
        idGenerator: createIds(["delivery-1", "event-1"])
      }
    );
    const retry = recordResourceDeliveryPlan(
      {
        ...auditInput(),
        idempotencyKey: "same-delivery-plan"
      },
      {
        eventStore,
        idGenerator: createIds(["delivery-2", "event-2"])
      }
    );

    expect(first.appended).toBe(true);
    expect(retry.appended).toBe(false);
    expect(retry.deliveryEvent).toEqual(first.deliveryEvent);
    expect(
      eventStore
        .listEvents("session-1")
        .filter((event) => event.type === RESOURCE_DELIVERY_PLANNED_EVENT_TYPE)
    ).toHaveLength(1);
  });

  it("rejects unsafe audit payload shapes before appending", () => {
    const eventStore = createStore();

    expect(() =>
      recordResourceDeliveryPlan(
        {
          ...auditInput(),
          result: {
            ...auditInput().result,
            selectedMode: "inline-data"
          }
        },
        {
          eventStore,
          idGenerator: createIds(["delivery-1", "event-1"])
        }
      )
    ).toThrow(InvalidResourceDeliveryAuditInputError);
    expect(eventStore.listEvents("session-1")).toHaveLength(0);
  });

  it("records safe resource access grant creation metadata", () => {
    const eventStore = createStore();
    const result = recordResourceAccessGrantCreated(
      {
        sessionId: "session-1",
        resourceAccessId: "resource-access-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        resource: {
          kind: "text",
          mime: "text/plain",
          sizeBytes: 11,
          hash: "sha256:resource",
          privacy: "public"
        },
        grant: accessGrantSummary(),
        basedOnEventIds: ["delivery-event-1"],
        idempotencyKey: "resource-access-created-1"
      },
      {
        eventStore,
        idGenerator: createIds(["access-audit-1", "event-1"]),
        clock: () => "2026-06-12T00:00:01.000Z"
      }
    );
    const serializedEvent = JSON.stringify(result.accessEvent);

    expect(result.appended).toBe(true);
    expect(result.accessEvent).toMatchObject({
      id: "event-1",
      type: RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE,
      sessionId: "session-1",
      authorId: "system",
      visibility: "public",
      basedOnEventIds: ["delivery-event-1"],
      trace: {
        participantId: "participant-1",
        resourceDeliveryIds: ["resource-access-1"]
      },
      payload: {
        id: "access-audit-1",
        resourceAccessId: "resource-access-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        grant: accessGrantSummary()
      }
    });
    expect(serializedEvent).toContain("sha256:token-hash");
    expect(serializedEvent).not.toContain("A".repeat(32));
    expect(serializedEvent).not.toContain("https://example.com/resource.txt");
    expect(serializedEvent).not.toContain("dataRef");
    expect(serializedEvent).not.toContain("api_key");
  });

  it("records safe resource access revocation metadata and deduplicates retries", () => {
    const eventStore = createStore();
    const first = recordResourceAccessGrantRevoked(
      {
        sessionId: "session-1",
        resourceAccessId: "resource-access-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        grant: accessGrantSummary(),
        revokedAt: "2026-06-12T00:01:00.000Z",
        idempotencyKey: "resource-access-revoked-1"
      },
      {
        eventStore,
        idGenerator: createIds(["access-audit-1", "event-1"])
      }
    );
    const retry = recordResourceAccessGrantRevoked(
      {
        sessionId: "session-1",
        resourceAccessId: "resource-access-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        grant: accessGrantSummary(),
        revokedAt: "2026-06-12T00:01:00.000Z",
        idempotencyKey: "resource-access-revoked-1"
      },
      {
        eventStore,
        idGenerator: createIds(["access-audit-2", "event-2"])
      }
    );
    const serializedEvent = JSON.stringify(first.accessEvent);

    expect(first.appended).toBe(true);
    expect(retry.appended).toBe(false);
    expect(retry.accessEvent).toEqual(first.accessEvent);
    expect(first.accessEvent).toMatchObject({
      type: RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE,
      payload: {
        id: "access-audit-1",
        resourceAccessId: "resource-access-1",
        revokedAt: "2026-06-12T00:01:00.000Z"
      }
    });
    expect(
      eventStore
        .listEvents("session-1")
        .filter((event) => event.type === RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE)
    ).toHaveLength(1);
    expect(serializedEvent).not.toContain("A".repeat(32));
    expect(serializedEvent).not.toContain("https://example.com/resource.txt");
    expect(serializedEvent).not.toContain("dataRef");
  });
});
