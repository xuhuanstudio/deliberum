# Deliberum v1.2.0 Release Checklist

Updated: 2026-06-22.

Target release: `v1.2.0`.

Release theme: Human-First Web Product Release.

This checklist is the release gate for v1.2.0. It is intentionally scoped to the
outside-user local-first product loop:

```text
clone repository
  -> start the local product
  -> open Web
  -> connect an OpenAI-compatible provider
  -> verify the provider
  -> start a model-backed discussion
  -> follow a readable multi-participant discussion
  -> review current answer, unresolved points, evidence gaps, risks, and next steps
```

If a proposed change does not help an outside user complete this loop, defer it
until after v1.2.0.

## Hard Boundaries

- Do not add broad runtime, daemon, audit, adapter, auth, resource, or provider
  infrastructure for v1.2.0.
- Do not add new provider families unless a reproduced blocker proves the
  existing OpenAI-compatible path is unusable.
- Do not expose API keys, secrets, raw provider responses, raw JSON, internal
  ids, runtime ids, ledger ids, proposal ids, or event ids in the default UI.
- Keep Advanced / Developer Mode available for diagnostics, but never make it
  the normal user path.
- Keep English as the default UI language.
- Keep Simplified Chinese usable for changed user-facing text.
- Work in narrow, verified batches.
- Do not create, move, delete, or recreate release tags until the explicit
  release-tagging step.

## Status Rules

Use these status values:

| Status | Meaning |
| --- | --- |
| `Verified` | Current implementation has direct evidence from docs, tests, browser smokes, or CI for the release criterion. |
| `Partially verified` | The path exists, but release-grade evidence, real-provider coverage, localization proof, or final release docs remain incomplete. |
| `Present but confusing` | The path exists, but user-facing wording, navigation, or docs can mislead an outside user. |
| `Missing` | The current product does not provide the release criterion. |
| `Not browser-verified` | The path appears implemented, but current browser evidence is missing. |

When evidence is indirect or stale, do not mark the item as `Verified`.

## Baseline State

- Current branch: `main`.
- The final `v1.2.0` tag target must be the release-notes commit after local CI
  and GitHub CI pass.
- Current latest GitHub Release: `v1.1.4`.
- Current package metadata versions remain `0.0.0`; the project currently uses
  annotated git tags and release notes for release identity, not package version
  bumps.
- Current local worktree at audit time had no tracked source/doc/package
  changes. `.playwright-cli/` was present only as untracked local Playwright
  tooling/cache output and must not be included in release commits.
- Latest current-branch GitHub CI evidence must be checked on the final
  release-notes commit before creating the annotated `v1.2.0` tag.

## v1.2.0 Release Criteria Audit

