import { Link, useNavigate, useParams } from "@tanstack/react-router";
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
import { LanguageSwitcher, useI18n } from "./i18n";
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
const USER_FACING_ACTOR_LABELS: Record<string, string> = {
  "local-preset-alpha": "Perspective A",
  "local-preset-beta": "Perspective B",
  "local-preset-candidate-repairer": "Option reviewer",
  "local-preset-evidence-checker": "Evidence checker",
  "local-preset-extractor": "Discussion organizer",
  "local-preset-final-auditor": "Risk reviewer",
  "local-preset-final-candidate": "Conclusion writer",
  "local-preset-review-coordinator": "Review coordinator",
  "local-preset-reviewer": "Reviewer",
  "perspective-a": "Perspective A",
  "perspective-b": "Perspective B",
  "process-coordinator": "Review coordinator",
  "process-reviewer": "Reviewer"
};
type RunFollowStatus = "idle" | "connecting" | "connected" | "error" | "unsupported";
type ProcessDecisionStatus = "accepted" | "deferred" | "rejected";
type DiscussionContinuationView = {
  title: string;
  description: string;
  explainerTitle: string;
  explainerDetail: string;
  primaryLabel: string;
  primaryActionDetail: string;
  primaryResultTitle: string;
  primaryResultDetail: string;
  reviewReady: boolean;
};
type DiscussionStartFeedback = {
  title: string;
  detail: string;
};
type DiscussionNextStepView = {
  title: string;
  detail: string;
  tone: "ready" | "active" | "pending";
};
type DiscussionStageStatus = [label: string, status: unknown];
type TranslateFunction = (message: string, values?: Record<string, string | number>) => string;
type RoomActivityItem = {
  speaker: string;
  title: string;
  detail: string;
  tone: "neutral" | "ok" | "warning";
  phase: RoomActivityPhaseId;
};
type RoomActivityPhaseId =
  | "brief"
  | "first-responses"
  | "perspectives"
  | "evidence"
  | "conclusion";
type RoomActivityPhaseView = {
  label: string;
  detail: string;
  updatesLabel: string;
};
type RoomActivityGroup = {
  phase: RoomActivityPhaseId;
  activities: RoomActivityItem[];
};
type DiscussionRoomProgressView = {
  tone: "ready" | "active" | "pending";
  phaseTitle: string;
  phaseDetail: string;
  nextTitle: string;
  nextDetail: string;
};

export function RunsListPage() {
  const { t } = useI18n();
  const { client } = useDaemonRuntime();
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => client.listRuns()
  });
  const runs = asArray(runsQuery.data?.runs);

  return (
    <RunWorkspaceShell>
      <ViewFrame
        eyebrow={t("User Mode")}
        title={t("Discussions")}
        description={t(
          "Start or continue a deliberation in plain language, then inspect the current conclusion, perspectives, disagreements, evidence gaps, and next actions."
        )}
        actions={
          <Link className="du-action-link" to="/runs/new">
            {t("Start a discussion")}
          </Link>
        }
      >
        <RunConceptPanel />
        <QueryState query={runsQuery}>
          <DataPanel title={t("Existing discussions")}>
            {runs.length === 0 ? (
              <EmptyState
                title={t("No discussions yet")}
                description={t(
                  "Start with a question. Deliberum will create a discussion brief, collect independent first responses, and keep the conclusion, disagreements, risks, and next steps visible."
                )}
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
  const { t } = useI18n();
  const { client } = useDaemonRuntime();
  const navigate = useNavigate();
  const [runPlanText, setRunPlanText] = useState(DEFAULT_RUN_PLAN_TEXT);
  const [discussionQuestion, setDiscussionQuestion] = useState("");
  const [discussionGoals, setDiscussionGoals] = useState("");
  const [discussionConstraints, setDiscussionConstraints] = useState("");
  const [discussionExpectedOutcome, setDiscussionExpectedOutcome] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (runPlan: Record<string, unknown>) => client.createRun({ runPlan }),
    onSuccess: (result) => {
      const runId = getStringRecordValue(result?.run, "runId");

      if (runId) {
        void navigate({ to: "/runs/$runId", params: { runId } });
      }
    }
  });
  const createdRunId = getStringRecordValue(createMutation.data?.run, "runId");
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
      setInputError(t("Discussion question is required."));
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
        eyebrow={t("User Mode")}
        title={t("Start a discussion")}
        description={t(
          "Create a discussion that keeps the brief, independent first responses, strongest options, disagreements, requirements, evidence and verification, risk review, and current conclusion visible."
        )}
      >
        <StatusBanner
          title={t("Start from a question")}
          detail={t(
            "Write a brief in plain language or use the sample brief to try the full discussion flow immediately."
          )}
        />
        <DataPanel
          title={t("Discussion brief")}
          description={t(
            "Describe what you need to decide or clarify. Deliberum will structure the discussion so the conclusion, disagreements, risks, evidence gaps, and next actions stay visible."
          )}
        >
          <form className="du-discussion-form" onSubmit={submitGuidedDiscussion}>
            <div className="du-brief-primary">
              <div className="du-field-heading">
                <label htmlFor="discussion-question">{t("Discussion question")}</label>
                <span aria-hidden="true" className="du-field-badge">
                  {t("Required")}
                </span>
              </div>
              <textarea
                id="discussion-question"
                className="du-brief-question"
                value={discussionQuestion}
                onChange={(event) => setDiscussionQuestion(event.currentTarget.value)}
                placeholder={t("What should we decide, compare, or clarify?")}
              />
              <div className="du-action-row">
                <button type="submit" disabled={!canCreateDiscussion}>
                  {createMutation.isPending
                    ? t("Creating discussion")
                    : t("Create discussion")}
                </button>
                <button
                  type="button"
                  className="du-secondary-button"
                  onClick={fillSampleDiscussionBrief}
                  disabled={createMutation.isPending}
                >
                  {t("Use sample brief")}
                </button>
              </div>
            </div>
            <details className="du-brief-options">
              <summary>{t("Add goals, constraints, and expected result")}</summary>
              <div className="du-brief-options-body">
                <div className="du-discussion-form-grid">
                  <div>
                    <label htmlFor="discussion-goals">{t("Goals")}</label>
                    <textarea
                      id="discussion-goals"
                      value={discussionGoals}
                      onChange={(event) => setDiscussionGoals(event.currentTarget.value)}
                      placeholder={t("One goal per line")}
                    />
                  </div>
                  <div>
                    <label htmlFor="discussion-constraints">{t("Constraints")}</label>
                    <textarea
                      id="discussion-constraints"
                      value={discussionConstraints}
                      onChange={(event) => setDiscussionConstraints(event.currentTarget.value)}
                      placeholder={t("One constraint per line")}
                    />
                  </div>
                </div>
                <label htmlFor="discussion-expected-outcome">{t("Expected result")}</label>
                <textarea
                  id="discussion-expected-outcome"
                  value={discussionExpectedOutcome}
                  onChange={(event) => setDiscussionExpectedOutcome(event.currentTarget.value)}
                  placeholder={t("What should the current conclusion include?")}
                />
              </div>
            </details>
            <div className="du-readable-list">
              <ExplainerItem
                title={t("Works without setup")}
                detail={t(
                  "The sample brief uses built-in discussion material so a first-time user can review the flow immediately."
                )}
              />
              <ExplainerItem
                title={t("Complete discussion loop")}
                detail={t(
                  "It creates a discussion brief, independent first responses, strongest options, disagreements, requirements, evidence needs, risk review, and current conclusion."
                )}
              />
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
            title={t("Discussion could not be created")}
            detail={formatSafeErrorMessage(createMutation.error)}
          />
        ) : null}
        {createdRunId ? (
          <StatusBanner
            tone="ok"
            title={t("Discussion created")}
            detail={t(
              "Next, open the discussion room and continue the guided discussion to collect perspectives, surface disagreements, and produce a reviewable conclusion."
            )}
          />
        ) : null}
        {createdRunId ? (
          <div className="du-action-row">
            <Link className="du-action-link" to="/runs/$runId" params={{ runId: createdRunId }}>
              {t("Open discussion room")}
            </Link>
          </div>
        ) : null}
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

