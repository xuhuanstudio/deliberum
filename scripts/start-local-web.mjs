import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const webDist = join(repoRoot, "apps", "web", "dist");
const webIndex = join(webDist, "index.html");
const localDataDir = join(repoRoot, ".deliberum");
const defaultHost = "127.0.0.1";
const defaultPort = "3877";

assertBuiltArtifact(daemonEntry, "daemon entrypoint");
assertBuiltArtifact(webIndex, "Web build");
mkdirSync(localDataDir, { recursive: true });

const env = {
  ...process.env,
  DELIBERUM_HOST: process.env.DELIBERUM_HOST?.trim() || defaultHost,
  DELIBERUM_PORT: process.env.DELIBERUM_PORT?.trim() || defaultPort,
  DELIBERUM_ENABLE_LOCAL_PRESET:
    process.env.DELIBERUM_ENABLE_LOCAL_PRESET?.trim() || "true",
  DELIBERUM_DAEMON_SQLITE_PATH:
    process.env.DELIBERUM_DAEMON_SQLITE_PATH?.trim() ||
    join(localDataDir, "deliberum.sqlite"),
  DELIBERUM_DAEMON_WEB_ASSETS_PATH:
    process.env.DELIBERUM_DAEMON_WEB_ASSETS_PATH?.trim() || webDist
};

const urlHost = env.DELIBERUM_HOST === "0.0.0.0" ? "127.0.0.1" : env.DELIBERUM_HOST;

console.log(`Starting Deliberum local Web at http://${urlHost}:${env.DELIBERUM_PORT}/`);
console.log("Provider setup, API keys, discussions, and local state stay on this machine.");
console.log("Press Ctrl+C to stop the local service.");

const child = spawn(process.execPath, [daemonEntry], {
  cwd: repoRoot,
  env,
  stdio: "inherit"
});
let shuttingDown = false;

child.on("exit", (code, signal) => {
  if (shuttingDown) {
    process.exit(0);
    return;
  }

  if (signal) {
    console.error(`Deliberum local Web stopped by ${signal}.`);
    process.exit(1);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Failed to start Deliberum local Web: ${error.message}`);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shuttingDown = true;
    child.kill(signal);
  });
}

function assertBuiltArtifact(path, label) {
  if (existsSync(path)) {
    return;
  }

  console.error(`Missing ${label}: ${path}`);
  console.error("Run `corepack pnpm build` before `corepack pnpm start:local`.");
  process.exit(1);
}
