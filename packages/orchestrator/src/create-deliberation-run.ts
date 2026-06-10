import { createSession } from "@deliberum/core";
import type { TopicContract } from "@deliberum/protocol";
import type { StoredEvent } from "@deliberum/storage";
import { RunStoreConflictError } from "./errors";
import { buildTopicContractFromRunPlan } from "./topic-contract";
import {
  ORCHESTRATOR_RUN_SCHEMA_VERSION,
  type CreateDeliberationRunInput,
  type CreateDeliberationRunOptions,
  type CreateDeliberationRunResult,
  type DeliberationRunRecord
} from "./types";
import { validateDeliberationRunPlan } from "./validation";

export function createDeliberationRun(
  input: CreateDeliberationRunInput,
  options: CreateDeliberationRunOptions
): CreateDeliberationRunResult {
  const plan = validateDeliberationRunPlan(input.runPlan);
  const runId = options.idGenerator();
  const topicContractId = options.idGenerator();

  if (options.runStore.getRun(runId)) {
    throw new RunStoreConflictError(runId);
  }

  const topicContract = buildTopicContractFromRunPlan(plan, {
    topicContractId
  });
  const session = createSession(
    {
      topicContract
    },
    options
  );
  const timestamp = (options.clock ?? (() => new Date().toISOString()))();
  const run = options.runStore.createRun({
    id: runId,
    schemaVersion: ORCHESTRATOR_RUN_SCHEMA_VERSION,
    sessionId: session.sessionId,
    status: "created",
    plan,
    topicContractEventId: session.initialEvent.id,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  return {
    run,
    session: {
      sessionId: session.sessionId
    },
    topicContractEvent: session.initialEvent as StoredEvent<TopicContract>
  };
}
