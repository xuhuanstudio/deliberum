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
| 1 | Open the Web UI. | `verified` | README quickstart points users to `http://127.0.0.1:3877/` through `corepack pnpm start:local`, includes a local prerequisite check for Node.js, Corepack, and pnpm before dependency installation, and now includes normal-user troubleshooting for prerequisite, install/build, missing built Web assets, busy local port, local-service-unavailable, provider verification, and paused real-provider discussion failures. Web tests cover the shell and landing readiness states. `smoke:local-start` verifies the single-process local start script serves the built Web shell from the daemon. `smoke:web-entry` starts Web from a clean local browser path with both connected and unavailable local service states. | Keep covered; packaging and installer work can improve first-run convenience later. |
| 2 | Understand within 30 seconds that Deliberum is a multi-perspective deliberation product. | `verified` | README and default Web copy describe the human-first product. The landing page now leads with `Multi-perspective deliberation for better decisions`. `smoke:web-entry` verifies desktop and mobile first viewports include Deliberum, multi-perspective deliberation, independent perspectives, strongest options, and reviewable conclusion language. | Keep covered; future visual design work should preserve this first-viewport product signal. |
| 3 | See whether the local service is connected. | `verified` | Web setup and landing tests cover connected and unavailable local service states. `smoke:web-entry` starts a fresh local daemon and confirms the default Web path shows `Local service connected` and readiness state in the browser. | Keep covered; future setup work should preserve this status before model setup details. |
| 4 | If the local service is not connected, understand how to start it. | `verified` | Web onboarding copy and README show `corepack pnpm build && corepack pnpm start:local` as the local start path, and README troubleshooting explains keeping the `start:local` terminal running, opening the printed local URL, and using Check again in Setup / Models after the service responds. `smoke:local-start` verifies that script starts a daemon-served Web shell. `smoke:web-entry` starts Web against an unavailable local service, confirms the landing page points to Setup / Models, and confirms `/setup/models` shows `Start the local service`, the local service command, Check again, and model setup next step without raw connection errors. | Keep covered; future installer work may simplify dependency installation, but the current local product start path is proven. |
| 5 | Configure an OpenAI-compatible provider from Web: API key, base URL, model, and structured review compatibility. | `verified` | `/setup/models` supports provider setup fields and tests cover saving without showing secrets. The integrated Web product-loop test covers entering and saving API key, base URL, model, and the default structured review compatibility setting from Web without rendering the secret in default text. `smoke:product-loop` saves provider setup through the daemon setup API. `smoke:web-product-loop` enters the same fields in a real browser against an isolated local daemon and safe mock provider. | Keep covered; continue real external-provider walkthroughs before release hardening. |
| 6 | Verify the provider connection. | `verified` | Web and daemon tests cover provider verification and require verification before model-backed starts. The integrated Web product-loop test verifies the provider before exposing model-backed start links. `smoke:product-loop` verifies a local OpenAI-compatible mock provider. `smoke:web-product-loop` clicks Verify connection from Web and waits for provider readiness before starting. A 2026-06-15 opt-in `smoke:web-release-readiness` run against a real external OpenAI-compatible provider verified the provider connection through Web before creating the discussion. The daemon applies a default verification timeout so Web can show a safe recovery error instead of waiting indefinitely, the Web setup page gives normal users recovery actions to review setup fields, retry Verify connection, or start a demo discussion while fixing setup, and the release-readiness smoke now verifies those Web-visible recovery actions if a real provider cannot verify. | Keep covered with repeated opt-in real-provider release-readiness runs; broaden provider coverage later. |
| 7 | Start a model-backed discussion from Web. | `verified` | `/runs/new?participants=model-backed` is tested, including the verified-provider gate. The integrated Web product-loop test creates a model-backed discussion. Setup / Models tests verify that focused and broader model-backed start links appear only after provider verification and carry the selected perspective depth. `smoke:product-loop` creates and starts a provider-backed run through the daemon API. `smoke:web-product-loop` checks the verified Setup / Models focused and broader start links in a real browser, opens the broader path to confirm Perspective C is preselected, and creates the discussion from the model-backed start page. The 2026-06-15 opt-in `smoke:web-release-readiness` run also started a model-backed discussion from the verified real-provider setup path. | Keep covered; future participant-management work should preserve this default path. |
| 8 | See participant/model perspectives as readable contributions, not raw events. | `verified` | Discussion Room tests and walkthrough document cover readable room contributions. The integrated Web product-loop test confirms provider-backed Perspective A/B contributions after continuing. `smoke:product-loop` confirms sealed contribution events. `smoke:web-product-loop` confirms readable Perspective A/B text appears in the browser room timeline. | Keep covered; continue checking that default views do not regress into raw event views. |
| 9 | See strongest current options. | `verified` | Discussion Room and outcome tests render strongest options/main perspectives in user language. The integrated Web product-loop test confirms a strongest option after continuation. `smoke:product-loop` verifies the daemon frontier contains a provider-backed strongest option. `smoke:web-product-loop` confirms the browser room and outcome show the provider-backed strongest option. | Keep covered; future UX work can improve scanning, but the loop step is proven. |
| 10 | See open disagreements. | `verified` | Web tests cover open disagreements and empty states. The integrated Web product-loop test covers a non-empty open-disagreement count. `smoke:product-loop` verifies a provider-backed open disagreement reaches the daemon projection. `smoke:web-product-loop` confirms the room and outcome show an open disagreement without default object ids. | Keep covered; broader empty-state browser coverage remains useful but is not the main loop blocker. |
| 11 | See missing evidence or evidence gaps. | `verified` | Web tests cover evidence gaps, resources, and outcome evidence sections. The integrated Web product-loop test confirms evidence-gap text remains visible. `smoke:product-loop` verifies a provider-backed evidence need reaches resources and outcome material. `smoke:web-product-loop` confirms missing evidence remains visible through room and outcome review. | Keep covered; future evidence-check workflows should preserve this visibility. |
| 12 | See risks. | `verified` | Web tests cover risks and hide internal source language from default view. The integrated Web product-loop test confirms risk-review text appears. `smoke:product-loop` verifies final audit risk material reaches the compiled outcome. `smoke:web-product-loop` confirms risk entry points in the room and concrete risk text in the outcome. | Keep covered; future release-hardening should add real-provider risk text examples. |
| 13 | See the current conclusion. | `verified` | Outcome pages render user-facing conclusion summaries and hide internal projection/event terms. The integrated Web product-loop test confirms the room reaches `Current conclusion: Ready to review`. `smoke:product-loop` verifies the daemon compiles a provider-backed current conclusion. `smoke:web-product-loop` opens the current conclusion page from the browser room and verifies the recommendation. | Keep covered; future work should improve conclusion readability only when it improves the main loop. |
| 14 | See next recommended actions. | `verified` | Outcome and room tests render next recommended actions. The integrated Web product-loop test confirms user-facing action labels. `smoke:product-loop` verifies continuation suggestions in the provider-backed outcome. `smoke:web-product-loop` confirms the room links and outcome next recommended actions are visible from the browser path. | Keep covered; future actions should stay user-facing. |
| 15 | Continue or update the discussion using user-facing actions. | `verified` | Web action labels include Continue discussion, Ask for stronger options, Review disagreements, Check evidence, and Update conclusion. The integrated Web product-loop test uses Continue discussion and verifies model-backed review requests. `smoke:product-loop` verifies the full start request against a real local daemon and local mock provider. `smoke:web-product-loop` clicks Continue discussion, verifies a transient first-response provider failure pauses in user-facing language, clicks Continue discussion again, and reaches reviewable conclusion material. `smoke:web-resilience` also verifies safe failed-stage and stopped-continuation recovery paths with Check model setup, retry, and new model-backed discussion actions. The 2026-06-15 opt-in `smoke:web-release-readiness` run completed the Continue discussion path with a real external provider and reached the reviewable room and outcome surfaces; the same smoke now verifies those recovery actions when a real-provider continuation returns `run_stage_failed`, `failed`, or `timed_out`. | Keep covered; later batches can test additional update actions beyond the primary continue path. |
| 16 | Complete the default path without seeing run/session/ledger/runtime/proposal/event/internal ids, raw JSON, env details, provider config ids, or secrets. | `verified` | Tests cover known default views and recent fixes hide internal outcome wording while preserving Advanced details. `smoke:web-product-loop` scans setup, start, paused retry, room, and outcome pages for secrets, env names, provider config ids, object ids, raw JSON, low-level id labels, and provider error categories during the primary browser path. `smoke:web-release-readiness` scans the opt-in real-provider setup, start, room, retry, and outcome path for provider secrets, provider values, env var names, provider config ids, and low-level ids. `smoke:web-entry` adds landing, connected readiness, and local-service-unavailable setup scans. `smoke:web-boundaries` verifies the default landing and legacy session user view hide session ids, ledger/raw entries, runtime/env details, and internal object ids until Advanced / Developer Mode or the ledger events view is explicitly opened. `smoke:web-resilience` verifies paused, retryable continuation, setup-error, and failed-stage recovery states stay user-facing while raw stop reasons, stage error codes, and internal status codes remain behind Advanced details. | Keep covered; any new default route or retry state must extend the same safety scan before release. |

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

