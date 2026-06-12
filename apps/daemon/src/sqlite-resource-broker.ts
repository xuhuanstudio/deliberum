import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ResourceSchema, type Resource } from "@deliberum/protocol";
import {
  InvalidResourceRegistrationError,
  ResourceAlreadyRegisteredError,
  isBase64Variant,
  type InMemoryResourceContent,
  type ResourceBroker,
  type ResourceRegistration
} from "@deliberum/resources";

export const SQLITE_RESOURCE_BROKER_SCHEMA_VERSION = 1 as const;

export class SQLiteResourceBrokerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLiteResourceBrokerError";
  }
}

export type SQLiteResourceBrokerOptions = {
  filePath: string;
  timeoutMs?: number;
};

type SQLiteDatabase = ReturnType<typeof Database>;

type ResourceRow = {
  resource_json: string;
};

type ContentRow = {
  base64: string;
};

const RESOURCE_BROKER_SCHEMA_KEY = "sqlite_resource_broker_schema_version";
const DEFAULT_SQLITE_TIMEOUT_MS = 5000;

export class SQLiteResourceBroker implements ResourceBroker {
  private readonly database: SQLiteDatabase;

  constructor(options: SQLiteResourceBrokerOptions) {
    if (options.filePath !== ":memory:") {
      mkdirSync(dirname(options.filePath), { recursive: true });
    }

    this.database = new Database(options.filePath, {
      timeout: normalizeTimeoutMs(options.timeoutMs)
    });
    configureSQLiteConnection(this.database, options.filePath, options.timeoutMs);
    this.initialize();
  }

  registerResource(registration: ResourceRegistration): Resource {
    const register = this.database.transaction((input: ResourceRegistration) => {
      const resource = parseResource(input.resource);
      const contents = input.contents ?? [];

      if (this.resourceExistsInTransaction(resource.id)) {
        throw new ResourceAlreadyRegisteredError(resource.id);
      }

      validateContentRegistration(resource, contents);
      this.assertNoExistingContentRefsInTransaction(contents);

      this.database
        .prepare<[string, string]>(
          [
            "INSERT INTO deliberum_resource_broker_resources",
            "(resource_id, resource_json) VALUES (?, ?)"
          ].join(" ")
        )
        .run(resource.id, JSON.stringify(resource));

      const insertContent = this.database.prepare<[string, string, string]>(
        [
          "INSERT INTO deliberum_resource_broker_contents",
          "(data_ref, resource_id, base64) VALUES (?, ?, ?)"
        ].join(" ")
      );

      for (const content of contents) {
        insertContent.run(content.dataRef, resource.id, content.base64);
      }

      return cloneResource(resource);
    });

    try {
      return register.immediate(registration);
    } catch (error) {
      throw mapSQLiteResourceBrokerError(error);
    }
  }

  getResource(resourceId: string): Resource | undefined {
    const row = this.database
      .prepare<[string], ResourceRow>(
        "SELECT resource_json FROM deliberum_resource_broker_resources WHERE resource_id = ?"
      )
      .get(resourceId);

    return row ? this.parseStoredResource(row.resource_json) : undefined;
  }

  listResources(): Resource[] {
    const rows = this.database
      .prepare<[], ResourceRow>(
        [
          "SELECT resource_json FROM deliberum_resource_broker_resources",
          "ORDER BY resource_id ASC"
        ].join(" ")
      )
      .all();

    return rows.map((row) => this.parseStoredResource(row.resource_json));
  }

