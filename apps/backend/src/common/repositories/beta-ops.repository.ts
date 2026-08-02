import { readAppState, writeAppState, type AppState } from "../store.js";

export type BetaSupportCaseRecord = AppState["betaSupportCases"][number];
export type BetaIncidentBroadcastRecord = AppState["betaIncidentBroadcasts"][number];

export interface BetaOpsRepository {
  listSupportCases(): Promise<BetaSupportCaseRecord[]>;
  listSupportCasesByAccount(account_id: string): Promise<BetaSupportCaseRecord[]>;
  findSupportCaseById(case_id: string): Promise<BetaSupportCaseRecord | null>;
  findSupportCaseByOpsCaseId(ops_case_id: string): Promise<BetaSupportCaseRecord | null>;
  saveSupportCase(item: BetaSupportCaseRecord): Promise<BetaSupportCaseRecord>;
  listIncidentBroadcasts(): Promise<BetaIncidentBroadcastRecord[]>;
  findIncidentBroadcastById(incident_id: string): Promise<BetaIncidentBroadcastRecord | null>;
  saveIncidentBroadcast(item: BetaIncidentBroadcastRecord): Promise<BetaIncidentBroadcastRecord>;
}

export function createBetaOpsRepository(): BetaOpsRepository {
  return {
    async listSupportCases() {
      return [...(await readAppState()).betaSupportCases].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
    async listSupportCasesByAccount(account_id) {
      return [...(await readAppState()).betaSupportCases]
        .filter((item) => item.account_id === account_id)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
    async findSupportCaseById(case_id) {
      return (await readAppState()).betaSupportCases.find((item) => item.id === case_id) ?? null;
    },
    async findSupportCaseByOpsCaseId(ops_case_id) {
      return (await readAppState()).betaSupportCases.find((item) => item.ops_case_id === ops_case_id) ?? null;
    },
    async saveSupportCase(item) {
      const state = await readAppState();
      const index = state.betaSupportCases.findIndex((current) => current.id === item.id);

      if (index >= 0) {
        state.betaSupportCases[index] = item;
      } else {
        state.betaSupportCases.push(item);
      }

      await writeAppState(state);
      return item;
    },
    async listIncidentBroadcasts() {
      return [...(await readAppState()).betaIncidentBroadcasts].sort(
        (left, right) => right.updated_at.localeCompare(left.updated_at),
      );
    },
    async findIncidentBroadcastById(incident_id) {
      return (await readAppState()).betaIncidentBroadcasts.find((item) => item.incident_id === incident_id) ?? null;
    },
    async saveIncidentBroadcast(item) {
      const state = await readAppState();
      const index = state.betaIncidentBroadcasts.findIndex((current) => current.incident_id === item.incident_id);

      if (index >= 0) {
        state.betaIncidentBroadcasts[index] = item;
      } else {
        state.betaIncidentBroadcasts.push(item);
      }

      await writeAppState(state);
      return item;
    },
  };
}
