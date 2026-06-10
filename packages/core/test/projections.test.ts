import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  InvalidProjectionInputError,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  PROPOSAL_CHALLENGED_EVENT_TYPE,
  acceptProposal,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectExtractionProposalStates,
  projectQualityObligations,
  proposeExtraction
} from "../src";
import * as core from "../src";

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

function appendManualChallengeEvent(
  eventStore: InMemoryEventStore,
  {
    id = "challenge-event-1",
    sessionId = "session-1",
    targetProposalEventId = "proposal-event-1"
  } = {}
) {
  return eventStore.appendEvent({
    id,
    sessionId,
    schemaVersion: "1",
    type: PROPOSAL_CHALLENGED_EVENT_TYPE,
    authorId: "participant-3",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [targetProposalEventId],
    visibility: "public",
    trace: {},
    payload: {
      id: `${id}-payload`,
      targetProposalEventId,
      reason: "Manual challenge",
      status: "challenged"
    }
  });
}

function appendManualAcceptanceEvent(
  eventStore: InMemoryEventStore,
  {
    id = "acceptance-event-1",
    sessionId = "session-1",
    targetProposalEventId = "proposal-event-1"
  } = {}
) {
  return eventStore.appendEvent({
    id,
    sessionId,
    schemaVersion: "1",
    type: PROPOSAL_ACCEPTED_EVENT_TYPE,
    authorId: "participant-3",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [targetProposalEventId],
    visibility: "public",
    trace: {},
    payload: {
      id: `${id}-payload`,
      targetProposalEventId,
      rationale: "Manual acceptance",
      status: "accepted_for_now"
    }
  });
}

function candidate({
  id = "candidate-1",
  sourceEventId = "source-event-1",
  status = "active"
} = {}) {
  return {
    id,
    title: `Candidate ${id}`,
    description: "Candidate extracted from source",
    sourceEventIds: [sourceEventId],
    status,
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
    reason: "Verify the claim",
    priority: "high",
    status: "open",
    sourceEventIds: [sourceEventId]
  };
}

function qualityObligation({
  id = "quality-obligation-1",
  sourceEventId = "source-event-1",
  status = "unresolved"
} = {}) {
  return {
    id,
    scope: "candidate",
    targetCandidateId: "candidate-1",
    requirement: "Address the unresolved objection",
    status,
    sourceEventIds: [sourceEventId],
    supportingRefIds: [],
    unresolvedObjectionIds: ["objection-1"]
  };
}

function proposeAndAccept(
  eventStore: InMemoryEventStore,
  {
    proposalId = "proposal-1",
    proposalEventId = "proposal-event-1",
    acceptanceId = "acceptance-1",
    acceptanceEventId = "acceptance-event-1",
    sourceEventId = "source-event-1",
    candidateId = "candidate-1",
    candidateStatus = "active",
    includeAllObjects = false
  } = {}
) {
  appendSourceEvent(eventStore, { id: sourceEventId });
  const proposal = proposeExtraction(
    {
      sessionId: "session-1",
      authorId: "participant-2",
      candidates: [
        candidate({
          id: candidateId,
          sourceEventId,
          status: candidateStatus
        })
      ],
      claims: includeAllObjects ? [claim(sourceEventId)] : [],
      objections: includeAllObjects ? [objection(sourceEventId)] : [],
      evidenceNeeds: includeAllObjects ? [evidenceNeed(sourceEventId)] : [],
      qualityObligations: includeAllObjects
        ? [
            qualityObligation({
              sourceEventId,
              status: "unresolved"
            }),
            qualityObligation({
              id: "quality-obligation-2",
              sourceEventId,
              status: "challenged"
            })
          ]
        : [],
      rationale: "Extraction rationale"
    },
    {
      eventStore,
      idGenerator: createDeterministicIds([proposalId, proposalEventId])
    }
  ).proposalEvent;
  const acceptance = acceptProposal(
    {
      sessionId: "session-1",
      targetProposalEventId: proposal.id,
      authorId: "participant-3",
      rationale: "Accept for now"
    },
    {
      eventStore,
      idGenerator: createDeterministicIds([acceptanceId, acceptanceEventId])
    }
  ).acceptanceEvent;

  return {
    proposal,
    acceptance
  };
}

