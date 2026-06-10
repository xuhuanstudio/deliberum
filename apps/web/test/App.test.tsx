import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, createWebQueryClient } from "../src/App";
import { resolveDaemonBaseUrl, type WebDaemonClient } from "../src/client";

const projection = {
  version: "1" as const,
  eventRange: {
    fromSequence: 0,
    toSequence: 1
  },
  eventIds: ["event-1", "proposal-event-1"]
};

const runDetail = {
  runId: "run-1",
  sessionId: "session-1",
  status: "created",
  title: "Run Alpha",
  topic: "Evaluate the local daemon run workspace",
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:01:00.000Z",
  sealedDivergenceStatus: "completed",
  latestExtractionStatus: "completed",
  latestProposalReviewStatus: "completed",
  latestFinalizationStatus: "completed",
  ledger: {
    eventCount: 7
  },
  plan: {
    topic: "Evaluate the local daemon run workspace",
    goals: ["Inspect run state"],
    constraints: ["Keep outcomes provisional"],
    providerConfigs: []
  },
  rounds: {
    sealedDivergence: {
      roundId: "sealed-round-1",
      status: "completed"
    },
    extraction: [
      {
        roundId: "extraction-round-1",
        status: "completed"
      }
    ],
    proposalReview: [],
    finalization: []
  }
};

function createClient(overrides: Partial<WebDaemonClient> = {}): WebDaemonClient {
  return {
    health: vi.fn(async () => ({
      status: "ok",
      service: "deliberum-daemon",
      host: "127.0.0.1",
      port: 3877
    })),
    listEvents: vi.fn(async () => ({
      events: [
        {
          id: "event-1",
          type: "topic_contract_published",
          sequence: 0,
          payload: {
            topic: "Stage 11 shell"
          }
        }
      ]
    })),
    createRun: vi.fn(async (input) => ({
      run: runDetail,
      session: {
        sessionId: runDetail.sessionId
      },
      event: {
        id: "event-1",
        type: "topic_contract_published",
        payload: input.runPlan
      }
    })),
    listRuns: vi.fn(async () => ({
      runs: [runDetail]
    })),
    getRun: vi.fn(async () => ({
      run: runDetail
    })),
    startRun: vi.fn(async () => ({
      run: {
        ...runDetail,
        status: "running"
      },
      stages: [
        {
          stage: "sealed_divergence",
          executionStatus: "executed",
          roundId: "sealed-round-1",
          status: "completed",
          eventIds: ["event-2", "event-3"],
          result: {
            hiddenPayload: "do not render this result payload"
          }
        }
      ],
      stopped: false
    })),
    getRunOutcome: vi.fn(async () => ({
      runId: runDetail.runId,
      sessionId: runDetail.sessionId,
      status: "compiled",
      draftStatus: "provisional",
      outcome: {
        summary: "Provisional compiled material",
        limitations: ["Needs further audit"]
      }
    })),
    getFrontier: vi.fn(async () => ({
      basis: "accepted_active_candidates",
      candidates: [
        {
          object: {
            id: "candidate-1",
            title: "Candidate A",
            status: "active"
          },
          proposalEventId: "proposal-event-1",
          sourceEventIds: ["event-1"]
        }
      ],
      projection
    })),
    getObjections: vi.fn(async () => ({
      objections: [
        {
          object: {
            id: "objection-1",
            status: "open"
          },
          proposalEventId: "proposal-event-1"
        }
      ],
      projection
    })),
    getObligations: vi.fn(async () => ({
      qualityObligations: [
        {
          object: {
            id: "quality-1",
            status: "unanswered"
          },
          proposalEventId: "proposal-event-1"
        }
      ],
      projection
    })),
    ...overrides
  };
}

function renderApp(initialPath: string, client = createClient()) {
  render(
    <App
      daemonClient={client}
      daemonBaseUrl="http://127.0.0.1:3877"
      queryClient={createWebQueryClient()}
      initialPath={initialPath}
    />
  );

  return client;
}

