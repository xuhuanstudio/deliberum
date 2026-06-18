import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const releaseSmokeEnv = readReleaseSmokeEnv();
const releaseConfig = readReleaseSmokeConfig(releaseSmokeEnv);
const discussionQuestion = [
  "Run a Deliberum release-readiness check for a normal local user.",
  "Assess whether the product loop is ready to configure a real model provider,",
  "start a discussion with AI, review unresolved points, inspect what needs checking,",
  "understand risks, read the current answer, and choose next steps."
].join(" ");

assertFile(daemonEntry);

const daemonPort = await reserveLocalPort();
const webPort = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-web-release-readiness-"));
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
let latestProviderVerificationDebug = "";
let latestContinuationDebug = "";

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
  page.setDefaultTimeout(releaseConfig.browserTimeoutMs);

  await runReleaseReadinessProductLoop(page, {
    webBaseUrl: `http://127.0.0.1:${webPort}`
  });
} catch (error) {
  if (daemon.exited) {
    throw new Error(
      redactSensitive(
        `Release readiness daemon exited early: code=${daemon.exitCode} signal=${daemon.exitSignal}\n${formatProcessOutput(daemon.stdout, daemon.stderr, "daemon")}`
      ),
      { cause: error }
    );
  }

  if (web.exited) {
    throw new Error(
      redactSensitive(
        `Release readiness Web server exited early: code=${web.exitCode} signal=${web.exitSignal}\n${formatProcessOutput(web.stdout, web.stderr, "web")}`
      ),
      { cause: error }
    );
  }

  throw new Error(
    redactSensitive(
      [
        "Release readiness browser smoke failed.",
        await formatPageDebug(activePage),
        await formatRunDebug(activePage),
        latestProviderVerificationDebug,
        latestContinuationDebug,
        formatProcessOutput(daemon.stdout, daemon.stderr, "daemon"),
        formatProcessOutput(web.stdout, web.stderr, "web")
      ].join("\n")
    ),
    { cause: error }
  );
} finally {
  if (browser) {
    await browser.close();
  }
  await terminateChild(web.child, web.exitPromise);
  await terminateChild(daemon.child, daemon.exitPromise);
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Release readiness browser smoke checks passed.");

async function runReleaseReadinessProductLoop(page, { webBaseUrl }) {
  await page.goto(`${webBaseUrl}/setup/models`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Connect AI" }).waitFor();
  await page.getByText("Local service connected").waitFor();
  await page.getByText("Configure OpenAI-compatible provider").waitFor();
  await page.getByText("Structured review compatibility").waitFor();
  await assertDefaultViewSafety(page, "setup start");

  await page.getByLabel("Provider API key").fill(releaseConfig.apiKey);
  await page.getByLabel("Base URL").fill(releaseConfig.providerBaseUrl);
  await page.getByRole("textbox", { name: "Model" }).fill(releaseConfig.model);
  const structuredReview = page.getByRole("checkbox", {
    name: /Structured review compatibility/
  });
  if (!(await structuredReview.isChecked())) {
    await structuredReview.check();
  }
  await page.getByRole("button", { name: "Save AI setup" }).click();
  await page.getByText("AI setup saved locally").waitFor();
  await page.getByRole("button", { name: "Check readiness" }).click();
  await page.getByText("Needs test").first().waitFor();
  const providerSetupForm = page.locator("#setup-provider-form");
  await providerSetupForm.getByRole("button", { name: "Test connection" }).waitFor();
  await assertDefaultViewSafety(page, "after saving setup");

  const [verificationResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/runtime/setup/openai-compatible/verify",
      { timeout: releaseConfig.providerTimeoutMs }
    ),
    providerSetupForm.getByRole("button", { name: "Test connection" }).click()
  ]);
  latestProviderVerificationDebug =
    await summarizeProviderVerificationResponse(verificationResponse);
  const providerVerificationState = await waitForFirstVisible(page, [
    {
      label: "verified",
      locator: page.getByText("Provider connection verified")
    },
    {
      label: "failed",
      locator: page.getByText("Provider connection could not be verified")
    }
  ], releaseConfig.providerTimeoutMs);

  if (providerVerificationState !== "verified") {
    await assertProviderVerificationRecoveryActions(page, "provider verification failure");
    await assertDefaultViewSafety(page, "provider verification failure");
    throw new Error(
      "Release readiness provider verification did not pass before the discussion start; Web showed provider recovery actions."
    );
  }

  await page.getByText("Ready for discussions").first().waitFor();
  await assertDefaultViewSafety(page, "after verifying setup");

  await page.getByRole("link", { name: "Start discussion with AI" }).first().click();
  await page.waitForURL(/\/runs\/new\?participants=model-backed$/);
  await page.getByRole("heading", { name: "New Discussion" }).waitFor();
  await page.getByText("AI participants ready").waitFor();
  await page.getByText("Discussion with AI selected").waitFor();
  await selectPerspectiveDepth(page);
  await assertDefaultViewSafety(page, "start discussion");

  await page.getByLabel("Discussion question").fill(discussionQuestion);
  await page.getByRole("button", { name: "Create discussion" }).click();
  await page.getByText("Discussion room").waitFor();
  await page.getByText("Discussion with AI").first().waitFor();
  await assertDiscussionRoomChatSurface(page, "discussion room before continuation");
  await assertDefaultViewSafety(page, "discussion room before continuation");

  await continueDiscussionUntilCompleted(page);

  await assertSuccessfulRoomUpdate(page, "discussion room after continuation");
  const roomFocus = page.locator(".du-room-focus");
  await roomFocus.getByText("Decision workspace", { exact: true }).waitFor();
  await page.getByText("Strongest current options").first().waitFor();
  await roomFocus.getByText("Still unresolved", { exact: true }).waitFor();
  await roomFocus.getByText("Needs checking", { exact: true }).waitFor();
  await roomFocus.getByText("Risks", { exact: true }).waitFor();
  await roomFocus.getByText("Current answer: Ready to review").waitFor();
  await roomFocus.getByText("Next action", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Review current answer", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Review unresolved points", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Check evidence", exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Update answer", exact: true }).first().waitFor();
  await assertDefaultViewSafety(page, "discussion room after continuation", {
    allowModelGeneratedLowLevelLanguage: true
  });

  await page.getByRole("link", { name: "Review current answer", exact: true }).first().click();
  await page.waitForURL(/\/outcome$/);
  await page.getByRole("heading", { name: "Current Answer" }).first().waitFor();
  await page.getByText("Still unresolved").first().waitFor();
  await page.getByText("Needs checking").first().waitFor();
  await page.getByText("Risks").first().waitFor();
  await page.getByRole("heading", { name: "Next steps", exact: true }).waitFor();
  await assertDefaultViewSafety(page, "current answer", {
    allowModelGeneratedLowLevelLanguage: true
  });
}

