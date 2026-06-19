# Deliberum v1.1.3 Release Notes

Status: published source-checkout local-first patch release.

The annotated `v1.1.3` tag points to
`aa599b14a263050a15336011068d140987adebc1` and was created after GitHub CI
passed on `main`.

Keep the existing `v1.0.0`, `v1.1.0`, `v1.1.1`, and `v1.1.2` tags unchanged.

## Release Focus

Deliberum v1.1.3 keeps the same local-first product scope as v1.1.2 and adds
verified native Windows support for the source-checkout local Web startup path.

The patch includes:

- native Windows coverage in the GitHub CI `Local start` platform job;
- Windows first-run documentation that uses
  `node scripts/start-local-product.mjs`;
- Windows-safe Corepack invocation through `cmd.exe` from the prerequisite,
  first-run, and local-start smoke scripts;
- Windows local-start smoke cleanup that terminates the spawned process tree and
  tolerates short-lived temporary-directory locks after the browser checks pass;
- updated English and Simplified Chinese quickstart links to the latest release
  scope.

This release does not add new daemon, runtime, adapter, auth, resource, or
provider capability.

## Supported Path

The recommended source-checkout path is:

1. clone the repository;
2. install Node.js 24 or newer and Corepack-managed pnpm 11;
3. run the platform-specific first-run command;
4. keep the local service terminal running;
5. open `http://127.0.0.1:3877/`;
6. open Connect AI to configure an OpenAI-compatible provider;
7. test the provider connection;
8. start a focused or Broader discussion from New Discussion;
9. use Continue discussion to collect readable participant perspectives,
   strongest options, unresolved points, what needs checking, risks, the current
   answer, and next steps.

Recommended first run on macOS or Ubuntu Linux:

```bash
sh scripts/start-local-product.sh
```

Recommended first run on native Windows:

```bash
node scripts/start-local-product.mjs
```

Manual setup remains available:

```bash
node scripts/check-local-prerequisites.mjs
corepack pnpm install
corepack pnpm doctor:local
corepack pnpm build
corepack pnpm start:local
```

Supported source-checkout platforms are:

- macOS with Node.js 24 or newer and Corepack-managed pnpm 11;
- Ubuntu Linux with Node.js 24 or newer and Corepack-managed pnpm 11;
- native Windows with Node.js 24 or newer and Corepack-managed pnpm 11.

GitHub CI verifies the Ubuntu Linux path through the main `Validate` job, which
runs the full local-start smoke, and verifies macOS plus native Windows through
the dedicated `Local start` platform jobs.

## Release Evidence

Release evidence before this release-notes batch:

- commit `ea83af1`: added native Windows to the local-start platform CI matrix
  and documented the Windows first-run command;
- commit `bbac661`: reproduced and fixed the first Windows command-discovery
  blocker by making the setup scripts callable from Windows CI;
- commit `1311ba3` and commit `2f30962`: reproduced Windows temporary-directory
  cleanup locks after successful local-start browser checks and made cleanup
  retry/tolerate those locks;
- commit `90a6fca`: reproduced that direct `corepack.cmd` spawning fails in
  Node on the GitHub Windows runner with `EINVAL`;
- commit `1beeb4e`: invoked Corepack through `cmd.exe /d /s /c` on Windows,
  kept direct execution on macOS/Linux, and passed GitHub CI run `27800514091`
  with `Validate`, `Local start (macos-latest)`, and
  `Local start (windows-latest)`.

Local verification for this release-notes batch:

- `git diff --check`;
- `corepack pnpm lint:docs`;
- `corepack pnpm lint:language`;
- `corepack pnpm run ci`.

Post-tag source-checkout smoke:

- cloned the pushed `v1.1.3` tag with
  `git clone --branch v1.1.3 --depth 1`;
- confirmed the checkout was exactly `v1.1.3` at
  `aa599b14a263050a15336011068d140987adebc1`;
- passed `node scripts/check-local-prerequisites.mjs`;
- passed `sh scripts/start-local-product.sh --dry-run`;
- passed `node scripts/start-local-product.mjs --dry-run`;
- passed `corepack pnpm install`;
- passed `corepack pnpm doctor:local`;
- passed `corepack pnpm build`;
- passed `corepack pnpm smoke:local-bootstrap`;
- passed `corepack pnpm smoke:local-start`;
- passed `corepack pnpm smoke:web-product-loop`.

The post-tag smoke was run without provider secrets and used the deterministic
local browser product-loop smoke, not a real external provider.

## Upgrade Notes

After the tag is created, source-checkout users can upgrade with:

```bash
git fetch --tags
git checkout v1.1.3
```

Then start Deliberum with the platform-specific first-run command:

```bash
# macOS or Ubuntu Linux
sh scripts/start-local-product.sh

# native Windows
node scripts/start-local-product.mjs
```

Back up `.deliberum/deliberum.sqlite` before upgrading local data if the
previous checkout contains important discussion history.

## Not Claimed

v1.1.3 does not add:

- packaged desktop installers;
- WSL2 support;
- public hosted service operation;
- production identity, SSO, or public multi-user authorization;
- multiple named provider accounts;
- broad OpenAI-compatible provider compatibility guarantees;
- automatic future schema migrations.

Those remain post-v1.1.3 work unless separately scoped and verified.
