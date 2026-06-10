#!/usr/bin/env node

export * from "./app";
export * from "./config";
export * from "./event-stream";
export * from "./server";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startDaemon } from "./server";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startDaemon();
}
