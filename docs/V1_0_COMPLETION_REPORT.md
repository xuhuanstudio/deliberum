# Deliberum v1.0 Production Stable Completion Report

Date: 2026-06-16

## Verdict

Deliberum reached the v1.0 Production Stable source-checkout local-first
release scope, and `v1.0.0` has already been created on commit
`6f7fdec11219a9f4772c50b8cc8a13949fe3346a`.

This verdict covers the supported local Web product path: clone the repository,
install with the documented toolchain on a supported platform, build, start the
local product, configure one OpenAI-compatible provider setup from Web, verify
the provider, manage AI participant model readiness, run focused or Broader
discussions with AI participants, review perspectives, strongest options,
open disagreements, evidence gaps, risks, current conclusion, and next actions,
recover from common setup, provider, continuation, and storage failures, and
keep normal default UI free of secrets, raw JSON, env details, provider config
ids, and internal runtime ids.

This verdict does not claim public hosted service operation, production identity
or public multi-user authorization, packaged desktop installation, broad
OpenAI-compatible provider compatibility, distributed storage, automatic future
schema migrations, Windows or WSL2 support, or simultaneous named provider
accounts.

## Supported v1.0 Path

The supported source-checkout product path is:

1. clone the repository;
2. install Node.js 24 or newer and Corepack-managed pnpm 11;
3. run `node scripts/check-local-prerequisites.mjs`;
4. run `corepack pnpm install`;
5. run `corepack pnpm build`;
6. run `corepack pnpm start:local`;
7. open `http://127.0.0.1:3877/`;
8. configure API key, base URL, model, and Structured review compatibility from
   `/setup/models`;
9. verify the provider connection from Web;
10. set discussion depth and participant model choices in Connect AI when
    needed;
11. start a focused or Broader discussion with AI participants;
12. continue the discussion to readable perspectives, strongest options, open
    disagreements, evidence gaps, risks, current conclusion, and next actions;
13. use normal-user recovery actions when provider setup, continuation, or
    storage recovery needs attention.

Supported source-checkout platforms:

- macOS with Node.js 24 or newer and Corepack-managed pnpm 11;
- Ubuntu Linux with Node.js 24 or newer and Corepack-managed pnpm 11.

## Production Gate Results

| Gate | Status | Evidence |
| --- | --- | --- |
| 1. Local install/start is reliable, documented, and repeatable across supported platforms. | Complete | README documents the source-checkout path and supported platforms. CI includes `doctor:local`, build, `smoke:local-start`, and macOS/Ubuntu local-start jobs. |
| 2. Web first-use, Connect AI, participant readiness, and Discussion Room form one coherent product experience. | Complete | `docs/V1_0_WEB_PRODUCT_COHERENCE_AUDIT.md`, `smoke:web-entry`, and `smoke:web-product-loop`. |
| 3. Real OpenAI-compatible provider workflows are stable across repeated focused and broader-review release smokes. | Complete | `docs/V1_0_REAL_PROVIDER_STABILITY_AUDIT.md` records repeated focused and Broader real-provider smokes and the fixed structured extraction blocker. |
| 4. Provider setup, verification, failure recovery, rate limit, timeout, malformed output, and partial completion states are handled in normal-user language. | Complete | `smoke:web-resilience`, daemon/adapter provider error tests, and Gate 3 malformed structured output fallback evidence. |
| 5. Default UI never exposes secrets, raw JSON, env details, run/session/ledger/runtime/proposal/event/internal ids, or provider config ids. | Complete | `docs/V1_0_DEFAULT_UI_SAFETY_AUDIT.md`, `smoke:web-entry`, `smoke:web-boundaries`, `smoke:web-product-loop`, `smoke:web-resilience`, and opt-in real-provider safety scans. |
| 6. Advanced / Developer Mode preserves diagnostics without leading the normal user path. | Complete | `docs/V1_0_ADVANCED_MODE_AUDIT.md` and `smoke:web-boundaries`. |
| 7. Model / Participant Management supports understandable provider/model/role readiness and editing. | Complete | `docs/V1_0_MODEL_PARTICIPANT_MANAGEMENT_AUDIT.md`, Web tests, and `smoke:web-product-loop`. |
| 8. README, quickstart, walkthrough, troubleshooting, release notes, and Basic Product Loop docs match the actual UI. | Complete | `docs/V1_0_RELEASE_NOTES.md`, `docs/BASIC_PRODUCT_LOOP.md`, README, deployment/storage/walkthrough docs, and `lint:docs`. |
| 9. CI, tests, language lint, docs lint, product-loop smoke, Web smoke, and real-provider release-readiness evidence are green and current. | Complete | `docs/V1_0_CI_RELEASE_EVIDENCE_AUDIT.md`, local `corepack pnpm run ci`, and GitHub CI success through Gate 10. |
| 10. No known normal-user blocker remains in install, startup, setup, verification, discussion start, continuation, conclusion review, or recovery. | Complete | `docs/V1_0_NORMAL_USER_BLOCKER_AUDIT.md` records the release-wide blocker audit after Gates 1 through 9 and Gate 11 were complete. |
| 11. Data/storage compatibility, upgrade path, and failure recovery are documented and tested enough for production use. | Complete | `docs/STORAGE_RECOVERY.md`, `docs/V1_0_STORAGE_RECOVERY_AUDIT.md`, `smoke:storage-recovery`, and storage/daemon persistence tests. |
| 12. A v1.0 release report confirms evidence, known limits, supported paths, and post-v1.0 backlog. | Complete | This report. |

