import { describe, expect, it } from "vitest";
import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  acceptProposal,
  projectCandidateFrontier,
  proposeExtraction
} from "@deliberum/core";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  CandidateRepairGeneratorRegistry,
  InMemoryRunStore,
  createDeliberationRun,
  runCandidateRepairRound
} from "../src";
import type {
  CandidateRepairContext,
  CandidateRepairGenerator,
  DeliberationRunRecord,
  ExtractionGeneratorResult
} from "../src";

function createRunPlan() {
  return {
    title: "Candidate repair coverage",
    topic: "How should Deliberum repair accepted candidates?",
    goals: ["Produce challengeable repair material."],
    constraints: ["Do not mutate Candidate Frontier without proposal acceptance."],
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
      expectations: ["Keep candidate repair proposals reviewable."]
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
      rationale: "Create accepted candidate material with repair gaps.",
      candidates: [
        {
          id: "candidate-1",
          title: "Candidate 1",
          description: "Candidate with known repair gaps.",
          sourceEventIds: [created.topicContractEvent.id],
          status: "active",
          supportedBy: ["claim-1"],
          attackedBy: ["objection-1"],
          qualityObligationIds: ["quality-1"],
          assumptions: [],
          tradeoffs: []
        }
      ],
      claims: [
        {
          id: "claim-1",
          content: "Candidate 1 is worth repairing.",
          scope: "design",
          sourceEventIds: [created.topicContractEvent.id],
          supports: ["candidate-1"]
        }
      ],
      objections: [
        {
          id: "objection-1",
          targetId: "candidate-1",
          failureMode: "The candidate does not answer an implementation constraint.",
          consequence: "Finalization would hide an unresolved risk.",
          severityClaim: "blocking",
          status: "open",
          sourceEventIds: [created.topicContractEvent.id],
          responses: []
        }
      ],
      evidenceNeeds: [],
      qualityObligations: [
        {
          id: "quality-1",
          scope: "candidate",
          targetCandidateId: "candidate-1",
          requirement: "Answer the implementation constraint before finalization.",
          status: "unanswered",
          sourceEventIds: [created.topicContractEvent.id],
          supportingRefIds: [],
          unresolvedObjectionIds: ["objection-1"]
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

function createRepairGenerator(): CandidateRepairGenerator {
  return {
    generatorId: "repair-generator-1",
    repairCandidate(_input, context) {
      return createRepairResult(context);
    }
  };
}

function createRepairResult(context: CandidateRepairContext): ExtractionGeneratorResult {
  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];

  return {
    candidates: [
      {
        id: "candidate-1-repair",
        title: "Candidate 1 repaired",
        description: "A repaired candidate proposed as challengeable material.",
        sourceEventIds,
        status: "active",
        supportedBy: ["claim-1-repair"],
        attackedBy: [],
        qualityObligationIds: ["quality-1-repair"],
        assumptions: ["The repair still requires proposal review."],
        tradeoffs: ["The original candidate remains active until review accepts a change."]
      }
    ],
    claims: [
      {
        id: "claim-1-repair",
        content: "The repaired candidate answers the known implementation constraint.",
        scope: "design",
        sourceEventIds,
        supports: ["candidate-1-repair"]
      }
    ],
    objections: [],
    evidenceNeeds: [],
    qualityObligations: [
      {
        id: "quality-1-repair",
        scope: "candidate",
        targetCandidateId: "candidate-1-repair",
        requirement: "Keep repaired candidate material reviewable before it changes state.",
        status: "answered",
        sourceEventIds,
        supportingRefIds: ["claim-1-repair"],
        unresolvedObjectionIds: []
      }
    ],
    rationale:
      "Propose a repaired candidate alternative without accepting it or finalizing the run."
  };
}

describe("runCandidateRepairRound", () => {
  it("proposes candidate repair material without accepting it or mutating the frontier", async () => {
    const { eventStore, runStore, run } = createReviewedRunFixture();
    const eventCountBefore = eventStore.listEvents(run.sessionId).length;
    const registry = new CandidateRepairGeneratorRegistry([createRepairGenerator()]);

    const result = await runCandidateRepairRound(
      {
        runId: run.id,
        targetCandidateIds: ["candidate-1"],
        generatorIds: ["repair-generator-1"]
      },
      {
        eventStore,
        runStore,
        candidateRepairGeneratorRegistry: registry,
        idGenerator: createIds(["repair-proposal-1", "repair-proposal-event-1"]),
        clock: () => "2026-06-12T00:00:03.000Z"
      }
    );

    expect(result.executionStatus).toBe("executed");
    expect(result.proposalResults).toEqual([
      expect.objectContaining({
        generatorId: "repair-generator-1",
        status: "proposed",
        proposalEventId: "repair-proposal-event-1",
        appended: true
      })
    ]);
    expect(result.run.candidateRepairRounds?.[0]).toMatchObject({
      roundId: "initial",
      targetCandidateIds: ["candidate-1"],
      status: "completed",
      proposalEventIds: ["repair-proposal-event-1"]
    });
    expect(
      eventStore
        .listEvents(run.sessionId)
        .filter((event) => event.type === EXTRACTION_PROPOSED_EVENT_TYPE)
    ).toHaveLength(2);
    expect(
      eventStore
        .listEvents(run.sessionId)
        .filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)
    ).toHaveLength(1);
    expect(
      projectCandidateFrontier({
        eventStore,
        sessionId: run.sessionId
      }).candidates.map((candidate) => candidate.object.id)
    ).toEqual(["candidate-1"]);

    const retry = await runCandidateRepairRound(
      {
        runId: run.id,
        targetCandidateIds: ["candidate-1"],
        generatorIds: ["repair-generator-1"]
      },
      {
        eventStore,
        runStore,
        candidateRepairGeneratorRegistry: registry,
        idGenerator: createIds(["unused-proposal", "unused-event"]),
        clock: () => "2026-06-12T00:00:04.000Z"
      }
    );

    expect(retry.executionStatus).toBe("already_completed");
    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCountBefore + 1);
  });

  it("rejects repair targets that are not accepted active candidates", async () => {
    const { eventStore, runStore, run } = createReviewedRunFixture();

    await expect(
      runCandidateRepairRound(
        {
          runId: run.id,
          targetCandidateIds: ["claim-1"],
          generatorIds: ["repair-generator-1"]
        },
        {
          eventStore,
          runStore,
          candidateRepairGeneratorRegistry: new CandidateRepairGeneratorRegistry([
            createRepairGenerator()
          ]),
          idGenerator: createIds([]),
          clock: () => "2026-06-12T00:00:03.000Z"
        }
      )
    ).rejects.toThrow("Candidate repair targets must be accepted active candidates.");
  });
});
