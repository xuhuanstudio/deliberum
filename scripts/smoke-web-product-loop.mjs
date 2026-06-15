import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const dummyApiKey = "smoke-web-product-loop-token";
const modelName = "smoke-web-product-loop-model";
const discussionModelName = "smoke-web-product-loop-discussion-model";
const discussionQuestion =
  "Should Deliberum rely on the verified provider path for a real browser discussion?";

assertFile(daemonEntry);

const daemonPort = await reserveLocalPort();
const providerPort = await reserveLocalPort();
const webPort = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-web-product-loop-"));
const provider = await startOpenAICompatibleMockProvider(providerPort);
const daemon = startDaemonProcess({
  port: daemonPort,
  cwd: tempDir,
  webOrigin: `http://127.0.0.1:${webPort}`
});
const web = startWebProcess({
  port: webPort,
  daemonBaseUrl: `http://127.0.0.1:${daemonPort}`
});

let browser;
let activePage;

try {
  await waitForHttpOk(`http://127.0.0.1:${daemonPort}/health`, () => daemon.exited);
  await waitForHttpOk(`http://127.0.0.1:${webPort}/setup/models`, () => web.exited);

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  activePage = page;
  page.setDefaultTimeout(45_000);

  await runBrowserProductLoop(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    providerBaseUrl: `http://127.0.0.1:${providerPort}/v1`
  });

  if (provider.requestCount < 6) {
    throw new Error(
      `Browser product loop provider saw ${provider.requestCount} request(s); expected setup verification plus model-backed discussion requests.`
    );
  }
  if (provider.transientParticipantFailureCount !== 1) {
    throw new Error(
      `Browser product loop provider saw ${provider.transientParticipantFailureCount} transient participant failure(s); expected exactly one retryable first-response failure.`
    );
  }
  if (provider.discussionModelRequestCount < 5) {
    throw new Error(
      `Browser product loop provider saw ${provider.discussionModelRequestCount} request(s) for the per-discussion model; expected model-backed participant and review requests to use the override.`
    );
  }
} catch (error) {
  if (daemon.exited) {
    throw new Error(
      `Browser product loop daemon exited early: code=${daemon.exitCode} signal=${daemon.exitSignal}\n${formatProcessOutput(daemon.stdout, daemon.stderr)}`,
      { cause: error }
    );
  }

  if (web.exited) {
    throw new Error(
      `Browser product loop Web server exited early: code=${web.exitCode} signal=${web.exitSignal}\n${formatProcessOutput(web.stdout, web.stderr)}`,
      { cause: error }
    );
  }

  throw new Error(
    [
      "Browser product loop smoke failed.",
      await formatPageDebug(activePage),
      formatProcessOutput(daemon.stdout, daemon.stderr, "daemon"),
      formatProcessOutput(web.stdout, web.stderr, "web")
    ].join("\n"),
    { cause: error }
  );
} finally {
  if (browser) {
    await browser.close();
  }
  await terminateChild(web.child, web.exitPromise);
  await terminateChild(daemon.child, daemon.exitPromise);
  await provider.close();
  rmSync(tempDir, { recursive: true, force: true });
}

async function formatPageDebug(page) {
  if (!page) {
    return "page output: none.";
  }

  try {
    const text = await page.locator("body").innerText({ timeout: 1000 });
    return [
      `page url: ${page.url()}`,
      `page text:\n${text.slice(0, 4000)}`
    ].join("\n");
  } catch (error) {
    return `page output unavailable: ${error.message}`;
  }
}

console.log("Browser product loop smoke checks passed.");

