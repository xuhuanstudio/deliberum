# Deliberum v0.1 Open Beta Completion Report

Date: 2026-06-15

## Verdict

Deliberum is ready to tag as a v0.1 Open Beta / Release Candidate for the
local-first source-checkout product loop.

This verdict covers the documented local Web path: clone the repository, install
dependencies, build, start the local Web product, configure an OpenAI-compatible
provider from Web, verify it, start a model-backed discussion, continue it to a
reviewable conclusion, and understand perspectives, strongest options,
disagreements, evidence gaps, risks, current conclusion, and next actions
without default UI exposure of secrets, raw JSON, env details, provider config
ids, internal ids, or runtime concepts.

This verdict does not claim production hosting, public multi-user deployment,
broad provider compatibility, packaged desktop distribution, quota resilience,
or long-running operational stability.

## Release Gate Audit

| Gate | Status | Evidence |
| --- | --- | --- |
| 1. Local startup is documented, repeatable, and verified. | Complete | `README.md` documents prerequisites, `doctor:local`, build, `start:local`, the local Web URL, and troubleshooting for prerequisite, build, missing Web assets, busy port, local service, provider verification, and paused real-provider discussion failures. `corepack pnpm run ci` runs `doctor:local` and `smoke:local-start`. |
| 2. Web first-use path is human-first and understandable within 30 seconds. | Complete | The README and Web entry copy describe Deliberum as a human-first multi-perspective deliberation product. `smoke:web-entry` verifies connected and unavailable local-service first-view paths in a real browser. |
| 3. Setup / Models can safely configure and verify a provider from Web. | Complete | `/setup/models` supports API key, base URL, model, and Structured review compatibility setup. Web tests and `smoke:web-product-loop` cover save, readiness, and Verify connection without rendering secrets. Real-provider release smokes also use this Web-managed setup path. |
| 4. Participant readiness is understandable in user language. | Complete | Setup / Models shows Perspective A, Perspective B, optional Perspective C, Reviewer, Evidence checker, Risk reviewer, and Conclusion writer in user language. Tests cover ready, verify-first, and localized Simplified Chinese states. |
| 5. Discussion Room supports the full user loop. | Complete | Web tests, `smoke:product-loop`, `smoke:web-product-loop`, and real-provider release smokes cover discussion start, readable participant contributions, strongest options, open disagreements, missing evidence, risks, current conclusion, next actions, and Continue discussion. |
| 6. Real-provider focused and broader-review release smokes pass repeated runs where practical. | Complete | `docs/BASIC_PRODUCT_LOOP.md` records repeated real-provider focused and Broader review runs. The latest post-change verification passed one fresh focused two-perspective run and one fresh Broader review three-perspective run using a temporary provider supplied only through environment variables. Earlier release-candidate evidence includes five consecutive focused runs and three consecutive Broader review runs against the same reachable provider path. |
| 7. Default UI hides secrets and internal runtime data; Advanced can keep diagnostics. | Complete | `smoke:web-product-loop`, `smoke:web-release-readiness`, `smoke:web-entry`, `smoke:web-boundaries`, and `smoke:web-resilience` scan default views for secrets, provider values, env names, provider config ids, raw JSON, low-level id labels, and internal runtime language. Advanced / Developer Mode remains the place for diagnostics. |
| 8. README, quickstart, walkthrough, troubleshooting, and Basic Product Loop docs match actual UI. | Complete | `README.md`, `docs/BASIC_PRODUCT_LOOP.md`, `docs/WEB_DISCUSSION_ROOM_WALKTHROUGH.md`, and `docs/DEPLOYMENT.md` point to the same local product path and setup flow. `corepack pnpm lint:docs` validates local Markdown links. |
| 9. CI, tests, language lint, docs lint, and product-loop smokes pass. | Complete | Local `corepack pnpm run ci` passed after the latest docs update. GitHub CI passed for `cac457c` (`27541816273`), `9670c36` (`27541156503`), and `5174a0b` (`27540483830`). |
| 10. No known normal-user blocker remains on setup, verification, discussion start, continuation, conclusion, or next actions. | Complete | The latest focused and Broader real-provider smokes completed the primary user loop. The repository-local provider endpoint remains unreachable, but Web shows normal-user recovery actions and this is recorded as provider setup failure recovery, not a Deliberum-side product-loop blocker. |

