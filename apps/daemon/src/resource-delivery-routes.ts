import {
  recordResourceAccessGrantCreated,
  recordResourceDeliveryPlan,
  type Clock,
  type IdGenerator
} from "@deliberum/core";
import type { ResourceDeliveryPolicyAudit } from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import type { RunStore } from "@deliberum/orchestrator";
import {
  InvalidResourcePolicyError,
  ResourceNotFoundError,
  type DeliveryPlanner,
  type ResourceBroker,
  type ResourceDeliveryMode,
  type ResourceDeliveryPlan,
  type ResourceDeliveryPolicy
} from "@deliberum/resources";
import type { Context, Hono } from "hono";
import type { DaemonEventBus } from "./event-stream";
import {
  createResourceAccessDeliveryPlan,
  createResourceAccessGrantAuditSummary
} from "./resource-access-routes";
import type { ResourceAccessGrantStoreLike } from "./resource-access-store";
import {
  buildSessionResourcesProjection,
  sanitizeResourceView
} from "./session-resources";

export type ResourceDeliveryRouteOptions = {
  app: Hono;
  eventStore: EventStore;
  eventBus: DaemonEventBus;
  runStore: RunStore;
  resourceBroker: ResourceBroker;
  deliveryPlanner: DeliveryPlanner;
  resourceAccessStore: ResourceAccessGrantStoreLike;
  resourceAccessBaseUrl: string;
  resourceAccessUrlSigningSecret?: string;
  resourceAccessTtlMs?: number;
  idGenerator: IdGenerator;
  clock?: Clock;
};

export type ResourceDeliverySafeErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

class ResourceDeliveryRouteError extends Error {
  readonly code: string;
  readonly status: 400;
  readonly safeMessage: string;

  constructor(code: string, safeMessage: string, status: 400 = 400) {
    super(safeMessage);
    this.name = "ResourceDeliveryRouteError";
    this.code = code;
    this.status = status;
    this.safeMessage = safeMessage;
  }
}

export function registerResourceDeliveryRoutes(
  options: ResourceDeliveryRouteOptions
): void {
  const { app } = options;

  app.post("/sessions/:sessionId/resources/:resourceId/deliveries", async (context) => {
    const body = await readJsonObject(context);
    const sessionId = context.req.param("sessionId");
    const resourceId = context.req.param("resourceId");
    const participantId = parseParticipantId(body.participantId);
    const requestedPolicy = parseResourceDeliveryPolicy(body.policy);
    const projection = buildSessionResourcesProjection({
      eventStore: options.eventStore,
      runStore: options.runStore,
      resourceBroker: options.resourceBroker,
      sessionId
    });
    const entry = projection.plannedResources.find(
      (candidate) => candidate.reference.resourceId === resourceId
    );

    if (!entry) {
      throw new ResourceDeliveryRouteError(
        "resource_not_scoped",
        "Resource is not scoped to this session."
      );
    }

    if (!entry.registered) {
      throw new ResourceNotFoundError(resourceId);
    }

    const resource = options.resourceBroker.getResource(resourceId);
    if (!resource) {
      throw new ResourceNotFoundError(resourceId);
    }

    const effectivePolicy = mergePreferredDeliveryMode(
      entry.reference.preferredDeliveryMode,
      requestedPolicy
    );
    const delivery = options.deliveryPlanner.planDelivery({
      resourceId,
      participantId,
      policy: effectivePolicy
    });
    const safeDelivery = createResourceAccessDeliveryPlan({
      resourceAccessStore: options.resourceAccessStore,
      resourceAccessBaseUrl: options.resourceAccessBaseUrl,
      resourceAccessUrlSigningSecret: options.resourceAccessUrlSigningSecret,
      resourceBroker: options.resourceBroker,
      resource,
      idGenerator: options.idGenerator,
      sessionId,
      resourceId,
      participantId,
      delivery,
      policy: effectivePolicy,
      ttlMs: options.resourceAccessTtlMs,
      onAccessGrantCreated: (created) => {
        const accessAudit = recordResourceAccessGrantCreated(
          {
            sessionId,
            resourceAccessId: created.grant.resourceAccessId,
            resourceId,
            participantId,
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
    const policyAudit = createPolicyAudit(effectivePolicy, participantId);
    const audit = recordResourceDeliveryPlan(
      {
        sessionId,
        resourceId,
        participantId,
        resource: {
          kind: resource.kind,
          mime: resource.mime,
          sizeBytes: resource.sizeBytes,
          hash: resource.hash,
          privacy: resource.privacy
        },
        request: policyAudit ? { policy: policyAudit } : {},
        result: createDeliveryAuditResult(safeDelivery),
        idempotencyKey: parseOptionalIdempotencyKey(body.idempotencyKey)
      },
      {
        eventStore: options.eventStore,
        idGenerator: options.idGenerator,
        clock: options.clock
      }
    );

    if (audit.appended) {
      options.eventBus.publish(audit.deliveryEvent);
    }

    return noStoreJson(context, {
      sessionId,
      resource: sanitizeResourceView(resource),
      delivery: safeDelivery,
      auditEvent: createSafeAuditEventView(audit.deliveryEvent, audit.appended)
    });
  });
}

export function handleResourceDeliveryRouteError(
  context: Context,
  error: Error
): Response | undefined {
  if (error instanceof ResourceDeliveryRouteError) {
    return noStoreJson(
      context,
      createErrorResponse(error.code, error.safeMessage),
      error.status
    );
  }

  if (error instanceof ResourceNotFoundError) {
    return noStoreJson(
      context,
      createErrorResponse("resource_not_found", "Resource was not found."),
      400
    );
  }

  if (error instanceof InvalidResourcePolicyError) {
    return noStoreJson(
      context,
      createErrorResponse("invalid_resource_policy", error.message),
      400
    );
  }

  return undefined;
}

async function readJsonObject(context: Context): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await context.req.json();
  } catch {
    throw new ResourceDeliveryRouteError("invalid_json", "Request body must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ResourceDeliveryRouteError("invalid_json", "Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function parseParticipantId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ResourceDeliveryRouteError(
      "invalid_participant_id",
      "participantId must be a non-empty string."
    );
  }

  return value.trim();
}

function parseResourceDeliveryPolicy(value: unknown): ResourceDeliveryPolicy | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ResourceDeliveryRouteError(
      "invalid_resource_policy",
      "Resource delivery policy must be a JSON object."
    );
  }

  return value as ResourceDeliveryPolicy;
}

function parseOptionalIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ResourceDeliveryRouteError(
      "invalid_idempotency_key",
      "idempotencyKey must be a non-empty string."
    );
  }

  return value.trim();
}

