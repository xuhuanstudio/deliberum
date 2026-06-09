import type {
  AdapterCapabilities,
  ContextCompleteness,
  JsonValue,
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterResult
} from "./types";
import {
  AdapterInputError,
  UNKNOWN_CONTEXT_COMPLETENESS,
  cloneCapabilities,
  cloneContextCompleteness,
  cloneJsonValue,
  validateJsonValue
} from "./types";

export const MANUAL_PARTICIPANT_ADAPTER_CAPABILITIES: AdapterCapabilities = {
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
    manualPaste: true
  },
  limits: {},
  reliability: "high"
};

export type ManualParticipantAdapterInput =
  | {
      text: string;
      payload?: never;
    }
  | {
      text?: never;
      payload: JsonValue;
    };

export type ManualParticipantAdapterOptions = {
  adapterId?: string;
  capabilities?: AdapterCapabilities;
  contextCompleteness?: ContextCompleteness;
  warnings?: string[];
};

export class ManualParticipantAdapter implements ParticipantAdapter<ManualParticipantAdapterInput> {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  private readonly contextCompleteness: ContextCompleteness;
  private readonly warnings: string[];

  constructor(options: ManualParticipantAdapterOptions = {}) {
    this.adapterId = options.adapterId ?? "manual";
    this.capabilities = cloneCapabilities(
      options.capabilities ?? MANUAL_PARTICIPANT_ADAPTER_CAPABILITIES
    );
    this.contextCompleteness = cloneContextCompleteness(
      options.contextCompleteness ?? UNKNOWN_CONTEXT_COMPLETENESS
    );
    this.warnings = [...(options.warnings ?? [])];
  }

  prepareContribution(
    input: ManualParticipantAdapterInput,
    context: ParticipantAdapterContext
  ): ParticipantAdapterResult {
    return {
      payload: normalizeManualPayload(input),
      adapterId: this.adapterId,
      participantId: context.participantId,
      capabilities: cloneCapabilities(this.capabilities),
      contextCompleteness: cloneContextCompleteness(this.contextCompleteness),
      warnings: [...this.warnings]
    };
  }
}

function normalizeManualPayload(input: ManualParticipantAdapterInput): JsonValue {
  if ("text" in input && input.text !== undefined) {
    if (input.text.length === 0) {
      throw new AdapterInputError("Manual text payload must not be empty.");
    }

    return input.text;
  }

  if ("payload" in input) {
    return cloneJsonValue(validateJsonValue(input.payload));
  }

  throw new AdapterInputError("Manual adapter input requires text or payload.");
}
