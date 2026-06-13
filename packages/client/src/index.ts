export const DEFAULT_DAEMON_BASE_URL = "http://127.0.0.1:3877" as const;

export type DaemonFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type DaemonFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type DaemonFetch = (
  url: string,
  init?: DaemonFetchInit
) => Promise<DaemonFetchResponse>;

export type DaemonClientOptions = {
  baseUrl?: string;
  fetch?: DaemonFetch;
  authToken?: string;
};

export type DaemonHealthResponse = {
  status: "ok";
  service: string;
  host: string;
  port: number;
};

export type RuntimeProfilesResponse = {
  profiles: Array<{
    id: string;
    name: string;
    enabled: boolean;
    status: "disabled" | "needs_configuration" | "ready" | "ready_with_run_config";
    components: Array<{
      id: string;
      kind:
        | "participant_adapter"
        | "extraction_generator"
        | "candidate_repair_generator"
        | "evidence_check_generator"
        | "proposal_reviewer"
        | "final_candidate_generator"
        | "final_auditor";
      enabled: boolean;
    }>;
    setup: {
      enableEnvVar: string;
      envVars: Array<{
        name: string;
        configured: boolean;
        secret: boolean;
        required: boolean;
        purpose: string;
      }>;
      missingRecommendedEnvVars: string[];
      notes: string[];
    };
    boundaries: string[];
  }>;
};

export type RuntimeSetupPlanStepKind =
  | "render_env_template"
  | "write_env_block"
  | "enable_profile"
  | "configure_required_env"
  | "configure_recommended_env"
  | "provide_run_config"
  | "verify_profile";

export type RuntimeSetupPlanStep = {
  order: number;
  kind: RuntimeSetupPlanStepKind;
  profileId: string;
  description: string;
  envVars?: string[];
  command?: string;
};

export type RuntimeSetupPlanProfile = {
  id: string;
  name: string;
  enabled: boolean;
  status: RuntimeProfilesResponse["profiles"][number]["status"];
  enabledComponentCount: number;
  missingRequiredEnvVars: string[];
  missingRecommendedEnvVars: string[];
  configuredEnvVarCount: number;
  configuredSecretEnvVarCount: number;
  secretEnvVarNames: string[];
  optionalEnvVarNames: string[];
  steps: RuntimeSetupPlanStep[];
  notes: string[];
  boundaries: string[];
};

export type RuntimeSetupPlan = {
  summary: {
    profileCount: number;
    enabledProfileCount: number;
    readyProfileCount: number;
    readyWithRunConfigCount: number;
    needsConfigurationCount: number;
    missingRequiredEnvVars: string[];
    missingRecommendedEnvVars: string[];
    secretEnvVarNames: string[];
  };
  profiles: RuntimeSetupPlanProfile[];
  steps: RuntimeSetupPlanStep[];
  safety: string[];
};

export class RuntimeSetupPlanError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "RuntimeSetupPlanError";
  }
}

export function buildRuntimeSetupPlan(
  response: RuntimeProfilesResponse,
  profileId?: string
): RuntimeSetupPlan {
  const profiles = filterRuntimeProfiles(response, profileId);
  const plannedProfiles = profiles.map(createRuntimeSetupPlanProfile);
  const steps = plannedProfiles.flatMap((profile) => profile.steps).map((step, index) => ({
    ...step,
    order: index + 1
  }));
  const profilesWithRenumberedSteps = plannedProfiles.map((profile) => ({
    ...profile,
    steps: steps.filter((step) => step.profileId === profile.id)
  }));

  return {
    summary: {
      profileCount: profilesWithRenumberedSteps.length,
      enabledProfileCount: profilesWithRenumberedSteps.filter((profile) => profile.enabled)
        .length,
      readyProfileCount: profilesWithRenumberedSteps.filter(
        (profile) => profile.status === "ready"
      ).length,
      readyWithRunConfigCount: profilesWithRenumberedSteps.filter(
        (profile) => profile.status === "ready_with_run_config"
      ).length,
      needsConfigurationCount: profilesWithRenumberedSteps.filter(
        (profile) => profile.status === "needs_configuration"
      ).length,
      missingRequiredEnvVars: uniqueSorted(
        profilesWithRenumberedSteps.flatMap((profile) => profile.missingRequiredEnvVars)
      ),
      missingRecommendedEnvVars: uniqueSorted(
        profilesWithRenumberedSteps.flatMap((profile) => profile.missingRecommendedEnvVars)
      ),
      secretEnvVarNames: uniqueSorted(
        profilesWithRenumberedSteps.flatMap((profile) => profile.secretEnvVarNames)
      )
    },
    profiles: profilesWithRenumberedSteps,
    steps,
    safety: [
      "This setup plan is derived from safe /runtime/profiles metadata.",
      "It reports only env var names, booleans, component counts, notes, boundaries, and local CLI commands.",
      "It does not read, request, print, persist, or validate provider secrets or bearer tokens.",
      "The setup plan itself does not write .env files, mutate daemon configuration, start providers, start MCP servers, execute adapters, or change run plans.",
      "Daemon and CLI processes still read environment values from process.env at process start."
    ]
  };
}

