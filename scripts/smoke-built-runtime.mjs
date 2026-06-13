import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = join(repoRoot, "apps", "cli", "dist", "index.js");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const webDist = join(repoRoot, "apps", "web", "dist");
const minimalEnv = buildMinimalEnv();

assertFile(cliEntry);
assertFile(daemonEntry);
assertFile(join(webDist, "index.html"));

await smokeBuiltCli();
await smokeBuiltDaemon();

console.log("Built runtime smoke checks passed.");

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Built runtime entrypoint is missing: ${filePath}`);
  }
}

async function smokeBuiltCli() {
  const tempDir = mkdtempSync(join(tmpdir(), "deliberum-built-cli-"));

  try {
    const storePath = join(tempDir, "events.json");
    const result = await execNode([
      cliEntry,
      "new",
      "Built runtime smoke",
      "--store",
      storePath,
      "--json"
    ]);
    const output = parseJsonOutput(result.stdout, "built CLI session output");

    if (typeof output.sessionId !== "string" || output.sessionId.length === 0) {
      throw new Error("Built CLI smoke did not return a session id.");
    }

    if (output.event?.type !== "topic_contract_published") {
      throw new Error("Built CLI smoke did not publish the topic contract event.");
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function smokeBuiltDaemon() {
  const port = await reserveLocalPort();
  const child = spawn(process.execPath, [daemonEntry], {
    cwd: repoRoot,
    env: {
      ...minimalEnv,
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_DAEMON_WEB_ASSETS_PATH: webDist
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let exited = false;
  let exitCode = null;
  let exitSignal = null;
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
    const health = await waitForDaemonHealth(port, () => exited);

    if (health.status !== "ok" || health.service !== "deliberum-daemon") {
      throw new Error(`Built daemon health returned unexpected payload: ${JSON.stringify(health)}`);
    }

    await smokeBuiltWebStaticAssets(port);
  } catch (error) {
    if (exited) {
      throw new Error(
        `Built daemon exited before passing health smoke: code=${exitCode} signal=${exitSignal}\n${formatProcessOutput(stdout, stderr)}`,
        { cause: error }
      );
    }

    throw new Error(`Built daemon health smoke failed.\n${formatProcessOutput(stdout, stderr)}`, {
      cause: error
    });
  } finally {
    await terminateChild(child, exitPromise);
  }
}

async function smokeBuiltWebStaticAssets(port) {
  const rootResponse = await fetch(`http://127.0.0.1:${port}/`, {
    headers: {
      Accept: "text/html"
    }
  });
  const rootHtml = await rootResponse.text();

  if (!rootResponse.ok) {
    throw new Error(`Built Web shell returned HTTP ${rootResponse.status}.`);
  }

  if (!rootResponse.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Built Web shell did not return HTML content.");
  }

  if (!rootResponse.headers.get("cache-control")?.includes("no-store")) {
    throw new Error("Built Web shell did not use no-store cache headers.");
  }

  if (!rootResponse.headers.get("vary")?.includes("Accept")) {
    throw new Error("Built Web shell did not vary on Accept.");
  }

  if (!rootHtml.includes('<div id="root"></div>')) {
    throw new Error("Built Web shell did not contain the React root element.");
  }

  const assetPath = findBuiltWebAssetPath();
  const assetResponse = await fetch(`http://127.0.0.1:${port}/${assetPath}`);

  if (!assetResponse.ok) {
    throw new Error(`Built Web asset returned HTTP ${assetResponse.status}.`);
  }

  if (!assetResponse.headers.get("cache-control")?.includes("immutable")) {
    throw new Error("Built Web asset did not use immutable cache headers.");
  }

  const apiResponse = await fetch(`http://127.0.0.1:${port}/health`, {
    headers: {
      Accept: "text/html"
    }
  });

  if (!apiResponse.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Built daemon health API was shadowed by the Web shell.");
  }
}

function execNode(args) {
  return new Promise((resolveResult, rejectResult) => {
    execFile(
      process.execPath,
      args,
      {
        cwd: repoRoot,
        env: minimalEnv,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          rejectResult(
            new Error(
              `Built CLI smoke command failed with exit code ${error.code ?? "unknown"}.\n${formatProcessOutput(stdout, stderr)}`
            )
          );
          return;
        }

        resolveResult({ stdout, stderr });
      }
    );
  });
}

function parseJsonOutput(stdout, label) {
  try {
    return JSON.parse(stdout.trim());
  } catch (error) {
    throw new Error(`${label} was not valid JSON.`, { cause: error });
  }
}

async function reserveLocalPort() {
  const server = createServer();

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
    throw new Error("Could not reserve a local port for the built daemon smoke.");
  }

  return port;
}

function findBuiltWebAssetPath() {
  const assetsDir = join(webDist, "assets");
  const assetName = readdirSync(assetsDir).find(
    (name) => name.endsWith(".js") || name.endsWith(".css")
  );

  if (!assetName) {
    throw new Error(`Built Web assets are missing from: ${assetsDir}`);
  }

  return `assets/${assetName}`;
}

async function waitForDaemonHealth(port, hasExited) {
  const url = `http://127.0.0.1:${port}/health`;
  let lastError;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (hasExited()) {
      throw new Error("Built daemon exited before health was available.");
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        return await response.json();
      }

      lastError = new Error(`Health returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for built daemon health at ${url}.`, {
    cause: lastError
  });
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

function formatProcessOutput(stdout, stderr) {
  const lines = [];

  if (stdout.trim().length > 0) {
    lines.push(`stdout:\n${stdout.trim()}`);
  }

  if (stderr.trim().length > 0) {
    lines.push(`stderr:\n${stderr.trim()}`);
  }

  return lines.join("\n") || "No process output.";
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
