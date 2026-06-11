# Web UI Spec

The Web UI is a projection and operation surface for the local daemon. It should not be a chat-first application, a whiteboard source of truth, or a hidden semantic state machine.

## Current stack

- React + Vite + TypeScript;
- TanStack Router;
- TanStack Query;
- `@deliberum/client` for daemon reads.

The Web UI defaults to the local daemon URL and can be configured for development. It does not hardcode public daemon URLs, store provider credentials, execute adapters, or serve resources.

## Current pages

- Landing page with explicit session-id entry;
- Session Overview;
- Candidate Frontier;
- Objections;
- Quality Obligations;
- Event Timeline;
- Final outcome projection;
- Resources placeholder.

The final page reads the local daemon final endpoint and renders the compiled outcome projection, draft status, unresolved material, and provenance. It remains a projection/view surface and does not compile outcomes in the browser. The resources page is still a placeholder. Core Resource Broker packages exist, but daemon/Web live resource endpoint integration remains deferred.

## Deferred pages and surfaces

- live resource/evidence page backed by daemon resource endpoints;
- semantic board projection;
- adapter settings;
- optional graph/canvas views such as xyflow or tldraw, only as projections.

## Whiteboard principle

The semantic source is not canvas JSON. The source is the append-only event ledger and derived deliberation state. Whiteboard or board views are projections and can be challenged.
