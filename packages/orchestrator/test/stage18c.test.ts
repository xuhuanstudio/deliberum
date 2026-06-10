import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@deliberum/storage";
import type {
  JsonValue,
  SealedBatchRevealPolicy
} from "@deliberum/protocol";
import type {
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterInput,
  ParticipantAdapterResult
} from "@deliberum/adapters";
import {
  AdapterRegistry,
  InMemoryRunStore,
  createDeliberationRun,
  runSealedDivergenceRound
} from "../src";
import type { DeliberationRunRecord } from "../src";

function createRunPlan(
  options: {
    revealPolicy?: SealedBatchRevealPolicy;
    participantMs?: number;
    providerConfig?: boolean;
  } = {}
) {
  return {
    title: "Execution priority",
    topic: "Should Deliberum prioritize CLI-first validation or Web UI polish first?",
    goals: ["Produce independent inputs"],
    constraints: ["Preserve disagreement"],
    participants: [
      {
        id: "participant-cli",
        kind: "model",
        displayName: "CLI advocate",
        adapterId: "adapter-cli",
        ...(options.providerConfig ? { providerConfigId: "provider-cli" } : {})
      },
      {
        id: "participant-web",
        kind: "model",
        displayName: "Web advocate",
        adapterId: "adapter-web"
      }
    ],
    providerConfigs: options.providerConfig
      ? [
          {
            id: "provider-cli",
            adapterId: "adapter-cli",
            providerConfigId: "provider-cli",
            modelId: "test-model",
            baseUrl: "http://127.0.0.1:11434",
            apiKeyEnvVar: "DELIBERUM_TEST_API_KEY"
          }
        ]
      : [],
    budget: {
      maxEvents: 20,
      maxProviderCalls: 20
    },
    timeouts: {
      participantMs: options.participantMs ?? 1000,
      overallMs: 30000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: ["Return contribution material only"]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: options.revealPolicy ?? "all_completed",
      participantIds: ["participant-cli", "participant-web"]
    }
  };
}

function createIds(ids: string[]) {
  let index = 0;

  return () => ids[index++] ?? `generated-${index}`;
}

function createFixture(
  options: {
    revealPolicy?: SealedBatchRevealPolicy;
    participantMs?: number;
    providerConfig?: boolean;
  } = {}
) {
  const eventStore = new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:01.000Z"
  });
  const runStore = new InMemoryRunStore();
  const created = createDeliberationRun(
    {
      runPlan: createRunPlan(options)
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
    run: created.run
  };
}

function appendPrivateEvent(eventStore: InMemoryEventStore) {
  eventStore.appendEvent({
    id: "private-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "private_note",
    authorId: "system",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [],
    visibility: "private",
    trace: {},
    payload: {
      content: "private context text"
    }
  });
}

function createAdapter(options: {
  adapterId: string;
  payload?: JsonValue;
  fail?: boolean;
  onCall?: (input: ParticipantAdapterInput, context: ParticipantAdapterContext) => void;
  deferredPayload?: Promise<JsonValue>;
}): ParticipantAdapter {
  let calls = 0;

  return {
    adapterId: options.adapterId,
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
    async prepareContribution(
      input: ParticipantAdapterInput,
      context: ParticipantAdapterContext
    ): Promise<ParticipantAdapterResult> {
      calls += 1;
      options.onCall?.(input, context);

      if (options.fail) {
        throw new Error("raw adapter failure must not be stored");
      }

      const payload = options.deferredPayload
        ? await options.deferredPayload
        : (options.payload ?? {
            content: `${options.adapterId} output`
          });

      return {
        payload,
        adapterId: options.adapterId,
        participantId: context.participantId,
        capabilities: this.capabilities,
        contextCompleteness: {
          status: "complete",
          notes: []
        },
        warnings: []
      };
    },
    get callCount() {
      return calls;
    }
  } as ParticipantAdapter & { readonly callCount: number };
}

function getAdapterCallCount(adapter: ParticipantAdapter): number {
  return (adapter as ParticipantAdapter & { readonly callCount: number }).callCount;
}

function createRegistry(adapters?: ParticipantAdapter[]) {
  return new AdapterRegistry(
    adapters ?? [
      createAdapter({
        adapterId: "adapter-cli",
        payload: {
          content: "CLI-first validation"
        }
      }),
      createAdapter({
        adapterId: "adapter-web",
        payload: {
          content: "Web UI polish"
        }
      })
    ]
  );
}

function runIds() {
  return createIds(["batch-1", "opened-event-1", "contribution-1", "contribution-2", "reveal-1"]);
}

