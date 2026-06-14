# Basic Product Loop Completion Matrix

Deliberum should converge around one primary local-first product loop before new
subsystems are added. This matrix is the gate for Web, setup, model readiness,
discussion, conclusion, and documentation work.

The primary loop is:

```text
open Web
  -> understand Deliberum
  -> see local service status
  -> start service if needed
  -> configure an OpenAI-compatible provider in Web
  -> verify connection
  -> start a model-backed discussion
  -> see readable participant perspectives, strongest options, open disagreements,
     evidence gaps, risks, current conclusion, and next actions
  -> continue or update the discussion using user-facing actions
```

## Status Rules

Use only these status values:

| Status | Meaning |
| --- | --- |
| `verified` | The step is implemented, has direct automated coverage, and has been browser-verified on the current default path. |
| `partial` | The step exists, but real-use coverage, UX continuity, edge cases, or end-to-end proof is incomplete. |
| `confusing` | The step exists, but normal users may see internal language, unclear actions, or misleading state. |
| `missing` | The default Web path does not provide the step. |
| `not browser-verified` | The step appears implemented or tested, but the current browser path has not been verified. |

When evidence is uncertain, mark the step as `partial` or `not browser-verified`.
Do not mark a step `verified` because it is plausible or because a narrower unit
test passed.

## Current Matrix

Updated: 2026-06-15.

| # | Product loop step | Current status | Current evidence | Highest-priority gap |
| --- | --- | --- | --- | --- |
| 1 | Open the Web UI. | `partial` | README quickstart points users to `http://127.0.0.1:5173/`; Web tests cover the shell and landing readiness states. | Needs a repeatable browser walkthrough from a clean local start. |
| 2 | Understand within 30 seconds that Deliberum is a multi-perspective deliberation product. | `not browser-verified` | README and default Web copy describe the human-first product. | Needs first-viewport browser verification for desktop and mobile. |
| 3 | See whether the local service is connected. | `partial` | Web setup and landing tests cover connected and unavailable local service states. | Needs product-loop walkthrough evidence from a fresh service start. |
| 4 | If the local service is not connected, understand how to start it. | `partial` | Web onboarding copy and README show local service start commands. | Needs browser verification from the service-unavailable state. |
| 5 | Configure an OpenAI-compatible provider from Web: API key, base URL, and model. | `partial` | `/setup/models` supports provider setup fields and tests cover saving without showing secrets. | Needs real-provider or safe mock-provider browser walkthrough covering save, reload, and hidden secrets. |
| 6 | Verify the provider connection. | `partial` | Web and daemon tests cover provider verification and recent commits require verification before model-backed starts. | Needs browser walkthrough evidence that verification is the natural next action before starting. |
| 7 | Start a model-backed discussion from Web. | `partial` | `/runs/new?participants=model-backed` is tested, including the verified-provider gate. | Needs end-to-end browser walkthrough after setup verification. |
| 8 | See participant/model perspectives as readable contributions, not raw events. | `partial` | Discussion Room tests and walkthrough document cover readable room contributions. | Needs model-backed walkthrough evidence, not only deterministic demo or component tests. |
| 9 | See strongest current options. | `partial` | Discussion Room and outcome tests render strongest options/main perspectives in user language. | Needs end-to-end proof that model-backed discussions populate this section clearly. |
| 10 | See open disagreements. | `partial` | Web tests cover open disagreements and empty states. | Needs walkthrough evidence for both present and empty disagreement states. |
| 11 | See missing evidence or evidence gaps. | `partial` | Web tests cover evidence gaps, resources, and outcome evidence sections. | Needs walkthrough evidence that evidence gaps are visible before a user relies on the conclusion. |
| 12 | See risks. | `partial` | Web tests cover risks and recent outcome display hides internal source language from default view. | Needs walkthrough evidence that risk review stays visible in the room and outcome views. |
| 13 | See the current conclusion. | `partial` | Outcome pages render user-facing conclusion summaries; tests cover default hiding of internal projection/event terms. | Needs model-backed walkthrough evidence that conclusion material appears after continuing the discussion. |
| 14 | See next recommended actions. | `partial` | Outcome and room tests render next recommended actions. | Needs walkthrough evidence that next actions point to user-facing continuation actions. |
| 15 | Continue or update the discussion using user-facing actions. | `partial` | Web action labels include Continue discussion, Ask for stronger options, Review disagreements, Check evidence, and Update conclusion. | Highest current product gap: prove a normal user can use these actions to move from first responses to a reviewable conclusion. |
| 16 | Complete the default path without seeing run/session/ledger/runtime/proposal/event/internal ids, raw JSON, env details, provider config ids, or secrets. | `partial` | Tests cover known default views and recent fixes hide internal outcome wording while preserving Advanced details. | Needs broad browser audit across setup, start, room, outcome, unavailable, paused, retry, and error states. |

## Batch Gate

Every product-facing batch must declare one row from the matrix before
implementation starts.

A batch should proceed only if it satisfies all of these checks:

1. It improves one of the 16 loop steps, or it adds evidence that makes a step's
   status more accurate.
2. It targets the highest-impact `missing`, `confusing`, `partial`, or
   `not browser-verified` item that is practical for the current batch.
3. It does not add runtime, daemon, audit, adapter, auth, resource, provider, or
   infrastructure capability unless the selected row cannot work without it.
4. It keeps the default Web path human-first and keeps low-level details behind
   Advanced / Developer Mode.
5. It includes focused automated tests when behavior or visible text changes.
6. It includes browser verification when a Web path changes or when the selected
   row is marked `not browser-verified`.
7. It updates this matrix when the evidence or status changes.

If a proposed change cannot name a matrix row, defer it.

## Verification Standard

For a row to become `verified`, record evidence that covers the real scope of
the row:

- automated test names or commands;
- browser path, viewport, and local service/provider setup used;
- whether Advanced / Developer Mode was checked separately;
- whether secrets and internal identifiers remained hidden from the default
  view;
- commit hash or pull request that introduced the evidence.

Do not use a narrow component test as proof of a full product-loop step. Use it
as supporting evidence only.

## Next Highest-Value Batch

The current highest-value convergence batch is not another isolated UI copy
fix. It is a repeatable browser walkthrough for rows 5 through 15:

1. start the local service;
2. open Web;
3. configure an OpenAI-compatible provider from Web;
4. verify the connection;
5. start a model-backed discussion;
6. continue the discussion until first responses and review material are visible;
7. review strongest options, disagreements, evidence gaps, risks, current
   conclusion, and next actions;
8. confirm the default path does not expose secrets or internal ids.

If that walkthrough fails, fix the first blocking row with the smallest
verifiable change.
