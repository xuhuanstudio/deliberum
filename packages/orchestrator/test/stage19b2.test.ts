import { describe, expect, it } from "vitest";
import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  FINAL_AUDIT_RECORDED_EVENT_TYPE,
  FINAL_CANDIDATE_PROPOSED_EVENT_TYPE,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  projectCandidateFrontier
} from "@deliberum/core";
import { InMemoryEventStore } from "@deliberum/storage";
import type {
  EventEnvelope,
  FinalAudit,
  FinalCandidateProposal,
  JsonValue,
  SealedBatchRevealPolicy
} from "@deliberum/protocol";
import type {
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterInput,
  ParticipantAdapterResult
} from "@deliberum/adapters";
import {
  AdapterRegistry,
  ExtractionGeneratorRegistry,
  FinalAuditGeneratorRegistry,
  FinalCandidateGeneratorRegistry,
  InMemoryRunStore,
  ProposalReviewGeneratorRegistry,
  buildFinalizationContext,
  createDeliberationRun,
  runExtractionProposalRound,
  runFinalizationRound,
  runProposalReviewRound,
  runSealedDivergenceRound
} from "../src";
import type {
  DeliberationRunRecord,
  ExtractionContext,
  ExtractionGenerator,
  ExtractionGeneratorResult,
  FinalAuditGenerator,
  FinalAuditGeneratorResult,
  FinalCandidateGenerator,
  FinalCandidateGeneratorResult,
  FinalizationContext
} from "../src";

function createRunPlan(
  options: {
    revealPolicy?: SealedBatchRevealPolicy;
  } = {}
) {
  return {
    title: "Execution priority",
    topic: "Should Deliberum prioritize CLI-first validation or Web UI polish first?",
    goals: ["Produce independent inputs"],
    constraints: ["Preserve disagreement"],
    participants: [
      {
        id: "participant-cli",
        kind: "model",
        displayName: "CLI advocate",
        adapterId: "adapter-cli"
      },
      {
        id: "participant-web",
        kind: "model",
        displayName: "Web advocate",
        adapterId: "adapter-web"
      }
    ],
    providerConfigs: [
      {
        id: "provider-ref",
        adapterId: "adapter-cli",
        providerConfigId: "local-provider",
        apiKeyEnvVar: "DELIBERUM_TEST_PROVIDER_KEY"
      }
    ],
    budget: {
      maxEvents: 80,
      maxProviderCalls: 20
    },
    timeouts: {
      participantMs: 1000,
      overallMs: 30000
    },
    output: {
      language: "en",
      style: "concise",
      expectations: ["Return contribution material only"]
    },
    sealedDivergence: {
      purpose: "initial_divergence",
      revealPolicy: options.revealPolicy ?? "all_completed",
      participantIds: ["participant-cli", "participant-web"]
    }
  };
}

function createIds(ids: string[]) {
  let index = 0;

  return () => ids[index++] ?? `generated-${index}`;
}

function createAdapter(options: {
  adapterId: string;
  payload: JsonValue;
}): ParticipantAdapter {
  return {
    adapterId: options.adapterId,
    capabilities: {
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
    },
    prepareContribution(
      _input: ParticipantAdapterInput,
      context: ParticipantAdapterContext
    ): ParticipantAdapterResult {
      return {
        payload: options.payload,
        adapterId: options.adapterId,
        participantId: context.participantId,
        capabilities: this.capabilities,
        contextCompleteness: {
          status: "complete",
          notes: []
        },
        warnings: []
      };
    }
  };
}

function createAdapterRegistry() {
  return new AdapterRegistry([
    createAdapter({
      adapterId: "adapter-cli",
      payload: {
        position: "prioritize CLI-first validation",
        reason: "It validates the ledger and lifecycle before UI polish."
      }
    }),
    createAdapter({
      adapterId: "adapter-web",
      payload: {
        position: "prioritize Web UI polish",
        reason: "It makes projection inspection easier for users."
      }
    })
  ]);
}

function createFixture() {
  const eventStore = new InMemoryEventStore({
    clock: () => "2026-06-10T00:00:01.000Z"
  });
  const runStore = new InMemoryRunStore();
  const created = createDeliberationRun(
    {
      runPlan: createRunPlan()
    },
    {
      eventStore,
      runStore,
      idGenerator: createIds(["run-1", "topic-contract-1", "session-1", "event-1"]),
      clock: () => "2026-06-10T00:00:00.000Z"
    }
  );

  return {
    eventStore,
    runStore,
    run: created.run
  };
}

