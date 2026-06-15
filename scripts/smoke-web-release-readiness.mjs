import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const releaseConfig = readReleaseSmokeConfig();
const discussionQuestion = [
  "Run a Deliberum release-readiness check for a normal local user.",
  "Assess whether the product loop is ready to configure a real model provider,",
  "start a model-backed discussion, review disagreements, inspect missing evidence,",
  "understand risks, read the current conclusion, and choose next recommended actions."
].join(" ");

assertFile(daemonEntry);

const daemonPort = await reserveLocalPort();
const webPort = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-web-release-readiness-"));
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
let latestContinuationDebug = "";

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
  page.setDefaultTimeout(releaseConfig.browserTimeoutMs);

  await runReleaseReadinessProductLoop(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`
  });
} catch (error) {
  if (daemon.exited) {
    throw new Error(
      redactSensitive(
        `Release readiness daemon exited early: code=${daemon.exitCode} signal=${daemon.exitSignal}\n${formatProcessOutput(daemon.stdout, daemon.stderr, "daemon")}`
      ),
      { cause: error }
    );
  }

  if (web.exited) {
    throw new Error(
      redactSensitive(
        `Release readiness Web server exited early: code=${web.exitCode} signal=${web.exitSignal}\n${formatProcessOutput(web.stdout, web.stderr, "web")}`
      ),
      { cause: error }
    );
  }

  throw new Error(
    redactSensitive(
      [
        "Release readiness browser smoke failed.",
        await formatPageDebug(activePage),
        latestContinuationDebug,
        formatProcessOutput(daemon.stdout, daemon.stderr, "daemon"),
        formatProcessOutput(web.stdout, web.stderr, "web")
      ].join("\n")
    ),
    { cause: error }
  );
} finally {
  if (browser) {
    await browser.close();
  }
  await terminateChild(web.child, web.exitPromise);
  await terminateChild(daemon.child, daemon.exitPromise);
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Release readiness browser smoke checks passed.");

async function runReleaseReadinessProductLoop(page, { webBaseUrl }) {
  await page.goto(`${webBaseUrl}/setup/models`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Setup / Models" }).waitFor();
  await page.getByText("Local service connected").waitFor();
  await page.getByText("Configure OpenAI-compatible provider").waitFor();
  await page.getByText("Structured review compatibility").waitFor();
  await assertDefaultViewSafety(page, "setup start");

  await page.getByLabel("Provider API key").fill(releaseConfig.apiKey);
  await page.getByLabel("Base URL").fill(releaseConfig.providerBaseUrl);
  await page.getByRole("textbox", { name: "Model" }).fill(releaseConfig.model);
  const structuredReview = page.getByRole("checkbox", {
    name: /Structured review compatibility/
  });
  if (!(await structuredReview.isChecked())) {
    await structuredReview.check();
  }
  await page.getByRole("button", { name: "Save model setup" }).click();
  await page.getByText("Model setup saved locally").waitFor();
  await page.getByRole("button", { name: "Check readiness" }).click();
  await page.getByText("Ready to verify").first().waitFor();
  await assertDefaultViewSafety(page, "after saving setup");

  await page.getByRole("button", { name: "Verify connection" }).click();
  await page.getByText("Provider connection verified").waitFor({
    timeout: releaseConfig.providerTimeoutMs
  });
  await page.getByText("Ready for discussions").first().waitFor();
  await assertDefaultViewSafety(page, "after verifying setup");

  await page.getByRole("link", { name: "Start model-backed discussion" }).first().click();
  await page.waitForURL(/\/runs\/new\?participants=model-backed$/);
  await page.getByRole("heading", { name: "Start a discussion" }).waitFor();
  await page.getByText("Model-backed discussion selected").waitFor();
  await page.getByText("Ready to create a model-backed discussion").waitFor();
  await assertDefaultViewSafety(page, "start discussion");

  await page.getByLabel("Discussion question").fill(discussionQuestion);
  await page.getByRole("button", { name: "Create discussion" }).click();
  await page.getByText("Discussion room").waitFor();
  await page.getByText("Model-backed discussion").first().waitFor();
  await page.getByText("What is being discussed").waitFor();
  await page.getByRole("button", { name: "Continue discussion" }).waitFor();
  await assertDefaultViewSafety(page, "discussion room before continuation");

  await continueDiscussionUntilCompleted(page);

  await page.getByText("Participant first responses").waitFor();
  await page.getByRole("region", { name: "Discussion outputs" }).waitFor();
  await page.getByText("Strongest current options").first().waitFor();
  await page.getByText("Open disagreements").first().waitFor();
  await page.getByText("Missing evidence").first().waitFor();
  await page.getByText("Risks").first().waitFor();
  await page.getByText("Current conclusion: Ready to review").waitFor();
  await page.getByRole("heading", { name: "Next recommended actions", exact: true }).waitFor();
  await page.getByRole("link", { name: "View current conclusion", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Review disagreements", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Check evidence", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Update conclusion", exact: true }).first().waitFor();
  await assertDefaultViewSafety(page, "discussion room after continuation", {
    allowModelGeneratedLowLevelLanguage: true
  });

  await page.getByRole("link", { name: "View current conclusion", exact: true }).first().click();
  await page.waitForURL(/\/outcome$/);
  await page.getByRole("heading", { name: "Current conclusion" }).first().waitFor();
  await page.getByText("Open disagreements").first().waitFor();
  await page.getByText("Missing evidence").first().waitFor();
  await page.getByText("Risks").first().waitFor();
  await page.getByRole("heading", { name: "Next recommended actions", exact: true }).waitFor();
  await assertDefaultViewSafety(page, "current conclusion", {
    allowModelGeneratedLowLevelLanguage: true
  });
}

async function continueDiscussionUntilCompleted(page) {
  let finalState = "not_started";

  for (let attempt = 1; attempt <= releaseConfig.continueAttempts; attempt += 1) {
    const [startResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/runs\/[^/]+\/start$/.test(new URL(response.url()).pathname),
        { timeout: releaseConfig.productLoopTimeoutMs }
      ),
      page.getByRole("button", { name: "Continue discussion" }).click()
    ]);
    latestContinuationDebug = await summarizeStartResponse(startResponse, attempt);
    finalState = await waitForFirstVisible(page, [
      {
        label: "continued",
        locator: page.getByText("Model-backed discussion continued")
      },
      {
        label: "paused",
        locator: page.getByText("Discussion paused")
      },
      {
        label: "failed",
        locator: page.getByText("Discussion could not continue")
      }
    ], releaseConfig.productLoopTimeoutMs);

    if (finalState === "continued") {
      return;
    }

    if (attempt < releaseConfig.continueAttempts) {
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Discussion room" }).waitFor();
      await page.getByRole("button", { name: "Continue discussion" }).waitFor();
      await assertDefaultViewSafety(page, `discussion room before continuation retry ${attempt + 1}`, {
        allowModelGeneratedLowLevelLanguage: true
      });
    }
  }

  throw new Error(
    `Release readiness walkthrough did not complete the model-backed continuation after ${releaseConfig.continueAttempts} attempt(s): ${finalState}.`
  );
}

async function summarizeStartResponse(response, attempt) {
  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    return [
      `continuation attempt ${attempt}: start response HTTP ${response.status()}`,
      `start response JSON parse failed: ${error.message}`
    ].join("\n");
  }

  return redactSensitive(
    [
      `continuation attempt ${attempt}: start response HTTP ${response.status()}`,
      JSON.stringify(summarizeStartPayload(payload), null, 2)
    ].join("\n")
  );
}

function summarizeStartPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      payload: "non_object"
    };
  }

  const stages = Array.isArray(payload.stages) ? payload.stages : [];

  return {
    code: readRecordValue(payload, "code"),
    message: readRecordValue(payload, "message"),
    error: summarizeErrorPayload(readRecordValue(payload, "error")),
    stopped: payload.stopped,
    stopReason: payload.stopReason,
    stages: stages.map((stage) => ({
      stage: readRecordValue(stage, "stage"),
      executionStatus: readRecordValue(stage, "executionStatus"),
      status: readRecordValue(stage, "status"),
      result: summarizeStageResult(readRecordValue(stage, "result"))
    }))
  };
}

function summarizeErrorPayload(error) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  return {
    code: readRecordValue(error, "code"),
    message: readRecordValue(error, "message")
  };
}

function summarizeStageResult(result) {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  return {
    participantResults: summarizeRoundResults(readRecordValue(result, "participantResults")),
    proposalResults: summarizeRoundResults(readRecordValue(result, "proposalResults")),
    reviewResults: summarizeRoundResults(readRecordValue(result, "reviewResults")),
    finalCandidateResult: summarizeSingleRoundResult(
      readRecordValue(result, "finalCandidateResult")
    ),
    auditResults: summarizeRoundResults(readRecordValue(result, "auditResults"))
  };
}

function summarizeRoundResults(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map(summarizeSingleRoundResult);
}

function summarizeSingleRoundResult(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return {
    participantId: readRecordValue(value, "participantId"),
    generatorId: readRecordValue(value, "generatorId"),
    reviewerId: readRecordValue(value, "reviewerId"),
    auditorId: readRecordValue(value, "auditorId"),
    adapterId: readRecordValue(value, "adapterId"),
    status: readRecordValue(value, "status"),
    errorCategory: readRecordValue(value, "errorCategory")
  };
}

function readRecordValue(value, key) {
  return value && typeof value === "object" ? value[key] : undefined;
}

async function waitForFirstVisible(page, entries, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const entry of entries) {
      const visible = await entry.locator
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);

      if (visible) {
        return entry.label;
      }
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for one of: ${entries.map((entry) => entry.label).join(", ")}.`);
}

