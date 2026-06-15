import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
  OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
  OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID,
  OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR,
  OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR,
  OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR,
  OPENAI_COMPATIBLE_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_PROFILE_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR,
  OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR
} from "./openai-compatible-profile";

export const OPENAI_COMPATIBLE_SETUP_ENV_BEGIN =
  "# BEGIN DELIBERUM OPENAI-COMPATIBLE WEB SETUP" as const;
export const OPENAI_COMPATIBLE_SETUP_ENV_END =
  "# END DELIBERUM OPENAI-COMPATIBLE WEB SETUP" as const;
export const DEFAULT_DAEMON_SETUP_ENV_FILE_PATH = ".env" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_BEGIN =
  "# BEGIN DELIBERUM MODEL ROLE DEFAULTS WEB SETUP" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_END =
  "# END DELIBERUM MODEL ROLE DEFAULTS WEB SETUP" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_COUNT_ENV_VAR =
  "DELIBERUM_OPENAI_ROLE_DEFAULT_PERSPECTIVE_COUNT" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULT_MODEL_ENV_VAR =
  "DELIBERUM_OPENAI_ROLE_DEFAULT_MODEL" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULT_REVIEW_MODEL_ENV_VAR =
  "DELIBERUM_OPENAI_ROLE_DEFAULT_REVIEW_MODEL" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULT_CUSTOM_PERSPECTIVE_MODELS_ENV_VAR =
  "DELIBERUM_OPENAI_ROLE_DEFAULT_CUSTOM_PERSPECTIVE_MODELS" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_A_MODEL_ENV_VAR =
  "DELIBERUM_OPENAI_ROLE_DEFAULT_PERSPECTIVE_A_MODEL" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_B_MODEL_ENV_VAR =
  "DELIBERUM_OPENAI_ROLE_DEFAULT_PERSPECTIVE_B_MODEL" as const;
export const OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_C_MODEL_ENV_VAR =
  "DELIBERUM_OPENAI_ROLE_DEFAULT_PERSPECTIVE_C_MODEL" as const;

export type OpenAICompatibleSetupInput = {
  apiKey: unknown;
  baseUrl: unknown;
  model: unknown;
  structuredReview?: unknown;
};

export type OpenAICompatibleSetupResult = {
  profileId: "openai-compatible";
  status: "saved";
  managedEnvFile: "local-daemon-env";
  configuredFields: Array<"apiKey" | "baseUrl" | "model" | "structuredReview">;
  restartRequired: boolean;
  activeInCurrentDaemon: boolean;
  safety: string[];
};

export type OpenAICompatibleRoleModelDefaults = {
  perspectiveCount: 2 | 3;
  modelOverride: string;
  reviewModelOverride: string;
  customPerspectiveModelsEnabled: boolean;
  perspectiveModelOverrides: {
    "provider-perspective-a"?: string;
    "provider-perspective-b"?: string;
    "provider-perspective-c"?: string;
  };
};

export type OpenAICompatibleRoleModelDefaultsResult = {
  profileId: "openai-compatible";
  status: "saved" | "cleared";
  managedEnvFile: "local-daemon-env";
  configuredFields: Array<
    | "perspectiveCount"
    | "modelOverride"
    | "reviewModelOverride"
    | "customPerspectiveModelsEnabled"
    | "perspectiveModelOverrides"
  >;
  restartRequired: boolean;
  activeInCurrentDaemon: boolean;
  safety: string[];
};

export type ManagedDaemonSetupEnvLoadResult = {
  filePath: string;
  loaded: boolean;
  appliedEnvVars: string[];
  skippedEnvVars: string[];
};

export class SetupEnvError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SetupEnvError";
    this.code = code;
  }
}

