# Deliberum v1.0 Production Readiness Matrix

Updated: 2026-06-15

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
| 2 | Web first-use, Setup / Models, participant readiness, and Discussion Room form one coherent product experience. | `partial` | The v0.1 report, Web tests, and browser smokes prove the primary local Web loop. Setup / Models links naturally into focused and Broader review starts after verification. | Needs a v1.0 product audit after participant/model management is expanded; current evidence is beta-loop focused. |
| 3 | Real OpenAI-compatible provider workflows are stable across repeated focused and broader-review release smokes. | `partial` | `docs/BASIC_PRODUCT_LOOP.md` records repeated focused and Broader review release smokes against one reachable real provider path. | Evidence is not broad enough across providers, slower responses, quota behavior, and longer repeated runs. |
| 4 | Provider setup, verification, failure recovery, rate limit, timeout, malformed output, and partial completion states are handled in normal-user language. | `partial` | Web recovery states and smokes cover verification failure, retryable continuation, failed stages, malformed structured output fallback, and partial first-response recovery. | Rate limit and provider-specific timeout behavior need explicit real-provider recovery evidence. |
| 5 | Default UI never exposes secrets, raw JSON, env details, run/session/ledger/runtime/proposal/event/internal ids, or provider config ids. | `partial` | `smoke:web-product-loop`, `smoke:web-release-readiness`, `smoke:web-entry`, `smoke:web-boundaries`, and `smoke:web-resilience` scan current default paths. | Needs to remain enforced for any new model/participant management and production recovery paths. |
| 6 | Advanced / Developer Mode preserves diagnostics without leading the normal user path. | `partial` | Current docs and smokes keep raw details behind Advanced / Developer Mode for existing default paths. | Needs a v1.0 audit after production setup, participant management, and storage recovery paths are added. |
| 7 | Model / Participant Management supports understandable provider/model/role readiness and editing. | `partial` | Setup / Models shows current participant readiness, explains that one verified OpenAI-compatible provider powers model-backed discussions, and links role assignment to the start page. The start page lets users set a first-response model, optional first-response Perspective A/B/C model overrides, and a separate review role model for Reviewer, Evidence checker, Risk reviewer, and Conclusion writer without exposing provider secrets or low-level provider config ids. Web can save those non-secret role model choices as browser defaults, apply them to later model-backed discussions, and clear them without storing API keys or base URLs. | The default Web path does not yet provide production-grade editing for multiple providers or service-level reusable participant/model role presets across browsers. |
| 8 | README, quickstart, walkthrough, troubleshooting, release notes, and Basic Product Loop docs match the actual UI. | `partial` | README, Basic Product Loop, deployment, walkthrough, and v0.1 completion docs match the beta UI and smokes. | v1.0 release notes do not exist yet, and docs must be updated after production gates 1, 7, and 11 move. |
| 9 | CI, tests, language lint, docs lint, product-loop smoke, Web smoke, and real-provider release-readiness evidence are green and current. | `partial` | Local `corepack pnpm run ci` and GitHub CI are green. CI now separates full Ubuntu validation from supported-platform local-start validation on Ubuntu and macOS. Real-provider release-readiness evidence is recorded. | Real-provider smoke remains opt-in outside default CI and broader provider coverage is still incomplete. |
| 10 | No known normal-user blocker remains in install, startup, setup, verification, discussion start, continuation, conclusion review, or recovery. | `partial` | v0.1 evidence shows no known blocker in the local beta loop with a reachable provider; unreachable provider setup shows safe recovery. Supported-platform local-start verification now covers macOS and Ubuntu Linux. | Production blockers remain in broader provider behavior, participant management, and data/storage recovery. |
| 11 | Data/storage compatibility, upgrade path, and failure recovery are documented and tested enough for production use. | `partial` | SQLite stores reject unsupported schema versions in targeted tests, ledger integrity checks exist, and deployment docs describe local/pre-production persistence modes. | No v1.0 storage compatibility policy, migration/upgrade path, backup/restore runbook, or production recovery test matrix exists yet. |
| 12 | A v1.0 release report confirms evidence, known limits, supported paths, and post-v1.0 backlog. | `missing` | `docs/V0_1_OPEN_BETA_COMPLETION_REPORT.md` exists for v0.1 only. | v1.0 completion report must wait until gates 1 through 11 are complete. |

## Next Production Batch

The first production blocker is still gate 7: Model / Participant Management.
The default Web path now explains and links the current shared provider editing
path for model-backed discussions and lets users assign a first-response model,
individual Perspective A/B/C models, and a separate review role model for one
discussion. It can also save those non-secret role model choices as browser
defaults for later discussions. It still does not let normal users edit multiple
providers or save service-level reusable participant/model role presets across
browsers.

Recommended narrow batch:

1. Inspect the existing Setup / Models state model and Web setup persistence
   limits for provider lists and participant role routing.
2. Choose the smallest production-grade editing increment that does not require
   inventing unsupported secret storage or exposing provider internals.
3. Implement only that product path without exposing secrets, env names,
   provider config ids, or runtime internals.
4. Add English and Simplified Chinese coverage, browser verification, and
   update this matrix.

Do not work on storage migrations or v1.0 release notes before gate 7 has a
production-grade product path.

## Stop Rule

Do not produce a v1.0 Production Stable completion report until every gate in
this matrix is `complete` with current evidence.
