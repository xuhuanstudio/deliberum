import { describe, expect, it } from "vitest";
import { InMemoryEventStore, type EventStore } from "@deliberum/storage";
import type { JsonValue } from "@deliberum/protocol";
import {
  AdapterRegistry,
  AdapterRegistryError,
  InMemoryRunStore,
  ProviderSecretResolutionError,
  buildParticipantContext,
  buildParticipantDispatchInput,
  createDeliberationRun,
  createProviderConfigSafeView,
  resolveProviderRuntimeConfig
} from "../src";
import * as orchestrator from "../src";
import type {
  DeliberationRunRecord,
  ProviderModelConfigRef,
  RegisteredParticipantAdapter
} from "../src";

function createRunPlan() {
  return {
    title: "CLI or Web priority",
    topic: "Should Deliberum prioritize CLI-first validation or Web UI polish first?",
    goals: ["Produce a traceable provisional recommendation"],
    constraints: ["Preserve disagreement"],
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
      maxProviderCalls: 10
    },
    timeouts: {
      participantMs: 30000,
      overallMs: 120000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: ["Return conditions and unresolved questions"]
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

function createFixture(runPlan: ReturnType<typeof createRunPlan> = createRunPlan()) {
  const eventStore = new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:01.000Z"
  });
  const runStore = new InMemoryRunStore();
  const result = createDeliberationRun(
    {
      runPlan
    },
    {
      eventStore,
      runStore,
      idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"]),
      clock: () => "2026-06-10T00:00:00.000Z"
    }
  );

  return {
    eventStore,
    runStore,
    run: result.run
  };
}

function appendFixtureEvent(
  eventStore: EventStore,
  input: {
    id: string;
    type: string;
    authorId?: string;
    visibility: "public" | "sealed" | "private" | "redacted";
    payload: JsonValue;
    batchId?: string;
    basedOnEventIds?: string[];
  }
) {
  return eventStore.appendEvent({
    id: input.id,
    sessionId: "session-1",
    schemaVersion: "1",
    type: input.type,
    authorId: input.authorId ?? "system",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: input.basedOnEventIds ?? [],
    ...(input.batchId ? { batchId: input.batchId } : {}),
    visibility: input.visibility,
    trace: {},
    payload: input.payload
  });
}

function createAdapter(adapterId: string, onPrepare?: () => void): RegisteredParticipantAdapter {
  return {
    adapterId,
    capabilities: {
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
      reliability: "high"
    },
    prepareContribution() {
      onPrepare?.();

      return {
        payload: {
          material: "not truth"
        },
        adapterId,
        participantId: "participant-cli",
        capabilities: this.capabilities,
        contextCompleteness: {
          status: "unknown",
          notes: []
        },
        warnings: []
      };
    }
  };
}

function getContextEvent(run: DeliberationRunRecord, eventStore: EventStore, eventId: string) {
  const context = buildParticipantContext({
    run,
    eventStore,
    participantId: "participant-cli"
  });

  return context.events.find((event) => event.id === eventId);
}

