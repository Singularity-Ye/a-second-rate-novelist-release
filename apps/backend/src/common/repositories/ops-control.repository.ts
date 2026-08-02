import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";
import { readEnvironmentRegistryCatalog } from "../../modules/ops-console/environment-registry.js";

export type OpsCaseRecord = AppState["opsCases"][number];
export type ReviewDecisionRecord = AppState["reviewDecisions"][number];
export type OpsAuditLogRecord = AppState["opsAuditLogs"][number];
export type EnvironmentRegistryRecord = AppState["environmentRegistry"][number];
export type ReleaseCandidateRecord = AppState["releaseCandidates"][number];
export type DeploymentRunRecord = AppState["deploymentRuns"][number];
export type BackupSnapshotRecord = AppState["backupSnapshots"][number];
export type RestoreDrillRecord = AppState["restoreDrills"][number];
export type AlertIncidentRecord = AppState["alertIncidents"][number];

export interface OpsControlRepository {
  readOpsViewState(): Promise<AppState>;
  ensureReleaseStateInitialized(): Promise<AppState>;
  findOpsCaseById(case_id: string): Promise<OpsCaseRecord | null>;
  createOpsCase(input: Omit<OpsCaseRecord, "id">): Promise<OpsCaseRecord>;
  saveOpsCase(ops_case: OpsCaseRecord): Promise<OpsCaseRecord>;
  listOpsCases(): Promise<OpsCaseRecord[]>;
  createReviewDecision(input: Omit<ReviewDecisionRecord, "id">): Promise<ReviewDecisionRecord>;
  createOpsAuditLog(input: Omit<OpsAuditLogRecord, "id">): Promise<OpsAuditLogRecord>;
  listEnvironmentRegistry(): Promise<EnvironmentRegistryRecord[]>;
  saveEnvironment(environment: EnvironmentRegistryRecord): Promise<EnvironmentRegistryRecord>;
  createReleaseCandidate(input: Omit<ReleaseCandidateRecord, "release_id">): Promise<ReleaseCandidateRecord>;
  findReleaseCandidateById(release_id: string): Promise<ReleaseCandidateRecord | null>;
  listReleaseCandidates(): Promise<ReleaseCandidateRecord[]>;
  createDeploymentRun(input: Omit<DeploymentRunRecord, "deployment_id">): Promise<DeploymentRunRecord>;
  listDeploymentRuns(): Promise<DeploymentRunRecord[]>;
  listBackupSnapshots(): Promise<BackupSnapshotRecord[]>;
  findBackupSnapshotById(snapshot_id: string): Promise<BackupSnapshotRecord | null>;
  saveBackupSnapshot(snapshot: BackupSnapshotRecord): Promise<BackupSnapshotRecord>;
  createRestoreDrill(input: Omit<RestoreDrillRecord, "drill_id">): Promise<RestoreDrillRecord>;
  listRestoreDrills(): Promise<RestoreDrillRecord[]>;
  createAlertIncident(input: Omit<AlertIncidentRecord, "incident_id">): Promise<AlertIncidentRecord>;
  listAlertIncidents(): Promise<AlertIncidentRecord[]>;
}

function seedReleaseState(state: AppState) {
  const environmentCatalog = readEnvironmentRegistryCatalog();

  if (state.environmentRegistry.length === 0) {
    const now = new Date().toISOString();
    state.environmentRegistry.push(
      ...environmentCatalog.map((item) => ({
        environment_key: item.environment_key,
        domain: item.domain,
        release_version: `seed-${item.environment_key}`,
        health_status: "healthy" as const,
        blockers: [],
        artifact_channel: item.artifact_channel,
        secret_scope: item.environment_key,
        last_deploy_at: now,
      })),
    );
  } else {
    for (const environment of state.environmentRegistry) {
      const catalogItem = environmentCatalog.find((item) => item.environment_key === environment.environment_key);
      if (!catalogItem) {
        continue;
      }

      environment.domain = catalogItem.domain;
      environment.artifact_channel = catalogItem.artifact_channel;
      environment.secret_scope = catalogItem.environment_key;
    }
  }

  if (state.backupSnapshots.length === 0) {
    const now = new Date().toISOString();
    const retained_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const environment of ["shared-dev", "staging", "live"] as const) {
      for (const snapshot_type of ["database", "object_storage", "secrets"] as const) {
        state.backupSnapshots.push({
          snapshot_id: randomUUID(),
          environment_key: environment,
          snapshot_type,
          status: "completed",
          verified_at: now,
          retained_until,
          created_at: now,
        });
      }
    }
  }
}

