import { describe, expect, it, vi } from "vitest";
import {
  HTTP_TEMPLATE_PARTICIPANT_ADAPTER_CAPABILITIES,
  HttpTemplateAdapterError,
  HttpTemplateParticipantAdapter,
  type HttpTemplateFetchInit,
  type HttpTemplateFetchLike,
  type ParticipantAdapterSafeErrorCategory
} from "../src";

const context = {
  sessionId: "session-1",
  participantId: "participant-1",
  contextCapsuleId: "capsule-1",
  instructions: "Use the Topic Contract and preserve unresolved objections.",
  sourceEventIds: ["event-1", "event-2"]
};

function createFetchResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => body)
  };
}

function createSuccessfulFetch(body: string) {
  return vi.fn(async () => createFetchResponse(body)) as unknown as ReturnType<typeof vi.fn> &
    HttpTemplateFetchLike;
}

function getFetchCall(fetch: ReturnType<typeof vi.fn> & HttpTemplateFetchLike) {
  const call = fetch.mock.calls[0] as [string, HttpTemplateFetchInit] | undefined;

  if (!call) {
    throw new Error("Expected mocked fetch to be called.");
  }

  return call;
}

async function expectSafeHttpTemplateError(
  promise: Promise<unknown>,
  expectedCategory: ParticipantAdapterSafeErrorCategory,
  expectedStatus?: number
): Promise<HttpTemplateAdapterError> {
  let thrown: unknown;

  try {
    await promise;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(HttpTemplateAdapterError);
  const adapterError = thrown as HttpTemplateAdapterError;
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
  }
  expect(serializedError).not.toContain("runtime-secret");
  expect(serializedError).not.toContain("Authorization");
  expect(serializedError).not.toContain("Bearer");
  expect(serializedError).not.toContain("private prompt");
  expect(serializedError).not.toContain("raw provider body");
  expect(serializedError).not.toContain("/Users/");
  expect(serializedError).not.toContain("stack");

  return adapterError;
}

