import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const knownArgs = new Set(["--dry-run", "--help", "--keep-image"]);
const unknownArgs = [...args].filter((arg) => !knownArgs.has(arg));

if (args.has("--help")) {
  printHelp();
  process.exit(0);
}

if (unknownArgs.length > 0) {
  console.error(`Unknown argument: ${unknownArgs.join(", ")}`);
  printHelp();
  process.exit(1);
}

const dryRun = args.has("--dry-run");
const keepImage = args.has("--keep-image");
const port = process.env.DELIBERUM_CONTAINER_SMOKE_PORT
  ? parsePort(process.env.DELIBERUM_CONTAINER_SMOKE_PORT)
  : await reserveLocalPort();
const runId = `${process.pid}-${Date.now()}`;
const imageTag = `deliberum:container-smoke-${runId}`;
const containerName = `deliberum-container-smoke-${runId}`;
const volumeName = `deliberum-container-smoke-data-${runId}`;

if (dryRun) {
  printPlan();
  process.exit(0);
}

ensureDockerAvailable();

let containerStarted = false;
try {
  runInherited("docker", ["build", "-t", imageTag, "."], "Build the local/pre-production image");

  const containerId = runCaptured(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      containerName,
      "-p",
      `127.0.0.1:${port}:3877`,
      "-v",
      `${volumeName}:/data`,
      imageTag
    ],
    "Start the local/pre-production container"
  );
  containerStarted = true;

  await waitForHttpOk(`http://127.0.0.1:${port}/health`);
  await assertWebShell(`http://127.0.0.1:${port}/setup/models`);

  console.log("Container runtime smoke checks passed.");
  console.log(`Container id: ${containerId.slice(0, 12)}`);
  console.log(`Verified local Web URL: http://127.0.0.1:${port}/`);
} catch (error) {
  if (containerStarted) {
    const state = runCapturedAllowFailure("docker", [
      "inspect",
      "--format",
      "status={{.State.Status}} exitCode={{.State.ExitCode}} error={{.State.Error}}",
      containerName
    ]);
    if (state) {
      console.error("Container state:");
      console.error(state);
    }

    const logs = runCapturedAllowFailure("docker", ["logs", "--tail", "120", containerName]);
    if (logs) {
      console.error("Container logs:");
      console.error(logs);
    }
  }
  throw error;
} finally {
  runQuietly("docker", ["rm", "-f", containerName]);
  runQuietly("docker", ["volume", "rm", volumeName]);
  if (!keepImage) {
    runQuietly("docker", ["image", "rm", imageTag]);
  }
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-container-local.mjs [--dry-run] [--keep-image]

Builds the local/pre-production Docker image, starts it on a temporary
localhost port, checks /health, verifies the daemon-served Web shell, then
removes the temporary container and data volume.

Options:
  --dry-run     Print the Docker commands without running them.
  --keep-image  Keep the temporary image tag after a real smoke run.

Environment:
  DELIBERUM_CONTAINER_SMOKE_PORT  Optional host port to publish instead of a
                                  temporary local port.`);
}

function printPlan() {
  console.log("Container runtime smoke dry run.");
  console.log("No Docker command was executed.");
  console.log("Planned commands:");
  console.log(formatCommand(["docker", "build", "-t", imageTag, "."]));
  console.log(
    formatCommand([
      "docker",
      "run",
      "--detach",
      "--name",
      containerName,
      "-p",
      `127.0.0.1:${port}:3877`,
      "-v",
      `${volumeName}:/data`,
      imageTag
    ])
  );
  console.log(`Then check http://127.0.0.1:${port}/health and http://127.0.0.1:${port}/setup/models.`);
  console.log(formatCommand(["docker", "rm", "-f", containerName]));
  console.log(formatCommand(["docker", "volume", "rm", volumeName]));
  if (!keepImage) {
    console.log(formatCommand(["docker", "image", "rm", imageTag]));
  }
}

function ensureDockerAvailable() {
  const result = spawnSync("docker", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        "Docker is required for the container runtime smoke, but it is not available on PATH.",
        "Install Docker and rerun `corepack pnpm smoke:container`, or use",
        "`corepack pnpm smoke:container -- --dry-run` to preview the commands without claiming runtime verification."
      ].join(" ")
    );
  }

  console.log(result.stdout.trim());
}

function runInherited(command, commandArgs, label) {
  console.log(label);
  console.log(formatCommand([command, ...commandArgs]));

  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

function runCaptured(command, commandArgs, label) {
  console.log(label);
  console.log(formatCommand([command, ...commandArgs]));

  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `${label} failed with exit code ${result.status}.`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  return result.stdout.trim();
}

function runCapturedAllowFailure(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8"
  });

  return [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n");
}

function runQuietly(command, commandArgs) {
  spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "ignore"
  });
}

async function waitForHttpOk(url) {
  let lastError;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${url}.`, {
    cause: lastError
  });
}

async function assertWebShell(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  const html = await response.text();
  if (!html.includes('<div id="root"') || !html.includes("/assets/")) {
    throw new Error(`${url} did not return the built Web shell.`);
  }
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
    throw new Error("Could not reserve a local port for the container smoke.");
  }

  return selectedPort;
}

function parsePort(value) {
  const portValue = Number(value);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65_535) {
    throw new Error(`DELIBERUM_CONTAINER_SMOKE_PORT must be a valid TCP port, got ${value}.`);
  }
  return portValue;
}

function formatCommand(parts) {
  return parts.map((part) => (needsShellQuote(part) ? `'${part.replaceAll("'", "'\\''")}'` : part)).join(" ");
}

function needsShellQuote(part) {
  return !/^[A-Za-z0-9_./:@=-]+$/.test(part);
}
