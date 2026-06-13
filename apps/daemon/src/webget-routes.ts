import {
  recordResourceAccessGrantCreated,
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  projectQualityObligations,
  submitSealedContribution,
  SEALED_BATCH_REVEALED_EVENT_TYPE,
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
  type Clock,
  type IdGenerator
} from "@deliberum/core";
import type { JsonValue } from "@deliberum/protocol";
import type { EventStore } from "@deliberum/storage";
import type {
  DeliveryPlanner,
  ResourceBroker,
  ResourceDeliveryPlan
} from "@deliberum/resources";
import type { Hono, Context } from "hono";
import type { DaemonEventBus } from "./event-stream";
import {
  createResourceAccessDeliveryPlan,
  createResourceAccessGrantAuditSummary
} from "./resource-access-routes";
import type { ResourceAccessGrantStoreLike } from "./resource-access-store";
import {
  WebGETSessionError,
  WebGETSessionStore,
  type WebGETSessionPublicView,
  type WebGETSessionStatusView
} from "./webget-session-store";

export type WebGETRouteOptions = {
  app: Hono;
  eventStore: EventStore;
  eventBus: DaemonEventBus;
  webgetStore: WebGETSessionStore;
  resourceBroker: ResourceBroker;
  deliveryPlanner: DeliveryPlanner;
  resourceAccessStore: ResourceAccessGrantStoreLike;
  resourceAccessBaseUrl: string;
  resourceAccessUrlSigningSecret?: string;
  resourceAccessTtlMs?: number;
  idGenerator: IdGenerator;
  clock?: Clock;
};

export type WebGETSafeErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export function registerWebGETRoutes(options: WebGETRouteOptions): void {
  const { app } = options;

  app.get("/webget/:token/status", (context) =>
    noStoreJson(
      context,
      createStatusPayload(options.webgetStore.getSessionStatus(context.req.param("token")))
    )
  );

  app.get("/webget/:token/start", (context) =>
    noStoreJson(
      context,
      createStartPayload(options.webgetStore.getSession(context.req.param("token")))
    )
  );

  app.get("/webget/:token/context", (context) =>
    noStoreJson(
      context,
      createContextIndexPayload(options, options.webgetStore.getSession(context.req.param("token")))
    )
  );

  app.get("/webget/:token/context/:page", (context) => {
    const session = options.webgetStore.getSession(context.req.param("token"));

    return noStoreJson(
      context,
      createContextPagePayload(options, session, context.req.param("page"))
    );
  });

  app.get("/webget/:token/resources/:resourceId", (context) => {
    const token = context.req.param("token");
    const session = options.webgetStore.getSession(token);
    const resourceId = context.req.param("resourceId");

    if (!session.resourceIds.includes(resourceId)) {
      return noStoreJson(
        context,
        createErrorResponse("resource_not_scoped", "Resource is not scoped to this WebGET session."),
        400
      );
    }

    const plan = options.deliveryPlanner.planDelivery({
      resourceId,
      participantId: session.participantId,
      policy: session.resourcePolicy
    });
    const resource = options.resourceBroker.getResource(resourceId);

    if (!resource) {
      throw new WebGETSessionError("resource_not_found", "WebGET resource was not found.");
    }

    const safePlan = createResourceAccessDeliveryPlan({
      resourceAccessStore: options.resourceAccessStore,
      resourceAccessBaseUrl: options.resourceAccessBaseUrl,
      resourceAccessUrlSigningSecret: options.resourceAccessUrlSigningSecret,
      resourceBroker: options.resourceBroker,
      resource,
      idGenerator: options.idGenerator,
      sessionId: session.sessionId,
      resourceId,
      participantId: session.participantId,
      delivery: plan,
      policy: session.resourcePolicy,
      ttlMs: options.resourceAccessTtlMs,
      onAccessGrantCreated: (created) => {
        const accessAudit = recordResourceAccessGrantCreated(
          {
            sessionId: session.sessionId,
            resourceAccessId: created.grant.resourceAccessId,
            resourceId,
            participantId: session.participantId,
            resource: {
              kind: resource.kind,
              mime: resource.mime,
              sizeBytes: resource.sizeBytes,
              hash: resource.hash,
              privacy: resource.privacy
            },
            grant: createResourceAccessGrantAuditSummary(created.grant),
            idempotencyKey: `resource-access-created:${created.grant.resourceAccessId}`
          },
          {
            eventStore: options.eventStore,
            idGenerator: options.idGenerator,
            clock: options.clock
          }
        );

        if (accessAudit.appended) {
          options.eventBus.publish(accessAudit.accessEvent);
        }
      }
    });
    options.webgetStore.recordResourceAccess(token, safePlan);

    return noStoreJson(context, {
      resource: sanitizeResource(options.resourceBroker.getResource(resourceId)),
      delivery: safePlan
    });
  });

  app.get("/webget/:token/submit", (context) => {
    const result = options.webgetStore.submitChunk(context.req.param("token"), {
      seq: context.req.query("seq"),
      total: context.req.query("total"),
      encoding: context.req.query("encoding"),
      data: context.req.query("data")
    });

    return noStoreJson(context, result);
  });

  app.get("/webget/:token/commit", (context) => {
    const committed = options.webgetStore.commitSubmission(context.req.param("token"), {
      total: context.req.query("total"),
      sha256: context.req.query("sha256"),
      length: context.req.query("length")
    });

    const payload = createCommittedContributionPayload(
      committed,
      options.clock?.() ?? new Date().toISOString()
    );
    const result = submitSealedContribution(
      {
        sessionId: committed.session.sessionId,
        batchId: committed.session.batchId,
        authorId: committed.session.participantId,
        visibility: "sealed",
        payload,
        idempotencyKey: `webget:${committed.session.sessionId}:${committed.session.batchId}:${committed.session.participantId}`
      },
      {
        eventStore: options.eventStore,
        idGenerator: options.idGenerator,
        clock: options.clock
      }
    );

    options.webgetStore.finalizeCommittedSession(context.req.param("token"));
    if (result.appended) {
      options.eventBus.publish(result.contributionEvent);
    }

    return noStoreJson(
      context,
      {
        committed: true,
        sessionId: committed.session.sessionId,
        event: result.contributionEvent
      },
      201
    );
  });
}

