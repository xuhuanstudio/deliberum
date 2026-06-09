# Web UI Spec

The Web UI is a projection and operation surface for the daemon. It should not be a chat-first application.

## Recommended stack

- React + Vite + TypeScript;
- TanStack Router;
- TanStack Query;
- Zustand for local UI state;
- shadcn/ui + Radix primitives;
- React Flow / xyflow for structured graphs;
- tldraw later for free-form canvas projection, not as semantic source.

## Core pages

- Session Overview;
- Candidate Frontier;
- Quality Obligations;
- Objection Ledger;
- Evidence and Resources;
- Semantic Board;
- Event Timeline;
- Final Compiler;
- Adapter Settings.

## Whiteboard principle

The semantic source is not a canvas JSON. The source is the event ledger and structured deliberation objects. Whiteboard views are projections and can be challenged.
