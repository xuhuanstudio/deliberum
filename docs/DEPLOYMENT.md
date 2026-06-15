# Deployment

## Current status

Deliberum is currently a local-first, pre-production implementation. The supported runtime surfaces are:

- local CLI commands using the shared JSON EventStore for local file persistence;
- local daemon API using process-local in-memory stores by default, with optional single-token or scoped-registry control-plane bearer auth, optional SQLite event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence for local/pre-production use, plus JSON persistence fallback for local development;
- separate local Vite Web UI shell reading the daemon through `@deliberum/client`, optional daemon-served built Web assets for local/pre-production shells, and a local/pre-production container image that packages the daemon with built Web assets.

The daemon binds to `127.0.0.1` by default and does not provide production authorization or multi-user deployment yet. The daemon entrypoint can read `DELIBERUM_HOST` and `DELIBERUM_PORT` for container or supervised process startup, but the library defaults remain localhost-first.

Use `deliberum daemon deployment-posture` or `GET /runtime/deployment-posture` against a running daemon to inspect safe local/pre-production deployment posture. The diagnostic returns exposure classes, auth mode, token mode, principal count, persistence classes, SQLite process-lock status, resource access continuity, Web static asset mode, production-readiness blockers, and safety notes without exposing daemon tokens, CORS origin values, configured resource access URLs, configured file paths, provider secrets, request bodies, or payloads. Use `deliberum daemon ledger-integrity` or `GET /runtime/ledger-integrity` to inspect safe daemon event ledger integrity counts without returning event payloads or event ids.

## Local CLI

The CLI uses the shared JSON EventStore for local persistence. It stores events in a local JSON file under `.deliberum/` by default, with explicit `--store` / `DELIBERUM_STORE` overrides for local use and tests.

The CLI does not create hidden current-session state and does not bypass EventStore semantics.

## Local daemon API

The daemon exposes the current local HTTP API, session-scoped resource delivery planning endpoint, short-lived resource access grant routes for allowed URL and hosted in-memory content deliveries, and WebGET endpoints. It uses in-memory state by default.

The daemon also exposes `GET /runtime/deployment-posture` as a no-store safe diagnostic. It is useful for checking whether a local/pre-production daemon is still bound to localhost, whether control-plane bearer auth is enabled, whether auth is using a legacy single token or a scoped registry, which store classes are process-memory versus configured, whether the SQLite process lock is configured, whether resource access grants survive restarts, whether built Web static assets are enabled, and which production-readiness blockers still apply. It does not change daemon configuration and is not a production authorization, identity, or multi-user deployment system. `GET /runtime/ledger-integrity` is also no-store and reports the daemon event store's current snapshot validation status, session/event counts, hash coverage counts, and sequence ranges without exposing event contents. It does not replace backups, external notarization, distributed consensus, or production multi-writer coordination.

For local/pre-production durable storage, set `DELIBERUM_DAEMON_SQLITE_PATH=<path>`. The daemon will use SQLite-backed stores for session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant state, and safe operation audit metadata in that database, with WAL mode, a busy timeout, and local connection-level writer serialization. `DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK=true` adds a cooperative single-daemon process lock for that SQLite file, with `DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK_TTL_MS` and `DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK_HEARTBEAT_MS` controlling stale-lock recovery. This guard reduces accidental concurrent daemon ownership of one local database but is not production distributed multi-writer coordination.

The resource access base URL defaults to the daemon's local host and port. If `DELIBERUM_RESOURCE_ACCESS_BASE_URL` is configured to a non-local URL, `DELIBERUM_RESOURCE_ACCESS_ALLOW_REMOTE=true` must also be set. Public resource access base URLs must use HTTPS. Set `DELIBERUM_RESOURCE_ACCESS_SIGNING_SECRET` to require HMAC-signed daemon access URLs for generated resource access grants; the key stays runtime-only and posture reports only whether signing is configured.

For local development fallback without SQLite, `DELIBERUM_DAEMON_EVENT_STORE_PATH=<path>` opts into the shared JSON EventStore for daemon event ledger persistence, `DELIBERUM_DAEMON_RUN_STORE_PATH=<path>` opts into JSON run metadata persistence, and `DELIBERUM_DAEMON_OPERATION_AUDIT_PATH=<path>` opts into JSON operation audit log persistence. Use the event/run JSON paths together when the local run workspace must survive daemon restarts.

