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

A process proposal is not a command. It can be accepted, challenged, deferred, or replaced.
