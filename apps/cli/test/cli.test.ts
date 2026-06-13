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
    getRuntimeProfiles: vi.fn(async () => ({
      profiles: [
        {
          id: "openai-compatible",
          name: "OpenAI-compatible",
          enabled: true,
          status: "ready_with_run_config",
          components: [],
          setup: {
            enableEnvVar: "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE",
            envVars: [
              {
                name: "DELIBERUM_OPENAI_API_KEY",
                configured: true,
                secret: true,
                required: false,
                purpose: "Default provider secret."
              }
            ],
            missingRecommendedEnvVars: ["DELIBERUM_OPENAI_BASE_URL"],
            notes: []
          },
          boundaries: []
        }
      ]
    })),
    getResourceAccessPosture: vi.fn(async () => ({
      baseUrl: {
        configured: false,
        exposure: "localhost",
        routePattern: "/resource-access/:accessId"
      },
      ttl: {
        configured: false,
        defaultTtlMs: 300000,
        maxTtlMs: 3600000
      },
      grantStore: {
        mode: "process_memory",
        restartContinuity: "lost_on_restart"
      },
      safety: ["No access ids are returned."]
    })),
    getOperationAudit: vi.fn(async () => ({
      events: [
        {
          id: "operation-audit-1",
          recordedAt: "2026-06-10T00:00:00.000Z",
          action: "runtime_profiles_read",
          method: "GET",
          route: "/runtime/profiles",
          statusCode: 200,
          outcome: "succeeded",
          authorization: {
            mode: "daemon_bearer",
            present: true
          },
          target: {}
        }
      ]
    })),
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
        runId,
        sessionId: "session-1"
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
    getSessionResources: vi.fn(async (sessionId: string) => ({
      sessionId,
      source: {
        kind: "run_plan",
        runId: "run-1"
      },
      plannedResources: [
        {
          reference: {
            resourceId: "resource-1",
            required: true,
            preferredDeliveryMode: "none"
          },
          registered: true
        }
      ],
      deliveryAudits: [
        {
          eventId: "resource-delivery-event-1",
          resourceDeliveryId: "resource-delivery-1",
          resourceId: "resource-1",
          participantId: "participant-1",
          result: {
            selectedMode: "none",
            allowed: false
          }
        }
      ],
      evidenceNeeds: [],
      projection: {
        version: "1",
        eventRange: null,
        eventIds: []
      }
    })),
    getRunProcessProposals: vi.fn(async (runId: string) => ({
      runId,
      sessionId: "session-1",
      proposals: [
        {
          id: "adaptive-run-1-sealed-divergence",
          primitive: "sealed_divergence",
          status: "proposed",
          targetIds: ["topic-contract-event-1"]
        }
      ],
      observations: ["No sealed divergence round is recorded for this run."],
      metadata: {
        version: "1",
        eventRange: {
          fromSequence: 0,
          toSequence: 0
        },
        eventIds: ["topic-contract-event-1"]
      }
    })),
    executeRunProcessProposal: vi.fn(async (runId: string, proposalEventId: string) => ({
      run: {
        runId
      },
      processProposal: {
        proposalEventId,
        proposalId: "process-proposal-1",
        primitive: "sealed_divergence",
        latestStatus: "accepted"
      },
      startRequest: {
        sealedDivergence: {
          autoCloseManual: true
        }
      },
      stages: [
        {
          stage: "sealed_divergence",
          eventIds: ["sealed-event-1"]
        }
      ],
      stopped: false
    })),
    revokeResourceAccess: vi.fn(async (accessId: string) => ({
      revoked: true,
      grant: {
        resourceAccessId: "resource-access-audit-1",
        sessionId: "session-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        mode: "redirect",
        exposure: "public",
        createdAt: "2026-06-10T00:00:00.000Z",
        expiresAt: "2026-06-10T00:05:00.000Z",
        revokedAt: "2026-06-10T00:01:00.000Z",
        accessCount: 1
      }
    })),
    proposeFinalCandidate: vi.fn(async (sessionId: string, input: unknown) => ({
      proposalId: "final-candidate-1",
      appended: true,
      event: {
        id: "final-candidate-event-1",
        sessionId,
        type: "final_candidate_proposed",
        payload: input
      }
    })),
    auditFinalCandidate: vi.fn(async (sessionId: string, proposalEventId: string, input: unknown) => ({
      appended: true,
      event: {
        id: "final-audit-event-1",
        sessionId,
        type: "final_audit_recorded",
        basedOnEventIds: [proposalEventId],
        payload: input
      }
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
      projectProcessProposalStates: vi.fn(() => ({
        proposalStates: [],
        projection: createFakeProjectionMetadata()
      })),
      proposeProcessProposal: vi.fn(() => ({
        proposalId: "process-proposal-1",
        proposalEvent: createFakeEvent({ type: "process_proposal_proposed" })
      })),
      challengeProcessProposal: vi.fn(() => ({
        challengeEvent: createFakeEvent({ type: "process_proposal_challenged" })
      })),
      decideProcessProposal: vi.fn(() => ({
        decisionEvent: createFakeEvent({ type: "process_proposal_decided" })
      })),
      proposeFinalCandidate: vi.fn(() => ({
        proposalId: "final-proposal-1",
        proposalEvent: createFakeEvent({ type: "final_candidate_proposed" }),
        appended: true
      })),
      auditFinalCandidate: vi.fn(() => ({
        auditEvent: createFakeEvent({ type: "final_audit_recorded" }),
        appended: true
      })),
      compileOutcome: vi.fn(() => ({
        recommendation: "Provisional recommendation",
        draftStatus: "provisional",
        provenance: {
          projectionBasis: "event_ledger_and_projections"
        }
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
      readJsonFile: (filePath: string) => {
        if (filePath === "final-candidate.json") {
          return {
            candidateIds: ["candidate-1"],
            recommendation: "Provisionally use candidate 1.",
            applicabilityConditions: ["Condition remains true."],
            rationale: "Candidate 1 preserves the accepted frontier.",
            limitations: ["Still provisional."]
          };
        }

        if (filePath === "final-audit.json") {
          return {
            findings: ["The draft preserves alternatives."],
            risks: ["Evidence remains open."],
            unresolvedObjectionIds: ["objection-1"],
            qualityObligationIds: ["quality-1"],
            evidenceNeedIds: ["evidence-need-1"],
            omissions: ["Repair details are absent."],
            compressionProblems: ["Risk was shortened."],
            limitations: ["Audit did not verify evidence."],
            continuationSuggestions: ["Run evidence check."]
          };
        }

        return {};
      }
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
    await runCli(["process", "proposals", "--session", "session-1"], commonDependencies);
    await runCli(
      [
        "process",
        "propose",
        "--session",
        "session-1",
        "--author",
        "system",
        "--input",
        "process-proposal.json",
        "--based-on-event",
        "topic-event-1"
      ],
      commonDependencies
    );
    await runCli(
      [
        "process",
        "challenge",
        "--session",
        "session-1",
        "--proposal-event",
        "process-proposal-event-1",
        "--author",
        "participant-2",
        "--reason",
        "Needs process scrutiny"
      ],
      commonDependencies
    );
    await runCli(
      [
        "process",
        "decide",
        "--session",
        "session-1",
        "--proposal-event",
        "process-proposal-event-1",
        "--author",
        "participant-2",
        "--status",
        "deferred",
        "--rationale",
        "Defer until the evidence check completes"
      ],
      commonDependencies
    );
    await runCli(
      [
        "final",
        "propose",
        "--session",
        "session-1",
        "--author",
        "participant-6",
        "--input",
        "final-candidate.json",
        "--idempotency-key",
        "same-final-candidate"
      ],
      commonDependencies
    );
    await runCli(
      [
        "final",
        "audit",
        "--session",
        "session-1",
        "--proposal-event",
        "final-proposal-event-1",
        "--author",
        "participant-7",
        "--input",
        "final-audit.json",
        "--idempotency-key",
        "same-final-audit"
      ],
      commonDependencies
    );
    await runCli(
      [
        "final",
        "compile",
        "--session",
        "session-1",
        "--proposal-event",
        "final-proposal-event-1"
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
    expect(core.projectProcessProposalStates).toHaveBeenCalledTimes(1);
    expect(core.proposeProcessProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        authorId: "system",
        proposal: {},
        basedOnEventIds: ["topic-event-1"]
      }),
      expect.any(Object)
    );
    expect(core.challengeProcessProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        targetProcessProposalEventId: "process-proposal-event-1",
        authorId: "participant-2",
        reason: "Needs process scrutiny"
      }),
      expect.any(Object)
    );
    expect(core.decideProcessProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        targetProcessProposalEventId: "process-proposal-event-1",
        authorId: "participant-2",
        status: "deferred",
        rationale: "Defer until the evidence check completes"
      }),
      expect.any(Object)
    );
    expect(core.proposeFinalCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        authorId: "participant-6",
        candidateIds: ["candidate-1"],
        recommendation: "Provisionally use candidate 1.",
        applicabilityConditions: ["Condition remains true."],
        rationale: "Candidate 1 preserves the accepted frontier.",
        limitations: ["Still provisional."],
        idempotencyKey: "same-final-candidate"
      }),
      expect.any(Object)
    );
    expect(core.auditFinalCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        targetFinalCandidateProposalEventId: "final-proposal-event-1",
        authorId: "participant-7",
        findings: ["The draft preserves alternatives."],
        risks: ["Evidence remains open."],
        unresolvedObjectionIds: ["objection-1"],
        qualityObligationIds: ["quality-1"],
        evidenceNeedIds: ["evidence-need-1"],
        omissions: ["Repair details are absent."],
        compressionProblems: ["Risk was shortened."],
        limitations: ["Audit did not verify evidence."],
        continuationSuggestions: ["Run evidence check."],
        idempotencyKey: "same-final-audit"
      }),
      expect.any(Object)
    );
    expect(core.compileOutcome).toHaveBeenCalledWith({
      eventStore: fakeStore,
      sessionId: "session-1",
      finalCandidateProposalEventId: "final-proposal-event-1"
    });
    expect(core.projectCandidateFrontier).toHaveBeenCalledTimes(1);
    expect(core.projectAcceptedDeliberationObjects).toHaveBeenCalledTimes(1);
    expect(core.projectQualityObligations).toHaveBeenCalledTimes(1);
    expect(createEventStore).toHaveBeenCalled();
  });

  it("routes daemon profile commands through the daemon client without creating the local EventStore", async () => {
    const { daemonClient, createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies();

    const profiles = parseOutput<{
      profiles: Array<{
        id: string;
        status: string;
        setup: {
          missingRecommendedEnvVars: string[];
        };
      }>;
    }>(
      await runCli(
        ["daemon", "profiles", "--daemon-url", "http://localhost:4999", "--json"],
        dependencies
      )
    );
    const rejected = await runCli(
      ["daemon", "profiles", "--api-key", "sk-runtime-secret", "--json"],
      dependencies
    );

    expect(profiles.profiles[0]).toEqual(
      expect.objectContaining({
        id: "openai-compatible",
        status: "ready_with_run_config",
        setup: expect.objectContaining({
          missingRecommendedEnvVars: ["DELIBERUM_OPENAI_BASE_URL"]
        })
      })
    );
    expect(daemonClient.getRuntimeProfiles).toHaveBeenCalledTimes(1);
    expect(createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4999"
    });
    expect(createEventStore).not.toHaveBeenCalled();
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stdout).not.toContain("sk-runtime-secret");
    expect(daemonClient.getRuntimeProfiles).toHaveBeenCalledTimes(1);
  });

  it("builds safe daemon profile doctor diagnostics from runtime profile metadata", async () => {
    const daemonClient = createFakeRunDaemonClient({
      getRuntimeProfiles: vi.fn(async () => ({
        profiles: [
          {
            id: "openai-compatible",
            name: "OpenAI-compatible",
            enabled: true,
            status: "ready_with_run_config",
            components: [
              {
                id: "openai-compatible",
                kind: "participant_adapter",
                enabled: true
              },
              {
                id: "openai-compatible-extractor",
                kind: "extraction_generator",
                enabled: false
              }
            ],
            setup: {
              enableEnvVar: "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE",
              envVars: [
                {
                  name: "DELIBERUM_OPENAI_API_KEY",
                  configured: true,
                  secret: true,
                  required: false,
                  purpose: "Default provider secret."
                },
                {
                  name: "DELIBERUM_OPENAI_BASE_URL",
                  configured: false,
                  secret: false,
                  required: false,
                  purpose: "Default provider base URL."
                }
              ],
              missingRecommendedEnvVars: [
                "DELIBERUM_OPENAI_BASE_URL",
                "DELIBERUM_OPENAI_MODEL"
              ],
              notes: ["Run plans may provide provider runtime config."]
            },
            boundaries: ["Provider secrets stay in daemon runtime env."]
          },
          {
            id: "mcp-tool",
            name: "MCP tool",
            enabled: false,
            status: "disabled",
            components: [],
            setup: {
              enableEnvVar: "DELIBERUM_ENABLE_MCP_TOOL_PROFILE",
              envVars: [],
              missingRecommendedEnvVars: [],
              notes: []
            },
            boundaries: ["Tool endpoints are not returned."]
          }
        ]
      }))
    });
    const { createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies({ client: daemonClient });

    const report = parseOutput<{
      summary: {
        profileCount: number;
        enabledProfileCount: number;
        readyWithRunConfigCount: number;
        missingRecommendedEnvVars: string[];
      };
      profiles: Array<{
        id: string;
        enabled: boolean;
        status: string;
        readyForDaemonDefaults: boolean;
        enabledComponentCount: number;
        configuredEnvVarCount: number;
        configuredSecretEnvVarCount: number;
        missingRecommendedEnvVars: string[];
        actions: Array<{
          kind: string;
          envVar?: string;
          envVars?: string[];
        }>;
      }>;
      safety: string[];
    }>(
      await runCli(
        ["daemon", "profile-doctor", "--daemon-url", "http://localhost:4999", "--json"],
        dependencies
      )
    );
    const filtered = parseOutput<{ profiles: Array<{ id: string }> }>(
      await runCli(
        ["daemon", "profile-doctor", "--profile", "mcp-tool", "--json"],
        dependencies
      )
    );
    const missing = await runCli(
      ["daemon", "profile-doctor", "--profile", "missing-profile", "--json"],
      dependencies
    );
    const rejected = await runCli(
      ["daemon", "profile-doctor", "--api-key", "runtime-secret-value", "--json"],
      dependencies
    );

    expect(report.summary).toEqual(
      expect.objectContaining({
        profileCount: 2,
        enabledProfileCount: 1,
        readyWithRunConfigCount: 1,
        missingRecommendedEnvVars: [
          "DELIBERUM_OPENAI_BASE_URL",
          "DELIBERUM_OPENAI_MODEL"
        ]
      })
    );
    expect(report.profiles[0]).toEqual(
      expect.objectContaining({
        id: "openai-compatible",
        enabled: true,
        status: "ready_with_run_config",
        readyForDaemonDefaults: false,
        enabledComponentCount: 1,
        configuredEnvVarCount: 1,
        configuredSecretEnvVarCount: 1,
        missingRecommendedEnvVars: [
          "DELIBERUM_OPENAI_BASE_URL",
          "DELIBERUM_OPENAI_MODEL"
        ]
      })
    );
    expect(report.profiles[0]?.actions).toContainEqual({
      kind: "set_recommended_env",
      envVars: ["DELIBERUM_OPENAI_BASE_URL", "DELIBERUM_OPENAI_MODEL"],
      reason: expect.any(String)
    });
    expect(report.profiles[0]?.actions).toContainEqual({
      kind: "provide_run_config",
      reason: expect.any(String)
    });
    expect(report.profiles[1]?.actions).toEqual([
      {
        kind: "enable_profile",
        envVar: "DELIBERUM_ENABLE_MCP_TOOL_PROFILE",
        reason: expect.any(String)
      }
    ]);
    expect(report.safety.join(" ")).toContain("does not read or print provider secrets");
    expect(JSON.stringify(report)).not.toContain("runtime-secret-value");
    expect(filtered.profiles.map((profile) => profile.id)).toEqual(["mcp-tool"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toContain("Runtime profile was not found");
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stdout).not.toContain("runtime-secret-value");
    expect(daemonClient.getRuntimeProfiles).toHaveBeenCalledTimes(3);
    expect(createDaemonClient).toHaveBeenCalledTimes(3);
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("builds a safe daemon setup plan from runtime profile metadata", async () => {
    const daemonClient = createFakeRunDaemonClient({
      getRuntimeProfiles: vi.fn(async () => ({
        profiles: [
          {
            id: "openai-compatible",
            name: "OpenAI-compatible",
            enabled: true,
            status: "ready_with_run_config",
            components: [
              {
                id: "openai-compatible",
                kind: "participant_adapter",
                enabled: true
              }
            ],
            setup: {
              enableEnvVar: "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE",
              envVars: [
                {
                  name: "DELIBERUM_OPENAI_API_KEY",
                  configured: true,
                  secret: true,
                  required: false,
                  purpose: "Default provider secret."
                },
                {
                  name: "DELIBERUM_OPENAI_BASE_URL",
                  configured: false,
                  secret: false,
                  required: false,
                  purpose: "Default provider base URL."
                },
                {
                  name: "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_EXTRACTION",
                  configured: false,
                  secret: false,
                  required: false,
                  purpose: "Optional extraction component flag."
                }
              ],
              missingRecommendedEnvVars: ["DELIBERUM_OPENAI_BASE_URL"],
              notes: ["Run plans may provide provider runtime config."]
            },
            boundaries: ["Provider secrets stay in daemon runtime env."]
          },
          {
            id: "mcp-tool",
            name: "MCP tool",
            enabled: true,
            status: "needs_configuration",
            components: [
              {
                id: "mcp-tool",
                kind: "participant_adapter",
                enabled: false
              }
            ],
            setup: {
              enableEnvVar: "DELIBERUM_ENABLE_MCP_TOOL_PROFILE",
              envVars: [
                {
                  name: "DELIBERUM_MCP_TOOL_URL",
                  configured: false,
                  secret: false,
                  required: true,
                  purpose: "Required MCP-compatible JSON-RPC tool endpoint URL."
                },
                {
                  name: "DELIBERUM_MCP_TOOL_NAME",
                  configured: false,
                  secret: false,
                  required: true,
                  purpose: "Required allowed tool name."
                },
                {
                  name: "DELIBERUM_MCP_TOOL_AUTH_TOKEN",
                  configured: true,
                  secret: true,
                  required: false,
                  purpose: "Optional bearer token."
                }
              ],
              missingRecommendedEnvVars: [
                "DELIBERUM_MCP_TOOL_URL",
                "DELIBERUM_MCP_TOOL_NAME"
              ],
              notes: []
            },
            boundaries: ["Tool endpoint details are not returned."]
          },
          {
            id: "http-template",
            name: "HTTP-template",
            enabled: false,
            status: "disabled",
            components: [],
            setup: {
              enableEnvVar: "DELIBERUM_ENABLE_HTTP_TEMPLATE_PROFILE",
              envVars: [],
              missingRecommendedEnvVars: [],
              notes: []
            },
            boundaries: ["Only the participant adapter is installed by this profile."]
          }
        ]
      }))
    });
    const { createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies({ client: daemonClient });

    const plan = parseOutput<{
      summary: {
        profileCount: number;
        enabledProfileCount: number;
        readyWithRunConfigCount: number;
        needsConfigurationCount: number;
        missingRequiredEnvVars: string[];
        missingRecommendedEnvVars: string[];
        secretEnvVarNames: string[];
      };
      profiles: Array<{
        id: string;
        enabled: boolean;
        status: string;
        enabledComponentCount: number;
        missingRequiredEnvVars: string[];
        missingRecommendedEnvVars: string[];
        secretEnvVarNames: string[];
        optionalEnvVarNames: string[];
        steps: Array<{
          order: number;
          kind: string;
          envVars?: string[];
          command?: string;
        }>;
      }>;
      steps: Array<{
        order: number;
        kind: string;
        profileId: string;
      }>;
      safety: string[];
    }>(await runCli(["daemon", "setup-plan", "--json"], dependencies));
    const filtered = parseOutput<{ profiles: Array<{ id: string }> }>(
      await runCli(
        ["daemon", "setup-plan", "--profile", "mcp-tool", "--json"],
        dependencies
      )
    );
    const missing = await runCli(
      ["daemon", "setup-plan", "--profile", "missing-profile", "--json"],
      dependencies
    );
    const rejected = await runCli(
      ["daemon", "setup-plan", "--token", "redacted-input-value", "--json"],
      dependencies
    );

    expect(plan.summary).toEqual(
      expect.objectContaining({
        profileCount: 3,
        enabledProfileCount: 2,
        readyWithRunConfigCount: 1,
        needsConfigurationCount: 1,
        missingRequiredEnvVars: [
          "DELIBERUM_MCP_TOOL_NAME",
          "DELIBERUM_MCP_TOOL_URL"
        ],
        missingRecommendedEnvVars: ["DELIBERUM_OPENAI_BASE_URL"],
        secretEnvVarNames: [
          "DELIBERUM_MCP_TOOL_AUTH_TOKEN",
          "DELIBERUM_OPENAI_API_KEY"
        ]
      })
    );
    expect(plan.profiles.find((profile) => profile.id === "openai-compatible")).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "ready_with_run_config",
        enabledComponentCount: 1,
        missingRequiredEnvVars: [],
        missingRecommendedEnvVars: ["DELIBERUM_OPENAI_BASE_URL"],
        secretEnvVarNames: ["DELIBERUM_OPENAI_API_KEY"],
        optionalEnvVarNames: [
          "DELIBERUM_OPENAI_API_KEY",
          "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_EXTRACTION"
        ],
        steps: expect.arrayContaining([
          expect.objectContaining({
            kind: "render_env_template",
            command: "deliberum daemon env-template --profile openai-compatible"
          }),
          expect.objectContaining({
            kind: "configure_recommended_env",
            envVars: ["DELIBERUM_OPENAI_BASE_URL"]
          }),
          expect.objectContaining({
            kind: "provide_run_config"
          }),
          expect.objectContaining({
            kind: "verify_profile",
            command: "deliberum daemon profile-doctor --profile openai-compatible"
          })
        ])
      })
    );
    expect(plan.profiles.find((profile) => profile.id === "mcp-tool")).toEqual(
      expect.objectContaining({
        status: "needs_configuration",
        missingRequiredEnvVars: [
          "DELIBERUM_MCP_TOOL_URL",
          "DELIBERUM_MCP_TOOL_NAME"
        ],
        missingRecommendedEnvVars: [],
        steps: expect.arrayContaining([
          expect.objectContaining({
            kind: "configure_required_env",
            envVars: ["DELIBERUM_MCP_TOOL_URL", "DELIBERUM_MCP_TOOL_NAME"]
          })
        ])
      })
    );
    expect(plan.profiles.find((profile) => profile.id === "http-template")).toEqual(
      expect.objectContaining({
        enabled: false,
        steps: expect.arrayContaining([
          expect.objectContaining({
            kind: "enable_profile",
            envVars: ["DELIBERUM_ENABLE_HTTP_TEMPLATE_PROFILE"]
          })
        ])
      })
    );
    expect(plan.steps.map((step) => step.order)).toEqual(
      plan.steps.map((_, index) => index + 1)
    );
    expect(plan.safety.join(" ")).toContain("does not read, request, print, persist");
    expect(JSON.stringify(plan)).not.toContain("redacted-input-value");
    expect(filtered.profiles.map((profile) => profile.id)).toEqual(["mcp-tool"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toContain("Runtime profile was not found");
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stdout).not.toContain("redacted-input-value");
    expect(daemonClient.getRuntimeProfiles).toHaveBeenCalledTimes(3);
    expect(createDaemonClient).toHaveBeenCalledTimes(3);
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("prints a safe daemon environment template from runtime profile metadata", async () => {
    const daemonClient = createFakeRunDaemonClient({
      getRuntimeProfiles: vi.fn(async () => ({
        profiles: [
          {
            id: "openai-compatible",
            name: "OpenAI-compatible",
            enabled: true,
            status: "ready_with_run_config",
            components: [],
            setup: {
              enableEnvVar: "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE",
              envVars: [
                {
                  name: "DELIBERUM_OPENAI_API_KEY",
                  configured: false,
                  secret: true,
                  required: false,
                  purpose: "Default provider secret."
                }
              ],
              missingRecommendedEnvVars: ["DELIBERUM_OPENAI_BASE_URL"],
              notes: ["Provider values stay in daemon runtime env only."]
            },
            boundaries: ["Provider secrets are never returned."]
          },
          {
            id: "mcp-tool",
            name: "MCP tool",
            enabled: true,
            status: "ready",
            components: [],
            setup: {
              enableEnvVar: "DELIBERUM_ENABLE_MCP_TOOL_PROFILE",
              envVars: [
                {
                  name: "DELIBERUM_MCP_TOOL_AUTH_TOKEN",
                  configured: true,
                  secret: true,
                  required: false,
                  purpose: "Optional bearer token for the MCP-compatible endpoint."
                },
                {
                  name: "DELIBERUM_MCP_TOOL_INCLUDE_CONTEXT",
                  configured: false,
                  secret: false,
                  required: false,
                  purpose: "Optional context-forwarding toggle."
                }
              ],
              missingRecommendedEnvVars: [],
              notes: []
            },
            boundaries: ["Only the participant adapter is installed by this profile."]
          }
        ]
      }))
    });
    const { createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies({ client: daemonClient });

    const raw = await runCli(
      ["daemon", "env-template", "--profile", "mcp-tool"],
      dependencies
    );
    const json = parseOutput<{ template: string }>(
      await runCli(
        ["daemon", "env-template", "--profile", "openai-compatible", "--json"],
        dependencies
      )
    );
    const missing = await runCli(
      ["daemon", "env-template", "--profile", "missing-profile", "--json"],
      dependencies
    );

    expect(raw.exitCode).toBe(0);
    expect(raw.stdout).toContain("# Profile: MCP tool (mcp-tool)");
    expect(raw.stdout).toContain("# DELIBERUM_ENABLE_MCP_TOOL_PROFILE=true");
    expect(raw.stdout).toContain("# DELIBERUM_MCP_TOOL_AUTH_TOKEN=");
    expect(raw.stdout).toContain("# required=false secret=true configured=true");
    expect(raw.stdout).not.toContain("openai-compatible");
    expect(raw.stdout).not.toContain("Bearer ");
    expect(json.template).toContain("# Profile: OpenAI-compatible (openai-compatible)");
    expect(json.template).toContain("# Missing recommended env vars: DELIBERUM_OPENAI_BASE_URL");
    expect(json.template).toContain("# DELIBERUM_OPENAI_API_KEY=");
    expect(json.template).not.toContain("sk-runtime-secret");
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toContain("Runtime profile was not found");
    expect(daemonClient.getRuntimeProfiles).toHaveBeenCalledTimes(3);
    expect(createDaemonClient).toHaveBeenCalledTimes(3);
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("routes daemon operation audit commands through the daemon client", async () => {
    const { daemonClient, createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies();

    const audit = parseOutput<{
      events: Array<{
        id: string;
        action: string;
        authorization: {
          mode: string;
          present: boolean;
        };
      }>;
    }>(
      await runCli(
        [
          "daemon",
          "operation-audit",
          "--daemon-url",
          "http://localhost:4999",
          "--limit",
          "25",
          "--json"
        ],
        dependencies
      )
    );
    const badLimit = await runCli(
      ["daemon", "operation-audit", "--limit", "not-a-number", "--json"],
      dependencies
    );
    const writes: string[] = [];
    const jsonl = await runCli(
      [
        "daemon",
        "operation-audit",
        "--limit",
        "10",
        "--format",
        "jsonl",
        "--json"
      ],
      {
        ...dependencies,
        writeStdout: (chunk) => {
          writes.push(chunk);
        }
      }
    );
    const badFormat = await runCli(
      ["daemon", "operation-audit", "--format", "secret-export-format", "--json"],
      dependencies
    );
    const rejected = await runCli(
      ["daemon", "operation-audit", "--api-key", "sk-runtime-secret", "--json"],
      dependencies
    );

    expect(audit.events).toEqual([
      expect.objectContaining({
        id: "operation-audit-1",
        action: "runtime_profiles_read",
        authorization: {
          mode: "daemon_bearer",
          present: true
        }
      })
    ]);
    expect(daemonClient.getOperationAudit).toHaveBeenCalledWith({ limit: 25 });
    expect(daemonClient.getOperationAudit).toHaveBeenCalledWith({ limit: 10 });
    expect(createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4999"
    });
    expect(createEventStore).not.toHaveBeenCalled();
    expect(jsonl).toMatchObject({
      exitCode: 0,
      stdout: "",
      output: {
        format: "jsonl",
        events: 1
      }
    });
    expect(writes.join("")).toBe(`${JSON.stringify(audit.events[0])}\n`);
    expect(badLimit.exitCode).toBe(1);
    expect(badLimit.stdout).toContain("--limit must be a positive integer.");
    expect(badLimit.stdout).not.toContain("not-a-number");
    expect(badFormat.exitCode).toBe(1);
    expect(badFormat.stdout).toContain("--format must be json or jsonl.");
    expect(badFormat.stdout).not.toContain("secret-export-format");
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stdout).not.toContain("sk-runtime-secret");
    expect(daemonClient.getOperationAudit).toHaveBeenCalledTimes(2);
  });

  it("routes daemon resource access posture reads through the daemon client", async () => {
    const { daemonClient, createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies();

    const posture = parseOutput<{
      baseUrl: {
        configured: boolean;
        exposure: string;
      };
      grantStore: {
        mode: string;
      };
    }>(
      await runCli(
        [
          "daemon",
          "resource-access",
          "status",
          "--daemon-url",
          "http://127.0.0.1:4999",
          "--json"
        ],
        dependencies
      )
    );
    const rejected = await runCli(
      [
        "daemon",
        "resource-access",
        "status",
        "--api-key",
        "runtime-secret-value",
        "--json"
      ],
      dependencies
    );

    expect(posture).toMatchObject({
      baseUrl: {
        configured: false,
        exposure: "localhost"
      },
      grantStore: {
        mode: "process_memory"
      }
    });
    expect(JSON.stringify(posture)).not.toContain("http://");
    expect(daemonClient.getResourceAccessPosture).toHaveBeenCalledTimes(1);
    expect(createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:4999"
    });
    expect(createEventStore).not.toHaveBeenCalled();
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stdout).not.toContain("runtime-secret-value");
    expect(daemonClient.getResourceAccessPosture).toHaveBeenCalledTimes(1);
  });

  it("routes daemon resource access revocation through the daemon client", async () => {
    const accessId = "A".repeat(32);
    const { daemonClient, createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies();

    const revoked = parseOutput<{
      revoked: boolean;
      grant: {
        resourceId: string;
        revokedAt: string;
      };
    }>(
      await runCli(
        [
          "daemon",
          "resource-access",
          "revoke",
          accessId,
          "--daemon-url",
          "http://127.0.0.1:4999",
          "--json"
        ],
        dependencies
      )
    );
    const rejected = await runCli(
      [
        "daemon",
        "resource-access",
        "revoke",
        accessId,
        "--api-key",
        "sk-runtime-secret",
        "--json"
      ],
      dependencies
    );

    expect(revoked).toEqual({
      revoked: true,
      grant: {
        resourceAccessId: "resource-access-audit-1",
        sessionId: "session-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        mode: "redirect",
        exposure: "public",
        createdAt: "2026-06-10T00:00:00.000Z",
        expiresAt: "2026-06-10T00:05:00.000Z",
        revokedAt: "2026-06-10T00:01:00.000Z",
        accessCount: 1
      }
    });
    expect(daemonClient.revokeResourceAccess).toHaveBeenCalledWith(accessId);
    expect(createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:4999"
    });
    expect(createEventStore).not.toHaveBeenCalled();
    expect(JSON.stringify(revoked)).not.toContain(accessId);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stdout).not.toContain("sk-runtime-secret");
    expect(daemonClient.revokeResourceAccess).toHaveBeenCalledTimes(1);
  });

  it("routes run commands through the daemon client without creating the local EventStore", async () => {
    const { daemonClient, createDaemonClient, createEventStore, dependencies } =
      createRunCliDependencies({
        readJsonFile: (filePath) => {
          if (filePath === "start.json") {
            return {
              sealedDivergence: {
                autoCloseManual: true
              }
            };
          }

          if (filePath === "final-candidate.json") {
            return {
              candidateIds: ["candidate-1"],
              recommendation: "Record daemon final candidate material.",
              applicabilityConditions: ["Only for this daemon run session."],
              rationale: "Expose daemon final lifecycle through CLI run commands.",
              limitations: ["Requires final audit."]
            };
          }

          if (filePath === "final-audit.json") {
            return {
              findings: ["The daemon final candidate remains provisional."],
              risks: ["Evidence may still be incomplete."],
              unresolvedObjectionIds: ["objection-1"],
              qualityObligationIds: ["quality-1"],
              evidenceNeedIds: ["evidence-1"],
              omissions: ["No external validation."],
              compressionProblems: [],
              limitations: ["Audit records boundaries only."],
              continuationSuggestions: ["Resolve evidence before reliance."]
            };
          }

          return {
            topic: "Run from CLI"
          };
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
    const outcomeOverride = parseOutput<{ status: string; reason: string }>(
      await runCli(
        [
          "runs",
          "outcome",
          "run-1",
          "--proposal-event",
          "final-candidate-event-2",
          "--json"
        ],
        dependencies
      )
    );
    const resources = parseOutput<{
      sessionId: string;
      plannedResources: Array<{ reference: { resourceId: string } }>;
      deliveryAudits: Array<{ eventId: string; resourceId: string }>;
    }>(await runCli(["runs", "resources", "run-1", "--json"], dependencies));
    const processProposals = parseOutput<{
      proposals: Array<{ primitive: string; status: string }>;
      observations: string[];
    }>(
      await runCli(["runs", "process-proposals", "run-1", "--json"], dependencies)
    );
    const finalProposal = parseOutput<{
      proposalId: string;
      appended: boolean;
      event: { type: string; sessionId: string };
    }>(
      await runCli(
        [
          "runs",
          "final-propose",
          "run-1",
          "--author",
          "final-coordinator",
          "--input",
          "final-candidate.json",
          "--idempotency-key",
          "daemon-final-candidate-1",
          "--json"
        ],
        dependencies
      )
    );
    const finalAudit = parseOutput<{
      appended: boolean;
      event: { type: string; sessionId: string; basedOnEventIds: string[] };
    }>(
      await runCli(
        [
          "runs",
          "final-audit",
          "run-1",
          "--proposal-event",
          "final-candidate-event-1",
          "--author",
          "final-auditor",
          "--input",
          "final-audit.json",
          "--idempotency-key",
          "daemon-final-audit-1",
          "--json"
        ],
        dependencies
      )
    );
    const executedProcessProposal = parseOutput<{
      processProposal: { proposalEventId: string; primitive: string; latestStatus: string };
      startRequest: { sealedDivergence: { autoCloseManual: boolean } };
    }>(
      await runCli(
        [
          "runs",
          "execute-process-proposal",
          "run-1",
          "--proposal-event",
          "process-proposal-event-1",
          "--json"
        ],
        dependencies
      )
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
    expect(outcomeOverride).toMatchObject({
      status: "not_available",
      reason: "final_candidate_proposal_unavailable"
    });
    expect(resources).toMatchObject({
      sessionId: "session-1",
      plannedResources: [
        {
          reference: {
            resourceId: "resource-1"
          }
        }
      ],
      deliveryAudits: [
        {
          eventId: "resource-delivery-event-1",
          resourceId: "resource-1"
        }
      ]
    });
    expect(processProposals.proposals).toEqual([
      expect.objectContaining({
        primitive: "sealed_divergence",
        status: "proposed"
      })
    ]);
    expect(processProposals.observations).toContain(
      "No sealed divergence round is recorded for this run."
    );
    expect(finalProposal).toMatchObject({
      proposalId: "final-candidate-1",
      appended: true,
      event: {
        sessionId: "session-1",
        type: "final_candidate_proposed"
      }
    });
    expect(finalAudit).toMatchObject({
      appended: true,
      event: {
        sessionId: "session-1",
        type: "final_audit_recorded",
        basedOnEventIds: ["final-candidate-event-1"]
      }
    });
    expect(executedProcessProposal).toMatchObject({
      processProposal: {
        proposalEventId: "process-proposal-event-1",
        primitive: "sealed_divergence",
        latestStatus: "accepted"
      },
      startRequest: {
        sealedDivergence: {
          autoCloseManual: true
        }
      }
    });
    expect(daemonClient.createRun).toHaveBeenCalledWith({
      runPlan: {
        topic: "Run from CLI"
      }
    });
    expect(daemonClient.listRuns).toHaveBeenCalledTimes(1);
    expect(daemonClient.getRun).toHaveBeenCalledWith("run-1");
    expect(daemonClient.getRun).toHaveBeenCalledTimes(4);
    expect(daemonClient.getRunEvents).toHaveBeenCalledWith("run-1");
    expect(daemonClient.startRun).toHaveBeenCalledWith("run-1", {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    expect(daemonClient.getRunOutcome).toHaveBeenCalledWith("run-1");
    expect(daemonClient.getRunOutcome).toHaveBeenCalledWith("run-1", {
      finalCandidateProposalEventId: "final-candidate-event-2"
    });
    expect(daemonClient.getSessionResources).toHaveBeenCalledWith("session-1");
    expect(daemonClient.getRunProcessProposals).toHaveBeenCalledWith("run-1");
    expect(daemonClient.proposeFinalCandidate).toHaveBeenCalledWith("session-1", {
      authorId: "final-coordinator",
      candidateIds: ["candidate-1"],
      recommendation: "Record daemon final candidate material.",
      applicabilityConditions: ["Only for this daemon run session."],
      rationale: "Expose daemon final lifecycle through CLI run commands.",
      limitations: ["Requires final audit."],
      idempotencyKey: "daemon-final-candidate-1"
    });
    expect(daemonClient.auditFinalCandidate).toHaveBeenCalledWith(
      "session-1",
      "final-candidate-event-1",
      {
        authorId: "final-auditor",
        findings: ["The daemon final candidate remains provisional."],
        risks: ["Evidence may still be incomplete."],
        unresolvedObjectionIds: ["objection-1"],
        qualityObligationIds: ["quality-1"],
        evidenceNeedIds: ["evidence-1"],
        omissions: ["No external validation."],
        compressionProblems: [],
        limitations: ["Audit records boundaries only."],
        continuationSuggestions: ["Resolve evidence before reliance."],
        idempotencyKey: "daemon-final-audit-1"
      }
    );
    expect(daemonClient.executeRunProcessProposal).toHaveBeenCalledWith(
      "run-1",
      "process-proposal-event-1"
    );
    expect(createDaemonClient).toHaveBeenCalledTimes(12);
    expect(createEventStore).not.toHaveBeenCalled();
  });

  it("requires daemon run responses to include a session id before reading resources", async () => {
    const daemonClient = createFakeRunDaemonClient({
      getRun: vi.fn(async (runId: string) => ({
        run: {
          runId
        }
      }))
    });
    const { createEventStore, dependencies } = createRunCliDependencies({
      client: daemonClient
    });

    const result = await runCli(["runs", "resources", "run-1", "--json"], dependencies);

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatchObject({
      error: {
        name: "CliUsageError",
        detail: "Daemon run response did not include a sessionId."
      }
    });
    expect(daemonClient.getRun).toHaveBeenCalledWith("run-1");
    expect(daemonClient.getSessionResources).not.toHaveBeenCalled();
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

  it("passes optional daemon auth token from env to daemon commands", async () => {
    const configured = createRunCliDependencies({
      env: {
        DELIBERUM_DAEMON_AUTH_TOKEN: " local-daemon-auth-token-123 "
      }
    });

    await runCli(["daemon", "profiles", "--json"], configured.dependencies);

    expect(configured.createDaemonClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:3877",
      authToken: "local-daemon-auth-token-123"
    });
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

  it("records local process proposal lifecycle commands in the ledger", async () => {
    const dir = createTempDir();
    const storePath = join(dir, "events.json");
    const proposalPath = join(dir, "process-proposal.json");
    writeFileSync(
      proposalPath,
      JSON.stringify({
        id: "process-proposal-1",
        primitive: "evidence_check",
        targetIds: ["candidate-object-1"],
        expectedQualityGain: "Close evidence gaps before finalization.",
        riskIfSkipped: "The compiled outcome may rely on unsupported claims.",
        status: "proposed"
      })
    );
    await runWithStore(storePath, ["new", "Evaluate process lifecycle"], [
      "topic-contract-1",
      "session-1",
      "topic-event-1"
    ]);
    const proposed = parseOutput<{
      proposalId: string;
      event: { id: string; type: string; basedOnEventIds: string[] };
    }>(
      await runWithStore(
        storePath,
        [
          "process",
          "propose",
          "--session",
          "session-1",
          "--author",
          "system",
          "--input",
          proposalPath,
          "--based-on-event",
          "topic-event-1"
        ],
        ["process-proposal-event-1"]
      )
    );
    const challenged = parseOutput<{ event: { id: string; type: string } }>(
      await runWithStore(
        storePath,
        [
          "process",
          "challenge",
          "--session",
          "session-1",
          "--proposal-event",
          proposed.event.id,
          "--author",
          "reviewer-1",
          "--reason",
          "Review evidence priority first"
        ],
        ["challenge-1", "challenge-event-1"]
      )
    );
    const decided = parseOutput<{ event: { id: string; type: string } }>(
      await runWithStore(
        storePath,
        [
          "process",
          "decide",
          "--session",
          "session-1",
          "--proposal-event",
          proposed.event.id,
          "--author",
          "coordinator-1",
          "--status",
          "accepted",
          "--rationale",
          "Proceed as an operator-controlled next step"
        ],
        ["decision-1", "decision-event-1"]
      )
    );
    const projection = parseOutput<{
      proposalStates: Array<{
        proposalEventId: string;
        latestStatus: string;
        challengeEventIds: string[];
        decisionEventIds: string[];
      }>;
    }>(await runWithStore(storePath, ["process", "proposals", "--session", "session-1"], []));
    const storedEventTypes = new JsonFileEventStore({ filePath: storePath })
      .listEvents("session-1")
      .map((event) => event.type);

    expect(proposed).toMatchObject({
      proposalId: "process-proposal-1",
      event: {
        type: "process_proposal_proposed",
        basedOnEventIds: ["topic-event-1"]
      }
    });
    expect(challenged.event.type).toBe("process_proposal_challenged");
    expect(decided.event.type).toBe("process_proposal_decided");
    expect(projection.proposalStates).toEqual([
      expect.objectContaining({
        proposalEventId: proposed.event.id,
        latestStatus: "accepted",
        challengeEventIds: [challenged.event.id],
        decisionEventIds: [decided.event.id]
      })
    ]);
    expect(storedEventTypes).toEqual([
      "topic_contract_published",
      "process_proposal_proposed",
      "process_proposal_challenged",
      "process_proposal_decided"
    ]);

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

  it("records final candidate and audit commands before compiling a provisional outcome", async () => {
    const dir = createTempDir();
    const storePath = join(dir, "events.json");
    const extractionPath = join(dir, "extraction.json");
    const finalCandidatePath = join(dir, "final-candidate.json");
    const finalAuditPath = join(dir, "final-audit.json");

    await runWithStore(storePath, ["new", "Evaluate final projection commands"], [
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
    const extracted = parseOutput<{ event: { id: string } }>(
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
        "accept",
        "--session",
        "session-1",
        "--proposal-event",
        extracted.event.id,
        "--author",
        "participant-3",
        "--rationale",
        "Accept for final projection fixture"
      ],
      ["acceptance-1", "acceptance-event-1"]
    );
    writeFileSync(
      finalCandidatePath,
      JSON.stringify({
        candidateIds: ["candidate-1"],
        recommendation: "Provisionally use candidate 1 under stated constraints.",
        applicabilityConditions: ["The unresolved objection remains visible."],
        rationale: "Candidate 1 is the accepted active candidate in this fixture.",
        limitations: ["Evidence remains unchecked."]
      }),
      "utf8"
    );
    writeFileSync(
      finalAuditPath,
      JSON.stringify({
        findings: ["The draft preserves unresolved material."],
        risks: ["Evidence remains open."],
        unresolvedObjectionIds: ["objection-1"],
        qualityObligationIds: ["quality-1"],
        evidenceNeedIds: ["evidence-need-1"],
        omissions: ["No repair step has run."],
        compressionProblems: ["The source objection is summarized."],
        limitations: ["Audit did not verify evidence."],
        continuationSuggestions: ["Run evidence check before relying on this outcome."]
      }),
      "utf8"
    );

    const finalProposal = parseOutput<{
      proposalId: string;
      appended: boolean;
      event: {
        id: string;
        type: string;
        payload: {
          status: string;
          candidateIds: string[];
          recommendation: string;
        };
      };
    }>(
      await runWithStore(
        storePath,
        [
          "final",
          "propose",
          "--session",
          "session-1",
          "--author",
          "participant-4",
          "--input",
          finalCandidatePath,
          "--idempotency-key",
          "same-final-candidate"
        ],
        ["final-proposal-1", "final-proposal-event-1"]
      )
    );
    const finalAudit = parseOutput<{
      appended: boolean;
      event: {
        id: string;
        type: string;
        basedOnEventIds: string[];
        payload: {
          status: string;
          findings: string[];
          risks: string[];
        };
      };
    }>(
      await runWithStore(
        storePath,
        [
          "final",
          "audit",
          "--session",
          "session-1",
          "--proposal-event",
          finalProposal.event.id,
          "--author",
          "participant-5",
          "--input",
          finalAuditPath,
          "--idempotency-key",
          "same-final-audit"
        ],
        ["final-audit-1", "final-audit-event-1"]
      )
    );
    const compiled = parseOutput<{
      recommendation: string;
      draftStatus: string;
      unresolvedObjections: Array<{ object: { id: string } }>;
      evidenceStatus: { evidenceNeeds: Array<{ status: string; evidenceNeed: { object: { id: string } } }> };
      provenance: {
        finalCandidateProposalEventId?: string;
        finalAuditEventIds: string[];
      };
    }>(
      await runWithStore(
        storePath,
        [
          "final",
          "compile",
          "--session",
          "session-1",
          "--proposal-event",
          finalProposal.event.id
        ],
        []
      )
    );
    const storedEventTypes = new JsonFileEventStore({ filePath: storePath })
      .listEvents("session-1")
      .map((event) => event.type);
    const serializedCompiled = JSON.stringify(compiled);

    expect(finalProposal).toMatchObject({
      proposalId: "final-proposal-1",
      appended: true,
      event: {
        type: "final_candidate_proposed",
        payload: {
          status: "proposed",
          candidateIds: ["candidate-1"],
          recommendation: "Provisionally use candidate 1 under stated constraints."
        }
      }
    });
    expect(finalProposal.event.payload).not.toHaveProperty("winner");
    expect(finalProposal.event.payload).not.toHaveProperty("finalAnswer");
    expect(finalAudit).toMatchObject({
      appended: true,
      event: {
        type: "final_audit_recorded",
        basedOnEventIds: [finalProposal.event.id],
        payload: {
          status: "recorded",
          findings: ["The draft preserves unresolved material."],
          risks: ["Evidence remains open."]
        }
      }
    });
    expect(compiled).toMatchObject({
      recommendation: "Provisionally use candidate 1 under stated constraints.",
      draftStatus: "provisional",
      provenance: {
        finalCandidateProposalEventId: finalProposal.event.id,
        finalAuditEventIds: [finalAudit.event.id]
      }
    });
    expect(compiled.unresolvedObjections[0]?.object.id).toBe("objection-1");
    expect(compiled.evidenceStatus.evidenceNeeds[0]).toMatchObject({
      status: "unchecked",
      evidenceNeed: {
        object: {
          id: "evidence-need-1"
        }
      }
    });
    for (const forbidden of [
      "finalAnswer",
      "currentBest",
      "winner",
      "rank",
      "score",
      "vote",
      "truthSummary"
    ]) {
      expect(compiled).not.toHaveProperty(forbidden);
      expect(serializedCompiled).not.toContain(`"${forbidden}"`);
    }
    expect(storedEventTypes).toEqual([
      "topic_contract_published",
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "extraction_proposed",
      "proposal_accepted",
      "final_candidate_proposed",
      "final_audit_recorded"
    ]);

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
