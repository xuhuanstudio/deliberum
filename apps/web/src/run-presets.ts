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
      "Use built-in sample participants only.",
      "Keep the conclusion provisional until reviewed."
    ]),
    output: {
      language: "en",
      style: "clear",
      expectations:
        expectedOutcomes.length > 0
          ? expectedOutcomes
          : [
              "Show the current conclusion.",
              "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions."
            ]
    }
  };
}

export function buildProviderBackedDiscussionRunPlan(
  input: GuidedDiscussionRunPlanInput,
  provider: ProviderBackedDiscussionPlanInput
): Record<string, unknown> {
  const topic = input.question.trim();
  const userGoals = parseBriefLines(input.goalsText);
  const userConstraints = parseBriefLines(input.constraintsText);
  const expectedOutcomes = parseBriefLines(input.expectedOutcomeText);
  const title = formatDiscussionTitle(topic);
  const perspectiveAId = "provider-perspective-a";
  const perspectiveBId = "provider-perspective-b";
  const providerConfig: Record<string, unknown> = {
    id: provider.providerConfigId,
    adapterId: provider.adapterId,
    providerConfigId: provider.providerConfigId
  };

  if (provider.apiKeyEnvVar) {
    providerConfig.apiKeyEnvVar = provider.apiKeyEnvVar;
  }

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
      "Use configured model-backed participants from the local daemon.",
      "Keep provider credentials in the local daemon environment only.",
      "Keep the conclusion provisional until reviewed."
    ]),
    participants: [
      {
        id: perspectiveAId,
        kind: "model",
        displayName: "Perspective A",
        adapterId: provider.adapterId,
        providerConfigId: provider.providerConfigId
      },
      {
        id: perspectiveBId,
        kind: "model",
        displayName: "Perspective B",
        adapterId: provider.adapterId,
        providerConfigId: provider.providerConfigId
      }
    ],
    providerConfigs: [providerConfig],
    output: {
      language: "en",
      style: "clear",
      expectations:
        expectedOutcomes.length > 0
          ? expectedOutcomes
          : [
              "Show the current conclusion.",
              "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions."
            ]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: [perspectiveAId, perspectiveBId]
    }
  };
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
