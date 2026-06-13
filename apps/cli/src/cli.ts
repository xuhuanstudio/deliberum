import {
  DEFAULT_DAEMON_BASE_URL,
  DaemonClientError,
  DeliberumDaemonClient,
  buildRuntimeSetupPlan,
  type OperationAuditResponse,
  type RuntimeProfilesResponse
} from "@deliberum/client";
import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  acceptProposal,
  challengeProcessProposal,
  challengeProposal,
  closeSealedBatch,
  compileOutcome,
  createSession,
  decideProcessProposal,
  openSealedBatch,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectProcessProposalStates,
  projectQualityObligations,
  proposeProcessProposal,
  proposeExtraction,
  proposeFinalCandidate,
  auditFinalCandidate,
  submitSealedContribution
} from "@deliberum/core";
import type {
  JsonValue,
  ProcessProposalDecisionStatus,
  SealedBatchPurpose,
  SealedBatchRevealPolicy
} from "@deliberum/protocol";
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
  "process proposals",
  "process propose",
  "process challenge",
  "process decide",
  "final propose",
  "final audit",
  "final compile",
  "frontier",
  "objections",
  "obligations",
  "events",
  "daemon profiles",
  "daemon env-template",
  "daemon env-write",
  "daemon profile-doctor",
  "daemon setup-plan",
  "daemon deployment-posture",
  "daemon operation-audit",
  "daemon resource-access status",
  "daemon resource-access revoke",
  "runs create",
  "runs list",
  "runs show",
  "runs events",
  "runs start",
  "runs outcome",
  "runs resources",
  "runs process-proposals",
  "runs execute-process-proposal",
  "runs final-propose",
  "runs final-audit"
] as const;

export type CliCoreApi = {
  createSession: typeof createSession;
  openSealedBatch: typeof openSealedBatch;
  submitSealedContribution: typeof submitSealedContribution;
  closeSealedBatch: typeof closeSealedBatch;
  proposeExtraction: typeof proposeExtraction;
  challengeProposal: typeof challengeProposal;
  acceptProposal: typeof acceptProposal;
  projectProcessProposalStates: typeof projectProcessProposalStates;
  proposeProcessProposal: typeof proposeProcessProposal;
  challengeProcessProposal: typeof challengeProcessProposal;
  decideProcessProposal: typeof decideProcessProposal;
  proposeFinalCandidate: typeof proposeFinalCandidate;
  auditFinalCandidate: typeof auditFinalCandidate;
  compileOutcome: typeof compileOutcome;
  projectAcceptedDeliberationObjects: typeof projectAcceptedDeliberationObjects;
  projectCandidateFrontier: typeof projectCandidateFrontier;
  projectQualityObligations: typeof projectQualityObligations;
};

