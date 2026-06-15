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
| 1 | Open the Web UI. | `verified` | README quickstart points users to `http://127.0.0.1:5173/`; Web tests cover the shell and landing readiness states. `smoke:web-entry` starts Web from a clean local browser path with both connected and unavailable local service states. | Keep covered; packaging and installer work can improve first-run convenience later. |
| 2 | Understand within 30 seconds that Deliberum is a multi-perspective deliberation product. | `verified` | README and default Web copy describe the human-first product. The landing page now leads with `Multi-perspective deliberation for better decisions`. `smoke:web-entry` verifies desktop and mobile first viewports include Deliberum, multi-perspective deliberation, independent perspectives, strongest options, and reviewable conclusion language. | Keep covered; future visual design work should preserve this first-viewport product signal. |
| 3 | See whether the local service is connected. | `verified` | Web setup and landing tests cover connected and unavailable local service states. `smoke:web-entry` starts a fresh local daemon and confirms the default Web path shows `Local service connected` and readiness state in the browser. | Keep covered; future setup work should preserve this status before model setup details. |
| 4 | If the local service is not connected, understand how to start it. | `verified` | Web onboarding copy and README show local service start commands. `smoke:web-entry` starts Web against an unavailable local service, confirms the landing page points to Setup / Models, and confirms `/setup/models` shows `Start the local service`, the local service command, Check again, and model setup next step without raw connection errors. | Keep covered; future install work may simplify the command, but the current default path is proven. |
| 5 | Configure an OpenAI-compatible provider from Web: API key, base URL, model, and structured review compatibility. | `verified` | `/setup/models` supports provider setup fields and tests cover saving without showing secrets. The integrated Web product-loop test covers entering and saving API key, base URL, model, and the default structured review compatibility setting from Web without rendering the secret in default text. `smoke:product-loop` saves provider setup through the daemon setup API. `smoke:web-product-loop` enters the same fields in a real browser against an isolated local daemon and safe mock provider. | Keep covered; continue real external-provider walkthroughs before release hardening. |
| 6 | Verify the provider connection. | `verified` | Web and daemon tests cover provider verification and require verification before model-backed starts. The integrated Web product-loop test verifies the provider before exposing model-backed start links. `smoke:product-loop` verifies a local OpenAI-compatible mock provider. `smoke:web-product-loop` clicks Verify connection from Web and waits for provider readiness before starting. | Keep covered; add provider-specific troubleshooting only if real provider walkthroughs expose a blocker. |
| 7 | Start a model-backed discussion from Web. | `verified` | `/runs/new?participants=model-backed` is tested, including the verified-provider gate. The integrated Web product-loop test creates a model-backed discussion. `smoke:product-loop` creates and starts a provider-backed run through the daemon API. `smoke:web-product-loop` reaches the model-backed start page from Setup / Models and creates the discussion in a real browser. | Keep covered; future participant-management work should preserve this default path. |
| 8 | See participant/model perspectives as readable contributions, not raw events. | `verified` | Discussion Room tests and walkthrough document cover readable room contributions. The integrated Web product-loop test confirms provider-backed Perspective A/B contributions after continuing. `smoke:product-loop` confirms sealed contribution events. `smoke:web-product-loop` confirms readable Perspective A/B text appears in the browser room timeline. | Keep covered; continue checking that default views do not regress into raw event views. |
| 9 | See strongest current options. | `verified` | Discussion Room and outcome tests render strongest options/main perspectives in user language. The integrated Web product-loop test confirms a strongest option after continuation. `smoke:product-loop` verifies the daemon frontier contains a provider-backed strongest option. `smoke:web-product-loop` confirms the browser room and outcome show the provider-backed strongest option. | Keep covered; future UX work can improve scanning, but the loop step is proven. |
| 10 | See open disagreements. | `verified` | Web tests cover open disagreements and empty states. The integrated Web product-loop test covers a non-empty open-disagreement count. `smoke:product-loop` verifies a provider-backed open disagreement reaches the daemon projection. `smoke:web-product-loop` confirms the room and outcome show an open disagreement without default object ids. | Keep covered; broader empty-state browser coverage remains useful but is not the main loop blocker. |
| 11 | See missing evidence or evidence gaps. | `verified` | Web tests cover evidence gaps, resources, and outcome evidence sections. The integrated Web product-loop test confirms evidence-gap text remains visible. `smoke:product-loop` verifies a provider-backed evidence need reaches resources and outcome material. `smoke:web-product-loop` confirms missing evidence remains visible through room and outcome review. | Keep covered; future evidence-check workflows should preserve this visibility. |
| 12 | See risks. | `verified` | Web tests cover risks and hide internal source language from default view. The integrated Web product-loop test confirms risk-review text appears. `smoke:product-loop` verifies final audit risk material reaches the compiled outcome. `smoke:web-product-loop` confirms risk entry points in the room and concrete risk text in the outcome. | Keep covered; future release-hardening should add real-provider risk text examples. |
| 13 | See the current conclusion. | `verified` | Outcome pages render user-facing conclusion summaries and hide internal projection/event terms. The integrated Web product-loop test confirms the room reaches `Current conclusion: Ready to review`. `smoke:product-loop` verifies the daemon compiles a provider-backed current conclusion. `smoke:web-product-loop` opens the current conclusion page from the browser room and verifies the recommendation. | Keep covered; future work should improve conclusion readability only when it improves the main loop. |
| 14 | See next recommended actions. | `verified` | Outcome and room tests render next recommended actions. The integrated Web product-loop test confirms user-facing action labels. `smoke:product-loop` verifies continuation suggestions in the provider-backed outcome. `smoke:web-product-loop` confirms the room links and outcome next recommended actions are visible from the browser path. | Keep covered; future actions should stay user-facing. |
| 15 | Continue or update the discussion using user-facing actions. | `verified` | Web action labels include Continue discussion, Ask for stronger options, Review disagreements, Check evidence, and Update conclusion. The integrated Web product-loop test uses Continue discussion and verifies model-backed review requests. `smoke:product-loop` verifies the full start request against a real local daemon and local mock provider. `smoke:web-product-loop` clicks Continue discussion, verifies a transient first-response provider failure pauses in user-facing language, clicks Continue discussion again, and reaches reviewable conclusion material. `smoke:web-resilience` also verifies a safe failed-stage recovery path with Check model setup, retry, and new model-backed discussion actions. | Keep covered; later batches can test additional update actions beyond the primary continue path. |
| 16 | Complete the default path without seeing run/session/ledger/runtime/proposal/event/internal ids, raw JSON, env details, provider config ids, or secrets. | `verified` | Tests cover known default views and recent fixes hide internal outcome wording while preserving Advanced details. `smoke:web-product-loop` scans setup, start, paused retry, room, and outcome pages for secrets, env names, provider config ids, object ids, raw JSON, low-level id labels, and provider error categories during the primary browser path. `smoke:web-entry` adds landing, connected readiness, and local-service-unavailable setup scans. `smoke:web-boundaries` verifies the default landing and legacy session user view hide session ids, ledger/raw entries, runtime/env details, and internal object ids until Advanced / Developer Mode or the ledger events view is explicitly opened. `smoke:web-resilience` verifies paused, retryable continuation, setup-error, and failed-stage recovery states stay user-facing while raw stop reasons, stage error codes, and internal status codes remain behind Advanced details. | Keep covered; any new default route or retry state must extend the same safety scan before release. |

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

