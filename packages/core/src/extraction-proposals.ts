import {
  ExtractionCandidateSchema,
  ExtractionClaimSchema,
  ExtractionEvidenceNeedSchema,
  ExtractionObjectionSchema,
  ExtractionProposalSchema,
  ExtractionQualityObligationSchema,
  ProposalAcceptancePayloadSchema,
  ProposalChallengePayloadSchema,
  type EventEnvelope,
  type ExtractionCandidate,
  type ExtractionClaim,
  type ExtractionEvidenceNeed,
  type ExtractionObjection,
  type ExtractionProposal,
  type ExtractionQualityObligation,
  type ProposalAcceptancePayload,
  type ProposalChallengePayload
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import {
  ExtractionProposalNotFoundError,
  ExtractionSourceEventNotFoundError,
  InvalidExtractionProposalInputError,
  InvalidExtractionProposalTargetError,
  MissingSessionDependencyError
} from "./errors";
import { DEFAULT_SCHEMA_VERSION, type Clock, type IdGenerator } from "./session";

export const EXTRACTION_PROPOSED_EVENT_TYPE = "extraction_proposed" as const;
export const PROPOSAL_CHALLENGED_EVENT_TYPE = "proposal_challenged" as const;
export const PROPOSAL_ACCEPTED_EVENT_TYPE = "proposal_accepted" as const;

export type ProposeExtractionInput = {
  sessionId: string;
  authorId: string;
  candidates?: readonly unknown[];
  claims?: readonly unknown[];
  objections?: readonly unknown[];
  evidenceNeeds?: readonly unknown[];
  qualityObligations?: readonly unknown[];
  rationale: string;
  idempotencyKey?: string;
};

export type ChallengeProposalInput = {
  sessionId: string;
  targetProposalEventId: string;
  authorId: string;
  reason: string;
  idempotencyKey?: string;
};

export type AcceptProposalInput = {
  sessionId: string;
  targetProposalEventId: string;
  authorId: string;
  rationale: string;
  idempotencyKey?: string;
};

export type ExtractionProposalOptions = {
  eventStore: EventStore;
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
};

export type ProposeExtractionResult = {
  proposalId: string;
  proposalEvent: StoredEvent<ExtractionProposal>;
};

export type ChallengeProposalResult = {
  challengeEvent: StoredEvent<ProposalChallengePayload>;
};

export type AcceptProposalResult = {
  acceptanceEvent: StoredEvent<ProposalAcceptancePayload>;
};

export function proposeExtraction(
  input: ProposeExtractionInput,
  options: ExtractionProposalOptions
): ProposeExtractionResult {
  assertOptions(options);

  const candidates = parseExtractionList(
    ExtractionCandidateSchema,
    input.candidates,
    "candidates"
  );
  const claims = parseExtractionList(ExtractionClaimSchema, input.claims, "claims");
  const objections = parseExtractionList(
    ExtractionObjectionSchema,
    input.objections,
    "objections"
  );
  const evidenceNeeds = parseExtractionList(
    ExtractionEvidenceNeedSchema,
    input.evidenceNeeds,
    "evidenceNeeds"
  );
  const qualityObligations = parseExtractionList(
    ExtractionQualityObligationSchema,
    input.qualityObligations,
    "qualityObligations"
  );
  const proposedObjectCount =
    candidates.length +
    claims.length +
    objections.length +
    evidenceNeeds.length +
    qualityObligations.length;

  if (proposedObjectCount === 0) {
    throw new InvalidExtractionProposalInputError(
      "Extraction proposals must contain at least one proposed object."
    );
  }

  const sourceEventIds = collectSourceEventIds([
    ...candidates,
    ...claims,
    ...objections,
    ...evidenceNeeds,
    ...qualityObligations
  ]);
  assertSourceEventsExist(options.eventStore, input.sessionId, sourceEventIds);

  const proposalId = options.idGenerator();
  const eventId = options.idGenerator();
  const createdAt = getClock(options)();
  const proposal = parseExtractionProposal({
    id: proposalId,
    sourceEventIds,
    candidates,
    claims,
    objections,
    evidenceNeeds,
    qualityObligations,
    rationale: input.rationale,
    status: "proposed"
  });

  const proposalEvent = options.eventStore.appendEvent<ExtractionProposal>({
    id: eventId,
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: EXTRACTION_PROPOSED_EVENT_TYPE,
    authorId: input.authorId,
    createdAt,
    basedOnEventIds: proposal.sourceEventIds,
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload: proposal
  });

  return {
    proposalId,
    proposalEvent
  };
}

export function challengeProposal(
  input: ChallengeProposalInput,
  options: ExtractionProposalOptions
): ChallengeProposalResult {
  assertOptions(options);

  const targetProposalEvent = getTargetExtractionProposalEvent(
    options.eventStore,
    input.sessionId,
    input.targetProposalEventId
  );
  const createdAt = getClock(options)();
  const challengePayload = parseProposalChallengePayload({
    id: options.idGenerator(),
    targetProposalEventId: targetProposalEvent.id,
    reason: input.reason,
    status: "challenged"
  });
  const challengeEvent = options.eventStore.appendEvent<ProposalChallengePayload>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: PROPOSAL_CHALLENGED_EVENT_TYPE,
    authorId: input.authorId,
    createdAt,
    basedOnEventIds: [targetProposalEvent.id],
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload: challengePayload
  });

  return {
    challengeEvent
  };
}

