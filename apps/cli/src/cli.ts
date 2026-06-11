import {
  DEFAULT_DAEMON_BASE_URL,
  DaemonClientError,
  DeliberumDaemonClient
} from "@deliberum/client";
import {
  acceptProposal,
  challengeProposal,
  closeSealedBatch,
  createSession,
  openSealedBatch,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectQualityObligations,
  proposeExtraction,
  submitSealedContribution
} from "@deliberum/core";
import type { JsonValue, SealedBatchPurpose, SealedBatchRevealPolicy } from "@deliberum/protocol";
import type { EventStore } from "@deliberum/storage";
import { randomUUID } from "node:crypto";
import { JsonFileEventStore, defaultStorePath } from "./json-file-event-store";
import { parseJsonArgument, readJsonFile } from "./read-json";
import { buildTopicContract } from "./topic-contract";

export const CLI_COMMANDS = [
  "new",
  "batch open",
  "contribution add",
  "batch close",
  "extraction propose",
  "proposal challenge",
  "proposal accept",
  "frontier",
  "objections",
  "obligations",
  "events",
  "runs create",
  "runs list",
  "runs show",
  "runs events",
  "runs start",
  "runs outcome"
] as const;

export type CliCoreApi = {
  createSession: typeof createSession;
  openSealedBatch: typeof openSealedBatch;
  submitSealedContribution: typeof submitSealedContribution;
  closeSealedBatch: typeof closeSealedBatch;
  proposeExtraction: typeof proposeExtraction;
  challengeProposal: typeof challengeProposal;
  acceptProposal: typeof acceptProposal;
  projectAcceptedDeliberationObjects: typeof projectAcceptedDeliberationObjects;
  projectCandidateFrontier: typeof projectCandidateFrontier;
  projectQualityObligations: typeof projectQualityObligations;
};

export type CliDependencies = {
  core?: Partial<CliCoreApi>;
  createEventStore?: (options: { filePath: string; clock?: () => string }) => EventStore;
  createDaemonClient?: (options: { baseUrl: string }) => CliRunDaemonClient;
  runEventStreamFetch?: CliRunEventStreamFetch;
  writeStdout?: (chunk: string) => void | Promise<void>;
  idGenerator?: () => string;
  clock?: () => string;
  env?: Record<string, string | undefined>;
  readJsonFile?: (filePath: string) => unknown;
};

export type CliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  output?: unknown;
};

type ParsedArgs = {
  positionals: string[];
  options: Map<string, string[]>;
  flags: Set<string>;
};

type ExtractionInputFile = {
  candidates?: readonly unknown[];
  claims?: readonly unknown[];
  objections?: readonly unknown[];
  evidenceNeeds?: readonly unknown[];
  qualityObligations?: readonly unknown[];
};

export type CliRunDaemonClient = Pick<
  DeliberumDaemonClient,
  | "createRun"
  | "listRuns"
  | "getRun"
  | "getRunEvents"
  | "getRunEventsStreamUrl"
  | "startRun"
  | "getRunOutcome"
>;

type CliRunEventStreamReader = {
  read: () => Promise<{
    done?: boolean;
    value?: Uint8Array;
  }>;
  releaseLock: () => void;
};

type CliRunEventStreamReadable = {
  getReader: () => CliRunEventStreamReader;
};

type CliRunEventStreamBody = CliRunEventStreamReadable | AsyncIterable<Uint8Array>;

export type CliRunEventStreamFetchResponse = {
  ok: boolean;
  status: number;
  body: CliRunEventStreamBody | null;
};

export type CliRunEventStreamFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
) => Promise<CliRunEventStreamFetchResponse>;

type RawCliOutput = {
  kind: "raw";
  output?: unknown;
};

