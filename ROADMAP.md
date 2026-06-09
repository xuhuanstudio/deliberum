# Roadmap

This roadmap is public and high-level. It is not a private implementation task list.

Deliberum is not an MVP-first project. The implementation will be staged, but each stage must preserve the full architecture boundaries.

## Phase 0: Protocol foundation

- TypeScript monorepo skeleton;
- protocol schemas with runtime validation;
- append-only event ledger;
- Topic Contract;
- Participant profiles;
- core projections for Candidate Frontier, Objection Ledger, and Quality Obligations.

## Phase 1: Core deliberation loop

- sealed initial divergence;
- manual/fake participant adapters;
- candidate and objection extraction proposals;
- quality obligation generation;
- final audit and outcome compilation.

## Phase 2: Terminal-first product

- CLI commands for sessions, events, frontier, objections, obligations, and results;
- local daemon;
- SQLite storage;
- SSE/WebSocket event stream.

## Phase 3: Adapter ecosystem

- OpenAI-compatible adapter;
- HTTP template adapter;
- manual participant adapter;
- resource broker;
- Context Capsules;
- WebGET adapter.

## Phase 4: Web projection

- React/Vite Web UI;
- Candidate Frontier page;
- Objection Ledger page;
- Quality Obligations page;
- Resources/WebGET page;
- Event Timeline;
- Final Compiler page.

## Phase 5: Evaluation and hardening

- baseline comparison harness;
- security review;
- threat model validation;
- adapter sandboxing;
- public alpha release.
