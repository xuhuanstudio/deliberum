import {
  OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
  OpenAICompatibleAdapterError,
  OpenAICompatibleParticipantAdapter,
  type FetchLike,
  type OpenAICompatibleRequestOptions
} from "@deliberum/adapters";
import {
  AdapterRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  ProposalReviewGeneratorRegistry
} from "@deliberum/orchestrator";
import {
  OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
  OpenAICompatibleExtractionGenerator
} from "./openai-compatible-extraction-generator";
import {
  OPENAI_COMPATIBLE_FINAL_AUDITOR_ID,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID,
  OpenAICompatibleFinalAuditGenerator,
  OpenAICompatibleFinalCandidateGenerator
} from "./openai-compatible-finalization-generators";
import {
  OPENAI_COMPATIBLE_REVIEWER_ID,
  OpenAICompatibleReviewGenerator
} from "./openai-compatible-review-generator";
import type { DaemonRunOrchestrationOptions } from "./run-orchestration";

export const OPENAI_COMPATIBLE_PROFILE_ENV_VAR =
  "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_PROFILE" as const;
export const OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR =
  "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_EXTRACTION" as const;
export const OPENAI_COMPATIBLE_REVIEW_ENV_VAR =
  "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_REVIEW" as const;
export const OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR =
  "DELIBERUM_ENABLE_OPENAI_COMPATIBLE_FINALIZATION" as const;
export const OPENAI_COMPATIBLE_ADAPTER_ID = "openai-compatible" as const;
export const OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR =
  "DELIBERUM_OPENAI_EXTRACTION_PROVIDER_CONFIG_ID" as const;
export const OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR =
  "DELIBERUM_OPENAI_EXTRACTION_RESPONSE_FORMAT" as const;
export const OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR =
  "DELIBERUM_OPENAI_REVIEW_PROVIDER_CONFIG_ID" as const;
export const OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR =
  "DELIBERUM_OPENAI_REVIEW_RESPONSE_FORMAT" as const;
export const OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR =
  "DELIBERUM_OPENAI_FINAL_CANDIDATE_PROVIDER_CONFIG_ID" as const;
export const OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR =
  "DELIBERUM_OPENAI_FINAL_CANDIDATE_RESPONSE_FORMAT" as const;
export const OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR =
  "DELIBERUM_OPENAI_FINAL_AUDIT_PROVIDER_CONFIG_ID" as const;
export const OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR =
  "DELIBERUM_OPENAI_FINAL_AUDIT_RESPONSE_FORMAT" as const;
export const OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID = "openai-main" as const;
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
  | "adapterRegistry"
  | "extractionGeneratorRegistry"
  | "proposalReviewGeneratorRegistry"
  | "finalCandidateGeneratorRegistry"
  | "finalAuditGeneratorRegistry"
>;

export type OpenAICompatibleProfileOptions = {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
  enableExtraction?: boolean;
  enableReview?: boolean;
  enableFinalization?: boolean;
};

export function isOpenAICompatibleProfileEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[OPENAI_COMPATIBLE_PROFILE_ENV_VAR] === "true";
}

export function isOpenAICompatibleExtractionEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR] === "true";
}

export function isOpenAICompatibleReviewEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[OPENAI_COMPATIBLE_REVIEW_ENV_VAR] === "true";
}

export function isOpenAICompatibleFinalizationEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR] === "true";
}

