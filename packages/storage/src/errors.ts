export class EventStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventStoreError";
  }
}

export class InvalidEventInputError extends EventStoreError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEventInputError";
  }
}

export class DuplicateEventIdError extends EventStoreError {
  constructor(eventId: string) {
    super(`Event id already exists: ${eventId}`);
    this.name = "DuplicateEventIdError";
  }
}

export class InvalidEventRangeError extends EventStoreError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEventRangeError";
  }
}