export type CliDependencies = {
  core?: Partial<CliCoreApi>;
  createEventStore?: (options: { filePath: string; clock?: () => string }) => EventStore;
  createDaemonClient?: (options: {
    baseUrl: string;
    authToken?: string;
  }) => CliRunDaemonClient;
  runEventStreamFetch?: CliRunEventStreamFetch;
  writeStdout?: (chunk: string) => void | Promise<void>;
  readTextFile?: (filePath: string) => string;
  writeTextFile?: (filePath: string, content: string) => void | Promise<void>;
  fileExists?: (filePath: string) => boolean;
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

type FinalCandidateInputFile = {
  candidateIds?: readonly string[];
  recommendation?: string;
  applicabilityConditions?: readonly string[];
  rationale?: string;
  limitations?: readonly string[];
};

type FinalAuditInputFile = {
  findings?: readonly string[];
  risks?: readonly string[];
  unresolvedObjectionIds?: readonly string[];
  qualityObligationIds?: readonly string[];
  evidenceNeedIds?: readonly string[];
  omissions?: readonly string[];
  compressionProblems?: readonly string[];
  limitations?: readonly string[];
  continuationSuggestions?: readonly string[];
};

export type CliRunDaemonClient = Pick<
  DeliberumDaemonClient,
  | "getRuntimeProfiles"
  | "getResourceAccessPosture"
  | "getDeploymentPosture"
  | "getOperationAudit"
  | "createRun"
  | "listRuns"
  | "getRun"
  | "getRunEvents"
  | "getRunEventsStreamUrl"
  | "startRun"
  | "getRunOutcome"
  | "getSessionResources"
  | "getRunProcessProposals"
  | "executeRunProcessProposal"
  | "revokeResourceAccess"
  | "proposeFinalCandidate"
  | "auditFinalCandidate"
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

type DaemonProfileDoctorStatus =
  | "disabled"
  | "ready"
  | "ready_with_run_config"
  | "needs_configuration";

type DaemonProfileDoctorAction = {
  kind: "enable_profile" | "set_recommended_env" | "provide_run_config";
  envVar?: string;
  envVars?: string[];
  reason: string;
};

type DaemonProfileDoctorProfile = {
  id: string;
  name: string;
  enabled: boolean;
  status: DaemonProfileDoctorStatus;
  readyForDaemonDefaults: boolean;
  enabledComponentCount: number;
  configuredEnvVarCount: number;
  configuredSecretEnvVarCount: number;
  missingRecommendedEnvVars: string[];
  actions: DaemonProfileDoctorAction[];
  notes: string[];
  boundaries: string[];
};

type DaemonProfileDoctorReport = {
  summary: {
    profileCount: number;
    enabledProfileCount: number;
    readyProfileCount: number;
    readyWithRunConfigCount: number;
    needsConfigurationCount: number;
    missingRecommendedEnvVars: string[];
  };
  profiles: DaemonProfileDoctorProfile[];
  safety: string[];
};

const defaultCoreApi: CliCoreApi = {
  createSession,
  openSealedBatch,
  submitSealedContribution,
  closeSealedBatch,
  proposeExtraction,
  challengeProposal,
  acceptProposal,
  projectProcessProposalStates,
  proposeProcessProposal,
  challengeProcessProposal,
  decideProcessProposal,
  proposeFinalCandidate,
  auditFinalCandidate,
  compileOutcome,
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
            baseUrl: options.baseUrl,
            authToken: options.authToken
          })),
      runEventStreamFetch:
        dependencies.runEventStreamFetch ??
        ((url, init) => getDefaultRunEventStreamFetch()(url, init)),
      writeStdout,
      readTextFile:
        dependencies.readTextFile ?? ((filePath) => readFileSync(filePath, "utf8")),
      writeTextFile:
        dependencies.writeTextFile ??
        ((filePath, content) => {
          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, content, "utf8");
        }),
      fileExists: dependencies.fileExists ?? existsSync,
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
  createDaemonClient: (options: { baseUrl: string; authToken?: string }) => CliRunDaemonClient;
  runEventStreamFetch: CliRunEventStreamFetch;
  writeStdout: (chunk: string) => void | Promise<void>;
  readTextFile: (filePath: string) => string;
  writeTextFile: (filePath: string, content: string) => void | Promise<void>;
  fileExists: (filePath: string) => boolean;
  idGenerator: () => string;
  clock?: () => string;
  env: Record<string, string | undefined>;
  readJsonFile: (filePath: string) => unknown;
};

