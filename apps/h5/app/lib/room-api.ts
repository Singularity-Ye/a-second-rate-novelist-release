import type {
  RoomOverviewRequest,
  RoomOverviewResponse,
  RoomPersonaDetailRequest,
  RoomPersonaDetailResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchRoomOverview(input: RoomOverviewRequest): Promise<RoomOverviewResponse> {
  const searchParams = new URLSearchParams({
    account_token: input.account_token,
  });

  if (input.story_id) {
    searchParams.set("story_id", input.story_id);
  }

  if (input.fallback_target) {
    searchParams.set("fallback_target", input.fallback_target);
  }

  const response = await fetch(`${apiBaseUrl()}/room/overview?${searchParams.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch room overview");
  }

  const payload = (await response.json()) as { data: RoomOverviewResponse };
  return payload.data;
}

export async function fetchRoomPersona(input: RoomPersonaDetailRequest): Promise<RoomPersonaDetailResponse> {
  const searchParams = new URLSearchParams({
    account_token: input.account_token,
  });

  if (input.story_id) {
    searchParams.set("story_id", input.story_id);
  }

  const response = await fetch(`${apiBaseUrl()}/room/persona?${searchParams.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch room persona");
  }

  const payload = (await response.json()) as { data: RoomPersonaDetailResponse };
  return payload.data;
}
