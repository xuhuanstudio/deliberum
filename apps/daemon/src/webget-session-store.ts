import { createHash, randomBytes } from "node:crypto";
import type { ResourceDeliveryPolicy, ResourceDeliveryPlan } from "@deliberum/resources";

export const WEBGET_DEFAULT_TTL_MS = 10 * 60 * 1000;
export const WEBGET_MAX_CHUNK_BYTES = 16 * 1024;
export const WEBGET_MAX_TOTAL_BYTES = 256 * 1024;
export const WEBGET_MAX_CHUNK_COUNT = 64;

export type WebGETClock = () => number;
export type WebGETTokenGenerator = () => string;

export type WebGETSessionInput = {
  sessionId: string;
  batchId: string;
  participantId: string;
  instructions?: string;
  resourceIds?: readonly string[];
  resourcePolicy?: ResourceDeliveryPolicy;
  ttlMs?: number;
};

export type WebGETSession = {
  token: string;
  sessionId: string;
  batchId: string;
  participantId: string;
  instructions?: string;
  resourceIds: string[];
  resourcePolicy?: ResourceDeliveryPolicy;
  createdAt: number;
  expiresAt: number;
  committed: boolean;
  resourceAccessReports: ResourceDeliveryPlan[];
};

export type WebGETSessionPublicView = Omit<WebGETSession, "token"> & {
  startPath: string;
  startUrl: string;
};

export type WebGETContextCompleteness = {
  status: "complete" | "partial" | "unknown";
  notes: string[];
};

export type WebGETReadReport = {
  contextPagesRead: string[];
  resourcesViewed: string[];
  resourcesSummaryOnly: string[];
  submissionMode: "chunked_get" | "manual_paste" | "browser_automation";
  contextCompleteness: WebGETContextCompleteness;
};

export type WebGETCommittedSubmission = {
  output: unknown;
  readReport: WebGETReadReport;
  contextCompleteness: WebGETContextCompleteness;
  resourceAccessReports?: ResourceDeliveryPlan[];
};

export type WebGETSessionStoreOptions = {
  clock?: WebGETClock;
  tokenGenerator?: WebGETTokenGenerator;
  baseUrl?: string;
};

export class WebGETSessionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WebGETSessionError";
    this.code = code;
  }
}

type StoredChunk = {
  seq: number;
  total: number;
  data: string;
  decoded: Uint8Array;
};

type StoredSession = WebGETSession & {
  chunks: Map<number, StoredChunk>;
};

export class WebGETSessionStore {
  private readonly sessionsByToken = new Map<string, StoredSession>();
  private readonly clock: WebGETClock;
  private readonly tokenGenerator: WebGETTokenGenerator;
  private readonly baseUrl: string;

  constructor(options: WebGETSessionStoreOptions = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.tokenGenerator = options.tokenGenerator ?? createDefaultToken;
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:3877").replace(/\/$/, "");
  }

  createSession(input: WebGETSessionInput): WebGETSessionPublicView {
    const ttlMs = input.ttlMs ?? WEBGET_DEFAULT_TTL_MS;

    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new WebGETSessionError("invalid_ttl", "WebGET ttlMs must be a positive integer.");
    }

    let token = this.tokenGenerator();
    while (this.sessionsByToken.has(token)) {
      token = this.tokenGenerator();
    }

