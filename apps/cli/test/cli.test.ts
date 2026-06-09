import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventStore } from "@deliberum/storage";
import {
  CLI_COMMANDS,
  JsonFileEventStore,
  runCli,
  type CliCoreApi,
  type CliRunResult
} from "../src";

function createTempDir(): string {
  const baseDir = join(process.cwd(), ".deliberum", "test-runs");
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "cli-"));
}

function createIds(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (!id) {
      throw new Error("Test id generator exhausted.");
    }

    index += 1;
    return id;
  };
}

function parseOutput<TOutput = Record<string, unknown>>(result: CliRunResult): TOutput {
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as TOutput;
}

async function runWithStore(
  storePath: string,
  args: string[],
  ids: readonly string[]
): Promise<CliRunResult> {
  return runCli([...args, "--store", storePath, "--json"], {
    idGenerator: createIds(ids),
    clock: () => "2026-06-10T00:00:00.000Z"
  });
}

function createFakeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "test_event",
    sequence: 0,
    authorId: "system",
    createdAt: "2026-06-10T00:00:00.000Z",
    recordedAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [],
    visibility: "public",
    trace: {},
    payload: {},
    ...overrides
  };
}

function createFakeStore(): EventStore {
  return {
    appendEvent: vi.fn(),
    appendEvents: vi.fn(),
    getEvent: vi.fn(),
    listEvents: vi.fn(() => []),
    listEventsByRange: vi.fn(() => []),
    listEventsByType: vi.fn(() => []),
    listEventsByBatch: vi.fn(() => []),
    listEventsByVisibility: vi.fn(() => [])
  } as unknown as EventStore;
}

function extractionInput(sourceEventId: string) {
  return {
    candidates: [
      {
        id: "candidate-1",
        title: "Candidate A",
        description: "Preserve multiple possible answers.",
        sourceEventIds: [sourceEventId],
        status: "active",
        supportedBy: [],
        attackedBy: [],
        qualityObligationIds: ["quality-1"],
        assumptions: [],
        tradeoffs: []
      }
    ],
    claims: [
      {
        id: "claim-1",
        content: "The candidate keeps frontier membership explicit.",
        scope: "design",
        sourceEventIds: [sourceEventId],
        supports: [],
        dependsOn: [],
        challengedBy: []
      }
    ],
    objections: [
      {
        id: "objection-1",
        targetId: "candidate-1",
        failureMode: "Important context may be missing.",
        consequence: "The proposal should remain challengeable.",
        severityClaim: "major",
        status: "open",
        sourceEventIds: [sourceEventId],
        responses: []
      }
    ],
    evidenceNeeds: [
      {
        id: "evidence-need-1",
        targetClaimId: "claim-1",
        requiredKind: "human_confirmation",
        reason: "Confirm the source contribution intent.",
        priority: "medium",
        status: "open",
        sourceEventIds: [sourceEventId]
      }
    ],
    qualityObligations: [
      {
        id: "quality-1",
        scope: "candidate",
        targetCandidateId: "candidate-1",
        requirement: "Keep the unresolved objection visible.",
        status: "unanswered",
        sourceEventIds: [sourceEventId],
        supportingRefIds: [],
        unresolvedObjectionIds: ["objection-1"]
      }
    ]
  };
}

