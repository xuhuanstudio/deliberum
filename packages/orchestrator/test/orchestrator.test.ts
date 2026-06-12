import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@deliberum/storage";
import {
  InMemoryRunStore,
  ParticipantRegistry,
  RunPlanValidationError,
  buildTopicContractFromRunPlan,
  createDeliberationRun,
  validateDeliberationRunPlan
} from "../src";
import * as orchestrator from "../src";

function createValidRunPlan() {
  return {
    title: "CLI or Web priority",
    topic: "Should Deliberum prioritize CLI-first validation or Web UI polish first?",
    goals: ["Produce a traceable provisional recommendation"],
    constraints: ["Do not collapse disagreement into a winner"],
    participants: [
      {
        id: "participant-cli",
        kind: "model",
        displayName: "CLI advocate",
        adapterId: "openai-compatible",
        providerConfigId: "local-openai-compatible"
      },
      {
        id: "participant-web",
        kind: "human",
        displayName: "Web advocate",
        adapterId: "manual"
      }
    ],
    providerConfigs: [
      {
        id: "local-openai-compatible",
        adapterId: "openai-compatible",
        providerConfigId: "local-openai-compatible",
        modelId: "local-model",
        baseUrl: "http://127.0.0.1:11434",
        endpointPath: "/v1/chat/completions",
        apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY",
        timeoutMs: 30000
      }
    ],
    budget: {
      maxEvents: 100,
      maxProviderCalls: 10,
      maxEstimatedCostCents: 250,
      maxRunSeconds: 120
    },
    timeouts: {
      participantMs: 30000,
      overallMs: 120000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: ["Preserve unresolved objections and conditions"]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["participant-cli", "participant-web"]
    },
    resources: [
      {
        resourceId: "resource-1",
        required: false,
        preferredDeliveryMode: "none"
      }
    ]
  };
}

function createIds(ids: string[]) {
  let index = 0;

  return () => ids[index++] ?? `generated-${index}`;
}

function createEventStore() {
  return new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:01.000Z"
  });
}

