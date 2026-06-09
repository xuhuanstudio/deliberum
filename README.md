# Deliberum

**Deliberum** is a terminal-first, quality-centered peer deliberation runtime for humans, models, tools, and web-only participants.

It is not a role-agent chat demo, not a voting system, not a central-Judge workflow, and not an MCP wrapper. Deliberum is designed to help multiple heterogeneous participants deliberate around a topic and produce a higher-quality outcome through structured divergence, objections, quality obligations, evidence checks, audits, and final compilation.

> Working tagline: **Quality-centered peer deliberation runtime for humans, models, and tools.**

## Why Deliberum exists

Most multi-agent systems rely on fixed roles, fixed order, supervisor routing, model voting, or a final judge. These designs are useful for workflows, but they often fail for open-ended deliberation:

- fixed roles restrict model capability;
- fixed order creates anchoring;
- a central judge becomes a semantic bottleneck;
- majority voting can let weak consensus overpower strong objections;
- raw group chat creates noise and weak convergence;
- overly rigid workflows cannot adapt to the real shape of a problem.

Deliberum treats deliberation as a quality-centered process. It starts with a system-issued **Topic Contract**, runs **sealed divergence** to preserve independent perspectives, builds a **Candidate Frontier**, tracks **Objections**, enforces **Quality Obligations**, dynamically selects deliberation primitives, performs evidence checks where needed, and compiles an outcome with unresolved boundaries instead of pretending that every disagreement disappeared.

## Core ideas

- **Topic Contract**: the system, not a privileged user message, publishes the discussion topic, goals, constraints, participants, and output expectations.
- **Peer Participants**: humans, models, tools, web-only participants, and external systems are represented uniformly as participants.
- **Sealed Divergence**: initial contributions are generated independently and revealed as a batch to reduce anchoring.
- **Candidate Frontier**: the system tracks multiple non-dominated candidate answers instead of forcing a single “current best” too early.
- **Objection Ledger**: objections are first-class objects with targets, severity claims, status, and responses.
- **Quality Obligations**: candidates must answer explicit requirements; quality is not decided by votes or identity.
- **Adaptive Deliberation**: the runtime chooses primitives such as red-team, repair, evidence check, blind reframe, fork, omission audit, and final audit based on quality gaps.
- **No uncontested semantic center**: summaries, rankings, board views, process decisions, and final drafts are proposals that can be challenged.
- **Workspace and references as support layers**: whiteboards, references, and addressable objects exist to improve discussion quality, not to become the system’s goal.
- **Multiple participant adapters**: API models, OpenAI-compatible models, local models, HTTP-template services, MCP-compatible tool adapters, manual participants, and web-only models can all participate through adapters.

## Architecture at a glance

```text
Topic Contract
  ↓
Sealed Initial Divergence
  ↓
Candidate / Claim / Objection Extraction Proposals
  ↓
Quality Obligations
  ↓
Candidate Frontier
  ↓
Adaptive Deliberation Primitives
  ↓
Evidence / Tool Verification
  ↓
Audits: bias, omission, compression, final
  ↓
Outcome Compilation
```

## Documentation

- [Project Charter](docs/PROJECT_CHARTER.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Protocol](docs/PROTOCOL.md)
- [Data Model](docs/DATA_MODEL.md)
- [Quality Model](docs/QUALITY_MODEL.md)
- [Adapters and Resource Delivery](docs/ADAPTERS_AND_RESOURCE_DELIVERY.md)
- [WebGET Protocol](docs/WEBGET_PROTOCOL.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Technology Stack](docs/TECH_STACK.md)
- [Roadmap](ROADMAP.md)

## Recommended repository shape

```text
apps/
  cli/
  daemon/
  web/
packages/
  protocol/
  core/
  storage/
  adapters/
  resources/
  client/
  ui/
docs/
examples/
```

## Status

This repository starts with protocol and architecture documents first. Implementation should follow the full architecture in dependency order. This is not an MVP-first project; stages may be incremental, but the architecture should not be simplified into a role-agent chat demo, a central-Judge workflow, a whiteboard product, or an MCP wrapper.

The public name **Deliberum** should be treated as the current project name. Before a formal public launch, maintainers should complete the name, domain, package-scope, and trademark checks described in the private launch checklist.

## License

Apache-2.0.
