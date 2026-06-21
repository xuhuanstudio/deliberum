# Deliberum v1.2.0 Release Notes

Status: published source-checkout local-first product release.

Package metadata versions remain `0.0.0`; Deliberum currently uses annotated
git tags and release notes for release identity instead of package version
bumps.

## Release Focus

Deliberum v1.2.0 turns the local Web UI into the default human-friendly product
surface for the existing local-first deliberation system.

The release goal is that an outside source-checkout user can:

1. clone the repository;
2. start the local product;
3. open the Web UI;
4. connect an OpenAI-compatible AI provider from Web;
5. verify the provider;
6. start a model-backed discussion;
7. follow readable participant contributions in the Discussion Room;
8. review the current answer, still-unresolved points, needs checking, risks,
   and next steps without understanding daemon, runtime, ledger, proposal,
   event, or internal ids.

This release does not add broad runtime, daemon, adapter, audit, auth, resource,
or provider-family infrastructure.

## What Changed Since v1.1.4

### Connect AI and Participant Readiness

- Connect AI now shows a clearer map from the saved OpenAI-compatible provider
  to discussion participant roles.
- The default setup path focuses on provider readiness, connection testing,
  discussion readiness, and non-secret participant model choices.
- API keys remain hidden. The default UI does not expose saved API keys, env var
  names, provider config ids, raw JSON, provider values, or low-level runtime
  details.

### New Discussion and Demo Entry

- The sample discussion entry now pre-fills the demo brief instead of sending
  users through an empty start form.
- Focused and broader review entries keep the normal user path around starting a
  discussion instead of backend run/session concepts.

### Discussion Room

- The room now puts the conversation before the roster so the first visible
  content feels like a discussion.
- Continuing a discussion brings the latest room update into view while still
  allowing users to scroll back through earlier messages.
- The Discussion Room scrolls naturally on desktop and mobile.
- The composer is more compact and chat-like, with the main action centered on
  sending a message and continuing the discussion.
- Timeline messages use lighter round boundaries, clearer participant reply
  cues, and less metadata-heavy wording.

### Current Answer

- Continue discussion and Update answer actions are now actionable from the
  default review path.
- The Current Answer path keeps the user-facing focus on strongest current
  options, still-unresolved points, what needs checking, risks, the answer, and
  next steps.

### Release Readiness

- A v1.2.0 release checklist now tracks the eight release criteria for the
  local-first product loop.
- README, Getting Started, and the Simplified Chinese Getting Started guide now
  describe the v1.2.0 source-checkout platform scope: macOS, Ubuntu Linux, and
  native Windows.

## Supported Source-Checkout Path

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

After the local service starts, open `http://127.0.0.1:3877/`, then use Connect
AI to configure and test an OpenAI-compatible provider before starting a
model-backed discussion.

## Release Evidence

Fresh release verification was run during final release preparation.

Source-checkout path:

- A GitHub HTTPS fresh clone was attempted first, but the local network failed
  during TLS setup before the repository could be cloned.
- As a fallback, an isolated source checkout was created with
  `git clone --no-local` from the repository root.
- The isolated checkout resolved to the release-preparation `main` commit with
  a clean tracked worktree.
- The isolated checkout passed:
  - `node scripts/check-local-prerequisites.mjs`
  - `sh scripts/start-local-product.sh --dry-run`
  - `node scripts/start-local-product.mjs --dry-run`
  - `corepack pnpm install --frozen-lockfile`
  - `corepack pnpm doctor:local`
  - `corepack pnpm build`
  - `corepack pnpm smoke:local-bootstrap`
  - `corepack pnpm smoke:local-start`
  - `corepack pnpm smoke:web-product-loop`

Real OpenAI-compatible provider release-readiness:

- `corepack pnpm smoke:web-release-readiness` passed the focused/default path.
- `DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 corepack pnpm smoke:web-release-readiness`
  passed the broader review path.
- `DELIBERUM_RELEASE_SMOKE_QUESTION=<Chinese discussion question> corepack pnpm smoke:web-release-readiness`
  passed the Chinese-topic focused path.
- `DELIBERUM_RELEASE_SMOKE_PERSPECTIVES=3 DELIBERUM_RELEASE_SMOKE_QUESTION=<Chinese discussion question> corepack pnpm smoke:web-release-readiness`
  passed the Chinese-topic broader review path.

Exact provider keys, base URLs, model names, raw provider responses, and model
output were intentionally omitted from docs and logs.

Post-tag source-checkout smoke:

- A fresh GitHub checkout of `v1.2.0` resolved exactly to
  `b59607d58a5b2c3d36373b95fb43aa95cab72708`.
- `git describe --tags --exact-match` returned `v1.2.0`.
- The checkout passed:
  - `node scripts/check-local-prerequisites.mjs`
  - `sh scripts/start-local-product.sh --dry-run`
  - `node scripts/start-local-product.mjs --dry-run`
  - `corepack pnpm install --frozen-lockfile`
  - `corepack pnpm doctor:local`
  - `corepack pnpm build`
  - `corepack pnpm smoke:local-bootstrap`
  - `corepack pnpm smoke:local-start`
  - `corepack pnpm smoke:web-product-loop`

## Not Claimed

v1.2.0 does not add:

- packaged desktop installers;
- a hosted SaaS mode;
- public multi-user auth;
- SSO;
- new provider families;
- broad OpenAI-compatible provider compatibility guarantees;
- broad runtime or daemon redesign;
- resource, auth, or audit expansion;
- a speculative plugin system;
- a database migration framework;
- WSL2 as a supported platform before CI verifies the local-start path there.

## Upgrade Notes

Source-checkout users can upgrade with:

```bash
git fetch --tags
git checkout v1.2.0
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