async function assertDefaultViewSafety(
  page,
  label,
  { allowModelGeneratedLowLevelLanguage = false } = {}
) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenValues = [
    {
      label: "provider API key",
      value: releaseConfig.apiKey
    },
    {
      label: "provider base URL",
      value: releaseConfig.providerBaseUrl
    },
    {
      label: "provider input URL",
      value: releaseConfig.providerInputUrl
    },
    {
      label: "provider model",
      value: releaseConfig.model
    },
    {
      label: "OpenAI API env var",
      value: "DELIBERUM_OPENAI_API_KEY"
    },
    {
      label: "provider config id",
      value: "openai-main"
    }
  ];

  for (const item of forbiddenValues) {
    if (item.value && bodyText.includes(item.value)) {
      throw new Error(`${label} exposed forbidden default-view value: ${item.label}.`);
    }
  }

  if (!allowModelGeneratedLowLevelLanguage) {
    if (
      /\b(run|session|ledger|runtime|proposal|event|projection)\s*(id|ids)\b/i.test(bodyText) ||
      /raw json|resource posture/i.test(bodyText)
    ) {
      throw new Error(`${label} exposed low-level default-view language.`);
    }
  }
}

async function formatPageDebug(page) {
  if (!page) {
    return "page output: none.";
  }

  try {
    const text = await page.locator("body").innerText({ timeout: 1000 });
    return [
      `page url: ${page.url()}`,
      `page text:\n${redactSensitive(text).slice(0, 4000)}`
    ].join("\n");
  } catch (error) {
    return `page output unavailable: ${error.message}`;
  }
}

