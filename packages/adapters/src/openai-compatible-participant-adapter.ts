import type {
  AdapterCapabilities,
  ContextCompleteness,
  JsonValue,
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterInput,
  ParticipantAdapterProviderRuntimeConfig,
  ParticipantAdapterResult,
  ParticipantAdapterSafeDiagnostics,
  ParticipantAdapterSafeErrorCategory
} from "./types";
import {
  AdapterInputError,
  UNKNOWN_CONTEXT_COMPLETENESS,
  cloneCapabilities,
  cloneContextCompleteness
} from "./types";

export const OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH = "/v1/chat/completions" as const;

export const OPENAI_COMPATIBLE_PARTICIPANT_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  input: {
    text: true,
    markdown: true,
    json: true,
    imageUrl: false,
    imageBase64: false,
    pdfUrl: false,
    fileUrl: false,
    webBrowsing: false
  },
  output: {
    structuredJson: false,
    markdown: true,
    streaming: false,
    manualPaste: false
  },
  limits: {},
  reliability: "medium"
};

export type OpenAICompatibleAdapterConfig = {
  adapterId?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  endpointPath?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: FetchLike;
  capabilities?: AdapterCapabilities;
  contextCompleteness?: ContextCompleteness;
  warnings?: string[];
};

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

type ChatCompletionMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatCompletionMessage[];
};

type EffectiveOpenAICompatibleConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  endpointPath: string;
  headers: Record<string, string>;
  timeoutMs?: number;
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

export class OpenAICompatibleParticipantAdapter implements ParticipantAdapter {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly model?: string;
  private readonly endpointPath: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs?: number;
  private readonly fetchImplementation: FetchLike;
  private readonly contextCompleteness: ContextCompleteness;
  private readonly warnings: string[];

  constructor(config: OpenAICompatibleAdapterConfig) {
    assertNoCustomAuthorizationHeader(config.headers);

    this.adapterId = config.adapterId ?? "openai-compatible";
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.endpointPath = config.endpointPath ?? OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH;
    this.headers = { ...(config.headers ?? {}) };
    this.timeoutMs = config.timeoutMs;
    this.fetchImplementation = config.fetch ?? getDefaultFetch();
    this.capabilities = cloneCapabilities(
      config.capabilities ?? OPENAI_COMPATIBLE_PARTICIPANT_ADAPTER_CAPABILITIES
    );
    this.contextCompleteness = cloneContextCompleteness(
      config.contextCompleteness ?? UNKNOWN_CONTEXT_COMPLETENESS
    );
    this.warnings = [...(config.warnings ?? [])];
  }

  async prepareContribution(
    input: ParticipantAdapterInput,
    context: ParticipantAdapterContext,
    providerRuntimeConfig?: ParticipantAdapterProviderRuntimeConfig
  ): Promise<ParticipantAdapterResult> {
    const effectiveConfig = resolveEffectiveConfig({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      endpointPath: this.endpointPath,
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      providerRuntimeConfig
    });
    const request = createChatCompletionRequest(effectiveConfig.model, input, context);
    const requestBody = JSON.stringify(request);
    const providerSecretValues = collectProviderSecretValues({
      apiKey: effectiveConfig.apiKey,
      customHeaders: effectiveConfig.headers
    });
    const sensitiveValues = collectSensitiveValues({
      apiKey: effectiveConfig.apiKey,
      customHeaders: effectiveConfig.headers,
      request
    });
    const response = await this.performRequest(requestBody, sensitiveValues, effectiveConfig);
    const payload = redactSecrets(extractMessageContent(response), providerSecretValues);

    return {
      payload,
      adapterId: this.adapterId,
      participantId: context.participantId,
      modelId: effectiveConfig.model,
      capabilities: cloneCapabilities(this.capabilities),
      contextCompleteness: cloneContextCompleteness(this.contextCompleteness),
      warnings: [...this.warnings]
    };
  }

  private async performRequest(
    requestBody: string,
    sensitiveValues: readonly string[],
    effectiveConfig: EffectiveOpenAICompatibleConfig
  ): Promise<unknown> {
    const controller = effectiveConfig.timeoutMs ? new AbortController() : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), effectiveConfig.timeoutMs)
      : undefined;

    try {
      const response = await this.fetchImplementation(createRequestUrl(effectiveConfig.baseUrl, effectiveConfig.endpointPath), {
        method: "POST",
        headers: createRequestHeaders(effectiveConfig.headers, effectiveConfig.apiKey),
        body: requestBody,
        signal: controller?.signal
      });

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
        redactSecrets("OpenAI-compatible provider request failed before response.", sensitiveValues),
        "provider_network_error"
      );
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}

function resolveEffectiveConfig(input: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  endpointPath: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  providerRuntimeConfig?: ParticipantAdapterProviderRuntimeConfig;
}): EffectiveOpenAICompatibleConfig {
  const baseUrl = input.providerRuntimeConfig?.baseUrl ?? input.baseUrl;
  const model = input.providerRuntimeConfig?.modelId ?? input.model;

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

  const endpointPath = input.providerRuntimeConfig?.endpointPath ?? input.endpointPath;
  assertEffectiveRequestUrl(baseUrl, endpointPath);

  return {
    baseUrl,
    apiKey: input.providerRuntimeConfig?.apiKey ?? input.apiKey,
    model,
    endpointPath,
    headers: input.headers,
    timeoutMs: input.providerRuntimeConfig?.timeoutMs ?? input.timeoutMs
  };
}

function createChatCompletionRequest(
  model: string,
  input: ParticipantAdapterInput,
  context: ParticipantAdapterContext
): ChatCompletionRequest {
  const messages: ChatCompletionMessage[] = [];

  if (context.instructions) {
    messages.push({
      role: "system",
      content: context.instructions
    });
  }

  messages.push({
    role: "user",
    content: renderUserContent(input)
  });

  return {
    model,
    messages
  };
}

function renderUserContent(input: ParticipantAdapterInput): string {
  const parts: string[] = [];

  if (input.instructions) {
    parts.push(input.instructions);
  }

  if (input.payload !== undefined) {
    parts.push(renderPayload(input.payload));
  }

  if (parts.length === 0) {
    throw new AdapterInputError("OpenAI-compatible adapter input requires instructions or payload.");
  }

  return parts.join("\n\n");
}

function renderPayload(payload: JsonValue): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
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

function assertNoCustomAuthorizationHeader(headers: Record<string, string> | undefined): void {
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
  request: ChatCompletionRequest;
}): string[] {
  return [
    ...collectProviderSecretValues(input),
    JSON.stringify(input.request),
    ...input.request.messages.map((message) => message.content)
  ].filter((value): value is string => Boolean(value));
}

function collectProviderSecretValues(input: {
  apiKey?: string;
  customHeaders: Record<string, string>;
}): string[] {
  return [
    input.apiKey,
    input.apiKey ? `Bearer ${input.apiKey}` : undefined,
    ...Object.values(input.customHeaders)
  ].filter((value): value is string => Boolean(value));
}

function redactSecrets(message: string, secretValues: readonly string[]): string {
  let redacted = message;

  for (const secretValue of secretValues) {
    redacted = redacted.split(secretValue).join("[REDACTED]");
  }

  return redacted;
}
