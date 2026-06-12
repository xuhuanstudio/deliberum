import { describe, expect, it, vi } from "vitest";
import {
  AdapterInputError,
  McpToolAdapterError,
  McpToolParticipantAdapterCapabilities,
  McpToolParticipantAdapter,
  type McpToolClient
} from "../src";

const context = {
  sessionId: "session-1",
  participantId: "participant-mcp",
  contextCapsuleId: "capsule-1",
  instructions: "Return independent contribution material only.",
  sourceEventIds: ["event-1"]
};

describe("McpToolParticipantAdapter", () => {
  it("calls the configured tool with structured participant context", async () => {
    const client: McpToolClient = {
      listTools: vi.fn(async () => [
        {
          name: "deliberum.contribute",
          description: "Return participant material."
        }
      ]),
      callTool: vi.fn(async () => ({
        content: [
          {
            type: "text",
            text: "Use candidate A while keeping objections visible."
          }
        ],
        structuredContent: {
          contribution: "Use candidate A",
          limitations: ["Still provisional"]
        }
      }))
    };
    const adapter = new McpToolParticipantAdapter({
      adapterId: "mcp-tool-fixture",
      toolName: "deliberum.contribute",
      client,
      warnings: ["fixture warning"]
    });

    const result = await adapter.prepareContribution(
      {
        instructions: "Prepare a sealed divergence contribution.",
        payload: {
          topic: "Should Deliberum expose MCP-compatible participants?"
        }
      },
      context
    );

    expect(client.listTools).toHaveBeenCalledTimes(1);
    expect(client.callTool).toHaveBeenCalledWith(
      {
        name: "deliberum.contribute",
        arguments: {
          instructions: "Prepare a sealed divergence contribution.",
          payload: {
            topic: "Should Deliberum expose MCP-compatible participants?"
          },
          context: {
            sessionId: "session-1",
            participantId: "participant-mcp",
            contextCapsuleId: "capsule-1",
            sourceEventIds: ["event-1"],
            instructions: "Return independent contribution material only."
          }
        }
      }
    );
    expect(result).toMatchObject({
      adapterId: "mcp-tool-fixture",
      participantId: "participant-mcp",
      capabilities: McpToolParticipantAdapterCapabilities,
      warnings: ["fixture warning"],
      payload: {
        kind: "mcp_tool_result",
        toolName: "deliberum.contribute",
        isError: false,
        content: [
          {
            type: "text",
            text: "Use candidate A while keeping objections visible."
          }
        ],
        structuredContent: {
          contribution: "Use candidate A",
          limitations: ["Still provisional"]
        }
      }
    });
    expect(result).not.toHaveProperty("modelId");
  });

  it("preserves explicit JSON tool arguments without mutating caller-owned input", async () => {
    const toolArguments = {
      query: "Find supporting evidence",
      constraints: ["Do not decide the outcome"]
    };
    const client: McpToolClient = {
      callTool: vi.fn(async () => ({
        content: [
          {
            type: "json",
            json: {
              evidence: "reported only"
            }
          }
        ]
      }))
    };
    const adapter = new McpToolParticipantAdapter({
      toolName: "evidence.search",
      client
    });

    const result = await adapter.prepareContribution({ toolArguments }, context);

    expect(client.callTool).toHaveBeenCalledWith({
      name: "evidence.search",
      arguments: toolArguments
    });
    expect(result.payload).toMatchObject({
      kind: "mcp_tool_result",
      content: [
        {
          type: "json",
          json: {
            evidence: "reported only"
          }
        }
      ]
    });

    ((client.callTool as ReturnType<typeof vi.fn>).mock.calls[0]![0].arguments as typeof toolArguments).constraints[0] =
      "mutated";
    expect(toolArguments.constraints[0]).toBe("Do not decide the outcome");
  });

  it("can omit default context when execution policy disables context forwarding", async () => {
    const client: McpToolClient = {
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: "context omitted" }]
      }))
    };
    const adapter = new McpToolParticipantAdapter({
      toolName: "minimal.tool",
      client,
      executionPolicy: {
        includeContext: false
      }
    });

    await adapter.prepareContribution(
      {
        instructions: "Return a minimal contribution.",
        payload: {
          topic: "Context forwarding should be optional."
        }
      },
      context
    );

    expect(client.callTool).toHaveBeenCalledWith({
      name: "minimal.tool",
      arguments: {
        instructions: "Return a minimal contribution.",
        payload: {
          topic: "Context forwarding should be optional."
        }
      }
    });
  });

  it("rejects arguments that violate configured execution policy before calling tools", async () => {
    const client: McpToolClient = {
      listTools: vi.fn(async () => [{ name: "bounded.tool" }]),
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: "unused" }]
      }))
    };
    const allowListAdapter = new McpToolParticipantAdapter({
      toolName: "bounded.tool",
      client,
      executionPolicy: {
        allowedArgumentKeys: ["query"]
      }
    });
    const sizeLimitAdapter = new McpToolParticipantAdapter({
      toolName: "bounded.tool",
      client,
      executionPolicy: {
        maxArgumentBytes: 16
      }
    });

    await expect(
      allowListAdapter.prepareContribution(
        {
          toolArguments: {
            query: "find evidence",
            privatePrompt: "do not leak this"
          }
        },
        context
      )
    ).rejects.toThrow(AdapterInputError);
    await expect(
      sizeLimitAdapter.prepareContribution(
        {
          toolArguments: {
            query: "this argument is intentionally too large"
          }
        },
        context
      )
    ).rejects.toThrow(AdapterInputError);
    expect(client.listTools).not.toHaveBeenCalled();
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it("rejects invalid execution policy configuration with safe categories", () => {
    const client: McpToolClient = {
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: "unused" }]
      }))
    };

    for (const executionPolicy of [
      { maxArgumentBytes: 0 },
      { maxArgumentBytes: Number.NaN },
      { allowedArgumentKeys: [] },
      { allowedArgumentKeys: ["query", "query"] },
      { allowedArgumentKeys: ["unsafe key"] }
    ]) {
      try {
        new McpToolParticipantAdapter({
          toolName: "bounded.tool",
          client,
          executionPolicy
        });
        throw new Error("Expected invalid MCP execution policy to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(McpToolAdapterError);
        expect((error as McpToolAdapterError).safeCategory).toBe(
          "provider_config_invalid"
        );
      }
    }
  });

  it("rejects missing input, unsafe tool names, and unavailable tools with safe errors", async () => {
    const client: McpToolClient = {
      listTools: vi.fn(async () => [{ name: "available.tool" }]),
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: "unused" }]
      }))
    };
    const adapter = new McpToolParticipantAdapter({
      toolName: "missing.tool",
      client
    });

    await expect(adapter.prepareContribution({}, context)).rejects.toThrow(AdapterInputError);
    expect(
      () =>
        new McpToolParticipantAdapter({
          toolName: "../unsafe",
          client
        })
    ).toThrow(McpToolAdapterError);

    try {
      await adapter.prepareContribution({ instructions: "Call the tool." }, context);
      throw new Error("Expected unavailable MCP tool to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolAdapterError);
      expect((error as McpToolAdapterError).safeCategory).toBe("provider_not_found");
    }
  });

  it("preserves safe categories from failed tool listing", async () => {
    const adapter = new McpToolParticipantAdapter({
      toolName: "diagnostic.tool",
      client: {
        listTools: vi.fn(async () => {
          throw new McpToolAdapterError(
            "MCP bridge rejected tools/list.",
            "provider_http_error",
            { httpStatus: 403 }
          );
        }),
        callTool: vi.fn(async () => ({
          content: [{ type: "text", text: "unused" }]
        }))
      }
    });

    try {
      await adapter.prepareContribution({ instructions: "Call the tool." }, context);
      throw new Error("Expected MCP list failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolAdapterError);
      expect((error as McpToolAdapterError).safeCategory).toBe("provider_http_error");
      expect((error as McpToolAdapterError).safeDiagnostics).toEqual({
        httpStatus: 403
      });
    }
  });

  it("maps timeouts and malformed tool output to safe categories", async () => {
    const timeoutAdapter = new McpToolParticipantAdapter({
      toolName: "slow.tool",
      timeoutMs: 1,
      client: {
        callTool: vi.fn(
          () =>
            new Promise(() => {
              // Intentionally unresolved.
            })
        )
      }
    });
    const malformedAdapter = new McpToolParticipantAdapter({
      toolName: "bad.tool",
      client: {
        callTool: vi.fn(async () => ({
          content: []
        }))
      }
    });

    await expectMcpError(
      timeoutAdapter.prepareContribution({ instructions: "Run slowly." }, context),
      "provider_timeout"
    );
    await expectMcpError(
      malformedAdapter.prepareContribution({ instructions: "Return malformed output." }, context),
      "provider_malformed_response"
    );
  });

  it("redacts obvious secrets and local paths from tool output", async () => {
    const adapter = new McpToolParticipantAdapter({
      toolName: "diagnostic.tool",
      client: {
        callTool: vi.fn(async () => ({
          content: [
            {
              type: "text",
              text: "authorization=Bearer secret-token path=/Users/alice/project"
            }
          ],
          structuredContent: {
            apiKey: "api_key=secret-value",
            nested: ["sk-testsecret123456"]
          }
        }))
      }
    });

    const result = await adapter.prepareContribution(
      { instructions: "Return diagnostics." },
      context
    );
    const serialized = JSON.stringify(result);

    expect(serialized).toContain("authorization=[redacted]");
    expect(serialized).toContain("[redacted-path]");
    expect(serialized).toContain("api_key=[redacted]");
    expect(serialized).toContain("sk-[redacted]");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("Bearer ");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("/Users/alice");
  });

  it("does not expose ledger, daemon, ranking, voting, or final authority APIs", () => {
    const adapter = new McpToolParticipantAdapter({
      toolName: "safe.tool",
      client: {
        callTool: vi.fn(async () => ({
          content: [{ type: "text", text: "safe" }]
        }))
      }
    }) as unknown as Record<string, unknown>;

    for (const forbiddenMethod of [
      "appendEvent",
      "appendEvents",
      "getEvent",
      "listEvents",
      "startDaemon",
      "rank",
      "vote",
      "judge",
      "currentBest",
      "finalAnswer",
      "truthSummary"
    ]) {
      expect(adapter).not.toHaveProperty(forbiddenMethod);
    }
  });
});

async function expectMcpError(
  promise: Promise<unknown>,
  safeCategory: McpToolAdapterError["safeCategory"]
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected MCP adapter call to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(McpToolAdapterError);
    expect((error as McpToolAdapterError).safeCategory).toBe(safeCategory);
  }
}
