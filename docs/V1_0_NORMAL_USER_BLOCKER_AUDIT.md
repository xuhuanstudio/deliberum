# v1.0 Normal User Blocker Audit

Date: 2026-06-16

This audit closes production readiness Gate 10 for the current v1.0
local-first supported scope. It checks whether a normal outside user still has
a known Deliberum-side blocker across install, startup, setup, verification,
discussion start, continuation, conclusion review, or recovery.

This batch did not add product behavior, runtime behavior, daemon capability,
provider capability, storage behavior, or infrastructure. No new blocker was
reproduced, so the batch records the release-wide blocker audit only.

## Gate 10 Scope

Gate 10 covers the supported source-checkout product path:

1. install prerequisites on a supported platform;
2. build and start the local Web product;
3. understand local service status;
4. configure the supported OpenAI-compatible provider setup from Web;
5. verify the provider connection;
6. manage participant and role model readiness in normal-user language;
7. start a model-backed discussion;
8. continue the discussion to readable perspectives, strongest options, open
   disagreements, evidence gaps, risks, current conclusion, and next actions;
9. recover from common provider, continuation, and storage failures;
10. complete the normal path without default exposure of secrets, raw JSON,
    environment details, provider config ids, or internal runtime ids.

Gate 10 does not claim packaged desktop installation, Windows or WSL2 support,
public hosted service operation, broad provider compatibility, production
identity, multi-user authorization, distributed storage, or simultaneous named
provider accounts.

## Release-Wide Path Audit

| Product path area | Current evidence | Blocker result |
| --- | --- | --- |
| Install and local start | Gate 1 evidence covers README prerequisites, `doctor:local`, build, `start:local`, `smoke:local-start`, and GitHub CI local-start checks on macOS and Ubuntu Linux. | No known supported-platform install/start blocker remains. |
| First-use Web entry | Gate 2 evidence covers the landing page, local service status, unavailable-service guidance, Setup / Models, Start Discussion, Discussion Room, and current conclusion as one coherent user path. | No known first-use product-coherence blocker remains. |
| Provider setup and verification | Gates 3 and 4 cover Web-managed OpenAI-compatible provider setup, verification, real-provider focused and Broader review release smokes, and normal-user recovery for verification failures, rate limits, timeouts, malformed output, failed stages, and partial completion states. | No known Deliberum-side provider setup or verification blocker remains for the supported tested path. |
| Participant and model readiness | Gate 7 covers one Web-managed OpenAI-compatible provider setup with readable role defaults, first-response model, review role model, optional Perspective A/B/C model choices, per-discussion overrides, save/apply/clear behavior, and default-view safety. | No known participant/model readiness blocker remains inside the v1.0 supported scope. |
| Discussion start and continuation | Gates 2, 3, 4, 7, and 9 cover model-backed starts, focused and Broader paths, Continue discussion, readable participant contributions, strongest options, disagreements, evidence gaps, risks, current conclusion, and next actions. | No known discussion-start or continuation blocker remains for the supported path. |
| Default UI safety | Gates 5 and 6 cover default Web safety and Advanced / Developer Mode boundaries across landing, Setup / Models, `/runs`, Discussion Room, current conclusion, recovery states, and legacy Advanced surfaces. | No known normal default-view exposure blocker remains. |
| Storage recovery | Gate 11 covers SQLite backup, restore, process-lock shutdown, ledger-integrity checks, unsupported schema rejection, and invalid persisted data failure behavior. | The reproduced SQLite process-lock restore blocker was fixed; no known supported storage recovery blocker remains. |
| Release validation | Gate 9 covers local full CI, docs lint, language lint, public-file lint, product-loop smoke, storage recovery smoke, Web entry/boundary/resilience/product-loop smokes, opt-in real-provider focused and Broader review smokes, and GitHub CI success for current HEAD. | No known release-validation blocker remains before the final v1.0 completion report. |

## Search and Review Notes

The current audit searched the v1.0 release docs, Basic Product Loop matrix,
README, and roadmap for blocker signals including `blocked by`, `partial`,
`missing`, `not verified`, `blocker`, `failed`, `failure`, `fails`, `needs`,
`remaining gate`, `known limitation`, `TODO`, and `FIXME`.

The relevant current hits are:

- Gate 10 itself was still marked `partial` before this audit;
- Gate 12 is still `missing` because the final completion report must wait
  until Gates 1 through 11 are complete;
- historical real-provider and storage blockers are documented with fixes and
  passing follow-up evidence;
- provider endpoint unreachability is covered as a normal-user setup recovery
  path, not a Deliberum-side product-loop blocker;
- post-v1.0 limits such as packaged installers, broad provider compatibility,
  Windows/WSL2 support, public hosted service operation, production auth,
  distributed storage, and multiple named provider accounts are explicitly
  outside the current v1.0 supported scope.

No search result identified a current unhandled normal-user blocker inside the
supported v1.0 path.

## Gate 10 Result

Gate 10 is complete for the current v1.0 supported local-first scope.

The current evidence does not show a known normal-user blocker in supported
install, startup, setup, verification, discussion start, continuation,
conclusion review, or recovery. If a new normal-user blocker is reproduced
before tagging v1.0, fix that blocker before producing or updating the final
completion report.
