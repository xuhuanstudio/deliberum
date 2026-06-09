# Technology Stack

Deliberum is designed as a terminal-first, local-first TypeScript monorepo with a daemon, Web projection, CLI, adapters, and shared protocol packages.

## Baseline runtime

- Node.js 24 LTS or newer;
- pnpm 11 or newer;
- TypeScript;
- zod for runtime protocol validation.

Node.js 20 is no longer an acceptable baseline for new development because it reached end-of-life in 2026. The repository pins pnpm 11 and Node 24 in project metadata.

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

## Daemon

Recommended initial stack:

- Hono for the local HTTP API;
- SQLite as the default local store;
- Server-Sent Events or WebSocket for event streaming;
- Postgres later for team/server deployments.

## Web

Recommended stack:

- React + Vite + TypeScript;
- TanStack Router;
- TanStack Query;
- Zustand for local UI state;
- shadcn/ui + Radix primitives;
- React Flow / xyflow for structured graphs;
- tldraw later for free-form canvas projections, not as semantic truth.

## Why not Next.js first?

The Web UI is a local daemon projection, not a public content site. A Vite SPA served by the daemon keeps responsibilities clearer and is easier to use in SSH and local-first setups.

## Future native packaging

Desktop wrappers, Rust/Go core rewrites, or Tauri packaging can be considered after the protocol and runtime boundaries stabilize. They must not precede the core deliberation loop.
