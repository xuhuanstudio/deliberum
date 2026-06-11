import type {
  OpenAICompatibleRequestOptions,
  ParticipantAdapterSafeDiagnostics,
  ParticipantAdapterSafeErrorCategory
} from "./types";

export const OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH = "/v1/chat/completions" as const;

export type OpenAICompatibleFetchInit = {
  method: "POST";
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
};

export type OpenAICompatibleFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type FetchLike = (
  url: string,
  init: OpenAICompatibleFetchInit
) => Promise<OpenAICompatibleFetchResponse>;

export type OpenAICompatibleChatMessage = {
  role: "system" | "user";
  content: string;
};

export type OpenAICompatibleChatRequest = {
  model: string;
  messages: OpenAICompatibleChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: false;
  frequency_penalty?: number;
  presence_penalty?: number;
  thinking?: {
    type: "disabled";
  };
};

export type OpenAICompatibleChatRequestConfig = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  endpointPath?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  requestOptions?: OpenAICompatibleRequestOptions;
  fetch?: FetchLike;
};

export class OpenAICompatibleAdapterError extends Error {
  readonly safeCategory: ParticipantAdapterSafeErrorCategory;
  readonly safeDiagnostics?: ParticipantAdapterSafeDiagnostics;
  readonly httpStatus?: number;
  readonly status?: number;

  constructor(
    message: string,
    safeCategory: ParticipantAdapterSafeErrorCategory = "provider_unknown_error",
    safeDiagnostics: ParticipantAdapterSafeDiagnostics = {}
  ) {
    super(message);
    this.name = "OpenAICompatibleAdapterError";
    this.safeCategory = safeCategory;
    this.safeDiagnostics = Object.keys(safeDiagnostics).length > 0
      ? { ...safeDiagnostics }
      : undefined;
    this.httpStatus = safeDiagnostics.httpStatus;
    this.status = safeDiagnostics.httpStatus;
  }
}

export async function completeOpenAICompatibleRequest(input: {
  config: OpenAICompatibleChatRequestConfig;
  messages: readonly OpenAICompatibleChatMessage[];
}): Promise<string> {
  const effectiveConfig = resolveEffectiveConfig(input.config);
  const request = createChatCompletionRequest(
    effectiveConfig.model,
    input.messages,
    effectiveConfig.requestOptions
  );
  const requestBody = JSON.stringify(request);
  const sensitiveValues = collectSensitiveValues({
    apiKey: effectiveConfig.apiKey,
    customHeaders: effectiveConfig.headers,
    request
  });
  const response = await performRequest(requestBody, sensitiveValues, effectiveConfig);

  return extractMessageContent(response);
}

export function normalizeOpenAICompatibleRequestOptions(
  requestOptions: OpenAICompatibleRequestOptions | undefined
): OpenAICompatibleRequestOptions {
  if (!requestOptions) {
    return {};
  }

  const normalized: OpenAICompatibleRequestOptions = {};

  if (requestOptions.tokenParameter !== undefined) {
    if (
      requestOptions.tokenParameter !== "none" &&
      requestOptions.tokenParameter !== "max_tokens" &&
      requestOptions.tokenParameter !== "max_completion_tokens"
    ) {
      throwInvalidRequestOption();
    }

    normalized.tokenParameter = requestOptions.tokenParameter;
  }

  if (requestOptions.maxCompletionTokens !== undefined) {
    if (
      typeof requestOptions.maxCompletionTokens !== "number" ||
      !Number.isFinite(requestOptions.maxCompletionTokens) ||
      !Number.isInteger(requestOptions.maxCompletionTokens) ||
      requestOptions.maxCompletionTokens <= 0
    ) {
      throwInvalidRequestOption();
    }

    normalized.maxCompletionTokens = requestOptions.maxCompletionTokens;
  }

  if (requestOptions.temperature !== undefined) {
    normalized.temperature = validateNumberRange(requestOptions.temperature, 0, 2);
  }

  if (requestOptions.topP !== undefined) {
    normalized.topP = validateNumberRange(requestOptions.topP, 0, 1);
  }

  if (requestOptions.stream !== undefined) {
    if (requestOptions.stream !== false) {
      throwInvalidRequestOption();
    }

    normalized.stream = false;
  }

  if (requestOptions.frequencyPenalty !== undefined) {
    normalized.frequencyPenalty = validateNumberRange(
      requestOptions.frequencyPenalty,
      -2,
      2
    );
  }

  if (requestOptions.presencePenalty !== undefined) {
    normalized.presencePenalty = validateNumberRange(requestOptions.presencePenalty, -2, 2);
  }

  if (requestOptions.thinking !== undefined) {
    if (requestOptions.thinking !== "disabled") {
      throwInvalidRequestOption();
    }

    normalized.thinking = "disabled";
  }

  return normalized;
}

