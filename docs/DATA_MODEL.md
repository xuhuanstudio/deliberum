# Data Model

This document describes the core protocol data model implemented in `packages/protocol` with runtime validation.

## Design rules

- Data structures are protocol objects, not UI state.
- Projections are rebuildable from ledger events.
- Semantic updates use proposals instead of silent overwrites.
- Every adapter-generated contribution must carry trace metadata.
- Precise references must include enough context to avoid quote-mining.
- Event stores assign `sequence`, `recordedAt`, and integrity hashes; append callers do not supply them.

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

Event stores assign `integrity.eventHash` at append time using a stable SHA-256 hash of the event envelope without `integrity.eventHash`. Events after the first event in a session also include `integrity.previousEventHash`, which links to the previous event's stable hash. The JSON file and SQLite event stores validate persisted hashed chains on load while still accepting older events that do not carry integrity metadata. These hashes are local tamper-evidence metadata; they are not distributed consensus, production notarization, or multi-writer coordination.

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

`BudgetLease` is an extensible JSON object with validated standard fields:
`maxEvents`, `maxProviderCalls`, `maxEstimatedCostCents`, `maxRunSeconds`,
`participantTimeoutMs`, and `overallTimeoutMs`. Standard count and cost fields
are nonnegative or positive integers as appropriate; extension fields must still
be JSON-safe values.

`GovernanceRule` is an extensible JSON object with validated standard fields:
`id`, `description`, `orchestratedRun`, `runSchemaVersion`,
`sealedDivergencePurpose`, `sealedDivergenceRevealPolicy`, and
`requiresExplicitProcessDecisions`. A governance rule records process
constraints; it does not create a central judge or hidden scheduler.

`ResourcePolicy` is an extensible JSON object with optional `resourceRefs`.
Each reference has a `resourceId` and may include `required`,
`preferredDeliveryMode`, `allowedDeliveryModes`, `maxBase64SizeBytes`, and
`allowHostedContentUrl`. Resource policy fields describe delivery constraints;
delivery material remains response-only or access-layer state.

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

`ParticipantCapabilities` is an extensible JSON object with optional `input`,
`output`, `limits`, `reliability`, and `notes` fields. It can express common
adapter capabilities such as text, JSON, URL, structured JSON, streaming, and
manual paste support while preserving JSON-safe extension fields for adapters
that need more detail. Capabilities describe what an adapter can handle; they do
not make adapter output authoritative.

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
  quorumCount?: number
  deadlineAt?: string
}
```

Reveal policy metadata is explicit. `all_completed` closes after every listed
participant contributes, `manual` closes on an explicit close request,
`quorum` closes after `quorumCount` unique contributors have submitted, and
`deadline` closes at or after `deadlineAt`. When `participantIds` is non-empty,
only listed participants may submit. When it is empty, any participant-authored
sealed contribution can count toward a quorum.

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

`evidence_result_recorded` records a reported result for an accepted
EvidenceNeed. The outcome compiler treats matching evidence needs as
`reported`, not verified; limitations and later challenges remain visible.

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

type FinalCandidateProposal = {
  id: string
  candidateIds: string[]
  alternativeCandidateIds: string[]
  sourceEventIds: string[]
  recommendation: string
  applicabilityConditions: string[]
  rationale: string
  limitations: string[]
  status: 'proposed' | 'challenged' | 'accepted_for_now' | 'rejected'
}

type FinalAudit = {
  id: string
  targetFinalCandidateProposalEventId: string
  findings: string[]
  risks: string[]
  unresolvedObjectionIds: string[]
  qualityObligationIds: string[]
  evidenceNeedIds: string[]
  omissions: string[]
  compressionProblems: string[]
  limitations: string[]
  continuationSuggestions: string[]
  status: 'recorded'
}
```

Final candidate proposals and final audits are ledger material, not final truth. Outcome compilation is a derived projection over the ledger and accepted-object projections. It preserves alternatives, unresolved objections, evidence status, audit records, limitations, continuation suggestions, and provenance; it must not add winner, score, vote, current-best, or final-answer fields.

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

Resource delivery planning records safe audit events:

```ts
type ResourceDeliveryPlannedPayload = {
  id: string
  resourceId: string
  participantId: string
  resource: {
    kind: Resource['kind']
    mime: string
    sizeBytes: number
    hash: string
    privacy: Resource['privacy']
  }
  request: {
    policy?: {
      requestedMode?: 'url' | 'base64' | 'none'
      preferredModes?: Array<'url' | 'base64' | 'none'>
      allowLocalhostUrl?: boolean
      allowLanUrl?: boolean
      allowPublicUrl?: boolean
      allowBase64?: boolean
      maxBase64SizeBytes?: number
      allowHostedContentUrl?: boolean
      maxHostedContentSizeBytes?: number
    }
  }
  result: {
    selectedMode: 'url' | 'base64' | 'none'
    allowed: boolean
    reason: string
    warnings: string[]
    materialKind?: 'url' | 'base64'
  }
}
```

The audit payload records the delivery decision and material kind only. It does not store delivered URLs, bearer access ids, base64 bytes, data refs, or resource text.

Resource access grant lifecycle audit events are separate from delivery planning events:

```ts
type ResourceAccessGrantSummary = {
  mode: 'redirect' | 'content'
  exposure: 'localhost' | 'lan' | 'public'
  tokenHash: string
  expiresAt: string
  content?: {
    mime: string
    sizeBytes: number
    hash: string
  }
}

type ResourceAccessGrantCreatedPayload = {
  id: string
  resourceAccessId: string
  resourceId: string
  participantId: string
  resource: ResourceDeliveryPlannedPayload['resource']
  grant: ResourceAccessGrantSummary
}

type ResourceAccessGrantRevokedPayload = {
  id: string
  resourceAccessId: string
  resourceId: string
  participantId: string
  grant: ResourceAccessGrantSummary
  revokedAt: string
}
```

`resourceAccessId` is a non-bearer audit identifier. Bearer access ids, source URLs, base64 bytes, data refs, and resource text are response-only or access-layer material and are not stored in these events.

The daemon resources projection exposes these events as safe delivery audit views:

```ts
type SessionResourceDeliveryAuditView = {
  eventId: string
  sequence: number
  createdAt: string
  recordedAt: string
  basedOnEventIds: string[]
  resourceDeliveryId: string
  resourceId: string
  participantId: string
  resource: ResourceDeliveryPlannedPayload['resource']
  request: ResourceDeliveryPlannedPayload['request']
  result: ResourceDeliveryPlannedPayload['result']
}
```

The same projection exposes grant lifecycle events as safe access audit views:

```ts
type SessionResourceAccessAuditView = {
  eventId: string
  sequence: number
  createdAt: string
  recordedAt: string
  basedOnEventIds: string[]
  action: 'created' | 'revoked'
  resourceAccessId: string
  resourceId: string
  participantId: string
  grant: ResourceAccessGrantSummary
  resource?: ResourceDeliveryPlannedPayload['resource']
  revokedAt?: string
}
```

This projection is audit history only. It does not expose delivery material or mark an evidence need as satisfied.

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
- `projectQualityObligations`: `{ qualityObligations, projection }`;
- `compileOutcome`: derived outcome projection with recommendation, alternatives, unresolved material, evidence status, final audit records, and provenance.

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
