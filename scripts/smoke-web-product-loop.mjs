import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const dummyApiKey = "smoke-web-product-loop-token";
const modelName = "smoke-web-product-loop-model";
const discussionModelName = "smoke-web-product-loop-discussion-model";
const perspectiveModelName = "smoke-web-product-loop-perspective-a-model";
const reviewModelName = "smoke-web-product-loop-review-model";
const discussionQuestion =
  "Should Deliberum rely on the verified provider path for a real browser discussion?";

assertFile(daemonEntry);

const daemonPort = await reserveLocalPort();
const providerPort = await reserveLocalPort();
const webPort = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-web-product-loop-"));
const provider = await startOpenAICompatibleMockProvider(providerPort);
const daemon = startDaemonProcess({
  port: daemonPort,
  cwd: tempDir,
  webOrigin: `http://127.0.0.1:${webPort}`
});
const web = startWebProcess({
  port: webPort,
  daemonBaseUrl: `http://127.0.0.1:${daemonPort}`
});

let browser;
let activePage;

try {
  await waitForHttpOk(`http://127.0.0.1:${daemonPort}/health`, () => daemon.exited);
  await waitForHttpOk(`http://127.0.0.1:${webPort}/setup/models`, () => web.exited);

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  activePage = page;
  page.setDefaultTimeout(45_000);

  await runBrowserProductLoop(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`,
    providerBaseUrl: `http://127.0.0.1:${providerPort}/v1`
  });

  if (provider.requestCount < 6) {
    throw new Error(
      `Browser product loop provider saw ${provider.requestCount} request(s); expected setup verification plus discussion with AI requests.`
    );
  }
  if (provider.transientParticipantFailureCount !== 1) {
    throw new Error(
      `Browser product loop provider saw ${provider.transientParticipantFailureCount} transient participant failure(s); expected exactly one retryable first-response failure.`
    );
  }
  if (provider.discussionModelRequestCount < 2) {
    throw new Error(
      `Browser product loop provider saw ${provider.discussionModelRequestCount} request(s) for the first-response model; expected uncustomized participants to use the override.`
    );
  }
  if (provider.perspectiveModelRequestCount < 1) {
    throw new Error(
      `Browser product loop provider saw ${provider.perspectiveModelRequestCount} request(s) for the viewpoint model; expected First viewpoint to use its own model override.`
    );
  }
  if (provider.reviewModelRequestCount < 4) {
    throw new Error(
      `Browser product loop provider saw ${provider.reviewModelRequestCount} request(s) for the review model; expected organizer, review, risk, and answer steps to use it.`
    );
  }
} catch (error) {
  if (daemon.exited) {
    throw new Error(
      `Browser product loop daemon exited early: code=${daemon.exitCode} signal=${daemon.exitSignal}\n${formatProcessOutput(daemon.stdout, daemon.stderr)}`,
      { cause: error }
    );
  }

  if (web.exited) {
    throw new Error(
      `Browser product loop Web server exited early: code=${web.exitCode} signal=${web.exitSignal}\n${formatProcessOutput(web.stdout, web.stderr)}`,
      { cause: error }
    );
  }

  throw new Error(
    [
      "Browser product loop smoke failed.",
      await formatPageDebug(activePage),
      formatProcessOutput(daemon.stdout, daemon.stderr, "daemon"),
      formatProcessOutput(web.stdout, web.stderr, "web")
    ].join("\n"),
    { cause: error }
  );
} finally {
  if (browser) {
    await browser.close();
  }
  await terminateChild(web.child, web.exitPromise);
  await terminateChild(daemon.child, daemon.exitPromise);
  await provider.close();
  rmSync(tempDir, { recursive: true, force: true });
}

async function formatPageDebug(page) {
  if (!page) {
    return "page output: none.";
  }

  try {
    const text = await page.locator("body").innerText({ timeout: 1000 });
    return [
      `page url: ${page.url()}`,
      `page text:\n${text.slice(0, 4000)}`
    ].join("\n");
  } catch (error) {
    return `page output unavailable: ${error.message}`;
  }
}

console.log("Browser product loop smoke checks passed.");

