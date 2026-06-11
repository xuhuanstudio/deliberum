import {
  completeOpenAICompatibleRequest,
  type FetchLike,
  type OpenAICompatibleChatMessage,
  type OpenAICompatibleRequestOptions
} from "@deliberum/adapters";
import {
  ExtractionGeneratorResultSchema,
  type ExtractionContext,
  type ExtractionGenerator,
  type ExtractionGeneratorInput,
  type ExtractionGeneratorResult,
  type ExtractionRunErrorCategory,
  type ProviderRuntimeConfig,
  type RunSafeDiagnostics,
  type RunSafeProviderResponseShape
} from "@deliberum/orchestrator";

export const OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID =
  "openai-compatible-extractor" as const;

export type OpenAICompatibleExtractionGeneratorConfig = {
  generatorId?: string;
  adapterId: string;
  providerConfigId: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  endpointPath?: string;
  timeoutMs?: number;
  requestOptions?: OpenAICompatibleRequestOptions;
  fetch?: FetchLike;
};

export class OpenAICompatibleExtractionGeneratorError extends Error {
  readonly safeCategory: ExtractionRunErrorCategory;
  readonly safeDiagnostics?: RunSafeDiagnostics;

  constructor(
    message: string,
    safeCategory: ExtractionRunErrorCategory,
    safeDiagnostics: RunSafeDiagnostics = {}
  ) {
    super(message);
    this.name = "OpenAICompatibleExtractionGeneratorError";
    this.safeCategory = safeCategory;
    this.safeDiagnostics = Object.keys(safeDiagnostics).length > 0
      ? { ...safeDiagnostics }
      : undefined;
  }
}

export class OpenAICompatibleExtractionGenerator implements ExtractionGenerator {
  readonly generatorId: string;
  readonly adapterId: string;
  readonly providerConfigId: string;
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly model?: string;
  private readonly endpointPath?: string;
  private readonly timeoutMs?: number;
  private readonly requestOptions?: OpenAICompatibleRequestOptions;
  private readonly fetch?: FetchLike;

  constructor(config: OpenAICompatibleExtractionGeneratorConfig) {
    this.generatorId = config.generatorId ?? OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID;
    this.adapterId = config.adapterId;
    this.providerConfigId = config.providerConfigId;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.endpointPath = config.endpointPath;
    this.timeoutMs = config.timeoutMs;
    this.requestOptions = config.requestOptions;
    this.fetch = config.fetch;
  }

  async generateExtractionProposal(
    _input: ExtractionGeneratorInput,
    context: ExtractionContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
  ): Promise<ExtractionGeneratorResult> {
    const content = await this.completeExtractionRequest(context, providerRuntimeConfig);

    try {
      return parseExtractionOutput(content);
    } catch (error) {
      if (!isRetryableMalformedExtractionError(error)) {
        throw error;
      }
    }

    const retryContent = await this.completeExtractionRequest(
      context,
      providerRuntimeConfig,
      true
    );

    return parseExtractionOutput(retryContent);
  }

  private async completeExtractionRequest(
    context: ExtractionContext,
    providerRuntimeConfig: ProviderRuntimeConfig | undefined,
    isCorrectiveRetry = false
  ): Promise<string> {
    return completeOpenAICompatibleRequest({
      config: {
        baseUrl: providerRuntimeConfig?.baseUrl ?? this.baseUrl,
        apiKey: providerRuntimeConfig?.apiKey ?? this.apiKey,
        model: providerRuntimeConfig?.modelId ?? this.model,
        endpointPath: providerRuntimeConfig?.endpointPath ?? this.endpointPath,
        timeoutMs: providerRuntimeConfig?.timeoutMs ?? this.timeoutMs,
        requestOptions: {
          ...(this.requestOptions ?? {}),
          ...(providerRuntimeConfig?.requestOptions ?? {})
        },
        ...(this.fetch ? { fetch: this.fetch } : {})
      },
      messages: createExtractionMessages(context, isCorrectiveRetry)
    });
  }
}

