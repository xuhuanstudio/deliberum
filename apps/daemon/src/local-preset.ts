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
          "Deterministic sample participant Alpha proposes a guarded review path.",
        reason:
          "This sample material exists for guided testing; it is canned, not real deliberation input."
      }),
      createLocalPresetParticipantAdapter(LOCAL_PRESET_IDS.betaAdapter, {
        position:
          "Deterministic sample participant Beta keeps unresolved issues visible.",
        reason:
          "The discussion should keep provisional output and explicit limitations visible."
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
      "Create traceable discussion material through the guided workflow.",
      "Show main perspectives, open disagreements, answer requirements, and the current conclusion."
    ],
    constraints: [
      "Use deterministic sample participants only.",
      "Keep all output provisional and labeled as sample material."
    ],
    participants: [
      {
        id: "local-preset-alpha",
        kind: "model",
        displayName: "Local preset Alpha",
        adapterId: LOCAL_PRESET_IDS.alphaAdapter
      },
      {
        id: "local-preset-beta",
        kind: "model",
        displayName: "Local preset Beta",
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
        "Render only deterministic sample material.",
        "Preserve limitations and unresolved issues."
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
          "Accept unchallenged deterministic sample proposals for this development walkthrough."
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
          label: "deterministic sample material",
          ...payload,
          participantId: context.participantId
        },
        adapterId,
        participantId: context.participantId,
        capabilities,
        contextCompleteness: {
          status: "complete",
          notes: ["Deterministic sample context for development and testing."]
        },
        warnings: ["Sample output is canned, not real deliberation input."]
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
        title: "Guided rollout review",
        description:
          "Use deterministic sample participants to exercise the discussion workflow.",
        sourceEventIds,
        status: "active",
        supportedBy: ["local-preset-claim-control-surface"],
        attackedBy: ["local-preset-objection-preset-scope"],
        qualityObligationIds: ["local-preset-quality-labeling"],
        assumptions: ["The workflow remains a deterministic sample."],
        tradeoffs: ["The sample does not represent real deliberation input."]
      }
    ],
    claims: [
      {
        id: "local-preset-claim-control-surface",
        content:
          "A deterministic sample can make the discussion workflow runnable while preserving deliberation boundaries.",
        scope: "design",
        sourceEventIds,
        supports: ["local-preset-candidate-run-workspace"]
      }
    ],
    objections: [
      {
        id: "local-preset-objection-preset-scope",
        targetId: "local-preset-candidate-run-workspace",
        failureMode: "Users could mistake deterministic sample material for real deliberation input.",
        consequence: "The UI and generated material must label sample output and limitations clearly.",
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
          "Clearly label sample output as deterministic review material.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: ["local-preset-claim-control-surface"],
        unresolvedObjectionIds: ["local-preset-objection-preset-scope"]
      }
    ],
    rationale:
      "Extract traceable sample proposal material from revealed deterministic contributions."
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
          "A deterministic sample repair alternative that keeps sample scope and limitations explicit.",
        sourceEventIds,
        status: "active",
        supportedBy: [repairClaimId],
        attackedBy: [],
        qualityObligationIds: [answeredQualityId],
        assumptions: [
          "The repair remains deterministic sample material.",
          "Acceptance still requires explicit proposal review."
        ],
        tradeoffs: [
          "The repaired alternative improves traceable labeling but does not represent real deliberation judgment."
        ]
      }
    ],
    claims: [
      {
        id: repairClaimId,
        content:
          "The repaired sample perspective explicitly answers sample-scope objections by preserving deterministic labeling.",
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
          "State that the repaired sample perspective remains provisional review material.",
        status: "answered",
        sourceEventIds,
        supportingRefIds: [repairClaimId],
        unresolvedObjectionIds: []
      }
    ],
    rationale:
      "Generate challengeable candidate repair proposal material without accepting or finalizing it."
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
      source: "Deterministic sample evidence source",
      summary: `Reported sample evidence result for ${evidenceNeed.object.id}; this is not independent verification.`,
      limitations: ["Deterministic sample evidence is not independent verification."]
    })),
    rationale:
      "Record reported evidence check material for local development without claiming verification."
  };
}

function createLocalPresetProposalReviewer(): ProposalReviewGenerator {
  return {
    reviewerId: LOCAL_PRESET_IDS.reviewer,
    reviewProposals(): ProposalReviewGeneratorResult {
      return {
        challenges: [],
        notes: [
          "Deterministic sample review leaves generated proposals unchallenged for walkthrough coverage."
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
          "Use the guided sample discussion only as provisional review material.",
        applicabilityConditions: [
          "Only in the deterministic sample walkthrough.",
          "Only for local review and testing."
        ],
        rationale:
          "The sample exercises the full discussion path without relying on real participant or model input.",
        limitations: [
          "Deterministic sample output is canned, not real deliberation input.",
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
        findings: ["The guided sample discussion produced traceable provisional material."],
        risks: [
          "Sample material can only validate the walkthrough, not real-world answer quality."
        ],
        unresolvedObjectionIds: context.unresolvedObjectionIds,
        qualityObligationIds: context.qualityObligations.qualityObligations.map(
          (entry) => entry.object.id
        ),
        evidenceNeedIds: context.evidenceNeedIds,
        omissions: ["External provider setup, production hosting, and authentication were not part of this sample."],
        compressionProblems: [],
        limitations: ["The current conclusion remains provisional."],
        continuationSuggestions: ["Review the same discussion with real participants or model connections when ready."]
      };
    }
  };
}