async function runBrowserProductLoop(page, { webBaseUrl, providerBaseUrl }) {
  await page.goto(`${webBaseUrl}/setup/models`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Connect AI" }).waitFor();
  await page.getByText("Local service connected").waitFor();
  await page.getByText("Configure OpenAI-compatible provider").waitFor();
  await assertDefaultViewSafety(page, "setup start", { providerBaseUrl });

  await page.getByLabel("Provider API key").fill(dummyApiKey);
  await page.getByLabel("Base URL").fill(providerBaseUrl);
  await page.getByRole("textbox", { name: "Model" }).fill(modelName);
  await page.getByRole("button", { name: "Save AI setup" }).click();
  await page.getByText("AI setup saved locally").waitFor();
  await page.getByRole("button", { name: "Check readiness" }).click();
  await page.getByText("Test provider connection").first().waitFor();
  await assertDefaultViewSafety(page, "after saving setup", { providerBaseUrl });

  await page
    .getByLabel("Configure OpenAI-compatible")
    .getByRole("button", { name: "Test connection" })
    .click();
  await page.getByText("Provider connection verified").waitFor();
  await page.getByText("Ready for discussions").first().waitFor();
  const focusedStartLink = page.getByRole("link", { name: "Start focused discussion" }).first();
  const broaderStartLink = page.getByRole("link", { name: "Start broader discussion" }).first();
  await focusedStartLink.waitFor();
  await broaderStartLink.waitFor();
  await assertStartLink(focusedStartLink, {
    label: "focused setup start link",
    perspectiveCount: "2"
  });
  await assertStartLink(broaderStartLink, {
    label: "broader setup start link",
    perspectiveCount: "3"
  });
  await assertDefaultViewSafety(page, "after verifying setup", { providerBaseUrl });

  await broaderStartLink.click();
  await page.waitForURL(/\/runs\/new\?participants=model-backed&perspectives=3$/);
  await page.getByRole("heading", { name: "New Discussion" }).waitFor();
  await page.getByText("Discussion with AI selected").waitFor();
  await page.getByText("Additional viewpoint", { exact: true }).waitFor();
  await page.getByText("Preview participants and review path").click();
  await page.getByText("3 AI perspectives").waitFor();
  await page
    .locator('label[for="discussion-model-override"]')
    .getByText("Model for first replies", { exact: true })
    .waitFor();
  await page
    .locator('label[for="discussion-review-model-override"]')
    .getByText("Model for review and answer", { exact: true })
    .waitFor();
  await page.getByText("Saved AI setup").first().waitFor();
  if (!(await page.getByRole("radio", { name: /Broader review/i }).isChecked())) {
    throw new Error("Broader setup start link did not preselect Broader review.");
  }
  await assertDefaultViewSafety(page, "broader start discussion", { providerBaseUrl });

  await page.getByRole("radio", { name: /Focused review/i }).click();
  if (!(await page.getByRole("radio", { name: /Focused review/i }).isChecked())) {
    throw new Error("Focused review could not be selected after checking the broader setup start link.");
  }
  await page.getByText("Ready to create a deliberation room").waitFor();
  await page.locator("#discussion-model-override").fill(discussionModelName);
  await page.getByText(discussionModelName).first().waitFor();
  await page
    .getByText("Viewpoints without their own model use this first-response model.")
    .waitFor();
  await page.locator("#discussion-review-model-override").fill(reviewModelName);
  await page.getByText(reviewModelName).waitFor();
  await page
    .getByText(
      "Review roles use this model while first-response viewpoints keep their assigned models."
    )
    .waitFor();
  await page.getByRole("checkbox", { name: /Choose models per viewpoint/i }).click();
  await page.getByLabel("First viewpoint model").fill(perspectiveModelName);
  await page.getByText("Viewpoint models customized").waitFor();
  await page
    .getByLabel("Viewpoint model choices")
    .getByText(
      "Per-viewpoint choices affect first replies only. Review and answer steps use the review model when one is set."
    )
    .waitFor();
  await page.getByText("Participant model choices", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save participant choices" }).click();
  await page
    .getByText(
      "Saved participant choices to the local service. API keys and base URLs are not stored here."
    )
    .waitFor();
  await page.getByRole("link", { name: "Open Connect AI" }).click();
  await page.getByRole("heading", { name: "Connect AI" }).waitFor();
  await page.getByText("Saved participant choices", { exact: true }).waitFor();
  await page
    .getByText(
      "Connect AI shows the saved participant choices before you start. API keys, base URLs, and internal provider details are not shown here."
    )
    .waitFor();
  await page.getByText(discussionModelName).waitFor();
  await page.getByText(reviewModelName).waitFor();
  await page.getByText("1 custom viewpoint model").waitFor();
  if ((await page.locator("#setup-role-first-response-model").inputValue()) !== discussionModelName) {
    throw new Error("Connect AI did not show the saved model for first replies.");
  }
  if ((await page.locator("#setup-role-review-model").inputValue()) !== reviewModelName) {
    throw new Error("Connect AI did not show the saved review and answer model.");
  }
  if ((await page.getByLabel("First viewpoint model").inputValue()) !== perspectiveModelName) {
    throw new Error("Connect AI did not show the saved First viewpoint model.");
  }
  await page.getByRole("button", { name: "Save participant choices" }).click();
  await page
    .getByText(
      "Saved participant choices to the local service. API keys and base URLs are not stored here."
    )
    .waitFor();
  await page.getByRole("link", { name: "Start broader discussion" }).first().click();
  await page.waitForURL(/\/runs\/new\?participants=model-backed&perspectives=3$/);
  await page.getByRole("heading", { name: "New Discussion" }).waitFor();
  await page.getByText("Saved participant choices are available from the local service.").waitFor();
  if ((await page.locator("#discussion-model-override").inputValue()) !== discussionModelName) {
    throw new Error("Saved participant choices did not restore the first-response model.");
  }
  if ((await page.locator("#discussion-review-model-override").inputValue()) !== reviewModelName) {
    throw new Error("Saved participant choices did not restore the review and answer model.");
  }
  if ((await page.getByLabel("First viewpoint model").inputValue()) !== perspectiveModelName) {
    throw new Error("Saved participant choices did not restore the First viewpoint model.");
  }
  await page.getByRole("button", { name: "Clear saved participant choices" }).click();
  await page
    .getByText(
      "Cleared saved participant choices from the local service. Current discussion fields are unchanged."
    )
    .waitFor();
  await assertDefaultViewSafety(page, "start discussion", { providerBaseUrl });

  await page.getByLabel("Discussion question").fill(discussionQuestion);
  await page.getByRole("button", { name: "Create discussion" }).click();
  await page.getByRole("region", { name: "Discussion room overview" }).waitFor();
  await page.locator(".du-room-composer").waitFor();
  await assertDiscussionRoomOverview(page, {
    label: "discussion room before continuation",
    expectedNextAction: "Continue discussion"
  });
  await assertRoomHeaderStatus(page, {
    label: "discussion room before continuation",
    expectedStatus: "Next step",
    expectedNextAction: "Continue discussion"
  });
  await page.locator(".du-room-system-message").first().waitFor();
  await page.getByText("Shared the discussion brief", { exact: true }).waitFor();
  await assertRoomComposerShellCompact(page, "discussion room before continuation");
  await assertRoomReportDetailsHidden(page, "discussion room before continuation");
  await page.getByRole("button", { name: "Send message and continue" }).waitFor();
  await assertDesktopRoomConversationFirstView(page, "discussion room before continuation");
  await assertComposerActionsCompact(page, "discussion room before continuation", {
    maxActionListHeight: 120,
    maxButtonHeight: 64
  });
  await assertDefaultViewSafety(page, "discussion room before continuation", { providerBaseUrl });
  await assertMobileDiscussionRoomShell(page, "discussion room mobile before continuation");

  await page.getByRole("button", { name: "Send message and continue" }).click();
  await page.getByText("Discussion paused", { exact: true }).waitFor();
  await assertRoomUpdateMessage(page, "discussion room after transient participant failure");
  await assertConversationTranscriptReturnedToViewport(page, "discussion room after transient participant failure");
  await page
    .getByText(
      "A first-response participant still needs to finish. Review visible progress, then try Continue discussion again."
    )
    .waitFor();
  await assertRoomReportDetailsHidden(page, "discussion room after transient participant failure");
  await assertDefaultViewSafety(page, "discussion room after transient participant failure", {
    providerBaseUrl
  });

  await openRoomUpdateDetails(page, "discussion room after transient participant failure");
  const updatedSteps = page.getByRole("region", { name: "Updated discussion steps" });
  await updatedSteps.waitFor();
  await updatedSteps.getByText("Needs attention", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Send message and continue" }).click();
  await page.getByRole("link", { name: "Review current answer" }).first().waitFor();
  await assertRoomConversationShellAfterMessages(page, "discussion room after continuation");
  await assertSuccessfulRoomUpdateReceipt(page, "discussion room after continuation");
  await assertConversationTranscriptReturnedToViewport(page, "discussion room after continuation");
  await page
    .locator(".du-room-activity-item[data-speaker='participant'] .du-room-activity-bubble")
    .first()
    .waitFor();
  await assertUserContinuationTurn(page, "discussion room after continuation");
  await page
    .locator(".du-room-system-message")
    .filter({ hasText: "Made first responses visible" })
    .waitFor();
  await page
    .locator("#room-conversation-transcript")
    .getByText("Connected the first responses", { exact: true })
    .waitFor();
  await page
    .locator("#room-conversation-transcript")
    .getByText(
      /Now that the first responses are visible, I'm responding to (First viewpoint|Alternative viewpoint|Additional viewpoint)/
    )
    .first()
    .waitFor();
  await page.locator("#room-conversation-transcript").waitFor();
  await page.getByText("Discussion round 1", { exact: true }).waitFor();
  const conversationTranscript = page.locator("#room-conversation-transcript");
  await conversationTranscript.getByText("Opened independent first responses", { exact: true }).waitFor();
  await conversationTranscript.getByText("Responding to the discussion brief", { exact: true }).first().waitFor();
  await conversationTranscript.getByText("Challenging the current direction", { exact: true }).first().waitFor();
  await assertRoomMessageFlowCompact(page, "discussion room after continuation");
  await page.getByText("Next in the room", { exact: true }).waitFor();
  await page
    .locator("#room-conversation-transcript")
    .getByText("Evidence checker", { exact: true })
    .waitFor();
  await page
    .locator("#room-conversation-transcript")
    .getByText("1 evidence gap still needs checking before relying on the answer.")
    .waitFor();
  await page
    .getByText("Review queue: 1 still unresolved, 1 needs checking, 1 must cover.")
    .waitFor();
  await conversationTranscript
    .getByText("This browser perspective supports the verified provider path.")
    .first()
    .waitFor();
  await assertDetailedReviewPanelsCollapsed(page, "discussion room after continuation");
  await openDetailedReviewPanels(page, "discussion room after continuation");
  const detailedReviewPanels = page.locator(
    'details.du-advanced-panel[data-advanced-panel="Structured discussion details"]'
  );
  await detailedReviewPanels
    .getByText("Use the verified provider path for reviewable browser discussions")
    .first()
    .waitFor();
  await detailedReviewPanels
    .getByText(/browser walkthrough.*what needs checking.*visible/i)
    .first()
    .waitFor();
  await detailedReviewPanels
    .getByText("Confirm browser evidence before treating the answer as stable.")
    .first()
    .waitFor();
  await page
    .locator("#room-conversation-transcript")
    .getByText("Browser-backed answers remain provisional until risks are reviewed.")
    .first()
    .waitFor();
  await page
    .getByText(
      "Participants respond to the brief first; then the organizer, skeptic, and evidence checker join as chat-like replies."
    )
    .waitFor();
  await page.getByText("To the strongest current option").first().waitFor();
  await page.getByText("Shared a strongest current option").first().waitFor();
  await page.getByText("Sharing a strongest current option").first().waitFor();
  await page.getByText("Replying to First viewpoint's latest point").first().waitFor();
  await page
    .getByText("Replying to First viewpoint's option with an open disagreement")
    .first()
    .waitFor();
  await page.getByText("Checking evidence behind First viewpoint's claim").first().waitFor();
  await assertRoomReportDetailsHidden(page, "discussion room output summary");
  await page.getByText("Current answer: Ready to review").waitFor();
  await page.locator(".du-room-focus").getByText("Needs checking", { exact: true }).waitFor();
  await page.locator(".du-room-focus").getByText("Risks", { exact: true }).waitFor();
  const roomReviewConclusionLink = page
    .locator("#room-next-action")
    .getByRole("link", { name: "Review current answer", exact: true });
  await roomReviewConclusionLink.waitFor();
  await page.getByRole("link", { name: "Review unresolved points", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Check evidence", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Update answer", exact: true }).first().waitFor();
  await assertComposerActionsCompact(page, "discussion room after continuation", {
    maxActionListHeight: 240,
    maxButtonHeight: 64
  });
  await assertRoomComposerShellCompact(page, "discussion room after continuation", {
    maxComposerHeight: 560,
    maxActionListHeight: 150
  });
  await assertDefaultViewSafety(page, "discussion room after continuation", { providerBaseUrl });

  await roomReviewConclusionLink.click();
  await page.waitForURL(/\/outcome$/);
  await page.getByRole("heading", { name: "Current Answer" }).first().waitFor();
  await page.getByText("Use the verified provider path after reviewing browser-visible unresolved points.").waitFor();
  await page.getByText("Browser-backed answers remain provisional until risks are reviewed.").waitFor();
  await page.getByText("The browser walkthrough still needs to prove checks stay visible.").waitFor();
  await page.getByText("Run another browser walkthrough after UI changes.").waitFor();
  await assertDefaultViewSafety(page, "current answer", { providerBaseUrl });
}

async function assertDiscussionRoomOverview(page, { label, expectedNextAction }) {
  const overview = page.getByRole("region", { name: "Discussion room overview" });

  try {
    await overview.waitFor();
    await overview.getByText("Discussion room", { exact: true }).waitFor();
    await overview.getByText(expectedNextAction, { exact: true }).waitFor();
    const chatShell = page.locator(".du-room-chat-shell");
    await chatShell.waitFor();
    await chatShell.getByRole("region", { name: "Conversation transcript" }).waitFor();
    await chatShell.locator(".du-room-action-rail").waitFor();
    await chatShell.getByText("Send message to the room", { exact: true }).first().waitFor();
  } catch (error) {
    throw new Error(`${label} did not render a readable discussion room overview.`, {
      cause: error
    });
  }
}

async function assertRoomUpdateMessage(page, label) {
  const roomUpdate = page.locator("#latest-discussion-update.du-room-update-message");
  try {
    await roomUpdate.waitFor();
    await roomUpdate.locator(".du-room-update-avatar").waitFor();
    await roomUpdate.getByText("Room update", { exact: true }).waitFor();
    await roomUpdate.getByRole("heading", { name: "The room just updated" }).waitFor();
    await roomUpdate.getByRole("region", { name: "New discussion round" }).waitFor();
    const updateMessages = roomUpdate.getByRole("list", { name: "Discussion update messages" });
    await updateMessages.waitFor();
    await updateMessages.getByText("First viewpoint", { exact: true }).first().waitFor();
    await updateMessages.getByText("Alternative viewpoint", { exact: true }).first().waitFor();
    await updateMessages
      .getByText("Answered another participant", { exact: true })
      .first()
      .waitFor();
    const oldShortcutCount = await roomUpdate
      .getByRole("navigation", { name: "Room update shortcuts" })
      .count();
    const defaultStepCount = await roomUpdate
      .getByRole("region", { name: "Updated discussion steps" })
      .count();
    const metrics = await roomUpdate.evaluate((element) => {
      const details = element.querySelector(
        'details[data-advanced-panel="Post-update discussion details"]'
      );

      return {
        detailsOpen: Boolean(details && details.open),
        hasOldRoomReviewCopy: element.textContent?.includes("Review this room update") ?? false,
        hasOldDetailedUpdateCopy:
          element.textContent?.includes("Review detailed update") ?? false,
        hasGuidedSuccessDetail:
          element.textContent?.includes("The guided update ran with the current brief") ?? false
      };
    });

    if (
      oldShortcutCount !== 0 ||
      defaultStepCount !== 0 ||
      metrics.detailsOpen ||
      metrics.hasOldRoomReviewCopy ||
      metrics.hasOldDetailedUpdateCopy ||
      metrics.hasGuidedSuccessDetail
    ) {
      throw new Error(
        `${label} should show the continuation as room messages first, got ${JSON.stringify({
          oldShortcutCount,
          defaultStepCount,
          ...metrics
        })}.`
      );
    }
  } catch (error) {
    throw new Error(`${label} did not render the latest update as a room message.`, {
      cause: error
    });
  }
}

async function assertSuccessfulRoomUpdateReceipt(page, label) {
  const roomUpdate = page.locator("#latest-discussion-update.du-room-update-message");

  try {
    await roomUpdate.waitFor();
    await roomUpdate.getByText("Room update", { exact: true }).waitFor();
    await roomUpdate.getByRole("heading", { name: "The room just updated" }).waitFor();
    await roomUpdate.getByRole("region", { name: "New discussion round" }).waitFor();
    const updateMessages = roomUpdate.getByRole("list", { name: "Discussion update messages" });
    await updateMessages.waitFor();
    await updateMessages.getByText("Shared a first response", { exact: true }).first().waitFor();
    await updateMessages
      .getByText("Answered another participant", { exact: true })
      .first()
      .waitFor();
    const updateText = await updateMessages.innerText();

    if (
      ![
        "Discussion organizer",
        "Skeptic",
        "Evidence checker",
        "Summary writer",
        "Risk reviewer"
      ].some((speaker) => updateText.includes(speaker))
    ) {
      throw new Error(`${label} did not include an organizer or reviewer message.`);
    }

    const defaultStepCount = await roomUpdate
      .getByRole("region", { name: "Updated discussion steps" })
      .count();

    if (defaultStepCount !== 0) {
      throw new Error(`${label} exposed updated step metadata before Advanced was opened.`);
    }
  } catch (error) {
    throw new Error(`${label} did not show the successful continuation as a readable room update.`, {
      cause: error
    });
  }
}

async function assertUserContinuationTurn(page, label) {
  const userTurn = page
    .getByRole("region", { name: "Conversation transcript" })
    .locator(".du-room-activity-item[data-speaker='user'] .du-room-activity-bubble");

  try {
    await userTurn.waitFor();
    await userTurn.getByText("You", { exact: true }).waitFor();
    await userTurn.getByText("Asked the room to continue", { exact: true }).waitFor();
    await userTurn
      .getByText("The room continued from your brief before participants responded.", { exact: true })
      .waitFor();
  } catch (error) {
    throw new Error(`${label} did not show the user's room action as a chat turn.`, {
      cause: error
    });
  }
}

async function openRoomUpdateDetails(page, label) {
  const details = page.locator(
    '#latest-discussion-update.du-room-update-message details[data-advanced-panel="Post-update discussion details"]'
  );

  try {
    await details.waitFor();

    if (!(await details.evaluate((element) => element.open))) {
      await details.locator("summary").click();
    }
  } catch (error) {
    throw new Error(`${label} could not open detailed room update.`, {
      cause: error
    });
  }
}

async function assertDetailedReviewPanelsCollapsed(page, label) {
  const details = page.locator(
    'details.du-advanced-panel[data-advanced-panel="Structured discussion details"]'
  );

  try {
    await details.waitFor();

    const open = await details.evaluate((element) => element.open);
    if (open) {
      throw new Error("Structured discussion details were open by default.");
    }
  } catch (error) {
    throw new Error(`${label} should keep structured discussion details collapsed by default.`, {
      cause: error
    });
  }
}

async function openDetailedReviewPanels(page, label) {
  const details = page.locator(
    'details.du-advanced-panel[data-advanced-panel="Structured discussion details"]'
  );

  try {
    await details.waitFor();

    if (!(await details.evaluate((element) => element.open))) {
      await details.locator("> summary").click();
    }
  } catch (error) {
    throw new Error(`${label} could not open structured discussion details.`, {
      cause: error
    });
  }
}

async function assertConversationTranscriptReturnedToViewport(page, label) {
  await page.getByText("Conversation transcript", { exact: true }).waitFor();

  const metrics = await page.locator("#room-conversation-transcript").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const actionRailRect = document
      .querySelector(".du-room-action-rail")
      ?.getBoundingClientRect();
    const timelineRect = document
      .querySelector("#discussion-timeline")
      ?.getBoundingClientRect();
    const firstParticipantRect = document
      .querySelector(".du-room-activity-item[data-speaker='participant'] .du-room-activity-bubble")
      ?.getBoundingClientRect();
    const nextActionRect = document
      .querySelector("#room-next-action")
      ?.getBoundingClientRect();
    const updateRect = document
      .querySelector("#latest-discussion-update")
      ?.getBoundingClientRect();

    return {
      transcriptTop: rect.top,
      transcriptBottom: rect.bottom,
      actionRailTop: actionRailRect?.top ?? null,
      actionRailBottom: actionRailRect?.bottom ?? null,
      timelineTop: timelineRect?.top ?? null,
      timelineBottom: timelineRect?.bottom ?? null,
      firstParticipantTop: firstParticipantRect?.top ?? null,
      firstParticipantBottom: firstParticipantRect?.bottom ?? null,
      nextActionTop: nextActionRect?.top ?? null,
      updateTop: updateRect?.top ?? null,
      viewportHeight: window.innerHeight
    };
  });

  if (
    metrics.transcriptTop < -24 ||
    metrics.transcriptTop > metrics.viewportHeight * 0.65 ||
    metrics.transcriptBottom <= 240 ||
    (metrics.firstParticipantTop !== null &&
      metrics.firstParticipantTop > metrics.viewportHeight) ||
    metrics.timelineBottom === null ||
    metrics.timelineBottom <= 240
  ) {
    throw new Error(
      `${label} should return the viewport to the conversation transcript, got ${JSON.stringify(
        metrics
      )}.`
    );
  }
}

async function assertRoomMessageFlowCompact(
  page,
  label,
  { maxSummaryHeight = 118, maxIntroHeight = 54, maxPhaseHeight = 92 } = {}
) {
  await page.locator(".du-room-thread-summary").waitFor();
  await page.locator(".du-room-thread-intro").waitFor();
  await page.locator(".du-room-phase-separator").first().waitFor();

  const metrics = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      return {
        height: rect.height,
        width: rect.width
      };
    };
    const phaseSeparators = Array.from(document.querySelectorAll(".du-room-phase-separator"));
    const phaseDetails = Array.from(document.querySelectorAll(".du-room-phase-detail"));
    const exchangeDetails = Array.from(document.querySelectorAll(".du-room-round-exchange"));

    return {
      summary: rectFor(".du-room-thread-summary"),
      intro: rectFor(".du-room-thread-intro"),
      phaseHeights: phaseSeparators.map((element) => element.getBoundingClientRect().height),
      hiddenPhaseDetailCount: phaseDetails.filter(
        (element) => getComputedStyle(element).display === "none"
      ).length,
      phaseDetailCount: phaseDetails.length,
      visibleExchangeDetailCount: exchangeDetails.filter(
        (element) => getComputedStyle(element).display !== "none"
      ).length
    };
  });

  const tallestPhase = Math.max(0, ...metrics.phaseHeights);

  if (
    !metrics.summary ||
    metrics.summary.height > maxSummaryHeight ||
    !metrics.intro ||
    metrics.intro.height > maxIntroHeight ||
    metrics.phaseHeights.length === 0 ||
    tallestPhase > maxPhaseHeight ||
    metrics.phaseDetailCount === 0 ||
    metrics.hiddenPhaseDetailCount !== metrics.phaseDetailCount ||
    metrics.visibleExchangeDetailCount === 0
  ) {
    throw new Error(
      `${label} should keep the visible message thread compact, got ${JSON.stringify(
        metrics
      )}.`
    );
  }
}

