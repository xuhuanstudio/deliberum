# Deployment

## Current status

Deliberum is currently a local-first, pre-production implementation. The supported runtime surfaces are:

- local CLI commands using the shared JSON EventStore for local file persistence;
- local daemon API using process-local in-memory stores by default, with optional control-plane bearer auth, optional SQLite event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence for local/pre-production use, plus JSON persistence fallback for local development;
- separate local Vite Web UI shell reading the daemon through `@deliberum/client`.

The daemon binds to `127.0.0.1` by default and does not provide production authorization or multi-user deployment yet.

Use `deliberum daemon deployment-posture` or `GET /runtime/deployment-posture` against a running daemon to inspect safe local/pre-production deployment posture. The diagnostic returns exposure classes, auth mode, persistence classes, resource access continuity, production-readiness blockers, and safety notes without exposing daemon tokens, CORS origin values, configured resource access URLs, provider secrets, request bodies, or payloads.

## Local CLI

The CLI uses the shared JSON EventStore for local persistence. It stores events in a local JSON file under `.deliberum/` by default, with explicit `--store` / `DELIBERUM_STORE` overrides for local use and tests.

The CLI does not create hidden current-session state and does not bypass EventStore semantics.

## Local daemon API

The daemon exposes the current local HTTP API, session-scoped resource delivery planning endpoint, short-lived resource access grant routes for allowed URL and hosted in-memory content deliveries, and WebGET endpoints. It uses in-memory state by default.

The daemon also exposes `GET /runtime/deployment-posture` as a no-store safe diagnostic. It is useful for checking whether a local/pre-production daemon is still bound to localhost, whether control-plane bearer auth is enabled, which store classes are process-memory versus configured, whether resource access grants survive restarts, and which production-readiness blockers still apply. It does not change daemon configuration and is not a production authorization or multi-user deployment system.

For local/pre-production durable storage, set `DELIBERUM_DAEMON_SQLITE_PATH=<path>`. The daemon will use SQLite-backed stores for session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant state, and safe operation audit metadata in that database, with WAL mode, a busy timeout, and local connection-level writer serialization.

The resource access base URL defaults to the daemon's local host and port. If `DELIBERUM_RESOURCE_ACCESS_BASE_URL` is configured to a non-local URL, `DELIBERUM_RESOURCE_ACCESS_ALLOW_REMOTE=true` must also be set. Public resource access base URLs must use HTTPS.

For local development fallback without SQLite, `DELIBERUM_DAEMON_EVENT_STORE_PATH=<path>` opts into the shared JSON EventStore for daemon event ledger persistence, `DELIBERUM_DAEMON_RUN_STORE_PATH=<path>` opts into JSON run metadata persistence, and `DELIBERUM_DAEMON_OPERATION_AUDIT_PATH=<path>` opts into JSON operation audit log persistence. Use the event/run JSON paths together when the local run workspace must survive daemon restarts.

The optional SQLite store persists session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant state, and operation audit metadata. JSON fallback stores persist session ledger events, run metadata, and operation audit metadata only when their paths are configured. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES=<n>` caps retained operation audit records for in-memory, JSON, and SQLite audit logs. WebGET sessions, authentication state, provider secrets, and production multi-user coordination remain process-local or unimplemented. Operation audit records store normalized control-plane metadata only; they do not store request bodies, headers, bearer tokens, raw WebGET tokens, raw resource access ids, provider secrets, or output payloads. SQLite support is a durable local daemon backend, not a complete production deployment posture by itself.

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
- multi-user deployment and SSH/remote deployment guidance beyond manual local port forwarding;
- Postgres-backed team/server deployments;
- container packaging.
