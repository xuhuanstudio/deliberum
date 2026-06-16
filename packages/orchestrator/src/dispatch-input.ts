import { JsonValueSchema, type JsonValue } from "@deliberum/protocol";
import { DispatchInputError } from "./errors";
import { buildParticipantContext } from "./context-builder";
import { ParticipantRegistry } from "./participant-registry";
import {
  createProviderConfigSafeView,
  resolveProviderRuntimeConfig
} from "./provider-secret-resolver";
import type {
  BuildParticipantDispatchInput,
  ParticipantDispatchEnvelope,
  ParticipantDeliberationContext,
  ProviderModelConfigRef
} from "./types";

const PARTICIPANT_PROMPT_SYSTEM_INSTRUCTIONS = [
  "Prepare contribution material only.",
  "Do not decide truth or select a single answer.",
  "Write for a non-technical reader.",
  "Match the discussion question language for every user-visible sentence.",
  "If the discussion question is in Simplified Chinese, write Simplified Chinese.",
  "Keep implementation details, machine references, credentials, and setup metadata out of the contribution."
].join(" ");

const PARTICIPANT_PROMPT_USER_INSTRUCTIONS = [
  "Prepare an independent participant contribution from the provided plain-language Deliberum discussion context.",
  "Answer in the same language as the discussion question.",
  "Use the discussion brief and visible room updates, but do not repeat implementation details or machine references."
].join(" ");
const DEFAULT_PARTICIPANT_SYSTEM_INSTRUCTIONS =
  "Prepare contribution material only. Do not decide truth or select a single answer.";
const DEFAULT_PARTICIPANT_USER_INSTRUCTIONS =
  "Prepare an independent participant contribution from the provided Deliberum context.";

const INTERNAL_PROMPT_KEYS = new Set([
  "adapterId",
  "allowedAdapters",
  "authorId",
  "basedOnEventIds",
  "batchId",
  "contextCapsuleId",
  "eventId",
  "eventIds",
  "finalCandidateProposalEventId",
  "id",
  "idempotencyKey",
  "participantId",
  "participantIds",
  "profileId",
  "proposalEventId",
  "providerConfigId",
  "redactedEventIds",
  "runId",
  "sessionId",
  "sourceEventIds",
  "targetFinalCandidateProposalEventId",
  "targetProposalEventId",
  "trace"
]);

export function buildParticipantDispatchInput(
  input: BuildParticipantDispatchInput
): ParticipantDispatchEnvelope {
  const participant = new ParticipantRegistry(input.run.plan.participants).require(input.participantId);
  const adapter = input.adapterRegistry.require(participant.adapterId);
  const context = buildParticipantContext({
    run: input.run,
    eventStore: input.eventStore,
    participantId: input.participantId
  });
  const providerConfig = participant.providerConfigId
    ? findProviderConfig(input.run.plan.providerConfigs, participant.providerConfigId)
    : undefined;
  const providerRuntimeConfig = providerConfig
    ? resolveProviderRuntimeConfig({
        providerConfig,
        env: input.env
      })
    : undefined;
  const providerSafeView = providerRuntimeConfig
    ? createProviderConfigSafeView(providerRuntimeConfig)
    : undefined;
  const usePlainLanguagePromptPayload = shouldUsePlainLanguagePromptPayload(
    participant.adapterId
  );
  const contextPayload = usePlainLanguagePromptPayload
    ? createParticipantPromptPayload(context)
    : JsonValueSchema.parse(context);

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    participantId: participant.id,
    adapterId: participant.adapterId,
    adapter,
    context,
    adapterInput: {
      instructions: usePlainLanguagePromptPayload
        ? PARTICIPANT_PROMPT_USER_INSTRUCTIONS
        : DEFAULT_PARTICIPANT_USER_INSTRUCTIONS,
      payload: contextPayload
    },
    adapterContext: {
      sessionId: input.run.sessionId,
      participantId: participant.id,
      instructions: usePlainLanguagePromptPayload
        ? PARTICIPANT_PROMPT_SYSTEM_INSTRUCTIONS
        : DEFAULT_PARTICIPANT_SYSTEM_INSTRUCTIONS,
      sourceEventIds: context.metadata.eventIds,
      participantCapabilities: participant.capabilities
    },
    ...(providerSafeView ? { providerSafeView } : {}),
    ...(providerRuntimeConfig ? { providerRuntimeConfig } : {})
  };
}

function shouldUsePlainLanguagePromptPayload(adapterId: string): boolean {
  return adapterId === "openai-compatible";
}

