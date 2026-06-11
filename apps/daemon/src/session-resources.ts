import { projectAcceptedDeliberationObjects } from "@deliberum/core";
import type { ResourceVariant } from "@deliberum/protocol";
import type {
  DeliberationRunRecord,
  RunResourceReference,
  RunStore
} from "@deliberum/orchestrator";
import type { ResourceBroker } from "@deliberum/resources";
import type { EventStore } from "@deliberum/storage";

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

export type SessionResourcesProjection = {
  sessionId: string;
  source: {
    kind: "run_plan" | "none";
    runId?: string;
  };
  plannedResources: SessionResourceProjectionEntry[];
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
    evidenceNeeds: acceptedObjects.evidenceNeeds,
    projection: acceptedObjects.projection
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
    resource: sanitizeResource(resource)
  };
}

function sanitizeResource(
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
