import { describe, expect, it } from "vitest";
import {
  EVIDENCE_RESULT_RECORDED_EVENT_TYPE,
  acceptProposal,
  compileOutcome,
  proposeExtraction
} from "@deliberum/core";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  EvidenceCheckGeneratorRegistry,
  InMemoryRunStore,
  createDeliberationRun,
  runEvidenceCheckRound
} from "../src";
import type {
  DeliberationRunRecord,
  EvidenceCheckContext,
  EvidenceCheckGenerator,
  EvidenceCheckGeneratorResult
} from "../src";

function createRunPlan() {
  return {
    title: "Evidence check coverage",
    topic: "How should Deliberum record evidence check results?",
    goals: ["Record reported evidence results without claiming final verification."],
    constraints: ["Do not turn evidence checks into a central truth authority."],
    participants: [
      {
        id: "participant-a",
        kind: "model",
        displayName: "Participant A",
        adapterId: "adapter-a"
      }
    ],
    providerConfigs: [],
    budget: {
      maxEvents: 40,
      maxProviderCalls: 10
    },
    timeouts: {
      participantMs: 1000,
      overallMs: 30000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: ["Keep evidence limitations visible."]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["participant-a"]
    }
  };
}

function createIds(ids: string[]) {
  let index = 0;

  return () => ids[index++] ?? `generated-${index}`;
}

function createReviewedRunFixture() {
  const eventStore = new InMemoryEventStore({
    clock: () => "2026-06-12T00:00:00.000Z"
  });
  const runStore = new InMemoryRunStore();
  const created = createDeliberationRun(
    {
      runPlan: createRunPlan()
    },
    {
      eventStore,
      runStore,
      idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "topic-event-1"]),
      clock: () => "2026-06-12T00:00:00.000Z"
    }
  );
  const proposed = proposeExtraction(
    {
      sessionId: created.run.sessionId,
      authorId: "extractor-1",
      rationale: "Create accepted evidence need material.",
      candidates: [
        {
          id: "candidate-1",
          title: "Candidate 1",
          description: "Candidate with a factual dependency.",
          sourceEventIds: [created.topicContractEvent.id],
          status: "active",
          supportedBy: ["claim-1"],
          attackedBy: [],
          qualityObligationIds: [],
          assumptions: [],
          tradeoffs: []
        }
      ],
      claims: [
        {
          id: "claim-1",
          content: "Candidate 1 depends on an externally checkable fact.",
          scope: "factual",
          sourceEventIds: [created.topicContractEvent.id],
          supports: ["candidate-1"]
        }
      ],
      evidenceNeeds: [
        {
          id: "evidence-need-1",
          targetClaimId: "claim-1",
          requiredKind: "tool",
          reason: "Check the external dependency before finalization.",
          priority: "high",
          status: "open",
          sourceEventIds: [created.topicContractEvent.id]
        }
      ]
    },
    {
      eventStore,
      idGenerator: createIds(["proposal-1", "proposal-event-1"]),
      clock: () => "2026-06-12T00:00:01.000Z"
    }
  );
  const accepted = acceptProposal(
    {
      sessionId: created.run.sessionId,
      targetProposalEventId: proposed.proposalEvent.id,
      authorId: "reviewer-1",
      rationale: "Accept fixture proposal material."
    },
    {
      eventStore,
      idGenerator: createIds(["acceptance-1", "acceptance-event-1"]),
      clock: () => "2026-06-12T00:00:02.000Z"
    }
  );
  const reviewedRun: DeliberationRunRecord = {
    ...created.run,
    status: "revealed",
    currentBatchId: "batch-1",
    sealedDivergenceRound: {
      roundId: "sealed-round-1",
      status: "revealed",
      batchId: "batch-1",
      openedEventId: "opened-event-1",
      revealedEventId: "revealed-event-1",
      participantDispatches: [],
      providerCallCount: 0
    },
    extractionRounds: [
      {
        roundId: "extraction-round-1",
        sourceSealedDivergenceRoundId: "sealed-round-1",
        status: "completed",
        generatorStates: [],
        proposalEventIds: [proposed.proposalEvent.id]
      }
    ],
    proposalReviewRounds: [
      {
        roundId: "review-round-1",
        sourceExtractionRoundId: "extraction-round-1",
        status: "completed",
        reviewerStates: [],
        proposalEventIds: [proposed.proposalEvent.id],
        challengeEventIds: [],
        acceptanceEventIds: [accepted.acceptanceEvent.id]
      }
    ]
  };

  runStore.updateRun(reviewedRun.id, () => reviewedRun);

  return {
    eventStore,
    runStore,
    run: reviewedRun
  };
}