export async function writeOpenAICompatibleSetupEnv(input: {
  envFilePath?: string;
  activeEnv?: Record<string, string | undefined>;
  setup: OpenAICompatibleSetupInput;
}): Promise<OpenAICompatibleSetupResult> {
  const envFilePath = input.envFilePath ?? DEFAULT_DAEMON_SETUP_ENV_FILE_PATH;
  const setup = normalizeOpenAICompatibleSetup(input.setup);
  const block = createOpenAICompatibleSetupBlock(setup);
  const existingContent = await readOptionalTextFile(envFilePath);
  const nextContent = mergeDaemonEnvBlock(existingContent, block);

  await writeFile(envFilePath, nextContent, "utf8");

  if (input.activeEnv) {
    applyOpenAICompatibleSetupToEnv(input.activeEnv, setup);
  }

  const activeInCurrentDaemon = input.activeEnv !== undefined;

  return {
    profileId: "openai-compatible",
    status: "saved",
    managedEnvFile: "local-daemon-env",
    configuredFields: setup.structuredReview
      ? ["apiKey", "baseUrl", "model", "structuredReview"]
      : ["apiKey", "baseUrl", "model"],
    restartRequired: !activeInCurrentDaemon,
    activeInCurrentDaemon,
    safety: activeInCurrentDaemon
      ? [
          "The API key was written to the local daemon env file but is not returned.",
          "The setup was applied to the current local daemon process.",
          "The daemon will also load the managed local setup block on the next start."
        ]
      : [
          "The API key was written to the local daemon env file but is not returned.",
          "The daemon loads the managed local setup block at startup.",
          "Restart the local daemon, then refresh Web to verify readiness."
        ]
  };
}

export async function writeOpenAICompatibleRoleModelDefaultsEnv(input: {
  envFilePath?: string;
  activeEnv?: Record<string, string | undefined>;
  defaults: OpenAICompatibleRoleModelDefaults;
}): Promise<OpenAICompatibleRoleModelDefaultsResult> {
  const envFilePath = input.envFilePath ?? DEFAULT_DAEMON_SETUP_ENV_FILE_PATH;
  const defaults = normalizeOpenAICompatibleRoleModelDefaults(input.defaults);
  const block = createOpenAICompatibleRoleDefaultsBlock(defaults);
  const existingContent = await readOptionalTextFile(envFilePath);
  const nextContent = mergeDaemonEnvBlock(
    existingContent,
    block,
    OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_BEGIN,
    OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_END
  );

  await writeFile(envFilePath, nextContent, "utf8");

  if (input.activeEnv) {
    applyOpenAICompatibleRoleModelDefaultsToEnv(input.activeEnv, defaults);
  }

  return createRoleModelDefaultsResult({
    status: "saved",
    activeInCurrentDaemon: input.activeEnv !== undefined,
    configuredFields: getConfiguredRoleModelDefaultsFields(defaults)
  });
}

export async function clearOpenAICompatibleRoleModelDefaultsEnv(input: {
  envFilePath?: string;
  activeEnv?: Record<string, string | undefined>;
} = {}): Promise<OpenAICompatibleRoleModelDefaultsResult> {
  const envFilePath = input.envFilePath ?? DEFAULT_DAEMON_SETUP_ENV_FILE_PATH;
  const existingContent = await readOptionalTextFile(envFilePath);
  const nextContent = removeDaemonEnvBlock(
    existingContent,
    OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_BEGIN,
    OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_END
  );

  if (nextContent !== existingContent) {
    await writeFile(envFilePath, nextContent ?? "", "utf8");
  }

  if (input.activeEnv) {
    clearOpenAICompatibleRoleModelDefaultsFromEnv(input.activeEnv);
  }

  return createRoleModelDefaultsResult({
    status: "cleared",
    activeInCurrentDaemon: input.activeEnv !== undefined,
    configuredFields: []
  });
}

export function readOpenAICompatibleRoleModelDefaultsFromEnv(input: {
  env?: Record<string, string | undefined>;
} = {}): OpenAICompatibleRoleModelDefaults | undefined {
  const env = input.env ?? process.env;
  const perspectiveCount = env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_COUNT_ENV_VAR];

  if (!perspectiveCount) {
    return undefined;
  }

  return normalizeOpenAICompatibleRoleModelDefaults({
    perspectiveCount: perspectiveCount === "3" ? 3 : 2,
    modelOverride: env[OPENAI_COMPATIBLE_ROLE_DEFAULT_MODEL_ENV_VAR] ?? "",
    reviewModelOverride: env[OPENAI_COMPATIBLE_ROLE_DEFAULT_REVIEW_MODEL_ENV_VAR] ?? "",
    customPerspectiveModelsEnabled:
      env[OPENAI_COMPATIBLE_ROLE_DEFAULT_CUSTOM_PERSPECTIVE_MODELS_ENV_VAR] === "true",
    perspectiveModelOverrides: {
      "provider-perspective-a":
        env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_A_MODEL_ENV_VAR],
      "provider-perspective-b":
        env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_B_MODEL_ENV_VAR],
      "provider-perspective-c":
        env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_C_MODEL_ENV_VAR]
    }
  });
}