    if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
      throw new WebGETSessionError("invalid_token", "WebGET token generator returned an invalid token.");
    }

    const now = this.clock();
    const session: StoredSession = {
      token,
      sessionId: input.sessionId,
      batchId: input.batchId,
      participantId: input.participantId,
      instructions: input.instructions,
      resourceIds: [...(input.resourceIds ?? [])],
      resourcePolicy: input.resourcePolicy,
      createdAt: now,
      expiresAt: now + ttlMs,
      committed: false,
      resourceAccessReports: [],
      chunks: new Map()
    };

    this.sessionsByToken.set(token, session);

    return this.toPublicView(session);
  }

  getSession(token: string): WebGETSessionPublicView {
    return this.toPublicView(this.getActiveSession(token));
  }

  recordResourceAccess(token: string, plan: ResourceDeliveryPlan): void {
    const session = this.getActiveSession(token);
    const existingIndex = session.resourceAccessReports.findIndex(
      (report) => report.resourceId === plan.resourceId
    );

    if (existingIndex >= 0) {
      session.resourceAccessReports[existingIndex] = structuredClone(plan);
      return;
    }

    session.resourceAccessReports.push(structuredClone(plan));
  }

  submitChunk(
    token: string,
    input: {
      seq: string | undefined;
      total: string | undefined;
      encoding: string | undefined;
      data: string | undefined;
    }
  ): { accepted: true; seq: number; total: number } {
    const session = this.getActiveSession(token);

    if (session.committed) {
      throw new WebGETSessionError("already_committed", "WebGET submission has already been committed.");
    }

    if (input.encoding !== "base64url") {
      throw new WebGETSessionError("invalid_encoding", "WebGET submission encoding must be base64url.");
    }

    const seq = parsePositiveInteger(input.seq, "seq");
    const total = parsePositiveInteger(input.total, "total");

    if (seq > total) {
      throw new WebGETSessionError("invalid_sequence", "WebGET seq must be less than or equal to total.");
    }

    if (total > WEBGET_MAX_CHUNK_COUNT) {
      throw new WebGETSessionError("too_many_chunks", "WebGET submission exceeds the maximum chunk count.");
    }

    if (!input.data || !/^[A-Za-z0-9_-]*$/.test(input.data)) {
      throw new WebGETSessionError("invalid_data", "WebGET data must be base64url encoded.");
    }

    if (containsSecretLikeText(input.data)) {
      throw new WebGETSessionError("unsafe_query", "WebGET query data contains private material.");
    }

    const decoded = decodeBase64Url(input.data);

    if (decoded.byteLength > WEBGET_MAX_CHUNK_BYTES) {
      throw new WebGETSessionError("chunk_too_large", "WebGET chunk exceeds the maximum decoded size.");
    }
    assertSafeSubmissionBytes(decoded);

    const existing = session.chunks.get(seq);
    if (existing) {
      if (existing.data !== input.data || existing.total !== total) {
        throw new WebGETSessionError(
          "duplicate_chunk",
          "WebGET duplicate chunk sequence has different data."
        );
      }

      return {
        accepted: true,
        seq,
        total
      };
    }

    if (session.chunks.size > 0) {
      const existingTotal = [...session.chunks.values()][0]?.total;
      if (existingTotal !== total) {
        throw new WebGETSessionError("invalid_total", "WebGET chunk total must be consistent.");
      }
    }

    const nextTotalBytes =
      [...session.chunks.values()].reduce((sum, chunk) => sum + chunk.decoded.byteLength, 0) +
      decoded.byteLength;
    if (nextTotalBytes > WEBGET_MAX_TOTAL_BYTES) {
      throw new WebGETSessionError("submission_too_large", "WebGET submission exceeds the maximum decoded size.");
    }

    session.chunks.set(seq, {
      seq,
      total,
      data: input.data,
      decoded
    });

    return {
      accepted: true,
      seq,
      total
    };
  }

  commitSubmission(
    token: string,
    input: {
      total: string | undefined;
      sha256: string | undefined;
      length: string | undefined;
    }
  ): {
    session: WebGETSessionPublicView;
    submission: WebGETCommittedSubmission;
    decodedLength: number;
    sha256: string;
  } {
    const session = this.getActiveSession(token);

    if (session.committed) {
      throw new WebGETSessionError("already_committed", "WebGET submission has already been committed.");
    }

    const total = parsePositiveInteger(input.total, "total");
    const expectedLength = parseNonnegativeInteger(input.length, "length");

    if (!input.sha256 || !/^[a-f0-9]{64}$/i.test(input.sha256)) {
      throw new WebGETSessionError("invalid_hash", "WebGET commit requires a hex sha256 hash.");
    }

    if (total > WEBGET_MAX_CHUNK_COUNT) {
      throw new WebGETSessionError("too_many_chunks", "WebGET submission exceeds the maximum chunk count.");
    }

    if (session.chunks.size !== total) {
      throw new WebGETSessionError("missing_chunks", "WebGET commit requires all chunks.");
    }

    const chunks: StoredChunk[] = [];
    for (let seq = 1; seq <= total; seq += 1) {
      const chunk = session.chunks.get(seq);
      if (!chunk || chunk.total !== total) {
        throw new WebGETSessionError("missing_chunks", "WebGET commit requires contiguous chunks.");
      }
      chunks.push(chunk);
    }

    const decoded = concatBytes(chunks.map((chunk) => chunk.decoded));
    if (decoded.byteLength > WEBGET_MAX_TOTAL_BYTES) {
      throw new WebGETSessionError("submission_too_large", "WebGET submission exceeds the maximum decoded size.");
    }

    if (decoded.byteLength !== expectedLength) {
      throw new WebGETSessionError("invalid_length", "WebGET commit length does not match decoded bytes.");
    }

    const actualHash = createHash("sha256").update(decoded).digest("hex");
    if (actualHash.toLowerCase() !== input.sha256.toLowerCase()) {
      throw new WebGETSessionError("invalid_hash", "WebGET commit hash does not match decoded bytes.");
    }

    const decodedText = new TextDecoder().decode(decoded);
    assertSafeSubmissionText(decodedText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(decodedText);
    } catch {
      throw new WebGETSessionError("invalid_json", "WebGET committed payload must be valid JSON.");
    }
    assertSafeParsedSubmission(parsed);

    let submission: WebGETCommittedSubmission;
    try {
      submission = parseCommittedSubmission(parsed);
    } catch {
      throw new WebGETSessionError(
        "invalid_submission",
        "WebGET committed payload must include output, readReport, and contextCompleteness."
      );
    }

    return {
      session: this.toPublicView(session),
      submission,
      decodedLength: decoded.byteLength,
      sha256: actualHash
    };
  }

  finalizeCommittedSession(token: string): void {
    const session = this.sessionsByToken.get(token);
    if (session) {
      session.committed = true;
    }
  }

  markCommitted(token: string): WebGETSessionPublicView {
    const session = this.getActiveSession(token);

    if (session.committed) {
      throw new WebGETSessionError("already_committed", "WebGET submission has already been committed.");
    }

    session.committed = true;

    return this.toPublicView(session);
  }

  private getActiveSession(token: string): StoredSession {
    const session = this.sessionsByToken.get(token);

    if (!session) {
      throw new WebGETSessionError("invalid_token", "WebGET token is invalid or expired.");
    }

    if (session.expiresAt <= this.clock()) {
      this.sessionsByToken.delete(token);
      throw new WebGETSessionError("expired_token", "WebGET token is expired.");
    }

    return session;
  }

  private toPublicView(session: StoredSession): WebGETSessionPublicView {
    const startPath = `/webget/${encodeURIComponent(session.token)}/start`;

    return {
      sessionId: session.sessionId,
      batchId: session.batchId,
      participantId: session.participantId,
      instructions: session.instructions,
      resourceIds: [...session.resourceIds],
      resourcePolicy: session.resourcePolicy,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      committed: session.committed,
      resourceAccessReports: structuredClone(session.resourceAccessReports),
      startPath,
      startUrl: `${this.baseUrl}${startPath}`
    };
  }
}