describe("projection input handling", () => {
  it("projects the same state from event arrays and eventStore/sessionId", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore);

    expect(
      projectAcceptedDeliberationObjects({
        events: [...eventStore.listEvents("session-1")].reverse()
      })
    ).toEqual(
      projectAcceptedDeliberationObjects({
        eventStore,
        sessionId: "session-1"
      })
    );
  });

  it("rejects mixed-session event arrays without an explicit sessionId", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore, { id: "source-event-1", sessionId: "session-1" });
    appendSourceEvent(eventStore, { id: "source-event-2", sessionId: "session-2" });

    expect(() =>
      projectExtractionProposalStates({
        events: [...eventStore.listEvents("session-1"), ...eventStore.listEvents("session-2")]
      })
    ).toThrow(InvalidProjectionInputError);
  });

  it("filters mixed event arrays when an explicit sessionId is provided", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore);
    appendSourceEvent(eventStore, { id: "source-event-2", sessionId: "session-2" });
    appendManualAcceptanceEvent(eventStore, {
      id: "cross-session-acceptance-event",
      sessionId: "session-2",
      targetProposalEventId: "proposal-event-1"
    });

    const states = projectExtractionProposalStates({
      events: [...eventStore.listEvents("session-1"), ...eventStore.listEvents("session-2")],
      sessionId: "session-1"
    });

    expect(states.proposalStates).toHaveLength(1);
    expect(states.proposalStates[0]?.acceptanceEventIds).toEqual(["acceptance-event-1"]);
  });

  it("sorts events by sequence before projection", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore);

    const states = projectExtractionProposalStates({
      events: [...eventStore.listEvents("session-1")].reverse()
    });

    expect(states.proposalStates[0]?.isAcceptedForNow).toBe(true);
    expect(states.proposalStates[0]?.acceptanceEventIds).toEqual(["acceptance-event-1"]);
  });

  it("adds projection metadata to every projection result", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore, { includeAllObjects: true });
    const expectedEventIds = eventStore.listEvents("session-1").map((event) => event.id);
    const expectedMetadata = {
      version: "1",
      eventRange: {
        fromSequence: 0,
        toSequence: eventStore.listEvents("session-1").at(-1)?.sequence
      },
      eventIds: expectedEventIds
    };

    expect(
      projectExtractionProposalStates({
        eventStore,
        sessionId: "session-1"
      })
    ).toMatchObject({
      proposalStates: expect.any(Array),
      projection: expectedMetadata
    });
    expect(
      projectAcceptedDeliberationObjects({
        eventStore,
        sessionId: "session-1"
      }).projection
    ).toEqual(expectedMetadata);
    expect(
      projectCandidateFrontier({
        eventStore,
        sessionId: "session-1"
      }).projection
    ).toEqual(expectedMetadata);
    expect(
      projectQualityObligations({
        eventStore,
        sessionId: "session-1"
      }).projection
    ).toEqual(expectedMetadata);
  });

  it("uses safe metadata for empty projection inputs", () => {
    const expectedMetadata = {
      version: "1",
      eventRange: null,
      eventIds: []
    };

    expect(projectExtractionProposalStates({ events: [] })).toEqual({
      proposalStates: [],
      projection: expectedMetadata
    });
    expect(projectAcceptedDeliberationObjects({ events: [] }).projection).toEqual(
      expectedMetadata
    );
    expect(projectCandidateFrontier({ events: [] }).projection).toEqual(expectedMetadata);
    expect(projectQualityObligations({ events: [] }).projection).toEqual(expectedMetadata);
  });

  it("computes projection event range and event ids after sequence sorting", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore);
    const sortedEvents = eventStore.listEvents("session-1");
    const projection = projectCandidateFrontier({
      events: [...sortedEvents].reverse()
    });

    expect(projection.projection).toEqual({
      version: "1",
      eventRange: {
        fromSequence: 0,
        toSequence: sortedEvents.at(-1)?.sequence
      },
      eventIds: sortedEvents.map((event) => event.id)
    });
  });
});