Rows 1 through 16 have direct automated and browser evidence on the local
mock/default browser path, with repeated opt-in release-readiness evidence
against one real external OpenAI-compatible provider. Treat this as Basic
Product Loop evidence for the current provider path, not as broad provider
compatibility or production-grade release readiness.

The current convergence target is real-provider release hardening: continue
running the release-readiness walkthrough through the Web-managed setup path,
including the default Structured review compatibility option, across repeated
passes and more OpenAI-compatible providers. Fix the first blocking normal-user
recovery or completion step if provider verification, continuation, or
finalization pauses or fails. The default Web path now has recovery guidance for
safe failed-stage responses, OpenAI-compatible structured extraction has a
conservative fallback when a provider returns JSON that still fails the
organizer schema after retry, verification has a default timeout for
non-responsive providers, and the default UI explains when the organizer
fallback was used. The default model-backed review policy also preserves the
user path when the reviewer challenges generated proposals: Deliberum can still
compile a provisional conclusion while keeping challenges, objections, missing
evidence, risks, and next actions visible for review.

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

If provider verification fails, the smoke records only the safe daemon response
summary, then verifies the default Setup / Models view shows normal-user
recovery actions: Review setup fields, Try Verify connection again, and Start
demo discussion. This keeps provider setup failures actionable without printing
provider secrets, base URLs, model values, provider response text, or env var
names.

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