async function createAcceptedRun(options: {
  proposalCount?: 1 | 2;
} = {}) {
  const fixture = createFixture();
  const sealedResult = await runSealedDivergenceRound(
    {
      runId: fixture.run.id
    },
    {
      eventStore: fixture.eventStore,
      runStore: fixture.runStore,
      adapterRegistry: createAdapterRegistry(),
      idGenerator: createIds([
        "batch-1",
        "opened-event-1",
        "contribution-1",
        "contribution-2",
        "reveal-1"
      ]),
      clock: () => "2026-06-10T00:00:02.000Z"
    }
  );
  const proposalCount = options.proposalCount ?? 2;
  const generators = Array.from({ length: proposalCount }, (_, index) =>
    createExtractionGenerator({
      generatorId: `generator-${index + 1}`,
      candidateId: index === 0 ? "candidate-cli-first" : "candidate-web-polish"
    })
  );
  const extractionResult = await runExtractionProposalRound(
    {
      runId: sealedResult.run.id
    },
    {
      eventStore: fixture.eventStore,
      runStore: fixture.runStore,
      extractionGeneratorRegistry: new ExtractionGeneratorRegistry(generators),
      idGenerator: createIds([
        "proposal-1",
        "proposal-event-1",
        "proposal-2",
        "proposal-event-2"
      ]),
      clock: () => "2026-06-10T00:00:06.000Z",
      executionClaimOwnerIdGenerator: createIds(["extraction-claim-1"])
    }
  );
  const proposalEventIds = extractionResult.proposalResults
    .map((result) => result.proposalEventId)
    .filter((proposalEventId): proposalEventId is string => Boolean(proposalEventId));
  const reviewResult = await runProposalReviewRound(
    {
      runId: extractionResult.run.id,
      reviewerIds: [],
      acceptancePolicy: {
        mode: "all_generated_unchallenged",
        authorId: "review-coordinator",
        rationale: "Accept generated proposals for projection."
      }
    },
    {
      eventStore: fixture.eventStore,
      runStore: fixture.runStore,
      proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry(),
      idGenerator: createIds([
        "acceptance-1",
        "acceptance-event-1",
        "acceptance-2",
        "acceptance-event-2"
      ]),
      clock: () => "2026-06-10T00:00:07.000Z",
      executionClaimOwnerIdGenerator: createIds(["review-claim-1"])
    }
  );

  return {
    eventStore: fixture.eventStore,
    runStore: fixture.runStore,
    run: reviewResult.run,
    proposalEventIds
  };
}

function createExtractionGenerator(options: {
  generatorId: string;
  candidateId: "candidate-cli-first" | "candidate-web-polish";
}): ExtractionGenerator {
  return {
    generatorId: options.generatorId,
    generateExtractionProposal(_input, context) {
      return createExtractionResult(context, options.candidateId);
    }
  };
}

function createExtractionResult(
  context: ExtractionContext,
  candidateId: "candidate-cli-first" | "candidate-web-polish"
): ExtractionGeneratorResult {
  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];
  const cli = candidateId === "candidate-cli-first";

  return {
    candidates: [
      {
        id: candidateId,
        title: cli ? "Prioritize CLI-first validation" : "Prioritize Web UI polish",
        description: cli
          ? "Validate the ledger, lifecycle, and projections before UI polish."
          : "Improve the projection inspection surface for humans.",
        sourceEventIds,
        status: "active",
        supportedBy: [cli ? "claim-cli-validation" : "claim-web-polish"],
        attackedBy: [cli ? "objection-cli-delay" : "objection-web-delay"],
        qualityObligationIds: [cli ? "quality-cli-validation" : "quality-web-polish"],
        assumptions: ["The event ledger remains the source of truth."],
        tradeoffs: [cli ? "Web polish moves slower." : "CLI validation moves slower."]
      }
    ],
    claims: [
      {
        id: cli ? "claim-cli-validation" : "claim-web-polish",
        content: cli
          ? "CLI-first validation exercises core lifecycle behavior directly."
          : "Web polish helps humans inspect projection state.",
        scope: "process",
        sourceEventIds,
        supports: [candidateId]
      }
    ],
    objections: [
      {
        id: cli ? "objection-cli-delay" : "objection-web-delay",
        targetId: candidateId,
        failureMode: cli ? "Web usability lags." : "Core validation lags.",
        consequence: "Some user workflows remain harder to inspect.",
        severityClaim: "major",
        status: "open",
        sourceEventIds
      }
    ],
    evidenceNeeds: [
      {
        id: cli ? "evidence-cli-validation" : "evidence-web-polish",
        targetClaimId: cli ? "claim-cli-validation" : "claim-web-polish",
        requiredKind: "human_confirmation",
        reason: "Confirm the priority with maintainers.",
        priority: "medium",
        status: "open",
        sourceEventIds
      }
    ],
    qualityObligations: [
      {
        id: cli ? "quality-cli-validation" : "quality-web-polish",
        scope: "candidate",
        targetCandidateId: candidateId,
        requirement: "Preserve ledger and projection traceability.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: [],
        unresolvedObjectionIds: [cli ? "objection-cli-delay" : "objection-web-delay"]
      }
    ],
    rationale: "Extract one traceable candidate from the revealed sealed contributions."
  };
}

