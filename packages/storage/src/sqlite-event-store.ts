import {
  EventEnvelopeSchema,
  type EventEnvelope,
  type EventVisibility
} from "@deliberum/protocol";
import Database from "better-sqlite3";
import type {
  AppendEventInput,
  AppendEventResult,
  EventStore
} from "./event-store";
import { isCompatibleIdempotentEventInput } from "./idempotency";
import { cloneAndFreezeEvent, type StoredEvent } from "./immutable";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export const SQLITE_EVENT_STORE_SCHEMA_VERSION = 1 as const;

export class SQLiteEventStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLiteEventStoreError";
  }
}

export type SQLiteEventStoreOptions = {
  filePath: string;
  clock?: () => string;
  timeoutMs?: number;
};

type SQLiteDatabase = ReturnType<typeof Database>;

type EventRow = {
  event_json: string;
};

type SessionIdRow = {
  session_id: string;
};

type SequenceRow = {
  next_sequence: number | null;
};

const EVENT_STORE_SCHEMA_KEY = "sqlite_event_store_schema_version";
const DEFAULT_SQLITE_TIMEOUT_MS = 5000;

export class SQLiteEventStore implements EventStore {
  private readonly database: SQLiteDatabase;
  private readonly clock: () => string;

  constructor(options: SQLiteEventStoreOptions) {
    this.clock = options.clock ?? (() => new Date().toISOString());

    if (options.filePath !== ":memory:") {
      mkdirSync(dirname(options.filePath), { recursive: true });
    }

    this.database = new Database(options.filePath, {
      timeout: normalizeTimeoutMs(options.timeoutMs)
    });
    configureSQLiteConnection(this.database, options.filePath, options.timeoutMs);
    this.initialize();
  }

  appendEvent<TPayload = unknown>(input: AppendEventInput<TPayload>): StoredEvent<TPayload> {
    return this.appendEventResult(input).event;
  }

  appendEventResult<TPayload = unknown>(
    input: AppendEventInput<TPayload>
  ): AppendEventResult<TPayload> {
    const append = this.database.transaction((eventInput: AppendEventInput<TPayload>) =>
      this.appendEventInTransaction(eventInput)
    );

    try {
      return append.immediate(input);
    } catch (error) {
      throw mapSQLiteEventStoreError(error);
    }
  }

  appendEvents<TPayload = unknown>(inputs: AppendEventInput<TPayload>[]): StoredEvent<TPayload>[] {
    return inputs.map((input) => this.appendEvent(input));
  }

  getEvent<TPayload = unknown>(eventId: string): StoredEvent<TPayload> | undefined {
    const row = this.database
      .prepare<[string], EventRow>(
        "SELECT event_json FROM deliberum_events WHERE id = ?"
      )
      .get(eventId);

    return row ? this.parseStoredEvent<TPayload>(row.event_json) : undefined;
  }

  listSessionIds(): string[] {
    return this.database
      .prepare<[], SessionIdRow>(
        "SELECT DISTINCT session_id FROM deliberum_events ORDER BY session_id ASC"
      )
      .all()
      .map((row) => row.session_id);
  }

  listEvents(sessionId: string): StoredEvent[] {
    return this.listEventsForQuery(
      "SELECT event_json FROM deliberum_events WHERE session_id = ? ORDER BY sequence ASC",
      [sessionId]
    );
  }

  listEventsByRange(sessionId: string, fromSequence: number, toSequence: number): StoredEvent[] {
    if (!Number.isInteger(fromSequence) || !Number.isInteger(toSequence)) {
      throw new SQLiteEventStoreError("Sequence range bounds must be integers.");
    }

    if (fromSequence < 0 || toSequence < 0 || fromSequence > toSequence) {
      throw new SQLiteEventStoreError("Sequence range is invalid.");
    }

    return this.listEventsForQuery(
      [
        "SELECT event_json FROM deliberum_events",
        "WHERE session_id = ? AND sequence >= ? AND sequence <= ?",
        "ORDER BY sequence ASC"
      ].join(" "),
      [sessionId, fromSequence, toSequence]
    );
  }

