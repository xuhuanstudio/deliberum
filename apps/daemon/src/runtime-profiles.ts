import { LOCAL_PRESET_ENV_VAR, LOCAL_PRESET_IDS } from "./local-preset";
import {
  HTTP_TEMPLATE_ADAPTER_ID,
  HTTP_TEMPLATE_API_KEY_ENV_VAR,
  HTTP_TEMPLATE_BASE_URL_ENV_VAR,
  HTTP_TEMPLATE_BODY_ENV_VAR,
  HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR,
  HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR,
  HTTP_TEMPLATE_METHOD_ENV_VAR,
  HTTP_TEMPLATE_PROFILE_ENV_VAR,
  HTTP_TEMPLATE_RESPONSE_FORMAT_ENV_VAR,
  HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH_ENV_VAR,
  HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH_ENV_VAR,
  HTTP_TEMPLATE_TIMEOUT_MS_ENV_VAR,
  HTTP_TEMPLATE_URL_ENV_VAR
} from "./http-template-profile";
import {
  OPENAI_COMPATIBLE_ADAPTER_ID,
  OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
  OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
  OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR,
  OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR,
  OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR,
  OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR,
  OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR,
  OPENAI_COMPATIBLE_MODEL_ENV_VAR,
  OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR,
  OPENAI_COMPATIBLE_PROFILE_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR,
  OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR,
  OPENAI_COMPATIBLE_STREAM_ENV_VAR,
  OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR,
  OPENAI_COMPATIBLE_THINKING_ENV_VAR,
  OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR,
  OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR,
  OPENAI_COMPATIBLE_TOP_P_ENV_VAR
} from "./openai-compatible-profile";
import {
  MCP_TOOL_ADAPTER_ID,
  MCP_TOOL_ALLOW_REMOTE_ENV_VAR,
  MCP_TOOL_AUTH_TOKEN_ENV_VAR,
  MCP_TOOL_NAME_ENV_VAR,
  MCP_TOOL_PROFILE_ENV_VAR,
  MCP_TOOL_TIMEOUT_MS_ENV_VAR,
  MCP_TOOL_URL_ENV_VAR,
  MCP_TOOL_VERIFY_LIST_ENV_VAR
} from "./mcp-tool-profile";
import { OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID } from "./openai-compatible-extraction-generator";
import {
  OPENAI_COMPATIBLE_FINAL_AUDITOR_ID,
  OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID
} from "./openai-compatible-finalization-generators";
import { OPENAI_COMPATIBLE_REVIEWER_ID } from "./openai-compatible-review-generator";

export type RuntimeProfileStatus =
  | "disabled"
  | "needs_configuration"
  | "ready"
  | "ready_with_run_config";

export type RuntimeProfileEnvVarView = {
  name: string;
  configured: boolean;
  secret: boolean;
  required: boolean;
  purpose: string;
};

export type RuntimeProfileComponentView = {
  id: string;
  kind:
    | "participant_adapter"
    | "extraction_generator"
    | "candidate_repair_generator"
    | "evidence_check_generator"
    | "proposal_reviewer"
    | "final_candidate_generator"
    | "final_auditor";
  enabled: boolean;
};

export type RuntimeProfileView = {
  id: string;
  name: string;
  enabled: boolean;
  status: RuntimeProfileStatus;
  components: RuntimeProfileComponentView[];
  setup: {
    enableEnvVar: string;
    envVars: RuntimeProfileEnvVarView[];
    missingRecommendedEnvVars: string[];
    notes: string[];
  };
  boundaries: string[];
};

export type RuntimeProfilesResponse = {
  profiles: RuntimeProfileView[];
};

export type RuntimeProfilesProjectionOptions = {
  enableLocalPreset: boolean;
  enableOpenAICompatibleProfile: boolean;
  enableOpenAICompatibleExtraction: boolean;
  enableOpenAICompatibleReview: boolean;
  enableOpenAICompatibleFinalization: boolean;
  openAICompatibleEnv?: Record<string, string | undefined>;
  enableHttpTemplateProfile: boolean;
  httpTemplateEnv?: Record<string, string | undefined>;
  enableMcpToolProfile: boolean;
  mcpToolEnv?: Record<string, string | undefined>;
};

