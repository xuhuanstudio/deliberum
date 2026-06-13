import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inlineLinkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const referenceLinkPattern = /^\s*\[[^\]]+]:\s*(\S+)/gm;
const findings = [];

for (const filePath of listTrackedMarkdownFiles()) {
  const absoluteFilePath = resolve(repoRoot, filePath);
  const content = readFileSync(absoluteFilePath, "utf8");

  checkLinks(filePath, content, inlineLinkPattern);
  checkLinks(filePath, content, referenceLinkPattern);
}

if (findings.length > 0) {
  console.error("Markdown local link check failed.");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("Markdown local link check passed.");
}

function checkLinks(filePath, content, pattern) {
  pattern.lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const target = match[1];

    if (!target || shouldSkipTarget(target)) {
      continue;
    }

    const targetPath = target.split("#", 1)[0] ?? "";

    if (!targetPath) {
      continue;
    }

    let resolvedPath;
    try {
      resolvedPath = resolve(dirname(resolve(repoRoot, filePath)), decodeURIComponent(targetPath));
    } catch {
      findings.push(`${filePath}: local link target is not valid URI encoding: ${target}`);
      continue;
    }

    if (!isPathInsideRepo(resolvedPath) || !existsSync(resolvedPath)) {
      findings.push(`${filePath}: missing local link target ${target}`);
      continue;
    }

    const stats = statSync(resolvedPath);
    if (!stats.isFile() && !stats.isDirectory()) {
      findings.push(`${filePath}: local link target is not a file or directory: ${target}`);
    }
  }
}

function listTrackedMarkdownFiles() {
  const output = execFileSync("git", ["ls-files", "-z", "*.md"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  return output.split("\0").filter(Boolean);
}

function shouldSkipTarget(target) {
  return (
    target.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target) ||
    target.startsWith("<") ||
    target.startsWith("{")
  );
}

function isPathInsideRepo(path) {
  const relativePath = relative(repoRoot, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/"));
}
