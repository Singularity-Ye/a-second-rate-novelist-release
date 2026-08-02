import type { BetaSupportCaseCreateRequest, BetaSupportCaseResponse, BetaSupportOverviewResponse } from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchBetaSupportOverview(account_token: string): Promise<BetaSupportOverviewResponse> {
  const response = await fetch(`${apiBaseUrl()}/beta/support/overview?account_token=${encodeURIComponent(account_token)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch beta support overview");
  }

  const payload = (await response.json()) as { data: BetaSupportOverviewResponse };
  return payload.data;
}

export async function createBetaSupportCase(input: BetaSupportCaseCreateRequest): Promise<BetaSupportCaseResponse> {
  const response = await fetch(`${apiBaseUrl()}/beta/support/cases`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to create beta support case");
  }

  const payload = (await response.json()) as { data: BetaSupportCaseResponse };
  return payload.data;
}
