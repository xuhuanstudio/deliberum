# Architecture

Deliberum is a quality-centered peer deliberation runtime.

## Layered architecture

```text
1. Topic Contract Layer
2. Participant Layer
3. Event Ledger Layer
4. Deliberation State Layer
5. Quality Engine Layer
6. Adaptive Primitive Layer
7. Evidence and Tool Layer
8. Workspace and Reference Layer
9. Adapter and Resource Layer
10. Outcome Compiler Layer
11. CLI / Daemon / Web Presentation Layer
```

## Topic Contract Layer

A discussion starts from a System-issued Topic Contract rather than a user message. The contract defines the topic, goals, constraints, participants, output expectations, tool availability, and governance rules.

## Participant Layer

A Participant can be a human, model, tool, external system, manual bridge, or web-only model. Participant identity does not directly determine conclusion weight.

## Event Ledger Layer

The ledger is append-only. It records topic contracts, contributions, candidates, claims, objections, quality obligations, evidence results, board patches, process proposals, audits, and final drafts.

## Deliberation State Layer

The runtime projects the event ledger into structured state:

- Candidate Frontier;
- Objection Ledger;
- Quality Obligations;
- Evidence Needs;
- Branches;
- Audit Findings;
- Workspace Views.

Projected state is not the original truth; it is derived and must remain traceable.

## Quality Engine Layer

The quality engine tracks what each candidate must answer. Candidates are not selected by votes or identity. They are compared by how well they satisfy obligations, respond to objections, preserve alternatives, and fit the Topic Contract.

## Adaptive Primitive Layer

The runtime can run primitives such as sealed divergence, relation mapping, red-team, repair, evidence check, blind reframe, fork, omission audit, compression audit, final contest, and final audit.

## Evidence and Tool Layer

Fact-like claims and verifiable claims should be routed to evidence or tool checks. Discussion should not substitute for verification when verification is possible.

## Workspace and Reference Layer

Whiteboards, references, text spans, board nodes, candidate links, and context capsules help participants communicate precisely. They are not the core goal.

## Adapter and Resource Layer

Adapters connect API models, local models, OpenAI-compatible endpoints, HTTP-template endpoints, package-level MCP-compatible tool participants, manual participants, and WebGET web-only models. The Resource Broker manages URL/base64/none delivery per participant and resource type, while the local daemon can wrap allowed URL and hosted in-memory content deliveries in short-lived resource access grants without making resources or adapters semantic authorities.

## Outcome Compiler Layer

The final result is compiled from candidates, obligations, objections, evidence, audits, and final candidate proposals. It is not a free-form central Judge summary.
