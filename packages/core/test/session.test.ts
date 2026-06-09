import { describe, expect, it } from "vitest";
import { InMemoryEventStore, type EventStore } from "@deliberum/storage";
import {
  InvalidTopicContractInputError,
  SessionService,
  TOPIC_CONTRACT_PUBLISHED_EVENT_TYPE,
  createSession
} from "../src";
import * as core from "../src";

const topicContract = {
  id: "topic-contract-1",
  title: "Session topic",
  topic: "Evaluate a decision",
  goals: ["Produce a traceable outcome"],
  constraints: ["Preserve unresolved objections"],
  outputExpectations: ["Return reasons and boundaries"],
  participantIds: ["human-1", "model-1", "tool-1"],
  allowedAdapters: ["manual"],
  budgetLease: {
    maxEvents: 10
  },
  governanceRules: [
    {
      canConfigureSession: true
    }
  ],
  resourcePolicy: {
    exposure: "private"
  }
};

function createDeterministicIds(ids = ["session-1", "event-1"]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function createStore() {
  return new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:01.000Z"
  });
}

describe("createSession", () => {
  it("appends exactly one system-authored Topic Contract event", () => {
    const eventStore = createStore();

    const result = createSession(
      { topicContract },
      {
        eventStore,
        idGenerator: createDeterministicIds(),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    expect(eventStore.listEvents(result.sessionId)).toHaveLength(1);
    expect(result.initialEvent.authorId).toBe("system");
    expect(result.initialEvent.type).toBe(TOPIC_CONTRACT_PUBLISHED_EVENT_TYPE);
    expect(result.initialEvent.payload).toEqual(topicContract);
  });

  it("uses EventStore-assigned sequence and recordedAt", () => {
    const eventStore = createStore();

    const result = createSession(
      { topicContract },
      {
        eventStore,
        idGenerator: createDeterministicIds(),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    expect(result.initialEvent.sequence).toBe(0);
    expect(result.initialEvent.createdAt).toBe("2026-06-10T00:00:00.000Z");
    expect(result.initialEvent.recordedAt).toBe("2026-06-10T00:00:01.000Z");
  });

  it("returns a sessionId matching the initial event sessionId", () => {
    const result = createSession(
      { topicContract },
      {
        eventStore: createStore(),
        idGenerator: createDeterministicIds(["session-custom", "event-custom"])
      }
    );

    expect(result.sessionId).toBe("session-custom");
    expect(result.initialEvent.sessionId).toBe("session-custom");
    expect(result.initialEvent.id).toBe("event-custom");
  });

  it("does not encode the creating human as privileged semantic authority", () => {
    const result = createSession(
      { topicContract },
      {
        eventStore: createStore(),
        idGenerator: createDeterministicIds()
      }
    );

    expect(result.initialEvent.payload.participantIds).toContain("human-1");
    expect(result.initialEvent).not.toHaveProperty("creatorId");
    expect(result.initialEvent).not.toHaveProperty("ownerId");
    expect(result.initialEvent).not.toHaveProperty("authorityId");
    expect(result.initialEvent.payload).not.toHaveProperty("creatorId");
    expect(result.initialEvent.payload).not.toHaveProperty("ownerId");
    expect(result.initialEvent.payload).not.toHaveProperty("authorityId");
    expect(result.initialEvent.payload).not.toHaveProperty("privilegedParticipantId");
  });

  it("rejects invalid Topic Contract input before appending", () => {
    let appendCalled = false;
    const eventStore = {
      appendEvent() {
        appendCalled = true;
        throw new Error("append should not be called");
      }
    } as unknown as EventStore;

    expect(() =>
      createSession(
        {
          topicContract: {
            ...topicContract,
            title: ""
          }
        },
        {
          eventStore,
          idGenerator: createDeterministicIds()
        }
      )
    ).toThrow(InvalidTopicContractInputError);
    expect(appendCalled).toBe(false);
  });

  it("supports SessionService dependency injection wrapper", () => {
    const eventStore = createStore();
    const service = new SessionService({
      eventStore,
      idGenerator: createDeterministicIds(["session-service", "event-service"]),
      clock: () => "2026-06-10T00:00:00.000Z"
    });

    const result = service.createSession({ topicContract });

    expect(result.sessionId).toBe("session-service");
    expect(eventStore.listEvents("session-service")).toHaveLength(1);
  });
});

describe("core architecture surface", () => {
  it("does not export judge, vote, current-best, ranker, truth-summary, or chat APIs", () => {
    expect("Judge" in core).toBe(false);
    expect("JudgeSchema" in core).toBe(false);
    expect("VoteWinner" in core).toBe(false);
    expect("VoteWinnerSchema" in core).toBe(false);
    expect("CurrentBest" in core).toBe(false);
    expect("CurrentBestSchema" in core).toBe(false);
    expect("CentralRanker" in core).toBe(false);
    expect("TruthSummary" in core).toBe(false);
    expect("ChatMessage" in core).toBe(false);
    expect("ChatMessageSchema" in core).toBe(false);
  });
});
