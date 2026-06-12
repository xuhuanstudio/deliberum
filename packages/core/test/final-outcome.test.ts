import { describe, expect, it, vi } from "vitest";
import { InMemoryEventStore, type EventStore, type StoredEvent } from "@deliberum/storage";
import {
  EVIDENCE_RESULT_RECORDED_EVENT_TYPE,
  EvidenceNeedNotFoundError,
  FINAL_AUDIT_RECORDED_EVENT_TYPE,
  FINAL_CANDIDATE_PROPOSED_EVENT_TYPE,
  FinalCandidateProposalNotFoundError,
  InvalidFinalAuditInputError,
  InvalidFinalCandidateProposalInputError,
  InvalidOutcomeCompilationInputError,
  OutcomeCompilerService,
  acceptProposal,
  auditFinalCandidate,
  compileOutcome,
  proposeExtraction,
  proposeFinalCandidate,
  recordEvidenceResult
} from "../src";
import * as core from "../src";
import type { FinalCandidateProposal } from "@deliberum/protocol";

function createDeterministicIds(ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function createStore() {
  return new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:00.000Z"
  });
}

function appendSourceEvent(
  eventStore: InMemoryEventStore,
  { id = "source-event-1", sessionId = "session-1" } = {}
) {
  return eventStore.appendEvent({
    id,
    sessionId,
    schemaVersion: "1",
    type: "source_contribution",
    authorId: "participant-1",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [],
    visibility: "public",
    trace: {},
    payload: {
      content: "Original contribution"
    }
  });
}

function candidate({
  id = "candidate-1",
  sourceEventId = "source-event-1"
}: {
  id?: string;
  sourceEventId?: string;
} = {}) {
  return {
    id,
    title: `Candidate ${id}`,
    description: "Candidate extracted from source",
    sourceEventIds: [sourceEventId],
    status: "active",
    supportedBy: [],
    attackedBy: [],
    qualityObligationIds: [],
    assumptions: [],
    tradeoffs: []
  };
}

function objection(sourceEventId = "source-event-1") {
  return {
    id: "objection-1",
    targetId: "candidate-1",
    failureMode: "Fails under a critical edge case",
    consequence: "The recommendation may not apply broadly",
    severityClaim: "blocking",
    status: "unresolved",
    sourceEventIds: [sourceEventId]
  };
}

function evidenceNeed(sourceEventId = "source-event-1") {
  return {
    id: "evidence-need-1",
    targetClaimId: "claim-1",
    requiredKind: "web",
    reason: "Verify the factual dependency",
    priority: "high",
    status: "open",
    sourceEventIds: [sourceEventId]
  };
}

function qualityObligation({
  id = "quality-obligation-1",
  sourceEventId = "source-event-1",
  status = "challenged"
}: {
  id?: string;
  sourceEventId?: string;
  status?: "unanswered" | "answered" | "partially_answered" | "challenged" | "waived" | "unresolved";
} = {}) {
  return {
    id,
    scope: "candidate",
    targetCandidateId: "candidate-1",
    requirement: "Address the unresolved edge case",
    status,
    sourceEventIds: [sourceEventId],
    supportingRefIds: [],
    unresolvedObjectionIds: ["objection-1"]
  };
}

function proposeAndAcceptCandidateSet(eventStore: InMemoryEventStore) {
  appendSourceEvent(eventStore, { id: "source-event-1" });
  const proposalOne = proposeExtraction(
    {
      sessionId: "session-1",
      authorId: "participant-2",
      candidates: [candidate({ id: "candidate-1", sourceEventId: "source-event-1" })],
      objections: [objection("source-event-1")],
      evidenceNeeds: [evidenceNeed("source-event-1")],
      qualityObligations: [qualityObligation({ sourceEventId: "source-event-1" })],
      rationale: "Extraction with unresolved work"
    },
    {
      eventStore,
      idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
    }
  ).proposalEvent;
  acceptProposal(
    {
      sessionId: "session-1",
      targetProposalEventId: proposalOne.id,
      authorId: "participant-3",
      rationale: "Accept working objects"
    },
    {
      eventStore,
      idGenerator: createDeterministicIds(["acceptance-1", "acceptance-event-1"])
    }
  );

  appendSourceEvent(eventStore, { id: "source-event-2" });
  const proposalTwo = proposeExtraction(
    {
      sessionId: "session-1",
      authorId: "participant-4",
      candidates: [candidate({ id: "candidate-2", sourceEventId: "source-event-2" })],
      rationale: "Alternative extraction"
    },
    {
      eventStore,
      idGenerator: createDeterministicIds(["proposal-2", "proposal-event-2"])
    }
  ).proposalEvent;
  acceptProposal(
    {
      sessionId: "session-1",
      targetProposalEventId: proposalTwo.id,
      authorId: "participant-5",
      rationale: "Accept alternative"
    },
    {
      eventStore,
      idGenerator: createDeterministicIds(["acceptance-2", "acceptance-event-2"])
    }
  );

  return {
    proposalOne,
    proposalTwo
  };
}

