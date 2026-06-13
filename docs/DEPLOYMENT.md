# Deployment

## Current status

Deliberum is currently a local-first, pre-production implementation. The supported runtime surfaces are:

- local CLI commands using the shared JSON EventStore for local file persistence;
- local daemon API using process-local in-memory stores by default, with optional control-plane bearer auth, optional SQLite event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence for local/pre-production use, plus JSON persistence fallback for local development;
- separate local Vite Web UI shell reading the daemon through `@deliberum/client`, optional daemon-served built Web assets for local/pre-production shells, and a local/pre-production container image that packages the daemon with built Web assets.

The daemon binds to `127.0.0.1` by default and does not provide production authorization or multi-user deployment yet. The daemon entrypoint can read `DELIBERUM_HOST` and `DELIBERUM_PORT` for container or supervised process startup, but the library defaults remain localhost-first.

Use `deliberum daemon deployment-posture` or `GET /runtime/deployment-posture` against a running daemon to inspect safe local/pre-production deployment posture. The diagnostic returns exposure classes, auth mode, persistence classes, resource access continuity, Web static asset mode, production-readiness blockers, and safety notes without exposing daemon tokens, CORS origin values, configured resource access URLs, configured file paths, provider secrets, request bodies, or payloads.

## Local CLI

The CLI uses the shared JSON EventStore for local persistence. It stores events in a local JSON file under `.deliberum/` by default, with explicit `--store` / `DELIBERUM_STORE` overrides for local use and tests.

The CLI does not create hidden current-session state and does not bypass EventStore semantics.

## Local daemon API

The daemon exposes the current local HTTP API, session-scoped resource delivery planning endpoint, short-lived resource access grant routes for allowed URL and hosted in-memory content deliveries, and WebGET endpoints. It uses in-memory state by default.

The daemon also exposes `GET /runtime/deployment-posture` as a no-store safe diagnostic. It is useful for checking whether a local/pre-production daemon is still bound to localhost, whether control-plane bearer auth is enabled, which store classes are process-memory versus configured, whether resource access grants survive restarts, whether built Web static assets are enabled, and which production-readiness blockers still apply. It does not change daemon configuration and is not a production authorization or multi-user deployment system.

For local/pre-production durable storage, set `DELIBERUM_DAEMON_SQLITE_PATH=<path>`. The daemon will use SQLite-backed stores for session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant state, and safe operation audit metadata in that database, with WAL mode, a busy timeout, and local connection-level writer serialization.

The resource access base URL defaults to the daemon's local host and port. If `DELIBERUM_RESOURCE_ACCESS_BASE_URL` is configured to a non-local URL, `DELIBERUM_RESOURCE_ACCESS_ALLOW_REMOTE=true` must also be set. Public resource access base URLs must use HTTPS.

For local development fallback without SQLite, `DELIBERUM_DAEMON_EVENT_STORE_PATH=<path>` opts into the shared JSON EventStore for daemon event ledger persistence, `DELIBERUM_DAEMON_RUN_STORE_PATH=<path>` opts into JSON run metadata persistence, and `DELIBERUM_DAEMON_OPERATION_AUDIT_PATH=<path>` opts into JSON operation audit log persistence. Use the event/run JSON paths together when the local run workspace must survive daemon restarts.

The optional SQLite store persists session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant state, and operation audit metadata. JSON fallback stores persist session ledger events, run metadata, and operation audit metadata only when their paths are configured. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES=<n>` caps retained operation audit records for in-memory, JSON, and SQLite audit logs. `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_PATH=<path>` can mirror safe operation audit records to a local JSONL archive, with optional size-based rotation through `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES=<n>` and retained rotated file count through `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES=<n>`. `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_URL=<url>` can also POST the same safe operation audit record material to an HTTPS collector, with `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_TOKEN=<token>` used only as an outbound runtime bearer secret, `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS=<n>` bounding export attempts, and `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_ALLOW_INSECURE_HTTP=true` required for non-local HTTP collectors. WebGET sessions, authentication state, provider secrets, and production multi-user coordination remain process-local or unimplemented. Operation audit records store normalized control-plane metadata only; they do not store request bodies, headers, bearer tokens, raw WebGET tokens, raw resource access ids, provider secrets, or output payloads. SQLite support is a durable local daemon backend, not a complete production deployment posture by itself.

For local/pre-production remote hardening, `DELIBERUM_DAEMON_AUTH_TOKEN=<token>` protects daemon control-plane endpoints with `Authorization: Bearer <token>`. The health endpoint remains public, and token-scoped WebGET/resource-access endpoints keep their own bearer semantics. This is not a production multi-user authorization system; use SSH tunneling or a real fronting auth layer for shared deployments.

## Web UI

The Web UI is currently a separate React/Vite application. It reads daemon/client responses and does not own semantic deliberation state.

For a local/pre-production single-process shell, build the Web app and start the daemon with `DELIBERUM_DAEMON_WEB_ASSETS_PATH=<web-dist-path>`:

```bash
corepack pnpm --filter @deliberum/web build
DELIBERUM_DAEMON_WEB_ASSETS_PATH=apps/web/dist node apps/daemon/dist/index.js
```

When this path is set, the daemon serves Vite assets under `/assets/*` and serves the Web shell for browser navigation requests that accept `text/html`, including refreshed Web routes such as `/runs` and `/sessions/:sessionId`. JSON API callers that do not request `text/html` keep receiving the existing daemon API responses on the same paths. The shell index is returned with no-store headers, hashed assets use immutable cache headers, and file paths are constrained to the configured asset root. This is local/pre-production static serving only; it does not add public hosting, production authorization, multi-user sessions, or a secret-capturing provider setup flow.

## Local/pre-production container

The repository includes a root `Dockerfile` and `compose.yaml` for a single local/pre-production daemon container. The image runs the existing workspace CI during build, packages the built daemon and Web assets, serves the Web shell from `/app/apps/web/dist`, stores durable local daemon state in `/data/deliberum.sqlite`, and exposes `/health` for container health checks.

Build and run directly:

```bash
docker build -t deliberum:local .
docker run --rm \
  -p 127.0.0.1:3877:3877 \
  -v deliberum-data:/data \
  deliberum:local
```

Or use Compose:

```bash
docker compose up --build
```

The container sets `DELIBERUM_HOST=0.0.0.0` inside the container so Docker port publishing can reach the daemon. The Compose file still binds the published host port to `127.0.0.1`. Keep that host-side localhost binding unless a separate fronting auth layer and network policy are in place. Use runtime environment injection for provider keys and daemon auth tokens; do not bake secrets into the image, Compose file, Dockerfile, or Web build.

## Deferred deployment work

The following remain future work:

- production multi-writer coordination;
- production public resource hosting and signed URL service implementation;
- production authorization;
- multi-user deployment and SSH/remote deployment guidance beyond manual local port forwarding;
- Postgres-backed team/server deployments.
