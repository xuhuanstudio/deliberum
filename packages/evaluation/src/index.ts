import { z } from "zod";
import { JsonValueSchema } from "@deliberum/protocol";

const NonEmptyStringSchema = z.string().min(1);
const IdSchema = NonEmptyStringSchema;

export const BaselineRunKindSchema = z.enum([
  "deliberum",
  "direct_answer",
  "multi_perspective_prompt",
  "independent_answers_summary",
  "role_agent_workflow",
  "central_judge_workflow",
  "voting_aggregation",
  "custom_baseline"
]);
export type BaselineRunKind = z.infer<typeof BaselineRunKindSchema>;

export const EvaluationDimensionSchema = z.enum([
  "final_answer_quality",
  "critical_risk_discovery",
  "objection_handling",
  "minority_insight_preservation",
  "factual_correctness",
  "executability",
  "traceability",
  "cost",
  "latency",
  "user_comprehension"
]);
export type EvaluationDimension = z.infer<typeof EvaluationDimensionSchema>;

export const BaselineComparisonFindingStatusSchema = z.enum([
  "deliberum_stronger",
  "baseline_stronger",
  "mixed",
  "no_clear_difference",
  "insufficient_evidence",
  "not_applicable"
]);
export type BaselineComparisonFindingStatus = z.infer<
  typeof BaselineComparisonFindingStatusSchema
>;

export const EvaluationMetricSchema = z
  .object({
    latencyMs: z.number().finite().nonnegative().optional(),
    costUsd: z.number().finite().nonnegative().optional(),
    providerCallCount: z.number().int().nonnegative().optional(),
    eventCount: z.number().int().nonnegative().optional()
  })
  .strict();
export type EvaluationMetric = z.infer<typeof EvaluationMetricSchema>;

export const BaselineEvaluationRunSchema = z
  .object({
    id: IdSchema,
    kind: BaselineRunKindSchema,
    label: NonEmptyStringSchema,
    outputRef: NonEmptyStringSchema.optional(),
    outputSummary: NonEmptyStringSchema.optional(),
    sourceRefs: z.array(NonEmptyStringSchema),
    metrics: EvaluationMetricSchema.optional(),
    metadata: z.record(z.string(), JsonValueSchema).optional()
  })
  .strict();
export type BaselineEvaluationRun = z.infer<typeof BaselineEvaluationRunSchema>;

export const BaselineComparisonFindingSchema = z
  .object({
    dimension: EvaluationDimensionSchema,
    baselineRunId: IdSchema,
    status: BaselineComparisonFindingStatusSchema,
    evidence: NonEmptyStringSchema,
    sourceRefs: z.array(NonEmptyStringSchema).min(1),
    notes: z.array(NonEmptyStringSchema).optional()
  })
  .strict();
export type BaselineComparisonFinding = z.infer<
  typeof BaselineComparisonFindingSchema
>;

export const BaselineComparisonCaseSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyStringSchema,
    prompt: NonEmptyStringSchema,
    dimensions: z.array(EvaluationDimensionSchema).min(1),
    runs: z.array(BaselineEvaluationRunSchema).min(2),
    findings: z.array(BaselineComparisonFindingSchema),
    sourceRefs: z.array(NonEmptyStringSchema)
  })
  .strict();
export type BaselineComparisonCase = z.infer<typeof BaselineComparisonCaseSchema>;

export const BaselineComparisonInputSchema = z
  .object({
    cases: z.array(BaselineComparisonCaseSchema).min(1)
  })
  .strict();
export type BaselineComparisonInput = z.infer<typeof BaselineComparisonInputSchema>;

export type BaselineComparisonDimensionSummary = {
  dimension: EvaluationDimension;
  counts: Record<BaselineComparisonFindingStatus, number>;
};

export type BaselineComparisonCaseSummary = {
  caseId: string;
  title: string;
  deliberumRunId: string;
  baselineRunIds: string[];
  assessedFindingCount: number;
  missingFindingCount: number;
  unsupportedFindingCount: number;
  dimensionSummaries: BaselineComparisonDimensionSummary[];
};

export type BaselineComparisonReport = {
  schemaVersion: "1";
  caseCount: number;
  runCount: number;
  findingCount: number;
  missingFindingCount: number;
  unsupportedFindingCount: number;
  caseSummaries: BaselineComparisonCaseSummary[];
  provenance: {
    caseIds: string[];
    sourceRefs: string[];
  };
  limitations: string[];
};

export class BaselineComparisonInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaselineComparisonInputError";
  }
}

const FINDING_STATUSES = BaselineComparisonFindingStatusSchema.options;

