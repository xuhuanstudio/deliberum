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
- opt-in daemon control-plane bearer auth for local/pre-production hardening;
- process-local `InMemoryEventStore` for daemon defaults;
- `better-sqlite3` for optional local/pre-production daemon SQLite event ledger, run metadata, resource broker, and resource access grant persistence with local connection-level writer serialization;
- shared Node `JsonFileEventStore` for CLI persistence and optional local daemon event ledger persistence;
- daemon-local `JsonFileRunStore` for optional local run metadata persistence;
- Server-Sent Events for daemon event streaming;
- daemon-local session-scoped resource delivery planning through the Resource Broker and Delivery Planner, with safe ledger audit events for delivery decisions and short-lived access grants for allowed URL and hosted in-memory content deliveries;
- package-level HTTP-template participant adapter and opt-in daemon participant profile for non-OpenAI HTTP providers;
- package-level MCP-compatible tool participant adapter with injected client lifecycle;
- read-only adaptive primitive suggestion in `@deliberum/orchestrator`, surfaced by the daemon as process proposal material;
- explicit accepted process proposal execution through the daemon run start path for supported primitives, including candidate repair proposal execution and evidence check result recording;
- React + Vite + TypeScript for the Web shell;
- TanStack Router and TanStack Query for Web routing and daemon reads.

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
- broader automated policy around accepted process proposals;
- Postgres for future team/server deployments;
- WebSocket streaming if SSE becomes insufficient;
- Zustand or another local UI-state helper if Web UI complexity requires it;
- shadcn/ui, Radix primitives, or another component system;
- React Flow / xyflow for structured graph projections;
- tldraw for free-form canvas projections, never as semantic truth;
- daemon MCP profile, tool execution policy, and adapter sandboxing;
- production resource hosting posture;
- production multi-user authorization.

## Why not Next.js first?

The Web UI is a local daemon projection, not a public content site. A separate Vite SPA that reads the local daemon keeps responsibilities clearer while daemon-served Web assets remain deferred.

## Future native packaging

Desktop wrappers, Rust/Go core rewrites, or Tauri packaging can be considered after the protocol and runtime boundaries stabilize. They must not precede the core deliberation loop.