If the repository-local `.env` already contains `DELIBERUM_OPENAI_API_KEY`,
`DELIBERUM_OPENAI_BASE_URL`, and `DELIBERUM_OPENAI_MODEL` from local Web setup or
daemon setup, `corepack pnpm smoke:web-release-readiness` can reuse those values.
Explicit `DELIBERUM_RELEASE_SMOKE_*` variables still take precedence for
provider-specific release checks.

Latest 2026-06-15 evidence: the repository-local `.env` provider setup still
exercises the safe provider-verification recovery path because that local
provider endpoint is not reachable, but an explicit temporary real external
OpenAI-compatible provider configuration passed the Web-managed release smoke
three consecutive times on the default focused two-perspective path and once on
the Broader review three-perspective path. A later Broader review batch also
passed three consecutive runs. This means the current highest-priority product
gap is not provider verification in Deliberum itself; it is continued
real-provider release hardening across more providers, longer run batches, and
failure recovery states.

Additional 2026-06-15 post-change evidence: after the verified Setup / Models
focused and broader start links were added, the opt-in real-provider
release-readiness smoke passed one fresh focused two-perspective run and one
fresh Broader review three-perspective run. The recorded result intentionally
omits the provider key, base URL, model name, raw provider response, and provider
output.

Set `DELIBERUM_RELEASE_SMOKE_RUNS=3` or another positive integer to repeat the
same browser walkthrough in fresh isolated local services. The command stops on
the first failed run, which makes intermittent real-provider product-loop
failures easier to reproduce without hand-written shell loops.

Set `DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3` to run the same walkthrough through
the Broader review start path with Perspective A, Perspective B, and Perspective
C. The default remains `2`, which verifies the focused two-perspective path.

When a real-provider continuation stops with a recoverable failed stage
(`run_stage_failed`, `failed`, or `timed_out`), the smoke verifies the default
Web view shows normal-user recovery actions: Check model setup, Try Continue
discussion again, and Start a new model-backed discussion. These checks keep
recovery usability in the release-readiness path without exposing raw stage
codes, provider values, or secrets.

The smoke relies on Web setup's default Structured review compatibility option
for organizer, reviewer, risk-review, and conclusion-writer stages. This keeps
the release-readiness path aligned with what a normal local user can do in Web
instead of requiring hidden environment variables.

## Recent Automated Evidence

### 2026-06-15 Local Product Start Smoke

Scope: rows 1 through 4, with supporting evidence for installable local-first
startup.

