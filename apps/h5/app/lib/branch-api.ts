import type {
  BranchCreateRequest,
  BranchCreateResponse,
  BranchDetailResponse,
  MergeProposalAcceptResponse,
  MergeProposalRequest,
  MergeProposalResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function createBranch(input: {
  story_id: string;
} & BranchCreateRequest): Promise<BranchCreateResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${input.story_id}/branches`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      anchor_ref: input.anchor_ref,
      branch_type: input.branch_type,
      goal: input.goal,
      rights_mode: input.rights_mode,
      client_request_id: input.client_request_id,
    }),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error("Failed to create branch");
  }

  const payload = (await response.json()) as { data: BranchCreateResponse };
  return payload.data;
}

export async function fetchBranchDetail(input: {
  story_id: string;
  branch_id: string;
}): Promise<BranchDetailResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${input.story_id}/branches/${input.branch_id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch branch detail");
  }

  const payload = (await response.json()) as { data: BranchDetailResponse };
  return payload.data;
}

export async function createMergeProposal(input: {
  branch_id: string;
} & MergeProposalRequest): Promise<MergeProposalResponse> {
  const response = await fetch(`${apiBaseUrl()}/branches/${input.branch_id}/merge-proposals`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      target_story_version_id: input.target_story_version_id,
      merge_mode: input.merge_mode,
      selected_sections: input.selected_sections,
      client_request_id: input.client_request_id,
    }),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error("Failed to create merge proposal");
  }

  const payload = (await response.json()) as { data: MergeProposalResponse };
  return payload.data;
}

export async function acceptMergeProposal(input: {
  branch_id: string;
  proposal_id: string;
  target_story_version_id: string;
  client_request_id: string;
}): Promise<MergeProposalAcceptResponse> {
  const response = await fetch(
    `${apiBaseUrl()}/branches/${input.branch_id}/merge-proposals/${input.proposal_id}/accept`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        target_story_version_id: input.target_story_version_id,
        client_request_id: input.client_request_id,
      }),
    },
  );

  if (!response.ok && response.status !== 409) {
    throw new Error("Failed to accept merge proposal");
  }

  const payload = (await response.json()) as { data: MergeProposalAcceptResponse };
  return payload.data;
}
