# Data Model

This document describes the core protocol data model implemented in `packages/protocol` with runtime validation.

## Design rules

- Data structures are protocol objects, not UI state.
- Projections are rebuildable from ledger events.
- Semantic updates use proposals instead of silent overwrites.
- Every adapter-generated contribution must carry trace metadata.
- Precise references must include enough context to avoid quote-mining.
- Event stores assign `sequence` and `recordedAt`; append callers do not supply them.

## EventEnvelope

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
  payload: TPayload
  trace: {
    adapterId?: string
    participantId?: string
    modelId?: string
    contextCapsuleId?: string
    resourceDeliveryIds?: string[]
    promptHash?: string
    rawOutputHash?: string
  }
  integrity?: {
    previousEventHash?: string
    eventHash?: string
  }
}
```

`eventHash` and `previousEventHash` are reserved for future tamper-evident ledger support. Current in-memory and CLI JSON stores do not compute cryptographic event hashes and should not be described as tamper-evident.

## TopicContract

```ts
type TopicContract = {
  id: string
  title: string
  topic: string
  goals: string[]
  constraints: string[]
  outputExpectations: string[]
  participantIds: string[]
  allowedAdapters: string[]
  budgetLease: BudgetLease
  governanceRules: GovernanceRule[]
  resourcePolicy?: ResourcePolicy
}
```

## Participant

```ts
type Participant = {
  id: string
  kind: 'human' | 'model' | 'tool' | 'external_system' | 'manual_bridge' | 'webget'
  displayName: string
  adapterId?: string
  profileId?: string
  capabilities?: ParticipantCapabilities
  reliabilityNotes?: string[]
}
```

## Batch

```ts
type SealedBatch = {
  id: string
  sessionId: string
  purpose: 'initial_divergence' | 'relation_mapping' | 'final_contest' | 'blind_reframe'
  status: 'open' | 'sealed' | 'revealed' | 'cancelled'
  participantIds: string[]
  openedAt: string
  revealedAt?: string
  revealPolicy: 'all_completed' | 'manual' | 'quorum' | 'deadline'
}
```

`all_completed` and `manual` close behavior is implemented today. `quorum` and `deadline` are accepted protocol values but close attempts using them are rejected as unsupported in the current core lifecycle.

## Candidate

```ts
type Candidate = {
  id: string
  title: string
  description: string
  sourceEventIds: string[]
  status: 'active' | 'revised' | 'absorbed' | 'rejected' | 'forked' | 'archived'
  supportedBy: string[]
  attackedBy: string[]
  qualityObligationIds: string[]
  assumptions: string[]
  tradeoffs: string[]
  applicableWhen?: string[]
}
```

## Claim

```ts
type Claim = {
  id: string
  content: string
  scope: 'factual' | 'design' | 'preference' | 'risk' | 'process' | 'definition'
  sourceEventIds: string[]
  supports?: string[]
  dependsOn?: string[]
  challengedBy?: string[]
}
```

## Objection

```ts
type Objection = {
  id: string
  targetId: string
  failureMode: string
  consequence: string
  severityClaim: 'minor' | 'major' | 'blocking'
  status: 'open' | 'answered' | 'partially_answered' | 'accepted' | 'downgraded' | 'unresolved' | 'archived'
  sourceEventIds: string[]
  responses?: string[]
}
```

## QualityObligation

```ts
type QualityObligation = {
  id: string
  scope: 'topic' | 'candidate' | 'branch' | 'final_output'
  targetCandidateId?: string
  requirement: string
  status: 'unanswered' | 'answered' | 'partially_answered' | 'challenged' | 'waived' | 'unresolved'
  sourceEventIds: string[]
  supportingRefIds: string[]
  unresolvedObjectionIds: string[]
  waiverReason?: string
}
```

## EvidenceNeed and EvidenceResult

```ts
type EvidenceNeed = {
  id: string
  targetClaimId: string
  requiredKind: 'web' | 'paper' | 'file' | 'code' | 'calculation' | 'human_confirmation' | 'tool'
  reason: string
  priority: 'low' | 'medium' | 'high'
  status: 'open' | 'in_progress' | 'satisfied' | 'waived' | 'unresolved'
  sourceEventIds: string[]
}