export function applyOpenAICompatibleSetupToEnv(
  env: Record<string, string | undefined>,
  setup: OpenAICompatibleSetupInput
): void {
  applyNormalizedOpenAICompatibleSetupToEnv(
    env,
    normalizeOpenAICompatibleSetup(setup)
  );
}

export function loadManagedDaemonSetupEnvFile(input: {
  envFilePath?: string;
  env?: Record<string, string | undefined>;
} = {}): ManagedDaemonSetupEnvLoadResult {
  const envFilePath = input.envFilePath ?? DEFAULT_DAEMON_SETUP_ENV_FILE_PATH;
  const env = input.env ?? process.env;
  const existingContent = readOptionalTextFileSync(envFilePath);
  const assignments =
    existingContent === undefined ? undefined : parseManagedDaemonEnvBlocks(existingContent);
  const appliedEnvVars: string[] = [];
  const skippedEnvVars: string[] = [];

  if (!assignments) {
    return {
      filePath: envFilePath,
      loaded: false,
      appliedEnvVars,
      skippedEnvVars
    };
  }

  for (const [name, value] of assignments) {
    if (!isManagedSetupEnvVar(name)) {
      skippedEnvVars.push(name);
      continue;
    }

    if (env[name]?.trim()) {
      skippedEnvVars.push(name);
      continue;
    }

    env[name] = value;
    appliedEnvVars.push(name);
  }

  return {
    filePath: envFilePath,
    loaded: true,
    appliedEnvVars,
    skippedEnvVars
  };
}

function createOpenAICompatibleSetupBlock(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  structuredReview: boolean;
}): string {
  return `${[
    OPENAI_COMPATIBLE_SETUP_ENV_BEGIN,
    "# Deliberum OpenAI-compatible provider setup",
    "# Generated by local Web setup.",
    "# Keep this file local. Do not commit provider credentials.",
    `${OPENAI_COMPATIBLE_PROFILE_ENV_VAR}=true`,
    `${OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR}=true`,
    `${OPENAI_COMPATIBLE_REVIEW_ENV_VAR}=true`,
    `${OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR}=true`,
    `${OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR}=${OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID}`,
    `${OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR}=${OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID}`,
    `${OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR}=${OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID}`,
    `${OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR}=${OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID}`,
    ...(input.structuredReview
      ? [
          `${OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR}=json_object`,
          `${OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR}=json_object`,
          `${OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR}=json_object`,
          `${OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR}=json_object`,
          `${OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR}=max_completion_tokens`,
          `${OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR}=4096`,
          `${OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR}=0`
        ]
      : []),
    `${OPENAI_COMPATIBLE_BASE_URL_ENV_VAR}=${formatEnvAssignmentValue(input.baseUrl)}`,
    `${OPENAI_COMPATIBLE_MODEL_ENV_VAR}=${formatEnvAssignmentValue(input.model)}`,
    `${OPENAI_COMPATIBLE_API_KEY_ENV_VAR}=${formatEnvAssignmentValue(input.apiKey)}`,
    OPENAI_COMPATIBLE_SETUP_ENV_END
  ].join("\n")}\n`;
}

function createOpenAICompatibleRoleDefaultsBlock(
  defaults: OpenAICompatibleRoleModelDefaults
): string {
  const perspectiveOverrides = defaults.customPerspectiveModelsEnabled
    ? defaults.perspectiveModelOverrides
    : {};

  return `${[
    OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_BEGIN,
    "# Deliberum non-secret model role defaults",
    "# Generated by local Web setup.",
    "# This block must not contain API keys, base URLs, or provider config ids.",
    `${OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_COUNT_ENV_VAR}=${defaults.perspectiveCount}`,
    `${OPENAI_COMPATIBLE_ROLE_DEFAULT_CUSTOM_PERSPECTIVE_MODELS_ENV_VAR}=${String(defaults.customPerspectiveModelsEnabled)}`,
    ...(defaults.modelOverride
      ? [
          `${OPENAI_COMPATIBLE_ROLE_DEFAULT_MODEL_ENV_VAR}=${formatEnvAssignmentValue(defaults.modelOverride)}`
        ]
      : []),
    ...(defaults.reviewModelOverride
      ? [
          `${OPENAI_COMPATIBLE_ROLE_DEFAULT_REVIEW_MODEL_ENV_VAR}=${formatEnvAssignmentValue(defaults.reviewModelOverride)}`
        ]
      : []),
    ...(perspectiveOverrides["provider-perspective-a"]
      ? [
          `${OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_A_MODEL_ENV_VAR}=${formatEnvAssignmentValue(perspectiveOverrides["provider-perspective-a"])}`
        ]
      : []),
    ...(perspectiveOverrides["provider-perspective-b"]
      ? [
          `${OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_B_MODEL_ENV_VAR}=${formatEnvAssignmentValue(perspectiveOverrides["provider-perspective-b"])}`
        ]
      : []),
    ...(perspectiveOverrides["provider-perspective-c"]
      ? [
          `${OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_C_MODEL_ENV_VAR}=${formatEnvAssignmentValue(perspectiveOverrides["provider-perspective-c"])}`
        ]
      : []),
    OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_END
  ].join("\n")}\n`;
}

