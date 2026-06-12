import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  InvalidResourceRegistrationError,
  ResourceAlreadyRegisteredError
} from "@deliberum/resources";
import {
  SQLITE_RESOURCE_BROKER_SCHEMA_VERSION,
  SQLiteResourceBroker,
  SQLiteResourceBrokerError
} from "../src/sqlite-resource-broker";

function createTempDir() {
  const baseDir = join(process.cwd(), ".deliberum", "test-runs");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "sqlite-resource-broker-"));
}

function internalDatabase(store: SQLiteResourceBroker): ReturnType<typeof Database> {
  return (store as unknown as { database: ReturnType<typeof Database> }).database;
}

function base64Resource(id = "resource-1", dataRef = "content-1") {
  return {
    id,
    kind: "text" as const,
    mime: "text/plain",
    sizeBytes: 11,
    hash: `hash-${id}`,
    privacy: "public" as const,
    variants: [
      {
        mode: "base64" as const,
        mime: "text/plain",
        dataRef,
        sizeBytes: 11
      },
      {
        mode: "summary" as const,
        text: "Safe summary"
      }
    ]
  };
}

describe("SQLiteResourceBroker", () => {
  it("configures local durable-file SQLite pragmas and validates timeout options", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resources.sqlite");
    let broker: SQLiteResourceBroker | undefined;

    try {
      broker = new SQLiteResourceBroker({ filePath, timeoutMs: 1234 });
      const database = internalDatabase(broker);

      expect(database.pragma("busy_timeout", { simple: true })).toBe(1234);
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(String(database.pragma("journal_mode", { simple: true })).toLowerCase()).toBe(
        "wal"
      );
      expect(Number(database.pragma("synchronous", { simple: true }))).toBe(1);
      expect(() => new SQLiteResourceBroker({ filePath: ":memory:", timeoutMs: -1 })).toThrow(
        SQLiteResourceBrokerError
      );
    } finally {
      broker?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists resource metadata and explicit content across reloads", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resources.sqlite");
    const base64 = Buffer.from("hello world").toString("base64");

    try {
      const broker = new SQLiteResourceBroker({ filePath });
      const registered = broker.registerResource({
        resource: base64Resource(),
        contents: [
          {
            dataRef: "content-1",
            base64
          }
        ]
      });

      expect(registered).toMatchObject({
        id: "resource-1",
        variants: expect.arrayContaining([
          expect.objectContaining({
            mode: "base64",
            dataRef: "content-1"
          })
        ])
      });
      expect(broker.getExplicitInMemoryContent("content-1")).toBe(base64);
      broker.close();

      const reloaded = new SQLiteResourceBroker({ filePath });

      expect(reloaded.getResource("resource-1")).toMatchObject({
        id: "resource-1",
        privacy: "public"
      });
      expect(reloaded.listResources()).toHaveLength(1);
      expect(reloaded.getExplicitInMemoryContent("content-1")).toBe(base64);
      reloaded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid registrations and duplicate resources or content refs", () => {
    const broker = new SQLiteResourceBroker({ filePath: ":memory:" });

    broker.registerResource({
      resource: base64Resource("resource-1", "content-1"),
      contents: [
        {
          dataRef: "content-1",
          base64: Buffer.from("hello world").toString("base64")
        }
      ]
    });

    expect(() =>
      broker.registerResource({
        resource: base64Resource("resource-1", "other-content")
      })
    ).toThrow(ResourceAlreadyRegisteredError);
    expect(() =>
      broker.registerResource({
        resource: base64Resource("resource-2", "missing-content"),
        contents: [
          {
            dataRef: "different-content",
            base64: "aGVsbG8="
          }
        ]
      })
    ).toThrow(InvalidResourceRegistrationError);
    expect(() =>
      broker.registerResource({
        resource: base64Resource("resource-3", "content-1"),
        contents: [
          {
            dataRef: "content-1",
            base64: "aGVsbG8="
          }
        ]
      })
    ).toThrow(InvalidResourceRegistrationError);

    broker.close();
  });

  it("returns a store error when another SQLite writer holds the broker lock", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resources.sqlite");
    let broker: SQLiteResourceBroker | undefined;
    let locker: ReturnType<typeof Database> | undefined;

    try {
      broker = new SQLiteResourceBroker({ filePath, timeoutMs: 1 });
      locker = new Database(filePath);
      locker.exec("BEGIN IMMEDIATE");

      expect(() => broker.registerResource({ resource: base64Resource() })).toThrow(
        SQLiteResourceBrokerError
      );
    } finally {
      if (locker?.open) {
        if (locker.inTransaction) {
          locker.exec("ROLLBACK");
        }
        locker.close();
      }
      broker?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported schema versions", () => {
    const dir = createTempDir();
    const filePath = join(dir, "resources.sqlite");

    try {
      const seeded = new SQLiteResourceBroker({ filePath });
      seeded.close();

      const database = new Database(filePath);
      database
        .prepare("UPDATE deliberum_store_metadata SET value = ? WHERE key = ?")
        .run("2", "sqlite_resource_broker_schema_version");
      database.close();

      expect(() => new SQLiteResourceBroker({ filePath })).toThrow(
        SQLiteResourceBrokerError
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(SQLITE_RESOURCE_BROKER_SCHEMA_VERSION).toBe(1);
  });
});
