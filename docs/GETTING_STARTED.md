# Getting Started

This guide is the shortest supported path for running Deliberum from a source
checkout, opening the Web UI, configuring a model provider, and completing one
discussion with AI participants.

For Simplified Chinese, see [Getting Started zh-CN](zh-CN/GETTING_STARTED.md).

## What Deliberum Does

Deliberum is a local-first multi-perspective deliberation product. You give it a
question or decision topic, configure model participants, and review a structured
discussion: independent perspectives, strongest current options, open
disagreements, missing evidence, risks, the current conclusion, and next
recommended actions.

Normal users should start from the Web UI. Advanced daemon, ledger, runtime,
raw JSON, and internal id details are available only when you open Advanced /
Developer Mode.

## What You Need

- macOS or Ubuntu Linux.
- Node.js 24 or newer.
- Corepack enabled.
- pnpm 11 through Corepack.
- An OpenAI-compatible provider API key, base URL, and model if you want a real
  discussion with AI participants.

Windows and WSL2 may work, but they are not v1.1 supported platforms until the
local-start path is verified in CI.

## 1. Check Local Tools

From the repository root:

```bash
node scripts/check-local-prerequisites.mjs
```

Fix any reported Node.js, Corepack, or pnpm issue before continuing.

## 2. Install and Build

```bash
corepack pnpm install
corepack pnpm doctor:local
corepack pnpm build
```

Do not skip the build step. The local service serves the built Web UI.

## 3. Start Deliberum Locally

```bash
corepack pnpm start:local
```

Keep this terminal running. The command starts one local service on
`127.0.0.1`, serves the Web UI, and stores local discussion state under
`.deliberum/deliberum.sqlite`.

If port `3877` is busy, use another local port:

```bash
DELIBERUM_PORT=3888 corepack pnpm start:local
```

## 4. Open the Web UI

Open:

```text
http://127.0.0.1:3877/
```

The home page should explain Deliberum as a multi-perspective deliberation
product and show whether the local service is connected.

If the Web UI says the local service is unavailable, keep the `start:local`
terminal running, open the URL printed by that command, then use Check again in
Connect AI.

## 5. Connect AI

Open:

```text
http://127.0.0.1:3877/setup/models
```

This opens **Connect AI**. Use Configure OpenAI-compatible provider and enter:

- API key;
- base URL;
- model;
- Structured review compatibility, usually enabled.

Save the setup, then use Verify connection.

Secrets stay on this machine. The default Web UI must not show saved API keys,
provider config ids, env var names, raw provider responses, raw JSON, or
internal runtime details.

## 6. Choose Participants and Start a Discussion

After the provider verifies, Connect AI shows whether discussions with AI
participants are ready.

Use:

- Start focused discussion for two model perspectives.
- Start broader discussion for three model perspectives.

You can also open:

```text
http://127.0.0.1:3877/runs/new?participants=model-backed
```

Write the discussion question. Use the default participant model choices first
unless you have a reason to customize First viewpoint, Alternative viewpoint,
Additional viewpoint, Skeptic, Evidence checker, Risk reviewer, or Summary
writer.

## 7. Read the Discussion Room

After creating the discussion, open the room and use Continue discussion. The
default view should show:

- the discussion brief;
- participant/model perspectives as readable contributions;
- a discussion timeline;
- strongest current options;
- open disagreements;
- missing evidence or evidence gaps;
- risks;
- current conclusion;
- next recommended actions.

You should not need to understand run ids, session ids, ledger events, runtime
profiles, proposals, projections, or raw JSON to use the default path.

## 8. Continue or Recover

Use user-facing actions in the room:

- Continue discussion;
- Ask for stronger options;
- Review disagreements;
- Check evidence;
- Update conclusion.

If provider verification or continuation fails, use the visible recovery actions
first:

- Review setup fields;
- Try Verify connection again;
- Check model setup;
- Try Continue discussion again;
- Start a new discussion with AI;
- Start a demo discussion while fixing provider setup.

Do not paste API keys, full provider responses, raw model output, or local
runtime data into public issues or logs.

## Local Deployment Options

For normal local use, prefer the source-checkout single-process path:

```bash
corepack pnpm build
corepack pnpm start:local
```

For local/pre-production container use:

```bash
docker build -t deliberum:local .
docker run --rm \
  -p 127.0.0.1:3877:3877 \
  -v deliberum-data:/data \
  deliberum:local
```

Deliberum v1.1 is not a public hosted service and does not claim production
multi-user authorization, production identity, or distributed production
database support. For trusted-team or remote pre-production hardening, see
[Deployment](DEPLOYMENT.md).

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Prerequisite check fails | Install Node.js 24 or newer, enable Corepack, then rerun `node scripts/check-local-prerequisites.mjs`. |
| Install or build fails | Run `corepack pnpm install`, then `corepack pnpm doctor:local`, then `corepack pnpm build`. |
| Web build is missing | Run `corepack pnpm build`, then restart with `corepack pnpm start:local`. |
| Port `3877` is busy | Start with `DELIBERUM_PORT=3888 corepack pnpm start:local` and open the printed URL. |
| Local service is unavailable | Keep `start:local` running, open the printed local URL, then use Check again in Connect AI. |
| Provider verification fails | Check the API key, base URL, model, and Structured review compatibility setting, then Verify connection again. |
| Real provider discussion pauses or fails | Use Check model setup or Try Continue discussion again before changing low-level settings. |

## Where to Go Next

- Product path and acceptance checklist: [Basic Product Loop Completion Matrix](BASIC_PRODUCT_LOOP.md).
- Local/pre-production deployment: [Deployment](DEPLOYMENT.md).
- Discussion Room walkthrough: [Web Discussion Room Walkthrough](WEB_DISCUSSION_ROOM_WALKTHROUGH.md).
- Architecture details: [Architecture](ARCHITECTURE.md).
- Latest release scope: [v1.1 Release Notes](V1_1_RELEASE_NOTES.md).
- v1.0 historical scope: [v1.0 Release Notes](V1_0_RELEASE_NOTES.md).
