import {
  OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
  OpenAICompatibleParticipantAdapter,
  type FetchLike
} from "@deliberum/adapters";
import { AdapterRegistry } from "@deliberum/orchestrator";
import type { DaemonRunOrchestrationOptions } from "./run-orchestration";

export const OPENAI_COMPATIBLE_PROFILE_ENV_VAR =
  "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE" as const;
export const OPENAI_COMPATIBLE_ADAPTER_ID = "openai-compatible" as const;
export const OPENAI_COMPATIBLE_API_KEY_ENV_VAR = "DELIBERUM_OPENAI_API_KEY" as const;
export const OPENAI_COMPATIBLE_BASE_URL_ENV_VAR = "DELIBERUM_OPENAI_BASE_URL" as const;
export const OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR =
  "DELIBERUM_OPENAI_ENDPOINT_PATH" as const;
export const OPENAI_COMPATIBLE_MODEL_ENV_VAR = "DELIBERUM_OPENAI_MODEL" as const;
export const OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR =
  "DELIBERUM_OPENAI_TIMEOUT_MS" as const;

export type OpenAICompatibleProfileRegistries = Pick<
  DaemonRunOrchestrationOptions,
  "adapterRegistry"
>;

export type OpenAICompatibleProfileOptions = {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
};

export function isOpenAICompatibleProfileEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[OPENAI_COMPATIBLE_PROFILE_ENV_VAR] === "true";
}

export function createOpenAICompatibleRunRegistries(
  options: OpenAICompatibleProfileOptions = {}
): Required<OpenAICompatibleProfileRegistries> {
  return {
    adapterRegistry: new AdapterRegistry([
      new OpenAICompatibleParticipantAdapter({
        adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
        baseUrl: readOptionalEnv(options.env, OPENAI_COMPATIBLE_BASE_URL_ENV_VAR),
        endpointPath:
          readOptionalEnv(options.env, OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR) ??
          OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
        model: readOptionalEnv(options.env, OPENAI_COMPATIBLE_MODEL_ENV_VAR),
        timeoutMs: parseOptionalPositiveInteger(
          readOptionalEnv(options.env, OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR)
        ),
        fetch: options.fetch
      })
    ])
  };
}

export function createOpenAICompatibleRuntimeEnv(
  env: Record<string, string | undefined> | undefined
): Record<string, string | undefined> {
  return {
    [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: env?.[OPENAI_COMPATIBLE_API_KEY_ENV_VAR]
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

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
