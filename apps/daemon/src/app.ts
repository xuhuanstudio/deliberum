import {
  acceptProposal,
  auditFinalCandidate,
  challengeProposal,
  closeSealedBatch,
  compileOutcome,
  createSession,
  challengeProcessProposal,
  decideProcessProposal,
  openSealedBatch,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectProcessProposalStates,
  projectQualityObligations,
  proposeFinalCandidate,
  proposeProcessProposal,
  proposeExtraction,
  submitSealedContribution,
  TOPIC_CONTRACT_PUBLISHED_EVENT_TYPE,
  type Clock,
  type IdGenerator
} from "@deliberum/core";
import type {
  JsonValue,
  ProcessProposalDecisionStatus,
  SealedBatchPurpose,
  SealedBatchRevealPolicy
} from "@deliberum/protocol";
import {
  DeliveryPlanner,
  InMemoryResourceBroker,
  type ResourceBroker
} from "@deliberum/resources";
import { InMemoryEventStore, type EventStore, type StoredEvent } from "@deliberum/storage";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  AdapterRegistry,
  CandidateRepairGeneratorRegistry,
  EvidenceCheckGeneratorRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  ProposalReviewGeneratorRegistry,
  type CandidateRepairGenerator,
  type EvidenceCheckGenerator,
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
import {
  createHttpTemplateRunRegistries,
  createHttpTemplateRuntimeEnv,
  type HttpTemplateProfileOptions
} from "./http-template-profile";
import {
  createMcpToolRunRegistries,
  type McpToolProfileOptions
} from "./mcp-tool-profile";
import {
  createOperationAuditAuthorization,
  createOperationAuditRecord,
  InMemoryOperationAuditLog,
  parseOperationAuditLimit,
  type OperationAuditLog
} from "./operation-audit-log";
import {
  handleResourceDeliveryRouteError,
  registerResourceDeliveryRoutes
} from "./resource-delivery-routes";
import {
  handleResourceAccessRouteError,
  registerResourceAccessRoutes
} from "./resource-access-routes";
import {
  RESOURCE_ACCESS_DEFAULT_TTL_MS,
  RESOURCE_ACCESS_MAX_TTL_MS,
  ResourceAccessGrantStore,
  classifyResourceAccessBaseUrl,
  type ResourceAccessGrantStoreLike,
  type ResourceAccessClock,
  type ResourceAccessTokenGenerator
} from "./resource-access-store";
import { buildRuntimeProfilesProjection } from "./runtime-profiles";
import { DaemonRunOrchestrationService, type DaemonRunOrchestrationOptions } from "./run-orchestration";
import { handleRunRouteError, registerRunRoutes } from "./run-routes";
import { buildSessionResourcesProjection } from "./session-resources";
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
  resourceAccessStore?: ResourceAccessGrantStoreLike;
  resourceAccessClock?: ResourceAccessClock;
  resourceAccessTokenGenerator?: ResourceAccessTokenGenerator;
  resourceAccessBaseUrl?: string;
  resourceAccessTtlMs?: number;
  resourceBroker?: ResourceBroker;
  deliveryPlanner?: DeliveryPlanner;
  runStore?: DaemonRunOrchestrationOptions["runStore"];
  runAdapterRegistry?: DaemonRunOrchestrationOptions["adapterRegistry"];
  runExtractionGeneratorRegistry?: DaemonRunOrchestrationOptions["extractionGeneratorRegistry"];
  runCandidateRepairGeneratorRegistry?: DaemonRunOrchestrationOptions["candidateRepairGeneratorRegistry"];
  runEvidenceCheckGeneratorRegistry?: DaemonRunOrchestrationOptions["evidenceCheckGeneratorRegistry"];
  runProposalReviewGeneratorRegistry?: DaemonRunOrchestrationOptions["proposalReviewGeneratorRegistry"];
  runFinalCandidateGeneratorRegistry?: DaemonRunOrchestrationOptions["finalCandidateGeneratorRegistry"];
  runFinalAuditGeneratorRegistry?: DaemonRunOrchestrationOptions["finalAuditGeneratorRegistry"];
  runEnv?: DaemonRunOrchestrationOptions["env"];
  runExecutionClaimTtlMs?: DaemonRunOrchestrationOptions["executionClaimTtlMs"];
  runExecutionClaimOwnerIdGenerator?: DaemonRunOrchestrationOptions["executionClaimOwnerIdGenerator"];
  operationAuditLog?: OperationAuditLog;
  operationAuditClock?: Clock;
  operationAuditIdGenerator?: IdGenerator;
  operationAuditMaxEntries?: number;
  enableLocalPreset?: boolean;
  enableOpenAICompatibleProfile?: boolean;
  enableOpenAICompatibleExtraction?: boolean;
  enableOpenAICompatibleReview?: boolean;
  enableOpenAICompatibleFinalization?: boolean;
  openAICompatibleEnv?: Record<string, string | undefined>;
  openAICompatibleFetch?: OpenAICompatibleProfileOptions["fetch"];
  enableHttpTemplateProfile?: boolean;
  httpTemplateEnv?: Record<string, string | undefined>;
  httpTemplateFetch?: HttpTemplateProfileOptions["fetch"];
  enableMcpToolProfile?: boolean;
  mcpToolEnv?: Record<string, string | undefined>;
  mcpToolFetch?: McpToolProfileOptions["fetch"];
  daemonAuthToken?: string;
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
  resourceAccessStore: ResourceAccessGrantStoreLike;
  resourceBroker: ResourceBroker;
  deliveryPlanner: DeliveryPlanner;
  operationAuditLog: OperationAuditLog;
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

