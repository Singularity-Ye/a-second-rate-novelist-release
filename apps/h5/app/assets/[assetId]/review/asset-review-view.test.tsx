import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetReviewView } from "./asset-review-view";
import { confirmReferenceAsset, fetchReferenceAssetDetail } from "../../../lib/assets-api";

const useParamsMock = vi.fn(() => ({
  assetId: "asset-ui-001",
}));

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
  useSearchParams: () => new URLSearchParams("account_token=wx-openid-assets-ui&story_id=story-ui-001"),
}));

vi.mock("../../../lib/assets-api", () => ({
  confirmReferenceAsset: vi.fn().mockResolvedValue({
    asset_id: "asset-ui-001",
    status: "ready",
  }),
  fetchReferenceAssetDetail: vi.fn(),
}));

const defaultAssetDetail = {
  asset: {
    asset_id: "asset-ui-001",
    account_id: "account-ui-001",
    story_id: "story-ui-001",
    scope: "story",
    file_name: "station-moodboard.pdf",
    mime_type: "application/pdf",
    extract_status: "ready",
  },
  scope_label: "当前故事资料库",
  available_story_targets: [
    {
      story_id: "story-ui-001",
      label: "雨夜列车",
      workspace_status: "active",
      availability: "available",
      reason: null,
    },
    {
      story_id: "story-ui-002",
      label: "月台回声",
      workspace_status: "active",
      availability: "blocked",
      reason: "故事型资料只能留在它自己的故事里。",
    },
  ],
  extract_results: [
    {
      extract_ref_id: "extract-ui-001",
      extract_type: "style",
      status: "accepted",
    },
    {
      extract_ref_id: "extract-ui-002",
      extract_type: "character",
      status: "accepted",
    },
  ],
  attachments: [
    {
      attachment_id: "attachment-ui-001",
      asset_id: "asset-ui-001",
      target_type: "story",
      target_id: "story-ui-001",
      target_label: "雨夜列车",
      usage_mode: "style",
      status: "active",
    },
  ],
  revoke_impact: {
    affected_attachment_ids: ["attachment-ui-001"],
    affected_story_targets: [
      {
        story_id: "story-ui-001",
        label: "雨夜列车",
        attachment_count: 1,
      },
    ],
    affected_references: [
      {
        attachment_id: "attachment-ui-001",
        target_type: "story",
        target_id: "story-ui-001",
        target_label: "雨夜列车",
        usage_mode: "style",
      },
    ],
  },
};

