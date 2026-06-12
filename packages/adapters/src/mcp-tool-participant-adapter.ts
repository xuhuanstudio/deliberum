import { z } from "zod";
import type {
  AdapterCapabilities,
  ContextCompleteness,
  JsonValue,
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterInput,
  ParticipantAdapterResult,
  ParticipantAdapterSafeDiagnostics,
  ParticipantAdapterSafeErrorCategory
} from "./types";
import {
  AdapterInputError,
  UNKNOWN_CONTEXT_COMPLETENESS,
  cloneCapabilities,
  cloneContextCompleteness,
  validateJsonValue
} from "./types";

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
);

const JsonRecordSchema = z.record(z.string(), JsonValueSchema);

export const McpToolDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: JsonRecordSchema.optional()
  })
  .strict();
export type McpToolDefinition = z.infer<typeof McpToolDefinitionSchema>;

export const McpToolTextContentSchema = z
  .object({
    type: z.literal("text"),
    text: z.string()
  })
  .strict();
export type McpToolTextContent = z.infer<typeof McpToolTextContentSchema>;

export const McpToolJsonContentSchema = z
  .object({
    type: z.literal("json"),
    json: JsonValueSchema
  })
  .strict();
export type McpToolJsonContent = z.infer<typeof McpToolJsonContentSchema>;

export const McpToolContentSchema = z.discriminatedUnion("type", [
  McpToolTextContentSchema,
  McpToolJsonContentSchema
]);
export type McpToolContent = z.infer<typeof McpToolContentSchema>;

export const McpToolCallResultSchema = z
  .object({
    content: z.array(McpToolContentSchema).min(1),
    structuredContent: JsonValueSchema.optional(),
    isError: z.boolean().optional()
  })
  .strict();
export type McpToolCallResult = z.infer<typeof McpToolCallResultSchema>;

export type McpToolCallRequest = {
  name: string;
  arguments: Record<string, JsonValue>;
};

export type McpToolCallOptions = {
  signal?: AbortSignal;
};

export type McpToolClient = {
  listTools?: () => readonly McpToolDefinition[] | Promise<readonly McpToolDefinition[]>;
  callTool: (
    request: McpToolCallRequest,
    options?: McpToolCallOptions
  ) => McpToolCallResult | Promise<McpToolCallResult>;
};

export type McpToolParticipantAdapterInput = ParticipantAdapterInput & {
  toolArguments?: Record<string, JsonValue>;
};

export type McpToolParticipantAdapterConfig = {
  adapterId?: string;
  toolName: string;
  client: McpToolClient;
  timeoutMs?: number;
  capabilities?: AdapterCapabilities;
  contextCompleteness?: ContextCompleteness;
  warnings?: string[];
};

export type McpToolContributionPayload = {
  kind: "mcp_tool_result";
  toolName: string;
  isError: boolean;
  content: McpToolContent[];
  structuredContent?: JsonValue;
};

export const McpToolParticipantAdapterCapabilities: AdapterCapabilities = {
  input: {
    text: true,
    markdown: true,
    json: true,
    imageUrl: false,
    imageBase64: false,
    pdfUrl: false,
    fileUrl: false,
    webBrowsing: false
  },
  output: {
    structuredJson: true,
    markdown: true,
    streaming: false,
    manualPaste: false
  },
  limits: {},
  reliability: "experimental"
};

export class McpToolAdapterError extends Error {
  readonly safeCategory: ParticipantAdapterSafeErrorCategory;
  readonly safeDiagnostics?: ParticipantAdapterSafeDiagnostics;

  constructor(
    message: string,
    safeCategory: ParticipantAdapterSafeErrorCategory = "provider_unknown_error",
    safeDiagnostics: ParticipantAdapterSafeDiagnostics = {}
  ) {
    super(message);
    this.name = "McpToolAdapterError";
    this.safeCategory = safeCategory;
    this.safeDiagnostics = Object.keys(safeDiagnostics).length > 0
      ? { ...safeDiagnostics }
      : undefined;
  }
}

export class McpToolParticipantAdapter
  implements ParticipantAdapter<McpToolParticipantAdapterInput>
{
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  private readonly toolName: string;
  private readonly client: McpToolClient;
  private readonly timeoutMs?: number;
  private readonly contextCompleteness: ContextCompleteness;
  private readonly warnings: string[];

  constructor(config: McpToolParticipantAdapterConfig) {
    this.toolName = normalizeToolName(config.toolName);
    this.client = config.client;
    this.timeoutMs = config.timeoutMs;
    this.adapterId = config.adapterId ?? "mcp-tool";
    this.capabilities = cloneCapabilities(
      config.capabilities ?? McpToolParticipantAdapterCapabilities
    );
    this.contextCompleteness = cloneContextCompleteness(
      config.contextCompleteness ?? UNKNOWN_CONTEXT_COMPLETENESS
    );
    this.warnings = [...(config.warnings ?? ["MCP tool adapter is experimental."])];

    if (this.timeoutMs !== undefined && (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)) {
      throw new McpToolAdapterError(
        "MCP tool adapter timeoutMs must be a positive finite number.",
        "provider_config_invalid"
      );
    }
  }

  async prepareContribution(
    input: McpToolParticipantAdapterInput,
    context: ParticipantAdapterContext
  ): Promise<ParticipantAdapterResult> {
    const request = {
      name: this.toolName,
      arguments: createToolArguments(input, context)
    };

    await assertToolAvailable(this.client, this.toolName);

    const result = await callToolWithTimeout({
      client: this.client,
      request,
      timeoutMs: this.timeoutMs
    });
    const parsedResult = parseToolResult(result);
    const payload = createContributionPayload(this.toolName, parsedResult);

    return {
      payload,
      adapterId: this.adapterId,
      participantId: context.participantId,
      capabilities: cloneCapabilities(this.capabilities),
      contextCompleteness: cloneContextCompleteness(this.contextCompleteness),
      warnings: [...this.warnings]
    };
  }
}

