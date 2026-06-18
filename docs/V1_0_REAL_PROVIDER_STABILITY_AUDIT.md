# v1.0 Real Provider Stability Audit

Date: 2026-06-16

This audit closes production readiness Gate 3 for the v1.0 supported
OpenAI-compatible Web setup path. It records repeated focused and Broader
review release-readiness evidence against a temporary real OpenAI-compatible
provider without recording the provider key, base URL, model name, raw provider
response, or provider output.

## Gate 3 Scope

Gate 3 requires the real-provider Web workflow to be stable across repeated
focused and Broader review release smokes:

1. configure provider setup through Web;
2. verify the provider connection;
3. start a discussion with AI participants;
4. continue the discussion through participant first responses, strongest
   options, open disagreements, missing evidence, risks, current conclusion,
   and next recommended actions;
5. complete the default path without secrets or internal ids in normal-user
   views.

Provider-specific rate limits, explicit timeout recovery, malformed provider
responses, and partial completion recovery remain Gate 4 evidence. Gate 3 does
not claim broad compatibility with every OpenAI-compatible provider.

## Evidence

Commands were run with temporary provider values supplied only through process
environment. Exact provider values are intentionally omitted.

Focused two-perspective path after the fix:

```bash
DELIBERUM_RELEASE_SMOKE_RUNS=3 corepack pnpm smoke:web-release-readiness
```

Result:

- Passed three consecutive runs.

Broader three-perspective path before the fix:

```bash
DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 \
DELIBERUM_RELEASE_SMOKE_RUNS=3 \
corepack pnpm smoke:web-release-readiness
```

Result:

- Run 1 passed.
- Run 2 reproduced a Deliberum-side blocker: all three independent first
  responses were submitted, but organizer extraction stopped with
  `extraction_validation_failed` and the Web path stayed paused before
  strongest options, disagreements, evidence gaps, risks, and conclusion could
  be produced.

Fix:

- `apps/daemon/src/openai-compatible-extraction-generator.ts` now validates
  OpenAI-compatible organizer output against Deliberum traceability and
  reference rules before returning it to the orchestration runner.
- If initial provider output is schema-valid but not traceable, the generator
  performs the same structured repair retry used for schema-invalid output.
- If structured repair remains invalid while Structured review compatibility is
  enabled, the existing conservative organizer fallback is used.
- The fallback remains grounded only in revealed allowed contributions. It does
  not accept disallowed source ids or raw provider output.

Targeted regression coverage:

- `apps/daemon/test/daemon.test.ts` now covers structured provider repair that
  remains untraceable and verifies that the conservative fallback completes
  extraction without storing rejected provider content, provider secrets, or
  disallowed source ids.

Broader three-perspective path after the fix:

```bash
DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 \
DELIBERUM_RELEASE_SMOKE_RUNS=3 \
corepack pnpm smoke:web-release-readiness
```

Result:

- Passed three consecutive runs.

## Gate 3 Result

Gate 3 is complete for the v1.0 supported OpenAI-compatible Web setup path.

The evidence proves repeated real-provider focused and Broader review
completion through the default Web path after fixing the first reproduced
Deliberum-side blocker. Remaining real-provider recovery details belong to Gate
4, especially provider-specific rate limit, timeout, malformed output, and
partial completion states in normal-user language.
