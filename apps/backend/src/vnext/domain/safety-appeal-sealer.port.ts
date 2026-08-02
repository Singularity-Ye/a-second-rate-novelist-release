export const VNEXT_SAFETY_APPEAL_SEALER = Symbol(
  "VNEXT_SAFETY_APPEAL_SEALER",
);

export interface SafetyAppealSealScope {
  readonly ownerPrincipalId: string;
  readonly safetyCaseId: string;
  readonly caseVersion: number;
}

export interface SealedSafetyAppealReason {
  readonly reasonDigest: string;
  readonly reasonCiphertext: string;
  readonly nonce: string;
  readonly authTag: string;
  readonly keyVersion: string;
}

export interface SafetyAppealSealer {
  seal(
    scope: SafetyAppealSealScope,
    normalizedReason: string,
  ): SealedSafetyAppealReason;
}

export class SafetyAppealSealerUnavailableError extends Error {
  override readonly name = "SafetyAppealSealerUnavailableError";

  constructor() {
    super("safety appeal sealing is unavailable");
  }
}
