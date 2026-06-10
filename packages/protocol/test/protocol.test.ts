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

  it("keeps extraction proposals status-bearing and source-traceable", () => {
    const claim: protocol.ExtractionClaim = {
      id: "claim-1",
      content: "A factual claim",
      scope: "factual",
      sourceEventIds: ["event-1"]
    };
    const objection: protocol.ExtractionObjection = {
      id: "objection-1",
      targetId: "candidate-a",
      failureMode: "Failure mode",
      consequence: "Consequence",
      severityClaim: "major",
      status: "open",
      sourceEventIds: ["event-1"]
    };
    const evidenceNeed: protocol.ExtractionEvidenceNeed = {
      id: "evidence-need-1",
      targetClaimId: "claim-1",
      requiredKind: "web",
      reason: "Verify the claim",
      priority: "high",
      status: "open",
      sourceEventIds: ["event-1"]
    };
    const qualityObligation: protocol.ExtractionQualityObligation = {
      id: "quality-obligation-1",
      scope: "candidate",
      targetCandidateId: "candidate-a",
      requirement: "Address the failure mode",
      status: "unanswered",
      sourceEventIds: ["event-1"],
      supportingRefIds: [],
      unresolvedObjectionIds: ["objection-1"]
    };

    expect(
      protocol.ExtractionProposalSchema.safeParse({
        id: "extraction-proposal-1",
        sourceEventIds: ["event-1"],
        candidates: [candidateA],
        claims: [claim],
        objections: [objection],
        evidenceNeeds: [evidenceNeed],
        qualityObligations: [qualityObligation],
        rationale: "Extraction rationale",
        status: "proposed"
      }).success
    ).toBe(true);

    expect(
      protocol.ExtractionProposalSchema.safeParse({
        id: "extraction-proposal-1",
        sourceEventIds: ["event-1"],
        candidates: [{ ...candidateA, sourceEventIds: [] }],
        claims: [],
        objections: [],
        evidenceNeeds: [],
        qualityObligations: [],
        rationale: "Extraction rationale",
        status: "proposed"
      }).success
    ).toBe(false);
  });

  it("requires EvidenceNeed source event references", () => {
    expect(
      protocol.EvidenceNeedSchema.safeParse({
        id: "evidence-need-1",
        targetClaimId: "claim-1",
        requiredKind: "web",
        reason: "Verify the claim",
        priority: "high",
        status: "open",
        sourceEventIds: ["event-1"]
      }).success
    ).toBe(true);

    expect(
      protocol.EvidenceNeedSchema.safeParse({
        id: "evidence-need-1",
        targetClaimId: "claim-1",
        requiredKind: "web",
        reason: "Verify the claim",
        priority: "high",
        status: "open"
      }).success
    ).toBe(false);
  });

  it("validates proposal challenge and acceptance lifecycle payloads", () => {
    expect(
      protocol.ProposalChallengePayloadSchema.safeParse({
        id: "challenge-1",
        targetProposalEventId: "proposal-event-1",
        reason: "Challenge reason",
        status: "challenged"
      }).success
    ).toBe(true);

    expect(
      protocol.ProposalAcceptancePayloadSchema.safeParse({
        id: "acceptance-1",
        targetProposalEventId: "proposal-event-1",
        rationale: "Accepted for now",
        status: "accepted_for_now"
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

  it("keeps final candidate proposals status-bearing and source-traceable", () => {
    expect(
      protocol.FinalCandidateProposalSchema.safeParse({
        id: "final-candidate-proposal-1",
        candidateIds: ["candidate-a"],
        alternativeCandidateIds: ["candidate-b"],
        sourceEventIds: ["proposal-event-1", "acceptance-event-1"],
        recommendation: "Use candidate A when the stated constraints hold.",
        applicabilityConditions: ["Constraint set remains unchanged"],
        rationale: "Candidate A currently fits the accepted working state.",
        limitations: ["Unresolved objections remain"],
        status: "proposed"
      }).success
    ).toBe(true);

    expect(
      protocol.FinalCandidateProposalSchema.safeParse({
        id: "final-candidate-proposal-1",
        candidateIds: ["candidate-a"],
        alternativeCandidateIds: [],
        sourceEventIds: ["proposal-event-1"],
        recommendation: "Use candidate A",
        applicabilityConditions: [],
        rationale: "Rationale",
        limitations: [],
        currentBest: "candidate-a",
        status: "proposed"
      }).success
    ).toBe(false);
  });

  it("records final audits without verdict, winner, ranking, or final-answer fields", () => {
    expect(
      protocol.FinalAuditSchema.safeParse({
        id: "final-audit-1",
        targetFinalCandidateProposalEventId: "final-candidate-proposal-event-1",
        findings: ["The draft preserves the main unresolved objection."],
        risks: ["Compression may hide an edge case."],
        unresolvedObjectionIds: ["objection-1"],
        qualityObligationIds: ["quality-obligation-1"],
        evidenceNeedIds: ["evidence-need-1"],
        omissions: ["Alternative deployment condition needs more detail."],
        compressionProblems: ["Risk wording is shorter than source objections."],
        limitations: ["Audit does not verify evidence."],
        continuationSuggestions: ["Run an evidence check."],
        status: "recorded"
      }).success
    ).toBe(true);

    for (const forbiddenField of ["verdict", "winner", "score", "finalAnswer"] as const) {
      expect(
        protocol.FinalAuditSchema.safeParse({
          id: "final-audit-1",
          targetFinalCandidateProposalEventId: "final-candidate-proposal-event-1",
          findings: [],
          risks: [],
          unresolvedObjectionIds: [],
          qualityObligationIds: [],
          evidenceNeedIds: [],
          omissions: [],
          compressionProblems: [],
          limitations: [],
          continuationSuggestions: [],
          status: "recorded",
          [forbiddenField]: "not allowed"
        }).success
      ).toBe(false);
    }
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
