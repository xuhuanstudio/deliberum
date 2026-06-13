import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SQLiteDaemonProcessLock,
  SQLiteDaemonProcessLockError
} from "../src/sqlite-daemon-process-lock";

function createTempDir(): string {
  const baseDir = join(tmpdir(), "deliberum-test");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "sqlite-daemon-process-lock-"));
}

describe("SQLiteDaemonProcessLock", () => {
  it("prevents concurrent active daemon owners and releases the lock", () => {
    const dir = createTempDir();
    const filePath = join(dir, "daemon.sqlite");
    let now = 1000;
    let firstLock: SQLiteDaemonProcessLock | undefined;
    let secondLock: SQLiteDaemonProcessLock | undefined;

    try {
      firstLock = new SQLiteDaemonProcessLock({
        filePath,
        ownerId: "daemon-a",
        clock: () => now,
        ttlMs: 1000,
        heartbeatMs: 500
      });
      secondLock = new SQLiteDaemonProcessLock({
        filePath,
        ownerId: "daemon-b",
        clock: () => now,
        ttlMs: 1000,
        heartbeatMs: 500
      });

      firstLock.acquire();
      expect(() => secondLock?.acquire()).toThrow(SQLiteDaemonProcessLockError);

      now = 1200;
      firstLock.heartbeat();
      expect(() => secondLock?.acquire()).toThrow(SQLiteDaemonProcessLockError);

      firstLock.release();
      expect(() => secondLock?.acquire()).not.toThrow();
    } finally {
      secondLock?.release();
      firstLock?.release();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a new daemon owner to recover an expired lock", () => {
    const dir = createTempDir();
    const filePath = join(dir, "daemon.sqlite");
    let now = 1000;
    let firstLock: SQLiteDaemonProcessLock | undefined;
    let secondLock: SQLiteDaemonProcessLock | undefined;

    try {
      firstLock = new SQLiteDaemonProcessLock({
        filePath,
        ownerId: "daemon-a",
        clock: () => now,
        ttlMs: 1000,
        heartbeatMs: 500
      });
      secondLock = new SQLiteDaemonProcessLock({
        filePath,
        ownerId: "daemon-b",
        clock: () => now,
        ttlMs: 1000,
        heartbeatMs: 500
      });

      firstLock.acquire();
      now = 2500;
      secondLock.acquire();

      expect(() => firstLock?.heartbeat()).toThrow(SQLiteDaemonProcessLockError);
    } finally {
      secondLock?.release();
      firstLock?.release();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates durable-file and heartbeat settings", () => {
    const dir = createTempDir();

    expect(
      () =>
        new SQLiteDaemonProcessLock({
          filePath: ":memory:"
        })
    ).toThrow(SQLiteDaemonProcessLockError);
    try {
      expect(
        () =>
          new SQLiteDaemonProcessLock({
            filePath: join(dir, "daemon.sqlite"),
            ttlMs: 1000,
            heartbeatMs: 1000
          })
      ).toThrow(SQLiteDaemonProcessLockError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