async function executeCommand(parsedArgs: ParsedArgs, dependencies: ExecuteDependencies): Promise<unknown> {
  const [command, subcommand, ...restPositionals] = parsedArgs.positionals;

  if (command === "daemon") {
    return executeDaemonCommand(subcommand, restPositionals, parsedArgs, dependencies);
  }

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

  if (command === "process" && subcommand === "proposals") {
    return dependencies.core.projectProcessProposalStates({
      eventStore: store,
      sessionId: requireOption(parsedArgs, "session")
    });
  }

  if (command === "process" && subcommand === "propose") {
    const proposal = readJsonObjectInput(
      dependencies,
      requireOption(parsedArgs, "input"),
      "Process proposal input"
    );
    const result = dependencies.core.proposeProcessProposal(
      {
        sessionId: requireOption(parsedArgs, "session"),
        authorId: requireOption(parsedArgs, "author"),
        proposal,
        basedOnEventIds: getManyOptions(parsedArgs, "based-on-event"),
        idempotencyKey: getLastOption(parsedArgs, "idempotency-key")
      },
      coreOptions
    );

    return {
      proposalId: result.proposalId,
      event: result.proposalEvent
    };
  }

  if (command === "process" && subcommand === "challenge") {
    const result = dependencies.core.challengeProcessProposal(
      {
        sessionId: requireOption(parsedArgs, "session"),
        targetProcessProposalEventId: requireOption(parsedArgs, "proposal-event"),
        authorId: requireOption(parsedArgs, "author"),
        reason: requireOption(parsedArgs, "reason"),
        idempotencyKey: getLastOption(parsedArgs, "idempotency-key")
      },
      coreOptions
    );

    return {
      event: result.challengeEvent
    };
  }

  if (command === "process" && subcommand === "decide") {
    const result = dependencies.core.decideProcessProposal(
      {
        sessionId: requireOption(parsedArgs, "session"),
        targetProcessProposalEventId: requireOption(parsedArgs, "proposal-event"),
        authorId: requireOption(parsedArgs, "author"),
        status: requireOption(parsedArgs, "status") as ProcessProposalDecisionStatus,
        rationale: requireOption(parsedArgs, "rationale"),
        idempotencyKey: getLastOption(parsedArgs, "idempotency-key")
      },
      coreOptions
    );

    return {
      event: result.decisionEvent
    };
  }

  if (command === "final" && subcommand === "propose") {
    const input = parseFinalCandidateInput(
      dependencies.readJsonFile(requireOption(parsedArgs, "input"))
    );
    const result = dependencies.core.proposeFinalCandidate(
      {
        sessionId: requireOption(parsedArgs, "session"),
        authorId: requireOption(parsedArgs, "author"),
        candidateIds: input.candidateIds ?? [],
        recommendation: input.recommendation ?? "",
        applicabilityConditions: input.applicabilityConditions ?? [],
        rationale: input.rationale ?? "",
        limitations: input.limitations ?? [],
        idempotencyKey: getLastOption(parsedArgs, "idempotency-key")
      },
      coreOptions
    );

    return {
      proposalId: result.proposalId,
      event: result.proposalEvent,
      appended: result.appended
    };
  }

  if (command === "final" && subcommand === "audit") {
    const input = parseFinalAuditInput(
      dependencies.readJsonFile(requireOption(parsedArgs, "input"))
    );
    const result = dependencies.core.auditFinalCandidate(
      {
        sessionId: requireOption(parsedArgs, "session"),
        targetFinalCandidateProposalEventId: requireOption(parsedArgs, "proposal-event"),
        authorId: requireOption(parsedArgs, "author"),
        findings: input.findings,
        risks: input.risks,
        unresolvedObjectionIds: input.unresolvedObjectionIds,
        qualityObligationIds: input.qualityObligationIds,
        evidenceNeedIds: input.evidenceNeedIds,
        omissions: input.omissions,
        compressionProblems: input.compressionProblems,
        limitations: input.limitations,
        continuationSuggestions: input.continuationSuggestions,
        idempotencyKey: getLastOption(parsedArgs, "idempotency-key")
      },
      coreOptions
    );

    return {
      event: result.auditEvent,
      appended: result.appended
    };
  }

  if (command === "final" && subcommand === "compile") {
    return dependencies.core.compileOutcome({
      eventStore: store,
      sessionId: requireOption(parsedArgs, "session"),
      finalCandidateProposalEventId: getLastOption(parsedArgs, "proposal-event")
    });
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

async function executeDaemonCommand(
  subcommand: string | undefined,
  restPositionals: string[],
  parsedArgs: ParsedArgs,
  dependencies: ExecuteDependencies
): Promise<unknown> {
  const action = subcommand ?? "";
  assertKnownDaemonCommand(action);
  assertDaemonCommandOptions(action, parsedArgs);

  const daemonClient = dependencies.createDaemonClient({
    ...resolveDaemonClientOptions(parsedArgs, dependencies.env)
  });

  if (action === "profiles") {
    requireNoPositionals(
      restPositionals,
      "Usage: deliberum daemon profiles [--daemon-url <local-url>]"
    );

    return daemonClient.getRuntimeProfiles();
  }

  if (action === "env-template") {
    requireNoPositionals(
      restPositionals,
      "Usage: deliberum daemon env-template [--profile <id>] [--daemon-url <local-url>]"
    );

    const profiles = await daemonClient.getRuntimeProfiles();
    const template = createDaemonEnvTemplate(
      profiles,
      getLastOption(parsedArgs, "profile")
    );

    if (parsedArgs.flags.has("json")) {
      return { template };
    }

    await dependencies.writeStdout(template);

    return {
      kind: "raw",
      output: {
        format: "env-template"
      }
    } satisfies RawCliOutput;
  }

  if (action === "env-write") {
    requireNoPositionals(
      restPositionals,
      "Usage: deliberum daemon env-write --output <path> [--profile <id>] [--set <NAME=value>] [--overwrite] [--dry-run] [--daemon-url <local-url>]"
    );

    const profiles = await daemonClient.getRuntimeProfiles();
    const plan = createDaemonEnvWritePlan({
      response: profiles,
      profileId: getLastOption(parsedArgs, "profile"),
      setOptions: getManyOptions(parsedArgs, "set")
    });

    if (parsedArgs.flags.has("dry-run")) {
      if (parsedArgs.flags.has("json")) {
        return {
          ...plan.summary,
          content: plan.block
        };
      }

      await dependencies.writeStdout(plan.block);

      return {
        kind: "raw",
        output: {
          format: "env-write-dry-run"
        }
      } satisfies RawCliOutput;
    }

    const outputPath = requireOption(parsedArgs, "output");
    const content = createDaemonEnvFileContent({
      filePath: outputPath,
      block: plan.block,
      overwrite: parsedArgs.flags.has("overwrite"),
      dependencies
    });

    await dependencies.writeTextFile(outputPath, content);

    return {
      ...plan.summary,
      filePath: outputPath,
      written: true
    };
  }

  if (action === "profile-doctor") {
    requireNoPositionals(
      restPositionals,
      "Usage: deliberum daemon profile-doctor [--profile <id>] [--daemon-url <local-url>]"
    );

    const profiles = await daemonClient.getRuntimeProfiles();

    return createDaemonProfileDoctorReport(profiles, getLastOption(parsedArgs, "profile"));
  }

  if (action === "setup-plan") {
    requireNoPositionals(
      restPositionals,
      "Usage: deliberum daemon setup-plan [--profile <id>] [--daemon-url <local-url>]"
    );

    const profiles = await daemonClient.getRuntimeProfiles();

    return buildRuntimeSetupPlan(profiles, getLastOption(parsedArgs, "profile"));
  }

  if (action === "deployment-posture") {
    requireNoPositionals(
      restPositionals,
      "Usage: deliberum daemon deployment-posture [--daemon-url <local-url>]"
    );

    return daemonClient.getDeploymentPosture();
  }

  if (action === "operation-audit") {
    requireNoPositionals(
      restPositionals,
      "Usage: deliberum daemon operation-audit [--limit <n>] [--format <json|jsonl>] [--daemon-url <local-url>]"
    );

    const format = parseOperationAuditFormat(parsedArgs.options.get("format"));
    const audit = await daemonClient.getOperationAudit({
      limit: parseOptionalPositiveIntegerOption(parsedArgs.options.get("limit"), "--limit")
    });

    if (format === "jsonl") {
      return writeOperationAuditJsonl({
        events: audit.events,
        writeStdout: dependencies.writeStdout
      });
    }

    return audit;
  }

  if (action === "resource-access") {
    const [resourceAccessAction, ...resourceAccessPositionals] = restPositionals;

    if (resourceAccessAction === "status") {
      requireNoPositionals(
        resourceAccessPositionals,
        "Usage: deliberum daemon resource-access status [--daemon-url <local-url>]"
      );

      return daemonClient.getResourceAccessPosture();
    }

    if (resourceAccessAction !== "revoke") {
      throw new CliUsageError(
        "Usage: deliberum daemon resource-access <status|revoke> [access-id] [--daemon-url <local-url>]"
      );
    }

    const accessId = requireSinglePositional(
      resourceAccessPositionals,
      "Usage: deliberum daemon resource-access revoke <access-id> [--daemon-url <local-url>]"
    );

    return daemonClient.revokeResourceAccess(accessId);
  }

  throw new CliUsageError(`Unknown command: daemon ${action || "(empty)"}`);
}

function assertKnownDaemonCommand(action: string): void {
  if (
    [
      "profiles",
      "env-template",
      "env-write",
      "profile-doctor",
      "setup-plan",
      "deployment-posture",
      "operation-audit",
      "resource-access"
    ].includes(action)
  ) {
    return;
  }

  throw new CliUsageError(`Unknown command: daemon ${action || "(empty)"}`);
}

function assertDaemonCommandOptions(action: string, parsedArgs: ParsedArgs): void {
  const allowedOptions = new Set([
    "daemon-url",
    ...(action === "env-template" ||
    action === "env-write" ||
    action === "profile-doctor" ||
    action === "setup-plan"
      ? ["profile"]
      : []),
    ...(action === "env-write" ? ["output", "set"] : []),
    ...(action === "operation-audit" ? ["limit", "format"] : [])
  ]);
  const allowedFlags = new Set([
    "json",
    ...(action === "env-write" ? ["overwrite", "dry-run"] : [])
  ]);

  for (const optionName of parsedArgs.options.keys()) {
    if (isSecretLikeKey(optionName)) {
      throw new CliUsageError("Daemon commands do not accept provider secrets or credentials.");
    }

    if (!allowedOptions.has(optionName)) {
      throw new CliUsageError(`Unknown option for daemon ${action}: --${optionName}`);
    }
  }

  for (const flagName of parsedArgs.flags) {
    if (!allowedFlags.has(flagName)) {
      if (isSecretLikeKey(flagName)) {
        throw new CliUsageError("Daemon commands do not accept provider secrets or credentials.");
      }

      throw new CliUsageError(`Unknown flag for daemon ${action}: --${flagName}`);
    }
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
    ...resolveDaemonClientOptions(parsedArgs, dependencies.env)
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
    const runId = requireRunId(
      restPositionals,
      "Usage: deliberum runs outcome <runId> [--proposal-event <event-id>]"
    );
    const proposalEventId = getLastOption(parsedArgs, "proposal-event");

    return proposalEventId
      ? daemonClient.getRunOutcome(runId, {
          finalCandidateProposalEventId: proposalEventId
        })
      : daemonClient.getRunOutcome(runId);
  }

  if (action === "resources") {
    const runId = requireRunId(restPositionals, "Usage: deliberum runs resources <runId>");
    const run = await daemonClient.getRun(runId);
    const sessionId = extractSessionIdFromRunResponse(run);

    return daemonClient.getSessionResources(sessionId);
  }

  if (action === "process-proposals") {
    const runId = requireRunId(
      restPositionals,
      "Usage: deliberum runs process-proposals <runId>"
    );
    return daemonClient.getRunProcessProposals(runId);
  }

  if (action === "final-propose") {
    const runId = requireRunId(
      restPositionals,
      "Usage: deliberum runs final-propose <runId> --author <id> --input <json-file>"
    );
    const run = await daemonClient.getRun(runId);
    const sessionId = extractSessionIdFromRunResponse(run);
    const input = parseFinalCandidateInput(
      dependencies.readJsonFile(requireOption(parsedArgs, "input"))
    );

    return daemonClient.proposeFinalCandidate(sessionId, {
      authorId: requireOption(parsedArgs, "author"),
      candidateIds: copyStringArray(input.candidateIds),
      recommendation: input.recommendation ?? "",
      applicabilityConditions: copyStringArray(input.applicabilityConditions),
      rationale: input.rationale ?? "",
      limitations: copyStringArray(input.limitations),
      idempotencyKey: getLastOption(parsedArgs, "idempotency-key")
    });
  }

  if (action === "final-audit") {
    const runId = requireRunId(
      restPositionals,
      "Usage: deliberum runs final-audit <runId> --proposal-event <eventId> --author <id> --input <json-file>"
    );
    const run = await daemonClient.getRun(runId);
    const sessionId = extractSessionIdFromRunResponse(run);
    const input = parseFinalAuditInput(
      dependencies.readJsonFile(requireOption(parsedArgs, "input"))
    );

    return daemonClient.auditFinalCandidate(
      sessionId,
      requireOption(parsedArgs, "proposal-event"),
      {
        authorId: requireOption(parsedArgs, "author"),
        findings: copyOptionalStringArray(input.findings),
        risks: copyOptionalStringArray(input.risks),
        unresolvedObjectionIds: copyOptionalStringArray(input.unresolvedObjectionIds),
        qualityObligationIds: copyOptionalStringArray(input.qualityObligationIds),
        evidenceNeedIds: copyOptionalStringArray(input.evidenceNeedIds),
        omissions: copyOptionalStringArray(input.omissions),
        compressionProblems: copyOptionalStringArray(input.compressionProblems),
        limitations: copyOptionalStringArray(input.limitations),
        continuationSuggestions: copyOptionalStringArray(input.continuationSuggestions),
        idempotencyKey: getLastOption(parsedArgs, "idempotency-key")
      }
    );
  }

  if (action === "execute-process-proposal") {
    const runId = requireRunId(
      restPositionals,
      "Usage: deliberum runs execute-process-proposal <runId> --proposal-event <eventId>"
    );
    return daemonClient.executeRunProcessProposal(
      runId,
      requireOption(parsedArgs, "proposal-event")
    );
  }

  throw new CliUsageError(`Unknown command: runs ${action || "(empty)"}`);
}

function assertKnownRunCommand(action: string): void {
  if (
    [
      "create",
      "list",
      "show",
      "events",
      "start",
      "outcome",
      "resources",
      "process-proposals",
      "execute-process-proposal",
      "final-propose",
      "final-audit"
    ].includes(action)
  ) {
    return;
  }

  throw new CliUsageError(`Unknown command: runs ${action || "(empty)"}`);
}

function extractSessionIdFromRunResponse(response: unknown): string {
  if (typeof response !== "object" || response === null) {
    throw new CliUsageError("Daemon run response did not include a sessionId.");
  }

  const run = (response as { run?: unknown }).run;

  if (typeof run !== "object" || run === null) {
    throw new CliUsageError("Daemon run response did not include a sessionId.");
  }

  const sessionId = (run as { sessionId?: unknown }).sessionId;

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new CliUsageError("Daemon run response did not include a sessionId.");
  }

  return sessionId.trim();
}

function assertRunCommandOptions(action: string, parsedArgs: ParsedArgs): void {
  const allowedOptions = new Set(["daemon-url"]);

  if (action === "create" || action === "start") {
    allowedOptions.add("input");
  }

  if (action === "outcome" || action === "execute-process-proposal") {
    allowedOptions.add("proposal-event");
  }

  if (action === "final-propose" || action === "final-audit") {
    allowedOptions.add("author");
    allowedOptions.add("input");
    allowedOptions.add("idempotency-key");
  }

  if (action === "final-audit") {
    allowedOptions.add("proposal-event");
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

function requireSinglePositional(positionals: string[], usage: string): string {
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CliUsageError(usage);
  }

  return positionals[0];
}

function parseOptionalPositiveIntegerOption(
  values: string[] | undefined,
  optionName: string
): number | undefined {
  const value = values?.at(-1)?.trim();
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new CliUsageError(`${optionName} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

function parseOperationAuditFormat(values: string[] | undefined): "json" | "jsonl" {
  const value = values?.at(-1)?.trim() || "json";

  if (value === "json" || value === "jsonl") {
    return value;
  }

  throw new CliUsageError("--format must be json or jsonl.");
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

function copyStringArray(values: readonly string[] | undefined): string[] {
  return [...(values ?? [])];
}

function copyOptionalStringArray(values: readonly string[] | undefined): string[] | undefined {
  return values ? [...values] : undefined;
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

function resolveDaemonClientOptions(
  parsedArgs: ParsedArgs,
  env: Record<string, string | undefined>
): { baseUrl: string; authToken?: string } {
  const authToken = env.DELIBERUM_DAEMON_AUTH_TOKEN?.trim();

  return {
    baseUrl: resolveDaemonUrl(parsedArgs, env),
    ...(authToken && authToken.length > 0 ? { authToken } : {})
  };
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

function parseFinalCandidateInput(input: unknown): FinalCandidateInputFile {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CliUsageError("Final candidate input file must contain a JSON object.");
  }

  return input as FinalCandidateInputFile;
}

function parseFinalAuditInput(input: unknown): FinalAuditInputFile {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CliUsageError("Final audit input file must contain a JSON object.");
  }

  return input as FinalAuditInputFile;
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

async function writeOperationAuditJsonl(options: {
  events: OperationAuditResponse["events"];
  writeStdout: (chunk: string) => void | Promise<void>;
}): Promise<RawCliOutput> {
  for (const event of options.events) {
    await options.writeStdout(`${JSON.stringify(event)}\n`);
  }

  return {
    kind: "raw",
    output: {
      format: "jsonl",
      events: options.events.length
    }
  };
}

function createDaemonEnvTemplate(
  response: RuntimeProfilesResponse,
  profileId: string | undefined
): string {
  const profiles = profileId
    ? response.profiles.filter((profile) => profile.id === profileId)
    : response.profiles;

  if (profileId && profiles.length === 0) {
    throw new CliUsageError(`Runtime profile was not found: ${profileId}`);
  }

  const lines = [
    "# Deliberum daemon environment template",
    "# Generated from safe /runtime/profiles metadata.",
    "# Values are intentionally blank; uncomment and fill them in your shell or .env.",
    "# Provider and tool secrets must stay in local runtime environment only.",
    ""
  ];

  for (const profile of profiles) {
    lines.push(
      `# Profile: ${sanitizeEnvTemplateComment(profile.name)} (${profile.id})`,
      `# Status: ${profile.status}`,
      `# Enable with: ${profile.setup.enableEnvVar}=true`,
      `# ${profile.setup.enableEnvVar}=true`
    );

    if (profile.setup.missingRecommendedEnvVars.length > 0) {
      lines.push(
        `# Missing recommended env vars: ${profile.setup.missingRecommendedEnvVars.join(", ")}`
      );
    }

    for (const envVar of profile.setup.envVars) {
      lines.push(
        `# ${sanitizeEnvTemplateComment(envVar.purpose)}`,
        `# required=${envVar.required} secret=${envVar.secret} configured=${envVar.configured}`,
        `# ${envVar.name}=`
      );
    }

    for (const note of profile.setup.notes) {
      lines.push(`# Note: ${sanitizeEnvTemplateComment(note)}`);
    }

    for (const boundary of profile.boundaries) {
      lines.push(`# Boundary: ${sanitizeEnvTemplateComment(boundary)}`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

const DAEMON_ENV_WRITE_BEGIN = "# BEGIN DELIBERUM DAEMON ENV" as const;
const DAEMON_ENV_WRITE_END = "# END DELIBERUM DAEMON ENV" as const;

type DaemonEnvWritePlan = {
  block: string;
  summary: {
    profileIds: string[];
    enabledEnvVars: string[];
    writtenEnvVars: string[];
    placeholderEnvVars: string[];
    manualSecretEnvVars: string[];
    written: false;
  };
};

function createDaemonEnvWritePlan(input: {
  response: RuntimeProfilesResponse;
  profileId: string | undefined;
  setOptions: readonly string[];
}): DaemonEnvWritePlan {
  const profiles = input.profileId
    ? input.response.profiles.filter((profile) => profile.id === input.profileId)
    : input.response.profiles;

  if (input.profileId && profiles.length === 0) {
    throw new CliUsageError(`Runtime profile was not found: ${input.profileId}`);
  }

  const envMetadata = collectDaemonEnvWriteMetadata(profiles);
  const explicitValues = parseDaemonEnvWriteSetOptions(input.setOptions, envMetadata);
  const enabledEnvVars: string[] = [];
  const writtenEnvVars: string[] = [];
  const placeholderEnvVars: string[] = [];
  const manualSecretEnvVars: string[] = [];
  const emittedEnvVars = new Set<string>();
  const lines = [
    DAEMON_ENV_WRITE_BEGIN,
    "# Deliberum daemon environment block",
    "# Generated from safe /runtime/profiles metadata.",
    "# Secret env vars are left as commented placeholders; fill them manually.",
    ""
  ];

  for (const profile of profiles) {
    lines.push(
      `# Profile: ${sanitizeEnvTemplateComment(profile.name)} (${profile.id})`,
      `${profile.setup.enableEnvVar}=true`
    );
    emittedEnvVars.add(profile.setup.enableEnvVar);
    enabledEnvVars.push(profile.setup.enableEnvVar);
    writtenEnvVars.push(profile.setup.enableEnvVar);

    for (const envVar of profile.setup.envVars) {
      if (emittedEnvVars.has(envVar.name)) {
        continue;
      }

      lines.push(
        `# ${sanitizeEnvTemplateComment(envVar.purpose)}`,
        `# required=${envVar.required} secret=${envVar.secret} configured=${envVar.configured}`
      );

      if (envVar.secret) {
        lines.push(`# ${envVar.name}=`);
        manualSecretEnvVars.push(envVar.name);
        placeholderEnvVars.push(envVar.name);
      } else if (explicitValues.has(envVar.name)) {
        lines.push(formatEnvAssignment(envVar.name, explicitValues.get(envVar.name) ?? ""));
        writtenEnvVars.push(envVar.name);
      } else {
        lines.push(`# ${envVar.name}=`);
        placeholderEnvVars.push(envVar.name);
      }

      emittedEnvVars.add(envVar.name);
    }

    lines.push("");
  }

  lines.push(DAEMON_ENV_WRITE_END);

  return {
    block: `${lines.join("\n")}\n`,
    summary: {
      profileIds: profiles.map((profile) => profile.id),
      enabledEnvVars,
      writtenEnvVars,
      placeholderEnvVars,
      manualSecretEnvVars,
      written: false
    }
  };
}

function collectDaemonEnvWriteMetadata(
  profiles: readonly RuntimeProfilesResponse["profiles"][number][]
): Map<string, { secret: boolean }> {
  const metadata = new Map<string, { secret: boolean }>();

  for (const profile of profiles) {
    metadata.set(profile.setup.enableEnvVar, { secret: false });

    for (const envVar of profile.setup.envVars) {
      const existing = metadata.get(envVar.name);
      metadata.set(envVar.name, {
        secret: existing?.secret === true || envVar.secret
      });
    }
  }

  return metadata;
}

function parseDaemonEnvWriteSetOptions(
  values: readonly string[],
  metadata: Map<string, { secret: boolean }>
): Map<string, string> {
  const parsed = new Map<string, string>();

  for (const rawValue of values) {
    const separatorIndex = rawValue.indexOf("=");
    if (separatorIndex <= 0) {
      throw new CliUsageError("--set must use NAME=value.");
    }

    const name = rawValue.slice(0, separatorIndex).trim();
    const value = rawValue.slice(separatorIndex + 1);

    validateEnvWriteName(name);
    if (!metadata.has(name)) {
      throw new CliUsageError(`--set env var is not declared by the selected profile: ${name}`);
    }

    if (metadata.get(name)?.secret || isSecretLikeEnvName(name)) {
      throw new CliUsageError(`Refusing to write secret env var through --set: ${name}`);
    }

    if (/[\r\n]/.test(value) || containsSecretLikeValue(value)) {
      throw new CliUsageError(`Refusing unsafe --set value for env var: ${name}`);
    }

    parsed.set(name, value);
  }

  return parsed;
}

function createDaemonEnvFileContent(input: {
  filePath: string;
  block: string;
  overwrite: boolean;
  dependencies: Pick<ExecuteDependencies, "fileExists" | "readTextFile">;
}): string {
  if (!input.dependencies.fileExists(input.filePath) || input.overwrite) {
    return input.block;
  }

  const existing = input.dependencies.readTextFile(input.filePath);
  if (existing.trim().length === 0) {
    return input.block;
  }

  const startIndex = existing.indexOf(DAEMON_ENV_WRITE_BEGIN);
  const endIndex = existing.indexOf(DAEMON_ENV_WRITE_END);

  if (startIndex >= 0 && endIndex > startIndex) {
    const afterEndIndex = endIndex + DAEMON_ENV_WRITE_END.length;
    const trailing = existing.slice(afterEndIndex).replace(/^\r?\n/, "");
    return `${existing.slice(0, startIndex)}${input.block}${trailing}`;
  }

  throw new CliUsageError(
    "Refusing to modify an existing env file without a Deliberum env block; use --overwrite to replace it."
  );
}

function validateEnvWriteName(name: string): void {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new CliUsageError(`Invalid env var name: ${name}`);
  }
}

function formatEnvAssignment(name: string, value: string): string {
  if (/^[A-Za-z0-9_./:@-]*$/.test(value)) {
    return `${name}=${value}`;
  }

  return `${name}=${JSON.stringify(value)}`;
}

function isSecretLikeEnvName(name: string): boolean {
  const normalized = name.replace(/[-_\s]/g, "").toLowerCase();

  return [...SECRET_KEY_NAMES].some((secretName) =>
    normalized.includes(secretName.replace(/[-_\s]/g, "").toLowerCase())
  );
}

function createDaemonProfileDoctorReport(
  response: RuntimeProfilesResponse,
  profileId: string | undefined
): DaemonProfileDoctorReport {
  const profiles = profileId
    ? response.profiles.filter((profile) => profile.id === profileId)
    : response.profiles;

  if (profileId && profiles.length === 0) {
    throw new CliUsageError(`Runtime profile was not found: ${profileId}`);
  }

  const diagnostics = profiles.map((profile) => {
    const configuredEnvVars = profile.setup.envVars.filter((envVar) => envVar.configured);
    const enabledComponents = profile.components.filter((component) => component.enabled);
    const actions = createDaemonProfileDoctorActions(profile);

    return {
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      status: profile.status,
      readyForDaemonDefaults: profile.enabled && profile.status === "ready",
      enabledComponentCount: enabledComponents.length,
      configuredEnvVarCount: configuredEnvVars.length,
      configuredSecretEnvVarCount: configuredEnvVars.filter((envVar) => envVar.secret)
        .length,
      missingRecommendedEnvVars: [...profile.setup.missingRecommendedEnvVars],
      actions,
      notes: [...profile.setup.notes],
      boundaries: [...profile.boundaries]
    } satisfies DaemonProfileDoctorProfile;
  });

  return {
    summary: {
      profileCount: diagnostics.length,
      enabledProfileCount: diagnostics.filter((profile) => profile.enabled).length,
      readyProfileCount: diagnostics.filter((profile) => profile.status === "ready").length,
      readyWithRunConfigCount: diagnostics.filter(
        (profile) => profile.status === "ready_with_run_config"
      ).length,
      needsConfigurationCount: diagnostics.filter(
        (profile) => profile.status === "needs_configuration"
      ).length,
      missingRecommendedEnvVars: [
        ...new Set(diagnostics.flatMap((profile) => profile.missingRecommendedEnvVars))
      ].sort()
    },
    profiles: diagnostics,
    safety: [
      "This report is derived from safe /runtime/profiles metadata.",
      "It reports only env var names, booleans, notes, and boundaries.",
      "It does not read or print provider secrets, URLs, model ids, request templates, run plans, or tool payloads.",
      "It does not enable profiles, write .env files, start providers, or execute adapters."
    ]
  };
}

function createDaemonProfileDoctorActions(
  profile: RuntimeProfilesResponse["profiles"][number]
): DaemonProfileDoctorAction[] {
  const actions: DaemonProfileDoctorAction[] = [];

  if (!profile.enabled) {
    actions.push({
      kind: "enable_profile",
      envVar: profile.setup.enableEnvVar,
      reason: "Set the profile enable env var when this profile should be available to daemon runs."
    });
    return actions;
  }

  if (profile.setup.missingRecommendedEnvVars.length > 0) {
    actions.push({
      kind: "set_recommended_env",
      envVars: [...profile.setup.missingRecommendedEnvVars],
      reason: "Configure these env vars for daemon-wide defaults, or keep supplying equivalent run provider config where supported."
    });
  }

  if (profile.status === "ready_with_run_config") {
    actions.push({
      kind: "provide_run_config",
      reason: "This profile can be used when the run plan supplies the provider configuration that daemon defaults do not provide."
    });
  }

  return actions;
}

function sanitizeEnvTemplateComment(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
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