Rows 1 through 16 now have direct automated and browser evidence. The opt-in
release-readiness walkthrough has also been run against a real
OpenAI-compatible provider.

The current convergence target is real-provider repeatability: run the
release-readiness walkthrough through the Web-managed setup path, including the
default Structured review compatibility option, and fix the first blocking
normal-user recovery or completion step if the provider still pauses or fails.
The default Web path now has recovery guidance for safe failed-stage responses,
and OpenAI-compatible structured extraction has a conservative fallback when a
provider returns JSON that still fails the organizer schema after retry. Repeated
real-provider walkthroughs are still needed before release hardening can be
considered complete.

Release-readiness walkthrough requirements:

1. start from the documented local setup path;
2. configure a real OpenAI-compatible provider without logging or rendering
   secrets;
3. complete a model-backed discussion in Web;
4. record the first blocker that a normal outside user would hit.

If the walkthrough fails, fix the first blocking product-loop step with the
smallest verifiable change. Provider-specific compatibility that must be set by
a normal user belongs in Setup / Models; lower-level diagnostics and env var
names stay behind Advanced / Developer Mode.

Command:

```bash
DELIBERUM_RELEASE_SMOKE_API_KEY=<provider-key> \
DELIBERUM_RELEASE_SMOKE_BASE_URL=https://provider.example \
DELIBERUM_RELEASE_SMOKE_MODEL=provider-model \
corepack pnpm smoke:web-release-readiness
```