describe("createDeliberationRun", () => {
  it("creates exactly one Topic Contract event and one operational run record", () => {
    const eventStore = createEventStore();
    const runStore = new InMemoryRunStore();

    const result = createDeliberationRun(
      {
        runPlan: createValidRunPlan()
      },
      {
        eventStore,
        runStore,
        idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"]),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    expect(result.run.id).toBe("run-1");
    expect(result.session.sessionId).toBe("session-1");
    expect(result.topicContractEvent.id).toBe("event-1");
    expect(result.run.sessionId).toBe(result.session.sessionId);
    expect(result.run.topicContractEventId).toBe(result.topicContractEvent.id);
    expect(result.run.status).toBe("created");
    expect(eventStore.listEvents("session-1")).toHaveLength(1);
    expect(runStore.listRuns()).toHaveLength(1);
    expect(result.topicContractEvent.type).toBe("topic_contract_published");
    expect(result.topicContractEvent.payload.id).toBe("topic-contract-1");
    expect(result.topicContractEvent.payload.participantIds).toEqual([
      "participant-cli",
      "participant-web"
    ]);
    expect(result.topicContractEvent.payload.allowedAdapters).toEqual([
      "openai-compatible",
      "manual"
    ]);
  });

  it("preserves safe provider references without resolving secrets", () => {
    const result = createDeliberationRun(
      {
        runPlan: createValidRunPlan()
      },
      {
        eventStore: createEventStore(),
        runStore: new InMemoryRunStore(),
        idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"]),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    expect(result.run.plan.providerConfigs[0]).toMatchObject({
      id: "local-openai-compatible",
      providerConfigId: "local-openai-compatible",
      apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY"
    });
    expect(JSON.stringify(result.run)).not.toContain("sk-");
    expect(JSON.stringify(result.topicContractEvent)).not.toContain("DELIBERUM_OPENAI_API_KEY");
  });

  it("preserves non-secret HTTP-template runtime variables in provider config", () => {
    const runPlan = createValidRunPlan() as ReturnType<typeof createValidRunPlan> & {
      providerConfigs: Array<ReturnType<typeof createValidRunPlan>["providerConfigs"][number] & {
        httpTemplate?: {
          variables: Record<string, unknown>;
        };
      }>;
    };
    runPlan.providerConfigs[0] = {
      ...runPlan.providerConfigs[0],
      adapterId: "http-template",
      httpTemplate: {
        variables: {
          route: "sealed-divergence",
          maxItems: 3
        }
      }
    };
    const result = createDeliberationRun(
      {
        runPlan
      },
      {
        eventStore: createEventStore(),
        runStore: new InMemoryRunStore(),
        idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"]),
        clock: () => "2026-06-10T00:00:00.000Z"
      }
    );

    expect(result.run.plan.providerConfigs[0]).toMatchObject({
      adapterId: "http-template",
      httpTemplate: {
        variables: {
          route: "sealed-divergence",
          maxItems: 3
        }
      }
    });
  });

  it("does not execute adapters or create later lifecycle artifacts", () => {
    const eventStore = createEventStore();

    createDeliberationRun(
      {
        runPlan: createValidRunPlan()
      },
      {
        eventStore,
        runStore: new InMemoryRunStore(),
        idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"])
      }
    );

    const events = eventStore.listEvents("session-1");

    expect(events.map((event) => event.type)).toEqual(["topic_contract_published"]);
    expect(JSON.stringify(events)).not.toContain("sealed_batch_opened");
    expect(JSON.stringify(events)).not.toContain("sealed_contribution_submitted");
    expect(JSON.stringify(events)).not.toContain("extraction_proposed");
    expect(JSON.stringify(events)).not.toContain("final_candidate_proposed");
    expect(JSON.stringify(events)).not.toContain("outcome");
  });

  it("rejects duplicate participants before appending or storing", () => {
    const eventStore = createEventStore();
    const runStore = new InMemoryRunStore();
    const runPlan = createValidRunPlan();
    runPlan.participants[1] = {
      ...runPlan.participants[1],
      id: "participant-cli"
    };

    expect(() =>
      createDeliberationRun(
        { runPlan },
        {
          eventStore,
          runStore,
          idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"])
        }
      )
    ).toThrow(RunPlanValidationError);
    expect(eventStore.listEvents("session-1")).toHaveLength(0);
    expect(runStore.listRuns()).toHaveLength(0);
  });

  it("rejects duplicate provider config ids before appending or storing", () => {
    const eventStore = createEventStore();
    const runStore = new InMemoryRunStore();
    const runPlan = createValidRunPlan();
    runPlan.providerConfigs.push({
      ...runPlan.providerConfigs[0]
    });

    expect(() =>
      createDeliberationRun(
        { runPlan },
        {
          eventStore,
          runStore,
          idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"])
        }
      )
    ).toThrow(RunPlanValidationError);
    expect(eventStore.listEvents("session-1")).toHaveLength(0);
    expect(runStore.listRuns()).toHaveLength(0);
  });

  it("rejects participants that reference missing provider configs", () => {
    const runPlan = createValidRunPlan();
    runPlan.participants[0] = {
      ...runPlan.participants[0],
      providerConfigId: "missing-provider"
    };

    expect(() => validateDeliberationRunPlan(runPlan)).toThrow(RunPlanValidationError);
  });

  it("rejects inline credential keys with safe error messages", () => {
    const eventStore = createEventStore();
    const runStore = new InMemoryRunStore();
    const unsafeSecret = "sk-this-secret-must-not-leak";
    const runPlan = createValidRunPlan() as ReturnType<typeof createValidRunPlan> & {
      providerConfigs: Array<ReturnType<typeof createValidRunPlan>["providerConfigs"][number] & {
        apiKey?: string;
      }>;
    };
    runPlan.providerConfigs[0].apiKey = unsafeSecret;

    try {
      createDeliberationRun(
        { runPlan },
        {
          eventStore,
          runStore,
          idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"])
        }
      );
      throw new Error("Expected createDeliberationRun to reject unsafe secret.");
    } catch (error) {
      expect(error).toBeInstanceOf(RunPlanValidationError);
      expect(error instanceof Error ? error.message : String(error)).not.toContain(unsafeSecret);
      expect(error instanceof Error ? error.message : String(error)).toContain(
        "unsafe inline credential field"
      );
    }

    expect(eventStore.listEvents("session-1")).toHaveLength(0);
    expect(runStore.listRuns()).toHaveLength(0);
  });

  it("rejects HTTP-template runtime variables that look like inline credentials", () => {
    const unsafeSecret = "sk-this-secret-must-not-leak";
    const runPlan = createValidRunPlan() as ReturnType<typeof createValidRunPlan> & {
      providerConfigs: Array<ReturnType<typeof createValidRunPlan>["providerConfigs"][number] & {
        httpTemplate?: {
          variables: Record<string, unknown>;
        };
      }>;
    };
    runPlan.providerConfigs[0].httpTemplate = {
      variables: {
        apiKey: unsafeSecret
      }
    };

    try {
      validateDeliberationRunPlan(runPlan);
      throw new Error("Expected unsafe HTTP-template variables to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(RunPlanValidationError);
      expect(error instanceof Error ? error.message : String(error)).not.toContain(unsafeSecret);
    }
  });

  it("rejects inline secret-like values with safe error messages", () => {
    const unsafeSecret = "Bearer private-token-value";
    const runPlan = {
      ...createValidRunPlan(),
      constraints: [unsafeSecret]
    };

    try {
      validateDeliberationRunPlan(runPlan);
      throw new Error("Expected validation to reject unsafe secret.");
    } catch (error) {
      expect(error).toBeInstanceOf(RunPlanValidationError);
      expect(error instanceof Error ? error.message : String(error)).not.toContain(unsafeSecret);
    }
  });

  it("rejects invalid apiKeyEnvVar references", () => {
    const runPlan = createValidRunPlan();
    runPlan.providerConfigs[0] = {
      ...runPlan.providerConfigs[0],
      apiKeyEnvVar: "lowercase_secret"
    };

    expect(() => validateDeliberationRunPlan(runPlan)).toThrow(RunPlanValidationError);
  });
});

describe("buildTopicContractFromRunPlan", () => {
  it("maps the run plan into the existing Topic Contract protocol shape", () => {
    const plan = validateDeliberationRunPlan(createValidRunPlan());

    const topicContract = buildTopicContractFromRunPlan(plan, {
      topicContractId: "topic-contract-1"
    });

    expect(topicContract).toMatchObject({
      id: "topic-contract-1",
      topic: plan.topic,
      participantIds: ["participant-cli", "participant-web"],
      allowedAdapters: ["openai-compatible", "manual"]
    });
    expect(topicContract.budgetLease).toMatchObject({
      maxEvents: 100,
      participantTimeoutMs: 30000
    });
    expect(topicContract.resourcePolicy).toEqual({
      resourceRefs: [
        {
          resourceId: "resource-1",
          required: false,
          preferredDeliveryMode: "none"
        }
      ]
    });
  });
});

describe("ParticipantRegistry", () => {
  it("lists and returns defensive participant copies", () => {
    const plan = validateDeliberationRunPlan(createValidRunPlan());
    const registry = new ParticipantRegistry(plan.participants);
    const participant = registry.require("participant-cli");

    participant.displayName = "mutated";

    expect(registry.require("participant-cli").displayName).toBe("CLI advocate");
    expect(registry.list()).toHaveLength(2);
  });
});

describe("InMemoryRunStore", () => {
  it("returns defensive copies from getRun and listRuns", () => {
    const eventStore = createEventStore();
    const runStore = new InMemoryRunStore();
    const result = createDeliberationRun(
      {
        runPlan: createValidRunPlan()
      },
      {
        eventStore,
        runStore,
        idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"])
      }
    );
    const listed = runStore.listRuns();
    const fetched = runStore.getRun(result.run.id);

    expect(fetched).toBeDefined();
    listed[0]!.plan.topic = "mutated";
    fetched!.plan.topic = "also mutated";

    expect(runStore.getRun(result.run.id)!.plan.topic).toBe(
      "Should Deliberum prioritize CLI-first validation or Web UI polish first?"
    );
  });
});

describe("orchestrator architecture surface", () => {
  it("does not export semantic authority, ranking, voting, final-answer, or chat APIs", () => {
    const forbiddenExports = [
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "currentBest",
      "RankingEngine",
      "CentralRanker",
      "TruthSummary",
      "winner",
      "rank",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary",
      "ChatMessage"
    ];

    for (const exportName of forbiddenExports) {
      expect(exportName in orchestrator).toBe(false);
    }
  });

  it("keeps run records operational rather than semantic truth state", () => {
    const result = createDeliberationRun(
      {
        runPlan: createValidRunPlan()
      },
      {
        eventStore: createEventStore(),
        runStore: new InMemoryRunStore(),
        idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"])
      }
    );
    const runFieldNames = collectFieldNames(result.run);

    expect(runFieldNames).not.toContain("winner");
    expect(runFieldNames).not.toContain("currentBest");
    expect(runFieldNames).not.toContain("ranking");
    expect(runFieldNames).not.toContain("score");
    expect(runFieldNames).not.toContain("vote");
    expect(runFieldNames).not.toContain("finalAnswer");
    expect(runFieldNames).not.toContain("truthSummary");
    expect(runFieldNames).not.toContain("Judge");
  });
});

function collectFieldNames(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectFieldNames);
  }

  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectFieldNames(nested)]);
}
