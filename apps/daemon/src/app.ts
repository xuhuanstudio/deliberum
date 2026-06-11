import {
  acceptProposal,
  challengeProposal,
  closeSealedBatch,
  compileOutcome,
  createSession,
  openSealedBatch,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectQualityObligations,
  proposeExtraction,
  submitSealedContribution,
  type Clock,
  type IdGenerator
} from "@deliberum/core";
import type { JsonValue, SealedBatchPurpose, SealedBatchRevealPolicy } from "@deliberum/protocol";
import {
  DeliveryPlanner,
  InMemoryResourceBroker,
  type ResourceBroker
} from "@deliberum/resources";
import { InMemoryEventStore, type EventStore, type StoredEvent } from "@deliberum/storage";
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  AdapterRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  ProposalReviewGeneratorRegistry,
  type ExtractionGenerator,
  type FinalAuditGenerator,
  type FinalCandidateGenerator,
  type ProposalReviewGenerator,
  type RegisteredParticipantAdapter
} from "@deliberum/orchestrator";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "./config";
import { DaemonEventBus } from "./event-stream";
import { createLocalPresetRunRegistries } from "./local-preset";
import {
  createOpenAICompatibleRunRegistries,
  createOpenAICompatibleRuntimeEnv,
  type OpenAICompatibleProfileOptions
} from "./openai-compatible-profile";
import { DaemonRunOrchestrationService, type DaemonRunOrchestrationOptions } from "./run-orchestration";
import { handleRunRouteError, registerRunRoutes } from "./run-routes";
import { handleWebGETRouteError, registerWebGETRoutes } from "./webget-routes";
import {
  WebGETSessionStore,
  type WebGETClock,
  type WebGETSessionInput,
  type WebGETSessionPublicView,
  type WebGETTokenGenerator
} from "./webget-session-store";

export type DaemonAppOptions = {
  eventStore?: EventStore;
  eventBus?: DaemonEventBus;
  webgetStore?: WebGETSessionStore;
  webgetClock?: WebGETClock;
  webgetTokenGenerator?: WebGETTokenGenerator;
  webgetBaseUrl?: string;
  resourceBroker?: ResourceBroker;
  deliveryPlanner?: DeliveryPlanner;
  runStore?: DaemonRunOrchestrationOptions["runStore"];
  runAdapterRegistry?: DaemonRunOrchestrationOptions["adapterRegistry"];
  runExtractionGeneratorRegistry?: DaemonRunOrchestrationOptions["extractionGeneratorRegistry"];
  runProposalReviewGeneratorRegistry?: DaemonRunOrchestrationOptions["proposalReviewGeneratorRegistry"];
  runFinalCandidateGeneratorRegistry?: DaemonRunOrchestrationOptions["finalCandidateGeneratorRegistry"];
  runFinalAuditGeneratorRegistry?: DaemonRunOrchestrationOptions["finalAuditGeneratorRegistry"];
  runEnv?: DaemonRunOrchestrationOptions["env"];
  runExecutionClaimTtlMs?: DaemonRunOrchestrationOptions["executionClaimTtlMs"];
  runExecutionClaimOwnerIdGenerator?: DaemonRunOrchestrationOptions["executionClaimOwnerIdGenerator"];
  enableLocalPreset?: boolean;
  enableOpenAICompatibleProfile?: boolean;
  enableOpenAICompatibleExtraction?: boolean;
  enableOpenAICompatibleReview?: boolean;
  enableOpenAICompatibleFinalization?: boolean;
  openAICompatibleEnv?: Record<string, string | undefined>;
  openAICompatibleFetch?: OpenAICompatibleProfileOptions["fetch"];
  corsOrigins?: readonly string[];
  idGenerator?: IdGenerator;
  clock?: Clock;
  host?: string;
  port?: number;
};

export type DaemonApp = {
  app: Hono;
  eventStore: EventStore;
  eventBus: DaemonEventBus;
  webgetStore: WebGETSessionStore;
  resourceBroker: ResourceBroker;
  deliveryPlanner: DeliveryPlanner;
  runStore: NonNullable<DaemonRunOrchestrationOptions["runStore"]>;
  host: string;
  port: number;
  createWebGETSession: (input: WebGETSessionInput) => WebGETSessionPublicView;
};