async function selectPerspectiveDepth(page) {
  if (releaseConfig.perspectiveCount === 2) {
    const focusedReview = page.getByRole("radio", { name: /Focused review/ });
    await focusedReview.waitFor();
    if (!(await focusedReview.isChecked())) {
      await focusedReview.check();
    }
    await page
      .getByText("Two independent model perspectives keep the discussion concise.")
      .waitFor();
    return;
  }

  const broaderReview = page.getByRole("radio", { name: /Broader review/ });
  await broaderReview.waitFor();
  if (!(await broaderReview.isChecked())) {
    await broaderReview.check();
  }
  await page
    .getByText("Three independent model perspectives give the room more comparison material.")
    .waitFor();
}

async function assertDiscussionRoomChatSurface(page, label) {
  try {
    await page.getByRole("region", { name: "Discussion room overview" }).waitFor();
    await page.locator("[aria-label='Discussion timeline']").waitFor();
    await page.getByRole("region", { name: "Conversation transcript" }).waitFor();
    await page.getByText("Who is in this discussion", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Send message and continue" }).waitFor();
    await assertRoomReportDetailsHidden(page, label);
  } catch (error) {
    throw new Error(`${label} did not render the discussion room as a readable chat surface.`, {
      cause: error
    });
  }
}

async function assertSuccessfulRoomUpdate(page, label) {
  const roomUpdate = page.locator("#latest-discussion-update.du-room-update-message");

  try {
    await roomUpdate.waitFor();
    await roomUpdate.getByText("Room update", { exact: true }).waitFor();
    await roomUpdate.getByRole("heading", { name: "The room just updated" }).waitFor();
    await roomUpdate.getByRole("region", { name: "New discussion round" }).waitFor();
    await roomUpdate.getByText("First viewpoint", { exact: true }).first().waitFor();
    await roomUpdate.getByText("Alternative viewpoint", { exact: true }).first().waitFor();
    if (releaseConfig.perspectiveCount === 3) {
      const transcriptText = await page
        .getByRole("region", { name: "Conversation transcript" })
        .innerText();
      if (!transcriptText.includes("Additional viewpoint")) {
        throw new Error("Broader review transcript did not include Additional viewpoint.");
      }
    }
    await assertRoomReportDetailsHidden(page, label);
  } catch (error) {
    throw new Error(`${label} did not show the successful continuation as readable room messages.`, {
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

async function continueDiscussionUntilCompleted(page) {
  let finalState = "not_started";

  for (let attempt = 1; attempt <= releaseConfig.continueAttempts; attempt += 1) {
    const [startResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/runs\/[^/]+\/start$/.test(new URL(response.url()).pathname),
        { timeout: releaseConfig.productLoopTimeoutMs }
      ),
      page.getByRole("button", { name: "Send message and continue" }).click()
    ]);
    const startSummary = await summarizeStartResponse(startResponse, attempt);
    latestContinuationDebug = startSummary.debug;
    finalState = await waitForFirstVisible(page, [
      {
        label: "continued",
        locator: page.getByText("Discussion with AI continued")
      },
      {
        label: "paused",
        locator: page.getByText("Discussion paused")
      },
      {
        label: "failed",
        locator: page.getByText("Discussion could not continue")
      }
    ], releaseConfig.productLoopTimeoutMs);

    if (finalState === "continued") {
      return;
    }

    if (shouldExpectContinuationRecovery(finalState, startSummary.payload)) {
      await assertContinuationRecoveryActions(page, `continuation attempt ${attempt}`);
      await assertDefaultViewSafety(page, `continuation recovery attempt ${attempt}`, {
        allowModelGeneratedLowLevelLanguage: true
      });
    }

    if (attempt < releaseConfig.continueAttempts) {
      await page.reload({ waitUntil: "networkidle" });
      await assertDiscussionRoomChatSurface(
        page,
        `discussion room before continuation retry ${attempt + 1}`
      );
      await assertDefaultViewSafety(page, `discussion room before continuation retry ${attempt + 1}`, {
        allowModelGeneratedLowLevelLanguage: true
      });
    }
  }

  throw new Error(
    `Release readiness walkthrough did not complete the model-backed continuation after ${releaseConfig.continueAttempts} attempt(s): ${finalState}.`
  );
}

async function summarizeProviderVerificationResponse(response) {
  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    return [
      `provider verification response HTTP ${response.status()}`,
      `verification response JSON parse failed: ${error.message}`
    ].join("\n");
  }

  return redactSensitive(
    [
      `provider verification response HTTP ${response.status()}`,
      JSON.stringify(summarizeProviderVerificationPayload(payload), null, 2)
    ].join("\n")
  );
}

function summarizeProviderVerificationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      payload: "non_object"
    };
  }

  const error = readRecordValue(payload, "error");

  return {
    profileId: readRecordValue(payload, "profileId"),
    status: readRecordValue(payload, "status"),
    checked: readRecordValue(payload, "checked"),
    code: readRecordValue(payload, "code"),
    message: readRecordValue(payload, "message"),
    error: summarizeErrorPayload(error)
  };
}

