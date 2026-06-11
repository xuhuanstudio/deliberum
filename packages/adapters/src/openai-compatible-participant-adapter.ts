import type {
  AdapterCapabilities,
  ContextCompleteness,
  JsonValue,
  OpenAICompatibleRequestOptions,
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterInput,
  ParticipantAdapterProviderRuntimeConfig,
  ParticipantAdapterResult
} from "./types";
import {
  AdapterInputError,
  UNKNOWN_CONTEXT_COMPLETENESS,
  cloneCapabilities,
  cloneContextCompleteness
} from "./types";
import {
  OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH,
  OpenAICompatibleAdapterError,
  assertNoCustomAuthorizationHeader,
  collectOpenAICompatibleProviderSecretValues,
  completeOpenAICompatibleRequest,
  normalizeOpenAICompatibleRequestOptions,
  redactOpenAICompatibleSecrets,
  type FetchLike,
  type OpenAICompatibleChatMessage
} from "./openai-compatible-chat-client";

export { OPENAI_COMPATIBLE_DEFAULT_ENDPOINT_PATH, OpenAICompatibleAdapterError };
export type { FetchLike, OpenAICompatibleFetchInit, OpenAICompatibleFetchResponse } from "./openai-compatible-chat-client";

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
  requestOptions?: OpenAICompatibleRequestOptions;
  fetch?: FetchLike;
  capabilities?: AdapterCapabilities;
  contextCompleteness?: ContextCompleteness;
  warnings?: string[];
};

type EffectiveOpenAICompatibleConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  endpointPath: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  requestOptions: OpenAICompatibleRequestOptions;
};

export class OpenAICompatibleParticipantAdapter implements ParticipantAdapter {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly model?: string;
  private readonly endpointPath: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs?: number;
  private readonly requestOptions: OpenAICompatibleRequestOptions;
  private readonly fetchImplementation?: FetchLike;
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
    this.requestOptions = normalizeOpenAICompatibleRequestOptions(config.requestOptions);
    this.fetchImplementation = config.fetch;
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
      requestOptions: this.requestOptions,
      providerRuntimeConfig
    });
    const providerSecretValues = collectProviderSecretValues({
      apiKey: effectiveConfig.apiKey,
      customHeaders: effectiveConfig.headers
    });
    const payload = redactOpenAICompatibleSecrets(
      await completeOpenAICompatibleRequest({
        config: {
          baseUrl: effectiveConfig.baseUrl,
          apiKey: effectiveConfig.apiKey,
          model: effectiveConfig.model,
          endpointPath: effectiveConfig.endpointPath,
          headers: effectiveConfig.headers,
          timeoutMs: effectiveConfig.timeoutMs,
          requestOptions: effectiveConfig.requestOptions,
          ...(this.fetchImplementation ? { fetch: this.fetchImplementation } : {})
        },
        messages: createChatCompletionMessages(input, context)
      }),
      providerSecretValues
    );

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
}

function resolveEffectiveConfig(input: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  endpointPath: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  requestOptions: OpenAICompatibleRequestOptions;
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

  return {
    baseUrl,
    apiKey: input.providerRuntimeConfig?.apiKey ?? input.apiKey,
    model,
    endpointPath: input.providerRuntimeConfig?.endpointPath ?? input.endpointPath,
    headers: input.headers,
    timeoutMs: input.providerRuntimeConfig?.timeoutMs ?? input.timeoutMs,
    requestOptions: normalizeOpenAICompatibleRequestOptions({
      ...input.requestOptions,
      ...(input.providerRuntimeConfig?.requestOptions ?? {})
    })
  };
}

function createChatCompletionMessages(
  input: ParticipantAdapterInput,
  context: ParticipantAdapterContext
): OpenAICompatibleChatMessage[] {
  const messages: OpenAICompatibleChatMessage[] = [];

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

  return messages;
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

function collectProviderSecretValues(input: {
  apiKey?: string;
  customHeaders: Record<string, string>;
}): string[] {
  return collectOpenAICompatibleProviderSecretValues(input);
}
