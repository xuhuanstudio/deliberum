import type { Resource } from "@deliberum/protocol";
import {
  recordResourceAccessGrantRevoked,
  type Clock,
  type IdGenerator
} from "@deliberum/core";
import {
  isBase64Variant,
  resourceSensitivityFromPrivacy,
  type ResourceBroker,
  type ResourceDeliveryPlan,
  type ResourceDeliveryPolicy,
  type ResourceDeliveryPolicyOverrides
} from "@deliberum/resources";
import type { Context, Hono } from "hono";
import type { EventStore } from "@deliberum/storage";
import type { DaemonEventBus } from "./event-stream";
import {
  classifyResourceAccessBaseUrl,
  createResourceAccessUrl,
  ResourceAccessError,
  type ResourceAccessGrant,
  type ResourceAccessGrantCreated,
  type ResourceAccessGrantStoreLike,
  toResourceAccessSafeView
} from "./resource-access-store";

export type ResourceAccessRouteOptions = {
  app: Hono;
  eventStore: EventStore;
  eventBus: DaemonEventBus;
  resourceAccessStore: ResourceAccessGrantStoreLike;
  resourceBroker: ResourceBroker;
  idGenerator: IdGenerator;
  clock?: Clock;
};

export type ResourceAccessDeliveryOptions = {
  resourceAccessStore: ResourceAccessGrantStoreLike;
  resourceAccessBaseUrl: string;
  resourceBroker: ResourceBroker;
  resource: Resource;
  idGenerator: IdGenerator;
  sessionId: string;
  resourceId: string;
  participantId: string;
  delivery: ResourceDeliveryPlan;
  policy?: ResourceDeliveryPolicy;
  ttlMs?: number;
  onAccessGrantCreated?: (created: ResourceAccessGrantCreated) => void;
};

export type ResourceAccessSafeErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export function registerResourceAccessRoutes(
  options: ResourceAccessRouteOptions
): void {
  const { app, resourceAccessStore, resourceBroker } = options;

  app.get("/resource-access/:accessId", (context) => {
    const grant = resourceAccessStore.recordAccess(context.req.param("accessId"));

    if (grant.mode === "content") {
      const content = resourceBroker.getExplicitInMemoryContent(grant.content.dataRef);

      if (content === undefined) {
        throw new ResourceAccessError(
          "resource_access_content_unavailable",
          "Resource access content is unavailable."
        );
      }

      const decoded = decodeStrictBase64(content);
      if (!decoded || decoded.byteLength > grant.content.sizeBytes) {
        throw new ResourceAccessError(
          "resource_access_content_unavailable",
          "Resource access content is unavailable."
        );
      }

      const body = decoded.buffer.slice(
        decoded.byteOffset,
        decoded.byteOffset + decoded.byteLength
      ) as ArrayBuffer;
      const response = new Response(body, {
        status: 200,
        headers: {
          "Content-Type": grant.content.mime,
          "Content-Length": String(decoded.byteLength)
        }
      });
      setNoStoreHeaders(response);
      response.headers.set("X-Content-Type-Options", "nosniff");

      return response;
    }

    const response = context.redirect(grant.targetUrl, 302);
    setNoStoreHeaders(response);
    response.headers.set("X-Content-Type-Options", "nosniff");

    return response;
  });

  app.post("/resource-access/:accessId/revoke", (context) => {
    const grant = resourceAccessStore.revokeGrant(context.req.param("accessId"));
    const audit = recordResourceAccessGrantRevoked(
      {
        sessionId: grant.sessionId,
        resourceAccessId: grant.resourceAccessId,
        resourceId: grant.resourceId,
        participantId: grant.participantId,
        grant: createResourceAccessGrantAuditSummary(grant),
        revokedAt: grant.revokedAt
          ? new Date(grant.revokedAt).toISOString()
          : new Date().toISOString(),
        idempotencyKey: `resource-access-revoked:${grant.resourceAccessId}`
      },
      {
        eventStore: options.eventStore,
        idGenerator: options.idGenerator,
        clock: options.clock
      }
    );

    if (audit.appended) {
      options.eventBus.publish(audit.accessEvent);
    }

    return noStoreJson(context, {
      revoked: true,
      grant: toResourceAccessSafeView(grant)
    });
  });
}

