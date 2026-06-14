import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientEntry = join(repoRoot, "packages", "client", "dist", "index.js");
const daemonEntry = join(repoRoot, "apps", "daemon", "dist", "index.js");
const dummyApiKey = "smoke-product-loop-token";
const modelName = "smoke-product-loop-model";

assertFile(clientEntry);
assertFile(daemonEntry);

const { DeliberumDaemonClient } = await import(pathToFileURL(clientEntry).href);

const daemonPort = await reserveLocalPort();
const providerPort = await reserveLocalPort();
const tempDir = mkdtempSync(join(tmpdir(), "deliberum-product-loop-"));
const provider = await startOpenAICompatibleMockProvider(providerPort);
const daemon = startDaemonProcess({
  port: daemonPort,
  cwd: tempDir
});

try {
  const client = new DeliberumDaemonClient({
    baseUrl: `http://127.0.0.1:${daemonPort}`
  });

  await waitForDaemonHealth(client, () => daemon.exited);
  await runProductLoopSmoke({
    client,
    providerBaseUrl: `http://127.0.0.1:${providerPort}`,
    provider
  });
} catch (error) {
  if (daemon.exited) {
    throw new Error(
      `Product loop daemon exited early: code=${daemon.exitCode} signal=${daemon.exitSignal}\n${formatProcessOutput(daemon.stdout, daemon.stderr)}`,
      { cause: error }
    );
  }

  throw new Error(`Product loop smoke failed.\n${formatProcessOutput(daemon.stdout, daemon.stderr)}`, {
    cause: error
  });
} finally {
  await terminateChild(daemon.child, daemon.exitPromise);
  await provider.close();
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Product loop smoke checks passed.");

async function runProductLoopSmoke({ client, providerBaseUrl, provider }) {
  const health = await client.health();
  assertEqual(health.status, "ok", "daemon health status");

  const initialProfiles = await client.getRuntimeProfiles();
  const initialOpenAI = getOpenAICompatibleProfile(initialProfiles);
  assertEqual(
    initialOpenAI.status,
    "disabled",
    "OpenAI-compatible profile should start disabled in the smoke environment"
  );

  const setup = await client.saveOpenAICompatibleSetup({
    apiKey: dummyApiKey,
    baseUrl: `${providerBaseUrl}/v1`,
    model: modelName
  });
  assertEqual(setup.profileId, "openai-compatible", "saved setup profile id");
  assertEqual(setup.status, "saved", "saved setup status");
  assertResponseDoesNotExposeSecret(setup, "setup response");

  const verified = await client.verifyOpenAICompatibleSetup();
  assertEqual(verified.status, "connected", "provider verification status");
  assertResponseDoesNotExposeSecret(verified, "verification response");

  const readyProfiles = await client.getRuntimeProfiles();
  const readyOpenAI = getOpenAICompatibleProfile(readyProfiles);
  assertEqual(readyOpenAI.status, "ready", "OpenAI-compatible profile status after Web setup");
  assertComponentEnabled(readyOpenAI, "participant_adapter");
  assertComponentEnabled(readyOpenAI, "extraction_generator");
  assertComponentEnabled(readyOpenAI, "proposal_reviewer");
  assertComponentEnabled(readyOpenAI, "final_candidate_generator");
  assertComponentEnabled(readyOpenAI, "final_auditor");
  assertResponseDoesNotExposeSecret(readyProfiles, "runtime profiles response");

  const createRunResult = await client.createRun({
    runPlan: buildModelBackedProductLoopRunPlan()
  });
  const runId = readString(createRunResult.run, "runId", "created run id");
  const sessionId = createRunResult.session?.sessionId;

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new Error("Product loop run creation did not return a session id.");
  }

  assertResponseDoesNotExposeSecret(createRunResult, "create run response");

  const startResult = await client.startRun(runId, buildFullModelBackedStartRequest());
  assertEqual(startResult.stopped, false, "model-backed run stopped flag");
  assertStageExecuted(startResult.stages, "sealed_divergence");
  assertStageExecuted(startResult.stages, "extraction");
  assertStageExecuted(startResult.stages, "proposal_review");
  assertStageExecuted(startResult.stages, "finalization");
  assertResponseDoesNotExposeSecret(startResult, "start run response");

  const events = await client.getRunEvents(runId);
  assertAtLeast(events.events, 5, "run event count after continuation");
  assertHasEventType(events.events, "topic_contract_published");
  assertHasEventType(events.events, "sealed_contribution_submitted");
  assertHasEventType(events.events, "final_audit_recorded");
  assertResponseDoesNotExposeSecret(events, "run events response");

  const frontier = await client.getFrontier(sessionId);
  assertAtLeast(frontier.candidates, 1, "strongest current option count");
  assertTextIncludes(
    JSON.stringify(frontier.candidates),
    "verified provider",
    "strongest current option text"
  );
  assertResponseDoesNotExposeSecret(frontier, "candidate frontier response");

  const objections = await client.getObjections(sessionId);
  assertAtLeast(objections.objections, 1, "open disagreement count");
  assertTextIncludes(
    JSON.stringify(objections.objections),
    "browser walkthrough evidence",
    "open disagreement text"
  );

  const obligations = await client.getObligations(sessionId);
  assertAtLeast(obligations.qualityObligations, 1, "answer requirement count");
  assertTextIncludes(
    JSON.stringify(obligations.qualityObligations),
    "next recommended actions",
    "answer requirement text"
  );

  const resources = await client.getSessionResources(sessionId);
  assertAtLeast(resources.evidenceNeeds, 1, "evidence gap count");
  assertTextIncludes(
    JSON.stringify(resources.evidenceNeeds),
    "browser walkthrough evidence",
    "evidence gap text"
  );

  const outcome = await client.getRunOutcome(runId);
  assertEqual(outcome.status, "compiled", "run outcome status");
  assertTextIncludes(JSON.stringify(outcome.outcome), "reviewable conclusion", "outcome text");
  assertTextIncludes(JSON.stringify(outcome.outcome), "risks", "outcome risk text");
  assertTextIncludes(
    JSON.stringify(outcome.outcome),
    "next recommended action",
    "outcome next action text"
  );
  assertResponseDoesNotExposeSecret(outcome, "run outcome response");

  if (provider.requestCount < 5) {
    throw new Error(
      `Product loop mock provider saw ${provider.requestCount} request(s); expected setup verification plus model-backed run requests.`
    );
  }
}

