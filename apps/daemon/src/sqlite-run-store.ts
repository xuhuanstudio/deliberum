import {
  DeliberationRunRecordSchema,
  RunStoreConflictError,
  RunStoreNotFoundError,
  RunStoreUpdateError,
  type DeliberationRunRecord,
  type RunStore
} from "@deliberum/orchestrator";
import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export const SQLITE_RUN_STORE_SCHEMA_VERSION = 1 as const;

export class SQLiteRunStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLiteRunStoreError";
  }
}

export type SQLiteRunStoreOptions = {
  filePath: string;
  timeoutMs?: number;
};

type SQLiteDatabase = ReturnType<typeof Database>;

type RunRow = {
  run_json: string;
};

const RUN_STORE_SCHEMA_KEY = "sqlite_run_store_schema_version";
const DEFAULT_SQLITE_TIMEOUT_MS = 5000;

export class SQLiteRunStore implements RunStore {
  private readonly database: SQLiteDatabase;

  constructor(options: SQLiteRunStoreOptions) {
    if (options.filePath !== ":memory:") {
      mkdirSync(dirname(options.filePath), { recursive: true });
    }

    this.database = new Database(options.filePath, {
      timeout: normalizeTimeoutMs(options.timeoutMs)
    });
    configureSQLiteConnection(this.database, options.filePath, options.timeoutMs);
    this.initialize();
  }

  createRun(input: DeliberationRunRecord): DeliberationRunRecord {
    const create = this.database.transaction((runInput: DeliberationRunRecord) => {
      const parsed = DeliberationRunRecordSchema.parse(runInput);

      if (this.getRunInTransaction(parsed.id)) {
        throw new RunStoreConflictError(parsed.id);
      }

      if (this.getRunBySessionIdInTransaction(parsed.sessionId)) {
        throw new SQLiteRunStoreError(
          `Duplicate run session id in SQLite run store: ${parsed.sessionId}`
        );
      }

      this.insertRun(parsed);

      return cloneRun(parsed);
    });

    try {
      return create.immediate(input);
    } catch (error) {
      throw mapSQLiteRunStoreError(error);
    }
  }

  updateRun(
    runId: string,
    update: (run: DeliberationRunRecord) => DeliberationRunRecord
  ): DeliberationRunRecord {
    const updateTransaction = this.database.transaction((targetRunId: string) => {
      const existing = this.getRunInTransaction(targetRunId);

      if (!existing) {
        throw new RunStoreNotFoundError(targetRunId);
      }

      const updated = DeliberationRunRecordSchema.parse(update(cloneRun(existing)));

      if (updated.id !== targetRunId) {
        throw new RunStoreUpdateError("Run updates must preserve the run id.");
      }

      if (updated.sessionId !== existing.sessionId) {
        throw new RunStoreUpdateError("Run updates must preserve the run session id.");
      }

      this.database
        .prepare<[string, string, string, string]>(
          [
            "UPDATE deliberum_runs",
            "SET updated_at = ?, session_id = ?, run_json = ?",
            "WHERE id = ?"
          ].join(" ")
        )
        .run(updated.updatedAt, updated.sessionId, JSON.stringify(updated), targetRunId);

      return cloneRun(updated);
    });

    try {
      return updateTransaction.immediate(runId);
    } catch (error) {
      throw mapSQLiteRunStoreError(error);
    }
  }

  getRun(runId: string): DeliberationRunRecord | undefined {
    return this.getRunInTransaction(runId);
  }

  listRuns(): DeliberationRunRecord[] {
    return this.database
      .prepare<[], RunRow>(
        "SELECT run_json FROM deliberum_runs ORDER BY created_at ASC, id ASC"
      )
      .all()
      .map((row) => this.parseStoredRun(row.run_json));
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

      CREATE TABLE IF NOT EXISTS deliberum_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        run_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS deliberum_runs_created_at_idx
        ON deliberum_runs(created_at, id);
      CREATE INDEX IF NOT EXISTS deliberum_runs_session_id_idx
        ON deliberum_runs(session_id);
    `);

    this.ensureSchemaVersion();
  }

  private ensureSchemaVersion(): void {
    const existing = this.database
      .prepare<[string], { value: string }>(
        "SELECT value FROM deliberum_store_metadata WHERE key = ?"
      )
      .get(RUN_STORE_SCHEMA_KEY);

    if (existing) {
      if (existing.value !== String(SQLITE_RUN_STORE_SCHEMA_VERSION)) {
        throw new SQLiteRunStoreError(
          `Unsupported SQLite run store schemaVersion: ${existing.value}`
        );
      }

      return;
    }

    this.database
      .prepare<[string, string]>(
        "INSERT INTO deliberum_store_metadata (key, value) VALUES (?, ?)"
      )
      .run(RUN_STORE_SCHEMA_KEY, String(SQLITE_RUN_STORE_SCHEMA_VERSION));
  }

  private getRunInTransaction(runId: string): DeliberationRunRecord | undefined {
    const row = this.database
      .prepare<[string], RunRow>("SELECT run_json FROM deliberum_runs WHERE id = ?")
      .get(runId);

    return row ? this.parseStoredRun(row.run_json) : undefined;
  }

  private getRunBySessionIdInTransaction(
    sessionId: string
  ): DeliberationRunRecord | undefined {
    const row = this.database
      .prepare<[string], RunRow>(
        "SELECT run_json FROM deliberum_runs WHERE session_id = ?"
      )
      .get(sessionId);

    return row ? this.parseStoredRun(row.run_json) : undefined;
  }

  private insertRun(run: DeliberationRunRecord): void {
    this.database
      .prepare<[string, string, string, string, string]>(
        [
          "INSERT INTO deliberum_runs",
          "(id, session_id, created_at, updated_at, run_json)",
          "VALUES (?, ?, ?, ?, ?)"
        ].join(" ")
      )
      .run(run.id, run.sessionId, run.createdAt, run.updatedAt, JSON.stringify(run));
  }

  private parseStoredRun(runJson: string): DeliberationRunRecord {
    let parsed: unknown;
    try {
      parsed = JSON.parse(runJson);
    } catch (error) {
      throw new SQLiteRunStoreError(
        `Unable to parse SQLite run record: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const run = DeliberationRunRecordSchema.safeParse(parsed);
    if (!run.success) {
      throw new SQLiteRunStoreError(run.error.message);
    }

    return cloneRun(run.data);
  }
}

function cloneRun(run: DeliberationRunRecord): DeliberationRunRecord {
  return structuredClone(run);
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
    throw new SQLiteRunStoreError("SQLite timeoutMs must be a non-negative finite number.");
  }

  return Math.trunc(value);
}

function mapSQLiteRunStoreError(error: unknown): unknown {
  if (
    error instanceof SQLiteRunStoreError ||
    error instanceof RunStoreConflictError ||
    error instanceof RunStoreNotFoundError ||
    error instanceof RunStoreUpdateError
  ) {
    return error;
  }

  if (error instanceof Database.SqliteError && error.code === "SQLITE_BUSY") {
    return new SQLiteRunStoreError(
      "SQLite run store is busy while another writer holds the database lock."
    );
  }

  return error;
}