function proposeFinal(eventStore: InMemoryEventStore) {
  return proposeFinalCandidate(
    {
      sessionId: "session-1",
      authorId: "participant-6",
      candidateIds: ["candidate-1"],
      recommendation: "Provisionally use candidate 1 when its edge case is addressed.",
      applicabilityConditions: ["The unresolved edge case is acceptable or repaired."],
      rationale: "Candidate 1 fits the working constraints best enough to draft.",
      limitations: ["This is conditional on unresolved work."]
    },
    {
      eventStore,
      idGenerator: createDeterministicIds(["final-proposal-1", "final-proposal-event-1"])
    }
  ).proposalEvent;
}

describe("final candidate proposal lifecycle", () => {
  it("appends a proposal event without assigning final truth", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const beforeCount = eventStore.listEvents("session-1").length;

    const result = proposeFinalCandidate(
      {
        sessionId: "session-1",
        authorId: "participant-6",
        candidateIds: ["candidate-1"],
        recommendation: "Provisionally use candidate 1 under stated conditions.",
        applicabilityConditions: ["Condition remains true"],
        rationale: "Drafting rationale",
        limitations: ["Still provisional"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["final-proposal-1", "final-proposal-event-1"])
      }
    );

    expect(eventStore.listEvents("session-1")).toHaveLength(beforeCount + 1);
    expect(result.appended).toBe(true);
    expect(result.proposalEvent.type).toBe(FINAL_CANDIDATE_PROPOSED_EVENT_TYPE);
    expect(result.proposalEvent.payload.status).toBe("proposed");
    expect(result.proposalEvent.payload.candidateIds).toEqual(["candidate-1"]);
    expect(result.proposalEvent.payload.alternativeCandidateIds).toEqual(["candidate-2"]);
    expect(result.proposalEvent.payload).not.toHaveProperty("finalAnswer");
    expect(result.proposalEvent.payload).not.toHaveProperty("currentBest");
    expect(result.proposalEvent.payload).not.toHaveProperty("winner");
  });

  it("returns the stored proposal id on idempotent proposeFinalCandidate retry", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const beforeCount = eventStore.listEvents("session-1").length;
    const first = proposeFinalCandidate(
      {
        sessionId: "session-1",
        authorId: "participant-6",
        candidateIds: ["candidate-1"],
        recommendation: "Provisionally use candidate 1 under stated conditions.",
        applicabilityConditions: ["Condition remains true"],
        rationale: "Drafting rationale",
        limitations: ["Still provisional"],
        idempotencyKey: "same-final-candidate"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["final-proposal-1", "final-proposal-event-1"])
      }
    );
    const retry = proposeFinalCandidate(
      {
        sessionId: "session-1",
        authorId: "participant-6",
        candidateIds: ["candidate-1"],
        recommendation: "Provisionally use candidate 1 under stated conditions.",
        applicabilityConditions: ["Condition remains true"],
        rationale: "Drafting rationale",
        limitations: ["Still provisional"],
        idempotencyKey: "same-final-candidate"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["final-proposal-2", "final-proposal-event-2"])
      }
    );

    expect(first.appended).toBe(true);
    expect(retry.appended).toBe(false);
    expect(retry.proposalEvent).toEqual(first.proposalEvent);
    expect(retry.proposalId).toBe(first.proposalId);
    expect(retry.proposalId).toBe(retry.proposalEvent.payload.id);
    expect(eventStore.listEvents("session-1")).toHaveLength(beforeCount + 1);
  });

  it("rejects proposals for candidates outside the accepted active candidate set", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);

    expect(() =>
      proposeFinalCandidate(
        {
          sessionId: "session-1",
          authorId: "participant-6",
          candidateIds: ["candidate-missing"],
          recommendation: "Use a missing candidate.",
          rationale: "Invalid",
          applicabilityConditions: [],
          limitations: []
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["final-proposal-1", "final-proposal-event-1"])
        }
      )
    ).toThrow(InvalidFinalCandidateProposalInputError);
  });
});

