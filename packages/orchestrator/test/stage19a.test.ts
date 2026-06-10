import { describe, expect, it } from "vitest";
import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
  projectCandidateFrontier
} from "@deliberum/core";
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
  ExtractionGeneratorRegistry,
  InMemoryRunStore,
  buildExtractionContext,
  createDeliberationRun,
  runExtractionProposalRound,
  runSealedDivergenceRound
} from "../src";
import type {
  DeliberationRunRecord,
  ExtractionContext,
  ExtractionGenerator,
  ExtractionGeneratorResult
} from "../src";

function createRunPlan(
  options: {
    revealPolicy?: SealedBatchRevealPolicy;
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
        adapterId: "adapter-cli"
      },
      {
        id: "participant-web",
        kind: "model",
        displayName: "Web advocate",
        adapterId: "adapter-web"
      }
    ],
    providerConfigs: [],
    budget: {
      maxEvents: 30,
      maxProviderCalls: 20
    },
    timeouts: {
      participantMs: 1000,
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

function createAdapter(options: {
  adapterId: string;
  payload: JsonValue;
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
    prepareContribution(
      _input: ParticipantAdapterInput,
      context: ParticipantAdapterContext
    ): ParticipantAdapterResult {
      calls += 1;

      return {
        payload: options.payload,
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

function createAdapterRegistry() {
  return new AdapterRegistry([
    createAdapter({
      adapterId: "adapter-cli",
      payload: {
        position: "prioritize CLI-first validation",
        reason: "It validates the ledger and lifecycle before UI polish."
      }
    }),
    createAdapter({
      adapterId: "adapter-web",
      payload: {
        position: "prioritize Web UI polish",
        reason: "It makes projection inspection easier for users."
      }
    })
  ]);
}

function createFixture() {
  const eventStore = new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:01.000Z"
  });
  const runStore = new InMemoryRunStore();
  const created = createDeliberationRun(
    {
      runPlan: createRunPlan()
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

async function createRevealedRun() {
  const fixture = createFixture();
  const sealedResult = await runSealedDivergenceRound(
    {
      runId: fixture.run.id
    },
    {
      eventStore: fixture.eventStore,
      runStore: fixture.runStore,
      adapterRegistry: createAdapterRegistry(),
      idGenerator: createIds([
        "batch-1",
        "opened-event-1",
        "contribution-1",
        "contribution-2",
        "reveal-1"
      ]),
      clock: () => "2026-06-10T00:00:02.000Z"
    }
  );

  return {
    ...fixture,
    run: sealedResult.run
  };
}

function createValidGenerator(
  options: {
    generatorId?: string;
    result?: (context: ExtractionContext) => ExtractionGeneratorResult;
    fail?: boolean;
    onCall?: (input: unknown, context: ExtractionContext) => void;
  } = {}
): ExtractionGenerator & { readonly callCount: number } {
  let calls = 0;

  return {
    generatorId: options.generatorId ?? "generator-1",
    generateExtractionProposal(input, context) {
      calls += 1;
      options.onCall?.(input, context);

      if (options.fail) {
        throw new Error("raw generator failure must not be stored");
      }

      return options.result ? options.result(context) : createValidExtractionResult(context);
    },
    get callCount() {
      return calls;
    }
  };
}

function createValidExtractionResult(context: ExtractionContext): ExtractionGeneratorResult {
  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];

  return {
    candidates: [
      {
        id: "candidate-cli-first",
        title: "Prioritize CLI-first validation",
        description: "Validate the ledger, lifecycle, and projections before UI polish.",
        sourceEventIds,
        status: "active",
        supportedBy: ["claim-cli-validation"],
        attackedBy: [],
        qualityObligationIds: ["quality-cli-validation"],
        assumptions: ["The command path exercises the same event ledger as other surfaces."],
        tradeoffs: ["Web UI progress is slower during infrastructure hardening."]
      }
    ],
    claims: [
      {
        id: "claim-cli-validation",
        content: "CLI-first validation exercises core lifecycle behavior directly.",
        scope: "process",
        sourceEventIds,
        supports: ["candidate-cli-first"]
      }
    ],
    evidenceNeeds: [
      {
        id: "evidence-cli-usage",
        targetClaimId: "claim-cli-validation",
        requiredKind: "human_confirmation",
        reason: "Confirm the CLI flow is usable by a real operator.",
        priority: "medium",
        status: "open",
        sourceEventIds
      }
    ],
    qualityObligations: [
      {
        id: "quality-cli-validation",
        scope: "candidate",
        targetCandidateId: "candidate-cli-first",
        requirement: "Show append-only traceability through events.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: ["claim-cli-validation"],
        unresolvedObjectionIds: []
      }
    ],
    rationale: "Extract one traceable candidate from the revealed sealed contributions."
  };
}

function appendHiddenEvents(eventStore: InMemoryEventStore) {
  eventStore.appendEvent({
    id: "private-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "private_note",
    authorId: "system",
    createdAt: "2026-06-10T00:00:03.000Z",
    basedOnEventIds: [],
    visibility: "private",
    trace: {},
    payload: {
      content: "private payload must not appear"
    }
  });
  eventStore.appendEvent({
    id: "redacted-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "redacted_note",
    authorId: "system",
    createdAt: "2026-06-10T00:00:04.000Z",
    basedOnEventIds: [],
    visibility: "redacted",
    trace: {},
    payload: {
      content: "redacted payload must not appear"
    }
  });
  eventStore.appendEvent({
    id: "unrevealed-contribution-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
    authorId: "participant-hidden",
    createdAt: "2026-06-10T00:00:05.000Z",
    basedOnEventIds: [],
    visibility: "sealed",
    batchId: "batch-hidden",
    trace: {},
    payload: {
      content: "unrevealed sealed payload must not appear"
    }
  });
}

describe("Stage 19A extraction proposal orchestration", () => {
  it("builds safe extraction context from revealed contributions only", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    appendHiddenEvents(eventStore);
    const storedRun = runStore.getRun(run.id)!;
    const context = buildExtractionContext({
      run: storedRun,
      eventStore
    });
    const contextJson = JSON.stringify(context);

    expect(context.contributions).toHaveLength(2);
    expect(context.metadata.allowedSourceEventIds).toEqual([
      "contribution-1",
      "contribution-2"
    ]);
    expect(contextJson).toContain("CLI-first validation");
    expect(contextJson).toContain("Web UI polish");
    expect(contextJson).not.toContain("private payload must not appear");
    expect(contextJson).not.toContain("redacted payload must not appear");
    expect(contextJson).not.toContain("unrevealed sealed payload must not appear");
  });

  it("generates one extraction proposal through core and stores only operational state", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    const generator = createValidGenerator();

    const result = await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: new ExtractionGeneratorRegistry([generator]),
        idGenerator: createIds(["proposal-1", "proposal-event-1"]),
        clock: () => "2026-06-10T00:00:06.000Z",
        executionClaimOwnerIdGenerator: createIds(["extraction-claim-1"])
      }
    );
    const events = eventStore.listEvents(run.sessionId);
    const extractionEvents = events.filter(
      (event) => event.type === EXTRACTION_PROPOSED_EVENT_TYPE
    );
    const storedRunJson = JSON.stringify(runStore.getRun(run.id));

    expect(result.executionStatus).toBe("executed");
    expect(result.proposalResults).toEqual([
      {
        generatorId: "generator-1",
        status: "proposed",
        proposalEventId: "proposal-event-1",
        appended: true
      }
    ]);
    expect(extractionEvents).toHaveLength(1);
    expect(extractionEvents[0]).toEqual(
      expect.objectContaining({
        id: "proposal-event-1",
        type: EXTRACTION_PROPOSED_EVENT_TYPE,
        authorId: "generator-1",
        basedOnEventIds: ["contribution-1"]
      })
    );
    expect(extractionEvents[0]?.payload).toEqual(
      expect.objectContaining({
        id: "proposal-1",
        status: "proposed",
        sourceEventIds: ["contribution-1"]
      })
    );
    expect(result.run.extractionRounds?.[0]).toEqual(
      expect.objectContaining({
        roundId: "initial",
        status: "completed",
        proposalEventIds: ["proposal-event-1"]
      })
    );
    expect(storedRunJson).toContain("proposalEventId");
    expect(storedRunJson).not.toContain("Validate the ledger, lifecycle, and projections");
    expect(storedRunJson).not.toContain(
      "Extract one traceable candidate from the revealed sealed contributions."
    );
  });

  it("does not expose EventStore, core lifecycle, or append capabilities to generators", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    const seen: unknown[] = [];
    const generator = createValidGenerator({
      onCall: (input, context) => {
        seen.push(input, context);
      }
    });

    await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: new ExtractionGeneratorRegistry([generator]),
        idGenerator: createIds(["proposal-1", "proposal-event-1"])
      }
    );

    expect(JSON.stringify(seen)).not.toContain("eventStore");
    expect(JSON.stringify(seen)).not.toContain("appendEvent");
    expect(JSON.stringify(seen)).not.toContain("acceptProposal");
  });

  it("rejects generator objects that reference non-revealed source events", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    const generator = createValidGenerator({
      result: (context) => ({
        ...createValidExtractionResult(context),
        candidates: [
          {
            ...createValidExtractionResult(context).candidates![0]!,
            sourceEventIds: ["private-event-1"]
          }
        ]
      })
    });

    const result = await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: new ExtractionGeneratorRegistry([generator]),
        idGenerator: createIds(["unused-proposal", "unused-event"])
      }
    );

    expect(result.run.extractionRounds?.[0]?.status).toBe("waiting_for_generators");
    expect(result.proposalResults).toContainEqual(
      expect.objectContaining({
        generatorId: "generator-1",
        status: "failed",
        errorCategory: "extraction_validation_failed"
      })
    );
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      EXTRACTION_PROPOSED_EVENT_TYPE
    );
  });

  it("rejects untraceable internal extraction object references", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    const generator = createValidGenerator({
      result: (context) => ({
        ...createValidExtractionResult(context),
        objections: [
          {
            id: "objection-dangling",
            targetId: "missing-candidate",
            failureMode: "The target object does not exist.",
            consequence: "The proposal cannot be rebuilt coherently.",
            severityClaim: "major",
            status: "open",
            sourceEventIds: [context.metadata.allowedSourceEventIds[0]!]
          }
        ]
      })
    });

    const result = await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: new ExtractionGeneratorRegistry([generator]),
        idGenerator: createIds(["unused-proposal", "unused-event"])
      }
    );

    expect(result.proposalResults).toContainEqual(
      expect.objectContaining({
        status: "failed",
        errorCategory: "extraction_validation_failed"
      })
    );
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      EXTRACTION_PROPOSED_EVENT_TYPE
    );
  });

  it("does not duplicate proposal events or generator execution after completed retry", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    const generator = createValidGenerator();
    const registry = new ExtractionGeneratorRegistry([generator]);

    await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: registry,
        idGenerator: createIds(["proposal-1", "proposal-event-1"])
      }
    );
    const eventCount = eventStore.listEvents(run.sessionId).length;

    const retry = await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: registry,
        idGenerator: createIds(["unused-proposal", "unused-event"])
      }
    );

    expect(retry.executionStatus).toBe("already_completed");
    expect(generator.callCount).toBe(1);
    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCount);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === EXTRACTION_PROPOSED_EVENT_TYPE)).toHaveLength(1);
  });

  it("stores only safe generator failure category and no raw error", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    const generator = createValidGenerator({
      fail: true
    });

    const result = await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: new ExtractionGeneratorRegistry([generator]),
        idGenerator: createIds(["unused-proposal", "unused-event"])
      }
    );
    const storedRunJson = JSON.stringify(runStore.getRun(run.id));

    expect(result.run.extractionRounds?.[0]?.lastErrorCategory).toBe(
      "extraction_generator_failed"
    );
    expect(storedRunJson).toContain("extraction_generator_failed");
    expect(storedRunJson).not.toContain("raw generator failure must not be stored");
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      EXTRACTION_PROPOSED_EVENT_TYPE
    );
  });

  it("does not accept proposals or mutate Candidate Frontier", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();

    await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: new ExtractionGeneratorRegistry([createValidGenerator()]),
        idGenerator: createIds(["proposal-1", "proposal-event-1"])
      }
    );

    const eventTypes = eventStore.listEvents(run.sessionId).map((event) => event.type);
    const frontier = projectCandidateFrontier({
      eventStore,
      sessionId: run.sessionId
    });

    expect(eventTypes).toContain(EXTRACTION_PROPOSED_EVENT_TYPE);
    expect(eventTypes).not.toContain("proposal_accepted");
    expect(frontier).toEqual(
      expect.objectContaining({
        basis: "accepted_active_candidates",
        candidates: []
      })
    );
  });

  it("does not expose forbidden semantic fields", async () => {
    const { eventStore, runStore, run } = await createRevealedRun();
    const result = await runExtractionProposalRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        extractionGeneratorRegistry: new ExtractionGeneratorRegistry([createValidGenerator()]),
        idGenerator: createIds(["proposal-1", "proposal-event-1"])
      }
    );
    const fieldNames = collectFieldNames({
      result,
      storedRun: runStore.getRun(run.id)
    });

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
    runExtractionProposalRound
  };
}
