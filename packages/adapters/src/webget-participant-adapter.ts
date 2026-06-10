import { z } from "zod";
import {
  AdapterInputError,
  UNKNOWN_CONTEXT_COMPLETENESS,
  cloneCapabilities,
  cloneContextCompleteness,
  type AdapterCapabilities,
  type ContextCompleteness,
  type JsonValue,
  type ParticipantAdapter,
  type ParticipantAdapterContext,
  type ParticipantAdapterResult
} from "./types";

export const WEBGET_PARTICIPANT_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  input: {
    text: true,
    markdown: true,
    json: true,
    imageUrl: true,
    imageBase64: true,
    pdfUrl: true,
    fileUrl: false,
    webBrowsing: true
  },
  output: {
    structuredJson: true,
    markdown: true,
    streaming: false,
    manualPaste: true
  },
  limits: {},
  reliability: "experimental"
};

export const WebGETContextCompletenessSchema = z
  .object({
    status: z.enum(["complete", "partial", "unknown"]),
    notes: z.array(z.string())
  })
  .strict();
export type WebGETContextCompleteness = z.infer<typeof WebGETContextCompletenessSchema>;

export const WebGETReadReportSchema = z
  .object({
    contextPagesRead: z.array(z.string().min(1)),
    resourcesViewed: z.array(z.string().min(1)),
    resourcesSummaryOnly: z.array(z.string().min(1)),
    submissionMode: z.enum(["chunked_get", "manual_paste", "browser_automation"]),
    contextCompleteness: WebGETContextCompletenessSchema
  })
  .strict();
export type WebGETReadReport = z.infer<typeof WebGETReadReportSchema>;

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

export const ResourceAccessReportSchema = z
  .object({
    resourceId: z.string().min(1),
    participantId: z.string().min(1),
    selectedMode: z.enum(["url", "base64", "none"]),
    allowed: z.boolean(),
    reason: z.string().min(1),
    warnings: z.array(z.string())
  })
  .strict();

export const WebGETCommittedSubmissionSchema = z
  .object({
    output: JsonValueSchema,
    readReport: WebGETReadReportSchema,
    contextCompleteness: WebGETContextCompletenessSchema,
    resourceAccessReports: z.array(ResourceAccessReportSchema).optional()
  })
  .strict();
export type WebGETCommittedSubmission = z.infer<typeof WebGETCommittedSubmissionSchema>;

export type WebGETSubmissionChunk = {
  seq: number;
  total: number;
  encoding: "base64url";
  data: string;
};

export type WebGETParticipantAdapterInput = {
  startUrl: string;
  expiresAt: string;
  instructions?: string;
  manualPasteFallback?: boolean;
};

export type WebGETContextCapsule = {
  kind: "webget_context_capsule";
  adapterId: string;
  participantId: string;
  startUrl: string;
  expiresAt: string;
  instructions: string[];
  expectedSubmission: {
    encoding: "base64url";
    requiredFields: ["output", "readReport", "contextCompleteness"];
    optionalFields: ["resourceAccessReports"];
  };
  manualPasteFallback: boolean;
};

export type WebGETParticipantAdapterOptions = {
  adapterId?: string;
  capabilities?: AdapterCapabilities;
  contextCompleteness?: ContextCompleteness;
  warnings?: string[];
};

export class WebGETParticipantAdapter implements ParticipantAdapter<WebGETParticipantAdapterInput> {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  private readonly contextCompleteness: ContextCompleteness;
  private readonly warnings: string[];

  constructor(options: WebGETParticipantAdapterOptions = {}) {
    this.adapterId = options.adapterId ?? "webget";
    this.capabilities = cloneCapabilities(
      options.capabilities ?? WEBGET_PARTICIPANT_ADAPTER_CAPABILITIES
    );
    this.contextCompleteness = cloneContextCompleteness(
      options.contextCompleteness ?? UNKNOWN_CONTEXT_COMPLETENESS
    );
    this.warnings = [...(options.warnings ?? ["WebGET is experimental."])];
  }

  prepareContribution(
    input: WebGETParticipantAdapterInput,
    context: ParticipantAdapterContext
  ): ParticipantAdapterResult {
    const startUrl = parseLocalHttpUrl(input.startUrl);

    return {
      payload: {
        kind: "webget_context_capsule",
        adapterId: this.adapterId,
        participantId: context.participantId,
        startUrl,
        expiresAt: input.expiresAt,
        instructions: [
          "Open the startUrl and read the scoped context pages.",
          "Report which context pages and resources were actually accessed.",
          "Submit a structured JSON object with output, readReport, and contextCompleteness.",
          "Use chunked GET submission when possible; otherwise use manual paste fallback.",
          input.instructions ?? "Produce an independent participant contribution."
        ],
        expectedSubmission: {
          encoding: "base64url",
          requiredFields: ["output", "readReport", "contextCompleteness"],
          optionalFields: ["resourceAccessReports"]
        },
        manualPasteFallback: input.manualPasteFallback ?? true
      } satisfies WebGETContextCapsule,
      adapterId: this.adapterId,
      participantId: context.participantId,
      capabilities: cloneCapabilities(this.capabilities),
      contextCompleteness: cloneContextCompleteness(this.contextCompleteness),
      warnings: [...this.warnings]
    };
  }
}

export function parseWebGETCommittedSubmission(input: unknown): WebGETCommittedSubmission {
  return WebGETCommittedSubmissionSchema.parse(input);
}

function parseLocalHttpUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AdapterInputError("WebGET startUrl must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AdapterInputError("WebGET startUrl must use http or https.");
  }

  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new AdapterInputError("WebGET startUrl must be local for Stage 13.");
  }

  return url.toString();
}
