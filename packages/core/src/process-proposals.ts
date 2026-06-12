import {
  ProcessProposalChallengePayloadSchema,
  ProcessProposalDecisionPayloadSchema,
  ProcessProposalSchema,
  type EventEnvelope,
  type ProcessProposal,
  type ProcessProposalChallengePayload,
  type ProcessProposalDecisionPayload,
  type ProcessProposalDecisionStatus
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import {
  InvalidProcessProposalInputError,
  InvalidProcessProposalTargetError,
  MissingSessionDependencyError,
  ProcessProposalBasisEventNotFoundError,
  ProcessProposalEventNotFoundError
} from "./errors";
import {
  PROJECTION_VERSION,
  type ProjectionInput,
  type ProjectionMetadata
} from "./projections";
import { DEFAULT_SCHEMA_VERSION, type Clock, type IdGenerator } from "./session";

export const PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE =
  "process_proposal_proposed" as const;
export const PROCESS_PROPOSAL_CHALLENGED_EVENT_TYPE =
  "process_proposal_challenged" as const;
export const PROCESS_PROPOSAL_DECIDED_EVENT_TYPE =
  "process_proposal_decided" as const;

export type ProposeProcessProposalInput = {
  sessionId: string;
  authorId: string;
  proposal: unknown;
  basedOnEventIds?: readonly string[];
  idempotencyKey?: string;
};

export type ChallengeProcessProposalInput = {
  sessionId: string;
  targetProcessProposalEventId: string;
  authorId: string;
  reason: string;
  idempotencyKey?: string;
};

export type DecideProcessProposalInput = {
  sessionId: string;
  targetProcessProposalEventId: string;
  authorId: string;
  status: ProcessProposalDecisionStatus;
  rationale: string;
  idempotencyKey?: string;
};

export type ProcessProposalOptions = {
  eventStore: EventStore;
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
};

export type ProposeProcessProposalResult = {
  proposalId: string;
  proposalEvent: StoredEvent<ProcessProposal>;
  appended: boolean;
};

export type ChallengeProcessProposalResult = {
  challengeEvent: StoredEvent<ProcessProposalChallengePayload>;
  appended: boolean;
};

export type DecideProcessProposalResult = {
  decisionEvent: StoredEvent<ProcessProposalDecisionPayload>;
  appended: boolean;
};

export type ProcessProposalState = {
  proposalEventId: string;
  proposalId: string;
  sessionId: string;
  sequence: number;
  proposal: ProcessProposal;
  challengeEventIds: string[];
  decisionEventIds: string[];
  latestStatus: ProcessProposal["status"];
};

export type ProcessProposalStatesProjection = {
  proposalStates: ProcessProposalState[];
  projection: ProjectionMetadata;
};

type MutableProcessProposalState = ProcessProposalState;

export function proposeProcessProposal(
  input: ProposeProcessProposalInput,
  options: ProcessProposalOptions
): ProposeProcessProposalResult {
  assertOptions(options);

  const proposal = parseProposedProcessProposal(input.proposal);
  const basedOnEventIds = normalizeBasisEventIds(input.basedOnEventIds ?? []);
  assertBasisEventsExist(options.eventStore, input.sessionId, basedOnEventIds);

  const appendResult = options.eventStore.appendEventResult<ProcessProposal>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE,
    authorId: input.authorId,
    createdAt: getClock(options)(),
    basedOnEventIds,
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload: proposal
  });
  const proposalEvent = appendResult.event;

  return {
    proposalId: proposalEvent.payload.id,
    proposalEvent,
    appended: appendResult.appended
  };
}

export function challengeProcessProposal(
  input: ChallengeProcessProposalInput,
  options: ProcessProposalOptions
): ChallengeProcessProposalResult {
  assertOptions(options);

  const targetProposalEvent = getTargetProcessProposalEvent(
    options.eventStore,
    input.sessionId,
    input.targetProcessProposalEventId
  );
  const challengePayload = parseProcessProposalChallengePayload({
    id: options.idGenerator(),
    targetProcessProposalEventId: targetProposalEvent.id,
    reason: input.reason,
    status: "challenged"
  });
  const appendResult =
    options.eventStore.appendEventResult<ProcessProposalChallengePayload>({
      id: options.idGenerator(),
      sessionId: input.sessionId,
      schemaVersion: getSchemaVersion(options),
      type: PROCESS_PROPOSAL_CHALLENGED_EVENT_TYPE,
      authorId: input.authorId,
      createdAt: getClock(options)(),
      basedOnEventIds: [targetProposalEvent.id],
      visibility: "public",
      idempotencyKey: input.idempotencyKey,
      trace: {},
      payload: challengePayload
    });
  const challengeEvent = appendResult.event;

  return {
    challengeEvent,
    appended: appendResult.appended
  };
}

