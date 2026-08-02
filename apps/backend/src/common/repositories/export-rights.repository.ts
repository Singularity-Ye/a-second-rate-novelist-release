import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type RiskCheckRecord = AppState["riskChecks"][number];
export type RiskReportRecord = AppState["riskReports"][number];
export type ExportJobRecord = AppState["exportJobs"][number];
export type ExportArtifactRecord = AppState["exportArtifacts"][number];
export type EvidencePackRecord = AppState["evidencePacks"][number];
export type DeliveryManifestRecord = AppState["deliveryManifests"][number];
export type LabelWaiverRequestRecord = AppState["labelWaiverRequests"][number];
export type NotificationRecord = AppState["notifications"][number];

export interface ExportRightsRepository {
  createRiskCheck(input: Omit<RiskCheckRecord, "id">): Promise<RiskCheckRecord>;
  findRiskCheckById(risk_check_id: string): Promise<RiskCheckRecord | null>;
  findRiskCheckByStoryAndId(story_id: string, risk_check_id: string): Promise<RiskCheckRecord | null>;
  getLatestRiskCheckByStory(story_id: string): Promise<RiskCheckRecord | null>;
  createRiskReport(input: Omit<RiskReportRecord, "id">): Promise<RiskReportRecord>;
  findRiskReportByRiskCheckId(risk_check_id: string): Promise<RiskReportRecord | null>;
  createExportJob(input: Omit<ExportJobRecord, "id">): Promise<ExportJobRecord>;
  saveExportJob(job: ExportJobRecord): Promise<ExportJobRecord>;
  findExportJobById(job_id: string): Promise<ExportJobRecord | null>;
  findExportJobByStoryAndId(story_id: string, job_id: string): Promise<ExportJobRecord | null>;
  listExportJobsByStory(story_id: string): Promise<ExportJobRecord[]>;
  createExportArtifact(input: Omit<ExportArtifactRecord, "id">): Promise<ExportArtifactRecord>;
  findExportArtifactById(artifact_id: string): Promise<ExportArtifactRecord | null>;
  listExportArtifactsByJob(job_id: string): Promise<ExportArtifactRecord[]>;
  createEvidencePack(input: Omit<EvidencePackRecord, "id">): Promise<EvidencePackRecord>;
  findEvidencePackById(pack_id: string): Promise<EvidencePackRecord | null>;
  findEvidencePackByStoryAndId(story_id: string, pack_id: string): Promise<EvidencePackRecord | null>;
  listEvidencePacksByStory(story_id: string): Promise<EvidencePackRecord[]>;
  createDeliveryManifest(input: Omit<DeliveryManifestRecord, "id">): Promise<DeliveryManifestRecord>;
  saveDeliveryManifest(manifest: DeliveryManifestRecord): Promise<DeliveryManifestRecord>;
  findDeliveryManifestByJobId(export_job_id: string): Promise<DeliveryManifestRecord | null>;
  createLabelWaiverRequest(input: Omit<LabelWaiverRequestRecord, "id">): Promise<LabelWaiverRequestRecord>;
  findLabelWaiverRequestById(waiver_request_id: string): Promise<LabelWaiverRequestRecord | null>;
  findLabelWaiverRequestByExportJobId(export_job_id: string): Promise<LabelWaiverRequestRecord | null>;
  createNotification(input: Omit<NotificationRecord, "id">): Promise<NotificationRecord>;
}

