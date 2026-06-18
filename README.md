# Deliberum

**Deliberum** is a local human + AI deliberation room and quality-centered deliberation runtime.

It is not a role-agent chat demo, not a voting system, not a central-Judge workflow, and not an MCP wrapper. The current local Web product helps you deliberate with configured AI participants around a topic and produce a higher-quality outcome through structured divergence, objections, quality obligations, evidence checks, audits, and final compilation. The underlying protocol is designed for broader heterogeneous participants over time, but the Web UI does not implement invite, share, or multi-human room joining yet.

> Working tagline: **Human-first peer deliberation for higher-quality decisions.**

## Start here

If you want to run Deliberum locally, start with
[Getting Started](docs/GETTING_STARTED.md). It gives the shortest supported path
from a source checkout to the local Web UI, provider setup, provider
verification, and one discussion with AI.

For Simplified Chinese, see [README.zh-CN.md](README.zh-CN.md) and
[Getting Started zh-CN](docs/zh-CN/GETTING_STARTED.md).

## Why Deliberum exists

Most multi-agent systems rely on fixed roles, fixed order, supervisor routing, model voting, or a final judge. These designs are useful for workflows, but they often fail for open-ended deliberation:

- fixed roles restrict model capability;
- fixed order creates anchoring;
- a central judge becomes a semantic bottleneck;
- majority voting can let weak consensus overpower strong objections;
- raw group chat creates noise and weak convergence;
- overly rigid workflows cannot adapt to the real shape of a problem.

Deliberum treats deliberation as a quality-centered process. It starts with a system-issued **Topic Contract**, runs **sealed divergence** to preserve independent perspectives, builds a **Candidate Frontier**, tracks **Objections**, enforces **Quality Obligations**, dynamically selects deliberation primitives, performs evidence checks where needed, and compiles an outcome with unresolved boundaries instead of pretending that every disagreement disappeared.

The Web UI presents those concepts as a local deliberation room for normal users: a discussion brief, you as the current human participant, configured AI participants, readable participant perspectives, strongest current options, still-unresolved points, what needs checking, risks, the current answer, and next steps. Low-level daemon, ledger, runtime, resource, proposal, event, run, and session details remain available in Advanced / Developer Mode.

## Core ideas

- **Topic Contract**: the system, not a privileged user message, publishes the discussion topic, goals, constraints, participants, and output expectations.
- **Peer Participants**: the protocol represents humans, models, tools, web-only participants, and external systems uniformly; the current local Web path exposes you plus configured AI participants.
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
- Check local service and model/provider readiness from `/setup/models`, including a plain-language provider setup checklist and a local OpenAI-compatible setup form that writes provider setup through the local service without showing saved secrets or default-mode env var names.
- Continue existing discussions from `/runs`.
- Read participant/model perspectives as discussion contributions.
- Follow the room timeline by deliberation stage.
- Keep the current answer, still-unresolved points, what needs checking, risks, and next steps visible.
- Use user-facing actions such as Continue discussion, Ask for stronger options, Review disagreements, Check evidence, and Update conclusion when ready.
- Open Advanced / Developer Mode only when low-level runtime, ledger, raw JSON, resource, audit, or internal identifier details are needed.

English is the default Web language. Simplified Chinese is supported through the Web localization table.

## Quickstart: local Web product loop

This path is for a normal local user who wants to try the product through Web, not inspect the runtime first.
For a guided first-use path with troubleshooting, use
[Getting Started](docs/GETTING_STARTED.md).
Use the [Basic Product Loop Completion Matrix](docs/BASIC_PRODUCT_LOOP.md) as
the acceptance checklist for this path. The default Web loop is not complete
until the matrix steps are verified with real browser evidence.

Prerequisites:

- Node.js 24 or newer;
- Corepack;
- pnpm 11 through Corepack.

Supported v1.1 source-checkout platforms:

- macOS with Node.js 24 or newer and Corepack-managed pnpm 11;
- Ubuntu Linux with Node.js 24 or newer and Corepack-managed pnpm 11.

GitHub CI verifies the Ubuntu Linux path through the main `Validate` job, which
runs the full local-start smoke, and verifies macOS through the dedicated
`Local start (macos-latest)` job. Windows and WSL2 may work with the same
Node.js and pnpm requirements, but they are not v1.1 supported platforms until
the local-start path is verified in CI.

Recommended first run from the repository root:

```bash
sh scripts/start-local-product.sh
```

This checks whether Node.js and Corepack are ready, then runs the supported
first-run helper that installs dependencies, builds Deliberum, and starts the
local Web service. Keep that terminal running, then open the URL printed by the
command.

If Node.js and Corepack are already ready, this shell helper delegates to
`node scripts/start-local-product.mjs`.

