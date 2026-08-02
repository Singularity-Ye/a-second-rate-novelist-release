import type {
  AcknowledgeContinuousUseReceiptRecord,
  AppealSafetyDecisionRecord,
  ComplianceOwnerScope,
  ComplianceRecoveryRepository,
  ProcessingBasisControlRepository,
  ReadOwnedSafetyCaseRecord,
  TransitionProcessingBasisRecord,
  WithdrawConsentRecord,
  EvaluateContinuousUseRecord,
  CancelSessionCreativeTasksRecord,
} from "../domain/compliance-readiness.js";

export class ComplianceRecoveryRepositoryFacade
  implements ComplianceRecoveryRepository
{
  readonly #delegate: ComplianceRecoveryRepository;

  constructor(delegate: ComplianceRecoveryRepository) {
    this.#delegate = delegate;
  }

  listOwnedConsents(input: ComplianceOwnerScope) {
    return this.#delegate.listOwnedConsents(input);
  }

  withdrawConsent(input: WithdrawConsentRecord) {
    return this.#delegate.withdrawConsent(input);
  }

  evaluateContinuousUse(input: EvaluateContinuousUseRecord) {
    return this.#delegate.evaluateContinuousUse(input);
  }

  acknowledgeContinuousUseReceipt(
    input: AcknowledgeContinuousUseReceiptRecord,
  ) {
    return this.#delegate.acknowledgeContinuousUseReceipt(input);
  }

  cancelSessionCreativeTasks(input: CancelSessionCreativeTasksRecord) {
    return this.#delegate.cancelSessionCreativeTasks(input);
  }

  appealSafetyDecision(input: AppealSafetyDecisionRecord) {
    return this.#delegate.appealSafetyDecision(input);
  }

  readOwnedSafetyCase(input: ReadOwnedSafetyCaseRecord) {
    return this.#delegate.readOwnedSafetyCase(input);
  }

  listOwnedSafetyCases(input: ComplianceOwnerScope) {
    return this.#delegate.listOwnedSafetyCases(input);
  }
}

export class ProcessingBasisControlRepositoryFacade
  implements ProcessingBasisControlRepository
{
  readonly #delegate: ProcessingBasisControlRepository;

  constructor(delegate: ProcessingBasisControlRepository) {
    this.#delegate = delegate;
  }

  transitionProcessingBasis(input: TransitionProcessingBasisRecord) {
    return this.#delegate.transitionProcessingBasis(input);
  }
}
