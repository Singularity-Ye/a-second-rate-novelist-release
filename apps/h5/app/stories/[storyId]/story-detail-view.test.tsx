import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryDetailView } from "./story-detail-view";
import { fetchStoryCenterDetail } from "../../lib/story-center-api";

const mockState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("account_token=wx-openid-story-detail-ui"),
  exchangeSessionToken: vi.fn(),
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-story-detail-token",
    expires_at: "2099-01-01T00:00:00.000Z",
    target_route: "/stories/story-detail-ui",
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({
    storyId: "story-detail-ui",
  }),
  useSearchParams: () => mockState.searchParams,
}));

vi.mock("../../lib/session-bridge", () => ({
  exchangeSessionToken: mockState.exchangeSessionToken,
  issueSessionToken: mockState.issueSessionToken,
}));

vi.mock("../../lib/story-center-api", () => ({
  fetchStoryCenterDetail: vi.fn().mockResolvedValue({
    story_id: "story-detail-ui",
    title: "玻璃海",
    keywords: ["都市", "海边", "拉扯"],
    workspace_status: "active",
    updated_at: "2026-04-17T10:30:00.000Z",
    continuation_next_step: "继续阅读第 2 章《第二章 玻璃海》",
    current_chapter: {
      chapter_id: "chapter-detail-ui",
      chapter_no: 2,
      title: "第二章 玻璃海",
      status: "generated",
      summary: "他们在海边把没说完的话重新捡起来。",
      route: "/stories/story-detail-ui/chapters/chapter-detail-ui",
    },
    latest_export: {
      job_id: "job-detail-ui",
      export_purpose: "submission",
      requested_formats: ["docx", "pdf"],
      status: "succeeded",
      created_at: "2026-04-17T09:30:00.000Z",
      route: "/stories/story-detail-ui/exports/job-detail-ui",
    },
    export_capability: {
      export_allowed: true,
      latest_risk_result: "warn",
      latest_evidence_pack_id: "pack-detail-ui",
    },
    recent_notifications: [
      {
        notification_id: "notification-detail-ui",
        category: "export",
        title: "作品权利服务已更新",
        body: "最新导出回执已经准备好。",
        status: "delivered",
        source_type: "export_job",
        created_at: "2026-04-17T09:30:00.000Z",
        target_route: "/stories/story-detail-ui/exports/job-detail-ui",
      },
    ],
  }),
}));

describe("story detail view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockState.searchParams = new URLSearchParams("account_token=wx-openid-story-detail-ui");
    window.sessionStorage.clear();
  });

  it("renders the story hub between bookshelf and reader/export flows", async () => {
    render(<StoryDetailView />);

    await waitFor(() => {
      expect(fetchStoryCenterDetail).toHaveBeenCalledWith({
        account_token: "wx-openid-story-detail-ui",
        story_id: "story-detail-ui",
      });
    });

    expect(screen.getByTestId("story-detail-page").textContent).toContain("故事中枢");
    expect(screen.getByTestId("story-hub-reading-card").textContent).toContain("第二章");
    expect(screen.getByTestId("story-hub-exports-card").textContent).toContain("先确认风险");
    expect(screen.getByTestId("story-hub-exports-card").textContent).toContain("已完成");
    expect(screen.getByTestId("story-detail-page").textContent).not.toContain("succeeded");
    expect(screen.getByTestId("story-hub-continuity-card").textContent).not.toContain("canonical");
    expect(screen.getByTestId("story-hub-notifications-card").textContent).toContain("作品权利服务已更新");
    expect((await screen.findByRole("link", { name: "继续阅读这本书" })).getAttribute("href")).toBe(
      "/stories/story-detail-ui/chapters/chapter-detail-ui",
    );
    expect(screen.getByRole("link", { name: "打开作品权利服务" }).getAttribute("href")).toBe(
      "/stories/story-detail-ui/exports",
    );
  });

  it("keeps token-only entry continuous by upgrading generated links with exchanged account_token", async () => {
    mockState.searchParams = new URLSearchParams("token=story-detail-token-only");
    mockState.exchangeSessionToken.mockResolvedValue({
      account_id: "account-story-detail-test",
      account_token: "wx-openid-story-detail-exchanged",
      target_route: "/stories/story-detail-ui",
      expires_at: "2099-01-01T00:00:00.000Z",
    });

    render(<StoryDetailView />);

    await waitFor(() => {
      expect(fetchStoryCenterDetail).toHaveBeenCalledWith({
        account_token: "wx-openid-story-detail-exchanged",
        story_id: "story-detail-ui",
      });
    });

    expect((await screen.findByRole("link", { name: "打开作品权利服务" })).getAttribute("href")).toBe("/stories/story-detail-ui/exports");
    expect(screen.getByRole("link", { name: "打开房间邮箱" }).getAttribute("href")).toBe(
      "/notifications?story_id=story-detail-ui",
    );
    expect(screen.getByRole("link", { name: "打开房间邮箱" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "打开房间邮箱" }).getAttribute("href")).not.toContain("token=");
  });
});