If you prefer to run each step manually, check your local setup before
installing dependencies:

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

   Open `http://127.0.0.1:3877/`. The home page should show that Deliberum is a local human + AI deliberation room, whether the local service is connected, and whether discussions with AI are ready.

4. Configure a real model provider from Web.

   Open **Connect AI** (`/setup/models`), then use **Configure OpenAI-compatible provider** to enter the provider API key, base URL, and model. Keep **Structured review compatibility** enabled for most real providers so Deliberum can organize options, unresolved points, what needs checking, risks, answers, and next steps reliably. Save the setup, check readiness, and use **Test connection** before relying on a discussion with AI. The current Web path shows that one verified provider powers configured AI participants; participant model choices can be edited in Connect AI, and one-off model assignment is still available on the New Discussion page.

   Saved API keys stay on this machine. The default Web UI does not show saved secrets, env var names, provider config ids, raw JSON, or runtime details; those remain behind Advanced / Developer Mode.

5. Start and continue a discussion with AI.

   When setup is ready, use **Start focused discussion** for two AI viewpoints or **Start broader discussion** for three AI viewpoints. You can also open `/runs/new?participants=model-backed`. Write the discussion question, optionally choose **Model for first replies**, choose **Model for review and answer** for Skeptic, Evidence checker, Risk reviewer, and Summary writer, and use **Choose models per viewpoint** only when individual viewpoints should use different models. Use **Save participant choices** to reuse these non-secret model choices through the local service for future discussions; Connect AI can also edit, save, clear, and summarize the saved discussion depth and participant model choices without API keys, base URLs, or internal provider details. Create the discussion, open the room, then use **Continue discussion** to collect participant perspectives and review strongest options, still-unresolved points, what needs checking, risks, the current answer, and next steps.

If you do not have a provider ready yet, use the demo discussion path first. The demo is useful for learning the room flow, but real decisions should use configured AI participants and tested provider setup.

For Web UI development, you can still run the daemon and Vite dev server as separate processes. The normal local product path above uses the built Web shell served by the local daemon.

### Troubleshooting local startup

Use these checks before changing runtime settings or filing an issue:

- **Prerequisite check fails**: run `sh scripts/start-local-product.sh` to get normal-user guidance, install Node.js 24 or newer, enable Corepack, then rerun the same command. The Node-based prerequisite check prints the next install/build/start command when the local toolchain is ready.
- **Dependencies or build fail**: run `corepack pnpm install`, then `corepack pnpm doctor:local`, then `corepack pnpm build`. Do not skip the build step; `start:local` serves the built Web shell.
- **`start:local` says the Web build is missing**: run `corepack pnpm build` again, then restart with `corepack pnpm start:local`.
- **Port 3877 is already in use**: start on another local port, for example `DELIBERUM_PORT=3888 corepack pnpm start:local`, then open the URL printed by the command.
- **The Web UI says the local service is unavailable**: keep the `start:local` terminal running, open the printed local URL, and use **Check again** in Connect AI after the service responds.
- **Provider connection test fails**: review the API key, base URL, model, and Structured review compatibility setting in Connect AI (`/setup/models`), make sure the provider endpoint is reachable, then use **Test connection** again. You can start a demo discussion while fixing provider setup.
- **A real provider discussion pauses or fails**: use the default recovery actions such as **Check AI setup**, **Try Continue discussion again**, or **Start a new discussion with AI**. Do not paste API keys, full provider responses, or raw model output into issues or logs.

For a release-readiness browser walkthrough against a real OpenAI-compatible provider, run the opt-in smoke after `corepack pnpm build`:

```bash
DELIBERUM_RELEASE_SMOKE_API_KEY=<provider-key> \
DELIBERUM_RELEASE_SMOKE_BASE_URL=https://provider.example \
DELIBERUM_RELEASE_SMOKE_MODEL=provider-model \
corepack pnpm smoke:web-release-readiness
```

If your local `.env` already contains `DELIBERUM_OPENAI_API_KEY`, `DELIBERUM_OPENAI_BASE_URL`, and `DELIBERUM_OPENAI_MODEL` from Web setup or local daemon setup, you can run `corepack pnpm smoke:web-release-readiness` without duplicating those values. The `DELIBERUM_RELEASE_SMOKE_*` variables override local `.env` values when set.

For stability checks before a release, set `DELIBERUM_RELEASE_SMOKE_RUNS=3` or another positive integer to run the same browser walkthrough repeatedly in isolated local services. The command stops on the first failed run.

This command starts an isolated local service and Web UI, configures the provider through Web with Structured review compatibility enabled by default, tests the connection, starts and continues a discussion with AI, opens the current answer, and scans the default UI for secrets and low-level ids. It is not part of default CI because it needs a real provider key and network access.

## Documentation

