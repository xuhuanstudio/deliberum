import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-local-start-"));
const detachedChild = process.platform !== "win32";
const child = spawn("corepack", ["pnpm", "start:local"], {
  cwd: repoRoot,
  env: {
    ...buildMinimalEnv(),
    DELIBERUM_HOST: "127.0.0.1",
    DELIBERUM_PORT: String(port),
    DELIBERUM_DAEMON_SQLITE_PATH: join(tempDir, "deliberum.sqlite")
  },
  detached: detachedChild,
  stdio: ["ignore", "pipe", "pipe"]
});
let stdout = "";
let stderr = "";
let exited = false;
let exitCode = null;
let exitSignal = null;
let browser;
let page;
const exitPromise = once(child, "exit").then(([code, signal]) => {
  exited = true;
  exitCode = code;
  exitSignal = signal;
});

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

try {
  await waitForHttpOk(`http://127.0.0.1:${port}/health`, () => exited);
  browser = await chromium.launch();
  page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  page.setDefaultTimeout(30_000);

  await page.goto(`http://127.0.0.1:${port}/setup/models`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Setup / Models" }).waitFor();
  await page.getByText("Local service connected").first().waitFor();
  await page.getByText("Configure OpenAI-compatible provider").waitFor();
  await page.getByText("Ready for demo discussions").waitFor();
  await page.getByText("Start a discussion").first().waitFor();

  if (!stdout.includes(`http://127.0.0.1:${port}/`)) {
    throw new Error("Local start script did not print the user-facing Web URL.");
  }
} catch (error) {
  if (exited) {
    throw new Error(
      [
        `Local start script exited early: code=${exitCode} signal=${exitSignal}`,
        await formatPageOutput(page),
        formatProcessOutput(stdout, stderr)
      ].join("\n"),
      { cause: error }
    );
  }

  throw new Error(
    ["Local start smoke failed.", await formatPageOutput(page), formatProcessOutput(stdout, stderr)].join(
      "\n"
    ),
    {
      cause: error
    }
  );
} finally {
  if (browser) {
    await browser.close();
  }
  await terminateChild(child, exitPromise);
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Local start smoke checks passed.");

async function waitForHttpOk(url, hasExited) {
  let lastError;

  for (let attempt = 0; attempt < 100; attempt += 1) {
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
  const server = createServer();

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  const selectedPort = typeof address === "object" && address ? address.port : undefined;

  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });

  if (!selectedPort) {
    throw new Error("Could not reserve a local port for the local start smoke.");
  }

  return selectedPort;
}

async function terminateChild(processChild, processExitPromise) {
  if (processChild.exitCode !== null || processChild.signalCode !== null) {
    await processExitPromise;
    return;
  }

  signalChildTree(processChild, "SIGTERM");

  const exitedCleanly = await Promise.race([
    processExitPromise.then(() => true),
    delay(2000).then(() => false)
  ]);
  if (exitedCleanly) {
    return;
  }

  signalChildTree(processChild, "SIGKILL");
  await processExitPromise;
}

function signalChildTree(processChild, signal) {
  if (detachedChild && processChild.pid !== undefined) {
    try {
      process.kill(-processChild.pid, signal);
      return;
    } catch {
      // Fall through to direct child signaling below.
    }
  }

  processChild.kill(signal);
}

function formatProcessOutput(processStdout, processStderr) {
  const lines = ["process output:"];

  if (processStdout.trim().length > 0) {
    lines.push(`stdout:\n${processStdout.trim()}`);
  }

  if (processStderr.trim().length > 0) {
    lines.push(`stderr:\n${processStderr.trim()}`);
  }

  return lines.length > 1 ? lines.join("\n") : "process output: none.";
}

async function formatPageOutput(currentPage) {
  if (!currentPage) {
    return "page output: none.";
  }

  try {
    return [
      `page url: ${currentPage.url()}`,
      `page text:\n${(await currentPage.locator("body").innerText({ timeout: 1000 })).slice(0, 4000)}`
    ].join("\n");
  } catch (error) {
    return `page output unavailable: ${error.message}`;
  }
}

function buildMinimalEnv() {
  const names = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"];
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
