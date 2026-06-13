export const LOCAL_PRESET_RUN_PLAN = {
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
      adapterId: "local-preset-alpha"
    },
    {
      id: "local-preset-beta",
      kind: "model",
      displayName: "Local preset Beta",
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
        "Accept unchallenged deterministic local preset proposals for this development run."
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
      "Use deterministic local preset components only.",
      "Keep all output provisional until reviewed."
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
