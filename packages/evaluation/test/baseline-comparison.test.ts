import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BaselineComparisonInputError,
  createBaselineComparisonReport,
  type BaselineComparisonInput
} from "../src";

function sampleComparisonInput(): BaselineComparisonInput {
  return JSON.parse(
    readFileSync(
      new URL("../../../examples/evaluation/baseline-comparison.sample.json", import.meta.url),
      "utf8"
    )
  ) as BaselineComparisonInput;
}

function comparisonInput(): BaselineComparisonInput {
  return {
    cases: [
      {
        id: "case-1",
        title: "Local run workspace decision",
        prompt: "Should Deliberum expose local run workspace controls?",
        dimensions: [
          "critical_risk_discovery",
          "objection_handling",
          "traceability"
        ],
        sourceRefs: ["fixture/case-1/prompt.md"],
        runs: [
          {
            id: "deliberum-run-1",
            kind: "deliberum",
            label: "Deliberum run",
            outputRef: "fixture/case-1/deliberum.json",
            sourceRefs: ["ledger/session-1/events.json"],
            metrics: {
              latencyMs: 1200,
              eventCount: 14
            }
          },
          {
            id: "direct-answer-1",
            kind: "direct_answer",
            label: "Direct answer",
            outputRef: "fixture/case-1/direct.md",
            sourceRefs: ["baseline/direct-answer.md"],
            metrics: {
              latencyMs: 300,
              providerCallCount: 1
            }
          },
          {
            id: "judge-workflow-1",
            kind: "central_judge_workflow",
            label: "Central judge workflow",
            outputRef: "fixture/case-1/judge.md",
            sourceRefs: ["baseline/judge.md"]
          }
        ],
        findings: [
          {
            dimension: "critical_risk_discovery",
            baselineRunId: "direct-answer-1",
            status: "deliberum_stronger",
            evidence:
              "The Deliberum run preserved an authority-risk objection that the direct answer omitted.",
            sourceRefs: ["ledger/session-1/events.json", "baseline/direct-answer.md"]
          },
          {
            dimension: "objection_handling",
            baselineRunId: "direct-answer-1",
            status: "deliberum_stronger",
            evidence:
              "The Deliberum run kept the objection unresolved instead of compressing it away.",
            sourceRefs: ["ledger/session-1/events.json"]
          },
          {
            dimension: "traceability",
            baselineRunId: "direct-answer-1",
            status: "deliberum_stronger",
            evidence:
              "The Deliberum output includes event provenance while the direct answer has none.",
            sourceRefs: ["ledger/session-1/events.json"]
          },
          {
            dimension: "critical_risk_discovery",
            baselineRunId: "judge-workflow-1",
            status: "mixed",
            evidence:
              "Both surfaces found risk, but the judge workflow collapsed dissent earlier.",
            sourceRefs: ["ledger/session-1/events.json", "baseline/judge.md"]
          }
        ]
      }
    ]
  };
}

describe("baseline comparison report", () => {
  it("aggregates supplied findings without selecting a winner", () => {
    const report = createBaselineComparisonReport(comparisonInput());
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      schemaVersion: "1",
      caseCount: 1,
      runCount: 3,
      findingCount: 4,
      missingFindingCount: 2,
      unsupportedFindingCount: 0,
      caseSummaries: [
        {
          caseId: "case-1",
          deliberumRunId: "deliberum-run-1",
          baselineRunIds: ["direct-answer-1", "judge-workflow-1"],
          assessedFindingCount: 4,
          missingFindingCount: 2
        }
      ]
    });
    expect(report.caseSummaries[0]?.dimensionSummaries).toContainEqual({
      dimension: "critical_risk_discovery",
      counts: expect.objectContaining({
        deliberum_stronger: 1,
        mixed: 1,
        baseline_stronger: 0
      })
    });
    expect(report.provenance.sourceRefs).toEqual([
      "baseline/direct-answer.md",
      "baseline/judge.md",
      "fixture/case-1/prompt.md",
      "ledger/session-1/events.json"
    ]);
    expect(serialized).not.toContain("winner");
    expect(serialized).not.toContain("currentBest");
    expect(serialized).not.toContain("ranking");
    expect(serialized).not.toContain("finalAnswer");
    expect(serialized).not.toContain("truthSummary");
  });

  it("aggregates the public sample fixture", () => {
    const report = createBaselineComparisonReport(sampleComparisonInput());
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      schemaVersion: "1",
      caseCount: 3,
      runCount: 9,
      findingCount: 18,
      missingFindingCount: 0,
      unsupportedFindingCount: 0
    });
    expect(report.provenance.caseIds).toEqual([
      "case-local-daemon-resource-access",
      "case-provider-setup",
      "case-final-audit-readiness"
    ]);
    expect(report.caseSummaries.map((summary) => summary.baselineRunIds)).toEqual([
      ["direct-resource-access", "judge-resource-access"],
      ["multi-perspective-provider-setup", "role-agent-provider-setup"],
      ["independent-summary-final-audit", "voting-final-audit"]
    ]);
    expect(serialized).not.toContain("winner");
    expect(serialized).not.toContain("currentBest");
    expect(serialized).not.toContain("ranking");
    expect(serialized).not.toContain("finalAnswer");
    expect(serialized).not.toContain("truthSummary");
  });

  it("rejects cases without exactly one Deliberum run", () => {
    const input = comparisonInput();
    input.cases[0]!.runs = input.cases[0]!.runs.filter(
      (run) => run.kind !== "deliberum"
    );

    expect(() => createBaselineComparisonReport(input)).toThrow(
      BaselineComparisonInputError
    );
  });

  it("rejects findings that target Deliberum or unknown run ids", () => {
    const targetDeliberum = comparisonInput();
    targetDeliberum.cases[0]!.findings[0]!.baselineRunId = "deliberum-run-1";

    expect(() => createBaselineComparisonReport(targetDeliberum)).toThrow(
      BaselineComparisonInputError
    );

    const targetUnknown = comparisonInput();
    targetUnknown.cases[0]!.findings[0]!.baselineRunId = "missing-run";

    expect(() => createBaselineComparisonReport(targetUnknown)).toThrow(
      BaselineComparisonInputError
    );
  });

  it("tracks findings outside the declared dimension set as unsupported", () => {
    const input = comparisonInput();
    input.cases[0]!.findings.push({
      dimension: "latency",
      baselineRunId: "direct-answer-1",
      status: "baseline_stronger",
      evidence: "The direct answer returned faster.",
      sourceRefs: ["baseline/direct-answer.md"]
    });

    const report = createBaselineComparisonReport(input);

    expect(report.unsupportedFindingCount).toBe(1);
    expect(report.caseSummaries[0]?.unsupportedFindingCount).toBe(1);
  });
});
