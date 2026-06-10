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
import { streamSSE } from "hono/streaming";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "./config";
import { DaemonEventBus } from "./event-stream";
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
  const webgetStore =
    options.webgetStore ??
    new WebGETSessionStore({
      clock:
        options.webgetClock ??
        (() => (clock ? Date.parse(clock()) : Date.now())),
      tokenGenerator: options.webgetTokenGenerator,
      baseUrl: options.webgetBaseUrl ?? `http://${host}:${port}`
    });
  const app = new Hono();
  const coreOptions = {
    eventStore,
    idGenerator,
    clock
  };

  app.onError((error, context) => handleWebGETRouteError(context, error) ?? safeError(context, error));

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

    eventBus.publish(result.openedEvent);

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

    eventBus.publish(result.contributionEvent);

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

    eventBus.publish(result.revealedEvent);

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

    eventBus.publish(result.proposalEvent);

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

    eventBus.publish(result.challengeEvent);

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

    eventBus.publish(result.acceptanceEvent);

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
    host,
    port,
    createWebGETSession: (input) => webgetStore.createSession(input)
  };
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
