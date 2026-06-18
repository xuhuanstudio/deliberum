import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
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
import { buildRuntimeSetupPlan } from "@deliberum/client";
import type {
  OpenAICompatibleRoleModelDefaults,
  RuntimeProfilesResponse,
  RuntimeSetupPlan
} from "@deliberum/client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useDaemonRuntime } from "./daemon-runtime";
import { LanguageSwitcher, useI18n } from "./i18n";
import { LocalServiceSetupGuide } from "./local-service-setup";
import {
  clearOpenAICompatibleProviderVerified,
  markOpenAICompatibleProviderVerified,
  useOpenAICompatibleProviderVerification
} from "./openai-compatible-verification";
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
  buildLocalPresetStartRequest,
  buildGuidedDiscussionRunPlan,
  buildProviderBackedDiscussionRunPlan,
  formatPresetJson,
  type ProviderBackedDiscussionPlanInput,
  type ProviderBackedPerspectiveModelOverrides,
  type ProviderBackedPerspectiveCount
} from "./run-presets";

const DEFAULT_RUN_PLAN_TEXT = formatPresetJson(LOCAL_PRESET_RUN_PLAN);
const FIRST_RESPONSES_ONLY_START_REQUEST = {
  sealedDivergence: {
    autoCloseManual: true,
    retryFailedParticipants: true
  }
};
const OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID = "openai-main";
const OPENAI_COMPATIBLE_ACCEPTANCE_RATIONALE_EN =
  "Accept provider-organized discussion material so the room can draft a provisional current answer while keeping review challenges visible.";
const OPENAI_COMPATIBLE_ACCEPTANCE_RATIONALE_ZH_CN =
  "\u63a5\u53d7\u6a21\u578b\u6574\u7406\u7684\u8ba8\u8bba\u6750\u6599\uff0c\u8ba9\u8ba8\u8bba\u5ba4\u80fd\u8d77\u8349\u4e34\u65f6\u5f53\u524d\u7b54\u6848\uff0c\u540c\u65f6\u4fdd\u6301\u5ba1\u67e5\u6311\u6218\u53ef\u89c1\u3002";
const OPENAI_COMPATIBLE_FULL_START_REQUEST = {
  sealedDivergence: {
    autoCloseManual: true,
    retryFailedParticipants: true
  },
  extraction: {
    generatorIds: ["openai-compatible-extractor"],
    retryFailedGenerators: true
  },
  review: {
    reviewerIds: ["openai-compatible-reviewer"],
    retryFailedReviewers: true,
    acceptancePolicy: {
      mode: "all_generated",
      authorId: "provider-review-coordinator",
      rationale: OPENAI_COMPATIBLE_ACCEPTANCE_RATIONALE_EN
    }
  },
  finalization: {
    finalCandidateGeneratorId: "openai-compatible-final-candidate",
    auditGeneratorIds: ["openai-compatible-final-auditor"],
    retryFailedFinalCandidate: true,
    retryFailedAuditors: true,
    compileOutcome: true
  }
};
const DEFAULT_PROCESS_AUTHOR_ID = "system";
const DEFAULT_PROCESS_REVIEWER_ID = "process-reviewer";
const DEFAULT_PROCESS_COORDINATOR_ID = "process-coordinator";
const USER_FACING_ACTOR_LABELS: Record<string, string> = {
  "local-preset-alpha": "First viewpoint",
  "local-preset-beta": "Alternative viewpoint",
  "local-preset-candidate-repairer": "Option reviewer",
  "local-preset-evidence-checker": "Evidence checker",
  "local-preset-extractor": "Discussion organizer",
  "local-preset-final-auditor": "Risk reviewer",
  "local-preset-final-candidate": "Summary writer",
  "local-preset-review-coordinator": "Review coordinator",
  "local-preset-reviewer": "Skeptic",
  "openai-compatible-extractor": "Discussion organizer",
  "openai-compatible-final-auditor": "Risk reviewer",
  "openai-compatible-final-candidate": "Summary writer",
  "openai-compatible-reviewer": "Review coordinator",
  "provider-review-coordinator": "Review coordinator",
  "provider-perspective-a": "First viewpoint",
  "provider-perspective-b": "Alternative viewpoint",
  "provider-perspective-c": "Additional viewpoint",
  "perspective-a": "First viewpoint",
  "perspective-b": "Alternative viewpoint",
  "process-coordinator": "Review coordinator",
  "process-reviewer": "Skeptic",
  "perspective-c": "Additional viewpoint",
  reviewer: "Skeptic",
  "conclusion-writer": "Summary writer"
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
type DiscussionContinuationSetupView = {
  title: string;
  detail: string;
  note: string;
  tone: "ok" | "warning" | "neutral";
  startRequest: Record<string, unknown>;
  fillLabel: string;
  primaryActionDetail?: string;
  primaryResultTitle?: string;
  primaryResultDetail?: string;
};
type DiscussionContinuationSetupStatus = "loading" | "ready" | "error";
type DiscussionStartFeedback = {
  title: string;
  detail: string;
};
type DiscussionModelSetupView = {
  title: string;
  detail: string;
  quickStartDetail: string;
  providerDetail: string;
  providerTone: "ok" | "warning" | "neutral";
  tone: "ok" | "warning" | "neutral";
};
type DiscussionParticipantSource = "demo" | "model-backed";
type DiscussionProviderSource = ProviderBackedDiscussionPlanInput & {
  name: string;
};
type DiscussionCreationPreviewStep = {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
  valueValues?: Record<string, string>;
};
type DiscussionCreationPreviewView = {
  title: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
  steps: DiscussionCreationPreviewStep[];
};
type DiscussionPerspectiveRole = {
  role: string;
};
type DiscussionPerspectiveModelField = {
  participantId: string;
  label: string;
};
type RoleModelDefaults = OpenAICompatibleRoleModelDefaults;
type RoleModelDefaultsStatus = "idle" | "saved" | "loaded" | "cleared" | "unavailable";
type DiscussionParticipantSourceView = {
  title: string;
  detail: string;
  note: string;
  tone: "ok" | "warning" | "neutral";
};
type DiscussionParticipantLineupItem = {
  role: string;
  contribution: string;
  source: string;
  detail: string;
  detailValues?: Record<string, string>;
  tone: "ok" | "warning" | "neutral";
};
type DiscussionRoomParticipantRosterItem = {
  name: string;
  role: string;
  source: string;
  sourceValues?: Record<string, string>;
  status: string;
  detail: string;
  detailValues?: Record<string, string>;
  tone: "ok" | "warning" | "neutral";
  kind: "human" | "ai";
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
  action: string;
  detail: string;
  detailValues?: Record<string, string | number>;
  tone: "neutral" | "ok" | "warning";
  phase: RoomActivityPhaseId;
  sourceType: string;
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

const DISCUSSION_PERSPECTIVE_MODEL_FIELDS: DiscussionPerspectiveModelField[] = [
  {
    participantId: "provider-perspective-a",
    label: "First viewpoint model"
  },
  {
    participantId: "provider-perspective-b",
    label: "Alternative viewpoint model"
  },
  {
    participantId: "provider-perspective-c",
    label: "Additional viewpoint model"
  }
];
type RoomActivityGroup = {
  kind: "brief" | "discussion";
  round: number;
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
  const queryClient = useQueryClient();
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => client.listRuns()
  });
  const runs = asArray(runsQuery.data?.runs);
  function retryDiscussions() {
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
  }

  return (
    <RunWorkspaceShell>
      <ViewFrame
        eyebrow={t("User Mode")}
        title={t("My Discussions")}
        description={t(
          "Start or continue a discussion in plain language, then inspect the current answer, perspectives, unresolved points, evidence needs, and next steps."
        )}
        actions={
          <Link className="du-action-link" to="/runs/new">
            {t("New Discussion")}
          </Link>
        }
      >
        {runsQuery.isLoading ? (
          <StatusBanner title={t("Loading discussion data")} />
        ) : runsQuery.isError ? (
          <DataPanel title={t("My Discussions")}>
            <LocalServiceSetupGuide onRetry={retryDiscussions} />
          </DataPanel>
        ) : (
          <DataPanel title={t("Existing discussions")}>
            {runs.length === 0 ? (
              <EmptyState
                title={t("No discussions yet")}
                description={t(
                  "Start with a question. Deliberum will create a discussion brief, collect independent first responses, and keep the current answer, unresolved points, risks, and next steps visible."
                )}
              />
            ) : (
              <RunCatalogList runs={runs} />
            )}
          </DataPanel>
        )}
      </ViewFrame>
    </RunWorkspaceShell>
  );
}

export function RunNewPage() {
  const { t } = useI18n();
  const { client } = useDaemonRuntime();
  const navigate = useNavigate();
  const providerConnectionVerified = useOpenAICompatibleProviderVerification();
  const requestedParticipantSource = useLocation({
    select: (location) => getRequestedParticipantSource(location.search)
  });
  const requestedPerspectiveCount = useLocation({
    select: (location) => getRequestedPerspectiveCount(location.search)
  });
  const queryClient = useQueryClient();
  const [runPlanText, setRunPlanText] = useState(DEFAULT_RUN_PLAN_TEXT);
  const [discussionQuestion, setDiscussionQuestion] = useState("");
  const [discussionGoals, setDiscussionGoals] = useState("");
  const [discussionConstraints, setDiscussionConstraints] = useState("");
  const [discussionExpectedOutcome, setDiscussionExpectedOutcome] = useState("");
  const [participantSource, setParticipantSource] =
    useState<DiscussionParticipantSource>(requestedParticipantSource ?? "demo");
  const [participantSourceTouched, setParticipantSourceTouched] = useState(false);
  const [storedRoleModelDefaults, setStoredRoleModelDefaults] = useState<
    RoleModelDefaults | undefined
  >(undefined);
  const [roleModelDefaultsStatus, setRoleModelDefaultsStatus] =
    useState<RoleModelDefaultsStatus>("idle");
  const [roleModelDefaultsAppliedFromService, setRoleModelDefaultsAppliedFromService] =
    useState(false);
  const [modelPerspectiveCount, setModelPerspectiveCount] =
    useState<ProviderBackedPerspectiveCount>(
      requestedPerspectiveCount ?? storedRoleModelDefaults?.perspectiveCount ?? 2
    );
  const [discussionModelOverride, setDiscussionModelOverride] = useState(
    storedRoleModelDefaults?.modelOverride ?? ""
  );
  const [reviewModelOverride, setReviewModelOverride] = useState(
    storedRoleModelDefaults?.reviewModelOverride ?? ""
  );
  const [customPerspectiveModelsEnabled, setCustomPerspectiveModelsEnabled] = useState(
    storedRoleModelDefaults?.customPerspectiveModelsEnabled ?? false
  );
  const [perspectiveModelOverrides, setPerspectiveModelOverrides] =
    useState<ProviderBackedPerspectiveModelOverrides>(
      storedRoleModelDefaults?.perspectiveModelOverrides ?? {}
    );
  const [inputError, setInputError] = useState<string | null>(null);
  const runtimeProfilesQuery = useQuery({
    queryKey: ["runtime-profiles"],
    queryFn: () => client.getRuntimeProfiles()
  });
  const roleModelDefaultsQuery = useQuery({
    queryKey: ["model-role-defaults"],
    queryFn: () => client.getOpenAICompatibleRoleModelDefaults()
  });
  const runtimeSetupPlan = runtimeProfilesQuery.data
    ? buildRuntimeSetupPlan(runtimeProfilesQuery.data)
    : undefined;
  const providerBackedDiscussionSource = runtimeSetupPlan && providerConnectionVerified
    ? findProviderBackedDiscussionSource(runtimeSetupPlan)
    : undefined;
  const providerBackedDiscussionAvailable = Boolean(providerBackedDiscussionSource);
  const demoDiscussionAvailable = runtimeSetupPlan
    ? isDemoDiscussionSourceAvailable(runtimeSetupPlan)
    : false;
  const localOrganizerReady = runtimeSetupPlan
    ? isLocalPresetDiscussionPathReady(runtimeSetupPlan)
    : false;
  const providerOrganizerReady = isProviderBackedOrganizerPathReady(
    runtimeProfilesQuery.data,
    providerBackedDiscussionSource?.providerConfigId
  );
  const selectedOrganizerReady =
    participantSource === "model-backed" ? providerOrganizerReady : localOrganizerReady;
  const creationPreview = buildDiscussionCreationPreview({
    selectedSource: participantSource,
    providerSource: providerBackedDiscussionSource,
    organizerReady: selectedOrganizerReady,
    demoAvailable: demoDiscussionAvailable,
    perspectiveCount: modelPerspectiveCount,
    modelOverride: discussionModelOverride,
    reviewModelOverride,
    customPerspectiveModelsEnabled,
    perspectiveModelOverrides,
    setupKnown: Boolean(runtimeSetupPlan)
  });
  const selectedParticipantSourceAvailable =
    participantSource === "demo"
      ? demoDiscussionAvailable
      : providerBackedDiscussionAvailable;
  const createMutation = useMutation({
    mutationFn: (runPlan: Record<string, unknown>) => client.createRun({ runPlan }),
    onSuccess: (result) => {
      const runId = getStringRecordValue(result?.run, "runId");

      if (runId) {
        void navigate({ to: "/runs/$runId", params: { runId } });
      }
    }
  });
  const providerVerificationMutation = useMutation({
    mutationFn: () => client.verifyOpenAICompatibleSetup(),
    onSuccess: () => {
      markOpenAICompatibleProviderVerified();
    },
    onError: () => {
      clearOpenAICompatibleProviderVerified();
    }
  });
  const saveRoleDefaultsMutation = useMutation({
    mutationFn: (defaults: RoleModelDefaults) =>
      client.saveOpenAICompatibleRoleModelDefaults(defaults),
    onSuccess: (_result, defaults) => {
      setStoredRoleModelDefaults(defaults);
      setRoleModelDefaultsStatus("saved");
      void queryClient.invalidateQueries({ queryKey: ["model-role-defaults"] });
    },
    onError: () => {
      setRoleModelDefaultsStatus("unavailable");
    }
  });
  const clearRoleDefaultsMutation = useMutation({
    mutationFn: () => client.clearOpenAICompatibleRoleModelDefaults(),
    onSuccess: () => {
      setStoredRoleModelDefaults(undefined);
      setRoleModelDefaultsStatus("cleared");
      void queryClient.invalidateQueries({ queryKey: ["model-role-defaults"] });
    },
    onError: () => {
      setRoleModelDefaultsStatus("unavailable");
    }
  });
  const createdRunId = getStringRecordValue(createMutation.data?.run, "runId");
  const canCreateDiscussion =
    discussionQuestion.trim().length > 0 &&
    !createMutation.isPending &&
    Boolean(runtimeSetupPlan) &&
    selectedParticipantSourceAvailable;

  useEffect(() => {
    if (!runtimeSetupPlan) {
      return;
    }

    if (requestedParticipantSource === "model-backed" && !participantSourceTouched) {
      if (providerBackedDiscussionAvailable) {
        setParticipantSource("model-backed");
        return;
      }

      if (demoDiscussionAvailable) {
        setParticipantSource("demo");
        return;
      }
    }

    if (
      requestedParticipantSource === "demo" &&
      demoDiscussionAvailable &&
      !participantSourceTouched
    ) {
      setParticipantSource("demo");
      return;
    }

    if (providerBackedDiscussionAvailable && !participantSourceTouched) {
      setParticipantSource("model-backed");
      return;
    }

    if (participantSource === "model-backed" && !providerBackedDiscussionAvailable) {
      setParticipantSource("demo");
    }
  }, [
    demoDiscussionAvailable,
    participantSource,
    participantSourceTouched,
    providerBackedDiscussionAvailable,
    requestedParticipantSource,
    runtimeSetupPlan
  ]);

  useEffect(() => {
    const defaults =
      roleModelDefaultsQuery.data?.status === "configured"
        ? roleModelDefaultsQuery.data.defaults
        : undefined;

    if (!defaults) {
      if (roleModelDefaultsQuery.isSuccess && storedRoleModelDefaults) {
        setStoredRoleModelDefaults(undefined);
      }
      return;
    }

    setStoredRoleModelDefaults(defaults);

    if (
      roleModelDefaultsAppliedFromService ||
      roleModelDefaultsStatus !== "idle" ||
      discussionModelOverride ||
      reviewModelOverride ||
      customPerspectiveModelsEnabled ||
      Object.keys(perspectiveModelOverrides).length > 0
    ) {
      return;
    }

    if (requestedPerspectiveCount === undefined) {
      setModelPerspectiveCount(defaults.perspectiveCount);
    }
    setDiscussionModelOverride(defaults.modelOverride);
    setReviewModelOverride(defaults.reviewModelOverride);
    setCustomPerspectiveModelsEnabled(defaults.customPerspectiveModelsEnabled);
    setPerspectiveModelOverrides(defaults.perspectiveModelOverrides);
    setRoleModelDefaultsAppliedFromService(true);
  }, [
    customPerspectiveModelsEnabled,
    discussionModelOverride,
    perspectiveModelOverrides,
    requestedPerspectiveCount,
    reviewModelOverride,
    roleModelDefaultsAppliedFromService,
    roleModelDefaultsQuery.data,
    roleModelDefaultsQuery.isSuccess,
    roleModelDefaultsStatus,
    storedRoleModelDefaults
  ]);

  function chooseParticipantSource(source: DiscussionParticipantSource) {
    setParticipantSourceTouched(true);
    setParticipantSource(source);
  }

  function retryModelSetup() {
    void queryClient.invalidateQueries({ queryKey: ["runtime-profiles"] });
    void queryClient.invalidateQueries({ queryKey: ["model-role-defaults"] });
  }

  function updatePerspectiveModelOverride(participantId: string, model: string) {
    setPerspectiveModelOverrides((current) => ({
      ...current,
      [participantId]: model
    }));
  }

  function captureCurrentRoleModelDefaults(): RoleModelDefaults {
    return {
      perspectiveCount: modelPerspectiveCount,
      modelOverride: discussionModelOverride,
      reviewModelOverride,
      customPerspectiveModelsEnabled,
      perspectiveModelOverrides
    };
  }

  function saveRoleModelDefaults() {
    const defaults = captureCurrentRoleModelDefaults();
    saveRoleDefaultsMutation.mutate(defaults);
  }

  function applyRoleModelDefaults() {
    const defaults = storedRoleModelDefaults;

    if (!defaults) {
      setRoleModelDefaultsStatus("unavailable");
      return;
    }

    setStoredRoleModelDefaults(defaults);
    setModelPerspectiveCount(defaults.perspectiveCount);
    setDiscussionModelOverride(defaults.modelOverride);
    setReviewModelOverride(defaults.reviewModelOverride);
    setCustomPerspectiveModelsEnabled(defaults.customPerspectiveModelsEnabled);
    setPerspectiveModelOverrides(defaults.perspectiveModelOverrides);
    setRoleModelDefaultsStatus("loaded");
  }

  function clearRoleModelDefaults() {
    clearRoleDefaultsMutation.mutate();
  }

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

    const discussionPlanInput = {
      question: discussionQuestion,
      goalsText: discussionGoals,
      constraintsText: discussionConstraints,
      expectedOutcomeText: discussionExpectedOutcome
    };
    const runPlan =
      participantSource === "model-backed"
        ? providerBackedDiscussionSource
          ? buildProviderBackedDiscussionRunPlan(
              discussionPlanInput,
              providerBackedDiscussionSource,
              {
                perspectiveCount: modelPerspectiveCount,
                modelId: discussionModelOverride,
                reviewModelId: reviewModelOverride,
                perspectiveModels: customPerspectiveModelsEnabled
                  ? perspectiveModelOverrides
                  : undefined
              }
            )
          : undefined
        : buildGuidedDiscussionRunPlan(discussionPlanInput);

    if (!runPlan) {
      setInputError(t("Choose an available participant source before creating the discussion."));
      return;
    }

    setInputError(null);
    setRunPlanText(formatPresetJson(runPlan));
    createMutation.mutate(runPlan);
  }

  return (
    <RunWorkspaceShell>
      <ViewFrame
        eyebrow={t("User Mode")}
        title={t("New Discussion")}
        description={t(
          "Start with a question, then let the room gather perspectives, unresolved points, checks, risks, a current answer, and next steps."
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
            "Describe what you need to decide or clarify. Deliberum keeps the answer, unresolved points, risks, checks, and next steps visible."
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
              <summary>{t("Preview participants and review path")}</summary>
              <div className="du-brief-options-body">
                <DiscussionCreationPreview view={creationPreview} />
              </div>
            </details>
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
                  placeholder={t("What should the current answer include?")}
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
                  "It creates a discussion brief, independent first responses, strongest options, unresolved points, must-cover requirements, evidence checks, risk review, and a current answer."
                )}
              />
            </div>
          </form>
        </DataPanel>
        <details
          className="du-default-secondary-details"
          open={runtimeProfilesQuery.isError || requestedParticipantSource === "model-backed"}
        >
          <summary>{t("AI and participant setup")}</summary>
          <div className="du-default-secondary-details-body">
            {runtimeProfilesQuery.isLoading ? (
              <StatusBanner title={t("Checking AI setup")} />
            ) : runtimeProfilesQuery.isError ? (
              <LocalServiceSetupGuide onRetry={retryModelSetup} />
            ) : runtimeSetupPlan ? (
              <DiscussionModelSetupPanel
                setupPlan={runtimeSetupPlan}
                selectedSource={participantSource}
                organizerReady={selectedOrganizerReady}
                onSelectedSourceChange={chooseParticipantSource}
                perspectiveCount={modelPerspectiveCount}
                onPerspectiveCountChange={setModelPerspectiveCount}
                modelOverride={discussionModelOverride}
                onModelOverrideChange={setDiscussionModelOverride}
                reviewModelOverride={reviewModelOverride}
                onReviewModelOverrideChange={setReviewModelOverride}
                customPerspectiveModelsEnabled={customPerspectiveModelsEnabled}
                onCustomPerspectiveModelsEnabledChange={setCustomPerspectiveModelsEnabled}
                perspectiveModelOverrides={perspectiveModelOverrides}
                onPerspectiveModelOverrideChange={updatePerspectiveModelOverride}
                roleDefaultsSaved={Boolean(storedRoleModelDefaults)}
                roleDefaultsStatus={roleModelDefaultsStatus}
                roleDefaultsPending={
                  roleModelDefaultsQuery.isLoading ||
                  saveRoleDefaultsMutation.isPending ||
                  clearRoleDefaultsMutation.isPending
                }
                onSaveRoleDefaults={saveRoleModelDefaults}
                onApplyRoleDefaults={applyRoleModelDefaults}
                onClearRoleDefaults={clearRoleModelDefaults}
                providerConnectionVerified={providerConnectionVerified}
                verificationPending={providerVerificationMutation.isPending}
                verificationError={providerVerificationMutation.error}
                onVerifyProviderConnection={() => providerVerificationMutation.mutate()}
              />
            ) : (
              <StatusBanner
                tone="warning"
                title={t("No AI setup returned")}
                detail={t("The local service did not return safe AI setup status.")}
              />
            )}
          </div>
        </details>
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

function getRequestedParticipantSource(
  search: unknown
): DiscussionParticipantSource | undefined {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return undefined;
  }

  const participants = (search as Record<string, unknown>).participants;

  return participants === "model-backed" || participants === "demo"
    ? participants
    : undefined;
}

function getRequestedPerspectiveCount(
  search: unknown
): ProviderBackedPerspectiveCount | undefined {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return undefined;
  }

  const perspectives = (search as Record<string, unknown>).perspectives;

  return perspectives === "3" || perspectives === 3
    ? 3
    : perspectives === "2" || perspectives === 2
      ? 2
      : undefined;
}

