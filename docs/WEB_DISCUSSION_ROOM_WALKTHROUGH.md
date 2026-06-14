# Web Discussion Room Walkthrough

This walkthrough verifies the default human-first Web path. It is intended for maintainers, reviewers, and first-time contributors who want to confirm that Deliberum behaves like a discussion product instead of an engineering console.

## Goal

A first-time user should be able to:

- open the Web UI and understand that Deliberum is a multi-perspective deliberation tool;
- start a discussion without reading protocol docs;
- see a readable discussion brief;
- see participant/model perspectives as discussion contributions;
- follow the discussion timeline;
- review strongest current options, open disagreements, missing evidence, risks, current conclusion, and next recommended actions;
- continue or update the discussion using user-facing actions;
- inspect low-level daemon and ledger details only from Advanced / Developer Mode.

## Local startup

Build the workspace first:

```bash
corepack pnpm build
```

Start the local daemon with the deterministic local preset profile:

```bash
DELIBERUM_ENABLE_LOCAL_PRESET=true node apps/daemon/dist/index.js
```

In another terminal, start the Web UI:

```bash
corepack pnpm --filter @deliberum/web dev
```

Open:

```text
http://127.0.0.1:5173/runs/new
```

The local preset profile is for development and review only. It makes the walkthrough deterministic without using real provider credentials.

## Walkthrough

1. Start a discussion.

   Use the guided start form or the built-in sample brief. When a provider is ready, choose demo or model-backed participants and select whether the discussion should use a focused or broader set of independent model perspectives. The visible action should say Start a discussion, not execute proposal, start run, or compile projection. Advanced JSON request details should stay collapsed.

2. Read the discussion brief.

   The room should explain the topic, goals, constraints, participants, and expected output in plain language. A normal user should not need to know that this is backed by a Topic Contract.

3. Follow the discussion timeline.

   Participant/model perspectives should appear as readable contributions with understandable speaker names such as Perspective A, Perspective B, Reviewer, or Evidence checker. Raw ledger events and internal ids belong in Advanced / Developer Mode.

4. Review the decision workspace.

   The current conclusion, open disagreements, missing evidence, risks, and next recommended actions should remain easy to scan while reading the room.

5. Continue the discussion.

   Use user-facing actions such as Continue discussion, Ask for stronger options, Review disagreements, Check evidence, and Update conclusion when ready. These actions may reuse daemon-backed run controls, but the default UI should describe what the user is trying to accomplish, not the backend operation name.

6. Inspect Advanced / Developer Mode only when needed.

   Daemon status, runtime profile, deployment posture, resource access posture, operation audit metadata, ledger events, raw JSON, and internal ids should be available for maintainers without leading the normal user path.

## Expected visible language

The default Web UI should prefer this vocabulary:

| User-facing phrase | Internal concept |
| --- | --- |
| Discussion brief | Topic Contract |
| Independent first responses | Sealed Divergence |
| Strongest current options | Candidate Frontier |
| Open disagreements | Objections |
| Requirements this answer must satisfy | Quality Obligations |
| Evidence and verification | Evidence Checks |
| Risk review | Final Audit |
| Current conclusion | Outcome Compilation |

## Checks

Run these checks before merging Web discussion-room changes:

```bash
corepack pnpm lint:language
corepack pnpm lint:docs
corepack pnpm --filter @deliberum/web typecheck
corepack pnpm --filter @deliberum/web test
```

For broad release or CI confidence, run:

```bash
corepack pnpm ci
```

Browser verification should include desktop and mobile widths. Confirm that the default path does not expose raw run, session, projection, ledger, event, proposal, runtime, resource, or internal ids outside Advanced / Developer Mode.