describe("asset review view", () => {
  beforeEach(() => {
    vi.mocked(confirmReferenceAsset).mockReset();
    vi.mocked(confirmReferenceAsset).mockResolvedValue({
      asset_id: "asset-ui-001",
      status: "ready",
    });
    vi.mocked(fetchReferenceAssetDetail).mockReset();
    vi.mocked(fetchReferenceAssetDetail).mockResolvedValue(defaultAssetDetail);
  });

  afterEach(() => {
    vi.clearAllMocks();
    useParamsMock.mockReturnValue({
      assetId: "asset-ui-001",
    });
  });

  it("renders the confirmation layer with route guidance and impact explanation", async () => {
    render(<AssetReviewView />);

    await waitFor(() => {
      expect(fetchReferenceAssetDetail).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
      });
    });

    expect(screen.getByTestId("asset-review-page").textContent).toContain("资料确认层");
    expect(screen.getByTestId("asset-review-page").textContent).toContain("先看这份资料是什么");
    expect(screen.getByTestId("asset-review-page").textContent).toContain("回到资料库");
    expect(screen.getByTestId("asset-review-page").textContent).toContain("去二级整理台");
    expect(screen.getByTestId("asset-review-extracts").textContent).toContain("风格");
    expect(screen.getByTestId("asset-review-library-targets").textContent).toContain("可以去");
    expect(screen.getByTestId("asset-review-attachments").textContent).toContain("雨夜列车");
    expect(screen.getByTestId("asset-review-revoke-impact").textContent).toContain("会影响 1 个引用");
    expect(screen.getByRole("link", { name: "回到资料库" }).getAttribute("href")).toBe(
      "/assets?story_id=story-ui-001",
    );
    expect(screen.getByRole("link", { name: "去二级整理台" }).getAttribute("href")).toBe(
      "/assets/workbench?story_id=story-ui-001&asset_id=asset-ui-001",
    );
  });

  it("confirms selected extracts and refreshes with the latest detail state", async () => {
    vi.mocked(fetchReferenceAssetDetail)
      .mockResolvedValueOnce({
        asset: {
          asset_id: "asset-ui-001",
          account_id: "account-ui-001",
          story_id: null,
          scope: "user_private_library",
          file_name: "station-moodboard.pdf",
          mime_type: "application/pdf",
          extract_status: "review_pending",
        },
        scope_label: "私人资料库",
        available_story_targets: [
          {
            story_id: "story-ui-001",
            label: "雨夜列车",
            workspace_status: "active",
            availability: "available",
            reason: null,
          },
        ],
        extract_results: [
          {
            extract_ref_id: "extract-ui-001",
            extract_type: "style",
            status: "suggested",
          },
          {
            extract_ref_id: "extract-ui-002",
            extract_type: "character",
            status: "suggested",
          },
        ],
        attachments: [],
        revoke_impact: undefined as never,
      })
      .mockResolvedValueOnce({
        asset: {
          asset_id: "asset-ui-001",
          account_id: "account-ui-001",
          story_id: null,
          scope: "user_private_library",
          file_name: "station-moodboard.pdf",
          mime_type: "application/pdf",
          extract_status: "ready",
        },
        scope_label: "私人资料库",
        available_story_targets: [
          {
            story_id: "story-ui-001",
            label: "雨夜列车",
            workspace_status: "active",
            availability: "available",
            reason: null,
          },
        ],
        extract_results: [
          {
            extract_ref_id: "extract-ui-001",
            extract_type: "style",
            status: "accepted",
          },
          {
            extract_ref_id: "extract-ui-002",
            extract_type: "character",
            status: "rejected",
          },
        ],
        attachments: [],
        revoke_impact: undefined as never,
      });

    render(<AssetReviewView />);

    await waitFor(() => {
      expect(fetchReferenceAssetDetail).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
      });
    });

    fireEvent.click(await screen.findByLabelText("人物 · 建议中"));
    fireEvent.click(screen.getByRole("button", { name: "确认这些可用内容" }));

    await waitFor(() => {
      expect(confirmReferenceAsset).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
        accepted_extract_refs: ["extract-ui-001"],
        rejected_extract_refs: ["extract-ui-002"],
      });
      expect(screen.getByTestId("asset-review-summary").textContent).toContain("已经整理好");
      expect(screen.queryByRole("button", { name: "确认这些可用内容" })).toBeNull();
      expect(screen.getByTestId("asset-review-extracts").textContent).toContain("这份资料已经确认好了");
    });
  });

  it("does not request asset detail before the route param is ready", async () => {
    useParamsMock.mockReturnValue({});

    render(<AssetReviewView />);

    await waitFor(() => {
      expect(screen.getByTestId("asset-review-page").textContent).toContain("缺少资料编号");
    });
    expect(fetchReferenceAssetDetail).not.toHaveBeenCalled();
  });

  it("renders failed and revoked asset states explicitly instead of falling back to generic processing copy", async () => {
    vi.mocked(fetchReferenceAssetDetail).mockResolvedValueOnce({
      asset: {
        asset_id: "asset-ui-002",
        account_id: "account-ui-001",
        story_id: null,
        scope: "user_private_library",
        file_name: "failed-notes.md",
        mime_type: "text/markdown",
        extract_status: "failed",
      },
      scope_label: "私人资料库",
      available_story_targets: [],
      extract_results: [],
      attachments: [
        {
          attachment_id: "attachment-ui-002",
          asset_id: "asset-ui-002",
          target_type: "story",
          target_id: "story-ui-001",
          target_label: "雨夜列车",
          usage_mode: "style",
          status: "revoked",
        },
      ],
      revoke_impact: undefined as never,
    });

    render(<AssetReviewView />);

    await waitFor(() => {
      expect(screen.getByTestId("asset-review-summary").textContent).toContain("还没整理明白");
      expect(screen.getByTestId("asset-review-attachments").textContent).toContain("已经撤下");
    });
  });
});
