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

export class RunStoreUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunStoreUpdateError";
  }
}

export class ContextBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextBuilderError";
  }
}

export class AdapterRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterRegistryError";
  }
}

export class ProviderSecretResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderSecretResolutionError";
  }
}

export class DispatchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchInputError";
  }
}

export class RunSealedDivergenceRoundError extends Error {
  readonly category: string;

  constructor(category: string, message: string) {
    super(message);
    this.name = "RunSealedDivergenceRoundError";
    this.category = category;
  }
}

export class ExtractionGeneratorRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionGeneratorRegistryError";
  }
}

export class ExtractionContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionContextError";
  }
}

export class ExtractionGeneratorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionGeneratorValidationError";
  }
}

export class RunExtractionProposalRoundError extends Error {
  readonly category: string;

  constructor(category: string, message: string) {
    super(message);
    this.name = "RunExtractionProposalRoundError";
    this.category = category;
  }
}

export class ProposalReviewGeneratorRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalReviewGeneratorRegistryError";
  }
}

export class ProposalReviewContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalReviewContextError";
  }
}

export class ProposalReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalReviewValidationError";
  }
}

export class RunProposalReviewRoundError extends Error {
  readonly category: string;

  constructor(category: string, message: string) {
    super(message);
    this.name = "RunProposalReviewRoundError";
    this.category = category;
  }
}
