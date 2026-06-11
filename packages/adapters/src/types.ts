import { JsonValueSchema, type JsonValue, type ParticipantCapabilities } from "@deliberum/protocol";

export type { JsonValue, ParticipantCapabilities } from "@deliberum/protocol";

export type AdapterReliability = "high" | "medium" | "low" | "experimental";

export type AdapterCapabilities = {
  input: {
    text: boolean;
    markdown: boolean;
    json: boolean;
    imageUrl: boolean;
    imageBase64: boolean;
    pdfUrl: boolean;
    fileUrl: boolean;
    webBrowsing: boolean;
  };
  output: {
    structuredJson: boolean;
    markdown: boolean;
    streaming: boolean;
    manualPaste: boolean;
  };
  limits: {
    maxPromptChars?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxUrlChars?: number;
    maxResourceSizeBytes?: number;
  };
  reliability: AdapterReliability;
};

export type ContextCompleteness = {
  status: "complete" | "partial" | "unknown";
  notes: string[];
};

export type ParticipantAdapterContext = {
  sessionId: string;
  participantId: string;
  contextCapsuleId?: string;
  instructions?: string;
  sourceEventIds?: string[];
  participantCapabilities?: ParticipantCapabilities;
};

export type ParticipantAdapterInput = {
  instructions?: string;
  payload?: JsonValue;
};

export type ParticipantAdapterProviderRuntimeConfig = {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  endpointPath?: string;
  timeoutMs?: number;
  requestOptions?: OpenAICompatibleRequestOptions;
};

export type OpenAICompatibleTokenParameter =
  | "none"
  | "max_tokens"
  | "max_completion_tokens";

export type OpenAICompatibleRequestOptions = {
  tokenParameter?: OpenAICompatibleTokenParameter;
  maxCompletionTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: false;
  frequencyPenalty?: number;
  presencePenalty?: number;
  thinking?: "disabled";
  responseFormat?: "json_object";
};

export type ParticipantAdapterSafeErrorCategory =
  | "provider_auth_failed"
  | "provider_not_found"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_network_error"
  | "provider_http_error"
  | "provider_malformed_response"
  | "provider_config_invalid"
  | "provider_response_empty"
  | "provider_response_missing_content"
  | "provider_unknown_error";

export type ParticipantAdapterSafeDiagnostics = {
  httpStatus?: number;
  providerResponseShape?:
    | "empty_text"
    | "invalid_json_object"
    | "json_array"
    | "json_non_object"
    | "prose_with_json_object"
    | "single_fenced_invalid_json"
    | "single_fenced_json_array"
    | "single_fenced_json_non_object"
    | "single_fenced_other_text"
    | "other_text";
};

export type ParticipantAdapterResult = {
  payload: JsonValue;
  adapterId: string;
  participantId: string;
  modelId?: string;
  capabilities: AdapterCapabilities;
  contextCompleteness: ContextCompleteness;
  warnings: string[];
};

export interface ParticipantAdapter<TInput extends ParticipantAdapterInput = ParticipantAdapterInput> {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  prepareContribution(
    input: TInput,
    context: ParticipantAdapterContext,
    providerRuntimeConfig?: ParticipantAdapterProviderRuntimeConfig
  ): ParticipantAdapterResult | Promise<ParticipantAdapterResult>;
}

export class AdapterInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterInputError";
  }
}

export const UNKNOWN_CONTEXT_COMPLETENESS: ContextCompleteness = {
  status: "unknown",
  notes: []
};

export function cloneJsonValue(value: JsonValue): JsonValue {
  return structuredClone(validateJsonValue(value));
}

export function validateJsonValue(value: unknown): JsonValue {
  return JsonValueSchema.parse(value);
}

export function cloneCapabilities(capabilities: AdapterCapabilities): AdapterCapabilities {
  return structuredClone(capabilities);
}

export function cloneContextCompleteness(
  contextCompleteness: ContextCompleteness
): ContextCompleteness {
  return structuredClone(contextCompleteness);
}
