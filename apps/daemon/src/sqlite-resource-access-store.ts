import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  RESOURCE_ACCESS_DEFAULT_TTL_MS,
  ResourceAccessError,
  createResourceAccessGrantRecord,
  createResourceAccessTokenHash,
  parseResourceAccessGrantRecord,
  parseResourceAccessId,
  parseResourceAccessTtlMs,
  type ResourceAccessClock,
  type ResourceAccessGrant,
  type ResourceAccessGrantCreated,
  type ResourceAccessGrantInput,
  type ResourceAccessGrantSafeView,
  type ResourceAccessGrantStoreLike,
  type ResourceAccessTokenGenerator
} from "./resource-access-store";
import { toResourceAccessSafeView } from "./resource-access-store";

export const SQLITE_RESOURCE_ACCESS_STORE_SCHEMA_VERSION = 1 as const;

export class SQLiteResourceAccessGrantStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLiteResourceAccessGrantStoreError";
  }
}

export type SQLiteResourceAccessGrantStoreOptions = {
  filePath: string;
  clock?: ResourceAccessClock;
  tokenGenerator?: ResourceAccessTokenGenerator;
  defaultTtlMs?: number;
  timeoutMs?: number;
};

type SQLiteDatabase = ReturnType<typeof Database>;

type GrantRow = {
  grant_json: string;
};

const RESOURCE_ACCESS_STORE_SCHEMA_KEY =
  "sqlite_resource_access_store_schema_version";
const DEFAULT_SQLITE_TIMEOUT_MS = 5000;

export class SQLiteResourceAccessGrantStore implements ResourceAccessGrantStoreLike {
  private readonly database: SQLiteDatabase;
  private readonly clock: ResourceAccessClock;
  private readonly tokenGenerator: ResourceAccessTokenGenerator;
  private readonly defaultTtlMs: number;

  constructor(options: SQLiteResourceAccessGrantStoreOptions) {
    this.clock = options.clock ?? (() => Date.now());
    this.tokenGenerator = options.tokenGenerator ?? createDefaultToken;
    this.defaultTtlMs = parseResourceAccessTtlMs(
      options.defaultTtlMs ?? RESOURCE_ACCESS_DEFAULT_TTL_MS,
      "defaultTtlMs"
    );

    if (options.filePath !== ":memory:") {
      mkdirSync(dirname(options.filePath), { recursive: true });
    }

    this.database = new Database(options.filePath, {
      timeout: normalizeTimeoutMs(options.timeoutMs)
    });
    configureSQLiteConnection(this.database, options.filePath, options.timeoutMs);
    this.initialize();
  }

  createGrant(input: ResourceAccessGrantInput): ResourceAccessGrantCreated {
    const create = this.database.transaction((grantInput: ResourceAccessGrantInput) => {
      const now = this.clock();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const accessId = parseResourceAccessId(this.tokenGenerator());
        const tokenHash = createResourceAccessTokenHash(accessId);

        if (this.findGrantByTokenHashInTransaction(tokenHash)) {
          continue;
        }

        const grant = createResourceAccessGrantRecord(grantInput, {
          accessId,
          now,
          defaultTtlMs: this.defaultTtlMs
        });

        if (this.findGrantByResourceAccessIdInTransaction(grant.resourceAccessId)) {
          throw new ResourceAccessError(
            "resource_access_grant_conflict",
            "Resource access grant id already exists."
          );
        }

        this.insertGrant(grant);

        return {
          accessId,
          grant: cloneGrant(grant)
        };
      }

      throw new ResourceAccessError(
        "resource_access_token_unavailable",
        "Resource access token could not be generated."
      );
    });

