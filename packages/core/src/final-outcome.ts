import {
  EvidenceResultSchema,
  FinalAuditSchema,
  FinalCandidateProposalSchema,
  type EvidenceResult,
  type EventEnvelope,
  type FinalAudit,
  type FinalCandidateProposal
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import {
  FinalCandidateProposalNotFoundError,
  InvalidFinalAuditInputError,
  InvalidFinalCandidateProposalInputError,
  InvalidOutcomeCompilationInputError,
  MissingSessionDependencyError
} from "./errors";
import {
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  type AcceptedDeliberationObjectsProjection,
  type CandidateFrontierProjection,
  type DerivedCandidate,
  type DerivedEvidenceNeed,
  type DerivedObjection,
  type DerivedQualityObligation
} from "./projections";
import { DEFAULT_SCHEMA_VERSION, type Clock, type IdGenerator } from "./session";

export const FINAL_CANDIDATE_PROPOSED_EVENT_TYPE = "final_candidate_proposed" as const;
export const FINAL_AUDIT_RECORDED_EVENT_TYPE = "final_audit_recorded" as const;
export const EVIDENCE_RESULT_RECORDED_EVENT_TYPE = "evidence_result_recorded" as const;

export type ProposeFinalCandidateInput = {
  sessionId: string;
  authorId: string;
  candidateIds: readonly string[];
  recommendation: string;
  applicabilityConditions?: readonly string[];
  rationale: string;
  limitations?: readonly string[];
  idempotencyKey?: string;
};

export type AuditFinalCandidateInput = {
  sessionId: string;
  targetFinalCandidateProposalEventId: string;
  authorId: string;
  findings?: readonly string[];
  risks?: readonly string[];
  unresolvedObjectionIds?: readonly string[];
  qualityObligationIds?: readonly string[];
  evidenceNeedIds?: readonly string[];
  omissions?: readonly string[];
  compressionProblems?: readonly string[];
  limitations?: readonly string[];
  continuationSuggestions?: readonly string[];
  idempotencyKey?: string;
};

export type FinalOutcomeOptions = {
  eventStore: EventStore;
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
};

export type ProposeFinalCandidateResult = {
  proposalId: string;
  proposalEvent: StoredEvent<FinalCandidateProposal>;
};

export type AuditFinalCandidateResult = {
  auditEvent: StoredEvent<FinalAudit>;
};

export type CompileOutcomeInput = {
  finalCandidateProposalEventId?: string;
} & (
  | {
      eventStore: EventStore;
      sessionId: string;
    }
  | {
      events: readonly StoredEvent[];
      sessionId?: string;
    }
);

export type OutcomeDraftStatus = "draft" | "provisional";

export type OutcomeEvidenceNeedStatus = {
  evidenceNeed: DerivedEvidenceNeed;
  status: "unchecked" | "reported";
  evidenceResultEventIds: string[];
  evidenceResults: EvidenceResult[];
};

export type OutcomeEvidenceStatus = {
  evidenceNeeds: OutcomeEvidenceNeedStatus[];
};

export type OutcomeFinalAuditRecord = {
  auditEventId: string;
  audit: FinalAudit;
};

export type OutcomeCompilationProvenance = {
  projectionBasis: "event_ledger_and_projections";
  eventIds: string[];
  eventRange: {
    fromSequence: number | null;
    toSequence: number | null;
  };
  finalCandidateProposalEventId?: string;
  finalAuditEventIds: string[];
};

export type OutcomeCompilationResult = {
  recommendation: string;
  applicabilityConditions: string[];
  candidateFrontierSummary: CandidateFrontierProjection;
  alternatives: DerivedCandidate[];
  objections: DerivedObjection[];
  unresolvedObjections: DerivedObjection[];
  qualityObligations: DerivedQualityObligation[];
  evidenceStatus: OutcomeEvidenceStatus;
  unresolvedQuestions: string[];
  continuationSuggestions: string[];
  provenance: OutcomeCompilationProvenance;
  limitations: string[];
  draftStatus: OutcomeDraftStatus;
  audits: OutcomeFinalAuditRecord[];
};

export function proposeFinalCandidate(
  input: ProposeFinalCandidateInput,
  options: FinalOutcomeOptions
): ProposeFinalCandidateResult {
  assertFinalOutcomeOptions(options);

  const selectedCandidateIds = unique(input.candidateIds);
  const frontier = projectCandidateFrontier({
    eventStore: options.eventStore,
    sessionId: input.sessionId
  });
  const candidatesById = new Map(
    frontier.candidates.map((candidateRecord) => [candidateRecord.object.id, candidateRecord])
  );
  const selectedCandidates = selectedCandidateIds.map((candidateId) => {
    const candidateRecord = candidatesById.get(candidateId);

    if (!candidateRecord) {
      throw new InvalidFinalCandidateProposalInputError(
        `Final candidate proposal references a candidate outside the accepted active candidate set: ${candidateId}`
      );
    }

    return candidateRecord;
  });
  const alternativeCandidateIds = frontier.candidates
    .map((candidateRecord) => candidateRecord.object.id)
    .filter((candidateId) => !selectedCandidateIds.includes(candidateId));
  const sourceEventIds = collectCandidateSourceEventIds(selectedCandidates);
  const proposalId = options.idGenerator();
  const createdAt = getClock(options)();
  const proposal = parseFinalCandidateProposal({
    id: proposalId,
    candidateIds: selectedCandidateIds,
    alternativeCandidateIds,
    sourceEventIds,
    recommendation: input.recommendation,
    applicabilityConditions: [...(input.applicabilityConditions ?? [])],
    rationale: input.rationale,
    limitations: [...(input.limitations ?? [])],
    status: "proposed"
  });

  const proposalEvent = options.eventStore.appendEvent<FinalCandidateProposal>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: FINAL_CANDIDATE_PROPOSED_EVENT_TYPE,
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

export function auditFinalCandidate(
  input: AuditFinalCandidateInput,
  options: FinalOutcomeOptions
): AuditFinalCandidateResult {
  assertFinalOutcomeOptions(options);

  const targetProposalEvent = getTargetFinalCandidateProposalEvent(
    options.eventStore,
    input.sessionId,
    input.targetFinalCandidateProposalEventId
  );
  const createdAt = getClock(options)();
  const audit = parseFinalAudit({
    id: options.idGenerator(),
    targetFinalCandidateProposalEventId: targetProposalEvent.id,
    findings: [...(input.findings ?? [])],
    risks: [...(input.risks ?? [])],
    unresolvedObjectionIds: [...(input.unresolvedObjectionIds ?? [])],
    qualityObligationIds: [...(input.qualityObligationIds ?? [])],
    evidenceNeedIds: [...(input.evidenceNeedIds ?? [])],
    omissions: [...(input.omissions ?? [])],
    compressionProblems: [...(input.compressionProblems ?? [])],
    limitations: [...(input.limitations ?? [])],
    continuationSuggestions: [...(input.continuationSuggestions ?? [])],
    status: "recorded"
  });

  const auditEvent = options.eventStore.appendEvent<FinalAudit>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: getSchemaVersion(options),
    type: FINAL_AUDIT_RECORDED_EVENT_TYPE,
    authorId: input.authorId,
    createdAt,
    basedOnEventIds: [targetProposalEvent.id],
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {},
    payload: audit
  });

  return {
    auditEvent
  };
}