export function assertNoCustomAuthorizationHeader(
  headers: Record<string, string> | undefined
): void {
  if (!headers) {
    return;
  }

  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === "authorization") {
      throw new OpenAICompatibleAdapterError(
        "Custom Authorization headers are not allowed.",
        "provider_config_invalid"
      );
    }
  }
}

export function collectOpenAICompatibleProviderSecretValues(input: {
  apiKey?: string;
  customHeaders: Record<string, string>;
}): string[] {
  return [
    input.apiKey,
    input.apiKey ? `Bearer ${input.apiKey}` : undefined,
    ...Object.values(input.customHeaders)
  ].filter((value): value is string => Boolean(value));
}

export function redactOpenAICompatibleSecrets(
  message: string,
  secretValues: readonly string[]
): string {
  let redacted = message;

  for (const secretValue of secretValues) {
    redacted = redacted.split(secretValue).join("[REDACTED]");
  }

  return redacted;
}

type EffectiveOpenAICompatibleConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  endpointPath: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  requestOptions: OpenAICompatibleRequestOptions;
  fetch: FetchLike;
};

function resolveEffectiveConfig(
  config: OpenAICompatibleChatRequestConfig
): EffectiveOpenAICompatibleConfig {
  const baseUrl = config.baseUrl;
  const model = config.model;
  const endpointPath = config.endpointPath ?? OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH;

  assertNoCustomAuthorizationHeader(config.headers);

  if (!baseUrl) {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible adapter baseUrl is required.",
      "provider_config_invalid"
    );
  }

  if (!model) {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible adapter model is required.",
      "provider_config_invalid"
    );
  }

  assertEffectiveRequestUrl(baseUrl, endpointPath);

  return {
    baseUrl,
    apiKey: config.apiKey,
    model,
    endpointPath,
    headers: { ...(config.headers ?? {}) },
    timeoutMs: config.timeoutMs,
    requestOptions: normalizeOpenAICompatibleRequestOptions(config.requestOptions),
    fetch: config.fetch ?? getDefaultFetch()
  };
}

function createChatCompletionRequest(
  model: string,
  messages: readonly OpenAICompatibleChatMessage[],
  requestOptions: OpenAICompatibleRequestOptions
): OpenAICompatibleChatRequest {
  const request: OpenAICompatibleChatRequest = {
    model,
    messages: [...messages]
  };

  applyRequestOptions(request, requestOptions);

  return request;
}

function applyRequestOptions(
  request: OpenAICompatibleChatRequest,
  requestOptions: OpenAICompatibleRequestOptions
): void {
  const tokenParameter =
    requestOptions.tokenParameter ??
    (requestOptions.maxCompletionTokens !== undefined ? "max_completion_tokens" : undefined);

  if (tokenParameter === "max_tokens") {
    request.max_tokens = requireMaxCompletionTokens(requestOptions);
  } else if (tokenParameter === "max_completion_tokens") {
    request.max_completion_tokens = requireMaxCompletionTokens(requestOptions);
  }

  if (requestOptions.temperature !== undefined) {
    request.temperature = requestOptions.temperature;
  }

  if (requestOptions.topP !== undefined) {
    request.top_p = requestOptions.topP;
  }

  if (requestOptions.stream !== undefined) {
    request.stream = requestOptions.stream;
  }

  if (requestOptions.frequencyPenalty !== undefined) {
    request.frequency_penalty = requestOptions.frequencyPenalty;
  }

  if (requestOptions.presencePenalty !== undefined) {
    request.presence_penalty = requestOptions.presencePenalty;
  }

  if (requestOptions.thinking === "disabled") {
    request.thinking = {
      type: "disabled"
    };
  }
}

function requireMaxCompletionTokens(requestOptions: OpenAICompatibleRequestOptions): number {
  if (requestOptions.maxCompletionTokens === undefined) {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible token request option is invalid.",
      "provider_config_invalid"
    );
  }

  return requestOptions.maxCompletionTokens;
}

