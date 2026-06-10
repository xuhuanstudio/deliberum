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
};

export type DaemonHealthResponse = {
  status: "ok";
  service: string;
  host: string;
  port: number;
};

export type CreateSessionRequest = {
  topicContract: unknown;
};

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

export type CreateSessionResponse = {
  sessionId: string;
  event: unknown;
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

export type EventsResponse = {
  events: unknown[];
};

export type CandidateFrontierResponse = {
  basis: "accepted_active_candidates";
  candidates: unknown[];
};

export type ObjectionsResponse = {
  objections: unknown[];
};

export type ObligationsResponse = {
  qualityObligations: unknown[];
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

  constructor(options: DaemonClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_DAEMON_BASE_URL);
    this.fetchImplementation = options.fetch ?? getDefaultFetch();
  }

  health(): Promise<DaemonHealthResponse> {
    return this.request("GET", "/health");
  }

  createSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
    return this.request("POST", "/sessions", input);
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

  private async request<TResponse>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<TResponse> {
    const init: DaemonFetchInit = {
      method
    };

    if (body !== undefined) {
      init.headers = {
        "Content-Type": "application/json"
      };
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, init);
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
