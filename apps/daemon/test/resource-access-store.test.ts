import { describe, expect, it } from "vitest";
import {
  classifyResourceAccessBaseUrl,
  createResourceAccessUrl,
  createResourceAccessUrlSignature,
  RESOURCE_ACCESS_URL_EXPIRES_AT_QUERY_PARAM,
  RESOURCE_ACCESS_URL_SIGNATURE_QUERY_PARAM,
  ResourceAccessError,
  ResourceAccessGrantStore,
  verifyResourceAccessUrlSignature
} from "../src";

describe("ResourceAccessGrantStore", () => {
  it("creates safe redirect grants without exposing the raw access id in views", () => {
    let now = Date.parse("2026-06-10T00:00:00.000Z");
    const accessId = "A".repeat(32);
    const store = new ResourceAccessGrantStore({
      clock: () => now,
      tokenGenerator: () => accessId,
      defaultTtlMs: 60000
    });
    const created = store.createGrant({
      resourceAccessId: "resource-access-1",
      sessionId: "session-1",
      resourceId: "resource-1",
      participantId: "participant-1",
      mode: "redirect",
      targetUrl: "https://example.com/resource.txt",
      exposure: "public"
    });

    expect(created.accessId).toBe(accessId);
    expect(created.grant).toMatchObject({
      sessionId: "session-1",
      resourceAccessId: "resource-access-1",
      resourceId: "resource-1",
      participantId: "participant-1",
      mode: "redirect",
      targetUrl: "https://example.com/resource.txt",
      exposure: "public",
      createdAt: now,
      expiresAt: now + 60000,
      accessCount: 0
    });
    expect(JSON.stringify(store.getSafeView(accessId))).not.toContain(accessId);

    now += 1000;
    expect(store.recordAccess(accessId)).toMatchObject({
      accessCount: 1,
      lastAccessedAt: now
    });
    expect(store.revokeGrant(accessId)).toMatchObject({
      accessCount: 1,
      revokedAt: now
    });
    expect(() => store.recordAccess(accessId)).toThrow(ResourceAccessError);
  });

  it("expires grants and validates unsafe inputs", () => {
    let now = 1000;
    const store = new ResourceAccessGrantStore({
      clock: () => now,
      tokenGenerator: () => "B".repeat(32),
      defaultTtlMs: 1000
    });

    store.createGrant({
      resourceAccessId: "resource-access-1",
      sessionId: "session-1",
      resourceId: "resource-1",
      participantId: "participant-1",
      mode: "redirect",
      targetUrl: "https://example.com/resource.txt",
      exposure: "public"
    });
    now = 2000;

    expect(() => store.recordAccess("B".repeat(32))).toThrow(ResourceAccessError);
    expect(() =>
      store.createGrant({
        sessionId: "session-1",
        resourceAccessId: "resource-access-2",
        resourceId: "resource-1",
        participantId: "participant-1",
        mode: "redirect",
        targetUrl: "file:///Users/example/private.txt",
        exposure: "localhost"
      })
    ).toThrow(ResourceAccessError);
    expect(() => new ResourceAccessGrantStore({ defaultTtlMs: 0 })).toThrow(
      ResourceAccessError
    );
  });

  it("creates content grants with safe metadata but no data refs in safe views", () => {
    const accessId = "D".repeat(32);
    const store = new ResourceAccessGrantStore({
      clock: () => Date.parse("2026-06-10T00:00:00.000Z"),
      tokenGenerator: () => accessId,
      defaultTtlMs: 60000
    });
    const created = store.createGrant({
      resourceAccessId: "resource-access-content-1",
      sessionId: "session-1",
      resourceId: "resource-1",
      participantId: "participant-1",
      mode: "content",
      exposure: "localhost",
      content: {
        dataRef: "resource-content-ref",
        mime: "text/plain",
        sizeBytes: 11,
        hash: "sha256-content"
      }
    });
    const safeView = store.getSafeView(accessId);

    expect(created.grant).toMatchObject({
      mode: "content",
      content: {
        dataRef: "resource-content-ref",
        mime: "text/plain",
        sizeBytes: 11,
        hash: "sha256-content"
      }
    });
    expect(safeView).toMatchObject({
      mode: "content",
      content: {
        mime: "text/plain",
        sizeBytes: 11,
        hash: "sha256-content"
      }
    });
    expect(JSON.stringify(safeView)).not.toContain("resource-content-ref");
    expect(JSON.stringify(safeView)).not.toContain(accessId);
  });

  it("creates access URLs from safe base URLs and classifies exposure", () => {
    const accessId = "C".repeat(32);

    expect(createResourceAccessUrl("http://127.0.0.1:3877", accessId)).toBe(
      `http://127.0.0.1:3877/resource-access/${accessId}`
    );
    expect(createResourceAccessUrl("https://resources.example/prefix", accessId)).toBe(
      `https://resources.example/prefix/resource-access/${accessId}`
    );
    expect(classifyResourceAccessBaseUrl("http://127.0.0.1:3877")).toBe("localhost");
    expect(classifyResourceAccessBaseUrl("http://192.168.1.20:3877")).toBe("lan");
    expect(classifyResourceAccessBaseUrl("https://resources.example")).toBe("public");
    expect(() =>
      createResourceAccessUrl("https://user:secret@example.com", accessId)
    ).toThrow(ResourceAccessError);
  });

  it("can sign and verify resource access URLs without exposing signing material", () => {
    const accessId = "S".repeat(32);
    const expiresAt = Date.parse("2026-06-10T00:05:00.000Z");
    const signingSecret = "resource-access-url-signing-key-32";
    const accessUrl = createResourceAccessUrl(
      "https://resources.example/prefix",
      accessId,
      {
        secret: signingSecret,
        expiresAt
      }
    );
    const parsed = new URL(accessUrl);
    const signature = parsed.searchParams.get(
      RESOURCE_ACCESS_URL_SIGNATURE_QUERY_PARAM
    );

    expect(accessUrl).toContain(
      `${RESOURCE_ACCESS_URL_EXPIRES_AT_QUERY_PARAM}=${expiresAt}`
    );
    expect(signature).toBe(
      createResourceAccessUrlSignature({
        accessId,
        expiresAt,
        secret: signingSecret
      })
    );
    expect(accessUrl).not.toContain(signingSecret);
    expect(() =>
      verifyResourceAccessUrlSignature({
        accessId,
        expiresAt: parsed.searchParams.get(RESOURCE_ACCESS_URL_EXPIRES_AT_QUERY_PARAM) ?? undefined,
        signature: signature ?? undefined,
        secret: signingSecret,
        now: Date.parse("2026-06-10T00:04:00.000Z")
      })
    ).not.toThrow();
    expect(() =>
      verifyResourceAccessUrlSignature({
        accessId,
        expiresAt: parsed.searchParams.get(RESOURCE_ACCESS_URL_EXPIRES_AT_QUERY_PARAM) ?? undefined,
        signature: "x".repeat(43),
        secret: signingSecret,
        now: Date.parse("2026-06-10T00:04:00.000Z")
      })
    ).toThrow(ResourceAccessError);
    expect(() =>
      verifyResourceAccessUrlSignature({
        accessId,
        expiresAt: parsed.searchParams.get(RESOURCE_ACCESS_URL_EXPIRES_AT_QUERY_PARAM) ?? undefined,
        signature: signature ?? undefined,
        secret: signingSecret,
        now: expiresAt
      })
    ).toThrow(ResourceAccessError);
  });
});
