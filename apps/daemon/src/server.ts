import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import {
  createDaemonApp,
  normalizeDaemonAuthToken,
  parseDaemonCorsOriginsFromEnv,
  type DaemonApp,
  type DaemonAppOptions
} from "./app";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "./config";
import { JsonFileEventStore, SQLiteEventStore, type EventStore } from "@deliberum/storage";
import { JsonFileRunStore } from "./json-file-run-store";
import {
  JsonFileOperationAuditLog,
  parseOperationAuditMaxEntries
} from "./operation-audit-log";
import { isLocalPresetEnabledFromEnv } from "./local-preset";
import {
  isOpenAICompatibleExtractionEnabledFromEnv,
  isOpenAICompatibleFinalizationEnabledFromEnv,
  isOpenAICompatibleProfileEnabledFromEnv,
  isOpenAICompatibleReviewEnabledFromEnv
} from "./openai-compatible-profile";
import { isHttpTemplateProfileEnabledFromEnv } from "./http-template-profile";
import { isMcpToolProfileEnabledFromEnv } from "./mcp-tool-profile";
import { SQLiteResourceAccessGrantStore } from "./sqlite-resource-access-store";
import { SQLiteResourceBroker } from "./sqlite-resource-broker";
import { SQLiteRunStore } from "./sqlite-run-store";
import { SQLiteOperationAuditLog } from "./sqlite-operation-audit-log";
import { classifyResourceAccessBaseUrl } from "./resource-access-store";

export { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT };

export const DAEMON_EVENT_STORE_PATH_ENV_VAR = "DELIBERUM_DAEMON_EVENT_STORE_PATH" as const;
export const DAEMON_RUN_STORE_PATH_ENV_VAR = "DELIBERUM_DAEMON_RUN_STORE_PATH" as const;
export const DAEMON_SQLITE_PATH_ENV_VAR = "DELIBERUM_DAEMON_SQLITE_PATH" as const;
export const DAEMON_OPERATION_AUDIT_PATH_ENV_VAR =
  "DELIBERUM_DAEMON_OPERATION_AUDIT_PATH" as const;
export const DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR =
  "DELIBERUM_DAEMON_OPERATION_AUDIT_MAX_ENTRIES" as const;
export const DAEMON_AUTH_TOKEN_ENV_VAR = "DELIBERUM_DAEMON_AUTH_TOKEN" as const;
export const RESOURCE_ACCESS_BASE_URL_ENV_VAR = "DELIBERUM_RESOURCE_ACCESS_BASE_URL" as const;
export const RESOURCE_ACCESS_TTL_MS_ENV_VAR = "DELIBERUM_RESOURCE_ACCESS_TTL_MS" as const;
export const RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR =
  "DELIBERUM_RESOURCE_ACCESS_ALLOW_REMOTE" as const;

export type StartDaemonOptions = DaemonAppOptions & {
  onListening?: (address: { host: string; port: number }) => void;
};

export type StartedDaemon = DaemonApp & {
  server: ServerType;
};