export function acceptProposal(
  input: AcceptProposalInput,
  options: ExtractionProposalOptions
): AcceptProposalResult {
  assertOptions(options);

  const targetProposalEvent = getTargetExtractionProposalEvent(
    options.eventStore,
    input.sessionId,
    input.targetProposalEventId
  );
  const createdAt = getClock(options)();
  const acceptancePayload = parseProposalAcceptancePayload({
    id: options.idGenerator(),
    targetProposalEventId: targetProposalEvent.id,
    rationale: input.rationale,
    status: "accepted_for_now"
  });
  const acceptanceEvent = options.eventStore.appendEvent<ProposalAcceptancePayload>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: PROPOSAL_ACCEPTED_EVENT_TYPE,
    authorId: input.authorId,
    createdAt,
    basedOnEventIds: [targetProposalEvent.id],
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload: acceptancePayload
  });

  return {
    acceptanceEvent
  };
}

export class ExtractionProposalService {
  private readonly eventStore: EventStore;
  private readonly idGenerator: IdGenerator;
  private readonly clock?: Clock;
  private readonly schemaVersion?: string;

  constructor(options: ExtractionProposalOptions) {
    this.eventStore = options.eventStore;
    this.idGenerator = options.idGenerator;
    this.clock = options.clock;
    this.schemaVersion = options.schemaVersion;
  }

  proposeExtraction(input: ProposeExtractionInput): ProposeExtractionResult {
    return proposeExtraction(input, this.options);
  }

  challengeProposal(input: ChallengeProposalInput): ChallengeProposalResult {
    return challengeProposal(input, this.options);
  }

  acceptProposal(input: AcceptProposalInput): AcceptProposalResult {
    return acceptProposal(input, this.options);
  }

  private get options(): ExtractionProposalOptions {
    return {
      eventStore: this.eventStore,
      idGenerator: this.idGenerator,
      clock: this.clock,
      schemaVersion: this.schemaVersion
    };
  }
}

export type ExtractionProposedEvent = EventEnvelope<ExtractionProposal>;
export type ProposalChallengedEvent = EventEnvelope<ProposalChallengePayload>;
export type ProposalAcceptedEvent = EventEnvelope<ProposalAcceptancePayload>;

type ExtractionObject =
  | ExtractionCandidate
  | ExtractionClaim
  | ExtractionObjection
  | ExtractionEvidenceNeed
  | ExtractionQualityObligation;

type SafeParser<T> = {
  safeParse: (
    input: unknown
  ) => { success: true; data: T } | { success: false; error: { message: string } };
};

function assertOptions(options: ExtractionProposalOptions): void {
  if (!options.eventStore) {
    throw new MissingSessionDependencyError("extraction proposals require an EventStore.");
  }

  if (!options.idGenerator) {
    throw new MissingSessionDependencyError("extraction proposals require an id generator.");
  }
}

function getClock(options: ExtractionProposalOptions): Clock {
  return options.clock ?? (() => new Date().toISOString());
}

function getSchemaVersion(options: ExtractionProposalOptions): string {
  return options.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
}

function parseExtractionList<T>(
  schema: SafeParser<T>,
  values: readonly unknown[] | undefined,
  fieldName: string
): T[] {
  return (values ?? []).map((value) => {
    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      throw new InvalidExtractionProposalInputError(`${fieldName}: ${parsed.error.message}`);
    }

    return parsed.data;
  });
}

function parseExtractionProposal(input: unknown): ExtractionProposal {
  const parsed = ExtractionProposalSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidExtractionProposalInputError(parsed.error.message);
  }

  return parsed.data;
}

function parseProposalChallengePayload(input: unknown): ProposalChallengePayload {
  const parsed = ProposalChallengePayloadSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidExtractionProposalInputError(parsed.error.message);
  }

  return parsed.data;
}

function parseProposalAcceptancePayload(input: unknown): ProposalAcceptancePayload {
  const parsed = ProposalAcceptancePayloadSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidExtractionProposalInputError(parsed.error.message);
  }

  return parsed.data;
}

function collectSourceEventIds(objects: readonly ExtractionObject[]): string[] {
  const sourceEventIds = new Set<string>();

  for (const object of objects) {
    for (const sourceEventId of object.sourceEventIds) {
      sourceEventIds.add(sourceEventId);
    }
  }

  return [...sourceEventIds];
}

function assertSourceEventsExist(
  eventStore: EventStore,
  sessionId: string,
  sourceEventIds: readonly string[]
): void {
  for (const sourceEventId of sourceEventIds) {
    const sourceEvent = eventStore.getEvent(sourceEventId);

    if (!sourceEvent || sourceEvent.sessionId !== sessionId) {
      throw new ExtractionSourceEventNotFoundError(sourceEventId);
    }
  }
}

function getTargetExtractionProposalEvent(
  eventStore: EventStore,
  sessionId: string,
  targetProposalEventId: string
): StoredEvent<ExtractionProposal> {
  const targetEvent = eventStore.getEvent<ExtractionProposal>(targetProposalEventId);

  if (!targetEvent) {
    throw new ExtractionProposalNotFoundError(targetProposalEventId);
  }

  if (targetEvent.sessionId !== sessionId) {
    throw new InvalidExtractionProposalTargetError(
      "Target extraction proposal event is not in this session."
    );
  }

  if (targetEvent.type !== EXTRACTION_PROPOSED_EVENT_TYPE) {
    throw new InvalidExtractionProposalTargetError(
      "Target event must be an extraction proposal event."
    );
  }

  const parsedPayload = ExtractionProposalSchema.safeParse(targetEvent.payload);
  if (!parsedPayload.success) {
    throw new InvalidExtractionProposalTargetError(parsedPayload.error.message);
  }

  return targetEvent;
}
