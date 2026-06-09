#!/usr/bin/env node

export * from "./cli";
export * from "./json-file-event-store";
export * from "./read-json";
export * from "./topic-contract";

import { main } from "./cli";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
