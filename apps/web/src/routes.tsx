import {
  Link,
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
  type RouterHistory
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataPanel,
  EmptyState,
  JsonBlock,
  KeyValueGrid,
  PageHeader,
  StatusBanner,
  WorkspaceShell
} from "@deliberum/ui";
import { useEffect, useState, type FormEvent } from "react";
import { useDaemonRuntime } from "./daemon-runtime";
import { buildRuntimeSetupPlan } from "@deliberum/client";
import type {
  AuditFinalCandidateRequest,
  DeploymentPostureResponse,
  OperationAuditResponse,
  ProposeFinalCandidateRequest,
  ResourceAccessPostureResponse
} from "@deliberum/client";
import {
  OutcomeBrief,
  RunDetailPage,
  RunNewPage,
  RunOutcomePage,
  RunsListPage
} from "./run-workspace";
import {
  AdvancedDetails,
  DaemonStatus,
  QueryState,
  RecordCollection,
  ViewFrame,
  asArray,
  formatSafeErrorMessage,
  formatRecordValue,
  getRecordValue,
  getStringRecordValue,
  sanitizeForDisplay
} from "./view-components";

const rootRoute = createRootRoute({
  component: RootRoute
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "runs",
  component: RunsListPage
});

const runsNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "runs/new",
  component: RunNewPage
});

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "runs/$runId",
  component: RunDetailPage
});

const runOutcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "runs/$runId/outcome",
  component: RunOutcomePage
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "sessions/$sessionId",
  component: SessionRoute
});

const sessionOverviewRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "/",
  component: SessionOverviewPage
});

const sessionFrontierRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "frontier",
  component: FrontierPage
});

const sessionObjectionsRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "objections",
  component: ObjectionsPage
});

const sessionObligationsRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "obligations",
  component: ObligationsPage
});

const sessionEventsRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "events",
  component: EventsPage
});

const sessionFinalRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "final",
  component: FinalPage
});

const sessionResourcesRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "resources",
  component: ResourcesPage
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  runsRoute,
  runsNewRoute,
  runDetailRoute,
  runOutcomeRoute,
  sessionRoute.addChildren([
    sessionOverviewRoute,
    sessionFrontierRoute,
    sessionObjectionsRoute,
    sessionObligationsRoute,
    sessionEventsRoute,
    sessionFinalRoute,
    sessionResourcesRoute
  ])
]);

const DEFAULT_FINAL_CANDIDATE_INPUT = formatFinalCandidateInput([]);

const DEFAULT_FINAL_AUDIT_INPUT = formatFinalAuditInput(undefined);

function formatFinalCandidateInput(candidateIds: readonly string[]): string {
  return JSON.stringify(
    {
      authorId: "final-coordinator",
      candidateIds,
      recommendation: "Record a provisional final candidate from accepted candidate material.",
      applicabilityConditions: ["Only applies to the accepted active candidate frontier."],
      rationale: "The recommendation is stored as reviewable proposal material.",
      limitations: ["Requires independent final audit before relying on the compiled outcome."],
      idempotencyKey: "web-final-candidate-1"
    },
    null,
    2
  );
}

function formatFinalAuditInput(proposalEventId: string | undefined): string {
  return JSON.stringify(
    {
      proposalEventId: proposalEventId ?? "",
      authorId: "final-auditor",
      findings: ["The final candidate remains provisional."],
      risks: ["Evidence coverage may still be incomplete."],
      unresolvedObjectionIds: [],
      qualityObligationIds: [],
      evidenceNeedIds: [],
      omissions: [],
      compressionProblems: [],
      limitations: ["The audit records boundaries only."],
      continuationSuggestions: ["Resolve open evidence needs before external reliance."],
      idempotencyKey: "web-final-audit-1"
    },
    null,
    2
  );
}

export type CreateAppRouterOptions = {
  initialPath?: string;
  history?: RouterHistory;
};

