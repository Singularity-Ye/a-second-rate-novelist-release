import { randomUUID } from "node:crypto";
import type {
  BranchCreateRequest,
  BranchCreateResponse,
  BranchDetailResponse,
  MergeProposalAcceptRequest,
  MergeProposalAcceptResponse,
  MergeProposalRequest,
  MergeProposalResponse,
} from "@erliu/shared-contracts";
import { createBranchRepository } from "../../common/repositories/branch.repository.js";
import { createChapterRuntimeRepository } from "../../common/repositories/chapter-runtime.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import { assertBranchQuotaAvailable } from "../identity-membership/account-control-plane.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

function isBranchExportAllowed(rightsMode: BranchDetailResponse["branch"]["rights_mode"]) {
  return rightsMode === "original_adaptation";
}

export async function createBranch(input: { story_id: string } & BranchCreateRequest): Promise<BranchCreateResponse> {
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(input.story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${input.story_id}`);
  }

  const chapter = await createChapterRuntimeRepository().findChapterByStoryAndId(input.story_id, input.anchor_ref.chapter_id);

  if (!chapter || chapter.status === "superseded") {
    return {
      branch_id: randomUUID(),
      status: "invalid_anchor",
      error_code: "BRN-101",
    };
  }

  const quotaVerdict = await assertBranchQuotaAvailable(workspace.account_id);

  if (quotaVerdict.status === "blocked") {
    return {
      branch_id: randomUUID(),
      status: "blocked",
      error_code: "BRN-201",
    };
  }

  const now = new Date().toISOString();
  const branch = await createBranchRepository().createBranch({
    story_id: input.story_id,
    anchor_ref: input.anchor_ref,
    branch_type: input.branch_type,
    goal: input.goal,
    rights_mode: input.rights_mode,
    merge_status: "kept_parallel",
    body_text: `${chapter.body_text}\n\n【分支尝试】${input.goal}`,
    current_branch_chapter_id: randomUUID(),
    created_at: now,
  });

  void recordDomainEvent({
    event_name: "branch_created",
    account_id: workspace.account_id,
    payload: {
      story_id: input.story_id,
      branch_id: branch.id,
      chapter_id: input.anchor_ref.chapter_id,
    },
  });

  return {
    branch_id: branch.id,
    status: "branch_ready",
  };
}

export async function getBranchDetail(input: { story_id: string; branch_id: string }): Promise<BranchDetailResponse> {
  const repository = createBranchRepository();
  const branch = await repository.findBranchByStoryAndId(input.story_id, input.branch_id);

  if (!branch) {
    throw new Error(`Branch not found for id ${input.branch_id}`);
  }

  const proposals = (await repository.listMergeProposalsByBranch(branch.id)).map((item) => ({
    proposal_id: item.id,
    branch_id: item.branch_id,
    target_story_version_id: item.target_story_version_id,
    merge_mode: item.merge_mode,
    selected_sections: item.selected_sections,
    status: item.status,
  }));

  return {
    branch: {
      branch_id: branch.id,
      story_id: branch.story_id,
      anchor_ref: branch.anchor_ref,
      branch_type: branch.branch_type,
      goal: branch.goal,
      rights_mode: branch.rights_mode,
      merge_status: branch.merge_status,
      body_text: branch.body_text,
      current_branch_chapter_id: branch.current_branch_chapter_id,
    },
    diff_summary: {
      changed_sections: 1,
      summary: `围绕 ${branch.goal} 生成了一条 ${branch.branch_type} 分支。`,
    },
    rights_summary: {
      rights_mode: branch.rights_mode,
      export_allowed: isBranchExportAllowed(branch.rights_mode),
    },
    merge_proposals: proposals,
  };
}

export async function createMergeProposal(
  input: { branch_id: string } & MergeProposalRequest,
): Promise<MergeProposalResponse> {
  const repository = createBranchRepository();
  const branch = await repository.findBranchById(input.branch_id);

  if (!branch) {
    throw new Error(`Branch not found for id ${input.branch_id}`);
  }

  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(branch.story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for branch ${input.branch_id}`);
  }

  const mainlineVersionId = await resolveMainlineVersionId(branch.story_id, workspace);

  if (!mainlineVersionId || mainlineVersionId !== input.target_story_version_id) {
    return {
      proposal_id: randomUUID(),
      status: "conflicted",
      error_code: "BRN-102",
    };
  }

  const proposal = await repository.createMergeProposal({
    branch_id: branch.id,
    target_story_version_id: input.target_story_version_id,
    merge_mode: input.merge_mode,
    selected_sections: input.selected_sections ?? [],
    status: "draft",
    created_patch_refs: [],
    created_at: new Date().toISOString(),
  });
  branch.merge_status = "proposal_ready";
  branch.updated_at = new Date().toISOString();
  await repository.saveBranch(branch);

  void recordDomainEvent({
    event_name: "branch_merge_proposed",
    account_id: workspace.account_id,
    payload: {
      story_id: branch.story_id,
      branch_id: branch.id,
      proposal_id: proposal.id,
    },
  });

  return {
    proposal_id: proposal.id,
    status: "draft",
  };
}

export async function acceptMergeProposal(
  input: { branch_id: string; proposal_id: string } & MergeProposalAcceptRequest,
): Promise<MergeProposalAcceptResponse> {
  const repository = createBranchRepository();
  const branch = await repository.findBranchById(input.branch_id);
  const proposal = await repository.findMergeProposalById(input.proposal_id);

  if (!branch || !proposal || proposal.branch_id !== input.branch_id) {
    throw new Error(`Merge proposal not found for branch ${input.branch_id}`);
  }

  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(branch.story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for branch ${input.branch_id}`);
  }

  const mainlineVersionId = await resolveMainlineVersionId(branch.story_id, workspace);

  if (
    !mainlineVersionId ||
    mainlineVersionId !== input.target_story_version_id ||
    proposal.target_story_version_id !== mainlineVersionId
  ) {
    proposal.status = "conflicted";
    await repository.saveMergeProposal(proposal);
    return {
      status: "conflicted",
      error_code: "BRN-102",
      created_patch_refs: [],
    };
  }

  const patchRef = randomUUID();
  proposal.status = "accepted";
  proposal.created_patch_refs = [patchRef];
  branch.merge_status = "merged";
  branch.updated_at = new Date().toISOString();
  await repository.saveMergeProposal(proposal);
  await repository.saveBranch(branch);

  void recordDomainEvent({
    event_name: "branch_merged",
    account_id: workspace.account_id,
    payload: {
      story_id: branch.story_id,
      branch_id: branch.id,
      proposal_id: proposal.id,
    },
  });

  return {
    status: "accepted",
    created_patch_refs: [patchRef],
  };
}

async function resolveMainlineVersionId(
  story_id: string,
  workspace: Awaited<ReturnType<ReturnType<typeof createStoryWorkspaceRepository>["findWorkspaceById"]>> | null,
) {
  if (workspace?.current_chapter_id) {
    return workspace.current_chapter_id;
  }

  const latestChapter = (await createChapterRuntimeRepository().listChaptersByStory(story_id))
    .filter((item) => item.status !== "superseded")
    .sort((left, right) => {
      if (right.chapter_no !== left.chapter_no) {
        return right.chapter_no - left.chapter_no;
      }

      return right.updated_at.localeCompare(left.updated_at);
    })[0];

  return latestChapter?.id ?? null;
}
