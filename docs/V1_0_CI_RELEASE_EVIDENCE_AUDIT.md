# v1.0 CI and Release Evidence Audit

Date: 2026-06-16

This audit closes production readiness Gate 9 for the current v1.0 supported
local-first scope. It verifies that the release checks, automated tests,
language lint, docs lint, product-loop smoke, Web smokes, storage recovery
smoke, GitHub CI, and opt-in real-provider release-readiness evidence are green
and current.

This batch did not add product, runtime, daemon, provider, or infrastructure
behavior. It records current release-readiness evidence only.

## Gate 9 Scope

Gate 9 covers the current release validation chain:

1. local prerequisite check;
2. public language lint;
3. public file hygiene lint;
4. docs link lint;
5. package builds;
6. workspace lint and typecheck;
7. workspace tests;
8. built runtime smoke;
9. local-start smoke;
10. product-loop smoke;
11. storage recovery smoke;
12. Web entry, boundary, resilience, and product-loop browser smokes;
13. opt-in real-provider release-readiness focused and Broader review smokes;
14. latest pushed GitHub CI.

Gate 9 does not require putting real-provider secrets into default CI. The
real-provider smoke stays opt-in because it requires a provider key, network
access, and provider quota.

## Local CI Evidence

Command:

```bash
corepack pnpm run ci
```

Result: passed.

Coverage from the command:

- `doctor:local`;
- `lint:language`;
- `lint:public-files`;
- `lint:docs`;
- package builds;
- evaluation fixture lint;
- workspace lint;
- workspace typecheck;
- workspace tests;
- full workspace build;
- `smoke:built`;
- `smoke:local-start`;
- `smoke:product-loop`;
- `smoke:storage-recovery`;
- `smoke:web-entry`;
- `smoke:web-boundaries`;
- `smoke:web-resilience`;
- `smoke:web-product-loop`.

## GitHub CI Evidence

Latest pushed GitHub CI before this audit batch:

- run: `27576888474`;
- commit: `2450d92fde762eb4dc3017a170e9c1ab4b1d2b26`;
- workflow: `CI`;
- result: success.

GitHub CI also includes the supported-platform local-start matrix:

- `ubuntu-latest`;
- `macos-latest`.

## Real-Provider Release-Readiness Evidence

The repository-local `.env` provider setup was checked first. It did not pass
provider verification because the configured endpoint was unreachable. The
smoke stopped before discussion start and showed the normal-user recovery path.
This is safe recovery evidence, not a successful real-provider product-loop
pass.

A temporary reachable OpenAI-compatible provider was then supplied only through
environment variables read from hidden stdin in the shell session. The API key,
base URL, model name, raw provider response, and provider output were not
written to source files, docs, snapshots, logs, or default Web UI.

Commands:

```bash
corepack pnpm smoke:web-release-readiness
DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 corepack pnpm smoke:web-release-readiness
```

Results:

- focused/default release-readiness browser smoke: passed;
- Broader review three-perspective release-readiness browser smoke: passed.

The smoke path covered:

1. isolated local daemon and Web UI startup;
2. Web-managed provider setup;
3. provider verification;
4. discussion start with AI participants;
5. discussion continuation;
6. readable participant perspectives;
7. strongest current options;
8. open disagreements;
9. missing evidence;
10. risks;
11. current conclusion;
12. next recommended actions;
13. default-view safety scans for secrets, provider values, env var names,
    provider config ids, raw JSON, and low-level ids.

## Gate 9 Result

Gate 9 is complete for the current v1.0 supported scope.

The default CI chain is green locally, the latest pushed GitHub CI is green,
and the opt-in real-provider release-readiness path has fresh focused and
Broader review evidence against a reachable temporary provider.

## Remaining Limits

- Real-provider release-readiness remains opt-in and outside default CI.
- The evidence covers the tested OpenAI-compatible provider path, not broad
  provider compatibility.
- Provider quota, regional network availability, latency, and provider-specific
  behavior remain operational release risks, not default CI guarantees.
