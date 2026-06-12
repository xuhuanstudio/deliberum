import { describe, expect, it } from "vitest";
import {
  acceptProposal,
  proposeExtraction
} from "@deliberum/core";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  InMemoryRunStore,
  createDeliberationRun,
  suggestAdaptivePrimitiveProposals
} from "../src";
import type { DeliberationRunRecord } from "../src";

function createRunPlan() {
  return {
    title: "Adaptive primitive coverage",
    topic: "How should Deliberum choose the next deliberation primitive?",
    goals: ["Preserve challengeable process choices."],
    constraints: ["Do not introduce a central scheduler as semantic authority."],
    participants: [
      {
        id: "participant-a",
        kind: "model",
        displayName: "Participant A",
        adapterId: "adapter-a"
      },
      {
        id: "participant-b",
        kind: "model",
        displayName: "Participant B",
        adapterId: "adapter-b"
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
      expectations: ["Keep process proposals challengeable."]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["participant-a", "participant-b"]
    }
  };
}

function createIds(ids: string[]) {
  let index = 0;

  return () => ids[index++] ?? `generated-${index}`;
}

function createRunFixture() {
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

  return {
    eventStore,
    run: created.run,
    topicContractEventId: created.topicContractEvent.id
  };
}

function withRevealedAndReviewedRun(
  run: DeliberationRunRecord,
  proposalEventId: string,
  acceptanceEventId = "acceptance-event-1"
): DeliberationRunRecord {
  return {
    ...run,
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
        proposalEventIds: [proposalEventId]
      }
    ],
    proposalReviewRounds: [
      {
        roundId: "review-round-1",
        sourceExtractionRoundId: "extraction-round-1",
        status: "completed",
        reviewerStates: [],
        proposalEventIds: [proposalEventId],
        challengeEventIds: [],
        acceptanceEventIds: [acceptanceEventId]
      }
    ]
  };
}

function acceptExtractionWithObjects(options: {
  run: DeliberationRunRecord;
  eventStore: InMemoryEventStore;
  sourceEventId: string;
  includeGaps?: boolean;
}) {
  const proposal = proposeExtraction(
    {
      sessionId: options.run.sessionId,
      authorId: "extractor-1",
      rationale: "Create accepted deliberation objects for scheduler tests.",
      candidates: [
        {
          id: "candidate-1",
          title: "Candidate 1",
          description: "Candidate under adaptive primitive review.",
          sourceEventIds: [options.sourceEventId],
          status: "active",
          supportedBy: ["claim-1"],
          attackedBy: options.includeGaps ? ["objection-1"] : [],
          qualityObligationIds: options.includeGaps ? ["quality-1"] : [],
          assumptions: [],
          tradeoffs: []
        }
      ],
      claims: [
        {
          id: "claim-1",
          content: "Candidate 1 may be good enough to continue.",
          scope: "design",
          sourceEventIds: [options.sourceEventId],
          supports: ["candidate-1"]
        }
      ],
      evidenceNeeds: options.includeGaps
        ? [
            {
              id: "evidence-1",
              targetClaimId: "claim-1",
              requiredKind: "web",
              reason: "Verify a factual premise before finalization.",
              priority: "high",
              status: "open",
              sourceEventIds: [options.sourceEventId]
            }
          ]
        : [],
      objections: options.includeGaps
        ? [
            {
              id: "objection-1",
              targetId: "candidate-1",
              failureMode: "The candidate may ignore a blocking limitation.",
              consequence: "Finalization would hide unresolved risk.",
              severityClaim: "blocking",
              status: "open",
              sourceEventIds: [options.sourceEventId],
              responses: []
            }
          ]
        : [],
      qualityObligations: options.includeGaps
        ? [
            {
              id: "quality-1",
              scope: "candidate",
              targetCandidateId: "candidate-1",
              requirement: "Answer the blocking objection before finalization.",
              status: "unanswered",
              sourceEventIds: [options.sourceEventId],
              supportingRefIds: [],
              unresolvedObjectionIds: ["objection-1"]
            }
          ]
        : []
    },
    {
      eventStore: options.eventStore,
      idGenerator: createIds(["proposal-1", "proposal-event-1"]),
      clock: () => "2026-06-12T00:00:01.000Z"
    }
  );
  const accepted = acceptProposal(
    {
      sessionId: options.run.sessionId,
      targetProposalEventId: proposal.proposalEvent.id,
      authorId: "reviewer-1",
      rationale: "Accept fixture proposal material for scheduler tests."
    },
    {
      eventStore: options.eventStore,
      idGenerator: createIds(["acceptance-1", "acceptance-event-1"]),
      clock: () => "2026-06-12T00:00:02.000Z"
    }
  );

  return {
    proposalEventId: proposal.proposalEvent.id,
    acceptanceEventId: accepted.acceptanceEvent.id
  };
}

