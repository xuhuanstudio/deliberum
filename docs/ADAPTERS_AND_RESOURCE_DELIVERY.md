# Adapters and Resource Delivery

Adapters allow heterogeneous participant sources to join the same deliberation. Adapters are not the core architecture; they are integration surfaces.

## Participant adapters

- implemented: participant adapter interface;
- implemented: fake and manual participant adapters;
- implemented: OpenAI-compatible base URL adapter;
- implemented: HTTP template participant adapter as a package-level integration surface;
- implemented: opt-in HTTP template daemon participant profile for sealed divergence;
- implemented: package-level MCP-compatible tool participant adapter;
- implemented: opt-in daemon MCP tool participant profile for sealed divergence;
- implemented: experimental WebGET adapter for web-only models;
- deferred: local model adapters;
- deferred: MCP server lifecycle management, broader tool execution policy, and adapter sandboxing.

## Adapter capability profile

Every adapter must declare capabilities rather than relying on implicit assumptions.

```ts
type AdapterCapabilities = {
  input: {
    text: boolean
    markdown: boolean
    json: boolean
    imageUrl: boolean
    imageBase64: boolean
    pdfUrl: boolean
    fileUrl: boolean
    webBrowsing: boolean
  }
  output: {
    structuredJson: boolean
    markdown: boolean
    streaming: boolean
    manualPaste: boolean
  }
  limits: {
    maxPromptChars?: number
    maxInputTokens?: number
    maxOutputTokens?: number
    maxUrlChars?: number
    maxResourceSizeBytes?: number
  }
  reliability: 'high' | 'medium' | 'low' | 'experimental'
}
```

## HTTP template adapter

The package-level `HttpTemplateParticipantAdapter` supports providers that expose
HTTP endpoints but do not follow the OpenAI-compatible chat schema. It renders
operator-provided URL, header, and body templates from adapter input, participant
context, and runtime provider config. Runtime secrets can be referenced through
placeholders such as `{{runtime.apiKey}}`; inline static secrets in header
templates are rejected.

Run-plan provider configs may include `httpTemplate.variables` for non-secret
JSON values referenced by `{{var.*}}` placeholders. These values are safe run
configuration and can appear in run records or API responses. API keys, bearer
tokens, private local paths, and other inline credentials must stay out of these
variables and are rejected by run-plan validation.

The adapter supports text and JSON response mappings, including a configured
payload path. It validates HTTP(S) URLs, rejects URL credentials, returns safe
provider error categories, redacts runtime secrets from provider output, and
does not expose EventStore, daemon, CLI, MCP, ranking, voting, or semantic
authority behavior.

Current scope: the adapter is available from `@deliberum/adapters` for package
consumers and through an opt-in daemon participant profile. The daemon profile
registers only the participant adapter for sealed divergence. It does not
install extraction generators, proposal reviewers, final candidate generators,
final auditors, provider setup UX, or an interactive configuration flow.

## MCP-compatible tool participant adapter

The package-level `McpToolParticipantAdapter` lets an embedding application wrap
a configured MCP-compatible tool call as a participant contribution. It depends
on an injected client with `listTools()` and `callTool()` methods rather than
starting or managing an MCP server. The adapter calls one configured tool name,
passes JSON arguments derived from adapter input and participant context, and
returns a normal `ParticipantAdapterResult` payload shaped as
`mcp_tool_result`.

The adapter validates tool names, optionally confirms that the configured tool
is listed, enforces an optional timeout, accepts only text and JSON tool content,
and redacts obvious bearer/API-key/local-path material from tool output. It does
not expose EventStore methods, daemon routes, tool policy, ranking, voting,
final-answer, or semantic authority behavior.

Current scope: the adapter is available from `@deliberum/adapters` for package
consumers and through an opt-in daemon MCP tool participant profile. The daemon
profile calls one configured MCP-compatible JSON-RPC tool endpoint, verifies the
tool list by default, applies a single-tool allow-list, rejects non-local
endpoints unless remote HTTPS access is explicitly enabled, and keeps endpoint
URLs, tool names, bearer tokens, and request payloads out of runtime profile
responses. There is still no daemon MCP server lifecycle manager, no arbitrary
tool router, and no production sandbox or authorization policy for arbitrary
tool execution.

