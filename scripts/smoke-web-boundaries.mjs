import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientEntry = join(repoRoot, "packages", "client", "dist", "index.js");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const landingTitle = "Multi-perspective deliberation for better decisions";

assertFile(clientEntry);
assertFile(daemonEntry);

const { DeliberumDaemonClient } = await import(pathToFileURL(clientEntry).href);
const { localPresetRunPlan, localPresetStartRequest } = await import(
  pathToFileURL(daemonEntry).href
);

const daemonPort = await reserveLocalPort();
const webPort = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-web-boundaries-"));
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
  const created = await client.createRun({
    runPlan: localPresetRunPlan()
  });
  const runId = readString(created.run, "runId", "created run id");
  const sessionId = readString(created.session, "sessionId", "created session id");
  await client.startRun(runId, localPresetStartRequest());

  await waitForHttpOk(`http://127.0.0.1:${webPort}/`, () => web.exited);

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  activePage = page;
  page.setDefaultTimeout(30_000);

  await verifyLandingAdvancedBoundary(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    runId,
    sessionId
  });
  await verifyRunsListBoundary(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    runId,
    sessionId
  });
  await verifySetupAdvancedBoundary(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    runId,
    sessionId
  });
  await verifyRunWorkspaceAdvancedBoundary(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    runId,
    sessionId
  });
  await verifyOutcomeAdvancedBoundary(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    runId,
    sessionId
  });
  await verifyLegacySessionSubviewBoundaries(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    runId,
    sessionId
  });
  await verifyLegacySessionBoundary(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    runId,
    sessionId
  });
} catch (error) {
  if (daemon.exited) {
    throw new Error(
      `Web boundary daemon exited early: code=${daemon.exitCode} signal=${daemon.exitSignal}\n${formatProcessOutput(daemon.stdout, daemon.stderr, "daemon")}`,
      { cause: error }
    );
  }

  if (web.exited) {
    throw new Error(
      `Web boundary server exited early: code=${web.exitCode} signal=${web.exitSignal}\n${formatProcessOutput(web.stdout, web.stderr, "web")}`,
      { cause: error }
    );
  }

  throw new Error(
    [
      "Web boundary smoke failed.",
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
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Web boundary smoke checks passed.");

async function verifyLandingAdvancedBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: landingTitle }).waitFor();
  await page.getByText("1 existing discussion").waitFor();
  await page.getByRole("link", { name: "Open discussion", exact: true }).first().waitFor();
  await assertNoHorizontalOverflow(page, "landing boundary default");
  await assertDefaultBoundarySafety(page, "landing boundary default", {
    runId,
    sessionId
  });

  await assertHiddenFromDefault(page, "Open by session id", "landing boundary default");
  await assertHiddenFromDefault(page, "Underlying session catalog", "landing boundary default");
  await assertHiddenFromDefault(page, "Daemon base URL", "landing boundary default");
  await assertHiddenFromDefault(page, "Runtime profiles", "landing boundary default");
  await assertHiddenFromDefault(page, "Operation audit", "landing boundary default");

  await page.getByRole("link", { name: "Advanced", exact: true }).click();
  await page.waitForURL(`${webBaseUrl}/advanced`);
  await page.getByRole("heading", { name: "Advanced / Developer Mode", exact: true }).waitFor();
  await page.getByText("Open by session id").waitFor();
  await page.getByLabel("Session id").waitFor();
  await page.getByText("Underlying session catalog").waitFor();
  await page.getByText("Daemon base URL").waitFor();
  await page.getByText("Runtime profiles").waitFor();
  await page.getByText("Operation audit").waitFor();
  await page.getByText(sessionId).first().waitFor();
  await page.getByRole("link", { name: "Open session view", exact: true }).waitFor();
}