export type SafeErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export const DAEMON_CORS_ORIGINS_ENV_VAR = "DELIBERUM_DAEMON_CORS_ORIGINS" as const;
export const DEFAULT_DAEMON_CORS_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173"
] as const;

class DaemonHttpError extends Error {
  readonly code: string;
  readonly status: 400;
  readonly safeMessage: string;

  constructor(code: string, safeMessage: string, status: 400 = 400) {
    super(safeMessage);
    this.name = "DaemonHttpError";
    this.code = code;
    this.status = status;
    this.safeMessage = safeMessage;
  }
}

export function createDaemonApp(options: DaemonAppOptions = {}): DaemonApp {
  const clock = options.clock;
  const eventStore = options.eventStore ?? new InMemoryEventStore({ clock });
  const eventBus = options.eventBus ?? new DaemonEventBus();
  const idGenerator = options.idGenerator ?? (() => randomUUID());
  const host = options.host ?? DEFAULT_DAEMON_HOST;
  const port = options.port ?? DEFAULT_DAEMON_PORT;
  const resourceBroker = options.resourceBroker ?? new InMemoryResourceBroker();
  const deliveryPlanner = options.deliveryPlanner ?? new DeliveryPlanner({ broker: resourceBroker });
  const corsOrigins = normalizeCorsOrigins(options.corsOrigins) ?? [
    ...DEFAULT_DAEMON_CORS_ORIGINS
  ];
  const localPresetRegistries = options.enableLocalPreset
    ? createLocalPresetRunRegistries()
    : undefined;
  const openAICompatibleRegistries = options.enableOpenAICompatibleProfile
    ? createOpenAICompatibleRunRegistries({
        env: options.openAICompatibleEnv,
        fetch: options.openAICompatibleFetch,
        enableExtraction: options.enableOpenAICompatibleExtraction === true,
        enableReview: options.enableOpenAICompatibleReview === true,
        enableFinalization: options.enableOpenAICompatibleFinalization === true
      })
    : undefined;
  const webgetStore =
    options.webgetStore ??
    new WebGETSessionStore({
      clock:
        options.webgetClock ??
        (() => (clock ? Date.parse(clock()) : Date.now())),
      tokenGenerator: options.webgetTokenGenerator,
      baseUrl: options.webgetBaseUrl ?? `http://${host}:${port}`
    });
  const runService = new DaemonRunOrchestrationService({
    eventStore,
    runStore: options.runStore,
    eventBus,
    idGenerator,
    clock,
    adapterRegistry:
      options.runAdapterRegistry ??
      mergeAdapterRegistries(
        localPresetRegistries?.adapterRegistry,
        openAICompatibleRegistries?.adapterRegistry
      ),
    extractionGeneratorRegistry:
      options.runExtractionGeneratorRegistry ??
      mergeExtractionGeneratorRegistries(
        localPresetRegistries?.extractionGeneratorRegistry,
        openAICompatibleRegistries?.extractionGeneratorRegistry
      ),
    proposalReviewGeneratorRegistry:
      options.runProposalReviewGeneratorRegistry ??
      mergeProposalReviewGeneratorRegistries(
        localPresetRegistries?.proposalReviewGeneratorRegistry,
        openAICompatibleRegistries?.proposalReviewGeneratorRegistry
      ),
    finalCandidateGeneratorRegistry:
      options.runFinalCandidateGeneratorRegistry ??
      mergeFinalCandidateGeneratorRegistries(
        localPresetRegistries?.finalCandidateGeneratorRegistry,
        openAICompatibleRegistries?.finalCandidateGeneratorRegistry
      ),
    finalAuditGeneratorRegistry:
      options.runFinalAuditGeneratorRegistry ??
      mergeFinalAuditGeneratorRegistries(
        localPresetRegistries?.finalAuditGeneratorRegistry,
        openAICompatibleRegistries?.finalAuditGeneratorRegistry
      ),
    env:
      options.runEnv ??
      (options.enableOpenAICompatibleProfile
        ? createOpenAICompatibleRuntimeEnv(options.openAICompatibleEnv)
        : undefined),
    executionClaimTtlMs: options.runExecutionClaimTtlMs,
    executionClaimOwnerIdGenerator: options.runExecutionClaimOwnerIdGenerator
  });
  const app = new Hono();
  const coreOptions = {
    eventStore,
    idGenerator,
    clock
  };

  app.onError((error, context) =>
    handleWebGETRouteError(context, error) ??
    handleRunRouteError(context, error) ??
    safeError(context, error)
  );

  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"]
    })
  );

  registerRunRoutes({
    app,
    runService,
    eventBus,
    eventStore
  });

  app.get("/health", (context) =>
    context.json({
      status: "ok",
      service: "deliberum-daemon",
      host,
      port
    })
  );

  app.get("/sessions/:sessionId/events/stream", (context) => {
    const sessionId = context.req.param("sessionId");

    return streamSSE(context, async (stream) => {
      const unsubscribe = eventBus.subscribe(sessionId, async (event) => {
        await stream.writeSSE({
          event: "event",
          id: event.id,
          data: JSON.stringify(event)
        });
      });

      stream.onAbort(unsubscribe);

      try {
        while (!stream.aborted) {
          await stream.sleep(1000);
        }
      } finally {
        unsubscribe();
      }
    });
  });

  app.get("/sessions/:sessionId/events", (context) =>
    context.json({
      events: eventStore.listEvents(context.req.param("sessionId"))
    })
  );

  app.get("/sessions/:sessionId/frontier", (context) =>
    context.json(
      projectCandidateFrontier({
        eventStore,
        sessionId: context.req.param("sessionId")
      })
    )
  );

  app.get("/sessions/:sessionId/objections", (context) => {
    const projection = projectAcceptedDeliberationObjects({
      eventStore,
      sessionId: context.req.param("sessionId")
    });

    return context.json({
      objections: projection.objections,
      projection: projection.projection
    });
  });

  app.get("/sessions/:sessionId/obligations", (context) =>
    context.json(
      projectQualityObligations({
        eventStore,
        sessionId: context.req.param("sessionId")
      })
    )
  );

  app.get("/sessions/:sessionId/final", (context) => {
    const sessionId = context.req.param("sessionId");
    const finalCandidateProposalEventId = normalizeOptionalQueryValue(
      context.req.query("finalCandidateProposalEventId")
    );
    const outcome = compileOutcome({
      eventStore,
      sessionId,
      finalCandidateProposalEventId
    });

    return context.json({
      sessionId,
      status: "compiled",
      draftStatus: outcome.draftStatus,
      outcome
    });
  });

  app.post("/sessions", async (context) => {
    const body = await readJsonObject(context);
    const result = createSession(
      {
        topicContract: body.topicContract
      },
      coreOptions
    );

    eventBus.publish(result.initialEvent);

    return context.json(
      {
        sessionId: result.sessionId,
        event: result.initialEvent
      },
      201
    );
  });

  app.post("/sessions/:sessionId/batches", async (context) => {
    const body = await readJsonObject(context);
    const result = openSealedBatch(
      {
        sessionId: context.req.param("sessionId"),
        purpose: body.purpose as SealedBatchPurpose,
        participantIds: body.participantIds as string[] | undefined,
        revealPolicy: body.revealPolicy as SealedBatchRevealPolicy | undefined,
        idempotencyKey: body.idempotencyKey as string | undefined
      },
      coreOptions
    );

    if (result.appended) {
      eventBus.publish(result.openedEvent);
    }

    return context.json(
      {
        batchId: result.batchId,
        event: result.openedEvent
      },
      201
    );
  });

  app.post("/sessions/:sessionId/batches/:batchId/contributions", async (context) => {
    const body = await readJsonObject(context);
    const result = submitSealedContribution(
      {
        sessionId: context.req.param("sessionId"),
        batchId: context.req.param("batchId"),
        authorId: body.authorId as string,
        visibility: "sealed",
        payload: body.payload as JsonValue,
        idempotencyKey: body.idempotencyKey as string | undefined
      },
      coreOptions
    );

    if (result.appended) {
      eventBus.publish(result.contributionEvent);
    }

    return context.json(
      {
        event: result.contributionEvent
      },
      201
    );
  });

  app.post("/sessions/:sessionId/batches/:batchId/close", async (context) => {
    const body = await readJsonObject(context);
    const result = closeSealedBatch(
      {
        sessionId: context.req.param("sessionId"),
        batchId: context.req.param("batchId"),
        idempotencyKey: body.idempotencyKey as string | undefined
      },
      coreOptions
    );

    if (result.appended) {
      eventBus.publish(result.revealedEvent);
    }

    return context.json(
      {
        event: result.revealedEvent
      },
      201
    );
  });

  app.post("/sessions/:sessionId/extractions", async (context) => {
    const body = await readJsonObject(context);
    const result = proposeExtraction(
      {
        sessionId: context.req.param("sessionId"),
        authorId: body.authorId as string,
        rationale: body.rationale as string,
        candidates: body.candidates as readonly unknown[] | undefined,
        claims: body.claims as readonly unknown[] | undefined,
        objections: body.objections as readonly unknown[] | undefined,
        evidenceNeeds: body.evidenceNeeds as readonly unknown[] | undefined,
        qualityObligations: body.qualityObligations as readonly unknown[] | undefined,
        idempotencyKey: body.idempotencyKey as string | undefined
      },
      coreOptions
    );

    if (result.appended) {
      eventBus.publish(result.proposalEvent);
    }

    return context.json(
      {
        proposalId: result.proposalId,
        event: result.proposalEvent
      },
      201
    );
  });

  app.post("/sessions/:sessionId/proposals/:proposalEventId/challenges", async (context) => {
    const body = await readJsonObject(context);
    const result = challengeProposal(
      {
        sessionId: context.req.param("sessionId"),
        targetProposalEventId: context.req.param("proposalEventId"),
        authorId: body.authorId as string,
        reason: body.reason as string,
        idempotencyKey: body.idempotencyKey as string | undefined
      },
      coreOptions
    );

    if (result.appended) {
      eventBus.publish(result.challengeEvent);
    }

    return context.json(
      {
        event: result.challengeEvent
      },
      201
    );
  });

  app.post("/sessions/:sessionId/proposals/:proposalEventId/acceptance", async (context) => {
    const body = await readJsonObject(context);
    const result = acceptProposal(
      {
        sessionId: context.req.param("sessionId"),
        targetProposalEventId: context.req.param("proposalEventId"),
        authorId: body.authorId as string,
        rationale: body.rationale as string,
        idempotencyKey: body.idempotencyKey as string | undefined
      },
      coreOptions
    );

    if (result.appended) {
      eventBus.publish(result.acceptanceEvent);
    }

    return context.json(
      {
        event: result.acceptanceEvent
      },
      201
    );
  });

  registerWebGETRoutes({
    app,
    eventStore,
    eventBus,
    webgetStore,
    resourceBroker,
    deliveryPlanner,
    idGenerator,
    clock
  });

  return {
    app,
    eventStore,
    eventBus,
    webgetStore,
    resourceBroker,
    deliveryPlanner,
    runStore: runService.runStore,
    host,
    port,
    createWebGETSession: (input) => webgetStore.createSession(input)
  };
}

