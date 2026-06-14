import {
  AdapterRegistry,
  CandidateRepairGeneratorRegistry,
  EvidenceCheckGeneratorRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  ProposalReviewGeneratorRegistry,
  type CandidateRepairContext,
  type CandidateRepairGenerator,
  type EvidenceCheckContext,
  type EvidenceCheckGenerator,
  type EvidenceCheckGeneratorResult,
  type ExtractionContext,
  type ExtractionGenerator,
  type ExtractionGeneratorResult,
  type FinalAuditGenerator,
  type FinalAuditGeneratorResult,
  type FinalCandidateGenerator,
  type FinalCandidateGeneratorResult,
  type FinalizationContext,
  type ProposalReviewGenerator,
  type ProposalReviewGeneratorResult,
  type RegisteredParticipantAdapter
} from "@deliberum/orchestrator";
import type { DaemonRunOrchestrationOptions, DaemonRunStartRequest } from "./run-orchestration";

export const LOCAL_PRESET_ENV_VAR = "DELIBERUM_ENABLE_LOCAL_PRESET" as const;

export const LOCAL_PRESET_IDS = {
  alphaAdapter: "local-preset-alpha",
  betaAdapter: "local-preset-beta",
  extractor: "local-preset-extractor",
  repairer: "local-preset-candidate-repairer",
  evidenceChecker: "local-preset-evidence-checker",
  reviewer: "local-preset-reviewer",
  finalCandidate: "local-preset-final-candidate",
  auditor: "local-preset-final-auditor"
} as const;

export type LocalPresetRunRegistries = Pick<
  DaemonRunOrchestrationOptions,
  | "adapterRegistry"
  | "extractionGeneratorRegistry"
  | "candidateRepairGeneratorRegistry"
  | "evidenceCheckGeneratorRegistry"
  | "proposalReviewGeneratorRegistry"
  | "finalCandidateGeneratorRegistry"
  | "finalAuditGeneratorRegistry"
>;

export function isLocalPresetEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[LOCAL_PRESET_ENV_VAR] === "true";
}

export function createLocalPresetRunRegistries(): Required<LocalPresetRunRegistries> {
  return {
    adapterRegistry: new AdapterRegistry([
      createLocalPresetParticipantAdapter(LOCAL_PRESET_IDS.alphaAdapter, {
        position:
          "Review the rollout in stages before relying on the recommendation.",
        reason:
          "The team should compare options, disagreements, risks, and missing evidence before acting."
      }),
      createLocalPresetParticipantAdapter(LOCAL_PRESET_IDS.betaAdapter, {
        position:
          "Keep the conclusion provisional until unresolved issues are checked.",
        reason:
          "A readable discussion should make remaining disagreements and next actions easy to inspect."
      })
    ]),
    extractionGeneratorRegistry: new ExtractionGeneratorRegistry([
      createLocalPresetExtractionGenerator()
    ]),
    candidateRepairGeneratorRegistry: new CandidateRepairGeneratorRegistry([
      createLocalPresetCandidateRepairGenerator()
    ]),
    evidenceCheckGeneratorRegistry: new EvidenceCheckGeneratorRegistry([
      createLocalPresetEvidenceCheckGenerator()
    ]),
    proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([
      createLocalPresetProposalReviewer()
    ]),
    finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry([
      createLocalPresetFinalCandidateGenerator()
    ]),
    finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([
      createLocalPresetFinalAuditGenerator()
    ])
  };
}

export function localPresetRunPlan() {
  return {
    title: "Guided sample discussion",
    topic: "Review a proposed rollout before relying on it.",
    goals: [
      "Compare the strongest review paths before relying on the rollout.",
      "Keep open disagreements, answer requirements, missing evidence, and the current conclusion visible."
    ],
    constraints: [
      "Use built-in sample participants only.",
      "Keep the conclusion provisional until a human reviews it."
    ],
    participants: [
      {
        id: "local-preset-alpha",
        kind: "model",
        displayName: "Perspective A",
        adapterId: LOCAL_PRESET_IDS.alphaAdapter
      },
      {
        id: "local-preset-beta",
        kind: "model",
        displayName: "Perspective B",
        adapterId: LOCAL_PRESET_IDS.betaAdapter
      }
    ],
    providerConfigs: [],
    budget: {
      maxEvents: 80,
      maxProviderCalls: 20
    },
    timeouts: {
      participantMs: 1000,
      overallMs: 30000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: [
        "Keep sample limitations visible.",
        "Preserve unresolved disagreements and missing evidence."
      ]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["local-preset-alpha", "local-preset-beta"]
    }
  };
}