function createRuntimeSetupPlanProfile(
  profile: RuntimeProfilesResponse["profiles"][number]
): RuntimeSetupPlanProfile {
  const configuredEnvVars = profile.setup.envVars.filter((envVarView) => envVarView.configured);
  const missingRequiredEnvVars = profile.setup.envVars
    .filter((envVarView) => envVarView.required && !envVarView.configured)
    .map((envVarView) => envVarView.name);
  const missingRecommendedEnvVars = profile.setup.missingRecommendedEnvVars.filter(
    (name) => !missingRequiredEnvVars.includes(name)
  );
  const enabledComponents = profile.components.filter((component) => component.enabled);
  const secretEnvVarNames = profile.setup.envVars
    .filter((envVarView) => envVarView.secret)
    .map((envVarView) => envVarView.name);
  const optionalEnvVarNames = profile.setup.envVars
    .filter(
      (envVarView) =>
        !envVarView.required &&
        !profile.setup.missingRecommendedEnvVars.includes(envVarView.name)
    )
    .map((envVarView) => envVarView.name);

  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    status: profile.status,
    enabledComponentCount: enabledComponents.length,
    missingRequiredEnvVars,
    missingRecommendedEnvVars,
    configuredEnvVarCount: configuredEnvVars.length,
    configuredSecretEnvVarCount: configuredEnvVars.filter((envVarView) => envVarView.secret)
      .length,
    secretEnvVarNames,
    optionalEnvVarNames,
    steps: createRuntimeSetupPlanSteps({
      profile,
      missingRequiredEnvVars,
      missingRecommendedEnvVars
    }),
    notes: [...profile.setup.notes],
    boundaries: [...profile.boundaries]
  };
}

