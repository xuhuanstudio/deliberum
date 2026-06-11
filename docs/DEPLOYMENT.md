# Deployment

## Current status

Deliberum is currently a local-first, pre-production implementation. The supported runtime surfaces are:

- local CLI commands using the shared JSON EventStore for local file persistence;
- local daemon API using a process-local in-memory EventStore by default;
- separate local Vite Web UI shell reading the daemon through `@deliberum/client`.

The daemon binds to `127.0.0.1` by default and does not provide production authentication, multi-user deployment, or production-grade daemon storage yet.

## Local CLI

The CLI uses the shared JSON EventStore for local persistence. It stores events in a local JSON file under `.deliberum/` by default, with explicit `--store` / `DELIBERUM_STORE` overrides for local use and tests.

The CLI does not create hidden current-session state and does not bypass EventStore semantics.

## Local daemon API

The daemon exposes the current local HTTP API and WebGET endpoints. It uses in-memory state by default. For local development, `DELIBERUM_DAEMON_EVENT_STORE_PATH=<path>` opts into the shared JSON EventStore for daemon event ledger persistence, and `DELIBERUM_DAEMON_RUN_STORE_PATH=<path>` opts into JSON run metadata persistence. Use both paths together when the local run workspace must survive daemon restarts.

The optional JSON stores persist session ledger events and run metadata only. WebGET sessions, resource broker state, authentication state, and multi-user coordination remain process-local or unimplemented. The daemon does not currently use SQLite, Postgres, or another production-grade persistent storage backend.

## Web UI

The Web UI is currently a separate React/Vite application. It reads daemon/client responses and does not own semantic deliberation state.

The daemon does not currently serve built Web UI assets.

## Deferred deployment work

The following remain future work:

- SQLite or equivalent production-grade daemon storage;
- multi-writer coordination;
- daemon-served Web UI assets;
- daemon final/resource endpoints;
- signed or public resource hosting;
- production authentication and authorization;
- SSH/remote deployment guidance beyond manual local port forwarding;
- Postgres-backed team/server deployments;
- container packaging.