| # | Criterion | Current status | Current evidence | Release gap |
| --- | --- | --- | --- | --- |
| 1 | First-run product path | `Verified` | `README.md`, `docs/GETTING_STARTED.md`, and `docs/zh-CN/GETTING_STARTED.md` document the source-checkout path, local prerequisites, first-run helper, manual install/build/start path, local service status, and local-service-unavailable recovery. `package.json` defines `doctor:local`, `start:local`, `ci:local-start`, and `ci`. Fresh isolated source-checkout verification also passed `node scripts/check-local-prerequisites.mjs`, both first-run dry-run helpers, install, `doctor:local`, build, `smoke:local-bootstrap`, `smoke:local-start`, and `smoke:web-product-loop`. | Keep covered. After the final `v1.2.0` tag is created, run source checkout again from the tag. |
| 2 | Connect AI / model setup path | `Verified` | `docs/WEB_UI_SPEC.md` defines `/setup/models` as Connect AI with provider setup, readiness, participant readiness, and secret-hiding boundaries. `scripts/smoke-web-product-loop.mjs` verifies entering API key, base URL, and model; saving setup; testing the provider; showing focused/broader start links; saving non-secret participant choices; and hiding API keys, provider config ids, env names, raw JSON, and internal details in default UI. GitHub CI run `27906018905` passed this smoke through `pnpm run ci`. | Keep covered. For release hardening, run opt-in real-provider release-readiness smoke if credentials are available. |
| 3 | New Discussion path | `Verified` | `docs/WEB_UI_SPEC.md` defines `/runs/new` as New Discussion. `scripts/smoke-web-product-loop.mjs` verifies model-backed start links, focused vs broader review preselection, participant model fields, saved participant choices, and discussion creation from Web without default internal ids. | Keep covered. Do not add participant-management features unless a blocker appears in the current path. |
| 4 | Discussion Room path | `Verified` | `docs/WEB_UI_SPEC.md` defines the Discussion Room. Recent commits `a95434f`, `eee4442`, `8f623f9`, and `770b28d` targeted scrolling, compact composer, reduced metadata, and more conversational timeline messages. `apps/web/test/App.test.tsx` and `scripts/smoke-web-product-loop.mjs` cover readable contributions, reply cues, round boundaries, compact composer metrics, scrolling order, continuation, and default-view safety. GitHub CI run `27906018905` passed after the latest timeline update. | Keep covered. Remaining UX work should be limited to reducing label density or improving actual model output only if browser evidence shows the discussion still reads like a report. |
| 5 | Current Answer / review path | `Verified` | `docs/WEB_UI_SPEC.md` defines `/runs/:runId/outcome` as Current Answer. `scripts/smoke-web-product-loop.mjs` opens the current answer page and verifies strongest option, open disagreement, evidence need, risk, recommendation, next actions, and default-view safety. | Keep covered. Do not expand review surfaces unless the default answer review path becomes confusing in browser verification. |
| 6 | Advanced / Developer boundary | `Verified` | `docs/WEB_UI_SPEC.md` states diagnostics belong behind Advanced / Developer Mode. `scripts/smoke-web-boundaries.mjs`, `scripts/smoke-web-resilience.mjs`, and `scripts/smoke-web-product-loop.mjs` scan default views for low-level ids, raw JSON, env names, provider config ids, provider values, and secrets while preserving explicit Advanced diagnostics. GitHub CI run `27906018905` passed these smokes. | Keep covered. Any new default UI or recovery state must extend the same safety scans. |
| 7 | Localization | `Verified` | English default and Simplified Chinese support exist in `apps/web/src/i18n.tsx`. `docs/zh-CN/GETTING_STARTED.md` provides a Chinese first-use path and now uses v1.2.0 release-candidate platform wording. `pnpm lint:language` is part of `pnpm run ci`. Fresh real-provider release-readiness smoke passed both Chinese-topic focused and Chinese-topic broader review paths. | Keep covered. Run language lint after release-note wording updates and before tagging. |
| 8 | Docs and release readiness | `Partially verified` | README, Getting Started, Chinese Getting Started, Basic Product Loop, Web UI Spec, this checklist, and `docs/V1_2_0_RELEASE_NOTES.md` exist. README and both Getting Started docs now point to the v1.2.0 release checklist and release notes while keeping v1.1.4 as the latest published release until v1.2.0 is tagged. Fresh isolated source-checkout verification passed through the local Web product loop. Real-provider release-readiness smoke passed focused/default, broader review, Chinese-topic focused, and Chinese-topic broader review paths. | Remaining release-critical blocker: commit the final release-note wording, run full local CI, push, verify GitHub CI, then create and verify the final `v1.2.0` tag and GitHub Release. |

## Highest-Impact Blocker

The first blocker to fix is **final v1.2.0 publication after release-candidate
evidence and release notes**.

Why this is first:

- The product loop is implemented and covered by current Web/browser smokes.
- The release-candidate source-checkout path now has fresh isolated-checkout
  evidence.
- Focused, broader review, Chinese-topic focused, and Chinese-topic broader
  real-provider release-readiness smokes now have fresh evidence.
- `docs/V1_2_0_RELEASE_NOTES.md` now records the v1.2.0 release-candidate scope
  and evidence.
- The latest published release remains `v1.1.4` until v1.2.0 is tagged and a
  GitHub Release is created.

Do not start broad UI or backend work before the final release publication gates
are addressed unless a fresh browser audit reproduces a more serious user-loop
blocker.

## Next Narrow Batch

Target criterion: **8. Docs and release readiness**.

Recommended next batch:

1. Run docs lint, language lint, and full local CI after the release-note
   updates.
2. Commit and push the release-note batch.
3. Verify GitHub CI for the release-note commit.
4. Create the annotated `v1.2.0` tag only after CI passes.
5. Push the tag, create the GitHub Release from
   `docs/V1_2_0_RELEASE_NOTES.md`, mark it Latest, and verify source checkout
   from the final tag.

## Release Verification Gates

Before tagging `v1.2.0`, verify:

- `corepack pnpm run ci`
- source-checkout startup path from a fresh checkout or equivalent isolated path;
- `corepack pnpm smoke:web-release-readiness` focused/default path if real
  provider credentials are available;
- broader review real-provider path if credentials are available:
  `DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 corepack pnpm smoke:web-release-readiness`
- Chinese-topic focused path if real provider credentials are available;
- Chinese-topic broader path if real provider credentials are available.

Do not record provider secrets, base URLs, model names, raw provider responses,
or raw model output in docs, logs, snapshots, release notes, or default UI.

## Explicit Post-v1.2.0 Deferrals

Defer these unless a reproduced v1.2.0 product-loop blocker requires them:

- packaged desktop installers;
- hosted SaaS mode;
- public multi-user auth;
- SSO;
- new provider families;
- broad runtime redesign;
- new daemon architecture;
- resource/auth/audit expansion;
- speculative plugin system;
- database migration framework;
- UI redesign unrelated to the primary local-first product loop.