async function assertComposerActionsCompact(
  page,
  label,
  { maxActionListHeight, maxButtonHeight }
) {
  const metrics = await page.locator(".du-discussion-actions-room").evaluate((element) => {
    const actionList = element.querySelector(".du-discussion-action-list");
    const buttons = Array.from(element.querySelectorAll(".du-discussion-action-button"));

    return {
      actionListHeight: actionList?.getBoundingClientRect().height ?? 0,
      buttonHeights: buttons.map((button) => button.getBoundingClientRect().height),
      buttonCount: buttons.length
    };
  });

  const tallestButton = Math.max(0, ...metrics.buttonHeights);

  if (
    metrics.buttonCount === 0 ||
    metrics.actionListHeight > maxActionListHeight ||
    tallestButton > maxButtonHeight
  ) {
    throw new Error(
      `${label} should keep room actions compact, got ${JSON.stringify(metrics)}.`
    );
  }
}

async function assertRoomComposerShellCompact(
  page,
  label,
  { maxComposerHeight = 540, maxCopyHeight = 88, maxActionListHeight = 96 } = {}
) {
  await page.locator(".du-room-composer").waitFor();
  await page.locator(".du-room-composer-copy").waitFor();
  await page.locator(".du-room-message-input textarea").waitFor();

  const metrics = await page.locator(".du-room-composer").evaluate((element) => {
    const copy = element.querySelector(".du-room-composer-copy");
    const actionList = element.querySelector(".du-discussion-action-list");
    const messageInput = element.querySelector(".du-room-message-input textarea");
    const details = element.querySelector(".du-continuation-details");
    const avatar = element.querySelector(".du-room-composer-avatar");
    const rect = element.getBoundingClientRect();
    const text = element.textContent ?? "";
    const continuationDetailsVisible = Array.from(
      element.querySelectorAll(".du-continuation-details")
    ).some((entry) => getComputedStyle(entry).display !== "none");

    return {
      composerHeight: rect.height,
      copyHeight: copy?.getBoundingClientRect().height ?? 0,
      actionListHeight: actionList?.getBoundingClientRect().height ?? 0,
      detailsOpen: Boolean(details?.open),
      continuationDetailsVisible,
      hasAvatar: Boolean(avatar),
      hasMessageInput: Boolean(messageInput),
      actionCount: actionList?.querySelectorAll(".du-discussion-action-button").length ?? 0,
      composerLabel: element.getAttribute("aria-label"),
      actionLabel: element
        .querySelector(".du-discussion-actions-room")
        ?.getAttribute("aria-label"),
      hasQuickReplies: text.includes("Quick replies") && text.includes("Send message to the room"),
      hasOldActionPanelCopy:
        text.includes("Room actions") || text.includes("What should happen next?")
    };
  });

  if (
    metrics.composerHeight > maxComposerHeight ||
    metrics.copyHeight > maxCopyHeight ||
    metrics.actionListHeight > maxActionListHeight ||
    metrics.detailsOpen ||
    metrics.continuationDetailsVisible ||
    !metrics.hasAvatar ||
    !metrics.hasMessageInput ||
    metrics.actionCount === 0 ||
    metrics.composerLabel !== "Room quick replies" ||
    metrics.actionLabel !== "Room quick replies" ||
    !metrics.hasQuickReplies ||
    metrics.hasOldActionPanelCopy
  ) {
    throw new Error(
      `${label} should keep room actions shaped like a chat composer with message input, got ${JSON.stringify(
        metrics
      )}.`
    );
  }
}

