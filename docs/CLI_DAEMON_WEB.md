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

The current CLI uses a local JSON EventStore at `.deliberum/events.json` by default. It supports `--store <path>` and `DELIBERUM_STORE` for explicit local storage. The JSON store is CLI-local, validates persisted ledgers on load, and is not daemon storage.

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
```

CLI view commands return structured JSON. `frontier`, `objections`, and `obligations` are projection-derived and include projection metadata.

## Daemon

The current daemon is a local Hono API. It binds to `127.0.0.1` by default, does not enable wildcard CORS by default, and uses a process-local `InMemoryEventStore`. State resets when the daemon process restarts.

Implemented endpoints:

```text
GET  /health
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

Experimental WebGET endpoints are local daemon endpoints:

```text
GET /webget/:token/start
GET /webget/:token/context
GET /webget/:token/context/:page
GET /webget/:token/resources/:resourceId
GET /webget/:token/submit
GET /webget/:token/commit
```

Deferred daemon work includes persistent SQLite storage, final outcome endpoints, resource delivery endpoints outside WebGET, production authentication, and remote/multi-user deployment.

## Web UI

The current Web UI is a React/Vite shell that reads from `@deliberum/client` and the local daemon. It has pages for session overview, Candidate Frontier, objections, quality obligations, events, final placeholder, and resources placeholder.

The Web UI does not own semantic deliberation state, implement Candidate Frontier logic, run adapters, serve resources, or compile final outcomes. Final and resource pages currently explain that core packages exist, but daemon/Web live integration for those pages is deferred.
