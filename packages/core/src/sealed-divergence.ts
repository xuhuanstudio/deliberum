import {
  JsonValueSchema,
  SealedBatchSchema,
  type EventEnvelope,
  type JsonValue,
  type SealedBatch,
  type SealedBatchPurpose,
  type SealedBatchRevealPolicy
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import {
  DuplicateSealedContributionError,
  IncompleteSealedBatchError,
  InvalidSealedBatchInputError,
  MissingSessionDependencyError,
  SealedBatchAlreadyClosedError,
  SealedBatchNotFoundError,
  UnauthorizedSealedContributionError
} from "./errors";
import { DEFAULT_SCHEMA_VERSION, type Clock, type IdGenerator } from "./session";

export const SEALED_BATCH_OPENED_EVENT_TYPE = "sealed_batch_opened" as const;
export const SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE =
  "sealed_contribution_submitted" as const;
export const SEALED_BATCH_REVEALED_EVENT_TYPE = "sealed_batch_revealed" as const;

export type OpenSealedBatchInput = {
  sessionId: string;
  purpose: SealedBatchPurpose;
  participantIds?: string[];
  revealPolicy?: SealedBatchRevealPolicy;
  quorumCount?: number;
  deadlineAt?: string;
  idempotencyKey?: string;
};

export type SubmitSealedContributionInput<TPayload = JsonValue> = {
  sessionId: string;
  batchId: string;
  authorId: string;
  visibility: "sealed";
  payload: TPayload;
  idempotencyKey?: string;
};

export type CloseSealedBatchInput = {
  sessionId: string;
  batchId: string;
  idempotencyKey?: string;
};

export type SealedDivergenceOptions = {
  eventStore: EventStore;
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
};

export type OpenSealedBatchResult = {
  batchId: string;
  openedEvent: StoredEvent<SealedBatch>;
  appended: boolean;
};

export type SubmitSealedContributionResult<TPayload = JsonValue> = {
  contributionEvent: StoredEvent<TPayload>;
  appended: boolean;
};

export type CloseSealedBatchResult = {
  revealedEvent: StoredEvent<SealedBatch>;
  appended: boolean;
};

type BatchState = {
  openedEvent: StoredEvent<SealedBatch>;
  openedBatch: SealedBatch;
  revealedEvent?: StoredEvent<SealedBatch>;
  contributionEvents: StoredEvent<JsonValue>[];
};

export function openSealedBatch(
  input: OpenSealedBatchInput,
  options: SealedDivergenceOptions
): OpenSealedBatchResult {
  assertOptions(options);

  const batchId = options.idGenerator();
  const eventId = options.idGenerator();
  const openedAt = getClock(options)();
  const openedBatch = parseSealedBatch({
    id: batchId,
    sessionId: input.sessionId,
    purpose: input.purpose,
    status: "open",
    participantIds: input.participantIds ?? [],
    openedAt,
    revealPolicy: input.revealPolicy ?? "all_completed",
    ...(input.quorumCount !== undefined ? { quorumCount: input.quorumCount } : {}),
    ...(input.deadlineAt !== undefined ? { deadlineAt: input.deadlineAt } : {})
  });

  const appendResult = options.eventStore.appendEventResult<SealedBatch>({
    id: eventId,
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: SEALED_BATCH_OPENED_EVENT_TYPE,
    authorId: "system",
    createdAt: openedAt,
    basedOnEventIds: [],
    batchId,
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload: openedBatch
  });
  const openedEvent = appendResult.event;

  return {
    batchId: openedEvent.payload.id,
    openedEvent,
    appended: appendResult.appended
  };
}

export function submitSealedContribution<TPayload = JsonValue>(
  input: SubmitSealedContributionInput<TPayload>,
  options: SealedDivergenceOptions
): SubmitSealedContributionResult<TPayload> {
  assertOptions(options);

  if (input.visibility !== "sealed") {
    throw new InvalidSealedBatchInputError("Sealed contributions must use sealed visibility.");
  }

  if (input.authorId === "system") {
    throw new InvalidSealedBatchInputError("Sealed contributions must be participant-authored.");
  }

  const batchState = getOpenBatchState(options.eventStore, input.sessionId, input.batchId);
  assertAuthorizedParticipant(batchState.openedBatch, input.authorId);
  assertNoDuplicateContribution(batchState, input);

  const payload = JsonValueSchema.parse(input.payload) as TPayload;
  const appendResult = options.eventStore.appendEventResult<TPayload>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
    authorId: input.authorId,
    createdAt: getClock(options)(),
    basedOnEventIds: [batchState.openedEvent.id],
    batchId: input.batchId,
    visibility: "sealed",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload
  });
  const contributionEvent = appendResult.event;

  return {
    contributionEvent,
    appended: appendResult.appended
  };
}

