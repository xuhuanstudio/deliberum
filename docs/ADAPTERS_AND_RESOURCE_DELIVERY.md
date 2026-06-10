# Adapters and Resource Delivery

Adapters allow heterogeneous participant sources to join the same deliberation. Adapters are not the core architecture; they are integration surfaces.

## Participant adapters

- implemented: participant adapter interface;
- implemented: fake and manual participant adapters;
- implemented: OpenAI-compatible base URL adapter;
- implemented: experimental WebGET adapter for web-only models;
- deferred: local model adapters;
- deferred: HTTP template adapters;
- deferred: tool adapters;
- deferred: MCP-compatible tool adapters as optional integrations, not as the project core.

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

Current implementation does not generate public URLs or host resources. The Delivery Planner can select `url`, `base64`, or `none` according to policy; sensitive resources default to `none`.

## Resource Broker

The Resource Broker manages:

- resource metadata;
- content hashes;
- variants: URL, base64, summary, OCR, caption, transcript;
- privacy classification.

Signed URL hosting, TTL/revocation services, and delivery record persistence are future runtime work. The current package is a support layer for metadata registration and safe delivery planning.

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
