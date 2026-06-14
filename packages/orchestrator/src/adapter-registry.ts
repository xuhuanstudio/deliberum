import type { AdapterRegistryEntry, RegisteredParticipantAdapter } from "./types";
import { AdapterRegistryError } from "./errors";

export class AdapterRegistry {
  private readonly adaptersById = new Map<string, RegisteredParticipantAdapter>();

  constructor(adapters: readonly RegisteredParticipantAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: RegisteredParticipantAdapter): void {
    if (!adapter.adapterId) {
      throw new AdapterRegistryError("Adapter registry entries require an adapter id.");
    }

    if (this.adaptersById.has(adapter.adapterId)) {
      throw new AdapterRegistryError(`Adapter registry contains duplicate adapter id: ${adapter.adapterId}`);
    }

    this.adaptersById.set(adapter.adapterId, adapter);
  }

  replace(adapter: RegisteredParticipantAdapter): void {
    if (!adapter.adapterId) {
      throw new AdapterRegistryError("Adapter registry entries require an adapter id.");
    }

    this.adaptersById.set(adapter.adapterId, adapter);
  }

  get(adapterId: string): RegisteredParticipantAdapter | undefined {
    return this.adaptersById.get(adapterId);
  }

  require(adapterId: string): RegisteredParticipantAdapter {
    const adapter = this.get(adapterId);

    if (!adapter) {
      throw new AdapterRegistryError(`Adapter was not found: ${adapterId}`);
    }

    return adapter;
  }

  list(): AdapterRegistryEntry[] {
    return [...this.adaptersById.values()].map((adapter) => ({
      adapterId: adapter.adapterId,
      capabilities: structuredClone(adapter.capabilities)
    }));
  }
}