function mergeAdapterRegistries(
  ...registries: unknown[]
): DaemonRunOrchestrationOptions["adapterRegistry"] | undefined {
  const adapters = registries.flatMap((registry) => {
    if (!isMergeableAdapterRegistry(registry)) {
      return [];
    }

    return registry.list().map((entry) => registry.require(entry.adapterId));
  });

  return adapters.length > 0 ? new AdapterRegistry(adapters) : undefined;
}

function isMergeableAdapterRegistry(
  value: unknown
): value is {
  require(adapterId: string): RegisteredParticipantAdapter;
  list(): Array<{ adapterId: string }>;
} {
  const candidate = value as { require?: unknown; list?: unknown } | null;

  return (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof candidate.require === "function" &&
    typeof candidate.list === "function"
  );
}

function mergeExtractionGeneratorRegistries(
  ...registries: unknown[]
): DaemonRunOrchestrationOptions["extractionGeneratorRegistry"] | undefined {
  const generators = registries.flatMap((registry) => {
    if (!isMergeableExtractionGeneratorRegistry(registry)) {
      return [];
    }

    return registry.list().map((entry) => registry.require(entry.generatorId));
  });

  return generators.length > 0 ? new ExtractionGeneratorRegistry(generators) : undefined;
}

function isMergeableExtractionGeneratorRegistry(
  value: unknown
): value is {
  require(generatorId: string): ExtractionGenerator;
  list(): Array<{ generatorId: string }>;
} {
  const candidate = value as { require?: unknown; list?: unknown } | null;

  return (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof candidate.require === "function" &&
    typeof candidate.list === "function"
  );
}

