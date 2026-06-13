# CLI, Daemon, and Web

Deliberum is terminal-first and local-first, but not CLI-only. CLI, daemon, and Web are control/view surfaces over the event ledger and core projections.

## Current Shape

```text
CLI / Web UI
  ↓
local daemon or CLI local JSON ledger
  ↓
append-only event ledger + core lifecycle/projection APIs
  ↓
adapters and resources as support layers
```

The event ledger and derived projections remain the source of truth. The CLI, daemon, and Web UI must not introduce hidden semantic state, a central Judge, a voting winner, or a current-best field.

## CLI

The current CLI uses the shared JSON EventStore at `.deliberum/events.json` by default. It supports `--store <path>` and `DELIBERUM_STORE` for explicit local storage. The JSON store validates persisted ledgers on load and is local-first and single-writer oriented; concurrent writes are not guaranteed yet.

Implemented commands:

```bash
deliberum new <topic>
deliberum batch open --session <id> --purpose <purpose> [--reveal-policy <policy>] [--quorum-count <count>] [--deadline-at <timestamp>]
deliberum contribution add --session <id> --batch <id> --author <id> --payload-json <json>
deliberum batch close --session <id> --batch <id>
deliberum extraction propose --session <id> --author <id> --rationale <text> --input <json-file>
deliberum proposal challenge --session <id> --proposal-event <id> --author <id> --reason <text>
deliberum proposal accept --session <id> --proposal-event <id> --author <id> --rationale <text>
deliberum process proposals --session <id>
deliberum process propose --session <id> --author <id> --input <json-file> [--based-on-event <event-id>...]
deliberum process challenge --session <id> --proposal-event <id> --author <id> --reason <text>
deliberum process decide --session <id> --proposal-event <id> --author <id> --status <accepted|deferred|rejected> --rationale <text>
deliberum final propose --session <id> --author <id> --input <json-file>
deliberum final audit --session <id> --proposal-event <id> --author <id> --input <json-file>
deliberum final compile --session <id> [--proposal-event <id>]
deliberum frontier --session <id>
deliberum objections --session <id>
deliberum obligations --session <id>
deliberum events --session <id>
deliberum ledger verify [--store <path>]
deliberum daemon profiles [--daemon-url <local-url>]
deliberum daemon env-template [--profile <id>] [--daemon-url <local-url>]
deliberum daemon env-write --output <path> [--profile <id>] [--set <NAME=value>] [--overwrite] [--dry-run] [--daemon-url <local-url>]
deliberum daemon setup-wizard --output <path> [--profile <id>] [--overwrite] [--skip-optional] [--daemon-url <local-url>]
deliberum daemon profile-doctor [--profile <id>] [--daemon-url <local-url>]
deliberum daemon setup-plan [--profile <id>] [--daemon-url <local-url>]
deliberum daemon auth-entry --principal <id> [--role <admin|operator|observer|auditor>] [--scope <read|write|audit>] [--token <token>]
deliberum daemon deployment-posture [--daemon-url <local-url>]
deliberum daemon ledger-integrity [--daemon-url <local-url>]
deliberum daemon operation-audit [--limit <n>] [--format <json|jsonl>] [--daemon-url <local-url>]
deliberum daemon resource-access status [--daemon-url <local-url>]
deliberum daemon resource-access revoke <access-id> [--daemon-url <local-url>]
deliberum runs create --input <run-plan.json> [--daemon-url <local-url>]
deliberum runs list [--daemon-url <local-url>]
deliberum runs show <runId> [--daemon-url <local-url>]
deliberum runs events <runId> [--follow] [--daemon-url <local-url>]
deliberum runs start <runId> --input <start.json> [--daemon-url <local-url>]
deliberum runs outcome <runId> [--proposal-event <event-id>] [--daemon-url <local-url>]
deliberum runs resources <runId> [--daemon-url <local-url>]
deliberum runs process-proposals <runId> [--daemon-url <local-url>]
deliberum runs process-propose <runId> --author <id> --input <json-file> [--based-on-event <event-id>...] [--idempotency-key <key>] [--daemon-url <local-url>]
deliberum runs process-challenge <runId> --proposal-event <event-id> --author <id> --reason <text> [--idempotency-key <key>] [--daemon-url <local-url>]
deliberum runs process-decide <runId> --proposal-event <event-id> --author <id> --status <accepted|deferred|rejected> --rationale <text> [--idempotency-key <key>] [--daemon-url <local-url>]
deliberum runs execute-process-proposal <runId> --proposal-event <event-id> [--daemon-url <local-url>]
deliberum runs final-propose <runId> --author <id> --input <json-file> [--idempotency-key <key>] [--daemon-url <local-url>]
deliberum runs final-audit <runId> --proposal-event <event-id> --author <id> --input <json-file> [--idempotency-key <key>] [--daemon-url <local-url>]
```

CLI view commands return structured JSON. `frontier`, `objections`, and `obligations` are projection-derived and include projection metadata.

`deliberum ledger verify` opens the configured local JSON EventStore, runs the same load-time structure and hash validation, and returns session/event counts plus hashed/legacy event counts. It does not read daemon SQLite stores or replace external backup, notarization, or multi-writer coordination.

CLI process commands use the local JSON EventStore. They append or project process proposal lifecycle events only. Accepting a process proposal records a process decision; it does not start daemon stages, open batches, run adapters, choose winners, or compile outcomes.

