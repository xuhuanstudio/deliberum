export const LOCAL_PRESET_RUN_PLAN = {
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
      adapterId: "local-preset-alpha"
    },
    {
      id: "local-preset-beta",
      kind: "model",
      displayName: "Perspective B",
      adapterId: "local-preset-beta"
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

export const LOCAL_PRESET_START_REQUEST = {
  sealedDivergence: {
    autoCloseManual: true
  },
  extraction: {
    generatorIds: ["local-preset-extractor"]
  },
  review: {
    reviewerIds: ["local-preset-reviewer"],
    acceptancePolicy: {
      mode: "all_generated_unchallenged",
      authorId: "local-preset-review-coordinator",
      rationale:
        "Accept sample discussion material that has no open challenge in this walkthrough."
    }
  },
  evidenceCheck: {
    generatorIds: ["local-preset-evidence-checker"]
  },
  finalization: {
    finalCandidateGeneratorId: "local-preset-final-candidate",
    auditGeneratorIds: ["local-preset-final-auditor"],
    compileOutcome: true
  }
};

const LOCAL_PRESET_ACCEPTANCE_RATIONALE_ZH_CN =
  "\u63a5\u53d7\u672c\u6b21\u6f14\u793a\u4e2d\u6ca1\u6709\u516c\u5f00\u6311\u6218\u7684\u793a\u4f8b\u8ba8\u8bba\u6750\u6599\u3002";

export type GuidedDiscussionRunPlanInput = {
  question: string;
  goalsText: string;
  constraintsText: string;
  expectedOutcomeText: string;
};

export type ProviderBackedDiscussionPlanInput = {
  adapterId: string;
  providerConfigId: string;
  apiKeyEnvVar?: string;
};

export type ProviderBackedPerspectiveCount = 2 | 3;
export type ProviderBackedPerspectiveModelOverrides = Record<string, string | undefined>;

export type ProviderBackedDiscussionPlanOptions = {
  perspectiveCount?: ProviderBackedPerspectiveCount;
  modelId?: string;
  reviewModelId?: string;
  perspectiveModels?: ProviderBackedPerspectiveModelOverrides;
};

export function buildLocalPresetStartRequest(topic?: string): Record<string, unknown> {
  if (!topic || !isSimplifiedChineseText(topic)) {
    return LOCAL_PRESET_START_REQUEST;
  }

  const startRequest = cloneJsonObject(LOCAL_PRESET_START_REQUEST);
  const review = startRequest.review;

  if (isRecord(review)) {
    const acceptancePolicy = review.acceptancePolicy;

    if (isRecord(acceptancePolicy)) {
      acceptancePolicy.rationale = LOCAL_PRESET_ACCEPTANCE_RATIONALE_ZH_CN;
    }
  }

  return startRequest;
}

const PROVIDER_BACKED_DISCUSSION_TIMEOUTS = {
  participantMs: 90000,
  overallMs: 240000
} as const;

const PROVIDER_BACKED_PERSPECTIVES = [
  {
    id: "provider-perspective-a",
    displayName: "Perspective A"
  },
  {
    id: "provider-perspective-b",
    displayName: "Perspective B"
  },
  {
    id: "provider-perspective-c",
    displayName: "Perspective C"
  }
] as const;
const MATCH_TOPIC_LANGUAGE_INSTRUCTION =
  "Write all participant responses, review notes, and conclusions in the same language as the discussion question.";
const MATCH_TOPIC_LANGUAGE_INSTRUCTION_ZH_CN =
  "\u6240\u6709\u53c2\u4e0e\u8005\u56de\u5e94\u3001\u5ba1\u67e5\u8bf4\u660e\u548c\u7ed3\u8bba\u90fd\u5e94\u4f7f\u7528\u8ba8\u8bba\u95ee\u9898\u7684\u540c\u4e00\u79cd\u8bed\u8a00\u3002";
const DEFAULT_BRIEF_COPY = {
  en: {
    languageInstruction: MATCH_TOPIC_LANGUAGE_INSTRUCTION,
    goals: [
      "Compare the strongest current options.",
      "Keep open disagreements and missing evidence visible."
    ],
    localConstraints: [
      MATCH_TOPIC_LANGUAGE_INSTRUCTION,
      "Use built-in sample participants only.",
      "Keep the conclusion provisional until reviewed."
    ],
    providerConstraints: [
      MATCH_TOPIC_LANGUAGE_INSTRUCTION,
      "Use configured model-backed participants from the local service.",
      "Keep provider credentials saved locally and out of the discussion.",
      "Keep the conclusion provisional until reviewed."
    ],
    providerTwoPerspectiveConstraint:
      "Use two independent model-backed perspectives from the local service.",
    providerThreePerspectiveConstraint:
      "Use three independent model-backed perspectives from the local service.",
    expectations: [
      "Show the current conclusion.",
      "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions.",
      MATCH_TOPIC_LANGUAGE_INSTRUCTION
    ]
  },
  zhCn: {
    languageInstruction: MATCH_TOPIC_LANGUAGE_INSTRUCTION_ZH_CN,
    goals: [
      "\u6bd4\u8f83\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002",
      "\u4fdd\u6301\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7f3a\u5931\u8bc1\u636e\u53ef\u89c1\u3002"
    ],
    localConstraints: [
      MATCH_TOPIC_LANGUAGE_INSTRUCTION_ZH_CN,
      "\u4f7f\u7528\u5185\u7f6e\u793a\u4f8b\u53c2\u4e0e\u8005\u3002",
      "\u5728\u4eba\u5de5\u5ba1\u9605\u524d\uff0c\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002"
    ],
    providerConstraints: [
      MATCH_TOPIC_LANGUAGE_INSTRUCTION_ZH_CN,
      "\u4f7f\u7528\u672c\u673a\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
      "\u8ba9\u6a21\u578b\u670d\u52a1\u51ed\u636e\u4fdd\u5b58\u5728\u672c\u673a\uff0c\u4e0d\u8fdb\u5165\u8ba8\u8bba\u5185\u5bb9\u3002",
      "\u5728\u4eba\u5de5\u5ba1\u9605\u524d\uff0c\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002"
    ],
    providerTwoPerspectiveConstraint:
      "\u4f7f\u7528\u672c\u673a\u670d\u52a1\u4e2d\u7684\u4e24\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u3002",
    providerThreePerspectiveConstraint:
      "\u4f7f\u7528\u672c\u673a\u670d\u52a1\u4e2d\u7684\u4e09\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u3002",
    expectations: [
      "\u5c55\u793a\u5f53\u524d\u7ed3\u8bba\u3002",
      "\u5217\u51fa\u4e3b\u8981\u89c2\u70b9\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
      MATCH_TOPIC_LANGUAGE_INSTRUCTION_ZH_CN
    ]
  }
} as const;
type DefaultBriefCopy = {
  languageInstruction: string;
  goals: readonly string[];
  localConstraints: readonly string[];
  providerConstraints: readonly string[];
  providerTwoPerspectiveConstraint: string;
  providerThreePerspectiveConstraint: string;
  expectations: readonly string[];
};

export const LOCAL_PRESET_DISCUSSION_BRIEF: GuidedDiscussionRunPlanInput = {
  question: "How should we review a proposed rollout before relying on it?",
  goalsText: [
    "Compare the strongest current options.",
    "Keep unresolved disagreements and missing evidence visible."
  ].join("\n"),
  constraintsText: [
    "Keep the walkthrough deterministic and reviewable.",
    "Treat the conclusion as provisional until a human reviews it."
  ].join("\n"),
  expectedOutcomeText: [
    "Show the current conclusion.",
    "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions."
  ].join("\n")
};

export function buildGuidedDiscussionRunPlan(
  input: GuidedDiscussionRunPlanInput
): Record<string, unknown> {
  const topic = input.question.trim();
  const userGoals = parseBriefLines(input.goalsText);
  const userConstraints = parseBriefLines(input.constraintsText);
  const expectedOutcomes = parseBriefLines(input.expectedOutcomeText);
  const title = formatDiscussionTitle(topic);
  const defaultCopy = getDefaultBriefCopy(topic);
  const outputLanguage = detectDiscussionOutputLanguage(topic);

  return {
    ...cloneJsonObject(LOCAL_PRESET_RUN_PLAN),
    title,
    topic,
    goals: userGoals.length > 0 ? userGoals : [...defaultCopy.goals],
    constraints: uniqueBriefLines([
      ...userConstraints,
      ...defaultCopy.localConstraints
    ]),
    output: {
      language: outputLanguage,
      style: "clear",
      expectations: uniqueBriefLines(
        expectedOutcomes.length > 0
          ? [...expectedOutcomes, defaultCopy.languageInstruction]
          : [...defaultCopy.expectations]
      )
    }
  };
}

export function buildProviderBackedDiscussionRunPlan(
  input: GuidedDiscussionRunPlanInput,
  provider: ProviderBackedDiscussionPlanInput,
  options: ProviderBackedDiscussionPlanOptions = {}
): Record<string, unknown> {
  const topic = input.question.trim();
  const userGoals = parseBriefLines(input.goalsText);
  const userConstraints = parseBriefLines(input.constraintsText);
  const expectedOutcomes = parseBriefLines(input.expectedOutcomeText);
  const title = formatDiscussionTitle(topic);
  const defaultCopy = getDefaultBriefCopy(topic);
  const outputLanguage = detectDiscussionOutputLanguage(topic);
  const perspectiveCount = options.perspectiveCount ?? 2;
  const perspectives = PROVIDER_BACKED_PERSPECTIVES.slice(0, perspectiveCount);
  const modelId = options.modelId?.trim();
  const reviewModelId = options.reviewModelId?.trim();
  const defaultParticipantProviderConfigId = reviewModelId
    ? `${provider.providerConfigId}-participant-default`
    : provider.providerConfigId;
  const providerConfigs = reviewModelId
    ? [
        createProviderBackedModelConfig(provider.providerConfigId, provider, reviewModelId),
        createProviderBackedModelConfig(defaultParticipantProviderConfigId, provider, modelId)
      ]
    : [
        createProviderBackedModelConfig(provider.providerConfigId, provider, modelId)
      ];
  const participants = perspectives.map((perspective) => {
    const perspectiveModel = options.perspectiveModels?.[perspective.id]?.trim();
    const providerConfigId = perspectiveModel
      ? `${provider.providerConfigId}-${perspective.id.replace("provider-", "")}`
      : defaultParticipantProviderConfigId;

    if (perspectiveModel) {
      providerConfigs.push(
        createProviderBackedModelConfig(providerConfigId, provider, perspectiveModel)
      );
    }

    return {
      id: perspective.id,
      kind: "model",
      displayName: perspective.displayName,
      adapterId: provider.adapterId,
      providerConfigId
    };
  });

  return {
    ...cloneJsonObject(LOCAL_PRESET_RUN_PLAN),
    title,
    topic,
    goals: userGoals.length > 0 ? userGoals : [...defaultCopy.goals],
    constraints: uniqueBriefLines([
      ...userConstraints,
      perspectiveCount === 3
        ? defaultCopy.providerThreePerspectiveConstraint
        : defaultCopy.providerTwoPerspectiveConstraint,
      ...defaultCopy.providerConstraints
    ]),
    participants,
    providerConfigs,
    timeouts: PROVIDER_BACKED_DISCUSSION_TIMEOUTS,
    output: {
      language: outputLanguage,
      style: "clear",
      expectations: uniqueBriefLines(
        expectedOutcomes.length > 0
          ? [...expectedOutcomes, defaultCopy.languageInstruction]
          : [...defaultCopy.expectations]
      )
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: perspectives.map((perspective) => perspective.id)
    }
  };
}

function createProviderBackedModelConfig(
  id: string,
  provider: ProviderBackedDiscussionPlanInput,
  modelId: string | undefined
): Record<string, unknown> {
  const providerConfig: Record<string, unknown> = {
    id,
    adapterId: provider.adapterId,
    providerConfigId: provider.providerConfigId
  };

  if (modelId) {
    providerConfig.modelId = modelId;
  }

  if (provider.apiKeyEnvVar) {
    providerConfig.apiKeyEnvVar = provider.apiKeyEnvVar;
  }

  return providerConfig;
}

export function parseBriefLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function uniqueBriefLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const uniqueLines: string[] = [];

  for (const line of lines) {
    const key = line.toLocaleLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      uniqueLines.push(line);
    }
  }

  return uniqueLines;
}

function getDefaultBriefCopy(topic: string): DefaultBriefCopy {
  return isSimplifiedChineseText(topic) ? DEFAULT_BRIEF_COPY.zhCn : DEFAULT_BRIEF_COPY.en;
}

function detectDiscussionOutputLanguage(topic: string): "English" | "Simplified Chinese" {
  return isSimplifiedChineseText(topic) ? "Simplified Chinese" : "English";
}

export function formatPresetJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatDiscussionTitle(topic: string): string {
  const compactTopic = topic.replace(/\s+/g, " ").trim();
  const visibleTopic =
    compactTopic.length > 72 ? `${compactTopic.slice(0, 69).trim()}...` : compactTopic;

  return visibleTopic.length > 0 ? `Discussion: ${visibleTopic}` : "Untitled discussion";
}

function cloneJsonObject(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isSimplifiedChineseText(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
