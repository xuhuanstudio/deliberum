import { describe, expect, it } from "vitest";
import {
  AdapterInputError,
  FAKE_PARTICIPANT_ADAPTER_CAPABILITIES,
  FakeParticipantAdapter,
  MANUAL_PARTICIPANT_ADAPTER_CAPABILITIES,
  ManualParticipantAdapter
} from "../src";
import * as adapters from "../src";

const context = {
  sessionId: "session-1",
  participantId: "participant-1",
  contextCapsuleId: "capsule-1",
  sourceEventIds: ["event-1"]
};

describe("Participant adapters", () => {
  it("exposes only approved adapter surfaces", () => {
    const exportedNames = Object.keys(adapters);
    const forbiddenExportTerms = [
      "MCP",
      "Daemon",
      "CLI",
      "WebUI",
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

    expect(exportedNames).toEqual(
      expect.arrayContaining([
        "FakeParticipantAdapter",
        "HttpTemplateParticipantAdapter",
        "ManualParticipantAdapter",
        "OpenAICompatibleParticipantAdapter",
        "WebGETParticipantAdapter"
      ])
    );
    for (const exportedName of exportedNames) {
      for (const forbiddenTerm of forbiddenExportTerms) {
        expect(exportedName).not.toContain(forbiddenTerm);
      }
    }
  });

  it("fake adapter returns deterministic cloned output and provenance metadata", async () => {
    const adapter = new FakeParticipantAdapter({
      adapterId: "fake-adapter-1",
      modelId: "deterministic-fixture",
      output: {
        contribution: "configured output",
        nested: {
          value: true
        }
      },
      contextCompleteness: {
        status: "complete",
        notes: ["fixture context"]
      },
      warnings: ["fixture warning"]
    });

    const first = await adapter.prepareContribution({}, context);
    const second = await adapter.prepareContribution({}, context);

    expect(first).toMatchObject({
      adapterId: "fake-adapter-1",
      participantId: "participant-1",
      modelId: "deterministic-fixture",
      capabilities: FAKE_PARTICIPANT_ADAPTER_CAPABILITIES,
      contextCompleteness: {
        status: "complete",
        notes: ["fixture context"]
      },
      warnings: ["fixture warning"]
    });
    expect(first.payload).toEqual(second.payload);
    expect(first.payload).not.toBe(second.payload);

    (first.payload as { nested: { value: boolean } }).nested.value = false;
    expect(second.payload).toEqual({
      contribution: "configured output",
      nested: {
        value: true
      }
    });
  });

  it("manual adapter preserves provided JSON payloads", async () => {
    const adapter = new ManualParticipantAdapter({
      adapterId: "manual-adapter-1",
      contextCompleteness: {
        status: "partial",
        notes: ["human supplied context"]
      }
    });
    const payload = {
      message: "preserve arbitrary user payload keys",
      position: {
        text: "manual contribution"
      }
    };

    const result = await adapter.prepareContribution({ payload }, context);

    expect(result).toMatchObject({
      payload,
      adapterId: "manual-adapter-1",
      participantId: "participant-1",
      capabilities: MANUAL_PARTICIPANT_ADAPTER_CAPABILITIES,
      contextCompleteness: {
        status: "partial",
        notes: ["human supplied context"]
      },
      warnings: []
    });
    expect(result).not.toHaveProperty("modelId");
    expect(result.payload).not.toBe(payload);
  });

  it("manual adapter preserves provided text payloads without model metadata", async () => {
    const adapter = new ManualParticipantAdapter();

    const result = await adapter.prepareContribution({ text: "manual text contribution" }, context);

    expect(result.payload).toBe("manual text contribution");
    expect(result.adapterId).toBe("manual");
    expect(result.participantId).toBe("participant-1");
    expect(result).not.toHaveProperty("modelId");
  });

  it("manual adapter rejects missing or empty manual input", async () => {
    const adapter = new ManualParticipantAdapter();

    expect(() => adapter.prepareContribution({ text: "" }, context)).toThrow(AdapterInputError);
    expect(() =>
      adapter.prepareContribution({} as Parameters<typeof adapter.prepareContribution>[0], context)
    ).toThrow(AdapterInputError);
  });

  it("adapter results do not expose semantic authority fields", async () => {
    const adapter = new FakeParticipantAdapter({
      output: {
        contribution: "not truth"
      }
    });
    const result = await adapter.prepareContribution({}, context);
    const forbiddenResultFields = [
      "currentBest",
      "winner",
      "rank",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary",
      "Judge"
    ];

    for (const field of forbiddenResultFields) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("adapters do not expose event store mutation behavior", () => {
    const fakeAdapter = new FakeParticipantAdapter({ output: "fixture" });
    const manualAdapter = new ManualParticipantAdapter();
    const forbiddenEventStoreMethods = [
      "appendEvent",
      "appendEvents",
      "getEvent",
      "listEvents",
      "listEventsByRange",
      "listEventsByType",
      "listEventsByBatch",
      "listEventsByVisibility",
      "updateEvent",
      "deleteEvent"
    ];

    for (const method of forbiddenEventStoreMethods) {
      expect(fakeAdapter).not.toHaveProperty(method);
      expect(manualAdapter).not.toHaveProperty(method);
    }
  });
});
