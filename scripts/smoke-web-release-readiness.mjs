import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const onceScript = join(repoRoot, "scripts", "smoke-web-release-readiness-once.mjs");

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function main() {
  const runCount = readPositiveIntegerEnv("DELIBERUM_RELEASE_SMOKE_RUNS", 1);

  for (let runIndex = 1; runIndex <= runCount; runIndex += 1) {
    const label = `Release readiness browser smoke run ${runIndex}/${runCount}`;
    console.log(`${label} started.`);
    await runSingleReleaseReadinessSmoke();
    console.log(`${label} passed.`);
  }

  if (runCount > 1) {
    console.log(`Release readiness browser smoke passed ${runCount} consecutive runs.`);
  }
}

function readPositiveIntegerEnv(name, fallback) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

async function runSingleReleaseReadinessSmoke() {
  const child = spawn(process.execPath, [onceScript], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit"
  });
  const [code, signal] = await once(child, "exit");

  if (code === 0) {
    return;
  }

  throw new Error(
    `Release readiness browser smoke exited with code=${code ?? "null"} signal=${signal ?? "null"}.`
  );
}
