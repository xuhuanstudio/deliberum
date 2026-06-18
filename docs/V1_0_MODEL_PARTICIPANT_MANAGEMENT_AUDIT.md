# v1.0 Model and Participant Management Audit

Date: 2026-06-16

This audit closes production readiness Gate 7 for the v1.0 scope. It does not
expand provider infrastructure. It records what the current Web product proves,
what is deliberately in scope for v1.0, and what remains post-v1.0 work.

## v1.0 Scope Decision

For v1.0 Production Stable, the default Web product supports one Web-managed
OpenAI-compatible provider setup at a time.

Within that supported provider setup, users can manage the AI participant
lineup in product language:

- configure the provider API key, base URL, model, and structured review
  compatibility from Connect AI;
- verify the provider connection before starts with AI participants are enabled;
- choose Focused review or Broader review;
- edit default participant model choices from Connect AI;
- set a model for first replies;
- set a separate model for review and answer steps used by Reviewer, Evidence
  checker, Risk reviewer, and Conclusion writer;
- set optional Perspective A/B/C first-response model overrides;
- save, apply, and clear non-secret participant choices through the local
  service;
- start discussions with AI participants without seeing API keys, base URLs,
  provider configuration ids, env var names, or raw internal runtime data in the
  default UI.

Multiple named provider accounts and simultaneous multi-provider Web editing are
not part of the v1.0 default Web scope. Current code stores the Web-managed
provider setup as a single local daemon env block. Adding multiple named
providers would require a real secret/named-provider storage design, migration
policy, recovery behavior, and default-view safety coverage. That is post-v1.0
work unless the v1.0 product scope is explicitly changed.

## Evidence

### Connect AI

The default Connect AI page (`/setup/models`) now covers provider, model, and
participant readiness in user language:

- local service connection status;
- local demo readiness;
- OpenAI-compatible provider readiness;
- provider setup checklist;
- Web provider setup form;
- provider verification action;
- focused and broader start links after verification;
- saved participant-choice summary;
- direct participant-choice editor for default discussion depth, model for first
  replies, model for review and answer, and optional Perspective A/B/C model
  overrides.

`apps/web/test/App.test.tsx` covers:

- provider setup visibility and safe default text;
- verified provider gating before starts with AI participants;
- focused and broader start links with perspective depth;
- saved participant choices in Connect AI without provider internals;
- direct participant-choice editing from Connect AI;
- Simplified Chinese coverage for participant-management setup text;
- default views not exposing `DELIBERUM_OPENAI_API_KEY`, base URL env names, or
  provider configuration ids.

### New Discussion

`/runs/new` remains the per-discussion override surface. It supports:

- demo versus AI participant source;
- Focused review versus Broader review;
- model override for first replies;
- model override for review and answer;
- custom Perspective A/B/C model overrides;
- applying and clearing saved participant choices;
- creating AI participant discussion plans without showing internal provider config ids
  in the default UI.

### Browser Product Loop

`corepack pnpm smoke:web-product-loop` verifies the browser path:

1. Opens Connect AI.
2. Enters provider API key, base URL, and model.
3. Saves setup without rendering the secret.
4. Verifies the provider.
5. Confirms focused and broader AI participant start links.
6. Sets first-reply, review and answer, and Perspective A model choices.
7. Saves participant choices from the start page.
8. Returns to Connect AI and confirms the participant-choice summary and editor
   are populated.
9. Saves participant choices directly from Connect AI.
10. Starts a discussion with AI participants and continues it through readable
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
setup, with production-grade participant model management for that provider. Multi
named provider management is a post-v1.0 product and architecture item.

## Post-v1.0 Backlog

- Multiple named OpenAI-compatible provider setups.
- Participant model choices bound to named providers.
- Secret storage and migration policy for named provider accounts.
- Provider import/export or backup behavior that does not expose secrets.
- Additional provider-type setup surfaces beyond the current OpenAI-compatible
  Web path.
