# Deliberum v1.0 Release Notes

Status: draft release notes for the current v1.0 Production Stable convergence
state.

These notes describe the supported v1.0 local-first product path and current
release evidence. They are not the final v1.0 completion report. The completion
report belongs in Gate 12 after Gates 9 and 10 are closed with current evidence.

## Supported v1.0 Path

Deliberum v1.0 targets a source-checkout local-first release for outside users:

1. clone the repository;
2. install with Node.js 24 or newer and Corepack-managed pnpm 11;
3. run `corepack pnpm build`;
4. start the local product with `corepack pnpm start:local`;
5. open `http://127.0.0.1:3877/`;
6. configure an OpenAI-compatible provider from Web;
7. verify the provider connection;
8. manage discussion depth and role model defaults in Setup / Models;
9. start a model-backed discussion;
10. review readable perspectives, strongest options, open disagreements,
    evidence gaps, risks, current conclusion, and next recommended actions;
11. recover from common setup, provider, continuation, and storage failures in
    normal-user language.

Supported source-checkout platforms for v1.0 are:

- macOS with Node.js 24 or newer and Corepack-managed pnpm 11;
- Ubuntu Linux with Node.js 24 or newer and Corepack-managed pnpm 11.

Windows and WSL2 are not v1.0 supported platforms until the local-start path is
verified in CI.

## User-Facing Product Scope

The default Web UI is the normal user path. It covers:

- first-use product orientation;
- local service status;
- Setup / Models provider configuration;
- provider verification;
- participant and role model readiness;
- focused and broader model-backed discussion starts;
- a Discussion Room with readable participant contributions and timeline
  stages;
- current conclusion, open disagreements, missing evidence, risks, and next
  recommended actions;
- normal-user recovery actions for setup and continuation failures.

Advanced / Developer Mode keeps diagnostics available without leading the
normal path. The default UI should not expose secrets, raw JSON, env details,
provider config ids, or internal run/session/ledger/runtime/proposal/event ids.

## Release Evidence So Far

Current v1.0 gate evidence includes:

- supported-platform local install/start coverage on macOS and Ubuntu Linux;
- Web product coherence evidence for first-use, Setup / Models, participant
  readiness, Discussion Room, and current conclusion review;
- repeated real OpenAI-compatible focused and Broader review release smokes for
  the tested provider path;
- provider failure, rate-limit, timeout, malformed output, and partial
  completion recovery evidence in normal-user language;
- default-view safety scans across setup, start, room, outcome, recovery, and
  legacy default surfaces;
- Advanced / Developer Mode boundary evidence;
- model and participant management evidence for one Web-managed
  OpenAI-compatible provider with role model defaults;
- SQLite storage backup, restore, process-lock shutdown, and ledger-integrity
  recovery evidence.

The authoritative gate tracker remains
[v1.0 Production Readiness Matrix](V1_0_PRODUCTION_READINESS_MATRIX.md).

## Not Claimed by v1.0

These are intentionally outside the v1.0 supported scope:

- public hosted service operation;
- production identity, SSO, or public multi-user authorization;
- production distributed database support;
- production multi-writer coordination;
- production public resource hosting or CDN-style signed URLs;
- packaged desktop installer or one-click binary distribution;
- broad OpenAI-compatible provider compatibility guarantees;
- automatic future schema migrations;
- multiple named provider accounts or simultaneous multi-provider Web editing.

## Current Remaining Release Gates

After this release-note and documentation-alignment batch, the remaining gates
are:

- Gate 9: current CI, docs/language checks, product-loop smoke, Web smoke, and
  real-provider release-readiness evidence are green and current;
- Gate 10: no known normal-user blocker remains across install, startup, setup,
  verification, discussion start, continuation, conclusion review, and
  recovery;
- Gate 12: final v1.0 completion report with evidence, known limits, supported
  paths, and post-v1.0 backlog.

Do not tag the final v1.0 Production Stable release until the matrix marks all
12 gates complete with current evidence.
