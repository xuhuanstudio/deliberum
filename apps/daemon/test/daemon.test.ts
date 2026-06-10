import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  createDaemonApp,
  type DaemonApp
} from "../src";
import * as daemon from "../src";

const clock = () => "2026-06-10T00:00:00.000Z";

function createIds(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `id-${index}`;
  };
}

function topicContract() {
  return {
    id: "topic-contract-1",
    title: "Daemon API skeleton",
    topic: "Implement local daemon API skeleton",
    goals: ["Expose local transport endpoints."],
    constraints: ["Preserve ledger authority."],
    outputExpectations: ["Return structured projection views."],
    participantIds: [],
    allowedAdapters: [],
    budgetLease: {},
    governanceRules: []
  };
}

function extractionInput(sourceEventId: string) {
  return {
    authorId: "participant-2",
    rationale: "Extract working objects from contribution.",
    candidates: [
      {
        id: "candidate-1",
        title: "Candidate A",
        description: "Keep accepted candidates visible.",
        sourceEventIds: [sourceEventId],
        status: "active",
        supportedBy: [],
        attackedBy: [],
        qualityObligationIds: ["quality-1"],
        assumptions: [],
        tradeoffs: []
      }
    ],
    objections: [
      {
        id: "objection-1",
        targetId: "candidate-1",
        failureMode: "Important context could be missing.",
        consequence: "The candidate must remain challengeable.",
        severityClaim: "major",
        status: "open",
        sourceEventIds: [sourceEventId],
        responses: []
      }
    ],
    qualityObligations: [
      {
        id: "quality-1",
        scope: "candidate",
        targetCandidateId: "candidate-1",
        requirement: "Preserve unresolved objections.",
        status: "unanswered",
        sourceEventIds: [sourceEventId],
        supportingRefIds: [],
        unresolvedObjectionIds: ["objection-1"]
      }
    ]
  };
}

