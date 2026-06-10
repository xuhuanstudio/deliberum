import type { ParticipantRegistryEntry, RunParticipant } from "./types";
import { RunPlanValidationError } from "./errors";

export class ParticipantRegistry {
  private readonly participants = new Map<string, ParticipantRegistryEntry>();

  constructor(participants: readonly RunParticipant[]) {
    for (const participant of participants) {
      if (this.participants.has(participant.id)) {
        throw new RunPlanValidationError("Participant registry requires unique participant ids.");
      }

      this.participants.set(participant.id, cloneEntry(participant));
    }
  }

  get(participantId: string): ParticipantRegistryEntry | undefined {
    const entry = this.participants.get(participantId);

    return entry ? cloneEntry(entry) : undefined;
  }

  require(participantId: string): ParticipantRegistryEntry {
    const entry = this.get(participantId);

    if (!entry) {
      throw new RunPlanValidationError(`Participant was not found: ${participantId}`);
    }

    return entry;
  }

  list(): ParticipantRegistryEntry[] {
    return [...this.participants.values()].map(cloneEntry);
  }
}

function cloneEntry(entry: ParticipantRegistryEntry): ParticipantRegistryEntry {
  return structuredClone(entry);
}
