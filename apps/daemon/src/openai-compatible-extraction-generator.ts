import {
  completeOpenAICompatibleRequest,
  type FetchLike,
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
  type RunSafeDiagnostics
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
    const content = await completeOpenAICompatibleRequest({
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
      messages: [
        {
          role: "system",
          content: createExtractionSystemPrompt()
        },
        {
          role: "user",
          content: createExtractionUserPrompt(context)
        }
      ]
    });

    return parseExtractionOutput(content);
  }
}

function createExtractionSystemPrompt(): string {
  return [
    "Prepare Deliberum extraction proposal material only.",
    "Return strict JSON only, with no Markdown fences or explanatory prose.",
    "Do not decide truth, choose an authoritative outcome, or collapse alternatives.",
    "Use only sourceEventIds listed in allowedSourceEventIds.",
    "The JSON object may include candidates, claims, objections, evidenceNeeds, qualityObligations, and must include rationale."
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

function parseExtractionOutput(content: string): ExtractionGeneratorResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new OpenAICompatibleExtractionGeneratorError(
      "OpenAI-compatible extraction output was not valid JSON.",
      "provider_malformed_response"
    );
  }

  const extraction = ExtractionGeneratorResultSchema.safeParse(parsed);
  if (!extraction.success) {
    throw new OpenAICompatibleExtractionGeneratorError(
      "OpenAI-compatible extraction output did not match the extraction schema.",
      "extraction_output_invalid"
    );
  }

  return extraction.data;
}
