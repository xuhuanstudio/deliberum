import { readFileSync } from "node:fs";

export class CliJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliJsonError";
  }
}

export function parseJsonArgument(input: string, label: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new CliJsonError(
      `Invalid JSON for ${label}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function readJsonFile(filePath: string): unknown {
  try {
    return parseJsonArgument(readFileSync(filePath, "utf8"), filePath);
  } catch (error) {
    if (error instanceof CliJsonError) {
      throw error;
    }

    throw new CliJsonError(
      `Unable to read JSON file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