describe("buildParticipantContext", () => {
  it("includes public event payloads", () => {
    const { eventStore, run } = createFixture();
    appendFixtureEvent(eventStore, {
      id: "public-event-1",
      type: "public_note",
      visibility: "public",
      payload: {
        visible: "public content"
      }
    });

    expect(getContextEvent(run, eventStore, "public-event-1")?.payload).toEqual({
      visible: "public content"
    });
  });

  it("redacts private and redacted event payloads", () => {
    const { eventStore, run } = createFixture();
    appendFixtureEvent(eventStore, {
      id: "private-event-1",
      type: "private_note",
      visibility: "private",
      payload: {
        secret: "private payload text"
      }
    });
    appendFixtureEvent(eventStore, {
      id: "redacted-event-1",
      type: "redacted_note",
      visibility: "redacted",
      payload: {
        secret: "redacted payload text"
      }
    });

    const context = buildParticipantContext({
      run,
      eventStore,
      participantId: "participant-cli"
    });

    expect(context.events.find((event) => event.id === "private-event-1")?.payload).toEqual({
      redacted: true,
      reason: "event_visibility"
    });
    expect(context.events.find((event) => event.id === "redacted-event-1")?.payload).toEqual({
      redacted: true,
      reason: "event_visibility"
    });
    expect(JSON.stringify(context)).not.toContain("private payload text");
    expect(JSON.stringify(context)).not.toContain("redacted payload text");
  });

  it("redacts unrevealed sealed contribution payloads", () => {
    const { eventStore, run } = createFixture();
    appendFixtureEvent(eventStore, {
      id: "sealed-contribution-1",
      type: "sealed_contribution_submitted",
      authorId: "participant-cli",
      visibility: "sealed",
      batchId: "batch-1",
      basedOnEventIds: ["batch-opened-1"],
      payload: {
        content: "hidden sealed contribution"
      }
    });

    const contextEvent = getContextEvent(run, eventStore, "sealed-contribution-1");

    expect(contextEvent?.payload).toEqual({
      redacted: true,
      reason: "sealed_until_reveal"
    });
    expect(JSON.stringify(contextEvent)).not.toContain("hidden sealed contribution");
  });

  it("exposes sealed contribution payloads only after a matching public reveal references them", () => {
    const { eventStore, run } = createFixture();
    appendFixtureEvent(eventStore, {
      id: "sealed-contribution-1",
      type: "sealed_contribution_submitted",
      authorId: "participant-cli",
      visibility: "sealed",
      batchId: "batch-1",
      basedOnEventIds: ["batch-opened-1"],
      payload: {
        content: "revealed sealed contribution"
      }
    });
    appendFixtureEvent(eventStore, {
      id: "revealed-batch-1",
      type: "sealed_batch_revealed",
      visibility: "public",
      batchId: "batch-1",
      basedOnEventIds: ["batch-opened-1", "sealed-contribution-1"],
      payload: {
        id: "batch-1",
        status: "revealed"
      }
    });

    expect(getContextEvent(run, eventStore, "sealed-contribution-1")?.payload).toEqual({
      content: "revealed sealed contribution"
    });
  });

  it("does not expose sealed payloads merely because batch id matches", () => {
    const { eventStore, run } = createFixture();
    appendFixtureEvent(eventStore, {
      id: "sealed-contribution-1",
      type: "sealed_contribution_submitted",
      authorId: "participant-cli",
      visibility: "sealed",
      batchId: "batch-1",
      basedOnEventIds: ["batch-opened-1"],
      payload: {
        content: "still hidden"
      }
    });
    appendFixtureEvent(eventStore, {
      id: "revealed-batch-1",
      type: "sealed_batch_revealed",
      visibility: "public",
      batchId: "batch-1",
      basedOnEventIds: ["batch-opened-1"],
      payload: {
        id: "batch-1",
        status: "revealed"
      }
    });

    expect(getContextEvent(run, eventStore, "sealed-contribution-1")?.payload).toEqual({
      redacted: true,
      reason: "sealed_until_reveal"
    });
  });

  it("returns sanitized copies and does not mutate ledger events or append events", () => {
    const { eventStore, run } = createFixture();
    appendFixtureEvent(eventStore, {
      id: "private-event-1",
      type: "private_note",
      visibility: "private",
      payload: {
        secret: "private payload text"
      }
    });
    const eventCountBefore = eventStore.listEvents(run.sessionId).length;
    const storedBefore = eventStore.getEvent("private-event-1");

    const context = buildParticipantContext({
      run,
      eventStore,
      participantId: "participant-cli"
    });
    context.events.find((event) => event.id === "private-event-1")!.payload = {
      redacted: true,
      reason: "sealed_until_reveal"
    };

    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCountBefore);
    expect(eventStore.getEvent("private-event-1")).toEqual(storedBefore);
    expect(eventStore.getEvent("private-event-1")?.payload).toEqual({
      secret: "private payload text"
    });
  });
});