## Commands Run

Recent release-convergence checks:

```bash
corepack pnpm --filter @deliberum/web test
corepack pnpm --filter @deliberum/web typecheck
corepack pnpm lint:language
corepack pnpm lint:docs
corepack pnpm smoke:web-product-loop
corepack pnpm run ci
```

Recent opt-in real-provider checks, with provider key, base URL, and model
supplied only through environment variables or hidden stdin:

```bash
DELIBERUM_RELEASE_SMOKE_RUNS=1 corepack pnpm smoke:web-release-readiness
DELIBERUM_RELEASE_SMOKE_RUNS=1 \
DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 \
corepack pnpm smoke:web-release-readiness
```

Earlier recorded release-candidate stability checks include:

```bash
DELIBERUM_RELEASE_SMOKE_RUNS=5 corepack pnpm smoke:web-release-readiness
DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 \
DELIBERUM_RELEASE_SMOKE_RUNS=3 \
corepack pnpm smoke:web-release-readiness
```

## Real-Provider Smoke Results

- Focused two-perspective path: passed in the latest fresh run after the
  verified Setup / Models focused and broader start links were added.
- Broader review three-perspective path: passed in the latest fresh run after
  the same change.
- Earlier reachable-provider stability evidence: five consecutive focused runs
  and three consecutive Broader review runs passed in fresh isolated local
  services.
- Repository-local provider configuration: still exercises the safe provider
  verification recovery path because its endpoint is unreachable. The default
  Web view shows normal-user recovery actions and does not expose provider
  values or raw diagnostics.

No API key, provider base URL, model name, raw provider response, or provider
output is recorded in this report.

## Known Limitations

- v0.1 Open Beta is a source-checkout local-first release, not a packaged
  desktop app or one-click installer.
- Real-provider evidence is strong for the tested OpenAI-compatible provider
  path, but it does not prove broad provider compatibility.
- Provider latency, quota exhaustion, rate limits, and long-running repeated
  usage remain beta risks.
- Deliberum is not a production hosted service and does not provide production
  identity, public multi-user authorization, production resource hosting, or
  production multi-writer coordination.
- The local Web path is the supported beta product path. Advanced daemon, CLI,
  resource, audit, WebGET, and adapter surfaces remain lower-level local or
  pre-production capabilities.
- The README still advises maintainers to complete name, domain, package-scope,
  and trademark checks before a formal public launch.

## Post-v0.1 Backlog

- Run release-readiness smokes against more OpenAI-compatible providers and
  fix the first normal-user blocker that appears.
- Improve first-run packaging beyond source checkout, such as an installer or
  simpler local launcher.
- Expand model and participant management for multiple providers, multiple
  models, and role-specific assignment when it can be done without exposing
  secrets or backend concepts.
- Continue improving real-provider failure recovery for rate limits, timeouts,
  partial responses, and schema-invalid output.
- Improve long-run beta stability evidence, including slower providers and
  larger repeated release-smoke batches.
- Keep internationalization coverage aligned as user-facing Web copy changes.
- Continue security review for WebGET, resource delivery, daemon error handling,
  and public-open-source hygiene.

## Tag Readiness

The repository is ready to tag as a v0.1 Open Beta / Release Candidate for the
documented local-first Web product loop, subject to maintainer approval of the
known limitations above.

Recommended tag shape: `v0.1.0-open-beta.1` or `v0.1.0-rc.1`.

Do not describe this tag as a production release, public hosted service, or
broad provider-compatibility guarantee.
