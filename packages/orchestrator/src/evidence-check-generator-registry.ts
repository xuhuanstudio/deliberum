import { EvidenceCheckGeneratorRegistryError } from "./errors";
import type {
  EvidenceCheckGenerator,
  EvidenceCheckGeneratorRegistryEntry
} from "./types";

export class EvidenceCheckGeneratorRegistry {
  private readonly generatorsById = new Map<string, EvidenceCheckGenerator>();

  constructor(generators: readonly EvidenceCheckGenerator[] = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: EvidenceCheckGenerator): void {
    if (!generator.generatorId) {
      throw new EvidenceCheckGeneratorRegistryError(
        "Evidence check generator registry entries require a generator id."
      );
    }

    if (this.generatorsById.has(generator.generatorId)) {
      throw new EvidenceCheckGeneratorRegistryError(
        `Evidence check generator registry contains duplicate generator id: ${generator.generatorId}`
      );
    }

    this.generatorsById.set(generator.generatorId, generator);
  }

  get(generatorId: string): EvidenceCheckGenerator | undefined {
    return this.generatorsById.get(generatorId);
  }

  require(generatorId: string): EvidenceCheckGenerator {
    const generator = this.get(generatorId);

    if (!generator) {
      throw new EvidenceCheckGeneratorRegistryError(
        `Evidence check generator was not found: ${generatorId}`
      );
    }

    return generator;
  }

  list(): EvidenceCheckGeneratorRegistryEntry[] {
    return [...this.generatorsById.keys()].map((generatorId) => ({
      generatorId
    }));
  }
}