async function verifyRunsListBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/runs`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Discussions", exact: true }).waitFor();
  await page.getByText("Existing discussions").waitFor();
  await page.getByText("Resume latest discussion").waitFor();
  await page.getByRole("link", { name: "Open discussion", exact: true }).first().waitFor();
  await assertNoHorizontalOverflow(page, "runs list default");
  await assertDefaultBoundarySafety(page, "runs list default", {
    runId,
    sessionId
  });
  await assertHiddenFromDefault(page, "Run id", "runs list default");
  await assertHiddenFromDefault(page, "Session id", "runs list default");
  await assertHiddenFromDefault(page, "Ledger events", "runs list default");
}

async function verifySetupAdvancedBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/setup/models`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Setup / Models" }).waitFor();
  await page.getByText("Model setup status").waitFor();
  await assertNoHorizontalOverflow(page, "setup models default");
  await assertDefaultBoundarySafety(page, "setup models default", {
    runId,
    sessionId
  });
  await assertHiddenFromDefault(page, "Runtime profile setup details", "setup models default");
  await assertHiddenFromDefault(page, "Enable env var", "setup models default");
  await assertHiddenFromDefault(page, "Secret env names", "setup models default");

  await page.locator('details[data-advanced-panel="Setup diagnostics"] > summary').click();
  await page.getByText("Runtime profile setup details").waitFor();
  await page.getByText("Enable env var").first().waitFor();
  await page.getByText("Secret env names").waitFor();
  await page.getByText("DELIBERUM_ENABLE_LOCAL_PRESET").waitFor();
}

async function verifyRunWorkspaceAdvancedBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/runs/${encodeURIComponent(runId)}`, {
    waitUntil: "networkidle"
  });
  await page.locator(".du-room-chat-shell").waitFor();
  await page
    .locator("#room-next-action")
    .getByRole("link", { name: "Review current conclusion", exact: true })
    .waitFor();
  await assertNoHorizontalOverflow(page, "discussion room default");
  await assertDefaultBoundarySafety(page, "discussion room default", {
    runId,
    sessionId
  });
  await assertHiddenFromDefault(page, "Advanced start request JSON", "discussion room default");
  await assertHiddenFromDefault(page, "Run ledger timeline", "discussion room default");
  await assertHiddenFromDefault(page, "Run plan view", "discussion room default");
  await assertHiddenFromDefault(page, "Process governance ledger", "discussion room default");
  await assertHiddenFromDefault(page, "Main perspectives metadata", "discussion room default");

  await page.locator('details[data-advanced-panel="Advanced start request"] > summary').click();
  await page.getByText("Advanced start request JSON").waitFor();

  await page.locator('details[data-advanced-panel="Ledger trace"] > summary').click();
  await page.getByText("Run ledger timeline").waitFor();
  await page.getByText("Run plan view").waitFor();
  await page.getByText(runId).first().waitFor();

  await page.locator('details[data-advanced-panel="Adaptive primitive suggestions"] > summary').click();
  await page.getByText("Process governance ledger").waitFor();
  await page.getByText(sessionId).first().waitFor();

  await openDetailedReviewPanels(page, "discussion room Advanced detail panels");
  await page.locator('details[data-advanced-panel="Discussion detail metadata"] > summary').click();
  await page.getByText("Main perspectives metadata").waitFor();
  await page.getByText("Projection events").first().waitFor();
}

async function verifyOutcomeAdvancedBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/runs/${encodeURIComponent(runId)}/outcome`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: "Current conclusion" }).first().waitFor();
  await page.getByText("Open disagreements").first().waitFor();
  await assertNoHorizontalOverflow(page, "current conclusion default");
  await assertDefaultBoundarySafety(page, "current conclusion default", {
    runId,
    sessionId
  });
  await assertHiddenFromDefault(page, "Candidate proposal event override", "current conclusion default");
  await assertHiddenFromDefault(page, "Raw outcome material", "current conclusion default");

  await page.locator("details.du-advanced-panel > summary").first().click();
  await page.getByText("Candidate proposal event override").waitFor();
  await page.getByRole("heading", { name: "Raw outcome material" }).waitFor();
  await page.getByText(runId).first().waitFor();
  await page.getByText(sessionId).first().waitFor();
}