const defaultCoreApi: CliCoreApi = {
  createSession,
  openSealedBatch,
  submitSealedContribution,
  closeSealedBatch,
  proposeExtraction,
  challengeProposal,
  acceptProposal,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectQualityObligations
};

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<CliRunResult> {
  const parsedArgs = parseArgs(args);
  const compactOutput = parsedArgs.flags.has("json");
  const stdoutChunks: string[] = [];
  const writeStdout =
    dependencies.writeStdout ??
    ((chunk: string) => {
      stdoutChunks.push(chunk);
    });
  const coreApi = {
    ...defaultCoreApi,
    ...dependencies.core
  };

  try {
    const output = await executeCommand(parsedArgs, {
      core: coreApi,
      createEventStore:
        dependencies.createEventStore ??
        ((options) =>
          new JsonFileEventStore({
            filePath: options.filePath,
            clock: options.clock
          })),
      createDaemonClient:
        dependencies.createDaemonClient ??
        ((options) =>
          new DeliberumDaemonClient({
            baseUrl: options.baseUrl
          })),
      runEventStreamFetch:
        dependencies.runEventStreamFetch ??
        ((url, init) => getDefaultRunEventStreamFetch()(url, init)),
      writeStdout,
      idGenerator: dependencies.idGenerator ?? (() => randomUUID()),
      clock: dependencies.clock,
      env: dependencies.env ?? process.env,
      readJsonFile: dependencies.readJsonFile ?? readJsonFile
    });

    if (isRawCliOutput(output)) {
      return {
        exitCode: 0,
        stdout: dependencies.writeStdout ? "" : stdoutChunks.join(""),
        stderr: "",
        output: output.output
      };
    }

    return {
      exitCode: 0,
      stdout: `${JSON.stringify(output, null, compactOutput ? 0 : 2)}\n`,
      stderr: "",
      output
    };
  } catch (error) {
    const output = createErrorOutput(error);

    return {
      exitCode: 1,
      stdout: `${JSON.stringify(output, null, compactOutput ? 0 : 2)}\n`,
      stderr: "",
      output
    };
  }
}

type ExecuteDependencies = {
  core: CliCoreApi;
  createEventStore: (options: { filePath: string; clock?: () => string }) => EventStore;
  createDaemonClient: (options: { baseUrl: string }) => CliRunDaemonClient;
  runEventStreamFetch: CliRunEventStreamFetch;
  writeStdout: (chunk: string) => void | Promise<void>;
  idGenerator: () => string;
  clock?: () => string;
  env: Record<string, string | undefined>;
  readJsonFile: (filePath: string) => unknown;
};