CLI final commands also use the local JSON EventStore. `final propose` appends a final candidate proposal for accepted active candidates, `final audit` records audit material for a final candidate proposal event, and `final compile` reads the ledger and returns the compiled outcome projection without appending an event. These commands do not create a Judge, select a winner, score candidates, or turn the compiled projection into authoritative truth.

CLI daemon and run commands are local daemon control commands. They require a running local daemon, call daemon endpoints through `@deliberum/client`, and do not use the CLI local JSON ledger for daemon profile status or run orchestration.

`deliberum daemon profiles` reads `GET /runtime/profiles` and returns only safe daemon runtime profile setup metadata: profile ids, component ids, enabled/status flags, env var names, and configured/missing booleans. It does not return environment values, provider secrets, header/body templates, URLs, model ids, MCP tool names, or provider/tool request bodies.

`deliberum daemon env-template` reads the same safe runtime profile metadata and prints a comment-only environment template for all profiles, or for one profile when `--profile <id>` is provided. With `--json`, it returns `{ "template": "..." }` for scripts. It does not read environment values, prompt for secrets, write `.env`, or store provider/tool configuration.

`deliberum daemon env-write --output <path>` reads the same safe runtime profile metadata and writes a marker-delimited Deliberum env block for all profiles, or for one profile when `--profile <id>` is provided. It writes profile enable flags and explicit non-secret `--set NAME=value` entries only; secret env vars are emitted as commented placeholders for manual local editing. `--dry-run` prints the block without writing, and `--overwrite` replaces an existing file. Without `--overwrite`, existing files are modified only when they already contain a Deliberum env block. This command does not read environment values, prompt for secrets, accept secret-like `--set` values, start providers, start MCP servers, or write outside the requested output path.

`deliberum daemon setup-wizard --output <path>` reads the same safe runtime profile metadata, prompts locally for missing required env vars, missing recommended env vars, and unconfigured secret env vars, then writes the same marker-delimited Deliberum env block. Secret prompts require an interactive TTY by default and do not echo typed values. Command output includes env var names and write status only; it does not print captured values. `--skip-optional` limits prompts to required env vars, while `--overwrite` replaces an existing file. This command does not send captured values to the daemon, ledger, Web UI, run plans, events, logs, or API responses.

`deliberum daemon profile-doctor` reads the same safe runtime profile metadata and returns local setup diagnostics: enabled profile counts, ready and needs-configuration counts, missing recommended env var names, enabled component counts, and safe next actions such as enabling a profile or supplying daemon defaults/run config. It accepts `--profile <id>` to inspect one profile. `deliberum daemon setup-plan` uses the same metadata to return an ordered, script-friendly local setup plan with profile enable env vars, missing required env var names, missing recommended default env var names, dry-run env block preview commands, safe verification commands, notes, and boundaries. It also accepts `--profile <id>`. These commands do not read environment values beyond daemon-reported configured booleans, prompt for secrets, write `.env`, mutate daemon config, start providers, start MCP servers, execute adapters, or store provider/tool configuration.

`deliberum daemon auth-entry --principal <id>` generates one local/pre-production scoped daemon auth registry entry without contacting the daemon. It defaults to the `operator` role with `read,write` scopes; `--role` selects `admin`, `operator`, `observer`, or `auditor`, and repeated or comma-separated `--scope` options can explicitly set `read`, `write`, and `audit` scopes. By default it generates a random bearer token; `--token <token>` is accepted for controlled migration or tests and is validated without echoing invalid values. The command returns the registry entry plus daemon/CLI/Web env assignment hints for `DELIBERUM_DAEMON_AUTH_TOKENS_JSON`, `DELIBERUM_DAEMON_AUTH_TOKEN`, and `VITE_DELIBERUM_DAEMON_AUTH_TOKEN`. Because this command intentionally prints bearer material for operator setup, do not commit the output, paste it into run plans, or copy it into logs, issues, screenshots, or public documentation.

`deliberum daemon deployment-posture` reads `GET /runtime/deployment-posture` and returns safe daemon deployment posture metadata: bind host/port exposure class, control-plane auth mode, token mode, principal count, CORS origin count, persistence mode classes, SQLite process-lock status, resource access continuity class, Web static asset mode, production-readiness blockers, and safety notes. It does not return daemon auth tokens, CORS origin values, configured resource access URLs, configured SQLite paths, provider/tool endpoint values, provider/tool secrets, request bodies, payloads, or configured file paths. This command is a read-only diagnostic for local/pre-production hardening; it does not implement production authorization, production identity, production resource hosting, or multi-writer coordination.

`deliberum daemon ledger-integrity` reads `GET /runtime/ledger-integrity` and returns a safe daemon event ledger integrity snapshot: store mode, validation mode, session/event counts, hashed/legacy event counts, per-session sequence ranges, and safety notes. It does not return event ids, event payloads, configured store paths, provider secrets, request bodies, resource access ids, URLs, hosted content, or payloads. This command validates the daemon event store's current snapshot only; it does not replace backups, external notarization, distributed consensus, or production multi-writer coordination.

`deliberum daemon operation-audit` reads `GET /runtime/operation-audit` and returns safe daemon control-plane operation metadata. The optional `--limit <n>` argument limits the returned entries. The optional `--format jsonl` mode exports one safe audit record per line for local archival workflows; the default `json` mode keeps the normal structured response. This command does not read the CLI local JSON ledger and does not expose request bodies, headers, bearer tokens, raw WebGET tokens, raw resource access ids, provider secrets, or output payloads.

