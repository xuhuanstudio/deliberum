# Adaptive Deliberation

Deliberum uses deliberation primitives rather than fixed role workflows.

## Primitive catalog

- `sealed_divergence`: independent batch generation to preserve diversity.
- `relation_mapping`: identify support, attack, dependency, overlap, contradiction.
- `red_team`: search for failure modes and blocking objections.
- `steelman`: reconstruct a candidate in its strongest form.
- `candidate_repair`: modify a candidate to answer objections.
- `evidence_check`: route verifiable claims to tools or evidence.
- `blind_reframe`: generate alternative framings without seeing the current frontier.
- `fork`: explore a branch under different assumptions or goal functions.
- `omission_audit`: check for dropped insights.
- `compression_audit`: check final or intermediate summaries for loss.
- `centralization_audit`: check for semantic dominance by a participant or projection.
- `final_contest`: sealed generation of final candidate outcomes.
- `final_audit`: audit final candidates before outcome compilation.

## Process proposals

Participants and system components may propose a next primitive, but the proposal must include:

- target object(s);
- expected quality gain;
- risk if skipped;
- required budget;
- termination condition.

A process proposal is not a command. It can be accepted, challenged, deferred, or replaced through explicit lifecycle events.

## Current Runtime Surface

The orchestrator exposes `suggestAdaptivePrimitiveProposals(...)` as a read-only
proposal suggester over the current run record and event ledger. The daemon
surfaces the same material at:

```text
GET /runs/:runId/process-proposals
```

This endpoint returns proposed `ProcessProposal` objects, observations, and the
event range used for the suggestion, plus a read-only execution policy and
readiness projection for recorded process proposals in the run session. The
readiness projection explains whether each recorded lifecycle state is accepted,
daemon-executable, unsupported, or blocked by target validation. It does not
append events, start stages, accept proposals, mutate Candidate Frontier, or
compile outcomes. The suggested primitive remains challengeable process
material; it is not a hidden scheduler or semantic authority.

Current suggestions can surface final audit gaps for unaudited final candidate
proposal material and omission audit gaps after final candidate material has at
least one recorded audit. An active non-rejected omission audit process proposal
for the same final candidate suppresses repeated omission-audit suggestions.

The ledger-backed process proposal lifecycle is exposed separately:

```text
GET  /sessions/:sessionId/process-proposals
POST /sessions/:sessionId/process-proposals
POST /sessions/:sessionId/process-proposals/:proposalEventId/challenges
POST /sessions/:sessionId/process-proposals/:proposalEventId/decisions
```

These endpoints append or project only `process_proposal_proposed`,
`process_proposal_challenged`, and `process_proposal_decided` events. A decision
status of `accepted`, `deferred`, or `rejected` records process state for
operators and later orchestration policy; it does not execute the primitive,
open a sealed batch, call an adapter, choose a winner, or mutate semantic
deliberation objects. `ProcessProposal.targetIds` may identify deliberation
objects, so ledger provenance is supplied explicitly with `basedOnEventIds`.

Accepted process proposals can be executed only through an explicit daemon run
control endpoint:

```text
POST /runs/:runId/process-proposals/:proposalEventId/execute
```

This endpoint validates that the proposal belongs to the run session and that
the latest projected lifecycle status is `accepted`, then maps supported
primitives onto the existing daemon run start path. It is not a background
scheduler and it does not execute decisions automatically. The run process
proposal read endpoint exposes the same supported primitive policy and start
request preview for ready accepted proposals so operators can see execution
readiness before using this control endpoint. The current supported mappings are:

- `sealed_divergence` -> sealed divergence start request with manual batches auto-closed;
- `relation_mapping` -> extraction start request;
- `red_team` -> proposal review start request;
- `candidate_repair` -> candidate repair request for accepted active candidate
  targets, recording repair extraction proposal material only;
- `evidence_check` -> evidence check request for accepted evidence need
  targets, recording reported evidence result material only;
- `final_contest` -> finalization start request with outcome compilation;
- `final_audit` -> finalization audit request for exactly one existing final
  candidate proposal event, without regenerating final candidate material or
  compiling an outcome;
- `omission_audit` -> finalization audit request for exactly one existing final
  candidate proposal event, preserving omission-focused audit material without
  compiling an outcome.

Candidate repair execution does not accept repair proposals or mutate the
Candidate Frontier by itself; review and acceptance remain separate lifecycle
steps. Evidence check execution does not verify claims or satisfy evidence
needs by itself; the outcome compiler treats recorded evidence results as
reported material with limitations and challenges still visible. Other
primitives return a safe unsupported-primitive error until dedicated daemon
runners exist for those semantics.
