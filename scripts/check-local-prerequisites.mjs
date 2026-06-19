import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const minimumNodeMajor = readMinimumMajor(packageJson.engines?.node, "Node.js");
const minimumPnpmMajor = readMinimumMajor(packageJson.engines?.pnpm, "pnpm");
const pinnedPackageManager = String(packageJson.packageManager ?? "");
const pinnedPnpmVersion = /^pnpm@(.+)$/.exec(pinnedPackageManager)?.[1];
const checks = [];

checks.push(checkNodeVersion());
checks.push(checkCommand("corepack", ["--version"], "Corepack"));
checks.push(checkPnpmVersion());

const failedChecks = checks.filter((check) => !check.ok);

console.log("Deliberum local setup prerequisites");
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.label}: ${check.message}`);
}

if (failedChecks.length > 0) {
  console.error("\nFix the failed prerequisite checks before running the local Web product loop.");
  console.error("Expected setup: Node.js 24 or newer, Corepack, and pnpm 11 through Corepack.");
  process.exit(1);
}

console.log("\nReady to install dependencies and start the local Web product loop.");
if (process.env.DELIBERUM_LOCAL_FIRST_RUN === "true") {
  console.log("Continuing with dependency installation, build, and local start.");
} else {
  console.log(`Recommended first run: ${getRecommendedFirstRunCommand()}`);
  console.log("Manual path: corepack pnpm install && corepack pnpm build && corepack pnpm start:local");
}

function checkNodeVersion() {
  const currentMajor = Number(process.versions.node.split(".")[0]);

  if (currentMajor >= minimumNodeMajor) {
    return {
      ok: true,
      label: "Node.js",
      message: `${process.versions.node} satisfies ${packageJson.engines.node}`
    };
  }

  return {
    ok: false,
    label: "Node.js",
    message: `${process.versions.node} does not satisfy ${packageJson.engines.node}`
  };
}

function checkCommand(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status === 0) {
    return {
      ok: true,
      label,
      message: result.stdout.trim() || "available"
    };
  }

  return {
    ok: false,
    label,
    message: (result.error?.message ?? result.stderr.trim()) || "not available"
  };
}

function checkPnpmVersion() {
  const result = spawnSync("corepack", ["pnpm", "--version"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return {
      ok: false,
      label: "pnpm",
      message:
        (result.error?.message ??
        result.stderr.trim()) ||
        "not available through Corepack"
    };
  }

  const version = result.stdout.trim();
  const major = Number(version.split(".")[0]);

  if (major >= minimumPnpmMajor) {
    const pinnedMessage = pinnedPnpmVersion ? `; project pins ${pinnedPackageManager}` : "";

    return {
      ok: true,
      label: "pnpm",
      message: `${version} satisfies ${packageJson.engines.pnpm}${pinnedMessage}`
    };
  }

  return {
    ok: false,
    label: "pnpm",
    message: `${version} does not satisfy ${packageJson.engines.pnpm}`
  };
}

function readMinimumMajor(range, label) {
  const match = /^>=\s*(\d+)(?:\.|$)/.exec(String(range ?? ""));

  if (!match) {
    throw new Error(`Cannot read ${label} major version requirement from package.json.`);
  }

  return Number(match[1]);
}

function getRecommendedFirstRunCommand() {
  if (process.platform === "win32") {
    return "node scripts/start-local-product.mjs";
  }

  return "sh scripts/start-local-product.sh";
}