`deliberum daemon resource-access status` reads `GET /runtime/resource-access` and returns safe resource access posture metadata: whether the base URL, URL signing, and TTL are explicitly configured, the exposure class, the route pattern, the effective TTL limit, grant-store continuity class, hosted-content delivery preconditions, restart-continuity classes, production hosting blockers, and safety notes. It does not return the actual configured base URL, resource access ids, bearer tokens, signing secrets, URL signatures, source URLs, redirect targets, hosted content, or resource payloads.

`deliberum daemon resource-access revoke <access-id>` calls `POST /resource-access/:accessId/revoke` on the local daemon and returns the safe revocation view. It is a local daemon control command and does not read the CLI local JSON ledger.

`deliberum runs events <runId>` reads the daemon-redacted run event timeline from the local daemon. With `--follow`, it opens the daemon-redacted run event stream and writes each new named SSE `event` frame as a compact JSON line. Follow mode does not replay history; use the non-follow command first when the historical timeline is required. `deliberum runs outcome <runId> --proposal-event <event-id>` asks the daemon run outcome endpoint to compile the projection for a specific final candidate proposal event; omitting the option keeps the latest/default run outcome projection. `deliberum runs resources <runId>` resolves the run's session id from the daemon and reads the daemon resources/evidence projection, including safe resource delivery and access audit history. `deliberum runs process-proposals <runId>` reads the daemon's read-only adaptive primitive suggestions for the current run, plus daemon process proposal execution policy and readiness for recorded lifecycle states in the run session. `deliberum runs process-propose`, `deliberum runs process-challenge`, and `deliberum runs process-decide` resolve the run's session id and call the daemon session process proposal lifecycle endpoints; they record lifecycle material only and do not execute primitives. `deliberum runs execute-process-proposal <runId> --proposal-event <event-id>` explicitly asks the daemon to execute an accepted process proposal through the existing run start path when the primitive is supported. `deliberum runs final-propose` and `deliberum runs final-audit` resolve the run's session id and call the daemon session final lifecycle endpoints; they do not use the CLI local JSON ledger. The CLI does not compute projections, resource audit history, process proposals, or final lifecycle semantics from either event view.

## Daemon

The current daemon is a local Hono API. It binds to `127.0.0.1` by default, does not enable wildcard CORS by default, and uses process-local in-memory stores by default.

The daemon entrypoint reads `DELIBERUM_HOST` and `DELIBERUM_PORT` when they are exported in the process environment. Defaults remain `127.0.0.1:3877`; container packaging sets `DELIBERUM_HOST=0.0.0.0` inside the container only so Docker port publishing can reach the process.

For local/pre-production durable daemon storage, set:

```bash
DELIBERUM_DAEMON_SQLITE_PATH=.deliberum/deliberum.sqlite
```

This creates SQLite-backed event ledger, run metadata, resource broker, resource access grant, and operation audit log stores in one local database. The SQLite stores configure WAL mode, a busy timeout, and local connection-level writer serialization. `DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK=true` can add a cooperative single-daemon process lock for the same SQLite path, with optional `DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK_TTL_MS` and `DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK_HEARTBEAT_MS` controls for stale-lock recovery. They persist session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant enforcement state, and safe control-plane operation audit metadata; they do not persist bearer access ids, WebGET sessions, authentication state, provider secrets, request bodies, request headers, raw WebGET tokens, raw resource access ids, or production multi-user coordination. The process lock prevents a second cooperating daemon from starting on the same SQLite file while the first lock is active, but it is not distributed production multi-writer coordination.