function createDefaultToken(): string {
  return randomBytes(32).toString("base64url");
}

function parsePositiveInteger(value: string | undefined, name: string): number {
  const parsed = parseInteger(value, name);
  if (parsed < 1) {
    throw new WebGETSessionError(`invalid_${name}`, `WebGET ${name} must be a positive integer.`);
  }

  return parsed;
}

function parseNonnegativeInteger(value: string | undefined, name: string): number {
  const parsed = parseInteger(value, name);
  if (parsed < 0) {
    throw new WebGETSessionError(`invalid_${name}`, `WebGET ${name} must be nonnegative.`);
  }

  return parsed;
}

function parseInteger(value: string | undefined, name: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new WebGETSessionError(`invalid_${name}`, `WebGET ${name} must be an integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new WebGETSessionError(`invalid_${name}`, `WebGET ${name} must be a safe integer.`);
  }

  return parsed;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  try {
    const decoded = Buffer.from(padded, "base64");
    const recoded = decoded.toString("base64url");
    if (recoded !== value.replace(/=+$/, "")) {
      throw new Error("base64url mismatch");
    }

    return decoded;
  } catch {
    throw new WebGETSessionError("invalid_data", "WebGET data must be base64url encoded.");
  }
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function containsSecretLikeText(value: string): boolean {
  return /api[_-]?key|secret|private[_-]?token|authorization|bearer\s+|sk-[a-z0-9]|file:\/\/|\/Users\/|\/home\/[^/\s]+|\.ssh|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value);
}

function assertSafeSubmissionBytes(decoded: Uint8Array): void {
  assertSafeSubmissionText(new TextDecoder().decode(decoded));
}

function assertSafeSubmissionText(value: string): void {
  if (containsSecretLikeText(value)) {
    throw new WebGETSessionError(
      "unsafe_submission",
      "WebGET submission contains private material."
    );
  }
}

function assertSafeParsedSubmission(input: unknown): void {
  const serialized = JSON.stringify(input);
  if (serialized !== undefined) {
    assertSafeSubmissionText(serialized);
  }
}

function parseCommittedSubmission(input: unknown): WebGETCommittedSubmission {
  const record = parsePlainRecord(input);
  assertAllowedKeys(record, [
    "output",
    "readReport",
    "contextCompleteness",
    "resourceAccessReports"
  ]);

  if (!Object.hasOwn(record, "output") || !isJsonValue(record.output)) {
    throw new Error("invalid output");
  }

  const submission: WebGETCommittedSubmission = {
    output: structuredClone(record.output),
    readReport: parseReadReport(record.readReport),
    contextCompleteness: parseContextCompleteness(record.contextCompleteness)
  };

  if (record.resourceAccessReports !== undefined) {
    submission.resourceAccessReports = parseResourceAccessReports(record.resourceAccessReports);
  }

  return submission;
}

function parseReadReport(input: unknown): WebGETReadReport {
  const record = parsePlainRecord(input);
  assertAllowedKeys(record, [
    "contextPagesRead",
    "resourcesViewed",
    "resourcesSummaryOnly",
    "submissionMode",
    "contextCompleteness"
  ]);

  if (
    record.submissionMode !== "chunked_get" &&
    record.submissionMode !== "manual_paste" &&
    record.submissionMode !== "browser_automation"
  ) {
    throw new Error("invalid submission mode");
  }

  return {
    contextPagesRead: parseStringArray(record.contextPagesRead),
    resourcesViewed: parseStringArray(record.resourcesViewed),
    resourcesSummaryOnly: parseStringArray(record.resourcesSummaryOnly),
    submissionMode: record.submissionMode,
    contextCompleteness: parseContextCompleteness(record.contextCompleteness)
  };
}

function parseContextCompleteness(input: unknown): WebGETContextCompleteness {
  const record = parsePlainRecord(input);
  assertAllowedKeys(record, ["status", "notes"]);

  if (record.status !== "complete" && record.status !== "partial" && record.status !== "unknown") {
    throw new Error("invalid context completeness status");
  }

  return {
    status: record.status,
    notes: parseStringArray(record.notes)
  };
}

function parseResourceAccessReports(input: unknown): ResourceDeliveryPlan[] {
  if (!Array.isArray(input)) {
    throw new Error("invalid resource access reports");
  }

  return input.map((item) => {
    const record = parsePlainRecord(item);
    assertAllowedKeys(record, [
      "resourceId",
      "participantId",
      "selectedMode",
      "allowed",
      "reason",
      "warnings"
    ]);

    if (
      record.selectedMode !== "url" &&
      record.selectedMode !== "base64" &&
      record.selectedMode !== "none"
    ) {
      throw new Error("invalid selected mode");
    }

    if (typeof record.allowed !== "boolean") {
      throw new Error("invalid allowed flag");
    }

    return {
      resourceId: parseNonEmptyString(record.resourceId),
      participantId: parseNonEmptyString(record.participantId),
      selectedMode: record.selectedMode,
      allowed: record.allowed,
      reason: parseNonEmptyString(record.reason),
      warnings: parseStringArray(record.warnings)
    };
  });
}

function parsePlainRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("expected object");
  }

  return input as Record<string, unknown>;
}

function assertAllowedKeys(record: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error("unexpected key");
    }
  }
}

function parseStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new Error("expected string array");
  }

  return input.map(parseNonEmptyString);
}

function parseNonEmptyString(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("expected non-empty string");
  }

  return input;
}

function isJsonValue(input: unknown): boolean {
  if (input === null || typeof input === "string" || typeof input === "boolean") {
    return true;
  }

  if (typeof input === "number") {
    return Number.isFinite(input);
  }

  if (Array.isArray(input)) {
    return input.every(isJsonValue);
  }

  if (typeof input === "object") {
    return Object.values(input as Record<string, unknown>).every(isJsonValue);
  }

  return false;
}
