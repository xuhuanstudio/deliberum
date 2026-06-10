import { ProposalReviewGeneratorRegistryError } from "./errors";
import type {
  ProposalReviewGenerator,
  ProposalReviewGeneratorRegistryEntry
} from "./types";

export class ProposalReviewGeneratorRegistry {
  private readonly generatorsById = new Map<string, ProposalReviewGenerator>();

  constructor(generators: readonly ProposalReviewGenerator[] = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: ProposalReviewGenerator): void {
    if (!generator.reviewerId || generator.reviewerId.trim().length === 0) {
      throw new ProposalReviewGeneratorRegistryError(
        "Proposal review generator id must be non-empty."
      );
    }

    if (this.generatorsById.has(generator.reviewerId)) {
      throw new ProposalReviewGeneratorRegistryError(
        "Proposal review generator id is already registered."
      );
    }

    this.generatorsById.set(generator.reviewerId, generator);
  }

  require(reviewerId: string): ProposalReviewGenerator {
    const generator = this.generatorsById.get(reviewerId);

    if (!generator) {
      throw new ProposalReviewGeneratorRegistryError(
        "Proposal review generator is not registered."
      );
    }

    return generator;
  }

  list(): ProposalReviewGeneratorRegistryEntry[] {
    return [...this.generatorsById.keys()].map((reviewerId) => ({ reviewerId }));
  }
}