async function assertMobileDiscussionRoomShell(page, label) {
  const desktopViewport = page.viewportSize() ?? { width: 1280, height: 900 };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("[aria-label='Discussion timeline']").waitFor();
  await page.locator(".du-room-composer").waitFor();

  const metrics = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        width: rect.width
      };
    };
    const elements = Array.from(document.querySelectorAll("*"));
    const header = document.querySelector(".du-room-header");
    const strip = document.querySelector(".du-room-action-strip");
    const timeline = document.querySelector("[aria-label='Discussion timeline']");
    const chatShell = document.querySelector(".du-room-chat-shell");
    const transcript = document.querySelector("#room-conversation-transcript");
    const nextAction = document.querySelector("#room-next-action");
    const composer = document.querySelector(".du-room-composer");
    const actionRail = document.querySelector(".du-room-action-rail");
    const progressDetails = document.querySelector(".du-room-progress-details");

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      sidebar: rectFor(".du-sidebar"),
      pageHeader: rectFor(".du-page-header"),
      panelHeading: rectFor(".du-view-body > .du-panel > .du-panel-heading"),
      roomLayout: rectFor(".du-room-layout"),
      header: rectFor(".du-room-header"),
      threadSummary: rectFor(".du-room-thread-summary"),
      threadIntro: rectFor(".du-room-thread-intro"),
      phaseSeparator: rectFor(".du-room-phase-separator"),
      chatShell: rectFor(".du-room-chat-shell"),
      hasStrip: Boolean(strip),
      hasActionRail: Boolean(actionRail),
      timeline: rectFor("[aria-label='Discussion timeline']"),
      nextAction: rectFor("#room-next-action"),
      composer: rectFor(".du-room-composer"),
      order: {
        headerBeforeTimeline:
          Boolean(header && timeline) && elements.indexOf(header) < elements.indexOf(timeline),
        timelineBeforeNextAction:
          Boolean(timeline && nextAction) && elements.indexOf(timeline) < elements.indexOf(nextAction),
        timelineBeforeComposer:
          Boolean(timeline && composer) && elements.indexOf(timeline) < elements.indexOf(composer),
        timelineContainsComposer: Boolean(timeline && composer && timeline.contains(composer)),
        chatShellContainsTranscript: Boolean(
          chatShell && transcript && chatShell.contains(transcript)
        ),
        chatShellContainsActionRail: Boolean(
          chatShell && actionRail && chatShell.contains(actionRail)
        ),
        transcriptContainsComposer: Boolean(transcript && composer && transcript.contains(composer)),
        actionRailContainsComposer: Boolean(actionRail && composer && actionRail.contains(composer)),
        transcriptBeforeComposer:
          Boolean(transcript && composer) && elements.indexOf(transcript) < elements.indexOf(composer),
        transcriptBeforeNextAction:
          Boolean(transcript && nextAction) && elements.indexOf(transcript) < elements.indexOf(nextAction),
        nextActionBeforeComposer:
          Boolean(nextAction && composer) && elements.indexOf(nextAction) < elements.indexOf(composer),
        composerBeforeProgress:
          Boolean(composer && progressDetails) &&
          elements.indexOf(composer) < elements.indexOf(progressDetails)
      }
    };
  });

  await page.setViewportSize(desktopViewport);
  await page.locator(".du-room-composer").waitFor();

  if (
    !metrics.sidebar ||
    metrics.sidebar.height > 190 ||
    metrics.pageHeader ||
    metrics.panelHeading ||
    !metrics.roomLayout ||
    metrics.roomLayout.top > 620 ||
    !metrics.header ||
    !metrics.threadSummary ||
    metrics.threadSummary.height > 118 ||
    !metrics.threadIntro ||
    metrics.threadIntro.height > 54 ||
    !metrics.phaseSeparator ||
    metrics.phaseSeparator.height > 92 ||
    !metrics.chatShell ||
    !metrics.order.headerBeforeTimeline ||
    metrics.hasStrip ||
    !metrics.timeline ||
    !metrics.nextAction ||
    !metrics.composer ||
    !metrics.hasActionRail ||
    !metrics.order.timelineBeforeNextAction ||
    !metrics.order.timelineBeforeComposer ||
    !metrics.order.timelineContainsComposer ||
    !metrics.order.chatShellContainsTranscript ||
    !metrics.order.chatShellContainsActionRail ||
    metrics.order.transcriptContainsComposer ||
    !metrics.order.actionRailContainsComposer ||
    !metrics.order.transcriptBeforeComposer ||
    !metrics.order.transcriptBeforeNextAction ||
    !metrics.order.nextActionBeforeComposer ||
    metrics.documentWidth > metrics.viewportWidth + 1
  ) {
    throw new Error(`${label} should keep mobile room chrome compact, got ${JSON.stringify(metrics)}.`);
  }
}

