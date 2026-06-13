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
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
const DEFAULT_PROCESS_AUTHOR_ID = "system";
const DEFAULT_PROCESS_REVIEWER_ID = "process-reviewer";
const DEFAULT_PROCESS_COORDINATOR_ID = "process-coordinator";
type RunFollowStatus = "idle" | "connecting" | "connected" | "error" | "unsupported";
type ProcessDecisionStatus = "accepted" | "deferred" | "rejected";

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
        title="Start a deliberation run"
        description="Create a ledger-backed run that exercises the core deliberation loop before reading raw daemon records."
      >
        <StatusBanner
          title="Local preset requires daemon opt-in"
          detail="To run the built-in preset pipeline, start the daemon with DELIBERUM_ENABLE_LOCAL_PRESET=true. Without it, the run can be created but start will report missing local components."
        />
        <DataPanel
          title="Guided local preset"
          description="Use this path to see Topic Contract, sealed divergence, Candidate Frontier, objections, obligations, and provisional outcome views with deterministic local components."
        >
          <div className="du-readable-list">
            <ExplainerItem
              title="No provider credentials"
              detail="The preset does not call external models and is meant for product walkthroughs and local verification."
            />
            <ExplainerItem
              title="Full quality loop"
              detail="It creates traceable proposal material, reviewable candidate state, and a provisional compiled output."
            />
          </div>
          <div className="du-action-row">
            <button
              type="button"
              onClick={createLocalPresetRun}
              disabled={createMutation.isPending}
            >
              Create local preset run
            </button>
          </div>
        </DataPanel>
        <details className="du-advanced-panel">
          <summary>Advanced JSON plan</summary>
          <JsonInputForm
            id="run-plan-json"
            label="Advanced JSON run plan"
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
              </>
            }
          />
        </details>
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
          {sessionId ? <RunQualityOverview sessionId={sessionId} /> : null}
          <RunDetailGuide />
          <RunStageStatus run={run} />
          <StartRunForm runId={runId} sessionId={sessionId} />
          <RunProcessProposals runId={runId} sessionId={sessionId} />
          {sessionId ? <RunProcessGovernance runId={runId} sessionId={sessionId} /> : null}
          {sessionId ? <RunProjectionPanels sessionId={sessionId} /> : null}
          <details className="du-advanced-panel">
            <summary>Ledger trace and advanced run records</summary>
            <RunEventTimeline runId={runId} />
            <DataPanel title="Run plan view">
              <JsonBlock value={sanitizeForDisplay(getRecordValue(run, "plan") ?? {})} />
            </DataPanel>
            <DataPanel
              title="Round metadata"
              description="Operational state from the daemon run view."
            >
              <JsonBlock value={sanitizeForDisplay(getRecordValue(run, "rounds") ?? {})} />
            </DataPanel>
          </details>
        </QueryState>
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

export function RunOutcomePage() {
  const { runId } = useRunParams();
  const { client } = useDaemonRuntime();
  const [projectionProposalEventId, setProjectionProposalEventId] = useState("");
  const [appliedProjectionProposalEventId, setAppliedProjectionProposalEventId] = useState<
    string | undefined
  >();
  const outcomeQuery = useQuery({
    queryKey: ["run-outcome", runId, appliedProjectionProposalEventId ?? "latest"],
    queryFn: () =>
      appliedProjectionProposalEventId
        ? client.getRunOutcome(runId, {
            finalCandidateProposalEventId: appliedProjectionProposalEventId
          })
        : client.getRunOutcome(runId)
  });
  const outcome = outcomeQuery.data;
  const compiledOutcome = outcome?.status === "compiled" ? outcome.outcome : undefined;
  const provenance = getRecordValue(compiledOutcome, "provenance");
  const finalCandidateProposalEventId = getStringRecordValue(
    provenance,
    "finalCandidateProposalEventId"
  );
  const canClearProjectionOverride =
    appliedProjectionProposalEventId !== undefined ||
    projectionProposalEventId.trim().length > 0;

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
        <form className="du-inline-form" onSubmit={submitProjectionOverride}>
          <label htmlFor="du-run-outcome-projection-event">
            Candidate proposal event override
          </label>
          <div className="du-inline-form-row">
            <input
              id="du-run-outcome-projection-event"
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
                  },
                  {
                    label: "Candidate proposal event",
                    value: finalCandidateProposalEventId ?? "None"
                  }
                ]}
              />
              <DataPanel
                title="Outcome brief"
                description="Readable projection of the compiled outcome. The full daemon material remains available below for traceability."
              >
                <OutcomeBrief outcome={outcome.outcome} />
              </DataPanel>
              <details className="du-advanced-panel">
                <summary>Raw outcome material</summary>
                <JsonBlock value={sanitizeForDisplay(outcome.outcome)} />
              </details>
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
          ["Candidate repair", getRecordValue(run, "latestCandidateRepairStatus")],
          ["Evidence check", getRecordValue(run, "latestEvidenceCheckStatus")],
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
          ["Candidate repair", getRecordValue(run, "latestCandidateRepairStatus")],
          ["Evidence check", getRecordValue(run, "latestEvidenceCheckStatus")],
          ["Proposal review", getRecordValue(run, "latestProposalReviewStatus")],
          ["Finalization", getRecordValue(run, "latestFinalizationStatus")]
        ]}
      />
    </DataPanel>
  );
}

