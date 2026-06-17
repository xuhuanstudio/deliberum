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

type LocalPresetLanguage = "en" | "zh-CN";

type LocalPresetParticipantPayload = {
  position: string;
  reason: string;
};

type LocalPresetParticipantScript = {
  first: LocalPresetParticipantPayload;
  followUp: LocalPresetParticipantPayload;
};

type LocalPresetText = {
  participants: {
    alpha: LocalPresetParticipantScript;
    beta: LocalPresetParticipantScript;
  };
  sampleContributionLabel: string;
  sampleContextNote: string;
  sampleWarning: string;
  acceptanceRationale: string;
  extraction: {
    candidateTitle: string;
    candidateDescription: string;
    candidateAssumptions: string[];
    candidateTradeoffs: string[];
    claimContent: string;
    objectionFailureMode: string;
    objectionConsequence: string;
    qualityRequirement: string;
    rationale: string;
  };
  repair: {
    titleSuffix: string;
    description: string;
    assumptions: string[];
    tradeoffs: string[];
    claimContent: string;
    qualityRequirement: string;
    rationale: string;
  };
  evidence: {
    source: string;
    summaryPrefix: string;
    summarySuffix: string;
    limitations: string[];
    rationale: string;
  };
  reviewNotes: string[];
  finalCandidate: {
    recommendation: string;
    applicabilityConditions: string[];
    rationale: string;
    limitations: string[];
  };
  finalAudit: {
    findings: string[];
    risks: string[];
    omissions: string[];
    limitations: string[];
    continuationSuggestions: string[];
  };
};

