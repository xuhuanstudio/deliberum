import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  OpenAICompatibleAdapterError,
  type FetchLike,
  type OpenAICompatibleFetchInit
} from "@deliberum/adapters";
import { InMemoryResourceBroker } from "@deliberum/resources";
import {
  AdapterRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  ProposalReviewGeneratorRegistry,
  type ExtractionContext,
  type ExtractionGenerator,
  type ExtractionGeneratorResult,
  type FinalAuditGenerator,
  type FinalAuditGeneratorResult,
  type FinalCandidateGenerator,
  type FinalCandidateGeneratorResult,
  type FinalizationContext,
  type ProposalReviewGenerator,
  type ProposalReviewGeneratorResult,
  type RegisteredParticipantAdapter
} from "@deliberum/orchestrator";
import {
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  DAEMON_CORS_ORIGINS_ENV_VAR,
  DEFAULT_DAEMON_CORS_ORIGINS,
  OPENAI_COMPATIBLE_ADAPTER_ID,
  OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
  OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
  OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
  OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR,
  OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
  OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_AUDITOR_ID,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR,
  OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR,
  OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR,
  OPENAI_COMPATIBLE_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR,
  OPENAI_COMPATIBLE_PROFILE_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEWER_ID,
  OPENAI_COMPATIBLE_STREAM_ENV_VAR,
  OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR,
  OPENAI_COMPATIBLE_THINKING_ENV_VAR,
  OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR,
  OPENAI_COMPATIBLE_TOP_P_ENV_VAR,
  createDaemonApp,
  createOpenAICompatibleRunRegistries,
  localPresetRunPlan,
  localPresetStartRequest,
  parseDaemonCorsOriginsFromEnv,
  resolveStartDaemonEnableOpenAICompatibleExtraction,
  resolveStartDaemonEnableOpenAICompatibleFinalization,
  resolveStartDaemonEnableOpenAICompatibleProfile,
  resolveStartDaemonEnableOpenAICompatibleReview,
  resolveStartDaemonEnableLocalPreset,
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

type SseFrame = {
  event?: string;
  id?: string;
  data?: unknown;
  raw: string;
};

async function readSseFramesUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (frames: readonly SseFrame[]) => boolean,
  timeoutMs = 1000
): Promise<SseFrame[]> {
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  const frames: SseFrame[] = [];
  let buffer = "";

  while (Date.now() < deadline) {
    const remainingMs = Math.max(deadline - Date.now(), 1);
    const readResult = await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), remainingMs);
      })
    ]);

    if (readResult === "timeout" || readResult.done) {
      break;
    }

    buffer += decoder.decode(readResult.value, { stream: true });

    for (;;) {
      const boundary = findSseFrameBoundary(buffer);
      if (!boundary) {
        break;
      }

      const rawFrame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);

      if (rawFrame.trim().length > 0) {
        frames.push(parseSseFrame(rawFrame));
      }
    }

    if (predicate(frames)) {
      return frames;
    }
  }

  throw new Error("Timed out waiting for SSE frames.");
}

function findSseFrameBoundary(buffer: string): { index: number; length: number } | undefined {
  const lfIndex = buffer.indexOf("\n\n");
  const crlfIndex = buffer.indexOf("\r\n\r\n");

  if (lfIndex === -1 && crlfIndex === -1) {
    return undefined;
  }

  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
    return {
      index: crlfIndex,
      length: 4
    };
  }

  return {
    index: lfIndex,
    length: 2
  };
}

function parseSseFrame(raw: string): SseFrame {
  const frame: SseFrame = {
    raw
  };
  const dataLines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      frame.event = line.slice("event:".length).trimStart();
      continue;
    }

    if (line.startsWith("id:")) {
      frame.id = line.slice("id:".length).trimStart();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length > 0) {
    frame.data = JSON.parse(dataLines.join("\n"));
  }

  return frame;
}

function parseSseFramesText(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  let buffer = text;

  for (;;) {
    const boundary = findSseFrameBoundary(buffer);
    if (!boundary) {
      break;
    }

    const rawFrame = buffer.slice(0, boundary.index);
    buffer = buffer.slice(boundary.index + boundary.length);

    if (rawFrame.trim().length > 0) {
      frames.push(parseSseFrame(rawFrame));
    }
  }

  return frames;
}

function sseEventData(frames: readonly SseFrame[]): Record<string, unknown>[] {
  return frames.map((frame) => frame.data).filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function orchestratedRunPlan(
  options: { providerConfig?: boolean; revealPolicy?: "all_completed" | "manual" } = {}
) {
  return {
    title: "Daemon run orchestration",
    topic: "Should Deliberum expose run orchestration through the local daemon?",
    goals: ["Exercise the completed local orchestration pipeline."],
    constraints: ["Keep the daemon as a transport and control surface."],
    participants: [
      {
        id: "participant-cli",
        kind: "model",
        displayName: "CLI-first participant",
        adapterId: "fake-cli",
        ...(options.providerConfig ? { providerConfigId: "provider-cli" } : {})
      },
      {
        id: "participant-web",
        kind: "model",
        displayName: "Web-first participant",
        adapterId: "fake-web"
      }
    ],
    providerConfigs: options.providerConfig
      ? [
          {
            id: "provider-cli",
            adapterId: "fake-cli",
            providerConfigId: "provider-cli",
            modelId: "fake-model",
            baseUrl: "http://127.0.0.1:11434",
            apiKeyEnvVar: "DELIBERUM_TEST_API_KEY",
            timeoutMs: 1000
          }
        ]
      : [],
    budget: {
      maxEvents: 80,
      maxProviderCalls: 20
    },
    timeouts: {
      participantMs: 1000,
      overallMs: 30000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: ["Return provisional outcome material only."]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: options.revealPolicy ?? "all_completed",
      participantIds: ["participant-cli", "participant-web"]
    }
  };
}

function openAICompatibleRunPlan() {
  return {
    title: "OpenAI-compatible sealed divergence",
    topic: "Should Stage 22A expose opt-in provider-backed sealed participants?",
    goals: ["Exercise provider-backed sealed divergence through daemon and orchestrator."],
    constraints: ["Resolve provider keys from daemon env only."],
    participants: [
      {
        id: "provider-alpha",
        kind: "model",
        displayName: "Provider alpha",
        adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
        providerConfigId: "provider-openai-compatible"
      }
    ],
    providerConfigs: [
      {
        id: "provider-openai-compatible",
        adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
        providerConfigId: "provider-openai-compatible",
        modelId: "runtime-model",
        baseUrl: "https://runtime.example/api",
        endpointPath: "/chat/completions",
        apiKeyEnvVar: OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
        timeoutMs: 1000
      }
    ],
    budget: {
      maxEvents: 20,
      maxProviderCalls: 4
    },
    timeouts: {
      participantMs: 1000,
      overallMs: 30000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: ["Return contribution material only."]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["provider-alpha"]
    }
  };
}

function openAICompatibleExtractionRunPlan() {
  const plan = localPresetRunPlan();

  return {
    ...plan,
    title: "OpenAI-compatible extraction run",
    providerConfigs: [
      {
        id: OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
        adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
        providerConfigId: OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
        modelId: "runtime-model",
        baseUrl: "https://runtime.example/api",
        endpointPath: "/chat/completions",
        apiKeyEnvVar: OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
        timeoutMs: 1000
      }
    ]
  };
}

function openAICompatibleExtractionStartRequest() {
  const request = localPresetStartRequest();

  return {
    ...request,
    extraction: {
      generatorIds: [OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID]
    }
  };
}

function openAICompatibleReviewStartRequest() {
  const request = localPresetStartRequest();

  return {
    ...request,
    review: {
      reviewerIds: [OPENAI_COMPATIBLE_REVIEWER_ID],
      acceptancePolicy: {
        mode: "all_generated_unchallenged",
        authorId: "provider-review-coordinator",
        rationale:
          "Accept unchallenged proposals after provider-backed review for this local test."
      }
    }
  };
}

function openAICompatibleFinalizationStartRequest() {
  const request = localPresetStartRequest();

  return {
    ...request,
    finalization: {
      finalCandidateGeneratorId: OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID,
      auditGeneratorIds: [OPENAI_COMPATIBLE_FINAL_AUDITOR_ID],
      compileOutcome: true
    }
  };
}

function openAICompatibleFinalizationRunPlan() {
  const plan = localPresetRunPlan();

  return {
    ...plan,
    title: "OpenAI-compatible finalization run",
    providerConfigs: [
      {
        id: "final-candidate-provider",
        adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
        providerConfigId: "final-candidate-provider",
        modelId: "final-candidate-runtime-model",
        baseUrl: "https://final-candidate-runtime.example/api",
        endpointPath: "/chat/completions",
        apiKeyEnvVar: OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
        timeoutMs: 1000
      },
      {
        id: "final-audit-provider",
        adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
        providerConfigId: "final-audit-provider",
        modelId: "final-audit-runtime-model",
        baseUrl: "https://final-audit-runtime.example/api",
        endpointPath: "/chat/completions",
        apiKeyEnvVar: OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
        timeoutMs: 1000
      }
    ]
  };
}

function startFullRunRequest() {
  return {
    sealedDivergence: {
      autoCloseManual: true
    },
    extraction: {
      generatorIds: ["fake-extractor"]
    },
    review: {
      reviewerIds: ["fake-reviewer"],
      acceptancePolicy: {
        mode: "all_generated_unchallenged",
        authorId: "review-coordinator",
        rationale: "Accept generated unchallenged proposals for this local daemon run."
      }
    },
    finalization: {
      finalCandidateGeneratorId: "fake-final",
      auditGeneratorIds: ["fake-auditor"],
      compileOutcome: true
    }
  };
}

async function createRun(
  daemonApp: DaemonApp,
  runPlan: unknown = orchestratedRunPlan()
): Promise<{ run: { runId: string; sessionId: string }; event: { type: string } }> {
  const response = await postJson(daemonApp.app, "/runs", {
    runPlan
  });

  expect(response.status).toBe(201);

  return (await response.json()) as {
    run: { runId: string; sessionId: string };
    event: { type: string };
  };
}

type MockedFetchLike = ReturnType<typeof vi.fn> & FetchLike;

function createOpenAICompatibleFetch(output = "provider sealed contribution"): MockedFetchLike {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: vi.fn(async () => ({
      choices: [
        {
          message: {
            content: output
          }
        }
      ]
    }))
  })) as unknown as MockedFetchLike;
}

function createOpenAICompatibleExtractionFetch(options: {
  content?: string;
  contents?: string[];
  contentTransform?: (content: string) => string;
  contentTransforms?: Array<(content: string) => string>;
  ok?: boolean;
  status?: number;
} = {}): MockedFetchLike {
  let callIndex = 0;

  return vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const currentCallIndex = callIndex;
    callIndex += 1;
    const contextPayload = findExtractionContextPayload(request.messages);
    const sourceEventId = contextPayload?.allowedSourceEventIds[0] ?? "missing-source";
    const generatedContent = JSON.stringify({
      candidates: [
        {
          id: "provider-extraction-candidate",
          title: "Provider-backed extraction proposal",
          description:
            "Use provider-backed extraction as proposal material while preserving review and acceptance boundaries.",
          sourceEventIds: [sourceEventId],
          status: "active",
          supportedBy: ["provider-extraction-claim"],
          attackedBy: [],
          qualityObligationIds: ["provider-extraction-quality"],
          assumptions: ["Provider extraction is explicitly enabled."],
          tradeoffs: ["Review and finalization remain deterministic local preset components."]
        }
      ],
      claims: [
        {
          id: "provider-extraction-claim",
          content:
            "Provider-backed extraction can summarize revealed contributions into traceable proposal material.",
          scope: "design",
          sourceEventIds: [sourceEventId],
          supports: ["provider-extraction-candidate"]
        }
      ],
      objections: [],
      evidenceNeeds: [],
      qualityObligations: [
        {
          id: "provider-extraction-quality",
          scope: "candidate",
          targetCandidateId: "provider-extraction-candidate",
          requirement: "Keep provider output as proposal material until reviewed and accepted.",
          status: "unanswered",
          sourceEventIds: [sourceEventId],
          supportingRefIds: ["provider-extraction-claim"],
          unresolvedObjectionIds: []
        }
      ],
      rationale:
        "Extract traceable provider proposal material from revealed local preset contributions."
    });
    const content = options.contents?.[currentCallIndex] ??
      options.contentTransforms?.[currentCallIndex]?.(generatedContent) ??
      options.content ??
      (options.contentTransform ? options.contentTransform(generatedContent) : generatedContent);

    return {
      ok: options.ok ?? true,
      status: options.status ?? 200,
      json: vi.fn(async () => ({
        choices: [
          {
            message: {
              content
            }
          }
        ]
      }))
    };
  }) as unknown as MockedFetchLike;
}

function findExtractionContextPayload(
  messages: Array<{ role: string; content: string }>
): { allowedSourceEventIds: string[] } | undefined {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    try {
      const parsed = JSON.parse(message.content) as {
        allowedSourceEventIds?: unknown;
      };

      if (Array.isArray(parsed.allowedSourceEventIds)) {
        return {
          allowedSourceEventIds: parsed.allowedSourceEventIds.filter(
            (eventId): eventId is string => typeof eventId === "string"
          )
        };
      }
    } catch {
      // Corrective retry messages are plain text and intentionally ignored here.
    }
  }

  return undefined;
}

function createOpenAICompatibleReviewFetch(options: {
  content?: string;
  contents?: string[];
  contentTransform?: (content: string) => string;
  contentTransforms?: Array<(content: string) => string>;
  ok?: boolean;
  status?: number;
} = {}): MockedFetchLike {
  let callIndex = 0;

  return vi.fn(async (_url, init) => {
    const currentCallIndex = callIndex;
    callIndex += 1;
    const generatedContent = JSON.stringify({
      challenges: [],
      notes: [
        "Provider-backed review leaves proposal material unchallenged for this mocked local test."
      ]
    });
    const content = options.contents?.[currentCallIndex] ??
      options.contentTransforms?.[currentCallIndex]?.(generatedContent) ??
      options.content ??
      (options.contentTransform ? options.contentTransform(generatedContent) : generatedContent);

    return {
      ok: options.ok ?? true,
      status: options.status ?? 200,
      json: vi.fn(async () => ({
        choices: [
          {
            message: {
              content
            }
          }
        ]
      }))
    };
  }) as unknown as MockedFetchLike;
}

