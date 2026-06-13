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

const notStartedRunDetail = {
  ...runDetail,
  sealedDivergenceStatus: undefined,
  latestExtractionStatus: undefined,
  latestProposalReviewStatus: undefined,
  latestFinalizationStatus: undefined,
  ledger: {
    eventCount: 1
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
              }
            ],
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
    getDeploymentPosture: vi.fn(async () => ({
      binding: {
        host: "127.0.0.1",
        port: 3877,
        exposure: "localhost",
        defaultLocalhost: true
      },
      controlPlane: {
        auth: "daemon_bearer",
        protected: true,
        tokenMode: "registry",
        principalCount: 3
      },
      cors: {
        originCount: 2,
        defaultLocalDevelopmentOrigins: true
      },
      persistence: {
        eventLedger: "configured_store",
        runMetadata: "configured_store",
        resourceBroker: "configured_store",
        resourceAccessGrants: "configured_store",
        operationAudit: "configured_store",
        productionMultiWriterCoordination: false,
        sqliteProcessLock: "configured"
      },
      resourceAccess: {
        baseUrlConfigured: true,
        baseUrlExposure: "localhost",
        grantStoreRestartContinuity: "depends_on_configured_store",
        urlSigningConfigured: true
      },
      webAssets: {
        configured: true,
        routeMode: "html_accept_spa_shell_json_api_split",
        shellCache: "no_store",
        assetCache: "immutable"
      },
      productionReadiness: {
        status: "local_only",
        readyForProduction: false,
        blockers: ["Production multi-user authorization is not implemented by the daemon."]
      },
      safety: ["No secrets, configured resource URLs, or provider endpoint values are returned."]
    })),
    getResourceAccessPosture: vi.fn(async () => ({
      baseUrl: {
        configured: true,
        exposure: "localhost",
        routePattern: "/resource-access/:accessId"
      },
      ttl: {
        configured: true,
        defaultTtlMs: 120000,
        maxTtlMs: 3600000
      },
      urlSigning: {
        configured: true,
        algorithm: "hmac-sha256",
        requiredForAccess: true
      },
      grantStore: {
        mode: "configured_store",
        restartContinuity: "depends_on_configured_store"
      },
      hostedContent: {
        supported: true,
        requiresExplicitPolicy: true,
        requiresSizeLimit: true,
        deliveryMaterial: "short_lived_access_url",
        sensitiveDefault: "none",
        brokerContentRestartContinuity: "depends_on_configured_store",
        grantRestartContinuity: "depends_on_configured_store"
      },
      productionHosting: {
        status: "not_production_hosting",
        publicUrlHosting: false,
        signedUrls: true,
        arbitraryFileServing: false,
        blockers: [
          "Production public resource hosting is not implemented.",
          "Daemon-signed resource access URLs do not replace object-storage or CDN signed URL services."
        ]
      },
      safety: [
        "It does not expose resource access ids, bearer tokens, source URLs, redirected targets, hosted content, or resource payloads."
      ]
    })),
    getOperationAudit: vi.fn(async () => ({
      events: [
        {
          id: "operation-audit-1",
          recordedAt: "2026-06-10T00:00:00.000Z",
          action: "runtime_resource_access_read",
          method: "GET",
          route: "/runtime/resource-access",
          statusCode: 200,
          outcome: "succeeded",
          authorization: {
            mode: "daemon_bearer",
            present: true,
            principalId: "observer-1",
            role: "observer",
            scopes: ["read"]
          },
          target: {
            sessionId: "session-1"
          }
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
        alternatives: [
          {
            id: "candidate-2",
            summary: "Use a narrower local-only rollout before provider-backed runs."
          }
        ],
        unresolvedObjections: [
          {
            id: "objection-1",
            summary: "The evidence fixture still needs broader external review.",
            status: "open"
          }
        ],
        qualityObligations: [
          {
            id: "obligation-1",
            requirement: "Keep open disagreements visible in the current conclusion.",
            status: "open"
          }
        ],
        evidenceStatus: {
          evidenceNeeds: [
            {
              id: "evidence-1",
              question: "Does the fixture cover all declared dimensions?",
              status: "unchecked"
            }
          ]
        },
        unresolvedQuestions: ["Which external reviewer should inspect the fixture?"],
        continuationSuggestions: ["Run the comparison fixture against a broader case set."],
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
      },
      executionPolicy: {
        automaticExecution: false,
        explicitExecutionRequired: true,
        supportedPrimitives: ["sealed_divergence", "final_contest"],
        notes: ["Accepted process proposals require explicit operator execution."]
      },
      executionReadiness: []
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
            status: "accepted_active"
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

async function ensureDetailsOpen(summaryText: string) {
  const summary = await screen.findByText(summaryText);
  const details = summary.closest("details") as HTMLDetailsElement | null;

  expect(details).not.toBeNull();

  if (details && !details.open) {
    fireEvent.click(summary);
  }

  await waitFor(() => expect(details?.open).toBe(true));
}

function getAdvancedModeSummary(index = 0) {
  const summary = screen.getAllByText("Advanced / Developer Mode")[index];
  expect(summary).toBeTruthy();

  return summary as HTMLElement;
}

async function findAdvancedModeSummary(index = 0) {
  const summaries = await screen.findAllByText("Advanced / Developer Mode");
  const summary = summaries[index];
  expect(summary).toBeTruthy();

  return summary as HTMLElement;
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

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(screen.getByText("What you can do")).toBeTruthy();
    expect(screen.getByText("What the discussion keeps visible")).toBeTruthy();
    expect(screen.getByText("Advanced / Developer Mode: concept mapping")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Topic Contract");
    fireEvent.click(screen.getByText("Advanced / Developer Mode: concept mapping"));
    expect(await screen.findByText("Core concept mapping")).toBeTruthy();
    expect(screen.getByText("Topic Contract")).toBeTruthy();
    expect(screen.getAllByText("1. Start a discussion").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "The current conclusion keeps open disagreements, risks, missing evidence, and recommended next actions together."
      )
    ).toBeTruthy();
    expect(client.getRuntimeProfiles).not.toHaveBeenCalled();
    expect(client.getDeploymentPosture).not.toHaveBeenCalled();
    expect(client.getResourceAccessPosture).not.toHaveBeenCalled();
    expect(client.getOperationAudit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/chat/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/message/i)).toBeNull();

    fireEvent.click(getAdvancedModeSummary());
    fireEvent.change(await screen.findByLabelText("Session id"), {
      target: {
        value: "session-1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect((await screen.findAllByText("Discussion brief")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
  });

  it("renders the daemon session catalog without owning session state", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Continue existing discussions")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled());
    expect(screen.getByText("Evaluate the local daemon run workspace")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Stage 11 shell");
    expect(screen.getByText("7 updates")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Open discussion" }));

    expect((await screen.findAllByText("Discussion brief")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
  });

  it("renders daemon runtime profile status without environment values", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(client.getRuntimeProfiles).not.toHaveBeenCalled();
    fireEvent.click(getAdvancedModeSummary());
    expect(await screen.findByText("Runtime profiles")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("Local preset")).toBeTruthy();
    expect(screen.getByText("OpenAI-compatible")).toBeTruthy();
    expect(screen.getByText("MCP tool")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Ready with run config")).toBeTruthy();
    expect(screen.getByText("Needs configuration")).toBeTruthy();
    expect(screen.getByText("Setup steps")).toBeTruthy();
    expect(screen.getByText("Required env vars")).toBeTruthy();
    expect(screen.getByText("Secret env names")).toBeTruthy();
    expect(screen.getByText("DELIBERUM_OPENAI_API_KEY")).toBeTruthy();
    expect(
      screen.getAllByText("DELIBERUM_OPENAI_BASE_URL, DELIBERUM_OPENAI_MODEL").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("DELIBERUM_MCP_TOOL_URL, DELIBERUM_MCP_TOOL_NAME").length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("sk-openai-runtime-secret")).toBeNull();
  });

  it("renders safe daemon deployment posture without configured URLs or tokens", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(client.getDeploymentPosture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Advanced / Developer Mode"));
    expect(await screen.findByText("Deployment posture")).toBeTruthy();
    await waitFor(() => expect(client.getDeploymentPosture).toHaveBeenCalled());
    expect(screen.getByText("Bind exposure")).toBeTruthy();
    expect(screen.getByText("Localhost")).toBeTruthy();
    expect(screen.getByText("Control auth")).toBeTruthy();
    expect(screen.getByText("Daemon bearer / registry / 3 principals")).toBeTruthy();
    expect(screen.getByText("Configured stores")).toBeTruthy();
    expect(screen.getByText("5/5, process lock")).toBeTruthy();
    expect(screen.getByText("Resource access")).toBeTruthy();
    expect(screen.getByText("Localhost, restart-aware, signed")).toBeTruthy();
    expect(screen.getByText("Web assets")).toBeTruthy();
    expect(screen.getByText("HTML shell split")).toBeTruthy();
    expect(screen.getByText("Production ready")).toBeTruthy();
    expect(screen.getAllByText("No").length).toBeGreaterThan(0);
    expect(screen.getByText("Local-only posture")).toBeTruthy();
    expect(
      screen.getByText("Production multi-user authorization is not implemented by the daemon.")
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain(
      ["local-daemon-auth", "token"].join("-")
    );
    expect(document.body.textContent ?? "").not.toContain("https://resource.example");
  });

  it("renders safe daemon resource access posture without access material", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(client.getResourceAccessPosture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Advanced / Developer Mode"));
    expect(await screen.findByText("Resource access posture")).toBeTruthy();
    await waitFor(() => expect(client.getResourceAccessPosture).toHaveBeenCalled());
    expect(screen.getByText("Base URL posture")).toBeTruthy();
    expect(screen.getByText("Localhost, configured")).toBeTruthy();
    expect(screen.getByText("Route pattern")).toBeTruthy();
    expect(screen.getByText("/resource-access/:accessId")).toBeTruthy();
    expect(screen.getByText("TTL")).toBeTruthy();
    expect(screen.getByText("120000 ms / max 3600000 ms")).toBeTruthy();
    expect(screen.getByText("URL signing")).toBeTruthy();
    expect(screen.getByText("hmac-sha256, required")).toBeTruthy();
    expect(screen.getByText("Grant store")).toBeTruthy();
    expect(screen.getByText("Configured store, restart-aware")).toBeTruthy();
    expect(screen.getByText("Hosted content")).toBeTruthy();
    expect(
      screen.getByText(
        "Explicit policy, size-limited, broker restart-aware, grants restart-aware"
      )
    ).toBeTruthy();
    expect(screen.getByText("Sensitive default")).toBeTruthy();
    expect(screen.getByText("Short-lived access URL")).toBeTruthy();
    expect(screen.getAllByText("Not production hosting").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Production public resource hosting is not implemented. Daemon-signed resource access URLs do not replace object-storage or CDN signed URL services."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain(
      ["https://resource", "example"].join(".")
    );
    expect(document.body.textContent ?? "").not.toContain("resource-access-audit-1");
    expect(document.body.textContent ?? "").not.toContain("ZZZZ");
    expect(document.body.textContent ?? "").not.toContain("resource-access-url-signing-key");
  });

  it("renders safe daemon operation audit metadata without request material", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(client.getOperationAudit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Advanced / Developer Mode"));
    expect(await screen.findByText("Operation audit")).toBeTruthy();
    await waitFor(() =>
      expect(client.getOperationAudit).toHaveBeenCalledWith({ limit: 10 })
    );
    expect(screen.getByText("runtime_resource_access_read")).toBeTruthy();
    expect(screen.getByText("GET /runtime/resource-access")).toBeTruthy();
    expect(screen.getByText("200 succeeded")).toBeTruthy();
    expect(
      screen.getByText("daemon_bearer, present, observer-1 (observer), scopes read")
    ).toBeTruthy();
    expect(screen.getByText("session: session-1")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain(
      ["local-daemon-auth", "token"].join("-")
    );
    expect(document.body.textContent ?? "").not.toContain("headers");
    expect(document.body.textContent ?? "").not.toContain("requestBody");
  });

  it("renders the session overview from daemon ledger events", async () => {
    const client = renderApp("/sessions/session-1");

    expect((await screen.findAllByText("Discussion brief")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Current activity")).toBeTruthy();
    expect(screen.getByText("Discussion brief published")).toBeTruthy();
    expect(screen.getByText("Review this discussion")).toBeTruthy();
    expect(screen.getByText("1 visible perspective")).toBeTruthy();
    expect(screen.getByText("1 open disagreement")).toBeTruthy();
    expect(screen.getByText("1 requirement")).toBeTruthy();
    expect(screen.getByText("1 missing evidence item")).toBeTruthy();
    expect(screen.getByText("Next recommended actions")).toBeTruthy();
    expect(screen.getByText("Check missing evidence")).toBeTruthy();
    expect(screen.getByText("Review open disagreements")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View current conclusion" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View main perspectives" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review risks and evidence" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("topic_contract_published");
    fireEvent.click(screen.getByText("Advanced / Developer Mode"));
    expect(await screen.findByText("topic_contract_published")).toBeTruthy();
  });

  it("keeps empty session user-mode pages in reader-facing language", async () => {
    const emptyClient = createClient({
      listEvents: vi.fn(async () => ({
        events: []
      })),
      getFrontier: vi.fn(async () => ({
        basis: "accepted_active_candidates",
        candidates: [],
        projection
      })),
      getObjections: vi.fn(async () => ({
        objections: [],
        projection
      })),
      getObligations: vi.fn(async () => ({
        qualityObligations: [],
        projection
      })),
      getSessionResources: vi.fn(async () => ({
        sessionId: "session-1",
        plannedResources: [],
        deliveryAudits: [],
        accessAudits: [],
        evidenceNeeds: [],
        projection
      }))
    });

    renderApp("/sessions/session-1", emptyClient);

    expect(await screen.findByText("No discussion brief available yet")).toBeTruthy();
    expect(screen.getByText("0 updates in this discussion so far.")).toBeTruthy();
    expect(screen.getByText("No visible step available yet")).toBeTruthy();

    cleanup();

    const obligationsClient = createClient({
      getObligations: vi.fn(async () => ({
        qualityObligations: [],
        projection
      }))
    });

    renderApp("/sessions/session-1/obligations", obligationsClient);

    expect(await screen.findByText("No requirements listed")).toBeTruthy();

    cleanup();

    const resourcesClient = createClient({
      getSessionResources: vi.fn(async () => ({
        sessionId: "session-1",
        plannedResources: [],
        deliveryAudits: [],
        accessAudits: [],
        evidenceNeeds: [],
        projection
      }))
    });

    renderApp("/sessions/session-1/resources", resourcesClient);

    expect(await screen.findByText("No evidence gaps visible")).toBeTruthy();
  });

  it("renders Candidate Frontier as a basis plus candidate list", async () => {
    const client = renderApp("/sessions/session-1/frontier");

    expect((await screen.findAllByText("Main perspectives")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Candidate A")).toBeTruthy();
    expect(screen.getByText("Current state: Visible in this discussion")).toBeTruthy();

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toContain("accepted_active_candidates");
    expect(renderedText).not.toContain("candidate-1");
    for (const forbiddenField of ["currentBest", "winner", "rank", "score", "vote"]) {
      expect(renderedText).not.toContain(forbiddenField);
    }

    fireEvent.click(screen.getByText("Advanced / Developer Mode: source details"));
    expect((await screen.findAllByText(/candidate-1/)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Advanced / Developer Mode"));
    expect(await screen.findByText(/accepted_active_candidates/)).toBeTruthy();
  });

  it("renders objections and quality obligations from daemon projections", async () => {
    const client = renderApp("/sessions/session-1/objections");

    expect((await screen.findAllByText("Open disagreements")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    expect(document.body.textContent ?? "").not.toContain("objection-1");
    expect(
      screen.getByText(
        "This disagreement is tracked, but it does not have a plain-language summary yet."
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Advanced / Developer Mode: source details"));
    expect((await screen.findAllByText(/objection-1/)).length).toBeGreaterThan(0);

    cleanup();

    const nextClient = renderApp("/sessions/session-1/obligations");
    expect((await screen.findAllByText("Requirements this answer must satisfy")).length).toBeGreaterThan(0);
    await waitFor(() => expect(nextClient.getObligations).toHaveBeenCalledWith("session-1"));
    expect(document.body.textContent ?? "").not.toContain("quality-1");
    expect(screen.getAllByText(/Unanswered/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "This requirement is tracked, but it does not have a plain-language summary yet."
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Advanced / Developer Mode: source details"));
    expect((await screen.findAllByText(/quality-1/)).length).toBeGreaterThan(0);
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

    expect((await screen.findAllByText("Ledger events")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/sealed_contribution_submitted/)).toBeTruthy();
    expect(screen.getByText(/legitimate user payload field/)).toBeTruthy();
  });

  it("lists deliberation runs", async () => {
    const client = renderApp("/runs");

    expect((await screen.findAllByText("Discussions")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    expect(screen.getByText("How discussions work")).toBeTruthy();
    expect(
      screen.getByText(
        "The topic, goals, constraints, participants, and output expectations before anyone contributes."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Independent first responses").length).toBeGreaterThan(0);
    expect(screen.getByText("Option quality")).toBeTruthy();
    expect(screen.getByText("Requirements this answer must satisfy")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Option repair");
    expect(document.body.textContent ?? "").not.toContain("Requirements review");
    expect(screen.getByText("Advanced / Developer Mode")).toBeTruthy();
    expect(screen.getByText("Evaluate the local daemon run workspace")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Run Alpha");
    expect(document.body.textContent ?? "").not.toContain("run-1");
    fireEvent.click(screen.getByText("Advanced / Developer Mode"));
    expect(await screen.findByText("run-1")).toBeTruthy();
    expect(screen.getByText("Ready to review: current conclusion is available.")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain(
      "Created: discussion exists, deliberation steps have not started."
    );
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("renders the empty discussion list without runtime setup language", async () => {
    const client = createClient({
      listRuns: vi.fn(async () => ({
        runs: []
      }))
    });

    renderApp("/runs", client);

    expect(await screen.findByText("No discussions yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Start with a question. Deliberum will create a discussion brief, collect independent first responses, and keep the conclusion, disagreements, risks, and next steps visible."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Advanced JSON");
    expect(document.body.textContent ?? "").not.toContain("runtime");
  });

  it("creates a run from a JSON run plan object", async () => {
    const client = renderApp("/runs/new");
    const runPlan = {
      topic: "New local run",
      goals: ["Inspect"],
      constraints: ["Keep provisional"]
    };

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(screen.getByText("Start from a question")).toBeTruthy();
    expect(screen.getByText("Complete discussion loop")).toBeTruthy();
    expect(screen.getByText("Works without setup")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("provider credentials");
    expect(document.body.textContent ?? "").not.toContain("external models");
    fireEvent.click(getAdvancedModeSummary());
    fireEvent.change(await screen.findByLabelText("Advanced JSON run plan"), {
      target: {
        value: JSON.stringify(runPlan)
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    await waitFor(() => expect(client.createRun).toHaveBeenCalledWith({ runPlan }));
    expect(await screen.findByText("Discussion created")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue the guided discussion to collect perspectives, surface disagreements, and produce a reviewable conclusion."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("internal run id");
    expect(screen.getByRole("link", { name: "Continue guided discussion" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review discussion brief" })).toBeTruthy();
  });

  it("creates a guided discussion from a plain-language brief", async () => {
    const client = renderApp("/runs/new");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Discussion question"), {
      target: {
        value: "Should we adopt a staged provider rollout?"
      }
    });
    fireEvent.change(screen.getByLabelText("Goals"), {
      target: {
        value: "Compare staged rollout\nSurface migration risk"
      }
    });
    fireEvent.change(screen.getByLabelText("Constraints"), {
      target: {
        value: "Keep the recommendation reversible"
      }
    });
    fireEvent.change(screen.getByLabelText("Expected conclusion"), {
      target: {
        value: "Summarize the conclusion, disagreements, risks, and next steps."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create discussion" }));

    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith({
        runPlan: expect.objectContaining({
          title: "Discussion: Should we adopt a staged provider rollout?",
          topic: "Should we adopt a staged provider rollout?",
          goals: ["Compare staged rollout", "Surface migration risk"],
          constraints: expect.arrayContaining([
            "Keep the recommendation reversible",
            "Use deterministic local preset components only.",
            "Keep all output provisional until reviewed."
          ]),
          participants: expect.arrayContaining([
            expect.objectContaining({
              adapterId: "local-preset-alpha"
            })
          ]),
          output: expect.objectContaining({
            language: "en",
            style: "clear",
            expectations: [
              "Summarize the conclusion, disagreements, risks, and next steps."
            ]
          })
        })
      })
    );
    expect(await screen.findByText("Discussion created")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue the guided discussion to collect perspectives, surface disagreements, and produce a reviewable conclusion."
      )
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue guided discussion" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review discussion brief" })).toBeTruthy();
  });

  it("fills the sample brief with user-facing discussion text", async () => {
    const client = renderApp("/runs/new");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Use sample brief" }));

    expect((screen.getByLabelText("Discussion question") as HTMLTextAreaElement).value).toBe(
      "How should we review a proposed rollout before relying on it?"
    );
    expect((screen.getByLabelText("Goals") as HTMLTextAreaElement).value).toContain(
      "Compare the strongest current options."
    );
    expect((screen.getByLabelText("Goals") as HTMLTextAreaElement).value).not.toContain(
      "daemon run API"
    );
    expect((screen.getByLabelText("Goals") as HTMLTextAreaElement).value).not.toContain(
      "Candidate Frontier"
    );

    fireEvent.click(screen.getByRole("button", { name: "Create discussion" }));

    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith({
        runPlan: expect.not.objectContaining({
          topic: "Exercise the local Deliberum run workspace with deterministic preset components."
        })
      })
    );
    await waitFor(() =>
      expect(JSON.stringify(vi.mocked(client.createRun).mock.calls[0]?.[0])).not.toContain(
        "daemon run API"
      )
    );
  });

  it("rejects invalid run plan JSON without calling the daemon", async () => {
    const client = renderApp("/runs/new");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    fireEvent.click(getAdvancedModeSummary());
    const runPlanInput = await screen.findByLabelText("Advanced JSON run plan");
    fireEvent.change(runPlanInput, {
      target: {
        value: "{"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    expect(await screen.findByText("Run plan must be valid JSON.")).toBeTruthy();
    expect(client.createRun).not.toHaveBeenCalled();

    fireEvent.change(runPlanInput, {
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

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    fireEvent.click(getAdvancedModeSummary());
    const runPlanInput = await screen.findByLabelText("Advanced JSON run plan");
    fireEvent.change(runPlanInput, {
      target: {
        value: "{}"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fill local preset run plan" }));

    expect(
      (runPlanInput as HTMLTextAreaElement).value
    ).toContain("local-preset-alpha");

    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith({
        runPlan: expect.objectContaining({
          title: "Guided sample discussion",
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

  it("renders run detail, stage status, and discussion detail panels without raw event loading", async () => {
    const client = renderApp("/runs/run-1");

    await screen.findByText("Evaluate the local daemon run workspace");
    expect(document.body.textContent ?? "").not.toContain("Run Alpha");
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    expect(client.getRunEvents).not.toHaveBeenCalled();
    expect(client.getRunProcessProposals).not.toHaveBeenCalled();
    expect(client.getProcessProposalStates).not.toHaveBeenCalled();

    expect(screen.getAllByText("Discussion status").length).toBeGreaterThan(0);
    expect(screen.getByText("Discussion is ready to review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run guided discussion again" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("7 recorded lifecycle events");
    fireEvent.click(getAdvancedModeSummary());
    expect(await screen.findByText("Ledger events")).toBeTruthy();
    expect(screen.getByText("7 recorded lifecycle events")).toBeTruthy();
    expect(screen.getByText("Discussion dashboard")).toBeTruthy();
    expect(screen.getByText("Next: review current conclusion")).toBeTruthy();
    expect(screen.getAllByText("Current conclusion").length).toBeGreaterThan(0);
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Evidence gaps")).toBeTruthy();
    expect(screen.getAllByText("1/1").length).toBeGreaterThan(0);
    expect(screen.getByText("Next recommended actions")).toBeTruthy();
    expect(screen.getByText("Open conclusion")).toBeTruthy();
    expect(screen.getByText("Review evidence")).toBeTruthy();
    expect(screen.getByText("View disagreements")).toBeTruthy();
    expect(screen.getByText("View requirements")).toBeTruthy();
    expect(screen.getAllByText("Open disagreements").length).toBeGreaterThan(0);
    expect(screen.getByText("Strong options stay visible without collapsing into one hidden authority.")).toBeTruthy();
    expect(screen.getByText("What this discussion status means")).toBeTruthy();
    expect(screen.getByText("Discussion progress")).toBeTruthy();
    expect(screen.getByText("Risks and missing evidence")).toBeTruthy();
    expect(screen.getByText("Evidence gap 1")).toBeTruthy();
    const defaultRunText = document.body.textContent ?? "";
    expect(defaultRunText).not.toContain("objection-1");
    expect(defaultRunText).not.toContain("quality-1");
    expect(defaultRunText).not.toContain("evidence-need-1");
    const nextStepControls = getAdvancedModeSummary(2).closest("details");
    expect((nextStepControls as HTMLDetailsElement | null)?.open).toBe(false);
    fireEvent.click(getAdvancedModeSummary(2));
    await waitFor(() => expect(client.getRunProcessProposals).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getProcessProposalStates).toHaveBeenCalledWith("session-1"));
    expect((await screen.findAllByText("Next recommended actions")).length).toBeGreaterThan(1);
    expect(screen.getByText("Prepare current conclusion")).toBeTruthy();
    expect(screen.getByText("Strong current options are ready to become a reviewable current conclusion.")).toBeTruthy();
    expect(screen.getByText("Recommended actions")).toBeTruthy();
    expect(screen.getByText("Why now")).toBeTruthy();
    expect(screen.getByText("Process governance ledger")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save next step" })).toBeTruthy();
    expect(screen.getByText("No saved next steps")).toBeTruthy();
    fireEvent.click(getAdvancedModeSummary(3));
    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText("Run ledger timeline")).toBeTruthy();
    expect(screen.getByText("Event entries")).toBeTruthy();
    expect(screen.getByText(/topic_contract_published/)).toBeTruthy();
    expect(screen.getByText(/sealed_until_reveal/)).toBeTruthy();
    expect(screen.getAllByText("Main perspectives").length).toBeGreaterThan(0);
    expect(screen.getByText("Candidate A")).toBeTruthy();
    expect(screen.getAllByText("Open disagreements").length).toBeGreaterThan(0);
    for (const sourceDetails of screen.getAllByText("Advanced / Developer Mode: source details")) {
      fireEvent.click(sourceDetails);
    }
    expect((await screen.findAllByText(/objection-1/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Requirements this answer must satisfy").length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/quality-1/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Projection events").length).toBeGreaterThan(0);
    expect(client.listEvents).not.toHaveBeenCalled();
    expect(screen.getByText("Current state: Visible in this discussion")).toBeTruthy();
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

    fireEvent.click(await findAdvancedModeSummary(2));
    await screen.findByText("Next recommended actions");
    fireEvent.click(await screen.findByRole("button", { name: "Save next step" }));

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
    expect(await screen.findByText("Next step saved")).toBeTruthy();
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

    fireEvent.click(await findAdvancedModeSummary(2));
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

    fireEvent.click(await findAdvancedModeSummary(2));
    await screen.findByText("Recorded process proposal");
    fireEvent.click(screen.getByRole("button", { name: "Execute accepted process proposal" }));

    await waitFor(() =>
      expect(executeRunProcessProposal).toHaveBeenCalledWith(
        "run-1",
        "process-proposal-event-1"
      )
    );
    expect(await screen.findByText("Discussion steps completed")).toBeTruthy();
    expect(screen.getByText("Updated discussion steps")).toBeTruthy();
    expect(client.startRun).not.toHaveBeenCalled();
  });

  it("uses daemon process proposal readiness to block unsupported execution", async () => {
    const executeRunProcessProposal = vi.fn();
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRunProcessProposals: vi.fn(async () => ({
          runId: "run-1",
          sessionId: "session-1",
          proposals: [],
          observations: [],
          metadata: {
            version: "1",
            eventRange: {
              fromSequence: 0,
              toSequence: 3
            },
            eventIds: ["event-1"]
          },
          executionPolicy: {
            automaticExecution: false,
            explicitExecutionRequired: true,
            supportedPrimitives: ["sealed_divergence"],
            notes: ["Accepted process proposals require explicit operator execution."]
          },
          executionReadiness: [
            {
              proposalEventId: "process-proposal-event-1",
              proposalId: "process-proposal-1",
              primitive: "blind_reframe",
              latestStatus: "accepted",
              executable: false,
              status: "unsupported_primitive",
              reason: "Process proposal primitive is not executable by the daemon yet."
            }
          ]
        })),
        getProcessProposalStates: vi.fn(async () => ({
          proposalStates: [
            {
              proposalEventId: "process-proposal-event-1",
              proposalId: "process-proposal-1",
              latestStatus: "accepted",
              proposal: {
                id: "process-proposal-1",
                primitive: "blind_reframe",
                status: "proposed",
                targetIds: ["event-1"]
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

    fireEvent.click(await findAdvancedModeSummary(2));
    await screen.findByText("Recorded process proposal");
    expect(screen.getByText("unsupported_primitive")).toBeTruthy();
    expect(screen.getByText("Process proposal primitive is not executable by the daemon yet.")).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "Execute accepted process proposal"
      }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(executeRunProcessProposal).not.toHaveBeenCalled();
    expect(client.startRun).not.toHaveBeenCalled();
  });

  it("follows daemon-redacted run events only after the user starts live follow", async () => {
    const EventSourceMock = installMockEventSource();
    const client = renderApp("/runs/run-1");

    fireEvent.click(await findAdvancedModeSummary(3));
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

    expect(await screen.findByText("Created: discussion exists, deliberation steps have not started.")).toBeTruthy();
    fireEvent.click(getAdvancedModeSummary());
    expect(await screen.findByText("1 recorded lifecycle event")).toBeTruthy();
    expect(screen.getAllByText("Not run yet").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("No work has been recorded for that part of the discussion.")).toBeTruthy();
  });

  it("starts a run from a JSON start request and renders readable step metadata", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: notStartedRunDetail
        }))
      })
    );
    const startRequest = {
      extraction: {
        generatorIds: ["generator-1"]
      }
    };

    await screen.findByText("Continue discussion");
    fireEvent.click(getAdvancedModeSummary(1));
    fireEvent.change(await screen.findByLabelText("Advanced start request JSON"), {
      target: {
        value: JSON.stringify(startRequest)
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledWith("run-1", startRequest));
    expect(await screen.findByText("Discussion steps completed")).toBeTruthy();
    expect(screen.getByText("Updated discussion steps")).toBeTruthy();
    expect(screen.getAllByText("Independent first responses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("View current conclusion").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Advanced / Developer Mode").length).toBeGreaterThanOrEqual(3);
    expect(document.body.textContent ?? "").not.toContain("event-2");
    fireEvent.click(getAdvancedModeSummary(2));
    expect(await screen.findByText("Raw stage metadata")).toBeTruthy();
    expect(screen.getByText(/sealed_divergence/)).toBeTruthy();
    expect(screen.getByText(/event-2/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("do not render this result payload");
  });

  it("fills and starts the full local preset pipeline through the client", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: notStartedRunDetail
        }))
      })
    );

    await screen.findByText("Continue discussion");
    fireEvent.click(getAdvancedModeSummary(1));
    const startRequestInput = await screen.findByLabelText("Advanced start request JSON");
    fireEvent.change(startRequestInput, {
      target: {
        value: "{}"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fill local preset start request" }));

    expect(
      (startRequestInput as HTMLTextAreaElement).value
    ).toContain("local-preset-extractor");

    fireEvent.click(screen.getByRole("button", { name: "Continue guided discussion" }));

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
    expect(await screen.findByText("Discussion steps completed")).toBeTruthy();
    expect(screen.getByText("Updated discussion steps")).toBeTruthy();
    expect(screen.getAllByText("Independent first responses").length).toBeGreaterThan(0);
  });

  it("refreshes discussion detail panels after a successful start without page reload", async () => {
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
        getRun: vi.fn(async () => ({
          run: notStartedRunDetail
        })),
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

    await screen.findByText("No main perspectives");
    expect(screen.queryByText("Projection refreshed after start")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue guided discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(await screen.findByText("Discussion steps completed")).toBeTruthy();
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
        }),
        getRun: vi.fn(async () => ({
          run: notStartedRunDetail
        }))
      })
    );

    await screen.findByText("Continue discussion");
    fireEvent.click(screen.getByRole("button", { name: "Continue guided discussion" }));

    expect(await screen.findByText("Discussion could not continue")).toBeTruthy();
    expect(
      screen.getAllByText(
        "This discussion cannot continue because the required setup is unavailable. Open Advanced mode to inspect setup details before retrying."
      ).length
    ).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_ENABLE_LOCAL_PRESET");
    expect(document.body.textContent ?? "").not.toContain("stack");
  });

  it("renders compiled run output as a provisional outcome", async () => {
    const client = renderApp("/runs/run-1/outcome");

    expect((await screen.findAllByText("Current conclusion")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRunOutcome).toHaveBeenCalledWith("run-1"));
    expect(screen.getByText("Current conclusion remains provisional")).toBeTruthy();
    expect(screen.getAllByText(/provisional/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current conclusion").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Current conclusion snapshot" })).toBeTruthy();
    expect(screen.getAllByText("Open disagreements").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing evidence").length).toBeGreaterThan(0);
    expect(screen.getByText("Does the fixture cover all declared dimensions?")).toBeTruthy();
    expect(screen.getByText("Keep open disagreements visible in the current conclusion.")).toBeTruthy();
    expect(screen.getAllByText("Risks and boundaries").length).toBeGreaterThan(0);
    expect(screen.getByText("Requirements this answer must satisfy")).toBeTruthy();
    expect(screen.getAllByText(/Provisional compiled material/).length).toBeGreaterThan(0);
    const defaultPageText = document.body.textContent ?? "";
    expect(defaultPageText).not.toContain("Draft status");
    expect(defaultPageText).not.toContain("Raw outcome material");
    expect(defaultPageText).not.toContain("candidate-2");
    expect(defaultPageText).not.toContain("objection-1");
    expect(defaultPageText).not.toContain("obligation-1");
    expect(defaultPageText).not.toContain("evidence-1");

    fireEvent.click(screen.getByText("Advanced / Developer Mode"));
    expect(await screen.findByText("Draft status")).toBeTruthy();
    expect(screen.getByText("Raw outcome material")).toBeTruthy();

    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).not.toContain("candidate-2");
    expect(readableConclusion).not.toContain("objection-1");
    expect(readableConclusion).not.toContain("obligation-1");
    expect(readableConclusion).not.toContain("evidence-1");
    expect(readableConclusion).not.toContain("returned");
  });

  it("fills missing run conclusion sections from discussion context", async () => {
    const client = createClient({
      getRunOutcome: vi.fn(async () => ({
        runId: runDetail.runId,
        sessionId: runDetail.sessionId,
        status: "compiled",
        draftStatus: "provisional",
        outcome: {
          recommendation: "Use the current discussion state as reviewable material.",
          unresolvedQuestions: [],
          continuationSuggestions: [],
          limitations: []
        }
      }))
    });

    renderApp("/runs/run-1/outcome", client);

    expect((await screen.findAllByText("Current conclusion")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRunOutcome).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));

    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).toContain("Candidate A");
    expect(readableConclusion).toContain("1 visible perspective listed");
    expect(readableConclusion).toContain("Open disagreement 1");
    expect(readableConclusion).toContain(
      "This disagreement is tracked, but it does not have a plain-language summary yet."
    );
    expect(readableConclusion).toContain("Requirement 1");
    expect(readableConclusion).toContain("Missing evidence 1");
    expect(readableConclusion).toContain("No unresolved questions listed");
    expect(readableConclusion).toContain("No risks or boundaries listed");
    expect(readableConclusion).toContain("No next recommended actions listed");
    expect(readableConclusion).not.toContain("candidate-1");
    expect(readableConclusion).not.toContain("objection-1");
    expect(readableConclusion).not.toContain("quality-1");
    expect(readableConclusion).not.toContain("evidence-need-1");
    expect(readableConclusion).not.toContain("returned");
    expect(readableConclusion).not.toContain("Advanced outcome material");
  });

  it("compiles run output for a selected proposal event", async () => {
    const client = renderApp("/runs/run-1/outcome");
    const getRunOutcome = vi.mocked(client.getRunOutcome);

    expect((await screen.findAllByText("Current conclusion")).length).toBeGreaterThan(0);
    await waitFor(() => expect(getRunOutcome).toHaveBeenCalledWith("run-1"));

    await ensureDetailsOpen("Advanced / Developer Mode");
    fireEvent.change(await screen.findByLabelText("Candidate proposal event override"), {
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
    await ensureDetailsOpen("Advanced / Developer Mode");
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

    expect(await screen.findByText("Current conclusion not available")).toBeTruthy();
    expect(
      screen.getByText(
        "The discussion has not produced conclusion-ready material yet. Continue the guided discussion before opening the current conclusion."
      )
    ).toBeTruthy();
    expect(screen.getByText("Advanced / Developer Mode")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain(
      "final_candidate_proposal_unavailable"
    );
    fireEvent.click(getAdvancedModeSummary());
    expect(await screen.findByText("Raw reason")).toBeTruthy();
    expect(screen.getByText("final_candidate_proposal_unavailable")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain(
      "No final candidate proposal exists yet"
    );
  });

  it("renders session final projection from the daemon endpoint", async () => {
    const client = renderApp("/sessions/session-1/final");

    expect((await screen.findAllByText("Current conclusion")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getSessionFinal).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Current conclusion remains provisional")).toBeTruthy();
    expect(screen.getAllByText(/Use the daemon-backed final projection/).length).toBeGreaterThan(0);
    expect(screen.getByText("Unresolved questions")).toBeTruthy();
    expect(screen.getAllByText(/Evidence coverage remains incomplete/).length).toBeGreaterThan(0);
    const defaultPageText = document.body.textContent ?? "";
    expect(defaultPageText).not.toContain("Candidate proposal event");
    expect(defaultPageText).not.toContain("final-candidate-event-1");
    expect(defaultPageText).not.toContain("Provenance");

    await ensureDetailsOpen("Advanced / Developer Mode");
    expect(await screen.findByText("Candidate proposal event")).toBeTruthy();
    expect(screen.getAllByText(/final-candidate-event-1/).length).toBeGreaterThan(0);
    expect(screen.getByText("Provenance")).toBeTruthy();
    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).toContain("Candidate A");
    expect(readableConclusion).toContain("1 visible perspective listed");
    expect(readableConclusion).not.toContain("candidate-1");
    expect(readableConclusion).not.toContain("returned");
    expect(client.getRunOutcome).not.toHaveBeenCalled();
    expect(
      Array.from(document.querySelectorAll(".du-nav-link.is-active")).map(
        (element) => element.textContent
      )
    ).toEqual(["Current conclusion"]);
  });

  it("compiles session final projection for a selected proposal event", async () => {
    const client = renderApp("/sessions/session-1/final");
    const getSessionFinal = vi.mocked(client.getSessionFinal);

    expect((await screen.findAllByText("Current conclusion")).length).toBeGreaterThan(0);
    await waitFor(() => expect(getSessionFinal).toHaveBeenCalledWith("session-1"));

    await ensureDetailsOpen("Advanced / Developer Mode");
    fireEvent.change(await screen.findByLabelText("Candidate proposal event override"), {
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
    await ensureDetailsOpen("Advanced / Developer Mode");
    expect(await screen.findByText("Specific final proposal selected")).toBeTruthy();
    expect(screen.getByText("final-candidate-event-2")).toBeTruthy();

    const callCountBeforeClear = getSessionFinal.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Use latest proposal" }));

    await waitFor(() => expect(getSessionFinal.mock.calls.length).toBeGreaterThan(callCountBeforeClear));
    expect(getSessionFinal.mock.calls.at(-1)).toEqual(["session-1"]);
  });

  it("submits session final lifecycle controls through daemon client methods", async () => {
    const client = renderApp("/sessions/session-1/final");

    expect((await screen.findAllByText("Current conclusion")).length).toBeGreaterThan(0);
    await screen.findByText("Current conclusion remains provisional");
    await ensureDetailsOpen("Advanced / Developer Mode");
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

    expect((await screen.findAllByText("Current conclusion")).length).toBeGreaterThan(0);
    await screen.findByText("Current conclusion remains provisional");
    await ensureDetailsOpen("Advanced / Developer Mode");
    await screen.findByText("Final lifecycle controls");
    await screen.findByText("No main perspectives ready");
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

    expect(await screen.findByText("Could not load discussion data")).toBeTruthy();
    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toContain("/Users/alice");
    expect(renderedText).not.toContain("Bearer secret-token");
    expect(renderedText).not.toContain("sk-secret123");
    expect(renderedText).not.toContain("privateStack");
  });

  it("keeps default service errors user facing", async () => {
    const client = createClient({
      getRun: vi.fn(async () => {
        throw new Error("Daemon is unavailable.");
      })
    });

    renderApp("/runs/run-1", client);

    expect(await screen.findByText("Could not load discussion data")).toBeTruthy();
    expect(screen.getByText("The discussion service is unavailable.")).toBeTruthy();
    expect(screen.queryByText("Daemon is unavailable.")).toBeNull();
  });

  it("renders session resources and evidence needs from the daemon endpoint", async () => {
    const client = renderApp("/sessions/session-1/resources");

    expect(await screen.findByText("Evidence and verification")).toBeTruthy();
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Evidence gaps visible")).toBeTruthy();
    expect(screen.getByText("Risks and missing evidence")).toBeTruthy();
    expect(
      screen.getByText(
        "This evidence need is tracked, but it does not have a plain-language summary yet."
      )
    ).toBeTruthy();
    const defaultPageText = document.body.textContent ?? "";
    expect(defaultPageText).not.toContain("Registered resources");
    expect(defaultPageText).not.toContain("delivery-audit-event-1");
    expect(defaultPageText).not.toContain("delivery-1");
    expect(defaultPageText).not.toContain("access-audit-event-1");
    expect(defaultPageText).not.toContain("resource-access-audit-1");
    expect(defaultPageText).not.toContain("resource-1");
    expect(defaultPageText).not.toContain("resource-missing");
    expect(defaultPageText).not.toContain("evidence-need-1");

    fireEvent.click(screen.getByText("Advanced / Developer Mode: source details"));
    expect((await screen.findAllByText(/evidence-need-1/)).length).toBeGreaterThan(0);
    await ensureDetailsOpen("Advanced / Developer Mode");
    expect(await screen.findByText("Registered resources")).toBeTruthy();
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
    expect(screen.getByText("Resource projection JSON")).toBeTruthy();
    expect(client.getRunOutcome).not.toHaveBeenCalled();
    expect(
      Array.from(document.querySelectorAll(".du-nav-link.is-active")).map(
        (element) => element.textContent
      )
    ).toEqual(["Risks and evidence"]);
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
