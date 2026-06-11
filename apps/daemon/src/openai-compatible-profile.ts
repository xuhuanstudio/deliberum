import {
  OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
  OpenAICompatibleAdapterError,
  OpenAICompatibleParticipantAdapter,
  type FetchLike,
  type OpenAICompatibleRequestOptions
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
export const OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR =
  "DELIBERUM_OPENAI_TOKEN_PARAMETER" as const;
export const OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR =
  "DELIBERUM_OPENAI_MAX_COMPLETION_TOKENS" as const;
export const OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR =
  "DELIBERUM_OPENAI_TEMPERATURE" as const;
export const OPENAI_COMPATIBLE_TOP_P_ENV_VAR = "DELIBERUM_OPENAI_TOP_P" as const;
export const OPENAI_COMPATIBLE_STREAM_ENV_VAR = "DELIBERUM_OPENAI_STREAM" as const;
export const OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR =
  "DELIBERUM_OPENAI_FREQUENCY_PENALTY" as const;
export const OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR =
  "DELIBERUM_OPENAI_PRESENCE_PENALTY" as const;
export const OPENAI_COMPATIBLE_THINKING_ENV_VAR = "DELIBERUM_OPENAI_THINKING" as const;

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
        requestOptions: createOpenAICompatibleRequestOptionsFromEnv(options.env),
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

function createOpenAICompatibleRequestOptionsFromEnv(
  env: Record<string, string | undefined> | undefined
): OpenAICompatibleRequestOptions | undefined {
  const requestOptions: OpenAICompatibleRequestOptions = {};
  const tokenParameter = readOptionalEnv(env, OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR);
  const maxCompletionTokens = readOptionalEnv(
    env,
    OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR
  );
  const temperature = readOptionalEnv(env, OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR);
  const topP = readOptionalEnv(env, OPENAI_COMPATIBLE_TOP_P_ENV_VAR);
  const stream = readOptionalEnv(env, OPENAI_COMPATIBLE_STREAM_ENV_VAR);
  const frequencyPenalty = readOptionalEnv(env, OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR);
  const presencePenalty = readOptionalEnv(env, OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR);
  const thinking = readOptionalEnv(env, OPENAI_COMPATIBLE_THINKING_ENV_VAR);

  if (tokenParameter !== undefined) {
    if (
      tokenParameter !== "none" &&
      tokenParameter !== "max_tokens" &&
      tokenParameter !== "max_completion_tokens"
    ) {
      throwInvalidOpenAICompatibleRequestOption();
    }

    requestOptions.tokenParameter = tokenParameter;
  }

  if (maxCompletionTokens !== undefined) {
    requestOptions.maxCompletionTokens =
      parseRequiredPositiveInteger(maxCompletionTokens);
  }

  if (temperature !== undefined) {
    requestOptions.temperature = parseRequiredNumberInRange(temperature, 0, 2);
  }

  if (topP !== undefined) {
    requestOptions.topP = parseRequiredNumberInRange(topP, 0, 1);
  }

  if (stream !== undefined) {
    if (stream !== "false") {
      throwInvalidOpenAICompatibleRequestOption();
    }

    requestOptions.stream = false;
  }

  if (frequencyPenalty !== undefined) {
    requestOptions.frequencyPenalty = parseRequiredNumberInRange(frequencyPenalty, -2, 2);
  }

  if (presencePenalty !== undefined) {
    requestOptions.presencePenalty = parseRequiredNumberInRange(presencePenalty, -2, 2);
  }

  if (thinking !== undefined) {
    if (thinking !== "disabled") {
      throwInvalidOpenAICompatibleRequestOption();
    }

    requestOptions.thinking = "disabled";
  }

  return Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
}

function parseRequiredPositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throwInvalidOpenAICompatibleRequestOption();
  }

  return parsed;
}

function parseRequiredNumberInRange(value: string, min: number, max: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throwInvalidOpenAICompatibleRequestOption();
  }

  return parsed;
}

function throwInvalidOpenAICompatibleRequestOption(): never {
  throw new OpenAICompatibleAdapterError(
    "OpenAI-compatible request option is invalid.",
    "provider_config_invalid"
  );
}
