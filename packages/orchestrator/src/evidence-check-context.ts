import {
  projectAcceptedDeliberationObjects,
  type DerivedClaim,
  type DerivedEvidenceNeed
} from "@deliberum/core";
import type { StoredEvent } from "@deliberum/storage";
import { EvidenceCheckContextError } from "./errors";
import type {
  BuildEvidenceCheckContextInput,
  EvidenceCheckContext
} from "./types";

const OPEN_EVIDENCE_NEED_STATUSES = new Set(["open", "in_progress", "unresolved"]);

export function buildEvidenceCheckContext(
  input: BuildEvidenceCheckContextInput
): EvidenceCheckContext {
  const events = input.eventStore
    .listEvents(input.run.sessionId)
    .sort((left, right) => left.sequence - right.sequence);
  const acceptedObjects = projectAcceptedDeliberationObjects({
    events,
    sessionId: input.run.sessionId
  });
  const targetEvidenceNeedIds = resolveTargetEvidenceNeedIds(
    input.targetEvidenceNeedIds,
    acceptedObjects.evidenceNeeds
  );
  const targetEvidenceNeedIdSet = new Set(targetEvidenceNeedIds);
  const targetEvidenceNeeds = targetEvidenceNeedIds.map((targetEvidenceNeedId) => {
    const evidenceNeed = acceptedObjects.evidenceNeeds.find(
      (candidate) => candidate.object.id === targetEvidenceNeedId
    );

    if (!evidenceNeed) {
      throw new EvidenceCheckContextError(
        "Evidence check targets must be accepted evidence needs."
      );
    }

    return structuredClone(evidenceNeed);
  });
  const targetClaimIds = new Set(
    targetEvidenceNeeds.map((evidenceNeed) => evidenceNeed.object.targetClaimId)
  );
  const targetClaims = uniqueDerivedClaimsById(
    acceptedObjects.claims.filter((claim) => targetClaimIds.has(claim.object.id))
  );

  if (targetClaims.length !== targetClaimIds.size) {
    throw new EvidenceCheckContextError(
      "Evidence check target claims must be accepted claim objects."
    );
  }

  for (const evidenceNeed of targetEvidenceNeeds) {
    if (!targetEvidenceNeedIdSet.has(evidenceNeed.object.id)) {
      throw new EvidenceCheckContextError("Evidence check target resolution failed.");
    }
  }

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    topic: input.run.plan.topic,
    goals: [...input.run.plan.goals],
    constraints: [...input.run.plan.constraints],
    output: structuredClone(input.run.plan.output),
    targetEvidenceNeeds,
    targetClaims: targetClaims.map((claim) => structuredClone(claim)),
    acceptedObjects: structuredClone(acceptedObjects),
    metadata: {
      version: "1",
      targetEvidenceNeedIds,
      eventRange: createEventRange(events),
      eventIds: events.map((event) => event.id)
    }
  };
}

function resolveTargetEvidenceNeedIds(
  requestedTargetEvidenceNeedIds: readonly string[] | undefined,
  evidenceNeeds: readonly DerivedEvidenceNeed[]
): string[] {
  const acceptedEvidenceNeedIds = new Set(
    evidenceNeeds.map((evidenceNeed) => evidenceNeed.object.id)
  );
  const targetEvidenceNeedIds = requestedTargetEvidenceNeedIds?.length
    ? unique(requestedTargetEvidenceNeedIds)
    : unique(
        evidenceNeeds
          .filter((evidenceNeed) => OPEN_EVIDENCE_NEED_STATUSES.has(evidenceNeed.object.status))
          .map((evidenceNeed) => evidenceNeed.object.id)
      );

  if (targetEvidenceNeedIds.length === 0) {
    throw new EvidenceCheckContextError(
      "Evidence check requires at least one accepted open evidence need."
    );
  }

  for (const targetEvidenceNeedId of targetEvidenceNeedIds) {
    if (!acceptedEvidenceNeedIds.has(targetEvidenceNeedId)) {
      throw new EvidenceCheckContextError(
        "Evidence check targets must be accepted evidence needs."
      );
    }
  }

  return targetEvidenceNeedIds;
}

function createEventRange(events: readonly StoredEvent[]) {
  return events.length === 0
    ? null
    : {
        fromSequence: events[0]!.sequence,
        toSequence: events[events.length - 1]!.sequence
      };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueDerivedClaimsById(claims: readonly DerivedClaim[]): DerivedClaim[] {
  const byId = new Map<string, DerivedClaim>();

  for (const claim of claims) {
    if (!byId.has(claim.object.id)) {
      byId.set(claim.object.id, claim);
    }
  }

  return [...byId.values()];
}