function acceptExtractionWithNonCandidateGaps(options: {
  run: DeliberationRunRecord;
  eventStore: InMemoryEventStore;
  sourceEventId: string;
}) {
  const proposal = proposeExtraction(
    {
      sessionId: options.run.sessionId,
      authorId: "extractor-1",
      rationale: "Create accepted non-candidate gaps for scheduler tests.",
      candidates: [
        {
          id: "candidate-1",
          title: "Candidate 1",
          description: "Candidate without candidate-targeted repair gaps.",
          sourceEventIds: [options.sourceEventId],
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
          content: "Candidate 1 depends on a process claim.",
          scope: "process",
          sourceEventIds: [options.sourceEventId],
          supports: ["candidate-1"]
        }
      ],
      evidenceNeeds: [],
      objections: [
        {
          id: "claim-objection-1",
          targetId: "claim-1",
          failureMode: "The process claim needs a separate answer.",
          consequence: "Candidate repair would target the wrong object.",
          severityClaim: "major",
          status: "open",
          sourceEventIds: [options.sourceEventId],
          responses: []
        }
      ],
      qualityObligations: [
        {
          id: "topic-quality-1",
          scope: "topic",
          requirement: "Clarify a topic-level quality bar.",
          status: "unanswered",
          sourceEventIds: [options.sourceEventId],
          supportingRefIds: ["claim-1"],
          unresolvedObjectionIds: ["claim-objection-1"]
        }
      ]
    },
    {
      eventStore: options.eventStore,
      idGenerator: createIds(["proposal-1", "proposal-event-1"]),
      clock: () => "2026-06-12T00:00:01.000Z"
    }
  );
  const accepted = acceptProposal(
    {
      sessionId: options.run.sessionId,
      targetProposalEventId: proposal.proposalEvent.id,
      authorId: "reviewer-1",
      rationale: "Accept fixture proposal material for scheduler tests."
    },
    {
      eventStore: options.eventStore,
      idGenerator: createIds(["acceptance-1", "acceptance-event-1"]),
      clock: () => "2026-06-12T00:00:02.000Z"
    }
  );

  return {
    proposalEventId: proposal.proposalEvent.id,
    acceptanceEventId: accepted.acceptanceEvent.id
  };
}

describe("suggestAdaptivePrimitiveProposals", () => {
  it("suggests sealed divergence for a new run without mutating the ledger", () => {
    const { eventStore, run } = createRunFixture();
    const eventCountBefore = eventStore.listEvents(run.sessionId).length;

    const result = suggestAdaptivePrimitiveProposals({ run, eventStore });

    expect(result).toMatchObject({
      runId: run.id,
      sessionId: run.sessionId,
      proposals: [
        {
          primitive: "sealed_divergence",
          targetIds: [run.topicContractEventId],
          status: "proposed"
        }
      ]
    });
    expect(result.proposals[0]?.id).toBe(
      suggestAdaptivePrimitiveProposals({ run, eventStore }).proposals[0]?.id
    );
    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCountBefore);
  });

  it("suggests evidence check and candidate repair for accepted unresolved gaps", () => {
    const { eventStore, run, topicContractEventId } = createRunFixture();
    const accepted = acceptExtractionWithObjects({
      run,
      eventStore,
      sourceEventId: topicContractEventId,
      includeGaps: true
    });
    const reviewedRun = withRevealedAndReviewedRun(
      run,
      accepted.proposalEventId,
      accepted.acceptanceEventId
    );

    const result = suggestAdaptivePrimitiveProposals({ run: reviewedRun, eventStore });

    expect(result.proposals.map((proposal) => proposal.primitive)).toEqual([
      "evidence_check",
      "candidate_repair"
    ]);
    expect(result.proposals[0]).toMatchObject({
      targetIds: ["evidence-1"],
      status: "proposed"
    });
    expect(result.proposals[1]).toMatchObject({
      targetIds: ["candidate-1"],
      status: "proposed"
    });
  });

  it("does not suggest candidate repair for non-candidate gaps", () => {
    const { eventStore, run, topicContractEventId } = createRunFixture();
    const accepted = acceptExtractionWithNonCandidateGaps({
      run,
      eventStore,
      sourceEventId: topicContractEventId
    });
    const reviewedRun = withRevealedAndReviewedRun(
      run,
      accepted.proposalEventId,
      accepted.acceptanceEventId
    );

    const result = suggestAdaptivePrimitiveProposals({ run: reviewedRun, eventStore });

    expect(result.proposals.map((proposal) => proposal.primitive)).not.toContain(
      "candidate_repair"
    );
    expect(result.proposals).toEqual([
      expect.objectContaining({
        primitive: "final_contest",
        targetIds: ["candidate-1"],
        status: "proposed"
      })
    ]);
  });

  it("suggests final contest only after accepted candidates have no open gaps", () => {
    const { eventStore, run, topicContractEventId } = createRunFixture();
    const accepted = acceptExtractionWithObjects({
      run,
      eventStore,
      sourceEventId: topicContractEventId
    });
    const reviewedRun = withRevealedAndReviewedRun(
      run,
      accepted.proposalEventId,
      accepted.acceptanceEventId
    );

    const result = suggestAdaptivePrimitiveProposals({ run: reviewedRun, eventStore });

    expect(result.proposals).toEqual([
      expect.objectContaining({
        primitive: "final_contest",
        targetIds: ["candidate-1"],
        status: "proposed"
      })
    ]);
  });

  it("suggests final audit for unaudited final candidate proposal material", () => {
    const { eventStore, run, topicContractEventId } = createRunFixture();
    const accepted = acceptExtractionWithObjects({
      run,
      eventStore,
      sourceEventId: topicContractEventId
    });
    const reviewedRun = withRevealedAndReviewedRun(
      run,
      accepted.proposalEventId,
      accepted.acceptanceEventId
    );
    const finalizationRun: DeliberationRunRecord = {
      ...reviewedRun,
      finalizationRounds: [
        {
          roundId: "final-round-1",
          sourceProposalReviewRoundId: "review-round-1",
          status: "waiting_for_auditors",
          finalCandidate: {
            sourceId: "final-generator-1",
            sourceType: "generator",
            status: "proposed",
            proposalEventId: "final-proposal-event-1",
            attempts: 1
          },
          auditorStates: [],
          finalCandidateProposalEventId: "final-proposal-event-1",
          auditEventIds: []
        }
      ]
    };

    const result = suggestAdaptivePrimitiveProposals({
      run: finalizationRun,
      eventStore
    });

    expect(result.proposals[0]).toMatchObject({
      primitive: "final_audit",
      targetIds: ["final-proposal-event-1"],
      status: "proposed"
    });
  });
});
