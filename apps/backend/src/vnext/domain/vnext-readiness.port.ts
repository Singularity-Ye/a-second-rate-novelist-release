export const VNEXT_READINESS_PORT = Symbol("VNEXT_READINESS_PORT");

export interface VnextInfrastructureReadiness {
  readonly database: boolean;
  readonly creativeWorker: boolean;
  readonly safetyWorker: boolean;
  readonly safetyDeadLetterClear: boolean;
}

export interface VnextReadinessPort {
  readInfrastructure(freshnessWindowMs: number): Promise<VnextInfrastructureReadiness>;
}

export interface VnextReadinessResult {
  readonly status: "ready" | "not_ready";
  readonly evidenceLevel: "configuration_declaration_only";
  readonly liveProviderEvidence: false;
  readonly escalationEvidence: "runtime_safety_sandbox";
  readonly checks: {
    readonly database: "ready" | "database_unavailable";
    readonly creativeWorker: "ready" | "creative_worker_unavailable";
    readonly safetyWorker: "ready" | "safety_worker_unavailable";
    readonly provider: "ready" | "provider_configuration_incomplete";
    readonly safetyPolicy: "ready" | "safety_policy_unavailable";
    readonly syntheticFixtures: "ready" | "synthetic_fixture_catalog_unavailable";
    readonly sessionAdmission: "ready" | "session_admission_unavailable";
    readonly processingBasisControl:
      | "ready"
      | "processing_basis_control_unavailable";
    readonly continuousUsePolicy:
      | "ready"
      | "continuous_use_policy_unavailable";
    readonly safetyAppealSealing:
      | "ready"
      | "safety_appeal_sealing_unavailable";
    readonly safetyDeadLetter: "ready" | "safety_dead_letter_present";
  };
}
