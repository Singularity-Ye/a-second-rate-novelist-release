import { createHash } from "node:crypto";
import type { CreativeTaskLease } from "../domain/creative-task.js";
import {
  createSafetyTriggerDigest,
  evaluateSafetyPolicy,
  SafetyPolicyUnavailableError,
  type SafetyPolicyPort,
} from "../domain/safety-policy.port.js";
import type { HandleSafetyCase } from "./handle-safety-case.js";

export interface CheckOutputSafetyInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly workspaceId: string | null;
  readonly lease: CreativeTaskLease;
  readonly content: string;
}

function dispositionIdempotencyKey(parts: readonly string[]) {
  return `safety:output:${createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")}`;
}

export class CheckOutputSafety {
  constructor(
    private readonly policy: SafetyPolicyPort,
    private readonly handleSafetyCase: HandleSafetyCase,
  ) {}

  async execute(input: CheckOutputSafetyInput) {
    if (input.lease.ownerPrincipalId !== input.ownerPrincipalId) {
      throw new Error("safety task owner mismatch");
    }
    const decision = await evaluateSafetyPolicy(this.policy, {
      content: input.content,
      stage: "output",
    });
    if (decision.disposition === "support") {
      return {
        caseId: null,
        disposition: "support" as const,
        policyVersion: decision.policyVersion,
        reasonCode: decision.reasonCode,
        severity: decision.severity,
      };
    }
    if (
      decision.triggerType === "output_policy" &&
      input.workspaceId === null
    ) {
      throw new SafetyPolicyUnavailableError();
    }
    const triggerDigest = createSafetyTriggerDigest("output", input.content);
    const result = await this.handleSafetyCase.execute({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      workspaceId: input.workspaceId,
      triggeringTask: input.lease,
      suppressedContentRefs: [`candidate-output:${triggerDigest}`],
      evidence: {
        ...decision,
        disposition: decision.disposition,
        triggerDigest,
      },
      idempotencyKey: dispositionIdempotencyKey([
        input.ownerPrincipalId,
        input.experienceSessionId,
        input.workspaceId ?? "session_scope",
        input.lease.taskId,
        String(input.lease.attemptNumber),
        input.lease.leaseToken,
        triggerDigest,
        decision.triggerType,
        decision.severity,
        decision.policyVersion,
        decision.reasonCode,
        decision.disposition,
        decision.safetyContactRef ?? "no_safety_contact",
      ]),
    });
    return {
      caseId: result.caseId,
      disposition: decision.disposition,
      policyVersion: decision.policyVersion,
      reasonCode: decision.reasonCode,
      severity: decision.severity,
      projectionVersionId: result.projectionVersionId,
    };
  }
}
