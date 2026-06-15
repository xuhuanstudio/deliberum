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
import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import { useDaemonRuntime } from "./daemon-runtime";
import { LanguageSwitcher, useI18n } from "./i18n";
import { LocalServiceSetupGuide } from "./local-service-setup";
import {
  clearOpenAICompatibleProviderVerified,
  markOpenAICompatibleProviderVerified,
  useOpenAICompatibleProviderVerification
} from "./openai-compatible-verification";
import { buildRuntimeSetupPlan } from "@deliberum/client";
import type {
  AuditFinalCandidateRequest,
  DeploymentPostureResponse,
  OperationAuditResponse,
  ProposeFinalCandidateRequest,
  ResourceAccessPostureResponse,
  RuntimeSetupPlan,
  RuntimeSetupPlanProfile
} from "@deliberum/client";
import {
  OutcomeBrief,
  RunCatalogList,
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

const setupModelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "setup/models",
  component: SetupModelsPage
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "runs",
  component: RunsListPage
});

const runsNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "runs/new",
  validateSearch: parseRunStartSearch,
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
  setupModelsRoute,
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

function UserModeNavigation() {
  const { t } = useI18n();
  const linkClass = "du-nav-link";

  return (
    <>
      <Link
        to="/runs/new"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Start discussion")}
      </Link>
      <Link
        to="/setup/models"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Setup / Models")}
      </Link>
      <Link
        to="/runs"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Discussions")}
      </Link>
    </>
  );
}

