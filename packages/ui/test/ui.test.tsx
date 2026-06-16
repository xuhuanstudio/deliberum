import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DataPanel,
  EmptyState,
  JsonBlock,
  KeyValueGrid,
  PageHeader,
  StatusBanner,
  WorkspaceShell
} from "../src";
import * as ui from "../src";

describe("@deliberum/ui presentation primitives", () => {
  it("renders a workspace shell without owning data access", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShell
        productName="Deliberum"
        workspaceLabel="Projection workspace"
        sessionId="session-1"
        daemonBaseUrl="http://127.0.0.1:3877"
        navigation={<a href="/sessions/session-1/events">Events</a>}
        status={<StatusBanner tone="ok" title="Service online" />}
      >
        <PageHeader title="Event Timeline" />
      </WorkspaceShell>
    );

    expect(markup).toContain("Deliberum");
    expect(markup).toContain("Discussion");
    expect(markup).toContain("session-1");
    expect(markup).toContain("Service online");
    expect(markup).toContain("Service");
    expect(markup).toContain("Event Timeline");
  });

  it("renders JSON values without changing arbitrary payload fields", () => {
    const markup = renderToStaticMarkup(
      <DataPanel title="Events">
        <JsonBlock
          value={{
            id: "event-1",
            payload: {
              message: "preserved user payload key"
            }
          }}
        />
      </DataPanel>
    );

    expect(markup).toContain("preserved user payload key");
    expect(markup).toContain("message");
  });

  it("can hide a data panel heading while keeping its children", () => {
    const markup = renderToStaticMarkup(
      <DataPanel title="Events" description="Developer-facing records" hideHeader>
        <p>Readable room content</p>
      </DataPanel>
    );

    expect(markup).toContain("Readable room content");
    expect(markup).not.toContain("Developer-facing records");
    expect(markup).not.toContain("<h3>Events</h3>");
  });

  it("renders empty, status, and key-value states", () => {
    const markup = renderToStaticMarkup(
      <>
        <EmptyState title="No events" description="The service returned no entries." />
        <StatusBanner tone="warning" title="Service unavailable" />
        <KeyValueGrid
          items={[
            {
              label: "Event entries",
              value: 3
            }
          ]}
        />
      </>
    );

    expect(markup).toContain("No events");
    expect(markup).toContain("Service unavailable");
    expect(markup).toContain("Event entries");
  });

  it("exports only presentation primitives", () => {
    const exportedNames = Object.keys(ui);
    const forbiddenNames = [
      "DeliberumDaemonClient",
      "EventStore",
      "Projection",
      "Adapter",
      "WebGET",
      "MCP",
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "CentralRanker",
      "ResourceBroker",
      "OutcomeCompiler"
    ];

    for (const exportedName of exportedNames) {
      for (const forbiddenName of forbiddenNames) {
        expect(exportedName).not.toContain(forbiddenName);
      }
    }
  });
});
