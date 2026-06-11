import {
  completeOpenAICompatibleRequest,
  type OpenAICompatibleChatMessage,
  type OpenAICompatibleChatRequestConfig
} from "@deliberum/adapters";
import type {
  RunSafeDiagnostics,
  RunSafeProviderResponseShape
} from "@deliberum/orchestrator";

export type OpenAICompatibleStructuredGeneratorErrorLike<TCategory extends string> =
  Error & {
    safeCategory: TCategory;
    safeDiagnostics?: RunSafeDiagnostics;
  };

export class OpenAICompatibleStructuredGeneratorError<
  TCategory extends string = string
> extends Error {
  readonly safeCategory: TCategory;
  readonly safeDiagnostics?: RunSafeDiagnostics;

  constructor(
    message: string,
    safeCategory: TCategory,
    safeDiagnostics: RunSafeDiagnostics = {}
  ) {
    super(message);
    this.name = "OpenAICompatibleStructuredGeneratorError";
    this.safeCategory = safeCategory;
    this.safeDiagnostics = Object.keys(safeDiagnostics).length > 0
      ? { ...safeDiagnostics }
      : undefined;
  }
}

export type CompleteOpenAICompatibleStructuredJsonObjectInput<TCategory extends string> = {
  config: OpenAICompatibleChatRequestConfig;
  messages: readonly OpenAICompatibleChatMessage[];
  malformedResponseCategory: TCategory;
  createError?: (
    message: string,
    safeCategory: TCategory,
    safeDiagnostics?: RunSafeDiagnostics
  ) => OpenAICompatibleStructuredGeneratorErrorLike<TCategory>;
  outputDescription?: string;
  correctiveRetryPrompt?: string;
};

const DEFAULT_CORRECTIVE_RETRY_PROMPT = [
  "The previous response was rejected because it was not exactly one JSON object.",
  "Do not include any prose, labels, Markdown, code fences, or explanation.",
  "Return only the JSON object.",
  "The complete assistant response must start with { and end with }."
].join(" ");

export async function completeOpenAICompatibleStructuredJsonObject<
  TCategory extends string
>(
  input: CompleteOpenAICompatibleStructuredJsonObjectInput<TCategory>
): Promise<unknown> {
  const content = await completeOpenAICompatibleRequest({
    config: input.config,
    messages: input.messages
  });

  try {
    return parseStructuredJsonObject(
      content,
      input.malformedResponseCategory,
      input.outputDescription ?? "structured output",
      input.createError
    );
  } catch (error) {
    if (!isRetryableMalformedResponse(error, input.malformedResponseCategory)) {
      throw error;
    }
  }

  const retryContent = await completeOpenAICompatibleRequest({
    config: input.config,
    messages: [
      ...input.messages,
      {
        role: "user",
        content: input.correctiveRetryPrompt ?? DEFAULT_CORRECTIVE_RETRY_PROMPT
      }
    ]
  });

  return parseStructuredJsonObject(
    retryContent,
    input.malformedResponseCategory,
    input.outputDescription ?? "structured output",
    input.createError
  );
}

function parseStructuredJsonObject<TCategory extends string>(
  content: string,
  malformedResponseCategory: TCategory,
  outputDescription: string,
  createError:
    | CompleteOpenAICompatibleStructuredJsonObjectInput<TCategory>["createError"]
    | undefined
): unknown {
  const trimmed = content.trim();
  const rawJsonObjectSource = extractRawJsonObjectSource(trimmed);

  if (rawJsonObjectSource) {
    return parseJsonObjectSource(
      rawJsonObjectSource,
      "invalid_json_object",
      malformedResponseCategory,
      outputDescription,
      createError
    );
  }

  const fencedSource = extractSingleFencedSource(trimmed);
  if (fencedSource !== undefined) {
    const inner = fencedSource.trim();

    if (extractRawJsonObjectSource(inner)) {
      return parseJsonObjectSource(
        inner,
        "single_fenced_invalid_json",
        malformedResponseCategory,
        outputDescription,
        createError
      );
    }

    throw createStructuredGeneratorError(
      `OpenAI-compatible ${outputDescription} was not a JSON object.`,
      malformedResponseCategory,
      {
        providerResponseShape: classifyProviderResponseShape(inner, true)
      },
      createError
    );
  }

  throw createStructuredGeneratorError(
    `OpenAI-compatible ${outputDescription} was not a JSON object.`,
    malformedResponseCategory,
    {
      providerResponseShape: classifyProviderResponseShape(trimmed, false)
    },
    createError
  );
}

function parseJsonObjectSource<TCategory extends string>(
  jsonSource: string,
  parseFailureShape: RunSafeProviderResponseShape,
  malformedResponseCategory: TCategory,
  outputDescription: string,
  createError:
    | CompleteOpenAICompatibleStructuredJsonObjectInput<TCategory>["createError"]
    | undefined
): unknown {
  try {
    const parsed = JSON.parse(jsonSource);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }

    return parsed;
  } catch {
    throw createStructuredGeneratorError(
      `OpenAI-compatible ${outputDescription} was not valid JSON.`,
      malformedResponseCategory,
      {
        providerResponseShape: parseFailureShape
      },
      createError
    );
  }
}

function createStructuredGeneratorError<TCategory extends string>(
  message: string,
  safeCategory: TCategory,
  safeDiagnostics: RunSafeDiagnostics,
  createError:
    | CompleteOpenAICompatibleStructuredJsonObjectInput<TCategory>["createError"]
    | undefined
): OpenAICompatibleStructuredGeneratorErrorLike<TCategory> {
  return createError
    ? createError(message, safeCategory, safeDiagnostics)
    : new OpenAICompatibleStructuredGeneratorError(message, safeCategory, safeDiagnostics);
}

function isRetryableMalformedResponse<TCategory extends string>(
  error: unknown,
  malformedResponseCategory: TCategory
): boolean {
  return typeof error === "object" &&
    error !== null &&
    (error as { safeCategory?: unknown }).safeCategory === malformedResponseCategory;
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