describe("CLI command routing", () => {
  it("routes mutation and projection commands through injected core/storage APIs", async () => {
    const fakeStore = createFakeStore();
    const createEventStore = vi.fn(() => fakeStore);
    const core: Partial<CliCoreApi> = {
      createSession: vi.fn(() => ({
        sessionId: "session-1",
        initialEvent: createFakeEvent({ type: "topic_contract_published" })
      })),
      openSealedBatch: vi.fn(() => ({
        batchId: "batch-1",
        openedEvent: createFakeEvent({ type: "sealed_batch_opened" })
      })),
      submitSealedContribution: vi.fn(() => ({
        contributionEvent: createFakeEvent({ type: "sealed_contribution_submitted" })
      })),
      closeSealedBatch: vi.fn(() => ({
        revealedEvent: createFakeEvent({ type: "sealed_batch_revealed" })
      })),
      proposeExtraction: vi.fn(() => ({
        proposalId: "proposal-1",
        proposalEvent: createFakeEvent({ type: "extraction_proposed" })
      })),
      challengeProposal: vi.fn(() => ({
        challengeEvent: createFakeEvent({ type: "proposal_challenged" })
      })),
      acceptProposal: vi.fn(() => ({
        acceptanceEvent: createFakeEvent({ type: "proposal_accepted" })
      })),
      projectCandidateFrontier: vi.fn(() => ({
        basis: "accepted_active_candidates",
        candidates: []
      })),
      projectAcceptedDeliberationObjects: vi.fn(() => ({
        candidates: [],
        claims: [],
        objections: [],
        evidenceNeeds: [],
        qualityObligations: []
      })),
      projectQualityObligations: vi.fn(() => ({
        qualityObligations: []
      }))
    };
    const commonDependencies = {
      core,
      createEventStore,
      idGenerator: createIds(Array.from({ length: 40 }, (_, index) => `id-${index}`)),
      clock: () => "2026-06-10T00:00:00.000Z",
      readJsonFile: () => ({})
    };

    await runCli(["new", "Topic"], commonDependencies);
    await runCli(["batch", "open", "--session", "session-1", "--purpose", "initial_divergence"], commonDependencies);
    await runCli(
      [
        "contribution",
        "add",
        "--session",
        "session-1",
        "--batch",
        "batch-1",
        "--author",
        "participant-1",
        "--payload-json",
        "{}"
      ],
      commonDependencies
    );
    await runCli(["batch", "close", "--session", "session-1", "--batch", "batch-1"], commonDependencies);
    await runCli(
      [
        "extraction",
        "propose",
        "--session",
        "session-1",
        "--author",
        "participant-1",
        "--rationale",
        "Source extraction",
        "--input",
        "input.json"
      ],
      commonDependencies
    );
    await runCli(
      [
        "proposal",
        "challenge",
        "--session",
        "session-1",
        "--proposal-event",
        "proposal-event-1",
        "--author",
        "participant-2",
        "--reason",
        "Needs scrutiny"
      ],
      commonDependencies
    );
    await runCli(
      [
        "proposal",
        "accept",
        "--session",
        "session-1",
        "--proposal-event",
        "proposal-event-1",
        "--author",
        "participant-2",
        "--rationale",
        "Accept for working state"
      ],
      commonDependencies
    );
    await runCli(["frontier", "--session", "session-1"], commonDependencies);
    await runCli(["objections", "--session", "session-1"], commonDependencies);
    await runCli(["obligations", "--session", "session-1"], commonDependencies);

    expect(core.createSession).toHaveBeenCalledTimes(1);
    expect(core.openSealedBatch).toHaveBeenCalledTimes(1);
    expect(core.submitSealedContribution).toHaveBeenCalledTimes(1);
    expect(core.closeSealedBatch).toHaveBeenCalledTimes(1);
    expect(core.proposeExtraction).toHaveBeenCalledTimes(1);
    expect(core.challengeProposal).toHaveBeenCalledTimes(1);
    expect(core.acceptProposal).toHaveBeenCalledTimes(1);
    expect(core.projectCandidateFrontier).toHaveBeenCalledTimes(1);
    expect(core.projectAcceptedDeliberationObjects).toHaveBeenCalledTimes(1);
    expect(core.projectQualityObligations).toHaveBeenCalledTimes(1);
    expect(createEventStore).toHaveBeenCalled();
  });
});

