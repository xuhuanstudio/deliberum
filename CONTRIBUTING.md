# Contributing

Thanks for your interest in Deliberum.

## Language

Use English for issues, pull requests, code comments, commit messages, public
documentation, examples, and repository metadata. Private clarification can
happen outside the public repository, but any accepted requirement, rationale,
or design decision should be summarized in English before it is committed.

Repository CI runs `corepack pnpm lint:language` and
`corepack pnpm lint:public-files` to reject tracked public files or paths that
contain non-English Han characters, local runtime data, generated build
outputs, private workflow files, OS metadata, local databases, logs, or
credential files.

## Project principles

Please do not turn Deliberum into:

- a role-agent chat demo;
- a model voting system;
- a central-Judge workflow;
- an MCP wrapper;
- a chat-first UI;
- a single infinite whiteboard app.

Every contribution should preserve the core architecture:

- Topic Contract;
- Peer Participants;
- Sealed Divergence;
- Candidate Frontier;
- Objection Ledger;
- Quality Obligations;
- Adaptive Deliberation;
- Evidence Check;
- Final Audit;
- Outcome Compilation.

## Pull requests

A pull request should explain:

1. what quality gap it addresses;
2. which protocol objects or runtime components it touches;
3. whether it introduces any new semantic center;
4. how it is tested;
5. whether public docs need to change.

## Development

This project is a TypeScript monorepo using pnpm workspaces. Use Node.js 24+
and pnpm 11+ through Corepack.

```bash
corepack pnpm install
corepack pnpm run ci
```

For narrower local checks, use `corepack pnpm test`,
`corepack pnpm lint`, and `corepack pnpm typecheck`.

Do not commit local sessions, API keys, resource caches, Codex/private workflow files, context capsules, or generated local databases.

## License of contributions

By contributing, you agree that your contributions are licensed under the Apache License 2.0.

## Commit style

Use English Conventional Commit messages. Keep commits narrow: one coherent
runtime, protocol, docs, test, or tooling concern per commit. Do not mix
unrelated behavior changes, generated local artifacts, or private workflow
files into the same commit.

## Architectural changes

Large changes to protocol, runtime semantics, adapter trust boundaries, resource delivery, or final compilation should include a design discussion issue or ADR-style explanation.