export type ResourceAccessPostureResponse = {
  baseUrl: {
    configured: boolean;
    exposure: "localhost" | "lan" | "public";
    routePattern: "/resource-access/:accessId";
  };
  ttl: {
    configured: boolean;
    defaultTtlMs: number;
    maxTtlMs: number;
  };
  grantStore: {
    mode: "process_memory" | "configured_store";
    restartContinuity: "lost_on_restart" | "depends_on_configured_store";
  };
  safety: string[];
};

export type DaemonDeploymentPostureResponse = {
  binding: {
    host: string;
    port: number;
    exposure: "localhost" | "lan" | "public";
    defaultLocalhost: boolean;
  };
  controlPlane: {
    auth: "disabled" | "daemon_bearer";
    protected: boolean;
  };
  cors: {
    originCount: number;
    defaultLocalDevelopmentOrigins: boolean;
  };
  persistence: {
    eventLedger: "process_memory" | "configured_store";
    runMetadata: "process_memory" | "configured_store";
    resourceBroker: "process_memory" | "configured_store";
    resourceAccessGrants: "process_memory" | "configured_store";
    operationAudit: "process_memory" | "configured_store";
    productionMultiWriterCoordination: false;
  };
  resourceAccess: {
    baseUrlConfigured: boolean;
    baseUrlExposure: "localhost" | "lan" | "public";
    grantStoreRestartContinuity: "lost_on_restart" | "depends_on_configured_store";
  };
  productionReadiness: {
    status: "local_only" | "preproduction_remote_hardened" | "not_production_ready";
    readyForProduction: false;
    blockers: string[];
  };
  safety: string[];
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
  const daemonAuthToken = normalizeDaemonAuthToken(
    options.daemonAuthToken,
    "daemonAuthToken"
  );
  const resourceBroker = options.resourceBroker ?? new InMemoryResourceBroker();
  const deliveryPlanner = options.deliveryPlanner ?? new DeliveryPlanner({ broker: resourceBroker });
  const resourceAccessBaseUrl =
    options.resourceAccessBaseUrl ?? `http://${host}:${port}`;
  const resourceAccessStore =
    options.resourceAccessStore ??
    new ResourceAccessGrantStore({
      clock:
        options.resourceAccessClock ??
        (() => (clock ? Date.parse(clock()) : Date.now())),
      tokenGenerator: options.resourceAccessTokenGenerator,
      defaultTtlMs: options.resourceAccessTtlMs ?? RESOURCE_ACCESS_DEFAULT_TTL_MS
    });
  const corsOrigins = normalizeCorsOrigins(options.corsOrigins) ?? [
    ...DEFAULT_DAEMON_CORS_ORIGINS
  ];
  const operationAuditLog =
    options.operationAuditLog ??
    new InMemoryOperationAuditLog({
      idGenerator: options.operationAuditIdGenerator,
      clock: options.operationAuditClock ?? clock,
      maxEntries: options.operationAuditMaxEntries
    });
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
  const httpTemplateRegistries = options.enableHttpTemplateProfile
    ? createHttpTemplateRunRegistries({
        env: options.httpTemplateEnv,
        fetch: options.httpTemplateFetch
      })
    : undefined;
  const mcpToolRegistries = options.enableMcpToolProfile
    ? createMcpToolRunRegistries({
        env: options.mcpToolEnv,
        fetch: options.mcpToolFetch
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
        openAICompatibleRegistries?.adapterRegistry,
        httpTemplateRegistries?.adapterRegistry,
        mcpToolRegistries?.adapterRegistry
      ),
    extractionGeneratorRegistry:
      options.runExtractionGeneratorRegistry ??
      mergeExtractionGeneratorRegistries(
        localPresetRegistries?.extractionGeneratorRegistry,
        openAICompatibleRegistries?.extractionGeneratorRegistry
      ),
    candidateRepairGeneratorRegistry:
      options.runCandidateRepairGeneratorRegistry ??
      mergeCandidateRepairGeneratorRegistries(
        localPresetRegistries?.candidateRepairGeneratorRegistry
      ),
    evidenceCheckGeneratorRegistry:
      options.runEvidenceCheckGeneratorRegistry ??
      mergeEvidenceCheckGeneratorRegistries(
        localPresetRegistries?.evidenceCheckGeneratorRegistry
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
      mergeRuntimeEnvs(
        options.enableOpenAICompatibleProfile
          ? createOpenAICompatibleRuntimeEnv(options.openAICompatibleEnv)
          : undefined,
        options.enableHttpTemplateProfile
          ? createHttpTemplateRuntimeEnv(options.httpTemplateEnv)
          : undefined
      ),
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
    handleResourceAccessRouteError(context, error) ??
    handleWebGETRouteError(context, error) ??
    handleResourceDeliveryRouteError(context, error) ??
    handleRunRouteError(context, error) ??
    safeError(context, error)
  );

  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.use("*", async (context, next) => {
    await auditDaemonOperation({
      context,
      operationAuditLog,
      next
    });
  });

  app.use("*", async (context, next) => {
    const authError = authenticateDaemonRequest(context, daemonAuthToken);

    if (authError) {
      return authError;
    }

    await next();
  });

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

  app.get("/sessions/:sessionId/process-proposals", (context) =>
    noStoreJson(
      context,
      projectProcessProposalStates({
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

  app.post("/sessions/:sessionId/final-candidates", async (context) => {
    const body = await readJsonObject(context);
    const result = proposeFinalCandidate(
      {
        sessionId: context.req.param("sessionId"),
        authorId: body.authorId as string,
        candidateIds: body.candidateIds as readonly string[],
        recommendation: body.recommendation as string,
        applicabilityConditions: body.applicabilityConditions as readonly string[] | undefined,
        rationale: body.rationale as string,
        limitations: body.limitations as readonly string[] | undefined,
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
        event: result.proposalEvent,
        appended: result.appended
      },
      201
    );
  });

  app.post(
    "/sessions/:sessionId/final-candidates/:proposalEventId/audits",
    async (context) => {
      const body = await readJsonObject(context);
      const result = auditFinalCandidate(
        {
          sessionId: context.req.param("sessionId"),
          targetFinalCandidateProposalEventId: context.req.param("proposalEventId"),
          authorId: body.authorId as string,
          findings: body.findings as readonly string[] | undefined,
          risks: body.risks as readonly string[] | undefined,
          unresolvedObjectionIds: body.unresolvedObjectionIds as readonly string[] | undefined,
          qualityObligationIds: body.qualityObligationIds as readonly string[] | undefined,
          evidenceNeedIds: body.evidenceNeedIds as readonly string[] | undefined,
          omissions: body.omissions as readonly string[] | undefined,
          compressionProblems: body.compressionProblems as readonly string[] | undefined,
          limitations: body.limitations as readonly string[] | undefined,
          continuationSuggestions: body.continuationSuggestions as readonly string[] | undefined,
          idempotencyKey: body.idempotencyKey as string | undefined
        },
        coreOptions
      );

      if (result.appended) {
        eventBus.publish(result.auditEvent);
      }

      return context.json(
        {
          event: result.auditEvent,
          appended: result.appended
        },
        201
      );
    }
  );

  app.get("/sessions/:sessionId/resources", (context) =>
    noStoreJson(
      context,
      buildSessionResourcesProjection({
        eventStore,
        runStore: runService.runStore,
        resourceBroker,
        sessionId: context.req.param("sessionId")
      })
    )
  );

  registerResourceDeliveryRoutes({
    app,
    eventStore,
    eventBus,
    runStore: runService.runStore,
    resourceBroker,
    deliveryPlanner,
    resourceAccessStore,
    resourceAccessBaseUrl,
    resourceAccessTtlMs: options.resourceAccessTtlMs,
    idGenerator,
    clock
  });

  app.get("/runtime/profiles", (context) =>
    noStoreJson(
      context,
      buildRuntimeProfilesProjection({
        enableLocalPreset: options.enableLocalPreset === true,
        enableOpenAICompatibleProfile: options.enableOpenAICompatibleProfile === true,
        enableOpenAICompatibleExtraction:
          options.enableOpenAICompatibleExtraction === true,
        enableOpenAICompatibleReview: options.enableOpenAICompatibleReview === true,
        enableOpenAICompatibleFinalization:
          options.enableOpenAICompatibleFinalization === true,
        openAICompatibleEnv: options.openAICompatibleEnv,
        enableHttpTemplateProfile: options.enableHttpTemplateProfile === true,
        httpTemplateEnv: options.httpTemplateEnv,
        enableMcpToolProfile: options.enableMcpToolProfile === true,
        mcpToolEnv: options.mcpToolEnv
      })
    )
  );

  app.get("/runtime/resource-access", (context) =>
    noStoreJson(
      context,
      buildResourceAccessPosture({
        resourceAccessBaseUrl,
        resourceAccessBaseUrlConfigured: options.resourceAccessBaseUrl !== undefined,
        resourceAccessTtlMs: options.resourceAccessTtlMs,
        resourceAccessStoreConfigured: options.resourceAccessStore !== undefined
      })
    )
  );

  app.get("/runtime/deployment-posture", (context) =>
    noStoreJson(
      context,
      buildDeploymentPosture({
        host,
        port,
        daemonAuthConfigured: daemonAuthToken !== undefined,
        corsOrigins,
        eventStoreConfigured: options.eventStore !== undefined,
        runStoreConfigured: options.runStore !== undefined,
        resourceBrokerConfigured: options.resourceBroker !== undefined,
        resourceAccessStoreConfigured: options.resourceAccessStore !== undefined,
        operationAuditLogConfigured: options.operationAuditLog !== undefined,
        resourceAccessBaseUrl,
        resourceAccessBaseUrlConfigured: options.resourceAccessBaseUrl !== undefined
      })
    )
  );

  app.get("/runtime/operation-audit", (context) => {
    let limit: number;

    try {
      limit = parseOperationAuditLimit(context.req.query("limit"));
    } catch (error) {
      return noStoreJson(
        context,
        createErrorResponse(
          "operation_audit_request_invalid",
          error instanceof Error ? error.message : "Operation audit request is invalid."
        ),
        400
      );
    }

    return noStoreJson(context, {
      events: operationAuditLog.list({ limit })
    });
  });

  app.get("/sessions", (context) => noStoreJson(context, listSessionCatalog(eventStore)));

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

  app.post("/sessions/:sessionId/process-proposals", async (context) => {
    const body = await readJsonObject(context);
    const result = proposeProcessProposal(
      {
        sessionId: context.req.param("sessionId"),
        authorId: body.authorId as string,
        proposal: body.proposal,
        basedOnEventIds: body.basedOnEventIds as readonly string[] | undefined,
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

  app.post(
    "/sessions/:sessionId/process-proposals/:proposalEventId/challenges",
    async (context) => {
      const body = await readJsonObject(context);
      const result = challengeProcessProposal(
        {
          sessionId: context.req.param("sessionId"),
          targetProcessProposalEventId: context.req.param("proposalEventId"),
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
    }
  );

  app.post(
    "/sessions/:sessionId/process-proposals/:proposalEventId/decisions",
    async (context) => {
      const body = await readJsonObject(context);
      const result = decideProcessProposal(
        {
          sessionId: context.req.param("sessionId"),
          targetProcessProposalEventId: context.req.param("proposalEventId"),
          authorId: body.authorId as string,
          status: body.status as ProcessProposalDecisionStatus,
          rationale: body.rationale as string,
          idempotencyKey: body.idempotencyKey as string | undefined
        },
        coreOptions
      );

      if (result.appended) {
        eventBus.publish(result.decisionEvent);
      }

      return context.json(
        {
          event: result.decisionEvent
        },
        201
      );
    }
  );

  registerWebGETRoutes({
    app,
    eventStore,
    eventBus,
    webgetStore,
    resourceBroker,
    deliveryPlanner,
    resourceAccessStore,
    resourceAccessBaseUrl,
    resourceAccessTtlMs: options.resourceAccessTtlMs,
    idGenerator,
    clock
  });

  registerResourceAccessRoutes({
    app,
    eventStore,
    eventBus,
    resourceAccessStore,
    resourceBroker,
    idGenerator,
    clock
  });

  return {
    app,
    eventStore,
    eventBus,
    webgetStore,
    resourceAccessStore,
    resourceBroker,
    deliveryPlanner,
    operationAuditLog,
    runStore: runService.runStore,
    host,
    port,
    createWebGETSession: (input) => webgetStore.createSession(input)
  };
}

export function normalizeDaemonAuthToken(
  token: string | undefined,
  name: string
): string | undefined {
  const trimmed = token?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (!/^\S{16,}$/.test(trimmed)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be at least 16 non-whitespace characters.`
    );
  }

  return trimmed;
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

function mergeRuntimeEnvs(
  ...envs: Array<Record<string, string | undefined> | undefined>
): Record<string, string | undefined> | undefined {
  const merged = Object.assign({}, ...envs.filter(Boolean));

  return Object.keys(merged).length > 0 ? merged : undefined;
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

function mergeCandidateRepairGeneratorRegistries(
  ...registries: unknown[]
): DaemonRunOrchestrationOptions["candidateRepairGeneratorRegistry"] | undefined {
  const generators = registries.flatMap((registry) => {
    if (!isMergeableCandidateRepairGeneratorRegistry(registry)) {
      return [];
    }

    return registry.list().map((entry) => registry.require(entry.generatorId));
  });

  return generators.length > 0 ? new CandidateRepairGeneratorRegistry(generators) : undefined;
}

function isMergeableCandidateRepairGeneratorRegistry(
  value: unknown
): value is {
  require(generatorId: string): CandidateRepairGenerator;
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

function mergeEvidenceCheckGeneratorRegistries(
  ...registries: unknown[]
): DaemonRunOrchestrationOptions["evidenceCheckGeneratorRegistry"] | undefined {
  const generators = registries.flatMap((registry) => {
    if (!isMergeableEvidenceCheckGeneratorRegistry(registry)) {
      return [];
    }

    return registry.list().map((entry) => registry.require(entry.generatorId));
  });

  return generators.length > 0 ? new EvidenceCheckGeneratorRegistry(generators) : undefined;
}

function isMergeableEvidenceCheckGeneratorRegistry(
  value: unknown
): value is {
  require(generatorId: string): EvidenceCheckGenerator;
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

function listSessionCatalog(eventStore: EventStore): {
  sessions: Array<{
    sessionId: string;
    topicContractEventId: string | null;
    title: string | null;
    topic: string | null;
    createdAt: string | null;
    recordedAt: string | null;
    latestEventRecordedAt: string | null;
    eventCount: number;
  }>;
} {
  const sessions = eventStore.listSessionIds().map((sessionId) => {
    const events = eventStore.listEvents(sessionId);
    const topicContractEvent =
      events.find((event) => event.type === TOPIC_CONTRACT_PUBLISHED_EVENT_TYPE) ?? null;
    const topicContract =
      typeof topicContractEvent?.payload === "object" &&
      topicContractEvent.payload !== null &&
      !Array.isArray(topicContractEvent.payload)
        ? (topicContractEvent.payload as Record<string, unknown>)
        : {};
    const latestEvent = events.at(-1) ?? null;

    return {
      sessionId,
      topicContractEventId: topicContractEvent?.id ?? null,
      title: stringRecordValue(topicContract, "title"),
      topic: stringRecordValue(topicContract, "topic"),
      createdAt: topicContractEvent?.createdAt ?? null,
      recordedAt: topicContractEvent?.recordedAt ?? null,
      latestEventRecordedAt: latestEvent?.recordedAt ?? null,
      eventCount: events.length
    };
  });

  sessions.sort((left, right) => {
    const byLatest = (right.latestEventRecordedAt ?? "").localeCompare(
      left.latestEventRecordedAt ?? ""
    );

    return byLatest !== 0 ? byLatest : left.sessionId.localeCompare(right.sessionId);
  });

  return { sessions };
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function noStoreJson(context: Context, payload: unknown, status: 200 | 201 | 400 = 200): Response {
  const response = context.json(payload, status);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");

  return response;
}

function buildResourceAccessPosture(options: {
  resourceAccessBaseUrl: string;
  resourceAccessBaseUrlConfigured: boolean;
  resourceAccessTtlMs?: number;
  resourceAccessStoreConfigured: boolean;
}): ResourceAccessPostureResponse {
  return {
    baseUrl: {
      configured: options.resourceAccessBaseUrlConfigured,
      exposure: classifyResourceAccessBaseUrl(options.resourceAccessBaseUrl),
      routePattern: "/resource-access/:accessId"
    },
    ttl: {
      configured: options.resourceAccessTtlMs !== undefined,
      defaultTtlMs: options.resourceAccessTtlMs ?? RESOURCE_ACCESS_DEFAULT_TTL_MS,
      maxTtlMs: RESOURCE_ACCESS_MAX_TTL_MS
    },
    grantStore: options.resourceAccessStoreConfigured
      ? {
          mode: "configured_store",
          restartContinuity: "depends_on_configured_store"
        }
      : {
          mode: "process_memory",
          restartContinuity: "lost_on_restart"
        },
    safety: [
      "This posture is derived from daemon configuration only.",
      "It does not expose resource access ids, bearer tokens, source URLs, redirected targets, hosted content, or resource payloads.",
      "Resource access grants remain scoped, revocable, short-lived delivery-layer material and are not semantic ledger authority."
    ]
  };
}

function buildDeploymentPosture(options: {
  host: string;
  port: number;
  daemonAuthConfigured: boolean;
  corsOrigins: readonly string[];
  eventStoreConfigured: boolean;
  runStoreConfigured: boolean;
  resourceBrokerConfigured: boolean;
  resourceAccessStoreConfigured: boolean;
  operationAuditLogConfigured: boolean;
  resourceAccessBaseUrl: string;
  resourceAccessBaseUrlConfigured: boolean;
}): DaemonDeploymentPostureResponse {
  const bindingExposure = classifyDaemonBindHost(options.host);
  const resourceAccessBaseUrlExposure = classifyResourceAccessBaseUrl(
    options.resourceAccessBaseUrl
  );
  const blockers = createDeploymentPostureBlockers({
    bindingExposure,
    daemonAuthConfigured: options.daemonAuthConfigured,
    eventStoreConfigured: options.eventStoreConfigured,
    runStoreConfigured: options.runStoreConfigured,
    resourceBrokerConfigured: options.resourceBrokerConfigured,
    resourceAccessStoreConfigured: options.resourceAccessStoreConfigured,
    operationAuditLogConfigured: options.operationAuditLogConfigured
  });

  return {
    binding: {
      host: options.host,
      port: options.port,
      exposure: bindingExposure,
      defaultLocalhost: options.host === DEFAULT_DAEMON_HOST
    },
    controlPlane: {
      auth: options.daemonAuthConfigured ? "daemon_bearer" : "disabled",
      protected: options.daemonAuthConfigured
    },
    cors: {
      originCount: options.corsOrigins.length,
      defaultLocalDevelopmentOrigins: arraysEqual(
        [...options.corsOrigins],
        [...DEFAULT_DAEMON_CORS_ORIGINS]
      )
    },
    persistence: {
      eventLedger: configuredStore(options.eventStoreConfigured),
      runMetadata: configuredStore(options.runStoreConfigured),
      resourceBroker: configuredStore(options.resourceBrokerConfigured),
      resourceAccessGrants: configuredStore(options.resourceAccessStoreConfigured),
      operationAudit: configuredStore(options.operationAuditLogConfigured),
      productionMultiWriterCoordination: false
    },
    resourceAccess: {
      baseUrlConfigured: options.resourceAccessBaseUrlConfigured,
      baseUrlExposure: resourceAccessBaseUrlExposure,
      grantStoreRestartContinuity: options.resourceAccessStoreConfigured
        ? "depends_on_configured_store"
        : "lost_on_restart"
    },
    productionReadiness: {
      status:
        bindingExposure === "localhost"
          ? "local_only"
          : options.daemonAuthConfigured
            ? "preproduction_remote_hardened"
            : "not_production_ready",
      readyForProduction: false,
      blockers
    },
    safety: [
      "This posture is derived from safe daemon configuration state only.",
      "It does not expose bearer tokens, CORS origin values, resource access ids, resource URLs, provider secrets, request bodies, or payloads.",
      "A non-local binding or public resource access base URL is not production authorization.",
      "Production deployment still requires an external authorization layer, multi-user policy, and production-grade multi-writer coordination."
    ]
  };
}

function createDeploymentPostureBlockers(input: {
  bindingExposure: "localhost" | "lan" | "public";
  daemonAuthConfigured: boolean;
  eventStoreConfigured: boolean;
  runStoreConfigured: boolean;
  resourceBrokerConfigured: boolean;
  resourceAccessStoreConfigured: boolean;
  operationAuditLogConfigured: boolean;
}): string[] {
  const blockers = [
    "Production multi-user authorization is not implemented by the daemon.",
    "Production multi-writer coordination is not implemented for durable stores."
  ];

  if (input.bindingExposure !== "localhost" && !input.daemonAuthConfigured) {
    blockers.push("Non-local daemon bindings should not be exposed without daemon bearer auth.");
  }

  if (
    !input.eventStoreConfigured ||
    !input.runStoreConfigured ||
    !input.resourceBrokerConfigured ||
    !input.resourceAccessStoreConfigured ||
    !input.operationAuditLogConfigured
  ) {
    blockers.push("One or more daemon stores are process-memory only and lose continuity on restart.");
  }

  return blockers;
}

function classifyDaemonBindHost(host: string): "localhost" | "lan" | "public" {
  const normalized = host.trim().toLowerCase();

  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("127.")
  ) {
    return "localhost";
  }

  if (
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("169.254.")
  ) {
    return "lan";
  }

  return "public";
}

function configuredStore(configured: boolean): "process_memory" | "configured_store" {
  return configured ? "configured_store" : "process_memory";
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function authenticateDaemonRequest(
  context: Context,
  expectedToken: string | undefined
): Response | undefined {
  if (!expectedToken || isDaemonAuthExemptRequest(context)) {
    return undefined;
  }

  const token =
    parseBearerAuthorizationHeader(context.req.header("Authorization")) ??
    parseDaemonAuthStreamQueryToken(context);

  if (token && compareDaemonAuthToken(token, expectedToken)) {
    return undefined;
  }

  const response = context.json(createErrorResponse(
    "daemon_auth_required",
    "Daemon authentication is required."
  ), 401);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("WWW-Authenticate", 'Bearer realm="deliberum-daemon"');

  return response;
}

function isDaemonAuthExemptRequest(context: Context): boolean {
  const method = context.req.method.toUpperCase();
  const path = context.req.path;

  if (method === "OPTIONS" || path === "/health") {
    return true;
  }

  if (path.startsWith("/webget/")) {
    return true;
  }

  return method === "GET" && path.startsWith("/resource-access/");
}

function parseBearerAuthorizationHeader(value: string | undefined): string | undefined {
  const match = value?.match(/^Bearer\s+(\S+)$/i);

  return match?.[1];
}

function parseDaemonAuthStreamQueryToken(context: Context): string | undefined {
  if (context.req.method.toUpperCase() !== "GET") {
    return undefined;
  }

  const path = context.req.path;
  if (
    !/^\/runs\/[^/]+\/events\/stream$/.test(path) &&
    !/^\/sessions\/[^/]+\/events\/stream$/.test(path)
  ) {
    return undefined;
  }

  const token = context.req.query("daemonAuthToken")?.trim();

  return token && token.length > 0 ? token : undefined;
}

function compareDaemonAuthToken(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(candidateHash, expectedHash);
}

async function auditDaemonOperation(input: {
  context: Context;
  operationAuditLog: OperationAuditLog;
  next: () => Promise<void>;
}): Promise<void> {
  const method = input.context.req.method.toUpperCase();
  const path = input.context.req.path;
  const authorization = createOperationAuditAuthorization({
    method,
    path,
    authorizationHeader: input.context.req.header("Authorization"),
    daemonAuthTokenQuery: input.context.req.query("daemonAuthToken")
  });

  try {
    await input.next();
  } catch (error) {
    recordOperationAuditEvent(input.operationAuditLog, {
      method,
      path,
      statusCode: classifyThrownOperationStatus(path, error),
      authorization
    });
    throw error;
  }

  recordOperationAuditEvent(input.operationAuditLog, {
    method,
    path,
    statusCode: input.context.res.status || 200,
    authorization
  });
}

function classifyThrownOperationStatus(path: string, error: unknown): number {
  if (error instanceof DaemonHttpError) {
    return error.status;
  }

  if (
    path.startsWith("/resource-access/") ||
    path.startsWith("/webget/") ||
    isResourceDeliveryPath(path) ||
    path === "/runs" ||
    path.startsWith("/runs/")
  ) {
    return 400;
  }

  return 500;
}

function isResourceDeliveryPath(path: string): boolean {
  return /^\/sessions\/[^/]+\/resources\/[^/]+\/deliveries$/.test(path);
}

function recordOperationAuditEvent(
  operationAuditLog: OperationAuditLog,
  input: Parameters<typeof createOperationAuditRecord>[0]
): void {
  const record = createOperationAuditRecord(input);

  if (record) {
    operationAuditLog.record(record);
  }
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
