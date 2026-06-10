# Security Model

## Defaults

- Bind daemon to `127.0.0.1` by default.
- Do not expose public network binding by default.
- Do not enable wildcard CORS by default.
- Remote access requires authentication or SSH tunneling.
- API keys must come from environment variables, OS keychain, or encrypted local config.
- API keys and provider credentials must not be committed in repo files or examples.
- Public resource URLs are disabled by default.
- Public resource URLs are not generated automatically.
- Sensitive resources cannot be exposed publicly by default.
- Sensitive resources default to `none` delivery unless an explicit safe policy allows another mode.
- WebGET is experimental and must record read/access limitations.
- WebGET tokens are short-lived, daemon-local, and scoped to one WebGET session.

## Resource security

Resource delivery modes are:

- URL;
- base64;
- none/fallback summary.

URL exposure can be localhost, LAN, or public. Public exposure requires signed URLs, TTL, revocation, and audit logs. Current implementation does not host or generate public URLs.

Base64 avoids public URL exposure but still sends resource content to the target participant. It must not be treated as private once delivered.

`none` mode may use summaries, OCR, captions, transcripts, or semantic board summaries.

## Adapter security

Adapters must declare capabilities and risks. Low-reliability adapters such as WebGET must record what context they actually read.

Adapters must not receive more context or resources than their task requires.

## Tool security

Tools that write files, run shell commands, access private resources, or make network calls require policy and audit logging.

Tool outputs are evidence objects or contribution objects; they are not unquestionable truth.

## Context capsules

Context capsules must record:

- included references;
- omitted references;
- resource delivery choices;
- privacy level;
- token/URL expiry;
- intended participant.

Public capsules must be opt-in and revocable.

## Private files

Never commit:

- `.env`;
- `.codex/`;
- context capsules;
- resource caches;
- session databases;
- WebGET tokens;
- model output logs;
- private Codex handoff files.

See also: `docs/THREAT_MODEL.md`.
