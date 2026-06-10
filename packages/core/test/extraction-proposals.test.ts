import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  ExtractionProposalNotFoundError,
  ExtractionProposalService,
  ExtractionSourceEventNotFoundError,
  InvalidExtractionProposalInputError,
  InvalidExtractionProposalTargetError,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  PROPOSAL_CHALLENGED_EVENT_TYPE,
  acceptProposal,
  challengeProposal,
  proposeExtraction
} from "../src";
import * as core from "../src";

function createDeterministicIds(ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function createDeterministicClock() {
  let tick = 0;
  return () => `2026-06-10T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}

function createStore() {
  return new InMemoryEventStore({
    clock: createDeterministicClock()
  });
}

function appendSourceEvent(
  eventStore: InMemoryEventStore,
  { id = "source-event-1", sessionId = "session-1", type = "source_contribution" } = {}
) {
  return eventStore.appendEvent({
    id,
    sessionId,
    schemaVersion: "1",
    type,
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

function candidate(sourceEventId = "source-event-1") {
  return {
    id: "candidate-1",
    title: "Candidate 1",
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

function claim(sourceEventId = "source-event-1") {
  return {
    id: "claim-1",
    content: "Claim extracted from source",
    scope: "factual",
    sourceEventIds: [sourceEventId]
  };
}

function objection(sourceEventId = "source-event-1") {
  return {
    id: "objection-1",
    targetId: "candidate-1",
    failureMode: "Failure mode",
    consequence: "Consequence",
    severityClaim: "major",
    status: "open",
    sourceEventIds: [sourceEventId]
  };
}

function evidenceNeed(sourceEventId = "source-event-1") {
  return {
    id: "evidence-need-1",
    targetClaimId: "claim-1",
    requiredKind: "web",
    reason: "Verify the claim",
    priority: "high",
    status: "open",
    sourceEventIds: [sourceEventId]
  };
}

function qualityObligation(sourceEventId = "source-event-1") {
  return {
    id: "quality-obligation-1",
    scope: "candidate",
    targetCandidateId: "candidate-1",
    requirement: "Address the objection",
    status: "unanswered",
    sourceEventIds: [sourceEventId],
    supportingRefIds: [],
    unresolvedObjectionIds: ["objection-1"]
  };
}

function proposeBasicExtraction(eventStore: InMemoryEventStore) {
  appendSourceEvent(eventStore);

  return proposeExtraction(
    {
      sessionId: "session-1",
      authorId: "participant-2",
      candidates: [candidate()],
      rationale: "Extraction rationale"
    },
    {
      eventStore,
      idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"]),
      clock: () => "2026-06-10T00:00:01.000Z"
    }
  );
}

describe("extraction proposal lifecycle", () => {
  it("proposes extraction as one status-bearing proposal event", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);
    const beforeCount = eventStore.listEvents("session-1").length;

    const result = proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-2",
        candidates: [candidate()],
        rationale: "Extraction rationale"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"]),
        clock: () => "2026-06-10T00:00:01.000Z"
      }
    );

    expect(eventStore.listEvents("session-1")).toHaveLength(beforeCount + 1);
    expect(result.proposalId).toBe("proposal-1");
    expect(result.proposalEvent.type).toBe(EXTRACTION_PROPOSED_EVENT_TYPE);
    expect(result.proposalEvent.authorId).toBe("participant-2");
    expect(result.proposalEvent.basedOnEventIds).toEqual(["source-event-1"]);
    expect(result.proposalEvent.payload.status).toBe("proposed");
    expect(result.proposalEvent.payload.sourceEventIds).toEqual(["source-event-1"]);
    expect(result.proposalEvent.payload).not.toHaveProperty("truthSummary");
    expect(result.proposalEvent.payload).not.toHaveProperty("currentBest");
    expect(result.proposalEvent.payload).not.toHaveProperty("finalAnswer");
  });

  it("returns the stored proposal id on idempotent proposeExtraction retry", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);
    const first = proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-2",
        candidates: [candidate()],
        rationale: "Extraction rationale",
        idempotencyKey: "same-extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
      }
    );
    const retry = proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-2",
        candidates: [candidate()],
        rationale: "Extraction rationale",
        idempotencyKey: "same-extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-2", "proposal-event-2"])
      }
    );

    expect(retry.proposalEvent).toEqual(first.proposalEvent);
    expect(retry.proposalId).toBe(first.proposalId);
    expect(retry.proposalId).toBe(retry.proposalEvent.payload.id);
    expect(
      eventStore
        .listEvents("session-1")
        .filter((event) => event.type === EXTRACTION_PROPOSED_EVENT_TYPE)
    ).toHaveLength(1);
  });

  it("allows proposed objects of each extractable type when they reference source events", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);

    const result = proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-2",
        candidates: [candidate()],
        claims: [claim()],
        objections: [objection()],
        evidenceNeeds: [evidenceNeed()],
        qualityObligations: [qualityObligation()],
        rationale: "Extract all proposal object types"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
      }
    );

    expect(result.proposalEvent.payload.candidates).toHaveLength(1);
    expect(result.proposalEvent.payload.claims).toHaveLength(1);
    expect(result.proposalEvent.payload.objections).toHaveLength(1);
    expect(result.proposalEvent.payload.evidenceNeeds).toHaveLength(1);
    expect(result.proposalEvent.payload.qualityObligations).toHaveLength(1);
    expect(result.proposalEvent.payload.sourceEventIds).toEqual(["source-event-1"]);
  });

  it("rejects proposed objects without source event references", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);

    expect(() =>
      proposeExtraction(
        {
          sessionId: "session-1",
          authorId: "participant-2",
          candidates: [
            {
              ...candidate(),
              sourceEventIds: []
            }
          ],
          rationale: "Invalid extraction"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
        }
      )
    ).toThrow(InvalidExtractionProposalInputError);
  });

  it("rejects source event references missing from the same session", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore, {
      id: "source-event-other-session",
      sessionId: "session-2"
    });

    expect(() =>
      proposeExtraction(
        {
          sessionId: "session-1",
          authorId: "participant-2",
          candidates: [candidate("source-event-other-session")],
          rationale: "Invalid source reference"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
        }
      )
    ).toThrow(ExtractionSourceEventNotFoundError);
  });

  it("appends challenge events without mutating the original proposal", () => {
    const eventStore = createStore();
    const proposal = proposeBasicExtraction(eventStore).proposalEvent;
    const beforeChallenge = eventStore.getEvent(proposal.id);

    const result = challengeProposal(
      {
        sessionId: "session-1",
        targetProposalEventId: proposal.id,
        authorId: "participant-3",
        reason: "Challenge the extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
      }
    );

    expect(result.challengeEvent.type).toBe(PROPOSAL_CHALLENGED_EVENT_TYPE);
    expect(result.challengeEvent.authorId).toBe("participant-3");
    expect(result.challengeEvent.basedOnEventIds).toEqual([proposal.id]);
    expect(result.challengeEvent.payload).toEqual({
      id: "challenge-1",
      targetProposalEventId: proposal.id,
      reason: "Challenge the extraction",
      status: "challenged"
    });
    expect(eventStore.getEvent(proposal.id)).toEqual(beforeChallenge);
  });

  it("appends acceptance events without assigning truth or mutating the original proposal", () => {
    const eventStore = createStore();
    const proposal = proposeBasicExtraction(eventStore).proposalEvent;
    const beforeAcceptance = eventStore.getEvent(proposal.id);

    const result = acceptProposal(
      {
        sessionId: "session-1",
        targetProposalEventId: proposal.id,
        authorId: "participant-3",
        rationale: "Useful enough for now"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["acceptance-1", "acceptance-event-1"])
      }
    );

    expect(result.acceptanceEvent.type).toBe(PROPOSAL_ACCEPTED_EVENT_TYPE);
    expect(result.acceptanceEvent.basedOnEventIds).toEqual([proposal.id]);
    expect(result.acceptanceEvent.payload.status).toBe("accepted_for_now");
    expect(result.acceptanceEvent.payload).not.toHaveProperty("truth");
    expect(result.acceptanceEvent.payload).not.toHaveProperty("finalAnswer");
    expect(result.acceptanceEvent.payload).not.toHaveProperty("currentBest");
    expect(eventStore.getEvent(proposal.id)).toEqual(beforeAcceptance);
  });

  it("allows multiple extraction proposals to coexist for the same source events", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);

    proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-2",
        candidates: [candidate()],
        rationale: "First extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
      }
    );
    proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-3",
        claims: [claim()],
        rationale: "Second extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-2", "proposal-event-2"])
      }
    );

    expect(
      eventStore.listEventsByType("session-1", EXTRACTION_PROPOSED_EVENT_TYPE)
    ).toHaveLength(2);
  });

  it("does not mutate original source events across proposal, challenge, and acceptance", () => {
    const eventStore = createStore();
    const sourceEvent = appendSourceEvent(eventStore);
    const beforeLifecycle = eventStore.getEvent(sourceEvent.id);
    const proposal = proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-2",
        candidates: [candidate()],
        rationale: "Extraction rationale"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
      }
    ).proposalEvent;

    challengeProposal(
      {
        sessionId: "session-1",
        targetProposalEventId: proposal.id,
        authorId: "participant-3",
        reason: "Challenge"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
      }
    );
    acceptProposal(
      {
        sessionId: "session-1",
        targetProposalEventId: proposal.id,
        authorId: "participant-4",
        rationale: "Accept for now"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["acceptance-1", "acceptance-event-1"])
      }
    );

    expect(eventStore.getEvent(sourceEvent.id)).toEqual(beforeLifecycle);
  });

  it("rejects challenging or accepting missing extraction proposal events", () => {
    const eventStore = createStore();

    expect(() =>
      challengeProposal(
        {
          sessionId: "session-1",
          targetProposalEventId: "missing-proposal-event",
          authorId: "participant-3",
          reason: "Challenge"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
        }
      )
    ).toThrow(ExtractionProposalNotFoundError);

    expect(() =>
      acceptProposal(
        {
          sessionId: "session-1",
          targetProposalEventId: "missing-proposal-event",
          authorId: "participant-3",
          rationale: "Accept"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["acceptance-1", "acceptance-event-1"])
        }
      )
    ).toThrow(ExtractionProposalNotFoundError);
  });

  it("rejects challenging a non-proposal event", () => {
    const eventStore = createStore();
    const sourceEvent = appendSourceEvent(eventStore);

    expect(() =>
      challengeProposal(
        {
          sessionId: "session-1",
          targetProposalEventId: sourceEvent.id,
          authorId: "participant-3",
          reason: "Challenge"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
        }
      )
    ).toThrow(InvalidExtractionProposalTargetError);
  });

  it("rejects accepting a non-proposal event", () => {
    const eventStore = createStore();
    const sourceEvent = appendSourceEvent(eventStore);

    expect(() =>
      acceptProposal(
        {
          sessionId: "session-1",
          targetProposalEventId: sourceEvent.id,
          authorId: "participant-3",
          rationale: "Accept"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["acceptance-1", "acceptance-event-1"])
        }
      )
    ).toThrow(InvalidExtractionProposalTargetError);
  });

  it("rejects challenging a proposal event from another session", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore, {
      id: "source-event-session-2",
      sessionId: "session-2"
    });
    const proposal = proposeExtraction(
      {
        sessionId: "session-2",
        authorId: "participant-2",
        candidates: [candidate("source-event-session-2")],
        rationale: "Other session extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-2", "proposal-event-2"])
      }
    ).proposalEvent;

    expect(() =>
      challengeProposal(
        {
          sessionId: "session-1",
          targetProposalEventId: proposal.id,
          authorId: "participant-3",
          reason: "Wrong session"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
        }
      )
    ).toThrow(InvalidExtractionProposalTargetError);
  });

  it("rejects accepting a proposal event from another session", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore, {
      id: "source-event-session-2",
      sessionId: "session-2"
    });
    const proposal = proposeExtraction(
      {
        sessionId: "session-2",
        authorId: "participant-2",
        candidates: [candidate("source-event-session-2")],
        rationale: "Other session extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-2", "proposal-event-2"])
      }
    ).proposalEvent;

    expect(() =>
      acceptProposal(
        {
          sessionId: "session-1",
          targetProposalEventId: proposal.id,
          authorId: "participant-3",
          rationale: "Wrong session"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["acceptance-1", "acceptance-event-1"])
        }
      )
    ).toThrow(InvalidExtractionProposalTargetError);
  });

  it("supports ExtractionProposalService dependency injection wrapper", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);
    const service = new ExtractionProposalService({
      eventStore,
      idGenerator: createDeterministicIds([
        "proposal-1",
        "proposal-event-1",
        "challenge-1",
        "challenge-event-1"
      ])
    });

    const proposal = service.proposeExtraction({
      sessionId: "session-1",
      authorId: "participant-2",
      candidates: [candidate()],
      rationale: "Extraction rationale"
    });
    const challenge = service.challengeProposal({
      sessionId: "session-1",
      targetProposalEventId: proposal.proposalEvent.id,
      authorId: "participant-3",
      reason: "Challenge"
    });

    expect(challenge.challengeEvent.type).toBe(PROPOSAL_CHALLENGED_EVENT_TYPE);
  });
});

describe("core extraction architecture surface", () => {
  it("exports extraction APIs but not ranking, judge, vote, chat, adapter, daemon, CLI, WebGET, or Web UI APIs", () => {
    expect("proposeExtraction" in core).toBe(true);
    expect("challengeProposal" in core).toBe(true);
    expect("acceptProposal" in core).toBe(true);
    expect("RankingEngine" in core).toBe(false);
    expect("Judge" in core).toBe(false);
    expect("VoteWinner" in core).toBe(false);
    expect("CurrentBest" in core).toBe(false);
    expect("CentralRanker" in core).toBe(false);
    expect("TruthSummary" in core).toBe(false);
    expect("Adapter" in core).toBe(false);
    expect("DaemonRoute" in core).toBe(false);
    expect("CliCommand" in core).toBe(false);
    expect("WebGET" in core).toBe(false);
    expect("WebUI" in core).toBe(false);
    expect("ChatMessage" in core).toBe(false);
  });
});
