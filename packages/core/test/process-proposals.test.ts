import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  InvalidProcessProposalInputError,
  InvalidProcessProposalTargetError,
  PROCESS_PROPOSAL_CHALLENGED_EVENT_TYPE,
  PROCESS_PROPOSAL_DECIDED_EVENT_TYPE,
  PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE,
  ProcessProposalBasisEventNotFoundError,
  ProcessProposalEventNotFoundError,
  challengeProcessProposal,
  decideProcessProposal,
  projectProcessProposalStates,
  proposeProcessProposal
} from "../src";

function createDeterministicIds(ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function createStore() {
  return new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:00.000Z"
  });
}

function appendBasisEvent(eventStore: InMemoryEventStore, id = "basis-event-1") {
  return eventStore.appendEvent({
    id,
    sessionId: "session-1",
    schemaVersion: "1",
    type: "topic_contract_published",
    authorId: "system",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [],
    visibility: "public",
    trace: {},
    payload: {
      topic: "Choose the next deliberation primitive."
    }
  });
}

function processProposal() {
  return {
    id: "process-proposal-1",
    primitive: "sealed_divergence",
    targetIds: ["basis-event-1"],
    expectedQualityGain: "Preserve independent starting positions.",
    riskIfSkipped: "The run may converge before alternatives are visible.",
    requestedBudget: {
      maxEvents: 3,
      maxProviderCalls: 2
    },
    status: "proposed"
  };
}

function proposeBasicProcessProposal(eventStore: InMemoryEventStore) {
  appendBasisEvent(eventStore);

  return proposeProcessProposal(
    {
      sessionId: "session-1",
      authorId: "system",
      proposal: processProposal(),
      basedOnEventIds: ["basis-event-1"]
    },
    {
      eventStore,
      idGenerator: createDeterministicIds(["process-proposal-event-1"])
    }
  );
}