export function resolveStartDaemonSQLitePath(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const value = env[DAEMON_SQLITE_PATH_ENV_VAR]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function resolveStartDaemonAuthToken(
  options: Pick<StartDaemonOptions, "daemonAuthToken"> = {},
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return normalizeDaemonAuthToken(
    options.daemonAuthToken ?? env[DAEMON_AUTH_TOKEN_ENV_VAR],
    DAEMON_AUTH_TOKEN_ENV_VAR
  );
}

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

  const sqlitePath = resolveStartDaemonSQLitePath(env);
  if (sqlitePath) {
    return new SQLiteEventStore({ filePath: sqlitePath, clock: options.clock });
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

  const sqlitePath = resolveStartDaemonSQLitePath(env);
  if (sqlitePath) {
    return new SQLiteRunStore({ filePath: sqlitePath });
  }

  const filePath = resolveStartDaemonRunStorePath(env);
  return filePath ? new JsonFileRunStore({ filePath }) : undefined;
}

export function resolveStartDaemonOperationAuditPath(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const value = env[DAEMON_OPERATION_AUDIT_PATH_ENV_VAR]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function createStartDaemonOperationAuditLog(
  options: Pick<
    StartDaemonOptions,
    | "operationAuditLog"
    | "operationAuditClock"
    | "operationAuditIdGenerator"
    | "operationAuditMaxEntries"
    | "clock"
  > = {},
  env: Record<string, string | undefined> = process.env
): StartDaemonOptions["operationAuditLog"] | undefined {
  if (options.operationAuditLog) {
    return options.operationAuditLog;
  }

  const auditOptions = {
    idGenerator: options.operationAuditIdGenerator,
    clock: options.operationAuditClock ?? options.clock,
    maxEntries:
      options.operationAuditMaxEntries ?? resolveStartDaemonOperationAuditMaxEntries(env)
  };
  const sqlitePath = resolveStartDaemonSQLitePath(env);
  if (sqlitePath) {
    return new SQLiteOperationAuditLog({
      filePath: sqlitePath,
      ...auditOptions
    });
  }

  const filePath = resolveStartDaemonOperationAuditPath(env);
  return filePath
    ? new JsonFileOperationAuditLog({
        filePath,
        ...auditOptions
      })
    : undefined;
}

export function resolveStartDaemonOperationAuditMaxEntries(
  env: Record<string, string | undefined> = process.env
): number | undefined {
  try {
    return parseOperationAuditMaxEntries(env[DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR]);
  } catch (error) {
    throw new Error(
      `${DAEMON_OPERATION_AUDIT_MAX_ENTRIES_ENV_VAR} must be a positive integer.`
    );
  }
}

export function createStartDaemonResourceAccessStore(
  options: Pick<
    StartDaemonOptions,
    | "resourceAccessStore"
    | "resourceAccessClock"
    | "resourceAccessTokenGenerator"
    | "resourceAccessTtlMs"
    | "clock"
  > = {},
  env: Record<string, string | undefined> = process.env
): StartDaemonOptions["resourceAccessStore"] | undefined {
  if (options.resourceAccessStore) {
    return options.resourceAccessStore;
  }

  const sqlitePath = resolveStartDaemonSQLitePath(env);
  if (!sqlitePath) {
    return undefined;
  }

  return new SQLiteResourceAccessGrantStore({
    filePath: sqlitePath,
    clock:
      options.resourceAccessClock ??
      (() => (options.clock ? Date.parse(options.clock()) : Date.now())),
    tokenGenerator: options.resourceAccessTokenGenerator,
    defaultTtlMs: options.resourceAccessTtlMs
  });
}

export function createStartDaemonResourceStore(
  options: Pick<StartDaemonOptions, "resourceBroker"> = {},
  env: Record<string, string | undefined> = process.env
): StartDaemonOptions["resourceBroker"] | undefined {
  if (options.resourceBroker) {
    return options.resourceBroker;
  }

  const sqlitePath = resolveStartDaemonSQLitePath(env);
  return sqlitePath ? new SQLiteResourceBroker({ filePath: sqlitePath }) : undefined;
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

export function resolveStartDaemonEnableHttpTemplateProfile(
  options: Pick<StartDaemonOptions, "enableHttpTemplateProfile"> = {},
  env: Record<string, string | undefined> = process.env
): boolean {
  return options.enableHttpTemplateProfile ?? isHttpTemplateProfileEnabledFromEnv(env);
}

export function resolveStartDaemonEnableMcpToolProfile(
  options: Pick<StartDaemonOptions, "enableMcpToolProfile"> = {},
  env: Record<string, string | undefined> = process.env
): boolean {
  return options.enableMcpToolProfile ?? isMcpToolProfileEnabledFromEnv(env);
}

export function resolveStartDaemonResourceAccessBaseUrl(
  options: Pick<StartDaemonOptions, "resourceAccessBaseUrl"> = {},
  env: Record<string, string | undefined> = process.env
): string | undefined {
  if (options.resourceAccessBaseUrl !== undefined) {
    return normalizeStartDaemonResourceAccessBaseUrl(
      options.resourceAccessBaseUrl,
      true
    );
  }

  const value = env[RESOURCE_ACCESS_BASE_URL_ENV_VAR]?.trim();

  return value && value.length > 0
    ? normalizeStartDaemonResourceAccessBaseUrl(
        value,
        resolveStartDaemonResourceAccessAllowRemote(env)
      )
    : undefined;
}

export function resolveStartDaemonResourceAccessAllowRemote(
  env: Record<string, string | undefined> = process.env
): boolean {
  const value = env[RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR]?.trim();

  if (!value) {
    return false;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR} must be true or false.`);
}

export function resolveStartDaemonResourceAccessTtlMs(
  options: Pick<StartDaemonOptions, "resourceAccessTtlMs"> = {},
  env: Record<string, string | undefined> = process.env
): number | undefined {
  if (options.resourceAccessTtlMs !== undefined) {
    return options.resourceAccessTtlMs;
  }

  const value = env[RESOURCE_ACCESS_TTL_MS_ENV_VAR]?.trim();
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${RESOURCE_ACCESS_TTL_MS_ENV_VAR} must be a positive integer.`);
  }

  const ttlMs = Number(value);
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(`${RESOURCE_ACCESS_TTL_MS_ENV_VAR} must be a positive integer.`);
  }

  return ttlMs;
}