function RunEventTimeline({ runId }: { runId: string }) {
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followStatus, setFollowStatus] = useState<RunFollowStatus>("idle");
  const [followError, setFollowError] = useState<string | null>(null);
  const [streamedEvents, setStreamedEvents] = useState<unknown[]>([]);
  const eventsQuery = useQuery({
    queryKey: ["run-events", runId],
    queryFn: () => client.getRunEvents(runId)
  });
  const sessionId = eventsQuery.data?.sessionId;
  const events = mergeRunEvents(asArray(eventsQuery.data?.events), streamedEvents).map(
    toEventMetadata
  );

  useEffect(() => {
    setIsFollowing(false);
    setFollowStatus("idle");
    setFollowError(null);
    setStreamedEvents([]);
  }, [runId]);

  useEffect(() => {
    if (!isFollowing) {
      if (followStatus !== "error" && followStatus !== "unsupported") {
        setFollowStatus("idle");
        setFollowError(null);
      }
      return;
    }

    if (typeof EventSource !== "function") {
      setFollowStatus("unsupported");
      setFollowError("This browser does not support live run event follow.");
      setIsFollowing(false);
      return;
    }

    const source = new EventSource(client.getRunEventsStreamUrl(runId));
    let closed = false;

    setFollowStatus("connecting");
    setFollowError(null);

    source.onopen = () => {
      if (!closed) {
        setFollowStatus("connected");
      }
    };

    function handleStreamEvent(event: Event) {
      if (closed) {
        return;
      }

      const parsed = parseStreamedRunEvent((event as MessageEvent<string>).data);

      if (!parsed.ok) {
        setFollowStatus("error");
        setFollowError(parsed.message);
        setIsFollowing(false);
        source.close();
        return;
      }

      setFollowStatus("connected");
      setStreamedEvents((currentEvents) => mergeRunEvents(currentEvents, [parsed.event]));
      void invalidateRunWorkspaceQueries(queryClient, runId, sessionId);
    }

    source.addEventListener("event", handleStreamEvent);

    source.onerror = () => {
      if (!closed) {
        setFollowStatus("error");
        setFollowError("Live run event follow connection failed.");
        setIsFollowing(false);
        source.close();
      }
    };

    return () => {
      closed = true;
      source.removeEventListener("event", handleStreamEvent);
      source.close();
    };
  }, [client, isFollowing, queryClient, runId, sessionId]);

  function toggleLiveFollow() {
    if (typeof EventSource !== "function") {
      setFollowStatus("unsupported");
      setFollowError("This browser does not support live run event follow.");
      return;
    }

    setIsFollowing((current) => !current);
  }

  return (
    <DataPanel
      title="Run ledger timeline"
      description="Daemon-redacted ledger events for this run. Web renders the returned event view without computing projections."
    >
      <QueryState query={eventsQuery}>
        <div className="du-follow-controls">
          <StatusBanner
            tone={describeRunFollowTone(followStatus)}
            title={describeRunFollowTitle(followStatus)}
            detail={
              followError ??
              "Live follow subscribes only to the daemon-redacted run event stream."
            }
          />
          <div className="du-follow-actions">
            <button type="button" onClick={toggleLiveFollow}>
              {isFollowing ? "Stop live follow" : "Start live follow"}
            </button>
          </div>
        </div>
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
            },
            {
              label: "Live follow",
              value: describeRunFollowValue(followStatus)
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
      <div className="du-readable-list">
        <ExplainerItem
          title="Run the full local preset"
          detail="Executes sealed divergence, extraction, review, and finalization through deterministic local components."
        />
      </div>
      <div className="du-action-row">
        <button
          type="button"
          onClick={startLocalPresetPipeline}
          disabled={startMutation.isPending}
        >
          Start full local preset pipeline
        </button>
      </div>
      <details className="du-advanced-panel">
        <summary>Advanced start request</summary>
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
            </>
          }
        />
      </details>
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
    queryClient.invalidateQueries({ queryKey: ["run-outcome", runId] }),
    queryClient.invalidateQueries({ queryKey: ["run-process-proposals", runId] })
  ];

  if (sessionId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["run-process-proposal-states", sessionId] }),
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

function RunQualityOverview({ sessionId }: { sessionId: string }) {
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
  const queryState = {
    isLoading: frontierQuery.isLoading || objectionsQuery.isLoading || obligationsQuery.isLoading,
    isError: frontierQuery.isError || objectionsQuery.isError || obligationsQuery.isError,
    error: frontierQuery.error ?? objectionsQuery.error ?? obligationsQuery.error ?? null
  };
  const candidates = asArray(frontierQuery.data?.candidates);
  const objections = asArray(objectionsQuery.data?.objections);
  const obligations = asArray(obligationsQuery.data?.qualityObligations);
  const unresolvedObjections = countRecordsWithoutStatus(objections, "resolved");
  const openObligations = countRecordsWithoutStatus(obligations, "satisfied");

  return (
    <DataPanel
      title="Deliberation quality overview"
      description="A product-level map of the current run state from daemon projections."
    >
      <QueryState query={queryState}>
        <div className="du-quality-summary-grid">
          <QualitySummaryLink
            title="Candidate Frontier"
            detail="Accepted active candidate material, without collapsing the frontier into one hidden authority."
            metric={String(candidates.length)}
            to="/sessions/$sessionId/frontier"
            sessionId={sessionId}
          />
          <QualitySummaryLink
            title="Open pressure"
            detail="Unresolved objection records that still constrain the outcome."
            metric={String(unresolvedObjections)}
            to="/sessions/$sessionId/objections"
            sessionId={sessionId}
          />
          <QualitySummaryLink
            title="Quality obligations"
            detail="Explicit duties that keep the output correct, complete, and bounded."
            metric={`${openObligations}/${obligations.length}`}
            to="/sessions/$sessionId/obligations"
            sessionId={sessionId}
          />
        </div>
      </QueryState>
    </DataPanel>
  );
}

