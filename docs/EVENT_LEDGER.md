# Event Ledger

Deliberum is event-ledger first. The event ledger is the durable source of truth; projections such as candidate frontiers, objection ledgers, whiteboard views, summaries, and final drafts are derived views.

## Invariants

1. Events are append-only.
2. Events are never edited in place.
3. Semantic changes are represented by new events.
4. High-risk semantic changes become proposals, not direct mutations.
5. Projections must be rebuildable from the ledger.
6. Every projection must expose the event range and projection version it was derived from.
7. Every adapter call must be traceable to a context capsule and participant profile.
8. Sealed-batch events must remain hidden until the batch is revealed.
9. Deleted or redacted material must leave a redaction tombstone.
10. Local runtime artifacts must not be committed.

Event stores assign `sequence` and `recordedAt` at append time. Corrections, reveals, challenges, acceptances, audits, and redactions are represented by new events, not updates to old events.

## Event envelope

```ts
type EventEnvelope<TPayload> = {
  id: string
  sessionId: string
  schemaVersion: string
  type: string
  sequence: number
  authorId: string | 'system'
  createdAt: string
  recordedAt: string
  basedOnEventIds: string[]
  batchId?: string
  visibility: 'public' | 'sealed' | 'private' | 'redacted'
  idempotencyKey?: string
  integrity?: {
    previousEventHash?: string
    eventHash?: string
  }
  trace: {
    adapterId?: string
    participantId?: string
    modelId?: string
    contextCapsuleId?: string
    resourceDeliveryIds?: string[]
    promptHash?: string
    rawOutputHash?: string
  }
  payload: TPayload
}
```

`trace` is required at the top level. Its nested fields may be empty when an event has no adapter/tool provenance.

Event stores assign `integrity.eventHash` at append time using a stable
SHA-256 hash of the event envelope without `integrity.eventHash`. Events after
the first event in a session also include `integrity.previousEventHash`, which
links to the previous event's stable hash. The JSON file and SQLite event stores
validate persisted hashed chains on load while still accepting older events that
do not carry integrity metadata. These hashes are local tamper-evidence
metadata; they are not distributed consensus, production notarization, or
multi-writer coordination.

## Projection metadata

Projection result objects include:

```ts
type ProjectionMetadata = {
  version: '1'
  eventRange: { fromSequence: number; toSequence: number } | null
  eventIds: string[]
}
```

`eventIds` are ordered by the sequence order used to derive the projection. Empty projections use `eventRange: null` and `eventIds: []`.

## Proposal-first semantic updates

These operations must not directly overwrite state:

- merging candidates;
- marking an objection resolved;
- waiving a quality obligation;
- ranking candidates;
- accepting a summary as complete;
- moving a candidate out of the frontier;
- compiling a final outcome.

They must be expressed as proposal events and can be challenged.

## Redaction

Redaction is allowed for security, privacy, or legal reasons, but it must be represented as a new event. The system should preserve IDs, timestamps, and non-sensitive metadata where possible so references do not silently break.