const LOCAL_PRESET_TEXT: Record<LocalPresetLanguage, LocalPresetText> = {
  en: {
    participants: {
      alpha: {
        first: {
          position: "Review the rollout in stages before relying on the recommendation.",
          reason:
            "The team should compare options, disagreements, risks, and missing evidence before acting."
        },
        followUp: {
          position:
            "I would keep the staged review, but add rollback gates before any wider rollout.",
          reason:
            "That responds to the evidence concern by making each stage reversible until missing data is checked."
        }
      },
      beta: {
        first: {
          position: "Keep the conclusion provisional until unresolved issues are checked.",
          reason:
            "A readable discussion should make remaining disagreements and next actions easy to inspect."
        },
        followUp: {
          position:
            "Before widening the rollout, answer the evidence gap and define what would stop the release.",
          reason:
            "This pushes back on a staged rollout that lacks verification or rollback criteria."
        }
      }
    },
    sampleContributionLabel: "built-in sample contribution",
    sampleContextNote: "Built-in sample context for a guided walkthrough.",
    sampleWarning: "Sample output is illustrative and should be replaced for real decisions.",
    acceptanceRationale:
      "Accept sample discussion material that has no open challenge in this walkthrough.",
    extraction: {
      candidateTitle: "Staged rollout review",
      candidateDescription:
        "Review the rollout in stages, keep alternatives visible, and treat the conclusion as provisional until risks and evidence gaps are checked.",
      candidateAssumptions: ["This is a built-in sample walkthrough."],
      candidateTradeoffs: ["The sample does not replace real participant or model input."],
      claimContent:
        "A staged review helps the team compare options before relying on the rollout.",
      objectionFailureMode:
        "Users could rely on the sample conclusion without checking whether it matches their real rollout.",
      objectionConsequence:
        "The conclusion must keep limitations, disagreements, and next actions visible.",
      qualityRequirement:
        "State that the conclusion is provisional and list what must be checked next.",
      rationale:
        "Organize the first responses into reviewable options, disagreements, requirements, and evidence needs."
    },
    repair: {
      titleSuffix: "repair",
      description:
        "A revised sample option that keeps limitations and review actions explicit.",
      assumptions: [
        "The revised option remains built-in sample material.",
        "Acceptance still requires explicit proposal review."
      ],
      tradeoffs: [
        "The revised option improves labeling but still does not replace real decision input."
      ],
      claimContent:
        "The revised sample perspective answers sample-scope objections by preserving visible limitations.",
      qualityRequirement:
        "State that the revised sample perspective remains provisional review material.",
      rationale:
        "Generate a challengeable revised option without accepting or finalizing it."
    },
    evidence: {
      source: "Built-in sample evidence source",
      summaryPrefix: "Reported sample evidence result for",
      summarySuffix: "this is not independent verification.",
      limitations: ["Built-in sample evidence is not independent verification."],
      rationale:
        "Record reported evidence check material without claiming independent verification."
    },
    reviewNotes: [
      "Sample review leaves generated proposals unchallenged so the walkthrough can show the full discussion path."
    ],
    finalCandidate: {
      recommendation: "Use a staged review path before relying on the rollout.",
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
    },
    finalAudit: {
      findings: ["The current conclusion is reviewable but still provisional."],
      risks: [
        "A team could mistake the sample walkthrough for a decision about its real rollout."
      ],
      omissions: [
        "Real project evidence, stakeholder input, and provider-backed model perspectives were not included in this sample."
      ],
      limitations: ["The current conclusion remains provisional."],
      continuationSuggestions: [
        "Run the discussion with the real rollout brief and real participants or model connections when ready."
      ]
    }
  },
  "zh-CN": {
    participants: {
      alpha: {
        first: {
          position: "\u5728\u4f9d\u8d56\u5efa\u8bae\u524d\uff0c\u5206\u9636\u6bb5\u5ba1\u67e5\u8fd9\u6b21\u53d1\u5e03\u3002",
          reason: "\u56e2\u961f\u5e94\u5148\u6bd4\u8f83\u9009\u9879\u3001\u5206\u6b67\u3001\u98ce\u9669\u548c\u7f3a\u5931\u8bc1\u636e\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u884c\u52a8\u3002"
        },
        followUp: {
          position:
            "\u6211\u4f1a\u4fdd\u7559\u5206\u9636\u6bb5\u5ba1\u67e5\uff0c\u4f46\u5728\u6269\u5927\u53d1\u5e03\u524d\u52a0\u5165\u56de\u6eda\u95e8\u69db\u3002",
          reason:
            "\u8fd9\u662f\u5bf9\u8bc1\u636e\u62c5\u5fe7\u7684\u56de\u5e94\uff1a\u5728\u7f3a\u5931\u6570\u636e\u5b8c\u6210\u6838\u67e5\u524d\uff0c\u6bcf\u4e2a\u9636\u6bb5\u90fd\u5e94\u8be5\u53ef\u9006\u3002"
        }
      },
      beta: {
        first: {
          position: "\u5728\u672a\u89e3\u51b3\u95ee\u9898\u5b8c\u6210\u68c0\u67e5\u524d\uff0c\u4fdd\u6301\u7ed3\u8bba\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002",
          reason: "\u53ef\u8bfb\u7684\u8ba8\u8bba\u5e94\u8be5\u8ba9\u5269\u4f59\u5206\u6b67\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u5bb9\u6613\u68c0\u67e5\u3002"
        },
        followUp: {
          position:
            "\u5728\u6269\u5927\u53d1\u5e03\u524d\uff0c\u5148\u56de\u7b54\u8bc1\u636e\u7f3a\u53e3\uff0c\u5e76\u5b9a\u4e49\u4ec0\u4e48\u60c5\u51b5\u4f1a\u6682\u505c\u53d1\u5e03\u3002",
          reason:
            "\u8fd9\u662f\u5bf9\u7f3a\u5c11\u9a8c\u8bc1\u6216\u56de\u6eda\u6807\u51c6\u7684\u5206\u9636\u6bb5\u53d1\u5e03\u65b9\u6848\u7684\u8ffd\u95ee\u3002"
        }
      }
    },
    sampleContributionLabel: "\u5185\u7f6e\u793a\u4f8b\u8d21\u732e",
    sampleContextNote: "\u7528\u4e8e\u5f15\u5bfc\u6f14\u793a\u7684\u5185\u7f6e\u793a\u4f8b\u4e0a\u4e0b\u6587\u3002",
    sampleWarning: "\u793a\u4f8b\u8f93\u51fa\u4ec5\u7528\u4e8e\u8bf4\u660e\uff0c\u771f\u5b9e\u51b3\u7b56\u5e94\u66ff\u6362\u4e3a\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8f93\u5165\u3002",
    acceptanceRationale: "\u63a5\u53d7\u672c\u6b21\u6f14\u793a\u4e2d\u6ca1\u6709\u516c\u5f00\u6311\u6218\u7684\u793a\u4f8b\u8ba8\u8bba\u6750\u6599\u3002",
    extraction: {
      candidateTitle: "\u5206\u9636\u6bb5\u53d1\u5e03\u5ba1\u67e5",
      candidateDescription:
        "\u5206\u9636\u6bb5\u5ba1\u67e5\u8fd9\u6b21\u53d1\u5e03\uff0c\u4fdd\u6301\u66ff\u4ee3\u65b9\u6848\u53ef\u89c1\uff0c\u5e76\u5728\u98ce\u9669\u548c\u8bc1\u636e\u7f3a\u53e3\u5b8c\u6210\u68c0\u67e5\u524d\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002",
      candidateAssumptions: ["\u8fd9\u662f\u5185\u7f6e\u793a\u4f8b\u6f14\u793a\u3002"],
      candidateTradeoffs: ["\u8be5\u793a\u4f8b\u4e0d\u80fd\u66ff\u4ee3\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8f93\u5165\u3002"],
      claimContent: "\u5206\u9636\u6bb5\u5ba1\u67e5\u6709\u52a9\u4e8e\u56e2\u961f\u5728\u4f9d\u8d56\u8fd9\u6b21\u53d1\u5e03\u524d\u6bd4\u8f83\u9009\u9879\u3002",
      objectionFailureMode:
        "\u7528\u6237\u53ef\u80fd\u5728\u672a\u68c0\u67e5\u5176\u662f\u5426\u5339\u914d\u771f\u5b9e\u53d1\u5e03\u7684\u60c5\u51b5\u4e0b\u4f9d\u8d56\u793a\u4f8b\u7ed3\u8bba\u3002",
      objectionConsequence: "\u7ed3\u8bba\u5fc5\u987b\u6301\u7eed\u5c55\u793a\u9650\u5236\u3001\u5206\u6b67\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002",
      qualityRequirement: "\u8bf4\u660e\u7ed3\u8bba\u4ecd\u662f\u4e34\u65f6\u7ed3\u8bba\uff0c\u5e76\u5217\u51fa\u63a5\u4e0b\u6765\u5fc5\u987b\u68c0\u67e5\u7684\u5185\u5bb9\u3002",
      rationale: "\u5c06\u521d\u59cb\u56de\u5e94\u6574\u7406\u4e3a\u53ef\u5ba1\u9605\u7684\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002"
    },
    repair: {
      titleSuffix: "\u4fee\u8ba2",
      description: "\u4e00\u4e2a\u4fdd\u7559\u9650\u5236\u548c\u5ba1\u67e5\u52a8\u4f5c\u7684\u4fee\u8ba2\u793a\u4f8b\u9009\u9879\u3002",
      assumptions: [
        "\u4fee\u8ba2\u540e\u7684\u9009\u9879\u4ecd\u7136\u662f\u5185\u7f6e\u793a\u4f8b\u6750\u6599\u3002",
        "\u662f\u5426\u63a5\u53d7\u4ecd\u9700\u8981\u660e\u786e\u7684\u63d0\u6848\u5ba1\u67e5\u3002"
      ],
      tradeoffs: [
        "\u4fee\u8ba2\u540e\u7684\u9009\u9879\u6539\u5584\u4e86\u6807\u6ce8\uff0c\u4f46\u4ecd\u4e0d\u80fd\u66ff\u4ee3\u771f\u5b9e\u51b3\u7b56\u8f93\u5165\u3002"
      ],
      claimContent: "\u4fee\u8ba2\u540e\u7684\u793a\u4f8b\u89c6\u89d2\u901a\u8fc7\u4fdd\u7559\u53ef\u89c1\u9650\u5236\u6765\u56de\u5e94\u793a\u4f8b\u8303\u56f4\u5206\u6b67\u3002",
      qualityRequirement: "\u8bf4\u660e\u4fee\u8ba2\u540e\u7684\u793a\u4f8b\u89c6\u89d2\u4ecd\u7136\u662f\u4e34\u65f6\u5ba1\u9605\u6750\u6599\u3002",
      rationale: "\u751f\u6210\u4e00\u4e2a\u53ef\u88ab\u6311\u6218\u7684\u4fee\u8ba2\u9009\u9879\uff0c\u4f46\u4e0d\u63a5\u53d7\u6216\u6700\u7ec8\u786e\u5b9a\u5b83\u3002"
    },
    evidence: {
      source: "\u5185\u7f6e\u793a\u4f8b\u8bc1\u636e\u6765\u6e90",
      summaryPrefix: "\u5df2\u8bb0\u5f55\u793a\u4f8b\u8bc1\u636e\u7ed3\u679c",
      summarySuffix: "\u8fd9\u4e0d\u662f\u72ec\u7acb\u9a8c\u8bc1\u3002",
      limitations: ["\u5185\u7f6e\u793a\u4f8b\u8bc1\u636e\u4e0d\u662f\u72ec\u7acb\u9a8c\u8bc1\u3002"],
      rationale: "\u8bb0\u5f55\u62a5\u544a\u5f0f\u8bc1\u636e\u6838\u67e5\u6750\u6599\uff0c\u4f46\u4e0d\u58f0\u79f0\u5b83\u662f\u72ec\u7acb\u9a8c\u8bc1\u3002"
    },
    reviewNotes: [
      "\u793a\u4f8b\u5ba1\u67e5\u4e0d\u4f1a\u6311\u6218\u751f\u6210\u7684\u63d0\u6848\uff0c\u4ee5\u4fbf\u6f14\u793a\u5b8c\u6574\u8ba8\u8bba\u8def\u5f84\u3002"
    ],
    finalCandidate: {
      recommendation: "\u5728\u4f9d\u8d56\u8fd9\u6b21\u53d1\u5e03\u524d\uff0c\u91c7\u7528\u5206\u9636\u6bb5\u5ba1\u67e5\u8def\u5f84\u3002",
      applicabilityConditions: [
        "\u5f53\u62df\u8bae\u53d1\u5e03\u7684\u8bc1\u636e\u6709\u9650\u65f6\u3002",
        "\u5f53\u56e2\u961f\u9700\u8981\u4e34\u65f6\u51b3\u7b56\u548c\u660e\u786e\u4e0b\u4e00\u6b65\u884c\u52a8\u65f6\u3002"
      ],
      rationale:
        "\u8ba8\u8bba\u4f1a\u540c\u65f6\u5c55\u793a\u6700\u5f3a\u9009\u9879\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u5ba1\u67e5\u884c\u52a8\u3002",
      limitations: [
        "\u6b64\u5185\u7f6e\u793a\u4f8b\u4ec5\u7528\u4e8e\u8bf4\u660e\uff1b\u771f\u5b9e\u51b3\u7b56\u8bf7\u66ff\u6362\u4e3a\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8f93\u5165\u3002",
        "\u8be5\u793a\u4f8b\u4e0d\u80fd\u8bc1\u660e\u751f\u4ea7\u5c31\u7eea\u6027\u6216\u771f\u5b9e\u4e16\u754c\u7b54\u6848\u8d28\u91cf\u3002"
      ]
    },
    finalAudit: {
      findings: ["\u5f53\u524d\u7ed3\u8bba\u53ef\u5ba1\u9605\uff0c\u4f46\u4ecd\u662f\u4e34\u65f6\u7ed3\u8bba\u3002"],
      risks: ["\u56e2\u961f\u53ef\u80fd\u4f1a\u628a\u793a\u4f8b\u6f14\u793a\u8bef\u8ba4\u4e3a\u5173\u4e8e\u771f\u5b9e\u53d1\u5e03\u7684\u51b3\u7b56\u3002"],
      omissions: [
        "\u6b64\u793a\u4f8b\u672a\u5305\u542b\u771f\u5b9e\u9879\u76ee\u8bc1\u636e\u3001\u5229\u76ca\u76f8\u5173\u65b9\u8f93\u5165\u548c\u7531\u63d0\u4f9b\u5546\u652f\u6301\u7684\u6a21\u578b\u89c6\u89d2\u3002"
      ],
      limitations: ["\u5f53\u524d\u7ed3\u8bba\u4ecd\u7136\u662f\u4e34\u65f6\u7ed3\u8bba\u3002"],
      continuationSuggestions: [
        "\u51c6\u5907\u597d\u540e\uff0c\u8bf7\u4f7f\u7528\u771f\u5b9e\u53d1\u5e03\u7b80\u62a5\u548c\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8fde\u63a5\u91cd\u65b0\u8fd0\u884c\u8ba8\u8bba\u3002"
      ]
    }
  }
};

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
      createLocalPresetParticipantAdapter(
        LOCAL_PRESET_IDS.alphaAdapter,
        LOCAL_PRESET_TEXT.en.participants.alpha,
        LOCAL_PRESET_TEXT["zh-CN"].participants.alpha
      ),
      createLocalPresetParticipantAdapter(
        LOCAL_PRESET_IDS.betaAdapter,
        LOCAL_PRESET_TEXT.en.participants.beta,
        LOCAL_PRESET_TEXT["zh-CN"].participants.beta
      )
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