function readWebSource(): string {
  return [
    "src/App.tsx",
    "src/client.ts",
    "src/daemon-runtime.tsx",
    "src/routes.tsx",
    "src/run-presets.ts",
    "src/run-workspace.tsx",
    "src/view-components.tsx"
  ]
    .map((filePath) => readFileSync(resolve(process.cwd(), filePath), "utf8"))
    .join("\n");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("@deliberum/web shell", () => {
  it("resolves daemon URL from explicit development env or local default", () => {
    expect(resolveDaemonBaseUrl({})).toBe("http://127.0.0.1:3877");
    expect(
      resolveDaemonBaseUrl({
        VITE_DELIBERUM_DAEMON_URL: " http://127.0.0.1:4888 "
      })
    ).toBe("http://127.0.0.1:4888");
  });

  it("opens sessions through explicit session-id navigation without stored session state", async () => {
    const client = renderApp("/");

    expect(await screen.findByText("Open a deliberation session")).toBeTruthy();
    expect(screen.queryByLabelText(/chat/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/message/i)).toBeNull();

    fireEvent.change(screen.getByLabelText("Session id"), {
      target: {
        value: "session-1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await screen.findByText("Ledger position");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
  });

  it("renders the session overview from daemon ledger events", async () => {
    const client = renderApp("/sessions/session-1");

    await screen.findByText("Ledger position");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("Event entries")).toBeTruthy();
    expect(screen.getByText("topic_contract_published")).toBeTruthy();
  });

  it("renders Candidate Frontier as a basis plus candidate list", async () => {
    const client = renderApp("/sessions/session-1/frontier");

    await screen.findByText("Accepted active candidates");
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/accepted_active_candidates/)).toBeTruthy();
    expect(screen.getAllByText(/candidate-1/).length).toBeGreaterThan(0);

    const renderedText = document.body.textContent ?? "";
    for (const forbiddenField of ["currentBest", "winner", "rank", "score", "vote"]) {
      expect(renderedText).not.toContain(forbiddenField);
    }
  });

  it("renders objections and quality obligations from daemon projections", async () => {
    const client = renderApp("/sessions/session-1/objections");

    await screen.findByText("First-class objections");
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/objection-1/)).toBeTruthy();

    cleanup();

    const nextClient = renderApp("/sessions/session-1/obligations");
    await screen.findByText("Obligations and status");
    await waitFor(() => expect(nextClient.getObligations).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/quality-1/)).toBeTruthy();
    expect(screen.getByText(/unanswered/)).toBeTruthy();
  });

  it("renders append-only ledger entries without stripping arbitrary payload keys", async () => {
    const client = createClient({
      listEvents: vi.fn(async () => ({
        events: [
          {
            id: "event-1",
            type: "sealed_contribution_submitted",
            sequence: 1,
            payload: {
              message: "legitimate user payload field"
            }
          }
        ]
      }))
    });

    renderApp("/sessions/session-1/events", client);

    await screen.findByText("Append-only ledger entries");
    await waitFor(() => expect(client.listEvents).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText(/sealed_contribution_submitted/)).toBeTruthy();
    expect(screen.getByText(/legitimate user payload field/)).toBeTruthy();
  });

  it("lists daemon runs", async () => {
    const client = renderApp("/runs");

    await screen.findByText("Daemon runs");
    await waitFor(() => expect(client.listRuns).toHaveBeenCalled());
    expect(screen.getByText("How local runs work")).toBeTruthy();
    expect(screen.getByText("A controlled orchestration job owned by the local daemon run store.")).toBeTruthy();
    expect(screen.getByText("The underlying append-only event ledger session created for the run.")).toBeTruthy();
    expect(screen.getByText(/Recorded lifecycle events/)).toBeTruthy();
    expect(screen.getByText(/compiled artifact from accepted proposal material/)).toBeTruthy();
    expect(screen.getByText("Run Alpha")).toBeTruthy();
    expect(screen.getByText("run-1")).toBeTruthy();
    expect(screen.getByText("Created: run exists, pipeline has not started.")).toBeTruthy();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("creates a run from a JSON run plan object", async () => {
    const client = renderApp("/runs/new");
    const runPlan = {
      topic: "New local run",
      goals: ["Inspect"],
      constraints: ["Keep provisional"]
    };

    await screen.findByText("Create a daemon run");
    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: JSON.stringify(runPlan)
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    await waitFor(() => expect(client.createRun).toHaveBeenCalledWith({ runPlan }));
    expect(await screen.findByText("Run created")).toBeTruthy();
    expect(screen.getByText(/run-1/)).toBeTruthy();
  });

  it("rejects invalid run plan JSON without calling the daemon", async () => {
    const client = renderApp("/runs/new");

    await screen.findByText("Create a daemon run");
    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: "{"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    expect(await screen.findByText("Run plan must be valid JSON.")).toBeTruthy();
    expect(client.createRun).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: "[]"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run" }));

    expect(await screen.findByText("Run plan must be a JSON object.")).toBeTruthy();
    expect(client.createRun).not.toHaveBeenCalled();
  });

  it("fills and creates the local preset run plan", async () => {
    const client = renderApp("/runs/new");

    await screen.findByText("Create a daemon run");
    fireEvent.change(screen.getByLabelText("Advanced run plan JSON"), {
      target: {
        value: "{}"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fill local preset run plan" }));

    expect(
      (screen.getByLabelText("Advanced run plan JSON") as HTMLTextAreaElement).value
    ).toContain("local-preset-alpha");

    fireEvent.click(screen.getByRole("button", { name: "Create local preset run" }));

    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith({
        runPlan: expect.objectContaining({
          title: "Local preset run",
          providerConfigs: [],
          participants: expect.arrayContaining([
            expect.objectContaining({
              adapterId: "local-preset-alpha"
            })
          ])
        })
      })
    );
  });

  it("renders run detail, stage status, and projection panels without raw event loading", async () => {
    const client = renderApp("/runs/run-1");

    await screen.findByText("Run detail");
    await waitFor(() => expect(client.getRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(client.getFrontier).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObjections).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(client.getObligations).toHaveBeenCalledWith("session-1"));

    expect(screen.getByText("Run status")).toBeTruthy();
    expect(screen.getByText("Ledger events")).toBeTruthy();
    expect(screen.getByText("7 recorded lifecycle events")).toBeTruthy();
    expect(screen.getByText("Current run meaning")).toBeTruthy();
    expect(screen.getByText("Stage status")).toBeTruthy();
    expect(screen.getByText("Candidate Frontier projection")).toBeTruthy();
    expect(screen.getByText("Candidate A")).toBeTruthy();
    expect(screen.getByText("Objections projection")).toBeTruthy();
    expect(screen.getAllByText(/objection-1/).length).toBeGreaterThan(0);
    expect(screen.getByText("Quality obligations projection")).toBeTruthy();
    expect(screen.getAllByText(/quality-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Projection events").length).toBeGreaterThan(0);
    expect(client.listEvents).not.toHaveBeenCalled();
  });

  it("explains created runs and stages that have not run yet", async () => {
    renderApp(
      "/runs/run-1",
      createClient({
        getRun: vi.fn(async () => ({
          run: {
            ...runDetail,
            sealedDivergenceStatus: undefined,
            latestExtractionStatus: undefined,
            latestProposalReviewStatus: undefined,
            latestFinalizationStatus: undefined,
            ledger: {
              eventCount: 1
            }
          }
        }))
      })
    );

    expect(await screen.findByText("Created: run exists, pipeline has not started.")).toBeTruthy();
    expect(screen.getByText("1 recorded lifecycle event")).toBeTruthy();
    expect(screen.getAllByText("Not run yet").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("No round has been recorded for that stage.")).toBeTruthy();
  });

  it("starts a run from a JSON start request and renders only stage metadata", async () => {
    const client = renderApp("/runs/run-1");
    const startRequest = {
      extraction: {
        generatorIds: ["generator-1"]
      }
    };

    await screen.findByText("Start orchestration");
    fireEvent.change(screen.getByLabelText("Advanced start request JSON"), {
      target: {
        value: JSON.stringify(startRequest)
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledWith("run-1", startRequest));
    expect(await screen.findByText("Run request completed")).toBeTruthy();
    expect(screen.getByText("Stage results")).toBeTruthy();
    expect(screen.getByText(/sealed_divergence/)).toBeTruthy();
    expect(screen.getByText(/event-2/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("do not render this result payload");
  });

  it("fills and starts the full local preset pipeline through the client", async () => {
    const client = renderApp("/runs/run-1");

    await screen.findByText("Start orchestration");
    fireEvent.change(screen.getByLabelText("Advanced start request JSON"), {
      target: {
        value: "{}"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fill local preset start request" }));

    expect(
      (screen.getByLabelText("Advanced start request JSON") as HTMLTextAreaElement).value
    ).toContain("local-preset-extractor");

    fireEvent.click(screen.getByRole("button", { name: "Start full local preset pipeline" }));

    await waitFor(() =>
      expect(client.startRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          extraction: {
            generatorIds: ["local-preset-extractor"]
          },
          finalization: expect.objectContaining({
            finalCandidateGeneratorId: "local-preset-final-candidate",
            compileOutcome: true
          })
        })
      )
    );
  });

  it("refreshes run projection panels after a successful start without page reload", async () => {
    let started = false;
    const initialProjection = {
      version: "1" as const,
      eventRange: {
        fromSequence: 0,
        toSequence: 0
      },
      eventIds: ["event-1"]
    };
    const client = renderApp(
      "/runs/run-1",
      createClient({
        startRun: vi.fn(async () => {
          started = true;

          return {
            run: {
              ...runDetail,
              status: "revealed"
            },
            stages: [
              {
                stage: "finalization",
                executionStatus: "executed",
                roundId: "final-round-1",
                status: "completed",
                eventIds: ["event-4"]
              }
            ],
            stopped: false
          };
        }),
        getFrontier: vi.fn(async () =>
          started
            ? {
                basis: "accepted_active_candidates",
                candidates: [
                  {
                    object: {
                      id: "candidate-after-start",
                      title: "Projection refreshed after start",
                      status: "active"
                    },
                    proposalEventId: "proposal-after-start",
                    sourceEventIds: ["event-4"]
                  }
                ],
                projection
              }
            : {
                basis: "accepted_active_candidates",
                candidates: [],
                projection: initialProjection
              }
        ),
        getObjections: vi.fn(async () =>
          started
            ? {
                objections: [
                  {
                    object: {
                      id: "objection-after-start",
                      failureMode: "Projection objection refreshed after start",
                      status: "open"
                    },
                    proposalEventId: "proposal-after-start"
                  }
                ],
                projection
              }
            : {
                objections: [],
                projection: initialProjection
              }
        ),
        getObligations: vi.fn(async () =>
          started
            ? {
                qualityObligations: [
                  {
                    object: {
                      id: "quality-after-start",
                      requirement: "Projection obligation refreshed after start",
                      status: "unanswered"
                    },
                    proposalEventId: "proposal-after-start"
                  }
                ],
                projection
              }
            : {
                qualityObligations: [],
                projection: initialProjection
              }
        )
      })
    );

    await screen.findByText("No Candidate Frontier entries");
    expect(screen.queryByText("Projection refreshed after start")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start full local preset pipeline" }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(await screen.findByText("Run request completed")).toBeTruthy();
    expect(await screen.findByText("Projection refreshed after start")).toBeTruthy();
    expect(screen.getByText("Projection objection refreshed after start")).toBeTruthy();
    expect(screen.getByText("Projection obligation refreshed after start")).toBeTruthy();
    expect(client.getFrontier).toHaveBeenCalledTimes(2);
    expect(client.getObjections).toHaveBeenCalledTimes(2);
    expect(client.getObligations).toHaveBeenCalledTimes(2);
  });

  it("explains missing local preset components safely", async () => {
    const error = new Error("Required orchestration component is unavailable.");
    Object.assign(error, {
      code: "orchestration_component_unavailable",
      status: 400
    });
    const client = renderApp(
      "/runs/run-1",
      createClient({
        startRun: vi.fn(async () => {
          throw error;
        })
      })
    );

    await screen.findByText("Start orchestration");
    fireEvent.click(screen.getByRole("button", { name: "Start full local preset pipeline" }));

    expect(await screen.findByText("Run start failed")).toBeTruthy();
    expect(screen.getAllByText(/DELIBERUM_ENABLE_LOCAL_PRESET=true/).length).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain("stack");
  });

  it("renders compiled run output as a provisional outcome", async () => {
    const client = renderApp("/runs/run-1/outcome");

    await screen.findByText("Provisional outcome");
    await waitFor(() => expect(client.getRunOutcome).toHaveBeenCalledWith("run-1"));
    expect(screen.getByText("Draft status")).toBeTruthy();
    expect(screen.getAllByText(/provisional/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Provisional compiled material/)).toBeTruthy();
  });

  it("renders unavailable provisional outcome reasons safely", async () => {
    const client = createClient({
      getRunOutcome: vi.fn(async () => ({
        runId: "run-1",
        sessionId: "session-1",
        status: "not_available",
        reason: "final_candidate_proposal_unavailable"
      }))
    });

    renderApp("/runs/run-1/outcome", client);

    expect(await screen.findByText("Provisional outcome not available")).toBeTruthy();
    expect(screen.getByText(/No final candidate proposal exists yet/)).toBeTruthy();
  });

  it("redacts daemon and generic errors on run pages", async () => {
    const client = createClient({
      getRun: vi.fn(async () => {
        throw new Error(
          "raw failure /Users/alice/private/run.json Bearer secret-token sk-secret123\n    at privateStack"
        );
      })
    });

    renderApp("/runs/run-1", client);

    expect(await screen.findByText("Daemon request failed")).toBeTruthy();
    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toContain("/Users/alice");
    expect(renderedText).not.toContain("Bearer secret-token");
    expect(renderedText).not.toContain("sk-secret123");
    expect(renderedText).not.toContain("privateStack");
  });

  it("keeps final and resources pages as explicit placeholders", async () => {
    renderApp("/sessions/session-1/final");

    expect(await screen.findByText("Outcome Compiler placeholder")).toBeTruthy();
    expect(screen.getByText("Outcome endpoint integration is not implemented")).toBeTruthy();

    cleanup();
    renderApp("/sessions/session-1/resources");

    expect(await screen.findByText("Resource Broker placeholder")).toBeTruthy();
    expect(screen.getByText("Resource endpoint integration is not implemented")).toBeTruthy();
  });

  it("does not add hidden session persistence or forbidden semantic authority APIs", () => {
    const source = readWebSource();

    for (const forbiddenSnippet of [
      "localStorage",
      "sessionStorage",
      "currentSession",
      "@deliberum/core",
      "@deliberum/storage",
      "@deliberum/orchestrator",
      "@deliberum/adapters",
      "@deliberum/resources",
      "EventSource",
      "events/stream",
      "WebGET",
      "MCP",
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "CentralRanker",
      "winner",
      "currentBest",
      "ranking",
      "score",
      "vote",
      "finalAnswer",
      "truthSummary",
      "best answer"
    ]) {
      expect(source).not.toContain(forbiddenSnippet);
    }
  });
});
