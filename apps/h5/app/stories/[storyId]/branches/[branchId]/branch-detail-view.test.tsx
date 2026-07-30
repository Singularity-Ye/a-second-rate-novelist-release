import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BranchDetailView } from "./branch-detail-view";
import { createMergeProposal, fetchBranchDetail } from "../../../../lib/branch-api";

vi.mock("next/navigation", () => ({
  useParams: () => ({
    storyId: "story-branch-ui",
    branchId: "branch-branch-ui",
  }),
}));

vi.mock("../../../../lib/branch-api", () => ({
  createMergeProposal: vi.fn().mockResolvedValue({
    proposal_id: "proposal-ui-created",
    status: "draft",
  }),
  acceptMergeProposal: vi.fn().mockResolvedValue({
    status: "accepted",
    created_patch_refs: ["patch-ui-001"],
  }),
  fetchBranchDetail: vi.fn().mockResolvedValue({
    branch: {
      branch_id: "branch-branch-ui",
      story_id: "story-branch-ui",
      anchor_ref: {
        chapter_id: "chapter-branch-ui",
      },
      branch_type: "alt_ending",
      goal: "如果他提前开口。",
      rights_mode: "private_sandbox",
      merge_status: "proposal_ready",
      body_text: "branch body",
      current_branch_chapter_id: "branch-chapter-ui",
    },
    diff_summary: {
      changed_sections: 1,
      summary: "围绕关键场景生成了分支。",
    },
    rights_summary: {
      rights_mode: "private_sandbox",
      export_allowed: false,
    },
    merge_proposals: [
      {
        proposal_id: "proposal-ui",
        branch_id: "branch-branch-ui",
        target_story_version_id: "chapter-branch-ui",
        merge_mode: "selective_patch",
        selected_sections: [{ label: "opening" }],
        status: "draft",
      },
    ],
  }),
}));

describe("branch detail view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a director-style branch detail surface with diff, rights, and proposal actions", async () => {
    render(<BranchDetailView />);

    await waitFor(() => {
      expect(fetchBranchDetail).toHaveBeenCalledWith({
        story_id: "story-branch-ui",
        branch_id: "branch-branch-ui",
      });
    });

    expect(screen.getByTestId("branch-detail-page").textContent).toContain("分支详情");
    expect(screen.getByTestId("branch-detail-page").textContent).toContain("差异摘要");
    expect(screen.getByTestId("branch-detail-page").textContent).toContain("权利边界");
    expect(screen.getByTestId("branch-detail-page").textContent).toContain("只留在私人沙盒");
    expect(screen.getByTestId("branch-merge-proposals").textContent).toContain("draft");

    fireEvent.click(screen.getByRole("button", { name: "提交合并建议" }));

    await waitFor(() => {
      expect(createMergeProposal).toHaveBeenCalled();
    });
  });
});
