import { createHash } from "node:crypto";
import {
  SafetyPolicyUnavailableError,
  type SafetyPolicyEvaluationInput,
  type SafetyPolicyPort,
  type VnextSafetyStage,
} from "../domain/safety-policy.port.js";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export interface SyntheticSandboxSafetyPolicyConfig {
  readonly policyVersion: string;
  readonly safetyContactRef: string;
  readonly supportedInputDigests: ReadonlySet<string>;
  readonly blockedInputDigests: ReadonlySet<string>;
  readonly crisisInputDigests: ReadonlySet<string>;
  readonly supportedOutputDigests: ReadonlySet<string>;
  readonly blockedOutputDigests: ReadonlySet<string>;
  readonly crisisOutputDigests: ReadonlySet<string>;
}

function requiredDigestSet(value: string | undefined) {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (
    entries.length === 0 ||
    entries.some((entry) => !DIGEST_PATTERN.test(entry)) ||
    new Set(entries).size !== entries.length
  ) {
    throw new Error("synthetic sandbox safety policy is unavailable");
  }
  return new Set(entries);
}

function optionalDigestSet(value: string | undefined) {
  if ((value ?? "").trim() === "") return new Set<string>();
  return requiredDigestSet(value);
}

function assertDisjoint(...sets: ReadonlySet<string>[]) {
  const seen = new Set<string>();
  for (const values of sets) {
    for (const value of values) {
      if (seen.has(value)) {
        throw new Error("synthetic sandbox safety policy is unavailable");
      }
      seen.add(value);
    }
  }
}

export function readSyntheticSandboxSafetyPolicyConfig(
  env: Record<string, string | undefined> = process.env,
): SyntheticSandboxSafetyPolicyConfig {
  const policyVersion = env.VNEXT_SAFETY_POLICY_VERSION?.trim() ?? "";
  const safetyContactRef = env.VNEXT_SAFETY_CONTACT_REF?.trim() ?? "";
  if (
    policyVersion.length === 0 ||
    policyVersion.length > 200 ||
    !SAFE_REFERENCE_PATTERN.test(policyVersion) ||
    !SAFE_REFERENCE_PATTERN.test(safetyContactRef) ||
    env.VNEXT_SAFETY_POLICY_MODE?.trim() !== "synthetic_sandbox" ||
    env.VNEXT_CRISIS_ESCALATION_MODE?.trim() !== "sandbox" ||
    env.VNEXT_REAL_PERSON_INPUT_ENABLED?.trim().toLowerCase() === "true"
  ) {
    throw new Error("synthetic sandbox safety policy is unavailable");
  }

  const supportedInputDigests = requiredDigestSet(
    env.VNEXT_SAFETY_SUPPORTED_INPUT_DIGESTS,
  );
  const blockedInputDigests = requiredDigestSet(
    env.VNEXT_SAFETY_BLOCKED_INPUT_DIGESTS,
  );
  const crisisInputDigests = optionalDigestSet(
    env.VNEXT_SAFETY_CRISIS_INPUT_DIGESTS,
  );
  const supportedOutputDigests = requiredDigestSet(
    env.VNEXT_SAFETY_SUPPORTED_OUTPUT_DIGESTS,
  );
  const blockedOutputDigests = requiredDigestSet(
    env.VNEXT_SAFETY_BLOCKED_OUTPUT_DIGESTS,
  );
  const crisisOutputDigests = optionalDigestSet(
    env.VNEXT_SAFETY_CRISIS_OUTPUT_DIGESTS,
  );
  if (crisisInputDigests.size + crisisOutputDigests.size === 0) {
    throw new Error("synthetic sandbox safety policy is unavailable");
  }
  assertDisjoint(
    supportedInputDigests,
    blockedInputDigests,
    crisisInputDigests,
  );
  assertDisjoint(
    supportedOutputDigests,
    blockedOutputDigests,
    crisisOutputDigests,
  );
  return {
    policyVersion,
    safetyContactRef,
    supportedInputDigests,
    blockedInputDigests,
    crisisInputDigests,
    supportedOutputDigests,
    blockedOutputDigests,
    crisisOutputDigests,
  };
}

function digest(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function catalogs(config: SyntheticSandboxSafetyPolicyConfig, stage: VnextSafetyStage) {
  return stage === "input"
    ? {
        supported: config.supportedInputDigests,
        blocked: config.blockedInputDigests,
        crisis: config.crisisInputDigests,
      }
    : {
        supported: config.supportedOutputDigests,
        blocked: config.blockedOutputDigests,
        crisis: config.crisisOutputDigests,
      };
}

/**
 * Digest-catalog policy for approved deterministic synthetic fixtures only.
 * Unknown input or model output fails closed and can never become story truth.
 */
export class SyntheticSandboxSafetyPolicy implements SafetyPolicyPort {
  constructor(private readonly config: SyntheticSandboxSafetyPolicyConfig) {}

  async evaluate(input: SafetyPolicyEvaluationInput) {
    const contentDigest = digest(input.content);
    const catalog = catalogs(this.config, input.stage);
    if (catalog.supported.has(contentDigest)) {
      return {
        triggerType:
          input.stage === "input"
            ? ("input_policy" as const)
            : ("output_policy" as const),
        severity: "low" as const,
        disposition: "support" as const,
        policyVersion: this.config.policyVersion,
        reasonCode: "synthetic_fixture_supported",
        safetyContactRef: null,
      };
    }
    if (catalog.blocked.has(contentDigest)) {
      return {
        triggerType:
          input.stage === "input"
            ? ("input_policy" as const)
            : ("output_policy" as const),
        severity: "high" as const,
        disposition: "block" as const,
        policyVersion: this.config.policyVersion,
        reasonCode: "synthetic_fixture_blocked",
        safetyContactRef: null,
      };
    }
    if (catalog.crisis.has(contentDigest)) {
      return {
        triggerType: "crisis" as const,
        severity: "critical" as const,
        disposition: "escalate" as const,
        policyVersion: this.config.policyVersion,
        reasonCode: "synthetic_fixture_crisis",
        safetyContactRef: this.config.safetyContactRef,
      };
    }
    throw new SafetyPolicyUnavailableError();
  }
}