function createExtractionMessages(
  context: ExtractionContext,
  isCorrectiveRetry: boolean
): OpenAICompatibleChatMessage[] {
  const messages: OpenAICompatibleChatMessage[] = [
    {
      role: "system",
      content: createExtractionSystemPrompt()
    },
    {
      role: "user",
      content: createExtractionUserPrompt(context)
    }
  ];

  if (isCorrectiveRetry) {
    messages.push({
      role: "user",
      content: createExtractionCorrectiveRetryPrompt()
    });
  }

  return messages;
}

function createExtractionSystemPrompt(): string {
  return [
    "Prepare Deliberum extraction proposal material only.",
    "Your entire assistant response must be exactly one JSON object.",
    "The first non-whitespace character must be { and the last non-whitespace character must be }.",
    "Do not include prose before or after the JSON object.",
    "Do not include Markdown or code fences.",
    "Do not decide truth, choose an authoritative outcome, or collapse alternatives.",
    "Use only sourceEventIds listed in allowedSourceEventIds.",
    "The JSON object may include candidates, claims, objections, evidenceNeeds, qualityObligations, and must include rationale.",
    "When optional item groups cannot be derived, use empty arrays and include a non-empty rationale explaining the limitation."
  ].join(" ");
}

function createExtractionUserPrompt(context: ExtractionContext): string {
  return JSON.stringify(
    {
      topic: context.topic,
      goals: context.goals,
      constraints: context.constraints,
      output: context.output,
      allowedSourceEventIds: context.metadata.allowedSourceEventIds,
      contributions: context.contributions.map((contribution) => ({
        id: contribution.id,
        participantId: contribution.participantId,
        payload: contribution.payload
      })),
      responseContract: {
        requiredForm: "exactly one JSON object and nothing else",
        firstNonWhitespaceCharacter: "{",
        lastNonWhitespaceCharacter: "}",
        disallowed: [
          "prose before the JSON object",
          "prose after the JSON object",
          "Markdown fences",
          "code fences"
        ],
        fallbackWhenUncertain: {
          candidates: [],
          claims: [],
          objections: [],
          evidenceNeeds: [],
          qualityObligations: [],
          rationale: "non-empty explanation of why optional item groups are empty"
        },
        finalInstruction:
          "Return only the JSON object. The complete assistant response must start with { and end with }."
      },
      outputSchema: {
        candidates: [
          {
            id: "stable-id",
            title: "non-empty string",
            description: "non-empty string",
            sourceEventIds: ["allowed source event id"],
            status: "active",
            supportedBy: ["claim id"],
            attackedBy: ["objection id"],
            qualityObligationIds: ["quality obligation id"],
            assumptions: ["non-empty string"],
            tradeoffs: ["non-empty string"],
            applicableWhen: ["optional non-empty string"]
          }
        ],
        claims: [
          {
            id: "stable-id",
            content: "non-empty string",
            scope: "factual | design | preference | risk | process | definition",
            sourceEventIds: ["allowed source event id"],
            supports: ["optional candidate or claim id"],
            dependsOn: ["optional claim id"],
            challengedBy: ["optional objection id"]
          }
        ],
        objections: [
          {
            id: "stable-id",
            targetId: "candidate or claim id",
            failureMode: "non-empty string",
            consequence: "non-empty string",
            severityClaim: "minor | major | blocking",
            status: "open",
            sourceEventIds: ["allowed source event id"],
            responses: ["optional claim id"]
          }
        ],
        evidenceNeeds: [
          {
            id: "stable-id",
            targetClaimId: "claim id",
            requiredKind: "web | paper | file | code | calculation | human_confirmation | tool",
            reason: "non-empty string",
            priority: "low | medium | high",
            status: "open",
            sourceEventIds: ["allowed source event id"]
          }
        ],
        qualityObligations: [
          {
            id: "stable-id",
            scope: "topic | candidate | branch | final_output",
            targetCandidateId: "optional candidate id",
            requirement: "non-empty string",
            status: "unanswered",
            sourceEventIds: ["allowed source event id"],
            supportingRefIds: ["claim id"],
            unresolvedObjectionIds: ["objection id"]
          }
        ],
        rationale: "required non-empty string"
      }
    },
    null,
    2
  );
}