function readReleaseSmokeConfig() {
  const apiKey = readRequiredEnv("DELIBERUM_RELEASE_SMOKE_API_KEY");
  const providerInputUrl = readRequiredEnv("DELIBERUM_RELEASE_SMOKE_BASE_URL");
  const providerBaseUrl = normalizeProviderBaseUrl(providerInputUrl);
  const model = readRequiredEnv("DELIBERUM_RELEASE_SMOKE_MODEL");

  return {
    apiKey,
    providerInputUrl,
    providerBaseUrl,
    model,
    browserTimeoutMs: readOptionalPositiveIntegerEnv(
      "DELIBERUM_RELEASE_SMOKE_BROWSER_TIMEOUT_MS",
      180_000
    ),
    providerTimeoutMs: readOptionalPositiveIntegerEnv(
      "DELIBERUM_RELEASE_SMOKE_PROVIDER_TIMEOUT_MS",
      180_000
    ),
    productLoopTimeoutMs: readOptionalPositiveIntegerEnv(
      "DELIBERUM_RELEASE_SMOKE_PRODUCT_LOOP_TIMEOUT_MS",
      360_000
    ),
    continueAttempts: readOptionalPositiveIntegerEnv(
      "DELIBERUM_RELEASE_SMOKE_CONTINUE_ATTEMPTS",
      3
    )
  };
}

