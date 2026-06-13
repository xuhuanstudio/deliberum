import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBaselineComparisonReport,
  formatBaselineComparisonMarkdownReport
} from "../packages/evaluation/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultFixturesDir = join(repoRoot, "examples", "evaluation");
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: corepack pnpm report:evaluation [fixture.json ...]

Render Markdown summaries for Deliberum baseline comparison fixtures.
When no fixture path is provided, every JSON file in examples/evaluation is used.`);
  process.exit(0);
}

const fixturePaths =
  args.length > 0
    ? args.map((arg) => resolveFixturePath(arg))
    : readdirSync(defaultFixturesDir)
        .filter((entry) => extname(entry) === ".json")
        .sort()
        .map((entry) => join(defaultFixturesDir, entry));
const failures = [];
const renderedReports = [];

if (fixturePaths.length === 0) {
  failures.push("No evaluation fixture JSON files were found.");
}

for (const fixturePath of fixturePaths) {
  const relativePath = relative(repoRoot, fixturePath);
  let input;

  try {
    input = JSON.parse(readFileSync(fixturePath, "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: fixture is not readable JSON (${error.message}).`);
    continue;
  }

  try {
    const report = createBaselineComparisonReport(input);
    const sourceRefFailures = collectSourceRefs(input)
      .map((sourceRef) => validateSourceRef(sourceRef))
      .filter((failure) => failure !== undefined);

    if (sourceRefFailures.length > 0) {
      failures.push(...sourceRefFailures.map((failure) => `${relativePath}: ${failure}`));
      continue;
    }

    renderedReports.push(
      formatBaselineComparisonMarkdownReport(report, {
        title: `Evaluation fixture: ${relativePath}`
      }).trimEnd()
    );
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error("Evaluation fixture report failed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`${renderedReports.join("\n\n---\n\n")}\n`);
}

function resolveFixturePath(inputPath) {
  return isAbsolute(inputPath) ? inputPath : resolve(repoRoot, inputPath);
}

function collectSourceRefs(input) {
  const sourceRefs = new Set();

  for (const testCase of Array.isArray(input?.cases) ? input.cases : []) {
    addSourceRefs(sourceRefs, testCase?.sourceRefs);

    for (const run of Array.isArray(testCase?.runs) ? testCase.runs : []) {
      addSourceRefs(sourceRefs, run?.sourceRefs);
    }

    for (const finding of Array.isArray(testCase?.findings) ? testCase.findings : []) {
      addSourceRefs(sourceRefs, finding?.sourceRefs);
    }
  }

  return [...sourceRefs].sort();
}

function addSourceRefs(sourceRefs, values) {
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value === "string") {
      sourceRefs.add(value);
    }
  }
}

function validateSourceRef(sourceRef) {
  if (isAbsolute(sourceRef)) {
    return `sourceRef must be repository-relative: ${sourceRef}`;
  }

  const resolved = resolve(repoRoot, sourceRef);
  const relativePath = relative(repoRoot, resolved);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return `sourceRef must stay inside the repository: ${sourceRef}`;
  }

  if (!existsSync(resolved)) {
    return `sourceRef does not exist: ${sourceRef}`;
  }

  if (!statSync(resolved).isFile()) {
    return `sourceRef must point to a file: ${sourceRef}`;
  }

  return undefined;
}
