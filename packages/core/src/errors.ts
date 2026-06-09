export class CoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoreError";
  }
}

export class InvalidTopicContractInputError extends CoreError {
  constructor(message = "Invalid Topic Contract input.") {
    super(message);
    this.name = "InvalidTopicContractInputError";
  }
}

export class MissingSessionDependencyError extends CoreError {
  constructor(message: string) {
    super(message);
    this.name = "MissingSessionDependencyError";
  }
}

export class InvalidSealedBatchInputError extends CoreError {
  constructor(message = "Invalid sealed batch input.") {
    super(message);
    this.name = "InvalidSealedBatchInputError";
  }
}

export class SealedBatchNotFoundError extends CoreError {
  constructor(batchId: string) {
    super(`Sealed batch not found: ${batchId}`);
    this.name = "SealedBatchNotFoundError";
  }
}

export class SealedBatchAlreadyClosedError extends CoreError {
  constructor(batchId: string) {
    super(`Sealed batch is already closed: ${batchId}`);
    this.name = "SealedBatchAlreadyClosedError";
  }
}

export class UnauthorizedSealedContributionError extends CoreError {
  constructor(authorId: string) {
    super(`Participant is not authorized for this sealed batch: ${authorId}`);
    this.name = "UnauthorizedSealedContributionError";
  }
}

export class DuplicateSealedContributionError extends CoreError {
  constructor(authorId: string) {
    super(`Participant has already submitted a sealed contribution: ${authorId}`);
    this.name = "DuplicateSealedContributionError";
  }
}

export class IncompleteSealedBatchError extends CoreError {
  constructor(batchId: string) {
    super(`Sealed batch is incomplete: ${batchId}`);
    this.name = "IncompleteSealedBatchError";
  }
}

export class UnsupportedRevealPolicyError extends CoreError {
  constructor(revealPolicy: string) {
    super(`Reveal policy is not supported in this stage: ${revealPolicy}`);
    this.name = "UnsupportedRevealPolicyError";
  }
}
