import { ProviderSecretResolutionError } from "./errors";
import type {
  ProviderConfigSafeView,
  ProviderModelConfigRef,
  ProviderRuntimeConfig,
  ProviderSecretResolverInput
} from "./types";

export function resolveProviderRuntimeConfig(
  input: ProviderSecretResolverInput
): ProviderRuntimeConfig {
  const runtimeConfig: ProviderRuntimeConfig = {
    id: input.providerConfig.id,
    adapterId: input.providerConfig.adapterId,
    providerConfigId: input.providerConfig.providerConfigId,
    modelId: input.providerConfig.modelId,
    baseUrl: input.providerConfig.baseUrl,
    endpointPath: input.providerConfig.endpointPath,
    timeoutMs: input.providerConfig.timeoutMs,
    requestOptions: createProviderRequestOptions(input.providerConfig),
    apiKeyEnvVar: input.providerConfig.apiKeyEnvVar
  };

  if (!input.providerConfig.apiKeyEnvVar) {
    return runtimeConfig;
  }

  const secret = input.env?.[input.providerConfig.apiKeyEnvVar];

  if (!secret) {
    throw new ProviderSecretResolutionError(
      `Provider secret is missing for env var ${input.providerConfig.apiKeyEnvVar}.`
    );
  }

  return {
    ...runtimeConfig,
    apiKey: secret
  };
}

export function createProviderConfigSafeView(
  providerConfig: ProviderModelConfigRef | ProviderRuntimeConfig
): ProviderConfigSafeView {
  const requestOptions = createSafeProviderRequestOptions(providerConfig);

  return {
    id: providerConfig.id,
    adapterId: providerConfig.adapterId,
    providerConfigId: providerConfig.providerConfigId,
    modelId: providerConfig.modelId,
    baseUrl: providerConfig.baseUrl,
    endpointPath: providerConfig.endpointPath,
    timeoutMs: providerConfig.timeoutMs,
    ...(requestOptions ? { requestOptions } : {}),
    apiKeyEnvVar: providerConfig.apiKeyEnvVar,
    hasApiKey: Boolean(providerConfig.apiKeyEnvVar)
  };
}

function createProviderRequestOptions(
  providerConfig: ProviderModelConfigRef
): ProviderRuntimeConfig["requestOptions"] {
  const requestOptions: NonNullable<ProviderRuntimeConfig["requestOptions"]> = {};

  if (providerConfig.tokenParameter) {
    requestOptions.tokenParameter = providerConfig.tokenParameter;
  }

  if (providerConfig.maxCompletionTokens !== undefined) {
    requestOptions.maxCompletionTokens = providerConfig.maxCompletionTokens;
  }

  if (providerConfig.temperature !== undefined) {
    requestOptions.temperature = providerConfig.temperature;
  }

  if (providerConfig.topP !== undefined) {
    requestOptions.topP = providerConfig.topP;
  }

  if (providerConfig.stream !== undefined) {
    requestOptions.stream = providerConfig.stream;
  }

  if (providerConfig.frequencyPenalty !== undefined) {
    requestOptions.frequencyPenalty = providerConfig.frequencyPenalty;
  }

  if (providerConfig.presencePenalty !== undefined) {
    requestOptions.presencePenalty = providerConfig.presencePenalty;
  }

  if (providerConfig.thinking) {
    requestOptions.thinking = providerConfig.thinking;
  }

  return Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
}

function createSafeProviderRequestOptions(
  providerConfig: ProviderModelConfigRef | ProviderRuntimeConfig
): ProviderRuntimeConfig["requestOptions"] {
  if ("requestOptions" in providerConfig) {
    return providerConfig.requestOptions;
  }

  return createProviderRequestOptions(providerConfig);
}