type EvidenceResult = {
  id: string
  evidenceNeedId: string
  source: string
  summary: string
  resourceIds?: string[]
  limitations: string[]
  challengedBy?: string[]
}
```

## Proposal types

```ts
type ProcessProposal = {
  id: string
  primitive: string
  targetIds: string[]
  expectedQualityGain: string
  riskIfSkipped: string
  requestedBudget?: BudgetLease
  status: 'proposed' | 'accepted' | 'challenged' | 'deferred' | 'rejected'
}

type SummaryProposal = {
  id: string
  includedEventIds: string[]
  omittedEventIds: string[]
  summary: string
  rationale: string
  status: 'proposed' | 'challenged' | 'accepted_for_now' | 'rejected'
}

type MergeProposal = {
  id: string
  targetIds: string[]
  mergedObjectDraft: unknown
  reason: string
  status: 'proposed' | 'challenged' | 'accepted_for_now' | 'rejected'
}
```

## Reference

References must support precision and context.

```ts
type Reference = {
  id: string
  targetId: string
  targetType:
    | 'message'
    | 'text_span'
    | 'candidate'
    | 'claim'
    | 'objection'
    | 'evidence'
    | 'board_node'
    | 'board_edge'
    | 'board_region'
    | 'resource'
    | 'version'
  targetVersion?: string
  selector?: {
    type: 'paragraph' | 'sentence' | 'clause' | 'char_range' | 'object_part' | 'board_selection'
    value: unknown
  }
  relation: 'mentions' | 'replies_to' | 'supports' | 'attacks' | 'depends_on' | 'challenges' | 'revises' | 'asks_about'
  contextPolicy: 'minimal' | 'local' | 'parent' | 'expanded' | 'full_trace'
  quoteSnapshot?: string
}
```

## Resource

```ts
type Resource = {
  id: string
  kind: 'image' | 'pdf' | 'audio' | 'video' | 'html' | 'text' | 'file' | 'board_snapshot'
  mime: string
  sizeBytes: number
  hash: string
  privacy: 'public' | 'private' | 'sensitive'
  variants: ResourceVariant[]
}

type ResourceVariant =
  | { mode: 'url'; url: string; exposure: 'localhost' | 'lan' | 'public'; expiresAt?: string }
  | { mode: 'base64'; mime: string; dataRef: string; sizeBytes: number }
  | { mode: 'summary'; text: string }
  | { mode: 'ocr'; text: string }
  | { mode: 'caption'; text: string }
```

## Projection metadata

Projection result objects include traceability metadata:

```ts
type ProjectionMetadata = {
  version: '1'
  eventRange: { fromSequence: number; toSequence: number } | null
  eventIds: string[]
}
```

Current core projections return:

- `projectExtractionProposalStates`: `{ proposalStates, projection }`;
- `projectAcceptedDeliberationObjects`: `{ candidates, claims, objections, evidenceNeeds, qualityObligations, projection }`;
- `projectCandidateFrontier`: `{ basis: 'accepted_active_candidates', candidates, projection }`;
- `projectQualityObligations`: `{ qualityObligations, projection }`.

## Board objects

Whiteboard data is a projection layer, not semantic truth.

```ts
type BoardObject = {
  id: string
  kind: 'topic' | 'candidate' | 'claim' | 'objection' | 'evidence' | 'risk' | 'question' | 'decision' | 'process' | 'branch'
  title: string
  body?: string
  sourceEventIds: string[]
  status?: 'draft' | 'open' | 'challenged' | 'accepted_for_now' | 'rejected' | 'resolved'
}

type BoardRelation = {
  id: string
  from: string
  to: string
  relation: 'supports' | 'attacks' | 'depends_on' | 'duplicates' | 'contradicts' | 'refines' | 'answers' | 'replaces'
  sourceEventIds: string[]
}
```