async function verifyLegacySessionSubviewBoundaries(page, { webBaseUrl, runId, sessionId }) {
  await verifyLegacySessionProjectionSubview(page, {
    webBaseUrl,
    runId,
    sessionId,
    path: "frontier",
    heading: "Main perspectives",
    defaultText: "Strongest current options",
    defaultLabel: "legacy main perspectives default",
    hiddenSnippets: ["Candidate Frontier projection", "Object id", "Proposal event"],
    advancedHeading: "Candidate Frontier projection"
  });

  await verifyLegacySessionProjectionSubview(page, {
    webBaseUrl,
    runId,
    sessionId,
    path: "objections",
    heading: "Open disagreements",
    defaultText: "challenges, failure modes, or unresolved concerns",
    defaultLabel: "legacy open disagreements default",
    hiddenSnippets: ["Objection projection records", "Object id", "Proposal event"],
    advancedHeading: "Objection projection records"
  });

  await verifyLegacySessionProjectionSubview(page, {
    webBaseUrl,
    runId,
    sessionId,
    path: "obligations",
    heading: "Requirements this answer must satisfy",
    defaultText: "Unanswered requirements should be resolved",
    defaultLabel: "legacy requirements default",
    hiddenSnippets: ["Quality obligation projection records", "Object id", "Proposal event"],
    advancedHeading: "Quality obligation projection records"
  });

  await verifyLegacySessionFinalBoundary(page, {
    webBaseUrl,
    runId,
    sessionId
  });

  await verifyLegacySessionResourcesBoundary(page, {
    webBaseUrl,
    runId,
    sessionId
  });
}

async function verifyLegacySessionProjectionSubview(
  page,
  {
    webBaseUrl,
    runId,
    sessionId,
    path,
    heading,
    defaultText,
    defaultLabel,
    hiddenSnippets,
    advancedHeading
  }
) {
  await page.goto(`${webBaseUrl}/sessions/${encodeURIComponent(sessionId)}/${path}`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: heading }).first().waitFor();
  await page.getByText(defaultText).first().waitFor();
  await assertNoHorizontalOverflow(page, defaultLabel);
  await assertDefaultBoundarySafety(page, defaultLabel, {
    runId,
    sessionId
  });

  for (const snippet of hiddenSnippets) {
    await assertHiddenFromDefault(page, snippet, defaultLabel);
  }

  await page.locator("details.du-advanced-panel > summary").last().click();
  await page.getByRole("heading", { name: advancedHeading }).waitFor();
}

async function verifyLegacySessionFinalBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/sessions/${encodeURIComponent(sessionId)}/final`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: "Current conclusion" }).first().waitFor();
  await page.getByText("Review the current conclusion together").waitFor();
  await assertNoHorizontalOverflow(page, "legacy current conclusion default");
  await assertDefaultBoundarySafety(page, "legacy current conclusion default", {
    runId,
    sessionId
  });
  await assertHiddenFromDefault(
    page,
    "Candidate proposal event override",
    "legacy current conclusion default"
  );
  await assertHiddenFromDefault(page, "Compiled outcome JSON", "legacy current conclusion default");
  await assertHiddenFromDefault(page, "Final lifecycle controls", "legacy current conclusion default");

  await page.locator("details.du-advanced-panel > summary").first().click();
  await page.getByText("Candidate proposal event override").waitFor();
  await page.getByRole("heading", { name: "Compiled outcome JSON" }).waitFor();
  await page.getByText(sessionId).first().waitFor();
}

async function verifyLegacySessionResourcesBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/sessions/${encodeURIComponent(sessionId)}/resources`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: "Evidence and verification" }).waitFor();
  await page.getByText("Risks and missing evidence").waitFor();
  await assertNoHorizontalOverflow(page, "legacy risks and evidence default");
  await assertDefaultBoundarySafety(page, "legacy risks and evidence default", {
    runId,
    sessionId
  });
  await assertHiddenFromDefault(page, "Resource access posture", "legacy risks and evidence default");
  await assertHiddenFromDefault(page, "Resource projection JSON", "legacy risks and evidence default");
  await assertHiddenFromDefault(page, "Resource delivery audits", "legacy risks and evidence default");

  await page.locator("details.du-advanced-panel > summary").last().click();
  await page.getByRole("heading", { name: "Resource projection JSON" }).waitFor();
  await page.getByText(sessionId).first().waitFor();
}

