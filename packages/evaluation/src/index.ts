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

export const STANDARD_BASELINE_RUN_KINDS = [
  "direct_answer",
  "multi_perspective_prompt",
  "independent_answers_summary",
  "role_agent_workflow",
  "central_judge_workflow",
  "voting_aggregation"
] as const satisfies readonly BaselineRunKind[];

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

export type BaselineComparisonFindingSummary = {
  dimension: EvaluationDimension;
  baselineRunId: string;
  status: BaselineComparisonFindingStatus;
  evidence: string;
  sourceRefs: string[];
  notes: string[];
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
  findingSummaries: BaselineComparisonFindingSummary[];
};

export type BaselineComparisonCoverage = {
  coveredDimensions: EvaluationDimension[];
  missingStandardDimensions: EvaluationDimension[];
  coveredBaselineRunKinds: BaselineRunKind[];
  missingStandardBaselineRunKinds: BaselineRunKind[];
  fullyAssessedCaseCount: number;
  incompleteFindingMatrixCaseCount: number;
};

export type BaselineComparisonReport = {
  schemaVersion: "1";
  caseCount: number;
  runCount: number;
  findingCount: number;
  missingFindingCount: number;
  unsupportedFindingCount: number;
  caseSummaries: BaselineComparisonCaseSummary[];
  coverage: BaselineComparisonCoverage;
  provenance: {
    caseIds: string[];
    sourceRefs: string[];
  };
  limitations: string[];
};

export type BaselineComparisonMarkdownReportOptions = {
  title?: string;
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
    coverage: createCoverageSummary(parsed.data, caseSummaries),
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

export function formatBaselineComparisonMarkdownReport(
  report: BaselineComparisonReport,
  options: BaselineComparisonMarkdownReportOptions = {}
): string {
  const title = options.title ?? "Deliberum baseline comparison report";
  const lines = [
    `# ${title}`,
    "",
    "This report aggregates supplied comparative findings. It does not evaluate quality by itself or select an authoritative outcome.",
    "",
    "## Summary",
    "",
    `- Cases: ${report.caseCount}`,
    `- Runs: ${report.runCount}`,
    `- Findings: ${report.findingCount}`,
    `- Complete finding matrices: ${report.coverage.fullyAssessedCaseCount}/${report.caseCount}`,
    `- Missing findings: ${report.missingFindingCount}`,
    `- Unsupported findings: ${report.unsupportedFindingCount}`,
    "",
    "## Coverage",
    "",
    `- Covered dimensions: ${formatList(report.coverage.coveredDimensions)}`,
    `- Missing standard dimensions: ${formatList(report.coverage.missingStandardDimensions)}`,
    `- Covered baseline kinds: ${formatList(report.coverage.coveredBaselineRunKinds)}`,
    `- Missing standard baseline kinds: ${formatList(
      report.coverage.missingStandardBaselineRunKinds
    )}`,
    "",
    "## Cases",
    ""
  ];

  for (const caseSummary of report.caseSummaries) {
    lines.push(
      `### ${caseSummary.title}`,
      "",
      `- Case id: \`${caseSummary.caseId}\``,
      `- Deliberum run: \`${caseSummary.deliberumRunId}\``,
      `- Baselines: ${caseSummary.baselineRunIds.map((runId) => `\`${runId}\``).join(", ")}`,
      `- Finding matrix: ${
        caseSummary.missingFindingCount === 0 && caseSummary.unsupportedFindingCount === 0
          ? "complete"
          : "incomplete"
      }`,
      `- Assessed findings: ${caseSummary.assessedFindingCount}`,
      ""
    );
    lines.push(formatDimensionTable(caseSummary.dimensionSummaries), "");
    lines.push(formatFindingSummaries(caseSummary.findingSummaries), "");
  }

  lines.push(
    "## Provenance",
    "",
    `- Case ids: ${formatList(report.provenance.caseIds)}`,
    `- Source refs: ${formatList(report.provenance.sourceRefs)}`,
    "",
    "## Limitations",
    ""
  );

  for (const limitation of report.limitations) {
    lines.push(`- ${limitation}`);
  }

  return `${lines.join("\n")}\n`;
}

function createCoverageSummary(
  input: BaselineComparisonInput,
  caseSummaries: readonly BaselineComparisonCaseSummary[]
): BaselineComparisonCoverage {
  const coveredDimensions = new Set<EvaluationDimension>();
  const coveredBaselineRunKinds = new Set<BaselineRunKind>();

  for (const testCase of input.cases) {
    for (const dimension of testCase.dimensions) {
      coveredDimensions.add(dimension);
    }

    for (const run of testCase.runs) {
      if (run.kind !== "deliberum") {
        coveredBaselineRunKinds.add(run.kind);
      }
    }
  }

  const fullyAssessedCaseCount = caseSummaries.filter(
    (summary) => summary.missingFindingCount === 0 && summary.unsupportedFindingCount === 0
  ).length;

  return {
    coveredDimensions: sortBySchemaOrder(coveredDimensions, EvaluationDimensionSchema.options),
    missingStandardDimensions: EvaluationDimensionSchema.options.filter(
      (dimension) => !coveredDimensions.has(dimension)
    ),
    coveredBaselineRunKinds: sortBySchemaOrder(
      coveredBaselineRunKinds,
      BaselineRunKindSchema.options
    ),
    missingStandardBaselineRunKinds: STANDARD_BASELINE_RUN_KINDS.filter(
      (kind) => !coveredBaselineRunKinds.has(kind)
    ),
    fullyAssessedCaseCount,
    incompleteFindingMatrixCaseCount: caseSummaries.length - fullyAssessedCaseCount
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
    ),
    findingSummaries: testCase.findings.map((finding) => ({
      dimension: finding.dimension,
      baselineRunId: finding.baselineRunId,
      status: finding.status,
      evidence: finding.evidence,
      sourceRefs: finding.sourceRefs,
      notes: finding.notes ?? []
    }))
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

function sortBySchemaOrder<T extends string>(values: ReadonlySet<T>, schemaOrder: readonly T[]): T[] {
  return schemaOrder.filter((value) => values.has(value));
}

function formatDimensionTable(
  summaries: readonly BaselineComparisonDimensionSummary[]
): string {
  const lines = [
    "| Dimension | Deliberum stronger | Baseline stronger | Mixed | No clear difference | Insufficient evidence | Not applicable |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];

  for (const summary of summaries) {
    lines.push(
      [
        `| ${formatLabel(summary.dimension)}`,
        summary.counts.deliberum_stronger,
        summary.counts.baseline_stronger,
        summary.counts.mixed,
        summary.counts.no_clear_difference,
        summary.counts.insufficient_evidence,
        `${summary.counts.not_applicable} |`
      ].join(" | ")
    );
  }

  return lines.join("\n");
}

function formatFindingSummaries(
  summaries: readonly BaselineComparisonFindingSummary[]
): string {
  if (summaries.length === 0) {
    return "#### Findings\n\nNo findings supplied.";
  }

  const lines = ["#### Findings", ""];

  for (const summary of summaries) {
    lines.push(
      `- **${formatLabel(summary.dimension)}** vs \`${summary.baselineRunId}\` (${formatLabel(
        summary.status
      )})`,
      `  - Evidence: ${summary.evidence}`,
      `  - Source refs: ${formatList(summary.sourceRefs)}`
    );

    if (summary.notes.length > 0) {
      lines.push(`  - Notes: ${summary.notes.join(" ")}`);
    }
  }

  return lines.join("\n");
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "None";
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}