function mergePreferredDeliveryMode(
  preferredDeliveryMode: "url" | "base64" | "none" | undefined,
  policy: ResourceDeliveryPolicy | undefined
): ResourceDeliveryPolicy | undefined {
  if (!preferredDeliveryMode) {
    return policy;
  }

  if (!policy) {
    return {
      preferredModes: [preferredDeliveryMode]
    };
  }

  if (
    policy.requestedMode !== undefined ||
    (Array.isArray(policy.preferredModes) && policy.preferredModes.length > 0)
  ) {
    return policy;
  }

  return {
    ...policy,
    preferredModes: [preferredDeliveryMode]
  };
}

function createPolicyAudit(
  policy: ResourceDeliveryPolicy | undefined,
  participantId: string
): ResourceDeliveryPolicyAudit | undefined {
  if (!policy) {
    return undefined;
  }

  const merged = {
    ...stripParticipantOverrides(policy),
    ...policy.participantOverrides?.[participantId]
  };
  const audit: ResourceDeliveryPolicyAudit = {
    ...(merged.requestedMode ? { requestedMode: merged.requestedMode } : {}),
    ...(merged.preferredModes && merged.preferredModes.length > 0
      ? { preferredModes: [...merged.preferredModes] }
      : {}),
    ...(merged.allowLocalhostUrl !== undefined
      ? { allowLocalhostUrl: merged.allowLocalhostUrl }
      : {}),
    ...(merged.allowLanUrl !== undefined ? { allowLanUrl: merged.allowLanUrl } : {}),
    ...(merged.allowPublicUrl !== undefined
      ? { allowPublicUrl: merged.allowPublicUrl }
      : {}),
    ...(merged.allowBase64 !== undefined ? { allowBase64: merged.allowBase64 } : {}),
    ...(merged.maxBase64SizeBytes !== undefined
      ? { maxBase64SizeBytes: merged.maxBase64SizeBytes }
      : {}),
    ...(merged.allowHostedContentUrl !== undefined
      ? { allowHostedContentUrl: merged.allowHostedContentUrl }
      : {}),
    ...(merged.maxHostedContentSizeBytes !== undefined
      ? { maxHostedContentSizeBytes: merged.maxHostedContentSizeBytes }
      : {})
  };

  return Object.keys(audit).length > 0 ? audit : undefined;
}

function stripParticipantOverrides(
  policy: ResourceDeliveryPolicy
): Omit<ResourceDeliveryPolicy, "participantOverrides"> {
  const { participantOverrides: _participantOverrides, ...rest } = policy;

  return rest;
}

function createDeliveryAuditResult(delivery: ResourceDeliveryPlan): {
  selectedMode: ResourceDeliveryMode;
  allowed: boolean;
  reason: string;
  warnings: string[];
  materialKind?: "url" | "base64";
} {
  return {
    selectedMode: delivery.selectedMode,
    allowed: delivery.allowed,
    reason: delivery.reason,
    warnings: [...delivery.warnings],
    ...(delivery.delivery ? { materialKind: delivery.delivery.mode } : {})
  };
}

function createSafeAuditEventView(
  event: StoredEvent,
  appended: boolean
): { id: string; type: string; appended: boolean } {
  return {
    id: event.id,
    type: event.type,
    appended
  };
}

function noStoreJson(
  context: Context,
  payload: unknown,
  status: 200 | 400 = 200
): Response {
  const response = context.json(payload, status);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");

  return response;
}

function createErrorResponse(
  code: string,
  message: string
): ResourceDeliverySafeErrorResponse {
  return {
    error: {
      code,
      message
    }
  };
}
