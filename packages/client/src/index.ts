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
    status: "disabled" | "ready" | "ready_with_run_config";
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
