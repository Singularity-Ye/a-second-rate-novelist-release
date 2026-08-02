import { readConfiguredCreativeRuntimeConfig } from "../infrastructure/configured-creative-runtime.adapter.js";
import { readConfiguredSyntheticFixtureCatalog } from "../infrastructure/configured-synthetic-fixture.authorizer.js";
import {
  readSyntheticSandboxSafetyPolicyConfig,
  type SyntheticSandboxSafetyPolicyConfig,
} from "../infrastructure/synthetic-sandbox-safety-policy.js";
import { readVnextSessionAdmissionPolicy } from "./create-guest-session.js";
import { ConfiguredProcessingBasisControlAuthority } from "./expire-processing-basis.js";
import { readContinuousUseIdleResetPolicy } from "../infrastructure/prisma-vnext-session.repository.js";
import { ConfiguredSafetyAppealSealer } from "../infrastructure/configured-safety-appeal-sealer.js";
import type {
  VnextReadinessPort,
  VnextReadinessResult,
} from "../domain/vnext-readiness.port.js";

const REQUIRED_ATTESTATION_VERSION = "v1";

function providerConfigured(env: Record<string, string | undefined>) {
  if (
    env.VNEXT_GATEWAY_ROUTE_ATTESTATION_VERSION?.trim() !==
    REQUIRED_ATTESTATION_VERSION
  ) {
    return false;
  }
  try {
    readConfiguredCreativeRuntimeConfig(env);
    return true;
  } catch {
    return false;
  }
}

function safetyPolicyConfig(
  env: Record<string, string | undefined>,
): SyntheticSandboxSafetyPolicyConfig | null {
  try {
    return readSyntheticSandboxSafetyPolicyConfig(env);
  } catch {
    return null;
  }
}

function fixtureCatalogConfigured(
  env: Record<string, string | undefined>,
  safety: SyntheticSandboxSafetyPolicyConfig | null,
) {
  if (safety === null) return false;
  const fixtureCatalog = readConfiguredSyntheticFixtureCatalog(env);
  const approvedInputDigests = [
    ...safety.supportedInputDigests,
    ...safety.blockedInputDigests,
    ...safety.crisisInputDigests,
  ];
  return (
    fixtureCatalog.digests.size === approvedInputDigests.length &&
    approvedInputDigests.every((digest) => fixtureCatalog.digests.has(digest))
  );
}

export interface ReadVnextReadinessOptions {
  readonly env?: Record<string, string | undefined>;
  readonly freshnessWindowMs?: number;
}

export class ReadVnextReadiness {
  private readonly env: Record<string, string | undefined>;
  private readonly freshnessWindowMs: number;

  constructor(
    private readonly port: VnextReadinessPort,
    options: ReadVnextReadinessOptions = {},
  ) {
    this.env = options.env ?? process.env;
    this.freshnessWindowMs = options.freshnessWindowMs ?? 30_000;
    if (
      !Number.isSafeInteger(this.freshnessWindowMs) ||
      this.freshnessWindowMs < 1
    ) {
      throw new Error("readiness freshnessWindowMs must be a positive integer");
    }
  }

  async execute(): Promise<VnextReadinessResult> {
    const infrastructure = await this.port.readInfrastructure(
      this.freshnessWindowMs,
    );
    const provider = providerConfigured(this.env);
    const safetyPolicy = safetyPolicyConfig(this.env);
    const syntheticFixtures = fixtureCatalogConfigured(
      this.env,
      safetyPolicy,
    );
    const sessionAdmission = readVnextSessionAdmissionPolicy(this.env).configured;
    const processingBasisControl = new ConfiguredProcessingBasisControlAuthority(
      this.env,
    ).configured;
    const continuousUsePolicy = readContinuousUseIdleResetPolicy(
      this.env,
    ).configured;
    const safetyAppealSealing = new ConfiguredSafetyAppealSealer(
      this.env,
    ).configured;
    const checks = {
      database: infrastructure.database
        ? ("ready" as const)
        : ("database_unavailable" as const),
      creativeWorker: infrastructure.creativeWorker
        ? ("ready" as const)
        : ("creative_worker_unavailable" as const),
      safetyWorker: infrastructure.safetyWorker
        ? ("ready" as const)
        : ("safety_worker_unavailable" as const),
      provider: provider
        ? ("ready" as const)
        : ("provider_configuration_incomplete" as const),
      safetyPolicy: safetyPolicy !== null
        ? ("ready" as const)
        : ("safety_policy_unavailable" as const),
      syntheticFixtures: syntheticFixtures
        ? ("ready" as const)
        : ("synthetic_fixture_catalog_unavailable" as const),
      sessionAdmission: sessionAdmission
        ? ("ready" as const)
        : ("session_admission_unavailable" as const),
      processingBasisControl: processingBasisControl
        ? ("ready" as const)
        : ("processing_basis_control_unavailable" as const),
      continuousUsePolicy: continuousUsePolicy
        ? ("ready" as const)
        : ("continuous_use_policy_unavailable" as const),
      safetyAppealSealing: safetyAppealSealing
        ? ("ready" as const)
        : ("safety_appeal_sealing_unavailable" as const),
      safetyDeadLetter: infrastructure.safetyDeadLetterClear
        ? ("ready" as const)
        : ("safety_dead_letter_present" as const),
    };
    const ready = Object.values(checks).every((value) => value === "ready");
    return {
      status: ready ? "ready" : "not_ready",
      evidenceLevel: "configuration_declaration_only",
      liveProviderEvidence: false,
      escalationEvidence: "runtime_safety_sandbox",
      checks,
    };
  }
}
