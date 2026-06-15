# v1.0 Model and Participant Management Audit

Date: 2026-06-16

This audit closes production readiness Gate 7 for the v1.0 scope. It does not
expand provider infrastructure. It records what the current Web product proves,
what is deliberately in scope for v1.0, and what remains post-v1.0 work.

## v1.0 Scope Decision

For v1.0 Production Stable, the default Web product supports one Web-managed
OpenAI-compatible provider setup at a time.

Within that supported provider setup, users can manage the model-backed
discussion lineup in product language:

- configure the provider API key, base URL, model, and structured review
  compatibility from Setup / Models;
- verify the provider connection before model-backed starts are enabled;
- choose Focused review or Broader review;
- edit default role model choices from Setup / Models;
- set a first-response model;
- set a separate review role model for Reviewer, Evidence checker, Risk
  reviewer, and Conclusion writer;
- set optional Perspective A/B/C first-response model overrides;
- save, apply, and clear non-secret role defaults through the local service;
- start model-backed discussions without seeing API keys, base URLs, provider
  configuration ids, env var names, or raw internal runtime data in the default
  UI.

Multiple named provider accounts and simultaneous multi-provider Web editing are
not part of the v1.0 default Web scope. Current code stores the Web-managed
provider setup as a single local daemon env block. Adding multiple named
providers would require a real secret/named-provider storage design, migration
policy, recovery behavior, and default-view safety coverage. That is post-v1.0
work unless the v1.0 product scope is explicitly changed.

## Evidence

### Setup / Models

The default Setup / Models page now covers provider, model, and participant
readiness in user language:

- local service connection status;
- local demo readiness;
- OpenAI-compatible provider readiness;
- provider setup checklist;
- Web provider setup form;
- provider verification action;
- focused and broader model-backed start links after verification;
- saved role-default summary;
- direct role-default editor for default discussion depth, first-response model,
  review role model, and optional Perspective A/B/C model overrides.

`apps/web/test/App.test.tsx` covers:

- provider setup visibility and safe default text;
- verified provider gating before model-backed starts;
- focused and broader start links with perspective depth;
- saved role defaults in Setup / Models without provider internals;
- direct role-default editing from Setup / Models;
- Simplified Chinese coverage for participant-management setup text;
- default views not exposing `DELIBERUM_OPENAI_API_KEY`, base URL env names, or
  provider configuration ids.

### Start Discussion

`/runs/new` remains the per-discussion override surface. It supports:

- demo versus model-backed participant source;
- Focused review versus Broader review;
- first-response model override;
- review role model override;
- custom Perspective A/B/C model overrides;
- applying and clearing saved role defaults;
- creating model-backed run plans without showing internal provider config ids
  in the default UI.

### Browser Product Loop

`corepack pnpm smoke:web-product-loop` verifies the browser path:

1. Opens Setup / Models.
2. Enters provider API key, base URL, and model.
3. Saves setup without rendering the secret.
4. Verifies the provider.
5. Confirms focused and broader model-backed start links.
6. Sets first-response, review role, and Perspective A model choices.
7. Saves role defaults from the start page.
8. Returns to Setup / Models and confirms the role-default summary and editor
   are populated.
9. Saves role defaults directly from Setup / Models.
10. Starts a model-backed discussion and continues it through readable
    perspectives, strongest option, open disagreement, missing evidence, risk,
    current conclusion, and next actions.
11. Scans default setup, start, room, retry, and outcome surfaces for secrets,
    env var names, provider configuration ids, raw JSON, low-level ids, and raw
    provider error categories.

### CI

The latest pushed Gate 7 implementation passed GitHub CI:

- run: `27565270036`;
- commit: `4c1d740992996cafcafc59c1ef7b08c2ff0b3c8d`;
- conclusion: `success`.

Local full CI also passed before the commit was pushed.

## Gate 7 Result

Gate 7 is complete for the v1.0 supported Web scope.

The accepted v1.0 limit is explicit: one Web-managed OpenAI-compatible provider
setup, with production-grade role/model management for that provider. Multi
named provider management is a post-v1.0 product and architecture item.

## Post-v1.0 Backlog

- Multiple named OpenAI-compatible provider setups.
- Role defaults bound to named providers.
- Secret storage and migration policy for named provider accounts.
- Provider import/export or backup behavior that does not expose secrets.
- Additional provider-type setup surfaces beyond the current OpenAI-compatible
  Web path.
