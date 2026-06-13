import { readdirSync, readFileSync } from "node:fs";
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
