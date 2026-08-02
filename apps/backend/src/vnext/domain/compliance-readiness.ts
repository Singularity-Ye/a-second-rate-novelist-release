import type { SealedSafetyAppealReason } from "./safety-appeal-sealer.port.js";

export const CONTINUOUS_USE_REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1_000;
export const CONTINUOUS_USE_POLICY_VERSION = "continuous-use-receipt-v1";

export type ComplianceProcessingPurpose =
  | "core_creative"
  | "external_experience"
  | "model_training";

export type ComplianceSessionStatus =
  | "pending"
  | "eligible"
  | "withdrawn"
  | "blocked"
  | "expired";

export type ProcessingBasisTransition = "expired" | "revoked";

export interface ComplianceOwnerScope {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
}

export interface WithdrawConsentRecord extends ComplianceOwnerScope {
  readonly consentRecordId: string;
  readonly expectedVersion: number;
  readonly now: Date;
}

export interface ConsentWithdrawalResult {
  readonly disposition: "withdrawn" | "replayed";
  readonly recordVersion: number;
  readonly purpose: ComplianceProcessingPurpose;
  readonly cancelledTaskCount: number;
  readonly complianceStatus: ComplianceSessionStatus;
}

export interface OwnedConsentView {
  readonly id: string;
  readonly purpose: ComplianceProcessingPurpose;
  readonly kind: "required" | "optional";
  readonly status: "active" | "withdrawn";
  readonly version: number;
  readonly grantedAt: Date;
  readonly withdrawnAt: Date | null;
}

export interface TransitionProcessingBasisRecord extends ComplianceOwnerScope {
  readonly processingBasisRecordId: string;
  readonly expectedVersion: number;
  readonly transition: ProcessingBasisTransition;
  readonly authorizationRef: string;
  readonly now: Date;
}

export interface ProcessingBasisTransitionResult {
  readonly disposition: "transitioned" | "replayed";
  readonly recordVersion: number;
  readonly purpose: Exclude<ComplianceProcessingPurpose, "model_training">;
  readonly transition: ProcessingBasisTransition;
  readonly cancelledTaskCount: number;
  readonly complianceStatus: ComplianceSessionStatus;
}

export interface EvaluateContinuousUseRecord extends ComplianceOwnerScope {
  readonly now: Date;
  readonly reminderIntervalMs: number;
}

export type ContinuousUseEvaluation =
  | {
      readonly status: "not_due";
      readonly nextReminderAt: Date;
    }
  | {
      readonly status: "pending";
      readonly receiptId: string;
      readonly receiptVersion: 1;
      readonly emittedAt: Date;
    };

export interface AcknowledgeContinuousUseReceiptRecord
  extends ComplianceOwnerScope {
  readonly receiptId: string;
  readonly expectedReceiptVersion: number;
  readonly now: Date;
}

export interface ContinuousUseAcknowledgement {
  readonly disposition: "acknowledged" | "replayed";
  readonly receiptId: string;
  readonly status: "acknowledged";
  readonly receiptVersion: 2;
  readonly acknowledgedAt: Date;
}

export interface CancelSessionCreativeTasksRecord extends ComplianceOwnerScope {
  readonly now: Date;
}

export interface SessionExitResult {
  readonly disposition: "exited" | "replayed";
  readonly cancelledTaskCount: number;
}

export interface AppealSafetyDecisionRecord extends ComplianceOwnerScope {
  readonly safetyCaseId: string;
  readonly expectedVersion: number;
  readonly sealedReason: SealedSafetyAppealReason;
  readonly now: Date;
}

export interface SafetyAppealResult {
  readonly disposition: "appealed" | "replayed";
  readonly safetyCaseId: string;
  readonly status: "appealed";
  readonly version: number;
  readonly appealedAt: Date;
}

export interface OwnedSafetyCaseView {
  readonly safetyCaseId: string;
  readonly status: "open" | "appealed" | "resolved";
  readonly disposition: "block" | "escalate" | "restrict";
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly version: number;
  readonly openedAt: Date;
  readonly appealedAt: Date | null;
  readonly closedAt: Date | null;
}

export interface ReadOwnedSafetyCaseRecord extends ComplianceOwnerScope {
  readonly safetyCaseId: string;
}

export interface ComplianceRecoveryRepository {
  listOwnedConsents(input: ComplianceOwnerScope): Promise<readonly OwnedConsentView[]>;
  withdrawConsent(input: WithdrawConsentRecord): Promise<ConsentWithdrawalResult>;
  evaluateContinuousUse(
    input: EvaluateContinuousUseRecord,
  ): Promise<ContinuousUseEvaluation>;
  acknowledgeContinuousUseReceipt(
    input: AcknowledgeContinuousUseReceiptRecord,
  ): Promise<ContinuousUseAcknowledgement>;
  cancelSessionCreativeTasks(
    input: CancelSessionCreativeTasksRecord,
  ): Promise<SessionExitResult>;
  appealSafetyDecision(
    input: AppealSafetyDecisionRecord,
  ): Promise<SafetyAppealResult>;
  readOwnedSafetyCase(
    input: ReadOwnedSafetyCaseRecord,
  ): Promise<OwnedSafetyCaseView>;
  listOwnedSafetyCases(
    input: ComplianceOwnerScope,
  ): Promise<readonly OwnedSafetyCaseView[]>;
}

export interface ProcessingBasisControlRepository {
  transitionProcessingBasis(
    input: TransitionProcessingBasisRecord,
  ): Promise<ProcessingBasisTransitionResult>;
}

export interface ComplianceReadinessRepository
  extends ComplianceRecoveryRepository,
    ProcessingBasisControlRepository {}

export class ComplianceResourceNotFoundError extends Error {
  override readonly name = "ComplianceResourceNotFoundError";
}

export class ComplianceVersionConflictError extends Error {
  override readonly name = "ComplianceVersionConflictError";
}

export class ComplianceOperationNotAllowedError extends Error {
  override readonly name = "ComplianceOperationNotAllowedError";
}

export class ComplianceInvariantError extends Error {
  override readonly name = "ComplianceInvariantError";
}

export const VNEXT_COMPLIANCE_RECOVERY_REPOSITORY = Symbol(
  "VNEXT_COMPLIANCE_RECOVERY_REPOSITORY",
);
