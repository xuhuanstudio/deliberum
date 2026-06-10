import { describe, expect, it } from "vitest";
import {
  AdapterInputError,
  WEBGET_PARTICIPANT_ADAPTER_CAPABILITIES,
  WebGETParticipantAdapter,
  parseWebGETCommittedSubmission
} from "../src";
import * as adapters from "../src";

const context = {
  sessionId: "session-1",
  participantId: "participant-web",
  contextCapsuleId: "capsule-1"
};

describe("WebGETParticipantAdapter", () => {
  it("returns a local context capsule payload and experimental capabilities", () => {
    const adapter = new WebGETParticipantAdapter({
      adapterId: "webget-adapter-1",
      warnings: ["fixture warning"]
    });

    const result = adapter.prepareContribution(
      {
        startUrl: "http://127.0.0.1:3877/webget/token/start",
        expiresAt: "2026-06-10T00:10:00.000Z",
        instructions: "Use the Topic Contract."
      },
      context
    );

    expect(result).toMatchObject({
      adapterId: "webget-adapter-1",
      participantId: "participant-web",
      capabilities: WEBGET_PARTICIPANT_ADAPTER_CAPABILITIES,
      warnings: ["fixture warning"]
    });
    expect(result).not.toHaveProperty("modelId");
    expect(result.payload).toMatchObject({
      kind: "webget_context_capsule",
      adapterId: "webget-adapter-1",
      participantId: "participant-web",
      startUrl: "http://127.0.0.1:3877/webget/token/start",
      expectedSubmission: {
        encoding: "base64url",
        requiredFields: ["output", "readReport", "contextCompleteness"]
      },
      manualPasteFallback: true
    });
  });

  it("rejects non-local start URLs for Stage 13", () => {
    const adapter = new WebGETParticipantAdapter();

    expect(() =>
      adapter.prepareContribution(
        {
          startUrl: "https://public.example/webget/token/start",
          expiresAt: "2026-06-10T00:10:00.000Z"
        },
        context
      )
    ).toThrow(AdapterInputError);
  });

  it("validates committed submission structure and read report", () => {
    const validSubmission = {
      output: {
        contribution: "independent response"
      },
      readReport: {
        contextPagesRead: ["overview", "frontier"],
        resourcesViewed: [],
        resourcesSummaryOnly: [],
        submissionMode: "chunked_get",
        contextCompleteness: {
          status: "partial",
          notes: ["frontier read"]
        }
      },
      contextCompleteness: {
        status: "partial",
        notes: ["resource unavailable"]
      }
    };

    expect(parseWebGETCommittedSubmission(validSubmission)).toEqual(validSubmission);
    expect(() =>
      parseWebGETCommittedSubmission({
        output: "missing read report",
        contextCompleteness: {
          status: "unknown",
          notes: []
        }
      })
    ).toThrow();
  });

  it("does not expose EventStore, provider call, MCP, or semantic authority APIs", () => {
    const adapter = new WebGETParticipantAdapter() as unknown as Record<string, unknown>;
    const exportedNames = Object.keys(adapters);
    const forbiddenExportTerms = [
      "MCP",
      "OpenAICompatibleWebGET",
      "DaemonRoute",
      "WebUI",
      "CLI",
      "CandidateFrontier",
      "FinalDecision",
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "CentralRanker",
      "TruthSummary",
      "Ranking",
      "Voting",
      "Chat"
    ];

    for (const exportedName of exportedNames) {
      for (const forbiddenTerm of forbiddenExportTerms) {
        expect(exportedName).not.toContain(forbiddenTerm);
      }
    }

    for (const forbiddenMethod of [
      "appendEvent",
      "appendEvents",
      "fetch",
      "request",
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
