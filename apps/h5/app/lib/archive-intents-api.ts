import type {
  ArchiveIntentListResponse,
  IntentCorrectionRequest,
  IntentCorrectionResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

function resolveErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    Array.isArray(payload.message)
  ) {
    return payload.message.join(", ");
  }

  return fallback;
}

export async function fetchArchiveIntents(account_token: string): Promise<ArchiveIntentListResponse> {
  const response = await fetch(
    `${apiBaseUrl()}/archive/intents?account_token=${encodeURIComponent(account_token)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as unknown;
    throw new Error(resolveErrorMessage(errorPayload, "Failed to fetch archive intents"));
  }

  const payload = (await response.json()) as { data: ArchiveIntentListResponse };
  return payload.data;
}

export async function correctArchiveIntent(
  input: IntentCorrectionRequest,
): Promise<IntentCorrectionResponse> {
  const response = await fetch(`${apiBaseUrl()}/archive/intents/${input.intent_id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      new_target_type: input.new_target_type,
      new_target_id: input.new_target_id,
      patch_document: input.patch_document,
      client_request_id: input.client_request_id,
    }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as unknown;
    throw new Error(resolveErrorMessage(errorPayload, "Failed to correct archive intent"));
  }

  const payload = (await response.json()) as { data: IntentCorrectionResponse };
  return payload.data;
}