async function assertDesktopRoomConversationFirstView(page, label) {
  const previousViewport = page.viewportSize() ?? { width: 1280, height: 720 };

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("#room-conversation-transcript").waitFor();
  await page.locator(".du-room-system-message").first().waitFor();

  const metrics = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        width: rect.width
      };
    };

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      pageHeader: rectFor(".du-page-header"),
      panelHeading: rectFor(".du-view-body > .du-panel > .du-panel-heading"),
      header: rectFor(".du-room-header"),
      threadSummary: rectFor(".du-room-thread-summary"),
      transcript: rectFor("#room-conversation-transcript"),
      firstRoomMessage: rectFor(".du-room-system-message"),
      firstParticipantMessage: rectFor(
        ".du-room-activity-item[data-speaker='participant'] .du-room-activity-bubble"
      ),
      focusPanel: rectFor(".du-room-focus")
    };
  });

  await page.setViewportSize(previousViewport);
  await page.locator(".du-room-composer").waitFor();

  if (
    metrics.pageHeader ||
    metrics.panelHeading ||
    !metrics.header ||
    metrics.header.height > 220 ||
    !metrics.threadSummary ||
    metrics.threadSummary.height > 70 ||
    !metrics.transcript ||
    metrics.transcript.top > metrics.viewportHeight ||
    !metrics.firstRoomMessage ||
    metrics.firstRoomMessage.top > metrics.viewportHeight ||
    (metrics.firstParticipantMessage &&
      metrics.firstParticipantMessage.bottom > metrics.viewportHeight + 32) ||
    !metrics.focusPanel ||
    metrics.focusPanel.height > 400 ||
    metrics.documentWidth > metrics.viewportWidth + 1
  ) {
    throw new Error(
      `${label} should show the room transcript in the desktop first view, got ${JSON.stringify(
        metrics
      )}.`
    );
  }
}

