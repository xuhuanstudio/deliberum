import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hanPattern = /\p{Script=Han}/u;
const localizedHanContentPaths = ["README.zh-CN.md"];
const localizedHanContentPrefixes = ["docs/zh-CN/"];
const findings = [];

for (const filePath of listTrackedFiles()) {
  if (hanPattern.test(filePath)) {
    findings.push(`${filePath}: path contains non-English Han characters`);
  }

  if (isBinaryTrackedFile(filePath)) {
    continue;
  }

  const content = readFileSync(resolve(repoRoot, filePath));

  if (content.includes(0)) {
    continue;
  }

  const text = content.toString("utf8");
  const lines = text.split(/\r?\n/);

  if (!allowsLocalizedHanContent(filePath)) {
    for (let index = 0; index < lines.length; index += 1) {
      if (hanPattern.test(lines[index])) {
        findings.push(`${filePath}:${index + 1}: contains non-English Han characters`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Public repository language check failed.");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("Public repository language check passed.");
}

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  return output.split("\0").filter(Boolean);
}

function isBinaryTrackedFile(filePath) {
  return /\.(?:avif|bmp|gif|ico|jpg|jpeg|mov|mp3|mp4|pdf|png|webp|woff2?)$/i.test(filePath);
}

function allowsLocalizedHanContent(filePath) {
  return (
    localizedHanContentPaths.includes(filePath) ||
    localizedHanContentPrefixes.some((prefix) => filePath.startsWith(prefix))
  );
}
