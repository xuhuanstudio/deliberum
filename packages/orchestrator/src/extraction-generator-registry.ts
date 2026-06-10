import { ExtractionGeneratorRegistryError } from "./errors";
import type {
  ExtractionGenerator,
  ExtractionGeneratorRegistryEntry
} from "./types";

export class ExtractionGeneratorRegistry {
  private readonly generatorsById = new Map<string, ExtractionGenerator>();

  constructor(generators: readonly ExtractionGenerator[] = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: ExtractionGenerator): void {
    if (!generator.generatorId) {
      throw new ExtractionGeneratorRegistryError(
        "Extraction generator registry entries require a generator id."
      );
    }

    if (this.generatorsById.has(generator.generatorId)) {
      throw new ExtractionGeneratorRegistryError(
        `Extraction generator registry contains duplicate generator id: ${generator.generatorId}`
      );
    }

    this.generatorsById.set(generator.generatorId, generator);
  }

  get(generatorId: string): ExtractionGenerator | undefined {
    return this.generatorsById.get(generatorId);
  }

  require(generatorId: string): ExtractionGenerator {
    const generator = this.get(generatorId);

    if (!generator) {
      throw new ExtractionGeneratorRegistryError(`Extraction generator was not found: ${generatorId}`);
    }

    return generator;
  }

  list(): ExtractionGeneratorRegistryEntry[] {
    return [...this.generatorsById.keys()].map((generatorId) => ({
      generatorId
    }));
  }
}
