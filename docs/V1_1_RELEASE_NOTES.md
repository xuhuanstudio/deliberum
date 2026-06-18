# Deliberum v1.1 Release Notes

Status: release notes for the `v1.1.0` source-checkout local-first release.
The annotated `v1.1.0` tag points to
`e5aa73911a7529393ecedc7af2de711628f39488`.

`v1.0.0` already exists on commit
`6f7fdec11219a9f4772c50b8cc8a13949fe3346a`. Do not move or recreate that tag.
The changes after `v1.0.0` include user-facing Web additions, so this release is
`v1.1.0`, not a patch-only tag.

## Release Focus

Deliberum v1.1 keeps the same local-first supported scope as v1.0 and focuses on
making the Web product feel like a normal discussion product rather than an
engineering console.

The main user-facing improvements are:

- a more conversation-first Discussion Room, with readable participant rounds
  and follow-up discussion updates;
- clearer topic-language behavior for AI participant replies;
- Connect AI as the normal user entry for provider setup, readiness checks, and
  participant model choices;
- New Discussion as the normal user entry for starting focused or Broader
  discussions with demo or AI participants;
- clearer AI participant naming, human/AI room boundaries, and participant model
  choice labels;
- improved Web navigation and default product language, with diagnostics kept
  behind Advanced / Developer Mode;
- release and onboarding docs aligned with the current Web labels and the
  already-existing `v1.0.0` tag.

## Supported Path

The supported source-checkout path remains:

1. clone the repository;
2. install Node.js 24 or newer and Corepack-managed pnpm 11;
3. run `node scripts/check-local-prerequisites.mjs`;
4. run `corepack pnpm install`;
5. run `corepack pnpm build`;
6. run `corepack pnpm start:local`;
7. open `http://127.0.0.1:3877/`;
8. open Connect AI to configure an OpenAI-compatible provider;
9. test the provider connection;
10. start a focused or Broader discussion from New Discussion;
11. use Continue discussion to collect readable participant perspectives,
    strongest options, unresolved points, what needs checking, risks, the
    current answer, and next steps.

Supported source-checkout platforms remain:

- macOS with Node.js 24 or newer and Corepack-managed pnpm 11;
- Ubuntu Linux with Node.js 24 or newer and Corepack-managed pnpm 11.

## Release Evidence

Release evidence:

- local `corepack pnpm run ci`: passed before these notes were prepared;
- GitHub CI for commit `9220234b`: passed;
- GitHub CI run: `27784256893`;
- GitHub CI for the `v1.1.0` tag target commit `e5aa739`: passed;
- GitHub CI run for the tag target: `27784918909`;
- Post-tag fresh clone smoke of `v1.1.0`: prerequisite check, install,
  doctor, build, local start, `smoke:local-start`, and
  `smoke:web-product-loop` passed on macOS;
- CI jobs: Validate, Local start on Ubuntu Linux, and Local start on macOS;
- default Web smoke coverage includes entry, boundary, resilience, and product
  loop browser paths;
- local-start smoke continues to cover the source-checkout single-process start
  path;
- storage recovery smoke remains part of default CI.

The `v1.1.0` tag was created only after the release-notes commit passed GitHub
CI on `main`.

## Upgrade Notes

Source-checkout users can upgrade by pulling the new tag, rebuilding, and
starting the local service again:

```bash
git fetch --tags
git checkout v1.1.0
corepack pnpm install
corepack pnpm build
corepack pnpm start:local
```

Back up `.deliberum/deliberum.sqlite` before upgrading local data, especially if
the previous checkout contains important discussion history.

## Not Claimed

v1.1 does not add:

- packaged desktop installers;
- Windows or WSL2 support;
- public hosted service operation;
- production identity, SSO, or public multi-user authorization;
- multiple named provider accounts;
- broad OpenAI-compatible provider compatibility guarantees;
- automatic future schema migrations.

Those remain post-v1.1 work unless separately scoped and verified.

## Tag Status

The `v1.1.0` tag has been created and pushed. Keep the existing `v1.0.0` tag
unchanged.