export function createOpsControlRepository(): OpsControlRepository {
  return {
    async readOpsViewState() {
      const state = await readAppState();
      seedReleaseState(state);
      return structuredClone(state);
    },
    async ensureReleaseStateInitialized() {
      const state = await readAppState();
      seedReleaseState(state);
      await writeAppState(state);
      return state;
    },
    async findOpsCaseById(case_id) {
      return (await readAppState()).opsCases.find((item) => item.id === case_id) ?? null;
    },
    async createOpsCase(input) {
      const state = await readAppState();
      const created: OpsCaseRecord = {
        id: randomUUID(),
        ...input,
      };

      state.opsCases.push(created);
      await writeAppState(state);
      return created;
    },
    async saveOpsCase(ops_case) {
      const state = await readAppState();
      const index = state.opsCases.findIndex((item) => item.id === ops_case.id);

      if (index >= 0) {
        state.opsCases[index] = ops_case;
      } else {
        state.opsCases.push(ops_case);
      }

      await writeAppState(state);
      return ops_case;
    },
    async listOpsCases() {
      return (await readAppState()).opsCases;
    },
    async createReviewDecision(input) {
      const state = await readAppState();
      const created: ReviewDecisionRecord = {
        id: randomUUID(),
        ...input,
      };

      state.reviewDecisions.push(created);
      await writeAppState(state);
      return created;
    },
    async createOpsAuditLog(input) {
      const state = await readAppState();
      const created: OpsAuditLogRecord = {
        id: randomUUID(),
        ...input,
      };

      state.opsAuditLogs.push(created);
      await writeAppState(state);
      return created;
    },
    async listEnvironmentRegistry() {
      return (await readAppState()).environmentRegistry;
    },
    async saveEnvironment(environment) {
      const state = await readAppState();
      const index = state.environmentRegistry.findIndex((item) => item.environment_key === environment.environment_key);

      if (index >= 0) {
        state.environmentRegistry[index] = environment;
      } else {
        state.environmentRegistry.push(environment);
      }

      await writeAppState(state);
      return environment;
    },
    async createReleaseCandidate(input) {
      const state = await readAppState();
      const created: ReleaseCandidateRecord = {
        release_id: randomUUID(),
        ...input,
      };

      state.releaseCandidates.push(created);
      await writeAppState(state);
      return created;
    },
    async findReleaseCandidateById(release_id) {
      return (await readAppState()).releaseCandidates.find((item) => item.release_id === release_id) ?? null;
    },
    async listReleaseCandidates() {
      return [...(await readAppState()).releaseCandidates].sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    async createDeploymentRun(input) {
      const state = await readAppState();
      const created: DeploymentRunRecord = {
        deployment_id: randomUUID(),
        ...input,
      };

      state.deploymentRuns.push(created);
      await writeAppState(state);
      return created;
    },
    async listDeploymentRuns() {
      return [...(await readAppState()).deploymentRuns].sort((left, right) => right.started_at.localeCompare(left.started_at));
    },
    async listBackupSnapshots() {
      return [...(await readAppState()).backupSnapshots].sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    async findBackupSnapshotById(snapshot_id) {
      return (await readAppState()).backupSnapshots.find((item) => item.snapshot_id === snapshot_id) ?? null;
    },
    async saveBackupSnapshot(snapshot) {
      const state = await readAppState();
      const index = state.backupSnapshots.findIndex((item) => item.snapshot_id === snapshot.snapshot_id);

      if (index >= 0) {
        state.backupSnapshots[index] = snapshot;
      } else {
        state.backupSnapshots.push(snapshot);
      }

      await writeAppState(state);
      return snapshot;
    },
    async createRestoreDrill(input) {
      const state = await readAppState();
      const created: RestoreDrillRecord = {
        drill_id: randomUUID(),
        ...input,
      };

      state.restoreDrills.push(created);
      await writeAppState(state);
      return created;
    },
    async listRestoreDrills() {
      return [...(await readAppState()).restoreDrills].sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    async createAlertIncident(input) {
      const state = await readAppState();
      const created: AlertIncidentRecord = {
        incident_id: randomUUID(),
        ...input,
      };

      state.alertIncidents.push(created);
      await writeAppState(state);
      return created;
    },
    async listAlertIncidents() {
      return (await readAppState()).alertIncidents;
    },
  };
}