function createFinalCandidateGenerator(options: {
  generatorId?: string;
  result?: (context: FinalizationContext) => FinalCandidateGeneratorResult;
  fail?: boolean;
  onCall?: (context: FinalizationContext) => void;
} = {}): FinalCandidateGenerator & { readonly callCount: number } {
  let calls = 0;

  return {
    generatorId: options.generatorId ?? "final-generator",
    proposeFinalCandidate(_input, context) {
      calls += 1;
      options.onCall?.(context);

      if (options.fail) {
        throw new Error("raw final generator failure sk-live-hidden");
      }

      return options.result ? options.result(context) : createFinalCandidateDraft();
    },
    get callCount() {
      return calls;
    }
  };
}

function createFinalCandidateDraft(
  candidateIds: string[] = ["candidate-cli-first"]
): FinalCandidateGeneratorResult {
  return {
    candidateIds,
    recommendation: "Prefer CLI-first validation under the stated constraints.",
    applicabilityConditions: ["Use this only while ledger validation remains the bottleneck."],
    rationale: "The accepted candidate preserves direct validation of the event lifecycle.",
    limitations: ["Web UI polish remains an important alternative."]
  };
}

function createFinalAuditGenerator(options: {
  auditorId?: string;
  result?: (context: FinalizationContext) => FinalAuditGeneratorResult;
  fail?: boolean;
  onCall?: (context: FinalizationContext) => void;
} = {}): FinalAuditGenerator & { readonly callCount: number } {
  let calls = 0;

  return {
    auditorId: options.auditorId ?? "final-auditor",
    auditFinalCandidate(_input, context) {
      calls += 1;
      options.onCall?.(context);

      if (options.fail) {
        throw new Error("raw audit failure sk-live-hidden");
      }

      return options.result ? options.result(context) : createFinalAudit(context);
    },
    get callCount() {
      return calls;
    }
  };
}

function createFinalAudit(context: FinalizationContext): FinalAuditGeneratorResult {
  return {
    findings: ["The proposal preserves alternatives and unresolved issues."],
    risks: ["Unchecked evidence needs remain."],
    unresolvedObjectionIds: [context.unresolvedObjectionIds[0]!],
    qualityObligationIds: [context.qualityObligations.qualityObligations[0]!.object.id],
    evidenceNeedIds: [context.evidenceNeedIds[0]!],
    omissions: ["No external evidence verification is performed in this stage."],
    compressionProblems: [],
    limitations: ["This is a provisional compiled artifact."],
    continuationSuggestions: ["Resolve open evidence needs before strengthening the draft."]
  };
}

