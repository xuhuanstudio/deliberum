import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  type AppendEventInput,
  SQLiteEventStore,
  SQLiteEventStoreError
} from "../src";

function createTempDir() {
  const baseDir = join(process.cwd(), ".deliberum", "test-runs");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "sqlite-storage-store-"));
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

function internalDatabase(store: SQLiteEventStore): ReturnType<typeof Database> {
  return (store as unknown as { database: ReturnType<typeof Database> }).database;
}

describe("SQLiteEventStore", () => {
  it("configures local durable-file SQLite pragmas and validates timeout options", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.sqlite");
    let store: SQLiteEventStore | undefined;

    try {
      store = new SQLiteEventStore({ filePath, timeoutMs: 1234 });
      const database = internalDatabase(store);

      expect(database.pragma("busy_timeout", { simple: true })).toBe(1234);
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(String(database.pragma("journal_mode", { simple: true })).toLowerCase()).toBe(
        "wal"
      );
      expect(Number(database.pragma("synchronous", { simple: true }))).toBe(1);
      expect(() => new SQLiteEventStore({ filePath: ":memory:", timeoutMs: -1 })).toThrow(
        SQLiteEventStoreError
      );
    } finally {
      store?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists events across reloads with sequence, recordedAt, and idempotency", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.sqlite");

    try {
      const store = new SQLiteEventStore({
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
      store.close();

      const reloaded = new SQLiteEventStore({ filePath });

      expect(first.sequence).toBe(0);
      expect(first.recordedAt).toBe("2026-06-10T00:00:01.000Z");
      expect(duplicate).toEqual(first);
      expect(reloaded.listEvents("session-1")).toEqual([first]);

      reloaded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serializes sequence assignment across multiple SQLite connections", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.sqlite");
    let firstStore: SQLiteEventStore | undefined;
    let secondStore: SQLiteEventStore | undefined;

    try {
      firstStore = new SQLiteEventStore({ filePath });
      secondStore = new SQLiteEventStore({ filePath });
      const first = firstStore.appendEvent(createInput({ id: "event-1" }));
      const second = secondStore.appendEvent(createInput({ id: "event-2" }));

      expect(first.sequence).toBe(0);
      expect(second.sequence).toBe(1);
      expect(firstStore.listEvents("session-1")).toEqual([first, second]);
      expect(secondStore.listEvents("session-1")).toEqual([first, second]);
    } finally {
      firstStore?.close();
      secondStore?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a store error when another SQLite writer holds the event lock", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.sqlite");
    let store: SQLiteEventStore | undefined;
    let locker: ReturnType<typeof Database> | undefined;

    try {
      store = new SQLiteEventStore({ filePath, timeoutMs: 1 });
      locker = new Database(filePath);
      locker.exec("BEGIN IMMEDIATE");

      expect(() => store.appendEvent(createInput())).toThrow(SQLiteEventStoreError);
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

  it("reports append result metadata and rejects incompatible retries", () => {
    const store = new SQLiteEventStore({
      filePath: ":memory:",
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

    expect(first.appended).toBe(true);
    expect(retry.appended).toBe(false);
    expect(retry.event).toEqual(first.event);
    expect(() =>
      store.appendEventResult(
        createInput({
          id: "event-3",
          idempotencyKey: "same-logical-event",
          payload: {
            ok: false
          }
        })
      )
    ).toThrow(SQLiteEventStoreError);

    store.close();
  });

  it("preserves query behavior across reloads", () => {
    const dir = createTempDir();
    const filePath = join(dir, "events.sqlite");

    try {
      const store = new SQLiteEventStore({
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
      store.appendEvent(
        createInput({
          id: "event-3",
          sessionId: "session-2"
        })
      );
      store.close();

      const reloaded = new SQLiteEventStore({ filePath });

      expect(reloaded.getEvent("event-1")).toEqual(first);
      expect(reloaded.listSessionIds()).toEqual(["session-1", "session-2"]);
      expect(reloaded.listEvents("session-1")).toEqual([first, second]);
      expect(reloaded.listEventsByRange("session-1", 1, 1)).toEqual([second]);
      expect(reloaded.listEventsByType("session-1", "beta")).toEqual([second]);
      expect(reloaded.listEventsByBatch("session-1", "batch-1")).toEqual([first, second]);
      expect(reloaded.listEventsByVisibility("session-1", "sealed")).toEqual([second]);

      reloaded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects caller-provided store-assigned fields and duplicate event ids", () => {
    const store = new SQLiteEventStore({ filePath: ":memory:" });

    store.appendEvent(createInput());

    expect(() =>
      store.appendEvent({
        ...createInput({
          id: "event-2"
        }),
        sequence: 10
      } as unknown as AppendEventInput)
    ).toThrow(SQLiteEventStoreError);
    expect(() =>
      store.appendEvent({
        ...createInput({
          id: "event-2"
        }),
        recordedAt: "2026-06-10T00:00:00.000Z"
      } as unknown as AppendEventInput)
    ).toThrow(SQLiteEventStoreError);
    expect(() => store.appendEvent(createInput())).toThrow(SQLiteEventStoreError);

    store.close();
  });

  it("rejects invalid sequence ranges and unsupported schema versions", () => {
    const store = new SQLiteEventStore({ filePath: ":memory:" });

    expect(() => store.listEventsByRange("session-1", -1, 1)).toThrow(SQLiteEventStoreError);
    expect(() => store.listEventsByRange("session-1", 2, 1)).toThrow(SQLiteEventStoreError);

    store.close();

    const dir = createTempDir();
    const filePath = join(dir, "events.sqlite");

    try {
      const seeded = new SQLiteEventStore({ filePath });
      seeded.close();

      const database = new Database(filePath);
      database
        .prepare("UPDATE deliberum_store_metadata SET value = ? WHERE key = ?")
        .run("2", "sqlite_event_store_schema_version");
      database.close();

      expect(() => new SQLiteEventStore({ filePath })).toThrow(SQLiteEventStoreError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not expose mutation APIs beyond the EventStore append contract", () => {
    const store = new SQLiteEventStore({ filePath: ":memory:" }) as unknown as Record<
      string,
      unknown
    >;

    expect(store.deleteEvent).toBeUndefined();
    expect(store.updateEvent).toBeUndefined();
    expect(store.replaceEvent).toBeUndefined();

    (store as unknown as SQLiteEventStore).close();
  });
});
