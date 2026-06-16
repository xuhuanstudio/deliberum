import {
  type FetchLike,
  type OpenAICompatibleChatMessage,
  type OpenAICompatibleRequestOptions
} from "@deliberum/adapters";
import {
  ProposalReviewGeneratorResultSchema,
  type ProposalReviewContext,
  type ProposalReviewGenerator,
  type ProposalReviewGeneratorInput,
  type ProposalReviewGeneratorResult,
  type ProposalReviewRunErrorCategory,
  type ProviderRuntimeConfig,
  type RunSafeDiagnostics
} from "@deliberum/orchestrator";
import { completeOpenAICompatibleStructuredJsonObject } from "./openai-compatible-structured-generator";

export const OPENAI_COMPATIBLE_REVIEWER_ID = "openai-compatible-reviewer" as const;

export type OpenAICompatibleReviewGeneratorConfig = {
  reviewerId?: string;
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

export class OpenAICompatibleReviewGeneratorError extends Error {
  readonly safeCategory: ProposalReviewRunErrorCategory;
  readonly safeDiagnostics?: RunSafeDiagnostics;

  constructor(
    message: string,
    safeCategory: ProposalReviewRunErrorCategory,
    safeDiagnostics: RunSafeDiagnostics = {}
  ) {
    super(message);
    this.name = "OpenAICompatibleReviewGeneratorError";
    this.safeCategory = safeCategory;
    this.safeDiagnostics = Object.keys(safeDiagnostics).length > 0
      ? { ...safeDiagnostics }
      : undefined;
  }
}

export class OpenAICompatibleReviewGenerator implements ProposalReviewGenerator {
  readonly reviewerId: string;
  readonly adapterId: string;
  readonly providerConfigId: string;
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly model?: string;
  private readonly endpointPath?: string;
  private readonly timeoutMs?: number;
  private readonly requestOptions?: OpenAICompatibleRequestOptions;
  private readonly fetch?: FetchLike;

  constructor(config: OpenAICompatibleReviewGeneratorConfig) {
    this.reviewerId = config.reviewerId ?? OPENAI_COMPATIBLE_REVIEWER_ID;
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

  async reviewProposals(
    _input: ProposalReviewGeneratorInput,
    context: ProposalReviewContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
  ): Promise<ProposalReviewGeneratorResult> {
    const parsed = await completeOpenAICompatibleStructuredJsonObject<ProposalReviewRunErrorCategory>({
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
      messages: createReviewMessages(context),
      malformedResponseCategory: "provider_malformed_response",
      outputDescription: "proposal review output",
      createError: (message, safeCategory, safeDiagnostics) =>
        new OpenAICompatibleReviewGeneratorError(message, safeCategory, safeDiagnostics)
    });

    return parseReviewOutput(parsed);
  }
}

function createReviewMessages(context: ProposalReviewContext): OpenAICompatibleChatMessage[] {
  return [
    {
      role: "system",
      content: createReviewSystemPrompt()
    },
    {
      role: "user",
      content: createReviewUserPrompt(context)
    }
  ];
}

function createReviewSystemPrompt(): string {
  return [
    "Prepare Deliberum proposal review material only.",
    "Your entire assistant response must be exactly one JSON object.",
    "The first non-whitespace character must be { and the last non-whitespace character must be }.",
    "Do not include prose before or after the JSON object.",
    "Do not include Markdown or code fences.",
    "Do not decide truth, select winners, rank candidates, score options, or return final answers.",
    "Return only review challenges and notes.",
    "Challenges must target only proposal event IDs listed in allowedProposalEventIds.",
    "Keep JSON schema keys in English, but write every user-visible JSON string value in the same language as the discussion question.",
    "If the discussion question is in Simplified Chinese, write user-visible JSON string values in Simplified Chinese.",
    "When no challenge is warranted, return an empty challenges array and a notes array explaining the limitation."
  ].join(" ");
}

function createReviewUserPrompt(context: ProposalReviewContext): string {
  return JSON.stringify(
    {
      topic: context.topic,
      goals: context.goals,
      constraints: context.constraints,
      output: context.output,
      allowedProposalEventIds: context.metadata.proposalEventIds,
      sourceExtractionRoundId: context.sourceExtractionRoundId,
      proposalStates: context.proposalStates.map((proposal) => ({
        proposalEventId: proposal.proposalEventId,
        sequence: proposal.sequence,
        sourceEventIds: proposal.sourceEventIds,
        challengeEventIds: proposal.challengeEventIds,
        acceptanceEventIds: proposal.acceptanceEventIds,
        isChallenged: proposal.isChallenged,
        isAcceptedForNow: proposal.isAcceptedForNow,
        proposal: proposal.proposal
      })),
      acceptedObjects: context.acceptedObjects,
      frontier: context.frontier,
      qualityObligations: context.qualityObligations,
      responseContract: {
        requiredForm: "exactly one JSON object and nothing else",
        firstNonWhitespaceCharacter: "{",
        lastNonWhitespaceCharacter: "}",
        disallowed: [
          "prose before the JSON object",
          "prose after the JSON object",
          "Markdown fences",
          "code fences",
          "acceptance decisions",
          "ranking",
          "scores",
          "winner or final answer language"
        ],
        outputShape: {
          challenges: [
            {
              targetProposalEventId: "one allowed proposal event id",
              reason: "non-empty string"
            }
          ],
          notes: ["optional non-empty string"]
        },
        fallbackWhenUncertain: {
          challenges: [],
          notes: ["non-empty explanation of why no challenge is proposed"]
        },
        finalInstruction:
          "Return only the JSON object. The complete assistant response must start with { and end with }.",
        languageRule:
          "Schema keys stay in English; user-visible string values must match the discussion question language."
      }
    },
    null,
    2
  );
}

function parseReviewOutput(parsed: unknown): ProposalReviewGeneratorResult {
  const review = ProposalReviewGeneratorResultSchema.safeParse(parsed);
  if (!review.success) {
    throw new OpenAICompatibleReviewGeneratorError(
      "OpenAI-compatible proposal review output did not match the review schema.",
      "proposal_review_validation_failed"
    );
  }

  return review.data;
}
