# Changelog

This project follows a human-readable changelog. The initial public repository starts at `0.0.0` until the first implementation release.

## Unreleased

- Added TypeScript monorepo packages for protocol, core lifecycle/projections, storage, adapters, resources, client, UI, evaluation, orchestrator, CLI, daemon, and Web.
- Added local-first daemon run orchestration with optional SQLite persistence, safe runtime profile metadata, operation audit logging, resource delivery planning, short-lived resource access grants, WebGET support, and daemon-redacted run event reads/streams.
- Added explicit process proposal lifecycle support, read-only adaptive process suggestions, daemon execution readiness, and operator-triggered accepted proposal execution for supported stages.
- Added OpenAI-compatible, HTTP-template, MCP-compatible tool, manual, fake, and WebGET adapter surfaces with safe secret handling boundaries.
- Added safe daemon setup-plan output derived from runtime profile metadata, including required and recommended local configuration steps without printing or storing secret values.
- Added safe daemon env file block writing from runtime profile metadata, with secret env vars left as manual placeholders.
- Added a local interactive daemon setup wizard that captures missing setup values and hidden secret values without printing or sending them to the daemon.
- Added dry-run env block preview steps to shared setup-plan projections for CLI and Web setup summaries.
- Added shared client-side setup-plan projection helpers and Web runtime profile setup summaries derived from safe daemon metadata.
- Added safe daemon deployment posture diagnostics for local/pre-production binding, auth, CORS, persistence, resource access, and production-readiness blockers without exposing secrets, resource access URLs, or provider/tool endpoint values.
- Added scoped daemon control-plane token registries with safe principal metadata, read/write/audit scopes, and posture/audit reporting that never returns token material.
- Added a local CLI helper for generating scoped daemon auth registry entries and process-specific env assignment hints.
- Added remote/pre-production deployment hardening guidance for private daemon exposure, durable local state, audit export, daemon-served Web assets, resource access posture, and verification commands.
- Added safe daemon resource access posture diagnostics for hosted-content preconditions, restart-continuity classes, and production resource hosting blockers without exposing resource material.
- Added optional HMAC-signed daemon resource access URLs for local/pre-production resource grants, with safe posture reporting that never exposes signing keys or signatures.
- Added optional SQLite single-daemon process locking for local/pre-production daemon state, with safe deployment posture reporting that does not expose SQLite paths or lock owner ids.
- Fixed durable operation audit default ids so SQLite and JSON-backed audit logs can keep recording safely after daemon restarts.
- Added Web landing deployment posture summaries derived from the safe daemon posture endpoint.
- Added optional daemon-served Web static assets for built local/pre-production Web shells with Accept-based SPA/API routing separation.
- Added local/pre-production container packaging for daemon-served Web shells with localhost-bound Compose defaults and SQLite data volume persistence.
- Added optional local operation audit JSONL mirroring with size-based rotation for safe control-plane metadata archival.
- Added optional HTTP operation audit export for safe control-plane metadata shipping without request bodies, headers, bearer tokens, provider secrets, or output payloads.
- Added public project hygiene files, CI, security/governance documentation, deployment notes, and baseline evaluation harnesses.

## 0.0.0

- Project charter and protocol documents initialized.
