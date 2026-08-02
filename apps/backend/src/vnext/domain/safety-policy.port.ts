import { createHash } from "node:crypto";

export const VNEXT_SAFETY_STAGES = ["input", "output"] as const;
export const VNEXT_SAFETY_TRIGGER_TYPES = [
  "input_policy",
  "output_policy",
  "crisis",
  "illegal_content",
] as const;
export const VNEXT_SAFETY_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export const VNEXT_SAFETY_DISPOSITIONS = [
  "support",
  "block",
  "escalate",
  "restrict",
] as const;

export type VnextSafetyStage = (typeof VNEXT_SAFETY_STAGES)[number];
export type VnextSafetyTriggerType =
  (typeof VNEXT_SAFETY_TRIGGER_TYPES)[number];
export type VnextSafetySeverity = (typeof VNEXT_SAFETY_SEVERITIES)[number];
export type VnextSafetyDisposition = (typeof VNEXT_SAFETY_DISPOSITIONS)[number];
export type VnextBlockingSafetyDisposition = Exclude<
  VnextSafetyDisposition,
  "support"
>;

export interface SafetyPolicyEvaluationInput {
  readonly stage: VnextSafetyStage;
  /** Ephemeral untrusted content. Implementations must never log or persist it. */
  readonly content: string;
}

export interface SafetyPolicyDecision {
  readonly triggerType: VnextSafetyTriggerType;
  readonly severity: VnextSafetySeverity;
  readonly disposition: VnextSafetyDisposition;
  readonly policyVersion: string;
  readonly reasonCode: string;
  readonly safetyContactRef: string | null;
}

export interface SafetyPolicyPort {
  evaluate(input: SafetyPolicyEvaluationInput): Promise<SafetyPolicyDecision>;
}

export class SafetyPolicyUnavailableError extends Error {
  override readonly name = "SafetyPolicyUnavailableError";

  constructor(options?: ErrorOptions) {
    super("safety policy is unavailable or returned invalid evidence", options);
  }
}

const DECISION_FIELDS = [
  "triggerType",
  "severity",
  "disposition",
  "policyVersion",
  "reasonCode",
  "safetyContactRef",
] as const;
const REASON_CODE_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,99}$/;
const SAFE_REFERENCE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/;
const MAX_CONTENT_LENGTH = 200_000;

function exactDataRecord(value: unknown, fields: readonly string[]) {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key))
    ) {
      return false;
    }
    return keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

function nonEmptyBoundedString(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function optionalRef(value: unknown) {
  return (
    value === null ||
    (nonEmptyBoundedString(value, 200) && SAFE_REFERENCE_PATTERN.test(value))
  );
}

export function requireSafetyContent(
  content: unknown,
): asserts content is string {
  if (!nonEmptyBoundedString(content, MAX_CONTENT_LENGTH)) {
    throw new SafetyPolicyUnavailableError();
  }
}

export function createSafetyTriggerDigest(
  stage: VnextSafetyStage,
  content: string,
) {
  requireSafetyContent(content);
  return createHash("sha256").update(`${stage}\0${content}`).digest("hex");
}

export function normalizeSafetyPolicyDecision(
  value: unknown,
  stage: VnextSafetyStage,
): SafetyPolicyDecision {
  if (!exactDataRecord(value, DECISION_FIELDS)) {
    throw new SafetyPolicyUnavailableError();
  }
  const decision = value as unknown as SafetyPolicyDecision;
  const allowedTriggers: readonly VnextSafetyTriggerType[] =
    stage === "input"
      ? ["input_policy", "crisis", "illegal_content"]
      : ["output_policy", "crisis", "illegal_content"];
  if (
    !allowedTriggers.includes(decision.triggerType) ||
    !VNEXT_SAFETY_SEVERITIES.includes(decision.severity) ||
    !VNEXT_SAFETY_DISPOSITIONS.includes(decision.disposition) ||
    !nonEmptyBoundedString(decision.policyVersion, 200) ||
    !SAFE_REFERENCE_PATTERN.test(decision.policyVersion) ||
    !nonEmptyBoundedString(decision.reasonCode, 100) ||
    !REASON_CODE_PATTERN.test(decision.reasonCode) ||
    !optionalRef(decision.safetyContactRef) ||
    (decision.disposition === "support" &&
      (decision.safetyContactRef !== null ||
        decision.triggerType === "crisis" ||
        decision.triggerType === "illegal_content")) ||
    (decision.disposition === "escalate" &&
      (decision.safetyContactRef === null ||
        !["high", "critical"].includes(decision.severity))) ||
    (decision.triggerType === "crisis" && decision.disposition !== "escalate")
  ) {
    throw new SafetyPolicyUnavailableError();
  }
  return Object.freeze({ ...decision });
}

export async function evaluateSafetyPolicy(
  policy: SafetyPolicyPort,
  input: SafetyPolicyEvaluationInput,
) {
  requireSafetyContent(input.content);
  try {
    return normalizeSafetyPolicyDecision(
      await policy.evaluate(input),
      input.stage,
    );
  } catch {
    // Do not retain the policy error as a cause: an adapter may have embedded
    // the raw candidate in its message, which must never reach application logs.
    throw new SafetyPolicyUnavailableError();
  }
}

export const VNEXT_SAFETY_POLICY = Symbol("VNEXT_SAFETY_POLICY");