export function closeSealedBatch(
  input: CloseSealedBatchInput,
  options: SealedDivergenceOptions
): CloseSealedBatchResult {
  assertOptions(options);

  const batchState = getOpenBatchState(options.eventStore, input.sessionId, input.batchId);
  const revealedAt = getClock(options)();
  assertRevealPolicyCanClose(
    batchState.openedBatch,
    batchState.contributionEvents,
    revealedAt
  );

  const revealedBatch = parseSealedBatch({
    ...batchState.openedBatch,
    status: "revealed",
    revealedAt
  });
  const contributionEventIds = batchState.contributionEvents.map((event) => event.id);
  const appendResult = options.eventStore.appendEventResult<SealedBatch>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: SEALED_BATCH_REVEALED_EVENT_TYPE,
    authorId: "system",
    createdAt: revealedAt,
    basedOnEventIds: [batchState.openedEvent.id, ...contributionEventIds],
    batchId: input.batchId,
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload: revealedBatch
  });
  const revealedEvent = appendResult.event;

  return {
    revealedEvent,
    appended: appendResult.appended
  };
}

export class SealedDivergenceService {
  private readonly eventStore: EventStore;
  private readonly idGenerator: IdGenerator;
  private readonly clock?: Clock;
  private readonly schemaVersion?: string;

  constructor(options: SealedDivergenceOptions) {
    this.eventStore = options.eventStore;
    this.idGenerator = options.idGenerator;
    this.clock = options.clock;
    this.schemaVersion = options.schemaVersion;
  }

  openSealedBatch(input: OpenSealedBatchInput): OpenSealedBatchResult {
    return openSealedBatch(input, this.options);
  }

  submitSealedContribution<TPayload = JsonValue>(
    input: SubmitSealedContributionInput<TPayload>
  ): SubmitSealedContributionResult<TPayload> {
    return submitSealedContribution(input, this.options);
  }

  closeSealedBatch(input: CloseSealedBatchInput): CloseSealedBatchResult {
    return closeSealedBatch(input, this.options);
  }

  private get options(): SealedDivergenceOptions {
    return {
      eventStore: this.eventStore,
      idGenerator: this.idGenerator,
      clock: this.clock,
      schemaVersion: this.schemaVersion
    };
  }
}

export type SealedBatchOpenedEvent = EventEnvelope<SealedBatch>;
export type SealedContributionSubmittedEvent<TPayload = JsonValue> = EventEnvelope<TPayload>;
export type SealedBatchRevealedEvent = EventEnvelope<SealedBatch>;

function assertOptions(options: SealedDivergenceOptions): void {
  if (!options.eventStore) {
    throw new MissingSessionDependencyError("sealed divergence requires an EventStore.");
  }

  if (!options.idGenerator) {
    throw new MissingSessionDependencyError("sealed divergence requires an id generator.");
  }
}

function getClock(options: SealedDivergenceOptions): Clock {
  return options.clock ?? (() => new Date().toISOString());
}

function getSchemaVersion(options: SealedDivergenceOptions): string {
  return options.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
}