Commands:

- `node scripts/check-local-prerequisites.mjs`
- `corepack pnpm smoke:local-start`

Path covered:

1. Checks that the local toolchain has Node.js 24 or newer, Corepack, and pnpm
   11 through Corepack.
2. Starts `corepack pnpm start:local` on an isolated local port.
3. Uses a temporary SQLite path so no local user data is touched.
4. Waits for daemon health.
5. Opens `/setup/models` through the daemon-served built Web shell.
6. Confirms the start script prints the user-facing local Web URL.

Result:

- The default local product entry can now be started as one process after
  `corepack pnpm build`.
- External users can run a zero-dependency prerequisite check before installing
  dependencies, which makes missing Node/Corepack/pnpm setup visible before the
  product loop fails later.
- The unavailable-service Web guide, README quickstart, deployment guide, and
  discussion walkthrough now point to the same local product start path.

Limit:

- This is still source-checkout local startup, not a packaged desktop app or
  installer. Future packaging can reduce dependency and build steps.

### 2026-06-15 Real Provider Release-Readiness Smoke

Scope: rows 5 through 15 against a real external OpenAI-compatible provider,
with supporting evidence for row 16 on the real-provider Web path.

Command:

- `DELIBERUM_RELEASE_SMOKE_RUNS=2 corepack pnpm smoke:web-release-readiness`

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

### 2026-06-15 Repeated Real Provider Release Smoke

Scope: rows 5 through 16 against a real external OpenAI-compatible provider,
using the Web-managed setup path after organizer fallback recovery and fallback
visibility were added.

Command:

- `corepack pnpm smoke:web-release-readiness`

Path covered:

1. Ran the release-readiness browser walkthrough twice consecutively against the
   same real external OpenAI-compatible provider.
2. Entered provider setup through `/setup/models` with the default Structured
   review compatibility option enabled.
3. Verified the provider connection from Web.
4. Started a model-backed discussion from Web.
5. Continued the discussion until participant perspectives, strongest current
   options, open disagreements, missing evidence, risks, current conclusion, and
   next recommended actions were visible.
6. Opened the Current Conclusion page.
7. Reused the smoke's default-view safety scans for setup, start, room, retry,
   and outcome surfaces so provider secrets, provider values, env var names,
   provider config ids, raw JSON, and low-level ids stayed out of the normal
   user path.

Result:

- Passed twice consecutively.
- The Basic Product Loop can now complete repeatedly with this real provider
  through the default Web-managed setup path.

Limit:

- This is repeatability evidence for one provider, not broad provider
  compatibility or production-grade stability. Future release-hardening batches
  should run the same walkthrough against additional OpenAI-compatible providers
  and fix the first normal-user blocker that appears.

### 2026-06-15 Provider Verification Recovery Release Smoke

Scope: rows 5 through 16 against a real external OpenAI-compatible provider,
using the Web-managed setup path after provider verification failure recovery
actions were added.

Command:

- `corepack pnpm smoke:web-release-readiness`

Path covered:

1. Opened `/setup/models` in Chromium against an isolated local daemon and Web
   UI.
2. Entered provider setup through Web with the default Structured review
   compatibility option enabled.
3. Saved setup, checked readiness, and verified the provider connection from
   Web.
4. Started a model-backed discussion from Setup / Models.
5. Used Continue discussion until participant perspectives, strongest current
   options, open disagreements, missing evidence, risks, current conclusion, and
   next recommended actions were visible.
6. Opened the Current Conclusion page.
7. Reused the smoke's default-view safety scans for setup, start, room, retry,
   and outcome surfaces so provider secrets, provider values, env var names,
   provider config ids, raw JSON, and low-level ids stayed out of the normal
   user path.

Result:

- Passed twice consecutively.
- The provider verification recovery batch did not regress the real-provider
  default path; the Basic Product Loop can still complete through Web-managed
  setup with a real external OpenAI-compatible provider.

Limit:

- This is one opt-in repeated real-provider pass. It does not prove broad provider
  compatibility, long-running stability, or production-grade release readiness.
  Future convergence work should keep using the release-readiness smoke to find
  the first normal-user blocker on the real provider path.

### 2026-06-15 Reviewer Challenge Recovery Release Smoke

Scope: rows 8 through 15 against a real external OpenAI-compatible provider,
with supporting evidence for row 16 on default-view safety.

Commands:

- `corepack pnpm --filter @deliberum/orchestrator test -- -t "all_generated"`
- `corepack pnpm --filter @deliberum/web test -- -t "model-backed review path ready"`
- `corepack pnpm --filter @deliberum/orchestrator typecheck`
- `corepack pnpm --filter @deliberum/web typecheck`
- `corepack pnpm build`
- `corepack pnpm smoke:product-loop`
- `corepack pnpm smoke:web-product-loop`
- `DELIBERUM_RELEASE_SMOKE_RUNS=3 corepack pnpm smoke:web-release-readiness`

Path covered:

1. Reproduced a real-provider release-readiness failure where the room had
   readable participant first responses, but repeated Continue discussion
   attempts could still end in a safe `run_stage_failed` response before the
   room reached strongest options, risks, conclusion, and next actions.
2. Changed the default model-backed Web continuation policy to accept generated
   organizer proposals for provisional finalization while keeping reviewer
   challenges and extracted objections visible.
3. Added focused orchestrator coverage for accepting challenged generated
   proposals through the new provisional review policy.
4. Updated the API and browser product-loop smokes so their mock reviewer
   challenges generated proposals before the flow reaches finalization.
5. Improved the release-readiness smoke's failure diagnostics so future
   real-provider failures report safe extraction, review, and finalization round
   states instead of only the top-level run status.
6. Re-ran the real-provider release-readiness browser walkthrough three
   consecutive times from Web setup through current conclusion.

Result:

- The reproduced real-provider blocker was fixed for the tested provider path.
- The default Web path can now reach a provisional conclusion even when the
  reviewer challenges generated discussion material, while preserving normal
  user review of disagreements, missing evidence, risks, and next actions.
- The deterministic API and browser smokes now guard against regression where a
  reviewer challenge leaves normal users without a reviewable conclusion.

Limit:

- This remains evidence for one real external provider and deterministic local
  mocks. Additional OpenAI-compatible providers, slower model behavior, and
  longer repeated runs remain release-hardening work.

### 2026-06-15 Extended Real Provider Release Smoke

Scope: rows 5 through 16 against the same real external OpenAI-compatible
provider, using the Web-managed setup path after reviewer challenge recovery.

Command:

- `DELIBERUM_RELEASE_SMOKE_RUNS=5 corepack pnpm smoke:web-release-readiness`

Path covered:

1. Ran five fresh isolated browser walkthroughs against the same real external
   OpenAI-compatible provider.
2. Each run opened `/setup/models`, entered provider setup through Web, verified
   the provider connection, started a model-backed discussion, used Continue
   discussion, reached readable participant perspectives, strongest options,
   open disagreements, missing evidence, risks, current conclusion, and next
   recommended actions, then opened the Current Conclusion page.
3. Each run reused the release smoke's default-view safety scans for setup,
   start, room, retry, and outcome surfaces so provider secrets, provider
   values, env var names, provider config ids, raw JSON, and low-level ids stayed
   out of the normal user path.

Result:

- Passed five consecutive runs.
- No new normal-user blocker reproduced after the reviewer challenge recovery
  batch.

Limit:

- This strengthens repeatability evidence for one provider only. It still does
  not prove broad OpenAI-compatible provider coverage, long-running stability,
  quota resilience, or production-grade release readiness.

### 2026-06-15 Broader Review Real Provider Smoke

Scope: rows 7 through 16 against the same real external OpenAI-compatible
provider, using the Web-managed Broader review path.

Command:

- `DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 corepack pnpm smoke:web-release-readiness`

Path covered:

1. Opened `/setup/models`, entered provider setup through Web, and verified the
   provider connection.
2. Started a model-backed discussion from Web.
3. Selected Broader review on the start page and verified Perspective A,
   Perspective B, and Perspective C before creating the discussion.
4. Confirmed the created discussion brief includes `Use three independent
   model-backed perspectives from the local service.`
5. Used Continue discussion until participant perspectives, strongest options,
   open disagreements, missing evidence, risks, current conclusion, and next
   recommended actions were visible.
6. Opened the Current Conclusion page and reused default-view safety scans for
   setup, start, room, retry, and outcome surfaces.

Result:

- Passed once against the real provider.
- The release-readiness smoke can now verify both the default focused
  two-perspective path and the Broader review path with Perspective C.

Limit:

- This is one Broader review pass against one provider. It does not replace
  repeated Broader review runs or broader provider coverage before release.