function normalizeProviderBaseUrl(value) {
  const parsed = new URL(value);
  const normalizedPath = parsed.pathname.replace(/\/+$/, "");

  if (normalizedPath === "/v1/chat/completions") {
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return stripTrailingSlash(parsed.toString());
  }

  if (normalizedPath === "/v1") {
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return stripTrailingSlash(parsed.toString());
  }

  return stripTrailingSlash(value);
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for release readiness smoke.`);
  }

  return value;
}

function readOptionalPositiveIntegerEnv(name, fallback) {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function stripTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function startDaemonProcess({ port, cwd, webOrigin }) {
  return startChildProcess(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_DAEMON_CORS_ORIGINS: webOrigin,
      ...buildOptionalProviderCompatibilityEnv()
    }
  });
}

function buildOptionalProviderCompatibilityEnv() {
  const mappings = [
    ["DELIBERUM_RELEASE_SMOKE_ENDPOINT_PATH", "DELIBERUM_OPENAI_ENDPOINT_PATH"],
    ["DELIBERUM_RELEASE_SMOKE_TIMEOUT_MS", "DELIBERUM_OPENAI_TIMEOUT_MS"],
    ["DELIBERUM_RELEASE_SMOKE_TOP_P", "DELIBERUM_OPENAI_TOP_P"],
    ["DELIBERUM_RELEASE_SMOKE_STREAM", "DELIBERUM_OPENAI_STREAM"],
    ["DELIBERUM_RELEASE_SMOKE_THINKING", "DELIBERUM_OPENAI_THINKING"],
    [
      "DELIBERUM_RELEASE_SMOKE_FREQUENCY_PENALTY",
      "DELIBERUM_OPENAI_FREQUENCY_PENALTY"
    ],
    [
      "DELIBERUM_RELEASE_SMOKE_PRESENCE_PENALTY",
      "DELIBERUM_OPENAI_PRESENCE_PENALTY"
    ]
  ];
  const env = {};

  for (const [sourceName, targetName] of mappings) {
    const value = process.env[sourceName]?.trim();

    if (value) {
      env[targetName] = value;
    }
  }

  return env;
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
    throw new Error("Could not reserve a local port for release readiness smoke.");
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
    throw new Error(`Release readiness smoke requires built daemon entrypoint: ${filePath}`);
  }
}

function formatProcessOutput(stdout, stderr, label = "process") {
  const lines = [`${label} output:`];

  if (stdout.trim().length > 0) {
    lines.push(`stdout:\n${redactSensitive(stdout.trim())}`);
  }

  if (stderr.trim().length > 0) {
    lines.push(`stderr:\n${redactSensitive(stderr.trim())}`);
  }

  return lines.length > 1 ? lines.join("\n") : `${label} output: none.`;
}

function redactSensitive(value) {
  let redacted = value;

  for (const sensitiveValue of [
    releaseConfig.apiKey,
    releaseConfig.providerInputUrl,
    releaseConfig.providerBaseUrl,
    releaseConfig.model
  ]) {
    if (sensitiveValue) {
      redacted = redacted.split(sensitiveValue).join("[redacted]");
    }
  }

  return redacted;
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
