# Security Policy

Deliberum may handle API keys, local files, private discussion logs, temporary resource URLs, model outputs, web-only context capsules, and tool calls. Security is a core design concern.

## Report a vulnerability

Please open a private security advisory or contact the maintainers through the security contact listed in the repository once available.

## Security principles

- The daemon should bind to `127.0.0.1` by default.
- Remote access must require authentication or an SSH tunnel.
- API keys must not be stored in committed configuration files.
- Context capsules and resource URLs must be short-lived, signed where possible, and revocable.
- Public resource exposure must be opt-in.
- Sensitive resources must not be published through public URLs by default.
- Tool calls that write files, run shell commands, or access network resources require explicit policy and audit logging.
- MCP, HTTP template, and WebGET adapters are adapter layers, not trusted cores.
- WebGET contributions must record what context and resources were actually read.

See `docs/SECURITY_MODEL.md` for details.