function QualitySummaryLink({
  title,
  detail,
  metric,
  to,
  sessionId
}: {
  title: string;
  detail: string;
  metric: string;
  to:
    | "/sessions/$sessionId/frontier"
    | "/sessions/$sessionId/objections"
    | "/sessions/$sessionId/obligations";
  sessionId: string;
}) {
  return (
    <Link className="du-quality-summary-item" to={to} params={{ sessionId }}>
      <span>{metric}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </Link>
  );
}

function OutcomeBrief({ outcome }: { outcome: unknown }) {
  const recommendation =
    getStringRecordValue(outcome, "recommendation") ??
    getStringRecordValue(outcome, "summary") ??
    "The daemon did not return a readable recommendation.";
  const unresolvedQuestions = getStringArray(getRecordValue(outcome, "unresolvedQuestions"));
  const limitations = getStringArray(getRecordValue(outcome, "limitations"));
  const continuationSuggestions = getStringArray(
    getRecordValue(outcome, "continuationSuggestions")
  );
  const alternatives = asArray(getRecordValue(outcome, "alternatives"));
  const unresolvedObjections = asArray(getRecordValue(outcome, "unresolvedObjections"));
  const qualityObligations = asArray(getRecordValue(outcome, "qualityObligations"));
  const evidenceNeeds = asArray(
    getRecordValue(getRecordValue(outcome, "evidenceStatus"), "evidenceNeeds")
  );
  const uncheckedEvidenceNeeds = evidenceNeeds.filter(
    (entry) => getRecordValue(entry, "status") === "unchecked"
  ).length;

  return (
    <div className="du-outcome-brief">
      <section className="du-outcome-hero" aria-label="Outcome snapshot">
        <article className="du-outcome-recommendation">
          <p className="du-kicker">Recommendation</p>
          <h4>{recommendation}</h4>
        </article>
        <div className="du-outcome-status-grid">
          <OutcomeStatusItem
            title="Alternatives"
            value={String(alternatives.length)}
            detail={describeOutcomeCount(alternatives.length, "explored option", "explored options")}
          />
          <OutcomeStatusItem
            title="Open objections"
            value={String(unresolvedObjections.length)}
            detail={describeOutcomeCount(
              unresolvedObjections.length,
              "unresolved constraint",
              "unresolved constraints"
            )}
            tone={unresolvedObjections.length > 0 ? "warning" : "ok"}
          />
          <OutcomeStatusItem
            title="Evidence needs"
            value={
              evidenceNeeds.length === 0
                ? "0"
                : `${uncheckedEvidenceNeeds}/${evidenceNeeds.length}`
            }
            detail={
              evidenceNeeds.length === 0
                ? "No evidence need returned"
                : `${uncheckedEvidenceNeeds} unchecked need${
                    uncheckedEvidenceNeeds === 1 ? "" : "s"
                  }`
            }
            tone={uncheckedEvidenceNeeds > 0 ? "warning" : "ok"}
          />
          <OutcomeStatusItem
            title="Limits"
            value={String(limitations.length)}
            detail={describeOutcomeCount(limitations.length, "known boundary", "known boundaries")}
            tone={limitations.length > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>
      <div className="du-outcome-section-grid">
        <ReadableStringList
          title="Unresolved questions"
          items={unresolvedQuestions}
          emptyTitle="No unresolved questions returned"
        />
        <ReadableStringList
          title="Limitations"
          items={limitations}
          emptyTitle="No limitations returned"
        />
      </div>
      <ReadableRecordList
        title="Alternatives"
        items={alternatives}
        emptyTitle="No alternatives returned"
        summarizeItem={summarizeAlternative}
      />
      <ReadableRecordList
        title="Open objections"
        items={unresolvedObjections}
        emptyTitle="No unresolved objections returned"
        summarizeItem={summarizeOpenObjection}
      />
      <ReadableRecordList
        title="Evidence needs"
        items={evidenceNeeds}
        emptyTitle="No evidence needs returned"
        summarizeItem={summarizeEvidenceNeed}
      />
      <ReadableRecordList
        title="Quality obligations"
        items={qualityObligations}
        emptyTitle="No quality obligations returned"
        summarizeItem={summarizeQualityObligation}
      />
      <ReadableStringList
        title="Continuation suggestions"
        items={continuationSuggestions}
        emptyTitle="No continuation suggestions returned"
      />
    </div>
  );
}

function OutcomeStatusItem({
  title,
  value,
  detail,
  tone = "neutral"
}: {
  title: string;
  value: string;
  detail: string;
  tone?: "neutral" | "ok" | "warning";
}) {
  return (
    <article className={`du-outcome-status-item du-outcome-status-${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ReadableStringList({
  title,
  items,
  emptyTitle
}: {
  title: string;
  items: string[];
  emptyTitle: string;
}) {
  return (
    <div className="du-readable-list">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} description="The compiled projection did not include items for this section." />
      ) : (
        items.map((item, index) => (
          <article className="du-readable-item" key={`${title}:${index}:${item}`}>
            <p className="du-kicker">{`${title} ${index + 1}`}</p>
            <p>{item}</p>
          </article>
        ))
      )}
    </div>
  );
}

type OutcomeRecordSummary = {
  kicker: string;
  title: string;
  detail: string;
  meta?: string;
};

function ReadableRecordList({
  title,
  items,
  emptyTitle,
  summarizeItem
}: {
  title: string;
  items: unknown[];
  emptyTitle: string;
  summarizeItem: (item: unknown, index: number) => OutcomeRecordSummary;
}) {
  return (
    <div className="du-readable-list">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description="The compiled projection did not include records for this section."
        />
      ) : (
        items.map((item, index) => {
          const summary = summarizeItem(item, index);

          return (
            <article
              className="du-readable-item"
              key={`${title}:${index}:${summary.kicker}:${summary.title}`}
            >
              <p className="du-kicker">{summary.kicker}</p>
              <h5>{summary.title}</h5>
              <p>{summary.detail}</p>
              {summary.meta ? <p className="du-readable-meta">{summary.meta}</p> : null}
            </article>
          );
        })
      )}
    </div>
  );
}

function summarizeAlternative(item: unknown, index: number): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: `Alternative ${index + 1}`,
    fallbackKicker: `Alternative ${index + 1}`,
    titleKeys: ["title", "name", "id", "candidateId"],
    detailKeys: ["summary", "rationale", "description", "text", "claim"],
    metaKeys: ["status", "sourceEventId", "candidateId"]
  });
}

function summarizeOpenObjection(item: unknown, index: number): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: `Open objection ${index + 1}`,
    fallbackKicker: `Objection ${index + 1}`,
    titleKeys: ["title", "id", "objectionId", "status"],
    detailKeys: ["summary", "reason", "description", "text", "claim"],
    metaKeys: ["severity", "sourceEventId", "targetId"]
  });
}

function summarizeEvidenceNeed(item: unknown, index: number): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: `Evidence need ${index + 1}`,
    fallbackKicker: `Evidence ${index + 1}`,
    titleKeys: ["question", "title", "id", "needId", "status"],
    detailKeys: ["description", "summary", "rationale", "text", "claim"],
    metaKeys: ["status", "sourceEventId", "targetId"]
  });
}

function summarizeQualityObligation(item: unknown, index: number): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: `Quality obligation ${index + 1}`,
    fallbackKicker: `Obligation ${index + 1}`,
    titleKeys: ["title", "id", "obligationId", "status"],
    detailKeys: ["description", "summary", "requirement", "text", "claim"],
    metaKeys: ["status", "sourceEventId", "targetId"]
  });
}

function summarizeOutcomeRecord(
  item: unknown,
  index: number,
  options: {
    fallbackTitle: string;
    fallbackKicker: string;
    titleKeys: readonly string[];
    detailKeys: readonly string[];
    metaKeys: readonly string[];
  }
): OutcomeRecordSummary {
  if (typeof item === "string") {
    return {
      kicker: options.fallbackKicker,
      title: options.fallbackTitle,
      detail: item
    };
  }

  const object = getRecordValue(item, "object") ?? item;
  const status = getStringRecordValue(object, "status");

  return {
    kicker: status ? formatOutcomeLabel(status) : options.fallbackKicker,
    title:
      getFirstStringRecordValue(object, options.titleKeys) ??
      getStringRecordValue(item, "id") ??
      options.fallbackTitle,
    detail:
      getFirstStringRecordValue(object, options.detailKeys) ??
      describeOpaqueOutcomeRecord(item, index),
    meta: formatOutcomeRecordMeta(object, options.metaKeys)
  };
}

function getFirstStringRecordValue(record: unknown, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = getStringRecordValue(record, key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function formatOutcomeRecordMeta(record: unknown, keys: readonly string[]): string | undefined {
  const parts = keys
    .map((key) => {
      const value = getStringRecordValue(record, key);

      return value ? `${formatOutcomeLabel(key)}: ${value}` : undefined;
    })
    .filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function formatOutcomeLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function describeOpaqueOutcomeRecord(item: unknown, index: number): string {
  if (typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }

  return `Record ${index + 1} is available in the raw outcome material.`;
}

function describeOutcomeCount(count: number, singular: string, plural: string): string {
  if (count === 0) {
    return `No ${plural} returned`;
  }

  return `${count} ${count === 1 ? singular : plural} returned`;
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

function RunProcessProposals({ runId, sessionId }: { runId: string; sessionId?: string }) {
  const { client } = useDaemonRuntime();
  const processProposalQuery = useQuery({
    queryKey: ["run-process-proposals", runId],
    queryFn: () => client.getRunProcessProposals(runId)
  });
  const processStateQuery = useQuery({
    queryKey: ["run-process-proposal-states", sessionId],
    queryFn: () => client.getProcessProposalStates(sessionId ?? ""),
    enabled: Boolean(sessionId)
  });
  const proposals = asArray(processProposalQuery.data?.proposals);
  const recordedProposalIds = getRecordedProcessProposalIds(
    asArray(processStateQuery.data?.proposalStates)
  );
  const suggestionBasisEventIds = getStringArray(
    getRecordValue(getRecordValue(processProposalQuery.data, "metadata"), "eventIds")
  );
  const executionPolicy = getRecordValue(processProposalQuery.data, "executionPolicy");
  const executionReadiness = asArray(
    getRecordValue(processProposalQuery.data, "executionReadiness")
  );
  const readyCount = executionReadiness.filter(
    (readiness) => getStringRecordValue(readiness, "status") === "ready"
  ).length;

  return (
    <DataPanel
      title="Process proposals"
      description="Adaptive primitive suggestions from daemon run state and ledger events. Recording a suggestion appends proposal material only."
    >
      <QueryState query={processProposalQuery}>
        <KeyValueGrid
          items={[
            {
              label: "Run id",
              value: processProposalQuery.data?.runId ?? runId
            },
            {
              label: "Session id",
              value: processProposalQuery.data?.sessionId ?? "None"
            },
            {
              label: "Suggested primitives",
              value: proposals.length
            },
            {
              label: "Execution policy",
              value:
                getRecordValue(executionPolicy, "automaticExecution") === false
                  ? "Explicit only"
                  : "Not reported"
            },
            {
              label: "Ready ledger proposals",
              value: readyCount
            },
            {
              label: "Suggestion event range",
              value: formatEventRange(
                getRecordValue(getRecordValue(processProposalQuery.data, "metadata"), "eventRange")
              )
            }
          ]}
        />
        <ProcessProposalList
          proposals={proposals}
          renderActions={(proposal) =>
            sessionId ? (
              <RecordProcessSuggestionAction
                runId={runId}
                sessionId={sessionId}
                proposal={proposal}
                basedOnEventIds={suggestionBasisEventIds}
                recorded={recordedProposalIds.has(getProcessProposalKey(proposal, 0))}
              />
            ) : null
          }
        />
        <ProcessProposalObservations
          observations={asArray(processProposalQuery.data?.observations)}
        />
      </QueryState>
    </DataPanel>
  );
}

function RunProcessGovernance({
  runId,
  sessionId
}: {
  runId: string;
  sessionId: string;
}) {
  const { client } = useDaemonRuntime();
  const processStateQuery = useQuery({
    queryKey: ["run-process-proposal-states", sessionId],
    queryFn: () => client.getProcessProposalStates(sessionId)
  });
  const processProposalQuery = useQuery({
    queryKey: ["run-process-proposals", runId],
    queryFn: () => client.getRunProcessProposals(runId)
  });
  const states = asArray(processStateQuery.data?.proposalStates);
  const executionReadinessByEventId = getProcessProposalExecutionReadinessByEventId(
    asArray(getRecordValue(processProposalQuery.data, "executionReadiness"))
  );
  const readyCount = [...executionReadinessByEventId.values()].filter(
    (readiness) => getStringRecordValue(readiness, "status") === "ready"
  ).length;

  return (
    <DataPanel
      title="Process governance ledger"
      description="Projected lifecycle state and daemon execution readiness for recorded process proposals. Lifecycle events do not auto-execute primitives."
    >
      <QueryState query={processStateQuery}>
        <KeyValueGrid
          items={[
            {
              label: "Session id",
              value: sessionId
            },
            {
              label: "Ledger proposals",
              value: states.length
            },
            {
              label: "Ready for explicit execution",
              value: readyCount
            },
            {
              label: "Projection event range",
              value: formatEventRange(
                getRecordValue(getRecordValue(processStateQuery.data, "projection"), "eventRange")
              )
            }
          ]}
        />
        <ProcessProposalStateList
          runId={runId}
          sessionId={sessionId}
          states={states}
          executionReadinessByEventId={executionReadinessByEventId}
        />
        <ProjectionMetadata projection={processStateQuery.data?.projection} />
      </QueryState>
    </DataPanel>
  );
}

function ProcessProposalList({
  proposals,
  renderActions
}: {
  proposals: unknown[];
  renderActions?: (proposal: unknown) => ReactNode;
}) {
  if (proposals.length === 0) {
    return (
      <EmptyState
        title="No process proposals"
        description="The daemon did not detect a next primitive suggestion for this run state."
      />
    );
  }

  return (
    <div className="du-readable-list">
      {proposals.map((proposal, index) => (
        <ProcessProposalRecord
          key={getProcessProposalKey(proposal, index)}
          proposal={proposal}
          actions={renderActions?.(proposal)}
        />
      ))}
    </div>
  );
}

function ProcessProposalRecord({
  proposal,
  actions
}: {
  proposal: unknown;
  actions?: ReactNode;
}) {
  const primitive = getStringRecordValue(proposal, "primitive") ?? "Unknown primitive";
  const targetIds = asArray(getRecordValue(proposal, "targetIds"));
  const requestedBudget = getRecordValue(proposal, "requestedBudget");

  return (
    <article className="du-readable-item">
      <p className="du-kicker">Process proposal</p>
      <h4>{primitive}</h4>
      <KeyValueGrid
        items={[
          {
            label: "Proposal id",
            value: formatRecordValue(getRecordValue(proposal, "id"))
          },
          {
            label: "Status",
            value: formatRecordValue(getRecordValue(proposal, "status"))
          },
          {
            label: "Targets",
            value: formatEventIds(targetIds)
          }
        ]}
      />
      <KeyValueGrid
        items={[
          {
            label: "Expected gain",
            value: formatRecordValue(getRecordValue(proposal, "expectedQualityGain"))
          },
          {
            label: "Risk if skipped",
            value: formatRecordValue(getRecordValue(proposal, "riskIfSkipped"))
          }
        ]}
      />
      <KeyValueGrid
        items={[
          {
            label: "Max events",
            value: formatRecordValue(getRecordValue(requestedBudget, "maxEvents"))
          },
          {
            label: "Max provider calls",
            value: formatRecordValue(getRecordValue(requestedBudget, "maxProviderCalls"))
          }
        ]}
      />
      {actions ? <div className="du-process-actions">{actions}</div> : null}
    </article>
  );
}

function RecordProcessSuggestionAction({
  runId,
  sessionId,
  proposal,
  basedOnEventIds,
  recorded
}: {
  runId: string;
  sessionId: string;
  proposal: unknown;
  basedOnEventIds: string[];
  recorded: boolean;
}) {
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const recordMutation = useMutation({
    mutationFn: () =>
      client.proposeProcessProposal(sessionId, {
        authorId: DEFAULT_PROCESS_AUTHOR_ID,
        proposal: cloneJsonObject(proposal),
        basedOnEventIds
      }),
    onSuccess: async () => {
      await invalidateRunWorkspaceQueries(queryClient, runId, sessionId);
    }
  });

  return (
    <>
      <button
        type="button"
        onClick={() => recordMutation.mutate()}
        disabled={recorded || recordMutation.isPending}
      >
        {recorded
          ? "Recorded in ledger"
          : recordMutation.isPending
            ? "Recording"
            : "Record proposal in ledger"}
      </button>
      {recordMutation.data ? (
        <StatusBanner
          tone="ok"
          title="Process proposal recorded"
          detail="The daemon appended process proposal material only; no primitive was executed."
        />
      ) : null}
      {recordMutation.isError ? (
        <StatusBanner
          tone="error"
          title="Process proposal was not recorded"
          detail={formatSafeErrorMessage(recordMutation.error)}
        />
      ) : null}
    </>
  );
}

function ProcessProposalStateList({
  runId,
  sessionId,
  states,
  executionReadinessByEventId
}: {
  runId: string;
  sessionId: string;
  states: unknown[];
  executionReadinessByEventId: Map<string, unknown>;
}) {
  if (states.length === 0) {
    return (
      <EmptyState
        title="No recorded process proposals"
        description="Record a run suggestion to create a challengeable process proposal event."
      />
    );
  }

  return (
    <div className="du-readable-list">
      {states.map((state, index) => (
        <ProcessProposalStateRecord
          key={getProcessProposalStateKey(state, index)}
          runId={runId}
          sessionId={sessionId}
          state={state}
          executionReadinessByEventId={executionReadinessByEventId}
        />
      ))}
    </div>
  );
}

function ProcessProposalStateRecord({
  runId,
  sessionId,
  state,
  executionReadinessByEventId
}: {
  runId: string;
  sessionId: string;
  state: unknown;
  executionReadinessByEventId: Map<string, unknown>;
}) {
  const proposal = getRecordValue(state, "proposal") ?? {};
  const primitive = getStringRecordValue(proposal, "primitive") ?? "Unknown primitive";
  const proposalEventId = getStringRecordValue(state, "proposalEventId");
  const latestStatus = getStringRecordValue(state, "latestStatus") ?? "unknown";
  const challengeEventIds = asArray(getRecordValue(state, "challengeEventIds"));
  const decisionEventIds = asArray(getRecordValue(state, "decisionEventIds"));
  const executionReadiness = proposalEventId
    ? executionReadinessByEventId.get(proposalEventId)
    : undefined;
  const executionReadinessStatus =
    getStringRecordValue(executionReadiness, "status") ?? "not reported";

  return (
    <article className="du-readable-item">
      <p className="du-kicker">Recorded process proposal</p>
      <h4>{primitive}</h4>
      <KeyValueGrid
        items={[
          {
            label: "Proposal event",
            value: formatRecordValue(proposalEventId)
          },
          {
            label: "Proposal id",
            value: formatRecordValue(getRecordValue(state, "proposalId"))
          },
          {
            label: "Latest status",
            value: latestStatus
          },
          {
            label: "Execution readiness",
            value: executionReadinessStatus
          },
          {
            label: "Challenges",
            value: challengeEventIds.length
          },
          {
            label: "Decisions",
            value: decisionEventIds.length
          },
          {
            label: "Targets",
            value: formatEventIds(asArray(getRecordValue(proposal, "targetIds")))
          }
        ]}
      />
      {proposalEventId ? (
        <ProcessProposalLifecycleControls
          runId={runId}
          sessionId={sessionId}
          proposalEventId={proposalEventId}
          latestStatus={latestStatus}
          executionReadiness={executionReadiness}
        />
      ) : (
        <StatusBanner
          tone="warning"
          title="Lifecycle actions unavailable"
          detail="The daemon projection did not include a proposal event id for this state."
        />
      )}
    </article>
  );
}

function ProcessProposalLifecycleControls({
  runId,
  sessionId,
  proposalEventId,
  latestStatus,
  executionReadiness
}: {
  runId: string;
  sessionId: string;
  proposalEventId: string;
  latestStatus: string;
  executionReadiness?: unknown;
}) {
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const [challengeReason, setChallengeReason] = useState("");
  const [decisionStatus, setDecisionStatus] = useState<ProcessDecisionStatus>("accepted");
  const [decisionRationale, setDecisionRationale] = useState("");
  const challengeMutation = useMutation({
    mutationFn: () =>
      client.challengeProcessProposal(sessionId, proposalEventId, {
        authorId: DEFAULT_PROCESS_REVIEWER_ID,
        reason: challengeReason.trim()
      }),
    onSuccess: async () => {
      setChallengeReason("");
      await invalidateRunWorkspaceQueries(queryClient, runId, sessionId);
    }
  });
  const decisionMutation = useMutation({
    mutationFn: () =>
      client.decideProcessProposal(sessionId, proposalEventId, {
        authorId: DEFAULT_PROCESS_COORDINATOR_ID,
        status: decisionStatus,
        rationale: decisionRationale.trim()
      }),
    onSuccess: async () => {
      setDecisionRationale("");
      await invalidateRunWorkspaceQueries(queryClient, runId, sessionId);
    }
  });
  const executionMutation = useMutation({
    mutationFn: () => client.executeRunProcessProposal(runId, proposalEventId),
    onSuccess: async () => {
      await invalidateRunWorkspaceQueries(queryClient, runId, sessionId);
    }
  });
  const readinessStatus = getStringRecordValue(executionReadiness, "status");
  const readinessReason = getStringRecordValue(executionReadiness, "reason");
  const startRequestPreview = getRecordValue(executionReadiness, "startRequestPreview");
  const canExecute =
    latestStatus === "accepted" && (readinessStatus === undefined || readinessStatus === "ready");

  function submitChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (challengeReason.trim().length === 0) {
      return;
    }

    challengeMutation.mutate();
  }

  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (decisionRationale.trim().length === 0) {
      return;
    }

    decisionMutation.mutate();
  }

  return (
    <div className="du-lifecycle-grid">
      <form className="du-lifecycle-form" onSubmit={submitChallenge}>
        <label htmlFor={`challenge-${proposalEventId}`}>Challenge reason</label>
        <input
          id={`challenge-${proposalEventId}`}
          value={challengeReason}
          onChange={(event) => setChallengeReason(event.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={challengeReason.trim().length === 0 || challengeMutation.isPending}
        >
          {challengeMutation.isPending ? "Recording challenge" : "Record challenge"}
        </button>
        {challengeMutation.data ? (
          <StatusBanner
            tone="ok"
            title="Challenge recorded"
            detail="The challenge was appended as process lifecycle material."
          />
        ) : null}
        {challengeMutation.isError ? (
          <StatusBanner
            tone="error"
            title="Challenge was not recorded"
            detail={formatSafeErrorMessage(challengeMutation.error)}
          />
        ) : null}
      </form>
      <form className="du-lifecycle-form" onSubmit={submitDecision}>
        <label htmlFor={`decision-status-${proposalEventId}`}>Decision status</label>
        <select
          id={`decision-status-${proposalEventId}`}
          value={decisionStatus}
          onChange={(event) => setDecisionStatus(event.currentTarget.value as ProcessDecisionStatus)}
        >
          <option value="accepted">accepted</option>
          <option value="deferred">deferred</option>
          <option value="rejected">rejected</option>
        </select>
        <label htmlFor={`decision-rationale-${proposalEventId}`}>Decision rationale</label>
        <input
          id={`decision-rationale-${proposalEventId}`}
          value={decisionRationale}
          onChange={(event) => setDecisionRationale(event.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={decisionRationale.trim().length === 0 || decisionMutation.isPending}
        >
          {decisionMutation.isPending ? "Recording decision" : "Record decision"}
        </button>
        {decisionMutation.data ? (
          <StatusBanner
            tone="ok"
            title="Decision recorded"
            detail="The decision updated process state only; no primitive was executed."
          />
        ) : null}
        {decisionMutation.isError ? (
          <StatusBanner
            tone="error"
            title="Decision was not recorded"
            detail={formatSafeErrorMessage(decisionMutation.error)}
          />
        ) : null}
      </form>
      <div className="du-lifecycle-form">
        <p className="du-kicker">Execution</p>
        <button
          type="button"
          onClick={() => executionMutation.mutate()}
          disabled={!canExecute || executionMutation.isPending}
        >
          {executionMutation.isPending
            ? "Executing accepted process proposal"
            : "Execute accepted process proposal"}
        </button>
        {!canExecute ? (
          <StatusBanner
            tone="warning"
            title="Execution unavailable"
            detail={
              latestStatus !== "accepted"
                ? `Latest status is ${latestStatus}; the daemon only executes accepted process proposals.`
                : readinessReason ?? "The daemon did not report this proposal as executable."
            }
          />
        ) : (
          <>
            <StatusBanner
              title="Explicit execution"
              detail={
                readinessReason ??
                "Execution uses the daemon run start path for supported primitives; unsupported primitives return a safe error."
              }
            />
            {startRequestPreview ? (
              <JsonBlock value={sanitizeForDisplay(startRequestPreview)} />
            ) : null}
          </>
        )}
        {executionMutation.data ? <StartResult result={executionMutation.data} /> : null}
        {executionMutation.isError ? (
          <StatusBanner
            tone="error"
            title="Process proposal was not executed"
            detail={formatSafeErrorMessage(executionMutation.error)}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProcessProposalObservations({ observations }: { observations: unknown[] }) {
  const readableObservations = observations.filter(
    (observation): observation is string => typeof observation === "string"
  );

  if (readableObservations.length === 0) {
    return null;
  }

  return (
    <div className="du-readable-list">
      <h4>Suggestion observations</h4>
      {readableObservations.map((observation, index) => (
        <article className="du-readable-item" key={`${index}:${observation}`}>
          <p className="du-kicker">Observation {index + 1}</p>
          <p>{observation}</p>
        </article>
      ))}
    </div>
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
    payload: sanitizeForDisplay(getRecordValue(event, "payload")),
    basedOnEventIds: asArray(getRecordValue(event, "basedOnEventIds")),
    trace: sanitizeForDisplay(getRecordValue(event, "trace") ?? {})
  };
}

function mergeRunEvents(...eventGroups: unknown[][]): unknown[] {
  const eventsByKey = new Map<string, unknown>();

  for (const event of eventGroups.flat()) {
    eventsByKey.set(getRunEventMergeKey(event, eventsByKey.size), event);
  }

  return [...eventsByKey.values()].sort(compareRunEvents);
}

function getRunEventMergeKey(event: unknown, fallback: number): string {
  const id = getRecordValue(event, "id");

  if (typeof id === "string" && id.length > 0) {
    return `id:${id}`;
  }

  return `fallback:${fallback}`;
}

function compareRunEvents(left: unknown, right: unknown): number {
  const leftSequence = getRecordValue(left, "sequence");
  const rightSequence = getRecordValue(right, "sequence");

  if (typeof leftSequence === "number" && typeof rightSequence === "number") {
    return leftSequence - rightSequence;
  }

  return 0;
}

function parseStreamedRunEvent(data: string):
  | {
      ok: true;
      event: unknown;
    }
  | {
      ok: false;
      message: string;
    } {
  try {
    return {
      ok: true,
      event: JSON.parse(data) as unknown
    };
  } catch {
    return {
      ok: false,
      message: "Live run event follow returned invalid JSON."
    };
  }
}

function describeRunFollowTitle(status: RunFollowStatus): string {
  if (status === "connecting") {
    return "Live follow connecting";
  }

  if (status === "connected") {
    return "Live follow connected";
  }

  if (status === "error") {
    return "Live follow interrupted";
  }

  if (status === "unsupported") {
    return "Live follow unavailable";
  }

  return "Live follow idle";
}

function describeRunFollowValue(status: RunFollowStatus): string {
  if (status === "connected") {
    return "Connected";
  }

  if (status === "connecting") {
    return "Connecting";
  }

  if (status === "error") {
    return "Interrupted";
  }

  if (status === "unsupported") {
    return "Unavailable";
  }

  return "Stopped";
}

function describeRunFollowTone(status: RunFollowStatus): "neutral" | "ok" | "warning" | "error" {
  if (status === "connected") {
    return "ok";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "unsupported") {
    return "warning";
  }

  return "neutral";
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

function getStringArray(value: unknown): string[] {
  return asArray(value).filter((entry): entry is string => typeof entry === "string");
}

function countRecordsWithoutStatus(records: unknown[], settledStatus: string): number {
  return records.filter((record) => {
    const object = getRecordValue(record, "object") ?? record;

    return getRecordValue(object, "status") !== settledStatus;
  }).length;
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

function getRecordedProcessProposalIds(states: unknown[]): Set<string> {
  return new Set(
    states
      .map((state) => {
        const proposal = getRecordValue(state, "proposal");

        return (
          getStringRecordValue(state, "proposalId") ??
          getStringRecordValue(proposal, "id")
        );
      })
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
}

function getProcessProposalExecutionReadinessByEventId(
  readinessRecords: unknown[]
): Map<string, unknown> {
  const readinessByEventId = new Map<string, unknown>();

  for (const readiness of readinessRecords) {
    const proposalEventId = getStringRecordValue(readiness, "proposalEventId");

    if (proposalEventId) {
      readinessByEventId.set(proposalEventId, readiness);
    }
  }

  return readinessByEventId;
}

function getProjectionRecordKey(record: unknown, fallback: number): string {
  const object = getRecordValue(record, "object") ?? record;
  const id = getRecordValue(object, "id");

  return typeof id === "string" && id.length > 0 ? id : `projection-record-${fallback}`;
}

function getProcessProposalKey(proposal: unknown, fallback: number): string {
  const id = getRecordValue(proposal, "id");

  return typeof id === "string" && id.length > 0 ? id : `process-proposal-${fallback}`;
}

function getProcessProposalStateKey(state: unknown, fallback: number): string {
  return (
    getStringRecordValue(state, "proposalEventId") ??
    getStringRecordValue(state, "proposalId") ??
    `process-proposal-state-${fallback}`
  );
}

function getRunItemKey(run: unknown, fallback: number): string {
  return getStringRecordValue(run, "runId") ?? `run-${fallback}`;
}

function useRunParams(): { runId: string } {
  return useParams({
    strict: false
  }) as { runId: string };
}
