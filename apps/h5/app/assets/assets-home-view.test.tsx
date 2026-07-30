import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetsHomeView } from "./assets-home-view";
import { fetchReferenceAssetLibrary } from "../lib/assets-api";
import { exchangeSessionToken } from "../lib/session-bridge";

const useSearchParamsMock = vi.fn(() => new URLSearchParams("account_token=wx-openid-assets-root&story_id=story-assets-root"));

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("../lib/assets-api", () => ({
  fetchReferenceAssetLibrary: vi.fn().mockResolvedValue({
    focus_story: {
      story_id: "story-assets-root",
      label: "雨夜列车",
    },
    applied_filters: {
      query: "",
      scope: "all",
      status: "all",
    },
    total_asset_count: 3,
    reusable_asset_count: 1,
    active_attachment_count: 2,
    shelves: [
      {
        shelf_id: "story_live",
        title: "《雨夜列车》正在使用",
        description: "这里显示当前故事正在用、或只属于这条故事线的资料。",
        asset_count: 2,
        entries: [
          {
            asset_id: "asset-001",
            file_name: "station-moodboard.pdf",
            scope: "story",
            scope_label: "当前故事资料库",
            extract_status: "ready",
            story_id: "story-assets-root",
            story_label: "雨夜列车",
            lineage_note: "只跟随《雨夜列车》流转，不会跨故事外溢。",
            extract_count: 2,
            active_attachment_count: 1,
            active_story_ids: ["story-assets-root"],
            active_story_labels: ["雨夜列车"],
            last_updated_at: "2026-04-17T04:30:00.000Z",
          },
        ],
      },
      {
        shelf_id: "private_library",
        title: "私人资料库",
        description: "默认私有，不混入公共知识；只有你决定挂载时，才会进入具体故事。",
        asset_count: 1,
        entries: [
          {
            asset_id: "asset-002",
            file_name: "character-notes.md",
            scope: "user_private_library",
            scope_label: "私人资料库",
            extract_status: "ready",
            story_id: null,
            story_label: null,
            lineage_note: "已在 雨夜列车 里复用。",
            extract_count: 3,
            active_attachment_count: 1,
            active_story_ids: ["story-assets-root"],
            active_story_labels: ["雨夜列车"],
            last_updated_at: "2026-04-17T04:50:00.000Z",
          },
        ],
      },
    ],
  }),
}));

vi.mock("../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-assets-root-token",
    target_route: "/assets",
    expires_at: "2026-04-18T02:00:00.000Z",
  }),
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-openid-assets-root",
    account_id: "account-assets-root",
    expires_at: "2026-04-18T02:00:00.000Z",
    target_route: "/room",
  }),
}));

describe("assets home view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("account_token=wx-openid-assets-root&story_id=story-assets-root"),
    );
  });

  it("renders a bookshelf-first home page with the most recent asset as the primary action", async () => {
    render(<AssetsHomeView />);

    await waitFor(() => {
      expect(screen.getByTestId("assets-home-page").textContent).toContain("先看最近一份资料，书架会顺着你继续");
    });

    expect(screen.getByTestId("assets-home-page").textContent).toContain("最近一份资料");
    expect(screen.getByTestId("assets-home-page").textContent).toContain("character-notes.md");
    expect(screen.getByTestId("assets-home-page").textContent).toContain("继续最近一份资料");
    expect(screen.getByTestId("assets-home-page").textContent).toContain("再放一份资料");
    expect(screen.getByTestId("assets-home-page").textContent).toContain("《雨夜列车》正在使用");
    expect(screen.getByTestId("assets-home-page").textContent).toContain("station-moodboard.pdf");
    expect(screen.getByTestId("assets-home-page").textContent).toContain("私人资料库");
    expect(screen.getByTestId("assets-home-page").textContent).toContain("已经整理好");
  });

  it("requests filtered library results when search changes", async () => {
    render(<AssetsHomeView />);

    await waitFor(() => {
      expect(fetchReferenceAssetLibrary).toHaveBeenCalledWith({
        account_token: "wx-openid-assets-root",
        story_id: "story-assets-root",
        scope: "all",
        status: "all",
      });
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索资料" }), {
      target: { value: "风格" },
    });

    await waitFor(() => {
      expect(fetchReferenceAssetLibrary).toHaveBeenLastCalledWith({
        account_token: "wx-openid-assets-root",
        story_id: "story-assets-root",
        query: "风格",
        scope: "all",
        status: "all",
      });
    });
  });

  it("renders a guarded empty state when account token is missing", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("story_id=story-assets-root"));

    render(<AssetsHomeView />);

    await waitFor(() => {
      expect(screen.getByTestId("assets-home-page").textContent).toContain("这页还没接上你的账号信息");
    });
  });

  it("can recover the assets shelf from a token-only deep link without re-exposing account_token", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("token=assets-token-only&story_id=story-assets-root"));

    render(<AssetsHomeView />);

    await waitFor(() => {
      expect(exchangeSessionToken).toHaveBeenCalledWith("assets-token-only");
      expect(fetchReferenceAssetLibrary).toHaveBeenCalledWith({
        account_token: "wx-openid-assets-root",
        story_id: "story-assets-root",
        scope: "all",
        status: "all",
      });
    });

    expect(screen.getByRole("link", { name: /继续最近一份资料/ }).getAttribute("href")).toBe(
      "/assets/asset-002/review?story_id=story-assets-root",
    );
    expect(screen.getByRole("link", { name: /再放一份资料/ }).getAttribute("href")).toBe(
      "/assets/workbench?story_id=story-assets-root",
    );
    expect(screen.getByRole("link", { name: /再放一份资料/ }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: /再放一份资料/ }).getAttribute("href")).not.toContain("token=");
  });
});