function buildModelBackedProductLoopRunPlan() {
  return {
    title: "Discussion: Should we rely on the verified provider path?",
    topic: "Should Deliberum rely on the verified provider path for a real discussion?",
    goals: [
      "Compare the strongest current options.",
      "Keep open disagreements, missing evidence, risks, current conclusion, and next actions visible."
    ],
    constraints: [
      "Use configured model-backed participants from the local service.",
      "Use two independent model-backed perspectives from the local service.",
      "Keep provider credentials saved locally and out of the discussion.",
      "Keep the conclusion provisional until reviewed."
    ],
    participants: [
      {
        id: "provider-perspective-a",
        kind: "model",
        displayName: "Perspective A",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      },
      {
        id: "provider-perspective-b",
        kind: "model",
        displayName: "Perspective B",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      }
    ],
    providerConfigs: [
      {
        id: "openai-main",
        adapterId: "openai-compatible",
        providerConfigId: "openai-main"
      }
    ],
    budget: {
      maxEvents: 80,
      maxProviderCalls: 20
    },
    timeouts: {
      participantMs: 90000,
      overallMs: 240000
    },
    output: {
      language: "en",
      style: "clear",
      expectations: [
        "Show the current conclusion.",
        "List main perspectives, unresolved disagreements, risks, missing evidence, and next recommended actions."
      ]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: "all_completed",
      participantIds: ["provider-perspective-a", "provider-perspective-b"]
    }
  };
}

function buildFullModelBackedStartRequest() {
  return {
    sealedDivergence: {
      autoCloseManual: true
    },
    extraction: {
      generatorIds: ["openai-compatible-extractor"]
    },
    review: {
      reviewerIds: ["openai-compatible-reviewer"],
      acceptancePolicy: {
        mode: "all_generated_unchallenged",
        authorId: "provider-review-coordinator",
        rationale:
          "Accept unchallenged provider-organized proposals so the room can compile a provisional current conclusion."
      }
    },
    finalization: {
      finalCandidateGeneratorId: "openai-compatible-final-candidate",
      auditGeneratorIds: ["openai-compatible-final-auditor"],
      compileOutcome: true
    }
  };
}

