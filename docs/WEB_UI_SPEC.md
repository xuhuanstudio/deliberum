# Web UI Spec

The Web UI is the human-friendly visual operating surface for the local Deliberum system. Its default experience is for a first-time non-technical user who wants to understand model setup, start or continue a deliberation, understand the current result, and decide what to do next.

It is still backed by the local daemon and reads daemon projections through `@deliberum/client`, but the default interface must not make users understand daemon, ledger, run, session, projection, event, proposal, runtime, resource, or internal ids before they can use the product.

## Current stack

- React + Vite + TypeScript;
- TanStack Router;
- TanStack Query;
- `@deliberum/client` for local daemon reads and writes.

The Web UI defaults to the local daemon URL and can be configured for development. It can submit local provider setup values to the daemon for marker-delimited env block writing, but it does not hardcode public daemon URLs, show saved provider secrets, execute adapters in the browser, own semantic deliberation state, or serve resources.

## Default user mode

User Mode is the default. A first-time user should be able to understand the product within 30 seconds and start a discussion without reading docs.

Default User Mode pages and flows:

- `/` introduces Deliberum as a multi-perspective discussion room, provides Start a discussion and Continue discussions actions, and keeps operator-only details inside Advanced / Developer Mode.
- `/setup/models` shows daemon connection, local demo readiness, provider/model readiness, a plain-language provider setup checklist, and a local OpenAI-compatible setup form for API key, base URL, model, and structured review compatibility. It does not display saved provider secrets or env var names in the default view. Saved setup is applied to the current daemon when possible and also written to the managed local setup block for the next daemon start.
- `/runs/new` lets a user start a discussion from a guided prompt or sample walkthrough, choose demo or model-backed participants, select a focused or broader model perspective depth when a provider is ready, assign first-response and review role models, and save non-secret role defaults to the local service for later model-backed discussions. Advanced JSON request details stay collapsed.
- `/runs` lists existing discussions in user language.
- `/runs/:runId` is the Discussion Room. It shows the discussion brief, participant/model contributions, room-style timeline, strongest current options, open disagreements, evidence gaps, risk review, current conclusion, and next recommended actions.
- `/runs/:runId/outcome` shows the current conclusion in readable terms, with unresolved disagreements, missing evidence, risks, provenance summary, and Advanced details for raw developer material.

The default route must avoid raw technical identifiers and backend vocabulary in visible headings, primary actions, empty states, and first-screen summaries. When an identifier is needed for debugging, it belongs in Advanced / Developer Mode.

## Discussion Room layout

The Discussion Room is the core product surface.

It should answer these user questions without requiring documentation:

- What are we discussing?
- Who or what contributed?
- What did each participant/model say?
- Where are we in the deliberation process?
- What are the strongest current options?
- What disagreements remain open?
- What evidence is missing or still uncertain?
- What risks should be reviewed before acting?
- What is the current conclusion?
- What should I do next?

Primary room regions:

- Discussion brief: the topic, goals, constraints, participants, and expected output in plain language.
- Conversation timeline: readable participant/model contributions organized by deliberation stage, not raw event records.
- Decision workspace: a persistent summary area for current conclusion, open disagreements, missing evidence, risks, and next recommended actions.
- Discussion actions: user-facing ways to continue the work, such as Continue discussion, Ask for stronger options, Review disagreements, Check evidence, and Update conclusion when ready.
- Advanced / Developer Mode: collapsed access to raw JSON, daemon status, runtime profile, ledger events, resource posture, operation audit, deployment posture, and internal proposal/event/session/run ids.

## User-facing concept mapping

Core Deliberum concepts remain part of the system model, but the default Web UI maps them into user language:

| Core concept | Default Web language |
| --- | --- |
| Topic Contract | Discussion brief |
| Sealed Divergence | Independent first responses |
| Candidate Frontier | Strongest current options |
| Objections | Open disagreements |
| Quality Obligations | Requirements this answer must satisfy |
| Evidence Checks | Evidence and verification |
| Final Audit | Risk review |
| Outcome Compilation | Current conclusion |

The technical names can appear in documentation, protocol pages, and Advanced / Developer Mode. They should not lead the normal user path.

## Advanced / Developer Mode

Advanced / Developer Mode preserves inspectability for maintainers and operators without turning the product entry point into an engineering console.

Advanced details may include:

- daemon status;
- runtime profile;
- deployment posture;
- resource access posture;
- operation audit metadata;
- ledger events;
- raw JSON requests and responses;
- internal run/session/projection/event/proposal ids;
- legacy session projection pages.

The default landing page may expose Advanced / Developer Mode as a collapsed section. Expensive or operator-only reads should stay lazy until that section is opened.

## Legacy and developer routes

Direct `/sessions/*` routes remain available for developer inspection and compatibility with the older projection workspace. They are not the default product path and should not be promoted as the primary way to use Deliberum.

When these pages are visible, they should identify themselves as Advanced / Developer Mode surfaces and avoid competing with the Discussion Room as the normal user workflow.

## Localization

English is the default language. Simplified Chinese must be available for the default user path, including landing, start discussion, Discussion Room, outcome, discussion actions, and Advanced / Developer Mode labels.

Public repository files remain English-only so the language lint can protect the international open-source surface. Simplified Chinese copy lives in the Web localization table.

## Boundaries

The Web UI does not:

- become the semantic source of truth;
- compute projections from raw events;
- compile outcomes in the browser;
- run model adapters in the browser;
- capture provider secrets in Web forms;
- host or deliver resources directly;
- turn process suggestions into hidden automatic execution.

The semantic source remains the append-only event ledger and derived deliberation state. The Web UI renders that state as a readable Discussion Room for users and as Advanced details for developers.