### 2026-06-15 Temporary Real Provider Release Smoke

Scope: rows 5 through 16 against an explicit temporary real external
OpenAI-compatible provider configuration, separate from the repository-local
`.env` provider setup.

Commands:

- `DELIBERUM_RELEASE_SMOKE_API_KEY=<provider-key> DELIBERUM_RELEASE_SMOKE_BASE_URL=<provider-chat-completions-url> DELIBERUM_RELEASE_SMOKE_MODEL=<provider-model> corepack pnpm smoke:web-release-readiness`
- `DELIBERUM_RELEASE_SMOKE_API_KEY=<provider-key> DELIBERUM_RELEASE_SMOKE_BASE_URL=<provider-chat-completions-url> DELIBERUM_RELEASE_SMOKE_MODEL=<provider-model> DELIBERUM_RELEASE_SMOKE_RUNS=3 corepack pnpm smoke:web-release-readiness`
- `DELIBERUM_RELEASE_SMOKE_API_KEY=<provider-key> DELIBERUM_RELEASE_SMOKE_BASE_URL=<provider-chat-completions-url> DELIBERUM_RELEASE_SMOKE_MODEL=<provider-model> DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 corepack pnpm smoke:web-release-readiness`
- `DELIBERUM_RELEASE_SMOKE_API_KEY=<provider-key> DELIBERUM_RELEASE_SMOKE_BASE_URL=<provider-chat-completions-url> DELIBERUM_RELEASE_SMOKE_MODEL=<provider-model> DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 DELIBERUM_RELEASE_SMOKE_RUNS=3 corepack pnpm smoke:web-release-readiness`

Path covered:

1. Confirmed the provider accepted a minimal OpenAI-compatible chat completion
   request before running the Web walkthrough.
2. Opened `/setup/models`, entered API key, base URL, and model through Web, and
   verified the provider connection without logging or rendering secrets.
3. Started a model-backed discussion from Web.
4. Completed the default focused two-perspective Continue discussion path to
   participant perspectives, strongest options, open disagreements, missing
   evidence, risks, current conclusion, and next recommended actions.
5. Re-ran the same Web-managed walkthrough with Broader review enabled and
   verified Perspective A, Perspective B, and Perspective C.
6. Opened the Current Conclusion page and reused default-view safety scans for
   setup, start, room, retry, and outcome surfaces.

Result:

- Passed once on the focused two-perspective path.
- Passed three consecutive focused two-perspective runs in fresh isolated local
  services.
- Passed once on the Broader review three-perspective path.
- Passed three consecutive Broader review three-perspective runs in fresh
  isolated local services.
- The latest verified real-provider blocker was the repository-local `.env`
  provider endpoint being unreachable, not a Deliberum product-loop failure with
  a reachable OpenAI-compatible provider.

Limit:

- This is still one external provider, one three-run focused batch, and one
  three-run Broader review batch. It does not prove broad provider
  compatibility, long-run stability, quota resilience, or production-grade
  release readiness.

### 2026-06-15 Release Candidate Provider Stability Recheck

Scope: rows 5 through 16 against the same explicit temporary real external
OpenAI-compatible provider configuration, with a repository-local provider
verification recovery precheck.

Commands:

- `DELIBERUM_RELEASE_SMOKE_RUNS=5 corepack pnpm smoke:web-release-readiness`
- `DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 DELIBERUM_RELEASE_SMOKE_RUNS=3 corepack pnpm smoke:web-release-readiness`

Path covered:

1. Re-ran the repository-local provider setup first. It did not pass provider
   verification because the configured endpoint could not be reached, and the
   smoke verified that Setup / Models still showed normal-user recovery actions
   instead of exposing provider values or low-level diagnostics.
2. Re-ran the focused two-perspective release-readiness browser walkthrough
   against an explicit temporary reachable provider configuration supplied only
   through environment variables.
3. Re-ran the Broader review three-perspective release-readiness browser
   walkthrough against the same temporary provider configuration.
4. Each successful walkthrough opened `/setup/models`, entered provider setup
   through Web, verified the provider connection, started a model-backed
   discussion, continued to readable perspectives, strongest options, open
   disagreements, missing evidence, risks, current conclusion, and next
   recommended actions, then opened the Current Conclusion page.
5. Each successful walkthrough reused the default-view safety scans for setup,
   start, room, retry, and outcome surfaces so provider secrets, provider
   values, env var names, provider config ids, raw JSON, and low-level ids
   stayed out of the normal user path.