This command is intentionally outside default CI because it requires a real
provider secret, network access, and provider quota. The smoke accepts a provider
base URL and normalizes common `/v1` and `/v1/chat/completions` inputs before
submitting setup through Web.

The smoke relies on Web setup's default Structured review compatibility option
for organizer, reviewer, risk-review, and conclusion-writer stages. This keeps
the release-readiness path aligned with what a normal local user can do in Web
instead of requiring hidden environment variables.

## Recent Automated Evidence

### 2026-06-15 Real Provider Release-Readiness Smoke

Scope: rows 5 through 15 against a real external OpenAI-compatible provider,
with supporting evidence for row 16 on the real-provider Web path.

Command:

- `corepack pnpm smoke:web-release-readiness`

Path covered:

1. Starts an isolated local daemon and Web UI.
2. Opens `/setup/models` in Chromium.
3. Enters API key, base URL, and model through Web without logging or rendering
   the secret.
4. Verifies the provider connection from Web.
5. Starts a model-backed discussion from Setup / Models.
6. Uses Continue discussion until the room reaches readable participant
   perspectives, strongest current options, open disagreements, missing
   evidence, risks, current conclusion, and next recommended actions.
7. Opens the current conclusion page.
8. Scans setup, start, room, retry, and outcome default text to confirm provider
   secrets, base URL, model value, env var names, and provider config ids are not
   shown.

Result:

- The default three-field Web setup path reached provider verification and
  model first responses, then repeatedly paused at the discussion organizer with
  `extraction_output_invalid`.
- The same Web path completed when existing non-secret structured-output
  compatibility settings were enabled for extraction, review, final candidate,
  and final audit stages.
- The immediate product gap was Web-visible structured-output readiness and
  troubleshooting for real providers, not another runtime subsystem.

Follow-up:

- Web setup now includes a default Structured review compatibility option. A
  later release-readiness smoke completed through the Web-managed setup path
  without hidden structured-output environment variables.

Limit:

- This pass used one real OpenAI-compatible provider. Broader provider coverage,
  repeated release-readiness smoke runs, and clearer normal-user recovery remain
  release blockers.

### 2026-06-15 Web-Managed Structured Review Release Smoke

Scope: rows 5 through 15 against the same real external OpenAI-compatible
provider, using the normal Web setup path.

Command:

- `corepack pnpm smoke:web-release-readiness`

Path covered:

1. Opened `/setup/models` in Chromium.
2. Entered API key, base URL, and model through Web.
3. Kept the default Structured review compatibility option enabled.
4. Saved setup, checked readiness, and verified the provider connection.
5. Started a model-backed discussion from Web.
6. Continued the discussion to participant first responses, strongest current
   options, open disagreements, missing evidence, risks, current conclusion, and
   next recommended actions.
7. Opened the current conclusion page.
8. Scanned default setup, start, room, and outcome text for secrets, provider
   values, env var names, and low-level ids.

Result:

- Passed once with `DELIBERUM_RELEASE_SMOKE_CONTINUE_ATTEMPTS=1`.
- Passed again with the default retry budget.
- The smoke did not pass hidden structured-output compatibility env vars into
  the daemon; the compatibility settings came from Web setup.

Limit:

- An earlier run in the same batch exposed an intermittent real-provider
  partial first-response failure followed by a 400 on retry. The default path can
  now complete, but provider failure recovery remains a release-hardening gap.

### 2026-06-15 Structured Extraction Fallback Release Smoke

Scope: rows 8 through 15 against the same real external OpenAI-compatible
provider, with supporting evidence for row 16 on failure diagnostics.

Commands:

- `corepack pnpm smoke:web-release-readiness`
- `corepack pnpm --filter @deliberum/daemon test -- -t "structured provider schema repair"`
- `corepack pnpm --filter @deliberum/daemon typecheck`

Path covered:

1. Ran two consecutive real-provider release-readiness browser walkthroughs.
2. The first completed, and the second reproduced a real blocker after
   participant first responses: extraction paused with `extraction_output_invalid`.
3. Added release-smoke run-state diagnostics so future failures report safe
   round status, stage status, error categories, retry attempts, and diagnostics
   without printing provider secrets or raw model outputs.