async function performRequest(
  requestBody: string,
  sensitiveValues: readonly string[],
  effectiveConfig: EffectiveOpenAICompatibleConfig
): Promise<unknown> {
  const controller = effectiveConfig.timeoutMs ? new AbortController() : undefined;
  const timeout = controller
    ? setTimeout(() => controller.abort(), effectiveConfig.timeoutMs)
    : undefined;

  try {
    const response = await effectiveConfig.fetch(
      createRequestUrl(effectiveConfig.baseUrl, effectiveConfig.endpointPath),
      {
        method: "POST",
        headers: createRequestHeaders(effectiveConfig.headers, effectiveConfig.apiKey),
        body: requestBody,
        signal: controller?.signal
      }
    );

    if (!response.ok) {
      const httpStatus = normalizeHttpStatus(response.status);
      throw new OpenAICompatibleAdapterError(
        httpStatus === undefined
          ? "OpenAI-compatible provider request failed with non-OK status."
          : `OpenAI-compatible provider request failed with status ${httpStatus}.`,
        getHttpSafeCategory(httpStatus),
        httpStatus === undefined ? {} : { httpStatus }
      );
    }

    try {
      return await response.json();
    } catch {
      throw new OpenAICompatibleAdapterError(
        "OpenAI-compatible provider response was malformed.",
        "provider_malformed_response"
      );
    }
  } catch (error) {
    if (error instanceof OpenAICompatibleAdapterError) {
      throw error;
    }

    if (controller?.signal.aborted) {
      throw new OpenAICompatibleAdapterError(
        "OpenAI-compatible provider request timed out.",
        "provider_timeout"
      );
    }

    throw new OpenAICompatibleAdapterError(
      redactOpenAICompatibleSecrets(
        "OpenAI-compatible provider request failed before response.",
        sensitiveValues
      ),
      "provider_network_error"
    );
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function extractMessageContent(response: unknown): string {
  if (typeof response !== "object" || response === null) {
    throw new OpenAICompatibleAdapterError(
      "Malformed OpenAI-compatible provider response.",
      "provider_malformed_response"
    );
  }

  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    throw new OpenAICompatibleAdapterError(
      "Malformed OpenAI-compatible provider response.",
      "provider_malformed_response"
    );
  }

  if (choices.length === 0) {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible provider response was empty.",
      "provider_response_empty"
    );
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) {
    throw new OpenAICompatibleAdapterError(
      "Malformed OpenAI-compatible provider response.",
      "provider_malformed_response"
    );
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    throw new OpenAICompatibleAdapterError(
      "Malformed OpenAI-compatible provider response.",
      "provider_malformed_response"
    );
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string") {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible provider response did not include message content.",
      "provider_response_missing_content"
    );
  }

  if (content.trim().length === 0) {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible provider response was empty.",
      "provider_response_empty"
    );
  }

  return content;
}

function createRequestUrl(baseUrl: string, endpointPath: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedEndpointPath = endpointPath.startsWith("/")
    ? endpointPath.slice(1)
    : endpointPath;

  return new URL(normalizedEndpointPath, normalizedBaseUrl).toString();
}

function assertEffectiveRequestUrl(baseUrl: string, endpointPath: string): void {
  try {
    createRequestUrl(baseUrl, endpointPath);
  } catch {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible adapter provider URL is invalid.",
      "provider_config_invalid"
    );
  }
}

function createRequestHeaders(
  customHeaders: Record<string, string>,
  apiKey: string | undefined
): Record<string, string> {
  const headers: Record<string, string> = {
    ...customHeaders,
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function getDefaultFetch(): FetchLike {
  if (typeof globalThis.fetch !== "function") {
    throw new OpenAICompatibleAdapterError(
      "OpenAI-compatible adapter requires a fetch implementation.",
      "provider_config_invalid"
    );
  }

  return (url, init) =>
    globalThis.fetch(url, init).then((response) => ({
      ok: response.ok,
      status: response.status,
      json: () => response.json() as Promise<unknown>
    }));
}

function normalizeHttpStatus(status: number): number | undefined {
  return Number.isFinite(status) &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
    ? status
    : undefined;
}

function getHttpSafeCategory(status: number | undefined): ParticipantAdapterSafeErrorCategory {
  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }

  if (status === 404) {
    return "provider_not_found";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  return "provider_http_error";
}

function collectSensitiveValues(input: {
  apiKey?: string;
  customHeaders: Record<string, string>;
  request: OpenAICompatibleChatRequest;
}): string[] {
  return [
    ...collectOpenAICompatibleProviderSecretValues(input),
    JSON.stringify(input.request),
    ...input.request.messages.map((message) => message.content)
  ].filter((value): value is string => Boolean(value));
}

function validateNumberRange(value: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throwInvalidRequestOption();
  }

  return value;
}

function throwInvalidRequestOption(): never {
  throw new OpenAICompatibleAdapterError(
    "OpenAI-compatible request option is invalid.",
    "provider_config_invalid"
  );
}