async function postJson(app: DaemonApp["app"], path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function createSession(daemonApp: DaemonApp): Promise<{ sessionId: string; event: { type: string } }> {
  const response = await postJson(daemonApp.app, "/sessions", {
    topicContract: topicContract()
  });

  expect(response.status).toBe(201);
  return (await response.json()) as { sessionId: string; event: { type: string } };
}

async function openBatch(
  daemonApp: DaemonApp,
  sessionId: string
): Promise<{ batchId: string; event: { type: string } }> {
  const response = await postJson(daemonApp.app, `/sessions/${sessionId}/batches`, {
    purpose: "initial_divergence",
    revealPolicy: "manual"
  });

  expect(response.status).toBe(201);
  return (await response.json()) as { batchId: string; event: { type: string } };
}

async function addContribution(
  daemonApp: DaemonApp,
  sessionId: string,
  batchId: string
): Promise<{ event: { id: string; type: string; payload: Record<string, unknown> } }> {
  const response = await postJson(
    daemonApp.app,
    `/sessions/${sessionId}/batches/${batchId}/contributions`,
    {
      authorId: "participant-1",
      payload: {
        message: "preserve user payload field"
      }
    }
  );

  expect(response.status).toBe(201);
  return (await response.json()) as {
    event: { id: string; type: string; payload: Record<string, unknown> };
  };
}

describe("daemon API", () => {
  it("serves health locally without wildcard CORS", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const response = await daemonApp.app.request("/health");
    const body = (await response.json()) as {
      status: string;
      service: string;
      host: string;
      port: number;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(daemonApp.host).toBe(DEFAULT_DAEMON_HOST);
    expect(daemonApp.port).toBe(DEFAULT_DAEMON_PORT);
    expect(body).toEqual({
      status: "ok",
      service: "deliberum-daemon",
      host: "127.0.0.1",
      port: 3877
    });
  });

  it("returns structured safe errors without stack traces or internals", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const response = await daemonApp.app.request("/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret"
      },
      body: "{not json"
    });
    const bodyText = await response.text();
    const body = JSON.parse(bodyText) as {
      error: {
        code: string;
        message: string;
      };
    };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON."
      }
    });
    expect(bodyText).not.toContain("secret");
    expect(bodyText).not.toContain("Authorization");
    expect(bodyText).not.toContain("SyntaxError");
    expect(bodyText).not.toContain("stack");
  });

  it("creates sessions through core and returns append-only event entries", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const created = await createSession(daemonApp);
    const eventsResponse = await daemonApp.app.request(`/sessions/${created.sessionId}/events`);
    const eventsBody = (await eventsResponse.json()) as {
      events: Array<{ type: string; authorId: string; sequence: number; recordedAt: string }>;
    };

    expect(created.event.type).toBe("topic_contract_published");
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0]).toMatchObject({
      type: "topic_contract_published",
      authorId: "system",
      sequence: 0,
      recordedAt: "2026-06-10T00:00:00.000Z"
    });
  });

  it("runs sealed divergence batch lifecycle through core", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const { sessionId } = await createSession(daemonApp);
    const opened = await openBatch(daemonApp, sessionId);
    const contribution = await addContribution(daemonApp, sessionId, opened.batchId);
    const closeResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/batches/${opened.batchId}/close`,
      {}
    );
    const closeBody = (await closeResponse.json()) as { event: { type: string } };

    expect(opened.event.type).toBe("sealed_batch_opened");
    expect(contribution.event).toMatchObject({
      type: "sealed_contribution_submitted",
      payload: {
        message: "preserve user payload field"
      }
    });
    expect(closeResponse.status).toBe(201);
    expect(closeBody.event.type).toBe("sealed_batch_revealed");
  });

  it("runs extraction proposal lifecycle and derives projection views", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const { sessionId } = await createSession(daemonApp);
    const { batchId } = await openBatch(daemonApp, sessionId);
    const contribution = await addContribution(daemonApp, sessionId, batchId);
    const extractionResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/extractions`,
      extractionInput(contribution.event.id)
    );
    const extractionBody = (await extractionResponse.json()) as {
      proposalId: string;
      event: { id: string; type: string; payload: { status: string } };
    };
    const challengeResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/proposals/${extractionBody.event.id}/challenges`,
      {
        authorId: "participant-3",
        reason: "Keep challenge visible."
      }
    );
    const acceptanceResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/proposals/${extractionBody.event.id}/acceptance`,
      {
        authorId: "participant-3",
        rationale: "Accept into working projection."
      }
    );
    const frontier = (await (
      await daemonApp.app.request(`/sessions/${sessionId}/frontier`)
    ).json()) as { basis: string; candidates: unknown[] };
    const objections = (await (
      await daemonApp.app.request(`/sessions/${sessionId}/objections`)
    ).json()) as { objections: Array<{ object: { id: string } }> };
    const obligations = (await (
      await daemonApp.app.request(`/sessions/${sessionId}/obligations`)
    ).json()) as { qualityObligations: Array<{ object: { id: string; status: string } }> };

    expect(extractionResponse.status).toBe(201);
    expect(extractionBody.event).toMatchObject({
      type: "extraction_proposed",
      payload: {
        status: "proposed"
      }
    });
    expect(challengeResponse.status).toBe(201);
    expect(acceptanceResponse.status).toBe(201);
    expect(frontier).toEqual({
      basis: "accepted_active_candidates",
      candidates: expect.arrayContaining([
        expect.objectContaining({
          object: expect.objectContaining({ id: "candidate-1" })
        })
      ])
    });
    expect(frontier).not.toHaveProperty("currentBest");
    expect(frontier).not.toHaveProperty("winner");
    expect(frontier).not.toHaveProperty("rank");
    expect(frontier).not.toHaveProperty("score");
    expect(frontier).not.toHaveProperty("vote");
    expect(objections.objections[0]?.object.id).toBe("objection-1");
    expect(obligations.qualityObligations[0]?.object).toMatchObject({
      id: "quality-1",
      status: "unanswered"
    });
  });

  it("event bus publishes only after successful mutation and never replays history", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe("id-1", (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    const failedResponse = await postJson(
      daemonApp.app,
      "/sessions/id-1/batches/missing/contributions",
      {
        authorId: "participant-1",
        payload: "no batch"
      }
    );

    expect(failedResponse.status).toBe(400);
    expect(received).toEqual([]);

    const created = await createSession(daemonApp);
    expect(created.sessionId).toBe("id-1");
    expect(received).toEqual([
      {
        id: "id-2",
        type: "topic_contract_published"
      }
    ]);

    unsubscribe();

    const lateReceived: unknown[] = [];
    const lateUnsubscribe = daemonApp.eventBus.subscribe(created.sessionId, (event) => {
      lateReceived.push(event);
    });

    expect(lateReceived).toEqual([]);
    lateUnsubscribe();
  });

  it("SSE endpoint streams new append-only events and not historical projection summaries", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const created = await createSession(daemonApp);
    const response = await daemonApp.app.request(`/sessions/${created.sessionId}/events/stream`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    const noReplay = await Promise.race([
      pendingRead.then(() => "data"),
      new Promise<"none">((resolve) => {
        setTimeout(() => resolve("none"), 10);
      })
    ]);

    expect(noReplay).toBe("none");

    await openBatch(daemonApp, created.sessionId);
    const chunk = await Promise.race([
      pendingRead,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for SSE event.")), 1000);
      })
    ]);
    const text = new TextDecoder().decode(chunk.value);

    expect(text).toContain("event: event");
    expect(text).toContain("sealed_batch_opened");
    expect(text).not.toContain("accepted_active_candidates");
    expect(text).not.toContain("currentBest");

    await reader.cancel();
  });

  it("does not export forbidden semantic or integration surfaces", () => {
    const exportedNames = Object.keys(daemon);
    const forbiddenTerms = [
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
      for (const forbiddenTerm of forbiddenTerms) {
        expect(exportedName).not.toContain(forbiddenTerm);
      }
    }
  });
});
