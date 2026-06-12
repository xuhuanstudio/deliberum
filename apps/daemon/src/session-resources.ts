import {
  RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE,
  RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE,
  RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
  projectAcceptedDeliberationObjects
} from "@deliberum/core";
import type {
  ResourceAccessGrantCreatedPayload,
  ResourceAccessGrantRevokedPayload,
  ResourceDeliveryPlannedPayload,
  ResourceVariant
} from "@deliberum/protocol";
import type {
  DeliberationRunRecord,
  RunResourceReference,
  RunStore
} from "@deliberum/orchestrator";
import type { ResourceBroker } from "@deliberum/resources";
import type { EventStore, StoredEvent } from "@deliberum/storage";

export type SafeResourceVariantView =
  | {
      mode: "url";
      exposure: string;
      expiresAt?: string;
    }
  | {
      mode: "base64";
      mime: string;
      sizeBytes: number;
    }
  | {
      mode: "summary" | "ocr" | "caption";
      textLength: number;
    };

export type SafeResourceView = {
  id: string;
  kind: string;
  mime: string;
  sizeBytes: number;
  hash: string;
  privacy: string;
  variants: SafeResourceVariantView[];
};

export type SessionResourceProjectionEntry = {
  reference: RunResourceReference;
  registered: boolean;
  resource?: SafeResourceView;
};

export type SessionResourceDeliveryAuditView = {
  eventId: string;
  sequence: number;
  createdAt: string;
  recordedAt: string;
  basedOnEventIds: string[];
  resourceDeliveryId: string;
  resourceId: string;
  participantId: string;
  resource: ResourceDeliveryPlannedPayload["resource"];
  request: ResourceDeliveryPlannedPayload["request"];
  result: ResourceDeliveryPlannedPayload["result"];
};

export type SessionResourceAccessAuditView = {
  eventId: string;
  sequence: number;
  createdAt: string;
  recordedAt: string;
  basedOnEventIds: string[];
  action: "created" | "revoked";
  resourceAccessId: string;
  resourceId: string;
  participantId: string;
  grant: ResourceAccessGrantCreatedPayload["grant"];
  resource?: ResourceAccessGrantCreatedPayload["resource"];
  revokedAt?: string;
};

export type SessionResourcesProjection = {
  sessionId: string;
  source: {
    kind: "run_plan" | "none";
    runId?: string;
  };
  plannedResources: SessionResourceProjectionEntry[];
  deliveryAudits: SessionResourceDeliveryAuditView[];
  accessAudits: SessionResourceAccessAuditView[];
  evidenceNeeds: unknown[];
  projection: unknown;
};

export type BuildSessionResourcesProjectionInput = {
  eventStore: EventStore;
  runStore: RunStore;
  resourceBroker: ResourceBroker;
  sessionId: string;
};

export function buildSessionResourcesProjection(
  input: BuildSessionResourcesProjectionInput
): SessionResourcesProjection {
  const run = findRunForSession(input.runStore, input.sessionId);
  const acceptedObjects = projectAcceptedDeliberationObjects({
    eventStore: input.eventStore,
    sessionId: input.sessionId
  });
  const resourceRefs = run?.plan.resources ?? [];

  return {
    sessionId: input.sessionId,
    source: run ? { kind: "run_plan", runId: run.id } : { kind: "none" },
    plannedResources: resourceRefs.map((reference) =>
      createResourceProjectionEntry(input.resourceBroker, reference)
    ),
    deliveryAudits: listResourceDeliveryAudits(input.eventStore, input.sessionId),
    accessAudits: listResourceAccessAudits(input.eventStore, input.sessionId),
    evidenceNeeds: acceptedObjects.evidenceNeeds,
    projection: acceptedObjects.projection
  };
}

function listResourceAccessAudits(
  eventStore: EventStore,
  sessionId: string
): SessionResourceAccessAuditView[] {
  const created = eventStore
    .listEventsByType(sessionId, RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE)
    .map((event) =>
      createAccessGrantCreatedAuditView(
        event as StoredEvent<ResourceAccessGrantCreatedPayload>
      )
    );
  const revoked = eventStore
    .listEventsByType(sessionId, RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE)
    .map((event) =>
      createAccessGrantRevokedAuditView(
        event as StoredEvent<ResourceAccessGrantRevokedPayload>
      )
    );

  return [...created, ...revoked].sort((left, right) => left.sequence - right.sequence);
}