The optional SQLite store persists session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant state, and operation audit metadata. JSON fallback stores persist session ledger events, run metadata, and operation audit metadata only when their paths are configured. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES=<n>` caps retained operation audit records for in-memory, JSON, and SQLite audit logs. `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_PATH=<path>` can mirror safe operation audit records to a local JSONL archive, with optional size-based rotation through `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES=<n>` and retained rotated file count through `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES=<n>`. `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_URL=<url>` can also POST the same safe operation audit record material to an HTTPS collector, with `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_TOKEN=<token>` used only as an outbound runtime bearer secret, `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS=<n>` bounding export attempts, and `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_ALLOW_INSECURE_HTTP=true` required for non-local HTTP collectors. WebGET sessions, provider secrets, and production multi-user coordination remain process-local or unimplemented. Operation audit records store normalized control-plane metadata only; they can include safe principal id, role, and scopes, but they do not store request bodies, headers, bearer tokens, raw WebGET tokens, raw resource access ids, provider secrets, or output payloads. SQLite support plus the optional process lock is a durable local daemon backend with single-daemon ownership protection, not a complete production deployment posture by itself.

For local/pre-production remote hardening, `DELIBERUM_DAEMON_AUTH_TOKEN=<token>` enables the legacy single admin token for daemon control-plane endpoints. `DELIBERUM_DAEMON_AUTH_TOKENS_JSON=<json>` enables a scoped token registry with non-secret principal ids, runtime-only token values, and `read`, `write`, or `audit` scopes. The health endpoint remains public, and token-scoped WebGET/resource-access endpoints keep their own bearer semantics. These daemon bearer modes are not a production identity or public multi-user authorization system; use SSH tunneling or a real fronting auth layer for shared deployments.

## Web UI

The Web UI is currently a separate React/Vite application. It reads daemon/client responses and does not own semantic deliberation state.

For a local/pre-production single-process shell, build the workspace and start the daemon with `DELIBERUM_DAEMON_WEB_ASSETS_PATH=<web-dist-path>`:

```bash
corepack pnpm build
DELIBERUM_DAEMON_WEB_ASSETS_PATH=apps/web/dist node apps/daemon/dist/index.js
```

When this path is set, the daemon serves Vite assets under `/assets/*` and serves the Web shell for browser navigation requests that accept `text/html`, including refreshed Web routes such as `/runs` and `/sessions/:sessionId`. JSON API callers that do not request `text/html` keep receiving the existing daemon API responses on the same paths. The shell index is returned with no-store headers, hashed assets use immutable cache headers, and file paths are constrained to the configured asset root. This is local/pre-production static serving only; it does not add public hosting, production authorization, or multi-user sessions. The Web setup page can submit OpenAI-compatible API key, base URL, model, and structured review compatibility values to the local daemon so the daemon writes a marker-delimited local env block and applies the setup to the current daemon process when possible; saved secret values are not returned to Web.

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

The container sets `DELIBERUM_HOST=0.0.0.0` inside the container so Docker port publishing can reach the daemon. The Compose file still binds the published host port to `127.0.0.1`. Keep that host-side localhost binding unless a separate fronting auth layer and network policy are in place. Use runtime environment injection, the local setup wizard, or the local Web setup page for provider keys and daemon auth tokens; do not bake secrets into the image, Compose file, Dockerfile, or Web build.

## Remote/pre-production hardening runbook

Use this runbook for a single-operator or trusted-team pre-production daemon. It is not a production multi-user deployment model.

1. Build from a clean checkout and keep CI green before packaging:

   ```bash
   corepack pnpm run ci
   docker build -t deliberum:local .
   ```

2. Generate a local environment file from daemon profile metadata, then review it before starting the daemon:

   ```bash
   node apps/cli/dist/index.js daemon setup-wizard \
     --output .deliberum/daemon.env \
     --profile openai-compatible
   ```

   The setup wizard captures secret values locally and writes a marker-delimited env block. Do not commit generated env files.

3. Keep the daemon private by default. Prefer one of these exposure patterns:

   - SSH tunnel: keep the daemon bound to `127.0.0.1` on the server and tunnel `127.0.0.1:3877` from the operator machine.
   - Private reverse proxy: put TLS, authentication, request limits, and network policy in front of the daemon, and keep daemon control-plane bearer auth enabled.
   - Local container: keep Compose's host port binding at `127.0.0.1:3877` unless a separate fronting auth layer exists.

4. Use durable local/pre-production state and audit metadata:

   ```bash
   DELIBERUM_DAEMON_SQLITE_PATH=/data/deliberum.sqlite
   DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK=true
   DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES=10000
   DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_PATH=/data/operation-audit.jsonl
   DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES=10485760
   DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES=5
   ```

   Configure `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_URL` only for a trusted HTTPS collector. Localhost HTTP is allowed for local collectors; non-local HTTP requires the explicit insecure opt-in and should not be used for shared environments.

5. Serve the Web shell from the daemon for remote/pre-production use instead of exposing a separate public Vite origin:

   ```bash
   DELIBERUM_DAEMON_WEB_ASSETS_PATH=/app/apps/web/dist
   ```

   The daemon CORS allow-list intentionally accepts local origins only. For remote browser access, use the daemon-served same-origin Web shell behind the same private tunnel or fronting proxy.

6. Configure resource access only for the exposure class you actually need:

   - For SSH-tunneled or localhost use, leave `DELIBERUM_RESOURCE_ACCESS_BASE_URL` unset or set it to the local daemon URL.
   - For LAN or public pre-production access URLs, set `DELIBERUM_RESOURCE_ACCESS_BASE_URL` to the externally reachable HTTPS URL and set `DELIBERUM_RESOURCE_ACCESS_ALLOW_REMOTE=true`.
   - For public pre-production access URLs, set `DELIBERUM_RESOURCE_ACCESS_SIGNING_SECRET` to a runtime-only value with at least 32 non-whitespace characters.
   - Keep `DELIBERUM_RESOURCE_ACCESS_TTL_MS` short enough for the review workflow. Resource access grants are revocable, but they are not production authorization.

7. Verify posture after startup:

   ```bash
   curl -fsS http://127.0.0.1:3877/health
   node apps/cli/dist/index.js daemon deployment-posture --json
   node apps/cli/dist/index.js daemon ledger-integrity --json
   node apps/cli/dist/index.js daemon resource-access status --json
   node apps/cli/dist/index.js daemon operation-audit --limit 25 --json
   ```

   Expected pre-production blockers still include missing production authorization, missing production multi-writer coordination, and missing production public resource hosting. Treat those blockers as deployment boundaries, not warnings to suppress.

## Deferred deployment work

The following remain future work:

- production multi-writer coordination;
- production public resource hosting and signed URL service implementation;
- production authorization;
- multi-user deployment;
- Postgres-backed team/server deployments.