function DiscussionCreationPreview({ view }: { view: DiscussionCreationPreviewView }) {
  const { t } = useI18n();

  return (
    <section
      className={`du-creation-preview du-creation-preview-${view.tone}`}
      aria-label={t("Creation preview")}
    >
      <div className="du-creation-preview-heading">
        <p className="du-kicker">{t("Creation preview")}</p>
        <h4>{t(view.title)}</h4>
        <p>{t(view.detail)}</p>
      </div>
      <div className="du-creation-preview-grid">
        {view.steps.map((step) => (
          <article
            className={`du-creation-preview-item du-creation-preview-item-${step.tone}`}
            key={`${step.label}:${step.value}`}
          >
            <span>{t(step.label)}</span>
            <strong>{t(step.value, step.valueValues)}</strong>
            <p>{t(step.detail)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DiscussionModelSetupPanel({
  setupPlan,
  selectedSource,
  organizerReady,
  onSelectedSourceChange,
  perspectiveCount,
  onPerspectiveCountChange,
  modelOverride,
  onModelOverrideChange,
  reviewModelOverride,
  onReviewModelOverrideChange,
  customPerspectiveModelsEnabled,
  onCustomPerspectiveModelsEnabledChange,
  perspectiveModelOverrides,
  onPerspectiveModelOverrideChange,
  roleDefaultsSaved,
  roleDefaultsStatus,
  roleDefaultsPending,
  onSaveRoleDefaults,
  onApplyRoleDefaults,
  onClearRoleDefaults,
  providerConnectionVerified,
  verificationPending,
  verificationError,
  onVerifyProviderConnection
}: {
  setupPlan: RuntimeSetupPlan;
  selectedSource: DiscussionParticipantSource;
  organizerReady: boolean;
  onSelectedSourceChange: (source: DiscussionParticipantSource) => void;
  perspectiveCount: ProviderBackedPerspectiveCount;
  onPerspectiveCountChange: (count: ProviderBackedPerspectiveCount) => void;
  modelOverride: string;
  onModelOverrideChange: (model: string) => void;
  reviewModelOverride: string;
  onReviewModelOverrideChange: (model: string) => void;
  customPerspectiveModelsEnabled: boolean;
  onCustomPerspectiveModelsEnabledChange: (enabled: boolean) => void;
  perspectiveModelOverrides: ProviderBackedPerspectiveModelOverrides;
  onPerspectiveModelOverrideChange: (participantId: string, model: string) => void;
  roleDefaultsSaved: boolean;
  roleDefaultsStatus: RoleModelDefaultsStatus;
  roleDefaultsPending: boolean;
  onSaveRoleDefaults: () => void;
  onApplyRoleDefaults: () => void;
  onClearRoleDefaults: () => void;
  providerConnectionVerified: boolean;
  verificationPending: boolean;
  verificationError: Error | null;
  onVerifyProviderConnection: () => void;
}) {
  const { t } = useI18n();
  const view = describeDiscussionModelSetup(setupPlan, providerConnectionVerified);
  const demoAvailable = isDemoDiscussionSourceAvailable(setupPlan);
  const providerSetupSaved = Boolean(findProviderBackedDiscussionSource(setupPlan));
  const providerSource = providerConnectionVerified
    ? findProviderBackedDiscussionSource(setupPlan)
    : undefined;
  const modelBackedAvailable = Boolean(providerSource);
  const perspectiveModelFields = getPerspectiveModelFields(perspectiveCount);

  return (
    <DataPanel
      title={t("Participants for this discussion")}
      description={t(
        "Choose whether this discussion uses demo participants or connected AI participants before you create the room."
      )}
    >
      <div className="du-discussion-setup-grid">
        <article className={`du-status du-status-${view.tone}`}>
          <strong>{t(view.title)}</strong>
          <span>{t(view.detail)}</span>
        </article>
        <article className="du-status du-status-ok">
          <strong>{t("Quick-start participants")}</strong>
          <span>{t(view.quickStartDetail)}</span>
        </article>
        <article className={`du-status du-status-${view.providerTone}`}>
          <strong>{t("AI participants")}</strong>
          <span>{t(view.providerDetail)}</span>
        </article>
      </div>
      {selectedSource === "model-backed" && modelBackedAvailable ? (
        <StatusBanner
          tone="ok"
          title={t("Discussion with AI selected")}
          detail={t(
            "This discussion will use configured AI participants from your local setup."
          )}
        />
      ) : null}
      {providerSetupSaved && !modelBackedAvailable ? (
        <StatusBanner
          tone={verificationError ? "error" : "warning"}
          title={t(
            verificationError
              ? "Provider connection could not be verified"
              : "Test provider connection"
          )}
          detail={
            verificationError
              ? formatSafeErrorMessage(verificationError)
              : t(
                  "Test the saved provider connection here to continue with AI participants without returning to Connect AI."
                )
          }
        />
      ) : null}
      <fieldset className="du-participant-source-picker">
        <legend>{t("Choose participant source")}</legend>
        <label
          className={`du-participant-source-card ${
            selectedSource === "demo" ? "du-participant-source-selected" : ""
          } ${demoAvailable ? "" : "du-participant-source-disabled"}`}
        >
          <input
            type="radio"
            name="discussion-participant-source"
            value="demo"
            checked={selectedSource === "demo"}
            disabled={!demoAvailable}
            onChange={() => onSelectedSourceChange("demo")}
          />
          <span>
            <strong>{t("Demo participants")}</strong>
            <small>{t("Start immediately with built-in sample participants.")}</small>
          </span>
        </label>
        <label
          className={`du-participant-source-card ${
            selectedSource === "model-backed" ? "du-participant-source-selected" : ""
          } ${modelBackedAvailable ? "" : "du-participant-source-disabled"}`}
        >
          <input
            type="radio"
            name="discussion-participant-source"
            value="model-backed"
            checked={selectedSource === "model-backed"}
            disabled={!modelBackedAvailable}
            onChange={() => onSelectedSourceChange("model-backed")}
          />
          <span>
            <strong>{t("AI participants")}</strong>
            <small>
              {providerSource
                ? t(
                    "{provider} is ready. This discussion will use configured AI participants from the local service.",
                    { provider: t(providerSource.name) }
                  )
                : providerSetupSaved
                  ? t(
                      "Provider setup is saved. Use Test connection here or in Connect AI before selecting AI participants."
                    )
                : t(
                    "Configure a ready AI provider locally before selecting AI participants."
                  )}
            </small>
          </span>
        </label>
      </fieldset>
      <fieldset className="du-participant-source-picker du-participant-depth-picker">
        <legend>{t("Choose discussion depth")}</legend>
        <label
          className={`du-participant-source-card ${
            perspectiveCount === 2 ? "du-participant-source-selected" : ""
          } ${modelBackedAvailable && selectedSource === "model-backed" ? "" : "du-participant-source-disabled"}`}
        >
          <input
            type="radio"
            name="model-perspective-count"
            value="2"
            checked={perspectiveCount === 2}
            disabled={!modelBackedAvailable || selectedSource !== "model-backed"}
            onChange={() => onPerspectiveCountChange(2)}
          />
          <span>
            <strong>{t("Focused review")}</strong>
            <small>{t("Two independent model perspectives keep the discussion concise.")}</small>
          </span>
        </label>
        <label
          className={`du-participant-source-card ${
            perspectiveCount === 3 ? "du-participant-source-selected" : ""
          } ${modelBackedAvailable && selectedSource === "model-backed" ? "" : "du-participant-source-disabled"}`}
        >
          <input
            type="radio"
            name="model-perspective-count"
            value="3"
            checked={perspectiveCount === 3}
            disabled={!modelBackedAvailable || selectedSource !== "model-backed"}
            onChange={() => onPerspectiveCountChange(3)}
          />
          <span>
            <strong>{t("Broader review")}</strong>
            <small>{t("Three independent model perspectives give the room more comparison material.")}</small>
          </span>
        </label>
      </fieldset>
      {modelBackedAvailable ? (
        <div className="du-discussion-model-assignment">
          <section className="du-role-defaults-panel" aria-label={t("Participant model choices")}>
            <div>
              <strong>{t("Participant model choices")}</strong>
              <p>
                {t(
                  "Save non-secret participant model choices to the local service so future discussions with AI start with the same setup."
                )}
              </p>
            </div>
            <div className="du-action-row">
              <button
                type="button"
                className="du-secondary-button"
                disabled={selectedSource !== "model-backed" || roleDefaultsPending}
                onClick={onSaveRoleDefaults}
              >
                {t("Save participant choices")}
              </button>
              <button
                type="button"
                className="du-secondary-button"
                disabled={
                  selectedSource !== "model-backed" ||
                  !roleDefaultsSaved ||
                  roleDefaultsPending
                }
                onClick={onApplyRoleDefaults}
              >
                {t("Apply saved participant choices")}
              </button>
              <button
                type="button"
                className="du-secondary-button"
                disabled={!roleDefaultsSaved || roleDefaultsPending}
                onClick={onClearRoleDefaults}
              >
                {t("Clear saved participant choices")}
              </button>
            </div>
            <p className="du-role-defaults-note">
              {t(getRoleModelDefaultsStatusMessage(roleDefaultsStatus, roleDefaultsSaved))}
            </p>
          </section>
          <label
            className={`du-discussion-model-override ${
              selectedSource === "model-backed" ? "" : "du-discussion-model-override-disabled"
            }`}
            htmlFor="discussion-model-override"
          >
            <span>
              <strong>{t("Model for first replies")}</strong>
              <small>
                {t(
                  "Leave blank to use the model saved in Connect AI. Viewpoints without their own model use this value for first responses."
                )}
              </small>
            </span>
            <input
              id="discussion-model-override"
              value={modelOverride}
              disabled={selectedSource !== "model-backed"}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("Use saved model for perspectives")}
              onChange={(event) => onModelOverrideChange(event.currentTarget.value)}
            />
          </label>
          <label
            className={`du-discussion-model-override ${
              selectedSource === "model-backed" ? "" : "du-discussion-model-override-disabled"
            }`}
            htmlFor="discussion-review-model-override"
          >
            <span>
              <strong>{t("Model for review and answer")}</strong>
              <small>
                {t(
                  "Leave blank to use the first-response model. A value here applies to Skeptic, Evidence checker, Risk reviewer, and Summary writer only."
                )}
              </small>
            </span>
            <input
              id="discussion-review-model-override"
              value={reviewModelOverride}
              disabled={selectedSource !== "model-backed"}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("Use first-response model")}
              onChange={(event) => onReviewModelOverrideChange(event.currentTarget.value)}
            />
          </label>
          <label
            className={`du-perspective-model-toggle ${
              selectedSource === "model-backed" ? "" : "du-perspective-model-toggle-disabled"
            }`}
          >
            <input
              type="checkbox"
              checked={customPerspectiveModelsEnabled}
              disabled={selectedSource !== "model-backed"}
              onChange={(event) =>
                onCustomPerspectiveModelsEnabledChange(event.currentTarget.checked)
              }
            />
            <span>
              <strong>{t("Choose models per viewpoint")}</strong>
              <small>
                {t(
                  "Give individual first-response viewpoints their own model. Leave a field blank to use the first-response model."
                )}
              </small>
            </span>
          </label>
          {customPerspectiveModelsEnabled ? (
            <div
              className="du-perspective-model-grid"
              aria-label={t("Viewpoint model choices")}
            >
              {perspectiveModelFields.map((field) => (
                <label key={field.participantId} htmlFor={`${field.participantId}-model`}>
                  <span>{t(field.label)}</span>
                  <input
                    id={`${field.participantId}-model`}
                    value={perspectiveModelOverrides[field.participantId] ?? ""}
                    disabled={selectedSource !== "model-backed"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("Use first-response model")}
                    onChange={(event) =>
                      onPerspectiveModelOverrideChange(
                        field.participantId,
                        event.currentTarget.value
                      )
                    }
                  />
                </label>
              ))}
              <p>
                {t(
                  "Per-viewpoint choices affect first replies only. Review and answer steps use the review model when one is set."
                )}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="du-discussion-setup-note">
        {selectedSource === "model-backed" && modelBackedAvailable
          ? t(
              "The selected depth controls how many independent AI participants answer before Deliberum compares options."
            )
          : t(
              "Demo walkthroughs use two built-in sample perspectives. Choose AI participants to use a broader independent review."
            )}
      </p>
      <DiscussionParticipantLineup
        selectedSource={selectedSource}
        providerSource={providerSource}
        organizerReady={organizerReady}
        demoAvailable={demoAvailable}
        perspectiveCount={perspectiveCount}
      />
      <p className="du-discussion-setup-note">
        {t(
          "This page does not show API keys. Use Connect AI to save provider setup before starting discussions with AI."
        )}
      </p>
      <div className="du-action-row">
        {providerSetupSaved && !modelBackedAvailable ? (
          <button
            type="button"
            className="du-secondary-button"
            onClick={onVerifyProviderConnection}
            disabled={verificationPending}
          >
            {t(verificationPending ? "Testing connection" : "Test connection")}
          </button>
        ) : null}
        <Link className="du-action-link du-secondary-link" to="/setup/models">
          {t("Open Connect AI")}
        </Link>
      </div>
    </DataPanel>
  );
}

function DiscussionParticipantLineup({
  selectedSource,
  providerSource,
  organizerReady,
  demoAvailable,
  perspectiveCount
}: {
  selectedSource: DiscussionParticipantSource;
  providerSource: DiscussionProviderSource | undefined;
  organizerReady: boolean;
  demoAvailable: boolean;
  perspectiveCount: ProviderBackedPerspectiveCount;
}) {
  const { t } = useI18n();
  const lineup = buildDiscussionParticipantLineup({
    selectedSource,
    providerSource,
    organizerReady,
    demoAvailable,
    perspectiveCount
  });

  return (
    <section className="du-participant-lineup" aria-label={t("Participants for this discussion")}>
      <div className="du-section-label">
        <p className="du-kicker">{t("Participant lineup")}</p>
        <h4>{t("Participants for this discussion")}</h4>
        <p>
          {t(
            "Before creating the discussion, see who will answer first and who will review the result."
          )}
        </p>
      </div>
      <div className="du-participant-lineup-grid">
        {lineup.map((item) => (
          <DiscussionParticipantLineupCard key={`${item.role}:${item.contribution}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function DiscussionParticipantLineupCard({
  item
}: {
  item: DiscussionParticipantLineupItem;
}) {
  const { t } = useI18n();
  const detailValues = item.detailValues
    ? Object.fromEntries(
        Object.entries(item.detailValues).map(([key, value]) => [key, t(value)])
      )
    : undefined;

  return (
    <article className={`du-participant-lineup-card du-participant-lineup-${item.tone}`}>
      <span>{t(item.contribution)}</span>
      <strong>{t(item.role)}</strong>
      <small>{t(item.source)}</small>
      <p>{t(item.detail, detailValues)}</p>
    </article>
  );
}

function buildDiscussionCreationPreview(input: {
  selectedSource: DiscussionParticipantSource;
  providerSource: DiscussionProviderSource | undefined;
  organizerReady: boolean;
  demoAvailable: boolean;
  perspectiveCount: ProviderBackedPerspectiveCount;
  modelOverride: string;
  reviewModelOverride: string;
  customPerspectiveModelsEnabled: boolean;
  perspectiveModelOverrides: ProviderBackedPerspectiveModelOverrides;
  setupKnown: boolean;
}): DiscussionCreationPreviewView {
  if (!input.setupKnown) {
    return {
      title: "Checking discussion path",
      detail: "Web is checking which participant source can create a useful discussion.",
      tone: "neutral",
      steps: [
        {
          label: "Who answers first",
          value: "Checking",
          detail: "The available participant source will appear after setup status loads.",
          tone: "neutral"
        },
        {
          label: "Who reviews the result",
          value: "Checking",
          detail: "Review role readiness appears after setup status loads.",
          tone: "neutral"
        },
        {
          label: "After create",
          value: "Discussion room",
          detail: "The next screen will show the room for this discussion.",
          tone: "neutral"
        }
      ]
    };
  }

  if (input.selectedSource === "model-backed" && input.providerSource) {
    const firstResponseModel = input.modelOverride.trim();
    const reviewRoleModel = input.reviewModelOverride.trim();
    const customizedPerspectiveModelCount = input.customPerspectiveModelsEnabled
      ? countPerspectiveModelOverrides(input.perspectiveModelOverrides, input.perspectiveCount)
      : 0;

    return {
      title: "Ready to create a deliberation room",
      detail: input.organizerReady
        ? "Configured AI participants will answer first; review and answer roles can then structure options, unresolved points, evidence gaps, risks, and a current answer."
        : "Configured AI participants can answer first, but review and answer roles are not ready yet.",
      tone: input.organizerReady ? "ok" : "warning",
      steps: [
        {
          label: "Who answers first",
          value:
            input.perspectiveCount === 3
              ? "3 AI perspectives"
              : "2 AI perspectives",
          detail:
            input.perspectiveCount === 3
              ? "First viewpoint, Alternative viewpoint, and Additional viewpoint will answer independently."
              : "First viewpoint and Alternative viewpoint will answer independently.",
          tone: "ok"
        },
        {
          label: "Participant source",
          value: "{provider} model",
          valueValues: {
            provider: input.providerSource.name
          },
          detail: "API keys stay on this machine and are not shown on this page.",
          tone: "ok"
        },
        {
          label: "Model for first replies",
          value: firstResponseModel || "Saved AI setup",
          detail: firstResponseModel
            ? "Viewpoints without their own model use this first-response model."
            : "Viewpoints without their own model use the model saved in Connect AI.",
          tone: "ok"
        },
        {
          label: "Model for review and answer",
          value: reviewRoleModel || firstResponseModel || "Saved AI setup",
          detail: reviewRoleModel
            ? "Review roles use this model while first-response viewpoints keep their assigned models."
            : "Review roles use the same model as first-response viewpoints.",
          tone: "ok"
        },
        ...(customizedPerspectiveModelCount > 0
          ? [
              {
                label: "Viewpoint model choices",
                value: "Viewpoint models customized",
                detail:
                  "Per-viewpoint choices affect first replies only. Review and answer steps use the review model when one is set.",
                tone: "ok" as const
              }
            ]
          : []),
        {
          label: "After create",
          value: "Discussion room",
          detail: input.organizerReady
            ? "Open the room, then continue the guided discussion to organize first responses into a reviewable answer."
            : "Open the room, then finish review role setup before expecting strongest options or an answer.",
          tone: input.organizerReady ? "ok" : "warning"
        }
      ]
    };
  }

  if (input.selectedSource === "demo" && input.demoAvailable) {
    return {
      title: "Ready to create a demo discussion",
      detail:
        "Built-in demo participants let first-time users try the full room flow before connecting AI.",
      tone: input.organizerReady ? "ok" : "warning",
      steps: [
        {
          label: "Who answers first",
          value: "2 demo perspectives",
          detail: "First viewpoint and Alternative viewpoint use deterministic sample material.",
          tone: "warning"
        },
        {
          label: "Who reviews the result",
          value: input.organizerReady ? "Full discussion loop" : "Review roles setup needed",
          detail: input.organizerReady
            ? "Local review roles can compare options, review risks, and draft the current answer."
            : "The discussion may collect first responses only until review roles are ready.",
          tone: input.organizerReady ? "ok" : "warning"
        },
        {
          label: "After create",
          value: "Discussion room",
          detail:
            "Open the room, then continue the guided discussion to review the timeline and current result.",
          tone: "ok"
        }
      ]
    };
  }

  return {
    title: "Finish setup before creating",
    detail: "Choose an available participant source in Connect AI, then return here.",
    tone: "warning",
    steps: [
      {
        label: "Who answers first",
        value: "No participant source ready",
        detail: "Add a demo preset or AI provider before creating useful material.",
        tone: "warning"
      },
      {
        label: "Who reviews the result",
        value: "Review roles setup needed",
        detail: "Skeptic, Evidence checker, Risk reviewer, and Summary writer must be ready before Deliberum can prepare the answer.",
        tone: "warning"
      },
      {
        label: "After create",
        value: "Connect AI",
        detail: "Complete setup first, then start the discussion again.",
        tone: "neutral"
      }
    ]
  };
}

function buildDiscussionParticipantLineup(input: {
  selectedSource: DiscussionParticipantSource;
  providerSource: DiscussionProviderSource | undefined;
  organizerReady: boolean;
  demoAvailable: boolean;
  perspectiveCount: ProviderBackedPerspectiveCount;
}): DiscussionParticipantLineupItem[] {
  const providerName = input.providerSource?.name ?? "Configured model provider";
  const perspectiveRoles = getDiscussionPerspectiveRoles(input);
  const perspectiveDetail =
    input.selectedSource === "model-backed" && input.providerSource
      ? "{provider} will answer through the configured local setup."
      : input.demoAvailable
        ? "Uses built-in demo material for a deterministic walkthrough."
        : "No ready participant source is available yet.";
  const perspectiveSource =
    input.selectedSource === "model-backed" && input.providerSource
      ? providerName
      : "Demo participants";
  const perspectiveTone: DiscussionParticipantLineupItem["tone"] =
    input.selectedSource === "model-backed" && input.providerSource
      ? "ok"
      : input.demoAvailable
        ? "warning"
        : "neutral";
  const organizerDetail = input.organizerReady
    ? input.selectedSource === "model-backed" && input.providerSource
      ? "Skeptic, Evidence checker, Risk reviewer, and Summary writer can review the discussion after first responses."
      : "Local review roles can compare options, review evidence and risks, and draft the current answer after first responses."
    : "Review roles are not ready yet; continuing the discussion may collect first responses only.";
  const organizerTone: DiscussionParticipantLineupItem["tone"] = input.organizerReady
    ? "ok"
    : "warning";
  const organizerSource = input.organizerReady
    ? input.selectedSource === "model-backed" && input.providerSource
      ? "Model review roles"
      : "Local review roles"
    : "Review roles setup needed";

  return [
    ...perspectiveRoles.map((perspective) => ({
      role: perspective.role,
      contribution: "Independent first response",
      source: perspectiveSource,
      detail: perspectiveDetail,
      detailValues:
        input.selectedSource === "model-backed" && input.providerSource
          ? { provider: providerName }
          : undefined,
      tone: perspectiveTone
    })),
    {
      role: "Skeptic",
      contribution: "Requirements and disagreement review",
      source: organizerSource,
      detail: organizerDetail,
      tone: organizerTone
    },
    {
      role: "Evidence checker",
      contribution: "Evidence and risk review",
      source: organizerSource,
      detail: organizerDetail,
      tone: organizerTone
    },
    {
      role: "Summary writer",
      contribution: "Current answer draft",
      source: organizerSource,
      detail: organizerDetail,
      tone: organizerTone
    }
  ];
}

function getDiscussionPerspectiveRoles(input: {
  selectedSource: DiscussionParticipantSource;
  providerSource: DiscussionProviderSource | undefined;
  demoAvailable: boolean;
  perspectiveCount: ProviderBackedPerspectiveCount;
}): DiscussionPerspectiveRole[] {
  const perspectiveRoles: DiscussionPerspectiveRole[] = [
    {
      role: "First viewpoint"
    },
    {
      role: "Alternative viewpoint"
    }
  ];

  if (input.selectedSource === "model-backed" && input.providerSource && input.perspectiveCount === 3) {
    perspectiveRoles.push({
      role: "Additional viewpoint"
    });
  }

  return perspectiveRoles;
}

function getPerspectiveModelFields(
  perspectiveCount: ProviderBackedPerspectiveCount
): DiscussionPerspectiveModelField[] {
  return DISCUSSION_PERSPECTIVE_MODEL_FIELDS.slice(0, perspectiveCount);
}

function countPerspectiveModelOverrides(
  overrides: ProviderBackedPerspectiveModelOverrides,
  perspectiveCount: ProviderBackedPerspectiveCount
): number {
  return getPerspectiveModelFields(perspectiveCount).filter((field) => {
    const model = overrides[field.participantId]?.trim();

    return Boolean(model);
  }).length;
}

function getRoleModelDefaultsStatusMessage(
  status: RoleModelDefaultsStatus,
  saved: boolean
): string {
  switch (status) {
    case "saved":
      return "Saved participant choices to the local service. API keys and base URLs are not stored here.";
    case "loaded":
      return "Applied the saved participant choices to this discussion.";
    case "cleared":
      return "Cleared saved participant choices from the local service. Current discussion fields are unchanged.";
    case "unavailable":
      return "Participant choices could not be changed in the local service. You can still create this discussion.";
    case "idle":
    default:
      return saved
        ? "Saved participant choices are available from the local service."
        : "No saved participant choices yet. API keys and base URLs are never saved here.";
  }
}

function describeDiscussionModelSetup(
  setupPlan: RuntimeSetupPlan,
  providerConnectionVerified: boolean
): DiscussionModelSetupView {
  const localPreset = setupPlan.profiles.find((profile) => profile.id === "local-preset");
  const providerProfiles = setupPlan.profiles.filter((profile) => profile.id !== "local-preset");
  const configuredModelBackedSource = findProviderBackedDiscussionSource(setupPlan);
  const modelBackedSource = providerConnectionVerified
    ? configuredModelBackedSource
    : undefined;
  const readyWithDiscussionSettingsCount = providerProfiles.filter(
    (profile) =>
      isSupportedModelBackedDiscussionProfile(profile) &&
      profile.status === "ready_with_run_config"
  ).length;
  const providerNeedsSetup = providerProfiles.some(
    (profile) => profile.status === "needs_configuration" || profile.status === "disabled"
  );
  const localPresetReady = localPreset?.status === "ready";

  if (modelBackedSource) {
    return {
      title: "AI participants ready",
      detail:
        "A ready AI provider is available. Web selects AI participants by default; use demo participants only for walkthroughs.",
      quickStartDetail:
        "Demo participants remain available when you want a deterministic walkthrough without provider calls.",
      providerDetail: "A configured AI provider is selected for this discussion by default.",
      providerTone: "ok",
      tone: "ok"
    };
  }

  if (configuredModelBackedSource) {
    return {
      title: localPresetReady
        ? "Demo start, provider verification needed"
        : "Provider verification needed",
      detail: localPresetReady
        ? "The quick-start form can start now with demo participants. Use Test connection on this page to unlock AI participants."
        : "Use Test connection on this page to unlock AI participants for this discussion.",
      quickStartDetail:
        localPresetReady
          ? "The plain-language form starts with built-in demo participants so the first discussion works immediately."
          : "Demo participants are not enabled in this local service.",
      providerDetail:
        "Provider setup is saved; use Test connection here or in Connect AI before relying on AI results.",
      providerTone: "warning",
      tone: "warning"
    };
  }

  if (readyWithDiscussionSettingsCount > 0) {
    return {
      title: "Demo start, provider details needed",
      detail:
        "The quick-start form can start now with demo participants. A provider is enabled, but model details still need Web setup or per-discussion model settings.",
      quickStartDetail:
        "The plain-language form starts with built-in demo participants so the first discussion works immediately.",
      providerDetail:
        "Provider enabled; add base URL and model locally before relying on AI results.",
      providerTone: "warning",
      tone: "warning"
    };
  }

  if (localPresetReady) {
    return {
      title: "Demo start ready",
      detail:
        "You can start with built-in demo participants now. Configure a real provider before relying on AI results.",
      quickStartDetail:
        "The plain-language form starts with built-in demo participants so the first discussion works immediately.",
      providerDetail:
        "No real AI provider is ready yet. Configure one locally before relying on discussions with AI.",
      providerTone: "warning",
      tone: providerNeedsSetup ? "warning" : "ok"
    };
  }

  return {
    title: "Connect AI needed",
    detail:
      "No demo participant or AI provider is ready. Configure at least one participant source locally before starting a useful discussion.",
    quickStartDetail:
      "The quick-start form needs at least one local participant source before it can create useful discussion material.",
    providerDetail:
      "No real AI provider is ready yet. Configure one locally before relying on discussions with AI.",
    providerTone: "neutral",
    tone: "warning"
  };
}

const WEB_CONFIGURABLE_MODEL_BACKED_DISCUSSION_PROFILE_IDS = new Set([
  "openai-compatible"
]);

function isDemoDiscussionSourceAvailable(setupPlan: RuntimeSetupPlan | undefined): boolean {
  if (!setupPlan) {
    return true;
  }

  return setupPlan.profiles.some(
    (profile) => profile.id === "local-preset" && profile.status === "ready"
  );
}

function findProviderBackedDiscussionSource(
  setupPlan: RuntimeSetupPlan
): DiscussionProviderSource | undefined {
  const profile = setupPlan.profiles.find(
    (candidate) =>
      candidate.status === "ready" && isSupportedModelBackedDiscussionProfile(candidate)
  );

  if (!profile) {
    return undefined;
  }

  return {
    name: profile.name,
    adapterId: profile.id,
    providerConfigId:
      profile.id === "openai-compatible"
        ? OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID
        : `web-${profile.id}-discussion`,
    ...(profile.configuredSecretEnvVarCount > 0 && profile.secretEnvVarNames[0]
      ? { apiKeyEnvVar: profile.secretEnvVarNames[0] }
      : {})
  };
}

function isSupportedModelBackedDiscussionProfile(
  profile: RuntimeSetupPlan["profiles"][number]
): boolean {
  return WEB_CONFIGURABLE_MODEL_BACKED_DISCUSSION_PROFILE_IDS.has(profile.id);
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
    <RunWorkspaceShell runId={runId}>
      <ViewFrame
        className="du-run-detail-view"
        eyebrow={t("User Mode")}
        title={t(formatRunDisplayTitle(run))}
        description={t(
          "Start or continue a discussion, then review the current answer, main perspectives, unresolved points, risks, what needs checking, and next steps."
        )}
        hideHeader={Boolean(sessionId)}
        actions={
          reviewReady ? (
            <>
              <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
                {t("View current answer")}
              </Link>
              <a className="du-action-link du-secondary-link" href="#continue-discussion">
                {t("Update answer")}
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
            <RunQualityOverview
              runId={runId}
              sessionId={sessionId}
              run={run}
              discussionComposer={
                <StartRunForm
                  runId={runId}
                  sessionId={sessionId}
                  run={run}
                  variant="room-composer"
                />
              }
            />
          ) : null}
          {!sessionId ? (
            <div id="continue-discussion" className="du-workbench-anchor">
              <StartRunForm
                runId={runId}
                sessionId={sessionId}
                run={run}
                variant="advanced-start-request"
              />
            </div>
          ) : null}
          {sessionId ? (
            <DiscussionDetailPanelsDrawer>
              <StartRunForm
                runId={runId}
                sessionId={sessionId}
                run={run}
                variant="advanced-start-request"
              />
              <RunProjectionPanels sessionId={sessionId} />
              <DiscussionSetupDetails run={run} />
              <RunProgressDetails run={run} />
            </DiscussionDetailPanelsDrawer>
          ) : null}
          {!sessionId ? (
            <>
              <RunBriefPanel run={run} />
              <RunSummary run={run} />
            </>
          ) : null}
          {!sessionId ? <RunProgressDetails run={run} /> : null}
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
        title={t("Current Answer")}
        description={t(
          "Review the current answer together with main perspectives, unresolved points, evidence needs, risks, and next steps."
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
                title={t("Current Answer")}
                description={t(
                  "A readable summary of the current result. Advanced details keep source details and developer diagnostics out of the default view."
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
                title={t("Current answer not available")}
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
  children
}: {
  runId?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <WorkspaceShell
      productName="Deliberum"
      workspaceLabel={t("User Mode")}
      navigation={<RunNavigation runId={runId} />}
      status={<LanguageSwitcher />}
    >
      {children}
    </WorkspaceShell>
  );
}

function RunNavigation({
  runId
}: {
  runId?: string;
}) {
  const { t } = useI18n();
  const linkClass = "du-nav-link";

  return (
    <>
      <Link
        to="/"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Home / Today")}
      </Link>
      <Link
        to="/setup/models"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Connect AI")}
      </Link>
      <Link
        to="/runs"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("My Discussions")}
      </Link>
      {runId ? (
        <Link
          to="/runs/$runId"
          params={{ runId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkClass} is-active` }}
          inactiveProps={{ className: linkClass }}
        >
          {t("Discussion Room")}
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
          {t("Current Answer")}
        </Link>
      ) : null}
      <Link
        to="/advanced"
        activeOptions={{ exact: true }}
        activeProps={{ className: `${linkClass} is-active` }}
        inactiveProps={{ className: linkClass }}
      >
        {t("Developer Tools")}
      </Link>
    </>
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
  const topic = getRunTopic(run);
  const title = getStringRecordValue(run, "title");

  if (topic) {
    return topic;
  }

  if (title && !isTechnicalRunTitle(title)) {
    return title;
  }

  return typeof index === "number" ? `Discussion ${index + 1}` : "Discussion";
}

function getRunTopic(run: unknown): string | undefined {
  return (
    getStringRecordValue(run, "topic") ??
    getStringRecordValue(getRecordValue(run, "plan"), "topic")
  );
}

export function formatRunDisplaySummary(run: unknown): string {
  const topic = getRunTopic(run);
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

type RunCatalogEntry = {
  run: unknown;
  originalIndex: number;
};

export function RunCatalogList({ runs }: { runs: unknown[] }) {
  const { t } = useI18n();
  const [latestRunEntry, ...earlierRunEntries] = getRunCatalogEntries(runs);

  if (!latestRunEntry) {
    return null;
  }

  return (
    <div className="du-run-catalog">
      <div className="du-run-list du-run-list-featured">
        <RunListItem
          key={getRunItemKey(latestRunEntry.run, latestRunEntry.originalIndex)}
          eyebrow="Resume latest discussion"
          featured
          run={latestRunEntry.run}
          index={0}
        />
      </div>
      {earlierRunEntries.length > 0 ? (
        <details className="du-user-details du-run-more-details">
          <summary>
            <span>{t("More discussions")}</span>
            <small>
              {t(
                earlierRunEntries.length === 1
                  ? "{count} earlier discussion remains available."
                  : "{count} earlier discussions remain available.",
                {
                  count: earlierRunEntries.length
                }
              )}
            </small>
          </summary>
          <div className="du-run-list">
            {earlierRunEntries.map((entry, index) => (
              <RunListItem
                key={getRunItemKey(entry.run, entry.originalIndex)}
                run={entry.run}
                index={index + 1}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function getRunCatalogEntries(runs: unknown[]): RunCatalogEntry[] {
  return runs
    .map((run, originalIndex) => ({
      run,
      originalIndex
    }))
    .sort(compareRunCatalogEntries);
}

function compareRunCatalogEntries(left: RunCatalogEntry, right: RunCatalogEntry): number {
  const updatedDifference = getRunCatalogTime(right.run) - getRunCatalogTime(left.run);

  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.originalIndex - right.originalIndex;
}

function getRunCatalogTime(run: unknown): number {
  const timestamp =
    getStringRecordValue(run, "updatedAt") ?? getStringRecordValue(run, "createdAt");
  const parsedTimestamp = timestamp ? Date.parse(timestamp) : Number.NaN;

  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
}

function RunListItem({
  eyebrow,
  featured = false,
  run,
  index
}: {
  eyebrow?: string;
  featured?: boolean;
  run: unknown;
  index: number;
}) {
  const { t } = useI18n();
  const runId = getStringRecordValue(run, "runId");
  const reviewReady = isDiscussionReviewReady(run);

  return (
    <article
      className={
        featured ? "du-run-list-item du-run-list-item-featured" : "du-run-list-item"
      }
    >
      <div>
        <p className="du-kicker">
          {eyebrow ? t(eyebrow) : t("Discussion {number}", { number: index + 1 })}
        </p>
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
      {runId ? <RunListTaskRoutes runId={runId} reviewReady={reviewReady} /> : null}
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

function RunListTaskRoutes({
  runId,
  reviewReady
}: {
  runId: string;
  reviewReady: boolean;
}) {
  const { t } = useI18n();

  return (
    <nav className="du-run-task-routes" aria-label={t("Discussion paths")}>
      <Link
        className="du-run-task-route du-run-task-route-primary"
        to="/runs/$runId"
        params={{ runId }}
        aria-label={t("Open discussion room")}
      >
        <span>{t("Discussion Room")}</span>
        <strong>{t("Open discussion room")}</strong>
        <small>{t("Continue the conversation and read participant messages in order.")}</small>
      </Link>
      {reviewReady ? (
        <Link
          className="du-run-task-route"
          to="/runs/$runId/outcome"
          params={{ runId }}
          aria-label={t("Open current answer")}
        >
          <span>{t("Current Answer")}</span>
          <strong>{t("Open current answer")}</strong>
          <small>
            {t(
              "Review the answer, unresolved points, evidence needs, risks, and next steps."
            )}
          </small>
        </Link>
      ) : (
        <article className="du-run-task-route du-run-task-route-disabled" aria-disabled="true">
          <span>{t("Current Answer")}</span>
          <strong>{t("Answer not ready yet")}</strong>
          <small>
            {t(
              "Continue the discussion first; this page appears after answer material exists."
            )}
          </small>
        </article>
      )}
    </nav>
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
    [
      "Independent first responses",
      getDiscussionStageStatus(run, "sealedDivergenceStatus", "sealedDivergence")
    ],
    [
      "Strongest current options",
      getDiscussionStageStatus(run, "latestExtractionStatus", "extraction")
    ],
    [
      "Option quality",
      getDiscussionStageStatus(run, "latestCandidateRepairStatus", "candidateRepair")
    ],
    [
      "Evidence and verification",
      getDiscussionStageStatus(run, "latestEvidenceCheckStatus", "evidenceCheck")
    ],
    [
      "Must cover",
      getDiscussionStageStatus(run, "latestProposalReviewStatus", "proposalReview")
    ],
    [
      "Current Answer",
      getDiscussionStageStatus(run, "latestFinalizationStatus", "finalization")
    ]
  ];
}

function getDiscussionStageStatus(
  run: unknown,
  summaryStatusKey: string,
  roundKey: string
): unknown {
  const round = getLatestDiscussionRound(run, roundKey);

  if (discussionRoundNeedsAttention(round)) {
    return "needs_attention";
  }

  return getRecordValue(run, summaryStatusKey);
}

function getLatestDiscussionRound(run: unknown, roundKey: string): unknown {
  const rounds = getRecordValue(run, "rounds");
  const stageRounds = getRecordValue(rounds, roundKey);

  if (Array.isArray(stageRounds)) {
    return stageRounds.at(-1);
  }

  return stageRounds;
}

function discussionRoundNeedsAttention(round: unknown): boolean {
  if (!round) {
    return false;
  }

  if (getRecordValue(round, "lastErrorCategory") !== undefined) {
    return true;
  }

  const stateGroups = [
    "participantDispatches",
    "generatorStates",
    "reviewerStates",
    "auditorStates"
  ];
  const hasFailedState = stateGroups.some((groupKey) =>
    asArray(getRecordValue(round, groupKey)).some(isFailedDiscussionStepState)
  );
  const outcomeCompilation = getRecordValue(round, "outcomeCompilation");

  return (
    hasFailedState ||
    isFailedDiscussionStepState(getRecordValue(round, "finalCandidateState")) ||
    getRecordValue(outcomeCompilation, "status") === "failed"
  );
}

function isFailedDiscussionStepState(state: unknown): boolean {
  const status = getRecordValue(state, "status");

  return status === "failed" || status === "timed_out";
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

function DiscussionParticipantSourceSummary({ run }: { run: unknown }) {
  const { t } = useI18n();
  const source = describeDiscussionParticipantSource(run);

  return (
    <article className={`du-discussion-source du-discussion-source-${source.tone}`}>
      <p className="du-kicker">{t("Participant source")}</p>
      <strong>{t(source.title)}</strong>
      <span>{t(source.detail)}</span>
      <small>{t(source.note)}</small>
    </article>
  );
}

function DiscussionContinuationSetupSummary({
  view
}: {
  view: DiscussionContinuationSetupView;
}) {
  const { t } = useI18n();

  return (
    <article className={`du-discussion-source du-discussion-source-${view.tone}`}>
      <p className="du-kicker">{t("Continuation setup")}</p>
      <strong>{t(view.title)}</strong>
      <span>{t(view.detail)}</span>
      <small>{t(view.note)}</small>
    </article>
  );
}

function StartRunForm({
  runId,
  sessionId,
  run,
  variant = "panel"
}: {
  runId: string;
  sessionId?: string;
  run: unknown;
  variant?: "panel" | "room-composer" | "advanced-start-request";
}) {
  const { t } = useI18n();
  const { client } = useDaemonRuntime();
  const queryClient = useQueryClient();
  const continuationView = describeDiscussionContinuation(run);
  const runtimeProfilesQuery = useQuery({
    queryKey: ["runtime-profiles"],
    queryFn: () => client.getRuntimeProfiles()
  });
  const runEventsQuery = useQuery({
    queryKey: ["run-events", runId],
    queryFn: () => client.getRunEvents(runId)
  });
  const runtimeSetupPlan = runtimeProfilesQuery.data
    ? buildRuntimeSetupPlan(runtimeProfilesQuery.data)
    : undefined;
  const continuationSetup = describeDiscussionContinuationSetup(
    run,
    runtimeSetupPlan,
    runtimeProfilesQuery.isError ? "error" : runtimeProfilesQuery.isLoading ? "loading" : "ready",
    runtimeProfilesQuery.data
  );
  const recommendedStartRequestText = formatPresetJson(continuationSetup.startRequest);
  const latestUpdateRef = useRef<HTMLElement | null>(null);
  const visibleRoundCountFromEvents = runEventsQuery.data
    ? countVisibleDiscussionRoundsFromEvents(asArray(runEventsQuery.data.events), run)
    : undefined;
  const continuationRoundBeforeUpdate =
    visibleRoundCountFromEvents === undefined
      ? getNextDiscussionContinuationRound(run)
      : Math.max(1, visibleRoundCountFromEvents + 1);
  const [startRequestText, setStartRequestText] = useState(recommendedStartRequestText);
  const [startFeedback, setStartFeedback] = useState<DiscussionStartFeedback | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [roomMessageText, setRoomMessageText] = useState("");
  const [latestRoomMessageText, setLatestRoomMessageText] = useState<string | undefined>();
  const [latestContinuationRound, setLatestContinuationRound] = useState(
    continuationRoundBeforeUpdate
  );
  const startMutation = useMutation({
    mutationFn: (startRequest: Record<string, unknown>) => client.startRun(runId, startRequest),
    onSuccess: async (result) => {
      const resultSessionId =
        getStringRecordValue(getRecordValue(result, "run"), "sessionId") ?? sessionId;

      await invalidateRunWorkspaceQueries(queryClient, runId, resultSessionId);
      if (variant === "room-composer") {
        setRoomMessageText("");
      }
    }
  });

  useEffect(() => {
    if (!startMutation.data) {
      return;
    }

    const prefersReducedMotion =
      typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scrollTarget =
      variant === "room-composer" && typeof document !== "undefined"
        ? document.getElementById("room-conversation-transcript") ??
          document.getElementById("discussion-timeline") ??
          latestUpdateRef.current
        : latestUpdateRef.current;

    const scrollToTarget = () => {
      scrollTarget?.scrollIntoView?.({
        block: "start",
        behavior: variant === "room-composer" || prefersReducedMotion ? "auto" : "smooth"
      });
    };
    const scrollTimers =
      variant === "room-composer"
        ? [globalThis.setTimeout(scrollToTarget, 0), globalThis.setTimeout(scrollToTarget, 160)]
        : [globalThis.setTimeout(scrollToTarget, 0)];

    return () => {
      for (const scrollTimer of scrollTimers) {
        globalThis.clearTimeout(scrollTimer);
      }
    };
  }, [startMutation.data, variant]);

  function submitStartRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseJsonObjectInput(startRequestText, "Start request");

    if (!parsed.ok) {
      setInputError(parsed.message);
      return;
    }

    setStartFeedback(null);
    setInputError(null);
    setLatestContinuationRound(continuationRoundBeforeUpdate);
    startMutation.mutate(parsed.value);
  }

  useEffect(() => {
    setStartRequestText(recommendedStartRequestText);
  }, [recommendedStartRequestText]);

  function fillRecommendedStartRequest() {
    setInputError(null);
    setStartRequestText(recommendedStartRequestText);
  }

  function startRecommendedPipeline(feedback: DiscussionStartFeedback) {
    const visibleRoomMessage = isRoomComposer
      ? normalizeRoomComposerMessage(roomMessageText)
      : undefined;

    setStartFeedback(feedback);
    setInputError(null);
    setLatestRoomMessageText(visibleRoomMessage);
    setLatestContinuationRound(continuationRoundBeforeUpdate);
    const startRequest = prepareUserFacingContinuationStartRequest(
      continuationSetup.startRequest,
      run
    );
    setStartRequestText(formatPresetJson(startRequest));
    startMutation.mutate(startRequest);
  }

  const strongerOptionsFeedback = {
    title: "Stronger options requested",
    detail:
      "The guided update ran so the strongest current options can be compared again before relying on the conclusion."
  };
  const primaryActionDetail =
    continuationSetup.primaryActionDetail ?? continuationView.primaryActionDetail;
  const primaryResultTitle =
    continuationSetup.primaryResultTitle ?? continuationView.primaryResultTitle;
  const primaryResultDetail =
    continuationSetup.primaryResultDetail ?? continuationView.primaryResultDetail;
  const isRoomComposer = variant === "room-composer";
  const isAdvancedStartRequest = variant === "advanced-start-request";
  const usesRoomUpdatePresentation =
    isRoomComposer || (isAdvancedStartRequest && Boolean(sessionId));
  const roomComposerTitle = "Send message to the room";
  const roomComposerDetail = continuationView.reviewReady
    ? "Choose a quick reply to review or move the discussion forward."
    : hasCompletedDiscussionRoundMaterial(run)
      ? "Choose Continue discussion to let participants respond to the latest room state."
      : "Choose Continue discussion to let participants respond.";
  const primaryActionLabel = isRoomComposer ? "Send message and continue" : continuationView.primaryLabel;
  const roomPrimaryActionDetail = continuationSetup.primaryActionDetail?.includes(
    "first responses only"
  )
    ? continuationSetup.primaryActionDetail
    : continuationView.reviewReady || hasCompletedDiscussionRoundMaterial(run)
      ? "Start another readable round from the current room state."
      : "Continue the room from here.";
  const shouldShowLatestDiscussionUpdate =
    Boolean(startMutation.data) && (!isRoomComposer || !startMutation.isPending);
  const latestDiscussionUpdate = shouldShowLatestDiscussionUpdate ? (
    <section
      id="latest-discussion-update"
      className={`du-latest-discussion-update${
        usesRoomUpdatePresentation ? " du-room-update-message" : ""
      }`}
      aria-label={t("Latest discussion update")}
      ref={latestUpdateRef}
    >
      {usesRoomUpdatePresentation ? (
        <span className="du-room-update-avatar" aria-hidden="true">
          DR
        </span>
      ) : null}
      <div className="du-room-update-body">
        <div className="du-section-label">
          <p className="du-kicker">
            {t(usesRoomUpdatePresentation ? "Room update" : "Latest discussion update")}
          </p>
          <h4>{t(usesRoomUpdatePresentation ? "The room just updated" : "What just changed")}</h4>
          {usesRoomUpdatePresentation ? null : (
            <p>
              {t(
                "Review this result first, then return to the timeline, outputs, or next step."
              )}
            </p>
          )}
        </div>
        <StartResult
          result={startMutation.data}
          runId={runId}
          feedback={startFeedback}
          reviewReadyBeforeUpdate={continuationView.reviewReady}
          continuationRound={latestContinuationRound}
          userInstruction={latestRoomMessageText}
          presentation={usesRoomUpdatePresentation ? "room-message" : "panel"}
        />
      </div>
    </section>
  ) : null;
  const advancedStartRequestDetails = (
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
              onClick={fillRecommendedStartRequest}
              disabled={startMutation.isPending}
            >
              {t(continuationSetup.fillLabel)}
            </button>
          </>
        }
      />
    </AdvancedDetails>
  );
  const continuationDetails = (
    <details className="du-default-secondary-details du-continuation-details">
      <summary>{t("How this discussion will continue")}</summary>
      <div className="du-default-secondary-details-body">
        <div className="du-readable-list">
          <ExplainerItem
            title={t(continuationView.explainerTitle)}
            detail={t(continuationView.explainerDetail)}
          />
        </div>
        <DiscussionParticipantSourceSummary run={run} />
        <DiscussionContinuationSetupSummary view={continuationSetup} />
        <GuidedDiscussionActionPath reviewReady={continuationView.reviewReady} />
      </div>
    </details>
  );
  const startFeedbackMessages = (
    <>
      {inputError ? <StatusBanner tone="error" title={inputError} /> : null}
      {startMutation.isError ? (
        <>
          <StatusBanner
            tone="error"
            title={t("Discussion could not continue")}
            detail={t(formatRunStartErrorMessage(startMutation.error))}
          />
          <RunStartRecoveryActions error={startMutation.error} />
        </>
      ) : null}
    </>
  );

  if (isAdvancedStartRequest) {
    return (
      <>
        {continuationDetails}
        {advancedStartRequestDetails}
        {startFeedbackMessages}
        {latestDiscussionUpdate}
      </>
    );
  }

  const formContent = (
    <>
      <div
        className={`du-discussion-actions${
          isRoomComposer ? " du-discussion-actions-room" : ""
        }`}
        aria-label={t(isRoomComposer ? "Room quick replies" : "Discussion action composer")}
      >
        <div className="du-discussion-actions-heading">
          {isRoomComposer ? (
            <>
              <span className="du-room-composer-avatar" aria-hidden="true">
                DR
              </span>
              <div className="du-room-composer-copy">
                <p className="du-kicker">{t("Quick replies")}</p>
                <h4>{t(roomComposerTitle)}</h4>
                <p>{t(roomComposerDetail)}</p>
              </div>
            </>
          ) : (
            <>
              <p className="du-kicker">{t("Discussion action composer")}</p>
            </>
          )}
        </div>
        {isRoomComposer ? (
          <div className="du-room-message-input">
            <label htmlFor="room-message-text">{t("Send message to the room")}</label>
            <textarea
              id="room-message-text"
              value={roomMessageText}
              onChange={(event) => setRoomMessageText(event.currentTarget.value)}
              placeholder={t("Ask participants to respond to a concern, evidence gap, or next step.")}
              rows={3}
            />
            <p>
              {t(
                "This message guides the next round."
              )}
            </p>
          </div>
        ) : null}
        <div className="du-discussion-action-list">
          <button
            type="button"
            className="du-discussion-action-button"
            aria-label={t(primaryActionLabel)}
            onClick={() =>
              startRecommendedPipeline({
                title: primaryResultTitle,
                detail: primaryResultDetail
              })
            }
            disabled={startMutation.isPending}
          >
            <strong>{t(primaryActionLabel)}</strong>
            {isRoomComposer ? (
              <small>{t(roomPrimaryActionDetail)}</small>
            ) : (
              <>
                <span className="du-discussion-action-badge-row">
                  <span className="du-discussion-action-badge">{t("Recommended")}</span>
                  <span className="du-discussion-action-badge">{t("Updates discussion")}</span>
                </span>
                <span>{t(primaryActionDetail)}</span>
                <span className="du-discussion-action-result">
                  {t(
                    continuationView.reviewReady
                      ? "After it finishes, review the updated timeline and current answer."
                      : "After it finishes, review the updated timeline and next step."
                  )}
                </span>
              </>
            )}
          </button>
          {continuationView.reviewReady ? (
            isRoomComposer ? (
              <>
                <button
                  type="button"
                  className="du-discussion-action-button du-discussion-action-secondary"
                  aria-label={t("Ask for stronger options")}
                  onClick={() => startRecommendedPipeline(strongerOptionsFeedback)}
                  disabled={startMutation.isPending}
                >
                  <strong>{t("Ask for stronger options")}</strong>
                </button>
                <Link
                  className="du-discussion-action-button du-discussion-action-secondary"
                  to="/runs/$runId/outcome"
                  params={{ runId }}
                  aria-label={t("Review unresolved points")}
                >
                  <strong>{t("Review unresolved points")}</strong>
                </Link>
                <Link
                  className="du-discussion-action-button du-discussion-action-secondary"
                  to="/runs/$runId/outcome"
                  params={{ runId }}
                  aria-label={t("Confirm answer requirements")}
                >
                  <strong>{t("Confirm answer requirements")}</strong>
                </Link>
                <Link
                  className="du-discussion-action-button du-discussion-action-secondary"
                  to="/runs/$runId/outcome"
                  params={{ runId }}
                  aria-label={t("Check evidence")}
                >
                  <strong>{t("Check evidence")}</strong>
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="du-discussion-action-button du-discussion-action-secondary"
                  aria-label={t("Ask for stronger options")}
                  onClick={() => startRecommendedPipeline(strongerOptionsFeedback)}
                  disabled={startMutation.isPending}
                >
                  <span className="du-discussion-action-badge-row">
                    <span className="du-discussion-action-badge">{t("Updates discussion")}</span>
                  </span>
                  <strong>{t("Ask for stronger options")}</strong>
                  <span>
                    {t(
                      "Refresh the discussion so the strongest current options can be compared and improved."
                    )}
                  </span>
                  <span className="du-discussion-action-result">
                    {t("After it finishes, compare the refreshed strongest options.")}
                  </span>
                </button>
                <Link
                  className="du-discussion-action-button du-discussion-action-secondary"
                  to="/runs/$runId/outcome"
                  params={{ runId }}
                  aria-label={t("Review unresolved points")}
                >
                  <span className="du-discussion-action-badge-row">
                    <span className="du-discussion-action-badge du-discussion-action-badge-muted">
                      {t("Review only")}
                    </span>
                  </span>
                  <strong>{t("Review unresolved points")}</strong>
                  <span>
                    {t("Jump to unresolved points that still constrain the answer.")}
                  </span>
                  <span className="du-discussion-action-result">
                    {t("Open the current answer without changing the discussion.")}
                  </span>
                </Link>
                <Link
                  className="du-discussion-action-button du-discussion-action-secondary"
                  to="/runs/$runId/outcome"
                  params={{ runId }}
                  aria-label={t("Confirm answer requirements")}
                >
                  <span className="du-discussion-action-badge-row">
                    <span className="du-discussion-action-badge du-discussion-action-badge-muted">
                      {t("Review only")}
                    </span>
                  </span>
                  <strong>{t("Confirm answer requirements")}</strong>
                  <span>
                    {t(
                      "Review requirements that must be satisfied or acknowledged before relying on the answer."
                    )}
                  </span>
                  <span className="du-discussion-action-result">
                    {t("Open the current answer without changing the discussion.")}
                  </span>
                </Link>
                <Link
                  className="du-discussion-action-button du-discussion-action-secondary"
                  to="/runs/$runId/outcome"
                  params={{ runId }}
                  aria-label={t("Check evidence")}
                >
                  <span className="du-discussion-action-badge-row">
                    <span className="du-discussion-action-badge du-discussion-action-badge-muted">
                      {t("Review only")}
                    </span>
                  </span>
                  <strong>{t("Check evidence")}</strong>
                  <span>{t("Review missing or unchecked evidence before relying on the answer.")}</span>
                  <span className="du-discussion-action-result">
                    {t("Open the current answer without changing the discussion.")}
                  </span>
                </Link>
              </>
            )
          ) : (
            isRoomComposer ? (
              <p className="du-room-composer-note">
                {t("Review actions appear after participants respond.")}
              </p>
            ) : (
              <article
                className="du-discussion-action-button du-discussion-action-secondary du-discussion-action-note"
                aria-label={t("Review actions unlock later")}
              >
                <span className="du-discussion-action-badge-row">
                  <span className="du-discussion-action-badge du-discussion-action-badge-muted">
                    {t("Available after first update")}
                  </span>
                </span>
                <strong>{t("Review actions unlock later")}</strong>
                <span>
                  {t(
                    "After the room has perspectives, unresolved points, evidence gaps, risks, and a draft answer, review actions will appear here."
                  )}
                </span>
                <span className="du-discussion-action-result">
                  {t("For now, continue the discussion to create those materials.")}
                </span>
              </article>
            )
          )}
        </div>
      </div>
      {!isRoomComposer ? continuationDetails : null}
      {continuationView.reviewReady && !isRoomComposer ? (
        <div className="du-action-row">
          <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
            {t("View current answer")}
          </Link>
        </div>
      ) : null}
      {!isRoomComposer ? advancedStartRequestDetails : null}
      {startFeedbackMessages}
    </>
  );

  if (variant === "room-composer") {
    return (
      <>
        <section
          id="continue-discussion"
          className="du-room-composer"
          data-placement="room-action-dock"
          aria-label={t("Room quick replies")}
        >
          {formContent}
        </section>
        {latestDiscussionUpdate}
      </>
    );
  }

  return (
    <DataPanel
      title={t(continuationView.title)}
      description={t(continuationView.description)}
    >
      {formContent}
      {latestDiscussionUpdate}
    </DataPanel>
  );
}

function describeDiscussionContinuationSetup(
  run: unknown,
  runtimeSetupPlan: RuntimeSetupPlan | undefined,
  setupStatus: DiscussionContinuationSetupStatus,
  runtimeProfiles: RuntimeProfilesResponse | undefined
): DiscussionContinuationSetupView {
  const topic =
    getStringRecordValue(run, "topic") ??
    getStringRecordValue(getRecordValue(run, "plan"), "topic");
  const topicAwareLocalPresetStartRequest = buildLocalPresetStartRequest(topic);

  if (setupStatus === "loading") {
    return {
      title: "Checking continuation setup",
      detail:
        "Web is checking which local participant and review path is currently ready.",
      note:
        "The recommended request updates after the local service returns safe setup status.",
      tone: "neutral",
      startRequest: topicAwareLocalPresetStartRequest,
      fillLabel: "Fill recommended continuation request"
    };
  }

  if (setupStatus === "error") {
    return {
      title: "Setup readiness unavailable",
      detail:
        "Web could not confirm AI setup, so the recommended request stays on the built-in guided path.",
      note:
        "Open Connect AI after the local service is reachable to test real provider readiness.",
      tone: "warning",
      startRequest: topicAwareLocalPresetStartRequest,
      fillLabel: "Fill recommended continuation request"
    };
  }

  const providerBacked = hasProviderBackedDiscussionSource(run);
  const localOrganizerReady = isLocalPresetDiscussionPathReady(runtimeSetupPlan);
  const providerOrganizerReady = isProviderBackedOrganizerPathReady(
    runtimeProfiles,
    getProviderBackedDiscussionConfigIds(run)
  );

  if (providerBacked && providerOrganizerReady) {
    return {
      title: "AI review path ready",
      detail:
        "Continue discussion will ask configured AI participants for independent first responses, then use Skeptic, Evidence checker, Risk reviewer, and Summary writer to review the result.",
      note:
        "Provider credentials stay on this machine; Web does not show saved API keys.",
      tone: "ok",
      startRequest: buildOpenAICompatibleStartRequest(topic),
      fillLabel: "Fill recommended continuation request",
      primaryActionDetail:
        "Collect AI first responses, then use review roles for options, unresolved points, risks, and the draft answer.",
      primaryResultTitle: "Discussion with AI continued",
      primaryResultDetail:
        "AI participants and review roles updated the readable timeline and answer materials."
    };
  }

  if (providerBacked) {
    return {
      title: "AI first responses ready",
      detail:
        "Configured AI participants can answer first, but the full review path is not ready in the current setup.",
      note:
        "Continue discussion will collect independent first responses only until the local service reports a complete AI review path.",
      tone: "warning",
      startRequest: FIRST_RESPONSES_ONLY_START_REQUEST,
      fillLabel: "Fill first responses request",
      primaryActionDetail:
        "Collect independent first responses only; finish review setup before generating strongest options or an answer.",
      primaryResultTitle: "First responses collected",
      primaryResultDetail:
        "The discussion collected independent first responses. Finish review setup before organizing options or drafting an answer."
    };
  }

  if (localOrganizerReady) {
    return {
      title: "Full demo discussion path ready",
      detail:
        "Continue discussion can use built-in demo participants and local review roles for the full room flow without provider setup.",
      note:
        "Configure an AI provider in Connect AI before relying on real AI results.",
      tone: "warning",
      startRequest: topicAwareLocalPresetStartRequest,
      fillLabel: "Fill recommended continuation request"
    };
  }

  return {
    title: "First responses only",
    detail:
      "This discussion can only collect independent first responses until a local participant or provider review path is ready.",
    note:
      "Open Connect AI to configure a demo preset or real AI provider before relying on the discussion.",
    tone: "warning",
    startRequest: FIRST_RESPONSES_ONLY_START_REQUEST,
    fillLabel: "Fill first responses request",
    primaryActionDetail:
      "Collect independent first responses only; complete Connect AI before generating strongest options or an answer.",
    primaryResultTitle: "First responses collected",
    primaryResultDetail:
      "The discussion collected independent first responses. Complete setup before organizing options or drafting a conclusion."
  };
}

function buildOpenAICompatibleStartRequest(topic: string | undefined): Record<string, unknown> {
  const startRequest = cloneJsonObject(OPENAI_COMPATIBLE_FULL_START_REQUEST);
  const review = getMutableStartRequestStage(startRequest, "review");
  const acceptancePolicy = getRecordValue(review, "acceptancePolicy");

  if (
    acceptancePolicy &&
    typeof acceptancePolicy === "object" &&
    !Array.isArray(acceptancePolicy)
  ) {
    (acceptancePolicy as Record<string, unknown>).rationale = isSimplifiedChineseText(topic)
      ? OPENAI_COMPATIBLE_ACCEPTANCE_RATIONALE_ZH_CN
      : OPENAI_COMPATIBLE_ACCEPTANCE_RATIONALE_EN;
  }

  return startRequest;
}

function prepareUserFacingContinuationStartRequest(
  startRequest: Record<string, unknown>,
  run: unknown
): Record<string, unknown> {
  const nextStartRequest = cloneJsonObject(startRequest);

  if (!hasCompletedDiscussionRoundMaterial(run)) {
    return nextStartRequest;
  }

  const roundToken = createUserContinuationRoundToken(run);
  const sealedRoundId = setStartRequestRoundId(
    nextStartRequest,
    "sealedDivergence",
    `${roundToken}-first-responses`
  );
  const extractionRoundId = setStartRequestRoundId(
    nextStartRequest,
    "extraction",
    `${roundToken}-options`
  );
  const reviewRoundId = setStartRequestRoundId(
    nextStartRequest,
    "review",
    `${roundToken}-review`
  );
  setStartRequestRoundId(nextStartRequest, "evidenceCheck", `${roundToken}-evidence`);
  setStartRequestRoundId(nextStartRequest, "candidateRepair", `${roundToken}-repair`);
  setStartRequestRoundId(nextStartRequest, "finalization", `${roundToken}-conclusion`);

  const extraction = getMutableStartRequestStage(nextStartRequest, "extraction");
  if (extraction && sealedRoundId) {
    extraction.sealedDivergenceRoundId = sealedRoundId;
  }

  const review = getMutableStartRequestStage(nextStartRequest, "review");
  if (review && extractionRoundId) {
    review.extractionRoundId = extractionRoundId;
  }

  const finalization = getMutableStartRequestStage(nextStartRequest, "finalization");
  if (finalization && reviewRoundId) {
    finalization.proposalReviewRoundId = reviewRoundId;
  }

  return nextStartRequest;
}

function hasCompletedDiscussionRoundMaterial(run: unknown): boolean {
  return countCompletedDiscussionStages(run) > 0 || isDiscussionReviewReady(run);
}

function getNextDiscussionContinuationRound(run: unknown): number {
  return Math.max(1, countVisibleDiscussionRoundsFromRun(run) + 1);
}

function countVisibleDiscussionRoundsFromEvents(events: unknown[], run: unknown): number {
  const activities = ensureRoundHandoffActivities(createRoomActivityItems(events, run), run);
  const topicLanguage = getRoomTopicLanguage(run);
  const groups = groupRoomActivitiesByRound(
    addUserContinuationTurnActivity(activities, topicLanguage)
  );

  return groups.filter(
    (group) => group.kind === "discussion" && hasCompletedVisibleDiscussionRound(group)
  ).length;
}

function countVisibleDiscussionRoundsFromRun(run: unknown): number {
  const rounds = getRecordValue(run, "rounds");

  return Math.max(
    isDiscussionStagePresent(getRecordValue(rounds, "sealedDivergence")) ? 1 : 0,
    countDiscussionRoundEntries(getRecordValue(rounds, "extraction")),
    countDiscussionRoundEntries(getRecordValue(rounds, "proposalReview")),
    countDiscussionRoundEntries(getRecordValue(rounds, "evidenceCheck")),
    countDiscussionRoundEntries(getRecordValue(rounds, "candidateRepair")),
    countDiscussionRoundEntries(getRecordValue(rounds, "finalization"))
  );
}

function countDiscussionRoundEntries(value: unknown): number {
  if (Array.isArray(value)) {
    return value.filter(isDiscussionStagePresent).length;
  }

  return isDiscussionStagePresent(value) ? 1 : 0;
}

function isDiscussionStagePresent(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).length > 0;
}

function hasCompletedVisibleDiscussionRound(group: RoomActivityGroup): boolean {
  return group.activities.some(
    (activity) =>
      activity.sourceType === "sealed_batch_revealed" ||
      activity.sourceType === "extraction_proposed" ||
      activity.sourceType === "proposal_accepted" ||
      activity.sourceType === "proposal_challenged" ||
      activity.sourceType === "synthetic_open_disagreement" ||
      activity.sourceType === "evidence_result_recorded" ||
      activity.sourceType === "synthetic_evidence_gap_review" ||
      activity.sourceType === "final_candidate_proposed" ||
      activity.sourceType === "final_audit_recorded"
  );
}

function setStartRequestRoundId(
  startRequest: Record<string, unknown>,
  key: string,
  roundId: string
): string | undefined {
  const stage = getMutableStartRequestStage(startRequest, key);

  if (!stage) {
    return undefined;
  }

  stage.roundId = roundId;

  return roundId;
}

function createUserContinuationRoundToken(run: unknown): string {
  const eventCount = getRecordValue(getRecordValue(run, "ledger"), "eventCount");
  const eventSuffix = typeof eventCount === "number" ? eventCount : "next";

  return `web-round-${eventSuffix}-${Date.now().toString(36)}`;
}

function isSimplifiedChineseText(value: string | undefined): boolean {
  return Boolean(value && /[\u3400-\u9fff\uf900-\ufaff]/u.test(value));
}

function getMutableStartRequestStage(
  startRequest: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = startRequest[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function describeDiscussionParticipantSource(run: unknown): DiscussionParticipantSourceView {
  const plan = getRecordValue(run, "plan") ?? {};
  const participants = asArray(getRecordValue(plan, "participants"));
  const providerConfigs = asArray(getRecordValue(plan, "providerConfigs"));
  const hasProviderBackedParticipant = hasProviderBackedDiscussionParticipant(participants);
  const hasProviderConfig = providerConfigs.length > 0;
  const hasLocalPresetParticipant = hasLocalPresetDiscussionParticipant(participants);

  if (hasProviderBackedParticipant || hasProviderConfig) {
    return {
      title: "Discussion with AI",
      detail:
        "Continue discussion will ask configured AI participants for the independent first responses.",
      note:
        "Provider credentials stay on this machine; Web does not show saved API keys.",
      tone: "ok"
    };
  }

  if (hasLocalPresetParticipant) {
    return {
      title: "Demo participant discussion",
      detail:
        "Continue discussion uses built-in demo participants so the full flow works without provider setup.",
      note: "Use Connect AI when you want real AI participants.",
      tone: "warning"
    };
  }

  if (participants.length > 0) {
    return {
      title: "Configured participant discussion",
      detail:
        "Continue discussion uses the participant source already attached to this discussion.",
      note:
        "Advanced mode keeps the underlying adapter and provider identifiers available for developers.",
      tone: "neutral"
    };
  }

  return {
    title: "Participant source unavailable",
    detail: "This discussion does not show a usable participant source yet.",
    note: "Open Connect AI before relying on this discussion.",
    tone: "warning"
  };
}

function hasProviderBackedDiscussionSource(run: unknown): boolean {
  const plan = getRecordValue(run, "plan") ?? {};
  const participants = asArray(getRecordValue(plan, "participants"));
  const providerConfigs = asArray(getRecordValue(plan, "providerConfigs"));

  return hasProviderBackedDiscussionParticipant(participants) || providerConfigs.length > 0;
}

function hasProviderBackedDiscussionParticipant(participants: unknown[]): boolean {
  return participants.some((participant) =>
    Boolean(getStringRecordValue(participant, "providerConfigId"))
  );
}

function hasLocalPresetDiscussionParticipant(participants: unknown[]): boolean {
  return participants.some((participant) => {
    const id = getStringRecordValue(participant, "id") ?? "";
    const adapterId = getStringRecordValue(participant, "adapterId") ?? "";

    return id.startsWith("local-preset-") || adapterId.startsWith("local-preset-");
  });
}

function isLocalPresetDiscussionPathReady(
  runtimeSetupPlan: RuntimeSetupPlan | undefined
): boolean {
  return Boolean(
    runtimeSetupPlan?.profiles.some(
      (profile) => profile.id === "local-preset" && profile.enabled && profile.status === "ready"
    )
  );
}

function isProviderBackedOrganizerPathReady(
  runtimeProfiles: RuntimeProfilesResponse | undefined,
  providerConfigIdOrIds: string | readonly string[] | undefined
): boolean {
  const providerConfigIds = Array.isArray(providerConfigIdOrIds)
    ? providerConfigIdOrIds
    : providerConfigIdOrIds
      ? [providerConfigIdOrIds]
      : [];
  const profile = runtimeProfiles?.profiles.find((candidate) => candidate.id === "openai-compatible");

  if (
    !profile?.enabled ||
    !providerConfigIds.includes(OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID)
  ) {
    return false;
  }

  return (
    hasEnabledRuntimeComponent(profile, "extraction_generator") &&
    hasEnabledRuntimeComponent(profile, "proposal_reviewer") &&
    hasEnabledRuntimeComponent(profile, "final_candidate_generator") &&
    hasEnabledRuntimeComponent(profile, "final_auditor")
  );
}

function hasEnabledRuntimeComponent(
  profile: RuntimeProfilesResponse["profiles"][number],
  kind: RuntimeProfilesResponse["profiles"][number]["components"][number]["kind"]
): boolean {
  return profile.components.some((component) => component.kind === kind && component.enabled);
}

function getProviderBackedDiscussionConfigIds(run: unknown): string[] {
  const plan = getRecordValue(run, "plan") ?? {};
  const participants = asArray(getRecordValue(plan, "participants"));
  const providerConfigs = asArray(getRecordValue(plan, "providerConfigs"));
  const configIds = new Set<string>();

  for (const participant of participants) {
    const providerConfigId = getStringRecordValue(participant, "providerConfigId");

    if (providerConfigId) {
      configIds.add(providerConfigId);
    }
  }

  for (const providerConfig of providerConfigs) {
    const id = getStringRecordValue(providerConfig, "id");
    const providerConfigId = getStringRecordValue(providerConfig, "providerConfigId");

    if (id) {
      configIds.add(id);
    }

    if (providerConfigId) {
      configIds.add(providerConfigId);
    }
  }

  return [...configIds];
}

function GuidedDiscussionActionPath({ reviewReady }: { reviewReady: boolean }) {
  const { t } = useI18n();
  const steps = reviewReady
    ? [
        {
          label: "Start here",
          title: "Review current answer",
          detail: "Start with the current answer before changing the room."
        },
        {
          label: "Then",
          title: "Choose a follow-up action",
          detail:
            "Update the answer or ask for stronger options after checking unresolved points, must-cover items, and evidence."
        },
        {
          label: "After that",
          title: "Recheck the room outputs",
          detail:
            "Return to strongest options, still unresolved points, needs checking, risks, and next steps."
        }
      ]
    : [
        {
          label: "Start here",
          title: "Continue discussion",
          detail:
            "Collect independent perspectives, strongest options, unresolved points, evidence checks, risks, and a draft answer."
        },
        {
          label: "Then",
          title: "Review what changed",
          detail:
            "Use the room timeline and discussion outputs to see what each participant contributed."
        },
        {
          label: "After that",
          title: "Open current answer",
          detail:
            "When ready, review the answer together with risks, needs checking, and next steps."
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
      queryClient.invalidateQueries({ queryKey: ["run-resources", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["frontier", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["objections", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["obligations", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["outcome-frontier", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["outcome-objections", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["outcome-obligations", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["outcome-resources", sessionId] })
    );
  }

  await Promise.all(invalidations);
}

function StartResult({
  result,
  runId,
  feedback,
  reviewReadyBeforeUpdate,
  continuationRound = 1,
  userInstruction,
  presentation = "panel"
}: {
  result: unknown;
  runId: string;
  feedback?: DiscussionStartFeedback | null;
  reviewReadyBeforeUpdate: boolean;
  continuationRound?: number;
  userInstruction?: string;
  presentation?: "panel" | "room-message";
}) {
  const { t } = useI18n();
  const stages = asArray(getRecordValue(result, "stages")).map(toStageMetadata);
  const stopped = getRecordValue(result, "stopped");
  const readableStages = stages.map(toReadableStageResult);
  const conclusionReviewReady =
    reviewReadyBeforeUpdate || isStartResultConclusionReviewReady(result, stages);
  const roomMessage = presentation === "room-message";
  const topicLanguage = getRoomTopicLanguage(getRecordValue(result, "run"));
  const updateRoundActivities = roomMessage
    ? createStartResultConversationRoundActivities(
        result,
        stages,
        stopped === true,
        continuationRound,
        userInstruction
      )
    : [];
  const resultTitleKey =
    stopped === true ? "Discussion paused" : feedback?.title ?? "Discussion steps completed";
  const resultTitle = t(resultTitleKey);
  const resultDetail =
    stopped === true
      ? t(
          "The discussion stopped before every requested step finished. Review the visible steps below or open Advanced details for the technical reason."
        )
      : t(
          feedback?.detail ??
            (conclusionReviewReady
              ? "The guided discussion steps were recorded. Review the updated perspectives, unresolved points, must-cover items, and current answer."
              : "The guided discussion update was recorded. Review the visible steps and continue the discussion before relying on an answer.")
        );
  const roomStatusDetail = resultDetail;

  if (roomMessage) {
    return (
      <div className="du-start-result du-start-result-room">
        <StatusBanner
          tone={stopped === true ? "warning" : "ok"}
          title={resultTitle}
          detail={roomStatusDetail}
        />
        {stopped === true ? (
          <StatusBanner
            tone="warning"
            title={t("Stop reason")}
            detail={t(describeStartResultStopReason(getRecordValue(result, "stopReason")))}
          />
        ) : null}
        <RunStartRecoveryActions show={isRecoverableStoppedStartResult(result)} />
        <StartResultConversationRound
          activities={updateRoundActivities}
          topicLanguage={topicLanguage}
          round={continuationRound}
        />
        <AdvancedDetails
          summary="Advanced / Developer Mode"
          panelLabel="Post-update discussion details"
          description="Readable step summary, post-update links, and raw stage metadata for developer inspection."
          lazy
        >
          <div className="du-room-update-details-body">
            <ReadableStageResultList stages={readableStages} roomMessage />
            <DiscussionResultHandoff
              runId={runId}
              conclusionReviewReady={conclusionReviewReady}
              roomMessage
            />
            <RecordCollection
              title="Raw stage metadata"
              records={stages}
              emptyTitle="No stages returned"
              emptyDescription="No stage metadata was returned for this request."
            />
          </div>
        </AdvancedDetails>
      </div>
    );
  }

  return (
    <div className="du-start-result">
      <StatusBanner
        tone={stopped === true ? "warning" : "ok"}
        title={resultTitle}
        detail={resultDetail}
      />
      {stopped === true ? (
        <StatusBanner
          tone="warning"
          title={t("Stop reason")}
          detail={t(describeStartResultStopReason(getRecordValue(result, "stopReason")))}
        />
      ) : null}
      <RunStartRecoveryActions show={isRecoverableStoppedStartResult(result)} />
      <DiscussionResultHandoff
        runId={runId}
        conclusionReviewReady={conclusionReviewReady}
        roomMessage={roomMessage}
      />
      <ReadableStageResultList stages={readableStages} roomMessage={roomMessage} />
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

function StartResultConversationRound({
  activities,
  topicLanguage,
  round
}: {
  activities: RoomActivityItem[];
  topicLanguage: RoomTopicLanguage;
  round: number;
}) {
  const { t } = useI18n();

  if (activities.length === 0) {
    return null;
  }

  return (
    <section className="du-room-update-conversation" aria-label={t("New discussion round")}>
      <div className="du-section-label">
        <p className="du-kicker">{t("Continuation round")}</p>
        <h4>
          {round > 1 ? t("Discussion round {round}", { round }) : t("What participants just said")}
        </h4>
        <p>
          {t(
            "This update is shown as room messages first. Detailed step metadata stays in Advanced."
          )}
        </p>
      </div>
      <ol className="du-room-activity" aria-label={t("Discussion update messages")}>
        {activities.map((activity, index) => (
          <RoomActivityMessage
            activity={activity}
            activityContext={activities}
            activityContextIndex={index}
            round={round}
            topicLanguage={topicLanguage}
            key={`${activity.sourceType}:${activity.speaker}:${index}`}
          />
        ))}
      </ol>
    </section>
  );
}

function createStartResultConversationRoundActivities(
  result: unknown,
  stages: Array<Record<string, unknown>>,
  stopped: boolean,
  round: number,
  userInstruction?: string
): RoomActivityItem[] {
  const run = getRecordValue(result, "run");
  const topicLanguage = getRoomTopicLanguage(run);
  const perspectiveSpeakers = getStartResultPerspectiveSpeakers(run);
  const activities: RoomActivityItem[] = [
    createUserContinuationTurnActivity(topicLanguage, Math.max(1, round), userInstruction)
  ];

  for (const stage of stages) {
    activities.push(
      ...createStartResultStageConversationActivities(
        stage,
        perspectiveSpeakers,
        topicLanguage,
        stopped,
        round
      )
    );
  }

  return addPendingReviewRoundActivities(activities, topicLanguage);
}

function createUserContinuationTurnActivity(
  topicLanguage: RoomTopicLanguage,
  round: number,
  userInstruction?: string
): RoomActivityItem {
  const normalizedInstruction = normalizeRoomComposerMessage(userInstruction);

  return {
    speaker: "You",
    title: "Continue discussion requested",
    action: normalizedInstruction ? "Sent a message to the room" : "Asked the room to continue",
    detail: normalizedInstruction
      ? normalizedInstruction
      : round === 1
        ? localizeTopicLanguageDetail(
            topicLanguage,
            "The room continued from your brief before participants responded.",
            "\u623f\u95f4\u4ece\u4f60\u7684\u8ba8\u8bba\u7b80\u62a5\u7ee7\u7eed\uff0c\u5728\u53c2\u4e0e\u8005\u56de\u5e94\u524d\u5f00\u542f\u672c\u8f6e\u3002"
          )
        : localizeTopicLanguageDetail(
            topicLanguage,
            "The room continued again from the current answer and open questions.",
            "\u623f\u95f4\u4ece\u5f53\u524d\u7b54\u6848\u548c\u5f00\u653e\u95ee\u9898\u7ee7\u7eed\u4e0b\u4e00\u8f6e\u3002"
          ),
    tone: "neutral",
    phase: "first-responses",
    sourceType: "user_continuation_requested"
  };
}

function normalizeRoomComposerMessage(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function createStartResultStageConversationActivities(
  stage: Record<string, unknown>,
  perspectiveSpeakers: string[],
  topicLanguage: RoomTopicLanguage,
  stopped: boolean,
  round: number
): RoomActivityItem[] {
  const stageName = getRecordValue(stage, "stage");
  const stageStatus = getRecordValue(stage, "status");
  const attentionNeeded =
    isReadableStageAttentionStatus(stageStatus) ||
    (stopped && stageStatus !== "completed" && stageStatus !== "revealed");
  const tone: RoomActivityItem["tone"] = attentionNeeded ? "warning" : "ok";

  if (stageName === "sealed_divergence") {
    const firstSpeaker = perspectiveSpeakers[0] ?? "First viewpoint";
    const secondSpeaker = perspectiveSpeakers[1] ?? "Alternative viewpoint";

    return [
      {
        speaker: firstSpeaker,
        title: "Participant reply added",
        action: "Shared a first response",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              round > 1
                ? "I started the follow-up reply, but this round still needs another participant before the room can compare the latest answers."
                : "I started the independent reply, but this round still needs another participant before the room can compare answers.",
              round > 1
                ? "\u6211\u5df2\u5f00\u59cb\u8ffd\u52a0\u56de\u5e94\uff0c\u4f46\u672c\u8f6e\u4ecd\u9700\u53e6\u4e00\u4f4d\u53c2\u4e0e\u8005\u5b8c\u6210\uff0c\u8ba8\u8bba\u5ba4\u624d\u80fd\u5bf9\u7167\u6700\u65b0\u7b54\u6848\u3002"
                : "\u6211\u5df2\u5f00\u59cb\u72ec\u7acb\u56de\u5e94\uff0c\u4f46\u672c\u8f6e\u4ecd\u9700\u53e6\u4e00\u4f4d\u53c2\u4e0e\u8005\u5b8c\u6210\uff0c\u8ba8\u8bba\u5ba4\u624d\u80fd\u5bf9\u7167\u7b54\u6848\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              round > 1
                ? "I'm responding to the latest room state with a follow-up view that can be compared against the earlier replies."
                : "I put an independent answer into the room so it can be compared before anyone converges too early.",
              round > 1
                ? "\u6211\u6b63\u5728\u56de\u5e94\u6700\u65b0\u623f\u95f4\u72b6\u6001\uff0c\u5e76\u63d0\u4f9b\u4e00\u4e2a\u53ef\u4e0e\u5148\u524d\u53d1\u8a00\u5bf9\u7167\u7684\u8ffd\u52a0\u89c6\u89d2\u3002"
                : "\u6211\u628a\u4e00\u4efd\u72ec\u7acb\u7b54\u6848\u653e\u5165\u8ba8\u8bba\u5ba4\uff0c\u8fd9\u6837\u5927\u5bb6\u5728\u8fc7\u65e9\u6536\u655b\u524d\u53ef\u4ee5\u5148\u5bf9\u7167\u6bd4\u8f83\u3002"
            ),
        tone,
        phase: "first-responses",
        sourceType: "sealed_contribution_submitted"
      },
      {
        speaker: secondSpeaker,
        title: "Participant replied to another participant",
        action: "Answered another participant",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              round > 1
                ? "I'm the follow-up reply the room is still waiting for; once I finish, the room can compare this new round."
                : "I'm the reply the room is still waiting for; once I finish, the room can compare the perspectives.",
              round > 1
                ? "\u6211\u662f\u8ba8\u8bba\u5ba4\u4ecd\u5728\u7b49\u5f85\u7684\u8ffd\u52a0\u56de\u5e94\uff1b\u5b8c\u6210\u540e\uff0c\u623f\u95f4\u5c31\u80fd\u5bf9\u7167\u8fd9\u4e00\u65b0\u8f6e\u3002"
                : "\u6211\u662f\u8ba8\u8bba\u5ba4\u4ecd\u5728\u7b49\u5f85\u7684\u56de\u5e94\uff1b\u5b8c\u6210\u540e\uff0c\u623f\u95f4\u5c31\u80fd\u5bf9\u7167\u5404\u4e2a\u89c6\u89d2\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              round > 1
                ? "I'm responding to {speaker}'s latest point and keeping a separate follow-up view in the room."
                : "Now that {speaker}'s answer is visible, I'm keeping a separate view in the room for comparison.",
              round > 1
                ? "\u6211\u6b63\u5728\u56de\u5e94 {speaker} \u7684\u6700\u65b0\u89c2\u70b9\uff0c\u5e76\u628a\u4e00\u4e2a\u72ec\u7acb\u8ffd\u52a0\u89c6\u89d2\u7559\u5728\u623f\u95f4\u4e2d\u3002"
                : "\u73b0\u5728 {speaker} \u7684\u7b54\u6848\u5df2\u53ef\u89c1\uff0c\u6211\u4f1a\u628a\u53e6\u4e00\u4e2a\u89c6\u89d2\u4fdd\u7559\u5728\u623f\u95f4\u4e2d\u4f9b\u5bf9\u7167\u3002"
            ),
        detailValues: attentionNeeded ? undefined : { speaker: firstSpeaker },
        tone,
        phase: "first-responses",
        sourceType: "synthetic_participant_reply_bridge"
      }
    ];
  }

  if (stageName === "extraction") {
    return [
      {
        speaker: "Discussion organizer",
        title: "Main perspectives organized",
        action: "Organized the strongest options",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "I tried to organize the participant replies, but this step needs attention before options and disagreements are reliable.",
              "\u6211\u5c1d\u8bd5\u6574\u7406\u53c2\u4e0e\u8005\u56de\u5e94\uff0c\u4f46\u8fd9\u4e00\u6b65\u9700\u8981\u5904\u7406\u540e\uff0c\u9009\u9879\u548c\u5206\u6b67\u624d\u53ef\u9760\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              round > 1
                ? "I connected the follow-up replies into updated options, unresolved points, must-cover items, and evidence gaps."
                : "I connected the participant replies into strongest current options, unresolved points, must-cover items, and evidence gaps.",
              round > 1
                ? "\u6211\u628a\u8ffd\u52a0\u56de\u5e94\u8fde\u63a5\u6210\u66f4\u65b0\u540e\u7684\u9009\u9879\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u7f3a\u53e3\u3002"
                : "\u6211\u628a\u53c2\u4e0e\u8005\u56de\u5e94\u8fde\u63a5\u6210\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3001\u672a\u89e3\u51b3\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u7f3a\u53e3\u3002"
            ),
        tone,
        phase: "perspectives",
        sourceType: "extraction_proposed"
      }
    ];
  }

  if (stageName === "proposal_review") {
    return [
      {
        speaker: "Reviewer",
        title: "Open disagreement reviewed",
        action: "Raised an open disagreement",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "I could not finish reviewing the strongest option against unresolved points, so the room should not rely on the answer yet.",
              "\u6211\u672a\u80fd\u5b8c\u6210\u5bf9\u6700\u5f3a\u9009\u9879\u4e0e\u672a\u89e3\u51b3\u95ee\u9898\u7684\u5ba1\u67e5\uff0c\u56e0\u6b64\u8ba8\u8bba\u5ba4\u8fd8\u4e0d\u5e94\u4f9d\u8d56\u7b54\u6848\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              round > 1
                ? "I am replying to the updated options with the disagreement that still needs resolution."
                : "I checked the strongest current option against the disagreements and answer requirements that still matter.",
              round > 1
                ? "\u6211\u6b63\u5728\u9488\u5bf9\u66f4\u65b0\u540e\u7684\u9009\u9879\u63d0\u51fa\u4ecd\u9700\u89e3\u51b3\u7684\u5206\u6b67\u3002"
                : "\u6211\u5df2\u6839\u636e\u4ecd\u7136\u91cd\u8981\u7684\u5206\u6b67\u548c\u7b54\u6848\u8981\u6c42\u68c0\u67e5\u5f53\u524d\u6700\u5f3a\u9009\u9879\u3002"
            ),
        tone,
        phase: "perspectives",
        sourceType: "proposal_challenged"
      }
    ];
  }

  if (stageName === "evidence_check") {
    return [
      {
        speaker: "Evidence checker",
        title: "Evidence gaps reviewed",
        action: "Reviewed evidence gaps",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "I could not finish checking the evidence gaps, so the evidence still needs review before the answer is trusted.",
              "\u6211\u672a\u80fd\u5b8c\u6210\u8bc1\u636e\u7f3a\u53e3\u6838\u67e5\uff0c\u56e0\u6b64\u5728\u4fe1\u4efb\u7b54\u6848\u524d\u4ecd\u9700\u5ba1\u9605\u8bc1\u636e\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              round > 1
                ? "I am checking the evidence behind this follow-up round before the room updates the conclusion."
                : "I checked the evidence gaps the room surfaced and kept unresolved verification work visible.",
              round > 1
                ? "\u6211\u6b63\u5728\u6838\u67e5\u8fd9\u4e00\u8ffd\u52a0\u8f6e\u80cc\u540e\u7684\u8bc1\u636e\uff0c\u7136\u540e\u8ba8\u8bba\u5ba4\u518d\u66f4\u65b0\u7ed3\u8bba\u3002"
                : "\u6211\u6838\u67e5\u4e86\u8ba8\u8bba\u5ba4\u63d0\u51fa\u7684\u8bc1\u636e\u7f3a\u53e3\uff0c\u5e76\u4fdd\u7559\u4e86\u5c1a\u672a\u89e3\u51b3\u7684\u6838\u9a8c\u5de5\u4f5c\u3002"
            ),
        tone,
        phase: "evidence",
        sourceType: "synthetic_evidence_gap_review"
      }
    ];
  }

  if (stageName === "candidate_repair") {
    return [
      {
        speaker: "Option reviewer",
        title: "Option quality reviewed",
        action: "Reviewed option quality",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "I could not finish strengthening the option, so the room should revisit it before drafting an answer.",
              "\u6211\u672a\u80fd\u5b8c\u6210\u5f3a\u5316\u9009\u9879\uff0c\u56e0\u6b64\u8ba8\u8bba\u5ba4\u5e94\u5728\u8d77\u8349\u7b54\u6848\u524d\u91cd\u65b0\u68c0\u67e5\u5b83\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              "I used the visible weaknesses to strengthen the current option before answer work.",
              "\u6211\u7528\u53ef\u89c1\u5f31\u70b9\u5f3a\u5316\u4e86\u5f53\u524d\u9009\u9879\uff0c\u7136\u540e\u518d\u8fdb\u5165\u7b54\u6848\u5de5\u4f5c\u3002"
            ),
        tone,
        phase: "perspectives",
        sourceType: "proposal_accepted"
      }
    ];
  }

  if (stageName === "finalization") {
    return [
      {
        speaker: "Conclusion writer",
        title: "Current answer drafted",
        action: "Drafted the current answer",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "I could not finish drafting an answer, so the room should continue before treating the answer as ready.",
              "\u6211\u672a\u80fd\u5b8c\u6210\u7b54\u6848\u8d77\u8349\uff0c\u56e0\u6b64\u8ba8\u8bba\u5ba4\u5e94\u7ee7\u7eed\u63a8\u8fdb\uff0c\u4e0d\u5e94\u628a\u7b54\u6848\u89c6\u4e3a\u5df2\u5c31\u7eea\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              "I drafted a current answer from the room's strongest options, unresolved points, evidence gaps, and must-cover items.",
              "\u6211\u57fa\u4e8e\u8ba8\u8bba\u5ba4\u7684\u6700\u5f3a\u9009\u9879\u3001\u672a\u89e3\u51b3\u95ee\u9898\u3001\u8bc1\u636e\u7f3a\u53e3\u548c\u5fc5\u987b\u8986\u76d6\u9879\u8d77\u8349\u4e86\u5f53\u524d\u7b54\u6848\u3002"
            ),
        tone,
        phase: "conclusion",
        sourceType: "final_candidate_proposed"
      },
      {
        speaker: "Risk reviewer",
        title: "Risk review recorded",
        action: "Reviewed risks",
        detail: attentionNeeded
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "I could not complete the risk review, so risks and boundaries still need attention.",
              "\u6211\u672a\u80fd\u5b8c\u6210\u98ce\u9669\u5ba1\u67e5\uff0c\u56e0\u6b64\u98ce\u9669\u548c\u8fb9\u754c\u4ecd\u9700\u5173\u6ce8\u3002"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              "I kept the risks and boundaries visible so the conclusion is reviewable rather than treated as unquestioned final truth.",
              "\u6211\u4fdd\u6301\u98ce\u9669\u548c\u8fb9\u754c\u53ef\u89c1\uff0c\u8ba9\u7ed3\u8bba\u6210\u4e3a\u53ef\u5ba1\u9605\u6750\u6599\uff0c\u800c\u4e0d\u662f\u4e0d\u53ef\u8d28\u7591\u7684\u6700\u7ec8\u771f\u7406\u3002"
            ),
        tone: attentionNeeded ? "warning" : "ok",
        phase: "conclusion",
        sourceType: "final_audit_recorded"
      }
    ];
  }

  return [];
}

function getStartResultPerspectiveSpeakers(run: unknown): string[] {
  const participants = asArray(getRecordValue(getRecordValue(run, "plan"), "participants"));
  const perspectiveSpeakers = participants
    .map((participant) => {
      const id = getStringRecordValue(participant, "id");
      const displayName = getFirstStringRecordValue(participant, [
        "displayName",
        "name",
        "label"
      ]);

      return (
        getUserFacingActorLabel(id) ??
        getUserFacingActorLabel(displayName) ??
        displayName ??
        getUserFacingActorLabel(getStringRecordValue(participant, "adapterId"))
      );
    })
    .filter((label): label is string => Boolean(label))
    .filter((label) => {
      const normalized = normalizeActorLabel(label);

      return normalized.startsWith("perspective-") || normalized.startsWith("participant-");
    });

  return uniqueReadableStrings(
    perspectiveSpeakers.length > 0 ? perspectiveSpeakers : ["First viewpoint", "Alternative viewpoint"]
  );
}

function describeStartResultStopReason(reason: unknown): string {
  if (reason === "waiting_for_participants") {
    return "A first-response participant still needs to finish. Review visible progress, then try Continue discussion again.";
  }

  if (reason === "waiting_for_reveal") {
    return "Independent first responses are ready but not revealed yet. Try Continue discussion again to reveal them before reviewing options.";
  }

  if (reason === "waiting_for_generators" || reason === "already_running") {
    return "A guided step is still waiting on model work. Review visible progress or try again after checking setup.";
  }

  if (reason === "failed" || reason === "timed_out") {
    return "A guided step needs attention before Deliberum can continue the full discussion.";
  }

  return "The discussion paused before every requested step finished. Open Advanced details for the technical reason.";
}

function isRecoverableStoppedStartResult(result: unknown): boolean {
  if (getRecordValue(result, "stopped") !== true) {
    return false;
  }

  const stopReason = getRecordValue(result, "stopReason");

  return stopReason === "failed" || stopReason === "timed_out";
}

function DiscussionResultHandoff({
  runId,
  conclusionReviewReady,
  roomMessage
}: {
  runId: string;
  conclusionReviewReady: boolean;
  roomMessage: boolean;
}) {
  const { t } = useI18n();

  return (
    <section
      className={`du-result-handoff${roomMessage ? " du-result-handoff-room" : ""}`}
      aria-label={t("Post-update review path")}
    >
      <div>
        <p className="du-kicker">
          {t(roomMessage ? "Room handoff" : "Post-update review path")}
        </p>
        <h4>{t(roomMessage ? "Back to the room" : "What to review next")}</h4>
        <p>
          {t(
            roomMessage
              ? "Use these room links to review what changed without leaving the discussion flow."
              : "Use these links to return from the completed action to the room view."
          )}
        </p>
      </div>
      <div className="du-result-handoff-grid">
        <a
          className="du-result-handoff-card"
          href="#room-conversation-transcript"
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
              "Compare strongest options, unresolved points, must-cover items, and what needs checking."
            )}
          </p>
        </a>
        {conclusionReviewReady ? (
          <Link
            className="du-result-handoff-card du-result-handoff-primary"
            to="/runs/$runId/outcome"
            params={{ runId }}
            aria-label={t("View current answer")}
          >
            <span>{t("Finally")}</span>
            <strong>{t("View current answer")}</strong>
            <p>{t("Review the answer with risks and next steps.")}</p>
          </Link>
        ) : (
          <a
            className="du-result-handoff-card du-result-handoff-primary"
            href="#continue-discussion"
            aria-label={t("Continue discussion")}
          >
            <span>{t("Next")}</span>
            <strong>{t("Continue discussion")}</strong>
            <p>{t("Current answer appears after the room produces answer material.")}</p>
          </a>
        )}
      </div>
    </section>
  );
}

function isStartResultConclusionReviewReady(
  result: unknown,
  stages: Array<Record<string, unknown>>
): boolean {
  if (isDiscussionReviewReady(getRecordValue(result, "run"))) {
    return true;
  }

  return stages.some((stage) => {
    const stageName = getRecordValue(stage, "stage");
    const executionStatus = getRecordValue(stage, "executionStatus");
    const status = getRecordValue(stage, "status");

    return (
      stageName === "finalization" &&
      (executionStatus === "executed" || status === "completed")
    );
  });
}

type ReadableStageResult = {
  label: string;
  status: string;
  detail: string;
};

function ReadableStageResultList({
  stages,
  roomMessage = false
}: {
  stages: ReadableStageResult[];
  roomMessage?: boolean;
}) {
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
    <section
      className={`du-readable-stage-result${roomMessage ? " du-readable-stage-result-room" : ""}`}
      aria-label={t("Updated discussion steps")}
    >
      <div className="du-section-label">
        <p className="du-kicker">
          {t(roomMessage ? "Room progress" : "Updated discussion steps")}
        </p>
        <h4>{t(roomMessage ? "What the room did" : "What changed")}</h4>
        <p>
          {t(
            roomMessage
              ? "Each line is a discussion step that just changed."
              : "Readable summary of the discussion work that just ran."
          )}
        </p>
      </div>
      <div className={`du-stage-grid${roomMessage ? " du-room-stage-list" : ""}`}>
        {stages.map((stage, index) => (
          <div
            className={`du-stage-pill${roomMessage ? " du-room-stage-message" : ""}`}
            key={`${stage.label}-${index}`}
          >
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
      label: "Must cover",
      detail: "Candidate material was checked against unresolved points and answer requirements."
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
      label: "Current Answer",
      detail: "A provisional answer and risk review were compiled for review."
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
  if (isReadableStageAttentionStatus(roundStatus)) {
    return "Needs attention";
  }

  if (executionStatus === "executed" && roundStatus === "completed") {
    return "Completed";
  }

  if (executionStatus === "already_running") {
    return "Already in progress";
  }

  if (executionStatus === "executed") {
    return "Updated";
  }

  if (typeof executionStatus === "string" && executionStatus.length > 0) {
    return humanizeIdentifier(executionStatus);
  }

  if (typeof roundStatus === "string" && roundStatus.length > 0) {
    return humanizeIdentifier(roundStatus);
  }

  return "Updated";
}

function isReadableStageAttentionStatus(status: unknown): boolean {
  if (typeof status !== "string") {
    return false;
  }

  return status === "failed" || status === "timed_out" || status.startsWith("waiting_for_");
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
  run,
  discussionComposer
}: {
  runId: string;
  sessionId: string;
  run: unknown;
  discussionComposer?: ReactNode;
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
  const unresolvedEvidenceNeeds = evidenceNeeds.filter(isUnresolvedEvidenceNeed).length;
  const unresolvedObjections = countRecordsWithoutStatus(objections, "resolved");
  const conversationalRoomActivities = ensureParticipantReplyBridgeActivities(
    ensureRoundHandoffActivities(roomActivities, run),
    run
  );
  const outputBackedRoomActivities = ensureStrongOptionConversationActivities(
    conversationalRoomActivities,
    {
      run,
      candidates
    }
  );
  const visibleRoomActivities = ensureOpenDisagreementActivity(
    ensureEvidenceGapReviewActivity(outputBackedRoomActivities, {
      run,
      mainPerspectiveCount: candidates.length,
      unresolvedEvidenceCount: unresolvedEvidenceNeeds
    }),
    {
      run,
      mainPerspectiveCount: candidates.length,
      openDisagreementCount: unresolvedObjections,
      objections
    }
  );
  const readableRoomActivities = ensurePendingReviewRoundActivities(visibleRoomActivities, run);
  const openObligations = countRecordsWithoutStatus(obligations, "satisfied");
  const continuationView = describeDiscussionContinuation(run);
  const progressView = describeDiscussionRoomProgress({
    run,
    mainPerspectiveCount: candidates.length,
    openDisagreementCount: unresolvedObjections,
    unresolvedEvidenceCount: unresolvedEvidenceNeeds,
    openRequirementCount: openObligations
  });

  return (
    <DataPanel
      title={t("Discussion room")}
      description={t("Read the room conversation, then choose the next action.")}
      hideHeader
    >
      <QueryState query={queryState}>
        <div className="du-room-layout">
          <div className="du-room-main">
            <DiscussionRoomHeader
              runId={runId}
              run={run}
              reviewReady={continuationView.reviewReady}
              hasConversationMessages={hasVisibleRoomConversation(readableRoomActivities)}
            />
            <DiscussionRoomParticipantRoster run={run} />
            <DiscussionRoomTimeline
              runId={runId}
              reviewReady={continuationView.reviewReady}
              activities={readableRoomActivities}
              topicLanguage={getRoomTopicLanguage(run)}
              activityQuery={{
                isLoading: eventsQuery.isLoading,
                isError: eventsQuery.isError,
                error: eventsQuery.error
              }}
              openDisagreementCount={unresolvedObjections}
              unresolvedEvidenceCount={unresolvedEvidenceNeeds}
              openRequirementCount={openObligations}
              roomComposer={discussionComposer}
            />
          </div>
          <DiscussionRoomFocusPanel
            runId={runId}
            reviewReady={continuationView.reviewReady}
            openDisagreementCount={unresolvedObjections}
            unresolvedEvidenceCount={unresolvedEvidenceNeeds}
            openRequirementCount={openObligations}
          />
        </div>
      </QueryState>
    </DataPanel>
  );
}

function DiscussionRoomHeader({
  runId,
  run,
  reviewReady,
  hasConversationMessages
}: {
  runId: string;
  run: unknown;
  reviewReady: boolean;
  hasConversationMessages: boolean;
}) {
  const { t } = useI18n();
  const question =
    getStringRecordValue(run, "topic") ??
    getStringRecordValue(getRecordValue(run, "plan"), "topic") ??
    "Discussion brief";
  const nextActionLabel = reviewReady ? "Review current answer" : "Continue discussion";
  const statusLabel = reviewReady ? "Conclusion ready" : "Next step";

  return (
    <section
      className="du-room-header"
      data-mode={hasConversationMessages ? "messages" : "brief"}
      aria-label={t("Discussion room overview")}
    >
      <div className="du-room-header-main">
        <div>
          <p className="du-kicker">{t("Discussion room")}</p>
          <h4>{t(question)}</h4>
          <p>
            {t(
              "Participants discuss the brief in order while the room keeps conclusions, disagreements, evidence gaps, risks, and next actions visible."
            )}
          </p>
        </div>
        <div
          className="du-room-header-next"
          role="status"
          aria-label={t("Room status")}
          data-state={reviewReady ? "ready" : "pending"}
        >
          <span>{t(statusLabel)}</span>
          {reviewReady ? (
            <Link
              className="du-room-header-action"
              to="/runs/$runId/outcome"
              params={{ runId }}
            >
              {t(nextActionLabel)}
            </Link>
          ) : (
            <a className="du-room-header-action" href="#continue-discussion">
              {t(nextActionLabel)}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function DiscussionRoomParticipantRoster({ run }: { run: unknown }) {
  const { t } = useI18n();
  const roster = buildDiscussionRoomParticipantRoster(run);

  return (
    <section className="du-room-roster" aria-label={t("Room participants")}>
      <div className="du-room-roster-heading">
        <div>
          <p className="du-kicker">{t("Participants")}</p>
          <h5>{t("Who is in this discussion")}</h5>
        </div>
        <p>
          {t(
            "This local room includes you and configured AI participants. Use Connect AI before starting a new discussion to change model assignments."
          )}
        </p>
      </div>
      <div className="du-room-roster-grid">
        {roster.map((item) => (
          <article
            className={`du-room-roster-card du-room-roster-${item.kind} du-room-roster-${item.tone}`}
            key={`${item.kind}:${item.name}:${item.role}`}
          >
            <span className="du-room-roster-avatar" aria-hidden="true">
              {formatSpeakerInitials(t(item.name))}
            </span>
            <div>
              <div className="du-room-roster-card-header">
                <strong>{t(item.name)}</strong>
                <span>{t(item.status)}</span>
              </div>
              <p className="du-room-roster-role">{t(item.role)}</p>
              <p className="du-room-roster-source">{t(item.source, item.sourceValues)}</p>
              <small>{t(item.detail, item.detailValues)}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="du-room-roster-boundary">
        <strong>{t("AI participant editing")}</strong>
        <span>
          {t(
            "Adding or removing AI participants is not available inside an existing discussion yet."
          )}
        </span>
        <Link className="du-secondary-link" to="/setup/models">
          {t("Manage models")}
        </Link>
      </div>
    </section>
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
    <details className="du-room-brief" aria-label={t("Discussion brief details")}>
      <summary>
        <span>{t("Discussion brief details")}</span>
        <small>{t(question)}</small>
      </summary>
      <div className="du-room-brief-body">
        <div>
          <p className="du-kicker">{t("What is being discussed")}</p>
          <h4>{t(question)}</h4>
          <p>
            {t(
              "The room keeps the brief, participant perspectives, unresolved points, needs checking, risks, the current answer, and next steps visible together."
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
      </div>
    </details>
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
  runId,
  reviewReady,
  activities,
  topicLanguage,
  activityQuery,
  openDisagreementCount,
  unresolvedEvidenceCount,
  openRequirementCount,
  roomComposer
}: {
  runId: string;
  reviewReady: boolean;
  activities: RoomActivityItem[];
  topicLanguage: RoomTopicLanguage;
  activityQuery: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };
  openDisagreementCount: number;
  unresolvedEvidenceCount: number;
  openRequirementCount: number;
  roomComposer: ReactNode;
}) {
  const { t } = useI18n();
  const roomActivities = activities;
  const conversationActivities = addUserContinuationTurnActivity(
    roomActivities,
    topicLanguage
  );
  const activityGroups = groupRoomActivitiesByRound(conversationActivities);

  return (
    <section
      id="discussion-timeline"
      className="du-room-section du-room-timeline"
      aria-label={t("Discussion timeline")}
    >
      <div className="du-section-label du-room-thread-summary du-sr-only">
        <p className="du-kicker">{t("Discussion timeline")}</p>
        <h4>{t("What has happened in the room")}</h4>
        <p>
          {t(
            "Follow the room like a structured conversation: brief, independent first responses, main perspectives, disagreements, evidence checks, and conclusion review."
          )}
        </p>
      </div>
      <div className="du-room-chat-shell" aria-label={t("Room conversation")}>
        <div id="room-conversation-transcript" className="du-room-activity-wrap">
          <div className="du-room-thread-intro du-sr-only">
            <p className="du-kicker">{t("Conversation transcript")}</p>
            <h5>{t("What the room said and did")}</h5>
            <p>{t("Participant messages and room updates appear in order.")}</p>
          </div>
          {activityQuery.isLoading ? (
            <StatusBanner title={t("Loading room activity")} />
          ) : activityQuery.isError ? (
            <StatusBanner
              tone="warning"
              title={t("Could not load room activity")}
              detail={formatSafeErrorMessage(activityQuery.error)}
            />
          ) : roomActivities.length === 0 ? (
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
              {activityGroups.map((group, groupIndex) => {
                const previousActivities = activityGroups
                  .slice(0, groupIndex)
                  .flatMap((previousGroup) => previousGroup.activities);
                const contextualActivities = [...previousActivities, ...group.activities];
                const roundLabel =
                  group.kind === "brief"
                    ? t("Discussion brief")
                    : t("Discussion round {round}", { round: group.round });
                const roundStep =
                  group.kind === "brief"
                    ? t("Room opening")
                    : t("Round {round}", { round: group.round });
                const roundDetail = t(describeRoomRoundDetail(group));
                const roundExchangeDetail = describeRoomRoundExchangeDetail(group);
                const updatesLabel =
                  group.kind === "brief"
                    ? t("Discussion brief updates")
                    : t("Discussion round {round} messages", { round: group.round });

                return (
                  <section
                    className="du-room-activity-group"
                    data-round={group.kind === "brief" ? "brief" : group.round}
                    aria-label={updatesLabel}
                    key={`${group.kind}:${group.round}`}
                  >
                    <div className="du-room-round-separator du-room-phase-separator">
                      <div className="du-room-round-copy du-room-phase-copy">
                        <p className="du-kicker du-sr-only">{t("Discussion round marker")}</p>
                        <p className="du-kicker du-room-phase-step">
                          {roundStep}
                        </p>
                        <h5>{roundLabel}</h5>
                        <p className="du-room-phase-detail">{roundDetail}</p>
                        <p className="du-room-round-exchange">
                          {t(roundExchangeDetail)}
                        </p>
                      </div>
                      <div
                        className="du-room-activity-group-meta du-sr-only"
                        aria-label={t("Stage activity summary")}
                      >
                        <span>
                          {describeOutputCount(
                            t,
                            group.activities.length,
                            "update",
                            "updates"
                          )}
                        </span>
                        <span>
                          {describeOutputCount(
                            t,
                            countParticipantActivities(group.activities),
                            "participant contribution",
                            "participant contributions"
                          )}
                        </span>
                      </div>
                    </div>
                    <ol className="du-room-activity" aria-label={updatesLabel}>
                      {group.activities.map((activity, index) => {
                        const useTranscriptContext = shouldUseTranscriptContextForRoomReply(
                          activity
                        );
                        const activityContext = useTranscriptContext
                          ? contextualActivities
                          : group.activities;
                        const activityContextIndex = useTranscriptContext
                          ? previousActivities.length + index
                          : index;

                        return (
                          <RoomActivityMessage
                            activity={activity}
                            activityContext={activityContext}
                            activityContextIndex={activityContextIndex}
                            round={group.round}
                            topicLanguage={topicLanguage}
                            key={`${activity.title}:${index}`}
                          />
                        );
                      })}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}
          <DiscussionRoomNextTurnPrompt
            runId={runId}
            reviewReady={reviewReady}
            openDisagreementCount={openDisagreementCount}
            unresolvedEvidenceCount={unresolvedEvidenceCount}
            openRequirementCount={openRequirementCount}
          />
        </div>
        <div className="du-room-action-rail" aria-label={t("Room quick replies")}>
          {roomComposer}
        </div>
      </div>
    </section>
  );
}

function RoomActivityMessage({
  activity,
  activityContext,
  activityContextIndex,
  round,
  topicLanguage
}: {
  activity: RoomActivityItem;
  activityContext: RoomActivityItem[];
  activityContextIndex: number;
  round: number;
  topicLanguage: RoomTopicLanguage;
}) {
  const { t } = useI18n();
  const conversationCue = describeRoomActivityConversationCue(
    activity,
    round,
    topicLanguage
  );
  const replyLine = describeRoomActivityReplyLine(
    activity,
    activityContext,
    activityContextIndex,
    round,
    topicLanguage
  );
  const addressLine = describeRoomActivityAddressLine(
    activity,
    activityContext,
    activityContextIndex,
    round,
    topicLanguage
  );
  const displayAction = describeRoomActivityDisplayAction(activity, round, topicLanguage);
  const displayDetail = describeRoomActivityDisplayDetail(activity, round, topicLanguage);
  const roomSpeaker = isRoomSpeaker(activity.speaker);
  const userSpeaker = isUserSpeaker(activity.speaker);
  const speakerLabel = formatRoomSpeakerLabel(t, topicLanguage, activity.speaker);
  const detailText = formatRoomContributionText(
    t,
    topicLanguage,
    displayDetail,
    activity.detailValues
  );

  return (
    <li
      className="du-room-activity-item"
      data-speaker={roomSpeaker ? "room" : userSpeaker ? "user" : "participant"}
      data-tone={activity.tone}
    >
      {roomSpeaker ? (
        <div className="du-room-system-message" aria-label={t("Room update")}>
          <strong>{speakerLabel}</strong>
          <span>{formatRoomContributionText(t, topicLanguage, displayAction)}</span>
          <p>{detailText}</p>
        </div>
      ) : userSpeaker ? (
        <>
          <div className="du-room-activity-bubble" aria-label={`${speakerLabel}: ${detailText}`}>
            <div className="du-room-message-header">
              <strong>{speakerLabel}</strong>
              <small className="du-room-message-context">
                <span>{formatRoomContributionText(t, topicLanguage, displayAction)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRoomContributionText(t, topicLanguage, conversationCue)}</span>
              </small>
            </div>
            {addressLine ? (
              <p className="du-room-message-address">
                {formatRoomContributionText(
                  t,
                  topicLanguage,
                  addressLine.text,
                  translateRoomActivityValues(t, addressLine.values)
                )}
              </p>
            ) : null}
            {replyLine ? (
              <p className="du-room-message-reply">
                {formatRoomContributionText(
                  t,
                  topicLanguage,
                  replyLine.text,
                  translateRoomActivityValues(t, replyLine.values)
                )}
              </p>
            ) : null}
            <p className="du-room-message-detail">{detailText}</p>
          </div>
          <span className="du-room-activity-avatar" aria-hidden="true">
            {formatSpeakerInitials(speakerLabel)}
          </span>
        </>
      ) : (
        <>
          <span className="du-room-activity-avatar" aria-hidden="true">
            {formatSpeakerInitials(speakerLabel)}
          </span>
          <div className="du-room-activity-bubble" aria-label={`${speakerLabel}: ${detailText}`}>
            <div className="du-room-message-header">
              <strong>{speakerLabel}</strong>
              <small className="du-room-message-context">
                <span>{formatRoomContributionText(t, topicLanguage, displayAction)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRoomContributionText(t, topicLanguage, conversationCue)}</span>
              </small>
            </div>
            {addressLine ? (
              <p className="du-room-message-address">
                {formatRoomContributionText(
                  t,
                  topicLanguage,
                  addressLine.text,
                  translateRoomActivityValues(t, addressLine.values)
                )}
              </p>
            ) : null}
            {replyLine ? (
              <p className="du-room-message-reply">
                {formatRoomContributionText(
                  t,
                  topicLanguage,
                  replyLine.text,
                  translateRoomActivityValues(t, replyLine.values)
                )}
              </p>
            ) : null}
            <p className="du-room-message-detail">{detailText}</p>
          </div>
        </>
      )}
    </li>
  );
}

function DiscussionRoomProgressDetails({
  run,
  activities,
  progressView,
  mainPerspectiveCount,
  openDisagreementCount,
  unresolvedEvidenceCount,
  openRequirementCount
}: {
  run: unknown;
  activities: RoomActivityItem[];
  progressView: DiscussionRoomProgressView;
  mainPerspectiveCount: number;
  openDisagreementCount: number;
  unresolvedEvidenceCount: number;
  openRequirementCount: number;
}) {
  const { t } = useI18n();
  const independentResponses = describeStageStatus(
    getDiscussionStageStatus(run, "sealedDivergenceStatus", "sealedDivergence")
  );
  const mainPerspectives = describeStageStatus(
    getDiscussionStageStatus(run, "latestExtractionStatus", "extraction")
  );
  const conclusion = describeStageStatus(
    getDiscussionStageStatus(run, "latestFinalizationStatus", "finalization")
  );
  const participantResponses = getParticipantFirstResponses(
    addUserContinuationTurnActivity(activities, getRoomTopicLanguage(run))
  );

  return (
    <details className="du-room-progress-details">
      <summary>
        <span>{t("Room progress and stages")}</span>
        <small>{t("Current phase, first responses, and stage checklist")}</small>
      </summary>
      <div className="du-room-progress-details-body">
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
              <span>{t("Still unresolved")}</span>
              <strong>{openDisagreementCount}</strong>
            </div>
            <div>
              <span>{t("Needs checking")}</span>
              <strong>{unresolvedEvidenceCount}</strong>
            </div>
            <div>
              <span>{t("Must cover")}</span>
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
                ? "{disagreements} unresolved point and {evidence} item needing checking are visible."
                : openDisagreementCount === 1
                  ? "{disagreements} unresolved point and {evidence} items needing checking are visible."
                  : unresolvedEvidenceCount === 1
                    ? "{disagreements} unresolved points and {evidence} item needing checking are visible."
                    : "{disagreements} unresolved points and {evidence} items needing checking are visible.",
              {
                disagreements: openDisagreementCount,
                evidence: unresolvedEvidenceCount
              }
            )}
          />
          <DiscussionRoomFlowStep
            label={t("Current Answer")}
            status={t(conclusion.label)}
            detail={t(conclusion.detail)}
          />
        </ol>
      </div>
    </details>
  );
}

function DiscussionRoomNextTurnPrompt({
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

  return (
    <section
      id="room-next-action"
      className="du-room-next-turn"
      aria-label={t("Next in the room")}
    >
      <span className="du-room-activity-avatar" aria-hidden="true">
        DR
      </span>
      <div className="du-room-next-turn-bubble">
        <div className="du-room-message-header">
          <strong>{t("Discussion room")}</strong>
          <span>{t("Next in the room")}</span>
        </div>
        <div className="du-room-next-turn-copy">
          <h5>{t(reviewReady ? "Review the current answer" : "Continue discussion")}</h5>
          <p>
            {t(
              reviewReady
                ? "The room has enough material for review. Start with the answer, then choose whether to inspect unresolved points, check evidence, or update the discussion."
                : "The brief is in the room. Continue to collect participant perspectives, unresolved points, evidence checks, risks, and a current answer."
            )}
          </p>
        </div>
        <div className="du-room-next-turn-actions">
          {reviewReady ? (
            <>
              <Link
                className="du-room-next-turn-primary"
                to="/runs/$runId/outcome"
                params={{ runId }}
              >
                {t("Review current answer")}
              </Link>
              <Link to="/runs/$runId/outcome" params={{ runId }}>
                {t("Review unresolved points")}
              </Link>
              <Link to="/runs/$runId/outcome" params={{ runId }}>
                {t("Check evidence")}
              </Link>
              <a href="#continue-discussion">{t("Update answer")}</a>
            </>
          ) : (
            <a className="du-room-next-turn-primary" href="#continue-discussion">
              {t("Continue discussion")}
            </a>
          )}
        </div>
        {reviewReady ? (
          <p className="du-room-next-turn-meta">
            {t(
              "Review queue: {disagreements} still unresolved, {evidence} needs checking, {requirements} must cover.",
              {
                disagreements: openDisagreementCount,
                evidence: unresolvedEvidenceCount,
                requirements: openRequirementCount
              }
            )}
          </p>
        ) : null}
      </div>
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
  const needsAttention = hasDiscussionStageNeedingAttention(run);

  if (isCompletedDiscussionStatus(finalizationStatus)) {
    return {
      tone: "ready",
      phaseTitle: "Current answer ready",
      phaseDetail:
        "The room has a reviewable answer. Check unresolved points, requirements, evidence gaps, and risks before relying on it.",
      nextTitle: "Review current answer",
      nextDetail:
        openItemCount > 0
          ? "Review the current answer with open items visible."
          : "Open the current answer and confirm it matches the discussion brief."
    };
  }

  if (needsAttention) {
    return {
      tone: "active",
      phaseTitle: "Discussion step needs attention",
      phaseDetail:
        "One guided step could not finish cleanly. Review setup or retry the discussion before relying on an answer.",
      nextTitle: "Check AI setup",
      nextDetail:
        "Test the AI setup, then continue the discussion so options, evidence, risks, and the answer can be rebuilt."
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
        "Strongest options are visible. Review unresolved points, requirements, and evidence gaps before updating the answer.",
      nextTitle: "Update answer",
      nextDetail:
        openItemCount > 0
          ? "Update the answer after reviewing the visible open items."
          : "Update the discussion so the room can draft a current answer."
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

function hasVisibleRoomConversation(activities: RoomActivityItem[]): boolean {
  return activities.some(
    (activity) =>
      !isRoomSpeaker(activity.speaker) &&
      !isUserSpeaker(activity.speaker) &&
      !isRedactedContributionActivity(activity)
  );
}

function buildDiscussionRoomParticipantRoster(run: unknown): DiscussionRoomParticipantRosterItem[] {
  const plan = getRecordValue(run, "plan");
  const participants = asArray(getRecordValue(plan, "participants"));
  const providerConfigs = asArray(getRecordValue(plan, "providerConfigs"));
  const hasProviderBackedSource = hasProviderBackedDiscussionSource(run);
  const hasLocalPresetSource = participants.some((participant) =>
    isLocalPresetAdapterId(getStringRecordValue(participant, "adapterId"))
  );
  const roster: DiscussionRoomParticipantRosterItem[] = [
    {
      name: "You",
      role: "Human participant",
      source: "Room composer",
      status: "In room",
      detail:
        "Send a message that guides the next round.",
      tone: "ok",
      kind: "human"
    }
  ];

  for (const participant of participants) {
    roster.push(createParticipantRosterItem(participant, providerConfigs));
  }

  roster.push(
    ...createReviewRoleRosterItems({
      providerConfigs,
      hasProviderBackedSource,
      hasLocalPresetSource
    })
  );

  return dedupeDiscussionRoomParticipantRoster(roster);
}

function createParticipantRosterItem(
  participant: unknown,
  providerConfigs: unknown[]
): DiscussionRoomParticipantRosterItem {
  const name = getReadableParticipantName(participant);
  const providerConfig = findParticipantProviderConfig(participant, providerConfigs);
  const source = describeParticipantRosterSource(participant, providerConfig);
  const needsSetup =
    Boolean(getStringRecordValue(participant, "providerConfigId")) && !providerConfig;

  return {
    name,
    role: getParticipantRosterRole(name),
    source: source.label,
    sourceValues: source.values,
    status: needsSetup ? "Needs setup" : "Ready",
    detail: needsSetup
      ? "This role references provider setup that Web cannot confirm for this discussion."
      : "This AI participant can respond when the room continues.",
    tone: needsSetup ? "warning" : "ok",
    kind: "ai"
  };
}

function createReviewRoleRosterItems({
  providerConfigs,
  hasProviderBackedSource,
  hasLocalPresetSource
}: {
  providerConfigs: unknown[];
  hasProviderBackedSource: boolean;
  hasLocalPresetSource: boolean;
}): DiscussionRoomParticipantRosterItem[] {
  const reviewSource = hasProviderBackedSource
    ? describeProviderRosterSource(findReviewProviderConfig(providerConfigs))
    : hasLocalPresetSource
      ? { label: "Built-in demo review role" }
      : { label: "Needs AI setup" };
  const ready = hasProviderBackedSource || hasLocalPresetSource;
  const status = ready ? "Ready" : "Needs setup";
  const detail = ready
    ? "This role joins after first responses to keep the discussion reviewable."
    : "Configure a model provider before this role can review a real discussion.";
  const tone = ready ? "ok" : "warning";

  return [
    {
      name: "Skeptic",
      role: "Still unresolved",
      source: reviewSource.label,
      sourceValues: reviewSource.values,
      status,
      detail,
      tone,
      kind: "ai"
    },
    {
      name: "Evidence checker",
      role: "Evidence and verification",
      source: reviewSource.label,
      sourceValues: reviewSource.values,
      status,
      detail,
      tone,
      kind: "ai"
    },
    {
      name: "Risk reviewer",
      role: "Risk review",
      source: reviewSource.label,
      sourceValues: reviewSource.values,
      status,
      detail,
      tone,
      kind: "ai"
    },
    {
      name: "Summary writer",
      role: "Current Answer",
      source: reviewSource.label,
      sourceValues: reviewSource.values,
      status,
      detail,
      tone,
      kind: "ai"
    }
  ];
}

function getReadableParticipantName(participant: unknown): string {
  const id = getStringRecordValue(participant, "id");
  const displayName = getFirstStringRecordValue(participant, ["displayName", "name", "label"]);

  return (
    getUserFacingActorLabel(id) ??
    getUserFacingActorLabel(displayName) ??
    displayName ??
    getUserFacingActorLabel(getStringRecordValue(participant, "adapterId")) ??
    "AI participant"
  );
}

function getParticipantRosterRole(name: string): string {
  const normalized = normalizeActorLabel(name);

  if (
    normalized.startsWith("perspective-") ||
    normalized === "first-viewpoint" ||
    normalized === "alternative-viewpoint" ||
    normalized === "additional-viewpoint"
  ) {
    return "Independent perspective";
  }

  return "AI participant";
}

function findParticipantProviderConfig(
  participant: unknown,
  providerConfigs: unknown[]
): unknown | undefined {
  const providerConfigId = getStringRecordValue(participant, "providerConfigId");

  if (!providerConfigId) {
    return undefined;
  }

  return providerConfigs.find(
    (providerConfig) => getStringRecordValue(providerConfig, "id") === providerConfigId
  );
}

function findReviewProviderConfig(providerConfigs: unknown[]): unknown | undefined {
  return (
    providerConfigs.find(
      (providerConfig) =>
        getStringRecordValue(providerConfig, "id") === OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID
    ) ?? providerConfigs[0]
  );
}

function describeParticipantRosterSource(
  participant: unknown,
  providerConfig: unknown | undefined
): { label: string; values?: Record<string, string> } {
  if (providerConfig) {
    return describeProviderRosterSource(providerConfig);
  }

  const adapterId = getStringRecordValue(participant, "adapterId");

  if (isLocalPresetAdapterId(adapterId)) {
    return { label: "Built-in demo participant" };
  }

  if (getStringRecordValue(participant, "providerConfigId")) {
    return { label: "Needs AI setup" };
  }

  return { label: "Configured AI participant" };
}

function describeProviderRosterSource(
  providerConfig: unknown | undefined
): { label: string; values?: Record<string, string> } {
  if (!providerConfig) {
    return { label: "Configured model provider" };
  }

  const provider = getProviderRosterDisplayName(getStringRecordValue(providerConfig, "adapterId"));
  const model = getStringRecordValue(providerConfig, "modelId");

  return model
    ? { label: "{provider} · {model}", values: { provider, model } }
    : { label: "{provider} default model", values: { provider } };
}

function getProviderRosterDisplayName(adapterId: string | undefined): string {
  const normalized = normalizeActorLabel(adapterId ?? "");

  if (normalized.includes("openai-compatible")) {
    return "OpenAI-compatible";
  }

  if (normalized.startsWith("local-preset")) {
    return "Built-in demo";
  }

  return getUserFacingActorLabel(adapterId) ?? "Configured provider";
}

function isLocalPresetAdapterId(adapterId: string | undefined): boolean {
  return normalizeActorLabel(adapterId ?? "").startsWith("local-preset");
}

function dedupeDiscussionRoomParticipantRoster(
  roster: DiscussionRoomParticipantRosterItem[]
): DiscussionRoomParticipantRosterItem[] {
  const seen = new Set<string>();

  return roster.filter((item) => {
    const key = `${item.kind}:${normalizeActorLabel(item.name)}:${normalizeActorLabel(item.role)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createRoomActivityItems(events: unknown[], run: unknown): RoomActivityItem[] {
  return [...events]
    .sort(compareRunEvents)
    .map((event) => createRoomActivityItem(event, run))
    .filter((activity): activity is RoomActivityItem => Boolean(activity));
}

function addUserContinuationTurnActivity(
  activities: RoomActivityItem[],
  topicLanguage: RoomTopicLanguage
): RoomActivityItem[] {
  if (
    !activities.some(
      (activity) =>
        activity.sourceType === "sealed_batch_opened" ||
        (activity.phase === "first-responses" &&
          activity.title === "Independent response submitted" &&
          !isRoomSpeaker(activity.speaker))
    )
  ) {
    return activities;
  }

  const nextActivities: RoomActivityItem[] = [];
  let insertedBeforeFirstResponseWithoutOpen = false;
  let userTurnCount = 0;

  for (const activity of activities) {
    const shouldInsertBeforeOpenedRound = activity.sourceType === "sealed_batch_opened";
    const shouldInsertBeforeFirstResponse =
      !insertedBeforeFirstResponseWithoutOpen &&
      activity.phase === "first-responses" &&
      activity.title === "Independent response submitted" &&
      !isRoomSpeaker(activity.speaker) &&
      !activities.some((entry) => entry.sourceType === "sealed_batch_opened");

    if (shouldInsertBeforeOpenedRound || shouldInsertBeforeFirstResponse) {
      userTurnCount += 1;
      insertedBeforeFirstResponseWithoutOpen = true;
      nextActivities.push(createUserContinuationTurnActivity(topicLanguage, userTurnCount));
    }

    nextActivities.push(activity);
  }

  return nextActivities;
}

function ensureRoundHandoffActivities(
  activities: RoomActivityItem[],
  run: unknown
): RoomActivityItem[] {
  if (!activities.some((activity) => activity.sourceType === "sealed_batch_revealed")) {
    return activities;
  }

  const nextActivities: RoomActivityItem[] = [];
  const topicLanguage = getRoomTopicLanguage(run);
  let insertedForCurrentRound = false;
  let roundCount = 0;

  for (const activity of activities) {
    if (activity.sourceType === "sealed_batch_opened") {
      roundCount += 1;
      insertedForCurrentRound = false;
    }

    if (activity.sourceType === "sealed_contribution_submitted" && roundCount === 0) {
      roundCount = 1;
    }

    nextActivities.push(activity);

    if (activity.sourceType === "sealed_batch_revealed" && !insertedForCurrentRound) {
      nextActivities.push(
        createRoundHandoffActivity(Math.max(1, roundCount), topicLanguage)
      );
      insertedForCurrentRound = true;
    }
  }

  return nextActivities;
}

function createRoundHandoffActivity(
  round: number,
  topicLanguage: RoomTopicLanguage
): RoomActivityItem {
  if (round > 1) {
    return {
      speaker: "Discussion organizer",
      title: "Follow-up replies connected",
      action: "Connected the follow-up replies",
      detail: localizeTopicLanguageDetail(
        topicLanguage,
        "The latest participant replies are visible. I'm connecting them to the prior room state before the room compares updated options, disagreements, and evidence gaps.",
        "\u6700\u65b0\u53c2\u4e0e\u8005\u56de\u5e94\u5df2\u7ecf\u53ef\u89c1\u3002\u6211\u4f1a\u5148\u628a\u5b83\u4eec\u8fde\u63a5\u5230\u4e4b\u524d\u7684\u8ba8\u8bba\u72b6\u6001\uff0c\u518d\u8ba9\u623f\u95f4\u6bd4\u8f83\u66f4\u65b0\u540e\u7684\u9009\u9879\u3001\u5206\u6b67\u548c\u8bc1\u636e\u7f3a\u53e3\u3002"
      ),
      tone: "neutral",
      phase: "perspectives",
      sourceType: "synthetic_round_handoff"
    };
  }

  return {
    speaker: "Discussion organizer",
    title: "First responses connected",
    action: "Connected the first responses",
    detail: localizeTopicLanguageDetail(
      topicLanguage,
      "The first responses are visible. I'm connecting them before the room compares options, disagreements, and evidence gaps.",
      "\u521d\u59cb\u56de\u5e94\u5df2\u7ecf\u53ef\u89c1\u3002\u6211\u4f1a\u5148\u628a\u5b83\u4eec\u8fde\u63a5\u8d77\u6765\uff0c\u518d\u8ba9\u623f\u95f4\u6bd4\u8f83\u9009\u9879\u3001\u5206\u6b67\u548c\u8bc1\u636e\u7f3a\u53e3\u3002"
    ),
    tone: "neutral",
    phase: "perspectives",
    sourceType: "synthetic_round_handoff"
  };
}

function ensureParticipantReplyBridgeActivities(
  activities: RoomActivityItem[],
  run: unknown
): RoomActivityItem[] {
  if (
    !activities.some((activity) => activity.sourceType === "sealed_batch_revealed") ||
    !activities.some(
      (activity) =>
        activity.sourceType === "sealed_contribution_submitted" &&
        !isRedactedContributionActivity(activity)
    )
  ) {
    return activities;
  }

  const nextActivities: RoomActivityItem[] = [];
  const topicLanguage = getRoomTopicLanguage(run);
  let round = 0;
  let roundContributions: RoomActivityItem[] = [];
  let insertedForRound = false;

  for (const activity of activities) {
    if (activity.sourceType === "sealed_batch_opened") {
      round += 1;
      roundContributions = [];
      insertedForRound = false;
    }

    if (
      activity.sourceType === "sealed_contribution_submitted" &&
      !isRedactedContributionActivity(activity)
    ) {
      if (round === 0) {
        round = 1;
      }

      roundContributions.push(activity);
    }

    nextActivities.push(activity);

    if (
      activity.sourceType === "sealed_batch_revealed" &&
      roundContributions.length > 1 &&
      !insertedForRound
    ) {
      nextActivities.push(
        ...createParticipantReplyBridgeActivities(roundContributions, round, topicLanguage)
      );
      insertedForRound = true;
    }
  }

  return nextActivities;
}

function createParticipantReplyBridgeActivities(
  contributions: RoomActivityItem[],
  round: number,
  topicLanguage: "en" | "zh-CN"
): RoomActivityItem[] {
  return contributions.map((activity, index) => {
    const targetContribution =
      contributions[index === 0 ? contributions.length - 1 : index - 1]!;
    const message = summarizeRoomReplyMessage(activity.detail);

    return {
      speaker: activity.speaker,
      title: "Participant replied to another participant",
      action: "Answered another participant",
      detail:
        topicLanguage === "zh-CN"
          ? round > 1
            ? "\u6211\u5728\u56de\u5e94 {speaker}\uff0c\u5e76\u628a\u6211\u7684\u6700\u65b0\u7acb\u573a\u653e\u56de\u8ba8\u8bba\uff1a{message}"
            : "\u9996\u8f6e\u56de\u5e94\u516c\u5f00\u540e\uff0c\u6211\u5728\u56de\u5e94 {speaker}\uff0c\u5e76\u628a\u6211\u7684\u7acb\u573a\u653e\u56de\u8ba8\u8bba\uff1a{message}"
          : round > 1
            ? "I'm responding to {speaker} while keeping my latest position in the room: {message}"
            : "Now that the first responses are visible, I'm responding to {speaker} while keeping my position in the room: {message}",
      detailValues: {
        speaker: targetContribution.speaker,
        message
      },
      tone: activity.tone,
      phase: "first-responses",
      sourceType: "synthetic_participant_reply_bridge"
    };
  });
}

function summarizeRoomReplyMessage(detail: string): string {
  const normalized = detail.replace(/\s+/g, " ").trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trim()}...`;
}

function isRedactedContributionActivity(activity: RoomActivityItem): boolean {
  return (
    activity.detail ===
    "This response is sealed until the independent first responses are revealed."
  );
}

function ensureEvidenceGapReviewActivity(
  activities: RoomActivityItem[],
  {
    run,
    mainPerspectiveCount,
    unresolvedEvidenceCount
  }: {
    run: unknown;
    mainPerspectiveCount: number;
    unresolvedEvidenceCount: number;
  }
): RoomActivityItem[] {
  if (
    activities.some((activity) => activity.phase === "evidence") ||
    !hasVisibleReviewMaterial(activities, run, mainPerspectiveCount)
  ) {
    return activities;
  }

  return insertRoomReviewActivity(activities, {
    speaker: "Evidence checker",
    title: "Evidence gaps reviewed",
    action: "Reviewed evidence gaps",
    detail: describeEvidenceGapReviewActivityDetail(
      unresolvedEvidenceCount,
      getRoomTopicLanguage(run)
    ),
    detailValues: { count: unresolvedEvidenceCount },
    tone: unresolvedEvidenceCount > 0 ? "warning" : "ok",
    phase: "evidence",
    sourceType: "synthetic_evidence_gap_review"
  });
}

function ensureOpenDisagreementActivity(
  activities: RoomActivityItem[],
  {
    run,
    mainPerspectiveCount,
    openDisagreementCount,
    objections
  }: {
    run: unknown;
    mainPerspectiveCount: number;
    openDisagreementCount: number;
    objections: unknown[];
  }
): RoomActivityItem[] {
  if (
    openDisagreementCount <= 0 ||
    activities.some((activity) => activity.sourceType === "proposal_challenged") ||
    activities.some((activity) => activity.sourceType === "synthetic_open_disagreement") ||
    !hasVisibleReviewMaterial(activities, run, mainPerspectiveCount)
  ) {
    return activities;
  }

  return insertRoomReviewActivity(activities, {
    speaker: "Reviewer",
    title: "Open disagreement surfaced",
    action: "Raised an open disagreement",
    ...describeOpenDisagreementActivityDetail(
      objections,
      openDisagreementCount,
      getRoomTopicLanguage(run)
    ),
    tone: "warning",
    phase: "perspectives",
    sourceType: "synthetic_open_disagreement"
  });
}

function ensurePendingReviewRoundActivities(
  activities: RoomActivityItem[],
  run: unknown
): RoomActivityItem[] {
  return addPendingReviewRoundActivities(activities, getRoomTopicLanguage(run));
}

function addPendingReviewRoundActivities(
  activities: RoomActivityItem[],
  topicLanguage: RoomTopicLanguage
): RoomActivityItem[] {
  const hasParticipantRound = activities.some(
    (activity) =>
      !isRoomSpeaker(activity.speaker) &&
      !isUserSpeaker(activity.speaker) &&
      (activity.sourceType === "sealed_contribution_submitted" ||
        activity.sourceType === "synthetic_participant_reply_bridge")
  );
  const hasReviewOrConclusionActivity = activities.some((activity) =>
    isReviewOrConclusionRoomActivity(activity)
  );
  const hasPendingReviewActivity = activities.some(
    (activity) =>
      activity.sourceType === "synthetic_pending_objection_review" ||
      activity.sourceType === "synthetic_pending_evidence_review"
  );

  if (!hasParticipantRound || hasReviewOrConclusionActivity || hasPendingReviewActivity) {
    return activities;
  }

  return [...activities, ...createPendingReviewRoundActivities(topicLanguage)];
}

function isReviewOrConclusionRoomActivity(activity: RoomActivityItem): boolean {
  return (
    activity.sourceType === "proposal_challenged" ||
    activity.sourceType === "synthetic_open_disagreement" ||
    activity.sourceType === "evidence_result_recorded" ||
    activity.sourceType === "synthetic_evidence_gap_review" ||
    activity.sourceType === "final_candidate_proposed" ||
    activity.sourceType === "final_audit_recorded"
  );
}

function createPendingReviewRoundActivities(
  topicLanguage: RoomTopicLanguage
): RoomActivityItem[] {
  return [
    {
      speaker: "Reviewer",
      title: "Open disagreement review waiting",
      action: "Waiting to review disagreements",
      detail: localizeTopicLanguageDetail(
        topicLanguage,
        "When this round is organized, I will reply with any open disagreement instead of leaving it hidden in a report.",
        "\u5f53\u672c\u8f6e\u5185\u5bb9\u6574\u7406\u5b8c\u6210\u540e\uff0c\u6211\u4f1a\u628a\u4ecd\u9700\u5904\u7406\u7684\u5206\u6b67\u4f5c\u4e3a\u56de\u590d\u7559\u5728\u8ba8\u8bba\u91cc\uff0c\u800c\u4e0d\u662f\u85cf\u5728\u62a5\u544a\u4e2d\u3002"
      ),
      tone: "warning",
      phase: "perspectives",
      sourceType: "synthetic_pending_objection_review"
    },
    {
      speaker: "Evidence checker",
      title: "Evidence check waiting",
      action: "Waiting to check evidence",
      detail: localizeTopicLanguageDetail(
        topicLanguage,
        "When claims are organized, I will reply with evidence gaps or checks before the conclusion changes.",
        "\u5f53\u4e3b\u5f20\u88ab\u6574\u7406\u51fa\u6765\u540e\uff0c\u6211\u4f1a\u628a\u8bc1\u636e\u7f3a\u53e3\u6216\u6838\u67e5\u7ed3\u679c\u4f5c\u4e3a\u56de\u590d\u7559\u5728\u8ba8\u8bba\u91cc\uff0c\u7136\u540e\u518d\u66f4\u65b0\u7ed3\u8bba\u3002"
      ),
      tone: "warning",
      phase: "evidence",
      sourceType: "synthetic_pending_evidence_review"
    }
  ];
}

function ensureStrongOptionConversationActivities(
  activities: RoomActivityItem[],
  {
    run,
    candidates
  }: {
    run: unknown;
    candidates: unknown[];
  }
): RoomActivityItem[] {
  if (
    candidates.length === 0 ||
    activities.some((activity) => activity.sourceType === "synthetic_strong_option_reply")
  ) {
    return activities;
  }

  const topicLanguage = getRoomTopicLanguage(run);
  const perspectiveSpeakers = getStartResultPerspectiveSpeakers(run);
  const existingDetails = new Set(
    activities.map((activity) => normalizeConversationDetail(activity.detail))
  );
  const seenDetails = new Set(existingDetails);
  const optionActivities = candidates
    .flatMap((candidate, index): RoomActivityItem[] => {
      const option = describeStrongOptionForConversation(candidate);
      const normalizedOption = option ? normalizeConversationDetail(option) : "";

      if (!option || seenDetails.has(normalizedOption)) {
        return [];
      }

      seenDetails.add(normalizedOption);
      const speaker = perspectiveSpeakers[index % perspectiveSpeakers.length] ?? "First viewpoint";

      return [
        {
          speaker,
          title: "Strongest option shared",
          action: "Shared a strongest current option",
          detail: localizeTopicLanguageDetail(
            topicLanguage,
            "I would keep this option in the room for comparison: {option}",
            "\u6211\u4f1a\u628a\u8fd9\u4e2a\u9009\u9879\u7559\u5728\u8ba8\u8bba\u5ba4\u91cc\u4f9b\u5bf9\u7167\uff1a{option}"
          ),
          detailValues: { option },
          tone: "ok",
          phase: "perspectives",
          sourceType: "synthetic_strong_option_reply"
        }
      ];
    })
    .slice(0, 2);

  if (optionActivities.length === 0) {
    return activities;
  }

  return insertRoomReviewActivities(activities, optionActivities);
}

function describeStrongOptionForConversation(candidate: unknown): string | undefined {
  const object = getRecordValue(candidate, "object") ?? candidate;
  const title = getFirstStringRecordValue(object, [
    "title",
    "summary",
    "recommendation",
    "claim",
    "description",
    "rationale",
    "text"
  ]);
  const description = getFirstStringRecordValue(object, [
    "description",
    "summary",
    "recommendation",
    "claim",
    "rationale",
    "text"
  ]);

  if (
    title &&
    description &&
    normalizeConversationDetail(title) !== normalizeConversationDetail(description)
  ) {
    return summarizeRoomReplyMessage(`${title}: ${description}`);
  }

  return title ? summarizeRoomReplyMessage(title) : undefined;
}

function normalizeConversationDetail(detail: string): string {
  return detail.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function describeEvidenceGapReviewActivityDetail(
  unresolvedEvidenceCount: number,
  topicLanguage: RoomTopicLanguage
): string {
  if (unresolvedEvidenceCount === 0) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "No evidence gaps are visible in the current room summary.",
      "\u5f53\u524d\u623f\u95f4\u6458\u8981\u4e2d\u6ca1\u6709\u53ef\u89c1\u7684\u8bc1\u636e\u7f3a\u53e3\u3002"
    );
  }

  if (topicLanguage === "zh-CN") {
    return "{count} \u4e2a\u8bc1\u636e\u7f3a\u53e3\u4ecd\u9700\u6838\u67e5\uff0c\u7136\u540e\u624d\u80fd\u4f9d\u8d56\u7b54\u6848\u3002";
  }

  return unresolvedEvidenceCount === 1
    ? "{count} evidence gap still needs checking before relying on the answer."
    : "{count} evidence gaps still need checking before relying on the answer.";
}

function insertRoomReviewActivity(
  activities: RoomActivityItem[],
  activity: RoomActivityItem
): RoomActivityItem[] {
  return insertRoomReviewActivities(activities, [activity]);
}

function insertRoomReviewActivities(
  activities: RoomActivityItem[],
  insertedActivities: RoomActivityItem[]
): RoomActivityItem[] {
  const insertBeforeIndex = activities.findIndex(
    (entry) => entry.phase === "evidence" || entry.phase === "conclusion"
  );

  if (insertBeforeIndex < 0) {
    return [...activities, ...insertedActivities];
  }

  const nextActivities = [...activities];
  nextActivities.splice(insertBeforeIndex, 0, ...insertedActivities);

  return nextActivities;
}

function describeOpenDisagreementActivityDetail(
  objections: unknown[],
  openDisagreementCount: number,
  topicLanguage: RoomTopicLanguage
): Pick<RoomActivityItem, "detail" | "detailValues"> {
  const firstOpenObjection = objections
    .map((objection) => getRecordValue(objection, "object") ?? objection)
    .find((objection) => getRecordValue(objection, "status") !== "resolved");
  const detail = getFirstStringRecordValue(firstOpenObjection, [
    "summary",
    "title",
    "claim",
    "failureMode",
    "reason",
    "description",
    "consequence",
    "impact",
    "mitigation",
    "text"
  ]);

  if (detail) {
    return { detail };
  }

  if (topicLanguage === "zh-CN") {
    return {
      detail:
        "{count} \u4e2a\u672a\u89e3\u51b3\u95ee\u9898\u4ecd\u9700\u5904\u7406\uff0c\u7136\u540e\u624d\u80fd\u4f9d\u8d56\u7b54\u6848\u3002",
      detailValues: { count: openDisagreementCount }
    };
  }

  return {
    detail:
      openDisagreementCount === 1
        ? "{count} unresolved point still needs resolution before relying on the answer."
        : "{count} unresolved points still need resolution before relying on the answer.",
    detailValues: { count: openDisagreementCount }
  };
}

function hasVisibleReviewMaterial(
  activities: RoomActivityItem[],
  run: unknown,
  mainPerspectiveCount: number
): boolean {
  if (
    activities.some(
      (activity) => activity.phase === "perspectives" || activity.phase === "conclusion"
    )
  ) {
    return true;
  }

  return (
    mainPerspectiveCount > 0 ||
    isCompletedDiscussionStatus(getRecordValue(run, "latestExtractionStatus")) ||
    isCompletedDiscussionStatus(getRecordValue(run, "latestFinalizationStatus"))
  );
}

function groupRoomActivitiesByRound(activities: RoomActivityItem[]): RoomActivityGroup[] {
  const groups: RoomActivityGroup[] = [];
  const briefActivities: RoomActivityItem[] = [];
  let currentRound: RoomActivityGroup | null = null;
  let roundCount = 0;

  for (const activity of activities) {
    if (activity.phase === "brief") {
      briefActivities.push(activity);
      continue;
    }

    if (activity.sourceType === "user_continuation_requested" || currentRound === null) {
      roundCount += 1;
      currentRound = {
        kind: "discussion",
        round: roundCount,
        activities: []
      };
      groups.push(currentRound);
    }

    currentRound.activities.push(activity);
  }

  return briefActivities.length > 0
    ? [
        {
          kind: "brief",
          round: 0,
          activities: briefActivities
        },
        ...groups
      ]
    : groups;
}

function countParticipantActivities(activities: RoomActivityItem[]): number {
  return activities.filter(
    (activity) => !isRoomSpeaker(activity.speaker) && !isUserSpeaker(activity.speaker)
  ).length;
}

function describeRoomRoundExchangeDetail(group: RoomActivityGroup): string {
  if (group.kind === "brief") {
    return "The brief is pinned first so every participant responds to the same question.";
  }

  if (group.round > 1) {
    return "This follow-up round lets participants answer earlier replies while reviewer and evidence messages stay in the same thread.";
  }

  return "Participants respond to the brief first; then the organizer, skeptic, and evidence checker join as chat-like replies.";
}

function describeRoomRoundDetail(group: RoomActivityGroup): string {
  if (group.kind === "brief") {
    return "The room starts by making the question, goals, and constraints visible.";
  }

  if (group.round > 1) {
    return "Participants respond to the previous round; review roles answer objections and evidence checks in the same room.";
  }

  return "Participants answer first; review roles respond in the same room.";
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
    label: "Current answer and risk review",
    detail: "The room drafts an answer and records risks or boundaries for review.",
    updatesLabel: "Current answer and risk review updates"
  };
}

function describeRoomActivityConversationCue(
  activity: RoomActivityItem,
  round: number,
  topicLanguage: RoomTopicLanguage
): string {
  if (isUserSpeaker(activity.speaker)) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Starting another room round",
      "\u5f00\u59cb\u65b0\u4e00\u8f6e\u623f\u95f4\u8ba8\u8bba"
    );
  }

  if (activity.sourceType === "topic_contract_published") {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Setting the shared brief",
      "\u8bbe\u7f6e\u5171\u540c\u8ba8\u8bba\u7b80\u62a5"
    );
  }

  if (activity.sourceType === "sealed_batch_opened") {
    return round > 1
      ? localizeTopicLanguageDetail(
          topicLanguage,
          "Inviting follow-up replies",
          "\u9080\u8bf7\u8ffd\u52a0\u56de\u5e94"
        )
      : localizeTopicLanguageDetail(
          topicLanguage,
          "Inviting independent first responses",
          "\u9080\u8bf7\u72ec\u7acb\u9996\u6b21\u56de\u5e94"
        );
  }

  if (activity.sourceType === "sealed_contribution_submitted") {
    return round > 1
      ? localizeTopicLanguageDetail(
          topicLanguage,
          "Responding to the previous discussion round",
          "\u56de\u5e94\u4e0a\u4e00\u8f6e\u8ba8\u8bba"
        )
      : localizeTopicLanguageDetail(
          topicLanguage,
          "Responding to the discussion brief",
          "\u56de\u5e94\u8ba8\u8bba\u7b80\u62a5"
        );
  }

  if (activity.sourceType === "sealed_batch_revealed") {
    return round > 1
      ? localizeTopicLanguageDetail(
          topicLanguage,
          "Bringing the follow-up replies into the room",
          "\u628a\u8ffd\u52a0\u56de\u5e94\u5e26\u5165\u623f\u95f4"
        )
      : localizeTopicLanguageDetail(
          topicLanguage,
          "Bringing the first responses into the room",
          "\u628a\u9996\u6b21\u56de\u5e94\u5e26\u5165\u623f\u95f4"
        );
  }

  if (activity.sourceType === "synthetic_round_handoff") {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Connecting participant messages",
      "\u8fde\u63a5\u53c2\u4e0e\u8005\u53d1\u8a00"
    );
  }

  if (activity.sourceType === "synthetic_participant_reply_bridge") {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Responding to another participant",
      "\u56de\u5e94\u53e6\u4e00\u4f4d\u53c2\u4e0e\u8005"
    );
  }

  if (activity.sourceType === "synthetic_strong_option_reply") {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Sharing a strongest current option",
      "\u5206\u4eab\u5f53\u524d\u6700\u5f3a\u9009\u9879"
    );
  }

  if (activity.sourceType === "extraction_proposed") {
    return round > 1
      ? localizeTopicLanguageDetail(
          topicLanguage,
          "Building on the follow-up replies",
          "\u57fa\u4e8e\u8ffd\u52a0\u56de\u5e94\u7ee7\u7eed"
        )
      : localizeTopicLanguageDetail(
          topicLanguage,
          "Building on the first responses",
          "\u57fa\u4e8e\u9996\u6b21\u56de\u5e94\u7ee7\u7eed"
        );
  }

  if (activity.sourceType === "proposal_accepted") {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Responding to the strongest current options",
      "\u56de\u5e94\u5f53\u524d\u6700\u5f3a\u9009\u9879"
    );
  }

  if (
    activity.sourceType === "proposal_challenged" ||
    activity.sourceType === "synthetic_open_disagreement" ||
    activity.sourceType === "synthetic_pending_objection_review"
  ) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Challenging the current direction",
      "\u8d28\u7591\u5f53\u524d\u65b9\u5411"
    );
  }

  if (
    activity.sourceType === "evidence_result_recorded" ||
    activity.sourceType === "synthetic_evidence_gap_review" ||
    activity.sourceType === "synthetic_pending_evidence_review"
  ) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Checking evidence before the conclusion",
      "\u5728\u5f62\u6210\u7ed3\u8bba\u524d\u6838\u67e5\u8bc1\u636e"
    );
  }

  if (activity.sourceType === "final_candidate_proposed") {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Synthesizing the current room",
      "\u7efc\u5408\u5f53\u524d\u623f\u95f4\u5185\u5bb9"
    );
  }

  if (activity.sourceType === "final_audit_recorded") {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Reviewing risks before relying on it",
      "\u5728\u4f9d\u8d56\u524d\u5ba1\u67e5\u98ce\u9669"
    );
  }

  return localizeTopicLanguageDetail(
    topicLanguage,
    "Responding in the discussion room",
    "\u5728\u8ba8\u8bba\u5ba4\u4e2d\u56de\u5e94"
  );
}

function describeRoomActivityDisplayAction(
  activity: RoomActivityItem,
  round: number,
  topicLanguage: RoomTopicLanguage
): string {
  if (activity.sourceType === "sealed_contribution_submitted" && round > 1) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Shared a follow-up reply",
      "\u5206\u4eab\u4e86\u8ffd\u52a0\u56de\u5e94"
    );
  }

  if (activity.sourceType === "sealed_batch_opened" && round > 1) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Opened follow-up replies",
      "\u5f00\u542f\u4e86\u8ffd\u52a0\u56de\u5e94"
    );
  }

  if (activity.sourceType === "sealed_batch_revealed" && round > 1) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "Made follow-up replies visible",
      "\u516c\u5f00\u4e86\u8ffd\u52a0\u56de\u5e94"
    );
  }

  return localizeRoomActivityAction(activity.action, topicLanguage);
}

function localizeRoomActivityAction(
  action: string,
  topicLanguage: RoomTopicLanguage
): string {
  if (topicLanguage !== "zh-CN") {
    return action;
  }

  const actionTranslations: Record<string, string> = {
    "Asked the room to continue": "\u8981\u6c42\u8ba8\u8bba\u5ba4\u7ee7\u7eed",
    "Shared the discussion brief": "\u5206\u4eab\u4e86\u8ba8\u8bba\u7b80\u62a5",
    "Opened independent first responses": "\u5f00\u542f\u4e86\u72ec\u7acb\u9996\u6b21\u56de\u5e94",
    "Submitted a sealed first response": "\u63d0\u4ea4\u4e86\u5bc6\u5c01\u9996\u6b21\u56de\u5e94",
    "Shared a first response": "\u5206\u4eab\u4e86\u9996\u6b21\u56de\u5e94",
    "Made first responses visible": "\u516c\u5f00\u4e86\u9996\u6b21\u56de\u5e94",
    "Organized the strongest options": "\u6574\u7406\u4e86\u5f53\u524d\u6700\u5f3a\u9009\u9879",
    "Kept this material in the room": "\u5c06\u8fd9\u4efd\u6750\u6599\u4fdd\u7559\u5728\u623f\u95f4\u4e2d",
    "Raised an open disagreement": "\u63d0\u51fa\u4e86\u672a\u89e3\u51b3\u5206\u6b67",
    "Reviewed evidence gaps": "\u5ba1\u9605\u4e86\u8bc1\u636e\u7f3a\u53e3",
    "Reviewed option quality": "\u5ba1\u9605\u4e86\u9009\u9879\u8d28\u91cf",
    "Checked evidence": "\u6838\u67e5\u4e86\u8bc1\u636e",
    "Drafted the current answer": "\u8d77\u8349\u4e86\u5f53\u524d\u7b54\u6848",
    "Reviewed risks": "\u5ba1\u67e5\u4e86\u98ce\u9669",
    "Connected the first responses": "\u8fde\u63a5\u4e86\u9996\u6b21\u56de\u5e94",
    "Connected the follow-up replies": "\u8fde\u63a5\u4e86\u8ffd\u52a0\u56de\u5e94",
    "Answered another participant": "\u56de\u5e94\u4e86\u53e6\u4e00\u4f4d\u53c2\u4e0e\u8005",
    "Shared a strongest current option": "\u5206\u4eab\u4e86\u5f53\u524d\u6700\u5f3a\u9009\u9879",
    "Waiting to review disagreements": "\u7b49\u5f85\u5ba1\u67e5\u5206\u6b67",
    "Waiting to check evidence": "\u7b49\u5f85\u6838\u67e5\u8bc1\u636e"
  };

  return actionTranslations[action] ?? action;
}

function describeRoomActivityDisplayDetail(
  activity: RoomActivityItem,
  round: number,
  topicLanguage: RoomTopicLanguage
): string {
  if (activity.sourceType === "sealed_batch_opened") {
    return round > 1
      ? localizeTopicLanguageDetail(
          topicLanguage,
          "Participants can reply to the current room state before seeing one another's follow-up.",
          "\u53c2\u4e0e\u8005\u53ef\u4ee5\u5728\u770b\u5230\u5f7c\u6b64\u8ffd\u52a0\u56de\u5e94\u4e4b\u524d\uff0c\u5148\u5bf9\u5f53\u524d\u623f\u95f4\u72b6\u6001\u56de\u590d\u3002"
        )
      : localizeTopicLanguageDetail(
          topicLanguage,
          "Participants can respond separately before seeing one another's answers.",
          "\u53c2\u4e0e\u8005\u53ef\u4ee5\u5728\u770b\u5230\u5f7c\u6b64\u7b54\u6848\u524d\u5148\u5206\u522b\u56de\u5e94\u3002"
        );
  }

  if (activity.sourceType === "sealed_batch_revealed") {
    return round > 1
      ? localizeTopicLanguageDetail(
          topicLanguage,
          "The follow-up replies are now available for review.",
          "\u8ffd\u52a0\u56de\u5e94\u73b0\u5728\u53ef\u4ee5\u5ba1\u9605\u3002"
        )
      : localizeTopicLanguageDetail(
          topicLanguage,
          "The independent responses are now available for review.",
          "\u72ec\u7acb\u56de\u5e94\u73b0\u5728\u53ef\u4ee5\u5ba1\u9605\u3002"
        );
  }

  if (
    activity.sourceType === "extraction_proposed" &&
    isGenericFirstResponseOrganizerDetail(activity.detail)
  ) {
    return round > 1
      ? localizeTopicLanguageDetail(
          topicLanguage,
          "The latest replies were organized into updated options, disagreements, requirements, and evidence needs.",
          "\u6700\u65b0\u56de\u5e94\u5df2\u6574\u7406\u4e3a\u66f4\u65b0\u540e\u7684\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002"
        )
      : localizeTopicLanguageDetail(
          topicLanguage,
          "The first responses were organized into reviewable options, disagreements, requirements, and evidence needs.",
          "\u9996\u6b21\u56de\u5e94\u5df2\u6574\u7406\u4e3a\u53ef\u5ba1\u9605\u7684\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002"
        );
  }

  return activity.detail;
}

function isGenericFirstResponseOrganizerDetail(detail: string): boolean {
  return (
    detail ===
      "The revealed responses were organized into options, disagreements, requirements, and evidence needs." ||
    detail === "Organized revealed responses into reviewable perspectives." ||
    detail ===
      "Organize the first responses into reviewable options, disagreements, requirements, and evidence needs." ||
    detail ===
      "\u5c06\u521d\u59cb\u56de\u5e94\u6574\u7406\u4e3a\u53ef\u5ba1\u9605\u7684\u9009\u9879\u3001\u5206\u6b67\u3001\u8981\u6c42\u548c\u8bc1\u636e\u9700\u6c42\u3002" ||
    detail === "Round one organized the first responses into reviewable options." ||
    detail === "Round two organized the follow-up into updated options."
  );
}

function shouldUseTranscriptContextForRoomReply(activity: RoomActivityItem): boolean {
  return (
    activity.sourceType === "proposal_challenged" ||
    activity.sourceType === "synthetic_open_disagreement" ||
    activity.sourceType === "evidence_result_recorded" ||
    activity.sourceType === "synthetic_evidence_gap_review"
  );
}

type RoomTopicLanguage = "en" | "zh-CN";

function getRoomTopicLanguage(run: unknown): RoomTopicLanguage {
  return isSimplifiedChineseText(getRunTopic(run)) ? "zh-CN" : "en";
}

function localizeTopicLanguageDetail(
  topicLanguage: RoomTopicLanguage,
  english: string,
  zhCn: string
): string {
  return topicLanguage === "zh-CN" ? zhCn : english;
}

function formatRoomSpeakerLabel(
  t: TranslateFunction,
  topicLanguage: RoomTopicLanguage,
  speaker: string
): string {
  const userFacingSpeaker = getUserFacingActorLabel(speaker) ?? speaker;
  return topicLanguage === "zh-CN"
    ? localizeActorLabelForTopicLanguage(userFacingSpeaker)
    : t(userFacingSpeaker);
}

function formatRoomContributionText(
  t: TranslateFunction,
  topicLanguage: RoomTopicLanguage,
  message: string,
  values?: Record<string, string | number>
): string {
  if (topicLanguage === "zh-CN") {
    return interpolateRoomContributionText(
      message,
      localizeRoomContributionValuesForTopicLanguage(topicLanguage, values)
    );
  }

  return t(message, values);
}

function localizeRoomContributionValuesForTopicLanguage(
  topicLanguage: RoomTopicLanguage,
  values: Record<string, string | number> | undefined
): Record<string, string | number> | undefined {
  if (!values || topicLanguage !== "zh-CN") {
    return values;
  }

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string"
        ? localizeActorLabelForTopicLanguage(getUserFacingActorLabel(value) ?? value)
        : value
    ])
  );
}

function localizeActorLabelForTopicLanguage(value: string): string {
  switch (normalizeActorLabel(value)) {
    case "first-viewpoint":
    case "perspective-a":
      return "\u7b2c\u4e00\u89c6\u89d2";
    case "alternative-viewpoint":
    case "perspective-b":
      return "\u66ff\u4ee3\u89c6\u89d2";
    case "additional-viewpoint":
    case "perspective-c":
      return "\u8865\u5145\u89c6\u89d2";
    case "skeptic":
    case "reviewer":
      return "\u8d28\u7591\u8005";
    case "review-coordinator":
      return "\u5ba1\u67e5\u534f\u8c03\u8005";
    case "option-reviewer":
      return "\u9009\u9879\u5ba1\u67e5\u8005";
    case "evidence-checker":
      return "\u8bc1\u636e\u6838\u67e5\u8005";
    case "risk-reviewer":
      return "\u98ce\u9669\u5ba1\u67e5\u8005";
    case "summary-writer":
    case "conclusion-writer":
      return "\u603b\u7ed3\u64b0\u5199\u8005";
    case "discussion-organizer":
      return "\u8ba8\u8bba\u7ec4\u7ec7\u8005";
    case "discussion-room":
      return "\u8ba8\u8bba\u5ba4";
    case "you":
      return "\u4f60";
    default:
      return value;
  }
}

function interpolateRoomContributionText(
  message: string,
  values?: Record<string, string | number>
): string {
  if (!values) {
    return message;
  }

  return Object.entries(values).reduce(
    (nextMessage, [key, value]) =>
      nextMessage.replaceAll(`{${key}}`, String(value)),
    message
  );
}

function describeRoomActivityAddressLine(
  activity: RoomActivityItem,
  roundActivities: RoomActivityItem[],
  index: number,
  round: number,
  topicLanguage: RoomTopicLanguage
): { text: string; values?: Record<string, string | number> } | null {
  if (isRoomSpeaker(activity.speaker)) {
    return null;
  }

  if (isUserSpeaker(activity.speaker)) {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "To the room",
        "\u5bf9\u623f\u95f4"
      )
    };
  }

  if (activity.sourceType === "sealed_contribution_submitted") {
    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    if (round > 1) {
      return previousSpeaker
        ? {
            text: localizeTopicLanguageDetail(
              topicLanguage,
              "Replying in round {round} to {speaker}'s latest reply",
              "\u7b2c {round} \u8f6e\u56de\u5e94 {speaker} \u7684\u6700\u65b0\u53d1\u8a00"
            ),
            values: { round, speaker: previousSpeaker }
          }
        : {
            text: localizeTopicLanguageDetail(
              topicLanguage,
              "Replying in round {round} to the previous room state",
              "\u7b2c {round} \u8f6e\u56de\u5e94\u4e4b\u524d\u7684\u623f\u95f4\u72b6\u6001"
            ),
            values: { round }
          };
    }

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Independent reply now compared with {speaker}",
            "\u73b0\u5728\u5c06\u72ec\u7acb\u56de\u5e94\u4e0e {speaker} \u5bf9\u7167"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "To the discussion brief",
            "\u5bf9\u8ba8\u8bba\u7b80\u62a5"
          )
        };
  }

  if (
    activity.sourceType === "synthetic_round_handoff" ||
    activity.sourceType === "extraction_proposed"
  ) {
    return {
      text:
        round > 1
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "To the latest participant replies",
              "\u5bf9\u6700\u65b0\u53c2\u4e0e\u8005\u56de\u5e94"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              "To the participant first responses",
              "\u5bf9\u53c2\u4e0e\u8005\u9996\u6b21\u56de\u5e94"
            )
    };
  }

  if (activity.sourceType === "synthetic_strong_option_reply") {
    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Replying to {speaker}'s latest point",
            "\u56de\u5e94 {speaker} \u7684\u6700\u65b0\u89c2\u70b9"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "To the room's current question",
            "\u56de\u5e94\u8ba8\u8bba\u5ba4\u5f53\u524d\u95ee\u9898"
          )
        };
  }

  if (activity.sourceType === "synthetic_participant_reply_bridge") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "To another participant's latest reply",
        "\u5bf9\u53e6\u4e00\u4f4d\u53c2\u4e0e\u8005\u7684\u6700\u65b0\u53d1\u8a00"
      )
    };
  }

  if (activity.sourceType === "proposal_accepted") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "To the organized options",
        "\u5bf9\u5df2\u6574\u7406\u7684\u9009\u9879"
      )
    };
  }

  if (
    activity.sourceType === "proposal_challenged" ||
    activity.sourceType === "synthetic_open_disagreement" ||
    activity.sourceType === "synthetic_pending_objection_review"
  ) {
    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Replying to {speaker}'s latest point",
            "\u56de\u5e94 {speaker} \u7684\u6700\u65b0\u89c2\u70b9"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "To the strongest current option",
            "\u5bf9\u5f53\u524d\u6700\u5f3a\u9009\u9879"
          )
        };
  }

  if (
    activity.sourceType === "evidence_result_recorded" ||
    activity.sourceType === "synthetic_evidence_gap_review" ||
    activity.sourceType === "synthetic_pending_evidence_review"
  ) {
    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Checking evidence behind {speaker}'s claim",
            "\u6838\u67e5 {speaker} \u4e3b\u5f20\u80cc\u540e\u7684\u8bc1\u636e"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "To the claim that still needs evidence",
            "\u5bf9\u4ecd\u9700\u8bc1\u636e\u7684\u4e3b\u5f20"
          )
        };
  }

  if (activity.sourceType === "final_candidate_proposed") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "To the whole room",
        "\u5bf9\u6574\u4e2a\u623f\u95f4"
      )
    };
  }

  if (activity.sourceType === "final_audit_recorded") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "To the draft conclusion",
        "\u5bf9\u8349\u62df\u7ed3\u8bba"
      )
    };
  }

  return {
    text: localizeTopicLanguageDetail(
      topicLanguage,
      "To the previous message",
      "\u5bf9\u4e0a\u4e00\u6761\u6d88\u606f"
    )
  };
}