4. Added a structured extraction fallback for OpenAI-compatible providers when
   Web-managed Structured review compatibility requests JSON output, the initial
   organizer output fails the schema, and the schema-repair retry still fails.
5. Re-ran the real-provider Web walkthrough after rebuilding the daemon and
   confirmed the default path reached readable participant perspectives,
   strongest current options, open disagreements, missing evidence, risks,
   current conclusion, and next recommended actions.

Result:

- Fixed the first verified real-provider blocker in the default Web product
  loop: schema-invalid organizer output no longer leaves a normal user stuck at
  `waiting_for_generators`.
- The fallback is conservative and traceable: it creates provisional proposal
  material from revealed first responses, keeps an open objection, adds a
  high-priority human-confirmation evidence need, and keeps the conclusion
  provisional.
- The fallback is limited to the structured review compatibility path. Lower
  level provider paths without `json_object` response formatting continue to
  surface extraction failures instead of silently masking configuration issues.

Limit:

- This improves recovery for one verified real-provider schema failure. It does
  not prove broad provider compatibility, low latency, or production-grade
  stability. More repeated real-provider walkthroughs remain release-hardening
  work.

### 2026-06-15 Organizer Fallback Visibility

Scope: rows 9 through 14 when structured organizer output had to be rebuilt
from independent first responses, with supporting evidence for row 16.

Commands:

- `corepack pnpm --filter @deliberum/web test`
- `corepack pnpm --filter @deliberum/web typecheck`
- `corepack pnpm lint:language`
- `corepack pnpm smoke:web-product-loop`
- `corepack pnpm smoke:web-resilience`

Path covered:

1. Added a default Discussion Room notice when strongest current options come
   from the conservative organizer fallback.
2. Added the same Current Conclusion notice when visible options,
   disagreements, evidence needs, or answer requirements contain fallback
   material.
3. Kept fallback object ids and raw extraction error categories out of the
   default readable room and conclusion views.
4. Covered the notice in English and Simplified Chinese.
5. Re-ran the browser product-loop and resilience smokes to confirm the default
   Web path still reaches readable discussion and recovery surfaces.

Result:

- A normal user can now see that Deliberum used a safe organizer fallback and
  should treat the current conclusion as provisional until disagreements,
  missing evidence, and risks are reviewed.
- The default UI still does not expose fallback ids, raw extraction error codes,
  or low-level runtime details.

Limit:

- This is fallback visibility coverage, not a new real-provider compatibility
  guarantee. Repeated release-readiness walkthroughs against real external
  providers are still required before release hardening can be considered
  complete.

### 2026-06-15 Web Entry Smoke

Scope: rows 1 through 4, with supporting evidence for row 16 on landing and
local-service-unavailable setup paths.

Command:

- `corepack pnpm smoke:web-entry`

Path covered:

1. Starts a local daemon from built output in an isolated temporary working
   directory with the local preset enabled.
2. Starts Web against that daemon and opens `/` in Chromium.
3. Verifies the desktop and mobile first viewports include Deliberum,
   multi-perspective deliberation, independent perspectives, strongest options,
   and reviewable conclusion language.
4. Verifies the connected landing path shows `Local service connected`, demo
   readiness, and user-facing Start / Continue actions.
5. Starts Web against an unavailable local service.
6. Verifies the unavailable landing path guides users to Setup / Models.
7. Verifies `/setup/models` shows the local service start command, Check again,
   and the next Web model setup step.
8. Scans landing and unavailable setup default text to confirm it does not show
   raw connection errors, OpenAI/MCP env names, provider config ids, raw JSON,
   resource posture, operation audit, or low-level id labels.

Limit:

- This verifies the current local development Web entry path, not a packaged
  installer or desktop wrapper.

### 2026-06-15 Browser Product Loop Smoke

Scope: rows 5 through 15, with supporting evidence for row 16 on the primary
default path.

Command:

- `corepack pnpm smoke:web-product-loop`

Path covered:

1. Starts a local daemon from built output in an isolated temporary working
   directory.
2. Starts a local OpenAI-compatible mock provider.
3. Starts Web with a temporary local origin allowed by the daemon CORS setup.
4. Opens `/setup/models` in Chromium.
5. Enters OpenAI-compatible API key, base URL, and model in Web.
6. Saves setup and confirms the secret is not shown.
7. Verifies the provider connection from Web.
8. Starts `/runs/new?participants=model-backed` from Setup / Models.
9. Creates a model-backed discussion from the browser.
10. Uses Continue discussion from the room.
11. Confirms a transient provider first-response failure pauses the discussion
    in user-facing language without showing raw provider error categories.