export function localPresetStartRequest(): DaemonRunStartRequest {
  return {
    sealedDivergence: {
      autoCloseManual: true
    },
    extraction: {
      generatorIds: [LOCAL_PRESET_IDS.extractor]
    },
    review: {
      reviewerIds: [LOCAL_PRESET_IDS.reviewer],
      acceptancePolicy: {
        mode: "all_generated_unchallenged",
        authorId: "local-preset-review-coordinator",
        rationale:
          "Accept sample discussion material that has no open challenge in this walkthrough."
      }
    },
    finalization: {
      finalCandidateGeneratorId: LOCAL_PRESET_IDS.finalCandidate,
      auditGeneratorIds: [LOCAL_PRESET_IDS.auditor],
      compileOutcome: true
    }
  };
}

function createLocalPresetParticipantAdapter(
  adapterId: string,
  payload: Record<string, string>
): RegisteredParticipantAdapter {
  const capabilities = {
    input: {
      text: true,
      markdown: true,
      json: true,
      imageUrl: false,
      imageBase64: false,
      pdfUrl: false,
      fileUrl: false,
      webBrowsing: false
    },
    output: {
      structuredJson: true,
      markdown: true,
      streaming: false,
      manualPaste: false
    },
    limits: {},
    reliability: "high" as const
  };

  return {
    adapterId,
    capabilities,
    async prepareContribution(_input, context) {
      return {
        payload: {
          localPreset: true,
          label: "built-in sample contribution",
          ...payload,
          participantId: context.participantId
        },
        adapterId,
        participantId: context.participantId,
        capabilities,
        contextCompleteness: {
          status: "complete",
          notes: ["Built-in sample context for a guided walkthrough."]
        },
        warnings: ["Sample output is illustrative and should be replaced for real decisions."]
      };
    }
  };
}

function createLocalPresetExtractionGenerator(): ExtractionGenerator {
  return {
    generatorId: LOCAL_PRESET_IDS.extractor,
    generateExtractionProposal(_input, context) {
      return createLocalPresetExtractionResult(context);
    }
  };
}

function createLocalPresetExtractionResult(
  context: ExtractionContext
): ExtractionGeneratorResult {
  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];

  return {
    candidates: [
      {
        id: "local-preset-candidate-run-workspace",
        title: "Staged rollout review",
        description:
          "Review the rollout in stages, keep alternatives visible, and treat the conclusion as provisional until risks and evidence gaps are checked.",
        sourceEventIds,
        status: "active",
        supportedBy: ["local-preset-claim-control-surface"],
        attackedBy: ["local-preset-objection-preset-scope"],
        qualityObligationIds: ["local-preset-quality-labeling"],
        assumptions: ["This is a built-in sample walkthrough."],
        tradeoffs: ["The sample does not replace real participant or model input."]
      }
    ],
    claims: [
      {
        id: "local-preset-claim-control-surface",
        content:
          "A staged review helps the team compare options before relying on the rollout.",
        scope: "design",
        sourceEventIds,
        supports: ["local-preset-candidate-run-workspace"]
      }
    ],
    objections: [
      {
        id: "local-preset-objection-preset-scope",
        targetId: "local-preset-candidate-run-workspace",
        failureMode: "Users could rely on the sample conclusion without checking whether it matches their real rollout.",
        consequence: "The conclusion must keep limitations, disagreements, and next actions visible.",
        severityClaim: "major",
        status: "open",
        sourceEventIds,
        responses: []
      }
    ],
    qualityObligations: [
      {
        id: "local-preset-quality-labeling",
        scope: "candidate",
        targetCandidateId: "local-preset-candidate-run-workspace",
        requirement:
          "State that the conclusion is provisional and list what must be checked next.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: ["local-preset-claim-control-surface"],
        unresolvedObjectionIds: ["local-preset-objection-preset-scope"]
      }
    ],
    rationale:
      "Organize the first responses into reviewable options, disagreements, requirements, and evidence needs."
  };
}

function createLocalPresetCandidateRepairGenerator(): CandidateRepairGenerator {
  return {
    generatorId: LOCAL_PRESET_IDS.repairer,
    repairCandidate(_input, context) {
      return createLocalPresetCandidateRepairResult(context);
    }
  };
}

