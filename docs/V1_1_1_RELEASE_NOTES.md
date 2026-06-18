# Deliberum v1.1.1 Release Notes

Status: release notes for the `v1.1.1` source-checkout local-first patch
release. Create the annotated `v1.1.1` tag only after this release notes commit
passes GitHub CI on `main`.

Keep the existing `v1.0.0` and `v1.1.0` tags unchanged.

## Release Focus

Deliberum v1.1.1 keeps the same supported local-first product scope as v1.1 and
focuses on making the source-checkout first run easier to repeat for outside
users.

The patch includes:

- a one-command first-run helper:
  `node scripts/start-local-product.mjs`;
- updated English and Simplified Chinese quickstart docs that point first-time
  users to that helper while keeping the manual path documented;
- fresh local evidence that the helper checks prerequisites, installs
  dependencies, builds Deliberum, starts the local service, returns daemon
  health, and serves the Connect AI Web shell;
- CI release-readiness cleanup: Ubuntu Linux remains covered by the main
  `Validate` job and its full local-start smoke, while the dedicated platform
  local-start job now covers macOS only to avoid a duplicate Linux browser
  dependency installation step.

This release does not add new daemon, runtime, adapter, auth, resource, or
provider capability.

## Supported Path

The recommended source-checkout path is:

1. clone the repository;
2. install Node.js 24 or newer and Corepack-managed pnpm 11;
3. run `node scripts/start-local-product.mjs`;
4. keep the local service terminal running;
5. open `http://127.0.0.1:3877/`;
6. open Connect AI to configure an OpenAI-compatible provider;
7. test the provider connection;
8. start a focused or Broader discussion from New Discussion;
9. use Continue discussion to collect readable participant perspectives,
   strongest options, unresolved points, what needs checking, risks, the
   current answer, and next steps.

Manual setup remains available:

```bash
node scripts/check-local-prerequisites.mjs
corepack pnpm install
corepack pnpm doctor:local
corepack pnpm build
corepack pnpm start:local
```

Supported source-checkout platforms remain:

- macOS with Node.js 24 or newer and Corepack-managed pnpm 11;
- Ubuntu Linux with Node.js 24 or newer and Corepack-managed pnpm 11.

GitHub CI verifies the Ubuntu Linux path through the main `Validate` job, which
runs the full local-start smoke, and verifies macOS through the dedicated
`Local start (macos-latest)` job.

## Release Evidence

Release evidence before this release-notes batch:

- commit `b380697`: fresh clone smoke of `v1.1.0` passed prerequisite check,
  install, doctor, build, local start, `smoke:local-start`, and
  `smoke:web-product-loop` on macOS;
- commit `79699a0`: added `node scripts/start-local-product.mjs`; local
  verification passed syntax checks, dry run, prerequisite output, a real
  temporary-port local start, daemon health, the Connect AI Web shell response,
  docs lint, language lint, public-file lint, and full `corepack pnpm run ci`;
- commit `bf68761`: removed the duplicate Ubuntu platform local-start job after
  the prior GitHub run stalled in a redundant Linux Playwright dependency
  install step; replacement GitHub CI run `27788361935` passed with `Validate`
  and `Local start (macos-latest)`.
- this release-notes batch: local `corepack pnpm run ci` passed.

This release-notes commit must also pass GitHub CI before `v1.1.1` is tagged.

## Upgrade Notes

After the tag is created, source-checkout users can upgrade with:

```bash
git fetch --tags
git checkout v1.1.1
node scripts/start-local-product.mjs
```

Back up `.deliberum/deliberum.sqlite` before upgrading local data if the
previous checkout contains important discussion history.

## Not Claimed

v1.1.1 does not add:

- packaged desktop installers;
- Windows or WSL2 support;
- public hosted service operation;
- production identity, SSO, or public multi-user authorization;
- multiple named provider accounts;
- broad OpenAI-compatible provider compatibility guarantees;
- automatic future schema migrations.

Those remain post-v1.1.1 work unless separately scoped and verified.