describe("projection lifecycle target handling", () => {
  it("does not let cross-session challenge or acceptance events affect proposal state", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore);
    appendManualChallengeEvent(eventStore, {
      id: "cross-session-challenge-event",
      sessionId: "session-2",
      targetProposalEventId: "proposal-event-1"
    });
    appendManualAcceptanceEvent(eventStore, {
      id: "cross-session-acceptance-event",
      sessionId: "session-2",
      targetProposalEventId: "proposal-event-1"
    });

    const states = projectExtractionProposalStates({
      events: [...eventStore.listEvents("session-1"), ...eventStore.listEvents("session-2")],
      sessionId: "session-1"
    });

    expect(states.proposalStates[0]?.challengeEventIds).toEqual([]);
    expect(states.proposalStates[0]?.acceptanceEventIds).toEqual(["acceptance-event-1"]);
  });

  it("does not let lifecycle events targeting non-extraction events affect proposal state", () => {
    const eventStore = createStore();
    const sourceEvent = appendSourceEvent(eventStore);
    proposeAndAccept(eventStore, {
      sourceEventId: "source-event-2",
      proposalEventId: "proposal-event-1"
    });
    appendManualChallengeEvent(eventStore, {
      id: "challenge-source-event",
      targetProposalEventId: sourceEvent.id
    });
    appendManualAcceptanceEvent(eventStore, {
      id: "accept-source-event",
      targetProposalEventId: sourceEvent.id
    });

    const states = projectExtractionProposalStates({
      eventStore,
      sessionId: "session-1"
    });

    expect(states.proposalStates[0]?.challengeEventIds).toEqual([]);
    expect(states.proposalStates[0]?.acceptanceEventIds).toEqual(["acceptance-event-1"]);
  });

  it("does not let lifecycle events targeting later proposal events affect proposal state", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);
    appendManualChallengeEvent(eventStore, {
      id: "early-challenge-event",
      targetProposalEventId: "proposal-event-1"
    });
    appendManualAcceptanceEvent(eventStore, {
      id: "early-acceptance-event",
      targetProposalEventId: "proposal-event-1"
    });
    proposeExtraction(
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
    );

    const states = projectExtractionProposalStates({
      eventStore,
      sessionId: "session-1"
    });

    expect(states.proposalStates[0]?.isChallenged).toBe(false);
    expect(states.proposalStates[0]?.isAcceptedForNow).toBe(false);
    expect(states.proposalStates[0]?.challengeEventIds).toEqual([]);
    expect(states.proposalStates[0]?.acceptanceEventIds).toEqual([]);
  });
});

describe("accepted deliberation object projections", () => {
  it("does not append events or mutate event payloads", () => {
    const eventStore = createStore();
    const { proposal } = proposeAndAccept(eventStore, { includeAllObjects: true });
    const beforeEvents = eventStore.listEvents("session-1");
    const beforeProposalEvent = eventStore.getEvent(proposal.id);

    const projected = projectAcceptedDeliberationObjects({
      eventStore,
      sessionId: "session-1"
    });
    projected.candidates[0]!.object.title = "Mutated projection output";

    expect(eventStore.listEvents("session-1")).toHaveLength(beforeEvents.length);
    expect(eventStore.getEvent(proposal.id)).toEqual(beforeProposalEvent);
  });

  it("keeps challenged proposals visible while accepted-for-now proposals contribute objects", () => {
    const eventStore = createStore();
    const { proposal } = proposeAndAccept(eventStore, { includeAllObjects: true });
    appendManualChallengeEvent(eventStore, {
      id: "challenge-event-1",
      targetProposalEventId: proposal.id
    });

    const states = projectExtractionProposalStates({
      eventStore,
      sessionId: "session-1"
    });
    const acceptedObjects = projectAcceptedDeliberationObjects({
      eventStore,
      sessionId: "session-1"
    });

    expect(states.proposalStates[0]?.isChallenged).toBe(true);
    expect(states.proposalStates[0]?.isAcceptedForNow).toBe(true);
    expect(acceptedObjects.candidates).toHaveLength(1);
    expect(acceptedObjects).not.toHaveProperty("finalAnswer");
    expect(acceptedObjects).not.toHaveProperty("truthSummary");
  });

  it("preserves objections as first-class derived records without auto-resolution", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore, { includeAllObjects: true });

    const acceptedObjects = projectAcceptedDeliberationObjects({
      eventStore,
      sessionId: "session-1"
    });

    expect(acceptedObjects.objections).toHaveLength(1);
    expect(acceptedObjects.objections[0]?.object.status).toBe("unresolved");
    expect(acceptedObjects.objections[0]?.proposalEventId).toBe("proposal-event-1");
    expect(acceptedObjects.objections[0]?.sourceEventIds).toEqual(["source-event-1"]);
  });
});