function createRuntimeSetupPlanSteps(input: {
  profile: RuntimeProfilesResponse["profiles"][number];
  missingRequiredEnvVars: readonly string[];
  missingRecommendedEnvVars: readonly string[];
}): RuntimeSetupPlanStep[] {
  const steps: Array<Omit<RuntimeSetupPlanStep, "order">> = [
    {
      kind: "render_env_template",
      profileId: input.profile.id,
      description: "Render a comment-only local environment template for this profile.",
      command: `deliberum daemon env-template --profile ${input.profile.id}`
    },
    {
      kind: "write_env_block",
      profileId: input.profile.id,
      description: "Preview a marker-delimited local env block with profile enable flags and manual secret placeholders before choosing an output path.",
      command: `deliberum daemon env-write --profile ${input.profile.id} --output .env --dry-run`
    }
  ];

  if (!input.profile.enabled) {
    steps.push({
      kind: "enable_profile",
      profileId: input.profile.id,
      description: "Enable the profile in the daemon process environment when this profile should be available.",
      envVars: [input.profile.setup.enableEnvVar]
    });
  }

  if (input.missingRequiredEnvVars.length > 0) {
    steps.push({
      kind: "configure_required_env",
      profileId: input.profile.id,
      description: "Configure required daemon environment variables before this profile can become ready.",
      envVars: [...input.missingRequiredEnvVars]
    });
  }

  if (input.missingRecommendedEnvVars.length > 0) {
    steps.push({
      kind: "configure_recommended_env",
      profileId: input.profile.id,
      description: "Configure daemon-wide defaults, or keep supplying equivalent non-secret run provider config where supported.",
      envVars: [...input.missingRecommendedEnvVars]
    });
  }

  if (input.profile.status === "ready_with_run_config") {
    steps.push({
      kind: "provide_run_config",
      profileId: input.profile.id,
      description: "Provide the provider configuration in the run plan when daemon-wide defaults are intentionally omitted."
    });
  }

  steps.push({
    kind: "verify_profile",
    profileId: input.profile.id,
    description: "Re-run safe diagnostics after changing the daemon environment and restarting the daemon.",
    command: `deliberum daemon profile-doctor --profile ${input.profile.id}`
  });

  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

function filterRuntimeProfiles(
  response: RuntimeProfilesResponse,
  profileId: string | undefined
): RuntimeProfilesResponse["profiles"] {
  const profiles = profileId
    ? response.profiles.filter((profile) => profile.id === profileId)
    : response.profiles;

  if (profileId && profiles.length === 0) {
    throw new RuntimeSetupPlanError(`Runtime profile was not found: ${profileId}`);
  }

  return profiles;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export type ResourceAccessPostureResponse = {
  baseUrl: {
    configured: boolean;
    exposure: "localhost" | "lan" | "public";
    routePattern: "/resource-access/:accessId";
  };
  ttl: {
    configured: boolean;
    defaultTtlMs: number;
    maxTtlMs: number;
  };
  grantStore: {
    mode: "process_memory" | "configured_store";
    restartContinuity: "lost_on_restart" | "depends_on_configured_store";
  };
  hostedContent: {
    supported: true;
    requiresExplicitPolicy: true;
    requiresSizeLimit: true;
    deliveryMaterial: "short_lived_access_url";
    sensitiveDefault: "none";
    brokerContentRestartContinuity: "lost_on_restart" | "depends_on_configured_store";
    grantRestartContinuity: "lost_on_restart" | "depends_on_configured_store";
  };
  productionHosting: {
    status: "not_production_hosting";
    publicUrlHosting: false;
    signedUrls: false;
    arbitraryFileServing: false;
    blockers: string[];
  };
  safety: string[];
};

export type DeploymentPostureResponse = {
  binding: {
    host: string;
    port: number;
    exposure: "localhost" | "lan" | "public";
    defaultLocalhost: boolean;
  };
  controlPlane: {
    auth: "disabled" | "daemon_bearer";
    protected: boolean;
    tokenMode: "disabled" | "single" | "registry";
    principalCount: number;
  };
  cors: {
    originCount: number;
    defaultLocalDevelopmentOrigins: boolean;
  };
  persistence: {
    eventLedger: "process_memory" | "configured_store";
    runMetadata: "process_memory" | "configured_store";
    resourceBroker: "process_memory" | "configured_store";
    resourceAccessGrants: "process_memory" | "configured_store";
    operationAudit: "process_memory" | "configured_store";
    productionMultiWriterCoordination: false;
  };
  resourceAccess: {
    baseUrlConfigured: boolean;
    baseUrlExposure: "localhost" | "lan" | "public";
    grantStoreRestartContinuity: "lost_on_restart" | "depends_on_configured_store";
  };
  webAssets: {
    configured: boolean;
    routeMode: "disabled" | "html_accept_spa_shell_json_api_split";
    shellCache: "no_store";
    assetCache: "immutable";
  };
  productionReadiness: {
    status: "local_only" | "preproduction_remote_hardened" | "not_production_ready";
    readyForProduction: false;
    blockers: string[];
  };
  safety: string[];
};

export type OperationAuditResponse = {
  events: Array<{
    id: string;
    recordedAt: string;
    action: string;
    method: string;
    route: string;
    statusCode: number;
    outcome: "succeeded" | "rejected" | "failed";
    authorization: {
      mode:
        | "none"
        | "daemon_bearer"
        | "daemon_stream_query"
        | "resource_access_token"
        | "webget_token";
      present: boolean;
      principalId?: string;
      role?: string;
      scopes?: string[];
    };
    target: {
      runId?: string;
      sessionId?: string;
      batchId?: string;
      proposalEventId?: string;
      resourceId?: string;
    };
  }>;
};

export type CreateSessionRequest = {
  topicContract: unknown;
};

export type CreateRunRequest = {
  runPlan: unknown;
};

export type StartRunRequest = Record<string, unknown>;

export type OpenBatchRequest = {
  purpose: string;
  participantIds?: string[];
  revealPolicy?: string;
  idempotencyKey?: string;
};

export type AddContributionRequest = {
  authorId: string;
  payload: unknown;
  idempotencyKey?: string;
};

export type ProposeExtractionRequest = {
  authorId: string;
  rationale: string;
  candidates?: unknown[];
  claims?: unknown[];
  objections?: unknown[];
  evidenceNeeds?: unknown[];
  qualityObligations?: unknown[];
  idempotencyKey?: string;
};

export type ChallengeProposalRequest = {
  authorId: string;
  reason: string;
  idempotencyKey?: string;
};

export type AcceptProposalRequest = {
  authorId: string;
  rationale: string;
  idempotencyKey?: string;
};

export type ProposeProcessProposalRequest = {
  authorId: string;
  proposal: unknown;
  basedOnEventIds?: string[];
  idempotencyKey?: string;
};

export type ChallengeProcessProposalRequest = {
  authorId: string;
  reason: string;
  idempotencyKey?: string;
};

export type DecideProcessProposalRequest = {
  authorId: string;
  status: "accepted" | "deferred" | "rejected";
  rationale: string;
  idempotencyKey?: string;
};

export type ProposeFinalCandidateRequest = {
  authorId: string;
  candidateIds: string[];
  recommendation: string;
  applicabilityConditions?: string[];
  rationale: string;
  limitations?: string[];
  idempotencyKey?: string;
};

export type AuditFinalCandidateRequest = {
  authorId: string;
  findings?: string[];
  risks?: string[];
  unresolvedObjectionIds?: string[];
  qualityObligationIds?: string[];
  evidenceNeedIds?: string[];
  omissions?: string[];
  compressionProblems?: string[];
  limitations?: string[];
  continuationSuggestions?: string[];
  idempotencyKey?: string;
};

export type CreateSessionResponse = {
  sessionId: string;
  event: unknown;
};

export type ListSessionsResponse = {
  sessions: Array<{
    sessionId: string;
    topicContractEventId: string | null;
    title: string | null;
    topic: string | null;
    createdAt: string | null;
    recordedAt: string | null;
    latestEventRecordedAt: string | null;
    eventCount: number;
  }>;
};

export type OpenBatchResponse = {
  batchId: string;
  event: unknown;
};

export type EventResponse = {
  event: unknown;
};

export type ExtractionResponse = {
  proposalId: string;
  event: unknown;
};

export type ProcessProposalResponse = {
  proposalId: string;
  event: unknown;
};

export type FinalCandidateResponse = {
  proposalId: string;
  event: unknown;
  appended: boolean;
};

export type FinalAuditResponse = {
  event: unknown;
  appended: boolean;
};

export type EventsResponse = {
  events: unknown[];
};

export type ProjectionMetadataResponse = {
  version: "1";
  eventRange: {
    fromSequence: number;
    toSequence: number;
  } | null;
  eventIds: string[];
};

export type CandidateFrontierResponse = {
  basis: "accepted_active_candidates";
  candidates: unknown[];
  projection: ProjectionMetadataResponse;
};

export type ObjectionsResponse = {
  objections: unknown[];
  projection: ProjectionMetadataResponse;
};

export type ObligationsResponse = {
  qualityObligations: unknown[];
  projection: ProjectionMetadataResponse;
};

export type ProcessProposalStatesResponse = {
  proposalStates: unknown[];
  projection: ProjectionMetadataResponse;
};

export type SessionFinalResponse = {
  sessionId: string;
  status: "compiled";
  draftStatus: string;
  outcome: unknown;
};

export type GetOutcomeOptions = {
  finalCandidateProposalEventId?: string;
};

export type GetSessionFinalOptions = GetOutcomeOptions;

export type SessionResourcesResponse = {
  sessionId: string;
  source: {
    kind: "run_plan" | "none";
    runId?: string;
  };
  plannedResources: Array<{
    reference: {
      resourceId: string;
      required?: boolean;
      preferredDeliveryMode?: "url" | "base64" | "none";
    };
    registered: boolean;
    resource?: unknown;
  }>;
  deliveryAudits: Array<{
    eventId: string;
    sequence: number;
    createdAt: string;
    recordedAt: string;
    basedOnEventIds: string[];
    resourceDeliveryId: string;
    resourceId: string;
    participantId: string;
    resource: unknown;
    request: unknown;
    result: unknown;
  }>;
  accessAudits: Array<{
    eventId: string;
    sequence: number;
    createdAt: string;
    recordedAt: string;
    basedOnEventIds: string[];
    action: "created" | "revoked";
    resourceAccessId: string;
    resourceId: string;
    participantId: string;
    grant: unknown;
    resource?: unknown;
    revokedAt?: string;
  }>;
  evidenceNeeds: unknown[];
  projection: ProjectionMetadataResponse;
};

export type DeliverSessionResourceRequest = {
  participantId: string;
  policy?: unknown;
  idempotencyKey?: string;
};

export type SessionResourceDeliveryResponse = {
  sessionId: string;
  resource: unknown;
  delivery: unknown;
  auditEvent: {
    id: string;
    type: string;
    appended: boolean;
  };
};

export type ResourceAccessRevokeResponse = {
  revoked: boolean;
  grant: {
    resourceAccessId: string;
    sessionId: string;
    resourceId: string;
    participantId: string;
    mode: "redirect" | "content";
    exposure: "localhost" | "lan" | "public";
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
    accessCount: number;
    lastAccessedAt?: string;
    content?: {
      mime: string;
      sizeBytes: number;
      hash: string;
    };
  };
};

export type CreateRunResponse = {
  run: unknown;
  session: {
    sessionId: string;
  };
  event: unknown;
};

export type ListRunsResponse = {
  runs: unknown[];
};

export type RunResponse = {
  run: unknown;
};

export type RunEventsResponse = {
  runId: string;
  sessionId: string;
  events: unknown[];
};

export type StartRunResponse = {
  run: unknown;
  stages: unknown[];
  stopped: boolean;
  stopReason?: string;
};

export type RunProcessProposalExecutionResponse = StartRunResponse & {
  processProposal: {
    proposalEventId: string;
    proposalId: string;
    primitive: string;
    latestStatus: string;
  };
  startRequest: unknown;
};

export type RunOutcomeResponse =
  | {
      runId: string;
      sessionId: string;
      status: "compiled";
      draftStatus: string;
      outcome: unknown;
    }
  | {
      runId: string;
      sessionId: string;
      status: "not_available";
      reason: string;
    };

export type RunProcessProposalsResponse = {
  runId: string;
  sessionId: string;
  proposals: unknown[];
  observations: string[];
  metadata: unknown;
  executionPolicy?: {
    automaticExecution: boolean;
    explicitExecutionRequired: boolean;
    supportedPrimitives: string[];
    notes: string[];
  };
  executionReadiness?: Array<{
    proposalEventId: string;
    proposalId: string;
    primitive: string;
    latestStatus: string;
    executable: boolean;
    status: string;
    reason: string;
    startRequestPreview?: unknown;
  }>;
};

export type DaemonErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class DaemonClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DaemonClientError";
    this.status = status;
    this.code = code;
  }
}