describe("process proposal lifecycle", () => {
  it("records a process proposal as public proposal material without executing a primitive", () => {
    const eventStore = createStore();
    appendBasisEvent(eventStore);

    const result = proposeProcessProposal(
      {
        sessionId: "session-1",
        authorId: "system",
        proposal: processProposal(),
        basedOnEventIds: ["basis-event-1"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["process-proposal-event-1"])
      }
    );

    expect(result.appended).toBe(true);
    expect(result.proposalId).toBe("process-proposal-1");
    expect(result.proposalEvent).toMatchObject({
      id: "process-proposal-event-1",
      type: PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE,
      authorId: "system",
      basedOnEventIds: ["basis-event-1"],
      visibility: "public",
      payload: {
        primitive: "sealed_divergence",
        status: "proposed"
      }
    });
    expect(eventStore.listEvents("session-1").map((event) => event.type)).toEqual([
      "topic_contract_published",
      PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE
    ]);
    expect(result.proposalEvent.payload).not.toHaveProperty("winner");
    expect(result.proposalEvent.payload).not.toHaveProperty("finalAnswer");
    expect(result.proposalEvent.payload).not.toHaveProperty("truthSummary");
  });

  it("does not require object target ids to be ledger event ids", () => {
    const eventStore = createStore();
    appendBasisEvent(eventStore);

    const result = proposeProcessProposal(
      {
        sessionId: "session-1",
        authorId: "system",
        proposal: {
          ...processProposal(),
          targetIds: ["candidate-object-1"]
        }
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["process-proposal-event-1"])
      }
    );

    expect(result.proposalEvent).toMatchObject({
      basedOnEventIds: [],
      payload: {
        targetIds: ["candidate-object-1"]
      }
    });
  });

  it("returns the stored proposal event on idempotent process proposal retry", () => {
    const eventStore = createStore();
    appendBasisEvent(eventStore);
    const first = proposeProcessProposal(
      {
        sessionId: "session-1",
        authorId: "system",
        proposal: processProposal(),
        basedOnEventIds: ["basis-event-1"],
        idempotencyKey: "same-process-proposal"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["process-proposal-event-1"])
      }
    );
    const retry = proposeProcessProposal(
      {
        sessionId: "session-1",
        authorId: "system",
        proposal: processProposal(),
        basedOnEventIds: ["basis-event-1"],
        idempotencyKey: "same-process-proposal"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["process-proposal-event-2"])
      }
    );

    expect(first.appended).toBe(true);
    expect(retry.appended).toBe(false);
    expect(retry.proposalEvent).toEqual(first.proposalEvent);
    expect(
      eventStore
        .listEvents("session-1")
        .filter((event) => event.type === PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE)
    ).toHaveLength(1);
  });

  it("rejects process proposal material that is not initially proposed", () => {
    const eventStore = createStore();
    appendBasisEvent(eventStore);

    expect(() =>
      proposeProcessProposal(
        {
          sessionId: "session-1",
          authorId: "system",
          proposal: {
            ...processProposal(),
            status: "accepted"
          },
          basedOnEventIds: ["basis-event-1"]
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["process-proposal-event-1"])
        }
      )
    ).toThrow(InvalidProcessProposalInputError);
  });

  it("validates explicit basis events before writing process proposals", () => {
    const eventStore = createStore();
    appendBasisEvent(eventStore);

    expect(() =>
      proposeProcessProposal(
        {
          sessionId: "session-1",
          authorId: "system",
          proposal: {
            ...processProposal(),
            targetIds: ["object-id-not-an-event"]
          },
          basedOnEventIds: ["missing-basis-event"]
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["process-proposal-event-1"])
        }
      )
    ).toThrow(ProcessProposalBasisEventNotFoundError);
  });

  it("records challenge and decision events without mutating the original proposal payload", () => {
    const eventStore = createStore();
    const proposed = proposeBasicProcessProposal(eventStore);
    const challenged = challengeProcessProposal(
      {
        sessionId: "session-1",
        targetProcessProposalEventId: proposed.proposalEvent.id,
        authorId: "reviewer-1",
        reason: "The target primitive may need more evidence first."
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
      }
    );
    const decided = decideProcessProposal(
      {
        sessionId: "session-1",
        targetProcessProposalEventId: proposed.proposalEvent.id,
        authorId: "reviewer-2",
        status: "deferred",
        rationale: "Defer until the current evidence gap is closed."
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["decision-1", "decision-event-1"])
      }
    );
    const projection = projectProcessProposalStates({
      eventStore,
      sessionId: "session-1"
    });

    expect(challenged.challengeEvent).toMatchObject({
      type: PROCESS_PROPOSAL_CHALLENGED_EVENT_TYPE,
      basedOnEventIds: [proposed.proposalEvent.id],
      payload: {
        targetProcessProposalEventId: proposed.proposalEvent.id,
        status: "challenged"
      }
    });
    expect(decided.decisionEvent).toMatchObject({
      type: PROCESS_PROPOSAL_DECIDED_EVENT_TYPE,
      basedOnEventIds: [proposed.proposalEvent.id],
      payload: {
        targetProcessProposalEventId: proposed.proposalEvent.id,
        status: "deferred"
      }
    });
    expect(proposed.proposalEvent.payload.status).toBe("proposed");
    expect(projection.proposalStates).toEqual([
      expect.objectContaining({
        proposalEventId: proposed.proposalEvent.id,
        latestStatus: "deferred",
        challengeEventIds: [challenged.challengeEvent.id],
        decisionEventIds: [decided.decisionEvent.id]
      })
    ]);
  });

  it("accepts and rejects process proposals only as process decisions", () => {
    const eventStore = createStore();
    const proposed = proposeBasicProcessProposal(eventStore);
    const accepted = decideProcessProposal(
      {
        sessionId: "session-1",
        targetProcessProposalEventId: proposed.proposalEvent.id,
        authorId: "reviewer-1",
        status: "accepted",
        rationale: "Accept this as the next process step."
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["accepted-1", "accepted-event-1"])
      }
    );
    const rejected = decideProcessProposal(
      {
        sessionId: "session-1",
        targetProcessProposalEventId: proposed.proposalEvent.id,
        authorId: "reviewer-2",
        status: "rejected",
        rationale: "Later process review rejected it."
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["rejected-1", "rejected-event-1"])
      }
    );
    const projection = projectProcessProposalStates({
      eventStore,
      sessionId: "session-1"
    });

    expect(accepted.decisionEvent.payload.status).toBe("accepted");
    expect(rejected.decisionEvent.payload.status).toBe("rejected");
    expect(projection.proposalStates[0]).toMatchObject({
      latestStatus: "rejected",
      decisionEventIds: [accepted.decisionEvent.id, rejected.decisionEvent.id]
    });
    expect(eventStore.listEvents("session-1").map((event) => event.type)).not.toContain(
      "sealed_batch_opened"
    );
  });

  it("rejects lifecycle events targeting non-process proposal events or another session", () => {
    const eventStore = createStore();
    appendBasisEvent(eventStore);
    const otherEvent = eventStore.appendEvent({
      id: "other-event",
      sessionId: "session-1",
      schemaVersion: "1",
      type: "extraction_proposed",
      authorId: "participant-1",
      createdAt: "2026-06-10T00:00:01.000Z",
      basedOnEventIds: ["basis-event-1"],
      visibility: "public",
      trace: {},
      payload: {}
    });
    const otherSessionProposal = eventStore.appendEvent({
      id: "other-session-process-proposal",
      sessionId: "session-2",
      schemaVersion: "1",
      type: PROCESS_PROPOSAL_PROPOSED_EVENT_TYPE,
      authorId: "system",
      createdAt: "2026-06-10T00:00:01.000Z",
      basedOnEventIds: [],
      visibility: "public",
      trace: {},
      payload: processProposal()
    });

    expect(() =>
      challengeProcessProposal(
        {
          sessionId: "session-1",
          targetProcessProposalEventId: "missing-process-proposal",
          authorId: "reviewer-1",
          reason: "Missing target."
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
        }
      )
    ).toThrow(ProcessProposalEventNotFoundError);
    expect(() =>
      challengeProcessProposal(
        {
          sessionId: "session-1",
          targetProcessProposalEventId: otherEvent.id,
          authorId: "reviewer-1",
          reason: "Wrong target type."
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["challenge-1", "challenge-event-1"])
        }
      )
    ).toThrow(InvalidProcessProposalTargetError);
    expect(() =>
      decideProcessProposal(
        {
          sessionId: "session-1",
          targetProcessProposalEventId: otherSessionProposal.id,
          authorId: "reviewer-1",
          status: "accepted",
          rationale: "Wrong session."
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["decision-1", "decision-event-1"])
        }
      )
    ).toThrow(InvalidProcessProposalTargetError);
  });
});
