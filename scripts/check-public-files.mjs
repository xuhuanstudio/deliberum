import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const blockedPathRules = [
  { pattern: /(^|\/)\.DS_Store$/, reason: "macOS metadata must not be tracked" },
  { pattern: /(^|\/)Thumbs\.db$/i, reason: "Windows metadata must not be tracked" },
  { pattern: /(^|\/)node_modules\//, reason: "dependency directories must not be tracked" },
  { pattern: /(^|\/)\.pnpm-store\//, reason: "package manager caches must not be tracked" },
  { pattern: /(^|\/)(dist|build|coverage|\.turbo|\.vite|\.cache)\//, reason: "generated build outputs must not be tracked" },
  { pattern: /(^|\/)(\.deliberum|\.qcpd|\.deliberum-data)\//, reason: "local runtime data must not be tracked" },
  { pattern: /(^|\/)(context-capsules|resource-store|resource-cache|public-capsules|webget-tokens|session-ledgers|model-outputs)\//, reason: "generated deliberation artifacts must not be tracked" },
  { pattern: /(^|\/)(\.codex|private_codex_handoff_DO_NOT_COMMIT|deliberum-codex-private|qcpd-codex-private)\//, reason: "private workflow files must not be tracked" },
  { pattern: /\.(?:pem|key|crt|sqlite|sqlite3|db|db-wal|db-shm|sqlite-wal|sqlite-shm|db-journal|sqlite-journal|sqlite3-wal|sqlite3-shm|log)$/i, reason: "local credentials, databases, or logs must not be tracked" }
];

const findings = [];

for (const filePath of listTrackedFiles()) {
  if (isAllowedTrackedPath(filePath)) {
    continue;
  }

  for (const rule of blockedPathRules) {
    if (rule.pattern.test(filePath)) {
      findings.push(`${filePath}: ${rule.reason}`);
      break;
    }
  }
}

if (findings.length > 0) {
  console.error("Public repository file hygiene check failed.");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("Public repository file hygiene check passed.");
}

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  return output.split("\0").filter(Boolean);
}

function isAllowedTrackedPath(filePath) {
  return filePath === ".env.example";
}