async function executeCommand(parsedArgs: ParsedArgs, dependencies: ExecuteDependencies): Promise<unknown> {
  const [command, subcommand, ...restPositionals] = parsedArgs.positionals;

  if (command === "runs") {
    return executeRunCommand(subcommand, restPositionals, parsedArgs, dependencies);
  }

  const store = dependencies.createEventStore({
    filePath: getStorePath(parsedArgs, dependencies.env),
    clock: dependencies.clock
  });
  const idGenerator = dependencies.idGenerator;
  const coreOptions = {
    eventStore: store,
    idGenerator,
    clock: dependencies.clock
  };

  if (command === "new") {
    const topic = [subcommand, ...restPositionals].filter(Boolean).join(" ");
    if (!topic) {
      throw new CliUsageError("Usage: deliberum new <topic>");
    }

    const topicContract = buildTopicContract({
      id: idGenerator(),
      topic,
      title: getLastOption(parsedArgs, "title"),
      goals: getManyOptions(parsedArgs, "goal"),
      constraints: getManyOptions(parsedArgs, "constraint"),
      outputExpectations: getManyOptions(parsedArgs, "expectation"),
      participantIds: getManyOptions(parsedArgs, "participant"),
      allowedAdapters: getManyOptions(parsedArgs, "adapter")
    });
    const result = dependencies.core.createSession({ topicContract }, coreOptions);

    return {
      sessionId: result.sessionId,
      event: result.initialEvent
    };
  }

  if (command === "batch" && subcommand === "open") {
    const result = dependencies.core.openSealedBatch(
      {
        sessionId: requireOption(parsedArgs, "session"),
        purpose: requireOption(parsedArgs, "purpose") as SealedBatchPurpose,
        participantIds: getManyOptions(parsedArgs, "participant"),
        revealPolicy: getLastOption(parsedArgs, "reveal-policy") as
          | SealedBatchRevealPolicy
          | undefined
      },
      coreOptions
    );

    return {
      batchId: result.batchId,
      event: result.openedEvent
    };
  }

  if (command === "contribution" && subcommand === "add") {
    const result = dependencies.core.submitSealedContribution(
      {
        sessionId: requireOption(parsedArgs, "session"),
        batchId: requireOption(parsedArgs, "batch"),
        authorId: requireOption(parsedArgs, "author"),
        visibility: "sealed",
        payload: parseJsonArgument(requireOption(parsedArgs, "payload-json"), "payload-json") as JsonValue
      },
      coreOptions
    );

    return {
      event: result.contributionEvent
    };
  }

  if (command === "batch" && subcommand === "close") {
    const result = dependencies.core.closeSealedBatch(
      {
        sessionId: requireOption(parsedArgs, "session"),
        batchId: requireOption(parsedArgs, "batch")
      },
      coreOptions
    );

    return {
      event: result.revealedEvent
    };
  }

  if (command === "extraction" && subcommand === "propose") {
    const input = parseExtractionInput(dependencies.readJsonFile(requireOption(parsedArgs, "input")));
    const result = dependencies.core.proposeExtraction(
      {
        sessionId: requireOption(parsedArgs, "session"),
        authorId: requireOption(parsedArgs, "author"),
        rationale: requireOption(parsedArgs, "rationale"),
        candidates: input.candidates,
        claims: input.claims,
        objections: input.objections,
        evidenceNeeds: input.evidenceNeeds,
        qualityObligations: input.qualityObligations
      },
      coreOptions
    );

    return {
      proposalId: result.proposalId,
      event: result.proposalEvent
    };
  }

  if (command === "proposal" && subcommand === "challenge") {
    const result = dependencies.core.challengeProposal(
      {
        sessionId: requireOption(parsedArgs, "session"),
        targetProposalEventId: requireOption(parsedArgs, "proposal-event"),
        authorId: requireOption(parsedArgs, "author"),
        reason: requireOption(parsedArgs, "reason")
      },
      coreOptions
    );

    return {
      event: result.challengeEvent
    };
  }

  if (command === "proposal" && subcommand === "accept") {
    const result = dependencies.core.acceptProposal(
      {
        sessionId: requireOption(parsedArgs, "session"),
        targetProposalEventId: requireOption(parsedArgs, "proposal-event"),
        authorId: requireOption(parsedArgs, "author"),
        rationale: requireOption(parsedArgs, "rationale")
      },
      coreOptions
    );

    return {
      event: result.acceptanceEvent
    };
  }

  if (command === "frontier") {
    return dependencies.core.projectCandidateFrontier({
      eventStore: store,
      sessionId: requireOption(parsedArgs, "session")
    });
  }

  if (command === "objections") {
    const projection = dependencies.core.projectAcceptedDeliberationObjects({
      eventStore: store,
      sessionId: requireOption(parsedArgs, "session")
    });

    return {
      objections: projection.objections,
      projection: projection.projection
    };
  }

  if (command === "obligations") {
    return dependencies.core.projectQualityObligations({
      eventStore: store,
      sessionId: requireOption(parsedArgs, "session")
    });
  }

  if (command === "events") {
    return {
      events: store.listEvents(requireOption(parsedArgs, "session"))
    };
  }

  throw new CliUsageError(`Unknown command: ${parsedArgs.positionals.join(" ") || "(empty)"}`);
}

export async function main(args: string[]): Promise<number> {
  const result = await runCli(args, {
    writeStdout: (chunk) => {
      process.stdout.write(chunk);
    }
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  return result.exitCode;
}

export class CliUsageError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "CliUsageError";
  }
}

async function executeRunCommand(
  subcommand: string | undefined,
  restPositionals: string[],
  parsedArgs: ParsedArgs,
  dependencies: ExecuteDependencies
): Promise<unknown> {
  const action = subcommand ?? "";
  assertKnownRunCommand(action);
  assertRunCommandOptions(action, parsedArgs);

  const daemonClient = dependencies.createDaemonClient({
    baseUrl: resolveDaemonUrl(parsedArgs, dependencies.env)
  });

  if (action === "create") {
    requireNoPositionals(restPositionals, "Usage: deliberum runs create --input <run-plan.json>");
    const runPlan = readJsonObjectInput(
      dependencies,
      requireOption(parsedArgs, "input"),
      "Run plan input"
    );

    return daemonClient.createRun({ runPlan });
  }

  if (action === "list") {
    requireNoPositionals(restPositionals, "Usage: deliberum runs list [--daemon-url <local-url>]");
    return daemonClient.listRuns();
  }

  if (action === "show") {
    const runId = requireRunId(restPositionals, "Usage: deliberum runs show <runId>");
    return daemonClient.getRun(runId);
  }

  if (action === "events") {
    const runId = requireRunId(restPositionals, "Usage: deliberum runs events <runId> [--follow]");

    if (parsedArgs.flags.has("follow")) {
      return followRunEvents({
        runId,
        daemonClient,
        fetch: dependencies.runEventStreamFetch,
        writeStdout: dependencies.writeStdout
      });
    }

    return daemonClient.getRunEvents(runId);
  }

  if (action === "start") {
    const runId = requireRunId(restPositionals, "Usage: deliberum runs start <runId> --input <start.json>");
    const startRequest = readJsonObjectInput(
      dependencies,
      requireOption(parsedArgs, "input"),
      "Run start input"
    );

    return daemonClient.startRun(runId, startRequest);
  }

  if (action === "outcome") {
    const runId = requireRunId(restPositionals, "Usage: deliberum runs outcome <runId>");
    return daemonClient.getRunOutcome(runId);
  }

  throw new CliUsageError(`Unknown command: runs ${action || "(empty)"}`);
}

