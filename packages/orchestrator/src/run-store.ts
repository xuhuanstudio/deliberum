import {
  DeliberationRunRecordSchema,
  type DeliberationRunRecord,
  type RunStore
} from "./types";
import { RunStoreConflictError, RunStoreNotFoundError, RunStoreUpdateError } from "./errors";

export class InMemoryRunStore implements RunStore {
  private readonly runsById = new Map<string, DeliberationRunRecord>();

  createRun(input: DeliberationRunRecord): DeliberationRunRecord {
    const parsed = DeliberationRunRecordSchema.parse(input);

    if (this.runsById.has(parsed.id)) {
      throw new RunStoreConflictError(parsed.id);
    }

    this.runsById.set(parsed.id, cloneRun(parsed));

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

    return cloneRun(updated);
  }

  getRun(runId: string): DeliberationRunRecord | undefined {
    const run = this.runsById.get(runId);

    return run ? cloneRun(run) : undefined;
  }

  listRuns(): DeliberationRunRecord[] {
    return [...this.runsById.values()].map(cloneRun);
  }
}

function cloneRun(run: DeliberationRunRecord): DeliberationRunRecord {
  return structuredClone(run);
}
