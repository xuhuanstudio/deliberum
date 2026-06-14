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
import { WEB_LANGUAGE_STORAGE_KEY, type WebLanguage } from "../src/i18n";

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

const localPresetNotStartedRunDetail = {
  ...notStartedRunDetail,
  plan: {
    ...runDetail.plan,
    participants: [
      {
        id: "local-preset-alpha",
        kind: "model",
        displayName: "Perspective A",
        adapterId: "local-preset-alpha"
      },
      {
        id: "local-preset-beta",
        kind: "model",
        displayName: "Perspective B",
        adapterId: "local-preset-beta"
      }
    ],
    providerConfigs: []
  }
};

const providerBackedRunDetail = {
  ...notStartedRunDetail,
  title: "Discussion: Should we use a configured provider?",
  topic: "Should we use a configured provider?",
  plan: {
    topic: "Should we use a configured provider?",
    goals: ["Compare provider-backed perspectives"],
    constraints: [
      "Use configured model-backed participants from the local daemon.",
      "Keep provider credentials in the local daemon environment only."
    ],
    participants: [
      {
        id: "provider-perspective-a",
        kind: "model",
        displayName: "Perspective A",
        adapterId: "openai-compatible",
        providerConfigId: "web-openai-compatible-discussion"
      },
      {
        id: "provider-perspective-b",
        kind: "model",
        displayName: "Perspective B",
        adapterId: "openai-compatible",
        providerConfigId: "web-openai-compatible-discussion"
      }
    ],
    providerConfigs: [
      {
        id: "web-openai-compatible-discussion",
        adapterId: "openai-compatible",
        providerConfigId: "web-openai-compatible-discussion",
        hasApiKeyEnvVar: true
      }
    ],
    output: {
      expectations: ["Show the current conclusion and next actions."]
    }
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
        limitations: ["Needs further audit"],
        audits: [
          {
            auditEventId: "final-audit-event-1",
            audit: {
              risks: ["Evidence coverage may still be incomplete."]
            }
          }
        ]
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
        },
        audits: [
          {
            auditEventId: "final-audit-event-1",
            audit: {
              risks: ["Evidence coverage may still be incomplete."]
            }
          }
        ]
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

function renderApp(
  initialPath: string,
  client = createClient(),
  options: {
    initialLanguage?: WebLanguage;
  } = {}
) {
  render(
    <App
      daemonClient={client}
      daemonBaseUrl="http://127.0.0.1:3877"
      queryClient={createWebQueryClient()}
      initialPath={initialPath}
      initialLanguage={options.initialLanguage}
    />
  );

  return client;
}

async function ensureDetailsOpen(summaryText: string) {
  const summary =
    summaryText === "Advanced / Developer Mode"
      ? await findAdvancedModeSummary()
      : await screen.findByText(summaryText);
  const details = summary.closest("details") as HTMLDetailsElement | null;

  expect(details).not.toBeNull();

  if (details && !details.open) {
    fireEvent.click(summary);
  }

  await waitFor(() => expect(details?.open).toBe(true));
}

function getAdvancedModeSummary(index = 0) {
  const summary = Array.from(
    document.querySelectorAll("details.du-advanced-panel > summary")
  )[index];
  expect(summary).toBeTruthy();

  return summary as HTMLElement;
}

async function findAdvancedModeSummary(index = 0) {
  await waitFor(() => expect(getAdvancedModeSummary(index)).toBeTruthy());

  return getAdvancedModeSummary(index);
}

function getAdvancedModeSummaryByPanelText(text: string) {
  const details = Array.from(document.querySelectorAll("details.du-advanced-panel")).find(
    (element) =>
      element.getAttribute("data-advanced-panel") === text ||
      element.textContent?.includes(text)
  );
  expect(details).toBeTruthy();
  const summary = details?.querySelector("summary");
  expect(summary).toBeTruthy();

  return summary as HTMLElement;
}

function getUserDetailsSummaryByText(text: string) {
  const details = Array.from(document.querySelectorAll("details.du-user-details")).find(
    (element) => element.textContent?.includes(text)
  );
  expect(details).toBeTruthy();
  const summary = details?.querySelector("summary");
  expect(summary).toBeTruthy();

  return summary as HTMLElement;
}

async function findAdvancedModeSummaryByPanelText(text: string) {
  await waitFor(() => expect(getAdvancedModeSummaryByPanelText(text)).toBeTruthy());

  return getAdvancedModeSummaryByPanelText(text);
}

function openAllClosedAdvancedModeDetails() {
  for (let pass = 0; pass < 3; pass += 1) {
    const closedSummaries = screen
      .getAllByText("Advanced / Developer Mode")
      .filter((summary) => {
        const details = summary.closest("details") as HTMLDetailsElement | null;

        return details?.classList.contains("du-advanced-panel") ? !details.open : false;
      });

    if (closedSummaries.length === 0) {
      return;
    }

    for (const summary of closedSummaries) {
      fireEvent.click(summary);
    }
  }
}

function openBriefOptions() {
  const summary = screen.getByText("Add goals, constraints, and expected result");
  const details = summary.closest("details") as HTMLDetailsElement | null;

  expect(details).toBeTruthy();

  if (!details?.open) {
    fireEvent.click(summary);
  }
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
  window.localStorage.clear();
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
    expect(screen.getAllByText("Advanced / Developer Mode").length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent ?? "").not.toContain("Topic Contract");
    expect(document.body.textContent ?? "").not.toContain("concept mapping");
    expect(document.body.textContent ?? "").not.toContain("Runtime, daemon, resource");
    expect(document.body.textContent ?? "").not.toContain("raw session ids");
    fireEvent.click(getAdvancedModeSummary());
    expect(await screen.findByText("Core concept mapping")).toBeTruthy();
    expect(screen.getByText("Topic Contract")).toBeTruthy();
    expect(screen.getAllByText("1. Start a discussion").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "The current conclusion keeps open disagreements, risks, missing evidence, and recommended next actions together."
      )
    ).toBeTruthy();
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(client.listSessions).not.toHaveBeenCalled();
    expect(client.getDeploymentPosture).not.toHaveBeenCalled();
    expect(client.getResourceAccessPosture).not.toHaveBeenCalled();
    expect(client.getOperationAudit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/chat/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/message/i)).toBeNull();

    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced operator details"));
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled());
    fireEvent.change(await screen.findByLabelText("Session id"), {
      target: {
        value: "session-1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect((await screen.findAllByText("Discussion brief")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
  });

  it("renders the run catalog as the default discussion continuation path", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Continue existing discussions")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    expect(client.listSessions).not.toHaveBeenCalled();
    expect(screen.getByText("Resume latest discussion")).toBeTruthy();
    expect(screen.queryByText("More discussions")).toBeNull();
    expect(screen.getByText("Evaluate the local daemon run workspace")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Stage 11 shell");
    expect(screen.getByText("Ready to review: current conclusion is available.")).toBeTruthy();
    expect(screen.getByText("Next step")).toBeTruthy();
    expect(screen.getByText("Review current conclusion")).toBeTruthy();
    expect(
      screen.getByText(
        "Start with the current conclusion, then check visible disagreements, requirements, risks, and missing evidence before relying on it."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Independent first responses").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Current conclusion" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Underlying session catalog");

    fireEvent.click(screen.getByRole("link", { name: "Open discussion" }));

    expect((await screen.findAllByText("Discussion brief")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));

    cleanup();

    const advancedClient = renderApp("/");
    expect((await screen.findAllByText("Continue existing discussions")).length).toBeGreaterThan(0);
    expect(advancedClient.listSessions).not.toHaveBeenCalled();
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced operator details"));
    expect(await screen.findByText("Underlying session catalog")).toBeTruthy();
    await waitFor(() => expect(advancedClient.listSessions).toHaveBeenCalled());
    expect(screen.getAllByText("Session id").length).toBeGreaterThan(1);
    expect(screen.getByText("session-1")).toBeTruthy();
    expect(screen.getByText("7 updates")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open session view" })).toBeTruthy();
  });

  it("renders setup and model readiness as a default user path", async () => {
    const client = renderApp("/");

    expect(await screen.findByText("Setup / Models")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(await screen.findByText("Daemon online")).toBeTruthy();
    expect(screen.getByText("Model providers")).toBeTruthy();
    expect(
      screen.getByText(
        "A provider is enabled, but model details still need local setup or per-discussion model settings."
      )
    ).toBeTruthy();
    expect(screen.getByText("Ready for demo discussions")).toBeTruthy();
    expect(screen.getByText("Provider enabled; add model details")).toBeTruthy();
    expect(screen.getByText("Configuration required")).toBeTruthy();
    expect(screen.getByText("Configure provider locally")).toBeTruthy();
    expect(
      screen.getByText("Where to configure API key, base URL, and model")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Use local setup tools or local environment settings. Web shows readiness but does not store API keys."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_BASE_URL");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_MCP_TOOL_URL");

    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced operator details"));
    expect(await screen.findByText("Runtime profiles")).toBeTruthy();
    expect(screen.getByText("DELIBERUM_OPENAI_API_KEY")).toBeTruthy();
  });

  it("localizes known sample discussion titles on the landing catalog", async () => {
    const client = createClient({
      listRuns: vi.fn(async () => ({
        runs: [
          {
            ...runDetail,
            title: "Discussion: How should we review a proposed rollout before relying on it?",
            topic: "How should we review a proposed rollout before relying on it?"
          }
        ]
      }))
    });

    renderApp("/", client, {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u7ee7\u7eed\u5df2\u6709\u8ba8\u8bba")).length).toBeGreaterThan(
      0
    );
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("\u8bbe\u7f6e / \u6a21\u578b")).toBeTruthy();
    expect(screen.getAllByText("\u6a21\u578b\u63d0\u4f9b\u65b9").length).toBeGreaterThan(0);
    expect(
      screen.getByText("\u63d0\u4f9b\u65b9\u5df2\u542f\u7528\uff1b\u8bf7\u6dfb\u52a0\u6a21\u578b\u7ec6\u8282")
    ).toBeTruthy();
    expect(
      screen.getByText("\u5728\u54ea\u91cc\u914d\u7f6e API key\u3001base URL \u548c model")
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(screen.getByText("\u7ee7\u7eed\u6700\u65b0\u8ba8\u8bba")).toBeTruthy();
    const landingCatalogText =
      screen.getByText("\u6211\u4eec\u5e94\u5982\u4f55\u5728\u4f9d\u8d56\u62df\u8bae\u53d1\u5e03\u524d\u5ba1\u67e5\u5b83\uff1f")
        .closest(".du-run-list-item")?.textContent ?? "";

    expect(landingCatalogText).toContain(
      "\u6211\u4eec\u5e94\u5982\u4f55\u5728\u4f9d\u8d56\u62df\u8bae\u53d1\u5e03\u524d\u5ba1\u67e5\u5b83\uff1f"
    );
    expect(landingCatalogText).not.toContain(
      "How should we review a proposed rollout before relying on it?"
    );
    expect(landingCatalogText).not.toContain(
      "Discussion: How should we review a proposed rollout before relying on it?"
    );
  });

  it("focuses the latest discussion before older discussion history", async () => {
    const olderTopic = "Review an older rollout question";
    const latestTopic = "Decide the next customer research question";
    const client = createClient({
      listRuns: vi.fn(async () => ({
        runs: [
          {
            ...runDetail,
            runId: "run-older",
            title: `Discussion: ${olderTopic}`,
            topic: olderTopic,
            createdAt: "2026-06-10T00:00:00.000Z",
            updatedAt: "2026-06-10T00:01:00.000Z"
          },
          {
            ...runDetail,
            runId: "run-latest",
            title: `Discussion: ${latestTopic}`,
            topic: latestTopic,
            createdAt: "2026-06-10T00:02:00.000Z",
            updatedAt: "2026-06-10T00:03:00.000Z"
          }
        ]
      }))
    });

    renderApp("/runs", client);

    expect(await screen.findByText("Resume latest discussion")).toBeTruthy();
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    const featuredDiscussion = document.querySelector(".du-run-list-item-featured");
    expect(featuredDiscussion?.textContent ?? "").toContain(latestTopic);
    expect(featuredDiscussion?.textContent ?? "").not.toContain(olderTopic);

    const moreDiscussionsSummary = screen.getByText("More discussions");
    const moreDiscussionsDetails = moreDiscussionsSummary.closest(
      "details"
    ) as HTMLDetailsElement | null;

    expect(moreDiscussionsDetails).not.toBeNull();
    expect(moreDiscussionsDetails?.open).toBe(false);
    expect(moreDiscussionsDetails?.textContent ?? "").toContain(
      "1 earlier discussion remains available."
    );
    expect(moreDiscussionsDetails?.textContent ?? "").toContain(olderTopic);

    fireEvent.click(moreDiscussionsSummary);

    expect(moreDiscussionsDetails?.open).toBe(true);
  });

  it("does not send incomplete discussions to unavailable conclusions from catalogs", async () => {
    const client = createClient({
      listRuns: vi.fn(async () => ({
        runs: [notStartedRunDetail]
      }))
    });

    renderApp("/", client);

    expect((await screen.findAllByText("Continue existing discussions")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    expect(screen.getByText("Created: discussion exists, deliberation steps have not started.")).toBeTruthy();
    expect(screen.getByText("Next step")).toBeTruthy();
    expect(screen.getByText("Continue guided discussion")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue the discussion so independent first responses, main perspectives, disagreements, requirements, evidence, and a current conclusion can be produced."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Not started yet").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Open discussion" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Current conclusion" })).toBeNull();

    cleanup();

    const runsClient = createClient({
      listRuns: vi.fn(async () => ({
        runs: [notStartedRunDetail]
      }))
    });

    renderApp("/runs", runsClient);

    expect((await screen.findAllByText("Discussions")).length).toBeGreaterThan(0);
    await waitFor(() => expect(runsClient.listRuns).toHaveBeenCalled());
    expect(screen.getByText("Created: discussion exists, deliberation steps have not started.")).toBeTruthy();
    expect(screen.getByText("Next step")).toBeTruthy();
    expect(screen.getByText("Continue guided discussion")).toBeTruthy();
    expect(screen.getAllByText("Not started yet").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Open discussion" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Current conclusion" })).toBeNull();
  });

  it("renders daemon runtime profile status without environment values", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced operator details"));
    expect(await screen.findByText("Runtime profiles")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getAllByText("Local preset").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI-compatible").length).toBeGreaterThan(0);
    expect(screen.getAllByText("MCP tool").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
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
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced operator details"));
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
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced operator details"));
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
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced operator details"));
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
    expect(screen.getAllByText("Advanced / Developer Mode").length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent ?? "").not.toContain("topic_contract_published");
    expect(document.body.textContent ?? "").not.toContain("Ledger position and raw latest entry");
    fireEvent.click(getAdvancedModeSummaryByPanelText("Ledger position"));
    expect(
      await screen.findByText(
        "Ledger position and raw latest entry are available for debugging without leading the user experience."
      )
    ).toBeTruthy();
    expect(await screen.findByText("topic_contract_published")).toBeTruthy();
  });

  it("localizes session user-mode pages while keeping technical ids in Advanced mode", async () => {
    const client = renderApp("/sessions/session-1", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u8ba8\u8bba\u7b80\u62a5")).length).toBeGreaterThan(0);
    expect((screen.getByLabelText("\u8bed\u8a00") as HTMLSelectElement).value).toBe("zh-CN");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("\u6700\u65b0\u53ef\u89c1\u6b65\u9aa4")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u7b80\u62a5\u5df2\u53d1\u5e03")).toBeTruthy();
    expect(screen.getByText("\u5ba1\u9605\u672c\u6b21\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByRole("link", { name: "\u67e5\u770b\u5f53\u524d\u7ed3\u8bba" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "\u67e5\u770b\u4e3b\u8981\u89c2\u70b9" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "\u5ba1\u9605\u98ce\u9669\u4e0e\u8bc1\u636e" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("topic_contract_published");
    expect(document.body.textContent ?? "").not.toContain("View current conclusion");

    cleanup();

    const frontierClient = renderApp("/sessions/session-1/frontier", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u4e3b\u8981\u89c2\u70b9")).length).toBeGreaterThan(0);
    await waitFor(() => expect(frontierClient.getFrontier).toHaveBeenCalledWith("session-1"));
    expect(
      screen.getByText(
        "\u5df2\u4f5c\u4e3a\u5f53\u524d\u6700\u5f3a\u9009\u9879\u7eb3\u5165\u8ba8\u8bba\u3002"
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("\u5f53\u524d\u72b6\u6001");
    expect(document.body.textContent ?? "").not.toContain("candidate-1");
  });

  it("shows the full discussion brief in user mode", async () => {
    const client = createClient({
      listEvents: vi.fn(async () => ({
        events: [
          {
            id: "event-1",
            type: "topic_contract_published",
            sequence: 0,
            payload: {
              topic: "Review a proposed rollout before relying on it.",
              goals: [
                "Compare the strongest current options.",
                "Keep unresolved risks visible."
              ],
              constraints: [
                "Use sample material only.",
                "Keep the conclusion provisional."
              ],
              output: {
                expectations: [
                  "Show the current conclusion.",
                  "List disagreements, missing evidence, and next actions."
                ]
              }
            }
          }
        ]
      }))
    });

    renderApp("/sessions/session-1", client);

    expect(await screen.findByText("Review a proposed rollout before relying on it.")).toBeTruthy();
    expect(screen.getAllByText("Goals").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Compare the strongest current options. Keep unresolved risks visible.")
    ).toBeTruthy();
    expect(screen.getAllByText("Constraints").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Use sample material only. Keep the conclusion provisional.")
    ).toBeTruthy();
    expect(screen.getAllByText("Expected result").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Show the current conclusion. List disagreements, missing evidence, and next actions."
      )
    ).toBeTruthy();
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
    expect(screen.getByText("Included as a strongest current option.")).toBeTruthy();

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toContain("Current state:");
    expect(renderedText).not.toContain("accepted_active_candidates");
    expect(renderedText).not.toContain("candidate-1");
    for (const forbiddenField of ["currentBest", "winner", "rank", "score", "vote"]) {
      expect(renderedText).not.toContain(forbiddenField);
    }

    fireEvent.click(getAdvancedModeSummary());
    expect((await screen.findAllByText(/candidate-1/)).length).toBeGreaterThan(0);
    fireEvent.click(getAdvancedModeSummary(1));
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
    fireEvent.click(getAdvancedModeSummary());
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
    fireEvent.click(getAdvancedModeSummary());
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

  it("renders the start discussion path in Simplified Chinese when requested", async () => {
    const client = createClient();

    renderApp("/runs/new", client, {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u5f00\u59cb\u8ba8\u8bba")).length).toBeGreaterThan(0);
    expect(screen.getByText("\u4ece\u4e00\u4e2a\u95ee\u9898\u5f00\u59cb")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("\u672c\u6b21\u8ba8\u8bba\u7684\u6a21\u578b\u8bbe\u7f6e")).toBeTruthy();
    expect(
      screen.getByText("\u53ef\u6f14\u793a\u5f00\u59cb\uff0c\u4ecd\u9700\u63d0\u4f9b\u65b9\u7ec6\u8282")
    ).toBeTruthy();
    expect(screen.getByText("\u5feb\u901f\u5f00\u59cb\u53c2\u4e0e\u8005")).toBeTruthy();
    expect(
      screen.getAllByText("\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005").length
    ).toBeGreaterThan(0);
    expect(screen.getByText("\u9009\u62e9\u53c2\u4e0e\u8005\u6765\u6e90")).toBeTruthy();
    expect(screen.getByText("\u6f14\u793a\u53c2\u4e0e\u8005")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u7b80\u62a5")).toBeTruthy();
    expect(screen.getByLabelText("\u8ba8\u8bba\u95ee\u9898")).toBeTruthy();
    expect((screen.getByLabelText("\u8bed\u8a00") as HTMLSelectElement).value).toBe("zh-CN");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("run / session");
  });

  it("shows model readiness on the start discussion path without setup internals", async () => {
    const client = renderApp("/runs/new");

    expect(await screen.findByText("Model setup for this discussion")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("Demo start, provider details needed")).toBeTruthy();
    expect(screen.getByText("Quick-start participants")).toBeTruthy();
    expect(screen.getAllByText("Model-backed participants").length).toBeGreaterThan(0);
    expect(screen.getByText("Choose participant source")).toBeTruthy();
    expect(screen.getByText("Demo participants")).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      screen.getByText(
        "The quick-start form can start now with demo participants. A provider is enabled, but model details still need local setup or per-discussion model settings."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This page does not ask for API keys. Provider credentials stay in local daemon setup and are never stored by Web."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_BASE_URL");
    expect(document.body.textContent ?? "").not.toContain("runtime profile");
  });

  it("creates a model-backed discussion when a ready provider source is selected", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue({
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
          status: "ready",
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
                name: "DELIBERUM_OPENAI_BASE_URL",
                configured: true,
                secret: false,
                required: false,
                purpose: "Default provider base URL."
              },
              {
                name: "DELIBERUM_OPENAI_MODEL",
                configured: true,
                secret: false,
                required: false,
                purpose: "Default model id."
              },
              {
                name: "DELIBERUM_OPENAI_API_KEY",
                configured: true,
                secret: true,
                required: false,
                purpose: "Default provider secret."
              }
            ],
            missingRecommendedEnvVars: [],
            notes: []
          },
          boundaries: []
        }
      ]
    });

    renderApp("/runs/new", client);

    expect(await screen.findByText("Model-backed start available")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");

    const modelBackedSource = screen.getByRole("radio", {
      name: /Model-backed participants/i
    }) as HTMLInputElement;
    expect(modelBackedSource.disabled).toBe(false);
    fireEvent.click(modelBackedSource);
    expect(modelBackedSource.checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Discussion question"), {
      target: {
        value: "Should we use the configured provider for this review?"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create discussion" }));

    await waitFor(() => expect(client.createRun).toHaveBeenCalled());
    const createRunInput = vi.mocked(client.createRun).mock.calls[0]?.[0];
    const runPlan = createRunInput?.runPlan as Record<string, unknown>;

    expect(runPlan).toEqual(
      expect.objectContaining({
        topic: "Should we use the configured provider for this review?",
        constraints: expect.arrayContaining([
          "Use configured model-backed participants from the local daemon.",
          "Keep provider credentials in the local daemon environment only."
        ]),
        participants: expect.arrayContaining([
          expect.objectContaining({
            displayName: "Perspective A",
            adapterId: "openai-compatible",
            providerConfigId: "web-openai-compatible-discussion"
          })
        ]),
        providerConfigs: [
          expect.objectContaining({
            id: "web-openai-compatible-discussion",
            adapterId: "openai-compatible",
            providerConfigId: "web-openai-compatible-discussion",
            apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY"
          })
        ]
      })
    );
    expect(JSON.stringify(runPlan)).not.toContain("sk-");
    expect(JSON.stringify(runPlan)).not.toContain("Use built-in sample participants only.");
  });

  it("switches the user-facing shell between English and Simplified Chinese", async () => {
    renderApp("/runs/new");

    expect(await screen.findByText("Start from a question")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Language"), {
      target: {
        value: "zh-CN"
      }
    });

    expect(await screen.findByText("\u4ece\u4e00\u4e2a\u95ee\u9898\u5f00\u59cb")).toBeTruthy();
    expect(screen.getByLabelText("\u8ba8\u8bba\u95ee\u9898")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("\u8bed\u8a00"), {
      target: {
        value: "en"
      }
    });

    expect(await screen.findByText("Start from a question")).toBeTruthy();
    expect(screen.getByLabelText("Discussion question")).toBeTruthy();
  });

  it("remembers an explicit Simplified Chinese language choice across app remounts", async () => {
    renderApp("/runs/new");

    expect(await screen.findByText("Start from a question")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Language"), {
      target: {
        value: "zh-CN"
      }
    });

    expect(await screen.findByText("\u4ece\u4e00\u4e2a\u95ee\u9898\u5f00\u59cb")).toBeTruthy();
    expect(window.localStorage.getItem(WEB_LANGUAGE_STORAGE_KEY)).toBe("zh-CN");

    cleanup();
    renderApp("/runs/new");

    expect(await screen.findByText("\u4ece\u4e00\u4e2a\u95ee\u9898\u5f00\u59cb")).toBeTruthy();
    expect((screen.getByLabelText("\u8bed\u8a00") as HTMLSelectElement).value).toBe("zh-CN");
  });

  it("falls back to English when a stored language value is not supported", async () => {
    window.localStorage.setItem(WEB_LANGUAGE_STORAGE_KEY, "fr");

    renderApp("/runs/new");

    expect(await screen.findByText("Start from a question")).toBeTruthy();
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("en");
  });

  it("renders the discussion room core structure in Simplified Chinese", async () => {
    renderApp("/runs/run-1", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect(await screen.findByText("\u4e0b\u4e00\u6b65\uff1a\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba")).toBeTruthy();
    expect(screen.getAllByText("\u8ba8\u8bba\u5ba4").length).toBeGreaterThan(0);
    expect(screen.getByText("\u6b63\u5728\u8ba8\u8bba\u4ec0\u4e48")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u65f6\u95f4\u7ebf")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u5ba4\u4e2d\u53d1\u751f\u4e86\u4ec0\u4e48")).toBeTruthy();
    expect(screen.getByRole("region", { name: "\u5bf9\u8bdd\u8bb0\u5f55" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "\u8ba8\u8bba\u7b80\u62a5\u66f4\u65b0" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u66f4\u65b0" })).toBeTruthy();
    const localizedStageSummaries = Array.from(
      document.querySelectorAll('[aria-label="\u9636\u6bb5\u6d3b\u52a8\u6458\u8981"]')
    ).map((summary) => summary.textContent ?? "");
    expect(localizedStageSummaries.join(" ")).toContain("1 \u4e2a\u66f4\u65b0");
    expect(localizedStageSummaries.join(" ")).toContain("\u6ca1\u6709\u53c2\u4e0e\u8005\u8d21\u732e");
    expect(localizedStageSummaries.join(" ")).toContain("1 \u4e2a\u53c2\u4e0e\u8005\u8d21\u732e");
    expect(
      screen.getByRole("region", { name: "\u8ba8\u8bba\u5ba4\u8fdb\u5ea6\u6458\u8981" })
    ).toBeTruthy();
    expect(screen.getByText("\u5f53\u524d\u9636\u6bb5")).toBeTruthy();
    expect(screen.getByText("\u5f53\u524d\u7ed3\u8bba\u53ef\u5ba1\u9605")).toBeTruthy();
    expect(screen.getByText("\u4e0b\u4e00\u4e2a\u68c0\u67e5\u70b9")).toBeTruthy();
    expect(screen.getByText("\u4f9d\u8d56\u524d\u9700\u5ba1\u9605")).toBeTruthy();
    const localizedDiscussionOutputs = screen.getByRole("region", {
      name: "\u8ba8\u8bba\u4ea7\u51fa"
    });
    expect(localizedDiscussionOutputs).toBeTruthy();
    expect(localizedDiscussionOutputs.textContent ?? "").toContain(
      "\u8ba8\u8bba\u5ba4\u5df2\u7ecf\u4ea7\u51fa\u4e86\u4ec0\u4e48"
    );
    expect(localizedDiscussionOutputs.textContent ?? "").toContain(
      "\u7528\u5b83\u628a\u8ba8\u8bba\u65f6\u95f4\u7ebf\u8fde\u63a5\u5230\u5f53\u524d\u51b3\u7b56\u6750\u6599\u3002"
    );
    expect(localizedDiscussionOutputs.textContent ?? "").toContain("1 \u4e2a\u53ef\u6bd4\u8f83\u9009\u9879");
    const localizedActionPath = screen.getByRole("region", {
      name: "\u63a8\u8350\u64cd\u4f5c\u8def\u5f84"
    });
    expect(localizedActionPath).toBeTruthy();
    expect(localizedActionPath.textContent ?? "").toContain("\u63a8\u8350\u8def\u5f84");
    expect(localizedActionPath.textContent ?? "").toContain("\u4ece\u8fd9\u91cc\u5f00\u59cb");
    expect(localizedActionPath.textContent ?? "").toContain("\u9009\u62e9\u8ddf\u8fdb\u52a8\u4f5c");
    const localizedDiscussionActionsText =
      document.querySelector(".du-discussion-actions")?.textContent ?? "";
    expect(localizedDiscussionActionsText).toContain("\u66f4\u65b0\u8ba8\u8bba");
    expect(localizedDiscussionActionsText).toContain("\u4ec5\u67e5\u770b");
    expect(localizedDiscussionActionsText).toContain(
      "\u5b8c\u6210\u540e\uff0c\u8bf7\u67e5\u770b\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf\u548c\u5f53\u524d\u7ed3\u8bba\u3002"
    );
    expect(localizedDiscussionActionsText).toContain(
      "\u4ec5\u8df3\u8f6c\u67e5\u770b\uff1b\u4e0d\u4f1a\u6539\u53d8\u8ba8\u8bba\u3002"
    );
    expect(screen.getAllByText("\u5f53\u524d\u6700\u5f3a\u9009\u9879").length).toBeGreaterThan(0);
    expect(screen.getByText("\u5f53\u524d\u6700\u5f3a\u9009\u9879\u7684\u5185\u5bb9")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "\u5f53\u524d\u8ba8\u8bba\u6458\u8981" })).toBeTruthy();
    expect(screen.getByText("\u51b3\u7b56\u5de5\u4f5c\u533a")).toBeTruthy();
    expect(screen.getByText("\u5f53\u524d\u7ed3\u8bba\uff1a\u53ef\u5ba1\u9605")).toBeTruthy();
    expect(screen.getByText("\u4e0b\u4e00\u6b65\u52a8\u4f5c")).toBeTruthy();
    expect(screen.getByText("\u9700\u8981\u5ba1\u9605\u7684\u5185\u5bb9")).toBeTruthy();
    expect(screen.getByText("\u4e0b\u4e00\u6b65\uff1a\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba")).toBeTruthy();
    expect(screen.getAllByText("\u5f53\u524d\u7ed3\u8bba").length).toBeGreaterThan(0);
    expect(await screen.findByText("\u98ce\u9669\u4e0e\u7f3a\u5931\u8bc1\u636e")).toBeTruthy();
    expect(
      await screen.findByText(
        "\u5df2\u4f5c\u4e3a\u5f53\u524d\u6700\u5f3a\u9009\u9879\u7eb3\u5165\u8ba8\u8bba\u3002"
      )
    ).toBeTruthy();
    const detailPanelsText =
      screen.getByRole("region", { name: "\u8ba8\u8bba\u8be6\u60c5\u9762\u677f" }).textContent ??
      "";
    const roomFlowText = document.querySelector(".du-room-flow")?.textContent ?? "";
    expect(roomFlowText).not.toContain("readable perspectives are visible");
    expect(roomFlowText).not.toContain("open disagreements and");
    expect(detailPanelsText).toContain("\u4e3b\u8981\u89c2\u70b9");
    expect(detailPanelsText).not.toContain("Current state:");
    expect(detailPanelsText).not.toContain("Risks and missing evidence");
    expect(document.body.textContent ?? "").not.toContain("Run Alpha");
  });

  it("localizes the post-action review path in Simplified Chinese", async () => {
    const client = renderApp("/runs/run-1", createClient(), {
      initialLanguage: "zh-CN"
    });

    fireEvent.click(await screen.findByRole("button", { name: "\u66f4\u65b0\u7ed3\u8bba" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const latestUpdate = await screen.findByRole("region", {
      name: "\u6700\u65b0\u8ba8\u8bba\u66f4\u65b0"
    });
    expect(latestUpdate).toBeTruthy();
    expect(latestUpdate.textContent ?? "").toContain("\u53d1\u751f\u4e86\u4ec0\u4e48\u53d8\u5316");
    expect(latestUpdate.textContent ?? "").toContain(
      "\u8bf7\u5148\u5ba1\u9605\u6b64\u7ed3\u679c\uff0c\u7136\u540e\u56de\u5230\u65f6\u95f4\u7ebf\u3001\u8ba8\u8bba\u4ea7\u51fa\u6216\u5f53\u524d\u7ed3\u8bba\u3002"
    );
    const resultHandoff = await screen.findByRole("region", {
      name: "\u66f4\u65b0\u540e\u5ba1\u9605\u8def\u5f84"
    });
    expect(resultHandoff).toBeTruthy();
    expect(latestUpdate.contains(resultHandoff)).toBe(true);
    expect(resultHandoff.textContent ?? "").toContain("\u63a5\u4e0b\u6765\u5ba1\u9605\u4ec0\u4e48");
    expect(resultHandoff.textContent ?? "").toContain(
      "\u5ba1\u9605\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf"
    );
    expect(resultHandoff.textContent ?? "").toContain("\u5ba1\u9605\u8ba8\u8bba\u4ea7\u51fa");
    expect(resultHandoff.textContent ?? "").toContain("\u67e5\u770b\u5f53\u524d\u7ed3\u8bba");
  });

  it("localizes known sample discussion brief content in Simplified Chinese", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: {
            ...runDetail,
            title: "How should we review a proposed rollout before relying on it?",
            topic: "How should we review a proposed rollout before relying on it?",
            plan: {
              ...runDetail.plan,
              topic: "How should we review a proposed rollout before relying on it?",
              goals: [
                "Compare the strongest current options.",
                "Keep unresolved disagreements and missing evidence visible."
              ],
              constraints: [
                "Keep the walkthrough deterministic and reviewable.",
                "Treat the conclusion as provisional until a human reviews it.",
                "Use built-in sample participants only.",
                "Keep the conclusion provisional until reviewed."
              ],
              output: {
                expectations: [
                  "Show the current conclusion.",
                  "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions."
                ]
              }
            }
          }
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() =>
      expect(document.querySelector(".du-room-brief")?.textContent ?? "").toContain(
        "\u6211\u4eec\u5e94\u5982\u4f55\u5728\u4f9d\u8d56\u62df\u8bae\u53d1\u5e03\u524d\u5ba1\u67e5\u5b83\uff1f"
      )
    );

    const briefText = document.querySelector(".du-room-brief")?.textContent ?? "";
    expect(briefText).toContain(
      "\u6211\u4eec\u5e94\u5982\u4f55\u5728\u4f9d\u8d56\u62df\u8bae\u53d1\u5e03\u524d\u5ba1\u67e5\u5b83\uff1f"
    );
    expect(briefText).toContain("\u6bd4\u8f83\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002");
    expect(briefText).toContain(
      "\u4fdd\u6301\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7f3a\u5931\u8bc1\u636e\u53ef\u89c1\u3002"
    );
    expect(briefText).toContain("\u4fdd\u6301\u6f14\u793a\u53ef\u590d\u73b0\u4e14\u53ef\u5ba1\u9605\u3002");
    expect(briefText).toContain("\u4ec5\u4f7f\u7528\u5185\u7f6e\u793a\u4f8b\u53c2\u4e0e\u8005\u3002");
    expect(briefText).toContain("\u5c55\u793a\u5f53\u524d\u7ed3\u8bba\u3002");
    expect(briefText).not.toContain(
      "How should we review a proposed rollout before relying on it?"
    );
    expect(briefText).not.toContain("Compare the strongest current options.");
    expect(briefText).not.toContain("Keep the walkthrough deterministic and reviewable.");
  });

  it("renders the current conclusion review surface in Simplified Chinese", async () => {
    const client = renderApp("/runs/run-1/outcome", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u5f53\u524d\u7ed3\u8bba")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRunOutcome).toHaveBeenCalledWith("run-1"));
    expect(screen.getByText("\u5f53\u524d\u7ed3\u8bba\u4ecd\u662f\u4e34\u65f6\u7ed3\u8bba")).toBeTruthy();
    expect(screen.getByRole("region", { name: "\u5f53\u524d\u7ed3\u8bba\u5feb\u7167" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "\u7ed3\u8bba\u5ba1\u9605\u8def\u5f84" })).toBeTruthy();
    expect(screen.getByText("\u5f53\u524d\u5efa\u8bae")).toBeTruthy();
    expect(screen.getByText("\u5ba1\u9605\u8def\u5f84")).toBeTruthy();
    expect(screen.getByText("\u5728\u4f9d\u8d56\u6b64\u7ed3\u8bba\u4e4b\u524d")).toBeTruthy();
    expect(screen.getByText("\u9605\u8bfb\u5efa\u8bae")).toBeTruthy();
    expect(screen.getByText("\u68c0\u67e5\u7f3a\u5931\u8bc1\u636e")).toBeTruthy();
    expect(screen.getByText("\u4f7f\u7528\u4e0b\u4e00\u6b65\u5efa\u8bae")).toBeTruthy();
    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).not.toContain("Review path");
    expect(readableConclusion).not.toContain("Use next recommended actions");
  });

  it("localizes known sample conclusion content in Simplified Chinese", async () => {
    const client = createClient({
      getRunOutcome: vi.fn(async () => ({
        runId: runDetail.runId,
        sessionId: runDetail.sessionId,
        status: "compiled",
        draftStatus: "provisional",
        outcome: {
          recommendation: "Use a staged review path before relying on the rollout.",
          alternatives: [
            {
              title: "Staged rollout review",
              description:
                "Review the rollout in stages, keep alternatives visible, and treat the conclusion as provisional until risks and evidence gaps are checked.",
              status: "active"
            }
          ],
          unresolvedObjections: [
            {
              failureMode:
                "Users could rely on the sample conclusion without checking whether it matches their real rollout.",
              consequence:
                "The conclusion must keep limitations, disagreements, and next actions visible.",
              status: "open"
            }
          ],
          qualityObligations: [
            {
              requirement:
                "State that the conclusion is provisional and list what must be checked next.",
              status: "unanswered"
            }
          ],
          evidenceStatus: {
            evidenceNeeds: []
          },
          unresolvedQuestions: [
            "State that the conclusion is provisional and list what must be checked next."
          ],
          limitations: [
            "This built-in sample is illustrative; replace it with real participant or model input for real decisions."
          ],
          continuationSuggestions: [
            "Run the discussion with the real rollout brief and real participants or model connections when ready."
          ],
          audits: [
            {
              audit: {
                risks: [
                  "A team could mistake the sample walkthrough for a decision about its real rollout."
                ]
              }
            }
          ]
        }
      }))
    });

    renderApp("/runs/run-1/outcome", client, {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u5f53\u524d\u7ed3\u8bba")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRunOutcome).toHaveBeenCalledWith("run-1"));

    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).toContain(
      "\u5728\u4f9d\u8d56\u6b64\u6b21\u53d1\u5e03\u524d\uff0c\u91c7\u7528\u5206\u9636\u6bb5\u5ba1\u67e5\u8def\u5f84\u3002"
    );
    expect(readableConclusion).toContain("\u5206\u9636\u6bb5\u53d1\u5e03\u5ba1\u67e5");
    expect(readableConclusion).toContain(
      "\u7528\u6237\u53ef\u80fd\u5728\u672a\u68c0\u67e5\u5176\u662f\u5426\u5339\u914d\u771f\u5b9e\u53d1\u5e03\u7684\u60c5\u51b5\u4e0b\u4f9d\u8d56\u793a\u4f8b\u7ed3\u8bba\u3002"
    );
    expect(readableConclusion).toContain(
      "\u6b64\u5185\u7f6e\u793a\u4f8b\u4ec5\u7528\u4e8e\u8bf4\u660e\uff1b\u771f\u5b9e\u51b3\u7b56\u8bf7\u66ff\u6362\u4e3a\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8f93\u5165\u3002"
    );
    expect(readableConclusion).toContain(
      "\u56e2\u961f\u53ef\u80fd\u4f1a\u628a\u793a\u4f8b\u6f14\u793a\u8bef\u8ba4\u4e3a\u5173\u4e8e\u771f\u5b9e\u53d1\u5e03\u7684\u51b3\u7b56\u3002"
    );
    expect(readableConclusion).toContain(
      "\u51c6\u5907\u597d\u540e\uff0c\u8bf7\u4f7f\u7528\u771f\u5b9e\u53d1\u5e03\u7b80\u62a5\u548c\u771f\u5b9e\u53c2\u4e0e\u8005\u6216\u6a21\u578b\u8fde\u63a5\u91cd\u65b0\u8fd0\u884c\u8ba8\u8bba\u3002"
    );
    expect(readableConclusion).not.toContain(
      "Use a staged review path before relying on the rollout."
    );
    expect(readableConclusion).not.toContain("A team could mistake the sample walkthrough");
  });

  it("localizes current conclusion fallback records in Simplified Chinese", async () => {
    const client = createClient({
      getRunOutcome: vi.fn(async () => ({
        runId: runDetail.runId,
        sessionId: runDetail.sessionId,
        status: "compiled",
        draftStatus: "provisional",
        outcome: {
          recommendation: "Use the current discussion state as review material.",
          alternatives: [
            {
              status: "active"
            }
          ],
          unresolvedObjections: [
            {
              status: "open"
            }
          ],
          qualityObligations: [
            {
              status: "unanswered"
            }
          ],
          evidenceStatus: {
            evidenceNeeds: [
              {
                status: "unchecked"
              }
            ]
          },
          unresolvedQuestions: [],
          continuationSuggestions: [],
          limitations: []
        }
      }))
    });

    renderApp("/runs/run-1/outcome", client, {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u5f53\u524d\u7ed3\u8bba")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRunOutcome).toHaveBeenCalledWith("run-1"));

    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).toContain("\u89c6\u89d2 1");
    expect(readableConclusion).toContain("\u6b64\u89c6\u89d2\u5df2\u5305\u542b\u5728\u5f53\u524d\u8ba8\u8bba\u6750\u6599\u4e2d\u3002");
    expect(readableConclusion).toContain("\u5728\u672c\u6b21\u8ba8\u8bba\u4e2d\u53ef\u89c1");
    expect(readableConclusion).toContain("\u672a\u89e3\u51b3\u5206\u6b67 1");
    expect(readableConclusion).toContain("\u8981\u6c42 1");
    expect(readableConclusion).toContain("\u7f3a\u5931\u8bc1\u636e 1");
    expect(readableConclusion).toContain("\u9700\u8981\u56de\u7b54");
    expect(readableConclusion).toContain("\u9700\u8981\u9a8c\u8bc1");
    expect(readableConclusion).toContain("\u6b64\u8bc1\u636e\u7f3a\u53e3\u4ecd\u9700\u9a8c\u8bc1\u3002");
    expect(readableConclusion).not.toContain("Perspective 1");
    expect(readableConclusion).not.toContain("Open disagreement 1");
    expect(readableConclusion).not.toContain("Requirement 1");
    expect(readableConclusion).not.toContain("Missing evidence 1");
    expect(readableConclusion).not.toContain("Visible in this discussion");
    expect(readableConclusion).not.toContain("Needs an answer");
    expect(readableConclusion).not.toContain("Needs verification");
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
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText("What is being discussed")).toBeTruthy();
    expect(screen.getAllByText("Discussion room").length).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain("internal run id");
    expect(screen.queryByRole("link", { name: "Open discussion room" })).toBeNull();
    expect(screen.queryByText("Discussion created")).toBeNull();
    expect(screen.queryByRole("link", { name: "Review discussion brief" })).toBeNull();
  });

  it("creates a guided discussion from a plain-language brief", async () => {
    const client = renderApp("/runs/new");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(screen.getByText("Add goals, constraints, and expected result")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Create discussion" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Discussion question"), {
      target: {
        value: "Should we adopt a staged provider rollout?"
      }
    });
    expect(
      (screen.getByRole("button", { name: "Create discussion" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    openBriefOptions();
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
    fireEvent.change(screen.getByLabelText("Expected result"), {
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
            "Use built-in sample participants only.",
            "Keep the conclusion provisional until reviewed."
          ]),
          participants: expect.arrayContaining([
            expect.objectContaining({
              displayName: "Perspective A",
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
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText("What is being discussed")).toBeTruthy();
    expect(screen.getAllByText("Discussion room").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Open discussion room" })).toBeNull();
    expect(screen.queryByText("Discussion created")).toBeNull();
    expect(screen.queryByRole("link", { name: "Review discussion brief" })).toBeNull();
  });

  it("fills the sample brief with user-facing discussion text", async () => {
    const client = renderApp("/runs/new");

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Use sample brief" }));

    expect((screen.getByLabelText("Discussion question") as HTMLTextAreaElement).value).toBe(
      "How should we review a proposed rollout before relying on it?"
    );
    openBriefOptions();
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
    expect((runPlanInput as HTMLTextAreaElement).value).toContain("Perspective A");
    expect((runPlanInput as HTMLTextAreaElement).value).not.toContain("Local preset Alpha");
    expect((runPlanInput as HTMLTextAreaElement).value).not.toContain(
      "Render only deterministic sample material"
    );

    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith({
        runPlan: expect.objectContaining({
          title: "Guided sample discussion",
          providerConfigs: [],
          participants: expect.arrayContaining([
            expect.objectContaining({
              displayName: "Perspective A",
              adapterId: "local-preset-alpha"
            })
          ])
        })
      })
    );
  });

  it("renders run detail, room activity, stage status, and discussion detail panels without raw event ids", async () => {
    const client = renderApp("/runs/run-1");

    expect(
      (await screen.findAllByText("Evaluate the local daemon run workspace")).length
    ).toBeGreaterThan(1);
    expect(document.body.textContent ?? "").not.toContain("Run Alpha");
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    expect(client.getRunProcessProposals).not.toHaveBeenCalled();
    expect(client.getProcessProposalStates).not.toHaveBeenCalled();

    expect(screen.getAllByText("Discussion brief").length).toBeGreaterThan(0);
    expect(screen.getByText("Question")).toBeTruthy();
    expect(screen.getAllByText("Goals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inspect run state").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Constraints").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Keep outcomes provisional").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expected result").length).toBeGreaterThan(0);
    expect(screen.getByText("Not specified")).toBeTruthy();
    expect(screen.getAllByText("Discussion status").length).toBeGreaterThan(0);
    expect(screen.getByText("Discussion is ready to review")).toBeTruthy();
    const pageActionsText = document.querySelector(".du-page-actions")?.textContent ?? "";
    expect(pageActionsText).toContain("View current conclusion");
    expect(pageActionsText).toContain("Update conclusion");
    const primaryDiscussionActions = screen.getByRole("navigation", {
      name: "Primary discussion actions"
    });
    expect(primaryDiscussionActions.textContent ?? "").toContain(
      "Review current conclusion"
    );
    expect(primaryDiscussionActions.textContent ?? "").toContain("Update conclusion");
    expect(screen.getByText("Discussion actions")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update conclusion" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask for stronger options" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review disagreements" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Confirm answer requirements" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Confirm answer requirements" }).getAttribute("href")
    ).toBe("#answer-requirements");
    expect(screen.getByRole("link", { name: "Check evidence" })).toBeTruthy();
    const discussionActionsText =
      document.querySelector(".du-discussion-actions")?.textContent ?? "";
    expect(discussionActionsText).toContain("Updates discussion");
    expect(discussionActionsText).toContain("Review only");
    expect(discussionActionsText).toContain(
      "After it finishes, review the updated timeline and current conclusion."
    );
    expect(discussionActionsText).toContain(
      "Jump only; this does not change the discussion."
    );
    const recommendedActionPath = screen.getByRole("region", {
      name: "Recommended action path"
    });
    expect(recommendedActionPath).toBeTruthy();
    expect(recommendedActionPath.textContent ?? "").toContain("Recommended path");
    expect(recommendedActionPath.textContent ?? "").toContain("Start here");
    expect(recommendedActionPath.textContent ?? "").toContain("Review current conclusion");
    expect(recommendedActionPath.textContent ?? "").toContain("Choose a follow-up action");
    expect(recommendedActionPath.textContent ?? "").toContain("Recheck the room outputs");
    expect(screen.getAllByText("Recommended").length).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain("7 recorded lifecycle events");
    fireEvent.click(getUserDetailsSummaryByText("Discussion setup"));
    fireEvent.click(getAdvancedModeSummaryByPanelText("Discussion status details"));
    expect(await screen.findByText("Ledger events")).toBeTruthy();
    expect(screen.getByText("7 recorded lifecycle events")).toBeTruthy();
    expect(screen.getAllByText("Discussion room").length).toBeGreaterThan(0);
    expect(screen.getByText("What is being discussed")).toBeTruthy();
    expect(screen.getByText("Discussion timeline")).toBeTruthy();
    expect(screen.getByText("What has happened in the room")).toBeTruthy();
    const roomProgressSummary = screen.getByRole("region", {
      name: "Room progress summary"
    });
    expect(roomProgressSummary).toBeTruthy();
    expect(roomProgressSummary.textContent ?? "").toContain("Current phase");
    expect(roomProgressSummary.textContent ?? "").toContain("Current conclusion ready");
    expect(roomProgressSummary.textContent ?? "").toContain("Next checkpoint");
    expect(roomProgressSummary.textContent ?? "").toContain(
      "Review current conclusion with open items visible."
    );
    expect(roomProgressSummary.textContent ?? "").toContain("Review before relying");
    expect(roomProgressSummary.textContent ?? "").toContain("Open disagreements");
    expect(roomProgressSummary.textContent ?? "").toContain("Missing evidence");
    expect(roomProgressSummary.textContent ?? "").toContain("Requirements to satisfy");
    expect(screen.getByText("Room activity")).toBeTruthy();
    expect(screen.getByText("Readable discussion flow")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Conversation transcript" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Discussion brief updates" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Independent first response updates" })).toBeTruthy();
    const stageSummaries = Array.from(
      document.querySelectorAll('[aria-label="Stage activity summary"]')
    ).map((summary) => summary.textContent ?? "");
    expect(stageSummaries.join(" ")).toContain("1 update");
    expect(stageSummaries.join(" ")).toContain("No participant contributions");
    expect(stageSummaries.join(" ")).toContain("1 participant contribution");
    expect(
      screen.getByText("The room starts by making the question, goals, and constraints visible.")
    ).toBeTruthy();
    expect(screen.getByText("Participants respond separately before comparing answers.")).toBeTruthy();
    expect(screen.getByText("Discussion brief published")).toBeTruthy();
    expect(screen.getByText("Independent response submitted")).toBeTruthy();
    expect(
      screen.getByText(
        "This response is sealed until the independent first responses are revealed."
      )
    ).toBeTruthy();
    expect(screen.getByText("Core discussion stages")).toBeTruthy();
    const discussionOutputs = screen.getByRole("region", { name: "Discussion outputs" });
    expect(discussionOutputs).toBeTruthy();
    expect(discussionOutputs.textContent ?? "").toContain("What the room has produced");
    expect(discussionOutputs.textContent ?? "").toContain(
      "Use this as the bridge from the discussion timeline to the current decision material."
    );
    expect(discussionOutputs.textContent ?? "").toContain("1 option ready to compare");
    expect(discussionOutputs.textContent ?? "").toContain("1 open disagreement to review");
    expect(discussionOutputs.textContent ?? "").toContain("1 answer requirement to confirm");
    expect(discussionOutputs.textContent ?? "").toContain("1 evidence gap to check");
    expect(discussionOutputs.textContent ?? "").toContain(
      "A reviewable conclusion is ready with risks and next actions."
    );
    expect(screen.getByText("What the strongest options say now")).toBeTruthy();
    expect(screen.getByText("Option 1")).toBeTruthy();
    expect(
      screen.getByText(
        "These options synthesize the discussion so far. Individual participant statements remain in the timeline above."
      )
    ).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Current room summary" })).toBeTruthy();
    expect(screen.getByText("Decision workspace")).toBeTruthy();
    expect(screen.getByText("Current conclusion: Ready to review")).toBeTruthy();
    expect(screen.getByText("Next action")).toBeTruthy();
    expect(screen.getByText("What to review")).toBeTruthy();
    expect(
      screen.getByText(
        "Open items remain visible here so the conclusion is not treated as final."
      )
    ).toBeTruthy();
    expect(screen.getByText("Next: review current conclusion")).toBeTruthy();
    expect(screen.getAllByText("Current conclusion").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence gaps")).toBeTruthy();
    expect(screen.getAllByText("1/1").length).toBeGreaterThan(0);
    expect(screen.getByText("Next recommended actions")).toBeTruthy();
    expect(screen.getByText("Open conclusion")).toBeTruthy();
    expect(screen.getByText("Review evidence")).toBeTruthy();
    expect(screen.getByText("View disagreements")).toBeTruthy();
    expect(screen.getByText("View requirements")).toBeTruthy();
    const defaultRunLinks = Array.from(document.querySelectorAll("a")).map((link) =>
      link.getAttribute("href")
    );
    expect(defaultRunLinks).toEqual(
      expect.arrayContaining([
        "#main-perspectives",
        "#open-disagreements",
        "#answer-requirements",
        "#evidence-gaps"
      ])
    );
    expect(defaultRunLinks.some((href) => href?.includes("/sessions/session-1"))).toBe(false);
    expect(screen.getAllByText("Open disagreements").length).toBeGreaterThan(0);
    expect(screen.getByText("Strong options stay visible without collapsing into one hidden authority.")).toBeTruthy();
    expect(screen.getByText("How progress is tracked")).toBeTruthy();
    expect(screen.getByText("What this discussion status means")).toBeTruthy();
    expect(screen.getByText("Discussion progress")).toBeTruthy();
    expect(screen.getByText("Risks and missing evidence")).toBeTruthy();
    expect(screen.getByText("Evidence gap 1")).toBeTruthy();
    const defaultRunText = document.body.textContent ?? "";
    expect(defaultRunText).not.toContain("objection-1");
    expect(defaultRunText).not.toContain("quality-1");
    expect(defaultRunText).not.toContain("evidence-need-1");
    expect(defaultRunText).not.toContain("event-redacted");
    expect(defaultRunText).not.toContain("sealed_until_reveal");
    expect(defaultRunText).not.toContain("Adaptive primitive suggestions");
    expect(defaultRunText).not.toContain("Ledger trace");
    const detailPanelsText =
      document.querySelector('[aria-label="Discussion detail panels"]')?.textContent ?? "";
    expect((detailPanelsText.match(/Advanced \/ Developer Mode/g) ?? []).length).toBe(1);
    expect(detailPanelsText).not.toContain("Object id");
    expect(detailPanelsText).not.toContain("Proposal event");
    expect(detailPanelsText).not.toContain("Source events");
    const nextStepControls = getAdvancedModeSummaryByPanelText(
      "Adaptive primitive suggestions"
    ).closest("details");
    expect((nextStepControls as HTMLDetailsElement | null)?.open).toBe(false);
    fireEvent.click(getAdvancedModeSummaryByPanelText("Adaptive primitive suggestions"));
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
    fireEvent.click(getAdvancedModeSummaryByPanelText("Ledger trace"));
    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText("Run ledger timeline")).toBeTruthy();
    expect(screen.getByText("Event entries")).toBeTruthy();
    expect(screen.getByText(/topic_contract_published/)).toBeTruthy();
    expect(screen.getByText(/sealed_until_reveal/)).toBeTruthy();
    expect(screen.getAllByText("Main perspectives").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Candidate A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open disagreements").length).toBeGreaterThan(0);
    openAllClosedAdvancedModeDetails();
    expect((await screen.findAllByText(/objection-1/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Requirements this answer must satisfy").length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/quality-1/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Projection events").length).toBeGreaterThan(0);
    expect(client.listEvents).not.toHaveBeenCalled();
    expect(screen.getAllByText("Included as a strongest current option.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Still constrains the current conclusion.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs an answer before relying on the conclusion.").length).toBeGreaterThan(0);
  });

  it("shows action-specific feedback after guided discussion actions", async () => {
    const client = renderApp("/runs/run-1");

    expect(await screen.findByRole("button", { name: "Update conclusion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update conclusion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const latestUpdate = await screen.findByRole("region", {
      name: "Latest discussion update"
    });
    expect(latestUpdate).toBeTruthy();
    expect(latestUpdate.getAttribute("id")).toBe("latest-discussion-update");
    expect(latestUpdate.textContent ?? "").toContain("What just changed");
    expect(latestUpdate.textContent ?? "").toContain(
      "Review this result first, then return to the timeline, outputs, or current conclusion."
    );
    expect(await screen.findByText("Discussion update completed")).toBeTruthy();
    expect(
      screen.getByText(
        "The guided update ran with the current brief. Review the updated conclusion, disagreements, requirements, and evidence before relying on it."
      )
    ).toBeTruthy();
    const resultHandoff = screen.getByRole("region", { name: "Post-update review path" });
    expect(resultHandoff).toBeTruthy();
    expect(latestUpdate.contains(resultHandoff)).toBe(true);
    expect(resultHandoff.textContent ?? "").toContain("What to review next");
    expect(resultHandoff.textContent ?? "").toContain("Review updated timeline");
    expect(resultHandoff.textContent ?? "").toContain("Review discussion outputs");
    expect(resultHandoff.textContent ?? "").toContain("View current conclusion");
    const resultHandoffLinks = Array.from(resultHandoff.querySelectorAll("a")).map((link) =>
      link.getAttribute("href")
    );
    expect(resultHandoffLinks).toEqual(
      expect.arrayContaining([
        "#discussion-timeline",
        "#discussion-outputs",
        "/runs/run-1/outcome"
      ])
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask for stronger options" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Stronger options requested")).toBeTruthy();
    expect(
      screen.getByText(
        "The guided update ran so the strongest current options can be compared again before relying on the conclusion."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("event-2");
  });

  it("renders revealed participant responses as readable room activity", async () => {
    const runWithParticipants = {
      ...runDetail,
      plan: {
        ...runDetail.plan,
        participants: [
          {
            id: "participant-cli",
            displayName: "Perspective A"
          }
        ]
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: runWithParticipants
        })),
        getRunEvents: vi.fn(async () => ({
          runId: runDetail.runId,
          sessionId: runDetail.sessionId,
          events: [
            {
              id: "topic-event",
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
              id: "opened-event",
              type: "sealed_batch_opened",
              sequence: 1,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:01.000Z",
              payload: {
                participantIds: ["participant-cli"]
              },
              basedOnEventIds: ["topic-event"],
              trace: {}
            },
            {
              id: "contribution-event",
              type: "sealed_contribution_submitted",
              sequence: 2,
              visibility: "sealed",
              authorId: "participant-cli",
              createdAt: "2026-06-10T00:00:02.000Z",
              payload: {
                localPreset: true,
                label: "built-in sample contribution",
                position: "CLI-first validation exercises the lifecycle directly.",
                reason: "The revealed response should read like a participant contribution."
              },
              basedOnEventIds: ["opened-event"],
              trace: {}
            },
            {
              id: "revealed-event",
              type: "sealed_batch_revealed",
              sequence: 3,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:03.000Z",
              payload: {
                status: "revealed"
              },
              basedOnEventIds: ["opened-event", "contribution-event"],
              trace: {}
            },
            {
              id: "extraction-event",
              type: "extraction_proposed",
              sequence: 4,
              visibility: "public",
              authorId: "local-preset-extractor",
              createdAt: "2026-06-10T00:00:04.000Z",
              payload: {
                rationale: "Organized revealed responses into reviewable perspectives."
              },
              basedOnEventIds: ["contribution-event"],
              trace: {}
            }
          ]
        }))
      })
    );

    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    expect((await screen.findAllByText("Perspective A")).length).toBeGreaterThan(0);
    expect(screen.getByText("Discussion organizer")).toBeTruthy();
    expect(
      screen.getAllByText("CLI-first validation exercises the lifecycle directly.").length
    ).toBeGreaterThan(0);
    expect(screen.getByText("Participant first responses")).toBeTruthy();
    expect(screen.getByText("What participants said first")).toBeTruthy();
    expect(
      screen.getByText(
        "These are the separate first responses before the room organized options, disagreements, and evidence needs."
      )
    ).toBeTruthy();
    const participantResponsesText =
      document.querySelector(".du-room-response-wrap")?.textContent ?? "";
    expect(participantResponsesText).toContain("Perspective A");
    expect(participantResponsesText).toContain(
      "CLI-first validation exercises the lifecycle directly."
    );
    expect(participantResponsesText).not.toContain("Discussion organizer");
    expect(
      screen.queryByText("This participant response is available for review in the room.")
    ).toBeNull();
    expect(screen.getByText("Independent first responses revealed")).toBeTruthy();
    expect(screen.getByText("Main perspectives organized")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Conversation transcript" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Independent first response updates" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Main perspective and disagreement updates" })).toBeTruthy();
    expect(screen.getAllByText("Main perspectives and disagreements").length).toBeGreaterThan(0);
    expect(
      screen.getByText("The room organizes strongest options and keeps challenges visible.")
    ).toBeTruthy();
    expect(document.querySelector('.du-room-activity-item[data-speaker="room"]')).toBeTruthy();
    expect(
      document.querySelector('.du-room-activity-item[data-speaker="participant"]')
    ).toBeTruthy();
    expect(document.querySelectorAll(".du-room-activity-bubble").length).toBeGreaterThan(0);
    const roomText = document.querySelector(".du-room-layout")?.textContent ?? "";
    expect(roomText).not.toContain("contribution-event");
    expect(roomText).not.toContain("sealed_contribution_submitted");
    expect(roomText).not.toContain("extraction_proposed");
    expect(roomText).not.toContain("Local Preset Extractor");
    expect(roomText).not.toContain("local-preset-extractor");
  });

  it("localizes discussion room actor labels in Simplified Chinese", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRunEvents: vi.fn(async () => ({
          runId: runDetail.runId,
          sessionId: runDetail.sessionId,
          events: [
            {
              id: "topic-event",
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
              id: "contribution-event",
              type: "sealed_contribution_submitted",
              sequence: 1,
              visibility: "public",
              authorId: "local-preset-alpha",
              createdAt: "2026-06-10T00:00:01.000Z",
              payload: {
                position: "Use a reversible rollout."
              },
              basedOnEventIds: ["topic-event"],
              trace: {}
            },
            {
              id: "extraction-event",
              type: "extraction_proposed",
              sequence: 2,
              visibility: "public",
              authorId: "local-preset-extractor",
              createdAt: "2026-06-10T00:00:02.000Z",
              payload: {
                rationale: "Organized revealed responses into reviewable perspectives."
              },
              basedOnEventIds: ["contribution-event"],
              trace: {}
            }
          ]
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    expect((await screen.findAllByText("\u89c6\u89d2 A")).length).toBeGreaterThan(0);
    expect(screen.getByText("\u53c2\u4e0e\u8005\u521d\u59cb\u56de\u5e94")).toBeTruthy();
    expect(screen.getByText("\u53c2\u4e0e\u8005\u6700\u521d\u8bf4\u4e86\u4ec0\u4e48")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u7ec4\u7ec7\u8005")).toBeTruthy();
    const roomText = document.querySelector(".du-room-layout")?.textContent ?? "";
    expect(roomText).not.toContain("local-preset-alpha");
    expect(roomText).not.toContain("local-preset-extractor");
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

    fireEvent.click(await findAdvancedModeSummaryByPanelText("Adaptive primitive suggestions"));
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

    fireEvent.click(await findAdvancedModeSummaryByPanelText("Adaptive primitive suggestions"));
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

    fireEvent.click(await findAdvancedModeSummaryByPanelText("Adaptive primitive suggestions"));
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

    fireEvent.click(await findAdvancedModeSummaryByPanelText("Adaptive primitive suggestions"));
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

    fireEvent.click(await findAdvancedModeSummaryByPanelText("Ledger trace"));
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
    expect(await screen.findByText("Next: continue guided discussion")).toBeTruthy();
    expect(await screen.findByText("Collecting first perspectives")).toBeTruthy();
    expect(screen.getByText("Collect independent first responses")).toBeTruthy();
    expect(
      screen.getByText("Continue the discussion before comparing options or reviewing a conclusion.")
    ).toBeTruthy();
    expect(document.querySelector(".du-page-actions")?.textContent ?? "").toContain(
      "Continue discussion"
    );
    const primaryDiscussionActions = screen.getByRole("navigation", {
      name: "Primary discussion actions"
    });
    expect(primaryDiscussionActions.textContent ?? "").toContain("Continue discussion");
    expect(primaryDiscussionActions.textContent ?? "").not.toContain(
      "Review current conclusion"
    );
    const pendingActionPath = screen.getByRole("region", {
      name: "Recommended action path"
    });
    expect(pendingActionPath).toBeTruthy();
    expect(pendingActionPath.textContent ?? "").toContain("Continue discussion");
    expect(pendingActionPath.textContent ?? "").toContain("Review what changed");
    expect(pendingActionPath.textContent ?? "").toContain("Open current conclusion");
    expect(pendingActionPath.textContent ?? "").toContain(
      "Collect independent perspectives, strongest options, disagreements, evidence checks, risks, and a draft conclusion."
    );
    expect(
      (await screen.findAllByRole("status", { name: "Current conclusion not ready" })).length
    ).toBeGreaterThan(0);
    expect(screen.getByText("Continue the discussion before relying on a conclusion.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View current conclusion" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Current conclusion" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open conclusion" })).toBeNull();
    fireEvent.click(getUserDetailsSummaryByText("Discussion setup"));
    fireEvent.click(getAdvancedModeSummaryByPanelText("Discussion status details"));
    expect(await screen.findByText("1 recorded lifecycle event")).toBeTruthy();
    expect(screen.getAllByText("Not started yet").length).toBeGreaterThanOrEqual(4);
    expect(document.body.textContent ?? "").not.toContain("Not run yet");
    expect(screen.getByText("No work has been recorded for that part of the discussion.")).toBeTruthy();
  });

  it("starts a run from a JSON start request and renders readable step metadata", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: localPresetNotStartedRunDetail
        }))
      })
    );
    const startRequest = {
      extraction: {
        generatorIds: ["generator-1"]
      }
    };

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    expect(screen.getByText("Discussion actions")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask for stronger options" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review disagreements" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Confirm answer requirements" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Check evidence" })).toBeTruthy();
    expect(screen.getByText("Participant source")).toBeTruthy();
    expect(screen.getByText("Demo participant discussion")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue discussion uses built-in demo participants so the full flow works without provider setup."
      )
    ).toBeTruthy();
    const pendingDiscussionActionsText =
      document.querySelector(".du-discussion-actions")?.textContent ?? "";
    expect(pendingDiscussionActionsText).toContain("Updates discussion");
    expect(pendingDiscussionActionsText).toContain(
      "After it finishes, review the updated timeline and current conclusion."
    );
    expect(pendingDiscussionActionsText).toContain("Review only");
    expect(pendingDiscussionActionsText).toContain(
      "Jump only; this does not change the discussion."
    );
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced start request"));
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
    fireEvent.click(getAdvancedModeSummaryByPanelText("Raw stage metadata"));
    expect(await screen.findByText("Raw stage metadata")).toBeTruthy();
    expect(screen.getByText(/sealed_divergence/)).toBeTruthy();
    expect(screen.getByText(/event-2/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("do not render this result payload");
  });

  it("explains provider-backed discussion source without exposing provider internals", async () => {
    renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        }))
      })
    );

    expect(await screen.findByText("Model-backed discussion")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue discussion will ask configured model participants for the independent first responses."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Provider credentials stay in local daemon setup; Web does not show or store API keys."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("web-openai-compatible-discussion");
    expect(document.body.textContent ?? "").not.toContain("openai-compatible");
  });

  it("renders the discussion source summary in Simplified Chinese", async () => {
    renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    expect(await screen.findByText("\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByText("\u53c2\u4e0e\u8005\u6765\u6e90")).toBeTruthy();
    expect(
      screen.getByText(
        "\u7ee7\u7eed\u8ba8\u8bba\u65f6\uff0c\u5c06\u8bf7\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u751f\u6210\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002"
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("Model-backed discussion");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
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

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced start request"));
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

    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(await screen.findByText("Discussion steps completed")).toBeTruthy();
    expect((await screen.findAllByText("Projection refreshed after start")).length).toBeGreaterThan(
      0
    );
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

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

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
    expect(screen.getByRole("region", { name: "Conclusion review path" })).toBeTruthy();
    expect(screen.getByText("Before relying on this conclusion")).toBeTruthy();
    expect(screen.getByText("Read the recommendation")).toBeTruthy();
    expect(screen.getByText("Review open disagreements")).toBeTruthy();
    expect(screen.getByText("Check missing evidence")).toBeTruthy();
    expect(screen.getByText("Review risks and boundaries")).toBeTruthy();
    expect(screen.getByText("Confirm answer requirements")).toBeTruthy();
    expect(screen.getByText("Use next recommended actions")).toBeTruthy();
    expect(
      screen.getByText("Read the recommendation").closest("a")?.getAttribute("href")
    ).toBe("#current-recommendation");
    expect(
      screen.getByText("Review open disagreements").closest("a")?.getAttribute("href")
    ).toBe("#open-disagreements");
    expect(
      screen.getByText("Check missing evidence").closest("a")?.getAttribute("href")
    ).toBe("#missing-evidence");
    expect(
      screen.getByText("Review risks and boundaries").closest("a")?.getAttribute("href")
    ).toBe("#risks-and-boundaries");
    expect(
      screen.getByText("Confirm answer requirements").closest("a")?.getAttribute("href")
    ).toBe("#answer-requirements");
    expect(
      screen.getByText("Use next recommended actions").closest("a")?.getAttribute("href")
    ).toBe("#next-recommended-actions");
    expect(document.getElementById("current-recommendation")).toBeTruthy();
    expect(document.getElementById("open-disagreements")).toBeTruthy();
    expect(document.getElementById("missing-evidence")).toBeTruthy();
    expect(document.getElementById("risks-and-boundaries")).toBeTruthy();
    expect(document.getElementById("answer-requirements")).toBeTruthy();
    expect(document.getElementById("next-recommended-actions")).toBeTruthy();
    expect(screen.getByText("Explored option listed")).toBeTruthy();
    expect(screen.getByText("Disagreement still open")).toBeTruthy();
    expect(screen.getByText("Risks or boundaries listed")).toBeTruthy();
    expect(screen.getByText("1 open disagreement needs review")).toBeTruthy();
    expect(screen.getByText("1 of 1 evidence gap needs verification")).toBeTruthy();
    expect(screen.getByText("2 risks or boundaries to review")).toBeTruthy();
    expect(screen.getByText("1 answer requirement needs confirmation")).toBeTruthy();
    expect(screen.getByText("1 recommended next action")).toBeTruthy();
    expect(screen.getAllByText("Open disagreements").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing evidence").length).toBeGreaterThan(0);
    expect(screen.getByText("Does the fixture cover all declared dimensions?")).toBeTruthy();
    expect(screen.getByText("Keep open disagreements visible in the current conclusion.")).toBeTruthy();
    expect(screen.getAllByText("Risks and boundaries").length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence coverage may still be incomplete.")).toBeTruthy();
    expect(screen.getByText("Needs further audit")).toBeTruthy();
    expect(screen.getByText("Requirements this answer must satisfy")).toBeTruthy();
    expect(screen.getAllByText(/Provisional compiled material/).length).toBeGreaterThan(0);
    const defaultPageText = document.body.textContent ?? "";
    expect(defaultPageText).not.toContain("Draft status");
    expect(defaultPageText).not.toContain("Raw outcome material");
    expect(defaultPageText).not.toContain("candidate-2");
    expect(defaultPageText).not.toContain("objection-1");
    expect(defaultPageText).not.toContain("obligation-1");
    expect(defaultPageText).not.toContain("evidence-1");
    expect(defaultPageText).not.toContain("final-audit-event-1");

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
      })),
      getObjections: vi.fn(async () => ({
        objections: [
          {
            object: {
              id: "objection-context-1",
              failureMode: "Users could mistake sample material for live deliberation.",
              consequence: "The conclusion should label deterministic sample output before use.",
              status: "open"
            },
            proposalEventId: "proposal-event-1"
          }
        ],
        projection
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
    expect(readableConclusion).toContain("Perspective visible");
    expect(readableConclusion).not.toContain("11 visible perspective listed");
    expect(readableConclusion).toContain(
      "Users could mistake sample material for live deliberation."
    );
    expect(readableConclusion).toContain(
      "The conclusion should label deterministic sample output before use."
    );
    expect(readableConclusion).toContain("Requirement 1");
    expect(readableConclusion).toContain("Missing evidence 1");
    expect(readableConclusion).toContain("No unresolved questions listed");
    expect(readableConclusion).toContain("No risks or boundaries listed");
    expect(readableConclusion).toContain("No next recommended actions listed");
    expect(readableConclusion).toContain("Before relying on this conclusion");
    expect(readableConclusion).toContain("1 open disagreement needs review");
    expect(readableConclusion).toContain("1 of 1 evidence gap needs verification");
    expect(readableConclusion).toContain("No next recommended actions are listed yet.");
    expect(readableConclusion).not.toContain("candidate-1");
    expect(readableConclusion).not.toContain("objection-1");
    expect(readableConclusion).not.toContain("objection-context-1");
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
    expect(readableConclusion).toContain("Perspective visible");
    expect(readableConclusion).not.toContain("11 visible perspective listed");
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

    fireEvent.click(getAdvancedModeSummary());
    expect((await screen.findAllByText(/evidence-need-1/)).length).toBeGreaterThan(0);
    fireEvent.click(getAdvancedModeSummary(1));
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
