# Deployment

## Current status

Deliberum is currently a local-first, pre-production implementation. The supported runtime surfaces are:

- local CLI commands using a CLI-local JSON EventStore;
- local daemon API using a process-local in-memory EventStore;
- separate local Vite Web UI shell reading the daemon through `@deliberum/client`.

The daemon binds to `127.0.0.1` by default and does not provide production authentication, multi-user deployment, or durable daemon storage yet.

## Local CLI

The CLI is the current persistent local control surface. It stores events in a local JSON file under `.deliberum/` by default, with explicit `--store` / `DELIBERUM_STORE` overrides for local use and tests.

The CLI does not create hidden current-session state and does not bypass EventStore semantics.

## Local daemon API

The daemon exposes the current local HTTP API and WebGET endpoints. Stage 16 uses in-memory daemon state only; state resets when the daemon process restarts.

The daemon does not currently use SQLite, Postgres, or another persistent storage backend.

## Web UI

The Web UI is currently a separate React/Vite application. It reads daemon/client responses and does not own semantic deliberation state.

The daemon does not currently serve built Web UI assets.

## Deferred deployment work

The following remain future work:

- SQLite or equivalent persistent daemon storage;
- daemon-served Web UI assets;
- daemon final/resource endpoints;
- signed or public resource hosting;
- production authentication and authorization;
- SSH/remote deployment guidance beyond manual local port forwarding;
- Postgres-backed team/server deployments;
- container packaging.
