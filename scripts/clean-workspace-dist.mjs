#!/usr/bin/env node
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoots = ["apps", "packages"];

for (const workspaceRoot of workspaceRoots) {
  await removeWorkspaceDistDirectories(join(repoRoot, workspaceRoot));
}

async function removeWorkspaceDistDirectories(workspaceRoot) {
  let entries;

  try {
    entries = await readdir(workspaceRoot, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageDirectory = join(workspaceRoot, entry.name);
    if (!(await fileExists(join(packageDirectory, "package.json")))) {
      continue;
    }

    const distDirectory = join(packageDirectory, "dist");
    if (!(await isDirectory(distDirectory))) {
      continue;
    }

    await rm(distDirectory, { recursive: true, force: true });
    console.log(`removed ${relativeToRepo(distDirectory)}`);
  }
}

async function fileExists(path) {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function isDirectory(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function relativeToRepo(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length) : path;
}