  getExplicitInMemoryContent(dataRef: string): string | undefined {
    const row = this.database
      .prepare<[string], ContentRow>(
        "SELECT base64 FROM deliberum_resource_broker_contents WHERE data_ref = ?"
      )
      .get(dataRef);

    return row?.base64;
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

      CREATE TABLE IF NOT EXISTS deliberum_resource_broker_resources (
        resource_id TEXT PRIMARY KEY,
        resource_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deliberum_resource_broker_contents (
        data_ref TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        base64 TEXT NOT NULL,
        FOREIGN KEY(resource_id)
          REFERENCES deliberum_resource_broker_resources(resource_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS deliberum_resource_broker_content_resource_idx
        ON deliberum_resource_broker_contents(resource_id);
    `);

    this.ensureSchemaVersion();
  }

  private ensureSchemaVersion(): void {
    const existing = this.database
      .prepare<[string], { value: string }>(
        "SELECT value FROM deliberum_store_metadata WHERE key = ?"
      )
      .get(RESOURCE_BROKER_SCHEMA_KEY);

    if (existing) {
      if (existing.value !== String(SQLITE_RESOURCE_BROKER_SCHEMA_VERSION)) {
        throw new SQLiteResourceBrokerError(
          `Unsupported SQLite resource broker schemaVersion: ${existing.value}`
        );
      }

      return;
    }

    this.database
      .prepare<[string, string]>(
        "INSERT INTO deliberum_store_metadata (key, value) VALUES (?, ?)"
      )
      .run(RESOURCE_BROKER_SCHEMA_KEY, String(SQLITE_RESOURCE_BROKER_SCHEMA_VERSION));
  }

  private resourceExistsInTransaction(resourceId: string): boolean {
    const row = this.database
      .prepare<[string], { present: 1 }>(
        [
          "SELECT 1 AS present FROM deliberum_resource_broker_resources",
          "WHERE resource_id = ?"
        ].join(" ")
      )
      .get(resourceId);

    return row !== undefined;
  }

  private assertNoExistingContentRefsInTransaction(
    contents: readonly InMemoryResourceContent[]
  ): void {
    const findContent = this.database.prepare<[string], { present: 1 }>(
      [
        "SELECT 1 AS present FROM deliberum_resource_broker_contents",
        "WHERE data_ref = ?"
      ].join(" ")
    );

    for (const content of contents) {
      if (findContent.get(content.dataRef)) {
        throw new InvalidResourceRegistrationError(
          "In-memory content dataRef must be unique."
        );
      }
    }
  }

  private parseStoredResource(resourceJson: string): Resource {
    let parsed: unknown;

    try {
      parsed = JSON.parse(resourceJson);
    } catch (error) {
      throw new SQLiteResourceBrokerError(
        `Unable to parse SQLite resource metadata: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    try {
      return parseResource(parsed);
    } catch (error) {
      if (error instanceof InvalidResourceRegistrationError) {
        throw new SQLiteResourceBrokerError(error.message);
      }

      throw error;
    }
  }
}

function parseResource(resource: unknown): Resource {
  const parsed = ResourceSchema.safeParse(resource);

  if (!parsed.success) {
    throw new InvalidResourceRegistrationError(
      "Resource metadata must match the protocol schema."
    );
  }

  return parsed.data;
}

function validateContentRegistration(
  resource: Resource,
  contents: readonly InMemoryResourceContent[]
): void {
  const resourceDataRefs = new Set(
    resource.variants.filter(isBase64Variant).map((variant) => variant.dataRef)
  );
  const seenDataRefs = new Set<string>();

  for (const content of contents) {
    if (typeof content.dataRef !== "string" || content.dataRef.length === 0) {
      throw new InvalidResourceRegistrationError(
        "In-memory content requires a dataRef."
      );
    }

    if (typeof content.base64 !== "string") {
      throw new InvalidResourceRegistrationError(
        "In-memory content must be a base64 string."
      );
    }

    if (!resourceDataRefs.has(content.dataRef)) {
      throw new InvalidResourceRegistrationError(
        "In-memory content dataRef must match a registered base64 variant."
      );
    }

    if (seenDataRefs.has(content.dataRef)) {
      throw new InvalidResourceRegistrationError(
        "In-memory content dataRef must be unique."
      );
    }

    seenDataRefs.add(content.dataRef);
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
    throw new SQLiteResourceBrokerError(
      "SQLite timeoutMs must be a non-negative finite number."
    );
  }

  return Math.trunc(value);
}

function mapSQLiteResourceBrokerError(error: unknown): unknown {
  if (
    error instanceof SQLiteResourceBrokerError ||
    error instanceof InvalidResourceRegistrationError ||
    error instanceof ResourceAlreadyRegisteredError
  ) {
    return error;
  }

  if (error instanceof Database.SqliteError && error.code === "SQLITE_BUSY") {
    return new SQLiteResourceBrokerError(
      "SQLite resource broker is busy while another writer holds the database lock."
    );
  }

  return error;
}

function cloneResource(resource: Resource): Resource {
  return structuredClone(resource);
}
