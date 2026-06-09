# Threat Model

Deliberum connects local files, model providers, tools, resources, web-only participants, and human users. Security and privacy must be designed from the beginning.

## Assets

- API keys and provider credentials;
- local files and private resources;
- session ledgers and model outputs;
- context capsules;
- signed resource URLs;
- WebGET tokens;
- adapter configuration;
- tool permissions;
- user-provided content.

## Threats

### Prompt injection and tool abuse

Untrusted content may instruct participants or tools to reveal secrets, call tools, or ignore protocol constraints.

Mitigations:

- separate tool instructions from untrusted content;
- require tool policies and approvals;
- log all tool calls;
- never expose secrets in context capsules.

### Resource leakage

Resources may be accidentally exposed via public URLs, base64 payloads, browser logs, proxies, or WebGET tokens.

Mitigations:

- public resource exposure is opt-in;
- signed URLs use TTL and revocation;
- sensitive resources cannot be public by default;
- audit all resource deliveries;
- support `none` delivery with summaries.

### WebGET query leakage

GET URLs may be logged by browsers, proxies, services, and server logs.

Mitigations:

- do not use GET submission for secrets;
- use short-lived tokens;
- sanitize logs;
- prefer capsule URLs over embedding long context in query strings;
- support manual paste fallback.

### DNS rebinding and local service exposure

A local daemon serving resources or APIs must not be reachable by untrusted origins.

Mitigations:

- bind to `127.0.0.1` by default;
- validate Origin headers;
- require authentication for remote access;
- recommend SSH tunneling for remote use.

### Semantic-center capture

A component may become a hidden semantic authority by selecting context, ranking candidates, summarizing, rendering whiteboards, or stopping deliberation.

Mitigations:

- semantic outputs are proposals;
- context capsules declare included and omitted refs;
- projections are traceable;
- final drafts undergo audit;
- centralization audit can be triggered.

### Adapter compromise

Third-party adapters may exfiltrate context or execute unsafe operations.

Mitigations:

- adapter capability declarations;
- explicit resource delivery policies;
- sandbox or subprocess isolation where possible;
- per-adapter audit logs.

## Default posture

- local-first;
- no public resource exposure by default;
- no private Codex workflow files in public repo;
- no model output logs committed;
- no sensitive resources in Context Capsules unless explicitly allowed.
