import { describe, expect, it } from "vitest";
import {
  EXTRACTION_PROPOSED_EVENT_TYPE,
  PROPOSAL_ACCEPTED_EVENT_TYPE,
  PROPOSAL_CHALLENGED_EVENT_TYPE,
  SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
  projectCandidateFrontier
} from "@deliberum/core";
import { InMemoryEventStore } from "@deliberum/storage";
import type { JsonValue, SealedBatchRevealPolicy } from "@deliberum/protocol";
import type {
  ParticipantAdapter,
  ParticipantAdapterContext,
  ParticipantAdapterInput,
  ParticipantAdapterResult
} from "@deliberum/adapters";
import {
  AdapterRegistry,
  ExtractionGeneratorRegistry,
  InMemoryRunStore,
  ProposalReviewGeneratorRegistry,
  buildProposalReviewContext,
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
  ProposalReviewContext,
  ProposalReviewGenerator,
  ProposalReviewGeneratorResult
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
    providerConfigs: [],
    budget: {
      maxEvents: 50,
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
  let calls = 0;

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
      calls += 1;

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
    },
    get callCount() {
      return calls;
    }
  } as ParticipantAdapter & { readonly callCount: number };
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

async function createRevealedRun() {
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

  return {
    ...fixture,
    run: sealedResult.run
  };
}

