import type {
  StoryIntakeSessionResponse,
  StoryProposalAcceptResponse,
  StoryProposalGenerateResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function createIntakeSession(input: {
  account_token: string;
  entry_surface: "chat" | "room" | "story_list";
  intake_mode: "has_setting" | "only_feeling" | "repair_line" | "pitch_me";
  brief_payload: Record<string, unknown>;
  client_request_id: string;
}) {
  const response = await fetch(`${apiBaseUrl()}/stories/intake-sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to create intake session");
  }

  const payload = (await response.json()) as { data: StoryIntakeSessionResponse };
  return payload.data;
}

export async function generateStoryProposals(input: {
  session_id: string;
  client_request_id: string;
}) {
  const response = await fetch(
    `${apiBaseUrl()}/stories/intake-sessions/${encodeURIComponent(input.session_id)}/proposals/generate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_request_id: input.client_request_id,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to generate proposals");
  }

  const payload = (await response.json()) as { data: StoryProposalGenerateResponse };
  return payload.data;
}

export async function acceptStoryProposal(input: {
  proposal_id: string;
  commission_adjustments?: Record<string, unknown>;
  launch_first_chapter: boolean;
  client_request_id: string;
}) {
  const response = await fetch(
    `${apiBaseUrl()}/stories/proposals/${encodeURIComponent(input.proposal_id)}/accept`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        commission_adjustments: input.commission_adjustments,
        launch_first_chapter: input.launch_first_chapter,
        client_request_id: input.client_request_id,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to accept story proposal");
  }

  const payload = (await response.json()) as { data: StoryProposalAcceptResponse };
  return payload.data;
}
