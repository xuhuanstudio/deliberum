import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, createWebQueryClient } from "../src/App";
import {
  resolveDaemonAuthToken,
  resolveDaemonBaseUrl,
  type WebDaemonClient
} from "../src/client";

const projection = {
  version: "1" as const,
  eventRange: {
    fromSequence: 0,
    toSequence: 1
  },
  eventIds: ["event-1", "proposal-event-1"]
};

const runDetail = {
  runId: "run-1",
  sessionId: "session-1",
  status: "created",
  title: "Run Alpha",
  topic: "Evaluate the local daemon run workspace",
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:01:00.000Z",
  sealedDivergenceStatus: "completed",
  latestExtractionStatus: "completed",
  latestProposalReviewStatus: "completed",
  latestFinalizationStatus: "completed",
  ledger: {
    eventCount: 7
  },
  plan: {
    topic: "Evaluate the local daemon run workspace",
    goals: ["Inspect run state"],
    constraints: ["Keep outcomes provisional"],
    providerConfigs: []
  },
  rounds: {
    sealedDivergence: {
      roundId: "sealed-round-1",
      status: "completed"
    },
    extraction: [
      {
        roundId: "extraction-round-1",
        status: "completed"
      }
    ],
    proposalReview: [],
    finalization: []
  }
};