async function assertRoomConversationShellAfterMessages(page, label) {
  const previousViewport = page.viewportSize() ?? { width: 1280, height: 720 };

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("#room-conversation-transcript").waitFor();
  await page
    .locator(".du-room-activity-item[data-speaker='participant'] .du-room-activity-bubble")
    .first()
    .waitFor();

  const metrics = await page.evaluate(() => {
    const firstParticipant = document
      .querySelector(".du-room-activity-item[data-speaker='participant'] .du-room-activity-bubble")
      ?.getBoundingClientRect();
    const roomHeader = document.querySelector(".du-room-header");

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      roomHeaderDisplay: roomHeader ? getComputedStyle(roomHeader).display : null,
      firstParticipant: firstParticipant
        ? {
            top: firstParticipant.top,
            bottom: firstParticipant.bottom,
            height: firstParticipant.height,
            width: firstParticipant.width
          }
        : null,
      messageContextCount: document.querySelectorAll(
        ".du-room-activity-item[data-speaker='participant'] .du-room-message-context"
      ).length,
      messageActionChipCount: document.querySelectorAll(
        ".du-room-activity-item[data-speaker='participant'] .du-room-message-action"
      ).length,
      messagePhaseChipCount: document.querySelectorAll(
        ".du-room-activity-item[data-speaker='participant'] .du-room-message-phase"
      ).length,
      outputSummaryOpen: document.querySelector(".du-room-outputs-section")?.hasAttribute("open"),
      focusPanelVisible: Boolean(document.querySelector(".du-room-focus"))
    };
  });

  await page.setViewportSize(previousViewport);
  await page.locator(".du-room-composer").waitFor();

  if (
    metrics.roomHeaderDisplay !== "none" ||
    !metrics.firstParticipant ||
    metrics.firstParticipant.top < 0 ||
    metrics.firstParticipant.bottom > metrics.viewportHeight + 32 ||
    metrics.messageContextCount < 1 ||
    metrics.messageActionChipCount !== 0 ||
    metrics.messagePhaseChipCount !== 0 ||
    metrics.outputSummaryOpen ||
    !metrics.focusPanelVisible ||
    metrics.documentWidth > metrics.viewportWidth + 1 ||
    metrics.firstParticipant.height > 220
  ) {
    throw new Error(
      `${label} should show participant messages as the first-view room conversation, got ${JSON.stringify(
        metrics
      )}.`
    );
  }
}

