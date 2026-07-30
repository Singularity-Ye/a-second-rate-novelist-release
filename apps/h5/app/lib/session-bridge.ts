import type {
  DeepLinkExchangeResponse,
  DeepLinkIssueRequest,
  DeepLinkIssueResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function issueSessionToken(input: DeepLinkIssueRequest): Promise<DeepLinkIssueResponse> {
  const response = await fetch(`${apiBaseUrl()}/internal/session/issue`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to issue session token");
  }

  const payload = (await response.json()) as {
    data: DeepLinkIssueResponse;
  };

  return payload.data;
}

export async function exchangeSessionToken(token: string): Promise<DeepLinkExchangeResponse> {
  const response = await fetch(`${apiBaseUrl()}/internal/session/exchange`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to exchange session token");
  }

  const payload = (await response.json()) as {
    data: DeepLinkExchangeResponse;
  };

  return payload.data;
}
