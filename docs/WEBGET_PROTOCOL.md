# WebGET Protocol

WebGET is a participant adapter for models that have no API and no MCP interface, but can interact through a web chat interface that may access URLs.

WebGET is not the core architecture. It is an adapter that lowers walls between otherwise incompatible model entry points.

## Goals

- Provide context through HTTP GET pages.
- Provide resources through URL, base64, or none.
- Support multi-page context for small-context web models.
- Support chunked GET submission where possible.
- Support manual paste fallback.
- Record what context and resources the participant actually read.

## Endpoint shape

```text
GET /webget/{token}/start
GET /webget/{token}/context
GET /webget/{token}/context/{page}
GET /webget/{token}/resources/{resourceId}
GET /webget/{token}/submit?seq=1&total=3&encoding=base64url&data=...
GET /webget/{token}/commit?total=3&sha256=...&length=...
```

The current daemon-local WebGET surface does not replay historical events over WebGET endpoints, does not create public URLs, and does not include a status endpoint.

## Required web-model prompt rules

A WebGET participant prompt should instruct the model to:

1. open the start URL;
2. read context pages in priority order;
3. report which pages and resources it actually accessed;
4. never pretend to have read inaccessible resources;
5. produce an independent contribution;
6. submit by chunked GET if possible;
7. otherwise output the answer for manual import.

## Context paging

Context should be split into prioritized pages:

- overview;
- topic contract;
- candidate frontier;
- unresolved objections;
- quality obligations;
- evidence/resources;
- output format;
- submission instructions.

Small-context web models should be instructed to read the highest-priority pages first.

## Read report

Imported WebGET contributions must include a read report:

- which context pages were read;
- which resources were viewed;
- which resources were summary-only;
- whether submission was GET, manual paste, or browser automation;
- context completeness.

## Resource modes

For each resource type and participant, delivery mode is one of:

- `url`;
- `base64`;
- `none`.

This is a switch for a single delivery. The participant profile may define fallback preferences.

## GET submission caveats

GET submissions are an interoperability fallback, not a secure high-trust API. Query strings can be logged by clients, servers, proxies, and browser history.

Mitigations:

- do not use GET submission for secrets;
- use short-lived tokens;
- keep tokens scoped to one daemon-local WebGET session;
- keep chunks small;
- require `/commit` before importing output;
- verify `sha256` if available;
- verify committed byte length;
- require structured JSON with `output`, `readReport`, and `contextCompleteness`;
- mark WebGET contributions with context and resource completeness;
- sanitize logs.

## Security

WebGET tokens must be short-lived, daemon-local, scoped to one WebGET session, and excluded from committed contribution payloads. Public capsule exposure must be opt-in. Sensitive resources must not be exposed publicly by default; current resource planning defaults sensitive resources to `none`.
