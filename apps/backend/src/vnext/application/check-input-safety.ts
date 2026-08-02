import { createHash } from "node:crypto";
import {
  createSafetyTriggerDigest,
  evaluateSafetyPolicy,
  type SafetyPolicyPort,
} from "../domain/safety-policy.port.js";
import type { CreativeTaskLease } from "../domain/creative-task.js";
import type { HandleSafetyCase } from "./handle-safety-case.js";

export interface CheckInputSafetyInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly content: string;
  readonly triggeringTask?: CreativeTaskLease;
  readonly workspaceId?: string | null;
}

function dispositionIdempotencyKey(parts: readonly string[]) {
  return `safety:input:${createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")}`;
}

export class CheckInputSafety {
  constructor(
    private readonly policy: SafetyPolicyPort,
    private readonly handleSafetyCase: HandleSafetyCase,
  ) {}

  async execute(input: CheckInputSafetyInput) {
    if (
      input.triggeringTask !== undefined &&
      input.triggeringTask.ownerPrincipalId !== input.ownerPrincipalId
    ) {
      throw new Error("safety task owner mismatch");
    }
    const decision = await evaluateSafetyPolicy(this.policy, {
      content: input.content,
      stage: "input",
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
    const triggerDigest = createSafetyTriggerDigest("input", input.content);
    const result = await this.handleSafetyCase.execute({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      workspaceId: input.workspaceId ?? null,
      triggeringTask: input.triggeringTask ?? null,
      suppressedContentRefs: [],
      evidence: {
        ...decision,
        disposition: decision.disposition,
        triggerDigest,
      },
      idempotencyKey: dispositionIdempotencyKey([
        input.ownerPrincipalId,
        input.experienceSessionId,
        input.workspaceId ?? "session_scope",
        input.triggeringTask?.taskId ?? "request_precheck",
        String(input.triggeringTask?.attemptNumber ?? 0),
        input.triggeringTask?.leaseToken ?? "no_lease",
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
