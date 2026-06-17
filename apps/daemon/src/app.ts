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
  EventEnvelope,
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
import {
  InMemoryEventStore,
  validateEventIntegrityChain,
  type EventStore,
  type StoredEvent
} from "@deliberum/storage";
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
  OPENAI_COMPATIBLE_ADAPTER_ID,
  createOpenAICompatibleRunRegistries,
  createOpenAICompatibleRuntimeEnv,
  type OpenAICompatibleProfileOptions
} from "./openai-compatible-profile";
import {
  describeOpenAICompatibleVerificationError,
  verifyOpenAICompatibleSetup
} from "./openai-compatible-setup-verification";
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
  parseResourceAccessSigningSecret,
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
import {
  clearOpenAICompatibleRoleModelDefaultsEnv,
  readOpenAICompatibleRoleModelDefaultsFromEnv,
  SetupEnvError,
  writeOpenAICompatibleRoleModelDefaultsEnv,
  writeOpenAICompatibleSetupEnv
} from "./setup-env";
import { OpenAICompatibleAdapterError } from "@deliberum/adapters";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

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
  resourceAccessUrlSigningSecret?: string;
  resourceAccessTtlMs?: number;
  sqliteProcessLockConfigured?: boolean;
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
  daemonAuthTokens?: readonly DaemonAuthTokenInput[];
  corsOrigins?: readonly string[];
  webStaticAssets?: WebStaticAssetsOptions;
  setupEnvFilePath?: string;
  idGenerator?: IdGenerator;
  clock?: Clock;
  host?: string;
  port?: number;
};

export type WebStaticAssetsOptions = {
  rootDir: string;
  indexFile?: string;
  assetCacheMaxAgeSeconds?: number;
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
  urlSigning: {
    configured: boolean;
    algorithm: "hmac-sha256";
    requiredForAccess: boolean;
  };
  grantStore: {
    mode: "process_memory" | "configured_store";
    restartContinuity: "lost_on_restart" | "depends_on_configured_store";
  };
  hostedContent: {
    supported: true;
    requiresExplicitPolicy: true;
    requiresSizeLimit: true;
    deliveryMaterial: "short_lived_access_url";
    sensitiveDefault: "none";
    brokerContentRestartContinuity: "lost_on_restart" | "depends_on_configured_store";
    grantRestartContinuity: "lost_on_restart" | "depends_on_configured_store";
  };
  productionHosting: {
    status: "not_production_hosting";
    publicUrlHosting: false;
    signedUrls: boolean;
    arbitraryFileServing: false;
    blockers: string[];
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
    tokenMode: "disabled" | "single" | "registry";
    principalCount: number;
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
    sqliteProcessLock: "disabled" | "configured";
  };
  resourceAccess: {
    baseUrlConfigured: boolean;
    baseUrlExposure: "localhost" | "lan" | "public";
    grantStoreRestartContinuity: "lost_on_restart" | "depends_on_configured_store";
    urlSigningConfigured: boolean;
  };
  webAssets: {
    configured: boolean;
    routeMode: "disabled" | "html_accept_spa_shell_json_api_split";
    shellCache: "no_store";
    assetCache: "immutable";
  };
  productionReadiness: {
    status: "local_only" | "preproduction_remote_hardened" | "not_production_ready";
    readyForProduction: false;
    blockers: string[];
  };
  safety: string[];
};

export type DaemonLedgerIntegrityResponse = {
  status: "valid" | "invalid";
  eventStore: {
    mode: "process_memory" | "configured_store";
    validation: "current_snapshot";
  };
  sessionCount: number;
  eventCount: number;
  hashedEventCount: number;
  legacyEventCount: number;
  sessions: Array<{
    sessionId: string;
    eventCount: number;
    hashedEventCount: number;
    legacyEventCount: number;
    sequenceRange: { from: number; to: number } | null;
  }>;
  integrityError?: {
    code: "integrity_chain_invalid";
    message: string;
  };
  safety: string[];
};

export const DAEMON_CORS_ORIGINS_ENV_VAR = "DELIBERUM_DAEMON_CORS_ORIGINS" as const;
export const DEFAULT_DAEMON_CORS_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173"
] as const;

export const DAEMON_AUTH_ROLES = ["admin", "operator", "observer", "auditor"] as const;
export type DaemonAuthRole = (typeof DAEMON_AUTH_ROLES)[number];

export const DAEMON_AUTH_SCOPES = ["read", "write", "audit"] as const;
export type DaemonAuthScope = (typeof DAEMON_AUTH_SCOPES)[number];

export type DaemonAuthTokenInput = {
  principalId: string;
  token: string;
  role?: DaemonAuthRole;
  scopes?: readonly DaemonAuthScope[];
};

type DaemonAuthPrincipal = {
  principalId: string;
  role: DaemonAuthRole;
  scopes: DaemonAuthScope[];
};