export function createAppRouter(options: CreateAppRouterOptions = {}) {
  return createRouter({
    routeTree,
    history:
      options.history ??
      (options.initialPath
        ? createMemoryHistory({
            initialEntries: [options.initialPath]
          })
        : undefined)
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

function RootRoute() {
  return <Outlet />;
}

function LandingPage() {
  const { daemonBaseUrl, client } = useDaemonRuntime();
  const [sessionId, setSessionId] = useState("");
  const navigate = useNavigate({ from: "/" });
  const trimmedSessionId = sessionId.trim();
  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => client.listSessions()
  });
  const runtimeProfilesQuery = useQuery({
    queryKey: ["runtime-profiles"],
    queryFn: () => client.getRuntimeProfiles()
  });
  const deploymentPostureQuery = useQuery({
    queryKey: ["deployment-posture"],
    queryFn: () => client.getDeploymentPosture()
  });
  const resourceAccessPostureQuery = useQuery({
    queryKey: ["resource-access-posture"],
    queryFn: () => client.getResourceAccessPosture()
  });
  const operationAuditQuery = useQuery({
    queryKey: ["operation-audit", "landing", 10],
    queryFn: () => client.getOperationAudit({ limit: 10 })
  });
  const sessions = asArray(sessionsQuery.data?.sessions);
  const runtimeProfiles = asArray(runtimeProfilesQuery.data?.profiles);
  const deploymentPosture = deploymentPostureQuery.data;
  const resourceAccessPosture = resourceAccessPostureQuery.data;
  const operationAuditEvents = operationAuditQuery.data?.events ?? [];
  const runtimeSetupPlan = runtimeProfilesQuery.data
    ? buildRuntimeSetupPlan(runtimeProfilesQuery.data)
    : undefined;
  const runtimeSetupProfilesById = new Map(
    (runtimeSetupPlan?.profiles ?? []).map((profile) => [profile.id, profile])
  );
  const sessionEntries = sessions.flatMap((session, index) => {
    const catalogSessionId = getStringRecordValue(session, "sessionId");

    return catalogSessionId ? [{ session, index, sessionId: catalogSessionId }] : [];
  });
  const runtimeProfileEntries = runtimeProfiles.map((profile, index) => ({
    profile,
    index,
    id: getStringRecordValue(profile, "id") ?? `runtime-profile-${index + 1}`
  }));

  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedSessionId.length === 0) {
      return;
    }

    void navigate({
      to: "/sessions/$sessionId",
      params: {
        sessionId: trimmedSessionId
      }
    });
  }

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel="User Mode"
    >
      <section className="du-landing">
        <PageHeader
          eyebrow="User Mode"
          title="Start a discussion"
          description="Use Deliberum to frame a hard question, collect independent perspectives, compare the strongest options, keep disagreements visible, and turn the current state into a reviewable conclusion with next steps."
          actions={
            <>
              <Link className="du-action-link" to="/runs/new">
                Start a discussion
              </Link>
              <Link className="du-action-link du-secondary-link" to="/runs">
                Continue discussions
              </Link>
            </>
          }
        />
        <div className="du-product-grid">
          <DataPanel
            title="What you can do"
            description="The default path is for people who need a clear decision surface, not system records."
          >
            <div className="du-readable-list">
              <QualityPathItem
                title="1. Start a discussion"
                detail="Write the question, goals, constraints, and expected output as a discussion brief."
              />
              <QualityPathItem
                title="2. Review the strongest current options"
                detail="Independent first responses become visible as main perspectives without collapsing them into a hidden authority."
              />
              <QualityPathItem
                title="3. Decide what to do next"
                detail="The current conclusion keeps open disagreements, risks, missing evidence, and recommended next actions together."
              />
            </div>
            <div className="du-action-row">
              <Link className="du-action-link" to="/runs/new">
                Start a discussion
              </Link>
              <Link className="du-action-link du-secondary-link" to="/runs">
                Continue existing discussions
              </Link>
            </div>
          </DataPanel>
          <DataPanel
            title="What the discussion keeps visible"
            description="Deliberum keeps the decision surface organized around what a person needs to inspect before relying on a conclusion."
          >
            <div className="du-quality-map">
              <QualityMapItem label="Discussion brief" value="Question, goals, constraints, and expected output." />
              <QualityMapItem label="Independent first responses" value="Separate starting perspectives before the group converges." />
              <QualityMapItem
                label="Strongest current options"
                value="The best visible choices without selecting one option invisibly."
              />
              <QualityMapItem label="Open disagreements" value="Concerns that still constrain the conclusion." />
              <QualityMapItem
                label="Requirements this answer must satisfy"
                value="Conditions the final answer must meet."
              />
              <QualityMapItem label="Evidence and verification" value="Claims or gaps that still need checking." />
              <QualityMapItem label="Risk review" value="Limits, assumptions, and failure cases to keep visible." />
              <QualityMapItem label="Current conclusion" value="The reviewable result with next steps." />
            </div>
          </DataPanel>
        </div>
        <AdvancedDetails
          summary="Advanced / Developer Mode: concept mapping"
          description="Core Deliberum concept names are preserved here for implementers and documentation readers."
        >
          <DataPanel title="Core concept mapping">
            <div className="du-quality-map">
              <QualityMapItem label="Topic Contract" value="Discussion brief" />
              <QualityMapItem label="Sealed Divergence" value="Independent first responses" />
              <QualityMapItem label="Candidate Frontier" value="Strongest current options" />
              <QualityMapItem label="Objections" value="Open disagreements" />
              <QualityMapItem
                label="Quality Obligations"
                value="Requirements this answer must satisfy"
              />
              <QualityMapItem label="Evidence Checks" value="Evidence and verification" />
              <QualityMapItem label="Final Audit" value="Risk review" />
              <QualityMapItem label="Outcome Compilation" value="Current conclusion" />
            </div>
          </DataPanel>
        </AdvancedDetails>
        <DataPanel
          title="Continue existing discussions"
          description="Open a known discussion and review its brief, perspectives, disagreements, requirements, evidence, conclusion, and next actions."
        >
          <QueryState query={sessionsQuery}>
            {sessionEntries.length === 0 ? (
              <EmptyState
                title="No discussions yet"
                description="Start a discussion to create the first local deliberation workspace."
              />
            ) : (
              <div className="du-run-list">
                {sessionEntries.map(({ session, index, sessionId: catalogSessionId }) => (
                  <article className="du-run-list-item" key={`${catalogSessionId}-${index}`}>
                    <p className="du-kicker">Discussion {index + 1}</p>
                    <h3>
                      {formatRecordValue(
                        getRecordValue(session, "title") ?? "Untitled session"
                      )}
                    </h3>
                    <p>
                      {formatRecordValue(
                        getRecordValue(session, "topic") ?? "No topic summary"
                      )}
                    </p>
                    <KeyValueGrid
                      items={[
                        {
                          label: "Activity",
                          value: `${formatRecordValue(getRecordValue(session, "eventCount"))} updates`
                        },
                        {
                          label: "Last updated",
                          value: formatRecordValue(
                            getRecordValue(session, "latestEventRecordedAt")
                          )
                        },
                        {
                          label: "Created",
                          value: formatRecordValue(
                            getRecordValue(session, "createdAt")
                          )
                        }
                      ]}
                    />
                    <div className="du-action-row">
                      <Link
                        className="du-action-link"
                        to="/sessions/$sessionId"
                        params={{ sessionId: catalogSessionId }}
                      >
                        Open discussion
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </QueryState>
        </DataPanel>
        <AdvancedDetails
          description="Runtime, daemon, resource, audit, deployment, raw session ids, and other operator details stay available here without leading the product experience."
        >
          <DataPanel title="Daemon status" description="Local daemon connection used by the Web UI.">
            <div className="du-advanced-status-grid">
              <DaemonStatus />
              <KeyValueGrid
                items={[
                  {
                    label: "Daemon base URL",
                    value: daemonBaseUrl
                  }
                ]}
              />
            </div>
          </DataPanel>
          <DataPanel
            title="Open by session id"
            description="Use this when you already know the underlying ledger session."
          >
            <form className="du-session-form" onSubmit={submitSession}>
              <label htmlFor="session-id">Session id</label>
              <div className="du-session-form-row">
                <input
                  id="session-id"
                  value={sessionId}
                  onChange={(event) => setSessionId(event.currentTarget.value)}
                  placeholder="session-id"
                />
                <button type="submit" disabled={trimmedSessionId.length === 0}>
                  Open
                </button>
              </div>
            </form>
          </DataPanel>
        <DataPanel
          title="Deployment posture"
          description="Safe local/pre-production daemon posture without secrets or configured resource URLs."
        >
          <QueryState query={deploymentPostureQuery}>
            {deploymentPosture ? (
              <>
                <KeyValueGrid
                  items={[
                    {
                      label: "Bind exposure",
                      value: formatDeploymentExposure(
                        deploymentPosture.binding.exposure
                      )
                    },
                    {
                      label: "Control auth",
                      value: formatDeploymentAuth(deploymentPosture.controlPlane)
                    },
                    {
                      label: "Configured stores",
                      value: formatDeploymentPersistence(deploymentPosture.persistence)
                    },
                    {
                      label: "Resource access",
                      value: formatDeploymentResourceAccess(
                        deploymentPosture.resourceAccess
                      )
                    },
                    {
                      label: "Web assets",
                      value: formatDeploymentWebAssets(deploymentPosture.webAssets)
                    },
                    {
                      label: "Production ready",
                      value: deploymentPosture.productionReadiness.readyForProduction
                        ? "Yes"
                        : "No"
                    },
                    {
                      label: "Blockers",
                      value: String(
                        deploymentPosture.productionReadiness.blockers.length
                      )
                    }
                  ]}
                />
                <div
                  className={`du-status ${formatDeploymentReadinessClass(
                    deploymentPosture.productionReadiness.status
                  )}`}
                >
                  <strong>
                    {formatDeploymentReadinessStatus(
                      deploymentPosture.productionReadiness.status
                    )}
                  </strong>
                  <span>
                    {deploymentPosture.productionReadiness.blockers.length > 0
                      ? deploymentPosture.productionReadiness.blockers.join(" ")
                      : "No daemon-reported blockers."}
                  </span>
                </div>
              </>
            ) : (
              <EmptyState
                title="No deployment posture"
                description="The daemon did not return safe deployment posture metadata."
              />
            )}
          </QueryState>
        </DataPanel>
        <DataPanel
          title="Resource access posture"
          description="Safe daemon resource delivery metadata without access ids, configured URLs, or payloads."
        >
          <QueryState query={resourceAccessPostureQuery}>
            {resourceAccessPosture ? (
              <>
                <KeyValueGrid
                  items={[
                    {
                      label: "Base URL posture",
                      value: formatResourceBaseUrl(resourceAccessPosture.baseUrl)
                    },
                    {
                      label: "Route pattern",
                      value: resourceAccessPosture.baseUrl.routePattern
                    },
                    {
                      label: "TTL",
                      value: formatResourceTtl(resourceAccessPosture.ttl)
                    },
                    {
                      label: "URL signing",
                      value: formatResourceUrlSigning(resourceAccessPosture.urlSigning)
                    },
                    {
                      label: "Grant store",
                      value: formatResourceGrantStore(resourceAccessPosture.grantStore)
                    },
                    {
                      label: "Hosted content",
                      value: formatHostedContent(resourceAccessPosture.hostedContent)
                    },
                    {
                      label: "Sensitive default",
                      value: "None"
                    },
                    {
                      label: "Delivery material",
                      value: "Short-lived access URL"
                    },
                    {
                      label: "Production hosting",
                      value: "Not production hosting"
                    },
                    {
                      label: "Blockers",
                      value: String(
                        resourceAccessPosture.productionHosting.blockers.length
                      )
                    }
                  ]}
                />
                <div className="du-status du-status-warning">
                  <strong>Not production hosting</strong>
                  <span>
                    {resourceAccessPosture.productionHosting.blockers.length > 0
                      ? resourceAccessPosture.productionHosting.blockers.join(" ")
                      : "No daemon-reported blockers."}
                  </span>
                </div>
              </>
            ) : (
              <EmptyState
                title="No resource access posture"
                description="The daemon did not return safe resource access posture metadata."
              />
            )}
          </QueryState>
        </DataPanel>
        <DataPanel
          title="Runtime profiles"
          description="Safe daemon profile setup status without environment values."
        >
          <QueryState query={runtimeProfilesQuery}>
            {runtimeProfileEntries.length === 0 ? (
              <EmptyState
                title="No runtime profiles"
                description="The daemon did not return profile setup metadata."
              />
            ) : (
              <>
                {runtimeSetupPlan ? (
                  <KeyValueGrid
                    items={[
                      {
                        label: "Setup steps",
                        value: String(runtimeSetupPlan.steps.length)
                      },
                      {
                        label: "Required env vars",
                        value: formatSetupEnvVarList(
                          runtimeSetupPlan.summary.missingRequiredEnvVars
                        )
                      },
                      {
                        label: "Recommended env vars",
                        value: formatSetupEnvVarList(
                          runtimeSetupPlan.summary.missingRecommendedEnvVars
                        )
                      },
                      {
                        label: "Secret env names",
                        value: formatSetupEnvVarList(
                          runtimeSetupPlan.summary.secretEnvVarNames
                        )
                      }
                    ]}
                  />
                ) : null}
                <div className="du-run-list">
                  {runtimeProfileEntries.map(({ profile, index, id }) => {
                    const setup = getRecordValue(profile, "setup");
                    const components = asArray(getRecordValue(profile, "components"));
                    const enabledComponents = components.filter(
                      (componentEntry) => getRecordValue(componentEntry, "enabled") === true
                    ).length;
                    const setupProfile = runtimeSetupProfilesById.get(id);
                    const missingRecommendedEnvVars = setupProfile
                      ? setupProfile.missingRecommendedEnvVars
                      : formatUnknownArray(
                          getRecordValue(setup, "missingRecommendedEnvVars")
                        );

                    return (
                      <article className="du-run-list-item" key={`${id}-${index}`}>
                        <p className="du-kicker">{id}</p>
                        <h3>{formatRecordValue(getRecordValue(profile, "name") ?? id)}</h3>
                        <p>
                          {formatRuntimeProfileStatus(getRecordValue(profile, "status"))}
                        </p>
                        <KeyValueGrid
                          items={[
                            {
                              label: "Enabled",
                              value:
                                getRecordValue(profile, "enabled") === true ? "Yes" : "No"
                            },
                            {
                              label: "Components",
                              value: `${enabledComponents}/${components.length}`
                            },
                            {
                              label: "Enable env var",
                              value: formatRecordValue(getRecordValue(setup, "enableEnvVar"))
                            },
                            {
                              label: "Required setup",
                              value: formatSetupEnvVarList(
                                setupProfile?.missingRequiredEnvVars ?? []
                              )
                            },
                            {
                              label: "Recommended setup",
                              value: formatSetupEnvVarList(missingRecommendedEnvVars)
                            },
                            {
                              label: "Plan steps",
                              value: setupProfile
                                ? String(setupProfile.steps.length)
                                : "Unavailable"
                            }
                          ]}
                        />
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </QueryState>
        </DataPanel>
        <DataPanel
          title="Operation audit"
          description="Recent safe daemon control-plane metadata without request bodies, tokens, or payloads."
        >
          <QueryState query={operationAuditQuery}>
            {operationAuditEvents.length === 0 ? (
              <EmptyState
                title="No operation audit entries"
                description="The daemon has not returned safe operation audit metadata yet."
              />
            ) : (
              <div className="du-run-list">
                {operationAuditEvents.map((event) => (
                  <article className="du-run-list-item" key={event.id}>
                    <p className="du-kicker">{event.recordedAt}</p>
                    <h3>{formatRecordValue(event.action)}</h3>
                    <p>{formatAuditRoute(event)}</p>
                    <KeyValueGrid
                      items={[
                        {
                          label: "Status",
                          value: `${event.statusCode} ${formatRecordValue(
                            event.outcome
                          )}`
                        },
                        {
                          label: "Method",
                          value: event.method
                        },
                        {
                          label: "Authorization",
                          value: formatAuditAuthorization(event.authorization)
                        },
                        {
                          label: "Target",
                          value: formatAuditTarget(event.target)
                        }
                      ]}
                    />
                  </article>
                ))}
              </div>
            )}
          </QueryState>
        </DataPanel>
        </AdvancedDetails>
      </section>
    </WorkspaceShell>
  );
}

function QualityPathItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="du-readable-item">
      <h4>{title}</h4>
      <p>{detail}</p>
    </div>
  );
}

function QualityMapItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="du-quality-map-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type SessionReadableKind = "perspective" | "disagreement" | "requirement" | "evidence";

function ReadableSessionRecordList({
  records,
  emptyTitle,
  emptyDescription,
  kind
}: {
  records: unknown[];
  emptyTitle: string;
  emptyDescription: string;
  kind: SessionReadableKind;
}) {
  if (records.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="du-readable-list">
      {records.map((record, index) => (
        <ReadableSessionRecord
          key={`${kind}:${index}:${formatRecordValue(getRecordValue(record, "proposalEventId"))}`}
          record={record}
          index={index}
          kind={kind}
        />
      ))}
    </div>
  );
}

function ReadableSessionRecord({
  record,
  index,
  kind
}: {
  record: unknown;
  index: number;
  kind: SessionReadableKind;
}) {
  const object = getRecordValue(record, "object") ?? record;
  const id = getStringRecordValue(object, "id") ?? `${kind}-${index + 1}`;
  const fallbackTitle = `${formatReadableKind(kind)} ${index + 1}`;
  const title =
    getFirstDisplayValue(object, ["title", "name", "question", "requirement", "failureMode"]) ??
    fallbackTitle;
  const detail =
    getFirstDisplayValue(object, [
      "summary",
      "description",
      "content",
      "rationale",
      "consequence",
      "requirement"
    ]) ?? "Detailed material is available in Advanced details.";
  const status = formatRecordValue(getRecordValue(object, "status"));
  const proposalEventId = formatRecordValue(getRecordValue(record, "proposalEventId"));
  const sourceEventIds = formatRecordIdList(asArray(getRecordValue(object, "sourceEventIds")));

  return (
    <article className="du-readable-item">
      <p className="du-kicker">{formatReadableKind(kind)} {index + 1}</p>
      <h4>{title}</h4>
      {detail !== title ? <p>{detail}</p> : null}
      <p className="du-readable-meta">Status: {status}</p>
      <AdvancedDetails summary="Advanced / Developer Mode: source details">
        <KeyValueGrid
          items={[
            {
              label: "Object id",
              value: id
            },
            {
              label: "Proposal event",
              value: proposalEventId
            },
            {
              label: "Source events",
              value: sourceEventIds
            }
          ]}
        />
        <JsonBlock value={sanitizeForDisplay(record)} />
      </AdvancedDetails>
    </article>
  );
}

function getFirstDisplayValue(record: unknown, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = getStringRecordValue(record, key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function formatReadableKind(kind: SessionReadableKind): string {
  if (kind === "perspective") {
    return "Perspective";
  }

  if (kind === "disagreement") {
    return "Open disagreement";
  }

  if (kind === "requirement") {
    return "Requirement";
  }

  return "Missing evidence";
}

function formatSessionEventTypeForUser(value: unknown): string {
  if (value === "topic_contract_published") {
    return "Discussion brief published";
  }

  if (value === "sealed_contribution_submitted") {
    return "Independent response received";
  }

  if (value === "final_audit_recorded") {
    return "Risk review recorded";
  }

  if (typeof value === "string" && value.length > 0) {
    return value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (character) => character.toUpperCase());
  }

  return "No visible step returned";
}

function formatRecordIdList(values: unknown[]): string {
  const ids = values.filter((value): value is string => typeof value === "string");

  return ids.length > 0 ? ids.join(", ") : "None";
}

function formatRuntimeProfileStatus(value: unknown): string {
  if (value === "ready") {
    return "Ready";
  }

  if (value === "ready_with_run_config") {
    return "Ready with run config";
  }

  if (value === "needs_configuration") {
    return "Needs configuration";
  }

  if (value === "disabled") {
    return "Disabled";
  }

  return formatRecordValue(value);
}

function formatSetupEnvVarList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "Complete";
}

function formatDeploymentExposure(
  value: DeploymentPostureResponse["binding"]["exposure"]
): string {
  if (value === "localhost") {
    return "Localhost";
  }

  if (value === "lan") {
    return "LAN";
  }

  return "Public";
}

function formatDeploymentAuth(
  value: DeploymentPostureResponse["controlPlane"]
): string {
  if (!value.protected) {
    return "Disabled";
  }

  if (value.tokenMode === "registry") {
    const label = value.principalCount === 1 ? "principal" : "principals";

    return `Daemon bearer / registry / ${value.principalCount} ${label}`;
  }

  if (value.tokenMode === "single") {
    return "Daemon bearer / single token";
  }

  return "Daemon bearer";
}

function formatDeploymentPersistence(
  value: DeploymentPostureResponse["persistence"]
): string {
  const modes = [
    value.eventLedger,
    value.runMetadata,
    value.resourceBroker,
    value.resourceAccessGrants,
    value.operationAudit
  ];
  const configuredCount = modes.filter((mode) => mode === "configured_store").length;
  const processLock =
    value.sqliteProcessLock === "configured" ? "process lock" : "no process lock";

  return `${configuredCount}/${modes.length}, ${processLock}`;
}

function formatDeploymentResourceAccess(
  value: DeploymentPostureResponse["resourceAccess"]
): string {
  const exposure = formatDeploymentExposure(value.baseUrlExposure);
  const continuity =
    value.grantStoreRestartContinuity === "depends_on_configured_store"
      ? "restart-aware"
      : "restart-lost";
  const signing = value.urlSigningConfigured ? "signed" : "unsigned";

  return `${exposure}, ${continuity}, ${signing}`;
}

function formatDeploymentWebAssets(
  value: DeploymentPostureResponse["webAssets"]
): string {
  return value.configured ? "HTML shell split" : "Disabled";
}

function formatDeploymentReadinessStatus(
  value: DeploymentPostureResponse["productionReadiness"]["status"]
): string {
  if (value === "local_only") {
    return "Local-only posture";
  }

  if (value === "preproduction_remote_hardened") {
    return "Pre-production hardened";
  }

  return "Not production-ready";
}

function formatDeploymentReadinessClass(
  value: DeploymentPostureResponse["productionReadiness"]["status"]
): string {
  if (value === "not_production_ready") {
    return "du-status-error";
  }

  return "du-status-warning";
}

function formatResourceBaseUrl(
  value: ResourceAccessPostureResponse["baseUrl"]
): string {
  const exposure = formatDeploymentExposure(value.exposure);
  const configured = value.configured ? "configured" : "default";

  return `${exposure}, ${configured}`;
}

function formatResourceTtl(value: ResourceAccessPostureResponse["ttl"]): string {
  const configured = value.configured ? "" : " default";

  return `${value.defaultTtlMs} ms / max ${value.maxTtlMs} ms${configured}`;
}

function formatResourceUrlSigning(
  value: ResourceAccessPostureResponse["urlSigning"]
): string {
  return value.configured
    ? `${value.algorithm}, required`
    : `${value.algorithm}, not configured`;
}

function formatResourceGrantStore(
  value: ResourceAccessPostureResponse["grantStore"]
): string {
  const mode = value.mode === "configured_store" ? "Configured store" : "Process memory";
  const continuity = formatResourceRestartContinuity(value.restartContinuity);

  return `${mode}, ${continuity}`;
}

function formatHostedContent(
  value: ResourceAccessPostureResponse["hostedContent"]
): string {
  const policy = value.requiresExplicitPolicy ? "Explicit policy" : "Implicit policy";
  const sizeLimit = value.requiresSizeLimit ? "size-limited" : "unbounded";
  const brokerContinuity = formatResourceRestartContinuity(
    value.brokerContentRestartContinuity
  );
  const grantContinuity = formatResourceRestartContinuity(value.grantRestartContinuity);

  return `${policy}, ${sizeLimit}, broker ${brokerContinuity}, grants ${grantContinuity}`;
}

function formatResourceRestartContinuity(
  value:
    | ResourceAccessPostureResponse["grantStore"]["restartContinuity"]
    | ResourceAccessPostureResponse["hostedContent"]["brokerContentRestartContinuity"]
): string {
  return value === "depends_on_configured_store" ? "restart-aware" : "restart-lost";
}

function formatAuditRoute(event: OperationAuditResponse["events"][number]): string {
  return `${event.method} ${event.route}`;
}

function formatAuditAuthorization(
  value: OperationAuditResponse["events"][number]["authorization"]
): string {
  const mode = formatRecordValue(value.mode);
  const presence = value.present ? "present" : "absent";
  const principal = value.principalId ? `, ${value.principalId}` : "";
  const role = value.role ? ` (${formatRecordValue(value.role)})` : "";
  const scopes =
    value.scopes && value.scopes.length > 0
      ? `, scopes ${value.scopes.map((scope) => formatRecordValue(scope)).join(", ")}`
      : "";

  return `${mode}, ${presence}${principal}${role}${scopes}`;
}

function formatAuditTarget(
  value: OperationAuditResponse["events"][number]["target"]
): string {
  const parts = [
    ["run", value.runId],
    ["session", value.sessionId],
    ["batch", value.batchId],
    ["proposal", value.proposalEventId],
    ["resource", value.resourceId]
  ].flatMap(([label, id]) => (id ? [`${label}: ${id}`] : []));

  return parts.length > 0 ? parts.join(", ") : "None";
}

function formatUnknownArray(value: unknown): string[] {
  return asArray(value)
    .map((entry) => formatRecordValue(entry))
    .filter((entry) => entry !== "None");
}

function SessionRoute() {
  const { sessionId } = useSessionParams();

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel="User Mode"
      navigation={<SessionNavigation sessionId={sessionId} />}
    >
      <Outlet />
    </WorkspaceShell>
  );
}

function SessionNavigation({ sessionId }: { sessionId: string }) {
  const linkClass = "du-nav-link";

  return (
    <>
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId }}
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Discussion brief
      </Link>
      <Link
        to="/sessions/$sessionId/frontier"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Main perspectives
      </Link>
      <Link
        to="/sessions/$sessionId/objections"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Open disagreements
      </Link>
      <Link
        to="/sessions/$sessionId/obligations"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Requirements
      </Link>
      <Link
        to="/sessions/$sessionId/final"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Current conclusion
      </Link>
      <Link
        to="/sessions/$sessionId/resources"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Evidence
      </Link>
      <details className="du-nav-advanced">
        <summary>Advanced</summary>
        <Link
          to="/sessions/$sessionId/events"
          params={{ sessionId }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          Ledger events
        </Link>
      </details>
    </>
  );
}

function SessionOverviewPage() {
  const { sessionId } = useSessionParams();
  const eventsQuery = useSessionEventsQuery(sessionId);
  const events = asArray(eventsQuery.data?.events);
  const latestEvent = events.at(-1);
  const topicContractEvent =
    events.find((event) => getRecordValue(event, "type") === "topic_contract_published") ??
    latestEvent;
  const topicContractPayload = getRecordValue(topicContractEvent, "payload");
  const discussionTopic = formatRecordValue(
    getRecordValue(topicContractPayload, "topic") ?? "No discussion brief returned"
  );

  return (
    <ViewFrame
      eyebrow="User Mode"
      title="Discussion brief"
      description="The human-facing starting point for this discussion: what is being decided and where the discussion currently stands."
    >
      <QueryState query={eventsQuery}>
        <DataPanel
          title="Discussion brief"
          description="The discussion setup is shown here in plain language."
        >
          <div className="du-readable-list">
            <QualityPathItem title="Question or topic" detail={discussionTopic} />
            <QualityPathItem
              title="Current activity"
              detail={`${events.length} update${events.length === 1 ? "" : "s"} recorded for this discussion.`}
            />
            <QualityPathItem
              title="Latest visible step"
              detail={formatSessionEventTypeForUser(getRecordValue(latestEvent, "type"))}
            />
          </div>
        </DataPanel>
        <AdvancedDetails
          description="Ledger position and raw latest entry are available for debugging without leading the user experience."
        >
          <KeyValueGrid
            items={[
              {
                label: "Session id",
                value: sessionId
              },
              {
                label: "Ledger events",
                value: events.length
              },
              {
                label: "Latest sequence",
                value: formatRecordValue(getRecordValue(latestEvent, "sequence"))
              },
              {
                label: "Latest event type",
                value: formatRecordValue(getRecordValue(latestEvent, "type"))
              }
            ]}
          />
          <DataPanel title="Latest ledger entry">
            {latestEvent ? (
              <JsonBlock value={latestEvent} />
            ) : (
              <EmptyState
                title="No ledger entries"
                description="The daemon returned no events for this session id."
              />
            )}
          </DataPanel>
        </AdvancedDetails>
      </QueryState>
    </ViewFrame>
  );
}

function FrontierPage() {
  const { sessionId } = useSessionParams();
  const { client } = useDaemonRuntime();
  const frontierQuery = useQuery({
    queryKey: ["frontier", sessionId],
    queryFn: () => client.getFrontier(sessionId)
  });

  return (
    <ViewFrame
      eyebrow="User Mode"
      title="Main perspectives"
      description="The strongest current options stay visible without selecting one hidden answer."
    >
      <QueryState query={frontierQuery}>
        <DataPanel
          title="Strongest current options"
          description="These are the strongest currently visible perspectives. They remain open to challenge while the discussion continues."
        >
          <ReadableSessionRecordList
            records={asArray(frontierQuery.data?.candidates)}
            emptyTitle="No active candidates"
            emptyDescription="No main perspectives have been accepted into this discussion yet."
            kind="perspective"
          />
        </DataPanel>
        <AdvancedDetails description="Projection basis and raw candidate material for developer inspection.">
          <DataPanel title="Candidate Frontier projection">
            <JsonBlock
              value={sanitizeForDisplay({
                basis: frontierQuery.data?.basis ?? "accepted_active_candidates",
                candidates: frontierQuery.data?.candidates ?? []
              })}
            />
          </DataPanel>
        </AdvancedDetails>
      </QueryState>
    </ViewFrame>
  );
}

function ObjectionsPage() {
  const { sessionId } = useSessionParams();
  const { client } = useDaemonRuntime();
  const objectionsQuery = useQuery({
    queryKey: ["objections", sessionId],
    queryFn: () => client.getObjections(sessionId)
  });

  return (
    <ViewFrame
      eyebrow="User Mode"
      title="Open disagreements"
      description="Objections stay visible as unresolved disagreements that can still constrain the conclusion."
    >
      <QueryState query={objectionsQuery}>
        <DataPanel
          title="Open disagreements"
          description="These are challenges, failure modes, or unresolved concerns raised against the current options."
        >
          <ReadableSessionRecordList
            records={asArray(objectionsQuery.data?.objections)}
            emptyTitle="No open disagreements"
            emptyDescription="No open disagreements have been accepted into this discussion yet."
            kind="disagreement"
          />
        </DataPanel>
        <AdvancedDetails description="Raw objection projection material for developer inspection.">
          <RecordCollection
            title="Objection projection records"
            records={asArray(objectionsQuery.data?.objections)}
            emptyTitle="No derived objections"
            emptyDescription="Accepted extraction proposals have not introduced objections yet."
          />
        </AdvancedDetails>
      </QueryState>
    </ViewFrame>
  );
}

function ObligationsPage() {
  const { sessionId } = useSessionParams();
  const { client } = useDaemonRuntime();
  const obligationsQuery = useQuery({
    queryKey: ["obligations", sessionId],
    queryFn: () => client.getObligations(sessionId)
  });

  return (
    <ViewFrame
      eyebrow="User Mode"
      title="Requirements this answer must satisfy"
      description="Explicit requirements keep the conclusion correct, bounded, and complete."
    >
      <QueryState query={obligationsQuery}>
        <DataPanel
          title="Requirements this answer must satisfy"
          description="Unanswered requirements should be resolved before relying on the conclusion."
        >
          <ReadableSessionRecordList
            records={asArray(obligationsQuery.data?.qualityObligations)}
            emptyTitle="No requirements returned"
            emptyDescription="No explicit requirements have been accepted into this discussion yet."
            kind="requirement"
          />
        </DataPanel>
        <AdvancedDetails description="Raw quality obligation projection material for developer inspection.">
          <RecordCollection
            title="Quality obligation projection records"
            records={asArray(obligationsQuery.data?.qualityObligations)}
            emptyTitle="No quality obligations"
            emptyDescription="Accepted extraction proposals have not introduced obligations yet."
          />
        </AdvancedDetails>
      </QueryState>
    </ViewFrame>
  );
}

function EventsPage() {
  const { sessionId } = useSessionParams();
  const eventsQuery = useSessionEventsQuery(sessionId);

  return (
    <ViewFrame
      eyebrow="Advanced / Developer Mode"
      title="Ledger events"
      description="Append-only event records are shown as returned by the daemon for debugging and audit inspection."
    >
      <QueryState query={eventsQuery}>
        <RecordCollection
          title="Events"
          records={asArray(eventsQuery.data?.events)}
          emptyTitle="No events"
          emptyDescription="The daemon returned no ledger entries for this session id."
        />
      </QueryState>
    </ViewFrame>
  );
}

function FinalPage() {
  const { sessionId } = useSessionParams();
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const [candidateInput, setCandidateInput] = useState(DEFAULT_FINAL_CANDIDATE_INPUT);
  const [auditInput, setAuditInput] = useState(DEFAULT_FINAL_AUDIT_INPUT);
  const [candidateInputTouched, setCandidateInputTouched] = useState(false);
  const [auditInputTouched, setAuditInputTouched] = useState(false);
  const [candidateInputError, setCandidateInputError] = useState<string | null>(null);
  const [auditInputError, setAuditInputError] = useState<string | null>(null);
  const [candidateResult, setCandidateResult] = useState<unknown>(null);
  const [auditResult, setAuditResult] = useState<unknown>(null);
  const [projectionProposalEventId, setProjectionProposalEventId] = useState("");
  const [appliedProjectionProposalEventId, setAppliedProjectionProposalEventId] = useState<
    string | undefined
  >();
  const finalQuery = useQuery({
    queryKey: ["session-final", sessionId, appliedProjectionProposalEventId ?? "latest"],
    queryFn: () =>
      appliedProjectionProposalEventId
        ? client.getSessionFinal(sessionId, {
            finalCandidateProposalEventId: appliedProjectionProposalEventId
          })
        : client.getSessionFinal(sessionId)
  });
  const frontierQuery = useQuery({
    queryKey: ["frontier", sessionId],
    queryFn: () => client.getFrontier(sessionId)
  });
  const finalCandidateMutation = useMutation({
    mutationFn: () =>
      client.proposeFinalCandidate(
        sessionId,
        parseJsonObject(candidateInput) as ProposeFinalCandidateRequest
      ),
    onSuccess: async (result) => {
      setCandidateInputError(null);
      setCandidateResult(result);
      const proposalEventId = getStringRecordValue(
        getRecordValue(result, "event"),
        "id"
      );

      if (!auditInputTouched && proposalEventId) {
        setAuditInput(formatFinalAuditInput(proposalEventId));
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session-final", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["events", sessionId] })
      ]);
    }
  });
  const finalAuditMutation = useMutation({
    mutationFn: () => {
      const submission = parseFinalAuditJson(auditInput);

      return client.auditFinalCandidate(sessionId, submission.proposalEventId, submission.input);
    },
    onSuccess: async (result) => {
      setAuditInputError(null);
      setAuditResult(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session-final", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["events", sessionId] })
      ]);
    }
  });
  const outcome = finalQuery.data?.outcome;
  const provenance = getRecordValue(outcome, "provenance");
  const eventRange = getRecordValue(provenance, "eventRange");
  const fromSequence = getRecordValue(eventRange, "fromSequence");
  const toSequence = getRecordValue(eventRange, "toSequence");
  const finalCandidateProposalEventId = getStringRecordValue(
    provenance,
    "finalCandidateProposalEventId"
  );
  const acceptedCandidateIds = extractCandidateIdsFromFrontier(frontierQuery.data);
  const acceptedCandidateInput = formatFinalCandidateInput(acceptedCandidateIds);
  const auditProposalEventId = getFinalAuditProposalEventId(auditInput);
  const canSubmitFinalCandidate =
    !frontierQuery.isLoading &&
    !frontierQuery.isError &&
    acceptedCandidateIds.length > 0 &&
    !finalCandidateMutation.isPending;
  const canSubmitFinalAudit =
    auditProposalEventId !== undefined &&
    auditProposalEventId.length > 0 &&
    !finalAuditMutation.isPending;
  const finalCandidateReadiness = describeFinalCandidateReadiness({
    frontierLoading: frontierQuery.isLoading,
    frontierError: frontierQuery.isError,
    candidateCount: acceptedCandidateIds.length
  });
  const finalAuditReadiness = describeFinalAuditReadiness(auditProposalEventId);
  const canClearProjectionOverride =
    appliedProjectionProposalEventId !== undefined ||
    projectionProposalEventId.trim().length > 0;

  useEffect(() => {
    if (candidateInputTouched || acceptedCandidateIds.length === 0) {
      return;
    }

    setCandidateInput(acceptedCandidateInput);
  }, [acceptedCandidateIds.length, acceptedCandidateInput, candidateInputTouched]);

  useEffect(() => {
    if (auditInputTouched || !finalCandidateProposalEventId) {
      return;
    }

    setAuditInput(formatFinalAuditInput(finalCandidateProposalEventId));
  }, [auditInputTouched, finalCandidateProposalEventId]);

  function submitFinalCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmitFinalCandidate) {
      return;
    }

    try {
      parseJsonObject(candidateInput);
      setCandidateInputError(null);
      finalCandidateMutation.mutate();
    } catch (error) {
      setCandidateInputError(error instanceof Error ? error.message : "Invalid JSON input.");
    }
  }

  function submitFinalAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmitFinalAudit) {
      return;
    }

    try {
      parseFinalAuditJson(auditInput);
      setAuditInputError(null);
      finalAuditMutation.mutate();
    } catch (error) {
      setAuditInputError(error instanceof Error ? error.message : "Invalid JSON input.");
    }
  }

  function submitProjectionOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const proposalEventId = projectionProposalEventId.trim();

    setAppliedProjectionProposalEventId(
      proposalEventId.length > 0 ? proposalEventId : undefined
    );
  }

  function clearProjectionOverride() {
    setProjectionProposalEventId("");
    setAppliedProjectionProposalEventId(undefined);
  }

  return (
    <ViewFrame
      eyebrow="User Mode"
      title="Current conclusion"
      description="Review the current conclusion together with main perspectives, open disagreements, missing evidence, risks, and next actions."
    >
      <QueryState query={finalQuery}>
        <StatusBanner
          tone={finalQuery.data?.draftStatus === "draft" ? "ok" : "warning"}
          title={
            finalQuery.data?.draftStatus === "draft"
              ? "Current conclusion compiled"
              : "Current conclusion remains provisional"
          }
          detail="This is reviewable deliberation material. It should keep open disagreements, risks, evidence gaps, and next actions visible."
        />
        <DataPanel
          title="Current conclusion"
          description="A readable summary of the current result. Advanced details keep technical provenance and developer controls."
        >
          <OutcomeBrief outcome={outcome} />
        </DataPanel>
        <AdvancedDetails
          description="Projection overrides, provenance, raw JSON, internal ids, Final Audit controls, and proposal lifecycle controls for developers."
        >
          <form className="du-inline-form" onSubmit={submitProjectionOverride}>
            <label htmlFor="du-final-projection-event">
              Candidate proposal event override
            </label>
            <div className="du-inline-form-row">
              <input
                id="du-final-projection-event"
                value={projectionProposalEventId}
                placeholder="final-candidate-event-1"
                onChange={(event) => setProjectionProposalEventId(event.target.value)}
              />
              <button type="submit">Compile projection</button>
              <button
                className="du-secondary-button"
                type="button"
                disabled={!canClearProjectionOverride}
                onClick={clearProjectionOverride}
              >
                Use latest proposal
              </button>
            </div>
            {appliedProjectionProposalEventId ? (
              <StatusBanner
                tone="neutral"
                title="Specific final proposal selected"
                detail={appliedProjectionProposalEventId}
              />
            ) : null}
          </form>
          <KeyValueGrid
            items={[
              {
                label: "Session id",
                value: finalQuery.data?.sessionId ?? sessionId
              },
              {
                label: "Draft status",
                value: finalQuery.data?.draftStatus ?? "None"
              },
              {
                label: "Event range",
                value:
                  typeof fromSequence === "number" || typeof toSequence === "number"
                    ? `${formatRecordValue(fromSequence)} to ${formatRecordValue(toSequence)}`
                    : "None"
              },
              {
                label: "Candidate proposal event",
                value: finalCandidateProposalEventId ?? "None"
              }
            ]}
          />
          <DataPanel
            title="Provenance"
            description="Projection version, event ids, and selected candidate proposal reference."
          >
            <JsonBlock value={sanitizeForDisplay(provenance ?? {})} />
          </DataPanel>
          <DataPanel
            title="Compiled outcome JSON"
            description="Complete daemon response for inspection; rendered without client-side semantic mutation."
          >
            <JsonBlock value={sanitizeForDisplay(outcome ?? {})} />
          </DataPanel>
          <DataPanel
            title="Final lifecycle controls"
            description="Submits final candidate proposals and final audits to daemon lifecycle endpoints."
          >
            <div className="du-final-lifecycle-grid">
              <form className="du-json-form" onSubmit={submitFinalCandidate}>
                <label htmlFor="du-final-candidate-input">Final candidate proposal JSON</label>
                <textarea
                  id="du-final-candidate-input"
                  value={candidateInput}
                  onChange={(event) => {
                    setCandidateInputTouched(true);
                    setCandidateInput(event.target.value);
                  }}
                />
                <button type="submit" disabled={!canSubmitFinalCandidate}>
                  {finalCandidateMutation.isPending ? "Submitting" : "Propose final candidate"}
                </button>
                {finalCandidateReadiness ? (
                  <StatusBanner
                    tone={finalCandidateReadiness.tone}
                    title={finalCandidateReadiness.title}
                    detail={finalCandidateReadiness.detail}
                  />
                ) : null}
                {candidateInputError ? (
                  <StatusBanner tone="error" title={candidateInputError} />
                ) : null}
                {finalCandidateMutation.isError ? (
                  <StatusBanner
                    tone="error"
                    title="Final candidate proposal failed"
                    detail={formatSafeErrorMessage(finalCandidateMutation.error)}
                  />
                ) : null}
                {candidateResult ? (
                  <JsonBlock value={sanitizeForDisplay(candidateResult)} />
                ) : null}
              </form>
              <form className="du-json-form" onSubmit={submitFinalAudit}>
                <label htmlFor="du-final-audit-input">Final audit JSON</label>
                <textarea
                  id="du-final-audit-input"
                  value={auditInput}
                  onChange={(event) => {
                    setAuditInputTouched(true);
                    setAuditInput(event.target.value);
                  }}
                />
                <button type="submit" disabled={!canSubmitFinalAudit}>
                  {finalAuditMutation.isPending ? "Submitting" : "Record final audit"}
                </button>
                {finalAuditReadiness ? (
                  <StatusBanner
                    tone={finalAuditReadiness.tone}
                    title={finalAuditReadiness.title}
                    detail={finalAuditReadiness.detail}
                  />
                ) : null}
                {auditInputError ? <StatusBanner tone="error" title={auditInputError} /> : null}
                {finalAuditMutation.isError ? (
                  <StatusBanner
                    tone="error"
                    title="Final audit failed"
                    detail={formatSafeErrorMessage(finalAuditMutation.error)}
                  />
                ) : null}
                {auditResult ? <JsonBlock value={sanitizeForDisplay(auditResult)} /> : null}
              </form>
            </div>
          </DataPanel>
        </AdvancedDetails>
      </QueryState>
    </ViewFrame>
  );
}

