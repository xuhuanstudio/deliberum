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

By default, browser CORS is limited to the local Web development origins `http://127.0.0.1:5173` and `http://localhost:5173`. If the Web dev server must run on another local port, set `DELIBERUM_DAEMON_CORS_ORIGINS` to a comma-separated local-origin allow-list, for example `http://127.0.0.1:5180,http://localhost:5180`. The daemon rejects non-local origins for this configuration and never uses wildcard CORS.

The daemon also owns a process-local in-memory run store for local orchestration control. Run endpoints expose safe operational views over orchestrator state; they do not expose provider secrets, own Candidate Frontier semantics, select a single answer, or turn compiled outcomes into authoritative truth.

Implemented endpoints:

```text
GET  /health
GET  /runs
GET  /runs/:runId
GET  /runs/:runId/events
GET  /runs/:runId/events/stream
GET  /runs/:runId/outcome
POST /runs
POST /runs/:runId/start
GET  /sessions/:sessionId/events
GET  /sessions/:sessionId/events/stream
GET  /sessions/:sessionId/final
GET  /sessions/:sessionId/frontier
GET  /sessions/:sessionId/objections
GET  /sessions/:sessionId/obligations
GET  /sessions/:sessionId/resources
POST /sessions
POST /sessions/:sessionId/batches
POST /sessions/:sessionId/batches/:batchId/contributions
POST /sessions/:sessionId/batches/:batchId/close
POST /sessions/:sessionId/extractions
POST /sessions/:sessionId/proposals/:proposalEventId/challenges
POST /sessions/:sessionId/proposals/:proposalEventId/acceptance
```

Run orchestration is synchronous and local in the current daemon. By default, component registries must be injected by the embedding process or tests; the daemon does not install deterministic local preset components, fake adapters, or provider-backed adapters automatically.

For local development and testing only, the daemon can be started with:

```bash
DELIBERUM_ENABLE_LOCAL_PRESET=true node apps/daemon/dist/index.js
```

That opt-in profile registers deterministic local preset participant adapters and generators so the Web run workspace can exercise the full run pipeline without real provider calls. This profile is not production behavior, does not add provider setup UX, does not persist daemon state, and does not make preset output authoritative.

Stage 22A also adds an opt-in OpenAI-compatible daemon profile for local/pre-production sealed divergence participant execution:

```bash
DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE=true node apps/daemon/dist/index.js
```

When this profile is enabled, the daemon registers the OpenAI-compatible participant adapter. Run plans may reference provider configuration such as `baseUrl`, `modelId`, `endpointPath`, `timeoutMs`, and `apiKeyEnvVar`; the actual key must remain in the daemon environment, for example `DELIBERUM_OPENAI_API_KEY`. Provider secrets are not accepted through Web forms, CLI flags, daemon request bodies, run-plan inline values, events, run records, or API responses. This profile alone does not install extraction generators, proposal reviewers, final candidate generators, or final auditors.

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

For local provider smoke only, the profile also supports optional non-secret request compatibility settings. If these are omitted, the OpenAI-compatible adapter still sends only `model` and `messages`. For MiMo-compatible local smoke, a conservative example is:

```bash
DELIBERUM_OPENAI_BASE_URL=https://token-plan-cn.xiaomimimo.com
DELIBERUM_OPENAI_ENDPOINT_PATH=/v1/chat/completions
DELIBERUM_OPENAI_MODEL=mimo-v2.5-pro
DELIBERUM_OPENAI_TOKEN_PARAMETER=max_completion_tokens
DELIBERUM_OPENAI_MAX_COMPLETION_TOKENS=1024
DELIBERUM_OPENAI_TEMPERATURE=0
DELIBERUM_OPENAI_THINKING=disabled
```

The extraction prompt requests exactly one JSON object with no surrounding prose or Markdown, and the parser remains strict: it accepts only a raw JSON object or a single full fenced JSON object. If a provider response fails only this strict JSON shape check, the extractor may make one corrective retry without including the rejected response text. Additional non-secret request options are available for local compatibility testing: `DELIBERUM_OPENAI_TOP_P`, `DELIBERUM_OPENAI_STREAM=false`, `DELIBERUM_OPENAI_FREQUENCY_PENALTY`, and `DELIBERUM_OPENAI_PRESENCE_PENALTY`. Streaming output is not implemented, so `DELIBERUM_OPENAI_STREAM=true` is rejected as invalid provider configuration.

CLI run commands do not include provider setup UX, API key flags or fields, interactive setup, or run event follow. The Web run detail page reads a non-stream daemon-redacted run event timeline and can manually follow the daemon-redacted run event stream.

Experimental WebGET endpoints are local daemon endpoints:

```text
GET /webget/:token/start
GET /webget/:token/context
GET /webget/:token/context/:page
GET /webget/:token/resources/:resourceId
GET /webget/:token/submit
GET /webget/:token/commit
```

Deferred daemon work includes persistent SQLite storage, resource delivery or hosting endpoints outside WebGET, real provider setup UX, interactive setup, CLI run event follow, production authentication, and remote/multi-user deployment.

## Web UI

The current Web UI is a React/Vite shell that reads from `@deliberum/client` and the local daemon. It has pages for session overview, Candidate Frontier, objections, quality obligations, events, a daemon-backed compiled outcome projection, a session resources/evidence projection, and local daemon run workspace views.

The Web run workspace is a local daemon control/view surface. Run workspace actions require the local daemon to be running; the Web UI does not provide public hosting, authentication, persistent daemon storage, or provider setup UX yet. It can list runs, create a run from JSON or a deterministic local preset template, inspect daemon run state, start requested run stages from JSON or the local preset start request, read safe projection endpoints by run session id, display daemon-redacted run ledger events, manually follow the daemon-redacted run event stream, and display compiled output only as a provisional outcome. The session Final page reads `GET /sessions/:sessionId/final` and renders the compiled outcome projection with provenance and unresolved material. The run detail page reads `GET /runs/:runId/events` for the current safe ledger timeline and opens `GET /runs/:runId/events/stream` only when the user starts live follow; it still does not compute projections from streamed events.

The Web local preset controls require the daemon to be started with `DELIBERUM_ENABLE_LOCAL_PRESET=true`. Without that opt-in daemon profile, created runs remain valid but starting a preset pipeline reports missing local components.

The Web UI does not own semantic deliberation state, implement Candidate Frontier logic, run adapters, serve resources, or compile outcomes. The session Final and Resources pages read daemon projection endpoints; the Resources page shows run-plan resource references, safe broker metadata when registered, and accepted evidence needs without hosting files or planning delivery in the browser.
