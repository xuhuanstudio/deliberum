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
const landingTitle = "Local human + AI deliberation room";
const landingDescription =
  "A local human + AI deliberation room for comparing perspectives, keeping unresolved points visible, and reaching reviewable answers with next steps.";
const localServiceCommand = "corepack pnpm build && corepack pnpm start:local";

assertFile(daemonEntry);

let browser;
let activePage;
const tempDirs = [];
const processes = [];

try {
  browser = await chromium.launch();

  await verifyConnectedLanding(browser);
  await verifyUnavailableEntry(browser);
} catch (error) {
  throw new Error(
    [
      "Web entry smoke failed.",
      await formatPageDebug(activePage),
      ...processes.map((entry) => formatProcessOutput(entry.process.stdout, entry.process.stderr, entry.label))
    ].join("\n"),
    { cause: error }
  );
} finally {
  if (browser) {
    await browser.close();
  }

  for (const { process } of processes.reverse()) {
    await terminateChild(process.child, process.exitPromise);
  }

  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("Web entry smoke checks passed.");

async function verifyConnectedLanding(browserInstance) {
  const daemonPort = await reserveLocalPort();
  const webPort = await reserveLocalPort();
  const tempDir = mkdtempSync(join(tmpdir(), "deliberum-web-entry-connected-"));
  tempDirs.push(tempDir);
  const daemon = startDaemonProcess({
    port: daemonPort,
    cwd: tempDir,
    webOrigin: `http://127.0.0.1:${webPort}`
  });
  processes.push({ label: "connected daemon", process: daemon });
  const web = startWebProcess({
    port: webPort,
    daemonBaseUrl: `http://127.0.0.1:${daemonPort}`
  });
  processes.push({ label: "connected web", process: web });

  await waitForHttpOk(`http://127.0.0.1:${daemonPort}/health`, () => daemon.exited);
  await waitForHttpOk(`http://127.0.0.1:${webPort}/`, () => web.exited);

  const page = await browserInstance.newPage({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  activePage = page;
  page.setDefaultTimeout(30_000);

  await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "networkidle" });
  await assertConnectedLanding(page, "desktop");
  await assertFirstViewportProductClarity(page, "desktop");
  await assertNoHorizontalOverflow(page, "connected desktop");
  await assertDefaultEntrySafety(page, "connected desktop landing");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await assertConnectedLanding(page, "mobile");
  await assertFirstViewportProductClarity(page, "mobile");
  await assertNoHorizontalOverflow(page, "connected mobile");
  await assertDefaultEntrySafety(page, "connected mobile landing");
}

async function verifyUnavailableEntry(browserInstance) {
  const deadDaemonPort = await reserveLocalPort();
  const webPort = await reserveLocalPort();
  const web = startWebProcess({
    port: webPort,
    daemonBaseUrl: `http://127.0.0.1:${deadDaemonPort}`
  });
  processes.push({ label: "unavailable web", process: web });

  await waitForHttpOk(`http://127.0.0.1:${webPort}/`, () => web.exited);

  const page = await browserInstance.newPage({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  activePage = page;
  page.setDefaultTimeout(30_000);

  await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: landingTitle }).waitFor();
  await page.getByText("Start the local service").first().waitFor();
  await page.getByText("Open Connect AI for the local start command and AI setup steps.").waitFor();
  await page.getByRole("link", { name: "Open Connect AI", exact: true }).first().click();
  await page.waitForURL(/\/setup\/models$/);
  await page.getByRole("heading", { name: "Connect AI", exact: true }).waitFor();
  await page.getByText("Start the local service").first().waitFor();
  await page.getByText("Local service command").waitFor();
  await page.getByText(localServiceCommand).waitFor();
  await page.getByText("This starts the local Web and service; model API keys are added from Web after it connects.").waitFor();
  await page.getByText("3. Connect AI in Web").waitFor();
  await page.getByRole("button", { name: "Check again" }).waitFor();
  await assertNoHorizontalOverflow(page, "unavailable setup");
  await assertDefaultEntrySafety(page, "unavailable setup");
}

async function assertConnectedLanding(page, label) {
  await page.getByRole("heading", { name: landingTitle }).waitFor();
  await page.getByText(landingDescription).waitFor();
  await page.getByRole("link", { name: "New Discussion", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "My Discussions", exact: true }).first().waitFor();
  await page.getByText("Ready to use Deliberum").waitFor();
  await page.getByText("Local service connected").first().waitFor();
  await page.getByText("Demo discussion ready").waitFor();
  await page.getByRole("link", { name: "Start demo discussion", exact: true }).first().waitFor();

  const bodyText = await page.locator("body").innerText();
  for (const expected of [
    "Independent first responses",
    "Strongest current options",
    "reviewable answer",
    "unresolved points",
    "need checking",
    "next steps"
  ]) {
    if (!bodyText.includes(expected)) {
      throw new Error(`${label} landing did not explain ${expected}.`);
    }
  }
}

async function assertFirstViewportProductClarity(page, label) {
  const viewportText = await page.evaluate(() => {
    const textBlocks = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      const parent = node.parentElement;

      if (!text || !parent) {
        continue;
      }

      const rect = parent.getBoundingClientRect();
      if (rect.bottom >= 0 && rect.top <= window.innerHeight) {
        textBlocks.push(text);
      }
    }

    return textBlocks.join(" ");
  });

  for (const expected of [
    "Deliberum",
    landingTitle,
    "human + AI",
    "reviewable answers",
    "New Discussion"
  ]) {
    if (!viewportText.includes(expected)) {
      throw new Error(`${label} first viewport did not include: ${expected}`);
    }
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

async function assertDefaultEntrySafety(page, label) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenSnippets = [
    "DELIBERUM_OPENAI_API_KEY",
    "DELIBERUM_OPENAI_BASE_URL",
    "DELIBERUM_MCP_TOOL_URL",
    "providerConfigId",
    "openai-main",
    "raw JSON",
    "resource posture",
    "operation audit",
    "ECONNREFUSED"
  ];

  for (const snippet of forbiddenSnippets) {
    if (bodyText.includes(snippet)) {
      throw new Error(`${label} exposed forbidden default-view text: ${snippet}`);
    }
  }

  if (/\b(run|session|ledger|runtime|proposal|event|projection)\s*(id|ids)\b/i.test(bodyText)) {
    throw new Error(`${label} exposed low-level id language.`);
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
    throw new Error("Could not reserve a local port for Web entry smoke.");
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

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Web entry smoke requires built daemon entrypoint: ${filePath}`);
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
