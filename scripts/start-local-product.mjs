import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const help = args.has("--help") || args.has("-h");

const steps = [
  {
    label: "Check local tools",
    command: process.execPath,
    args: ["scripts/check-local-prerequisites.mjs"],
    env: {
      DELIBERUM_LOCAL_FIRST_RUN: "true"
    }
  },
  {
    label: "Install dependencies",
    command: "corepack",
    args: ["pnpm", "install"]
  },
  {
    label: "Build the local Web product",
    command: "corepack",
    args: ["pnpm", "build"]
  },
  {
    label: "Start Deliberum local Web",
    command: "corepack",
    args: ["pnpm", "start:local"],
    longRunning: true
  }
];

if (help) {
  printHelp();
  process.exit(0);
}

if (hasUnknownArgs()) {
  printHelp();
  process.exit(1);
}

console.log("Deliberum local first run");
console.log("This checks local tools, installs dependencies, builds the Web UI, and starts the local service.");
console.log("Provider setup, API keys, discussions, and local state stay on this machine.");
if (dryRun) {
  console.log("Dry run: commands will be printed but not executed.");
}

for (const [index, step] of steps.entries()) {
  const commandLine = formatCommand(step.command, step.args);
  console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);
  console.log(`$ ${commandLine}`);

  if (dryRun) {
    continue;
  }

  const exitCode = await run(step.command, step.args, step.env);
  if (exitCode !== 0) {
    console.error(`\nStep failed: ${step.label}`);
    console.error(`Command exited with code ${exitCode}: ${commandLine}`);
    process.exit(exitCode);
  }

  if (step.longRunning) {
    break;
  }
}

if (dryRun) {
  console.log("\nDry run complete. Run without --dry-run to start Deliberum locally.");
}

function hasUnknownArgs() {
  return [...args].some((arg) => arg !== "--dry-run" && arg !== "--help" && arg !== "-h");
}

function printHelp() {
  console.log(`Usage: node scripts/start-local-product.mjs [--dry-run]

Runs the supported source-checkout local product path:
  1. check Node.js, Corepack, and pnpm;
  2. install dependencies;
  3. build Deliberum;
  4. start the local Web service.

Keep the terminal open after the local Web service starts, then open the URL printed by the command.
`);
}

function run(command, commandArgs, stepEnv = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const invocation = commandInvocation(command, commandArgs);
    const child = spawn(invocation.command, invocation.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...stepEnv
      },
      stdio: "inherit"
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`Command stopped by ${signal}: ${formatCommand(command, commandArgs)}`);
        resolveRun(1);
        return;
      }

      resolveRun(code ?? 0);
    });
  });
}

function formatCommand(command, commandArgs) {
  return [command, ...commandArgs].map(formatShellArg).join(" ");
}

function formatShellArg(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandInvocation(command, args) {
  if (process.platform === "win32" && command === "corepack") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args]
    };
  }

  return { command, args };
}