function normalizeOpenAICompatibleSetup(input: OpenAICompatibleSetupInput): {
  apiKey: string;
  baseUrl: string;
  model: string;
  structuredReview: boolean;
} {
  return {
    apiKey: normalizeSecretValue(input.apiKey, "API key"),
    baseUrl: normalizeOpenAICompatibleBaseUrlValue(input.baseUrl),
    model: normalizeNonSecretTextValue(input.model, "Model"),
    structuredReview: normalizeOptionalBooleanValue(input.structuredReview, true)
  };
}

function applyNormalizedOpenAICompatibleSetupToEnv(
  env: Record<string, string | undefined>,
  setup: {
    apiKey: string;
    baseUrl: string;
    model: string;
    structuredReview: boolean;
  }
): void {
  env[OPENAI_COMPATIBLE_PROFILE_ENV_VAR] = "true";
  env[OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR] = "true";
  env[OPENAI_COMPATIBLE_REVIEW_ENV_VAR] = "true";
  env[OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR] = "true";
  env[OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR] =
    OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID;
  env[OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR] =
    OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID;
  env[OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR] =
    OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID;
  env[OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR] =
    OPENAI_COMPATIBLE_DEFAULT_PROVIDER_CONFIG_ID;
  applyOpenAICompatibleStructuredReviewSetupToEnv(env, setup.structuredReview);
  env[OPENAI_COMPATIBLE_BASE_URL_ENV_VAR] = setup.baseUrl;
  env[OPENAI_COMPATIBLE_MODEL_ENV_VAR] = setup.model;
  env[OPENAI_COMPATIBLE_API_KEY_ENV_VAR] = setup.apiKey;
}

function applyOpenAICompatibleStructuredReviewSetupToEnv(
  env: Record<string, string | undefined>,
  enabled: boolean
): void {
  const structuredReviewEnvVars = [
    OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR,
    OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR,
    OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR,
    OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR,
    OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR,
    OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR,
    OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR
  ];

  if (!enabled) {
    for (const name of structuredReviewEnvVars) {
      delete env[name];
    }

    return;
  }

  env[OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR] = "json_object";
  env[OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR] = "json_object";
  env[OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR] = "json_object";
  env[OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR] = "json_object";
  env[OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR] = "max_completion_tokens";
  env[OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR] = "4096";
  env[OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR] = "0";
}

function mergeDaemonEnvBlock(
  existingContent: string | undefined,
  block: string,
  beginMarker: string = OPENAI_COMPATIBLE_SETUP_ENV_BEGIN,
  endMarker: string = OPENAI_COMPATIBLE_SETUP_ENV_END
): string {
  if (existingContent === undefined || existingContent.trim().length === 0) {
    return block;
  }

  const beginIndex = existingContent.indexOf(beginMarker);
  const endIndex = existingContent.indexOf(endMarker);

  if (beginIndex === -1 && endIndex === -1) {
    const separator = existingContent.endsWith("\n") ? "\n" : "\n\n";
    return `${existingContent}${separator}${block}`;
  }

  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new SetupEnvError(
      "setup_env_file_invalid",
      "The local env file contains an incomplete Deliberum OpenAI-compatible Web setup block."
    );
  }

  const replacementEndIndex = endIndex + endMarker.length;
  const before = existingContent.slice(0, beginIndex);
  const after = existingContent.slice(replacementEndIndex).replace(/^\r?\n/, "");
  const separator = before.length > 0 && !before.endsWith("\n") ? "\n" : "";

  return `${before}${separator}${block}${after}`;
}

