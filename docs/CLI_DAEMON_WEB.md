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
deliberum batch open --session <id> --purpose <purpose>
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
deliberum daemon profiles [--daemon-url <local-url>]
deliberum daemon operation-audit [--limit <n>] [--format <json|jsonl>] [--daemon-url <local-url>]
deliberum daemon resource-access revoke <access-id> [--daemon-url <local-url>]
deliberum runs create --input <run-plan.json> [--daemon-url <local-url>]
deliberum runs list [--daemon-url <local-url>]
deliberum runs show <runId> [--daemon-url <local-url>]
deliberum runs events <runId> [--follow] [--daemon-url <local-url>]
deliberum runs start <runId> --input <start.json> [--daemon-url <local-url>]
deliberum runs outcome <runId> [--proposal-event <event-id>] [--daemon-url <local-url>]
deliberum runs resources <runId> [--daemon-url <local-url>]
deliberum runs process-proposals <runId> [--daemon-url <local-url>]
deliberum runs execute-process-proposal <runId> --proposal-event <event-id> [--daemon-url <local-url>]
deliberum runs final-propose <runId> --author <id> --input <json-file> [--idempotency-key <key>] [--daemon-url <local-url>]
deliberum runs final-audit <runId> --proposal-event <event-id> --author <id> --input <json-file> [--idempotency-key <key>] [--daemon-url <local-url>]
```

CLI view commands return structured JSON. `frontier`, `objections`, and `obligations` are projection-derived and include projection metadata.

CLI process commands use the local JSON EventStore. They append or project process proposal lifecycle events only. Accepting a process proposal records a process decision; it does not start daemon stages, open batches, run adapters, choose winners, or compile outcomes.

CLI final commands also use the local JSON EventStore. `final propose` appends a final candidate proposal for accepted active candidates, `final audit` records audit material for a final candidate proposal event, and `final compile` reads the ledger and returns the compiled outcome projection without appending an event. These commands do not create a Judge, select a winner, score candidates, or turn the compiled projection into authoritative truth.

CLI daemon and run commands are local daemon control commands. They require a running local daemon, call daemon endpoints through `@deliberum/client`, and do not use the CLI local JSON ledger for daemon profile status or run orchestration.

`deliberum daemon profiles` reads `GET /runtime/profiles` and returns only safe daemon runtime profile setup metadata: profile ids, component ids, enabled/status flags, env var names, and configured/missing booleans. It does not return environment values, provider secrets, header/body templates, URLs, model ids, MCP tool names, or provider/tool request bodies.

`deliberum daemon operation-audit` reads `GET /runtime/operation-audit` and returns safe daemon control-plane operation metadata. The optional `--limit <n>` argument limits the returned entries. The optional `--format jsonl` mode exports one safe audit record per line for local archival workflows; the default `json` mode keeps the normal structured response. This command does not read the CLI local JSON ledger and does not expose request bodies, headers, bearer tokens, raw WebGET tokens, raw resource access ids, provider secrets, or output payloads.

`deliberum daemon resource-access revoke <access-id>` calls `POST /resource-access/:accessId/revoke` on the local daemon and returns the safe revocation view. It is a local daemon control command and does not read the CLI local JSON ledger.

`deliberum runs events <runId>` reads the daemon-redacted run event timeline from the local daemon. With `--follow`, it opens the daemon-redacted run event stream and writes each new named SSE `event` frame as a compact JSON line. Follow mode does not replay history; use the non-follow command first when the historical timeline is required. `deliberum runs outcome <runId> --proposal-event <event-id>` asks the daemon run outcome endpoint to compile the projection for a specific final candidate proposal event; omitting the option keeps the latest/default run outcome projection. `deliberum runs resources <runId>` resolves the run's session id from the daemon and reads the daemon resources/evidence projection, including safe resource delivery and access audit history. `deliberum runs process-proposals <runId>` reads the daemon's read-only adaptive primitive suggestions for the current run. `deliberum runs execute-process-proposal <runId> --proposal-event <event-id>` explicitly asks the daemon to execute an accepted process proposal through the existing run start path when the primitive is supported. `deliberum runs final-propose` and `deliberum runs final-audit` resolve the run's session id and call the daemon session final lifecycle endpoints; they do not use the CLI local JSON ledger. The CLI does not compute projections, resource audit history, process proposals, or final lifecycle semantics from either event view.

## Daemon

The current daemon is a local Hono API. It binds to `127.0.0.1` by default, does not enable wildcard CORS by default, and uses process-local in-memory stores by default.

For local/pre-production durable daemon storage, set:

```bash
DELIBERUM_DAEMON_SQLITE_PATH=.deliberum/deliberum.sqlite
```

This creates SQLite-backed event ledger, run metadata, resource broker, resource access grant, and operation audit log stores in one local database. The SQLite stores configure WAL mode, a busy timeout, and local connection-level writer serialization. They persist session ledger events, run metadata, explicitly registered resource broker metadata/content, resource access grant enforcement state, and safe control-plane operation audit metadata; they do not persist bearer access ids, WebGET sessions, authentication state, provider secrets, request bodies, request headers, raw WebGET tokens, raw resource access ids, or production multi-user coordination.

For development environments that should avoid SQLite, `DELIBERUM_DAEMON_EVENT_STORE_PATH=<path>` opts into the shared JSON EventStore for event ledger persistence, `DELIBERUM_DAEMON_RUN_STORE_PATH=<path>` opts into JSON run metadata persistence, and `DELIBERUM_DAEMON_OPERATION_AUDIT_PATH=<path>` opts into JSON operation audit log persistence. Use the event/run JSON paths together when run workspace state must survive daemon restarts without SQLite. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES=<n>` applies a local retention cap to in-memory, JSON, and SQLite operation audit logs.

