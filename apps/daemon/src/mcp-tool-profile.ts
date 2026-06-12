import {
  McpToolAdapterError,
  McpToolParticipantAdapter,
  type McpToolCallRequest,
  type McpToolCallResult,
  type McpToolClient,
  type McpToolDefinition
} from "@deliberum/adapters";
import { AdapterRegistry } from "@deliberum/orchestrator";
import type { DaemonRunOrchestrationOptions } from "./run-orchestration";

export const MCP_TOOL_PROFILE_ENV_VAR = "DELIBERUM_ENABLE_MCP_TOOL_PROFILE" as const;
export const MCP_TOOL_ADAPTER_ID = "mcp-tool" as const;
export const MCP_TOOL_URL_ENV_VAR = "DELIBERUM_MCP_TOOL_URL" as const;
export const MCP_TOOL_NAME_ENV_VAR = "DELIBERUM_MCP_TOOL_NAME" as const;
export const MCP_TOOL_AUTH_TOKEN_ENV_VAR = "DELIBERUM_MCP_TOOL_AUTH_TOKEN" as const;
export const MCP_TOOL_TIMEOUT_MS_ENV_VAR = "DELIBERUM_MCP_TOOL_TIMEOUT_MS" as const;
export const MCP_TOOL_ALLOW_REMOTE_ENV_VAR =
  "DELIBERUM_MCP_TOOL_ALLOW_REMOTE" as const;
export const MCP_TOOL_VERIFY_LIST_ENV_VAR =
  "DELIBERUM_MCP_TOOL_VERIFY_LIST" as const;

export type McpToolFetchInit = {
  method: "POST";
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
};

export type McpToolFetchResponse = {
  ok: boolean;
  status: number;
  json: () => unknown | Promise<unknown>;
};

export type McpToolFetchLike = (
  url: string,
  init: McpToolFetchInit
) => McpToolFetchResponse | Promise<McpToolFetchResponse>;

export type McpToolProfileRegistries = Pick<
  DaemonRunOrchestrationOptions,
  "adapterRegistry"
>;

export type McpToolProfileOptions = {
  env?: Record<string, string | undefined>;
  fetch?: McpToolFetchLike;
};

type McpToolProfileConfig = {
  endpointUrl: string;
  toolName: string;
  authToken?: string;
  timeoutMs?: number;
  verifyList: boolean;
};

