import {
  TopicContractSchema,
  type EventEnvelope,
  type TopicContract
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import { InvalidTopicContractInputError, MissingSessionDependencyError } from "./errors";

export const TOPIC_CONTRACT_PUBLISHED_EVENT_TYPE = "topic_contract_published" as const;
export const DEFAULT_SCHEMA_VERSION = "1" as const;

export const TopicContractPublishedEventPayloadSchema = TopicContractSchema;
export type TopicContractPublishedEventPayload = TopicContract;

export type IdGenerator = () => string;
export type Clock = () => string;

export type CreateSessionInput = {
  topicContract: unknown;
};

export type CreateSessionOptions = {
  eventStore: EventStore;
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
};

export type CreateSessionResult = {
  sessionId: string;
  initialEvent: StoredEvent<TopicContractPublishedEventPayload>;
};

export function createSession(
  input: CreateSessionInput,
  options: CreateSessionOptions
): CreateSessionResult {
  if (!options.eventStore) {
    throw new MissingSessionDependencyError("createSession requires an EventStore.");
  }

  if (!options.idGenerator) {
    throw new MissingSessionDependencyError("createSession requires an id generator.");
  }

  const parsedTopicContract = TopicContractSchema.safeParse(input.topicContract);
  if (!parsedTopicContract.success) {
    throw new InvalidTopicContractInputError(parsedTopicContract.error.message);
  }

  const topicContract = parsedTopicContract.data;
  const sessionId = options.idGenerator();
  const eventId = options.idGenerator();
  const createdAt = (options.clock ?? (() => new Date().toISOString()))();

  const initialEvent = options.eventStore.appendEvent<TopicContractPublishedEventPayload>({
    id: eventId,
    sessionId,
    schemaVersion: options.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
    type: TOPIC_CONTRACT_PUBLISHED_EVENT_TYPE,
    authorId: "system",
    createdAt,
    basedOnEventIds: [],
    visibility: "public",
    trace: {},
    payload: topicContract
  });

  return {
    sessionId,
    initialEvent
  };
}

export class SessionService {
  private readonly eventStore: EventStore;
  private readonly idGenerator: IdGenerator;
  private readonly clock?: Clock;
  private readonly schemaVersion?: string;

  constructor(options: CreateSessionOptions) {
    this.eventStore = options.eventStore;
    this.idGenerator = options.idGenerator;
    this.clock = options.clock;
    this.schemaVersion = options.schemaVersion;
  }

  createSession(input: CreateSessionInput): CreateSessionResult {
    return createSession(input, {
      eventStore: this.eventStore,
      idGenerator: this.idGenerator,
      clock: this.clock,
      schemaVersion: this.schemaVersion
    });
  }
}

export type TopicContractPublishedEvent = EventEnvelope<TopicContractPublishedEventPayload>;