function createAccessGrantCreatedAuditView(
  event: StoredEvent<ResourceAccessGrantCreatedPayload>
): SessionResourceAccessAuditView {
  const payload = structuredClone(event.payload) as ResourceAccessGrantCreatedPayload;

  return {
    eventId: event.id,
    sequence: event.sequence,
    createdAt: event.createdAt,
    recordedAt: event.recordedAt,
    basedOnEventIds: [...event.basedOnEventIds],
    action: "created",
    resourceAccessId: payload.resourceAccessId,
    resourceId: payload.resourceId,
    participantId: payload.participantId,
    resource: payload.resource,
    grant: payload.grant
  };
}

function createAccessGrantRevokedAuditView(
  event: StoredEvent<ResourceAccessGrantRevokedPayload>
): SessionResourceAccessAuditView {
  const payload = structuredClone(event.payload) as ResourceAccessGrantRevokedPayload;

  return {
    eventId: event.id,
    sequence: event.sequence,
    createdAt: event.createdAt,
    recordedAt: event.recordedAt,
    basedOnEventIds: [...event.basedOnEventIds],
    action: "revoked",
    resourceAccessId: payload.resourceAccessId,
    resourceId: payload.resourceId,
    participantId: payload.participantId,
    grant: payload.grant,
    revokedAt: payload.revokedAt
  };
}

function listResourceDeliveryAudits(
  eventStore: EventStore,
  sessionId: string
): SessionResourceDeliveryAuditView[] {
  return eventStore
    .listEventsByType(sessionId, RESOURCE_DELIVERY_PLANNED_EVENT_TYPE)
    .map((event) =>
      createDeliveryAuditView(event as StoredEvent<ResourceDeliveryPlannedPayload>)
    )
    .sort((left, right) => left.sequence - right.sequence);
}

function createDeliveryAuditView(
  event: StoredEvent<ResourceDeliveryPlannedPayload>
): SessionResourceDeliveryAuditView {
  const payload = structuredClone(event.payload) as ResourceDeliveryPlannedPayload;

  return {
    eventId: event.id,
    sequence: event.sequence,
    createdAt: event.createdAt,
    recordedAt: event.recordedAt,
    basedOnEventIds: [...event.basedOnEventIds],
    resourceDeliveryId: payload.id,
    resourceId: payload.resourceId,
    participantId: payload.participantId,
    resource: payload.resource,
    request: payload.request,
    result: payload.result
  };
}

function findRunForSession(
  runStore: RunStore,
  sessionId: string
): DeliberationRunRecord | undefined {
  return runStore
    .listRuns()
    .filter((run) => run.sessionId === sessionId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(0);
}

function createResourceProjectionEntry(
  resourceBroker: ResourceBroker,
  reference: RunResourceReference
): SessionResourceProjectionEntry {
  const resource = resourceBroker.getResource(reference.resourceId);

  if (!resource) {
    return {
      reference: structuredClone(reference),
      registered: false
    };
  }

  return {
    reference: structuredClone(reference),
    registered: true,
    resource: sanitizeResourceView(resource)
  };
}

export function sanitizeResourceView(
  resource: NonNullable<ReturnType<ResourceBroker["getResource"]>>
): SafeResourceView {
  return {
    id: resource.id,
    kind: resource.kind,
    mime: resource.mime,
    sizeBytes: resource.sizeBytes,
    hash: resource.hash,
    privacy: resource.privacy,
    variants: resource.variants.map(sanitizeVariant)
  };
}

function sanitizeVariant(variant: ResourceVariant): SafeResourceVariantView {
  if (variant.mode === "url") {
    return {
      mode: "url",
      exposure: variant.exposure,
      ...(variant.expiresAt ? { expiresAt: variant.expiresAt } : {})
    };
  }

  if (variant.mode === "base64") {
    return {
      mode: "base64",
      mime: variant.mime,
      sizeBytes: variant.sizeBytes
    };
  }

  return {
    mode: variant.mode,
    textLength: variant.text.length
  };
}
