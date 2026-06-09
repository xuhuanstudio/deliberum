import { describe, expect, it } from "vitest";
import * as protocol from "../src";

const candidateA: protocol.Candidate = {
  id: "candidate-a",
  title: "Candidate A",
  description: "First candidate",
  sourceEventIds: ["event-a"],
  status: "active",
  supportedBy: [],
  attackedBy: [],
  qualityObligationIds: [],
  assumptions: [],
  tradeoffs: []
};

const candidateB: protocol.Candidate = {
  id: "candidate-b",
  title: "Candidate B",
  description: "Second candidate",
  sourceEventIds: ["event-b"],
  status: "active",
  supportedBy: ["claim-a"],
  attackedBy: ["objection-a"],
  qualityObligationIds: ["obligation-a"],
  assumptions: ["Assumption"],
  tradeoffs: ["Tradeoff"]
};

const envelopePayload = {
  example: true
};

const eventEnvelope: protocol.EventEnvelope<typeof envelopePayload> = {
  id: "event-1",
  sessionId: "session-1",
  schemaVersion: "1",
  type: "example.event",
  sequence: 0,
  authorId: "system",
  createdAt: "2026-06-10T00:00:00.000Z",
  recordedAt: "2026-06-10T00:00:01.000Z",
  basedOnEventIds: [],
  visibility: "public",
  trace: {},
  payload: envelopePayload
};

describe("protocol event envelope", () => {
  it("requires traceable top-level fields", () => {
    expect(protocol.EventEnvelopeSchema.safeParse(eventEnvelope).success).toBe(true);

    const { id: _id, ...withoutId } = eventEnvelope;
    expect(protocol.EventEnvelopeSchema.safeParse(withoutId).success).toBe(false);

    const { basedOnEventIds: _basedOnEventIds, ...withoutBasedOn } = eventEnvelope;
    expect(protocol.EventEnvelopeSchema.safeParse(withoutBasedOn).success).toBe(false);

    const { recordedAt: _recordedAt, ...withoutRecordedAt } = eventEnvelope;
    expect(protocol.EventEnvelopeSchema.safeParse(withoutRecordedAt).success).toBe(false);

    const { trace: _trace, ...withoutTrace } = eventEnvelope;
    expect(protocol.EventEnvelopeSchema.safeParse(withoutTrace).success).toBe(false);
  });

  it("accepts an explicit empty trace object", () => {
    expect(
      protocol.EventEnvelopeSchema.safeParse({
        ...eventEnvelope,
        trace: {}
      }).success
    ).toBe(true);
  });

  it("accepts sealed visibility only when it is explicit", () => {
    expect(
      protocol.EventEnvelopeSchema.safeParse({
        ...eventEnvelope,
        visibility: "sealed",
        batchId: "sealed-batch-1"
      }).success
    ).toBe(true);

    const { visibility: _visibility, ...withoutVisibility } = eventEnvelope;
    expect(protocol.EventEnvelopeSchema.safeParse(withoutVisibility).success).toBe(false);
  });

  it("validates trace and integrity shape when present", () => {
    expect(
      protocol.EventEnvelopeSchema.safeParse({
        ...eventEnvelope,
        trace: {
          adapterId: "adapter-1",
          participantId: "participant-1",
          modelId: "model-1",
          contextCapsuleId: "capsule-1",
          resourceDeliveryIds: ["delivery-1"],
          promptHash: "prompt-hash",
          rawOutputHash: "raw-output-hash"
        },
        integrity: {
          previousEventHash: "previous-hash",
          eventHash: "event-hash"
        }
      }).success
    ).toBe(true);

    expect(
      protocol.EventEnvelopeSchema.safeParse({
        ...eventEnvelope,
        trace: {
          adapterId: "adapter-1",
          currentBest: "candidate-a"
        }
      }).success
    ).toBe(false);
  });
});

describe("minimal placeholder policy and capability schemas", () => {
  it("accepts simple JSON object fields without defining policy semantics", () => {
    const jsonPolicy = {
      label: "stage-one-placeholder",
      maxItems: 3,
      enabled: true,
      nested: {
        mode: "draft"
      },
      list: ["a", 1, false, null]
    };

    expect(protocol.BudgetLeaseSchema.safeParse(jsonPolicy).success).toBe(true);
    expect(protocol.GovernanceRuleSchema.safeParse(jsonPolicy).success).toBe(true);
    expect(protocol.ResourcePolicySchema.safeParse(jsonPolicy).success).toBe(true);
    expect(protocol.ParticipantCapabilitiesSchema.safeParse(jsonPolicy).success).toBe(true);
  });

  it("rejects non-JSON placeholder values", () => {
    expect(
      protocol.BudgetLeaseSchema.safeParse({
        unsupported: undefined
      }).success
    ).toBe(false);
  });
});