function normalizeToolName(toolName: string): string {
  const normalized = toolName.trim();

  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(normalized)) {
    throw new McpToolAdapterError(
      "MCP tool adapter requires a non-empty safe tool name.",
      "provider_config_invalid"
    );
  }

  return normalized;
}

async function assertToolAvailable(client: McpToolClient, toolName: string): Promise<void> {
  if (!client.listTools) {
    return;
  }

  let tools: readonly McpToolDefinition[];

  try {
    tools = await client.listTools();
  } catch (error) {
    if (error instanceof McpToolAdapterError) {
      throw error;
    }

    throw new McpToolAdapterError(
      "MCP tool adapter could not list tools.",
      "provider_network_error"
    );
  }

  const parsedTools = z.array(McpToolDefinitionSchema).safeParse(tools);

  if (!parsedTools.success) {
    throw new McpToolAdapterError(
      "MCP tool adapter received invalid tool metadata.",
      "provider_malformed_response",
      { providerResponseShape: "json_non_object" }
    );
  }

  if (!parsedTools.data.some((tool) => tool.name === toolName)) {
    throw new McpToolAdapterError(
      "MCP tool adapter requested tool was not found.",
      "provider_not_found"
    );
  }
}

function createToolArguments(
  input: McpToolParticipantAdapterInput,
  context: ParticipantAdapterContext
): Record<string, JsonValue> {
  if (input.toolArguments !== undefined) {
    return cloneJsonRecord(input.toolArguments);
  }

  if (input.instructions === undefined && input.payload === undefined) {
    throw new AdapterInputError(
      "MCP tool adapter input requires instructions, payload, or toolArguments."
    );
  }

  return {
    instructions: input.instructions ?? "",
    payload: input.payload === undefined ? null : validateJsonValue(input.payload),
    context: {
      sessionId: context.sessionId,
      participantId: context.participantId,
      contextCapsuleId: context.contextCapsuleId ?? null,
      sourceEventIds: context.sourceEventIds ?? [],
      instructions: context.instructions ?? ""
    }
  };
}

function cloneJsonRecord(value: Record<string, JsonValue>): Record<string, JsonValue> {
  const parsed = JsonRecordSchema.safeParse(value);

  if (!parsed.success) {
    throw new AdapterInputError("MCP tool adapter toolArguments must be a JSON object.");
  }

  return structuredClone(parsed.data);
}

async function callToolWithTimeout(input: {
  client: McpToolClient;
  request: McpToolCallRequest;
  timeoutMs?: number;
}): Promise<McpToolCallResult> {
  const controller = input.timeoutMs ? new AbortController() : undefined;
  const timeout = controller
    ? setTimeout(() => controller.abort(), input.timeoutMs)
    : undefined;

  try {
    if (!controller) {
      return await input.client.callTool(input.request);
    }

    return await Promise.race([
      input.client.callTool(input.request, { signal: controller.signal }),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => {
            reject(
              new McpToolAdapterError(
                "MCP tool adapter request timed out.",
                "provider_timeout"
              )
            );
          },
          { once: true }
        );
      })
    ]);
  } catch (error) {
    if (error instanceof McpToolAdapterError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new McpToolAdapterError(
        "MCP tool adapter request timed out.",
        "provider_timeout"
      );
    }

    throw new McpToolAdapterError(
      "MCP tool adapter request failed.",
      "provider_unknown_error"
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function parseToolResult(value: unknown): McpToolCallResult {
  const parsed = McpToolCallResultSchema.safeParse(value);

  if (!parsed.success) {
    throw new McpToolAdapterError(
      "MCP tool adapter received invalid tool output.",
      "provider_malformed_response",
      { providerResponseShape: "json_non_object" }
    );
  }

  return parsed.data;
}

function createContributionPayload(
  toolName: string,
  result: McpToolCallResult
): McpToolContributionPayload {
  return {
    kind: "mcp_tool_result",
    toolName,
    isError: result.isError ?? false,
    content: result.content.map(redactContent),
    ...(result.structuredContent !== undefined
      ? { structuredContent: redactJsonValue(result.structuredContent) }
      : {})
  };
}

function redactContent(content: McpToolContent): McpToolContent {
  if (content.type === "text") {
    return {
      type: "text",
      text: redactUnsafeString(content.text)
    };
  }

  return {
    type: "json",
    json: redactJsonValue(content.json)
  };
}

function redactJsonValue(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return redactUnsafeString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactJsonValue(entry)])
    );
  }

  return value;
}

function redactUnsafeString(value: string): string {
  return value
    .replace(/\b(api[_-]?key|secret|access[_-]?token|private[_-]?token|authorization)=Bearer\s+\S+/gi, "$1=[redacted]")
    .replace(/\b(api[_-]?key|secret|access[_-]?token|private[_-]?token|authorization)=\S+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+\S+/gi, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[redacted]")
    .replace(/\/Users\/[^\s"')]+/g, "[redacted-path]");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