type DaemonAuthTokenEntry = DaemonAuthPrincipal & {
  tokenHash: Buffer;
};

type DaemonAuthPolicy = {
  configured: boolean;
  mode: "disabled" | "single" | "registry";
  entries: DaemonAuthTokenEntry[];
};

const daemonAuthPrincipals = new WeakMap<Context, DaemonAuthPrincipal>();

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
  const daemonAuthPolicy = normalizeDaemonAuthPolicy({
    legacyToken: options.daemonAuthToken,
    tokens: options.daemonAuthTokens,
    legacyName: "daemonAuthToken"
  });
  const resourceBroker = options.resourceBroker ?? new InMemoryResourceBroker();
  const deliveryPlanner = options.deliveryPlanner ?? new DeliveryPlanner({ broker: resourceBroker });
  const resourceAccessBaseUrl =
    options.resourceAccessBaseUrl ?? `http://${host}:${port}`;
  const resourceAccessUrlSigningSecret =
    options.resourceAccessUrlSigningSecret === undefined
      ? undefined
      : parseResourceAccessSigningSecret(options.resourceAccessUrlSigningSecret);
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
  const openAICompatibleEnv = options.openAICompatibleEnv ?? {};
  let enableOpenAICompatibleProfile = options.enableOpenAICompatibleProfile === true;
  let enableOpenAICompatibleExtraction =
    options.enableOpenAICompatibleExtraction === true;
  let enableOpenAICompatibleReview = options.enableOpenAICompatibleReview === true;
  let enableOpenAICompatibleFinalization =
    options.enableOpenAICompatibleFinalization === true;
  const localPresetRegistries = options.enableLocalPreset
    ? createLocalPresetRunRegistries()
    : undefined;
  const openAICompatibleRegistries = enableOpenAICompatibleProfile
    ? createOpenAICompatibleRunRegistries({
        env: openAICompatibleEnv,
        fetch: options.openAICompatibleFetch,
        enableExtraction: enableOpenAICompatibleExtraction,
        enableReview: enableOpenAICompatibleReview,
        enableFinalization: enableOpenAICompatibleFinalization
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
        enableOpenAICompatibleProfile
          ? createOpenAICompatibleRuntimeEnv(openAICompatibleEnv)
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
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.use("*", async (context, next) => {
    const response = await serveWebStaticAssets(context, options.webStaticAssets);

    if (response) {
      return response;
    }

    await next();
  });

  app.use("*", async (context, next) => {
    await auditDaemonOperation({
      context,
      operationAuditLog,
      next
    });
  });

  app.use("*", async (context, next) => {
    const authError = authenticateDaemonRequest(context, daemonAuthPolicy);

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
    resourceAccessUrlSigningSecret,
    resourceAccessTtlMs: options.resourceAccessTtlMs,
    idGenerator,
    clock
  });

  app.get("/runtime/profiles", (context) =>
    noStoreJson(
      context,
      buildRuntimeProfilesProjection({
        enableLocalPreset: options.enableLocalPreset === true,
        enableOpenAICompatibleProfile,
        enableOpenAICompatibleExtraction:
          enableOpenAICompatibleExtraction,
        enableOpenAICompatibleReview,
        enableOpenAICompatibleFinalization:
          enableOpenAICompatibleFinalization,
        openAICompatibleEnv,
        enableHttpTemplateProfile: options.enableHttpTemplateProfile === true,
        httpTemplateEnv: options.httpTemplateEnv,
        enableMcpToolProfile: options.enableMcpToolProfile === true,
        mcpToolEnv: options.mcpToolEnv
      })
    )
  );

  app.post("/runtime/setup/openai-compatible", async (context) => {
    const body = await readJsonObject(context);

    try {
      const result = await writeOpenAICompatibleSetupEnv({
        envFilePath: options.setupEnvFilePath,
        activeEnv: openAICompatibleEnv,
        setup: {
          apiKey: body.apiKey,
          baseUrl: body.baseUrl,
          model: body.model,
          structuredReview: body.structuredReview
        }
      });

      enableOpenAICompatibleProfile = true;
      enableOpenAICompatibleExtraction = true;
      enableOpenAICompatibleReview = true;
      enableOpenAICompatibleFinalization = true;
      runService.applyRuntimeEnv(createOpenAICompatibleRuntimeEnv(openAICompatibleEnv));
      const openAICompatibleSetupRegistries = createOpenAICompatibleRunRegistries({
        env: openAICompatibleEnv,
        fetch: options.openAICompatibleFetch,
        enableExtraction: true,
        enableReview: true,
        enableFinalization: true
      });

      if (openAICompatibleSetupRegistries.adapterRegistry) {
        runService.installParticipantAdapter(
          openAICompatibleSetupRegistries.adapterRegistry.require(
            OPENAI_COMPATIBLE_ADAPTER_ID
          )
        );
      }
      const extractionGeneratorRegistry =
        openAICompatibleSetupRegistries.extractionGeneratorRegistry;
      if (extractionGeneratorRegistry) {
        for (const entry of extractionGeneratorRegistry.list()) {
          runService.installExtractionGenerator(
            extractionGeneratorRegistry.require(entry.generatorId)
          );
        }
      }
      const proposalReviewGeneratorRegistry =
        openAICompatibleSetupRegistries.proposalReviewGeneratorRegistry;
      if (proposalReviewGeneratorRegistry) {
        for (const entry of proposalReviewGeneratorRegistry.list()) {
          runService.installProposalReviewer(
            proposalReviewGeneratorRegistry.require(entry.reviewerId)
          );
        }
      }
      const finalCandidateGeneratorRegistry =
        openAICompatibleSetupRegistries.finalCandidateGeneratorRegistry;
      if (finalCandidateGeneratorRegistry) {
        for (const entry of finalCandidateGeneratorRegistry.list()) {
          runService.installFinalCandidateGenerator(
            finalCandidateGeneratorRegistry.require(entry.generatorId)
          );
        }
      }
      const finalAuditGeneratorRegistry =
        openAICompatibleSetupRegistries.finalAuditGeneratorRegistry;
      if (finalAuditGeneratorRegistry) {
        for (const entry of finalAuditGeneratorRegistry.list()) {
          runService.installFinalAuditor(finalAuditGeneratorRegistry.require(entry.auditorId));
        }
      }

      return noStoreJson(
        context,
        result,
        201
      );
    } catch (error) {
      if (error instanceof SetupEnvError) {
        throw new DaemonHttpError(error.code, error.message);
      }

      throw error;
    }
  });

  app.post("/runtime/setup/openai-compatible/verify", async (context) => {
    try {
      return noStoreJson(
        context,
        await verifyOpenAICompatibleSetup({
          env: openAICompatibleEnv,
          fetch: options.openAICompatibleFetch
        })
      );
    } catch (error) {
      if (error instanceof OpenAICompatibleAdapterError) {
        const safeError = describeOpenAICompatibleVerificationError(error);
        throw new DaemonHttpError(safeError.code, safeError.message);
      }

      throw error;
    }
  });

  app.get("/runtime/setup/model-role-defaults", (context) =>
    noStoreJson(context, {
      profileId: "openai-compatible",
      status: readOpenAICompatibleRoleModelDefaultsFromEnv({
        env: openAICompatibleEnv
      })
        ? "configured"
        : "empty",
      defaults: readOpenAICompatibleRoleModelDefaultsFromEnv({
        env: openAICompatibleEnv
      }),
      safety: [
        "Role model defaults contain non-secret model choices only.",
        "Provider API keys, base URLs, and provider config ids are not returned."
      ]
    })
  );

  app.post("/runtime/setup/model-role-defaults", async (context) => {
    const body = await readJsonObject(context);

    try {
      return noStoreJson(
        context,
        await writeOpenAICompatibleRoleModelDefaultsEnv({
          envFilePath: options.setupEnvFilePath,
          activeEnv: openAICompatibleEnv,
          defaults: {
            perspectiveCount: body.perspectiveCount === 3 ? 3 : 2,
            modelOverride:
              typeof body.modelOverride === "string" ? body.modelOverride : "",
            reviewModelOverride:
              typeof body.reviewModelOverride === "string"
                ? body.reviewModelOverride
                : "",
            customPerspectiveModelsEnabled:
              body.customPerspectiveModelsEnabled === true,
            perspectiveModelOverrides:
              body.perspectiveModelOverrides &&
              typeof body.perspectiveModelOverrides === "object" &&
              !Array.isArray(body.perspectiveModelOverrides)
                ? (body.perspectiveModelOverrides as Record<string, string | undefined>)
                : {}
          }
        }),
        201
      );
    } catch (error) {
      if (error instanceof SetupEnvError) {
        throw new DaemonHttpError(error.code, error.message);
      }

      throw error;
    }
  });

  app.delete("/runtime/setup/model-role-defaults", async (context) => {
    try {
      return noStoreJson(
        context,
        await clearOpenAICompatibleRoleModelDefaultsEnv({
          envFilePath: options.setupEnvFilePath,
          activeEnv: openAICompatibleEnv
        })
      );
    } catch (error) {
      if (error instanceof SetupEnvError) {
        throw new DaemonHttpError(error.code, error.message);
      }

      throw error;
    }
  });

  app.get("/runtime/resource-access", (context) =>
    noStoreJson(
      context,
      buildResourceAccessPosture({
        resourceAccessBaseUrl,
        resourceAccessBaseUrlConfigured: options.resourceAccessBaseUrl !== undefined,
        resourceAccessUrlSigningConfigured:
          resourceAccessUrlSigningSecret !== undefined,
        resourceAccessTtlMs: options.resourceAccessTtlMs,
        resourceBrokerConfigured: options.resourceBroker !== undefined,
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
        daemonAuthPolicy,
        corsOrigins,
        eventStoreConfigured: options.eventStore !== undefined,
        runStoreConfigured: options.runStore !== undefined,
        resourceBrokerConfigured: options.resourceBroker !== undefined,
        resourceAccessStoreConfigured: options.resourceAccessStore !== undefined,
        operationAuditLogConfigured: options.operationAuditLog !== undefined,
        resourceAccessBaseUrl,
        resourceAccessBaseUrlConfigured: options.resourceAccessBaseUrl !== undefined,
        resourceAccessUrlSigningConfigured:
          resourceAccessUrlSigningSecret !== undefined,
        sqliteProcessLockConfigured: options.sqliteProcessLockConfigured === true,
        webStaticAssetsConfigured: options.webStaticAssets !== undefined
      })
    )
  );

  app.get("/runtime/ledger-integrity", (context) =>
    noStoreJson(
      context,
      buildLedgerIntegrityReport({
        eventStore,
        eventStoreConfigured: options.eventStore !== undefined
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
        quorumCount: body.quorumCount as number | undefined,
        deadlineAt: body.deadlineAt as string | undefined,
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
    resourceAccessUrlSigningSecret,
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
    resourceAccessUrlSigningSecret,
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

export function parseDaemonAuthTokenRegistryJson(
  value: string | undefined,
  name: string
): DaemonAuthTokenInput[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be a JSON array of daemon auth token entries.`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be a JSON array of daemon auth token entries.`
    );
  }

  return parsed.map((entry, index) => parseDaemonAuthTokenInput(entry, `${name}[${index}]`));
}

function normalizeDaemonAuthPolicy(input: {
  legacyToken?: string;
  tokens?: readonly DaemonAuthTokenInput[];
  legacyName: string;
}): DaemonAuthPolicy {
  const entries: DaemonAuthTokenEntry[] = [];
  const legacyToken = normalizeDaemonAuthToken(input.legacyToken, input.legacyName);

  if (legacyToken) {
    entries.push(
      normalizeDaemonAuthTokenEntry({
        principalId: "daemon-default",
        token: legacyToken,
        role: "admin"
      }, input.legacyName)
    );
  }

  for (const [index, tokenInput] of [...(input.tokens ?? [])].entries()) {
    entries.push(normalizeDaemonAuthTokenEntry(tokenInput, `daemonAuthTokens[${index}]`));
  }

  rejectDuplicateDaemonAuthPrincipals(entries);
  rejectDuplicateDaemonAuthTokenHashes(entries);

  const hasRegistryTokens = input.tokens !== undefined && input.tokens.length > 0;
  const mode: DaemonAuthPolicy["mode"] =
    entries.length === 0 ? "disabled" : hasRegistryTokens ? "registry" : "single";

  return {
    configured: entries.length > 0,
    mode,
    entries
  };
}

function parseDaemonAuthTokenInput(value: unknown, name: string): DaemonAuthTokenInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be a JSON object.`
    );
  }

  const input = value as {
    principalId?: unknown;
    token?: unknown;
    role?: unknown;
    scopes?: unknown;
  };
  const allowedKeys = new Set(["principalId", "token", "role", "scopes"]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new DaemonHttpError(
        "daemon_auth_token_invalid",
        `${name} contains an unknown daemon auth token field.`
      );
    }
  }

  const principalId = normalizeDaemonAuthPrincipalId(
    requireDaemonAuthString(input.principalId, `${name}.principalId`),
    `${name}.principalId`
  );
  const token = normalizeDaemonAuthToken(
    requireDaemonAuthString(input.token, `${name}.token`),
    `${name}.token`
  );
  if (!token) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name}.token must be at least 16 non-whitespace characters.`
    );
  }

  return {
    principalId,
    token,
    role:
      input.role === undefined
        ? undefined
        : requireDaemonAuthRole(input.role, `${name}.role`),
    scopes:
      input.scopes === undefined
        ? undefined
        : requireDaemonAuthScopes(input.scopes, `${name}.scopes`)
  };
}

function normalizeDaemonAuthTokenEntry(
  input: DaemonAuthTokenInput,
  name: string
): DaemonAuthTokenEntry {
  const principalId = normalizeDaemonAuthPrincipalId(
    requireDaemonAuthString(input.principalId, `${name}.principalId`),
    `${name}.principalId`
  );
  const token = normalizeDaemonAuthToken(
    requireDaemonAuthString(input.token, `${name}.token`),
    `${name}.token`
  );
  if (!token) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name}.token must be at least 16 non-whitespace characters.`
    );
  }

  const role = requireDaemonAuthRole(input.role ?? "admin", `${name}.role`);
  const scopes = normalizeDaemonAuthScopes(input.scopes ?? defaultDaemonAuthScopes(role), name);

  return {
    principalId,
    role,
    scopes,
    tokenHash: hashDaemonAuthToken(token)
  };
}

function normalizeDaemonAuthPrincipalId(value: string, name: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(trimmed)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be a safe non-secret identifier.`
    );
  }

  if (containsSecretLikeAuthMaterial(trimmed)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must not contain secret-like material.`
    );
  }

  return trimmed;
}

function normalizeDaemonAuthScopes(
  scopes: readonly unknown[],
  name: string
): DaemonAuthScope[] {
  if (!Array.isArray(scopes)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name}.scopes must be an array.`
    );
  }

  if (scopes.length === 0) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name}.scopes must contain at least one scope.`
    );
  }

  const parsedScopes = scopes.map((scope, index) => {
    if (typeof scope !== "string" || !isDaemonAuthScope(scope)) {
      throw new DaemonHttpError(
        "daemon_auth_token_invalid",
        `${name}.scopes[${index}] must be one of: ${DAEMON_AUTH_SCOPES.join(", ")}.`
      );
    }

    return scope;
  });

  return [...new Set(parsedScopes)];
}

function defaultDaemonAuthScopes(role: DaemonAuthRole): DaemonAuthScope[] {
  if (role === "admin") {
    return ["read", "write", "audit"];
  }

  if (role === "operator") {
    return ["read", "write"];
  }

  if (role === "auditor") {
    return ["read", "audit"];
  }

  return ["read"];
}

function rejectDuplicateDaemonAuthPrincipals(entries: readonly DaemonAuthTokenEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.principalId)) {
      throw new DaemonHttpError(
        "daemon_auth_token_invalid",
        "Daemon auth principal ids must be unique."
      );
    }

    seen.add(entry.principalId);
  }
}

function rejectDuplicateDaemonAuthTokenHashes(entries: readonly DaemonAuthTokenEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const tokenHash = entry.tokenHash.toString("hex");
    if (seen.has(tokenHash)) {
      throw new DaemonHttpError(
        "daemon_auth_token_invalid",
        "Daemon auth tokens must be unique."
      );
    }

    seen.add(tokenHash);
  }
}

function requireDaemonAuthString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be a string.`
    );
  }

  return value;
}

