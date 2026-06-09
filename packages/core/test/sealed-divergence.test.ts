import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  DuplicateSealedContributionError,
  IncompleteSealedBatchError,
  SEALED_BATCH_OPENED_EVENT_TYPE,
  SEALED_BATCH_REVEALED_EVENT_TYPE,
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
  SealedBatchAlreadyClosedError,
  SealedBatchNotFoundError,
  SealedDivergenceService,
  UnauthorizedSealedContributionError,
  UnsupportedRevealPolicyError,
  closeSealedBatch,
  openSealedBatch,
  submitSealedContribution
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

describe("sealed divergence lifecycle", () => {
  it("opens a sealed batch with one public system event", () => {
    const eventStore = createStore();

    const result = openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1", "participant-2"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"]),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    const events = eventStore.listEvents("session-1");
    expect(events).toHaveLength(1);
    expect(result.batchId).toBe("batch-1");
    expect(result.openedEvent.type).toBe(SEALED_BATCH_OPENED_EVENT_TYPE);
    expect(result.openedEvent.authorId).toBe("system");
    expect(result.openedEvent.visibility).toBe("public");
    expect(result.openedEvent.batchId).toBe("batch-1");
    expect(result.openedEvent.payload).toEqual({
      id: "batch-1",
      sessionId: "session-1",
      purpose: "initial_divergence",
      status: "open",
      participantIds: ["participant-1", "participant-2"],
      openedAt: "2026-06-10T00:00:00.000Z",
      revealPolicy: "all_completed"
    });
  });

  it("submits sealed participant contributions with exact payload and batch id", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"]),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    const contributionPayload = {
      content: "independent contribution",
      nested: {
        score: 1
      }
    };
    const result = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-1",
        visibility: "sealed",
        payload: contributionPayload
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-1"]),
        clock: () => "2026-06-10T00:00:01.000Z"
      }
    );

    expect(result.contributionEvent.type).toBe(SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE);
    expect(result.contributionEvent.authorId).toBe("participant-1");
    expect(result.contributionEvent.batchId).toBe("batch-1");
    expect(result.contributionEvent.visibility).toBe("sealed");
    expect(result.contributionEvent.payload).toEqual(contributionPayload);
  });

  it("rejects unauthorized contributors when participantIds is non-empty", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );

    expect(() =>
      submitSealedContribution(
        {
          sessionId: "session-1",
          batchId: "batch-1",
          authorId: "participant-2",
          visibility: "sealed",
          payload: "sealed"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["contribution-event-1"])
        }
      )
    ).toThrow(UnauthorizedSealedContributionError);
  });

  it("allows any participant author when participantIds is empty", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );

    const result = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-any",
        visibility: "sealed",
        payload: "sealed"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-1"])
      }
    );

    expect(result.contributionEvent.authorId).toBe("participant-any");
  });

  it("rejects duplicate participant contributions except same idempotency key", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );

    const first = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-1",
        visibility: "sealed",
        payload: "sealed",
        idempotencyKey: "same-logical-contribution"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-1"])
      }
    );

    const sameLogical = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-1",
        visibility: "sealed",
        payload: "ignored duplicate",
        idempotencyKey: "same-logical-contribution"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-2"])
      }
    );

    expect(sameLogical.contributionEvent).toEqual(first.contributionEvent);
    expect(eventStore.listEventsByBatch("session-1", "batch-1")).toHaveLength(2);

    expect(() =>
      submitSealedContribution(
        {
          sessionId: "session-1",
          batchId: "batch-1",
          authorId: "participant-1",
          visibility: "sealed",
          payload: "second contribution"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["contribution-event-3"])
        }
      )
    ).toThrow(DuplicateSealedContributionError);
  });

  it("allows one contribution each from multiple listed participants", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1", "participant-2"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );

    const first = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-1",
        visibility: "sealed",
        payload: "first"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-1"])
      }
    );
    const second = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-2",
        visibility: "sealed",
        payload: "second"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-2"])
      }
    );

    expect(first.contributionEvent.authorId).toBe("participant-1");
    expect(second.contributionEvent.authorId).toBe("participant-2");
  });

  it("requires all listed participants before closing all_completed batches", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1", "participant-2"],
        revealPolicy: "all_completed"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );
    submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-1",
        visibility: "sealed",
        payload: "first"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-1"])
      }
    );

    expect(() =>
      closeSealedBatch(
        {
          sessionId: "session-1",
          batchId: "batch-1"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["reveal-event-1"])
        }
      )
    ).toThrow(IncompleteSealedBatchError);

    submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-2",
        visibility: "sealed",
        payload: "second"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-2"])
      }
    );

    const result = closeSealedBatch(
      {
        sessionId: "session-1",
        batchId: "batch-1"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["reveal-event-1"])
      }
    );

    expect(result.revealedEvent.type).toBe(SEALED_BATCH_REVEALED_EVENT_TYPE);
  });

  it("allows manual close before all listed participants contribute", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1", "participant-2"],
        revealPolicy: "manual"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );

    const result = closeSealedBatch(
      {
        sessionId: "session-1",
        batchId: "batch-1"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["reveal-event-1"])
      }
    );

    expect(result.revealedEvent.payload.status).toBe("revealed");
    expect(result.revealedEvent.payload.revealPolicy).toBe("manual");
  });

  it("rejects quorum and deadline close attempts as unsupported in Stage 4", () => {
    for (const revealPolicy of ["quorum", "deadline"] as const) {
      const eventStore = createStore();
      openSealedBatch(
        {
          sessionId: "session-1",
          purpose: "initial_divergence",
          revealPolicy
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
        }
      );

      expect(() =>
        closeSealedBatch(
          {
            sessionId: "session-1",
            batchId: "batch-1"
          },
          {
            eventStore,
            idGenerator: createDeterministicIds(["reveal-event-1"])
          }
        )
      ).toThrow(UnsupportedRevealPolicyError);
    }
  });

  it("keeps sealed contribution events unchanged after reveal", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );
    const contribution = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-1",
        visibility: "sealed",
        payload: {
          content: "sealed payload"
        }
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-1"])
      }
    ).contributionEvent;
    const beforeClose = eventStore.getEvent("contribution-event-1");

    closeSealedBatch(
      {
        sessionId: "session-1",
        batchId: "batch-1"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["reveal-event-1"])
      }
    );

    const afterClose = eventStore.getEvent("contribution-event-1");
    expect(afterClose).toEqual(beforeClose);
    expect(afterClose).toEqual(contribution);
    expect(afterClose?.visibility).toBe("sealed");
  });

  it("reveals with a separate public system event that references contribution event ids", () => {
    const eventStore = createStore();
    const opened = openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: ["participant-1"]
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );
    const contribution = submitSealedContribution(
      {
        sessionId: "session-1",
        batchId: "batch-1",
        authorId: "participant-1",
        visibility: "sealed",
        payload: {
          content: "sealed payload"
        }
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["contribution-event-1"])
      }
    );

    const revealed = closeSealedBatch(
      {
        sessionId: "session-1",
        batchId: "batch-1"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["reveal-event-1"])
      }
    ).revealedEvent;

    expect(revealed.type).toBe(SEALED_BATCH_REVEALED_EVENT_TYPE);
    expect(revealed.authorId).toBe("system");
    expect(revealed.visibility).toBe("public");
    expect(revealed.basedOnEventIds).toEqual([
      opened.openedEvent.id,
      contribution.contributionEvent.id
    ]);
    expect(revealed.payload).not.toHaveProperty("content");
  });

  it("rejects duplicate close attempts", () => {
    const eventStore = createStore();
    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence",
        participantIds: []
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );

    closeSealedBatch(
      {
        sessionId: "session-1",
        batchId: "batch-1"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["reveal-event-1"])
      }
    );

    expect(() =>
      closeSealedBatch(
        {
          sessionId: "session-1",
          batchId: "batch-1"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["reveal-event-2"])
        }
      )
    ).toThrow(SealedBatchAlreadyClosedError);
  });

  it("rejects missing batch and already revealed batch submissions", () => {
    const eventStore = createStore();
    expect(() =>
      submitSealedContribution(
        {
          sessionId: "session-1",
          batchId: "missing-batch",
          authorId: "participant-1",
          visibility: "sealed",
          payload: "sealed"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["contribution-event-1"])
        }
      )
    ).toThrow(SealedBatchNotFoundError);

    openSealedBatch(
      {
        sessionId: "session-1",
        purpose: "initial_divergence"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["batch-1", "open-event-1"])
      }
    );
    closeSealedBatch(
      {
        sessionId: "session-1",
        batchId: "batch-1"
      },
      {
        eventStore,
        idGenerator: createDeterministicIds(["reveal-event-1"])
      }
    );

    expect(() =>
      submitSealedContribution(
        {
          sessionId: "session-1",
          batchId: "batch-1",
          authorId: "participant-1",
          visibility: "sealed",
          payload: "sealed"
        },
        {
          eventStore,
          idGenerator: createDeterministicIds(["contribution-event-2"])
        }
      )
    ).toThrow(SealedBatchAlreadyClosedError);
  });

  it("supports SealedDivergenceService dependency injection wrapper", () => {
    const eventStore = createStore();
    const service = new SealedDivergenceService({
      eventStore,
      idGenerator: createDeterministicIds(["batch-1", "open-event-1", "reveal-event-1"])
    });

    const opened = service.openSealedBatch({
      sessionId: "session-1",
      purpose: "initial_divergence",
      revealPolicy: "manual"
    });
    const closed = service.closeSealedBatch({
      sessionId: "session-1",
      batchId: opened.batchId
    });

    expect(closed.revealedEvent.type).toBe(SEALED_BATCH_REVEALED_EVENT_TYPE);
  });
});

describe("core sealed divergence architecture surface", () => {
  it("does not export ranking, frontier, objection ledger, projection, judge, vote, chat, adapter, daemon, CLI, WebGET, or Web UI APIs", () => {
    expect("RankingEngine" in core).toBe(false);
    expect("CandidateFrontier" in core).toBe(false);
    expect("ObjectionLedger" in core).toBe(false);
    expect("QualityObligationProjection" in core).toBe(false);
    expect("Projection" in core).toBe(false);
    expect("Judge" in core).toBe(false);
    expect("VoteWinner" in core).toBe(false);
    expect("CurrentBest" in core).toBe(false);
    expect("CentralRanker" in core).toBe(false);
    expect("TruthSummary" in core).toBe(false);
    expect("ChatMessage" in core).toBe(false);
    expect("Adapter" in core).toBe(false);
    expect("DaemonRoute" in core).toBe(false);
    expect("CliCommand" in core).toBe(false);
    expect("WebGET" in core).toBe(false);
    expect("WebUI" in core).toBe(false);
  });
});