export function buildRuntimeProfilesProjection(
  options: RuntimeProfilesProjectionOptions
): RuntimeProfilesResponse {
  return {
    profiles: [
      buildLocalPresetProfile(options),
      buildOpenAICompatibleProfile(options),
      buildHttpTemplateProfile(options),
      buildMcpToolProfile(options)
    ]
  };
}

function buildLocalPresetProfile(
  options: RuntimeProfilesProjectionOptions
): RuntimeProfileView {
  const enabled = options.enableLocalPreset;

  return {
    id: "local-preset",
    name: "Local preset",
    enabled,
    status: enabled ? "ready" : "disabled",
    components: [
      component(LOCAL_PRESET_IDS.alphaAdapter, "participant_adapter", enabled),
      component(LOCAL_PRESET_IDS.betaAdapter, "participant_adapter", enabled),
      component(LOCAL_PRESET_IDS.extractor, "extraction_generator", enabled),
      component(LOCAL_PRESET_IDS.repairer, "candidate_repair_generator", enabled),
      component(LOCAL_PRESET_IDS.evidenceChecker, "evidence_check_generator", enabled),
      component(LOCAL_PRESET_IDS.reviewer, "proposal_reviewer", enabled),
      component(LOCAL_PRESET_IDS.finalCandidate, "final_candidate_generator", enabled),
      component(LOCAL_PRESET_IDS.auditor, "final_auditor", enabled)
    ],
    setup: {
      enableEnvVar: LOCAL_PRESET_ENV_VAR,
      envVars: [],
      missingRecommendedEnvVars: [],
      notes: [
        "Deterministic local development profile; it does not call external providers."
      ]
    },
    boundaries: [
      "Produces development material only.",
      "Does not make local preset output authoritative."
    ]
  };
}