export function compileOutcome(input: CompileOutcomeInput): OutcomeCompilationResult {
  const { events, sessionId } = resolveOutcomeEvents(input);
  const projectionInput = sessionId ? { events, sessionId } : { events };
  const acceptedObjects = projectAcceptedDeliberationObjects(projectionInput);
  const frontier = projectCandidateFrontier(projectionInput);
  const finalProposalEvents = getValidFinalCandidateProposalEvents(events);
  const selectedProposalEvent = selectFinalCandidateProposalEvent(
    finalProposalEvents,
    input.finalCandidateProposalEventId
  );
  const finalAudits = getValidFinalAudits(events, finalProposalEvents).filter((auditRecord) =>
    selectedProposalEvent
      ? auditRecord.audit.targetFinalCandidateProposalEventId === selectedProposalEvent.id
      : true
  );
  const selectedCandidateIds = selectedProposalEvent?.payload.candidateIds ?? [];
  const alternatives = frontier.candidates.filter(
    (candidateRecord) => !selectedCandidateIds.includes(candidateRecord.object.id)
  );
  const unresolvedObjections = acceptedObjects.objections.filter(isUnresolvedObjection);
  const unfinishedQualityObligations =
    acceptedObjects.qualityObligations.filter(isUnfinishedQualityObligation);
  const evidenceStatus = buildEvidenceStatus(acceptedObjects, events);
  const hasUncheckedEvidenceNeeds = evidenceStatus.evidenceNeeds.some(
    (evidenceNeedStatus) => evidenceNeedStatus.status === "unchecked"
  );
  const draftStatus =
    unresolvedObjections.length > 0 ||
    unfinishedQualityObligations.length > 0 ||
    hasUncheckedEvidenceNeeds ||
    !selectedProposalEvent
      ? "provisional"
      : "draft";

  return {
    recommendation:
      selectedProposalEvent?.payload.recommendation ??
      "No final candidate proposal selected for this compiled draft.",
    applicabilityConditions: [...(selectedProposalEvent?.payload.applicabilityConditions ?? [])],
    candidateFrontierSummary: clonePlain(frontier),
    alternatives: clonePlain(alternatives),
    objections: clonePlain(acceptedObjects.objections),
    unresolvedObjections: clonePlain(unresolvedObjections),
    qualityObligations: clonePlain(acceptedObjects.qualityObligations),
    evidenceStatus: clonePlain(evidenceStatus),
    unresolvedQuestions: buildUnresolvedQuestions(evidenceStatus, unfinishedQualityObligations),
    continuationSuggestions: buildContinuationSuggestions(
      unresolvedObjections,
      unfinishedQualityObligations,
      evidenceStatus,
      finalAudits
    ),
    provenance: {
      projectionBasis: "event_ledger_and_projections",
      eventIds: events.map((event) => event.id),
      eventRange: getEventRange(events),
      finalCandidateProposalEventId: selectedProposalEvent?.id,
      finalAuditEventIds: finalAudits.map((auditRecord) => auditRecord.auditEventId)
    },
    limitations: buildLimitations(
      selectedProposalEvent?.payload.limitations ?? [],
      unresolvedObjections,
      unfinishedQualityObligations,
      evidenceStatus,
      finalAudits
    ),
    draftStatus,
    audits: clonePlain(finalAudits)
  };
}

