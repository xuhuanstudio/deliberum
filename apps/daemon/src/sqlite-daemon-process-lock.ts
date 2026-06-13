import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const SQLITE_DAEMON_PROCESS_LOCK_NAME = "daemon" as const;
export const SQLITE_DAEMON_PROCESS_LOCK_DEFAULT_TTL_MS = 60_000;
export const SQLITE_DAEMON_PROCESS_LOCK_DEFAULT_HEARTBEAT_MS = 20_000;

export class SQLiteDaemonProcessLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLiteDaemonProcessLockError";
  }
}

export type SQLiteDaemonProcessLockClock = () => number;

export type SQLiteDaemonProcessLockOptions = {
  filePath: string;
  ownerId?: string;
  clock?: SQLiteDaemonProcessLockClock;
  ttlMs?: number;
  heartbeatMs?: number;
  timeoutMs?: number;
};

type SQLiteDatabase = ReturnType<typeof Database>;
type LockRow = {
  owner_id: string;
  expires_at: number;
};

const DEFAULT_SQLITE_TIMEOUT_MS = 5000;

export class SQLiteDaemonProcessLock {
  private readonly database: SQLiteDatabase;
  private readonly ownerId: string;
  private readonly clock: SQLiteDaemonProcessLockClock;
  private readonly ttlMs: number;
  private readonly heartbeatMs: number;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private acquired = false;

  constructor(options: SQLiteDaemonProcessLockOptions) {
    const ownerId = normalizeOwnerId(options.ownerId);
    const ttlMs = normalizeDurationMs(
      options.ttlMs ?? SQLITE_DAEMON_PROCESS_LOCK_DEFAULT_TTL_MS,
      "ttlMs"
    );
    const heartbeatMs = normalizeDurationMs(
      options.heartbeatMs ?? SQLITE_DAEMON_PROCESS_LOCK_DEFAULT_HEARTBEAT_MS,
      "heartbeatMs"
    );

    if (heartbeatMs >= ttlMs) {
      throw new SQLiteDaemonProcessLockError("heartbeatMs must be less than ttlMs.");
    }

    if (options.filePath === ":memory:") {
      throw new SQLiteDaemonProcessLockError(
        "SQLite daemon process lock requires a durable SQLite file path."
      );
    }

    mkdirSync(dirname(options.filePath), { recursive: true });
    this.database = new Database(options.filePath, {
      timeout: normalizeTimeoutMs(options.timeoutMs)
    });
    this.ownerId = ownerId;
    this.clock = options.clock ?? (() => Date.now());
    this.ttlMs = ttlMs;
    this.heartbeatMs = heartbeatMs;

    configureSQLiteConnection(this.database, options.timeoutMs);
    this.initialize();
  }

  acquire(): void {
    const acquire = this.database.transaction(() => {
      const now = this.now();
      const existing = this.findLock();

      if (existing && existing.expires_at > now && existing.owner_id !== this.ownerId) {
        throw new SQLiteDaemonProcessLockError(
          "SQLite daemon process lock is already held by another active daemon."
        );
      }

      this.database
        .prepare<[string, string, number, number, number]>(
          [
            "INSERT INTO deliberum_daemon_process_locks",
            "(lock_name, owner_id, acquired_at, heartbeat_at, expires_at)",
            "VALUES (?, ?, ?, ?, ?)",
            "ON CONFLICT(lock_name) DO UPDATE SET",
            "owner_id = excluded.owner_id,",
            "acquired_at = excluded.acquired_at,",
            "heartbeat_at = excluded.heartbeat_at,",
            "expires_at = excluded.expires_at"
          ].join(" ")
        )
        .run(
          SQLITE_DAEMON_PROCESS_LOCK_NAME,
          this.ownerId,
          now,
          now,
          now + this.ttlMs
        );
    });

    try {
      acquire.immediate();
      this.acquired = true;
    } catch (error) {
      throw mapSQLiteDaemonProcessLockError(error);
    }
  }