function removeDaemonEnvBlock(
  existingContent: string | undefined,
  beginMarker: string,
  endMarker: string
): string | undefined {
  if (existingContent === undefined || existingContent.trim().length === 0) {
    return existingContent;
  }

  const beginIndex = existingContent.indexOf(beginMarker);
  const endIndex = existingContent.indexOf(endMarker);

  if (beginIndex === -1 && endIndex === -1) {
    return existingContent;
  }

  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new SetupEnvError(
      "setup_env_file_invalid",
      "The local env file contains an incomplete Deliberum Web setup block."
    );
  }

  const replacementEndIndex = endIndex + endMarker.length;
  const before = existingContent.slice(0, beginIndex).replace(/\r?\n$/, "");
  const after = existingContent.slice(replacementEndIndex).replace(/^\r?\n/, "");

  if (before.length === 0) {
    return after;
  }

  if (after.length === 0) {
    return `${before}\n`;
  }

  return `${before}\n\n${after}`;
}

async function readOptionalTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function readOptionalTextFileSync(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (isNodeFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function parseManagedDaemonEnvBlocks(content: string): Map<string, string> | undefined {
  const blocks = [
    parseManagedDaemonEnvBlock(
      content,
      OPENAI_COMPATIBLE_SETUP_ENV_BEGIN,
      OPENAI_COMPATIBLE_SETUP_ENV_END
    ),
    parseManagedDaemonEnvBlock(
      content,
      OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_BEGIN,
      OPENAI_COMPATIBLE_ROLE_DEFAULTS_ENV_END
    )
  ];
  const assignments = new Map<string, string>();

  for (const block of blocks) {
    if (!block) {
      continue;
    }

    for (const [name, value] of block) {
      assignments.set(name, value);
    }
  }

  return assignments.size > 0 ? assignments : undefined;
}

function parseManagedDaemonEnvBlock(
  content: string,
  beginMarker: string,
  endMarker: string
): Map<string, string> | undefined {
  const beginIndex = content.indexOf(beginMarker);
  const endIndex = content.indexOf(endMarker);

  if (beginIndex === -1 && endIndex === -1) {
    return undefined;
  }

  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new SetupEnvError(
      "setup_env_file_invalid",
      "The local env file contains an incomplete Deliberum OpenAI-compatible Web setup block."
    );
  }

  const blockBody = content.slice(
    beginIndex + beginMarker.length,
    endIndex
  );
  const assignments = new Map<string, string>();

  for (const line of blockBody.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      throw new SetupEnvError(
        "setup_env_file_invalid",
        "The local env file contains an invalid Deliberum managed assignment."
      );
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!/^[A-Z0-9_]+$/.test(name)) {
      throw new SetupEnvError(
        "setup_env_file_invalid",
        "The local env file contains an invalid Deliberum managed variable name."
      );
    }

    assignments.set(name, parseEnvAssignmentValue(rawValue));
  }

  return assignments;
}

function normalizeSecretValue(value: unknown, label: string): string {
  const normalized = normalizeTextValue(value, label);

  if (normalized.length < 8) {
    throw new SetupEnvError(
      "setup_value_invalid",
      `${label} must be at least 8 characters.`
    );
  }

  return normalized;
}

