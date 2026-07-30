import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetWorkbenchView } from "./asset-workbench-view";
import {
  attachReferenceAsset,
  extractReferenceAsset,
  fetchReferenceAssetDetail,
  revokeReferenceAsset,
  uploadReferenceAsset,
} from "../../lib/assets-api";
import { exchangeSessionToken } from "../../lib/session-bridge";

const defaultSearchParams = new URLSearchParams("account_token=wx-openid-assets-ui&story_id=story-assets-ui");
const defaultReadyDetail = {
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
      story_id: "story-assets-ui",
      label: "雨夜列车",
      workspace_status: "active",
      availability: "available",
      reason: null,
    },
    {
      story_id: "story-assets-ui-2",
      label: "月台回声",
      workspace_status: "draft",
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
  ],
  attachments: [
    {
      attachment_id: "attachment-ui-001",
      asset_id: "asset-ui-001",
      target_type: "story",
      target_id: "story-assets-ui",
      target_label: "雨夜列车",
      usage_mode: "style",
      status: "active",
    },
  ],
  revoke_impact: {
    affected_attachment_ids: ["attachment-ui-001"],
    affected_story_targets: [
      {
        story_id: "story-assets-ui",
        label: "雨夜列车",
        attachment_count: 1,
      },
    ],
    affected_references: [
      {
        attachment_id: "attachment-ui-001",
        target_type: "story",
        target_id: "story-assets-ui",
        target_label: "雨夜列车",
        usage_mode: "style",
      },
    ],
  },
};
let currentSearchParams = defaultSearchParams;
const useSearchParamsMock = vi.fn(() => currentSearchParams);

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("../../lib/assets-api", () => ({
  uploadReferenceAsset: vi.fn().mockResolvedValue({
    asset_id: "asset-ui-001",
    status: "uploaded",
  }),
  extractReferenceAsset: vi.fn().mockResolvedValue({
    status: "review_pending",
    extract_results: [
      {
        extract_ref_id: "extract-ui-001",
        extract_type: "style",
      },
    ],
  }),
  attachReferenceAsset: vi.fn().mockResolvedValue({
    attachment_id: "attachment-ui-001",
    status: "active",
  }),
  revokeReferenceAsset: vi.fn().mockResolvedValue({
    status: "revoked",
    affected_attachment_ids: ["attachment-ui-001"],
  }),
  fetchReferenceAssetDetail: vi.fn(),
}));

vi.mock("../../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-assets-ui-token",
    target_route: "/assets/workbench",
    expires_at: "2026-04-18T02:00:00.000Z",
  }),
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-openid-assets-ui",
    account_id: "account-ui-001",
    expires_at: "2026-04-18T02:00:00.000Z",
    target_route: "/room",
  }),
}));