function describeRoomActivityReplyLine(
  activity: RoomActivityItem,
  roundActivities: RoomActivityItem[],
  index: number,
  round: number,
  topicLanguage: RoomTopicLanguage
): { text: string; values?: Record<string, string | number> } | null {
  if (isRoomSpeaker(activity.speaker)) {
    return null;
  }

  if (isUserSpeaker(activity.speaker)) {
    return null;
  }

  if (activity.sourceType === "sealed_contribution_submitted") {
    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    if (previousSpeaker) {
      return {
        text:
          round > 1
            ? localizeTopicLanguageDetail(
                topicLanguage,
                "Responding to {speaker}'s latest reply in the follow-up round",
                "\u5728\u8ffd\u52a0\u56de\u5e94\u8f6e\u4e2d\u56de\u5e94 {speaker} \u7684\u6700\u65b0\u53d1\u8a00"
              )
            : localizeTopicLanguageDetail(
                topicLanguage,
                "Adding a separate first response alongside {speaker}",
                "\u5728 {speaker} \u65c1\u8fb9\u52a0\u5165\u4e00\u6761\u72ec\u7acb\u9996\u6b21\u56de\u5e94"
              ),
        values: { speaker: previousSpeaker }
      };
    }

    if (round > 1) {
      return {
        text: localizeTopicLanguageDetail(
          topicLanguage,
          "Responding to the previous discussion round",
          "\u56de\u5e94\u4e0a\u4e00\u8f6e\u8ba8\u8bba"
        )
      };
    }

    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "Replying to the discussion brief before seeing other participants",
        "\u5728\u770b\u5230\u5176\u4ed6\u53c2\u4e0e\u8005\u524d\u5148\u56de\u5e94\u8ba8\u8bba\u7b80\u62a5"
      )
    };
  }

  if (activity.sourceType === "synthetic_round_handoff") {
    return {
      text:
        round > 1
          ? localizeTopicLanguageDetail(
              topicLanguage,
              "Responding after the follow-up replies were revealed",
              "\u5728\u8ffd\u52a0\u56de\u5e94\u516c\u5f00\u540e\u7ee7\u7eed\u56de\u5e94"
            )
          : localizeTopicLanguageDetail(
              topicLanguage,
              "Responding after the first responses were revealed",
              "\u5728\u9996\u6b21\u56de\u5e94\u516c\u5f00\u540e\u7ee7\u7eed\u56de\u5e94"
            )
    };
  }

  if (activity.sourceType === "synthetic_participant_reply_bridge") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "Continuing the round as a direct reply",
        "\u4ee5\u76f4\u63a5\u56de\u590d\u7684\u65b9\u5f0f\u7ee7\u7eed\u672c\u8f6e"
      )
    };
  }

  if (activity.sourceType === "synthetic_strong_option_reply") {
    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Building on {speaker}'s latest point",
            "\u57fa\u4e8e {speaker} \u7684\u6700\u65b0\u89c2\u70b9"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Putting one option into the room for review",
            "\u628a\u4e00\u4e2a\u9009\u9879\u653e\u5165\u8ba8\u8bba\u5ba4\u4f9b\u5ba1\u9605"
          )
        };
  }

  if (activity.sourceType === "extraction_proposed") {
    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    if (round > 1) {
      return previousSpeaker
        ? {
            text: localizeTopicLanguageDetail(
              topicLanguage,
              "Building on {speaker}'s follow-up reply",
              "\u57fa\u4e8e {speaker} \u7684\u8ffd\u52a0\u56de\u5e94\u7ee7\u7eed"
            ),
            values: { speaker: previousSpeaker }
          }
        : {
            text: localizeTopicLanguageDetail(
              topicLanguage,
              "Building on the latest participant replies",
              "\u57fa\u4e8e\u6700\u65b0\u53c2\u4e0e\u8005\u56de\u5e94\u7ee7\u7eed"
            )
          };
    }

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Building on {speaker}'s first response",
            "\u57fa\u4e8e {speaker} \u7684\u9996\u6b21\u56de\u5e94\u7ee7\u7eed"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Building on the participant first responses",
            "\u57fa\u4e8e\u53c2\u4e0e\u8005\u9996\u6b21\u56de\u5e94\u7ee7\u7eed"
          )
        };
  }

  if (activity.sourceType === "proposal_accepted") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "Keeping the organized options in the room for review",
        "\u5c06\u5df2\u6574\u7406\u7684\u9009\u9879\u7559\u5728\u623f\u95f4\u4e2d\u4f9b\u5ba1\u9605"
      )
    };
  }

  if (
    activity.sourceType === "proposal_challenged" ||
    activity.sourceType === "synthetic_open_disagreement" ||
    activity.sourceType === "synthetic_pending_objection_review"
  ) {
    if (activity.sourceType === "synthetic_pending_objection_review") {
      return {
        text: localizeTopicLanguageDetail(
          topicLanguage,
          "Preparing to reply with objections",
          "\u51c6\u5907\u7528\u5206\u6b67\u56de\u5e94"
        )
      };
    }

    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Replying to {speaker}'s option with an open disagreement",
            "\u7528\u4e00\u4e2a\u672a\u89e3\u51b3\u5206\u6b67\u56de\u5e94 {speaker} \u7684\u9009\u9879"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Challenging the current strongest option",
            "\u8d28\u7591\u5f53\u524d\u6700\u5f3a\u9009\u9879"
          )
        };
  }

  if (
    activity.sourceType === "evidence_result_recorded" ||
    activity.sourceType === "synthetic_evidence_gap_review" ||
    activity.sourceType === "synthetic_pending_evidence_review"
  ) {
    if (activity.sourceType === "synthetic_pending_evidence_review") {
      return {
        text: localizeTopicLanguageDetail(
          topicLanguage,
          "Preparing to reply with evidence checks",
          "\u51c6\u5907\u7528\u8bc1\u636e\u6838\u67e5\u56de\u5e94"
        )
      };
    }

    const previousSpeaker = findPreviousRoomParticipantSpeaker(roundActivities, index);

    return previousSpeaker
      ? {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Checking evidence behind {speaker}'s claim",
            "\u6838\u67e5 {speaker} \u4e3b\u5f20\u80cc\u540e\u7684\u8bc1\u636e"
          ),
          values: { speaker: previousSpeaker }
        }
      : {
          text: localizeTopicLanguageDetail(
            topicLanguage,
            "Checking the evidence behind the current claim",
            "\u6838\u67e5\u5f53\u524d\u4e3b\u5f20\u80cc\u540e\u7684\u8bc1\u636e"
          )
        };
  }

  if (activity.sourceType === "final_candidate_proposed") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "Synthesizing perspectives, disagreements, and evidence checks",
        "\u7efc\u5408\u89c6\u89d2\u3001\u5206\u6b67\u548c\u8bc1\u636e\u6838\u67e5"
      )
    };
  }

  if (activity.sourceType === "final_audit_recorded") {
    return {
      text: localizeTopicLanguageDetail(
        topicLanguage,
        "Reviewing risks in the draft conclusion",
        "\u5ba1\u67e5\u8349\u62df\u7ed3\u8bba\u4e2d\u7684\u98ce\u9669"
      )
    };
  }

  return {
    text: localizeTopicLanguageDetail(
      topicLanguage,
      "Responding to the previous room message",
      "\u56de\u5e94\u4e0a\u4e00\u6761\u623f\u95f4\u6d88\u606f"
    )
  };
}

