import {
  DeliberationRunRecordSchema,
  RunStoreConflictError,
  RunStoreNotFoundError,
  RunStoreUpdateError,
  type DeliberationRunRecord,
  type RunStore
} from "@deliberum/orchestrator";
import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";

export const JSON_RUN_STORE_SCHEMA_VERSION = 1 as const;

export class JsonFileRunStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonFileRunStoreError";
  }
}

export type JsonFileRunStoreFileSystem = {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  writeFileSync: typeof writeFileSync;
};

export type JsonFileRunStoreOptions = {
  filePath: string;
  fileSystem?: Partial<JsonFileRunStoreFileSystem>;
  tempFileName?: () => string;
};

type PersistedRunStore = {
  schemaVersion: typeof JSON_RUN_STORE_SCHEMA_VERSION;
  runs: DeliberationRunRecord[];
};

const defaultFileSystem: JsonFileRunStoreFileSystem = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
};

export class JsonFileRunStore implements RunStore {
  private readonly filePath: string;
  private readonly fileSystem: JsonFileRunStoreFileSystem;
  private readonly tempFileName: () => string;
  private readonly runsById = new Map<string, DeliberationRunRecord>();

  constructor(options: JsonFileRunStoreOptions) {
    this.filePath = options.filePath;
    this.fileSystem = {
      ...defaultFileSystem,
      ...options.fileSystem
    };
    this.tempFileName =
      options.tempFileName ??
      (() => `${this.filePath}.${process.pid}.${Date.now()}.tmp`);

    this.load();
  }

  createRun(input: DeliberationRunRecord): DeliberationRunRecord {
    const parsed = DeliberationRunRecordSchema.parse(input);

    if (this.runsById.has(parsed.id)) {
      throw new RunStoreConflictError(parsed.id);
    }

    this.runsById.set(parsed.id, cloneRun(parsed));
    this.persist();

    return cloneRun(parsed);
  }

  updateRun(
    runId: string,
    update: (run: DeliberationRunRecord) => DeliberationRunRecord
  ): DeliberationRunRecord {
    const existing = this.runsById.get(runId);

    if (!existing) {
      throw new RunStoreNotFoundError(runId);
    }

    const updated = DeliberationRunRecordSchema.parse(update(cloneRun(existing)));

    if (updated.id !== runId) {
      throw new RunStoreUpdateError("Run updates must preserve the run id.");
    }

    this.runsById.set(runId, cloneRun(updated));
    this.persist();

    return cloneRun(updated);
  }

  getRun(runId: string): DeliberationRunRecord | undefined {
    const run = this.runsById.get(runId);
    return run ? cloneRun(run) : undefined;
  }

  listRuns(): DeliberationRunRecord[] {
    return [...this.runsById.values()].map(cloneRun);
  }

  private load(): void {
    if (!this.fileSystem.existsSync(this.filePath)) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.fileSystem.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new JsonFileRunStoreError(
        `Unable to read JSON run store: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const store = this.parsePersistedRunStore(parsed);
    for (const run of store.runs) {
      this.storeRun(run);
    }
  }

  private parsePersistedRunStore(input: unknown): PersistedRunStore {
    if (typeof input !== "object" || input === null) {
      throw new JsonFileRunStoreError("JSON run store must be an object.");
    }

    const store = input as { schemaVersion?: unknown; runs?: unknown };
    if (store.schemaVersion !== JSON_RUN_STORE_SCHEMA_VERSION) {
      throw new JsonFileRunStoreError(
        `Unsupported JSON run store schemaVersion: ${String(store.schemaVersion)}`
      );
    }

    if (!Array.isArray(store.runs)) {
      throw new JsonFileRunStoreError("JSON run store runs must be an array.");
    }

    const runs = store.runs.map((run) => {
      const parsedRun = DeliberationRunRecordSchema.safeParse(run);
      if (!parsedRun.success) {
        throw new JsonFileRunStoreError(parsedRun.error.message);
      }

      return parsedRun.data;
    });

    validatePersistedRuns(runs);

    return {
      schemaVersion: JSON_RUN_STORE_SCHEMA_VERSION,
      runs
    };
  }

  private storeRun(run: DeliberationRunRecord): void {
    if (this.runsById.has(run.id)) {
      throw new JsonFileRunStoreError(`Duplicate run id in JSON run store: ${run.id}`);
    }

    this.runsById.set(run.id, cloneRun(run));
  }

  private persist(): void {
    const directory = dirname(this.filePath);
    this.fileSystem.mkdirSync(directory, { recursive: true });

    const tmpPath = this.tempFileName();
    const store: PersistedRunStore = {
      schemaVersion: JSON_RUN_STORE_SCHEMA_VERSION,
      runs: this.listRuns().sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    };

    this.fileSystem.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    this.fileSystem.renameSync(tmpPath, this.filePath);
  }
}

function validatePersistedRuns(runs: readonly DeliberationRunRecord[]): void {
  const runIds = new Set<string>();
  const sessionIds = new Set<string>();

  for (const run of runs) {
    if (runIds.has(run.id)) {
      throw new JsonFileRunStoreError(`Duplicate run id in JSON run store: ${run.id}`);
    }
    runIds.add(run.id);

    if (sessionIds.has(run.sessionId)) {
      throw new JsonFileRunStoreError(
        `Duplicate run session id in JSON run store: ${run.sessionId}`
      );
    }
    sessionIds.add(run.sessionId);
  }
}

function cloneRun(run: DeliberationRunRecord): DeliberationRunRecord {
  return structuredClone(run);
}
