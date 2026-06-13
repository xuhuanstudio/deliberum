# Security Model

## Defaults

- Bind daemon to `127.0.0.1` by default.
- Do not expose public network binding by default.
- Do not enable wildcard CORS by default.
- Remote access requires authentication or SSH tunneling. The local daemon can require a legacy single bearer token or `DELIBERUM_DAEMON_AUTH_TOKENS_JSON` scoped token registry for control-plane endpoints, while WebGET and resource-access grant URLs remain scoped bearer-token surfaces.
- API keys must come from environment variables, OS keychain, or encrypted local config.
- API keys and provider credentials must not be committed in repo files or examples.
- Public resource URLs are disabled by default.
- Public resource access grants are generated only after explicit delivery policy allows URL mode.
- Sensitive resources cannot be exposed publicly by default.
- Sensitive resources default to `none` delivery unless an explicit safe policy allows another mode.
- WebGET is experimental and must record read/access limitations.
- WebGET tokens are short-lived, daemon-local, and scoped to one WebGET session.
- Daemon operation audit records must store normalized control-plane metadata only. Safe principal id, role, and scopes are allowed; request bodies, headers, bearer tokens, raw WebGET tokens, raw resource access ids, provider secrets, and output payloads are not.

## Control-plane bearer auth

The daemon supports local/pre-production control-plane bearer auth in two modes. `DELIBERUM_DAEMON_AUTH_TOKEN` enables the legacy single-token mode with one admin principal. `DELIBERUM_DAEMON_AUTH_TOKENS_JSON` enables a scoped registry of token entries with non-secret `principalId`, runtime-only `token`, and optional `role` or `scopes`. The registry supports `read`, `write`, and `audit` scopes. `GET` and `HEAD` endpoints require `read`, `GET /runtime/operation-audit` requires `audit`, and mutation endpoints require `write`.

The daemon hashes configured token values for request matching and never writes token values to event records, operation audit records, deployment posture, CLI output, or Web output. Principal ids must be non-secret identifiers because they can appear in safe audit metadata. This bearer registry is an operator hardening layer for local/pre-production control surfaces; it is not production identity, SSO, tenant authorization, or public multi-user access control.

## Operation audit security

The daemon operation audit log is separate from the semantic event ledger. It records local control-plane action, method, normalized route, status code, outcome, auth mode/presence, safe principal id, role, scopes, and non-secret target ids for daemon requests. It does not make projections authoritative and does not become a source of deliberation truth.

Operation audit persistence and export are optional. With `DELIBERUM_DAEMON_SQLITE_PATH`, audit records are stored in the local daemon SQLite database. Without SQLite, `DELIBERUM_DAEMON_OPERATION_AUDIT_PATH` can persist the same safe metadata to JSON for local development. If neither is configured, the audit log is process-local memory only. `DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES` caps retained records for all three local audit log backends. `DELIBERUM_DAEMON_OPERATION_AUDIT_JSONL_PATH` can mirror the same safe records to a local JSONL archive with optional size-based rotation. `DELIBERUM_DAEMON_OPERATION_AUDIT_EXPORT_URL` can POST the same safe record material to an HTTPS collector, with localhost HTTP allowed for local collectors and non-local HTTP requiring an explicit insecure opt-in.

## Resource security

Resource delivery modes are:

- URL;
- base64;
- none/fallback summary.

URL exposure can be localhost, LAN, or public. Public exposure requires signed URLs, TTL, revocation, and audit logs. Current implementation wraps allowed URL deliveries in short-lived, revocable daemon access grants and can serve explicitly registered in-memory base64 content through the same grant route when hosted-content policy is enabled. It does not host arbitrary local files or unregistered content.

Daemon resource delivery outside WebGET is local and session-scoped. The endpoint returns a Delivery Planner result only for resources referenced by the session run plan, requires a participant id, and keeps public URL and base64 delivery behind explicit policy. Sensitive resources still default to `none`. Successful delivery planning appends a `resource_delivery_planned` ledger event with safe metadata only; it records the resource id, participant id, selected mode, allowed/denied status, reason, warnings, policy summary, and material kind, but not delivered URLs, bearer access ids, base64 bytes, data refs, or resource text.

Resource access grant ids are response-only bearer material. The daemon stores a hash of each access id with access-layer grant metadata, applies TTL checks on access, and supports explicit revocation through the local daemon route. With `DELIBERUM_DAEMON_SQLITE_PATH`, this access-layer grant state and explicitly registered resource broker metadata/content are durable across daemon restarts; without SQLite they remain process-local. Grant creation and revocation append public ledger audit events that contain a non-bearer `resourceAccessId`, resource and participant ids, token hash, TTL metadata, and safe hosted-content metadata when applicable. They do not store bearer access ids, source URLs, base64 bytes, data refs, or resource text. Hosted content grants store only a data reference and safe content metadata in the grant store; base64 bytes are resolved from the broker only at access time, and SQLite broker persistence can preserve explicitly registered broker content across local daemon restarts. WebGET resource access reports are reduced to mode, allowed flag, reason, and warnings before they can be included in committed contribution audit payloads.

The daemon resource access base URL defaults to the local daemon host and port. When configured from environment variables, non-local base URLs require `DELIBERUM_RESOURCE_ACCESS_ALLOW_REMOTE=true`; public base URLs must use HTTPS. `DELIBERUM_RESOURCE_ACCESS_SIGNING_SECRET` can require HMAC-signed daemon access URLs. The signing key remains runtime-only; lifecycle events, resources projections, WebGET reports, operation audit records, and posture reads do not store or return the key or URL signatures.

`GET /runtime/resource-access` exposes only safe posture metadata for local operators: whether the base URL, URL signing, and TTL were explicitly configured, the base URL exposure class, the route pattern, the TTL limit, grant-store continuity class, hosted-content delivery preconditions, restart-continuity classes, production hosting blockers, and safety notes. It does not return the actual configured base URL, bearer access ids, signing secrets, URL signatures, source URLs, redirect targets, hosted content, or resource payloads.

Base64 avoids public URL exposure but still sends resource content to the target participant. It must not be treated as private once delivered.

`none` mode may use summaries, OCR, captions, transcripts, or semantic board summaries.

## Adapter security

Adapters must declare capabilities and risks. Low-reliability adapters such as WebGET must record what context they actually read.

Adapters must not receive more context or resources than their task requires.

## Tool security

Tools that write files, run shell commands, access private resources, or make network calls require policy and audit logging.

Tool outputs are evidence objects or contribution objects; they are not unquestionable truth.

The opt-in daemon MCP tool participant profile can restrict one configured `tools/call` request by serialized argument size, top-level argument keys, and default context forwarding. These controls reduce accidental over-sharing to the configured tool but do not replace production sandboxing, authorization, or server lifecycle management.

## Context capsules

Context capsules must record:

- included references;
- omitted references;
- resource delivery choices;
- privacy level;
- token/URL expiry;
- intended participant.

Public capsules must be opt-in and revocable.

## Private files

Never commit:

- `.env`;
- `.codex/`;
- context capsules;
- resource caches;
- session databases;
- WebGET tokens;
- model output logs;
- private Codex handoff files.

See also: `docs/THREAT_MODEL.md`.
