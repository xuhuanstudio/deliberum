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