async function runBrowserProductLoop(page, { webBaseUrl, providerBaseUrl }) {
  await page.goto(`${webBaseUrl}/setup/models`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Setup / Models" }).waitFor();
  await page.getByText("Local service connected").waitFor();
  await page.getByText("Configure OpenAI-compatible provider").waitFor();
  await assertDefaultViewSafety(page, "setup start", { providerBaseUrl });

  await page.getByLabel("Provider API key").fill(dummyApiKey);
  await page.getByLabel("Base URL").fill(providerBaseUrl);
  await page.getByRole("textbox", { name: "Model" }).fill(modelName);
  await page.getByRole("button", { name: "Save model setup" }).click();
  await page.getByText("Model setup saved locally").waitFor();
  await page.getByRole("button", { name: "Check readiness" }).click();
  await page.getByText("Ready to verify").first().waitFor();
  await assertDefaultViewSafety(page, "after saving setup", { providerBaseUrl });

  await page.getByRole("button", { name: "Verify connection" }).click();
  await page.getByText("Provider connection verified").waitFor();
  await page.getByText("Ready for discussions").first().waitFor();
  const focusedStartLink = page.getByRole("link", { name: "Start focused discussion" }).first();
  const broaderStartLink = page.getByRole("link", { name: "Start broader discussion" }).first();
  await focusedStartLink.waitFor();
  await broaderStartLink.waitFor();
  await assertStartLink(focusedStartLink, {
    label: "focused setup start link",
    perspectiveCount: "2"
  });
  await assertStartLink(broaderStartLink, {
    label: "broader setup start link",
    perspectiveCount: "3"
  });
  await assertDefaultViewSafety(page, "after verifying setup", { providerBaseUrl });

  await broaderStartLink.click();
  await page.waitForURL(/\/runs\/new\?participants=model-backed&perspectives=3$/);
  await page.getByRole("heading", { name: "Start a discussion" }).waitFor();
  await page.getByText("Model-backed discussion selected").waitFor();
  await page.getByText("Perspective C", { exact: true }).waitFor();
  await page.getByText("3 model perspectives").waitFor();
  await page.getByText("Model for this discussion").waitFor();
  await page.getByText("Saved model setup").waitFor();
  if (!(await page.getByRole("radio", { name: /Broader review/i }).isChecked())) {
    throw new Error("Broader setup start link did not preselect Broader review.");
  }
  await assertDefaultViewSafety(page, "broader start discussion", { providerBaseUrl });

  await page.getByRole("radio", { name: /Focused review/i }).click();
  if (!(await page.getByRole("radio", { name: /Focused review/i }).isChecked())) {
    throw new Error("Focused review could not be selected after checking the broader setup start link.");
  }
  await page.getByText("Ready to create a model-backed discussion").waitFor();
  await page.getByLabel("Model for this discussion").fill(discussionModelName);
  await page.getByText(discussionModelName).waitFor();
  await page
    .getByText("Every model-backed role in this discussion will use this model override.")
    .waitFor();
  await assertDefaultViewSafety(page, "start discussion", { providerBaseUrl });

  await page.getByLabel("Discussion question").fill(discussionQuestion);
  await page.getByRole("button", { name: "Create discussion" }).click();
  await page.getByText("Discussion room").waitFor();
  await page.getByText("Model-backed discussion").first().waitFor();
  await page.getByText("What is being discussed").waitFor();
  await page.getByRole("button", { name: "Continue discussion" }).waitFor();
  await assertDefaultViewSafety(page, "discussion room before continuation", { providerBaseUrl });

  await page.getByRole("button", { name: "Continue discussion" }).click();
  await page.getByText("Discussion paused", { exact: true }).waitFor();
  await page
    .getByText(
      "A first-response participant still needs to finish. Review visible progress, then try Continue discussion again."
    )
    .waitFor();
  await page.getByRole("region", { name: "Updated discussion steps" }).waitFor();
  await page.getByText("Needs attention").first().waitFor();
  await assertDefaultViewSafety(page, "discussion room after transient participant failure", {
    providerBaseUrl
  });

  await page.getByRole("button", { name: "Continue discussion" }).click();
  await page.getByText("Model-backed discussion continued").waitFor();
  await page.getByText("Participant first responses").waitFor();
  await page.getByText("This browser perspective supports the verified provider path.").first().waitFor();
  await page
    .getByText("Use the verified provider path for reviewable browser discussions")
    .first()
    .waitFor();
  await page
    .getByText("The browser walkthrough still needs to prove evidence gaps stay visible.")
    .first()
    .waitFor();
  await page
    .getByText("Confirm browser evidence before treating the conclusion as stable.")
    .first()
    .waitFor();
  await page.getByRole("region", { name: "Discussion outputs" }).waitFor();
  await page.getByText("Current conclusion: Ready to review").waitFor();
  await page.getByRole("heading", { name: "Next recommended actions", exact: true }).waitFor();
  await page.getByText("Risks").first().waitFor();
  await page.getByRole("link", { name: "View current conclusion", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Review evidence", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "View disagreements", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Review disagreements", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Check evidence", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Update conclusion", exact: true }).first().waitFor();
  await assertDefaultViewSafety(page, "discussion room after continuation", { providerBaseUrl });

  await page.getByRole("link", { name: "View current conclusion", exact: true }).first().click();
  await page.waitForURL(/\/outcome$/);
  await page.getByRole("heading", { name: "Current conclusion" }).first().waitFor();
  await page.getByText("Use the verified provider path after reviewing browser-visible disagreements.").waitFor();
  await page.getByText("Browser-backed conclusions remain provisional until risks are reviewed.").waitFor();
  await page.getByText("The browser walkthrough still needs to prove evidence gaps stay visible.").waitFor();
  await page.getByText("Run another browser walkthrough after UI changes.").waitFor();
  await assertDefaultViewSafety(page, "current conclusion", { providerBaseUrl });
}

async function assertStartLink(locator, { label, perspectiveCount }) {
  const href = await locator.getAttribute("href");

  if (!href?.includes("participants=model-backed")) {
    throw new Error(`${label} did not request model-backed participants.`);
  }

  if (!href.includes(`perspectives=${perspectiveCount}`)) {
    throw new Error(`${label} did not request ${perspectiveCount} model perspectives.`);
  }
}

async function assertDefaultViewSafety(page, label, { providerBaseUrl }) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenSnippets = [
    dummyApiKey,
    providerBaseUrl,
    modelName,
    "DELIBERUM_OPENAI_API_KEY",
    "providerConfigId",
    "openai-main",
    "smoke-browser-candidate",
    "smoke-browser-objection",
    "smoke-browser-evidence",
    "smoke-browser-topic-event",
    "smoke-browser-review-event",
    "provider_http_error",
    "transient browser product-loop participant failure"
  ];

  for (const snippet of forbiddenSnippets) {
    if (bodyText.includes(snippet)) {
      throw new Error(`${label} exposed forbidden default-view text: ${snippet}`);
    }
  }

  if (
    /\b(run|session|ledger|runtime|proposal|event|projection)\s*(id|ids)\b/i.test(bodyText) ||
    /raw json|resource posture/i.test(bodyText)
  ) {
    throw new Error(`${label} exposed low-level default-view language.`);
  }
}

