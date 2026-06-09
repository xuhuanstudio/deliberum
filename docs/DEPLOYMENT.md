# Deployment

## Modes

- local CLI only;
- local daemon + Web UI;
- SSH remote daemon with port forwarding;
- single-user server;
- team server with Postgres;
- container deployment.

## Default local mode

```bash
deliberum serve --host 127.0.0.1 --port 3877
```

## SSH mode

```bash
ssh -L 3877:127.0.0.1:3877 user@server
```

Then open `http://127.0.0.1:3877` locally.

## Storage

- SQLite by default;
- Postgres for team/server deployments later.

## Web UI

The daemon should be able to serve the built Web UI assets.