export function decideProcessProposal(
  input: DecideProcessProposalInput,
  options: ProcessProposalOptions
): DecideProcessProposalResult {
  assertOptions(options);

  const targetProposalEvent = getTargetProcessProposalEvent(
    options.eventStore,
    input.sessionId,
    input.targetProcessProposalEventId
  );
  const decisionPayload = parseProcessProposalDecisionPayload({
    id: options.idGenerator(),
    targetProcessProposalEventId: targetProposalEvent.id,
    rationale: input.rationale,
    status: input.status
  });
  const appendResult =
    options.eventStore.appendEventResult<ProcessProposalDecisionPayload>({
      id: options.idGenerator(),
      sessionId: input.sessionId,
      schemaVersion: getSchemaVersion(options),
      type: PROCESS_PROPOSAL_DECIDED_EVENT_TYPE,
      authorId: input.authorId,
      createdAt: getClock(options)(),
      basedOnEventIds: [targetProposalEvent.id],
      visibility: "public",
      idempotencyKey: input.idempotencyKey,
      trace: {},
      payload: decisionPayload
    });
  const decisionEvent = appendResult.event;

  return {
    decisionEvent,
    appended: appendResult.appended
  };
}

export function projectProcessProposalStates(
  input: ProjectionInput
): ProcessProposalStatesProjection {
  const events = resolveProjectionEvents(input);
  const statesByEventId = new Map<string, MutableProcessProposalState>();

  for (const event of events) {
    if (event.type === PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE) {
      const parsedProposal = ProcessProposalSchema.safeParse(event.payload);

      if (!parsedProposal.success) {
        continue;
      }

      statesByEventId.set(event.id, {
        proposalEventId: event.id,
        proposalId: parsedProposal.data.id,
        sessionId: event.sessionId,
        sequence: event.sequence,
        proposal: structuredClone(parsedProposal.data),
        challengeEventIds: [],
        decisionEventIds: [],
        latestStatus: parsedProposal.data.status
      });

      continue;
    }

    if (event.type === PROCESS_PROPOSAL_CHALLENGED_EVENT_TYPE) {
      const parsedChallenge = ProcessProposalChallengePayloadSchema.safeParse(
        event.payload
      );

      if (!parsedChallenge.success) {
        continue;
      }

      const targetState = statesByEventId.get(
        parsedChallenge.data.targetProcessProposalEventId
      );
      if (!canLifecycleEventAffectProposal(event, targetState)) {
        continue;
      }

      targetState.challengeEventIds.push(event.id);
      targetState.latestStatus = "challenged";
      continue;
    }

    if (event.type === PROCESS_PROPOSAL_DECIDED_EVENT_TYPE) {
      const parsedDecision = ProcessProposalDecisionPayloadSchema.safeParse(
        event.payload
      );

      if (!parsedDecision.success) {
        continue;
      }

      const targetState = statesByEventId.get(
        parsedDecision.data.targetProcessProposalEventId
      );
      if (!canLifecycleEventAffectProposal(event, targetState)) {
        continue;
      }

      targetState.decisionEventIds.push(event.id);
      targetState.latestStatus = parsedDecision.data.status;
    }
  }

  return {
    proposalStates: [...statesByEventId.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .map((state) => structuredClone(state)),
    projection: createProjectionMetadata(events)
  };
}

export class ProcessProposalService {
  private readonly eventStore: EventStore;
  private readonly idGenerator: IdGenerator;
  private readonly clock?: Clock;
  private readonly schemaVersion?: string;

  constructor(options: ProcessProposalOptions) {
    this.eventStore = options.eventStore;
    this.idGenerator = options.idGenerator;
    this.clock = options.clock;
    this.schemaVersion = options.schemaVersion;
  }

  proposeProcessProposal(input: ProposeProcessProposalInput): ProposeProcessProposalResult {
    return proposeProcessProposal(input, this.options);
  }

  challengeProcessProposal(
    input: ChallengeProcessProposalInput
  ): ChallengeProcessProposalResult {
    return challengeProcessProposal(input, this.options);
  }

  decideProcessProposal(input: DecideProcessProposalInput): DecideProcessProposalResult {
    return decideProcessProposal(input, this.options);
  }

  private get options(): ProcessProposalOptions {
    return {
      eventStore: this.eventStore,
      idGenerator: this.idGenerator,
      clock: this.clock,
      schemaVersion: this.schemaVersion
    };
  }
}

export type ProcessProposalProposedEvent = EventEnvelope<ProcessProposal>;
export type ProcessProposalChallengedEvent =
  EventEnvelope<ProcessProposalChallengePayload>;
export type ProcessProposalDecidedEvent =
  EventEnvelope<ProcessProposalDecisionPayload>;

function assertOptions(options: ProcessProposalOptions): void {
  if (!options.eventStore) {
    throw new MissingSessionDependencyError("process proposals require an EventStore.");
  }

  if (!options.idGenerator) {
    throw new MissingSessionDependencyError("process proposals require an id generator.");
  }
}

function getClock(options: ProcessProposalOptions): Clock {
  return options.clock ?? (() => new Date().toISOString());
}

function getSchemaVersion(options: ProcessProposalOptions): string {
  return options.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
}

function parseProposedProcessProposal(input: unknown): ProcessProposal {
  const parsed = ProcessProposalSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidProcessProposalInputError(parsed.error.message);
  }

  if (parsed.data.status !== "proposed") {
    throw new InvalidProcessProposalInputError(
      "Process proposal events must be proposed when first recorded."
    );
  }

  return parsed.data;
}

