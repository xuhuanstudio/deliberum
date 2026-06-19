# Web Discussion Room Walkthrough

This walkthrough verifies the default human-first Web path. It is intended for maintainers, reviewers, and first-time contributors who want to confirm that Deliberum behaves like a discussion product instead of an engineering console.

Use this document together with the [Basic Product Loop Completion Matrix](BASIC_PRODUCT_LOOP.md).
The matrix is the acceptance gate for the full setup-to-conclusion loop; this
walkthrough focuses on the Discussion Room portion of that loop.

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

Start the local Web product:

```bash
corepack pnpm start:local
```

Open:

```text
http://127.0.0.1:3877/runs/new
```

The local start path serves the built Web UI from the local daemon, keeps local
state under `.deliberum/`, and enables the local preset profile for development
and review. The local preset makes the walkthrough deterministic without using
real provider credentials.

## Walkthrough

1. Start a new discussion.

   Use the guided start form or the built-in sample brief. When a provider is ready, choose demo or model-backed participants and select whether the discussion should use a focused or broader set of independent model perspectives. The visible action should say New Discussion, not execute proposal, start run, or compile projection. Advanced JSON request details should stay collapsed.

2. Read the discussion brief.

   The room should explain the topic, goals, constraints, participants, and expected output in plain language. A normal user should not need to know that this is backed by a Topic Contract.

3. Follow the discussion timeline.

   Participant/model viewpoints should appear as readable contributions with understandable speaker names such as First viewpoint, Alternative viewpoint, Skeptic, or Evidence checker. Raw ledger events and internal ids belong in Advanced / Developer Mode.

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

When this walkthrough changes the evidence for the full product loop, update
the status and evidence in [Basic Product Loop Completion Matrix](BASIC_PRODUCT_LOOP.md).
