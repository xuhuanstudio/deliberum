import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as realFs from "node:fs";
import { join } from "node:path";
import {
  RunStoreConflictError,
  RunStoreNotFoundError,
  RunStoreUpdateError,
  type DeliberationRunRecord
} from "@deliberum/orchestrator";
import {
  JSON_RUN_STORE_SCHEMA_VERSION,
  JsonFileRunStore,
  JsonFileRunStoreError,
  localPresetRunPlan,
  type JsonFileRunStoreFileSystem
} from "../src";

function createTempDir() {
  const baseDir = join(process.cwd(), ".deliberum", "test-runs");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "daemon-run-store-"));
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

function writePersistedRuns(filePath: string, runs: readonly DeliberationRunRecord[]): void {
  writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: JSON_RUN_STORE_SCHEMA_VERSION,
      runs
    }),
    "utf8"
  );
}

describe("JsonFileRunStore", () => {
  it("persists run records across reloads and preserves update behavior", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.json");
    const store = new JsonFileRunStore({ filePath });

    const created = store.createRun(createRun());
    const updated = store.updateRun("run-1", (run) => ({
      ...run,
      status: "revealed",
      updatedAt: "2026-06-10T00:00:01.000Z"
    }));
    const reloaded = new JsonFileRunStore({ filePath });

    expect(created.status).toBe("created");
    expect(updated.status).toBe("revealed");
    expect(reloaded.getRun("run-1")).toEqual(updated);
    expect(reloaded.listRuns()).toEqual([updated]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("uses defensive clones for returned run records", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.json");
    const store = new JsonFileRunStore({ filePath });
    const created = store.createRun(createRun());

    created.status = "failed";

    expect(store.getRun("run-1")?.status).toBe("created");

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects duplicate run ids and missing update targets", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.json");
    const store = new JsonFileRunStore({ filePath });

    store.createRun(createRun());

    expect(() => store.createRun(createRun())).toThrow(RunStoreConflictError);
    expect(() => store.updateRun("missing-run", (run) => run)).toThrow(RunStoreNotFoundError);
    expect(() =>
      store.updateRun("run-1", (run) => ({
        ...run,
        id: "changed-run"
      }))
    ).toThrow(RunStoreUpdateError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the storage directory and writes via temp file then rename", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".deliberum", "runs.json");
    const tempPath = join(dir, ".deliberum", "runs.tmp");
    const operations: string[] = [];
    const fileSystem: JsonFileRunStoreFileSystem = {
      ...realFs,
      writeFileSync(path, data, options) {
        operations.push(`write:${String(path)}`);
        return realFs.writeFileSync(path, data, options);
      },
      renameSync(oldPath, newPath) {
        operations.push(`rename:${String(oldPath)}:${String(newPath)}`);
        return realFs.renameSync(oldPath, newPath);
      }
    };
    const store = new JsonFileRunStore({
      filePath,
      fileSystem,
      tempFileName: () => tempPath
    });

    store.createRun(createRun());

    expect(realFs.existsSync(join(dir, ".deliberum"))).toBe(true);
    expect(operations).toEqual([`write:${tempPath}`, `rename:${tempPath}:${filePath}`]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects corrupted and unsupported persisted run store files", () => {
    const dir = createTempDir();
    const corruptPath = join(dir, "corrupt-runs.json");
    const unsupportedPath = join(dir, "unsupported-runs.json");

    writeFileSync(corruptPath, "{not json", "utf8");
    writeFileSync(
      unsupportedPath,
      JSON.stringify({
        schemaVersion: 2,
        runs: []
      }),
      "utf8"
    );

    expect(() => new JsonFileRunStore({ filePath: corruptPath })).toThrow(JsonFileRunStoreError);
    expect(() => new JsonFileRunStore({ filePath: unsupportedPath })).toThrow(
      JsonFileRunStoreError
    );

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects invalid and duplicate persisted run records", () => {
    const dir = createTempDir();
    const invalidPath = join(dir, "invalid-runs.json");
    const duplicateRunPath = join(dir, "duplicate-runs.json");
    const duplicateSessionPath = join(dir, "duplicate-sessions.json");

    writeFileSync(
      invalidPath,
      JSON.stringify({
        schemaVersion: JSON_RUN_STORE_SCHEMA_VERSION,
        runs: [
          {
            id: "run-1"
          }
        ]
      }),
      "utf8"
    );
    writePersistedRuns(duplicateRunPath, [
      createRun({ id: "run-1", sessionId: "session-1" }),
      createRun({ id: "run-1", sessionId: "session-2" })
    ]);
    writePersistedRuns(duplicateSessionPath, [
      createRun({ id: "run-1", sessionId: "session-1" }),
      createRun({ id: "run-2", sessionId: "session-1" })
    ]);

    expect(() => new JsonFileRunStore({ filePath: invalidPath })).toThrow(JsonFileRunStoreError);
    expect(() => new JsonFileRunStore({ filePath: duplicateRunPath })).toThrow(
      JsonFileRunStoreError
    );
    expect(() => new JsonFileRunStore({ filePath: duplicateSessionPath })).toThrow(
      JsonFileRunStoreError
    );

    rmSync(dir, { recursive: true, force: true });
  });

  it("does not expose update-by-field or delete mutation APIs", () => {
    const dir = createTempDir();
    const filePath = join(dir, "runs.json");
    const store = new JsonFileRunStore({ filePath }) as unknown as Record<string, unknown>;

    expect(store.patchRun).toBeUndefined();
    expect(store.deleteRun).toBeUndefined();
    expect(store.removeRun).toBeUndefined();
    expect(store.replaceRun).toBeUndefined();

    rmSync(dir, { recursive: true, force: true });
  });
});
