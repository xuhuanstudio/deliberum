import { TopicContractSchema, type TopicContract } from "@deliberum/protocol";

export type BuildTopicContractInput = {
  id: string;
  topic: string;
  title?: string;
  goals?: string[];
  constraints?: string[];
  outputExpectations?: string[];
  participantIds?: string[];
  allowedAdapters?: string[];
};

export function buildTopicContract(input: BuildTopicContractInput): TopicContract {
  return TopicContractSchema.parse({
    id: input.id,
    title: input.title ?? input.topic,
    topic: input.topic,
    goals: withDefault(input.goals, "Produce a traceable deliberation outcome."),
    constraints: withDefault(input.constraints, "Preserve unresolved objections."),
    outputExpectations: withDefault(
      input.outputExpectations,
      "Return structured candidates, objections, obligations, and provenance."
    ),
    participantIds: input.participantIds ?? [],
    allowedAdapters: input.allowedAdapters ?? [],
    budgetLease: {},
    governanceRules: []
  });
}

function withDefault(values: string[] | undefined, fallback: string): string[] {
  return values && values.length > 0 ? values : [fallback];
}