function createClient(overrides: Partial<WebDaemonClient> = {}): WebDaemonClient {
  return {
    health: vi.fn(async () => ({
      status: "ok",
      service: "deliberum-daemon",
      host: "127.0.0.1",
      port: 3877
    })),
    getRuntimeProfiles: vi.fn(async () => ({
      profiles: [
        {
          id: "local-preset",
          name: "Local preset",
          enabled: true,
          status: "ready",
          components: [
            {
              id: "local-preset-alpha",
              kind: "participant_adapter",
              enabled: true
            }
          ],
          setup: {
            enableEnvVar: "DELIBERUM_ENABLE_LOCAL_PRESET",
            envVars: [],
            missingRecommendedEnvVars: [],
            notes: []
          },
          boundaries: []
        },
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
              }
            ],
            missingRecommendedEnvVars: [
              "DELIBERUM_OPENAI_BASE_URL",
              "DELIBERUM_OPENAI_MODEL"
            ],
            notes: []
          },
          boundaries: []
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
            envVars: [],
            missingRecommendedEnvVars: [
              "DELIBERUM_MCP_TOOL_URL",
              "DELIBERUM_MCP_TOOL_NAME"
            ],
            notes: []
          },
          boundaries: []
        }
      ]
    })),
    listSessions: vi.fn(async () => ({
      sessions: [
        {
          sessionId: runDetail.sessionId,
          topicContractEventId: "event-1",
          title: "Stage 11 shell",
          topic: "Evaluate the local daemon run workspace",
          createdAt: "2026-06-10T00:00:00.000Z",
          recordedAt: "2026-06-10T00:00:00.000Z",
          latestEventRecordedAt: "2026-06-10T00:01:00.000Z",
          eventCount: 7
        }
      ]
    })),
    listEvents: vi.fn(async () => ({
      events: [
        {
          id: "event-1",
          type: "topic_contract_published",
          sequence: 0,
          payload: {
            topic: "Stage 11 shell"
          }
        }
      ]
    })),
    createRun: vi.fn(async (input) => ({
      run: runDetail,
      session: {
        sessionId: runDetail.sessionId
      },
      event: {
        id: "event-1",
        type: "topic_contract_published",
        payload: input.runPlan
      }
    })),
    listRuns: vi.fn(async () => ({
      runs: [runDetail]
    })),
    getRun: vi.fn(async () => ({
      run: runDetail
    })),
    getRunEvents: vi.fn(async () => ({
      runId: runDetail.runId,
      sessionId: runDetail.sessionId,
      events: [
        {
          id: "event-1",
          type: "topic_contract_published",
          sequence: 0,
          visibility: "public",
          authorId: "system",
          createdAt: "2026-06-10T00:00:00.000Z",
          payload: {
            topic: "Evaluate the local daemon run workspace"
          },
          basedOnEventIds: [],
          trace: {}
        },
        {
          id: "event-redacted",
          type: "sealed_contribution_submitted",
          sequence: 1,
          visibility: "sealed",
          authorId: "participant-1",
          createdAt: "2026-06-10T00:00:01.000Z",
          payload: {
            redacted: true,
            reason: "sealed_until_reveal"
          },
          basedOnEventIds: [],
          trace: {}
        }
      ]
    })),
    getRunEventsStreamUrl: vi.fn(
      (runId) => `http://127.0.0.1:3877/runs/${encodeURIComponent(runId)}/events/stream`
    ),
    startRun: vi.fn(async () => ({
      run: {
        ...runDetail,
        status: "running"
      },
      stages: [
        {
          stage: "sealed_divergence",
          executionStatus: "executed",
          roundId: "sealed-round-1",
          status: "completed",
          eventIds: ["event-2", "event-3"],
          result: {
            hiddenPayload: "do not render this result payload"
          }
        }
      ],
      stopped: false
    })),
    getRunOutcome: vi.fn(async () => ({
      runId: runDetail.runId,
      sessionId: runDetail.sessionId,
      status: "compiled",
      draftStatus: "provisional",
      outcome: {
        summary: "Provisional compiled material",
        limitations: ["Needs further audit"]
      }
    })),
    getRunProcessProposals: vi.fn(async () => ({
      runId: runDetail.runId,
      sessionId: runDetail.sessionId,
      proposals: [
        {
          id: "adaptive:run-1:final_contest:abcd1234",
          primitive: "final_contest",
          status: "proposed",
          targetIds: ["candidate-1"],
          expectedQualityGain:
            "Generate final candidate proposal material from the accepted active candidate frontier.",
          riskIfSkipped:
            "The run may stop before final candidate alternatives are explicitly proposed and auditable.",
          requestedBudget: {
            maxEvents: 2,
            maxProviderCalls: 1
          }
        }
      ],
      observations: [
        "Accepted active candidates are available without open evidence or repair targets."
      ],
      metadata: {
        version: "1",
        eventRange: {
          fromSequence: 0,
          toSequence: 6
        },
        eventIds: ["event-1", "proposal-event-1"]
      }
    })),
    getProcessProposalStates: vi.fn(async () => ({
      proposalStates: [],
      projection
    })),
    proposeProcessProposal: vi.fn(async (_sessionId, input) => ({
      proposalId:
        typeof input.proposal === "object" &&
        input.proposal !== null &&
        "id" in input.proposal &&
        typeof input.proposal.id === "string"
          ? input.proposal.id
          : "process-proposal-1",
      event: {
        id: "process-proposal-event-1",
        type: "process_proposal_proposed",
        payload: input.proposal,
        basedOnEventIds: input.basedOnEventIds ?? []
      }
    })),
    challengeProcessProposal: vi.fn(async (_sessionId, proposalEventId, input) => ({
      event: {
        id: "process-challenge-event-1",
        type: "process_proposal_challenged",
        basedOnEventIds: [proposalEventId],
        payload: input
      }
    })),
    decideProcessProposal: vi.fn(async (_sessionId, proposalEventId, input) => ({
      event: {
        id: "process-decision-event-1",
        type: "process_proposal_decided",
        basedOnEventIds: [proposalEventId],
        payload: input
      }
    })),
    executeRunProcessProposal: vi.fn(async () => ({
      run: {
        ...runDetail,
        status: "running"
      },
      stages: [
        {
          stage: "sealed_divergence",
          executionStatus: "executed",
          roundId: "sealed-round-1",
          status: "completed",
          eventIds: ["event-8", "event-9"],
          result: {}
        }
      ],
      stopped: false,
      processProposal: {
        proposalEventId: "process-proposal-event-1",
        proposalId: "process-proposal-1",
        primitive: "sealed_divergence",
        latestStatus: "accepted"
      },
      startRequest: {
        sealedDivergence: {
          autoCloseManual: true
        }
      }
    })),
    getSessionFinal: vi.fn(async () => ({
      sessionId: runDetail.sessionId,
      status: "compiled",
      draftStatus: "provisional",
      outcome: {
        recommendation: "Use the daemon-backed final projection as reviewable material.",
        unresolvedQuestions: ["Evidence coverage remains incomplete."],
        continuationSuggestions: ["Collect another source before relying on this draft."],
        limitations: ["Compiled from accepted proposal material only."],
        provenance: {
          projectionBasis: "event_ledger_and_projections",
          projectionVersion: "1",
          eventRange: {
            fromSequence: 0,
            toSequence: 8
          },
          eventIds: ["event-1", "proposal-event-1", "final-candidate-event-1"],
          finalCandidateProposalEventId: "final-candidate-event-1",
          finalAuditEventIds: ["final-audit-event-1"]
        }
      }
    })),
    proposeFinalCandidate: vi.fn(async (_sessionId, input) => ({
      proposalId: "final-candidate-1",
      appended: true,
      event: {
        id: "final-candidate-event-1",
        type: "final_candidate_proposed",
        payload: input
      }
    })),
    auditFinalCandidate: vi.fn(async (_sessionId, proposalEventId, input) => ({
      appended: true,
      event: {
        id: "final-audit-event-1",
        type: "final_audit_recorded",
        basedOnEventIds: [proposalEventId],
        payload: input
      }
    })),
    getSessionResources: vi.fn(async () => ({
      sessionId: runDetail.sessionId,
      source: {
        kind: "run_plan",
        runId: runDetail.runId
      },
      plannedResources: [
        {
          reference: {
            resourceId: "resource-1",
            required: true,
            preferredDeliveryMode: "url"
          },
          registered: true,
          resource: {
            id: "resource-1",
            kind: "text",
            mime: "text/plain",
            sizeBytes: 12,
            hash: "hash-resource-1",
            privacy: "public",
            variants: [
              {
                mode: "url",
                exposure: "public"
              }
            ]
          }
        },
        {
          reference: {
            resourceId: "resource-missing",
            required: false,
            preferredDeliveryMode: "none"
          },
          registered: false
        }
      ],
      deliveryAudits: [
        {
          eventId: "delivery-audit-event-1",
          sequence: 8,
          createdAt: "2026-06-10T00:02:00.000Z",
          recordedAt: "2026-06-10T00:02:00.000Z",
          basedOnEventIds: [],
          resourceDeliveryId: "delivery-1",
          resourceId: "resource-1",
          participantId: "participant-1",
          resource: {
            kind: "text",
            mime: "text/plain",
            sizeBytes: 12,
            hash: "hash-resource-1",
            privacy: "public"
          },
          request: {
            policy: {
              requestedMode: "none"
            }
          },
          result: {
            selectedMode: "none",
            allowed: false,
            reason: "No resource delivery mode was selected.",
            warnings: []
          }
        }
      ],
      accessAudits: [
        {
          eventId: "access-audit-event-1",
          sequence: 9,
          createdAt: "2026-06-10T00:02:05.000Z",
          recordedAt: "2026-06-10T00:02:05.000Z",
          basedOnEventIds: ["delivery-audit-event-1"],
          action: "created" as const,
          resourceAccessId: "resource-access-audit-1",
          resourceId: "resource-1",
          participantId: "participant-1",
          resource: {
            kind: "text",
            mime: "text/plain",
            sizeBytes: 12,
            hash: "hash-resource-1",
            privacy: "public"
          },
          grant: {
            mode: "redirect",
            exposure: "public",
            tokenHash: "sha256:token-hash",
            expiresAt: "2026-06-10T00:05:00.000Z"
          }
        }
      ],
      evidenceNeeds: [
        {
          object: {
            id: "evidence-need-1",
            targetClaimId: "claim-1",
            status: "open"
          },
          proposalEventId: "proposal-event-1",
          proposalId: "proposal-1",
          acceptedByEventIds: ["acceptance-event-1"],
          sourceEventIds: ["event-1"]
        }
      ],
      projection
    })),
    getFrontier: vi.fn(async () => ({
      basis: "accepted_active_candidates",
      candidates: [
        {
          object: {
            id: "candidate-1",
            title: "Candidate A",
            status: "active"
          },
          proposalEventId: "proposal-event-1",
          sourceEventIds: ["event-1"]
        }
      ],
      projection
    })),
    getObjections: vi.fn(async () => ({
      objections: [
        {
          object: {
            id: "objection-1",
            status: "open"
          },
          proposalEventId: "proposal-event-1"
        }
      ],
      projection
    })),
    getObligations: vi.fn(async () => ({
      qualityObligations: [
        {
          object: {
            id: "quality-1",
            status: "unanswered"
          },
          proposalEventId: "proposal-event-1"
        }
      ],
      projection
    })),
    ...overrides
  };
}