export function createBaselineComparisonReport(
  input: BaselineComparisonInput
): BaselineComparisonReport {
  const parsed = BaselineComparisonInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new BaselineComparisonInputError(parsed.error.message);
  }

  const caseSummaries = parsed.data.cases.map(createCaseSummary);
  const allSourceRefs = new Set<string>();

  for (const testCase of parsed.data.cases) {
    for (const sourceRef of testCase.sourceRefs) {
      allSourceRefs.add(sourceRef);
    }
    for (const run of testCase.runs) {
      for (const sourceRef of run.sourceRefs) {
        allSourceRefs.add(sourceRef);
      }
    }
    for (const finding of testCase.findings) {
      for (const sourceRef of finding.sourceRefs) {
        allSourceRefs.add(sourceRef);
      }
    }
  }

  return {
    schemaVersion: "1",
    caseCount: parsed.data.cases.length,
    runCount: parsed.data.cases.reduce((sum, testCase) => sum + testCase.runs.length, 0),
    findingCount: parsed.data.cases.reduce(
      (sum, testCase) => sum + testCase.findings.length,
      0
    ),
    missingFindingCount: caseSummaries.reduce(
      (sum, summary) => sum + summary.missingFindingCount,
      0
    ),
    unsupportedFindingCount: caseSummaries.reduce(
      (sum, summary) => sum + summary.unsupportedFindingCount,
      0
    ),
    caseSummaries,
    provenance: {
      caseIds: parsed.data.cases.map((testCase) => testCase.id),
      sourceRefs: [...allSourceRefs].sort()
    },
    limitations: [
      "The harness aggregates supplied comparative findings; it does not evaluate quality by itself or choose an authoritative outcome.",
      "Finding quality depends on the external evaluator and source references supplied to the harness."
    ]
  };
}

function createCaseSummary(testCase: BaselineComparisonCase): BaselineComparisonCaseSummary {
  const deliberumRuns = testCase.runs.filter((run) => run.kind === "deliberum");

  if (deliberumRuns.length !== 1) {
    throw new BaselineComparisonInputError(
      "Each baseline comparison case must contain exactly one Deliberum run."
    );
  }

  const baselineRuns = testCase.runs.filter((run) => run.kind !== "deliberum");

  if (baselineRuns.length === 0) {
    throw new BaselineComparisonInputError(
      "Each baseline comparison case must contain at least one baseline run."
    );
  }

  const runIds = new Set(testCase.runs.map((run) => run.id));
  const baselineRunIds = new Set(baselineRuns.map((run) => run.id));

  for (const finding of testCase.findings) {
    if (!runIds.has(finding.baselineRunId) || !baselineRunIds.has(finding.baselineRunId)) {
      throw new BaselineComparisonInputError(
        "Baseline comparison findings must reference baseline run ids."
      );
    }
  }

  const expectedFindingKeys = new Set<string>();
  for (const dimension of testCase.dimensions) {
    for (const baselineRun of baselineRuns) {
      expectedFindingKeys.add(createFindingKey(dimension, baselineRun.id));
    }
  }

  const suppliedFindingKeys = new Set(
    testCase.findings.map((finding) =>
      createFindingKey(finding.dimension, finding.baselineRunId)
    )
  );
  const missingFindingCount = [...expectedFindingKeys].filter(
    (key) => !suppliedFindingKeys.has(key)
  ).length;
  const unsupportedFindingCount = testCase.findings.filter(
    (finding) => !testCase.dimensions.includes(finding.dimension)
  ).length;

  return {
    caseId: testCase.id,
    title: testCase.title,
    deliberumRunId: deliberumRuns[0]!.id,
    baselineRunIds: baselineRuns.map((run) => run.id),
    assessedFindingCount: testCase.findings.length,
    missingFindingCount,
    unsupportedFindingCount,
    dimensionSummaries: testCase.dimensions.map((dimension) =>
      createDimensionSummary(dimension, testCase.findings)
    )
  };
}

function createDimensionSummary(
  dimension: EvaluationDimension,
  findings: readonly BaselineComparisonFinding[]
): BaselineComparisonDimensionSummary {
  const counts = Object.fromEntries(
    FINDING_STATUSES.map((status) => [status, 0])
  ) as Record<BaselineComparisonFindingStatus, number>;

  for (const finding of findings) {
    if (finding.dimension === dimension) {
      counts[finding.status] += 1;
    }
  }

  return {
    dimension,
    counts
  };
}

function createFindingKey(dimension: EvaluationDimension, baselineRunId: string): string {
  return `${dimension}:${baselineRunId}`;
}
