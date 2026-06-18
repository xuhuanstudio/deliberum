# Deliberum v1.1.2 Release Notes

Status: published source-checkout local-first patch release.

The annotated `v1.1.2` tag points to
`6f154521571397c1207e5ed3fb4df24c3490ad0d` and was created after GitHub CI
passed on `main`.

Keep the existing `v1.0.0`, `v1.1.0`, and `v1.1.1` tags unchanged.

## Release Focus

Deliberum v1.1.2 keeps the same supported local-first product scope as v1.1.1
and improves the very first source-checkout command for users who are not sure
whether Node.js and Corepack are ready.

The patch includes:

- a shell bootstrap entry:
  `sh scripts/start-local-product.sh`;
- pre-Node guidance that can explain missing or too-old Node.js before the
  Node-based helper can run;
- automatic delegation to `node scripts/start-local-product.mjs` when Node.js
  and Corepack are ready;
- updated English and Simplified Chinese quickstart docs that point first-time
  users to the shell entry while keeping the Node helper and manual path
  documented.

This release does not add new daemon, runtime, adapter, auth, resource, or
provider capability.

## Supported Path

The recommended source-checkout path is:

1. clone the repository;
2. run `sh scripts/start-local-product.sh`;
3. if the helper reports missing tools, install Node.js 24 or newer, enable
   Corepack, and rerun the same command;
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

- `v1.1.1` fresh clone smoke passed prerequisite check, first-run dry run,
  install, doctor, build, `smoke:local-start`, and `smoke:web-product-loop`;
- GitHub CI run `27789087414` passed on `c19e38a` with `Validate` and
  `Local start (macos-latest)`.
- current batch local verification added `smoke:local-bootstrap` to default CI
  and passed `corepack pnpm run ci`;
- GitHub CI run `27789711225` passed on
  `6f154521571397c1207e5ed3fb4df24c3490ad0d`;
- the pushed `v1.1.2` tag passed a fresh source-checkout smoke covering
  `sh scripts/start-local-product.sh --dry-run`, install, doctor, build,
  `smoke:local-bootstrap`, `smoke:local-start`, and `smoke:web-product-loop`.

Post-release hardening on `main` also re-aligned the opt-in real-provider
release-readiness smoke with the current Connect AI, New Discussion, and
chat-style Discussion Room labels. The focused/default path and Broader review
path then passed without writing provider values or raw model output to docs.

## Upgrade Notes

After the tag is created, source-checkout users can upgrade with:

```bash
git fetch --tags
git checkout v1.1.2
sh scripts/start-local-product.sh
```

Back up `.deliberum/deliberum.sqlite` before upgrading local data if the
previous checkout contains important discussion history.

## Not Claimed

v1.1.2 does not add:

- packaged desktop installers;
- Windows or WSL2 support;
- public hosted service operation;
- production identity, SSO, or public multi-user authorization;
- multiple named provider accounts;
- broad OpenAI-compatible provider compatibility guarantees;
- automatic future schema migrations.

Those remain post-v1.1.2 work unless separately scoped and verified.