export class OutcomeCompilerService {
  private readonly eventStore: EventStore;
  private readonly idGenerator: IdGenerator;
  private readonly clock?: Clock;
  private readonly schemaVersion?: string;

  constructor(options: FinalOutcomeOptions) {
    this.eventStore = options.eventStore;
    this.idGenerator = options.idGenerator;
    this.clock = options.clock;
    this.schemaVersion = options.schemaVersion;
  }

  proposeFinalCandidate(input: ProposeFinalCandidateInput): ProposeFinalCandidateResult {
    return proposeFinalCandidate(input, this.options);
  }

  auditFinalCandidate(input: AuditFinalCandidateInput): AuditFinalCandidateResult {
    return auditFinalCandidate(input, this.options);
  }

  compileOutcome(input: {
    sessionId: string;
    finalCandidateProposalEventId?: string;
  }): OutcomeCompilationResult {
    return compileOutcome({
      eventStore: this.eventStore,
      sessionId: input.sessionId,
      finalCandidateProposalEventId: input.finalCandidateProposalEventId
    });
  }

  private get options(): FinalOutcomeOptions {
    return {
      eventStore: this.eventStore,
      idGenerator: this.idGenerator,
      clock: this.clock,
      schemaVersion: this.schemaVersion
    };
  }
}

