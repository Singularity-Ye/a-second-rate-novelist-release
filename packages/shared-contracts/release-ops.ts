export type OpsEnvironmentKey = "shared-dev" | "staging" | "live";

export type OpsEnvironmentHealthStatus = "healthy" | "degraded" | "maintenance" | "blocked";

export type OpsDeploymentStatus = "planned" | "running" | "verifying" | "succeeded" | "failed" | "rolled_back";

export type OpsBackupSnapshotStatus = "scheduled" | "running" | "completed" | "failed" | "expired";

export interface OpsEnvironmentsResponse {
  items: Array<{
    environment_key: OpsEnvironmentKey;
    domain: string;
    release_version: string;
    health_status: OpsEnvironmentHealthStatus;
    last_deploy_at: string | null;
    blockers: string[];
  }>;
}

export interface OpsReleasesResponse {
  releases: Array<{
    release_id: string;
    artifact_sha: string;
    artifact_uri: string;
    source_commit_sha: string;
    target_environment: OpsEnvironmentKey;
    change_summary: string;
    status: "planned";
    created_at: string;
  }>;
  deployments: Array<{
    deployment_id: string;
    release_id: string;
    from_environment: OpsEnvironmentKey;
    to_environment: OpsEnvironmentKey;
    status: OpsDeploymentStatus;
    verification_result: "pending" | "passed" | "failed";
    migration_status: "pending" | "succeeded" | "failed" | "restored";
    started_at: string;
    completed_at: string | null;
  }>;
}

export interface OpsReleaseCreateResponse {
  release_id: string;
  status: "planned";
  verification_plan_id: string;
}

export interface OpsReleasePromoteResponse {
  deployment_id: string;
  status: "running" | "verifying" | "failed";
  started_at: string;
}

export interface OpsReleaseRollbackResponse {
  deployment_id: string;
  status: "running";
  estimated_complete_at: string | null;
}

export interface OpsBackupsResponse {
  snapshots: Array<{
    snapshot_id: string;
    environment_key: OpsEnvironmentKey;
    snapshot_type: "database" | "object_storage" | "secrets" | "logs_archive";
    status: OpsBackupSnapshotStatus;
    verified_at: string | null;
    retained_until: string;
  }>;
  latest_restore_drill: {
    drill_id: string;
    snapshot_id: string;
    environment_key: OpsEnvironmentKey;
    drill_type: "db_only" | "db_and_object_storage" | "full_stack";
    status: "running" | "completed" | "failed";
    result: "passed" | "failed" | null;
    rto_minutes: number | null;
    notes: string;
  } | null;
}

export interface OpsRestoreDrillResponse {
  drill_id: string;
  status: "running" | "completed" | "failed";
  expected_rto_minutes: number;
}
