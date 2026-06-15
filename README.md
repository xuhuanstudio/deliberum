# Deliberum

**Deliberum** is a human-first, quality-centered peer deliberation product and runtime for humans, models, tools, and web-only participants.

It is not a role-agent chat demo, not a voting system, not a central-Judge workflow, and not an MCP wrapper. Deliberum is designed to help multiple heterogeneous participants deliberate around a topic and produce a higher-quality outcome through structured divergence, objections, quality obligations, evidence checks, audits, and final compilation.

> Working tagline: **Human-first peer deliberation for higher-quality decisions.**

## Why Deliberum exists

Most multi-agent systems rely on fixed roles, fixed order, supervisor routing, model voting, or a final judge. These designs are useful for workflows, but they often fail for open-ended deliberation:

- fixed roles restrict model capability;
- fixed order creates anchoring;
- a central judge becomes a semantic bottleneck;
- majority voting can let weak consensus overpower strong objections;
- raw group chat creates noise and weak convergence;
- overly rigid workflows cannot adapt to the real shape of a problem.

Deliberum treats deliberation as a quality-centered process. It starts with a system-issued **Topic Contract**, runs **sealed divergence** to preserve independent perspectives, builds a **Candidate Frontier**, tracks **Objections**, enforces **Quality Obligations**, dynamically selects deliberation primitives, performs evidence checks where needed, and compiles an outcome with unresolved boundaries instead of pretending that every disagreement disappeared.

The Web UI presents those concepts as a Discussion Room for normal users: a discussion brief, independent first responses, readable participant perspectives, strongest current options, open disagreements, evidence gaps, risks, current conclusion, and next recommended actions. Low-level daemon, ledger, runtime, resource, proposal, event, run, and session details remain available in Advanced / Developer Mode.

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

## Web Discussion Room

The default Web path is designed for a first-time user, not for a daemon operator.

- Start a discussion from `/runs/new`.
- Check daemon and model/provider readiness from `/setup/models`, including a plain-language provider setup checklist and a local OpenAI-compatible setup form that writes provider setup through the daemon without showing saved secrets or default-mode env var names.
- Continue existing discussions from `/runs`.
- Read participant/model perspectives as discussion contributions.
- Follow the room timeline by deliberation stage.
- Keep the current conclusion, open disagreements, missing evidence, risks, and next recommended actions visible.
- Use user-facing actions such as Continue discussion, Ask for stronger options, Review disagreements, Check evidence, and Update conclusion when ready.
- Open Advanced / Developer Mode only when low-level runtime, ledger, raw JSON, resource, audit, or internal identifier details are needed.

English is the default Web language. Simplified Chinese is supported through the Web localization table.

## Quickstart: local Web product loop

This path is for a normal local user who wants to try the product through Web, not inspect the runtime first.
Use the [Basic Product Loop Completion Matrix](docs/BASIC_PRODUCT_LOOP.md) as
the acceptance checklist for this path. The default Web loop is not complete
until the matrix steps are verified with real browser evidence.

Prerequisites:

- Node.js 24 or newer;
- Corepack;
- pnpm 11 through Corepack.

Check your local setup before installing dependencies:

```bash
node scripts/check-local-prerequisites.mjs
```

1. Install dependencies and build the local product.

   ```bash
   corepack pnpm install
   corepack pnpm doctor:local
   corepack pnpm build
   ```

2. Start Deliberum locally.

   ```bash
   corepack pnpm start:local
   ```

   This starts one local service that serves the Web UI and stores local discussion metadata in `.deliberum/deliberum.sqlite`. The local preset keeps a demo discussion path available while you configure a real model provider.

3. Open the Web UI.

   Open `http://127.0.0.1:3877/`. The home page should show whether the local service is connected and whether model-backed discussions are ready.

