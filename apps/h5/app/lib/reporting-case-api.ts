import type { ReportCaseCreateRequest, ReportCaseListResponse, ReportCaseResponse, TrustLegalSummaryResponse } from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchTrustLegalSummary(): Promise<TrustLegalSummaryResponse> {
  const response = await fetch(`${apiBaseUrl()}/trust/legal`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch trust legal summary");
  }

  const payload = (await response.json()) as { data: TrustLegalSummaryResponse };
  return payload.data;
}

export async function listReportCases(account_token: string): Promise<ReportCaseListResponse> {
  const response = await fetch(`${apiBaseUrl()}/reports/cases?account_token=${encodeURIComponent(account_token)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch report cases");
  }

  const payload = (await response.json()) as { data: ReportCaseListResponse };
  return payload.data;
}

export async function createReportCase(input: ReportCaseCreateRequest): Promise<ReportCaseResponse> {
  const response = await fetch(`${apiBaseUrl()}/reports/cases`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to create report case");
  }

  const payload = (await response.json()) as { data: ReportCaseResponse };
  return payload.data;
}
