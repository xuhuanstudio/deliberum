import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HttpTemplateAdapterError,
  McpToolAdapterError,
  OpenAICompatibleAdapterError,
  type FetchLike,
  type HttpTemplateFetchInit,
  type HttpTemplateFetchLike,
  type JsonValue,
  type OpenAICompatibleFetchInit
} from "@deliberum/adapters";
import {
  RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE,
  RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE,
  RESOURCE_DELIVERY_PLANNED_EVENT_TYPE
} from "@deliberum/core";
import { InMemoryResourceBroker } from "@deliberum/resources";
import { InMemoryEventStore, SQLiteEventStore } from "@deliberum/storage";
import {
  AdapterRegistry,
  CandidateRepairGeneratorRegistry,
  EvidenceCheckGeneratorRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  InMemoryRunStore,
  ProposalReviewGeneratorRegistry,
  type CandidateRepairContext,
  type CandidateRepairGenerator,
  type EvidenceCheckContext,
  type EvidenceCheckGenerator,
  type EvidenceCheckGeneratorResult,
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
  DAEMON_AUTH_TOKEN_ENV_VAR,
  DAEMON_AUTH_TOKENS_JSON_ENV_VAR,
  DAEMON_CORS_ORIGINS_ENV_VAR,
  DAEMON_EVENT_STORE_PATH_ENV_VAR,
  DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR,
  DAEMON_OPERATION_AUDIT_PATH_ENV_VAR,
  DAEMON_RUN_STORE_PATH_ENV_VAR,
  DAEMON_SQLITE_PATH_ENV_VAR,
  DAEMON_WEB_ASSETS_PATH_ENV_VAR,
  DEFAULT_DAEMON_CORS_ORIGINS,
  HTTP_TEMPLATE_ADAPTER_ID,
  HTTP_TEMPLATE_API_KEY_ENV_VAR,
  HTTP_TEMPLATE_BASE_URL_ENV_VAR,
  HTTP_TEMPLATE_BODY_ENV_VAR,
  HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR,
  HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR,
  HTTP_TEMPLATE_METHOD_ENV_VAR,
  HTTP_TEMPLATE_PROFILE_ENV_VAR,
  HTTP_TEMPLATE_RESPONSE_FORMAT_ENV_VAR,
  HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH_ENV_VAR,
  HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH_ENV_VAR,
  HTTP_TEMPLATE_TIMEOUT_MS_ENV_VAR,
  HTTP_TEMPLATE_URL_ENV_VAR,
  LOCAL_PRESET_ENV_VAR,
  MCP_TOOL_ADAPTER_ID,
  MCP_TOOL_ALLOWED_ARGUMENT_KEYS_ENV_VAR,
  MCP_TOOL_ALLOW_REMOTE_ENV_VAR,
  MCP_TOOL_AUTH_TOKEN_ENV_VAR,
  MCP_TOOL_INCLUDE_CONTEXT_ENV_VAR,
  MCP_TOOL_MAX_ARGUMENT_BYTES_ENV_VAR,
  MCP_TOOL_NAME_ENV_VAR,
  MCP_TOOL_PROFILE_ENV_VAR,
  MCP_TOOL_TIMEOUT_MS_ENV_VAR,
  MCP_TOOL_URL_ENV_VAR,
  MCP_TOOL_VERIFY_LIST_ENV_VAR,
  OPENAI_COMPATIBLE_ADAPTER_ID,
  OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
  OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
  OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
  OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR,
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
  OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR,
  OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR,
  OPENAI_COMPATIBLE_TOP_P_ENV_VAR,
  DAEMON_HOST_ENV_VAR,
  DAEMON_OPERATION_AUDIT_EXPORT_ALLOW_INSECURE_HTTP_ENV_VAR,
  DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS_ENV_VAR,
  DAEMON_OPERATION_AUDIT_EXPORT_TOKEN_ENV_VAR,
  DAEMON_OPERATION_AUDIT_EXPORT_URL_ENV_VAR,
  DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES_ENV_VAR,
  DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES_ENV_VAR,
  DAEMON_OPERATION_AUDIT_JSONL_PATH_ENV_VAR,
  DAEMON_PORT_ENV_VAR,
  DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR,
  DAEMON_SQLITE_PROCESS_LOCK_HEARTBEAT_MS_ENV_VAR,
  DAEMON_SQLITE_PROCESS_LOCK_TTL_MS_ENV_VAR,
  RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR,
  RESOURCE_ACCESS_BASE_URL_ENV_VAR,
  RESOURCE_ACCESS_SIGNING_SECRET_ENV_VAR,
  RESOURCE_ACCESS_TTL_MS_ENV_VAR,
  RESOURCE_ACCESS_URL_EXPIRES_AT_QUERY_PARAM,
  RESOURCE_ACCESS_URL_SIGNATURE_QUERY_PARAM,
  createStartDaemonOperationAuditLog,
  createStartDaemonEventStore,
  createStartDaemonResourceAccessStore,
  createStartDaemonResourceStore,
  createStartDaemonRunStore,
  createStartDaemonSQLiteProcessLock,
  createStartDaemonWebStaticAssets,
  createDaemonApp,
  createOpenAICompatibleRunRegistries,
  localPresetRunPlan,
  localPresetStartRequest,
  parseDaemonCorsOriginsFromEnv,
  resolveStartDaemonOperationAuditMaxEntries,
  resolveStartDaemonOperationAuditPath,
  resolveStartDaemonOperationAuditJsonlMaxBytes,
  resolveStartDaemonOperationAuditJsonlMaxFiles,
  resolveStartDaemonOperationAuditJsonlPath,
  resolveStartDaemonOperationAuditExportAllowInsecureHttp,
  resolveStartDaemonOperationAuditExportTimeoutMs,
  resolveStartDaemonOperationAuditExportToken,
  resolveStartDaemonOperationAuditExportUrl,
  resolveStartDaemonWebAssetsPath,
  resolveStartDaemonEventStorePath,
  resolveStartDaemonRunStorePath,
  resolveStartDaemonHost,
  resolveStartDaemonPort,
  resolveStartDaemonAuthToken,
  resolveStartDaemonAuthTokens,
  resolveStartDaemonResourceAccessBaseUrl,
  resolveStartDaemonResourceAccessAllowRemote,
  resolveStartDaemonResourceAccessSigningSecret,
  resolveStartDaemonResourceAccessTtlMs,
  resolveStartDaemonSQLiteProcessLock,
  resolveStartDaemonSQLiteProcessLockHeartbeatMs,
  resolveStartDaemonSQLitePath,
  resolveStartDaemonSQLiteProcessLockTtlMs,
  resolveStartDaemonEnableOpenAICompatibleExtraction,
  resolveStartDaemonEnableOpenAICompatibleFinalization,
  resolveStartDaemonEnableOpenAICompatibleProfile,
  resolveStartDaemonEnableOpenAICompatibleReview,
  resolveStartDaemonEnableHttpTemplateProfile,
  resolveStartDaemonEnableMcpToolProfile,
  resolveStartDaemonEnableLocalPreset,
  ResourceAccessGrantStore,
  SQLiteDaemonProcessLock,
  SQLiteDaemonProcessLockError,
  JsonFileOperationAuditLog,
  MirroredOperationAuditLog,
  SQLiteOperationAuditLog,
  SQLiteResourceAccessGrantStore,
  SQLiteRunStore,
  startDaemon,
  type DaemonApp,
  type McpToolFetchInit,
  type McpToolFetchLike
} from "../src";
import { SQLiteResourceBroker } from "../src/sqlite-resource-broker";
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

function operationAuditInput(action: string) {
  return {
    action,
    method: "GET",
    route: "/runtime/profiles",
    statusCode: 200,
    outcome: "succeeded" as const,
    authorization: {
      mode: "daemon_bearer" as const,
      present: true
    },
    target: {}
  };
}

