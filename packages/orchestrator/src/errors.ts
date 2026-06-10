export class RunPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunPlanValidationError";
  }
}

export class RunStoreConflictError extends Error {
  constructor(runId: string) {
    super(`Run already exists: ${runId}`);
    this.name = "RunStoreConflictError";
  }
}

export class RunStoreNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run was not found: ${runId}`);
    this.name = "RunStoreNotFoundError";
  }
}
