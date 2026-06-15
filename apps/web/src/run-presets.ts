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
  finalization: {
    finalCandidateGeneratorId: "local-preset-final-candidate",
    auditGeneratorIds: ["local-preset-final-auditor"],
    compileOutcome: true
  }
};

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

  return {
    ...cloneJsonObject(LOCAL_PRESET_RUN_PLAN),
    title,
    topic,
    goals:
      userGoals.length > 0
        ? userGoals
        : [
            "Compare the strongest current options.",
            "Keep open disagreements and missing evidence visible."
          ],
    constraints: uniqueBriefLines([
      ...userConstraints,
      MATCH_TOPIC_LANGUAGE_INSTRUCTION,
      "Use built-in sample participants only.",
      "Keep the conclusion provisional until reviewed."
    ]),
    output: {
      language: "same as discussion question",
      style: "clear",
      expectations: uniqueBriefLines(
        expectedOutcomes.length > 0
          ? [...expectedOutcomes, MATCH_TOPIC_LANGUAGE_INSTRUCTION]
          : [
              "Show the current conclusion.",
              "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions.",
              MATCH_TOPIC_LANGUAGE_INSTRUCTION
            ]
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
    goals:
      userGoals.length > 0
        ? userGoals
        : [
            "Compare the strongest current options.",
            "Keep open disagreements and missing evidence visible."
          ],
    constraints: uniqueBriefLines([
      ...userConstraints,
      MATCH_TOPIC_LANGUAGE_INSTRUCTION,
      "Use configured model-backed participants from the local service.",
      perspectiveCount === 3
        ? "Use three independent model-backed perspectives from the local service."
        : "Use two independent model-backed perspectives from the local service.",
      "Keep provider credentials saved locally and out of the discussion.",
      "Keep the conclusion provisional until reviewed."
    ]),
    participants,
    providerConfigs,
    timeouts: PROVIDER_BACKED_DISCUSSION_TIMEOUTS,
    output: {
      language: "same as discussion question",
      style: "clear",
      expectations: uniqueBriefLines(
        expectedOutcomes.length > 0
          ? [...expectedOutcomes, MATCH_TOPIC_LANGUAGE_INSTRUCTION]
          : [
              "Show the current conclusion.",
              "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions.",
              MATCH_TOPIC_LANGUAGE_INSTRUCTION
            ]
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
