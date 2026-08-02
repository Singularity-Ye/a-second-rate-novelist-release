import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCapabilityTruthCopy, StoryIntakeView } from "./story-intake-view";

const defaultFrontstageSession = {
  accountToken: null,
  contextSearchParams: new URLSearchParams(),
  homeHref: "/",
  profileHref: "/profile",
  queryString: "",
  recoveryState: "missing_context" as const,
  retryHref: "/stories/new",
  roomHref: "/room",
  storyId: null,
  token: null,
};

let mockFrontstageSession = { ...defaultFrontstageSession };

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("../../lib/account-surface-session", () => ({
  useAccountSurfaceSession: () => mockFrontstageSession,
}));

vi.mock("../../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_id: "account-story-intake-ui",
    account_token: "wx-openid-story-intake-ui",
    target_route: "/chat",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("../../lib/story-intake-api", () => ({
  createIntakeSession: vi.fn().mockResolvedValue({
    session_id: "session-story-intake-ui",
    status: "draft",
    next_action: "generate_proposals",
  }),
  generateStoryProposals: vi.fn().mockResolvedValue({
    status: "proposals_ready",
    capability_truth: {
      state: "simulation_fallback",
      badge: "仅流程 smoke",
      title: "当前不是实时创作能力",
      description: "这轮 3 条提案来自固定 fallback 蓝图，只用于打通流程，不代表真实模型创作能力已经通过。",
      requested_tier: "creative_large",
      selected_tier: "rules_first",
      fallback_applied: true,
      provider_id: null,
      model_id: null,
      attempted_tiers: ["creative_large", "balanced_mid", "utility_small", "rules_first"],
    },
    genre_brief: {
      artifact_type: "genre_brief",
      session_id: "session-story-intake-ui",
      story_id: null,
      target_reader_segment: "想看慢热拉扯与旧债重逢的追更读者",
      genre_lane: "女频关系驱动",
      core_promise: "重逢后的试探与站队会一章章升级。",
      core_trope_family: ["重逢", "慢热拉扯"],
      front_ten_chapter_promise: "前十章先把试探、站队与旧债钉住。",
      relationship_promise: "每三章至少推进一次信任与风险站队。",
      risk_flags: [],
      created_at: "2026-04-03T05:40:00.000Z",
    },
    proposals: [
      {
        proposal_id: "proposal-a",
        proposal_no: 1,
        title: "雨夜列车",
        summary: "旧城夜班车上的重逢拉扯。",
        payload: {
          front_ten_chapter_promise: "前十章先把试探、站队与旧债钉住。",
        },
      },
      {
        proposal_id: "proposal-b",
        proposal_no: 2,
        title: "玻璃海",
        summary: "海风里的失而复得。",
        payload: {
          front_ten_chapter_promise: "前十章先把试探、站队与旧债钉住。",
        },
      },
      {
        proposal_id: "proposal-c",
        proposal_no: 3,
        title: "倒带告白",
        summary: "在告白失败前一夜重写命运。",
        payload: {
          front_ten_chapter_promise: "前十章先把试探、站队与旧债钉住。",
        },
      },
    ],
  }),
  acceptStoryProposal: vi.fn().mockResolvedValue({
    story_id: "story-created-ui",
    deep_link: "/room?storyId=story-created-ui",
    selected_proposal: {
      proposal_id: "proposal-b",
      proposal_no: 2,
      title: "玻璃海",
      summary: "海风里的失而复得。",
      payload: {},
    },
    commission_brief: {
      title: "玻璃海",
      tone_hint: "暧昧值再高一点，但不要太快在一起。",
    },
    canon_seed: {
      item_count: 3,
      items: [
        {
          item_id: "canon-1",
          item_type: "relationship",
          title: "玻璃海 当前关系张力",
          reveal_level: "public_now",
          continuity_status: "stable",
        },
      ],
    },
    outline_bundle: {
      chapters: [
        {
          chapter_no: 1,
          title: "旧城再遇",
          goal: "先把重逢后的拉扯钉住。",
          emotional_beat: "克制试探",
        },
      ],
    },
  }),
}));

describe("story-intake view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockFrontstageSession = { ...defaultFrontstageSession };
  });

  it("maps capability truth states to honest copy", () => {
    expect(
      resolveCapabilityTruthCopy({
        state: "runtime_backed",
        requested_tier: "creative_large",
        selected_tier: "creative_large",
        fallback_applied: false,
        provider_id: "openai",
        model_id: "gpt-5.4",
        attempted_tiers: ["creative_large"],
      }),
    ).toMatchObject({
      badge: "真实运行时",
      title: "这轮提案来自真实运行时",
    });

    expect(
      resolveCapabilityTruthCopy({
        state: "runtime_degraded",
        requested_tier: "creative_large",
        selected_tier: "balanced_mid",
        fallback_applied: true,
        provider_id: "openai",
        model_id: "gpt-5.4-mini",
        attempted_tiers: ["creative_large", "balanced_mid"],
      }),
    ).toMatchObject({
      badge: "真实运行时，已降级",
      description: "这轮结果仍然来自真实运行时，只是当前不是最优路由。",
    });

    expect(
      resolveCapabilityTruthCopy({
        state: "simulation_fallback",
        requested_tier: "creative_large",
        selected_tier: "rules_first",
        fallback_applied: true,
        provider_id: null,
        model_id: null,
        attempted_tiers: ["creative_large", "balanced_mid", "utility_small", "rules_first"],
      }),
    ).toMatchObject({
      badge: "仅流程 smoke",
      description:
        "这轮提案来自固定 fallback 蓝图，只用于打通流程，不代表真实模型创作能力已经通过。",
    });
  });

  it("walks through mode selection, proposal generation, and workspace creation", async () => {
    render(<StoryIntakeView token="fake-token" />);

    fireEvent.click(screen.getByRole("button", { name: /我只有感觉/ }));
    fireEvent.change(screen.getByLabelText("开坑描述输入框"), {
      target: { value: "想看一段雨夜重逢、暧昧拉扯的长篇。" },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "生成 3 条提案" }).hasAttribute("disabled")).toBe(
        false,
      );
    });

    expect(screen.getByTestId("story-intake-support-links").textContent).toContain("先看示范故事");
    expect(screen.getByRole("link", { name: /看使用说明/ }).getAttribute("href")).toBe("/faq");

    fireEvent.click(screen.getByRole("button", { name: "生成 3 条提案" }));

    await waitFor(() => {
      expect(screen.getByText("雨夜列车")).toBeTruthy();
      expect(screen.getByText("玻璃海")).toBeTruthy();
    });
    expect(screen.getByTestId("story-intake-capability-truth").textContent).toContain("仅流程 smoke");
    expect(screen.getByTestId("story-intake-capability-truth").textContent).toContain("不代表真实模型创作能力已经通过");
    expect(screen.getByTestId("story-intake-proposals").textContent).toContain("女频关系驱动");
    expect(screen.getByTestId("story-intake-proposals").textContent).toContain("前十章先把试探、站队与旧债钉住。");

    fireEvent.click(screen.getByRole("button", { name: /拿《玻璃海》做委托底稿/ }));

    await waitFor(() => {
      expect(screen.getByTestId("story-intake-commission-preview").textContent).toContain("玻璃海");
    });

    expect(screen.getByTestId("story-intake-commission-preview").textContent).toContain("默认私密");
    expect(screen.getByTestId("story-intake-commission-preview").textContent).toContain("前十章先把试探、站队与旧债钉住。");
    expect(screen.getByRole("button", { name: "确认这份委托书" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "确认这份委托书" }));

    await waitFor(() => {
      expect(screen.getByTestId("story-intake-created").textContent).toContain("story-created-ui");
    });

    expect(screen.getByTestId("story-intake-created").textContent).toContain("第一轮结果");
    expect(screen.getByTestId("story-intake-created").textContent).toContain("核心设定");
    expect(screen.getByTestId("story-intake-created").textContent).toContain("玻璃海 当前关系张力");
    expect(screen.getByTestId("story-intake-created").textContent).toContain("旧城再遇");
    expect(screen.getByTestId("story-intake-created").textContent).toContain("前十章先把试探、站队与旧债钉住。");
    expect(screen.getByRole("link", { name: /去房间继续推进/ }).getAttribute("href")).toBe(
      "/room?storyId=story-created-ui",
    );
    expect(screen.getByRole("link", { name: /回私聊继续补一句/ }).getAttribute("href")).toBe("/chat");
    expect(screen.getByRole("link", { name: /回私聊继续补一句/ }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: /回私聊继续补一句/ }).getAttribute("href")).not.toContain("token=");
  });

  it("keeps the draft intact when account recovery flips from recovering to ready", async () => {
    mockFrontstageSession = {
      ...defaultFrontstageSession,
      recoveryState: "recovering",
    };

    const { rerender } = render(<StoryIntakeView />);

    fireEvent.click(screen.getByRole("button", { name: /我只有感觉/ }));
    fireEvent.change(screen.getByLabelText("开坑描述输入框"), {
      target: { value: "想看一段会慢慢发酵的重逢拉扯。" },
    });

    expect(screen.getByRole("button", { name: /我只有感觉/ }).getAttribute("data-selected")).toBe("true");
    expect((screen.getByLabelText("开坑描述输入框") as HTMLTextAreaElement).value).toBe(
      "想看一段会慢慢发酵的重逢拉扯。",
    );

    mockFrontstageSession = {
      ...defaultFrontstageSession,
      accountToken: "wx-openid-story-intake-ui",
      recoveryState: "ready",
    };

    rerender(<StoryIntakeView />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "生成 3 条提案" }).hasAttribute("disabled")).toBe(false);
    });

    expect(screen.getByRole("button", { name: /我只有感觉/ }).getAttribute("data-selected")).toBe("true");
    expect((screen.getByLabelText("开坑描述输入框") as HTMLTextAreaElement).value).toBe(
      "想看一段会慢慢发酵的重逢拉扯。",
    );
  });
});
