import {
  projectAcceptedDeliberationObjects,
  projectCandidateFrontier,
  type DerivedCandidate,
  type DerivedObjection,
  type DerivedQualityObligation
} from "@deliberum/core";
import type { StoredEvent } from "@deliberum/storage";
import { CandidateRepairContextError } from "./errors";
import type {
  BuildCandidateRepairContextInput,
  CandidateRepairContext
} from "./types";

const UNRESOLVED_OBJECTION_STATUSES = new Set([
  "open",
  "partially_answered",
  "accepted",
  "unresolved"
]);
const UNRESOLVED_QUALITY_OBLIGATION_STATUSES = new Set([
  "unanswered",
  "partially_answered",
  "challenged",
  "unresolved"
]);

export function buildCandidateRepairContext(
  input: BuildCandidateRepairContextInput
): CandidateRepairContext {
  const events = input.eventStore
    .listEvents(input.run.sessionId)
    .sort((left, right) => left.sequence - right.sequence);
  const acceptedObjects = projectAcceptedDeliberationObjects({
    events,
    sessionId: input.run.sessionId
  });
  const frontier = projectCandidateFrontier({
    events,
    sessionId: input.run.sessionId
  });
  const targetCandidateIds = resolveTargetCandidateIds(
    input.targetCandidateIds,
    frontier.candidates,
    acceptedObjects.objections,
    acceptedObjects.qualityObligations
  );
  const targetCandidateIdSet = new Set(targetCandidateIds);
  const targetCandidates = targetCandidateIds.map((targetCandidateId) => {
    const candidate = frontier.candidates.find(
      (frontierCandidate) => frontierCandidate.object.id === targetCandidateId
    );

    if (!candidate) {
      throw new CandidateRepairContextError(
        "Candidate repair targets must be accepted active candidates."
      );
    }

    return structuredClone(candidate);
  });
  const unresolvedObjections = acceptedObjects.objections.filter(
    (objection) =>
      targetCandidateIdSet.has(objection.object.targetId) &&
      UNRESOLVED_OBJECTION_STATUSES.has(objection.object.status)
  );
  const qualityObligations = acceptedObjects.qualityObligations.filter(
    (obligation) =>
      Boolean(obligation.object.targetCandidateId) &&
      targetCandidateIdSet.has(obligation.object.targetCandidateId!) &&
      UNRESOLVED_QUALITY_OBLIGATION_STATUSES.has(obligation.object.status)
  );

  if (unresolvedObjections.length === 0 && qualityObligations.length === 0) {
    throw new CandidateRepairContextError(
      "Candidate repair requires unresolved objections or quality obligations for the target candidates."
    );
  }

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    topic: input.run.plan.topic,
    goals: [...input.run.plan.goals],
    constraints: [...input.run.plan.constraints],
    output: structuredClone(input.run.plan.output),
    targetCandidates,
    unresolvedObjections: unresolvedObjections.map((objection) => structuredClone(objection)),
    qualityObligations: qualityObligations.map((obligation) => structuredClone(obligation)),
    acceptedObjects: structuredClone(acceptedObjects),
    frontier: structuredClone(frontier),
    metadata: {
      version: "1",
      targetCandidateIds,
      allowedSourceEventIds: collectAllowedSourceEventIds(
        targetCandidates,
        unresolvedObjections,
        qualityObligations
      ),
      eventRange: createEventRange(events),
      eventIds: events.map((event) => event.id)
    }
  };
}

function resolveTargetCandidateIds(
  requestedTargetCandidateIds: readonly string[] | undefined,
  frontierCandidates: readonly DerivedCandidate[],
  objections: readonly DerivedObjection[],
  qualityObligations: readonly DerivedQualityObligation[]
): string[] {
  const activeCandidateIds = new Set(
    frontierCandidates.map((candidate) => candidate.object.id)
  );
  const targetCandidateIds = requestedTargetCandidateIds?.length
    ? unique(requestedTargetCandidateIds)
    : collectDefaultRepairTargetCandidateIds(
        activeCandidateIds,
        objections,
        qualityObligations
      );

  if (targetCandidateIds.length === 0) {
    throw new CandidateRepairContextError(
      "Candidate repair requires at least one accepted active target candidate."
    );
  }

  for (const targetCandidateId of targetCandidateIds) {
    if (!activeCandidateIds.has(targetCandidateId)) {
      throw new CandidateRepairContextError(
        "Candidate repair targets must be accepted active candidates."
      );
    }
  }

  return targetCandidateIds;
}

function collectDefaultRepairTargetCandidateIds(
  activeCandidateIds: ReadonlySet<string>,
  objections: readonly DerivedObjection[],
  qualityObligations: readonly DerivedQualityObligation[]
): string[] {
  return unique([
    ...objections
      .filter(
        (objection) =>
          activeCandidateIds.has(objection.object.targetId) &&
          UNRESOLVED_OBJECTION_STATUSES.has(objection.object.status)
      )
      .map((objection) => objection.object.targetId),
    ...qualityObligations
      .filter(
        (obligation) =>
          Boolean(obligation.object.targetCandidateId) &&
          activeCandidateIds.has(obligation.object.targetCandidateId!) &&
          UNRESOLVED_QUALITY_OBLIGATION_STATUSES.has(obligation.object.status)
      )
      .map((obligation) => obligation.object.targetCandidateId!)
  ]);
}

function collectAllowedSourceEventIds(
  targetCandidates: readonly DerivedCandidate[],
  unresolvedObjections: readonly DerivedObjection[],
  qualityObligations: readonly DerivedQualityObligation[]
): string[] {
  const eventIds = new Set<string>();

  for (const object of [
    ...targetCandidates,
    ...unresolvedObjections,
    ...qualityObligations
  ]) {
    eventIds.add(object.proposalEventId);

    for (const acceptanceEventId of object.acceptedByEventIds) {
      eventIds.add(acceptanceEventId);
    }

    for (const sourceEventId of object.sourceEventIds) {
      eventIds.add(sourceEventId);
    }
  }

  return [...eventIds];
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
