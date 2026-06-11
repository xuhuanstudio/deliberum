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
import { useQuery } from "@tanstack/react-query";
import {
  DataPanel,
  EmptyState,
  JsonBlock,
  KeyValueGrid,
  PageHeader,
  StatusBanner,
  WorkspaceShell
} from "@deliberum/ui";
import { useState, type FormEvent } from "react";
import { useDaemonRuntime } from "./daemon-runtime";
import {
  RunDetailPage,
  RunNewPage,
  RunOutcomePage,
  RunsListPage
} from "./run-workspace";
import {
  DaemonStatus,
  QueryState,
  RecordCollection,
  ViewFrame,
  asArray,
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
  component: ResourcesPlaceholderPage
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
  const { daemonBaseUrl } = useDaemonRuntime();
  const [sessionId, setSessionId] = useState("");
  const navigate = useNavigate({ from: "/" });
  const trimmedSessionId = sessionId.trim();

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
      workspaceLabel="Local workspace"
      daemonBaseUrl={daemonBaseUrl}
      status={<DaemonStatus />}
    >
      <section className="du-landing">
        <PageHeader
          eyebrow="Projection workspace"
          title="Open a deliberation session"
          description="Enter a session id from the local daemon. Session discovery is future daemon behavior."
          actions={
            <Link className="du-action-link" to="/runs">
              Open runs
            </Link>
          }
        />
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
      </section>
    </WorkspaceShell>
  );
}

function SessionRoute() {
  const { daemonBaseUrl } = useDaemonRuntime();
  const { sessionId } = useSessionParams();

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel="Deliberation workspace"
      sessionId={sessionId}
      daemonBaseUrl={daemonBaseUrl}
      navigation={<SessionNavigation sessionId={sessionId} />}
      status={<DaemonStatus />}
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
        Overview
      </Link>
      <Link
        to="/sessions/$sessionId/frontier"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Candidate Frontier
      </Link>
      <Link
        to="/sessions/$sessionId/objections"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Objections
      </Link>
      <Link
        to="/sessions/$sessionId/obligations"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Quality Obligations
      </Link>
      <Link
        to="/sessions/$sessionId/events"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Events
      </Link>
      <Link
        to="/sessions/$sessionId/final"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Final
      </Link>
      <Link
        to="/sessions/$sessionId/resources"
        params={{ sessionId }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Resources
      </Link>
    </>
  );
}

function SessionOverviewPage() {
  const { sessionId } = useSessionParams();
  const eventsQuery = useSessionEventsQuery(sessionId);
  const events = asArray(eventsQuery.data?.events);
  const latestEvent = events.at(-1);

  return (
    <ViewFrame
      eyebrow="Session overview"
      title="Ledger position"
      description="A compact readout from the daemon event endpoint."
    >
      <QueryState query={eventsQuery}>
        <KeyValueGrid
          items={[
            {
              label: "Event entries",
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
      eyebrow="Candidate Frontier"
      title="Accepted active candidates"
      description="This view renders the daemon projection basis and candidate set without selecting one proposal."
    >
      <QueryState query={frontierQuery}>
        <DataPanel title="Projection shape">
          <JsonBlock
            value={{
              basis: frontierQuery.data?.basis ?? "accepted_active_candidates",
              candidates: frontierQuery.data?.candidates ?? []
            }}
          />
        </DataPanel>
        <RecordCollection
          title="Candidates"
          records={asArray(frontierQuery.data?.candidates)}
          emptyTitle="No active candidates"
          emptyDescription="Accepted extraction proposals have not produced active candidates yet."
        />
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
      eyebrow="Objection Ledger"
      title="First-class objections"
      description="Objections are displayed as derived records and remain visible when unresolved."
    >
      <QueryState query={objectionsQuery}>
        <RecordCollection
          title="Objections"
          records={asArray(objectionsQuery.data?.objections)}
          emptyTitle="No derived objections"
          emptyDescription="Accepted extraction proposals have not introduced objections yet."
        />
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
      eyebrow="Quality Obligations"
      title="Obligations and status"
      description="The page preserves obligation status from the daemon projection."
    >
      <QueryState query={obligationsQuery}>
        <RecordCollection
          title="Quality obligations"
          records={asArray(obligationsQuery.data?.qualityObligations)}
          emptyTitle="No quality obligations"
          emptyDescription="Accepted extraction proposals have not introduced obligations yet."
        />
      </QueryState>
    </ViewFrame>
  );
}

function EventsPage() {
  const { sessionId } = useSessionParams();
  const eventsQuery = useSessionEventsQuery(sessionId);

  return (
    <ViewFrame
      eyebrow="Event Timeline"
      title="Append-only ledger entries"
      description="Entries are shown as returned by the daemon and preserve raw payload fields."
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
  const finalQuery = useQuery({
    queryKey: ["session-final", sessionId],
    queryFn: () => client.getSessionFinal(sessionId)
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
  const recommendation = getRecordValue(outcome, "recommendation");

  return (
    <ViewFrame
      eyebrow="Outcome Compiler"
      title="Compiled outcome projection"
      description="A daemon-backed projection from accepted proposal material and ledger provenance. It remains reviewable deliberation material, not authority."
    >
      <QueryState query={finalQuery}>
        <StatusBanner
          tone={finalQuery.data?.draftStatus === "draft" ? "ok" : "warning"}
          title={
            finalQuery.data?.draftStatus === "draft"
              ? "Draft compiled"
              : "Projection remains provisional"
          }
          detail="The page reads the daemon session final endpoint and preserves unresolved material in the returned projection."
        />
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
          title="Recommendation"
          description="The compiled recommendation is shown as projection material."
        >
          {typeof recommendation === "string" && recommendation.length > 0 ? (
            <JsonBlock value={recommendation} />
          ) : (
            <EmptyState
              title="No recommendation"
              description="The daemon compiled no recommendation text for this session."
            />
          )}
        </DataPanel>
        <DataPanel title="Unresolved questions">
          <JsonBlock
            value={sanitizeForDisplay(getRecordValue(outcome, "unresolvedQuestions") ?? [])}
          />
        </DataPanel>
        <DataPanel title="Continuation suggestions">
          <JsonBlock
            value={sanitizeForDisplay(getRecordValue(outcome, "continuationSuggestions") ?? [])}
          />
        </DataPanel>
        <DataPanel title="Limitations">
          <JsonBlock value={sanitizeForDisplay(getRecordValue(outcome, "limitations") ?? [])} />
        </DataPanel>
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
      </QueryState>
    </ViewFrame>
  );
}

function ResourcesPlaceholderPage() {
  return (
    <ViewFrame
      eyebrow="Future stage"
      title="Resource Broker placeholder"
      description="Core resource planning exists; daemon and Web live resource integration is deferred."
    >
      <StatusBanner
        title="Resource endpoint integration is not implemented"
        detail="This page is reserved for daemon-backed resource delivery and evidence surfaces."
      />
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

function useSessionParams(): { sessionId: string } {
  return useParams({
    strict: false
  }) as { sessionId: string };
}
