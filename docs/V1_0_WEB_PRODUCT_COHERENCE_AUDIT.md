# v1.0 Web Product Coherence Audit

Date: 2026-06-16

This audit closes production readiness Gate 2. It verifies that the default Web
path now reads as one coherent product experience for normal users after the
v1.0 model and participant management scope was closed.

The audit did not find a reproduced Web product-coherence blocker. No Web code,
runtime infrastructure, provider infrastructure, or Advanced / Developer Mode
surface was changed for this gate.

## Gate 2 Scope

Gate 2 requires these default Web surfaces to work together as one product path:

1. first-use landing page;
2. local service status and unavailable-service guidance;
3. Setup / Models;
4. participant readiness and role/model setup;
5. Start Discussion;
6. Discussion Room;
7. Current conclusion.

The default path must let a normal local user understand what Deliberum does,
see whether the local service and models are ready, configure and verify the
supported provider setup, start a discussion, review participant contributions,
and reach conclusion material without learning run, session, ledger, runtime,
proposal, event, projection, provider config id, raw JSON, or environment
details.

## Current Product Flow

The current Web flow is coherent for the v1.0 supported path:

- `/` introduces Deliberum as a multi-perspective deliberation product and shows
  a first-use path from local service readiness to model setup and the
  Discussion Room.
- `/setup/models` shows local service, demo readiness, provider readiness,
  provider setup, provider verification, participant readiness, role defaults,
  and focused or broader model-backed start actions in user language.
- `/runs/new` keeps one-off discussion setup in product language, supports demo
  and model-backed starts, applies saved role defaults, and lets users adjust
  first-response, review role, and perspective models for that discussion.
- `/runs/:runId` presents the Discussion Room with the discussion brief,
  readable participant contributions, strongest options, open disagreements,
  missing evidence, risks, current conclusion status, and next recommended
  actions.
- `/runs/:runId/outcome` presents the current conclusion, supporting evidence
  gaps, risks, and next actions without making the normal user inspect raw
  events or internal ids.

## Browser Evidence

Commands run on 2026-06-16:

```bash
corepack pnpm smoke:web-entry
corepack pnpm smoke:web-product-loop
```

Results:

- `smoke:web-entry`: passed.
- `smoke:web-product-loop`: passed.

Coverage:

- connected landing page on desktop and mobile;
- unavailable local service entry path and Setup / Models recovery guidance;
- first viewport product clarity;
- local service status;
- provider setup form;
- provider verification;
- focused and broader model-backed start links;
- Setup / Models role-default summary and direct role-default editor;
- Start Discussion role/model defaults, overrides, and clear behavior;
- model-backed discussion creation;
- transient continuation pause recovery in normal-user language;
- Discussion Room contributions and output sections;
- current conclusion page;
- default-view scans for secrets, environment names, provider config ids, raw
  JSON, low-level id language, provider values, and raw provider error
  categories.

## Supporting Evidence

- `docs/V1_0_MODEL_PARTICIPANT_MANAGEMENT_AUDIT.md` closes the participant and
  role/model management scope that Gate 2 depends on.
- `apps/web/test/App.test.tsx` covers the default Web pages, Setup / Models,
  participant readiness, role defaults, Discussion Room outputs, outcome
  sections, and Simplified Chinese strings for the new user-facing paths.
- `docs/BASIC_PRODUCT_LOOP.md` records the verified 16-step Basic Product Loop
  for the current local Web path.
- GitHub CI run `27565732161` passed for commit
  `168eef34b179d43c7c9d7328dfeba6076f9dd959` immediately before this audit
  batch.

## Gate 2 Result

Gate 2 is complete for the current v1.0 supported Web scope.

No current evidence shows that the normal default Web path is still fragmented
between first-use setup, model readiness, participant readiness, discussion
start, Discussion Room review, and current conclusion review. Future Web
changes must continue extending the default-view safety scans whenever they add
new default pages, start modes, recovery states, or outcome surfaces.

## Current Matrix Position

Gate 2 remains complete. Later gates have since closed real-provider stability,
provider recovery, default-view safety, Advanced / Developer Mode boundaries,
model and participant management, and storage recovery for the current v1.0
supported scope. Use [v1.0 Production Readiness Matrix](V1_0_PRODUCTION_READINESS_MATRIX.md)
for the current next incomplete gate.

Do not keep looping on Gate 2 docs or copy unless a new Web product-coherence
blocker is reproduced.