`DELIBERUM_DAEMON_AUTH_TOKEN=<token>` opts into local/pre-production daemon control-plane bearer authentication. When set, daemon control endpoints require `Authorization: Bearer <token>` and return a no-store `401` safe error when the token is absent or invalid. `/health`, WebGET bearer-token endpoints, and `GET /resource-access/:accessId` keep their own health/token semantics so external participants can still use scoped WebGET sessions and short-lived resource grants. CLI commands read the token from `DELIBERUM_DAEMON_AUTH_TOKEN`. The local Web shell can forward `VITE_DELIBERUM_DAEMON_AUTH_TOKEN`, including for browser SSE follow URLs; this is for trusted local/pre-production shells only because browser-visible values are not production user authentication.

By default, browser CORS is limited to the local Web development origins `http://127.0.0.1:5173` and `http://localhost:5173`, and permits `Content-Type` plus `Authorization` request headers for authenticated local daemon access. The Web development script runs Vite on port `5173` with `strictPort` so a busy default port fails clearly instead of silently moving to a browser origin that the daemon rejects. If the Web dev server must run on another local port, start Vite with an explicit port and set `DELIBERUM_DAEMON_CORS_ORIGINS` to a matching comma-separated local-origin allow-list, for example `http://127.0.0.1:5180,http://localhost:5180`. The daemon rejects non-local origins for this configuration and never uses wildcard CORS.

The daemon run store remains operational metadata only. Whether in-memory, JSON-backed, or SQLite-backed, run endpoints expose safe operational views over orchestrator state; they do not expose provider secrets, own Candidate Frontier semantics, select a single answer, or turn compiled outcomes into authoritative truth.

The daemon operation audit log is control-plane metadata only. It records safe action, method, normalized route, status code, outcome, auth mode/presence, and non-secret target ids. It does not write semantic ledger events, store request bodies, store headers, store bearer tokens, store raw WebGET/resource-access token path segments, store provider/tool secrets, or store run outputs. `/health` and CORS preflight requests are not logged. `GET /runtime/operation-audit` is a no-store local control endpoint and supports `?limit=<n>`. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES` limits retained records before query limits are applied.

Implemented endpoints:

```text
GET  /health
GET  /runtime/profiles
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