describe("Stage 19B-2 finalization orchestration", () => {
  it("builds a safe finalization context without hidden payloads, secrets, raw errors, or claim owner ids", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    eventStore.appendEvent({
      id: "private-extraction-like-event",
      sessionId: run.sessionId,
      schemaVersion: "1",
      type: EXTRACTION_PROPOSED_EVENT_TYPE,
      authorId: "private-author",
      createdAt: "2026-06-10T00:00:08.000Z",
      basedOnEventIds: [],
      visibility: "private",
      trace: {},
      payload: {
        secret: "private extraction payload sk-hidden-private"
      }
    });
    const runWithHiddenClaim: DeliberationRunRecord = {
      ...run,
      finalizationRounds: [
        {
          roundId: "hidden-round",
          status: "running",
          auditorStates: [],
          auditEventIds: [],
          executionClaim: {
            ownerId: "hidden-claim-owner",
            acquiredAt: "2026-06-10T00:00:09.000Z",
            expiresAt: "2026-06-10T00:05:09.000Z",
            status: "active"
          }
        }
      ]
    };
    const context = buildFinalizationContext({
      run: runWithHiddenClaim,
      eventStore,
      proposalReviewRoundId: run.proposalReviewRounds?.at(-1)?.roundId
    });
    const contextJson = JSON.stringify(context);

    expect(context.frontier.basis).toBe("accepted_active_candidates");
    expect(context.frontier.candidates.length).toBeGreaterThan(0);
    expect(contextJson).not.toContain("private extraction payload");
    expect(contextJson).not.toContain("sk-hidden-private");
    expect(contextJson).not.toContain("DELIBERUM_TEST_PROVIDER_KEY");
    expect(contextJson).not.toContain("hidden-claim-owner");
    expect(contextJson).not.toContain("raw final generator failure");
    expect(runStore.getRun(run.id)?.finalizationRounds).toBeUndefined();
  });

  it("proposes a final candidate through core and preserves alternatives", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const result = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: []
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry(),
        idGenerator: createIds(["final-proposal-1", "final-proposal-event-1"]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"])
      }
    );
    const event = eventStore.getEvent<FinalCandidateProposal>("final-proposal-event-1")!;

    expect(result.finalCandidateResult?.status).toBe("proposed");
    expect(event.type).toBe(FINAL_CANDIDATE_PROPOSED_EVENT_TYPE);
    expect(event.payload.candidateIds).toEqual(["candidate-cli-first"]);
    expect(event.payload.alternativeCandidateIds).toEqual(["candidate-web-polish"]);
    expect(projectCandidateFrontier({ eventStore, sessionId: run.sessionId }).candidates).toHaveLength(2);
  });

  it("rejects invalid final candidate ids before writing a final proposal event", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const result = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(["missing-candidate"]),
        auditGeneratorIds: []
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry(),
        idGenerator: createIds([]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"])
      }
    );

    expect(result.finalCandidateResult?.status).toBe("failed");
    expect(result.finalCandidateResult?.errorCategory).toBe("final_candidate_validation_failed");
    expect(eventStore.listEventsByType(run.sessionId, FINAL_CANDIDATE_PROPOSED_EVENT_TYPE)).toHaveLength(0);
  });

  it("passes provider runtime config to final candidate generators and preserves safe diagnostics", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const rawProviderFailure =
      "raw final candidate provider failure test-final-secret Authorization Bearer /Users/final.log";
    let observedApiKey: string | undefined;
    let observedProviderConfigId: string | undefined;
    const generator: FinalCandidateGenerator = {
      generatorId: "provider-final-generator",
      adapterId: "adapter-cli",
      providerConfigId: "provider-ref",
      proposeFinalCandidate(_input, _context, providerRuntimeConfig) {
        observedApiKey = providerRuntimeConfig?.apiKey;
        observedProviderConfigId = providerRuntimeConfig?.providerConfigId;

        const error = new Error(rawProviderFailure);
        Object.defineProperty(error, "safeCategory", {
          value: "provider_malformed_response"
        });
        Object.defineProperty(error, "safeDiagnostics", {
          value: {
            providerResponseShape: "prose_with_json_object"
          }
        });
        throw error;
      }
    };

    const result = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateGeneratorId: "provider-final-generator",
        auditGeneratorIds: []
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry([generator]),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry(),
        idGenerator: createIds([]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"]),
        env: {
          DELIBERUM_TEST_PROVIDER_KEY: "test-final-secret"
        }
      }
    );
    const serializedSafeState = JSON.stringify({
      result,
      storedRun: runStore.getRun(run.id),
      events: eventStore.listEvents(run.sessionId)
    });

    expect(observedApiKey).toBe("test-final-secret");
    expect(observedProviderConfigId).toBe("local-provider");
    expect(result.finalCandidateResult).toEqual(
      expect.objectContaining({
        sourceId: "provider-final-generator",
        sourceType: "generator",
        status: "failed",
        errorCategory: "provider_malformed_response",
        safeDiagnostics: {
          providerResponseShape: "prose_with_json_object"
        }
      })
    );
    expect(runStore.getRun(run.id)?.finalizationRounds?.[0]?.finalCandidate).toEqual(
      expect.objectContaining({
        sourceId: "provider-final-generator",
        errorCategory: "provider_malformed_response",
        safeDiagnostics: {
          providerResponseShape: "prose_with_json_object"
        }
      })
    );
    expect(eventStore.listEventsByType(run.sessionId, FINAL_CANDIDATE_PROPOSED_EVENT_TYPE)).toHaveLength(0);
    expect(serializedSafeState).toContain(
      "\"providerResponseShape\":\"prose_with_json_object\""
    );
    expect(serializedSafeState).not.toContain(rawProviderFailure);
    expect(serializedSafeState).not.toContain("test-final-secret");
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("/Users/");
  });

  it("records final audit events through core and rejects invalid audit references", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const invalidAuditGenerator = createFinalAuditGenerator({
      result: () => ({
        findings: ["Audit material with invalid references."],
        qualityObligationIds: ["missing-quality-obligation"]
      })
    });
    const failed = await runFinalizationRound(
      {
        runId: run.id,
        roundId: "invalid-audit-round",
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: [invalidAuditGenerator.auditorId]
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([invalidAuditGenerator]),
        idGenerator: createIds(["final-proposal-1", "final-proposal-event-1"]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"])
      }
    );

    expect(failed.auditResults[0]?.status).toBe("failed");
    expect(failed.auditResults[0]?.errorCategory).toBe("final_audit_validation_failed");
    expect(eventStore.listEventsByType(run.sessionId, FINAL_AUDIT_RECORDED_EVENT_TYPE)).toHaveLength(0);

    const validAuditGenerator = createFinalAuditGenerator();
    const recorded = await runFinalizationRound(
      {
        runId: run.id,
        roundId: "valid-audit-round",
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: [validAuditGenerator.auditorId]
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([validAuditGenerator]),
        idGenerator: createIds([
          "final-proposal-2",
          "final-proposal-event-2",
          "final-audit-1",
          "final-audit-event-1"
        ]),
        clock: () => "2026-06-10T00:00:11.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-2"])
      }
    );
    const auditEvent = eventStore.getEvent<FinalAudit>("final-audit-event-1")!;

    expect(recorded.auditResults[0]?.status).toBe("recorded");
    expect(auditEvent.type).toBe(FINAL_AUDIT_RECORDED_EVENT_TYPE);
    expect(auditEvent.payload.findings).toEqual([
      "The proposal preserves alternatives and unresolved issues."
    ]);
  });

  it("passes provider runtime config to final auditors and preserves safe diagnostics", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const rawProviderFailure =
      "raw final audit provider failure test-audit-secret Authorization Bearer /Users/audit.log";
    let observedApiKey: string | undefined;
    let observedProviderConfigId: string | undefined;
    const auditor: FinalAuditGenerator = {
      auditorId: "provider-final-auditor",
      adapterId: "adapter-cli",
      providerConfigId: "provider-ref",
      auditFinalCandidate(_input, _context, providerRuntimeConfig) {
        observedApiKey = providerRuntimeConfig?.apiKey;
        observedProviderConfigId = providerRuntimeConfig?.providerConfigId;

        const error = new Error(rawProviderFailure);
        Object.defineProperty(error, "safeCategory", {
          value: "provider_http_error"
        });
        Object.defineProperty(error, "safeDiagnostics", {
          value: {
            httpStatus: 504,
            providerResponseShape: "empty_text"
          }
        });
        throw error;
      }
    };

    const result = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: ["provider-final-auditor"]
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([auditor]),
        idGenerator: createIds(["final-proposal-1", "final-proposal-event-1"]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"]),
        env: {
          DELIBERUM_TEST_PROVIDER_KEY: "test-audit-secret"
        }
      }
    );
    const serializedSafeState = JSON.stringify({
      result,
      storedRun: runStore.getRun(run.id),
      events: eventStore.listEvents(run.sessionId)
    });

    expect(observedApiKey).toBe("test-audit-secret");
    expect(observedProviderConfigId).toBe("local-provider");
    expect(result.auditResults).toContainEqual(
      expect.objectContaining({
        auditorId: "provider-final-auditor",
        status: "failed",
        errorCategory: "provider_http_error",
        safeDiagnostics: {
          httpStatus: 504,
          providerResponseShape: "empty_text"
        }
      })
    );
    expect(runStore.getRun(run.id)?.finalizationRounds?.[0]?.auditorStates).toContainEqual(
      expect.objectContaining({
        auditorId: "provider-final-auditor",
        errorCategory: "provider_http_error",
        safeDiagnostics: {
          httpStatus: 504,
          providerResponseShape: "empty_text"
        }
      })
    );
    expect(eventStore.listEventsByType(run.sessionId, FINAL_CANDIDATE_PROPOSED_EVENT_TYPE)).toHaveLength(1);
    expect(eventStore.listEventsByType(run.sessionId, FINAL_AUDIT_RECORDED_EVENT_TYPE)).toHaveLength(0);
    expect(serializedSafeState).toContain("\"httpStatus\":504");
    expect(serializedSafeState).toContain("\"providerResponseShape\":\"empty_text\"");
    expect(serializedSafeState).not.toContain(rawProviderFailure);
    expect(serializedSafeState).not.toContain("test-audit-secret");
    expect(serializedSafeState).not.toContain("Authorization");
    expect(serializedSafeState).not.toContain("Bearer");
    expect(serializedSafeState).not.toContain("/Users/");
  });

  it("compiles a provisional outcome read-only without storing the outcome body", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const beforeEventIds = eventStore.listEvents(run.sessionId).map((event) => event.id);
    const result = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: ["final-auditor"],
        compileOutcome: true
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([
          createFinalAuditGenerator()
        ]),
        idGenerator: createIds([
          "final-proposal-1",
          "final-proposal-event-1",
          "final-audit-1",
          "final-audit-event-1"
        ]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"])
      }
    );
    const afterEvents = eventStore.listEvents(run.sessionId);
    const afterEventIds = afterEvents.map((event) => event.id);
    const storedRunJson = JSON.stringify(runStore.getRun(run.id));
    const fieldNames = collectFieldNames(result);

    expect(afterEventIds.slice(0, beforeEventIds.length)).toEqual(beforeEventIds);
    expect(afterEvents.filter((event) => event.type === FINAL_CANDIDATE_PROPOSED_EVENT_TYPE)).toHaveLength(1);
    expect(afterEvents.filter((event) => event.type === FINAL_AUDIT_RECORDED_EVENT_TYPE)).toHaveLength(1);
    expect(result.outcome?.draftStatus).toBe("provisional");
    expect(result.outcome?.unresolvedObjections.length).toBeGreaterThan(0);
    expect(result.outcome?.qualityObligations.length).toBeGreaterThan(0);
    expect(result.outcome?.evidenceStatus.evidenceNeeds.length).toBeGreaterThan(0);
    expect(result.outcome?.alternatives.map((candidate) => candidate.object.id)).toContain(
      "candidate-web-polish"
    );
    expect(result.outcomeCompilation?.status).toBe("compiled");
    expect(storedRunJson).toContain("projectionVersion");
    expect(storedRunJson).not.toContain("Prefer CLI-first validation under the stated constraints.");
    expect(storedRunJson).not.toContain("The proposal preserves alternatives and unresolved issues.");
    expect(storedRunJson).not.toContain("No external evidence verification is performed");
    expect(fieldNames).not.toContain("finalAnswer");
  });

  it("does not duplicate final proposal or audit events on retry", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const options = {
      eventStore,
      runStore,
      finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
      finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([createFinalAuditGenerator()]),
      idGenerator: createIds([
        "final-proposal-1",
        "final-proposal-event-1",
        "final-audit-1",
        "final-audit-event-1",
        "unused-1",
        "unused-2"
      ]),
      clock: () => "2026-06-10T00:00:10.000Z",
      executionClaimOwnerIdGenerator: createIds(["finalization-claim-1", "finalization-claim-2"])
    };

    await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: ["final-auditor"]
      },
      options
    );
    const retry = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: ["final-auditor"]
      },
      options
    );

    expect(retry.executionStatus).toBe("already_completed");
    expect(eventStore.listEventsByType(run.sessionId, FINAL_CANDIDATE_PROPOSED_EVENT_TYPE)).toHaveLength(1);
    expect(eventStore.listEventsByType(run.sessionId, FINAL_AUDIT_RECORDED_EVENT_TYPE)).toHaveLength(1);
  });

  it("does not execute a second final candidate generator while a round is already running", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    let resolveGenerator!: (value: FinalCandidateGeneratorResult) => void;
    const generator = createFinalCandidateGenerator({
      result: () =>
        new Promise<FinalCandidateGeneratorResult>((resolve) => {
          resolveGenerator = resolve;
        }) as unknown as FinalCandidateGeneratorResult
    });
    const first = runFinalizationRound(
      {
        runId: run.id,
        finalCandidateGeneratorId: generator.generatorId,
        auditGeneratorIds: []
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry([generator]),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry(),
        idGenerator: createIds(["final-proposal-1", "final-proposal-event-1"]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"])
      }
    );
    await Promise.resolve();
    const second = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateGeneratorId: generator.generatorId,
        auditGeneratorIds: []
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry([generator]),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry(),
        idGenerator: createIds([]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-2"])
      }
    );

    resolveGenerator(createFinalCandidateDraft());
    await first;

    expect(second.executionStatus).toBe("already_running");
    expect(generator.callCount).toBe(1);
    expect(eventStore.listEventsByType(run.sessionId, FINAL_CANDIDATE_PROPOSED_EVENT_TYPE)).toHaveLength(1);
  });

  it("does not execute a second final auditor while a round is already running", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    let resolveAuditor!: (value: FinalAuditGeneratorResult) => void;
    const auditor = createFinalAuditGenerator({
      result: () =>
        new Promise<FinalAuditGeneratorResult>((resolve) => {
          resolveAuditor = resolve;
        }) as unknown as FinalAuditGeneratorResult
    });
    const first = runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: [auditor.auditorId]
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([auditor]),
        idGenerator: createIds(["final-proposal-1", "final-proposal-event-1", "final-audit-1", "final-audit-event-1"]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"])
      }
    );
    await Promise.resolve();
    const second = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: [auditor.auditorId]
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([auditor]),
        idGenerator: createIds([]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-2"])
      }
    );

    resolveAuditor(createFinalAudit(buildFinalizationContext({ run, eventStore })));
    await first;

    expect(second.executionStatus).toBe("already_running");
    expect(auditor.callCount).toBe(1);
    expect(eventStore.listEventsByType(run.sessionId, FINAL_AUDIT_RECORDED_EVENT_TYPE)).toHaveLength(1);
  });

  it("prevents stale late final generator results from writing core events after claim loss", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    let call = 0;
    let resolveFirst!: (value: FinalCandidateGeneratorResult) => void;
    const generator = createFinalCandidateGenerator({
      result: () => {
        call += 1;
        if (call === 1) {
          return new Promise<FinalCandidateGeneratorResult>((resolve) => {
            resolveFirst = resolve;
          }) as unknown as FinalCandidateGeneratorResult;
        }

        return createFinalCandidateDraft();
      }
    });
    let now = "2026-06-10T00:00:10.000Z";
    const options = {
      eventStore,
      runStore,
      finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry([generator]),
      finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry(),
      idGenerator: createIds(["final-proposal-1", "final-proposal-event-1"]),
      clock: () => now,
      executionClaimTtlMs: 1,
      executionClaimOwnerIdGenerator: createIds(["finalization-claim-1", "finalization-claim-2"])
    };
    const first = runFinalizationRound(
      {
        runId: run.id,
        finalCandidateGeneratorId: generator.generatorId,
        auditGeneratorIds: []
      },
      options
    );
    await Promise.resolve();

    now = "2026-06-10T00:00:10.002Z";
    const second = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateGeneratorId: generator.generatorId,
        auditGeneratorIds: []
      },
      options
    );

    resolveFirst(createFinalCandidateDraft());
    await expect(first).rejects.toMatchObject({ category: "round_conflict" });

    expect(second.finalCandidateResult?.status).toBe("proposed");
    expect(generator.callCount).toBe(2);
    expect(eventStore.listEventsByType(run.sessionId, FINAL_CANDIDATE_PROPOSED_EVENT_TYPE)).toHaveLength(1);
  });

  it("prevents stale late final auditor results from writing core events after claim loss", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    let call = 0;
    let firstAuditContext: FinalizationContext | undefined;
    let resolveFirst!: (value: FinalAuditGeneratorResult) => void;
    const auditor = createFinalAuditGenerator({
      result: (context) => {
        call += 1;
        if (call === 1) {
          firstAuditContext = context;

          return new Promise<FinalAuditGeneratorResult>((resolve) => {
            resolveFirst = resolve;
          }) as unknown as FinalAuditGeneratorResult;
        }

        return createFinalAudit(context);
      }
    });
    let now = "2026-06-10T00:00:10.000Z";
    const options = {
      eventStore,
      runStore,
      finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
      finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([auditor]),
      idGenerator: createIds([
        "final-proposal-1",
        "final-proposal-event-1",
        "final-audit-1",
        "final-audit-event-1"
      ]),
      clock: () => now,
      executionClaimTtlMs: 1,
      executionClaimOwnerIdGenerator: createIds(["finalization-claim-1", "finalization-claim-2"])
    };
    const first = runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: [auditor.auditorId]
      },
      options
    );
    await Promise.resolve();

    now = "2026-06-10T00:00:10.002Z";
    const second = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: [auditor.auditorId]
      },
      options
    );

    resolveFirst(createFinalAudit(firstAuditContext!));
    await expect(first).rejects.toMatchObject({ category: "round_conflict" });

    const auditEvents = eventStore.listEventsByType(
      run.sessionId,
      FINAL_AUDIT_RECORDED_EVENT_TYPE
    );
    const storedRunJson = JSON.stringify(runStore.getRun(run.id));
    const fieldNames = collectFieldNames(runStore.getRun(run.id));

    expect(second.auditResults[0]?.status).toBe("recorded");
    expect(auditor.callCount).toBe(2);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents.map((event) => event.id)).toEqual(["final-audit-event-1"]);
    expect(new Set(auditEvents.map((event) => event.id)).size).toBe(1);
    expect(storedRunJson).toContain("final-audit-event-1");
    expect(storedRunJson).not.toContain("The proposal preserves alternatives and unresolved issues.");
    expect(storedRunJson).not.toContain("sk-live-hidden");
    expect(storedRunJson).not.toContain("finalAnswer");
    expect(fieldNames).not.toContain("winner");
    expect(fieldNames).not.toContain("currentBest");
    expect(fieldNames).not.toContain("ranking");
    expect(fieldNames).not.toContain("score");
    expect(fieldNames).not.toContain("vote");
    expect(fieldNames).not.toContain("finalAnswer");
    expect(fieldNames).not.toContain("truthSummary");
    expect(fieldNames).not.toContain("Judge");
  });

  it("keeps RunStore operational and avoids forbidden semantic-authority fields", async () => {
    const { eventStore, runStore, run } = await createAcceptedRun();
    const result = await runFinalizationRound(
      {
        runId: run.id,
        finalCandidateDraft: createFinalCandidateDraft(),
        auditGeneratorIds: ["final-auditor"],
        compileOutcome: true
      },
      {
        eventStore,
        runStore,
        finalCandidateGeneratorRegistry: new FinalCandidateGeneratorRegistry(),
        finalAuditGeneratorRegistry: new FinalAuditGeneratorRegistry([
          createFinalAuditGenerator()
        ]),
        idGenerator: createIds([
          "final-proposal-1",
          "final-proposal-event-1",
          "final-audit-1",
          "final-audit-event-1"
        ]),
        clock: () => "2026-06-10T00:00:10.000Z",
        executionClaimOwnerIdGenerator: createIds(["finalization-claim-1"])
      }
    );
    const storedRunJson = JSON.stringify(runStore.getRun(run.id));
    const fieldNames = collectFieldNames({
      result,
      storedRun: runStore.getRun(run.id)
    });

    expect(storedRunJson).toContain("finalizationRounds");
    expect(storedRunJson).toContain("final-proposal-event-1");
    expect(storedRunJson).toContain("final-audit-event-1");
    expect(storedRunJson).not.toContain("Prefer CLI-first validation under the stated constraints.");
    expect(storedRunJson).not.toContain("sk-live-hidden");
    expect(storedRunJson).not.toContain("finalAnswer");
    expect(fieldNames).not.toContain("winner");
    expect(fieldNames).not.toContain("currentBest");
    expect(fieldNames).not.toContain("ranking");
    expect(fieldNames).not.toContain("score");
    expect(fieldNames).not.toContain("vote");
    expect(fieldNames).not.toContain("finalAnswer");
    expect(fieldNames).not.toContain("truthSummary");
    expect(fieldNames).not.toContain("Judge");
  });
});

function collectFieldNames(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectFieldNames);
  }

  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectFieldNames(nested)]);
}