describe("CLI integration", () => {
  it("creates a Topic Contract event without hidden current-session state", async () => {
    const dir = createTempDir();
    const storePath = join(dir, "events.json");
    const result = parseOutput<{ sessionId: string; event: { type: string; authorId: string } }>(
      await runWithStore(storePath, ["new", "Evaluate protocol scope", "--title", "Scope"], [
        "topic-contract-1",
        "session-1",
        "topic-event-1"
      ])
    );
    const storedEvents = new JsonFileEventStore({ filePath: storePath }).listEvents("session-1");

    expect(result.sessionId).toBe("session-1");
    expect(result.event.type).toBe("topic_contract_published");
    expect(result.event.authorId).toBe("system");
    expect(storedEvents).toHaveLength(1);
    expect(readdirSync(dir, { recursive: true }).map(String)).not.toContain(
      "current-session.json"
    );

    rmSync(dir, { recursive: true, force: true });
  });

  it("opens batches, adds sealed contributions, closes batches, and preserves payload keys", async () => {
    const dir = createTempDir();
    const storePath = join(dir, "events.json");
    await runWithStore(storePath, ["new", "Evaluate contribution handling"], [
      "topic-contract-1",
      "session-1",
      "topic-event-1"
    ]);
    const opened = parseOutput<{ batchId: string }>(
      await runWithStore(
        storePath,
        [
          "batch",
          "open",
          "--session",
          "session-1",
          "--purpose",
          "initial_divergence",
          "--reveal-policy",
          "manual"
        ],
        ["batch-1", "batch-open-event-1"]
      )
    );
    await runWithStore(
      storePath,
      [
        "contribution",
        "add",
        "--session",
        "session-1",
        "--batch",
        opened.batchId,
        "--author",
        "participant-1",
        "--payload-json",
        "{\"message\":\"keep this user key\",\"notes\":[\"preserved\"]}"
      ],
      ["contribution-event-1"]
    );
    await runWithStore(storePath, ["batch", "close", "--session", "session-1", "--batch", opened.batchId], [
      "batch-close-event-1"
    ]);

    const eventsOutput = parseOutput<{ events: Array<{ type: string; payload: Record<string, unknown> }> }>(
      await runWithStore(storePath, ["events", "--session", "session-1"], [])
    );
    const contributionEvent = eventsOutput.events.find(
      (event) => event.type === "sealed_contribution_submitted"
    );

    expect(eventsOutput.events.map((event) => event.type)).toEqual([
      "topic_contract_published",
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "sealed_batch_revealed"
    ]);
    expect(contributionEvent?.payload.message).toBe("keep this user key");

    rmSync(dir, { recursive: true, force: true });
  });

  it("proposes, challenges, accepts extraction, and renders projection-derived views", async () => {
    const dir = createTempDir();
    const storePath = join(dir, "events.json");
    const extractionPath = join(dir, "extraction.json");

    await runWithStore(storePath, ["new", "Evaluate projection handling"], [
      "topic-contract-1",
      "session-1",
      "topic-event-1"
    ]);
    const opened = parseOutput<{ batchId: string }>(
      await runWithStore(
        storePath,
        [
          "batch",
          "open",
          "--session",
          "session-1",
          "--purpose",
          "initial_divergence",
          "--reveal-policy",
          "manual"
        ],
        ["batch-1", "batch-open-event-1"]
      )
    );
    await runWithStore(
      storePath,
      [
        "contribution",
        "add",
        "--session",
        "session-1",
        "--batch",
        opened.batchId,
        "--author",
        "participant-1",
        "--payload-json",
        "{\"message\":\"source content\"}"
      ],
      ["source-event-1"]
    );
    writeFileSync(extractionPath, JSON.stringify(extractionInput("source-event-1")), "utf8");
    const proposed = parseOutput<{ proposalId: string; event: { id: string; payload: { status: string } } }>(
      await runWithStore(
        storePath,
        [
          "extraction",
          "propose",
          "--session",
          "session-1",
          "--author",
          "participant-2",
          "--rationale",
          "Extract working objects",
          "--input",
          extractionPath
        ],
        ["proposal-1", "proposal-event-1"]
      )
    );
    await runWithStore(
      storePath,
      [
        "proposal",
        "challenge",
        "--session",
        "session-1",
        "--proposal-event",
        proposed.event.id,
        "--author",
        "participant-3",
        "--reason",
        "Needs challenge record"
      ],
      ["challenge-1", "challenge-event-1"]
    );
    await runWithStore(
      storePath,
      [
        "proposal",
        "accept",
        "--session",
        "session-1",
        "--proposal-event",
        proposed.event.id,
        "--author",
        "participant-3",
        "--rationale",
        "Accept for working projection"
      ],
      ["acceptance-1", "acceptance-event-1"]
    );

    const frontier = parseOutput<{
      basis: "accepted_active_candidates";
      candidates: Array<{ object: { id: string } }>;
    }>(await runWithStore(storePath, ["frontier", "--session", "session-1"], []));
    const objections = parseOutput<{ objections: Array<{ object: { id: string } }> }>(
      await runWithStore(storePath, ["objections", "--session", "session-1"], [])
    );
    const obligations = parseOutput<{
      qualityObligations: Array<{ object: { id: string; status: string } }>;
    }>(await runWithStore(storePath, ["obligations", "--session", "session-1"], []));
    const eventsOutput = parseOutput<{ events: Array<{ type: string; payload: Record<string, unknown> }> }>(
      await runWithStore(storePath, ["events", "--session", "session-1"], [])
    );

    expect(proposed.proposalId).toBe("proposal-1");
    expect(proposed.event.payload.status).toBe("proposed");
    expect(frontier).toEqual({
      basis: "accepted_active_candidates",
      candidates: expect.arrayContaining([
        expect.objectContaining({
          object: expect.objectContaining({ id: "candidate-1" })
        })
      ])
    });
    expect(Object.keys(frontier)).toEqual(["basis", "candidates"]);
    expect(frontier).not.toHaveProperty("currentBest");
    expect(frontier).not.toHaveProperty("winner");
    expect(frontier).not.toHaveProperty("rank");
    expect(frontier).not.toHaveProperty("score");
    expect(frontier).not.toHaveProperty("vote");
    expect(objections.objections[0]?.object.id).toBe("objection-1");
    expect(obligations.qualityObligations[0]?.object).toMatchObject({
      id: "quality-1",
      status: "unanswered"
    });
    expect(
      eventsOutput.events.find((event) => event.type === "sealed_contribution_submitted")
        ?.payload.message
    ).toBe("source content");

    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps CLI-owned command and output surfaces free of semantic authority fields", async () => {
    const dir = createTempDir();
    const storePath = join(dir, "events.json");
    await runWithStore(storePath, ["new", "Evaluate command surface"], [
      "topic-contract-1",
      "session-1",
      "topic-event-1"
    ]);
    const output = parseOutput<Record<string, unknown>>(
      await runWithStore(storePath, ["frontier", "--session", "session-1"], [])
    );
    const forbiddenSurfaceFields = [
      "chat",
      "messages",
      "currentBest",
      "winner",
      "rank",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary",
      "Judge"
    ];

    for (const command of CLI_COMMANDS) {
      expect(command.toLowerCase()).not.toContain("chat");
      expect(command.toLowerCase()).not.toContain("messages");
    }

    for (const field of forbiddenSurfaceFields) {
      expect(output).not.toHaveProperty(field);
    }

    rmSync(dir, { recursive: true, force: true });
  });
});