function normalizeHttpUrlValue(value: unknown, label: string): string {
  const normalized = normalizeNonSecretTextValue(value, label);
  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new SetupEnvError("setup_value_invalid", `${label} must be a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SetupEnvError("setup_value_invalid", `${label} must use http or https.`);
  }

  return normalized;
}

function normalizeOpenAICompatibleBaseUrlValue(value: unknown): string {
  const normalized = normalizeHttpUrlValue(value, "Base URL");
  const parsed = new URL(normalized);

  if (
    (parsed.pathname === "/v1" || parsed.pathname === "/v1/") &&
    parsed.search === "" &&
    parsed.hash === ""
  ) {
    parsed.pathname = "/";
    return stripTrailingSlash(parsed.toString());
  }

  return normalized;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeNonSecretTextValue(value: unknown, label: string): string {
  const normalized = normalizeTextValue(value, label);

  if (containsSecretLikeValue(normalized)) {
    throw new SetupEnvError(
      "setup_value_invalid",
      `${label} must not contain secret-like material.`
    );
  }

  return normalized;
}

function normalizeOptionalBooleanValue(value: unknown, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new SetupEnvError("setup_value_invalid", "Structured review must be true or false.");
  }

  return value;
}

function normalizeOpenAICompatibleRoleModelDefaults(
  value: OpenAICompatibleRoleModelDefaults
): OpenAICompatibleRoleModelDefaults {
  const perspectiveCount = value.perspectiveCount === 3 ? 3 : 2;
  const customPerspectiveModelsEnabled = Boolean(value.customPerspectiveModelsEnabled);

  return {
    perspectiveCount,
    modelOverride: normalizeOptionalRoleModelValue(value.modelOverride, "First-response model"),
    reviewModelOverride: normalizeOptionalRoleModelValue(
      value.reviewModelOverride,
      "Review role model"
    ),
    customPerspectiveModelsEnabled,
    perspectiveModelOverrides: customPerspectiveModelsEnabled
      ? sanitizeRolePerspectiveModelOverrides(value.perspectiveModelOverrides)
      : {}
  };
}

function sanitizeRolePerspectiveModelOverrides(
  overrides: OpenAICompatibleRoleModelDefaults["perspectiveModelOverrides"]
): OpenAICompatibleRoleModelDefaults["perspectiveModelOverrides"] {
  return Object.fromEntries(
    (
      [
      ["provider-perspective-a", "Perspective A model"],
      ["provider-perspective-b", "Perspective B model"],
      ["provider-perspective-c", "Perspective C model"]
      ] as const
    ).flatMap(([participantId, label]) => {
      const model = normalizeOptionalRoleModelValue(
        overrides[participantId as keyof typeof overrides],
        label
      );

      return model ? [[participantId, model]] : [];
    })
  );
}

function normalizeOptionalRoleModelValue(value: unknown, label: string): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new SetupEnvError("setup_value_invalid", `${label} must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  return normalizeNonSecretTextValue(normalized, label);
}

function applyOpenAICompatibleRoleModelDefaultsToEnv(
  env: Record<string, string | undefined>,
  defaults: OpenAICompatibleRoleModelDefaults
): void {
  clearOpenAICompatibleRoleModelDefaultsFromEnv(env);
  env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_COUNT_ENV_VAR] = String(
    defaults.perspectiveCount
  );
  env[OPENAI_COMPATIBLE_ROLE_DEFAULT_CUSTOM_PERSPECTIVE_MODELS_ENV_VAR] = String(
    defaults.customPerspectiveModelsEnabled
  );

  if (defaults.modelOverride) {
    env[OPENAI_COMPATIBLE_ROLE_DEFAULT_MODEL_ENV_VAR] = defaults.modelOverride;
  }
  if (defaults.reviewModelOverride) {
    env[OPENAI_COMPATIBLE_ROLE_DEFAULT_REVIEW_MODEL_ENV_VAR] =
      defaults.reviewModelOverride;
  }
  if (
    defaults.customPerspectiveModelsEnabled &&
    defaults.perspectiveModelOverrides["provider-perspective-a"]
  ) {
    env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_A_MODEL_ENV_VAR] =
      defaults.perspectiveModelOverrides["provider-perspective-a"];
  }
  if (
    defaults.customPerspectiveModelsEnabled &&
    defaults.perspectiveModelOverrides["provider-perspective-b"]
  ) {
    env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_B_MODEL_ENV_VAR] =
      defaults.perspectiveModelOverrides["provider-perspective-b"];
  }
  if (
    defaults.customPerspectiveModelsEnabled &&
    defaults.perspectiveModelOverrides["provider-perspective-c"]
  ) {
    env[OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_C_MODEL_ENV_VAR] =
      defaults.perspectiveModelOverrides["provider-perspective-c"];
  }
}

function clearOpenAICompatibleRoleModelDefaultsFromEnv(
  env: Record<string, string | undefined>
): void {
  for (const name of OPENAI_COMPATIBLE_ROLE_DEFAULT_ENV_VARS) {
    delete env[name];
  }
}

