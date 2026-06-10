import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  SEALED_BATCH_REVEALED_EVENT_TYPE,
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE
} from "@deliberum/core";
import type { EventStore, StoredEvent } from "@deliberum/storage";
import {
  DaemonRunOrchestrationError,
  type DaemonRunOrchestrationService,
  type DaemonRunStartRequest
} from "./run-orchestration";
import type { DaemonEventBus } from "./event-stream";

export type RunRouteOptions = {
  app: Hono;
  runService: DaemonRunOrchestrationService;
  eventBus: DaemonEventBus;
  eventStore: EventStore;
};

type RunSseRedactedPayload = {
  redacted: true;
  reason: "event_visibility" | "sealed_until_reveal";
};

type RunSseEventView = Omit<StoredEvent, "payload"> & {
  payload: unknown | RunSseRedactedPayload;
};

export function registerRunRoutes(options: RunRouteOptions): void {
  const { app, eventBus, eventStore, runService } = options;

  app.post("/runs", async (context) => {
    const body = await readJsonObject(context);
    const result = runService.createRun({
      runPlan: body.runPlan
    });

    return context.json(result, 201);
  });

  app.get("/runs", (context) =>
    context.json({
      runs: runService.listRuns()
    })
  );

  app.get("/runs/:runId", (context) =>
    context.json({
      run: runService.getRun(context.req.param("runId"))
    })
  );

  app.post("/runs/:runId/start", async (context) => {
    const body = await readJsonObject(context);
    const result = await runService.startRun(
      context.req.param("runId"),
      body as DaemonRunStartRequest
    );

    return context.json(result);
  });

  app.get("/runs/:runId/outcome", (context) =>
    context.json(runService.getOutcome(context.req.param("runId")))
  );

  app.get("/runs/:runId/events/stream", (context) => {
    const sessionId = runService.getRunSessionId(context.req.param("runId"));

    return streamSSE(context, async (stream) => {
      const unsubscribe = eventBus.subscribe(sessionId, async (event) => {
        await stream.writeSSE({
          event: "event",
          id: event.id,
          data: JSON.stringify(createRunSseEventView(event, eventStore))
        });
      });

      stream.onAbort(unsubscribe);

      try {
        while (!stream.aborted) {
          await stream.sleep(1000);
        }
      } finally {
        unsubscribe();
      }
    });
  });
}

function createRunSseEventView(event: StoredEvent, eventStore: EventStore): RunSseEventView {
  if (event.visibility === "public") {
    return cloneEventWithPayload(event, structuredClone(event.payload));
  }

  if (
    event.type === SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE &&
    event.visibility === "sealed"
  ) {
    if (isSealedContributionRevealed(event, eventStore)) {
      return cloneEventWithPayload(event, structuredClone(event.payload));
    }

    return cloneEventWithPayload(event, {
      redacted: true,
      reason: "sealed_until_reveal"
    });
  }

  return cloneEventWithPayload(event, {
    redacted: true,
    reason: "event_visibility"
  });
}

function isSealedContributionRevealed(event: StoredEvent, eventStore: EventStore): boolean {
  if (!event.batchId) {
    return false;
  }

  return eventStore
    .listEventsByBatch(event.sessionId, event.batchId)
    .some(
      (candidate) =>
        candidate.type === SEALED_BATCH_REVEALED_EVENT_TYPE &&
        candidate.visibility === "public" &&
        candidate.sessionId === event.sessionId &&
        candidate.batchId === event.batchId &&
        candidate.basedOnEventIds.includes(event.id)
    );
}

function cloneEventWithPayload(event: StoredEvent, payload: unknown): RunSseEventView {
  return {
    ...structuredClone(event),
    payload
  };
}

export function handleRunRouteError(context: Context, error: Error): Response | undefined {
  if (!context.req.path.startsWith("/runs")) {
    return undefined;
  }

  if (error instanceof DaemonRunOrchestrationError) {
    return context.json(
      {
        error: {
          code: error.code,
          message: error.safeMessage
        }
      },
      error.status
    );
  }

  const mappedError = mapExternalRunError(error);
  if (mappedError) {
    return context.json(
      {
        error: {
          code: mappedError.code,
          message: mappedError.message
        }
      },
      mappedError.status
    );
  }

  return context.json(
    {
      error: {
        code: "run_request_failed",
        message: "Run request could not be processed."
      }
    },
    400
  );
}

async function readJsonObject(context: Context): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await context.req.json();
  } catch {
    throw new DaemonRunOrchestrationError(
      "invalid_json",
      "Request body must be valid JSON."
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DaemonRunOrchestrationError(
      "invalid_json",
      "Request body must be a JSON object."
    );
  }

  return parsed as Record<string, unknown>;
}

function mapExternalRunError(
  error: Error
): { code: string; message: string; status: 400 | 404 | 409 } | undefined {
  if (error.name === "RunPlanValidationError") {
    return {
      code: "invalid_run_plan",
      message: "Run plan is invalid.",
      status: 400
    };
  }

  if (error.name === "RunStoreNotFoundError") {
    return {
      code: "run_not_found",
      message: "Run was not found.",
      status: 404
    };
  }

  if (error.name === "ProviderSecretResolutionError") {
    return {
      code: "provider_secret_missing",
      message: "Required provider secret is unavailable.",
      status: 400
    };
  }

  if (
    error.name === "AdapterRegistryError" ||
    error.name === "ExtractionGeneratorRegistryError" ||
    error.name === "ProposalReviewGeneratorRegistryError" ||
    error.name === "FinalizationGeneratorRegistryError"
  ) {
    return {
      code: "orchestration_component_unavailable",
      message: "Required orchestration component is unavailable.",
      status: 400
    };
  }

  if (
    error.name === "RunSealedDivergenceRoundError" ||
    error.name === "RunExtractionProposalRoundError" ||
    error.name === "RunProposalReviewRoundError" ||
    error.name === "RunFinalizationRoundError"
  ) {
    return {
      code: "run_stage_failed",
      message: "Run stage could not be processed safely.",
      status: 400
    };
  }

  return undefined;
}