Result:

- The repository-local provider path remained blocked at provider verification,
  with safe normal-user recovery actions visible.
- The explicit temporary reachable provider path passed five consecutive
  focused two-perspective runs in fresh isolated local services.
- The same provider path passed three consecutive Broader review
  three-perspective runs in fresh isolated local services.
- No new Deliberum-side product-loop blocker was reproduced, so this batch only
  records release-candidate stability evidence instead of changing product or
  runtime behavior.

Limit:

- This strengthens repeatability evidence for one reachable real provider. It
  still does not prove broad OpenAI-compatible provider coverage, quota
  resilience, latency tolerance, or production-grade release readiness.

### 2026-06-15 Provider Verification Failure Recovery Guard

Scope: rows 6, 15, and 16 on the opt-in real-provider release-readiness path.

Commands:

- `node --check scripts/smoke-web-release-readiness-once.mjs`
- `corepack pnpm lint:docs`
- `corepack pnpm lint:language`
- `corepack pnpm smoke:web-release-readiness`

Path covered:

1. Re-ran the Web-managed release-readiness walkthrough using the repository
   local provider setup.
2. The provider did not pass Web verification, so the walkthrough correctly
   stopped before starting a model-backed discussion.
3. The release-readiness smoke now records the safe verification response
   summary and verifies that this failure state still shows normal-user
   recovery actions: Review setup fields, Try Verify connection again, and Start
   demo discussion.
4. The same smoke continues scanning the default setup view so provider secrets,
   provider values, env var names, provider config ids, raw JSON, and low-level
   ids stay out of the normal user path.
5. The smoke now performs the same recovery-action guard when later Continue
   discussion attempts stop with recoverable failed-stage states.

Result:

- The latest local real-provider walkthrough is blocked at provider
  verification with safe code `provider_network_error`, but the default Web path
  gives normal users a safe recovery path instead of exposing raw diagnostics or
  leaving them without a next action.
- This improves release-readiness failure evidence; it does not count as a
  successful real-provider end-to-end pass.

Limit:

- The current provider setup must verify successfully before rows 7 through 14
  can be re-proven on this specific real-provider path. Continue with a verified
  provider configuration, then re-run `corepack pnpm smoke:web-release-readiness`
  and fix the next blocker that appears.

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
8. Confirms verified Setup / Models shows focused and broader model-backed start
   links with the expected perspective depth.
9. Opens the broader start link and confirms Broader review preselects
   Perspective C.
10. Sets a first-response model, a review role model, and a Perspective A model
    override, confirming uncustomized perspectives keep the first-response
    model while review roles use their own model assignment.
11. Saves those non-secret role model choices as browser role defaults, returns
    through Setup / Models to the start page, confirms the defaults are applied
    to a new model-backed discussion, and confirms the saved defaults do not
    contain provider secrets or connection details.
12. Creates a model-backed discussion from the browser.
13. Uses Continue discussion from the room.
14. Confirms a transient provider first-response failure pauses the discussion
    in user-facing language without showing raw provider error categories.
15. Uses Continue discussion again and confirms the retry completes the
    model-backed discussion.
16. Confirms readable participant perspectives, strongest option, open
    disagreement, missing evidence, risk entry point, current conclusion, and
    user-facing next actions are visible.
17. Opens the current conclusion page and confirms the recommendation, open
    disagreement, missing evidence, concrete risk text, and next recommended
    action are visible.
18. Scans setup, start, paused retry, room, and outcome default text to confirm
    it does not show the dummy API key, provider base URL, saved provider model
    value, OpenAI API env var, provider config id, object ids, raw JSON,
    low-level id labels, or provider error categories.

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
5. Verifies the Setup page's focused and broader model-backed start links.
6. Verifies the start page can set a first-response model, a review role model,
   and individual first-response Perspective A/C model overrides without
   exposing secrets or provider config ids in the default UI.
7. Verifies those non-secret role model choices can be saved, reapplied, and
   cleared as browser role defaults without storing API keys or base URLs.
8. Creates a model-backed discussion from `/runs/new?participants=model-backed`.
9. Opens the Discussion Room.
10. Uses `Continue discussion`.
11. Verifies the continuation request includes model-backed first responses,
   extraction, review, and finalization roles.
12. Confirms the room shows participant contributions, a strongest option, an
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