async function summarizeStartResponse(response, attempt) {
  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    return {
      debug: [
        `continuation attempt ${attempt}: start response HTTP ${response.status()}`,
        `start response JSON parse failed: ${error.message}`
      ].join("\n"),
      payload: undefined
    };
  }

  const summary = summarizeStartPayload(payload);

  return {
    debug: redactSensitive(
      [
        `continuation attempt ${attempt}: start response HTTP ${response.status()}`,
        JSON.stringify(summary, null, 2)
      ].join("\n")
    ),
    payload: summary
  };
}

function shouldExpectContinuationRecovery(finalState, summary) {
  if (!summary || typeof summary !== "object") {
    return false;
  }

  if (finalState === "failed" && summary.error?.code === "run_stage_failed") {
    return true;
  }

  return (
    finalState === "paused" &&
    summary.stopped === true &&
    (summary.stopReason === "failed" || summary.stopReason === "timed_out")
  );
}

async function assertContinuationRecoveryActions(page, label) {
  const recoveryRegion = page.getByRole("region", { name: "Discussion recovery options" });

  await recoveryRegion.waitFor();
  await recoveryRegion.getByText("Check AI setup", { exact: true }).waitFor();
  await recoveryRegion.getByText("Try Continue discussion again", { exact: true }).waitFor();
  await recoveryRegion
    .getByText("Start a new discussion with AI", { exact: true })
    .waitFor();

  await assertLinkHref(page, "Check AI setup", "/setup/models", label);
  await assertLinkHrefIncludes(
    page,
    "Start a new discussion with AI",
    "participants=model-backed",
    label
  );
}