async function startOpenAICompatibleMockProvider(port) {
  const state = {
    requestCount: 0,
    transientParticipantFailureCount: 0,
    discussionModelRequestCount: 0
  };
  const server = createHttpServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }

    state.requestCount += 1;

    try {
      const body = await readRequestJson(request);
      if (body?.model === discussionModelName) {
        state.discussionModelRequestCount += 1;
      }
      const content = createMockProviderContent(body, state);

      response.writeHead(200, {
        "content-type": "application/json"
      });
      response.end(
        JSON.stringify({
          id: `chatcmpl-browser-smoke-${state.requestCount}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: typeof body?.model === "string" ? body.model : modelName,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content
              }
            }
          ]
        })
      );
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: error.message } }));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });

  return {
    get requestCount() {
      return state.requestCount;
    },
    get transientParticipantFailureCount() {
      return state.transientParticipantFailureCount;
    },
    get discussionModelRequestCount() {
      return state.discussionModelRequestCount;
    },
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      })
  };
}

function createMockProviderContent(body, state) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages
    .filter((message) => message?.role === "system")
    .map((message) => String(message.content ?? ""))
    .join("\n");
  const userPayload = parseLastUserJson(messages);
  const userText = messages
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content ?? ""))
    .join("\n");

  if (system.includes("verifying Deliberum's local model provider setup")) {
    return "ready";
  }

  if (
    userText.includes("Display name: Perspective B") &&
    state.transientParticipantFailureCount === 0
  ) {
    state.transientParticipantFailureCount += 1;
    throw new Error("transient browser product-loop participant failure");
  }

  if (system.includes("Prepare Deliberum extraction proposal material only.")) {
    const allowedSourceEventIds = readStringArray(userPayload?.allowedSourceEventIds);
    const sourceEventIds = allowedSourceEventIds.length > 0
      ? [allowedSourceEventIds[0]]
      : [];

    return JSON.stringify({
      candidates: [
        {
          id: "smoke-browser-candidate",
          title: "Use the verified provider path for reviewable browser discussions",
          description:
            "The verified provider path can produce a reviewable browser conclusion when disagreements, evidence gaps, risks, and next actions stay visible.",
          sourceEventIds,
          status: "active",
          supportedBy: ["smoke-browser-claim"],
          attackedBy: ["smoke-browser-objection"],
          qualityObligationIds: ["smoke-browser-quality"],
          assumptions: ["The browser walkthrough verified provider setup first."],
          tradeoffs: ["The path must keep evidence gaps visible in the room."],
          applicableWhen: ["The local service and provider setup are both ready."]
        }
      ],
      claims: [
        {
          id: "smoke-browser-claim",
          content:
            "The browser product loop can move from provider setup to a reviewable conclusion.",
          scope: "process",
          sourceEventIds,
          supports: ["smoke-browser-candidate"],
          dependsOn: [],
          challengedBy: ["smoke-browser-objection"]
        }
      ],
      objections: [
        {
          id: "smoke-browser-objection",
          targetId: "smoke-browser-candidate",
          failureMode:
            "The browser walkthrough still needs to prove evidence gaps stay visible.",
          consequence:
            "A model-backed UI pass could hide missing evidence before users review the conclusion.",
          severityClaim: "major",
          status: "open",
          sourceEventIds,
          responses: []
        }
      ],
      evidenceNeeds: [
        {
          id: "smoke-browser-evidence",
          targetClaimId: "smoke-browser-claim",
          requiredKind: "tool",
          reason:
            "Confirm browser evidence before treating the conclusion as stable.",
          priority: "high",
          status: "open",
          sourceEventIds
        }
      ],
      qualityObligations: [
        {
          id: "smoke-browser-quality",
          scope: "final_output",
          targetCandidateId: "smoke-browser-candidate",
          requirement:
            "The conclusion must keep browser-visible options, disagreements, evidence gaps, risks, and next recommended actions visible.",
          status: "unanswered",
          sourceEventIds,
          supportingRefIds: ["smoke-browser-claim"],
          unresolvedObjectionIds: ["smoke-browser-objection"]
        }
      ],
      rationale:
        "The browser smoke provider returns deterministic review material for repeatable product-loop evidence."
    });
  }

  if (system.includes("Prepare Deliberum proposal review material only.")) {
    const allowedProposalEventIds = readStringArray(userPayload?.allowedProposalEventIds);
    return JSON.stringify({
      challenges: allowedProposalEventIds.slice(0, 1).map((proposalEventId) => ({
        targetProposalEventId: proposalEventId,
        reason:
          "Keep this generated proposal provisional until browser-visible evidence gaps are reviewed."
      })),
      notes: [
        "The browser smoke challenges the generated proposal to verify the default Web flow still reaches a provisional conclusion with disagreements visible."
      ]
    });
  }

  if (system.includes("Prepare Deliberum final candidate proposal material only.")) {
    const allowedCandidateIds = readStringArray(userPayload?.allowedCandidateIds);
    return JSON.stringify({
      candidateIds: allowedCandidateIds.slice(0, 1),
      recommendation:
        "Use the verified provider path after reviewing browser-visible disagreements.",
      applicabilityConditions: [
        "The local service is connected.",
        "The OpenAI-compatible provider has been saved and verified from Web."
      ],
      rationale:
        "The browser walkthrough reached reviewable discussion material from normal user actions.",
      limitations: [
        "The conclusion remains provisional until evidence gaps and risks are reviewed."
      ]
    });
  }

  if (system.includes("Prepare Deliberum final audit material only.")) {
    return JSON.stringify({
      findings: [
        "The provider-backed browser product loop produced a reviewable conclusion."
      ],
      risks: [
        "Browser-backed conclusions remain provisional until risks are reviewed."
      ],
      unresolvedObjectionIds: readStringArray(userPayload?.allowedUnresolvedObjectionIds),
      qualityObligationIds: readStringArray(userPayload?.allowedQualityObligationIds),
      evidenceNeedIds: readStringArray(userPayload?.allowedEvidenceNeedIds),
      omissions: [
        "The smoke uses a deterministic local provider."
      ],
      compressionProblems: [],
      limitations: [
        "A real external provider walkthrough should still be run before release."
      ],
      continuationSuggestions: [
        "Run another browser walkthrough after UI changes."
      ]
    });
  }

  return [
    "This browser perspective supports the verified provider path.",
    "Keep disagreements, evidence gaps, risk review, current conclusion, and next recommended actions visible."
  ].join(" ");
}

function parseLastUserJson(messages) {
  const userMessages = messages.filter((message) => message?.role === "user");
  const content = userMessages[userMessages.length - 1]?.content;

  if (typeof content !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function readStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function startDaemonProcess({ port, cwd, webOrigin }) {
  return startChildProcess(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_DAEMON_CORS_ORIGINS: webOrigin
    }
  });
}

function startWebProcess({ port, daemonBaseUrl }) {
  return startChildProcess(
    "corepack",
    [
      "pnpm",
      "--filter",
      "@deliberum/web",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort"
    ],
    {
      cwd: repoRoot,
      env: {
        ...buildMinimalEnv(),
        VITE_DELIBERUM_DAEMON_URL: daemonBaseUrl
      }
    }
  );
}

function startChildProcess(command, args, { cwd = repoRoot, env }) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const state = {
    stdout: "",
    stderr: "",
    exited: false,
    exitCode: null,
    exitSignal: null
  };
  const exitPromise = once(child, "exit").then(([code, signal]) => {
    state.exited = true;
    state.exitCode = code;
    state.exitSignal = signal;
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    state.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    state.stderr += chunk;
  });

  return {
    child,
    exitPromise,
    get stdout() {
      return state.stdout;
    },
    get stderr() {
      return state.stderr;
    },
    get exited() {
      return state.exited;
    },
    get exitCode() {
      return state.exitCode;
    },
    get exitSignal() {
      return state.exitSignal;
    }
  };
}

async function waitForHttpOk(url, hasExited) {
  let lastError;

  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (hasExited()) {
      throw new Error(`Process exited before ${url} was available.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`${url} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for ${url}.`, {
    cause: lastError
  });
}

function readRequestJson(request) {
  return new Promise((resolveRead, rejectRead) => {
    let data = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolveRead(JSON.parse(data));
      } catch (error) {
        rejectRead(error);
      }
    });
    request.on("error", rejectRead);
  });
}

async function reserveLocalPort() {
  const server = createNetServer();

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;

  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });

  if (!port) {
    throw new Error("Could not reserve a local port for browser product loop smoke.");
  }

  return port;
}

async function terminateChild(child, exitPromise) {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exitPromise;
    return;
  }

  child.kill("SIGTERM");

  const exited = await Promise.race([exitPromise.then(() => true), delay(2000).then(() => false)]);
  if (exited) {
    return;
  }

  child.kill("SIGKILL");
  await exitPromise;
}

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Browser product loop smoke requires built daemon entrypoint: ${filePath}`);
  }
}

function formatProcessOutput(stdout, stderr, label = "process") {
  const lines = [`${label} output:`];

  if (stdout.trim().length > 0) {
    lines.push(`stdout:\n${stdout.trim()}`);
  }

  if (stderr.trim().length > 0) {
    lines.push(`stderr:\n${stderr.trim()}`);
  }

  return lines.length > 1 ? lines.join("\n") : `${label} output: none.`;
}

function buildMinimalEnv() {
  const names = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "WINDIR"
  ];
  const env = {
    NODE_ENV: "test"
  };

  for (const name of names) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  }

  return env;
}