async function assertRoomHeaderStatus(page, { label, expectedStatus, expectedNextAction }) {
  const overview = page.getByRole("region", { name: "Discussion room overview" });
  try {
    await overview.waitFor();
    const roomStatus = overview.getByRole("status", { name: "Room status" });
    await roomStatus.waitFor();
    await roomStatus.getByText(expectedStatus, { exact: true }).waitFor();
    await roomStatus.getByText(expectedNextAction, { exact: true }).waitFor();
    if ((await page.locator(".du-room-status-cue").count()) !== 0) {
      throw new Error("The duplicate room status cue is still visible.");
    }
    if ((await page.getByRole("navigation", { name: "Primary discussion actions" }).count()) !== 0) {
      throw new Error("The old in-room action navigation is still visible.");
    }
    if ((await page.getByRole("navigation", { name: "Discussion actions" }).count()) !== 0) {
      throw new Error("The duplicate top room action strip is still visible.");
    }
  } catch (error) {
    throw new Error(`${label} did not render a compact room header status.`, {
      cause: error
    });
  }
}

async function assertRoomReportDetailsHidden(page, label) {
  const reportDetailsCount = await page.locator("details.du-room-secondary-details").count();
  const briefDetailsCount = await page.locator(".du-room-brief").count();
  const outputSummaryCount = await page.locator("details.du-room-outputs-section").count();
  const roomDetailsTextCount = await page.getByText("Room details", { exact: true }).count();
  const outputSummaryTextCount = await page.getByText("Room output summary", { exact: true }).count();

  if (
    reportDetailsCount !== 0 ||
    briefDetailsCount !== 0 ||
    outputSummaryCount !== 0 ||
    roomDetailsTextCount !== 0 ||
    outputSummaryTextCount !== 0
  ) {
    throw new Error(
      `${label} should not show report-style room details by default, got ${JSON.stringify({
        reportDetailsCount,
        briefDetailsCount,
        outputSummaryCount,
        roomDetailsTextCount,
        outputSummaryTextCount
      })}.`
    );
  }
}

async function assertStartLink(locator, { label, perspectiveCount }) {
  const href = await locator.getAttribute("href");

  if (!href?.includes("participants=model-backed")) {
    throw new Error(`${label} did not request AI participants.`);
  }

  if (!href.includes(`perspectives=${perspectiveCount}`)) {
    throw new Error(`${label} did not request ${perspectiveCount} model perspectives.`);
  }
}

async function assertDefaultViewSafety(page, label, { providerBaseUrl }) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenSnippets = [
    dummyApiKey,
    providerBaseUrl,
    modelName,
    "DELIBERUM_OPENAI_API_KEY",
    "providerConfigId",
    "openai-main",
    "smoke-browser-candidate",
    "smoke-browser-objection",
    "smoke-browser-evidence",
    "smoke-browser-topic-event",
    "smoke-browser-review-event",
    "provider_http_error",
    "transient browser product-loop participant failure"
  ];

  for (const snippet of forbiddenSnippets) {
    if (bodyText.includes(snippet)) {
      throw new Error(`${label} exposed forbidden default-view text: ${snippet}`);
    }
  }

  if (
    /\b(run|session|ledger|runtime|proposal|event|projection)\s*(id|ids)\b/i.test(bodyText) ||
    /raw json|resource posture/i.test(bodyText)
  ) {
    throw new Error(`${label} exposed low-level default-view language.`);
  }
}