function buildOpenAICompatibleProfile(
  options: RuntimeProfilesProjectionOptions
): RuntimeProfileView {
  const enabled = options.enableOpenAICompatibleProfile;
  const env = options.openAICompatibleEnv;
  const hasEnvDefaults =
    isConfigured(env, OPENAI_COMPATIBLE_BASE_URL_ENV_VAR) &&
    isConfigured(env, OPENAI_COMPATIBLE_MODEL_ENV_VAR);
  const status = !enabled
    ? "disabled"
    : hasEnvDefaults
      ? "ready"
      : "ready_with_run_config";
  const envVars = [
    envVar(
      OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
      env,
      false,
      false,
      "Default provider base URL when a run plan does not provide one."
    ),
    envVar(
      OPENAI_COMPATIBLE_MODEL_ENV_VAR,
      env,
      false,
      false,
      "Default model id when a run plan does not provide one."
    ),
    envVar(
      OPENAI_COMPATIBLE_API_KEY_ENV_VAR,
      env,
      true,
      false,
      "Default provider secret for run plans that reference this env var."
    ),
    envVar(
      OPENAI_COMPATIBLE_ENDPOINT_PATH_ENV_VAR,
      env,
      false,
      false,
      "Optional chat-completions endpoint path override."
    ),
    envVar(
      OPENAI_COMPATIBLE_TIMEOUT_MS_ENV_VAR,
      env,
      false,
      false,
      "Optional provider request timeout."
    ),
    envVar(
      OPENAI_COMPATIBLE_TOKEN_PARAMETER_ENV_VAR,
      env,
      false,
      false,
      "Optional token parameter compatibility setting."
    ),
    envVar(
      OPENAI_COMPATIBLE_MAX_COMPLETION_TOKENS_ENV_VAR,
      env,
      false,
      false,
      "Optional maximum completion token setting."
    ),
    envVar(
      OPENAI_COMPATIBLE_TEMPERATURE_ENV_VAR,
      env,
      false,
      false,
      "Optional sampling temperature setting."
    ),
    envVar(
      OPENAI_COMPATIBLE_TOP_P_ENV_VAR,
      env,
      false,
      false,
      "Optional top-p sampling setting."
    ),
    envVar(
      OPENAI_COMPATIBLE_STREAM_ENV_VAR,
      env,
      false,
      false,
      "Optional streaming compatibility setting; only false is supported."
    ),
    envVar(
      OPENAI_COMPATIBLE_FREQUENCY_PENALTY_ENV_VAR,
      env,
      false,
      false,
      "Optional frequency penalty setting."
    ),
    envVar(
      OPENAI_COMPATIBLE_PRESENCE_PENALTY_ENV_VAR,
      env,
      false,
      false,
      "Optional presence penalty setting."
    ),
    envVar(
      OPENAI_COMPATIBLE_THINKING_ENV_VAR,
      env,
      false,
      false,
      "Optional reasoning compatibility setting."
    ),
    envVar(
      OPENAI_COMPATIBLE_EXTRACTION_PROVIDER_CONFIG_ID_ENV_VAR,
      env,
      false,
      false,
      "Optional extraction provider config id override."
    ),
    envVar(
      OPENAI_COMPATIBLE_EXTRACTION_RESPONSE_FORMAT_ENV_VAR,
      env,
      false,
      false,
      "Optional extraction response format override."
    ),
    envVar(
      OPENAI_COMPATIBLE_REVIEW_PROVIDER_CONFIG_ID_ENV_VAR,
      env,
      false,
      false,
      "Optional proposal review provider config id override."
    ),
    envVar(
      OPENAI_COMPATIBLE_REVIEW_RESPONSE_FORMAT_ENV_VAR,
      env,
      false,
      false,
      "Optional proposal review response format override."
    ),
    envVar(
      OPENAI_COMPATIBLE_FINAL_CANDIDATE_PROVIDER_CONFIG_ID_ENV_VAR,
      env,
      false,
      false,
      "Optional final candidate provider config id override."
    ),
    envVar(
      OPENAI_COMPATIBLE_FINAL_CANDIDATE_RESPONSE_FORMAT_ENV_VAR,
      env,
      false,
      false,
      "Optional final candidate response format override."
    ),
    envVar(
      OPENAI_COMPATIBLE_FINAL_AUDIT_PROVIDER_CONFIG_ID_ENV_VAR,
      env,
      false,
      false,
      "Optional final audit provider config id override."
    ),
    envVar(
      OPENAI_COMPATIBLE_FINAL_AUDIT_RESPONSE_FORMAT_ENV_VAR,
      env,
      false,
      false,
      "Optional final audit response format override."
    )
  ];

  return {
    id: "openai-compatible",
    name: "OpenAI-compatible",
    enabled,
    status,
    components: [
      component(OPENAI_COMPATIBLE_ADAPTER_ID, "participant_adapter", enabled),
      component(
        OPENAI_COMPATIBLE_EXTRACTION_GENERATOR_ID,
        "extraction_generator",
        enabled && options.enableOpenAICompatibleExtraction
      ),
      component(
        OPENAI_COMPATIBLE_REVIEWER_ID,
        "proposal_reviewer",
        enabled && options.enableOpenAICompatibleReview
      ),
      component(
        OPENAI_COMPATIBLE_FINAL_CANDIDATE_GENERATOR_ID,
        "final_candidate_generator",
        enabled && options.enableOpenAICompatibleFinalization
      ),
      component(
        OPENAI_COMPATIBLE_FINAL_AUDITOR_ID,
        "final_auditor",
        enabled && options.enableOpenAICompatibleFinalization
      )
    ],
    setup: {
      enableEnvVar: OPENAI_COMPATIBLE_PROFILE_ENV_VAR,
      envVars,
      missingRecommendedEnvVars: enabled
        ? missingRecommendedEnvVars(envVars, [
            OPENAI_COMPATIBLE_BASE_URL_ENV_VAR,
            OPENAI_COMPATIBLE_MODEL_ENV_VAR
          ])
        : [],
      notes: [
        `Optional component flags: ${OPENAI_COMPATIBLE_EXTRACTION_ENV_VAR}, ${OPENAI_COMPATIBLE_REVIEW_ENV_VAR}, ${OPENAI_COMPATIBLE_FINALIZATION_ENV_VAR}.`,
        "Run plans may provide provider runtime config instead of daemon-wide provider defaults."
      ]
    },
    boundaries: [
      "Provider secrets stay in daemon runtime env and are reported only as configured or missing.",
      "Profile components create proposal, review, or audit material only."
    ]
  };
}