function normalizeStartDaemonResourceAccessBaseUrl(
  value: string,
  allowRemote: boolean
): string {
  const normalized = value.trim();
  const exposure = classifyResourceAccessBaseUrl(normalized);
  const parsed = new URL(normalized);

  if (exposure !== "localhost" && !allowRemote) {
    throw new Error(
      `${RESOURCE_ACCESS_BASE_URL_ENV_VAR} requires ${RESOURCE_ACCESS_ALLOW_REMOTE_ENV_VAR}=true for non-local URLs.`
    );
  }

  if (exposure === "public" && parsed.protocol !== "https:") {
    throw new Error(`${RESOURCE_ACCESS_BASE_URL_ENV_VAR} public URLs must use HTTPS.`);
  }

  return parsed.href;
}

export function startDaemon(options: StartDaemonOptions = {}): StartedDaemon {
  const host = options.host ?? DEFAULT_DAEMON_HOST;
  const port = options.port ?? DEFAULT_DAEMON_PORT;
  const eventStore = createStartDaemonEventStore(options);
  const runStore = createStartDaemonRunStore(options);
  const operationAuditLog = createStartDaemonOperationAuditLog(options);
  const operationAuditMaxEntries = options.operationAuditLog
    ? options.operationAuditMaxEntries
    : options.operationAuditMaxEntries ?? resolveStartDaemonOperationAuditMaxEntries();
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
  const enableHttpTemplateProfile = resolveStartDaemonEnableHttpTemplateProfile(options);
  const enableMcpToolProfile = resolveStartDaemonEnableMcpToolProfile(options);
  const resourceAccessBaseUrl = resolveStartDaemonResourceAccessBaseUrl(options);
  const resourceAccessTtlMs = resolveStartDaemonResourceAccessTtlMs(options);
  const daemonAuthToken = resolveStartDaemonAuthToken(options);
  const resourceAccessStore = createStartDaemonResourceAccessStore(
    {
      ...options,
      resourceAccessTtlMs
    },
    process.env
  );
  const resourceBroker = createStartDaemonResourceStore(options, process.env);
  const daemon = createDaemonApp({
    ...options,
    eventStore,
    runStore,
    operationAuditLog,
    operationAuditMaxEntries,
    resourceAccessStore,
    resourceBroker,
    enableLocalPreset,
    enableOpenAICompatibleProfile,
    enableOpenAICompatibleExtraction,
    enableOpenAICompatibleReview,
    enableOpenAICompatibleFinalization,
    enableHttpTemplateProfile,
    openAICompatibleEnv:
      options.openAICompatibleEnv ??
      (enableOpenAICompatibleProfile ? process.env : undefined),
    httpTemplateEnv:
      options.httpTemplateEnv ?? (enableHttpTemplateProfile ? process.env : undefined),
    enableMcpToolProfile,
    mcpToolEnv: options.mcpToolEnv ?? (enableMcpToolProfile ? process.env : undefined),
    resourceAccessBaseUrl,
    resourceAccessTtlMs,
    daemonAuthToken,
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