async function assertProviderVerificationRecoveryActions(page, label) {
  const recoveryRegion = page.getByRole("region", {
    name: "Provider verification recovery options"
  });

  await recoveryRegion.waitFor();
  await recoveryRegion.getByText("Review setup fields", { exact: true }).waitFor();
  await recoveryRegion
    .getByText(
      "If the base URL points to a local or private provider, make sure that provider is running before you retry.",
      { exact: true }
    )
    .waitFor();
  await recoveryRegion.getByText("Try Test connection again", { exact: true }).waitFor();
  await recoveryRegion.getByText("Start demo discussion", { exact: true }).waitFor();

  await assertLinkHref(page, "Review setup fields", "#setup-provider-form", label);
  await assertLinkHrefIncludes(page, "Start demo discussion", "participants=demo", label);
}

async function assertLinkHref(page, text, expectedHref, label) {
  const href = await page.locator("a", { hasText: text }).first().getAttribute("href");

  if (href !== expectedHref) {
    throw new Error(`${label} expected ${text} link href ${expectedHref}, got ${href ?? "none"}.`);
  }
}

async function assertLinkHrefIncludes(page, text, expectedSnippet, label) {
  const href = await page.locator("a", { hasText: text }).first().getAttribute("href");

  if (!href?.includes(expectedSnippet)) {
    throw new Error(
      `${label} expected ${text} link href to include ${expectedSnippet}, got ${href ?? "none"}.`
    );
  }
}

function summarizeStartPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      payload: "non_object"
    };
  }

  const stages = Array.isArray(payload.stages) ? payload.stages : [];

  return {
    code: readRecordValue(payload, "code"),
    message: readRecordValue(payload, "message"),
    error: summarizeErrorPayload(readRecordValue(payload, "error")),
    stopped: payload.stopped,
    stopReason: payload.stopReason,
    stages: stages.map((stage) => ({
      stage: readRecordValue(stage, "stage"),
      executionStatus: readRecordValue(stage, "executionStatus"),
      status: readRecordValue(stage, "status"),
      result: summarizeStageResult(readRecordValue(stage, "result"))
    }))
  };
}

