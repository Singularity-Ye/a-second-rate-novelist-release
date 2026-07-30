import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChapterReaderView } from "./chapter-reader-view";

const mockState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("token=fake-token"),
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_id: "account-reader-test",
    account_token: "wx-openid-reader-test",
    target_route: "/chat",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-reader-token",
    account_id: "account-reader-direct",
    target_route: "/stories/story-reader-test/chapters/chapter-reader-test",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({
    storyId: "story-reader-test",
    chapterId: "chapter-reader-test",
  }),
  useSearchParams: () => mockState.searchParams,
}));

vi.mock("../../../../lib/session-bridge", () => ({
  exchangeSessionToken: mockState.exchangeSessionToken,
  issueSessionToken: mockState.issueSessionToken,
}));

vi.mock("../../../../lib/chapter-api", () => ({
  fetchChapter: vi.fn().mockResolvedValue({
    chapter_id: "chapter-reader-test",
    story_id: "story-reader-test",
    chapter_no: 1,
    title: "第一章 · 雨夜列车",
    status: "generated",
    body_text: "第一章原文。",
    summary: "首章摘要。",
    scene_card_set: {
      chapter_goal: "把重逢后的试探与关系拉扯立住。",
      chapter_cliffhanger_goal: "章末钉住她为什么回来的钩子。",
      scene_count: 2,
      first_scene_goal: "让两人在站台先撞见。",
    },
    reader_review: {
      summary: "情绪张力到了，但章末钩子还需要再钉深一点。",
      acceptance_recommendation: "tweak",
      rewrite_targets: ["把她回来的站队风险再往前埋一层。"],
    },
  }),
  acceptChapter: vi.fn().mockResolvedValue({
    chapter_id: "chapter-reader-test",
    status: "accepted",
    accepted_object_key: "creative-artifacts/stories/story-reader-test/chapters/chapter-reader-test/accepted.json",
    continuity_patch_id: "patch-reader-test",
    continuity_patch_summary: "第1章已写回 continuity。",
    truth_source_effect: "accepted_to_mainline",
    reader_review: {
      summary: "情绪张力到了，但章末钩子还需要再钉深一点。",
      acceptance_recommendation: "tweak",
      rewrite_targets: ["把她回来的站队风险再往前埋一层。"],
    },
  }),
  createChapterRevision: vi.fn().mockResolvedValue({
    status: "succeeded",
    revision: {
      revision_kind: "light_edit",
      revised_text: "第一章轻改后文本。",
    },
    revision_count: 1,
    truth_source_effect: "draft_only",
    reader_review: {
      summary: "情绪张力到了，但章末钩子还需要再钉深一点。",
      acceptance_recommendation: "tweak",
      rewrite_targets: ["把她回来的站队风险再往前埋一层。"],
    },
  }),
}));

vi.mock("../../../../lib/branch-api", () => ({
  createBranch: vi.fn().mockResolvedValue({
    branch_id: "branch-reader-test",
    status: "branch_ready",
  }),
}));

describe("chapter reader", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockState.searchParams = new URLSearchParams("token=fake-token");
  });

  it("can accept a chapter, render a light-edit revision result, and create a director-style branch", async () => {
    render(<ChapterReaderView />);

    await waitFor(() => {
      expect(screen.getByTestId("chapter-reader-page").textContent).toContain("第一章 · 雨夜列车");
    });

    expect(screen.getByTestId("chapter-reader-page").textContent).toContain("前情提要");
    expect(screen.getByTestId("chapter-scene-card-set").textContent).toContain("试探与关系拉扯");
    expect(screen.getByTestId("chapter-reader-review").textContent).toContain("建议轻改");
    expect(screen.getByTestId("chapter-reader-review").textContent).toContain("站队风险");
    expect(screen.getByTestId("chapter-reader-support-links").textContent).toContain("看使用说明");
    expect(screen.getByRole("link", { name: /看使用说明/ }).getAttribute("href")).toBe("/faq");
    expect(screen.getByRole("link", { name: /看示范故事/ }).getAttribute("href")).toBe("/demo-stories");
    expect(screen.getByRole("link", { name: /举报与求助/ }).getAttribute("href")).toContain(
      "/report/new?surface=reader",
    );
    fireEvent.click(screen.getByRole("button", { name: "把暧昧拉长一点" }));
    expect((screen.getByLabelText("改稿指令输入框") as HTMLTextAreaElement).value).toContain("暧昧");

    fireEvent.change(screen.getByLabelText("改稿指令输入框"), {
      target: { value: "把这一段写得更克制一点。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "轻改这一段" }));

    await waitFor(() => {
      expect(screen.getByTestId("chapter-revision-result").textContent).toContain("轻改后文本");
    });
    expect(screen.getByTestId("chapter-revision-meta").textContent).toContain("当前改稿集 1 版");
    expect(screen.getByTestId("chapter-revision-meta").textContent).toContain("只影响草稿");

    fireEvent.click(screen.getByRole("button", { name: "接受这一章" }));

    await waitFor(() => {
      expect(screen.getByTestId("chapter-accept-state").textContent).toContain("这一章已经先收进主线");
    });
    expect(screen.getByTestId("chapter-accept-state").textContent).toContain("已写回 continuity");
    expect(screen.getByTestId("chapter-accept-state").textContent).toContain("建议轻改");

    fireEvent.change(screen.getByLabelText("分支目标"), {
      target: { value: "如果这里转向另一条叙事支线。" },
    });
    expect(screen.getByTestId("chapter-branch-form").textContent).toContain("换个版本看看");
    expect(screen.getByTestId("chapter-branch-form").textContent).toContain("权利模式");
    fireEvent.click(screen.getByRole("button", { name: "从这里分出另一条命运" }));

    await waitFor(() => {
      expect(screen.getByTestId("chapter-branch-result").textContent).toContain("支线已经准备好");
      expect(screen.getByTestId("chapter-branch-result").textContent).toContain("查看分支详情");
    });
  });

  it("keeps report continuity when the chapter is opened from an account_token-only route", async () => {
    mockState.searchParams = new URLSearchParams("account_token=wx-openid-reader-direct");
    mockState.exchangeSessionToken.mockReset();

    render(<ChapterReaderView />);

    await waitFor(() => {
      expect(screen.getByTestId("chapter-reader-page").textContent).toContain("第一章 · 雨夜列车");
    });

    expect(mockState.issueSessionToken).toHaveBeenCalledWith({
      account_token: "wx-openid-reader-direct",
      target_route: "/stories/story-reader-test/chapters/chapter-reader-test",
    });
    expect(screen.getByRole("link", { name: /举报与求助/ }).getAttribute("href")).toContain(
      "story_id=story-reader-test",
    );
    expect(screen.getByRole("link", { name: /举报与求助/ }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: /举报与求助/ }).getAttribute("href")).not.toContain("token=");
  });
});