describe("runSealedDivergenceRound", () => {
  it("opens exactly one sealed batch, submits fake adapter outputs, and reveals all_completed", async () => {
    const { eventStore, runStore, run } = createFixture();

    const result = await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry(),
        idGenerator: runIds(),
        clock: () => "2026-06-10T00:00:02.000Z"
      }
    );
    const events = eventStore.listEvents(run.sessionId);

    expect(result.batchId).toBe("batch-1");
    expect(result.revealedEventId).toBe("reveal-1");
    expect(result.run.status).toBe("revealed");
    expect(events.map((event) => event.type)).toEqual([
      "topic_contract_published",
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "sealed_contribution_submitted",
      "sealed_batch_revealed"
    ]);
    expect(events.filter((event) => event.type === "sealed_batch_opened")).toHaveLength(1);
    expect(events.filter((event) => event.type === "sealed_contribution_submitted")).toHaveLength(2);
    expect(events.filter((event) => event.type === "sealed_batch_revealed")).toHaveLength(1);
    expect(result.run.sealedDivergenceRound?.participantDispatches).toEqual([
      expect.objectContaining({
        participantId: "participant-cli",
        status: "submitted",
        contributionEventId: "contribution-1"
      }),
      expect.objectContaining({
        participantId: "participant-web",
        status: "submitted",
        contributionEventId: "contribution-2"
      })
    ]);
  });

  it("appends adapter output only as sealed contributions through core", async () => {
    const { eventStore, runStore, run } = createFixture();

    await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry(),
        idGenerator: runIds()
      }
    );

    const contributionEvents = eventStore
      .listEvents(run.sessionId)
      .filter((event) => event.type === "sealed_contribution_submitted");

    expect(contributionEvents).toHaveLength(2);
    expect(contributionEvents.every((event) => event.visibility === "sealed")).toBe(true);
    expect(contributionEvents.map((event) => event.payload)).toEqual([
      {
        content: "CLI-first validation"
      },
      {
        content: "Web UI polish"
      }
    ]);
  });

  it("does not expose EventStore or append capabilities to adapters", async () => {
    const { eventStore, runStore, run } = createFixture();
    const seen: unknown[] = [];
    const adapterCli = createAdapter({
      adapterId: "adapter-cli",
      onCall: (input, context) => {
        seen.push(input, context);
      }
    });

    await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([adapterCli, createAdapter({ adapterId: "adapter-web" })]),
        idGenerator: runIds()
      }
    );

    expect(JSON.stringify(seen)).not.toContain("eventStore");
    expect(JSON.stringify(seen)).not.toContain("appendEvent");
  });

  it("does not auto-reveal manual policy by default", async () => {
    const { eventStore, runStore, run } = createFixture({
      revealPolicy: "manual"
    });

    const result = await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry(),
        idGenerator: runIds()
      }
    );

    expect(result.run.status).toBe("waiting_for_reveal");
    expect(result.revealedEventId).toBeUndefined();
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      "sealed_batch_revealed"
    );
  });

  it("auto-closes manual policy only when all configured participants submitted", async () => {
    const { eventStore, runStore, run } = createFixture({
      revealPolicy: "manual"
    });

    const result = await runSealedDivergenceRound(
      {
        runId: run.id,
        autoCloseManual: true
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry(),
        idGenerator: runIds()
      }
    );

    expect(result.run.status).toBe("revealed");
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).toContain(
      "sealed_batch_revealed"
    );
  });

  it("does not reveal all_completed with failed participants", async () => {
    const { eventStore, runStore, run } = createFixture();
    const result = await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([
          createAdapter({
            adapterId: "adapter-cli"
          }),
          createAdapter({
            adapterId: "adapter-web",
            fail: true
          })
        ]),
        idGenerator: runIds()
      }
    );

    expect(result.run.status).toBe("waiting_for_participants");
    expect(result.run.sealedDivergenceRound?.lastErrorCategory).toBe("adapter_failed");
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      "sealed_batch_revealed"
    );
  });

  it("does not reveal manual auto-close with failed participants", async () => {
    const { eventStore, runStore, run } = createFixture({
      revealPolicy: "manual"
    });
    const result = await runSealedDivergenceRound(
      {
        runId: run.id,
        autoCloseManual: true
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([
          createAdapter({
            adapterId: "adapter-cli"
          }),
          createAdapter({
            adapterId: "adapter-web",
            fail: true
          })
        ]),
        idGenerator: runIds()
      }
    );

    expect(result.run.status).toBe("waiting_for_participants");
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      "sealed_batch_revealed"
    );
  });

  it("does not append late adapter results after timeout", async () => {
    let resolveLatePayload: (payload: JsonValue) => void = () => undefined;
    const latePayload = new Promise<JsonValue>((resolve) => {
      resolveLatePayload = resolve;
    });
    const { eventStore, runStore, run } = createFixture({
      participantMs: 1
    });

    const result = await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([
          createAdapter({
            adapterId: "adapter-cli",
            deferredPayload: latePayload
          }),
          createAdapter({
            adapterId: "adapter-web",
            fail: true
          })
        ]),
        idGenerator: runIds()
      }
    );

    expect(result.run.status).toBe("waiting_for_participants");
    expect(result.participantResults).toContainEqual(
      expect.objectContaining({
        participantId: "participant-cli",
        status: "timed_out",
        errorCategory: "adapter_timed_out"
      })
    );
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === "sealed_contribution_submitted")).toHaveLength(0);

    resolveLatePayload({
      content: "late payload must not append"
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === "sealed_contribution_submitted")).toHaveLength(0);
    expect(JSON.stringify(runStore.getRun(run.id))).not.toContain("late payload must not append");
  });

  it("retry after partial failure does not duplicate successful participant contributions", async () => {
    const { eventStore, runStore, run } = createFixture();
    const adapterCli = createAdapter({
      adapterId: "adapter-cli",
      payload: {
        content: "stable success"
      }
    });
    const adapterWebFirst = createAdapter({
      adapterId: "adapter-web",
      fail: true
    });

    const first = await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([adapterCli, adapterWebFirst]),
        idGenerator: runIds()
      }
    );

    expect(first.run.status).toBe("waiting_for_participants");
    expect(getAdapterCallCount(adapterCli)).toBe(1);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === "sealed_contribution_submitted")).toHaveLength(1);

    const adapterWebRetry = createAdapter({
      adapterId: "adapter-web",
      payload: {
        content: "retry success"
      }
    });
    const second = await runSealedDivergenceRound(
      {
        runId: run.id,
        retryFailedParticipants: true
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([adapterCli, adapterWebRetry]),
        idGenerator: createIds(["unused-batch", "unused-open", "retry-contribution", "retry-reveal"])
      }
    );

    expect(second.run.status).toBe("revealed");
    expect(getAdapterCallCount(adapterCli)).toBe(1);
    expect(getAdapterCallCount(adapterWebRetry)).toBe(1);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === "sealed_contribution_submitted")).toHaveLength(2);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === "sealed_batch_opened")).toHaveLength(1);
    expect(second.run.sealedDivergenceRound?.participantDispatches).toContainEqual(
      expect.objectContaining({
        participantId: "participant-web",
        status: "submitted",
        previousErrorCategories: ["adapter_failed"]
      })
    );
  });

  it("revealed round retry does not execute adapters or duplicate events", async () => {
    const { eventStore, runStore, run } = createFixture();
    const adapterCli = createAdapter({ adapterId: "adapter-cli" });
    const adapterWeb = createAdapter({ adapterId: "adapter-web" });
    await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([adapterCli, adapterWeb]),
        idGenerator: runIds()
      }
    );
    const eventCount = eventStore.listEvents(run.sessionId).length;

    const retry = await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([adapterCli, adapterWeb]),
        idGenerator: createIds(["unused"])
      }
    );

    expect(retry.run.status).toBe("revealed");
    expect(getAdapterCallCount(adapterCli)).toBe(1);
    expect(getAdapterCallCount(adapterWeb)).toBe(1);
    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCount);
  });

  it("respects Stage 18B context visibility during dispatch", async () => {
    const { eventStore, runStore, run } = createFixture();
    appendPrivateEvent(eventStore);
    let capturedInput: ParticipantAdapterInput | undefined;

    await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([
          createAdapter({
            adapterId: "adapter-cli",
            onCall: (input) => {
              capturedInput = input;
            }
          }),
          createAdapter({
            adapterId: "adapter-web"
          })
        ]),
        idGenerator: runIds()
      }
    );

    expect(JSON.stringify(capturedInput)).not.toContain("private context text");
    expect(JSON.stringify(capturedInput)).toContain("event_visibility");
  });

  it("does not store contribution payloads or provider secrets in run records", async () => {
    const { eventStore, runStore, run } = createFixture({
      providerConfig: true
    });
    const secret = "sk-runtime-secret";

    await runSealedDivergenceRound(
      {
        runId: run.id,
        env: {
          DELIBERUM_TEST_API_KEY: secret
        }
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry([
          createAdapter({
            adapterId: "adapter-cli",
            payload: {
              content: "sensitive adapter output"
            }
          }),
          createAdapter({
            adapterId: "adapter-web"
          })
        ]),
        idGenerator: runIds()
      }
    );

    const storedRun = JSON.stringify(runStore.getRun(run.id));

    expect(storedRun).not.toContain(secret);
    expect(storedRun).not.toContain("sensitive adapter output");
    expect(storedRun).toContain("contributionEventId");
  });

  it("does not expose forbidden semantic fields", async () => {
    const { eventStore, runStore, run } = createFixture();
    const result = await runSealedDivergenceRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        adapterRegistry: createRegistry(),
        idGenerator: runIds()
      }
    );
    const fieldNames = collectFieldNames(result);

    expect("winner" in orchestratorExportSurface()).toBe(false);
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

function orchestratorExportSurface() {
  return {
    runSealedDivergenceRound
  };
}