12. Uses Continue discussion again and confirms the retry completes the
    model-backed discussion.
13. Confirms readable participant perspectives, strongest option, open
    disagreement, missing evidence, risk entry point, current conclusion, and
    user-facing next actions are visible.
14. Opens the current conclusion page and confirms the recommendation, open
    disagreement, missing evidence, concrete risk text, and next recommended
    action are visible.
15. Scans setup, start, paused retry, room, and outcome default text to confirm
    it does not show the dummy API key, provider base URL, model value, OpenAI
    API env var, provider config id, object ids, raw JSON, low-level id labels,
    or provider error categories.

Limit:

- This is a browser walkthrough with a deterministic local mock provider, not a
  real external provider walkthrough. It proves the local product loop and
  default Web path, while release hardening should still include at least one
  real OpenAI-compatible provider pass.

### 2026-06-15 Product Loop Smoke

Scope: rows 5 through 15, using a real local daemon and local
OpenAI-compatible mock provider.

Command:

- `corepack pnpm smoke:product-loop`

Path covered:

1. Starts a local daemon from built output in an isolated temporary working
   directory.
2. Starts a local OpenAI-compatible mock provider.
3. Confirms the OpenAI-compatible profile starts disabled in the isolated
   environment.
4. Saves provider setup through `/runtime/setup/openai-compatible`.
5. Verifies the provider through `/runtime/setup/openai-compatible/verify`.
6. Confirms participant, extraction, review, final candidate, and final audit
   components are ready.
7. Creates a model-backed run with Perspective A and Perspective B.
8. Starts the run with sealed divergence, extraction, review, and finalization.
9. Confirms run events, strongest option, open disagreement, answer
   requirement, evidence gap, compiled conclusion, risk text, and continuation
   suggestion are present.
10. Confirms daemon responses used by the smoke do not include the dummy API
    key.

Limit:

- This is a daemon/API walkthrough, not a visual browser walkthrough. It is now
  suitable as a repeatable CI gate for provider-backed product-loop capability,
  but browser verification remains required before rows 5 through 15 can be
  marked `verified`.

### 2026-06-15 Integrated Web Product Loop Test

Scope: rows 5 through 15.

Automated test:

- `apps/web/test/App.test.tsx`:
  `walks model-backed setup through discussion review without default internals`

Path covered:

1. Opens `/setup/models`.
2. Enters an OpenAI-compatible API key, base URL, and model.
3. Saves the model setup without rendering the secret in default page text.
4. Verifies the provider connection.
5. Uses the Setup page's `Start model-backed discussion` link.
6. Creates a model-backed discussion from `/runs/new?participants=model-backed`.
7. Opens the Discussion Room.
8. Uses `Continue discussion`.
9. Verifies the continuation request includes model-backed first responses,
   extraction, review, and finalization roles.
10. Confirms the room shows participant contributions, a strongest option, an
    open disagreement count, an evidence-gap reason, an answer requirement,
    risk-review text, a reviewable current conclusion, and user-facing next
    actions.

Default-view safety checks:

- does not show the dummy API key;
- does not show configured base URL or model values;
- does not show OpenAI API env var names;
- does not show provider config ids;
- does not show event, proposal, candidate, objection, or evidence object ids.

Limit:

- This is automated DOM coverage with mocked daemon responses. It supports rows
  5 through 15, but it does not upgrade those rows to `verified` without a real
  browser walkthrough against a running local service and safe real or mock
  provider.

## Recent Browser Evidence

### 2026-06-15 Paused, Retryable, And Error-State Walkthrough

Scope: rows 15 and 16, with focused evidence for paused continuation results,
retryable user actions, setup-error states, and failed-stage recovery.

Automated browser smoke:

- `corepack pnpm smoke:web-resilience`

Setup:

- isolated local daemon without the local preset enabled;
- Web dev server pointed at the isolated daemon;
- local OpenAI-compatible mock provider configured through the daemon setup API;
- one model-backed discussion whose extraction response deliberately pauses the
  run with an invalid organizer response;
- one local-preset discussion whose continuation cannot run because the required
  local setup is unavailable;
