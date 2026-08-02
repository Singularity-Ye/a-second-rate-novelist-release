import type { StoryCenterDetailResponse, StoryCenterListResponse } from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchStoryCenter(account_token: string): Promise<StoryCenterListResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories?account_token=${encodeURIComponent(account_token)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch story center");
  }

  const payload = (await response.json()) as { data: StoryCenterListResponse };
  return payload.data;
}

export async function fetchStoryCenterDetail(input: {
  account_token: string;
  story_id: string;
}): Promise<StoryCenterDetailResponse> {
  const response = await fetch(
    `${apiBaseUrl()}/stories/${encodeURIComponent(input.story_id)}?account_token=${encodeURIComponent(input.account_token)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch story detail");
  }

  const payload = (await response.json()) as { data: StoryCenterDetailResponse };
  return payload.data;
}