async function verifyLegacySessionBoundary(page, { webBaseUrl, runId, sessionId }) {
  await page.goto(`${webBaseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: "Discussion brief" }).first().waitFor();
  await page.getByText("Review a proposed rollout before relying on it.").waitFor();
  await page.getByText("Review this discussion").waitFor();
  await page.getByText("Next recommended actions").waitFor();
  await assertNoHorizontalOverflow(page, "legacy session user mode");
  await assertDefaultBoundarySafety(page, "legacy session user mode", {
    runId,
    sessionId
  });

  await assertHiddenFromDefault(page, "Ledger position and raw latest entry", "legacy session user mode");
  await assertHiddenFromDefault(page, "Latest ledger entry", "legacy session user mode");
  await assertHiddenFromDefault(page, "topic_contract_published", "legacy session user mode");
  await assertHiddenFromDefault(page, "final_audit_recorded", "legacy session user mode");

  await page.locator('details[data-advanced-panel="Ledger position"] > summary').click();
  await page.getByText("Ledger position and raw latest entry").waitFor();
  await page.getByText("Session id").waitFor();
  await page.getByText("Latest ledger entry").waitFor();
  await page.getByText("final_audit_recorded").first().waitFor();

  await page.goto(`${webBaseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("heading", { name: "Discussion brief" }).first().waitFor();
  await page.locator("details.du-nav-advanced > summary").click();
  await page.getByRole("link", { name: "Ledger events", exact: true }).click();
  await page.waitForURL(/\/events$/);
  await page.getByRole("heading", { name: "Ledger events" }).waitFor();
  await page.getByText("Append-only event records are shown as returned by the daemon").waitFor();
  await page.getByText("topic_contract_published").first().waitFor();
}

async function assertHiddenFromDefault(page, snippet, label) {
  const bodyText = await page.locator("body").innerText();

  if (bodyText.includes(snippet)) {
    throw new Error(`${label} exposed Advanced text before the user opened Advanced: ${snippet}`);
  }
}

async function openDetailedReviewPanels(page, label) {
  const details = page.locator(
    'details.du-advanced-panel[data-advanced-panel="Structured discussion details"]'
  );

  try {
    await details.waitFor();

    if (!(await details.evaluate((element) => element.open))) {
      await details.locator("> summary").click();
    }
  } catch (error) {
    throw new Error(`${label} could not open structured discussion details.`, {
      cause: error
    });
  }
}

async function assertDefaultBoundarySafety(page, label, { runId, sessionId }) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenSnippets = [
    runId,
    sessionId,
    "DELIBERUM_OPENAI_API_KEY",
    "DELIBERUM_OPENAI_BASE_URL",
    "DELIBERUM_MCP_TOOL_URL",
    "providerConfigId",
    "openai-main",
    "local-preset-candidate-run-workspace",
    "local-preset-objection-preset-scope",
    "local-preset-quality-labeling",
    "raw JSON",
    "raw latest entry",
    "Latest ledger entry",
    "topic_contract_published",
    "final_audit_recorded"
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

function startDaemonProcess({ port, cwd, webOrigin }) {
  return startChildProcess(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_DAEMON_CORS_ORIGINS: webOrigin,
      DELIBERUM_ENABLE_LOCAL_PRESET: "true"
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
    throw new Error("Could not reserve a local port for Web boundary smoke.");
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

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Web boundary smoke requires built entrypoint: ${filePath}`);
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
