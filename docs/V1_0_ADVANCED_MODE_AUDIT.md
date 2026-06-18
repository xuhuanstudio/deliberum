# v1.0 Advanced Mode Audit

Date: 2026-06-16

This audit closes production readiness Gate 6 for the current v1.0 supported
Web scope. It verifies that Advanced / Developer Mode preserves developer
diagnostics without becoming the normal user path.

No product behavior, runtime behavior, daemon capability, provider capability,
resource capability, auth behavior, or audit infrastructure was added for this
gate. One evidence gap was found and closed in the browser smoke: legacy
session subviews had Advanced panels, but the v1.0 boundary smoke did not yet
open those pages directly.

## Gate 6 Scope

Gate 6 covers the current Web surfaces that intentionally expose lower-level
diagnostics after a user opens Advanced / Developer Mode:

1. landing page operator details;
2. Connect AI setup diagnostics;
3. `/runs` discussion list default boundary;
4. Discussion Room start request, ledger trace, process proposal, and projection
   metadata panels;
5. current conclusion raw outcome panel;
6. legacy session overview ledger position panel;
7. legacy session main perspectives, open disagreements, requirements, current
   conclusion, risks/evidence, and ledger events views.

The gate does not require Advanced / Developer Mode to hide diagnostic material
after the user intentionally opens it. The gate requires the normal path to stay
human-first while preserving enough diagnostics for maintainers and operators.

## Browser Evidence

Command run on 2026-06-16:

```bash
corepack pnpm smoke:web-boundaries
```

Result:

- `smoke:web-boundaries`: passed.

Coverage:

- landing default view hides session ids, daemon base URL, runtime profiles,
  operation audit, and the underlying session catalog;
- landing Advanced operator details still expose the session lookup, daemon
  base URL, runtime profile status, operation audit, and session link;
- `/runs` discussion list hides run ids, session ids, and ledger events;
- Connect AI (`/setup/models`) hides runtime profile setup details, env var names, and
  secret env names until `Setup diagnostics` is opened;
- `/runs/:runId` hides Advanced start request JSON, run ledger timeline, run
  plan view, process-governance material, and projection metadata until their
  Advanced panels are opened;
- `/runs/:runId/outcome` hides candidate proposal override material, run/session
  ids, draft status, and raw outcome material until Advanced is opened;
- legacy `/sessions/:sessionId` overview hides session id, raw latest ledger
  entry, and ledger event types until `Ledger position` is opened;
- legacy main perspectives, open disagreements, requirements, current
  conclusion, and risks/evidence pages keep projection records, object ids,
  proposal-event details, lifecycle controls, resource access posture, and raw
  JSON behind Advanced;
- the explicit legacy ledger-events route is reachable only through the
  Advanced navigation and identifies itself as an Advanced / Developer Mode
  surface.

## Gate 6 Result

Gate 6 is complete for the v1.0 supported Web scope.

The default user path remains the product path. Advanced / Developer Mode keeps
diagnostics available intentionally, but it does not lead first-use setup,
provider configuration, discussion start, Discussion Room review, or current
conclusion review.

Future Web pages, recovery states, setup surfaces, participant-management
surfaces, or legacy developer pages must extend `smoke:web-boundaries` when they
add new Advanced diagnostics or new default user surfaces.
