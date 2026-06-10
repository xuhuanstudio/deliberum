import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const DEFAULT_RUN_PLAN_TEXT = JSON.stringify(
  {
    title: "Local run",
    topic: "Describe the deliberation topic.",
    goals: ["Map the main proposals and unresolved issues."],
    constraints: ["Keep conclusions provisional."],
    participants: [
      {
        id: "participant-1",
        kind: "manual_bridge",
        displayName: "Manual participant",
        adapterId: "manual"
      }
    ],
    providerConfigs: [],
    budget: {
      maxProviderCalls: 4
    },
    timeouts: {},
    output: {
      expectations: ["Preserve limitations and unresolved issues."]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "manual"
    }
  },
  null,
  2
);

const DEFAULT_START_REQUEST_TEXT = JSON.stringify(
  {
    sealedDivergence: {
      autoCloseManual: true
    }
  },
  null,
  2
);

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
        description="Local orchestration runs from the daemon run store."
        actions={
          <Link className="du-action-link" to="/runs/new">
            New run
          </Link>
        }
      >
        <QueryState query={runsQuery}>
          <DataPanel title="Runs">
            {runs.length === 0 ? (
              <EmptyState
                title="No runs"
                description="Create a run from a JSON run plan to start local daemon orchestration."
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

  return (
    <RunWorkspaceShell>
      <ViewFrame
        eyebrow="Run creation"
        title="Create a daemon run"
        description="Submit a JSON run plan to the local daemon. Provider secrets stay outside Web input."
      >
        <JsonInputForm
          id="run-plan-json"
          label="Run plan JSON"
          value={runPlanText}
          onChange={setRunPlanText}
          onSubmit={submitRunPlan}
          submitLabel={createMutation.isPending ? "Creating" : "Create run"}
          disabled={createMutation.isPending}
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
        description="Daemon run state, stage metadata, and projection views."
        actions={
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            View provisional outcome
          </Link>
        }
      >
        <QueryState query={runQuery}>
          <RunSummary run={run} />
          <RunStageStatus run={run} />
          <StartRunForm runId={runId} />
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
        description="A daemon-derived compiled view when the run has enough accepted proposal material."
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
                description="Rendered as daemon output, not as a settled conclusion."
              >
                <JsonBlock value={sanitizeForDisplay(outcome.outcome)} />
              </DataPanel>
            </>
          ) : (
            <StatusBanner
              tone="warning"
              title="Provisional outcome not available"
              detail={formatRecordValue(outcome?.reason)}
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
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Runs
      </Link>
      <Link
        to="/runs/new"
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        New run
      </Link>
      {runId ? (
        <Link
          to="/runs/$runId"
          params={{ runId }}
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
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          Outcome
        </Link>
      ) : null}
    </>
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
            value: formatRecordValue(getRecordValue(run, "status"))
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
          value: formatRecordValue(getRecordValue(run, "status"))
        },
        {
          label: "Ledger events",
          value: formatRecordValue(getRecordValue(getRecordValue(run, "ledger"), "eventCount"))
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
      description="Operational stage state from the daemon run view."
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

function StageStatusList({ stages }: { stages: Array<[string, unknown]> }) {
  return (
    <div className="du-stage-grid">
      {stages.map(([label, status]) => (
        <div className="du-stage-pill" key={label}>
          <span>{label}</span>
          <strong>{formatRecordValue(status)}</strong>
        </div>
      ))}
    </div>
  );
}

function StartRunForm({ runId }: { runId: string }) {
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const [startRequestText, setStartRequestText] = useState(DEFAULT_START_REQUEST_TEXT);
  const [inputError, setInputError] = useState<string | null>(null);
  const startMutation = useMutation({
    mutationFn: (startRequest: Record<string, unknown>) => client.startRun(runId, startRequest),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["run", runId] });
      void queryClient.invalidateQueries({ queryKey: ["run-outcome", runId] });
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

  return (
    <DataPanel
      title="Start orchestration"
      description="Submit a JSON start request to the daemon run API."
    >
      <JsonInputForm
        id="start-request-json"
        label="Start request JSON"
        value={startRequestText}
        onChange={setStartRequestText}
        onSubmit={submitStartRequest}
        submitLabel={startMutation.isPending ? "Starting" : "Start run"}
        disabled={startMutation.isPending}
      />
      {inputError ? <StatusBanner tone="error" title={inputError} /> : null}
      {startMutation.isError ? (
        <StatusBanner
          tone="error"
          title="Run start failed"
          detail={formatSafeErrorMessage(startMutation.error)}
        />
      ) : null}
      {startMutation.data ? <StartResult result={startMutation.data} /> : null}
    </DataPanel>
  );
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
        description="Read from the daemon projection endpoint."
      >
        <QueryState query={frontierQuery}>
          <JsonBlock
            value={sanitizeForDisplay({
              basis: frontierQuery.data?.basis,
              candidates: frontierQuery.data?.candidates ?? [],
              projection: frontierQuery.data?.projection
            })}
          />
        </QueryState>
      </DataPanel>
      <DataPanel title="Objections projection">
        <QueryState query={objectionsQuery}>
          <JsonBlock
            value={sanitizeForDisplay({
              objections: objectionsQuery.data?.objections ?? [],
              projection: objectionsQuery.data?.projection
            })}
          />
        </QueryState>
      </DataPanel>
      <DataPanel title="Quality obligations projection">
        <QueryState query={obligationsQuery}>
          <JsonBlock
            value={sanitizeForDisplay({
              qualityObligations: obligationsQuery.data?.qualityObligations ?? [],
              projection: obligationsQuery.data?.projection
            })}
          />
        </QueryState>
      </DataPanel>
    </section>
  );
}

function JsonInputForm({
  id,
  label,
  value,
  onChange,
  onSubmit,
  submitLabel,
  disabled
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  disabled?: boolean;
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

function getRunItemKey(run: unknown, fallback: number): string {
  return getStringRecordValue(run, "runId") ?? `run-${fallback}`;
}

function useRunParams(): { runId: string } {
  return useParams({
    strict: false
  }) as { runId: string };
}
