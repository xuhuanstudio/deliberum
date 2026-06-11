import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createDaemonApp, type DaemonApp, type DaemonAppOptions } from "./app";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "./config";
import { isLocalPresetEnabledFromEnv } from "./local-preset";
import {
  isOpenAICompatibleExtractionEnabledFromEnv,
  isOpenAICompatibleProfileEnabledFromEnv,
  isOpenAICompatibleReviewEnabledFromEnv
} from "./openai-compatible-profile";

export { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT };

export type StartDaemonOptions = DaemonAppOptions & {
  onListening?: (address: { host: string; port: number }) => void;
};

export type StartedDaemon = DaemonApp & {
  server: ServerType;
};

export function resolveStartDaemonEnableLocalPreset(
  options: Pick<StartDaemonOptions, "enableLocalPreset"> = {},
  env: Record<string, string | undefined> = process.env
): boolean {
  return options.enableLocalPreset ?? isLocalPresetEnabledFromEnv(env);
}

export function resolveStartDaemonEnableOpenAICompatibleProfile(
  options: Pick<StartDaemonOptions, "enableOpenAICompatibleProfile"> = {},
  env: Record<string, string | undefined> = process.env
): boolean {
  return options.enableOpenAICompatibleProfile ?? isOpenAICompatibleProfileEnabledFromEnv(env);
}

export function resolveStartDaemonEnableOpenAICompatibleExtraction(
  options: Pick<StartDaemonOptions, "enableOpenAICompatibleExtraction"> = {},
  env: Record<string, string | undefined> = process.env
): boolean {
  return options.enableOpenAICompatibleExtraction ??
    isOpenAICompatibleExtractionEnabledFromEnv(env);
}

export function resolveStartDaemonEnableOpenAICompatibleReview(
  options: Pick<StartDaemonOptions, "enableOpenAICompatibleReview"> = {},
  env: Record<string, string | undefined> = process.env
): boolean {
  return options.enableOpenAICompatibleReview ??
    isOpenAICompatibleReviewEnabledFromEnv(env);
}

export function startDaemon(options: StartDaemonOptions = {}): StartedDaemon {
  const host = options.host ?? DEFAULT_DAEMON_HOST;
  const port = options.port ?? DEFAULT_DAEMON_PORT;
  const enableLocalPreset = resolveStartDaemonEnableLocalPreset(options);
  const enableOpenAICompatibleProfile =
    resolveStartDaemonEnableOpenAICompatibleProfile(options);
  const enableOpenAICompatibleExtraction =
    enableOpenAICompatibleProfile &&
    resolveStartDaemonEnableOpenAICompatibleExtraction(options);
  const enableOpenAICompatibleReview =
    enableOpenAICompatibleProfile &&
    resolveStartDaemonEnableOpenAICompatibleReview(options);
  const daemon = createDaemonApp({
    ...options,
    enableLocalPreset,
    enableOpenAICompatibleProfile,
    enableOpenAICompatibleExtraction,
    enableOpenAICompatibleReview,
    openAICompatibleEnv:
      options.openAICompatibleEnv ??
      (enableOpenAICompatibleProfile ? process.env : undefined),
    host,
    port
  });
  const server = serve(
    {
      fetch: daemon.app.fetch,
      hostname: host,
      port
    },
    () => {
      options.onListening?.({ host, port });
    }
  );

  return {
    ...daemon,
    server
  };
}
