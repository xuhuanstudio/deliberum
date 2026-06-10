import {
  AdapterRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  ProposalReviewGeneratorRegistry,
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
  reviewer: "local-preset-reviewer",
  finalCandidate: "local-preset-final-candidate",
  auditor: "local-preset-final-auditor"
} as const;

export type LocalPresetRunRegistries = Pick<
  DaemonRunOrchestrationOptions,
  | "adapterRegistry"
  | "extractionGeneratorRegistry"
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
          "Deterministic local preset participant Alpha proposes a guarded local run workspace path.",
        reason:
          "This local preset material exists for development and testing; it is not real provider output."
      }),
      createLocalPresetParticipantAdapter(LOCAL_PRESET_IDS.betaAdapter, {
        position:
          "Deterministic local preset participant Beta keeps unresolved issues visible.",
        reason:
          "The run should stay a control/view workflow with provisional output and explicit limitations."
      })
    ]),
    extractionGeneratorRegistry: new ExtractionGeneratorRegistry([
      createLocalPresetExtractionGenerator()
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
    title: "Local preset run",
    topic: "Exercise the local Deliberum run workspace with deterministic preset components.",
    goals: [
      "Create traceable proposal material through the daemon run API.",
      "Show Candidate Frontier, objections, quality obligations, and provisional outcome views."
    ],
    constraints: [
      "Use deterministic local preset components only.",
      "Keep all output provisional and labeled as local development material."
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
        "Render only local preset material.",
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
          "Accept unchallenged deterministic local preset proposals for this development run."
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
          label: "deterministic local preset material",
          ...payload,
          participantId: context.participantId
        },
        adapterId,
        participantId: context.participantId,
        capabilities,
        contextCompleteness: {
          status: "complete",
          notes: ["Deterministic local preset context for development and testing."]
        },
        warnings: ["Local preset output is not real provider output."]
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
        title: "Local runnable run workspace",
        description:
          "Use the daemon run API with deterministic local preset components to exercise the Web workspace.",
        sourceEventIds,
        status: "active",
        supportedBy: ["local-preset-claim-control-surface"],
        attackedBy: ["local-preset-objection-preset-scope"],
        qualityObligationIds: ["local-preset-quality-labeling"],
        assumptions: ["The daemon remains the local transport and control surface."],
        tradeoffs: ["The preset does not represent real provider behavior."]
      }
    ],
    claims: [
      {
        id: "local-preset-claim-control-surface",
        content:
          "A local preset can make the workspace runnable while preserving daemon and core lifecycle boundaries.",
        scope: "design",
        sourceEventIds,
        supports: ["local-preset-candidate-run-workspace"]
      }
    ],
    objections: [
      {
        id: "local-preset-objection-preset-scope",
        targetId: "local-preset-candidate-run-workspace",
        failureMode: "Users could mistake deterministic local preset material for real provider output.",
        consequence: "The UI and generated material must label preset output and limitations clearly.",
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
          "Clearly label local preset output as deterministic development material.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: ["local-preset-claim-control-surface"],
        unresolvedObjectionIds: ["local-preset-objection-preset-scope"]
      }
    ],
    rationale:
      "Extract traceable local preset proposal material from revealed deterministic contributions."
  };
}

function createLocalPresetProposalReviewer(): ProposalReviewGenerator {
  return {
    reviewerId: LOCAL_PRESET_IDS.reviewer,
    reviewProposals(): ProposalReviewGeneratorResult {
      return {
        challenges: [],
        notes: [
          "Deterministic local preset review leaves generated proposals unchallenged for development flow coverage."
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
          "Use the local daemon preset to exercise the Web run workspace as provisional development material.",
        applicabilityConditions: [
          "Only when the daemon is started with the local preset enabled.",
          "Only for local development and testing."
        ],
        rationale:
          "The preset keeps execution on the daemon/orchestrator/core path while avoiding real provider calls.",
        limitations: [
          "Deterministic local preset output is not real provider output.",
          "Persistent daemon storage and provider setup remain outside this profile."
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
        findings: ["The local preset run produced traceable provisional material."],
        risks: [
          "Local preset material can only validate local workflow behavior, not real provider quality."
        ],
        unresolvedObjectionIds: context.unresolvedObjectionIds,
        qualityObligationIds: context.qualityObligations.qualityObligations.map(
          (entry) => entry.object.id
        ),
        evidenceNeedIds: context.evidenceNeedIds,
        omissions: ["No provider setup, persistent storage, public hosting, or authentication is included."],
        compressionProblems: [],
        limitations: ["The compiled outcome remains provisional."],
        continuationSuggestions: ["Use real provider configuration in a later explicit provider setup stage."]
      };
    }
  };
}