export type FinalCandidateProposedEvent = EventEnvelope<FinalCandidateProposal>;
export type FinalAuditRecordedEvent = EventEnvelope<FinalAudit>;

type ResolvedOutcomeEvents = {
  events: StoredEvent[];
  sessionId?: string;
};

type FinalAuditRecord = {
  auditEventId: string;
  audit: FinalAudit;
  sequence: number;
};

function assertFinalOutcomeOptions(options: FinalOutcomeOptions): void {
  if (!options.eventStore) {
    throw new MissingSessionDependencyError("final outcome operations require an EventStore.");
  }

  if (!options.idGenerator) {
    throw new MissingSessionDependencyError("final outcome operations require an id generator.");
  }
}

function getClock(options: FinalOutcomeOptions): Clock {
  return options.clock ?? (() => new Date().toISOString());
}

function getSchemaVersion(options: FinalOutcomeOptions): string {
  return options.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
}

function parseFinalCandidateProposal(input: unknown): FinalCandidateProposal {
  const parsed = FinalCandidateProposalSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidFinalCandidateProposalInputError(parsed.error.message);
  }

  return parsed.data;
}

function parseFinalAudit(input: unknown): FinalAudit {
  const parsed = FinalAuditSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidFinalAuditInputError(parsed.error.message);
  }

  return parsed.data;
}

function getTargetFinalCandidateProposalEvent(
  eventStore: EventStore,
  sessionId: string,
  targetFinalCandidateProposalEventId: string
): StoredEvent<FinalCandidateProposal> {
  const targetEvent = eventStore.getEvent<FinalCandidateProposal>(
    targetFinalCandidateProposalEventId
  );

  if (!targetEvent) {
    throw new FinalCandidateProposalNotFoundError(targetFinalCandidateProposalEventId);
  }

  if (targetEvent.sessionId !== sessionId) {
    throw new InvalidFinalAuditInputError(
      "Target final candidate proposal event is not in this session."
    );
  }

  if (targetEvent.type !== FINAL_CANDIDATE_PROPOSED_EVENT_TYPE) {
    throw new InvalidFinalAuditInputError(
      "Target event must be a final candidate proposal event."
    );
  }

  const parsedPayload = FinalCandidateProposalSchema.safeParse(targetEvent.payload);
  if (!parsedPayload.success) {
    throw new InvalidFinalAuditInputError(parsedPayload.error.message);
  }

  const sessionEvents = eventStore.listEvents(sessionId);
  const nextSequence = getNextSequence(sessionEvents);
  if (targetEvent.sequence >= nextSequence) {
    throw new InvalidFinalAuditInputError(
      "Target final candidate proposal event must appear before the audit event."
    );
  }

  return targetEvent;
}

function resolveOutcomeEvents(input: CompileOutcomeInput): ResolvedOutcomeEvents {
  if ("eventStore" in input) {
    return {
      events: sortEvents(input.eventStore.listEvents(input.sessionId)),
      sessionId: input.sessionId
    };
  }

  const sessionId = input.sessionId;
  const filteredEvents = sessionId
    ? input.events.filter((event) => event.sessionId === sessionId)
    : rejectMixedSessionEvents(input.events);

  return {
    events: sortEvents(filteredEvents),
    sessionId: sessionId ?? filteredEvents[0]?.sessionId
  };
}

function rejectMixedSessionEvents(events: readonly StoredEvent[]): StoredEvent[] {
  const sessionIds = new Set(events.map((event) => event.sessionId));

  if (sessionIds.size > 1) {
    throw new InvalidOutcomeCompilationInputError(
      "Outcome compilation event arrays must include one session or an explicit sessionId."
    );
  }

  return [...events];
}

function sortEvents(events: readonly StoredEvent[]): StoredEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}