function summarizeErrorPayload(error) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  return {
    code: readRecordValue(error, "code"),
    message: readRecordValue(error, "message")
  };
}

function summarizeStageResult(result) {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  return {
    participantResults: summarizeRoundResults(readRecordValue(result, "participantResults")),
    proposalResults: summarizeRoundResults(readRecordValue(result, "proposalResults")),
    reviewResults: summarizeRoundResults(readRecordValue(result, "reviewResults")),
    finalCandidateResult: summarizeSingleRoundResult(
      readRecordValue(result, "finalCandidateResult")
    ),
    auditResults: summarizeRoundResults(readRecordValue(result, "auditResults"))
  };
}

function summarizeRoundResults(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map(summarizeSingleRoundResult);
}

function summarizeSingleRoundResult(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return {
    participantId: readRecordValue(value, "participantId"),
    generatorId: readRecordValue(value, "generatorId"),
    reviewerId: readRecordValue(value, "reviewerId"),
    auditorId: readRecordValue(value, "auditorId"),
    adapterId: readRecordValue(value, "adapterId"),
    status: readRecordValue(value, "status"),
    errorCategory: readRecordValue(value, "errorCategory")
  };
}

function readRecordValue(value, key) {
  return value && typeof value === "object" ? value[key] : undefined;
}

async function waitForFirstVisible(page, entries, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const entry of entries) {
      const visible = await entry.locator
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);

      if (visible) {
        return entry.label;
      }
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for one of: ${entries.map((entry) => entry.label).join(", ")}.`);
}

async function assertDefaultViewSafety(
  page,
  label,
  { allowModelGeneratedLowLevelLanguage = false } = {}
) {
  const bodyText = await page.locator("body").innerText();
  const forbiddenValues = [
    {
      label: "provider API key",
      value: releaseConfig.apiKey
    },
    {
      label: "provider base URL",
      value: releaseConfig.providerBaseUrl
    },
    {
      label: "provider input URL",
      value: releaseConfig.providerInputUrl
    },
    {
      label: "provider model",
      value: releaseConfig.model
    },
    {
      label: "OpenAI API env var",
      value: "DELIBERUM_OPENAI_API_KEY"
    },
    {
      label: "provider config id",
      value: "openai-main"
    }
  ];

  for (const item of forbiddenValues) {
    if (item.value && bodyText.includes(item.value)) {
      throw new Error(`${label} exposed forbidden default-view value: ${item.label}.`);
    }
  }

  if (!allowModelGeneratedLowLevelLanguage) {
    if (
      /\b(run|session|ledger|runtime|proposal|event|projection)\s*(id|ids)\b/i.test(bodyText) ||
      /raw json|resource posture/i.test(bodyText)
    ) {
      throw new Error(`${label} exposed low-level default-view language.`);
    }
  }
}

async function formatPageDebug(page) {
  if (!page) {
    return "page output: none.";
  }

  try {
    const text = await page.locator("body").innerText({ timeout: 1000 });
    return [
      `page url: ${page.url()}`,
      `page text:\n${redactSensitive(text).slice(0, 4000)}`
    ].join("\n");
  } catch (error) {
    return `page output unavailable: ${error.message}`;
  }
}

async function formatRunDebug(page) {
  const runId = extractRunIdFromPage(page);
  if (!runId) {
    return "run debug: unavailable.";
  }

  try {
    const response = await fetch(`http://127.0.0.1:${daemonPort}/runs/${encodeURIComponent(runId)}`);
    const payload = await response.json();

    return redactSensitive(
      [
        `run debug HTTP ${response.status}:`,
        JSON.stringify(summarizeRunDebugPayload(payload), null, 2)
      ].join("\n")
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `run debug unavailable: ${message}`;
  }
}

