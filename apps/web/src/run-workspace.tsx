import { Link, useParams } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import {
  DataPanel,
  EmptyState,
  JsonBlock,
  KeyValueGrid,
  StatusBanner,
  WorkspaceShell
} from "@deliberum/ui";
import { useState, type FormEvent, type ReactNode } from "react";
import { useDaemonRuntime } from "./daemon-runtime";
import {
  DaemonStatus,
  QueryState,
  RecordCollection,
  ViewFrame,
  asArray,
  formatRecordValue,
  formatSafeErrorMessage,
  getRecordValue,
  getStringRecordValue,
  sanitizeForDisplay
} from "./view-components";
import {
  LOCAL_PRESET_RUN_PLAN,
  LOCAL_PRESET_START_REQUEST,
  formatPresetJson
} from "./run-presets";

const DEFAULT_RUN_PLAN_TEXT = formatPresetJson(LOCAL_PRESET_RUN_PLAN);
const DEFAULT_START_REQUEST_TEXT = formatPresetJson(LOCAL_PRESET_START_REQUEST);

export function RunsListPage() {
  const { client } = useDaemonRuntime();
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => client.listRuns()
  });
  const runs = asArray(runsQuery.data?.runs);

  return (
    <RunWorkspaceShell>
      <ViewFrame
        eyebrow="Run workspace"
        title="Daemon runs"
        description="Controlled local orchestration jobs from the daemon run store."
        actions={
          <Link className="du-action-link" to="/runs/new">
            New run
          </Link>
        }
      >
        <RunConceptPanel />
        <QueryState query={runsQuery}>
          <DataPanel title="Runs">
            {runs.length === 0 ? (
              <EmptyState
                title="No runs"
                description="Create a local preset run or submit an advanced JSON run plan."
              />
            ) : (
              <div className="du-run-list">
                {runs.map((run, index) => (
                  <RunListItem key={getRunItemKey(run, index)} run={run} index={index} />
                ))}
              </div>
            )}
          </DataPanel>
        </QueryState>
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

export function RunNewPage() {
  const { client } = useDaemonRuntime();
  const [runPlanText, setRunPlanText] = useState(DEFAULT_RUN_PLAN_TEXT);
  const [inputError, setInputError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (runPlan: Record<string, unknown>) => client.createRun({ runPlan })
  });
  const createdRunId = getStringRecordValue(createMutation.data?.run, "runId");

  function submitRunPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseJsonObjectInput(runPlanText, "Run plan");

    if (!parsed.ok) {
      setInputError(parsed.message);
      return;
    }

    setInputError(null);
    createMutation.mutate(parsed.value);
  }

  function fillLocalPresetRunPlan() {
    setInputError(null);
    setRunPlanText(formatPresetJson(LOCAL_PRESET_RUN_PLAN));
  }

  function createLocalPresetRun() {
    setInputError(null);
    setRunPlanText(formatPresetJson(LOCAL_PRESET_RUN_PLAN));
    createMutation.mutate(cloneJsonObject(LOCAL_PRESET_RUN_PLAN));
  }

  return (
    <RunWorkspaceShell>
      <ViewFrame
        eyebrow="Run creation"
        title="Create a daemon run"
        description="Create a controlled orchestration job. The local preset is deterministic development material, not real provider output."
      >
        <StatusBanner
          title="Local preset requires daemon opt-in"
          detail="To run the built-in preset pipeline, start the daemon with DELIBERUM_ENABLE_LOCAL_PRESET=true. Without it, the run can be created but start will report missing local components."
        />
        <JsonInputForm
          id="run-plan-json"
          label="Advanced run plan JSON"
          value={runPlanText}
          onChange={setRunPlanText}
          onSubmit={submitRunPlan}
          submitLabel={createMutation.isPending ? "Creating" : "Create run"}
          disabled={createMutation.isPending}
          actions={
            <>
              <button
                type="button"
                className="du-secondary-button"
                onClick={fillLocalPresetRunPlan}
                disabled={createMutation.isPending}
              >
                Fill local preset run plan
              </button>
              <button
                type="button"
                onClick={createLocalPresetRun}
                disabled={createMutation.isPending}
              >
                Create local preset run
              </button>
            </>
          }
        />
        {inputError ? <StatusBanner tone="error" title={inputError} /> : null}
        {createMutation.isError ? (
          <StatusBanner
            tone="error"
            title="Run creation failed"
            detail={formatSafeErrorMessage(createMutation.error)}
          />
        ) : null}
        {createdRunId ? (
          <StatusBanner
            tone="ok"
            title="Run created"
            detail={`Run ${createdRunId} is available in the local daemon.`}
          />
        ) : null}
        {createdRunId ? (
          <div className="du-action-row">
            <Link className="du-action-link" to="/runs/$runId" params={{ runId: createdRunId }}>
              Open run
            </Link>
            <Link
              className="du-action-link"
              to="/runs/$runId/outcome"
              params={{ runId: createdRunId }}
            >
              View provisional outcome
            </Link>
          </div>
        ) : null}
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

export function RunDetailPage() {
  const { runId } = useRunParams();
  const { client } = useDaemonRuntime();
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => client.getRun(runId)
  });
  const run = runQuery.data?.run;
  const sessionId = getStringRecordValue(run, "sessionId");

  return (
    <RunWorkspaceShell runId={runId}>
      <ViewFrame
        eyebrow="Run detail"
        title={getStringRecordValue(run, "title") ?? getStringRecordValue(run, "topic") ?? runId}
        description="Run status, stage progress, safe projections, and local preset controls."
        actions={
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            View provisional outcome
          </Link>
        }
      >
        <QueryState query={runQuery}>
          <RunSummary run={run} />
          <RunDetailGuide />
          <RunStageStatus run={run} />
          <RunEventTimeline runId={runId} />
          <StartRunForm runId={runId} sessionId={sessionId} />
          <DataPanel title="Run plan view">
            <JsonBlock value={sanitizeForDisplay(getRecordValue(run, "plan") ?? {})} />
          </DataPanel>
          <DataPanel
            title="Round metadata"
            description="Operational state from the daemon run view."
          >
            <JsonBlock value={sanitizeForDisplay(getRecordValue(run, "rounds") ?? {})} />
          </DataPanel>
          {sessionId ? <RunProjectionPanels sessionId={sessionId} /> : null}
        </QueryState>
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

export function RunOutcomePage() {
  const { runId } = useRunParams();
  const { client } = useDaemonRuntime();
  const outcomeQuery = useQuery({
    queryKey: ["run-outcome", runId],
    queryFn: () => client.getRunOutcome(runId)
  });
  const outcome = outcomeQuery.data;

  return (
    <RunWorkspaceShell runId={runId}>
      <ViewFrame
        eyebrow="Outcome view"
        title="Provisional outcome"
        description="A compiled artifact from accepted proposal material, not a final answer."
        actions={
          <Link className="du-action-link" to="/runs/$runId" params={{ runId }}>
            Back to run
          </Link>
        }
      >
        <QueryState query={outcomeQuery}>
          {outcome?.status === "compiled" ? (
            <>
              <KeyValueGrid
                items={[
                  {
                    label: "Run id",
                    value: outcome.runId
                  },
                  {
                    label: "Session id",
                    value: outcome.sessionId
                  },
                  {
                    label: "Draft status",
                    value: outcome.draftStatus
                  }
                ]}
              />
              <DataPanel
                title="Provisional outcome"
                description="Rendered from the daemon outcome endpoint as provisional material."
              >
                <JsonBlock value={sanitizeForDisplay(outcome.outcome)} />
              </DataPanel>
            </>
          ) : (
            <StatusBanner
              tone="warning"
              title="Provisional outcome not available"
              detail={describeOutcomeUnavailableReason(getRecordValue(outcome, "reason"))}
            />
          )}
        </QueryState>
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

function RunWorkspaceShell({
  runId,
  children
}: {
  runId?: string;
  children: ReactNode;
}) {
  const { daemonBaseUrl } = useDaemonRuntime();

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel="Run workspace"
      daemonBaseUrl={daemonBaseUrl}
      navigation={<RunNavigation runId={runId} />}
      status={<DaemonStatus />}
    >
      {children}
    </WorkspaceShell>
  );
}

function RunNavigation({ runId }: { runId?: string }) {
  const linkClass = "du-nav-link";

  return (
    <>
      <Link
        to="/runs"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Runs
      </Link>
      <Link
        to="/runs/new"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        New run
      </Link>
      {runId ? (
        <Link
          to="/runs/$runId"
          params={{ runId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          Detail
        </Link>
      ) : null}
      {runId ? (
        <Link
          to="/runs/$runId/outcome"
          params={{ runId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          Outcome
        </Link>
      ) : null}
    </>
  );
}

function RunConceptPanel() {
  return (
    <DataPanel
      title="How local runs work"
      description="The Web workspace controls and views daemon runs; it is not a semantic authority."
    >
      <div className="du-explainer-grid">
        <ExplainerItem
          title="Run"
          detail="A controlled orchestration job owned by the local daemon run store."
        />
        <ExplainerItem
          title="Session"
          detail="The underlying append-only event ledger session created for the run."
        />
        <ExplainerItem
          title="Ledger events"
          detail="Recorded lifecycle events from the daemon. Payload visibility follows daemon redaction rules."
        />
        <ExplainerItem
          title="Provisional outcome"
          detail="A compiled artifact from accepted proposal material, not a final answer."
        />
      </div>
    </DataPanel>
  );
}

function RunDetailGuide() {
  return (
    <DataPanel title="Current run meaning">
      <div className="du-explainer-grid">
        <ExplainerItem
          title="Created"
          detail="The run exists, but the pipeline has not started yet."
        />
        <ExplainerItem
          title="Not run yet"
          detail="No round has been recorded for that stage."
        />
        <ExplainerItem
          title="Missing local components"
          detail="Restart the daemon with DELIBERUM_ENABLE_LOCAL_PRESET=true before using the local preset start request."
        />
      </div>
    </DataPanel>
  );
}

function ExplainerItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="du-explainer-item">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function RunListItem({ run, index }: { run: unknown; index: number }) {
  const runId = getStringRecordValue(run, "runId");
  const title = getStringRecordValue(run, "title") ?? getStringRecordValue(run, "topic");

  return (
    <article className="du-run-list-item">
      <div>
        <p className="du-kicker">Run {index + 1}</p>
        <h3>{title ?? runId ?? "Untitled run"}</h3>
        <p>{runId ?? "Run id unavailable"}</p>
      </div>
      <KeyValueGrid
        items={[
          {
            label: "Status",
            value: describeRunStatus(getRecordValue(run, "status"))
          },
          {
            label: "Session",
            value: formatRecordValue(getRecordValue(run, "sessionId"))
          },
          {
            label: "Updated",
            value: formatRecordValue(getRecordValue(run, "updatedAt"))
          }
        ]}
      />
      <StageStatusList
        stages={[
          ["Sealed divergence", getRecordValue(run, "sealedDivergenceStatus")],
          ["Extraction", getRecordValue(run, "latestExtractionStatus")],
          ["Proposal review", getRecordValue(run, "latestProposalReviewStatus")],
          ["Finalization", getRecordValue(run, "latestFinalizationStatus")]
        ]}
      />
      {runId ? (
        <div className="du-action-row">
          <Link className="du-action-link" to="/runs/$runId" params={{ runId }}>
            Open detail
          </Link>
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            Provisional outcome
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function RunSummary({ run }: { run: unknown }) {
  return (
    <KeyValueGrid
      items={[
        {
          label: "Run id",
          value: formatRecordValue(getRecordValue(run, "runId"))
        },
        {
          label: "Session id",
          value: formatRecordValue(getRecordValue(run, "sessionId"))
        },
        {
          label: "Run status",
          value: describeRunStatus(getRecordValue(run, "status"))
        },
        {
          label: "Ledger events",
          value: describeLedgerEvents(getRecordValue(getRecordValue(run, "ledger"), "eventCount"))
        },
        {
          label: "Created",
          value: formatRecordValue(getRecordValue(run, "createdAt"))
        },
        {
          label: "Updated",
          value: formatRecordValue(getRecordValue(run, "updatedAt"))
        }
      ]}
    />
  );
}

function RunStageStatus({ run }: { run: unknown }) {
  return (
    <DataPanel
      title="Stage status"
      description="Each stage is controlled by the daemon. Not run yet means no stage round exists in this run."
    >
      <StageStatusList
        stages={[
          ["Sealed divergence", getRecordValue(run, "sealedDivergenceStatus")],
          ["Extraction", getRecordValue(run, "latestExtractionStatus")],
          ["Proposal review", getRecordValue(run, "latestProposalReviewStatus")],
          ["Finalization", getRecordValue(run, "latestFinalizationStatus")]
        ]}
      />
    </DataPanel>
  );
}

function RunEventTimeline({ runId }: { runId: string }) {
  const { client } = useDaemonRuntime();
  const eventsQuery = useQuery({
    queryKey: ["run-events", runId],
    queryFn: () => client.getRunEvents(runId)
  });
  const events = asArray(eventsQuery.data?.events).map(toEventMetadata);

  return (
    <DataPanel
      title="Run ledger timeline"
      description="Daemon-redacted ledger events for this run. Web renders the returned event view without computing projections."
    >
      <QueryState query={eventsQuery}>
        <KeyValueGrid
          items={[
            {
              label: "Run id",
              value: eventsQuery.data?.runId ?? runId
            },
            {
              label: "Session id",
              value: eventsQuery.data?.sessionId ?? "None"
            },
            {
              label: "Event entries",
              value: events.length
            }
          ]}
        />
        <RecordCollection
          title="Events"
          records={events}
          emptyTitle="No ledger events"
          emptyDescription="The daemon returned no event entries for this run."
        />
      </QueryState>
    </DataPanel>
  );
}

function StageStatusList({ stages }: { stages: Array<[string, unknown]> }) {
  return (
    <div className="du-stage-grid">
      {stages.map(([label, status]) => {
        const statusView = describeStageStatus(status);

        return (
          <div className="du-stage-pill" key={label}>
            <span>{label}</span>
            <strong>{statusView.label}</strong>
            <span>{statusView.detail}</span>
          </div>
        );
      })}
    </div>
  );
}

function StartRunForm({ runId, sessionId }: { runId: string; sessionId?: string }) {
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const [startRequestText, setStartRequestText] = useState(DEFAULT_START_REQUEST_TEXT);
  const [inputError, setInputError] = useState<string | null>(null);
  const startMutation = useMutation({
    mutationFn: (startRequest: Record<string, unknown>) => client.startRun(runId, startRequest),
    onSuccess: async (result) => {
      const resultSessionId =
        getStringRecordValue(getRecordValue(result, "run"), "sessionId") ?? sessionId;

      await invalidateRunWorkspaceQueries(queryClient, runId, resultSessionId);
    }
  });

  function submitStartRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseJsonObjectInput(startRequestText, "Start request");

    if (!parsed.ok) {
      setInputError(parsed.message);
      return;
    }

    setInputError(null);
    startMutation.mutate(parsed.value);
  }

  function fillLocalPresetStartRequest() {
    setInputError(null);
    setStartRequestText(formatPresetJson(LOCAL_PRESET_START_REQUEST));
  }

  function startLocalPresetPipeline() {
    setInputError(null);
    setStartRequestText(formatPresetJson(LOCAL_PRESET_START_REQUEST));
    startMutation.mutate(cloneJsonObject(LOCAL_PRESET_START_REQUEST));
  }

  return (
    <DataPanel
      title="Start orchestration"
      description="Start requested stages through the daemon. The local preset pipeline requires the daemon preset flag."
    >
      <JsonInputForm
        id="start-request-json"
        label="Advanced start request JSON"
        value={startRequestText}
        onChange={setStartRequestText}
        onSubmit={submitStartRequest}
        submitLabel={startMutation.isPending ? "Starting" : "Start run"}
        disabled={startMutation.isPending}
        actions={
          <>
            <button
              type="button"
              className="du-secondary-button"
              onClick={fillLocalPresetStartRequest}
              disabled={startMutation.isPending}
            >
              Fill local preset start request
            </button>
            <button
              type="button"
              onClick={startLocalPresetPipeline}
              disabled={startMutation.isPending}
            >
              Start full local preset pipeline
            </button>
          </>
        }
      />
      {inputError ? <StatusBanner tone="error" title={inputError} /> : null}
      {startMutation.isError ? (
        <StatusBanner
          tone="error"
          title="Run start failed"
          detail={formatRunStartErrorMessage(startMutation.error)}
        />
      ) : null}
      {startMutation.data ? <StartResult result={startMutation.data} /> : null}
    </DataPanel>
  );
}

async function invalidateRunWorkspaceQueries(
  queryClient: QueryClient,
  runId: string,
  sessionId?: string
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: ["runs"] }),
    queryClient.invalidateQueries({ queryKey: ["run", runId] }),
    queryClient.invalidateQueries({ queryKey: ["run-events", runId] }),
    queryClient.invalidateQueries({ queryKey: ["run-outcome", runId] })
  ];

  if (sessionId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["run-frontier", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["run-objections", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["run-obligations", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["frontier", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["objections", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["obligations", sessionId] })
    );
  }

  await Promise.all(invalidations);
}

function StartResult({ result }: { result: unknown }) {
  const stages = asArray(getRecordValue(result, "stages")).map(toStageMetadata);
  const stopped = getRecordValue(result, "stopped");

  return (
    <div className="du-start-result">
      <StatusBanner
        tone={stopped === true ? "warning" : "ok"}
        title={stopped === true ? "Run stopped" : "Run request completed"}
        detail={
          stopped === true
            ? `Reason: ${formatRecordValue(getRecordValue(result, "stopReason"))}`
            : "Daemon returned stage metadata for the requested run stages."
        }
      />
      <RecordCollection
        title="Stage results"
        records={stages}
        emptyTitle="No stages returned"
        emptyDescription="The daemon did not report executed stages for this request."
      />
    </div>
  );
}

function RunProjectionPanels({ sessionId }: { sessionId: string }) {
  const { client } = useDaemonRuntime();
  const frontierQuery = useQuery({
    queryKey: ["run-frontier", sessionId],
    queryFn: () => client.getFrontier(sessionId)
  });
  const objectionsQuery = useQuery({
    queryKey: ["run-objections", sessionId],
    queryFn: () => client.getObjections(sessionId)
  });
  const obligationsQuery = useQuery({
    queryKey: ["run-obligations", sessionId],
    queryFn: () => client.getObligations(sessionId)
  });

  return (
    <section className="du-projection-section" aria-label="Run projection panels">
      <DataPanel
        title="Candidate Frontier projection"
        description="Read from the daemon projection endpoint. Web displays the returned projection; it does not compute it."
      >
        <QueryState query={frontierQuery}>
          <ProjectionRecordList
            records={asArray(frontierQuery.data?.candidates)}
            emptyTitle="No Candidate Frontier entries"
            emptyDescription="Accepted candidate projections will appear after extraction proposals are accepted."
            kind="candidate"
          />
          <ProjectionMetadata projection={frontierQuery.data?.projection} />
        </QueryState>
      </DataPanel>
      <DataPanel
        title="Objections projection"
        description="Accepted objection objects returned by the daemon projection endpoint."
      >
        <QueryState query={objectionsQuery}>
          <ProjectionRecordList
            records={asArray(objectionsQuery.data?.objections)}
            emptyTitle="No objections"
            emptyDescription="Accepted objections will appear here when projection data is available."
            kind="objection"
          />
          <ProjectionMetadata projection={objectionsQuery.data?.projection} />
        </QueryState>
      </DataPanel>
      <DataPanel
        title="Quality obligations projection"
        description="Accepted quality obligations returned by the daemon projection endpoint."
      >
        <QueryState query={obligationsQuery}>
          <ProjectionRecordList
            records={asArray(obligationsQuery.data?.qualityObligations)}
            emptyTitle="No quality obligations"
            emptyDescription="Accepted quality obligations will appear after proposal material is accepted."
            kind="quality obligation"
          />
          <ProjectionMetadata projection={obligationsQuery.data?.projection} />
        </QueryState>
      </DataPanel>
    </section>
  );
}

function ProjectionRecordList({
  records,
  emptyTitle,
  emptyDescription,
  kind
}: {
  records: unknown[];
  emptyTitle: string;
  emptyDescription: string;
  kind: "candidate" | "objection" | "quality obligation";
}) {
  if (records.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="du-readable-list">
      {records.map((record, index) => (
        <ProjectionRecord
          key={getProjectionRecordKey(record, index)}
          record={record}
          kind={kind}
        />
      ))}
    </div>
  );
}

function ProjectionRecord({
  record,
  kind
}: {
  record: unknown;
  kind: "candidate" | "objection" | "quality obligation";
}) {
  const object = getRecordValue(record, "object") ?? record;
  const id = getStringRecordValue(object, "id") ?? `${kind}-${getProjectionRecordKey(record, 0)}`;
  const title =
    getStringRecordValue(object, "title") ??
    getStringRecordValue(object, "content") ??
    getStringRecordValue(object, "requirement") ??
    getStringRecordValue(object, "failureMode") ??
    id;
  const status = getRecordValue(object, "status");
  const description =
    getStringRecordValue(object, "description") ??
    getStringRecordValue(object, "consequence") ??
    getStringRecordValue(object, "requirement") ??
    getStringRecordValue(object, "content");
  const proposalEventId = getRecordValue(record, "proposalEventId");
  const sourceEventIds = asArray(getRecordValue(object, "sourceEventIds"));

  return (
    <article className="du-readable-item">
      <p className="du-kicker">{kind}</p>
      <h4>{title}</h4>
      {description && description !== title ? <p>{description}</p> : null}
      <KeyValueGrid
        items={[
          {
            label: "Object id",
            value: id
          },
          {
            label: "Status",
            value: formatRecordValue(status)
          },
          {
            label: "Proposal event",
            value: formatRecordValue(proposalEventId)
          },
          {
            label: "Source events",
            value: formatEventIds(sourceEventIds)
          }
        ]}
      />
    </article>
  );
}

function ProjectionMetadata({ projection }: { projection: unknown }) {
  const eventIds = asArray(getRecordValue(projection, "eventIds"));
  const eventRange = getRecordValue(projection, "eventRange");

  return (
    <div className="du-projection-meta">
      <KeyValueGrid
        items={[
          {
            label: "Projection events",
            value: formatEventIds(eventIds)
          },
          {
            label: "Event range",
            value: formatEventRange(eventRange)
          }
        ]}
      />
    </div>
  );
}

function JsonInputForm({
  id,
  label,
  value,
  onChange,
  onSubmit,
  submitLabel,
  disabled,
  actions
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  return (
    <form className="du-json-form" onSubmit={onSubmit}>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        spellCheck={false}
      />
      <div className="du-action-row">
        <button type="submit" disabled={disabled}>
          {submitLabel}
        </button>
        {actions}
      </div>
    </form>
  );
}

function parseJsonObjectInput(
  text: string,
  label: string
):
  | {
      ok: true;
      value: Record<string, unknown>;
    }
  | {
      ok: false;
      message: string;
    } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: `${label} must be valid JSON.`
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      message: `${label} must be a JSON object.`
    };
  }

  return {
    ok: true,
    value: parsed as Record<string, unknown>
  };
}

function toStageMetadata(stage: unknown): Record<string, unknown> {
  return {
    stage: getRecordValue(stage, "stage"),
    executionStatus: getRecordValue(stage, "executionStatus"),
    roundId: getRecordValue(stage, "roundId"),
    status: getRecordValue(stage, "status"),
    eventIds: asArray(getRecordValue(stage, "eventIds"))
  };
}

function toEventMetadata(event: unknown): Record<string, unknown> {
  return {
    id: getRecordValue(event, "id"),
    type: getRecordValue(event, "type"),
    sequence: getRecordValue(event, "sequence"),
    visibility: getRecordValue(event, "visibility"),
    authorId: getRecordValue(event, "authorId"),
    createdAt: getRecordValue(event, "createdAt"),
    payload: getRecordValue(event, "payload"),
    basedOnEventIds: asArray(getRecordValue(event, "basedOnEventIds")),
    trace: sanitizeForDisplay(getRecordValue(event, "trace") ?? {})
  };
}

function describeRunStatus(status: unknown): string {
  if (status === "created") {
    return "Created: run exists, pipeline has not started.";
  }

  return formatRecordValue(status);
}

function describeLedgerEvents(eventCount: unknown): string {
  if (typeof eventCount === "number") {
    return `${eventCount} recorded lifecycle event${eventCount === 1 ? "" : "s"}`;
  }

  return "No recorded lifecycle event count";
}

function describeStageStatus(status: unknown): { label: string; detail: string } {
  if (status === undefined || status === null) {
    return {
      label: "Not run yet",
      detail: "This stage has no recorded round for the run."
    };
  }

  if (status === "revealed") {
    return {
      label: "Revealed",
      detail: "Sealed divergence has produced revealed contribution events."
    };
  }

  if (status === "completed") {
    return {
      label: "Completed",
      detail: "The daemon recorded this stage as completed."
    };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      detail: "The daemon could not process this stage safely."
    };
  }

  if (typeof status === "string") {
    return {
      label: status,
      detail: "Status reported by the daemon run view."
    };
  }

  return {
    label: "Unavailable",
    detail: "The daemon did not return a readable stage status."
  };
}

function describeOutcomeUnavailableReason(reason: unknown): string {
  if (reason === "final_candidate_proposal_unavailable") {
    return "No final candidate proposal exists yet. Start the local preset pipeline or run finalization before opening the provisional outcome.";
  }

  if (reason === "final_candidate_proposal_ambiguous") {
    return "More than one final candidate proposal is available, so the daemon will not compile a provisional outcome for this view.";
  }

  if (reason === "outcome_compilation_unavailable") {
    return "The daemon could not compile the provisional outcome safely.";
  }

  return formatRecordValue(reason);
}

function formatRunStartErrorMessage(error: Error | null | undefined): string {
  if (getErrorCode(error) === "orchestration_component_unavailable") {
    return "The daemon does not have the requested local preset components. Restart the local daemon with DELIBERUM_ENABLE_LOCAL_PRESET=true, then retry the local preset run.";
  }

  return formatSafeErrorMessage(error);
}

function getErrorCode(error: unknown): string | undefined {
  const code = getRecordValue(error, "code");

  return typeof code === "string" ? code : undefined;
}

function formatEventIds(eventIds: unknown[]): string {
  const ids = eventIds.filter((eventId): eventId is string => typeof eventId === "string");

  return ids.length > 0 ? ids.join(", ") : "No event ids";
}

function formatEventRange(eventRange: unknown): string {
  const fromSequence = getRecordValue(eventRange, "fromSequence");
  const toSequence = getRecordValue(eventRange, "toSequence");

  if (typeof fromSequence === "number" && typeof toSequence === "number") {
    return `${fromSequence} to ${toSequence}`;
  }

  return "No event range";
}

function cloneJsonObject(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function getProjectionRecordKey(record: unknown, fallback: number): string {
  const object = getRecordValue(record, "object") ?? record;
  const id = getRecordValue(object, "id");

  return typeof id === "string" && id.length > 0 ? id : `projection-record-${fallback}`;
}

function getRunItemKey(run: unknown, fallback: number): string {
  return getStringRecordValue(run, "runId") ?? `run-${fallback}`;
}

function useRunParams(): { runId: string } {
  return useParams({
    strict: false
  }) as { runId: string };
}