function parseSealedBatch(input: unknown): SealedBatch {
  const parsed = SealedBatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidSealedBatchInputError(parsed.error.message);
  }

  return parsed.data;
}

function getOpenBatchState(
  eventStore: EventStore,
  sessionId: string,
  batchId: string
): BatchState {
  const batchEvents = eventStore.listEventsByBatch(sessionId, batchId);
  const openedEvent = batchEvents.find((event) => event.type === SEALED_BATCH_OPENED_EVENT_TYPE);

  if (!openedEvent) {
    throw new SealedBatchNotFoundError(batchId);
  }

  const parsedOpenedBatch = SealedBatchSchema.safeParse(openedEvent.payload);
  if (!parsedOpenedBatch.success) {
    throw new InvalidSealedBatchInputError(parsedOpenedBatch.error.message);
  }

  const revealedEvent = batchEvents.find((event) => event.type === SEALED_BATCH_REVEALED_EVENT_TYPE);
  if (revealedEvent) {
    throw new SealedBatchAlreadyClosedError(batchId);
  }

  const contributionEvents = batchEvents.filter(
    (event): event is StoredEvent<JsonValue> =>
      event.type === SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE && event.visibility === "sealed"
  );

  return {
    openedEvent: openedEvent as StoredEvent<SealedBatch>,
    openedBatch: parsedOpenedBatch.data,
    revealedEvent: revealedEvent as StoredEvent<SealedBatch> | undefined,
    contributionEvents
  };
}

function assertAuthorizedParticipant(batch: SealedBatch, authorId: string): void {
  if (batch.participantIds.length > 0 && !batch.participantIds.includes(authorId)) {
    throw new UnauthorizedSealedContributionError(authorId);
  }
}

function assertNoDuplicateContribution<TPayload>(
  batchState: BatchState,
  input: SubmitSealedContributionInput<TPayload>
): void {
  const existingByAuthor = batchState.contributionEvents.find(
    (event) => event.authorId === input.authorId
  );

  if (!existingByAuthor) {
    return;
  }

  if (input.idempotencyKey && existingByAuthor.idempotencyKey === input.idempotencyKey) {
    return;
  }

  throw new DuplicateSealedContributionError(input.authorId);
}

function assertRevealPolicyCanClose(
  batch: SealedBatch,
  contributionEvents: readonly StoredEvent<JsonValue>[],
  revealedAt: string
): void {
  if (batch.revealPolicy === "manual") {
    return;
  }

  const contributedAuthorIds = new Set(contributionEvents.map((event) => event.authorId));

  if (batch.revealPolicy === "quorum") {
    const quorumCount = batch.quorumCount;
    if (quorumCount === undefined) {
      throw new InvalidSealedBatchInputError("quorumCount is required for quorum reveal policy.");
    }

    if (contributedAuthorIds.size < quorumCount) {
      throw new IncompleteSealedBatchError(batch.id);
    }

    return;
  }

  if (batch.revealPolicy === "deadline") {
    const deadlineAt = batch.deadlineAt;
    if (deadlineAt === undefined) {
      throw new InvalidSealedBatchInputError("deadlineAt is required for deadline reveal policy.");
    }

    const revealedAtMs = Date.parse(revealedAt);
    const deadlineAtMs = Date.parse(deadlineAt);
    if (!Number.isFinite(revealedAtMs) || !Number.isFinite(deadlineAtMs)) {
      throw new InvalidSealedBatchInputError("Deadline reveal policy requires valid timestamps.");
    }

    if (revealedAtMs < deadlineAtMs) {
      throw new IncompleteSealedBatchError(batch.id);
    }

    return;
  }

  if (batch.participantIds.length === 0) {
    return;
  }

  const allParticipantsSubmitted = batch.participantIds.every((participantId) =>
    contributedAuthorIds.has(participantId)
  );

  if (!allParticipantsSubmitted) {
    throw new IncompleteSealedBatchError(batch.id);
  }
}
