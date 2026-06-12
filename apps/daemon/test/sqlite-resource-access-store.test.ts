import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  ResourceAccessError,
  SQLITE_RESOURCE_ACCESS_STORE_SCHEMA_VERSION,
  SQLiteResourceAccessGrantStore,
  SQLiteResourceAccessGrantStoreError
} from "../src";

function createTempDir() {
  const baseDir = join(process.cwd(), ".deliberum", "test-runs");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "sqlite-resource-access-store-"));
}

function internalDatabase(
  store: SQLiteResourceAccessGrantStore
): ReturnType<typeof Database> {
  return (store as unknown as { database: ReturnType<typeof Database> }).database;
}

function redirectGrantInput() {
  return {
    resourceAccessId: "resource-access-1",
    sessionId: "session-1",
    resourceId: "resource-1",
    participantId: "participant-1",
    mode: "redirect" as const,
    targetUrl: "https://example.com/resource.txt",
    exposure: "public" as const
  };
}

describe("SQLiteResourceAccessGrantStore", () => {
  it("configures local durable-file SQLite pragmas and validates timeout options", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resource-access.sqlite");
    let store: SQLiteResourceAccessGrantStore | undefined;

    try {
      store = new SQLiteResourceAccessGrantStore({ filePath, timeoutMs: 1234 });
      const database = internalDatabase(store);

      expect(database.pragma("busy_timeout", { simple: true })).toBe(1234);
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(String(database.pragma("journal_mode", { simple: true })).toLowerCase()).toBe(
        "wal"
      );
      expect(Number(database.pragma("synchronous", { simple: true }))).toBe(1);
      expect(() =>
        new SQLiteResourceAccessGrantStore({ filePath: ":memory:", timeoutMs: -1 })
      ).toThrow(SQLiteResourceAccessGrantStoreError);
    } finally {
      store?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists redirect grants across reloads without storing bearer access ids", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resource-access.sqlite");
    const accessId = "A".repeat(32);
    let now = Date.parse("2026-06-10T00:00:00.000Z");

    try {
      const store = new SQLiteResourceAccessGrantStore({
        filePath,
        clock: () => now,
        tokenGenerator: () => accessId,
        defaultTtlMs: 60000
      });
      const created = store.createGrant(redirectGrantInput());
      const storedText = JSON.stringify(
        internalDatabase(store)
          .prepare("SELECT token_hash, grant_json FROM deliberum_resource_access_grants")
          .all()
      );

      expect(created.accessId).toBe(accessId);
      expect(created.grant).toMatchObject({
        mode: "redirect",
        targetUrl: "https://example.com/resource.txt",
        accessCount: 0,
        expiresAt: now + 60000
      });
      expect(storedText).not.toContain(accessId);
      store.close();

      now += 1000;
      const reloaded = new SQLiteResourceAccessGrantStore({
        filePath,
        clock: () => now,
        tokenGenerator: () => "B".repeat(32)
      });
      const accessed = reloaded.recordAccess(accessId);

      expect(accessed).toMatchObject({
        mode: "redirect",
        targetUrl: "https://example.com/resource.txt",
        accessCount: 1,
        lastAccessedAt: now
      });
      expect(JSON.stringify(reloaded.getSafeView(accessId))).not.toContain(accessId);
      expect(reloaded.revokeGrant(accessId)).toMatchObject({
        revokedAt: now,
        accessCount: 1
      });
      reloaded.close();

      const revokedReload = new SQLiteResourceAccessGrantStore({
        filePath,
        clock: () => now + 1000
      });

      expect(() => revokedReload.recordAccess(accessId)).toThrow(ResourceAccessError);
      expect(JSON.stringify(internalDatabase(revokedReload).prepare("SELECT * FROM deliberum_resource_access_grants").all())).not.toContain(accessId);
      revokedReload.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists content grant metadata without exposing data refs in safe views", () => {
    const accessId = "C".repeat(32);
    const store = new SQLiteResourceAccessGrantStore({
      filePath: ":memory:",
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
        dataRef: "content-ref-1",
        mime: "text/plain",
        sizeBytes: 11,
        hash: "hash-content"
      }
    });
    const safeView = store.getSafeView(accessId);

    expect(created.grant).toMatchObject({
      mode: "content",
      content: {
        dataRef: "content-ref-1",
        mime: "text/plain",
        sizeBytes: 11,
        hash: "hash-content"
      }
    });
    expect(safeView).toMatchObject({
      mode: "content",
      content: {
        mime: "text/plain",
        sizeBytes: 11,
        hash: "hash-content"
      }
    });
    expect(JSON.stringify(safeView)).not.toContain("content-ref-1");
    expect(JSON.stringify(safeView)).not.toContain(accessId);

    store.close();
  });

  it("deletes expired grants and rejects unsafe inputs", () => {
    let now = 1000;
    const store = new SQLiteResourceAccessGrantStore({
      filePath: ":memory:",
      clock: () => now,
      tokenGenerator: () => "D".repeat(32),
      defaultTtlMs: 1000
    });

    store.createGrant(redirectGrantInput());
    now = 2000;

    expect(() => store.recordAccess("D".repeat(32))).toThrow(ResourceAccessError);
    expect(
      internalDatabase(store)
        .prepare("SELECT COUNT(*) AS count FROM deliberum_resource_access_grants")
        .get()
    ).toEqual({ count: 0 });
    expect(() =>
      store.createGrant({
        ...redirectGrantInput(),
        resourceAccessId: "resource-access-2",
        targetUrl: "file:///Users/example/private.txt"
      })
    ).toThrow(ResourceAccessError);

    store.close();
  });

  it("returns a store error when another SQLite writer holds the grant lock", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resource-access.sqlite");
    let store: SQLiteResourceAccessGrantStore | undefined;
    let locker: ReturnType<typeof Database> | undefined;

    try {
      store = new SQLiteResourceAccessGrantStore({
        filePath,
        timeoutMs: 1,
        tokenGenerator: () => "E".repeat(32)
      });
      locker = new Database(filePath);
      locker.exec("BEGIN IMMEDIATE");

      expect(() => store.createGrant(redirectGrantInput())).toThrow(
        SQLiteResourceAccessGrantStoreError
      );
    } finally {
      if (locker?.open) {
        if (locker.inTransaction) {
          locker.exec("ROLLBACK");
        }
        locker.close();
      }
      store?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported schema versions", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resource-access.sqlite");

    try {
      const seeded = new SQLiteResourceAccessGrantStore({ filePath });
      seeded.close();

      const database = new Database(filePath);
      database
        .prepare("UPDATE deliberum_store_metadata SET value = ? WHERE key = ?")
        .run("2", "sqlite_resource_access_store_schema_version");
      database.close();

      expect(() => new SQLiteResourceAccessGrantStore({ filePath })).toThrow(
        SQLiteResourceAccessGrantStoreError
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(SQLITE_RESOURCE_ACCESS_STORE_SCHEMA_VERSION).toBe(1);
  });
});
