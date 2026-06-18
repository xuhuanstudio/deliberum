import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();

run(["/bin/sh", "-n", "scripts/start-local-product.sh"]);

const help = run(["/bin/sh", "scripts/start-local-product.sh", "--help"]);
assertIncludes(help.stdout, "Usage: sh scripts/start-local-product.sh [--dry-run]", "help output");

const dryRun = run(["/bin/sh", "scripts/start-local-product.sh", "--dry-run"]);
assertIncludes(dryRun.stdout, "Dry run complete.", "ready dry-run output");
assertIncludes(dryRun.stdout, "Build the local Web product", "ready dry-run delegation");

const missingToolPath = mkdtempSync(join(tmpdir(), "deliberum-bootstrap-path-"));
const dirnamePath = findCommand("dirname");
symlinkSync(dirnamePath, join(missingToolPath, "dirname"));

const missing = run(["/bin/sh", "scripts/start-local-product.sh", "--dry-run"], {
  env: {
    ...process.env,
    PATH: missingToolPath
  },
  expectFailure: true
});

assertIncludes(missing.stdout, "FAIL Node.js: not found", "missing-tool output");
assertIncludes(missing.stdout, "Install or repair the local toolchain", "missing-tool guidance");
assertIncludes(missing.stdout, "Rerun: sh scripts/start-local-product.sh", "missing-tool rerun guidance");

console.log("Local bootstrap smoke checks passed.");

function run(command, options = {}) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env ?? process.env
  });

  const output = {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };

  if (options.expectFailure) {
    if ((result.status ?? 0) === 0) {
      throw new Error(`Expected command to fail: ${command.join(" ")}`);
    }
    return output;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}
stdout:
${output.stdout}
stderr:
${output.stderr}`);
  }

  return output;
}

function findCommand(command) {
  for (const path of (process.env.PATH ?? "").split(":")) {
    const candidate = join(path, command);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Cannot find required command on PATH: ${command}`);
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} did not include expected text: ${expected}
Output:
${text}`);
  }
}