## Resource delivery

Each participant has a resource policy per resource type. For a given resource delivery, the mode is one of:

```text
url | base64 | none
```

This is a switch for a single delivery. Participant profiles may define fallback preferences.

`none` may still use fallback summaries, OCR, captions, transcripts, or board semantic summaries.

## Resource exposure modes

- `localhost`: only local services can access resources.
- `lan`: same-network participants can access resources.
- `public`: external web models can access signed resource URLs.

Public exposure must be opt-in, signed, time-limited, revocable, and logged. Sensitive resources must not be publicly exposed by default.

The daemon can expose a local session resources projection with run-plan resource references, safe broker metadata when registered, safe delivery audit history from `resource_delivery_planned` ledger events, and safe access lifecycle audit history from `resource_access_grant_created` and `resource_access_grant_revoked` ledger events. It also exposes a session-scoped local resource delivery planning endpoint, `POST /sessions/:sessionId/resources/:resourceId/deliveries`, that uses the Delivery Planner to select `url`, `base64`, or `none` according to explicit policy; sensitive resources default to `none`. Successful planning appends a safe `resource_delivery_planned` ledger event that records the decision metadata without delivered URLs, base64 bytes, data refs, bearer access ids, or resource text.

For allowed URL deliveries, the daemon wraps the selected URL variant in a short-lived resource access grant and returns the grant URL as the delivery material. The grant is served through `GET /resource-access/:accessId`, redirects to the selected safe URL variant, and can be revoked through `POST /resource-access/:accessId/revoke`. The grant store keeps only a hash of the access id plus access-layer grant metadata. With SQLite daemon persistence enabled, URL grant enforcement and revocation state survive daemon restarts; bearer access ids are still not stored. Creation and revocation write safe lifecycle audit events with a non-bearer `resourceAccessId`, token hash, TTL metadata, resource id, and participant id. Source URLs, bearer access ids, provider secrets, data refs, and base64 bytes are not written to session ledger events, resources projections, WebGET resource access reports, or run metadata.

For hosted content delivery, the daemon can wrap explicit base64 broker content in a short-lived access grant and serve the decoded bytes from `GET /resource-access/:accessId`. This requires `allowHostedContentUrl=true`, a `maxHostedContentSizeBytes` limit, and the matching URL exposure policy for the configured resource access base URL. The response delivery material is still a URL, while ledger audit events record only safe decision metadata, `materialKind=url`, token hash, content mime, content size, and content hash.

The current access grant service redirects already-registered safe URL variants and serves explicitly registered base64 broker content. It does not fetch arbitrary local files and does not replace production authorization, multi-user policy, or remote deployment policy. SQLite daemon persistence preserves resource broker registrations/content plus grant and revocation enforcement across daemon restarts. Without SQLite, broker content and grant state remain process-local.

## Resource Broker

The Resource Broker manages:

- resource metadata;
- content hashes;
- variants: URL, base64, summary, OCR, caption, transcript;
- privacy classification.

The current package is a support layer for metadata registration and safe delivery planning. The daemon adds TTL/revocation for URL and hosted content access grants, can persist explicitly registered broker metadata/content and grant enforcement in SQLite, and records safe delivery-planning plus access-lifecycle audit events in the session ledger.

## Delivery Planner

The Delivery Planner selects a resource representation according to:

- participant capabilities;
- resource type;
- privacy policy;
- network reachability;
- size limits;
- context budget;
- discussion phase;
- user configuration.

## Context Capsule

A Context Capsule packages task instructions, selected references, discussion state, resources, and return instructions. It can render to Markdown, HTML, JSON, text prompt, URL page, or manual copy-paste prompt.

Context Capsules should record:

- included references;
- omitted but relevant references;
- resource delivery choices;
- known limitations;
- expected output shape.
