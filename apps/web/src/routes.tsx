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
import { LanguageSwitcher, useI18n } from "./i18n";
import { buildRuntimeSetupPlan } from "@deliberum/client";
import type {
  AuditFinalCandidateRequest,
  DeploymentPostureResponse,
  OperationAuditResponse,
  ProposeFinalCandidateRequest,
  ResourceAccessPostureResponse
} from "@deliberum/client";
import {
  DiscussionNextStepCard,
  StageStatusList,
  describeDiscussionStatus,
  formatRunDisplaySummary,
  formatRunDisplayTitle,
  getDiscussionStageStatuses,
  isDiscussionReviewReady,
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
  const { t } = useI18n();
  const { daemonBaseUrl, client } = useDaemonRuntime();
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
    queryFn: () => client.getRuntimeProfiles(),
    enabled: operatorDetailsOpen
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
  const runEntries = runs.flatMap((run, index) => {
    const runId = getStringRecordValue(run, "runId");

    return runId ? [{ run, index, runId }] : [];
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
      status={<LanguageSwitcher />}
    >
      <section className="du-landing">
        <PageHeader
          eyebrow={t("User Mode")}
          title={t("Start a discussion")}
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
            {runEntries.length === 0 ? (
              <EmptyState
                title={t("No discussions yet")}
                description={t("Start a discussion to create the first deliberation.")}
              />
            ) : (
              <div className="du-run-list">
                {runEntries.map(({ run, index, runId: catalogRunId }) => (
                  <article className="du-run-list-item" key={`${catalogRunId}-${index}`}>
                    <p className="du-kicker">{t("Discussion {number}", { number: index + 1 })}</p>
                    <h3>{t(formatRunDisplayTitle(run, index))}</h3>
                    <p>{t(formatRunDisplaySummary(run))}</p>
                    <KeyValueGrid
                      items={[
                        {
                          label: t("Discussion status"),
                          value: t(describeDiscussionStatus(run))
                        },
                        {
                          label: t("Last updated"),
                          value: formatRecordValue(getRecordValue(run, "updatedAt"))
                        }
                      ]}
                    />
                    <DiscussionNextStepCard run={run} />
                    <StageStatusList stages={getDiscussionStageStatuses(run)} />
                    <div className="du-action-row">
                      <Link
                        className="du-action-link"
                        to="/runs/$runId"
                        params={{ runId: catalogRunId }}
                      >
                        {t("Open discussion")}
                      </Link>
                      {isDiscussionReviewReady(run) ? (
                        <Link
                          className="du-action-link du-secondary-link"
                          to="/runs/$runId/outcome"
                          params={{ runId: catalogRunId }}
                        >
                          {t("Current conclusion")}
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </QueryState>
        </DataPanel>
        <AdvancedDetails
          description="Runtime, daemon, resource, audit, deployment, raw session ids, and other operator details stay available here without leading the product experience."
          lazy
          onOpen={() => setOperatorDetailsOpen(true)}
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
  const status = t(formatReadableStatus(getRecordValue(object, "status")));
  const proposalEventId = formatRecordValue(getRecordValue(record, "proposalEventId"));
  const sourceEventIds = formatRecordIdList(asArray(getRecordValue(object, "sourceEventIds")));

  return (
    <article className="du-readable-item">
      <p className="du-kicker">{fallbackTitle}</p>
      <h4>{t(title)}</h4>
      {detail !== title ? <p>{t(detail)}</p> : null}
      <p className="du-readable-meta">
        {t("Current state: {status}", {
          status
        })}
      </p>
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

function formatReadableStatus(value: unknown): string {
  if (value === "accepted_active") {
    return "Visible in this discussion";
  }

  if (value === "open") {
    return "Still open";
  }

  if (value === "unanswered") {
    return "Needs an answer";
  }

  if (typeof value === "string" && value.length > 0) {
    return formatReadableIdentifier(value);
  }

  return formatRecordValue(value);
}

function formatReadableIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
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
            "A readable summary of the current result. Advanced details keep technical provenance and developer controls."
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
