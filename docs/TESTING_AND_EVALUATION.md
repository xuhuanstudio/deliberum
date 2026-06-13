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

Reports include benchmark coverage metadata: covered evaluation dimensions,
missing standard dimensions, covered baseline run kinds, missing standard
baseline kinds, and whether each case has a complete finding matrix. Coverage
metadata is a dataset governance aid only; it is not a quality score.

The repository includes
`examples/evaluation/baseline-comparison.sample.json` as a small public sample
fixture. It covers resource access posture, provider setup, final audit
readiness, and cost/latency transparency across direct-answer, central-judge,
multi-perspective, role-agent, independent-summary, and voting baselines. The
sample covers every implemented evaluation dimension at least once. It is
illustrative harness input, not a benchmark score, leaderboard, or system
ranking.

`corepack pnpm lint:evaluation` validates the public evaluation fixtures through
the built `@deliberum/evaluation` package. The gate requires complete finding
matrices for declared dimensions, coverage for every standard evaluation
dimension, coverage for every standard baseline kind, and no unsupported
findings. It checks evidence-fixture completeness only; it does not judge model
performance, produce numeric ratings, or replace external review.

Fixture `sourceRefs` must be repository-relative file paths. Public sample
source artifacts live under `examples/evaluation/sources/`, and the evaluation
gate fails if a referenced source is missing, escapes the repository, or points
to a directory. This keeps the sample evidence auditable instead of leaving
provenance as unresolved labels.

`corepack pnpm report:evaluation` builds the package and prints a Markdown
summary for the public fixtures. The report is intended for review and release
notes: it lists case coverage, run counts, finding matrix completeness,
dimension-level supplied finding counts, finding evidence text, finding source
refs, provenance refs, and the harness limitations. It reads the same fixture
schema as the validation gate and does not reinterpret source evidence.

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
against authority-like report fields. It also checks that the Markdown report
surfaces finding evidence and source refs for review.
