import { FinalizationGeneratorRegistryError } from "./errors";
import type {
  FinalAuditGenerator,
  FinalAuditGeneratorRegistryEntry,
  FinalCandidateGenerator,
  FinalCandidateGeneratorRegistryEntry
} from "./types";

export class FinalCandidateGeneratorRegistry {
  private readonly generatorsById = new Map<string, FinalCandidateGenerator>();

  constructor(generators: readonly FinalCandidateGenerator[] = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: FinalCandidateGenerator): void {
    if (!generator.generatorId || generator.generatorId.trim().length === 0) {
      throw new FinalizationGeneratorRegistryError(
        "Final candidate generator id must be non-empty."
      );
    }

    if (this.generatorsById.has(generator.generatorId)) {
      throw new FinalizationGeneratorRegistryError(
        "Final candidate generator id is already registered."
      );
    }

    this.generatorsById.set(generator.generatorId, generator);
  }

  require(generatorId: string): FinalCandidateGenerator {
    const generator = this.generatorsById.get(generatorId);

    if (!generator) {
      throw new FinalizationGeneratorRegistryError(
        "Final candidate generator is not registered."
      );
    }

    return generator;
  }

  list(): FinalCandidateGeneratorRegistryEntry[] {
    return [...this.generatorsById.keys()].map((generatorId) => ({ generatorId }));
  }
}

export class FinalAuditGeneratorRegistry {
  private readonly generatorsById = new Map<string, FinalAuditGenerator>();

  constructor(generators: readonly FinalAuditGenerator[] = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: FinalAuditGenerator): void {
    if (!generator.auditorId || generator.auditorId.trim().length === 0) {
      throw new FinalizationGeneratorRegistryError(
        "Final audit generator id must be non-empty."
      );
    }

    if (this.generatorsById.has(generator.auditorId)) {
      throw new FinalizationGeneratorRegistryError(
        "Final audit generator id is already registered."
      );
    }

    this.generatorsById.set(generator.auditorId, generator);
  }

  require(auditorId: string): FinalAuditGenerator {
    const generator = this.generatorsById.get(auditorId);

    if (!generator) {
      throw new FinalizationGeneratorRegistryError("Final audit generator is not registered.");
    }

    return generator;
  }

  list(): FinalAuditGeneratorRegistryEntry[] {
    return [...this.generatorsById.keys()].map((auditorId) => ({ auditorId }));
  }
}