async function startOpenAICompatibleMockProvider(port) {
  const state = {
    requestCount: 0
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
      const content = createMockProviderContent(body);

      response.writeHead(200, {
        "content-type": "application/json"
      });
      response.end(
        JSON.stringify({
          id: `chatcmpl-smoke-${state.requestCount}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: modelName,
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

function createMockProviderContent(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages
    .filter((message) => message?.role === "system")
    .map((message) => String(message.content ?? ""))
    .join("\n");
  const userPayload = parseLastUserJson(messages);

  if (system.includes("verifying Deliberum's local model provider setup")) {
    return "ready";
  }

  if (system.includes("Prepare Deliberum extraction proposal material only.")) {
    const allowedSourceEventIds = readStringArray(userPayload?.allowedSourceEventIds);
    const sourceEventIds = allowedSourceEventIds.length > 0
      ? [allowedSourceEventIds[0]]
      : [];

    return JSON.stringify({
      candidates: [
        {
          id: "smoke-candidate",
          title: "Use the verified provider path for reviewable discussions",
          description:
            "The verified provider path can produce a reviewable conclusion when disagreements, evidence, risks, and next actions stay visible.",
          sourceEventIds,
          status: "active",
          supportedBy: ["smoke-claim"],
          attackedBy: ["smoke-objection"],
          qualityObligationIds: ["smoke-quality"],
          assumptions: ["The provider verification request succeeded."],
          tradeoffs: ["The path still needs browser walkthrough evidence."],
          applicableWhen: ["The local service and provider setup are both ready."]
        }
      ],
      claims: [
        {
          id: "smoke-claim",
          content:
            "The product loop can move from provider setup to a reviewable conclusion.",
          scope: "process",
          sourceEventIds,
          supports: ["smoke-candidate"],
          dependsOn: [],
          challengedBy: ["smoke-objection"]
        }
      ],
      objections: [
        {
          id: "smoke-objection",
          targetId: "smoke-candidate",
          failureMode:
            "Provider-backed results still need visible browser walkthrough evidence before users rely on them.",
          consequence:
            "A local API-only pass could hide usability gaps in the default Web path.",
          severityClaim: "major",
          status: "open",
          sourceEventIds,
          responses: []
        }
      ],
      evidenceNeeds: [
        {
          id: "smoke-evidence",
          targetClaimId: "smoke-claim",
          requiredKind: "tool",
          reason:
            "The product loop needs browser walkthrough evidence before the conclusion is treated as reliable.",
          priority: "high",
          status: "open",
          sourceEventIds
        }
      ],
      qualityObligations: [
        {
          id: "smoke-quality",
          scope: "final_output",
          targetCandidateId: "smoke-candidate",
          requirement:
            "The conclusion must keep options, disagreements, evidence gaps, risks, and next recommended actions visible.",
          status: "unanswered",
          sourceEventIds,
          supportingRefIds: ["smoke-claim"],
          unresolvedObjectionIds: ["smoke-objection"]
        }
      ],
      rationale:
        "The smoke provider returns deterministic review material so the product loop can be verified repeatably."
    });
  }

  if (system.includes("Prepare Deliberum final candidate proposal material only.")) {
    const allowedCandidateIds = readStringArray(userPayload?.allowedCandidateIds);
    return JSON.stringify({
      candidateIds: allowedCandidateIds.slice(0, 1),
      recommendation:
        "Use the verified provider path as a reviewable conclusion only after checking disagreements, browser walkthrough evidence, risks, and next recommended actions.",
      applicabilityConditions: [
        "The local service is connected.",
        "The OpenAI-compatible provider has been saved and verified."
      ],
      rationale:
        "The strongest current option supports the basic product loop while preserving review boundaries.",
      limitations: [
        "This smoke confirms the service path, but browser usability still needs direct walkthrough evidence."
      ]
    });
  }

  if (system.includes("Prepare Deliberum final audit material only.")) {
    return JSON.stringify({
      findings: [
        "The provider-backed product loop produced a reviewable conclusion."
      ],
      risks: [
        "Users could still miss usability issues without a real browser walkthrough."
      ],
      unresolvedObjectionIds: readStringArray(userPayload?.allowedUnresolvedObjectionIds),
      qualityObligationIds: readStringArray(userPayload?.allowedQualityObligationIds),
      evidenceNeedIds: readStringArray(userPayload?.allowedEvidenceNeedIds),
      omissions: [
        "This smoke does not replace visual browser verification."
      ],
      compressionProblems: [],
      limitations: [
        "The provider is deterministic and local."
      ],
      continuationSuggestions: [
        "Run the browser walkthrough and record next recommended action evidence."
      ]
    });
  }

  if (system.includes("Prepare Deliberum proposal review material only.")) {
    return JSON.stringify({
      challenges: [],
      notes: [
        "No challenge is proposed because the smoke extraction keeps review obligations visible."
      ]
    });
  }

  return [
    "This model perspective supports the verified provider product loop.",
    "Keep disagreements, missing evidence, risk review, current conclusion, and next recommended actions visible."
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

function startDaemonProcess({ port, cwd }) {
  const child = spawn(process.execPath, [daemonEntry], {
    cwd,
    env: {
      ...buildMinimalEnv(),
      DELIBERUM_HOST: "127.0.0.1",
      DELIBERUM_PORT: String(port)
    },
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

async function waitForDaemonHealth(client, hasExited) {
  let lastError;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (hasExited()) {
      throw new Error("Product loop daemon exited before health was available.");
    }

    try {
      const health = await client.health();
      if (health.status === "ok") {
        return health;
      }
      lastError = new Error(`Health returned status ${String(health.status)}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error("Timed out waiting for product loop daemon health.", {
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
    throw new Error("Could not reserve a local port for product loop smoke.");
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

function getOpenAICompatibleProfile(response) {
  const profiles = Array.isArray(response?.profiles) ? response.profiles : [];
  const profile = profiles.find((candidate) => candidate?.id === "openai-compatible");

  if (!profile) {
    throw new Error("Runtime profiles response did not include OpenAI-compatible profile.");
  }

  return profile;
}

function assertComponentEnabled(profile, kind) {
  const components = Array.isArray(profile.components) ? profile.components : [];
  const component = components.find((candidate) => candidate?.kind === kind);

  if (!component) {
    throw new Error(`OpenAI-compatible profile did not include component kind ${kind}.`);
  }

  assertEqual(component.enabled, true, `OpenAI-compatible component ${kind}`);
}

function assertStageExecuted(stages, stageName) {
  const stage = Array.isArray(stages)
    ? stages.find((candidate) => candidate?.stage === stageName)
    : undefined;

  if (!stage) {
    throw new Error(`Model-backed run did not report stage ${stageName}.`);
  }

  assertEqual(stage.executionStatus, "executed", `${stageName} execution status`);
}

function assertHasEventType(events, eventType) {
  const found = Array.isArray(events)
    ? events.some((event) => event?.type === eventType)
    : false;

  if (!found) {
    throw new Error(`Run events did not include ${eventType}.`);
  }
}

function readString(value, key, label) {
  const result = value?.[key];

  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`Missing ${label}.`);
  }

  return result;
}

function assertAtLeast(value, count, label) {
  if (!Array.isArray(value) || value.length < count) {
    throw new Error(`${label} expected at least ${count}, got ${Array.isArray(value) ? value.length : "non-array"}.`);
  }
}

function assertTextIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} did not include expected text: ${expected}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertResponseDoesNotExposeSecret(value, label) {
  const serialized = JSON.stringify(value);

  if (serialized.includes(dummyApiKey)) {
    throw new Error(`${label} exposed the dummy provider API key.`);
  }
}

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Product loop smoke requires built daemon entrypoint: ${filePath}`);
  }
}

function formatProcessOutput(stdout, stderr) {
  const lines = [];

  if (stdout.trim().length > 0) {
    lines.push(`stdout:\n${stdout.trim()}`);
  }

  if (stderr.trim().length > 0) {
    lines.push(`stderr:\n${stderr.trim()}`);
  }

  return lines.join("\n") || "No process output.";
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
