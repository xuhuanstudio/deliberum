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
- **Candidate Frontier**: the current projection exposes accepted active candidates with explicit basis metadata instead of forcing a single “current best”; non-dominated frontier semantics remain a future challengeable proposal mechanism.
- **Objection Ledger**: objections are first-class objects with targets, severity claims, status, and responses.
- **Quality Obligations**: candidates must answer explicit requirements; quality is not decided by votes or identity.
- **Adaptive Deliberation**: the runtime chooses primitives such as red-team, repair, evidence check, blind reframe, fork, omission audit, and final audit based on quality gaps.
- **No uncontested semantic center**: summaries, rankings, board views, process decisions, and final drafts are proposals that can be challenged.
- **Workspace and references as support layers**: whiteboards, references, and addressable objects exist to improve discussion quality, not to become the system’s goal.
- **Multiple participant adapters**: the adapter architecture supports manual participants, OpenAI-compatible models, HTTP-template providers, MCP-compatible tool participants, web-only models, and future local/tool integrations.

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

## Repository shape

```text
apps/
  cli/
  daemon/
  web/
packages/
  protocol/
  core/
  evaluation/
  storage/
  adapters/
  resources/
  client/
  ui/
docs/
examples/
```

## Status

Deliberum is a pre-production local-first codebase with the core deliberation ledger, local daemon, CLI, Web projection workspace, local deterministic run profile, opt-in OpenAI-compatible provider profile, opt-in HTTP-template participant profile, and opt-in MCP tool participant profile implemented. It is not a production deployment or public hosted service.

Implemented today:

- TypeScript + zod protocol and evaluation schemas;
- append-only event store with in-memory storage, shared JSON file persistence for local CLI and optional daemon event ledgers, optional JSON daemon operation audit log persistence, and optional SQLite daemon event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence with local connection-level writer serialization;
- Topic Contract session lifecycle;
- Sealed Divergence batch lifecycle;
- Extraction Proposals and challenge/accept lifecycle events;
- Candidate Frontier, objection, quality obligation, and accepted-object projections with projection metadata;
- Evidence Result recording plus Final Audit and Outcome Compiler in core as proposal/derived output, not final truth;
- baseline comparison report harness and public sample fixture for externally supplied evaluation findings, without ranking or selecting an authoritative outcome;
- local CLI commands for sessions, batches, contributions, extraction proposals, process proposal lifecycle, final candidate/audit/outcome projection, projections, events, daemon runtime profile status, env-template output, profile-doctor diagnostics, safe daemon setup-plan output, daemon deployment posture reads, daemon operation audit reads and JSONL export, optional daemon control-plane bearer auth, daemon resource access posture reads and revocation, daemon run orchestration, daemon resources/evidence projection reads with safe delivery and access audit history, daemon-backed final lifecycle submissions, and explicit accepted process proposal execution;
- local Hono daemon API with in-memory defaults, optional control-plane bearer auth, optional SQLite event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence with retention limits, optional JSON event ledger, run metadata, and operation audit log persistence with retention limits, optional built Web static asset serving for local/pre-production shells, safe runtime profile, deployment posture, and resource access posture status, safe operation audit metadata, projection endpoints, mutation endpoints, session final lifecycle and projection endpoints, session resources projection endpoint, session-scoped resource delivery planning endpoint with safe ledger audit events, revocable daemon resource access grants for allowed URL and hosted in-memory content deliveries, session process proposal lifecycle endpoints, run orchestration endpoints, explicit accepted process proposal execution, SSE, and WebGET endpoints;
- React/Vite Web UI shell with safe daemon runtime profile status, setup-plan summaries, deployment posture summaries, daemon-backed session catalog, session projections, daemon run workspace, run process proposal lifecycle, execution readiness, and accepted-proposal execution controls, run outcome view, session final lifecycle/projection page, and session resources/evidence projection page with safe resource delivery and access audit history;
- participant adapter interface, fake/manual adapters, OpenAI-compatible adapter/profile, HTTP-template participant adapter/profile for sealed participant execution, package-level MCP-compatible tool participant adapter plus opt-in daemon MCP tool participant profile with execution policy controls, OpenAI-compatible extraction/review/finalization components, and experimental WebGET adapter;
- Resource Broker and Delivery Planner support package integrated with daemon-local resource delivery planning and short-lived access grants for URL and hosted in-memory content delivery;
- read-only adaptive process proposal suggestions and execution readiness for daemon runs, explicit ledger-backed process proposal lifecycle events exposed as challengeable `ProcessProposal` material, and operator-triggered execution of accepted proposals for supported daemon stages, including candidate repair proposal execution, evidence check execution that records reported evidence results, and final/omission audit execution against existing final candidate proposal events;
- hardening for persisted ledger loading, optional daemon event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence/retention, optional daemon control-plane auth, safe daemon deployment posture diagnostics, WebGET submission safety, projection traceability metadata, idempotency result consistency, SSE idempotent publish guards, WebGET context visibility, resource access base URL opt-in, and resource delivery safety.

Deferred work includes production multi-writer coordination for durable daemon stores, broader primitive runner coverage and automated policy beyond read-only accepted process proposal readiness, production resource hosting posture, MCP server lifecycle management, broader external tool execution policy and adapter sandboxing, full interactive secret capture and config-file writing, production authorization or multi-user deployment, and larger benchmark datasets.

The public name **Deliberum** should be treated as the current project name. Before a formal public launch, maintainers should complete the name, domain, package-scope, and trademark checks described in the private launch checklist.

## License

Apache-2.0.
