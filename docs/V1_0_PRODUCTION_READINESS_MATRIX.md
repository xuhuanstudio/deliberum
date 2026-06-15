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
| 1 | Local install/start is reliable, documented, and repeatable across supported platforms. | `partial` | `README.md` documents source-checkout setup, `doctor:local`, build, `start:local`, and troubleshooting. `corepack pnpm run ci` and GitHub CI verify the path on `ubuntu-latest`; local macOS runs have also passed in this development environment. | Supported platforms are not explicitly declared for v1.0, and CI does not yet prove install/start on each supported platform. |
| 2 | Web first-use, Setup / Models, participant readiness, and Discussion Room form one coherent product experience. | `partial` | The v0.1 report, Web tests, and browser smokes prove the primary local Web loop. Setup / Models links naturally into focused and Broader review starts after verification. | Needs a v1.0 product audit after participant/model management is expanded; current evidence is beta-loop focused. |
| 3 | Real OpenAI-compatible provider workflows are stable across repeated focused and broader-review release smokes. | `partial` | `docs/BASIC_PRODUCT_LOOP.md` records repeated focused and Broader review release smokes against one reachable real provider path. | Evidence is not broad enough across providers, slower responses, quota behavior, and longer repeated runs. |
| 4 | Provider setup, verification, failure recovery, rate limit, timeout, malformed output, and partial completion states are handled in normal-user language. | `partial` | Web recovery states and smokes cover verification failure, retryable continuation, failed stages, malformed structured output fallback, and partial first-response recovery. | Rate limit and provider-specific timeout behavior need explicit real-provider recovery evidence. |
| 5 | Default UI never exposes secrets, raw JSON, env details, run/session/ledger/runtime/proposal/event/internal ids, or provider config ids. | `partial` | `smoke:web-product-loop`, `smoke:web-release-readiness`, `smoke:web-entry`, `smoke:web-boundaries`, and `smoke:web-resilience` scan current default paths. | Needs to remain enforced for any new model/participant management and production recovery paths. |
| 6 | Advanced / Developer Mode preserves diagnostics without leading the normal user path. | `partial` | Current docs and smokes keep raw details behind Advanced / Developer Mode for existing default paths. | Needs a v1.0 audit after production setup, participant management, and storage recovery paths are added. |
| 7 | Model / Participant Management supports understandable provider/model/role readiness and editing. | `blocked by product gap` | Setup / Models shows current participant readiness and one verified OpenAI-compatible provider can power focused or Broader review. | The default Web path does not yet provide production-grade editing for multiple providers, multiple models, and role-specific participant assignment. |
| 8 | README, quickstart, walkthrough, troubleshooting, release notes, and Basic Product Loop docs match the actual UI. | `partial` | README, Basic Product Loop, deployment, walkthrough, and v0.1 completion docs match the beta UI and smokes. | v1.0 release notes do not exist yet, and docs must be updated after production gates 1, 7, and 11 move. |
| 9 | CI, tests, language lint, docs lint, product-loop smoke, Web smoke, and real-provider release-readiness evidence are green and current. | `partial` | Local `corepack pnpm run ci` and GitHub CI are green. Real-provider release-readiness evidence is recorded. | CI is currently single-platform, and real-provider smoke remains opt-in outside default CI. |
| 10 | No known normal-user blocker remains in install, startup, setup, verification, discussion start, continuation, conclusion review, or recovery. | `partial` | v0.1 evidence shows no known blocker in the local beta loop with a reachable provider; unreachable provider setup shows safe recovery. | Production blockers remain in supported-platform install/start evidence, broader provider behavior, participant management, and data/storage recovery. |
| 11 | Data/storage compatibility, upgrade path, and failure recovery are documented and tested enough for production use. | `partial` | SQLite stores reject unsupported schema versions in targeted tests, ledger integrity checks exist, and deployment docs describe local/pre-production persistence modes. | No v1.0 storage compatibility policy, migration/upgrade path, backup/restore runbook, or production recovery test matrix exists yet. |
| 12 | A v1.0 release report confirms evidence, known limits, supported paths, and post-v1.0 backlog. | `missing` | `docs/V0_1_OPEN_BETA_COMPLETION_REPORT.md` exists for v0.1 only. | v1.0 completion report must wait until gates 1 through 11 are complete. |

## Next Production Batch

The first production blocker is gate 1: supported-platform install/start
evidence. The next batch should define the v1.0 supported platform policy and
add the smallest verification that proves the source-checkout local start path
on those platforms.

Recommended narrow batch:

1. Define supported v1.0 platforms in `README.md` or a dedicated install guide.
2. Add GitHub CI coverage for at least the install/build/local-start path on
   each supported platform, or explicitly narrow supported platforms if broader
   CI cannot pass.
3. Keep full browser product-loop CI on the primary platform if cross-platform
   browser smokes are too slow, but do not claim full cross-platform support
   without platform-specific install/start evidence.
4. Update this matrix with command/run evidence.

Do not work on provider expansion, participant-management editing, storage
migrations, or v1.0 release notes before gate 1 has a supported-platform answer.

## Stop Rule

Do not produce a v1.0 Production Stable completion report until every gate in
this matrix is `complete` with current evidence.