function createLocalPresetCandidateRepairResult(
  context: CandidateRepairContext
): ExtractionGeneratorResult {
  const targetCandidate = context.targetCandidates[0];

  if (!targetCandidate) {
    throw new Error("Expected target candidate in local preset repair context.");
  }

  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];
  const repairedCandidateId = `${targetCandidate.object.id}-repair`;
  const repairClaimId = `${repairedCandidateId}-claim`;
  const answeredQualityId = `${repairedCandidateId}-quality`;

  return {
    candidates: [
      {
        id: repairedCandidateId,
        title: `${targetCandidate.object.title} repair`,
        description:
          "A revised sample option that keeps limitations and review actions explicit.",
        sourceEventIds,
        status: "active",
        supportedBy: [repairClaimId],
        attackedBy: [],
        qualityObligationIds: [answeredQualityId],
        assumptions: [
          "The revised option remains built-in sample material.",
          "Acceptance still requires explicit proposal review."
        ],
        tradeoffs: [
          "The revised option improves labeling but still does not replace real decision input."
        ]
      }
    ],
    claims: [
      {
        id: repairClaimId,
        content:
          "The revised sample perspective answers sample-scope objections by preserving visible limitations.",
        scope: "design",
        sourceEventIds,
        supports: [repairedCandidateId]
      }
    ],
    objections: [],
    evidenceNeeds: [],
    qualityObligations: [
      {
        id: answeredQualityId,
        scope: "candidate",
        targetCandidateId: repairedCandidateId,
        requirement:
          "State that the revised sample perspective remains provisional review material.",
        status: "answered",
        sourceEventIds,
        supportingRefIds: [repairClaimId],
        unresolvedObjectionIds: []
      }
    ],
    rationale:
      "Generate a challengeable revised option without accepting or finalizing it."
  };
}

function createLocalPresetEvidenceCheckGenerator(): EvidenceCheckGenerator {
  return {
    generatorId: LOCAL_PRESET_IDS.evidenceChecker,
    checkEvidence(_input, context) {
      return createLocalPresetEvidenceCheckResult(context);
    }
  };
}

function createLocalPresetEvidenceCheckResult(
  context: EvidenceCheckContext
): EvidenceCheckGeneratorResult {
  return {
    results: context.targetEvidenceNeeds.map((evidenceNeed) => ({
      evidenceNeedId: evidenceNeed.object.id,
      source: "Built-in sample evidence source",
      summary: `Reported sample evidence result for ${evidenceNeed.object.id}; this is not independent verification.`,
      limitations: ["Built-in sample evidence is not independent verification."]
    })),
    rationale:
      "Record reported evidence check material without claiming independent verification."
  };
}

function createLocalPresetProposalReviewer(): ProposalReviewGenerator {
  return {
    reviewerId: LOCAL_PRESET_IDS.reviewer,
    reviewProposals(): ProposalReviewGeneratorResult {
      return {
        challenges: [],
        notes: [
          "Sample review leaves generated proposals unchallenged so the walkthrough can show the full discussion path."
        ]
      };
    }
  };
}

function createLocalPresetFinalCandidateGenerator(): FinalCandidateGenerator {
  return {
    generatorId: LOCAL_PRESET_IDS.finalCandidate,
    proposeFinalCandidate(_input, context): FinalCandidateGeneratorResult {
      const candidateId = context.frontier.candidates[0]?.object.id;

      if (!candidateId) {
        throw new Error("Expected accepted candidate in local preset run.");
      }

      return {
        candidateIds: [candidateId],
        recommendation:
          "Use a staged review path before relying on the rollout.",
        applicabilityConditions: [
          "When reviewing a proposed rollout with limited evidence.",
          "When the team needs a provisional decision and explicit next actions."
        ],
        rationale:
          "The discussion keeps the strongest option, open disagreement, evidence gaps, and review actions visible together.",
        limitations: [
          "This built-in sample is illustrative; replace it with real participant or model input for real decisions.",
          "The sample does not prove production readiness or real-world answer quality."
        ]
      };
    }
  };
}

function createLocalPresetFinalAuditGenerator(): FinalAuditGenerator {
  return {
    auditorId: LOCAL_PRESET_IDS.auditor,
    auditFinalCandidate(_input, context: FinalizationContext): FinalAuditGeneratorResult {
      return {
        findings: ["The current conclusion is reviewable but still provisional."],
        risks: [
          "A team could mistake the sample walkthrough for a decision about its real rollout."
        ],
        unresolvedObjectionIds: context.unresolvedObjectionIds,
        qualityObligationIds: context.qualityObligations.qualityObligations.map(
          (entry) => entry.object.id
        ),
        evidenceNeedIds: context.evidenceNeedIds,
        omissions: [
          "Real project evidence, stakeholder input, and provider-backed model perspectives were not included in this sample."
        ],
        compressionProblems: [],
        limitations: ["The current conclusion remains provisional."],
        continuationSuggestions: ["Run the discussion with the real rollout brief and real participants or model connections when ready."]
      };
    }
  };
}
