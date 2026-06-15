# v1.0 Storage Compatibility and Recovery Audit

Date: 2026-06-16

This audit closes production readiness Gate 11 for the current v1.0 supported
local-first scope. It verifies that Deliberum has a documented and tested
storage compatibility, backup, restore, and failure-recovery path for outside
users running the local Web product.

This batch did not add a new storage subsystem. It fixed the first reproduced
Deliberum-side recovery blocker: the daemon CLI process did not release the
SQLite process lock on SIGINT or SIGTERM, so a freshly restored SQLite backup
could fail immediately with an active-lock error. The CLI entrypoint now closes
the started daemon on SIGINT and SIGTERM, reusing the existing server close hook
that closes runtime stores and releases the SQLite process lock.

## Gate 11 Scope

Gate 11 covers the v1.0 source-checkout local product path:

1. `corepack pnpm start:local`;
2. daemon-served built Web assets;
3. SQLite local daemon state at `.deliberum/deliberum.sqlite` by default;
4. JSON event/run stores as local development and compatibility paths;
5. safe failure behavior for unsupported schema versions and invalid persisted
   data;
6. documented backup and restore runbooks.

Gate 11 does not claim production distributed storage, Postgres support,
multi-writer coordination, hosted multi-user deployments, or automatic future
schema migrations.

## Compatibility Policy

`docs/STORAGE_RECOVERY.md` records the v1.0 policy:

- persisted schema version `1` is supported;
- unsupported future versions are rejected rather than modified;
- corrupted JSON, invalid persisted run records, invalid SQLite records, and
  invalid event integrity hashes fail closed;
- v1.0 does not perform silent destructive migrations;
- future persisted-schema changes must document migration and backup
  requirements before users open existing local data.

## Reproduced Blocker

`smoke:storage-recovery` first failed on the restored daemon:

```text
SQLite daemon process lock is already held by another active daemon.
```

The source daemon had been stopped with SIGTERM before the backup was copied,
but the CLI entrypoint had allowed the process to exit without calling the
server close hook. The SQLite process-lock row therefore remained active inside
the database copy. Because the smoke uses a long stale-lock timeout to model an
immediate restore, the restored daemon correctly refused to open the database.

The fix is intentionally narrow: the CLI entrypoint stores the `startDaemon()`
result and handles SIGINT and SIGTERM by calling `daemon.server.close()`. The
existing server close hook releases the SQLite process lock and closes runtime
stores.

## Automated Evidence

Command added to default CI:

```bash
corepack pnpm smoke:storage-recovery
```

Coverage:

1. Starts a SQLite-backed daemon with the optional SQLite process lock enabled.
2. Creates and completes a local preset discussion.
3. Verifies the source daemon can read the run catalog, run record, run events,
   projections, compiled current conclusion, deployment posture, valid ledger
   integrity, and operation audit.
4. Stops the daemon through SIGTERM, which now releases runtime stores and the
   SQLite process lock.
5. Copies the SQLite database and any WAL sidecar files into a backup location.
6. Restores those files to a new SQLite path.
7. Starts a second daemon from the restored database.
8. Verifies the restored daemon reads the same run catalog, run record, run
   events, projections, compiled current conclusion, configured-store posture,
   valid ledger integrity, and matching hashed event counts.

Result:

- `smoke:storage-recovery`: passed after the SIGTERM process-lock release fix.

Supporting tests:

- `packages/storage/test/sqlite-event-store.test.ts` covers SQLite event
  persistence, sequence behavior, integrity-hash validation, unsupported schema
  rejection, busy writer errors, and append-only API boundaries.
- `packages/storage/test/json-file-event-store.test.ts` covers JSON ledger
  persistence, atomic temp-file writes, corrupted JSON rejection, unsupported
  schema rejection, invalid persisted events, duplicate ids, duplicate
  sequences, sequence gaps, and integrity checks.
- `apps/daemon/test/sqlite-run-store.test.ts` covers SQLite run metadata
  persistence, concurrent connection behavior, unsupported schema rejection,
  and update invariants.
- `apps/daemon/test/json-file-run-store.test.ts` covers JSON run metadata
  persistence, atomic temp-file writes, corrupted files, unsupported schema
  rejection, invalid runs, duplicate run ids, and duplicate session ids.
- `apps/daemon/test/sqlite-resource-broker.test.ts` covers SQLite resource
  metadata and explicit hosted content continuity plus unsupported schema
  rejection.
- `apps/daemon/test/sqlite-resource-access-store.test.ts` covers SQLite access
  grant continuity, token-hash storage, revocation persistence, expired grant
  cleanup, unsafe input rejection, busy writer errors, and unsupported schema
  rejection.
- `apps/daemon/test/sqlite-daemon-process-lock.test.ts` covers concurrent owner
  rejection, release, stale-lock recovery, and invalid lock settings.
- `apps/daemon/test/daemon.test.ts` covers daemon-level SQLite event/run
  continuity, resource access continuity, hosted content continuity, operation
  audit continuity/retention, deployment posture, resource access posture, and
  ledger integrity diagnostics.

## Gate 11 Result

Gate 11 is complete for the v1.0 supported local-first scope.

The current release has a documented, tested path for local users to back up,
restore, and verify SQLite-backed Deliberum state. It also fails closed for
unsupported schema versions and invalid persisted data instead of silently
modifying unknown storage.

## Post-v1.0 Storage Backlog

- Automatic migrations for future persisted schema versions.
- Packaged backup and restore commands in the CLI.
- Production distributed database support.
- Production multi-writer coordination.
- Remote hosted multi-user storage and authorization.
- Cross-machine secure provider-secret migration.
