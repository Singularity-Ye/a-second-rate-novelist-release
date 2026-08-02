import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type StoryBranchRecord = AppState["storyBranches"][number];
export type BranchMergeProposalRecord = AppState["branchMergeProposals"][number];

export interface BranchRepository {
  createBranch(input: {
    story_id: string;
    anchor_ref: StoryBranchRecord["anchor_ref"];
    branch_type: string;
    goal: string;
    rights_mode: StoryBranchRecord["rights_mode"];
    merge_status: StoryBranchRecord["merge_status"];
    body_text: string;
    current_branch_chapter_id: string | null;
    created_at?: string;
  }): Promise<StoryBranchRecord>;
  saveBranch(branch: StoryBranchRecord): Promise<StoryBranchRecord>;
  findBranchById(branch_id: string): Promise<StoryBranchRecord | null>;
  findBranchByStoryAndId(story_id: string, branch_id: string): Promise<StoryBranchRecord | null>;
  listBranchesByStory(story_id: string): Promise<StoryBranchRecord[]>;
  createMergeProposal(input: {
    branch_id: string;
    target_story_version_id: string;
    merge_mode: BranchMergeProposalRecord["merge_mode"];
    selected_sections: BranchMergeProposalRecord["selected_sections"];
    status: BranchMergeProposalRecord["status"];
    created_patch_refs: string[];
    created_at?: string;
  }): Promise<BranchMergeProposalRecord>;
  saveMergeProposal(proposal: BranchMergeProposalRecord): Promise<BranchMergeProposalRecord>;
  findMergeProposalById(proposal_id: string): Promise<BranchMergeProposalRecord | null>;
  listMergeProposalsByBranch(branch_id: string): Promise<BranchMergeProposalRecord[]>;
}

export function createBranchRepository(): BranchRepository {
  return {
    async createBranch(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: StoryBranchRecord = {
        id: randomUUID(),
        story_id: input.story_id,
        anchor_ref: input.anchor_ref,
        branch_type: input.branch_type,
        goal: input.goal,
        rights_mode: input.rights_mode,
        merge_status: input.merge_status,
        body_text: input.body_text,
        current_branch_chapter_id: input.current_branch_chapter_id,
        created_at: now,
        updated_at: now,
      };

      state.storyBranches.push(created);
      await writeAppState(state);
      return created;
    },
    async saveBranch(branch) {
      const state = await readAppState();
      const index = state.storyBranches.findIndex((item) => item.id === branch.id);

      if (index >= 0) {
        state.storyBranches[index] = branch;
      } else {
        state.storyBranches.push(branch);
      }

      await writeAppState(state);
      return branch;
    },
    async findBranchById(branch_id) {
      return (await readAppState()).storyBranches.find((item) => item.id === branch_id) ?? null;
    },
    async findBranchByStoryAndId(story_id, branch_id) {
      return (await readAppState()).storyBranches.find((item) => item.story_id === story_id && item.id === branch_id) ?? null;
    },
    async listBranchesByStory(story_id) {
      return (await readAppState()).storyBranches.filter((item) => item.story_id === story_id);
    },
    async createMergeProposal(input) {
      const state = await readAppState();
      const created: BranchMergeProposalRecord = {
        id: randomUUID(),
        branch_id: input.branch_id,
        target_story_version_id: input.target_story_version_id,
        merge_mode: input.merge_mode,
        selected_sections: input.selected_sections,
        status: input.status,
        created_patch_refs: input.created_patch_refs,
        created_at: input.created_at ?? new Date().toISOString(),
      };

      state.branchMergeProposals.push(created);
      await writeAppState(state);
      return created;
    },
    async saveMergeProposal(proposal) {
      const state = await readAppState();
      const index = state.branchMergeProposals.findIndex((item) => item.id === proposal.id);

      if (index >= 0) {
        state.branchMergeProposals[index] = proposal;
      } else {
        state.branchMergeProposals.push(proposal);
      }

      await writeAppState(state);
      return proposal;
    },
    async findMergeProposalById(proposal_id) {
      return (await readAppState()).branchMergeProposals.find((item) => item.id === proposal_id) ?? null;
    },
    async listMergeProposalsByBranch(branch_id) {
      return (await readAppState()).branchMergeProposals.filter((item) => item.branch_id === branch_id);
    },
  };
}
