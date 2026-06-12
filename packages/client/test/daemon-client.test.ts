import { describe, expect, it, vi } from "vitest";
import {
  DaemonClientError,
  DeliberumDaemonClient,
  type DaemonFetch,
  type DaemonFetchInit
} from "../src";
import * as client from "../src";

function createFetch(payload: unknown, ok = true, status = ok ? 200 : 400) {
  return vi.fn(async () => ({
    ok,
    status,
    json: vi.fn(async () => payload)
  })) as unknown as ReturnType<typeof vi.fn> & DaemonFetch;
}

function getFetchCall(fetch: ReturnType<typeof vi.fn> & DaemonFetch) {
  const call = fetch.mock.calls[0] as [string, DaemonFetchInit] | undefined;
  if (!call) {
    throw new Error("Expected fetch to be called.");
  }

  return call;
}

describe("DeliberumDaemonClient", () => {
  it("calls health endpoint with the default local daemon base URL", async () => {
    const fetch = createFetch({
      status: "ok",
      service: "deliberum-daemon",
      host: "127.0.0.1",
      port: 3877
    });
    const daemonClient = new DeliberumDaemonClient({ fetch });

    const result = await daemonClient.health();
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe("http://127.0.0.1:3877/health");
    expect(init).toEqual({
      method: "GET"
    });
    expect(result).toEqual({
      status: "ok",
      service: "deliberum-daemon",
      host: "127.0.0.1",
      port: 3877
    });
  });

  it("posts session creation bodies without adding semantic logic", async () => {
    const fetch = createFetch({
      sessionId: "session-1",
      event: {
        type: "topic_contract_published"
      }
    });
    const daemonClient = new DeliberumDaemonClient({
      baseUrl: "http://127.0.0.1:4000/",
      fetch
    });
    const topicContract = {
      id: "topic-contract-1"
    };

    const result = await daemonClient.createSession({ topicContract });
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe("http://127.0.0.1:4000/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json"
    });
    expect(JSON.parse(init.body ?? "{}")).toEqual({ topicContract });
    expect(result).toEqual({
      sessionId: "session-1",
      event: {
        type: "topic_contract_published"
      }
    });
  });

  it("adds optional daemon bearer auth headers and stream URL token only when configured", async () => {
    const fetch = createFetch({
      sessions: []
    });
    const daemonClient = new DeliberumDaemonClient({
      baseUrl: "http://127.0.0.1:4000/",
      authToken: " local-daemon-auth-token-123 ",
      fetch
    });

    await daemonClient.listSessions();
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe("http://127.0.0.1:4000/sessions");
    expect(init).toEqual({
      method: "GET",
      headers: {
        Authorization: "Bearer local-daemon-auth-token-123"
      }
    });
    expect(daemonClient.getRunEventsStreamUrl("run/1")).toBe(
      "http://127.0.0.1:4000/runs/run%2F1/events/stream?daemonAuthToken=local-daemon-auth-token-123"
    );
    expect(new DeliberumDaemonClient().getRunEventsStreamUrl("run/1")).toBe(
      "http://127.0.0.1:3877/runs/run%2F1/events/stream"
    );
  });

  it("reads safe daemon runtime profile status", async () => {
    const fetch = createFetch({
      profiles: [
        {
          id: "openai-compatible",
          enabled: true,
          status: "ready"
        }
      ]
    });
    const daemonClient = new DeliberumDaemonClient({ fetch });

    const result = await daemonClient.getRuntimeProfiles();
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe("http://127.0.0.1:3877/runtime/profiles");
    expect(init).toEqual({
      method: "GET"
    });
    expect(result).toEqual({
      profiles: [
        {
          id: "openai-compatible",
          enabled: true,
          status: "ready"
        }
      ]
    });
  });

  it("lists daemon sessions through the catalog endpoint", async () => {
    const fetch = createFetch({
      sessions: []
    });
    const daemonClient = new DeliberumDaemonClient({ fetch });

    const result = await daemonClient.listSessions();
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe("http://127.0.0.1:3877/sessions");
    expect(init).toEqual({
      method: "GET"
    });
    expect(result).toEqual({
      sessions: []
    });
  });

  it("calls lifecycle and projection endpoints directly", async () => {
    const fetch = createFetch({
      basis: "accepted_active_candidates",
      candidates: []
    });
    const daemonClient = new DeliberumDaemonClient({ fetch });

    await daemonClient.openBatch("session/1", {
      purpose: "initial_divergence",
      revealPolicy: "manual"
    });
    await daemonClient.addContribution("session/1", "batch/1", {
      authorId: "participant-1",
      payload: {
        message: "preserve user payload key"
      }
    });
    await daemonClient.closeBatch("session/1", "batch/1");
    await daemonClient.proposeExtraction("session/1", {
      authorId: "participant-2",
      rationale: "Extract proposal",
      candidates: []
    });
    await daemonClient.challengeProposal("session/1", "proposal/1", {
      authorId: "participant-3",
      reason: "Challenge proposal"
    });
    await daemonClient.acceptProposal("session/1", "proposal/1", {
      authorId: "participant-3",
      rationale: "Accept for now"
    });
    await daemonClient.listEvents("session/1");
    await daemonClient.getFrontier("session/1");
    await daemonClient.getObjections("session/1");
    await daemonClient.getObligations("session/1");
    await daemonClient.getProcessProposalStates("session/1");
    await daemonClient.proposeProcessProposal("session/1", {
      authorId: "system",
      proposal: {
        id: "process-proposal-1",
        primitive: "sealed_divergence",
        targetIds: ["event/1"],
        expectedQualityGain: "Improve coverage.",
        riskIfSkipped: "The run may converge too early.",
        status: "proposed"
      },
      basedOnEventIds: ["event/1"]
    });
    await daemonClient.challengeProcessProposal("session/1", "process/proposal/1", {
      authorId: "participant-4",
      reason: "Challenge process proposal"
    });
    await daemonClient.decideProcessProposal("session/1", "process/proposal/1", {
      authorId: "participant-5",
      status: "deferred",
      rationale: "Defer until evidence is available"
    });
    await daemonClient.proposeFinalCandidate("session/1", {
      authorId: "participant-6",
      candidateIds: ["candidate/1"],
      recommendation: "Record final candidate proposal material.",
      applicabilityConditions: ["Use only for the current accepted frontier."],
      rationale: "Make the final proposal auditable.",
      limitations: ["Requires audit."],
      idempotencyKey: "final-candidate-1"
    });
    await daemonClient.auditFinalCandidate("session/1", "final/proposal/1", {
      authorId: "participant-7",
      findings: ["The proposal remains provisional."],
      risks: ["Evidence may be incomplete."],
      unresolvedObjectionIds: ["objection/1"],
      qualityObligationIds: ["quality/1"],
      evidenceNeedIds: ["evidence/1"],
      omissions: ["No external validation."],
      compressionProblems: [],
      limitations: ["Audit records boundaries only."],
      continuationSuggestions: ["Resolve evidence need."],
      idempotencyKey: "final-audit-1"
    });
    await daemonClient.getSessionFinal("session/1");
    await daemonClient.getSessionResources("session/1");
    await daemonClient.deliverSessionResource("session/1", "resource/1", {
      participantId: "participant-1",
      idempotencyKey: "resource-delivery-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 64
      }
    });

    const urls = fetch.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      "http://127.0.0.1:3877/sessions/session%2F1/batches",
      "http://127.0.0.1:3877/sessions/session%2F1/batches/batch%2F1/contributions",
      "http://127.0.0.1:3877/sessions/session%2F1/batches/batch%2F1/close",
      "http://127.0.0.1:3877/sessions/session%2F1/extractions",
      "http://127.0.0.1:3877/sessions/session%2F1/proposals/proposal%2F1/challenges",
      "http://127.0.0.1:3877/sessions/session%2F1/proposals/proposal%2F1/acceptance",
      "http://127.0.0.1:3877/sessions/session%2F1/events",
      "http://127.0.0.1:3877/sessions/session%2F1/frontier",
      "http://127.0.0.1:3877/sessions/session%2F1/objections",
      "http://127.0.0.1:3877/sessions/session%2F1/obligations",
      "http://127.0.0.1:3877/sessions/session%2F1/process-proposals",
      "http://127.0.0.1:3877/sessions/session%2F1/process-proposals",
      "http://127.0.0.1:3877/sessions/session%2F1/process-proposals/process%2Fproposal%2F1/challenges",
      "http://127.0.0.1:3877/sessions/session%2F1/process-proposals/process%2Fproposal%2F1/decisions",
      "http://127.0.0.1:3877/sessions/session%2F1/final-candidates",
      "http://127.0.0.1:3877/sessions/session%2F1/final-candidates/final%2Fproposal%2F1/audits",
      "http://127.0.0.1:3877/sessions/session%2F1/final",
      "http://127.0.0.1:3877/sessions/session%2F1/resources",
      "http://127.0.0.1:3877/sessions/session%2F1/resources/resource%2F1/deliveries"
    ]);
    expect(JSON.parse(fetch.mock.calls[11]?.[1]?.body ?? "{}")).toEqual({
      authorId: "system",
      proposal: {
        id: "process-proposal-1",
        primitive: "sealed_divergence",
        targetIds: ["event/1"],
        expectedQualityGain: "Improve coverage.",
        riskIfSkipped: "The run may converge too early.",
        status: "proposed"
      },
      basedOnEventIds: ["event/1"]
    });
    expect(JSON.parse(fetch.mock.calls[13]?.[1]?.body ?? "{}")).toEqual({
      authorId: "participant-5",
      status: "deferred",
      rationale: "Defer until evidence is available"
    });
    expect(JSON.parse(fetch.mock.calls[14]?.[1]?.body ?? "{}")).toEqual({
      authorId: "participant-6",
      candidateIds: ["candidate/1"],
      recommendation: "Record final candidate proposal material.",
      applicabilityConditions: ["Use only for the current accepted frontier."],
      rationale: "Make the final proposal auditable.",
      limitations: ["Requires audit."],
      idempotencyKey: "final-candidate-1"
    });
    expect(JSON.parse(fetch.mock.calls[15]?.[1]?.body ?? "{}")).toEqual({
      authorId: "participant-7",
      findings: ["The proposal remains provisional."],
      risks: ["Evidence may be incomplete."],
      unresolvedObjectionIds: ["objection/1"],
      qualityObligationIds: ["quality/1"],
      evidenceNeedIds: ["evidence/1"],
      omissions: ["No external validation."],
      compressionProblems: [],
      limitations: ["Audit records boundaries only."],
      continuationSuggestions: ["Resolve evidence need."],
      idempotencyKey: "final-audit-1"
    });
    expect(JSON.parse(fetch.mock.calls.at(-1)?.[1]?.body ?? "{}")).toEqual({
      participantId: "participant-1",
      idempotencyKey: "resource-delivery-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 64
      }
    });
  });

  it("calls run orchestration endpoints directly", async () => {
    const fetch = createFetch({
      run: {
        runId: "run-1"
      }
    });
    const daemonClient = new DeliberumDaemonClient({ fetch });
    const runPlan = {
      topic: "Expose daemon run commands"
    };
    const startRequest = {
      sealedDivergence: {
        autoCloseManual: true
      }
    };

    await daemonClient.createRun({ runPlan });
    await daemonClient.listRuns();
    await daemonClient.getRun("run/1");
    await daemonClient.getRunEvents("run/1");
    expect(daemonClient.getRunEventsStreamUrl("run/1")).toBe(
      "http://127.0.0.1:3877/runs/run%2F1/events/stream"
    );
    await daemonClient.startRun("run/1", startRequest);
    await daemonClient.getRunOutcome("run/1");
    await daemonClient.getRunProcessProposals("run/1");
    await daemonClient.executeRunProcessProposal("run/1", "process/proposal/1");

    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "http://127.0.0.1:3877/runs",
      "http://127.0.0.1:3877/runs",
      "http://127.0.0.1:3877/runs/run%2F1",
      "http://127.0.0.1:3877/runs/run%2F1/events",
      "http://127.0.0.1:3877/runs/run%2F1/start",
      "http://127.0.0.1:3877/runs/run%2F1/outcome",
      "http://127.0.0.1:3877/runs/run%2F1/process-proposals",
      "http://127.0.0.1:3877/runs/run%2F1/process-proposals/process%2Fproposal%2F1/execute"
    ]);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body ?? "{}")).toEqual({ runPlan });
    expect(fetch.mock.calls[1]?.[1]).toEqual({
      method: "GET"
    });
    expect(fetch.mock.calls[2]?.[1]).toEqual({
      method: "GET"
    });
    expect(fetch.mock.calls[3]?.[1]).toEqual({
      method: "GET"
    });
    expect(fetch.mock.calls[4]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    expect(JSON.parse(fetch.mock.calls[4]?.[1]?.body ?? "{}")).toEqual(startRequest);
    expect(fetch.mock.calls[5]?.[1]).toEqual({
      method: "GET"
    });
    expect(fetch.mock.calls[6]?.[1]).toEqual({
      method: "GET"
    });
    expect(fetch.mock.calls[7]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    expect(JSON.parse(fetch.mock.calls[7]?.[1]?.body ?? "{}")).toEqual({});
  });

  it("revokes daemon resource access grants through the explicit revoke endpoint", async () => {
    const fetch = createFetch({
      revoked: true,
      grant: {
        resourceAccessId: "resource-access-audit-1",
        sessionId: "session-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        mode: "redirect",
        exposure: "public",
        createdAt: "2026-06-10T00:00:00.000Z",
        expiresAt: "2026-06-10T00:05:00.000Z",
        revokedAt: "2026-06-10T00:01:00.000Z",
        accessCount: 1
      }
    });
    const daemonClient = new DeliberumDaemonClient({ fetch });

    const result = await daemonClient.revokeResourceAccess("A".repeat(32));
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe(`http://127.0.0.1:3877/resource-access/${"A".repeat(32)}/revoke`);
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    expect(JSON.parse(init.body ?? "{}")).toEqual({});
    expect(result).toEqual({
      revoked: true,
      grant: {
        resourceAccessId: "resource-access-audit-1",
        sessionId: "session-1",
        resourceId: "resource-1",
        participantId: "participant-1",
        mode: "redirect",
        exposure: "public",
        createdAt: "2026-06-10T00:00:00.000Z",
        expiresAt: "2026-06-10T00:05:00.000Z",
        revokedAt: "2026-06-10T00:01:00.000Z",
        accessCount: 1
      }
    });
  });

  it("passes optional final candidate proposal event overrides", async () => {
    const fetch = createFetch({
      sessionId: "session/1",
      status: "compiled",
      draftStatus: "provisional",
      outcome: {}
    });
    const daemonClient = new DeliberumDaemonClient({ fetch });

    await daemonClient.getRunOutcome("run/1", {
      finalCandidateProposalEventId: " final/proposal 1 "
    });
    await daemonClient.getSessionFinal("session/1", {
      finalCandidateProposalEventId: " final/proposal 2 "
    });
    await daemonClient.getSessionFinal("session/1", {
      finalCandidateProposalEventId: "   "
    });

    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "http://127.0.0.1:3877/runs/run%2F1/outcome?finalCandidateProposalEventId=final%2Fproposal%201",
      "http://127.0.0.1:3877/sessions/session%2F1/final?finalCandidateProposalEventId=final%2Fproposal%202",
      "http://127.0.0.1:3877/sessions/session%2F1/final"
    ]);
  });

  it("throws structured daemon client errors from daemon error payloads", async () => {
    const fetch = createFetch(
      {
        error: {
          code: "invalid_json",
          message: "Request body must be valid JSON."
        }
      },
      false,
      400
    );
    const daemonClient = new DeliberumDaemonClient({ fetch });

    await expect(daemonClient.createSession({ topicContract: {} })).rejects.toMatchObject({
      name: "DaemonClientError",
      status: 400,
      code: "invalid_json",
      message: "Request body must be valid JSON."
    } satisfies Partial<DaemonClientError>);
  });

  it("converts fetch failures into safe daemon unavailable errors", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:3877");
    }) as unknown as ReturnType<typeof vi.fn> & DaemonFetch;
    const daemonClient = new DeliberumDaemonClient({ fetch });

    await expect(daemonClient.listRuns()).rejects.toMatchObject({
      name: "DaemonClientError",
      status: 0,
      code: "daemon_unavailable",
      message: "Daemon is unavailable."
    } satisfies Partial<DaemonClientError>);
  });

  it("does not export or implement projection or semantic-authority logic", () => {
    const exportedNames = Object.keys(client);
    const daemonClient = new DeliberumDaemonClient({
      fetch: createFetch({})
    }) as unknown as Record<string, unknown>;
    const forbiddenNames = [
      "projectCandidateFrontier",
      "projectAcceptedDeliberationObjects",
      "projectQualityObligations",
      "Adapter",
      "OpenAI",
      "MCP",
      "WebGET",
      "ResourceBroker",
      "PublicUrl",
      "WebUI",
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "CentralRanker",
      "TruthSummary",
      "Ranking",
      "Voting",
      "FinalAnswer"
    ];

    for (const exportedName of exportedNames) {
      for (const forbiddenName of forbiddenNames) {
        expect(exportedName).not.toContain(forbiddenName);
      }
    }

    for (const methodName of [
      "projectCandidateFrontier",
      "currentBest",
      "winner",
      "rank",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary"
    ]) {
      expect(daemonClient).not.toHaveProperty(methodName);
    }
  });
});