function renderApp(initialPath: string, client = createClient()) {
  render(
    <App
      daemonClient={client}
      daemonBaseUrl="http://127.0.0.1:3877"
      queryClient={createWebQueryClient()}
      initialPath={initialPath}
    />
  );

  return client;
}

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }

  emitMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(data)
      })
    );
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();

    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emitNamedEvent(type: string, data: unknown) {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data)
    });

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

function installMockEventSource() {
  MockEventSource.instances = [];
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    writable: true,
    value: MockEventSource
  });

  return MockEventSource;
}

function readWebSource(): string {
  return [
    "src/App.tsx",
    "src/client.ts",
    "src/daemon-runtime.tsx",
    "src/routes.tsx",
    "src/run-presets.ts",
    "src/run-workspace.tsx",
    "src/view-components.tsx"
  ]
    .map((filePath) => readFileSync(resolve(process.cwd(), filePath), "utf8"))
    .join("\n");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (globalThis as { EventSource?: unknown }).EventSource;
  MockEventSource.instances = [];
});

describe("@deliberum/web shell", () => {
  it("resolves daemon URL from explicit development env or local default", () => {
    expect(resolveDaemonBaseUrl({})).toBe("http://127.0.0.1:3877");
    expect(
      resolveDaemonBaseUrl({
        VITE_DELIBERUM_DAEMON_URL: " http://127.0.0.1:4888 "
      })
    ).toBe("http://127.0.0.1:4888");
    expect(resolveDaemonAuthToken({})).toBeUndefined();
    expect(
      resolveDaemonAuthToken({
        VITE_DELIBERUM_DAEMON_AUTH_TOKEN: " local-daemon-auth-token-123 "
      })
    ).toBe("local-daemon-auth-token-123");
  });

  it("opens sessions through explicit session-id navigation without stored session state", async () => {
    const client = renderApp("/");

    expect(await screen.findByText("Open a deliberation session")).toBeTruthy();
    expect(screen.queryByLabelText(/chat/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/message/i)).toBeNull();

    fireEvent.change(screen.getByLabelText("Session id"), {
      target: {
        value: "session-1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await screen.findByText("Ledger position");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
  });

  it("renders the daemon session catalog without owning session state", async () => {
    const client = renderApp("/");

    expect(await screen.findByText("Daemon sessions")).toBeTruthy();
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled());
    expect(screen.getByText("Stage 11 shell")).toBeTruthy();
    expect(screen.getByText("Evaluate the local daemon run workspace")).toBeTruthy();
    expect(screen.getByText("event-1")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Open session" }));

    await screen.findByText("Ledger position");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
  });

  it("renders daemon runtime profile status without environment values", async () => {
    const client = renderApp("/");

    expect(await screen.findByText("Runtime profiles")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("Local preset")).toBeTruthy();
    expect(screen.getByText("OpenAI-compatible")).toBeTruthy();
    expect(screen.getByText("MCP tool")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Ready with run config")).toBeTruthy();
    expect(screen.getByText("Needs configuration")).toBeTruthy();
    expect(screen.getByText("DELIBERUM_OPENAI_BASE_URL, DELIBERUM_OPENAI_MODEL")).toBeTruthy();
    expect(screen.getByText("DELIBERUM_MCP_TOOL_URL, DELIBERUM_MCP_TOOL_NAME")).toBeTruthy();
    expect(screen.queryByText("sk-openai-runtime-secret")).toBeNull();
  });

  it("renders the session overview from daemon ledger events", async () => {
    const client = renderApp("/sessions/session-1");

    await screen.findByText("Ledger position");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Event entries")).toBeTruthy();
    expect(screen.getByText("topic_contract_published")).toBeTruthy();
  });

  it("renders Candidate Frontier as a basis plus candidate list", async () => {
    const client = renderApp("/sessions/session-1/frontier");

    await screen.findByText("Accepted active candidates");
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/accepted_active_candidates/)).toBeTruthy();
    expect(screen.getAllByText(/candidate-1/).length).toBeGreaterThan(0);

    const renderedText = document.body.textContent ?? "";
    for (const forbiddenField of ["currentBest", "winner", "rank", "score", "vote"]) {
      expect(renderedText).not.toContain(forbiddenField);
    }
  });

  it("renders objections and quality obligations from daemon projections", async () => {
    const client = renderApp("/sessions/session-1/objections");

    await screen.findByText("First-class objections");
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/objection-1/)).toBeTruthy();

    cleanup();

    const nextClient = renderApp("/sessions/session-1/obligations");
    await screen.findByText("Obligations and status");
    await waitFor(() => expect(nextClient.getObligations).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/quality-1/)).toBeTruthy();
    expect(screen.getByText(/unanswered/)).toBeTruthy();
  });

  it("renders append-only ledger entries without stripping arbitrary payload keys", async () => {
    const client = createClient({
      listEvents: vi.fn(async () => ({
        events: [
          {
            id: "event-1",
            type: "sealed_contribution_submitted",
            sequence: 1,
            payload: {
              message: "legitimate user payload field"
            }
          }
        ]
      }))
    });

    renderApp("/sessions/session-1/events", client);

    await screen.findByText("Append-only ledger entries");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/sealed_contribution_submitted/)).toBeTruthy();
    expect(screen.getByText(/legitimate user payload field/)).toBeTruthy();
  });

  it("lists daemon runs", async () => {
    const client = renderApp("/runs");

    await screen.findByText("Daemon runs");
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    expect(screen.getByText("How local runs work")).toBeTruthy();
    expect(screen.getByText("A controlled orchestration job owned by the local daemon run store.")).toBeTruthy();
    expect(screen.getByText("The underlying append-only event ledger session created for the run.")).toBeTruthy();
    expect(screen.getByText(/Recorded lifecycle events/)).toBeTruthy();
    expect(screen.getByText(/compiled artifact from accepted proposal material/)).toBeTruthy();
    expect(screen.getByText("Run Alpha")).toBeTruthy();
    expect(screen.getByText("run-1")).toBeTruthy();
    expect(screen.getByText("Created: run exists, pipeline has not started.")).toBeTruthy();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("creates a run from a JSON run plan object", async () => {
    const client = renderApp("/runs/new");
    const runPlan = {
      topic: "New local run",
      goals: ["Inspect"],
      constraints: ["Keep provisional"]
    };

    await screen.findByText("Create a daemon run");
    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: JSON.stringify(runPlan)
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    await waitFor(() => expect(client.createRun).toHaveBeenCalledWith({ runPlan }));
    expect(await screen.findByText("Run created")).toBeTruthy();
    expect(screen.getByText(/run-1/)).toBeTruthy();
  });

  it("rejects invalid run plan JSON without calling the daemon", async () => {
    const client = renderApp("/runs/new");

    await screen.findByText("Create a daemon run");
    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: "{"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    expect(await screen.findByText("Run plan must be valid JSON.")).toBeTruthy();
    expect(client.createRun).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: "[]"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    expect(await screen.findByText("Run plan must be a JSON object.")).toBeTruthy();
    expect(client.createRun).not.toHaveBeenCalled();
  });

  it("fills and creates the local preset run plan", async () => {
    const client = renderApp("/runs/new");

    await screen.findByText("Create a daemon run");
    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: "{}"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fill local preset run plan" }));

    expect(
      (screen.getByLabelText("Advanced run plan JSON") as HTMLTextAreaElement).value
    ).toContain("local-preset-alpha");

    fireEvent.click(screen.getByRole("button", { name: "Create local preset run" }));

    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith({
        runPlan: expect.objectContaining({
          title: "Local preset run",
          providerConfigs: [],
          participants: expect.arrayContaining([
            expect.objectContaining({
              adapterId: "local-preset-alpha"
            })
          ])
        })
      })
    );
  });

  it("renders run detail, stage status, and projection panels without raw event loading", async () => {
    const client = renderApp("/runs/run-1");

    await screen.findByText("Run detail");
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getRunProcessProposals).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getProcessProposalStates).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));

    expect(screen.getByText("Run status")).toBeTruthy();
    expect(screen.getByText("Ledger events")).toBeTruthy();
    expect(screen.getByText("7 recorded lifecycle events")).toBeTruthy();
    expect(screen.getByText("Run ledger timeline")).toBeTruthy();
    expect(screen.getByText("Event entries")).toBeTruthy();
    expect(screen.getByText(/topic_contract_published/)).toBeTruthy();
    expect(screen.getByText(/sealed_until_reveal/)).toBeTruthy();
    expect(screen.getByText("Current run meaning")).toBeTruthy();
    expect(screen.getByText("Stage status")).toBeTruthy();
    expect(screen.getByText("Process proposals")).toBeTruthy();
    expect(screen.getByText("final_contest")).toBeTruthy();
    expect(screen.getByText("Suggested primitives")).toBeTruthy();
    expect(screen.getByText("Suggestion observations")).toBeTruthy();
    expect(screen.getByText("Process governance ledger")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record proposal in ledger" })).toBeTruthy();
    expect(screen.getByText("No recorded process proposals")).toBeTruthy();
    expect(screen.getByText("Candidate Frontier projection")).toBeTruthy();
    expect(screen.getByText("Candidate A")).toBeTruthy();
    expect(screen.getByText("Objections projection")).toBeTruthy();
    expect(screen.getAllByText(/objection-1/).length).toBeGreaterThan(0);
    expect(screen.getByText("Quality obligations projection")).toBeTruthy();
    expect(screen.getAllByText(/quality-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Projection events").length).toBeGreaterThan(0);
    expect(client.listEvents).not.toHaveBeenCalled();
  });

  it("records a suggested process proposal into the session ledger", async () => {
    let recorded = false;
    const getProcessProposalStates = vi.fn(async () =>
      recorded
        ? {
            proposalStates: [
              {
                proposalEventId: "process-proposal-event-1",
                proposalId: "adaptive:run-1:final_contest:abcd1234",
                latestStatus: "proposed",
                proposal: {
                  id: "adaptive:run-1:final_contest:abcd1234",
                  primitive: "final_contest",
                  status: "proposed",
                  targetIds: ["candidate-1"]
                },
                challengeEventIds: [],
                decisionEventIds: []
              }
            ],
            projection
          }
        : {
            proposalStates: [],
            projection
          }
    );
    const proposeProcessProposal = vi.fn(async (_sessionId: string, input: unknown) => {
      recorded = true;

      return {
        proposalId: "adaptive:run-1:final_contest:abcd1234",
        event: {
          id: "process-proposal-event-1",
          type: "process_proposal_proposed",
          payload: input
        }
      };
    });
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getProcessProposalStates,
        proposeProcessProposal
      })
    );

    await screen.findByText("Process proposals");
    fireEvent.click(await screen.findByRole("button", { name: "Record proposal in ledger" }));

    await waitFor(() =>
      expect(proposeProcessProposal).toHaveBeenCalledWith("session-1", {
        authorId: "system",
        proposal: expect.objectContaining({
          id: "adaptive:run-1:final_contest:abcd1234",
          primitive: "final_contest",
          status: "proposed"
        }),
        basedOnEventIds: ["event-1", "proposal-event-1"]
      })
    );
    expect(await screen.findByText("Process proposal recorded")).toBeTruthy();
    await waitFor(() => expect(getProcessProposalStates).toHaveBeenCalledTimes(2));
    expect(client.startRun).not.toHaveBeenCalled();
  });

  it("records process proposal challenges and decisions without starting the run", async () => {
    const challengeProcessProposal = vi.fn(async () => ({
      event: {
        id: "process-challenge-event-1",
        type: "process_proposal_challenged"
      }
    }));
    const decideProcessProposal = vi.fn(async () => ({
      event: {
        id: "process-decision-event-1",
        type: "process_proposal_decided"
      }
    }));
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getProcessProposalStates: vi.fn(async () => ({
          proposalStates: [
            {
              proposalEventId: "process-proposal-event-1",
              proposalId: "process-proposal-1",
              latestStatus: "proposed",
              proposal: {
                id: "process-proposal-1",
                primitive: "evidence_check",
                status: "proposed",
                targetIds: ["candidate-1"]
              },
              challengeEventIds: [],
              decisionEventIds: []
            }
          ],
          projection
        })),
        challengeProcessProposal,
        decideProcessProposal
      })
    );

    await screen.findByText("Recorded process proposal");
    fireEvent.change(screen.getByLabelText("Challenge reason"), {
      target: {
        value: "Evidence check should wait for one repair pass."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Record challenge" }));

    await waitFor(() =>
      expect(challengeProcessProposal).toHaveBeenCalledWith(
        "session-1",
        "process-proposal-event-1",
        {
          authorId: "process-reviewer",
          reason: "Evidence check should wait for one repair pass."
        }
      )
    );
    expect(await screen.findByText("Challenge recorded")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Decision status"), {
      target: {
        value: "deferred"
      }
    });
    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: {
        value: "Defer until the repair pass is visible in the ledger."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));

    await waitFor(() =>
      expect(decideProcessProposal).toHaveBeenCalledWith(
        "session-1",
        "process-proposal-event-1",
        {
          authorId: "process-coordinator",
          status: "deferred",
          rationale: "Defer until the repair pass is visible in the ledger."
        }
      )
    );
    expect(await screen.findByText("Decision recorded")).toBeTruthy();
    expect(client.startRun).not.toHaveBeenCalled();
    expect(client.executeRunProcessProposal).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", {
        name: "Execute accepted process proposal"
      }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("executes accepted process proposals through the explicit daemon run path", async () => {
    const executeRunProcessProposal = vi.fn(async () => ({
      run: {
        ...runDetail,
        status: "revealed"
      },
      stages: [
        {
          stage: "sealed_divergence",
          executionStatus: "executed",
          roundId: "sealed-round-1",
          status: "completed",
          eventIds: ["sealed-opened-event-1", "sealed-revealed-event-1"],
          result: {}
        }
      ],
      stopped: false,
      processProposal: {
        proposalEventId: "process-proposal-event-1",
        proposalId: "process-proposal-1",
        primitive: "sealed_divergence",
        latestStatus: "accepted"
      },
      startRequest: {
        sealedDivergence: {
          autoCloseManual: true
        }
      }
    }));
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getProcessProposalStates: vi.fn(async () => ({
          proposalStates: [
            {
              proposalEventId: "process-proposal-event-1",
              proposalId: "process-proposal-1",
              latestStatus: "accepted",
              proposal: {
                id: "process-proposal-1",
                primitive: "sealed_divergence",
                status: "proposed",
                targetIds: ["participant-1", "participant-2"]
              },
              challengeEventIds: [],
              decisionEventIds: ["process-decision-event-1"]
            }
          ],
          projection
        })),
        executeRunProcessProposal
      })
    );

    await screen.findByText("Recorded process proposal");
    fireEvent.click(screen.getByRole("button", { name: "Execute accepted process proposal" }));

    await waitFor(() =>
      expect(executeRunProcessProposal).toHaveBeenCalledWith(
        "run-1",
        "process-proposal-event-1"
      )
    );
    expect(await screen.findByText("Run request completed")).toBeTruthy();
    expect(screen.getByText("Stage results")).toBeTruthy();
    expect(client.startRun).not.toHaveBeenCalled();
  });

  it("follows daemon-redacted run events only after the user starts live follow", async () => {
    const EventSourceMock = installMockEventSource();
    const client = renderApp("/runs/run-1");

    await screen.findByText("Run ledger timeline");
    expect(EventSourceMock.instances).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Start live follow" }));

    await waitFor(() => expect(client.getRunEventsStreamUrl).toHaveBeenCalledWith("run-1"));
    expect(EventSourceMock.instances).toHaveLength(1);
    expect(EventSourceMock.instances[0]?.url).toBe(
      "http://127.0.0.1:3877/runs/run-1/events/stream"
    );

    act(() => {
      EventSourceMock.instances[0]?.emitOpen();
    });

    expect(await screen.findByText("Live follow connected")).toBeTruthy();

    act(() => {
      EventSourceMock.instances[0]?.emitNamedEvent("event", {
        id: "event-live",
        type: "final_audit_recorded",
        sequence: 9,
        visibility: "public",
        authorId: "system",
        createdAt: "2026-06-10T00:00:09.000Z",
        payload: {
          redacted: true,
          reason: "event_visibility"
        },
        basedOnEventIds: ["event-1"],
        trace: {}
      });
    });

    expect(await screen.findByText(/final_audit_recorded/)).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(client.listEvents).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop live follow" }));

    await waitFor(() => expect(EventSourceMock.instances[0]?.closed).toBe(true));
  });

  it("explains created runs and stages that have not run yet", async () => {
    renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: {
            ...runDetail,
            sealedDivergenceStatus: undefined,
            latestExtractionStatus: undefined,
            latestProposalReviewStatus: undefined,
            latestFinalizationStatus: undefined,
            ledger: {
              eventCount: 1
            }
          }
        }))
      })
    );

    expect(await screen.findByText("Created: run exists, pipeline has not started.")).toBeTruthy();
    expect(screen.getByText("1 recorded lifecycle event")).toBeTruthy();
    expect(screen.getAllByText("Not run yet").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("No round has been recorded for that stage.")).toBeTruthy();
  });

  it("starts a run from a JSON start request and renders only stage metadata", async () => {
    const client = renderApp("/runs/run-1");
    const startRequest = {
      extraction: {
        generatorIds: ["generator-1"]
      }
    };

    await screen.findByText("Start orchestration");
    fireEvent.change(screen.getByLabelText("Advanced start request JSON"), {
      target: {
        value: JSON.stringify(startRequest)
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledWith("run-1", startRequest));
    expect(await screen.findByText("Run request completed")).toBeTruthy();
    expect(screen.getByText("Stage results")).toBeTruthy();
    expect(screen.getByText(/sealed_divergence/)).toBeTruthy();
    expect(screen.getByText(/event-2/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("do not render this result payload");
  });

  it("fills and starts the full local preset pipeline through the client", async () => {
    const client = renderApp("/runs/run-1");

    await screen.findByText("Start orchestration");
    fireEvent.change(screen.getByLabelText("Advanced start request JSON"), {
      target: {
        value: "{}"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fill local preset start request" }));

    expect(
      (screen.getByLabelText("Advanced start request JSON") as HTMLTextAreaElement).value
    ).toContain("local-preset-extractor");

    fireEvent.click(screen.getByRole("button", { name: "Start full local preset pipeline" }));

    await waitFor(() =>
      expect(client.startRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          extraction: {
            generatorIds: ["local-preset-extractor"]
          },
          finalization: expect.objectContaining({
            finalCandidateGeneratorId: "local-preset-final-candidate",
            compileOutcome: true
          })
        })
      )
    );
  });

  it("refreshes run projection panels after a successful start without page reload", async () => {
    let started = false;
    const initialProjection = {
      version: "1" as const,
      eventRange: {
        fromSequence: 0,
        toSequence: 0
      },
      eventIds: ["event-1"]
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        startRun: vi.fn(async () => {
          started = true;

          return {
            run: {
              ...runDetail,
              status: "revealed"
            },
            stages: [
              {
                stage: "finalization",
                executionStatus: "executed",
                roundId: "final-round-1",
                status: "completed",
                eventIds: ["event-4"]
              }
            ],
            stopped: false
          };
        }),
        getFrontier: vi.fn(async () =>
          started
            ? {
                basis: "accepted_active_candidates",
                candidates: [
                  {
                    object: {
                      id: "candidate-after-start",
                      title: "Projection refreshed after start",
                      status: "active"
                    },
                    proposalEventId: "proposal-after-start",
                    sourceEventIds: ["event-4"]
                  }
                ],
                projection
              }
            : {
                basis: "accepted_active_candidates",
                candidates: [],
                projection: initialProjection
              }
        ),
        getObjections: vi.fn(async () =>
          started
            ? {
                objections: [
                  {
                    object: {
                      id: "objection-after-start",
                      failureMode: "Projection objection refreshed after start",
                      status: "open"
                    },
                    proposalEventId: "proposal-after-start"
                  }
                ],
                projection
              }
            : {
                objections: [],
                projection: initialProjection
              }
        ),
        getObligations: vi.fn(async () =>
          started
            ? {
                qualityObligations: [
                  {
                    object: {
                      id: "quality-after-start",
                      requirement: "Projection obligation refreshed after start",
                      status: "unanswered"
                    },
                    proposalEventId: "proposal-after-start"
                  }
                ],
                projection
              }
            : {
                qualityObligations: [],
                projection: initialProjection
              }
        )
      })
    );

    await screen.findByText("No Candidate Frontier entries");
    expect(screen.queryByText("Projection refreshed after start")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start full local preset pipeline" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(await screen.findByText("Run request completed")).toBeTruthy();
    expect(await screen.findByText("Projection refreshed after start")).toBeTruthy();
    expect(screen.getByText("Projection objection refreshed after start")).toBeTruthy();
    expect(screen.getByText("Projection obligation refreshed after start")).toBeTruthy();
    expect(client.getFrontier).toHaveBeenCalledTimes(2);
    expect(client.getObjections).toHaveBeenCalledTimes(2);
    expect(client.getObligations).toHaveBeenCalledTimes(2);
  });

  it("explains missing local preset components safely", async () => {
    const error = new Error("Required orchestration component is unavailable.");
    Object.assign(error, {
      code: "orchestration_component_unavailable",
      status: 400
    });
    const client = renderApp(
      "/runs/run-1",
      createClient({
        startRun: vi.fn(async () => {
          throw error;
        })
      })
    );

    await screen.findByText("Start orchestration");
    fireEvent.click(screen.getByRole("button", { name: "Start full local preset pipeline" }));

    expect(await screen.findByText("Run start failed")).toBeTruthy();
    expect(screen.getAllByText(/DELIBERUM_ENABLE_LOCAL_PRESET=true/).length).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain("stack");
  });

  it("renders compiled run output as a provisional outcome", async () => {
    const client = renderApp("/runs/run-1/outcome");

    await screen.findByText("Provisional outcome");
    await waitFor(() => expect(client.getRunOutcome).toHaveBeenCalledWith("run-1"));
    expect(screen.getByText("Draft status")).toBeTruthy();
    expect(screen.getAllByText(/provisional/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Provisional compiled material/)).toBeTruthy();
  });

  it("compiles run output for a selected proposal event", async () => {
    const client = renderApp("/runs/run-1/outcome");
    const getRunOutcome = vi.mocked(client.getRunOutcome);

    await screen.findByText("Provisional outcome");
    await waitFor(() => expect(getRunOutcome).toHaveBeenCalledWith("run-1"));

    fireEvent.change(screen.getByLabelText("Candidate proposal event override"), {
      target: {
        value: " final-candidate-event-2 "
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Compile projection" }));

    await waitFor(() =>
      expect(getRunOutcome).toHaveBeenCalledWith("run-1", {
        finalCandidateProposalEventId: "final-candidate-event-2"
      })
    );
    expect(await screen.findByText("Specific final proposal selected")).toBeTruthy();
    expect(screen.getByText("final-candidate-event-2")).toBeTruthy();

    const callCountBeforeClear = getRunOutcome.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Use latest proposal" }));

    await waitFor(() => expect(getRunOutcome.mock.calls.length).toBeGreaterThan(callCountBeforeClear));
    expect(getRunOutcome.mock.calls.at(-1)).toEqual(["run-1"]);
  });

  it("renders unavailable provisional outcome reasons safely", async () => {
    const client = createClient({
      getRunOutcome: vi.fn(async () => ({
        runId: "run-1",
        sessionId: "session-1",
        status: "not_available",
        reason: "final_candidate_proposal_unavailable"
      }))
    });

    renderApp("/runs/run-1/outcome", client);

    expect(await screen.findByText("Provisional outcome not available")).toBeTruthy();
    expect(screen.getByText(/No final candidate proposal exists yet/)).toBeTruthy();
  });

  it("renders session final projection from the daemon endpoint", async () => {
    const client = renderApp("/sessions/session-1/final");

    await screen.findByText("Compiled outcome projection");
    await waitFor(() => expect(client.getSessionFinal).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Projection remains provisional")).toBeTruthy();
    expect(screen.getByText("Candidate proposal event")).toBeTruthy();
    expect(screen.getAllByText(/final-candidate-event-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Use the daemon-backed final projection/).length).toBeGreaterThan(0);
    expect(screen.getByText("Unresolved questions")).toBeTruthy();
    expect(screen.getAllByText(/Evidence coverage remains incomplete/).length).toBeGreaterThan(0);
    expect(screen.getByText("Provenance")).toBeTruthy();
    expect(client.getRunOutcome).not.toHaveBeenCalled();
    expect(
      Array.from(document.querySelectorAll(".du-nav-link.is-active")).map(
        (element) => element.textContent
      )
    ).toEqual(["Final"]);
  });

  it("compiles session final projection for a selected proposal event", async () => {
    const client = renderApp("/sessions/session-1/final");
    const getSessionFinal = vi.mocked(client.getSessionFinal);

    await screen.findByText("Compiled outcome projection");
    await waitFor(() => expect(getSessionFinal).toHaveBeenCalledWith("session-1"));

    fireEvent.change(screen.getByLabelText("Candidate proposal event override"), {
      target: {
        value: " final-candidate-event-2 "
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Compile projection" }));

    await waitFor(() =>
      expect(getSessionFinal).toHaveBeenCalledWith("session-1", {
        finalCandidateProposalEventId: "final-candidate-event-2"
      })
    );
    expect(await screen.findByText("Specific final proposal selected")).toBeTruthy();
    expect(screen.getByText("final-candidate-event-2")).toBeTruthy();

    const callCountBeforeClear = getSessionFinal.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Use latest proposal" }));

    await waitFor(() => expect(getSessionFinal.mock.calls.length).toBeGreaterThan(callCountBeforeClear));
    expect(getSessionFinal.mock.calls.at(-1)).toEqual(["session-1"]);
  });

  it("submits session final lifecycle controls through daemon client methods", async () => {
    const client = renderApp("/sessions/session-1/final");

    await screen.findByText("Final lifecycle controls");
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Final candidate proposal JSON") as HTMLTextAreaElement).value
      ).toContain('"candidate-1"')
    );
    expect((screen.getByLabelText("Final audit JSON") as HTMLTextAreaElement).value).toContain(
      '"final-candidate-event-1"'
    );

    fireEvent.click(screen.getByRole("button", { name: "Propose final candidate" }));

    await waitFor(() =>
      expect(client.proposeFinalCandidate).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          authorId: "final-coordinator",
          candidateIds: ["candidate-1"],
          recommendation:
            "Record a provisional final candidate from accepted candidate material."
        })
      )
    );
    expect(await screen.findByText(/final_candidate_proposed/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Record final audit" }));

    await waitFor(() =>
      expect(client.auditFinalCandidate).toHaveBeenCalledWith(
        "session-1",
        "final-candidate-event-1",
        expect.objectContaining({
          authorId: "final-auditor",
          findings: ["The final candidate remains provisional."]
        })
      )
    );
    expect(await screen.findByText(/final_audit_recorded/)).toBeTruthy();
    expect(client.getRunOutcome).not.toHaveBeenCalled();
  });

  it("disables final lifecycle controls until required daemon projections are available", async () => {
    const client = createClient({
      getFrontier: vi.fn(async () => ({
        basis: "accepted_active_candidates",
        candidates: [],
        projection
      })),
      getSessionFinal: vi.fn(async () => ({
        sessionId: runDetail.sessionId,
        status: "compiled",
        draftStatus: "provisional",
        outcome: {
          recommendation: "",
          unresolvedQuestions: [],
          continuationSuggestions: [],
          limitations: [],
          provenance: {
            projectionBasis: "event_ledger_and_projections",
            projectionVersion: "1",
            eventRange: {
              fromSequence: 0,
              toSequence: 1
            },
            eventIds: ["event-1"],
            finalAuditEventIds: []
          }
        }
      }))
    });

    renderApp("/sessions/session-1/final", client);

    await screen.findByText("Final lifecycle controls");
    await screen.findByText("No accepted active candidates");
    expect(screen.getByText("No final proposal event selected")).toBeTruthy();

    const proposeButton = screen.getByRole("button", {
      name: "Propose final candidate"
    }) as HTMLButtonElement;
    const auditButton = screen.getByRole("button", {
      name: "Record final audit"
    }) as HTMLButtonElement;

    expect(proposeButton.disabled).toBe(true);
    expect(auditButton.disabled).toBe(true);
    fireEvent.click(proposeButton);
    fireEvent.click(auditButton);
    expect(client.proposeFinalCandidate).not.toHaveBeenCalled();
    expect(client.auditFinalCandidate).not.toHaveBeenCalled();
  });

  it("redacts daemon and generic errors on run pages", async () => {
    const client = createClient({
      getRun: vi.fn(async () => {
        throw new Error(
          "raw failure /Users/alice/private/run.json Bearer secret-token sk-secret123\n    at privateStack"
        );
      })
    });

    renderApp("/runs/run-1", client);

    expect(await screen.findByText("Daemon request failed")).toBeTruthy();
    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toContain("/Users/alice");
    expect(renderedText).not.toContain("Bearer secret-token");
    expect(renderedText).not.toContain("sk-secret123");
    expect(renderedText).not.toContain("privateStack");
  });

  it("renders session resources and evidence needs from the daemon endpoint", async () => {
    const client = renderApp("/sessions/session-1/resources");

    expect(await screen.findByText("Session resource projection")).toBeTruthy();
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Run-plan resources projected")).toBeTruthy();
    expect(screen.getByText("Registered resources")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByText("Delivery audits")).toBeTruthy();
    expect(screen.getByText("Resource delivery audits")).toBeTruthy();
    expect(screen.getByText("Access audits")).toBeTruthy();
    expect(screen.getByText("Resource access audits")).toBeTruthy();
    expect(screen.getAllByText(/delivery-audit-event-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/delivery-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/access-audit-event-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/resource-access-audit-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/resource-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/resource-missing/).length).toBeGreaterThan(0);
    expect(screen.getByText("Accepted evidence needs")).toBeTruthy();
    expect(screen.getAllByText(/evidence-need-1/).length).toBeGreaterThan(0);
    expect(screen.getByText("Resource projection JSON")).toBeTruthy();
    expect(client.getRunOutcome).not.toHaveBeenCalled();
    expect(
      Array.from(document.querySelectorAll(".du-nav-link.is-active")).map(
        (element) => element.textContent
      )
    ).toEqual(["Resources"]);
  });

  it("does not add hidden session persistence or forbidden semantic authority APIs", () => {
    const source = readWebSource();

    for (const forbiddenSnippet of [
      "localStorage",
      "sessionStorage",
      "currentSession",
      "@deliberum/core",
      "@deliberum/storage",
      "@deliberum/orchestrator",
      "@deliberum/adapters",
      "@deliberum/resources",
      "WebGET",
      "MCP",
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "CentralRanker",
      "winner",
      "currentBest",
      "ranking",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary",
      "best answer"
    ]) {
      expect(source).not.toContain(forbiddenSnippet);
    }
  });
});
