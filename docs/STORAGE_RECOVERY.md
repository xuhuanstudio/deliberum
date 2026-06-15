# Storage Compatibility and Recovery

This document defines the v1.0 local-first storage compatibility and recovery
policy for Deliberum.

Deliberum v1.0 supports a source-checkout local product path. It is not a
hosted multi-user storage service, a distributed database system, or a
production multi-writer coordination layer.

## Supported v1.0 Storage Paths

The supported local Web path is:

```bash
corepack pnpm build
corepack pnpm start:local
```

`start:local` stores local daemon state in `.deliberum/deliberum.sqlite` unless
`DELIBERUM_DAEMON_SQLITE_PATH` is already set.

When SQLite is configured, the daemon stores these local state classes in the
same SQLite database:

- session ledger events;
- run metadata;
- explicitly registered resource broker metadata and hosted content;
- resource access grant state;
- safe operation audit metadata.

For local development fallback without SQLite, the daemon can also use JSON
files for event ledger, run metadata, and operation audit persistence when the
matching paths are configured. JSON stores remain a development and
compatibility path. The v1.0 local Web release path should use SQLite.

## Compatibility Policy

Deliberum v1.0 follows this persisted storage policy:

- schema version `1` is the supported persisted schema;
- future schema versions are rejected instead of silently modified;
- corrupted JSON, invalid persisted records, duplicate ids, sequence gaps, and
  invalid event integrity chains fail closed;
- there is no silent destructive migration in v1.0;
- future schema changes must document migration and backup requirements before
  users open existing local data.

## Backup Runbook

Stop the local service before copying the database:

```bash
# In the terminal running Deliberum:
# press Ctrl+C
```

Then copy the SQLite database and any sidecar files:

```bash
BACKUP_DIR=.deliberum/backups/$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
cp .deliberum/deliberum.sqlite* "$BACKUP_DIR"/
```

Keep the main `.sqlite` file together with any `-wal` and `-shm` sidecar files
created by SQLite WAL mode.

## Restore Runbook

Stop Deliberum before restoring:

```bash
# In the terminal running Deliberum:
# press Ctrl+C
```

Restore the backed-up files:

```bash
cp "$BACKUP_DIR"/deliberum.sqlite* .deliberum/
```

Start Deliberum again:

```bash
corepack pnpm start:local
```

After restore, verify that the local service can read the restored state:

```bash
curl -fsS http://127.0.0.1:3877/health
node apps/cli/dist/index.js daemon ledger-integrity --json
node apps/cli/dist/index.js daemon deployment-posture --json
```

`ledger-integrity` should report `status: "valid"` for the restored event
ledger. `deployment-posture` should continue to report configured-store
persistence for the SQLite-backed state classes.

## Failure Recovery

If the local service does not start after restore:

1. Make sure no other Deliberum daemon is using the same SQLite file.
2. Make sure the main database file and any WAL sidecar files were copied
   together.
3. Run `node apps/cli/dist/index.js daemon ledger-integrity --json` after the
   service starts to check event integrity.
4. If the database was restored from a future Deliberum version, keep the
   backup unchanged and upgrade Deliberum instead of forcing the current version
   to open it.

The optional SQLite process lock protects against two daemon processes using
the same local database at the same time. Deliberum now closes the daemon
cleanly on SIGINT and SIGTERM so the lock is released before a backup or
restore restart. If the process crashes, the lock can recover after its stale
timeout.

## Automated Recovery Evidence

The default CI now includes:

```bash
corepack pnpm smoke:storage-recovery
```

The smoke:

1. starts a SQLite-backed daemon with the SQLite process lock enabled;
2. creates and completes a local preset discussion;
3. reads the run catalog, run record, run events, projections, current
   conclusion, deployment posture, ledger integrity, and operation audit;
4. stops the daemon through SIGTERM;
5. copies the SQLite database and WAL sidecar files;
6. starts a second daemon from the restored database;
7. verifies the restored daemon reads the same run and event counts with valid
   ledger integrity and configured-store persistence.

This smoke does not add a new storage backend. It is release evidence for the
supported local SQLite recovery path.

## Not in v1.0 Scope

The following remain post-v1.0 work:

- automatic migrations for future persisted schema versions;
- packaged backup and restore CLI commands;
- production distributed database support;
- production multi-writer coordination;
- hosted multi-user storage and authorization;
- cross-machine secure provider-secret migration.
