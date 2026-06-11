import { describe, expect, it, vi } from "vitest";
import {
  OpenAICompatibleAdapterError,
  OpenAICompatibleParticipantAdapter,
  type FetchLike,
  type OpenAICompatibleFetchInit,
  type ParticipantAdapterSafeErrorCategory
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

async function expectSafeOpenAIError(
  promise: Promise<unknown>,
  expectedCategory: ParticipantAdapterSafeErrorCategory,
  expectedStatus?: number
): Promise<OpenAICompatibleAdapterError> {
  let thrown: unknown;

  try {
    await promise;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
  const adapterError = thrown as OpenAICompatibleAdapterError;
  const serializedError = `${adapterError.message}\n${JSON.stringify(adapterError)}`;

  expect(adapterError.safeCategory).toBe(expectedCategory);
  if (expectedStatus !== undefined) {
    expect(adapterError.httpStatus).toBe(expectedStatus);
    expect(adapterError.status).toBe(expectedStatus);
    expect(adapterError.safeDiagnostics).toEqual({
      httpStatus: expectedStatus
    });
  } else {
    expect(adapterError.httpStatus).toBeUndefined();
    expect(adapterError.status).toBeUndefined();
    expect(adapterError.safeDiagnostics).toBeUndefined();
  }
  expect(serializedError).not.toContain("sk-test-secret");
  expect(serializedError).not.toContain("account-secret");
  expect(serializedError).not.toContain("Authorization");
  expect(serializedError).not.toContain("Bearer");
  expect(serializedError).not.toContain("private prompt");
  expect(serializedError).not.toContain("privateContext");
  expect(serializedError).not.toContain("raw provider body");
  expect(serializedError).not.toContain("/Users/");
  expect(serializedError).not.toContain("stack");

  return adapterError;
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
    expect(Object.keys(body)).toEqual(["model", "messages"]);
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

  it("uses runtime provider config at dispatch time over constructor defaults", async () => {
    const fetch = createSuccessfulFetch("runtime provider output");
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://constructor.example/api",
      apiKey: "sk-constructor-secret",
      model: "constructor-model",
      endpointPath: "/constructor/completions",
      timeoutMs: 500,
      fetch
    });

    const result = await adapter.prepareContribution(
      { instructions: "Use runtime provider settings." },
      context,
      {
        apiKey: "sk-runtime-secret",
        baseUrl: "https://runtime.example/api",
        modelId: "runtime-model",
        endpointPath: "/chat/completions",
        timeoutMs: 1000
      }
    );
    const [url, init] = getFetchCall(fetch);
    const body = JSON.parse(init.body) as { model: string };
    const resultText = JSON.stringify(result);

    expect(url).toBe("https://runtime.example/api/chat/completions");
    expect(body.model).toBe("runtime-model");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-runtime-secret"
    });
    expect(result).toMatchObject({
      payload: "runtime provider output",
      modelId: "runtime-model"
    });
    expect(resultText).not.toContain("sk-runtime-secret");
    expect(resultText).not.toContain("sk-constructor-secret");
    expect(resultText).not.toContain("Authorization");
  });

  it("emits max_completion_tokens when configured", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      model: "model-1",
      requestOptions: {
        tokenParameter: "max_completion_tokens",
        maxCompletionTokens: 1024
      },
      fetch
    });

    await adapter.prepareContribution({ payload: "safe prompt" }, context);
    const [, init] = getFetchCall(fetch);
    const body = JSON.parse(init.body) as {
      max_completion_tokens?: number;
      max_tokens?: number;
    };

    expect(body.max_completion_tokens).toBe(1024);
    expect(body.max_tokens).toBeUndefined();
  });

  it("emits max_tokens when configured", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      model: "model-1",
      requestOptions: {
        tokenParameter: "max_tokens",
        maxCompletionTokens: 512
      },
      fetch
    });

    await adapter.prepareContribution({ payload: "safe prompt" }, context);
    const [, init] = getFetchCall(fetch);
    const body = JSON.parse(init.body) as {
      max_completion_tokens?: number;
      max_tokens?: number;
    };

    expect(body.max_tokens).toBe(512);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it("emits MiMo-style non-secret request options when configured", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      model: "model-1",
      requestOptions: {
        maxCompletionTokens: 1024,
        temperature: 1,
        topP: 0.95,
        stream: false,
        frequencyPenalty: 0,
        presencePenalty: 0,
        thinking: "disabled"
      },
      fetch
    });

    await adapter.prepareContribution({ payload: "safe prompt" }, context);
    const [, init] = getFetchCall(fetch);
    const body = JSON.parse(init.body) as {
      max_completion_tokens?: number;
      temperature?: number;
      top_p?: number;
      stream?: boolean;
      frequency_penalty?: number;
      presence_penalty?: number;
      thinking?: unknown;
    };

    expect(body).toMatchObject({
      max_completion_tokens: 1024,
      temperature: 1,
      top_p: 0.95,
      stream: false,
      frequency_penalty: 0,
      presence_penalty: 0,
      thinking: {
        type: "disabled"
      }
    });
  });

  it("rejects unsupported stream true before fetch", async () => {
    const fetch = createSuccessfulFetch();
    let thrown: unknown;

    try {
      new OpenAICompatibleParticipantAdapter({
        baseUrl: "https://provider.example",
        model: "model-1",
        requestOptions: {
          stream: true
        } as never,
        fetch
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
    expect((thrown as OpenAICompatibleAdapterError).safeCategory).toBe(
      "provider_config_invalid"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid numeric request options before fetch", async () => {
    const fetch = createSuccessfulFetch();
    let thrown: unknown;

    try {
      new OpenAICompatibleParticipantAdapter({
        baseUrl: "https://provider.example",
        model: "model-1",
        requestOptions: {
          maxCompletionTokens: 0,
          temperature: Number.NaN
        },
        fetch
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
    const adapterError = thrown as OpenAICompatibleAdapterError;
    const serializedError = `${adapterError.message}\n${JSON.stringify(adapterError)}`;

    expect(adapterError.safeCategory).toBe("provider_config_invalid");
    expect(serializedError).not.toContain("safe prompt");
    expect(serializedError).not.toContain("Authorization");
    expect(serializedError).not.toContain("Bearer");
    expect(serializedError).not.toContain("/Users/");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires an effective baseUrl and model from constructor or runtime config", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      fetch
    });

    const missingBaseUrlError = await expectSafeOpenAIError(
      adapter.prepareContribution({ payload: "missing config" }, context),
      "provider_config_invalid"
    );
    const missingModelError = await expectSafeOpenAIError(
      adapter.prepareContribution({ payload: "missing model" }, context, {
        baseUrl: "https://runtime.example"
      }),
      "provider_config_invalid"
    );

    expect(missingBaseUrlError.message).toBe("OpenAI-compatible adapter baseUrl is required.");
    expect(missingModelError.message).toBe("OpenAI-compatible adapter model is required.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps invalid provider URL config to provider_config_invalid", async () => {
    const fetch = createSuccessfulFetch();
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "not a valid url",
      model: "model-1",
      fetch
    });

    await expectSafeOpenAIError(
      adapter.prepareContribution({ payload: "invalid provider config" }, context),
      "provider_config_invalid"
    );
    expect(fetch).not.toHaveBeenCalled();
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
    const createWithAuthorization = () =>
      new OpenAICompatibleParticipantAdapter({
        baseUrl: "https://provider.example",
        model: "model-1",
        headers: {
          Authorization: "Bearer custom-secret"
        },
        fetch: createSuccessfulFetch()
      });
    const createWithLowercaseAuthorization = () =>
      new OpenAICompatibleParticipantAdapter({
        baseUrl: "https://provider.example",
        model: "model-1",
        headers: {
          authorization: "Bearer custom-secret"
        },
        fetch: createSuccessfulFetch()
      });

    for (const createAdapter of [createWithAuthorization, createWithLowercaseAuthorization]) {
      let thrown: unknown;

      try {
        createAdapter();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(OpenAICompatibleAdapterError);
      expect((thrown as OpenAICompatibleAdapterError).safeCategory).toBe(
        "provider_config_invalid"
      );
      expect(`${(thrown as Error).message}\n${JSON.stringify(thrown)}`).not.toContain(
        "custom-secret"
      );
    }
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

  it("redacts known provider secrets from contribution payloads", async () => {
    const fetch = createSuccessfulFetch(
      "provider echoed sk-runtime-secret and Bearer sk-runtime-secret and account-secret"
    );
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-runtime-secret",
      model: "model-1",
      headers: {
        "X-Provider-Account": "account-secret"
      },
      fetch
    });

    const result = await adapter.prepareContribution({ payload: "safe prompt" }, context);
    const resultText = JSON.stringify(result);

    expect(resultText).not.toContain("sk-runtime-secret");
    expect(resultText).not.toContain("Bearer sk-runtime-secret");
    expect(resultText).not.toContain("account-secret");
    expect(result.payload).toContain("[REDACTED]");
  });

  it.each([
    [400, "provider_http_error"],
    [401, "provider_auth_failed"],
    [403, "provider_auth_failed"],
    [404, "provider_not_found"],
    [429, "provider_rate_limited"],
    [500, "provider_http_error"]
  ] satisfies Array<[number, ParticipantAdapterSafeErrorCategory]>)(
    "maps HTTP status %i to %s without leaking provider body",
    async (status, expectedCategory) => {
      const fetch = vi.fn(async () =>
        createFetchResponse(
          {
            error: {
              message: "raw provider body says sk-test-secret account-secret private prompt"
            }
          },
          status
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

      await expectSafeOpenAIError(
        adapter.prepareContribution(
          {
            instructions: "private prompt",
            payload: {
              privateContext: "hidden"
            }
          },
          context
        ),
        expectedCategory,
        status
      );
    }
  );

  it("does not attach unsafe or invalid HTTP status diagnostics", async () => {
    const fetch = vi.fn(async () =>
      createFetchResponse(
        {
          error: {
            message: "raw provider body says sk-test-secret private prompt"
          }
        },
        700
      )
    ) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      fetch
    });

    await expectSafeOpenAIError(
      adapter.prepareContribution({ instructions: "private prompt" }, context),
      "provider_http_error"
    );
  });

  it("maps fetch rejection to provider_network_error without leaking raw errors", async () => {
    const fetch = vi.fn(async () =>
      Promise.reject(
        new Error(
          "network failed with sk-test-secret account-secret private prompt /Users/provider.log"
        )
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

    await expectSafeOpenAIError(
      adapter.prepareContribution({ instructions: "private prompt" }, context),
      "provider_network_error"
    );
  });

  it("maps request timeout to provider_timeout without leaking raw errors", async () => {
    const fetch = vi.fn((_url: string, init: OpenAICompatibleFetchInit) => {
      return new Promise<Awaited<ReturnType<FetchLike>>>((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(
            new Error(
              "timeout failed with sk-test-secret account-secret private prompt /Users/provider.log"
            )
          );
        });
      });
    }) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      headers: {
        "X-Provider-Account": "account-secret"
      },
      timeoutMs: 1,
      fetch
    });

    await expectSafeOpenAIError(
      adapter.prepareContribution({ instructions: "private prompt" }, context),
      "provider_timeout"
    );
  });

  it("maps malformed response JSON to provider_malformed_response", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: vi.fn(async () => {
        throw new Error("raw provider body with sk-test-secret private prompt");
      })
    })) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      headers: {
        "X-Provider-Account": "account-secret"
      },
      fetch
    });

    await expectSafeOpenAIError(
      adapter.prepareContribution({ instructions: "private prompt" }, context),
      "provider_malformed_response"
    );
  });

  it("maps valid JSON missing message content to provider_response_missing_content", async () => {
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

    await expectSafeOpenAIError(
      adapter.prepareContribution({ instructions: "private prompt" }, context),
      "provider_response_missing_content"
    );
  });

  it("maps empty provider choices to provider_response_empty", async () => {
    const fetch = vi.fn(async () =>
      createFetchResponse({
        choices: [],
        echoed: "raw provider body with sk-test-secret private prompt"
      })
    ) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      fetch
    });

    await expectSafeOpenAIError(
      adapter.prepareContribution({ instructions: "private prompt" }, context),
      "provider_response_empty"
    );
  });

  it("maps blank message content to provider_response_empty", async () => {
    const fetch = vi.fn(async () =>
      createFetchResponse({
        choices: [
          {
            message: {
              content: "   "
            }
          }
        ],
        echoed: "raw provider body with sk-test-secret private prompt"
      })
    ) as unknown as ReturnType<typeof vi.fn> & FetchLike;
    const adapter = new OpenAICompatibleParticipantAdapter({
      baseUrl: "https://provider.example",
      apiKey: "sk-test-secret",
      model: "model-1",
      fetch
    });

    await expectSafeOpenAIError(
      adapter.prepareContribution({ instructions: "private prompt" }, context),
      "provider_response_empty"
    );
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
