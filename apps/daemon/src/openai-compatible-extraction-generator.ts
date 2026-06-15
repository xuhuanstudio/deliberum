import {
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
  type RunSafeDiagnostics
} from "@deliberum/orchestrator";
import { completeOpenAICompatibleStructuredJsonObject } from "./openai-compatible-structured-generator";

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
    const messages = createExtractionMessages(context);
    const completionConfig = {
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
    };
    const parsed = await completeOpenAICompatibleStructuredJsonObject<ExtractionRunErrorCategory>({
      config: completionConfig,
      messages,
      malformedResponseCategory: "provider_malformed_response",
      outputDescription: "extraction output",
      createError: (message, safeCategory, safeDiagnostics) =>
        new OpenAICompatibleExtractionGeneratorError(message, safeCategory, safeDiagnostics)
    });

    const extraction = ExtractionGeneratorResultSchema.safeParse(parsed);
    if (extraction.success) {
      return extraction.data;
    }

    const retryParsed = await completeOpenAICompatibleStructuredJsonObject<ExtractionRunErrorCategory>({
      config: completionConfig,
      messages: [
        ...messages,
        {
          role: "user",
          content: createExtractionSchemaRetryPrompt()
        }
      ],
      malformedResponseCategory: "provider_malformed_response",
      outputDescription: "extraction schema repair output",
      createError: (message, safeCategory, safeDiagnostics) =>
        new OpenAICompatibleExtractionGeneratorError(message, safeCategory, safeDiagnostics)
    });

    try {
      return parseExtractionOutput(retryParsed);
    } catch (error) {
      if (
        isExtractionSchemaError(error) &&
        completionConfig.requestOptions.responseFormat === "json_object"
      ) {
        return createFallbackExtractionResult(context);
      }

      throw error;
    }
  }
}

function createExtractionMessages(context: ExtractionContext): OpenAICompatibleChatMessage[] {
  return [
    {
      role: "system",
      content: createExtractionSystemPrompt()
    },
    {
      role: "user",
      content: createExtractionUserPrompt(context)
    }
  ];
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

function createExtractionSchemaRetryPrompt(): string {
  return [
    "The previous JSON object was rejected because it did not match the Deliberum extraction schema.",
    "Do not repeat the rejected object.",
    "Return a corrected JSON object with only candidates, claims, objections, evidenceNeeds, qualityObligations, and rationale.",
    "Every included item must satisfy the field names, enum values, non-empty string requirements, and allowedSourceEventIds from the original request.",
    "If a group cannot be derived safely, use an empty array for that group.",
    "The rationale field is required and must be a non-empty string.",
    "Return only the corrected JSON object. Do not include prose, labels, Markdown, code fences, or explanation."
  ].join(" ");
}

function parseExtractionOutput(parsed: unknown): ExtractionGeneratorResult {
  const extraction = ExtractionGeneratorResultSchema.safeParse(parsed);
  if (!extraction.success) {
    throw new OpenAICompatibleExtractionGeneratorError(
      "OpenAI-compatible extraction output did not match the extraction schema.",
      "extraction_output_invalid"
    );
  }

  return extraction.data;
}

function isExtractionSchemaError(error: unknown): boolean {
  return error instanceof OpenAICompatibleExtractionGeneratorError &&
    error.safeCategory === "extraction_output_invalid";
}

function createFallbackExtractionResult(context: ExtractionContext): ExtractionGeneratorResult {
  const allowedSourceEventIdSet = new Set(context.metadata.allowedSourceEventIds);
  const traceableContributions = context.contributions.filter((contribution) =>
    allowedSourceEventIdSet.has(contribution.id)
  );
  const sourceEventIds = traceableContributions.map((contribution) => contribution.id);

  if (sourceEventIds.length === 0) {
    throw new OpenAICompatibleExtractionGeneratorError(
      "OpenAI-compatible extraction fallback could not find traceable source contributions.",
      "extraction_output_invalid"
    );
  }

  const firstSourceEventId = sourceEventIds[0]!;
  const claims = traceableContributions.map((contribution, index) => {
    const claimId = `fallback-claim-${index + 1}`;

    return {
      id: claimId,
      content: [
        `${formatParticipantLabel(contribution.participantId)} contributed an independent first response that should be reviewed before relying on the conclusion.`,
        `Summary: ${summarizeContributionPayload(contribution.payload)}`
      ].join(" "),
      scope: "process" as const,
      sourceEventIds: [contribution.id],
      supports: ["fallback-candidate-1"]
    };
  });
  const claimIds = claims.map((claim) => claim.id);
  const firstClaimId = claimIds[0]!;

  return {
    candidates: [
      {
        id: "fallback-candidate-1",
        title: "Review the independent first responses before deciding",
        description:
          "Use the revealed participant responses as provisional discussion material, then verify missing evidence, disagreements, and risks before relying on a conclusion.",
        sourceEventIds,
        status: "active",
        supportedBy: claimIds,
        attackedBy: ["fallback-objection-1"],
        qualityObligationIds: ["fallback-quality-1"],
        assumptions: [
          "The provider returned JSON that could not be used as structured organizer output."
        ],
        tradeoffs: [
          "This fallback keeps the discussion moving, but it is less specific than a successful structured organizer pass."
        ],
        applicableWhen: [
          "Use when model-backed first responses are available but organizer extraction needs recovery."
        ]
      }
    ],
    claims,
    objections: [
      {
        id: "fallback-objection-1",
        targetId: "fallback-candidate-1",
        failureMode: "Structured organizer output was invalid.",
        consequence:
          "The current conclusion must remain provisional until the participant responses are checked against evidence and open disagreements.",
        severityClaim: "major",
        status: "open",
        sourceEventIds,
        responses: []
      }
    ],
    evidenceNeeds: [
      {
        id: "fallback-evidence-1",
        targetClaimId: firstClaimId,
        requiredKind: "human_confirmation",
        reason:
          "A human should confirm that the fallback interpretation reflects the revealed participant responses before relying on the conclusion.",
        priority: "high",
        status: "open",
        sourceEventIds: [firstSourceEventId]
      }
    ],
    qualityObligations: [
      {
        id: "fallback-quality-1",
        scope: "final_output",
        requirement:
          "State that the organizer used a conservative fallback and keep the conclusion provisional until evidence and disagreements are reviewed.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: claimIds,
        unresolvedObjectionIds: ["fallback-objection-1"]
      }
    ],
    rationale:
      "The provider did not return schema-valid organizer output after a structured retry, so Deliberum preserved the user path with a traceable, conservative extraction fallback grounded in revealed first responses."
  };
}

function formatParticipantLabel(participantId: string): string {
  if (participantId.endsWith("-a")) {
    return "Perspective A";
  }

  if (participantId.endsWith("-b")) {
    return "Perspective B";
  }

  if (participantId.endsWith("-c")) {
    return "Perspective C";
  }

  return participantId;
}

function summarizeContributionPayload(payload: unknown): string {
  const content = readStringProperty(payload, "content") ??
    (typeof payload === "string" ? payload : undefined) ??
    JSON.stringify(payload);
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) {
    return "The response was present but did not include readable text.";
  }

  return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized;
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" ? entry : undefined;
}
