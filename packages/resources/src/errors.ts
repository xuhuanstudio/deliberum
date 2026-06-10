export class ResourceBrokerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceBrokerError";
  }
}

export class InvalidResourceRegistrationError extends ResourceBrokerError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResourceRegistrationError";
  }
}

export class ResourceAlreadyRegisteredError extends ResourceBrokerError {
  constructor(resourceId: string) {
    super(`Resource is already registered: ${resourceId}`);
    this.name = "ResourceAlreadyRegisteredError";
  }
}

export class ResourceNotFoundError extends ResourceBrokerError {
  constructor(resourceId: string) {
    super(`Resource was not found: ${resourceId}`);
    this.name = "ResourceNotFoundError";
  }
}

export class InvalidResourcePolicyError extends ResourceBrokerError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResourcePolicyError";
  }
}