function assertKnownRunCommand(action: string): void {
  if (["create", "list", "show", "events", "start", "outcome"].includes(action)) {
    return;
  }

  throw new CliUsageError(`Unknown command: runs ${action || "(empty)"}`);
}

function assertRunCommandOptions(action: string, parsedArgs: ParsedArgs): void {
  const allowedOptions = new Set(["daemon-url"]);

  if (action === "create" || action === "start") {
    allowedOptions.add("input");
  }

  for (const optionName of parsedArgs.options.keys()) {
    if (isSecretLikeKey(optionName)) {
      throw new CliUsageError("Run commands do not accept provider secrets or credentials.");
    }

    if (!allowedOptions.has(optionName)) {
      throw new CliUsageError(`Unknown option for runs ${action}: --${optionName}`);
    }
  }

  for (const flagName of parsedArgs.flags) {
    if (flagName === "follow" && action === "events") {
      continue;
    }

    if (flagName !== "json") {
      if (isSecretLikeKey(flagName)) {
        throw new CliUsageError("Run commands do not accept provider secrets or credentials.");
      }

      throw new CliUsageError(`Unknown flag for runs ${action}: --${flagName}`);
    }
  }
}

function requireRunId(positionals: string[], usage: string): string {
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CliUsageError(usage);
  }

  return positionals[0];
}

function requireNoPositionals(positionals: string[], usage: string): void {
  if (positionals.length > 0) {
    throw new CliUsageError(usage);
  }
}

function readJsonObjectInput(
  dependencies: ExecuteDependencies,
  filePath: string,
  label: string
): Record<string, unknown> {
  let input: unknown;

  try {
    input = dependencies.readJsonFile(filePath);
  } catch {
    throw new CliUsageError(`${label} must be a readable JSON object.`);
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CliUsageError(`${label} must contain a JSON object.`);
  }

  return input as Record<string, unknown>;
}

function resolveDaemonUrl(
  parsedArgs: ParsedArgs,
  env: Record<string, string | undefined>
): string {
  const envDaemonUrl = env.DELIBERUM_DAEMON_URL?.trim();
  const configuredUrl =
    getLastOption(parsedArgs, "daemon-url") ??
    (envDaemonUrl && envDaemonUrl.length > 0 ? envDaemonUrl : undefined) ??
    DEFAULT_DAEMON_BASE_URL;

  return validateLocalDaemonUrl(configuredUrl);
}

function validateLocalDaemonUrl(input: string): string {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new CliUsageError("Daemon URL must be a local http(s) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliUsageError("Daemon URL must use http or https.");
  }

  if (url.username || url.password) {
    throw new CliUsageError("Daemon URL must not include credentials.");
  }

  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname.toLowerCase())) {
    throw new CliUsageError("Daemon URL must point to a local daemon host.");
  }

  if (url.search || url.hash || containsSecretLikeValue(input)) {
    throw new CliUsageError("Daemon URL must not include query, fragment, or secret material.");
  }

  return input.replace(/\/$/, "");
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawName) {
      throw new CliUsageError(`Invalid option: ${arg}`);
    }

    if (inlineValue !== undefined) {
      appendOption(options, rawName, inlineValue);
      continue;
    }

    const nextArg = args[index + 1];
    if (rawName === "json" || nextArg === undefined || nextArg.startsWith("--")) {
      flags.add(rawName);
      continue;
    }

    appendOption(options, rawName, nextArg);
    index += 1;
  }

  return {
    positionals,
    options,
    flags
  };
}