- one model-backed discussion whose continuation safely fails before provider
  dispatch because the run budget does not allow first responses.

Path verified in the browser:

1. Opened the model-backed discussion room.
2. Used `Continue discussion` and confirmed the default result said
   `Discussion paused`, explained the stop reason in user-facing language, and
   rendered updated steps without exposing raw stop codes.
3. Confirmed raw execution status such as `waiting_for_generators` appeared only
   after opening the `Raw stage metadata` Advanced panel.
4. Opened the setup-error discussion room.
5. Used `Continue discussion` and confirmed the default error said
   `Discussion could not continue` with setup recovery language instead of the
   raw daemon error.
6. Used `Continue discussion` again as the retry action and confirmed the retry
   path kept the same default-view safety boundary.
7. Opened the failed-stage discussion room.
8. Used `Continue discussion` and confirmed the default error explained the
   model or review step could not finish safely, then offered Check model setup,
   retry, and Start a new model-backed discussion recovery actions.

Default-view safety checks:

- did not show the dummy API key, provider base URL, or model name;
- did not show OpenAI or local preset env var names;
- did not show provider config ids or internal adapter ids;
- did not show run or session ids;
- did not show raw stop reasons, stage error codes, budget errors, registry
  errors, or stack text before Advanced was opened.

### 2026-06-15 Default And Advanced Boundary Walkthrough

Scope: row 16, with focused evidence for the default path, Advanced / Developer
Mode, and legacy `/sessions/*` pages.

Automated browser smoke:

- `corepack pnpm smoke:web-boundaries`

Setup:

- isolated local daemon with the built-in local preset enabled;
- Web dev server pointed at the isolated daemon;
- a local preset discussion created and continued through the daemon before
  browser inspection.

Path verified in the browser:

1. Opened the default landing page with one existing discussion.
2. Confirmed the default landing offered `Open discussion` without showing run
   ids, session ids, daemon base URL, runtime profiles, operation audit, or the
   underlying session catalog.
3. Opened `Advanced operator details` and confirmed developer-only diagnostics,
   `Open by session id`, the underlying session catalog, daemon base URL,
   runtime profiles, operation audit, and the low-level session link were still
   available there.
4. Opened the legacy `/sessions/*` discussion brief page directly.
5. Confirmed the legacy user-mode view showed the discussion brief, review
   summary, and next recommended actions without showing the session id, raw
   ledger entry, event type, or internal local-preset object ids.
6. Opened the session `Ledger position` Advanced panel and confirmed the raw
   latest ledger entry and event type appeared only after Advanced was opened.
7. Opened the `Ledger events` route through the Advanced navigation and
   confirmed append-only event records remain available for developers.

Default-view safety checks:

- did not show run or session ids;
- did not show env var names or provider config ids;
- did not show internal local preset object ids;
- did not show raw ledger entry details before Advanced was opened;
- kept ledger/event inspection behind Advanced or the explicit ledger events
  route.

### 2026-06-15 Non-Empty Disagreement And Evidence Walkthrough

Scope: rows 5 through 15, with focused evidence for rows 10 through 12.

Setup:

- local daemon on `127.0.0.1:3877` from a temporary working directory;
- Web dev server on `127.0.0.1:5173`;
- local OpenAI-compatible mock provider on `127.0.0.1:3889`;
- dummy provider key `local-gap-loop-token`, never shown in default Web text.

Path verified in the browser:

1. Opened `/setup/models`.
2. Saved OpenAI-compatible API key, base URL, and model.
3. Verified the provider connection.
4. Started `/runs/new?participants=model-backed` from the Setup page.
5. Created a model-backed discussion.
6. Used `Continue discussion`.
7. Confirmed the room showed participant perspectives, a strongest option, an
   open disagreement, a concrete evidence-gap reason, an answer requirement,
   risk review summary, current conclusion, and user-facing next actions.
8. Opened the current conclusion page and confirmed the same concrete
   evidence-gap reason, risk text, and next action remained visible.
9. Repeated the room evidence check at a mobile viewport width of 390 px.

Default-view safety checks:

- did not show the dummy API key;
- did not show the configured base URL or model value;
- did not show provider config ids;
- did not show proposal/event/object ids for the mock candidate, objection,
  evidence need, or quality obligation;
- did not show raw JSON or ledger details outside Advanced / Developer Mode.