describe("final audit lifecycle", () => {
  it("appends a separate audit event without mutating the proposal", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const proposal = proposeFinal(eventStore);
    const beforeAudit = eventStore.getEvent(proposal.id);

    const result = auditFinalCandidate(
      {
        sessionId: "session-1",
        targetFinalCandidateProposalEventId: proposal.id,
        authorId: "participant-7",
        findings: ["The draft preserves alternatives."],
        risks: ["Unresolved objection still blocks an unqualified conclusion."],
        unresolvedObjectionIds: ["objection-1"],
        qualityObligationIds: ["quality-obligation-1"],
        evidenceNeedIds: ["evidence-need-1"],
        omissions: ["Missing repair detail."],
        compressionProblems: ["Risk wording is shorter than source objection."],
        limitations: ["Audit did not verify evidence."],
        continuationSuggestions: ["Repair the edge case."]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["final-audit-1", "final-audit-event-1"])
      }
    );

    expect(result.appended).toBe(true);
    expect(result.auditEvent.type).toBe(FINAL_AUDIT_RECORDED_EVENT_TYPE);
    expect(result.auditEvent.basedOnEventIds).toEqual([proposal.id]);
    expect(result.auditEvent.payload.status).toBe("recorded");
    expect(result.auditEvent.payload).not.toHaveProperty("verdict");
    expect(result.auditEvent.payload).not.toHaveProperty("winner");
    expect(result.auditEvent.payload).not.toHaveProperty("score");
    expect(result.auditEvent.payload).not.toHaveProperty("finalAnswer");
    expect(eventStore.getEvent(proposal.id)).toEqual(beforeAudit);
  });

  it("reports idempotent final audit retries as existing events", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const proposal = proposeFinal(eventStore);
    const beforeCount = eventStore.listEvents("session-1").length;
    const first = auditFinalCandidate(
      {
        sessionId: "session-1",
        targetFinalCandidateProposalEventId: proposal.id,
        authorId: "participant-7",
        findings: ["The draft preserves alternatives."],
        idempotencyKey: "same-final-audit"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["final-audit-1", "final-audit-event-1"])
      }
    );
    const retry = auditFinalCandidate(
      {
        sessionId: "session-1",
        targetFinalCandidateProposalEventId: proposal.id,
        authorId: "participant-7",
        findings: ["The draft preserves alternatives."],
        idempotencyKey: "same-final-audit"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["final-audit-2", "final-audit-event-2"])
      }
    );

    expect(first.appended).toBe(true);
    expect(retry.appended).toBe(false);
    expect(retry.auditEvent).toEqual(first.auditEvent);
    expect(eventStore.listEvents("session-1")).toHaveLength(beforeCount + 1);
  });

  it("rejects missing, non-final-candidate, cross-session, and later target events", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const sourceEvent = appendSourceEvent(eventStore, { id: "source-event-3" });
    const proposal = proposeFinal(eventStore);

    expect(() =>
      auditFinalCandidate(
        {
          sessionId: "session-1",
          targetFinalCandidateProposalEventId: "missing-final-proposal-event",
          authorId: "participant-7"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["final-audit-1", "final-audit-event-1"])
        }
      )
    ).toThrow(FinalCandidateProposalNotFoundError);

    expect(() =>
      auditFinalCandidate(
        {
          sessionId: "session-1",
          targetFinalCandidateProposalEventId: sourceEvent.id,
          authorId: "participant-7"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["final-audit-1", "final-audit-event-1"])
        }
      )
    ).toThrow(InvalidFinalAuditInputError);

    expect(() =>
      auditFinalCandidate(
        {
          sessionId: "session-2",
          targetFinalCandidateProposalEventId: proposal.id,
          authorId: "participant-7"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["final-audit-1", "final-audit-event-1"])
        }
      )
    ).toThrow(InvalidFinalAuditInputError);

    const invalidStore = createLaterTargetEventStore(proposal);
    expect(() =>
      auditFinalCandidate(
        {
          sessionId: "session-1",
          targetFinalCandidateProposalEventId: proposal.id,
          authorId: "participant-7"
        },
        {
          eventStore: invalidStore,
          idGenerator: createDeterministicIds(["final-audit-1", "final-audit-event-1"])
        }
      )
    ).toThrow(InvalidFinalAuditInputError);
  });
});