function requireDaemonAuthRole(value: unknown, name: string): DaemonAuthRole {
  if (typeof value !== "string" || !isDaemonAuthRole(value)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be one of: ${DAEMON_AUTH_ROLES.join(", ")}.`
    );
  }

  return value;
}

function requireDaemonAuthScopes(value: unknown, name: string): DaemonAuthScope[] {
  if (!Array.isArray(value)) {
    throw new DaemonHttpError(
      "daemon_auth_token_invalid",
      `${name} must be an array.`
    );
  }

  return value.map((scope, index) => {
    if (typeof scope !== "string" || !isDaemonAuthScope(scope)) {
      throw new DaemonHttpError(
        "daemon_auth_token_invalid",
        `${name}[${index}] must be one of: ${DAEMON_AUTH_SCOPES.join(", ")}.`
      );
    }

    return scope;
  });
}

function isDaemonAuthRole(value: string): value is DaemonAuthRole {
  return (DAEMON_AUTH_ROLES as readonly string[]).includes(value);
}

function isDaemonAuthScope(value: string): value is DaemonAuthScope {
  return (DAEMON_AUTH_SCOPES as readonly string[]).includes(value);
}

function containsSecretLikeAuthMaterial(value: string): boolean {
  return /api[_-]?key|secret|private[_-]?token|access[_-]?token|authorization|bearer|sk-[a-z0-9]/i.test(
    value
  );
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
  resourceAccessUrlSigningConfigured: boolean;
  resourceAccessTtlMs?: number;
  resourceBrokerConfigured: boolean;
  resourceAccessStoreConfigured: boolean;
}): ResourceAccessPostureResponse {
  const grantRestartContinuity = options.resourceAccessStoreConfigured
    ? "depends_on_configured_store"
    : "lost_on_restart";
  const brokerContentRestartContinuity = options.resourceBrokerConfigured
    ? "depends_on_configured_store"
    : "lost_on_restart";

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
    urlSigning: {
      configured: options.resourceAccessUrlSigningConfigured,
      algorithm: "hmac-sha256",
      requiredForAccess: options.resourceAccessUrlSigningConfigured
    },
    grantStore: options.resourceAccessStoreConfigured
      ? {
          mode: "configured_store",
          restartContinuity: grantRestartContinuity
        }
      : {
          mode: "process_memory",
          restartContinuity: grantRestartContinuity
        },
    hostedContent: {
      supported: true,
      requiresExplicitPolicy: true,
      requiresSizeLimit: true,
      deliveryMaterial: "short_lived_access_url",
      sensitiveDefault: "none",
      brokerContentRestartContinuity,
      grantRestartContinuity
    },
    productionHosting: {
      status: "not_production_hosting",
      publicUrlHosting: false,
      signedUrls: options.resourceAccessUrlSigningConfigured,
      arbitraryFileServing: false,
      blockers: [
        "Production public resource hosting is not implemented.",
        ...(options.resourceAccessUrlSigningConfigured
          ? [
              "Daemon-signed resource access URLs do not replace object-storage or CDN signed URL services."
            ]
          : ["Signed resource access URLs are not configured."]),
        "Daemon resource access grants do not replace production authorization or multi-user policy."
      ]
    },
    safety: [
      "This posture is derived from daemon configuration only.",
      "It does not expose resource access ids, bearer tokens, source URLs, redirected targets, hosted content, or resource payloads.",
      "Resource access URL signing status is reported as a boolean only; signing secrets and signatures are not exposed.",
      "Hosted content delivery requires explicit per-request policy and a size limit; sensitive resources default to no delivery.",
      "Resource access grants remain scoped, revocable, short-lived delivery-layer material and are not semantic ledger authority."
    ]
  };
}

function buildLedgerIntegrityReport(options: {
  eventStore: EventStore;
  eventStoreConfigured: boolean;
}): DaemonLedgerIntegrityResponse {
  const sessions = options.eventStore
    .listSessionIds()
    .sort()
    .map((sessionId) => {
      const events = options.eventStore.listEvents(sessionId);
      const hashedEventCount = countHashedEvents(events);

      return {
        sessionId,
        events,
        report: {
          sessionId,
          eventCount: events.length,
          hashedEventCount,
          legacyEventCount: events.length - hashedEventCount,
          sequenceRange:
            events.length === 0
              ? null
              : {
                  from: events[0]!.sequence,
                  to: events[events.length - 1]!.sequence
                }
        }
      };
    });
  const events = sessions.flatMap((session) => session.events);
  const eventCount = events.length;
  const hashedEventCount = countHashedEvents(events);
  const integrityError = validateEventIntegrityChain(
    events as readonly unknown[] as readonly EventEnvelope[]
  );

  return {
    status: integrityError ? "invalid" : "valid",
    eventStore: {
      mode: configuredStore(options.eventStoreConfigured),
      validation: "current_snapshot"
    },
    sessionCount: sessions.length,
    eventCount,
    hashedEventCount,
    legacyEventCount: eventCount - hashedEventCount,
    sessions: sessions.map((session) => session.report),
    ...(integrityError
      ? {
          integrityError: {
            code: "integrity_chain_invalid" as const,
            message: integrityError
          }
        }
      : {}),
    safety: [
      "This report is derived from the daemon event store current snapshot only.",
      "It reports session ids, event counts, sequence ranges, and hash coverage counts without returning event payloads or event ids.",
      "It does not expose configured file paths, provider secrets, request bodies, resource access ids, URLs, hosted content, or payloads.",
      "Integrity hashes are local tamper-evidence metadata; they are not distributed consensus, production notarization, or multi-writer coordination."
    ]
  };
}

function countHashedEvents(events: readonly StoredEvent[]): number {
  return events.filter((event) => Boolean(event.integrity?.eventHash)).length;
}

function buildDeploymentPosture(options: {
  host: string;
  port: number;
  daemonAuthPolicy: DaemonAuthPolicy;
  corsOrigins: readonly string[];
  eventStoreConfigured: boolean;
  runStoreConfigured: boolean;
  resourceBrokerConfigured: boolean;
  resourceAccessStoreConfigured: boolean;
  operationAuditLogConfigured: boolean;
  resourceAccessBaseUrl: string;
  resourceAccessBaseUrlConfigured: boolean;
  resourceAccessUrlSigningConfigured: boolean;
  sqliteProcessLockConfigured: boolean;
  webStaticAssetsConfigured: boolean;
}): DaemonDeploymentPostureResponse {
  const bindingExposure = classifyDaemonBindHost(options.host);
  const resourceAccessBaseUrlExposure = classifyResourceAccessBaseUrl(
    options.resourceAccessBaseUrl
  );
  const blockers = createDeploymentPostureBlockers({
    bindingExposure,
    resourceAccessBaseUrlExposure,
    resourceAccessUrlSigningConfigured: options.resourceAccessUrlSigningConfigured,
    daemonAuthConfigured: options.daemonAuthPolicy.configured,
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
      auth: options.daemonAuthPolicy.configured ? "daemon_bearer" : "disabled",
      protected: options.daemonAuthPolicy.configured,
      tokenMode: options.daemonAuthPolicy.mode,
      principalCount: options.daemonAuthPolicy.entries.length
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
      productionMultiWriterCoordination: false,
      sqliteProcessLock: options.sqliteProcessLockConfigured
        ? "configured"
        : "disabled"
    },
    resourceAccess: {
      baseUrlConfigured: options.resourceAccessBaseUrlConfigured,
      baseUrlExposure: resourceAccessBaseUrlExposure,
      grantStoreRestartContinuity: options.resourceAccessStoreConfigured
        ? "depends_on_configured_store"
        : "lost_on_restart",
      urlSigningConfigured: options.resourceAccessUrlSigningConfigured
    },
    webAssets: {
      configured: options.webStaticAssetsConfigured,
      routeMode: options.webStaticAssetsConfigured
        ? "html_accept_spa_shell_json_api_split"
        : "disabled",
      shellCache: "no_store",
      assetCache: "immutable"
    },
    productionReadiness: {
      status:
        bindingExposure === "localhost"
          ? "local_only"
          : options.daemonAuthPolicy.configured
            ? "preproduction_remote_hardened"
            : "not_production_ready",
      readyForProduction: false,
      blockers
    },
    safety: [
      "This posture is derived from safe daemon configuration state only.",
      "It does not expose bearer tokens, CORS origin values, resource access ids, resource URLs, configured file paths, provider secrets, request bodies, or payloads.",
      "The SQLite process lock is a cooperative single-daemon guard, not distributed multi-writer coordination.",
      "A non-local binding or public resource access base URL is not production authorization.",
      "Production deployment still requires an external authorization layer, multi-user policy, and production-grade multi-writer coordination."
    ]
  };
}

function createDeploymentPostureBlockers(input: {
  bindingExposure: "localhost" | "lan" | "public";
  resourceAccessBaseUrlExposure: "localhost" | "lan" | "public";
  resourceAccessUrlSigningConfigured: boolean;
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
    input.resourceAccessBaseUrlExposure === "public" &&
    !input.resourceAccessUrlSigningConfigured
  ) {
    blockers.push("Public resource access base URLs should use signed daemon access URLs.");
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

async function serveWebStaticAssets(
  context: Context,
  options: WebStaticAssetsOptions | undefined
): Promise<Response | undefined> {
  if (!options) {
    return undefined;
  }

  const method = context.req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return undefined;
  }

  const path = context.req.path;
  if (isWebStaticAssetPath(path)) {
    return serveWebAssetFile(context, options, path.slice(1), {
      cache: "immutable_asset"
    });
  }

  if (acceptsHtml(context) && isWebShellRoute(path)) {
    return serveWebAssetFile(context, options, options.indexFile ?? "index.html", {
      cache: "html_shell",
      varyAccept: true
    });
  }

  return undefined;
}

async function serveWebAssetFile(
  context: Context,
  options: WebStaticAssetsOptions,
  relativePath: string,
  responseOptions: {
    cache: "html_shell" | "immutable_asset";
    varyAccept?: boolean;
  }
): Promise<Response> {
  const rootDir = resolve(options.rootDir);
  const safePath = safeRelativeWebAssetPath(relativePath);
  if (!safePath) {
    return webAssetNotFound();
  }

  const filePath = resolve(rootDir, safePath);
  if (!isPathInside(rootDir, filePath)) {
    return webAssetNotFound();
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return webAssetNotFound();
    }

    const isHead = context.req.method.toUpperCase() === "HEAD";
    const file = isHead ? undefined : await readFile(filePath);
    const response = new Response(file, {
      status: 200,
      headers: {
        "Content-Type": contentTypeForWebAsset(filePath),
        "X-Content-Type-Options": "nosniff"
      }
    });

    if (responseOptions.cache === "html_shell") {
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Pragma", "no-cache");
    } else {
      response.headers.set(
        "Cache-Control",
        `public, max-age=${options.assetCacheMaxAgeSeconds ?? 31536000}, immutable`
      );
    }

    if (responseOptions.varyAccept) {
      response.headers.set("Vary", "Accept");
    }

    return response;
  } catch (error) {
    if (isFileReadNotFound(error)) {
      return webAssetNotFound();
    }

    throw error;
  }
}

function isWebStaticAssetPath(path: string): boolean {
  return path === "/favicon.ico" || path.startsWith("/assets/");
}

function isWebShellRoute(path: string): boolean {
  if (path === "/") {
    return true;
  }

  if (path === "/runs" || path === "/runs/new" || path === "/advanced") {
    return true;
  }

  if (path === "/setup/models") {
    return true;
  }

  if (/^\/runs\/[^/]+(?:\/outcome)?$/.test(path)) {
    return true;
  }

  if (
    /^\/sessions\/[^/]+(?:\/(?:frontier|objections|obligations|events|final|resources))?$/.test(
      path
    )
  ) {
    return true;
  }

  return false;
}

function acceptsHtml(context: Context): boolean {
  return (context.req.header("accept") ?? "")
    .split(",")
    .some((entry) => entry.trim().toLowerCase().startsWith("text/html"));
}

function safeRelativeWebAssetPath(path: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }

  const normalized = decoded.replace(/^\/+/, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("..") ||
    normalized.includes(`${sep}..${sep}`) ||
    normalized.includes("../") ||
    normalized.includes("\\")
  ) {
    return undefined;
  }

  return normalized;
}

function isPathInside(rootDir: string, filePath: string): boolean {
  const relativePath = relative(rootDir, filePath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("..") &&
    !relativePath.includes(`..${sep}`) &&
    !relativePath.startsWith(sep)
  );
}

function contentTypeForWebAsset(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function webAssetNotFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function isFileReadNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "ENOENT" ||
      (error as { code?: unknown }).code === "ENOTDIR")
  );
}

function authenticateDaemonRequest(
  context: Context,
  policy: DaemonAuthPolicy
): Response | undefined {
  if (!policy.configured || isDaemonAuthExemptRequest(context)) {
    return undefined;
  }

  const token =
    parseBearerAuthorizationHeader(context.req.header("Authorization")) ??
    parseDaemonAuthStreamQueryToken(context);
  const principal = token ? findDaemonAuthPrincipal(policy, token) : undefined;

  if (principal) {
    setDaemonAuthPrincipal(context, principal);
    const requiredScope = requiredDaemonAuthScope(context);
    if (principal.scopes.includes(requiredScope)) {
      return undefined;
    }

    return daemonAuthError(
      context,
      403,
      "daemon_auth_forbidden",
      "Daemon authentication is not authorized for this operation."
    );
  }

  return daemonAuthError(
    context,
    401,
    "daemon_auth_required",
    "Daemon authentication is required."
  );
}

function daemonAuthError(
  context: Context,
  status: 401 | 403,
  code: string,
  message: string
): Response {
  const response = context.json(createErrorResponse(code, message), status);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  if (status === 401) {
    response.headers.set("WWW-Authenticate", 'Bearer realm="deliberum-daemon"');
  }

  return response;
}

function setDaemonAuthPrincipal(context: Context, principal: DaemonAuthPrincipal): void {
  daemonAuthPrincipals.set(context, {
    principalId: principal.principalId,
    role: principal.role,
    scopes: [...principal.scopes]
  });
}

function getDaemonAuthPrincipal(context: Context): DaemonAuthPrincipal | undefined {
  const principal = daemonAuthPrincipals.get(context);
  if (!principal) {
    return undefined;
  }

  return {
    principalId: principal.principalId,
    role: principal.role,
    scopes: [...principal.scopes]
  };
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

function requiredDaemonAuthScope(context: Context): DaemonAuthScope {
  const method = context.req.method.toUpperCase();
  const path = context.req.path;
  const isReadMethod = method === "GET" || method === "HEAD";

  if (isReadMethod && path === "/runtime/operation-audit") {
    return "audit";
  }

  if (isReadMethod) {
    return "read";
  }

  return "write";
}

function findDaemonAuthPrincipal(
  policy: DaemonAuthPolicy,
  candidate: string
): DaemonAuthPrincipal | undefined {
  const candidateHash = hashDaemonAuthToken(candidate);
  const entry = policy.entries.find((tokenEntry) =>
    timingSafeEqual(candidateHash, tokenEntry.tokenHash)
  );

  if (!entry) {
    return undefined;
  }

  return {
    principalId: entry.principalId,
    role: entry.role,
    scopes: [...entry.scopes]
  };
}

function hashDaemonAuthToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

async function auditDaemonOperation(input: {
  context: Context;
  operationAuditLog: OperationAuditLog;
  next: () => Promise<void>;
}): Promise<void> {
  const method = input.context.req.method.toUpperCase();
  const path = input.context.req.path;

  try {
    await input.next();
  } catch (error) {
    recordOperationAuditEvent(input.operationAuditLog, {
      method,
      path,
      statusCode: classifyThrownOperationStatus(path, error),
      authorization: createOperationAuditAuthorization({
        method,
        path,
        authorizationHeader: input.context.req.header("Authorization"),
        daemonAuthTokenQuery: input.context.req.query("daemonAuthToken"),
        principal: getDaemonAuthPrincipal(input.context)
      })
    });
    throw error;
  }

  recordOperationAuditEvent(input.operationAuditLog, {
    method,
    path,
    statusCode: input.context.res.status || 200,
    authorization: createOperationAuditAuthorization({
      method,
      path,
      authorizationHeader: input.context.req.header("Authorization"),
      daemonAuthTokenQuery: input.context.req.query("daemonAuthToken"),
      principal: getDaemonAuthPrincipal(input.context)
    })
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