function getValidFinalCandidateProposalEvents(
  events: readonly StoredEvent[]
): StoredEvent<FinalCandidateProposal>[] {
  return events.flatMap((event) => {
    if (event.type !== FINAL_CANDIDATE_PROPOSED_EVENT_TYPE) {
      return [];
    }

    const parsedPayload = FinalCandidateProposalSchema.safeParse(event.payload);
    return parsedPayload.success
      ? [
          {
            ...event,
            payload: parsedPayload.data
          } as StoredEvent<FinalCandidateProposal>
        ]
      : [];
  });
}

function selectFinalCandidateProposalEvent(
  finalProposalEvents: readonly StoredEvent<FinalCandidateProposal>[],
  finalCandidateProposalEventId: string | undefined
): StoredEvent<FinalCandidateProposal> | undefined {
  if (!finalCandidateProposalEventId) {
    return finalProposalEvents.length === 1 ? finalProposalEvents[0] : undefined;
  }

  const matchingEvent = finalProposalEvents.find(
    (event) => event.id === finalCandidateProposalEventId
  );

  if (!matchingEvent) {
    throw new FinalCandidateProposalNotFoundError(finalCandidateProposalEventId);
  }

  return matchingEvent;
}

function getValidFinalAudits(
  events: readonly StoredEvent[],
  finalProposalEvents: readonly StoredEvent<FinalCandidateProposal>[]
): FinalAuditRecord[] {
  const finalProposalEventsById = new Map(finalProposalEvents.map((event) => [event.id, event]));

  return events.flatMap((event) => {
    if (event.type !== FINAL_AUDIT_RECORDED_EVENT_TYPE) {
      return [];
    }

    const parsedAudit = FinalAuditSchema.safeParse(event.payload);
    if (!parsedAudit.success) {
      return [];
    }

    const targetProposalEvent = finalProposalEventsById.get(
      parsedAudit.data.targetFinalCandidateProposalEventId
    );
    if (
      !targetProposalEvent ||
      targetProposalEvent.sessionId !== event.sessionId ||
      targetProposalEvent.sequence >= event.sequence
    ) {
      return [];
    }

    return [
      {
        auditEventId: event.id,
        audit: parsedAudit.data,
        sequence: event.sequence
      }
    ];
  });
}

function collectCandidateSourceEventIds(candidates: readonly DerivedCandidate[]): string[] {
  const sourceEventIds = new Set<string>();

  for (const candidate of candidates) {
    sourceEventIds.add(candidate.proposalEventId);
    for (const acceptanceEventId of candidate.acceptedByEventIds) {
      sourceEventIds.add(acceptanceEventId);
    }
    for (const sourceEventId of candidate.sourceEventIds) {
      sourceEventIds.add(sourceEventId);
    }
  }

  return [...sourceEventIds];
}

function buildEvidenceStatus(
  acceptedObjects: AcceptedDeliberationObjectsProjection,
  events: readonly StoredEvent[]
): OutcomeEvidenceStatus {
  const evidenceResultsByNeedId = new Map<string, EvidenceResultRecord[]>();

  for (const event of events) {
    if (event.type !== EVIDENCE_RESULT_RECORDED_EVENT_TYPE) {
      continue;
    }

    const parsedResult = EvidenceResultSchema.safeParse(event.payload);
    if (!parsedResult.success) {
      continue;
    }

    const resultRecords = evidenceResultsByNeedId.get(parsedResult.data.evidenceNeedId) ?? [];
    resultRecords.push({
      eventId: event.id,
      result: parsedResult.data
    });
    evidenceResultsByNeedId.set(parsedResult.data.evidenceNeedId, resultRecords);
  }

  return {
    evidenceNeeds: acceptedObjects.evidenceNeeds.map((evidenceNeed) => {
      const resultRecords = evidenceResultsByNeedId.get(evidenceNeed.object.id) ?? [];

      return {
        evidenceNeed: clonePlain(evidenceNeed),
        status: resultRecords.length > 0 ? "reported" : "unchecked",
        evidenceResultEventIds: resultRecords.map((record) => record.eventId),
        evidenceResults: resultRecords.map((record) => clonePlain(record.result))
      };
    })
  };
}

