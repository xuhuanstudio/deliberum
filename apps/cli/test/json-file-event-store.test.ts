import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as realFs from "node:fs";
import { join } from "node:path";
import type { AppendEventInput } from "@deliberum/storage";
import type { EventEnvelope } from "@deliberum/protocol";
import {
  JsonFileEventStore,
  JsonFileEventStoreError,
  type JsonFileEventStoreFileSystem
} from "../src";

function createTempDir() {
  const baseDir = join(process.cwd(), ".deliberum", "test-runs");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "cli-store-"));
}

function createInput(overrides: Partial<AppendEventInput> = {}): AppendEventInput {
  return {
    id: "event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "test_event",
    authorId: "system",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [],
    visibility: "public",
    trace: {},
    payload: {
      ok: true
    },
    ...overrides
  };
}

function createPersistedEvent(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    ...createInput(),
    sequence: 0,
    recordedAt: "2026-06-10T00:00:01.000Z",
    ...overrides
  } as EventEnvelope;
}

function writePersistedLedger(filePath: string, events: readonly EventEnvelope[]): void {
  writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      events
    }),
    "utf8"
  );
}

describe("JsonFileEventStore", () => {
  it("persists events across reloads with sequence, recordedAt, and idempotency", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".deliberum", "events.json");
    const store = new JsonFileEventStore({
      filePath,
      clock: () => "2026-06-10T00:00:01.000Z"
    });

    const first = store.appendEvent(
      createInput({
        idempotencyKey: "same-logical-event"
      })
    );
    const duplicate = store.appendEvent(
      createInput({
        id: "event-2",
        idempotencyKey: "same-logical-event"
      })
    );
    const reloaded = new JsonFileEventStore({ filePath });

    expect(first.sequence).toBe(0);
    expect(first.recordedAt).toBe("2026-06-10T00:00:01.000Z");
    expect(duplicate).toEqual(first);
    expect(reloaded.listEvents("session-1")).toEqual([first]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("reports append result metadata while preserving idempotency across reloads", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".deliberum", "events.json");
    const store = new JsonFileEventStore({
      filePath,
      clock: () => "2026-06-10T00:00:01.000Z"
    });

    const first = store.appendEventResult(
      createInput({
        idempotencyKey: "same-logical-event"
      })
    );
    const retry = store.appendEventResult(
      createInput({
        id: "event-2",
        idempotencyKey: "same-logical-event"
      })
    );
    const reloaded = new JsonFileEventStore({ filePath });
    const reloadedRetry = reloaded.appendEventResult(
      createInput({
        id: "event-3",
        idempotencyKey: "same-logical-event"
      })
    );

    expect(first.appended).toBe(true);
    expect(retry.appended).toBe(false);
    expect(retry.event).toEqual(first.event);
    expect(reloadedRetry.appended).toBe(false);
    expect(reloadedRetry.event).toEqual(first.event);
    expect(reloaded.listEvents("session-1")).toHaveLength(1);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects append result retries with different event inputs", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".deliberum", "events.json");
    const store = new JsonFileEventStore({
      filePath,
      clock: () => "2026-06-10T00:00:01.000Z"
    });

    store.appendEvent(
      createInput({
        idempotencyKey: "same-logical-event"
      })
    );

    expect(() =>
      store.appendEventResult(
        createInput({
          id: "event-2",
          idempotencyKey: "same-logical-event",
          payload: {
            ok: false
          }
        })
      )
    ).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("preserves query behavior across reloads", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".deliberum", "events.json");
    const store = new JsonFileEventStore({
      filePath,
      clock: () => "2026-06-10T00:00:01.000Z"
    });

    const first = store.appendEvent(
      createInput({
        id: "event-1",
        type: "alpha",
        batchId: "batch-1",
        visibility: "public"
      })
    );
    const second = store.appendEvent(
      createInput({
        id: "event-2",
        type: "beta",
        batchId: "batch-1",
        visibility: "sealed"
      })
    );
    const reloaded = new JsonFileEventStore({ filePath });

    expect(reloaded.getEvent("event-1")).toEqual(first);
    expect(reloaded.listEvents("session-1")).toEqual([first, second]);
    expect(reloaded.listEventsByRange("session-1", 1, 1)).toEqual([second]);
    expect(reloaded.listEventsByType("session-1", "beta")).toEqual([second]);
    expect(reloaded.listEventsByBatch("session-1", "batch-1")).toEqual([first, second]);
    expect(reloaded.listEventsByVisibility("session-1", "sealed")).toEqual([second]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects caller-provided store-assigned fields", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    const store = new JsonFileEventStore({ filePath });

    expect(() =>
      store.appendEvent({
        ...createInput(),
        sequence: 10
      } as unknown as AppendEventInput)
    ).toThrow(JsonFileEventStoreError);
    expect(() =>
      store.appendEvent({
        ...createInput(),
        recordedAt: "2026-06-10T00:00:00.000Z"
      } as unknown as AppendEventInput)
    ).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the storage directory and writes via temp file then rename", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".deliberum", "events.json");
    const tempPath = join(dir, ".deliberum", "events.tmp");
    const operations: string[] = [];
    const fileSystem: JsonFileEventStoreFileSystem = {
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
    const store = new JsonFileEventStore({
      filePath,
      fileSystem,
      tempFileName: () => tempPath
    });

    store.appendEvent(createInput());

    expect(realFs.existsSync(join(dir, ".deliberum"))).toBe(true);
    expect(operations).toEqual([`write:${tempPath}`, `rename:${tempPath}:${filePath}`]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects corrupted JSON", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writeFileSync(filePath, "{not json", "utf8");

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects unsupported schemaVersion", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writeFileSync(filePath, JSON.stringify({ schemaVersion: 2, events: [] }), "utf8");

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects invalid persisted events", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        events: [
          {
            id: "event-1"
          }
        ]
      }),
      "utf8"
    );

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects duplicate event ids in persisted ledger files", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writePersistedLedger(filePath, [
      createPersistedEvent({ id: "event-1", sequence: 0 }),
      createPersistedEvent({ id: "event-1", sequence: 1 })
    ]);

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects duplicate per-session sequence values in persisted ledger files", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writePersistedLedger(filePath, [
      createPersistedEvent({ id: "event-1", sequence: 0 }),
      createPersistedEvent({ id: "event-2", sequence: 0 })
    ]);

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects negative sequence values in persisted ledger files", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writePersistedLedger(filePath, [createPersistedEvent({ sequence: -1 })]);

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects sequence gaps in persisted ledger files", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writePersistedLedger(filePath, [
      createPersistedEvent({ id: "event-1", sequence: 0 }),
      createPersistedEvent({ id: "event-2", sequence: 2 })
    ]);

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects non-zero starting sequence values in persisted ledger files", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writePersistedLedger(filePath, [createPersistedEvent({ sequence: 1 })]);

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects reused session idempotency keys that point to different event ids", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    writePersistedLedger(filePath, [
      createPersistedEvent({
        id: "event-1",
        sequence: 0,
        idempotencyKey: "same-logical-event"
      }),
      createPersistedEvent({
        id: "event-2",
        sequence: 1,
        idempotencyKey: "same-logical-event"
      })
    ]);

    expect(() => new JsonFileEventStore({ filePath })).toThrow(JsonFileEventStoreError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("does not expose update or delete mutation APIs", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.json");
    const store = new JsonFileEventStore({ filePath });

    expect("updateEvent" in store).toBe(false);
    expect("deleteEvent" in store).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });
});
