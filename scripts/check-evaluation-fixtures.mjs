import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBaselineComparisonReport
} from "../packages/evaluation/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(repoRoot, "examples", "evaluation");
const fixtureFiles = readdirSync(fixturesDir)
  .filter((entry) => extname(entry) === ".json")
  .sort();
const findings = [];

if (fixtureFiles.length === 0) {
  findings.push("examples/evaluation must contain at least one JSON fixture.");
}

for (const fixtureFile of fixtureFiles) {
  const relativePath = `examples/evaluation/${fixtureFile}`;
  const fixturePath = join(fixturesDir, fixtureFile);
  let input;

  try {
    input = JSON.parse(readFileSync(fixturePath, "utf8"));
  } catch (error) {
    findings.push(`${relativePath}: fixture is not valid JSON (${error.message}).`);
    continue;
  }

  let report;
  try {
    report = createBaselineComparisonReport(input);
  } catch (error) {
    findings.push(`${relativePath}: ${error.message}`);
    continue;
  }

  if (report.missingFindingCount !== 0) {
    findings.push(
      `${relativePath}: has ${report.missingFindingCount} missing comparison finding(s).`
    );
  }

  if (report.unsupportedFindingCount !== 0) {
    findings.push(
      `${relativePath}: has ${report.unsupportedFindingCount} unsupported finding(s).`
    );
  }

  if (report.coverage.missingStandardDimensions.length > 0) {
    findings.push(
      `${relativePath}: missing evaluation dimension coverage: ${report.coverage.missingStandardDimensions.join(", ")}.`
    );
  }

  if (report.coverage.missingStandardBaselineRunKinds.length > 0) {
    findings.push(
      `${relativePath}: missing baseline kind coverage: ${report.coverage.missingStandardBaselineRunKinds.join(", ")}.`
    );
  }

  if (report.coverage.incompleteFindingMatrixCaseCount !== 0) {
    findings.push(
      `${relativePath}: has ${report.coverage.incompleteFindingMatrixCaseCount} incomplete case finding matrix/matrices.`
    );
  }
}

if (findings.length > 0) {
  console.error("Evaluation fixture check failed.");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Evaluation fixture check passed for ${fixtureFiles.length} fixture(s).`);
}
