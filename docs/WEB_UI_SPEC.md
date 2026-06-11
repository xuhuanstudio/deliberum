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
- Resources and evidence projection.

The final page reads the local daemon final endpoint and renders the compiled outcome projection, draft status, unresolved material, and provenance. It remains a projection/view surface and does not compile outcomes in the browser. The resources page reads the local daemon resources endpoint and renders run-plan resource references, safe broker metadata when the resource is registered, accepted evidence needs, and projection metadata. It does not upload, host, download, or deliver resources in the browser.

The run detail page reads the local daemon run events endpoint and renders daemon-redacted ledger event records. It does not use `EventSource`, subscribe to run streams, or compute projections from the event list.

## Deferred pages and surfaces

- live run event follow;
- resource delivery and hosting controls;
- semantic board projection;
- adapter settings;
- optional graph/canvas views such as xyflow or tldraw, only as projections.

## Whiteboard principle

The semantic source is not canvas JSON. The source is the append-only event ledger and derived deliberation state. Whiteboard or board views are projections and can be challenged.