export function createResourceAccessDeliveryPlan(
  options: ResourceAccessDeliveryOptions
): ResourceDeliveryPlan {
  const material = options.delivery.delivery;

  if (options.delivery.allowed && material?.mode === "url") {
    return createRedirectAccessDeliveryPlan(options, material);
  }

  return createHostedContentAccessDeliveryPlan(options) ?? options.delivery;
}

export function createResourceAccessGrantAuditSummary(grant: ResourceAccessGrant) {
  return {
    mode: grant.mode,
    exposure: grant.exposure,
    tokenHash: grant.tokenHash,
    expiresAt: new Date(grant.expiresAt).toISOString(),
    ...(grant.mode === "content"
      ? {
          content: {
            mime: grant.content.mime,
            sizeBytes: grant.content.sizeBytes,
            hash: grant.content.hash
          }
        }
      : {})
  };
}

function createRedirectAccessDeliveryPlan(
  options: ResourceAccessDeliveryOptions,
  material: NonNullable<ResourceDeliveryPlan["delivery"]> & { mode: "url" }
): ResourceDeliveryPlan {
  const sourceExpiresAt = material.expiresAt ? Date.parse(material.expiresAt) : undefined;
  const grant = options.resourceAccessStore.createGrant({
    resourceAccessId: options.idGenerator(),
    sessionId: options.sessionId,
    resourceId: options.resourceId,
    participantId: options.participantId,
    mode: "redirect",
    targetUrl: material.url,
    exposure: material.exposure,
    ttlMs: options.ttlMs,
    expiresAt:
      sourceExpiresAt !== undefined && Number.isFinite(sourceExpiresAt)
        ? sourceExpiresAt
        : undefined
  });
  options.onAccessGrantCreated?.(grant);
  const accessUrl = createResourceAccessUrl(
    options.resourceAccessBaseUrl,
    grant.accessId
  );

  return {
    ...options.delivery,
    warnings: [
      ...options.delivery.warnings,
      "URL delivery uses a revocable daemon resource access grant."
    ],
    delivery: {
      mode: "url",
      url: accessUrl,
      exposure: classifyResourceAccessBaseUrl(options.resourceAccessBaseUrl),
      expiresAt: new Date(grant.grant.expiresAt).toISOString()
    }
  };
}

function createHostedContentAccessDeliveryPlan(
  options: ResourceAccessDeliveryOptions
): ResourceDeliveryPlan | undefined {
  const policy = resolvePolicyForParticipant(options.policy, options.participantId);

  if (!isUrlModeEligible(policy)) {
    return undefined;
  }

  if (policy.allowHostedContentUrl !== true) {
    return undefined;
  }

  if (
    policy.maxHostedContentSizeBytes === undefined ||
    !Number.isInteger(policy.maxHostedContentSizeBytes) ||
    policy.maxHostedContentSizeBytes < 0
  ) {
    return createNonePlan(
      options,
      "Hosted content URL delivery requires maxHostedContentSizeBytes policy."
    );
  }

  const exposure = classifyResourceAccessBaseUrl(options.resourceAccessBaseUrl);
  const exposureDenial = getHostedContentExposureDenialReason(
    exposure,
    options.resource.privacy,
    policy
  );

  if (exposureDenial) {
    return createNonePlan(options, exposureDenial);
  }

  for (const variant of options.resource.variants.filter(isBase64Variant)) {
    const content = options.resourceBroker.getExplicitInMemoryContent(variant.dataRef);
    if (content === undefined) {
      continue;
    }

    const decoded = decodeStrictBase64(content);
    if (!decoded) {
      return createNonePlan(
        options,
        "In-memory base64 content is not safe for hosted URL delivery."
      );
    }

    if (decoded.byteLength > policy.maxHostedContentSizeBytes) {
      return createNonePlan(
        options,
        "Hosted content exceeds the configured size limit."
      );
    }

    if (decoded.byteLength > variant.sizeBytes) {
      return createNonePlan(
        options,
        "In-memory base64 content does not match registered resource metadata."
      );
    }

    const decodedText = decodeValidUtf8(decoded);
    if (decodedText !== undefined && containsSecretLikeText(decodedText)) {
      return createNonePlan(
        options,
        "In-memory base64 content contains private delivery material."
      );
    }

    const grant = options.resourceAccessStore.createGrant({
      resourceAccessId: options.idGenerator(),
      sessionId: options.sessionId,
      resourceId: options.resourceId,
      participantId: options.participantId,
      mode: "content",
      content: {
        dataRef: variant.dataRef,
        mime: variant.mime,
        sizeBytes: decoded.byteLength,
        hash: options.resource.hash
      },
      exposure,
      ttlMs: options.ttlMs
    });
    options.onAccessGrantCreated?.(grant);
    const accessUrl = createResourceAccessUrl(
      options.resourceAccessBaseUrl,
      grant.accessId
    );

    return {
      resourceId: options.resourceId,
      participantId: options.participantId,
      selectedMode: "url",
      allowed: true,
      reason: "Hosted content URL delivery is explicitly allowed by policy.",
      warnings: [
        "Hosted content URL delivery serves resource content through a revocable daemon grant."
      ],
      delivery: {
        mode: "url",
        url: accessUrl,
        exposure,
        expiresAt: new Date(grant.grant.expiresAt).toISOString()
      }
    };
  }

  return createNonePlan(
    options,
    "Resource has no hostable in-memory base64 content."
  );
}

