# Deliberum v1.0 Production Readiness Matrix

Updated: 2026-06-16

This matrix is the convergence gate for Deliberum v1.0 Production Stable. It is
not a completion report. It records what the current repository proves, where
the evidence is weak, and which production blocker should be handled next.

The v0.1 Open Beta / Release Candidate report proves the local-first beta loop.
v1.0 requires stronger evidence: supported-platform install/start reliability,
production-grade real-provider stability, model and participant management,
data/storage compatibility, release notes, and documented upgrade/recovery
paths.

## Status Rules

| Status | Meaning |
| --- | --- |
| `complete` | Current code, docs, tests, browser smokes, CI, and release evidence prove the gate. |
| `partial` | The gate has working beta-level behavior, but v1.0 evidence or product coverage is incomplete. |
| `missing` | The repository does not yet provide the required v1.0 capability, documentation, or verification. |
| `blocked by evidence` | The capability may exist, but there is no current authoritative proof at v1.0 scope. |
| `blocked by product gap` | Normal users still lack a required product path or recovery path. |

When evidence is uncertain, use `partial` or `blocked by evidence`. Do not mark
a v1.0 gate `complete` because the v0.1 local loop passed.

## Gate Matrix

| # | Production gate | Current status | Current evidence | First blocking gap |
| --- | --- | --- | --- | --- |
| 1 | Local install/start is reliable, documented, and repeatable across supported platforms. | `complete` | `README.md` declares macOS and Ubuntu Linux as the v1.0 source-checkout supported platforms with Node.js 24 or newer and Corepack-managed pnpm 11. The `ci:local-start` script runs `doctor:local`, `build`, and `smoke:local-start`. GitHub CI includes a `local-start-platforms` matrix on `ubuntu-latest` and `macos-latest`, so the supported-platform install/build/start path is verified outside the developer machine. | Keep covered; Windows and WSL2 remain unsupported until the local-start path is verified in CI. |
| 2 | Web first-use, Setup / Models, participant readiness, and Discussion Room form one coherent product experience. | `complete` | `docs/V1_0_WEB_PRODUCT_COHERENCE_AUDIT.md` closes Gate 2 for the v1.0 supported Web scope. `smoke:web-entry` verifies the connected and unavailable first-use entry paths, desktop and mobile first-viewport product clarity, local service status, and default-view safety. `smoke:web-product-loop` verifies the Setup / Models provider setup, verification, participant readiness, role defaults, focused and broader start links, Start Discussion role/model assignment, Discussion Room continuation, current conclusion, and default-view safety across the product path. | Keep covered. Any new default Web route, start mode, recovery state, or outcome surface must extend the same coherence and safety evidence. |
| 3 | Real OpenAI-compatible provider workflows are stable across repeated focused and broader-review release smokes. | `complete` | `docs/V1_0_REAL_PROVIDER_STABILITY_AUDIT.md` closes Gate 3 for the v1.0 supported OpenAI-compatible Web setup path. A temporary real provider passed three consecutive focused release smokes. Broader review then reproduced an `extraction_validation_failed` blocker after three first responses; the OpenAI-compatible extraction generator was fixed to validate traceability before returning provider output and to use the conservative organizer fallback when structured repair remains untraceable. After the fix, Broader review passed three consecutive release smokes. | Keep covered. Broader provider compatibility remains opt-in release evidence, while provider-specific rate limit, timeout, malformed output, and partial completion recovery evidence belongs to Gate 4. |
| 4 | Provider setup, verification, failure recovery, rate limit, timeout, malformed output, and partial completion states are handled in normal-user language. | `complete` | `smoke:web-resilience` verifies provider verification failure recovery, rate-limited provider verification recovery, timed-out provider verification recovery, retryable continuation, failed stages, and partial completion states in a browser against an isolated local daemon and safe local mock provider. Daemon and adapter tests cover safe provider error categories, including timeout and malformed output. Gate 3 evidence covers malformed structured output fallback and the fixed conservative recovery path after real-provider structured extraction output is untraceable. | Keep covered. Any new provider setup, verification, continuation, or recovery state must add the same normal-user recovery and default-view safety evidence. |
| 5 | Default UI never exposes secrets, raw JSON, env details, run/session/ledger/runtime/proposal/event/internal ids, or provider config ids. | `partial` | `smoke:web-product-loop`, `smoke:web-release-readiness`, `smoke:web-entry`, `smoke:web-boundaries`, and `smoke:web-resilience` scan current default paths, including the latest rate-limited and timed-out provider verification recovery states. | Needs a Gate 5 closure audit across the current default routes and recovery states now that Gate 4 is closed. |
| 6 | Advanced / Developer Mode preserves diagnostics without leading the normal user path. | `partial` | Current docs and smokes keep raw details behind Advanced / Developer Mode for existing default paths. | Needs a v1.0 audit after production setup, participant management, and storage recovery paths are added. |
| 7 | Model / Participant Management supports understandable provider/model/role readiness and editing. | `complete` | `docs/V1_0_MODEL_PARTICIPANT_MANAGEMENT_AUDIT.md` closes Gate 7 for the v1.0 supported Web scope: one Web-managed OpenAI-compatible provider setup, with direct Setup / Models editing for default discussion depth, first-response model, review role model, and optional Perspective A/B/C model choices. The start page supports per-discussion role/model overrides, applying saved defaults, and creating model-backed run plans. `apps/web/test/App.test.tsx` and `smoke:web-product-loop` verify provider setup, provider verification, focused and broader model-backed starts, role-default save/apply/clear behavior, Setup / Models direct role-default editing, and default-view safety without API keys, base URLs, provider config ids, env var names, or raw internal data. | Keep covered. Multiple named provider accounts and simultaneous multi-provider Web editing are explicit post-v1.0 architecture work because current Web-managed provider setup is a single local daemon env block and would require new secret/named-provider storage semantics. |
| 8 | README, quickstart, walkthrough, troubleshooting, release notes, and Basic Product Loop docs match the actual UI. | `partial` | README, Basic Product Loop, deployment, walkthrough, and v0.1 completion docs match the beta UI and smokes. | v1.0 release notes do not exist yet, and docs must be updated after production gates 1, 7, and 11 move. |
| 9 | CI, tests, language lint, docs lint, product-loop smoke, Web smoke, and real-provider release-readiness evidence are green and current. | `partial` | Local `corepack pnpm run ci` and GitHub CI are green. CI now separates full Ubuntu validation from supported-platform local-start validation on Ubuntu and macOS. Real-provider release-readiness evidence is recorded. | Real-provider smoke remains opt-in outside default CI and broader provider coverage is still incomplete. |
| 10 | No known normal-user blocker remains in install, startup, setup, verification, discussion start, continuation, conclusion review, or recovery. | `partial` | v0.1 evidence shows no known blocker in the local beta loop with a reachable provider; unreachable provider setup shows safe recovery. Supported-platform local-start verification now covers macOS and Ubuntu Linux. | Production blockers remain in broader provider behavior, participant management, and data/storage recovery. |
| 11 | Data/storage compatibility, upgrade path, and failure recovery are documented and tested enough for production use. | `partial` | SQLite stores reject unsupported schema versions in targeted tests, ledger integrity checks exist, and deployment docs describe local/pre-production persistence modes. | No v1.0 storage compatibility policy, migration/upgrade path, backup/restore runbook, or production recovery test matrix exists yet. |
| 12 | A v1.0 release report confirms evidence, known limits, supported paths, and post-v1.0 backlog. | `missing` | `docs/V0_1_OPEN_BETA_COMPLETION_REPORT.md` exists for v0.1 only. | v1.0 completion report must wait until gates 1 through 11 are complete. |

## Next Production Batch

The first production blocker is now gate 5: the default UI must never expose
secrets, raw JSON, env details, run/session/ledger/runtime/proposal/event/internal
ids, or provider config ids. Gates 2, 3, 4, and 7 are closed for the v1.0
supported Web scope, so the next batch should audit the current default routes
and recovery states before adding more UI or runtime behavior.

Recommended narrow batch:

1. Inventory current default Web routes and recovery states covered by
   `smoke:web-entry`, `smoke:web-product-loop`, `smoke:web-boundaries`,
   `smoke:web-resilience`, and opt-in `smoke:web-release-readiness`.
2. Verify that the forbidden default-view classes are covered: secrets, provider
   values, env details, raw JSON, low-level ids, provider config ids, and
   internal proposal/event/runtime/ledger language.
3. Fix only the first real default-view leak if one is reproduced.
4. If no leak is reproduced and coverage is sufficient for the current v1.0
   scope, record a Gate 5 closure audit.
5. Do not broaden Advanced / Developer Mode or add new runtime surfaces.

## Stop Rule

Do not produce a v1.0 Production Stable completion report until every gate in
this matrix is `complete` with current evidence.