`GET /runs/:runId/process-proposals` is a no-store, read-only adaptive primitive suggestion endpoint. It returns challengeable `ProcessProposal` material from the current run state and ledger events, but it does not start stages, append events, accept proposals, choose winners, or compile outcomes.

Session process proposal endpoints are explicit lifecycle endpoints. `POST /sessions/:sessionId/process-proposals` records proposed process material, and the challenge/decision endpoints record later process state. They are no hidden scheduler: decisions do not auto-execute primitives or mutate semantic projections. `GET /sessions/:sessionId/process-proposals` is no-store and returns the projected lifecycle state with projection metadata.

Session final lifecycle endpoints are explicit ledger mutation endpoints. `POST /sessions/:sessionId/final-candidates` records final candidate proposal material for accepted active candidates, and `POST /sessions/:sessionId/final-candidates/:proposalEventId/audits` records final audit material for that proposal event. They return the appended or idempotently replayed ledger event with an `appended` flag; they do not compile outcomes, choose winners, score candidates, or make the compiled projection authoritative. `GET /sessions/:sessionId/final` remains the read path for daemon-backed outcome compilation. Its optional `finalCandidateProposalEventId` query parameter compiles the projection for a specific recorded final candidate proposal event; omitting it keeps the default latest proposal projection.

`POST /runs/:runId/process-proposals/:proposalEventId/execute` is a separate explicit run control endpoint. It validates that the process proposal belongs to the run session and that its latest projected status is `accepted`, then maps supported primitives to the existing daemon `startRun` path.

Current supported mappings are `sealed_divergence`, `relation_mapping`, `red_team`, `candidate_repair`, `evidence_check`, `final_contest`, and `final_audit`. `candidate_repair` must target accepted active candidate ids; execution records repair extraction proposal material only, so later proposal review and acceptance are still required before the Candidate Frontier changes. `evidence_check` must target accepted evidence need ids; execution records reported evidence result material only, so it does not verify claims or satisfy evidence needs by itself. `final_audit` must target exactly one existing final candidate proposal event; execution records audit material through the finalization runner without regenerating final candidate material or compiling an outcome.

Unsupported primitives return a safe unsupported-primitive error rather than pretending that a dedicated runner exists.

For local development and testing only, the daemon can be started with:

```bash
DELIBERUM_ENABLE_LOCAL_PRESET=true node apps/daemon/dist/index.js
```

That opt-in profile registers deterministic local preset participant adapters and generators so the Web run workspace can exercise the full run pipeline without real provider calls. This profile is not production behavior, does not add interactive provider setup, does not persist daemon state, and does not make preset output authoritative.

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

When this profile is enabled, the daemon registers only the `http-template` participant adapter. Run plans still provide non-secret provider routing such as `baseUrl`, `endpointPath`, `modelId`, `timeoutMs`, and `apiKeyEnvVar`; the real key stays in the daemon environment, for example `DELIBERUM_HTTP_TEMPLATE_API_KEY`. Header and body templates are daemon-side profile configuration and may reference runtime placeholders such as `{{runtime.apiKey}}`, `{{runtime.modelId}}`, `{{runtime.baseUrl}}`, `{{runtime.endpointPath}}`, `{{context.participantId}}`, `{{input.payloadJson}}`, and `{{var.name}}`. Run-plan provider configs may include `httpTemplate.variables` for non-secret JSON values used by `{{var.*}}` placeholders. These values are visible safe run configuration and must not contain API keys, bearer tokens, private local paths, or other inline credentials; unsafe values are rejected by run-plan validation. Optional profile settings include `DELIBERUM_HTTP_TEMPLATE_URL`, `DELIBERUM_HTTP_TEMPLATE_BASE_URL`, `DELIBERUM_HTTP_TEMPLATE_ENDPOINT_PATH`, `DELIBERUM_HTTP_TEMPLATE_METHOD`, `DELIBERUM_HTTP_TEMPLATE_TIMEOUT_MS`, `DELIBERUM_HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH`, and `DELIBERUM_HTTP_TEMPLATE_RESPONSE_FORMAT=text|json`. This profile does not install extraction generators, proposal reviewers, final candidate generators, final auditors, or interactive provider setup.