function parseProcessProposalChallengePayload(
  input: unknown
): ProcessProposalChallengePayload {
  const parsed = ProcessProposalChallengePayloadSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidProcessProposalInputError(parsed.error.message);
  }

  return parsed.data;
}

function parseProcessProposalDecisionPayload(
  input: unknown
): ProcessProposalDecisionPayload {
  const parsed = ProcessProposalDecisionPayloadSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidProcessProposalInputError(parsed.error.message);
  }

  return parsed.data;
}

function normalizeBasisEventIds(eventIds: readonly string[]): string[] {
  return [...new Set(eventIds)];
}

function assertBasisEventsExist(
  eventStore: EventStore,
  sessionId: string,
  eventIds: readonly string[]
): void {
  for (const eventId of eventIds) {
    const event = eventStore.getEvent(eventId);

    if (!event || event.sessionId !== sessionId) {
      throw new ProcessProposalBasisEventNotFoundError(eventId);
    }
  }
}

function getTargetProcessProposalEvent(
  eventStore: EventStore,
  sessionId: string,
  targetProcessProposalEventId: string
): StoredEvent<ProcessProposal> {
  const targetEvent = eventStore.getEvent<ProcessProposal>(targetProcessProposalEventId);

  if (!targetEvent) {
    throw new ProcessProposalEventNotFoundError(targetProcessProposalEventId);
  }

  if (targetEvent.sessionId !== sessionId) {
    throw new InvalidProcessProposalTargetError(
      "Target process proposal event is not in this session."
    );
  }

  if (targetEvent.type !== PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE) {
    throw new InvalidProcessProposalTargetError(
      "Target event must be a process proposal event."
    );
  }

  const parsedPayload = ProcessProposalSchema.safeParse(targetEvent.payload);
  if (!parsedPayload.success) {
    throw new InvalidProcessProposalTargetError(parsedPayload.error.message);
  }

  return targetEvent;
}

function resolveProjectionEvents(input: ProjectionInput): StoredEvent[] {
  const events =
    "eventStore" in input
      ? input.eventStore.listEvents(input.sessionId)
      : [...input.events].filter(
          (event) => !input.sessionId || event.sessionId === input.sessionId
        );

  return events.sort((left, right) => left.sequence - right.sequence);
}

function createProjectionMetadata(events: readonly StoredEvent[]): ProjectionMetadata {
  return {
    version: PROJECTION_VERSION,
    eventRange:
      events.length === 0
        ? null
        : {
            fromSequence: events[0]!.sequence,
            toSequence: events[events.length - 1]!.sequence
          },
    eventIds: events.map((event) => event.id)
  };
}

function canLifecycleEventAffectProposal(
  event: StoredEvent,
  targetState: MutableProcessProposalState | undefined
): targetState is MutableProcessProposalState {
  return Boolean(targetState && targetState.sessionId === event.sessionId);
}