describe("asset workbench view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    currentSearchParams = defaultSearchParams;
    vi.mocked(fetchReferenceAssetDetail).mockResolvedValue(defaultReadyDetail);
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    currentSearchParams = defaultSearchParams;
    vi.mocked(fetchReferenceAssetDetail).mockResolvedValue(defaultReadyDetail);
  });

  it("hands the user from the secondary workbench to the confirmation layer after extraction", async () => {
    vi.mocked(fetchReferenceAssetDetail)
      .mockResolvedValueOnce({
        asset: {
          asset_id: "asset-ui-001",
          account_id: "account-ui-001",
          story_id: null,
          scope: "user_private_library",
          file_name: "station-moodboard.pdf",
          mime_type: "application/pdf",
          extract_status: "uploaded",
        },
        scope_label: "私人资料库",
        available_story_targets: [
          {
            story_id: "story-assets-ui",
            label: "雨夜列车",
            workspace_status: "active",
            availability: "available",
            reason: null,
          },
        ],
        extract_results: [],
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
          extract_status: "review_pending",
        },
        scope_label: "私人资料库",
        available_story_targets: [
          {
            story_id: "story-assets-ui",
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
        ],
        attachments: [],
        revoke_impact: undefined as never,
      });

    render(<AssetWorkbenchView />);

    await waitFor(() => {
      expect(screen.getByTestId("asset-workbench-page").textContent).toContain("二级整理动作");
      expect(screen.getByTestId("asset-workbench-page").textContent).toContain("需要整理时，再来这张桌子");
      expect(screen.getByTestId("asset-workbench-page").textContent).toContain("先决定这份资料先放哪");
      expect(screen.getByTestId("asset-workbench-page").textContent).toContain("把原文变成可复用的卡片");
    });

    fireEvent.click(screen.getByRole("button", { name: "先保存这份资料" }));
    await waitFor(() => {
      expect(uploadReferenceAsset).toHaveBeenCalled();
      expect(fetchReferenceAssetDetail).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "开始整理这份资料" }));
    await waitFor(() => {
      expect(extractReferenceAsset).toHaveBeenCalled();
      expect(screen.getByTestId("asset-workbench-status").textContent).toContain("等你确认");
    });

    expect(screen.queryByRole("button", { name: "确认这些可用内容" })).toBeNull();
    expect(screen.getByRole("link", { name: "去确认这份资料" }).getAttribute("href")).toBe(
      "/assets/asset-ui-001/review?story_id=story-assets-ui",
    );
  });

  it("supports attach and revoke after a confirmed asset returns to the workbench", async () => {
    currentSearchParams = new URLSearchParams("account_token=wx-openid-assets-ui&story_id=story-assets-ui&asset_id=asset-ui-001");

    render(<AssetWorkbenchView />);

    await waitFor(() => {
      expect(fetchReferenceAssetDetail).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "挂到这条故事里" }).getAttribute("disabled")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "挂到这条故事里" }));
    const revokeButton = screen.getByRole("button", { name: "撤下这份引用" });
    await waitFor(() => {
      expect(attachReferenceAsset).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
        target_type: "story",
        target_id: "story-assets-ui",
        usage_mode: "style",
      });
      expect(screen.getByTestId("asset-workbench-status").textContent).toContain("已经挂上");
      expect(revokeButton.getAttribute("disabled")).toBeNull();
    });

    fireEvent.click(revokeButton);
    await waitFor(() => {
      expect(revokeReferenceAsset).toHaveBeenCalled();
      expect(screen.getByTestId("asset-workbench-status").textContent).toContain("已经撤下");
    });
  });

  it("renders a safe empty state when asset detail omits extract_results or attachments", async () => {
    vi.mocked(fetchReferenceAssetDetail).mockResolvedValueOnce({
      asset: {
        asset_id: "asset-ui-001",
        account_id: "account-ui-001",
        story_id: "story-assets-ui",
        scope: "story",
        file_name: "station-moodboard.pdf",
        mime_type: "application/pdf",
        extract_status: "uploaded",
      },
      scope_label: "当前故事资料库",
      available_story_targets: undefined as never,
      extract_results: undefined as never,
      attachments: undefined as never,
      revoke_impact: undefined as never,
    });

    render(<AssetWorkbenchView />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "先保存这份资料" }).getAttribute("disabled")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "先保存这份资料" }));

    await waitFor(() => {
      expect(fetchReferenceAssetDetail).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
      });
    });

    expect(screen.getByTestId("asset-workbench-page").textContent).toContain("还没有可确认的内容");
    expect(screen.getByTestId("asset-workbench-page").textContent).toContain("还没有挂上任何故事");
    expect(screen.getByTestId("asset-workbench-page").textContent).toContain("上传后会在这里显示可去的故事");
    expect(screen.queryByRole("button", { name: "确认这些可用内容" })).toBeNull();
  });

  it("does not leak story_id when uploading into the private library", async () => {
    render(<AssetWorkbenchView />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "先放进私人资料库" }).getAttribute("disabled")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "先放进私人资料库" }));
    fireEvent.click(screen.getByRole("button", { name: "先保存这份资料" }));

    await waitFor(() => {
      expect(uploadReferenceAsset).toHaveBeenCalledWith({
        account_token: "wx-openid-assets-ui",
        scope: "user_private_library",
        file_name: "station-moodboard.pdf",
        mime_type: "application/pdf",
      });
    });
  });

  it("can recover the workbench from a token-only deep link", async () => {
    currentSearchParams = new URLSearchParams("token=assets-token-only&story_id=story-assets-ui&asset_id=asset-ui-001");

    render(<AssetWorkbenchView />);

    await waitFor(() => {
      expect(exchangeSessionToken).toHaveBeenCalledWith("assets-token-only");
      expect(fetchReferenceAssetDetail).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "挂到这条故事里" }).getAttribute("disabled")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "挂到这条故事里" }));

    await waitFor(() => {
      expect(attachReferenceAsset).toHaveBeenCalledWith({
        asset_id: "asset-ui-001",
        target_type: "story",
        target_id: "story-assets-ui",
        usage_mode: "style",
      });
    });
  });
});
