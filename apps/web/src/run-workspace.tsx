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
  AdvancedDetails,
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
  LOCAL_PRESET_DISCUSSION_BRIEF,
  LOCAL_PRESET_RUN_PLAN,
  LOCAL_PRESET_START_REQUEST,
  buildGuidedDiscussionRunPlan,
  formatPresetJson
} from "./run-presets";

const DEFAULT_RUN_PLAN_TEXT = formatPresetJson(LOCAL_PRESET_RUN_PLAN);
const DEFAULT_START_REQUEST_TEXT = formatPresetJson(LOCAL_PRESET_START_REQUEST);
const DEFAULT_PROCESS_AUTHOR_ID = "system";
const DEFAULT_PROCESS_REVIEWER_ID = "process-reviewer";
const DEFAULT_PROCESS_COORDINATOR_ID = "process-coordinator";
type RunFollowStatus = "idle" | "connecting" | "connected" | "error" | "unsupported";
type ProcessDecisionStatus = "accepted" | "deferred" | "rejected";
type DiscussionContinuationView = {
  title: string;
  description: string;
  explainerTitle: string;
  explainerDetail: string;
  primaryLabel: string;
  reviewReady: boolean;
};
type DiscussionStageStatus = [label: string, status: unknown];

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
        eyebrow="User Mode"
        title="Discussions"
        description="Start or continue a deliberation in plain language, then inspect the current conclusion, perspectives, disagreements, evidence gaps, and next actions."
        actions={
          <Link className="du-action-link" to="/runs/new">
            Start a discussion
          </Link>
        }
      >
        <RunConceptPanel />
        <QueryState query={runsQuery}>
          <DataPanel title="Existing discussions">
            {runs.length === 0 ? (
              <EmptyState
                title="No discussions yet"
                description="Start with a question. Deliberum will create a discussion brief, collect independent first responses, and keep the conclusion, disagreements, risks, and next steps visible."
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
  const [discussionQuestion, setDiscussionQuestion] = useState("");
  const [discussionGoals, setDiscussionGoals] = useState("");
  const [discussionConstraints, setDiscussionConstraints] = useState("");
  const [discussionExpectedOutcome, setDiscussionExpectedOutcome] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (runPlan: Record<string, unknown>) => client.createRun({ runPlan })
  });
  const createdRunId = getStringRecordValue(createMutation.data?.run, "runId");
  const createdSessionId =
    getStringRecordValue(createMutation.data?.session, "sessionId") ??
    getStringRecordValue(createMutation.data?.run, "sessionId");
  const canCreateDiscussion =
    discussionQuestion.trim().length > 0 && !createMutation.isPending;

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

  function fillSampleDiscussionBrief() {
    setInputError(null);
    setDiscussionQuestion(LOCAL_PRESET_DISCUSSION_BRIEF.question);
    setDiscussionGoals(LOCAL_PRESET_DISCUSSION_BRIEF.goalsText);
    setDiscussionConstraints(LOCAL_PRESET_DISCUSSION_BRIEF.constraintsText);
    setDiscussionExpectedOutcome(LOCAL_PRESET_DISCUSSION_BRIEF.expectedOutcomeText);
  }

  function submitGuidedDiscussion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (discussionQuestion.trim().length === 0) {
      setInputError("Discussion question is required.");
      return;
    }

    const runPlan = buildGuidedDiscussionRunPlan({
      question: discussionQuestion,
      goalsText: discussionGoals,
      constraintsText: discussionConstraints,
      expectedOutcomeText: discussionExpectedOutcome
    });

    setInputError(null);
    setRunPlanText(formatPresetJson(runPlan));
    createMutation.mutate(runPlan);
  }

  return (
    <RunWorkspaceShell>
      <ViewFrame
        eyebrow="User Mode"
        title="Start a discussion"
        description="Create a discussion that keeps the brief, independent first responses, strongest options, disagreements, requirements, evidence and verification, risk review, and current conclusion visible."
      >
        <StatusBanner
          title="Start from a question"
          detail="Write a brief in plain language or use the sample brief to try the full discussion flow immediately."
        />
        <DataPanel
          title="Discussion brief"
          description="Describe what you need to decide or clarify. Deliberum will structure the discussion so the conclusion, disagreements, risks, evidence gaps, and next actions stay visible."
        >
          <form className="du-discussion-form" onSubmit={submitGuidedDiscussion}>
            <label htmlFor="discussion-question">Discussion question</label>
            <textarea
              id="discussion-question"
              value={discussionQuestion}
              onChange={(event) => setDiscussionQuestion(event.currentTarget.value)}
              placeholder="What should we decide, compare, or clarify?"
            />
            <div className="du-discussion-form-grid">
              <div>
                <label htmlFor="discussion-goals">Goals</label>
                <textarea
                  id="discussion-goals"
                  value={discussionGoals}
                  onChange={(event) => setDiscussionGoals(event.currentTarget.value)}
                  placeholder="One goal per line"
                />
              </div>
              <div>
                <label htmlFor="discussion-constraints">Constraints</label>
                <textarea
                  id="discussion-constraints"
                  value={discussionConstraints}
                  onChange={(event) => setDiscussionConstraints(event.currentTarget.value)}
                  placeholder="One constraint per line"
                />
              </div>
            </div>
            <label htmlFor="discussion-expected-outcome">Expected conclusion</label>
            <textarea
              id="discussion-expected-outcome"
              value={discussionExpectedOutcome}
              onChange={(event) => setDiscussionExpectedOutcome(event.currentTarget.value)}
              placeholder="What should the current conclusion include?"
            />
            <div className="du-readable-list">
              <ExplainerItem
                title="Works without setup"
                detail="The sample brief uses built-in discussion material so a first-time user can review the flow immediately."
              />
              <ExplainerItem
                title="Complete discussion loop"
                detail="It creates a discussion brief, independent first responses, strongest options, disagreements, requirements, evidence needs, risk review, and current conclusion."
              />
            </div>
            <div className="du-action-row">
              <button type="submit" disabled={!canCreateDiscussion}>
                {createMutation.isPending ? "Creating discussion" : "Create discussion"}
              </button>
              <button
                type="button"
                className="du-secondary-button"
                onClick={fillSampleDiscussionBrief}
                disabled={createMutation.isPending}
              >
                Use sample brief
              </button>
            </div>
          </form>
        </DataPanel>
        <AdvancedDetails
          summary="Advanced / Developer Mode"
          description="Create a run from a raw JSON plan when testing low-level runtime behavior."
          lazy
        >
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
        </AdvancedDetails>
        {inputError ? <StatusBanner tone="error" title={inputError} /> : null}
        {createMutation.isError ? (
          <StatusBanner
            tone="error"
            title="Discussion could not be created"
            detail={formatSafeErrorMessage(createMutation.error)}
          />
        ) : null}
        {createdRunId ? (
          <StatusBanner
            tone="ok"
            title="Discussion created"
            detail="Continue the guided discussion to collect perspectives, surface disagreements, and produce a reviewable conclusion."
          />
        ) : null}
        {createdRunId ? (
          <div className="du-action-row">
            <Link className="du-action-link" to="/runs/$runId" params={{ runId: createdRunId }}>
              Continue guided discussion
            </Link>
            <Link
              className="du-action-link du-secondary-link"
              to="/runs/$runId/outcome"
              params={{ runId: createdRunId }}
            >
              View current conclusion
            </Link>
            {createdSessionId ? (
              <Link
                className="du-action-link du-secondary-link"
                to="/sessions/$sessionId"
                params={{ sessionId: createdSessionId }}
              >
                Review discussion brief
              </Link>
            ) : null}
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
        eyebrow="User Mode"
        title={formatRunDisplayTitle(run)}
        description="Review the discussion status, main perspectives, open disagreements, requirements, evidence gaps, and next recommended actions."
        actions={
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            View current conclusion
          </Link>
        }
      >
        <QueryState query={runQuery}>
          <RunSummary run={run} />
          {sessionId ? (
            <RunQualityOverview runId={runId} sessionId={sessionId} run={run} />
          ) : null}
          <RunDetailGuide />
          <RunStageStatus run={run} />
          <StartRunForm runId={runId} sessionId={sessionId} run={run} />
          {sessionId ? <RunProjectionPanels sessionId={sessionId} /> : null}
          <AdvancedDetails
            summary="Advanced / Developer Mode"
            description="Adaptive primitive suggestions, process proposal lifecycle, explicit execution readiness, and internal proposal ids for developer inspection."
            lazy
          >
            <RunProcessProposals runId={runId} sessionId={sessionId} />
            {sessionId ? <RunProcessGovernance runId={runId} sessionId={sessionId} /> : null}
          </AdvancedDetails>
          <AdvancedDetails
            summary="Advanced / Developer Mode"
            description="Ledger trace, run plan, round metadata, and internal ids for developer inspection."
            lazy
          >
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
          </AdvancedDetails>
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
  const outcomeSessionId = getStringRecordValue(outcome, "sessionId");
  const compiledOutcome = outcome?.status === "compiled" ? outcome.outcome : undefined;
  const provenance = getRecordValue(compiledOutcome, "provenance");
  const conclusionStatus = describeRunOutcomeReviewStatus(
    outcome?.status === "compiled" ? outcome.draftStatus : undefined
  );
  const finalCandidateProposalEventId = getStringRecordValue(
    provenance,
    "finalCandidateProposalEventId"
  );
  const contextQueries = useOutcomeContextQueries(outcomeSessionId);
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
        eyebrow="User Mode"
        title="Current conclusion"
        description="Review the current conclusion together with main perspectives, open disagreements, missing evidence, risks, and next actions."
        actions={
          <Link className="du-action-link" to="/runs/$runId" params={{ runId }}>
            Back to discussion
          </Link>
        }
      >
        <QueryState query={outcomeQuery}>
          {outcome?.status === "compiled" ? (
            <>
              <StatusBanner
                tone={conclusionStatus.tone}
                title={conclusionStatus.title}
                detail={conclusionStatus.detail}
              />
              <DataPanel
                title="Current conclusion"
                description="A readable summary of the current result. Advanced details keep the underlying technical response for developers."
              >
                <OutcomeBrief outcome={outcome.outcome} context={contextQueries.context} />
              </DataPanel>
              <AdvancedDetails
                description="Projection override, internal ids, draft status, and raw outcome material for developer inspection."
                lazy
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
                <DataPanel title="Raw outcome material">
                  <JsonBlock value={sanitizeForDisplay(outcome.outcome)} />
                </DataPanel>
              </AdvancedDetails>
            </>
          ) : (
            <>
              <StatusBanner
                tone="warning"
                title="Current conclusion not available"
                detail={describeOutcomeUnavailableReason(getRecordValue(outcome, "reason"))}
              />
              <AdvancedOutcomeUnavailableDetails
                outcome={outcome}
                fallbackRunId={runId}
              />
            </>
          )}
        </QueryState>
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

function AdvancedOutcomeUnavailableDetails({
  outcome,
  fallbackRunId
}: {
  outcome: unknown;
  fallbackRunId: string;
}) {
  return (
    <AdvancedDetails
      summary="Advanced / Developer Mode"
      description="Raw unavailable status, internal ids, reason code, and daemon response for developer inspection."
      lazy
    >
      <KeyValueGrid
        items={[
          {
            label: "Run id",
            value: formatRecordValue(getRecordValue(outcome, "runId") ?? fallbackRunId)
          },
          {
            label: "Session id",
            value: formatRecordValue(getRecordValue(outcome, "sessionId"))
          },
          {
            label: "Raw status",
            value: formatRecordValue(getRecordValue(outcome, "status"))
          },
          {
            label: "Raw reason",
            value: formatRecordValue(getRecordValue(outcome, "reason"))
          }
        ]}
      />
      <DataPanel title="Raw unavailable outcome">
        <JsonBlock value={sanitizeForDisplay(outcome ?? {})} />
      </DataPanel>
    </AdvancedDetails>
  );
}

function RunWorkspaceShell({
  runId,
  children
}: {
  runId?: string;
  children: ReactNode;
}) {
  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel="User Mode"
      navigation={<RunNavigation runId={runId} />}
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
        Discussions
      </Link>
      <Link
        to="/runs/new"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        Start discussion
      </Link>
      {runId ? (
        <Link
          to="/runs/$runId"
          params={{ runId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          Discussion
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
          Current conclusion
        </Link>
      ) : null}
    </>
  );
}

function RunConceptPanel() {
  return (
    <DataPanel
      title="How discussions work"
      description="The default mode explains the deliberation loop in user language."
    >
      <div className="du-explainer-grid">
        <ExplainerItem
          title="Discussion brief"
          detail="The topic, goals, constraints, participants, and output expectations before anyone contributes."
        />
        <ExplainerItem
          title="Independent first responses"
          detail="Early work is kept separate so one visible answer does not anchor the discussion."
        />
        <ExplainerItem
          title="Strongest current options"
          detail="Main perspectives stay visible as options, without a hidden authority choosing for the user."
        />
        <ExplainerItem
          title="Current conclusion"
          detail="A reviewable outcome with open disagreements, risks, missing evidence, and next steps."
        />
      </div>
    </DataPanel>
  );
}

function RunDetailGuide() {
  return (
    <DataPanel title="What this discussion status means">
      <div className="du-explainer-grid">
        <ExplainerItem
          title="Created"
          detail="The discussion exists, but the deliberation steps have not started yet."
        />
        <ExplainerItem
          title="Not run yet"
          detail="No work has been recorded for that part of the discussion."
        />
        <ExplainerItem
          title="Setup needed"
          detail="This discussion cannot continue until the required setup is available. Setup details stay in Advanced mode."
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

function formatRunDisplayTitle(run: unknown, index?: number): string {
  const topic = getStringRecordValue(run, "topic");
  const title = getStringRecordValue(run, "title");

  if (topic) {
    return topic;
  }

  if (title && !isTechnicalRunTitle(title)) {
    return title;
  }

  return typeof index === "number" ? `Discussion ${index + 1}` : "Discussion";
}

function formatRunDisplaySummary(run: unknown): string {
  const topic = getStringRecordValue(run, "topic");
  const title = getStringRecordValue(run, "title");

  if (title && title !== topic && !isTechnicalRunTitle(title)) {
    return title;
  }

  return "Review the status, perspectives, disagreements, evidence, conclusion, and next actions.";
}

function isTechnicalRunTitle(value: string): boolean {
  return /^run\s+[a-z0-9_-]+$/i.test(value.trim());
}

function RunListItem({ run, index }: { run: unknown; index: number }) {
  const runId = getStringRecordValue(run, "runId");

  return (
    <article className="du-run-list-item">
      <div>
        <p className="du-kicker">Discussion {index + 1}</p>
        <h3>{formatRunDisplayTitle(run, index)}</h3>
        <p>{formatRunDisplaySummary(run)}</p>
      </div>
      <KeyValueGrid
        items={[
          {
            label: "Discussion status",
            value: describeDiscussionStatus(run)
          },
          {
            label: "Updated",
            value: formatRecordValue(getRecordValue(run, "updatedAt"))
          }
        ]}
      />
      <StageStatusList stages={getDiscussionStageStatuses(run)} />
      <AdvancedDetails summary="Advanced / Developer Mode" lazy>
        <KeyValueGrid
          items={[
            {
              label: "Run id",
              value: runId ?? "None"
            },
            {
              label: "Session id",
              value: formatRecordValue(getRecordValue(run, "sessionId"))
            },
            {
              label: "Ledger events",
              value: describeLedgerEvents(
                getRecordValue(getRecordValue(run, "ledger"), "eventCount")
              )
            }
          ]}
        />
      </AdvancedDetails>
      {runId ? (
        <div className="du-action-row">
          <Link className="du-action-link" to="/runs/$runId" params={{ runId }}>
            Open discussion
          </Link>
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            Current conclusion
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function RunSummary({ run }: { run: unknown }) {
  return (
    <DataPanel
      title="Discussion status"
      description="A user-facing summary of where the discussion currently stands."
    >
      <KeyValueGrid
        items={[
          {
            label: "Discussion status",
            value: describeDiscussionStatus(run)
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
      <AdvancedDetails summary="Advanced / Developer Mode" lazy>
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
              label: "Ledger events",
              value: describeLedgerEvents(
                getRecordValue(getRecordValue(run, "ledger"), "eventCount")
              )
            }
          ]}
        />
      </AdvancedDetails>
    </DataPanel>
  );
}

function RunStageStatus({ run }: { run: unknown }) {
  return (
    <DataPanel
      title="Discussion progress"
      description="Each step corresponds to a core Deliberum concept, presented in user-facing language."
    >
      <StageStatusList stages={getDiscussionStageStatuses(run)} />
    </DataPanel>
  );
}

function getDiscussionStageStatuses(run: unknown): DiscussionStageStatus[] {
  return [
    ["Independent first responses", getRecordValue(run, "sealedDivergenceStatus")],
    ["Strongest current options", getRecordValue(run, "latestExtractionStatus")],
    ["Option quality", getRecordValue(run, "latestCandidateRepairStatus")],
    ["Evidence and verification", getRecordValue(run, "latestEvidenceCheckStatus")],
    [
      "Requirements this answer must satisfy",
      getRecordValue(run, "latestProposalReviewStatus")
    ],
    ["Current conclusion", getRecordValue(run, "latestFinalizationStatus")]
  ];
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

function StartRunForm({
  runId,
  sessionId,
  run
}: {
  runId: string;
  sessionId?: string;
  run: unknown;
}) {
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const continuationView = describeDiscussionContinuation(run);
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
      title={continuationView.title}
      description={continuationView.description}
    >
      <div className="du-readable-list">
        <ExplainerItem
          title={continuationView.explainerTitle}
          detail={continuationView.explainerDetail}
        />
      </div>
      <div className="du-action-row">
        {continuationView.reviewReady ? (
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            View current conclusion
          </Link>
        ) : null}
        <button
          type="button"
          className={continuationView.reviewReady ? "du-secondary-button" : undefined}
          onClick={startLocalPresetPipeline}
          disabled={startMutation.isPending}
        >
          {continuationView.primaryLabel}
        </button>
      </div>
      <AdvancedDetails
        summary="Advanced / Developer Mode"
        description="Submit a raw start request when testing low-level runtime behavior."
        lazy
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
            </>
          }
        />
      </AdvancedDetails>
      {inputError ? <StatusBanner tone="error" title={inputError} /> : null}
      {startMutation.isError ? (
        <StatusBanner
          tone="error"
          title="Discussion could not continue"
          detail={formatRunStartErrorMessage(startMutation.error)}
        />
      ) : null}
      {startMutation.data ? <StartResult result={startMutation.data} runId={runId} /> : null}
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

function StartResult({ result, runId }: { result: unknown; runId: string }) {
  const stages = asArray(getRecordValue(result, "stages")).map(toStageMetadata);
  const stopped = getRecordValue(result, "stopped");
  const readableStages = stages.map(toReadableStageResult);

  return (
    <div className="du-start-result">
      <StatusBanner
        tone={stopped === true ? "warning" : "ok"}
        title={stopped === true ? "Discussion paused" : "Discussion steps completed"}
        detail={
          stopped === true
            ? "The discussion stopped before every requested step finished. Review the visible steps below or open Advanced details for the technical reason."
            : "The guided discussion steps were recorded. Review the updated perspectives, disagreements, requirements, and current conclusion."
        }
      />
      {stopped === true ? (
        <StatusBanner
          tone="warning"
          title="Stop reason"
          detail={formatRecordValue(getRecordValue(result, "stopReason"))}
        />
      ) : null}
      <ReadableStageResultList stages={readableStages} />
      <div className="du-action-row">
        <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
          View current conclusion
        </Link>
      </div>
      <AdvancedDetails
        summary="Advanced / Developer Mode"
        description="Raw execution stages, round ids, and event ids returned by the local runtime."
        lazy
      >
        <RecordCollection
          title="Raw stage metadata"
          records={stages}
          emptyTitle="No stages returned"
          emptyDescription="No stage metadata was returned for this request."
        />
      </AdvancedDetails>
    </div>
  );
}

type ReadableStageResult = {
  label: string;
  status: string;
  detail: string;
};

function ReadableStageResultList({ stages }: { stages: ReadableStageResult[] }) {
  if (stages.length === 0) {
    return (
      <EmptyState
        title="No visible discussion steps"
        description="No user-facing step updates were returned for this request."
      />
    );
  }

  return (
    <section className="du-readable-stage-result" aria-label="Updated discussion steps">
      <div className="du-section-label">
        <p className="du-kicker">Updated discussion steps</p>
        <h4>What changed</h4>
        <p>Readable summary of the discussion work that just ran.</p>
      </div>
      <div className="du-stage-grid">
        {stages.map((stage, index) => (
          <div className="du-stage-pill" key={`${stage.label}-${index}`}>
            <span>{stage.label}</span>
            <strong>{stage.status}</strong>
            <span>{stage.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function toReadableStageResult(stage: Record<string, unknown>): ReadableStageResult {
  const stageName = getRecordValue(stage, "stage");
  const executionStatus = getRecordValue(stage, "executionStatus");
  const roundStatus = getRecordValue(stage, "status");
  const stageCopy = describeReadableStage(stageName);

  return {
    ...stageCopy,
    status: describeReadableExecutionStatus(executionStatus, roundStatus)
  };
}

function describeReadableStage(stageName: unknown): Pick<ReadableStageResult, "label" | "detail"> {
  if (stageName === "sealed_divergence") {
    return {
      label: "Independent first responses",
      detail: "Initial perspectives were collected before any single answer could anchor the discussion."
    };
  }

  if (stageName === "extraction") {
    return {
      label: "Main perspectives",
      detail: "The discussion material was organized into options, disagreements, requirements, and evidence needs."
    };
  }

  if (stageName === "proposal_review") {
    return {
      label: "Requirements this answer must satisfy",
      detail: "Candidate material was checked against open disagreements and answer requirements."
    };
  }

  if (stageName === "evidence_check") {
    return {
      label: "Evidence and verification",
      detail: "Open evidence needs were routed to reported checks without implying verified truth."
    };
  }

  if (stageName === "candidate_repair") {
    return {
      label: "Option quality",
      detail: "Known weaknesses were used to strengthen current options before conclusion work."
    };
  }

  if (stageName === "finalization") {
    return {
      label: "Current conclusion",
      detail: "A provisional conclusion and risk review were compiled for review."
    };
  }

  return {
    label: "Discussion step",
    detail: "A discussion step was updated. Advanced details include the raw stage name."
  };
}

function describeReadableExecutionStatus(
  executionStatus: unknown,
  roundStatus: unknown
): string {
  if (executionStatus === "executed" && roundStatus === "completed") {
    return "Completed";
  }

  if (executionStatus === "executed") {
    return "Updated";
  }

  if (executionStatus === "already_running") {
    return "Already in progress";
  }

  if (typeof executionStatus === "string" && executionStatus.length > 0) {
    return humanizeIdentifier(executionStatus);
  }

  if (typeof roundStatus === "string" && roundStatus.length > 0) {
    return humanizeIdentifier(roundStatus);
  }

  return "Updated";
}

function humanizeIdentifier(value: string): string {
  return value
    .split(/[_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

type OutcomeBriefContext = {
  mainPerspectives: unknown[];
  openDisagreements: unknown[];
  missingEvidence: unknown[];
  answerRequirements: unknown[];
};

const EMPTY_OUTCOME_CONTEXT: OutcomeBriefContext = {
  mainPerspectives: [],
  openDisagreements: [],
  missingEvidence: [],
  answerRequirements: []
};

function useOutcomeContextQueries(sessionId: string | undefined): {
  context: OutcomeBriefContext;
} {
  const { client } = useDaemonRuntime();
  const enabled = Boolean(sessionId);
  const frontierQuery = useQuery({
    queryKey: ["outcome-frontier", sessionId ?? "none"],
    queryFn: () => client.getFrontier(sessionId ?? ""),
    enabled
  });
  const objectionsQuery = useQuery({
    queryKey: ["outcome-objections", sessionId ?? "none"],
    queryFn: () => client.getObjections(sessionId ?? ""),
    enabled
  });
  const obligationsQuery = useQuery({
    queryKey: ["outcome-obligations", sessionId ?? "none"],
    queryFn: () => client.getObligations(sessionId ?? ""),
    enabled
  });
  const resourcesQuery = useQuery({
    queryKey: ["outcome-resources", sessionId ?? "none"],
    queryFn: () => client.getSessionResources(sessionId ?? ""),
    enabled
  });

  return {
    context: {
      mainPerspectives: asArray(frontierQuery.data?.candidates),
      openDisagreements: asArray(objectionsQuery.data?.objections),
      missingEvidence: asArray(resourcesQuery.data?.evidenceNeeds),
      answerRequirements: asArray(obligationsQuery.data?.qualityObligations)
    }
  };
}

function RunQualityOverview({
  runId,
  sessionId,
  run
}: {
  runId: string;
  sessionId: string;
  run: unknown;
}) {
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
  const resourcesQuery = useQuery({
    queryKey: ["run-resources", sessionId],
    queryFn: () => client.getSessionResources(sessionId)
  });
  const queryState = {
    isLoading:
      frontierQuery.isLoading ||
      objectionsQuery.isLoading ||
      obligationsQuery.isLoading ||
      resourcesQuery.isLoading,
    isError:
      frontierQuery.isError ||
      objectionsQuery.isError ||
      obligationsQuery.isError ||
      resourcesQuery.isError,
    error:
      frontierQuery.error ??
      objectionsQuery.error ??
      obligationsQuery.error ??
      resourcesQuery.error ??
      null
  };
  const candidates = asArray(frontierQuery.data?.candidates);
  const objections = asArray(objectionsQuery.data?.objections);
  const obligations = asArray(obligationsQuery.data?.qualityObligations);
  const evidenceNeeds = asArray(resourcesQuery.data?.evidenceNeeds);
  const unresolvedObjections = countRecordsWithoutStatus(objections, "resolved");
  const openObligations = countRecordsWithoutStatus(obligations, "satisfied");
  const unresolvedEvidenceNeeds = evidenceNeeds.filter(isUnresolvedEvidenceNeed).length;
  const continuationView = describeDiscussionContinuation(run);
  const nextActionTitle = continuationView.reviewReady
    ? "Next: review current conclusion"
    : "Next: continue guided discussion";
  const nextActionDetail = continuationView.reviewReady
    ? "Start with the conclusion, then inspect disagreements, requirements, and missing evidence before relying on it."
    : "Continue the guided discussion so the main perspectives, disagreements, requirements, evidence, and conclusion can be produced.";

  return (
    <DataPanel
      title="Discussion dashboard"
      description="The first screen for a human reviewer: what is ready, what still needs attention, and where to go next."
    >
      <QueryState query={queryState}>
        <StatusBanner
          tone={continuationView.reviewReady ? "ok" : "warning"}
          title={nextActionTitle}
          detail={nextActionDetail}
        />
        <div className="du-discussion-dashboard-grid">
          <Link
            className="du-quality-summary-item du-quality-summary-primary"
            to="/runs/$runId/outcome"
            params={{ runId }}
          >
            <span>{continuationView.reviewReady ? "Ready" : "Not ready"}</span>
            <strong>Current conclusion</strong>
            <p>
              {continuationView.reviewReady
                ? "A reviewable conclusion is available with risks, evidence gaps, and next actions."
                : "The discussion needs more guided work before a conclusion is useful."}
            </p>
          </Link>
          <QualitySummaryLink
            title="Main perspectives"
            detail="Strong options stay visible without collapsing into one hidden authority."
            metric={String(candidates.length)}
            to="/sessions/$sessionId/frontier"
            sessionId={sessionId}
          />
          <QualitySummaryLink
            title="Open disagreements"
            detail="Unresolved objections that still constrain the current conclusion."
            metric={String(unresolvedObjections)}
            to="/sessions/$sessionId/objections"
            sessionId={sessionId}
          />
          <QualitySummaryLink
            title="Requirements to satisfy"
            detail="Explicit obligations that keep the output correct, complete, and bounded."
            metric={`${openObligations}/${obligations.length}`}
            to="/sessions/$sessionId/obligations"
            sessionId={sessionId}
          />
          <QualitySummaryLink
            title="Evidence gaps"
            detail="Missing or unchecked evidence that should be resolved before relying on the answer."
            metric={`${unresolvedEvidenceNeeds}/${evidenceNeeds.length}`}
            to="/sessions/$sessionId/resources"
            sessionId={sessionId}
          />
        </div>
        <div className="du-readable-list du-discussion-next-actions" aria-label="Next recommended actions">
          <h4>Next recommended actions</h4>
          {continuationView.reviewReady ? (
            <article className="du-readable-item">
              <p className="du-kicker">Step 1</p>
              <h4>Review current conclusion</h4>
              <p>
                Start with the current conclusion, then check the visible disagreements,
                requirements, and evidence gaps before relying on it.
              </p>
              <div className="du-action-row">
                <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
                  Open conclusion
                </Link>
              </div>
            </article>
          ) : (
            <article className="du-readable-item">
              <p className="du-kicker">Step 1</p>
              <h4>Continue guided discussion</h4>
              <p>
                Continue the discussion so independent first responses, main perspectives,
                disagreements, requirements, evidence, and a current conclusion can be produced.
              </p>
            </article>
          )}
          {unresolvedObjections > 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">Check</p>
              <h4>Review open disagreements</h4>
              <p>
                There are unresolved disagreements that still constrain the current conclusion.
              </p>
              <div className="du-action-row">
                <Link
                  className="du-action-link du-secondary-link"
                  to="/sessions/$sessionId/objections"
                  params={{ sessionId }}
                >
                  View disagreements
                </Link>
              </div>
            </article>
          ) : null}
          {unresolvedEvidenceNeeds > 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">Check</p>
              <h4>Resolve evidence gaps</h4>
              <p>
                Missing or unchecked evidence should be resolved before the conclusion is treated
                as reliable.
              </p>
              <div className="du-action-row">
                <Link
                  className="du-action-link du-secondary-link"
                  to="/sessions/$sessionId/resources"
                  params={{ sessionId }}
                >
                  Review evidence
                </Link>
              </div>
            </article>
          ) : null}
          {openObligations > 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">Check</p>
              <h4>Confirm answer requirements</h4>
              <p>
                Requirements that are not satisfied yet should be resolved or explicitly
                acknowledged in the conclusion.
              </p>
              <div className="du-action-row">
                <Link
                  className="du-action-link du-secondary-link"
                  to="/sessions/$sessionId/obligations"
                  params={{ sessionId }}
                >
                  View requirements
                </Link>
              </div>
            </article>
          ) : null}
          {candidates.length === 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">Check</p>
              <h4>Collect main perspectives</h4>
              <p>
                No main perspectives are visible yet. Continue the discussion before relying on a
                conclusion.
              </p>
            </article>
          ) : null}
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
    | "/sessions/$sessionId/obligations"
    | "/sessions/$sessionId/resources";
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

export function OutcomeBrief({
  outcome,
  context = EMPTY_OUTCOME_CONTEXT
}: {
  outcome: unknown;
  context?: OutcomeBriefContext;
}) {
  const recommendation =
    getStringRecordValue(outcome, "recommendation") ??
    getStringRecordValue(outcome, "summary") ??
    "No current conclusion is available yet.";
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
  const mainPerspectives = preferOutcomeRecords(alternatives, context.mainPerspectives);
  const openDisagreements = preferOutcomeRecords(
    unresolvedObjections,
    context.openDisagreements
  );
  const visibleEvidenceNeeds = preferOutcomeRecords(evidenceNeeds, context.missingEvidence);
  const visibleQualityObligations = preferOutcomeRecords(
    qualityObligations,
    context.answerRequirements
  );
  const unresolvedEvidenceNeeds = visibleEvidenceNeeds.filter(isUnresolvedEvidenceNeed).length;
  const mainPerspectiveDetail =
    alternatives.length > 0
      ? describeOutcomeCount(alternatives.length, "explored option", "explored options")
      : describeOutcomeCount(
          mainPerspectives.length,
          "visible perspective",
          "visible perspectives"
        );
  const evidenceDetail =
    visibleEvidenceNeeds.length === 0
      ? "No evidence gaps listed"
      : `${unresolvedEvidenceNeeds}/${visibleEvidenceNeeds.length} still need checking`;

  return (
    <div className="du-outcome-brief">
      <section className="du-outcome-hero" aria-label="Current conclusion snapshot">
        <article className="du-outcome-recommendation">
          <p className="du-kicker">Current recommendation</p>
          <h4>{recommendation}</h4>
        </article>
        <div className="du-outcome-status-grid">
          <OutcomeStatusItem
            title="Main perspectives"
            value={String(mainPerspectives.length)}
            detail={mainPerspectiveDetail}
          />
          <OutcomeStatusItem
            title="Open disagreements"
            value={String(openDisagreements.length)}
            detail={describeOutcomeCount(
              openDisagreements.length,
              "open disagreement",
              "open disagreements"
            )}
            tone={openDisagreements.length > 0 ? "warning" : "ok"}
          />
          <OutcomeStatusItem
            title="Missing evidence"
            value={
              visibleEvidenceNeeds.length === 0
                ? "0"
                : `${unresolvedEvidenceNeeds}/${visibleEvidenceNeeds.length}`
            }
            detail={evidenceDetail}
            tone={unresolvedEvidenceNeeds > 0 ? "warning" : "ok"}
          />
          <OutcomeStatusItem
            title="Risks and boundaries"
            value={String(limitations.length)}
            detail={describeOutcomeCount(
              limitations.length,
              "risk or boundary",
              "risks or boundaries"
            )}
            tone={limitations.length > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>
      <div className="du-outcome-section-grid">
        <ReadableStringList
          title="Unresolved questions"
          items={unresolvedQuestions}
          emptyTitle="No unresolved questions listed"
        />
        <ReadableStringList
          title="Risks and boundaries"
          items={limitations}
          emptyTitle="No risks or boundaries listed"
        />
      </div>
      <ReadableRecordList
        title="Main perspectives"
        items={mainPerspectives}
        emptyTitle="No main perspectives listed"
        summarizeItem={summarizeAlternative}
      />
      <ReadableRecordList
        title="Open disagreements"
        items={openDisagreements}
        emptyTitle="No open disagreements listed"
        summarizeItem={summarizeOpenObjection}
      />
      <ReadableRecordList
        title="Missing evidence"
        items={visibleEvidenceNeeds}
        emptyTitle="No missing evidence listed"
        summarizeItem={summarizeEvidenceNeed}
      />
      <ReadableRecordList
        title="Requirements this answer must satisfy"
        items={visibleQualityObligations}
        emptyTitle="No answer requirements listed"
        summarizeItem={summarizeQualityObligation}
      />
      <ReadableStringList
        title="Next recommended actions"
        items={continuationSuggestions}
        emptyTitle="No next recommended actions listed"
      />
    </div>
  );
}

function preferOutcomeRecords(outcomeRecords: unknown[], contextRecords: unknown[]): unknown[] {
  return outcomeRecords.length > 0 ? outcomeRecords : contextRecords;
}

function isUnresolvedEvidenceNeed(entry: unknown): boolean {
  const object = getRecordValue(entry, "object") ?? entry;
  const status = getStringRecordValue(object, "status");

  return status !== "checked" && status !== "satisfied" && status !== "resolved";
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
        <EmptyState
          title={emptyTitle}
          description="Nothing is listed for this section yet."
        />
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
          description="Nothing is listed for this section yet."
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
    fallbackTitle: `Perspective ${index + 1}`,
    fallbackKicker: `Perspective ${index + 1}`,
    fallbackDetail: "This perspective is included in the current discussion material.",
    titleKeys: ["title", "name"],
    detailKeys: ["summary", "rationale", "description", "text", "claim"]
  });
}

function summarizeOpenObjection(item: unknown, index: number): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: `Open disagreement ${index + 1}`,
    fallbackKicker: `Disagreement ${index + 1}`,
    fallbackDetail:
      "This disagreement is tracked, but it does not have a plain-language summary yet.",
    titleKeys: ["title", "summary", "claim"],
    detailKeys: ["reason", "description", "text"]
  });
}

function summarizeEvidenceNeed(item: unknown, index: number): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: `Missing evidence ${index + 1}`,
    fallbackKicker: `Evidence gap ${index + 1}`,
    fallbackDetail: "This evidence gap still needs verification.",
    titleKeys: ["question", "title", "summary"],
    detailKeys: ["description", "summary", "rationale", "text", "claim"]
  });
}

function summarizeQualityObligation(item: unknown, index: number): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: `Requirement ${index + 1}`,
    fallbackKicker: `Requirement ${index + 1}`,
    fallbackDetail: "This requirement should remain visible while reviewing the conclusion.",
    titleKeys: ["requirement", "title", "summary"],
    detailKeys: ["description", "rationale", "text", "claim"]
  });
}

function summarizeOutcomeRecord(
  item: unknown,
  index: number,
  options: {
    fallbackTitle: string;
    fallbackKicker: string;
    fallbackDetail: string;
    titleKeys: readonly string[];
    detailKeys: readonly string[];
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
      options.fallbackTitle,
    detail:
      getFirstStringRecordValue(object, options.detailKeys) ??
      options.fallbackDetail
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

function formatOutcomeLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function describeOutcomeCount(count: number, singular: string, plural: string): string {
  if (count === 0) {
    return `No ${plural} listed`;
  }

  return `${count} ${count === 1 ? singular : plural} listed`;
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
  const resourcesQuery = useQuery({
    queryKey: ["run-resources", sessionId],
    queryFn: () => client.getSessionResources(sessionId)
  });

  return (
    <section className="du-projection-section" aria-label="Discussion detail panels">
      <DataPanel
        title="Main perspectives"
        description="Strongest current options accepted into the discussion so far."
      >
        <QueryState query={frontierQuery}>
          <ProjectionRecordList
            records={asArray(frontierQuery.data?.candidates)}
            emptyTitle="No main perspectives"
            emptyDescription="No main perspectives have been accepted into this discussion yet."
            kind="candidate"
          />
          <AdvancedDetails summary="Advanced / Developer Mode" lazy>
            <ProjectionMetadata projection={frontierQuery.data?.projection} />
          </AdvancedDetails>
        </QueryState>
      </DataPanel>
      <DataPanel
        title="Open disagreements"
        description="Unresolved objections and challenges that still constrain the discussion."
      >
        <QueryState query={objectionsQuery}>
          <ProjectionRecordList
            records={asArray(objectionsQuery.data?.objections)}
            emptyTitle="No open disagreements"
            emptyDescription="No open disagreements have been accepted into this discussion yet."
            kind="objection"
          />
          <AdvancedDetails summary="Advanced / Developer Mode" lazy>
            <ProjectionMetadata projection={objectionsQuery.data?.projection} />
          </AdvancedDetails>
        </QueryState>
      </DataPanel>
      <DataPanel
        title="Requirements this answer must satisfy"
        description="Explicit requirements for the current conclusion."
      >
        <QueryState query={obligationsQuery}>
          <ProjectionRecordList
            records={asArray(obligationsQuery.data?.qualityObligations)}
            emptyTitle="No requirements"
            emptyDescription="No explicit requirements have been accepted into this discussion yet."
            kind="quality obligation"
          />
          <AdvancedDetails summary="Advanced / Developer Mode" lazy>
            <ProjectionMetadata projection={obligationsQuery.data?.projection} />
          </AdvancedDetails>
        </QueryState>
      </DataPanel>
      <DataPanel
        title="Risks and missing evidence"
        description="Evidence gaps and verification needs that should be checked before relying on the conclusion."
      >
        <QueryState query={resourcesQuery}>
          <ProjectionRecordList
            records={asArray(resourcesQuery.data?.evidenceNeeds)}
            emptyTitle="No missing evidence"
            emptyDescription="No evidence gaps have been accepted into this discussion yet."
            kind="evidence"
          />
          <AdvancedDetails summary="Advanced / Developer Mode" lazy>
            <ProjectionMetadata projection={resourcesQuery.data?.projection} />
          </AdvancedDetails>
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
      title="Next recommended actions"
      description="Suggested next steps based on the current discussion state. Recording a suggestion keeps it reviewable and does not execute it automatically."
    >
      <QueryState query={processProposalQuery}>
        <KeyValueGrid
          items={[
            {
              label: "Recommended actions",
              value: proposals.length
            },
            {
              label: "Ready to start",
              value: readyCount
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
        <AdvancedDetails summary="Advanced recommendation details" lazy>
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
                label: "Execution policy",
                value:
                  getRecordValue(executionPolicy, "automaticExecution") === false
                    ? "Explicit only"
                    : "Not reported"
              },
              {
                label: "Suggestion event range",
                value: formatEventRange(
                  getRecordValue(
                    getRecordValue(processProposalQuery.data, "metadata"),
                    "eventRange"
                  )
                )
              }
            ]}
          />
        </AdvancedDetails>
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

type ProcessPrimitiveUserView = {
  title: string;
  detail: string;
  reason: string;
  risk: string;
};

const PROCESS_PRIMITIVE_USER_VIEWS: Record<string, ProcessPrimitiveUserView> = {
  sealed_divergence: {
    title: "Collect independent first responses",
    detail: "Ask participants to respond separately before one visible answer can anchor the discussion.",
    reason: "Preserves independent perspectives at the start of the discussion.",
    risk: "The discussion may converge too early around one framing."
  },
  relation_mapping: {
    title: "Organize the responses",
    detail:
      "Turn revealed responses into main perspectives, supporting points, open disagreements, and answer requirements.",
    reason: "Makes the discussion material easier to review and challenge.",
    risk: "Important points may remain buried in raw responses."
  },
  red_team: {
    title: "Review the new discussion material",
    detail:
      "Challenge weak options, unsupported points, and missing requirements before accepting the material.",
    reason: "Keeps weak or incomplete material from shaping the conclusion too early.",
    risk: "Problems may be accepted before they are visible."
  },
  evidence_check: {
    title: "Check missing evidence",
    detail: "Route unresolved evidence gaps through verification work before strengthening the conclusion.",
    reason: "Separates what is still unverified from what the discussion can rely on.",
    risk: "The conclusion may rely on claims that are still unchecked."
  },
  candidate_repair: {
    title: "Improve current options",
    detail:
      "Use open disagreements and unfinished requirements to strengthen the strongest current options.",
    reason: "Keeps known weaknesses from carrying forward unchanged.",
    risk: "Current options may stay weaker than the discussion already knows they are."
  },
  final_audit: {
    title: "Review conclusion risks",
    detail: "Check the proposed conclusion for unresolved risks, limits, and audit findings.",
    reason: "Makes the conclusion safer to review before anyone relies on it.",
    risk: "The conclusion may omit important risks or limits."
  },
  omission_audit: {
    title: "Check for missing coverage",
    detail: "Look for important accepted material that the proposed conclusion may have left out.",
    reason: "Reduces the chance that a neat conclusion hides relevant unresolved material.",
    risk: "The conclusion may look coherent while omitting important context."
  },
  final_contest: {
    title: "Prepare current conclusion",
    detail: "Turn the strongest current options into reviewable conclusion material.",
    reason:
      "Creates a current conclusion that users can inspect with disagreements and risks still visible.",
    risk: "The discussion may stop before a reviewable conclusion exists."
  }
};

function describeProcessPrimitiveForUser(primitive: string): ProcessPrimitiveUserView {
  return PROCESS_PRIMITIVE_USER_VIEWS[primitive] ?? {
    title: "Review next discussion step",
    detail: "Review the suggested next step before deciding whether to save or run it.",
    reason: "Keeps next-step decisions visible instead of automatic.",
    risk: "The discussion may miss a useful follow-up step."
  };
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
        title="No recommended actions"
        description="The current discussion state did not produce a next-step suggestion."
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

function formatProcessObservationForUser(observation: string): string {
  if (observation === "No sealed divergence round is recorded for this run.") {
    return "Independent first responses have not been collected yet.";
  }

  if (observation === "The sealed divergence round is failed.") {
    return "The independent first-response step needs another attempt.";
  }

  if (observation === "The sealed divergence round is not revealed yet.") {
    return "Independent first responses are not ready to review yet.";
  }

  if (observation === "No extraction proposal round with proposal events is available.") {
    return (
      "The first responses have not yet been organized into perspectives, " +
      "disagreements, and requirements."
    );
  }

  if (observation === "Extraction proposal material has not completed proposal review.") {
    return "New discussion material still needs a review before it shapes the conclusion.";
  }

  if (observation === "Accepted proposal material contains open evidence needs.") {
    return "Some missing evidence still needs checking.";
  }

  if (
    observation ===
    "Accepted proposal material contains unresolved objections or quality obligations."
  ) {
    return "Open disagreements or unfinished answer requirements still need work.";
  }

  if (observation === "A final candidate proposal exists without recorded final audit events.") {
    return "The proposed conclusion still needs a risk review.";
  }

  if (
    observation ===
    "Audited final candidate material is available without an active omission audit proposal."
  ) {
    return "The risk-reviewed conclusion may still need a missing-coverage check.";
  }

  if (
    observation ===
    "Accepted active candidates are available without open evidence or repair targets."
  ) {
    return "Strong current options are ready to become a reviewable current conclusion.";
  }

  if (observation === "No explicit adaptive primitive gap was detected.") {
    return "No immediate next step is suggested right now.";
  }

  return observation;
}

function ProcessProposalRecord({
  proposal,
  actions
}: {
  proposal: unknown;
  actions?: ReactNode;
}) {
  const primitive = getStringRecordValue(proposal, "primitive") ?? "Unknown primitive";
  const actionView = describeProcessPrimitiveForUser(primitive);
  const targetIds = asArray(getRecordValue(proposal, "targetIds"));
  const requestedBudget = getRecordValue(proposal, "requestedBudget");

  return (
    <article className="du-readable-item">
      <p className="du-kicker">Recommended next step</p>
      <h4>{actionView.title}</h4>
      <p>{actionView.detail}</p>
      <KeyValueGrid
        items={[
          {
            label: "Status",
            value: formatRecordValue(getRecordValue(proposal, "status"))
          },
          {
            label: "Why this helps",
            value: actionView.reason
          },
          {
            label: "Risk if skipped",
            value: actionView.risk
          }
        ]}
      />
      <AdvancedDetails summary="Advanced proposal details" lazy>
        <KeyValueGrid
          items={[
            {
              label: "Proposal id",
              value: formatRecordValue(getRecordValue(proposal, "id"))
            },
            {
              label: "Raw primitive",
              value: primitive
            },
            {
              label: "Raw expected gain",
              value: formatRecordValue(getRecordValue(proposal, "expectedQualityGain"))
            },
            {
              label: "Raw risk if skipped",
              value: formatRecordValue(getRecordValue(proposal, "riskIfSkipped"))
            },
            {
              label: "Targets",
              value: formatEventIds(targetIds)
            },
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
      </AdvancedDetails>
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
          ? "Saved for review"
          : recordMutation.isPending
            ? "Saving next step"
            : "Save next step"}
      </button>
      {recordMutation.data ? (
        <StatusBanner
          tone="ok"
          title="Next step saved"
          detail="The recommendation was saved as reviewable material only; it did not run automatically."
        />
      ) : null}
      {recordMutation.isError ? (
        <StatusBanner
          tone="error"
          title="Next step was not saved"
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
        title="No saved next steps"
        description="Save a recommended next step to make it reviewable before execution."
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
        {executionMutation.data ? (
          <StartResult result={executionMutation.data} runId={runId} />
        ) : null}
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
  const readableObservations = observations.flatMap((observation) =>
    typeof observation === "string" ? [formatProcessObservationForUser(observation)] : []
  );

  if (readableObservations.length === 0) {
    return null;
  }

  return (
    <div className="du-readable-list">
      <h4>Why now</h4>
      {readableObservations.map((observation, index) => (
        <article className="du-readable-item" key={`${index}:${observation}`}>
          <p className="du-kicker">Reason {index + 1}</p>
          <p>{observation}</p>
        </article>
      ))}
    </div>
  );
}

type ProjectionRecordKind = "candidate" | "objection" | "quality obligation" | "evidence";

function ProjectionRecordList({
  records,
  emptyTitle,
  emptyDescription,
  kind
}: {
  records: unknown[];
  emptyTitle: string;
  emptyDescription: string;
  kind: ProjectionRecordKind;
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
          index={index}
          kind={kind}
        />
      ))}
    </div>
  );
}

function ProjectionRecord({
  record,
  index,
  kind
}: {
  record: unknown;
  index: number;
  kind: ProjectionRecordKind;
}) {
  const object = getRecordValue(record, "object") ?? record;
  const id = getStringRecordValue(object, "id") ?? `${kind}-${getProjectionRecordKey(record, 0)}`;
  const fallbackTitle = `${formatProjectionKind(kind)} ${index + 1}`;
  const title =
    getStringRecordValue(object, "title") ??
    getStringRecordValue(object, "question") ??
    getStringRecordValue(object, "content") ??
    getStringRecordValue(object, "requirement") ??
    getStringRecordValue(object, "failureMode") ??
    fallbackTitle;
  const status = formatReadableRecordStatus(getRecordValue(object, "status"));
  const description =
    getStringRecordValue(object, "description") ??
    getStringRecordValue(object, "consequence") ??
    getStringRecordValue(object, "question") ??
    getStringRecordValue(object, "requirement") ??
    getStringRecordValue(object, "content");
  const proposalEventId = getRecordValue(record, "proposalEventId");
  const sourceEventIds = asArray(getRecordValue(object, "sourceEventIds"));

  return (
    <article className="du-readable-item">
      <p className="du-kicker">{formatProjectionKind(kind)}</p>
      <h4>{title}</h4>
      {description && description !== title ? <p>{description}</p> : null}
      <p className="du-readable-meta">Current state: {status}</p>
      <AdvancedDetails summary="Advanced / Developer Mode" lazy>
        <KeyValueGrid
          items={[
            {
              label: "Object id",
              value: id
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
      </AdvancedDetails>
    </article>
  );
}

function formatProjectionKind(kind: ProjectionRecordKind): string {
  if (kind === "candidate") {
    return "Main perspective";
  }

  if (kind === "objection") {
    return "Open disagreement";
  }

  if (kind === "evidence") {
    return "Evidence gap";
  }

  return "Requirement";
}

function formatReadableRecordStatus(value: unknown): string {
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
    return formatOutcomeLabel(value);
  }

  return formatRecordValue(value);
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

function describeDiscussionStatus(run: unknown): string {
  const continuationView = describeDiscussionContinuation(run);
  const status = getRecordValue(run, "status");
  const completedStageCount = getDiscussionStageStatuses(run).filter(([, stageStatus]) =>
    isCompletedDiscussionStage(stageStatus)
  ).length;

  if (continuationView.reviewReady) {
    return "Ready to review: current conclusion is available.";
  }

  if (status === "running" && completedStageCount === 0) {
    return "In progress: discussion steps are currently running.";
  }

  if (status === "running" || completedStageCount > 0) {
    return `${completedStageCount} discussion step${
      completedStageCount === 1 ? "" : "s"
    } completed. Continue the discussion before relying on the conclusion.`;
  }

  if (status === "created") {
    return "Created: discussion exists, deliberation steps have not started.";
  }

  return formatRecordValue(status);
}

function isCompletedDiscussionStage(status: unknown): boolean {
  return status === "completed" || status === "revealed";
}

function describeDiscussionContinuation(run: unknown): DiscussionContinuationView {
  const status = getRecordValue(run, "status");
  const finalizationStatus = getRecordValue(run, "latestFinalizationStatus");
  const reviewReady = status === "revealed" || finalizationStatus === "completed";

  if (reviewReady) {
    return {
      title: "Discussion is ready to review",
      description:
        "The guided discussion has produced a current conclusion. Review it first; rerun only when you want to refresh the discussion with the same brief.",
      explainerTitle: "Review the current conclusion",
      explainerDetail:
        "Main perspectives, open disagreements, requirements, evidence and verification, risk review, and next recommended actions are available below and on the conclusion page.",
      primaryLabel: "Run guided discussion again",
      reviewReady
    };
  }

  return {
    title: "Continue discussion",
    description:
      "Continue the guided discussion so perspectives, disagreements, requirements, evidence and verification, risk review, and conclusion can appear.",
    explainerTitle: "Continue the full guided discussion",
    explainerDetail:
      "Collects independent first responses, organizes main perspectives, reviews requirements, checks evidence needs, and compiles a provisional conclusion.",
    primaryLabel: "Continue guided discussion",
    reviewReady
  };
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
      detail: "This discussion step has no recorded work yet."
    };
  }

  if (status === "revealed") {
    return {
      label: "Revealed",
      detail: "Independent first responses have been revealed for review."
    };
  }

  if (status === "completed") {
    return {
      label: "Completed",
      detail: "This discussion step has been completed."
    };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      detail: "This discussion step could not be processed safely."
    };
  }

  if (typeof status === "string") {
    return {
      label: status,
      detail: "Status reported for this discussion step."
    };
  }

  return {
    label: "Unavailable",
    detail: "No readable status was returned for this discussion step."
  };
}

function describeOutcomeUnavailableReason(reason: unknown): string {
  if (reason === "final_candidate_proposal_unavailable") {
    return "The discussion has not produced conclusion-ready material yet. Continue the guided discussion before opening the current conclusion.";
  }

  if (reason === "final_candidate_proposal_ambiguous") {
    return "More than one conclusion-ready draft is available, so Deliberum cannot choose one automatically.";
  }

  if (reason === "outcome_compilation_unavailable") {
    return "Deliberum could not safely prepare the current conclusion from the available discussion material.";
  }

  return "Deliberum returned an unavailable conclusion state. Open Advanced details for the raw reason.";
}

function describeRunOutcomeReviewStatus(draftStatus: unknown): {
  tone: "neutral" | "ok" | "warning";
  title: string;
  detail: string;
} {
  if (draftStatus === "draft") {
    return {
      tone: "ok",
      title: "Current conclusion ready to review",
      detail:
        "This is reviewable discussion material. Check disagreements, risks, missing evidence, and next actions before relying on it."
    };
  }

  if (draftStatus === "provisional") {
    return {
      tone: "warning",
      title: "Current conclusion remains provisional",
      detail:
        "Treat this as a working conclusion until the visible disagreements, risks, and evidence gaps have been reviewed."
    };
  }

  return {
    tone: "neutral",
    title: "Current conclusion status unknown",
    detail:
      "Review the conclusion together with its disagreements, risks, missing evidence, and next actions."
  };
}

function formatRunStartErrorMessage(error: Error | null | undefined): string {
  if (getErrorCode(error) === "orchestration_component_unavailable") {
    return "This discussion cannot continue because the required setup is unavailable. Open Advanced mode to inspect setup details before retrying.";
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