function mergeProposalReviewGeneratorRegistries(
  ...registries: unknown[]
): DaemonRunOrchestrationOptions["proposalReviewGeneratorRegistry"] | undefined {
  const reviewers = registries.flatMap((registry) => {
    if (!isMergeableProposalReviewGeneratorRegistry(registry)) {
      return [];
    }

    return registry.list().map((entry) => registry.require(entry.reviewerId));
  });

  return reviewers.length > 0 ? new ProposalReviewGeneratorRegistry(reviewers) : undefined;
}

function isMergeableProposalReviewGeneratorRegistry(
  value: unknown
): value is {
  require(reviewerId: string): ProposalReviewGenerator;
  list(): Array<{ reviewerId: string }>;
} {
  const candidate = value as { require?: unknown; list?: unknown } | null;

  return (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof candidate.require === "function" &&
    typeof candidate.list === "function"
  );
}

function mergeFinalCandidateGeneratorRegistries(
  ...registries: unknown[]
): DaemonRunOrchestrationOptions["finalCandidateGeneratorRegistry"] | undefined {
  const generators = registries.flatMap((registry) => {
    if (!isMergeableFinalCandidateGeneratorRegistry(registry)) {
      return [];
    }

    return registry.list().map((entry) => registry.require(entry.generatorId));
  });

  return generators.length > 0 ? new FinalCandidateGeneratorRegistry(generators) : undefined;
}