function appendOption(options: Map<string, string[]>, name: string, value: string): void {
  const values = options.get(name) ?? [];
  values.push(value);
  options.set(name, values);
}

function requireOption(parsedArgs: ParsedArgs, name: string): string {
  const value = getLastOption(parsedArgs, name);
  if (!value) {
    throw new CliUsageError(`Missing required option --${name}`);
  }

  return value;
}

function getLastOption(parsedArgs: ParsedArgs, name: string): string | undefined {
  const values = parsedArgs.options.get(name);
  return values?.[values.length - 1];
}

function getManyOptions(parsedArgs: ParsedArgs, name: string): string[] {
  return parsedArgs.options.get(name) ?? [];
}

function getStorePath(parsedArgs: ParsedArgs, env: Record<string, string | undefined>): string {
  return getLastOption(parsedArgs, "store") ?? env.DELIBERUM_STORE ?? defaultStorePath();
}

function parseExtractionInput(input: unknown): ExtractionInputFile {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CliUsageError("Extraction input file must contain a JSON object.");
  }

  return input as ExtractionInputFile;
}

function createErrorOutput(error: unknown): {
  error: {
    name: string;
    detail: string;
    code?: string;
    status?: number;
  };
} {
  if (error instanceof DaemonClientError) {
    return {
      error: {
        name: error.name,
        code: error.code,
        status: error.status,
        detail: sanitizeErrorDetail(error.message)
      }
    };
  }

  return {
    error: {
      name: error instanceof Error ? error.name : "CliError",
      detail: sanitizeErrorDetail(error instanceof Error ? error.message : String(error))
    }
  };
}

