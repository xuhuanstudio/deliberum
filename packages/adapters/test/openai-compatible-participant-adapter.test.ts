import { describe, expect, it, vi } from "vitest";
import {
  OpenAICompatibleAdapterError,
  OpenAICompatibleParticipantAdapter,
  type FetchLike,
  type OpenAICompatibleFetchInit
} from "../src";

const context = {
  sessionId: "session-1",
  participantId: "participant-1",
  contextCapsuleId: "capsule-1",
  instructions: "Use the Topic Contract. Preserve unresolved objections.",
  sourceEventIds: ["event-1"]
};

function createFetchResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body)
  };
}

function createSuccessfulFetch(output = "provider output") {
  return vi.fn(async () =>
    createFetchResponse({
      choices: [
        {
          message: {
            content: output
          }
        }
      ]
    })
  ) as unknown as ReturnType<typeof vi.fn> & FetchLike;
}

function getFetchCall(fetch: ReturnType<typeof vi.fn> & FetchLike) {
  const call = fetch.mock.calls[0] as [string, OpenAICompatibleFetchInit] | undefined;
  if (!call) {
    throw new Error("Expected mocked fetch to be called.");
  }

  return call;
}

describe("OpenAICompatibleParticipantAdapter", () => {
  it("builds an OpenAI-compatible request from adapter input and context", async () => {
    const fetch = createSuccessfulFetch("prepared contribution");
    const adapter = new OpenAICompatibleParticipantAdapter({
      adapterId: "openai-adapter-1",
      baseUrl: "https://provider.example/api",
      apiKey: "sk-test-secret",
      model: "model-1",
      fetch
    });

    const result = await adapter.prepareContribution(
      {
        instructions: "Compare the options.",
        payload: {
          candidate: "A"
        }
      },
      context
    );
    const [url, init] = getFetchCall(fetch);
    const body = JSON.parse(init.body) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };

    expect(url).toBe("https://provider.example/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-test-secret"
    });
    expect(body.model).toBe("model-1");
    expect(body.messages).toEqual([
      {
        role: "system",
        content: "Use the Topic Contract. Preserve unresolved objections."
      },
      {
        role: "user",
        content: expect.stringContaining("Compare the options.")
      }
    ]);
    expect(body.messages[1]?.content).toContain("\"candidate\": \"A\"");
    expect(result).toMatchObject({
      payload: "prepared contribution",
      adapterId: "openai-adapter-1",
      participantId: "participant-1",
      modelId: "model-1",
      contextCompleteness: {
        status: "unknown",
        notes: []
      },
      warnings: []
    });
  });

  it("respects custom baseUrl, endpointPath, and non-secret headers", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example/compatible",
      endpointPath: "/chat/completions",
      model: "model-2",
      headers: {
        "X-Provider-Account": "account-1"
      },
      fetch
    });

    await adapter.prepareContribution({ payload: "manual source" }, context);
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe("https://provider.example/compatible/chat/completions");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Provider-Account": "account-1"
    });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("omits Authorization when apiKey is not configured", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "http://localhost:11434",
      model: "local-model",
      fetch
    });

    await adapter.prepareContribution({ payload: "local provider prompt" }, context);
    const [, init] = getFetchCall(fetch);

    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("rejects custom Authorization headers", () => {
    expect(
      () =>
        new OpenAICompatibleParticipantAdapter({
          baseUrl: "https://provider.example",
          model: "model-1",
          headers: {
            Authorization: "Bearer custom-secret"
          },
          fetch: createSuccessfulFetch()
        })
    ).toThrow(OpenAICompatibleAdapterError);
    expect(
      () =>
        new OpenAICompatibleParticipantAdapter({
          baseUrl: "https://provider.example",
          model: "model-1",
          headers: {
            authorization: "Bearer custom-secret"
          },
          fetch: createSuccessfulFetch()
        })
    ).toThrow(OpenAICompatibleAdapterError);
  });

  it("does not return apiKey, Authorization, request body, or provider headers in metadata", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      headers: {
        "X-Provider-Account": "account-secret"
      },
      fetch
    });

    const result = await adapter.prepareContribution(
      {
        instructions: "Secret prompt should stay out of metadata.",
        payload: {
          privateContext: "do not echo in metadata"
        }
      },
      context
    );
    const metadata = JSON.stringify(result);

    expect(metadata).not.toContain("sk-test-secret");
    expect(metadata).not.toContain("Authorization");
    expect(metadata).not.toContain("account-secret");
    expect(metadata).not.toContain("Secret prompt should stay out of metadata.");
    expect(metadata).not.toContain("privateContext");
  });

  it("throws a redacted error for failed HTTP responses", async () => {
    const fetch = vi.fn(async () =>
      createFetchResponse(
        {
          error: {
            message: "provider says sk-test-secret account-secret private prompt"
          }
        },
        401
      )
    ) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      headers: {
        "X-Provider-Account": "account-secret"
      },
      fetch
    });

    await expect(
      adapter.prepareContribution(
        {
          instructions: "private prompt",
          payload: {
            privateContext: "hidden"
          }
        },
        context
      )
    ).rejects.toThrow(OpenAICompatibleAdapterError);
    await expect(
      adapter.prepareContribution({ instructions: "private prompt" }, context)
    ).rejects.not.toThrow(/sk-test-secret|account-secret|private prompt|privateContext/);
  });

  it("throws a redacted error for fetch failures", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("network failed with sk-test-secret account-secret private prompt");
    }) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      headers: {
        "X-Provider-Account": "account-secret"
      },
      fetch
    });

    await expect(
      adapter.prepareContribution({ instructions: "private prompt" }, context)
    ).rejects.not.toThrow(/sk-test-secret|account-secret|private prompt/);
  });

  it("handles malformed provider responses safely", async () => {
    const fetch = vi.fn(async () =>
      createFetchResponse({
        choices: [
          {
            message: {}
          }
        ],
        echoed: "private prompt"
      })
    ) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      fetch
    });

    await expect(
      adapter.prepareContribution({ instructions: "private prompt" }, context)
    ).rejects.toThrow(OpenAICompatibleAdapterError);
    await expect(
      adapter.prepareContribution({ instructions: "private prompt" }, context)
    ).rejects.not.toThrow(/sk-test-secret|private prompt|echoed/);
  });

  it("does not expose EventStore, core lifecycle, or semantic-authority behavior", async () => {
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      model: "model-1",
      fetch: createSuccessfulFetch()
    });
    const result = await adapter.prepareContribution({ payload: "not truth" }, context);
    const forbiddenFields = [
      "appendEvent",
      "appendEvents",
      "getEvent",
      "listEvents",
      "createSession",
      "openSealedBatch",
      "submitSealedContribution",
      "closeSealedBatch",
      "currentBest",
      "winner",
      "rank",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary",
      "Judge"
    ];

    for (const field of forbiddenFields) {
      expect(adapter).not.toHaveProperty(field);
      expect(result).not.toHaveProperty(field);
    }
  });
});
