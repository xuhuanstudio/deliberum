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
  return {
    id: providerConfig.id,
    adapterId: providerConfig.adapterId,
    providerConfigId: providerConfig.providerConfigId,
    modelId: providerConfig.modelId,
    baseUrl: providerConfig.baseUrl,
    endpointPath: providerConfig.endpointPath,
    timeoutMs: providerConfig.timeoutMs,
    apiKeyEnvVar: providerConfig.apiKeyEnvVar,
    hasApiKey: Boolean(providerConfig.apiKeyEnvVar)
  };
}
