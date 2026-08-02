import { createHash } from "node:crypto";
import type {
  CrisisEscalationPort,
  CrisisEscalationRequest,
} from "../domain/crisis-escalation.port.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SandboxCrisisEscalationAdapter implements CrisisEscalationPort {
  async escalate(input: CrisisEscalationRequest) {
    if (
      input.idempotencyKey.trim().length === 0 ||
      input.idempotencyKey.length > 200 ||
      !UUID_PATTERN.test(input.safetyCaseId) ||
      typeof input.safetyContactRef !== "string" ||
      input.safetyContactRef.trim().length === 0 ||
      input.safetyContactRef.length > 200
    ) {
      throw new Error("invalid sandbox escalation reference");
    }
    const deliveryRef = createHash("sha256")
      .update(`vnext-safety-sandbox\u0000${input.idempotencyKey}`)
      .digest("hex");
    return { deliveryRef: `sandbox:${deliveryRef}` };
  }
}
