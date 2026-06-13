# Roadmap

This roadmap is public and high-level. It is not a private implementation task list.

Deliberum is not an MVP-first project. The implementation is staged, but each stage must preserve the full architecture boundaries: no central Judge, no voting winner, no chat-first product shape, and no UI or adapter as source of truth.

## Current Implementation Status

Implemented today:

- TypeScript monorepo with protocol, core, storage, adapters, resources, client, UI, CLI, daemon, and Web packages.
- Runtime-validated protocol schemas for events, Topic Contracts, participants, sealed batches, deliberation objects, proposals, references, resources, final audit, and outcome compilation.
- Runtime-validated evaluation schemas plus a baseline comparison report harness and public sample fixture for externally supplied findings.
- Append-only event storage with store-assigned `sequence` and `recordedAt`; in-memory storage for package/core tests, shared JSON file persistence for the local CLI, optional JSON daemon event ledger and operation audit log persistence, optional local rotated JSONL operation audit mirroring, optional HTTP operation audit export, and optional SQLite daemon event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence with local connection-level writer serialization.
- Core lifecycle APIs for Topic Contract session creation, Sealed Divergence, Extraction Proposals, proposal challenge/acceptance, Process Proposals, Evidence Result recording, Final Audit, and Outcome Compilation.
- Derived projections for extraction proposal states, accepted deliberation objects, Candidate Frontier, objections, and quality obligations, with projection metadata.
- CLI commands for sessions, batches, contributions, extraction proposals, proposal challenge/acceptance, process proposal lifecycle, final candidate/audit/outcome projection, frontier, objections, obligations, events, local daemon runtime profile status, env-template output, safe env block writing, local interactive setup wizard secret capture, profile-doctor diagnostics, safe setup-plan output, local daemon deployment posture reads, local daemon operation audit reads and JSONL export, optional daemon control-plane bearer auth with single-token and scoped-registry modes, local daemon resource access posture reads and revocation, local daemon run orchestration, daemon resources/evidence projection reads, daemon-backed final lifecycle submissions, explicit accepted process proposal execution with read-only execution readiness, and daemon-redacted run event timeline/follow support.
- Local Hono daemon API using in-memory defaults, optional control-plane bearer auth with single-token and scoped-registry modes, optional SQLite event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence with retention limits, optional JSON event ledger, run metadata, and operation audit log persistence with retention limits, optional local rotated JSONL operation audit mirroring, optional HTTP operation audit export, structured safe errors, local binding defaults, optional built Web static asset serving for local/pre-production shells, local/pre-production container packaging, safe runtime profile, deployment posture, and resource access posture status, safe operation audit metadata with non-secret principal metadata, run orchestration endpoints, explicit accepted process proposal execution, daemon-redacted run event timeline/SSE endpoints, session projection endpoints, session process proposal lifecycle endpoints, session final lifecycle endpoints, session-scoped resource delivery planning endpoint with safe ledger audit events, revocable daemon resource access grants for allowed URL and hosted in-memory content deliveries, and experimental WebGET endpoints.
- React/Vite Web UI shell that reads daemon/client responses, includes safe daemon runtime profile status, setup-plan summaries, deployment posture summaries with token mode and principal count, daemon-backed session catalog, local run workspace, process proposal lifecycle, execution readiness, and accepted-proposal execution controls, final lifecycle controls, run event timeline/follow views, final outcome projection page, and resources/evidence projection page with safe resource delivery and access audit history, and does not own semantic state.
- Participant adapter interfaces, fake/manual adapters, HTTP-template participant adapter/profile, package-level MCP-compatible tool participant adapter with execution policy controls, opt-in daemon MCP tool participant profile with execution policy env controls, OpenAI-compatible participant/extraction/review/finalization components, Resource Broker / Delivery Planner, daemon-local resource delivery planning, short-lived URL access grants, and experimental WebGET support.
- Read-only adaptive primitive suggestions and execution readiness that return challengeable process proposal material and daemon execution status for daemon runs without mutating the ledger or executing stages, plus explicit process proposal lifecycle events and operator-triggered accepted-proposal execution for supported daemon stages, including candidate repair proposal execution, evidence check execution that records reported evidence results, and final/omission audit execution against existing final candidate proposal events.
- Stabilization hardening for persisted ledger loading, optional daemon event/run/resource-broker/resource-access/operation-audit persistence, operation audit retention, local JSONL rotation, HTTP export, optional daemon control-plane auth with scoped registry support, safe daemon deployment posture diagnostics, local SQLite writer serialization, WebGET decoded submission safety, commit finalization, projection traceability, idempotency result consistency, SSE idempotent publish guards, WebGET context visibility, resource access base URL opt-in, and resource delivery safety.

This is still a pre-production local-first implementation, not a production service.

## Near-Term Stabilization

- Keep documentation, tests, and public package surfaces aligned with implementation.
- Add targeted integration tests across CLI, daemon, client, and core projections where regressions would break ledger traceability.
- Continue security review around WebGET, resource delivery, daemon error handling, and public-open-source hygiene.

## Deferred Runtime Work

- Multi-writer coordination for durable daemon stores.
- Broader primitive runner coverage and automated policy beyond read-only accepted process proposal readiness.
- Production public resource hosting and signed URL service implementation.
- MCP server lifecycle management, broader external tool execution policy, and adapter sandboxing.
- Production authorization and multi-user deployment.

## Later Evaluation And Release Work

- Larger externally reviewed baseline benchmark datasets.
- Public alpha packaging once naming, domain, package scope, and trademark checks are complete.