export class DeliberumDaemonClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: DaemonFetch;
  private readonly authToken: string | undefined;

  constructor(options: DaemonClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_DAEMON_BASE_URL);
    this.fetchImplementation = options.fetch ?? getDefaultFetch();
    this.authToken = normalizeOptionalAuthToken(options.authToken);
  }

  health(): Promise<DaemonHealthResponse> {
    return this.request("GET", "/health");
  }

  getRuntimeProfiles(): Promise<RuntimeProfilesResponse> {
    return this.request("GET", "/runtime/profiles");
  }

  getResourceAccessPosture(): Promise<ResourceAccessPostureResponse> {
    return this.request("GET", "/runtime/resource-access");
  }

  getDeploymentPosture(): Promise<DeploymentPostureResponse> {
    return this.request("GET", "/runtime/deployment-posture");
  }

  getOperationAudit(options: { limit?: number } = {}): Promise<OperationAuditResponse> {
    const query = options.limit === undefined
      ? ""
      : `?limit=${encodeURIComponent(String(options.limit))}`;

    return this.request("GET", `/runtime/operation-audit${query}`);
  }

  createSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
    return this.request("POST", "/sessions", input);
  }

  listSessions(): Promise<ListSessionsResponse> {
    return this.request("GET", "/sessions");
  }

  createRun(input: CreateRunRequest): Promise<CreateRunResponse> {
    return this.request("POST", "/runs", input);
  }

  listRuns(): Promise<ListRunsResponse> {
    return this.request("GET", "/runs");
  }

  getRun(runId: string): Promise<RunResponse> {
    return this.request("GET", `/runs/${encodeURIComponent(runId)}`);
  }

  getRunEvents(runId: string): Promise<RunEventsResponse> {
    return this.request("GET", `/runs/${encodeURIComponent(runId)}/events`);
  }

  getRunEventsStreamUrl(runId: string): string {
    const path = `/runs/${encodeURIComponent(runId)}/events/stream`;
    if (!this.authToken) {
      return `${this.baseUrl}${path}`;
    }

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("daemonAuthToken", this.authToken);

    return url.toString();
  }

  startRun(runId: string, startRequest: StartRunRequest): Promise<StartRunResponse> {
    return this.request("POST", `/runs/${encodeURIComponent(runId)}/start`, startRequest);
  }

  getRunOutcome(
    runId: string,
    options: GetOutcomeOptions = {}
  ): Promise<RunOutcomeResponse> {
    const query = formatFinalCandidateProposalEventQuery(options);

    return this.request("GET", `/runs/${encodeURIComponent(runId)}/outcome${query}`);
  }

  getRunProcessProposals(runId: string): Promise<RunProcessProposalsResponse> {
    return this.request("GET", `/runs/${encodeURIComponent(runId)}/process-proposals`);
  }

  executeRunProcessProposal(
    runId: string,
    proposalEventId: string
  ): Promise<RunProcessProposalExecutionResponse> {
    return this.request(
      "POST",
      `/runs/${encodeURIComponent(runId)}/process-proposals/${encodeURIComponent(proposalEventId)}/execute`,
      {}
    );
  }

  listEvents(sessionId: string): Promise<EventsResponse> {
    return this.request("GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  }

  getFrontier(sessionId: string): Promise<CandidateFrontierResponse> {
    return this.request("GET", `/sessions/${encodeURIComponent(sessionId)}/frontier`);
  }

  getObjections(sessionId: string): Promise<ObjectionsResponse> {
    return this.request("GET", `/sessions/${encodeURIComponent(sessionId)}/objections`);
  }

  getObligations(sessionId: string): Promise<ObligationsResponse> {
    return this.request("GET", `/sessions/${encodeURIComponent(sessionId)}/obligations`);
  }

  getProcessProposalStates(sessionId: string): Promise<ProcessProposalStatesResponse> {
    return this.request(
      "GET",
      `/sessions/${encodeURIComponent(sessionId)}/process-proposals`
    );
  }

  getSessionFinal(
    sessionId: string,
    options: GetSessionFinalOptions = {}
  ): Promise<SessionFinalResponse> {
    const query = formatFinalCandidateProposalEventQuery(options);

    return this.request("GET", `/sessions/${encodeURIComponent(sessionId)}/final${query}`);
  }

  proposeFinalCandidate(
    sessionId: string,
    input: ProposeFinalCandidateRequest
  ): Promise<FinalCandidateResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/final-candidates`,
      input
    );
  }

  auditFinalCandidate(
    sessionId: string,
    proposalEventId: string,
    input: AuditFinalCandidateRequest
  ): Promise<FinalAuditResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/final-candidates/${encodeURIComponent(proposalEventId)}/audits`,
      input
    );
  }

  getSessionResources(sessionId: string): Promise<SessionResourcesResponse> {
    return this.request("GET", `/sessions/${encodeURIComponent(sessionId)}/resources`);
  }

  deliverSessionResource(
    sessionId: string,
    resourceId: string,
    input: DeliverSessionResourceRequest
  ): Promise<SessionResourceDeliveryResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/resources/${encodeURIComponent(resourceId)}/deliveries`,
      input
    );
  }

  revokeResourceAccess(accessId: string): Promise<ResourceAccessRevokeResponse> {
    return this.request(
      "POST",
      `/resource-access/${encodeURIComponent(accessId)}/revoke`,
      {}
    );
  }

  openBatch(sessionId: string, input: OpenBatchRequest): Promise<OpenBatchResponse> {
    return this.request("POST", `/sessions/${encodeURIComponent(sessionId)}/batches`, input);
  }

  addContribution(
    sessionId: string,
    batchId: string,
    input: AddContributionRequest
  ): Promise<EventResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/batches/${encodeURIComponent(batchId)}/contributions`,
      input
    );
  }

  closeBatch(sessionId: string, batchId: string): Promise<EventResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/batches/${encodeURIComponent(batchId)}/close`,
      {}
    );
  }

  proposeExtraction(
    sessionId: string,
    input: ProposeExtractionRequest
  ): Promise<ExtractionResponse> {
    return this.request("POST", `/sessions/${encodeURIComponent(sessionId)}/extractions`, input);
  }

  challengeProposal(
    sessionId: string,
    proposalEventId: string,
    input: ChallengeProposalRequest
  ): Promise<EventResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/proposals/${encodeURIComponent(proposalEventId)}/challenges`,
      input
    );
  }

  acceptProposal(
    sessionId: string,
    proposalEventId: string,
    input: AcceptProposalRequest
  ): Promise<EventResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/proposals/${encodeURIComponent(proposalEventId)}/acceptance`,
      input
    );
  }

  proposeProcessProposal(
    sessionId: string,
    input: ProposeProcessProposalRequest
  ): Promise<ProcessProposalResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/process-proposals`,
      input
    );
  }

  challengeProcessProposal(
    sessionId: string,
    proposalEventId: string,
    input: ChallengeProcessProposalRequest
  ): Promise<EventResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/process-proposals/${encodeURIComponent(proposalEventId)}/challenges`,
      input
    );
  }

  decideProcessProposal(
    sessionId: string,
    proposalEventId: string,
    input: DecideProcessProposalRequest
  ): Promise<EventResponse> {
    return this.request(
      "POST",
      `/sessions/${encodeURIComponent(sessionId)}/process-proposals/${encodeURIComponent(proposalEventId)}/decisions`,
      input
    );
  }

  private async request<TResponse>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<TResponse> {
    const init: DaemonFetchInit = {
      method
    };

    if (this.authToken) {
      init.headers = {
        Authorization: `Bearer ${this.authToken}`
      };
    }

    if (body !== undefined) {
      init.headers = {
        ...(init.headers ?? {}),
        "Content-Type": "application/json"
      };
      init.body = JSON.stringify(body);
    }

    let response: DaemonFetchResponse;

    try {
      response = await this.fetchImplementation(`${this.baseUrl}${path}`, init);
    } catch {
      throw new DaemonClientError(0, "daemon_unavailable", "Daemon is unavailable.");
    }

    const payload = await response.json();

    if (!response.ok) {
      const errorPayload = payload as DaemonErrorPayload;
      throw new DaemonClientError(
        response.status,
        errorPayload.error?.code ?? "request_failed",
        errorPayload.error?.message ?? "Daemon request failed."
      );
    }

    return payload as TResponse;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeOptionalAuthToken(token: string | undefined): string | undefined {
  const trimmed = token?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function formatFinalCandidateProposalEventQuery(options: GetOutcomeOptions): string {
  const finalCandidateProposalEventId = options.finalCandidateProposalEventId?.trim();

  return finalCandidateProposalEventId
    ? `?finalCandidateProposalEventId=${encodeURIComponent(finalCandidateProposalEventId)}`
    : "";
}

function getDefaultFetch(): DaemonFetch {
  if (typeof globalThis.fetch !== "function") {
    throw new DaemonClientError(0, "fetch_unavailable", "A fetch implementation is required.");
  }

  return (url, init) =>
    globalThis.fetch(url, init).then((response) => ({
      ok: response.ok,
      status: response.status,
      json: () => response.json() as Promise<unknown>
    }));
}