function createEvidenceGenerator(): EvidenceCheckGenerator {
  return {
    generatorId: "evidence-generator-1",
    checkEvidence(_input, context) {
      return createEvidenceResult(context);
    }
  };
}

function createEvidenceResult(context: EvidenceCheckContext): EvidenceCheckGeneratorResult {
  return {
    results: context.targetEvidenceNeeds.map((evidenceNeed) => ({
      evidenceNeedId: evidenceNeed.object.id,
      source: "Deterministic test evidence source",
      summary: "Reported evidence result for the target evidence need.",
      limitations: ["This deterministic test result is not independent verification."]
    })),
    rationale: "Record reported evidence without turning it into final truth."
  };
}

describe("runEvidenceCheckRound", () => {
  it("records reported evidence results for accepted evidence needs", async () => {
    const { eventStore, runStore, run } = createReviewedRunFixture();
    const eventCountBefore = eventStore.listEvents(run.sessionId).length;
    const registry = new EvidenceCheckGeneratorRegistry([createEvidenceGenerator()]);

    const result = await runEvidenceCheckRound(
      {
        runId: run.id,
        targetEvidenceNeedIds: ["evidence-need-1"],
        generatorIds: ["evidence-generator-1"]
      },
      {
        eventStore,
        runStore,
        evidenceCheckGeneratorRegistry: registry,
        idGenerator: createIds(["evidence-result-1", "evidence-result-event-1"]),
        clock: () => "2026-06-12T00:00:03.000Z"
      }
    );

    expect(result.executionStatus).toBe("executed");
    expect(result.evidenceResults).toEqual([
      expect.objectContaining({
        generatorId: "evidence-generator-1",
        status: "recorded",
        evidenceResultEventIds: ["evidence-result-event-1"],
        appended: true
      })
    ]);
    expect(result.run.evidenceCheckRounds?.[0]).toMatchObject({
      roundId: "initial",
      targetEvidenceNeedIds: ["evidence-need-1"],
      status: "completed",
      evidenceResultEventIds: ["evidence-result-event-1"]
    });
    expect(
      eventStore
        .listEvents(run.sessionId)
        .filter((event) => event.type === EVIDENCE_RESULT_RECORDED_EVENT_TYPE)
    ).toHaveLength(1);
    expect(
      compileOutcome({
        eventStore,
        sessionId: run.sessionId
      }).evidenceStatus.evidenceNeeds[0]
    ).toMatchObject({
      status: "reported",
      evidenceResultEventIds: ["evidence-result-event-1"]
    });
    expect(JSON.stringify(eventStore.listEvents(run.sessionId))).not.toContain("verified");

    const retry = await runEvidenceCheckRound(
      {
        runId: run.id,
        targetEvidenceNeedIds: ["evidence-need-1"],
        generatorIds: ["evidence-generator-1"]
      },
      {
        eventStore,
        runStore,
        evidenceCheckGeneratorRegistry: registry,
        idGenerator: createIds(["unused-result", "unused-event"]),
        clock: () => "2026-06-12T00:00:04.000Z"
      }
    );

    expect(retry.executionStatus).toBe("already_completed");
    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCountBefore + 1);
  });

  it("rejects targets that are not accepted evidence needs", async () => {
    const { eventStore, runStore, run } = createReviewedRunFixture();

    await expect(
      runEvidenceCheckRound(
        {
          runId: run.id,
          targetEvidenceNeedIds: ["claim-1"],
          generatorIds: ["evidence-generator-1"]
        },
        {
          eventStore,
          runStore,
          evidenceCheckGeneratorRegistry: new EvidenceCheckGeneratorRegistry([
            createEvidenceGenerator()
          ]),
          idGenerator: createIds([]),
          clock: () => "2026-06-12T00:00:03.000Z"
        }
      )
    ).rejects.toThrow("Evidence check targets must be accepted evidence needs.");
  });
});
