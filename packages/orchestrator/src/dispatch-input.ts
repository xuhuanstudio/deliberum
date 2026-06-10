import { JsonValueSchema } from "@deliberum/protocol";
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
  ProviderModelConfigRef
} from "./types";

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
  const contextPayload = JsonValueSchema.parse(context);

  return {
    runId: input.run.id,
    sessionId: input.run.sessionId,
    participantId: participant.id,
    adapterId: participant.adapterId,
    adapter,
    context,
    adapterInput: {
      instructions:
        "Prepare an independent participant contribution from the provided Deliberum context.",
      payload: contextPayload
    },
    adapterContext: {
      sessionId: input.run.sessionId,
      participantId: participant.id,
      instructions:
        "Prepare contribution material only. Do not decide truth or select a single answer.",
      sourceEventIds: context.metadata.eventIds,
      participantCapabilities: participant.capabilities
    },
    ...(providerSafeView ? { providerSafeView } : {}),
    ...(providerRuntimeConfig ? { providerRuntimeConfig } : {})
  };
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
