# Deliberum Codex Goal

Build Deliberum as a complete, usable, local-first deliberation product for real users.

The Web UI is the human-friendly visual operating surface for the whole Deliberum system: setup, daemon readiness, model/provider configuration, participant readiness, discussion workflow, conclusions, disagreements, evidence gaps, risks, and next actions.

Internal runtime, daemon, CLI, adapter, audit, auth, or resource capability does not count as product completeness unless it directly supports the visible end-to-end user path.

Before each batch, choose the smallest verifiable change that makes the whole product more usable. Do not keep deepening one subsystem while setup, model readiness, discussion start, conclusion review, or next actions remain incomplete.

Default UI must use product language for normal users and keep low-level ids, env details, raw JSON, runtime internals, provider secrets, resource internals, and audit internals behind Advanced / Developer Mode.

Work in narrow verified batches, keep English user-facing text as default, keep Simplified Chinese supported, commit with English Conventional Commit messages, and report verification, remaining gaps, commit hash, and CI status when publishing changes.
