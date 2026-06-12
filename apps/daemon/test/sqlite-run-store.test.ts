import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  RunStoreConflictError,
  RunStoreNotFoundError,
  RunStoreUpdateError,
  type DeliberationRunRecord
} from "@deliberum/orchestrator";
import {
  SQLITE_RUN_STORE_SCHEMA_VERSION,
  SQLiteRunStore,
  SQLiteRunStoreError,
  localPresetRunPlan
} from "../src";

function createTempDir() {
  const baseDir = join(process.cwd(), ".deliberum", "test-runs");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "sqlite-daemon-run-store-"));
}

function createRun(overrides: Partial<DeliberationRunRecord> = {}): DeliberationRunRecord {
  return {
    id: "run-1",
    schemaVersion: "1",
    sessionId: "session-1",
    status: "created",
    plan: localPresetRunPlan(),
    topicContractEventId: "event-1",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    ...overrides
  };
}

function internalDatabase(store: SQLiteRunStore): ReturnType<typeof Database> {
  return (store as unknown as { database: ReturnType<typeof Database> }).database;
}

describe("SQLiteRunStore", () => {
  it("configures local durable-file SQLite pragmas and validates timeout options", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.sqlite");
    let store: SQLiteRunStore | undefined;

    try {
      store = new SQLiteRunStore({ filePath, timeoutMs: 1234 });
      const database = internalDatabase(store);

      expect(database.pragma("busy_timeout", { simple: true })).toBe(1234);
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(String(database.pragma("journal_mode", { simple: true })).toLowerCase()).toBe(
        "wal"
      );
      expect(Number(database.pragma("synchronous", { simple: true }))).toBe(1);
      expect(() => new SQLiteRunStore({ filePath: ":memory:", timeoutMs: -1 })).toThrow(
        SQLiteRunStoreError
      );
    } finally {
      store?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists run records across reloads and preserves update behavior", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.sqlite");

    try {
      const store = new SQLiteRunStore({ filePath });
      const created = store.createRun(createRun());
      const updated = store.updateRun("run-1", (run) => ({
        ...run,
        status: "revealed",
        updatedAt: "2026-06-10T00:00:01.000Z"
      }));
      store.close();

      const reloaded = new SQLiteRunStore({ filePath });

      expect(created.status).toBe("created");
      expect(updated.status).toBe("revealed");
      expect(reloaded.getRun("run-1")).toEqual(updated);
      expect(reloaded.listRuns()).toEqual([updated]);

      reloaded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("coordinates run writes across multiple SQLite connections", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.sqlite");
    let firstStore: SQLiteRunStore | undefined;
    let secondStore: SQLiteRunStore | undefined;

    try {
      firstStore = new SQLiteRunStore({ filePath });
      secondStore = new SQLiteRunStore({ filePath });
      const first = firstStore.createRun(
        createRun({
          id: "run-a",
          sessionId: "session-a",
          createdAt: "2026-06-10T00:00:01.000Z"
        })
      );
      const second = secondStore.createRun(
        createRun({
          id: "run-b",
          sessionId: "session-b",
          createdAt: "2026-06-10T00:00:02.000Z"
        })
      );
      const updated = firstStore.updateRun("run-b", (run) => ({
        ...run,
        status: "revealed",
        updatedAt: "2026-06-10T00:00:03.000Z"
      }));

      expect(updated.status).toBe("revealed");
      expect(firstStore.listRuns()).toEqual([first, updated]);
      expect(secondStore.listRuns()).toEqual([first, updated]);
    } finally {
      firstStore?.close();
      secondStore?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a store error when another SQLite writer holds the run lock", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.sqlite");
    let store: SQLiteRunStore | undefined;
    let locker: ReturnType<typeof Database> | undefined;

    try {
      store = new SQLiteRunStore({ filePath, timeoutMs: 1 });
      locker = new Database(filePath);
      locker.exec("BEGIN IMMEDIATE");

      expect(() => store.createRun(createRun())).toThrow(SQLiteRunStoreError);
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

  it("uses defensive clones for returned run records", () => {
    const store = new SQLiteRunStore({ filePath: ":memory:" });
    const created = store.createRun(createRun());

    created.status = "failed";

    expect(store.getRun("run-1")?.status).toBe("created");

    store.close();
  });

  it("rejects duplicate run ids, duplicate sessions, and invalid updates", () => {
    const store = new SQLiteRunStore({ filePath: ":memory:" });

    store.createRun(createRun());

    expect(() => store.createRun(createRun())).toThrow(RunStoreConflictError);
    expect(() =>
      store.createRun(
        createRun({
          id: "run-2"
        })
      )
    ).toThrow(SQLiteRunStoreError);
    expect(() => store.updateRun("missing-run", (run) => run)).toThrow(RunStoreNotFoundError);
    expect(() =>
      store.updateRun("run-1", (run) => ({
        ...run,
        id: "changed-run"
      }))
    ).toThrow(RunStoreUpdateError);
    expect(() =>
      store.updateRun("run-1", (run) => ({
        ...run,
        sessionId: "changed-session"
      }))
    ).toThrow(RunStoreUpdateError);

    store.close();
  });

  it("lists runs by creation time and id", () => {
    const store = new SQLiteRunStore({ filePath: ":memory:" });
    const second = store.createRun(
      createRun({
        id: "run-b",
        sessionId: "session-b",
        createdAt: "2026-06-10T00:00:02.000Z"
      })
    );
    const first = store.createRun(
      createRun({
        id: "run-a",
        sessionId: "session-a",
        createdAt: "2026-06-10T00:00:01.000Z"
      })
    );

    expect(store.listRuns()).toEqual([first, second]);

    store.close();
  });

  it("rejects unsupported schema versions", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.sqlite");

    try {
      const seeded = new SQLiteRunStore({ filePath });
      seeded.close();

      const database = new Database(filePath);
      database
        .prepare("UPDATE deliberum_store_metadata SET value = ? WHERE key = ?")
        .run("2", "sqlite_run_store_schema_version");
      database.close();

      expect(() => new SQLiteRunStore({ filePath })).toThrow(SQLiteRunStoreError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not expose update-by-field or delete mutation APIs", () => {
    const store = new SQLiteRunStore({ filePath: ":memory:" }) as unknown as Record<
      string,
      unknown
    >;

    expect(store.patchRun).toBeUndefined();
    expect(store.deleteRun).toBeUndefined();
    expect(store.removeRun).toBeUndefined();
    expect(store.replaceRun).toBeUndefined();

    (store as unknown as SQLiteRunStore).close();
  });

  it("exports the current SQLite run store schema version", () => {
    expect(SQLITE_RUN_STORE_SCHEMA_VERSION).toBe(1);
  });
});
