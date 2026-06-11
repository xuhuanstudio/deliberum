import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DaemonClientError } from "@deliberum/client";
import type { EventStore } from "@deliberum/storage";
import {
  CLI_COMMANDS,
  JsonFileEventStore,
  runCli,
  type CliCoreApi,
  type CliRunDaemonClient,
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

function createFakeProjectionMetadata() {
  return {
    version: "1",
    eventRange: null,
    eventIds: []
  };
}

function createFakeStore(): EventStore {
  return {
    appendEvent: vi.fn(),
    appendEventResult: vi.fn(),
    appendEvents: vi.fn(),
    getEvent: vi.fn(),
    listEvents: vi.fn(() => []),
    listEventsByRange: vi.fn(() => []),
    listEventsByType: vi.fn(() => []),
    listEventsByBatch: vi.fn(() => []),
    listEventsByVisibility: vi.fn(() => [])
  } as unknown as EventStore;
}

function createFakeRunDaemonClient(
  overrides: Partial<CliRunDaemonClient> = {}
): CliRunDaemonClient & Record<string, ReturnType<typeof vi.fn>> {
  return {
    createRun: vi.fn(async (input: unknown) => ({
      run: {
        runId: "run-1"
      },
      session: {
        sessionId: "session-1"
      },
      event: {
        type: "topic_contract_published"
      },
      input
    })),
    listRuns: vi.fn(async () => ({
      runs: [
        {
          runId: "run-1"
        }
      ]
    })),
    getRun: vi.fn(async (runId: string) => ({
      run: {
        runId
      }
    })),
    getRunEvents: vi.fn(async (runId: string) => ({
      runId,
      sessionId: "session-1",
      events: [
        {
          id: "event-1",
          type: "sealed_batch_opened"
        }
      ]
    })),
    getRunEventsStreamUrl: vi.fn((runId: string) =>
      `http://127.0.0.1:3877/runs/${encodeURIComponent(runId)}/events/stream`
    ),
    startRun: vi.fn(async (runId: string, startRequest: unknown) => ({
      run: {
        runId
      },
      stages: [],
      stopped: false,
      startRequest
    })),
    getRunOutcome: vi.fn(async (runId: string) => ({
      runId,
      sessionId: "session-1",
      status: "not_available",
      reason: "final_candidate_proposal_unavailable"
    })),
    ...overrides
  } as CliRunDaemonClient & Record<string, ReturnType<typeof vi.fn>>;
}

function createRunCliDependencies(options: {
  client?: CliRunDaemonClient;
  env?: Record<string, string | undefined>;
  readJsonFile?: (filePath: string) => unknown;
} = {}) {
  const daemonClient = options.client ?? createFakeRunDaemonClient();
  const createDaemonClient = vi.fn(() => daemonClient);
  const createEventStore = vi.fn(() => {
    throw new Error("Run commands must not create the local EventStore.");
  });

  return {
    daemonClient,
    createDaemonClient,
    createEventStore,
    dependencies: {
      createDaemonClient,
      createEventStore,
      env: options.env ?? {},
      readJsonFile: options.readJsonFile ?? (() => ({}))
    }
  };
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

function createSseStream(frames: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }

      controller.close();
    }
  });
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
        candidates: [],
        projection: createFakeProjectionMetadata()
      })),
      projectAcceptedDeliberationObjects: vi.fn(() => ({
        candidates: [],
        claims: [],
        objections: [],
        evidenceNeeds: [],
        qualityObligations: [],
        projection: createFakeProjectionMetadata()
      })),
      projectQualityObligations: vi.fn(() => ({
        qualityObligations: [],
        projection: createFakeProjectionMetadata()
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

  it("routes run commands through the daemon client without creating the local EventStore", async () => {
    const { daemonClient, createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies({
        readJsonFile: (filePath) =>
          filePath === "start.json"
            ? {
                sealedDivergence: {
                  autoCloseManual: true
                }
              }
            : {
                topic: "Run from CLI"
              }
      });

    const created = parseOutput<{ input: { runPlan: { topic: string } } }>(
      await runCli(["runs", "create", "--input", "run-plan.json", "--json"], dependencies)
    );
    const listed = parseOutput<{ runs: Array<{ runId: string }> }>(
      await runCli(["runs", "list", "--json"], dependencies)
    );
    const shown = parseOutput<{ run: { runId: string } }>(
      await runCli(["runs", "show", "run-1", "--json"], dependencies)
    );
    const events = parseOutput<{ runId: string; sessionId: string; events: Array<{ type: string }> }>(
      await runCli(["runs", "events", "run-1", "--json"], dependencies)
    );
    const started = parseOutput<{ startRequest: { sealedDivergence: { autoCloseManual: boolean } } }>(
      await runCli(["runs", "start", "run-1", "--input", "start.json", "--json"], dependencies)
    );
    const outcome = parseOutput<{ status: string; reason: string }>(
      await runCli(["runs", "outcome", "run-1", "--json"], dependencies)
    );

    expect(created.input.runPlan.topic).toBe("Run from CLI");
    expect(listed.runs).toEqual([{ runId: "run-1" }]);
    expect(shown.run.runId).toBe("run-1");
    expect(events).toMatchObject({
      runId: "run-1",
      sessionId: "session-1",
      events: [
        {
          type: "sealed_batch_opened"
        }
      ]
    });
    expect(started.startRequest.sealedDivergence.autoCloseManual).toBe(true);
    expect(outcome).toMatchObject({
      status: "not_available",
      reason: "final_candidate_proposal_unavailable"
    });
    expect(daemonClient.createRun).toHaveBeenCalledWith({
      runPlan: {
        topic: "Run from CLI"
      }
    });
    expect(daemonClient.listRuns).toHaveBeenCalledTimes(1);
    expect(daemonClient.getRun).toHaveBeenCalledWith("run-1");
    expect(daemonClient.getRunEvents).toHaveBeenCalledWith("run-1");
    expect(daemonClient.startRun).toHaveBeenCalledWith("run-1", {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    expect(daemonClient.getRunOutcome).toHaveBeenCalledWith("run-1");
    expect(createDaemonClient).toHaveBeenCalledTimes(6);
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("follows daemon-redacted run event SSE as JSON lines without using the local EventStore", async () => {
    const { createDaemonClient, createEventStore, dependencies } = createRunCliDependencies();
    const firstEvent = {
      id: "event-1",
      type: "sealed_batch_opened",
      payload: {
        status: "open"
      }
    };
    const secondEvent = {
      id: "event-2",
      type: "sealed_contribution_submitted",
      payload: {
        redacted: true,
        reason: "sealed_until_reveal"
      }
    };
    const streamFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: createSseStream([
        `event: event\nid: event-1\ndata: ${JSON.stringify(firstEvent)}\n\n`,
        ": keepalive\n\n",
        `event: event\nid: event-2\ndata: ${JSON.stringify(secondEvent)}\n\n`
      ])
    }));
    const writes: string[] = [];

    const result = await runCli(["runs", "events", "run-1", "--follow", "--json"], {
      ...dependencies,
      runEventStreamFetch: streamFetch,
      writeStdout: (chunk) => {
        writes.push(chunk);
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.output).toEqual({
      runId: "run-1",
      followed: true,
      events: 2
    });
    expect(writes.join("")).toBe(`${JSON.stringify(firstEvent)}\n${JSON.stringify(secondEvent)}\n`);
    expect(streamFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3877/runs/run-1/events/stream",
      {
        method: "GET",
        headers: {
          Accept: "text/event-stream"
        }
      }
    );
    expect(createDaemonClient).toHaveBeenCalledTimes(1);
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("buffers split CRLF run event SSE frames before writing JSON lines", async () => {
    const { createEventStore, dependencies } = createRunCliDependencies();
    const event = {
      id: "event-1",
      type: "sealed_batch_opened",
      payload: {
        status: "open"
      }
    };
    const frame = `event: event\r\nid: event-1\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
    const streamFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: createSseStream([frame.slice(0, 11), frame.slice(11, 37), frame.slice(37)])
    }));

    const result = await runCli(["runs", "events", "run-1", "--follow", "--json"], {
      ...dependencies,
      runEventStreamFetch: streamFetch
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${JSON.stringify(event)}\n`);
    expect(result.output).toEqual({
      runId: "run-1",
      followed: true,
      events: 1
    });
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("resolves daemon URL from flag, injected env, and local default", async () => {
    const flagged = createRunCliDependencies({
      env: {
        DELIBERUM_DAEMON_URL: "http://127.0.0.1:4888"
      }
    });
    await runCli(
      ["runs", "list", "--daemon-url", "http://localhost:4999", "--json"],
      flagged.dependencies
    );

    const envBacked = createRunCliDependencies({
      env: {
        DELIBERUM_DAEMON_URL: " http://[::1]:5777 "
      }
    });
    await runCli(["runs", "list", "--json"], envBacked.dependencies);

    const defaulted = createRunCliDependencies({
      env: {
        DELIBERUM_DAEMON_URL: "   "
      }
    });
    await runCli(["runs", "list", "--json"], defaulted.dependencies);

    expect(flagged.createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4999"
    });
    expect(envBacked.createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://[::1]:5777"
    });
    expect(defaulted.createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:3877"
    });
    expect(flagged.createEventStore).not.toHaveBeenCalled();
    expect(envBacked.createEventStore).not.toHaveBeenCalled();
    expect(defaulted.createEventStore).not.toHaveBeenCalled();
  });

  it("rejects unsafe daemon URLs before creating daemon clients or stores", async () => {
    for (const unsafeUrl of [
      "ftp://localhost:3877",
      "http://user:pass@localhost:3877",
      "http://example.com:3877",
      "http://localhost:3877?api_key=sk-secret123",
      "http://localhost:3877#secret"
    ]) {
      const { createDaemonClient, createEventStore, dependencies } = createRunCliDependencies();
      const result = await runCli(["runs", "list", "--daemon-url", unsafeUrl, "--json"], dependencies);
      const text = result.stdout;

      expect(result.exitCode).toBe(1);
      expect(text).not.toContain(unsafeUrl);
      expect(text).not.toContain("sk-secret123");
      expect(text).not.toContain("user:pass");
      expect(createDaemonClient).not.toHaveBeenCalled();
      expect(createEventStore).not.toHaveBeenCalled();
    }
  });

  it("returns safe daemon unavailable errors for run commands", async () => {
    const { createEventStore, dependencies } = createRunCliDependencies({
      client: createFakeRunDaemonClient({
        listRuns: vi.fn(async () => {
          throw new DaemonClientError(0, "daemon_unavailable", "Daemon is unavailable.");
        })
      })
    });
    const result = await runCli(["runs", "list", "--json"], dependencies);
    const body = JSON.parse(result.stdout) as {
      error: {
        name: string;
        code: string;
        status: number;
        detail: string;
      };
    };

    expect(result.exitCode).toBe(1);
    expect(body.error).toEqual({
      name: "DaemonClientError",
      code: "daemon_unavailable",
      status: 0,
      detail: "Daemon is unavailable."
    });
    expect(result.stdout).not.toContain("ECONNREFUSED");
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("rejects unknown and secret-like run flags without leaking provided material", async () => {
    const unknown = createRunCliDependencies();
    const unknownResult = await runCli(["runs", "list", "--unknown", "--json"], unknown.dependencies);

    expect(unknownResult.exitCode).toBe(1);
    expect(unknownResult.stdout).toContain("Unknown flag for runs list: --unknown");
    expect(unknown.createDaemonClient).not.toHaveBeenCalled();
    expect(unknown.createEventStore).not.toHaveBeenCalled();

    const secret = createRunCliDependencies();
    const secretResult = await runCli(
      ["runs", "list", "--api-key", "sk-secret123", "--json"],
      secret.dependencies
    );

    expect(secretResult.exitCode).toBe(1);
    expect(secretResult.stdout).toContain("Run commands do not accept provider secrets or credentials.");
    expect(secretResult.stdout).not.toContain("sk-secret123");
    expect(secret.createDaemonClient).not.toHaveBeenCalled();
    expect(secret.createEventStore).not.toHaveBeenCalled();
  });

  it("keeps run command file and error output free of secrets and private paths", async () => {
    const missing = createRunCliDependencies({
      readJsonFile: () => {
        throw new Error("Unable to read /Users/alice/private/run-plan.json with Bearer secret-token");
      }
    });
    const missingResult = await runCli(
      ["runs", "create", "--input", "/Users/alice/private/run-plan.json", "--json"],
      missing.dependencies
    );

    expect(missingResult.exitCode).toBe(1);
    expect(missingResult.stdout).toContain("Run plan input must be a readable JSON object.");
    expect(missingResult.stdout).not.toContain("/Users/alice");
    expect(missingResult.stdout).not.toContain("Bearer secret-token");
    expect(missing.createEventStore).not.toHaveBeenCalled();

    const leakingClient = createRunCliDependencies({
      client: createFakeRunDaemonClient({
        listRuns: vi.fn(async () => {
          throw new Error("raw failure /Users/alice/.ssh/id_rsa Bearer secret-token sk-secret123");
        })
      })
    });
    const leakingResult = await runCli(["runs", "list", "--json"], leakingClient.dependencies);

    expect(leakingResult.exitCode).toBe(1);
    expect(leakingResult.stdout).not.toContain("/Users/alice");
    expect(leakingResult.stdout).not.toContain("Bearer secret-token");
    expect(leakingResult.stdout).not.toContain("sk-secret123");
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
      projection: { version: string };
    }>(await runWithStore(storePath, ["frontier", "--session", "session-1"], []));
    const objections = parseOutput<{
      objections: Array<{ object: { id: string } }>;
      projection: { version: string };
    }>(
      await runWithStore(storePath, ["objections", "--session", "session-1"], [])
    );
    const obligations = parseOutput<{
      qualityObligations: Array<{ object: { id: string; status: string } }>;
      projection: { version: string };
    }>(await runWithStore(storePath, ["obligations", "--session", "session-1"], []));
    const eventsOutput = parseOutput<{ events: Array<{ type: string; payload: Record<string, unknown> }> }>(
      await runWithStore(storePath, ["events", "--session", "session-1"], [])
    );

    expect(proposed.proposalId).toBe("proposal-1");
    expect(proposed.event.payload.status).toBe("proposed");
    expect(frontier).toMatchObject({
      basis: "accepted_active_candidates",
      candidates: expect.arrayContaining([
        expect.objectContaining({
          object: expect.objectContaining({ id: "candidate-1" })
        })
      ]),
      projection: {
        version: "1"
      }
    });
    expect(Object.keys(frontier)).toEqual(["basis", "candidates", "projection"]);
    expect(frontier).not.toHaveProperty("currentBest");
    expect(frontier).not.toHaveProperty("winner");
    expect(frontier).not.toHaveProperty("rank");
    expect(frontier).not.toHaveProperty("score");
    expect(frontier).not.toHaveProperty("vote");
    expect(objections.objections[0]?.object.id).toBe("objection-1");
    expect(objections.projection.version).toBe("1");
    expect(obligations.qualityObligations[0]?.object).toMatchObject({
      id: "quality-1",
      status: "unanswered"
    });
    expect(obligations.projection.version).toBe("1");
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