For development environments that should avoid SQLite, `DELIBERUM_DAEMON_EVENT_STORE_PATH=<path>` opts into the shared JSON EventStore for event ledger persistence, `DELIBERUM_DAEMON_RUN_STORE_PATH=<path>` opts into JSON run metadata persistence, and `DELIBERUM_DAEMON_OPERATION_AUDIT_PATH=<path>` opts into JSON operation audit log persistence. Use the event/run JSON paths together when run workspace state must survive daemon restarts without SQLite. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES=<n>` applies a local retention cap to in-memory, JSON, and SQLite operation audit logs.

`DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_PATH=<path>` opts into a local/pre-production JSONL mirror for safe operation audit records. The mirror writes one normalized operation audit record per line after the primary audit log records the request. `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_BYTES=<n>` enables size-based local rotation, and `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_MAX_FILES=<n>` limits retained rotated files. `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_URL=<url>` opts into HTTP export of the same safe operation audit record material to a collector. Export URLs should use HTTPS; localhost HTTP is allowed for local collectors, and non-local HTTP requires `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_ALLOW_INSECURE_HTTP=true`. `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_TOKEN=<token>` is used only as an outbound runtime bearer secret, and `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_TIMEOUT_MS=<n>` bounds export attempts. JSONL mirroring and HTTP export can be enabled together.

`DELIBERUM_DAEMON_WEB_ASSETS_PATH=<web-dist-path>` opts into daemon-served built Web assets for local/pre-production shells. The daemon serves `/assets/*` from that directory with immutable cache headers and serves the Web shell index for browser navigation requests that accept `text/html`, including refreshed SPA paths such as `/runs` and `/sessions/:sessionId`. JSON API callers that do not request `text/html` keep using the existing daemon API routes on the same paths. The shell index is no-store, static file paths are constrained to the configured asset root, and this mode does not add public hosting, production authorization, multi-user sessions, or Web-based secret-capturing provider setup.

The root `Dockerfile` packages a local/pre-production daemon image with built Web assets and SQLite state under `/data/deliberum.sqlite`. The root `compose.yaml` builds that image, maps the daemon to host `127.0.0.1:3877`, and stores `/data` in a named volume. Keep the host-side localhost binding unless a separate fronting auth layer and network policy are in place; provider keys and daemon auth tokens must be injected at runtime, not baked into the image.

`DELIBERUM_DAEMON_AUTH_TOKEN=<token>` opts into the legacy local/pre-production single-token daemon control-plane mode. When set in the daemon process, daemon control endpoints require a bearer credential and return a no-store `401` safe error when the token is absent or invalid. The legacy token is recorded in posture as `tokenMode: "single"` with one admin principal. `/health`, WebGET bearer-token endpoints, and `GET /resource-access/:accessId` keep their own health/token semantics so external participants can still use scoped WebGET sessions and short-lived resource grants.

`DELIBERUM_DAEMON_AUTH_TOKENS_JSON=<json>` opts into a scoped daemon control-plane token registry. The value must be a JSON array of objects with a non-secret `principalId`, a runtime-only `token`, and optional `role` or `scopes`. Supported roles are `admin`, `operator`, `observer`, and `auditor`. Default role scopes are `admin` = `read,write,audit`, `operator` = `read,write`, `auditor` = `read,audit`, and `observer` = `read`. Supported scopes are `read`, `write`, and `audit`; `GET` and `HEAD` routes require `read`, `GET /runtime/operation-audit` requires `audit`, and mutation routes require `write`. Principal ids and token values must be unique, and tokens are matched by hash in memory without being written to events, audit records, posture responses, CLI output, or Web output. Use `deliberum daemon auth-entry --principal <id>` to generate a single entry and process-specific env hints.

CLI commands continue to read one local client credential from `DELIBERUM_DAEMON_AUTH_TOKEN`. When the daemon process uses `DELIBERUM_DAEMON_AUTH_TOKENS_JSON`, set `DELIBERUM_DAEMON_AUTH_TOKEN` only in the CLI process to one registry token value, or pass separate environment blocks to the daemon and CLI. The local Web shell can forward `VITE_DELIBERUM_DAEMON_AUTH_TOKEN`, including for browser SSE follow URLs; this is for trusted local/pre-production shells only because browser-visible values are not production user authentication.

By default, browser CORS is limited to the local Web development origins `http://127.0.0.1:5173` and `http://localhost:5173`, and permits `Content-Type` plus `Authorization` request headers for authenticated local daemon access. The Web development script runs Vite on port `5173` with `strictPort` so a busy default port fails clearly instead of silently moving to a browser origin that the daemon rejects. If the Web dev server must run on another local port, start Vite with an explicit port and set `DELIBERUM_DAEMON_CORS_ORIGINS` to a matching comma-separated local-origin allow-list, for example `http://127.0.0.1:5180,http://localhost:5180`. The daemon rejects non-local origins for this configuration and never uses wildcard CORS.

The daemon run store remains operational metadata only. Whether in-memory, JSON-backed, or SQLite-backed, run endpoints expose safe operational views over orchestrator state; they do not expose provider secrets, own Candidate Frontier semantics, select a single answer, or turn compiled outcomes into authoritative truth.

The daemon operation audit log is control-plane metadata only. It records safe action, method, normalized route, status code, outcome, auth mode/presence, safe principal id, role, scopes, and non-secret target ids. It does not write semantic ledger events, store request bodies, store headers, store bearer tokens, store raw WebGET/resource-access token path segments, store provider/tool secrets, or store run outputs. `/health` and CORS preflight requests are not logged. `GET /runtime/operation-audit` is a no-store local control endpoint and supports `?limit=<n>`. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES` limits retained records before query limits are applied. When configured, the JSONL mirror and HTTP export receive the same safe record material and never write or send configured file paths, request bodies, headers, bearer tokens, provider secrets, or output payloads.

Implemented endpoints:

```text
GET  /health
GET  /runtime/profiles
GET  /runtime/deployment-posture
GET  /runtime/resource-access
GET  /runtime/operation-audit
GET  /runs
GET  /runs/:runId
GET  /runs/:runId/events
GET  /runs/:runId/events/stream
GET  /runs/:runId/outcome
GET  /runs/:runId/process-proposals
POST /runs
POST /runs/:runId/start
POST /runs/:runId/process-proposals/:proposalEventId/execute
GET  /sessions
GET  /sessions/:sessionId/events
GET  /sessions/:sessionId/events/stream
GET  /sessions/:sessionId/final
POST /sessions/:sessionId/final-candidates
POST /sessions/:sessionId/final-candidates/:proposalEventId/audits
GET  /sessions/:sessionId/frontier
GET  /sessions/:sessionId/objections
GET  /sessions/:sessionId/obligations
GET  /sessions/:sessionId/process-proposals
GET  /sessions/:sessionId/resources
POST /sessions/:sessionId/resources/:resourceId/deliveries
GET  /resource-access/:accessId
POST /resource-access/:accessId/revoke
POST /sessions
POST /sessions/:sessionId/batches
POST /sessions/:sessionId/batches/:batchId/contributions
POST /sessions/:sessionId/batches/:batchId/close
POST /sessions/:sessionId/extractions
POST /sessions/:sessionId/proposals/:proposalEventId/challenges
POST /sessions/:sessionId/proposals/:proposalEventId/acceptance
POST /sessions/:sessionId/process-proposals
POST /sessions/:sessionId/process-proposals/:proposalEventId/challenges
POST /sessions/:sessionId/process-proposals/:proposalEventId/decisions
```

Run orchestration is synchronous and local in the current daemon. By default, component registries must be injected by the embedding process or tests; the daemon does not install deterministic local preset components, fake adapters, or provider-backed adapters automatically.

`GET /runs/:runId/outcome` compiles a daemon run outcome projection through the run's session ledger. Its optional `finalCandidateProposalEventId` query parameter selects a specific recorded final candidate proposal event; omitting it keeps the run service's latest/default proposal resolution. The endpoint does not append events or make the compiled projection authoritative.

`GET /runs/:runId/process-proposals` is a no-store, read-only adaptive primitive suggestion endpoint. It returns challengeable `ProcessProposal` material from the current run state and ledger events, plus daemon process proposal execution policy and readiness for recorded lifecycle states in the run session. Readiness can report accepted proposals as ready, unsupported, or blocked by target validation, and can include the safe start request preview used by the explicit execution endpoint. The endpoint does not start stages, append events, accept proposals, choose winners, or compile outcomes.

Session process proposal endpoints are explicit lifecycle endpoints. `POST /sessions/:sessionId/process-proposals` records proposed process material, and the challenge/decision endpoints record later process state. They are no hidden scheduler: decisions do not auto-execute primitives or mutate semantic projections. `GET /sessions/:sessionId/process-proposals` is no-store and returns the projected lifecycle state with projection metadata.

Session final lifecycle endpoints are explicit ledger mutation endpoints. `POST /sessions/:sessionId/final-candidates` records final candidate proposal material for accepted active candidates, and `POST /sessions/:sessionId/final-candidates/:proposalEventId/audits` records final audit material for that proposal event. They return the appended or idempotently replayed ledger event with an `appended` flag; they do not compile outcomes, choose winners, score candidates, or make the compiled projection authoritative. `GET /sessions/:sessionId/final` remains the read path for daemon-backed outcome compilation. Its optional `finalCandidateProposalEventId` query parameter compiles the projection for a specific recorded final candidate proposal event; omitting it keeps the default latest proposal projection.

`POST /runs/:runId/process-proposals/:proposalEventId/execute` is a separate explicit run control endpoint. It validates that the process proposal belongs to the run session and that its latest projected status is `accepted`, then maps supported primitives to the existing daemon `startRun` path. It uses the same mapping and target validation surfaced by the read-only readiness projection, but readiness itself never executes a primitive.

Current supported mappings are `sealed_divergence`, `relation_mapping`, `red_team`, `candidate_repair`, `evidence_check`, `final_contest`, `final_audit`, and `omission_audit`. `candidate_repair` must target accepted active candidate ids; execution records repair extraction proposal material only, so later proposal review and acceptance are still required before the Candidate Frontier changes. `evidence_check` must target accepted evidence need ids; execution records reported evidence result material only, so it does not verify claims or satisfy evidence needs by itself. `final_audit` and `omission_audit` must target exactly one existing final candidate proposal event; execution records audit material through the finalization runner without regenerating final candidate material or compiling an outcome.

Unsupported primitives return a safe unsupported-primitive error rather than pretending that a dedicated runner exists.

For local development and testing only, the daemon can be started with:

```bash
DELIBERUM_ENABLE_LOCAL_PRESET=true node apps/daemon/dist/index.js
```

That opt-in profile registers deterministic local preset participant adapters and generators so the Web run workspace can exercise the full run pipeline without real provider calls. This profile is not production behavior, does not add secret-capturing setup, does not persist daemon state, and does not make preset output authoritative.

Stage 22A also adds an opt-in OpenAI-compatible daemon profile for local/pre-production sealed divergence participant execution:

```bash
DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE=true node apps/daemon/dist/index.js
```

When this profile is enabled, the daemon registers the OpenAI-compatible participant adapter. Run plans may reference provider configuration such as `baseUrl`, `modelId`, `endpointPath`, `timeoutMs`, and `apiKeyEnvVar`; the actual key must remain in the daemon environment, for example `DELIBERUM_OPENAI_API_KEY`. Provider secrets are not accepted through Web forms, CLI flags, daemon request bodies, run-plan inline values, events, run records, or API responses. This profile alone does not install extraction generators, proposal reviewers, final candidate generators, or final auditors.

The daemon also has a separate opt-in HTTP-template participant profile for local/pre-production sealed divergence participant execution against non-OpenAI HTTP providers:

```bash
DELIBERUM_ENABLE_HTTP_TEMPLATE_PROFILE=true \
DELIBERUM_HTTP_TEMPLATE_HEADERS_JSON='{"Authorization":"Bearer {{runtime.apiKey}}"}' \
DELIBERUM_HTTP_TEMPLATE_BODY='{"model":"{{runtime.modelId}}","payload":{{input.payloadJson}}}' \
DELIBERUM_HTTP_TEMPLATE_RESPONSE_FORMAT=json \
DELIBERUM_HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH=output \
node apps/daemon/dist/index.js
```

When this profile is enabled, the daemon registers only the `http-template` participant adapter. Run plans still provide non-secret provider routing such as `baseUrl`, `endpointPath`, `modelId`, `timeoutMs`, and `apiKeyEnvVar`; the real key stays in the daemon environment, for example `DELIBERUM_HTTP_TEMPLATE_API_KEY`. Header and body templates are daemon-side profile configuration and may reference runtime placeholders such as `{{runtime.apiKey}}`, `{{runtime.modelId}}`, `{{runtime.baseUrl}}`, `{{runtime.endpointPath}}`, `{{context.participantId}}`, `{{input.payloadJson}}`, and `{{var.name}}`. Run-plan provider configs may include `httpTemplate.variables` for non-secret JSON values used by `{{var.*}}` placeholders. These values are visible safe run configuration and must not contain API keys, bearer tokens, private local paths, or other inline credentials; unsafe values are rejected by run-plan validation. Optional profile settings include `DELIBERUM_HTTP_TEMPLATE_URL`, `DELIBERUM_HTTP_TEMPLATE_BASE_URL`, `DELIBERUM_HTTP_TEMPLATE_ENDPOINT_PATH`, `DELIBERUM_HTTP_TEMPLATE_METHOD`, `DELIBERUM_HTTP_TEMPLATE_TIMEOUT_MS`, `DELIBERUM_HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH`, and `DELIBERUM_HTTP_TEMPLATE_RESPONSE_FORMAT=text|json`. This profile does not install extraction generators, proposal reviewers, final candidate generators, final auditors, or secret-capturing setup.

The daemon also has a separate opt-in MCP tool participant profile for local/pre-production sealed divergence participant execution through one configured MCP-compatible JSON-RPC tool endpoint:

```bash
DELIBERUM_ENABLE_MCP_TOOL_PROFILE=true \
DELIBERUM_MCP_TOOL_URL=http://127.0.0.1:8787/mcp \
DELIBERUM_MCP_TOOL_NAME=deliberum.reflect \
node apps/daemon/dist/index.js
```

When this profile is enabled and the required URL plus tool name are configured, the daemon registers only the `mcp-tool` participant adapter. It calls `tools/list` by default to verify that the configured tool exists, then calls `tools/call` with JSON arguments derived from the Deliberum participant context. `DELIBERUM_MCP_TOOL_AUTH_TOKEN` is an optional bearer secret for the configured endpoint and is kept in daemon runtime memory only. `DELIBERUM_MCP_TOOL_TIMEOUT_MS` controls the adapter call timeout. Non-local endpoints are rejected by default; `DELIBERUM_MCP_TOOL_ALLOW_REMOTE=true` permits only HTTPS remote endpoints. `DELIBERUM_MCP_TOOL_VERIFY_LIST=false` can skip the `tools/list` check for compatible bridges that do not expose listing. `DELIBERUM_MCP_TOOL_MAX_ARGUMENT_BYTES` bounds the serialized `tools/call` argument object before any request is sent. `DELIBERUM_MCP_TOOL_ALLOWED_ARGUMENT_KEYS` is an optional comma-separated allow-list for top-level argument keys after default argument construction. `DELIBERUM_MCP_TOOL_INCLUDE_CONTEXT=false` omits the default Deliberum participant context from generated tool arguments. `GET /runtime/profiles` reports only configured/missing booleans and returns `needs_configuration` when the profile is enabled without the required URL or tool name. This profile does not start or manage MCP servers, expose arbitrary tools, install extraction generators, proposal reviewers, final candidate generators, final auditors, provide a production tool sandbox, or make tool output authoritative.

Stage 22B adds a separate opt-in OpenAI-compatible extraction generator for local/pre-production proposal extraction:

```bash
DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE=true \
DELIBERUM_ENABLE_OPENAI_COMPATIBLE_EXTRACTION=true \
node apps/daemon/dist/index.js
```

With both flags enabled, the daemon registers `openai-compatible-extractor`. It reads only the revealed extraction context, calls the configured OpenAI-compatible provider, parses strict JSON extraction proposal material, and then still uses the existing orchestrator/core proposal lifecycle. Provider extraction output is proposal material only; Candidate Frontier changes only through later accepted proposal projection. The optional non-secret `DELIBERUM_OPENAI_EXTRACTION_PROVIDER_CONFIG_ID` can select the run-plan provider config id for the extractor and defaults to `openai-main`. The optional non-secret `DELIBERUM_OPENAI_EXTRACTION_RESPONSE_FORMAT=json_object` requests JSON-object provider output for the extraction generator only; it is not applied to participant sealed-divergence calls.

Stage 22C adds separate opt-in OpenAI-compatible proposal review and finalization components:

```bash
DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE=true \
DELIBERUM_ENABLE_OPENAI_COMPATIBLE_REVIEW=true \
DELIBERUM_ENABLE_OPENAI_COMPATIBLE_FINALIZATION=true \
node apps/daemon/dist/index.js
```

With review enabled, the daemon registers `openai-compatible-reviewer`. With finalization enabled, it registers `openai-compatible-final-candidate` and `openai-compatible-final-auditor`. These components still produce proposal, review, and audit material only; they do not become a Judge, select a winner, rank candidates, or turn compiled outcomes into authority. Non-secret provider config id overrides are available as `DELIBERUM_OPENAI_REVIEW_PROVIDER_CONFIG_ID`, `DELIBERUM_OPENAI_FINAL_CANDIDATE_PROVIDER_CONFIG_ID`, and `DELIBERUM_OPENAI_FINAL_AUDIT_PROVIDER_CONFIG_ID`. JSON-object response format can be requested independently with `DELIBERUM_OPENAI_REVIEW_RESPONSE_FORMAT=json_object`, `DELIBERUM_OPENAI_FINAL_CANDIDATE_RESPONSE_FORMAT=json_object`, and `DELIBERUM_OPENAI_FINAL_AUDIT_RESPONSE_FORMAT=json_object`.

For local provider smoke only, the profile also supports optional non-secret request compatibility settings. If these are omitted, the OpenAI-compatible adapter still sends only `model` and `messages`. For a generic OpenAI-compatible provider, a conservative example is:

```bash
DELIBERUM_OPENAI_BASE_URL=https://provider.example/api
DELIBERUM_OPENAI_ENDPOINT_PATH=/v1/chat/completions
DELIBERUM_OPENAI_MODEL=provider-model
DELIBERUM_OPENAI_TOKEN_PARAMETER=max_completion_tokens
DELIBERUM_OPENAI_MAX_COMPLETION_TOKENS=1024
DELIBERUM_OPENAI_TEMPERATURE=0
DELIBERUM_OPENAI_THINKING=disabled
```

The extraction prompt requests exactly one JSON object with no surrounding prose or Markdown, and the parser remains strict: it accepts only a raw JSON object or a single full fenced JSON object. If a provider response fails only this strict JSON shape check, the extractor may make one corrective retry without including the rejected response text. Additional non-secret request options are available for local compatibility testing: `DELIBERUM_OPENAI_TOP_P`, `DELIBERUM_OPENAI_STREAM=true|false`, `DELIBERUM_OPENAI_FREQUENCY_PENALTY`, and `DELIBERUM_OPENAI_PRESENCE_PENALTY`. When streaming is enabled, the OpenAI-compatible client assembles Chat Completions SSE text deltas into a complete response before the existing participant, extraction, review, or finalization parser handles the result.

CLI run commands do not include API key flags or fields. `deliberum daemon profiles` provides safe read-only profile setup status, `deliberum daemon env-template` can print comment-only setup templates from that metadata, `deliberum daemon env-write` can write marker-delimited env blocks with enable flags and explicit non-secret values, `deliberum daemon setup-wizard` can locally prompt for missing setup values and hidden secret values, `deliberum daemon profile-doctor` can summarize safe local configuration gaps and next actions, and `deliberum daemon setup-plan` can produce an ordered local setup plan with dry-run env-write commands without printing or storing secret values. `deliberum daemon deployment-posture` can summarize safe local/pre-production deployment posture and production-readiness blockers without exposing tokens, origins, configured resource URLs, provider secrets, request bodies, or payloads. The CLI and Web UI use the same client-side setup-plan projection helper, so Web runtime profile summaries show required env var names, recommended env var names, secret env var names, and setup step counts derived from daemon metadata without exposing values. Production identity, production authorization, and public multi-user deployment remain deferred. CLI run commands can read `DELIBERUM_DAEMON_AUTH_TOKEN` as their local client credential for daemon control-plane auth, read the daemon-redacted run event timeline, and follow the daemon-redacted run event stream. The Web run detail page reads the same non-stream timeline and can manually follow the same stream.

Experimental WebGET endpoints are local daemon endpoints:

```text
GET /webget/:token/start
GET /webget/:token/status
GET /webget/:token/context
GET /webget/:token/context/:page
GET /webget/:token/resources/:resourceId
GET /webget/:token/submit
GET /webget/:token/commit
```

`POST /sessions/:sessionId/resources/:resourceId/deliveries` is daemon-local and session-scoped. It returns safe resource metadata and a Delivery Planner result for a participant id and explicit policy, then appends a `resource_delivery_planned` ledger event with safe audit metadata. The audit event records the selected mode, allowed/denied status, reason, warnings, policy summary, and material kind without storing delivered URLs, bearer access ids, base64 bytes, data refs, or resource text.

Allowed URL deliveries are wrapped in short-lived daemon resource access grants. The response delivery URL points at `GET /resource-access/:accessId`; that endpoint uses a hashed grant lookup and redirects to the selected safe URL variant. When `DELIBERUM_RESOURCE_ACCESS_SIGNING_SECRET` is configured, generated access URLs include expiry and HMAC signature query parameters, and `GET /resource-access/:accessId` requires a valid unexpired signature before grant lookup. With `DELIBERUM_DAEMON_SQLITE_PATH`, grant enforcement and explicit revocation survive daemon restarts; without SQLite they remain process-local. The daemon can also serve explicitly registered in-memory base64 content through the same access route when `allowHostedContentUrl=true`, `maxHostedContentSizeBytes` is set, and the matching URL exposure policy allows the configured access base URL. `POST /resource-access/:accessId/revoke` revokes either grant type and appends a safe revocation audit event. Grant creation also appends a safe lifecycle audit event. The default access base URL is the daemon's local host/port. `DELIBERUM_RESOURCE_ACCESS_BASE_URL` can be set when a local reverse proxy, LAN endpoint, or explicit public access endpoint is intentionally used; env-configured non-local base URLs require `DELIBERUM_RESOURCE_ACCESS_ALLOW_REMOTE=true`, and public base URLs must use HTTPS. `DELIBERUM_RESOURCE_ACCESS_TTL_MS` controls the grant TTL. Bearer access ids, signing secrets, URL signatures, source URLs, data refs, and base64 bytes are response-only/access-layer material and are not written to ledger events, resource projections, WebGET resource access reports, or run metadata. Lifecycle audit events use a non-bearer `resourceAccessId` plus token hash and safe grant metadata. The endpoint still does not bypass sensitive-resource defaults or make evidence needs satisfied.

`GET /sessions/:sessionId/resources` also returns the session's safe resource delivery audit history as `deliveryAudits` and safe resource access lifecycle history as `accessAudits`. Delivery audit entries are derived from public `resource_delivery_planned` ledger events and include event metadata, resource summary, participant id, policy summary, and delivery decision summary without exposing delivery material. Access audit entries are derived from public `resource_access_grant_created` and `resource_access_grant_revoked` ledger events and include event metadata, action, non-bearer `resourceAccessId`, resource id, participant id, token hash, TTL metadata, and safe hosted-content metadata when applicable.

Deferred daemon work includes production multi-writer coordination for durable stores, broader primitive runner coverage and automated policy beyond read-only accepted process proposal readiness, production public resource hosting and signed URL service implementation, production authorization, and multi-user deployment.

## Web UI

The current Web UI is a React/Vite shell that reads from `@deliberum/client` and the local daemon. It can run as a separate local Vite app or as optional daemon-served built static assets. It has safe daemon runtime profile setup status and a daemon-backed session catalog on the landing page, pages for session overview, Candidate Frontier, objections, quality obligations, events, a daemon-backed compiled outcome projection, a session resources/evidence projection, and local daemon run workspace views.

The Web run workspace is a local daemon control/view surface. Run workspace actions require the local daemon to be running; the Web UI does not provide public hosting, production identity, multi-user deployment, or Web-based secret-capturing provider setup yet. It can forward an optional local daemon auth token, list safe runtime profile status from `GET /runtime/profiles`, show setup-plan summaries derived from that safe metadata, show safe deployment posture summaries from `GET /runtime/deployment-posture`, show safe resource access posture summaries from `GET /runtime/resource-access`, show recent safe operation audit metadata from `GET /runtime/operation-audit`, list daemon sessions from `GET /sessions`, list runs, create a run from JSON or a deterministic local preset template, inspect daemon run state, start requested run stages from JSON or the local preset start request, read safe projection endpoints by run session id, display daemon-redacted run ledger events, manually follow the daemon-redacted run event stream, display adaptive process proposal suggestions and daemon execution readiness, record a suggestion as explicit process proposal material, append challenge/decision lifecycle events for recorded process proposals, explicitly execute ready accepted process proposals for supported daemon stages, and display compiled output only as a provisional outcome. The deployment posture summary renders exposure classes, auth mode, token mode, principal count, persistence counts, SQLite process-lock status, resource access continuity and URL signing status, Web static asset mode, and production-readiness blockers without showing daemon auth tokens, CORS origin values, configured resource access URLs, configured file paths, provider/tool endpoint values, provider/tool secrets, request bodies, or payloads. The resource access posture summary renders base URL exposure class, URL signing status, grant continuity, hosted-content preconditions, delivery material class, and production hosting blockers without showing actual configured base URLs, access ids, signing secrets, URL signatures, source URLs, redirect targets, hosted content, or payloads. The operation audit summary renders normalized action, method, route, status, outcome, authorization mode/presence, safe principal id, role, scopes, and non-secret target ids without showing request bodies, headers, bearer tokens, raw WebGET/resource-access tokens, provider secrets, or output payloads. The run outcome page and session Final page can compile the latest projection or a projection for a specific final candidate proposal event id; the session Final page also renders provenance and unresolved material, pre-fills final lifecycle JSON from daemon frontier/provenance data, and can explicitly submit final candidate proposal and final audit JSON through the daemon lifecycle endpoints. The run detail page reads `GET /runs/:runId/events` for the current safe ledger timeline, `GET /runs/:runId/process-proposals` for next-primitive suggestion material and execution readiness, `GET /sessions/:sessionId/process-proposals` for lifecycle state, and opens `GET /runs/:runId/events/stream` only when the user starts live follow; it still does not compute projections or process proposals from streamed events.

The Web local preset controls require the daemon to be started with `DELIBERUM_ENABLE_LOCAL_PRESET=true`. Without that opt-in daemon profile, created runs remain valid but starting a preset pipeline reports missing local components.

The Web UI does not own semantic deliberation state, implement Candidate Frontier logic, run adapters, serve resources, or compile outcomes. The landing session catalog is a read-only daemon summary derived from ledger events; it exposes session identifiers, topic contract summary text, event counts, and timestamps only. Process proposal decisions and final lifecycle submissions recorded from Web are ledger lifecycle facts only; they do not start stages, execute primitives, choose winners, or turn projections into authority. The session Final and Resources pages read daemon projection endpoints; the Resources page shows run-plan resource references, safe broker metadata when registered, safe resource delivery and access audit entries, and accepted evidence needs without hosting files or planning delivery in the browser.