  listEventsByType(sessionId: string, type: string): StoredEvent[] {
    return this.listEventsForQuery(
      [
        "SELECT event_json FROM deliberum_events",
        "WHERE session_id = ? AND type = ?",
        "ORDER BY sequence ASC"
      ].join(" "),
      [sessionId, type]
    );
  }

  listEventsByBatch(sessionId: string, batchId: string): StoredEvent[] {
    return this.listEventsForQuery(
      [
        "SELECT event_json FROM deliberum_events",
        "WHERE session_id = ? AND batch_id = ?",
        "ORDER BY sequence ASC"
      ].join(" "),
      [sessionId, batchId]
    );
  }

  listEventsByVisibility(sessionId: string, visibility: EventVisibility): StoredEvent[] {
    return this.listEventsForQuery(
      [
        "SELECT event_json FROM deliberum_events",
        "WHERE session_id = ? AND visibility = ?",
        "ORDER BY sequence ASC"
      ].join(" "),
      [sessionId, visibility]
    );
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

      CREATE TABLE IF NOT EXISTS deliberum_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        batch_id TEXT,
        author_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        visibility TEXT NOT NULL,
        idempotency_key TEXT,
        event_json TEXT NOT NULL,
        UNIQUE(session_id, sequence),
        UNIQUE(session_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS deliberum_events_session_sequence_idx
        ON deliberum_events(session_id, sequence);
      CREATE INDEX IF NOT EXISTS deliberum_events_session_type_idx
        ON deliberum_events(session_id, type, sequence);
      CREATE INDEX IF NOT EXISTS deliberum_events_session_batch_idx
        ON deliberum_events(session_id, batch_id, sequence);
      CREATE INDEX IF NOT EXISTS deliberum_events_session_visibility_idx
        ON deliberum_events(session_id, visibility, sequence);
    `);

    this.ensureSchemaVersion();
  }

  private ensureSchemaVersion(): void {
    const existing = this.database
      .prepare<[string], { value: string }>(
        "SELECT value FROM deliberum_store_metadata WHERE key = ?"
      )
      .get(EVENT_STORE_SCHEMA_KEY);

    if (existing) {
      if (existing.value !== String(SQLITE_EVENT_STORE_SCHEMA_VERSION)) {
        throw new SQLiteEventStoreError(
          `Unsupported SQLite event store schemaVersion: ${existing.value}`
        );
      }

      return;
    }

    this.database
      .prepare<[string, string]>(
        "INSERT INTO deliberum_store_metadata (key, value) VALUES (?, ?)"
      )
      .run(EVENT_STORE_SCHEMA_KEY, String(SQLITE_EVENT_STORE_SCHEMA_VERSION));
  }

  private appendEventInTransaction<TPayload = unknown>(
    input: AppendEventInput<TPayload>
  ): AppendEventResult<TPayload> {
    this.rejectStoreAssignedFields(input);

    if (input.idempotencyKey) {
      const existing = this.findEventByIdempotencyKey(input.sessionId, input.idempotencyKey);
      if (existing) {
        if (!isCompatibleIdempotentEventInput(existing, input)) {
          throw new SQLiteEventStoreError(
            "Idempotency key was reused for a different event input."
          );
        }

        return {
          event: cloneAndFreezeEvent(existing as EventEnvelope<TPayload>),
          appended: false
        };
      }
    }

    if (this.getStoredEvent(input.id)) {
      throw new SQLiteEventStoreError(`Duplicate event id: ${input.id}`);
    }

    const sequence = this.nextSequence(input.sessionId);
    const event = {
      ...input,
      sequence,
      recordedAt: this.clock()
    } satisfies EventEnvelope<TPayload>;
    const parsedEvent = EventEnvelopeSchema.parse(event) as EventEnvelope<TPayload>;

    this.insertEvent(parsedEvent);

    return {
      event: cloneAndFreezeEvent(parsedEvent),
      appended: true
    };
  }

  private findEventByIdempotencyKey(
    sessionId: string,
    idempotencyKey: string
  ): EventEnvelope | undefined {
    const row = this.database
      .prepare<[string, string], EventRow>(
        [
          "SELECT event_json FROM deliberum_events",
          "WHERE session_id = ? AND idempotency_key = ?"
        ].join(" ")
      )
      .get(sessionId, idempotencyKey);

    return row ? this.parseEventEnvelope(row.event_json) : undefined;
  }

  private getStoredEvent(eventId: string): EventEnvelope | undefined {
    const row = this.database
      .prepare<[string], EventRow>(
        "SELECT event_json FROM deliberum_events WHERE id = ?"
      )
      .get(eventId);

    return row ? this.parseEventEnvelope(row.event_json) : undefined;
  }

  private nextSequence(sessionId: string): number {
    const row = this.database
      .prepare<[string], SequenceRow>(
        "SELECT MAX(sequence) + 1 AS next_sequence FROM deliberum_events WHERE session_id = ?"
      )
      .get(sessionId);

    return row?.next_sequence ?? 0;
  }

  private insertEvent(event: EventEnvelope): void {
    this.database
      .prepare<
        [
          string,
          string,
          number,
          string,
          string | null,
          string,
          string,
          string,
          string,
          string | null,
          string
        ]
      >(
        [
          "INSERT INTO deliberum_events",
          "(",
          "id, session_id, sequence, type, batch_id, author_id, created_at,",
          "recorded_at, visibility, idempotency_key, event_json",
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ].join(" ")
      )
      .run(
        event.id,
        event.sessionId,
        event.sequence,
        event.type,
        event.batchId ?? null,
        event.authorId,
        event.createdAt,
        event.recordedAt,
        event.visibility,
        event.idempotencyKey ?? null,
        JSON.stringify(event)
      );
  }

  private rejectStoreAssignedFields(input: unknown): void {
    if (typeof input !== "object" || input === null) {
      throw new SQLiteEventStoreError("Event input must be an object.");
    }

    if ("sequence" in input) {
      throw new SQLiteEventStoreError("Event sequence is assigned by the store.");
    }

    if ("recordedAt" in input) {
      throw new SQLiteEventStoreError("Event recordedAt is assigned by the store.");
    }
  }

  private listEventsForQuery(sql: string, parameters: unknown[]): StoredEvent[] {
    const rows = this.database.prepare<unknown[], EventRow>(sql).all(...parameters);

    return rows.map((row) => this.parseStoredEvent(row.event_json));
  }

  private parseStoredEvent<TPayload = unknown>(eventJson: string): StoredEvent<TPayload> {
    return cloneAndFreezeEvent(this.parseEventEnvelope(eventJson) as EventEnvelope<TPayload>);
  }

  private parseEventEnvelope(eventJson: string): EventEnvelope {
    let parsed: unknown;
    try {
      parsed = JSON.parse(eventJson);
    } catch (error) {
      throw new SQLiteEventStoreError(
        `Unable to parse SQLite event payload: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const event = EventEnvelopeSchema.safeParse(parsed);
    if (!event.success) {
      throw new SQLiteEventStoreError(event.error.message);
    }

    return event.data;
  }
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
    throw new SQLiteEventStoreError("SQLite timeoutMs must be a non-negative finite number.");
  }

  return Math.trunc(value);
}

function mapSQLiteEventStoreError(error: unknown): unknown {
  if (error instanceof SQLiteEventStoreError) {
    return error;
  }

  if (error instanceof Database.SqliteError && error.code === "SQLITE_BUSY") {
    return new SQLiteEventStoreError(
      "SQLite event store is busy while another writer holds the database lock."
    );
  }

  return error;
}