function ResourcesPage() {
  const { sessionId } = useSessionParams();
  const { client } = useDaemonRuntime();
  const resourcesQuery = useQuery({
    queryKey: ["session-resources", sessionId],
    queryFn: () => client.getSessionResources(sessionId)
  });
  const plannedResources = asArray(resourcesQuery.data?.plannedResources);
  const deliveryAudits = asArray(resourcesQuery.data?.deliveryAudits);
  const accessAudits = asArray(resourcesQuery.data?.accessAudits);
  const evidenceNeeds = asArray(resourcesQuery.data?.evidenceNeeds);
  const registeredResourceCount = plannedResources.filter(
    (resource) => getRecordValue(resource, "registered") === true
  ).length;
  const source = resourcesQuery.data?.source;

  return (
    <ViewFrame
      eyebrow="User Mode"
      title="Evidence and verification"
      description="Missing evidence, verification needs, and risks are shown together so they can be resolved before relying on the conclusion."
    >
      <QueryState query={resourcesQuery}>
        <StatusBanner
          tone={evidenceNeeds.length > 0 ? "warning" : "neutral"}
          title={
            evidenceNeeds.length > 0
              ? "Evidence gaps visible"
              : "No evidence gaps returned"
          }
          detail="This page focuses on what still needs to be checked. Technical access details remain in Advanced mode."
        />
        <DataPanel
          title="Risks and missing evidence"
          description="Missing evidence items are user-facing verification work, not low-level access state."
        >
          <ReadableSessionRecordList
            records={evidenceNeeds}
            emptyTitle="No missing evidence yet"
            emptyDescription="This discussion has not surfaced missing evidence items yet."
            kind="evidence"
          />
        </DataPanel>
        <AdvancedDetails description="Resource access posture, delivery/access audits, source ids, and raw projection JSON for developer inspection.">
          <KeyValueGrid
            items={[
              {
                label: "Session id",
                value: resourcesQuery.data?.sessionId ?? sessionId
              },
              {
                label: "Source",
                value:
                  source?.kind === "run_plan" && source.runId
                    ? `run plan ${source.runId}`
                    : "No run plan"
              },
              {
                label: "Registered resources",
                value: `${registeredResourceCount} of ${plannedResources.length}`
              },
              {
                label: "Delivery audits",
                value: deliveryAudits.length
              },
              {
                label: "Access audits",
                value: accessAudits.length
              },
              {
                label: "Evidence needs",
                value: evidenceNeeds.length
              }
            ]}
          />
          <RecordCollection
            title="Planned resources"
            records={plannedResources}
            emptyTitle="No resource references"
            emptyDescription="No run plan is linked to this session, or the linked run plan does not reference resources."
          />
          <RecordCollection
            title="Resource delivery audits"
            records={deliveryAudits}
            emptyTitle="No delivery audit events"
            emptyDescription="No daemon resource delivery planning decisions have been recorded for this session."
          />
          <RecordCollection
            title="Resource access audits"
            records={accessAudits}
            emptyTitle="No access audit events"
            emptyDescription="No daemon resource access grants or revocations have been recorded for this session."
          />
          <DataPanel
            title="Resource projection JSON"
            description="Complete daemon response for inspection; rendered without client-side delivery planning."
          >
            <JsonBlock value={sanitizeForDisplay(resourcesQuery.data ?? {})} />
          </DataPanel>
        </AdvancedDetails>
      </QueryState>
    </ViewFrame>
  );
}

