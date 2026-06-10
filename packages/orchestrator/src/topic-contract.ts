import type { JsonRecord, TopicContract } from "@deliberum/protocol";
import type { DeliberationRunPlan, RunResourceReference } from "./types";

export type BuildTopicContractFromRunPlanOptions = {
  topicContractId: string;
};

export function buildTopicContractFromRunPlan(
  plan: DeliberationRunPlan,
  options: BuildTopicContractFromRunPlanOptions
): TopicContract {
  return {
    id: options.topicContractId,
    title: plan.title ?? plan.topic,
    topic: plan.topic,
    goals: [...plan.goals],
    constraints: [...plan.constraints],
    outputExpectations: buildOutputExpectations(plan),
    participantIds: plan.participants.map((participant) => participant.id),
    allowedAdapters: unique(plan.participants.map((participant) => participant.adapterId)),
    budgetLease: buildBudgetLease(plan),
    governanceRules: [
      {
        orchestratedRun: true,
        runSchemaVersion: "1",
        sealedDivergencePurpose: plan.sealedDivergence.purpose,
        sealedDivergenceRevealPolicy: plan.sealedDivergence.revealPolicy
      }
    ],
    resourcePolicy: buildResourcePolicy(plan.resources)
  };
}

function buildOutputExpectations(plan: DeliberationRunPlan): string[] {
  const expectations = [...plan.output.expectations];

  if (plan.output.language) {
    expectations.push(`Output language: ${plan.output.language}`);
  }

  if (plan.output.style) {
    expectations.push(`Output style: ${plan.output.style}`);
  }

  return expectations;
}

function buildBudgetLease(plan: DeliberationRunPlan): JsonRecord {
  return withoutUndefined({
    maxEvents: plan.budget.maxEvents,
    maxProviderCalls: plan.budget.maxProviderCalls,
    maxEstimatedCostCents: plan.budget.maxEstimatedCostCents,
    maxRunSeconds: plan.budget.maxRunSeconds,
    participantTimeoutMs: plan.timeouts.participantMs,
    overallTimeoutMs: plan.timeouts.overallMs
  });
}

function buildResourcePolicy(
  resources: readonly RunResourceReference[] | undefined
): JsonRecord | undefined {
  if (!resources || resources.length === 0) {
    return undefined;
  }

  return {
    resourceRefs: resources.map((resource) =>
      withoutUndefined({
        resourceId: resource.resourceId,
        required: resource.required,
        preferredDeliveryMode: resource.preferredDeliveryMode
      })
    )
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function withoutUndefined(input: Record<string, string | number | boolean | undefined>): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
  );
}