describe("AdapterRegistry", () => {
  it("rejects duplicate adapter ids", () => {
    expect(
      () => new AdapterRegistry([createAdapter("fake-adapter"), createAdapter("fake-adapter")])
    ).toThrow(AdapterRegistryError);
  });

  it("resolves known adapter ids without executing adapters", () => {
    let prepareCalls = 0;
    const adapter = createAdapter("fake-adapter", () => {
      prepareCalls += 1;
    });
    const registry = new AdapterRegistry([adapter]);

    expect(registry.require("fake-adapter")).toBe(adapter);
    expect(registry.list()).toEqual([
      {
        adapterId: "fake-adapter",
        capabilities: adapter.capabilities
      }
    ]);
    expect(prepareCalls).toBe(0);
  });
});

describe("provider secret resolver", () => {
  it("resolves provider secrets from injected env maps only", () => {
    const providerConfig = createRunPlan().providerConfigs[0] as ProviderModelConfigRef;

    const runtimeConfig = resolveProviderRuntimeConfig({
      providerConfig,
      env: {
        DELIBERUM_OPENAI_API_KEY: "sk-runtime-secret"
      }
    });

    expect(runtimeConfig.apiKey).toBe("sk-runtime-secret");
    expect(runtimeConfig.apiKeyEnvVar).toBe("DELIBERUM_OPENAI_API_KEY");
    expect(createProviderConfigSafeView(runtimeConfig)).not.toHaveProperty("apiKey");
    expect(JSON.stringify(createProviderConfigSafeView(runtimeConfig))).not.toContain(
      "sk-runtime-secret"
    );
  });

  it("passes non-secret HTTP-template variables through runtime and safe views", () => {
    const providerConfig = {
      ...createRunPlan().providerConfigs[0],
      adapterId: "http-template",
      httpTemplate: {
        variables: {
          route: "sealed-divergence",
          maxItems: 3
        }
      }
    } as ProviderModelConfigRef;

    const runtimeConfig = resolveProviderRuntimeConfig({
      providerConfig,
      env: {
        DELIBERUM_OPENAI_API_KEY: "sk-runtime-secret"
      }
    });
    const safeView = createProviderConfigSafeView(runtimeConfig);

    expect(runtimeConfig.httpTemplate).toEqual({
      variables: {
        route: "sealed-divergence",
        maxItems: 3
      }
    });
    expect(safeView).toMatchObject({
      httpTemplate: {
        variables: {
          route: "sealed-divergence",
          maxItems: 3
        }
      }
    });
    expect(JSON.stringify(safeView)).not.toContain("sk-runtime-secret");
    expect(safeView).not.toHaveProperty("apiKey");
  });

  it("rejects missing env vars with safe errors", () => {
    const providerConfig = createRunPlan().providerConfigs[0] as ProviderModelConfigRef;
    const unrelatedSecret = "sk-unrelated-secret";

    try {
      resolveProviderRuntimeConfig({
        providerConfig,
        env: {
          OTHER_SECRET: unrelatedSecret
        }
      });
      throw new Error("Expected missing env var to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderSecretResolutionError);
      expect(error instanceof Error ? error.message : String(error)).toContain(
        "DELIBERUM_OPENAI_API_KEY"
      );
      expect(error instanceof Error ? error.message : String(error)).not.toContain(unrelatedSecret);
    }
  });
});

describe("buildParticipantDispatchInput", () => {
  it("builds a typed dispatch envelope without executing adapters or appending events", () => {
    const { eventStore, runStore, run } = createFixture();
    let prepareCalls = 0;
    const registry = new AdapterRegistry([
      createAdapter("openai-compatible", () => {
        prepareCalls += 1;
      })
    ]);
    appendFixtureEvent(eventStore, {
      id: "event-2",
      type: "participant_context_fixture",
      visibility: "public",
      payload: {
        id: "internal-object-1",
        runId: "run-1",
        sessionId: "session-1",
        eventId: "event-99",
        content: "Visible participant note",
        nested: {
          summary: "Keep user-facing discussion context available."
        }
      }
    });
    const eventCountBefore = eventStore.listEvents(run.sessionId).length;
    const runtimeSecret = "sk-dispatch-secret";

    const envelope = buildParticipantDispatchInput({
      run,
      eventStore,
      adapterRegistry: registry,
      participantId: "participant-cli",
      env: {
        DELIBERUM_OPENAI_API_KEY: runtimeSecret
      }
    });

    expect(envelope.adapterId).toBe("openai-compatible");
    expect(envelope.providerRuntimeConfig?.apiKey).toBe(runtimeSecret);
    expect(envelope.providerSafeView).not.toHaveProperty("apiKey");
    expect(envelope.adapterInput.instructions).toContain("plain-language");
    expect(envelope.adapterContext.instructions).toContain("non-technical reader");
    expect(envelope.adapterInput.payload).not.toEqual(envelope.context);
    expect(envelope.adapterContext.sessionId).toBe(run.sessionId);
    expect(envelope.adapterContext.sourceEventIds).toEqual(envelope.context.metadata.eventIds);
    expect(prepareCalls).toBe(0);
    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCountBefore);
    const adapterInputText = JSON.stringify(envelope.adapterInput);
    expect(adapterInputText).toContain(createRunPlan().topic);
    expect(adapterInputText).toContain("CLI advocate");
    expect(adapterInputText).toContain("Visible participant note");
    expect(adapterInputText).toContain("Keep user-facing discussion context available.");
    expect(adapterInputText).not.toContain("run-1");
    expect(adapterInputText).not.toContain("session-1");
    expect(adapterInputText).not.toContain("event-1");
    expect(adapterInputText).not.toContain("event-2");
    expect(adapterInputText).not.toContain("event-99");
    expect(adapterInputText).not.toContain("internal-object-1");
    expect(adapterInputText).not.toContain("adapterId");
    expect(adapterInputText).not.toContain("providerConfigId");
    expect(JSON.stringify(envelope.context)).not.toContain(runtimeSecret);
    expect(JSON.stringify(envelope.providerSafeView)).not.toContain(runtimeSecret);
    expect(adapterInputText).not.toContain(runtimeSecret);
    expect(JSON.stringify(runStore.getRun(run.id))).not.toContain(runtimeSecret);
    expect(JSON.stringify(eventStore.listEvents(run.sessionId))).not.toContain(runtimeSecret);
  });

  it("passes discussion-language instructions into OpenAI-compatible participant prompts", () => {
    const chineseQuestion = "\u6211\u4eec\u5e94\u8be5\u5982\u4f55\u8bc4\u4f30\u65b0\u529f\u80fd\u53d1\u5e03\uff1f";
    const plan = {
      ...createRunPlan(),
      title: "\u4e2d\u6587\u53d1\u5e03\u8bc4\u4f30",
      topic: chineseQuestion,
      goals: ["\u5f62\u6210\u53ef\u5ba1\u9605\u7684\u9636\u6bb5\u6027\u7ed3\u8bba"],
      constraints: [
        "Write all participant responses, review notes, and conclusions in the same language as the discussion question."
      ],
      output: {
        language: "same as discussion question",
        style: "clear",
        expectations: [
          "Write all participant responses, review notes, and conclusions in the same language as the discussion question."
        ]
      }
    };
    const { eventStore, run } = createFixture(plan);
    const registry = new AdapterRegistry([createAdapter("openai-compatible")]);

    const envelope = buildParticipantDispatchInput({
      run,
      eventStore,
      adapterRegistry: registry,
      participantId: "participant-cli",
      env: {
        DELIBERUM_OPENAI_API_KEY: "sk-dispatch-secret"
      }
    });
    const adapterInputText = JSON.stringify(envelope.adapterInput);

    expect(envelope.adapterContext.instructions).toContain(
      "Match the discussion question language for every user-visible sentence."
    );
    expect(envelope.adapterContext.instructions).toContain(
      "Use the explicit target response language in the prompt payload."
    );
    expect(envelope.adapterContext.instructions).toContain(
      "If the discussion question is in Simplified Chinese, write Simplified Chinese."
    );
    expect(envelope.adapterContext.instructions).toContain(
      "Do not let English prompt section headings change the response language."
    );
    expect(envelope.adapterInput.instructions).toContain(
      "Answer in the same language as the discussion question."
    );
    expect(envelope.adapterInput.instructions).toContain(
      "When prior participant, reviewer, or evidence-checker messages are visible, respond to the current room state instead of starting a disconnected answer."
    );
    expect(adapterInputText).toContain(chineseQuestion);
    expect(adapterInputText).toContain("Response language contract");
    expect(adapterInputText).toContain(
      "Actual participant contribution language: Simplified Chinese."
    );
    expect(adapterInputText).toContain("Write the answer content in Simplified Chinese.");
    expect(adapterInputText).toContain(
      "Do not answer in English unless quoting a short English term from the discussion brief."
    );
    expect(adapterInputText).toContain(
      "\u91cd\u8981\uff1a\u8bf7\u7528\u7b80\u4f53\u4e2d\u6587\u64b0\u5199\u6240\u6709\u9762\u5411\u7528\u6237\u7684\u5185\u5bb9\u3002"
    );
    expect(adapterInputText).toContain(
      "\u5982\u679c\u4e0b\u65b9\u51fa\u73b0\u82f1\u6587\u7ed3\u6784\u6807\u9898\uff0c\u5b83\u4eec\u53ea\u662f\u63d0\u793a\u7ed3\u6784\uff0c\u4e0d\u662f\u56de\u7b54\u8bed\u8a00\u3002"
    );
    expect(adapterInputText).toContain(
      "Do not translate the Chinese discussion question into an English answer."
    );
    expect(adapterInputText).toContain("Language");
    expect(adapterInputText).toContain("Target response language: Simplified Chinese.");
    expect(adapterInputText).toContain(
      "Write every user-visible sentence in the same language as the discussion question."
    );
    expect(adapterInputText).toContain(
      "Treat the target response language as stronger than English section headings in this prompt."
    );
    expect(adapterInputText).toContain("Conversation behavior");
    expect(adapterInputText).toContain(
      "Continue the discussion by responding to the visible room updates, including participant messages, reviewer objections, and evidence checks when present."
    );
    expect(adapterInputText).toContain(
      "Keep the response independent, but make it read like a contribution in an ongoing multi-participant room."
    );
    expect(adapterInputText).toContain("Simplified Chinese");
    expect(adapterInputText).not.toContain("run-1");
    expect(adapterInputText).not.toContain("session-1");
    expect(adapterInputText).not.toContain("sk-dispatch-secret");
  });

  it("does not treat adapter output as truth", () => {
    const adapter = createAdapter("openai-compatible");
    const registry = new AdapterRegistry([adapter]);

    expect(registry.require("openai-compatible")).toBe(adapter);
    expect(Object.keys(registry.require("openai-compatible"))).not.toContain("truth");
  });
});

describe("Stage 18B architecture surface", () => {
  it("does not export forbidden semantic authority APIs", () => {
    const forbiddenExports = [
      "winner",
      "currentBest",
      "ranking",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary",
      "Judge"
    ];

    for (const exportName of forbiddenExports) {
      expect(exportName in orchestrator).toBe(false);
    }
  });

  it("does not introduce forbidden generated field names", () => {
    const { eventStore, run } = createFixture();
    const registry = new AdapterRegistry([createAdapter("openai-compatible")]);
    const envelope = buildParticipantDispatchInput({
      run,
      eventStore,
      adapterRegistry: registry,
      participantId: "participant-cli",
      env: {
        DELIBERUM_OPENAI_API_KEY: "sk-dispatch-secret"
      }
    });
    const fieldNames = collectFieldNames(envelope);

    expect(fieldNames).not.toContain("winner");
    expect(fieldNames).not.toContain("currentBest");
    expect(fieldNames).not.toContain("ranking");
    expect(fieldNames).not.toContain("score");
    expect(fieldNames).not.toContain("vote");
    expect(fieldNames).not.toContain("finalAnswer");
    expect(fieldNames).not.toContain("truthSummary");
    expect(fieldNames).not.toContain("Judge");
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