async function startOpenAICompatibleMockProvider(port) {
  const state = {
    requestCount: 0,
    transientParticipantFailureCount: 0,
    discussionModelRequestCount: 0,
    perspectiveModelRequestCount: 0,
    reviewModelRequestCount: 0
  };
  const server = createHttpServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }

    state.requestCount += 1;

    try {
      const body = await readRequestJson(request);
      if (body?.model === discussionModelName) {
        state.discussionModelRequestCount += 1;
      }
      if (body?.model === perspectiveModelName) {
        state.perspectiveModelRequestCount += 1;
      }
      if (body?.model === reviewModelName) {
        state.reviewModelRequestCount += 1;
      }
      const content = createMockProviderContent(body, state);

      response.writeHead(200, {
        "content-type": "application/json"
      });
      response.end(
        JSON.stringify({
          id: `chatcmpl-browser-smoke-${state.requestCount}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: typeof body?.model === "string" ? body.model : modelName,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content
              }
            }
          ]
        })
      );
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: error.message } }));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });

  return {
    get requestCount() {
      return state.requestCount;
    },
    get transientParticipantFailureCount() {
      return state.transientParticipantFailureCount;
    },
    get discussionModelRequestCount() {
      return state.discussionModelRequestCount;
    },
    get perspectiveModelRequestCount() {
      return state.perspectiveModelRequestCount;
    },
    get reviewModelRequestCount() {
      return state.reviewModelRequestCount;
    },
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      })
  };
}

function createMockProviderContent(body, state) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages
    .filter((message) => message?.role === "system")
    .map((message) => String(message.content ?? ""))
    .join("\n");
  const userPayload = parseLastUserJson(messages);
  const userText = messages
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content ?? ""))
    .join("\n");

  if (system.includes("verifying Deliberum's local model provider setup")) {
    return "ready";
  }

  if (
    userText.includes("Display name: Perspective B") &&
    state.transientParticipantFailureCount === 0
  ) {
    state.transientParticipantFailureCount += 1;
    throw new Error("transient browser product-loop participant failure");
  }

  if (system.includes("Prepare Deliberum extraction proposal material only.")) {
    const allowedSourceEventIds = readStringArray(userPayload?.allowedSourceEventIds);
    const sourceEventIds = allowedSourceEventIds.length > 0
      ? [allowedSourceEventIds[0]]
      : [];

    return JSON.stringify({
      candidates: [
        {
          id: "smoke-browser-candidate",
          title: "Use the verified provider path for reviewable browser discussions",
          description:
            "The verified provider path can produce a reviewable browser answer when unresolved points, what needs checking, risks, and next steps stay visible.",
          sourceEventIds,
          status: "active",
          supportedBy: ["smoke-browser-claim"],
          attackedBy: ["smoke-browser-objection"],
          qualityObligationIds: ["smoke-browser-quality"],
          assumptions: ["The browser walkthrough verified provider setup first."],
          tradeoffs: ["The path must keep what needs checking visible in the room."],
          applicableWhen: ["The local service and provider setup are both ready."]
        }
      ],
      claims: [
        {
          id: "smoke-browser-claim",
          content:
            "The browser product loop can move from provider setup to a reviewable answer.",
          scope: "process",
          sourceEventIds,
          supports: ["smoke-browser-candidate"],
          dependsOn: [],
          challengedBy: ["smoke-browser-objection"]
        }
      ],
      objections: [
        {
          id: "smoke-browser-objection",
          targetId: "smoke-browser-candidate",
          failureMode:
            "The browser walkthrough still needs to prove checks stay visible.",
          consequence:
            "An AI UI pass could hide what needs checking before users review the answer.",
          severityClaim: "major",
          status: "open",
          sourceEventIds,
          responses: []
        }
      ],
      evidenceNeeds: [
        {
          id: "smoke-browser-evidence",
          targetClaimId: "smoke-browser-claim",
          requiredKind: "tool",
          reason:
            "Confirm browser evidence before treating the answer as stable.",
          priority: "high",
          status: "open",
          sourceEventIds
        }
      ],
      qualityObligations: [
        {
          id: "smoke-browser-quality",
          scope: "final_output",
          targetCandidateId: "smoke-browser-candidate",
          requirement:
            "The answer must keep browser-visible options, unresolved points, what needs checking, risks, and next steps visible.",
          status: "unanswered",
          sourceEventIds,
          supportingRefIds: ["smoke-browser-claim"],
          unresolvedObjectionIds: ["smoke-browser-objection"]
        }
      ],
      rationale:
        "The browser smoke provider returns deterministic review material for repeatable product-loop evidence."
    });
  }

  if (system.includes("Prepare Deliberum proposal review material only.")) {
    const allowedProposalEventIds = readStringArray(userPayload?.allowedProposalEventIds);
    return JSON.stringify({
      challenges: allowedProposalEventIds.slice(0, 1).map((proposalEventId) => ({
        targetProposalEventId: proposalEventId,
        reason:
          "Keep this generated proposal provisional until browser-visible checks are reviewed."
      })),
      notes: [
        "The browser smoke challenges the generated proposal to verify the default Web flow still reaches a provisional answer with unresolved points visible."
      ]
    });
  }

  if (system.includes("Prepare Deliberum final candidate proposal material only.")) {
    const allowedCandidateIds = readStringArray(userPayload?.allowedCandidateIds);
    return JSON.stringify({
      candidateIds: allowedCandidateIds.slice(0, 1),
      recommendation:
        "Use the verified provider path after reviewing browser-visible unresolved points.",
      applicabilityConditions: [
        "The local service is connected.",
        "The OpenAI-compatible provider has been saved and verified from Web."
      ],
      rationale:
        "The browser walkthrough reached reviewable discussion material from normal user actions.",
      limitations: [
        "The answer remains provisional until checks and risks are reviewed."
      ]
    });
  }

  if (system.includes("Prepare Deliberum final audit material only.")) {
    return JSON.stringify({
      findings: [
        "The provider-backed browser product loop produced a reviewable answer."
      ],
      risks: [
        "Browser-backed answers remain provisional until risks are reviewed."
      ],
      unresolvedObjectionIds: readStringArray(userPayload?.allowedUnresolvedObjectionIds),
      qualityObligationIds: readStringArray(userPayload?.allowedQualityObligationIds),
      evidenceNeedIds: readStringArray(userPayload?.allowedEvidenceNeedIds),
      omissions: [
        "The smoke uses a deterministic local provider."
      ],
      compressionProblems: [],
      limitations: [
        "A real external provider walkthrough should still be run before release."
      ],
      continuationSuggestions: [
        "Run another browser walkthrough after UI changes."
      ]
    });
  }

  return [
    "This browser perspective supports the verified provider path.",
    "Keep unresolved points, what needs checking, risk review, current answer, and next steps visible."
  ].join(" ");
}

function parseLastUserJson(messages) {
  const userMessages = messages.filter((message) => message?.role === "user");
  const content = userMessages[userMessages.length - 1]?.content;

  if (typeof content !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function readStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function startDaemonProcess({ port, cwd, webOrigin }) {
  return startChildProcess(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_DAEMON_CORS_ORIGINS: webOrigin
    }
  });
}

function startWebProcess({ port, daemonBaseUrl }) {
  return startChildProcess(
    "corepack",
    [
      "pnpm",
      "--filter",
      "@deliberum/web",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort"
    ],
    {
      cwd: repoRoot,
      env: {
        ...buildMinimalEnv(),
        VITE_DELIBERUM_DAEMON_URL: daemonBaseUrl
      }
    }
  );
}

function startChildProcess(command, args, { cwd = repoRoot, env }) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const state = {
    stdout: "",
    stderr: "",
    exited: false,
    exitCode: null,
    exitSignal: null
  };
  const exitPromise = once(child, "exit").then(([code, signal]) => {
    state.exited = true;
    state.exitCode = code;
    state.exitSignal = signal;
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    state.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    state.stderr += chunk;
  });

  return {
    child,
    exitPromise,
    get stdout() {
      return state.stdout;
    },
    get stderr() {
      return state.stderr;
    },
    get exited() {
      return state.exited;
    },
    get exitCode() {
      return state.exitCode;
    },
    get exitSignal() {
      return state.exitSignal;
    }
  };
}

async function waitForHttpOk(url, hasExited) {
  let lastError;

  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (hasExited()) {
      throw new Error(`Process exited before ${url} was available.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`${url} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for ${url}.`, {
    cause: lastError
  });
}

function readRequestJson(request) {
  return new Promise((resolveRead, rejectRead) => {
    let data = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolveRead(JSON.parse(data));
      } catch (error) {
        rejectRead(error);
      }
    });
    request.on("error", rejectRead);
  });
}

async function reserveLocalPort() {
  const server = createNetServer();

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;

  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });

  if (!port) {
    throw new Error("Could not reserve a local port for browser product loop smoke.");
  }

  return port;
}

async function terminateChild(child, exitPromise) {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exitPromise;
    return;
  }

  child.kill("SIGTERM");

  const exited = await Promise.race([exitPromise.then(() => true), delay(2000).then(() => false)]);
  if (exited) {
    return;
  }

  child.kill("SIGKILL");
  await exitPromise;
}

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Browser product loop smoke requires built daemon entrypoint: ${filePath}`);
  }
}

function formatProcessOutput(stdout, stderr, label = "process") {
  const lines = [`${label} output:`];

  if (stdout.trim().length > 0) {
    lines.push(`stdout:\n${stdout.trim()}`);
  }

  if (stderr.trim().length > 0) {
    lines.push(`stderr:\n${stderr.trim()}`);
  }

  return lines.length > 1 ? lines.join("\n") : `${label} output: none.`;
}

function buildMinimalEnv() {
  const names = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "WINDIR"
  ];
  const env = {
    NODE_ENV: "test"
  };

  for (const name of names) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  }

  return env;
}