function readJsonlFile(filePath: string): unknown[] {
  return readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
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

function closeStartedDaemon(daemonInstance: ReturnType<typeof startDaemon>): Promise<void> {
  return new Promise((resolve, reject) => {
    daemonInstance.server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
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

async function createSession(
  daemonApp: DaemonApp
): Promise<{ sessionId: string; event: { id: string; type: string } }> {
  const response = await postJson(daemonApp.app, "/sessions", {
    topicContract: topicContract()
  });

  expect(response.status).toBe(201);
  return (await response.json()) as { sessionId: string; event: { id: string; type: string } };
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

function httpTemplateRunPlan() {
  return {
    title: "HTTP-template sealed divergence",
    topic: "Should Stage 22B expose opt-in HTTP-template provider-backed sealed participants?",
    goals: ["Exercise provider-backed sealed divergence through daemon and orchestrator."],
    constraints: ["Resolve provider keys from daemon env only."],
    participants: [
      {
        id: "provider-alpha",
        kind: "model",
        displayName: "Provider alpha",
        adapterId: HTTP_TEMPLATE_ADAPTER_ID,
        providerConfigId: "provider-http-template"
      }
    ],
    providerConfigs: [
      {
        id: "provider-http-template",
        adapterId: HTTP_TEMPLATE_ADAPTER_ID,
        providerConfigId: "provider-http-template",
        modelId: "runtime-http-model",
        baseUrl: "https://runtime.example/api",
        endpointPath: "/contribute",
        apiKeyEnvVar: HTTP_TEMPLATE_API_KEY_ENV_VAR,
        timeoutMs: 1000,
        httpTemplate: {
          variables: {
            mode: "sealed-divergence"
          }
        }
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

function mcpToolRunPlan() {
  return {
    title: "MCP tool sealed divergence",
    topic: "Should Deliberum expose an opt-in MCP tool participant profile?",
    goals: ["Exercise MCP-compatible tool contributions through daemon and orchestrator."],
    constraints: ["Keep tool execution behind explicit daemon profile configuration."],
    participants: [
      {
        id: "mcp-tool-alpha",
        kind: "tool",
        displayName: "MCP tool alpha",
        adapterId: MCP_TOOL_ADAPTER_ID
      }
    ],
    providerConfigs: [],
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
      expectations: ["Return tool contribution material only."]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["mcp-tool-alpha"]
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
type MockedHttpTemplateFetchLike = ReturnType<typeof vi.fn> & HttpTemplateFetchLike;
type MockedMcpToolFetchLike = ReturnType<typeof vi.fn> & McpToolFetchLike;

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

function createOpenAICompatibleStreamingFetch(
  output = "provider streamed contribution"
): MockedFetchLike {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: vi.fn(async () => {
      throw new Error("Streaming response should not be parsed as JSON.");
    }),
    text: vi.fn(async () =>
      [
        'data: {"choices":[{"delta":{"role":"assistant"}}]}',
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: output
              }
            }
          ]
        })}`,
        "data: [DONE]"
      ].join("\n\n")
    )
  })) as unknown as MockedFetchLike;
}

function createHttpTemplateFetch(
  output: Record<string, unknown> = {
    model: "provider-http-model",
    output: {
      contribution: "HTTP-template provider sealed contribution"
    }
  }
): MockedHttpTemplateFetchLike {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: vi.fn(async () => JSON.stringify(output))
  })) as unknown as MockedHttpTemplateFetchLike;
}

function createMcpToolFetch(input: {
  toolName?: string;
  content?: string;
  structuredContent?: JsonValue;
  listTools?: boolean;
} = {}): MockedMcpToolFetchLike {
  const toolName = input.toolName ?? "deliberum.reflect";
  const content = input.content ?? "MCP tool sealed contribution";

  return vi.fn(async (_url: string, init: McpToolFetchInit) => {
    const request = JSON.parse(init.body) as {
      id: string;
      method: string;
      params?: {
        name?: string;
        arguments?: Record<string, unknown>;
      };
    };

    if (request.method === "tools/list") {
      return {
        ok: true,
        status: 200,
        json: vi.fn(async () => ({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: input.listTools === false
              ? []
              : [
                  {
                    name: toolName,
                    description: "Fixture MCP-compatible deliberation tool",
                    inputSchema: {
                      type: "object"
                    }
                  }
                ]
          }
        }))
      };
    }

    if (request.method === "tools/call") {
      return {
        ok: true,
        status: 200,
        json: vi.fn(async () => ({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              {
                type: "text",
                text: content
              }
            ],
            structuredContent: input.structuredContent ?? {
              participantId: request.params?.arguments?.context &&
                typeof request.params.arguments.context === "object"
                ? (request.params.arguments.context as { participantId?: string }).participantId
                : null
            }
          }
        }))
      };
    }

    return {
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: "Method not found"
        }
      }))
    };
  }) as unknown as MockedMcpToolFetchLike;
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

function getHttpTemplateFetchCall(
  fetch: MockedHttpTemplateFetchLike,
  index = 0
): [string, HttpTemplateFetchInit] {
  const call = fetch.mock.calls[index] as [string, HttpTemplateFetchInit] | undefined;

  if (!call) {
    throw new Error("Expected mocked HTTP-template fetch to be called.");
  }

  return call;
}

function createRunDaemon(options: {
  providerSecret?: string;
  resourceBroker?: InMemoryResourceBroker;
  resourceAccessBaseUrl?: string;
  resourceAccessUrlSigningSecret?: string;
  resourceAccessTokenGenerator?: () => string;
  resourceAccessTtlMs?: number;
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
    resourceAccessBaseUrl: options.resourceAccessBaseUrl,
    resourceAccessUrlSigningSecret: options.resourceAccessUrlSigningSecret,
    resourceAccessTokenGenerator: options.resourceAccessTokenGenerator,
    resourceAccessTtlMs: options.resourceAccessTtlMs,
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
    runCandidateRepairGeneratorRegistry: new CandidateRepairGeneratorRegistry([
      createCandidateRepairGenerator()
    ]),
    runEvidenceCheckGeneratorRegistry: new EvidenceCheckGeneratorRegistry([
      createEvidenceCheckGenerator()
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

function createCandidateRepairGenerator(): CandidateRepairGenerator {
  return {
    generatorId: "fake-repairer",
    repairCandidate(_input, context) {
      return createCandidateRepairResult(context);
    }
  };
}

function createCandidateRepairResult(context: CandidateRepairContext): ExtractionGeneratorResult {
  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];

  return {
    candidates: [
      {
        id: "candidate-daemon-run-api-repair",
        title: "Repair local daemon run orchestration API",
        description:
          "Propose a repaired daemon API candidate that keeps authority boundaries explicit.",
        sourceEventIds,
        status: "active",
        supportedBy: ["claim-daemon-repair-safe-view"],
        attackedBy: [],
        qualityObligationIds: ["quality-daemon-repair-reviewable"],
        assumptions: ["Repair proposal material still requires explicit review."],
        tradeoffs: ["The original accepted candidate remains active until a review accepts changes."]
      }
    ],
    claims: [
      {
        id: "claim-daemon-repair-safe-view",
        content:
          "The repaired candidate answers authority risk by exposing only safe operational state.",
        scope: "design",
        sourceEventIds,
        supports: ["candidate-daemon-run-api-repair"]
      }
    ],
    objections: [],
    evidenceNeeds: [],
    qualityObligations: [
      {
        id: "quality-daemon-repair-reviewable",
        scope: "candidate",
        targetCandidateId: "candidate-daemon-run-api-repair",
        requirement: "Keep repaired candidate material subject to proposal review.",
        status: "answered",
        sourceEventIds,
        supportingRefIds: ["claim-daemon-repair-safe-view"],
        unresolvedObjectionIds: []
      }
    ],
    rationale:
      "Generate candidate repair proposal material without accepting or finalizing it."
  };
}

function createEvidenceCheckGenerator(): EvidenceCheckGenerator {
  return {
    generatorId: "fake-evidence-checker",
    checkEvidence(_input, context) {
      return createEvidenceCheckResult(context);
    }
  };
}

function createEvidenceCheckResult(context: EvidenceCheckContext): EvidenceCheckGeneratorResult {
  return {
    results: context.targetEvidenceNeeds.map((evidenceNeed) => ({
      evidenceNeedId: evidenceNeed.object.id,
      source: "Deterministic daemon evidence source",
      summary: "Reported daemon evidence result for the target evidence need.",
      limitations: ["Deterministic daemon evidence is not independent verification."]
    })),
    rationale: "Record reported evidence without claiming verification."
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
  expect(text).not.toContain(HTTP_TEMPLATE_API_KEY_ENV_VAR);
  expect(text).not.toContain(MCP_TOOL_AUTH_TOKEN_ENV_VAR);

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

  it("serves configured Web assets for browser navigation without overriding JSON API routes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-web-assets-"));
    const assetsDir = join(dir, "assets");
    const secretOutsideRoot = join(tmpdir(), "deliberum-web-secret.txt");
    const outsideRootSentinel = ["do-not-serve", "this-file"].join("-");

    mkdirSync(assetsDir);
    writeFileSync(
      join(dir, "index.html"),
      '<!doctype html><html><body><div id="root">Deliberum Web Shell</div><script type="module" src="/assets/app.js"></script></body></html>'
    );
    writeFileSync(join(assetsDir, "app.js"), "console.log('web shell');");
    writeFileSync(secretOutsideRoot, outsideRootSentinel);

    try {
      const daemonApp = createDaemonApp({
        webStaticAssets: {
          rootDir: dir
        },
        idGenerator: createIds(),
        clock
      });
      const rootResponse = await daemonApp.app.request("/", {
        headers: {
          Accept: "text/html"
        }
      });
      const spaRouteResponse = await daemonApp.app.request("/runs/run-1/outcome", {
        headers: {
          Accept: "text/html,application/xhtml+xml"
        }
      });
      const postureResponse = await daemonApp.app.request("/runtime/deployment-posture");
      const apiResponse = await daemonApp.app.request("/runs");
      const assetResponse = await daemonApp.app.request("/assets/app.js");
      const traversalResponse = await daemonApp.app.request(
        "/assets/%2E%2E/deliberum-web-secret.txt"
      );
      const posture = (await postureResponse.json()) as {
        webAssets: {
          configured: boolean;
          routeMode: string;
          shellCache: string;
          assetCache: string;
        };
      };

      expect(rootResponse.status).toBe(200);
      expect(rootResponse.headers.get("content-type")).toContain("text/html");
      expect(rootResponse.headers.get("cache-control")).toBe("no-store");
      expect(rootResponse.headers.get("vary")).toContain("Accept");
      await expect(rootResponse.text()).resolves.toContain("Deliberum Web Shell");

      expect(spaRouteResponse.status).toBe(200);
      expect(spaRouteResponse.headers.get("content-type")).toContain("text/html");
      await expect(spaRouteResponse.text()).resolves.toContain("Deliberum Web Shell");

      expect(postureResponse.status).toBe(200);
      expect(posture.webAssets).toEqual({
        configured: true,
        routeMode: "html_accept_spa_shell_json_api_split",
        shellCache: "no_store",
        assetCache: "immutable"
      });
      expect(JSON.stringify(posture)).not.toContain(dir);

      expect(apiResponse.status).toBe(200);
      expect(apiResponse.headers.get("content-type")).toContain("application/json");
      await expect(apiResponse.json()).resolves.toEqual({ runs: [] });

      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get("content-type")).toContain("text/javascript");
      expect(assetResponse.headers.get("cache-control")).toContain("immutable");
      expect(assetResponse.headers.get("x-content-type-options")).toBe("nosniff");
      await expect(assetResponse.text()).resolves.toContain("web shell");

      expect(traversalResponse.status).toBe(404);
      await expect(traversalResponse.text()).resolves.not.toContain(outsideRootSentinel);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(secretOutsideRoot, { force: true });
    }
  });

  it("can opt into daemon bearer authentication without blocking health or bearer resource routes", async () => {
    const authToken = "local-daemon-auth-token-123";
    const accessId = "Y".repeat(32);
    const resourceAccessStore = new ResourceAccessGrantStore({
      clock: () => Date.parse(clock()),
      tokenGenerator: () => accessId
    });
    resourceAccessStore.createGrant({
      resourceAccessId: "resource-access-auth-test",
      sessionId: "session-auth-test",
      resourceId: "resource-auth-test",
      participantId: "participant-auth-test",
      mode: "redirect",
      exposure: "public",
      targetUrl: "https://example.com/resource.txt",
      ttlMs: 120000
    });
    const daemonApp = createDaemonApp({
      daemonAuthToken: authToken,
      resourceAccessStore,
      idGenerator: createIds(),
      clock
    });
    const healthResponse = await daemonApp.app.request("/health");
    const unauthenticatedResponse = await daemonApp.app.request("/runtime/profiles");
    const badAuthResponse = await daemonApp.app.request("/runtime/profiles", {
      headers: {
        Authorization: "Bearer wrong-token"
      }
    });
    const authorizedResponse = await daemonApp.app.request("/runtime/profiles", {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    const preflightResponse = await daemonApp.app.request("/runtime/profiles", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization"
      }
    });
    const resourceAccessResponse = await daemonApp.app.request(
      `/resource-access/${accessId}`
    );
    const webgetTokenResponse = await daemonApp.app.request(
      "/webget/missing-token/context/topic"
    );
    const unauthenticatedBody = (await unauthenticatedResponse.json()) as {
      error: { code: string; message: string };
    };
    const badAuthBody = (await badAuthResponse.json()) as {
      error: { code: string; message: string };
    };
    const unauthorizedText = JSON.stringify({
      unauthenticatedBody,
      badAuthBody
    });

    expect(healthResponse.status).toBe(200);
    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.headers.get("www-authenticate")).toBe(
      'Bearer realm="deliberum-daemon"'
    );
    expectNoStore(unauthenticatedResponse);
    expect(unauthenticatedBody.error).toEqual({
      code: "daemon_auth_required",
      message: "Daemon authentication is required."
    });
    expect(badAuthResponse.status).toBe(401);
    expectNoStore(badAuthResponse);
    expect(badAuthBody.error.code).toBe("daemon_auth_required");
    expect(authorizedResponse.status).toBe(200);
    expectNoStore(authorizedResponse);
    expect(preflightResponse.status).toBe(204);
    expect(preflightResponse.headers.get("access-control-allow-headers")).toContain(
      "Authorization"
    );
    expect(resourceAccessResponse.status).toBe(302);
    expect(resourceAccessResponse.headers.get("location")).toBe(
      "https://example.com/resource.txt"
    );
    expectNoStore(resourceAccessResponse);
    expect(webgetTokenResponse.status).toBe(400);
    expect(unauthorizedText).not.toContain(authToken);
    expect(daemonApp.eventStore.listEvents("session-auth-test")).toEqual([]);
  });

  it("supports scoped daemon auth token registries without exposing token material", async () => {
    const observerToken = "observer-daemon-token-123";
    const auditorToken = "auditor-daemon-token-123";
    const operatorToken = "operator-daemon-token-123";
    const daemonApp = createDaemonApp({
      daemonAuthTokens: [
        {
          principalId: "observer-1",
          token: observerToken,
          role: "observer"
        },
        {
          principalId: "auditor-1",
          token: auditorToken,
          role: "auditor"
        },
        {
          principalId: "operator-1",
          token: operatorToken,
          role: "operator"
        }
      ],
      idGenerator: createIds(),
      operationAuditIdGenerator: createIds(),
      clock
    });

    const readResponse = await daemonApp.app.request("/runtime/profiles", {
      headers: {
        Authorization: `Bearer ${observerToken}`
      }
    });
    const forbiddenWrite = await daemonApp.app.request("/runs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${observerToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ runPlan: localPresetRunPlan() })
    });
    const forbiddenAudit = await daemonApp.app.request("/runtime/operation-audit", {
      headers: {
        Authorization: `Bearer ${observerToken}`
      }
    });
    const auditorAudit = await daemonApp.app.request("/runtime/operation-audit", {
      headers: {
        Authorization: `Bearer ${auditorToken}`
      }
    });
    const operatorWrite = await daemonApp.app.request("/runs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ runPlan: localPresetRunPlan() })
    });
    const forbiddenBody = (await forbiddenWrite.json()) as {
      error: { code: string; message: string };
    };
    const auditEvents = daemonApp.operationAuditLog.list({ limit: 20 });
    const serializedAudit = JSON.stringify(auditEvents);

    expect(readResponse.status).toBe(200);
    expectNoStore(readResponse);
    expect(forbiddenWrite.status).toBe(403);
    expectNoStore(forbiddenWrite);
    expect(forbiddenBody.error).toEqual({
      code: "daemon_auth_forbidden",
      message: "Daemon authentication is not authorized for this operation."
    });
    expect(forbiddenAudit.status).toBe(403);
    expectNoStore(forbiddenAudit);
    expect(auditorAudit.status).toBe(200);
    expectNoStore(auditorAudit);
    expect(operatorWrite.status).toBe(201);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "runtime_profiles_read",
          statusCode: 200,
          authorization: expect.objectContaining({
            principalId: "observer-1",
            role: "observer",
            scopes: ["read"]
          })
        }),
        expect.objectContaining({
          action: "run_create",
          statusCode: 403,
          authorization: expect.objectContaining({
            principalId: "observer-1",
            role: "observer",
            scopes: ["read"]
          })
        }),
        expect.objectContaining({
          action: "operation_audit_read",
          statusCode: 200,
          authorization: expect.objectContaining({
            principalId: "auditor-1",
            role: "auditor",
            scopes: ["read", "audit"]
          })
        }),
        expect.objectContaining({
          action: "run_create",
          statusCode: 201,
          authorization: expect.objectContaining({
            principalId: "operator-1",
            role: "operator",
            scopes: ["read", "write"]
          })
        })
      ])
    );
    expect(serializedAudit).not.toContain(observerToken);
    expect(serializedAudit).not.toContain(auditorToken);
    expect(serializedAudit).not.toContain(operatorToken);
    expect(serializedAudit).not.toContain("Authorization");
  });

  it("returns safe runtime profile setup status without environment values", async () => {
    const openAISecret = "sk-openai-runtime-secret";
    const httpSecret = "http-template-runtime-secret";
    const mcpSecret = "mcp-tool-runtime-secret";
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableLocalPreset: true,
      enableOpenAICompatibleProfile: true,
      enableOpenAICompatibleExtraction: true,
      enableOpenAICompatibleReview: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: openAISecret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://openai.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "runtime-openai-model",
        [OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR]: "5000"
      },
      enableHttpTemplateProfile: true,
      httpTemplateEnv: {
        [HTTP_TEMPLATE_API_KEY_ENV_VAR]: httpSecret,
        [HTTP_TEMPLATE_URL_ENV_VAR]: "https://http-template.example/invoke",
        [HTTP_TEMPLATE_METHOD_ENV_VAR]: "POST",
        [HTTP_TEMPLATE_BODY_ENV_VAR]: "{{runtime.apiKey}} {{input.payloadJson}}"
      },
      enableMcpToolProfile: true,
      mcpToolEnv: {
        [MCP_TOOL_AUTH_TOKEN_ENV_VAR]: mcpSecret,
        [MCP_TOOL_URL_ENV_VAR]: "http://127.0.0.1:8787/mcp",
        [MCP_TOOL_NAME_ENV_VAR]: "deliberum.reflect",
        [MCP_TOOL_TIMEOUT_MS_ENV_VAR]: "5000",
        [MCP_TOOL_MAX_ARGUMENT_BYTES_ENV_VAR]: "4096",
        [MCP_TOOL_ALLOWED_ARGUMENT_KEYS_ENV_VAR]: "instructions,payload",
        [MCP_TOOL_INCLUDE_CONTEXT_ENV_VAR]: "false"
      }
    });

    const response = await daemonApp.app.request("/runtime/profiles");
    const body = (await response.json()) as {
      profiles: Array<{
        id: string;
        enabled: boolean;
        status: string;
        components: Array<{ id: string; enabled: boolean }>;
        setup: {
          enableEnvVar: string;
          envVars: Array<{
            name: string;
            configured: boolean;
            secret: boolean;
          }>;
          missingRecommendedEnvVars: string[];
        };
      }>;
    };
    const text = JSON.stringify(body);
    const localPreset = body.profiles.find((profile) => profile.id === "local-preset");
    const openAI = body.profiles.find((profile) => profile.id === "openai-compatible");
    const httpTemplate = body.profiles.find((profile) => profile.id === "http-template");
    const mcpTool = body.profiles.find((profile) => profile.id === "mcp-tool");

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(localPreset).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "ready",
        setup: expect.objectContaining({
          enableEnvVar: LOCAL_PRESET_ENV_VAR
        })
      })
    );
    expect(openAI).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "ready",
        setup: expect.objectContaining({
          enableEnvVar: OPENAI_COMPATIBLE_PROFILE_ENV_VAR,
          missingRecommendedEnvVars: []
        })
      })
    );
    expect(openAI?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENAI_COMPATIBLE_ADAPTER_ID,
          enabled: true
        }),
        expect.objectContaining({
          id: OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
          enabled: true
        }),
        expect.objectContaining({
          id: OPENAI_COMPATIBLE_REVIEWER_ID,
          enabled: true
        })
      ])
    );
    expect(openAI?.setup.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
          configured: true,
          secret: true
        }),
        expect.objectContaining({
          name: OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
          configured: true,
          secret: false
        }),
        expect.objectContaining({
          name: OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR,
          configured: false,
          secret: false
        }),
        expect.objectContaining({
          name: OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR,
          configured: true,
          secret: false,
          required: false
        }),
        expect.objectContaining({
          name: OPENAI_COMPATIBLE_REVIEW_ENV_VAR,
          configured: true,
          secret: false,
          required: false
        }),
        expect.objectContaining({
          name: OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR,
          configured: false,
          secret: false,
          required: false
        })
      ])
    );
    expect(httpTemplate).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "ready",
        setup: expect.objectContaining({
          enableEnvVar: HTTP_TEMPLATE_PROFILE_ENV_VAR,
          missingRecommendedEnvVars: []
        })
      })
    );
    expect(httpTemplate?.setup.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: HTTP_TEMPLATE_API_KEY_ENV_VAR,
          configured: true,
          secret: true
        }),
        expect.objectContaining({
          name: HTTP_TEMPLATE_URL_ENV_VAR,
          configured: true,
          secret: false
        }),
        expect.objectContaining({
          name: HTTP_TEMPLATE_BASE_URL_ENV_VAR,
          configured: false,
          secret: false
        }),
        expect.objectContaining({
          name: HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR,
          configured: false,
          secret: false
        })
      ])
    );
    expect(mcpTool).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "ready",
        setup: expect.objectContaining({
          enableEnvVar: MCP_TOOL_PROFILE_ENV_VAR,
          missingRecommendedEnvVars: []
        })
      })
    );
    expect(mcpTool?.components).toEqual([
      expect.objectContaining({
        id: MCP_TOOL_ADAPTER_ID,
        enabled: true
      })
    ]);
    expect(mcpTool?.setup.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: MCP_TOOL_AUTH_TOKEN_ENV_VAR,
          configured: true,
          secret: true
        }),
        expect.objectContaining({
          name: MCP_TOOL_URL_ENV_VAR,
          configured: true,
          secret: false,
          required: true
        }),
        expect.objectContaining({
          name: MCP_TOOL_NAME_ENV_VAR,
          configured: true,
          secret: false,
          required: true
        }),
        expect.objectContaining({
          name: MCP_TOOL_ALLOW_REMOTE_ENV_VAR,
          configured: false,
          secret: false
        }),
        expect.objectContaining({
          name: MCP_TOOL_MAX_ARGUMENT_BYTES_ENV_VAR,
          configured: true,
          secret: false
        }),
        expect.objectContaining({
          name: MCP_TOOL_ALLOWED_ARGUMENT_KEYS_ENV_VAR,
          configured: true,
          secret: false
        }),
        expect.objectContaining({
          name: MCP_TOOL_INCLUDE_CONTEXT_ENV_VAR,
          configured: true,
          secret: false
        })
      ])
    );
    expect(text).not.toContain(openAISecret);
    expect(text).not.toContain(httpSecret);
    expect(text).not.toContain(mcpSecret);
    expect(text).not.toContain("https://openai.example/api");
    expect(text).not.toContain("runtime-openai-model");
    expect(text).not.toContain("https://http-template.example/invoke");
    expect(text).not.toContain("{{runtime.apiKey}}");
    expect(text).not.toContain("http://127.0.0.1:8787/mcp");
    expect(text).not.toContain("deliberum.reflect");
    expect(text).not.toContain("instructions,payload");
    expect(text).not.toContain("4096");

    const runConfigBackedDaemon = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      enableHttpTemplateProfile: true,
      enableMcpToolProfile: true
    });
    const runConfigBackedBody = (await (
      await runConfigBackedDaemon.app.request("/runtime/profiles")
    ).json()) as typeof body;

    expect(
      runConfigBackedBody.profiles.find((profile) => profile.id === "openai-compatible")
    ).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "ready_with_run_config",
        setup: expect.objectContaining({
          missingRecommendedEnvVars: [
            OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
            OPENAI_COMPATIBLE_MODEL_ENV_VAR
          ]
        })
      })
    );
    expect(
      runConfigBackedBody.profiles.find((profile) => profile.id === "http-template")
    ).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "ready_with_run_config",
        setup: expect.objectContaining({
          missingRecommendedEnvVars: [
            HTTP_TEMPLATE_URL_ENV_VAR,
            HTTP_TEMPLATE_BASE_URL_ENV_VAR,
            HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR
          ]
        })
      })
    );
    expect(
      runConfigBackedBody.profiles.find((profile) => profile.id === "mcp-tool")
    ).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "needs_configuration",
        components: [
          expect.objectContaining({
            id: MCP_TOOL_ADAPTER_ID,
            enabled: false
          })
        ],
        setup: expect.objectContaining({
          missingRecommendedEnvVars: [
            MCP_TOOL_URL_ENV_VAR,
            MCP_TOOL_NAME_ENV_VAR
          ]
        })
      })
    );
  });

  it("reports safe resource access posture without exposing access material", async () => {
    const resourceAccessStore = new ResourceAccessGrantStore({
      clock: () => Date.parse(clock()),
      tokenGenerator: () => "Z".repeat(32)
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      resourceAccessBaseUrl: "https://access.example/base/",
      resourceAccessTtlMs: 120000,
      resourceAccessStore
    });

    const response = await daemonApp.app.request("/runtime/resource-access");
    const body = (await response.json()) as {
      baseUrl: {
        configured: boolean;
        exposure: string;
        routePattern: string;
      };
      ttl: {
        configured: boolean;
        defaultTtlMs: number;
        maxTtlMs: number;
      };
      urlSigning: {
        configured: boolean;
        algorithm: string;
        requiredForAccess: boolean;
      };
      grantStore: {
        mode: string;
        restartContinuity: string;
      };
      hostedContent: {
        supported: boolean;
        requiresExplicitPolicy: boolean;
        requiresSizeLimit: boolean;
        deliveryMaterial: string;
        sensitiveDefault: string;
        brokerContentRestartContinuity: string;
        grantRestartContinuity: string;
      };
      productionHosting: {
        status: string;
        publicUrlHosting: boolean;
        signedUrls: boolean;
        arbitraryFileServing: boolean;
        blockers: string[];
      };
      safety: string[];
    };
    const text = JSON.stringify(body);
    const auditBody = (await (
      await daemonApp.app.request("/runtime/operation-audit?limit=5")
    ).json()) as {
      events: Array<{
        action: string;
        route: string;
      }>;
    };

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body).toMatchObject({
      baseUrl: {
        configured: true,
        exposure: "public",
        routePattern: "/resource-access/:accessId"
      },
      ttl: {
        configured: true,
        defaultTtlMs: 120000,
        maxTtlMs: 3600000
      },
      urlSigning: {
        configured: false,
        algorithm: "hmac-sha256",
        requiredForAccess: false
      },
      grantStore: {
        mode: "configured_store",
        restartContinuity: "depends_on_configured_store"
      },
      hostedContent: {
        supported: true,
        requiresExplicitPolicy: true,
        requiresSizeLimit: true,
        deliveryMaterial: "short_lived_access_url",
        sensitiveDefault: "none",
        brokerContentRestartContinuity: "lost_on_restart",
        grantRestartContinuity: "depends_on_configured_store"
      },
      productionHosting: {
        status: "not_production_hosting",
        publicUrlHosting: false,
        signedUrls: false,
        arbitraryFileServing: false,
        blockers: expect.arrayContaining([
          "Production public resource hosting is not implemented.",
          "Signed resource access URLs are not configured."
        ])
      }
    });
    expect(body.safety.join(" ")).toContain("does not expose resource access ids");
    expect(body.safety.join(" ")).toContain("signing secrets and signatures are not exposed");
    expect(body.safety.join(" ")).toContain("explicit per-request policy");
    expect(text).not.toContain("https://access.example");
    expect(text).not.toContain("ZZZZ");
    expect(auditBody.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "resource_access_posture_read",
          route: "/runtime/resource-access"
        })
      ])
    );
  });

  it("reports safe deployment posture without exposing deployment secrets", async () => {
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      daemonAuthToken: "local-daemon-auth-token"
    });

    const response = await daemonApp.app.request("/runtime/deployment-posture", {
      headers: {
        Authorization: "Bearer local-daemon-auth-token"
      }
    });
    const body = (await response.json()) as {
      binding: {
        host: string;
        port: number;
        exposure: string;
        defaultLocalhost: boolean;
      };
      controlPlane: {
        auth: string;
        protected: boolean;
        tokenMode: string;
        principalCount: number;
      };
      persistence: {
        eventLedger: string;
        runMetadata: string;
        resourceBroker: string;
        resourceAccessGrants: string;
        operationAudit: string;
        productionMultiWriterCoordination: boolean;
        sqliteProcessLock: string;
      };
      resourceAccess: {
        baseUrlConfigured: boolean;
        baseUrlExposure: string;
        grantStoreRestartContinuity: string;
        urlSigningConfigured: boolean;
      };
      webAssets: {
        configured: boolean;
        routeMode: string;
        shellCache: string;
        assetCache: string;
      };
      productionReadiness: {
        status: string;
        readyForProduction: boolean;
        blockers: string[];
      };
      safety: string[];
    };
    const text = JSON.stringify(body);
    const auditBody = (await (
      await daemonApp.app.request("/runtime/operation-audit?limit=5", {
        headers: {
          Authorization: "Bearer local-daemon-auth-token"
        }
      })
    ).json()) as {
      events: Array<{
        action: string;
        route: string;
      }>;
    };

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body).toEqual(
      expect.objectContaining({
        binding: {
          host: "127.0.0.1",
          port: 3877,
          exposure: "localhost",
          defaultLocalhost: true
        },
        controlPlane: {
          auth: "daemon_bearer",
          protected: true,
          tokenMode: "single",
          principalCount: 1
        },
        persistence: {
          eventLedger: "process_memory",
          runMetadata: "process_memory",
          resourceBroker: "process_memory",
          resourceAccessGrants: "process_memory",
          operationAudit: "process_memory",
          productionMultiWriterCoordination: false,
          sqliteProcessLock: "disabled"
        },
        resourceAccess: {
          baseUrlConfigured: false,
          baseUrlExposure: "localhost",
          grantStoreRestartContinuity: "lost_on_restart",
          urlSigningConfigured: false
        },
        webAssets: {
          configured: false,
          routeMode: "disabled",
          shellCache: "no_store",
          assetCache: "immutable"
        },
        productionReadiness: expect.objectContaining({
          status: "local_only",
          readyForProduction: false
        })
      })
    );
    expect(body.productionReadiness.blockers).toContain(
      "Production multi-user authorization is not implemented by the daemon."
    );
    expect(body.productionReadiness.blockers).toContain(
      "One or more daemon stores are process-memory only and lose continuity on restart."
    );
    expect(body.safety.join(" ")).toContain("safe daemon configuration state");
    expect(text).not.toContain("local-daemon-auth-token");
    expect(text).not.toContain("Bearer ");
    expect(auditBody.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "deployment_posture_read",
          route: "/runtime/deployment-posture"
        })
      ])
    );
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
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type,Authorization"
    );
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

  it("lists sessions as a safe ledger-derived catalog", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const first = await createSession(daemonApp);
    const second = await createSession(daemonApp);

    await openBatch(daemonApp, first.sessionId);

    const response = await daemonApp.app.request("/sessions");
    const body = (await response.json()) as {
      sessions: Array<Record<string, unknown>>;
    };
    const firstCatalog = body.sessions.find(
      (session) => session.sessionId === first.sessionId
    );
    const secondCatalog = body.sessions.find(
      (session) => session.sessionId === second.sessionId
    );

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body.sessions).toHaveLength(2);
    expect(firstCatalog).toEqual({
      sessionId: first.sessionId,
      topicContractEventId: first.event.id,
      title: "Daemon API skeleton",
      topic: "Implement local daemon API skeleton",
      createdAt: clock(),
      recordedAt: clock(),
      latestEventRecordedAt: clock(),
      eventCount: 2
    });
    expect(secondCatalog).toEqual(
      expect.objectContaining({
        sessionId: second.sessionId,
        topicContractEventId: second.event.id,
        title: "Daemon API skeleton",
        topic: "Implement local daemon API skeleton",
        eventCount: 1
      })
    );
    expect(JSON.stringify(body)).not.toContain("allowedAdapters");
    expect(JSON.stringify(body)).not.toContain("governanceRules");
    expect(JSON.stringify(body)).not.toContain("participantIds");
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

  it("records daemon-backed session final candidate and audit lifecycle events", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const startResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    const frontierResponse = await daemonApp.app.request(
      `/sessions/${created.run.sessionId}/frontier`
    );
    const frontier = (await frontierResponse.json()) as {
      candidates: Array<{ object: { id: string } }>;
    };
    const candidateId = frontier.candidates[0]?.object.id;
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(created.run.sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    expect(startResponse.status).toBe(200);
    expect(frontierResponse.status).toBe(200);
    expect(candidateId).toBeDefined();

    try {
      const proposalInput = {
        authorId: "final-coordinator",
        candidateIds: [candidateId],
        recommendation: "Use the daemon lifecycle endpoint as final proposal material.",
        applicabilityConditions: ["Only for accepted active candidates."],
        rationale: "Record final proposal material through daemon control surfaces.",
        limitations: ["Still requires final audit."],
        idempotencyKey: "daemon-final-candidate-1"
      };
      const proposalResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/final-candidates`,
        proposalInput
      );
      const proposalBody = (await proposalResponse.json()) as {
        proposalId: string;
        appended: boolean;
        event: {
          id: string;
          type: string;
          payload: {
            candidateIds: string[];
            status: string;
          };
        };
      };
      const retryResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/final-candidates`,
        proposalInput
      );
      const retryBody = (await retryResponse.json()) as {
        appended: boolean;
        event: { id: string };
      };
      const auditResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/final-candidates/${proposalBody.event.id}/audits`,
        {
          authorId: "final-auditor",
          findings: ["The final candidate is still provisional."],
          risks: ["Evidence may remain incomplete."],
          unresolvedObjectionIds: [],
          qualityObligationIds: [],
          evidenceNeedIds: [],
          omissions: ["No external validation is recorded."],
          compressionProblems: [],
          limitations: ["Audit records boundaries only."],
          continuationSuggestions: ["Resolve open evidence before external reliance."],
          idempotencyKey: "daemon-final-audit-1"
        }
      );
      const auditBody = (await auditResponse.json()) as {
        appended: boolean;
        event: {
          id: string;
          type: string;
          basedOnEventIds: string[];
          payload: {
            targetFinalCandidateProposalEventId: string;
            status: string;
          };
        };
      };
      const finalResponse = await daemonApp.app.request(
        `/sessions/${created.run.sessionId}/final?finalCandidateProposalEventId=${encodeURIComponent(proposalBody.event.id)}`
      );
      const finalBody = (await finalResponse.json()) as {
        outcome: {
          recommendation: string;
          provenance: {
            finalCandidateProposalEventId?: string;
            finalAuditEventIds: string[];
          };
        };
      };

      expect(proposalResponse.status).toBe(201);
      expect(proposalBody.appended).toBe(true);
      expect(proposalBody.event.type).toBe("final_candidate_proposed");
      expect(proposalBody.event.payload).toMatchObject({
        candidateIds: [candidateId],
        status: "proposed"
      });
      expect(retryResponse.status).toBe(201);
      expect(retryBody).toMatchObject({
        appended: false,
        event: {
          id: proposalBody.event.id
        }
      });
      expect(auditResponse.status).toBe(201);
      expect(auditBody.appended).toBe(true);
      expect(auditBody.event.type).toBe("final_audit_recorded");
      expect(auditBody.event.basedOnEventIds).toEqual([proposalBody.event.id]);
      expect(auditBody.event.payload).toMatchObject({
        targetFinalCandidateProposalEventId: proposalBody.event.id,
        status: "recorded"
      });
      expect(finalResponse.status).toBe(200);
      expect(finalBody.outcome).toMatchObject({
        recommendation: "Use the daemon lifecycle endpoint as final proposal material.",
        provenance: {
          finalCandidateProposalEventId: proposalBody.event.id,
          finalAuditEventIds: [auditBody.event.id]
        }
      });
      expect(received).toEqual([
        {
          id: proposalBody.event.id,
          type: "final_candidate_proposed"
        },
        {
          id: auditBody.event.id,
          type: "final_audit_recorded"
        }
      ]);
      expectSafeRunApiPayload(proposalBody);
      expectSafeRunApiPayload(auditBody);
      expectSafeRunApiPayload(finalBody);
    } finally {
      unsubscribe();
    }
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
    const deliveryResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${registeredUrlResource.id}/deliveries`,
      {
        participantId: "participant-1",
        policy: {
          requestedMode: "none"
        }
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
      deliveryAudits: Array<{
        eventId: string;
        resourceDeliveryId: string;
        resourceId: string;
        participantId: string;
        resource: { kind: string; mime: string; sizeBytes: number; hash: string; privacy: string };
        request: { policy?: { requestedMode?: string } };
        result: { selectedMode: string; allowed: boolean; reason: string };
      }>;
      evidenceNeeds: Array<{ object: { id: string; targetClaimId: string } }>;
    };

    expect(deliveryResponse.status).toBe(200);
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
    expect(body.deliveryAudits).toMatchObject([
      {
        resourceId: registeredUrlResource.id,
        participantId: "participant-1",
        resource: {
          kind: "text",
          mime: "text/plain",
          sizeBytes: 12,
          hash: "hash-resource-url",
          privacy: "public"
        },
        request: {
          policy: {
            requestedMode: "none"
          }
        },
        result: {
          selectedMode: "none",
          allowed: false,
          reason: "No resource delivery mode was selected."
        }
      }
    ]);
    expect(body.deliveryAudits[0]?.eventId).toBeDefined();
    expect(body.deliveryAudits[0]?.resourceDeliveryId).toBeDefined();
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

  it("delivers session-scoped resources through the daemon planner without default content leaks", async () => {
    const resourceBroker = new InMemoryResourceBroker();
    const publicResource = resourceBroker.registerResource({
      resource: publicUrlResource("daemon-delivery-url")
    });
    const b64Resource = resourceBroker.registerResource({
      resource: base64Resource("daemon-delivery-base64"),
      contents: [
        {
          dataRef: "base64-ref",
          base64: Buffer.from("hello world").toString("base64")
        }
      ]
    });
    const sensitiveResource = resourceBroker.registerResource({
      resource: sensitiveUrlResource("daemon-delivery-sensitive")
    });
    const daemonApp = createRunDaemon({
      resourceBroker
    });
    const created = await createRun(daemonApp, {
      ...orchestratedRunPlan(),
      resources: [
        {
          resourceId: publicResource.id,
          required: true,
          preferredDeliveryMode: "url"
        },
        {
          resourceId: b64Resource.id,
          required: false,
          preferredDeliveryMode: "base64"
        },
        {
          resourceId: sensitiveResource.id,
          required: false,
          preferredDeliveryMode: "url"
        }
      ]
    });

    const deniedUrlResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${publicResource.id}/deliveries`,
      {
        participantId: "participant-1"
      }
    );
    const deniedUrlText = await deniedUrlResponse.text();
    const deniedUrl = JSON.parse(deniedUrlText) as {
      delivery: { selectedMode: string; allowed: boolean };
      auditEvent: { id: string; type: string; appended: boolean };
    };

    expect(deniedUrlResponse.status).toBe(200);
    expectNoStore(deniedUrlResponse);
    expect(deniedUrl.delivery).toMatchObject({
      selectedMode: "none",
      allowed: false
    });
    expect(deniedUrl.auditEvent).toMatchObject({
      type: RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
      appended: true
    });
    expect(deniedUrlText).not.toContain("https://example.com/resource.txt");

    const allowedBase64Response = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${b64Resource.id}/deliveries`,
      {
        participantId: "participant-1",
        policy: {
          requestedMode: "base64",
          allowBase64: true,
          maxBase64SizeBytes: 64
        }
      }
    );
    const allowedBase64 = (await allowedBase64Response.json()) as {
      sessionId: string;
      resource: { variants: Array<Record<string, unknown>> };
      delivery: {
        selectedMode: string;
        allowed: boolean;
        delivery?: { data?: string };
      };
      auditEvent: { id: string; type: string; appended: boolean };
    };

    expect(allowedBase64Response.status).toBe(200);
    expectNoStore(allowedBase64Response);
    expect(allowedBase64.sessionId).toBe(created.run.sessionId);
    expect(allowedBase64.resource.variants).toEqual([
      {
        mode: "base64",
        mime: "text/plain",
        sizeBytes: 11
      }
    ]);
    expect(allowedBase64.delivery).toMatchObject({
      selectedMode: "base64",
      allowed: true,
      delivery: {
        data: Buffer.from("hello world").toString("base64")
      }
    });
    expect(allowedBase64.auditEvent).toMatchObject({
      type: RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
      appended: true
    });

    const sensitiveResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${sensitiveResource.id}/deliveries`,
      {
        participantId: "participant-1",
        policy: {
          requestedMode: "url",
          allowPublicUrl: true
        }
      }
    );
    const sensitiveText = await sensitiveResponse.text();
    const sensitive = JSON.parse(sensitiveText) as {
      delivery: { selectedMode: string; allowed: boolean };
      auditEvent: { id: string; type: string; appended: boolean };
    };

    expect(sensitiveResponse.status).toBe(200);
    expectNoStore(sensitiveResponse);
    expect(sensitive.delivery).toMatchObject({
      selectedMode: "none",
      allowed: false
    });
    expect(sensitive.auditEvent).toMatchObject({
      type: RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
      appended: true
    });
    expect(sensitiveText).not.toContain("api_key");
    expect(sensitiveText).not.toContain("secret-value");
    const auditEvents = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .filter((event) => event.type === RESOURCE_DELIVERY_PLANNED_EVENT_TYPE);
    const serializedAuditEvents = JSON.stringify(auditEvents);

    expect(auditEvents).toHaveLength(3);
    expect(auditEvents[0]).toMatchObject({
      authorId: "system",
      visibility: "public",
      trace: {
        participantId: "participant-1"
      },
      payload: {
        resourceId: publicResource.id,
        participantId: "participant-1",
        result: {
          selectedMode: "none",
          allowed: false
        }
      }
    });
    expect(auditEvents[1]).toMatchObject({
      payload: {
        resourceId: b64Resource.id,
        result: {
          selectedMode: "base64",
          allowed: true,
          materialKind: "base64"
        },
        request: {
          policy: {
            requestedMode: "base64",
            allowBase64: true,
            maxBase64SizeBytes: 64
          }
        }
      }
    });
    expect(serializedAuditEvents).not.toContain("https://example.com/resource.txt");
    expect(serializedAuditEvents).not.toContain(Buffer.from("hello world").toString("base64"));
    expect(serializedAuditEvents).not.toContain("base64-ref");
    expect(serializedAuditEvents).not.toContain("api_key");
    expect(serializedAuditEvents).not.toContain("secret-value");

    const unscopedResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/resource-not-in-run-plan/deliveries`,
      {
        participantId: "participant-1"
      }
    );
    const unscoped = (await unscopedResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(unscopedResponse.status).toBe(400);
    expectNoStore(unscopedResponse);
    expect(unscoped.error).toEqual({
      code: "resource_not_scoped",
      message: "Resource is not scoped to this session."
    });
    expect(
      daemonApp.eventStore
        .listEvents(created.run.sessionId)
        .filter((event) => event.type === RESOURCE_DELIVERY_PLANNED_EVENT_TYPE)
    ).toHaveLength(3);
  });

  it("wraps allowed URL deliveries in revocable daemon resource access grants", async () => {
    const accessId = "R".repeat(32);
    const resourceBroker = new InMemoryResourceBroker();
    const publicResource = resourceBroker.registerResource({
      resource: publicUrlResource("daemon-delivery-signed-url")
    });
    const daemonApp = createRunDaemon({
      resourceBroker,
      resourceAccessBaseUrl: "https://access.example",
      resourceAccessTokenGenerator: createTokenGenerator([accessId]),
      resourceAccessTtlMs: 120000
    });
    const created = await createRun(daemonApp, {
      ...orchestratedRunPlan(),
      resources: [
        {
          resourceId: publicResource.id,
          required: true,
          preferredDeliveryMode: "url"
        }
      ]
    });
    const response = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${publicResource.id}/deliveries`,
      {
        participantId: "participant-1",
        policy: {
          requestedMode: "url",
          allowPublicUrl: true
        }
      }
    );
    const text = await response.text();
    const body = JSON.parse(text) as {
      delivery: {
        selectedMode: string;
        allowed: boolean;
        warnings: string[];
        delivery?: {
          mode: string;
          url: string;
          exposure: string;
          expiresAt: string;
        };
      };
      auditEvent: { id: string; type: string; appended: boolean };
    };
    const accessUrl = body.delivery.delivery?.url;

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body.delivery).toMatchObject({
      selectedMode: "url",
      allowed: true,
      delivery: {
        mode: "url",
        url: `https://access.example/resource-access/${accessId}`,
        exposure: "public",
        expiresAt: "2026-06-10T00:02:00.000Z"
      }
    });
    expect(body.delivery.warnings).toContain(
      "URL delivery uses a revocable daemon resource access grant."
    );
    expect(text).not.toContain("https://example.com/resource.txt");
    expect(body.auditEvent).toMatchObject({
      type: RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
      appended: true
    });

    if (!accessUrl) {
      throw new Error("Expected signed resource access URL.");
    }

    const accessPath = new URL(accessUrl).pathname;
    const accessResponse = await daemonApp.app.request(accessPath);

    expect(accessResponse.status).toBe(302);
    expectNoStore(accessResponse);
    expect(accessResponse.headers.get("location")).toBe(
      "https://example.com/resource.txt"
    );

    const revokeResponse = await postJson(
      daemonApp.app,
      `${accessPath}/revoke`,
      {}
    );
    const revoked = (await revokeResponse.json()) as {
      revoked: boolean;
      grant: {
        resourceAccessId: string;
        resourceId: string;
        accessCount: number;
        revokedAt: string;
      };
    };

    expect(revokeResponse.status).toBe(200);
    expectNoStore(revokeResponse);
    expect(revoked).toMatchObject({
      revoked: true,
      grant: {
        resourceId: publicResource.id,
        accessCount: 1,
        revokedAt: "2026-06-10T00:00:00.000Z"
      }
    });

    const revokedAccessResponse = await daemonApp.app.request(accessPath);
    const revokedAccess = (await revokedAccessResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(revokedAccessResponse.status).toBe(400);
    expectNoStore(revokedAccessResponse);
    expect(revokedAccess.error.code).toBe("resource_access_revoked");

    const accessAuditEvents = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .filter(
        (event) =>
          event.type === RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE ||
          event.type === RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE
      );
    const serializedAccessAuditEvents = JSON.stringify(accessAuditEvents);

    expect(accessAuditEvents).toHaveLength(2);
    expect(accessAuditEvents[0]).toMatchObject({
      type: RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE,
      payload: {
        resourceAccessId: revoked.grant.resourceAccessId,
        resourceId: publicResource.id,
        participantId: "participant-1",
        resource: {
          kind: "text",
          mime: "text/plain",
          sizeBytes: 12,
          hash: "hash-daemon-delivery-signed-url",
          privacy: "public"
        },
        grant: {
          mode: "redirect",
          exposure: "public",
          expiresAt: "2026-06-10T00:02:00.000Z",
          tokenHash: expect.any(String)
        }
      }
    });
    expect(accessAuditEvents[1]).toMatchObject({
      type: RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE,
      payload: {
        resourceAccessId: revoked.grant.resourceAccessId,
        resourceId: publicResource.id,
        participantId: "participant-1",
        revokedAt: "2026-06-10T00:00:00.000Z",
        grant: {
          mode: "redirect",
          exposure: "public",
          expiresAt: "2026-06-10T00:02:00.000Z",
          tokenHash: expect.any(String)
        }
      }
    });
    expect(serializedAccessAuditEvents).not.toContain("https://example.com/resource.txt");
    expect(serializedAccessAuditEvents).not.toContain(accessId);
    expect(serializedAccessAuditEvents).not.toContain("access.example");

    const resourcesResponse = await daemonApp.app.request(
      `/sessions/${created.run.sessionId}/resources`
    );
    const resourcesText = await resourcesResponse.text();
    const resourcesBody = JSON.parse(resourcesText) as {
      accessAudits: Array<{
        action: string;
        resourceAccessId: string;
        resourceId: string;
        grant: { mode: string; tokenHash: string };
        revokedAt?: string;
      }>;
    };

    expect(resourcesResponse.status).toBe(200);
    expectNoStore(resourcesResponse);
    expect(resourcesBody.accessAudits).toEqual([
      expect.objectContaining({
        action: "created",
        resourceAccessId: revoked.grant.resourceAccessId,
        resourceId: publicResource.id,
        grant: expect.objectContaining({
          mode: "redirect",
          tokenHash: expect.any(String)
        })
      }),
      expect.objectContaining({
        action: "revoked",
        resourceAccessId: revoked.grant.resourceAccessId,
        resourceId: publicResource.id,
        revokedAt: "2026-06-10T00:00:00.000Z",
        grant: expect.objectContaining({
          mode: "redirect",
          tokenHash: expect.any(String)
        })
      })
    ]);
    expect(resourcesText).not.toContain("https://example.com/resource.txt");
    expect(resourcesText).not.toContain(accessId);
    expect(resourcesText).not.toContain("access.example");

    const auditEvents = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .filter((event) => event.type === RESOURCE_DELIVERY_PLANNED_EVENT_TYPE);
    const serializedAuditEvents = JSON.stringify(auditEvents);

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      payload: {
        resourceId: publicResource.id,
        result: {
          selectedMode: "url",
          allowed: true,
          materialKind: "url"
        }
      }
    });
    expect(serializedAuditEvents).not.toContain("https://example.com/resource.txt");
    expect(serializedAuditEvents).not.toContain(accessId);
    expect(serializedAuditEvents).not.toContain("access.example");
    expectSafeRunApiPayload(body);
    expectSafeRunApiPayload(revoked);
    expectSafeRunApiPayload(revokedAccess);
  });

  it("requires configured signatures for resource access URLs", async () => {
    const accessId = "S".repeat(32);
    const signingSecret = "resource-access-route-signing-key-32";
    const resourceBroker = new InMemoryResourceBroker();
    const publicResource = resourceBroker.registerResource({
      resource: publicUrlResource("daemon-delivery-signed-route")
    });
    const daemonApp = createRunDaemon({
      resourceBroker,
      resourceAccessBaseUrl: "https://access.example",
      resourceAccessUrlSigningSecret: signingSecret,
      resourceAccessTokenGenerator: createTokenGenerator([accessId]),
      resourceAccessTtlMs: 120000
    });
    const created = await createRun(daemonApp, {
      ...orchestratedRunPlan(),
      resources: [
        {
          resourceId: publicResource.id,
          required: true,
          preferredDeliveryMode: "url"
        }
      ]
    });
    const response = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${publicResource.id}/deliveries`,
      {
        participantId: "participant-1",
        policy: {
          requestedMode: "url",
          allowPublicUrl: true
        }
      }
    );
    const text = await response.text();
    const body = JSON.parse(text) as {
      delivery: {
        delivery?: {
          url: string;
          expiresAt: string;
        };
      };
    };
    const accessUrl = body.delivery.delivery?.url;

    expect(response.status).toBe(200);
    expect(accessUrl).toBeDefined();

    const parsed = new URL(accessUrl ?? "https://invalid.example");
    const signature = parsed.searchParams.get(RESOURCE_ACCESS_URL_SIGNATURE_QUERY_PARAM);
    const unsignedResponse = await daemonApp.app.request(parsed.pathname);
    const tampered = new URL(parsed.toString());
    tampered.searchParams.set(RESOURCE_ACCESS_URL_SIGNATURE_QUERY_PARAM, "x".repeat(43));
    const tamperedResponse = await daemonApp.app.request(
      `${tampered.pathname}${tampered.search}`
    );
    const signedResponse = await daemonApp.app.request(`${parsed.pathname}${parsed.search}`);
    const auditEvents = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .filter(
        (event) =>
          event.type === RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE ||
          event.type === RESOURCE_DELIVERY_PLANNED_EVENT_TYPE
      );
    const serializedAuditEvents = JSON.stringify(auditEvents);

    expect(parsed.searchParams.get(RESOURCE_ACCESS_URL_EXPIRES_AT_QUERY_PARAM)).toBe(
      String(Date.parse(body.delivery.delivery?.expiresAt ?? ""))
    );
    expect(signature).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(text).not.toContain(signingSecret);
    expect(unsignedResponse.status).toBe(400);
    expect(tamperedResponse.status).toBe(400);
    expect(signedResponse.status).toBe(302);
    expect(signedResponse.headers.get("location")).toBe(
      "https://example.com/resource.txt"
    );
    expect(serializedAuditEvents).not.toContain(signingSecret);
    expect(serializedAuditEvents).not.toContain(signature ?? "missing-signature");
  });

  it("hosts registered in-memory base64 content through revocable resource access grants", async () => {
    const accessId = "H".repeat(32);
    const contentBase64 = Buffer.from("hello world").toString("base64");
    const resourceBroker = new InMemoryResourceBroker();
    const hostedResource = resourceBroker.registerResource({
      resource: base64Resource("daemon-delivery-hosted-content", "hosted-content-ref"),
      contents: [
        {
          dataRef: "hosted-content-ref",
          base64: contentBase64
        }
      ]
    });
    const daemonApp = createRunDaemon({
      resourceBroker,
      resourceAccessTokenGenerator: createTokenGenerator([accessId]),
      resourceAccessTtlMs: 120000
    });
    const created = await createRun(daemonApp, {
      ...orchestratedRunPlan(),
      resources: [
        {
          resourceId: hostedResource.id,
          required: true,
          preferredDeliveryMode: "url"
        }
      ]
    });
    const response = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${hostedResource.id}/deliveries`,
      {
        participantId: "participant-1",
        policy: {
          requestedMode: "url",
          allowLocalhostUrl: true,
          allowHostedContentUrl: true,
          maxHostedContentSizeBytes: 64
        }
      }
    );
    const text = await response.text();
    const body = JSON.parse(text) as {
      delivery: {
        selectedMode: string;
        allowed: boolean;
        reason: string;
        delivery?: {
          mode: string;
          url: string;
          exposure: string;
          expiresAt: string;
        };
      };
    };
    const accessUrl = body.delivery.delivery?.url;

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body.delivery).toMatchObject({
      selectedMode: "url",
      allowed: true,
      reason: "Hosted content URL delivery is explicitly allowed by policy.",
      delivery: {
        mode: "url",
        url: `http://127.0.0.1:3877/resource-access/${accessId}`,
        exposure: "localhost",
        expiresAt: "2026-06-10T00:02:00.000Z"
      }
    });
    expect(text).not.toContain(contentBase64);
    expect(text).not.toContain("hosted-content-ref");

    if (!accessUrl) {
      throw new Error("Expected hosted content access URL.");
    }

    const accessResponse = await daemonApp.app.request(new URL(accessUrl).pathname);
    const accessText = await accessResponse.text();

    expect(accessResponse.status).toBe(200);
    expectNoStore(accessResponse);
    expect(accessResponse.headers.get("content-type")).toBe("text/plain");
    expect(accessResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(accessText).toBe("hello world");

    const accessAuditEvents = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .filter((event) => event.type === RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE);
    const serializedAccessAuditEvents = JSON.stringify(accessAuditEvents);

    expect(accessAuditEvents).toHaveLength(1);
    expect(accessAuditEvents[0]).toMatchObject({
      type: RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE,
      payload: {
        resourceId: hostedResource.id,
        participantId: "participant-1",
        resource: {
          kind: "text",
          mime: "text/plain",
          sizeBytes: 11,
          hash: "hash-daemon-delivery-hosted-content",
          privacy: "public"
        },
        grant: {
          mode: "content",
          exposure: "localhost",
          expiresAt: "2026-06-10T00:02:00.000Z",
          tokenHash: expect.any(String),
          content: {
            mime: "text/plain",
            sizeBytes: 11,
            hash: "hash-daemon-delivery-hosted-content"
          }
        }
      }
    });
    expect(serializedAccessAuditEvents).not.toContain(contentBase64);
    expect(serializedAccessAuditEvents).not.toContain("hosted-content-ref");
    expect(serializedAccessAuditEvents).not.toContain(accessId);

    const resourcesResponse = await daemonApp.app.request(
      `/sessions/${created.run.sessionId}/resources`
    );
    const resourcesText = await resourcesResponse.text();
    const resourcesBody = JSON.parse(resourcesText) as {
      accessAudits: Array<{
        action: string;
        resourceId: string;
        grant: { mode: string; content?: { hash: string } };
      }>;
    };

    expect(resourcesResponse.status).toBe(200);
    expectNoStore(resourcesResponse);
    expect(resourcesBody.accessAudits).toEqual([
      expect.objectContaining({
        action: "created",
        resourceId: hostedResource.id,
        grant: expect.objectContaining({
          mode: "content",
          content: {
            mime: "text/plain",
            sizeBytes: 11,
            hash: "hash-daemon-delivery-hosted-content"
          }
        })
      })
    ]);
    expect(resourcesText).not.toContain(contentBase64);
    expect(resourcesText).not.toContain("hosted-content-ref");
    expect(resourcesText).not.toContain(accessId);

    const auditEvents = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .filter((event) => event.type === RESOURCE_DELIVERY_PLANNED_EVENT_TYPE);
    const serializedAuditEvents = JSON.stringify(auditEvents);

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      payload: {
        resourceId: hostedResource.id,
        request: {
          policy: {
            requestedMode: "url",
            allowLocalhostUrl: true,
            allowHostedContentUrl: true,
            maxHostedContentSizeBytes: 64
          }
        },
        result: {
          selectedMode: "url",
          allowed: true,
          materialKind: "url"
        }
      }
    });
    expect(serializedAuditEvents).not.toContain(contentBase64);
    expect(serializedAuditEvents).not.toContain("hosted-content-ref");
    expect(serializedAuditEvents).not.toContain(accessId);
    expect(serializedAuditEvents).not.toContain("resource-access");
    expectSafeRunApiPayload(body);
  });

  it("deduplicates resource delivery audit events with idempotency keys", async () => {
    const resourceBroker = new InMemoryResourceBroker();
    const b64Resource = resourceBroker.registerResource({
      resource: base64Resource(
        "daemon-delivery-idempotent-base64",
        "idempotent-base64-ref"
      ),
      contents: [
        {
          dataRef: "idempotent-base64-ref",
          base64: Buffer.from("repeatable content").toString("base64")
        }
      ]
    });
    const daemonApp = createRunDaemon({
      resourceBroker
    });
    const created = await createRun(daemonApp, {
      ...orchestratedRunPlan(),
      resources: [
        {
          resourceId: b64Resource.id,
          required: false,
          preferredDeliveryMode: "base64"
        }
      ]
    });
    const request = {
      participantId: "participant-1",
      idempotencyKey: "same-resource-delivery",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 64
      }
    };
    const first = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${b64Resource.id}/deliveries`,
      request
    );
    const retry = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${b64Resource.id}/deliveries`,
      request
    );
    const firstBody = (await first.json()) as {
      auditEvent: { id: string; appended: boolean };
    };
    const retryBody = (await retry.json()) as {
      auditEvent: { id: string; appended: boolean };
    };

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(firstBody.auditEvent.appended).toBe(true);
    expect(retryBody.auditEvent).toEqual({
      id: firstBody.auditEvent.id,
      type: RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
      appended: false
    });
    expect(
      daemonApp.eventStore
        .listEvents(created.run.sessionId)
        .filter((event) => event.type === RESOURCE_DELIVERY_PLANNED_EVENT_TYPE)
    ).toHaveLength(1);
  });

  it("returns safe errors for invalid daemon resource delivery requests", async () => {
    const resourceBroker = new InMemoryResourceBroker();
    const publicResource = resourceBroker.registerResource({
      resource: publicUrlResource("daemon-delivery-error-url")
    });
    const daemonApp = createRunDaemon({
      resourceBroker
    });
    const created = await createRun(daemonApp, {
      ...orchestratedRunPlan(),
      resources: [
        {
          resourceId: publicResource.id,
          preferredDeliveryMode: "url"
        },
        {
          resourceId: "missing-run-plan-resource",
          preferredDeliveryMode: "url"
        }
      ]
    });

    const invalidParticipantResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${publicResource.id}/deliveries`,
      {
        participantId: " "
      }
    );
    const invalidParticipant = (await invalidParticipantResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(invalidParticipantResponse.status).toBe(400);
    expectNoStore(invalidParticipantResponse);
    expect(invalidParticipant.error).toEqual({
      code: "invalid_participant_id",
      message: "participantId must be a non-empty string."
    });

    const invalidPolicyResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/${publicResource.id}/deliveries`,
      {
        participantId: "participant-1",
        policy: "url"
      }
    );
    const invalidPolicy = (await invalidPolicyResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(invalidPolicyResponse.status).toBe(400);
    expectNoStore(invalidPolicyResponse);
    expect(invalidPolicy.error).toEqual({
      code: "invalid_resource_policy",
      message: "Resource delivery policy must be a JSON object."
    });

    const missingResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/resources/missing-run-plan-resource/deliveries`,
      {
        participantId: "participant-1"
      }
    );
    const missingText = await missingResponse.text();
    const missing = JSON.parse(missingText) as {
      error: { code: string; message: string };
    };

    expect(missingResponse.status).toBe(400);
    expectNoStore(missingResponse);
    expect(missing.error).toEqual({
      code: "resource_not_found",
      message: "Resource was not found."
    });
    expect(missingText).not.toContain("missing-run-plan-resource");
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

  it("compiles run outcomes for a requested final candidate proposal event", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, startFullRunRequest());

    const latestResponse = await daemonApp.app.request(`/runs/${created.run.runId}/outcome`);
    const latest = (await latestResponse.json()) as {
      status: string;
      outcome?: {
        provenance?: {
          finalCandidateProposalEventId?: string;
        };
      };
    };
    const invalidResponse = await daemonApp.app.request(
      `/runs/${created.run.runId}/outcome?finalCandidateProposalEventId=missing-final-proposal-event`
    );
    const invalid = (await invalidResponse.json()) as {
      status: string;
      reason?: string;
    };

    expect(latestResponse.status).toBe(200);
    expect(latest.status).toBe("compiled");
    expect(latest.outcome?.provenance?.finalCandidateProposalEventId).toBeDefined();
    expect(invalidResponse.status).toBe(200);
    expect(invalid).toEqual({
      runId: created.run.runId,
      sessionId: created.run.sessionId,
      status: "not_available",
      reason: "outcome_compilation_unavailable"
    });
    expectSafeRunApiPayload(invalid);
  });

  it("suggests adaptive process proposals for a run without mutating the ledger", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const eventCountBeforeRead =
      daemonApp.eventStore.listEvents(created.run.sessionId).length;
    const topicContractEvent = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .find((event) => event.type === "topic_contract_published");
    const response = await daemonApp.app.request(
      `/runs/${created.run.runId}/process-proposals`
    );
    const text = await response.text();
    const body = JSON.parse(text) as {
      runId: string;
      sessionId: string;
      proposals: Array<{
        id: string;
        primitive: string;
        status: string;
        targetIds: string[];
      }>;
      observations: string[];
      metadata: { version: string; eventRange: { fromSequence: number; toSequence: number } };
      executionPolicy: {
        automaticExecution: boolean;
        explicitExecutionRequired: boolean;
        supportedPrimitives: string[];
      };
      executionReadiness: unknown[];
    };

    expect(topicContractEvent).toBeDefined();
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(body.runId).toBe(created.run.runId);
    expect(body.sessionId).toBe(created.run.sessionId);
    expect(body.proposals).toEqual([
      expect.objectContaining({
        primitive: "sealed_divergence",
        status: "proposed",
        targetIds: [topicContractEvent!.id]
      })
    ]);
    expect(body.proposals[0]?.id).toMatch(
      new RegExp(`^adaptive:${created.run.runId}:sealed_divergence:`)
    );
    expect(body.observations).toContain("No sealed divergence round is recorded for this run.");
    expect(body.metadata).toMatchObject({
      version: "1",
      eventRange: {
        fromSequence: topicContractEvent!.sequence,
        toSequence: topicContractEvent!.sequence
      }
    });
    expect(body.executionPolicy).toEqual(
      expect.objectContaining({
        automaticExecution: false,
        explicitExecutionRequired: true,
        supportedPrimitives: expect.arrayContaining([
          "sealed_divergence",
          "candidate_repair",
          "evidence_check",
          "final_contest",
          "final_audit",
          "omission_audit"
        ])
      })
    );
    expect(body.executionReadiness).toEqual([]);
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(
      eventCountBeforeRead
    );
    expect(text).not.toContain("currentBest");
    expect(text).not.toContain("ranking");
    expect(text).not.toContain("finalAnswer");
    expect(text).not.toContain("truthSummary");
    expectSafeRunApiPayload(body);
  });

  it("reports process proposal execution readiness without running primitives", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const topicContractEvent = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .find((event) => event.type === "topic_contract_published");

    expect(topicContractEvent).toBeDefined();

    const acceptedSupportedResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-sealed",
          primitive: "sealed_divergence",
          targetIds: [topicContractEvent!.id],
          expectedQualityGain: "Collect independent starting positions.",
          riskIfSkipped: "The run may converge before alternatives are visible.",
          requestedBudget: {
            maxEvents: 4,
            maxProviderCalls: 2
          },
          status: "proposed"
        },
        basedOnEventIds: [topicContractEvent!.id]
      }
    );
    const acceptedSupportedBody = (await acceptedSupportedResponse.json()) as {
      event: { id: string };
    };
    const acceptedUnsupportedResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-blind-reframe",
          primitive: "blind_reframe",
          targetIds: [topicContractEvent!.id],
          expectedQualityGain: "Inspect possible missing context before continuing.",
          riskIfSkipped: "Important omissions may remain unresolved.",
          requestedBudget: {
            maxEvents: 1
          },
          status: "proposed"
        },
        basedOnEventIds: [topicContractEvent!.id]
      }
    );
    const acceptedUnsupportedBody = (await acceptedUnsupportedResponse.json()) as {
      event: { id: string };
    };
    const invalidTargetResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-evidence-invalid",
          primitive: "evidence_check",
          targetIds: [topicContractEvent!.id],
          expectedQualityGain: "Record evidence material for accepted evidence needs.",
          riskIfSkipped: "The accepted evidence need may remain unchecked.",
          requestedBudget: {
            maxEvents: 1,
            maxProviderCalls: 1
          },
          status: "proposed"
        },
        basedOnEventIds: [topicContractEvent!.id]
      }
    );
    const invalidTargetBody = (await invalidTargetResponse.json()) as {
      event: { id: string };
    };

    for (const proposalEventId of [
      acceptedSupportedBody.event.id,
      acceptedUnsupportedBody.event.id,
      invalidTargetBody.event.id
    ]) {
      await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals/${proposalEventId}/decisions`,
        {
          authorId: "coordinator-1",
          status: "accepted",
          rationale: "Expose readiness without executing this process proposal."
        }
      );
    }

    const eventCountBeforeRead =
      daemonApp.eventStore.listEvents(created.run.sessionId).length;
    const response = await daemonApp.app.request(
      `/runs/${created.run.runId}/process-proposals`
    );
    const body = (await response.json()) as {
      executionReadiness: Array<{
        proposalEventId: string;
        primitive: string;
        executable: boolean;
        status: string;
        reason: string;
        startRequestPreview?: {
          sealedDivergence?: { autoCloseManual?: boolean };
        };
      }>;
    };
    const readinessByEventId = new Map(
      body.executionReadiness.map((readiness) => [readiness.proposalEventId, readiness])
    );

    expect(response.status).toBe(200);
    expect(readinessByEventId.get(acceptedSupportedBody.event.id)).toEqual(
      expect.objectContaining({
        primitive: "sealed_divergence",
        executable: true,
        status: "ready",
        startRequestPreview: {
          sealedDivergence: {
            autoCloseManual: true
          }
        }
      })
    );
    expect(readinessByEventId.get(acceptedUnsupportedBody.event.id)).toEqual(
      expect.objectContaining({
        primitive: "blind_reframe",
        executable: false,
        status: "unsupported_primitive",
        reason: "Process proposal primitive is not executable by the daemon yet."
      })
    );
    expect(readinessByEventId.get(invalidTargetBody.event.id)).toEqual(
      expect.objectContaining({
        primitive: "evidence_check",
        executable: false,
        status: "invalid_target",
        reason: "Evidence check process proposal targets must be accepted evidence needs."
      })
    );
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(
      eventCountBeforeRead
    );
    expect(
      daemonApp.eventStore
        .listEvents(created.run.sessionId)
        .some((event) => event.type === "sealed_batch_opened")
    ).toBe(false);
    expectSafeRunApiPayload(body);
  });

  it("records session process proposal lifecycle events without executing primitives", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const topicContractEvent = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .find((event) => event.type === "topic_contract_published");
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(created.run.sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    expect(topicContractEvent).toBeDefined();

    try {
      const proposeResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals`,
        {
          authorId: "system",
          proposal: {
            id: "process-proposal-1",
            primitive: "evidence_check",
            targetIds: ["candidate-object-1"],
            expectedQualityGain: "Close a missing evidence gap before finalization.",
            riskIfSkipped: "The run may compile an outcome with unsupported claims.",
            requestedBudget: {
              maxEvents: 3
            },
            status: "proposed"
          },
          basedOnEventIds: [topicContractEvent!.id]
        }
      );
      const proposeBody = (await proposeResponse.json()) as {
        proposalId: string;
        event: { id: string; type: string; basedOnEventIds: string[]; payload: { status: string } };
      };
      const proposalEventId = proposeBody.event.id;
      const challengeResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals/${proposalEventId}/challenges`,
        {
          authorId: "reviewer-1",
          reason: "Check whether a repair pass should happen before evidence check."
        }
      );
      const challengeBody = (await challengeResponse.json()) as {
        event: { id: string; type: string; basedOnEventIds: string[] };
      };
      const decisionResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals/${proposalEventId}/decisions`,
        {
          authorId: "coordinator-1",
          status: "accepted",
          rationale: "Record the process decision for the next operator-controlled step."
        }
      );
      const decisionBody = (await decisionResponse.json()) as {
        event: { id: string; type: string; basedOnEventIds: string[]; payload: { status: string } };
      };
      const projectionResponse = await daemonApp.app.request(
        `/sessions/${created.run.sessionId}/process-proposals`
      );
      const projectionBody = (await projectionResponse.json()) as {
        proposalStates: Array<{
          proposalEventId: string;
          latestStatus: string;
          challengeEventIds: string[];
          decisionEventIds: string[];
          proposal: { status: string; targetIds: string[] };
        }>;
      };
      const ledgerEventTypes = daemonApp.eventStore
        .listEvents(created.run.sessionId)
        .map((event) => event.type);

      expect(proposeResponse.status).toBe(201);
      expect(challengeResponse.status).toBe(201);
      expect(decisionResponse.status).toBe(201);
      expect(projectionResponse.status).toBe(200);
      expectNoStore(projectionResponse);
      expect(proposeBody).toMatchObject({
        proposalId: "process-proposal-1",
        event: {
          type: "process_proposal_proposed",
          basedOnEventIds: [topicContractEvent!.id],
          payload: {
            status: "proposed"
          }
        }
      });
      expect(challengeBody.event).toMatchObject({
        type: "process_proposal_challenged",
        basedOnEventIds: [proposalEventId]
      });
      expect(decisionBody.event).toMatchObject({
        type: "process_proposal_decided",
        basedOnEventIds: [proposalEventId],
        payload: {
          status: "accepted"
        }
      });
      expect(projectionBody.proposalStates).toEqual([
        expect.objectContaining({
          proposalEventId,
          latestStatus: "accepted",
          challengeEventIds: [challengeBody.event.id],
          decisionEventIds: [decisionBody.event.id],
          proposal: expect.objectContaining({
            status: "proposed",
            targetIds: ["candidate-object-1"]
          })
        })
      ]);
      expect(received.map((event) => event.type)).toEqual([
        "process_proposal_proposed",
        "process_proposal_challenged",
        "process_proposal_decided"
      ]);
      expect(ledgerEventTypes).toEqual([
        "topic_contract_published",
        "process_proposal_proposed",
        "process_proposal_challenged",
        "process_proposal_decided"
      ]);
      expectSafeRunApiPayload(proposeBody);
      expectSafeRunApiPayload(projectionBody);
    } finally {
      unsubscribe();
    }
  });

  it("executes only accepted process proposals through the existing run start path", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const topicContractEvent = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .find((event) => event.type === "topic_contract_published");
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(created.run.sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    expect(topicContractEvent).toBeDefined();

    try {
      const proposeResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals`,
        {
          authorId: "system",
          proposal: {
            id: "process-proposal-1",
            primitive: "sealed_divergence",
            targetIds: [topicContractEvent!.id],
            expectedQualityGain: "Collect independent starting positions.",
            riskIfSkipped: "The run may converge before alternatives are visible.",
            requestedBudget: {
              maxEvents: 4,
              maxProviderCalls: 2
            },
            status: "proposed"
          },
          basedOnEventIds: [topicContractEvent!.id]
        }
      );
      const proposeBody = (await proposeResponse.json()) as {
        event: { id: string };
      };
      const prematureResponse = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
        {}
      );
      const prematureBody = (await prematureResponse.json()) as {
        error: { code: string; message: string };
      };

      expect(prematureResponse.status).toBe(409);
      expect(prematureBody.error).toEqual({
        code: "process_proposal_not_accepted",
        message: "Process proposal must be accepted before execution."
      });
      expect(
        daemonApp.eventStore
          .listEvents(created.run.sessionId)
          .some((event) => event.type === "sealed_batch_opened")
      ).toBe(false);

      await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
        {
          authorId: "coordinator-1",
          status: "accepted",
          rationale: "Run the accepted operator-controlled primitive."
        }
      );

      const executeResponse = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
        {}
      );
      const executeBody = (await executeResponse.json()) as {
        processProposal: { primitive: string; latestStatus: string };
        startRequest: { sealedDivergence?: { autoCloseManual?: boolean } };
        stages: Array<{ stage: string; eventIds: string[] }>;
        run: { sealedDivergenceStatus?: string };
      };
      const ledgerEventTypes = daemonApp.eventStore
        .listEvents(created.run.sessionId)
        .map((event) => event.type);

      expect(executeResponse.status).toBe(200);
      expect(executeBody.processProposal).toMatchObject({
        primitive: "sealed_divergence",
        latestStatus: "accepted"
      });
      expect(executeBody.startRequest).toEqual({
        sealedDivergence: {
          autoCloseManual: true
        }
      });
      expect(executeBody.stages).toEqual([
        expect.objectContaining({
          stage: "sealed_divergence",
          eventIds: expect.arrayContaining([
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.any(String)
          ])
        })
      ]);
      expect(executeBody.run.sealedDivergenceStatus).toBe("revealed");
      expect(ledgerEventTypes).toContain("process_proposal_proposed");
      expect(ledgerEventTypes).toContain("process_proposal_decided");
      expect(ledgerEventTypes).toContain("sealed_batch_opened");
      expect(ledgerEventTypes).toContain("sealed_batch_revealed");
      expect(received.map((event) => event.type)).toContain("sealed_batch_opened");
      expectSafeRunApiPayload(executeBody);
    } finally {
      unsubscribe();
    }
  });

  it("executes accepted final audit process proposals against an existing final candidate", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const initialRunResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    expect(initialRunResponse.status).toBe(200);

    const finalCandidateEventsBefore = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "final_candidate_proposed"
    );
    const finalAuditEventsBefore = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "final_audit_recorded"
    );
    const finalCandidateEvent = finalCandidateEventsBefore[0];
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(created.run.sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    expect(finalCandidateEvent).toBeDefined();
    expect(finalCandidateEventsBefore).toHaveLength(1);
    expect(finalAuditEventsBefore).toHaveLength(1);

    try {
      const proposeResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals`,
        {
          authorId: "system",
          proposal: {
            id: "process-proposal-final-audit",
            primitive: "final_audit",
            targetIds: [finalCandidateEvent!.id],
            expectedQualityGain: "Audit recorded final candidate material without rerunning final contest.",
            riskIfSkipped: "Outcome compilation may miss unresolved final audit boundaries.",
            requestedBudget: {
              maxEvents: 1,
              maxProviderCalls: 1
            },
            status: "proposed"
          },
          basedOnEventIds: [finalCandidateEvent!.id]
        }
      );
      const proposeBody = (await proposeResponse.json()) as {
        event: { id: string };
      };

      await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
        {
          authorId: "coordinator-1",
          status: "accepted",
          rationale: "Run the final audit against the recorded final candidate."
        }
      );

      const executeResponse = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
        {}
      );
      const executeBody = (await executeResponse.json()) as {
        processProposal: { primitive: string; latestStatus: string };
        startRequest: {
          finalization?: {
            roundId?: string;
            finalCandidateProposalEventId?: string;
            retryFailedAuditors?: boolean;
          };
        };
        stages: Array<{
          stage: string;
          status?: string;
          eventIds: string[];
          result: {
            finalCandidateResult?: { status: string; proposalEventId?: string };
            auditResults?: Array<{ status: string; auditEventId?: string }>;
            outcomeCompilation?: { status: string };
          };
        }>;
      };
      const finalCandidateEventsAfter = daemonApp.eventStore.listEventsByType(
        created.run.sessionId,
        "final_candidate_proposed"
      );
      const finalAuditEventsAfter = daemonApp.eventStore.listEventsByType(
        created.run.sessionId,
        "final_audit_recorded"
      );

      expect(executeResponse.status).toBe(200);
      expect(executeBody.processProposal).toEqual({
        proposalEventId: proposeBody.event.id,
        proposalId: "process-proposal-final-audit",
        primitive: "final_audit",
        latestStatus: "accepted"
      });
      expect(executeBody.startRequest).toEqual({
        finalization: {
          roundId: `process-proposal:${proposeBody.event.id}:final_audit`,
          finalCandidateProposalEventId: finalCandidateEvent!.id,
          retryFailedAuditors: true
        }
      });
      expect(executeBody.stages).toEqual([
        expect.objectContaining({
          stage: "finalization",
          status: "completed",
          eventIds: [expect.any(String)],
          result: expect.objectContaining({
            finalCandidateResult: expect.objectContaining({
              status: "skipped",
              proposalEventId: finalCandidateEvent!.id
            }),
            auditResults: [
              expect.objectContaining({
                status: "recorded",
                auditEventId: expect.any(String)
              })
            ],
            outcomeCompilation: {
              status: "not_requested"
            }
          })
        })
      ]);
      expect(finalCandidateEventsAfter).toHaveLength(1);
      expect(finalAuditEventsAfter).toHaveLength(2);
      expect(received.map((event) => event.type)).toContain("final_audit_recorded");
      expectSafeRunApiPayload(executeBody);
    } finally {
      unsubscribe();
    }
  });

  it("executes accepted omission audit process proposals through final audit material", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const initialRunResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    expect(initialRunResponse.status).toBe(200);

    const finalCandidateEventsBefore = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "final_candidate_proposed"
    );
    const finalAuditEventsBefore = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "final_audit_recorded"
    );
    const finalCandidateEvent = finalCandidateEventsBefore[0];

    expect(finalCandidateEvent).toBeDefined();
    expect(finalCandidateEventsBefore).toHaveLength(1);
    expect(finalAuditEventsBefore).toHaveLength(1);

    const proposeResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-omission-audit",
          primitive: "omission_audit",
          targetIds: [finalCandidateEvent!.id],
          expectedQualityGain: "Check whether final candidate material dropped important insights.",
          riskIfSkipped: "Dropped insights may remain invisible during outcome compilation.",
          requestedBudget: {
            maxEvents: 1,
            maxProviderCalls: 1
          },
          status: "proposed"
        },
        basedOnEventIds: [finalCandidateEvent!.id]
      }
    );
    const proposeBody = (await proposeResponse.json()) as {
      event: { id: string };
    };

    await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
      {
        authorId: "coordinator-1",
        status: "accepted",
        rationale: "Run the omission audit against the recorded final candidate."
      }
    );

    const executeResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
      {}
    );
    const executeBody = (await executeResponse.json()) as {
      processProposal: { primitive: string; latestStatus: string };
      startRequest: {
        finalization?: {
          roundId?: string;
          finalCandidateProposalEventId?: string;
          retryFailedAuditors?: boolean;
        };
      };
      stages: Array<{
        stage: string;
        result: {
          finalCandidateResult?: { status: string; proposalEventId?: string };
          auditResults?: Array<{ status: string; auditEventId?: string }>;
          outcomeCompilation?: { status: string };
        };
      }>;
    };
    const finalCandidateEventsAfter = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "final_candidate_proposed"
    );
    const finalAuditEventsAfter = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "final_audit_recorded"
    );

    expect(executeResponse.status).toBe(200);
    expect(executeBody.processProposal).toEqual({
      proposalEventId: proposeBody.event.id,
      proposalId: "process-proposal-omission-audit",
      primitive: "omission_audit",
      latestStatus: "accepted"
    });
    expect(executeBody.startRequest).toEqual({
      finalization: {
        roundId: `process-proposal:${proposeBody.event.id}:omission_audit`,
        finalCandidateProposalEventId: finalCandidateEvent!.id,
        retryFailedAuditors: true
      }
    });
    expect(executeBody.stages).toEqual([
      expect.objectContaining({
        stage: "finalization",
        result: expect.objectContaining({
          finalCandidateResult: expect.objectContaining({
            status: "skipped",
            proposalEventId: finalCandidateEvent!.id
          }),
          auditResults: [
            expect.objectContaining({
              status: "recorded",
              auditEventId: expect.any(String)
            })
          ],
          outcomeCompilation: {
            status: "not_requested"
          }
        })
      })
    ]);
    expect(finalCandidateEventsAfter).toHaveLength(1);
    expect(finalAuditEventsAfter).toHaveLength(2);
    expectSafeRunApiPayload(executeBody);
  });

  it("executes accepted candidate repair process proposals as proposal material only", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const initialRunResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      startFullRunRequest()
    );
    expect(initialRunResponse.status).toBe(200);

    const extractionEventsBefore = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "extraction_proposed"
    );
    const acceptanceEventsBefore = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "proposal_accepted"
    );
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(created.run.sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    expect(extractionEventsBefore).toHaveLength(1);
    expect(acceptanceEventsBefore).toHaveLength(1);

    try {
      const proposeResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals`,
        {
          authorId: "system",
          proposal: {
            id: "process-proposal-candidate-repair",
            primitive: "candidate_repair",
            targetIds: ["candidate-daemon-run-api"],
            expectedQualityGain: "Repair accepted candidate material without accepting it.",
            riskIfSkipped: "Known candidate objections may remain unaddressed.",
            requestedBudget: {
              maxEvents: 1,
              maxProviderCalls: 1
            },
            status: "proposed"
          },
          basedOnEventIds: [extractionEventsBefore[0]!.id]
        }
      );
      const proposeBody = (await proposeResponse.json()) as {
        event: { id: string };
      };

      await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
        {
          authorId: "coordinator-1",
          status: "accepted",
          rationale: "Run the candidate repair proposal as reviewable material."
        }
      );

      const executeResponse = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
        {}
      );
      const executeBody = (await executeResponse.json()) as {
        processProposal: { primitive: string; latestStatus: string };
        startRequest: {
          candidateRepair?: {
            roundId?: string;
            targetCandidateIds?: string[];
            retryFailedGenerators?: boolean;
          };
        };
        stages: Array<{
          stage: string;
          status?: string;
          eventIds: string[];
          result: {
            proposalResults?: Array<{ status: string; proposalEventId?: string }>;
          };
        }>;
        run: {
          latestCandidateRepairStatus?: string;
          rounds: { candidateRepair: unknown[] };
        };
      };
      const extractionEventsAfter = daemonApp.eventStore.listEventsByType(
        created.run.sessionId,
        "extraction_proposed"
      );
      const acceptanceEventsAfter = daemonApp.eventStore.listEventsByType(
        created.run.sessionId,
        "proposal_accepted"
      );

      expect(executeResponse.status).toBe(200);
      expect(executeBody.processProposal).toEqual({
        proposalEventId: proposeBody.event.id,
        proposalId: "process-proposal-candidate-repair",
        primitive: "candidate_repair",
        latestStatus: "accepted"
      });
      expect(executeBody.startRequest).toEqual({
        candidateRepair: {
          roundId: `process-proposal:${proposeBody.event.id}:candidate_repair`,
          targetCandidateIds: ["candidate-daemon-run-api"],
          retryFailedGenerators: true
        }
      });
      expect(executeBody.stages).toEqual([
        expect.objectContaining({
          stage: "candidate_repair",
          status: "completed",
          eventIds: [expect.any(String)],
          result: {
            proposalResults: [
              expect.objectContaining({
                status: "proposed",
                proposalEventId: expect.any(String)
              })
            ]
          }
        })
      ]);
      expect(executeBody.run.latestCandidateRepairStatus).toBe("completed");
      expect(executeBody.run.rounds.candidateRepair).toHaveLength(1);
      expect(extractionEventsAfter).toHaveLength(2);
      expect(acceptanceEventsAfter).toHaveLength(1);
      expect(received.map((event) => event.type)).toContain("extraction_proposed");
      expectSafeRunApiPayload(executeBody);
    } finally {
      unsubscribe();
    }
  });

  it("executes accepted evidence check process proposals as reported evidence only", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const topicContractEvent = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .find((event) => event.type === "topic_contract_published");
    const received: Array<{ id: string; type: string }> = [];
    const unsubscribe = daemonApp.eventBus.subscribe(created.run.sessionId, (event) => {
      received.push({
        id: event.id,
        type: event.type
      });
    });

    expect(topicContractEvent).toBeDefined();

    try {
      const extractionResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/extractions`,
        {
          authorId: "extractor-1",
          claims: [
            {
              id: "claim-daemon-evidence",
              content: "The daemon can record evidence check material without claiming verification.",
              scope: "design",
              sourceEventIds: [topicContractEvent!.id],
              supports: []
            }
          ],
          evidenceNeeds: [
            {
              id: "evidence-need-daemon",
              targetClaimId: "claim-daemon-evidence",
              requiredKind: "tool",
              reason: "Record supporting material before outcome compilation.",
              priority: "medium",
              status: "open",
              sourceEventIds: [topicContractEvent!.id]
            }
          ],
          rationale: "Propose an accepted evidence need for evidence check execution."
        }
      );
      const extractionBody = (await extractionResponse.json()) as {
        event: { id: string };
      };

      await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/proposals/${extractionBody.event.id}/acceptance`,
        {
          authorId: "coordinator-1",
          rationale: "Accept evidence need material for the process proposal execution test."
        }
      );

      const proposeResponse = await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals`,
        {
          authorId: "system",
          proposal: {
            id: "process-proposal-evidence",
            primitive: "evidence_check",
            targetIds: ["evidence-need-daemon"],
            expectedQualityGain: "Record evidence material for an accepted evidence need.",
            riskIfSkipped: "The accepted evidence need may remain unchecked.",
            requestedBudget: {
              maxEvents: 1,
              maxProviderCalls: 1
            },
            status: "proposed"
          },
          basedOnEventIds: [extractionBody.event.id]
        }
      );
      const proposeBody = (await proposeResponse.json()) as {
        event: { id: string };
      };

      await postJson(
        daemonApp.app,
        `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
        {
          authorId: "coordinator-1",
          status: "accepted",
          rationale: "Run the evidence check as reported evidence material."
        }
      );

      const executeResponse = await postJson(
        daemonApp.app,
        `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
        {}
      );
      const executeBody = (await executeResponse.json()) as {
        processProposal: { primitive: string; latestStatus: string };
        startRequest: {
          evidenceCheck?: {
            roundId?: string;
            targetEvidenceNeedIds?: string[];
            retryFailedGenerators?: boolean;
          };
        };
        stages: Array<{
          stage: string;
          status?: string;
          eventIds: string[];
          result: {
            evidenceResults?: Array<{ status: string; evidenceResultEventIds?: string[] }>;
          };
        }>;
        run: {
          latestEvidenceCheckStatus?: string;
          rounds: { evidenceCheck: unknown[] };
        };
      };
      const evidenceResultEvents = daemonApp.eventStore.listEventsByType(
        created.run.sessionId,
        "evidence_result_recorded"
      );
      const executeText = JSON.stringify(executeBody);

      expect(extractionResponse.status).toBe(201);
      expect(proposeResponse.status).toBe(201);
      expect(executeResponse.status).toBe(200);
      expect(executeBody.processProposal).toEqual({
        proposalEventId: proposeBody.event.id,
        proposalId: "process-proposal-evidence",
        primitive: "evidence_check",
        latestStatus: "accepted"
      });
      expect(executeBody.startRequest).toEqual({
        evidenceCheck: {
          roundId: `process-proposal:${proposeBody.event.id}:evidence_check`,
          targetEvidenceNeedIds: ["evidence-need-daemon"],
          retryFailedGenerators: true
        }
      });
      expect(executeBody.stages).toEqual([
        expect.objectContaining({
          stage: "evidence_check",
          status: "completed",
          eventIds: [expect.any(String)],
          result: {
            evidenceResults: [
              expect.objectContaining({
                status: "recorded",
                evidenceResultEventIds: [expect.any(String)]
              })
            ]
          }
        })
      ]);
      expect(executeBody.run.latestEvidenceCheckStatus).toBe("completed");
      expect(executeBody.run.rounds.evidenceCheck).toHaveLength(1);
      expect(evidenceResultEvents).toHaveLength(1);
      expect(evidenceResultEvents[0]?.payload).toMatchObject({
        evidenceNeedId: "evidence-need-daemon",
        source: "Deterministic daemon evidence source",
        summary: "Reported daemon evidence result for the target evidence need."
      });
      expect(received.map((event) => event.type)).toContain("evidence_result_recorded");
      expect(executeText).not.toContain("verified");
      expectSafeRunApiPayload(executeBody);
    } finally {
      unsubscribe();
    }
  });

  it("rejects accepted sealed-divergence process proposals outside the current run target", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const topicContractEvent = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .find((event) => event.type === "topic_contract_published");

    expect(topicContractEvent).toBeDefined();

    const proposeResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-sealed-divergence-stale",
          primitive: "sealed_divergence",
          targetIds: ["missing-topic-contract"],
          expectedQualityGain: "Collect independent starting positions.",
          riskIfSkipped: "The run may converge before alternatives are visible.",
          requestedBudget: {
            maxEvents: 4,
            maxProviderCalls: 2
          },
          status: "proposed"
        },
        basedOnEventIds: [topicContractEvent!.id]
      }
    );
    const proposeBody = (await proposeResponse.json()) as {
      event: { id: string };
    };

    await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
      {
        authorId: "coordinator-1",
        status: "accepted",
        rationale: "Accept the process proposal but require current run target validation."
      }
    );

    const executeResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
      {}
    );
    const executeBody = (await executeResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(executeResponse.status).toBe(409);
    expect(executeBody.error).toEqual({
      code: "process_proposal_target_invalid",
      message: "Sealed divergence process proposal must target the run topic contract."
    });
    expect(daemonApp.eventStore.listEventsByType(created.run.sessionId, "sealed_batch_opened")).toEqual(
      []
    );
  });

  it("rejects accepted relation-mapping process proposals with stale revealed targets", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const initialRunResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      {
        sealedDivergence: {
          autoCloseManual: true
        }
      }
    );

    expect(initialRunResponse.status).toBe(200);

    const contributionEvents = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "sealed_contribution_submitted"
    );
    expect(contributionEvents).toHaveLength(2);

    const proposeResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-relation-mapping-stale",
          primitive: "relation_mapping",
          targetIds: ["missing-contribution-event"],
          expectedQualityGain: "Map revealed contributions into traceable proposal material.",
          riskIfSkipped: "Raw contributions may remain unstructured.",
          requestedBudget: {
            maxEvents: 2,
            maxProviderCalls: 1
          },
          status: "proposed"
        },
        basedOnEventIds: contributionEvents.map((event) => event.id)
      }
    );
    const proposeBody = (await proposeResponse.json()) as {
      event: { id: string };
    };

    await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
      {
        authorId: "coordinator-1",
        status: "accepted",
        rationale: "Accept the process proposal but require revealed target validation."
      }
    );

    const executeResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
      {}
    );
    const executeBody = (await executeResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(executeResponse.status).toBe(409);
    expect(executeBody.error).toEqual({
      code: "process_proposal_target_invalid",
      message:
        "Relation mapping process proposal targets must match current revealed divergence material."
    });
    expect(daemonApp.eventStore.listEventsByType(created.run.sessionId, "extraction_proposed")).toEqual(
      []
    );
  });

  it("rejects accepted red-team process proposals with stale extraction targets", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const initialRunResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      {
        sealedDivergence: {
          autoCloseManual: true
        },
        extraction: {
          generatorIds: ["fake-extractor"]
        }
      }
    );

    expect(initialRunResponse.status).toBe(200);

    const extractionEvents = daemonApp.eventStore.listEventsByType(
      created.run.sessionId,
      "extraction_proposed"
    );
    expect(extractionEvents).toHaveLength(1);

    const proposeResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-red-team-stale",
          primitive: "red_team",
          targetIds: ["missing-extraction-event"],
          expectedQualityGain: "Challenge the current extraction material.",
          riskIfSkipped: "Extraction material may be accepted without review.",
          requestedBudget: {
            maxEvents: 1,
            maxProviderCalls: 1
          },
          status: "proposed"
        },
        basedOnEventIds: [extractionEvents[0]!.id]
      }
    );
    const proposeBody = (await proposeResponse.json()) as {
      event: { id: string };
    };

    await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
      {
        authorId: "coordinator-1",
        status: "accepted",
        rationale: "Accept the process proposal but keep target validation strict."
      }
    );

    const executeResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
      {}
    );
    const executeBody = (await executeResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(executeResponse.status).toBe(409);
    expect(executeBody.error).toEqual({
      code: "process_proposal_target_invalid",
      message: "Red team process proposal targets must be current extraction proposal events."
    });
    expect(daemonApp.eventStore.listEventsByType(created.run.sessionId, "proposal_accepted")).toEqual(
      []
    );
  });

  it("rejects accepted final-contest process proposals outside the active frontier", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const initialRunResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/start`,
      {
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
        }
      }
    );

    expect(initialRunResponse.status).toBe(200);
    expect(
      daemonApp.eventStore.listEventsByType(created.run.sessionId, "proposal_accepted")
    ).toHaveLength(1);

    const proposeResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-final-contest-stale",
          primitive: "final_contest",
          targetIds: ["missing-candidate"],
          expectedQualityGain: "Generate final candidate material from the active frontier.",
          riskIfSkipped: "The run may stop before final candidate material is proposed.",
          requestedBudget: {
            maxEvents: 1,
            maxProviderCalls: 1
          },
          status: "proposed"
        },
        basedOnEventIds: daemonApp.eventStore
          .listEventsByType(created.run.sessionId, "proposal_accepted")
          .map((event) => event.id)
      }
    );
    const proposeBody = (await proposeResponse.json()) as {
      event: { id: string };
    };

    await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
      {
        authorId: "coordinator-1",
        status: "accepted",
        rationale: "Accept the process proposal but require the target frontier to match."
      }
    );

    const executeResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
      {}
    );
    const executeBody = (await executeResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(executeResponse.status).toBe(409);
    expect(executeBody.error).toEqual({
      code: "process_proposal_target_invalid",
      message:
        "Final contest process proposal targets must match the current active candidate frontier."
    });
    expect(
      daemonApp.eventStore.listEventsByType(created.run.sessionId, "final_candidate_proposed")
    ).toEqual([]);
  });

  it("rejects accepted process proposals for unsupported daemon primitives", async () => {
    const daemonApp = createRunDaemon();
    const created = await createRun(daemonApp);
    const topicContractEvent = daemonApp.eventStore
      .listEvents(created.run.sessionId)
      .find((event) => event.type === "topic_contract_published");

    expect(topicContractEvent).toBeDefined();

    const proposeResponse = await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals`,
      {
        authorId: "system",
        proposal: {
          id: "process-proposal-blind-reframe",
          primitive: "blind_reframe",
          targetIds: [topicContractEvent!.id],
          expectedQualityGain: "Inspect possible missing context before continuing.",
          riskIfSkipped: "Important omissions may remain unresolved.",
          requestedBudget: {
            maxEvents: 1
          },
          status: "proposed"
        },
        basedOnEventIds: [topicContractEvent!.id]
      }
    );
    const proposeBody = (await proposeResponse.json()) as {
      event: { id: string };
    };

    await postJson(
      daemonApp.app,
      `/sessions/${created.run.sessionId}/process-proposals/${proposeBody.event.id}/decisions`,
      {
        authorId: "coordinator-1",
        status: "accepted",
        rationale: "Accept the need without pretending a runner exists."
      }
    );

    const executeResponse = await postJson(
      daemonApp.app,
      `/runs/${created.run.runId}/process-proposals/${proposeBody.event.id}/execute`,
      {}
    );
    const executeBody = (await executeResponse.json()) as {
      error: { code: string; message: string };
    };

    expect(executeResponse.status).toBe(409);
    expect(executeBody.error).toEqual({
      code: "process_proposal_primitive_unsupported",
      message: "Process proposal primitive is not executable by the daemon yet."
    });
    expect(
      daemonApp.eventStore
        .listEvents(created.run.sessionId)
        .some((event) => event.type === "sealed_batch_opened")
    ).toBe(false);
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

  it("records safe daemon operation audit metadata for control-plane requests", async () => {
    const auditIds = createIds();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      operationAuditIdGenerator: () => `operation-audit-${auditIds()}`,
      clock
    });
    const created = await createRun(daemonApp);
    const resourceAccessToken = "R".repeat(32);
    const webgetToken = "W".repeat(32);

    const health = await daemonApp.app.request("/health");
    const profiles = await daemonApp.app.request("/runtime/profiles");
    const resourceAccess = await daemonApp.app.request(
      `/resource-access/${resourceAccessToken}`
    );
    const webget = await daemonApp.app.request(`/webget/${webgetToken}/context`);
    const auditResponse = await daemonApp.app.request("/runtime/operation-audit?limit=10");
    const auditBody = (await auditResponse.json()) as {
      events: Array<{
        action: string;
        route: string;
        statusCode: number;
        outcome: string;
        authorization: {
          mode: string;
          present: boolean;
        };
        target: Record<string, string>;
      }>;
    };
    const serializedAudit = JSON.stringify(daemonApp.operationAuditLog.list({ limit: 20 }));

    expect(health.status).toBe(200);
    expect(profiles.status).toBe(200);
    expect(resourceAccess.status).toBe(400);
    expect(webget.status).toBe(400);
    expect(auditResponse.status).toBe(200);
    expectNoStore(auditResponse);
    expect(auditBody.events).toEqual([
      expect.objectContaining({
        action: "run_create",
        route: "/runs",
        statusCode: 201,
        outcome: "succeeded",
        authorization: {
          mode: "daemon_bearer",
          present: false
        },
        target: {}
      }),
      expect.objectContaining({
        action: "runtime_profiles_read",
        route: "/runtime/profiles",
        statusCode: 200,
        outcome: "succeeded"
      }),
      expect.objectContaining({
        action: "resource_access_get",
        route: "/resource-access/:accessId",
        statusCode: 400,
        outcome: "rejected",
        authorization: {
          mode: "resource_access_token",
          present: true
        },
        target: {}
      }),
      expect.objectContaining({
        action: "webget_context",
        route: "/webget/:token/context",
        statusCode: 400,
        outcome: "rejected",
        authorization: {
          mode: "webget_token",
          present: true
        },
        target: {}
      })
    ]);
    expect(daemonApp.eventStore.listEvents(created.run.sessionId)).toHaveLength(1);
    expect(daemonApp.operationAuditLog.list({ limit: 20 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "operation_audit_read",
          route: "/runtime/operation-audit"
        })
      ])
    );
    expect(serializedAudit).not.toContain(resourceAccessToken);
    expect(serializedAudit).not.toContain(webgetToken);
    expect(serializedAudit).not.toContain("Authorization");
    expect(serializedAudit).not.toContain("Bearer ");
    expect(serializedAudit).not.toContain("/Users/");
  });

  it("records daemon auth failures without storing bearer tokens", async () => {
    const daemonAuthToken = "local-daemon-auth-token-123";
    const bearerToken = "Bearer local-daemon-auth-token-123";
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      operationAuditIdGenerator: createIds(),
      clock,
      daemonAuthToken
    });

    const unauthenticatedResponse = await daemonApp.app.request("/runtime/profiles");
    const authorizedResponse = await daemonApp.app.request("/runtime/operation-audit", {
      headers: {
        Authorization: bearerToken
      }
    });
    const auditEvents = daemonApp.operationAuditLog.list({ limit: 10 });
    const serializedAudit = JSON.stringify(auditEvents);

    expect(unauthenticatedResponse.status).toBe(401);
    expectNoStore(unauthenticatedResponse);
    expect(authorizedResponse.status).toBe(200);
    expectNoStore(authorizedResponse);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "runtime_profiles_read",
          route: "/runtime/profiles",
          statusCode: 401,
          outcome: "rejected",
          authorization: {
            mode: "daemon_bearer",
            present: false
          }
        }),
        expect.objectContaining({
          action: "operation_audit_read",
          route: "/runtime/operation-audit",
          statusCode: 200,
          outcome: "succeeded",
          authorization: expect.objectContaining({
            mode: "daemon_bearer",
            present: true,
            principalId: "daemon-default",
            role: "admin",
            scopes: ["read", "write", "audit"]
          })
        })
      ])
    );
    expect(serializedAudit).not.toContain(daemonAuthToken);
    expect(serializedAudit).not.toContain(bearerToken);
    expect(serializedAudit).not.toContain("Authorization");
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

  it("resolves daemon listen host and port from explicit options or env", () => {
    expect(resolveStartDaemonHost({}, {})).toBe(DEFAULT_DAEMON_HOST);
    expect(resolveStartDaemonPort({}, {})).toBe(DEFAULT_DAEMON_PORT);
    expect(
      resolveStartDaemonHost(
        {},
        {
          [DAEMON_HOST_ENV_VAR]: " 0.0.0.0 "
        }
      )
    ).toBe("0.0.0.0");
    expect(
      resolveStartDaemonPort(
        {},
        {
          [DAEMON_PORT_ENV_VAR]: " 4888 "
        }
      )
    ).toBe(4888);
    expect(
      resolveStartDaemonHost(
        { host: "127.0.0.2" },
        {
          [DAEMON_HOST_ENV_VAR]: "0.0.0.0"
        }
      )
    ).toBe("127.0.0.2");
    expect(
      resolveStartDaemonPort(
        { port: 4999 },
        {
          [DAEMON_PORT_ENV_VAR]: "4888"
        }
      )
    ).toBe(4999);
    expect(resolveStartDaemonHost({}, { [DAEMON_HOST_ENV_VAR]: "   " })).toBe(
      DEFAULT_DAEMON_HOST
    );
    expect(resolveStartDaemonPort({}, { [DAEMON_PORT_ENV_VAR]: "   " })).toBe(
      DEFAULT_DAEMON_PORT
    );
    expect(() =>
      resolveStartDaemonPort({}, { [DAEMON_PORT_ENV_VAR]: "not-a-port" })
    ).toThrow(`${DAEMON_PORT_ENV_VAR} must be an integer from 1 to 65535.`);
    expect(() => resolveStartDaemonPort({}, { [DAEMON_PORT_ENV_VAR]: "0" })).toThrow(
      `${DAEMON_PORT_ENV_VAR} must be an integer from 1 to 65535.`
    );
    expect(() => resolveStartDaemonPort({}, { [DAEMON_PORT_ENV_VAR]: "65536" })).toThrow(
      `${DAEMON_PORT_ENV_VAR} must be an integer from 1 to 65535.`
    );
  });

  it("resolves optional daemon JSON event store path from env without overriding explicit stores", () => {
    const injectedStore = new InMemoryEventStore();

    expect(
      resolveStartDaemonEventStorePath({
        [DAEMON_EVENT_STORE_PATH_ENV_VAR]: " /tmp/deliberum-daemon-events.json "
      })
    ).toBe("/tmp/deliberum-daemon-events.json");
    expect(resolveStartDaemonEventStorePath({})).toBeUndefined();
    expect(
      resolveStartDaemonEventStorePath({
        [DAEMON_EVENT_STORE_PATH_ENV_VAR]: "   "
      })
    ).toBeUndefined();
    expect(
      createStartDaemonEventStore(
        { eventStore: injectedStore },
        {
          [DAEMON_EVENT_STORE_PATH_ENV_VAR]: "/tmp/ignored-events.json"
        }
      )
    ).toBe(injectedStore);
  });

  it("resolves optional daemon JSON run store path from env without overriding explicit stores", () => {
    const injectedStore = new InMemoryRunStore();

    expect(
      resolveStartDaemonRunStorePath({
        [DAEMON_RUN_STORE_PATH_ENV_VAR]: " /tmp/deliberum-daemon-runs.json "
      })
    ).toBe("/tmp/deliberum-daemon-runs.json");
    expect(resolveStartDaemonRunStorePath({})).toBeUndefined();
    expect(
      resolveStartDaemonRunStorePath({
        [DAEMON_RUN_STORE_PATH_ENV_VAR]: "   "
      })
    ).toBeUndefined();
    expect(
      createStartDaemonRunStore(
        { runStore: injectedStore },
        {
          [DAEMON_RUN_STORE_PATH_ENV_VAR]: "/tmp/ignored-runs.json"
        }
      )
    ).toBe(injectedStore);
  });

  it("resolves optional daemon JSON operation audit log path from env", () => {
    const injectedLog = new daemon.InMemoryOperationAuditLog();

    expect(
      resolveStartDaemonOperationAuditPath({
        [DAEMON_OPERATION_AUDIT_PATH_ENV_VAR]: " /tmp/deliberum-daemon-operations.json "
      })
    ).toBe("/tmp/deliberum-daemon-operations.json");
    expect(resolveStartDaemonOperationAuditPath({})).toBeUndefined();
    expect(
      resolveStartDaemonOperationAuditPath({
        [DAEMON_OPERATION_AUDIT_PATH_ENV_VAR]: "   "
      })
    ).toBeUndefined();
    expect(
      createStartDaemonOperationAuditLog(
        { operationAuditLog: injectedLog },
        {
          [DAEMON_OPERATION_AUDIT_PATH_ENV_VAR]: "/tmp/ignored-operations.json",
          [DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR]: "not-a-number"
        }
      )
    ).toBe(injectedLog);
    expect(
      resolveStartDaemonOperationAuditMaxEntries({
        [DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR]: " 25 "
      })
    ).toBe(25);
    expect(resolveStartDaemonOperationAuditMaxEntries({})).toBeUndefined();
    expect(
      resolveStartDaemonOperationAuditMaxEntries({
        [DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR]: "   "
      })
    ).toBeUndefined();
    expect(() =>
      resolveStartDaemonOperationAuditMaxEntries({
        [DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR]: "not-a-number"
      })
    ).toThrow(`${DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR} must be a positive integer.`);

    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-operation-audit-"));
    const filePath = join(dir, "operations.json");

    try {
      const firstLog = createStartDaemonOperationAuditLog(
        {
          operationAuditIdGenerator: createIds(),
          operationAuditClock: clock
        },
        {
          [DAEMON_OPERATION_AUDIT_PATH_ENV_VAR]: filePath
        }
      );

      expect(firstLog).toBeInstanceOf(JsonFileOperationAuditLog);
      firstLog?.record({
        action: "runtime_profiles_read",
        method: "GET",
        route: "/runtime/profiles",
        statusCode: 200,
        outcome: "succeeded",
        authorization: {
          mode: "daemon_bearer",
          present: true
        },
        target: {}
      });

      const secondLog = createStartDaemonOperationAuditLog(
        {},
        {
          [DAEMON_OPERATION_AUDIT_PATH_ENV_VAR]: filePath
        }
      );

      expect(secondLog?.list()).toEqual([
        expect.objectContaining({
          id: "id-1",
          recordedAt: "2026-06-10T00:00:00.000Z",
          action: "runtime_profiles_read",
          route: "/runtime/profiles"
        })
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("mirrors operation audit records to JSONL with local size rotation", () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-operation-audit-jsonl-"));
    const filePath = join(dir, "operations.jsonl");

    try {
      const log = createStartDaemonOperationAuditLog(
        {
          operationAuditIdGenerator: createIds(),
          operationAuditClock: clock
        },
        {
          [DAEMON_OPERATION_AUDIT_JSONL_PATH_ENV_VAR]: ` ${filePath} `,
          [DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES_ENV_VAR]: "1",
          [DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES_ENV_VAR]: "2"
        }
      );

      expect(log).toBeInstanceOf(MirroredOperationAuditLog);
      expect(
        resolveStartDaemonOperationAuditJsonlPath({
          [DAEMON_OPERATION_AUDIT_JSONL_PATH_ENV_VAR]: ` ${filePath} `
        })
      ).toBe(filePath);
      expect(resolveStartDaemonOperationAuditJsonlPath({})).toBeUndefined();
      expect(
        resolveStartDaemonOperationAuditJsonlPath({
          [DAEMON_OPERATION_AUDIT_JSONL_PATH_ENV_VAR]: "   "
        })
      ).toBeUndefined();
      expect(
        resolveStartDaemonOperationAuditJsonlMaxBytes({
          [DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES_ENV_VAR]: " 1 "
        })
      ).toBe(1);
      expect(resolveStartDaemonOperationAuditJsonlMaxBytes({})).toBeUndefined();
      expect(
        resolveStartDaemonOperationAuditJsonlMaxFiles({
          [DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES_ENV_VAR]: " 2 "
        })
      ).toBe(2);
      expect(resolveStartDaemonOperationAuditJsonlMaxFiles({})).toBeUndefined();

      log?.record(operationAuditInput("runtime_profiles_read"));
      log?.record({
        ...operationAuditInput("operation_audit_read"),
        route: "/runtime/operation-audit"
      });

      expect(log?.list()).toEqual([
        expect.objectContaining({
          id: "id-1",
          action: "runtime_profiles_read"
        }),
        expect.objectContaining({
          id: "id-2",
          action: "operation_audit_read"
        })
      ]);
      expect(existsSync(filePath)).toBe(true);
      expect(existsSync(`${filePath}.1`)).toBe(true);
      expect(readJsonlFile(`${filePath}.1`)).toEqual([
        expect.objectContaining({
          id: "id-1",
          action: "runtime_profiles_read",
          authorization: {
            mode: "daemon_bearer",
            present: true
          },
          target: {}
        })
      ]);
      expect(readJsonlFile(filePath)).toEqual([
        expect.objectContaining({
          id: "id-2",
          action: "operation_audit_read",
          route: "/runtime/operation-audit"
        })
      ]);

      const serialized = `${readFileSync(filePath, "utf8")}\n${readFileSync(
        `${filePath}.1`,
        "utf8"
      )}`;
      expect(serialized).not.toContain("Authorization");
      expect(serialized).not.toContain("Bearer ");
      expect(serialized).not.toContain("/Users/");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exports operation audit records to an HTTP collector without request material", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const errors: unknown[] = [];
    const token = ["audit", "collector", "token"].join("-");
    const sink = new daemon.HttpOperationAuditExportSink({
      endpointUrl: "https://audit.example/collect",
      authToken: token,
      timeoutMs: 1000,
      dispatch: async (url, init) => {
        requests.push({ url, init });
        return { ok: true, status: 202 };
      },
      onError: (error) => errors.push(error)
    });

    sink.write({
      ...operationAuditInput("operation_audit_read"),
      target: {
        sessionId: "session-1",
        resourceId: "resource-1"
      }
    });
    await Promise.resolve();

    expect(errors).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://audit.example/collect");
    expect((requests[0]?.init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${token}`
    );
    expect((requests[0]?.init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json"
    );

    const payload = JSON.parse(String(requests[0]?.init.body)) as {
      schemaVersion: number;
      event: unknown;
    };
    expect(payload).toEqual({
      schemaVersion: 1,
      event: expect.objectContaining({
        action: "operation_audit_read",
        method: "GET",
        route: "/runtime/profiles",
        authorization: {
          mode: "daemon_bearer",
          present: true
        },
        target: {
          sessionId: "session-1",
          resourceId: "resource-1"
        }
      })
    });

    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).not.toContain(token);
    expect(serializedPayload).not.toContain("Authorization");
    expect(serializedPayload).not.toContain("requestBody");
    expect(serializedPayload).not.toContain("headers");
  });

  it("keeps primary operation audit records when HTTP exporting fails", async () => {
    const errors: unknown[] = [];
    const log = new MirroredOperationAuditLog({
      primary: new daemon.InMemoryOperationAuditLog({
        idGenerator: createIds(),
        clock
      }),
      sink: new daemon.HttpOperationAuditExportSink({
        endpointUrl: "https://audit.example/collect",
        dispatch: async () => ({ ok: false, status: 503 }),
        onError: (error) => errors.push(error)
      })
    });

    const entry = log.record(operationAuditInput("runtime_profiles_read"));
    await Promise.resolve();
    await Promise.resolve();

    expect(entry).toEqual(
      expect.objectContaining({
        id: "id-1",
        action: "runtime_profiles_read"
      })
    );
    expect(log.list()).toEqual([
      expect.objectContaining({
        id: "id-1",
        action: "runtime_profiles_read"
      })
    ]);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain(
      "Operation audit HTTP export failed with status 503."
    );
  });

  it("attempts every operation audit export sink when one mirror fails", () => {
    const errors: unknown[] = [];
    const mirroredEntries: unknown[] = [];
    const log = new MirroredOperationAuditLog({
      primary: new daemon.InMemoryOperationAuditLog({
        idGenerator: createIds(),
        clock
      }),
      sink: new daemon.CompositeOperationAuditExportSink({
        sinks: [
          {
            write: () => {
              throw new Error("first audit export sink unavailable");
            }
          },
          {
            write: (entry) => mirroredEntries.push(entry)
          }
        ]
      }),
      onSinkError: (error) => errors.push(error)
    });

    const entry = log.record(operationAuditInput("runtime_profiles_read"));

    expect(entry).toEqual(
      expect.objectContaining({
        id: "id-1",
        action: "runtime_profiles_read"
      })
    );
    expect(mirroredEntries).toEqual([
      expect.objectContaining({
        id: "id-1",
        action: "runtime_profiles_read"
      })
    ]);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("first audit export sink unavailable");
  });

  it("mirrors operation audit records to JSONL and HTTP export sinks from env", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-operation-audit-export-"));
    const filePath = join(dir, "operations.jsonl");
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const token = ["audit", "export", "token"].join("-");

    try {
      const log = createStartDaemonOperationAuditLog(
        {
          operationAuditIdGenerator: createIds(),
          operationAuditClock: clock,
          operationAuditExportDispatch: async (url, init) => {
            requests.push({ url, init });
            return { ok: true, status: 202 };
          }
        },
        {
          [DAEMON_OPERATION_AUDIT_JSONL_PATH_ENV_VAR]: ` ${filePath} `,
          [DAEMON_OPERATION_AUDIT_EXPORT_URL_ENV_VAR]:
            " https://audit.example/collect ",
          [DAEMON_OPERATION_AUDIT_EXPORT_TOKEN_ENV_VAR]: ` ${token} `,
          [DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS_ENV_VAR]: " 1000 "
        }
      );

      expect(log).toBeInstanceOf(MirroredOperationAuditLog);
      expect(
        resolveStartDaemonOperationAuditExportUrl({
          [DAEMON_OPERATION_AUDIT_EXPORT_URL_ENV_VAR]:
            " https://audit.example/collect "
        })
      ).toBe("https://audit.example/collect");
      expect(resolveStartDaemonOperationAuditExportUrl({})).toBeUndefined();
      expect(
        resolveStartDaemonOperationAuditExportToken({
          [DAEMON_OPERATION_AUDIT_EXPORT_TOKEN_ENV_VAR]: ` ${token} `
        })
      ).toBe(token);
      expect(resolveStartDaemonOperationAuditExportToken({})).toBeUndefined();
      expect(
        resolveStartDaemonOperationAuditExportTimeoutMs({
          [DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS_ENV_VAR]: " 1000 "
        })
      ).toBe(1000);
      expect(resolveStartDaemonOperationAuditExportTimeoutMs({})).toBeUndefined();
      expect(resolveStartDaemonOperationAuditExportAllowInsecureHttp({})).toBe(false);

      log?.record(operationAuditInput("runtime_profiles_read"));
      await Promise.resolve();

      expect(readJsonlFile(filePath)).toEqual([
        expect.objectContaining({
          id: "id-1",
          action: "runtime_profiles_read",
          authorization: {
            mode: "daemon_bearer",
            present: true
          },
          target: {}
        })
      ]);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe("https://audit.example/collect");
      expect((requests[0]?.init.headers as Record<string, string>).authorization).toBe(
        `Bearer ${token}`
      );
      expect(JSON.stringify(JSON.parse(String(requests[0]?.init.body)))).not.toContain(
        token
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps primary operation audit records when JSONL mirroring fails", () => {
    const errors: unknown[] = [];
    const log = new MirroredOperationAuditLog({
      primary: new daemon.InMemoryOperationAuditLog({
        idGenerator: createIds(),
        clock
      }),
      sink: {
        write: () => {
          throw new Error("jsonl mirror unavailable");
        }
      },
      onSinkError: (error) => errors.push(error)
    });

    const entry = log.record(operationAuditInput("runtime_profiles_read"));

    expect(entry).toEqual(
      expect.objectContaining({
        id: "id-1",
        action: "runtime_profiles_read"
      })
    );
    expect(log.list()).toEqual([
      expect.objectContaining({
        id: "id-1",
        action: "runtime_profiles_read"
      })
    ]);
    expect(errors).toHaveLength(1);
  });

  it("rejects invalid operation audit JSONL rotation env values", () => {
    expect(() =>
      resolveStartDaemonOperationAuditJsonlMaxBytes({
        [DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES_ENV_VAR]: "not-a-number"
      })
    ).toThrow(
      `${DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES_ENV_VAR} must be a positive integer.`
    );
    expect(() =>
      resolveStartDaemonOperationAuditJsonlMaxFiles({
        [DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES_ENV_VAR]: "0"
      })
    ).toThrow(
      `${DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES_ENV_VAR} must be a positive integer.`
    );
  });

  it("rejects invalid operation audit HTTP export env values", () => {
    expect(() =>
      resolveStartDaemonOperationAuditExportTimeoutMs({
        [DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS_ENV_VAR]: "not-a-number"
      })
    ).toThrow(
      `${DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS_ENV_VAR} must be a positive integer.`
    );
    expect(() =>
      resolveStartDaemonOperationAuditExportAllowInsecureHttp({
        [DAEMON_OPERATION_AUDIT_EXPORT_ALLOW_INSECURE_HTTP_ENV_VAR]: "maybe"
      })
    ).toThrow(
      `${DAEMON_OPERATION_AUDIT_EXPORT_ALLOW_INSECURE_HTTP_ENV_VAR} must be true or false.`
    );
    expect(() =>
      createStartDaemonOperationAuditLog(
        {},
        {
          [DAEMON_OPERATION_AUDIT_EXPORT_URL_ENV_VAR]:
            "http://audit.example/collect"
        }
      )
    ).toThrow(
      "Operation audit HTTP export URL must use HTTPS unless insecure HTTP is explicitly allowed."
    );

    expect(
      createStartDaemonOperationAuditLog(
        {},
        {
          [DAEMON_OPERATION_AUDIT_EXPORT_URL_ENV_VAR]:
            "http://audit.example/collect",
          [DAEMON_OPERATION_AUDIT_EXPORT_ALLOW_INSECURE_HTTP_ENV_VAR]: "true"
        }
      )
    ).toBeInstanceOf(MirroredOperationAuditLog);
  });

  it("resolves optional daemon Web asset path from env without overriding explicit assets", () => {
    const explicitAssets = {
      rootDir: "/tmp/explicit-deliberum-web-dist",
      indexFile: "shell.html"
    };

    expect(
      resolveStartDaemonWebAssetsPath(
        {},
        {
          [DAEMON_WEB_ASSETS_PATH_ENV_VAR]: " /tmp/deliberum-web-dist "
        }
      )
    ).toBe("/tmp/deliberum-web-dist");
    expect(resolveStartDaemonWebAssetsPath({}, {})).toBeUndefined();
    expect(
      resolveStartDaemonWebAssetsPath(
        {},
        {
          [DAEMON_WEB_ASSETS_PATH_ENV_VAR]: "   "
        }
      )
    ).toBeUndefined();
    expect(
      resolveStartDaemonWebAssetsPath(
        { webStaticAssets: explicitAssets },
        {
          [DAEMON_WEB_ASSETS_PATH_ENV_VAR]: "/tmp/ignored-web-dist"
        }
      )
    ).toBe("/tmp/explicit-deliberum-web-dist");
    expect(
      createStartDaemonWebStaticAssets(
        { webStaticAssets: explicitAssets },
        {
          [DAEMON_WEB_ASSETS_PATH_ENV_VAR]: "/tmp/ignored-web-dist"
        }
      )
    ).toBe(explicitAssets);
    expect(
      createStartDaemonWebStaticAssets(
        {},
        {
          [DAEMON_WEB_ASSETS_PATH_ENV_VAR]: "/tmp/deliberum-web-dist"
        }
      )
    ).toEqual({
      rootDir: "/tmp/deliberum-web-dist"
    });
  });

  it("applies operation audit retention across in-memory, JSON, and SQLite logs", () => {
    const memoryLog = new daemon.InMemoryOperationAuditLog({
      idGenerator: createIds(),
      clock,
      maxEntries: 2
    });
    memoryLog.record(operationAuditInput("memory_first"));
    memoryLog.record(operationAuditInput("memory_second"));
    memoryLog.record(operationAuditInput("memory_third"));

    expect(memoryLog.list({ limit: 10 }).map((entry) => entry.action)).toEqual([
      "memory_second",
      "memory_third"
    ]);

    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-operation-retention-"));
    const jsonPath = join(dir, "operations.json");
    const sqlitePath = join(dir, "operations.sqlite");

    try {
      const jsonLog = createStartDaemonOperationAuditLog(
        {
          operationAuditIdGenerator: createIds(),
          operationAuditClock: clock
        },
        {
          [DAEMON_OPERATION_AUDIT_PATH_ENV_VAR]: jsonPath,
          [DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR]: "2"
        }
      );
      expect(jsonLog).toBeInstanceOf(JsonFileOperationAuditLog);
      jsonLog?.record(operationAuditInput("json_first"));
      jsonLog?.record(operationAuditInput("json_second"));
      jsonLog?.record(operationAuditInput("json_third"));

      expect(
        new JsonFileOperationAuditLog({
          filePath: jsonPath
        })
          .list({ limit: 10 })
          .map((entry) => entry.action)
      ).toEqual(["json_second", "json_third"]);

      const sqliteLog = new SQLiteOperationAuditLog({
        filePath: sqlitePath,
        idGenerator: createIds(),
        clock,
        maxEntries: 2
      });
      sqliteLog.record(operationAuditInput("sqlite_first"));
      sqliteLog.record(operationAuditInput("sqlite_second"));
      sqliteLog.record(operationAuditInput("sqlite_third"));
      sqliteLog.close();

      const reopenedSQLiteLog = new SQLiteOperationAuditLog({
        filePath: sqlitePath
      });
      expect(reopenedSQLiteLog.list({ limit: 10 }).map((entry) => entry.action)).toEqual([
        "sqlite_second",
        "sqlite_third"
      ]);
      reopenedSQLiteLog.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses restart-safe default ids for durable operation audit logs", () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-operation-audit-ids-"));
    const jsonPath = join(dir, "operations.json");
    const sqlitePath = join(dir, "operations.sqlite");
    let sqliteLog: SQLiteOperationAuditLog | undefined;
    let reopenedSQLiteLog: SQLiteOperationAuditLog | undefined;

    try {
      const jsonLog = new JsonFileOperationAuditLog({
        filePath: jsonPath,
        clock
      });
      const firstJsonEntry = jsonLog.record(operationAuditInput("json_before_restart"));
      const reopenedJsonLog = new JsonFileOperationAuditLog({
        filePath: jsonPath,
        clock
      });
      const secondJsonEntry = reopenedJsonLog.record(
        operationAuditInput("json_after_restart")
      );
      expect(secondJsonEntry.id).not.toBe(firstJsonEntry.id);
      expect(reopenedJsonLog.list({ limit: 10 }).map((entry) => entry.action).sort()).toEqual([
        "json_after_restart",
        "json_before_restart"
      ]);

      sqliteLog = new SQLiteOperationAuditLog({
        filePath: sqlitePath,
        clock
      });
      const firstSQLiteEntry = sqliteLog.record(
        operationAuditInput("sqlite_before_restart")
      );
      sqliteLog.close();
      sqliteLog = undefined;

      reopenedSQLiteLog = new SQLiteOperationAuditLog({
        filePath: sqlitePath,
        clock
      });
      const secondSQLiteEntry = reopenedSQLiteLog.record(
        operationAuditInput("sqlite_after_restart")
      );
      expect(secondSQLiteEntry.id).not.toBe(firstSQLiteEntry.id);
      expect(reopenedSQLiteLog.list({ limit: 10 }).map((entry) => entry.action).sort()).toEqual([
        "sqlite_after_restart",
        "sqlite_before_restart"
      ]);
    } finally {
      reopenedSQLiteLog?.close();
      sqliteLog?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves resource access base URL, TTL, and signing secret from explicit options or env", () => {
    expect(
      resolveStartDaemonResourceAccessBaseUrl(
        {},
        {
          [RESOURCE_ACCESS_BASE_URL_ENV_VAR]: " https://resources.example/deliberum ",
          [RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR]: "true"
        }
      )
    ).toBe("https://resources.example/deliberum");
    expect(resolveStartDaemonResourceAccessBaseUrl({}, {})).toBeUndefined();
    expect(
      resolveStartDaemonResourceAccessBaseUrl(
        { resourceAccessBaseUrl: "http://127.0.0.1:9999/local" },
        {
          [RESOURCE_ACCESS_BASE_URL_ENV_VAR]: "https://ignored.example"
        }
      )
    ).toBe("http://127.0.0.1:9999/local");
    expect(
      resolveStartDaemonResourceAccessBaseUrl(
        {},
        {
          [RESOURCE_ACCESS_BASE_URL_ENV_VAR]: "http://127.0.0.1:9999/local"
        }
      )
    ).toBe("http://127.0.0.1:9999/local");
    expect(() =>
      resolveStartDaemonResourceAccessBaseUrl(
        {},
        {
          [RESOURCE_ACCESS_BASE_URL_ENV_VAR]: "https://resources.example/deliberum"
        }
      )
    ).toThrow(
      `${RESOURCE_ACCESS_BASE_URL_ENV_VAR} requires ${RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR}=true for non-local URLs.`
    );
    expect(() =>
      resolveStartDaemonResourceAccessBaseUrl(
        {},
        {
          [RESOURCE_ACCESS_BASE_URL_ENV_VAR]: "http://resources.example/deliberum",
          [RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR]: "true"
        }
      )
    ).toThrow(`${RESOURCE_ACCESS_BASE_URL_ENV_VAR} public URLs must use HTTPS.`);
    expect(resolveStartDaemonResourceAccessAllowRemote({})).toBe(false);
    expect(
      resolveStartDaemonResourceAccessAllowRemote({
        [RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR]: "true"
      })
    ).toBe(true);
    expect(() =>
      resolveStartDaemonResourceAccessAllowRemote({
        [RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR]: "TRUE"
      })
    ).toThrow(`${RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR} must be true or false.`);
    expect(
      resolveStartDaemonResourceAccessTtlMs(
        {},
        {
          [RESOURCE_ACCESS_TTL_MS_ENV_VAR]: "60000"
        }
      )
    ).toBe(60000);
    expect(resolveStartDaemonResourceAccessTtlMs({}, {})).toBeUndefined();
    expect(
      resolveStartDaemonResourceAccessTtlMs(
        { resourceAccessTtlMs: 45000 },
        {
          [RESOURCE_ACCESS_TTL_MS_ENV_VAR]: "60000"
        }
      )
    ).toBe(45000);
    expect(() =>
      resolveStartDaemonResourceAccessTtlMs(
        {},
        {
          [RESOURCE_ACCESS_TTL_MS_ENV_VAR]: "not-a-number"
        }
      )
    ).toThrow(`${RESOURCE_ACCESS_TTL_MS_ENV_VAR} must be a positive integer.`);
    expect(
      resolveStartDaemonResourceAccessSigningSecret(
        {},
        {
          [RESOURCE_ACCESS_SIGNING_SECRET_ENV_VAR]: " resource-access-env-signing-key-32 "
        }
      )
    ).toBe("resource-access-env-signing-key-32");
    expect(resolveStartDaemonResourceAccessSigningSecret({}, {})).toBeUndefined();
    expect(
      resolveStartDaemonResourceAccessSigningSecret(
        { resourceAccessUrlSigningSecret: "resource-access-option-signing-key-32" },
        {
          [RESOURCE_ACCESS_SIGNING_SECRET_ENV_VAR]:
            "resource-access-env-signing-key-32"
        }
      )
    ).toBe("resource-access-option-signing-key-32");
    expect(() =>
      resolveStartDaemonResourceAccessSigningSecret(
        {},
        {
          [RESOURCE_ACCESS_SIGNING_SECRET_ENV_VAR]: "short"
        }
      )
    ).toThrow("Resource access signing secret must contain at least 32");
  });

  it("resolves optional daemon auth token from explicit options or env", () => {
    expect(
      resolveStartDaemonAuthToken(
        {},
        {
          [DAEMON_AUTH_TOKEN_ENV_VAR]: " local-daemon-auth-token-123 "
        }
      )
    ).toBe("local-daemon-auth-token-123");
    expect(resolveStartDaemonAuthToken({}, {})).toBeUndefined();
    expect(
      resolveStartDaemonAuthToken(
        { daemonAuthToken: "explicit-daemon-auth-token-123" },
        {
          [DAEMON_AUTH_TOKEN_ENV_VAR]: "ignored-daemon-auth-token-123"
        }
      )
    ).toBe("explicit-daemon-auth-token-123");
    expect(() =>
      resolveStartDaemonAuthToken(
        {},
        {
          [DAEMON_AUTH_TOKEN_ENV_VAR]: "too-short"
        }
      )
    ).toThrow(`${DAEMON_AUTH_TOKEN_ENV_VAR} must be at least 16 non-whitespace characters.`);
  });

  it("resolves scoped daemon auth token registries from explicit options or env", () => {
    expect(
      resolveStartDaemonAuthTokens(
        {},
        {
          [DAEMON_AUTH_TOKENS_JSON_ENV_VAR]: JSON.stringify([
            {
              principalId: "observer-1",
              token: "observer-daemon-token-123",
              role: "observer"
            },
            {
              principalId: "operator-1",
              token: "operator-daemon-token-123",
              scopes: ["read", "write"]
            }
          ])
        }
      )
    ).toEqual([
      {
        principalId: "observer-1",
        token: "observer-daemon-token-123",
        role: "observer"
      },
      {
        principalId: "operator-1",
        token: "operator-daemon-token-123",
        scopes: ["read", "write"]
      }
    ]);
    expect(resolveStartDaemonAuthTokens({}, {})).toEqual([]);
    expect(
      resolveStartDaemonAuthTokens(
        {
          daemonAuthTokens: [
            {
              principalId: "explicit-operator",
              token: "explicit-daemon-token-123",
              role: "operator"
            }
          ]
        },
        {
          [DAEMON_AUTH_TOKENS_JSON_ENV_VAR]: JSON.stringify([
            {
              principalId: "ignored-observer",
              token: "ignored-daemon-token-123",
              role: "observer"
            }
          ])
        }
      )
    ).toEqual([
      {
        principalId: "explicit-operator",
        token: "explicit-daemon-token-123",
        role: "operator"
      }
    ]);
    expect(() =>
      resolveStartDaemonAuthTokens(
        {},
        {
          [DAEMON_AUTH_TOKENS_JSON_ENV_VAR]: JSON.stringify([
            {
              principalId: "bad-secret",
              token: "registry-daemon-token-123",
              role: "observer"
            }
          ])
        }
      )
    ).toThrow(`${DAEMON_AUTH_TOKENS_JSON_ENV_VAR}[0].principalId must not contain secret-like material.`);
    expect(() =>
      resolveStartDaemonAuthTokens(
        {},
        {
          [DAEMON_AUTH_TOKENS_JSON_ENV_VAR]: JSON.stringify([
            {
              principalId: "observer-1",
              token: "registry-daemon-token-123",
              scopes: ["read", "invalid"]
            }
          ])
        }
      )
    ).toThrow(`${DAEMON_AUTH_TOKENS_JSON_ENV_VAR}[0].scopes[1] must be one of: read, write, audit.`);
    expect(() =>
      createDaemonApp({
        daemonAuthTokens: [
          {
            principalId: "observer-1",
            token: "duplicate-daemon-token-123",
            role: "observer"
          },
          {
            principalId: "operator-1",
            token: "duplicate-daemon-token-123",
            role: "operator"
          }
        ]
      })
    ).toThrow("Daemon auth tokens must be unique.");
    expect(() =>
      createDaemonApp({
        daemonAuthTokens: [
          {
            principalId: "invalid-role",
            token: "invalid-role-daemon-token-123",
            role: "owner" as never
          }
        ]
      })
    ).toThrow("daemonAuthTokens[0].role must be one of: admin, operator, observer, auditor.");
    expect(() =>
      createDaemonApp({
        daemonAuthTokens: [
          {
            principalId: "invalid-scope",
            token: "invalid-scope-daemon-token-123",
            scopes: ["read", "owner"] as never
          }
        ]
      })
    ).toThrow("daemonAuthTokens[0].scopes[1] must be one of: read, write, audit.");
  });

  it("resolves optional daemon SQLite path without overriding explicit stores", () => {
    const injectedEventStore = new InMemoryEventStore();
    const injectedRunStore = new InMemoryRunStore();
    const injectedResourceAccessStore = new ResourceAccessGrantStore();
    const injectedResourceBroker = new InMemoryResourceBroker();
    const injectedOperationAuditLog = new daemon.InMemoryOperationAuditLog();
    const sqlitePath = "/tmp/deliberum-daemon.sqlite";

    expect(
      resolveStartDaemonSQLitePath({
        [DAEMON_SQLITE_PATH_ENV_VAR]: " /tmp/deliberum-daemon.sqlite "
      })
    ).toBe(sqlitePath);
    expect(resolveStartDaemonSQLitePath({})).toBeUndefined();
    expect(
      resolveStartDaemonSQLitePath({
        [DAEMON_SQLITE_PATH_ENV_VAR]: "   "
      })
    ).toBeUndefined();
    expect(
      createStartDaemonEventStore(
        { eventStore: injectedEventStore },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      )
    ).toBe(injectedEventStore);
    expect(
      createStartDaemonRunStore(
        { runStore: injectedRunStore },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      )
    ).toBe(injectedRunStore);
    expect(
      createStartDaemonResourceAccessStore(
        { resourceAccessStore: injectedResourceAccessStore },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      )
    ).toBe(injectedResourceAccessStore);
    expect(
      createStartDaemonResourceStore(
        { resourceBroker: injectedResourceBroker },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      )
    ).toBe(injectedResourceBroker);
    expect(
      createStartDaemonOperationAuditLog(
        { operationAuditLog: injectedOperationAuditLog },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      )
    ).toBe(injectedOperationAuditLog);

    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-sqlite-resolve-"));
    const filePath = join(dir, "daemon.sqlite");

    try {
      const eventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: filePath
        }
      );
      const runStore = createStartDaemonRunStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: filePath
        }
      );
      const resourceAccessStore = createStartDaemonResourceAccessStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: filePath
        }
      );
      const resourceBroker = createStartDaemonResourceStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: filePath
        }
      );
      const operationAuditLog = createStartDaemonOperationAuditLog(
        {
          operationAuditIdGenerator: createIds(),
          operationAuditClock: clock
        },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: filePath
        }
      );

      expect(eventStore).toBeInstanceOf(SQLiteEventStore);
      expect(runStore).toBeInstanceOf(SQLiteRunStore);
      expect(resourceAccessStore).toBeInstanceOf(SQLiteResourceAccessGrantStore);
      expect(resourceBroker).toBeInstanceOf(SQLiteResourceBroker);
      expect(operationAuditLog).toBeInstanceOf(SQLiteOperationAuditLog);

      operationAuditLog?.record({
        action: "operation_audit_read",
        method: "GET",
        route: "/runtime/operation-audit",
        statusCode: 200,
        outcome: "succeeded",
        authorization: {
          mode: "daemon_bearer",
          present: true
        },
        target: {}
      });

      (eventStore as SQLiteEventStore).close();
      (runStore as SQLiteRunStore).close();
      (resourceAccessStore as SQLiteResourceAccessGrantStore).close();
      (resourceBroker as SQLiteResourceBroker).close();
      (operationAuditLog as SQLiteOperationAuditLog).close();

      const reopenedOperationAuditLog = createStartDaemonOperationAuditLog(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: filePath
        }
      );

      expect(reopenedOperationAuditLog?.list()).toEqual([
        expect.objectContaining({
          id: "id-1",
          recordedAt: "2026-06-10T00:00:00.000Z",
          action: "operation_audit_read",
          route: "/runtime/operation-audit"
        })
      ]);
      (reopenedOperationAuditLog as SQLiteOperationAuditLog).close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves optional daemon SQLite process lock settings", () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-sqlite-lock-resolve-"));
    const filePath = join(dir, "daemon.sqlite");
    let lock: SQLiteDaemonProcessLock | undefined;

    try {
      expect(resolveStartDaemonSQLiteProcessLock({}, {})).toBe(false);
      expect(
        resolveStartDaemonSQLiteProcessLock(
          {},
          {
            [DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR]: "true"
          }
        )
      ).toBe(true);
      expect(
        resolveStartDaemonSQLiteProcessLock(
          { sqliteProcessLock: false },
          {
            [DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR]: "true"
          }
        )
      ).toBe(false);
      expect(() =>
        resolveStartDaemonSQLiteProcessLock(
          {},
          {
            [DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR]: "TRUE"
          }
        )
      ).toThrow(`${DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR} must be true or false.`);
      expect(
        resolveStartDaemonSQLiteProcessLockTtlMs(
          {},
          {
            [DAEMON_SQLITE_PROCESS_LOCK_TTL_MS_ENV_VAR]: "45000"
          }
        )
      ).toBe(45000);
      expect(
        resolveStartDaemonSQLiteProcessLockHeartbeatMs(
          { sqliteProcessLockHeartbeatMs: 15000 },
          {
            [DAEMON_SQLITE_PROCESS_LOCK_HEARTBEAT_MS_ENV_VAR]: "20000"
          }
        )
      ).toBe(15000);
      expect(() =>
        resolveStartDaemonSQLiteProcessLockTtlMs(
          {},
          {
            [DAEMON_SQLITE_PROCESS_LOCK_TTL_MS_ENV_VAR]: "0"
          }
        )
      ).toThrow(`${DAEMON_SQLITE_PROCESS_LOCK_TTL_MS_ENV_VAR} must be a positive integer.`);
      expect(createStartDaemonSQLiteProcessLock({}, {})).toBeUndefined();
      expect(() =>
        createStartDaemonSQLiteProcessLock(
          {},
          {
            [DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR]: "true"
          }
        )
      ).toThrow(
        `${DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR}=true requires ${DAEMON_SQLITE_PATH_ENV_VAR}.`
      );

      lock = createStartDaemonSQLiteProcessLock(
        {
          sqliteProcessLockOwnerId: "daemon-test",
          sqliteProcessLockClock: () => Date.parse(clock()),
          sqliteProcessLockTtlMs: 45000,
          sqliteProcessLockHeartbeatMs: 15000
        },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: filePath,
          [DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR]: "true"
        }
      );

      expect(lock).toBeInstanceOf(SQLiteDaemonProcessLock);
      expect(() => lock?.acquire()).not.toThrow();
    } finally {
      lock?.release();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("guards one SQLite-backed daemon process when the process lock is enabled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-sqlite-lock-start-"));
    const filePath = join(dir, "daemon.sqlite");
    const previousSqlitePath = process.env[DAEMON_SQLITE_PATH_ENV_VAR];
    const previousProcessLock = process.env[DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR];
    let now = Date.parse(clock());
    let firstDaemon: ReturnType<typeof startDaemon> | undefined;
    let secondDaemon: ReturnType<typeof startDaemon> | undefined;
    let resolveFirstListening: () => void = () => {};
    let resolveSecondListening: () => void = () => {};
    const firstListening = new Promise<void>((resolve) => {
      resolveFirstListening = resolve;
    });
    const secondListening = new Promise<void>((resolve) => {
      resolveSecondListening = resolve;
    });

    process.env[DAEMON_SQLITE_PATH_ENV_VAR] = filePath;
    process.env[DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR] = "true";

    try {
      firstDaemon = startDaemon({
        host: "127.0.0.1",
        port: 0,
        sqliteProcessLockOwnerId: "daemon-a",
        sqliteProcessLockClock: () => now,
        sqliteProcessLockTtlMs: 1000,
        sqliteProcessLockHeartbeatMs: 500,
        idGenerator: createIds(),
        clock,
        onListening: resolveFirstListening
      });
      await firstListening;
      const posture = (await (
        await firstDaemon.app.request("/runtime/deployment-posture")
      ).json()) as {
        persistence: {
          sqliteProcessLock: string;
          productionMultiWriterCoordination: boolean;
        };
        safety: string[];
      };

      expect(posture.persistence.sqliteProcessLock).toBe("configured");
      expect(posture.persistence.productionMultiWriterCoordination).toBe(false);
      expect(posture.safety.join(" ")).toContain("cooperative single-daemon guard");
      expect(() =>
        startDaemon({
          host: "127.0.0.1",
          port: 0,
          sqliteProcessLockOwnerId: "daemon-b",
          sqliteProcessLockClock: () => now,
          sqliteProcessLockTtlMs: 1000,
          sqliteProcessLockHeartbeatMs: 500,
          idGenerator: createIds(),
          clock
        })
      ).toThrow(SQLiteDaemonProcessLockError);

      await closeStartedDaemon(firstDaemon);
      firstDaemon = undefined;

      now += 100;
      secondDaemon = startDaemon({
        host: "127.0.0.1",
        port: 0,
        sqliteProcessLockOwnerId: "daemon-b",
        sqliteProcessLockClock: () => now,
        sqliteProcessLockTtlMs: 1000,
        sqliteProcessLockHeartbeatMs: 500,
        idGenerator: createIds(),
        clock,
        onListening: resolveSecondListening
      });
      await secondListening;

      const secondPostureResponse = await secondDaemon.app.request(
        "/runtime/deployment-posture"
      );
      const secondPostureText = await secondPostureResponse.text();
      expect(secondPostureResponse.status, secondPostureText).toBe(200);
      const secondPosture = JSON.parse(secondPostureText) as {
        persistence: { sqliteProcessLock: string };
      };
      expect(secondPosture.persistence.sqliteProcessLock).toBe("configured");
    } finally {
      if (firstDaemon) {
        await closeStartedDaemon(firstDaemon);
      }
      if (secondDaemon) {
        await closeStartedDaemon(secondDaemon);
      }
      if (previousSqlitePath === undefined) {
        delete process.env[DAEMON_SQLITE_PATH_ENV_VAR];
      } else {
        process.env[DAEMON_SQLITE_PATH_ENV_VAR] = previousSqlitePath;
      }
      if (previousProcessLock === undefined) {
        delete process.env[DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR];
      } else {
        process.env[DAEMON_SQLITE_PROCESS_LOCK_ENV_VAR] = previousProcessLock;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can opt into JSON event ledger persistence while keeping run metadata in memory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-events-"));
    const filePath = join(dir, "events.json");

    try {
      const firstEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_EVENT_STORE_PATH_ENV_VAR]: filePath
        }
      );
      const firstDaemon = createDaemonApp({
        eventStore: firstEventStore,
        idGenerator: createIds(),
        clock
      });
      const created = await createSession(firstDaemon);

      expect(firstDaemon.eventStore.listEvents(created.sessionId)).toHaveLength(1);

      const secondEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_EVENT_STORE_PATH_ENV_VAR]: filePath
        }
      );
      const secondDaemon = createDaemonApp({
        eventStore: secondEventStore,
        idGenerator: createIds(),
        clock
      });
      const eventsResponse = await secondDaemon.app.request(
        `/sessions/${created.sessionId}/events`
      );
      const eventsBody = (await eventsResponse.json()) as {
        events: Array<{ type: string; payload: unknown }>;
      };

      expect(eventsResponse.status).toBe(200);
      expect(eventsBody.events).toHaveLength(1);
      expect(eventsBody.events[0]).toMatchObject({
        type: created.event.type,
        payload: expect.any(Object)
      });
      expect(secondDaemon.runStore.listRuns()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can opt into SQLite run metadata and event ledger continuity together", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-sqlite-workspace-"));
    const sqlitePath = join(dir, "daemon.sqlite");

    try {
      const firstEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstRunStore = createStartDaemonRunStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstDaemon = createDaemonApp({
        eventStore: firstEventStore,
        runStore: firstRunStore,
        idGenerator: createIds(),
        clock
      });
      const created = await createRun(firstDaemon);

      expect(firstDaemon.runStore.listRuns()).toHaveLength(1);
      expect(firstDaemon.eventStore.listEvents(created.run.sessionId)).toHaveLength(1);

      (firstEventStore as SQLiteEventStore).close();
      (firstRunStore as SQLiteRunStore).close();

      const secondEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondRunStore = createStartDaemonRunStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondDaemon = createDaemonApp({
        eventStore: secondEventStore,
        runStore: secondRunStore,
        idGenerator: createIds(),
        clock
      });
      const runResponse = await secondDaemon.app.request(`/runs/${created.run.runId}`);
      const runBody = (await runResponse.json()) as {
        run: {
          runId: string;
          sessionId: string;
        };
      };
      const eventsResponse = await secondDaemon.app.request(
        `/runs/${created.run.runId}/events`
      );
      const eventsBody = (await eventsResponse.json()) as {
        runId: string;
        sessionId: string;
        events: Array<{ type: string }>;
      };

      expect(runResponse.status).toBe(200);
      expect(runBody.run).toMatchObject({
        runId: created.run.runId,
        sessionId: created.run.sessionId
      });
      expect(eventsResponse.status).toBe(200);
      expect(eventsBody).toMatchObject({
        runId: created.run.runId,
        sessionId: created.run.sessionId
      });
      expect(eventsBody.events).toEqual([
        expect.objectContaining({
          type: "topic_contract_published"
        })
      ]);

      (secondEventStore as SQLiteEventStore).close();
      (secondRunStore as SQLiteRunStore).close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can opt into SQLite resource access grant continuity across daemon restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-sqlite-resource-access-"));
    const sqlitePath = join(dir, "daemon.sqlite");
    const accessId = "Q".repeat(32);
    const resourceBroker = new InMemoryResourceBroker();
    const publicResource = resourceBroker.registerResource({
      resource: publicUrlResource("sqlite-restart-resource")
    });

    try {
      const firstEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstRunStore = createStartDaemonRunStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstResourceAccessStore = createStartDaemonResourceAccessStore(
        {
          clock,
          resourceAccessTokenGenerator: () => accessId,
          resourceAccessTtlMs: 120000
        },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstDaemon = createDaemonApp({
        eventStore: firstEventStore,
        runStore: firstRunStore,
        resourceAccessStore: firstResourceAccessStore,
        resourceBroker,
        resourceAccessBaseUrl: "https://access.example",
        idGenerator: createIds(),
        clock
      });
      const created = await createRun(firstDaemon, {
        ...orchestratedRunPlan(),
        resources: [
          {
            resourceId: publicResource.id,
            required: true,
            preferredDeliveryMode: "url"
          }
        ]
      });
      const deliveryResponse = await postJson(
        firstDaemon.app,
        `/sessions/${created.run.sessionId}/resources/${publicResource.id}/deliveries`,
        {
          participantId: "participant-1",
          policy: {
            requestedMode: "url",
            allowPublicUrl: true
          }
        }
      );
      const deliveryBody = (await deliveryResponse.json()) as {
        delivery: { delivery?: { url?: string } };
      };
      const accessUrl = deliveryBody.delivery.delivery?.url;

      expect(deliveryResponse.status).toBe(200);
      expect(accessUrl).toBe(`https://access.example/resource-access/${accessId}`);

      (firstEventStore as SQLiteEventStore).close();
      (firstRunStore as SQLiteRunStore).close();
      (firstResourceAccessStore as SQLiteResourceAccessGrantStore).close();

      const secondEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondRunStore = createStartDaemonRunStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondResourceAccessStore = createStartDaemonResourceAccessStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondDaemon = createDaemonApp({
        eventStore: secondEventStore,
        runStore: secondRunStore,
        resourceAccessStore: secondResourceAccessStore,
        idGenerator: createIds(),
        clock
      });
      const accessPath = new URL(accessUrl ?? "").pathname;
      const accessResponse = await secondDaemon.app.request(accessPath);

      expect(accessResponse.status).toBe(302);
      expect(accessResponse.headers.get("location")).toBe(
        "https://example.com/resource.txt"
      );

      const revokeResponse = await postJson(secondDaemon.app, `${accessPath}/revoke`, {});
      const revokeBody = (await revokeResponse.json()) as {
        grant: { revokedAt: string };
      };
      const projectionResponse = await secondDaemon.app.request(
        `/sessions/${created.run.sessionId}/resources`
      );
      const projectionText = await projectionResponse.text();
      const projectionBody = JSON.parse(projectionText) as {
        accessAudits: Array<{ action: string }>;
      };

      expect(revokeResponse.status).toBe(200);
      expect(revokeBody.grant).toMatchObject({
        revokedAt: "2026-06-10T00:00:00.000Z"
      });
      expect(projectionResponse.status).toBe(200);
      expect(projectionBody.accessAudits.map((audit) => audit.action)).toEqual([
        "created",
        "revoked"
      ]);
      expect(projectionText).not.toContain(accessId);
      expect(projectionText).not.toContain("https://example.com/resource.txt");

      (secondEventStore as SQLiteEventStore).close();
      (secondRunStore as SQLiteRunStore).close();
      (secondResourceAccessStore as SQLiteResourceAccessGrantStore).close();

      const thirdResourceAccessStore = createStartDaemonResourceAccessStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const thirdDaemon = createDaemonApp({
        resourceAccessStore: thirdResourceAccessStore,
        idGenerator: createIds(),
        clock
      });
      const revokedAccessResponse = await thirdDaemon.app.request(accessPath);
      const revokedAccessBody = (await revokedAccessResponse.json()) as {
        error: { code: string };
      };

      expect(revokedAccessResponse.status).toBe(400);
      expect(revokedAccessBody.error.code).toBe("resource_access_revoked");

      (thirdResourceAccessStore as SQLiteResourceAccessGrantStore).close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can opt into SQLite hosted content resource access across daemon restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-sqlite-hosted-content-"));
    const sqlitePath = join(dir, "daemon.sqlite");
    const accessId = "R".repeat(32);
    const contentBase64 = Buffer.from("hello world").toString("base64");
    const dataRef = "sqlite-hosted-content-ref";

    try {
      const firstEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstRunStore = createStartDaemonRunStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstResourceAccessStore = createStartDaemonResourceAccessStore(
        {
          clock,
          resourceAccessTokenGenerator: () => accessId,
          resourceAccessTtlMs: 120000
        },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const firstResourceBroker = createStartDaemonResourceStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const hostedResource = firstResourceBroker?.registerResource({
        resource: base64Resource("sqlite-hosted-restart-resource", dataRef),
        contents: [
          {
            dataRef,
            base64: contentBase64
          }
        ]
      });

      if (!hostedResource) {
        throw new Error("Expected SQLite resource broker to register hosted resource.");
      }

      const firstDaemon = createDaemonApp({
        eventStore: firstEventStore,
        runStore: firstRunStore,
        resourceAccessStore: firstResourceAccessStore,
        resourceBroker: firstResourceBroker,
        resourceAccessBaseUrl: "https://access.example",
        idGenerator: createIds(),
        clock
      });
      const created = await createRun(firstDaemon, {
        ...orchestratedRunPlan(),
        resources: [
          {
            resourceId: hostedResource.id,
            required: true,
            preferredDeliveryMode: "url"
          }
        ]
      });
      const deliveryResponse = await postJson(
        firstDaemon.app,
        `/sessions/${created.run.sessionId}/resources/${hostedResource.id}/deliveries`,
        {
          participantId: "participant-1",
          policy: {
            requestedMode: "url",
            allowLocalhostUrl: true,
            allowPublicUrl: true,
            allowHostedContentUrl: true,
            maxHostedContentSizeBytes: 64
          }
        }
      );
      const deliveryBody = (await deliveryResponse.json()) as {
        delivery: { delivery?: { url?: string } };
      };
      const accessUrl = deliveryBody.delivery.delivery?.url;

      expect(deliveryResponse.status).toBe(200);
      expect(accessUrl).toBe(`https://access.example/resource-access/${accessId}`);

      (firstEventStore as SQLiteEventStore).close();
      (firstRunStore as SQLiteRunStore).close();
      (firstResourceAccessStore as SQLiteResourceAccessGrantStore).close();
      (firstResourceBroker as SQLiteResourceBroker).close();

      const secondEventStore = createStartDaemonEventStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondRunStore = createStartDaemonRunStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondResourceAccessStore = createStartDaemonResourceAccessStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondResourceBroker = createStartDaemonResourceStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const secondDaemon = createDaemonApp({
        eventStore: secondEventStore,
        runStore: secondRunStore,
        resourceAccessStore: secondResourceAccessStore,
        resourceBroker: secondResourceBroker,
        idGenerator: createIds(),
        clock
      });
      const accessPath = new URL(accessUrl ?? "").pathname;
      const accessResponse = await secondDaemon.app.request(accessPath);

      expect(accessResponse.status).toBe(200);
      expect(await accessResponse.text()).toBe("hello world");

      const revokeResponse = await postJson(secondDaemon.app, `${accessPath}/revoke`, {});
      const projectionResponse = await secondDaemon.app.request(
        `/sessions/${created.run.sessionId}/resources`
      );
      const projectionText = await projectionResponse.text();
      const projectionBody = JSON.parse(projectionText) as {
        accessAudits: Array<{ action: string }>;
      };

      expect(revokeResponse.status).toBe(200);
      expect(projectionResponse.status).toBe(200);
      expect(projectionBody.accessAudits.map((audit) => audit.action)).toEqual([
        "created",
        "revoked"
      ]);
      expect(projectionText).not.toContain(accessId);
      expect(projectionText).not.toContain(contentBase64);
      expect(projectionText).not.toContain(dataRef);
      expect(projectionText).not.toContain("hello world");

      (secondEventStore as SQLiteEventStore).close();
      (secondRunStore as SQLiteRunStore).close();
      (secondResourceAccessStore as SQLiteResourceAccessGrantStore).close();
      (secondResourceBroker as SQLiteResourceBroker).close();

      const thirdResourceAccessStore = createStartDaemonResourceAccessStore(
        { clock },
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const thirdResourceBroker = createStartDaemonResourceStore(
        {},
        {
          [DAEMON_SQLITE_PATH_ENV_VAR]: sqlitePath
        }
      );
      const thirdDaemon = createDaemonApp({
        resourceAccessStore: thirdResourceAccessStore,
        resourceBroker: thirdResourceBroker,
        idGenerator: createIds(),
        clock
      });
      const revokedAccessResponse = await thirdDaemon.app.request(accessPath);
      const revokedAccessBody = (await revokedAccessResponse.json()) as {
        error: { code: string };
      };

      expect(revokedAccessResponse.status).toBe(400);
      expect(revokedAccessBody.error.code).toBe("resource_access_revoked");

      (thirdResourceAccessStore as SQLiteResourceAccessGrantStore).close();
      (thirdResourceBroker as SQLiteResourceBroker).close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can opt into JSON run metadata and event ledger continuity together", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deliberum-daemon-run-workspace-"));
    const eventStorePath = join(dir, "events.json");
    const runStorePath = join(dir, "runs.json");

    try {
      const firstDaemon = createDaemonApp({
        eventStore: createStartDaemonEventStore(
          { clock },
          {
            [DAEMON_EVENT_STORE_PATH_ENV_VAR]: eventStorePath
          }
        ),
        runStore: createStartDaemonRunStore(
          {},
          {
            [DAEMON_RUN_STORE_PATH_ENV_VAR]: runStorePath
          }
        ),
        idGenerator: createIds(),
        clock
      });
      const created = await createRun(firstDaemon);

      expect(firstDaemon.runStore.listRuns()).toHaveLength(1);
      expect(firstDaemon.eventStore.listEvents(created.run.sessionId)).toHaveLength(1);

      const secondDaemon = createDaemonApp({
        eventStore: createStartDaemonEventStore(
          { clock },
          {
            [DAEMON_EVENT_STORE_PATH_ENV_VAR]: eventStorePath
          }
        ),
        runStore: createStartDaemonRunStore(
          {},
          {
            [DAEMON_RUN_STORE_PATH_ENV_VAR]: runStorePath
          }
        ),
        idGenerator: createIds(),
        clock
      });
      const runResponse = await secondDaemon.app.request(`/runs/${created.run.runId}`);
      const runBody = (await runResponse.json()) as {
        run: {
          runId: string;
          sessionId: string;
        };
      };
      const eventsResponse = await secondDaemon.app.request(
        `/runs/${created.run.runId}/events`
      );
      const eventsBody = (await eventsResponse.json()) as {
        runId: string;
        sessionId: string;
        events: Array<{ type: string }>;
      };

      expect(runResponse.status).toBe(200);
      expect(runBody.run).toMatchObject({
        runId: created.run.runId,
        sessionId: created.run.sessionId
      });
      expect(eventsResponse.status).toBe(200);
      expect(eventsBody).toMatchObject({
        runId: created.run.runId,
        sessionId: created.run.sessionId
      });
      expect(eventsBody.events).toHaveLength(1);
      expect(eventsBody.events[0]).toMatchObject({
        type: "topic_contract_published"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("supports OpenAI-compatible streaming provider output from env configuration", async () => {
    const secret = "sk-openai-runtime-secret";
    const fetch = createOpenAICompatibleStreamingFetch(
      "provider-backed streamed sealed contribution"
    );
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableOpenAICompatibleProfile: true,
      openAICompatibleEnv: {
        [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: secret,
        [OPENAI_COMPATIBLE_BASE_URL_ENV_VAR]: "https://constructor.example/api",
        [OPENAI_COMPATIBLE_MODEL_ENV_VAR]: "constructor-model",
        [OPENAI_COMPATIBLE_STREAM_ENV_VAR]: "true"
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
      stream?: boolean;
    };
    const events = daemonApp.eventStore.listEvents(created.run.sessionId);
    const serializedSafeState = JSON.stringify({
      start: startBody,
      detail: detailBody,
      storedRun: daemonApp.runStore.getRun(created.run.runId),
      events
    });

    expect(startResponse.status).toBe(200);
    expect(url).toBe("https://runtime.example/api/chat/completions");
    expect(requestBody.stream).toBe(true);
    expect(JSON.stringify(events)).toContain("provider-backed streamed sealed contribution");
    expect(serializedSafeState).not.toContain(secret);
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
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
          [OPENAI_COMPATIBLE_STREAM_ENV_VAR]: "yes"
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

  it("keeps the HTTP-template provider profile disabled by default", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const created = await createRun(daemonApp, httpTemplateRunPlan());
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

  it("resolves the HTTP-template provider profile only from explicit option or exact env flag", () => {
    expect(resolveStartDaemonEnableHttpTemplateProfile(
      { enableHttpTemplateProfile: true },
      {}
    )).toBe(true);
    expect(
      resolveStartDaemonEnableHttpTemplateProfile(
        {},
        { [HTTP_TEMPLATE_PROFILE_ENV_VAR]: "true" }
      )
    ).toBe(true);
    expect(resolveStartDaemonEnableHttpTemplateProfile({}, {})).toBe(false);
    expect(
      resolveStartDaemonEnableHttpTemplateProfile(
        {},
        { [HTTP_TEMPLATE_PROFILE_ENV_VAR]: "false" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableHttpTemplateProfile(
        {},
        { [HTTP_TEMPLATE_PROFILE_ENV_VAR]: "TRUE" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableHttpTemplateProfile(
        {},
        { [HTTP_TEMPLATE_PROFILE_ENV_VAR]: "random" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableHttpTemplateProfile(
        { enableHttpTemplateProfile: false },
        { [HTTP_TEMPLATE_PROFILE_ENV_VAR]: "true" }
      )
    ).toBe(false);
  });

  it("installs only an HTTP-template participant adapter through the profile", () => {
    const registries = daemon.createHttpTemplateRunRegistries({
      env: {
        [HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR]: "{\"Authorization\":\"Bearer {{runtime.apiKey}}\"}"
      }
    });

    expect(registries.adapterRegistry?.list()).toEqual([
      expect.objectContaining({
        adapterId: HTTP_TEMPLATE_ADAPTER_ID
      })
    ]);
    expect(registries).not.toHaveProperty("extractionGeneratorRegistry");
    expect(registries).not.toHaveProperty("proposalReviewGeneratorRegistry");
    expect(registries).not.toHaveProperty("finalCandidateGeneratorRegistry");
    expect(registries).not.toHaveProperty("finalAuditGeneratorRegistry");
  });

  it("resolves the MCP tool profile only from explicit option or exact env flag", () => {
    expect(resolveStartDaemonEnableMcpToolProfile(
      { enableMcpToolProfile: true },
      {}
    )).toBe(true);
    expect(
      resolveStartDaemonEnableMcpToolProfile(
        {},
        { [MCP_TOOL_PROFILE_ENV_VAR]: "true" }
      )
    ).toBe(true);
    expect(resolveStartDaemonEnableMcpToolProfile({}, {})).toBe(false);
    expect(
      resolveStartDaemonEnableMcpToolProfile(
        {},
        { [MCP_TOOL_PROFILE_ENV_VAR]: "false" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableMcpToolProfile(
        {},
        { [MCP_TOOL_PROFILE_ENV_VAR]: "TRUE" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableMcpToolProfile(
        {},
        { [MCP_TOOL_PROFILE_ENV_VAR]: "random" }
      )
    ).toBe(false);
    expect(
      resolveStartDaemonEnableMcpToolProfile(
        { enableMcpToolProfile: false },
        { [MCP_TOOL_PROFILE_ENV_VAR]: "true" }
      )
    ).toBe(false);
  });

  it("installs only an MCP tool participant adapter when required profile config is present", () => {
    expect(daemon.createMcpToolRunRegistries({ env: {} })).toBeUndefined();

    const registries = daemon.createMcpToolRunRegistries({
      env: {
        [MCP_TOOL_URL_ENV_VAR]: "http://127.0.0.1:8787/mcp",
        [MCP_TOOL_NAME_ENV_VAR]: "deliberum.reflect"
      }
    });

    expect(registries?.adapterRegistry?.list()).toEqual([
      expect.objectContaining({
        adapterId: MCP_TOOL_ADAPTER_ID
      })
    ]);
    expect(registries).not.toHaveProperty("extractionGeneratorRegistry");
    expect(registries).not.toHaveProperty("proposalReviewGeneratorRegistry");
    expect(registries).not.toHaveProperty("finalCandidateGeneratorRegistry");
    expect(registries).not.toHaveProperty("finalAuditGeneratorRegistry");
  });

  it("rejects remote MCP tool endpoints unless remote HTTPS access is explicit", () => {
    expect(() =>
      daemon.createMcpToolRunRegistries({
        env: {
          [MCP_TOOL_URL_ENV_VAR]: "https://mcp.example/rpc",
          [MCP_TOOL_NAME_ENV_VAR]: "deliberum.reflect"
        }
      })
    ).toThrow(McpToolAdapterError);
    expect(() =>
      daemon.createMcpToolRunRegistries({
        env: {
          [MCP_TOOL_URL_ENV_VAR]: "http://mcp.example/rpc",
          [MCP_TOOL_NAME_ENV_VAR]: "deliberum.reflect",
          [MCP_TOOL_ALLOW_REMOTE_ENV_VAR]: "true"
        }
      })
    ).toThrow(McpToolAdapterError);
    expect(() =>
      daemon.createMcpToolRunRegistries({
        env: {
          [MCP_TOOL_URL_ENV_VAR]: "https://mcp.example/rpc",
          [MCP_TOOL_NAME_ENV_VAR]: "deliberum.reflect",
          [MCP_TOOL_ALLOW_REMOTE_ENV_VAR]: "true"
        }
      })
    ).not.toThrow();
  });

  it("rejects invalid MCP tool execution policy env values before fetch", () => {
    const fetch = createMcpToolFetch();
    let thrown: unknown;

    try {
      createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableMcpToolProfile: true,
        mcpToolEnv: {
          [MCP_TOOL_URL_ENV_VAR]: "http://127.0.0.1:8787/mcp",
          [MCP_TOOL_NAME_ENV_VAR]: "deliberum.reflect",
          [MCP_TOOL_ALLOWED_ARGUMENT_KEYS_ENV_VAR]: "instructions,unsafe key"
        },
        mcpToolFetch: fetch
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(McpToolAdapterError);
    expect((thrown as McpToolAdapterError).safeCategory).toBe(
      "provider_config_invalid"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("runs HTTP-template sealed divergence through daemon with mocked fetch", async () => {
    const secret = "http-template-runtime-secret";
    const fetch = createHttpTemplateFetch({
      model: "provider-http-model",
      output: {
        contribution: "HTTP-template provider sealed contribution",
        echoedSecret: `Bearer ${secret}`
      }
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableHttpTemplateProfile: true,
      httpTemplateEnv: {
        [HTTP_TEMPLATE_API_KEY_ENV_VAR]: secret,
        [HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR]:
          "{\"Authorization\":\"Bearer {{runtime.apiKey}}\",\"X-Participant\":\"{{context.participantId}}\",\"X-Mode\":\"{{var.mode}}\"}",
        [HTTP_TEMPLATE_BODY_ENV_VAR]:
          "{\"model\":\"{{runtime.modelId}}\",\"mode\":\"{{var.mode}}\",\"payload\":{{input.payloadJson}}}",
        [HTTP_TEMPLATE_RESPONSE_FORMAT_ENV_VAR]: "json",
        [HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH_ENV_VAR]: "output",
        [HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH_ENV_VAR]: "model"
      },
      httpTemplateFetch: fetch
    });
    const created = await createRun(daemonApp, httpTemplateRunPlan());
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
        result: { participantResults?: Array<{ status: string; modelId?: string }> };
      }>;
    };
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const listBody = await (await daemonApp.app.request("/runs")).json();
    const [url, init] = getHttpTemplateFetchCall(fetch);
    const requestBody = JSON.parse(init.body ?? "{}") as {
      model: string;
      mode: string;
      payload: {
        runId: string;
        sessionId: string;
        participant: { id: string };
        topic: string;
        metadata: { eventIds: string[] };
      };
    };
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
    expect(url).toBe("https://runtime.example/api/contribute");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      "X-Participant": "provider-alpha",
      "X-Mode": "sealed-divergence"
    });
    expect(requestBody).toMatchObject({
      model: "runtime-http-model",
      mode: "sealed-divergence",
      payload: {
        runId: created.run.runId,
        sessionId: created.run.sessionId,
        participant: {
          id: "provider-alpha"
        },
        topic: "Should Stage 22B expose opt-in HTTP-template provider-backed sealed participants?"
      }
    });
    expect(requestBody.payload.metadata.eventIds).toEqual(
      events.slice(0, 2).map((event) => event.id)
    );
    expect(detailBody).toMatchObject({
      run: {
        plan: {
          providerConfigs: [
            expect.objectContaining({
              adapterId: HTTP_TEMPLATE_ADAPTER_ID,
              httpTemplate: {
                variables: {
                  mode: "sealed-divergence"
                }
              },
              hasApiKeyEnvVar: true
            })
          ]
        }
      }
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

  it("runs MCP tool sealed divergence through daemon with mocked JSON-RPC fetch", async () => {
    const secret = "mcp-tool-runtime-secret";
    const toolName = "deliberum.reflect";
    const fetch = createMcpToolFetch({
      toolName,
      content:
        `MCP tool sealed contribution with Bearer ${secret} from /Users/wangqinghua/private.txt`,
      structuredContent: {
        summary: "MCP tool result",
        echoedSecret: `api_key=${secret}`,
        localPath: "/Users/wangqinghua/private.txt"
      }
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableMcpToolProfile: true,
      mcpToolEnv: {
        [MCP_TOOL_AUTH_TOKEN_ENV_VAR]: secret,
        [MCP_TOOL_URL_ENV_VAR]: "http://127.0.0.1:8787/mcp",
        [MCP_TOOL_NAME_ENV_VAR]: toolName,
        [MCP_TOOL_TIMEOUT_MS_ENV_VAR]: "5000"
      },
      mcpToolFetch: fetch
    });
    const created = await createRun(daemonApp, mcpToolRunPlan());
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
        result: { participantResults?: Array<{ status: string }> };
      }>;
    };
    const detailBody = await (await daemonApp.app.request(`/runs/${created.run.runId}`)).json();
    const listBody = await (await daemonApp.app.request("/runs")).json();
    const fetchCalls = fetch.mock.calls as Array<[string, McpToolFetchInit]>;
    const listRequest = JSON.parse(fetchCalls[0]?.[1].body ?? "{}") as {
      method: string;
    };
    const callRequest = JSON.parse(fetchCalls[1]?.[1].body ?? "{}") as {
      method: string;
      params: {
        name: string;
        arguments: {
          context: {
            participantId: string;
          };
        };
      };
    };
    const events = daemonApp.eventStore.listEvents(created.run.sessionId);
    const contributionPayload = events[2]?.payload;
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
    expect(startBody.stages).toEqual([
      expect.objectContaining({
        stage: "sealed_divergence",
        executionStatus: "executed",
        result: expect.objectContaining({
          participantResults: [
            expect.objectContaining({
              status: "submitted"
            })
          ]
        })
      })
    ]);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]?.[0]).toBe("http://127.0.0.1:8787/mcp");
    expect(fetchCalls[0]?.[1].headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${secret}`
    });
    expect(listRequest).toMatchObject({
      method: "tools/list"
    });
    expect(callRequest).toMatchObject({
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          context: {
            participantId: "mcp-tool-alpha"
          }
        }
      }
    });
    expect(contributionPayload).toMatchObject({
      kind: "mcp_tool_result",
      toolName,
      isError: false,
      content: [
        {
          type: "text",
          text:
            "MCP tool sealed contribution with [redacted] from [redacted-path]"
        }
      ],
      structuredContent: {
        summary: "MCP tool result",
        echoedSecret: "api_key=[redacted]",
        localPath: "[redacted-path]"
      }
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
  });

  it("applies MCP tool execution policy to daemon JSON-RPC tool calls", async () => {
    const toolName = "deliberum.reflect";
    const fetch = createMcpToolFetch({
      toolName
    });
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableMcpToolProfile: true,
      mcpToolEnv: {
        [MCP_TOOL_URL_ENV_VAR]: "http://127.0.0.1:8787/mcp",
        [MCP_TOOL_NAME_ENV_VAR]: toolName,
        [MCP_TOOL_MAX_ARGUMENT_BYTES_ENV_VAR]: "8192",
        [MCP_TOOL_ALLOWED_ARGUMENT_KEYS_ENV_VAR]: "instructions,payload",
        [MCP_TOOL_INCLUDE_CONTEXT_ENV_VAR]: "false"
      },
      mcpToolFetch: fetch
    });
    const created = await createRun(daemonApp, mcpToolRunPlan());
    const response = await postJson(daemonApp.app, `/runs/${created.run.runId}/start`, {
      sealedDivergence: {
        autoCloseManual: true
      }
    });
    const fetchCalls = fetch.mock.calls as Array<[string, McpToolFetchInit]>;
    const callRequest = JSON.parse(fetchCalls[1]?.[1].body ?? "{}") as {
      method: string;
      params: {
        name: string;
        arguments: Record<string, unknown>;
      };
    };

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(2);
    expect(callRequest).toMatchObject({
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          instructions: expect.any(String),
          payload: expect.any(Object)
        }
      }
    });
    expect(Object.keys(callRequest.params.arguments).sort()).toEqual([
      "instructions",
      "payload"
    ]);
    expect(callRequest.params.arguments).not.toHaveProperty("context");
  });

  it("rejects invalid HTTP-template profile env values before fetch", () => {
    const fetch = createHttpTemplateFetch();
    let thrown: unknown;

    try {
      createDaemonApp({
        idGenerator: createIds(),
        clock,
        enableHttpTemplateProfile: true,
        httpTemplateEnv: {
          [HTTP_TEMPLATE_API_KEY_ENV_VAR]: "http-template-runtime-secret",
          [HTTP_TEMPLATE_TIMEOUT_MS_ENV_VAR]: "not-a-positive-integer"
        },
        httpTemplateFetch: fetch
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpTemplateAdapterError);
    expect((thrown as HttpTemplateAdapterError).safeCategory).toBe(
      "provider_config_invalid"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns safe provider_secret_missing when HTTP-template env key is absent", async () => {
    const fetch = createHttpTemplateFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableHttpTemplateProfile: true,
      httpTemplateEnv: {
        [HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR]:
          "{\"Authorization\":\"Bearer {{runtime.apiKey}}\"}",
        [HTTP_TEMPLATE_BODY_ENV_VAR]:
          "{\"model\":\"{{runtime.modelId}}\",\"payload\":{{input.payloadJson}}}"
      },
      httpTemplateFetch: fetch
    });
    const created = await createRun(daemonApp, httpTemplateRunPlan());
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

  it("does not override explicitly injected adapter registries with the HTTP-template profile", async () => {
    const fetch = createHttpTemplateFetch();
    const daemonApp = createDaemonApp({
      idGenerator: createIds(),
      clock,
      enableHttpTemplateProfile: true,
      httpTemplateEnv: {
        [HTTP_TEMPLATE_API_KEY_ENV_VAR]: "http-template-runtime-secret"
      },
      httpTemplateFetch: fetch,
      runAdapterRegistry: new AdapterRegistry()
    });
    const created = await createRun(daemonApp, httpTemplateRunPlan());
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

  it("opens deadline batches through the daemon core route", async () => {
    const daemonApp = createDaemonApp({ idGenerator: createIds(), clock });
    const { sessionId } = await createSession(daemonApp);
    const response = await postJson(daemonApp.app, `/sessions/${sessionId}/batches`, {
      purpose: "initial_divergence",
      revealPolicy: "deadline",
      deadlineAt: "2026-06-10T00:10:00.000Z"
    });
    const body = (await response.json()) as {
      batchId: string;
      event: { type: string; payload: Record<string, unknown> };
    };

    expect(response.status).toBe(201);
    expect(body.batchId).toBeTruthy();
    expect(body.event.type).toBe("sealed_batch_opened");
    expect(body.event.payload).toMatchObject({
      revealPolicy: "deadline",
      deadlineAt: "2026-06-10T00:10:00.000Z"
    });
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
      webgetTokenGenerator: createTokenGenerator(),
      resourceAccessTokenGenerator: createTokenGenerator([
        "W".repeat(32),
        "X".repeat(32)
      ])
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
    const hostedContent = await createWebGETBatch(daemonApp, {
      resourceIds: [b64Resource.id],
      resourcePolicy: {
        requestedMode: "url",
        allowLocalhostUrl: true,
        allowHostedContentUrl: true,
        maxHostedContentSizeBytes: 64
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

    const allowedUrlResponse = await daemonApp.app.request(
      webgetPath(allowedUrl.webget.startUrl, `/resources/${publicResource.id}`)
    );
    const allowedUrlText = await allowedUrlResponse.text();
    const allowedUrlBody = JSON.parse(allowedUrlText) as {
      delivery: {
        selectedMode: string;
        allowed: boolean;
        delivery?: { url?: string; exposure?: string; expiresAt?: string };
      };
    };

    expectNoStore(allowedUrlResponse);
    expect(allowedUrlBody.delivery).toMatchObject({
      selectedMode: "url",
      allowed: true,
      delivery: {
        url: `http://127.0.0.1:3877/resource-access/${"W".repeat(32)}`,
        exposure: "localhost",
        expiresAt: "2026-06-10T00:05:00.000Z"
      }
    });
    expect(allowedUrlText).not.toContain("https://example.com/resource.txt");

    const accessUrl = allowedUrlBody.delivery.delivery?.url;
    if (!accessUrl) {
      throw new Error("Expected WebGET resource access URL.");
    }
    const accessResponse = await daemonApp.app.request(new URL(accessUrl).pathname);

    expect(accessResponse.status).toBe(302);
    expect(accessResponse.headers.get("location")).toBe(
      "https://example.com/resource.txt"
    );

    const resourceContextText = await (
      await daemonApp.app.request(webgetPath(allowedUrl.webget.startUrl, "/context/resources"))
    ).text();

    expect(resourceContextText).toContain("URL delivery uses a revocable daemon resource access grant.");
    expect(resourceContextText).not.toContain("https://example.com/resource.txt");
    expect(resourceContextText).not.toContain("resource-access");
    expect(resourceContextText).not.toContain("W".repeat(32));

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

    const hostedContentResponse = await daemonApp.app.request(
      webgetPath(hostedContent.webget.startUrl, `/resources/${b64Resource.id}`)
    );
    const hostedContentText = await hostedContentResponse.text();
    const hostedContentBody = JSON.parse(hostedContentText) as {
      delivery: {
        selectedMode: string;
        allowed: boolean;
        delivery?: { url?: string; exposure?: string };
      };
    };

    expectNoStore(hostedContentResponse);
    expect(hostedContentBody.delivery).toMatchObject({
      selectedMode: "url",
      allowed: true,
      delivery: {
        url: `http://127.0.0.1:3877/resource-access/${"X".repeat(32)}`,
        exposure: "localhost"
      }
    });
    expect(hostedContentText).not.toContain(Buffer.from("hello world").toString("base64"));
    expect(hostedContentText).not.toContain("base64-ref");

    const hostedAccessUrl = hostedContentBody.delivery.delivery?.url;
    if (!hostedAccessUrl) {
      throw new Error("Expected hosted WebGET resource access URL.");
    }
    const hostedAccessResponse = await daemonApp.app.request(
      new URL(hostedAccessUrl).pathname
    );

    expect(hostedAccessResponse.status).toBe(200);
    expect(await hostedAccessResponse.text()).toBe("hello world");

    const hostedResourceContextText = await (
      await daemonApp.app.request(
        webgetPath(hostedContent.webget.startUrl, "/context/resources")
      )
    ).text();

    expect(hostedResourceContextText).toContain(
      "Hosted content URL delivery serves resource content through a revocable daemon grant."
    );
    expect(hostedResourceContextText).not.toContain(Buffer.from("hello world").toString("base64"));
    expect(hostedResourceContextText).not.toContain("base64-ref");
    expect(hostedResourceContextText).not.toContain("resource-access");
    expect(hostedResourceContextText).not.toContain("X".repeat(32));

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
    const allowedMcpToolProfileExports = new Set([
      "MCP_TOOL_ADAPTER_ID",
      "MCP_TOOL_ALLOWED_ARGUMENT_KEYS_ENV_VAR",
      "MCP_TOOL_ALLOW_REMOTE_ENV_VAR",
      "MCP_TOOL_AUTH_TOKEN_ENV_VAR",
      "MCP_TOOL_INCLUDE_CONTEXT_ENV_VAR",
      "MCP_TOOL_MAX_ARGUMENT_BYTES_ENV_VAR",
      "MCP_TOOL_NAME_ENV_VAR",
      "MCP_TOOL_PROFILE_ENV_VAR",
      "MCP_TOOL_TIMEOUT_MS_ENV_VAR",
      "MCP_TOOL_URL_ENV_VAR",
      "MCP_TOOL_VERIFY_LIST_ENV_VAR"
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
        if (
          forbiddenTerm === "MCP" &&
          allowedMcpToolProfileExports.has(exportedName)
        ) {
          continue;
        }

        expect(exportedName).not.toContain(forbiddenTerm);
      }
    }
  });
});
