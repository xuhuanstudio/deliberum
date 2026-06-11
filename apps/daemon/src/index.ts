#!/usr/bin/env node

export * from "./app";
export * from "./config";
export * from "./event-stream";
export * from "./local-preset";
export * from "./openai-compatible-extraction-generator";
export * from "./openai-compatible-profile";
export * from "./openai-compatible-review-generator";
export * from "./server";
export * from "./webget-routes";
export * from "./webget-session-store";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startDaemon } from "./server";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startDaemon();
}
