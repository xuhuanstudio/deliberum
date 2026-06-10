# CLI, Daemon, and Web

Deliberum is terminal-first and local-first, but not CLI-only. CLI, daemon, and Web are control/view surfaces over the event ledger and core projections.

## Current Shape

```text
CLI / Web UI
  ↓
local daemon or CLI-local EventStore
  ↓
append-only event ledger + core lifecycle/projection APIs
  ↓
adapters and resources as support layers
```

The event ledger and derived projections remain the source of truth. The CLI, daemon, and Web UI must not introduce hidden semantic state, a central Judge, a voting winner, or a current-best field.

## CLI

The current CLI uses a local JSON EventStore at `.deliberum/events.json` by default. It supports `--store <path>` and `DELIBERUM_STORE` for explicit local storage. The JSON store is CLI-local, validates persisted ledgers on load, and is not daemon storage. It is local-first and single-writer oriented; concurrent CLI writes are not guaranteed yet. Future persistent daemon storage may address multi-writer and concurrent use.

Implemented commands:

```bash
deliberum new <topic>
deliberum batch open --session <id> --purpose <purpose>
deliberum contribution add --session <id> --batch <id> --author <id> --payload-json <json>
deliberum batch close --session <id> --batch <id>
deliberum extraction propose --session <id> --author <id> --rationale <text> --input <json-file>
deliberum proposal challenge --session <id> --proposal-event <id> --author <id> --reason <text>
deliberum proposal accept --session <id> --proposal-event <id> --author <id> --rationale <text>
deliberum frontier --session <id>
deliberum objections --session <id>
deliberum obligations --session <id>
deliberum events --session <id>
deliberum runs create --input <run-plan.json> [--daemon-url <local-url>]
deliberum runs list [--daemon-url <local-url>]
deliberum runs show <runId> [--daemon-url <local-url>]
deliberum runs start <runId> --input <start.json> [--daemon-url <local-url>]
deliberum runs outcome <runId> [--daemon-url <local-url>]
```

CLI view commands return structured JSON. `frontier`, `objections`, and `obligations` are projection-derived and include projection metadata.

CLI run commands are local daemon control commands. They require a running local daemon, call daemon run endpoints through `@deliberum/client`, and do not use the CLI-local JSON EventStore for run orchestration.

## Daemon

The current daemon is a local Hono API. It binds to `127.0.0.1` by default, does not enable wildcard CORS by default, and uses a process-local `InMemoryEventStore`. State resets when the daemon process restarts.

The daemon also owns a process-local in-memory run store for local orchestration control. Run endpoints expose safe operational views over orchestrator state; they do not expose provider secrets, own Candidate Frontier semantics, select a single answer, or turn compiled outcomes into authoritative truth.

Implemented endpoints:

```text
GET  /health
GET  /runs
GET  /runs/:runId
GET  /runs/:runId/events/stream
GET  /runs/:runId/outcome
POST /runs
POST /runs/:runId/start
GET  /sessions/:sessionId/events
GET  /sessions/:sessionId/events/stream
GET  /sessions/:sessionId/frontier
GET  /sessions/:sessionId/objections
GET  /sessions/:sessionId/obligations
POST /sessions
POST /sessions/:sessionId/batches
POST /sessions/:sessionId/batches/:batchId/contributions
POST /sessions/:sessionId/batches/:batchId/close
POST /sessions/:sessionId/extractions
POST /sessions/:sessionId/proposals/:proposalEventId/challenges
POST /sessions/:sessionId/proposals/:proposalEventId/acceptance
```

Run orchestration is synchronous and local in the current daemon. Component registries must be injected by the embedding process or tests; the daemon does not provide fake or real provider-backed defaults. CLI run commands do not include real provider configuration UX, interactive setup, or run event follow.

Experimental WebGET endpoints are local daemon endpoints:

```text
GET /webget/:token/start
GET /webget/:token/context
GET /webget/:token/context/:page
GET /webget/:token/resources/:resourceId
GET /webget/:token/submit
GET /webget/:token/commit
```

Deferred daemon work includes persistent SQLite storage, resource delivery endpoints outside WebGET, real provider-backed execution defaults and UX, interactive setup, run event follow, production authentication, and remote/multi-user deployment.

## Web UI

The current Web UI is a React/Vite shell that reads from `@deliberum/client` and the local daemon. It has pages for session overview, Candidate Frontier, objections, quality obligations, events, final placeholder, resources placeholder, and local daemon run workspace views.

The Web run workspace is a local daemon control/view surface. Run workspace actions require the local daemon to be running; the Web UI does not provide public hosting, authentication, persistent daemon storage, or real provider setup UX yet. It can list runs, create a run from JSON, inspect daemon run state, start requested run stages from a JSON request, read safe projection endpoints by run session id, and display compiled output only as a provisional outcome. It does not implement run event follow or a raw run event timeline.

The Web UI does not own semantic deliberation state, implement Candidate Frontier logic, run adapters, serve resources, or compile outcomes. Session final and resource pages currently explain that core packages exist, but daemon/Web live integration for those session pages is deferred.