4. Configure a real model provider from Web.

   Open `/setup/models`, then use **Configure OpenAI-compatible provider** to enter the provider API key, base URL, and model. Keep **Structured review compatibility** enabled for most real providers so Deliberum can organize options, disagreements, evidence gaps, risks, conclusions, and next actions reliably. Save the setup, check readiness, and use **Verify connection** before relying on a real model-backed discussion.

   Saved API keys stay on this machine. The default Web UI does not show saved secrets, env var names, provider config ids, raw JSON, or runtime details; those remain behind Advanced / Developer Mode.

5. Start and continue a model-backed discussion.

   When setup is ready, use **Start model-backed discussion** or open `/runs/new?participants=model-backed`. Write the discussion question, create the discussion, open the room, then use **Continue discussion** to collect participant perspectives and review strongest options, open disagreements, evidence gaps, risks, the current conclusion, and next recommended actions.

If you do not have a provider ready yet, use the demo discussion path first. The demo is useful for learning the room flow, but real decisions should use configured model-backed participants and verified provider setup.

For Web UI development, you can still run the daemon and Vite dev server as separate processes. The normal local product path above uses the built Web shell served by the local daemon.

For a release-readiness browser walkthrough against a real OpenAI-compatible provider, run the opt-in smoke after `corepack pnpm build`:

```bash
DELIBERUM_RELEASE_SMOKE_API_KEY=<provider-key> \
DELIBERUM_RELEASE_SMOKE_BASE_URL=https://provider.example \
DELIBERUM_RELEASE_SMOKE_MODEL=provider-model \
corepack pnpm smoke:web-release-readiness
```

If your local `.env` already contains `DELIBERUM_OPENAI_API_KEY`, `DELIBERUM_OPENAI_BASE_URL`, and `DELIBERUM_OPENAI_MODEL` from Web setup or local daemon setup, you can run `corepack pnpm smoke:web-release-readiness` without duplicating those values. The `DELIBERUM_RELEASE_SMOKE_*` variables override local `.env` values when set.

For stability checks before a release, set `DELIBERUM_RELEASE_SMOKE_RUNS=3` or another positive integer to run the same browser walkthrough repeatedly in isolated local services. The command stops on the first failed run.

This command starts an isolated local daemon and Web UI, configures the provider through Web with Structured review compatibility enabled by default, verifies the connection, starts and continues a model-backed discussion, opens the current conclusion, and scans the default UI for secrets and low-level ids. It is not part of default CI because it needs a real provider key and network access.

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
- [Basic Product Loop Completion Matrix](docs/BASIC_PRODUCT_LOOP.md)
- [Web UI Spec](docs/WEB_UI_SPEC.md)
- [Web Discussion Room Walkthrough](docs/WEB_DISCUSSION_ROOM_WALKTHROUGH.md)
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
  orchestrator/
  ui/
