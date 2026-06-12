import { CandidateRepairGeneratorRegistryError } from "./errors";
import type {
  CandidateRepairGenerator,
  CandidateRepairGeneratorRegistryEntry
} from "./types";

export class CandidateRepairGeneratorRegistry {
  private readonly generatorsById = new Map<string, CandidateRepairGenerator>();

  constructor(generators: readonly CandidateRepairGenerator[] = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: CandidateRepairGenerator): void {
    if (!generator.generatorId) {
      throw new CandidateRepairGeneratorRegistryError(
        "Candidate repair generator registry entries require a generator id."
      );
    }

    if (this.generatorsById.has(generator.generatorId)) {
      throw new CandidateRepairGeneratorRegistryError(
        `Candidate repair generator registry contains duplicate generator id: ${generator.generatorId}`
      );
    }

    this.generatorsById.set(generator.generatorId, generator);
  }

  get(generatorId: string): CandidateRepairGenerator | undefined {
    return this.generatorsById.get(generatorId);
  }

  require(generatorId: string): CandidateRepairGenerator {
    const generator = this.get(generatorId);

    if (!generator) {
      throw new CandidateRepairGeneratorRegistryError(
        `Candidate repair generator was not found: ${generatorId}`
      );
    }

    return generator;
  }

  list(): CandidateRepairGeneratorRegistryEntry[] {
    return [...this.generatorsById.keys()].map((generatorId) => ({
      generatorId
    }));
  }
}