    try {
      return create.immediate(input);
    } catch (error) {
      throw mapSQLiteResourceAccessStoreError(error);
    }
  }

  recordAccess(accessId: string): ResourceAccessGrant {
    const record = this.database.transaction((rawAccessId: string) => {
      const grant = this.getGrantByAccessIdInTransaction(rawAccessId);
      const now = this.clock();

      if (grant.revokedAt !== undefined) {
        return {
          error: new ResourceAccessError(
            "resource_access_revoked",
            "Resource access grant has been revoked."
          )
        };
      }

      if (grant.expiresAt <= now) {
        this.deleteGrant(grant.tokenHash);
        return {
          error: new ResourceAccessError(
            "resource_access_expired",
            "Resource access grant is expired."
          )
        };
      }

      const updated = {
        ...grant,
        accessCount: grant.accessCount + 1,
        lastAccessedAt: now
      } satisfies ResourceAccessGrant;

      this.updateGrant(updated);

      return {
        grant: cloneGrant(updated)
      };
    });

    try {
      const result = record.immediate(accessId);

      if ("error" in result) {
        throw result.error;
      }

      return result.grant;
    } catch (error) {
      throw mapSQLiteResourceAccessStoreError(error);
    }
  }

  revokeGrant(accessId: string): ResourceAccessGrant {
    const revoke = this.database.transaction((rawAccessId: string) => {
      const grant = this.getGrantByAccessIdInTransaction(rawAccessId);

      if (grant.revokedAt !== undefined) {
        return cloneGrant(grant);
      }

      const updated = {
        ...grant,
        revokedAt: this.clock()
      } satisfies ResourceAccessGrant;

      this.updateGrant(updated);

      return cloneGrant(updated);
    });

    try {
      return revoke.immediate(accessId);
    } catch (error) {
      throw mapSQLiteResourceAccessStoreError(error);
    }
  }

  getSafeView(accessId: string): ResourceAccessGrantSafeView {
    try {
      return toResourceAccessSafeView(this.getGrantByAccessIdInTransaction(accessId));
    } catch (error) {
      throw mapSQLiteResourceAccessStoreError(error);
    }
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

      CREATE TABLE IF NOT EXISTS deliberum_resource_access_grants (
        token_hash TEXT PRIMARY KEY,
        resource_access_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        exposure TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        grant_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS deliberum_resource_access_session_idx
        ON deliberum_resource_access_grants(session_id, resource_id);
      CREATE INDEX IF NOT EXISTS deliberum_resource_access_expiry_idx
        ON deliberum_resource_access_grants(expires_at);
    `);

    this.ensureSchemaVersion();
  }

  private ensureSchemaVersion(): void {
    const existing = this.database
      .prepare<[string], { value: string }>(
        "SELECT value FROM deliberum_store_metadata WHERE key = ?"
      )
      .get(RESOURCE_ACCESS_STORE_SCHEMA_KEY);

    if (existing) {
      if (existing.value !== String(SQLITE_RESOURCE_ACCESS_STORE_SCHEMA_VERSION)) {
        throw new SQLiteResourceAccessGrantStoreError(
          `Unsupported SQLite resource access store schemaVersion: ${existing.value}`
        );
      }

      return;
    }

    this.database
      .prepare<[string, string]>(
        "INSERT INTO deliberum_store_metadata (key, value) VALUES (?, ?)"
      )
      .run(
        RESOURCE_ACCESS_STORE_SCHEMA_KEY,
        String(SQLITE_RESOURCE_ACCESS_STORE_SCHEMA_VERSION)
      );
  }

  private getGrantByAccessIdInTransaction(accessId: string): ResourceAccessGrant {
    const tokenHash = createResourceAccessTokenHash(accessId);
    const grant = this.findGrantByTokenHashInTransaction(tokenHash);

    if (!grant) {
      throw new ResourceAccessError(
        "resource_access_not_found",
        "Resource access grant was not found."
      );
    }

    return grant;
  }

  private findGrantByTokenHashInTransaction(
    tokenHash: string
  ): ResourceAccessGrant | undefined {
    const row = this.database
      .prepare<[string], GrantRow>(
        "SELECT grant_json FROM deliberum_resource_access_grants WHERE token_hash = ?"
      )
      .get(tokenHash);

    return row ? this.parseStoredGrant(row.grant_json) : undefined;
  }

  private findGrantByResourceAccessIdInTransaction(
    resourceAccessId: string
  ): ResourceAccessGrant | undefined {
    const row = this.database
      .prepare<[string], GrantRow>(
        [
          "SELECT grant_json FROM deliberum_resource_access_grants",
          "WHERE resource_access_id = ?"
        ].join(" ")
      )
      .get(resourceAccessId);

    return row ? this.parseStoredGrant(row.grant_json) : undefined;
  }

  private insertGrant(grant: ResourceAccessGrant): void {
    this.database
      .prepare<
        [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          number | null,
          string
        ]
      >(
        [
          "INSERT INTO deliberum_resource_access_grants",
          "(",
          "token_hash, resource_access_id, session_id, resource_id, participant_id,",
          "mode, exposure, created_at, expires_at, revoked_at, grant_json",
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ].join(" ")
      )
      .run(
        grant.tokenHash,
        grant.resourceAccessId,
        grant.sessionId,
        grant.resourceId,
        grant.participantId,
        grant.mode,
        grant.exposure,
        grant.createdAt,
        grant.expiresAt,
        grant.revokedAt ?? null,
        JSON.stringify(grant)
      );
  }

  private updateGrant(grant: ResourceAccessGrant): void {
    this.database
      .prepare<[number, number | null, string, string]>(
        [
          "UPDATE deliberum_resource_access_grants",
          "SET expires_at = ?, revoked_at = ?, grant_json = ?",
          "WHERE token_hash = ?"
        ].join(" ")
      )
      .run(
        grant.expiresAt,
        grant.revokedAt ?? null,
        JSON.stringify(grant),
        grant.tokenHash
      );
  }

  private deleteGrant(tokenHash: string): void {
    this.database
      .prepare<[string]>(
        "DELETE FROM deliberum_resource_access_grants WHERE token_hash = ?"
      )
      .run(tokenHash);
  }

  private parseStoredGrant(grantJson: string): ResourceAccessGrant {
    let parsed: unknown;
    try {
      parsed = JSON.parse(grantJson);
    } catch (error) {
      throw new SQLiteResourceAccessGrantStoreError(
        `Unable to parse SQLite resource access grant: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    try {
      return parseResourceAccessGrantRecord(parsed);
    } catch (error) {
      if (error instanceof ResourceAccessError) {
        throw new SQLiteResourceAccessGrantStoreError(error.message);
      }

      throw error;
    }
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
    throw new SQLiteResourceAccessGrantStoreError(
      "SQLite timeoutMs must be a non-negative finite number."
    );
  }

  return Math.trunc(value);
}

function mapSQLiteResourceAccessStoreError(error: unknown): unknown {
  if (
    error instanceof SQLiteResourceAccessGrantStoreError ||
    error instanceof ResourceAccessError
  ) {
    return error;
  }

  if (error instanceof Database.SqliteError && error.code === "SQLITE_BUSY") {
    return new SQLiteResourceAccessGrantStoreError(
      "SQLite resource access store is busy while another writer holds the database lock."
    );
  }

  return error;
}

function cloneGrant(grant: ResourceAccessGrant): ResourceAccessGrant {
  return structuredClone(grant);
}

function createDefaultToken(): string {
  return randomBytes(32).toString("base64url");
}
