import { readAppState, writeAppState, type AppState } from "../store.js";

export type ReportCaseRecord = AppState["reportCases"][number];

export interface ReportingCaseRepository {
  createReportCase(input: ReportCaseRecord): Promise<ReportCaseRecord>;
  saveReportCase(report_case: ReportCaseRecord): Promise<ReportCaseRecord>;
  findReportCaseById(case_id: string): Promise<ReportCaseRecord | null>;
  findReportCaseByOpsCaseId(ops_case_id: string): Promise<ReportCaseRecord | null>;
  listReportCasesByAccount(account_id: string): Promise<ReportCaseRecord[]>;
}

export function createReportingCaseRepository(): ReportingCaseRepository {
  return {
    async createReportCase(input) {
      const state = await readAppState();
      state.reportCases.push(input);
      await writeAppState(state);
      return input;
    },
    async saveReportCase(report_case) {
      const state = await readAppState();
      const index = state.reportCases.findIndex((item) => item.id === report_case.id);

      if (index >= 0) {
        state.reportCases[index] = report_case;
      } else {
        state.reportCases.push(report_case);
      }

      await writeAppState(state);
      return report_case;
    },
    async findReportCaseById(case_id) {
      return (await readAppState()).reportCases.find((item) => item.id === case_id) ?? null;
    },
    async findReportCaseByOpsCaseId(ops_case_id) {
      return (await readAppState()).reportCases.find((item) => item.ops_case_id === ops_case_id) ?? null;
    },
    async listReportCasesByAccount(account_id) {
      return [...(await readAppState()).reportCases]
        .filter((item) => item.account_id === account_id)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
  };
}
