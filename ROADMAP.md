# Roadmap

This roadmap is public and high-level. It is not a private implementation task list.

Deliberum is not an MVP-first project. The implementation is staged, but each stage must preserve the full architecture boundaries: no central Judge, no voting winner, no chat-first product shape, and no UI or adapter as source of truth.

## Current Implementation Status

Implemented today:

- TypeScript monorepo with protocol, core, storage, adapters, resources, client, UI, CLI, daemon, and Web packages.
- Runtime-validated protocol schemas for events, Topic Contracts, participants, sealed batches, deliberation objects, proposals, references, resources, final audit, and outcome compilation.
- Append-only event storage with store-assigned `sequence` and `recordedAt`; in-memory storage for package/core tests, shared JSON file persistence for the local CLI, and optional JSON daemon event ledger persistence.
- Core lifecycle APIs for Topic Contract session creation, Sealed Divergence, Extraction Proposals, proposal challenge/acceptance, Final Audit, and Outcome Compilation.
- Derived projections for extraction proposal states, accepted deliberation objects, Candidate Frontier, objections, and quality obligations, with projection metadata.
- CLI commands for sessions, batches, contributions, extraction proposals, proposal challenge/acceptance, frontier, objections, obligations, events, local daemon run orchestration, and daemon-redacted run event timeline/follow support.
- Local Hono daemon API using in-memory defaults, optional JSON event ledger and run metadata persistence, structured safe errors, local binding defaults, run orchestration endpoints, daemon-redacted run event timeline/SSE endpoints, session projection endpoints, and experimental WebGET endpoints.
- React/Vite Web UI shell that reads daemon/client responses, includes local run workspace, run event timeline/follow views, final outcome projection page, and resources/evidence projection page, and does not own semantic state.
- Participant adapter interfaces, fake/manual adapters, OpenAI-compatible participant/extraction/review/finalization components, Resource Broker / Delivery Planner, and experimental WebGET support.
- Stabilization hardening for persisted ledger loading, optional daemon event/run persistence, WebGET decoded submission safety, commit finalization, projection traceability, idempotency result consistency, SSE idempotent publish guards, WebGET context visibility, and resource delivery safety.

This is still a pre-production local-first implementation, not a production service.

## Near-Term Stabilization

- Keep documentation, tests, and public package surfaces aligned with implementation.
- Add targeted integration tests across CLI, daemon, client, and core projections where regressions would break ledger traceability.
- Continue security review around WebGET, resource delivery, daemon error handling, and public-open-source hygiene.

## Deferred Runtime Work

- SQLite or equivalent production-grade daemon storage.
- Multi-writer coordination for durable daemon stores.
- Resource delivery or hosting endpoints outside WebGET.
- Full adaptive primitive scheduler.
- Signed/public resource hosting and revocation.
- MCP adapter and HTTP-template adapter.
- Provider setup UX and interactive local configuration.
- Production authentication, authorization, multi-user deployment, and remote access posture.

## Later Evaluation And Release Work

- Baseline comparison harness.
- Adapter sandboxing and operational audit logs.
- Public alpha packaging once naming, domain, package scope, and trademark checks are complete.
