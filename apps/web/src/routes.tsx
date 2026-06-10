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
import { useState, type FormEvent, type ReactNode } from "react";
import { useDaemonRuntime } from "./daemon-runtime";

const rootRoute = createRootRoute({
  component: RootRoute
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage
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
  component: FinalPlaceholderPage
});

const sessionResourcesRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "resources",
  component: ResourcesPlaceholderPage
});

const routeTree = rootRoute.addChildren([
  landingRoute,
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
      description="This view renders the daemon projection basis and candidate set without selecting a single answer."
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

function FinalPlaceholderPage() {
  return (
    <ViewFrame
      eyebrow="Future stage"
      title="Outcome Compiler placeholder"
      description="No final output is compiled in Stage 11."
    >
      <StatusBanner
        title="Outcome Compiler is not implemented"
        detail="This page is reserved for a later compiler that reads accepted candidates, obligations, objections, evidence, and audit events."
      />
    </ViewFrame>
  );
}

function ResourcesPlaceholderPage() {
  return (
    <ViewFrame
      eyebrow="Future stage"
      title="Resource Broker placeholder"
      description="No resources are fetched, served, or exposed in Stage 11."
    >
      <StatusBanner
        title="Resource Broker is not implemented"
        detail="This page is reserved for future resource delivery and evidence surfaces."
      />
    </ViewFrame>
  );
}

type ViewFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

function ViewFrame({ eyebrow, title, description, children }: ViewFrameProps) {
  return (
    <div className="du-view">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="du-view-body">{children}</div>
    </div>
  );
}

function DaemonStatus() {
  const { client } = useDaemonRuntime();
  const healthQuery = useQuery({
    queryKey: ["daemon-health"],
    queryFn: () => client.health(),
    retry: false
  });

  if (healthQuery.isLoading) {
    return <StatusBanner title="Checking daemon" />;
  }

  if (healthQuery.isError) {
    return (
      <StatusBanner
        tone="warning"
        title="Daemon unavailable"
        detail="Views will retry when routes request data."
      />
    );
  }

  if (!healthQuery.data) {
    return <StatusBanner title="Daemon status unavailable" />;
  }

  return (
    <StatusBanner
      tone="ok"
      title="Daemon online"
      detail={`${healthQuery.data.service} on ${healthQuery.data.host}:${healthQuery.data.port}`}
    />
  );
}

type QueryStateProps = {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };
  children: ReactNode;
};

function QueryState({ query, children }: QueryStateProps) {
  if (query.isLoading) {
    return <StatusBanner title="Loading daemon view" />;
  }

  if (query.isError) {
    return (
      <StatusBanner
        tone="error"
        title="Daemon request failed"
        detail={query.error?.message ?? "The daemon did not return a usable response."}
      />
    );
  }

  return children;
}

type RecordCollectionProps = {
  title: string;
  records: unknown[];
  emptyTitle: string;
  emptyDescription: string;
};

function RecordCollection({
  title,
  records,
  emptyTitle,
  emptyDescription
}: RecordCollectionProps) {
  return (
    <DataPanel title={title}>
      {records.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="du-record-list">
          {records.map((record, index) => (
            <JsonBlock
              key={getRecordKey(record, index)}
              label={String(getRecordValue(record, "id") ?? `Record ${index + 1}`)}
              value={record}
            />
          ))}
        </div>
      )}
    </DataPanel>
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getRecordValue(record: unknown, key: string): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }

  return (record as Record<string, unknown>)[key];
}

function formatRecordValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "None";
}

function getRecordKey(record: unknown, fallback: number): string {
  const id = getRecordValue(record, "id");

  return typeof id === "string" && id.length > 0 ? id : `record-${fallback}`;
}