function createParticipantPromptPayload(context: ParticipantDeliberationContext): JsonValue {
  const roomUpdates = context.events.map((event, index) =>
    [
      `Update ${index + 1}: ${describeRoomStage(event.type)}`,
      `Speaker: ${describeSpeaker(event.authorId, context)}`,
      `Content: ${formatPromptValue(summarizeEventPayload(event.payload))}`
    ].join("\n")
  );
  const resourceSummary =
    context.resources.length > 0
      ? "Resources are available through the local system when explicitly delivered."
      : "No external resources are attached to this discussion.";

  return JsonValueSchema.parse(
    [
      "Discussion brief",
      `Topic: ${context.topic}`,
      `Goals: ${formatStringList(context.goals)}`,
      `Constraints: ${formatStringList(context.constraints)}`,
      `Expected output: ${formatPromptValue(sanitizePromptValue(context.output))}`,
      "",
      "Your role",
      `Display name: ${context.participant.displayName}`,
      `Kind: ${context.participant.kind}`,
      "",
      "Language",
      "Write every user-visible sentence in the same language as the discussion question.",
      "If the discussion question is in Simplified Chinese, write Simplified Chinese.",
      "",
      "Visible room updates",
      roomUpdates.length > 0 ? roomUpdates.join("\n\n") : "No visible updates yet.",
      "",
      "Resources",
      resourceSummary
    ].join("\n")
  );
}

function describeRoomStage(type: string): string {
  switch (type) {
    case "topic_contract_published":
      return "Discussion brief";
    case "sealed_batch_opened":
      return "Independent first responses opened";
    case "sealed_contribution_submitted":
      return "Independent response submitted";
    case "sealed_batch_revealed":
      return "Independent first responses revealed";
    default:
      return "Discussion update";
  }
}

function describeSpeaker(
  authorId: string,
  context: ParticipantDeliberationContext
): string {
  if (authorId === context.participant.id) {
    return context.participant.displayName;
  }

  if (authorId === "system") {
    return "Discussion room";
  }

  return "Discussion participant";
}

function summarizeEventPayload(payload: JsonValue): JsonValue {
  if (isRedactedPayload(payload)) {
    return "This update is not visible yet.";
  }

  if (isRecord(payload)) {
    if (typeof payload.topic === "string") {
      return {
        ...(getStringValue(payload, "title")
          ? { title: getStringValue(payload, "title") }
          : {}),
        topic: payload.topic,
        goals: getStringArrayValue(payload, "goals"),
        constraints: getStringArrayValue(payload, "constraints"),
        outputExpectations: getStringArrayValue(payload, "outputExpectations")
      };
    }

    if ("payload" in payload) {
      return sanitizePromptValue(payload.payload);
    }
  }

  return sanitizePromptValue(payload);
}

function sanitizePromptValue(value: unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePromptValue(item));
  }

  if (isRecord(value)) {
    const sanitized: Record<string, JsonValue> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (isInternalPromptKey(key)) {
        continue;
      }

      sanitized[key] = sanitizePromptValue(nestedValue);
    }

    return sanitized;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return String(value);
}

function formatPromptValue(value: JsonValue): string {
  if (Array.isArray(value)) {
    return formatStringList(value.map((item) => formatPromptValue(item)));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined);

    if (entries.length === 0) {
      return "No visible details.";
    }

    return entries
      .map(([key, nestedValue]) => `${formatPromptKey(key)}: ${formatPromptValue(nestedValue)}`)
      .join("; ");
  }

  if (value === null) {
    return "None";
  }

  return String(value);
}

function formatPromptKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function formatStringList(values: readonly string[]): string {
  return values.length > 0 ? values.join("; ") : "None listed.";
}

function isInternalPromptKey(key: string): boolean {
  return INTERNAL_PROMPT_KEYS.has(key) || key === "id" || /Ids?$/.test(key);
}

function isRedactedPayload(value: JsonValue): boolean {
  return isRecord(value) && value.redacted === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function getStringArrayValue(record: Record<string, unknown>, key: string): string[] {
  return Array.isArray(record[key])
    ? record[key].filter((value): value is string => typeof value === "string")
    : [];
}

function findProviderConfig(
  providerConfigs: readonly ProviderModelConfigRef[],
  providerConfigId: string
): ProviderModelConfigRef {
  const providerConfig = providerConfigs.find((candidate) => candidate.id === providerConfigId);

  if (!providerConfig) {
    throw new DispatchInputError(`Provider config was not found: ${providerConfigId}`);
  }

  return providerConfig;
}