The daemon also has a separate opt-in MCP tool participant profile for local/pre-production sealed divergence participant execution through one configured MCP-compatible JSON-RPC tool endpoint:

```bash
DELIBERUM_ENABLE_MCP_TOOL_PROFILE=true \
DELIBERUM_MCP_TOOL_URL=http://127.0.0.1:8787/mcp \
DELIBERUM_MCP_TOOL_NAME=deliberum.reflect \
node apps/daemon/dist/index.js
```

When this profile is enabled and the required URL plus tool name are configured, the daemon registers only the `mcp-tool` participant adapter. It calls `tools/list` by default to verify that the configured tool exists, then calls `tools/call` with JSON arguments derived from the Deliberum participant context. `DELIBERUM_MCP_TOOL_AUTH_TOKEN` is an optional bearer secret for the configured endpoint and is kept in daemon runtime memory only. `DELIBERUM_MCP_TOOL_TIMEOUT_MS` controls the adapter call timeout. Non-local endpoints are rejected by default; `DELIBERUM_MCP_TOOL_ALLOW_REMOTE=true` permits only HTTPS remote endpoints. `DELIBERUM_MCP_TOOL_VERIFY_LIST=false` can skip the `tools/list` check for compatible bridges that do not expose listing. `GET /runtime/profiles` reports only configured/missing booleans and returns `needs_configuration` when the profile is enabled without the required URL or tool name. This profile does not start or manage MCP servers, expose arbitrary tools, install extraction generators, proposal reviewers, final candidate generators, final auditors, or make tool output authoritative.

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

The extraction prompt requests exactly one JSON object with no surrounding prose or Markdown, and the parser remains strict: it accepts only a raw JSON object or a single full fenced JSON object. If a provider response fails only this strict JSON shape check, the extractor may make one corrective retry without including the rejected response text. Additional non-secret request options are available for local compatibility testing: `DELIBERUM_OPENAI_TOP_P`, `DELIBERUM_OPENAI_STREAM=false`, `DELIBERUM_OPENAI_FREQUENCY_PENALTY`, and `DELIBERUM_OPENAI_PRESENCE_PENALTY`. Streaming output is not implemented, so `DELIBERUM_OPENAI_STREAM=true` is rejected as invalid provider configuration.

CLI run commands do not include API key flags or fields. `deliberum daemon profiles` provides safe read-only profile setup status, while full interactive provider setup remains deferred. CLI run commands can read `DELIBERUM_DAEMON_AUTH_TOKEN` for daemon control-plane auth, read the daemon-redacted run event timeline, and follow the daemon-redacted run event stream. The Web run detail page reads the same non-stream timeline and can manually follow the same stream.

Experimental WebGET endpoints are local daemon endpoints:

```text
GET /webget/:token/start
GET /webget/:token/context
GET /webget/:token/context/:page
GET /webget/:token/resources/:resourceId
GET /webget/:token/submit
GET /webget/:token/commit
```

`POST /sessions/:sessionId/resources/:resourceId/deliveries` is daemon-local and session-scoped. It returns safe resource metadata and a Delivery Planner result for a participant id and explicit policy, then appends a `resource_delivery_planned` ledger event with safe audit metadata. The audit event records the selected mode, allowed/denied status, reason, warnings, policy summary, and material kind without storing delivered URLs, bearer access ids, base64 bytes, data refs, or resource text.

Allowed URL deliveries are wrapped in short-lived daemon resource access grants. The response delivery URL points at `GET /resource-access/:accessId`; that endpoint uses a hashed grant lookup and redirects to the selected safe URL variant. With `DELIBERUM_DAEMON_SQLITE_PATH`, grant enforcement and explicit revocation survive daemon restarts; without SQLite they remain process-local. The daemon can also serve explicitly registered in-memory base64 content through the same access route when `allowHostedContentUrl=true`, `maxHostedContentSizeBytes` is set, and the matching URL exposure policy allows the configured access base URL. `POST /resource-access/:accessId/revoke` revokes either grant type and appends a safe revocation audit event. Grant creation also appends a safe lifecycle audit event. The default access base URL is the daemon's local host/port, and `DELIBERUM_RESOURCE_ACCESS_BASE_URL` can be set when a local reverse proxy or explicit public access endpoint is intentionally used. `DELIBERUM_RESOURCE_ACCESS_TTL_MS` controls the grant TTL. Bearer access ids, source URLs, data refs, and base64 bytes are response-only/access-layer material and are not written to ledger events, resource projections, WebGET resource access reports, or run metadata. Lifecycle audit events use a non-bearer `resourceAccessId` plus token hash and safe grant metadata. The endpoint still does not bypass sensitive-resource defaults or make evidence needs satisfied.