describe("proposal objects", () => {
  it("requires status-bearing semantic proposals", () => {
    expect(
      protocol.SummaryProposalSchema.safeParse({
        id: "summary-1",
        includedEventIds: ["event-1"],
        omittedEventIds: [],
        summary: "Summary draft",
        rationale: "Compression rationale",
        status: "challenged"
      }).success
    ).toBe(true);

    expect(
      protocol.SummaryProposalSchema.safeParse({
        id: "summary-1",
        includedEventIds: ["event-1"],
        omittedEventIds: [],
        summary: "Summary draft",
        rationale: "Compression rationale"
      }).success
    ).toBe(false);
  });

  it("keeps board views, rankings, process choices, merges, and final drafts challengeable", () => {
    expect(
      protocol.BoardViewProposalSchema.safeParse({
        id: "board-view-1",
        title: "Board view draft",
        boardObjectIds: ["board-object-1"],
        boardRelationIds: [],
        rationale: "Projection rationale",
        status: "challenged"
      }).success
    ).toBe(true);

    expect(
      protocol.RankingProposalSchema.safeParse({
        id: "ranking-1",
        targetIds: ["candidate-a", "candidate-b"],
        rationale: "Comparison rationale",
        status: "superseded"
      }).success
    ).toBe(true);

    expect(
      protocol.ProcessProposalSchema.safeParse({
        id: "process-1",
        primitive: "evidence_check",
        targetIds: ["claim-1"],
        expectedQualityGain: "Verification",
        riskIfSkipped: "Unverified factual claim",
        requestedBudget: {},
        status: "challenged"
      }).success
    ).toBe(true);

    expect(
      protocol.MergeProposalSchema.safeParse({
        id: "merge-1",
        targetIds: ["candidate-a", "candidate-b"],
        mergedObjectDraft: { draft: "not truth" },
        reason: "Overlap",
        status: "accepted_for_now"
      }).success
    ).toBe(true);

    expect(
      protocol.FinalDraftProposalSchema.safeParse({
        id: "final-draft-1",
        candidateIds: ["candidate-a", "candidate-b"],
        objectionIds: ["objection-a"],
        evidenceResultIds: ["evidence-result-a"],
        draft: "Final draft proposal",
        rationale: "Compilation rationale",
        status: "proposed"
      }).success
    ).toBe(true);
  });

  it("rejects truth-like fields on strict proposal objects", () => {
    expect(
      protocol.FinalDraftProposalSchema.safeParse({
        id: "final-draft-1",
        candidateIds: ["candidate-a"],
        objectionIds: [],
        evidenceResultIds: [],
        draft: "Final draft proposal",
        rationale: "Compilation rationale",
        status: "proposed",
        truthSummary: "authoritative"
      }).success
    ).toBe(false);
  });
});

describe("candidate frontier compatibility", () => {
  it("accepts multiple candidates as a list", () => {
    expect(protocol.CandidateListSchema.safeParse([candidateA, candidateB]).success).toBe(true);
  });

  it("does not accept singleton current-best structures as candidate lists", () => {
    expect(
      protocol.CandidateListSchema.safeParse({
        currentBest: candidateA
      }).success
    ).toBe(false);

    expect(
      protocol.CandidateSchema.safeParse({
        ...candidateA,
        currentBest: true
      }).success
    ).toBe(false);
  });
});

describe("forbidden schema exports", () => {
  it("does not export judge, vote-winner, current-best, central-ranker, or truth-summary schemas", () => {
    expect("JudgeSchema" in protocol).toBe(false);
    expect("VoteWinnerSchema" in protocol).toBe(false);
    expect("CurrentBestSchema" in protocol).toBe(false);
    expect("CentralRankerSchema" in protocol).toBe(false);
    expect("TruthSummarySchema" in protocol).toBe(false);
  });
});

describe("session lifecycle", () => {
  it("matches the documented protocol chain exactly", () => {
    expect(protocol.SessionLifecycleStateValues).toEqual([
      "created",
      "topic_contract_published",
      "initial_sealed_divergence_open",
      "initial_sealed_divergence_revealed",
      "structuring",
      "deliberating",
      "final_contest",
      "final_audit",
      "outcome_compiled",
      "archived"
    ]);

    expect(protocol.SessionLifecycleStateSchema.safeParse("paused").success).toBe(false);
    expect(protocol.SessionLifecycleStateSchema.safeParse("forked").success).toBe(false);
    expect(protocol.SessionLifecycleStateSchema.safeParse("provisionally_finalized").success).toBe(
      false
    );
  });
});

describe("sealed batch reveal policy", () => {
  it("accepts manual, quorum, and deadline reveal policy values", () => {
    for (const revealPolicy of ["manual", "quorum", "deadline"] as const) {
      expect(
        protocol.SealedBatchSchema.safeParse({
          id: `batch-${revealPolicy}`,
          sessionId: "session-1",
          purpose: "initial_divergence",
          status: "open",
          participantIds: [],
          openedAt: "2026-06-10T00:00:00.000Z",
          revealPolicy
        }).success
      ).toBe(true);
    }
  });
});