function extractRunIdFromPage(page) {
  if (!page) {
    return undefined;
  }

  try {
    const pathname = new URL(page.url()).pathname;
    const match = /^\/runs\/([^/?#]+)/.exec(pathname);
    const value = match?.[1];

    if (!value || value === "new") {
      return undefined;
    }

    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function summarizeRunDebugPayload(payload) {
  const run = readRecordValue(payload, "run");
  if (!run || typeof run !== "object") {
    return {
      run: "unavailable"
    };
  }

  return {
    status: readRecordValue(run, "status"),
    sealedDivergenceStatus: readRecordValue(run, "sealedDivergenceStatus"),
    latestExtractionStatus: readRecordValue(run, "latestExtractionStatus"),
    latestProposalReviewStatus: readRecordValue(run, "latestProposalReviewStatus"),
    latestFinalizationStatus: readRecordValue(run, "latestFinalizationStatus"),
    rounds: summarizeRunRounds(readRecordValue(run, "rounds"))
  };
}

function summarizeRunRounds(rounds) {
  if (!rounds || typeof rounds !== "object") {
    return undefined;
  }

  return {
    sealedDivergence: summarizeSealedDivergenceRound(
      readRecordValue(rounds, "sealedDivergence")
    ),
    extraction: summarizeRoundArray(readRecordValue(rounds, "extraction")),
    proposalReview: summarizeRoundArray(readRecordValue(rounds, "proposalReview")),
    finalization: summarizeRoundArray(readRecordValue(rounds, "finalization"))
  };
}

function summarizeSealedDivergenceRound(round) {
  if (!round || typeof round !== "object") {
    return undefined;
  }

  return {
    roundId: readRecordValue(round, "roundId"),
    status: readRecordValue(round, "status"),
    lastErrorCategory: readRecordValue(round, "lastErrorCategory"),
    providerCallCount: readRecordValue(round, "providerCallCount"),
    participantDispatches: summarizeDispatches(readRecordValue(round, "participantDispatches"))
  };
}

function summarizeDispatches(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((dispatch) => ({
    participantId: readRecordValue(dispatch, "participantId"),
    status: readRecordValue(dispatch, "status"),
    attempts: readRecordValue(dispatch, "attempts"),
    errorCategory: readRecordValue(dispatch, "errorCategory"),
    previousErrorCategories: readRecordValue(dispatch, "previousErrorCategories"),
    safeDiagnostics: readRecordValue(dispatch, "safeDiagnostics")
  }));
}

function summarizeRoundArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map(summarizeStageRound);
}

function summarizeStageRound(round) {
  if (!round || typeof round !== "object") {
    return undefined;
  }

  return {
    roundId: readRecordValue(round, "roundId"),
    status: readRecordValue(round, "status"),
    lastErrorCategory: readRecordValue(round, "lastErrorCategory"),
    sourceSealedDivergenceRoundId: readRecordValue(round, "sourceSealedDivergenceRoundId"),
    sourceExtractionRoundId: readRecordValue(round, "sourceExtractionRoundId"),
    sourceProposalReviewRoundId: readRecordValue(round, "sourceProposalReviewRoundId"),
    generatorStates: summarizeExecutionStates(readRecordValue(round, "generatorStates")),
    reviewerStates: summarizeExecutionStates(readRecordValue(round, "reviewerStates")),
    finalCandidate: summarizeExecutionState(readRecordValue(round, "finalCandidate")),
    auditorStates: summarizeExecutionStates(readRecordValue(round, "auditorStates")),
    outcomeCompilation: summarizeOutcomeCompilation(
      readRecordValue(round, "outcomeCompilation")
    )
  };
}

function summarizeExecutionStates(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map(summarizeExecutionState);
}

function summarizeExecutionState(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return {
    participantId: readRecordValue(value, "participantId"),
    generatorId: readRecordValue(value, "generatorId"),
    reviewerId: readRecordValue(value, "reviewerId"),
    auditorId: readRecordValue(value, "auditorId"),
    sourceId: readRecordValue(value, "sourceId"),
    sourceType: readRecordValue(value, "sourceType"),
    status: readRecordValue(value, "status"),
    attempts: readRecordValue(value, "attempts"),
    errorCategory: readRecordValue(value, "errorCategory"),
    previousErrorCategories: readRecordValue(value, "previousErrorCategories"),
    safeDiagnostics: readRecordValue(value, "safeDiagnostics")
  };
}

function summarizeOutcomeCompilation(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return {
    status: readRecordValue(value, "status"),
    errorCategory: readRecordValue(value, "errorCategory")
  };
}

function readReleaseSmokeConfig(env) {
  const apiKey = readRequiredEnv(env, {
    name: "DELIBERUM_RELEASE_SMOKE_API_KEY",
    fallbackName: "DELIBERUM_OPENAI_API_KEY"
  });
  const providerInputUrl = readRequiredEnv(env, {
    name: "DELIBERUM_RELEASE_SMOKE_BASE_URL",
    fallbackName: "DELIBERUM_OPENAI_BASE_URL"
  });
  const providerBaseUrl = normalizeProviderBaseUrl(providerInputUrl);
  const model = readRequiredEnv(env, {
    name: "DELIBERUM_RELEASE_SMOKE_MODEL",
    fallbackName: "DELIBERUM_OPENAI_MODEL"
  });

  return {
    apiKey,
    providerInputUrl,
    providerBaseUrl,
    model,
    browserTimeoutMs: readOptionalPositiveIntegerEnv(
      env,
      "DELIBERUM_RELEASE_SMOKE_BROWSER_TIMEOUT_MS",
      180_000
    ),
    providerTimeoutMs: readOptionalPositiveIntegerEnv(
      env,
      "DELIBERUM_RELEASE_SMOKE_PROVIDER_TIMEOUT_MS",
      180_000
    ),
    productLoopTimeoutMs: readOptionalPositiveIntegerEnv(
      env,
      "DELIBERUM_RELEASE_SMOKE_PRODUCT_LOOP_TIMEOUT_MS",
      360_000
    ),
    continueAttempts: readOptionalPositiveIntegerEnv(
      env,
      "DELIBERUM_RELEASE_SMOKE_CONTINUE_ATTEMPTS",
      3
    ),
    perspectiveCount: readOptionalPerspectiveCountEnv(env)
  };
}

function normalizeProviderBaseUrl(value) {
  const parsed = new URL(value);
  const normalizedPath = parsed.pathname.replace(/\/+$/, "");

  if (normalizedPath === "/v1/chat/completions") {
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return stripTrailingSlash(parsed.toString());
  }

  if (normalizedPath === "/v1") {
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return stripTrailingSlash(parsed.toString());
  }

  return stripTrailingSlash(value);
}

function readReleaseSmokeEnv() {
  return {
    ...readLocalEnvFile(
      process.env.DELIBERUM_RELEASE_SMOKE_ENV_FILE?.trim() ||
        join(repoRoot, ".env")
    ),
    ...process.env
  };
}

function readRequiredEnv(env, { name, fallbackName }) {
  const value = readOptionalEnv(env, name) ?? readOptionalEnv(env, fallbackName);

  if (!value) {
    throw new Error(
      `${name} or ${fallbackName} is required for release readiness smoke.`
    );
  }

  return value;
}

function readOptionalPositiveIntegerEnv(env, name, fallback) {
  const value = readOptionalEnv(env, name);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readOptionalPerspectiveCountEnv(env) {
  const value = readOptionalEnv(env, "DELIBERUM_RELEASE_SMOKE_PERSPECTIVES");

  if (!value) {
    return 2;
  }

  if (value === "2" || value === "3") {
    return Number(value);
  }

  throw new Error("DELIBERUM_RELEASE_SMOKE_PERSPECTIVES must be 2 or 3.");
}

function readOptionalEnv(env, name) {
  const value = env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readLocalEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return {};
  }

  return parseEnvAssignments(readFileSync(filePath, "utf8"));
}

function parseEnvAssignments(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseEnvAssignment(rawLine);

    if (parsed) {
      env[parsed.name] = parsed.value;
    }
  }

  return env;
}

function parseEnvAssignment(rawLine) {
  const line = rawLine.trim();

  if (!line || line.startsWith("#")) {
    return undefined;
  }

  const separatorIndex = line.indexOf("=");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const name = line.slice(0, separatorIndex).trim();
  const rawValue = line.slice(separatorIndex + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return undefined;
  }

  return {
    name,
    value: unquoteEnvValue(rawValue)
  };
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function stripTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function startDaemonProcess({ port, cwd, webOrigin }) {
  return startChildProcess(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port),
      DELIBERUM_DAEMON_CORS_ORIGINS: webOrigin,
      ...buildOptionalProviderCompatibilityEnv()
    }
  });
}