function sortNewestFirst<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function createExportRightsRepository(): ExportRightsRepository {
  return {
    async createRiskCheck(input) {
      const state = await readAppState();
      const created: RiskCheckRecord = {
        id: randomUUID(),
        ...input,
      };

      state.riskChecks.push(created);
      await writeAppState(state);
      return created;
    },
    async findRiskCheckById(risk_check_id) {
      return (await readAppState()).riskChecks.find((item) => item.id === risk_check_id) ?? null;
    },
    async findRiskCheckByStoryAndId(story_id, risk_check_id) {
      return (await readAppState()).riskChecks.find((item) => item.story_id === story_id && item.id === risk_check_id) ?? null;
    },
    async getLatestRiskCheckByStory(story_id) {
      return sortNewestFirst((await readAppState()).riskChecks.filter((item) => item.story_id === story_id))[0] ?? null;
    },
    async createRiskReport(input) {
      const state = await readAppState();
      const created: RiskReportRecord = {
        id: randomUUID(),
        ...input,
      };

      state.riskReports.push(created);
      await writeAppState(state);
      return created;
    },
    async findRiskReportByRiskCheckId(risk_check_id) {
      return (await readAppState()).riskReports.find((item) => item.risk_check_id === risk_check_id) ?? null;
    },
    async createExportJob(input) {
      const state = await readAppState();
      const created: ExportJobRecord = {
        id: randomUUID(),
        ...input,
      };

      state.exportJobs.push(created);
      await writeAppState(state);
      return created;
    },
    async saveExportJob(job) {
      const state = await readAppState();
      const index = state.exportJobs.findIndex((item) => item.id === job.id);

      if (index >= 0) {
        state.exportJobs[index] = job;
      } else {
        state.exportJobs.push(job);
      }

      await writeAppState(state);
      return job;
    },
    async findExportJobById(job_id) {
      return (await readAppState()).exportJobs.find((item) => item.id === job_id) ?? null;
    },
    async findExportJobByStoryAndId(story_id, job_id) {
      return (await readAppState()).exportJobs.find((item) => item.story_id === story_id && item.id === job_id) ?? null;
    },
    async listExportJobsByStory(story_id) {
      return sortNewestFirst((await readAppState()).exportJobs.filter((item) => item.story_id === story_id));
    },
    async createExportArtifact(input) {
      const state = await readAppState();
      const created: ExportArtifactRecord = {
        id: randomUUID(),
        ...input,
      };

      state.exportArtifacts.push(created);
      await writeAppState(state);
      return created;
    },
    async findExportArtifactById(artifact_id) {
      return (await readAppState()).exportArtifacts.find((item) => item.id === artifact_id) ?? null;
    },
    async listExportArtifactsByJob(job_id) {
      return (await readAppState()).exportArtifacts.filter((item) => item.export_job_id === job_id);
    },
    async createEvidencePack(input) {
      const state = await readAppState();
      const created: EvidencePackRecord = {
        id: randomUUID(),
        ...input,
      };

      state.evidencePacks.push(created);
      await writeAppState(state);
      return created;
    },
    async findEvidencePackById(pack_id) {
      return (await readAppState()).evidencePacks.find((item) => item.id === pack_id) ?? null;
    },
    async findEvidencePackByStoryAndId(story_id, pack_id) {
      return (await readAppState()).evidencePacks.find((item) => item.story_id === story_id && item.id === pack_id) ?? null;
    },
    async listEvidencePacksByStory(story_id) {
      return sortNewestFirst((await readAppState()).evidencePacks.filter((item) => item.story_id === story_id));
    },
    async createDeliveryManifest(input) {
      const state = await readAppState();
      const created: DeliveryManifestRecord = {
        id: randomUUID(),
        ...input,
      };

      state.deliveryManifests.push(created);
      await writeAppState(state);
      return created;
    },
    async saveDeliveryManifest(manifest) {
      const state = await readAppState();
      const index = state.deliveryManifests.findIndex((item) => item.id === manifest.id);

      if (index >= 0) {
        state.deliveryManifests[index] = manifest;
      } else {
        state.deliveryManifests.push(manifest);
      }

      await writeAppState(state);
      return manifest;
    },
    async findDeliveryManifestByJobId(export_job_id) {
      return (await readAppState()).deliveryManifests.find((item) => item.export_job_id === export_job_id) ?? null;
    },
    async createLabelWaiverRequest(input) {
      const state = await readAppState();
      const created: LabelWaiverRequestRecord = {
        id: randomUUID(),
        ...input,
      };

      state.labelWaiverRequests.push(created);
      await writeAppState(state);
      return created;
    },
    async findLabelWaiverRequestById(waiver_request_id) {
      return (await readAppState()).labelWaiverRequests.find((item) => item.id === waiver_request_id) ?? null;
    },
    async findLabelWaiverRequestByExportJobId(export_job_id) {
      return sortNewestFirst(
        (await readAppState()).labelWaiverRequests.filter((item) => item.export_job_id === export_job_id),
      )[0] ?? null;
    },
    async createNotification(input) {
      const state = await readAppState();
      const created: NotificationRecord = {
        id: randomUUID(),
        ...input,
      };

      state.notifications.push(created);
      await writeAppState(state);
      return created;
    },
  };
}
