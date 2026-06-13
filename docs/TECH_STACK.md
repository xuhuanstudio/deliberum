# Technology Stack

Deliberum is designed as a terminal-first, local-first TypeScript monorepo with a daemon, Web projection, CLI, adapters, and shared protocol packages.

## Baseline runtime

- Node.js 24 LTS or newer;
- pnpm 11 or newer;
- TypeScript;
- zod for runtime protocol validation.

Node.js 20 is no longer an acceptable baseline for new development because it reached end-of-life in 2026. The repository pins pnpm 11 and Node 24 in project metadata.

## Implemented stack

- pnpm workspaces for the monorepo;
- TypeScript for all apps and packages;
- zod for runtime protocol validation;
- Vitest for package and app tests;
- package-level baseline comparison report harness in `@deliberum/evaluation`;
- Hono and `@hono/node-server` for the local daemon API;
- opt-in daemon control-plane bearer auth for local/pre-production hardening, with legacy single-token mode and scoped token registry mode;
- process-local `InMemoryEventStore` for daemon defaults;
- `better-sqlite3` for optional local/pre-production daemon SQLite event ledger, run metadata, resource broker, resource access grant, and operation audit log persistence with local connection-level writer serialization;
- shared Node `JsonFileEventStore` for CLI persistence and optional local daemon event ledger persistence;
- daemon-local `JsonFileRunStore` for optional local run metadata persistence;
- daemon-local operation audit log with in-memory defaults, optional JSON persistence, optional SQLite persistence, local retention caps, optional rotated JSONL mirror, optional HTTP export, and CLI JSONL export for safe control-plane operation metadata;
- CLI daemon runtime profile status, comment-only env-template output, safe env block writing, local interactive setup wizard secret capture, safe profile-doctor diagnostics, safe setup-plan output, scoped daemon auth entry generation, deployment posture reads, and resource access posture reads for local setup assistance;
- shared `@deliberum/client` setup-plan projection helpers for CLI/Web local setup summaries derived from safe runtime profile metadata, plus daemon deployment posture response types and reads;
- Server-Sent Events for daemon event streaming;
- daemon-local session-scoped resource delivery planning through the Resource Broker and Delivery Planner, with safe ledger audit events for delivery decisions and short-lived access grants for allowed URL and hosted in-memory content deliveries;
- daemon resource access base URL validation, optional HMAC-signed daemon access URLs, and safe posture reporting with explicit opt-in for env-configured non-local access URLs and HTTPS-only public access URLs;
- daemon deployment posture reporting for bind exposure, control-plane auth mode, token mode, principal count, CORS origin count, persistence classes, resource access continuity, production-readiness blockers, and safety notes without exposing secrets, resource access URLs, or provider/tool endpoint values;
- optional daemon-served built Web static assets for local/pre-production shells, with Accept-based SPA/API route separation, no-store shell responses, immutable asset caching, and configured-root path constraints;
- package-level HTTP-template participant adapter and opt-in daemon participant profile for non-OpenAI HTTP providers;
- package-level MCP-compatible tool participant adapter with injected client lifecycle, execution policy controls, and an opt-in daemon MCP tool participant profile;
- read-only adaptive primitive suggestion in `@deliberum/orchestrator`, surfaced by the daemon as process proposal material;
- explicit accepted process proposal execution through the daemon run start path for supported primitives, with read-only daemon execution readiness for recorded process proposal lifecycle state;
- React + Vite + TypeScript for the Web shell;
- TanStack Router and TanStack Query for Web routing and daemon reads, including runtime profile and deployment posture summaries.

## Repository shape

```text
apps/
  cli/
  daemon/
  web/
packages/
  protocol/
  core/
  evaluation/
  storage/
  adapters/
  resources/
  client/
  ui/
```

## Deferred stack

The following are planned or possible future additions, not current implementation dependencies:

- production multi-writer coordination for durable daemon stores;
- broader automated policy beyond read-only accepted process proposal readiness;
- Postgres for future team/server deployments;
- WebSocket streaming if SSE becomes insufficient;
- Zustand or another local UI-state helper if Web UI complexity requires it;
- shadcn/ui, Radix primitives, or another component system;
- React Flow / xyflow for structured graph projections;
- tldraw for free-form canvas projections, never as semantic truth;
- MCP server lifecycle management, broader external tool execution policy, and adapter sandboxing;
- production public resource hosting and signed URL service implementation;
- production multi-user authorization.

## Why not Next.js first?

The Web UI is a local daemon projection, not a public content site. A separate Vite SPA that reads the local daemon remains the development default, while optional daemon-served Web assets and the local/pre-production Docker image support single-process shells without turning the daemon into a production public host.

## Future native packaging

Desktop wrappers, Rust/Go core rewrites, or Tauri packaging can be considered after the protocol and runtime boundaries stabilize. They must not precede the core deliberation loop.