function buildOptionalProviderCompatibilityEnv() {
  const mappings = [
    [
      "DELIBERUM_RELEASE_SMOKE_ENDPOINT_PATH",
      "DELIBERUM_OPENAI_ENDPOINT_PATH",
      "DELIBERUM_OPENAI_ENDPOINT_PATH"
    ],
    [
      "DELIBERUM_RELEASE_SMOKE_TIMEOUT_MS",
      "DELIBERUM_OPENAI_TIMEOUT_MS",
      "DELIBERUM_OPENAI_TIMEOUT_MS"
    ],
    [
      "DELIBERUM_RELEASE_SMOKE_TOP_P",
      "DELIBERUM_OPENAI_TOP_P",
      "DELIBERUM_OPENAI_TOP_P"
    ],
    [
      "DELIBERUM_RELEASE_SMOKE_STREAM",
      "DELIBERUM_OPENAI_STREAM",
      "DELIBERUM_OPENAI_STREAM"
    ],
    [
      "DELIBERUM_RELEASE_SMOKE_THINKING",
      "DELIBERUM_OPENAI_THINKING",
      "DELIBERUM_OPENAI_THINKING"
    ],
    [
      "DELIBERUM_RELEASE_SMOKE_FREQUENCY_PENALTY",
      "DELIBERUM_OPENAI_FREQUENCY_PENALTY",
      "DELIBERUM_OPENAI_FREQUENCY_PENALTY"
    ],
    [
      "DELIBERUM_RELEASE_SMOKE_PRESENCE_PENALTY",
      "DELIBERUM_OPENAI_PRESENCE_PENALTY",
      "DELIBERUM_OPENAI_PRESENCE_PENALTY"
    ]
  ];
  const env = {};

  for (const [sourceName, fallbackName, targetName] of mappings) {
    const value =
      readOptionalEnv(releaseSmokeEnv, sourceName) ??
      readOptionalEnv(releaseSmokeEnv, fallbackName);

    if (value) {
      env[targetName] = value;
    }
  }

  return env;
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
    throw new Error("Could not reserve a local port for release readiness smoke.");
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
    throw new Error(`Release readiness smoke requires built daemon entrypoint: ${filePath}`);
  }
}

function formatProcessOutput(stdout, stderr, label = "process") {
  const lines = [`${label} output:`];

  if (stdout.trim().length > 0) {
    lines.push(`stdout:\n${redactSensitive(stdout.trim())}`);
  }

  if (stderr.trim().length > 0) {
    lines.push(`stderr:\n${redactSensitive(stderr.trim())}`);
  }

  return lines.length > 1 ? lines.join("\n") : `${label} output: none.`;
}

function redactSensitive(value) {
  let redacted = value;

  for (const sensitiveValue of [
    releaseConfig.apiKey,
    releaseConfig.providerInputUrl,
    releaseConfig.providerBaseUrl,
    releaseConfig.model
  ]) {
    if (sensitiveValue) {
      redacted = redacted.split(sensitiveValue).join("[redacted]");
    }
  }

  return redacted;
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
