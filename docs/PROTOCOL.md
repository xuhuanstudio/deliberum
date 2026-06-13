# Protocol Spec

This document defines the high-level deliberation protocol. Implementation details belong in the runtime, but the invariants here should not be weakened.

## Session lifecycle

```text
created
  → topic_contract_published
  → initial_sealed_divergence_open
  → initial_sealed_divergence_revealed
  → structuring
  → deliberating
  → final_contest
  → final_audit
  → outcome_compiled
  → archived
```

A session can be paused, forked, or provisionally finalized. A provisional outcome must preserve unresolved objections.

## Topic Contract

A Topic Contract includes:

- topic;
- goals;
- constraints;
- output expectations;
- participants;
- resources;
- allowed adapters;
- budget lease;
- governance rules.

The Topic Contract is the root event. A human creator may configure it, but the discussion itself starts from a system-issued contract rather than a privileged user message.

Budget leases, governance rules, resource policies, and participant
capabilities are structured but extensible protocol objects. Known fields are
runtime validated, while extension fields must remain JSON-safe. These objects
describe bounded resources, process constraints, delivery constraints, and
adapter capabilities; they do not create a production authorization layer, a
hidden scheduler, or a semantic judge.

## Sealed divergence

The initial divergence round is sealed:

- participants see the same Topic Contract;
- participants do not see each other's contributions;
- contributions are revealed as a batch;
- the batch is preserved as independent evidence of initial views.

Supported reveal policies are explicit: `all_completed`, `manual`, `quorum`,
and `deadline`. `quorum` batches must carry `quorumCount`; `deadline` batches
must carry `deadlineAt`. These policies decide when sealed contributions become
visible as a batch; they do not rank, vote on, or authorize participant content.

Sealed divergence is used whenever diversity matters more than convergence, including initial proposals, blind reframes, relation mapping, and final contests.

## Structuring phase

Initial contributions are converted into candidates, claims, assumptions, objections, evidence needs, and questions. Extraction results are proposals, not facts. Raw contributions are preserved.

## Candidate Frontier

The current Candidate Frontier projection exposes accepted active candidates with `basis: "accepted_active_candidates"`. It should not be treated as a single truth, a vote result, a winner, or a current-best answer.

Full non-dominated frontier semantics remain a design goal. They should be introduced only through explicit comparison, removal, and challengeable proposal mechanisms, not through hidden ranking or implicit winner selection.

Candidates can be:

- active;
- revised;
- absorbed;
- rejected;
- forked;
- archived.

A candidate should not be removed from the frontier without an explicit reason and a challengeable event.

## Objection lifecycle

An objection can be:

- open;
- answered;
- partially answered;
- accepted;
- downgraded;
- unresolved;
- archived.

A severe unresolved objection can block an unqualified final conclusion, but it should not block a provisional outcome.

## Quality Obligation lifecycle

A Quality Obligation can be:

- unanswered;
- answered;
- partially answered;
- challenged;
- waived;
- unresolved.

Waiving an obligation requires a reason and remains challengeable.

## Semantic proposals

The following are proposals, not facts:

- extraction;
- summary;
- merge;
- ranking;
- board view;
- process step;
- stop condition;
- final draft.

A proposal can be accepted-for-now, challenged, superseded, or rejected.

## Adaptive deliberation

The runtime selects deliberation primitives according to explicit quality gaps. A primitive should declare:

- input objects;
- expected quality gain;
- budget;
- output object types;
- stopping condition;
- audit requirements.

The runtime must avoid a hidden semantic scheduler. Process choices are logged and challengeable.

## Evidence checks

Verifiable claims should become EvidenceNeeds. Discussion should not substitute for verification where verification is available.

## Termination

The system must produce an outcome within bounded resources. Termination may occur because of:

- budget limits;
- stable candidate frontier;
- low novelty;
- resolved or recorded blocking objections;
- absence of specific continuation requests;
- governance request.

A final outcome may be provisional and must include unresolved objections when relevant.

## Outcome compilation

The outcome compiler consumes candidates, objections, obligations, evidence, branches, audits, and final candidate proposals. It must not hide unresolved objections or transform disputed assessments into facts.
