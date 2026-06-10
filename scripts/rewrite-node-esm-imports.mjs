import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoots = ["apps", "packages"];
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".node"]);

let fileCount = 0;
let rewriteCount = 0;

for (const workspaceRoot of workspaceRoots) {
  const rootPath = join(repoRoot, workspaceRoot);

  if (!existsSync(rootPath)) {
    continue;
  }

  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const distPath = join(rootPath, entry.name, "dist");
    if (!existsSync(distPath)) {
      continue;
    }

    for (const filePath of listJavaScriptFiles(distPath)) {
      rewriteCount += rewriteFile(filePath);
      fileCount += 1;
    }
  }
}

if (fileCount > 0) {
  console.log(`Rewrote ${rewriteCount} Node ESM import specifier(s) across ${fileCount} dist file(s).`);
}

function listJavaScriptFiles(rootPath) {
  const files = [];

  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = join(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

function rewriteFile(filePath) {
  const source = readFileSync(filePath, "utf8");
  let rewrites = 0;
  const rewritten = source
    .replace(
      /\b(import\s+(?:[^'"]*?\s+from\s*)?["'])(\.{1,2}\/[^'"]+)(["'])/g,
      (match, prefix, specifier, suffix) =>
        rewriteMatch(filePath, prefix, specifier, suffix, match)
    )
    .replace(
      /\b(export\s+(?:\*|\{[^}]*\})\s+from\s+["'])(\.{1,2}\/[^'"]+)(["'])/g,
      (match, prefix, specifier, suffix) =>
        rewriteMatch(filePath, prefix, specifier, suffix, match)
    )
    .replace(
      /\b(import\s*\(\s*["'])(\.{1,2}\/[^'"]+)(["']\s*\))/g,
      (match, prefix, specifier, suffix) =>
        rewriteMatch(filePath, prefix, specifier, suffix, match)
    );

  if (rewritten !== source) {
    writeFileSync(filePath, rewritten);
  }

  return rewrites;

  function rewriteMatch(currentFilePath, prefix, specifier, suffix, original) {
    const nextSpecifier = resolveSpecifier(currentFilePath, specifier);

    if (nextSpecifier === specifier) {
      return original;
    }

    rewrites += 1;
    return `${prefix}${nextSpecifier}${suffix}`;
  }
}

function resolveSpecifier(filePath, specifier) {
  if (!isExtensionlessRelativeSpecifier(specifier)) {
    return specifier;
  }

  const targetPath = resolve(dirname(filePath), specifier);
  const fileCandidate = `${targetPath}.js`;

  if (existsSync(fileCandidate) && statSync(fileCandidate).isFile()) {
    return `${specifier}.js`;
  }

  const indexCandidate = join(targetPath, "index.js");

  if (existsSync(indexCandidate) && statSync(indexCandidate).isFile()) {
    return `${specifier}${specifier.endsWith("/") ? "" : "/"}index.js`;
  }

  return specifier;
}

function isExtensionlessRelativeSpecifier(specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return false;
  }

  if (specifier.includes("?") || specifier.includes("#")) {
    return false;
  }

  const lastSegment = specifier.split(/[\\/]/).at(-1) ?? "";

  return !sourceExtensions.has(extname(lastSegment)) && !specifier.endsWith(sep);
}
