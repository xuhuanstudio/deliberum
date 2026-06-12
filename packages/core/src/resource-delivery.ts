import {
  ResourceAccessGrantCreatedPayloadSchema,
  ResourceAccessGrantRevokedPayloadSchema,
  ResourceDeliveryPlannedPayloadSchema,
  type EventEnvelope,
  type ResourceAccessGrantCreatedPayload,
  type ResourceAccessGrantRevokedPayload,
  type ResourceDeliveryPlannedPayload
} from "@deliberum/protocol";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import {
  InvalidResourceAccessAuditInputError,
  InvalidResourceDeliveryAuditInputError,
  MissingSessionDependencyError
} from "./errors";
import { DEFAULT_SCHEMA_VERSION, type Clock, type IdGenerator } from "./session";

export const RESOURCE_DELIVERY_PLANNED_EVENT_TYPE =
  "resource_delivery_planned" as const;
export const RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE =
  "resource_access_grant_created" as const;
export const RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE =
  "resource_access_grant_revoked" as const;

export type RecordResourceDeliveryPlanInput = Omit<
  ResourceDeliveryPlannedPayload,
  "id"
> & {
  sessionId: string;
  basedOnEventIds?: readonly string[];
  idempotencyKey?: string;
};

export type ResourceDeliveryAuditOptions = {
  eventStore: EventStore;
  idGenerator: IdGenerator;
  clock?: Clock;
  schemaVersion?: string;
};

export type RecordResourceAccessGrantCreatedInput = Omit<
  ResourceAccessGrantCreatedPayload,
  "id"
> & {
  sessionId: string;
  basedOnEventIds?: readonly string[];
  idempotencyKey?: string;
};

export type RecordResourceAccessGrantRevokedInput = Omit<
  ResourceAccessGrantRevokedPayload,
  "id"
> & {
  sessionId: string;
  basedOnEventIds?: readonly string[];
  idempotencyKey?: string;
};

export type RecordResourceDeliveryPlanResult = {
  deliveryEvent: StoredEvent<ResourceDeliveryPlannedPayload>;
  appended: boolean;
};

export type RecordResourceAccessGrantCreatedResult = {
  accessEvent: StoredEvent<ResourceAccessGrantCreatedPayload>;
  appended: boolean;
};

export type RecordResourceAccessGrantRevokedResult = {
  accessEvent: StoredEvent<ResourceAccessGrantRevokedPayload>;
  appended: boolean;
};

export type ResourceDeliveryPlannedEvent =
  EventEnvelope<ResourceDeliveryPlannedPayload>;
export type ResourceAccessGrantCreatedEvent =
  EventEnvelope<ResourceAccessGrantCreatedPayload>;
export type ResourceAccessGrantRevokedEvent =
  EventEnvelope<ResourceAccessGrantRevokedPayload>;

export function recordResourceDeliveryPlan(
  input: RecordResourceDeliveryPlanInput,
  options: ResourceDeliveryAuditOptions
): RecordResourceDeliveryPlanResult {
  assertOptions(options);

  const payload = parseResourceDeliveryPlannedPayload({
    id: options.idGenerator(),
    resourceId: input.resourceId,
    participantId: input.participantId,
    resource: input.resource,
    request: input.request,
    result: input.result
  });
  const appendResult = options.eventStore.appendEventResult<ResourceDeliveryPlannedPayload>({
    id: options.idGenerator(),
    sessionId: input.sessionId,
    schemaVersion: options.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
    type: RESOURCE_DELIVERY_PLANNED_EVENT_TYPE,
    authorId: "system",
    createdAt: getClock(options)(),
    basedOnEventIds: [...(input.basedOnEventIds ?? [])],
    visibility: "public",
    idempotencyKey: input.idempotencyKey,
    trace: {
      participantId: input.participantId,
      resourceDeliveryIds: [payload.id]
    },
    payload
  });

  return {
    deliveryEvent: appendResult.event,
    appended: appendResult.appended
  };
}

