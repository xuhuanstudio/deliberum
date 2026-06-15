import {
  OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
  OpenAICompatibleAdapterError,
  completeOpenAICompatibleRequest,
  type FetchLike,
  type OpenAICompatibleRequestOptions
} from "@deliberum/adapters";
import {
  OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
  OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
  OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR,
  OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR,
  OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR,
  OPENAI_COMPATIBLE_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR,
  OPENAI_COMPATIBLE_STREAM_ENV_VAR,
  OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR,
  OPENAI_COMPATIBLE_THINKING_ENV_VAR,
  OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR,
  OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR,
  OPENAI_COMPATIBLE_TOP_P_ENV_VAR
} from "./openai-compatible-profile";

export type OpenAICompatibleSetupVerificationResponse = {
  profileId: "openai-compatible";
  status: "connected";
  checked: "provider_chat_completion";
  safety: string[];
};

export const DEFAULT_OPENAI_COMPATIBLE_SETUP_VERIFICATION_TIMEOUT_MS = 30_000;

export async function verifyOpenAICompatibleSetup(input: {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
}): Promise<OpenAICompatibleSetupVerificationResponse> {
  await completeOpenAICompatibleRequest({
    config: {
      baseUrl: readOptionalEnv(input.env, OPENAI_COMPATIBLE_BASE_URL_ENV_VAR),
      apiKey: readOptionalEnv(input.env, OPENAI_COMPATIBLE_API_KEY_ENV_VAR),
      model: readOptionalEnv(input.env, OPENAI_COMPATIBLE_MODEL_ENV_VAR),
      endpointPath:
        readOptionalEnv(input.env, OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR) ??
        OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
      timeoutMs: parseOptionalPositiveInteger(
        readOptionalEnv(input.env, OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR)
      ) ?? DEFAULT_OPENAI_COMPATIBLE_SETUP_VERIFICATION_TIMEOUT_MS,
      requestOptions: createVerificationRequestOptionsFromEnv(input.env),
      fetch: input.fetch
    },
    messages: [
      {
        role: "system",
        content:
          "You are verifying Deliberum's local model provider setup. Reply with exactly one short word: ready."
      },
      {
        role: "user",
        content: "Reply with ready."
      }
    ]
  });

  return {
    profileId: "openai-compatible",
    status: "connected",
    checked: "provider_chat_completion",
    safety: [
      "The verification request was sent by the local daemon.",
      "Provider credentials and provider response text are not returned to Web.",
      "A successful check means the configured provider accepted a minimal chat request."
    ]
  };
}

export function describeOpenAICompatibleVerificationError(error: OpenAICompatibleAdapterError): {
  code: string;
  message: string;
} {
  switch (error.safeCategory) {
    case "provider_auth_failed":
      return {
        code: error.safeCategory,
        message: "Provider authentication failed. Check the API key, then verify again."
      };
    case "provider_not_found":
      return {
        code: error.safeCategory,
        message: "Provider endpoint or model was not found. Check the base URL and model."
      };
    case "provider_rate_limited":
      return {
        code: error.safeCategory,
        message: "Provider rate limited the verification request. Try again later."
      };
    case "provider_timeout":
      return {
        code: error.safeCategory,
        message: "Provider verification timed out. Check the base URL and provider availability."
      };
    case "provider_network_error":
      return {
        code: error.safeCategory,
        message: "Provider could not be reached. Check the base URL and network connection."
      };
    case "provider_config_invalid":
      return {
        code: error.safeCategory,
        message: "Provider setup is incomplete or invalid. Check the base URL, model, and optional request settings."
      };
    case "provider_malformed_response":
    case "provider_response_empty":
    case "provider_response_missing_content":
      return {
        code: error.safeCategory,
        message: "Provider answered, but the response was not compatible with the expected chat format."
      };
    default:
      return {
        code: error.safeCategory,
        message: "Provider verification failed. Check the setup and try again."
      };
  }
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

function createVerificationRequestOptionsFromEnv(
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
    if (stream !== "true" && stream !== "false") {
      throwInvalidOpenAICompatibleRequestOption();
    }

    requestOptions.stream = stream === "true";
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
