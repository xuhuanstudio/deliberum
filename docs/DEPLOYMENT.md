# Deployment

## Current status

Deliberum is currently a local-first, pre-production implementation. The supported runtime surfaces are:

- local CLI commands using the shared JSON EventStore for local file persistence;
- local daemon API using process-local in-memory stores by default, with optional control-plane bearer auth, optional SQLite event ledger, run metadata, resource broker, and resource access grant persistence for local/pre-production use, plus JSON persistence fallback for local development;
- separate local Vite Web UI shell reading the daemon through `@deliberum/client`.

The daemon binds to `127.0.0.1` by default and does not provide production authorization or multi-user deployment yet.

## Local CLI

The CLI uses the shared JSON EventStore for local persistence. It stores events in a local JSON file under `.deliberum/` by default, with explicit `--store` / `DELIBERUM_STORE` overrides for local use and tests.

The CLI does not create hidden current-session state and does not bypass EventStore semantics.

## Local daemon API

The daemon exposes the current local HTTP API, session-scoped resource delivery planning endpoint, short-lived resource access grant routes for allowed URL and hosted in-memory content deliveries, and WebGET endpoints. It uses in-memory state by default.

For local/pre-production durable storage, set `DELIBERUM_DAEMON_SQLITE_PATH=<path>`. The daemon will use SQLite-backed stores for session ledger events, run metadata, explicitly registered resource broker metadata/content, and resource access grant state in that database, with WAL mode, a busy timeout, and local connection-level writer serialization.

For local development fallback without SQLite, `DELIBERUM_DAEMON_EVENT_STORE_PATH=<path>` opts into the shared JSON EventStore for daemon event ledger persistence, and `DELIBERUM_DAEMON_RUN_STORE_PATH=<path>` opts into JSON run metadata persistence. Use both JSON paths together when the local run workspace must survive daemon restarts.

The optional SQLite store persists session ledger events, run metadata, explicitly registered resource broker metadata/content, and resource access grant state. JSON fallback stores persist session ledger events and run metadata only. WebGET sessions, authentication state, provider secrets, and production multi-user coordination remain process-local or unimplemented. SQLite support is a durable local daemon backend, not a complete production deployment posture by itself.

For local/pre-production remote hardening, `DELIBERUM_DAEMON_AUTH_TOKEN=<token>` protects daemon control-plane endpoints with `Authorization: Bearer <token>`. The health endpoint remains public, and token-scoped WebGET/resource-access endpoints keep their own bearer semantics. This is not a production multi-user authorization system; use SSH tunneling or a real fronting auth layer for shared deployments.

## Web UI

The Web UI is currently a separate React/Vite application. It reads daemon/client responses and does not own semantic deliberation state.

The daemon does not currently serve built Web UI assets.

## Deferred deployment work

The following remain future work:

- production multi-writer coordination;
- daemon-served Web UI assets;
- production resource hosting posture;
- production authorization;
- SSH/remote deployment guidance beyond manual local port forwarding;
- Postgres-backed team/server deployments;
- container packaging.