function buildHttpTemplateProfile(
  options: RuntimeProfilesProjectionOptions
): RuntimeProfileView {
  const enabled = options.enableHttpTemplateProfile;
  const env = options.httpTemplateEnv;
  const hasUrl = isConfigured(env, HTTP_TEMPLATE_URL_ENV_VAR);
  const hasBaseUrl = isConfigured(env, HTTP_TEMPLATE_BASE_URL_ENV_VAR);
  const hasEndpointPath = isConfigured(env, HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR);
  const hasEnvRequestTarget = hasUrl || (hasBaseUrl && hasEndpointPath);
  const status = !enabled
    ? "disabled"
    : hasEnvRequestTarget
      ? "ready"
      : "ready_with_run_config";
  const envVars = [
    envVar(
      HTTP_TEMPLATE_URL_ENV_VAR,
      env,
      false,
      false,
      "Optional full request URL template."
    ),
    envVar(
      HTTP_TEMPLATE_BASE_URL_ENV_VAR,
      env,
      false,
      false,
      "Optional base URL template when a full URL is not configured."
    ),
    envVar(
      HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR,
      env,
      false,
      false,
      "Optional endpoint path template when a full URL is not configured."
    ),
    envVar(
      HTTP_TEMPLATE_METHOD_ENV_VAR,
      env,
      false,
      false,
      "Optional HTTP method override."
    ),
    envVar(
      HTTP_TEMPLATE_HEADERS_JSON_ENV_VAR,
      env,
      false,
      false,
      "Optional JSON object of header templates."
    ),
    envVar(
      HTTP_TEMPLATE_BODY_ENV_VAR,
      env,
      false,
      false,
      "Optional request body template."
    ),
    envVar(
      HTTP_TEMPLATE_RESPONSE_FORMAT_ENV_VAR,
      env,
      false,
      false,
      "Optional response format mapping."
    ),
    envVar(
      HTTP_TEMPLATE_RESPONSE_PAYLOAD_PATH_ENV_VAR,
      env,
      false,
      false,
      "Optional JSON response payload path."
    ),
    envVar(
      HTTP_TEMPLATE_RESPONSE_MODEL_ID_PATH_ENV_VAR,
      env,
      false,
      false,
      "Optional JSON response model id path."
    ),
    envVar(
      HTTP_TEMPLATE_TIMEOUT_MS_ENV_VAR,
      env,
      false,
      false,
      "Optional provider request timeout."
    ),
    envVar(
      HTTP_TEMPLATE_API_KEY_ENV_VAR,
      env,
      true,
      false,
      "Optional runtime secret for templates that reference runtime.apiKey."
    )
  ];

  return {
    id: "http-template",
    name: "HTTP-template",
    enabled,
    status,
    components: [component(HTTP_TEMPLATE_ADAPTER_ID, "participant_adapter", enabled)],
    setup: {
      enableEnvVar: HTTP_TEMPLATE_PROFILE_ENV_VAR,
      envVars,
      missingRecommendedEnvVars: enabled
        ? missingHttpTemplateRequestTargetEnvVars({
            hasUrl,
            hasBaseUrl,
            hasEndpointPath
          })
        : [],
      notes: [
        "Run plans may provide non-secret HTTP-template variables and provider runtime config.",
        "Header and body templates are not returned by this endpoint."
      ]
    },
    boundaries: [
      "Only the participant adapter is installed by this profile.",
      "Secrets are reported only as configured or missing."
    ]
  };
}