function findReviewContextPayload(
  messages: Array<{ role: string; content: string }>
): { allowedProposalEventIds: string[] } | undefined {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    try {
      const parsed = JSON.parse(message.content) as {
        allowedProposalEventIds?: unknown;
      };

      if (Array.isArray(parsed.allowedProposalEventIds)) {
        return {
          allowedProposalEventIds: parsed.allowedProposalEventIds.filter(
            (eventId): eventId is string => typeof eventId === "string"
          )
        };
      }
    } catch {
      // Corrective retry messages are plain text and intentionally ignored here.
    }
  }

  return undefined;
}

function createOpenAICompatibleFinalizationFetch(options: {
  contents?: string[];
  contentTransforms?: Array<(content: string) => string>;
} = {}): MockedFetchLike {
  let callIndex = 0;

  return vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const currentCallIndex = callIndex;
    callIndex += 1;
    const generatedContent = findFinalCandidateContextPayload(request.messages)
      ? createOpenAICompatibleFinalCandidateContent(request.messages)
      : createOpenAICompatibleFinalAuditContent(request.messages);
    const content = options.contents?.[currentCallIndex] ??
      options.contentTransforms?.[currentCallIndex]?.(generatedContent) ??
      generatedContent;

    return {
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        choices: [
          {
            message: {
              content
            }
          }
        ]
      }))
    };
  }) as unknown as MockedFetchLike;
}

function createOpenAICompatibleFinalCandidateContent(
  messages: Array<{ role: string; content: string }>
): string {
  const contextPayload = findFinalCandidateContextPayload(messages);
  const candidateId = contextPayload?.allowedCandidateIds[0] ?? "missing-candidate";

  return JSON.stringify({
    candidateIds: [candidateId],
    recommendation:
      "Use provider-backed final candidate material as a provisional proposal.",
    applicabilityConditions: [
      "Only when OpenAI-compatible finalization is explicitly enabled."
    ],
    rationale:
      "The provider-selected candidate remains proposal material and is still recorded through finalization lifecycle APIs.",
    limitations: [
      "Provider output does not become an authoritative outcome."
    ]
  });
}

function createOpenAICompatibleFinalAuditContent(
  messages: Array<{ role: string; content: string }>
): string {
  const contextPayload = findFinalAuditContextPayload(messages);

  return JSON.stringify({
    findings: ["Provider-backed final audit recorded limitations only."],
    risks: ["The compiled outcome remains provisional."],
    unresolvedObjectionIds: contextPayload?.allowedUnresolvedObjectionIds ?? [],
    qualityObligationIds: contextPayload?.allowedQualityObligationIds ?? [],
    evidenceNeedIds: contextPayload?.allowedEvidenceNeedIds ?? [],
    omissions: ["No real provider smoke is performed in this mocked test."],
    compressionProblems: [],
    limitations: ["Final audit output is not audit authority."],
    continuationSuggestions: ["Run an explicit real-provider smoke stage later."]
  });
}

function findFinalCandidateContextPayload(
  messages: Array<{ role: string; content: string }>
): { allowedCandidateIds: string[] } | undefined {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    try {
      const parsed = JSON.parse(message.content) as {
        allowedCandidateIds?: unknown;
      };

      if (Array.isArray(parsed.allowedCandidateIds)) {
        return {
          allowedCandidateIds: parsed.allowedCandidateIds.filter(
            (candidateId): candidateId is string => typeof candidateId === "string"
          )
        };
      }
    } catch {
      // Corrective retry messages are plain text and intentionally ignored here.
    }
  }

  return undefined;
}

function findFinalAuditContextPayload(
  messages: Array<{ role: string; content: string }>
): {
  allowedUnresolvedObjectionIds: string[];
  allowedQualityObligationIds: string[];
  allowedEvidenceNeedIds: string[];
} | undefined {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    try {
      const parsed = JSON.parse(message.content) as {
        allowedUnresolvedObjectionIds?: unknown;
        allowedQualityObligationIds?: unknown;
        allowedEvidenceNeedIds?: unknown;
      };

      if (
        Array.isArray(parsed.allowedUnresolvedObjectionIds) &&
        Array.isArray(parsed.allowedQualityObligationIds) &&
        Array.isArray(parsed.allowedEvidenceNeedIds)
      ) {
        return {
          allowedUnresolvedObjectionIds: parsed.allowedUnresolvedObjectionIds.filter(
            (id): id is string => typeof id === "string"
          ),
          allowedQualityObligationIds: parsed.allowedQualityObligationIds.filter(
            (id): id is string => typeof id === "string"
          ),
          allowedEvidenceNeedIds: parsed.allowedEvidenceNeedIds.filter(
            (id): id is string => typeof id === "string"
          )
        };
      }
    } catch {
      // Corrective retry messages are plain text and intentionally ignored here.
    }
  }

  return undefined;
}

function getOpenAICompatibleFetchCall(
  fetch: MockedFetchLike,
  index = 0
): [string, OpenAICompatibleFetchInit] {
  const call = fetch.mock.calls[index] as [string, OpenAICompatibleFetchInit] | undefined;

  if (!call) {
    throw new Error("Expected mocked OpenAI-compatible fetch to be called.");
  }

  return call;
}

function createRunDaemon(options: {
  providerSecret?: string;
  resourceBroker?: InMemoryResourceBroker;
  slowAdapter?: {
    adapterId: "fake-cli" | "fake-web";
    resolve: (resolvePayload: () => void) => void;
    onCall?: () => void;
  };
} = {}): DaemonApp {
  return createDaemonApp({
    idGenerator: createIds(),
    clock,
    resourceBroker: options.resourceBroker,
    runEnv: options.providerSecret
      ? {
          DELIBERUM_TEST_API_KEY: options.providerSecret
        }
      : undefined,
    runAdapterRegistry: new AdapterRegistry([
      createParticipantAdapter("fake-cli", {
        position: "Expose the run API after orchestrator hardening.",
        reason: "The local daemon can control execution without owning semantic state."
      }, options.slowAdapter?.adapterId === "fake-cli" ? options.slowAdapter : undefined),
      createParticipantAdapter("fake-web", {
        position: "Keep Web integration deferred.",
        reason: "Stage 20A should stay local daemon-only."
      }, options.slowAdapter?.adapterId === "fake-web" ? options.slowAdapter : undefined)
    ]),
    runExtractionGeneratorRegistry: new ExtractionGeneratorRegistry([
      createExtractionGenerator()
    ]),
    runProposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([
      createProposalReviewer()
    ]),
    runFinalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry([
      createFinalCandidateGenerator()
    ]),
    runFinalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([
      createFinalAuditGenerator()
    ])
  });
}

function createParticipantAdapter(
  adapterId: string,
  payload: Record<string, string>,
  slow?: {
    resolve: (resolvePayload: () => void) => void;
    onCall?: () => void;
  }
): RegisteredParticipantAdapter {
  const capabilities = {
    input: {
      text: true,
      markdown: true,
      json: true,
      imageUrl: false,
      imageBase64: false,
      pdfUrl: false,
      fileUrl: false,
      webBrowsing: false
    },
    output: {
      structuredJson: true,
      markdown: true,
      streaming: false,
      manualPaste: false
    },
    limits: {},
    reliability: "high" as const
  };

  return {
    adapterId,
    capabilities,
    async prepareContribution(_input, context) {
      slow?.onCall?.();

      if (slow) {
        await new Promise<void>((resolve) => {
          slow.resolve(resolve);
        });
      }

      return {
        payload: {
          ...payload,
          participantId: context.participantId
        },
        adapterId,
        participantId: context.participantId,
        capabilities,
        contextCompleteness: {
          status: "complete",
          notes: []
        },
        warnings: []
      };
    }
  };
}

function createExtractionGenerator(): ExtractionGenerator {
  return {
    generatorId: "fake-extractor",
    generateExtractionProposal(_input, context) {
      return createExtractionResult(context);
    }
  };
}

function createExtractionResult(context: ExtractionContext): ExtractionGeneratorResult {
  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];

  return {
    candidates: [
      {
        id: "candidate-daemon-run-api",
        title: "Expose local daemon run orchestration API",
        description: "Expose the completed orchestrator pipeline through safe local daemon routes.",
        sourceEventIds,
        status: "active",
        supportedBy: ["claim-daemon-control-surface"],
        attackedBy: ["objection-daemon-authority-risk"],
        qualityObligationIds: ["quality-daemon-safe-view"],
        assumptions: ["The EventStore remains the append-only source of truth."],
        tradeoffs: ["CLI and Web run work remains deferred."]
      }
    ],
    claims: [
      {
        id: "claim-daemon-control-surface",
        content: "The daemon can start orchestrator stages without becoming semantic authority.",
        scope: "design",
        sourceEventIds,
        supports: ["candidate-daemon-run-api"]
      }
    ],
    objections: [
      {
        id: "objection-daemon-authority-risk",
        targetId: "candidate-daemon-run-api",
        failureMode: "A transport layer could accidentally expose authority-like fields.",
        consequence: "Safe views must omit authority-only answer semantics.",
        severityClaim: "major",
        status: "open",
        sourceEventIds,
        responses: []
      }
    ],
    qualityObligations: [
      {
        id: "quality-daemon-safe-view",
        scope: "candidate",
        targetCandidateId: "candidate-daemon-run-api",
        requirement: "Run API responses must expose safe operational state only.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: ["claim-daemon-control-surface"],
        unresolvedObjectionIds: ["objection-daemon-authority-risk"]
      }
    ],
    rationale: "Extract traceable proposal material from revealed participant contributions."
  };
}

function createProposalReviewer(): ProposalReviewGenerator {
  return {
    reviewerId: "fake-reviewer",
    reviewProposals(): ProposalReviewGeneratorResult {
      return {
        challenges: [],
        notes: ["No challenge for deterministic daemon pipeline coverage."]
      };
    }
  };
}

function createFinalCandidateGenerator(): FinalCandidateGenerator {
  return {
    generatorId: "fake-final",
    proposeFinalCandidate(_input, context): FinalCandidateGeneratorResult {
      const candidateId = context.frontier.candidates[0]?.object.id;

      if (!candidateId) {
        throw new Error("Expected accepted candidate in test fixture.");
      }

      return {
        candidateIds: [candidateId],
        recommendation: "Use the local daemon run API as a provisional orchestration control surface.",
        applicabilityConditions: ["Only for local process-bound daemon execution."],
        rationale: "The accepted proposal keeps semantic writes inside orchestrator/core APIs.",
        limitations: ["No CLI/Web run workspace and no real provider execution in Stage 20A."]
      };
    }
  };
}

function createFinalAuditGenerator(): FinalAuditGenerator {
  return {
    auditorId: "fake-auditor",
    auditFinalCandidate(_input, context: FinalizationContext): FinalAuditGeneratorResult {
      return {
        findings: ["The final candidate is recorded as a proposal, not a settled answer."],
        risks: ["Persistent daemon storage and real providers remain deferred."],
        unresolvedObjectionIds: context.unresolvedObjectionIds,
        qualityObligationIds: context.qualityObligations.qualityObligations.map(
          (entry) => entry.object.id
        ),
        evidenceNeedIds: context.evidenceNeedIds,
        omissions: ["No public hosting or auth is included."],
        compressionProblems: [],
        limitations: ["The compiled outcome remains provisional."],
        continuationSuggestions: ["Add CLI and Web run surfaces in later stages."]
      };
    }
  };
}