export function handleWebGETRouteError(context: Context, error: Error): Response | undefined {
  if (!context.req.path.startsWith("/webget/")) {
    return undefined;
  }

  if (error instanceof WebGETSessionError) {
    return noStoreJson(context, createErrorResponse(error.code, error.message), 400);
  }

  return noStoreJson(
    context,
    createErrorResponse("webget_request_failed", "WebGET request could not be processed."),
    400
  );
}

function createStartPayload(session: WebGETSessionPublicView) {
  return {
    experimental: true,
    sessionId: session.sessionId,
    participantId: session.participantId,
    expiresAt: new Date(session.expiresAt).toISOString(),
    context: {
      index: "context",
      pages: ["overview", "events", "frontier", "objections", "obligations", "resources", "output"]
    },
    instructions: [
      "Read scoped context pages before contributing.",
      "Include READ_REPORT in the committed JSON payload.",
      "Never claim access to resources that were delivered as none.",
      "Submit JSON bytes as base64url chunks through /submit, then call /commit with sha256 and length.",
      session.instructions ?? "Produce an independent participant contribution."
    ],
    submission: {
      encoding: "base64url",
      submitPath: "submit",
      commitPath: "commit",
      requiredJsonFields: ["output", "readReport", "contextCompleteness"]
    }
  };
}

function createStatusPayload(status: WebGETSessionStatusView) {
  return {
    experimental: true,
    sessionId: status.sessionId,
    batchId: status.batchId,
    participantId: status.participantId,
    status: status.status,
    createdAt: new Date(status.createdAt).toISOString(),
    expiresAt: new Date(status.expiresAt).toISOString(),
    submission: status.submission,
    resources: status.resources,
    links: {
      start: "start",
      context: "context",
      submit: "submit",
      commit: "commit"
    },
    safety: [
      "This status view is scoped to the WebGET token holder.",
      "It reports lifecycle, chunk counts, resource counts, and relative endpoint names only.",
      "It does not replay historical events or expose the token, start URL, event payloads, resource contents, delivery material, provider secrets, or bearer material."
    ]
  };
}

function createContextIndexPayload(
  _options: WebGETRouteOptions,
  session: WebGETSessionPublicView
) {
  return {
    experimental: true,
    sessionId: session.sessionId,
    participantId: session.participantId,
    pages: ["overview", "events", "frontier", "objections", "obligations", "resources", "output"],
    readReportRequired: true
  };
}

