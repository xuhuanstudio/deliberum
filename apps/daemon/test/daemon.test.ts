import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { InMemoryResourceBroker } from "@deliberum/resources";
import {
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  createDaemonApp,
  type DaemonApp
} from "../src";
import * as daemon from "../src";
import type { Resource } from "@deliberum/resources";

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

async function openRestrictedBatch(
  daemonApp: DaemonApp,
  sessionId: string,
  participantIds: string[]
): Promise<{ batchId: string; event: { type: string } }> {
  const response = await postJson(daemonApp.app, `/sessions/${sessionId}/batches`, {
    purpose: "initial_divergence",
    revealPolicy: "manual",
    participantIds
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

function encodeWebGETSubmission(submission: unknown, chunkSize = Number.POSITIVE_INFINITY) {
  return encodeWebGETSubmissionJson(JSON.stringify(submission), chunkSize);
}

function encodeWebGETSubmissionJson(json: string, chunkSize = Number.POSITIVE_INFINITY) {
  const bytes = Buffer.from(json, "utf8");
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, offset + chunkSize).toString("base64url"));
  }

  return {
    chunks,
    length: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

function webgetSubmission(overrides: Record<string, unknown> = {}) {
  return {
    output: {
      contribution: "webget output"
    },
    readReport: {
      contextPagesRead: ["overview", "events"],
      resourcesViewed: [],
      resourcesSummaryOnly: [],
      submissionMode: "chunked_get",
      contextCompleteness: {
        status: "partial",
        notes: ["read scoped context"]
      }
    },
    contextCompleteness: {
      status: "partial",
      notes: ["resource page read"]
    },
    ...overrides
  };
}

function webgetPath(startUrl: string, suffix: string): string {
  const url = new URL(startUrl);
  const basePath = url.pathname.replace(/\/start$/, "");

  return `${basePath}${suffix}`;
}

async function submitWebGETChunks(
  daemonApp: DaemonApp,
  startUrl: string,
  chunks: readonly string[]
): Promise<void> {
  for (let index = 0; index < chunks.length; index += 1) {
    const response = await daemonApp.app.request(
      `${webgetPath(startUrl, "/submit")}?seq=${index + 1}&total=${chunks.length}&encoding=base64url&data=${chunks[index]}`
    );

    expect(response.status).toBe(200);
  }
}

async function commitWebGET(
  daemonApp: DaemonApp,
  startUrl: string,
  total: number,
  sha256: string,
  length: number
): Promise<Response> {
  return daemonApp.app.request(
    `${webgetPath(startUrl, "/commit")}?total=${total}&sha256=${sha256}&length=${length}`
  );
}

function createTokenGenerator(tokens: string[] = ["A".repeat(32), "B".repeat(32), "C".repeat(32)]): () => string {
  let index = 0;

  return () => {
    const token = tokens[index] ?? `${index}`.padStart(32, "T");
    index += 1;

    return token;
  };
}

function tokenFromStartUrl(startUrl: string): string {
  return new URL(startUrl).pathname.split("/")[2] ?? "";
}

function expectNoStore(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
}

async function expectWebGETError(response: Response, code: string): Promise<void> {
  const body = (await response.json()) as { error: { code: string; message: string } };

  expect(response.status).toBe(400);
  expect(body.error.code).toBe(code);
  expect(JSON.stringify(body)).not.toContain("stack");
  expect(JSON.stringify(body)).not.toContain("Authorization");
  expect(JSON.stringify(body)).not.toContain("api_key");
  expect(JSON.stringify(body)).not.toContain("/Users/");
}

async function createWebGETBatch(
  daemonApp: DaemonApp,
  options: {
    participantIds?: string[];
    participantId?: string;
    resourceIds?: string[];
    resourcePolicy?: Parameters<DaemonApp["createWebGETSession"]>[0]["resourcePolicy"];
    ttlMs?: number;
  } = {}
) {
  const { sessionId } = await createSession(daemonApp);
  const opened =
    options.participantIds === undefined
      ? await openBatch(daemonApp, sessionId)
      : await openRestrictedBatch(daemonApp, sessionId, options.participantIds);
  const webget = daemonApp.createWebGETSession({
    sessionId,
    batchId: opened.batchId,
    participantId: options.participantId ?? "participant-web",
    instructions: "Use scoped context only.",
    resourceIds: options.resourceIds,
    resourcePolicy: options.resourcePolicy,
    ttlMs: options.ttlMs
  });

  return {
    sessionId,
    batchId: opened.batchId,
    webget
  };
}

async function submitAndCommitWebGET(
  daemonApp: DaemonApp,
  startUrl: string,
  submission: unknown = webgetSubmission()
): Promise<Response> {
  const encoded = encodeWebGETSubmission(submission);

  await submitWebGETChunks(daemonApp, startUrl, encoded.chunks);

  return commitWebGET(daemonApp, startUrl, encoded.chunks.length, encoded.sha256, encoded.length);
}

function publicUrlResource(id = "public-url-resource"): Resource {
  return {
    id,
    kind: "text",
    mime: "text/plain",
    sizeBytes: 12,
    hash: `hash-${id}`,
    privacy: "public",
    variants: [
      {
        mode: "url",
        url: "https://example.com/resource.txt",
        exposure: "public"
      }
    ]
  };
}

function sensitiveUrlResource(id = "sensitive-url-resource"): Resource {
  return {
    id,
    kind: "text",
    mime: "text/plain",
    sizeBytes: 10,
    hash: `hash-${id}`,
    privacy: "sensitive",
    variants: [
      {
        mode: "url",
        url: "https://example.com/private?api_key=secret-value",
        exposure: "public"
      }
    ]
  };
}

function base64Resource(id = "base64-resource", dataRef = "base64-ref"): Resource {
  return {
    id,
    kind: "text",
    mime: "text/plain",
    sizeBytes: 11,
    hash: `hash-${id}`,
    privacy: "public",
    variants: [
      {
        mode: "base64",
        mime: "text/plain",
        dataRef,
        sizeBytes: 11
      }
    ]
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
    ).json()) as { basis: string; candidates: unknown[]; projection: { version: string } };
    const objections = (await (
      await daemonApp.app.request(`/sessions/${sessionId}/objections`)
    ).json()) as { objections: Array<{ object: { id: string } }>; projection: { version: string } };
    const obligations = (await (
      await daemonApp.app.request(`/sessions/${sessionId}/obligations`)
    ).json()) as {
      qualityObligations: Array<{ object: { id: string; status: string } }>;
      projection: { version: string };
    };

    expect(extractionResponse.status).toBe(201);
    expect(extractionBody.event).toMatchObject({
      type: "extraction_proposed",
      payload: {
        status: "proposed"
      }
    });
    expect(challengeResponse.status).toBe(201);
    expect(acceptanceResponse.status).toBe(201);
    expect(frontier).toMatchObject({
      basis: "accepted_active_candidates",
      candidates: expect.arrayContaining([
        expect.objectContaining({
          object: expect.objectContaining({ id: "candidate-1" })
        })
      ]),
      projection: {
        version: "1"
      }
    });
    expect(frontier).not.toHaveProperty("currentBest");
    expect(frontier).not.toHaveProperty("winner");
    expect(frontier).not.toHaveProperty("rank");
    expect(frontier).not.toHaveProperty("score");
    expect(frontier).not.toHaveProperty("vote");
    expect(objections.objections[0]?.object.id).toBe("objection-1");
    expect(objections.projection.version).toBe("1");
    expect(obligations.qualityObligations[0]?.object).toMatchObject({
      id: "quality-1",
      status: "unanswered"
    });
    expect(obligations.projection.version).toBe("1");
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

  it("creates scoped short-lived WebGET sessions and uses no-store endpoint headers", async () => {
    let now = 1_000;
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetClock: () => now,
      webgetTokenGenerator: createTokenGenerator()
    });
    const first = await createWebGETBatch(daemonApp, { ttlMs: 100 });
    const second = await createWebGETBatch(daemonApp, { ttlMs: 1_000 });
    const firstToken = tokenFromStartUrl(first.webget.startUrl);
    const secondToken = tokenFromStartUrl(second.webget.startUrl);

    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(secondToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(firstToken).not.toBe(secondToken);

    const startResponse = await daemonApp.app.request(first.webget.startPath);
    const startText = await startResponse.text();

    expect(startResponse.status).toBe(200);
    expectNoStore(startResponse);
    expect(startText).toContain(first.sessionId);
    expect(startText).not.toContain(firstToken);
    expect(startText).not.toContain(second.sessionId);

    const contextResponse = await daemonApp.app.request(webgetPath(first.webget.startUrl, "/context/overview"));
    const contextText = await contextResponse.text();

    expect(contextResponse.status).toBe(200);
    expectNoStore(contextResponse);
    expect(contextText).toContain(first.sessionId);
    expect(contextText).not.toContain(firstToken);
    expect(contextText).not.toContain(second.sessionId);

    now = 1_101;

    const expiredResponse = await daemonApp.app.request(first.webget.startPath);
    const expiredText = await expiredResponse.clone().text();

    expectNoStore(expiredResponse);
    expect(expiredText).not.toContain(firstToken);
    await expectWebGETError(expiredResponse, "expired_token");
  });

  it("WebGET context redacts unrevealed sealed contribution payloads", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetTokenGenerator: createTokenGenerator()
    });
    const { sessionId, batchId } = await createWebGETBatch(daemonApp);
    const contributionResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/batches/${batchId}/contributions`,
      {
        authorId: "participant-1",
        payload: {
          secretNote: "sealed payload must stay hidden"
        }
      }
    );
    const webget = daemonApp.createWebGETSession({
      sessionId,
      batchId,
      participantId: "participant-web"
    });
    const contextResponse = await daemonApp.app.request(webgetPath(webget.startUrl, "/context/events"));
    const contextText = await contextResponse.text();

    expect(contributionResponse.status).toBe(201);
    expect(contextResponse.status).toBe(200);
    expectNoStore(contextResponse);
    expect(contextText).toContain("redacted");
    expect(contextText).toContain("Sealed contribution payload is hidden until reveal.");
    expect(contextText).not.toContain("sealed payload must stay hidden");
  });

  it("WebGET resource endpoint plans url, base64, and none delivery without leaking metadata material", async () => {
    const resourceBroker = new InMemoryResourceBroker();
    const publicResource = resourceBroker.registerResource({
      resource: publicUrlResource()
    });
    const sensitiveResource = resourceBroker.registerResource({
      resource: sensitiveUrlResource()
    });
    const b64Resource = resourceBroker.registerResource({
      resource: base64Resource(),
      contents: [
        {
          dataRef: "base64-ref",
          base64: Buffer.from("hello world").toString("base64")
        }
      ]
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      resourceBroker,
      webgetTokenGenerator: createTokenGenerator()
    });
    const noUrl = await createWebGETBatch(daemonApp, {
      resourceIds: [publicResource.id]
    });
    const allowedUrl = await createWebGETBatch(daemonApp, {
      resourceIds: [publicResource.id],
      resourcePolicy: {
        requestedMode: "url",
        allowPublicUrl: true
      }
    });
    const allowedBase64 = await createWebGETBatch(daemonApp, {
      resourceIds: [b64Resource.id],
      resourcePolicy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 64
      }
    });
    const sensitive = await createWebGETBatch(daemonApp, {
      resourceIds: [sensitiveResource.id],
      resourcePolicy: {
        requestedMode: "url",
        allowPublicUrl: true,
        allowBase64: true,
        maxBase64SizeBytes: 64
      }
    });

    const deniedUrlResponse = await daemonApp.app.request(
      webgetPath(noUrl.webget.startUrl, `/resources/${publicResource.id}`)
    );
    const deniedUrlText = await deniedUrlResponse.text();
    const deniedUrl = JSON.parse(deniedUrlText) as { delivery: { selectedMode: string; allowed: boolean } };

    expectNoStore(deniedUrlResponse);
    expect(deniedUrl.delivery).toMatchObject({
      selectedMode: "none",
      allowed: false
    });
    expect(deniedUrlText).not.toContain("https://example.com/resource.txt");

    const allowedUrlBody = (await (
      await daemonApp.app.request(webgetPath(allowedUrl.webget.startUrl, `/resources/${publicResource.id}`))
    ).json()) as { delivery: { selectedMode: string; allowed: boolean; delivery?: { url?: string } } };

    expect(allowedUrlBody.delivery).toMatchObject({
      selectedMode: "url",
      allowed: true,
      delivery: {
        url: "https://example.com/resource.txt"
      }
    });

    const allowedBase64Body = (await (
      await daemonApp.app.request(webgetPath(allowedBase64.webget.startUrl, `/resources/${b64Resource.id}`))
    ).json()) as { delivery: { selectedMode: string; allowed: boolean; delivery?: { data?: string } } };

    expect(allowedBase64Body.delivery).toMatchObject({
      selectedMode: "base64",
      allowed: true,
      delivery: {
        data: Buffer.from("hello world").toString("base64")
      }
    });

    const sensitiveResponse = await daemonApp.app.request(
      webgetPath(sensitive.webget.startUrl, `/resources/${sensitiveResource.id}`)
    );
    const sensitiveText = await sensitiveResponse.text();
    const sensitiveBody = JSON.parse(sensitiveText) as { delivery: { selectedMode: string; allowed: boolean } };

    expect(sensitiveBody.delivery).toMatchObject({
      selectedMode: "none",
      allowed: false
    });
    expect(sensitiveText).not.toContain("api_key");
    expect(sensitiveText).not.toContain("secret-value");
    expect(sensitiveText).not.toContain("/Users/");
  });

  it("WebGET submit validates canonical base64url chunks and append nothing by itself", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetTokenGenerator: createTokenGenerator()
    });
    const { sessionId, webget } = await createWebGETBatch(daemonApp);
    const initialEventCount = daemonApp.eventStore.listEvents(sessionId).length;
    const submitPath = webgetPath(webget.startUrl, "/submit");
    const validChunk = Buffer.from('{"output":true}').toString("base64url");

    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=1&total=1&encoding=utf8&data=${validChunk}`),
      "invalid_encoding"
    );
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=0&total=1&encoding=base64url&data=${validChunk}`),
      "invalid_seq"
    );
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=2&total=1&encoding=base64url&data=${validChunk}`),
      "invalid_sequence"
    );
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=1&total=65&encoding=base64url&data=${validChunk}`),
      "too_many_chunks"
    );
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=1&total=1&encoding=base64url&data=not=base64`),
      "invalid_data"
    );
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=1&total=1&encoding=base64url&data=secret`),
      "unsafe_query"
    );
    await expectWebGETError(
      await daemonApp.app.request(
        `${submitPath}?seq=1&total=1&encoding=base64url&data=${Buffer.from('{"output":"sk-decoded123"}').toString("base64url")}`
      ),
      "unsafe_submission"
    );

    const oversizedChunk = Buffer.alloc(16 * 1024 + 1, "x").toString("base64url");
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=1&total=1&encoding=base64url&data=${oversizedChunk}`),
      "chunk_too_large"
    );

    const accepted = await daemonApp.app.request(
      `${submitPath}?seq=1&total=2&encoding=base64url&data=${validChunk}`
    );
    expect(accepted.status).toBe(200);
    expectNoStore(accepted);
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=1&total=2&encoding=base64url&data=${Buffer.from("{}").toString("base64url")}`),
      "duplicate_chunk"
    );
    await expectWebGETError(
      await daemonApp.app.request(`${submitPath}?seq=2&total=3&encoding=base64url&data=${validChunk}`),
      "invalid_total"
    );
    expect(daemonApp.eventStore.listEvents(sessionId)).toHaveLength(initialEventCount);
  });

  it("WebGET commit rejects unsafe content after chunk reassembly and parsed JSON without append or SSE", async () => {
    const reassembledDaemon = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetTokenGenerator: createTokenGenerator(["N".repeat(32)])
    });
    const reassembled = await createWebGETBatch(reassembledDaemon);
    const reassembledReceived: unknown[] = [];
    const unsubscribeReassembled = reassembledDaemon.eventBus.subscribe(reassembled.sessionId, (event) => {
      reassembledReceived.push(event);
    });
    const splitJson = JSON.stringify(
      webgetSubmission({
        output: {
          token: "sk-decoded123"
        }
      })
    );
    const splitAt = splitJson.indexOf("sk-") + "sk-".length;
    const splitBytes = Buffer.from(splitJson, "utf8");
    const splitEncoded = {
      chunks: [
        splitBytes.subarray(0, splitAt).toString("base64url"),
        splitBytes.subarray(splitAt).toString("base64url")
      ],
      length: splitBytes.byteLength,
      sha256: createHash("sha256").update(splitBytes).digest("hex")
    };

    await submitWebGETChunks(reassembledDaemon, reassembled.webget.startUrl, splitEncoded.chunks);
    const reassembledResponse = await commitWebGET(
      reassembledDaemon,
      reassembled.webget.startUrl,
      splitEncoded.chunks.length,
      splitEncoded.sha256,
      splitEncoded.length
    );
    const reassembledText = await reassembledResponse.clone().text();

    await expectWebGETError(reassembledResponse, "unsafe_submission");
    expect(reassembledText).not.toContain("sk-decoded123");
    expect(reassembledDaemon.eventStore.listEvents(reassembled.sessionId)).toHaveLength(2);
    expect(reassembledReceived).toEqual([]);
    unsubscribeReassembled();

    const parsedDaemon = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetTokenGenerator: createTokenGenerator(["O".repeat(32)])
    });
    const parsed = await createWebGETBatch(parsedDaemon);
    const parsedReceived: unknown[] = [];
    const unsubscribeParsed = parsedDaemon.eventBus.subscribe(parsed.sessionId, (event) => {
      parsedReceived.push(event);
    });
    const escapedSecretJson = JSON.stringify(webgetSubmission({ output: "placeholder" })).replace(
      '"placeholder"',
      '"\\u0073\\u0065\\u0063\\u0072\\u0065\\u0074"'
    );
    const escapedEncoded = encodeWebGETSubmissionJson(escapedSecretJson);

    await submitWebGETChunks(parsedDaemon, parsed.webget.startUrl, escapedEncoded.chunks);
    const parsedResponse = await commitWebGET(
      parsedDaemon,
      parsed.webget.startUrl,
      escapedEncoded.chunks.length,
      escapedEncoded.sha256,
      escapedEncoded.length
    );
    const parsedText = await parsedResponse.clone().text();

    await expectWebGETError(parsedResponse, "unsafe_submission");
    expect(parsedText).not.toContain("secret");
    expect(parsedText).not.toContain("\\u0073");
    expect(parsedDaemon.eventStore.listEvents(parsed.sessionId)).toHaveLength(2);
    expect(parsedReceived).toEqual([]);
    unsubscribeParsed();
  });

  it("WebGET commit rejects incomplete, malformed, mismatched, oversized, and expired submissions without append", async () => {
    const makeDaemon = () =>
      createDaemonApp({
        idGenerator: createIds(),
        clock,
        webgetTokenGenerator: createTokenGenerator([
          "D".repeat(32),
          "E".repeat(32),
          "F".repeat(32),
          "G".repeat(32),
          "H".repeat(32),
          "I".repeat(32)
        ])
      });

    const missingDaemon = makeDaemon();
    const missing = await createWebGETBatch(missingDaemon);
    const missingCount = missingDaemon.eventStore.listEvents(missing.sessionId).length;
    await expectWebGETError(
      await commitWebGET(missingDaemon, missing.webget.startUrl, 1, "0".repeat(64), 0),
      "missing_chunks"
    );
    expect(missingDaemon.eventStore.listEvents(missing.sessionId)).toHaveLength(missingCount);

    const malformedDaemon = makeDaemon();
    const malformed = await createWebGETBatch(malformedDaemon);
    const malformedBytes = Buffer.from("not-json", "utf8");
    const malformedEncoded = {
      chunks: [malformedBytes.toString("base64url")],
      length: malformedBytes.byteLength,
      sha256: createHash("sha256").update(malformedBytes).digest("hex")
    };
    await submitWebGETChunks(malformedDaemon, malformed.webget.startUrl, malformedEncoded.chunks);
    await expectWebGETError(
      await commitWebGET(
        malformedDaemon,
        malformed.webget.startUrl,
        malformedEncoded.chunks.length,
        malformedEncoded.sha256,
        malformedEncoded.length
      ),
      "invalid_json"
    );
    expect(malformedDaemon.eventStore.listEvents(malformed.sessionId)).toHaveLength(2);

    const noReportDaemon = makeDaemon();
    const noReport = await createWebGETBatch(noReportDaemon);
    const noReportEncoded = encodeWebGETSubmission({
      output: "missing read report",
      contextCompleteness: {
        status: "unknown",
        notes: []
      }
    });
    await submitWebGETChunks(noReportDaemon, noReport.webget.startUrl, noReportEncoded.chunks);
    await expectWebGETError(
      await commitWebGET(
        noReportDaemon,
        noReport.webget.startUrl,
        noReportEncoded.chunks.length,
        noReportEncoded.sha256,
        noReportEncoded.length
      ),
      "invalid_submission"
    );
    expect(noReportDaemon.eventStore.listEvents(noReport.sessionId)).toHaveLength(2);

    const mismatchDaemon = makeDaemon();
    const mismatch = await createWebGETBatch(mismatchDaemon);
    const mismatchEncoded = encodeWebGETSubmission(webgetSubmission());
    await submitWebGETChunks(mismatchDaemon, mismatch.webget.startUrl, mismatchEncoded.chunks);
    await expectWebGETError(
      await commitWebGET(
        mismatchDaemon,
        mismatch.webget.startUrl,
        mismatchEncoded.chunks.length,
        "1".repeat(64),
        mismatchEncoded.length
      ),
      "invalid_hash"
    );
    await expectWebGETError(
      await commitWebGET(
        mismatchDaemon,
        mismatch.webget.startUrl,
        mismatchEncoded.chunks.length,
        mismatchEncoded.sha256,
        mismatchEncoded.length + 1
      ),
      "invalid_length"
    );
    expect(mismatchDaemon.eventStore.listEvents(mismatch.sessionId)).toHaveLength(2);

    let now = 0;
    const expiredDaemon = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetClock: () => now,
      webgetTokenGenerator: createTokenGenerator(["J".repeat(32)])
    });
    const expired = await createWebGETBatch(expiredDaemon, { ttlMs: 1 });
    const expiredEncoded = encodeWebGETSubmission(webgetSubmission());
    await submitWebGETChunks(expiredDaemon, expired.webget.startUrl, expiredEncoded.chunks);
    now = 2;
    await expectWebGETError(
      await commitWebGET(
        expiredDaemon,
        expired.webget.startUrl,
        expiredEncoded.chunks.length,
        expiredEncoded.sha256,
        expiredEncoded.length
      ),
      "expired_token"
    );
    expect(expiredDaemon.eventStore.listEvents(expired.sessionId)).toHaveLength(2);
  });

  it("WebGET commit appends through sealed contribution lifecycle, records audit metadata, and publishes SSE only on success", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetTokenGenerator: createTokenGenerator()
    });
    const { sessionId, webget } = await createWebGETBatch(daemonApp);
    const token = tokenFromStartUrl(webget.startUrl);
    const received: Array<{ type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(sessionId, (event) => {
      received.push({
        type: event.type
      });
    });

    await expectWebGETError(
      await commitWebGET(daemonApp, webget.startUrl, 1, "0".repeat(64), 0),
      "missing_chunks"
    );
    expect(received).toEqual([]);

    const response = await submitAndCommitWebGET(daemonApp, webget.startUrl);
    const responseText = await response.text();
    const body = JSON.parse(responseText) as {
      committed: boolean;
      event: {
        type: string;
        visibility: string;
        payload: {
          kind: string;
          submission: unknown;
          audit: {
            participantId: string;
            decodedLength: number;
            sha256: string;
            resourceAccessReports: unknown[];
          };
        };
      };
    };

    expect(response.status).toBe(201);
    expectNoStore(response);
    expect(responseText).not.toContain(token);
    expect(body.committed).toBe(true);
    expect(body.event).toMatchObject({
      type: "sealed_contribution_submitted",
      visibility: "sealed",
      payload: {
        kind: "webget_committed_submission",
        submission: expect.objectContaining({
          output: {
            contribution: "webget output"
          },
          readReport: expect.objectContaining({
            submissionMode: "chunked_get"
          }),
          contextCompleteness: expect.objectContaining({
            status: "partial"
          })
        }),
        audit: expect.objectContaining({
          participantId: "participant-web",
          resourceAccessReports: []
        })
      }
    });
    expect(received).toEqual([
      {
        type: "sealed_contribution_submitted"
      }
    ]);

    const eventCountAfterSuccess = daemonApp.eventStore.listEvents(sessionId).length;
    await expectWebGETError(
      await commitWebGET(daemonApp, webget.startUrl, 1, "0".repeat(64), 0),
      "already_committed"
    );
    expect(daemonApp.eventStore.listEvents(sessionId)).toHaveLength(eventCountAfterSuccess);
    unsubscribe();
  });

  it("WebGET commit finalization does not fail if the token expires after successful append", async () => {
    let now = 0;
    let expireDuringAppend = false;
    const nextId = createIds();
    const daemonApp = createDaemonApp({
      idGenerator: () => {
        const id = nextId();
        if (expireDuringAppend) {
          now = 2;
        }
        return id;
      },
      clock,
      webgetClock: () => now,
      webgetTokenGenerator: createTokenGenerator(["P".repeat(32)])
    });
    const { sessionId, webget } = await createWebGETBatch(daemonApp, { ttlMs: 1 });
    const received: Array<{ type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(sessionId, (event) => {
      received.push({
        type: event.type
      });
    });
    const encoded = encodeWebGETSubmission(webgetSubmission());

    await submitWebGETChunks(daemonApp, webget.startUrl, encoded.chunks);
    expireDuringAppend = true;

    const response = await commitWebGET(
      daemonApp,
      webget.startUrl,
      encoded.chunks.length,
      encoded.sha256,
      encoded.length
    );
    const body = (await response.json()) as { committed: boolean; event: { type: string } };

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      committed: true,
      event: {
        type: "sealed_contribution_submitted"
      }
    });
    expect(daemonApp.eventStore.listEvents(sessionId)).toHaveLength(3);
    expect(received).toEqual([
      {
        type: "sealed_contribution_submitted"
      }
    ]);

    const countAfterSuccess = daemonApp.eventStore.listEvents(sessionId).length;
    const duplicateResponse = await commitWebGET(
      daemonApp,
      webget.startUrl,
      encoded.chunks.length,
      encoded.sha256,
      encoded.length
    );
    expect(duplicateResponse.status).toBe(400);
    expect(daemonApp.eventStore.listEvents(sessionId)).toHaveLength(countAfterSuccess);
    unsubscribe();
  });

  it("WebGET commit fails without append for missing, revealed, or unauthorized target batches", async () => {
    const makeDaemon = () =>
      createDaemonApp({
        idGenerator: createIds(),
        clock,
        webgetTokenGenerator: createTokenGenerator(["K".repeat(32), "L".repeat(32), "M".repeat(32)])
      });

    const missingDaemon = makeDaemon();
    const { sessionId: missingSessionId } = await createSession(missingDaemon);
    const missingWebGET = missingDaemon.createWebGETSession({
      sessionId: missingSessionId,
      batchId: "missing-batch",
      participantId: "participant-web"
    });
    await expectWebGETError(
      await submitAndCommitWebGET(missingDaemon, missingWebGET.startUrl),
      "webget_request_failed"
    );
    expect(missingDaemon.eventStore.listEvents(missingSessionId)).toHaveLength(1);

    const revealedDaemon = makeDaemon();
    const revealed = await createWebGETBatch(revealedDaemon);
    const closeResponse = await postJson(
      revealedDaemon.app,
      `/sessions/${revealed.sessionId}/batches/${revealed.batchId}/close`,
      {}
    );
    expect(closeResponse.status).toBe(201);
    const revealedCount = revealedDaemon.eventStore.listEvents(revealed.sessionId).length;
    await expectWebGETError(
      await submitAndCommitWebGET(revealedDaemon, revealed.webget.startUrl),
      "webget_request_failed"
    );
    expect(revealedDaemon.eventStore.listEvents(revealed.sessionId)).toHaveLength(revealedCount);

    const unauthorizedDaemon = makeDaemon();
    const unauthorized = await createWebGETBatch(unauthorizedDaemon, {
      participantIds: ["allowed-participant"],
      participantId: "participant-web"
    });
    const unauthorizedCount = unauthorizedDaemon.eventStore.listEvents(unauthorized.sessionId).length;
    await expectWebGETError(
      await submitAndCommitWebGET(unauthorizedDaemon, unauthorized.webget.startUrl),
      "webget_request_failed"
    );
    expect(unauthorizedDaemon.eventStore.listEvents(unauthorized.sessionId)).toHaveLength(unauthorizedCount);
  });

  it("does not export forbidden semantic or integration surfaces", () => {
    const exportedNames = Object.keys(daemon);
    const forbiddenTerms = [
      "Adapter",
      "OpenAI",
      "MCP",
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
