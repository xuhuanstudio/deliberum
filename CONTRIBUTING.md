# Contributing

Thanks for your interest in Deliberum.

## Language

English is preferred for issues, pull requests, code comments, commit messages, and public documentation. Chinese is accepted for early design discussion or clarifying complex ideas; maintainers may summarize key points in English.

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

This project is planned as a TypeScript monorepo using pnpm workspaces.

```bash
pnpm install
pnpm test
pnpm lint
pnpm typecheck
```

Do not commit local sessions, API keys, resource caches, Codex/private workflow files, context capsules, or generated local databases.

## License of contributions

By contributing, you agree that your contributions are licensed under the Apache License 2.0.

## Commit style

Use clear English commit messages. Conventional Commits are encouraged but not required before the first implementation release.

## Architectural changes

Large changes to protocol, runtime semantics, adapter trust boundaries, resource delivery, or final compilation should include a design discussion issue or ADR-style explanation.