## Final Verification Evidence

Local verification for the completion-report batch:

```bash
corepack pnpm run ci
```

Result: passed.

The command includes:

- local prerequisite check;
- language, public-file, and docs lint;
- package builds;
- workspace lint, typecheck, and tests;
- built runtime smoke;
- local-start smoke;
- product-loop smoke;
- storage recovery smoke;
- Web entry, boundary, resilience, and product-loop browser smokes.

Recent GitHub CI evidence:

- Gate 10 commit: `cecfbada4406e9ce0b9506a7a72e12e463ba7779`;
- run: `27579020520`;
- result: success;
- jobs: Validate, Local start on Ubuntu Linux, and Local start on macOS.

The final completion-report commit must also pass GitHub CI before maintainers
create a v1.0 tag.

## Security and Secret Handling

The supported Web setup path lets users configure provider credentials locally,
but v1.0 does not display API key values in default UI, docs, logs, snapshots,
or raw default views. Real-provider release evidence intentionally omits API
keys, base URLs, model names, raw provider responses, and provider output.

Advanced / Developer Mode may expose diagnostics after intentional user action,
but normal first-use setup, discussion start, Discussion Room review, current
conclusion review, and recovery paths remain product-facing and do not require
users to understand daemon, runtime, ledger, proposal, event, projection,
resource, or raw JSON concepts.

## Known Limits

These limits are accepted for v1.0 Production Stable:

- source-checkout local-first release only, not a packaged installer;
- macOS and Ubuntu Linux supported, Windows and WSL2 not supported yet;
- one Web-managed OpenAI-compatible provider setup at a time;
- no broad provider compatibility guarantee beyond the tested
  OpenAI-compatible path;
- real-provider release smoke remains opt-in because it requires a provider
  secret, network access, and quota;
- no public hosted service operation;
- no production identity, SSO, or public multi-user authorization;
- no production distributed storage or multi-writer coordination;
- no automatic future schema migrations;
- no cross-machine provider-secret migration;
- maintainers should complete name, domain, package-scope, and trademark checks
  before a formal public launch.

## Post-v1.0 Backlog

- Packaged installer or simpler local launcher.
- Windows and WSL2 local-start support after CI coverage exists.
- Multiple named provider accounts and participant model choices bound to named
  providers.
- Secret storage and migration policy for named provider accounts.
- Broader OpenAI-compatible provider release-smoke coverage.
- Additional provider-type setup surfaces beyond the current
  OpenAI-compatible path.
- More real-provider recovery evidence for quota exhaustion, slower providers,
  long-running batches, partial responses, and provider-specific malformed
  outputs.
- Packaged backup and restore commands in the CLI.
- Automatic migrations for future persisted schema versions.
- Hosted/public-service identity, authorization, resource hosting, and
  distributed storage only after separate production architecture work.

## Tag Readiness

Released tag: `v1.0.0`.

Do not move or recreate the existing `v1.0.0` tag. Current `main` contains
post-v1.0.0 changes. Any new release from current `main` should use a later
SemVer tag after maintainer approval and green GitHub CI.