function resolvePolicyForParticipant(
  policy: ResourceDeliveryPolicy | undefined,
  participantId: string
): ResourceDeliveryPolicyOverrides {
  const { participantOverrides, ...base } = policy ?? {};

  return {
    ...base,
    ...participantOverrides?.[participantId]
  };
}

function isUrlModeEligible(policy: ResourceDeliveryPolicyOverrides): boolean {
  if (policy.requestedMode !== undefined) {
    return policy.requestedMode === "url";
  }

  if (policy.preferredModes && policy.preferredModes.length > 0) {
    return policy.preferredModes.includes("url");
  }

  return true;
}

function getHostedContentExposureDenialReason(
  exposure: "localhost" | "lan" | "public",
  privacy: Resource["privacy"],
  policy: ResourceDeliveryPolicyOverrides
): string | undefined {
  const sensitivity = resourceSensitivityFromPrivacy(privacy);

  if (exposure === "public" && sensitivity !== "public") {
    return "Public hosted content URL exposure is only allowed for public resources.";
  }

  if (exposure === "localhost" && policy.allowLocalhostUrl !== true) {
    return "Hosted content URL delivery requires allowLocalhostUrl policy.";
  }

  if (exposure === "lan" && policy.allowLanUrl !== true) {
    return "Hosted content URL delivery requires allowLanUrl policy.";
  }

  if (exposure === "public" && policy.allowPublicUrl !== true) {
    return "Hosted content URL delivery requires allowPublicUrl policy.";
  }

  return undefined;
}

function createNonePlan(
  options: Pick<ResourceAccessDeliveryOptions, "resourceId" | "participantId">,
  reason: string
): ResourceDeliveryPlan {
  return {
    resourceId: options.resourceId,
    participantId: options.participantId,
    selectedMode: "none",
    allowed: false,
    reason,
    warnings: []
  };
}

export function handleResourceAccessRouteError(
  context: Context,
  error: Error
): Response | undefined {
  if (!context.req.path.startsWith("/resource-access/")) {
    return undefined;
  }

  if (error instanceof ResourceAccessError) {
    return noStoreJson(context, createErrorResponse(error.code, error.message), 400);
  }

  return noStoreJson(
    context,
    createErrorResponse(
      "resource_access_failed",
      "Resource access request could not be processed."
    ),
    400
  );
}

function noStoreJson(context: Context, payload: unknown, status: 200 | 400 = 200): Response {
  const response = context.json(payload, status);
  setNoStoreHeaders(response);

  return response;
}

function setNoStoreHeaders(response: Response): void {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
}

function createErrorResponse(
  code: string,
  message: string
): ResourceAccessSafeErrorResponse {
  return {
    error: {
      code,
      message
    }
  };
}

function decodeStrictBase64(value: string): Uint8Array | undefined {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return undefined;
  }

  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : undefined;
}

function decodeValidUtf8(bytes: Uint8Array): string | undefined {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const encoded = new TextEncoder().encode(text);

    if (encoded.byteLength !== bytes.byteLength) {
      return undefined;
    }

    for (let index = 0; index < encoded.byteLength; index += 1) {
      if (encoded[index] !== bytes[index]) {
        return undefined;
      }
    }

    return text;
  } catch {
    return undefined;
  }
}

function containsSecretLikeText(value: string): boolean {
  return /api[_-]?key|apikey|secret|private[_-]?token|access[_-]?token|auth(orization)?|bearer\s+|signature|sig=|sk-[a-z0-9]|token[=:/?&]|[?&]token=/i.test(value);
}
