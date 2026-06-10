import {
  DeliberationRunRecordSchema,
  type DeliberationRunRecord,
  type RunStore
} from "./types";
import { RunStoreConflictError } from "./errors";

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
