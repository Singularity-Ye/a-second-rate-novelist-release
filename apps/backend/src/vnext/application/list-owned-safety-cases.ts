import type {
  ComplianceOwnerScope,
  ComplianceRecoveryRepository,
} from "../domain/compliance-readiness.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ListOwnedSafetyCases {
  constructor(private readonly repository: ComplianceRecoveryRepository) {}

  execute(input: ComplianceOwnerScope) {
    if (
      !UUID_V4_PATTERN.test(input.ownerPrincipalId) ||
      !UUID_V4_PATTERN.test(input.experienceSessionId)
    ) {
      throw new TypeError("invalid safety-case discovery scope");
    }
    return this.repository.listOwnedSafetyCases(input);
  }
}
