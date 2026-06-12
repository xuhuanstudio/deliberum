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
  cloneContextCompleteness,
  validateJsonValue
} from "./types";

export type HttpTemplateMethod = "GET" | "POST" | "PUT" | "PATCH";

export type HttpTemplateFetchInit = {
  method: HttpTemplateMethod;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

export type HttpTemplateFetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

export type HttpTemplateFetchLike = (
  url: string,
  init: HttpTemplateFetchInit
) => Promise<HttpTemplateFetchResponse>;

export type HttpTemplateRequestConfig = {
  method?: HttpTemplateMethod;
  url?: string;
  baseUrl?: string;
  endpointPath?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

export type HttpTemplateResponseConfig = {
  format?: "text" | "json";
  payloadPath?: string;
  modelIdPath?: string;
};

export type HttpTemplateParticipantAdapterConfig = {
  adapterId?: string;
  request: HttpTemplateRequestConfig;
  response?: HttpTemplateResponseConfig;
  fetch?: HttpTemplateFetchLike;
  capabilities?: AdapterCapabilities;
  contextCompleteness?: ContextCompleteness;
  warnings?: string[];
};

type RenderContext = {
  input: ParticipantAdapterInput;
  participantContext: ParticipantAdapterContext;
  runtimeConfig?: ParticipantAdapterProviderRuntimeConfig;
};

type EffectiveHttpTemplateRequest = {
  method: HttpTemplateMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

export const HTTP_TEMPLATE_PARTICIPANT_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  input: {
    text: true,
    markdown: true,
    json: true,
    imageUrl: true,
    imageBase64: true,
    pdfUrl: true,
    fileUrl: true,
    webBrowsing: false
  },
  output: {
    structuredJson: true,
    markdown: true,
    streaming: false,
    manualPaste: false
  },
  limits: {},
  reliability: "medium"
};

export class HttpTemplateAdapterError extends Error {
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
    this.name = "HttpTemplateAdapterError";
    this.safeCategory = safeCategory;
    this.safeDiagnostics = Object.keys(safeDiagnostics).length > 0
      ? { ...safeDiagnostics }
      : undefined;
    this.httpStatus = safeDiagnostics.httpStatus;
    this.status = safeDiagnostics.httpStatus;
  }
}

export class HttpTemplateParticipantAdapter implements ParticipantAdapter {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  private readonly request: HttpTemplateRequestConfig;
  private readonly response: HttpTemplateResponseConfig;
  private readonly fetchImplementation?: HttpTemplateFetchLike;
  private readonly contextCompleteness: ContextCompleteness;
  private readonly warnings: string[];

  constructor(config: HttpTemplateParticipantAdapterConfig) {
    validateRequestTemplate(config.request);

    this.adapterId = config.adapterId ?? "http-template";
    this.request = {
      ...config.request,
      headers: { ...(config.request.headers ?? {}) }
    };
    this.response = { ...(config.response ?? {}) };
    this.fetchImplementation = config.fetch;
    this.capabilities = cloneCapabilities(
      config.capabilities ?? HTTP_TEMPLATE_PARTICIPANT_ADAPTER_CAPABILITIES
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
    assertHttpTemplateInput(input);

    const renderContext = {
      input,
      participantContext: context,
      runtimeConfig: providerRuntimeConfig
    };
    const request = resolveEffectiveRequest(this.request, renderContext);
    const secretValues = collectSecretValues(request, providerRuntimeConfig);
    const responseText = redactSecrets(
      await performHttpTemplateRequest({
        request,
        fetchImplementation: this.fetchImplementation
      }),
      secretValues
    );
    const payload = extractPayload(responseText, this.response, secretValues);
    const modelId = resolveModelId(responseText, this.response, providerRuntimeConfig, secretValues);

    return {
      payload,
      adapterId: this.adapterId,
      participantId: context.participantId,
      ...(modelId ? { modelId } : {}),
      capabilities: cloneCapabilities(this.capabilities),
      contextCompleteness: cloneContextCompleteness(this.contextCompleteness),
      warnings: [...this.warnings]
    };
  }
}

function assertHttpTemplateInput(input: ParticipantAdapterInput): void {
  if (input.instructions === undefined && input.payload === undefined) {
    throw new AdapterInputError("HTTP-template adapter input requires instructions or payload.");
  }
}

function validateRequestTemplate(request: HttpTemplateRequestConfig): void {
  const method = request.method ?? "POST";

  if (!["GET", "POST", "PUT", "PATCH"].includes(method)) {
    throwInvalidConfig("HTTP-template request method is unsupported.");
  }

  if (!request.url && !request.baseUrl) {
    throwInvalidConfig("HTTP-template request requires url or baseUrl.");
  }

  if (request.timeoutMs !== undefined && !isPositiveFiniteNumber(request.timeoutMs)) {
    throwInvalidConfig("HTTP-template timeoutMs must be a positive finite number.");
  }

  if (request.url && !hasTemplatePlaceholder(request.url)) {
    assertSafeHttpUrl(request.url);
  }

  if (
    request.baseUrl &&
    !hasTemplatePlaceholder(request.baseUrl) &&
    !hasTemplatePlaceholder(request.endpointPath ?? "")
  ) {
    assertSafeHttpUrl(joinUrl(request.baseUrl, request.endpointPath ?? ""));
  }

  if (method === "GET" && request.body !== undefined) {
    throwInvalidConfig("HTTP-template GET requests must not define a body template.");
  }

  for (const [headerName, headerValue] of Object.entries(request.headers ?? {})) {
    if (headerName.trim().length === 0) {
      throwInvalidConfig("HTTP-template header names must not be empty.");
    }

    if (headerName.toLowerCase() === "authorization" && !hasTemplatePlaceholder(headerValue)) {
      throwInvalidConfig("HTTP-template Authorization headers must use runtime placeholders.");
    }

    if (containsInlineSecret(headerValue)) {
      throwInvalidConfig("HTTP-template header values must not contain inline secrets.");
    }
  }
}

function resolveEffectiveRequest(
  request: HttpTemplateRequestConfig,
  context: RenderContext
): EffectiveHttpTemplateRequest {
  const method = request.method ?? "POST";
  const url = request.url
    ? renderTemplate(request.url, context)
    : joinUrl(
        renderTemplate(
          context.runtimeConfig?.baseUrl ?? request.baseUrl ?? "",
          context
        ),
        renderTemplate(
          context.runtimeConfig?.endpointPath ?? request.endpointPath ?? "",
          context
        )
      );
  const renderedUrl = assertSafeHttpUrl(url);
  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).map(([headerName, headerValue]) => [
      headerName,
      renderTemplate(headerValue, context)
    ])
  );
  const body = request.body === undefined
    ? undefined
    : renderTemplate(request.body, context);

  if (body !== undefined && !hasHeader(headers, "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  return {
    method,
    url: renderedUrl,
    headers,
    ...(body !== undefined ? { body } : {}),
    timeoutMs: context.runtimeConfig?.timeoutMs ?? request.timeoutMs
  };
}

async function performHttpTemplateRequest(input: {
  request: EffectiveHttpTemplateRequest;
  fetchImplementation?: HttpTemplateFetchLike;
}): Promise<string> {
  const fetchImplementation = input.fetchImplementation ?? getDefaultFetch();
  const controller = input.request.timeoutMs ? new AbortController() : undefined;
  const timeout = controller
    ? setTimeout(() => controller.abort(), input.request.timeoutMs)
    : undefined;

  try {
    const response = await fetchImplementation(input.request.url, {
      method: input.request.method,
      headers: input.request.headers,
      ...(input.request.body !== undefined ? { body: input.request.body } : {}),
      ...(controller ? { signal: controller.signal } : {})
    });

    if (!response.ok) {
      throw new HttpTemplateAdapterError(
        "HTTP-template provider request failed.",
        mapHttpStatusToSafeCategory(response.status),
        { httpStatus: response.status }
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof HttpTemplateAdapterError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new HttpTemplateAdapterError(
        "HTTP-template provider request timed out.",
        "provider_timeout"
      );
    }

    throw new HttpTemplateAdapterError(
      "HTTP-template provider request failed.",
      "provider_network_error"
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function extractPayload(
  responseText: string,
  response: HttpTemplateResponseConfig,
  secretValues: readonly string[]
): JsonValue {
  if ((response.format ?? "text") === "text") {
    if (responseText.length === 0) {
      throw new HttpTemplateAdapterError(
        "HTTP-template provider response was empty.",
        "provider_response_empty",
        { providerResponseShape: "empty_text" }
      );
    }

    return responseText;
  }

  const parsed = parseJsonResponse(responseText);
  const payload = response.payloadPath
    ? readPath(parsed, response.payloadPath)
    : parsed;

  if (payload === undefined) {
    throw new HttpTemplateAdapterError(
      "HTTP-template provider response did not contain the configured payload path.",
      "provider_response_missing_content"
    );
  }

  return redactSecretsFromJsonValue(validateJsonValue(payload), secretValues);
}

function resolveModelId(
  responseText: string,
  response: HttpTemplateResponseConfig,
  runtimeConfig: ParticipantAdapterProviderRuntimeConfig | undefined,
  secretValues: readonly string[]
): string | undefined {
  if (response.modelIdPath) {
    const parsed = parseJsonResponse(responseText);
    const modelId = readPath(parsed, response.modelIdPath);

    if (typeof modelId === "string" && modelId.length > 0) {
      return redactSecrets(modelId, secretValues);
    }
  }

  return runtimeConfig?.modelId;
}

function parseJsonResponse(responseText: string): unknown {
  try {
    return JSON.parse(responseText);
  } catch {
    throw new HttpTemplateAdapterError(
      "HTTP-template provider response was not valid JSON.",
      "provider_malformed_response",
      { providerResponseShape: "other_text" }
    );
  }
}

function renderTemplate(template: string, context: RenderContext): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, path: string) => {
    const value = resolveTemplateValue(path, context);

    if (value === undefined) {
      throwInvalidConfig(`HTTP-template variable is not available: ${path}`);
    }

    return stringifyTemplateValue(value);
  });
}

function resolveTemplateValue(path: string, context: RenderContext): JsonValue | undefined {
  const payload = context.input.payload;
  const runtimeVariables = context.runtimeConfig?.httpTemplate?.variables ?? {};

  if (path === "input.instructions") {
    return context.input.instructions ?? "";
  }

  if (path === "input.payload" || path === "input.payloadText") {
    return payload === undefined ? "" : renderPayloadText(payload);
  }

  if (path === "input.payloadJson") {
    return payload === undefined ? "" : JSON.stringify(payload, null, 2);
  }

  if (path === "context.instructions") {
    return context.participantContext.instructions ?? "";
  }

  if (path === "context.sessionId") {
    return context.participantContext.sessionId;
  }

  if (path === "context.participantId") {
    return context.participantContext.participantId;
  }

  if (path === "context.contextCapsuleId") {
    return context.participantContext.contextCapsuleId ?? "";
  }

  if (path === "context.sourceEventIdsJson") {
    return JSON.stringify(context.participantContext.sourceEventIds ?? []);
  }

  if (path === "runtime.apiKey") {
    return context.runtimeConfig?.apiKey ?? "";
  }

  if (path === "runtime.baseUrl") {
    return context.runtimeConfig?.baseUrl ?? "";
  }

  if (path === "runtime.endpointPath") {
    return context.runtimeConfig?.endpointPath ?? "";
  }

  if (path === "runtime.modelId") {
    return context.runtimeConfig?.modelId ?? "";
  }

  if (path.startsWith("var.")) {
    return runtimeVariables[path.slice("var.".length)];
  }

  return undefined;
}

function stringifyTemplateValue(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function renderPayloadText(payload: JsonValue): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

function readPath(value: unknown, path: string): unknown {
  if (path.trim().length === 0) {
    return value;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      segment in current
    ) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, value);
}

function joinUrl(baseUrl: string, endpointPath: string): string {
  if (!baseUrl) {
    throwInvalidConfig("HTTP-template baseUrl is required.");
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(endpointPath)) {
    throwInvalidConfig("HTTP-template endpointPath must be relative to baseUrl.");
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = endpointPath.replace(/^\/+/, "");

  return normalizedPath.length > 0
    ? `${normalizedBase}/${normalizedPath}`
    : normalizedBase;
}

function assertSafeHttpUrl(url: string): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throwInvalidConfig("HTTP-template request URL is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throwInvalidConfig("HTTP-template request URL must use http or https.");
  }

  if (parsed.username || parsed.password) {
    throwInvalidConfig("HTTP-template request URL must not contain credentials.");
  }

  return parsed.toString();
}

function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  return Object.keys(headers).some((candidate) => candidate.toLowerCase() === headerName);
}

function hasTemplatePlaceholder(value: string): boolean {
  return /\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/.test(value);
}

function isPositiveFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function containsInlineSecret(value: string): boolean {
  const withoutPlaceholders = value.replace(/\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/g, "");

  return /\b(sk-[a-z0-9_-]{8,}|api[_-]?key\s*[:=]\s*\S{4,}|secret\s*[:=]\s*\S{4,}|bearer\s+\S{8,})/i.test(
    withoutPlaceholders
  );
}

function collectSecretValues(
  request: EffectiveHttpTemplateRequest,
  runtimeConfig: ParticipantAdapterProviderRuntimeConfig | undefined
): string[] {
  const runtimeSecretVariables = Object.entries(runtimeConfig?.httpTemplate?.variables ?? {})
    .filter(([key]) => isSecretLikeKey(key))
    .map(([_key, value]) => stringifyTemplateValue(value));

  return [
    runtimeConfig?.apiKey,
    runtimeConfig?.apiKey ? `Bearer ${runtimeConfig.apiKey}` : undefined,
    ...Object.values(request.headers).filter((value) => isSecretLikeValue(value)),
    ...runtimeSecretVariables
  ].filter((value): value is string => Boolean(value));
}

function redactSecretsFromJsonValue(value: JsonValue, secretValues: readonly string[]): JsonValue {
  if (typeof value === "string") {
    return redactSecrets(value, secretValues);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsFromJsonValue(item, secretValues));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactSecretsFromJsonValue(entry, secretValues)
      ])
    );
  }

  return value;
}

