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

  it("keeps final and resources pages as explicit placeholders", async () => {
    renderApp("/sessions/session-1/final");

    expect(await screen.findByText("Outcome Compiler placeholder")).toBeTruthy();
    expect(screen.getByText("Outcome Compiler is not implemented")).toBeTruthy();

    cleanup();
    renderApp("/sessions/session-1/resources");

    expect(await screen.findByText("Resource Broker placeholder")).toBeTruthy();
    expect(screen.getByText("Resource Broker is not implemented")).toBeTruthy();
  });

  it("does not add hidden session persistence or forbidden semantic authority APIs", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const routesSource = readFileSync(resolve(process.cwd(), "src/routes.tsx"), "utf8");
    const clientSource = readFileSync(resolve(process.cwd(), "src/client.ts"), "utf8");
    const source = `${appSource}\n${routesSource}\n${clientSource}`;

    for (const forbiddenSnippet of [
      "localStorage",
      "sessionStorage",
      "currentSession",
      "@deliberum/core",
      "@deliberum/storage",
      "@deliberum/adapters",
      "WebGET",
      "MCP",
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "CentralRanker",
      "finalAnswer",
      "truthSummary"
    ]) {
      expect(source).not.toContain(forbiddenSnippet);
    }
  });
});