function createExtractionCorrectiveRetryPrompt(): string {
  return [
    "The previous response was rejected because it was not exactly one JSON object.",
    "Do not include any prose, labels, Markdown, code fences, or explanation.",
    "Return only the JSON object.",
    "The complete assistant response must start with { and end with }."
  ].join(" ");
}

function parseExtractionOutput(content: string): ExtractionGeneratorResult {
  const parsed = parseExtractionJsonObject(content);
  const extraction = ExtractionGeneratorResultSchema.safeParse(parsed);
  if (!extraction.success) {
    throw new OpenAICompatibleExtractionGeneratorError(
      "OpenAI-compatible extraction output did not match the extraction schema.",
      "extraction_output_invalid"
    );
  }

  return extraction.data;
}

function isRetryableMalformedExtractionError(error: unknown): boolean {
  return error instanceof OpenAICompatibleExtractionGeneratorError &&
    error.safeCategory === "provider_malformed_response";
}

function parseExtractionJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const rawJsonObjectSource = extractRawJsonObjectSource(trimmed);

  if (rawJsonObjectSource) {
    return parseJsonObjectSource(rawJsonObjectSource, "invalid_json_object");
  }

  const fencedSource = extractSingleFencedSource(trimmed);
  if (fencedSource !== undefined) {
    const inner = fencedSource.trim();

    if (extractRawJsonObjectSource(inner)) {
      return parseJsonObjectSource(inner, "single_fenced_invalid_json");
    }

    throwMalformedExtractionJson(classifyProviderResponseShape(inner, true));
  }

  throwMalformedExtractionJson(classifyProviderResponseShape(trimmed, false));
}

function parseJsonObjectSource(
  jsonSource: string,
  parseFailureShape: RunSafeProviderResponseShape
): unknown {
  try {
    const parsed = JSON.parse(jsonSource);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }

    return parsed;
  } catch {
    throw new OpenAICompatibleExtractionGeneratorError(
      "OpenAI-compatible extraction output was not valid JSON.",
      "provider_malformed_response",
      {
        providerResponseShape: parseFailureShape
      }
    );
  }
}

function throwMalformedExtractionJson(providerResponseShape: RunSafeProviderResponseShape): never {
  throw new OpenAICompatibleExtractionGeneratorError(
    "OpenAI-compatible extraction output was not a JSON object.",
    "provider_malformed_response",
    {
      providerResponseShape
    }
  );
}

function extractRawJsonObjectSource(trimmedContent: string): string | undefined {
  return trimmedContent.startsWith("{") && trimmedContent.endsWith("}")
    ? trimmedContent
    : undefined;
}

function extractSingleFencedSource(trimmedContent: string): string | undefined {
  const match = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmedContent);

  return match?.[1];
}

function classifyProviderResponseShape(
  trimmedContent: string,
  isSingleFenced: boolean
): RunSafeProviderResponseShape {
  if (trimmedContent.length === 0) {
    return "empty_text";
  }

  const parsedShape = classifyValidJsonNonObjectShape(trimmedContent, isSingleFenced);
  if (parsedShape) {
    return parsedShape;
  }

  if (!isSingleFenced && containsJsonObjectDelimiterPair(trimmedContent)) {
    return "prose_with_json_object";
  }

  if (trimmedContent.startsWith("{") || trimmedContent.endsWith("}")) {
    return isSingleFenced ? "single_fenced_invalid_json" : "invalid_json_object";
  }

  return isSingleFenced ? "single_fenced_other_text" : "other_text";
}

function classifyValidJsonNonObjectShape(
  trimmedContent: string,
  isSingleFenced: boolean
): RunSafeProviderResponseShape | undefined {
  try {
    const parsed = JSON.parse(trimmedContent);

    if (Array.isArray(parsed)) {
      return isSingleFenced ? "single_fenced_json_array" : "json_array";
    }

    if (typeof parsed !== "object" || parsed === null) {
      return isSingleFenced ? "single_fenced_json_non_object" : "json_non_object";
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function containsJsonObjectDelimiterPair(trimmedContent: string): boolean {
  return trimmedContent.includes("{") && trimmedContent.includes("}");
}