export function recordResourceAccessGrantCreated(
  input: RecordResourceAccessGrantCreatedInput,
  options: ResourceDeliveryAuditOptions
): RecordResourceAccessGrantCreatedResult {
  assertOptions(options);

  const payload = parseResourceAccessGrantCreatedPayload({
    id: options.idGenerator(),
    resourceAccessId: input.resourceAccessId,
    resourceId: input.resourceId,
    participantId: input.participantId,
    resource: input.resource,
    grant: input.grant
  });
  const appendResult =
    options.eventStore.appendEventResult<ResourceAccessGrantCreatedPayload>({
      id: options.idGenerator(),
      sessionId: input.sessionId,
      schemaVersion: options.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
      type: RESOURCE_ACCESS_GRANT_CREATED_EVENT_TYPE,
      authorId: "system",
      createdAt: getClock(options)(),
      basedOnEventIds: [...(input.basedOnEventIds ?? [])],
      visibility: "public",
      idempotencyKey: input.idempotencyKey,
      trace: {
        participantId: input.participantId,
        resourceDeliveryIds: [payload.resourceAccessId]
      },
      payload
    });

  return {
    accessEvent: appendResult.event,
    appended: appendResult.appended
  };
}

export function recordResourceAccessGrantRevoked(
  input: RecordResourceAccessGrantRevokedInput,
  options: ResourceDeliveryAuditOptions
): RecordResourceAccessGrantRevokedResult {
  assertOptions(options);

  const payload = parseResourceAccessGrantRevokedPayload({
    id: options.idGenerator(),
    resourceAccessId: input.resourceAccessId,
    resourceId: input.resourceId,
    participantId: input.participantId,
    grant: input.grant,
    revokedAt: input.revokedAt
  });
  const appendResult =
    options.eventStore.appendEventResult<ResourceAccessGrantRevokedPayload>({
      id: options.idGenerator(),
      sessionId: input.sessionId,
      schemaVersion: options.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
      type: RESOURCE_ACCESS_GRANT_REVOKED_EVENT_TYPE,
      authorId: "system",
      createdAt: getClock(options)(),
      basedOnEventIds: [...(input.basedOnEventIds ?? [])],
      visibility: "public",
      idempotencyKey: input.idempotencyKey,
      trace: {
        participantId: input.participantId,
        resourceDeliveryIds: [payload.resourceAccessId]
      },
      payload
    });

  return {
    accessEvent: appendResult.event,
    appended: appendResult.appended
  };
}

function parseResourceDeliveryPlannedPayload(
  input: unknown
): ResourceDeliveryPlannedPayload {
  const parsed = ResourceDeliveryPlannedPayloadSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidResourceDeliveryAuditInputError(parsed.error.message);
  }

  return parsed.data;
}

function parseResourceAccessGrantCreatedPayload(
  input: unknown
): ResourceAccessGrantCreatedPayload {
  const parsed = ResourceAccessGrantCreatedPayloadSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidResourceAccessAuditInputError(parsed.error.message);
  }

  return parsed.data;
}

function parseResourceAccessGrantRevokedPayload(
  input: unknown
): ResourceAccessGrantRevokedPayload {
  const parsed = ResourceAccessGrantRevokedPayloadSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidResourceAccessAuditInputError(parsed.error.message);
  }

  return parsed.data;
}

function assertOptions(options: ResourceDeliveryAuditOptions): void {
  if (!options.eventStore) {
    throw new MissingSessionDependencyError(
      "resource delivery audit requires an EventStore."
    );
  }

  if (!options.idGenerator) {
    throw new MissingSessionDependencyError(
      "resource delivery audit requires an id generator."
    );
  }
}

function getClock(options: ResourceDeliveryAuditOptions): Clock {
  return options.clock ?? (() => new Date().toISOString());
}