type EvidenceResultRecord = {
  eventId: string;
  result: EvidenceResult;
};

function isUnresolvedObjection(objection: DerivedObjection): boolean {
  return ["open", "partially_answered", "accepted", "unresolved"].includes(
    objection.object.status
  );
}

function isUnfinishedQualityObligation(obligation: DerivedQualityObligation): boolean {
  return ["unanswered", "partially_answered", "challenged", "unresolved"].includes(
    obligation.object.status
  );
}

function buildUnresolvedQuestions(
  evidenceStatus: OutcomeEvidenceStatus,
  unfinishedQualityObligations: readonly DerivedQualityObligation[]
): string[] {
  const questions = new Set<string>();

  for (const evidenceNeedStatus of evidenceStatus.evidenceNeeds) {
    if (evidenceNeedStatus.status === "unchecked") {
      questions.add(evidenceNeedStatus.evidenceNeed.object.reason);
    }
  }

  for (const obligation of unfinishedQualityObligations) {
    questions.add(obligation.object.requirement);
  }

  return [...questions];
}

function buildContinuationSuggestions(
  unresolvedObjections: readonly DerivedObjection[],
  unfinishedQualityObligations: readonly DerivedQualityObligation[],
  evidenceStatus: OutcomeEvidenceStatus,
  finalAudits: readonly FinalAuditRecord[]
): string[] {
  const suggestions = new Set<string>();

  for (const auditRecord of finalAudits) {
    for (const suggestion of auditRecord.audit.continuationSuggestions) {
      suggestions.add(suggestion);
    }
  }

  if (unresolvedObjections.length > 0) {
    suggestions.add("Continue deliberation on unresolved objections before treating the draft as settled.");
  }

  if (unfinishedQualityObligations.length > 0) {
    suggestions.add("Address challenged or unfinished quality obligations explicitly.");
  }

  if (evidenceStatus.evidenceNeeds.some((needStatus) => needStatus.status === "unchecked")) {
    suggestions.add("Run evidence checks for unchecked evidence needs before strengthening claims.");
  }

  return [...suggestions];
}

function buildLimitations(
  proposalLimitations: readonly string[],
  unresolvedObjections: readonly DerivedObjection[],
  unfinishedQualityObligations: readonly DerivedQualityObligation[],
  evidenceStatus: OutcomeEvidenceStatus,
  finalAudits: readonly FinalAuditRecord[]
): string[] {
  const limitations = new Set<string>(proposalLimitations);

  for (const auditRecord of finalAudits) {
    for (const limitation of auditRecord.audit.limitations) {
      limitations.add(limitation);
    }
  }

  if (unresolvedObjections.length > 0) {
    limitations.add("Unresolved objections remain visible in this compiled draft.");
  }

  if (unfinishedQualityObligations.length > 0) {
    limitations.add("Some quality obligations remain unfinished or challenged.");
  }

  if (evidenceStatus.evidenceNeeds.some((needStatus) => needStatus.status === "unchecked")) {
    limitations.add("Some evidence needs are unchecked; no verification is implied.");
  }

  return [...limitations];
}

function getEventRange(events: readonly StoredEvent[]): OutcomeCompilationProvenance["eventRange"] {
  if (events.length === 0) {
    return {
      fromSequence: null,
      toSequence: null
    };
  }

  return {
    fromSequence: events[0]?.sequence ?? null,
    toSequence: events.at(-1)?.sequence ?? null
  };
}

function getNextSequence(events: readonly StoredEvent[]): number {
  const lastSequence = events.reduce(
    (maxSequence, event) => Math.max(maxSequence, event.sequence),
    -1
  );

  return lastSequence + 1;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function clonePlain<TValue>(value: TValue): TValue {
  return structuredClone(value);
}