describe("outcome compilation", () => {
  it("compiles from events/projections without appending or mutating source events", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const proposal = proposeFinal(eventStore);
    auditFinalCandidate(
      {
        sessionId: "session-1",
        targetFinalCandidateProposalEventId: proposal.id,
        authorId: "participant-7",
        findings: ["Finding"],
        risks: ["Risk"],
        limitations: ["Audit limitation"],
        continuationSuggestions: ["Continue audit follow-up"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["final-audit-1", "final-audit-event-1"])
      }
    );
    const beforeEvents = eventStore.listEvents("session-1");
    const beforeProposal = eventStore.getEvent(proposal.id);

    const result = compileOutcome({
      eventStore,
      sessionId: "session-1",
      finalCandidateProposalEventId: proposal.id
    });
    result.candidateFrontierSummary.candidates[0]!.object.title = "Mutated result";

    expect(eventStore.listEvents("session-1")).toHaveLength(beforeEvents.length);
    expect(eventStore.getEvent(proposal.id)).toEqual(beforeProposal);
  });

  it("rejects mixed-session event arrays without an explicit sessionId and filters when provided", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    appendSourceEvent(eventStore, { id: "other-session-source", sessionId: "session-2" });

    expect(() =>
      compileOutcome({
        events: [...eventStore.listEvents("session-1"), ...eventStore.listEvents("session-2")]
      })
    ).toThrow(InvalidOutcomeCompilationInputError);

    expect(
      compileOutcome({
        events: [...eventStore.listEvents("session-1"), ...eventStore.listEvents("session-2")],
        sessionId: "session-1"
      }).provenance.eventIds
    ).not.toContain("other-session-source");
  });

  it("sorts events by sequence before compiling", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const proposal = proposeFinal(eventStore);

    const result = compileOutcome({
      events: [...eventStore.listEvents("session-1")].reverse(),
      finalCandidateProposalEventId: proposal.id
    });

    expect(result.provenance.eventRange).toEqual({
      fromSequence: 0,
      toSequence: eventStore.listEvents("session-1").at(-1)?.sequence
    });
    expect(result.provenance.projectionVersion).toBe("1");
    expect(result.recommendation).toBe(
      "Provisionally use candidate 1 when its edge case is addressed."
    );
  });

  it("preserves unresolved objections, challenged obligations, candidates, and alternatives", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const proposal = proposeFinal(eventStore);

    const result = compileOutcome({
      eventStore,
      sessionId: "session-1",
      finalCandidateProposalEventId: proposal.id
    });

    expect(result.draftStatus).toBe("provisional");
    expect(result.candidateFrontierSummary.basis).toBe("accepted_active_candidates");
    expect(result.candidateFrontierSummary.candidates.map((record) => record.object.id)).toEqual([
      "candidate-1",
      "candidate-2"
    ]);
    expect(result.alternatives.map((record) => record.object.id)).toEqual(["candidate-2"]);
    expect(result.unresolvedObjections.map((record) => record.object.id)).toEqual([
      "objection-1"
    ]);
    expect(result.qualityObligations.map((record) => record.object.status)).toEqual([
      "challenged"
    ]);
    expect(result).not.toHaveProperty("finalAnswer");
    expect(result).not.toHaveProperty("currentBest");
    expect(result).not.toHaveProperty("winner");
    expect(result).not.toHaveProperty("rank");
    expect(result).not.toHaveProperty("score");
    expect(result).not.toHaveProperty("vote");
    expect(result).not.toHaveProperty("truthSummary");
  });

  it("reports evidence needs honestly without claiming verification", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const proposal = proposeFinal(eventStore);

    let result = compileOutcome({
      eventStore,
      sessionId: "session-1",
      finalCandidateProposalEventId: proposal.id
    });
    expect(result.evidenceStatus.evidenceNeeds[0]?.status).toBe("unchecked");
    expect(JSON.stringify(result.evidenceStatus)).not.toContain("verified");

    const recorded = recordEvidenceResult(
      {
        sessionId: "session-1",
        evidenceNeedId: "evidence-need-1",
        authorId: "participant-8",
        source: "Controlled test source",
        summary: "Reported evidence result",
        limitations: ["Not independently checked by Stage 14"],
        idempotencyKey: "evidence-result-recorded-1"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["evidence-result-1", "evidence-result-event-1"]),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    expect(recorded).toMatchObject({
      appended: true,
      evidenceResultEvent: {
        id: "evidence-result-event-1",
        type: EVIDENCE_RESULT_RECORDED_EVENT_TYPE,
        basedOnEventIds: [
          "proposal-event-1",
          "acceptance-event-1",
          "source-event-1"
        ],
        payload: {
          id: "evidence-result-1",
          evidenceNeedId: "evidence-need-1",
          source: "Controlled test source",
          summary: "Reported evidence result",
          limitations: ["Not independently checked by Stage 14"]
        }
      }
    });

    result = compileOutcome({
      eventStore,
      sessionId: "session-1",
      finalCandidateProposalEventId: proposal.id
    });
    expect(result.evidenceStatus.evidenceNeeds[0]?.status).toBe("reported");
    expect(result.evidenceStatus.evidenceNeeds[0]?.evidenceResultEventIds).toEqual([
      "evidence-result-event-1"
    ]);
    expect(JSON.stringify(result.evidenceStatus)).not.toContain("verified");
  });

  it("rejects evidence results for evidence needs that are not accepted", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore, { id: "source-event-1" });

    expect(() =>
      recordEvidenceResult(
        {
          sessionId: "session-1",
          evidenceNeedId: "evidence-need-1",
          authorId: "participant-8",
          source: "Controlled test source",
          summary: "Reported evidence result"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["evidence-result-1", "evidence-result-event-1"])
        }
      )
    ).toThrow(EvidenceNeedNotFoundError);
  });

  it("supports the service wrapper without adding semantic-authority APIs", () => {
    const eventStore = createStore();
    proposeAndAcceptCandidateSet(eventStore);
    const service = new OutcomeCompilerService({
      eventStore,
      idGenerator: createDeterministicIds(["final-proposal-1", "final-proposal-event-1"])
    });

    const proposal = service.proposeFinalCandidate({
      sessionId: "session-1",
      authorId: "participant-6",
      candidateIds: ["candidate-1"],
      recommendation: "Provisionally use candidate 1.",
      rationale: "Service wrapper",
      applicabilityConditions: [],
      limitations: []
    });
    const result = service.compileOutcome({
      sessionId: "session-1",
      finalCandidateProposalEventId: proposal.proposalEvent.id
    });

    expect(result.provenance.finalCandidateProposalEventId).toBe(proposal.proposalEvent.id);
    expect("Judge" in core).toBe(false);
    expect("VoteWinner" in core).toBe(false);
    expect("CurrentBest" in core).toBe(false);
    expect("currentBest" in core).toBe(false);
    expect("winner" in core).toBe(false);
    expect("rank" in core).toBe(false);
    expect("score" in core).toBe(false);
    expect("vote" in core).toBe(false);
    expect("finalAnswer" in core).toBe(false);
    expect("truthSummary" in core).toBe(false);
    expect("CentralRanker" in core).toBe(false);
    expect("Adapter" in core).toBe(false);
    expect("DaemonRoute" in core).toBe(false);
    expect("CliCommand" in core).toBe(false);
    expect("WebGET" in core).toBe(false);
    expect("WebUI" in core).toBe(false);
    expect("ChatMessage" in core).toBe(false);
  });
});

function createLaterTargetEventStore(
  proposal: StoredEvent<FinalCandidateProposal>
): EventStore {
  return {
    appendEvent: vi.fn(),
    appendEventResult: vi.fn(),
    appendEvents: vi.fn(),
    getEvent: vi.fn(() => ({
      ...proposal,
      sequence: 1
    })),
    listEvents: vi.fn(() => []),
    listEventsByRange: vi.fn(() => []),
    listEventsByType: vi.fn(() => []),
    listEventsByBatch: vi.fn(() => []),
    listEventsByVisibility: vi.fn(() => [])
  };
}