function createContextPagePayload(
  options: WebGETRouteOptions,
  session: WebGETSessionPublicView,
  page: string
): unknown {
  if (page === "overview") {
    return {
      page,
      sessionId: session.sessionId,
      participantId: session.participantId,
      instructions: session.instructions,
      readReportRequired: true,
      resourceIds: [...session.resourceIds]
    };
  }

  if (page === "events") {
    return {
      page,
      events: visibleEventsForWebGET(options.eventStore, session.sessionId)
    };
  }

  if (page === "frontier") {
    return {
      page,
      ...projectCandidateFrontier({
        eventStore: options.eventStore,
        sessionId: session.sessionId
      })
    };
  }

  if (page === "objections") {
    const projection = projectAcceptedDeliberationObjects({
      eventStore: options.eventStore,
      sessionId: session.sessionId
    });

    return {
      page,
      objections: projection.objections,
      projection: projection.projection
    };
  }

  if (page === "obligations") {
    return {
      page,
      ...projectQualityObligations({
        eventStore: options.eventStore,
        sessionId: session.sessionId
      })
    };
  }

  if (page === "resources") {
    return {
      page,
      resources: session.resourceIds.map((resourceId) => ({
        resource: sanitizeResource(options.resourceBroker.getResource(resourceId)),
        deliveryPath: `resources/${encodeURIComponent(resourceId)}`
      })),
      resourceAccessReports: session.resourceAccessReports
    };
  }

  if (page === "output") {
    return {
      page,
      requiredSubmissionShape: {
        output: "JsonValue",
        readReport: {
          contextPagesRead: "string[]",
          resourcesViewed: "string[]",
          resourcesSummaryOnly: "string[]",
          submissionMode: "chunked_get | manual_paste | browser_automation",
          contextCompleteness: {
            status: "complete | partial | unknown",
            notes: "string[]"
          }
        },
        contextCompleteness: {
          status: "complete | partial | unknown",
          notes: "string[]"
        },
        resourceAccessReports: "optional ResourceAccessReport[]"
      },
      readReportRequired: true
    };
  }

  throw new WebGETSessionError("unknown_context_page", "WebGET context page is not available.");
}

function visibleEventsForWebGET(eventStore: EventStore, sessionId: string): unknown[] {
  const events = eventStore.listEvents(sessionId);
  const revealedBatchIds = new Set(
    events
      .filter(
        (event) => event.type === SEALED_BATCH_REVEALED_EVENT_TYPE && event.visibility === "public"
      )
      .map((event) => event.batchId)
      .filter((batchId): batchId is string => typeof batchId === "string")
  );

  return events.map((event) => {
    if (event.type === SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE) {
      if (event.visibility === "sealed" && event.batchId && revealedBatchIds.has(event.batchId)) {
        return event;
      }

      return redactEventPayloadForWebGET(event, "sealed_until_reveal");
    }

    if (event.visibility === "public") {
      return event;
    }

    return redactEventPayloadForWebGET(event, "event_visibility");
  });
}

function redactEventPayloadForWebGET(
  event: ReturnType<EventStore["listEvents"]>[number],
  reason: "event_visibility" | "sealed_until_reveal"
): unknown {
  return {
    ...event,
    payload: {
      redacted: true,
      reason
    }
  };
}

function createCommittedContributionPayload(committed: {
  session: WebGETSessionPublicView;
  submission: unknown;
  decodedLength: number;
  sha256: string;
}, committedAt: string): JsonValue {
  return {
    kind: "webget_committed_submission",
    submission: committed.submission as JsonValue,
    audit: {
      participantId: committed.session.participantId,
      decodedLength: committed.decodedLength,
      sha256: committed.sha256,
      committedAt,
      resourceAccessReports: committed.session.resourceAccessReports as JsonValue
    }
  };
}

function sanitizeResource(resource: unknown): unknown {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    return undefined;
  }

  const record = resource as {
    variants?: unknown[];
    [key: string]: unknown;
  };

  return {
    ...record,
    variants: (record.variants ?? []).map((variant) => {
      if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
        return variant;
      }

      const variantRecord = variant as Record<string, unknown>;
      if (variantRecord.mode === "url") {
        return {
          mode: "url",
          exposure: variantRecord.exposure,
          expiresAt: variantRecord.expiresAt
        };
      }

      if (variantRecord.mode === "base64") {
        return {
          mode: "base64",
          mime: variantRecord.mime,
          sizeBytes: variantRecord.sizeBytes
        };
      }

      return variantRecord;
    })
  };
}

function noStoreJson(context: Context, payload: unknown, status: 200 | 201 | 400 = 200): Response {
  const response = context.json(payload, status);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");

  return response;
}

function createErrorResponse(code: string, message: string): WebGETSafeErrorResponse {
  return {
    error: {
      code,
      message
    }
  };
}
