# CLI, Daemon, and Web

Deliberum should be terminal-first and local-first, but not CLI-only.

## Shape

```text
CLI / TUI
  ↓
local daemon
  ↓
event ledger + deliberation runtime
  ↓
adapters / resources / tools
  ↓
Web UI projection
```

## CLI examples

```bash
deliberum new "Design a quality-centered peer deliberation runtime"
deliberum participants add openai-compatible --id model-a
deliberum run sealed-divergence
deliberum frontier
deliberum objections
deliberum obligations
deliberum result --format md
deliberum serve --host 127.0.0.1 --port 3877
deliberum open
```

## Daemon responsibilities

- host API;
- manage sessions;
- write append-only ledger;
- run deliberation primitives;
- call adapters;
- manage resources;
- serve Web UI;
- stream events.

## Web UI responsibilities

- show session overview;
- candidate frontier;
- objection ledger;
- quality obligations;
- event timeline;
- resource/evidence state;
- semantic board projections;
- final compilation.

The Web UI is not the source of truth. The event ledger is.
