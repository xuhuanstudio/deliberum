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
- Hono and `@hono/node-server` for the local daemon API;
- process-local `InMemoryEventStore` for current daemon state;
- CLI-local JSON EventStore for current CLI persistence;
- Server-Sent Events for daemon event streaming;
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
  storage/
  adapters/
  resources/
  client/
  ui/
```

## Deferred stack

The following are planned or possible future additions, not current implementation dependencies:

- SQLite or another durable daemon store;
- Postgres for future team/server deployments;
- WebSocket streaming if SSE becomes insufficient;
- Zustand or another local UI-state helper if Web UI complexity requires it;
- shadcn/ui, Radix primitives, or another component system;
- React Flow / xyflow for structured graph projections;
- tldraw for free-form canvas projections, never as semantic truth;
- signed/public resource hosting and revocation;
- MCP adapter;
- HTTP-template adapter.

## Why not Next.js first?

The Web UI is a local daemon projection, not a public content site. A separate Vite SPA that reads the local daemon keeps responsibilities clearer while daemon-served Web assets remain deferred.

## Future native packaging

Desktop wrappers, Rust/Go core rewrites, or Tauri packaging can be considered after the protocol and runtime boundaries stabilize. They must not precede the core deliberation loop.