function findPreviousRoomParticipantSpeaker(
  activities: RoomActivityItem[],
  index: number
): string | undefined {
  for (let position = index - 1; position >= 0; position -= 1) {
    const activity = activities[position];

    if (
      activity &&
      !isRoomSpeaker(activity.speaker) &&
      !isUserSpeaker(activity.speaker) &&
      (activity.sourceType === "sealed_contribution_submitted" ||
        activity.sourceType === "synthetic_strong_option_reply") &&
      !isRedactedContributionActivity(activity)
    ) {
      return activity.speaker;
    }
  }

  return undefined;
}

function translateRoomActivityValues(
  t: TranslateFunction,
  values: Record<string, string | number> | undefined
): Record<string, string | number> | undefined {
  if (!values) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" ? t(getUserFacingActorLabel(value) ?? value) : value
    ])
  );
}

function isRoomSpeaker(speaker: string): boolean {
  return normalizeActorLabel(speaker) === "discussion-room";
}

function isUserSpeaker(speaker: string): boolean {
  return normalizeActorLabel(speaker) === "you";
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
  const topicLanguage = getRoomTopicLanguage(run);

  if (type === "topic_contract_published") {
    return {
      speaker: "Discussion room",
      title: "Discussion brief published",
      action: "Shared the discussion brief",
      detail:
        getFirstStringRecordValue(payload, ["topic", "question", "summary"]) ??
        "The discussion brief is available for everyone in the room.",
      tone: "ok",
      phase: "brief",
      sourceType: type
    };
  }

  if (type === "sealed_batch_opened") {
    return {
      speaker: "Discussion room",
      title: "Independent first responses opened",
      action: "Opened independent first responses",
      detail:
        "Participants can respond separately before seeing one another's answers.",
      tone: "neutral",
      phase: "first-responses",
      sourceType: type
    };
  }

  if (type === "sealed_contribution_submitted") {
    return {
      speaker,
      title: "Independent response submitted",
      action: isRedactedPayload(payload)
        ? "Submitted a sealed first response"
        : "Shared a first response",
      detail: isRedactedPayload(payload)
        ? "This response is sealed until the independent first responses are revealed."
        : describeContributionPayload(payload),
      tone: isRedactedPayload(payload) ? "warning" : "ok",
      phase: "first-responses",
      sourceType: type
    };
  }

  if (type === "sealed_batch_revealed") {
    return {
      speaker: "Discussion room",
      title: "Independent first responses revealed",
      action: "Made first responses visible",
      detail: "The independent responses are now available for review.",
      tone: "ok",
      phase: "first-responses",
      sourceType: type
    };
  }

  if (type === "extraction_proposed") {
    return {
      speaker,
      title: "Main perspectives organized",
      action: "Organized the strongest options",
      detail:
        getStringRecordValue(payload, "rationale") ??
        "The revealed responses were organized into options, disagreements, requirements, and evidence needs.",
      tone: "ok",
      phase: "perspectives",
      sourceType: type
    };
  }

  if (type === "proposal_accepted") {
    return {
      speaker,
      title: "Discussion material accepted for review",
      action: "Kept this material in the room",
      detail:
        getStringRecordValue(payload, "rationale") ??
        "The room accepted this discussion material as part of the current working view.",
      tone: "ok",
      phase: "perspectives",
      sourceType: type
    };
  }

  if (type === "proposal_challenged") {
    return {
      speaker,
      title: "Open disagreement recorded",
      action: "Raised an open disagreement",
      detail:
        getStringRecordValue(payload, "reason") ??
        "A challenge was recorded against the current discussion material.",
      tone: "warning",
      phase: "perspectives",
      sourceType: type
    };
  }

  if (type === "evidence_result_recorded") {
    return {
      speaker,
      title: "Evidence check recorded",
      action: "Checked evidence",
      detail: describeEvidenceRoomDetail(payload, topicLanguage),
      tone: "ok",
      phase: "evidence",
      sourceType: type
    };
  }

  if (type === "final_candidate_proposed") {
    return {
      speaker,
      title: "Current answer drafted",
      action: "Drafted the current answer",
      detail:
        getStringRecordValue(payload, "recommendation") ??
        "A reviewable answer draft was prepared from the current discussion material.",
      tone: "ok",
      phase: "conclusion",
      sourceType: type
    };
  }

  if (type === "final_audit_recorded") {
    return {
      speaker,
      title: "Risk review recorded",
      action: "Reviewed risks",
      detail: describeFinalAuditPayload(payload),
      tone: "warning",
      phase: "conclusion",
      sourceType: type
    };
  }

  return null;
}