function expectSafeRunApiPayload(value: unknown, secret = "sk-runtime-secret"): void {
  const text = JSON.stringify(value);

  expect(text).not.toContain(secret);
  expect(text).not.toContain("Authorization");
  expect(text).not.toContain("Bearer ");
  expect(text).not.toContain("/Users/");
  expect(text).not.toContain("\"apiKey\"");
  expect(text).not.toContain("DELIBERUM_TEST_API_KEY");
  expect(text).not.toContain(OPENAI_COMPATIBLE_API_KEY_ENV_VAR);

  for (const forbiddenTerm of [
    "winner",
    "currentBest",
    "ranking",
    "score",
    "vote",
    "finalAnswer",
    "truthSummary",
    "Judge"
  ]) {
    expect(text).not.toContain(forbiddenTerm);
  }
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

function summaryResource(id = "summary-resource"): Resource {
  return {
    id,
    kind: "text",
    mime: "text/plain",
    sizeBytes: 39,
    hash: `hash-${id}`,
    privacy: "private",
    variants: [
      {
        mode: "summary",
        text: "Resource content summary must not leak."
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

  it("allows only explicit local Web dev origins for CORS", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const loopbackResponse = await daemonApp.app.request("/runs", {
      headers: {
        Origin: "http://127.0.0.1:5173"
      }
    });
    const localhostResponse = await daemonApp.app.request("/runs", {
      headers: {
        Origin: "http://localhost:5173"
      }
    });
    const remoteResponse = await daemonApp.app.request("/runs", {
      headers: {
        Origin: "https://example.com"
      }
    });

    expect(loopbackResponse.status).toBe(200);
    expect(loopbackResponse.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5173"
    );
    expect(loopbackResponse.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(localhostResponse.status).toBe(200);
    expect(localhostResponse.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    );
    expect(localhostResponse.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(remoteResponse.status).toBe(200);
    expect(remoteResponse.headers.get("access-control-allow-origin")).toBeNull();
    expect(remoteResponse.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(remoteResponse.headers.get("access-control-allow-origin")).not.toBe(
      "https://example.com"
    );
    expect(DEFAULT_DAEMON_CORS_ORIGINS).toEqual([
      "http://127.0.0.1:5173",
      "http://localhost:5173"
    ]);
  });

  it("allows configured local Web dev origins without enabling remote CORS", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      corsOrigins: [" http://127.0.0.1:5180/path ", "http://127.0.0.1:5180"]
    });
    const allowedResponse = await daemonApp.app.request("/sessions/session-1/final", {
      headers: {
        Origin: "http://127.0.0.1:5180"
      }
    });
    const remoteResponse = await daemonApp.app.request("/sessions/session-1/final", {
      headers: {
        Origin: "https://example.com"
      }
    });

    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5180"
    );
    expect(allowedResponse.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(remoteResponse.status).toBe(200);
    expect(remoteResponse.headers.get("access-control-allow-origin")).toBeNull();
    expect(parseDaemonCorsOriginsFromEnv({
      [DAEMON_CORS_ORIGINS_ENV_VAR]:
        " http://127.0.0.1:5180 , http://localhost:5180/path "
    })).toEqual(["http://127.0.0.1:5180", "http://localhost:5180"]);
  });

  it("handles local Web dev preflight for run requests without wildcard CORS", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const response = await daemonApp.app.request("/runs", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5173"
    );
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET,POST,OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type");
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

  it("creates run records through orchestrator and returns safe run views only", async () => {
    const secret = "sk-runtime-secret";
    const daemonApp = createRunDaemon({ providerSecret: secret });
    const created = await createRun(daemonApp, orchestratedRunPlan({ providerConfig: true }));
    const listResponse = await daemonApp.app.request("/runs");
    const detailResponse = await daemonApp.app.request(`/runs/${created.run.runId}`);
    const listBody = (await listResponse.json()) as {
      runs: Array<{ runId: string; sessionId: string; topic: string }>;
    };
    const detailBody = (await detailResponse.json()) as {
      run: {
        runId: string;
        sessionId: string;
        plan: {
          providerConfigs: Array<{
            id: string;
            adapterId: string;
            modelId?: string;
            hasApiKeyEnvVar: boolean;
          }>;
        };
      };
    };
    const sessionEvents = daemonApp.eventStore.listEvents(created.run.sessionId);

    expect(created.event.type).toBe("topic_contract_published");
    expect(created.run.runId).toBe("id-1");
    expect(created.run.sessionId).toBe("id-3");
    expect(sessionEvents).toHaveLength(1);
    expect(listResponse.status).toBe(200);
    expect(listBody.runs).toEqual([
      expect.objectContaining({
        runId: created.run.runId,
        sessionId: created.run.sessionId,
        topic: "Should Deliberum expose run orchestration through the local daemon?"
      })
    ]);
    expect(detailResponse.status).toBe(200);
    expect(detailBody.run.plan.providerConfigs).toEqual([
      {
        id: "provider-cli",
        adapterId: "fake-cli",
        providerConfigId: "provider-cli",
        modelId: "fake-model",
        timeoutMs: 1000,
        hasApiKeyEnvVar: true
      }
    ]);
    expectSafeRunApiPayload(created, secret);
    expectSafeRunApiPayload(listBody, secret);
    expectSafeRunApiPayload(detailBody, secret);
  });

  it("runs the full deterministic local pipeline through daemon run start", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const startResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    const startBody = (await startResponse.json()) as {
      stopped: boolean;
      stages: Array<{ stage: string; executionStatus: string; eventIds: string[] }>;
      run: { rounds: { finalization: Array<{ outcomeCompilation?: { status: string } }> } };
    };
    const events = daemonApp.eventStore.listEvents(created.run.sessionId);
    const eventTypes = events.map((event) => event.type);
    const frontier = (await (
      await daemonApp.app.request(`/sessions/${created.run.sessionId}/frontier`)
    ).json()) as { candidates: Array<{ object: { id: string } }> };
    const outcomeResponse = await daemonApp.app.request(`/runs/${created.run.runId}/outcome`);
    const outcomeBody = (await outcomeResponse.json()) as {
      status: string;
      draftStatus?: string;
      outcome?: { recommendation: string; provenance: { finalCandidateProposalEventId?: string } };
    };

    expect(startResponse.status).toBe(200);
    expect(startBody.stopped).toBe(false);
    expect(startBody.stages.map((stage) => stage.stage)).toEqual([
      "sealed_divergence",
      "extraction",
      "proposal_review",
      "finalization"
    ]);
    expect(startBody.stages.every((stage) => stage.executionStatus === "executed")).toBe(true);
    expect(eventTypes).toEqual([
      "topic_contract_published",
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "sealed_contribution_submitted",
      "sealed_batch_revealed",
      "extraction_proposed",
      "proposal_accepted",
      "final_candidate_proposed",
      "final_audit_recorded"
    ]);
    expect(
      events
        .slice(1)
        .every((event) => event.idempotencyKey?.startsWith("orchestrator:"))
    ).toBe(true);
    expect(frontier.candidates).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({
          id: "candidate-daemon-run-api"
        })
      })
    ]);
    expect(outcomeResponse.status).toBe(200);
    expect(outcomeBody).toMatchObject({
      status: "compiled",
      draftStatus: "provisional",
      outcome: {
        recommendation: "Use the local daemon run API as a provisional orchestration control surface."
      }
    });
    expect(outcomeBody.outcome?.provenance.finalCandidateProposalEventId).toBeDefined();
    expect(startBody.run.rounds.finalization.at(-1)?.outcomeCompilation?.status).toBe("compiled");
    expectSafeRunApiPayload(startBody);
    expectSafeRunApiPayload(outcomeBody);
  });

  it("compiles a daemon-backed session final projection without mutating the ledger", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const startResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    const eventCountBeforeFinalRead =
      daemonApp.eventStore.listEvents(created.run.sessionId).length;
    const response = await daemonApp.app.request(
      `/sessions/${created.run.sessionId}/final`
    );
    const body = (await response.json()) as {
      sessionId: string;
      status: string;
      draftStatus: string;
      outcome: {
        recommendation: string;
        provenance: {
          projectionBasis: string;
          finalCandidateProposalEventId?: string;
          finalAuditEventIds: string[];
        };
      };
    };

    expect(startResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sessionId: created.run.sessionId,
      status: "compiled",
      draftStatus: "provisional",
      outcome: {
        recommendation: "Use the local daemon run API as a provisional orchestration control surface.",
        provenance: {
          projectionBasis: "event_ledger_and_projections"
        }
      }
    });
    expect(body.outcome.provenance.finalCandidateProposalEventId).toBeDefined();
    expect(body.outcome.provenance.finalAuditEventIds).toHaveLength(1);
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(
      eventCountBeforeFinalRead
    );
    expectSafeRunApiPayload(body);
  });

  it("projects session resources from the run plan with safe broker metadata and evidence needs", async () => {
    const resourceBroker = new InMemoryResourceBroker();
    const registeredUrlResource = resourceBroker.registerResource({
      resource: publicUrlResource("resource-url")
    });
    const registeredBase64Resource = resourceBroker.registerResource({
      resource: base64Resource("resource-base64", "projection-data-ref")
    });
    const registeredSummaryResource = resourceBroker.registerResource({
      resource: summaryResource("resource-summary")
    });
    const daemonApp = createRunDaemon({
      resourceBroker
    });
    const created = await createRun(daemonApp, {
      ...orchestratedRunPlan(),
      resources: [
        {
          resourceId: registeredUrlResource.id,
          required: true,
          preferredDeliveryMode: "url"
        },
        {
          resourceId: registeredBase64Resource.id,
          required: false,
          preferredDeliveryMode: "base64"
        },
        {
          resourceId: registeredSummaryResource.id,
          required: false,
          preferredDeliveryMode: "none"
        },
        {
          resourceId: "resource-missing",
          required: false,
          preferredDeliveryMode: "none"
        }
      ]
    });
    const batch = await openBatch(daemonApp, created.run.sessionId);
    const contribution = await addContribution(daemonApp, created.run.sessionId, batch.batchId);
    const closeResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/batches/${batch.batchId}/close`,
      {}
    );
    const extractionResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/extractions`,
      {
        authorId: "participant-2",
        rationale: "Extract a claim that still needs evidence.",
        candidates: [
          {
            id: "candidate-resource-surface",
            title: "Expose resource projection",
            description: "Expose run-plan resources and accepted evidence needs as safe view data.",
            sourceEventIds: [contribution.event.id],
            status: "active",
            supportedBy: ["claim-resource-surface"],
            attackedBy: [],
            qualityObligationIds: [],
            assumptions: [],
            tradeoffs: []
          }
        ],
        claims: [
          {
            id: "claim-resource-surface",
            content: "The Resources page should show planned resources and evidence needs.",
            scope: "design",
            sourceEventIds: [contribution.event.id],
            supports: ["candidate-resource-surface"]
          }
        ],
        evidenceNeeds: [
          {
            id: "evidence-need-resource-surface",
            targetClaimId: "claim-resource-surface",
            requiredKind: "file",
            reason: "Validate external evidence before treating resource coverage as complete.",
            priority: "high",
            status: "open",
            sourceEventIds: [contribution.event.id]
          }
        ],
        objections: [],
        qualityObligations: []
      }
    );
    const extraction = (await extractionResponse.json()) as { event: { id: string } };

    expect(closeResponse.status).toBe(201);
    expect(extractionResponse.status).toBe(201);
    await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/proposals/${extraction.event.id}/acceptance`,
      {
        authorId: "reviewer-1",
        rationale: "Accept resource projection fixture material for this local test."
      }
    );

    const response = await daemonApp.app.request(
      `/sessions/${created.run.sessionId}/resources`
    );
    const text = await response.text();
    const body = JSON.parse(text) as {
      source: { kind: string; runId?: string };
      plannedResources: Array<{
        registered: boolean;
        reference: { resourceId: string; required?: boolean; preferredDeliveryMode?: string };
        resource?: { variants: Array<Record<string, unknown>> };
      }>;
      evidenceNeeds: Array<{ object: { id: string; targetClaimId: string } }>;
    };

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body.source).toEqual({
      kind: "run_plan",
      runId: created.run.runId
    });
    expect(body.plannedResources).toMatchObject([
      {
        registered: true,
        reference: {
          resourceId: registeredUrlResource.id,
          required: true,
          preferredDeliveryMode: "url"
        },
        resource: {
          variants: [
            {
              mode: "url",
              exposure: "public"
            }
          ]
        }
      },
      {
        registered: true,
        reference: {
          resourceId: registeredBase64Resource.id,
          required: false,
          preferredDeliveryMode: "base64"
        },
        resource: {
          variants: [
            {
              mode: "base64",
              mime: "text/plain",
              sizeBytes: 11
            }
          ]
        }
      },
      {
        registered: true,
        reference: {
          resourceId: registeredSummaryResource.id,
          required: false,
          preferredDeliveryMode: "none"
        },
        resource: {
          variants: [
            {
              mode: "summary",
              textLength: 39
            }
          ]
        }
      },
      {
        registered: false,
        reference: {
          resourceId: "resource-missing",
          required: false,
          preferredDeliveryMode: "none"
        }
      }
    ]);
    expect(body.evidenceNeeds).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({
          id: "evidence-need-resource-surface",
          targetClaimId: "claim-resource-surface"
        })
      })
    ]);
    expect(text).not.toContain("https://example.com/resource.txt");
    expect(text).not.toContain("Resource content summary must not leak.");
    expect(text).not.toContain("projection-data-ref");
    expect(text).not.toContain("dataRef");
    expect(text).not.toContain("api_key");
    expectSafeRunApiPayload(body);
  });

  it("returns a safe not_available outcome before final candidate proposal exists", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const response = await daemonApp.app.request(`/runs/${created.run.runId}/outcome`);
    const body = (await response.json()) as { status: string; reason: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      runId: created.run.runId,
      sessionId: created.run.sessionId,
      status: "not_available",
      reason: "final_candidate_proposal_unavailable"
    });
    expectSafeRunApiPayload(body);
  });

  it("does not duplicate ledger events or SSE publications on run start retry", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(created.run.sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });
    const firstResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    const firstBody = (await firstResponse.json()) as { stages: Array<{ eventIds: string[] }> };
    const eventCountAfterFirst = daemonApp.eventStore.listEvents(created.run.sessionId).length;
    const receivedAfterFirst = received.length;
    const secondResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    const secondBody = (await secondResponse.json()) as { stages: Array<{ eventIds: string[] }> };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstBody.stages.flatMap((stage) => stage.eventIds)).toHaveLength(8);
    expect(secondBody.stages.flatMap((stage) => stage.eventIds)).toEqual([]);
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(eventCountAfterFirst);
    expect(received).toHaveLength(receivedAfterFirst);

    unsubscribe();
  });

  it("returns already_running for concurrent run start without duplicate component execution", async () => {
    let resolveSlowAdapter!: () => void;
    let slowAdapterCalls = 0;
    const daemonApp = createRunDaemon({
      slowAdapter: {
        adapterId: "fake-cli",
        onCall: () => {
          slowAdapterCalls += 1;
        },
        resolve: (resolvePayload) => {
          resolveSlowAdapter = resolvePayload;
        }
      }
    });
    const created = await createRun(daemonApp);
    const request = {
      sealedDivergence: {
        autoCloseManual: true
      }
    };
    const firstStart = postJson(daemonApp.app, `/runs/${created.run.runId}/start`, request);

    while (slowAdapterCalls === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const secondResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      request
    );
    const secondBody = (await secondResponse.json()) as {
      stopped: boolean;
      stopReason?: string;
      stages: Array<{ executionStatus: string }>;
    };

    resolveSlowAdapter();

    const firstResponse = await firstStart;

    expect(secondResponse.status).toBe(200);
    expect(secondBody).toMatchObject({
      stopped: true,
      stopReason: "already_running",
      stages: [
        {
          executionStatus: "already_running"
        }
      ]
    });
    expect(firstResponse.status).toBe(200);
    expect(slowAdapterCalls).toBe(1);
    expect(daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)).toEqual([
      "topic_contract_published",
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "sealed_contribution_submitted",
      "sealed_batch_revealed"
    ]);
  });

  it("returns a safe structured error when requested run components are unavailable", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const created = await createRun(daemonApp);
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(1);
    expectSafeRunApiPayload(body);
  });

  it("keeps the deterministic local preset disabled by default", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const created = await createRun(daemonApp, localPresetRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      localPresetStartRequest()
    );
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(1);
    expectSafeRunApiPayload(body);
  });

  it("resolves the deterministic local preset only from explicit option or exact env flag", () => {
    expect(resolveStartDaemonEnableLocalPreset({ enableLocalPreset: true }, {})).toBe(true);
    expect(
      resolveStartDaemonEnableLocalPreset({}, { DELIBERUM_ENABLE_LOCAL_PRESET: "true" })
    ).toBe(true);
    expect(resolveStartDaemonEnableLocalPreset({}, {})).toBe(false);
    expect(
      resolveStartDaemonEnableLocalPreset({}, { DELIBERUM_ENABLE_LOCAL_PRESET: "false" })
    ).toBe(false);
    expect(
      resolveStartDaemonEnableLocalPreset({}, { DELIBERUM_ENABLE_LOCAL_PRESET: "TRUE" })
    ).toBe(false);
    expect(
      resolveStartDaemonEnableLocalPreset({}, { DELIBERUM_ENABLE_LOCAL_PRESET: "random" })
    ).toBe(false);
    expect(
      resolveStartDaemonEnableLocalPreset(
        { enableLocalPreset: false },
        { DELIBERUM_ENABLE_LOCAL_PRESET: "true" }
      )
    ).toBe(false);
  });

  it("runs the deterministic local preset pipeline only when explicitly enabled", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true
    });
    const created = await createRun(daemonApp, localPresetRunPlan());
    const startResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      localPresetStartRequest()
    );
    const startBody = (await startResponse.json()) as {
      stopped: boolean;
      stages: Array<{ stage: string; executionStatus: string }>;
    };
    const frontier = (await (
      await daemonApp.app.request(`/sessions/${created.run.sessionId}/frontier`)
    ).json()) as { candidates: Array<{ object: { id: string } }> };
    const obligations = (await (
      await daemonApp.app.request(`/sessions/${created.run.sessionId}/obligations`)
    ).json()) as { qualityObligations: Array<{ object: { id: string } }> };
    const objections = (await (
      await daemonApp.app.request(`/sessions/${created.run.sessionId}/objections`)
    ).json()) as { objections: Array<{ object: { id: string } }> };
    const outcomeResponse = await daemonApp.app.request(`/runs/${created.run.runId}/outcome`);
    const outcomeBody = (await outcomeResponse.json()) as { status: string; draftStatus?: string };

    expect(startResponse.status).toBe(200);
    expect(startBody.stopped).toBe(false);
    expect(startBody.stages.map((stage) => stage.stage)).toEqual([
      "sealed_divergence",
      "extraction",
      "proposal_review",
      "finalization"
    ]);
    expect(startBody.stages.every((stage) => stage.executionStatus === "executed")).toBe(true);
    expect(frontier.candidates).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({
          id: "local-preset-candidate-run-workspace"
        })
      })
    ]);
    expect(obligations.qualityObligations).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({
          id: "local-preset-quality-labeling"
        })
      })
    ]);
    expect(objections.objections).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({
          id: "local-preset-objection-preset-scope"
        })
      })
    ]);
    expect(outcomeResponse.status).toBe(200);
    expect(outcomeBody).toMatchObject({
      status: "compiled",
      draftStatus: "provisional"
    });
    expectSafeRunApiPayload(startBody);
    expectSafeRunApiPayload(frontier);
    expectSafeRunApiPayload(obligations);
    expectSafeRunApiPayload(objections);
    expectSafeRunApiPayload(outcomeBody);
  });

  it("keeps the OpenAI-compatible provider profile disabled by default", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(1);
    expectSafeRunApiPayload(body);
  });

  it("resolves the OpenAI-compatible provider profile only from explicit option or exact env flag", () => {
    expect(resolveStartDaemonEnableOpenAICompatibleProfile(
      { enableOpenAICompatibleProfile: true },
      {}
    )).toBe(true);
    expect(
      resolveStartDaemonEnableOpenAICompatibleProfile(
        {},
        { [OPENAI_COMPATIBLE_PROFILE_ENV_VAR]: "true" }
      )
    ).toBe(true);
    expect(resolveStartDaemonEnableOpenAICompatibleProfile({}, {})).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleProfile(
        {},
        { [OPENAI_COMPATIBLE_PROFILE_ENV_VAR]: "false" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleProfile(
        {},
        { [OPENAI_COMPATIBLE_PROFILE_ENV_VAR]: "TRUE" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleProfile(
        {},
        { [OPENAI_COMPATIBLE_PROFILE_ENV_VAR]: "random" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleProfile(
        { enableOpenAICompatibleProfile: false },
        { [OPENAI_COMPATIBLE_PROFILE_ENV_VAR]: "true" }
      )
    ).toBe(false);
  });

  it("runs OpenAI-compatible sealed divergence through daemon with mocked fetch", async () => {
    const secret = "sk-openai-runtime-secret";
    const fetch = createOpenAICompatibleFetch("provider-backed sealed contribution");
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const startResponse = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const startBody = (await startResponse.json()) as {
      stopped: boolean;
      stages: Array<{
        stage: string;
        executionStatus: string;
        result: { participantResults?: Array<{ status: string; errorCategory?: string }> };
      }>;
    };
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const listBody = await (await daemonApp.app.request("/runs")).json();
    const [url, init] = getOpenAICompatibleFetchCall(fetch);
    const requestBody = JSON.parse(init.body) as { model: string };
    const events = daemonApp.eventStore.listEvents(created.run.sessionId);
    const safePayloads = [
      startBody,
      detailBody,
      listBody,
      {
        events
      }
    ];

    expect(startResponse.status).toBe(200);
    expect(startBody.stopped).toBe(false);
    expect(startBody.stages).toHaveLength(1);
    expect(startBody.stages[0]).toMatchObject({
      stage: "sealed_divergence",
      executionStatus: "executed",
      result: {
        participantResults: [
          expect.objectContaining({
            status: "submitted"
          })
        ]
      }
    });
    expect(url).toBe("https://runtime.example/api/chat/completions");
    expect(requestBody.model).toBe("runtime-model");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`
    });
    expect(events.map((event) => event.type)).toEqual([
      "topic_contract_published",
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "sealed_batch_revealed"
    ]);

    for (const payload of safePayloads) {
      expectSafeRunApiPayload(payload, secret);
    }
    expect(JSON.stringify(daemonApp.runStore.getRun(created.run.runId))).not.toContain(secret);
    expect(JSON.stringify(daemonApp.runStore.getRun(created.run.runId))).not.toContain(
      "Authorization"
    );
  });

  it("maps OpenAI-compatible request option env vars into mocked provider requests", async () => {
    const secret = "sk-openai-runtime-secret";
    const fetch = createOpenAICompatibleFetch("provider-backed sealed contribution");
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model",
        [OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR]: "max_completion_tokens",
        [OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR]: "1024",
        [OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR]: "1",
        [OPENAI_COMPATIBLE_TOP_P_ENV_VAR]: "0.95",
        [OPENAI_COMPATIBLE_STREAM_ENV_VAR]: "false",
        [OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR]: "0",
        [OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR]: "0",
        [OPENAI_COMPATIBLE_THINKING_ENV_VAR]: "disabled"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const startResponse = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const startBody = await startResponse.json();
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const [url, init] = getOpenAICompatibleFetchCall(fetch);
    const requestBody = JSON.parse(init.body) as {
      max_completion_tokens?: number;
      temperature?: number;
      top_p?: number;
      stream?: boolean;
      frequency_penalty?: number;
      presence_penalty?: number;
      thinking?: unknown;
    };
    const serializedSafeState = JSON.stringify({
      start: startBody,
      detail: detailBody,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(startResponse.status).toBe(200);
    expect(url).toBe("https://runtime.example/api/chat/completions");
    expect(requestBody).toMatchObject({
      max_completion_tokens: 1024,
      temperature: 1,
      top_p: 0.95,
      stream: false,
      frequency_penalty: 0,
      presence_penalty: 0,
      thinking: {
        type: "disabled"
      }
    });
    expect(serializedSafeState).not.toContain(secret);
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("private prompt");
    expect(serializedSafeState).not.toContain("/Users/");
    expect(serializedSafeState).not.toContain("stack");
    expectSafeRunApiPayload(startBody, secret);
    expectSafeRunApiPayload(detailBody, secret);
  });

  it("rejects invalid OpenAI-compatible request option env values before fetch", () => {
    const fetch = createOpenAICompatibleFetch();
    let thrown: unknown;

    try {
      createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableOpenAICompatibleProfile: true,
        openAICompatibleEnv: {
          [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
          [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
          [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model",
          [OPENAI_COMPATIBLE_STREAM_ENV_VAR]: "true"
        },
        openAICompatibleFetch: fetch
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
    expect((thrown as OpenAICompatibleAdapterError).safeCategory).toBe(
      "provider_config_invalid"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces safe OpenAI-compatible provider HTTP status through run API", async () => {
    const secret = "sk-openai-runtime-secret";
    const rawProviderBody =
      "raw provider body sk-openai-runtime-secret Authorization Bearer private prompt /Users/provider.log";
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: vi.fn(async () => ({
        error: {
          message: rawProviderBody
        }
      }))
    })) as unknown as MockedFetchLike;
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const body = (await response.json()) as {
      stopped: boolean;
      stopReason?: string;
      stages: Array<{
        status?: string;
        result: {
          participantResults?: Array<{
            status: string;
            errorCategory?: string;
            safeDiagnostics?: {
              httpStatus?: number;
            };
          }>;
        };
      }>;
    };
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const listBody = await (await daemonApp.app.request("/runs")).json();
    const serializedSafeState = JSON.stringify({
      start: body,
      detail: detailBody,
      list: listBody,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      stopped: true,
      stopReason: "waiting_for_participants",
      stages: [
        {
          status: "waiting_for_participants",
          result: {
            participantResults: [
              expect.objectContaining({
                status: "failed",
                errorCategory: "provider_http_error",
                safeDiagnostics: {
                  httpStatus: 500
                }
              })
            ]
          }
        }
      ]
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)).toEqual([
      "topic_contract_published",
      "sealed_batch_opened"
    ]);
    expect(detailBody).toMatchObject({
      run: {
        rounds: {
          sealedDivergence: {
            participantDispatches: [
              expect.objectContaining({
                status: "failed",
                errorCategory: "provider_http_error",
                safeDiagnostics: {
                  httpStatus: 500
                }
              })
            ]
          }
        }
      }
    });
    expect(serializedSafeState).toContain("provider_http_error");
    expect(serializedSafeState).toContain("\"httpStatus\":500");
    expect(serializedSafeState).not.toContain(rawProviderBody);
    expect(serializedSafeState).not.toContain(secret);
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("private prompt");
    expect(serializedSafeState).not.toContain("/Users/");
    expect(serializedSafeState).not.toContain("stack");
    expectSafeRunApiPayload(body, secret);
    expectSafeRunApiPayload(detailBody, secret);
    expectSafeRunApiPayload(listBody, secret);
  });

  it("returns safe provider_secret_missing when OpenAI-compatible env key is absent", async () => {
    const fetch = createOpenAICompatibleFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {},
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const body = (await response.json()) as {
      stopped: boolean;
      stopReason?: string;
      stages: Array<{
        status?: string;
        result: {
          participantResults?: Array<{
            status: string;
            errorCategory?: string;
          }>;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      stopped: true,
      stopReason: "waiting_for_participants",
      stages: [
        {
          status: "waiting_for_participants",
          result: {
            participantResults: [
              expect.objectContaining({
                status: "failed",
                errorCategory: "provider_secret_missing"
              })
            ]
          }
        }
      ]
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)).toEqual([
      "topic_contract_published",
      "sealed_batch_opened"
    ]);
    expectSafeRunApiPayload(body);
  });

  it("does not install extraction generators through the OpenAI-compatible profile", async () => {
    const fetch = createOpenAICompatibleFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      },
      extraction: {}
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(1);
    expectSafeRunApiPayload(body);
  });

  it("requires the separate exact OpenAI-compatible extraction flag", async () => {
    expect(resolveStartDaemonEnableOpenAICompatibleExtraction(
      { enableOpenAICompatibleExtraction: true },
      {}
    )).toBe(true);
    expect(
      resolveStartDaemonEnableOpenAICompatibleExtraction(
        {},
        { [OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR]: "true" }
      )
    ).toBe(true);
    expect(resolveStartDaemonEnableOpenAICompatibleExtraction({}, {})).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleExtraction(
        {},
        { [OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR]: "false" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleExtraction(
        {},
        { [OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR]: "TRUE" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleExtraction(
        {},
        { [OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR]: "random" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleExtraction(
        { enableOpenAICompatibleExtraction: false },
        { [OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR]: "true" }
      )
    ).toBe(false);
  });

  it("does not install provider extraction when extraction is enabled without the profile", async () => {
    const fetch = createOpenAICompatibleExtractionFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      extraction: {
        generatorIds: [OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID]
      }
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(fetch).not.toHaveBeenCalled();
    expectSafeRunApiPayload(body);
  });

  it("does not override an explicitly injected extraction registry with provider extraction", async () => {
    const fetch = createOpenAICompatibleExtractionFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
      },
      openAICompatibleFetch: fetch,
      runExtractionGeneratorRegistry: new ExtractionGeneratorRegistry()
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      extraction: {}
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(fetch).not.toHaveBeenCalled();
    expectSafeRunApiPayload(body);
  });

  it("runs provider-backed extraction through daemon with mocked fetch and local preset review/finalization", async () => {
    const secret = "sk-openai-runtime-secret";
    const fetch = createOpenAICompatibleExtractionFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleExtractionStartRequest()
    );
    const body = (await response.json()) as {
      stopped: boolean;
      stages: Array<{
        stage: string;
        status?: string;
        result: {
          proposalResults?: Array<{
            generatorId: string;
            status: string;
            proposalEventId?: string;
          }>;
        };
      }>;
    };
    const frontier = await (await daemonApp.app.request(
      `/sessions/${created.run.sessionId}/frontier`
    )).json();
    const outcome = await (await daemonApp.app.request(
      `/runs/${created.run.runId}/outcome`
    )).json();
    const [url, init] = getOpenAICompatibleFetchCall(fetch);
    const requestBody = JSON.parse(init.body) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    const serializedSafeState = JSON.stringify({
      start: body,
      detail: await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json(),
      frontier,
      outcome,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(response.status).toBe(200);
    expect(body.stopped).toBe(false);
    expect(body.stages.map((stage) => stage.stage)).toEqual([
      "sealed_divergence",
      "extraction",
      "proposal_review",
      "finalization"
    ]);
    expect(body.stages.find((stage) => stage.stage === "extraction")).toMatchObject({
      status: "completed",
      result: {
        proposalResults: [
          expect.objectContaining({
            generatorId: OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
            status: "proposed"
          })
        ]
      }
    });
    expect(url).toBe("https://runtime.example/api/chat/completions");
    expect(requestBody.model).toBe("runtime-model");
    expect(requestBody.messages).toEqual([
      expect.objectContaining({
        role: "system"
      }),
      expect.objectContaining({
        role: "user"
      })
    ]);
    expect(requestBody.response_format).toBeUndefined();
    expect(frontier).toMatchObject({
      candidates: [
        expect.objectContaining({
          object: expect.objectContaining({
            id: "provider-extraction-candidate"
          })
        })
      ]
    });
    expect(outcome).toMatchObject({
      status: "compiled",
      draftStatus: "provisional"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expectSafeRunApiPayload(body, secret);
    expectSafeRunApiPayload(frontier, secret);
    expectSafeRunApiPayload(outcome, secret);
    expect(serializedSafeState).not.toContain(secret);
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("raw provider");
    expect(serializedSafeState).not.toContain("/Users/");
    expect(serializedSafeState).not.toContain("stack");
  });

  it("applies extraction-only response format without changing participant calls", async () => {
    const secret = "sk-openai-runtime-secret";
    const fetch = createOpenAICompatibleExtractionFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model",
        [OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR]: "json_object"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleExtractionStartRequest()
    );
    const [, init] = getOpenAICompatibleFetchCall(fetch);
    const requestBody = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    const extractionPromptPayload = JSON.parse(requestBody.messages[1]?.content ?? "{}") as {
      responseContract?: {
        requiredForm?: string;
        firstNonWhitespaceCharacter?: string;
        lastNonWhitespaceCharacter?: string;
        disallowed?: string[];
        fallbackWhenUncertain?: {
          candidates?: unknown[];
          claims?: unknown[];
          objections?: unknown[];
          evidenceNeeds?: unknown[];
          qualityObligations?: unknown[];
          rationale?: string;
        };
        finalInstruction?: string;
      };
    };
    const serializedSafeState = JSON.stringify({
      body: await response.clone().json(),
      detail: await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json(),
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody.response_format).toEqual({
      type: "json_object"
    });
    expect(requestBody.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining(
        "Your entire assistant response must be exactly one JSON object."
      )
    });
    expect(requestBody.messages[0].content).toContain(
      "The first non-whitespace character must be {"
    );
    expect(requestBody.messages[0].content).toContain(
      "the last non-whitespace character must be }"
    );
    expect(requestBody.messages[0].content).toContain(
      "Do not include prose before or after the JSON object."
    );
    expect(requestBody.messages[0].content).toContain("Do not include Markdown or code fences.");
    expect(requestBody.messages[0].content).toContain(
      "When optional item groups cannot be derived, use empty arrays"
    );
    expect(extractionPromptPayload.responseContract).toMatchObject({
      requiredForm: "exactly one JSON object and nothing else",
      firstNonWhitespaceCharacter: "{",
      lastNonWhitespaceCharacter: "}",
      disallowed: expect.arrayContaining([
        "prose before the JSON object",
        "prose after the JSON object",
        "Markdown fences",
        "code fences"
      ]),
      fallbackWhenUncertain: {
        candidates: [],
        claims: [],
        objections: [],
        evidenceNeeds: [],
        qualityObligations: [],
        rationale: "non-empty explanation of why optional item groups are empty"
      },
      finalInstruction:
        "Return only the JSON object. The complete assistant response must start with { and end with }."
    });
    expect(serializedSafeState).not.toContain("responseFormat");
    expect(serializedSafeState).not.toContain("json_object");
    expect(serializedSafeState).not.toContain(secret);
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
  });

  it("does not apply extraction-only response format to participant calls", async () => {
    const fetch = createOpenAICompatibleFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
        [OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR]: "json_object"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const [, init] = getOpenAICompatibleFetchCall(fetch);
    const requestBody = JSON.parse(init.body) as {
      response_format?: unknown;
    };

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody.response_format).toBeUndefined();
  });

  it("rejects invalid extraction response format before provider calls", () => {
    const fetch = createOpenAICompatibleExtractionFetch();
    let thrown: unknown;

    try {
      createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableOpenAICompatibleProfile: true,
        enableOpenAICompatibleExtraction: true,
        openAICompatibleEnv: {
          [OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR]: "json_schema"
        },
        openAICompatibleFetch: fetch
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
    expect((thrown as OpenAICompatibleAdapterError).safeCategory).toBe(
      "provider_config_invalid"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns safe provider_secret_missing for provider extraction without calling fetch", async () => {
    const fetch = createOpenAICompatibleExtractionFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {},
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleExtractionStartRequest()
    );
    const body = (await response.json()) as {
      stopped: boolean;
      stopReason?: string;
      stages: Array<{
        stage: string;
        status?: string;
        result: {
          proposalResults?: Array<{
            status: string;
            errorCategory?: string;
          }>;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stopped: true,
      stopReason: "waiting_for_generators",
      stages: [
        expect.objectContaining({
          stage: "sealed_divergence",
          status: "revealed"
        }),
        expect.objectContaining({
          stage: "extraction",
          status: "waiting_for_generators",
          result: {
            proposalResults: [
              expect.objectContaining({
                status: "failed",
                errorCategory: "provider_secret_missing"
              })
            ]
          }
        })
      ]
    });
    expect(fetch).not.toHaveBeenCalled();
    expectSafeRunApiPayload(body);
  });

  it("accepts a single fenced JSON block from provider extraction", async () => {
    const fetch = createOpenAICompatibleExtractionFetch({
      contentTransform: (content) => `\`\`\`json\n${content}\n\`\`\``
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleExtractionStartRequest()
    );
    const body = (await response.json()) as {
      stages: Array<{
        stage: string;
        status?: string;
        result: {
          proposalResults?: Array<{
            generatorId: string;
            status: string;
          }>;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.stages.find((stage) => stage.stage === "extraction")).toMatchObject({
      status: "completed",
      result: {
        proposalResults: [
          expect.objectContaining({
            generatorId: OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
            status: "proposed"
          })
        ]
      }
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)).toContain(
      "extraction_proposed"
    );
  });

  it("retries malformed provider extraction shape once and succeeds without storing the rejected response", async () => {
    const rejectedResponseMarker = "MIMO_REJECTED_PROSE_WRAPPER";
    const fetch = createOpenAICompatibleExtractionFetch({
      contentTransforms: [
        (content) => `${rejectedResponseMarker}\n${content}`,
        (content) => content
      ]
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model",
        [OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR]: "json_object"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleExtractionStartRequest()
    );
    const body = (await response.clone().json()) as {
      stages: Array<{
        stage: string;
        status?: string;
        result: {
          proposalResults?: Array<{
            generatorId: string;
            status: string;
          }>;
        };
      }>;
    };
    const firstRequest = JSON.parse(getOpenAICompatibleFetchCall(fetch, 0)[1].body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const retryRequest = JSON.parse(getOpenAICompatibleFetchCall(fetch, 1)[1].body) as {
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const serializedSafeState = JSON.stringify({
      body,
      detail: detailBody,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(firstRequest.messages).toHaveLength(2);
    expect(retryRequest.messages).toHaveLength(3);
    expect(retryRequest.messages[2]).toMatchObject({
      role: "user",
      content: expect.stringContaining(
        "The previous response was rejected because it was not exactly one JSON object."
      )
    });
    expect(retryRequest.messages[2].content).toContain(
      "Do not include any prose, labels, Markdown, code fences, or explanation."
    );
    expect(JSON.stringify(retryRequest)).not.toContain(rejectedResponseMarker);
    expect(retryRequest.response_format).toEqual({
      type: "json_object"
    });
    expect(body.stages.find((stage) => stage.stage === "extraction")).toMatchObject({
      status: "completed",
      result: {
        proposalResults: [
          expect.objectContaining({
            generatorId: OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
            status: "proposed"
          })
        ]
      }
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)).toContain(
      "extraction_proposed"
    );
    expect(serializedSafeState).not.toContain(rejectedResponseMarker);
    expect(serializedSafeState).not.toContain("sk-openai-runtime-secret");
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("/Users/");
    expect(serializedSafeState).not.toContain("stack");
  });

  it("does not retry provider extraction HTTP failures", async () => {
    const fetch = createOpenAICompatibleExtractionFetch({
      ok: false,
      status: 500
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleExtractionStartRequest()
    );
    const body = (await response.json()) as {
      stages: Array<{
        stage: string;
        result: {
          proposalResults?: Array<{
            errorCategory?: string;
            safeDiagnostics?: {
              httpStatus?: number;
            };
          }>;
        };
      }>;
    };
    const proposalResult = body.stages.find((stage) => stage.stage === "extraction")?.result
      .proposalResults?.[0];

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(proposalResult).toMatchObject({
      errorCategory: "provider_http_error",
      safeDiagnostics: {
        httpStatus: 500
      }
    });
  });

  it("surfaces safe provider extraction parse and schema failures", async () => {
    const cases = [
      {
        content: "{",
        errorCategory: "provider_malformed_response",
        providerResponseShape: "invalid_json_object"
      },
      {
        content: "{}",
        errorCategory: "extraction_output_invalid"
      },
      {
        contentTransform: (content: string) => `Here is the extraction JSON:\n${content}`,
        errorCategory: "provider_malformed_response",
        providerResponseShape: "prose_with_json_object"
      },
      {
        content: "[]",
        errorCategory: "provider_malformed_response",
        providerResponseShape: "json_array"
      },
      {
        content: "```json\n[]\n```",
        errorCategory: "provider_malformed_response",
        providerResponseShape: "single_fenced_json_array"
      }
    ] as const;

    for (const testCase of cases) {
      const fetch = createOpenAICompatibleExtractionFetch({
        content: "content" in testCase ? testCase.content : undefined,
        contentTransform:
          "contentTransform" in testCase ? testCase.contentTransform : undefined
      });
      const daemonApp = createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableLocalPreset: true,
        enableOpenAICompatibleProfile: true,
        enableOpenAICompatibleExtraction: true,
        openAICompatibleEnv: {
          [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
          [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
          [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model"
        },
        openAICompatibleFetch: fetch
      });
      const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
      const response = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/start`,
        openAICompatibleExtractionStartRequest()
      );
      const body = (await response.json()) as {
        stages: Array<{
          stage: string;
          result: {
            proposalResults?: Array<{
              errorCategory?: string;
              safeDiagnostics?: {
                providerResponseShape?: string;
              };
            }>;
          };
        }>;
      };
      const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
      const serializedSafeState = JSON.stringify({
        body,
        detail: detailBody,
        storedRun: daemonApp.runStore.getRun(created.run.runId),
        events: daemonApp.eventStore.listEvents(created.run.sessionId)
      });
      const extractionStage = body.stages.find((stage) => stage.stage === "extraction");
      const proposalResult = extractionStage?.result.proposalResults?.[0];

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes("providerResponseShape" in testCase ? 2 : 1);
      expect(proposalResult).toMatchObject({
        errorCategory: testCase.errorCategory
      });
      if ("providerResponseShape" in testCase) {
        expect(proposalResult).toMatchObject({
          safeDiagnostics: {
            providerResponseShape: testCase.providerResponseShape
          }
        });
        expect(serializedSafeState).toContain(
          `"providerResponseShape":"${testCase.providerResponseShape}"`
        );
      } else {
        expect(proposalResult?.safeDiagnostics).toBeUndefined();
        expect(serializedSafeState).not.toContain("providerResponseShape");
      }
      expect(daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)).not.toContain(
        "extraction_proposed"
      );
      expect(serializedSafeState).not.toContain("Here is the extraction JSON");
      expect(serializedSafeState).not.toContain("provider-extraction-candidate");
      expect(serializedSafeState).not.toContain("sk-openai-runtime-secret");
      expect(serializedSafeState).not.toContain("Authorization");
      expect(serializedSafeState).not.toContain("Bearer");
      expect(serializedSafeState).not.toContain("/Users/");
      expect(serializedSafeState).not.toContain("stack");
    }
  });

  it("rejects provider extraction output with disallowed source ids before proposal events", async () => {
    const fetch = createOpenAICompatibleExtractionFetch({
      content: JSON.stringify({
        candidates: [
          {
            id: "provider-extraction-candidate",
            title: "Provider-backed extraction proposal",
            description: "This proposal references a disallowed source id.",
            sourceEventIds: ["disallowed-source-event"],
            status: "active",
            supportedBy: ["provider-extraction-claim"],
            attackedBy: [],
            qualityObligationIds: [],
            assumptions: [],
            tradeoffs: []
          }
        ],
        claims: [
          {
            id: "provider-extraction-claim",
            content: "The proposal should be rejected before lifecycle writes.",
            scope: "design",
            sourceEventIds: ["disallowed-source-event"],
            supports: ["provider-extraction-candidate"]
          }
        ],
        objections: [],
        evidenceNeeds: [],
        qualityObligations: [],
        rationale: "This schema-valid object has invalid source traceability."
      })
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleExtractionStartRequest()
    );
    const body = (await response.json()) as {
      stages: Array<{
        stage: string;
        result: {
          proposalResults?: Array<{
            errorCategory?: string;
          }>;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.stages.find((stage) => stage.stage === "extraction")).toMatchObject({
      result: {
        proposalResults: [
          expect.objectContaining({
            errorCategory: "extraction_validation_failed"
          })
        ]
      }
    });
    expect(daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)).not.toContain(
      "extraction_proposed"
    );
  });

  it("requires the separate exact OpenAI-compatible review flag", async () => {
    expect(resolveStartDaemonEnableOpenAICompatibleReview(
      { enableOpenAICompatibleReview: true },
      {}
    )).toBe(true);
    expect(
      resolveStartDaemonEnableOpenAICompatibleReview(
        {},
        { [OPENAI_COMPATIBLE_REVIEW_ENV_VAR]: "true" }
      )
    ).toBe(true);
    expect(resolveStartDaemonEnableOpenAICompatibleReview({}, {})).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleReview(
        {},
        { [OPENAI_COMPATIBLE_REVIEW_ENV_VAR]: "false" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleReview(
        {},
        { [OPENAI_COMPATIBLE_REVIEW_ENV_VAR]: "TRUE" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleReview(
        {},
        { [OPENAI_COMPATIBLE_REVIEW_ENV_VAR]: "random" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleReview(
        { enableOpenAICompatibleReview: false },
        { [OPENAI_COMPATIBLE_REVIEW_ENV_VAR]: "true" }
      )
    ).toBe(false);
  });

  it("installs OpenAI-compatible review registries only when review is enabled", () => {
    const disabled = createOpenAICompatibleRunRegistries({
      enableExtraction: true
    });
    const enabled = createOpenAICompatibleRunRegistries({
      enableReview: true
    });

    expect(disabled.proposalReviewGeneratorRegistry).toBeUndefined();
    expect(enabled.proposalReviewGeneratorRegistry?.list()).toEqual([
      {
        reviewerId: OPENAI_COMPATIBLE_REVIEWER_ID
      }
    ]);
  });

  it("does not install provider review when review is enabled without the profile", async () => {
    const fetch = createOpenAICompatibleReviewFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleReview: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleReviewStartRequest()
    );
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(fetch).not.toHaveBeenCalled();
    expectSafeRunApiPayload(body);
  });

  it("runs provider-backed proposal review through daemon with mocked fetch", async () => {
    const secret = "sk-openai-runtime-secret";
    const fetch = createOpenAICompatibleReviewFetch();
    const plan = {
      ...openAICompatibleExtractionRunPlan(),
      providerConfigs: [
        ...openAICompatibleExtractionRunPlan().providerConfigs,
        {
          id: "review-provider",
          adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
          providerConfigId: "review-provider",
          modelId: "review-runtime-model",
          baseUrl: "https://review-runtime.example/api",
          endpointPath: "/chat/completions",
          apiKeyEnvVar: OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
          timeoutMs: 1000
        }
      ]
    };
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleReview: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model",
        [OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR]: "review-provider",
        [OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR]: "json_object"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, plan);
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleReviewStartRequest()
    );
    const body = (await response.json()) as {
      stopped: boolean;
      stages: Array<{
        stage: string;
        status?: string;
        result: {
          reviewResults?: Array<{
            reviewerId: string;
            status: string;
          }>;
        };
      }>;
    };
    const [url, init] = getOpenAICompatibleFetchCall(fetch);
    const requestBody = JSON.parse(init.body) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    const reviewPromptPayload = findReviewContextPayload(requestBody.messages);
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const serializedSafeState = JSON.stringify({
      body,
      detail: detailBody,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(response.status).toBe(200);
    expect(body.stopped).toBe(false);
    expect(body.stages.find((stage) => stage.stage === "proposal_review")).toMatchObject({
      status: "completed",
      result: {
        reviewResults: [
          expect.objectContaining({
            reviewerId: OPENAI_COMPATIBLE_REVIEWER_ID,
            status: "reviewed"
          })
        ]
      }
    });
    expect(url).toBe("https://review-runtime.example/api/chat/completions");
    expect(requestBody.model).toBe("review-runtime-model");
    expect(requestBody.response_format).toEqual({
      type: "json_object"
    });
    expect(requestBody.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining(
        "Your entire assistant response must be exactly one JSON object."
      )
    });
    expect(requestBody.messages[0].content).toContain(
      "Challenges must target only proposal event IDs listed in allowedProposalEventIds."
    );
    expect(requestBody.messages[0].content).toContain("Return only review challenges and notes.");
    expect(reviewPromptPayload?.allowedProposalEventIds.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(serializedSafeState).not.toContain(secret);
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("raw provider");
    expect(serializedSafeState).not.toContain("/Users/");
    expect(serializedSafeState).not.toContain("stack");
    expect(serializedSafeState).not.toContain("responseFormat");
    expect(serializedSafeState).not.toContain("json_object");
    expectSafeRunApiPayload(body, secret);
    expectSafeRunApiPayload(detailBody, secret);
  });

  it("rejects invalid review response format before provider calls", () => {
    const fetch = createOpenAICompatibleReviewFetch();
    let thrown: unknown;

    try {
      createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableOpenAICompatibleProfile: true,
        enableOpenAICompatibleReview: true,
        openAICompatibleEnv: {
          [OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR]: "json_schema"
        },
        openAICompatibleFetch: fetch
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
    expect((thrown as OpenAICompatibleAdapterError).safeCategory).toBe(
      "provider_config_invalid"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retries malformed provider review shape once and succeeds without storing the rejected response", async () => {
    const rejectedResponseMarker = "REVIEW_REJECTED_PROSE_WRAPPER";
    const fetch = createOpenAICompatibleReviewFetch({
      contentTransforms: [
        (content) => `${rejectedResponseMarker}\n${content}`,
        (content) => content
      ]
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleReview: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
        [OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR]: "json_object"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleReviewStartRequest()
    );
    const body = (await response.json()) as {
      stages: Array<{
        stage: string;
        status?: string;
        result: {
          reviewResults?: Array<{
            reviewerId: string;
            status: string;
          }>;
        };
      }>;
    };
    const retryRequest = JSON.parse(getOpenAICompatibleFetchCall(fetch, 1)[1].body) as {
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const serializedSafeState = JSON.stringify({
      body,
      detail: detailBody,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(retryRequest.messages).toHaveLength(3);
    expect(retryRequest.messages[2]).toMatchObject({
      role: "user",
      content: expect.stringContaining(
        "The previous response was rejected because it was not exactly one JSON object."
      )
    });
    expect(JSON.stringify(retryRequest)).not.toContain(rejectedResponseMarker);
    expect(retryRequest.response_format).toEqual({
      type: "json_object"
    });
    expect(body.stages.find((stage) => stage.stage === "proposal_review")).toMatchObject({
      status: "completed",
      result: {
        reviewResults: [
          expect.objectContaining({
            reviewerId: OPENAI_COMPATIBLE_REVIEWER_ID,
            status: "reviewed"
          })
        ]
      }
    });
    expect(serializedSafeState).not.toContain(rejectedResponseMarker);
    expect(serializedSafeState).not.toContain("sk-openai-runtime-secret");
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("/Users/");
    expect(serializedSafeState).not.toContain("stack");
  });

  it("surfaces safe provider review parse and contract failures", async () => {
    const cases = [
      {
        contentTransform: (content: string) => `Review JSON:\n${content}`,
        expectedCalls: 2,
        errorCategory: "provider_malformed_response",
        providerResponseShape: "prose_with_json_object"
      },
      {
        content: "[]",
        expectedCalls: 2,
        errorCategory: "provider_malformed_response",
        providerResponseShape: "json_array"
      },
      {
        content: JSON.stringify({
          challenges: [
            {
              targetProposalEventId: "missing-proposal-event",
              reason: "Schema-valid challenge with disallowed target."
            }
          ],
          notes: []
        }),
        expectedCalls: 1,
        errorCategory: "proposal_review_validation_failed"
      }
    ] as const;

    for (const testCase of cases) {
      const fetch = createOpenAICompatibleReviewFetch({
        content: "content" in testCase ? testCase.content : undefined,
        contentTransform:
          "contentTransform" in testCase ? testCase.contentTransform : undefined
      });
      const daemonApp = createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableLocalPreset: true,
        enableOpenAICompatibleProfile: true,
        enableOpenAICompatibleReview: true,
        openAICompatibleEnv: {
          [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
        },
        openAICompatibleFetch: fetch
      });
      const created = await createRun(daemonApp, openAICompatibleExtractionRunPlan());
      const response = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/start`,
        openAICompatibleReviewStartRequest()
      );
      const body = (await response.json()) as {
        stages: Array<{
          stage: string;
          result: {
            reviewResults?: Array<{
              errorCategory?: string;
              safeDiagnostics?: {
                providerResponseShape?: string;
              };
            }>;
          };
        }>;
      };
      const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
      const reviewResult = body.stages.find((stage) => stage.stage === "proposal_review")?.result
        .reviewResults?.[0];
      const serializedSafeState = JSON.stringify({
        body,
        detail: detailBody,
        storedRun: daemonApp.runStore.getRun(created.run.runId),
        events: daemonApp.eventStore.listEvents(created.run.sessionId)
      });

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(testCase.expectedCalls);
      expect(reviewResult).toMatchObject({
        errorCategory: testCase.errorCategory
      });
      if ("providerResponseShape" in testCase) {
        expect(reviewResult).toMatchObject({
          safeDiagnostics: {
            providerResponseShape: testCase.providerResponseShape
          }
        });
        expect(serializedSafeState).toContain(
          `"providerResponseShape":"${testCase.providerResponseShape}"`
        );
      } else {
        expect(reviewResult?.safeDiagnostics).toBeUndefined();
        expect(serializedSafeState).not.toContain("providerResponseShape");
      }
      expect(serializedSafeState).not.toContain("Review JSON");
      expect(serializedSafeState).not.toContain("missing-proposal-event");
      expect(serializedSafeState).not.toContain("sk-openai-runtime-secret");
      expect(serializedSafeState).not.toContain("Authorization");
      expect(serializedSafeState).not.toContain("Bearer");
      expect(serializedSafeState).not.toContain("/Users/");
      expect(serializedSafeState).not.toContain("stack");
    }
  });

  it("requires the separate exact OpenAI-compatible finalization flag", async () => {
    expect(resolveStartDaemonEnableOpenAICompatibleFinalization(
      { enableOpenAICompatibleFinalization: true },
      {}
    )).toBe(true);
    expect(
      resolveStartDaemonEnableOpenAICompatibleFinalization(
        {},
        { [OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR]: "true" }
      )
    ).toBe(true);
    expect(resolveStartDaemonEnableOpenAICompatibleFinalization({}, {})).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleFinalization(
        {},
        { [OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR]: "false" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleFinalization(
        {},
        { [OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR]: "TRUE" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableOpenAICompatibleFinalization(
        { enableOpenAICompatibleFinalization: false },
        { [OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR]: "true" }
      )
    ).toBe(false);
  });

  it("installs OpenAI-compatible finalization registries only when finalization is enabled", () => {
    const disabled = createOpenAICompatibleRunRegistries({
      enableReview: true
    });
    const enabled = createOpenAICompatibleRunRegistries({
      enableFinalization: true
    });

    expect(disabled.finalCandidateGeneratorRegistry).toBeUndefined();
    expect(disabled.finalAuditGeneratorRegistry).toBeUndefined();
    expect(enabled.finalCandidateGeneratorRegistry?.list()).toEqual([
      {
        generatorId: OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID
      }
    ]);
    expect(enabled.finalAuditGeneratorRegistry?.list()).toEqual([
      {
        auditorId: OPENAI_COMPATIBLE_FINAL_AUDITOR_ID
      }
    ]);
  });

  it("does not install provider finalization when finalization is enabled without the profile", async () => {
    const fetch = createOpenAICompatibleFinalizationFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleFinalization: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, localPresetRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleFinalizationStartRequest()
    );
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(fetch).not.toHaveBeenCalled();
    expectSafeRunApiPayload(body);
  });

  it("runs provider-backed finalization through daemon with mocked fetch", async () => {
    const secret = "sk-openai-runtime-secret";
    const fetch = createOpenAICompatibleFinalizationFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleFinalization: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model",
        [OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR]:
          "final-candidate-provider",
        [OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR]: "final-audit-provider",
        [OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR]: "json_object",
        [OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR]: "json_object"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, openAICompatibleFinalizationRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      openAICompatibleFinalizationStartRequest()
    );
    const body = (await response.json()) as {
      stopped: boolean;
      stages: Array<{
        stage: string;
        status?: string;
        result: {
          finalCandidateResult?: {
            sourceId: string;
            status: string;
          };
          auditResults?: Array<{
            auditorId: string;
            status: string;
          }>;
        };
      }>;
    };
    const [candidateUrl, candidateInit] = getOpenAICompatibleFetchCall(fetch, 0);
    const [auditUrl, auditInit] = getOpenAICompatibleFetchCall(fetch, 1);
    const candidateRequestBody = JSON.parse(candidateInit.body) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    const auditRequestBody = JSON.parse(auditInit.body) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    const candidatePromptPayload = findFinalCandidateContextPayload(
      candidateRequestBody.messages
    );
    const auditPromptPayload = findFinalAuditContextPayload(auditRequestBody.messages);
    const outcome = await (await daemonApp.app.request(
      `/runs/${created.run.runId}/outcome`
    )).json();
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const serializedSafeState = JSON.stringify({
      body,
      detail: detailBody,
      outcome,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events: daemonApp.eventStore.listEvents(created.run.sessionId)
    });

    expect(response.status).toBe(200);
    expect(body.stopped).toBe(false);
    expect(body.stages.find((stage) => stage.stage === "finalization")).toMatchObject({
      status: "completed",
      result: {
        finalCandidateResult: {
          sourceId: OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID,
          status: "proposed"
        },
        auditResults: [
          expect.objectContaining({
            auditorId: OPENAI_COMPATIBLE_FINAL_AUDITOR_ID,
            status: "recorded"
          })
        ]
      }
    });
    expect(candidateUrl).toBe("https://final-candidate-runtime.example/api/chat/completions");
    expect(candidateRequestBody.model).toBe("final-candidate-runtime-model");
    expect(candidateRequestBody.response_format).toEqual({
      type: "json_object"
    });
    expect(candidateRequestBody.messages[0].content).toContain(
      "The final candidate is a proposal, not an authoritative answer."
    );
    expect(candidatePromptPayload?.allowedCandidateIds.length).toBeGreaterThan(0);
    expect(auditUrl).toBe("https://final-audit-runtime.example/api/chat/completions");
    expect(auditRequestBody.model).toBe("final-audit-runtime-model");
    expect(auditRequestBody.response_format).toEqual({
      type: "json_object"
    });
    expect(auditRequestBody.messages[0].content).toContain(
      "The final audit records limitations, unresolved issues, risks, omissions, and continuation suggestions only."
    );
    expect(auditPromptPayload).toBeDefined();
    expect(outcome).toMatchObject({
      status: "compiled",
      draftStatus: "provisional"
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expectSafeRunApiPayload(body, secret);
    expectSafeRunApiPayload(outcome, secret);
    expectSafeRunApiPayload(detailBody, secret);
    expect(serializedSafeState).not.toContain(secret);
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("raw provider");
    expect(serializedSafeState).not.toContain("responseFormat");
    expect(serializedSafeState).not.toContain("json_object");
    expect(serializedSafeState).not.toContain("/Users/");
    expect(serializedSafeState).not.toContain("stack");
  });

  it("rejects invalid finalization response formats before provider calls", () => {
    const cases = [
      OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR,
      OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR
    ];

    for (const responseFormatEnvVar of cases) {
      const fetch = createOpenAICompatibleFinalizationFetch();
      let thrown: unknown;

      try {
        createDaemonApp({
          idGenerator: createIds(),
          clock,
          enableOpenAICompatibleProfile: true,
          enableOpenAICompatibleFinalization: true,
          openAICompatibleEnv: {
            [responseFormatEnvVar]: "json_schema"
          },
          openAICompatibleFetch: fetch
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
      expect((thrown as OpenAICompatibleAdapterError).safeCategory).toBe(
        "provider_config_invalid"
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it("retries malformed provider finalization output once without storing rejected text", async () => {
    const cases = [
      {
        rejectedResponseMarker: "FINAL_CANDIDATE_REJECTED_PROSE_WRAPPER",
        contentTransforms: [
          (content: string) => `FINAL_CANDIDATE_REJECTED_PROSE_WRAPPER\n${content}`,
          (content: string) => content,
          (content: string) => content
        ],
        expectedCalls: 3,
        retryCallIndex: 1
      },
      {
        rejectedResponseMarker: "FINAL_AUDIT_REJECTED_PROSE_WRAPPER",
        contentTransforms: [
          (content: string) => content,
          (content: string) => `FINAL_AUDIT_REJECTED_PROSE_WRAPPER\n${content}`,
          (content: string) => content
        ],
        expectedCalls: 3,
        retryCallIndex: 2
      }
    ] as const;

    for (const testCase of cases) {
      const fetch = createOpenAICompatibleFinalizationFetch({
        contentTransforms: testCase.contentTransforms
      });
      const daemonApp = createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableLocalPreset: true,
        enableOpenAICompatibleProfile: true,
        enableOpenAICompatibleFinalization: true,
        openAICompatibleEnv: {
          [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
          [OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR]:
            "final-candidate-provider",
          [OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR]: "final-audit-provider",
          [OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR]: "json_object",
          [OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR]: "json_object"
        },
        openAICompatibleFetch: fetch
      });
      const created = await createRun(daemonApp, openAICompatibleFinalizationRunPlan());
      const response = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/start`,
        openAICompatibleFinalizationStartRequest()
      );
      const body = (await response.json()) as {
        stages: Array<{
          stage: string;
          status?: string;
        }>;
      };
      const retryRequest = JSON.parse(
        getOpenAICompatibleFetchCall(fetch, testCase.retryCallIndex)[1].body
      ) as {
        messages: Array<{ role: string; content: string }>;
        response_format?: unknown;
      };
      const serializedSafeState = JSON.stringify({
        body,
        detail: await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json(),
        storedRun: daemonApp.runStore.getRun(created.run.runId),
        events: daemonApp.eventStore.listEvents(created.run.sessionId)
      });

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(testCase.expectedCalls);
      expect(retryRequest.messages).toHaveLength(3);
      expect(retryRequest.messages[2]).toMatchObject({
        role: "user",
        content: expect.stringContaining(
          "The previous response was rejected because it was not exactly one JSON object."
        )
      });
      expect(JSON.stringify(retryRequest)).not.toContain(testCase.rejectedResponseMarker);
      expect(retryRequest.response_format).toEqual({
        type: "json_object"
      });
      expect(body.stages.find((stage) => stage.stage === "finalization")).toMatchObject({
        status: "completed"
      });
      expect(serializedSafeState).not.toContain(testCase.rejectedResponseMarker);
      expect(serializedSafeState).not.toContain("sk-openai-runtime-secret");
      expect(serializedSafeState).not.toContain("Authorization");
      expect(serializedSafeState).not.toContain("Bearer");
      expect(serializedSafeState).not.toContain("/Users/");
      expect(serializedSafeState).not.toContain("stack");
    }
  });

  it("surfaces safe provider finalization contract failures without retrying", async () => {
    const cases = [
      {
        contents: [
          JSON.stringify({
            candidateIds: ["missing-candidate"],
            recommendation: "Invalid candidate reference.",
            rationale: "This should fail candidate validation."
          })
        ],
        expectedCalls: 1,
        finalCandidateErrorCategory: "final_candidate_validation_failed",
        rejectedResponseMarker: "missing-candidate"
      },
      {
        contentTransforms: [
          (content: string) => content,
          () => JSON.stringify({
            findings: [],
            risks: [],
            unresolvedObjectionIds: ["missing-objection"],
            qualityObligationIds: [],
            evidenceNeedIds: [],
            omissions: [],
            compressionProblems: [],
            limitations: [],
            continuationSuggestions: []
          })
        ],
        expectedCalls: 2,
        auditErrorCategory: "final_audit_validation_failed",
        rejectedResponseMarker: "missing-objection"
      }
    ] as const;

    for (const testCase of cases) {
      const fetch = createOpenAICompatibleFinalizationFetch({
        contents: "contents" in testCase ? testCase.contents : undefined,
        contentTransforms:
          "contentTransforms" in testCase ? testCase.contentTransforms : undefined
      });
      const daemonApp = createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableLocalPreset: true,
        enableOpenAICompatibleProfile: true,
        enableOpenAICompatibleFinalization: true,
        openAICompatibleEnv: {
          [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret",
          [OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR]:
            "final-candidate-provider",
          [OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR]: "final-audit-provider"
        },
        openAICompatibleFetch: fetch
      });
      const created = await createRun(daemonApp, openAICompatibleFinalizationRunPlan());
      const response = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/start`,
        openAICompatibleFinalizationStartRequest()
      );
      const body = (await response.json()) as {
        stages: Array<{
          stage: string;
          result: {
            finalCandidateResult?: {
              errorCategory?: string;
            };
            auditResults?: Array<{
              errorCategory?: string;
            }>;
          };
        }>;
      };
      const finalizationResult = body.stages.find((stage) => stage.stage === "finalization")
        ?.result;
      const serializedSafeState = JSON.stringify({
        body,
        detail: await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json(),
        storedRun: daemonApp.runStore.getRun(created.run.runId),
        events: daemonApp.eventStore.listEvents(created.run.sessionId)
      });

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(testCase.expectedCalls);
      if ("finalCandidateErrorCategory" in testCase) {
        expect(finalizationResult?.finalCandidateResult).toMatchObject({
          errorCategory: testCase.finalCandidateErrorCategory
        });
        expect(finalizationResult?.auditResults).toEqual([]);
      } else {
        expect(finalizationResult?.auditResults?.[0]).toMatchObject({
          errorCategory: testCase.auditErrorCategory
        });
      }
      expect(serializedSafeState).not.toContain(testCase.rejectedResponseMarker);
      expect(serializedSafeState).not.toContain("sk-openai-runtime-secret");
      expect(serializedSafeState).not.toContain("Authorization");
      expect(serializedSafeState).not.toContain("Bearer");
      expect(serializedSafeState).not.toContain("/Users/");
      expect(serializedSafeState).not.toContain("stack");
    }
  });

  it("does not override explicitly injected adapter registries with the OpenAI-compatible profile", async () => {
    const fetch = createOpenAICompatibleFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
      },
      openAICompatibleFetch: fetch,
      runAdapterRegistry: new AdapterRegistry()
    });
    const created = await createRun(daemonApp, openAICompatibleRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "orchestration_component_unavailable",
        message: "Required orchestration component is unavailable."
      }
    });
    expect(fetch).not.toHaveBeenCalled();
    expectSafeRunApiPayload(body);
  });

  it("keeps local preset execution unchanged when both daemon profiles are enabled", async () => {
    const fetch = createOpenAICompatibleFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: "sk-openai-runtime-secret"
      },
      openAICompatibleFetch: fetch
    });
    const created = await createRun(daemonApp, localPresetRunPlan());
    const response = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      localPresetStartRequest()
    );
    const body = (await response.json()) as {
      stopped: boolean;
      stages: Array<{ stage: string; executionStatus: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.stopped).toBe(false);
    expect(body.stages.map((stage) => stage.stage)).toEqual([
      "sealed_divergence",
      "extraction",
      "proposal_review",
      "finalization"
    ]);
    expect(body.stages.every((stage) => stage.executionStatus === "executed")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expectSafeRunApiPayload(body);
  });

  it("keeps injected provider secrets out of run responses, ledger events, and errors", async () => {
    const secret = "sk-runtime-secret";
    const daemonApp = createRunDaemon({ providerSecret: secret });
    const created = await createRun(daemonApp, orchestratedRunPlan({ providerConfig: true }));
    const startResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    const detailResponse = await daemonApp.app.request(`/runs/${created.run.runId}`);
    const listResponse = await daemonApp.app.request("/runs");
    const outcomeResponse = await daemonApp.app.request(`/runs/${created.run.runId}/outcome`);
    const errorResponse = await daemonApp.app.request("/runs/missing-run", {
      headers: {
        Authorization: `Bearer ${secret}`
      }
    });
    const payloads = [
      await startResponse.json(),
      await detailResponse.json(),
      await listResponse.json(),
      await outcomeResponse.json(),
      await errorResponse.json(),
      {
        events: daemonApp.eventStore.listEvents(created.run.sessionId)
      }
    ];

    expect(startResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(listResponse.status).toBe(200);
    expect(outcomeResponse.status).toBe(200);
    expect(errorResponse.status).toBe(404);

    for (const payload of payloads) {
      expectSafeRunApiPayload(payload, secret);
    }
    expect(JSON.stringify(daemonApp.runStore.getRun(created.run.runId))).not.toContain(secret);
  });

  it("run events endpoint returns the current safe ledger timeline without semantic projections", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const startResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    const response = await daemonApp.app.request(`/runs/${created.run.runId}/events`);
    const text = await response.text();
    const body = JSON.parse(text) as {
      runId: string;
      sessionId: string;
      events: Array<{ id: string; type: string; sequence: number; payload: unknown }>;
    };

    expect(startResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body.runId).toBe(created.run.runId);
    expect(body.sessionId).toBe(created.run.sessionId);
    expect(body.events.map((event) => event.sequence)).toEqual(
      [...body.events.map((event) => event.sequence)].sort((left, right) => left - right)
    );
    expect(body.events.map((event) => event.type)).toEqual(
      daemonApp.eventStore.listEvents(created.run.sessionId).map((event) => event.type)
    );
    expect(body.events.some((event) => event.type === "sealed_batch_opened")).toBe(true);
    expect(body.events.some((event) => event.type === "final_candidate_proposed")).toBe(true);
    expect(text).not.toContain("accepted_active_candidates");
    expect(text).not.toContain("candidateFrontierSummary");
    expect(text).not.toContain("finalAnswer");
    expect(text).not.toContain("truthSummary");
    expectSafeRunApiPayload(body);
  });

  it("run events endpoint redacts unrevealed sealed, private, and redacted payloads", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp, orchestratedRunPlan({ revealPolicy: "manual" }));
    const startResponse = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {}
    });
    const privateEvent = daemonApp.eventStore.appendEvent({
      id: "run-events-private-event",
      sessionId: created.run.sessionId,
      schemaVersion: "1",
      type: "daemon_private_test_event",
      authorId: "system",
      createdAt: clock(),
      basedOnEventIds: [],
      visibility: "private",
      trace: {},
      payload: {
        hidden: "run events private payload must stay hidden"
      }
    });
    const redactedEvent = daemonApp.eventStore.appendEvent({
      id: "run-events-redacted-event",
      sessionId: created.run.sessionId,
      schemaVersion: "1",
      type: "daemon_redacted_test_event",
      authorId: "system",
      createdAt: clock(),
      basedOnEventIds: [],
      visibility: "redacted",
      trace: {},
      payload: {
        hidden: "run events redacted payload must stay hidden"
      }
    });
    const response = await daemonApp.app.request(`/runs/${created.run.runId}/events`);
    const text = await response.text();
    const body = JSON.parse(text) as {
      events: Array<{ id: string; type: string; payload: unknown }>;
    };
    const sealedContribution = body.events.find(
      (event) => event.type === "sealed_contribution_submitted"
    );
    const privateView = body.events.find((event) => event.id === privateEvent.id);
    const redactedView = body.events.find((event) => event.id === redactedEvent.id);

    expect(startResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(sealedContribution?.payload).toEqual({
      redacted: true,
      reason: "sealed_until_reveal"
    });
    expect(privateView?.payload).toEqual({
      redacted: true,
      reason: "event_visibility"
    });
    expect(redactedView?.payload).toEqual({
      redacted: true,
      reason: "event_visibility"
    });
    expect(text).not.toContain(
      "The local daemon can control execution without owning semantic state."
    );
    expect(text).not.toContain("run events private payload must stay hidden");
    expect(text).not.toContain("run events redacted payload must stay hidden");
    expectSafeRunApiPayload(body);
  });

  it("run SSE streams only new ledger events without projection or outcome summaries", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const response = await daemonApp.app.request(`/runs/${created.run.runId}/events/stream`);

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

    await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });

    const chunk = await Promise.race([
      pendingRead,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for run SSE event.")), 1000);
      })
    ]);
    const text = new TextDecoder().decode(chunk.value);
    const frames = parseSseFramesText(text);
    const events = sseEventData(frames);
    const openedEvent = events.find((event) => event.type === "sealed_batch_opened");

    expect(text).toContain("event: event");
    expect(text).toContain("sealed_batch_opened");
    expect(openedEvent?.payload).toEqual(
      expect.objectContaining({
        status: "open"
      })
    );
    expect(text).not.toContain("accepted_active_candidates");
    expect(text).not.toContain("candidateFrontierSummary");
    expect(text).not.toContain("finalAnswer");
    expect(text).not.toContain("truthSummary");

    await reader.cancel();
  });

  it("run SSE redacts unrevealed sealed contribution payloads during manual reveal", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp, orchestratedRunPlan({ revealPolicy: "manual" }));
    const response = await daemonApp.app.request(`/runs/${created.run.runId}/events/stream`);

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const framesPromise = readSseFramesUntil(reader, (frames) =>
      sseEventData(frames).some((event) => event.type === "sealed_contribution_submitted")
    );

    const startResponse = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {}
    });
    const startBody = (await startResponse.json()) as { stopped: boolean; stopReason?: string };
    const frames = await framesPromise;
    const events = sseEventData(frames);
    const contributionEvent = events.find((event) => event.type === "sealed_contribution_submitted");
    const storedEvents = daemonApp.eventStore.listEvents(created.run.sessionId);
    const serializedFrames = JSON.stringify(frames);

    expect(startResponse.status).toBe(200);
    expect(startBody).toMatchObject({
      stopped: true,
      stopReason: "waiting_for_reveal"
    });
    expect(storedEvents.some((event) => event.type === "sealed_contribution_submitted")).toBe(true);
    expect(storedEvents.some((event) => event.type === "sealed_batch_revealed")).toBe(false);
    expect(JSON.stringify(storedEvents)).toContain(
      "The local daemon can control execution without owning semantic state."
    );
    expect(serializedFrames).not.toContain(
      "The local daemon can control execution without owning semantic state."
    );
    expect(contributionEvent?.payload).toEqual({
      redacted: true,
      reason: "sealed_until_reveal"
    });

    await reader.cancel();
  });

  it("run SSE redacts private and redacted event payloads", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const response = await daemonApp.app.request(`/runs/${created.run.runId}/events/stream`);

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const framesPromise = readSseFramesUntil(reader, (frames) =>
      sseEventData(frames).filter((event) =>
        event.type === "daemon_private_test_event" ||
        event.type === "daemon_redacted_test_event"
      ).length === 2
    );
    const privateEvent = daemonApp.eventStore.appendEvent({
      id: "run-sse-private-event",
      sessionId: created.run.sessionId,
      schemaVersion: "1",
      type: "daemon_private_test_event",
      authorId: "system",
      createdAt: clock(),
      basedOnEventIds: [],
      visibility: "private",
      trace: {},
      payload: {
        hidden: "run sse private payload must stay hidden"
      }
    });
    const redactedEvent = daemonApp.eventStore.appendEvent({
      id: "run-sse-redacted-event",
      sessionId: created.run.sessionId,
      schemaVersion: "1",
      type: "daemon_redacted_test_event",
      authorId: "system",
      createdAt: clock(),
      basedOnEventIds: [],
      visibility: "redacted",
      trace: {},
      payload: {
        hidden: "run sse redacted payload must stay hidden"
      }
    });

    daemonApp.eventBus.publish(privateEvent);
    daemonApp.eventBus.publish(redactedEvent);

    const frames = await framesPromise;
    const events = sseEventData(frames);
    const privateView = events.find((event) => event.type === "daemon_private_test_event");
    const redactedView = events.find((event) => event.type === "daemon_redacted_test_event");
    const serializedFrames = JSON.stringify(frames);

    expect(serializedFrames).not.toContain("run sse private payload must stay hidden");
    expect(serializedFrames).not.toContain("run sse redacted payload must stay hidden");
    expect(privateView?.payload).toEqual({
      redacted: true,
      reason: "event_visibility"
    });
    expect(redactedView?.payload).toEqual({
      redacted: true,
      reason: "event_visibility"
    });

    await reader.cancel();
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

  it("does not publish duplicate events for idempotent mutation retries", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const { sessionId } = await createSession(daemonApp);
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    const firstOpen = (await (
      await postJson(daemonApp.app, `/sessions/${sessionId}/batches`, {
        purpose: "initial_divergence",
        revealPolicy: "manual",
        idempotencyKey: "open-batch"
      })
    ).json()) as { batchId: string; event: { id: string } };
    const retryOpen = (await (
      await postJson(daemonApp.app, `/sessions/${sessionId}/batches`, {
        purpose: "initial_divergence",
        revealPolicy: "manual",
        idempotencyKey: "open-batch"
      })
    ).json()) as { batchId: string; event: { id: string } };

    expect(retryOpen).toEqual(firstOpen);
    expect(received).toEqual([
      {
        id: firstOpen.event.id,
        type: "sealed_batch_opened"
      }
    ]);

    const firstContribution = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/batches/${firstOpen.batchId}/contributions`,
        {
          authorId: "participant-1",
          payload: {
            message: "same logical contribution"
          },
          idempotencyKey: "contribution"
        }
      )
    ).json()) as { event: { id: string } };
    const retryContribution = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/batches/${firstOpen.batchId}/contributions`,
        {
          authorId: "participant-1",
          payload: {
            message: "same logical contribution"
          },
          idempotencyKey: "contribution"
        }
      )
    ).json()) as { event: { id: string } };

    expect(retryContribution).toEqual(firstContribution);
    expect(received.map((event) => event.type)).toEqual([
      "sealed_batch_opened",
      "sealed_contribution_submitted"
    ]);

    const firstExtraction = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/extractions`,
        {
          ...extractionInput(firstContribution.event.id),
          idempotencyKey: "extraction"
        }
      )
    ).json()) as { proposalId: string; event: { id: string } };
    const retryExtraction = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/extractions`,
        {
          ...extractionInput(firstContribution.event.id),
          idempotencyKey: "extraction"
        }
      )
    ).json()) as { proposalId: string; event: { id: string } };

    expect(retryExtraction).toEqual(firstExtraction);
    expect(received.map((event) => event.type)).toEqual([
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "extraction_proposed"
    ]);

    const firstChallenge = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/proposals/${firstExtraction.event.id}/challenges`,
        {
          authorId: "participant-2",
          reason: "same challenge",
          idempotencyKey: "challenge"
        }
      )
    ).json()) as { event: { id: string } };
    const retryChallenge = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/proposals/${firstExtraction.event.id}/challenges`,
        {
          authorId: "participant-2",
          reason: "same challenge",
          idempotencyKey: "challenge"
        }
      )
    ).json()) as { event: { id: string } };

    expect(retryChallenge).toEqual(firstChallenge);
    expect(received.map((event) => event.type)).toEqual([
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "extraction_proposed",
      "proposal_challenged"
    ]);

    const firstAcceptance = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/proposals/${firstExtraction.event.id}/acceptance`,
        {
          authorId: "participant-2",
          rationale: "same acceptance",
          idempotencyKey: "acceptance"
        }
      )
    ).json()) as { event: { id: string } };
    const retryAcceptance = (await (
      await postJson(
        daemonApp.app,
        `/sessions/${sessionId}/proposals/${firstExtraction.event.id}/acceptance`,
        {
          authorId: "participant-2",
          rationale: "same acceptance",
          idempotencyKey: "acceptance"
        }
      )
    ).json()) as { event: { id: string } };

    expect(retryAcceptance).toEqual(firstAcceptance);
    expect(received.map((event) => event.type)).toEqual([
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "extraction_proposed",
      "proposal_challenged",
      "proposal_accepted"
    ]);

    const closeResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/batches/${firstOpen.batchId}/close`,
      {
        idempotencyKey: "close"
      }
    );
    const closeRetryResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/batches/${firstOpen.batchId}/close`,
      {
        idempotencyKey: "close"
      }
    );

    expect(closeResponse.status).toBe(201);
    expect(closeRetryResponse.status).toBe(400);
    expect(received.map((event) => event.type)).toEqual([
      "sealed_batch_opened",
      "sealed_contribution_submitted",
      "extraction_proposed",
      "proposal_challenged",
      "proposal_accepted",
      "sealed_batch_revealed"
    ]);

    unsubscribe();
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
    const contribution = (await contributionResponse.json()) as { event: { id: string } };
    expect(contextResponse.status).toBe(200);
    expectNoStore(contextResponse);
    expect(contextText).toContain("redacted");
    expect(contextText).toContain("sealed_until_reveal");
    expect(contextText).not.toContain("sealed payload must stay hidden");

    const storedContribution = daemonApp.eventStore.getEvent(contribution.event.id);
    expect(storedContribution?.payload).toEqual({
      secretNote: "sealed payload must stay hidden"
    });

    const revealResponse = await postJson(
      daemonApp.app,
      `/sessions/${sessionId}/batches/${batchId}/close`,
      {}
    );
    const revealedContextText = await (
      await daemonApp.app.request(webgetPath(webget.startUrl, "/context/events"))
    ).text();

    expect(revealResponse.status).toBe(201);
    expect(revealedContextText).toContain("sealed payload must stay hidden");
  });

  it("WebGET context redacts private and redacted event payloads while exposing public payloads", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetTokenGenerator: createTokenGenerator()
    });
    const { sessionId } = await createSession(daemonApp);
    const publicEvent = daemonApp.eventStore.appendEvent({
      id: "public-context-event",
      sessionId,
      schemaVersion: "1",
      type: "context_public",
      authorId: "system",
      createdAt: "2026-06-10T00:00:00.000Z",
      basedOnEventIds: [],
      visibility: "public",
      trace: {},
      payload: {
        note: "public payload may be visible"
      }
    });
    const privateEvent = daemonApp.eventStore.appendEvent({
      id: "private-context-event",
      sessionId,
      schemaVersion: "1",
      type: "context_private",
      authorId: "system",
      createdAt: "2026-06-10T00:00:00.000Z",
      basedOnEventIds: [publicEvent.id],
      visibility: "private",
      trace: {
        promptHash: "private-event-trace-hash"
      },
      payload: {
        secretNote: "private payload must not leak"
      }
    });
    const redactedEvent = daemonApp.eventStore.appendEvent({
      id: "redacted-context-event",
      sessionId,
      schemaVersion: "1",
      type: "context_redacted",
      authorId: "system",
      createdAt: "2026-06-10T00:00:00.000Z",
      basedOnEventIds: [],
      visibility: "redacted",
      trace: {},
      payload: {
        secretNote: "redacted payload must not leak"
      }
    });
    const webget = daemonApp.createWebGETSession({
      sessionId,
      batchId: "context-batch",
      participantId: "participant-web"
    });
    const contextResponse = await daemonApp.app.request(webgetPath(webget.startUrl, "/context/events"));
    const contextText = await contextResponse.clone().text();
    const contextBody = (await contextResponse.json()) as {
      events: Array<{
        id: string;
        type: string;
        sessionId: string;
        sequence: number;
        visibility: string;
        basedOnEventIds: string[];
        trace: unknown;
        payload: unknown;
      }>;
    };
    const eventsById = new Map(contextBody.events.map((event) => [event.id, event]));

    expect(contextResponse.status).toBe(200);
    expectNoStore(contextResponse);
    expect(eventsById.get(publicEvent.id)?.payload).toEqual({
      note: "public payload may be visible"
    });
    expect(eventsById.get(privateEvent.id)).toMatchObject({
      id: privateEvent.id,
      type: "context_private",
      sessionId,
      sequence: privateEvent.sequence,
      visibility: "private",
      basedOnEventIds: [publicEvent.id],
      trace: {
        promptHash: "private-event-trace-hash"
      },
      payload: {
        redacted: true,
        reason: "event_visibility"
      }
    });
    expect(eventsById.get(redactedEvent.id)?.payload).toEqual({
      redacted: true,
      reason: "event_visibility"
    });
    expect(contextText).toContain("public payload may be visible");
    expect(contextText).not.toContain("private payload must not leak");
    expect(contextText).not.toContain("redacted payload must not leak");
    expect(daemonApp.eventStore.getEvent(privateEvent.id)?.payload).toEqual({
      secretNote: "private payload must not leak"
    });
    expect(daemonApp.eventStore.getEvent(redactedEvent.id)?.payload).toEqual({
      secretNote: "redacted payload must not leak"
    });
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

  it("WebGET commit does not republish when a second token hits the same contribution idempotency key", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      webgetTokenGenerator: createTokenGenerator(["Q".repeat(32), "R".repeat(32)])
    });
    const { sessionId, batchId, webget: firstWebGET } = await createWebGETBatch(daemonApp);
    const secondWebGET = daemonApp.createWebGETSession({
      sessionId,
      batchId,
      participantId: "participant-web"
    });
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    const firstResponse = await submitAndCommitWebGET(daemonApp, firstWebGET.startUrl);
    const firstBody = (await firstResponse.json()) as { event: { id: string; type: string } };
    const countAfterFirst = daemonApp.eventStore.listEvents(sessionId).length;
    const secondResponse = await submitAndCommitWebGET(daemonApp, secondWebGET.startUrl);
    const secondBody = (await secondResponse.json()) as { event: { id: string; type: string } };

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondBody.event).toEqual(firstBody.event);
    expect(daemonApp.eventStore.listEvents(sessionId)).toHaveLength(countAfterFirst);
    expect(received).toEqual([
      {
        id: firstBody.event.id,
        type: "sealed_contribution_submitted"
      }
    ]);

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
    const allowedOpenAICompatibleProfileExports = new Set([
      "OPENAI_COMPATIBLE_ADAPTER_ID",
      "OPENAI_COMPATIBLE_API_KEY_ENV_VAR",
      "OPENAI_COMPATIBLE_BASE_URL_ENV_VAR",
      "OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID",
      "OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH",
      "OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR",
      "OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR",
      "OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID",
      "OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR",
      "OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR",
      "OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR",
      "OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR",
      "OPENAI_COMPATIBLE_FINAL_AUDITOR_ID",
      "OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID",
      "OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR",
      "OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR",
      "OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR",
      "OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR",
      "OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR",
      "OPENAI_COMPATIBLE_MODEL_ENV_VAR",
      "OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR",
      "OPENAI_COMPATIBLE_PROFILE_ENV_VAR",
      "OPENAI_COMPATIBLE_REVIEW_ENV_VAR",
      "OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR",
      "OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR",
      "OPENAI_COMPATIBLE_REVIEWER_ID",
      "OPENAI_COMPATIBLE_STREAM_ENV_VAR",
      "OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR",
      "OPENAI_COMPATIBLE_THINKING_ENV_VAR",
      "OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR",
      "OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR",
      "OPENAI_COMPATIBLE_TOP_P_ENV_VAR",
      "createOpenAICompatibleRunRegistries",
      "createOpenAICompatibleRuntimeEnv",
      "isOpenAICompatibleExtractionEnabledFromEnv",
      "isOpenAICompatibleFinalizationEnabledFromEnv",
      "isOpenAICompatibleProfileEnabledFromEnv",
      "isOpenAICompatibleReviewEnabledFromEnv",
      "OpenAICompatibleExtractionGenerator",
      "OpenAICompatibleExtractionGeneratorError",
      "OpenAICompatibleFinalAuditGenerator",
      "OpenAICompatibleFinalCandidateGenerator",
      "OpenAICompatibleFinalizationGeneratorError",
      "OpenAICompatibleReviewGenerator",
      "OpenAICompatibleReviewGeneratorError",
      "resolveStartDaemonEnableOpenAICompatibleExtraction",
      "resolveStartDaemonEnableOpenAICompatibleFinalization",
      "resolveStartDaemonEnableOpenAICompatibleProfile",
      "resolveStartDaemonEnableOpenAICompatibleReview"
    ]);
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
        if (
          forbiddenTerm === "OpenAI" &&
          allowedOpenAICompatibleProfileExports.has(exportedName)
        ) {
          continue;
        }

        expect(exportedName).not.toContain(forbiddenTerm);
      }
    }
  });
});