function buildMcpToolProfile(
  options: RuntimeProfilesProjectionOptions
): RuntimeProfileView {
  const enabled = options.enableMcpToolProfile;
  const env = options.mcpToolEnv;
  const hasEndpointUrl = isConfigured(env, MCP_TOOL_URL_ENV_VAR);
  const hasToolName = isConfigured(env, MCP_TOOL_NAME_ENV_VAR);
  const hasRequiredConfig = hasEndpointUrl && hasToolName;
  const status = !enabled
    ? "disabled"
    : hasRequiredConfig
      ? "ready"
      : "needs_configuration";
  const envVars = [
    envVar(
      MCP_TOOL_URL_ENV_VAR,
      env,
      false,
      false,
      "Required MCP-compatible JSON-RPC tool endpoint URL."
    ),
    envVar(
      MCP_TOOL_NAME_ENV_VAR,
      env,
      false,
      false,
      "Required allowed tool name for this daemon profile."
    ),
    envVar(
      MCP_TOOL_AUTH_TOKEN_ENV_VAR,
      env,
      true,
      false,
      "Optional bearer token for the MCP-compatible tool endpoint."
    ),
    envVar(
      MCP_TOOL_TIMEOUT_MS_ENV_VAR,
      env,
      false,
      false,
      "Optional MCP tool call timeout."
    ),
    envVar(
      MCP_TOOL_ALLOW_REMOTE_ENV_VAR,
      env,
      false,
      false,
      "Optional explicit opt-in for non-local HTTPS endpoints."
    ),
    envVar(
      MCP_TOOL_VERIFY_LIST_ENV_VAR,
      env,
      false,
      false,
      "Optional tools/list verification toggle; defaults to true."
    )
  ];

  return {
    id: "mcp-tool",
    name: "MCP tool",
    enabled,
    status,
    components: [
      component(MCP_TOOL_ADAPTER_ID, "participant_adapter", enabled && hasRequiredConfig)
    ],
    setup: {
      enableEnvVar: MCP_TOOL_PROFILE_ENV_VAR,
      envVars,
      missingRecommendedEnvVars: enabled
        ? missingRecommendedEnvVars(envVars, [
            MCP_TOOL_URL_ENV_VAR,
            MCP_TOOL_NAME_ENV_VAR
          ])
        : [],
      notes: [
        "The daemon calls one configured MCP-compatible tool endpoint and does not start or manage MCP servers.",
        "Non-local endpoints are rejected unless remote HTTPS access is explicitly enabled."
      ]
    },
    boundaries: [
      "Only the participant adapter is installed by this profile.",
      "Tool endpoint URL, tool name, auth token, and request payloads are not returned by this endpoint.",
      "This profile does not add extraction generators, proposal reviewers, final generators, or semantic authority."
    ]
  };
}

function component(
  id: string,
  kind: RuntimeProfileComponentView["kind"],
  enabled: boolean
): RuntimeProfileComponentView {
  return { id, kind, enabled };
}

function envVar(
  name: string,
  env: Record<string, string | undefined> | undefined,
  secret: boolean,
  required: boolean,
  purpose: string
): RuntimeProfileEnvVarView {
  return {
    name,
    configured: isConfigured(env, name),
    secret,
    required,
    purpose
  };
}

function isConfigured(
  env: Record<string, string | undefined> | undefined,
  name: string
): boolean {
  const value = env?.[name]?.trim();

  return Boolean(value && value.length > 0);
}

function missingRecommendedEnvVars(
  envVars: RuntimeProfileEnvVarView[],
  names: readonly string[]
): string[] {
  return envVars
    .filter((envVarView) => names.includes(envVarView.name) && !envVarView.configured)
    .map((envVarView) => envVarView.name);
}

function missingHttpTemplateRequestTargetEnvVars(input: {
  hasUrl: boolean;
  hasBaseUrl: boolean;
  hasEndpointPath: boolean;
}): string[] {
  if (input.hasUrl || (input.hasBaseUrl && input.hasEndpointPath)) {
    return [];
  }

  const missingBaseTarget = [
    ...(input.hasBaseUrl ? [] : [HTTP_TEMPLATE_BASE_URL_ENV_VAR]),
    ...(input.hasEndpointPath ? [] : [HTTP_TEMPLATE_ENDPOINT_PATH_ENV_VAR])
  ];

  return [HTTP_TEMPLATE_URL_ENV_VAR, ...missingBaseTarget];
}
