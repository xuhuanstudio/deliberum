#!/usr/bin/env node

export * from "./app";
export * from "./config";
export * from "./event-stream";
export * from "./http-template-profile";
export * from "./json-file-run-store";
export * from "./local-preset";
export * from "./mcp-tool-profile";
export * from "./openai-compatible-extraction-generator";
export * from "./openai-compatible-finalization-generators";
export * from "./openai-compatible-profile";
export * from "./openai-compatible-review-generator";
export * from "./operation-audit-log";
export * from "./resource-access-routes";
export * from "./resource-access-store";
export * from "./resource-delivery-routes";
export * from "./runtime-profiles";
export * from "./server";
export * from "./sqlite-resource-access-store";
export * from "./sqlite-operation-audit-log";
export * from "./sqlite-run-store";
export * from "./webget-routes";
export * from "./webget-session-store";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startDaemon } from "./server";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startDaemon();
}
