import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  SafetyAppealSealerUnavailableError,
  type SafetyAppealSealer,
  type SafetyAppealSealScope,
  type SealedSafetyAppealReason,
} from "../domain/safety-appeal-sealer.port.js";

const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

function additionalAuthenticatedData(
  scope: SafetyAppealSealScope,
  keyVersion: string,
) {
  return Buffer.from(
    [
      "vnext-safety-appeal-v1",
      scope.ownerPrincipalId,
      scope.safetyCaseId,
      String(scope.caseVersion),
      keyVersion,
    ].join("\0"),
    "utf8",
  );
}

function digestScopeData(scope: SafetyAppealSealScope) {
  return Buffer.from(
    [
      "vnext-safety-appeal-digest-v1",
      scope.ownerPrincipalId,
      scope.safetyCaseId,
      String(scope.caseVersion),
    ].join("\0"),
    "utf8",
  );
}

export class ConfiguredSafetyAppealSealer implements SafetyAppealSealer {
  private readonly encryptionKey: Buffer | null;
  private readonly digestKey: Buffer | null;
  private readonly keyVersion: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    const encodedEncryptionKey =
      env.VNEXT_SAFETY_APPEAL_SEALING_KEY?.trim() ?? "";
    const encodedDigestKey =
      env.VNEXT_SAFETY_APPEAL_DIGEST_KEY?.trim() ?? "";
    this.keyVersion =
      env.VNEXT_SAFETY_APPEAL_SEALING_KEY_VERSION?.trim() ?? "";
    const encryptionCandidate = KEY_PATTERN.test(encodedEncryptionKey)
      ? Buffer.from(encodedEncryptionKey, "base64url")
      : null;
    const digestCandidate = KEY_PATTERN.test(encodedDigestKey)
      ? Buffer.from(encodedDigestKey, "base64url")
      : null;
    const encryptionMasterKey =
      encryptionCandidate?.length === 32 ? encryptionCandidate : null;
    const digestMasterKey =
      digestCandidate?.length === 32 ? digestCandidate : null;
    this.encryptionKey = encryptionMasterKey
      ? createHmac("sha256", encryptionMasterKey)
          .update("vnext-safety-appeal-v1/encryption-key")
          .digest()
      : null;
    this.digestKey = digestMasterKey
      ? createHmac("sha256", digestMasterKey)
          .update("vnext-safety-appeal-v1/digest-key")
          .digest()
      : null;
  }

  get configured() {
    return (
      this.encryptionKey !== null &&
      this.digestKey !== null &&
      VERSION_PATTERN.test(this.keyVersion)
    );
  }

  seal(scope: SafetyAppealSealScope, normalizedReason: string) {
    if (
      !this.configured ||
      this.encryptionKey === null ||
      this.digestKey === null ||
      normalizedReason.length === 0
    ) {
      throw new SafetyAppealSealerUnavailableError();
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce);
    cipher.setAAD(additionalAuthenticatedData(scope, this.keyVersion));
    const ciphertext = Buffer.concat([
      cipher.update(normalizedReason, "utf8"),
      cipher.final(),
    ]);
    return {
      reasonDigest: createHmac("sha256", this.digestKey)
        .update("vnext-safety-appeal-reason-v1\0")
        .update(digestScopeData(scope))
        .update("\0")
        .update(normalizedReason)
        .digest("hex"),
      reasonCiphertext: ciphertext.toString("base64url"),
      nonce: nonce.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      keyVersion: this.keyVersion,
    };
  }

  open(
    scope: SafetyAppealSealScope,
    sealed: SealedSafetyAppealReason,
  ) {
    if (
      !this.configured ||
      this.encryptionKey === null ||
      sealed.keyVersion !== this.keyVersion
    ) {
      throw new SafetyAppealSealerUnavailableError();
    }
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.encryptionKey,
        Buffer.from(sealed.nonce, "base64url"),
      );
      decipher.setAAD(additionalAuthenticatedData(scope, this.keyVersion));
      decipher.setAuthTag(Buffer.from(sealed.authTag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(sealed.reasonCiphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new SafetyAppealSealerUnavailableError();
    }
  }
}
