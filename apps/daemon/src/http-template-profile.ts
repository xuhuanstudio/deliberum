import {
  HttpTemplateAdapterError,
  HttpTemplateParticipantAdapter,
  type HttpTemplateFetchLike,
  type HttpTemplateMethod,
  type HttpTemplateResponseConfig
} from "@deliberum/adapters";
import { AdapterRegistry } from "@deliberum/orchestrator";
import type { DaemonRunOrchestrationOptions } from "./run-orchestration";

export const HTTP_TEMPLATE_PROFILE_ENV_VAR =
  "DELIBERUM_ENABLE_HTTP_TEMPLATE_PROFILE" as const;
export const HTTP_TEMPLATE_ADAPTER_ID = "http-template" as const;
export const HTTP_TEMPLATE_URL_ENV_VAR = "DELIBERUM_HTTP_TEMPLATE_URL" as const;
export const HTTP_TEMPLATE_BASE_URL_ENV_VAR = "DELIBERUM_HTTP_TEMPLATE_BASE_URL" as const;
export const HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR =
  "DELIBERUM_HTTP_TEMPLATE_ENDPOINT_PATH" as const;
export const HTTP_TEMPLATE_METHOD_ENV_VAR = "DELIBERUM_HTTP_TEMPLATE_METHOD" as const;
export const HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR =
  "DELIBERUM_HTTP_TEMPLATE_HEADERS_JSON" as const;
export const HTTP_TEMPLATE_BODY_ENV_VAR = "DELIBERUM_HTTP_TEMPLATE_BODY" as const;
export const HTTP_TEMPLATE_RESPONSE_FORMAT_ENV_VAR =
  "DELIBERUM_HTTP_TEMPLATE_RESPONSE_FORMAT" as const;
export const HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH_ENV_VAR =
  "DELIBERUM_HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH" as const;
export const HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH_ENV_VAR =
  "DELIBERUM_HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH" as const;
export const HTTP_TEMPLATE_API_KEY_ENV_VAR = "DELIBERUM_HTTP_TEMPLATE_API_KEY" as const;
export const HTTP_TEMPLATE_TIMEOUT_MS_ENV_VAR =
  "DELIBERUM_HTTP_TEMPLATE_TIMEOUT_MS" as const;

export type HttpTemplateProfileRegistries = Pick<
  DaemonRunOrchestrationOptions,
  "adapterRegistry"
>;

export type HttpTemplateProfileOptions = {
  env?: Record<string, string | undefined>;
  fetch?: HttpTemplateFetchLike;
};

export function isHttpTemplateProfileEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[HTTP_TEMPLATE_PROFILE_ENV_VAR] === "true";
}

export function createHttpTemplateRunRegistries(
  options: HttpTemplateProfileOptions = {}
): HttpTemplateProfileRegistries {
  return {
    adapterRegistry: new AdapterRegistry([
      new HttpTemplateParticipantAdapter({
        adapterId: HTTP_TEMPLATE_ADAPTER_ID,
        request: {
          method: readHttpTemplateMethodFromEnv(options.env),
          url: readOptionalEnv(options.env, HTTP_TEMPLATE_URL_ENV_VAR),
          baseUrl:
            readOptionalEnv(options.env, HTTP_TEMPLATE_BASE_URL_ENV_VAR) ??
            "{{runtime.baseUrl}}",
          endpointPath:
            readOptionalEnv(options.env, HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR) ??
            "{{runtime.endpointPath}}",
          headers: readHeadersFromEnv(options.env),
          body: readOptionalEnv(options.env, HTTP_TEMPLATE_BODY_ENV_VAR),
          timeoutMs: parseOptionalPositiveInteger(
            readOptionalEnv(options.env, HTTP_TEMPLATE_TIMEOUT_MS_ENV_VAR)
          )
        },
        response: readResponseConfigFromEnv(options.env),
        fetch: options.fetch
      })
    ])
  };
}

export function createHttpTemplateRuntimeEnv(
  env: Record<string, string | undefined> | undefined
): Record<string, string | undefined> {
  return {
    [HTTP_TEMPLATE_API_KEY_ENV_VAR]: env?.[HTTP_TEMPLATE_API_KEY_ENV_VAR]
  };
}

function readHttpTemplateMethodFromEnv(
  env: Record<string, string | undefined> | undefined
): HttpTemplateMethod | undefined {
  const method = readOptionalEnv(env, HTTP_TEMPLATE_METHOD_ENV_VAR);

  if (method === undefined) {
    return undefined;
  }

  if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH") {
    return method;
  }

  throwInvalidHttpTemplateProfileConfig();
}

function readHeadersFromEnv(
  env: Record<string, string | undefined> | undefined
): Record<string, string> | undefined {
  const rawHeaders = readOptionalEnv(env, HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR);

  if (rawHeaders === undefined) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawHeaders);
  } catch {
    throwInvalidHttpTemplateProfileConfig();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throwInvalidHttpTemplateProfileConfig();
  }

  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throwInvalidHttpTemplateProfileConfig();
    }

    headers[key] = value;
  }

  return headers;
}

function readResponseConfigFromEnv(
  env: Record<string, string | undefined> | undefined
): HttpTemplateResponseConfig {
  const format = readOptionalEnv(env, HTTP_TEMPLATE_RESPONSE_FORMAT_ENV_VAR);

  if (format !== undefined && format !== "text" && format !== "json") {
    throwInvalidHttpTemplateProfileConfig();
  }

  return {
    ...(format ? { format } : {}),
    ...(readOptionalEnv(env, HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH_ENV_VAR)
      ? { payloadPath: readOptionalEnv(env, HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH_ENV_VAR) }
      : {}),
    ...(readOptionalEnv(env, HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH_ENV_VAR)
      ? { modelIdPath: readOptionalEnv(env, HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH_ENV_VAR) }
      : {})
  };
}

function readOptionalEnv(
  env: Record<string, string | undefined> | undefined,
  key: string
): string | undefined {
  const value = env?.[key]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throwInvalidHttpTemplateProfileConfig();
  }

  return parsed;
}

function throwInvalidHttpTemplateProfileConfig(): never {
  throw new HttpTemplateAdapterError(
    "HTTP-template profile configuration is invalid.",
    "provider_config_invalid"
  );
}