async function createRunWithExtractionProposals(options: {
  proposalCount?: 1 | 2;
} = {}) {
  const fixture = await createRevealedRun();
  const proposalCount = options.proposalCount ?? 1;
  const generators = Array.from({ length: proposalCount }, (_, index) =>
    createValidGenerator({
      generatorId: `generator-${index + 1}`,
      candidateId: index === 0 ? "candidate-cli-first" : "candidate-web-polish"
    })
  );
  const extractionResult = await runExtractionProposalRound(
    {
      runId: fixture.run.id
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

  return {
    ...fixture,
    run: extractionResult.run,
    proposalEventIds: extractionResult.proposalResults
      .map((result) => result.proposalEventId)
      .filter((proposalEventId): proposalEventId is string => Boolean(proposalEventId))
  };
}

function createValidGenerator(options: {
  generatorId?: string;
  candidateId?: string;
} = {}): ExtractionGenerator {
  const generatorId = options.generatorId ?? "generator-1";
  const candidateId = options.candidateId ?? "candidate-cli-first";

  return {
    generatorId,
    generateExtractionProposal(_input, context) {
      return createValidExtractionResult(context, candidateId);
    }
  };
}

function createValidExtractionResult(
  context: ExtractionContext,
  candidateId: string
): ExtractionGeneratorResult {
  const sourceEventIds = [context.metadata.allowedSourceEventIds[0]!];
  const claimId = `${candidateId}-claim`;
  const qualityId = `${candidateId}-quality`;

  return {
    candidates: [
      {
        id: candidateId,
        title:
          candidateId === "candidate-cli-first"
            ? "Prioritize CLI-first validation"
            : "Prioritize Web UI polish",
        description:
          candidateId === "candidate-cli-first"
            ? "Validate the ledger, lifecycle, and projections before UI polish."
            : "Polish the Web UI so projection inspection is easier for operators.",
        sourceEventIds,
        status: "active",
        supportedBy: [claimId],
        attackedBy: [],
        qualityObligationIds: [qualityId],
        assumptions: ["The proposal remains traceable to revealed contribution events."],
        tradeoffs: ["Other work may move more slowly."]
      }
    ],
    claims: [
      {
        id: claimId,
        content: "The candidate is supported by a revealed contribution.",
        scope: "process",
        sourceEventIds,
        supports: [candidateId]
      }
    ],
    qualityObligations: [
      {
        id: qualityId,
        scope: "candidate",
        targetCandidateId: candidateId,
        requirement: "Show append-only traceability through events.",
        status: "unanswered",
        sourceEventIds,
        supportingRefIds: [claimId],
        unresolvedObjectionIds: []
      }
    ],
    rationale: "Extract one traceable candidate from the revealed sealed contributions."
  };
}

function createReviewer(options: {
  reviewerId?: string;
  challengeTarget?: string | ((context: ProposalReviewContext) => string);
  fail?: boolean;
  onCall?: (input: unknown, context: ProposalReviewContext) => void;
} = {}): ProposalReviewGenerator & { readonly callCount: number } {
  let calls = 0;

  return {
    reviewerId: options.reviewerId ?? "reviewer-1",
    reviewProposals(input, context) {
      calls += 1;
      options.onCall?.(input, context);

      if (options.fail) {
        throw new Error("raw reviewer failure secret sk-live-should-not-appear");
      }

      const result = (): ProposalReviewGeneratorResult => {
        if (!options.challengeTarget) {
          return {
            notes: ["No challenge."]
          };
        }

        const targetProposalEventId =
          typeof options.challengeTarget === "function"
            ? options.challengeTarget(context)
            : options.challengeTarget;

        return {
          challenges: [
            {
              targetProposalEventId,
              reason: "The proposal needs a traceability challenge."
            }
          ],
          notes: ["Challenge generated."]
        };
      };

      return result();
    },
    get callCount() {
      return calls;
    }
  } as ProposalReviewGenerator & { readonly callCount: number };
}

function createDelayedReviewer(options: {
  challengeTarget: (context: ProposalReviewContext) => string;
}) {
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let resolveReview: () => void = () => undefined;
  let calls = 0;
  const reviewer: ProposalReviewGenerator & { readonly callCount: number } = {
    reviewerId: "reviewer-1",
    reviewProposals(_input, context) {
      calls += 1;
      markStarted();

      return new Promise<ProposalReviewGeneratorResult>((resolve) => {
        resolveReview = () =>
          resolve({
            challenges: [
              {
                targetProposalEventId: options.challengeTarget(context),
                reason: "The proposal needs a traceability challenge."
              }
            ]
          });
      });
    },
    get callCount() {
      return calls;
    }
  };

  return {
    reviewer,
    started,
    resolveReview: () => resolveReview()
  };
}

function appendHiddenEvents(eventStore: InMemoryEventStore) {
  eventStore.appendEvent({
    id: "private-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "private_note",
    authorId: "system",
    createdAt: "2026-06-10T00:00:03.000Z",
    basedOnEventIds: [],
    visibility: "private",
    trace: {},
    payload: {
      content: "private proposal-review payload must not appear"
    }
  });
  eventStore.appendEvent({
    id: "redacted-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "redacted_note",
    authorId: "system",
    createdAt: "2026-06-10T00:00:04.000Z",
    basedOnEventIds: [],
    visibility: "redacted",
    trace: {},
    payload: {
      content: "redacted proposal-review payload must not appear"
    }
  });
  eventStore.appendEvent({
    id: "unrevealed-contribution-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: SEALED_CONTRIBUTION_SUBMITTED_EVENT_TYPE,
    authorId: "participant-hidden",
    createdAt: "2026-06-10T00:00:05.000Z",
    basedOnEventIds: [],
    visibility: "sealed",
    batchId: "batch-hidden",
    trace: {},
    payload: {
      content: "unrevealed proposal-review sealed payload must not appear"
    }
  });
}

function appendHiddenExtractionProposalEvents(eventStore: InMemoryEventStore) {
  eventStore.appendEvent({
    id: "private-proposal-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: EXTRACTION_PROPOSED_EVENT_TYPE,
    authorId: "hidden-generator",
    createdAt: "2026-06-10T00:00:06.100Z",
    basedOnEventIds: ["contribution-1"],
    visibility: "private",
    trace: {},
    payload: createHiddenExtractionProposalPayload(
      "private-proposal-1",
      "hidden-private-candidate",
      "private extraction-like payload must not appear"
    )
  });
  eventStore.appendEvent({
    id: "redacted-proposal-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: EXTRACTION_PROPOSED_EVENT_TYPE,
    authorId: "hidden-generator",
    createdAt: "2026-06-10T00:00:06.200Z",
    basedOnEventIds: ["contribution-1"],
    visibility: "redacted",
    trace: {},
    payload: createHiddenExtractionProposalPayload(
      "redacted-proposal-1",
      "hidden-redacted-candidate",
      "redacted extraction-like payload must not appear"
    )
  });
  eventStore.appendEvent({
    id: "hidden-acceptance-event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: PROPOSAL_ACCEPTED_EVENT_TYPE,
    authorId: "hidden-acceptor",
    createdAt: "2026-06-10T00:00:06.300Z",
    basedOnEventIds: ["private-proposal-event-1"],
    visibility: "public",
    trace: {},
    payload: {
      id: "hidden-acceptance-1",
      targetProposalEventId: "private-proposal-event-1",
      rationale: "Public lifecycle event must not make a private proposal visible.",
      status: "accepted_for_now"
    }
  });
}

function createHiddenExtractionProposalPayload(
  proposalId: string,
  candidateId: string,
  hiddenText: string
) {
  return {
    id: proposalId,
    sourceEventIds: ["contribution-1"],
    candidates: [
      {
        id: candidateId,
        title: hiddenText,
        description: hiddenText,
        sourceEventIds: ["contribution-1"],
        status: "active",
        supportedBy: [],
        attackedBy: [],
        qualityObligationIds: [],
        assumptions: [hiddenText],
        tradeoffs: [hiddenText]
      }
    ],
    claims: [],
    objections: [],
    evidenceNeeds: [],
    qualityObligations: [],
    rationale: hiddenText,
    status: "proposed"
  };
}

function replaceExtractionRoundProposalIds(
  runStore: InMemoryRunStore,
  runId: string,
  proposalEventIds: string[]
) {
  return runStore.updateRun(runId, (currentRun: DeliberationRunRecord) => ({
    ...currentRun,
    extractionRounds: currentRun.extractionRounds?.map((round) =>
      round.roundId === "initial"
        ? {
            ...round,
            proposalEventIds
          }
        : round
    ),
    updatedAt: "2026-06-10T00:00:07.000Z"
  }));
}

describe("Stage 19B-1 proposal review orchestration", () => {
  it("builds safe proposal review context from projections", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    appendHiddenEvents(eventStore);
    const context = buildProposalReviewContext({
      run: runStore.getRun(run.id)!,
      eventStore
    });
    const contextJson = JSON.stringify(context);

    expect(context.metadata.proposalEventIds).toEqual(proposalEventIds);
    expect(context.proposalStates).toHaveLength(1);
    expect(context.frontier).toEqual(
      expect.objectContaining({
        basis: "accepted_active_candidates",
        candidates: []
      })
    );
    expect(context.qualityObligations).toEqual(
      expect.objectContaining({
        qualityObligations: []
      })
    );
    expect(contextJson).toContain("proposal-event-1");
    expect(contextJson).not.toContain("private proposal-review payload must not appear");
    expect(contextJson).not.toContain("redacted proposal-review payload must not appear");
    expect(contextJson).not.toContain("unrevealed proposal-review sealed payload must not appear");
    expect(contextJson).not.toContain("executionClaim");
    expect(contextJson).not.toContain("eventStore");
    expect(context.metadata.eventIds).not.toContain("private-event-1");
    expect(context.metadata.eventIds).not.toContain("redacted-event-1");
  });

  it("excludes private and redacted extraction-like proposal payloads from review context", async () => {
    const { eventStore, runStore, run } = await createRunWithExtractionProposals();
    appendHiddenExtractionProposalEvents(eventStore);

    const context = buildProposalReviewContext({
      run: runStore.getRun(run.id)!,
      eventStore
    });
    const contextJson = JSON.stringify(context);

    expect(contextJson).not.toContain("private extraction-like payload must not appear");
    expect(contextJson).not.toContain("redacted extraction-like payload must not appear");
    expect(contextJson).not.toContain("hidden-private-candidate");
    expect(contextJson).not.toContain("hidden-redacted-candidate");
    expect(context.proposalStates.map((state) => state.proposalEventId)).toEqual([
      "proposal-event-1"
    ]);
    expect(context.frontier.candidates).toEqual([]);
    expect(context.metadata.eventIds).not.toContain("private-proposal-event-1");
    expect(context.metadata.eventIds).not.toContain("redacted-proposal-event-1");
  });

  it("rejects private and redacted proposal event ids as source extraction proposals", async () => {
    const { eventStore, runStore, run } = await createRunWithExtractionProposals();
    appendHiddenExtractionProposalEvents(eventStore);
    replaceExtractionRoundProposalIds(runStore, run.id, [
      "private-proposal-event-1",
      "redacted-proposal-event-1"
    ]);

    expect(() =>
      buildProposalReviewContext({
        run: runStore.getRun(run.id)!,
        eventStore
      })
    ).toThrow("unavailable proposal event");
  });

  it("builds proposal review projections from safe public lifecycle events only", async () => {
    const { eventStore, runStore, run } = await createRunWithExtractionProposals();
    appendHiddenExtractionProposalEvents(eventStore);

    const context = buildProposalReviewContext({
      run: runStore.getRun(run.id)!,
      eventStore
    });

    expect(context.metadata.eventIds).toEqual([
      "proposal-event-1",
      "hidden-acceptance-event-1"
    ]);
    expect(context.acceptedObjects.candidates).toEqual([]);
    expect(context.frontier.candidates).toEqual([]);
    expect(context.qualityObligations.qualityObligations).toEqual([]);
  });

  it("creates challenge events through core proposal lifecycle only", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    const reviewer = createReviewer({
      challengeTarget: proposalEventIds[0]!
    });

    const result = await runProposalReviewRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([reviewer]),
        idGenerator: createIds(["challenge-1", "challenge-event-1"]),
        clock: () => "2026-06-10T00:00:08.000Z",
        executionClaimOwnerIdGenerator: createIds(["proposal-review-claim-1"])
      }
    );
    const challengeEvents = eventStore
      .listEvents(run.sessionId)
      .filter((event) => event.type === PROPOSAL_CHALLENGED_EVENT_TYPE);
    const storedRunJson = JSON.stringify(runStore.getRun(run.id));

    expect(result.reviewResults).toEqual([
      {
        reviewerId: "reviewer-1",
        status: "reviewed",
        challengeEventIds: ["challenge-event-1"],
        appendedChallengeEventIds: ["challenge-event-1"]
      }
    ]);
    expect(challengeEvents).toHaveLength(1);
    expect(challengeEvents[0]).toEqual(
      expect.objectContaining({
        id: "challenge-event-1",
        type: PROPOSAL_CHALLENGED_EVENT_TYPE,
        authorId: "reviewer-1",
        basedOnEventIds: [proposalEventIds[0]]
      })
    );
    expect(storedRunJson).toContain("challenge-event-1");
    expect(storedRunJson).not.toContain("The proposal needs a traceability challenge.");
  });

  it("rejects invalid challenge targets safely", async () => {
    const { eventStore, runStore, run } = await createRunWithExtractionProposals();
    const reviewer = createReviewer({
      challengeTarget: "missing-proposal-event"
    });

    const result = await runProposalReviewRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([reviewer]),
        idGenerator: createIds(["unused-challenge", "unused-challenge-event"])
      }
    );
    const serializedSafeSurfaces = JSON.stringify({
      result,
      storedRun: runStore.getRun(run.id)
    });

    expect(result.reviewResults).toContainEqual(
      expect.objectContaining({
        reviewerId: "reviewer-1",
        status: "failed",
        errorCategory: "proposal_review_validation_failed"
      })
    );
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      PROPOSAL_CHALLENGED_EVENT_TYPE
    );
    expect(serializedSafeSurfaces).not.toContain("missing proposal raw payload");
  });

  it("acceptance policy none accepts nothing and Candidate Frontier remains empty", async () => {
    const { eventStore, runStore, run } = await createRunWithExtractionProposals();

    const result = await runProposalReviewRound(
      {
        runId: run.id,
        reviewerIds: [],
        acceptancePolicy: {
          mode: "none"
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry(),
        idGenerator: createIds([])
      }
    );
    const frontier = projectCandidateFrontier({
      eventStore,
      sessionId: run.sessionId
    });

    expect(result.executionStatus).toBe("executed");
    expect(result.acceptanceResults).toEqual([]);
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      PROPOSAL_ACCEPTED_EVENT_TYPE
    );
    expect(frontier.candidates).toEqual([]);
  });

  it("failed reviewer with explicit acceptance policy produces no acceptance events", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    const reviewer = createReviewer({
      fail: true
    });

    const result = await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "This must not run while review is incomplete."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([reviewer]),
        idGenerator: createIds(["unused-acceptance", "unused-acceptance-event"])
      }
    );
    const frontier = projectCandidateFrontier({
      eventStore,
      sessionId: run.sessionId
    });

    expect(result.run.proposalReviewRounds?.[0]?.status).toBe("waiting_for_reviewers");
    expect(result.reviewResults).toContainEqual(
      expect.objectContaining({
        reviewerId: "reviewer-1",
        status: "failed",
        errorCategory: "proposal_review_generator_failed"
      })
    );
    expect(result.acceptanceResults).toEqual([]);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)).toHaveLength(0);
    expect(frontier.candidates).toEqual([]);
  });

  it("all_generated_unchallenged does not accept while review is incomplete", async () => {
    const { eventStore, runStore, run } =
      await createRunWithExtractionProposals({ proposalCount: 2 });
    const reviewer = createReviewer({
      fail: true
    });

    const result = await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "all_generated_unchallenged",
          authorId: "review-coordinator",
          rationale: "This must not accept proposals while review is incomplete."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([reviewer]),
        idGenerator: createIds(["unused-acceptance", "unused-acceptance-event"])
      }
    );

    expect(result.run.proposalReviewRounds?.[0]?.status).toBe("waiting_for_reviewers");
    expect(result.acceptanceResults).toEqual([]);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)).toHaveLength(0);
  });

  it("explicit retry can accept after a previously failed reviewer succeeds", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();

    await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "This must not run while review is incomplete."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([
          createReviewer({
            fail: true
          })
        ]),
        idGenerator: createIds(["unused-acceptance", "unused-acceptance-event"])
      }
    );

    const retry = await runProposalReviewRound(
      {
        runId: run.id,
        retryFailedReviewers: true,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "Accept only after review succeeds."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([
          createReviewer()
        ]),
        idGenerator: createIds(["acceptance-1", "acceptance-event-1"])
      }
    );

    expect(retry.run.proposalReviewRounds?.[0]?.status).toBe("completed");
    expect(retry.reviewResults).toContainEqual(
      expect.objectContaining({
        reviewerId: "reviewer-1",
        status: "reviewed"
      })
    );
    expect(retry.acceptanceResults).toEqual([
      {
        proposalEventId: proposalEventIds[0],
        status: "accepted",
        acceptanceEventId: "acceptance-event-1",
        appended: true
      }
    ]);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)).toHaveLength(1);
  });

  it("explicit acceptance calls core acceptance and Candidate Frontier changes only by projection", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    const beforeFrontier = projectCandidateFrontier({
      eventStore,
      sessionId: run.sessionId
    });

    const result = await runProposalReviewRound(
      {
        runId: run.id,
        reviewerIds: [],
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "Explicitly accept this extraction proposal for projection."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry(),
        idGenerator: createIds(["acceptance-1", "acceptance-event-1"])
      }
    );
    const afterFrontier = projectCandidateFrontier({
      eventStore,
      sessionId: run.sessionId
    });

    expect(beforeFrontier.candidates).toEqual([]);
    expect(result.acceptanceResults).toEqual([
      {
        proposalEventId: proposalEventIds[0],
        status: "accepted",
        acceptanceEventId: "acceptance-event-1",
        appended: true
      }
    ]);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)).toHaveLength(1);
    expect(afterFrontier).toEqual(
      expect.objectContaining({
        basis: "accepted_active_candidates",
        candidates: [
          expect.objectContaining({
            proposalEventId: proposalEventIds[0],
            object: expect.objectContaining({
              id: "candidate-cli-first"
            })
          })
        ]
      })
    );
  });

  it("all_generated_unchallenged skips challenged proposals", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals({ proposalCount: 2 });
    const reviewer = createReviewer({
      challengeTarget: proposalEventIds[0]!
    });

    const result = await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "all_generated_unchallenged",
          authorId: "review-coordinator",
          rationale: "Accept generated proposals that remain unchallenged."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([reviewer]),
        idGenerator: createIds([
          "challenge-1",
          "challenge-event-1",
          "acceptance-1",
          "acceptance-event-1"
        ])
      }
    );
    const acceptedEvents = eventStore
      .listEvents(run.sessionId)
      .filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE);

    expect(result.acceptanceResults).toEqual([
      {
        proposalEventId: proposalEventIds[1],
        status: "accepted",
        acceptanceEventId: "acceptance-event-1",
        appended: true
      }
    ]);
    expect(acceptedEvents).toHaveLength(1);
    expect(acceptedEvents[0]?.basedOnEventIds).toEqual([proposalEventIds[1]]);
  });

  it("challenged explicit acceptance requires allowChallenged true", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    const reviewer = createReviewer({
      challengeTarget: proposalEventIds[0]!
    });

    const rejected = await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "Attempt acceptance without challenged override."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([reviewer]),
        idGenerator: createIds(["challenge-1", "challenge-event-1"])
      }
    );
    const accepted = await runProposalReviewRound(
      {
        runId: run.id,
        roundId: "allow-challenged",
        reviewerIds: [],
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "Explicitly accept despite challenge.",
          allowChallenged: true
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry(),
        idGenerator: createIds(["acceptance-1", "acceptance-event-1"])
      }
    );

    expect(rejected.acceptanceResults).toEqual([
      {
        proposalEventId: proposalEventIds[0],
        status: "rejected",
        errorCategory: "proposal_review_validation_failed"
      }
    ]);
    expect(accepted.acceptanceResults).toEqual([
      {
        proposalEventId: proposalEventIds[0],
        status: "accepted",
        acceptanceEventId: "acceptance-event-1",
        appended: true
      }
    ]);
  });

  it("retry does not duplicate challenge or acceptance events", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    const reviewer = createReviewer({
      challengeTarget: proposalEventIds[0]!
    });
    const registry = new ProposalReviewGeneratorRegistry([reviewer]);

    await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "Accept challenged proposal only when allowed.",
          allowChallenged: true
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: registry,
        idGenerator: createIds([
          "challenge-1",
          "challenge-event-1",
          "acceptance-1",
          "acceptance-event-1"
        ])
      }
    );
    const eventCount = eventStore.listEvents(run.sessionId).length;

    const retry = await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "Accept challenged proposal only when allowed.",
          allowChallenged: true
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: registry,
        idGenerator: createIds(["unused-challenge", "unused-acceptance"])
      }
    );

    expect(retry.executionStatus).toBe("already_completed");
    expect(reviewer.callCount).toBe(1);
    expect(eventStore.listEvents(run.sessionId)).toHaveLength(eventCount);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_CHALLENGED_EVENT_TYPE)).toHaveLength(1);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)).toHaveLength(1);
  });

  it("concurrent review round does not execute reviewers twice", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    const delayed = createDelayedReviewer({
      challengeTarget: () => proposalEventIds[0]!
    });
    const registry = new ProposalReviewGeneratorRegistry([delayed.reviewer]);
    const first = runProposalReviewRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: registry,
        idGenerator: createIds(["challenge-1", "challenge-event-1"]),
        clock: () => "2026-06-10T00:00:08.000Z",
        executionClaimOwnerIdGenerator: createIds(["proposal-review-claim-1"]),
        executionClaimTtlMs: 30000
      }
    );

    await delayed.started;

    const second = await runProposalReviewRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: registry,
        idGenerator: createIds(["unused-challenge", "unused-challenge-event"]),
        clock: () => "2026-06-10T00:00:09.000Z",
        executionClaimOwnerIdGenerator: createIds(["proposal-review-claim-2"]),
        executionClaimTtlMs: 30000
      }
    );

    expect(second.executionStatus).toBe("already_running");
    expect(delayed.reviewer.callCount).toBe(1);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_CHALLENGED_EVENT_TYPE)).toHaveLength(0);

    delayed.resolveReview();

    const firstResult = await first;

    expect(firstResult.executionStatus).toBe("executed");
    expect(delayed.reviewer.callCount).toBe(1);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_CHALLENGED_EVENT_TYPE)).toHaveLength(1);
  });

  it("late reviewer result after stale claim reclaim appends no duplicate challenge or acceptance", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();
    const delayed = createDelayedReviewer({
      challengeTarget: () => proposalEventIds[0]!
    });
    const first = runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "The late first invocation must not reach acceptance.",
          allowChallenged: true
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([
          delayed.reviewer
        ]),
        idGenerator: createIds(["late-challenge", "late-challenge-event"]),
        clock: () => "2026-06-10T00:00:08.000Z",
        executionClaimOwnerIdGenerator: createIds(["proposal-review-claim-1"]),
        executionClaimTtlMs: 1
      }
    );

    await delayed.started;

    const second = await runProposalReviewRound(
      {
        runId: run.id,
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "The reclaimed invocation may accept.",
          allowChallenged: true
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([
          createReviewer({
            challengeTarget: proposalEventIds[0]!
          })
        ]),
        idGenerator: createIds([
          "challenge-1",
          "challenge-event-1",
          "acceptance-1",
          "acceptance-event-1"
        ]),
        clock: () => "2026-06-10T00:00:09.000Z",
        executionClaimOwnerIdGenerator: createIds(["proposal-review-claim-2"]),
        executionClaimTtlMs: 30000
      }
    );

    expect(second.executionStatus).toBe("executed");
    expect(second.reviewResults).toContainEqual(
      expect.objectContaining({
        reviewerId: "reviewer-1",
        status: "reviewed",
        challengeEventIds: ["challenge-event-1"]
      })
    );
    expect(second.acceptanceResults).toEqual([
      {
        proposalEventId: proposalEventIds[0],
        status: "accepted",
        acceptanceEventId: "acceptance-event-1",
        appended: true
      }
    ]);

    delayed.resolveReview();

    await expect(first).rejects.toMatchObject({
      category: "round_conflict"
    });
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_CHALLENGED_EVENT_TYPE)).toHaveLength(1);
    expect(eventStore.listEvents(run.sessionId).filter((event) => event.type === PROPOSAL_ACCEPTED_EVENT_TYPE)).toHaveLength(1);
  });

  it("stores raw reviewer errors only as safe categories", async () => {
    const { eventStore, runStore, run } = await createRunWithExtractionProposals();
    const reviewer = createReviewer({
      fail: true
    });

    const result = await runProposalReviewRound(
      {
        runId: run.id
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry([reviewer]),
        idGenerator: createIds(["unused-challenge", "unused-challenge-event"])
      }
    );
    const storedRunJson = JSON.stringify(runStore.getRun(run.id));

    expect(result.reviewResults).toContainEqual(
      expect.objectContaining({
        reviewerId: "reviewer-1",
        status: "failed",
        errorCategory: "proposal_review_generator_failed"
      })
    );
    expect(storedRunJson).toContain("proposal_review_generator_failed");
    expect(storedRunJson).not.toContain("raw reviewer failure");
    expect(storedRunJson).not.toContain("sk-live-should-not-appear");
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      PROPOSAL_CHALLENGED_EVENT_TYPE
    );
  });

  it("keeps RunStore operational and avoids finalization or forbidden semantic fields", async () => {
    const { eventStore, runStore, run, proposalEventIds } =
      await createRunWithExtractionProposals();

    const result = await runProposalReviewRound(
      {
        runId: run.id,
        reviewerIds: [],
        acceptancePolicy: {
          mode: "explicit_proposal_event_ids",
          proposalEventIds: [proposalEventIds[0]!],
          authorId: "review-coordinator",
          rationale: "Explicitly accept this extraction proposal for projection."
        }
      },
      {
        eventStore,
        runStore,
        proposalReviewGeneratorRegistry: new ProposalReviewGeneratorRegistry(),
        idGenerator: createIds(["acceptance-1", "acceptance-event-1"])
      }
    );
    const storedRun = runStore.getRun(run.id)!;
    const storedRunJson = JSON.stringify(storedRun);
    const fieldNames = collectFieldNames({
      result,
      storedRun
    });

    expect(storedRunJson).toContain("proposalReviewRounds");
    expect(storedRunJson).toContain("acceptance-event-1");
    expect(storedRunJson).not.toContain("Validate the ledger, lifecycle, and projections");
    expect(storedRunJson).not.toContain(
      "Extract one traceable candidate from the revealed sealed contributions."
    );
    expect(storedRunJson).not.toContain("Explicitly accept this extraction proposal");
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      "final_candidate_proposed"
    );
    expect(eventStore.listEvents(run.sessionId).map((event) => event.type)).not.toContain(
      "final_candidate_audited"
    );
    expect(fieldNames).not.toContain("winner");
    expect(fieldNames).not.toContain("currentBest");
    expect(fieldNames).not.toContain("ranking");
    expect(fieldNames).not.toContain("score");
    expect(fieldNames).not.toContain("vote");
    expect(fieldNames).not.toContain("finalAnswer");
    expect(fieldNames).not.toContain("truthSummary");
    expect(fieldNames).not.toContain("Judge");
    expect("runProposalReviewRound" in orchestratorExportSurface()).toBe(true);
    expect("runFinalizationRound" in orchestratorExportSurface()).toBe(true);
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

function orchestratorExportSurface() {
  return {
    runFinalizationRound,
    runProposalReviewRound
  };
}
