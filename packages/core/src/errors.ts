export class CoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoreError";
  }
}

export class InvalidTopicContractInputError extends CoreError {
  constructor(message = "Invalid Topic Contract input.") {
    super(message);
    this.name = "InvalidTopicContractInputError";
  }
}

export class MissingSessionDependencyError extends CoreError {
  constructor(message: string) {
    super(message);
    this.name = "MissingSessionDependencyError";
  }
}

export class InvalidSealedBatchInputError extends CoreError {
  constructor(message = "Invalid sealed batch input.") {
    super(message);
    this.name = "InvalidSealedBatchInputError";
  }
}

export class SealedBatchNotFoundError extends CoreError {
  constructor(batchId: string) {
    super(`Sealed batch not found: ${batchId}`);
    this.name = "SealedBatchNotFoundError";
  }
}

export class SealedBatchAlreadyClosedError extends CoreError {
  constructor(batchId: string) {
    super(`Sealed batch is already closed: ${batchId}`);
    this.name = "SealedBatchAlreadyClosedError";
  }
}

export class UnauthorizedSealedContributionError extends CoreError {
  constructor(authorId: string) {
    super(`Participant is not authorized for this sealed batch: ${authorId}`);
    this.name = "UnauthorizedSealedContributionError";
  }
}

export class DuplicateSealedContributionError extends CoreError {
  constructor(authorId: string) {
    super(`Participant has already submitted a sealed contribution: ${authorId}`);
    this.name = "DuplicateSealedContributionError";
  }
}

export class IncompleteSealedBatchError extends CoreError {
  constructor(batchId: string) {
    super(`Sealed batch is incomplete: ${batchId}`);
    this.name = "IncompleteSealedBatchError";
  }
}

export class UnsupportedRevealPolicyError extends CoreError {
  constructor(revealPolicy: string) {
    super(`Reveal policy is not supported in this stage: ${revealPolicy}`);
    this.name = "UnsupportedRevealPolicyError";
  }
}

export class InvalidExtractionProposalInputError extends CoreError {
  constructor(message = "Invalid extraction proposal input.") {
    super(message);
    this.name = "InvalidExtractionProposalInputError";
  }
}

export class ExtractionProposalNotFoundError extends CoreError {
  constructor(eventId: string) {
    super(`Extraction proposal event not found: ${eventId}`);
    this.name = "ExtractionProposalNotFoundError";
  }
}

export class ExtractionSourceEventNotFoundError extends CoreError {
  constructor(eventId: string) {
    super(`Extraction source event not found in session: ${eventId}`);
    this.name = "ExtractionSourceEventNotFoundError";
  }
}

export class InvalidExtractionProposalTargetError extends CoreError {
  constructor(message = "Invalid extraction proposal target.") {
    super(message);
    this.name = "InvalidExtractionProposalTargetError";
  }
}

export class InvalidProjectionInputError extends CoreError {
  constructor(message = "Invalid projection input.") {
    super(message);
    this.name = "InvalidProjectionInputError";
  }
}

export class InvalidProcessProposalInputError extends CoreError {
  constructor(message = "Invalid process proposal input.") {
    super(message);
    this.name = "InvalidProcessProposalInputError";
  }
}

export class ProcessProposalEventNotFoundError extends CoreError {
  constructor(eventId: string) {
    super(`Process proposal event not found: ${eventId}`);
    this.name = "ProcessProposalEventNotFoundError";
  }
}

export class InvalidProcessProposalTargetError extends CoreError {
  constructor(message = "Invalid process proposal target.") {
    super(message);
    this.name = "InvalidProcessProposalTargetError";
  }
}

export class ProcessProposalBasisEventNotFoundError extends CoreError {
  constructor(eventId: string) {
    super(`Process proposal basis event not found in session: ${eventId}`);
    this.name = "ProcessProposalBasisEventNotFoundError";
  }
}

export class InvalidFinalCandidateProposalInputError extends CoreError {
  constructor(message = "Invalid final candidate proposal input.") {
    super(message);
    this.name = "InvalidFinalCandidateProposalInputError";
  }
}

export class FinalCandidateProposalNotFoundError extends CoreError {
  constructor(eventId: string) {
    super(`Final candidate proposal event not found: ${eventId}`);
    this.name = "FinalCandidateProposalNotFoundError";
  }
}

export class InvalidFinalAuditInputError extends CoreError {
  constructor(message = "Invalid final audit input.") {
    super(message);
    this.name = "InvalidFinalAuditInputError";
  }
}

export class EvidenceNeedNotFoundError extends CoreError {
  constructor(evidenceNeedId: string) {
    super(`Accepted evidence need not found: ${evidenceNeedId}`);
    this.name = "EvidenceNeedNotFoundError";
  }
}

export class InvalidEvidenceResultInputError extends CoreError {
  constructor(message = "Invalid evidence result input.") {
    super(message);
    this.name = "InvalidEvidenceResultInputError";
  }
}

export class InvalidOutcomeCompilationInputError extends CoreError {
  constructor(message = "Invalid outcome compilation input.") {
    super(message);
    this.name = "InvalidOutcomeCompilationInputError";
  }
}

export class InvalidResourceDeliveryAuditInputError extends CoreError {
  constructor(message = "Invalid resource delivery audit input.") {
    super(message);
    this.name = "InvalidResourceDeliveryAuditInputError";
  }
}

export class InvalidResourceAccessAuditInputError extends CoreError {
  constructor(message = "Invalid resource access audit input.") {
    super(message);
    this.name = "InvalidResourceAccessAuditInputError";
  }
}