describe("candidate frontier projection", () => {
  it("is empty without accepted extraction proposals", () => {
    const eventStore = createStore();
    appendSourceEvent(eventStore);
    proposeExtraction(
      {
        sessionId: "session-1",
        authorId: "participant-2",
        candidates: [candidate()],
        rationale: "Unaccepted extraction"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["proposal-1", "proposal-event-1"])
      }
    );

    expect(
      projectCandidateFrontier({
        eventStore,
        sessionId: "session-1"
      })
    ).toEqual({
      basis: "accepted_active_candidates",
      candidates: [],
      projection: {
        version: "1",
        eventRange: {
          fromSequence: 0,
          toSequence: eventStore.listEvents("session-1").at(-1)?.sequence
        },
        eventIds: eventStore.listEvents("session-1").map((event) => event.id)
      }
    });
  });

  it("projects multiple accepted active candidates as a list without best/winner/rank fields", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore, {
      sourceEventId: "source-event-1",
      proposalId: "proposal-1",
      proposalEventId: "proposal-event-1",
      acceptanceId: "acceptance-1",
      acceptanceEventId: "acceptance-event-1",
      candidateId: "candidate-1"
    });
    proposeAndAccept(eventStore, {
      sourceEventId: "source-event-2",
      proposalId: "proposal-2",
      proposalEventId: "proposal-event-2",
      acceptanceId: "acceptance-2",
      acceptanceEventId: "acceptance-event-2",
      candidateId: "candidate-2"
    });

    const frontier = projectCandidateFrontier({
      eventStore,
      sessionId: "session-1"
    });

    expect(frontier.basis).toBe("accepted_active_candidates");
    expect(frontier.candidates.map((candidateRecord) => candidateRecord.object.id)).toEqual([
      "candidate-1",
      "candidate-2"
    ]);
    expect(frontier).not.toHaveProperty("currentBest");
    expect(frontier).not.toHaveProperty("winner");
    expect(frontier).not.toHaveProperty("rank");
    expect(frontier).not.toHaveProperty("score");
    expect(frontier).not.toHaveProperty("vote");
    expect(frontier.candidates[0]).not.toHaveProperty("winner");
    expect(frontier.candidates[0]).not.toHaveProperty("rank");
    expect(frontier.candidates[0]).not.toHaveProperty("score");
    expect(frontier.candidates[0]).not.toHaveProperty("vote");
  });

  it("filters non-active candidates from the accepted active candidate set", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore, {
      candidateStatus: "archived"
    });

    expect(
      projectCandidateFrontier({
        eventStore,
        sessionId: "session-1"
      }).candidates
    ).toEqual([]);
  });
});

describe("quality obligation projection", () => {
  it("keeps unresolved and challenged obligations visible with status preserved", () => {
    const eventStore = createStore();
    proposeAndAccept(eventStore, { includeAllObjects: true });

    const projection = projectQualityObligations({
      eventStore,
      sessionId: "session-1"
    });

    expect(projection.qualityObligations.map((record) => record.object.status)).toEqual([
      "unresolved",
      "challenged"
    ]);
    expect(projection.qualityObligations.map((record) => record.sourceEventIds)).toEqual([
      ["source-event-1"],
      ["source-event-1"]
    ]);
  });
});

describe("core projection architecture surface", () => {
  it("exports approved projection APIs without semantic-authority, ranking, voting, or truth APIs", () => {
    expect("projectExtractionProposalStates" in core).toBe(true);
    expect("projectAcceptedDeliberationObjects" in core).toBe(true);
    expect("projectCandidateFrontier" in core).toBe(true);
    expect("projectQualityObligations" in core).toBe(true);
    expect("Judge" in core).toBe(false);
    expect("VoteWinner" in core).toBe(false);
    expect("CurrentBest" in core).toBe(false);
    expect("currentBest" in core).toBe(false);
    expect("RankingEngine" in core).toBe(false);
    expect("CentralRanker" in core).toBe(false);
    expect("TruthSummary" in core).toBe(false);
    expect("winner" in core).toBe(false);
    expect("rank" in core).toBe(false);
    expect("score" in core).toBe(false);
    expect("vote" in core).toBe(false);
    expect("finalAnswer" in core).toBe(false);
    expect("truthSummary" in core).toBe(false);
    expect("Adapter" in core).toBe(false);
    expect("DaemonRoute" in core).toBe(false);
    expect("CliCommand" in core).toBe(false);
    expect("WebGET" in core).toBe(false);
    expect("WebUI" in core).toBe(false);
    expect("ChatMessage" in core).toBe(false);
  });
});
