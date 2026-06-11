import {
  type FetchLike,
  type OpenAICompatibleChatMessage,
  type OpenAICompatibleRequestOptions
} from "@deliberum/adapters";
import {
  FinalAuditGeneratorResultSchema,
  FinalCandidateGeneratorResultSchema,
  type FinalAuditGenerator,
  type FinalAuditGeneratorInput,
  type FinalAuditGeneratorResult,
  type FinalCandidateGenerator,
  type FinalCandidateGeneratorInput,
  type FinalCandidateGeneratorResult,
  type FinalizationContext,
  type FinalizationRunErrorCategory,
  type ProviderRuntimeConfig,
  type RunSafeDiagnostics
} from "@deliberum/orchestrator";
import { completeOpenAICompatibleStructuredJsonObject } from "./openai-compatible-structured-generator";

export const OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID =
  "openai-compatible-final-candidate" as const;
export const OPENAI_COMPATIBLE_FINAL_AUDITOR_ID =
  "openai-compatible-final-auditor" as const;

type OpenAICompatibleFinalizationGeneratorConfig = {
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

export type OpenAICompatibleFinalCandidateGeneratorConfig =
  OpenAICompatibleFinalizationGeneratorConfig & {
    generatorId?: string;
  };

export type OpenAICompatibleFinalAuditGeneratorConfig =
  OpenAICompatibleFinalizationGeneratorConfig & {
    auditorId?: string;
  };

export class OpenAICompatibleFinalizationGeneratorError extends Error {
  readonly safeCategory: FinalizationRunErrorCategory;
  readonly safeDiagnostics?: RunSafeDiagnostics;

  constructor(
    message: string,
    safeCategory: FinalizationRunErrorCategory,
    safeDiagnostics: RunSafeDiagnostics = {}
  ) {
    super(message);
    this.name = "OpenAICompatibleFinalizationGeneratorError";
    this.safeCategory = safeCategory;
    this.safeDiagnostics = Object.keys(safeDiagnostics).length > 0
      ? { ...safeDiagnostics }
      : undefined;
  }
}

export class OpenAICompatibleFinalCandidateGenerator implements FinalCandidateGenerator {
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

  constructor(config: OpenAICompatibleFinalCandidateGeneratorConfig) {
    this.generatorId =
      config.generatorId ?? OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID;
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

  async proposeFinalCandidate(
    _input: FinalCandidateGeneratorInput,
    context: FinalizationContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
  ): Promise<FinalCandidateGeneratorResult> {
    const parsed = await completeOpenAICompatibleStructuredJsonObject<FinalizationRunErrorCategory>({
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
      messages: createFinalCandidateMessages(context),
      malformedResponseCategory: "provider_malformed_response",
      outputDescription: "final candidate output",
      createError: (message, safeCategory, safeDiagnostics) =>
        new OpenAICompatibleFinalizationGeneratorError(message, safeCategory, safeDiagnostics)
    });

    return parseFinalCandidateOutput(parsed);
  }
}

export class OpenAICompatibleFinalAuditGenerator implements FinalAuditGenerator {
  readonly auditorId: string;
  readonly adapterId: string;
  readonly providerConfigId: string;
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly model?: string;
  private readonly endpointPath?: string;
  private readonly timeoutMs?: number;
  private readonly requestOptions?: OpenAICompatibleRequestOptions;
  private readonly fetch?: FetchLike;

  constructor(config: OpenAICompatibleFinalAuditGeneratorConfig) {
    this.auditorId = config.auditorId ?? OPENAI_COMPATIBLE_FINAL_AUDITOR_ID;
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

  async auditFinalCandidate(
    input: FinalAuditGeneratorInput,
    context: FinalizationContext,
    providerRuntimeConfig?: ProviderRuntimeConfig
  ): Promise<FinalAuditGeneratorResult> {
    const parsed = await completeOpenAICompatibleStructuredJsonObject<FinalizationRunErrorCategory>({
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
      messages: createFinalAuditMessages(context, input.finalCandidateProposalEventId),
      malformedResponseCategory: "provider_malformed_response",
      outputDescription: "final audit output",
      createError: (message, safeCategory, safeDiagnostics) =>
        new OpenAICompatibleFinalizationGeneratorError(message, safeCategory, safeDiagnostics)
    });

    return parseFinalAuditOutput(parsed);
  }
}

function createFinalCandidateMessages(
  context: FinalizationContext
): OpenAICompatibleChatMessage[] {
  return [
    {
      role: "system",
      content: createFinalCandidateSystemPrompt()
    },
    {
      role: "user",
      content: createFinalCandidateUserPrompt(context)
    }
  ];
}

function createFinalCandidateSystemPrompt(): string {
  return [
    "Prepare Deliberum final candidate proposal material only.",
    "Your entire assistant response must be exactly one JSON object.",
    "The first non-whitespace character must be { and the last non-whitespace character must be }.",
    "Do not include prose before or after the JSON object.",
    "Do not include Markdown or code fences.",
    "Do not decide truth, select a winner, rank candidates, score options, vote, or return a final answer.",
    "The final candidate is a proposal, not an authoritative answer.",
    "Use only candidateIds listed in allowedCandidateIds.",
    "When limitations or applicability conditions are unclear, use empty arrays and include a non-empty rationale."
  ].join(" ");
}

function createFinalCandidateUserPrompt(context: FinalizationContext): string {
  return JSON.stringify(
    {
      topic: context.topic,
      goals: context.goals,
      constraints: context.constraints,
      output: context.output,
      allowedCandidateIds: context.frontier.candidates.map((candidate) => candidate.object.id),
      frontier: context.frontier,
      acceptedObjects: context.acceptedObjects,
      qualityObligations: context.qualityObligations,
      unresolvedObjectionIds: context.unresolvedObjectionIds,
      evidenceNeedIds: context.evidenceNeedIds,
      responseContract: {
        requiredForm: "exactly one JSON object and nothing else",
        firstNonWhitespaceCharacter: "{",
        lastNonWhitespaceCharacter: "}",
        disallowed: [
          "prose before the JSON object",
          "prose after the JSON object",
          "Markdown fences",
          "code fences",
          "winner language",
          "ranking",
          "scores",
          "votes",
          "final answer language"
        ],
        outputShape: {
          candidateIds: ["one or more allowed candidate ids"],
          recommendation: "non-empty provisional recommendation string",
          applicabilityConditions: ["optional non-empty string"],
          rationale: "required non-empty string",
          limitations: ["optional non-empty string"]
        },
        fallbackWhenUncertain: {
          applicabilityConditions: [],
          limitations: [],
          rationale: "non-empty explanation of uncertainty or limitation"
        },
        finalInstruction:
          "Return only the JSON object. The complete assistant response must start with { and end with }."
      }
    },
    null,
    2
  );
}

function createFinalAuditMessages(
  context: FinalizationContext,
  finalCandidateProposalEventId: string
): OpenAICompatibleChatMessage[] {
  return [
    {
      role: "system",
      content: createFinalAuditSystemPrompt()
    },
    {
      role: "user",
      content: createFinalAuditUserPrompt(context, finalCandidateProposalEventId)
    }
  ];
}

function createFinalAuditSystemPrompt(): string {
  return [
    "Prepare Deliberum final audit material only.",
    "Your entire assistant response must be exactly one JSON object.",
    "The first non-whitespace character must be { and the last non-whitespace character must be }.",
    "Do not include prose before or after the JSON object.",
    "Do not include Markdown or code fences.",
    "Do not decide truth, act as a judge, select winners, rank candidates, score options, vote, or return a final answer.",
    "The final audit records limitations, unresolved issues, risks, omissions, and continuation suggestions only.",
    "Use only IDs listed in allowedUnresolvedObjectionIds, allowedQualityObligationIds, and allowedEvidenceNeedIds.",
    "When an item group has no material, return an empty array for that group."
  ].join(" ");
}

function createFinalAuditUserPrompt(
  context: FinalizationContext,
  finalCandidateProposalEventId: string
): string {
  return JSON.stringify(
    {
      topic: context.topic,
      goals: context.goals,
      constraints: context.constraints,
      output: context.output,
      finalCandidateProposalEventId,
      allowedUnresolvedObjectionIds: context.unresolvedObjectionIds,
      allowedQualityObligationIds: context.qualityObligations.qualityObligations.map(
        (entry) => entry.object.id
      ),
      allowedEvidenceNeedIds: context.evidenceNeedIds,
      acceptedObjects: context.acceptedObjects,
      frontier: context.frontier,
      qualityObligations: context.qualityObligations,
      publicEvents: context.publicEvents,
      responseContract: {
        requiredForm: "exactly one JSON object and nothing else",
        firstNonWhitespaceCharacter: "{",
        lastNonWhitespaceCharacter: "}",
        disallowed: [
          "prose before the JSON object",
          "prose after the JSON object",
          "Markdown fences",
          "code fences",
          "judge language",
          "winner language",
          "ranking",
          "scores",
          "votes",
          "final answer language"
        ],
        outputShape: {
          findings: ["non-empty string"],
          risks: ["non-empty string"],
          unresolvedObjectionIds: ["allowed unresolved objection id"],
          qualityObligationIds: ["allowed quality obligation id"],
          evidenceNeedIds: ["allowed evidence need id"],
          omissions: ["non-empty string"],
          compressionProblems: ["non-empty string"],
          limitations: ["non-empty string"],
          continuationSuggestions: ["non-empty string"]
        },
        fallbackWhenUncertain: {
          findings: [],
          risks: [],
          unresolvedObjectionIds: [],
          qualityObligationIds: [],
          evidenceNeedIds: [],
          omissions: [],
          compressionProblems: [],
          limitations: [],
          continuationSuggestions: []
        },
        finalInstruction:
          "Return only the JSON object. The complete assistant response must start with { and end with }."
      }
    },
    null,
    2
  );
}

function parseFinalCandidateOutput(parsed: unknown): FinalCandidateGeneratorResult {
  const candidate = FinalCandidateGeneratorResultSchema.safeParse(parsed);
  if (!candidate.success) {
    throw new OpenAICompatibleFinalizationGeneratorError(
      "OpenAI-compatible final candidate output did not match the final candidate schema.",
      "final_candidate_validation_failed"
    );
  }

  return candidate.data;
}

function parseFinalAuditOutput(parsed: unknown): FinalAuditGeneratorResult {
  const audit = FinalAuditGeneratorResultSchema.safeParse(parsed);
  if (!audit.success) {
    throw new OpenAICompatibleFinalizationGeneratorError(
      "OpenAI-compatible final audit output did not match the final audit schema.",
      "final_audit_validation_failed"
    );
  }

  return audit.data;
}