export function createOpenAICompatibleRunRegistries(
  options: OpenAICompatibleProfileOptions = {}
): OpenAICompatibleProfileRegistries {
  const requestOptions = createOpenAICompatibleRequestOptionsFromEnv(options.env);
  const extractionRequestOptions = options.enableExtraction
    ? createOpenAICompatibleComponentRequestOptionsFromEnv(
        options.env,
        requestOptions,
        OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR
      )
    : undefined;
  const reviewRequestOptions = options.enableReview
    ? createOpenAICompatibleComponentRequestOptionsFromEnv(
        options.env,
        requestOptions,
        OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR
      )
    : undefined;
  const finalCandidateRequestOptions = options.enableFinalization
    ? createOpenAICompatibleComponentRequestOptionsFromEnv(
        options.env,
        requestOptions,
        OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR
      )
    : undefined;
  const finalAuditRequestOptions = options.enableFinalization
    ? createOpenAICompatibleComponentRequestOptionsFromEnv(
        options.env,
        requestOptions,
        OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR
      )
    : undefined;

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
        requestOptions,
        fetch: options.fetch
      })
    ]),
    ...(options.enableExtraction
      ? {
          extractionGeneratorRegistry: new ExtractionGeneratorRegistry([
            new OpenAICompatibleExtractionGenerator({
              generatorId: OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
              adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
              providerConfigId:
                readOptionalEnv(
                  options.env,
                  OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR
                ) ?? OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
              baseUrl: readOptionalEnv(options.env, OPENAI_COMPATIBLE_BASE_URL_ENV_VAR),
              endpointPath:
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR) ??
                OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
              model: readOptionalEnv(options.env, OPENAI_COMPATIBLE_MODEL_ENV_VAR),
              timeoutMs: parseOptionalPositiveInteger(
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR)
              ),
              requestOptions: extractionRequestOptions,
              fetch: options.fetch
            })
          ])
        }
      : {}),
    ...(options.enableReview
      ? {
          proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([
            new OpenAICompatibleReviewGenerator({
              reviewerId: OPENAI_COMPATIBLE_REVIEWER_ID,
              adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
              providerConfigId:
                readOptionalEnv(
                  options.env,
                  OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR
                ) ?? OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
              baseUrl: readOptionalEnv(options.env, OPENAI_COMPATIBLE_BASE_URL_ENV_VAR),
              endpointPath:
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR) ??
                OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
              model: readOptionalEnv(options.env, OPENAI_COMPATIBLE_MODEL_ENV_VAR),
              timeoutMs: parseOptionalPositiveInteger(
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR)
              ),
              requestOptions: reviewRequestOptions,
              fetch: options.fetch
            })
          ])
        }
      : {}),
    ...(options.enableFinalization
      ? {
          finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry([
            new OpenAICompatibleFinalCandidateGenerator({
              generatorId: OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID,
              adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
              providerConfigId:
                readOptionalEnv(
                  options.env,
                  OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR
                ) ?? OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
              baseUrl: readOptionalEnv(options.env, OPENAI_COMPATIBLE_BASE_URL_ENV_VAR),
              endpointPath:
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR) ??
                OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
              model: readOptionalEnv(options.env, OPENAI_COMPATIBLE_MODEL_ENV_VAR),
              timeoutMs: parseOptionalPositiveInteger(
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR)
              ),
              requestOptions: finalCandidateRequestOptions,
              fetch: options.fetch
            })
          ]),
          finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([
            new OpenAICompatibleFinalAuditGenerator({
              auditorId: OPENAI_COMPATIBLE_FINAL_AUDITOR_ID,
              adapterId: OPENAI_COMPATIBLE_ADAPTER_ID,
              providerConfigId:
                readOptionalEnv(
                  options.env,
                  OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR
                ) ?? OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
              baseUrl: readOptionalEnv(options.env, OPENAI_COMPATIBLE_BASE_URL_ENV_VAR),
              endpointPath:
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR) ??
                OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
              model: readOptionalEnv(options.env, OPENAI_COMPATIBLE_MODEL_ENV_VAR),
              timeoutMs: parseOptionalPositiveInteger(
                readOptionalEnv(options.env, OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR)
              ),
              requestOptions: finalAuditRequestOptions,
              fetch: options.fetch
            })
          ])
        }
      : {})
  };
}

export function createOpenAICompatibleRuntimeEnv(
  env: Record<string, string | undefined> | undefined
): Record<string, string | undefined> {
  return {
    [OPENAI_COMPATIBLE_API_KEY_ENV_VAR]: env?.[OPENAI_COMPATIBLE_API_KEY_ENV_VAR]
  };
}

function createOpenAICompatibleComponentRequestOptionsFromEnv(
  env: Record<string, string | undefined> | undefined,
  baseRequestOptions: OpenAICompatibleRequestOptions | undefined,
  responseFormatEnvVar: string
): OpenAICompatibleRequestOptions | undefined {
  const requestOptions: OpenAICompatibleRequestOptions = {
    ...(baseRequestOptions ?? {})
  };
  const responseFormat = readOptionalEnv(env, responseFormatEnvVar);

  if (responseFormat !== undefined) {
    if (responseFormat !== "json_object") {
      throwInvalidOpenAICompatibleRequestOption();
    }

    requestOptions.responseFormat = "json_object";
  }

  return Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
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