export function localPresetStartRequest(topic?: string): DaemonRunStartRequest {
  const text = getLocalPresetText(topic ? detectLocalPresetLanguage(topic) : "en");

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
        rationale: text.acceptanceRationale
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
  enPayload: LocalPresetParticipantScript,
  zhCnPayload: LocalPresetParticipantScript
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
    async prepareContribution(input, context) {
      const language = detectLocalPresetLanguageFromValue(input.payload);
      const text = getLocalPresetText(language);
      const script = language === "zh-CN" ? zhCnPayload : enPayload;
      const payload = hasPriorReadableRoomState(input.payload) ? script.followUp : script.first;

      return {
        payload: {
          localPreset: true,
          label: text.sampleContributionLabel,
          ...payload,
          participantId: context.participantId
        },
        adapterId,
        participantId: context.participantId,
        capabilities,
        contextCompleteness: {
          status: "complete",
          notes: [text.sampleContextNote]
        },
        warnings: [text.sampleWarning]
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
  const text = getLocalPresetText(detectLocalPresetLanguage(context.topic));

  return {
    candidates: [
      {
        id: "local-preset-candidate-run-workspace",
        title: text.extraction.candidateTitle,
        description: text.extraction.candidateDescription,
        sourceEventIds,
        status: "active",
        supportedBy: ["local-preset-claim-control-surface"],
        attackedBy: ["local-preset-objection-preset-scope"],
        qualityObligationIds: ["local-preset-quality-labeling"],
        assumptions: text.extraction.candidateAssumptions,
        tradeoffs: text.extraction.candidateTradeoffs
      }
    ],
    claims: [
      {
        id: "local-preset-claim-control-surface",
        content: text.extraction.claimContent,
        scope: "design",
        sourceEventIds,
        supports: ["local-preset-candidate-run-workspace"]
      }
    ],
    objections: [
      {
        id: "local-preset-objection-preset-scope",
        targetId: "local-preset-candidate-run-workspace",
        failureMode: text.extraction.objectionFailureMode,
        consequence: text.extraction.objectionConsequence,
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
        requirement: text.extraction.qualityRequirement,
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: ["local-preset-claim-control-surface"],
        unresolvedObjectionIds: ["local-preset-objection-preset-scope"]
      }
    ],
    rationale: text.extraction.rationale
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
  const text = getLocalPresetText(detectLocalPresetLanguage(context.topic));

  return {
    candidates: [
      {
        id: repairedCandidateId,
        title: `${targetCandidate.object.title} ${text.repair.titleSuffix}`,
        description: text.repair.description,
        sourceEventIds,
        status: "active",
        supportedBy: [repairClaimId],
        attackedBy: [],
        qualityObligationIds: [answeredQualityId],
        assumptions: text.repair.assumptions,
        tradeoffs: text.repair.tradeoffs
      }
    ],
    claims: [
      {
        id: repairClaimId,
        content: text.repair.claimContent,
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
        requirement: text.repair.qualityRequirement,
        status: "answered",
        sourceEventIds,
        supportingRefIds: [repairClaimId],
        unresolvedObjectionIds: []
      }
    ],
    rationale: text.repair.rationale
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
  const text = getLocalPresetText(detectLocalPresetLanguage(context.topic));

  return {
    results: context.targetEvidenceNeeds.map((evidenceNeed) => ({
      evidenceNeedId: evidenceNeed.object.id,
      source: text.evidence.source,
      summary: `${text.evidence.summaryPrefix} ${evidenceNeed.object.id}; ${text.evidence.summarySuffix}`,
      limitations: text.evidence.limitations
    })),
    rationale: text.evidence.rationale
  };
}

function createLocalPresetProposalReviewer(): ProposalReviewGenerator {
  return {
    reviewerId: LOCAL_PRESET_IDS.reviewer,
    reviewProposals(_input, context): ProposalReviewGeneratorResult {
      const text = getLocalPresetText(detectLocalPresetLanguage(context.topic));

      return {
        challenges: [],
        notes: text.reviewNotes
      };
    }
  };
}

function createLocalPresetFinalCandidateGenerator(): FinalCandidateGenerator {
  return {
    generatorId: LOCAL_PRESET_IDS.finalCandidate,
    proposeFinalCandidate(_input, context): FinalCandidateGeneratorResult {
      const candidateId = context.frontier.candidates[0]?.object.id;
      const text = getLocalPresetText(detectLocalPresetLanguage(context.topic));

      if (!candidateId) {
        throw new Error("Expected accepted candidate in local preset run.");
      }

      return {
        candidateIds: [candidateId],
        recommendation: text.finalCandidate.recommendation,
        applicabilityConditions: text.finalCandidate.applicabilityConditions,
        rationale: text.finalCandidate.rationale,
        limitations: text.finalCandidate.limitations
      };
    }
  };
}

function createLocalPresetFinalAuditGenerator(): FinalAuditGenerator {
  return {
    auditorId: LOCAL_PRESET_IDS.auditor,
    auditFinalCandidate(_input, context: FinalizationContext): FinalAuditGeneratorResult {
      const text = getLocalPresetText(detectLocalPresetLanguage(context.topic));

      return {
        findings: text.finalAudit.findings,
        risks: text.finalAudit.risks,
        unresolvedObjectionIds: context.unresolvedObjectionIds,
        qualityObligationIds: context.qualityObligations.qualityObligations.map(
          (entry) => entry.object.id
        ),
        evidenceNeedIds: context.evidenceNeedIds,
        omissions: text.finalAudit.omissions,
        compressionProblems: [],
        limitations: text.finalAudit.limitations,
        continuationSuggestions: text.finalAudit.continuationSuggestions
      };
    }
  };
}

function getLocalPresetText(language: LocalPresetLanguage): LocalPresetText {
  return LOCAL_PRESET_TEXT[language];
}

function detectLocalPresetLanguage(text: string): LocalPresetLanguage {
  return /[\u3400-\u9fff]/u.test(text) ? "zh-CN" : "en";
}

function detectLocalPresetLanguageFromValue(value: unknown): LocalPresetLanguage {
  if (typeof value === "string") {
    return detectLocalPresetLanguage(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => detectLocalPresetLanguageFromValue(item) === "zh-CN")
      ? "zh-CN"
      : "en";
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((item) => detectLocalPresetLanguageFromValue(item) === "zh-CN")
      ? "zh-CN"
      : "en";
  }

  return "en";
}

function hasPriorReadableRoomState(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const events = (value as { events?: unknown }).events;

  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return false;
    }

    const type = (event as { type?: unknown }).type;

    return (
      type === "sealed_batch_revealed" ||
      type === "extraction_proposed" ||
      type === "proposal_challenged" ||
      type === "evidence_result_recorded" ||
      type === "final_candidate_proposed" ||
      type === "final_audit_recorded"
    );
  });
}