- [Getting Started](docs/GETTING_STARTED.md)
- [README zh-CN](README.zh-CN.md)
- [Getting Started zh-CN](docs/zh-CN/GETTING_STARTED.md)
- [Project Charter](docs/PROJECT_CHARTER.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Protocol](docs/PROTOCOL.md)
- [Data Model](docs/DATA_MODEL.md)
- [Quality Model](docs/QUALITY_MODEL.md)
- [Adapters and Resource Delivery](docs/ADAPTERS_AND_RESOURCE_DELIVERY.md)
- [WebGET Protocol](docs/WEBGET_PROTOCOL.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Storage Compatibility and Recovery](docs/STORAGE_RECOVERY.md)
- [Technology Stack](docs/TECH_STACK.md)
- [Basic Product Loop Completion Matrix](docs/BASIC_PRODUCT_LOOP.md)
- [v0.1 Open Beta Completion Report](docs/V0_1_OPEN_BETA_COMPLETION_REPORT.md)
- [v1.0 Production Readiness Matrix](docs/V1_0_PRODUCTION_READINESS_MATRIX.md)
- [v1.0 Web Product Coherence Audit](docs/V1_0_WEB_PRODUCT_COHERENCE_AUDIT.md)
- [v1.0 Real Provider Stability Audit](docs/V1_0_REAL_PROVIDER_STABILITY_AUDIT.md)
- [v1.0 Model and Participant Management Audit](docs/V1_0_MODEL_PARTICIPANT_MANAGEMENT_AUDIT.md)
- [v1.0 Storage Compatibility and Recovery Audit](docs/V1_0_STORAGE_RECOVERY_AUDIT.md)
- [v1.0 CI and Release Evidence Audit](docs/V1_0_CI_RELEASE_EVIDENCE_AUDIT.md)
- [v1.0 Normal User Blocker Audit](docs/V1_0_NORMAL_USER_BLOCKER_AUDIT.md)
- [v1.0 Production Stable Completion Report](docs/V1_0_COMPLETION_REPORT.md)
- [v1.0 Release Notes](docs/V1_0_RELEASE_NOTES.md)
- [v1.1 Release Notes](docs/V1_1_RELEASE_NOTES.md)
- [v1.1.1 Release Notes](docs/V1_1_1_RELEASE_NOTES.md)
- [v1.1.2 Release Notes](docs/V1_1_2_RELEASE_NOTES.md)
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
- React/Vite Web UI with a default local deliberation-room path for starting and continuing discussions, reading participant contributions from you and configured AI participants, reviewing the current answer, still-unresolved points, what needs checking, risks, and next steps, plus Advanced / Developer Mode for safe daemon runtime profile status, setup-plan summaries, deployment and resource access posture summaries, safe operation audit metadata, daemon-backed session catalog, session projections, run process proposal lifecycle, execution readiness, accepted-proposal execution controls, raw outcome material, session final lifecycle/projection pages, and session resources/evidence projection pages;
- participant adapter interface, fake/manual adapters, OpenAI-compatible adapter/profile, HTTP-template participant adapter/profile for sealed participant execution, package-level MCP-compatible tool participant adapter plus opt-in daemon MCP tool participant profile with execution policy controls, OpenAI-compatible extraction/review/finalization components, and experimental WebGET adapter;
- Resource Broker and Delivery Planner support package integrated with daemon-local resource delivery planning and short-lived access grants for URL and hosted in-memory content delivery;
- read-only adaptive process proposal suggestions and execution readiness for daemon runs, explicit ledger-backed process proposal lifecycle events exposed as challengeable `ProcessProposal` material, and operator-triggered execution of accepted proposals for supported daemon stages, including candidate repair proposal execution, evidence check execution that records reported evidence results, and final/omission audit execution against existing final candidate proposal events;
- hardening for persisted ledger loading, local event integrity hash validation, optional daemon event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence/retention with restart-safe durable audit ids, local JSONL rotation and HTTP export, optional SQLite single-daemon process locking, optional daemon control-plane auth with scoped registry support, safe daemon deployment posture diagnostics, WebGET submission safety, projection traceability metadata, idempotency result consistency, SSE idempotent publish guards, WebGET context visibility, resource access base URL opt-in, optional resource access URL signing, and resource delivery safety.

Deferred work includes production multi-writer coordination for durable daemon stores, broader primitive runner coverage and automated policy beyond read-only accepted process proposal readiness, production public resource hosting and signed URL service implementation, MCP server lifecycle management, broader external tool execution policy and adapter sandboxing, production identity or public multi-user deployment, and larger benchmark datasets.

The public name **Deliberum** should be treated as the current project name. Before a formal public launch, maintainers should complete the name, domain, package-scope, and trademark checks described in the private launch checklist.

## License

Apache-2.0.
