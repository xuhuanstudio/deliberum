import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import type { Clock, IdGenerator } from "@deliberum/core";

export const OPERATION_AUDIT_LOG_SCHEMA_VERSION = 1 as const;
export const DEFAULT_OPERATION_AUDIT_LIMIT = 100 as const;
export const MAX_OPERATION_AUDIT_LIMIT = 1000 as const;

export const OPERATION_AUDIT_OUTCOMES = [
  "succeeded",
  "rejected",
  "failed"
] as const;
export type OperationAuditOutcome = (typeof OPERATION_AUDIT_OUTCOMES)[number];

export const OPERATION_AUDIT_AUTHORIZATION_MODES = [
  "none",
  "daemon_bearer",
  "daemon_stream_query",
  "resource_access_token",
  "webget_token"
] as const;
export type OperationAuditAuthorizationMode =
  (typeof OPERATION_AUDIT_AUTHORIZATION_MODES)[number];

export type OperationAuditAuthorization = {
  mode: OperationAuditAuthorizationMode;
  present: boolean;
};

export type OperationAuditTarget = {
  runId?: string;
  sessionId?: string;
  batchId?: string;
  proposalEventId?: string;
  resourceId?: string;
};

export type OperationAuditEntry = {
  id: string;
  recordedAt: string;
  action: string;
  method: string;
  route: string;
  statusCode: number;
  outcome: OperationAuditOutcome;
  authorization: OperationAuditAuthorization;
  target: OperationAuditTarget;
};

export type OperationAuditRecordInput = Omit<OperationAuditEntry, "id" | "recordedAt"> & {
  id?: string;
  recordedAt?: string;
};

export type OperationAuditListOptions = {
  limit?: number;
};

export interface OperationAuditLog {
  record(input: OperationAuditRecordInput): OperationAuditEntry;
  list(options?: OperationAuditListOptions): OperationAuditEntry[];
}

export class OperationAuditLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationAuditLogError";
  }
}

export type InMemoryOperationAuditLogOptions = {
  idGenerator?: IdGenerator;
  clock?: Clock;
  maxEntries?: number;
};

export class InMemoryOperationAuditLog implements OperationAuditLog {
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly maxEntries?: number;
  private readonly entries: OperationAuditEntry[] = [];

  constructor(options: InMemoryOperationAuditLogOptions = {}) {
    this.idGenerator = options.idGenerator ?? createDefaultAuditIdGenerator();
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.maxEntries = options.maxEntries;
  }

  record(input: OperationAuditRecordInput): OperationAuditEntry {
    const entry = parseOperationAuditRecordInput(input, {
      idGenerator: this.idGenerator,
      clock: this.clock
    });

    this.entries.push(entry);

    if (this.maxEntries !== undefined && this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    return cloneEntry(entry);
  }

  list(options: OperationAuditListOptions = {}): OperationAuditEntry[] {
    return applyAuditLimit(this.entries, options.limit).map(cloneEntry);
  }
}

export type JsonFileOperationAuditLogFileSystem = {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  writeFileSync: typeof writeFileSync;
};

export type JsonFileOperationAuditLogOptions = {
  filePath: string;
  idGenerator?: IdGenerator;
  clock?: Clock;
  fileSystem?: Partial<JsonFileOperationAuditLogFileSystem>;
  tempFileName?: () => string;
};

type PersistedOperationAuditLog = {
  schemaVersion: typeof OPERATION_AUDIT_LOG_SCHEMA_VERSION;
  events: OperationAuditEntry[];
};

const defaultFileSystem: JsonFileOperationAuditLogFileSystem = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
};

export class JsonFileOperationAuditLog implements OperationAuditLog {
  private readonly filePath: string;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly fileSystem: JsonFileOperationAuditLogFileSystem;
  private readonly tempFileName: () => string;
  private readonly entries: OperationAuditEntry[] = [];

  constructor(options: JsonFileOperationAuditLogOptions) {
    this.filePath = options.filePath;
    this.idGenerator = options.idGenerator ?? createDefaultAuditIdGenerator();
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.fileSystem = {
      ...defaultFileSystem,
      ...options.fileSystem
    };
    this.tempFileName =
      options.tempFileName ??
      (() => `${this.filePath}.${process.pid}.${Date.now()}.tmp`);

    this.load();
  }

  record(input: OperationAuditRecordInput): OperationAuditEntry {
    const entry = parseOperationAuditRecordInput(input, {
      idGenerator: this.idGenerator,
      clock: this.clock
    });

    if (this.entries.some((candidate) => candidate.id === entry.id)) {
      throw new OperationAuditLogError(`Duplicate operation audit id: ${entry.id}`);
    }

