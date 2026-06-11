import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import {
  createDaemonApp,
  parseDaemonCorsOriginsFromEnv,
  type DaemonApp,
  type DaemonAppOptions
} from "./app";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "./config";
import { JsonFileEventStore, type EventStore } from "@deliberum/storage";
import { JsonFileRunStore } from "./json-file-run-store";
import { isLocalPresetEnabledFromEnv } from "./local-preset";
import {
  isOpenAICompatibleExtractionEnabledFromEnv,
  isOpenAICompatibleFinalizationEnabledFromEnv,
  isOpenAICompatibleProfileEnabledFromEnv,
  isOpenAICompatibleReviewEnabledFromEnv
} from "./openai-compatible-profile";

export { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT };

export const DAEMON_EVENT_STORE_PATH_ENV_VAR = "DELIBERUM_DAEMON_EVENT_STORE_PATH" as const;
export const DAEMON_RUN_STORE_PATH_ENV_VAR = "DELIBERUM_DAEMON_RUN_STORE_PATH" as const;

export type StartDaemonOptions = DaemonAppOptions & {
  onListening?: (address: { host: string; port: number }) => void;
};

export type StartedDaemon = DaemonApp & {
  server: ServerType;
};

export function resolveStartDaemonEventStorePath(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const value = env[DAEMON_EVENT_STORE_PATH_ENV_VAR]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function createStartDaemonEventStore(
  options: Pick<StartDaemonOptions, "eventStore" | "clock"> = {},
  env: Record<string, string | undefined> = process.env
): EventStore | undefined {
  if (options.eventStore) {
    return options.eventStore;
  }

  const filePath = resolveStartDaemonEventStorePath(env);
  return filePath ? new JsonFileEventStore({ filePath, clock: options.clock }) : undefined;
}

export function resolveStartDaemonRunStorePath(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const value = env[DAEMON_RUN_STORE_PATH_ENV_VAR]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function createStartDaemonRunStore(
  options: Pick<StartDaemonOptions, "runStore"> = {},
  env: Record<string, string | undefined> = process.env
): StartDaemonOptions["runStore"] | undefined {
  if (options.runStore) {
    return options.runStore;
  }

  const filePath = resolveStartDaemonRunStorePath(env);
  return filePath ? new JsonFileRunStore({ filePath }) : undefined;
}

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

export function resolveStartDaemonEnableOpenAICompatibleFinalization(
  options: Pick<StartDaemonOptions, "enableOpenAICompatibleFinalization"> = {},
  env: Record<string, string | undefined> = process.env
): boolean {
  return options.enableOpenAICompatibleFinalization ??
    isOpenAICompatibleFinalizationEnabledFromEnv(env);
}

export function startDaemon(options: StartDaemonOptions = {}): StartedDaemon {
  const host = options.host ?? DEFAULT_DAEMON_HOST;
  const port = options.port ?? DEFAULT_DAEMON_PORT;
  const eventStore = createStartDaemonEventStore(options);
  const runStore = createStartDaemonRunStore(options);
  const enableLocalPreset = resolveStartDaemonEnableLocalPreset(options);
  const enableOpenAICompatibleProfile =
    resolveStartDaemonEnableOpenAICompatibleProfile(options);
  const enableOpenAICompatibleExtraction =
    enableOpenAICompatibleProfile &&
    resolveStartDaemonEnableOpenAICompatibleExtraction(options);
  const enableOpenAICompatibleReview =
    enableOpenAICompatibleProfile &&
    resolveStartDaemonEnableOpenAICompatibleReview(options);
  const enableOpenAICompatibleFinalization =
    enableOpenAICompatibleProfile &&
    resolveStartDaemonEnableOpenAICompatibleFinalization(options);
  const daemon = createDaemonApp({
    ...options,
    eventStore,
    runStore,
    enableLocalPreset,
    enableOpenAICompatibleProfile,
    enableOpenAICompatibleExtraction,
    enableOpenAICompatibleReview,
    enableOpenAICompatibleFinalization,
    openAICompatibleEnv:
      options.openAICompatibleEnv ??
      (enableOpenAICompatibleProfile ? process.env : undefined),
    corsOrigins: options.corsOrigins ?? parseDaemonCorsOriginsFromEnv(process.env),
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