`GET /sessions/:sessionId/resources` also returns the session's safe resource delivery audit history as `deliveryAudits` and safe resource access lifecycle history as `accessAudits`. Delivery audit entries are derived from public `resource_delivery_planned` ledger events and include event metadata, resource summary, participant id, policy summary, and delivery decision summary without exposing delivery material. Access audit entries are derived from public `resource_access_grant_created` and `resource_access_grant_revoked` ledger events and include event metadata, action, non-bearer `resourceAccessId`, resource id, participant id, token hash, TTL metadata, and safe hosted-content metadata when applicable.

Deferred daemon work includes production multi-writer coordination for durable stores, broader primitive runner coverage and automated policy around accepted process proposals, production resource hosting posture, full interactive provider setup, production authorization, and remote/multi-user deployment.

## Web UI

The current Web UI is a React/Vite shell that reads from `@deliberum/client` and the local daemon. It has safe daemon runtime profile setup status and a daemon-backed session catalog on the landing page, pages for session overview, Candidate Frontier, objections, quality obligations, events, a daemon-backed compiled outcome projection, a session resources/evidence projection, and local daemon run workspace views.

The Web run workspace is a local daemon control/view surface. Run workspace actions require the local daemon to be running; the Web UI does not provide public hosting, multi-user deployment, or interactive provider setup yet. It can forward an optional local daemon auth token, list safe runtime profile status from `GET /runtime/profiles`, list daemon sessions from `GET /sessions`, list runs, create a run from JSON or a deterministic local preset template, inspect daemon run state, start requested run stages from JSON or the local preset start request, read safe projection endpoints by run session id, display daemon-redacted run ledger events, manually follow the daemon-redacted run event stream, display adaptive process proposal suggestions, record a suggestion as explicit process proposal material, append challenge/decision lifecycle events for recorded process proposals, explicitly execute accepted process proposals for supported daemon stages, and display compiled output only as a provisional outcome. The run outcome page and session Final page can compile the latest projection or a projection for a specific final candidate proposal event id; the session Final page also renders provenance and unresolved material, pre-fills final lifecycle JSON from daemon frontier/provenance data, and can explicitly submit final candidate proposal and final audit JSON through the daemon lifecycle endpoints. The run detail page reads `GET /runs/:runId/events` for the current safe ledger timeline, `GET /runs/:runId/process-proposals` for next-primitive suggestion material, `GET /sessions/:sessionId/process-proposals` for lifecycle state, and opens `GET /runs/:runId/events/stream` only when the user starts live follow; it still does not compute projections or process proposals from streamed events.

The Web local preset controls require the daemon to be started with `DELIBERUM_ENABLE_LOCAL_PRESET=true`. Without that opt-in daemon profile, created runs remain valid but starting a preset pipeline reports missing local components.

The Web UI does not own semantic deliberation state, implement Candidate Frontier logic, run adapters, serve resources, or compile outcomes. The landing session catalog is a read-only daemon summary derived from ledger events; it exposes session identifiers, topic contract summary text, event counts, and timestamps only. Process proposal decisions and final lifecycle submissions recorded from Web are ledger lifecycle facts only; they do not start stages, execute primitives, choose winners, or turn projections into authority. The session Final and Resources pages read daemon projection endpoints; the Resources page shows run-plan resource references, safe broker metadata when registered, safe resource delivery and access audit entries, and accepted evidence needs without hosting files or planning delivery in the browser.
