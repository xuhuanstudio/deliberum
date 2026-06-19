# Deliberum v1.1.4 Release Notes

Status: published source-checkout local-first patch release.

The annotated `v1.1.4` tag points to
`6c4fd17d2422ebaf502ee36849e35768e99a4965` and was created after GitHub CI
passed on `main`.

Keep the existing `v1.0.0`, `v1.1.0`, `v1.1.1`, `v1.1.2`, and `v1.1.3` tags
unchanged.

## Release Focus

Deliberum v1.1.4 keeps the same local-first product scope as v1.1.3 and
hardens release-readiness evidence for container startup, Compose startup, real
OpenAI-compatible provider walkthroughs, and Chinese-topic model-backed
discussions.

The patch includes:

- a static container-file guard for Dockerfile and Compose safety boundaries;
- an opt-in container runtime smoke workflow for Docker-enabled environments;
- a Compose runtime smoke that can build and run the local daemon-served Web
  product loop from the documented Compose file;
- Docker image fixes for build-time git checks, Playwright browser
  availability, noninteractive dependency pruning, preserved failure logs, and
  daemon runtime dependency deployment;
- repeated real-provider release-readiness evidence for focused and Broader
  review paths;
- release-readiness smoke coverage for Chinese discussion topics, including
  user-visible participant messages and current-answer material in the topic
  language;
- release-readiness smoke recovery coverage for recoverable finalization waits
  such as auditor or final-candidate retries.

This release does not add new daemon, runtime, adapter, auth, resource, or
provider capability.

## Supported Path

The recommended source-checkout path remains:

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

The documented local/pre-production container path remains optional:

```bash
docker build -t deliberum:local .
docker compose up
```

Keep the host-side Compose binding on `127.0.0.1` unless a separate fronting
auth layer and network policy are in place.

## Release Evidence

Evidence since `v1.1.3`:

- `corepack pnpm lint:container` validates documented container and Compose
  safety invariants;
- `corepack pnpm smoke:container -- --dry-run` verifies the container runtime
  smoke plan without requiring Docker;
- the opt-in `Container Smoke` GitHub workflow passed after the Docker image
  could build, serve the daemon Web shell, and keep runtime dependencies
  available;
- the opt-in `Compose Smoke` GitHub workflow passed after Compose setup matched
  the repository's current pnpm setup order;
- `corepack pnpm smoke:web-release-readiness` passed fresh focused/default
  real-provider walkthroughs;
- `DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 corepack pnpm smoke:web-release-readiness`
  passed fresh Broader review real-provider walkthroughs;
- `DELIBERUM_RELEASE_SMOKE_QUESTION=<Chinese discussion question> corepack pnpm smoke:web-release-readiness`
  passed focused Chinese-topic real-provider walkthroughs;
- `DELIBERUM_RELEASE_SMOKE_QUESTION=<Chinese discussion question> DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 corepack pnpm smoke:web-release-readiness`
  passed Broader review Chinese-topic real-provider walkthroughs;
- focused Chinese-topic and Broader review Chinese-topic paths each passed two
  consecutive follow-up runs in fresh isolated local services;
- local `corepack pnpm run ci` passed after the release-readiness smoke updates;
- pushed GitHub CI run `27843256257` passed `Validate`, `Local start
  (macos-latest)`, and `Local start (windows-latest)` for the release-notes
  commit that became the `v1.1.4` tag target.

Exact provider keys, base URLs, model names, raw provider responses, and model
output were intentionally omitted from docs and logs.

## Post-Tag Source-Checkout Smoke

After the annotated tag was pushed, the release path was verified from a fresh
source checkout:

- `git clone --branch v1.1.4 --depth 1 https://github.com/xuhuanstudio/deliberum.git <temp-dir>/repo`
- `git rev-parse HEAD`
- `git describe --tags --exact-match`
- `node scripts/check-local-prerequisites.mjs`
- `sh scripts/start-local-product.sh --dry-run`
- `node scripts/start-local-product.mjs --dry-run`
- `corepack pnpm install`
- `corepack pnpm doctor:local`
- `corepack pnpm build`
- `corepack pnpm smoke:local-bootstrap`
- `corepack pnpm smoke:local-start`
- `corepack pnpm smoke:web-product-loop`

Result:

- Passed. The pushed `v1.1.4` tag cloned successfully, resolved exactly to
  `6c4fd17d2422ebaf502ee36849e35768e99a4965`, and could run the documented
  source-checkout startup path through the deterministic browser product-loop
  smoke.

Limit:

- This post-tag smoke was run on macOS and did not use a real external provider.
  Real-provider release-readiness evidence is listed above.

## Upgrade Notes

Source-checkout users can upgrade with:

```bash
git fetch --tags
git checkout v1.1.4
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

v1.1.4 does not add:

- packaged desktop installers;
- WSL2 support;
- public hosted service operation;
- production identity, SSO, or public multi-user authorization;
- multiple named provider accounts;
- broad OpenAI-compatible provider compatibility guarantees;
- automatic future schema migrations.

Those remain post-v1.1.4 work unless separately scoped and verified.