function describeEvidenceRoomDetail(
  payload: unknown,
  topicLanguage: RoomTopicLanguage
): string {
  const detail = getFirstStringRecordValue(payload, ["summary", "result", "status"]);

  if (!detail) {
    return localizeTopicLanguageDetail(
      topicLanguage,
      "An evidence check result was added to the discussion.",
      "\u8bc1\u636e\u6838\u67e5\u7ed3\u679c\u5df2\u52a0\u5165\u672c\u6b21\u8ba8\u8bba\u3002"
    );
  }

  return sanitizeEvidenceRoomDetail(detail, topicLanguage);
}

function sanitizeEvidenceRoomDetail(
  detail: string,
  topicLanguage: RoomTopicLanguage
): string {
  const trimmed = detail.trim();

  if (
    /^Reported sample evidence result for local-preset-evidence-[a-z0-9-]+; this is not independent verification\.$/i.test(
      trimmed
    )
  ) {
    return "A sample evidence check was recorded; it is not independent verification.";
  }

  if (
    /^\u5df2\u8bb0\u5f55\u793a\u4f8b\u8bc1\u636e\u7ed3\u679c local-preset-evidence-[a-z0-9-]+; \u8fd9\u4e0d\u662f\u72ec\u7acb\u9a8c\u8bc1\u3002$/u.test(
      trimmed
    )
  ) {
    return "\u5df2\u8bb0\u5f55\u793a\u4f8b\u8bc1\u636e\u6838\u67e5\u7ed3\u679c\uff1b\u8fd9\u4e0d\u662f\u72ec\u7acb\u9a8c\u8bc1\u3002";
  }

  return trimmed.replace(
    /\blocal-preset-evidence-[a-z0-9-]+\b/gi,
    topicLanguage === "zh-CN" ? "\u793a\u4f8b\u8bc1\u636e\u9879" : "a sample evidence item"
  );
}

