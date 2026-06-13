import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  OPERATION_AUDIT_LOG_SCHEMA_VERSION,
  OperationAuditLogError,
  parseOperationAuditEntry,
  parseOperationAuditLimit,
  parseOperationAuditRecordInput,
  normalizeOperationAuditMaxEntries,
  type OperationAuditEntry,
  type OperationAuditListOptions,
  type OperationAuditLog,
  type OperationAuditRecordInput
} from "./operation-audit-log";
import type { Clock, IdGenerator } from "@deliberum/core";

export const SQLITE_OPERATION_AUDIT_LOG_SCHEMA_VERSION = 1 as const;

export class SQLiteOperationAuditLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLiteOperationAuditLogError";
  }
}

export type SQLiteOperationAuditLogOptions = {
  filePath: string;
  idGenerator?: IdGenerator;
  clock?: Clock;
  maxEntries?: number;
  timeoutMs?: number;
};

type SQLiteDatabase = ReturnType<typeof Database>;

type OperationAuditRow = {
  event_json: string;
};

const OPERATION_AUDIT_SCHEMA_KEY = "sqlite_operation_audit_log_schema_version";
const DEFAULT_SQLITE_TIMEOUT_MS = 5000;

export class SQLiteOperationAuditLog implements OperationAuditLog {
  private readonly database: SQLiteDatabase;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly maxEntries?: number;

  constructor(options: SQLiteOperationAuditLogOptions) {
    if (options.filePath !== ":memory:") {
      mkdirSync(dirname(options.filePath), { recursive: true });
    }

    this.database = new Database(options.filePath, {
      timeout: normalizeTimeoutMs(options.timeoutMs)
    });
    this.idGenerator = options.idGenerator ?? createDefaultAuditIdGenerator();
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.maxEntries = normalizeOperationAuditMaxEntries(options.maxEntries);
    configureSQLiteConnection(this.database, options.filePath, options.timeoutMs);
    this.initialize();
  }

  record(input: OperationAuditRecordInput): OperationAuditEntry {
    const parsed = parseOperationAuditRecordInput(input, {
      idGenerator: this.idGenerator,
      clock: this.clock
    });

    try {
      this.database
        .prepare<[string, string, string, string, string, number, string]>(
          [
            "INSERT INTO deliberum_operation_audit_events",
            "(id, recorded_at, action, method, route, status_code, event_json)",
            "VALUES (?, ?, ?, ?, ?, ?, ?)"
          ].join(" ")
        )
        .run(
          parsed.id,
          parsed.recordedAt,
          parsed.action,
          parsed.method,
          parsed.route,
          parsed.statusCode,
          JSON.stringify(parsed)
        );
      this.prune();
    } catch (error) {
      throw mapSQLiteOperationAuditLogError(error);
    }

    return structuredClone(parsed);
  }

  list(options: OperationAuditListOptions = {}): OperationAuditEntry[] {
    const limit = parseOperationAuditLimit(
      options.limit === undefined ? undefined : String(options.limit)
    );

    return this.database
      .prepare<[number], OperationAuditRow>(
        [
          "SELECT event_json FROM (",
          "SELECT recorded_at, id, event_json",
          "FROM deliberum_operation_audit_events",
          "ORDER BY recorded_at DESC, id DESC",
          "LIMIT ?",
          ") ORDER BY recorded_at ASC, id ASC"
        ].join(" ")
      )
      .all(limit)
      .map((row) => parseStoredAuditEntry(row.event_json));
  }

  close(): void {
    this.database.close();
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS deliberum_store_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deliberum_operation_audit_events (
        id TEXT PRIMARY KEY,
        recorded_at TEXT NOT NULL,
        action TEXT NOT NULL,
        method TEXT NOT NULL,
        route TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        event_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS deliberum_operation_audit_recorded_at_idx
        ON deliberum_operation_audit_events(recorded_at, id);
      CREATE INDEX IF NOT EXISTS deliberum_operation_audit_action_idx
        ON deliberum_operation_audit_events(action);
      CREATE INDEX IF NOT EXISTS deliberum_operation_audit_route_idx
        ON deliberum_operation_audit_events(route);
    `);

    this.ensureSchemaVersion();
  }

  private ensureSchemaVersion(): void {
    const existing = this.database
      .prepare<[string], { value: string }>(
        "SELECT value FROM deliberum_store_metadata WHERE key = ?"
      )
      .get(OPERATION_AUDIT_SCHEMA_KEY);

    if (existing) {
      if (existing.value !== String(SQLITE_OPERATION_AUDIT_LOG_SCHEMA_VERSION)) {
        throw new SQLiteOperationAuditLogError(
          `Unsupported SQLite operation audit log schemaVersion: ${existing.value}`
        );
      }

      return;
    }

    this.database
      .prepare<[string, string]>(
        "INSERT INTO deliberum_store_metadata (key, value) VALUES (?, ?)"
      )
      .run(OPERATION_AUDIT_SCHEMA_KEY, String(SQLITE_OPERATION_AUDIT_LOG_SCHEMA_VERSION));

    this.database
      .prepare<[string, string]>(
        "INSERT OR IGNORE INTO deliberum_store_metadata (key, value) VALUES (?, ?)"
      )
      .run(
        "operation_audit_log_entry_schema_version",
        String(OPERATION_AUDIT_LOG_SCHEMA_VERSION)
      );
  }

  private prune(): void {
    if (this.maxEntries === undefined) {
      return;
    }

    this.database
      .prepare<[number]>(
        [
          "DELETE FROM deliberum_operation_audit_events",
          "WHERE id NOT IN (",
          "SELECT id FROM deliberum_operation_audit_events",
          "ORDER BY recorded_at DESC, id DESC",
          "LIMIT ?",
          ")"
        ].join(" ")
      )
      .run(this.maxEntries);
  }
}

function parseStoredAuditEntry(eventJson: string): OperationAuditEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventJson);
  } catch (error) {
    throw new SQLiteOperationAuditLogError(
      `Unable to parse SQLite operation audit record: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return parseOperationAuditEntry(parsed);
}

function configureSQLiteConnection(
  database: SQLiteDatabase,
  filePath: string,
  timeoutMs?: number
): void {
  database.pragma(`busy_timeout = ${normalizeTimeoutMs(timeoutMs)}`);
  database.pragma("foreign_keys = ON");

  if (filePath !== ":memory:") {
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = NORMAL");
  }
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  const value = timeoutMs ?? DEFAULT_SQLITE_TIMEOUT_MS;

  if (!Number.isFinite(value) || value < 0) {
    throw new SQLiteOperationAuditLogError(
      "SQLite operation audit log timeoutMs must be a non-negative finite number."
    );
  }

  return Math.trunc(value);
}

function mapSQLiteOperationAuditLogError(error: unknown): unknown {
  if (
    error instanceof SQLiteOperationAuditLogError ||
    error instanceof OperationAuditLogError
  ) {
    return error;
  }

  if (error instanceof Database.SqliteError && error.code === "SQLITE_BUSY") {
    return new SQLiteOperationAuditLogError(
      "SQLite operation audit log is busy while another writer holds the database lock."
    );
  }

  return error;
}

function createDefaultAuditIdGenerator(): IdGenerator {
  return () => randomUUID();
}