function isMergeableFinalCandidateGeneratorRegistry(
  value: unknown
): value is {
  require(generatorId: string): FinalCandidateGenerator;
  list(): Array<{ generatorId: string }>;
} {
  const candidate = value as { require?: unknown; list?: unknown } | null;

  return (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof candidate.require === "function" &&
    typeof candidate.list === "function"
  );
}

function mergeFinalAuditGeneratorRegistries(
  ...registries: unknown[]
): DaemonRunOrchestrationOptions["finalAuditGeneratorRegistry"] | undefined {
  const auditors = registries.flatMap((registry) => {
    if (!isMergeableFinalAuditGeneratorRegistry(registry)) {
      return [];
    }

    return registry.list().map((entry) => registry.require(entry.auditorId));
  });

  return auditors.length > 0 ? new FinalAuditGeneratorRegistry(auditors) : undefined;
}

function isMergeableFinalAuditGeneratorRegistry(
  value: unknown
): value is {
  require(auditorId: string): FinalAuditGenerator;
  list(): Array<{ auditorId: string }>;
} {
  const candidate = value as { require?: unknown; list?: unknown } | null;

  return (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof candidate.require === "function" &&
    typeof candidate.list === "function"
  );
}

async function readJsonObject(context: Context): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await context.req.json();
  } catch {
    throw new DaemonHttpError("invalid_json", "Request body must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DaemonHttpError("invalid_json", "Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function parseDaemonCorsOriginsFromEnv(
  env: Record<string, string | undefined>
): string[] | undefined {
  const rawValue = env[DAEMON_CORS_ORIGINS_ENV_VAR]?.trim();

  if (!rawValue) {
    return undefined;
  }

  return normalizeCorsOrigins(rawValue.split(","));
}

function normalizeCorsOrigins(values: readonly string[] | undefined): string[] | undefined {
  const origins = values
    ?.map((value) => normalizeCorsOrigin(value))
    .filter((value): value is string => value !== undefined);

  return origins && origins.length > 0 ? [...new Set(origins)] : undefined;
}

function normalizeCorsOrigin(value: string): string | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Daemon CORS origins must be valid URLs.");
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error("Daemon CORS origins must use http or https.");
  }

  if (!isLocalHost(parsed.hostname)) {
    throw new Error("Daemon CORS origins must be local host origins.");
  }

  return parsed.origin;
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function normalizeOptionalQueryValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function safeError(context: Context, error: Error): Response {
  if (error instanceof DaemonHttpError) {
    return context.json(createErrorResponse(error.code, error.safeMessage), error.status);
  }

  return context.json(
    createErrorResponse("request_failed", "Request could not be processed."),
    400
  );
}

function createErrorResponse(code: string, message: string): SafeErrorResponse {
  return {
    error: {
      code,
      message
    }
  };
}