docs/
examples/
```

## Status

Deliberum is a pre-production local-first codebase with the core deliberation ledger, local daemon, CLI, human-first Web Discussion Room, local deterministic run profile, opt-in OpenAI-compatible provider profile, opt-in HTTP-template participant profile, and opt-in MCP tool participant profile implemented. It is not a production deployment or public hosted service.

Implemented today:

- TypeScript + zod protocol and evaluation schemas;
- append-only event store with in-memory storage, shared JSON file persistence for local CLI and optional daemon event ledgers, optional JSON daemon operation audit log persistence, optional local rotated JSONL operation audit mirroring, optional HTTP operation audit export, and optional SQLite daemon event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence with local connection-level writer serialization;
- Topic Contract session lifecycle;
- Sealed Divergence batch lifecycle with all-completed, manual, quorum, and deadline reveal policies;
- Extraction Proposals and challenge/accept lifecycle events;
- Candidate Frontier, objection, quality obligation, and accepted-object projections with projection metadata;
- Evidence Result recording plus Final Audit and Outcome Compiler in core as proposal/derived output, not final truth;
- baseline comparison report harness with coverage metadata, a Markdown report command, and a public sample fixture for externally supplied evaluation findings, without ordering systems or selecting an authoritative outcome;
- local CLI commands for sessions, batches, contributions, extraction proposals, process proposal lifecycle, final candidate/audit/outcome projection, projections, events, local ledger integrity verification, daemon runtime profile status, env-template output, safe env block writing, local interactive setup wizard secret capture, profile-doctor diagnostics, safe daemon setup-plan output, scoped daemon auth entry generation, daemon deployment posture reads, daemon ledger integrity reads, daemon operation audit reads and JSONL export, optional daemon control-plane bearer auth with single-token and scoped-registry modes, daemon resource access posture reads and revocation, daemon run orchestration, daemon resources/evidence projection reads with safe delivery and access audit history, daemon-backed final lifecycle submissions, and explicit accepted process proposal execution;
- local Hono daemon API with in-memory defaults, optional control-plane bearer auth with single-token and scoped-registry modes, optional SQLite event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence with retention limits, optional JSON event ledger, run metadata, and operation audit log persistence with retention limits, optional built Web static asset serving for local/pre-production shells, local/pre-production container packaging, safe runtime profile, deployment posture, ledger integrity, and resource access posture status, safe operation audit metadata with non-secret principal metadata, projection endpoints, mutation endpoints, session final lifecycle and projection endpoints, session resources projection endpoint, session-scoped resource delivery planning endpoint with safe ledger audit events, revocable and optionally HMAC-signed daemon resource access grants for allowed URL and hosted in-memory content deliveries, session process proposal lifecycle endpoints, run orchestration endpoints, explicit accepted process proposal execution, SSE, and WebGET status/context/resource/submission endpoints;
- React/Vite Web UI with a default Discussion Room path for starting and continuing discussions, reading participant contributions, reviewing the current conclusion, disagreements, missing evidence, risks, and next actions, plus Advanced / Developer Mode for safe daemon runtime profile status, setup-plan summaries, deployment and resource access posture summaries, safe operation audit metadata, daemon-backed session catalog, session projections, run process proposal lifecycle, execution readiness, accepted-proposal execution controls, raw outcome material, session final lifecycle/projection pages, and session resources/evidence projection pages;
- participant adapter interface, fake/manual adapters, OpenAI-compatible adapter/profile, HTTP-template participant adapter/profile for sealed participant execution, package-level MCP-compatible tool participant adapter plus opt-in daemon MCP tool participant profile with execution policy controls, OpenAI-compatible extraction/review/finalization components, and experimental WebGET adapter;
- Resource Broker and Delivery Planner support package integrated with daemon-local resource delivery planning and short-lived access grants for URL and hosted in-memory content delivery;
- read-only adaptive process proposal suggestions and execution readiness for daemon runs, explicit ledger-backed process proposal lifecycle events exposed as challengeable `ProcessProposal` material, and operator-triggered execution of accepted proposals for supported daemon stages, including candidate repair proposal execution, evidence check execution that records reported evidence results, and final/omission audit execution against existing final candidate proposal events;
- hardening for persisted ledger loading, local event integrity hash validation, optional daemon event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence/retention with restart-safe durable audit ids, local JSONL rotation and HTTP export, optional SQLite single-daemon process locking, optional daemon control-plane auth with scoped registry support, safe daemon deployment posture diagnostics, WebGET submission safety, projection traceability metadata, idempotency result consistency, SSE idempotent publish guards, WebGET context visibility, resource access base URL opt-in, optional resource access URL signing, and resource delivery safety.

Deferred work includes production multi-writer coordination for durable daemon stores, broader primitive runner coverage and automated policy beyond read-only accepted process proposal readiness, production public resource hosting and signed URL service implementation, MCP server lifecycle management, broader external tool execution policy and adapter sandboxing, production identity or public multi-user deployment, and larger benchmark datasets.

The public name **Deliberum** should be treated as the current project name. Before a formal public launch, maintainers should complete the name, domain, package-scope, and trademark checks described in the private launch checklist.

## License

Apache-2.0.