  startHeartbeat(): void {
    if (!this.acquired) {
      throw new SQLiteDaemonProcessLockError(
        "SQLite daemon process lock must be acquired before heartbeat starts."
      );
    }

    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        this.heartbeat();
      } catch {
        this.stopHeartbeat();
      }
    }, this.heartbeatMs);
    this.heartbeatTimer.unref?.();
  }

  heartbeat(): void {
    if (!this.acquired) {
      throw new SQLiteDaemonProcessLockError(
        "SQLite daemon process lock must be acquired before heartbeat."
      );
    }

    const now = this.now();
    const result = this.database
      .prepare<[number, number, string, string]>(
        [
          "UPDATE deliberum_daemon_process_locks",
          "SET heartbeat_at = ?, expires_at = ?",
          "WHERE lock_name = ? AND owner_id = ?"
        ].join(" ")
      )
      .run(
        now,
        now + this.ttlMs,
        SQLITE_DAEMON_PROCESS_LOCK_NAME,
        this.ownerId
      );

    if (result.changes !== 1) {
      this.acquired = false;
      this.stopHeartbeat();
      throw new SQLiteDaemonProcessLockError(
        "SQLite daemon process lock was lost before heartbeat."
      );
    }
  }

  release(): void {
    this.stopHeartbeat();

    if (!this.database.open) {
      return;
    }

    if (this.acquired) {
      this.database
        .prepare<[string, string]>(
          [
            "DELETE FROM deliberum_daemon_process_locks",
            "WHERE lock_name = ? AND owner_id = ?"
          ].join(" ")
        )
        .run(SQLITE_DAEMON_PROCESS_LOCK_NAME, this.ownerId);
      this.acquired = false;
    }

    this.database.close();
  }

  close(): void {
    this.release();
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS deliberum_daemon_process_locks (
        lock_name TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        heartbeat_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
  }

  private findLock(): LockRow | undefined {
    return this.database
      .prepare<[string], LockRow>(
        [
          "SELECT owner_id, expires_at",
          "FROM deliberum_daemon_process_locks",
          "WHERE lock_name = ?"
        ].join(" ")
      )
      .get(SQLITE_DAEMON_PROCESS_LOCK_NAME);
  }

  private now(): number {
    const now = this.clock();
    if (!Number.isInteger(now) || now < 0) {
      throw new SQLiteDaemonProcessLockError(
        "SQLite daemon process lock clock must return a nonnegative millisecond timestamp."
      );
    }

    return now;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}

function configureSQLiteConnection(database: SQLiteDatabase, timeoutMs?: number): void {
  database.pragma(`busy_timeout = ${normalizeTimeoutMs(timeoutMs)}`);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  const value = timeoutMs ?? DEFAULT_SQLITE_TIMEOUT_MS;

  if (!Number.isFinite(value) || value < 0) {
    throw new SQLiteDaemonProcessLockError(
      "SQLite daemon process lock timeoutMs must be a non-negative finite number."
    );
  }

  return Math.trunc(value);
}

function normalizeDurationMs(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SQLiteDaemonProcessLockError(`${name} must be a positive integer.`);
  }

  return value;
}

function normalizeOwnerId(ownerId: string | undefined): string {
  const value = ownerId ?? randomUUID();

  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) {
    throw new SQLiteDaemonProcessLockError(
      "SQLite daemon process lock ownerId must be a safe non-secret identifier."
    );
  }

  return value;
}

function mapSQLiteDaemonProcessLockError(error: unknown): unknown {
  if (error instanceof SQLiteDaemonProcessLockError) {
    return error;
  }

  if (error instanceof Database.SqliteError && error.code === "SQLITE_BUSY") {
    return new SQLiteDaemonProcessLockError(
      "SQLite daemon process lock is busy while another writer holds the database lock."
    );
  }

  return error;
}