function sanitizeErrorDetail(detail: string): string {
  return detail
    .replace(/bearer\s+[a-z0-9._~+/-]{4,}/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-z0-9_-]{4,}\b/gi, "[redacted_secret]")
    .replace(/\b(api[_-]?key|secret|access[_-]?token|private[_-]?token|authorization)=\S+/gi, "$1=[redacted]")
    .replace(/(?:file:)?\/Users\/[^\s"']+/g, "[redacted_path]")
    .replace(/(?:file:)?\/home\/[^\s"']+/g, "[redacted_path]")
    .replace(/(?:file:)?\/private\/[^\s"']+/g, "[redacted_path]")
    .replace(/~\/\.ssh\/[^\s"']*/g, "[redacted_path]");
}

const SECRET_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "authtoken",
  "auth_token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "secret",
  "clientsecret",
  "client_secret",
  "password",
  "privatekey",
  "private_key",
  "privatetoken",
  "private_token",
  "credential",
  "credentials"
]);

function isSecretLikeKey(key: string): boolean {
  return SECRET_KEY_NAMES.has(key.replace(/[-\s]/g, "").toLowerCase());
}

function containsSecretLikeValue(value: string): boolean {
  return (
    /bearer\s+[a-z0-9._~+/-]{8,}/i.test(value) ||
    /\bsk-[a-z0-9_-]{8,}\b/i.test(value) ||
    /\b(api[_-]?key|secret|access[_-]?token|private[_-]?token|authorization)=\S{4,}/i.test(value)
  );
}

function isRawCliOutput(output: unknown): output is RawCliOutput {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { kind?: unknown }).kind === "raw"
  );
}

async function followRunEvents(options: {
  runId: string;
  daemonClient: CliRunDaemonClient;
  fetch: CliRunEventStreamFetch;
  writeStdout: (chunk: string) => void | Promise<void>;
}): Promise<RawCliOutput> {
  const eventCount = await streamRunEvents({
    url: options.daemonClient.getRunEventsStreamUrl(options.runId),
    fetch: options.fetch,
    onEvent: async (event) => {
      await options.writeStdout(`${JSON.stringify(event)}\n`);
    }
  });

  return {
    kind: "raw",
    output: {
      runId: options.runId,
      followed: true,
      events: eventCount
    }
  };
}

async function streamRunEvents(options: {
  url: string;
  fetch: CliRunEventStreamFetch;
  onEvent: (event: unknown) => void | Promise<void>;
}): Promise<number> {
  let response: CliRunEventStreamFetchResponse;

  try {
    response = await options.fetch(options.url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream"
      }
    });
  } catch {
    throw new DaemonClientError(0, "daemon_unavailable", "Daemon is unavailable.");
  }

  if (!response.ok) {
    throw new DaemonClientError(
      response.status,
      "request_failed",
      "Daemon event stream request failed."
    );
  }

  if (!response.body) {
    throw new DaemonClientError(
      response.status,
      "empty_stream",
      "Daemon event stream is unavailable."
    );
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let eventCount = 0;

  for await (const chunk of iterateStreamChunks(response.body)) {
    buffer += decoder.decode(chunk, { stream: true });
    const result = await consumeSseFrames(buffer, options.onEvent);
    buffer = result.remaining;
    eventCount += result.eventCount;
  }

  buffer += decoder.decode();
  const finalResult = await consumeSseFrames(buffer, options.onEvent, true);
  return eventCount + finalResult.eventCount;
}

async function* iterateStreamChunks(body: CliRunEventStreamBody): AsyncIterable<Uint8Array> {
  if (isAsyncIterable(body)) {
    yield* body;
    return;
  }

  const reader = body.getReader();

  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        return;
      }

      if (result.value) {
        yield result.value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function isAsyncIterable(input: unknown): input is AsyncIterable<Uint8Array> {
  return (
    typeof input === "object" &&
    input !== null &&
    Symbol.asyncIterator in input
  );
}

async function consumeSseFrames(
  input: string,
  onEvent: (event: unknown) => void | Promise<void>,
  flush = false
): Promise<{ remaining: string; eventCount: number }> {
  let remaining = input;
  let eventCount = 0;

  for (;;) {
    const boundary = findSseFrameBoundary(remaining);
    if (!boundary) {
      break;
    }

    const rawFrame = remaining.slice(0, boundary.index);
    remaining = remaining.slice(boundary.index + boundary.length);
    const processed = await consumeSseFrame(rawFrame, onEvent);
    eventCount += processed ? 1 : 0;
  }

  if (flush && remaining.trim().length > 0) {
    const processed = await consumeSseFrame(remaining, onEvent);
    eventCount += processed ? 1 : 0;
    remaining = "";
  }

  return {
    remaining,
    eventCount
  };
}

async function consumeSseFrame(
  rawFrame: string,
  onEvent: (event: unknown) => void | Promise<void>
): Promise<boolean> {
  const frame = parseSseFrame(rawFrame);

  if (!frame || frame.event !== "event" || frame.data.length === 0) {
    return false;
  }

  let event: unknown;

  try {
    event = JSON.parse(frame.data);
  } catch {
    throw new DaemonClientError(
      0,
      "invalid_event_stream",
      "Daemon event stream returned invalid event data."
    );
  }

  await onEvent(event);
  return true;
}

function findSseFrameBoundary(input: string): { index: number; length: number } | undefined {
  const lfIndex = input.indexOf("\n\n");
  const crlfIndex = input.indexOf("\r\n\r\n");

  if (lfIndex === -1 && crlfIndex === -1) {
    return undefined;
  }

  if (lfIndex === -1) {
    return {
      index: crlfIndex,
      length: 4
    };
  }

  if (crlfIndex === -1 || lfIndex < crlfIndex) {
    return {
      index: lfIndex,
      length: 2
    };
  }

  return {
    index: crlfIndex,
    length: 4
  };
}

function parseSseFrame(rawFrame: string): { event?: string; data: string } | undefined {
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of rawFrame.replace(/\r\n/g, "\n").split("\n")) {
    if (rawLine.length === 0 || rawLine.startsWith(":")) {
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");
    const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? "" : rawLine.slice(separatorIndex + 1);

    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      eventName = value;
      continue;
    }

    if (field === "data") {
      dataLines.push(value);
    }
  }

  if (eventName === undefined && dataLines.length === 0) {
    return undefined;
  }

  return {
    event: eventName,
    data: dataLines.join("\n")
  };
}

function getDefaultRunEventStreamFetch(): CliRunEventStreamFetch {
  if (typeof globalThis.fetch !== "function") {
    throw new DaemonClientError(0, "fetch_unavailable", "A fetch implementation is required.");
  }

  return async (url, init) => {
    const response = await globalThis.fetch(url, init);

    return {
      ok: response.ok,
      status: response.status,
      body: response.body
    };
  };
}
