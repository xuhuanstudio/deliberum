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
  "events"
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
      idGenerator: dependencies.idGenerator ?? (() => randomUUID()),
      clock: dependencies.clock,
      env: dependencies.env ?? process.env,
      readJsonFile: dependencies.readJsonFile ?? readJsonFile
    });

    return {
      exitCode: 0,
      stdout: `${JSON.stringify(output, null, compactOutput ? 0 : 2)}\n`,
      stderr: "",
      output
    };
  } catch (error) {
    const output = {
      error: {
        name: error instanceof Error ? error.name : "CliError",
        detail: error instanceof Error ? error.message : String(error)
      }
    };

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
  idGenerator: () => string;
  clock?: () => string;
  env: Record<string, string | undefined>;
  readJsonFile: (filePath: string) => unknown;
};

async function executeCommand(parsedArgs: ParsedArgs, dependencies: ExecuteDependencies): Promise<unknown> {
  const [command, subcommand, ...restPositionals] = parsedArgs.positionals;
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
      objections: projection.objections
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
  const result = await runCli(args);
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