describe("HttpTemplateParticipantAdapter", () => {
  it("renders HTTP templates with runtime provider config and extracts JSON payloads", async () => {
    const fetch = createSuccessfulFetch(
      JSON.stringify({
        model: "runtime-http-model",
        output: {
          contribution: "Template provider contribution",
          echoedSecret: "Bearer runtime-secret"
        }
      })
    );
    const adapter = new HttpTemplateParticipantAdapter({
      adapterId: "http-template-provider",
      request: {
        baseUrl: "https://template.example/api",
        endpointPath: "/contribute",
        headers: {
          Authorization: "Bearer {{runtime.apiKey}}",
          "X-Participant": "{{context.participantId}}",
          "X-Run-Mode": "{{var.mode}}"
        },
        body:
          "{\"model\":\"{{runtime.modelId}}\",\"instructions\":{{input.payloadJson}},\"contextEventIds\":{{context.sourceEventIdsJson}}}"
      },
      response: {
        format: "json",
        payloadPath: "output",
        modelIdPath: "model"
      },
      fetch
    });

    const result = await adapter.prepareContribution(
      {
        instructions: "private prompt",
        payload: {
          task: "compare candidates"
        }
      },
      context,
      {
        apiKey: "runtime-secret",
        modelId: "runtime-http-model",
        httpTemplate: {
          variables: {
            mode: "deliberation"
          }
        }
      }
    );
    const [url, init] = getFetchCall(fetch);
    const body = JSON.parse(init.body ?? "{}") as {
      model: string;
      instructions: { task: string };
      contextEventIds: string[];
    };

    expect(url).toBe("https://template.example/api/contribute");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer runtime-secret",
      "X-Participant": "participant-1",
      "X-Run-Mode": "deliberation",
      "Content-Type": "application/json"
    });
    expect(body).toEqual({
      model: "runtime-http-model",
      instructions: {
        task: "compare candidates"
      },
      contextEventIds: ["event-1", "event-2"]
    });
    expect(result).toMatchObject({
      payload: {
        contribution: "Template provider contribution",
        echoedSecret: "[REDACTED]"
      },
      adapterId: "http-template-provider",
      participantId: "participant-1",
      modelId: "runtime-http-model",
      capabilities: HTTP_TEMPLATE_PARTICIPANT_ADAPTER_CAPABILITIES,
      contextCompleteness: {
        status: "unknown",
        notes: []
      },
      warnings: []
    });
    expect(JSON.stringify(result)).not.toContain("runtime-secret");
  });

  it("supports absolute URL templates and text responses", async () => {
    const fetch = createSuccessfulFetch("plain text contribution");
    const adapter = new HttpTemplateParticipantAdapter({
      request: {
        url: "https://template.example/{{var.workspace}}/participants/{{context.participantId}}",
        method: "PATCH",
        headers: {
          "X-Trace-Session": "{{context.sessionId}}"
        },
        body: "{{input.payloadText}}"
      },
      fetch
    });

    const result = await adapter.prepareContribution(
      {
        payload: {
          content: "text-ish provider request"
        }
      },
      context,
      {
        httpTemplate: {
          variables: {
            workspace: "workspace-1"
          }
        }
      }
    );
    const [url, init] = getFetchCall(fetch);

    expect(url).toBe("https://template.example/workspace-1/participants/participant-1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toContain("text-ish provider request");
    expect(result.payload).toBe("plain text contribution");
    expect(result).not.toHaveProperty("modelId");
  });

  it("rejects unsafe request templates before fetch", async () => {
    const fetch = createSuccessfulFetch("unused");

    expect(
      () =>
        new HttpTemplateParticipantAdapter({
          request: {
            url: "file:///tmp/request",
            headers: {
              Authorization: "Bearer static-secret"
            }
          },
          fetch
        })
    ).toThrow(HttpTemplateAdapterError);

    expect(
      () =>
        new HttpTemplateParticipantAdapter({
          request: {
            url: "https://template.example",
            headers: {
              "X-Api-Key": "sk-inline-secret"
            }
          },
          fetch
        })
    ).toThrow(HttpTemplateAdapterError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns safe provider errors without leaking request or response material", async () => {
    const fetch = vi.fn(async () => createFetchResponse("raw provider body", 429)) as unknown as
      ReturnType<typeof vi.fn> &
      HttpTemplateFetchLike;
    const adapter = new HttpTemplateParticipantAdapter({
      request: {
        url: "https://template.example/contribute",
        headers: {
          Authorization: "Bearer {{runtime.apiKey}}"
        },
        body: "{\"input\":\"{{input.instructions}}\"}"
      },
      fetch
    });

    await expectSafeHttpTemplateError(
      adapter.prepareContribution(
        {
          instructions: "private prompt"
        },
        context,
        {
          apiKey: "runtime-secret"
        }
      ),
      "provider_rate_limited",
      429
    );
  });

  it("rejects malformed JSON responses for JSON response mappings", async () => {
    const fetch = createSuccessfulFetch("not json");
    const adapter = new HttpTemplateParticipantAdapter({
      request: {
        url: "https://template.example/contribute",
        body: "{\"input\":\"{{input.instructions}}\"}"
      },
      response: {
        format: "json"
      },
      fetch
    });

    const error = await expectSafeHttpTemplateError(
      adapter.prepareContribution({ instructions: "Use JSON." }, context),
      "provider_malformed_response"
    );

    expect(error.safeDiagnostics).toEqual({
      providerResponseShape: "other_text"
    });
  });

  it("does not expose event store mutation or semantic authority behavior", () => {
    const adapter = new HttpTemplateParticipantAdapter({
      request: {
        url: "https://template.example/contribute"
      },
      fetch: createSuccessfulFetch("unused")
    });
    const forbiddenMethods = [
      "appendEvent",
      "appendEvents",
      "listEvents",
      "updateEvent",
      "deleteEvent"
    ];
    const forbiddenFields = [
      "currentBest",
      "winner",
      "rank",
      "vote",
      "finalAnswer",
      "truthSummary"
    ];

    for (const method of forbiddenMethods) {
      expect(adapter).not.toHaveProperty(method);
    }

    for (const field of forbiddenFields) {
      expect(adapter).not.toHaveProperty(field);
    }
  });
});