function LandingPage() {
  const { t } = useI18n();
  const { daemonBaseUrl, client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  const [operatorDetailsOpen, setOperatorDetailsOpen] = useState(false);
  const navigate = useNavigate({ from: "/" });
  const trimmedSessionId = sessionId.trim();
  const runsQuery = useQuery({
    queryKey: ["runs", "landing"],
    queryFn: () => client.listRuns()
  });
  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => client.listSessions(),
    enabled: operatorDetailsOpen
  });
  const runtimeProfilesQuery = useQuery({
    queryKey: ["runtime-profiles"],
    queryFn: () => client.getRuntimeProfiles()
  });
  const deploymentPostureQuery = useQuery({
    queryKey: ["deployment-posture"],
    queryFn: () => client.getDeploymentPosture(),
    enabled: operatorDetailsOpen
  });
  const resourceAccessPostureQuery = useQuery({
    queryKey: ["resource-access-posture"],
    queryFn: () => client.getResourceAccessPosture(),
    enabled: operatorDetailsOpen
  });
  const operationAuditQuery = useQuery({
    queryKey: ["operation-audit", "landing", 10],
    queryFn: () => client.getOperationAudit({ limit: 10 }),
    enabled: operatorDetailsOpen
  });
  const runs = asArray(runsQuery.data?.runs);
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
      workspaceLabel={t("User Mode")}
      navigation={<UserModeNavigation />}
      status={<LanguageSwitcher />}
    >
      <section className="du-landing">
        <PageHeader
          eyebrow={t("User Mode")}
          title={t("Multi-perspective deliberation for better decisions")}
          description={t(
            "Use Deliberum to frame a hard question, collect independent perspectives, compare the strongest options, keep disagreements visible, and turn the current state into a reviewable conclusion with next steps."
          )}
          actions={
            <>
              <Link className="du-action-link" to="/runs/new">
                {t("Start a discussion")}
              </Link>
              <Link className="du-action-link du-secondary-link" to="/runs">
                {t("Continue discussions")}
              </Link>
            </>
          }
        />
        <LandingReadinessOverview
          runs={runs}
          runsLoading={runsQuery.isLoading}
          runsError={runsQuery.isError}
          setupPlan={runtimeSetupPlan}
          setupLoading={runtimeProfilesQuery.isLoading}
          setupError={runtimeProfilesQuery.isError}
        />
        <div className="du-product-grid">
          <DataPanel
            title={t("What you can do")}
            description={t(
              "The default path is for people who need a clear decision surface, not system records."
            )}
          >
            <div className="du-readable-list">
              <QualityPathItem
                title={t("1. Start a discussion")}
                detail={t(
                  "Write the question, goals, constraints, and expected output as a discussion brief."
                )}
              />
              <QualityPathItem
                title={t("2. Review the strongest current options")}
                detail={t(
                  "Independent first responses become visible as main perspectives without collapsing them into a hidden authority."
                )}
              />
              <QualityPathItem
                title={t("3. Decide what to do next")}
                detail={t(
                  "The current conclusion keeps open disagreements, risks, missing evidence, and recommended next actions together."
                )}
              />
            </div>
            <div className="du-action-row">
              <Link className="du-action-link" to="/runs/new">
                {t("Start a discussion")}
              </Link>
              <Link className="du-action-link du-secondary-link" to="/runs">
                {t("Continue existing discussions")}
              </Link>
            </div>
          </DataPanel>
          <DataPanel
            title={t("What the discussion keeps visible")}
            description={t(
              "Deliberum keeps the decision surface organized around what a person needs to inspect before relying on a conclusion."
            )}
          >
            <div className="du-quality-map">
              <QualityMapItem
                label={t("Discussion brief")}
                value={t("Question, goals, constraints, and expected output.")}
              />
              <QualityMapItem
                label={t("Independent first responses")}
                value={t("Separate starting perspectives before the group converges.")}
              />
              <QualityMapItem
                label={t("Strongest current options")}
                value={t("The best visible choices without selecting one option invisibly.")}
              />
              <QualityMapItem
                label={t("Open disagreements")}
                value={t("Concerns that still constrain the conclusion.")}
              />
              <QualityMapItem
                label={t("Requirements this answer must satisfy")}
                value={t("Conditions the final answer must meet.")}
              />
              <QualityMapItem
                label={t("Evidence and verification")}
                value={t("Claims or gaps that still need checking.")}
              />
              <QualityMapItem
                label={t("Risk review")}
                value={t("Limits, assumptions, and failure cases to keep visible.")}
              />
              <QualityMapItem
                label={t("Current conclusion")}
                value={t("The reviewable result with next steps.")}
              />
            </div>
          </DataPanel>
        </div>
        <DataPanel
          title={t("Setup / Models")}
          description={t(
            "Check whether the local system can run model-backed discussions, and see the safest next setup action without exposing secrets."
          )}
        >
          {runtimeProfilesQuery.isLoading ? (
            <StatusBanner title={t("Checking model setup")} />
          ) : runtimeProfilesQuery.isError ? (
            <LocalServiceSetupGuide
              compact
              onRetry={() => {
                void queryClient.invalidateQueries({ queryKey: ["runtime-profiles"] });
                void queryClient.invalidateQueries({ queryKey: ["runs", "landing"] });
              }}
            />
          ) : runtimeSetupPlan ? (
            <SetupModelsPanel setupPlan={runtimeSetupPlan} />
          ) : (
            <EmptyState
              title={t("No model setup returned")}
              description={t("The local service did not return safe model setup status.")}
            />
          )}
          <div className="du-action-row">
            <Link className="du-action-link du-secondary-link" to="/setup/models">
              {t("Open Setup / Models")}
            </Link>
          </div>
        </DataPanel>
        <AdvancedDetails
          summary="Advanced / Developer Mode"
          description="Core Deliberum concept names are preserved here for implementers and documentation readers."
          lazy
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
          title={t("Continue existing discussions")}
          description={t(
            "Open a discussion room and review its brief, perspectives, disagreements, requirements, evidence, conclusion, and next actions."
          )}
        >
          <QueryState query={runsQuery}>
            {runs.length === 0 ? (
              <EmptyState
                title={t("No discussions yet")}
                description={t("Start a discussion to create the first deliberation.")}
              />
            ) : (
              <RunCatalogList runs={runs} />
            )}
          </QueryState>
        </DataPanel>
        <AdvancedDetails
          description="Runtime, daemon, resource, audit, deployment, raw session ids, and other operator details stay available here without leading the product experience."
          panelLabel="Advanced operator details"
          lazy
          onOpen={() => setOperatorDetailsOpen(true)}
        >
          <DataPanel title="Daemon status" description="Local daemon connection used by the Web UI.">
            <div className="du-advanced-status-grid">
              <DaemonStatus mode="advanced" />
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
            title="Underlying session catalog"
            description="Low-level sessions remain available for developer inspection and legacy links."
          >
            <QueryState query={sessionsQuery}>
              {sessionEntries.length === 0 ? (
                <EmptyState
                  title="No sessions returned"
                  description="The daemon did not return any underlying ledger sessions."
                />
              ) : (
                <div className="du-run-list">
                  {sessionEntries.map(({ session, index, sessionId: catalogSessionId }) => (
                    <article className="du-run-list-item" key={`${catalogSessionId}-${index}`}>
                      <p className="du-kicker">Session {index + 1}</p>
                      <h3>{formatSessionCatalogTitle(session, index)}</h3>
                      <p>{formatSessionCatalogSummary(session)}</p>
                      <KeyValueGrid
                        items={[
                          {
                            label: "Session id",
                            value: catalogSessionId
                          },
                          {
                            label: "Ledger events",
                            value: `${formatRecordValue(getRecordValue(session, "eventCount"))} updates`
                          },
                          {
                            label: "Latest event",
                            value: formatRecordValue(
                              getRecordValue(session, "latestEventRecordedAt")
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
                          Open session view
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </QueryState>
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

type LandingReadinessTone = "ok" | "warning" | "neutral";

type LandingReadinessItem = {
  label: string;
  title: string;
  detail: string;
  tone: LandingReadinessTone;
  values?: Record<string, string | number>;
};

type LandingReadinessAction = {
  label: string;
  detail: string;
  to: "/runs/new" | "/setup/models" | "/runs";
  tone: LandingReadinessTone;
  participantSource?: "demo" | "model-backed";
};

type LandingFirstUseStep = {
  label: string;
  title: string;
  detail: string;
  tone: LandingReadinessTone;
  action?: LandingReadinessAction;
};

function parseRunStartSearch(search: Record<string, unknown>): {
  participants?: "demo" | "model-backed";
} {
  if (search.participants === "demo" || search.participants === "model-backed") {
    return {
      participants: search.participants
    };
  }

  return {};
}

function StartDiscussionActionLink({
  action,
  className = "du-action-link"
}: {
  action: LandingReadinessAction;
  className?: string;
}) {
  const { t } = useI18n();

  if (action.participantSource) {
    return (
      <Link
        className={className}
        to={action.to}
        search={{
          participants: action.participantSource
        }}
      >
        {t(action.label)}
      </Link>
    );
  }

  return (
    <Link className={className} to={action.to}>
      {t(action.label)}
    </Link>
  );
}

function StartModelBackedDiscussionLink({
  className = "du-action-link"
}: {
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <Link
      className={className}
      to="/runs/new"
      search={{
        participants: "model-backed"
      }}
    >
      {t("Start model-backed discussion")}
    </Link>
  );
}

function LandingReadinessOverview({
  runs,
  runsLoading,
  runsError,
  setupPlan,
  setupLoading,
  setupError
}: {
  runs: unknown[];
  runsLoading: boolean;
  runsError: boolean;
  setupPlan: RuntimeSetupPlan | undefined;
  setupLoading: boolean;
  setupError: boolean;
}) {
  const { t } = useI18n();
  const providerConnectionVerified = useOpenAICompatibleProviderVerification();
  const readiness = buildLandingReadiness({
    runs,
    runsLoading,
    runsError,
    setupPlan,
    setupLoading,
    setupError,
    providerConnectionVerified
  });

  return (
    <DataPanel
      title={t("Ready to use Deliberum")}
      description={t(
        "One place to see whether the local service, model setup, and discussion history are ready."
      )}
    >
      <div className="du-setup-model-grid" aria-label={t("Product readiness")}>
        {readiness.items.map((item) => (
          <article
            className={`du-setup-model-card du-setup-model-${item.tone}`}
            key={item.label}
          >
            <p className="du-kicker">{t(item.label)}</p>
            <h4>{t(item.title, item.values)}</h4>
            <p>{t(item.detail, item.values)}</p>
          </article>
        ))}
      </div>
      {setupError ? (
        <LocalServiceSetupGuide compact={false} onRetry={() => window.location.reload()} />
      ) : null}
      <LandingFirstUsePath steps={readiness.firstUseSteps} />
      <section className={`du-setup-next-step du-status du-status-${readiness.action.tone}`}>
        <p className="du-kicker">{t("Recommended next step")}</p>
        <strong>{t(readiness.action.label)}</strong>
        <span>{t(readiness.action.detail)}</span>
        <div className="du-action-row">
          <StartDiscussionActionLink action={readiness.action} />
          {readiness.action.to !== "/setup/models" ? (
            <Link className="du-action-link du-secondary-link" to="/setup/models">
              {t("Open Setup / Models")}
            </Link>
          ) : null}
          {runs.length > 0 && readiness.action.to !== "/runs" ? (
            <Link className="du-action-link du-secondary-link" to="/runs">
              {t("Continue discussions")}
            </Link>
          ) : null}
        </div>
      </section>
    </DataPanel>
  );
}

function LandingFirstUsePath({ steps }: { steps: LandingFirstUseStep[] }) {
  const { t } = useI18n();

  return (
    <section className="du-first-use-path" aria-labelledby="first-use-path">
      <div className="du-first-use-path-heading">
        <p className="du-kicker">{t("First-use path")}</p>
        <h4 id="first-use-path">{t("From setup to discussion room")}</h4>
        <p>
          {t(
            "Follow the shortest usable path: connect the local service, confirm model and participant readiness, then start the discussion room."
          )}
        </p>
      </div>
      <div className="du-first-use-path-grid">
        {steps.map((step) => (
          <article className={`du-first-use-step du-first-use-step-${step.tone}`} key={step.label}>
            <span>{t(step.label)}</span>
            <strong>{t(step.title)}</strong>
            <p>{t(step.detail)}</p>
            {step.action ? (
              <StartDiscussionActionLink action={step.action} className="du-inline-action-link" />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function buildLandingReadiness(input: {
  runs: unknown[];
  runsLoading: boolean;
  runsError: boolean;
  setupPlan: RuntimeSetupPlan | undefined;
  setupLoading: boolean;
  setupError: boolean;
  providerConnectionVerified: boolean;
}): {
  items: LandingReadinessItem[];
  action: LandingReadinessAction;
  firstUseSteps: LandingFirstUseStep[];
} {
  const localService = describeLandingLocalService(input);
  const modelSetup = describeLandingModelSetup(
    input.setupPlan,
    input.setupLoading,
    input.setupError,
    input.providerConnectionVerified
  );
  const discussionHistory = describeLandingDiscussionHistory(
    input.runs,
    input.runsLoading,
    input.runsError
  );
  const action = describeLandingNextAction({
    runs: input.runs,
    modelSetup
  });
  const firstUseSteps = buildLandingFirstUseSteps({
    localService,
    modelSetup,
    setupPlan: input.setupPlan,
    providerConnectionVerified: input.providerConnectionVerified,
    action
  });

  return {
    items: [localService, modelSetup.item, discussionHistory],
    action,
    firstUseSteps
  };
}

function buildLandingFirstUseSteps(input: {
  localService: LandingReadinessItem;
  modelSetup: {
    item: LandingReadinessItem;
    canStartModelBacked: boolean;
    canStartDemo: boolean;
    needsSetup: boolean;
  };
  setupPlan: RuntimeSetupPlan | undefined;
  providerConnectionVerified: boolean;
  action: LandingReadinessAction;
}): LandingFirstUseStep[] {
  const localServiceLoading = input.localService.title === "Checking local service";
  const localServiceReady = input.localService.tone === "ok";
  const modelSetupLoading = input.modelSetup.item.title === "Checking model setup";
  const localPreset = input.setupPlan?.profiles.find((profile) => profile.id === "local-preset");
  const modelOrganizerReady = input.setupPlan
    ? hasReadyModelOrganizerProfile(input.setupPlan.profiles, input.providerConnectionVerified)
    : false;
  const organizerMode = modelOrganizerReady
    ? "model"
    : localPreset?.status === "ready"
      ? "local"
      : undefined;
  const participantStep = modelSetupLoading
    ? {
        label: "Step 3",
        title: "Checking participant readiness",
        detail: "Participant readiness appears after model setup loads.",
        tone: "neutral" as const
      }
    : describeLandingParticipantStep({
        canStartModelBacked: input.modelSetup.canStartModelBacked,
        canStartDemo: input.modelSetup.canStartDemo,
        organizerMode
      });

  return [
    {
      label: "Step 1",
      title: localServiceLoading
        ? "Checking local service"
        : localServiceReady
          ? "Local service connected"
          : "Start the local service",
      detail: localServiceLoading
        ? "Web is checking whether the local system is reachable."
        : localServiceReady
          ? "Web can read setup, discussions, and model readiness from this machine."
          : "Open Setup / Models for the local start command, then return here.",
      tone: localServiceLoading ? "neutral" : localServiceReady ? "ok" : "warning",
      action: localServiceReady || localServiceLoading
        ? undefined
        : {
            label: "Open Setup / Models",
            detail: "Start the local service before configuring models.",
            to: "/setup/models",
            tone: "warning"
          }
    },
    {
      label: "Step 2",
      title: modelSetupLoading
        ? "Checking model setup"
        : input.modelSetup.canStartModelBacked
        ? "Model provider ready"
        : input.modelSetup.canStartDemo
          ? "Demo ready, model setup still needed"
          : "Add model setup",
      detail: modelSetupLoading
        ? "Web is checking whether demo or model-backed participants are ready."
        : input.modelSetup.canStartModelBacked
        ? "A real provider can answer with configured model participants."
        : input.modelSetup.canStartDemo
          ? "You can try the room now, then add a provider for real model responses."
          : "Save an API key, base URL, and model before relying on real model perspectives.",
      tone: modelSetupLoading
        ? "neutral"
        : input.modelSetup.canStartModelBacked
        ? "ok"
        : input.modelSetup.canStartDemo
          ? "warning"
          : "neutral",
      action: modelSetupLoading || input.modelSetup.canStartModelBacked
        ? undefined
        : {
            label: "Open Setup / Models",
            detail: "Configure the model provider in Web.",
            to: "/setup/models",
            tone: "warning"
          }
    },
    participantStep,
    {
      label: "Step 4",
      title: input.modelSetup.canStartModelBacked
        ? "Start the real discussion"
        : input.modelSetup.canStartDemo
          ? "Start a demo discussion"
          : "Finish setup first",
      detail: input.modelSetup.canStartModelBacked
        ? "Open the discussion room with configured model participants selected."
        : input.modelSetup.canStartDemo
          ? "Open the discussion room with built-in demo participants."
          : "Complete setup before creating useful discussion material.",
      tone: input.action.tone,
      action: input.action
    }
  ];
}

function describeLandingParticipantStep(input: {
  canStartModelBacked: boolean;
  canStartDemo: boolean;
  organizerMode?: "local" | "model";
}): LandingFirstUseStep {
  if (input.canStartModelBacked && input.organizerMode) {
    return {
      label: "Step 3",
      title: "Participants and review roles ready",
      detail: input.organizerMode === "model"
        ? "Model perspectives can answer first, then Reviewer, Evidence checker, Risk reviewer, and Conclusion writer can review the result."
        : "Model perspectives can answer first, then local review roles can review disagreements, evidence, risks, and the conclusion.",
      tone: "ok"
    };
  }

  if (input.canStartModelBacked) {
    return {
      label: "Step 3",
      title: "Model participants ready",
      detail:
        "Model perspectives can answer first; finish review role setup before relying on conclusions.",
      tone: "warning"
    };
  }

  if (input.canStartDemo && input.organizerMode) {
    return {
      label: "Step 3",
      title: "Demo room roles ready",
      detail:
        "Built-in perspectives and local review roles can show the full room flow without provider calls.",
      tone: "warning"
    };
  }

  return {
    label: "Step 3",
    title: "Participants need setup",
    detail: "Configure a participant source before starting a useful discussion room.",
    tone: "neutral"
  };
}

function describeLandingLocalService(input: {
  setupLoading: boolean;
  setupError: boolean;
  setupPlan: RuntimeSetupPlan | undefined;
}): LandingReadinessItem {
  if (input.setupLoading) {
    return {
      label: "Local service",
      title: "Checking local service",
      detail: "Web is checking whether the local system is reachable.",
      tone: "neutral"
    };
  }

  if (input.setupError || !input.setupPlan) {
    return {
      label: "Local service",
      title: "Local service unavailable",
      detail: "Open Setup / Models to check the local service and model configuration.",
      tone: "warning"
    };
  }

  return {
    label: "Local service",
    title: "Local service connected",
    detail: "Web can read setup status from the local system.",
    tone: "ok"
  };
}

function describeLandingModelSetup(
  setupPlan: RuntimeSetupPlan | undefined,
  setupLoading: boolean,
  setupError: boolean,
  providerConnectionVerified: boolean
): {
  item: LandingReadinessItem;
  canStartModelBacked: boolean;
  canStartDemo: boolean;
  needsSetup: boolean;
} {
  if (setupLoading) {
    return {
      item: {
        label: "Model setup",
        title: "Checking model setup",
        detail: "Web is checking whether demo or model-backed participants are ready.",
        tone: "neutral"
      },
      canStartModelBacked: false,
      canStartDemo: false,
      needsSetup: false
    };
  }

  if (setupError || !setupPlan) {
    return {
      item: {
        label: "Model setup",
        title: "Model setup unavailable",
        detail: "Open Setup / Models to check the local model configuration.",
        tone: "warning"
      },
      canStartModelBacked: false,
      canStartDemo: false,
      needsSetup: true
    };
  }

  const localPreset = setupPlan.profiles.find((profile) => profile.id === "local-preset");
  const localPresetReady = localPreset?.status === "ready";
  const modelProviderProfiles = setupPlan.profiles.filter(
    isWebConfigurableModelProviderProfile
  );
  const modelProviderConfigured = modelProviderProfiles.some((profile) => profile.status === "ready");
  const modelProviderReady = modelProviderConfigured && providerConnectionVerified;
  const needsSetup =
    modelProviderProfiles.some((profile) => profile.status !== "ready") ||
    (modelProviderConfigured && !providerConnectionVerified);

  if (modelProviderReady) {
    return {
      item: {
        label: "Model setup",
        title: "Real model provider ready",
        detail: "Configured model participants can answer new discussions.",
        tone: "ok"
      },
      canStartModelBacked: true,
      canStartDemo: localPresetReady,
      needsSetup: false
    };
  }

  if (modelProviderConfigured) {
    return {
      item: {
        label: "Model setup",
        title: "Verify model provider",
        detail: "A model provider is saved locally; verify the connection before starting real model-backed discussions.",
        tone: "warning"
      },
      canStartModelBacked: false,
      canStartDemo: localPresetReady,
      needsSetup: true
    };
  }

  if (localPresetReady) {
    return {
      item: {
        label: "Model setup",
        title: needsSetup ? "Demo discussion ready" : "Ready for demo discussions",
        detail: needsSetup
          ? "Demo participants can start now; finish provider setup before relying on real model perspectives."
          : "Built-in demo participants can start a walkthrough immediately.",
        tone: needsSetup ? "warning" : "ok"
      },
      canStartModelBacked: false,
      canStartDemo: true,
      needsSetup
    };
  }

  return {
    item: {
      label: "Model setup",
      title: needsSetup ? "Provider setup needed" : "Discussion source unavailable",
      detail: needsSetup
        ? "Save API key, base URL, and model before relying on real model participants."
        : "Complete model setup before starting useful discussions.",
      tone: needsSetup ? "warning" : "neutral"
    },
    canStartModelBacked: false,
    canStartDemo: false,
    needsSetup: true
  };
}

function describeLandingDiscussionHistory(
  runs: unknown[],
  runsLoading: boolean,
  runsError: boolean
): LandingReadinessItem {
  if (runsLoading) {
    return {
      label: "Discussion history",
      title: "Checking discussions",
      detail: "Web is checking for existing discussion rooms.",
      tone: "neutral"
    };
  }

  if (runsError) {
    return {
      label: "Discussion history",
      title: "Discussion history unavailable",
      detail: "Existing discussions could not be loaded.",
      tone: "warning"
    };
  }

  if (runs.length > 0) {
    return {
      label: "Discussion history",
      title: runs.length === 1 ? "1 existing discussion" : "{count} existing discussions",
      detail: "You can continue a previous discussion room.",
      tone: "ok",
      values: {
        count: runs.length
      }
    };
  }

  return {
    label: "Discussion history",
    title: "No discussions yet",
    detail: "Start a discussion to create the first room.",
    tone: "neutral"
  };
}

function describeLandingNextAction(input: {
  runs: unknown[];
  modelSetup: {
    canStartModelBacked: boolean;
    canStartDemo: boolean;
    needsSetup: boolean;
  };
}): LandingReadinessAction {
  if (input.modelSetup.canStartModelBacked) {
    return {
      label: "Start model-backed discussion",
      detail: "Use configured model participants for the next discussion.",
      to: "/runs/new",
      tone: "ok",
      participantSource: "model-backed"
    };
  }

  if (input.modelSetup.canStartDemo) {
    return {
      label: "Start demo discussion",
      detail:
        "Try the full discussion path with built-in participants while you finish model setup.",
      to: "/runs/new",
      tone: input.modelSetup.needsSetup ? "warning" : "ok"
    };
  }

  if (input.runs.length > 0) {
    return {
      label: "Continue discussions",
      detail: "Review a discussion that already exists while setup is being checked.",
      to: "/runs",
      tone: "warning"
    };
  }

  return {
    label: "Finish model setup",
    detail: "Add model provider details before relying on real model-backed discussions.",
    to: "/setup/models",
    tone: "warning"
  };
}

function SetupModelsPage() {
  const { t } = useI18n();
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const runtimeProfilesQuery = useQuery({
    queryKey: ["runtime-profiles"],
    queryFn: () => client.getRuntimeProfiles()
  });
  const runtimeProfiles = asArray(runtimeProfilesQuery.data?.profiles);
  const runtimeSetupPlan = runtimeProfilesQuery.data
    ? buildRuntimeSetupPlan(runtimeProfilesQuery.data)
    : undefined;
  const runtimeProfileEntries = runtimeProfiles.map((profile, index) => ({
    profile,
    index,
    id: getStringRecordValue(profile, "id") ?? `runtime-profile-${index + 1}`
  }));
  const runtimeSetupProfilesById = new Map(
    (runtimeSetupPlan?.profiles ?? []).map((profile) => [profile.id, profile])
  );

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel={t("User Mode")}
      navigation={<UserModeNavigation />}
      status={<LanguageSwitcher />}
    >
      <section className="du-landing">
        <PageHeader
          eyebrow={t("User Mode")}
          title={t("Setup / Models")}
          description={t(
            "Check whether the local system can run model-backed discussions, and see the safest next setup action without exposing secrets."
          )}
          actions={
            <>
              <Link className="du-action-link" to="/runs/new">
                {t("Start a discussion")}
              </Link>
              <Link className="du-action-link du-secondary-link" to="/runs">
                {t("Continue discussions")}
              </Link>
            </>
          }
        />
        <DataPanel
          title={t("Model setup status")}
          description={t(
            "See local service connection, local demo readiness, provider readiness, and the safest next setup action in user language."
          )}
        >
          {runtimeProfilesQuery.isLoading ? (
            <StatusBanner title={t("Checking model setup")} />
          ) : runtimeProfilesQuery.isError ? (
            <LocalServiceSetupGuide
              onRetry={() => {
                void queryClient.invalidateQueries({ queryKey: ["runtime-profiles"] });
                void queryClient.invalidateQueries({ queryKey: ["daemon-health"] });
              }}
            />
          ) : runtimeSetupPlan ? (
            <SetupModelsPanel setupPlan={runtimeSetupPlan} full />
          ) : (
            <EmptyState
              title={t("No model setup returned")}
              description={t("The local service did not return safe model setup status.")}
            />
          )}
        </DataPanel>
        <AdvancedDetails
          summary="Advanced / Developer Mode"
          panelLabel="Setup diagnostics"
          description="Environment variable names, runtime profile metadata, and setup-plan details for operators."
          lazy
        >
          <DataPanel
            title="Runtime profile setup details"
            description="Safe daemon profile setup status without environment values."
          >
            <QueryState query={runtimeProfilesQuery}>
              {runtimeProfileEntries.length === 0 ? (
                <EmptyState
                  title="No runtime profiles"
                  description="The daemon did not return profile setup metadata."
                />
              ) : (
                <RuntimeProfileSetupDetails
                  entries={runtimeProfileEntries}
                  setupPlan={runtimeSetupPlan}
                  setupProfilesById={runtimeSetupProfilesById}
                />
              )}
            </QueryState>
          </DataPanel>
        </AdvancedDetails>
      </section>
    </WorkspaceShell>
  );
}

function SetupModelsPanel({
  setupPlan,
  full = false
}: {
  setupPlan: RuntimeSetupPlan;
  full?: boolean;
}) {
  const { t } = useI18n();
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const providerConnectionVerified = useOpenAICompatibleProviderVerification();
  const [openAISetupInput, setOpenAISetupInput] = useState({
    apiKey: "",
    baseUrl: "",
    model: "",
    structuredReview: true
  });
  const localPreset = setupPlan.profiles.find((profile) => profile.id === "local-preset");
  const providerProfiles = setupPlan.profiles.filter((profile) => profile.id !== "local-preset");
  const modelProviderProfiles = providerProfiles.filter(isWebConfigurableModelProviderProfile);
  const openAICompatibleProfile = modelProviderProfiles.find(
    (profile) => profile.id === "openai-compatible"
  );
  const configuredProviderCount = modelProviderProfiles.filter((profile) => profile.status === "ready")
    .length;
  const readyProviderCount = providerConnectionVerified ? configuredProviderCount : 0;
  const providerNeedsSetup = modelProviderProfiles.some(
    (profile) =>
      profile.status === "ready_with_run_config" ||
      profile.status === "needs_configuration" ||
      profile.status === "disabled"
  ) || (configuredProviderCount > 0 && !providerConnectionVerified);
  const canStartDiscussion =
    localPreset?.status === "ready" ||
    readyProviderCount > 0 ||
    modelProviderProfiles.some((profile) => profile.status === "ready_with_run_config");
  const nextAction = describeSetupNextAction({
    canStartDiscussion,
    providerNeedsSetup,
    providerNeedsVerification: configuredProviderCount > 0 && !providerConnectionVerified,
    readyProviderCount
  });
  const openAISetupMutation = useMutation({
    mutationFn: () => client.saveOpenAICompatibleSetup(openAISetupInput),
    onSuccess: () => {
      clearOpenAICompatibleProviderVerified();
      setOpenAISetupInput((current) => ({
        ...current,
        apiKey: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["runtime-profiles"] });
    }
  });
  const openAIVerificationMutation = useMutation({
    mutationFn: () => client.verifyOpenAICompatibleSetup(),
    onSuccess: () => {
      markOpenAICompatibleProviderVerified();
    },
    onError: () => {
      clearOpenAICompatibleProviderVerified();
    }
  });
  const openAISetupCanSubmit =
    openAISetupInput.apiKey.trim().length > 0 &&
    openAISetupInput.baseUrl.trim().length > 0 &&
    openAISetupInput.model.trim().length > 0 &&
    !openAISetupMutation.isPending;

  function submitOpenAICompatibleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!openAISetupCanSubmit) {
      return;
    }

    openAISetupMutation.mutate();
  }

  function checkReadiness() {
    queryClient.invalidateQueries({ queryKey: ["runtime-profiles"] });
  }

  return (
    <div className="du-setup-models">
      <div className="du-setup-status-grid">
        <DaemonStatus />
        <article className="du-status du-status-neutral">
          <strong>{t("Model providers")}</strong>
          <span>
            {t(
              describeModelProviderSummary(
                modelProviderProfiles,
                localPreset,
                providerConnectionVerified
              )
            )}
          </span>
        </article>
      </div>
      <div className="du-setup-model-grid">
        {localPreset ? <SetupModelCard profile={localPreset} kind="local" /> : null}
        {modelProviderProfiles.map((profile) => (
          <SetupModelCard
            key={profile.id}
            profile={profile}
            kind="provider"
            providerConnectionVerified={providerConnectionVerified}
          />
        ))}
      </div>
      {full ? (
        <SetupDiscussionReadiness
          setupPlan={setupPlan}
          providerConnectionVerified={providerConnectionVerified}
        />
      ) : null}
      {full ? (
        <SetupParticipantReadiness
          setupPlan={setupPlan}
          providerConnectionVerified={providerConnectionVerified}
        />
      ) : null}
      {full && modelProviderProfiles.length > 0 ? (
        <ProviderSetupChecklist
          profiles={modelProviderProfiles}
          providerConnectionVerified={providerConnectionVerified}
        />
      ) : null}
      {full && openAICompatibleProfile ? (
        <OpenAICompatibleSetupForm
          profile={openAICompatibleProfile}
          input={openAISetupInput}
          onInputChange={setOpenAISetupInput}
          onSubmit={submitOpenAICompatibleSetup}
          canSubmit={openAISetupCanSubmit}
          pending={openAISetupMutation.isPending}
          error={openAISetupMutation.error}
          saved={openAISetupMutation.isSuccess}
          activeInCurrentDaemon={openAISetupMutation.data?.activeInCurrentDaemon === true}
          onCheckReadiness={checkReadiness}
          verificationPending={openAIVerificationMutation.isPending}
          verificationError={openAIVerificationMutation.error}
          verified={providerConnectionVerified}
          onVerifyConnection={() => openAIVerificationMutation.mutate()}
        />
      ) : null}
      <section
        id="setup-local-instructions"
        className={`du-setup-next-step du-status du-status-${nextAction.tone}`}
      >
        <p className="du-kicker">{t("Safest next action")}</p>
        <strong>{t(nextAction.title)}</strong>
        <span>{t(nextAction.detail)}</span>
        <div className="du-action-row">
          {readyProviderCount > 0 ? (
            <StartModelBackedDiscussionLink />
          ) : canStartDiscussion ? (
            <Link className="du-action-link" to="/runs/new">
              {t("Start a discussion")}
            </Link>
          ) : null}
        </div>
      </section>
      <details className="du-user-details" open={full}>
        <summary>
          <span>{t("How Web setup works locally")}</span>
          <small>
            {t(
              "Web saves provider setup to the local service configuration and applies it to the current local service when possible."
            )}
          </small>
        </summary>
        <div className="du-user-details-stack">
          <div className="du-setup-step-list">
            <SetupInstructionStep
              title={t("Add model")}
              detail={t(
                "Use the Web form above to add the provider API key, base URL, and model on this machine."
              )}
            />
            <SetupInstructionStep
              title={t("Configure provider")}
              detail={t(
                "Web writes local service configuration and does not show the API key again after saving."
              )}
            />
            <SetupInstructionStep
              title={t("Test connection")}
              detail={t(
                "Use Check readiness and Verify connection to confirm model-backed discussions are ready."
              )}
            />
            <SetupInstructionStep
              title={t("Ready for discussions")}
              detail={t(
                "When a model provider is ready, start a discussion and use configured participants or model-backed discussion plans."
              )}
            />
          </div>
          <p className="du-readable-meta">
            {t(
              "Open Advanced / Developer Mode for exact environment variable names, setup-plan metadata, and diagnostic commands."
            )}
          </p>
        </div>
      </details>
    </div>
  );
}

type ProviderSetupCheck = {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
};

type CurrentModelSetupItem = {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
};

type CurrentModelSetupStatus = {
  title: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
};

type SetupDiscussionReadinessItem = {
  title: string;
  status: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
};

type SetupDiscussionReadinessView = {
  canStartDiscussion: boolean;
  canStartModelBackedDiscussion: boolean;
  needsModelSetup: boolean;
  items: SetupDiscussionReadinessItem[];
};

type SetupParticipantReadinessItem = {
  role: string;
  source: string;
  status: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
  sourceValues?: Record<string, string>;
};

type SetupParticipantPlanItem = {
  title: string;
  status: string;
  uses: string;
  detail: string;
  action: string;
  tone: "ok" | "warning" | "neutral";
  usesValues?: Record<string, string>;
};

type SetupParticipantReadinessView = {
  canStartModelBackedDiscussion: boolean;
  needsModelSetup: boolean;
  plan: SetupParticipantPlanItem[];
  items: SetupParticipantReadinessItem[];
};

type OpenAICompatibleSetupFormInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  structuredReview: boolean;
};

function ProviderSetupChecklist({
  profiles,
  providerConnectionVerified
}: {
  profiles: RuntimeSetupPlanProfile[];
  providerConnectionVerified: boolean;
}) {
  const { t } = useI18n();

  return (
    <section className="du-provider-checklist" aria-labelledby="provider-setup-checklist">
      <div className="du-provider-checklist-heading">
        <p className="du-kicker">{t("Real provider setup")}</p>
        <h4 id="provider-setup-checklist">{t("Provider setup checklist")}</h4>
        <p>
          {t(
            "This summarizes what Web can safely know from local service setup status. It never shows API key values or environment variable names."
          )}
        </p>
      </div>
      <div className="du-provider-check-card-grid">
        {profiles.map((profile) => (
          <ProviderSetupChecklistCard
            key={profile.id}
            profile={profile}
            providerConnectionVerified={providerConnectionVerified}
          />
        ))}
      </div>
    </section>
  );
}

function SetupParticipantReadiness({
  setupPlan,
  providerConnectionVerified
}: {
  setupPlan: RuntimeSetupPlan;
  providerConnectionVerified: boolean;
}) {
  const { t } = useI18n();
  const readiness = buildSetupParticipantReadiness(setupPlan, providerConnectionVerified);

  return (
    <section
      className="du-setup-participants"
      aria-labelledby="setup-participant-readiness"
    >
      <div className="du-setup-participants-heading">
        <p className="du-kicker">{t("Participant management")}</p>
        <h4 id="setup-participant-readiness">{t("Discussion participants")}</h4>
        <p>
          {t(
            "This shows which readable roles are ready before you start: first perspectives, reviewers, evidence checks, and conclusion writing."
          )}
        </p>
      </div>
      <div className="du-setup-participant-plan" aria-label={t("Who joins the discussion")}>
        <div className="du-section-label">
          <p className="du-kicker">{t("Participant plan")}</p>
          <h5>{t("Who joins the discussion")}</h5>
          <p>
            {t(
              "This maps the current setup to the roles a normal user will see in the discussion room."
            )}
          </p>
        </div>
        <div className="du-setup-participant-plan-grid">
          {readiness.plan.map((item) => (
            <article
              className={`du-setup-participant-plan-card du-setup-participant-plan-${item.tone}`}
              key={item.title}
            >
              <span>{t(item.status)}</span>
              <strong>{t(item.title)}</strong>
              <dl>
                <div>
                  <dt>{t("Uses")}</dt>
                  <dd>{t(item.uses, item.usesValues)}</dd>
                </div>
                <div>
                  <dt>{t("Next action")}</dt>
                  <dd>{t(item.action)}</dd>
                </div>
              </dl>
              <p>{t(item.detail)}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="du-setup-participant-grid">
        {readiness.items.map((item) => (
          <article
            className={`du-setup-participant-item du-setup-participant-${item.tone}`}
            key={item.role}
          >
            <span>{t(item.status)}</span>
            <strong>{t(item.role)}</strong>
            <small>{t(item.source, item.sourceValues)}</small>
            <p>{t(item.detail)}</p>
          </article>
        ))}
      </div>
      <div className="du-action-row">
        {readiness.canStartModelBackedDiscussion ? (
          <StartModelBackedDiscussionLink />
        ) : null}
        {readiness.needsModelSetup ? (
          <a className="du-action-link du-secondary-link" href="#openai-setup-form">
            {t("Add model setup")}
          </a>
        ) : null}
      </div>
    </section>
  );
}

function SetupDiscussionReadiness({
  setupPlan,
  providerConnectionVerified
}: {
  setupPlan: RuntimeSetupPlan;
  providerConnectionVerified: boolean;
}) {
  const { t } = useI18n();
  const readiness = buildSetupDiscussionReadiness(setupPlan, providerConnectionVerified);

  return (
    <section className="du-setup-discussion-readiness" aria-labelledby="setup-discussion-readiness">
      <div className="du-setup-readiness-heading">
        <p className="du-kicker">{t("Discussion readiness")}</p>
        <h4 id="setup-discussion-readiness">{t("What can run now")}</h4>
        <p>
          {t(
            "This turns setup status into the discussion path: demo participants, real model participants, review roles, conclusion writing, and the next step."
          )}
        </p>
      </div>
      <div className="du-setup-readiness-grid">
        {readiness.items.map((item) => (
          <article
            className={`du-setup-readiness-item du-setup-readiness-${item.tone}`}
            key={item.title}
          >
            <span>{t(item.title)}</span>
            <strong>{t(item.status)}</strong>
            <p>{t(item.detail)}</p>
          </article>
        ))}
      </div>
      <div className="du-action-row">
        {readiness.canStartModelBackedDiscussion ? (
          <StartModelBackedDiscussionLink />
        ) : readiness.canStartDiscussion ? (
          <Link className="du-action-link" to="/runs/new">
            {t("Start a discussion")}
          </Link>
        ) : null}
        {readiness.needsModelSetup ? (
          <a className="du-action-link du-secondary-link" href="#openai-setup-form">
            {t("Add model setup")}
          </a>
        ) : null}
      </div>
    </section>
  );
}

function ProviderSetupChecklistCard({
  profile,
  providerConnectionVerified
}: {
  profile: RuntimeSetupPlanProfile;
  providerConnectionVerified: boolean;
}) {
  const { t } = useI18n();
  const checks = createProviderSetupChecks(profile, providerConnectionVerified);
  const ready = profile.status === "ready" && providerConnectionVerified;

  return (
    <article className="du-provider-check-card">
      <div className="du-provider-check-card-header">
        <p className="du-kicker">{t("Model provider")}</p>
        <h5>{t(profile.name)}</h5>
        <p>{t(getProviderChecklistSummary(profile, providerConnectionVerified))}</p>
      </div>
      <div className="du-provider-check-grid">
        {checks.map((check) => (
          <div className={`du-provider-check-item du-provider-check-${check.tone}`} key={check.label}>
            <span>{t(check.label)}</span>
            <strong>{t(check.value)}</strong>
            <p>{t(check.detail)}</p>
          </div>
        ))}
      </div>
      <div className="du-action-row">
        {ready ? (
          <StartModelBackedDiscussionLink />
        ) : profile.status === "ready" ? (
          <a className="du-action-link du-secondary-link" href="#openai-setup-form">
            {t("Verify connection")}
          </a>
        ) : (
          <a className="du-action-link du-secondary-link" href="#setup-local-instructions">
            {t("View setup steps")}
          </a>
        )}
      </div>
    </article>
  );
}

function buildSetupDiscussionReadiness(
  setupPlan: RuntimeSetupPlan,
  providerConnectionVerified: boolean
): SetupDiscussionReadinessView {
  const localPreset = setupPlan.profiles.find((profile) => profile.id === "local-preset");
  const localPresetReady = localPreset?.status === "ready";
  const modelProviderProfiles = setupPlan.profiles.filter(
    isWebConfigurableModelProviderProfile
  );
  const configuredModelProviders = modelProviderProfiles.filter(
    (profile) => profile.status === "ready"
  );
  const readyModelProviders = providerConnectionVerified ? configuredModelProviders : [];
  const needsModelSetup =
    modelProviderProfiles.some((profile) => profile.status !== "ready") ||
    (configuredModelProviders.length > 0 && !providerConnectionVerified);
  const modelProviderReady = readyModelProviders.length > 0;
  const modelProviderNeedsVerification =
    configuredModelProviders.length > 0 && !providerConnectionVerified;
  const modelOrganizerReady = readyModelProviders.some((profile) =>
    isReadyModelOrganizerProfile(profile, providerConnectionVerified)
  );
  const organizerMode = modelOrganizerReady
    ? "model"
    : localPresetReady
      ? "local"
      : undefined;
  const canStartDiscussion = localPresetReady || modelProviderReady;
  const modelDetail = modelProviderReady
    ? "Configured model participants can answer as independent perspectives."
    : modelProviderNeedsVerification
      ? "A model provider is saved locally. Verify the connection before relying on real model participants."
      : modelProviderProfiles.length > 0
      ? "Save the provider API key, base URL, and model in Web setup, check readiness, then verify the connection."
      : "The local service did not report a Web-configurable model provider.";
  const modelStatus = modelProviderReady
    ? "Ready"
    : modelProviderNeedsVerification
      ? "Verify connection"
      : modelProviderProfiles.length > 0
      ? "Setup needed"
      : "No provider reported";
  const nextStep = modelProviderReady
    ? {
        status: "Start model-backed discussion",
        detail:
          "Start discussion will select configured model participants by default while keeping demo participants available.",
        tone: "ok" as const
      }
    : modelProviderNeedsVerification
      ? {
          status: "Verify provider connection",
          detail:
            "Use Verify connection in Setup / Models before starting a real model-backed discussion.",
          tone: "warning" as const
        }
    : localPresetReady
      ? {
          status: "Try a demo discussion",
          detail:
            "Use the sample flow now, then finish provider setup before relying on real model-backed perspectives.",
          tone: "warning" as const
        }
      : {
          status: "Finish setup first",
          detail:
            "Add a demo preset or a real model provider before starting a useful discussion.",
          tone: "neutral" as const
        };

  return {
    canStartDiscussion,
    canStartModelBackedDiscussion: modelProviderReady,
    needsModelSetup,
    items: [
      {
        title: "Demo walkthrough",
        status: localPresetReady ? "Ready" : "Not ready",
        detail: localPresetReady
          ? "Built-in demo participants can run a deterministic walkthrough immediately."
          : "Start the local preset or configure a real provider before trying the discussion flow.",
        tone: localPresetReady ? "ok" : "neutral"
      },
      {
        title: "Model participants",
        status: modelStatus,
        detail: modelDetail,
        tone:
          modelProviderReady || modelProviderNeedsVerification
            ? modelProviderReady
              ? "ok"
              : "warning"
            : modelProviderProfiles.length > 0
              ? "warning"
              : "neutral"
      },
      {
        title: "Review roles and conclusion",
        status: organizerMode ? "Ready" : "Review roles setup needed",
        detail: organizerMode === "model"
          ? "Reviewer, Evidence checker, Risk reviewer, and Conclusion writer can review the discussion after first responses."
          : organizerMode === "local"
            ? "Local review roles can compare options, review disagreements, evidence, and risks, then draft the current conclusion."
            : "Discussions may collect first responses only until review roles are ready.",
        tone: organizerMode ? "ok" : "warning"
      },
      {
        title: "Next step",
        status: nextStep.status,
        detail: nextStep.detail,
        tone: nextStep.tone
      }
    ]
  };
}

function buildSetupParticipantReadiness(
  setupPlan: RuntimeSetupPlan,
  providerConnectionVerified: boolean
): SetupParticipantReadinessView {
  const localPreset = setupPlan.profiles.find((profile) => profile.id === "local-preset");
  const localPresetReady = localPreset?.status === "ready";
  const modelProviderProfiles = setupPlan.profiles.filter(
    isWebConfigurableModelProviderProfile
  );
  const configuredModelProvider = modelProviderProfiles.find((profile) => profile.status === "ready");
  const readyModelProvider = providerConnectionVerified ? configuredModelProvider : undefined;
  const providerName = readyModelProvider?.name ?? "Model provider";
  const modelReady = readyModelProvider !== undefined;
  const modelNeedsVerification =
    configuredModelProvider !== undefined && !providerConnectionVerified;
  const modelOrganizerReady =
    readyModelProvider !== undefined &&
    isReadyModelOrganizerProfile(readyModelProvider, providerConnectionVerified);
  const organizerMode = modelOrganizerReady
    ? "model"
    : localPresetReady
      ? "local"
      : undefined;
  const needsModelSetup =
    modelProviderProfiles.some((profile) => profile.status !== "ready") ||
    modelNeedsVerification;
  const perspectiveStatus = modelReady
    ? "Model ready"
    : modelNeedsVerification
      ? "Verify connection"
    : localPresetReady
      ? "Demo ready"
      : "Setup needed";
  const perspectiveSource = modelReady
    ? "{provider} model"
    : modelNeedsVerification
      ? "Saved model provider"
    : localPresetReady
      ? "Built-in demo participant"
      : "No participant source ready";
  const perspectiveDetail = modelReady
    ? "New model-backed discussions can use this provider for independent first responses."
    : modelNeedsVerification
      ? "Verify the saved provider connection before using real model perspectives."
    : localPresetReady
      ? "Demo discussions can show the role, but real model perspectives still need provider setup."
      : "Add a model provider or local preset before starting a useful discussion.";
  const perspectiveTone: SetupParticipantReadinessItem["tone"] = modelReady
    ? "ok"
    : modelNeedsVerification
      ? "warning"
      : localPresetReady
      ? "warning"
      : "neutral";
  const organizerStatus = organizerMode ? "Review roles ready" : "Review roles setup needed";
  const organizerSource = organizerMode === "model"
    ? "Model review roles"
    : organizerMode === "local"
      ? "Local review roles"
      : "Review roles not ready";
  const organizerDetail = organizerMode === "model"
    ? "Reviewer, Evidence checker, Risk reviewer, and Conclusion writer can review the discussion after first responses."
    : organizerMode === "local"
      ? "Local review roles can compare options, review evidence and risks, and draft the current conclusion."
      : "Discussions may collect first responses only until review roles are ready.";
  const organizerTone: SetupParticipantReadinessItem["tone"] = organizerMode
    ? "ok"
    : "warning";
  const planItems: SetupParticipantPlanItem[] = [
    {
      title: "First responses",
      status: modelReady
        ? "Model-backed"
        : modelNeedsVerification
          ? "Verify provider"
        : localPresetReady
          ? "Demo walkthrough"
          : "Needs setup",
      uses: modelReady
        ? "Perspective A and Perspective B use {provider}."
        : modelNeedsVerification
          ? "Perspective A and Perspective B can use the saved provider after verification."
        : localPresetReady
          ? "Perspective A and Perspective B use built-in demo material."
          : "No first-response participants are ready yet.",
      usesValues: modelReady ? { provider: providerName } : undefined,
      detail:
        "These independent first responses become the main perspectives users compare in the room.",
      action: modelReady
        ? "Start discussion will use model participants by default."
        : modelNeedsVerification
          ? "Verify connection before starting with model participants."
        : localPresetReady
          ? "Use the demo now or add a provider for real model responses."
          : "Add a model provider before starting.",
      tone: modelReady ? "ok" : localPresetReady ? "warning" : "neutral"
    },
    {
      title: "Broader review",
      status: modelReady
        ? "Third perspective available"
        : modelNeedsVerification
          ? "Verify provider"
          : "Provider required",
      uses: modelReady
        ? "Perspective C can use {provider}."
        : modelNeedsVerification
          ? "Perspective C can use the saved provider after verification."
        : "Perspective C is not available until a model provider is ready.",
      usesValues: modelReady ? { provider: providerName } : undefined,
      detail:
        "Broader review adds one more independent model response when the question needs more comparison material.",
      action: modelReady
        ? "Choose Broader review on the start page to include Perspective C."
        : modelNeedsVerification
          ? "Verify connection to unlock Perspective C and real model-backed broader review."
        : "Add a provider to unlock Perspective C and real model-backed broader review.",
      tone: modelReady ? "ok" : "neutral"
    },
    {
      title: "Disagreement and evidence review",
      status: organizerMode ? "Review roles ready" : "Review roles setup needed",
      uses: organizerMode === "model"
        ? "Reviewer, Evidence checker, and Risk reviewer use the configured model provider."
        : organizerMode === "local"
          ? "Reviewer, Evidence checker, and Risk reviewer use the local review flow."
          : "Reviewer, Evidence checker, and Risk reviewer are not ready yet.",
      detail:
        "These roles keep open disagreements, missing evidence, and risks visible before the conclusion is trusted.",
      action: organizerMode
        ? "Start the room and continue review when the first responses are ready."
        : "Finish review role setup before relying on review steps.",
      tone: organizerTone
    },
    {
      title: "Conclusion and next actions",
      status: organizerMode ? "Conclusion writer ready" : "Conclusion writer setup needed",
      uses: organizerMode === "model"
        ? "Conclusion writer uses the configured model provider."
        : organizerMode === "local"
          ? "Conclusion writer uses the local review flow."
          : "Conclusion writer is not ready yet.",
      detail:
        "This role turns the current discussion state into a reviewable conclusion with recommended next actions.",
      action: organizerMode
        ? "Review the conclusion panel after the room has enough discussion material."
        : "Finish review role setup before relying on generated conclusions.",
      tone: organizerTone
    }
  ];
  const perspectiveItems: SetupParticipantReadinessItem[] = [
    {
      role: "Perspective A",
      source: perspectiveSource,
      sourceValues: modelReady ? { provider: providerName } : undefined,
      status: perspectiveStatus,
      detail: perspectiveDetail,
      tone: perspectiveTone
    },
    {
      role: "Perspective B",
      source: perspectiveSource,
      sourceValues: modelReady ? { provider: providerName } : undefined,
      status: perspectiveStatus,
      detail: perspectiveDetail,
      tone: perspectiveTone
    },
    {
      role: "Perspective C",
      source: modelReady ? "{provider} model" : "Broader review after model setup",
      sourceValues: modelReady ? { provider: providerName } : undefined,
      status: modelReady ? "Available in broader review" : "Setup needed",
      detail: modelReady
        ? "Choose Broader review on the start page to add a third independent model perspective."
        : "Perspective C is only available for model-backed broader review.",
      tone: modelReady ? "ok" : "neutral"
    }
  ];
  const organizerItems: SetupParticipantReadinessItem[] = [
    {
      role: "Reviewer",
      source: organizerSource,
      status: organizerStatus,
      detail: organizerDetail,
      tone: organizerTone
    },
    {
      role: "Evidence checker",
      source: organizerSource,
      status: organizerStatus,
      detail: organizerDetail,
      tone: organizerTone
    },
    {
      role: "Conclusion writer",
      source: organizerSource,
      status: organizerStatus,
      detail: organizerDetail,
      tone: organizerTone
    }
  ];

  return {
    canStartModelBackedDiscussion: modelReady,
    needsModelSetup,
    plan: planItems,
    items: [...perspectiveItems, ...organizerItems]
  };
}

function OpenAICompatibleSetupForm({
  profile,
  input,
  onInputChange,
  onSubmit,
  canSubmit,
  pending,
  error,
  saved,
  activeInCurrentDaemon,
  onCheckReadiness,
  verificationPending,
  verificationError,
  verified,
  onVerifyConnection
}: {
  profile: RuntimeSetupPlanProfile;
  input: OpenAICompatibleSetupFormInput;
  onInputChange: Dispatch<SetStateAction<OpenAICompatibleSetupFormInput>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canSubmit: boolean;
  pending: boolean;
  error: Error | null;
  saved: boolean;
  activeInCurrentDaemon: boolean;
  onCheckReadiness: () => void;
  verificationPending: boolean;
  verificationError: Error | null;
  verified: boolean;
  onVerifyConnection: () => void;
}) {
  const { t } = useI18n();
  const configured = profile.status === "ready";
  const ready = configured && verified;
  const canVerify = configured || activeInCurrentDaemon;
  const setupStatus = ready
    ? {
        title: "Ready for discussions",
        detail: "This provider is ready for model-backed discussions.",
        tone: "ok" as const
      }
    : configured || activeInCurrentDaemon
      ? {
          title: "Ready to verify",
          detail:
            "The saved setup is active in the current local service. Verify connection before starting a real discussion.",
          tone: "warning" as const
        }
      : {
          title: "Setup needed",
          detail:
            "Save setup in Web, then check readiness so Web can confirm the provider is active.",
          tone: "warning" as const
        };

  return (
    <section className="du-provider-setup-form-section" aria-labelledby="openai-setup-form">
      <div className="du-provider-setup-form-heading">
        <p className="du-kicker">{t("Add model")}</p>
        <h4 id="openai-setup-form">{t("Configure OpenAI-compatible provider")}</h4>
        <p>
          {t(
            "Save the provider API key, base URL, and model to this machine so future discussions can use real model participants."
          )}
        </p>
      </div>
      <CurrentModelSetupSummary
        profile={profile}
        activeInCurrentDaemon={activeInCurrentDaemon}
        verified={verified}
      />
      <div className="du-provider-setup-form-layout">
        <form className="du-provider-setup-form" onSubmit={onSubmit}>
          <label htmlFor="openai-compatible-api-key">{t("Provider API key")}</label>
          <input
            id="openai-compatible-api-key"
            type="password"
            autoComplete="off"
            value={input.apiKey}
            onChange={(event) => {
              const apiKey = event.currentTarget.value;
              onInputChange((current) => ({
                ...current,
                apiKey
              }));
            }}
            placeholder={t("Paste API key")}
          />
          <label htmlFor="openai-compatible-base-url">{t("Base URL")}</label>
          <input
            id="openai-compatible-base-url"
            value={input.baseUrl}
            onChange={(event) => {
              const baseUrl = event.currentTarget.value;
              onInputChange((current) => ({
                ...current,
                baseUrl
              }));
            }}
            placeholder="https://api.openai.com"
          />
          <label htmlFor="openai-compatible-model">{t("Model")}</label>
          <input
            id="openai-compatible-model"
            value={input.model}
            onChange={(event) => {
              const model = event.currentTarget.value;
              onInputChange((current) => ({
                ...current,
                model
              }));
            }}
            placeholder="gpt-4.1-mini"
          />
          <label className="du-provider-setup-option" htmlFor="openai-compatible-structured-review">
            <input
              id="openai-compatible-structured-review"
              type="checkbox"
              checked={input.structuredReview}
              onChange={(event) => {
                const structuredReview = event.currentTarget.checked;
                onInputChange((current) => ({
                  ...current,
                  structuredReview
                }));
              }}
            />
            <span>
              <strong>{t("Structured review compatibility")}</strong>
              <small>
                {t(
                  "Recommended for real providers so Deliberum can organize options, disagreements, evidence gaps, risks, conclusions, and next actions more reliably."
                )}
              </small>
            </span>
          </label>
          <div className="du-action-row">
            <button type="submit" disabled={!canSubmit}>
              {pending ? t("Saving setup") : t("Save model setup")}
            </button>
            <button type="button" className="du-secondary-button" onClick={onCheckReadiness}>
              {t("Check readiness")}
            </button>
            <button
              type="button"
              className="du-secondary-button"
              disabled={!canVerify || verificationPending}
              onClick={onVerifyConnection}
            >
              {verificationPending ? t("Verifying connection") : t("Verify connection")}
            </button>
          </div>
        </form>
        <aside className="du-provider-setup-form-note">
          <article className={`du-status du-status-${setupStatus.tone}`}>
            <strong>{t(setupStatus.title)}</strong>
            <span>{t(setupStatus.detail)}</span>
          </article>
          <p className="du-readable-meta">
            {t(
              "The API key is submitted only to your local service. Web clears the key field after saving and never shows the saved value."
            )}
          </p>
          <p className="du-readable-meta">
            {t(
              verified
                ? "Use Verify connection to send one minimal provider request before starting a model-backed discussion."
                : activeInCurrentDaemon
                  ? "Verify connection is available now because the saved setup is active in this local service."
                  : "Verify connection becomes available after Web confirms this provider is ready."
            )}
          </p>
        </aside>
      </div>
      <ProviderSetupCompletion
        ready={ready}
        saved={saved}
        activeInCurrentDaemon={activeInCurrentDaemon}
        verified={verified}
      />
      {saved ? (
        <StatusBanner
          tone="ok"
          title={t("Model setup saved locally")}
          detail={t(
            activeInCurrentDaemon
              ? "The current local service can use this setup now. Check readiness, verify connection, then start a real model-backed discussion."
              : "Restart the local service, then return here and check readiness before starting a real model-backed discussion."
          )}
        />
      ) : null}
      {verified ? (
        <StatusBanner
          tone="ok"
          title={t("Provider connection verified")}
          detail={t(
            "The configured provider accepted a safe test request. You can start a real model-backed discussion."
          )}
        />
      ) : null}
      {verificationError ? (
        <>
          <StatusBanner
            tone="error"
            title={t("Provider connection could not be verified")}
            detail={formatSafeErrorMessage(verificationError)}
          />
          <ProviderVerificationRecoveryActions
            verificationPending={verificationPending}
            onVerifyConnection={onVerifyConnection}
          />
        </>
      ) : null}
      {error ? (
        <StatusBanner
          tone="error"
          title={t("Model setup could not be saved")}
          detail={formatSafeErrorMessage(error)}
        />
      ) : null}
    </section>
  );
}

function ProviderVerificationRecoveryActions({
  verificationPending,
  onVerifyConnection
}: {
  verificationPending: boolean;
  onVerifyConnection: () => void;
}) {
  const { t } = useI18n();

  return (
    <section
      className="du-provider-recovery-actions"
      aria-label={t("Provider verification recovery options")}
    >
      <div>
        <p className="du-kicker">{t("Recovery options")}</p>
        <h4>{t("Keep setup moving")}</h4>
        <p>
          {t(
            "Use these steps when the provider cannot be verified so you can fix setup, retry safely, or continue with a demo discussion."
          )}
        </p>
      </div>
      <div className="du-provider-recovery-grid">
        <a className="du-provider-recovery-card" href="#openai-setup-form">
          <span>{t("First")}</span>
          <strong>{t("Review setup fields")}</strong>
          <p>{t("Check the API key, base URL, and model, then save setup again if anything changed.")}</p>
        </a>
        <button
          type="button"
          className="du-provider-recovery-card"
          disabled={verificationPending}
          onClick={onVerifyConnection}
        >
          <span>{t("Then")}</span>
          <strong>
            {verificationPending ? t("Verifying connection") : t("Try Verify connection again")}
          </strong>
          <p>{t("Send another minimal test request after setup is corrected.")}</p>
        </button>
        <Link
          className="du-provider-recovery-card du-provider-recovery-primary"
          to="/runs/new"
          search={{
            participants: "demo"
          }}
        >
          <span>{t("While fixing setup")}</span>
          <strong>{t("Start demo discussion")}</strong>
          <p>{t("Use built-in participants to learn the full discussion flow without provider calls.")}</p>
        </Link>
      </div>
    </section>
  );
}

function CurrentModelSetupSummary({
  profile,
  activeInCurrentDaemon,
  verified
}: {
  profile: RuntimeSetupPlanProfile;
  activeInCurrentDaemon: boolean;
  verified: boolean;
}) {
  const { t } = useI18n();
  const status = describeCurrentModelSetupStatus(profile, activeInCurrentDaemon, verified);
  const items = createCurrentModelSetupItems(profile, activeInCurrentDaemon, verified);
  const startReady = verified;

  return (
    <section
      className={`du-current-model-setup du-current-model-setup-${status.tone}`}
      aria-labelledby="current-model-setup"
    >
      <div className="du-current-model-setup-header">
        <div>
          <p className="du-kicker">{t("Model management")}</p>
          <h5 id="current-model-setup">{t("Current model setup")}</h5>
          <p>{t(status.detail)}</p>
        </div>
        <strong>{t(status.title)}</strong>
      </div>
      <div className="du-current-model-setup-grid">
        {items.map((item) => (
          <div
            className={`du-current-model-setup-item du-current-model-setup-item-${item.tone}`}
            key={item.label}
          >
            <span>{t(item.label)}</span>
            <strong>{t(item.value)}</strong>
            <p>{t(item.detail)}</p>
          </div>
        ))}
      </div>
      <p className="du-readable-meta">
        {t(
          "Web shows only readiness here. It never displays saved API keys, base URLs, or exact model values in the default view."
        )}
      </p>
      <div className="du-action-row">
        {startReady ? <StartModelBackedDiscussionLink /> : null}
        <a className="du-action-link du-secondary-link" href="#openai-compatible-api-key">
          {t(startReady ? "Edit model setup" : "Finish setup in Web")}
        </a>
      </div>
    </section>
  );
}

function describeCurrentModelSetupStatus(
  profile: RuntimeSetupPlanProfile,
  activeInCurrentDaemon: boolean,
  verified: boolean
): CurrentModelSetupStatus {
  if (profile.status === "ready" && verified) {
    return {
      title: "Ready and verified",
      detail: "The provider is ready and the latest Web test request succeeded.",
      tone: "ok"
    };
  }

  if (profile.status === "ready") {
    return {
      title: "Verify before real discussions",
      detail:
        "The provider setup is saved locally. Verify the connection before starting model-backed discussions.",
      tone: "warning"
    };
  }

  if (activeInCurrentDaemon) {
    return {
      title: "Saved in this session",
      detail:
        "The local service accepted this setup. Verify the connection before relying on it for a discussion.",
      tone: "warning"
    };
  }

  return {
    title: "Finish setup in Web",
    detail:
      "Add or replace the API key, base URL, and model below. Saved secrets stay on this machine and are not displayed again.",
    tone: profile.enabled ? "warning" : "neutral"
  };
}

function createCurrentModelSetupItems(
  profile: RuntimeSetupPlanProfile,
  activeInCurrentDaemon: boolean,
  verified: boolean
): CurrentModelSetupItem[] {
  const apiKeySaved = profile.configuredSecretEnvVarCount > 0 || activeInCurrentDaemon;
  const baseUrlSaved =
    activeInCurrentDaemon ||
    (profile.status === "ready" &&
      hasAnySetupName(profile, isRequestTargetSetupName) &&
      !isAnySetupNameMissing(profile, isRequestTargetSetupName));
  const modelSaved =
    activeInCurrentDaemon ||
    (profile.status === "ready" &&
      hasAnySetupName(profile, isModelSetupName) &&
      !isAnySetupNameMissing(profile, isModelSetupName));
  const canVerify = profile.status === "ready" || activeInCurrentDaemon;

  return [
    {
      label: "Provider",
      value: profile.name,
      detail: "The provider Web can configure for this local system.",
      tone: profile.enabled ? "ok" : "neutral"
    },
    {
      label: "API key",
      value: apiKeySaved ? "Saved locally" : "Required",
      detail: apiKeySaved ? "Saved without showing the value." : "Enter this in the form below.",
      tone: apiKeySaved ? "ok" : profile.enabled ? "warning" : "neutral"
    },
    {
      label: "Base URL",
      value: baseUrlSaved ? "Saved locally" : "Required",
      detail: baseUrlSaved ? "Saved without showing the value." : "Enter this in the form below.",
      tone: baseUrlSaved ? "ok" : profile.enabled ? "warning" : "neutral"
    },
    {
      label: "Model",
      value: modelSaved ? "Saved locally" : "Required",
      detail: modelSaved ? "Saved without showing the value." : "Enter this in the form below.",
      tone: modelSaved ? "ok" : profile.enabled ? "warning" : "neutral"
    },
    {
      label: "Connection",
      value: verified ? "Verified" : canVerify ? "Ready to verify" : "Needs saved setup",
      detail: verified
        ? "The latest safe provider test succeeded."
        : canVerify
          ? "Use Verify connection before starting a real discussion."
          : "Save the required setup before testing the provider.",
      tone: verified ? "ok" : canVerify || profile.enabled ? "warning" : "neutral"
    }
  ];
}

function ProviderSetupCompletion({
  ready,
  saved,
  activeInCurrentDaemon,
  verified
}: {
  ready: boolean;
  saved: boolean;
  activeInCurrentDaemon: boolean;
  verified: boolean;
}) {
  const { t } = useI18n();
  const visible = ready || saved || activeInCurrentDaemon || verified;

  if (!visible) {
    return null;
  }

  const startReady = ready || verified;
  const title = startReady
    ? "Ready to start with real model participants"
    : "Verify the provider before starting";
  const detail = startReady
    ? "The provider setup is available for new discussions. The start page will select model-backed participants by default while keeping demo participants available."
    : "The saved setup is active in this local service. Verification sends one minimal request so you can catch key, base URL, or model problems before the discussion.";

  return (
    <section
      className={`du-provider-setup-completion du-provider-setup-completion-${
        startReady ? "ok" : "warning"
      }`}
      aria-label={t("Setup path")}
    >
      <div>
        <p className="du-kicker">{t("Setup path")}</p>
        <h5>{t(title)}</h5>
        <p>{t(detail)}</p>
      </div>
      <div className="du-action-row">
        {startReady ? <StartModelBackedDiscussionLink /> : null}
      </div>
    </section>
  );
}

function createProviderSetupChecks(
  profile: RuntimeSetupPlanProfile,
  providerConnectionVerified: boolean
): ProviderSetupCheck[] {
  const checks: ProviderSetupCheck[] = [
    describeProviderEnabledCheck(profile),
    describeProviderApiKeyCheck(profile)
  ];
  const requestTargetCheck = describeProviderRequestTargetCheck(profile);
  const modelCheck = describeProviderModelCheck(profile);

  if (requestTargetCheck) {
    checks.push(requestTargetCheck);
  }

  if (modelCheck) {
    checks.push(modelCheck);
  }

  checks.push(describeProviderConnectionCheck(profile, providerConnectionVerified));

  return checks;
}

function describeProviderEnabledCheck(profile: RuntimeSetupPlanProfile): ProviderSetupCheck {
  if (profile.enabled) {
    return {
      label: "Provider",
      value: "Enabled locally",
      detail: "The local service reports this provider as available for setup.",
      tone: "ok"
    };
  }

  return {
    label: "Provider",
    value: "Not enabled",
    detail: "Enable this provider before configuring model details.",
    tone: "neutral"
  };
}

function describeProviderApiKeyCheck(profile: RuntimeSetupPlanProfile): ProviderSetupCheck {
  if (profile.secretEnvVarNames.length === 0) {
    return {
      label: "API key",
      value: "No API key reported",
      detail: "This provider did not report a secret setup field through safe local service status.",
      tone: "neutral"
    };
  }

  if (profile.configuredSecretEnvVarCount > 0) {
    return {
      label: "API key",
      value: "Configured locally",
      detail: "The local service reports that a provider secret is present without exposing its value.",
      tone: "ok"
    };
  }

  return {
    label: "API key",
    value: "API key required",
    detail: "Enter the provider API key in the Web setup form; the saved value is never shown.",
    tone: profile.enabled ? "warning" : "neutral"
  };
}

function describeProviderRequestTargetCheck(
  profile: RuntimeSetupPlanProfile
): ProviderSetupCheck | undefined {
  if (!hasAnySetupName(profile, isRequestTargetSetupName)) {
    return undefined;
  }

  if (!profile.enabled) {
    return {
      label: "Base URL",
      value: "Not checked yet",
      detail: "Enable the provider locally before Web can summarize request target readiness.",
      tone: "neutral"
    };
  }

  if (isAnySetupNameMissing(profile, isRequestTargetSetupName)) {
    return {
      label: "Base URL",
      value: "Base URL needed",
      detail: "Add the provider base URL or request target in Web setup, then check readiness.",
      tone: "warning"
    };
  }

  return {
    label: "Base URL",
    value: "Configured locally",
    detail: "The local service reports that provider request routing is available.",
    tone: "ok"
  };
}

function describeProviderModelCheck(
  profile: RuntimeSetupPlanProfile
): ProviderSetupCheck | undefined {
  if (profile.id !== "openai-compatible") {
    return undefined;
  }

  if (!hasAnySetupName(profile, isModelSetupName)) {
    return undefined;
  }

  if (!profile.enabled) {
    return {
      label: "Model",
      value: "Not checked yet",
      detail: "Enable the provider locally before Web can summarize model readiness.",
      tone: "neutral"
    };
  }

  if (isAnySetupNameMissing(profile, isModelSetupName)) {
    return {
      label: "Model",
      value: "Model needed",
      detail: "Add the provider model in Web setup or local setup before relying on model-backed discussions.",
      tone: "warning"
    };
  }

  return {
    label: "Model",
    value: "Configured locally",
    detail: "The local service reports that a model choice is available for this provider.",
    tone: "ok"
  };
}

function describeProviderConnectionCheck(
  profile: RuntimeSetupPlanProfile,
  providerConnectionVerified: boolean
): ProviderSetupCheck {
  if (profile.status === "ready" && providerConnectionVerified) {
    return {
      label: "Test connection",
      value: "Verified",
      detail: "The latest safe provider test succeeded.",
      tone: "ok"
    };
  }

  if (profile.status === "ready") {
    return {
      label: "Test connection",
      value: "Ready to test",
      detail: "Use Verify connection to confirm the provider accepts a minimal request.",
      tone: "warning"
    };
  }

  if (profile.enabled) {
    return {
      label: "Test connection",
      value: "Verify after setup",
      detail: "After saving setup, check readiness, then verify connection.",
      tone: "warning"
    };
  }

  return {
    label: "Test connection",
    value: "Enable provider first",
    detail: "Connection verification is available after this provider is enabled locally.",
    tone: "neutral"
  };
}

function getProviderChecklistSummary(
  profile: RuntimeSetupPlanProfile,
  providerConnectionVerified: boolean
): string {
  if (profile.status === "ready" && providerConnectionVerified) {
    return "Ready for model-backed discussions.";
  }

  if (profile.status === "ready") {
    return "Provider setup is saved; verify the connection before starting model-backed discussions.";
  }

  if (profile.status === "ready_with_run_config") {
    return "Enabled, but base URL, model, or request details still need setup.";
  }

  if (profile.status === "needs_configuration") {
    return "Configuration is missing before this provider can be used.";
  }

  return "Enable this provider locally before it can be used.";
}

function isWebConfigurableModelProviderProfile(profile: RuntimeSetupPlanProfile): boolean {
  return profile.id === "openai-compatible";
}

function isReadyModelOrganizerProfile(
  profile: RuntimeSetupPlanProfile,
  providerConnectionVerified: boolean
): boolean {
  return (
    profile.id === "openai-compatible" &&
    profile.status === "ready" &&
    providerConnectionVerified &&
    profile.enabledComponentCount >= 5
  );
}

function hasReadyModelOrganizerProfile(
  profiles: RuntimeSetupPlanProfile[],
  providerConnectionVerified: boolean
): boolean {
  return profiles.some((profile) =>
    isReadyModelOrganizerProfile(profile, providerConnectionVerified)
  );
}

function hasAnySetupName(
  profile: RuntimeSetupPlanProfile,
  predicate: (name: string) => boolean
): boolean {
  return getKnownSetupNames(profile).some(predicate);
}

function isAnySetupNameMissing(
  profile: RuntimeSetupPlanProfile,
  predicate: (name: string) => boolean
): boolean {
  return [...profile.missingRequiredEnvVars, ...profile.missingRecommendedEnvVars].some(
    predicate
  );
}

function getKnownSetupNames(profile: RuntimeSetupPlanProfile): string[] {
  return [
    ...profile.missingRequiredEnvVars,
    ...profile.missingRecommendedEnvVars,
    ...profile.secretEnvVarNames,
    ...profile.optionalEnvVarNames
  ];
}

function isRequestTargetSetupName(name: string): boolean {
  return name.includes("BASE_URL") || name.endsWith("_URL") || name.includes("ENDPOINT_PATH");
}

function isModelSetupName(name: string): boolean {
  return name.endsWith("_MODEL") || name.includes("_MODEL_");
}

function SetupModelCard({
  profile,
  kind,
  providerConnectionVerified = false
}: {
  profile: RuntimeSetupPlanProfile;
  kind: "local" | "provider";
  providerConnectionVerified?: boolean;
}) {
  const { t } = useI18n();
  const status = describeSetupProfileStatus(profile, kind, providerConnectionVerified);

  return (
    <article className={`du-setup-model-card du-setup-model-${status.tone}`}>
      <p className="du-kicker">{t(kind === "local" ? "Local demo model" : "Model provider")}</p>
      <h4>{t(profile.name)}</h4>
      <strong>{t(status.title)}</strong>
      <p>{t(status.detail)}</p>
    </article>
  );
}

function SetupInstructionStep({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="du-readable-item">
      <h4>{title}</h4>
      <p>{detail}</p>
    </article>
  );
}

function RuntimeProfileSetupDetails({
  entries,
  setupPlan,
  setupProfilesById
}: {
  entries: Array<{
    profile: unknown;
    index: number;
    id: string;
  }>;
  setupPlan: RuntimeSetupPlan | undefined;
  setupProfilesById: Map<string, RuntimeSetupPlanProfile>;
}) {
  return (
    <>
      {setupPlan ? (
        <KeyValueGrid
          items={[
            {
              label: "Setup steps",
              value: String(setupPlan.steps.length)
            },
            {
              label: "Required env vars",
              value: formatSetupEnvVarList(setupPlan.summary.missingRequiredEnvVars)
            },
            {
              label: "Recommended env vars",
              value: formatSetupEnvVarList(setupPlan.summary.missingRecommendedEnvVars)
            },
            {
              label: "Secret env names",
              value: formatSetupEnvVarList(setupPlan.summary.secretEnvVarNames)
            }
          ]}
        />
      ) : null}
      <div className="du-run-list">
        {entries.map(({ profile, index, id }) => {
          const setup = getRecordValue(profile, "setup");
          const components = asArray(getRecordValue(profile, "components"));
          const enabledComponents = components.filter(
            (componentEntry) => getRecordValue(componentEntry, "enabled") === true
          ).length;
          const setupProfile = setupProfilesById.get(id);
          const missingRecommendedEnvVars = setupProfile
            ? setupProfile.missingRecommendedEnvVars
            : formatUnknownArray(getRecordValue(setup, "missingRecommendedEnvVars"));

          return (
            <article className="du-run-list-item" key={`${id}-${index}`}>
              <p className="du-kicker">{id}</p>
              <h3>{formatRecordValue(getRecordValue(profile, "name") ?? id)}</h3>
              <p>{formatRuntimeProfileStatus(getRecordValue(profile, "status"))}</p>
              <KeyValueGrid
                items={[
                  {
                    label: "Enabled",
                    value: getRecordValue(profile, "enabled") === true ? "Yes" : "No"
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
                    value: formatSetupEnvVarList(setupProfile?.missingRequiredEnvVars ?? [])
                  },
                  {
                    label: "Recommended setup",
                    value: formatSetupEnvVarList(missingRecommendedEnvVars)
                  },
                  {
                    label: "Plan steps",
                    value: setupProfile ? String(setupProfile.steps.length) : "Unavailable"
                  }
                ]}
              />
            </article>
          );
        })}
      </div>
    </>
  );
}

function describeModelProviderSummary(
  providerProfiles: RuntimeSetupPlanProfile[],
  localPreset: RuntimeSetupPlanProfile | undefined,
  providerConnectionVerified: boolean
): string {
  const readyProviders = providerProfiles.filter((profile) => profile.status === "ready");

  if (readyProviders.length > 0 && providerConnectionVerified) {
    return "A real model provider is ready for model-backed discussions.";
  }

  if (readyProviders.length > 0) {
    return "A model provider is saved locally; verify the connection before starting model-backed discussions.";
  }

  if (providerProfiles.some((profile) => profile.status === "ready_with_run_config")) {
    return "A provider is enabled, but model details still need Web setup or per-discussion model settings.";
  }

  if (localPreset?.status === "ready") {
    return "The local preset is ready for demos; configure a provider for real model-backed discussions.";
  }

  return "No model provider is ready yet.";
}

function describeSetupProfileStatus(
  profile: RuntimeSetupPlanProfile,
  kind: "local" | "provider",
  providerConnectionVerified: boolean
): { title: string; detail: string; tone: "ok" | "warning" | "neutral" } {
  if (kind === "local" && profile.status === "ready") {
    return {
      title: "Ready for demo discussions",
      detail: "Uses deterministic local material and does not call external providers.",
      tone: "ok"
    };
  }

  if (profile.status === "ready" && providerConnectionVerified) {
    return {
      title: "Ready for model-backed discussions",
      detail: "This provider can support configured model-backed participants from the local service.",
      tone: "ok"
    };
  }

  if (profile.status === "ready") {
    return {
      title: "Verify provider connection",
      detail:
        "This provider is saved locally. Use Verify connection before starting model-backed discussions.",
      tone: "warning"
    };
  }

  if (profile.status === "ready_with_run_config") {
    return {
      title: "Provider enabled; add model details",
      detail: "Add a base URL and model in Web setup when supported, or provide equivalent per-discussion model settings.",
      tone: "warning"
    };
  }

  if (profile.status === "needs_configuration") {
    return {
      title: "Configuration required",
      detail: "Add the missing setup before this participant source can be used.",
      tone: "warning"
    };
  }

  return {
    title: "Not enabled",
    detail: "Enable this provider locally before it can appear in discussions.",
    tone: "neutral"
  };
}

function describeSetupNextAction({
  canStartDiscussion,
  providerNeedsVerification,
  providerNeedsSetup,
  readyProviderCount
}: {
  canStartDiscussion: boolean;
  providerNeedsVerification: boolean;
  providerNeedsSetup: boolean;
  readyProviderCount: number;
}): { title: string; detail: string; tone: "ok" | "warning" | "neutral" } {
  if (readyProviderCount > 0) {
    return {
      title: "Ready for discussions",
      detail: "Start a discussion and choose configured participants or model-backed discussion plans when needed.",
      tone: "ok"
    };
  }

  if (providerNeedsVerification) {
    return {
      title: "Verify provider connection",
      detail:
        "Use Verify connection before starting a real model-backed discussion.",
      tone: "warning"
    };
  }

  if (providerNeedsSetup) {
    return {
      title: "Configure provider locally",
      detail: "Use the Web setup form for API key, base URL, and model, then check readiness so the provider becomes active.",
      tone: "warning"
    };
  }

  if (canStartDiscussion) {
    return {
      title: "Ready for demo discussions",
      detail: "Start with the local preset now, then add a real provider before relying on model-backed results.",
      tone: "ok"
    };
  }

  return {
    title: "Add model setup first",
    detail: "Configure at least one local participant source before starting a model-backed discussion.",
    tone: "neutral"
  };
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

function formatSessionCatalogTitle(session: unknown, index: number): string {
  const topic = getStringRecordValue(session, "topic");
  const title = getStringRecordValue(session, "title");

  if (topic) {
    return topic;
  }

  if (title && !isTechnicalSessionTitle(title)) {
    return title;
  }

  return `Discussion ${index + 1}`;
}

function formatSessionCatalogSummary(session: unknown): string {
  const title = getStringRecordValue(session, "title");
  const topic = getStringRecordValue(session, "topic");

  if (title && title !== topic && !isTechnicalSessionTitle(title)) {
    return title;
  }

  return "Review the brief, perspectives, disagreements, evidence, conclusion, and next actions.";
}

function isTechnicalSessionTitle(value: string): boolean {
  return /^stage\s+\d+\s+shell$/i.test(value.trim());
}

function formatOverviewCount(
  t: (message: string, values?: Record<string, string | number>) => string,
  query: { isLoading: boolean; isError: boolean },
  records: unknown[],
  singular: string,
  plural: string
): string {
  if (query.isLoading) {
    return t("Loading");
  }

  if (query.isError) {
    return t("Unavailable");
  }

  return t("{count} {item}", {
    count: records.length,
    item: t(records.length === 1 ? singular : plural)
  });
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
  const { t } = useI18n();
  const object = getRecordValue(record, "object") ?? record;
  const id = getStringRecordValue(object, "id") ?? `${kind}-${index + 1}`;
  const readableKind = formatReadableKind(kind);
  const fallbackTitle = t("{kind} {number}", {
    kind: t(readableKind),
    number: index + 1
  });
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
    ]) ?? getReadableFallbackDetail(kind);
  const reviewCue = t(formatSessionRecordReviewCue(kind, getRecordValue(object, "status")));
  const proposalEventId = formatRecordValue(getRecordValue(record, "proposalEventId"));
  const sourceEventIds = formatRecordIdList(asArray(getRecordValue(object, "sourceEventIds")));

  return (
    <article className="du-readable-item">
      <p className="du-kicker">{fallbackTitle}</p>
      <h4>{t(title)}</h4>
      {detail !== title ? <p>{t(detail)}</p> : null}
      <p className="du-readable-meta">{reviewCue}</p>
      <AdvancedDetails summary="Advanced / Developer Mode" lazy>
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
    return "Main perspective";
  }

  if (kind === "disagreement") {
    return "Open disagreement";
  }

  if (kind === "requirement") {
    return "Requirement";
  }

  return "Missing evidence";
}

function getReadableFallbackDetail(kind: SessionReadableKind): string {
  if (kind === "perspective") {
    return "This perspective is tracked, but it does not have a plain-language summary yet.";
  }

  if (kind === "disagreement") {
    return "This disagreement is tracked, but it does not have a plain-language summary yet.";
  }

  if (kind === "requirement") {
    return "This requirement is tracked, but it does not have a plain-language summary yet.";
  }

  return "This evidence need is tracked, but it does not have a plain-language summary yet.";
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
    return formatReadableIdentifier(value);
  }

  return "No visible step available yet";
}

function formatReadableIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function formatSessionRecordReviewCue(
  kind: SessionReadableKind,
  status: unknown
): string {
  if (status === "checked" || status === "satisfied" || status === "resolved") {
    return "Resolved for now.";
  }

  if (kind === "perspective" && (status === "accepted_active" || status === "active")) {
    return "Included as a strongest current option.";
  }

  if (kind === "disagreement" && status === "open") {
    return "Still constrains the current conclusion.";
  }

  if (kind === "requirement" && status === "unanswered") {
    return "Needs an answer before relying on the conclusion.";
  }

  if (kind === "evidence") {
    return "Needs verification before relying on the conclusion.";
  }

  return "Review this item before relying on the conclusion.";
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

function getStringArray(value: unknown): string[] {
  return asArray(value).filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
}

function formatTranslatedTextList(
  t: (message: string, values?: Record<string, string | number>) => string,
  items: readonly string[]
): string {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => t(item))
    .join(" ");
}

function SessionRoute() {
  const { sessionId } = useSessionParams();
  const { t } = useI18n();

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel={t("User Mode")}
      navigation={<SessionNavigation sessionId={sessionId} />}
      status={<LanguageSwitcher />}
    >
      <Outlet />
    </WorkspaceShell>
  );
}

function SessionNavigation({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
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
        {t("Discussion brief")}
      </Link>
      <Link
        to="/sessions/$sessionId/frontier"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Main perspectives")}
      </Link>
      <Link
        to="/sessions/$sessionId/objections"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Open disagreements")}
      </Link>
      <Link
        to="/sessions/$sessionId/obligations"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Requirements")}
      </Link>
      <Link
        to="/sessions/$sessionId/final"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Current conclusion")}
      </Link>
      <Link
        to="/sessions/$sessionId/resources"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Risks and evidence")}
      </Link>
      <details className="du-nav-advanced">
        <summary>{t("Advanced / Developer Mode")}</summary>
        <Link
          to="/sessions/$sessionId/events"
          params={{ sessionId }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          {t("Ledger events")}
        </Link>
      </details>
    </>
  );
}

function SessionOverviewPage() {
  const { sessionId } = useSessionParams();
  const { client } = useDaemonRuntime();
  const { t } = useI18n();
  const eventsQuery = useSessionEventsQuery(sessionId);
  const frontierQuery = useQuery({
    queryKey: ["frontier", sessionId],
    queryFn: () => client.getFrontier(sessionId)
  });
  const objectionsQuery = useQuery({
    queryKey: ["objections", sessionId],
    queryFn: () => client.getObjections(sessionId)
  });
  const obligationsQuery = useQuery({
    queryKey: ["obligations", sessionId],
    queryFn: () => client.getObligations(sessionId)
  });
  const resourcesQuery = useQuery({
    queryKey: ["session-resources", sessionId],
    queryFn: () => client.getSessionResources(sessionId)
  });
  const events = asArray(eventsQuery.data?.events);
  const perspectives = asArray(frontierQuery.data?.candidates);
  const openDisagreements = asArray(objectionsQuery.data?.objections);
  const answerRequirements = asArray(obligationsQuery.data?.qualityObligations);
  const missingEvidence = asArray(resourcesQuery.data?.evidenceNeeds);
  const latestEvent = events.at(-1);
  const topicContractEvent =
    events.find((event) => getRecordValue(event, "type") === "topic_contract_published") ??
    latestEvent;
  const topicContractPayload = getRecordValue(topicContractEvent, "payload");
  const discussionTopic = formatRecordValue(
    getRecordValue(topicContractPayload, "topic") ?? "No discussion brief available yet"
  );
  const discussionGoals = getStringArray(getRecordValue(topicContractPayload, "goals"));
  const discussionConstraints = getStringArray(
    getRecordValue(topicContractPayload, "constraints")
  );
  const output = getRecordValue(topicContractPayload, "output");
  const expectedOutcomes = getStringArray(
    getRecordValue(output, "expectations") ??
      getRecordValue(topicContractPayload, "outputExpectations")
  );

  return (
    <ViewFrame
      eyebrow={t("User Mode")}
      title={t("Discussion brief")}
      description={t(
        "The human-facing starting point for this discussion: what is being decided and where the discussion currently stands."
      )}
    >
      <QueryState query={eventsQuery}>
        <DataPanel
          title={t("Discussion brief")}
          description={t("The discussion setup is shown here in plain language.")}
        >
          <div className="du-readable-list">
            <QualityPathItem title={t("Question or topic")} detail={t(discussionTopic)} />
            {discussionGoals.length > 0 ? (
              <QualityPathItem
                title={t("Goals")}
                detail={formatTranslatedTextList(t, discussionGoals)}
              />
            ) : null}
            {discussionConstraints.length > 0 ? (
              <QualityPathItem
                title={t("Constraints")}
                detail={formatTranslatedTextList(t, discussionConstraints)}
              />
            ) : null}
            {expectedOutcomes.length > 0 ? (
              <QualityPathItem
                title={t("Expected result")}
                detail={formatTranslatedTextList(t, expectedOutcomes)}
              />
            ) : null}
            <QualityPathItem
              title={t("Current activity")}
              detail={t(
                events.length === 1
                  ? "{count} update in this discussion so far."
                  : "{count} updates in this discussion so far.",
                {
                  count: events.length
                }
              )}
            />
            <QualityPathItem
              title={t("Latest visible step")}
              detail={t(formatSessionEventTypeForUser(getRecordValue(latestEvent, "type")))}
            />
          </div>
        </DataPanel>
        <DataPanel
          title={t("Review this discussion")}
          description={t("A quick human-readable snapshot of what is ready to inspect next.")}
        >
          <div className="du-quality-map">
            <QualityMapItem
              label={t("Main perspectives")}
              value={formatOverviewCount(
                t,
                frontierQuery,
                perspectives,
                "visible perspective",
                "visible perspectives"
              )}
            />
            <QualityMapItem
              label={t("Open disagreements")}
              value={formatOverviewCount(
                t,
                objectionsQuery,
                openDisagreements,
                "open disagreement",
                "open disagreements"
              )}
            />
            <QualityMapItem
              label={t("Requirements")}
              value={formatOverviewCount(
                t,
                obligationsQuery,
                answerRequirements,
                "requirement",
                "requirements"
              )}
            />
            <QualityMapItem
              label={t("Risks and missing evidence")}
              value={formatOverviewCount(
                t,
                resourcesQuery,
                missingEvidence,
                "missing evidence item",
                "missing evidence items"
              )}
            />
          </div>
          <div className="du-action-row">
            <Link
              className="du-action-link"
              to="/sessions/$sessionId/final"
              params={{ sessionId }}
            >
              {t("View current conclusion")}
            </Link>
            <Link
              className="du-action-link du-secondary-link"
              to="/sessions/$sessionId/frontier"
              params={{ sessionId }}
            >
              {t("View main perspectives")}
            </Link>
            <Link
              className="du-action-link du-secondary-link"
              to="/sessions/$sessionId/resources"
              params={{ sessionId }}
            >
              {t("Review risks and evidence")}
            </Link>
          </div>
        </DataPanel>
        <DataPanel
          title={t("Next recommended actions")}
          description={t(
            "Start with the conclusion, then inspect the material that could change it."
          )}
        >
          <div className="du-readable-list">
            {missingEvidence.length > 0 ? (
              <QualityPathItem
                title={t("Check missing evidence")}
                detail={t("Resolve evidence gaps before treating the conclusion as reliable.")}
              />
            ) : null}
            {openDisagreements.length > 0 ? (
              <QualityPathItem
                title={t("Review open disagreements")}
                detail={t(
                  "Open disagreements show where the conclusion is still constrained."
                )}
              />
            ) : null}
            {answerRequirements.length > 0 ? (
              <QualityPathItem
                title={t("Confirm answer requirements")}
                detail={t(
                  "Unanswered requirements should be satisfied or explicitly acknowledged."
                )}
              />
            ) : null}
            {perspectives.length === 0 && !frontierQuery.isLoading ? (
              <QualityPathItem
                title={t("Continue the discussion")}
                detail={t(
                  "No main perspectives are visible yet. Continue the guided discussion before relying on the result."
                )}
              />
            ) : null}
            <QualityPathItem
              title={t("Review current conclusion")}
              detail={t(
                "Open the current conclusion to see the result, caveats, and next steps together."
              )}
            />
          </div>
        </DataPanel>
        <AdvancedDetails
          description="Ledger position and raw latest entry are available for debugging without leading the user experience."
          panelLabel="Ledger position"
          lazy
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
  const { t } = useI18n();
  const frontierQuery = useQuery({
    queryKey: ["frontier", sessionId],
    queryFn: () => client.getFrontier(sessionId)
  });

  return (
    <ViewFrame
      eyebrow={t("User Mode")}
      title={t("Main perspectives")}
      description={t(
        "The strongest current options stay visible without selecting one hidden answer."
      )}
    >
      <QueryState query={frontierQuery}>
        <DataPanel
          title={t("Strongest current options")}
          description={t(
            "These are the strongest currently visible perspectives. They remain open to challenge while the discussion continues."
          )}
        >
          <ReadableSessionRecordList
            records={asArray(frontierQuery.data?.candidates)}
            emptyTitle={t("No active candidates")}
            emptyDescription={t(
              "No main perspectives have been accepted into this discussion yet."
            )}
            kind="perspective"
          />
        </DataPanel>
        <AdvancedDetails
          description="Projection basis and raw candidate material for developer inspection."
          lazy
        >
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
  const { t } = useI18n();
  const objectionsQuery = useQuery({
    queryKey: ["objections", sessionId],
    queryFn: () => client.getObjections(sessionId)
  });

  return (
    <ViewFrame
      eyebrow={t("User Mode")}
      title={t("Open disagreements")}
      description={t(
        "Objections stay visible as unresolved disagreements that can still constrain the conclusion."
      )}
    >
      <QueryState query={objectionsQuery}>
        <DataPanel
          title={t("Open disagreements")}
          description={t(
            "These are challenges, failure modes, or unresolved concerns raised against the current options."
          )}
        >
          <ReadableSessionRecordList
            records={asArray(objectionsQuery.data?.objections)}
            emptyTitle={t("No open disagreements")}
            emptyDescription={t(
              "No open disagreements have been accepted into this discussion yet."
            )}
            kind="disagreement"
          />
        </DataPanel>
        <AdvancedDetails
          description="Raw objection projection material for developer inspection."
          lazy
        >
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
  const { t } = useI18n();
  const obligationsQuery = useQuery({
    queryKey: ["obligations", sessionId],
    queryFn: () => client.getObligations(sessionId)
  });

  return (
    <ViewFrame
      eyebrow={t("User Mode")}
      title={t("Requirements this answer must satisfy")}
      description={t(
        "Explicit requirements keep the conclusion correct, bounded, and complete."
      )}
    >
      <QueryState query={obligationsQuery}>
        <DataPanel
          title={t("Requirements this answer must satisfy")}
          description={t(
            "Unanswered requirements should be resolved before relying on the conclusion."
          )}
        >
          <ReadableSessionRecordList
            records={asArray(obligationsQuery.data?.qualityObligations)}
            emptyTitle={t("No requirements listed")}
            emptyDescription={t(
              "No explicit requirements have been accepted into this discussion yet."
            )}
            kind="requirement"
          />
        </DataPanel>
        <AdvancedDetails
          description="Raw quality obligation projection material for developer inspection."
          lazy
        >
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
  const { t } = useI18n();
  const eventsQuery = useSessionEventsQuery(sessionId);

  return (
    <ViewFrame
      eyebrow={t("Advanced / Developer Mode")}
      title={t("Ledger events")}
      description={t(
        "Append-only event records are shown as returned by the daemon for debugging and audit inspection."
      )}
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
  const { t } = useI18n();
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
  const objectionsQuery = useQuery({
    queryKey: ["session-final-objections", sessionId],
    queryFn: () => client.getObjections(sessionId)
  });
  const obligationsQuery = useQuery({
    queryKey: ["session-final-obligations", sessionId],
    queryFn: () => client.getObligations(sessionId)
  });
  const resourcesQuery = useQuery({
    queryKey: ["session-final-resources", sessionId],
    queryFn: () => client.getSessionResources(sessionId)
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
  const outcomeContext = {
    mainPerspectives: asArray(frontierQuery.data?.candidates),
    openDisagreements: asArray(objectionsQuery.data?.objections),
    missingEvidence: asArray(resourcesQuery.data?.evidenceNeeds),
    answerRequirements: asArray(obligationsQuery.data?.qualityObligations)
  };

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
      eyebrow={t("User Mode")}
      title={t("Current conclusion")}
      description={t(
        "Review the current conclusion together with main perspectives, open disagreements, missing evidence, risks, and next actions."
      )}
    >
      <QueryState query={finalQuery}>
        <StatusBanner
          tone={finalQuery.data?.draftStatus === "draft" ? "ok" : "warning"}
          title={
            finalQuery.data?.draftStatus === "draft"
              ? t("Current conclusion compiled")
              : t("Current conclusion remains provisional")
          }
          detail={t(
            "This is reviewable deliberation material. It should keep open disagreements, risks, evidence gaps, and next actions visible."
          )}
        />
        <DataPanel
          title={t("Current conclusion")}
          description={t(
            "A readable summary of the current result. Advanced details keep source details and developer diagnostics out of the default view."
          )}
        >
          <OutcomeBrief outcome={outcome} context={outcomeContext} />
        </DataPanel>
        <AdvancedDetails
          description="Projection overrides, provenance, raw JSON, internal ids, Final Audit controls, and proposal lifecycle controls for developers."
          lazy
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
  const { t } = useI18n();
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
      eyebrow={t("User Mode")}
      title={t("Evidence and verification")}
      description={t(
        "Missing evidence, verification needs, and risks are shown together so they can be resolved before relying on the conclusion."
      )}
    >
      <QueryState query={resourcesQuery}>
        <StatusBanner
          tone={evidenceNeeds.length > 0 ? "warning" : "neutral"}
          title={
            evidenceNeeds.length > 0
              ? t("Evidence gaps visible")
              : t("No evidence gaps visible")
          }
          detail={t(
            "This page focuses on what still needs to be checked. Technical access details remain in Advanced mode."
          )}
        />
        <DataPanel
          title={t("Risks and missing evidence")}
          description={t(
            "Missing evidence items are user-facing verification work, not low-level access state."
          )}
        >
          <ReadableSessionRecordList
            records={evidenceNeeds}
            emptyTitle={t("No missing evidence yet")}
            emptyDescription={t(
              "This discussion has not surfaced missing evidence items yet."
            )}
            kind="evidence"
          />
        </DataPanel>
        <AdvancedDetails
          description="Resource access posture, delivery/access audits, source ids, and raw projection JSON for developer inspection."
          lazy
        >
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