export function RunDetailPage() {
  const { t } = useI18n();
  const { runId } = useRunParams();
  const { client } = useDaemonRuntime();
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => client.getRun(runId)
  });
  const run = runQuery.data?.run;
  const sessionId = getStringRecordValue(run, "sessionId");
  const reviewReady = isDiscussionReviewReady(run);

  return (
    <RunWorkspaceShell runId={runId} showConclusionNav={reviewReady}>
      <ViewFrame
        eyebrow={t("User Mode")}
        title={t(formatRunDisplayTitle(run))}
        description={t(
          "Start or continue a discussion, then review the current conclusion, main perspectives, open disagreements, risks, missing evidence, and next recommended actions."
        )}
        actions={
          reviewReady ? (
            <>
              <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
                {t("View current conclusion")}
              </Link>
              <a className="du-action-link du-secondary-link" href="#continue-discussion">
                {t("Update conclusion")}
              </a>
            </>
          ) : (
            <a className="du-action-link" href="#continue-discussion">
              {t("Continue discussion")}
            </a>
          )
        }
      >
        <QueryState query={runQuery}>
          {sessionId ? (
            <RunQualityOverview runId={runId} sessionId={sessionId} run={run} />
          ) : null}
          <div id="continue-discussion" className="du-workbench-anchor">
            <StartRunForm runId={runId} sessionId={sessionId} run={run} />
          </div>
          {sessionId ? <RunProjectionPanels sessionId={sessionId} /> : null}
          {sessionId ? (
            <DiscussionSetupDetails run={run} />
          ) : (
            <>
              <RunBriefPanel run={run} />
              <RunSummary run={run} />
            </>
          )}
          <RunProgressDetails run={run} />
          <AdvancedDetails
            summary="Advanced / Developer Mode"
            description="Adaptive primitive suggestions, process proposal lifecycle, explicit execution readiness, and internal proposal ids for developer inspection."
            panelLabel="Adaptive primitive suggestions"
            lazy
          >
            <RunProcessProposals runId={runId} sessionId={sessionId} />
            {sessionId ? <RunProcessGovernance runId={runId} sessionId={sessionId} /> : null}
          </AdvancedDetails>
          <AdvancedDetails
            summary="Advanced / Developer Mode"
            description="Ledger trace, run plan, round metadata, and internal ids for developer inspection."
            panelLabel="Ledger trace"
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
  const { t } = useI18n();
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
        eyebrow={t("User Mode")}
        title={t("Current conclusion")}
        description={t(
          "Review the current conclusion together with main perspectives, open disagreements, missing evidence, risks, and next actions."
        )}
        actions={
          <Link className="du-action-link" to="/runs/$runId" params={{ runId }}>
            {t("Back to discussion")}
          </Link>
        }
      >
        <QueryState query={outcomeQuery}>
          {outcome?.status === "compiled" ? (
            <>
              <StatusBanner
                tone={conclusionStatus.tone}
                title={t(conclusionStatus.title)}
                detail={t(conclusionStatus.detail)}
              />
              <DataPanel
                title={t("Current conclusion")}
                description={t(
                  "A readable summary of the current result. Advanced details keep the underlying technical response for developers."
                )}
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
                title={t("Current conclusion not available")}
                detail={t(describeOutcomeUnavailableReason(getRecordValue(outcome, "reason")))}
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
  showConclusionNav = true,
  children
}: {
  runId?: string;
  showConclusionNav?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel={t("User Mode")}
      navigation={<RunNavigation runId={runId} showConclusionNav={showConclusionNav} />}
      status={<LanguageSwitcher />}
    >
      {children}
    </WorkspaceShell>
  );
}

function RunNavigation({
  runId,
  showConclusionNav = true
}: {
  runId?: string;
  showConclusionNav?: boolean;
}) {
  const { t } = useI18n();
  const linkClass = "du-nav-link";

  return (
    <>
      <Link
        to="/runs"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Discussions")}
      </Link>
      <Link
        to="/runs/new"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Start discussion")}
      </Link>
      {runId ? (
        <Link
          to="/runs/$runId"
          params={{ runId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          {t("Discussion")}
        </Link>
      ) : null}
      {runId && showConclusionNav ? (
        <Link
          to="/runs/$runId/outcome"
          params={{ runId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          {t("Current conclusion")}
        </Link>
      ) : null}
    </>
  );
}

function RunConceptPanel() {
  const { t } = useI18n();

  return (
    <DataPanel
      title={t("How discussions work")}
      description={t("The default mode explains the deliberation loop in user language.")}
    >
      <div className="du-explainer-grid">
        <ExplainerItem
          title={t("Discussion brief")}
          detail={t(
            "The topic, goals, constraints, participants, and output expectations before anyone contributes."
          )}
        />
        <ExplainerItem
          title={t("Independent first responses")}
          detail={t(
            "Early work is kept separate so one visible answer does not anchor the discussion."
          )}
        />
        <ExplainerItem
          title={t("Strongest current options")}
          detail={t(
            "Main perspectives stay visible as options, without a hidden authority choosing for the user."
          )}
        />
        <ExplainerItem
          title={t("Current conclusion")}
          detail={t(
            "A reviewable outcome with open disagreements, risks, missing evidence, and next steps."
          )}
        />
      </div>
    </DataPanel>
  );
}

function RunProgressDetails({ run }: { run: unknown }) {
  const { t } = useI18n();

  return (
    <details className="du-user-details">
      <summary>
        <span>{t("How progress is tracked")}</span>
        <small>
          {t(
            "Optional status explanation for the visible discussion steps. Technical identifiers stay in Advanced mode."
          )}
        </small>
      </summary>
      <div className="du-user-details-stack">
        <section aria-label={t("What this discussion status means")}>
          <div className="du-section-label">
            <p className="du-kicker">{t("Status guide")}</p>
            <h4>{t("What this discussion status means")}</h4>
            <p>{t("Plain-language meanings for the status labels used in this page.")}</p>
          </div>
          <div className="du-explainer-grid">
            <ExplainerItem
              title={t("Created")}
              detail={t(
                "The discussion exists, but the deliberation steps have not started yet."
              )}
            />
            <ExplainerItem
              title={t("Not started yet")}
              detail={t("No work has been recorded for that part of the discussion.")}
            />
            <ExplainerItem
              title={t("Setup needed")}
              detail={t(
                "This discussion cannot continue until the required setup is available. Setup details stay in Advanced mode."
              )}
            />
          </div>
        </section>
        <section aria-label={t("Discussion progress")}>
          <div className="du-section-label">
            <p className="du-kicker">{t("Progress")}</p>
            <h4>{t("Discussion progress")}</h4>
            <p>
              {t(
                "Each step corresponds to a core Deliberum concept, presented in user language."
              )}
            </p>
          </div>
          <StageStatusList stages={getDiscussionStageStatuses(run)} />
        </section>
      </div>
    </details>
  );
}

function DiscussionSetupDetails({ run }: { run: unknown }) {
  const { t } = useI18n();

  return (
    <details className="du-user-details">
      <summary>
        <span>{t("Discussion setup")}</span>
        <small>
          {t(
            "Original brief and status details for review. The main room keeps the live discussion flow first."
          )}
        </small>
      </summary>
      <div className="du-user-details-stack">
        <RunBriefPanel run={run} />
        <RunSummary run={run} />
      </div>
    </details>
  );
}

function RunBriefPanel({ run }: { run: unknown }) {
  const { t } = useI18n();
  const plan = getRecordValue(run, "plan") ?? {};
  const question =
    getStringRecordValue(plan, "topic") ??
    getStringRecordValue(run, "topic") ??
    formatRunDisplayTitle(run);
  const goals = getStringArray(getRecordValue(plan, "goals"));
  const constraints = getStringArray(getRecordValue(plan, "constraints"));
  const expectedResult = getStringArray(
    getRecordValue(getRecordValue(plan, "output"), "expectations")
  );
  const hasBrief =
    question.length > 0 || goals.length > 0 || constraints.length > 0 || expectedResult.length > 0;

  return (
    <DataPanel
      title={t("Discussion brief")}
      description={t(
        "The question, goals, constraints, and expected result that anchor this discussion."
      )}
    >
      {hasBrief ? (
        <KeyValueGrid
          items={[
            {
              label: t("Question"),
              value: question
            },
            {
              label: t("Goals"),
              value: formatBriefList(goals)
            },
            {
              label: t("Constraints"),
              value: formatBriefList(constraints)
            },
            {
              label: t("Expected result"),
              value: formatBriefList(expectedResult)
            }
          ]}
        />
      ) : (
        <EmptyState
          title={t("No discussion brief visible yet")}
          description={t("Continue the discussion after the brief is available.")}
        />
      )}
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

export function formatRunDisplayTitle(run: unknown, index?: number): string {
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

export function formatRunDisplaySummary(run: unknown): string {
  const topic = getStringRecordValue(run, "topic");
  const title = getStringRecordValue(run, "title");

  if (
    title &&
    title !== topic &&
    !isTechnicalRunTitle(title) &&
    !isTopicPrefixedTitle(title, topic)
  ) {
    return title;
  }

  return "Review the status, perspectives, disagreements, evidence, conclusion, and next actions.";
}

function isTechnicalRunTitle(value: string): boolean {
  return /^run\s+[a-z0-9_-]+$/i.test(value.trim());
}

function isTopicPrefixedTitle(title: string, topic: string | undefined): boolean {
  if (!topic) {
    return false;
  }

  return title.trim().toLowerCase() === `discussion: ${topic.trim()}`.toLowerCase();
}

function RunListItem({ run, index }: { run: unknown; index: number }) {
  const { t } = useI18n();
  const runId = getStringRecordValue(run, "runId");
  const reviewReady = isDiscussionReviewReady(run);

  return (
    <article className="du-run-list-item">
      <div>
        <p className="du-kicker">{t("Discussion {number}", { number: index + 1 })}</p>
        <h3>{t(formatRunDisplayTitle(run, index))}</h3>
        <p>{t(formatRunDisplaySummary(run))}</p>
      </div>
      <div className="du-run-list-meta" aria-label={t("Discussion status")}>
        <article>
          <span>{t("Discussion status")}</span>
          <strong>{t(describeDiscussionStatus(run))}</strong>
        </article>
        <article>
          <span>{t("Updated")}</span>
          <strong>{formatRecordValue(getRecordValue(run, "updatedAt"))}</strong>
        </article>
      </div>
      <DiscussionNextStepCard run={run} />
      {runId ? (
        <div className="du-action-row du-run-list-actions">
          <Link className="du-action-link" to="/runs/$runId" params={{ runId }}>
            {t("Open discussion")}
          </Link>
          {reviewReady ? (
            <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
              {t("Current conclusion")}
            </Link>
          ) : null}
        </div>
      ) : null}
      <details className="du-user-details">
        <summary>
          <span>{t("Discussion progress")}</span>
          <small>
            {t(
              "Each step corresponds to a core Deliberum concept, presented in user language."
            )}
          </small>
        </summary>
        <div className="du-user-details-stack">
          <StageStatusList stages={getDiscussionStageStatuses(run)} />
        </div>
      </details>
      <AdvancedDetails
        summary="Advanced / Developer Mode"
        panelLabel="Discussion status details"
        lazy
      >
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
    </article>
  );
}

function RunSummary({ run }: { run: unknown }) {
  const { t } = useI18n();

  return (
    <DataPanel
      title={t("Discussion status")}
      description={t("A user-facing summary of where the discussion currently stands.")}
    >
      <KeyValueGrid
        items={[
          {
            label: t("Discussion status"),
            value: t(describeDiscussionStatus(run))
          },
          {
            label: t("Created"),
            value: formatRecordValue(getRecordValue(run, "createdAt"))
          },
          {
            label: t("Updated"),
            value: formatRecordValue(getRecordValue(run, "updatedAt"))
          }
        ]}
      />
      <AdvancedDetails
        summary="Advanced / Developer Mode"
        panelLabel="Discussion status details"
        lazy
      >
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

export function getDiscussionStageStatuses(run: unknown): DiscussionStageStatus[] {
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

export function StageStatusList({ stages }: { stages: Array<[string, unknown]> }) {
  const { t } = useI18n();

  return (
    <div className="du-stage-grid">
      {stages.map(([label, status]) => {
        const statusView = describeStageStatus(status);

        return (
          <div className="du-stage-pill" key={label}>
            <span>{t(label)}</span>
            <strong>{t(statusView.label)}</strong>
            <span>{t(statusView.detail)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DiscussionNextStepCard({ run }: { run: unknown }) {
  const { t } = useI18n();
  const nextStep = describeDiscussionNextStep(run);

  return (
    <div className={`du-next-step-card du-next-step-${nextStep.tone}`}>
      <p className="du-kicker">{t("Next step")}</p>
      <h4>{t(nextStep.title)}</h4>
      <p>{t(nextStep.detail)}</p>
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
  const { t } = useI18n();
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const continuationView = describeDiscussionContinuation(run);
  const [startRequestText, setStartRequestText] = useState(DEFAULT_START_REQUEST_TEXT);
  const [startFeedback, setStartFeedback] = useState<DiscussionStartFeedback | null>(null);
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

    setStartFeedback(null);
    setInputError(null);
    startMutation.mutate(parsed.value);
  }

  function fillLocalPresetStartRequest() {
    setInputError(null);
    setStartRequestText(formatPresetJson(LOCAL_PRESET_START_REQUEST));
  }

  function startLocalPresetPipeline(feedback: DiscussionStartFeedback) {
    setStartFeedback(feedback);
    setInputError(null);
    setStartRequestText(formatPresetJson(LOCAL_PRESET_START_REQUEST));
    startMutation.mutate(cloneJsonObject(LOCAL_PRESET_START_REQUEST));
  }

  const strongerOptionsFeedback = {
    title: "Stronger options requested",
    detail:
      "The guided update ran so the strongest current options can be compared again before relying on the conclusion."
  };

  return (
    <DataPanel
      title={t(continuationView.title)}
      description={t(continuationView.description)}
    >
      <div className="du-readable-list">
        <ExplainerItem
          title={t(continuationView.explainerTitle)}
          detail={t(continuationView.explainerDetail)}
        />
      </div>
      <GuidedDiscussionActionPath reviewReady={continuationView.reviewReady} />
      <div className="du-discussion-actions" aria-label={t("Discussion actions")}>
        <p className="du-kicker">{t("Discussion actions")}</p>
        <div className="du-discussion-action-list">
          <button
            type="button"
            className="du-discussion-action-button"
            aria-label={t(continuationView.primaryLabel)}
            onClick={() =>
              startLocalPresetPipeline({
                title: continuationView.primaryResultTitle,
                detail: continuationView.primaryResultDetail
              })
            }
            disabled={startMutation.isPending}
          >
            <span className="du-discussion-action-badge">{t("Recommended")}</span>
            <strong>{t(continuationView.primaryLabel)}</strong>
            <span>{t(continuationView.primaryActionDetail)}</span>
          </button>
          <button
            type="button"
            className="du-discussion-action-button du-discussion-action-secondary"
            aria-label={t("Ask for stronger options")}
            onClick={() => startLocalPresetPipeline(strongerOptionsFeedback)}
            disabled={startMutation.isPending}
          >
            <strong>{t("Ask for stronger options")}</strong>
            <span>
              {t(
                "Refresh the discussion so the strongest current options can be compared and improved."
              )}
            </span>
          </button>
          <a
            className="du-discussion-action-button du-discussion-action-secondary"
            href="#open-disagreements"
            aria-label={t("Review disagreements")}
          >
            <strong>{t("Review disagreements")}</strong>
            <span>
              {t("Jump to unresolved objections that still constrain the conclusion.")}
            </span>
          </a>
          <a
            className="du-discussion-action-button du-discussion-action-secondary"
            href="#answer-requirements"
            aria-label={t("Confirm answer requirements")}
          >
            <strong>{t("Confirm answer requirements")}</strong>
            <span>
              {t(
                "Review requirements that must be satisfied or acknowledged before relying on the conclusion."
              )}
            </span>
          </a>
          <a
            className="du-discussion-action-button du-discussion-action-secondary"
            href="#evidence-gaps"
            aria-label={t("Check evidence")}
          >
            <strong>{t("Check evidence")}</strong>
            <span>
              {t("Review missing or unchecked evidence before relying on the answer.")}
            </span>
          </a>
        </div>
      </div>
      <div className="du-action-row">
        {continuationView.reviewReady ? (
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            {t("View current conclusion")}
          </Link>
        ) : null}
      </div>
      <AdvancedDetails
        summary="Advanced / Developer Mode"
        panelLabel="Advanced start request"
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
          title={t("Discussion could not continue")}
          detail={formatRunStartErrorMessage(startMutation.error)}
        />
      ) : null}
      {startMutation.data ? (
        <StartResult result={startMutation.data} runId={runId} feedback={startFeedback} />
      ) : null}
    </DataPanel>
  );
}

function GuidedDiscussionActionPath({ reviewReady }: { reviewReady: boolean }) {
  const { t } = useI18n();
  const steps = reviewReady
    ? [
        {
          label: "Start here",
          title: "Review current conclusion",
          detail: "Start with the conclusion before changing the room."
        },
        {
          label: "Then",
          title: "Choose a follow-up action",
          detail:
            "Update the conclusion or ask for stronger options after checking disagreements, requirements, and evidence."
        },
        {
          label: "After that",
          title: "Recheck the room outputs",
          detail:
            "Return to strongest options, open disagreements, missing evidence, risks, and next actions."
        }
      ]
    : [
        {
          label: "Start here",
          title: "Continue discussion",
          detail:
            "Collect independent perspectives, strongest options, disagreements, evidence checks, risks, and a draft conclusion."
        },
        {
          label: "Then",
          title: "Review what changed",
          detail:
            "Use the room timeline and discussion outputs to see what each participant contributed."
        },
        {
          label: "After that",
          title: "Open current conclusion",
          detail:
            "When ready, review the conclusion together with risks, missing evidence, and next actions."
        }
      ];

  return (
    <section className="du-guided-action-path" aria-label={t("Recommended action path")}>
      <div>
        <p className="du-kicker">{t("Recommended action path")}</p>
        <h4>{t("Recommended path")}</h4>
        <p>{t("Follow these steps so the discussion keeps moving in user terms.")}</p>
      </div>
      <div className="du-guided-action-path-list">
        {steps.map((step) => (
          <article key={`${step.label}:${step.title}`} className="du-guided-action-step">
            <span>{t(step.label)}</span>
            <strong>{t(step.title)}</strong>
            <p>{t(step.detail)}</p>
          </article>
        ))}
      </div>
    </section>
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

function StartResult({
  result,
  runId,
  feedback
}: {
  result: unknown;
  runId: string;
  feedback?: DiscussionStartFeedback | null;
}) {
  const { t } = useI18n();
  const stages = asArray(getRecordValue(result, "stages")).map(toStageMetadata);
  const stopped = getRecordValue(result, "stopped");
  const readableStages = stages.map(toReadableStageResult);

  return (
    <div className="du-start-result">
      <StatusBanner
        tone={stopped === true ? "warning" : "ok"}
        title={
          stopped === true
            ? t("Discussion paused")
            : t(feedback?.title ?? "Discussion steps completed")
        }
        detail={
          stopped === true
            ? t(
                "The discussion stopped before every requested step finished. Review the visible steps below or open Advanced details for the technical reason."
              )
            : t(
                feedback?.detail ??
                  "The guided discussion steps were recorded. Review the updated perspectives, disagreements, requirements, and current conclusion."
              )
        }
      />
      {stopped === true ? (
        <StatusBanner
          tone="warning"
          title={t("Stop reason")}
          detail={formatRecordValue(getRecordValue(result, "stopReason"))}
        />
      ) : null}
      <DiscussionResultHandoff runId={runId} />
      <ReadableStageResultList stages={readableStages} />
      <AdvancedDetails
        summary="Advanced / Developer Mode"
        panelLabel="Raw stage metadata"
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

function DiscussionResultHandoff({ runId }: { runId: string }) {
  const { t } = useI18n();

  return (
    <section className="du-result-handoff" aria-label={t("Post-update review path")}>
      <div>
        <p className="du-kicker">{t("Post-update review path")}</p>
        <h4>{t("What to review next")}</h4>
        <p>{t("Use these links to return from the completed action to the room view.")}</p>
      </div>
      <div className="du-result-handoff-grid">
        <a
          className="du-result-handoff-card"
          href="#discussion-timeline"
          aria-label={t("Review updated timeline")}
        >
          <span>{t("First")}</span>
          <strong>{t("Review updated timeline")}</strong>
          <p>{t("See where the new steps landed in the discussion flow.")}</p>
        </a>
        <a
          className="du-result-handoff-card"
          href="#discussion-outputs"
          aria-label={t("Review discussion outputs")}
        >
          <span>{t("Then")}</span>
          <strong>{t("Review discussion outputs")}</strong>
          <p>
            {t(
              "Compare strongest options, open disagreements, requirements, and missing evidence."
            )}
          </p>
        </a>
        <Link
          className="du-result-handoff-card du-result-handoff-primary"
          to="/runs/$runId/outcome"
          params={{ runId }}
          aria-label={t("View current conclusion")}
        >
          <span>{t("Finally")}</span>
          <strong>{t("View current conclusion")}</strong>
          <p>{t("Review the conclusion with risks and next actions.")}</p>
        </Link>
      </div>
    </section>
  );
}

type ReadableStageResult = {
  label: string;
  status: string;
  detail: string;
};

function ReadableStageResultList({ stages }: { stages: ReadableStageResult[] }) {
  const { t } = useI18n();

  if (stages.length === 0) {
    return (
      <EmptyState
        title={t("No visible discussion steps")}
        description={t("No user-facing step updates were returned for this request.")}
      />
    );
  }

  return (
    <section className="du-readable-stage-result" aria-label={t("Updated discussion steps")}>
      <div className="du-section-label">
        <p className="du-kicker">{t("Updated discussion steps")}</p>
        <h4>{t("What changed")}</h4>
        <p>{t("Readable summary of the discussion work that just ran.")}</p>
      </div>
      <div className="du-stage-grid">
        {stages.map((stage, index) => (
          <div className="du-stage-pill" key={`${stage.label}-${index}`}>
            <span>{t(stage.label)}</span>
            <strong>{t(stage.status)}</strong>
            <span>{t(stage.detail)}</span>
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
    detail: "A discussion step was updated. Advanced details include the original step name."
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
  const { t } = useI18n();
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
  const eventsQuery = useQuery({
    queryKey: ["run-events", runId],
    queryFn: () => client.getRunEvents(runId)
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
  const roomActivities = createRoomActivityItems(asArray(eventsQuery.data?.events), run);
  const unresolvedObjections = countRecordsWithoutStatus(objections, "resolved");
  const openObligations = countRecordsWithoutStatus(obligations, "satisfied");
  const unresolvedEvidenceNeeds = evidenceNeeds.filter(isUnresolvedEvidenceNeed).length;
  const continuationView = describeDiscussionContinuation(run);
  const nextActionTitle = continuationView.reviewReady
    ? t("Next: review current conclusion")
    : t("Next: continue guided discussion");
  const nextActionDetail = continuationView.reviewReady
    ? t(
        "Start with the conclusion, then inspect disagreements, requirements, and missing evidence before relying on it."
      )
    : t(
        "Continue the guided discussion so the main perspectives, disagreements, requirements, evidence, and conclusion can be produced."
      );

  return (
    <DataPanel
      title={t("Discussion room")}
      description={t(
        "A human-readable room view of the brief, participant perspectives, discussion flow, unresolved disagreements, missing evidence, current conclusion, and next actions."
      )}
    >
      <QueryState query={queryState}>
        <DiscussionRoomActionBar runId={runId} reviewReady={continuationView.reviewReady} />
        <StatusBanner
          tone={continuationView.reviewReady ? "ok" : "warning"}
          title={nextActionTitle}
          detail={nextActionDetail}
        />
        <div className="du-room-layout">
          <div className="du-room-main">
            <DiscussionRoomBrief run={run} />
            <DiscussionRoomTimeline
              run={run}
              activities={roomActivities}
              activityQuery={{
                isLoading: eventsQuery.isLoading,
                isError: eventsQuery.isError,
                error: eventsQuery.error
              }}
              mainPerspectiveCount={candidates.length}
              openDisagreementCount={unresolvedObjections}
              unresolvedEvidenceCount={unresolvedEvidenceNeeds}
              openRequirementCount={openObligations}
            />
            <DiscussionRoomOutputs
              runId={runId}
              reviewReady={continuationView.reviewReady}
              mainPerspectiveCount={candidates.length}
              openDisagreementCount={unresolvedObjections}
              openRequirementCount={openObligations}
              unresolvedEvidenceCount={unresolvedEvidenceNeeds}
            />
            <DiscussionOptionsList candidates={candidates} />
          </div>
          <DiscussionRoomFocusPanel
            runId={runId}
            reviewReady={continuationView.reviewReady}
            openDisagreementCount={unresolvedObjections}
            unresolvedEvidenceCount={unresolvedEvidenceNeeds}
            openRequirementCount={openObligations}
          />
        </div>
        <div className="du-discussion-dashboard-grid">
          {continuationView.reviewReady ? (
            <Link
              className="du-quality-summary-item du-quality-summary-primary"
              to="/runs/$runId/outcome"
              params={{ runId }}
            >
              <span>{t("Ready")}</span>
              <strong>{t("Current conclusion")}</strong>
              <p>
                {t(
                  "A reviewable conclusion is available with risks, evidence gaps, and next actions."
                )}
              </p>
            </Link>
          ) : (
            <div
              className="du-quality-summary-item du-quality-summary-primary du-quality-summary-static"
              role="status"
              aria-label={t("Current conclusion not ready")}
            >
              <span>{t("Not ready")}</span>
              <strong>{t("Current conclusion")}</strong>
              <p>{t("The discussion needs more guided work before a conclusion is useful.")}</p>
            </div>
          )}
          <QualitySummaryLink
            title={t("Main perspectives")}
            detail={t("Strong options stay visible without collapsing into one hidden authority.")}
            metric={String(candidates.length)}
            targetId="main-perspectives"
          />
          <QualitySummaryLink
            title={t("Open disagreements")}
            detail={t("Unresolved objections that still constrain the current conclusion.")}
            metric={String(unresolvedObjections)}
            targetId="open-disagreements"
          />
          <QualitySummaryLink
            title={t("Requirements to satisfy")}
            detail={t("Explicit obligations that keep the output correct, complete, and bounded.")}
            metric={`${openObligations}/${obligations.length}`}
            targetId="answer-requirements"
          />
          <QualitySummaryLink
            title={t("Evidence gaps")}
            detail={t(
              "Missing or unchecked evidence that should be resolved before relying on the answer."
            )}
            metric={`${unresolvedEvidenceNeeds}/${evidenceNeeds.length}`}
            targetId="evidence-gaps"
          />
        </div>
        <div
          className="du-readable-list du-discussion-next-actions"
          aria-label={t("Next recommended actions")}
        >
          <h4>{t("Next recommended actions")}</h4>
          {continuationView.reviewReady ? (
            <article className="du-readable-item">
              <p className="du-kicker">{t("Step 1")}</p>
              <h4>{t("Review current conclusion")}</h4>
              <p>
                {t(
                  "Start with the current conclusion, then check the visible disagreements, requirements, and evidence gaps before relying on it."
                )}
              </p>
              <div className="du-action-row">
                <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
                  {t("Open conclusion")}
                </Link>
              </div>
            </article>
          ) : (
            <article className="du-readable-item">
              <p className="du-kicker">{t("Step 1")}</p>
              <h4>{t("Continue guided discussion")}</h4>
              <p>
                {t(
                  "Continue the discussion so independent first responses, main perspectives, disagreements, requirements, evidence, and a current conclusion can be produced."
                )}
              </p>
            </article>
          )}
          {unresolvedObjections > 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">{t("Check")}</p>
              <h4>{t("Review open disagreements")}</h4>
              <p>
                {t(
                  "There are unresolved disagreements that still constrain the current conclusion."
                )}
              </p>
              <div className="du-action-row">
                <a className="du-action-link du-secondary-link" href="#open-disagreements">
                  {t("View disagreements")}
                </a>
              </div>
            </article>
          ) : null}
          {unresolvedEvidenceNeeds > 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">{t("Check")}</p>
              <h4>{t("Resolve evidence gaps")}</h4>
              <p>
                {t(
                  "Missing or unchecked evidence should be resolved before the conclusion is treated as reliable."
                )}
              </p>
              <div className="du-action-row">
                <a className="du-action-link du-secondary-link" href="#evidence-gaps">
                  {t("Review evidence")}
                </a>
              </div>
            </article>
          ) : null}
          {openObligations > 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">{t("Check")}</p>
              <h4>{t("Confirm answer requirements")}</h4>
              <p>
                {t(
                  "Requirements that are not satisfied yet should be resolved or explicitly acknowledged in the conclusion."
                )}
              </p>
              <div className="du-action-row">
                <a className="du-action-link du-secondary-link" href="#answer-requirements">
                  {t("View requirements")}
                </a>
              </div>
            </article>
          ) : null}
          {candidates.length === 0 ? (
            <article className="du-readable-item">
              <p className="du-kicker">{t("Check")}</p>
              <h4>{t("Collect main perspectives")}</h4>
              <p>
                {t(
                  "No main perspectives are visible yet. Continue the discussion before relying on a conclusion."
                )}
              </p>
            </article>
          ) : null}
        </div>
      </QueryState>
    </DataPanel>
  );
}

function DiscussionRoomActionBar({
  runId,
  reviewReady
}: {
  runId: string;
  reviewReady: boolean;
}) {
  const { t } = useI18n();

  return (
    <nav className="du-room-action-bar" aria-label={t("Primary discussion actions")}>
      {reviewReady ? (
        <>
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            {t("Review current conclusion")}
          </Link>
          <a className="du-action-link du-secondary-link" href="#continue-discussion">
            {t("Update conclusion")}
          </a>
        </>
      ) : (
        <a className="du-action-link" href="#continue-discussion">
          {t("Continue discussion")}
        </a>
      )}
    </nav>
  );
}

function DiscussionRoomBrief({ run }: { run: unknown }) {
  const { t } = useI18n();
  const question =
    getStringRecordValue(run, "topic") ??
    getStringRecordValue(getRecordValue(run, "plan"), "topic") ??
    t("No discussion question is available yet.");
  const goals = getStringArray(getRecordValue(getRecordValue(run, "plan"), "goals"));
  const constraints = getStringArray(
    getRecordValue(getRecordValue(run, "plan"), "constraints")
  );
  const expectedResult = getStringArray(
    getRecordValue(getRecordValue(getRecordValue(run, "plan"), "output"), "expectations")
  );

  return (
    <section className="du-room-brief" aria-label={t("What is being discussed")}>
      <div>
        <p className="du-kicker">{t("What is being discussed")}</p>
        <h4>{t(question)}</h4>
        <p>
          {t(
            "The room keeps the brief, participant perspectives, disagreements, missing evidence, risks, current conclusion, and next actions visible together."
          )}
        </p>
      </div>
      <div className="du-room-brief-grid">
        <RoomBriefItem
          label={t("Goals")}
          value={goals.length > 0 ? formatTranslatedList(t, goals) : t("No goals listed yet.")}
        />
        <RoomBriefItem
          label={t("Constraints")}
          value={
            constraints.length > 0
              ? formatTranslatedList(t, constraints)
              : t("No constraints listed yet.")
          }
        />
        <RoomBriefItem
          label={t("Expected result")}
          value={
            expectedResult.length > 0
              ? formatTranslatedList(t, expectedResult)
              : t("No expected result listed yet.")
          }
        />
      </div>
    </section>
  );
}

function RoomBriefItem({ label, value }: { label: string; value: string }) {
  return (
    <article className="du-room-brief-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatTranslatedList(t: TranslateFunction, values: string[]): string {
  return values.map((value) => t(value)).join("; ");
}

function DiscussionRoomTimeline({
  run,
  activities,
  activityQuery,
  mainPerspectiveCount,
  openDisagreementCount,
  unresolvedEvidenceCount,
  openRequirementCount
}: {
  run: unknown;
  activities: RoomActivityItem[];
  activityQuery: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };
  mainPerspectiveCount: number;
  openDisagreementCount: number;
  unresolvedEvidenceCount: number;
  openRequirementCount: number;
}) {
  const { t } = useI18n();
  const independentResponses = describeStageStatus(
    getRecordValue(run, "sealedDivergenceStatus")
  );
  const mainPerspectives = describeStageStatus(getRecordValue(run, "latestExtractionStatus"));
  const conclusion = describeStageStatus(getRecordValue(run, "latestFinalizationStatus"));
  const participantResponses = getParticipantFirstResponses(activities);
  const activityGroups = groupRoomActivitiesByPhase(activities);
  const progressView = describeDiscussionRoomProgress({
    run,
    mainPerspectiveCount,
    openDisagreementCount,
    unresolvedEvidenceCount,
    openRequirementCount
  });

  return (
    <section
      id="discussion-timeline"
      className="du-room-section"
      aria-label={t("Discussion timeline")}
    >
      <div className="du-section-label">
        <p className="du-kicker">{t("Discussion timeline")}</p>
        <h4>{t("What has happened in the room")}</h4>
        <p>
          {t(
            "Follow the room like a structured conversation: brief, independent first responses, main perspectives, disagreements, evidence checks, and conclusion review."
          )}
        </p>
      </div>
      <div
        className="du-room-progress-summary"
        data-state={progressView.tone}
        role="region"
        aria-label={t("Room progress summary")}
      >
        <article className="du-room-progress-primary">
          <p className="du-kicker">{t("Current phase")}</p>
          <h5>{t(progressView.phaseTitle)}</h5>
          <p>{t(progressView.phaseDetail)}</p>
        </article>
        <article>
          <p className="du-kicker">{t("Next checkpoint")}</p>
          <h5>{t(progressView.nextTitle)}</h5>
          <p>{t(progressView.nextDetail)}</p>
        </article>
        <article className="du-room-progress-checks">
          <p className="du-kicker">{t("Review before relying")}</p>
          <div>
            <span>{t("Open disagreements")}</span>
            <strong>{openDisagreementCount}</strong>
          </div>
          <div>
            <span>{t("Missing evidence")}</span>
            <strong>{unresolvedEvidenceCount}</strong>
          </div>
          <div>
            <span>{t("Requirements to satisfy")}</span>
            <strong>{openRequirementCount}</strong>
          </div>
        </article>
      </div>
      {participantResponses.length > 0 ? (
        <div className="du-room-response-wrap" aria-label={t("Participant first responses")}>
          <div>
            <p className="du-kicker">{t("Participant first responses")}</p>
            <h5>{t("What participants said first")}</h5>
            <p>
              {t(
                "These are the separate first responses before the room organized options, disagreements, and evidence needs."
              )}
            </p>
          </div>
          <div className="du-room-response-grid">
            {participantResponses.map((response, index) => (
              <article
                className="du-room-response-card"
                data-tone={response.tone}
                key={`${response.speaker}:${response.detail}:${index}`}
              >
                <p className="du-kicker">{t("Independent response")}</p>
                <h5>{t(response.speaker)}</h5>
                <p>{t(response.detail)}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <div className="du-room-activity-wrap">
        <div>
          <p className="du-kicker">{t("Room activity")}</p>
          <h5>{t("Readable discussion flow")}</h5>
        </div>
        {activityQuery.isLoading ? (
          <StatusBanner title={t("Loading room activity")} />
        ) : activityQuery.isError ? (
          <StatusBanner
            tone="warning"
            title={t("Could not load room activity")}
            detail={formatSafeErrorMessage(activityQuery.error)}
          />
        ) : activities.length === 0 ? (
          <EmptyState
            title={t("No room activity visible yet")}
            description={t(
              "Continue the discussion so the room can show participant responses and discussion updates."
            )}
          />
        ) : (
          <div
            className="du-room-activity-groups"
            role="region"
            aria-label={t("Conversation transcript")}
          >
            {activityGroups.map((group) => {
              const phaseView = describeRoomActivityPhase(group.phase);

              return (
                <section
                  className="du-room-activity-group"
                  data-phase={group.phase}
                  aria-label={t(phaseView.updatesLabel)}
                  key={group.phase}
                >
                  <div className="du-room-activity-group-header">
                    <p className="du-kicker">{t(phaseView.label)}</p>
                    <p>{t(phaseView.detail)}</p>
                  </div>
                  <ol className="du-room-activity" aria-label={t(phaseView.updatesLabel)}>
                    {group.activities.map((activity, index) => {
                      const activityPhaseView = describeRoomActivityPhase(activity.phase);

                      return (
                        <li
                          className="du-room-activity-item"
                          data-speaker={
                            isRoomSpeaker(activity.speaker) ? "room" : "participant"
                          }
                          data-tone={activity.tone}
                          key={`${activity.title}:${index}`}
                        >
                          <span className="du-room-activity-avatar" aria-hidden="true">
                            {formatSpeakerInitials(t(activity.speaker))}
                          </span>
                          <div className="du-room-activity-bubble">
                            <div className="du-room-activity-meta">
                              <p className="du-kicker">{t(activity.speaker)}</p>
                              <span>{t(activityPhaseView.label)}</span>
                            </div>
                            <h5>{t(activity.title)}</h5>
                            <p>{t(activity.detail)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </div>
      <div className="du-room-stage-wrap">
        <p className="du-kicker">{t("Core discussion stages")}</p>
        <h5>{t("Structured deliberation progress")}</h5>
      </div>
      <ol className="du-room-flow">
        <DiscussionRoomFlowStep
          label={t("Discussion brief")}
          status={t("Ready")}
          detail={t(
            "The question, goals, and constraints are visible before discussion work begins."
          )}
        />
        <DiscussionRoomFlowStep
          label={t("Independent first responses")}
          status={t(independentResponses.label)}
          detail={t(independentResponses.detail)}
        />
        <DiscussionRoomFlowStep
          label={t("Participant perspectives")}
          status={t(mainPerspectives.label)}
          detail={t(
            mainPerspectiveCount === 1
              ? "{count} readable perspective is visible in the room."
              : "{count} readable perspectives are visible in the room.",
            { count: mainPerspectiveCount }
          )}
        />
        <DiscussionRoomFlowStep
          label={t("Disagreements and evidence")}
          status={
            openDisagreementCount + unresolvedEvidenceCount > 0
              ? t("Needs review")
              : t("No open items visible")
          }
          detail={t(
            openDisagreementCount === 1 && unresolvedEvidenceCount === 1
              ? "{disagreements} open disagreement and {evidence} evidence gap are visible."
              : openDisagreementCount === 1
                ? "{disagreements} open disagreement and {evidence} evidence gaps are visible."
                : unresolvedEvidenceCount === 1
                  ? "{disagreements} open disagreements and {evidence} evidence gap are visible."
                  : "{disagreements} open disagreements and {evidence} evidence gaps are visible.",
            {
              disagreements: openDisagreementCount,
              evidence: unresolvedEvidenceCount
            }
          )}
        />
        <DiscussionRoomFlowStep
          label={t("Current conclusion")}
          status={t(conclusion.label)}
          detail={t(conclusion.detail)}
        />
      </ol>
    </section>
  );
}

function describeDiscussionRoomProgress({
  run,
  mainPerspectiveCount,
  openDisagreementCount,
  unresolvedEvidenceCount,
  openRequirementCount
}: {
  run: unknown;
  mainPerspectiveCount: number;
  openDisagreementCount: number;
  unresolvedEvidenceCount: number;
  openRequirementCount: number;
}): DiscussionRoomProgressView {
  const sealedStatus = getRecordValue(run, "sealedDivergenceStatus");
  const extractionStatus = getRecordValue(run, "latestExtractionStatus");
  const finalizationStatus = getRecordValue(run, "latestFinalizationStatus");
  const ledgerEventCount = getRecordValue(getRecordValue(run, "ledger"), "eventCount");
  const hasRecordedDiscussionWork =
    typeof ledgerEventCount === "number"
      ? ledgerEventCount > 1
      : sealedStatus !== undefined ||
        extractionStatus !== undefined ||
        finalizationStatus !== undefined;
  const openItemCount = openDisagreementCount + unresolvedEvidenceCount + openRequirementCount;

  if (isCompletedDiscussionStatus(finalizationStatus)) {
    return {
      tone: "ready",
      phaseTitle: "Current conclusion ready",
      phaseDetail:
        "The room has a reviewable conclusion. Check open disagreements, requirements, evidence gaps, and risks before relying on it.",
      nextTitle: "Review current conclusion",
      nextDetail:
        openItemCount > 0
          ? "Review current conclusion with open items visible."
          : "Open the current conclusion and confirm it matches the discussion brief."
    };
  }

  if (
    isCompletedDiscussionStatus(extractionStatus) ||
    (mainPerspectiveCount > 0 && hasRecordedDiscussionWork)
  ) {
    return {
      tone: "active",
      phaseTitle: "Comparing strongest options",
      phaseDetail:
        "Strongest options are visible. Review disagreements, requirements, and evidence gaps before updating the conclusion.",
      nextTitle: "Update conclusion",
      nextDetail:
        openItemCount > 0
          ? "Update the conclusion after reviewing the visible open items."
          : "Update the discussion so the room can draft a current conclusion."
    };
  }

  if (isCompletedDiscussionStatus(sealedStatus)) {
    return {
      tone: "active",
      phaseTitle: "Reviewing independent first responses",
      phaseDetail:
        "Independent first responses are visible before the room converges on strongest current options.",
      nextTitle: "Organize strongest options",
      nextDetail:
        "Continue the discussion so the room can organize perspectives, disagreements, and evidence needs."
    };
  }

  return {
    tone: "pending",
    phaseTitle: "Collecting first perspectives",
    phaseDetail:
      "The discussion brief is ready. Continue the discussion to collect independent first responses.",
    nextTitle: "Collect independent first responses",
    nextDetail: "Continue the discussion before comparing options or reviewing a conclusion."
  };
}

function isCompletedDiscussionStatus(status: unknown): boolean {
  return (
    status === "completed" ||
    status === "revealed" ||
    status === "draft" ||
    status === "provisional"
  );
}

function getParticipantFirstResponses(activities: RoomActivityItem[]): RoomActivityItem[] {
  return activities.filter(
    (activity) =>
      activity.title === "Independent response submitted" &&
      activity.detail !==
        "This response is sealed until the independent first responses are revealed."
  );
}

const ROOM_ACTIVITY_PHASE_ORDER: readonly RoomActivityPhaseId[] = [
  "brief",
  "first-responses",
  "perspectives",
  "evidence",
  "conclusion"
];

function createRoomActivityItems(events: unknown[], run: unknown): RoomActivityItem[] {
  return [...events]
    .sort(compareRunEvents)
    .map((event) => createRoomActivityItem(event, run))
    .filter((activity): activity is RoomActivityItem => Boolean(activity));
}

function groupRoomActivitiesByPhase(activities: RoomActivityItem[]): RoomActivityGroup[] {
  const grouped = new Map<RoomActivityPhaseId, RoomActivityItem[]>(
    ROOM_ACTIVITY_PHASE_ORDER.map((phase) => [phase, []])
  );

  for (const activity of activities) {
    grouped.get(activity.phase)?.push(activity);
  }

  return ROOM_ACTIVITY_PHASE_ORDER.flatMap((phase) => {
    const groupActivities = grouped.get(phase) ?? [];

    return groupActivities.length > 0
      ? [
          {
            phase,
            activities: groupActivities
          }
        ]
      : [];
  });
}

function describeRoomActivityPhase(phase: RoomActivityPhaseId): RoomActivityPhaseView {
  if (phase === "brief") {
    return {
      label: "Discussion brief",
      detail: "The room starts by making the question, goals, and constraints visible.",
      updatesLabel: "Discussion brief updates"
    };
  }

  if (phase === "first-responses") {
    return {
      label: "Independent first responses",
      detail: "Participants respond separately before comparing answers.",
      updatesLabel: "Independent first response updates"
    };
  }

  if (phase === "perspectives") {
    return {
      label: "Main perspectives and disagreements",
      detail: "The room organizes strongest options and keeps challenges visible.",
      updatesLabel: "Main perspective and disagreement updates"
    };
  }

  if (phase === "evidence") {
    return {
      label: "Evidence and verification",
      detail:
        "Evidence checks and missing information are kept visible before relying on a conclusion.",
      updatesLabel: "Evidence and verification updates"
    };
  }

  return {
    label: "Current conclusion and risk review",
    detail: "The room drafts a conclusion and records risks or boundaries for review.",
    updatesLabel: "Current conclusion and risk review updates"
  };
}

function isRoomSpeaker(speaker: string): boolean {
  return normalizeActorLabel(speaker) === "discussion-room";
}

function formatSpeakerInitials(speaker: string): string {
  const words = speaker.trim().split(/\s+/).filter((word) => word.length > 0);

  if (words.length === 0) {
    return "?";
  }

  const firstWord = words[0] ?? "?";

  if (words.length === 1) {
    return firstWord.slice(0, 2).toUpperCase();
  }

  const secondWord = words[1] ?? "";

  return `${firstWord.slice(0, 1)}${secondWord.slice(0, 1)}`.toUpperCase();
}

function createRoomActivityItem(event: unknown, run: unknown): RoomActivityItem | null {
  const type = getStringRecordValue(event, "type");
  const payload = getRecordValue(event, "payload");
  const speaker = getRoomEventSpeaker(event, run);

  if (type === "topic_contract_published") {
    return {
      speaker: "Discussion room",
      title: "Discussion brief published",
      detail:
        getFirstStringRecordValue(payload, ["topic", "question", "summary"]) ??
        "The discussion brief is available for everyone in the room.",
      tone: "ok",
      phase: "brief"
    };
  }

  if (type === "sealed_batch_opened") {
    return {
      speaker: "Discussion room",
      title: "Independent first responses opened",
      detail:
        "Participants can respond separately before seeing one another's answers.",
      tone: "neutral",
      phase: "first-responses"
    };
  }

  if (type === "sealed_contribution_submitted") {
    return {
      speaker,
      title: "Independent response submitted",
      detail: isRedactedPayload(payload)
        ? "This response is sealed until the independent first responses are revealed."
        : describeContributionPayload(payload),
      tone: isRedactedPayload(payload) ? "warning" : "ok",
      phase: "first-responses"
    };
  }

  if (type === "sealed_batch_revealed") {
    return {
      speaker: "Discussion room",
      title: "Independent first responses revealed",
      detail: "The independent responses are now available for review.",
      tone: "ok",
      phase: "first-responses"
    };
  }

  if (type === "extraction_proposed") {
    return {
      speaker,
      title: "Main perspectives organized",
      detail:
        getStringRecordValue(payload, "rationale") ??
        "The revealed responses were organized into options, disagreements, requirements, and evidence needs.",
      tone: "ok",
      phase: "perspectives"
    };
  }

  if (type === "proposal_accepted") {
    return {
      speaker,
      title: "Discussion material accepted for review",
      detail:
        getStringRecordValue(payload, "rationale") ??
        "The room accepted this discussion material as part of the current working view.",
      tone: "ok",
      phase: "perspectives"
    };
  }

  if (type === "proposal_challenged") {
    return {
      speaker,
      title: "Open disagreement recorded",
      detail:
        getStringRecordValue(payload, "reason") ??
        "A challenge was recorded against the current discussion material.",
      tone: "warning",
      phase: "perspectives"
    };
  }

  if (type === "evidence_result_recorded") {
    return {
      speaker,
      title: "Evidence check recorded",
      detail:
        getFirstStringRecordValue(payload, ["summary", "result", "status"]) ??
        "An evidence check result was added to the discussion.",
      tone: "ok",
      phase: "evidence"
    };
  }

  if (type === "final_candidate_proposed") {
    return {
      speaker,
      title: "Current conclusion drafted",
      detail:
        getStringRecordValue(payload, "recommendation") ??
        "A reviewable conclusion draft was prepared from the current discussion material.",
      tone: "ok",
      phase: "conclusion"
    };
  }

  if (type === "final_audit_recorded") {
    return {
      speaker,
      title: "Risk review recorded",
      detail:
        getFirstStringRecordValue(payload, ["summary", "rationale"]) ??
        "A risk review was recorded for the current conclusion.",
      tone: "warning",
      phase: "conclusion"
    };
  }

  return null;
}

function getRoomEventSpeaker(event: unknown, run: unknown): string {
  const authorId = getStringRecordValue(event, "authorId");

  if (!authorId || authorId === "system") {
    return "Discussion room";
  }

  const participantDisplayName = getParticipantDisplayName(run, authorId);

  return (
    getUserFacingActorLabel(authorId) ??
    getUserFacingActorLabel(participantDisplayName) ??
    participantDisplayName ??
    humanizeIdentifier(authorId)
  );
}

function getParticipantDisplayName(run: unknown, participantId: string): string | undefined {
  const participants = asArray(getRecordValue(getRecordValue(run, "plan"), "participants"));

  for (const participant of participants) {
    if (getStringRecordValue(participant, "id") !== participantId) {
      continue;
    }

    return getFirstStringRecordValue(participant, ["displayName", "name", "label"]);
  }

  return undefined;
}

function getUserFacingActorLabel(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return USER_FACING_ACTOR_LABELS[normalizeActorLabel(value)];
}

function normalizeActorLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function isRedactedPayload(payload: unknown): boolean {
  return getRecordValue(payload, "redacted") === true;
}

function describeContributionPayload(payload: unknown): string {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  const readable =
    getFirstStringRecordValue(payload, [
      "summary",
      "content",
      "position",
      "answer",
      "message",
      "text",
      "claim",
      "recommendation",
      "description",
      "rationale",
      "reason"
    ]);

  if (readable) {
    return readable;
  }

  const nestedReadable = getFirstStringRecordValue(
    getFirstRecordValue(payload, ["response", "output", "result"]),
    [
      "summary",
      "content",
      "position",
      "answer",
      "message",
      "text",
      "claim",
      "recommendation",
      "description",
      "rationale",
      "reason"
    ]
  );

  if (nestedReadable) {
    return nestedReadable;
  }

  return "This participant response is available for review in the room.";
}

function DiscussionRoomFlowStep({
  label,
  status,
  detail
}: {
  label: string;
  status: string;
  detail: string;
}) {
  return (
    <li className="du-room-flow-step">
      <span className="du-room-flow-marker" aria-hidden="true" />
      <div>
        <p className="du-kicker">{label}</p>
        <h5>{status}</h5>
        <p>{detail}</p>
      </div>
    </li>
  );
}

function DiscussionRoomOutputs({
  runId,
  reviewReady,
  mainPerspectiveCount,
  openDisagreementCount,
  openRequirementCount,
  unresolvedEvidenceCount
}: {
  runId: string;
  reviewReady: boolean;
  mainPerspectiveCount: number;
  openDisagreementCount: number;
  openRequirementCount: number;
  unresolvedEvidenceCount: number;
}) {
  const { t } = useI18n();

  return (
    <section
      id="discussion-outputs"
      className="du-room-section"
      aria-label={t("Discussion outputs")}
    >
      <div className="du-section-label">
        <p className="du-kicker">{t("Discussion outputs")}</p>
        <h4>{t("What the room has produced")}</h4>
        <p>
          {t(
            "Use this as the bridge from the discussion timeline to the current decision material."
          )}
        </p>
      </div>
      <div className="du-room-output-grid">
        <DiscussionRoomOutputLink
          href="#main-perspectives"
          metric={String(mainPerspectiveCount)}
          title={t("Strongest current options")}
          detail={describeOutputCount(
            t,
            mainPerspectiveCount,
            "option ready to compare",
            "options ready to compare"
          )}
        />
        <DiscussionRoomOutputLink
          href="#open-disagreements"
          metric={String(openDisagreementCount)}
          title={t("Open disagreements")}
          detail={describeOutputCount(
            t,
            openDisagreementCount,
            "open disagreement to review",
            "open disagreements to review"
          )}
        />
        <DiscussionRoomOutputLink
          href="#answer-requirements"
          metric={String(openRequirementCount)}
          title={t("Requirements to satisfy")}
          detail={describeOutputCount(
            t,
            openRequirementCount,
            "answer requirement to confirm",
            "answer requirements to confirm"
          )}
        />
        <DiscussionRoomOutputLink
          href="#evidence-gaps"
          metric={String(unresolvedEvidenceCount)}
          title={t("Missing evidence")}
          detail={describeOutputCount(
            t,
            unresolvedEvidenceCount,
            "evidence gap to check",
            "evidence gaps to check"
          )}
        />
        {reviewReady ? (
          <Link
            className="du-room-output-item du-room-output-primary"
            to="/runs/$runId/outcome"
            params={{ runId }}
          >
            <span>{t("Ready")}</span>
            <strong>{t("Current conclusion")}</strong>
            <p>{t("A reviewable conclusion is ready with risks and next actions.")}</p>
          </Link>
        ) : (
          <div
            className="du-room-output-item du-room-output-primary"
            role="status"
            aria-label={t("Current conclusion not ready")}
          >
            <span>{t("Not ready")}</span>
            <strong>{t("Current conclusion")}</strong>
            <p>{t("Continue the discussion before relying on a conclusion.")}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DiscussionRoomOutputLink({
  href,
  metric,
  title,
  detail
}: {
  href: string;
  metric: string;
  title: string;
  detail: string;
}) {
  return (
    <a className="du-room-output-item" href={href}>
      <span>{metric}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </a>
  );
}

function describeOutputCount(
  t: TranslateFunction,
  count: number,
  singular: string,
  plural: string
): string {
  if (count === 0) {
    return t("No {item}", { item: t(plural) });
  }

  return t("{count} {item}", {
    count,
    item: t(count === 1 ? singular : plural)
  });
}

function DiscussionOptionsList({ candidates }: { candidates: unknown[] }) {
  const { t } = useI18n();

  return (
    <section className="du-room-section" aria-label={t("Strongest current options")}>
      <div className="du-section-label">
        <p className="du-kicker">{t("Strongest current options")}</p>
        <h4>{t("What the strongest options say now")}</h4>
        <p>
          {t(
            "These options synthesize the discussion so far. Individual participant statements remain in the timeline above."
          )}
        </p>
      </div>
      {candidates.length === 0 ? (
        <EmptyState
          title={t("No strongest options visible yet")}
          description={t(
            "Continue the guided discussion so the room can organize participant statements into strongest current options."
          )}
        />
      ) : (
        <div className="du-room-contributions">
          {candidates.map((candidate, index) => {
            const summary = summarizeRoomOption(candidate, index, t);

            return (
              <article
                className="du-room-contribution"
                key={`${summary.speaker}:${summary.title}:${index}`}
              >
                <p className="du-kicker">{summary.speaker}</p>
                <h5>{t(summary.title)}</h5>
                <p>{t(summary.detail)}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DiscussionRoomFocusPanel({
  runId,
  reviewReady,
  openDisagreementCount,
  unresolvedEvidenceCount,
  openRequirementCount
}: {
  runId: string;
  reviewReady: boolean;
  openDisagreementCount: number;
  unresolvedEvidenceCount: number;
  openRequirementCount: number;
}) {
  const { t } = useI18n();
  const openItemCount = openDisagreementCount + unresolvedEvidenceCount + openRequirementCount;
  const nextActionLabel = reviewReady ? "Review current conclusion" : "Continue discussion";
  const nextActionDetail = reviewReady
    ? "Open the conclusion, then check disagreements, evidence, risks, and requirements before relying on it."
    : "Continue the guided flow to produce perspectives, disagreements, evidence checks, risks, and a conclusion.";

  return (
    <aside
      className="du-room-focus"
      aria-label={t("Current room summary")}
      data-state={reviewReady ? "ready" : "pending"}
    >
      <div className="du-room-focus-section">
        <p className="du-kicker">{t("Decision workspace")}</p>
        <h4>{t("Current conclusion: {status}", {
          status: reviewReady ? t("Ready to review") : t("Not ready yet")
        })}</h4>
        <p>
          {reviewReady
            ? t(
                "Review the conclusion together with disagreements, evidence gaps, risks, and next actions."
              )
            : t("Continue the discussion before treating any answer as a conclusion.")}
        </p>
      </div>
      <div className="du-room-focus-section du-room-focus-next">
        <p className="du-kicker">{t("Next action")}</p>
        <strong>{t(nextActionLabel)}</strong>
        <p>{t(nextActionDetail)}</p>
        <div className="du-action-row">
          {reviewReady ? (
            <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
              {t("Review current conclusion")}
            </Link>
          ) : (
            <a className="du-action-link" href="#continue-discussion">
              {t("Continue discussion")}
            </a>
          )}
        </div>
      </div>
      <div className="du-room-focus-section du-room-focus-checklist">
        <h5>{t("What to review")}</h5>
        <a href="#open-disagreements" data-state={openDisagreementCount > 0 ? "needs-review" : "clear"}>
          <span>{t("Open disagreements")}</span>
          <strong>{openDisagreementCount}</strong>
          <p>{t("Unresolved objections that still constrain the current conclusion.")}</p>
        </a>
        <a href="#evidence-gaps" data-state={unresolvedEvidenceCount > 0 ? "needs-review" : "clear"}>
          <span>{t("Missing evidence")}</span>
          <strong>{unresolvedEvidenceCount}</strong>
          <p>{t("Missing or unchecked evidence that should be resolved before relying on the answer.")}</p>
        </a>
        <a href="#answer-requirements" data-state={openRequirementCount > 0 ? "needs-review" : "clear"}>
          <span>{t("Requirements to satisfy")}</span>
          <strong>{openRequirementCount}</strong>
          <p>{t("Explicit obligations that keep the output correct, complete, and bounded.")}</p>
        </a>
        <div data-state={openItemCount > 0 ? "needs-review" : "clear"}>
          <span>{t("Risks")}</span>
          <strong>
            {openItemCount > 0 ? t("Review needed") : t("No open blockers visible")}
          </strong>
          <p>
            {openItemCount > 0
              ? t("Open items remain visible here so the conclusion is not treated as final.")
              : t("No unresolved blockers are visible in the room summary.")}
          </p>
        </div>
      </div>
    </aside>
  );
}

function summarizeRoomOption(
  candidate: unknown,
  index: number,
  t: TranslateFunction
): { speaker: string; title: string; detail: string } {
  const object = getRecordValue(candidate, "object") ?? candidate;
  const speaker = getRoomContributorLabel(candidate, index, t);

  return {
    speaker,
    title:
      getFirstStringRecordValue(object, ["title", "name", "summary"]) ??
      t("Option {number}", { number: index + 1 }),
    detail:
      getFirstStringRecordValue(object, ["summary", "rationale", "description", "claim"]) ??
      t("This perspective is part of the strongest current options in the room.")
  };
}

function getRoomContributorLabel(
  candidate: unknown,
  index: number,
  t: TranslateFunction
): string {
  const object = getRecordValue(candidate, "object") ?? candidate;
  const explicitLabel =
    getFirstStringRecordValue(candidate, [
      "participantName",
      "participantLabel",
      "model",
      "authorName"
    ]) ??
    getFirstStringRecordValue(object, [
      "participantName",
      "participantLabel",
      "model",
      "authorName"
    ]);

  const participantId =
    getFirstStringRecordValue(candidate, ["participantId", "authorId"]) ??
    getFirstStringRecordValue(object, ["participantId", "authorId"]);

  const userFacingActorLabel =
    getUserFacingActorLabel(participantId) ?? getUserFacingActorLabel(explicitLabel);

  if (userFacingActorLabel) {
    return t(userFacingActorLabel);
  }

  if (explicitLabel) {
    return explicitLabel;
  }

  if (participantId) {
    return humanizeIdentifier(participantId);
  }

  return t("Option {number}", { number: index + 1 });
}

function QualitySummaryLink({
  title,
  detail,
  metric,
  targetId
}: {
  title: string;
  detail: string;
  metric: string;
  targetId: string;
}) {
  return (
    <a className="du-quality-summary-item" href={`#${targetId}`}>
      <span>{metric}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </a>
  );
}

export function OutcomeBrief({
  outcome,
  context = EMPTY_OUTCOME_CONTEXT
}: {
  outcome: unknown;
  context?: OutcomeBriefContext;
}) {
  const { t } = useI18n();
  const recommendation =
    getStringRecordValue(outcome, "recommendation") ??
    getStringRecordValue(outcome, "summary") ??
    t("No current conclusion is available yet.");
  const unresolvedQuestions = getStringArray(getRecordValue(outcome, "unresolvedQuestions"));
  const limitations = getStringArray(getRecordValue(outcome, "limitations"));
  const risksAndBoundaries = uniqueReadableStrings([
    ...getOutcomeAuditRisks(outcome),
    ...limitations
  ]);
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
  const openQualityObligations = countRecordsWithoutStatus(
    visibleQualityObligations,
    "satisfied"
  );
  const mainPerspectiveDetail =
    alternatives.length > 0
      ? describeOutcomeCount(t, alternatives.length, "explored option", "explored options")
      : describeOutcomeCount(
          t,
          mainPerspectives.length,
          "visible perspective",
          "visible perspectives"
        );
  const evidenceDetail =
    visibleEvidenceNeeds.length === 0
      ? t("No evidence gaps listed")
      : describeEvidenceCountSummary(
          t,
          unresolvedEvidenceNeeds,
          visibleEvidenceNeeds.length
        );
  const nextActionDetail =
    continuationSuggestions.length === 0
      ? t("No next recommended actions are listed yet.")
      : describeReviewItemCount(
          t,
          continuationSuggestions.length,
          "recommended next action",
          "recommended next actions"
        );

  return (
    <div className="du-outcome-brief">
      <section
        id="current-recommendation"
        className="du-outcome-hero"
        aria-label={t("Current conclusion snapshot")}
      >
        <article className="du-outcome-recommendation">
          <p className="du-kicker">{t("Current recommendation")}</p>
          <h4>{t(recommendation)}</h4>
        </article>
        <div className="du-outcome-status-grid">
          <OutcomeStatusItem
            title={t("Main perspectives")}
            value={String(mainPerspectives.length)}
            detail={mainPerspectiveDetail}
          />
          <OutcomeStatusItem
            title={t("Open disagreements")}
            value={String(openDisagreements.length)}
            detail={describeOutcomeCount(
              t,
              openDisagreements.length,
              "open disagreement",
              "open disagreements"
            )}
            tone={openDisagreements.length > 0 ? "warning" : "ok"}
          />
          <OutcomeStatusItem
            title={t("Missing evidence")}
            value={
              visibleEvidenceNeeds.length === 0
                ? "0"
                : `${unresolvedEvidenceNeeds}/${visibleEvidenceNeeds.length}`
            }
            detail={evidenceDetail}
            tone={unresolvedEvidenceNeeds > 0 ? "warning" : "ok"}
          />
          <OutcomeStatusItem
            title={t("Risks and boundaries")}
            value={String(risksAndBoundaries.length)}
            detail={describeOutcomeCount(
              t,
              risksAndBoundaries.length,
              "risk or boundary",
              "risks or boundaries"
            )}
            tone={risksAndBoundaries.length > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>
      <section className="du-outcome-review-path" aria-label={t("Conclusion review path")}>
        <div>
          <p className="du-kicker">{t("Review path")}</p>
          <h4>{t("Before relying on this conclusion")}</h4>
          <p>
            {t(
              "Start with the recommendation, then check disagreements, evidence gaps, risks, answer requirements, and next recommended actions."
            )}
          </p>
        </div>
        <div className="du-outcome-review-grid">
          <OutcomeReviewPathItem
            href="#current-recommendation"
            title={t("Read the recommendation")}
            detail={t(
              "Use the current recommendation as reviewable material, not as an unquestioned final answer."
            )}
            tone="neutral"
          />
          <OutcomeReviewPathItem
            href="#open-disagreements"
            title={t("Review open disagreements")}
            detail={describeReviewItemCount(
              t,
              openDisagreements.length,
              "open disagreement needs review",
              "open disagreements need review"
            )}
            tone={openDisagreements.length > 0 ? "warning" : "ok"}
          />
          <OutcomeReviewPathItem
            href="#missing-evidence"
            title={t("Check missing evidence")}
            detail={describeEvidenceReviewDetail(
              t,
              unresolvedEvidenceNeeds,
              visibleEvidenceNeeds.length
            )}
            tone={unresolvedEvidenceNeeds > 0 ? "warning" : "ok"}
          />
          <OutcomeReviewPathItem
            href="#risks-and-boundaries"
            title={t("Review risks and boundaries")}
            detail={describeReviewItemCount(
              t,
              risksAndBoundaries.length,
              "risk or boundary to review",
              "risks or boundaries to review"
            )}
            tone={risksAndBoundaries.length > 0 ? "warning" : "ok"}
          />
          <OutcomeReviewPathItem
            href="#answer-requirements"
            title={t("Confirm answer requirements")}
            detail={describeReviewItemCount(
              t,
              openQualityObligations,
              "answer requirement needs confirmation",
              "answer requirements need confirmation"
            )}
            tone={openQualityObligations > 0 ? "warning" : "ok"}
          />
          <OutcomeReviewPathItem
            href="#next-recommended-actions"
            title={t("Use next recommended actions")}
            detail={nextActionDetail}
            tone={continuationSuggestions.length > 0 ? "ok" : "warning"}
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
          id="risks-and-boundaries"
          title="Risks and boundaries"
          items={risksAndBoundaries}
          emptyTitle="No risks or boundaries listed"
        />
      </div>
      <ReadableRecordList
        id="main-perspectives"
        title="Main perspectives"
        items={mainPerspectives}
        emptyTitle="No main perspectives listed"
        summarizeItem={summarizeAlternative}
      />
      <ReadableRecordList
        id="open-disagreements"
        title="Open disagreements"
        items={openDisagreements}
        emptyTitle="No open disagreements listed"
        summarizeItem={summarizeOpenObjection}
      />
      <ReadableRecordList
        id="missing-evidence"
        title="Missing evidence"
        items={visibleEvidenceNeeds}
        emptyTitle="No missing evidence listed"
        summarizeItem={summarizeEvidenceNeed}
      />
      <ReadableRecordList
        id="answer-requirements"
        title="Requirements this answer must satisfy"
        items={visibleQualityObligations}
        emptyTitle="No answer requirements listed"
        summarizeItem={summarizeQualityObligation}
      />
      <ReadableStringList
        id="next-recommended-actions"
        title="Next recommended actions"
        items={continuationSuggestions}
        emptyTitle="No next recommended actions listed"
      />
    </div>
  );
}

function OutcomeReviewPathItem({
  href,
  title,
  detail,
  tone
}: {
  href: string;
  title: string;
  detail: string;
  tone: "neutral" | "ok" | "warning";
}) {
  return (
    <a className={`du-outcome-review-item du-outcome-review-${tone}`} href={href}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </a>
  );
}

function preferOutcomeRecords(outcomeRecords: unknown[], contextRecords: unknown[]): unknown[] {
  return outcomeRecords.length > 0 ? outcomeRecords : contextRecords;
}

function getOutcomeAuditRisks(outcome: unknown): string[] {
  const audits = asArray(getRecordValue(outcome, "audits"));

  return audits.flatMap((auditRecord) => {
    const audit = getRecordValue(auditRecord, "audit") ?? auditRecord;

    return getStringArray(getRecordValue(audit, "risks"));
  });
}

function uniqueReadableStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
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
  id,
  title,
  items,
  emptyTitle
}: {
  id?: string;
  title: string;
  items: string[];
  emptyTitle: string;
}) {
  const { t } = useI18n();
  const visibleTitle = t(title);

  return (
    <div id={id} className="du-readable-list">
      <h4>{visibleTitle}</h4>
      {items.length === 0 ? (
        <EmptyState
          title={t(emptyTitle)}
          description={t("Nothing is listed for this section yet.")}
        />
      ) : (
        items.map((item, index) => (
          <article className="du-readable-item" key={`${title}:${index}:${item}`}>
            <p className="du-kicker">
              {t("{section} {number}", { section: visibleTitle, number: index + 1 })}
            </p>
            <p>{t(item)}</p>
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
  id,
  title,
  items,
  emptyTitle,
  summarizeItem
}: {
  id?: string;
  title: string;
  items: unknown[];
  emptyTitle: string;
  summarizeItem: (
    item: unknown,
    index: number,
    t: TranslateFunction
  ) => OutcomeRecordSummary;
}) {
  const { t } = useI18n();

  return (
    <div id={id} className="du-readable-list">
      <h4>{t(title)}</h4>
      {items.length === 0 ? (
        <EmptyState
          title={t(emptyTitle)}
          description={t("Nothing is listed for this section yet.")}
        />
      ) : (
        items.map((item, index) => {
          const summary = summarizeItem(item, index, t);

          return (
            <article
              className="du-readable-item"
              key={`${title}:${index}:${summary.kicker}:${summary.title}`}
            >
              <p className="du-kicker">{summary.kicker}</p>
              <h5>{t(summary.title)}</h5>
              <p>{t(summary.detail)}</p>
              {summary.meta ? <p className="du-readable-meta">{t(summary.meta)}</p> : null}
            </article>
          );
        })
      )}
    </div>
  );
}

function summarizeAlternative(
  item: unknown,
  index: number,
  t: TranslateFunction
): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: t("Perspective {number}", { number: index + 1 }),
    fallbackKicker: t("Perspective {number}", { number: index + 1 }),
    fallbackDetail: t("This perspective is included in the current discussion material."),
    titleKeys: ["title", "name"],
    detailKeys: ["summary", "rationale", "description", "text", "claim"]
  }, t);
}

function summarizeOpenObjection(
  item: unknown,
  index: number,
  t: TranslateFunction
): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: t("Open disagreement {number}", { number: index + 1 }),
    fallbackKicker: t("Disagreement {number}", { number: index + 1 }),
    fallbackDetail: t(
      "This disagreement is tracked, but it does not have a plain-language summary yet."
    ),
    titleKeys: ["title", "summary", "claim", "failureMode"],
    detailKeys: ["reason", "description", "consequence", "impact", "mitigation", "text"]
  }, t);
}

function summarizeEvidenceNeed(
  item: unknown,
  index: number,
  t: TranslateFunction
): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: t("Missing evidence {number}", { number: index + 1 }),
    fallbackKicker: t("Evidence gap {number}", { number: index + 1 }),
    fallbackDetail: t("This evidence gap still needs verification."),
    titleKeys: ["question", "title", "summary"],
    detailKeys: ["description", "summary", "rationale", "text", "claim"]
  }, t);
}

function summarizeQualityObligation(
  item: unknown,
  index: number,
  t: TranslateFunction
): OutcomeRecordSummary {
  return summarizeOutcomeRecord(item, index, {
    fallbackTitle: t("Requirement {number}", { number: index + 1 }),
    fallbackKicker: t("Requirement {number}", { number: index + 1 }),
    fallbackDetail: t(
      "This requirement should remain visible while reviewing the conclusion."
    ),
    titleKeys: ["requirement", "title", "summary"],
    detailKeys: ["description", "rationale", "text", "claim"]
  }, t);
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
  },
  t: TranslateFunction
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
    kicker: status ? formatOutcomeRecordStatusForUser(t, status) : options.fallbackKicker,
    title:
      getFirstStringRecordValue(object, options.titleKeys) ??
      options.fallbackTitle,
    detail:
      getFirstStringRecordValue(object, options.detailKeys) ??
      options.fallbackDetail
  };
}

function formatOutcomeRecordStatusForUser(t: TranslateFunction, value: string): string {
  if (value === "accepted_active" || value === "active") {
    return t("Visible in this discussion");
  }

  if (value === "open") {
    return t("Still open");
  }

  if (value === "unanswered") {
    return t("Needs an answer");
  }

  if (value === "unchecked") {
    return t("Needs verification");
  }

  if (value === "checked" || value === "satisfied" || value === "resolved") {
    return t("Resolved");
  }

  return t(formatOutcomeLabel(value));
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

function getFirstRecordValue(record: unknown, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = getRecordValue(record, key);

    if (value && typeof value === "object") {
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

function describeOutcomeCount(
  t: TranslateFunction,
  count: number,
  singular: string,
  plural: string
): string {
  if (count === 0) {
    return t("No {item} listed", { item: t(plural) });
  }

  return t("{count} {item} listed", {
    count,
    item: t(count === 1 ? singular : plural)
  });
}

function describeReviewItemCount(
  t: TranslateFunction,
  count: number,
  singular: string,
  plural: string
): string {
  if (count === 0) {
    return t("No {item}", { item: t(plural) });
  }

  return t("{count} {item}", {
    count,
    item: t(count === 1 ? singular : plural)
  });
}

function describeEvidenceCountSummary(
  t: TranslateFunction,
  unresolvedCount: number,
  totalCount: number
): string {
  return t("{unresolved}/{total} still need checking", {
    unresolved: unresolvedCount,
    total: totalCount
  });
}

function describeEvidenceReviewDetail(
  t: TranslateFunction,
  unresolvedCount: number,
  totalCount: number
): string {
  if (totalCount === 0) {
    return t("No evidence gaps are listed.");
  }

  if (unresolvedCount === 0) {
    return t(
      totalCount === 1
        ? "{count} evidence gap has been checked."
        : "{count} evidence gaps have been checked.",
      { count: totalCount }
    );
  }

  return t(
    totalCount === 1 && unresolvedCount === 1
      ? "{unresolved} of {total} evidence gap needs verification"
      : totalCount === 1
        ? "{unresolved} of {total} evidence gap need verification"
        : unresolvedCount === 1
          ? "{unresolved} of {total} evidence gaps needs verification"
          : "{unresolved} of {total} evidence gaps need verification",
    {
      unresolved: unresolvedCount,
      total: totalCount
    }
  );
}

function RunProjectionPanels({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
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
    <section className="du-projection-section" aria-label={t("Discussion detail panels")}>
      <div id="main-perspectives" className="du-workbench-anchor">
        <DataPanel
          title={t("Main perspectives")}
          description={t("Strongest current options accepted into the discussion so far.")}
        >
          <QueryState query={frontierQuery}>
            <ProjectionRecordList
              records={asArray(frontierQuery.data?.candidates)}
              emptyTitle={t("No main perspectives")}
              emptyDescription={t(
                "No main perspectives have been accepted into this discussion yet."
              )}
              kind="candidate"
            />
          </QueryState>
        </DataPanel>
      </div>
      <div id="open-disagreements" className="du-workbench-anchor">
        <DataPanel
          title={t("Open disagreements")}
          description={t(
            "Unresolved objections and challenges that still constrain the discussion."
          )}
        >
          <QueryState query={objectionsQuery}>
            <ProjectionRecordList
              records={asArray(objectionsQuery.data?.objections)}
              emptyTitle={t("No open disagreements")}
              emptyDescription={t(
                "No open disagreements have been accepted into this discussion yet."
              )}
              kind="objection"
            />
          </QueryState>
        </DataPanel>
      </div>
      <div id="answer-requirements" className="du-workbench-anchor">
        <DataPanel
          title={t("Requirements this answer must satisfy")}
          description={t("Explicit requirements for the current conclusion.")}
        >
          <QueryState query={obligationsQuery}>
            <ProjectionRecordList
              records={asArray(obligationsQuery.data?.qualityObligations)}
              emptyTitle={t("No requirements")}
              emptyDescription={t(
                "No explicit requirements have been accepted into this discussion yet."
              )}
              kind="quality obligation"
            />
          </QueryState>
        </DataPanel>
      </div>
      <div id="evidence-gaps" className="du-workbench-anchor">
        <DataPanel
          title={t("Risks and missing evidence")}
          description={t(
            "Evidence gaps and verification needs that should be checked before relying on the conclusion."
          )}
        >
          <QueryState query={resourcesQuery}>
            <ProjectionRecordList
              records={asArray(resourcesQuery.data?.evidenceNeeds)}
              emptyTitle={t("No missing evidence")}
              emptyDescription={t(
                "No evidence gaps have been accepted into this discussion yet."
              )}
              kind="evidence"
            />
          </QueryState>
        </DataPanel>
      </div>
      <AdvancedDetails
        summary="Advanced / Developer Mode"
        description="Projection event ranges, internal record ids, proposal event ids, and source event ids for developer inspection."
        panelLabel="Discussion detail metadata"
        lazy
      >
        <div className="du-projection-developer-grid">
          <ProjectionDeveloperDetails
            title="Main perspectives metadata"
            projection={frontierQuery.data?.projection}
            records={asArray(frontierQuery.data?.candidates)}
            kind="candidate"
          />
          <ProjectionDeveloperDetails
            title="Open disagreements metadata"
            projection={objectionsQuery.data?.projection}
            records={asArray(objectionsQuery.data?.objections)}
            kind="objection"
          />
          <ProjectionDeveloperDetails
            title="Requirements metadata"
            projection={obligationsQuery.data?.projection}
            records={asArray(obligationsQuery.data?.qualityObligations)}
            kind="quality obligation"
          />
          <ProjectionDeveloperDetails
            title="Risks and missing evidence metadata"
            projection={resourcesQuery.data?.projection}
            records={asArray(resourcesQuery.data?.evidenceNeeds)}
            kind="evidence"
          />
        </div>
      </AdvancedDetails>
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
  const { t } = useI18n();
  const object = getRecordValue(record, "object") ?? record;
  const kindLabel = t(formatProjectionKind(kind));
  const fallbackTitle = t("{kind} {number}", {
    kind: kindLabel,
    number: index + 1
  });
  const title =
    getStringRecordValue(object, "title") ??
    getStringRecordValue(object, "question") ??
    getStringRecordValue(object, "content") ??
    getStringRecordValue(object, "requirement") ??
    getStringRecordValue(object, "failureMode") ??
    fallbackTitle;
  const reviewCue = t(formatProjectionRecordReviewCue(kind, getRecordValue(object, "status")));
  const description =
    getStringRecordValue(object, "description") ??
    getStringRecordValue(object, "consequence") ??
    getStringRecordValue(object, "question") ??
    getStringRecordValue(object, "requirement") ??
    getStringRecordValue(object, "content");

  return (
    <article className="du-readable-item">
      <p className="du-kicker">{kindLabel}</p>
      <h4>{title}</h4>
      {description && description !== title ? <p>{description}</p> : null}
      <p className="du-readable-meta">{reviewCue}</p>
    </article>
  );
}

function ProjectionDeveloperDetails({
  title,
  projection,
  records,
  kind
}: {
  title: string;
  projection: unknown;
  records: unknown[];
  kind: ProjectionRecordKind;
}) {
  return (
    <DataPanel title={title}>
      <ProjectionMetadata projection={projection} />
      {records.length === 0 ? (
        <EmptyState
          title="No internal records"
          description="No accepted records are available for this projection yet."
        />
      ) : (
        <div className="du-readable-list">
          {records.map((record, index) => (
            <ProjectionRecordDeveloperMetadata
              key={getProjectionRecordKey(record, index)}
              record={record}
              index={index}
              kind={kind}
            />
          ))}
        </div>
      )}
    </DataPanel>
  );
}

function ProjectionRecordDeveloperMetadata({
  record,
  index,
  kind
}: {
  record: unknown;
  index: number;
  kind: ProjectionRecordKind;
}) {
  const object = getRecordValue(record, "object") ?? record;
  const id =
    getStringRecordValue(object, "id") ?? `${kind}-${getProjectionRecordKey(record, index)}`;
  const proposalEventId = getRecordValue(record, "proposalEventId");
  const sourceEventIds = asArray(getRecordValue(object, "sourceEventIds"));

  return (
    <article className="du-readable-item">
      <p className="du-kicker">
        {formatProjectionKind(kind)} {index + 1}
      </p>
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

function formatProjectionRecordReviewCue(
  kind: ProjectionRecordKind,
  status: unknown
): string {
  if (status === "checked" || status === "satisfied" || status === "resolved") {
    return "Resolved for now.";
  }

  if (kind === "candidate" && (status === "accepted_active" || status === "active")) {
    return "Included as a strongest current option.";
  }

  if (kind === "objection" && status === "open") {
    return "Still constrains the current conclusion.";
  }

  if (kind === "quality obligation" && status === "unanswered") {
    return "Needs an answer before relying on the conclusion.";
  }

  if (kind === "evidence") {
    return "Needs verification before relying on the conclusion.";
  }

  return "Review this item before relying on the conclusion.";
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

export function describeDiscussionStatus(run: unknown): string {
  const continuationView = describeDiscussionContinuation(run);
  const status = getRecordValue(run, "status");
  const completedStageCount = countCompletedDiscussionStages(run);

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

function countCompletedDiscussionStages(run: unknown): number {
  return getDiscussionStageStatuses(run).filter(([, stageStatus]) =>
    isCompletedDiscussionStage(stageStatus)
  ).length;
}

function isCompletedDiscussionStage(status: unknown): boolean {
  return status === "completed" || status === "revealed";
}

export function isDiscussionReviewReady(run: unknown): boolean {
  const status = getRecordValue(run, "status");
  const finalizationStatus = getRecordValue(run, "latestFinalizationStatus");

  return status === "revealed" || finalizationStatus === "completed";
}

function describeDiscussionContinuation(run: unknown): DiscussionContinuationView {
  const reviewReady = isDiscussionReviewReady(run);

  if (reviewReady) {
    return {
      title: "Discussion is ready to review",
      description:
        "The guided discussion has produced a current conclusion. Review it first; refresh the steps only when you want to update the discussion with the same brief.",
      explainerTitle: "Review the current conclusion",
      explainerDetail:
        "Main perspectives, open disagreements, requirements, evidence and verification, risk review, and next recommended actions are available below and on the conclusion page.",
      primaryLabel: "Update conclusion",
      primaryActionDetail:
        "Run the guided update again after reviewing disagreements, evidence gaps, and requirements.",
      primaryResultTitle: "Discussion update completed",
      primaryResultDetail:
        "The guided update ran with the current brief. Review the updated conclusion, disagreements, requirements, and evidence before relying on it.",
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
    primaryLabel: "Continue discussion",
    primaryActionDetail:
      "Collect perspectives, organize strongest options, check evidence needs, and draft a conclusion.",
    primaryResultTitle: "Discussion steps completed",
    primaryResultDetail:
      "The guided discussion steps were recorded. Review the updated perspectives, disagreements, requirements, and current conclusion.",
    reviewReady
  };
}

function describeDiscussionNextStep(run: unknown): DiscussionNextStepView {
  if (isDiscussionReviewReady(run)) {
    return {
      title: "Review current conclusion",
      detail:
        "Start with the current conclusion, then check visible disagreements, requirements, risks, and missing evidence before relying on it.",
      tone: "ready"
    };
  }

  if (getRecordValue(run, "status") === "running") {
    return {
      title: "Check discussion progress",
      detail:
        "Discussion steps are running. Open the room to see which perspectives, disagreements, evidence checks, and conclusion work have changed.",
      tone: "active"
    };
  }

  if (countCompletedDiscussionStages(run) > 0) {
    return {
      title: "Continue guided discussion",
      detail:
        "Some discussion steps are complete. Continue the guided flow until the current conclusion, disagreements, evidence, risks, and next actions are ready.",
      tone: "active"
    };
  }

  return {
    title: "Continue guided discussion",
    detail:
      "Continue the discussion so independent first responses, main perspectives, disagreements, requirements, evidence, and a current conclusion can be produced.",
    tone: "pending"
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
      label: "Not started yet",
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

  return "Deliberum returned an unavailable conclusion state. Open Advanced details for the technical reason.";
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

function formatBriefList(items: readonly string[]): string {
  return items.length > 0 ? items.join(" ") : "Not specified";
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
