import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync
} from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientEntry = join(repoRoot, "packages", "client", "dist", "index.js");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");

assertFile(clientEntry);
assertFile(daemonEntry);

const [{ DeliberumDaemonClient }, { localPresetRunPlan, localPresetStartRequest }] =
  await Promise.all([
    import(pathToFileURL(clientEntry).href),
    import(pathToFileURL(daemonEntry).href)
  ]);

const tempDir = mkdtempSync(join(tmpdir(), "deliberum-storage-recovery-"));
const sourceDir = join(tempDir, "source");
const restoreDir = join(tempDir, "restore");
const sourceDbPath = join(sourceDir, "deliberum.sqlite");
const restoreDbPath = join(restoreDir, "deliberum.sqlite");

mkdirSync(sourceDir, { recursive: true });
mkdirSync(restoreDir, { recursive: true });

try {
  const sourcePort = await reserveLocalPort();
  const sourceDaemon = startDaemonProcess({
    cwd: sourceDir,
    port: sourcePort,
    sqlitePath: sourceDbPath
  });
  const sourceClient = new DeliberumDaemonClient({
    baseUrl: `http://127.0.0.1:${sourcePort}`
  });

  let runId;
  let sessionId;
  let sourceEvidence;

  try {
    await waitForDaemonHealth(sourceClient, () => sourceDaemon.exited);
    const created = await sourceClient.createRun({ runPlan: localPresetRunPlan() });
    runId = readString(created.run, "runId", "created run id");
    sessionId = readString(created.session, "sessionId", "created session id");

    const started = await sourceClient.startRun(runId, localPresetStartRequest());
    assertEqual(started.stopped, false, "local preset run stopped flag");
    assertStageExecuted(started.stages, "sealed_divergence");
    assertStageExecuted(started.stages, "extraction");
    assertStageExecuted(started.stages, "proposal_review");
    assertStageExecuted(started.stages, "finalization");

    sourceEvidence = await readRecoveryEvidence({
      client: sourceClient,
      runId,
      sessionId,
      label: "source"
    });
  } catch (error) {
    throw new Error(
      `Storage recovery source daemon failed.\n${formatProcessOutput(sourceDaemon.stdout, sourceDaemon.stderr)}`,
      { cause: error }
    );
  } finally {
    await terminateChild(sourceDaemon.child, sourceDaemon.exitPromise);
  }

  copySQLiteDatabase(sourceDbPath, restoreDbPath);

  const restorePort = await reserveLocalPort();
  const restoreDaemon = startDaemonProcess({
    cwd: restoreDir,
    port: restorePort,
    sqlitePath: restoreDbPath
  });
  const restoreClient = new DeliberumDaemonClient({
    baseUrl: `http://127.0.0.1:${restorePort}`
  });

  try {
    await waitForDaemonHealth(restoreClient, () => restoreDaemon.exited);
    const restoredEvidence = await readRecoveryEvidence({
      client: restoreClient,
      runId,
      sessionId,
      label: "restored"
    });

    assertEqual(
      restoredEvidence.runCount,
      sourceEvidence.runCount,
      "restored run catalog count"
    );
    assertEqual(
      restoredEvidence.eventCount,
      sourceEvidence.eventCount,
      "restored event count"
    );
    assertEqual(
      restoredEvidence.hashedEventCount,
      sourceEvidence.hashedEventCount,
      "restored hashed event count"
    );
  } catch (error) {
    throw new Error(
      `Storage recovery restored daemon failed.\n${formatProcessOutput(restoreDaemon.stdout, restoreDaemon.stderr)}`,
      { cause: error }
    );
  } finally {
    await terminateChild(restoreDaemon.child, restoreDaemon.exitPromise);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Storage recovery smoke checks passed.");

async function readRecoveryEvidence({ client, runId, sessionId, label }) {
  const runs = await client.listRuns();
  const matchingRun = Array.isArray(runs.runs)
    ? runs.runs.find((candidate) => candidate?.runId === runId)
    : undefined;

  if (!matchingRun) {
    throw new Error(`${label} run catalog did not include the recovered run.`);
  }

  const run = await client.getRun(runId);
  assertEqual(readString(run.run, "runId", `${label} run record id`), runId, `${label} run id`);

  const events = await client.getRunEvents(runId);
  assertEqual(events.sessionId, sessionId, `${label} run events session id`);
  assertAtLeast(events.events, 5, `${label} recovered event count`);
  assertHasEventType(events.events, "topic_contract_published", label);
  assertHasEventType(events.events, "sealed_contribution_submitted", label);
  assertHasEventType(events.events, "final_audit_recorded", label);

  const frontier = await client.getFrontier(sessionId);
  assertAtLeast(frontier.candidates, 1, `${label} recovered candidate frontier`);

  const objections = await client.getObjections(sessionId);
  assertAtLeast(objections.objections, 1, `${label} recovered objections`);

  const obligations = await client.getObligations(sessionId);
  assertAtLeast(obligations.qualityObligations, 1, `${label} recovered obligations`);

  const resources = await client.getSessionResources(sessionId);
  assertEqual(resources.sessionId, sessionId, `${label} recovered resources session id`);

  const outcome = await client.getRunOutcome(runId);
  assertEqual(outcome.status, "compiled", `${label} recovered outcome status`);
  assertTextIncludes(JSON.stringify(outcome.outcome), "staged review", `${label} outcome`);

  const deploymentPosture = await client.getDeploymentPosture();
  const persistence = deploymentPosture.persistence ?? {};
  assertEqual(persistence.eventLedger, "configured_store", `${label} event ledger persistence`);
  assertEqual(persistence.runMetadata, "configured_store", `${label} run metadata persistence`);
  assertEqual(
    persistence.resourceBroker,
    "configured_store",
    `${label} resource broker persistence`
  );
  assertEqual(
    persistence.resourceAccessGrants,
    "configured_store",
    `${label} resource access persistence`
  );
  assertEqual(
    persistence.operationAudit,
    "configured_store",
    `${label} operation audit persistence`
  );
  assertEqual(persistence.sqliteProcessLock, "configured", `${label} process lock posture`);

  const integrity = await client.getLedgerIntegrity();
  assertEqual(integrity.status, "valid", `${label} ledger integrity`);
  assertNumberAtLeast(integrity.eventCount, events.events.length, `${label} integrity event count`);
  assertNumberAtLeast(
    integrity.hashedEventCount,
    events.events.length,
    `${label} integrity hashed event count`
  );

  const operationAudit = await client.getOperationAudit({ limit: 25 });
  assertAtLeast(operationAudit.events, 1, `${label} operation audit records`);

  return {
    runCount: runs.runs.length,
    eventCount: events.events.length,
    hashedEventCount: integrity.hashedEventCount
  };
}

function startDaemonProcess({ port, cwd, sqlitePath }) {
  const child = spawn(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_ENABLE_LOCAL_PRESET: "true",
      DELIBERUM_DAEMON_SQLITE_PATH: sqlitePath,
      DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK: "true",
      DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK_TTL_MS: "60000",
      DELIBERUM_DAEMON_SQLITE_PROCESS_LOCK_HEARTBEAT_MS: "1000"
    },
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

async function waitForDaemonHealth(client, hasExited) {
  let lastError;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (hasExited()) {
      throw new Error("Daemon exited before health was available.");
    }

    try {
      const health = await client.health();
      if (health.status === "ok") {
        return health;
      }
      lastError = new Error(`Health returned status ${String(health.status)}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error("Timed out waiting for daemon health.", { cause: lastError });
}

function copySQLiteDatabase(sourcePath, restorePath) {
  const copied = [];

  for (const suffix of ["", "-wal", "-shm"]) {
    const from = `${sourcePath}${suffix}`;
    const to = `${restorePath}${suffix}`;

    if (existsSync(from)) {
      copyFileSync(from, to);
      copied.push(to);
    }
  }

  if (copied.length === 0) {
    throw new Error("SQLite backup did not find a database file to copy.");
  }
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
    throw new Error("Could not reserve a local port for storage recovery smoke.");
  }

  return port;
}

async function terminateChild(child, exitPromise) {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exitPromise;
    return;
  }

  child.kill("SIGTERM");

  const exited = await Promise.race([exitPromise.then(() => true), delay(3000).then(() => false)]);
  if (exited) {
    return;
  }

  child.kill("SIGKILL");
  await exitPromise;
}

function assertStageExecuted(stages, stageName) {
  const stage = Array.isArray(stages)
    ? stages.find((candidate) => candidate?.stage === stageName)
    : undefined;

  if (!stage) {
    throw new Error(`Run did not report stage ${stageName}.`);
  }

  assertEqual(stage.executionStatus, "executed", `${stageName} execution status`);
}

function assertHasEventType(events, eventType, label) {
  const found = Array.isArray(events)
    ? events.some((event) => event?.type === eventType)
    : false;

  if (!found) {
    throw new Error(`${label} run events did not include ${eventType}.`);
  }
}

function readString(value, key, label) {
  const result = value?.[key];

  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`Missing ${label}.`);
  }

  return result;
}

function assertAtLeast(value, count, label) {
  if (!Array.isArray(value) || value.length < count) {
    throw new Error(
      `${label} expected at least ${count}, got ${Array.isArray(value) ? value.length : "non-array"}.`
    );
  }
}

function assertNumberAtLeast(value, count, label) {
  if (typeof value !== "number" || value < count) {
    throw new Error(`${label} expected at least ${count}, got ${JSON.stringify(value)}.`);
  }
}

function assertTextIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} did not include expected text: ${expected}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Storage recovery smoke requires built entrypoint: ${filePath}`);
  }
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