function describeFinalAuditPayload(payload: unknown): string {
  return (
    getFirstStringFromRecordArrays(payload, [
      "risks",
      "findings",
      "limitations",
      "omissions",
      "continuationSuggestions"
    ]) ??
    getFirstStringRecordValue(payload, ["summary", "rationale"]) ??
    "A risk review was recorded for the current answer."
  );
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
  const nextActionLabel = reviewReady ? "Review current answer" : "Continue discussion";

  return (
    <aside
      className="du-room-focus"
      aria-label={t("Current room summary")}
      data-state={reviewReady ? "ready" : "pending"}
    >
      <div className="du-room-focus-section">
        <p className="du-kicker">{t("Decision workspace")}</p>
        <h4>{t("Current answer: {status}", {
          status: reviewReady ? t("Ready to review") : t("Not ready yet")
        })}</h4>
      </div>
      <div className="du-room-focus-section du-room-focus-next">
        <p className="du-kicker">{t("Next action")}</p>
        <strong>{t(nextActionLabel)}</strong>
        <div className="du-action-row">
          {reviewReady ? (
            <Link className="du-action-link" to="/runs/$runId/outcome" params={{ runId }}>
              {t("Review current answer")}
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
        <div className="du-room-focus-queue">
          <RoomFocusReviewLink
            runId={runId}
            reviewReady={reviewReady}
            fallbackHref="#continue-discussion"
            state={openDisagreementCount > 0 ? "needs-review" : "clear"}
            label="Still unresolved"
            value={String(openDisagreementCount)}
          />
          <RoomFocusReviewLink
            runId={runId}
            reviewReady={reviewReady}
            fallbackHref="#continue-discussion"
            state={unresolvedEvidenceCount > 0 ? "needs-review" : "clear"}
            label="Needs checking"
            value={String(unresolvedEvidenceCount)}
          />
          <RoomFocusReviewLink
            runId={runId}
            reviewReady={reviewReady}
            fallbackHref="#continue-discussion"
            state={openRequirementCount > 0 ? "needs-review" : "clear"}
            label="Must cover"
            value={String(openRequirementCount)}
          />
          <div data-state={openItemCount > 0 ? "needs-review" : "clear"}>
            <span>{t("Risks")}</span>
            <strong>
              {openItemCount > 0 ? t("Review needed") : t("No open blockers visible")}
            </strong>
          </div>
        </div>
      </div>
    </aside>
  );
}

function RoomFocusReviewLink({
  runId,
  reviewReady,
  fallbackHref,
  state,
  label,
  value
}: {
  runId: string;
  reviewReady: boolean;
  fallbackHref: string;
  state: "needs-review" | "clear";
  label: string;
  value: string;
}) {
  const { t } = useI18n();
  const content = (
    <>
      <span>{t(label)}</span>
      <strong>{value}</strong>
    </>
  );

  if (reviewReady) {
    return (
      <Link to="/runs/$runId/outcome" params={{ runId }} data-state={state}>
        {content}
      </Link>
    );
  }

  return (
    <a href={fallbackHref} data-state={state}>
      {content}
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
  const recommendation = formatOutcomeTextForUser(
    getStringRecordValue(outcome, "recommendation") ??
    getStringRecordValue(outcome, "summary") ??
    t("No current answer is available yet.")
  );
  const unresolvedQuestions = getStringArray(
    getRecordValue(outcome, "unresolvedQuestions")
  ).map(formatOutcomeTextForUser);
  const limitations = getStringArray(getRecordValue(outcome, "limitations")).map(
    formatOutcomeTextForUser
  );
  const risksAndBoundaries = uniqueReadableStrings([
    ...getOutcomeAuditRisks(outcome).map(formatOutcomeTextForUser),
    ...limitations
  ]);
  const continuationSuggestions = getStringArray(
    getRecordValue(outcome, "continuationSuggestions")
  ).map(formatOutcomeTextForUser);
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
  const organizerFallbackVisible = hasConservativeOrganizerFallback([
    ...mainPerspectives,
    ...openDisagreements,
    ...visibleEvidenceNeeds,
    ...visibleQualityObligations
  ]);
  const unresolvedEvidenceNeeds = visibleEvidenceNeeds.filter(isUnresolvedEvidenceNeed).length;
  const openQualityObligations = countRecordsWithoutStatus(
    visibleQualityObligations,
    "satisfied"
  );
  const mainPerspectiveDetail =
    alternatives.length > 0
      ? describeOutcomeStatusDetail(
          t,
          alternatives.length,
          "Explored option listed",
          "Explored options listed"
        )
      : describeOutcomeStatusDetail(
          t,
          mainPerspectives.length,
          "Perspective visible",
          "Perspectives visible"
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
      ? t("No next steps are listed yet.")
      : describeReviewItemCount(
          t,
          continuationSuggestions.length,
          "next step",
          "next steps"
        );

  return (
    <div className="du-outcome-brief">
      <section
        id="current-recommendation"
        className="du-outcome-hero"
        aria-label={t("Current answer snapshot")}
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
            title={t("Still unresolved")}
            value={String(openDisagreements.length)}
            detail={describeOutcomeStatusDetail(
              t,
              openDisagreements.length,
              "Disagreement still open",
              "Disagreements still open"
            )}
            tone={openDisagreements.length > 0 ? "warning" : "ok"}
          />
          <OutcomeStatusItem
            title={t("Needs checking")}
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
            detail={describeOutcomeStatusDetail(
              t,
              risksAndBoundaries.length,
              "Risk or boundary listed",
              "Risks or boundaries listed"
            )}
            tone={risksAndBoundaries.length > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>
      {organizerFallbackVisible ? <OrganizerFallbackNotice /> : null}
      <section className="du-outcome-review-path" aria-label={t("Answer review path")}>
        <div>
          <p className="du-kicker">{t("Review path")}</p>
          <h4>{t("Before relying on this answer")}</h4>
          <p>
            {t(
              "Start with the recommendation, then check unresolved points, evidence gaps, risks, must-cover items, and next steps."
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
            title={t("Review unresolved points")}
            detail={describeReviewItemCount(
              t,
              openDisagreements.length,
              "unresolved point needs review",
              "unresolved points need review"
            )}
            tone={openDisagreements.length > 0 ? "warning" : "ok"}
          />
          <OutcomeReviewPathItem
            href="#missing-evidence"
            title={t("Check what needs checking")}
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
            title={t("Use next steps")}
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
        title="Still unresolved"
        items={openDisagreements}
        emptyTitle="No unresolved points listed"
        summarizeItem={summarizeOpenObjection}
      />
      <ReadableRecordList
        id="missing-evidence"
        title="Needs checking"
        items={visibleEvidenceNeeds}
        emptyTitle="Nothing needs checking"
        summarizeItem={summarizeEvidenceNeed}
      />
      <ReadableRecordList
        id="answer-requirements"
        title="Must cover"
        items={visibleQualityObligations}
        emptyTitle="No answer requirements listed"
        summarizeItem={summarizeQualityObligation}
      />
      <ReadableStringList
        id="next-recommended-actions"
        title="Next steps"
        items={continuationSuggestions}
        emptyTitle="No next steps listed"
      />
    </div>
  );
}

function OrganizerFallbackNotice() {
  const { t } = useI18n();

  return (
    <aside className="du-organizer-fallback" aria-label={t("Organizer recovery notice")}>
      <p className="du-kicker">{t("Recovery note")}</p>
      <h4>{t("Discussion organizer used a safe fallback")}</h4>
      <p>
        {t(
          "The model returned organizer output Deliberum could not use directly, so this view was rebuilt from the independent first responses. Treat the answer as provisional and check unresolved points, evidence gaps, and risks before relying on it."
        )}
      </p>
    </aside>
  );
}

function hasConservativeOrganizerFallback(records: unknown[]): boolean {
  return records.some(hasConservativeOrganizerFallbackMarker);
}

function hasConservativeOrganizerFallbackMarker(record: unknown): boolean {
  const object = getRecordValue(record, "object") ?? record;
  const id = getStringRecordValue(object, "id") ?? getStringRecordValue(record, "id");

  if (id?.startsWith("fallback-")) {
    return true;
  }

  const markerText = [
    getStringRecordValue(object, "title"),
    getStringRecordValue(object, "description"),
    getStringRecordValue(object, "rationale"),
    getStringRecordValue(object, "failureMode"),
    getStringRecordValue(object, "reason"),
    getStringRecordValue(object, "requirement"),
    ...getStringArray(getRecordValue(object, "assumptions")),
    ...getStringArray(getRecordValue(object, "tradeoffs")),
    ...getStringArray(getRecordValue(object, "applicableWhen"))
  ].join(" ");

  return /conservative extraction fallback|structured organizer output was invalid|organizer extraction needs recovery|provider returned json that could not be used as structured organizer output/i.test(
    markerText
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

const OUTCOME_INTERNAL_PHRASE_REPLACEMENTS: readonly {
  pattern: RegExp;
  replacement: string;
}[] = [
  {
    pattern: /\bdaemon-backed final projection\b/gi,
    replacement: "current answer"
  },
  {
    pattern: /\bfinal projection\b/gi,
    replacement: "current answer"
  },
  {
    pattern: /\bevent_ledger_and_projections\b/gi,
    replacement: "discussion history"
  },
  {
    pattern: /\bevent ledger and projections\b/gi,
    replacement: "discussion history"
  },
  {
    pattern: /\baccepted proposal material\b/gi,
    replacement: "accepted discussion material"
  },
  {
    pattern: /\bcandidate proposal event\b/gi,
    replacement: "candidate option"
  },
  {
    pattern: /\bproposal event\b/gi,
    replacement: "discussion update"
  },
  {
    pattern: /\blocal daemon\b/gi,
    replacement: "local service"
  }
];

const OUTCOME_INTERNAL_ID_PATTERN = new RegExp(
  "\\b(?:final-candidate-event|final-audit-event|process-proposal|proposal-event|final-candidate|final-audit|proposal|candidate|session|run|event)-[a-z0-9][a-z0-9-]*\\b",
  "gi"
);

function formatOutcomeTextForUser(value: string): string {
  let formatted = value.trim();

  for (const { pattern, replacement } of OUTCOME_INTERNAL_PHRASE_REPLACEMENTS) {
    formatted = replaceOutcomePhrase(formatted, pattern, replacement);
  }

  formatted = replaceOutcomePhrase(
    formatted,
    OUTCOME_INTERNAL_ID_PATTERN,
    "discussion item"
  );

  return formatted;
}

function replaceOutcomePhrase(
  value: string,
  pattern: RegExp,
  replacement: string
): string {
  return value.replace(pattern, (match) =>
    /^[A-Z]/.test(match) ? capitalizeOutcomePhrase(replacement) : replacement
  );
}

function capitalizeOutcomePhrase(value: string): string {
  return value.length === 0
    ? value
    : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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
    fallbackTitle: t("Needs checking {number}", { number: index + 1 }),
    fallbackKicker: t("Evidence gap {number}", { number: index + 1 }),
    fallbackDetail: t("This evidence gap still needs verification."),
    titleKeys: ["question", "title", "summary", "reason"],
    detailKeys: ["description", "reason", "summary", "rationale", "text", "claim"]
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
      detail: formatOutcomeTextForUser(item)
    };
  }

  const object = getRecordValue(item, "object") ?? item;
  const status = getStringRecordValue(object, "status");

  return {
    kicker: status ? formatOutcomeRecordStatusForUser(t, status) : options.fallbackKicker,
    title: formatOutcomeTextForUser(
      getFirstStringRecordValue(object, options.titleKeys) ??
      options.fallbackTitle
    ),
    detail: formatOutcomeTextForUser(
      getFirstStringRecordValue(object, options.detailKeys) ??
      options.fallbackDetail
    )
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

function getFirstStringFromRecordArrays(
  record: unknown,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const firstValue = getStringArray(getRecordValue(record, key))[0];

    if (firstValue) {
      return firstValue;
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

function describeOutcomeStatusDetail(
  t: TranslateFunction,
  count: number,
  singular: string,
  plural: string
): string {
  if (count === 0) {
    return t("None listed");
  }

  return t(count === 1 ? singular : plural);
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

function DiscussionDetailPanelsDrawer({ children }: { children: ReactNode }) {
  return (
    <AdvancedDetails
      summary="Advanced / Developer Mode"
      description="Structured discussion records, setup details, progress stages, and developer diagnostics for advanced inspection."
      panelLabel="Structured discussion details"
      lazy
    >
      {children}
    </AdvancedDetails>
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
          title={t("Still unresolved")}
          description={t(
            "Unresolved objections and challenges that still constrain the discussion."
          )}
        >
          <QueryState query={objectionsQuery}>
            <ProjectionRecordList
              records={asArray(objectionsQuery.data?.objections)}
              emptyTitle={t("Nothing unresolved yet")}
              emptyDescription={t(
                "No unresolved points have been accepted into this discussion yet."
              )}
              kind="objection"
            />
          </QueryState>
        </DataPanel>
      </div>
      <div id="answer-requirements" className="du-workbench-anchor">
        <DataPanel
          title={t("Must cover")}
          description={t("Explicit requirements for the current answer.")}
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
          title={t("Risks and needs checking")}
          description={t(
            "Evidence gaps and verification needs that should be checked before relying on the answer."
          )}
        >
          <QueryState query={resourcesQuery}>
            <ProjectionRecordList
              records={asArray(resourcesQuery.data?.evidenceNeeds)}
              emptyTitle={t("Nothing needs checking yet")}
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
            title="Risks and needs checking metadata"
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
      title="Next steps"
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
      "Turn revealed responses into main perspectives, supporting points, unresolved points, and must-cover items.",
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
    title: "Check what needs evidence",
    detail: "Route unresolved evidence gaps through verification work before strengthening the answer.",
    reason: "Separates what is still unverified from what the discussion can rely on.",
    risk: "The answer may rely on claims that are still unchecked."
  },
  candidate_repair: {
    title: "Improve current options",
    detail:
      "Use unresolved points and unfinished must-cover items to strengthen the strongest current options.",
    reason: "Keeps known weaknesses from carrying forward unchanged.",
    risk: "Current options may stay weaker than the discussion already knows they are."
  },
  final_audit: {
    title: "Review answer risks",
    detail: "Check the proposed answer for unresolved risks, limits, and review findings.",
    reason: "Makes the answer safer to review before anyone relies on it.",
    risk: "The answer may omit important risks or limits."
  },
  omission_audit: {
    title: "Check for missing coverage",
    detail: "Look for important accepted material that the proposed answer may have left out.",
    reason: "Reduces the chance that a neat answer hides relevant unresolved material.",
    risk: "The answer may look coherent while omitting important context."
  },
  final_contest: {
    title: "Prepare current answer",
    detail: "Turn the strongest current options into reviewable answer material.",
    reason:
      "Creates a current answer that users can inspect with unresolved points and risks still visible.",
    risk: "The discussion may stop before a reviewable answer exists."
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
    return "New discussion material still needs a review before it shapes the answer.";
  }

  if (observation === "Accepted proposal material contains open evidence needs.") {
    return "Some evidence still needs checking.";
  }

  if (
    observation ===
    "Accepted proposal material contains unresolved objections or quality obligations."
  ) {
    return "Unresolved points or unfinished answer requirements still need work.";
  }

  if (observation === "A final candidate proposal exists without recorded final audit events.") {
    return "The proposed answer still needs a risk review.";
  }

  if (
    observation ===
    "Audited final candidate material is available without an active omission audit proposal."
  ) {
    return "The risk-reviewed answer may still need a missing-coverage check.";
  }

  if (
    observation ===
    "Accepted active candidates are available without open evidence or repair targets."
  ) {
    return "Strong current options are ready to become a reviewable current answer.";
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
          <StartResult
            result={executionMutation.data}
            runId={runId}
            reviewReadyBeforeUpdate={false}
          />
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
    getStringRecordValue(object, "reason") ??
    fallbackTitle;
  const reviewCue = t(formatProjectionRecordReviewCue(kind, getRecordValue(object, "status")));
  const description =
    getStringRecordValue(object, "description") ??
    getStringRecordValue(object, "consequence") ??
    getStringRecordValue(object, "question") ??
    getStringRecordValue(object, "reason") ??
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
    return "Still constrains the current answer.";
  }

  if (kind === "quality obligation" && status === "unanswered") {
    return "Needs an answer before relying on the current answer.";
  }

  if (kind === "evidence") {
    return "Needs checking before relying on the current answer.";
  }

  return "Review this item before relying on the current answer.";
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
    return "Ready to review: current answer is available.";
  }

  if (hasDiscussionStageNeedingAttention(run)) {
    return "Needs attention: one discussion step could not finish cleanly.";
  }

  if (status === "running" && completedStageCount === 0) {
    return "In progress: discussion steps are currently running.";
  }

  if (status === "running" || completedStageCount > 0) {
    return `${completedStageCount} discussion step${
      completedStageCount === 1 ? "" : "s"
    } completed. Continue the discussion before relying on the answer.`;
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

function hasDiscussionStageNeedingAttention(run: unknown): boolean {
  return getDiscussionStageStatuses(run).some(([, stageStatus]) =>
    isDiscussionStageNeedingAttention(stageStatus)
  );
}

function isCompletedDiscussionStage(status: unknown): boolean {
  return status === "completed" || status === "revealed";
}

function isDiscussionStageNeedingAttention(status: unknown): boolean {
  return status === "needs_attention" || status === "failed";
}

export function isDiscussionReviewReady(run: unknown): boolean {
  const finalizationStatus = getRecordValue(run, "latestFinalizationStatus");

  return finalizationStatus === "completed";
}

function describeDiscussionContinuation(run: unknown): DiscussionContinuationView {
  const reviewReady = isDiscussionReviewReady(run);

  if (reviewReady) {
    return {
      title: "Discussion is ready to review",
      description:
        "The guided discussion has produced a current answer. Review it first; refresh the steps only when you want to update the discussion with the same brief.",
      explainerTitle: "Review the current answer",
      explainerDetail:
        "Main perspectives, unresolved points, must-cover items, evidence and verification, risk review, and next steps are available below and on the answer page.",
      primaryLabel: "Update answer",
      primaryActionDetail:
        "Run the guided update again after reviewing unresolved points, evidence gaps, and must-cover items.",
      primaryResultTitle: "Discussion update completed",
      primaryResultDetail:
        "The guided update ran with the current brief. Review the updated answer, unresolved points, must-cover items, and evidence before relying on it.",
      reviewReady
    };
  }

  return {
    title: "Continue discussion",
    description:
      "Continue the guided discussion so perspectives, unresolved points, must-cover items, evidence and verification, risk review, and an answer can appear.",
    explainerTitle: "Continue the full guided discussion",
    explainerDetail:
      "Collects independent first responses, organizes main perspectives, reviews must-cover items, checks evidence needs, and drafts a provisional answer.",
    primaryLabel: "Continue discussion",
    primaryActionDetail:
      "Collect perspectives, organize strongest options, check evidence needs, and draft an answer.",
    primaryResultTitle: "Discussion steps completed",
    primaryResultDetail:
      "The guided discussion steps were recorded. Review the updated perspectives, unresolved points, must-cover items, and current answer.",
    reviewReady
  };
}

function describeDiscussionNextStep(run: unknown): DiscussionNextStepView {
  if (isDiscussionReviewReady(run)) {
    return {
      title: "Review current answer",
      detail:
        "Start with the current answer, then check still unresolved points, must-cover items, risks, and what needs checking before relying on it.",
      tone: "ready"
    };
  }

  if (hasDiscussionStageNeedingAttention(run)) {
    return {
      title: "Check discussion setup",
      detail:
        "A guided step needs attention. Test the AI setup, then continue the discussion before relying on an answer.",
      tone: "active"
    };
  }

  if (getRecordValue(run, "status") === "running") {
    return {
      title: "Check discussion progress",
      detail:
        "Discussion steps are running. Open the room to see which perspectives, unresolved points, evidence checks, and answer work have changed.",
      tone: "active"
    };
  }

  if (countCompletedDiscussionStages(run) > 0) {
    return {
      title: "Continue guided discussion",
      detail:
        "Some discussion steps are complete. Continue the guided flow until the current answer, unresolved points, evidence, risks, and next steps are ready.",
      tone: "active"
    };
  }

  return {
    title: "Continue guided discussion",
    detail:
      "Continue the discussion so independent first responses, main perspectives, unresolved points, must-cover items, evidence, and a current answer can be produced.",
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

  if (status === "waiting_for_generators" || status === "running") {
    return {
      label: "In progress",
      detail: "This discussion step is still being processed."
    };
  }

  if (status === "needs_attention") {
    return {
      label: "Needs attention",
      detail: "This discussion step needs attention before the answer can be trusted."
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
      label: "Needs attention",
      detail: "This discussion step returned a status that needs developer review."
    };
  }

  return {
    label: "Unavailable",
    detail: "No readable status was returned for this discussion step."
  };
}

function describeOutcomeUnavailableReason(reason: unknown): string {
  if (reason === "final_candidate_proposal_unavailable") {
    return "The discussion has not produced answer-ready material yet. Continue the guided discussion before opening the current answer.";
  }

  if (reason === "final_candidate_proposal_ambiguous") {
    return "More than one answer-ready draft is available, so Deliberum cannot choose one automatically.";
  }

  if (reason === "outcome_compilation_unavailable") {
    return "Deliberum could not safely prepare the current answer from the available discussion material.";
  }

  return "Deliberum returned an unavailable answer state. Open Advanced details for the technical reason.";
}

function describeRunOutcomeReviewStatus(draftStatus: unknown): {
  tone: "neutral" | "ok" | "warning";
  title: string;
  detail: string;
} {
  if (draftStatus === "draft") {
    return {
      tone: "ok",
      title: "Current answer ready to review",
      detail:
        "This is reviewable discussion material. Check unresolved points, risks, evidence needs, and next steps before relying on it."
    };
  }

  if (draftStatus === "provisional") {
    return {
      tone: "warning",
      title: "Current answer remains provisional",
      detail:
        "Treat this as a working answer until the visible unresolved points, risks, and evidence gaps have been reviewed."
    };
  }

  return {
    tone: "neutral",
    title: "Current answer status unknown",
    detail:
      "Review the answer together with its unresolved points, risks, evidence needs, and next steps."
  };
}

function formatRunStartErrorMessage(error: Error | null | undefined): string {
  if (getErrorCode(error) === "orchestration_component_unavailable") {
    return "This discussion cannot continue because the required setup is unavailable. Open Advanced mode to inspect setup details before retrying.";
  }

  if (getErrorCode(error) === "run_stage_failed") {
    return "An AI or review step could not finish safely. Check AI setup, then try Continue discussion again. If the same discussion keeps failing after partial responses, start a new discussion with AI.";
  }

  return formatSafeErrorMessage(error);
}

function RunStartRecoveryActions({
  error,
  show
}: {
  error?: Error | null;
  show?: boolean;
}) {
  const { t } = useI18n();

  if (!show && getErrorCode(error) !== "run_stage_failed") {
    return null;
  }

  return (
    <section className="du-run-recovery-actions" aria-label={t("Discussion recovery options")}>
      <div>
        <p className="du-kicker">{t("Recovery options")}</p>
        <h4>{t("Keep the discussion recoverable")}</h4>
        <p>
          {t(
            "Use these steps when a provider returns only part of the discussion or a review step fails before Deliberum can rebuild the answer."
          )}
        </p>
      </div>
      <div className="du-run-recovery-grid">
        <Link className="du-run-recovery-card" to="/setup/models">
          <span>{t("First")}</span>
          <strong>{t("Check AI setup")}</strong>
          <p>{t("Test the provider connection and structured review compatibility.")}</p>
        </Link>
        <a className="du-run-recovery-card" href="#continue-discussion">
          <span>{t("Then")}</span>
          <strong>{t("Try Continue discussion again")}</strong>
          <p>{t("Retry the current discussion after setup is confirmed.")}</p>
        </a>
        <Link
          className="du-run-recovery-card du-run-recovery-primary"
          to="/runs/new"
          search={{
            participants: "model-backed"
          }}
        >
          <span>{t("If it repeats")}</span>
          <strong>{t("Start a new discussion with AI")}</strong>
          <p>{t("Use a fresh discussion when partial provider results keep blocking review.")}</p>
        </Link>
      </div>
    </section>
  );
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