function useSessionEventsQuery(sessionId: string) {
  const { client } = useDaemonRuntime();

  return useQuery({
    queryKey: ["events", sessionId],
    queryFn: () => client.listEvents(sessionId)
  });
}

function parseJsonObject(input: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Input must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Input must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function parseFinalAuditJson(input: string): {
  proposalEventId: string;
  input: AuditFinalCandidateRequest;
} {
  const parsed = parseJsonObject(input);
  const proposalEventId =
    getStringRecordValue(parsed, "proposalEventId") ??
    getStringRecordValue(parsed, "targetFinalCandidateProposalEventId");

  if (!proposalEventId) {
    throw new Error("Final audit JSON must include proposalEventId.");
  }

  const {
    proposalEventId: _proposalEventId,
    targetFinalCandidateProposalEventId: _targetFinalCandidateProposalEventId,
    ...auditInput
  } = parsed;

  return {
    proposalEventId,
    input: auditInput as AuditFinalCandidateRequest
  };
}

type LifecycleReadiness = {
  tone: "neutral" | "warning" | "error";
  title: string;
  detail: string;
};

function getFinalAuditProposalEventId(input: string): string | undefined {
  try {
    const parsed = parseJsonObject(input);

    return (
      getStringRecordValue(parsed, "proposalEventId") ??
      getStringRecordValue(parsed, "targetFinalCandidateProposalEventId")
    );
  } catch {
    return undefined;
  }
}

function describeFinalCandidateReadiness(input: {
  frontierLoading: boolean;
  frontierError: boolean;
  candidateCount: number;
}): LifecycleReadiness | null {
  if (input.frontierLoading) {
    return {
      tone: "neutral",
      title: "Loading main perspectives",
      detail: "The final-candidate control enables after the strongest current options load."
    };
  }

  if (input.frontierError) {
    return {
      tone: "error",
      title: "Strongest current options unavailable",
      detail: "The final-candidate control requires the strongest current options."
    };
  }

  if (input.candidateCount === 0) {
    return {
      tone: "warning",
      title: "No main perspectives ready",
      detail: "Accept at least one perspective before proposing a final candidate."
    };
  }

  return null;
}

function describeFinalAuditReadiness(
  proposalEventId: string | undefined
): LifecycleReadiness | null {
  if (proposalEventId) {
    return null;
  }

  return {
    tone: "warning",
    title: "No final proposal event selected",
    detail: "The audit control requires a final candidate proposal event id."
  };
}

function extractCandidateIdsFromFrontier(frontier: unknown): string[] {
  return asArray(getRecordValue(frontier, "candidates"))
    .map((candidateRecord) => {
      const object = getRecordValue(candidateRecord, "object");

      return getStringRecordValue(object, "id");
    })
    .filter((candidateId): candidateId is string => candidateId !== undefined);
}

function useSessionParams(): { sessionId: string } {
  return useParams({
    strict: false
  }) as { sessionId: string };
}
