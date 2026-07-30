import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoriesRootView } from "./stories-root-view";
import { fetchStoryCenter } from "../lib/story-center-api";

const mockState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("account_token=wx-openid-story-center-ui"),
  exchangeSessionToken: vi.fn(),
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-story-center-token",
    expires_at: "2099-01-01T00:00:00.000Z",
    target_route: "/stories",
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockState.searchParams,
}));

vi.mock("../lib/session-bridge", () => ({
  exchangeSessionToken: mockState.exchangeSessionToken,
  issueSessionToken: mockState.issueSessionToken,
}));

vi.mock("../lib/story-center-api", () => ({
  fetchStoryCenter: vi.fn().mockResolvedValue({
    active_story_id: "story-ui-001",
    items: [
      {
        story_id: "story-ui-001",
        title: "雨夜列车",
        keywords: ["重逢", "雨夜", "慢热"],
        workspace_status: "active",
        updated_at: "2026-04-17T10:20:00.000Z",
        continuation_next_step: "继续阅读第 1 章《第一章 雨站台》",
        current_chapter: {
          chapter_id: "chapter-ui-001",
          chapter_no: 1,
          title: "第一章 雨站台",
          status: "generated",
          summary: "他们在雨站台重逢，话还没说完。",
          route: "/stories/story-ui-001/chapters/chapter-ui-001",
        },
        latest_export: {
          job_id: "job-ui-001",
          export_purpose: "submission",
          requested_formats: ["docx"],
          status: "succeeded",
          created_at: "2026-04-17T10:00:00.000Z",
          route: "/stories/story-ui-001/exports/job-ui-001",
        },
      },
    ],
  }),
}));

describe("stories root view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockState.searchParams = new URLSearchParams("account_token=wx-openid-story-center-ui");
    window.sessionStorage.clear();
  });

  it("renders a real story center instead of a placeholder root", async () => {
    render(<StoriesRootView />);

    await waitFor(() => {
      expect(fetchStoryCenter).toHaveBeenCalledWith("wx-openid-story-center-ui");
    });

    expect(mockState.issueSessionToken).toHaveBeenCalledWith({
      account_token: "wx-openid-story-center-ui",
      target_route: "/stories",
    });

    expect(screen.getByTestId("stories-root-page").textContent).toContain("书架 / 故事中心");
    expect(screen.getByTestId("stories-root-page").textContent).toContain("雨夜列车");
    expect(screen.getByTestId("stories-root-page").textContent).not.toContain("你的故事都从这里继续。");
    expect(screen.getByTestId("stories-root-page").textContent).toContain("已完成");
    expect(screen.getByTestId("stories-root-page").textContent).not.toContain("succeeded");
    expect(screen.getByTestId("story-center-card-story-ui-001").textContent).toContain("去作品权利服务");
    expect(screen.getAllByRole("link", { name: /打开故事中枢/ })[0]?.getAttribute("href")).toBe("/stories/story-ui-001");
    expect(screen.getAllByRole("link", { name: /继续阅读/ })[0]?.getAttribute("href")).toBe(
      "/stories/story-ui-001/chapters/chapter-ui-001",
    );
  });

  it("uses active_story_id and exchanged account token to build the featured story links", async () => {
    mockState.searchParams = new URLSearchParams("token=token-only-story-center");
    mockState.exchangeSessionToken.mockResolvedValue({
      account_id: "account-story-center-test",
      account_token: "wx-openid-story-center-exchanged",
      target_route: "/stories",
      expires_at: "2099-01-01T00:00:00.000Z",
    });
    vi.mocked(fetchStoryCenter).mockResolvedValueOnce({
      active_story_id: "story-ui-002",
      items: [
        {
          story_id: "story-ui-001",
          title: "排在前面的故事",
          keywords: ["前排"],
          workspace_status: "active",
          updated_at: "2026-04-17T11:20:00.000Z",
          continuation_next_step: "先回故事中枢",
          current_chapter: null,
          latest_export: null,
        },
        {
          story_id: "story-ui-002",
          title: "真正的当前故事",
          keywords: ["当前"],
          workspace_status: "active",
          updated_at: "2026-04-17T10:20:00.000Z",
          continuation_next_step: "继续阅读第 3 章《第三章 月台回声》",
          current_chapter: {
            chapter_id: "chapter-ui-002",
            chapter_no: 3,
            title: "第三章 月台回声",
            status: "generated",
            summary: "这里才是最近继续读的那本。",
            route: "/stories/story-ui-002/chapters/chapter-ui-002",
          },
          latest_export: null,
        },
      ],
    });

    render(<StoriesRootView />);

    await waitFor(() => {
      expect(fetchStoryCenter).toHaveBeenCalledWith("wx-openid-story-center-exchanged");
    });

    expect(screen.getByTestId("story-center-featured").textContent).toContain("真正的当前故事");
    expect(screen.getByTestId("story-center-featured").textContent).not.toContain("排在前面的故事");
    expect(screen.getByTestId("story-center-featured").querySelector("a")?.getAttribute("href")).toBe(
      "/stories/story-ui-002",
    );
    expect(screen.getByTestId("story-center-featured").querySelector("a")?.getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByTestId("story-center-featured").querySelector("a")?.getAttribute("href")).not.toContain("token=");
  });
});