type JsonRpcResponse = {
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

export function isMcpToolProfileEnabledFromEnv(
  env: Record<string, string | undefined>
): boolean {
  return env[MCP_TOOL_PROFILE_ENV_VAR] === "true";
}

export function createMcpToolRunRegistries(
  options: McpToolProfileOptions = {}
): McpToolProfileRegistries | undefined {
  const config = readMcpToolProfileConfig(options.env);

  if (!config) {
    return undefined;
  }

  return {
    adapterRegistry: new AdapterRegistry([
      new McpToolParticipantAdapter({
        adapterId: MCP_TOOL_ADAPTER_ID,
        toolName: config.toolName,
        timeoutMs: config.timeoutMs,
        client: createMcpToolHttpClient({
          endpointUrl: config.endpointUrl,
          authToken: config.authToken,
          fetch: options.fetch,
          verifyList: config.verifyList
        }),
        warnings: [
          "MCP tool profile is experimental.",
          "Daemon profile calls only the configured tool and does not manage MCP server lifecycle."
        ]
      })
    ])
  };
}

function readMcpToolProfileConfig(
  env: Record<string, string | undefined> | undefined
): McpToolProfileConfig | undefined {
  const allowRemote = readOptionalBooleanEnv(env, MCP_TOOL_ALLOW_REMOTE_ENV_VAR, false);
  const verifyList = readOptionalBooleanEnv(env, MCP_TOOL_VERIFY_LIST_ENV_VAR, true);
  const timeoutMs = parseOptionalPositiveInteger(
    readOptionalEnv(env, MCP_TOOL_TIMEOUT_MS_ENV_VAR)
  );
  const endpointValue = readOptionalEnv(env, MCP_TOOL_URL_ENV_VAR);
  const toolName = readOptionalEnv(env, MCP_TOOL_NAME_ENV_VAR);

  if (!endpointValue || !toolName) {
    return undefined;
  }

  return {
    endpointUrl: normalizeMcpToolEndpointUrl(endpointValue, allowRemote),
    toolName,
    authToken: readOptionalEnv(env, MCP_TOOL_AUTH_TOKEN_ENV_VAR),
    timeoutMs,
    verifyList
  };
}

function createMcpToolHttpClient(input: {
  endpointUrl: string;
  authToken?: string;
  fetch?: McpToolFetchLike;
  verifyList: boolean;
}): McpToolClient {
  const fetch = input.fetch ?? createGlobalMcpToolFetch();
  let requestIndex = 0;
  const request = async (
    method: string,
    params: Record<string, unknown> | undefined,
    signal?: AbortSignal
  ): Promise<unknown> => {
    requestIndex += 1;

    return postJsonRpc({
      endpointUrl: input.endpointUrl,
      authToken: input.authToken,
      fetch,
      signal,
      method,
      params,
      id: `deliberum-mcp-${requestIndex}`
    });
  };

  return {
    ...(input.verifyList
      ? {
          listTools: async (): Promise<readonly McpToolDefinition[]> => {
            const result = await request("tools/list", undefined);

            if (!result || typeof result !== "object" || Array.isArray(result)) {
              throwMalformedMcpResponse();
            }

            const tools = (result as { tools?: unknown }).tools;

            if (!Array.isArray(tools)) {
              throwMalformedMcpResponse();
            }

            return tools as readonly McpToolDefinition[];
          }
        }
      : {}),
    callTool: async (
      toolRequest: McpToolCallRequest,
      options
    ): Promise<McpToolCallResult> => {
      const result = await request(
        "tools/call",
        {
          name: toolRequest.name,
          arguments: toolRequest.arguments
        },
        options?.signal
      );

      return result as McpToolCallResult;
    }
  };
}

async function postJsonRpc(input: {
  endpointUrl: string;
  authToken?: string;
  fetch: McpToolFetchLike;
  signal?: AbortSignal;
  method: string;
  params: Record<string, unknown> | undefined;
  id: string;
}): Promise<unknown> {
  let response: McpToolFetchResponse;

  try {
    response = await input.fetch(input.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.authToken
          ? {
              Authorization: `Bearer ${input.authToken}`
            }
          : {})
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: input.id,
        method: input.method,
        ...(input.params ? { params: input.params } : {})
      }),
      signal: input.signal
    });
  } catch (error) {
    if (error instanceof McpToolAdapterError) {
      throw error;
    }

    throw new McpToolAdapterError(
      "MCP tool endpoint request failed.",
      "provider_network_error"
    );
  }

  if (!response.ok) {
    throw new McpToolAdapterError(
      "MCP tool endpoint returned an HTTP error.",
      "provider_http_error",
      { httpStatus: response.status }
    );
  }

  const parsedResponse = parseJsonRpcResponse(await response.json());

  if (parsedResponse.error) {
    throw new McpToolAdapterError(
      "MCP tool endpoint returned a JSON-RPC error.",
      "provider_http_error"
    );
  }

  if (!("result" in parsedResponse)) {
    throwMalformedMcpResponse();
  }

  return parsedResponse.result;
}

function createGlobalMcpToolFetch(): McpToolFetchLike {
  return async (url, init) => globalThis.fetch(url, init);
}

function parseJsonRpcResponse(value: unknown): JsonRpcResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throwMalformedMcpResponse();
  }

  const response = value as JsonRpcResponse;

  if (response.error !== undefined) {
    if (
      !response.error ||
      typeof response.error !== "object" ||
      Array.isArray(response.error)
    ) {
      throwMalformedMcpResponse();
    }

    return response;
  }

  return response;
}

function normalizeMcpToolEndpointUrl(value: string, allowRemote: boolean): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throwInvalidMcpToolProfileConfig();
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throwInvalidMcpToolProfileConfig();
  }

  if (parsed.username || parsed.password) {
    throwInvalidMcpToolProfileConfig();
  }

  const local = isLocalHost(parsed.hostname);

  if (!local && !allowRemote) {
    throwInvalidMcpToolProfileConfig();
  }

  if (!local && parsed.protocol !== "https:") {
    throwInvalidMcpToolProfileConfig();
  }

  return parsed.href;
}

function readOptionalEnv(
  env: Record<string, string | undefined> | undefined,
  key: string
): string | undefined {
  const value = env?.[key]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readOptionalBooleanEnv(
  env: Record<string, string | undefined> | undefined,
  key: string,
  defaultValue: boolean
): boolean {
  const value = readOptionalEnv(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throwInvalidMcpToolProfileConfig();
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throwInvalidMcpToolProfileConfig();
  }

  return parsed;
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function throwMalformedMcpResponse(): never {
  throw new McpToolAdapterError(
    "MCP tool endpoint returned an invalid JSON-RPC response.",
    "provider_malformed_response",
    { providerResponseShape: "json_non_object" }
  );
}

function throwInvalidMcpToolProfileConfig(): never {
  throw new McpToolAdapterError(
    "MCP tool profile configuration is invalid.",
    "provider_config_invalid"
  );
}
