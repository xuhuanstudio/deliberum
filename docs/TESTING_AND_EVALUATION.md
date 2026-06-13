# Testing and Evaluation

Deliberum must prove that it improves outcomes, not merely that it runs.

## Baselines

Compare against:

- one strong model direct answer;
- one strong model multi-perspective prompt;
- multiple independent answers with simple summary;
- role-agent workflow;
- central judge workflow;
- voting aggregation.

The package-level `@deliberum/evaluation` harness now provides a typed baseline
comparison report builder for these comparisons. It accepts benchmark cases,
baseline run records, Deliberum run records, and externally supplied comparative
findings. The harness validates that each case contains exactly one Deliberum
run plus at least one baseline run, checks finding references, aggregates
dimension counts, reports missing findings, and preserves provenance source
refs.

The harness does not evaluate quality by itself, rank systems, vote, or select
an authoritative outcome. It is an evidence organization layer for human or
external evaluator findings.

The repository includes
`examples/evaluation/baseline-comparison.sample.json` as a small public sample
fixture. It covers resource access posture, provider setup, and final audit
readiness across direct-answer, central-judge, multi-perspective, role-agent,
independent-summary, and voting baselines. The sample is illustrative harness
input, not a benchmark score, leaderboard, or system ranking.

## Evaluation dimensions

- final answer quality;
- critical risk discovery;
- objection handling;
- minority insight preservation;
- factual correctness;
- executability;
- traceability;
- cost and latency;
- user comprehension.

The implemented dimension ids are:

```text
final_answer_quality
critical_risk_discovery
objection_handling
minority_insight_preservation
factual_correctness
executability
traceability
cost
latency
user_comprehension
```

## Required tests

- schema validation;
- event ledger append-only invariants;
- sealed divergence visibility;
- candidate frontier projection;
- objection lifecycle;
- quality obligation lifecycle;
- final audit invariants;
- resource delivery policy;
- WebGET token behavior;
- adapter capability handling.

The evaluation package test suite covers report aggregation, missing finding
detection, invalid run references, unsupported dimension findings, and guardrails
against authority-like report fields.
