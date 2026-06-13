import {
  DEFAULT_DAEMON_BASE_URL,
  DeliberumDaemonClient,
  type CandidateFrontierResponse,
  type CreateRunRequest,
  type CreateRunResponse,
  type DaemonHealthResponse,
  type DeploymentPostureResponse,
  type EventResponse,
  type EventsResponse,
  type ResourceAccessPostureResponse,
  type ObjectionsResponse,
  type ObligationsResponse,
  type AuditFinalCandidateRequest,
  type ChallengeProcessProposalRequest,
  type DecideProcessProposalRequest,
  type FinalAuditResponse,
  type FinalCandidateResponse,
  type GetOutcomeOptions,
  type GetSessionFinalOptions,
  type ListSessionsResponse,
  type ListRunsResponse,
  type ProcessProposalResponse,
  type ProcessProposalStatesResponse,
  type ProposeFinalCandidateRequest,
  type ProposeProcessProposalRequest,
  type RuntimeProfilesResponse,
  type RunEventsResponse,
  type RunOutcomeResponse,
  type RunProcessProposalExecutionResponse,
  type RunProcessProposalsResponse,
  type RunResponse,
  type SessionFinalResponse,
  type SessionResourcesResponse,
  type StartRunRequest,
  type StartRunResponse
} from "@deliberum/client";

export type WebRuntimeEnv = {
  readonly VITE_DELIBERUM_DAEMON_URL?: string;
  readonly VITE_DELIBERUM_DAEMON_AUTH_TOKEN?: string;
};

export type WebDaemonClient = {
  health: () => Promise<DaemonHealthResponse>;
  getRuntimeProfiles: () => Promise<RuntimeProfilesResponse>;
  getDeploymentPosture: () => Promise<DeploymentPostureResponse>;
  getResourceAccessPosture: () => Promise<ResourceAccessPostureResponse>;
  listSessions: () => Promise<ListSessionsResponse>;
  createRun: (input: CreateRunRequest) => Promise<CreateRunResponse>;
  listRuns: () => Promise<ListRunsResponse>;
  getRun: (runId: string) => Promise<RunResponse>;
  getRunEvents: (runId: string) => Promise<RunEventsResponse>;
  getRunEventsStreamUrl: (runId: string) => string;
  startRun: (runId: string, startRequest: StartRunRequest) => Promise<StartRunResponse>;
  getRunOutcome: (runId: string, options?: GetOutcomeOptions) => Promise<RunOutcomeResponse>;
  getRunProcessProposals: (runId: string) => Promise<RunProcessProposalsResponse>;
  executeRunProcessProposal: (
    runId: string,
    proposalEventId: string
  ) => Promise<RunProcessProposalExecutionResponse>;
  getProcessProposalStates: (sessionId: string) => Promise<ProcessProposalStatesResponse>;
  proposeProcessProposal: (
    sessionId: string,
    input: ProposeProcessProposalRequest
  ) => Promise<ProcessProposalResponse>;
  challengeProcessProposal: (
    sessionId: string,
    proposalEventId: string,
    input: ChallengeProcessProposalRequest
  ) => Promise<EventResponse>;
  decideProcessProposal: (
    sessionId: string,
    proposalEventId: string,
    input: DecideProcessProposalRequest
  ) => Promise<EventResponse>;
  listEvents: (sessionId: string) => Promise<EventsResponse>;
  getFrontier: (sessionId: string) => Promise<CandidateFrontierResponse>;
  getObjections: (sessionId: string) => Promise<ObjectionsResponse>;
  getObligations: (sessionId: string) => Promise<ObligationsResponse>;
  getSessionFinal: (
    sessionId: string,
    options?: GetSessionFinalOptions
  ) => Promise<SessionFinalResponse>;
  proposeFinalCandidate: (
    sessionId: string,
    input: ProposeFinalCandidateRequest
  ) => Promise<FinalCandidateResponse>;
  auditFinalCandidate: (
    sessionId: string,
    proposalEventId: string,
    input: AuditFinalCandidateRequest
  ) => Promise<FinalAuditResponse>;
  getSessionResources: (sessionId: string) => Promise<SessionResourcesResponse>;
};

export function resolveDaemonBaseUrl(
  env: WebRuntimeEnv = import.meta.env as WebRuntimeEnv
): string {
  const configuredUrl = env.VITE_DELIBERUM_DAEMON_URL?.trim();

  return configuredUrl && configuredUrl.length > 0
    ? configuredUrl
    : DEFAULT_DAEMON_BASE_URL;
}

export function resolveDaemonAuthToken(
  env: WebRuntimeEnv = import.meta.env as WebRuntimeEnv
): string | undefined {
  const token = env.VITE_DELIBERUM_DAEMON_AUTH_TOKEN?.trim();

  return token && token.length > 0 ? token : undefined;
}

export function createWebDaemonClient(
  baseUrl = resolveDaemonBaseUrl(),
  authToken = resolveDaemonAuthToken()
): WebDaemonClient {
  return new DeliberumDaemonClient({
    baseUrl,
    authToken
  });
}