function redactSecrets(value: string, secretValues: readonly string[]): string {
  let redacted = value;

  for (const secretValue of [...secretValues].sort((left, right) => right.length - left.length)) {
    if (secretValue.length > 0) {
      redacted = redacted.split(secretValue).join("[REDACTED]");
    }
  }

  return redacted;
}

function isSecretLikeKey(key: string): boolean {
  return /api[_-]?key|secret|token|authorization|password|bearer/i.test(key);
}

function isSecretLikeValue(value: string): boolean {
  return /^(bearer\s+|sk-|token\s+|key\s+)/i.test(value);
}

function mapHttpStatusToSafeCategory(status: number): ParticipantAdapterSafeErrorCategory {
  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }

  if (status === 404) {
    return "provider_not_found";
  }

  if (status === 408 || status === 504) {
    return "provider_timeout";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  return "provider_http_error";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function getDefaultFetch(): HttpTemplateFetchLike {
  if (typeof fetch !== "function") {
    throw new HttpTemplateAdapterError(
      "HTTP-template adapter fetch implementation is unavailable.",
      "provider_config_invalid"
    );
  }

  return async (url, init) => {
    const response = await fetch(url, init);

    return {
      ok: response.ok,
      status: response.status,
      text: () => response.text()
    };
  };
}

function throwInvalidConfig(message: string): never {
  throw new HttpTemplateAdapterError(message, "provider_config_invalid");
}