    this.entries.push(entry);
    this.persist();

    return cloneEntry(entry);
  }

  list(options: OperationAuditListOptions = {}): OperationAuditEntry[] {
    return applyAuditLimit(this.entries, options.limit).map(cloneEntry);
  }

  private load(): void {
    if (!this.fileSystem.existsSync(this.filePath)) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.fileSystem.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new OperationAuditLogError(
        `Unable to read JSON operation audit log: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const store = parsePersistedOperationAuditLog(parsed);
    const ids = new Set<string>();
    for (const entry of store.events) {
      if (ids.has(entry.id)) {
        throw new OperationAuditLogError(`Duplicate operation audit id: ${entry.id}`);
      }

      ids.add(entry.id);
      this.entries.push(cloneEntry(entry));
    }
  }

  private persist(): void {
    const directory = dirname(this.filePath);
    this.fileSystem.mkdirSync(directory, { recursive: true });

    const tmpPath = this.tempFileName();
    const store: PersistedOperationAuditLog = {
      schemaVersion: OPERATION_AUDIT_LOG_SCHEMA_VERSION,
      events: [...this.entries].sort(compareAuditEntries).map(cloneEntry)
    };

    this.fileSystem.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    this.fileSystem.renameSync(tmpPath, this.filePath);
  }
}

export function parseOperationAuditLimit(value: string | undefined): number {
  const trimmed = value?.trim();

  if (!trimmed) {
    return DEFAULT_OPERATION_AUDIT_LIMIT;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new OperationAuditLogError("Operation audit limit must be a positive integer.");
  }

  return normalizeOperationAuditLimit(Number(trimmed));
}

export function normalizeOperationAuditLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_OPERATION_AUDIT_LIMIT;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new OperationAuditLogError("Operation audit limit must be a positive integer.");
  }

  return Math.min(value, MAX_OPERATION_AUDIT_LIMIT);
}

export function createOperationAuditRecord(input: {
  method: string;
  path: string;
  statusCode: number;
  authorization: OperationAuditAuthorization;
}): OperationAuditRecordInput | undefined {
  const method = input.method.toUpperCase();

  if (method === "OPTIONS" || input.path === "/health") {
    return undefined;
  }

  const route = normalizeOperationAuditRoute(input.path);
  return {
    action: classifyOperationAuditAction(method, route),
    method,
    route,
    statusCode: input.statusCode,
    outcome: classifyOutcome(input.statusCode),
    authorization: input.authorization,
    target: extractOperationAuditTarget(route, input.path)
  };
}

export function createOperationAuditAuthorization(input: {
  method: string;
  path: string;
  authorizationHeader?: string;
  daemonAuthTokenQuery?: string;
}): OperationAuditAuthorization {
  if (input.path.startsWith("/resource-access/")) {
    return {
      mode: "resource_access_token",
      present: true
    };
  }

  if (input.path.startsWith("/webget/")) {
    return {
      mode: "webget_token",
      present: true
    };
  }

  if (
    input.method.toUpperCase() === "GET" &&
    input.daemonAuthTokenQuery &&
    isEventStreamPath(input.path)
  ) {
    return {
      mode: "daemon_stream_query",
      present: true
    };
  }

  return {
    mode: "daemon_bearer",
    present: /^Bearer\s+\S+$/i.test(input.authorizationHeader ?? "")
  };
}

export function parseOperationAuditRecordInput(
  input: OperationAuditRecordInput,
  defaults: {
    idGenerator: IdGenerator;
    clock: Clock;
  }
): OperationAuditEntry {
  return parseOperationAuditEntry({
    ...input,
    id: input.id ?? defaults.idGenerator(),
    recordedAt: input.recordedAt ?? defaults.clock()
  });
}

function parsePersistedOperationAuditLog(input: unknown): PersistedOperationAuditLog {
  if (typeof input !== "object" || input === null) {
    throw new OperationAuditLogError("JSON operation audit log must be an object.");
  }

  const store = input as { schemaVersion?: unknown; events?: unknown };

  if (store.schemaVersion !== OPERATION_AUDIT_LOG_SCHEMA_VERSION) {
    throw new OperationAuditLogError(
      `Unsupported JSON operation audit log schemaVersion: ${String(store.schemaVersion)}`
    );
  }

  if (!Array.isArray(store.events)) {
    throw new OperationAuditLogError("JSON operation audit log events must be an array.");
  }

  return {
    schemaVersion: OPERATION_AUDIT_LOG_SCHEMA_VERSION,
    events: store.events.map(parseOperationAuditEntry)
  };
}

export function parseOperationAuditEntry(value: unknown): OperationAuditEntry {
  const entry = requireObject(value, "Operation audit entry");
  rejectUnknownKeys(
    entry,
    [
      "id",
      "recordedAt",
      "action",
      "method",
      "route",
      "statusCode",
      "outcome",
      "authorization",
      "target"
    ],
    "Operation audit entry"
  );

  return {
    id: requireNonEmptyString(entry.id, "Operation audit id"),
    recordedAt: requireNonEmptyString(entry.recordedAt, "Operation audit timestamp"),
    action: requireNonEmptyString(entry.action, "Operation audit action"),
    method: requireNonEmptyString(entry.method, "Operation audit method"),
    route: requireNonEmptyString(entry.route, "Operation audit route"),
    statusCode: requireStatusCode(entry.statusCode),
    outcome: requireEnum(
      entry.outcome,
      OPERATION_AUDIT_OUTCOMES,
      "Operation audit outcome"
    ),
    authorization: parseOperationAuditAuthorization(entry.authorization),
    target: parseOperationAuditTarget(entry.target)
  };
}

function applyAuditLimit(
  entries: readonly OperationAuditEntry[],
  limit: number | undefined
): OperationAuditEntry[] {
  const normalizedLimit = normalizeOperationAuditLimit(limit);
  const sorted = [...entries].sort(compareAuditEntries);

  return sorted.slice(Math.max(0, sorted.length - normalizedLimit));
}

function normalizeOperationAuditRoute(path: string): string {
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  if (segments[0] === "runtime" && segments[1] === "operation-audit") {
    return "/runtime/operation-audit";
  }

  if (segments[0] === "runtime" && segments[1] === "profiles") {
    return "/runtime/profiles";
  }

  if (segments[0] === "runs") {
    return normalizeRunsRoute(segments);
  }

  if (segments[0] === "sessions") {
    return normalizeSessionsRoute(segments);
  }

  if (segments[0] === "resource-access") {
    return segments[2] === "revoke"
      ? "/resource-access/:accessId/revoke"
      : "/resource-access/:accessId";
  }

  if (segments[0] === "webget") {
    return normalizeWebGETRoute(segments);
  }

  return `/${segments.map((segment) => redactBearerLikeSegment(segment)).join("/")}`;
}

function normalizeRunsRoute(segments: string[]): string {
  if (segments.length === 1) {
    return "/runs";
  }

  if (segments[2] === "events" && segments[3] === "stream") {
    return "/runs/:runId/events/stream";
  }

  if (segments[2] === "events") {
    return "/runs/:runId/events";
  }

  if (segments[2] === "outcome") {
    return "/runs/:runId/outcome";
  }

  if (segments[2] === "process-proposals" && segments[4] === "execute") {
    return "/runs/:runId/process-proposals/:proposalEventId/execute";
  }

  if (segments[2] === "process-proposals") {
    return "/runs/:runId/process-proposals";
  }

  if (segments[2] === "resources") {
    return "/runs/:runId/resources";
  }

  if (segments[2] === "final-propose") {
    return "/runs/:runId/final-propose";
  }

  if (segments[2] === "final-audit") {
    return "/runs/:runId/final-audit";
  }

  if (segments[2] === "start") {
    return "/runs/:runId/start";
  }

  return "/runs/:runId";
}

function normalizeSessionsRoute(segments: string[]): string {
  if (segments.length === 1) {
    return "/sessions";
  }

  if (segments[2] === "events" && segments[3] === "stream") {
    return "/sessions/:sessionId/events/stream";
  }

  if (segments[2] === "events") {
    return "/sessions/:sessionId/events";
  }

  if (segments[2] === "frontier") {
    return "/sessions/:sessionId/frontier";
  }

  if (segments[2] === "objections") {
    return "/sessions/:sessionId/objections";
  }

  if (segments[2] === "obligations") {
    return "/sessions/:sessionId/obligations";
  }

  if (segments[2] === "process-proposals" && segments[4] === "challenges") {
    return "/sessions/:sessionId/process-proposals/:proposalEventId/challenges";
  }

  if (segments[2] === "process-proposals" && segments[4] === "decisions") {
    return "/sessions/:sessionId/process-proposals/:proposalEventId/decisions";
  }

  if (segments[2] === "process-proposals") {
    return "/sessions/:sessionId/process-proposals";
  }

  if (segments[2] === "final-candidates" && segments[4] === "audits") {
    return "/sessions/:sessionId/final-candidates/:proposalEventId/audits";
  }

  if (segments[2] === "final-candidates") {
    return "/sessions/:sessionId/final-candidates";
  }

  if (segments[2] === "final") {
    return "/sessions/:sessionId/final";
  }

  if (segments[2] === "resources" && segments[4] === "deliveries") {
    return "/sessions/:sessionId/resources/:resourceId/deliveries";
  }

  if (segments[2] === "resources") {
    return "/sessions/:sessionId/resources";
  }

  if (segments[2] === "batches" && segments[4] === "contributions") {
    return "/sessions/:sessionId/batches/:batchId/contributions";
  }

  if (segments[2] === "batches" && segments[4] === "close") {
    return "/sessions/:sessionId/batches/:batchId/close";
  }

  if (segments[2] === "batches") {
    return "/sessions/:sessionId/batches";
  }

  if (segments[2] === "extractions") {
    return "/sessions/:sessionId/extractions";
  }

  if (segments[2] === "proposals" && segments[4] === "challenges") {
    return "/sessions/:sessionId/proposals/:proposalEventId/challenges";
  }

  if (segments[2] === "proposals" && segments[4] === "acceptance") {
    return "/sessions/:sessionId/proposals/:proposalEventId/acceptance";
  }

  return "/sessions/:sessionId";
}

function normalizeWebGETRoute(segments: string[]): string {
  if (segments[2] === "context" && segments[3]) {
    return "/webget/:token/context/:page";
  }

  if (segments[2] === "resources" && segments[3]) {
    return "/webget/:token/resources/:resourceId";
  }

  if (segments[2] === "start") {
    return "/webget/:token/start";
  }

  if (segments[2] === "context") {
    return "/webget/:token/context";
  }

  if (segments[2] === "submit") {
    return "/webget/:token/submit";
  }

  if (segments[2] === "commit") {
    return "/webget/:token/commit";
  }

  return "/webget/:token";
}

function extractOperationAuditTarget(route: string, path: string): OperationAuditTarget {
  const routeSegments = route.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);
  const target: OperationAuditTarget = {};

  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const pathSegment = pathSegments[index];

    if (!routeSegment || !pathSegment || !routeSegment.startsWith(":")) {
      continue;
    }

    if (routeSegment === ":runId") {
      target.runId = pathSegment;
    } else if (routeSegment === ":sessionId") {
      target.sessionId = pathSegment;
    } else if (routeSegment === ":batchId") {
      target.batchId = pathSegment;
    } else if (routeSegment === ":proposalEventId") {
      target.proposalEventId = pathSegment;
    } else if (routeSegment === ":resourceId") {
      target.resourceId = pathSegment;
    }
  }

  return target;
}

function classifyOperationAuditAction(method: string, route: string): string {
  if (method === "GET" && route === "/runtime/profiles") {
    return "runtime_profiles_read";
  }
  if (method === "GET" && route === "/runtime/operation-audit") {
    return "operation_audit_read";
  }
  if (method === "POST" && route === "/runs") {
    return "run_create";
  }
  if (method === "GET" && route === "/runs") {
    return "runs_list";
  }
  if (method === "GET" && route === "/runs/:runId") {
    return "run_read";
  }
  if (method === "POST" && route === "/runs/:runId/start") {
    return "run_start";
  }
  if (method === "GET" && route === "/runs/:runId/events") {
    return "run_events_read";
  }
  if (method === "GET" && route === "/runs/:runId/events/stream") {
    return "run_events_stream";
  }
  if (method === "GET" && route === "/runs/:runId/outcome") {
    return "run_outcome_read";
  }
  if (method === "GET" && route === "/runs/:runId/process-proposals") {
    return "run_process_proposals_read";
  }
  if (method === "POST" && route === "/runs/:runId/process-proposals/:proposalEventId/execute") {
    return "run_process_proposal_execute";
  }
  if (method === "POST" && route === "/sessions") {
    return "session_create";
  }
  if (method === "GET" && route === "/sessions") {
    return "sessions_list";
  }
  if (method === "GET" && route === "/sessions/:sessionId/events") {
    return "session_events_read";
  }
  if (method === "GET" && route === "/sessions/:sessionId/events/stream") {
    return "session_events_stream";
  }
  if (method === "POST" && route === "/sessions/:sessionId/batches") {
    return "batch_open";
  }
  if (method === "POST" && route === "/sessions/:sessionId/batches/:batchId/contributions") {
    return "contribution_submit";
  }
  if (method === "POST" && route === "/sessions/:sessionId/batches/:batchId/close") {
    return "batch_close";
  }
  if (method === "POST" && route === "/sessions/:sessionId/extractions") {
    return "extraction_propose";
  }
  if (method === "POST" && route === "/sessions/:sessionId/proposals/:proposalEventId/challenges") {
    return "proposal_challenge";
  }
  if (method === "POST" && route === "/sessions/:sessionId/proposals/:proposalEventId/acceptance") {
    return "proposal_accept";
  }
  if (method === "POST" && route === "/sessions/:sessionId/process-proposals") {
    return "process_proposal_create";
  }
  if (method === "POST" && route === "/sessions/:sessionId/process-proposals/:proposalEventId/challenges") {
    return "process_proposal_challenge";
  }
  if (method === "POST" && route === "/sessions/:sessionId/process-proposals/:proposalEventId/decisions") {
    return "process_proposal_decide";
  }
  if (method === "GET" && route === "/sessions/:sessionId/final") {
    return "session_final_read";
  }
  if (method === "POST" && route === "/sessions/:sessionId/final-candidates") {
    return "final_candidate_propose";
  }
  if (method === "POST" && route === "/sessions/:sessionId/final-candidates/:proposalEventId/audits") {
    return "final_candidate_audit";
  }
  if (method === "GET" && route === "/sessions/:sessionId/resources") {
    return "session_resources_read";
  }
  if (method === "POST" && route === "/sessions/:sessionId/resources/:resourceId/deliveries") {
    return "resource_delivery_plan";
  }
  if (method === "GET" && route === "/resource-access/:accessId") {
    return "resource_access_get";
  }
  if (method === "POST" && route === "/resource-access/:accessId/revoke") {
    return "resource_access_revoke";
  }
  if (route.startsWith("/webget/:token")) {
    return `webget_${route.split("/").at(-1) ?? "request"}`;
  }

  return "http_request";
}

function classifyOutcome(statusCode: number): OperationAuditOutcome {
  if (statusCode >= 200 && statusCode < 400) {
    return "succeeded";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "rejected";
  }

  return "failed";
}

function isEventStreamPath(path: string): boolean {
  return (
    /^\/runs\/[^/]+\/events\/stream$/.test(path) ||
    /^\/sessions\/[^/]+\/events\/stream$/.test(path)
  );
}

function redactBearerLikeSegment(segment: string): string {
  if (segment.length >= 16 || /^[A-Za-z0-9_-]{12,}$/.test(segment)) {
    return ":redacted";
  }

  return segment;
}

function compareAuditEntries(left: OperationAuditEntry, right: OperationAuditEntry): number {
  return left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id);
}

function parseOperationAuditAuthorization(value: unknown): OperationAuditAuthorization {
  const authorization = requireObject(value, "Operation audit authorization");
  rejectUnknownKeys(
    authorization,
    ["mode", "present"],
    "Operation audit authorization"
  );

  return {
    mode: requireEnum(
      authorization.mode,
      OPERATION_AUDIT_AUTHORIZATION_MODES,
      "Operation audit authorization mode"
    ),
    present: requireBoolean(
      authorization.present,
      "Operation audit authorization present flag"
    )
  };
}

function parseOperationAuditTarget(value: unknown): OperationAuditTarget {
  const target = requireObject(value, "Operation audit target");
  const allowedKeys = [
    "runId",
    "sessionId",
    "batchId",
    "proposalEventId",
    "resourceId"
  ] as const;
  rejectUnknownKeys(target, allowedKeys, "Operation audit target");

  const parsed: OperationAuditTarget = {};
  for (const key of allowedKeys) {
    if (target[key] !== undefined) {
      parsed[key] = requireNonEmptyString(target[key], `Operation audit target ${key}`);
    }
  }

  return parsed;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OperationAuditLogError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new OperationAuditLogError(`${label} contains unsupported field: ${key}`);
    }
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new OperationAuditLogError(`${label} must be a non-empty string.`);
  }

  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new OperationAuditLogError(`${label} must be a boolean.`);
  }

  return value;
}

function requireStatusCode(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 100 ||
    value > 599
  ) {
    throw new OperationAuditLogError(
      "Operation audit statusCode must be an integer HTTP status code."
    );
  }

  return value;
}

function requireEnum<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
  label: string
): TValue {
  if (typeof value !== "string" || !allowedValues.includes(value as TValue)) {
    throw new OperationAuditLogError(`${label} is not supported.`);
  }

  return value as TValue;
}

function createDefaultAuditIdGenerator(): IdGenerator {
  let index = 0;

  return () => {
    index += 1;
    return `operation-audit-${index}`;
  };
}

function cloneEntry(entry: OperationAuditEntry): OperationAuditEntry {
  return structuredClone(entry);
}