function getConfiguredRoleModelDefaultsFields(
  defaults: OpenAICompatibleRoleModelDefaults
): OpenAICompatibleRoleModelDefaultsResult["configuredFields"] {
  return [
    "perspectiveCount",
    "customPerspectiveModelsEnabled",
    ...(defaults.modelOverride ? ["modelOverride" as const] : []),
    ...(defaults.reviewModelOverride ? ["reviewModelOverride" as const] : []),
    ...(Object.keys(defaults.perspectiveModelOverrides).length > 0
      ? ["perspectiveModelOverrides" as const]
      : [])
  ];
}

function createRoleModelDefaultsResult(input: {
  status: "saved" | "cleared";
  activeInCurrentDaemon: boolean;
  configuredFields: OpenAICompatibleRoleModelDefaultsResult["configuredFields"];
}): OpenAICompatibleRoleModelDefaultsResult {
  return {
    profileId: "openai-compatible",
    status: input.status,
    managedEnvFile: "local-daemon-env",
    configuredFields: input.configuredFields,
    restartRequired: !input.activeInCurrentDaemon,
    activeInCurrentDaemon: input.activeInCurrentDaemon,
    safety:
      input.status === "saved"
        ? input.activeInCurrentDaemon
          ? [
              "Role model defaults were written to the local daemon env file.",
              "Only non-secret model role choices are stored.",
              "The setup was applied to the current local daemon process."
            ]
          : [
              "Role model defaults were written to the local daemon env file.",
              "Only non-secret model role choices are stored.",
              "Restart the local daemon to use the saved role defaults."
            ]
        : input.activeInCurrentDaemon
          ? [
              "Role model defaults were removed from the local daemon env file.",
              "Only non-secret model role choices were cleared.",
              "The current local daemon process was cleared."
            ]
          : [
              "Role model defaults were removed from the local daemon env file.",
              "Only non-secret model role choices were cleared.",
              "Restart the local daemon to use the cleared role defaults."
            ]
  };
}

function normalizeTextValue(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new SetupEnvError("setup_value_invalid", `${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new SetupEnvError("setup_value_invalid", `${label} is required.`);
  }

  if (normalized.length > 2048) {
    throw new SetupEnvError("setup_value_invalid", `${label} is too long.`);
  }

  if (/[\r\n]/.test(normalized)) {
    throw new SetupEnvError("setup_value_invalid", `${label} must be a single line.`);
  }

  return normalized;
}

function formatEnvAssignmentValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function parseEnvAssignmentValue(value: string): string {
  if (value.startsWith("\"")) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new SetupEnvError(
        "setup_env_file_invalid",
        "The local env file contains an invalid quoted Deliberum managed value."
      );
    }

    if (typeof parsed !== "string") {
      throw new SetupEnvError(
        "setup_env_file_invalid",
        "The local env file contains an invalid quoted Deliberum managed value."
      );
    }

    return parsed;
  }

  return value;
}

function isManagedSetupEnvVar(name: string): boolean {
  return (
    name === OPENAI_COMPATIBLE_PROFILE_ENV_VAR ||
    name === OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR ||
    name === OPENAI_COMPATIBLE_REVIEW_ENV_VAR ||
    name === OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR ||
    name === OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR ||
    name === OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR ||
    name === OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR ||
    name === OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR ||
    name === OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR ||
    name === OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR ||
    name === OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR ||
    name === OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR ||
    name === OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR ||
    name === OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR ||
    name === OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR ||
    name === OPENAI_COMPATIBLE_BASE_URL_ENV_VAR ||
    name === OPENAI_COMPATIBLE_MODEL_ENV_VAR ||
    name === OPENAI_COMPATIBLE_API_KEY_ENV_VAR ||
    (OPENAI_COMPATIBLE_ROLE_DEFAULT_ENV_VARS as readonly string[]).includes(name)
  );
}

const OPENAI_COMPATIBLE_ROLE_DEFAULT_ENV_VARS = [
  OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_COUNT_ENV_VAR,
  OPENAI_COMPATIBLE_ROLE_DEFAULT_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_ROLE_DEFAULT_REVIEW_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_ROLE_DEFAULT_CUSTOM_PERSPECTIVE_MODELS_ENV_VAR,
  OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_A_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_B_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_ROLE_DEFAULT_PERSPECTIVE_C_MODEL_ENV_VAR
] as const;

function containsSecretLikeValue(value: string): boolean {
  return /api[_-]?key|secret|private[_-]?token|access[_-]?token|authorization|bearer|sk-[a-z0-9]/i.test(
    value
  );
}

function isNodeFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
