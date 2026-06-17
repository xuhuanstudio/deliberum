import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientEntry = join(repoRoot, "packages", "client", "dist", "index.js");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const dummyApiKey = "smoke-web-resilience-token";
const modelName = "smoke-web-resilience-model";
const providerVerificationTimeoutMs = 500;
const providerTimeoutResponseDelayMs = providerVerificationTimeoutMs * 4;
const pausedQuestion =
  "Should Deliberum keep paused discussion updates readable and safe?";
const stageFailureQuestion =
  "Should Deliberum keep failed discussion steps recoverable?";

assertFile(clientEntry);
assertFile(daemonEntry);

const { DeliberumDaemonClient } = await import(pathToFileURL(clientEntry).href);
const { localPresetRunPlan } = await import(pathToFileURL(daemonEntry).href);

const daemonPort = await reserveLocalPort();
const providerPort = await reserveLocalPort();
const webPort = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-web-resilience-"));
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

  const client = new DeliberumDaemonClient({
    baseUrl: `http://127.0.0.1:${daemonPort}`
  });
  const providerBaseUrl = `http://127.0.0.1:${providerPort}/v1`;

  await client.saveOpenAICompatibleSetup({
    apiKey: dummyApiKey,
    baseUrl: providerBaseUrl,
    model: modelName
  });
  await client.verifyOpenAICompatibleSetup();

  const pausedRun = await client.createRun({
    runPlan: buildProviderBackedPausedRunPlan()
  });
  const pausedRunId = readString(pausedRun.run, "runId", "paused run id");
  const pausedSessionId = readString(pausedRun.session, "sessionId", "paused session id");
  const setupErrorRun = await client.createRun({
    runPlan: localPresetRunPlan()
  });
  const setupErrorRunId = readString(setupErrorRun.run, "runId", "setup error run id");
  const setupErrorSessionId = readString(
    setupErrorRun.session,
    "sessionId",
    "setup error session id"
  );
  const stageFailureRun = await client.createRun({
    runPlan: buildProviderBackedStageFailureRunPlan()
  });
  const stageFailureRunId = readString(stageFailureRun.run, "runId", "stage failure run id");
  const stageFailureSessionId = readString(
    stageFailureRun.session,
    "sessionId",
    "stage failure session id"
  );

  await waitForHttpOk(`http://127.0.0.1:${webPort}/`, () => web.exited);

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  activePage = page;
  page.setDefaultTimeout(45_000);

  await verifyPausedContinuation(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    providerBaseUrl,
    runId: pausedRunId,
    sessionId: pausedSessionId
  });
  await verifyRetryableSetupError(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    providerBaseUrl,
    runId: setupErrorRunId,
    sessionId: setupErrorSessionId
  });
  await verifyStageFailureRecovery(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    providerBaseUrl,
    runId: stageFailureRunId,
    sessionId: stageFailureSessionId
  });
  provider.setVerificationFailure("rate_limit");
  await verifyProviderRateLimitRecovery(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    providerBaseUrl
  });
  provider.setVerificationFailure("timeout");
  await verifyProviderTimeoutRecovery(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    providerBaseUrl
  });
} catch (error) {
  if (daemon.exited) {
    throw new Error(
      `Web resilience daemon exited early: code=${daemon.exitCode} signal=${daemon.exitSignal}\n${formatProcessOutput(daemon.stdout, daemon.stderr, "daemon")}`,
      { cause: error }
    );
  }

  if (web.exited) {
    throw new Error(
      `Web resilience server exited early: code=${web.exitCode} signal=${web.exitSignal}\n${formatProcessOutput(web.stdout, web.stderr, "web")}`,
      { cause: error }
    );
  }

  throw new Error(
    [
      "Web resilience smoke failed.",
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

console.log("Web resilience smoke checks passed.");

async function verifyPausedContinuation(page, { webBaseUrl, providerBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/runs/${encodeURIComponent(runId)}`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: pausedQuestion }).first().waitFor();
  await page.getByRole("button", { name: "Continue discussion" }).waitFor();
  await assertNoHorizontalOverflow(page, "paused run before update");
  await assertDefaultResilienceSafety(page, "paused run before update", {
    providerBaseUrl,
    runId,
    sessionId
  });

  await page.getByRole("button", { name: "Continue discussion" }).click();
  await page.getByText("Discussion paused").waitFor();
  await assertRoomUpdateMessage(page, "paused continuation result");
  await page.getByText("Stop reason", { exact: true }).waitFor();
  await page
    .getByText(
      "A guided step is still waiting on model work. Review visible progress or try again after checking setup."
    )
    .waitFor();
  await assertRoomReportDetailsHidden(page, "paused continuation result");
  await assertNoHorizontalOverflow(page, "paused continuation result");
  await assertDefaultResilienceSafety(page, "paused continuation result", {
    providerBaseUrl,
    runId,
    sessionId
  });
  await assertHiddenFromDefault(page, "Raw stage metadata", "paused continuation result");

  await openRoomUpdateDetails(page, "paused continuation result");
  const updatedSteps = page.getByRole("region", { name: "Updated discussion steps" });
  await updatedSteps.waitFor();
  await updatedSteps.getByText("Needs attention", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Raw stage metadata" }).waitFor();
  await page.getByText("waiting_for_generators").first().waitFor();
}

async function verifyRetryableSetupError(page, { webBaseUrl, providerBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/runs/${encodeURIComponent(runId)}`, {
    waitUntil: "networkidle"
  });
  await page
    .getByRole("heading", { name: "Review a proposed rollout before relying on it." })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Continue discussion" }).waitFor();
  await assertNoHorizontalOverflow(page, "retryable setup error before update");
  await assertDefaultResilienceSafety(page, "retryable setup error before update", {
    providerBaseUrl,
    runId,
    sessionId
  });

  await page.getByRole("button", { name: "Continue discussion" }).click();
  await page.getByText("Discussion could not continue").waitFor();
  await page
    .getByText(
      "This discussion cannot continue because the required setup is unavailable. Open Advanced mode to inspect setup details before retrying."
    )
    .waitFor();
  await assertDefaultResilienceSafety(page, "retryable setup error", {
    providerBaseUrl,
    runId,
    sessionId
  });

  await page.getByRole("button", { name: "Continue discussion" }).click();
  await page.getByText("Discussion could not continue").waitFor();
  await page
    .getByText(
      "This discussion cannot continue because the required setup is unavailable. Open Advanced mode to inspect setup details before retrying."
    )
    .waitFor();
  await assertNoHorizontalOverflow(page, "retryable setup error retry");
  await assertDefaultResilienceSafety(page, "retryable setup error retry", {
    providerBaseUrl,
    runId,
    sessionId
  });
}

async function verifyStageFailureRecovery(page, { webBaseUrl, providerBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/runs/${encodeURIComponent(runId)}`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: stageFailureQuestion }).first().waitFor();
  await page.getByRole("button", { name: "Continue discussion" }).waitFor();
  await assertNoHorizontalOverflow(page, "stage failure before update");
  await assertDefaultResilienceSafety(page, "stage failure before update", {
    providerBaseUrl,
    runId,
    sessionId
  });

  await page.getByRole("button", { name: "Continue discussion" }).click();
  await page.getByText("Discussion could not continue").waitFor();
  await page
    .getByText(
      "A model or review step could not finish safely. Check model setup, then try Continue discussion again. If the same discussion keeps failing after partial responses, start a new model-backed discussion."
    )
    .waitFor();
  const recoveryRegion = page.getByRole("region", { name: "Discussion recovery options" });
  await recoveryRegion.waitFor();
  await recoveryRegion.getByText("Check model setup", { exact: true }).waitFor();
  await recoveryRegion.getByText("Try Continue discussion again", { exact: true }).waitFor();
  await recoveryRegion.getByText("Start a new model-backed discussion", { exact: true }).waitFor();

  await assertLinkHref(page, "Check model setup", "/setup/models", "stage failure recovery");
  await assertLinkHrefIncludes(
    page,
    "Start a new model-backed discussion",
    "participants=model-backed",
    "stage failure recovery"
  );
  await assertNoHorizontalOverflow(page, "stage failure recovery");
  await assertDefaultResilienceSafety(page, "stage failure recovery", {
    providerBaseUrl,
    runId,
    sessionId
  });
}

async function verifyProviderRateLimitRecovery(page, { webBaseUrl, providerBaseUrl }) {
  await page.goto(`${webBaseUrl}/setup/models`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: "Setup / Models" }).waitFor();
  await page.getByRole("button", { name: "Verify connection" }).click();
  await page.getByText("Provider connection could not be verified").waitFor();
  await page
    .getByText("Provider rate limited the verification request. Try again later.")
    .waitFor();

  const recoveryRegion = page.getByRole("region", {
    name: "Provider verification recovery options"
  });
  await recoveryRegion.waitFor();
  await recoveryRegion.getByText("Review setup fields", { exact: true }).waitFor();
  await recoveryRegion.getByText("Try Verify connection again", { exact: true }).waitFor();
  await recoveryRegion.getByText("Start demo discussion", { exact: true }).waitFor();

  await assertLinkHref(page, "Review setup fields", "#setup-provider-form", "rate limit recovery");
  await assertLinkHrefIncludes(
    page,
    "Start demo discussion",
    "participants=demo",
    "rate limit recovery"
  );
  await assertNoHorizontalOverflow(page, "rate limit provider verification recovery");
  await assertDefaultResilienceSafety(page, "rate limit provider verification recovery", {
    providerBaseUrl,
    runId: "not-rendered-run-id",
    sessionId: "not-rendered-session-id"
  });
}

async function verifyProviderTimeoutRecovery(page, { webBaseUrl, providerBaseUrl }) {
  await page.goto(`${webBaseUrl}/setup/models`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: "Setup / Models" }).waitFor();
  await page.getByRole("button", { name: "Verify connection" }).click();
  await page.getByText("Provider connection could not be verified").waitFor();
  await page
    .getByText("Provider verification timed out. Check the base URL and provider availability.")
    .waitFor();

  const recoveryRegion = page.getByRole("region", {
    name: "Provider verification recovery options"
  });
  await recoveryRegion.waitFor();
  await recoveryRegion.getByText("Review setup fields", { exact: true }).waitFor();
  await recoveryRegion.getByText("Try Verify connection again", { exact: true }).waitFor();
  await recoveryRegion.getByText("Start demo discussion", { exact: true }).waitFor();

  await assertLinkHref(page, "Review setup fields", "#setup-provider-form", "timeout recovery");
  await assertLinkHrefIncludes(
    page,
    "Start demo discussion",
    "participants=demo",
    "timeout recovery"
  );
  await assertNoHorizontalOverflow(page, "timeout provider verification recovery");
  await assertDefaultResilienceSafety(page, "timeout provider verification recovery", {
    providerBaseUrl,
    runId: "not-rendered-run-id",
    sessionId: "not-rendered-session-id"
  });
}

async function assertLinkHref(page, text, expectedHref, label) {
  const href = await page.locator("a", { hasText: text }).first().getAttribute("href");

  if (href !== expectedHref) {
    throw new Error(`${label} expected ${text} link href ${expectedHref}, got ${href ?? "none"}.`);
  }
}

async function assertLinkHrefIncludes(page, text, expectedSnippet, label) {
  const href = await page.locator("a", { hasText: text }).first().getAttribute("href");

  if (!href?.includes(expectedSnippet)) {
    throw new Error(
      `${label} expected ${text} link href to include ${expectedSnippet}, got ${href ?? "none"}.`
    );
  }
}

async function assertRoomUpdateMessage(page, label) {
  const roomUpdate = page.locator("#latest-discussion-update.du-room-update-message");
  try {
    await roomUpdate.waitFor();
    await roomUpdate.locator(".du-room-update-avatar").waitFor();
    await roomUpdate.getByText("Room update", { exact: true }).waitFor();
    await roomUpdate.getByRole("heading", { name: "The room just updated" }).waitFor();
    await roomUpdate.getByRole("region", { name: "New discussion round" }).waitFor();
    const updateMessages = roomUpdate.getByRole("list", { name: "Discussion update messages" });
    await updateMessages.waitFor();
    await updateMessages.getByText("Perspective A", { exact: true }).first().waitFor();
    await updateMessages.getByText("Perspective B", { exact: true }).first().waitFor();
    await updateMessages
      .getByText("Answered another participant", { exact: true })
      .first()
      .waitFor();
    const oldShortcutCount = await roomUpdate
      .getByRole("navigation", { name: "Room update shortcuts" })
      .count();
    const defaultStepCount = await roomUpdate
      .getByRole("region", { name: "Updated discussion steps" })
      .count();
    const hasOldRoomReviewCopy = await roomUpdate.evaluate(
      (element) =>
        (element.textContent?.includes("Review this room update") ?? false) ||
        (element.textContent?.includes("Review detailed update") ?? false) ||
        Boolean(element.querySelector('details[data-advanced-panel="Post-update discussion details"]')?.open)
    );

    if (oldShortcutCount !== 0 || defaultStepCount !== 0 || hasOldRoomReviewCopy) {
      throw new Error(
        `${label} should show the continuation as room messages first, got ${JSON.stringify({
          oldShortcutCount,
          defaultStepCount,
          hasOldRoomReviewCopy
        })}.`
      );
    }
  } catch (error) {
    throw new Error(`${label} did not render the latest update as a room message.`, {
      cause: error
    });
  }
}

async function openRoomUpdateDetails(page, label) {
  const details = page.locator(
    '#latest-discussion-update.du-room-update-message details[data-advanced-panel="Post-update discussion details"]'
  );

  try {
    await details.waitFor();

    if (!(await details.evaluate((element) => element.open))) {
      await details.locator("summary").click();
    }
  } catch (error) {
    throw new Error(`${label} could not open detailed room update.`, {
      cause: error
    });
  }
}

async function assertRoomReportDetailsHidden(page, label) {
  const reportDetailsCount = await page.locator("details.du-room-secondary-details").count();
  const briefDetailsCount = await page.locator(".du-room-brief").count();
  const outputSummaryCount = await page.locator("details.du-room-outputs-section").count();

  if (reportDetailsCount !== 0 || briefDetailsCount !== 0 || outputSummaryCount !== 0) {
    throw new Error(
      `${label} should not show report-style room details by default, got ${JSON.stringify({
        reportDetailsCount,
        briefDetailsCount,
        outputSummaryCount
      })}.`
    );
  }
}

async function assertHiddenFromDefault(page, snippet, label) {
  const bodyText = await page.locator("body").innerText();

  if (bodyText.includes(snippet)) {
    throw new Error(`${label} exposed Advanced text before the user opened Advanced: ${snippet}`);
  }
}

async function assertDefaultResilienceSafety(page, label, { providerBaseUrl, runId, sessionId }) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenSnippets = [
    dummyApiKey,
    providerBaseUrl,
    modelName,
    runId,
    sessionId,
    "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE",
    "DELIBERUM_OPENAI_API_KEY",
    "DELIBERUM_OPENAI_BASE_URL",
    "DELIBERUM_OPENAI_TIMEOUT_MS",
    "DELIBERUM_ENABLE_LOCAL_PRESET",
    "providerConfigId",
    "openai-main",
    "openai-compatible",
    "local-preset-alpha",
    "local-preset-beta",
    "local-preset-extractor",
    "Required orchestration component is unavailable.",
    "orchestration_component_unavailable",
    "waiting_for_generators",
    "extraction_output_invalid",
    "run_stage_failed",
    "provider_rate_limited",
    "provider_timeout",
    "Run stage could not be processed safely.",
    "OpenAI-compatible provider request timed out.",
    "budget_exceeded",
    "provider_http_error",
    "raw JSON",
    "Raw stage metadata",
    "AdapterRegistry",
    "stack"
  ];

  for (const snippet of forbiddenSnippets) {
    if (bodyText.includes(snippet)) {
      throw new Error(`${label} exposed forbidden default-view text: ${snippet}`);
    }
  }

  if (
    /\b(run|session|ledger|runtime|proposal|event|projection)\s*(id|ids)\b/i.test(bodyText) ||
    /resource posture|operation audit/i.test(bodyText)
  ) {
    throw new Error(`${label} exposed low-level default-view language.`);
  }
}

function buildProviderBackedPausedRunPlan() {
  return {
    ...buildProviderBackedRunPlan(pausedQuestion),
    budget: {
      maxEvents: 40,
      maxProviderCalls: 10
    }
  };
}

function buildProviderBackedStageFailureRunPlan() {
  return {
    ...buildProviderBackedRunPlan(stageFailureQuestion),
    budget: {
      maxEvents: 40,
      maxProviderCalls: 0
    }
  };
}

function buildProviderBackedRunPlan(question) {
  return {
    title: `Discussion: ${question}`,
    topic: question,
    goals: [
      "Confirm paused and retryable states stay readable for normal users.",
      "Keep technical status details out of the default Web view."
    ],
    constraints: [
      "Use configured model-backed participants from the local service.",
      "Keep provider credentials saved locally and out of the discussion."
    ],
    participants: [
      {
        id: "provider-perspective-a",
        kind: "model",
        displayName: "Perspective A",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      },
      {
        id: "provider-perspective-b",
        kind: "model",
        displayName: "Perspective B",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      }
    ],
    providerConfigs: [
      {
        id: "openai-main",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      }
    ],
    timeouts: {
      participantMs: 90000,
      overallMs: 240000
    },
    output: {
      language: "en",
      style: "clear",
      expectations: [
        "Show paused discussion state in user-facing language.",
        "Keep technical status details behind Advanced details."
      ]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["provider-perspective-a", "provider-perspective-b"]
    }
  };
}

async function startOpenAICompatibleMockProvider(port) {
  const state = {
    requestCount: 0,
    verificationFailure: undefined
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

      if (isVerificationRequest(body) && state.verificationFailure === "rate_limit") {
        response.writeHead(429, {
          "content-type": "application/json"
        });
        response.end(JSON.stringify({ error: { message: "mock provider rate limit" } }));
        return;
      }

      if (isVerificationRequest(body) && state.verificationFailure === "timeout") {
        await waitForResponseCloseOrDelay(response, providerTimeoutResponseDelayMs);
        if (!response.destroyed && !response.writableEnded) {
          response.writeHead(200, {
            "content-type": "application/json"
          });
          response.end(
            JSON.stringify({
              id: `chatcmpl-resilience-timeout-${state.requestCount}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: modelName,
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  message: {
                    role: "assistant",
                    content: "ready"
                  }
                }
              ]
            })
          );
        }
        return;
      }

      const content = createMockProviderContent(body);

      response.writeHead(200, {
        "content-type": "application/json"
      });
      response.end(
        JSON.stringify({
          id: `chatcmpl-resilience-${state.requestCount}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: modelName,
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
    setVerificationFailure(failure) {
      state.verificationFailure = failure;
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

function createMockProviderContent(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages
    .filter((message) => message?.role === "system")
    .map((message) => String(message.content ?? ""))
    .join("\n");

  if (isVerificationRequest(body)) {
    return "ready";
  }

  if (system.includes("Prepare Deliberum extraction proposal material only.")) {
    return "This is deliberately not JSON so the Web paused-state path can be verified.";
  }

  return [
    "This resilience perspective checks paused discussion states.",
    "Keep the default page readable and move technical details to Advanced details."
  ].join(" ");
}

function isVerificationRequest(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages
    .filter((message) => message?.role === "system")
    .map((message) => String(message.content ?? ""))
    .join("\n");

  return system.includes("verifying Deliberum's local model provider setup");
}

async function waitForResponseCloseOrDelay(response, timeoutMs) {
  if (response.destroyed || response.writableEnded) {
    return;
  }

  await Promise.race([
    once(response, "close").then(() => undefined),
    delay(timeoutMs).then(() => undefined)
  ]);
}

function startDaemonProcess({ port, cwd, webOrigin }) {
  return startChildProcess(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_DAEMON_CORS_ORIGINS: webOrigin,
      DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE: "true",
      DELIBERUM_OPENAI_TIMEOUT_MS: String(providerVerificationTimeoutMs)
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
    throw new Error("Could not reserve a local port for Web resilience smoke.");
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

function readString(record, key, label) {
  const value = record?.[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  if (metrics.scrollWidth > metrics.width + 2) {
    throw new Error(
      `${label} has horizontal overflow: width=${metrics.width}, scrollWidth=${metrics.scrollWidth}.`
    );
  }
}

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Web resilience smoke requires built entrypoint: ${filePath}`);
  }
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
