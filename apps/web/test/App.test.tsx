import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import {
  clearOpenAICompatibleProviderVerified,
  markOpenAICompatibleProviderVerified
} from "../src/openai-compatible-verification";
import { buildProviderBackedDiscussionRunPlan } from "../src/run-presets";

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
      "Use configured model-backed participants from the local service.",
      "Keep provider credentials saved locally and out of the discussion."
    ],
    participants: [
      {
        id: "provider-perspective-a",
        kind: "model",
        displayName: "Perspective A",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      },
      {
        id: "provider-perspective-b",
        kind: "model",
        displayName: "Perspective B",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      }
    ],
    providerConfigs: [
      {
        id: "openai-main",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main",
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
          id: "http-template",
          name: "HTTP-template",
          enabled: false,
          status: "needs_configuration",
          components: [
            {
              id: "http-template",
              kind: "participant_adapter",
              enabled: false
            }
          ],
          setup: {
            enableEnvVar: "DELIBERUM_ENABLE_HTTP_TEMPLATE_PROFILE",
            envVars: [
              {
                name: "DELIBERUM_HTTP_TEMPLATE_URL",
                configured: false,
                secret: false,
                required: true,
                purpose: "Required HTTP template endpoint URL."
              }
            ],
            missingRecommendedEnvVars: ["DELIBERUM_HTTP_TEMPLATE_URL"],
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
    saveOpenAICompatibleSetup: vi.fn(async () => ({
      profileId: "openai-compatible",
      status: "saved",
      managedEnvFile: "local-daemon-env",
      configuredFields: ["apiKey", "baseUrl", "model", "structuredReview"],
      restartRequired: false,
      activeInCurrentDaemon: true,
      safety: ["The setup was applied to the current local daemon process."]
    })),
    verifyOpenAICompatibleSetup: vi.fn(async () => ({
      profileId: "openai-compatible",
      status: "connected",
      checked: "provider_chat_completion",
      safety: ["Provider credentials and provider response text are not returned to Web."]
    })),
    getOpenAICompatibleRoleModelDefaults: vi.fn(async () => ({
      profileId: "openai-compatible",
      status: "empty",
      safety: [
        "Role model defaults contain non-secret model choices only.",
        "Provider API keys, base URLs, and provider config ids are not returned."
      ]
    })),
    saveOpenAICompatibleRoleModelDefaults: vi.fn(async () => ({
      profileId: "openai-compatible",
      status: "saved",
      managedEnvFile: "local-daemon-env",
      configuredFields: ["perspectiveCount", "customPerspectiveModelsEnabled"],
      restartRequired: false,
      activeInCurrentDaemon: true,
      safety: ["Only non-secret model role choices are stored."]
    })),
    clearOpenAICompatibleRoleModelDefaults: vi.fn(async () => ({
      profileId: "openai-compatible",
      status: "cleared",
      managedEnvFile: "local-daemon-env",
      configuredFields: [],
      restartRequired: false,
      activeInCurrentDaemon: true,
      safety: ["Only non-secret model role choices are stored."]
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
            reason:
              "The rollout needs browser evidence that users can review missing evidence before relying on the conclusion.",
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

function createReadyOpenAISetupProfiles() {
  return {
    profiles: [
      {
        id: "openai-compatible",
        name: "OpenAI-compatible",
        enabled: true,
        status: "ready" as const,
        components: [],
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
              purpose: "Default provider model."
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

function getWorkspaceNavigationText() {
  const navigation = document.querySelector(".du-sidebar .du-nav");
  expect(navigation).toBeTruthy();

  return navigation?.textContent ?? "";
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
    "src/local-service-setup.tsx",
    "src/openai-compatible-verification.ts",
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
  clearOpenAICompatibleProviderVerified();
  window.localStorage.clear();
  MockEventSource.instances = [];
});

describe("@deliberum/web shell", () => {
  it("resolves daemon URL from explicit development env or local default", () => {
    expect(resolveDaemonBaseUrl({})).toBe("http://127.0.0.1:3877");
    expect(resolveDaemonBaseUrl({ PROD: true }, "http://127.0.0.1:3999")).toBe(
      "http://127.0.0.1:3999"
    );
    expect(resolveDaemonBaseUrl({ DEV: true }, "http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:3877"
    );
    expect(
      resolveDaemonBaseUrl({
        PROD: true,
        VITE_DELIBERUM_DAEMON_URL: " http://127.0.0.1:4888 "
      }, "http://127.0.0.1:3999")
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

    expect(
      await screen.findByRole("heading", {
        name: "Multi-perspective deliberation for better decisions"
      })
    ).toBeTruthy();
    const homeNavigation = getWorkspaceNavigationText();
    expect(homeNavigation).toContain("Home / Today");
    expect(homeNavigation).toContain("Setup / Models");
    expect(homeNavigation).toContain("Discussions");
    expect(homeNavigation).toContain("Advanced");
    expect(homeNavigation).not.toContain("Start discussion");
    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    expect(screen.getByText("Ready to use Deliberum")).toBeTruthy();
    expect((await screen.findAllByText("Local service connected")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Demo discussion ready")).toBeTruthy();
    expect(await screen.findByText("1 existing discussion")).toBeTruthy();
    expect(screen.getByText("Recommended next step")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Start demo discussion" }).length).toBeGreaterThan(0);
    expect(screen.getByText("What you can do")).toBeTruthy();
    expect(screen.getByText("What the discussion keeps visible")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Advanced" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Advanced" }).getAttribute("href")).toBe("/advanced");
    expect(document.body.textContent ?? "").not.toContain("Topic Contract");
    expect(document.body.textContent ?? "").not.toContain("concept mapping");
    expect(document.body.textContent ?? "").not.toContain("Runtime, daemon, resource");
    expect(document.body.textContent ?? "").not.toContain("raw session ids");
    expect(document.body.textContent ?? "").not.toContain("Open by session id");
    expect(document.body.textContent ?? "").not.toContain("Underlying session catalog");
    expect(document.body.textContent ?? "").not.toContain("Runtime profiles");
    expect(document.body.textContent ?? "").not.toContain("Operation audit");
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

    cleanup();

    renderApp("/advanced", client);
    expect(
      await screen.findByRole("heading", {
        name: "Advanced / Developer Mode"
      })
    ).toBeTruthy();
    expect(await screen.findByText("Core concept mapping")).toBeTruthy();
    expect(screen.getByText("Topic Contract")).toBeTruthy();
    expect(await screen.findByText("Open by session id")).toBeTruthy();
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
    const runNavigation = getWorkspaceNavigationText();
    expect(runNavigation).toContain("Home / Today");
    expect(runNavigation).toContain("Setup / Models");
    expect(runNavigation).toContain("Discussions");
    expect(runNavigation).toContain("Discussion Room");
    expect(runNavigation).toContain("Current conclusion");
    expect(runNavigation).toContain("Advanced");
    expect(runNavigation).not.toContain("Start discussion");

    cleanup();

    const advancedClient = renderApp("/advanced");
    expect(
      await screen.findByRole("heading", {
        name: "Advanced / Developer Mode"
      })
    ).toBeTruthy();
    expect(await screen.findByText("Underlying session catalog")).toBeTruthy();
    await waitFor(() => expect(advancedClient.listSessions).toHaveBeenCalled());
    expect(screen.getAllByText("Session id").length).toBeGreaterThan(1);
    expect(screen.getByText("session-1")).toBeTruthy();
    expect(screen.getByText("7 updates")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open session view" })).toBeTruthy();
  });

  it("renders setup and model readiness as a default user path", async () => {
    const client = renderApp("/");

    expect((await screen.findAllByText("Setup / Models")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open Setup / Models" }).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect((await screen.findAllByText("Local service connected")).length).toBeGreaterThan(0);
    expect(screen.getByText("Model providers")).toBeTruthy();
    expect(
      screen.getByText(
        "A provider is enabled, but model details still need Web setup or per-discussion model settings."
      )
    ).toBeTruthy();
    expect(screen.getByText("Ready for demo discussions")).toBeTruthy();
    expect(screen.getByText("Provider enabled; add model details")).toBeTruthy();
    expect(screen.queryByText("Configuration required")).toBeNull();
    expect(screen.getByText("First-use path")).toBeTruthy();
    expect(screen.getByText("From setup to discussion room")).toBeTruthy();
    expect(
      screen.getByText(
        "Follow the shortest usable path: connect the local service, confirm model and participant readiness, then start the discussion room."
      )
    ).toBeTruthy();
    expect(screen.getByText("Step 1")).toBeTruthy();
    expect(screen.getByText("Step 2")).toBeTruthy();
    expect(screen.getByText("Step 3")).toBeTruthy();
    expect(screen.getByText("Step 4")).toBeTruthy();
    expect(screen.getAllByText("Local service connected").length).toBeGreaterThan(0);
    expect(screen.getByText("Demo ready, model setup still needed")).toBeTruthy();
    expect(screen.getByText("Demo room roles ready")).toBeTruthy();
    expect(screen.getAllByText("Start demo discussion").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Open the discussion room with built-in demo participants."
      )
    ).toBeTruthy();
    expect(screen.getByText("Configure provider locally")).toBeTruthy();
    expect(screen.getByText("How Web setup works locally")).toBeTruthy();
    expect(
      screen.getByText(
        "Web saves provider setup to the local service configuration and applies it to the current local service when possible."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_BASE_URL");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_MCP_TOOL_URL");

    cleanup();

    renderApp("/advanced", client);
    expect(await screen.findByText("Runtime profiles")).toBeTruthy();
    expect(await screen.findByText("DELIBERUM_OPENAI_API_KEY")).toBeTruthy();
  });

  it("localizes landing setup readiness in Simplified Chinese", async () => {
    renderApp("/", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect(
      await screen.findByRole("heading", {
        name: "\u7528\u591a\u89c6\u89d2\u5ba1\u8bae\u505a\u51fa\u66f4\u597d\u51b3\u7b56"
      })
    ).toBeTruthy();
    const navigation = getWorkspaceNavigationText();
    expect(navigation).toContain("\u9996\u9875 / \u4eca\u65e5");
    expect(navigation).toContain("\u8bbe\u7f6e / \u6a21\u578b");
    expect(navigation).toContain("\u8ba8\u8bba");
    expect(navigation).toContain("\u9ad8\u7ea7");
    expect(navigation).not.toContain("Home / Today");
    expect(navigation).not.toContain("Advanced");
    expect((await screen.findAllByText("\u6a21\u578b\u8bbe\u7f6e")).length).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText("\u5f00\u59cb\u6f14\u793a\u8ba8\u8bba")).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Model setup")).toBeNull();
    expect(screen.queryByText("Start a demo discussion")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
  });

  it("recommends a model-backed start from the landing readiness overview when a provider is ready", async () => {
    markOpenAICompatibleProviderVerified();
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue({
      profiles: [
        {
          id: "local-preset",
          name: "Local preset",
          enabled: true,
          status: "ready",
          components: [],
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
            missingRecommendedEnvVars: [],
            notes: []
          },
          boundaries: []
        }
      ]
    });

    renderApp("/", client);

    expect(await screen.findByText("Ready to use Deliberum")).toBeTruthy();
    expect(await screen.findByText("Real model provider ready")).toBeTruthy();
    const modelBackedStartLinks = await screen.findAllByRole("link", {
      name: "Start model-backed discussion"
    });
    expect(modelBackedStartLinks.length).toBeGreaterThan(0);
    expect(
      modelBackedStartLinks.some((link) =>
        (link as HTMLAnchorElement).href.includes("participants=model-backed")
      )
    ).toBe(true);
    expect(
      screen.getByText("Use configured model participants for the next discussion.")
    ).toBeTruthy();
    expect(screen.getByText("First-use path")).toBeTruthy();
    expect(screen.getByText("Model provider ready")).toBeTruthy();
    expect(screen.getByText("Participants and review roles ready")).toBeTruthy();
    expect(screen.getByText("Start the real discussion")).toBeTruthy();
    expect(
      screen.getByText(
        "Open the discussion room with configured model participants selected."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("who will organize the result");
  });

  it("requires provider verification before recommending a model-backed landing start", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue({
      profiles: [
        {
          id: "local-preset",
          name: "Local preset",
          enabled: true,
          status: "ready",
          components: [],
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
            missingRecommendedEnvVars: [],
            notes: []
          },
          boundaries: []
        }
      ]
    });

    renderApp("/", client);

    expect(await screen.findByText("Ready to use Deliberum")).toBeTruthy();
    expect(await screen.findByText("Verify model provider")).toBeTruthy();
    expect(
      screen.getByText(
        "A model provider is saved locally; verify the connection before starting real model-backed discussions."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Start demo discussion").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Start model-backed discussion" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
  });

  it("shows the local start command on landing when the local service is unavailable", async () => {
    const client = createClient({
      getRuntimeProfiles: vi.fn(async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3877");
      })
    });

    renderApp("/", client);

    expect((await screen.findAllByText("Start the local service")).length).toBeGreaterThan(0);
    expect(
      (
        await screen.findAllByText(
          "Web cannot read setup or discussions until the local Deliberum service is running."
        )
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByText("Local service command")).toBeTruthy();
    expect(
      screen.getByText(
        "corepack pnpm build && corepack pnpm start:local"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This starts the local Web and service; model API keys are added from Web after it connects."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "After the service responds, open Setup / Models to add the provider API key, base URL, and model."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("ECONNREFUSED");
    expect(document.body.textContent ?? "").not.toContain("127.0.0.1:3877");
  });

  it("opens setup and models as a top-level user path", async () => {
    const client = renderApp("/setup/models");

    expect(await screen.findByRole("heading", { name: "Setup / Models" })).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("Model setup status")).toBeTruthy();
    expect(await screen.findByText("Local service connected")).toBeTruthy();
    expect(screen.getByText("Model providers")).toBeTruthy();
    expect(screen.getByText("Configure provider locally")).toBeTruthy();
    expect(screen.getByText("Discussion readiness")).toBeTruthy();
    expect(screen.getByText("What can run now")).toBeTruthy();
    expect(screen.getAllByText("Demo walkthrough").length).toBeGreaterThan(0);
    expect(screen.getByText("Model participants")).toBeTruthy();
    expect(screen.getAllByText("Setup needed").length).toBeGreaterThan(0);
    expect(screen.getByText("Review roles and conclusion")).toBeTruthy();
    expect(screen.getByText("Try a demo discussion")).toBeTruthy();
    expect(screen.getByText("Participant management")).toBeTruthy();
    expect(screen.getByText("Discussion participants")).toBeTruthy();
    expect(screen.getByText("Model assignment")).toBeTruthy();
    expect(screen.getByText("Demo roles only")).toBeTruthy();
    expect(
      screen.getByText(
        "Demo discussions use built-in material. Add and verify a provider before model-backed roles are available."
      )
    ).toBeTruthy();
    expect(screen.getByText("Choose discussion depth")).toBeTruthy();
    expect(
      screen.getByText(
        "Start a demo discussion now, or finish model setup to choose focused or broader model-backed review."
      )
    ).toBeTruthy();
    expect(screen.getByText("Current limit")).toBeTruthy();
    expect(
      screen.getByText(
        "Add and verify a provider before assigning first-response and review role models on the start page."
      )
    ).toBeTruthy();
    expect(screen.getByRole("group", { name: "Role assignment controls" })).toBeTruthy();
    expect(screen.getByText("Shared provider setup")).toBeTruthy();
    expect(screen.getByText("One provider for all model roles")).toBeTruthy();
    expect(screen.getByText("No saved role defaults")).toBeTruthy();
    expect(
      screen.getByText(
        "Save a default role setup from the start page, then Setup / Models will show which discussion depth and role models are ready for future discussions."
      )
    ).toBeTruthy();
    expect(screen.getByText("Discussion depth")).toBeTruthy();
    expect(screen.getByText("Not saved yet")).toBeTruthy();
    expect(screen.getByText("Provider setup model")).toBeTruthy();
    expect(screen.getByText("Who joins the discussion")).toBeTruthy();
    expect(screen.getByText("First responses")).toBeTruthy();
    expect(
      screen.getByText("Perspective A and Perspective B use built-in demo material.")
    ).toBeTruthy();
    expect(
      screen.getByText("Use the demo now or add a provider for real model responses.")
    ).toBeTruthy();
    expect(screen.getByText("Broader review")).toBeTruthy();
    expect(
      screen.getByText("Add a provider to unlock Perspective C and real model-backed broader review.")
    ).toBeTruthy();
    expect(screen.getByText("Disagreement and evidence review")).toBeTruthy();
    expect(
      screen.getByText("Reviewer, Evidence checker, and Risk reviewer use the local review flow.")
    ).toBeTruthy();
    expect(screen.getByText("Conclusion and next actions")).toBeTruthy();
    expect(screen.getAllByText("Uses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Next action").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Demo ready").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Built-in demo participant").length).toBeGreaterThan(1);
    expect(screen.getByText("Broader review after model setup")).toBeTruthy();
    expect(screen.getAllByText("Local review roles").length).toBeGreaterThan(1);
    expect(document.body.textContent ?? "").not.toContain("local organizer");
    expect(screen.getByText("Perspective C")).toBeTruthy();
    expect(screen.getByText("Reviewer")).toBeTruthy();
    expect(screen.getByText("Evidence checker")).toBeTruthy();
    expect(screen.getByText("Conclusion writer")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Add model setup" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Provider setup checklist")).toBeTruthy();
    expect(screen.getByText("Configure OpenAI-compatible provider")).toBeTruthy();
    expect(screen.getByText("Current model setup")).toBeTruthy();
    expect(screen.getByText("Model management")).toBeTruthy();
    expect(screen.getAllByText("Finish setup in Web").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Add or replace the API key, base URL, and model below. Saved secrets stay on this machine and are not displayed again."
      )
    ).toBeTruthy();
    const currentModelSetupItems = [
      ...document.querySelectorAll(".du-current-model-setup-item")
    ].map((item) => item.textContent ?? "");
    expect(currentModelSetupItems).toContain(
      "API keySaved locallySaved without showing the value."
    );
    expect(currentModelSetupItems).toContain("Base URLRequiredEnter this in the form below.");
    expect(currentModelSetupItems).toContain("ModelRequiredEnter this in the form below.");
    expect(screen.getByText("Needs saved setup")).toBeTruthy();
    expect(
      screen.getByText(
        "Web shows only readiness here. It never displays saved API keys, base URLs, or exact model values in the default view."
      )
    ).toBeTruthy();
    expect(screen.getByLabelText("Provider API key")).toBeTruthy();
    expect(screen.getByText("Structured review compatibility")).toBeTruthy();
    expect(
      screen.getByText(
        "Recommended for real providers so Deliberum can organize options, disagreements, evidence gaps, risks, conclusions, and next actions more reliably."
      )
    ).toBeTruthy();
    expect(
      (screen.getByLabelText(/Structured review compatibility/) as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Save model setup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check readiness" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Verify connection" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText("Real provider setup")).toBeTruthy();
    expect(screen.getAllByText("API key").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Configured locally").length).toBeGreaterThan(0);
    expect(screen.getByText("Base URL needed")).toBeTruthy();
    expect(screen.getByText("Model needed")).toBeTruthy();
    expect(screen.getByText("Verify after setup")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "View setup steps" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Start a discussion" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Continue discussions" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Setup / Models" })).toBeTruthy();
    expect(screen.queryByText("HTTP-template")).toBeNull();
    expect(screen.queryByText("MCP tool")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_HTTP_TEMPLATE_URL");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_MCP_TOOL_URL");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_BASE_URL");

    fireEvent.change(screen.getByLabelText("Provider API key"), {
      target: {
        value: "sk-web-setup-secret"
      }
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: {
        value: "https://api.example.test/v1"
      }
    });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: {
        value: "web-setup-model"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save model setup" }));
    await waitFor(() =>
      expect(client.saveOpenAICompatibleSetup).toHaveBeenCalledWith({
        apiKey: "sk-web-setup-secret",
        baseUrl: "https://api.example.test/v1",
        model: "web-setup-model",
        structuredReview: true
      })
    );
    expect(await screen.findByText("Model setup saved locally")).toBeTruthy();
    expect(
      screen.getByText(
        "The current local service can use this setup now. Check readiness, verify connection, then start a real model-backed discussion."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Ready to verify").length).toBeGreaterThan(0);
    expect(screen.getByText("Saved in this session")).toBeTruthy();
    expect(
      screen.getByText(
        "The local service accepted this setup. Verify the connection before relying on it for a discussion."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Saved locally").length).toBeGreaterThan(2);
    expect(screen.getAllByText("Ready to verify").length).toBeGreaterThan(0);
    expect(screen.getByText("Setup path")).toBeTruthy();
    expect(screen.getByText("Verify the provider before starting")).toBeTruthy();
    expect(
      screen.getByText(
        "The saved setup is active in this local service. Verification sends one minimal request so you can catch key, base URL, or model problems before the discussion."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Start model-backed discussion" })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Verify connection" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect((screen.getByLabelText("Provider API key") as HTMLInputElement).value).toBe("");
    expect(document.body.textContent ?? "").not.toContain("sk-web-setup-secret");

    fireEvent.click(screen.getByRole("button", { name: "Verify connection" }));
    await waitFor(() => expect(client.verifyOpenAICompatibleSetup).toHaveBeenCalled());
    expect(await screen.findByText("Provider connection verified")).toBeTruthy();
    const verifiedModelBackedStartLinks = screen.getAllByRole("link", {
      name: "Start model-backed discussion"
    });
    expect(verifiedModelBackedStartLinks.length).toBeGreaterThan(1);
    expect(
      verifiedModelBackedStartLinks.every((link) =>
        (link as HTMLAnchorElement).href.includes("participants=model-backed")
      )
    ).toBe(true);

    fireEvent.click(getAdvancedModeSummaryByPanelText("Setup diagnostics"));
    expect(await screen.findByText("Runtime profile setup details")).toBeTruthy();
    expect(screen.getByText("HTTP-template")).toBeTruthy();
    expect(screen.getByText("MCP tool")).toBeTruthy();
    expect(screen.getByText("DELIBERUM_HTTP_TEMPLATE_URL")).toBeTruthy();
    expect(screen.getByText("DELIBERUM_MCP_TOOL_URL, DELIBERUM_MCP_TOOL_NAME")).toBeTruthy();
    expect(screen.getByText("DELIBERUM_OPENAI_API_KEY")).toBeTruthy();
  });

  it("localizes structured review setup in Simplified Chinese", async () => {
    renderApp("/setup/models", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect(
      await screen.findByRole("heading", { name: "\u8bbe\u7f6e / \u6a21\u578b" })
    ).toBeTruthy();
    expect(
      await screen.findByText("\u7ed3\u6784\u5316\u5ba1\u8bae\u517c\u5bb9\u6027")
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "\u5efa\u8bae\u771f\u5b9e\u63d0\u4f9b\u65b9\u542f\u7528\uff0c\u8ba9 Deliberum \u66f4\u7a33\u5b9a\u5730\u6574\u7406\u9009\u9879\u3001\u5206\u6b67\u3001\u8bc1\u636e\u7f3a\u53e3\u3001\u98ce\u9669\u3001\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u3002"
      )
    ).toBeTruthy();
    expect(screen.queryByText("Structured review compatibility")).toBeNull();
  });

  it("walks model-backed setup through discussion review without default internals", async () => {
    const completedProviderRunDetail = {
      ...providerBackedRunDetail,
      status: "completed",
      sealedDivergenceStatus: "completed",
      latestExtractionStatus: "completed",
      latestProposalReviewStatus: "completed",
      latestFinalizationStatus: "completed",
      ledger: {
        eventCount: 9
      }
    };
    const modelReadyProfiles = [
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
          },
          {
            id: "openai-compatible-extractor",
            kind: "extraction_generator",
            enabled: true
          },
          {
            id: "openai-compatible-reviewer",
            kind: "proposal_reviewer",
            enabled: true
          },
          {
            id: "openai-compatible-final-candidate",
            kind: "final_candidate_generator",
            enabled: true
          },
          {
            id: "openai-compatible-final-auditor",
            kind: "final_auditor",
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
            }
          ],
          missingRecommendedEnvVars: [],
          notes: []
        },
        boundaries: []
      }
    ];
    const initialRunEvents = [
      {
        id: "product-loop-topic-event",
        type: "topic_contract_published",
        sequence: 0,
        visibility: "public",
        authorId: "system",
        createdAt: "2026-06-15T00:00:00.000Z",
        payload: {
          topic: "Should we use the configured provider for this product loop?"
        },
        basedOnEventIds: [],
        trace: {}
      }
    ];
    const completedRunEvents = [
      ...initialRunEvents,
      {
        id: "product-loop-opened-event",
        type: "sealed_batch_opened",
        sequence: 1,
        visibility: "public",
        authorId: "system",
        createdAt: "2026-06-15T00:00:01.000Z",
        payload: {
          participantIds: ["provider-perspective-a", "provider-perspective-b"]
        },
        basedOnEventIds: ["product-loop-topic-event"],
        trace: {}
      },
      {
        id: "product-loop-perspective-a-event",
        type: "sealed_contribution_submitted",
        sequence: 2,
        visibility: "sealed",
        authorId: "provider-perspective-a",
        createdAt: "2026-06-15T00:00:02.000Z",
        payload: {
          position:
            "Use the configured provider only after verification and visible review material are ready."
        },
        basedOnEventIds: ["product-loop-opened-event"],
        trace: {}
      },
      {
        id: "product-loop-perspective-b-event",
        type: "sealed_contribution_submitted",
        sequence: 3,
        visibility: "sealed",
        authorId: "provider-perspective-b",
        createdAt: "2026-06-15T00:00:03.000Z",
        payload: {
          position:
            "Keep demo fallback visible until real provider discussions can be reviewed end to end."
        },
        basedOnEventIds: ["product-loop-opened-event"],
        trace: {}
      },
      {
        id: "product-loop-revealed-event",
        type: "sealed_batch_revealed",
        sequence: 4,
        visibility: "public",
        authorId: "system",
        createdAt: "2026-06-15T00:00:04.000Z",
        payload: {
          status: "revealed"
        },
        basedOnEventIds: [
          "product-loop-opened-event",
          "product-loop-perspective-a-event",
          "product-loop-perspective-b-event"
        ],
        trace: {}
      },
      {
        id: "product-loop-extraction-event",
        type: "extraction_proposed",
        sequence: 5,
        visibility: "public",
        authorId: "openai-compatible-extractor",
        createdAt: "2026-06-15T00:00:05.000Z",
        payload: {
          rationale:
            "Organized provider-backed responses into strongest options, disagreements, requirements, and evidence gaps."
        },
        basedOnEventIds: ["product-loop-perspective-a-event", "product-loop-perspective-b-event"],
        trace: {}
      },
      {
        id: "product-loop-review-event",
        type: "proposal_accepted",
        sequence: 6,
        visibility: "public",
        authorId: "openai-compatible-reviewer",
        createdAt: "2026-06-15T00:00:06.000Z",
        payload: {
          rationale:
            "Accepted the review material so the room can show options, open disagreements, and requirements."
        },
        basedOnEventIds: ["product-loop-extraction-event"],
        trace: {}
      },
      {
        id: "product-loop-final-event",
        type: "final_candidate_proposed",
        sequence: 7,
        visibility: "public",
        authorId: "openai-compatible-final-candidate",
        createdAt: "2026-06-15T00:00:07.000Z",
        payload: {
          recommendation:
            "Proceed only after the user reviews the visible conclusion, disagreements, evidence, risks, and next actions."
        },
        basedOnEventIds: ["product-loop-review-event"],
        trace: {}
      },
      {
        id: "product-loop-audit-event",
        type: "final_audit_recorded",
        sequence: 8,
        visibility: "public",
        authorId: "openai-compatible-final-auditor",
        createdAt: "2026-06-15T00:00:08.000Z",
        payload: {
          summary: "Provider-backed conclusions remain provisional until risks are reviewed."
        },
        basedOnEventIds: ["product-loop-final-event"],
        trace: {}
      }
    ];
    let discussionStarted = false;
    const emptyProjection = {
      ...projection,
      eventIds: ["product-loop-topic-event"]
    };
    const client = createClient({
      getRuntimeProfiles: vi.fn(async () => ({
        profiles: modelReadyProfiles
      })),
      createRun: vi.fn(async (input) => ({
        run: providerBackedRunDetail,
        session: {
          sessionId: providerBackedRunDetail.sessionId
        },
        event: {
          id: "product-loop-topic-event",
          type: "topic_contract_published",
          payload: input.runPlan
        }
      })),
      getRun: vi.fn(async () => ({
        run: discussionStarted ? completedProviderRunDetail : providerBackedRunDetail
      })),
      getRunEvents: vi.fn(async () => ({
        runId: providerBackedRunDetail.runId,
        sessionId: providerBackedRunDetail.sessionId,
        events: discussionStarted ? completedRunEvents : initialRunEvents
      })),
      startRun: vi.fn(async () => {
        discussionStarted = true;

        return {
          run: completedProviderRunDetail,
          stages: [
            {
              stage: "sealed_divergence",
              executionStatus: "executed",
              roundId: "product-loop-sealed-round",
              status: "completed",
              eventIds: [
                "product-loop-opened-event",
                "product-loop-perspective-a-event",
                "product-loop-perspective-b-event"
              ],
              result: {}
            },
            {
              stage: "extraction",
              executionStatus: "executed",
              roundId: "product-loop-extraction-round",
              status: "completed",
              eventIds: ["product-loop-extraction-event"],
              result: {}
            },
            {
              stage: "proposal_review",
              executionStatus: "executed",
              roundId: "product-loop-review-round",
              status: "completed",
              eventIds: ["product-loop-review-event"],
              result: {}
            },
            {
              stage: "finalization",
              executionStatus: "executed",
              roundId: "product-loop-final-round",
              status: "completed",
              eventIds: ["product-loop-final-event", "product-loop-audit-event"],
              result: {}
            }
          ],
          stopped: false
        };
      }),
      getFrontier: vi.fn(async () =>
        discussionStarted
          ? {
              basis: "accepted_active_candidates",
              candidates: [
                {
                  object: {
                    id: "product-loop-candidate",
                    title: "Use the verified provider for reviewable discussions",
                    status: "accepted_active"
                  },
                  proposalEventId: "product-loop-extraction-event",
                  sourceEventIds: ["product-loop-review-event"]
                }
              ],
              projection
            }
          : {
              basis: "accepted_active_candidates",
              candidates: [],
              projection: emptyProjection
            }
      ),
      getObjections: vi.fn(async () =>
        discussionStarted
          ? {
              objections: [
                {
                  object: {
                    id: "product-loop-objection",
                    summary:
                      "Provider-backed results still need a visible evidence review before users rely on them.",
                    status: "open"
                  },
                  proposalEventId: "product-loop-review-event"
                }
              ],
              projection
            }
          : {
              objections: [],
              projection: emptyProjection
            }
      ),
      getSessionResources: vi.fn(async () =>
        discussionStarted
          ? {
              sessionId: providerBackedRunDetail.sessionId,
              source: {
                kind: "run_plan",
                runId: providerBackedRunDetail.runId
              },
              plannedResources: [],
              deliveryAudits: [],
              accessAudits: [],
              evidenceNeeds: [
                {
                  object: {
                    id: "product-loop-evidence",
                    reason:
                      "The product loop needs browser evidence that users can review missing evidence before relying on the conclusion.",
                    status: "open"
                  },
                  proposalEventId: "product-loop-review-event"
                }
              ],
              projection
            }
          : {
              sessionId: providerBackedRunDetail.sessionId,
              source: {
                kind: "run_plan",
                runId: providerBackedRunDetail.runId
              },
              plannedResources: [],
              deliveryAudits: [],
              accessAudits: [],
              evidenceNeeds: [],
              projection: emptyProjection
            }
      ),
      getObligations: vi.fn(async () =>
        discussionStarted
          ? {
              qualityObligations: [
                {
                  object: {
                    id: "product-loop-quality",
                    requirement:
                      "Confirm the conclusion names options, disagreements, evidence gaps, risks, and next actions.",
                    status: "unanswered"
                  },
                  proposalEventId: "product-loop-review-event"
                }
              ],
              projection
            }
          : {
              qualityObligations: [],
              projection: emptyProjection
            }
      )
    });

    renderApp("/setup/models", client);

    expect(await screen.findByRole("heading", { name: "Setup / Models" })).toBeTruthy();
    expect(await screen.findByText("Local service connected")).toBeTruthy();
    expect(screen.getByText("Configure OpenAI-compatible provider")).toBeTruthy();
    expect(screen.getByLabelText("Provider API key")).toBeTruthy();
    expect(
      (screen.getByLabelText(/Structured review compatibility/) as HTMLInputElement).checked
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Provider API key"), {
      target: {
        value: "sk-product-loop-secret"
      }
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: {
        value: "https://api.product-loop.test/v1"
      }
    });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: {
        value: "product-loop-model"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save model setup" }));
    await waitFor(() =>
      expect(client.saveOpenAICompatibleSetup).toHaveBeenCalledWith({
        apiKey: "sk-product-loop-secret",
        baseUrl: "https://api.product-loop.test/v1",
        model: "product-loop-model",
        structuredReview: true
      })
    );
    expect(await screen.findByText("Model setup saved locally")).toBeTruthy();
    expect((screen.getByLabelText("Provider API key") as HTMLInputElement).value).toBe("");
    expect(document.body.textContent ?? "").not.toContain("sk-product-loop-secret");

    fireEvent.click(screen.getByRole("button", { name: "Verify connection" }));
    await waitFor(() => expect(client.verifyOpenAICompatibleSetup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Provider connection verified")).toBeTruthy();

    const startModelBackedLinks = screen.getAllByRole("link", {
      name: "Start model-backed discussion"
    });
    expect(startModelBackedLinks.length).toBeGreaterThan(1);
    fireEvent.click(startModelBackedLinks[0]!);

    expect(await screen.findByText("Start a discussion")).toBeTruthy();
    expect(await screen.findByText("Model-backed discussion selected")).toBeTruthy();
    expect(screen.getByText("Ready to create a model-backed discussion")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Discussion question"), {
      target: {
        value: "Should we use the configured provider for this product loop?"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create discussion" }));

    await waitFor(() => expect(client.createRun).toHaveBeenCalled());
    expect((await screen.findAllByText("Discussion room")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Model-backed discussion")).toBeTruthy();
    expect(screen.queryByText("Discussion brief details")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue discussion" })).toBeTruthy();
    expect(screen.queryByText("Use the verified provider for reviewable discussions")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() =>
      expect(client.startRun).toHaveBeenCalledWith(
        providerBackedRunDetail.runId,
        expect.objectContaining({
          sealedDivergence: {
            autoCloseManual: true,
            retryFailedParticipants: true
          },
          extraction: {
            generatorIds: ["openai-compatible-extractor"],
            retryFailedGenerators: true
          },
          review: expect.objectContaining({
            reviewerIds: ["openai-compatible-reviewer"],
            retryFailedReviewers: true
          }),
          finalization: expect.objectContaining({
            finalCandidateGeneratorId: "openai-compatible-final-candidate",
            auditGeneratorIds: ["openai-compatible-final-auditor"],
            retryFailedFinalCandidate: true,
            retryFailedAuditors: true,
            compileOutcome: true
          })
        })
      )
    );
    expect(screen.queryByText("Model-backed discussion continued")).toBeNull();
    expect(screen.queryByRole("region", { name: "Latest discussion update" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(
      "Model participants and review roles updated the readable timeline and conclusion materials."
    );
    expect(
      screen.getAllByText(
        "Use the configured provider only after verification and visible review material are ready."
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Keep demo fallback visible until real provider discussions can be reviewed end to end."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Requirements to satisfy").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Provider-backed conclusions remain provisional until risks are reviewed.")
        .length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("list", { name: "Discussion round 1 messages" })).toBeTruthy();
    expect(document.querySelector(".du-room-secondary-details")).toBeNull();
    expect(document.querySelector(".du-room-outputs-section")).toBeNull();
    expect(screen.queryByText("Room details")).toBeNull();
    expect(screen.queryByText("Room output summary")).toBeNull();
    expect(screen.queryByText("Review status summary")).toBeNull();
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(screen.getByText("Raised an open disagreement")).toBeTruthy();
    expect(screen.getAllByText("Evidence checker").length).toBeGreaterThan(0);
    expect(screen.getByText("Reviewed evidence gaps")).toBeTruthy();
    expect(screen.getByText("Current conclusion: Ready to review")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Review current conclusion" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review disagreements").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Check evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Update conclusion").length).toBeGreaterThan(0);

    const defaultPageText = document.body.textContent ?? "";
    expect(defaultPageText).not.toContain("sk-product-loop-secret");
    expect(defaultPageText).not.toContain("https://api.product-loop.test/v1");
    expect(defaultPageText).not.toContain("product-loop-model");
    expect(defaultPageText).not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(defaultPageText).not.toContain("providerConfigId");
    expect(defaultPageText).not.toContain("openai-main");
    expect(defaultPageText).not.toContain("product-loop-topic-event");
    expect(defaultPageText).not.toContain("product-loop-review-event");
    expect(defaultPageText).not.toContain("product-loop-candidate");
    expect(defaultPageText).not.toContain("product-loop-objection");
    expect(defaultPageText).not.toContain("product-loop-evidence");
  });

  it("guides setup users when the local service is unavailable", async () => {
    const getRuntimeProfiles = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1:3877"))
      .mockResolvedValueOnce({ profiles: [] });
    const client = createClient({
      getRuntimeProfiles
    });

    renderApp("/setup/models", client);

    expect(await screen.findByText("Start the local service")).toBeTruthy();
    expect(screen.getByText("Local service command")).toBeTruthy();
    expect(
      screen.getByText(
        "corepack pnpm build && corepack pnpm start:local"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This starts the local Web and service; model API keys are added from Web after it connects."
      )
    ).toBeTruthy();
    expect(screen.getByText("3. Configure models in Web")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("ECONNREFUSED");
    expect(document.body.textContent ?? "").not.toContain("127.0.0.1:3877");

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(getRuntimeProfiles).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Model providers")).toBeTruthy();
    expect(screen.queryByText("Start the local service")).toBeNull();
  });

  it("localizes the setup provider checklist without exposing setup internals", async () => {
    const client = renderApp("/setup/models", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect(await screen.findByRole("heading", { name: "\u8bbe\u7f6e / \u6a21\u578b" })).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("\u63d0\u4f9b\u65b9\u8bbe\u7f6e\u68c0\u67e5\u6e05\u5355")).toBeTruthy();
    expect(screen.getByText("\u914d\u7f6e OpenAI-compatible \u63d0\u4f9b\u65b9")).toBeTruthy();
    expect(screen.getByText("\u5f53\u524d\u6a21\u578b\u8bbe\u7f6e")).toBeTruthy();
    expect(screen.getByText("\u6a21\u578b\u7ba1\u7406")).toBeTruthy();
    expect(screen.getAllByText("\u5728 Web \u4e2d\u5b8c\u6210\u8bbe\u7f6e").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u672c\u5730\u5df2\u4fdd\u5b58").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u5fc5\u586b").length).toBeGreaterThan(1);
    expect(screen.getByText("\u9700\u8981\u5148\u4fdd\u5b58\u8bbe\u7f6e")).toBeTruthy();
    expect(
      screen.getByText(
        "\u8fd9\u91cc\u4ec5\u663e\u793a\u5c31\u7eea\u72b6\u6001\u3002\u9ed8\u8ba4\u89c6\u56fe\u4e0d\u4f1a\u663e\u793a\u5df2\u4fdd\u5b58\u7684 API key\u3001Base URL \u6216\u5177\u4f53\u6a21\u578b\u503c\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByLabelText("\u63d0\u4f9b\u65b9 API key")).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u4fdd\u5b58\u6a21\u578b\u8bbe\u7f6e" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u68c0\u67e5\u5c31\u7eea\u72b6\u6001" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u9a8c\u8bc1\u8fde\u63a5" })).toBeTruthy();
    expect(screen.getAllByText("API key").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u672c\u5730\u5df2\u914d\u7f6e").length).toBeGreaterThan(0);
    expect(screen.getByText("\u9700\u8981 Base URL")).toBeTruthy();
    expect(screen.getByText("\u9700\u8981\u6a21\u578b")).toBeTruthy();
    expect(screen.getByText("\u8bbe\u7f6e\u540e\u9a8c\u8bc1")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u5c31\u7eea\u72b6\u6001")).toBeTruthy();
    expect(screen.getByText("\u73b0\u5728\u53ef\u4ee5\u8fd0\u884c\u4ec0\u4e48")).toBeTruthy();
    expect(screen.getAllByText("\u6f14\u793a\u6d41\u7a0b").length).toBeGreaterThan(0);
    expect(screen.getByText("\u6a21\u578b\u53c2\u4e0e\u8005")).toBeTruthy();
    expect(screen.getAllByText("\u9700\u8981\u914d\u7f6e").length).toBeGreaterThan(0);
    expect(screen.getByText("\u5ba1\u67e5\u89d2\u8272\u4e0e\u7ed3\u8bba")).toBeTruthy();
    expect(screen.getByText("\u8bd5\u7528\u6f14\u793a\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByText("\u53c2\u4e0e\u8005\u7ba1\u7406")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u53c2\u4e0e\u8005")).toBeTruthy();
    expect(screen.getByText("\u6a21\u578b\u5206\u914d")).toBeTruthy();
    expect(screen.getByText("\u4ec5\u6f14\u793a\u89d2\u8272")).toBeTruthy();
    expect(
      screen.getByText(
        "\u6f14\u793a\u8ba8\u8bba\u4f7f\u7528\u5185\u7f6e\u6750\u6599\u3002\u6a21\u578b\u652f\u6301\u7684\u89d2\u8272\u53ef\u7528\u524d\uff0c\u8bf7\u5148\u6dfb\u52a0\u5e76\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u9009\u62e9\u8ba8\u8bba\u6df1\u5ea6")).toBeTruthy();
    expect(
      screen.getByText(
        "\u73b0\u5728\u53ef\u4ee5\u5f00\u59cb\u6f14\u793a\u8ba8\u8bba\uff0c\u6216\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e\u540e\u9009\u62e9\u805a\u7126\u6216\u66f4\u5e7f\u7684\u6a21\u578b\u652f\u6301\u5ba1\u67e5\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u5f53\u524d\u9650\u5236")).toBeTruthy();
    expect(screen.getByText("\u8c01\u4f1a\u52a0\u5165\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByText("\u521d\u59cb\u56de\u5e94")).toBeTruthy();
    expect(
      screen.getByText("\u89c6\u89d2 A \u548c\u89c6\u89d2 B \u4f7f\u7528\u5185\u7f6e\u6f14\u793a\u6750\u6599\u3002")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "\u73b0\u5728\u53ef\u4ee5\u4f7f\u7528\u6f14\u793a\uff0c\u6216\u6dfb\u52a0\u63d0\u4f9b\u65b9\u4ee5\u83b7\u5f97\u771f\u5b9e\u6a21\u578b\u56de\u5e94\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u5206\u6b67\u4e0e\u8bc1\u636e\u5ba1\u67e5")).toBeTruthy();
    expect(
      screen.getByText(
        "\u5ba1\u67e5\u8005\u3001\u8bc1\u636e\u6838\u67e5\u8005\u548c\u98ce\u9669\u5ba1\u67e5\u8005\u4f7f\u7528\u672c\u5730\u5ba1\u67e5\u6d41\u7a0b\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u7ed3\u8bba\u4e0e\u4e0b\u4e00\u6b65")).toBeTruthy();
    expect(screen.getAllByText("\u4f7f\u7528").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u6f14\u793a\u5df2\u5c31\u7eea").length).toBeGreaterThan(1);
    expect(screen.getAllByText("\u5185\u7f6e\u6f14\u793a\u53c2\u4e0e\u8005").length).toBeGreaterThan(1);
    expect(screen.getByText("\u5b8c\u6210\u6a21\u578b\u8bbe\u7f6e\u540e\u53ef\u7528\u4e8e\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5")).toBeTruthy();
    expect(screen.getAllByText("\u672c\u5730\u5ba1\u67e5\u89d2\u8272").length).toBeGreaterThan(1);
    expect(document.body.textContent ?? "").not.toContain("\u7ec4\u7ec7\u5668");
    expect(screen.getAllByRole("link", { name: "\u67e5\u770b\u8bbe\u7f6e\u6b65\u9aa4" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("HTTP-template")).toBeNull();
    expect(screen.queryByText("MCP tool")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_HTTP_TEMPLATE_URL");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_MCP_TOOL_URL");

    fireEvent.change(screen.getByLabelText("\u63d0\u4f9b\u65b9 API key"), {
      target: {
        value: "sk-web-setup-secret"
      }
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: {
        value: "https://api.example.test/v1"
      }
    });
    fireEvent.change(screen.getByLabelText("\u6a21\u578b"), {
      target: {
        value: "web-setup-model"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "\u4fdd\u5b58\u6a21\u578b\u8bbe\u7f6e" }));

    expect((await screen.findAllByText("\u53ef\u4ee5\u9a8c\u8bc1")).length).toBeGreaterThan(0);
    expect(screen.getByText("\u5df2\u5728\u5f53\u524d\u4f1a\u8bdd\u4fdd\u5b58")).toBeTruthy();
    expect(screen.getAllByText("\u672c\u5730\u5df2\u4fdd\u5b58").length).toBeGreaterThan(2);
    expect(
      screen.getByText(
        "\u5f53\u524d\u672c\u5730\u670d\u52a1\u73b0\u5728\u5df2\u53ef\u4ee5\u4f7f\u7528\u8fd9\u4e2a\u8bbe\u7f6e\u3002\u8bf7\u68c0\u67e5\u5c31\u7eea\u72b6\u6001\u3001\u9a8c\u8bc1\u8fde\u63a5\uff0c\u7136\u540e\u5f00\u59cb\u771f\u5b9e\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u8bbe\u7f6e\u8def\u5f84")).toBeTruthy();
    expect(screen.getByText("\u5f00\u59cb\u524d\u8bf7\u5148\u9a8c\u8bc1\u63d0\u4f9b\u65b9")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_BASE_URL");
    expect(document.body.textContent ?? "").not.toContain("sk-web-setup-secret");
    expect(document.body.textContent ?? "").not.toContain("runtime profile");
  });

  it("localizes the local service setup guide without exposing connection diagnostics", async () => {
    const client = createClient({
      getRuntimeProfiles: vi.fn(async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3877");
      })
    });

    renderApp("/setup/models", client, {
      initialLanguage: "zh-CN"
    });

    expect(await screen.findByText("\u542f\u52a8\u672c\u5730\u670d\u52a1")).toBeTruthy();
    expect(screen.getByText("\u672c\u5730\u670d\u52a1\u547d\u4ee4")).toBeTruthy();
    expect(screen.getByText("1. \u542f\u52a8\u672c\u5730\u670d\u52a1")).toBeTruthy();
    expect(screen.getByText("3. \u5728 Web \u4e2d\u914d\u7f6e\u6a21\u578b")).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u518d\u6b21\u68c0\u67e5" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("ECONNREFUSED");
    expect(document.body.textContent ?? "").not.toContain("127.0.0.1:3877");
  });

  it("verifies a ready provider connection from setup and models", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue({
      profiles: [
        {
          id: "local-preset",
          name: "Local preset",
          enabled: true,
          status: "ready",
          components: [],
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
              },
              {
                id: "openai-compatible-extractor",
                kind: "extraction_generator",
                enabled: true
              },
              {
                id: "openai-compatible-reviewer",
                kind: "proposal_reviewer",
                enabled: true
              },
              {
                id: "openai-compatible-final-candidate",
                kind: "final_candidate_generator",
                enabled: true
              },
              {
                id: "openai-compatible-final-auditor",
                kind: "final_auditor",
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
                purpose: "Default provider model."
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
    renderApp("/setup/models", client);

    expect((await screen.findAllByText("Verify provider connection")).length).toBeGreaterThan(0);
    expect(screen.getByText("Current model setup")).toBeTruthy();
    expect(screen.getByText("Verify before real discussions")).toBeTruthy();
    expect(
      screen.getByText(
        "The provider setup is saved locally. Verify the connection before starting model-backed discussions."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Saved locally").length).toBeGreaterThan(2);
    expect(screen.getAllByText("Ready to verify").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Verify connection" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Discussion readiness")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Start model-backed discussion" })).toBeNull();
    expect(
      screen.getByText(
        "Use Verify connection in Setup / Models before starting a real model-backed discussion."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "A model provider is saved locally. Verify the connection before relying on real model participants."
      )
    ).toBeTruthy();
    expect(screen.getByText("Ready to test")).toBeTruthy();
    expect(screen.getByText("Discussion participants")).toBeTruthy();
    expect(screen.getByText("Model assignment")).toBeTruthy();
    expect(screen.getAllByText("Verify provider first").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Start focused discussion" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start broader discussion" })).toBeNull();
    expect(
      screen.getByText(
        "The saved provider cannot power model participants until Verify connection succeeds."
      )
    ).toBeTruthy();
    expect(screen.getByRole("group", { name: "Role assignment controls" })).toBeTruthy();
    expect(screen.getByText("Shared provider setup")).toBeTruthy();
    expect(screen.getByText("One provider for all model roles")).toBeTruthy();
    const reviewProviderSetupLink = screen.getByRole("link", {
      name: "Review provider setup"
    }) as HTMLAnchorElement;
    expect(reviewProviderSetupLink.href).toContain("#setup-provider-form");
    expect(
      screen.getByText(
        "After verification, open the start page to choose Focused review or Broader review."
      )
    ).toBeTruthy();
    expect(screen.getByText("Who joins the discussion")).toBeTruthy();
    expect(
      screen.getByText("Perspective A and Perspective B can use the saved provider after verification.")
    ).toBeTruthy();
    expect(screen.getByText("Perspective C can use the saved provider after verification.")).toBeTruthy();
    expect(
      screen.getByText("Verify connection to unlock Perspective C and real model-backed broader review.")
    ).toBeTruthy();
    expect(screen.getAllByText("Verify connection").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Saved model provider").length).toBeGreaterThan(1);
    expect(document.body.textContent ?? "").not.toContain("Model organizer");
    expect(screen.getAllByText("Verify provider connection").length).toBeGreaterThan(0);
    const verifyButton = screen.getByRole("button", {
      name: "Verify connection"
    }) as HTMLButtonElement;
    expect(verifyButton.disabled).toBe(false);

    fireEvent.click(verifyButton);
    await waitFor(() => expect(client.verifyOpenAICompatibleSetup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Ready and verified")).toBeTruthy();
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(screen.getByText("Ready to start with real model participants")).toBeTruthy();
    const verifiedModelBackedStartLinks = screen.getAllByRole("link", {
      name: "Start model-backed discussion"
    });
    expect(verifiedModelBackedStartLinks.length).toBeGreaterThan(2);
    expect(
      verifiedModelBackedStartLinks.every((link) =>
        (link as HTMLAnchorElement).href.includes("participants=model-backed")
      )
    ).toBe(true);
    expect(await screen.findByText("Provider connection verified")).toBeTruthy();
    expect(
      screen.getByText(
        "The configured provider accepted a safe test request. You can start a real model-backed discussion."
      )
    ).toBeTruthy();
    expect(screen.getByText("Single verified provider")).toBeTruthy();
    expect(
      screen.getByText(
        "Perspective A, Perspective B, optional Perspective C, Reviewer, Evidence checker, Risk reviewer, and Conclusion writer use OpenAI-compatible in the current Web path."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Choose Focused review or Broader review on the start page before creating the discussion."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The start page can customize first-response perspective models and a separate review role model for one discussion."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "A change here applies to Perspective A, Perspective B, optional Perspective C, Reviewer, Evidence checker, Risk reviewer, and Conclusion writer."
      )
    ).toBeTruthy();
    const editSharedProviderSetupLink = screen.getByRole("link", {
      name: "Edit shared provider setup"
    }) as HTMLAnchorElement;
    expect(editSharedProviderSetupLink.href).toContain("#setup-provider-form");
    const focusedDiscussionLink = screen.getByRole("link", {
      name: "Start focused discussion"
    }) as HTMLAnchorElement;
    const broaderDiscussionLink = screen.getByRole("link", {
      name: "Start broader discussion"
    }) as HTMLAnchorElement;
    expect(focusedDiscussionLink.href).toContain("participants=model-backed");
    expect(focusedDiscussionLink.href).toContain("perspectives=2");
    expect(broaderDiscussionLink.href).toContain("participants=model-backed");
    expect(broaderDiscussionLink.href).toContain("perspectives=3");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("who will organize the result");
  });

  it("localizes verified setup participant start options in Simplified Chinese", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue(createReadyOpenAISetupProfiles());
    renderApp("/setup/models", client, {
      initialLanguage: "zh-CN"
    });

    expect(
      await screen.findByText(
        "\u6b64\u63d0\u4f9b\u65b9\u5df2\u4fdd\u5b58\u5230\u672c\u5730\u3002\u5f00\u59cb\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\u524d\uff0c\u8bf7\u5148\u4f7f\u7528\u201c\u9a8c\u8bc1\u8fde\u63a5\u201d\u3002"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "\u4f7f\u7528\u6a21\u578b\u53c2\u4e0e\u8005\u5f00\u59cb\u524d\uff0c\u8bf7\u5148\u9a8c\u8bc1\u8fde\u63a5\u3002"
      )
    ).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "\u9a8c\u8bc1\u8fde\u63a5" }));
    expect(await screen.findByText("\u5df2\u5c31\u7eea\u4e14\u5df2\u9a8c\u8bc1")).toBeTruthy();
    expect(screen.getByText("\u5355\u4e2a\u5df2\u9a8c\u8bc1\u63d0\u4f9b\u65b9")).toBeTruthy();
    expect(
      screen.getByText(
        "\u5f00\u59cb\u9875\u53ef\u4ee5\u4e3a\u5355\u6b21\u8ba8\u8bba\u81ea\u5b9a\u4e49\u521d\u59cb\u56de\u5e94\u89c6\u89d2\u6a21\u578b\uff0c\u4e5f\u53ef\u4ee5\u5355\u72ec\u6307\u5b9a\u5ba1\u67e5\u89d2\u8272\u6a21\u578b\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByRole("group", { name: "\u89d2\u8272\u5206\u914d\u63a7\u4ef6" })).toBeTruthy();
    expect(screen.getByText("\u5171\u4eab\u63d0\u4f9b\u65b9\u8bbe\u7f6e")).toBeTruthy();
    expect(screen.getByText("\u5c1a\u672a\u4fdd\u5b58\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u6df1\u5ea6")).toBeTruthy();
    const editSharedProviderSetupLink = screen.getByRole("link", {
      name: "\u7f16\u8f91\u5171\u4eab\u63d0\u4f9b\u65b9\u8bbe\u7f6e"
    }) as HTMLAnchorElement;
    expect(editSharedProviderSetupLink.href).toContain("#setup-provider-form");

    const focusedDiscussionLink = screen.getByRole("link", {
      name: "\u5f00\u59cb\u805a\u7126\u8ba8\u8bba"
    }) as HTMLAnchorElement;
    const broaderDiscussionLink = screen.getByRole("link", {
      name: "\u5f00\u59cb\u66f4\u5e7f\u8ba8\u8bba"
    }) as HTMLAnchorElement;

    expect(focusedDiscussionLink.href).toContain("participants=model-backed");
    expect(focusedDiscussionLink.href).toContain("perspectives=2");
    expect(broaderDiscussionLink.href).toContain("participants=model-backed");
    expect(broaderDiscussionLink.href).toContain("perspectives=3");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
  });

  it("shows saved role defaults in setup and models without exposing provider internals", async () => {
    markOpenAICompatibleProviderVerified();
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue(createReadyOpenAISetupProfiles());
    vi.mocked(client.getOpenAICompatibleRoleModelDefaults).mockResolvedValue({
      profileId: "openai-compatible",
      status: "configured",
      defaults: {
        perspectiveCount: 3,
        modelOverride: "service-first-response-model",
        reviewModelOverride: "service-review-model",
        customPerspectiveModelsEnabled: true,
        perspectiveModelOverrides: {
          "provider-perspective-a": "service-perspective-a-model",
          "provider-perspective-c": "service-perspective-c-model"
        }
      },
      safety: [
        "Role model defaults contain non-secret model choices only.",
        "Provider API keys, base URLs, and provider config ids are not returned."
      ]
    });

    renderApp("/setup/models", client);

    expect(await screen.findByText("Saved role defaults")).toBeTruthy();
    await waitFor(() =>
      expect(client.getOpenAICompatibleRoleModelDefaults).toHaveBeenCalledTimes(1)
    );
    expect(
      screen.getByText(
        "Setup / Models shows the saved participant model choices before you start. API keys, base URLs, and provider configuration ids are not returned here."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Broader review").length).toBeGreaterThan(0);
    expect(screen.getByText("service-first-response-model")).toBeTruthy();
    expect(screen.getByText("service-review-model")).toBeTruthy();
    expect(screen.getByText("2 custom perspective models")).toBeTruthy();
    const startWithSavedRoleSetupLink = screen.getByRole("link", {
      name: "Start with saved role setup"
    }) as HTMLAnchorElement;
    expect(startWithSavedRoleSetupLink.href).toContain("participants=model-backed");
    expect(startWithSavedRoleSetupLink.href).toContain("perspectives=3");
    const editRoleDefaultsLink = screen.getByRole("link", {
      name: "Edit role defaults"
    }) as HTMLAnchorElement;
    expect(editRoleDefaultsLink.href).toContain("participants=model-backed");
    expect(editRoleDefaultsLink.href).toContain("perspectives=3");
    const pageText = document.body.textContent ?? "";
    expect(pageText).not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(pageText).not.toContain("DELIBERUM_OPENAI_BASE_URL");
    expect(pageText).not.toContain("providerConfigId");
    expect(pageText).not.toContain("openai-main");
  });

  it("edits role defaults directly from setup and models", async () => {
    markOpenAICompatibleProviderVerified();
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue(createReadyOpenAISetupProfiles());

    renderApp("/setup/models", client);

    expect(await screen.findByText("No saved role defaults")).toBeTruthy();
    expect(screen.getByText("Choose default discussion depth")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Broader review/i }));
    fireEvent.change(document.getElementById("setup-role-first-response-model") as HTMLInputElement, {
      target: {
        value: " setup-first-response-model "
      }
    });
    fireEvent.change(document.getElementById("setup-role-review-model") as HTMLInputElement, {
      target: {
        value: " setup-review-model "
      }
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Customize perspective models/i }));
    fireEvent.change(screen.getByLabelText("Perspective A model"), {
      target: {
        value: " setup-perspective-a-model "
      }
    });
    fireEvent.change(screen.getByLabelText("Perspective C model"), {
      target: {
        value: " setup-perspective-c-model "
      }
    });
    expect(screen.getByText("Role changes are not saved yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save as default role setup" }));
    await waitFor(() =>
      expect(client.saveOpenAICompatibleRoleModelDefaults).toHaveBeenCalledWith({
        perspectiveCount: 3,
        modelOverride: "setup-first-response-model",
        reviewModelOverride: "setup-review-model",
        customPerspectiveModelsEnabled: true,
        perspectiveModelOverrides: {
          "provider-perspective-a": "setup-perspective-a-model",
          "provider-perspective-c": "setup-perspective-c-model"
        }
      })
    );
    expect(
      await screen.findByText(
        "Saved role defaults to the local service. API keys and base URLs are not stored here."
      )
    ).toBeTruthy();
    expect(JSON.stringify(vi.mocked(client.saveOpenAICompatibleRoleModelDefaults).mock.calls)).not.toContain("sk-");
    expect(JSON.stringify(vi.mocked(client.saveOpenAICompatibleRoleModelDefaults).mock.calls)).not.toContain("https://api.example.test/v1");
    expect(JSON.stringify(vi.mocked(client.saveOpenAICompatibleRoleModelDefaults).mock.calls)).not.toContain("providerConfigId");

    fireEvent.click(screen.getByRole("button", { name: "Clear saved role setup" }));
    await waitFor(() =>
      expect(client.clearOpenAICompatibleRoleModelDefaults).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText(
        "Cleared saved role defaults from the local service."
      )
    ).toBeTruthy();
  });

  it("applies daemon-saved role defaults to the model-backed start page", async () => {
    markOpenAICompatibleProviderVerified();
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue(createReadyOpenAISetupProfiles());
    vi.mocked(client.getOpenAICompatibleRoleModelDefaults).mockResolvedValue({
      profileId: "openai-compatible",
      status: "configured",
      defaults: {
        perspectiveCount: 3,
        modelOverride: "service-first-response-model",
        reviewModelOverride: "service-review-model",
        customPerspectiveModelsEnabled: true,
        perspectiveModelOverrides: {
          "provider-perspective-a": "service-perspective-a-model",
          "provider-perspective-c": "service-perspective-c-model"
        }
      },
      safety: [
        "Role model defaults contain non-secret model choices only.",
        "Provider API keys, base URLs, and provider config ids are not returned."
      ]
    });

    renderApp("/runs/new?participants=model-backed", client);

    expect(await screen.findByDisplayValue("service-first-response-model")).toBeTruthy();
    expect(screen.getByDisplayValue("service-review-model")).toBeTruthy();
    expect(screen.getByDisplayValue("service-perspective-a-model")).toBeTruthy();
    expect(screen.getByDisplayValue("service-perspective-c-model")).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: /Broader review/i }) as HTMLInputElement).checked
    ).toBe(true);
    expect(
      screen.getByText("Saved role defaults are available from the local service.")
    ).toBeTruthy();
    const pageText = document.body.textContent ?? "";
    expect(pageText).not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(pageText).not.toContain("providerConfigId");
    expect(pageText).not.toContain("openai-main");
  });

  it("shows a safe provider verification failure from setup and models", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue(createReadyOpenAISetupProfiles());
    vi.mocked(client.verifyOpenAICompatibleSetup).mockRejectedValue(
      new Error("Provider authentication failed. Check the API key, then verify again.")
    );
    renderApp("/setup/models", client);

    fireEvent.click(await screen.findByRole("button", { name: "Verify connection" }));
    expect(await screen.findByText("Provider connection could not be verified")).toBeTruthy();
    expect(
      screen.getByText("Provider authentication failed. Check the API key, then verify again.")
    ).toBeTruthy();
    const recovery = screen.getByRole("region", {
      name: "Provider verification recovery options"
    });
    expect(within(recovery).getByText("Keep setup moving")).toBeTruthy();
    expect(within(recovery).getByText("Review setup fields")).toBeTruthy();
    expect(
      within(recovery).getByText(
        "If the base URL points to a local or private provider, make sure that provider is running before you retry."
      )
    ).toBeTruthy();
    expect(within(recovery).getByText("Try Verify connection again")).toBeTruthy();
    expect(within(recovery).getByText("Start demo discussion")).toBeTruthy();
    const retryAction = within(recovery).getByText("Try Verify connection again").closest("button");
    expect(retryAction).toBeTruthy();
    fireEvent.click(retryAction as HTMLButtonElement);
    await waitFor(() => expect(client.verifyOpenAICompatibleSetup).toHaveBeenCalledTimes(2));
    const demoLink = within(recovery).getByText("Start demo discussion").closest("a");
    expect((demoLink as HTMLAnchorElement).href).toContain("participants=demo");
    expect(document.body.textContent ?? "").not.toContain("sk-");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
  });

  it("localizes provider verification recovery options in Simplified Chinese", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue(createReadyOpenAISetupProfiles());
    vi.mocked(client.verifyOpenAICompatibleSetup).mockRejectedValue(
      new Error("Provider verification timed out.")
    );
    renderApp("/setup/models", client, {
      initialLanguage: "zh-CN"
    });

    fireEvent.click(await screen.findByRole("button", { name: "\u9a8c\u8bc1\u8fde\u63a5" }));
    expect(await screen.findByText("\u65e0\u6cd5\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u8fde\u63a5")).toBeTruthy();
    const recovery = screen.getByRole("region", {
      name: "\u63d0\u4f9b\u65b9\u9a8c\u8bc1\u6062\u590d\u9009\u9879"
    });
    expect(within(recovery).getByText("\u7ee7\u7eed\u63a8\u8fdb\u8bbe\u7f6e")).toBeTruthy();
    expect(within(recovery).getByText("\u68c0\u67e5\u8bbe\u7f6e\u5b57\u6bb5")).toBeTruthy();
    expect(
      within(recovery).getByText(
        "\u5982\u679c base URL \u6307\u5411\u672c\u5730\u6216\u79c1\u6709\u63d0\u4f9b\u65b9\uff0c\u91cd\u8bd5\u524d\u8bf7\u786e\u8ba4\u8be5\u63d0\u4f9b\u65b9\u5df2\u542f\u52a8\u3002"
      )
    ).toBeTruthy();
    expect(within(recovery).getByText("\u518d\u6b21\u5c1d\u8bd5\u9a8c\u8bc1\u8fde\u63a5")).toBeTruthy();
    expect(within(recovery).getByText("\u5f00\u59cb\u6f14\u793a\u8ba8\u8bba")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
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
    expect(screen.getByText("Deliberum \u4f7f\u7528\u5c31\u7eea")).toBeTruthy();
    expect(screen.getAllByText("\u672c\u5730\u670d\u52a1\u5df2\u8fde\u63a5").length).toBeGreaterThan(0);
    expect(screen.getByText("\u6f14\u793a\u8ba8\u8bba\u5df2\u5c31\u7eea")).toBeTruthy();
    expect(screen.getByText("1 \u4e2a\u5df2\u6709\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByText("\u9996\u6b21\u4f7f\u7528\u8def\u5f84")).toBeTruthy();
    expect(screen.getByText("\u4ece\u8bbe\u7f6e\u5230\u8ba8\u8bba\u5ba4")).toBeTruthy();
    expect(screen.getByText("\u6b65\u9aa4 1")).toBeTruthy();
    expect(screen.getByText("\u6f14\u793a\u5df2\u5c31\u7eea\uff0c\u4ecd\u9700\u6a21\u578b\u8bbe\u7f6e")).toBeTruthy();
    expect(screen.getByText("\u6f14\u793a\u8ba8\u8bba\u5ba4\u89d2\u8272\u5df2\u5c31\u7eea")).toBeTruthy();
    expect(screen.getByText("\u5efa\u8bae\u7684\u4e0b\u4e00\u6b65")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "\u5f00\u59cb\u6f14\u793a\u8ba8\u8bba" }).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("\u8bbe\u7f6e / \u6a21\u578b").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u6a21\u578b\u63d0\u4f9b\u65b9").length).toBeGreaterThan(0);
    expect(
      screen.getByText("\u63d0\u4f9b\u65b9\u5df2\u542f\u7528\uff1b\u8bf7\u6dfb\u52a0\u6a21\u578b\u7ec6\u8282")
    ).toBeTruthy();
    expect(screen.getByText("Web \u672c\u5730\u8bbe\u7f6e\u7684\u5de5\u4f5c\u65b9\u5f0f")).toBeTruthy();
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
    const client = renderApp("/advanced");

    expect(await screen.findByText("Runtime profiles")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getAllByText("Local preset").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI-compatible").length).toBeGreaterThan(0);
    expect(screen.getAllByText("MCP tool").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(screen.getByText("Ready with run config")).toBeTruthy();
    expect(screen.getAllByText("Needs configuration").length).toBeGreaterThan(0);
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
    const client = renderApp("/advanced");

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
    const client = renderApp("/advanced");

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
    const client = renderApp("/advanced");

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

  it("guides discussion list users when the local service is unavailable", async () => {
    const listRuns = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1:3877"))
      .mockResolvedValueOnce({ runs: [] });
    const client = createClient({
      listRuns
    });

    renderApp("/runs", client);

    expect((await screen.findAllByText("Discussions")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Start the local service")).toBeTruthy();
    expect(screen.getByText("Local service command")).toBeTruthy();
    expect(
      screen.getByText(
        "corepack pnpm build && corepack pnpm start:local"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Web cannot read setup or discussions until the local Deliberum service is running."
      )
    ).toBeTruthy();
    expect(screen.getByText("3. Configure models in Web")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("ECONNREFUSED");
    expect(document.body.textContent ?? "").not.toContain("127.0.0.1:3877");

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No discussions yet")).toBeTruthy();
    expect(screen.queryByText("Start the local service")).toBeNull();
  });

  it("localizes the discussion list local service guide", async () => {
    const client = createClient({
      listRuns: vi.fn(async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3877");
      })
    });

    renderApp("/runs", client, {
      initialLanguage: "zh-CN"
    });

    expect(await screen.findByText("\u542f\u52a8\u672c\u5730\u670d\u52a1")).toBeTruthy();
    expect(screen.getByText("\u672c\u5730\u670d\u52a1\u547d\u4ee4")).toBeTruthy();
    expect(screen.getByText("3. \u5728 Web \u4e2d\u914d\u7f6e\u6a21\u578b")).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u518d\u6b21\u68c0\u67e5" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("ECONNREFUSED");
    expect(document.body.textContent ?? "").not.toContain("127.0.0.1:3877");
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
    expect(screen.getAllByText("\u6f14\u793a\u53c2\u4e0e\u8005").length).toBeGreaterThan(0);
    expect(screen.getByText("\u672c\u6b21\u8ba8\u8bba\u7684\u53c2\u4e0e\u8005")).toBeTruthy();
    expect(
      screen.getByText(
        "\u521b\u5efa\u8ba8\u8bba\u524d\uff0c\u5148\u770b\u6e05\u8c01\u4f1a\u5148\u56de\u5e94\uff0c\u4ee5\u53ca\u8c01\u4f1a\u5ba1\u67e5\u7ed3\u679c\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u89c6\u89d2 A")).toBeTruthy();
    expect(screen.getByText("\u8bc1\u636e\u6838\u67e5\u8005")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u7b80\u62a5")).toBeTruthy();
    expect(screen.getByLabelText("\u8ba8\u8bba\u95ee\u9898")).toBeTruthy();
    expect(screen.getByText("\u521b\u5efa\u9884\u89c8")).toBeTruthy();
    expect(screen.getByText("\u53ef\u521b\u5efa\u6f14\u793a\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByText("2 \u4e2a\u6f14\u793a\u89c6\u89d2")).toBeTruthy();
    expect(screen.getByText("\u5b8c\u6574\u8ba8\u8bba\u5faa\u73af")).toBeTruthy();
    expect(screen.getByText("\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b")).toBeTruthy();
    expect((screen.getByLabelText("\u8bed\u8a00") as HTMLSelectElement).value).toBe("zh-CN");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("run / session");
    expect(document.body.textContent ?? "").not.toContain("\u8c01\u4f1a\u6574\u7406\u7ed3\u679c");
  });

  it("shows model readiness on the start discussion path without setup internals", async () => {
    const client = renderApp("/runs/new");

    expect(await screen.findByText("Model setup for this discussion")).toBeTruthy();
    await waitFor(() => expect(client.getRuntimeProfiles).toHaveBeenCalled());
    expect(screen.getByText("Demo start, provider details needed")).toBeTruthy();
    expect(screen.getByText("Quick-start participants")).toBeTruthy();
    expect(screen.getAllByText("Model-backed participants").length).toBeGreaterThan(0);
    expect(screen.getByText("Choose participant source")).toBeTruthy();
    expect(screen.getAllByText("Demo participants").length).toBeGreaterThan(0);
    expect(screen.getByText("Participants for this discussion")).toBeTruthy();
    expect(
      screen.getByText(
        "Before creating the discussion, see who will answer first and who will review the result."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Perspective A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Perspective B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evidence checker").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Conclusion writer").length).toBeGreaterThan(0);
    expect(screen.getByText("Creation preview")).toBeTruthy();
    expect(screen.getByText("Ready to create a demo discussion")).toBeTruthy();
    expect(screen.getByText("2 demo perspectives")).toBeTruthy();
    expect(screen.getByText("Full discussion loop")).toBeTruthy();
    expect(screen.getByText("After create")).toBeTruthy();
    expect(
      screen.getByText(
        "Open the room, then continue the guided discussion to review the timeline and current result."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Independent first response").length).toBeGreaterThan(1);
    expect(
      screen.getAllByText("Uses built-in demo material for a deterministic walkthrough.").length
    ).toBeGreaterThan(1);
    expect(
      (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      screen.getByText(
        "The quick-start form can start now with demo participants. A provider is enabled, but model details still need Web setup or per-discussion model settings."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This page does not show API keys. Use Setup / Models to save provider setup before starting real model-backed discussions."
      )
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Setup / Models" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_BASE_URL");
    expect(document.body.textContent ?? "").not.toContain("runtime profile");
  });

  it("creates a model-backed discussion by default when a provider source is ready", async () => {
    markOpenAICompatibleProviderVerified();
    const client = createClient();
    const savedRoleDefaults = {
      perspectiveCount: 3 as const,
      modelOverride: "release-model-v1",
      reviewModelOverride: "release-model-review",
      customPerspectiveModelsEnabled: true,
      perspectiveModelOverrides: {
        "provider-perspective-a": "release-model-perspective-a",
        "provider-perspective-c": "release-model-perspective-c"
      }
    };
    vi.mocked(client.getOpenAICompatibleRoleModelDefaults)
      .mockResolvedValueOnce({
        profileId: "openai-compatible",
        status: "empty",
        safety: [
          "Role model defaults contain non-secret model choices only.",
          "Provider API keys, base URLs, and provider config ids are not returned."
        ]
      })
      .mockResolvedValue({
        profileId: "openai-compatible",
        status: "configured",
        defaults: savedRoleDefaults,
        safety: [
          "Role model defaults contain non-secret model choices only.",
          "Provider API keys, base URLs, and provider config ids are not returned."
        ]
      });
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

    renderApp("/runs/new?participants=model-backed", client);

    expect(await screen.findByText("Model-backed start available")).toBeTruthy();
    expect(await screen.findByText("Model-backed discussion selected")).toBeTruthy();
    expect(
      screen.getByText(
        "This discussion will use configured model participants from your local setup."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "A ready model provider is available. Web selects model-backed participants by default; use demo participants only for walkthroughs."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "A configured model provider is selected for this discussion by default."
      )
    ).toBeTruthy();
    expect(screen.getByText("Participants for this discussion")).toBeTruthy();
    expect(
      screen.getByText(
        "Before creating the discussion, see who will answer first and who will review the result."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Perspective A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Perspective B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI-compatible").length).toBeGreaterThan(0);
    expect(screen.getByText("Creation preview")).toBeTruthy();
    expect(screen.getByText("Ready to create a model-backed discussion")).toBeTruthy();
    expect(screen.getByText("2 model perspectives")).toBeTruthy();
    expect(screen.getByText("OpenAI-compatible model")).toBeTruthy();
    expect(
      screen.getByText(
        "Configured model participants can answer first, but review and conclusion roles are not ready yet."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("API keys stay on this machine and are not shown on this page.")
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        "OpenAI-compatible will answer through the configured local setup."
      ).length
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText(
        "Review roles are not ready yet; continuing the discussion may collect first responses only."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByText("Choose discussion depth")).toBeTruthy();
    expect(screen.getByText("Focused review")).toBeTruthy();
    expect(screen.getByText("Broader review")).toBeTruthy();
    expect(
      screen.getByText("Two independent model perspectives keep the discussion concise.")
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");

    const demoSource = screen.getByRole("radio", {
      name: /Demo participants/i
    }) as HTMLInputElement;
    const modelBackedSource = screen.getByRole("radio", {
      name: /Model-backed participants/i
    }) as HTMLInputElement;
    expect(modelBackedSource.disabled).toBe(false);
    await waitFor(() => expect(modelBackedSource.checked).toBe(true));
    expect(
      (screen.getByRole("radio", { name: /Focused review/i }) as HTMLInputElement).checked
    ).toBe(true);

    fireEvent.click(demoSource);
    expect(demoSource.checked).toBe(true);
    fireEvent.click(modelBackedSource);
    expect(modelBackedSource.checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Broader review/i }));
    expect(
      (screen.getByRole("radio", { name: /Broader review/i }) as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.getByText("Perspective C")).toBeTruthy();
    expect(screen.getByText("3 model perspectives")).toBeTruthy();
    expect(
      screen.getByText(
        "Perspective A, Perspective B, and Perspective C will answer independently."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("First-response model").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Saved model setup").length).toBeGreaterThan(1);
    expect(
      screen.getByText(
        "Perspectives without their own model use the model saved in Setup / Models."
      )
    ).toBeTruthy();
    const modelOverrideInput = document.getElementById(
      "discussion-model-override"
    ) as HTMLInputElement;
    expect(modelOverrideInput.disabled).toBe(false);
    fireEvent.change(modelOverrideInput, {
      target: {
        value: "release-model-v1"
      }
    });
    expect(screen.getByDisplayValue("release-model-v1")).toBeTruthy();
    expect(screen.getAllByText("release-model-v1").length).toBeGreaterThan(1);
    expect(
      screen.getByText(
        "Perspectives without their own model use this first-response model."
      )
    ).toBeTruthy();
    const reviewModelInput = document.getElementById(
      "discussion-review-model-override"
    ) as HTMLInputElement;
    expect(reviewModelInput.disabled).toBe(false);
    fireEvent.change(reviewModelInput, {
      target: {
        value: "release-model-review"
      }
    });
    expect(screen.getByDisplayValue("release-model-review")).toBeTruthy();
    expect(screen.getByText("release-model-review")).toBeTruthy();
    expect(
      screen.getByText(
        "Review roles use this model while first-response perspectives keep their assigned models."
      )
    ).toBeTruthy();
    const perspectiveModelToggle = screen.getByRole("checkbox", {
      name: /Customize perspective models/i
    }) as HTMLInputElement;
    expect(perspectiveModelToggle.disabled).toBe(false);
    fireEvent.click(perspectiveModelToggle);
    fireEvent.change(screen.getByLabelText("Perspective A model"), {
      target: {
        value: "release-model-perspective-a"
      }
    });
    fireEvent.change(screen.getByLabelText("Perspective C model"), {
      target: {
        value: "release-model-perspective-c"
      }
    });
    expect(screen.getByDisplayValue("release-model-perspective-a")).toBeTruthy();
    expect(screen.getByDisplayValue("release-model-perspective-c")).toBeTruthy();
    expect(screen.getByText("Perspective model assignment")).toBeTruthy();
    expect(screen.getByText("Perspective models customized")).toBeTruthy();
    expect(
      screen.getByText(
        "Customized perspective models only affect independent first responses. Review roles use the review role model when one is set."
      )
    ).toBeTruthy();
    expect(screen.getByText("Role model defaults")).toBeTruthy();
    expect(
      screen.getByText(
        "No saved role defaults yet. API keys and base URLs are never saved here."
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save as default role setup" }));
    await waitFor(() =>
      expect(client.saveOpenAICompatibleRoleModelDefaults).toHaveBeenCalledWith({
        perspectiveCount: 3,
        modelOverride: "release-model-v1",
        reviewModelOverride: "release-model-review",
        customPerspectiveModelsEnabled: true,
        perspectiveModelOverrides: {
          "provider-perspective-a": "release-model-perspective-a",
          "provider-perspective-c": "release-model-perspective-c"
        }
      })
    );
    expect(
      screen.getByText(
        "Saved role defaults to the local service. API keys and base URLs are not stored here."
      )
    ).toBeTruthy();
    expect(JSON.stringify(vi.mocked(client.saveOpenAICompatibleRoleModelDefaults).mock.calls)).not.toContain("sk-");
    expect(JSON.stringify(vi.mocked(client.saveOpenAICompatibleRoleModelDefaults).mock.calls)).not.toContain("https://api.example.test/v1");
    fireEvent.change(modelOverrideInput, {
      target: {
        value: "temporary-first-response-model"
      }
    });
    expect(screen.getByDisplayValue("temporary-first-response-model")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply saved role setup" }));
    expect(screen.getByDisplayValue("release-model-v1")).toBeTruthy();
    expect(screen.getByText("Applied the saved role setup to this discussion.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear saved role setup" }));
    await waitFor(() =>
      expect(client.clearOpenAICompatibleRoleModelDefaults).toHaveBeenCalledTimes(1)
    );
    expect(
      screen.getByText(
        "Cleared saved role defaults from the local service. Current discussion fields are unchanged."
      )
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Language"), {
      target: {
        value: "zh-CN"
      }
    });
    expect(
      await screen.findByText(
        "\u5df2\u6709\u5c31\u7eea\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002Web \u9ed8\u8ba4\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\uff1b\u4ec5\u5728\u9700\u8981\u6f14\u793a\u6d41\u7a0b\u65f6\u4f7f\u7528\u6f14\u793a\u53c2\u4e0e\u8005\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u9009\u62e9\u8ba8\u8bba\u6df1\u5ea6")).toBeTruthy();
    expect(screen.getByText("\u66f4\u5e7f\u89c6\u89d2\u5ba1\u67e5")).toBeTruthy();
    expect(screen.getByText("\u89c6\u89d2 C")).toBeTruthy();
    expect(screen.getByText("\u521b\u5efa\u9884\u89c8")).toBeTruthy();
    expect(screen.getByText("\u5df2\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByText("\u53ef\u521b\u5efa\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba")).toBeTruthy();
    expect(screen.getByText("3 \u4e2a\u6a21\u578b\u89c6\u89d2")).toBeTruthy();
    expect(screen.getAllByText("\u521d\u59cb\u56de\u5e94\u6a21\u578b").length).toBeGreaterThan(1);
    expect(screen.getAllByText("\u5ba1\u67e5\u89d2\u8272\u6a21\u578b").length).toBeGreaterThan(1);
    expect(screen.getByText("\u89d2\u8272\u6a21\u578b\u9ed8\u8ba4\u8bbe\u7f6e")).toBeTruthy();
    expect(screen.getByText("\u4fdd\u5b58\u4e3a\u9ed8\u8ba4\u89d2\u8272\u8bbe\u7f6e")).toBeTruthy();
    expect(
      screen.getByText(
        "\u5df2\u4ece\u672c\u5730\u670d\u52a1\u6e05\u9664\u4fdd\u5b58\u7684\u89d2\u8272\u9ed8\u8ba4\u8bbe\u7f6e\u3002\u5f53\u524d\u8ba8\u8bba\u5b57\u6bb5\u4e0d\u53d8\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b")).toBeTruthy();
    expect(screen.getByText("\u89c6\u89d2\u6a21\u578b\u5206\u914d")).toBeTruthy();
    expect(screen.getByText("\u89c6\u89d2 A \u6a21\u578b")).toBeTruthy();
    expect(screen.getByText("\u89c6\u89d2 C \u6a21\u578b")).toBeTruthy();
    expect(screen.getByText("\u5df2\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b")).toBeTruthy();
    expect(
      screen.getByText(
        "\u81ea\u5b9a\u4e49\u89c6\u89d2\u6a21\u578b\u4ec5\u5f71\u54cd\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002\u8bbe\u7f6e\u4e86\u5ba1\u67e5\u89d2\u8272\u6a21\u578b\u65f6\uff0c\u5ba1\u67e5\u89d2\u8272\u4f7f\u7528\u8be5\u6a21\u578b\u3002"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "\u5ba1\u67e5\u89d2\u8272\u4f7f\u7528\u8fd9\u4e2a\u6a21\u578b\uff0c\u521d\u59cb\u56de\u5e94\u89c6\u89d2\u4fdd\u6301\u5404\u81ea\u5206\u914d\u7684\u6a21\u578b\u3002"
      )
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("\u8bed\u8a00"), {
      target: {
        value: "en"
      }
    });

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
          "Write all participant responses, review notes, and conclusions in the same language as the discussion question.",
          "Use configured model-backed participants from the local service.",
          "Use three independent model-backed perspectives from the local service.",
          "Keep provider credentials saved locally and out of the discussion."
        ]),
        output: expect.objectContaining({
          language: "English",
          expectations: expect.arrayContaining([
            "Write all participant responses, review notes, and conclusions in the same language as the discussion question."
          ])
        }),
        participants: expect.arrayContaining([
          expect.objectContaining({
            displayName: "Perspective A",
            adapterId: "openai-compatible",
            providerConfigId: "openai-main-perspective-a"
          }),
          expect.objectContaining({
            id: "provider-perspective-b",
            displayName: "Perspective B",
            adapterId: "openai-compatible",
            providerConfigId: "openai-main-participant-default"
          }),
          expect.objectContaining({
            id: "provider-perspective-c",
            displayName: "Perspective C",
            adapterId: "openai-compatible",
            providerConfigId: "openai-main-perspective-c"
          })
        ]),
        sealedDivergence: expect.objectContaining({
          participantIds: [
            "provider-perspective-a",
            "provider-perspective-b",
            "provider-perspective-c"
          ]
        }),
        providerConfigs: expect.arrayContaining([
          expect.objectContaining({
            id: "openai-main",
            adapterId: "openai-compatible",
            providerConfigId: "openai-main",
            modelId: "release-model-review",
            apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY"
          }),
          expect.objectContaining({
            id: "openai-main-participant-default",
            adapterId: "openai-compatible",
            providerConfigId: "openai-main",
            modelId: "release-model-v1",
            apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY"
          }),
          expect.objectContaining({
            id: "openai-main-perspective-a",
            adapterId: "openai-compatible",
            providerConfigId: "openai-main",
            modelId: "release-model-perspective-a",
            apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY"
          }),
          expect.objectContaining({
            id: "openai-main-perspective-c",
            adapterId: "openai-compatible",
            providerConfigId: "openai-main",
            modelId: "release-model-perspective-c",
            apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY"
          })
        ]),
        timeouts: {
          participantMs: 90000,
          overallMs: 240000
        }
      })
    );
    expect(JSON.stringify(runPlan)).not.toContain("sk-");
    expect(JSON.stringify(runPlan)).not.toContain("Use built-in sample participants only.");
  });

  it("uses the discussion question language for model-backed default brief text", async () => {
    const chineseTopic = "\u6211\u4eec\u5e94\u8be5\u5982\u4f55\u8bc4\u4f30\u771f\u5b9e\u6a21\u578b\u5ba1\u67e5\uff1f";
    const chineseLanguageInstruction =
      "\u6240\u6709\u53c2\u4e0e\u8005\u56de\u5e94\u3001\u5ba1\u67e5\u8bf4\u660e\u548c\u7ed3\u8bba\u90fd\u5e94\u4f7f\u7528\u8ba8\u8bba\u95ee\u9898\u7684\u540c\u4e00\u79cd\u8bed\u8a00\u3002";
    const runPlan = buildProviderBackedDiscussionRunPlan(
      {
        question: chineseTopic,
        goalsText: "",
        constraintsText: "",
        expectedOutcomeText: ""
      },
      {
        adapterId: "openai-compatible",
        providerConfigId: "openai-main",
        apiKeyEnvVar: "DELIBERUM_OPENAI_API_KEY"
      },
      {
        perspectiveCount: 3
      }
    );
    const serializedRunPlan = JSON.stringify(runPlan);

    expect(runPlan).toEqual(
      expect.objectContaining({
        topic: chineseTopic,
        goals: expect.arrayContaining([
          "\u6bd4\u8f83\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002",
          "\u4fdd\u6301\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7f3a\u5931\u8bc1\u636e\u53ef\u89c1\u3002"
        ]),
        constraints: expect.arrayContaining([
          chineseLanguageInstruction,
          "\u4f7f\u7528\u672c\u673a\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u53c2\u4e0e\u8005\u3002",
          "\u4f7f\u7528\u672c\u673a\u670d\u52a1\u4e2d\u7684\u4e09\u4e2a\u72ec\u7acb\u6a21\u578b\u89c6\u89d2\u3002",
          "\u8ba9\u6a21\u578b\u670d\u52a1\u51ed\u636e\u4fdd\u5b58\u5728\u672c\u673a\uff0c\u4e0d\u8fdb\u5165\u8ba8\u8bba\u5185\u5bb9\u3002"
        ]),
        output: expect.objectContaining({
          language: "Simplified Chinese",
          expectations: expect.arrayContaining([
            "\u5c55\u793a\u5f53\u524d\u7ed3\u8bba\u3002",
            "\u5217\u51fa\u4e3b\u8981\u89c2\u70b9\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
            chineseLanguageInstruction
          ])
        })
      })
    );
    expect(serializedRunPlan).not.toContain("Use configured model-backed participants from the local service.");
    expect(serializedRunPlan).not.toContain("Use three independent model-backed perspectives from the local service.");
    expect(serializedRunPlan).not.toContain("Keep provider credentials saved locally and out of the discussion.");
  });

  it("opens broader model-backed review from the setup start link", async () => {
    markOpenAICompatibleProviderVerified();
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue(createReadyOpenAISetupProfiles());

    renderApp("/runs/new?participants=model-backed&perspectives=3", client);

    expect(await screen.findByText("Model-backed start available")).toBeTruthy();
    expect(await screen.findByText("Model-backed discussion selected")).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
          .checked
      ).toBe(true)
    );
    expect(
      (screen.getByRole("radio", { name: /Broader review/i }) as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.getByText("Perspective C")).toBeTruthy();
    expect(screen.getByText("3 model perspectives")).toBeTruthy();
    expect(
      screen.getByText(
        "Perspective A, Perspective B, and Perspective C will answer independently."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
  });

  it("does not allow a model-backed start before provider verification", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue({
      profiles: [
        {
          id: "local-preset",
          name: "Local preset",
          enabled: true,
          status: "ready",
          components: [],
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
          components: [],
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

    renderApp("/runs/new?participants=model-backed", client);

    expect(await screen.findByText("Demo start, provider verification needed")).toBeTruthy();
    expect(
      screen.getByText(
        "The quick-start form can start now with demo participants. Use Verify connection on this page to unlock model-backed participants."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Provider setup is saved; use Verify connection here or in Setup / Models before relying on model-backed results."
      )
    ).toBeTruthy();
    expect(screen.getByText("Verify provider connection")).toBeTruthy();
    expect(
      screen.getByText(
        "Verify the saved provider connection here to continue with model-backed participants without returning to Setup / Models."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Model-backed discussion selected")).toBeNull();
    expect(
      (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText("Ready to create a demo discussion")).toBeTruthy();
    const verifyButton = screen.getByRole("button", { name: "Verify connection" });
    fireEvent.click(verifyButton);
    await waitFor(() => expect(client.verifyOpenAICompatibleSetup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Model-backed discussion selected")).toBeTruthy();
    expect(
      screen.getByText(
        "This discussion will use configured model participants from your local setup."
      )
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
          .checked
      ).toBe(true)
    );
    expect(
      (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
        .disabled
    ).toBe(false);
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("providerConfigId");
  });

  it("does not describe demo participants as available when only provider verification can unlock the start path", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue({
      profiles: [
        {
          id: "local-preset",
          name: "Local preset",
          enabled: false,
          status: "disabled",
          components: [],
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
          components: [],
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

    renderApp("/runs/new?participants=model-backed", client);

    expect(await screen.findByText("Provider verification needed")).toBeTruthy();
    expect(
      screen.getByText(
        "Use Verify connection on this page to unlock model-backed participants for this discussion."
      )
    ).toBeTruthy();
    expect(screen.getByText("Demo participants are not enabled in this local service.")).toBeTruthy();
    expect(screen.queryByText("Demo start, provider verification needed")).toBeNull();
    expect(screen.getByText("Verify provider connection")).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: /Demo participants/i }) as HTMLInputElement).disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Verify connection" }));
    await waitFor(() => expect(client.verifyOpenAICompatibleSetup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Model-backed discussion selected")).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole("radio", { name: /Model-backed participants/i }) as HTMLInputElement)
          .checked
      ).toBe(true)
    );
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("providerConfigId");
  });

  it("localizes start page provider verification in Simplified Chinese", async () => {
    const client = createClient();
    vi.mocked(client.getRuntimeProfiles).mockResolvedValue({
      profiles: [
        {
          id: "local-preset",
          name: "Local preset",
          enabled: true,
          status: "ready",
          components: [],
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
          components: [],
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

    renderApp("/runs/new?participants=model-backed", client, {
      initialLanguage: "zh-CN"
    });

    expect(await screen.findByText("\u9a8c\u8bc1\u63d0\u4f9b\u65b9\u8fde\u63a5")).toBeTruthy();
    expect(
      screen.getByText(
        "\u5728\u6b64\u9a8c\u8bc1\u5df2\u4fdd\u5b58\u7684\u63d0\u4f9b\u65b9\u8fde\u63a5\uff0c\u5373\u53ef\u7ee7\u7eed\u4f7f\u7528\u6a21\u578b\u652f\u6301\u7684\u53c2\u4e0e\u8005\uff0c\u65e0\u9700\u8fd4\u56de\u8bbe\u7f6e / \u6a21\u578b\u3002"
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "\u9a8c\u8bc1\u8fde\u63a5" }));
    await waitFor(() => expect(client.verifyOpenAICompatibleSetup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("\u5df2\u9009\u62e9\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("providerConfigId");
  });

  it("keeps advanced provider profiles out of the default discussion start path", async () => {
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
          status: "needs_configuration",
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
            missingRecommendedEnvVars: ["DELIBERUM_OPENAI_API_KEY"],
            notes: []
          },
          boundaries: []
        },
        {
          id: "http-template",
          name: "HTTP-template",
          enabled: true,
          status: "ready",
          components: [
            {
              id: "http-template",
              kind: "participant_adapter",
              enabled: true
            }
          ],
          setup: {
            enableEnvVar: "DELIBERUM_ENABLE_HTTP_TEMPLATE_PROFILE",
            envVars: [
              {
                name: "DELIBERUM_HTTP_TEMPLATE_URL",
                configured: true,
                secret: false,
                required: true,
                purpose: "Required HTTP template endpoint URL."
              }
            ],
            missingRecommendedEnvVars: [],
            notes: []
          },
          boundaries: []
        }
      ]
    });

    renderApp("/runs/new?participants=model-backed", client);

    expect(await screen.findByText("Demo start ready")).toBeTruthy();
    expect(
      screen.getByText(
        "No real model provider is ready yet. Configure one locally before relying on model-backed discussions."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Model-backed discussion selected")).toBeNull();
    expect(screen.queryByText("HTTP-template")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_HTTP_TEMPLATE_URL");

    const demoSource = screen.getByRole("radio", {
      name: /Demo participants/i
    }) as HTMLInputElement;
    const modelBackedSource = screen.getByRole("radio", {
      name: /Model-backed participants/i
    }) as HTMLInputElement;

    expect(demoSource.checked).toBe(true);
    expect(modelBackedSource.disabled).toBe(true);
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

    expect(await screen.findByText("\u7ed3\u8bba\u5df2\u5c31\u7eea")).toBeTruthy();
    expect(screen.getAllByText("\u8ba8\u8bba\u5ba4").length).toBeGreaterThan(0);
    const localizedRoomStatus = screen.getByRole("status", {
      name: "\u8ba8\u8bba\u5ba4\u72b6\u6001"
    });
    expect(localizedRoomStatus.textContent ?? "").toContain("\u7ed3\u8bba\u5df2\u5c31\u7eea");
    expect(localizedRoomStatus.textContent ?? "").toContain("\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba");
    const localizedRoomOverview = screen.getByRole("region", {
      name: "\u8ba8\u8bba\u5ba4\u6982\u89c8"
    });
    expect(localizedRoomOverview).toBeTruthy();
    expect(localizedRoomOverview.textContent ?? "").toContain("\u6700\u65b0\u53d1\u8a00");
    expect(localizedRoomOverview.textContent ?? "").toContain("\u6700\u8fd1\u8c01\u53d1\u4e86\u8a00");
    expect(localizedRoomOverview.textContent ?? "").toContain("\u5f53\u524d\u9636\u6bb5");
    expect(localizedRoomOverview.textContent ?? "").toContain("\u5ba1\u9605\u961f\u5217");
    expect(
      document.querySelector('[aria-label="\u623f\u95f4\u53c2\u4e0e\u8005"]')
    ).toBeTruthy();
    expect(screen.queryByText("\u8ba8\u8bba\u7b80\u62a5\u8be6\u60c5")).toBeNull();
    expect(document.querySelector(".du-room-brief")).toBeNull();
    expect(screen.getByText("\u8ba8\u8bba\u65f6\u95f4\u7ebf")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u5ba4\u4e2d\u53d1\u751f\u4e86\u4ec0\u4e48")).toBeTruthy();
    expect(screen.getByRole("region", { name: "\u5bf9\u8bdd\u8bb0\u5f55" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "\u8ba8\u8bba\u7b80\u62a5\u66f4\u65b0" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "\u8ba8\u8bba\u7b2c 1 \u8f6e\u53d1\u8a00" })).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u7b2c 1 \u8f6e")).toBeTruthy();
    expect(
      screen.getByText(
        "\u53c2\u4e0e\u8005\u5148\u56de\u5e94\u8ba8\u8bba\u7b80\u62a5\uff1b\u7136\u540e\u7ec4\u7ec7\u8005\u3001\u5ba1\u67e5\u8005\u548c\u8bc1\u636e\u68c0\u67e5\u8005\u4ee5\u804a\u5929\u5f0f\u56de\u590d\u52a0\u5165\u3002"
      )
    ).toBeTruthy();
    expect(screen.getAllByText("\u56de\u5e94\u8ba8\u8bba\u7b80\u62a5").length).toBeGreaterThan(1);
    expect(screen.getByText("\u5206\u4eab\u4e86\u8ba8\u8bba\u7b80\u62a5")).toBeTruthy();
    expect(screen.getByText("\u63d0\u4ea4\u4e86\u5c01\u5b58\u7684\u521d\u59cb\u56de\u5e94")).toBeTruthy();
    expect(
      screen.getByText(
        "\u5728\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u63ed\u793a\u524d\uff0c\u6b64\u56de\u5e94\u4fdd\u6301\u5c01\u5b58\u3002"
      )
    ).toBeTruthy();
    const localizedSystemMessages = Array.from(
      document.querySelectorAll('[aria-label="\u8ba8\u8bba\u5ba4\u66f4\u65b0"]')
    ).map((message) => message.textContent ?? "");
    expect(localizedSystemMessages.length).toBeGreaterThan(0);
    expect(localizedSystemMessages.join(" ")).toContain("\u8ba8\u8bba\u5ba4");
    expect(localizedSystemMessages.join(" ")).toContain("\u5206\u4eab\u4e86\u8ba8\u8bba\u7b80\u62a5");
    const localizedStageSummaries = Array.from(
      document.querySelectorAll('[aria-label="\u9636\u6bb5\u6d3b\u52a8\u6458\u8981"]')
    ).map((summary) => summary.textContent ?? "");
    expect(localizedStageSummaries.join(" ")).toContain("1 \u4e2a\u66f4\u65b0");
    expect(localizedStageSummaries.join(" ")).toContain("\u6ca1\u6709\u53c2\u4e0e\u8005\u8d21\u732e");
    expect(localizedStageSummaries.join(" ")).toContain("\u53c2\u4e0e\u8005\u8d21\u732e");
    expect(
      document.querySelectorAll(
        ".du-room-activity-item[data-speaker='participant'] .du-room-message-context"
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("region", { name: "\u8ba8\u8bba\u5ba4\u8fdb\u5ea6\u6458\u8981" })
    ).toBeNull();
    expect(screen.getAllByText("\u5f53\u524d\u9636\u6bb5").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("\u5f53\u524d\u7ed3\u8bba\u53ef\u5ba1\u9605").length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("\u4e0b\u4e00\u4e2a\u68c0\u67e5\u70b9")).toBeNull();
    expect(screen.queryByText("\u4f9d\u8d56\u524d\u9700\u5ba1\u9605")).toBeNull();
    const localizedDiscussionOutputs = document.querySelector(
      ".du-room-outputs-section"
    ) as HTMLDetailsElement | null;
    expect(localizedDiscussionOutputs).toBeNull();
    expect(screen.queryByText("\u8ba8\u8bba\u5ba4\u4ea7\u51fa\u6458\u8981")).toBeNull();
    expect(
      screen.queryByText(
        "\u5feb\u901f\u8df3\u8f6c\u5230\u9009\u9879\u3001\u5206\u6b67\u3001\u8bc1\u636e\u548c\u7ed3\u8bba"
      )
    ).toBeNull();
    const localizedActionPath = screen.getByRole("region", {
      name: "\u63a8\u8350\u64cd\u4f5c\u8def\u5f84"
    });
    expect(localizedActionPath).toBeTruthy();
    expect(localizedActionPath.textContent ?? "").toContain("\u63a8\u8350\u8def\u5f84");
    expect(localizedActionPath.textContent ?? "").toContain("\u4ece\u8fd9\u91cc\u5f00\u59cb");
    expect(localizedActionPath.textContent ?? "").toContain("\u9009\u62e9\u8ddf\u8fdb\u52a8\u4f5c");
    const localizedDiscussionActionsText =
      document.querySelector(".du-discussion-actions")?.textContent ?? "";
    expect(screen.queryByRole("navigation", { name: "\u8ba8\u8bba\u52a8\u4f5c" })).toBeNull();
    expect(document.querySelector(".du-room-action-strip")).toBeNull();
    expect(localizedDiscussionActionsText).toContain("\u5feb\u6377\u56de\u590d");
    expect(localizedDiscussionActionsText).toContain("\u56de\u590d\u8ba8\u8bba\u5ba4");
    expect(localizedDiscussionActionsText).not.toContain("\u8ba8\u8bba\u5ba4\u52a8\u4f5c");
    expect(localizedDiscussionActionsText).not.toContain("\u63a5\u4e0b\u6765\u8981\u505a\u4ec0\u4e48\uff1f");
    expect(localizedDiscussionActionsText).not.toContain("\u66f4\u65b0\u8ba8\u8bba");
    expect(localizedDiscussionActionsText).not.toContain("\u4ec5\u67e5\u770b");
    expect(localizedDiscussionActionsText).not.toContain(
      "\u5b8c\u6210\u540e\uff0c\u8bf7\u67e5\u770b\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf\u548c\u5f53\u524d\u7ed3\u8bba\u3002"
    );
    expect(localizedDiscussionActionsText).not.toContain(
      "\u4ec5\u8df3\u8f6c\u67e5\u770b\uff1b\u4e0d\u4f1a\u6539\u53d8\u8ba8\u8bba\u3002"
    );
    expect(screen.queryByText("\u5f53\u524d\u6700\u5f3a\u9009\u9879\u7684\u5185\u5bb9")).toBeNull();
    expect(screen.getByRole("complementary", { name: "\u5f53\u524d\u8ba8\u8bba\u6458\u8981" })).toBeTruthy();
    expect(screen.getByText("\u51b3\u7b56\u5de5\u4f5c\u533a")).toBeTruthy();
    expect(screen.getByText("\u5f53\u524d\u7ed3\u8bba\uff1a\u53ef\u5ba1\u9605")).toBeTruthy();
    expect(screen.getAllByText("\u4e0b\u4e00\u6b65\u52a8\u4f5c").length).toBeGreaterThan(0);
    expect(screen.getByText("\u9700\u8981\u5ba1\u9605\u7684\u5185\u5bb9")).toBeTruthy();
    expect(screen.queryByText("\u8ba8\u8bba\u5ba4\u8be6\u60c5")).toBeNull();
    expect(
      screen.queryByText(
        "\u9605\u8bfb\u5bf9\u8bdd\u540e\uff0c\u518d\u6253\u5f00\u7b80\u62a5\u3001\u8fdb\u5ea6\u3001\u9009\u9879\u548c\u62a5\u544a\u5f0f\u5ba1\u9605\u8be6\u60c5\u3002"
      )
    ).toBeNull();
    expect(screen.queryByText("\u5ba1\u9605\u72b6\u6001\u6458\u8981")).toBeNull();
    expect(
      screen.queryByText(
        "\u9605\u8bfb\u8ba8\u8bba\u5ba4\u5bf9\u8bdd\u540e\uff0c\u518d\u4f7f\u7528\u8fd9\u4e2a\u62a5\u544a\u5f0f\u72b6\u6001\u6458\u8981\u3002"
      )
    ).toBeNull();
    expect(
      (document.querySelector(".du-room-review-drawer") as HTMLDetailsElement | null)?.open
    ).toBeUndefined();
    expect(screen.getAllByText("\u5ba1\u9605\u5f53\u524d\u7ed3\u8bba").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u5f53\u524d\u7ed3\u8bba").length).toBeGreaterThan(0);
    const localizedDetailPanelsDrawer = document.querySelector(
      'details.du-advanced-panel[data-advanced-panel="Structured discussion details"]'
    ) as HTMLDetailsElement | null;
    expect(localizedDetailPanelsDrawer).toBeTruthy();
    expect(localizedDetailPanelsDrawer?.open).toBe(false);
    expect(screen.queryByText("\u8be6\u7ec6\u5ba1\u9605\u9762\u677f")).toBeNull();
    fireEvent.click(await findAdvancedModeSummaryByPanelText("Structured discussion details"));
    expect(localizedDetailPanelsDrawer?.open).toBe(true);
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

  it("keeps successful post-action updates out of the default Simplified Chinese room path", async () => {
    const client = renderApp("/runs/run-1", createClient(), {
      initialLanguage: "zh-CN"
    });

    fireEvent.click(await screen.findByRole("button", { name: "\u7ee7\u7eed\u8ba8\u8bba" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "\u6700\u65b0\u8ba8\u8bba\u66f4\u65b0" })).toBeNull();
    expect(
      screen.queryByRole("navigation", {
        name: "\u8ba8\u8bba\u5ba4\u66f4\u65b0\u5feb\u6377\u5165\u53e3"
      })
    ).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: "\u66f4\u65b0\u540e\u5ba1\u9605\u8def\u5f84"
      })
    ).toBeNull();
  });

  it("localizes paused room updates in Simplified Chinese", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        startRun: vi.fn(async () => ({
          run: runDetail,
          stages: [
            {
              stage: "sealed_divergence",
              executionStatus: "executed",
              roundId: "sealed-round-1",
              status: "partial",
              eventIds: ["event-2"]
            }
          ],
          stopped: true,
          stopReason: {
            kind: "participant_incomplete",
            participantId: "participant-b"
          }
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    fireEvent.click(await screen.findByRole("button", { name: "\u7ee7\u7eed\u8ba8\u8bba" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const latestUpdate = await screen.findByRole("region", {
      name: "\u6700\u65b0\u8ba8\u8bba\u66f4\u65b0"
    });
    expect(latestUpdate).toBeTruthy();
    expect(latestUpdate.classList.contains("du-room-update-message")).toBe(true);
    expect(latestUpdate.querySelector(".du-room-update-avatar")).toBeTruthy();
    expect(latestUpdate.textContent ?? "").toContain("\u8ba8\u8bba\u5ba4\u66f4\u65b0");
    expect(latestUpdate.textContent ?? "").toContain("\u8ba8\u8bba\u5ba4\u521a\u521a\u66f4\u65b0");
    expect(latestUpdate.textContent ?? "").not.toContain(
      "\u8bf7\u5148\u5ba1\u9605\u6b64\u8ba8\u8bba\u5ba4\u66f4\u65b0\uff0c\u7136\u540e\u56de\u5230\u65f6\u95f4\u7ebf\u3001\u8ba8\u8bba\u4ea7\u51fa\u6216\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002"
    );
    const updateShortcuts = screen.getByRole("navigation", {
      name: "\u8ba8\u8bba\u5ba4\u66f4\u65b0\u5feb\u6377\u5165\u53e3"
    });
    expect(updateShortcuts.textContent ?? "").toContain(
      "\u5ba1\u9605\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf"
    );
    expect(updateShortcuts.textContent ?? "").toContain("\u5ba1\u9605\u8ba8\u8bba\u4ea7\u51fa");
    expect(updateShortcuts.textContent ?? "").toContain("\u67e5\u770b\u5f53\u524d\u7ed3\u8bba");
    const updateDetails = latestUpdate.querySelector(
      ".du-room-update-details"
    ) as HTMLDetailsElement | null;
    const updateDetailsBody = latestUpdate.querySelector(
      ".du-room-update-details-body"
    ) as HTMLElement | null;
    expect(updateDetails).toBeTruthy();
    expect(updateDetailsBody).toBeTruthy();
    expect(updateDetails?.open).toBe(false);
    expect(
      updateDetailsBody?.matches(
        ".du-room-update-details:not([open]) > .du-room-update-details-body"
      )
    ).toBe(true);
    expect(latestUpdate.textContent ?? "").toContain("\u67e5\u770b\u8be6\u7ec6\u66f4\u65b0");
    expect(latestUpdate.textContent ?? "").toContain(
      "\u5982\u679c\u9700\u8981\u5b8c\u6574\u52a8\u4f5c\u7ed3\u679c\uff0c\u53ef\u6253\u5f00\u8be6\u7ec6\u6b65\u9aa4\u6458\u8981\u3002"
    );
    fireEvent.click(screen.getByText("\u67e5\u770b\u8be6\u7ec6\u66f4\u65b0"));
    expect(updateDetails?.open).toBe(true);
    expect(
      updateDetailsBody?.matches(
        ".du-room-update-details:not([open]) > .du-room-update-details-body"
      )
    ).toBe(false);
    const resultHandoff = await screen.findByRole("region", {
      name: "\u66f4\u65b0\u540e\u5ba1\u9605\u8def\u5f84"
    });
    expect(resultHandoff).toBeTruthy();
    expect(latestUpdate.contains(resultHandoff)).toBe(true);
    expect(resultHandoff.classList.contains("du-result-handoff-room")).toBe(true);
    expect(resultHandoff.textContent ?? "").toContain("\u8ba8\u8bba\u5ba4\u63a5\u529b");
    expect(resultHandoff.textContent ?? "").toContain("\u56de\u5230\u8ba8\u8bba\u5ba4");
    expect(resultHandoff.textContent ?? "").toContain(
      "\u5ba1\u9605\u66f4\u65b0\u540e\u7684\u65f6\u95f4\u7ebf"
    );
    expect(resultHandoff.textContent ?? "").toContain("\u5ba1\u9605\u8ba8\u8bba\u4ea7\u51fa");
    expect(resultHandoff.textContent ?? "").toContain("\u67e5\u770b\u5f53\u524d\u7ed3\u8bba");
    const updatedSteps = screen.getByRole("region", {
      name: "\u5df2\u66f4\u65b0\u7684\u8ba8\u8bba\u6b65\u9aa4"
    });
    expect(updatedSteps.classList.contains("du-readable-stage-result-room")).toBe(true);
    expect(updatedSteps.textContent ?? "").toContain("\u8ba8\u8bba\u5ba4\u8fdb\u5c55");
    expect(updatedSteps.textContent ?? "").toContain(
      "\u8ba8\u8bba\u5ba4\u521a\u521a\u505a\u4e86\u4ec0\u4e48"
    );
  });

  it("localizes the post-action handoff before a conclusion is ready", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: localPresetNotStartedRunDetail
        })),
        startRun: vi.fn(async () => ({
          run: {
            ...localPresetNotStartedRunDetail,
            status: "running",
            sealedDivergenceStatus: "completed"
          },
          stages: [
            {
              stage: "sealed_divergence",
              executionStatus: "executed",
              roundId: "sealed-round-1",
              status: "completed",
              eventIds: ["event-2", "event-3"]
            }
          ],
          stopped: false
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    fireEvent.click(await screen.findByRole("button", { name: "\u7ee7\u7eed\u8ba8\u8bba" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("region", {
        name: "\u66f4\u65b0\u540e\u5ba1\u9605\u8def\u5f84"
      })
    ).toBeNull();
    expect(screen.queryByRole("region", { name: "\u6700\u65b0\u8ba8\u8bba\u66f4\u65b0" })).toBeNull();
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
    expect(await screen.findByRole("region", { name: "\u8ba8\u8bba\u5ba4\u6982\u89c8" })).toBeTruthy();
    expect(screen.queryByText("\u8ba8\u8bba\u7b80\u62a5\u8be6\u60c5")).toBeNull();
    expect(document.querySelector(".du-room-brief")).toBeNull();
    const roomText = document.querySelector(".du-room-main")?.textContent ?? "";
    expect(roomText).toContain(
      "\u6211\u4eec\u5e94\u5982\u4f55\u5728\u4f9d\u8d56\u62df\u8bae\u53d1\u5e03\u524d\u5ba1\u67e5\u5b83\uff1f"
    );
    expect(roomText).toContain("\u53c2\u4e0e\u8005\u4f1a\u6309\u987a\u5e8f\u56f4\u7ed5\u7b80\u62a5\u8ba8\u8bba");
    expect(roomText).toContain("\u7b2c 1 \u8f6e");
    expect(roomText).not.toContain(
      "How should we review a proposed rollout before relying on it?"
    );
    expect(roomText).not.toContain("Compare the strongest current options.");
    expect(roomText).not.toContain("Keep the walkthrough deterministic and reviewable.");
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
    expect(await screen.findByRole("region", { name: "Discussion room overview" })).toBeTruthy();
    expect(screen.queryByText("Discussion brief details")).toBeNull();
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
            "Write all participant responses, review notes, and conclusions in the same language as the discussion question.",
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
            language: "English",
            style: "clear",
            expectations: expect.arrayContaining([
              "Summarize the conclusion, disagreements, risks, and next steps.",
              "Write all participant responses, review notes, and conclusions in the same language as the discussion question."
            ])
          })
        })
      })
    );
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByRole("region", { name: "Discussion room overview" })).toBeTruthy();
    expect(screen.queryByText("Discussion brief details")).toBeNull();
    expect(screen.getAllByText("Discussion room").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Open discussion room" })).toBeNull();
    expect(screen.queryByText("Discussion created")).toBeNull();
    expect(screen.queryByRole("link", { name: "Review discussion brief" })).toBeNull();
  });

  it("asks participants to answer in the same language as the discussion question", async () => {
    const client = renderApp("/runs/new");
    const chineseTopic = "\u6211\u4eec\u5e94\u8be5\u5982\u4f55\u8bc4\u4f30\u65b0\u529f\u80fd\u53d1\u5e03\uff1f";
    const chineseLanguageInstruction =
      "\u6240\u6709\u53c2\u4e0e\u8005\u56de\u5e94\u3001\u5ba1\u67e5\u8bf4\u660e\u548c\u7ed3\u8bba\u90fd\u5e94\u4f7f\u7528\u8ba8\u8bba\u95ee\u9898\u7684\u540c\u4e00\u79cd\u8bed\u8a00\u3002";

    expect((await screen.findAllByText("Start a discussion")).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Discussion question"), {
      target: {
        value: chineseTopic
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create discussion" }));

    await waitFor(() => expect(client.createRun).toHaveBeenCalled());
    const createRunInput = vi.mocked(client.createRun).mock.calls[0]?.[0];
    const runPlan = createRunInput?.runPlan as Record<string, unknown>;
    const serializedRunPlan = JSON.stringify(runPlan);

    expect(runPlan).toEqual(
      expect.objectContaining({
        topic: chineseTopic,
        goals: expect.arrayContaining([
          "\u6bd4\u8f83\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002",
          "\u4fdd\u6301\u672a\u89e3\u51b3\u5206\u6b67\u548c\u7f3a\u5931\u8bc1\u636e\u53ef\u89c1\u3002"
        ]),
        constraints: expect.arrayContaining([
          chineseLanguageInstruction,
          "\u4f7f\u7528\u5185\u7f6e\u793a\u4f8b\u53c2\u4e0e\u8005\u3002",
          "\u5728\u4eba\u5de5\u5ba1\u9605\u524d\uff0c\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\u3002"
        ]),
        output: expect.objectContaining({
          language: "Simplified Chinese",
          expectations: expect.arrayContaining([
            "\u5c55\u793a\u5f53\u524d\u7ed3\u8bba\u3002",
            "\u5217\u51fa\u4e3b\u8981\u89c2\u70b9\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u98ce\u9669\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
            chineseLanguageInstruction
          ])
        })
      })
    );
    expect(serializedRunPlan).not.toContain("Compare the strongest current options.");
    expect(serializedRunPlan).not.toContain("Use built-in sample participants only.");
    expect(serializedRunPlan).not.toContain("Show the current conclusion.");
  });

  it("guides start discussion users when the local service is unavailable", async () => {
    const client = createClient({
      getRuntimeProfiles: vi.fn(async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3877");
      })
    });

    renderApp("/runs/new", client);

    expect(await screen.findByText("Start the local service")).toBeTruthy();
    expect(screen.getByText("Local service command")).toBeTruthy();
    expect(
      screen.getByText(
        "corepack pnpm build && corepack pnpm start:local"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Web cannot read setup or discussions until the local Deliberum service is running."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "After the service responds, open Setup / Models to add the provider API key, base URL, and model."
      )
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Discussion question"), {
      target: {
        value: "Should we use a model-backed discussion?"
      }
    });
    expect(
      (screen.getByRole("button", { name: "Create discussion" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(document.body.textContent ?? "").not.toContain("ECONNREFUSED");
    expect(document.body.textContent ?? "").not.toContain("127.0.0.1:3877");
    expect(client.createRun).not.toHaveBeenCalled();
  });

  it("localizes the start discussion local service guide", async () => {
    const client = createClient({
      getRuntimeProfiles: vi.fn(async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3877");
      })
    });

    renderApp("/runs/new", client, {
      initialLanguage: "zh-CN"
    });

    expect(await screen.findByText("\u542f\u52a8\u672c\u5730\u670d\u52a1")).toBeTruthy();
    expect(screen.getByText("\u672c\u5730\u670d\u52a1\u547d\u4ee4")).toBeTruthy();
    expect(screen.getByText("3. \u5728 Web \u4e2d\u914d\u7f6e\u6a21\u578b")).toBeTruthy();
    expect(
      screen.getByText(
        "\u670d\u52a1\u54cd\u5e94\u540e\uff0c\u6253\u5f00\u8bbe\u7f6e / \u6a21\u578b\u6dfb\u52a0\u63d0\u4f9b\u65b9 API key\u3001base URL \u548c\u6a21\u578b\u3002"
      )
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("\u8ba8\u8bba\u95ee\u9898"), {
      target: {
        value: "\u662f\u5426\u5e94\u8be5\u542f\u52a8\u4e00\u4e2a\u6a21\u578b\u652f\u6301\u7684\u8ba8\u8bba\uff1f"
      }
    });
    expect(
      (screen.getByRole("button", { name: "\u521b\u5efa\u8ba8\u8bba" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(document.body.textContent ?? "").not.toContain("ECONNREFUSED");
    expect(document.body.textContent ?? "").not.toContain("127.0.0.1:3877");
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
    ).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain("Run Alpha");
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    expect(client.getRunProcessProposals).not.toHaveBeenCalled();
    expect(client.getProcessProposalStates).not.toHaveBeenCalled();

    expect(screen.queryByText("Question")).toBeNull();
    expect(screen.queryByText("Inspect run state")).toBeNull();
    expect(screen.queryByText("Keep outcomes provisional")).toBeNull();
    expect(screen.queryByText("Discussion is ready to review")).toBeNull();
    expect(document.querySelector(".du-page-header")).toBeNull();
    expect(document.querySelector(".du-page-actions")).toBeNull();
    const roomOverview = screen.getByRole("region", { name: "Discussion room overview" });
    expect(roomOverview).toBeTruthy();
    expect(roomOverview.textContent ?? "").toContain("Discussion room");
    expect(roomOverview.textContent ?? "").toContain("Latest messages");
    expect(roomOverview.textContent ?? "").toContain("Who spoke most recently");
    expect(roomOverview.textContent ?? "").toContain("Current phase");
    expect(roomOverview.textContent ?? "").toContain("Review queue");
    expect(roomOverview.textContent ?? "").toContain("Review current conclusion");
    const roomStatus = within(roomOverview).getByRole("status", { name: "Room status" });
    expect(roomStatus.textContent ?? "").toContain("Conclusion ready");
    expect(roomStatus.textContent ?? "").toContain("Review current conclusion");
    expect(document.querySelector('[aria-label="Room participants"]')).toBeTruthy();
    expect(screen.getByRole("list", { name: "Latest participant messages" })).toBeTruthy();
    expect(document.querySelectorAll(".du-room-message-preview").length).toBeGreaterThan(0);
    expect(document.querySelector(".du-room-status-cue")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Primary discussion actions" })
    ).toBeNull();
    expect(screen.queryByRole("region", { name: "Discussion action composer" })).toBeNull();
    expect(screen.getByRole("region", { name: "Room quick replies" })).toBeTruthy();
    expect(screen.queryByText("Discussion action composer")).toBeNull();
    expect(screen.getByText("Quick replies")).toBeTruthy();
    expect(screen.getByText("Reply to the room")).toBeTruthy();
    expect(screen.queryByText("Room actions")).toBeNull();
    expect(document.querySelector(".du-room-composer-copy")).toBeTruthy();
    expect(document.querySelector(".du-room-composer-avatar")).toBeTruthy();
    expect(document.querySelector(".du-room-composer")?.getAttribute("data-placement")).toBe(
      "room-action-dock"
    );
    expect(
      (document.querySelector(".du-room-composer .du-continuation-details") as HTMLDetailsElement)
        ?.open
    ).toBe(false);
    expect(screen.queryByText("What should happen next?")).toBeNull();
    expect(
      screen.getByText("Choose a quick reply to review or move the discussion forward.")
    ).toBeTruthy();
    expect(
      screen.getByText("Start another readable round from the current room state.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue discussion" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask for stronger options" })).toBeTruthy();
    const discussionActions = document.querySelector(".du-discussion-actions") as HTMLElement;
    expect(
      within(discussionActions).getByRole("link", { name: "Review disagreements" })
    ).toBeTruthy();
    expect(
      within(discussionActions).getByRole("link", { name: "Confirm answer requirements" })
    ).toBeTruthy();
    expect(
      within(discussionActions)
        .getByRole("link", { name: "Confirm answer requirements" })
        .getAttribute("href")
    ).toBe("/runs/run-1/outcome");
    expect(within(discussionActions).getByRole("link", { name: "Check evidence" })).toBeTruthy();
    const discussionActionsText =
      discussionActions.textContent ?? "";
    expect(discussionActionsText).not.toContain("Updates discussion");
    expect(discussionActionsText).not.toContain("Review only");
    expect(discussionActionsText).not.toContain(
      "After it finishes, review the updated timeline and current conclusion."
    );
    expect(discussionActionsText).not.toContain(
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
    expect(discussionActionsText).not.toContain("Recommended");
    expect(document.body.textContent ?? "").not.toContain("7 recorded lifecycle events");
    expect(screen.getAllByText("Discussion room").length).toBeGreaterThan(0);
    expect(screen.queryByText("Discussion brief details")).toBeNull();
    expect(screen.getByText("Discussion timeline")).toBeTruthy();
    expect(screen.getByText("What has happened in the room")).toBeTruthy();
    expect(screen.getByText("Conversation transcript")).toBeTruthy();
    expect(screen.getByText("What the room said and did")).toBeTruthy();
    expect(screen.getByText("Participant messages and room updates appear in order.")).toBeTruthy();
    const timeline = document.querySelector('[aria-label="Discussion timeline"]');
    const chatShell = timeline?.querySelector(".du-room-chat-shell");
    const transcript = timeline?.querySelector(".du-room-activity-wrap");
    const threadSummary = timeline?.querySelector(".du-room-thread-summary");
    const threadIntro = transcript?.querySelector(".du-room-thread-intro");
    const progressDetailsInTimeline = timeline?.querySelector(".du-room-progress-details");
    const nextRoomAction = timeline?.querySelector("#room-next-action");
    const roomActionRail = timeline?.querySelector(".du-room-action-rail");
    const roomMain = document.querySelector(".du-room-main");
    const roomHeader = document.querySelector(".du-room-header");
    const roomActionStrip = document.querySelector(".du-room-action-strip");
    const roomComposer = document.querySelector(".du-room-composer");
    const roomBrief = document.querySelector(".du-room-brief") as HTMLDetailsElement | null;
    const roomOutputs = document.querySelector(".du-room-outputs-section");
    const roomDetailsDrawer = document.querySelector(
      ".du-room-secondary-details"
    ) as HTMLDetailsElement | null;
    const progressDetails = document.querySelector(".du-room-progress-details");
    const detailPanelsDrawer = document.querySelector(
      'details.du-advanced-panel[data-advanced-panel="Structured discussion details"]'
    ) as HTMLDetailsElement | null;
    const detailPanels = document.querySelector('[aria-label="Discussion detail panels"]');
    expect(timeline).toBeTruthy();
    expect(chatShell).toBeTruthy();
    expect(transcript).toBeTruthy();
    expect(transcript?.getAttribute("id")).toBe("room-conversation-transcript");
    expect(threadSummary).toBeTruthy();
    expect(threadIntro).toBeTruthy();
    expect(progressDetailsInTimeline).toBeNull();
    expect(progressDetails).toBeNull();
    expect(nextRoomAction).toBeTruthy();
    expect(roomActionRail).toBeTruthy();
    expect(roomMain).toBeTruthy();
    expect(roomHeader).toBeTruthy();
    expect(roomActionStrip).toBeNull();
    expect(roomComposer).toBeTruthy();
    expect(roomBrief).toBeNull();
    expect(roomOutputs).toBeNull();
    expect(roomDetailsDrawer).toBeNull();
    expect(detailPanelsDrawer).toBeTruthy();
    expect(detailPanels).toBeNull();
    expect(detailPanelsDrawer?.open).toBe(false);
    expect(screen.queryByText("Detailed review panels")).toBeNull();
    expect(screen.getAllByText("Advanced / Developer Mode").length).toBeGreaterThan(0);
    expect(roomMain?.contains(roomHeader as Node)).toBe(true);
    expect(roomMain?.contains(roomComposer as Node)).toBe(true);
    expect(timeline?.contains(roomComposer as Node)).toBe(true);
    expect(chatShell?.contains(transcript as Node)).toBe(true);
    expect(chatShell?.contains(roomActionRail as Node)).toBe(true);
    expect(transcript?.contains(roomComposer as Node)).toBe(false);
    expect(roomActionRail?.contains(roomComposer as Node)).toBe(true);
    expect(screen.queryByRole("navigation", { name: "Discussion actions" })).toBeNull();
    expect(
      Boolean(
        roomHeader?.compareDocumentPosition(timeline as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(document.querySelector(".du-room-brief-body")).toBeNull();
    expect(document.querySelector(".du-discussion-dashboard-grid")).toBeNull();
    expect(document.querySelector(".du-discussion-next-actions")).toBeNull();
    expect(
      Boolean(
        transcript?.compareDocumentPosition(roomComposer as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      Boolean(
        transcript?.compareDocumentPosition(nextRoomAction as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      Boolean(
        transcript?.compareDocumentPosition(roomComposer as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(screen.queryByText("Room details")).toBeNull();
    expect(screen.queryByText("Room progress and stages")).toBeNull();
    expect(screen.getByRole("region", { name: "Conversation transcript" })).toBeTruthy();
    expect(document.querySelector(".du-room-thread-summary")?.classList.contains("du-sr-only")).toBe(
      true
    );
    expect(document.querySelector(".du-room-thread-intro")?.classList.contains("du-sr-only")).toBe(
      true
    );
    expect(screen.getByRole("region", { name: "Next in the room" })).toBeTruthy();
    expect(
      screen.getByText(
        "The room has enough material for review. Start with the conclusion, then choose whether to inspect disagreements, check evidence, or update the discussion."
      )
    ).toBeTruthy();
    const nextRoomActionText = nextRoomAction?.textContent ?? "";
    expect(nextRoomActionText).toContain("Review queue:");
    expect(nextRoomActionText).toContain("open disagreements");
    expect(nextRoomActionText).toContain("missing evidence");
    expect(nextRoomActionText).toContain("requirements to satisfy");
    expect(screen.getByRole("list", { name: "Discussion brief updates" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Discussion round 1 messages" })).toBeTruthy();
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(screen.getByText("Raised an open disagreement")).toBeTruthy();
    expect(
      screen.getAllByText(
        "1 open disagreement still needs resolution before relying on the conclusion."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Evidence checker").length).toBeGreaterThan(0);
    expect(screen.getByText("Reviewed evidence gaps")).toBeTruthy();
    expect(
      screen.getAllByText("1 evidence gap still needs checking before relying on the conclusion.")
        .length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Discussion round marker").length).toBeGreaterThan(0);
    expect(screen.getByText("Room opening")).toBeTruthy();
    expect(screen.getByText("Discussion round 1")).toBeTruthy();
    expect(screen.getByText("Round 1")).toBeTruthy();
    expect(document.querySelectorAll(".du-room-round-separator").length).toBeGreaterThan(0);
    expect(
      document
        .querySelector(".du-room-round-copy .du-sr-only")
        ?.textContent
    ).toContain("Discussion round marker");
    expect(document.querySelector(".du-room-phase-step")?.textContent ?? "").toContain(
      "Room opening"
    );
    expect(document.querySelector(".du-room-phase-step")?.classList.contains("du-sr-only")).toBe(
      false
    );
    expect(document.querySelector(".du-room-phase-detail")).toBeTruthy();
    expect(document.querySelector(".du-room-activity-group-header")).toBeNull();
    expect(document.querySelector(".du-room-activity-meta")).toBeNull();
    const systemMessages = Array.from(document.querySelectorAll(".du-room-system-message"));
    expect(systemMessages.length).toBeGreaterThan(0);
    expect(systemMessages[0]?.textContent ?? "").toContain("Discussion room");
    expect(systemMessages[0]?.textContent ?? "").toContain("Shared the discussion brief");
    const userTurn = document.querySelector(
      ".du-room-activity-item[data-speaker='user'] .du-room-activity-bubble"
    );
    expect(userTurn).toBeTruthy();
    expect(userTurn?.textContent ?? "").toContain("You");
    expect(userTurn?.textContent ?? "").toContain("Asked the room to continue");
    expect(userTurn?.textContent ?? "").toContain(
      "The room continued from your brief before participants responded."
    );
    expect(
      document.querySelector(".du-room-activity-item[data-speaker='room'] .du-room-activity-avatar")
    ).toBeNull();
    expect(
      document.querySelector(
        ".du-room-activity-item[data-speaker='participant'] .du-room-activity-avatar"
      )
    ).toBeTruthy();
    expect(
      document.querySelector(
        ".du-room-activity-item[data-speaker='participant'] .du-room-activity-bubble"
      )
    ).toBeTruthy();
    expect(document.querySelectorAll(".du-room-message-header").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".du-room-message-detail").length).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(
        ".du-room-activity-item[data-speaker='participant'] .du-room-message-context"
      ).length
    ).toBeGreaterThan(0);
    expect(
      document.querySelector(
        ".du-room-activity-item[data-speaker='participant'] .du-room-message-action"
      )
    ).toBeNull();
    expect(
      document.querySelector(
        ".du-room-activity-item[data-speaker='participant'] .du-room-message-phase"
      )
    ).toBeNull();
    expect(document.querySelector(".du-room-message-title")).toBeNull();
    const firstRoomMessage = document.querySelector(
      ".du-room-activity-item[data-speaker='participant'] .du-room-activity-bubble"
    );
    expect(
      Boolean(
        userTurn?.compareDocumentPosition(firstRoomMessage as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    const firstRoomMessageHeader = firstRoomMessage?.querySelector(".du-room-message-header");
    const firstRoomMessageDetail = firstRoomMessage?.querySelector(".du-room-message-detail");
    const firstRoomMessageContext = firstRoomMessage?.querySelector(".du-room-message-context");
    const firstRoomMessageAddress = firstRoomMessage?.querySelector(".du-room-message-address");
    const firstRoomMessageReply = firstRoomMessage?.querySelector(".du-room-message-reply");
    expect(firstRoomMessageHeader).toBeTruthy();
    expect(firstRoomMessageDetail).toBeTruthy();
    expect(firstRoomMessageContext).toBeTruthy();
    expect(firstRoomMessageAddress).toBeTruthy();
    expect(firstRoomMessageReply).toBeTruthy();
    expect(firstRoomMessageHeader?.contains(firstRoomMessageContext as Node)).toBe(true);
    expect(firstRoomMessageContext?.tagName).toBe("SMALL");
    expect(firstRoomMessageAddress?.previousElementSibling).toBe(firstRoomMessageHeader);
    expect(firstRoomMessageReply?.previousElementSibling).toBe(firstRoomMessageAddress);
    expect(firstRoomMessageDetail?.previousElementSibling).toBe(firstRoomMessageReply);
    expect(firstRoomMessageAddress?.textContent ?? "").toContain("To the discussion brief");
    expect(firstRoomMessageContext?.textContent ?? "").toContain(
      "Submitted a sealed first response"
    );
    expect(firstRoomMessageContext?.textContent ?? "").toContain(
      "Responding to the discussion brief"
    );
    expect(document.querySelectorAll(".du-room-message-reply").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Replying to the discussion brief before seeing other participants")
    ).toBeTruthy();
    const stageSummaries = Array.from(
      document.querySelectorAll('[aria-label="Stage activity summary"]')
    ).map((summary) => summary.textContent ?? "");
    expect(stageSummaries.join(" ")).toContain("1 update");
    expect(stageSummaries.join(" ")).toContain("No participant contributions");
    expect(stageSummaries.join(" ")).toContain("participant contributions");
    expect(
      document
        .querySelector('[aria-label="Stage activity summary"]')
        ?.classList.contains("du-sr-only")
    ).toBe(true);
    expect(
      screen.getByText("The room starts by making the question, goals, and constraints visible.")
    ).toBeTruthy();
    expect(screen.getByText("Participants answer first; review roles respond in the same room.")).toBeTruthy();
    expect(
      screen.getByText(
        "Participants respond to the brief first; then the organizer, reviewer, and evidence checker join as chat-like replies."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The brief is pinned first so every participant responds to the same question."
      )
    ).toBeTruthy();
    expect(screen.getByText("Shared the discussion brief")).toBeTruthy();
    expect(screen.getByText("Submitted a sealed first response")).toBeTruthy();
    expect(
      screen.getByText(
        "This response is sealed until the independent first responses are revealed."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Core discussion stages")).toBeNull();
    expect(screen.queryByText("Room output summary")).toBeNull();
    expect(screen.queryByText("Quick links to options, disagreements, evidence, and conclusion")).toBeNull();
    expect(screen.queryByText("What the strongest options say now")).toBeNull();
    expect(screen.queryByText("Option 1")).toBeNull();
    const currentRoomSummary = screen.getByRole("complementary", {
      name: "Current room summary"
    });
    expect(currentRoomSummary).toBeTruthy();
    expect(screen.getByText("Decision workspace")).toBeTruthy();
    expect(screen.getByText("Current conclusion: Ready to review")).toBeTruthy();
    expect(screen.getAllByText("Next action").length).toBeGreaterThan(0);
    expect(screen.getByText("What to review")).toBeTruthy();
    expect(currentRoomSummary.querySelector(".du-room-focus-queue")).toBeTruthy();
    expect(currentRoomSummary.textContent ?? "").toContain("Open disagreements");
    expect(currentRoomSummary.textContent ?? "").toContain("Missing evidence");
    expect(currentRoomSummary.textContent ?? "").toContain("Requirements to satisfy");
    expect(currentRoomSummary.textContent ?? "").toContain("Risks");
    expect(currentRoomSummary.textContent ?? "").toContain("Review needed");
    expect(currentRoomSummary.textContent ?? "").not.toContain(
      "Open items remain visible here so the conclusion is not treated as final."
    );
    expect(currentRoomSummary.textContent ?? "").not.toContain(
      "Missing or unchecked evidence that should be resolved before relying on the answer."
    );
    expect(screen.queryByText("Review status summary")).toBeNull();
    expect(
      screen.queryByText("Use this report-style status summary after reading the room conversation.")
    ).toBeNull();
    expect(screen.getAllByText("Review current conclusion").length).toBeGreaterThan(0);
    const defaultRunLinks = Array.from(document.querySelectorAll("a")).map((link) =>
      link.getAttribute("href")
    );
    expect(defaultRunLinks.filter((href) => href === "/runs/run-1/outcome").length).toBeGreaterThan(3);
    expect(defaultRunLinks).not.toEqual(
      expect.arrayContaining([
        "#main-perspectives",
        "#open-disagreements",
        "#answer-requirements",
        "#evidence-gaps"
      ])
    );
    expect(defaultRunLinks.some((href) => href?.includes("/sessions/session-1"))).toBe(false);
    expect(screen.getAllByText("Open disagreements").length).toBeGreaterThan(0);
    expect(screen.queryByText("Strong options stay visible without collapsing into one hidden authority.")).toBeNull();
    expect(screen.queryByText("How progress is tracked")).toBeNull();
    expect(screen.queryByText("What this discussion status means")).toBeNull();
    expect(screen.queryByText("Discussion progress")).toBeNull();
    fireEvent.click(await findAdvancedModeSummaryByPanelText("Structured discussion details"));
    expect(detailPanelsDrawer?.open).toBe(true);
    const openedDetailPanels = await screen.findByRole("region", {
      name: "Discussion detail panels"
    });
    expect(openedDetailPanels).toBeTruthy();
    expect(openedDetailPanels?.closest("details")).toBe(detailPanelsDrawer);
    await screen.findByText("Discussion setup");
    fireEvent.click(getUserDetailsSummaryByText("Discussion setup"));
    expect(screen.getAllByText("Discussion brief").length).toBeGreaterThan(0);
    expect(screen.getByText("Question")).toBeTruthy();
    expect(screen.getAllByText("Goals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inspect run state").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Constraints").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Keep outcomes provisional").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expected result").length).toBeGreaterThan(0);
    expect(screen.getByText("Not specified")).toBeTruthy();
    expect(screen.getAllByText("Discussion status").length).toBeGreaterThan(0);
    fireEvent.click(await findAdvancedModeSummaryByPanelText("Discussion status details"));
    expect(await screen.findByText("Ledger events")).toBeTruthy();
    expect(screen.getByText("7 recorded lifecycle events")).toBeTruthy();
    expect(screen.getByText("Risks and missing evidence")).toBeTruthy();
    expect(
      screen.getByText(
        "The rollout needs browser evidence that users can review missing evidence before relying on the conclusion."
      )
    ).toBeTruthy();
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
    expect((await screen.findAllByText("Next recommended actions")).length).toBeGreaterThan(0);
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
    const scrollTargets: string[] = [];
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: function scrollIntoViewMock(this: HTMLElement) {
        scrollTargets.push(this.id || this.getAttribute("aria-label") || this.className);
      }
    });
    const client = renderApp("/runs/run-1");

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.getSessionResources).toHaveBeenCalledTimes(2));
    expect(document.querySelector("#room-conversation-transcript")).toBeTruthy();
    await waitFor(() => expect(scrollTargets).toContain("room-conversation-transcript"));
    expect(scrollTargets).not.toContain("room-next-action");
    expect(scrollTargets).not.toContain("latest-discussion-update");
    expect(screen.queryByRole("region", { name: "Latest discussion update" })).toBeNull();
    expect(screen.queryByText("Discussion update completed")).toBeNull();
    expect(screen.getAllByText("Evidence checker").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing evidence").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Ask for stronger options" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Stronger options requested")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(
      "The guided update ran so the strongest current options can be compared again before relying on the conclusion."
    );
    expect(document.body.textContent ?? "").not.toContain("event-2");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView
    });
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
            },
            {
              id: "provider-extraction-event",
              type: "extraction_proposed",
              sequence: 5,
              visibility: "public",
              authorId: "openai-compatible-extractor",
              createdAt: "2026-06-10T00:00:05.000Z",
              payload: {
                rationale:
                  "Provider-organized discussion materials are visible without provider role ids."
              },
              basedOnEventIds: ["contribution-event"],
              trace: {}
            },
            {
              id: "provider-review-event",
              type: "proposal_accepted",
              sequence: 6,
              visibility: "public",
              authorId: "provider-review-coordinator",
              createdAt: "2026-06-10T00:00:06.000Z",
              payload: {
                rationale:
                  "Provider-reviewed discussion materials are accepted for the current room view."
              },
              basedOnEventIds: ["provider-extraction-event"],
              trace: {}
            },
            {
              id: "provider-final-candidate-event",
              type: "final_candidate_proposed",
              sequence: 7,
              visibility: "public",
              authorId: "openai-compatible-final-candidate",
              createdAt: "2026-06-10T00:00:07.000Z",
              payload: {
                recommendation: "Keep the provider-backed product loop reviewable."
              },
              basedOnEventIds: ["provider-review-event"],
              trace: {}
            },
            {
              id: "provider-final-audit-event",
              type: "final_audit_recorded",
              sequence: 8,
              visibility: "public",
              authorId: "openai-compatible-final-auditor",
              createdAt: "2026-06-10T00:00:08.000Z",
              payload: {
                summary: "Provider-backed conclusions remain provisional until reviewed.",
                risks: [
                  "Provider-backed conclusions may still miss real rollout constraints."
                ]
              },
              basedOnEventIds: ["provider-final-candidate-event"],
              trace: {}
            }
          ]
        }))
      })
    );

    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    expect((await screen.findAllByText("Perspective A")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Discussion organizer").length).toBeGreaterThan(1);
    expect(
      screen.getAllByText("CLI-first validation exercises the lifecycle directly.").length
    ).toBeGreaterThan(0);
    const participantResponsesText =
      document.querySelector("#room-conversation-transcript")?.textContent ?? "";
    expect(participantResponsesText).toContain("Perspective A");
    expect(participantResponsesText).toContain(
      "CLI-first validation exercises the lifecycle directly."
    );
    expect(participantResponsesText).toContain("Discussion organizer");
    expect(
      screen.queryByText("This participant response is available for review in the room.")
    ).toBeNull();
    expect(screen.getAllByText("Shared a first response").length).toBeGreaterThan(0);
    expect(screen.getByText("Made first responses visible")).toBeTruthy();
    expect(screen.getByText("Connected the first responses")).toBeTruthy();
    expect(screen.getByText("Connecting participant messages")).toBeTruthy();
    expect(screen.getByText("Responding after the first responses were revealed")).toBeTruthy();
    expect(
      screen.getByText(
        "The first responses are visible. I'm connecting them before the room compares options, disagreements, and evidence gaps."
      )
    ).toBeTruthy();
    const providerSystemMessages = Array.from(
      document.querySelectorAll(".du-room-system-message")
    ).map((message) => message.textContent ?? "");
    expect(providerSystemMessages.join(" ")).toContain("Made first responses visible");
    expect(screen.getAllByText("Organized the strongest options").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kept this material in the room").length).toBeGreaterThan(0);
    expect(screen.getByText("Drafted the current conclusion")).toBeTruthy();
    expect(screen.getByText("Reviewed risks")).toBeTruthy();
    expect(
      screen.getAllByText("Provider-backed conclusions may still miss real rollout constraints.").length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("A risk review was recorded for the current conclusion.")
    ).toBeNull();
    expect(screen.getAllByText("Review coordinator").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Conclusion writer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Risk reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evidence checker").length).toBeGreaterThan(0);
    expect(screen.getByText("Reviewed evidence gaps")).toBeTruthy();
    expect(
      screen.getAllByText("1 evidence gap still needs checking before relying on the conclusion.")
        .length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Conversation transcript" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Discussion round 1 messages" })).toBeTruthy();
    expect(screen.getByText("Discussion round 1")).toBeTruthy();
    expect(
      screen.getByText(
        "Participants respond to the brief first; then the organizer, reviewer, and evidence checker join as chat-like replies."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Building on the first responses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Checking evidence before the conclusion").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Building on Perspective A's first response").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("To the participant first responses").length).toBeGreaterThan(0);
    expect(screen.getByText("To the organized options")).toBeTruthy();
    expect(screen.getByText("To the draft conclusion")).toBeTruthy();
    expect(screen.getByText("Keeping the organized options in the room for review")).toBeTruthy();
    expect(
      screen.getByText("Synthesizing perspectives, disagreements, and evidence checks")
    ).toBeTruthy();
    expect(screen.getByText("Reviewing risks in the draft conclusion")).toBeTruthy();
    expect(document.querySelectorAll(".du-room-round-separator").length).toBeGreaterThan(0);
    expect(document.querySelector(".du-room-activity-group-header")).toBeNull();
    expect(
      screen.getByText("Participants answer first; review roles respond in the same room.")
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
    expect(roomText).not.toContain("Openai Compatible");
    expect(roomText).not.toContain("openai-compatible");
    expect(roomText).not.toContain("Provider Review Coordinator");
    expect(roomText).not.toContain("provider-review-coordinator");
  });

  it("groups repeated continuation events as readable discussion rounds", async () => {
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
              id: "round-one-opened",
              type: "sealed_batch_opened",
              sequence: 1,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:01.000Z",
              payload: {},
              basedOnEventIds: ["topic-event"],
              trace: {}
            },
            {
              id: "round-one-response",
              type: "sealed_contribution_submitted",
              sequence: 2,
              visibility: "public",
              authorId: "local-preset-alpha",
              createdAt: "2026-06-10T00:00:02.000Z",
              payload: {
                position: "Round one says the rollout should remain reversible."
              },
              basedOnEventIds: ["round-one-opened"],
              trace: {}
            },
            {
              id: "round-one-response-b",
              type: "sealed_contribution_submitted",
              sequence: 3,
              visibility: "public",
              authorId: "local-preset-beta",
              createdAt: "2026-06-10T00:00:03.000Z",
              payload: {
                position: "Round one adds a separate concern about evidence quality."
              },
              basedOnEventIds: ["round-one-opened"],
              trace: {}
            },
            {
              id: "round-one-revealed",
              type: "sealed_batch_revealed",
              sequence: 4,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:04.000Z",
              payload: {},
              basedOnEventIds: ["round-one-response", "round-one-response-b"],
              trace: {}
            },
            {
              id: "round-one-extraction",
              type: "extraction_proposed",
              sequence: 5,
              visibility: "public",
              authorId: "local-preset-extractor",
              createdAt: "2026-06-10T00:00:05.000Z",
              payload: {
                rationale: "Round one organized the first responses into reviewable options."
              },
              basedOnEventIds: ["round-one-revealed"],
              trace: {}
            },
            {
              id: "round-two-opened",
              type: "sealed_batch_opened",
              sequence: 6,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:06.000Z",
              payload: {},
              basedOnEventIds: ["round-one-extraction"],
              trace: {}
            },
            {
              id: "round-two-response-a",
              type: "sealed_contribution_submitted",
              sequence: 7,
              visibility: "public",
              authorId: "local-preset-alpha",
              createdAt: "2026-06-10T00:00:07.000Z",
              payload: {
                position: "Round two adds rollback gates before any wider rollout."
              },
              basedOnEventIds: ["round-two-opened"],
              trace: {}
            },
            {
              id: "round-two-response-b",
              type: "sealed_contribution_submitted",
              sequence: 8,
              visibility: "public",
              authorId: "local-preset-beta",
              createdAt: "2026-06-10T00:00:08.000Z",
              payload: {
                position: "Round two responds that evidence should be checked before launch."
              },
              basedOnEventIds: ["round-two-opened"],
              trace: {}
            },
            {
              id: "round-two-revealed",
              type: "sealed_batch_revealed",
              sequence: 9,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:09.000Z",
              payload: {},
              basedOnEventIds: ["round-two-response-a", "round-two-response-b"],
              trace: {}
            },
            {
              id: "round-two-extraction",
              type: "extraction_proposed",
              sequence: 10,
              visibility: "public",
              authorId: "local-preset-extractor",
              createdAt: "2026-06-10T00:00:10.000Z",
              payload: {
                rationale: "Round two organized the follow-up into updated options."
              },
              basedOnEventIds: ["round-two-revealed"],
              trace: {}
            }
          ]
        }))
      })
    );

    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    const roundOne = await screen.findByRole("list", { name: "Discussion round 1 messages" });
    expect(screen.getByRole("list", { name: "Discussion round 2 messages" })).toBeTruthy();
    expect(screen.getByText("Discussion round 2")).toBeTruthy();
    expect(screen.getByText("The room continued again from the current conclusion and open questions.")).toBeTruthy();
    expect(
      screen.getByText(
        "This follow-up round lets participants answer earlier replies while reviewer and evidence messages stay in the same thread."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Participants respond to the previous round; review roles answer objections and evidence checks in the same room."
      )
    ).toBeTruthy();
    expect(roundOne.textContent ?? "").toContain(
      "Round one adds a separate concern about evidence quality."
    );
    expect(roundOne.textContent ?? "").toContain(
      "Adding a separate first response alongside Perspective A"
    );
    expect(roundOne.textContent ?? "").toContain(
      "Independent reply now compared with Perspective A"
    );
    expect(roundOne.textContent ?? "").toContain("Connected the first responses");
    expect(roundOne.textContent ?? "").toContain("Answered another participant");
    expect(roundOne.textContent ?? "").toContain("Responding to another participant");
    expect(roundOne.textContent ?? "").toContain(
      "Now that the first responses are visible, I'm responding to Perspective A: Round one adds a separate concern about evidence quality."
    );
    const roundTwo = screen.getByRole("list", { name: "Discussion round 2 messages" });
    expect(roundTwo.textContent ?? "").toContain(
      "Round two adds rollback gates before any wider rollout."
    );
    expect(roundTwo.textContent ?? "").toContain(
      "Round two responds that evidence should be checked before launch."
    );
    expect(roundTwo.textContent ?? "").toContain("Asked the room to continue");
    expect(roundTwo.textContent ?? "").toContain("Starting another room round");
    expect(roundTwo.textContent ?? "").toContain("Opened follow-up replies");
    expect(roundTwo.textContent ?? "").toContain("Shared a follow-up reply");
    expect(roundTwo.textContent ?? "").toContain("Made follow-up replies visible");
    expect(roundTwo.textContent ?? "").toContain("Answered another participant");
    expect(roundTwo.textContent ?? "").toContain("Responding to another participant");
    expect(roundTwo.textContent ?? "").toContain("To another participant's latest reply");
    expect(roundTwo.textContent ?? "").toContain("Continuing the round as a direct reply");
    expect(roundTwo.textContent ?? "").toContain(
      "I'm responding to Perspective A: Round two responds that evidence should be checked before launch."
    );
    expect(roundTwo.textContent ?? "").toContain("Building on the follow-up replies");
    expect(roundTwo.textContent ?? "").toContain(
      "Replying in round 2 to the previous room state"
    );
    expect(roundTwo.textContent ?? "").toContain("Responding to the previous discussion round");
    expect(roundTwo.textContent ?? "").not.toContain("Responding to the discussion brief");
    expect(roundTwo.textContent ?? "").not.toContain("Opened independent first responses");
    expect(roundTwo.textContent ?? "").not.toContain("Shared a first response");
    expect(roundTwo.textContent ?? "").not.toContain("Made first responses visible");
    expect(roundTwo.textContent ?? "").not.toContain("Building on the first responses");
    expect(roundTwo.textContent ?? "").not.toContain(
      "Replying to the discussion brief before seeing other participants"
    );
    expect(roundTwo.textContent ?? "").toContain("Connected the follow-up replies");
    expect(roundTwo.textContent ?? "").toContain(
      "Responding after the follow-up replies were revealed"
    );
    expect(roundTwo.textContent ?? "").toContain("To the latest participant replies");
    expect(roundTwo.textContent ?? "").toContain(
      "The latest replies were organized into updated options, disagreements, requirements, and evidence needs."
    );
    expect(roundTwo.textContent ?? "").toContain("Building on Perspective B's follow-up reply");
    expect(roundTwo.textContent ?? "").toContain(
      "Replying in round 2 to Perspective A's latest reply"
    );
    expect(roundTwo.textContent ?? "").toContain(
      "Responding to Perspective A's latest reply in the follow-up round"
    );
    expect(roundTwo.textContent ?? "").toContain("Replying to Perspective B's latest point");
    expect(roundTwo.textContent ?? "").toContain(
      "Replying to Perspective B's option with an open disagreement"
    );
    expect(roundTwo.textContent ?? "").toContain("Checking evidence behind Perspective B's claim");
    expect((document.querySelector(".du-room-layout")?.textContent ?? "")).not.toContain(
      "round-two-opened"
    );
  });

  it("keeps follow-up reply bridges aligned with a Chinese topic", async () => {
    const chineseRunDetail = {
      ...runDetail,
      topic: "\u662f\u5426\u5e94\u8be5\u6269\u5927\u8bd5\u70b9\uff1f",
      plan: {
        ...runDetail.plan,
        topic: "\u662f\u5426\u5e94\u8be5\u6269\u5927\u8bd5\u70b9\uff1f"
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: chineseRunDetail
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
                topic: "\u662f\u5426\u5e94\u8be5\u6269\u5927\u8bd5\u70b9\uff1f"
              },
              basedOnEventIds: [],
              trace: {}
            },
            {
              id: "round-one-opened",
              type: "sealed_batch_opened",
              sequence: 1,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:01.000Z",
              payload: {},
              basedOnEventIds: ["topic-event"],
              trace: {}
            },
            {
              id: "round-one-response-a",
              type: "sealed_contribution_submitted",
              sequence: 2,
              visibility: "public",
              authorId: "local-preset-alpha",
              createdAt: "2026-06-10T00:00:02.000Z",
              payload: {
                position: "\u5148\u4fdd\u6301\u8bd5\u70b9\uff0c\u4e0d\u8981\u7acb\u5373\u6269\u5927\u3002"
              },
              basedOnEventIds: ["round-one-opened"],
              trace: {}
            },
            {
              id: "round-one-response-b",
              type: "sealed_contribution_submitted",
              sequence: 3,
              visibility: "public",
              authorId: "local-preset-beta",
              createdAt: "2026-06-10T00:00:03.000Z",
              payload: {
                position: "\u5148\u68c0\u67e5\u8bc1\u636e\u7f3a\u53e3\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u6269\u5927\u3002"
              },
              basedOnEventIds: ["round-one-opened"],
              trace: {}
            },
            {
              id: "round-one-revealed",
              type: "sealed_batch_revealed",
              sequence: 4,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:04.000Z",
              payload: {},
              basedOnEventIds: ["round-one-response-a", "round-one-response-b"],
              trace: {}
            },
            {
              id: "round-two-opened",
              type: "sealed_batch_opened",
              sequence: 5,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:05.000Z",
              payload: {},
              basedOnEventIds: ["round-one-revealed"],
              trace: {}
            },
            {
              id: "round-two-response-a",
              type: "sealed_contribution_submitted",
              sequence: 6,
              visibility: "public",
              authorId: "local-preset-alpha",
              createdAt: "2026-06-10T00:00:06.000Z",
              payload: {
                position: "\u53ef\u4ee5\u6269\u5927\uff0c\u4f46\u5fc5\u987b\u5148\u8bbe\u7f6e\u56de\u6eda\u95e8\u69db\u3002"
              },
              basedOnEventIds: ["round-two-opened"],
              trace: {}
            },
            {
              id: "round-two-response-b",
              type: "sealed_contribution_submitted",
              sequence: 7,
              visibility: "public",
              authorId: "local-preset-beta",
              createdAt: "2026-06-10T00:00:07.000Z",
              payload: {
                position: "\u6211\u540c\u610f\u8981\u56de\u6eda\u95e8\u69db\uff0c\u4f46\u8fd8\u8981\u5148\u8865\u9f50\u7528\u6237\u5f71\u54cd\u8bc1\u636e\u3002"
              },
              basedOnEventIds: ["round-two-opened"],
              trace: {}
            },
            {
              id: "round-two-revealed",
              type: "sealed_batch_revealed",
              sequence: 8,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:08.000Z",
              payload: {},
              basedOnEventIds: ["round-two-response-a", "round-two-response-b"],
              trace: {}
            },
            {
              id: "round-two-extraction",
              type: "extraction_proposed",
              sequence: 9,
              visibility: "public",
              authorId: "local-preset-extractor",
              createdAt: "2026-06-10T00:00:09.000Z",
              payload: {
                rationale: "Round two organized the follow-up into updated options."
              },
              basedOnEventIds: ["round-two-revealed"],
              trace: {}
            }
          ]
        }))
      })
    );

    await waitFor(() => expect(client.getRunEvents).toHaveBeenCalledWith("run-1"));
    const roundOne = await screen.findByRole("list", { name: "Discussion round 1 messages" });
    const roundOneText = roundOne.textContent ?? "";
    const roundTwo = await screen.findByRole("list", { name: "Discussion round 2 messages" });
    const roundTwoText = roundTwo.textContent ?? "";

    expect(roundOneText).toContain(
      "\u9996\u8f6e\u56de\u5e94\u516c\u5f00\u540e\uff0c\u6211\u5728\u56de\u5e94 Perspective A"
    );
    expect(roundOneText).toContain("\u56de\u5e94\u53e6\u4e00\u4f4d\u53c2\u4e0e\u8005");
    expect(roundOneText).toContain(
      "\u5bf9\u53e6\u4e00\u4f4d\u53c2\u4e0e\u8005\u7684\u6700\u65b0\u53d1\u8a00"
    );
    expect(roundOneText).not.toContain("Now that the first responses are visible");
    expect(roundOneText).not.toContain("Responding to another participant");
    expect(roundTwoText).toContain("\u6211\u5728\u56de\u5e94 Perspective A");
    expect(roundTwoText).toContain(
      "\u6211\u540c\u610f\u8981\u56de\u6eda\u95e8\u69db\uff0c\u4f46\u8fd8\u8981\u5148\u8865\u9f50\u7528\u6237\u5f71\u54cd\u8bc1\u636e\u3002"
    );
    expect(roundTwoText).toContain(
      "\u623f\u95f4\u4ece\u5f53\u524d\u7ed3\u8bba\u548c\u5f00\u653e\u95ee\u9898\u7ee7\u7eed\u4e0b\u4e00\u8f6e\u3002"
    );
    expect(roundTwoText).toContain(
      "\u6700\u65b0\u53c2\u4e0e\u8005\u56de\u5e94\u5df2\u7ecf\u53ef\u89c1\u3002\u6211\u4f1a\u5148\u628a\u5b83\u4eec\u8fde\u63a5\u5230\u4e4b\u524d\u7684\u8ba8\u8bba\u72b6\u6001\uff0c\u518d\u8ba9\u623f\u95f4\u6bd4\u8f83\u66f4\u65b0\u540e\u7684\u9009\u9879\u3001\u5206\u6b67\u548c\u8bc1\u636e\u7f3a\u53e3\u3002"
    );
    expect(roundTwoText).toContain(
      "\u6700\u65b0\u56de\u5e94\u5df2\u6574\u7406\u4e3a\u66f4\u65b0\u540e\u7684\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002"
    );
    expect(roundTwoText).toContain(
      "1 \u4e2a\u672a\u89e3\u51b3\u5206\u6b67\u4ecd\u9700\u5904\u7406\uff0c\u7136\u540e\u624d\u80fd\u4f9d\u8d56\u7ed3\u8bba\u3002"
    );
    expect(roundTwoText).toContain(
      "1 \u4e2a\u8bc1\u636e\u7f3a\u53e3\u4ecd\u9700\u6838\u67e5\uff0c\u7136\u540e\u624d\u80fd\u4f9d\u8d56\u7ed3\u8bba\u3002"
    );
    expect(roundTwoText).not.toContain("I'm responding to Perspective A");
    expect(roundTwoText).not.toContain(
      "The room continued again from the current conclusion and open questions."
    );
    expect(roundTwoText).not.toContain("The latest participant replies are visible.");
    expect(roundTwoText).not.toContain(
      "The latest replies were organized into updated options, disagreements, requirements, and evidence needs."
    );
    expect(roundTwoText).not.toContain(
      "1 open disagreement still needs resolution before relying on the conclusion."
    );
    expect(roundTwoText).not.toContain(
      "1 evidence gap still needs checking before relying on the conclusion."
    );
  });

  it("shows organizer fallback guidance in the discussion room", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getFrontier: vi.fn(async () => ({
          basis: "accepted_active_candidates",
          candidates: [
            {
              object: {
                id: "fallback-candidate-1",
                title: "Review the independent first responses before deciding",
                description:
                  "Use the revealed participant responses as provisional discussion material, then verify missing evidence, disagreements, and risks before relying on a conclusion.",
                status: "accepted_active"
              },
              proposalEventId: "proposal-event-1",
              sourceEventIds: ["event-1"]
            }
          ],
          projection
        }))
      })
    );

    expect(await screen.findByRole("region", { name: "Discussion room overview" })).toBeTruthy();
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    expect(screen.queryByLabelText("Organizer recovery notice")).toBeNull();
    expect(screen.queryByText("Discussion organizer used a safe fallback")).toBeNull();
    const roomText = document.querySelector(".du-room-main")?.textContent ?? "";
    expect(roomText).not.toContain("fallback-candidate-1");
    expect(roomText).not.toContain("extraction_output_invalid");
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
            },
            {
              id: "provider-final-candidate-event",
              type: "final_candidate_proposed",
              sequence: 3,
              visibility: "public",
              authorId: "openai-compatible-final-candidate",
              createdAt: "2026-06-10T00:00:03.000Z",
              payload: {
                recommendation: "Keep the provider-backed product loop reviewable."
              },
              basedOnEventIds: ["extraction-event"],
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
    expect(screen.getByText("\u6700\u65b0\u53d1\u8a00")).toBeTruthy();
    expect(screen.getByText("\u6700\u8fd1\u8c01\u53d1\u4e86\u8a00")).toBeTruthy();
    expect(screen.getByRole("list", { name: "\u6700\u65b0\u53c2\u4e0e\u8005\u53d1\u8a00" })).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u7b2c 1 \u8f6e")).toBeTruthy();
    expect(screen.getByRole("list", { name: "\u8ba8\u8bba\u7b2c 1 \u8f6e\u53d1\u8a00" })).toBeTruthy();
    expect(screen.getAllByText("\u8ba8\u8bba\u7ec4\u7ec7\u8005").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u8bc1\u636e\u6838\u67e5\u8005").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "\u8ba8\u8bba\u5ba4\u4e2d\u7684\u4e0b\u4e00\u6b65" })).toBeTruthy();
    expect(
      screen.getByText(
        "\u8ba8\u8bba\u5ba4\u5df2\u6709\u8db3\u591f\u6750\u6599\u53ef\u4f9b\u5ba1\u9605\u3002\u8bf7\u5148\u4ece\u7ed3\u8bba\u5f00\u59cb\uff0c\u7136\u540e\u9009\u62e9\u662f\u5426\u68c0\u67e5\u5206\u6b67\u3001\u6838\u67e5\u8bc1\u636e\u6216\u66f4\u65b0\u8ba8\u8bba\u3002"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u5ba1\u9605\u4e86\u8bc1\u636e\u7f3a\u53e3")).toBeTruthy();
    expect(
      screen.getByText("\u57fa\u4e8e \u89c6\u89d2 A \u7684\u521d\u59cb\u56de\u5e94\u7ee7\u7eed")
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        /\u68c0\u67e5 \u89c6\u89d2 [AB] \u7684\u8bba\u65ad\u80cc\u540e\u7684\u8bc1\u636e/
      ).length
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        "\u5728\u4f9d\u8d56\u7ed3\u8bba\u524d\uff0c\u4ecd\u6709 1 \u4e2a\u8bc1\u636e\u7f3a\u53e3\u9700\u8981\u6838\u67e5\u3002"
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("\u7ed3\u8bba\u8d77\u8349\u8005").length).toBeGreaterThan(0);
    const roomText = document.querySelector(".du-room-layout")?.textContent ?? "";
    expect(roomText).not.toContain("local-preset-alpha");
    expect(roomText).not.toContain("local-preset-extractor");
    expect(roomText).not.toContain("openai-compatible-final-candidate");
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

    expect((await screen.findAllByText("Collecting first perspectives")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Continue discussion")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Collecting first perspectives")).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Continue the discussion before comparing options or reviewing a conclusion."
      ).length
    ).toBeGreaterThan(0);
    expect(document.querySelector(".du-page-header")).toBeNull();
    expect(document.querySelector(".du-page-actions")).toBeNull();
    const roomOverview = screen.getByRole("region", { name: "Discussion room overview" });
    const roomStatus = within(roomOverview).getByRole("status", { name: "Room status" });
    expect(roomStatus.textContent ?? "").toContain("Next step");
    expect(roomStatus.textContent ?? "").toContain("Continue discussion");
    expect(document.querySelector(".du-room-status-cue")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Primary discussion actions" })
    ).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Discussion actions" })).toBeNull();
    const pendingNextRoomAction = screen.getByRole("region", { name: "Next in the room" });
    expect(pendingNextRoomAction.textContent ?? "").toContain("Continue discussion");
    expect(document.querySelector(".du-room-action-strip")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue discussion" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask for stronger options" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Review disagreements" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Confirm answer requirements" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Check evidence" })).toBeNull();
    expect(screen.getByText("Reply to the room")).toBeTruthy();
    expect(screen.getByText("Choose Continue discussion to let participants respond.")).toBeTruthy();
    expect(screen.queryByText("Message the room")).toBeNull();
    expect(
      screen.getByText("Continue the room from here.")
    ).toBeTruthy();
    expect(screen.getByText("Review actions appear after participants respond.")).toBeTruthy();
    expect(screen.queryByText("Review actions unlock later")).toBeNull();
    expect(screen.queryByText("Available after first update")).toBeNull();
    expect(
      screen.queryByText("For now, continue the discussion to create those materials.")
    ).toBeNull();
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
    expect(screen.getByText("Current conclusion: Not ready yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View current conclusion" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Current conclusion" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open conclusion" })).toBeNull();
    fireEvent.click(await findAdvancedModeSummaryByPanelText("Structured discussion details"));
    await screen.findByText("Discussion setup");
    fireEvent.click(getUserDetailsSummaryByText("Discussion setup"));
    fireEvent.click(await findAdvancedModeSummaryByPanelText("Discussion status details"));
    expect(await screen.findByText("1 recorded lifecycle event")).toBeTruthy();
    expect(screen.getAllByText("Not started yet").length).toBeGreaterThanOrEqual(4);
    expect(document.body.textContent ?? "").not.toContain("Not run yet");
    expect(screen.getByText("No work has been recorded for that part of the discussion.")).toBeTruthy();
  });

  it("uses the discussion question language for local preset continuation requests", async () => {
    const topic = "\u6211\u4eec\u5e94\u8be5\u5982\u4f55\u8bc4\u4f30\u8fd9\u4e2a\u65b0\u529f\u80fd\u53d1\u5e03\uff1f";
    const chineseLocalPresetRun = {
      ...localPresetNotStartedRunDetail,
      title: `Discussion: ${topic}`,
      topic,
      plan: {
        ...localPresetNotStartedRunDetail.plan,
        topic
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: chineseLocalPresetRun
        })),
        getRunEvents: vi.fn(async () => ({
          runId: chineseLocalPresetRun.runId,
          sessionId: chineseLocalPresetRun.sessionId,
          events: [
            {
              id: "topic-event",
              type: "topic_contract_published",
              sequence: 0,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:00.000Z",
              payload: {
                topic
              },
              basedOnEventIds: [],
              trace: {}
            }
          ]
        })),
        startRun: vi.fn(async () => ({
          run: {
            ...chineseLocalPresetRun,
            status: "running"
          },
          stages: [
            {
              stage: "sealed_divergence",
              executionStatus: "executed",
              status: "completed"
            }
          ],
          stopped: false
        }))
      })
    );

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const startRequest = vi.mocked(client.startRun).mock.calls[0]?.[1];
    const startRequestText = JSON.stringify(startRequest);

    expect(startRequestText).toContain(
      "\u63a5\u53d7\u672c\u6b21\u6f14\u793a\u4e2d\u6ca1\u6709\u516c\u5f00\u6311\u6218\u7684\u793a\u4f8b\u8ba8\u8bba\u6750\u6599\u3002"
    );
    expect(startRequestText).not.toContain(
      "Accept sample discussion material that has no open challenge in this walkthrough."
    );
    expect(document.body.textContent ?? "").not.toContain("providerConfigId");
  });

  it("uses the discussion question language for provider-backed continuation requests", async () => {
    const topic = "\u6211\u4eec\u5e94\u8be5\u5982\u4f55\u8bc4\u4f30\u771f\u5b9e\u6a21\u578b\u5ba1\u67e5\uff1f";
    const chineseProviderBackedRun = {
      ...providerBackedRunDetail,
      title: `Discussion: ${topic}`,
      topic,
      plan: {
        ...providerBackedRunDetail.plan,
        topic,
        output: {
          language: "Simplified Chinese",
          expectations: ["\u7528\u4e2d\u6587\u5c55\u793a\u5f53\u524d\u7ed3\u8bba\u3002"]
        }
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: chineseProviderBackedRun
        })),
        getRuntimeProfiles: vi.fn(async () => ({
          profiles: [
            {
              id: "local-preset",
              name: "Local preset",
              enabled: true,
              status: "ready",
              components: [],
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
                },
                {
                  id: "openai-compatible-extractor",
                  kind: "extraction_generator",
                  enabled: true
                },
                {
                  id: "openai-compatible-reviewer",
                  kind: "proposal_reviewer",
                  enabled: true
                },
                {
                  id: "openai-compatible-final-candidate",
                  kind: "final_candidate_generator",
                  enabled: true
                },
                {
                  id: "openai-compatible-final-auditor",
                  kind: "final_auditor",
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
                  }
                ],
                missingRecommendedEnvVars: [],
                notes: []
              },
              boundaries: []
            }
          ]
        })),
        startRun: vi.fn(async () => ({
          run: {
            ...chineseProviderBackedRun,
            status: "running"
          },
          stages: [
            {
              stage: "sealed_divergence",
              executionStatus: "executed",
              status: "completed"
            }
          ],
          stopped: false
        }))
      })
    );

    expect(await screen.findByText("Model-backed review path ready")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const startRequest = vi.mocked(client.startRun).mock.calls[0]?.[1];
    const startRequestText = JSON.stringify(startRequest);

    expect(startRequestText).toContain(
      "\u63a5\u53d7\u6a21\u578b\u6574\u7406\u7684\u8ba8\u8bba\u6750\u6599"
    );
    expect(startRequestText).not.toContain("Accept provider-organized proposals");
    expect(startRequest).toEqual(
      expect.objectContaining({
        review: expect.objectContaining({
          acceptancePolicy: expect.objectContaining({
            rationale: expect.stringContaining(
              "\u63a5\u53d7\u6a21\u578b\u6574\u7406\u7684\u8ba8\u8bba\u6750\u6599"
            )
          })
        })
      })
    );
    expect(document.body.textContent ?? "").not.toContain("providerConfigId");
  });

  it("starts another readable room round after prior discussion material exists", async () => {
    const partiallyDiscussedRun = {
      ...localPresetNotStartedRunDetail,
      status: "revealed",
      sealedDivergenceStatus: "revealed",
      latestExtractionStatus: undefined,
      latestProposalReviewStatus: undefined,
      latestFinalizationStatus: undefined,
      ledger: {
        eventCount: 4
      },
      rounds: {
        sealedDivergence: {
          status: "revealed"
        },
        extraction: [],
        candidateRepair: [],
        evidenceCheck: [],
        proposalReview: [],
        finalization: []
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: partiallyDiscussedRun
        })),
        getRunEvents: vi.fn(async () => ({
          runId: partiallyDiscussedRun.runId,
          sessionId: partiallyDiscussedRun.sessionId,
          events: [
            {
              id: "topic-event",
              type: "topic_contract_published",
              sequence: 0,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:00.000Z",
              payload: {
                topic: partiallyDiscussedRun.topic
              },
              basedOnEventIds: [],
              trace: {}
            },
            {
              id: "round-one-opened",
              type: "sealed_batch_opened",
              sequence: 1,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:01.000Z",
              payload: {},
              basedOnEventIds: ["topic-event"],
              trace: {}
            },
            {
              id: "round-one-response",
              type: "sealed_contribution_submitted",
              sequence: 2,
              visibility: "public",
              authorId: "local-preset-alpha",
              createdAt: "2026-06-10T00:00:02.000Z",
              payload: {
                position: "Round one asks for a reversible rollout."
              },
              basedOnEventIds: ["round-one-opened"],
              trace: {}
            },
            {
              id: "round-one-revealed",
              type: "sealed_batch_revealed",
              sequence: 3,
              visibility: "public",
              authorId: "system",
              createdAt: "2026-06-10T00:00:03.000Z",
              payload: {},
              basedOnEventIds: ["round-one-response"],
              trace: {}
            }
          ]
        }))
      })
    );

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    expect(
      screen.getByText(
        "Choose Continue discussion to let participants respond to the latest room state."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("Start another readable round from the current room state.")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const startRequest = vi.mocked(client.startRun).mock.calls[0]?.[1] as
      | Record<string, Record<string, unknown>>
      | undefined;
    const sealedDivergence = startRequest?.sealedDivergence;
    const extraction = startRequest?.extraction;
    const review = startRequest?.review;
    const finalization = startRequest?.finalization;

    expect(sealedDivergence?.roundId).toMatch(/^web-round-4-[a-z0-9]+-first-responses$/);
    expect(extraction?.roundId).toMatch(/^web-round-4-[a-z0-9]+-options$/);
    expect(review?.roundId).toMatch(/^web-round-4-[a-z0-9]+-review$/);
    expect(finalization?.roundId).toMatch(/^web-round-4-[a-z0-9]+-conclusion$/);
    expect(extraction?.sealedDivergenceRoundId).toBe(sealedDivergence?.roundId);
    expect(review?.extractionRoundId).toBe(extraction?.roundId);
    expect(finalization?.proposalReviewRoundId).toBe(review?.roundId);
    expect(document.body.textContent ?? "").not.toContain("web-round-4");
  });

  it("maps processing stage statuses to user-facing language before conclusion review", async () => {
    const processingRun = {
      ...runDetail,
      status: "revealed",
      sealedDivergenceStatus: "revealed",
      latestExtractionStatus: "waiting_for_generators",
      latestProposalReviewStatus: undefined,
      latestFinalizationStatus: undefined,
      ledger: {
        eventCount: 5
      },
      rounds: {
        sealedDivergence: {
          status: "revealed"
        },
        extraction: [
          {
            status: "waiting_for_generators",
            lastErrorCategory: "extraction_output_invalid",
            generatorStates: [
              {
                generatorId: "openai-compatible-extractor",
                status: "failed",
                errorCategory: "extraction_output_invalid"
              }
            ]
          }
        ],
        candidateRepair: [],
        evidenceCheck: [],
        proposalReview: [],
        finalization: []
      }
    };

    renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: processingRun
        }))
      })
    );

    expect((await screen.findAllByText("Discussion step needs attention")).length).toBeGreaterThan(0);
    expect(await screen.findByRole("complementary", { name: "Current room summary" })).toBeTruthy();
    expect(screen.getAllByText("Discussion step needs attention").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Verify the model setup, then continue the discussion so options, evidence, risks, and conclusion can be rebuilt."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByText("Current conclusion: Not ready yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View current conclusion" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("waiting_for_generators");
    expect(document.body.textContent ?? "").not.toContain("extraction_output_invalid");

    cleanup();

    renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: processingRun
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    expect(
      (await screen.findAllByText("\u8ba8\u8bba\u6b65\u9aa4\u9700\u8981\u5173\u6ce8")).length
    ).toBeGreaterThan(0);
    expect(await screen.findByRole("complementary", { name: "\u5f53\u524d\u8ba8\u8bba\u6458\u8981" })).toBeTruthy();
    expect(
      screen.getAllByText("\u8ba8\u8bba\u6b65\u9aa4\u9700\u8981\u5173\u6ce8").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "\u8bf7\u9a8c\u8bc1\u6a21\u578b\u8bbe\u7f6e\uff0c\u7136\u540e\u7ee7\u7eed\u8ba8\u8bba\uff0c\u4ee5\u91cd\u5efa\u9009\u9879\u3001\u8bc1\u636e\u3001\u98ce\u9669\u548c\u7ed3\u8bba\u3002"
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByText("\u5f53\u524d\u7ed3\u8bba\uff1a\u5c1a\u672a\u5c31\u7eea")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "\u67e5\u770b\u5f53\u524d\u7ed3\u8bba" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("waiting_for_generators");
    expect(document.body.textContent ?? "").not.toContain("extraction_output_invalid");
  });

  it("maps paused continuation stop reasons to user-facing language", async () => {
    const pausedRun = {
      ...localPresetNotStartedRunDetail,
      status: "revealed",
      sealedDivergenceStatus: "revealed",
      latestExtractionStatus: "waiting_for_generators",
      latestProposalReviewStatus: undefined,
      latestFinalizationStatus: undefined,
      ledger: {
        eventCount: 5
      },
      rounds: {
        sealedDivergence: {
          status: "revealed"
        },
        extraction: [
          {
            status: "waiting_for_generators",
            lastErrorCategory: "extraction_output_invalid",
            generatorStates: [
              {
                generatorId: "local-preset-extractor",
                status: "failed",
                errorCategory: "extraction_output_invalid"
              }
            ]
          }
        ],
        candidateRepair: [],
        evidenceCheck: [],
        proposalReview: [],
        finalization: []
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: localPresetNotStartedRunDetail
        })),
        startRun: vi.fn(async () => ({
          run: pausedRun,
          stages: [
            {
              stage: "extraction",
              executionStatus: "executed",
              status: "waiting_for_generators"
            }
          ],
          stopped: true,
          stopReason: "waiting_for_generators"
        }))
      })
    );

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(await screen.findByText("Discussion paused")).toBeTruthy();
    expect(screen.getByText("Stop reason")).toBeTruthy();
    expect(
      screen.getByText(
        "A guided step is still waiting on model work. Review visible progress or try again after checking setup."
      )
    ).toBeTruthy();
    const updatedSteps = screen.getByRole("region", { name: "Updated discussion steps" });
    expect(updatedSteps.classList.contains("du-readable-stage-result-room")).toBe(true);
    expect(updatedSteps.textContent ?? "").toContain("Room progress");
    expect(updatedSteps.textContent ?? "").toContain("Main perspectives");
    expect(updatedSteps.textContent ?? "").toContain("Needs attention");
    expect(updatedSteps.textContent ?? "").not.toContain("Main perspectivesUpdated");
    expect(document.body.textContent ?? "").not.toContain("waiting_for_generators");
    expect(document.body.textContent ?? "").not.toContain("extraction_output_invalid");
  });

  it("maps first-response participant pauses to retry guidance", async () => {
    const pausedRun = {
      ...providerBackedRunDetail,
      status: "waiting_for_participants",
      sealedDivergenceStatus: "waiting_for_participants",
      latestExtractionStatus: undefined,
      latestProposalReviewStatus: undefined,
      latestFinalizationStatus: undefined,
      ledger: {
        eventCount: 3
      },
      rounds: {
        sealedDivergence: {
          status: "waiting_for_participants",
          participantDispatches: [
            {
              participantId: "provider-perspective-a",
              status: "submitted",
              contributionEventId: "contribution-a"
            },
            {
              participantId: "provider-perspective-b",
              status: "failed",
              errorCategory: "provider_http_error"
            }
          ]
        },
        extraction: [],
        candidateRepair: [],
        evidenceCheck: [],
        proposalReview: [],
        finalization: []
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        })),
        startRun: vi.fn(async () => ({
          run: pausedRun,
          stages: [
            {
              stage: "sealed_divergence",
              executionStatus: "executed",
              status: "waiting_for_participants"
            }
          ],
          stopped: true,
          stopReason: "waiting_for_participants"
        }))
      })
    );

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(await screen.findByText("Discussion paused")).toBeTruthy();
    expect(screen.getByText("Stop reason")).toBeTruthy();
    expect(
      screen.getByText(
        "A first-response participant still needs to finish. Review visible progress, then try Continue discussion again."
      )
    ).toBeTruthy();
    const updatedSteps = screen.getByRole("region", { name: "Updated discussion steps" });
    expect(updatedSteps.classList.contains("du-readable-stage-result-room")).toBe(true);
    expect(updatedSteps.textContent ?? "").toContain("Room progress");
    expect(updatedSteps.textContent ?? "").toContain("Independent first responses");
    expect(updatedSteps.textContent ?? "").toContain("Needs attention");
    expect(document.body.textContent ?? "").not.toContain("waiting_for_participants");
    expect(document.body.textContent ?? "").not.toContain("provider_http_error");
  });

  it("shows recovery actions when a stopped model-backed continuation fails", async () => {
    const stoppedRun = {
      ...providerBackedRunDetail,
      status: "revealed",
      sealedDivergenceStatus: "revealed",
      latestExtractionStatus: "completed",
      latestProposalReviewStatus: "failed",
      latestFinalizationStatus: undefined,
      ledger: {
        eventCount: 8
      },
      rounds: {
        sealedDivergence: {
          status: "revealed"
        },
        extraction: [
          {
            status: "completed"
          }
        ],
        candidateRepair: [],
        evidenceCheck: [],
        proposalReview: [
          {
            status: "failed",
            lastErrorCategory: "review_output_invalid"
          }
        ],
        finalization: []
      }
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        })),
        startRun: vi.fn(async () => ({
          run: stoppedRun,
          stages: [
            {
              stage: "proposal_review",
              executionStatus: "executed",
              status: "failed"
            }
          ],
          stopped: true,
          stopReason: "failed"
        }))
      })
    );

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(await screen.findByText("Discussion paused")).toBeTruthy();
    expect(
      screen.getByText("A guided step needs attention before Deliberum can continue the full discussion.")
    ).toBeTruthy();
    const recovery = await screen.findByRole("region", {
      name: "Discussion recovery options"
    });
    expect(recovery.textContent ?? "").toContain("Keep the discussion recoverable");
    expect(recovery.textContent ?? "").toContain("Check model setup");
    expect(recovery.textContent ?? "").toContain("Try Continue discussion again");
    expect(recovery.textContent ?? "").toContain("Start a new model-backed discussion");
    expect(document.body.textContent ?? "").not.toContain("run_stage_failed");
    expect(document.body.textContent ?? "").not.toContain("review_output_invalid");
  });

  it("localizes stopped continuation recovery actions to Simplified Chinese", async () => {
    const zhContinue = "\u7ee7\u7eed\u8ba8\u8bba";
    const zhPaused = "\u8ba8\u8bba\u5df2\u6682\u505c";
    const zhDetail =
      "\u6709\u4e00\u4e2a\u5f15\u5bfc\u6b65\u9aa4\u9700\u8981\u5904\u7406\uff0cDeliberum \u624d\u80fd\u7ee7\u7eed\u5b8c\u6574\u8ba8\u8bba\u3002";
    const zhRegion = "\u8ba8\u8bba\u6062\u590d\u9009\u9879";
    const zhHeading = "\u4fdd\u6301\u8ba8\u8bba\u53ef\u6062\u590d";
    const zhSetup = "\u68c0\u67e5\u6a21\u578b\u8bbe\u7f6e";
    const zhRetry = "\u518d\u6b21\u5c1d\u8bd5\u7ee7\u7eed\u8ba8\u8bba";
    const zhStart = "\u5f00\u59cb\u65b0\u7684\u6a21\u578b\u652f\u6301\u8ba8\u8bba";
    renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        })),
        startRun: vi.fn(async () => ({
          run: {
            ...providerBackedRunDetail,
            status: "revealed",
            sealedDivergenceStatus: "revealed",
            latestProposalReviewStatus: "failed"
          },
          stages: [
            {
              stage: "proposal_review",
              executionStatus: "executed",
              status: "failed"
            }
          ],
          stopped: true,
          stopReason: "timed_out"
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    expect(await screen.findByRole("button", { name: zhContinue })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: zhContinue }));

    expect(await screen.findByText(zhPaused)).toBeTruthy();
    expect(screen.getByText(zhDetail)).toBeTruthy();
    const recovery = await screen.findByRole("region", {
      name: zhRegion
    });
    expect(recovery.textContent ?? "").toContain(zhHeading);
    expect(recovery.textContent ?? "").toContain(zhSetup);
    expect(recovery.textContent ?? "").toContain(zhRetry);
    expect(recovery.textContent ?? "").toContain(zhStart);
    expect(document.body.textContent ?? "").not.toContain("timed_out");
    expect(document.body.textContent ?? "").not.toContain("proposal_review");
  });

  it("starts a run from a JSON start request and renders readable step metadata", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: localPresetNotStartedRunDetail
        })),
        startRun: vi.fn(async () => ({
          run: {
            ...localPresetNotStartedRunDetail,
            status: "running",
            sealedDivergenceStatus: "completed"
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
        }))
      })
    );
    const startRequest = {
      extraction: {
        generatorIds: ["generator-1"]
      }
    };

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Discussion action composer" })).toBeNull();
    expect(screen.getByRole("region", { name: "Room quick replies" })).toBeTruthy();
    expect(screen.queryByText("Discussion action composer")).toBeNull();
    expect(screen.getByText("Quick replies")).toBeTruthy();
    expect(screen.getByText("Reply to the room")).toBeTruthy();
    expect(screen.queryByText("Room actions")).toBeNull();
    expect(screen.queryByText("Message the room")).toBeNull();
    expect(document.querySelector(".du-room-composer")).toBeTruthy();
    expect(document.querySelector(".du-room-composer-copy")).toBeTruthy();
    expect(document.querySelector(".du-room-composer-avatar")).toBeTruthy();
    expect(
      (document.querySelector(".du-room-composer .du-continuation-details") as HTMLDetailsElement)
        ?.open
    ).toBe(false);
    expect(screen.queryByRole("button", { name: "Ask for stronger options" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Review disagreements" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Confirm answer requirements" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Check evidence" })).toBeNull();
    expect(screen.getByText("Review actions appear after participants respond.")).toBeTruthy();
    expect(screen.queryByText("Review actions unlock later")).toBeNull();
    expect(
      screen.queryByText(
        "After the room has perspectives, disagreements, evidence gaps, risks, and a draft conclusion, review actions will appear here."
      )
    ).toBeNull();
    expect(screen.getByText("Participant source")).toBeTruthy();
    expect(screen.getByText("Demo participant discussion")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue discussion uses built-in demo participants so the full flow works without provider setup."
      )
    ).toBeTruthy();
    const pendingDiscussionActionsText =
      document.querySelector(".du-discussion-actions")?.textContent ?? "";
    expect(pendingDiscussionActionsText).not.toContain("Updates discussion");
    expect(pendingDiscussionActionsText).not.toContain(
      "After it finishes, review the updated timeline and next recommended action."
    );
    expect(pendingDiscussionActionsText).not.toContain("Review only");
    expect(pendingDiscussionActionsText).not.toContain(
      "Jump only; this does not change the discussion."
    );
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced start request"));
    const advancedStartRequestInput = (await screen.findByLabelText(
      "Advanced start request JSON"
    )) as HTMLTextAreaElement;
    fireEvent.input(advancedStartRequestInput, {
      target: {
        value: JSON.stringify(startRequest)
      }
    });
    expect(advancedStartRequestInput.value).toBe(JSON.stringify(startRequest));
    fireEvent.submit(advancedStartRequestInput.closest("form") as HTMLFormElement);

    await waitFor(() => expect(client.startRun).toHaveBeenCalledWith("run-1", startRequest));
    expect(await screen.findByText("Discussion steps completed")).toBeTruthy();
    const updatedSteps = screen.getByRole("region", { name: "Updated discussion steps" });
    expect(updatedSteps.classList.contains("du-readable-stage-result-room")).toBe(true);
    expect(updatedSteps.textContent ?? "").toContain("Room progress");
    expect(screen.getAllByText("Discussion room").length).toBeGreaterThan(0);
    const resultHandoff = screen.getByRole("region", { name: "Post-update review path" });
    expect(resultHandoff.textContent ?? "").toContain("Continue discussion");
    expect(resultHandoff.textContent ?? "").toContain(
      "Current conclusion appears after the room produces conclusion material."
    );
    expect(resultHandoff.textContent ?? "").not.toContain("View current conclusion");
    expect(screen.queryByRole("link", { name: "View current conclusion" })).toBeNull();
    expect(screen.getAllByText("Advanced / Developer Mode").length).toBeGreaterThanOrEqual(3);
    expect(document.body.textContent ?? "").not.toContain("event-2");
    fireEvent.click(getAdvancedModeSummaryByPanelText("Raw stage metadata"));
    expect(await screen.findByText("Raw stage metadata")).toBeTruthy();
    expect(screen.getByText(/sealed_divergence/)).toBeTruthy();
    expect(screen.getByText(/event-2/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("do not render this result payload");
  });

  it("keeps provider-backed continuation on first responses until model review roles are ready", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        }))
      })
    );

    expect(await screen.findByText("Model-backed discussion")).toBeTruthy();
    expect(await screen.findByText("Model first responses ready")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue discussion will ask configured model participants for the independent first responses."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Provider credentials stay on this machine; Web does not show saved API keys."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Continue discussion will collect independent first responses only until the local service reports a complete model review path."
      )
    ).toBeTruthy();
    expect(screen.getByText("Review actions appear after participants respond.")).toBeTruthy();
    expect(screen.queryByText("Review actions unlock later")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask for stronger options" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("openai-main");
    expect(document.body.textContent ?? "").not.toContain("openai-compatible");
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() =>
      expect(client.startRun).toHaveBeenCalledWith("run-1", {
        sealedDivergence: {
          autoCloseManual: true,
          retryFailedParticipants: true
        }
      })
    );
    expect(screen.queryByText("First responses collected")).toBeNull();
    expect(
      screen.queryByText(
        "The discussion collected independent first responses. Finish review role setup before organizing options or drafting a conclusion."
      )
    ).toBeNull();
  });

  it("uses model review roles for provider-backed continuation when the local service reports them ready", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        })),
        getRuntimeProfiles: vi.fn(async () => ({
          profiles: [
            {
              id: "local-preset",
              name: "Local preset",
              enabled: true,
              status: "ready",
              components: [],
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
                },
                {
                  id: "openai-compatible-extractor",
                  kind: "extraction_generator",
                  enabled: true
                },
                {
                  id: "openai-compatible-reviewer",
                  kind: "proposal_reviewer",
                  enabled: true
                },
                {
                  id: "openai-compatible-final-candidate",
                  kind: "final_candidate_generator",
                  enabled: true
                },
                {
                  id: "openai-compatible-final-auditor",
                  kind: "final_auditor",
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
                  }
                ],
                missingRecommendedEnvVars: [],
                notes: []
              },
              boundaries: []
            }
          ]
        }))
      })
    );

    expect(await screen.findByText("Model-backed review path ready")).toBeTruthy();
    expect(
      screen.getByText(
        "Continue discussion will ask configured model participants for independent first responses, then use Reviewer, Evidence checker, Risk reviewer, and Conclusion writer to review the result."
      )
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("DELIBERUM_OPENAI_API_KEY");
    expect(document.body.textContent ?? "").not.toContain("openai-main");
    expect(document.body.textContent ?? "").not.toContain("openai-compatible");
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() =>
      expect(client.startRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          sealedDivergence: {
            autoCloseManual: true,
            retryFailedParticipants: true
          },
          extraction: {
            generatorIds: ["openai-compatible-extractor"],
            retryFailedGenerators: true
          },
          review: expect.objectContaining({
            reviewerIds: ["openai-compatible-reviewer"],
            retryFailedReviewers: true
          }),
          finalization: expect.objectContaining({
            finalCandidateGeneratorId: "openai-compatible-final-candidate",
            auditGeneratorIds: ["openai-compatible-final-auditor"],
            retryFailedFinalCandidate: true,
            retryFailedAuditors: true,
            compileOutcome: true
          })
        })
      )
    );
    expect(screen.queryByText("Model-backed discussion continued")).toBeNull();
    expect(screen.queryByRole("region", { name: "Latest discussion update" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(
      "Model participants and review roles updated the readable timeline and conclusion materials."
    );
  });

  it("degrades provider-backed continuation to first responses when review roles are not ready", async () => {
    const client = renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        })),
        startRun: vi.fn(async () => ({
          run: {
            ...providerBackedRunDetail,
            status: "running",
            sealedDivergenceStatus: "completed"
          },
          stages: [
            {
              stage: "sealed_divergence",
              executionStatus: "executed",
              roundId: "sealed-round-1",
              status: "completed",
              eventIds: ["event-2", "event-3"]
            }
          ],
          stopped: false
        })),
        getRuntimeProfiles: vi.fn(async () => ({
          profiles: [
            {
              id: "local-preset",
              name: "Local preset",
              enabled: false,
              status: "disabled",
              components: [],
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
                missingRecommendedEnvVars: [],
                notes: []
              },
              boundaries: []
            }
          ]
        }))
      })
    );

    expect(await screen.findByText("Model first responses ready")).toBeTruthy();
    expect(
      screen.getByText(
        "Configured model participants can answer first, but the full review path is not ready in the current setup."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Collect independent first responses only; finish review role setup before generating strongest options or a conclusion."
      )
    ).toBeTruthy();
    fireEvent.click(getAdvancedModeSummaryByPanelText("Advanced start request"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Fill first responses request" })
    );
    const firstResponsesRequestInput = (await screen.findByLabelText(
      "Advanced start request JSON"
    )) as HTMLTextAreaElement;
    expect(firstResponsesRequestInput.value).toContain("sealedDivergence");
    expect(firstResponsesRequestInput.value).not.toContain("local-preset-extractor");
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() =>
      expect(client.startRun).toHaveBeenCalledWith("run-1", {
        sealedDivergence: {
          autoCloseManual: true,
          retryFailedParticipants: true
        }
      })
    );
    expect(screen.queryByText("First responses collected")).toBeNull();
    expect(screen.queryByRole("region", { name: "Post-update review path" })).toBeNull();
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
      await screen.findByText(
        "\u6a21\u578b\u521d\u59cb\u56de\u5e94\u5df2\u5c31\u7eea"
      )
    ).toBeTruthy();
    expect(screen.getByText("\u7ee7\u7eed\u8ba8\u8bba\u8bbe\u7f6e")).toBeTruthy();
    expect(
      screen.getByText(
        "\u5728\u672c\u5730\u670d\u52a1\u62a5\u544a\u5b8c\u6574\u6a21\u578b\u5ba1\u67e5\u8def\u5f84\u524d\uff0c\u7ee7\u7eed\u8ba8\u8bba\u53ea\u4f1a\u6536\u96c6\u72ec\u7acb\u521d\u59cb\u56de\u5e94\u3002"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "\u53c2\u4e0e\u8005\u56de\u5e94\u540e\uff0c\u5ba1\u9605\u52a8\u4f5c\u4f1a\u51fa\u73b0\u3002"
      )
    ).toBeTruthy();
    expect(screen.queryByText("\u5ba1\u9605\u52a8\u4f5c\u7a0d\u540e\u89e3\u9501")).toBeNull();
    expect(screen.queryByRole("button", { name: "\u8981\u6c42\u66f4\u5f3a\u9009\u9879" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("Model-backed discussion");
    expect(document.body.textContent ?? "").not.toContain("\u7ec4\u7ec7\u8def\u5f84");
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
    fireEvent.click(screen.getByRole("button", { name: "Fill recommended continuation request" }));

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
    expect(screen.queryByText("Discussion steps completed")).toBeNull();
    expect(screen.queryByRole("region", { name: "Updated discussion steps" })).toBeNull();
    expect(screen.getAllByText("Discussion room").length).toBeGreaterThan(0);
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

    fireEvent.click(await findAdvancedModeSummaryByPanelText("Structured discussion details"));
    await screen.findByText("No main perspectives");
    expect(screen.queryByText("Projection refreshed after start")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(screen.queryByText("Discussion steps completed")).toBeNull();
    expect((await screen.findAllByText("Projection refreshed after start")).length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText("Projection objection refreshed after start").length).toBeGreaterThan(
      0
    );
    expect(screen.getByText("Projection obligation refreshed after start")).toBeTruthy();
    expect(vi.mocked(client.getFrontier).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(client.getObjections).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(client.getObligations).mock.calls.length).toBeGreaterThanOrEqual(2);
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

  it("guides recovery from failed discussion stages without exposing internals", async () => {
    const error = new Error("Run stage could not be processed safely.");
    Object.assign(error, {
      code: "run_stage_failed",
      status: 400
    });
    renderApp(
      "/runs/run-1",
      createClient({
        startRun: vi.fn(async () => {
          throw error;
        }),
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        }))
      })
    );

    expect(await screen.findByRole("button", { name: "Continue discussion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue discussion" }));

    expect(await screen.findByText("Discussion could not continue")).toBeTruthy();
    expect(
      screen.getAllByText(
        "A model or review step could not finish safely. Check model setup, then try Continue discussion again. If the same discussion keeps failing after partial responses, start a new model-backed discussion."
      ).length
    ).toBeGreaterThan(0);
    const recovery = await screen.findByRole("region", {
      name: "Discussion recovery options"
    });
    expect(recovery.textContent ?? "").toContain("Keep the discussion recoverable");
    expect(recovery.textContent ?? "").toContain("Check model setup");
    expect(recovery.textContent ?? "").toContain("Try Continue discussion again");
    expect(recovery.textContent ?? "").toContain("Start a new model-backed discussion");

    const setupLink = Array.from(recovery.querySelectorAll("a")).find((link) =>
      link.textContent?.includes("Check model setup")
    );
    const startLink = Array.from(recovery.querySelectorAll("a")).find((link) =>
      link.textContent?.includes("Start a new model-backed discussion")
    );
    expect(setupLink?.getAttribute("href")).toBe("/setup/models");
    expect(startLink?.getAttribute("href")).toContain("/runs/new");
    expect(startLink?.getAttribute("href")).toContain("participants=model-backed");
    expect(document.body.textContent ?? "").not.toContain("run_stage_failed");
    expect(document.body.textContent ?? "").not.toContain("Run stage could not be processed safely.");
    expect(document.body.textContent ?? "").not.toContain("stack");
  });

  it("localizes failed discussion stage recovery guidance to Simplified Chinese", async () => {
    const zhContinue = "\u7ee7\u7eed\u8ba8\u8bba";
    const zhCouldNotContinue = "\u8ba8\u8bba\u65e0\u6cd5\u7ee7\u7eed";
    const zhDetail =
      "\u6709\u4e00\u4e2a\u6a21\u578b\u6216\u5ba1\u67e5\u6b65\u9aa4\u672a\u80fd\u5b89\u5168\u5b8c\u6210\u3002\u8bf7\u5148\u68c0\u67e5\u6a21\u578b\u8bbe\u7f6e\uff0c\u7136\u540e\u518d\u5c1d\u8bd5\u201c\u7ee7\u7eed\u8ba8\u8bba\u201d\u3002\u5982\u679c\u540c\u4e00\u8ba8\u8bba\u5728\u90e8\u5206\u56de\u5e94\u540e\u6301\u7eed\u5931\u8d25\uff0c\u8bf7\u5f00\u59cb\u4e00\u4e2a\u65b0\u7684\u6a21\u578b\u652f\u6301\u8ba8\u8bba\u3002";
    const zhRegion = "\u8ba8\u8bba\u6062\u590d\u9009\u9879";
    const zhHeading = "\u4fdd\u6301\u8ba8\u8bba\u53ef\u6062\u590d";
    const zhSetup = "\u68c0\u67e5\u6a21\u578b\u8bbe\u7f6e";
    const zhRetry = "\u518d\u6b21\u5c1d\u8bd5\u7ee7\u7eed\u8ba8\u8bba";
    const zhStart = "\u5f00\u59cb\u65b0\u7684\u6a21\u578b\u652f\u6301\u8ba8\u8bba";
    const error = new Error("Run stage could not be processed safely.");
    Object.assign(error, {
      code: "run_stage_failed",
      status: 400
    });
    renderApp(
      "/runs/run-1",
      createClient({
        startRun: vi.fn(async () => {
          throw error;
        }),
        getRun: vi.fn(async () => ({
          run: providerBackedRunDetail
        }))
      }),
      {
        initialLanguage: "zh-CN"
      }
    );

    expect(await screen.findByRole("button", { name: zhContinue })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: zhContinue }));

    expect(await screen.findByText(zhCouldNotContinue)).toBeTruthy();
    expect(screen.getAllByText(zhDetail).length).toBeGreaterThan(0);
    const recovery = await screen.findByRole("region", {
      name: zhRegion
    });
    expect(recovery.textContent ?? "").toContain(zhHeading);
    expect(recovery.textContent ?? "").toContain(zhSetup);
    expect(recovery.textContent ?? "").toContain(zhRetry);
    expect(recovery.textContent ?? "").toContain(zhStart);
    expect(document.body.textContent ?? "").not.toContain("run_stage_failed");
    expect(document.body.textContent ?? "").not.toContain("Run stage could not be processed safely.");
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

  it("explains conservative organizer fallback without exposing fallback ids", async () => {
    const client = createClient({
      getRunOutcome: vi.fn(async () => ({
        runId: runDetail.runId,
        sessionId: runDetail.sessionId,
        status: "compiled",
        draftStatus: "provisional",
        outcome: {
          recommendation: "Use the recovered discussion material as reviewable input.",
          alternatives: [
            {
              id: "fallback-candidate-1",
              title: "Review the independent first responses before deciding",
              description:
                "Use the revealed participant responses as provisional discussion material, then verify missing evidence, disagreements, and risks before relying on a conclusion.",
              status: "active"
            }
          ],
          unresolvedObjections: [
            {
              id: "fallback-objection-1",
              failureMode: "Structured organizer output was invalid.",
              consequence:
                "The current conclusion must remain provisional until participant responses are checked.",
              status: "open"
            }
          ],
          qualityObligations: [
            {
              id: "fallback-quality-1",
              requirement:
                "State that the organizer used a conservative fallback and keep the conclusion provisional until evidence and disagreements are reviewed.",
              status: "unanswered"
            }
          ],
          evidenceStatus: {
            evidenceNeeds: [
              {
                id: "fallback-evidence-1",
                reason:
                  "A human should confirm that the fallback interpretation reflects the revealed participant responses.",
                status: "open"
              }
            ]
          },
          unresolvedQuestions: [],
          continuationSuggestions: ["Check disagreements, missing evidence, and risks."],
          limitations: []
        }
      }))
    });

    renderApp("/runs/run-1/outcome", client);

    expect(await screen.findByLabelText("Organizer recovery notice")).toBeTruthy();
    expect(screen.getByText("Discussion organizer used a safe fallback")).toBeTruthy();
    expect(
      screen.getByText(
        "The model returned organizer output Deliberum could not use directly, so this view was rebuilt from the independent first responses. Treat the conclusion as provisional and check disagreements, missing evidence, and risks before relying on it."
      )
    ).toBeTruthy();
    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).not.toContain("fallback-candidate-1");
    expect(readableConclusion).not.toContain("fallback-objection-1");
    expect(readableConclusion).not.toContain("fallback-quality-1");
    expect(readableConclusion).not.toContain("fallback-evidence-1");
    expect(readableConclusion).not.toContain("extraction_output_invalid");
  });

  it("localizes conservative organizer fallback guidance in Simplified Chinese", async () => {
    const client = createClient({
      getRunOutcome: vi.fn(async () => ({
        runId: runDetail.runId,
        sessionId: runDetail.sessionId,
        status: "compiled",
        draftStatus: "provisional",
        outcome: {
          recommendation: "Use the recovered discussion material as reviewable input.",
          alternatives: [
            {
              id: "fallback-candidate-1",
              title: "Review the independent first responses before deciding",
              description:
                "Use the revealed participant responses as provisional discussion material, then verify missing evidence, disagreements, and risks before relying on a conclusion.",
              status: "active"
            }
          ],
          unresolvedObjections: [],
          qualityObligations: [],
          evidenceStatus: {
            evidenceNeeds: []
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

    expect(await screen.findByLabelText("\u7ec4\u7ec7\u5668\u6062\u590d\u63d0\u793a")).toBeTruthy();
    expect(screen.getByText("\u8ba8\u8bba\u7ec4\u7ec7\u5668\u4f7f\u7528\u4e86\u5b89\u5168\u964d\u7ea7")).toBeTruthy();
    expect(
      screen.getByText(
        "\u6a21\u578b\u8fd4\u56de\u7684\u7ec4\u7ec7\u5668\u8f93\u51fa\u65e0\u6cd5\u88ab Deliberum \u76f4\u63a5\u4f7f\u7528\uff0c\u56e0\u6b64\u6b64\u89c6\u56fe\u662f\u6839\u636e\u72ec\u7acb\u9996\u6b21\u56de\u5e94\u91cd\u5efa\u7684\u3002\u8bf7\u5c06\u7ed3\u8bba\u89c6\u4e3a\u4e34\u65f6\u7ed3\u8bba\uff0c\u5e76\u5728\u4f9d\u8d56\u524d\u68c0\u67e5\u5206\u6b67\u3001\u7f3a\u5931\u8bc1\u636e\u548c\u98ce\u9669\u3002"
      )
    ).toBeTruthy();
    const readableConclusion = document.querySelector(".du-outcome-brief")?.textContent ?? "";
    expect(readableConclusion).not.toContain("Discussion organizer used a safe fallback");
    expect(readableConclusion).not.toContain("fallback-candidate-1");
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
    expect(readableConclusion).toContain(
      "The rollout needs browser evidence that users can review missing evidence before relying on the conclusion."
    );
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
    expect(screen.getByText("Use the current conclusion as reviewable material.")).toBeTruthy();
    expect(screen.getByText("Unresolved questions")).toBeTruthy();
    expect(screen.getAllByText(/Evidence coverage remains incomplete/).length).toBeGreaterThan(0);
    const defaultPageText = document.body.textContent ?? "";
    expect(defaultPageText).not.toContain("daemon-backed final projection");
    expect(defaultPageText).not.toContain("final projection");
    expect(defaultPageText).not.toContain("accepted proposal material");
    expect(defaultPageText).toContain("Compiled from accepted discussion material only.");
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

  it("localizes user-facing outcome wording without exposing internal projection terms", async () => {
    renderApp("/sessions/session-1/final", createClient(), {
      initialLanguage: "zh-CN"
    });

    expect((await screen.findAllByText("\u5f53\u524d\u7ed3\u8bba")).length).toBeGreaterThan(0);
    await screen.findByText(
      "\u5c06\u5f53\u524d\u7ed3\u8bba\u4f5c\u4e3a\u53ef\u5ba1\u9605\u6750\u6599\u3002"
    );
    expect(
      screen.getByText(
        "\u4ec5\u6839\u636e\u5df2\u63a5\u53d7\u7684\u8ba8\u8bba\u6750\u6599\u7f16\u5236\u3002"
      )
    ).toBeTruthy();

    const defaultPageText = document.body.textContent ?? "";
    expect(defaultPageText).not.toContain("daemon-backed final projection");
    expect(defaultPageText).not.toContain("event_ledger_and_projections");
    expect(defaultPageText).not.toContain("final-candidate-event-1");
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
    const localStorageMatches = source.match(/\blocalStorage\b/g) ?? [];

    expect(source).not.toContain("ROLE_MODEL_DEFAULTS_STORAGE_KEY");
    expect(source).not.toContain("deliberum:model-role-defaults:v1");
    expect(localStorageMatches).toHaveLength(0);

    for (const forbiddenSnippet of [
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
