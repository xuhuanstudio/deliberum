# Roadmap

This roadmap is public and high-level. It is not a private implementation task list.

Deliberum is not an MVP-first project. The implementation is staged, but each stage must preserve the full architecture boundaries: no central Judge, no voting winner, no chat-first product shape, and no UI or adapter as source of truth.

## Current Implementation Status

Implemented through Stage 15B:

- TypeScript monorepo with protocol, core, storage, adapters, resources, client, UI, CLI, daemon, and Web packages.
- Runtime-validated protocol schemas for events, Topic Contracts, participants, sealed batches, deliberation objects, proposals, references, resources, final audit, and outcome compilation.
- Append-only event storage with store-assigned `sequence` and `recordedAt`; in-memory storage for package/core tests and CLI-local JSON persistence.
- Core lifecycle APIs for Topic Contract session creation, Sealed Divergence, Extraction Proposals, proposal challenge/acceptance, Final Audit, and Outcome Compilation.
- Derived projections for extraction proposal states, accepted deliberation objects, Candidate Frontier, objections, and quality obligations, with projection metadata.
- CLI commands for sessions, batches, contributions, extraction proposals, proposal challenge/acceptance, frontier, objections, obligations, and events.
- Local Hono daemon API using an in-memory store, structured safe errors, local binding defaults, SSE for new append-only events, and experimental WebGET endpoints.
- React/Vite Web UI shell that reads daemon/client responses and does not own semantic state.
- Participant adapter interfaces, fake/manual adapters, OpenAI-compatible adapter, Resource Broker / Delivery Planner, and experimental WebGET support.
- Stabilization hardening for persisted ledger loading, WebGET decoded submission safety, commit finalization, and projection traceability.

This is still a pre-production local-first implementation, not a production service.

## Near-Term Stabilization

- Keep documentation, tests, and public package surfaces aligned with implementation.
- Add targeted integration tests across CLI, daemon, client, and core projections where regressions would break ledger traceability.
- Continue security review around WebGET, resource delivery, daemon error handling, and public-open-source hygiene.

## Deferred Runtime Work

- SQLite or equivalent persistent daemon storage.
- Daemon endpoints for final outcome compilation and resource delivery.
- Live Web UI pages for final outcome and resources.
- Full adaptive primitive scheduler.
- Signed/public resource hosting and revocation.
- MCP adapter and HTTP-template adapter.
- Production authentication, authorization, multi-user deployment, and remote access posture.

## Later Evaluation And Release Work

- Baseline comparison harness.
- Adapter sandboxing and operational audit logs.
- Public alpha packaging once naming, domain, package scope, and trademark checks are complete.
