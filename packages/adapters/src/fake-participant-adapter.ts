import type {
  AdapterCapabilities,
  ContextCompleteness,
  JsonValue,
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterInput,
  ParticipantAdapterResult
} from "./types";
import {
  UNKNOWN_CONTEXT_COMPLETENESS,
  cloneCapabilities,
  cloneContextCompleteness,
  cloneJsonValue
} from "./types";

export const FAKE_PARTICIPANT_ADAPTER_CAPABILITIES: AdapterCapabilities = {
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
  reliability: "high"
};

export type FakeParticipantAdapterOptions = {
  adapterId?: string;
  output: JsonValue;
  modelId?: string;
  capabilities?: AdapterCapabilities;
  contextCompleteness?: ContextCompleteness;
  warnings?: string[];
};

export class FakeParticipantAdapter implements ParticipantAdapter {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  private readonly output: JsonValue;
  private readonly modelId?: string;
  private readonly contextCompleteness: ContextCompleteness;
  private readonly warnings: string[];

  constructor(options: FakeParticipantAdapterOptions) {
    this.adapterId = options.adapterId ?? "fake";
    this.output = cloneJsonValue(options.output);
    this.modelId = options.modelId;
    this.capabilities = cloneCapabilities(
      options.capabilities ?? FAKE_PARTICIPANT_ADAPTER_CAPABILITIES
    );
    this.contextCompleteness = cloneContextCompleteness(
      options.contextCompleteness ?? UNKNOWN_CONTEXT_COMPLETENESS
    );
    this.warnings = [...(options.warnings ?? [])];
  }

  prepareContribution(
    _input: ParticipantAdapterInput,
    context: ParticipantAdapterContext
  ): ParticipantAdapterResult {
    return {
      payload: cloneJsonValue(this.output),
      adapterId: this.adapterId,
      participantId: context.participantId,
      modelId: this.modelId,
      capabilities: cloneCapabilities(this.capabilities),
      contextCompleteness: cloneContextCompleteness(this.contextCompleteness),
      warnings: [...this.warnings]
    };
  }
}
