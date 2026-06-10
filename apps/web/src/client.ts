import {
  DEFAULT_DAEMON_BASE_URL,
  DeliberumDaemonClient,
  type CandidateFrontierResponse,
  type CreateRunRequest,
  type CreateRunResponse,
  type DaemonHealthResponse,
  type EventsResponse,
  type ObjectionsResponse,
  type ObligationsResponse,
  type ListRunsResponse,
  type RunOutcomeResponse,
  type RunResponse,
  type StartRunRequest,
  type StartRunResponse
} from "@deliberum/client";

export type WebRuntimeEnv = {
  readonly VITE_DELIBERUM_DAEMON_URL?: string;
};

export type WebDaemonClient = {
  health: () => Promise<DaemonHealthResponse>;
  createRun: (input: CreateRunRequest) => Promise<CreateRunResponse>;
  listRuns: () => Promise<ListRunsResponse>;
  getRun: (runId: string) => Promise<RunResponse>;
  startRun: (runId: string, startRequest: StartRunRequest) => Promise<StartRunResponse>;
  getRunOutcome: (runId: string) => Promise<RunOutcomeResponse>;
  listEvents: (sessionId: string) => Promise<EventsResponse>;
  getFrontier: (sessionId: string) => Promise<CandidateFrontierResponse>;
  getObjections: (sessionId: string) => Promise<ObjectionsResponse>;
  getObligations: (sessionId: string) => Promise<ObligationsResponse>;
};

export function resolveDaemonBaseUrl(
  env: WebRuntimeEnv = import.meta.env as WebRuntimeEnv
): string {
  const configuredUrl = env.VITE_DELIBERUM_DAEMON_URL?.trim();

  return configuredUrl && configuredUrl.length > 0
    ? configuredUrl
    : DEFAULT_DAEMON_BASE_URL;
}

export function createWebDaemonClient(baseUrl = resolveDaemonBaseUrl()): WebDaemonClient {
  return new DeliberumDaemonClient({
    baseUrl
  });
}
