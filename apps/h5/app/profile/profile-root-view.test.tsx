import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileRootView } from "./profile-root-view";
import { fetchAccountOverview } from "../lib/account-membership-api";
import { exchangeSessionToken } from "../lib/session-bridge";

const mockUseSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("../lib/account-membership-api", () => ({
  fetchAccountOverview: vi.fn().mockResolvedValue({
    account: {
      account_id: "account-root-ui",
      account_status: "active",
      primary_channel: "wechat",
      unread_notification_count: 3,
    },
    entitlements: {
      current_plan_id: "plan_plus",
      story_slots: 6,
      export_quota: 8,
      branch_quota: 12,
      asset_storage_mb: 1024,
    },
    sync_summary: {
      device_count: 2,
      pending_conflict_count: 1,
      sync_health: "degraded",
    },
    runtime_control: {
      usage: {
        active_story_count: 2,
        branch_count: 3,
        export_job_count: 1,
      },
      remaining: {
        story_slots: 4,
        export_quota: 7,
        branch_quota: 9,
      },
      ai_budget: {
        capability: "text_generation",
        status: "ready",
        metric_key: "capability_budget_text_generation_usd",
        daily_limit_usd: 30,
        estimated_request_cost_usd: 1.5,
        used_today_usd: 4.5,
        remaining_today_usd: 25.5,
      },
      gates: [],
      notification: {
        effective_channels: ["in_app"],
        enabled_categories: ["export", "risk", "membership", "system"],
        updated_at: "2026-04-03T00:00:00.000Z",
      },
      privacy: {
        open_request_count: 1,
        cooling_off_request_count: 0,
        latest_request_id: "privacy-root-ui-001",
      },
    },
  }),
}));

vi.mock("../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-profile-root-token",
    target_route: "/profile",
    expires_at: "2026-04-03T01:00:00.000Z",
  }),
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-openid-profile-root-ui",
    account_id: "account-root-ui",
    expires_at: "2026-04-03T01:00:00.000Z",
    target_route: "/profile",
  }),
}));

describe("profile root view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("account_token=wx-openid-profile-root-ui&story_id=story-root-ui"),
    );
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("renders a lightweight user center and preserves query on core links", async () => {
    render(<ProfileRootView />);

    await waitFor(() => {
      expect(fetchAccountOverview).toHaveBeenCalledWith("wx-openid-profile-root-ui");
    });

    await waitFor(() => {
      expect(screen.getByTestId("profile-root-page").textContent).toContain("我的");
      expect(screen.getByTestId("profile-root-page").textContent).toContain("先把多端接力接稳");
      expect(screen.getByTestId("profile-root-page").textContent).toContain("设置");
      expect(screen.getByTestId("profile-root-page").textContent).toContain("帮助");
      expect(screen.getByTestId("profile-root-page").textContent).toContain("先把这件事处理好");
      expect(screen.getByTestId("profile-root-page").textContent).not.toContain("暂未开放");
      expect(screen.getByTestId("profile-root-page").textContent).not.toContain("还没开放的入口");
    });

    expect(screen.getByRole("link", { name: "继续处理：先把多端接力接稳" }).getAttribute("href")).toContain(
      "/profile/account/sync?story_id=story-root-ui",
    );
    expect(screen.getByRole("link", { name: "保住账号和进度" }).getAttribute("href")).toContain(
      "/profile/account?story_id=story-root-ui",
    );
    expect(screen.getByRole("link", { name: "看通知和房间邮箱" }).getAttribute("href")).toContain(
      "/notifications?story_id=story-root-ui",
    );
    expect(screen.getByRole("link", { name: "隐私与数据" }).getAttribute("href")).toContain(
      "/profile/account/privacy?story_id=story-root-ui",
    );
    expect(screen.getByRole("link", { name: "先看看怎么用" }).getAttribute("href")).toContain(
      "/faq?story_id=story-root-ui",
    );

    const feedbackHref = screen.getByRole("link", { name: "卡住了来找我们" }).getAttribute("href");
    expect(feedbackHref).toContain("/feedback?");
    expect(feedbackHref).toContain("surface=account");
    expect(feedbackHref).toContain("story_id=story-root-ui");
  });

  it("can recover account context from token-only shell navigation", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("token=deep-link-token"));

    render(<ProfileRootView />);

    await waitFor(() => {
      expect(exchangeSessionToken).toHaveBeenCalledWith("deep-link-token");
      expect(fetchAccountOverview).toHaveBeenCalledWith("wx-openid-profile-root-ui");
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "保住账号和进度" }).getAttribute("href")).toBe("/profile/account");
    });
    expect(screen.getByRole("link", { name: "保住账号和进度" }).getAttribute("href")).not.toContain("account_token=");
  });

  it("renders a recoverable empty state instead of a dead-end error when no account context exists", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    render(<ProfileRootView />);

    await waitFor(() => {
      expect(screen.getByTestId("account-recovery-state").textContent).toContain("这页还没接上你的账号信息");
      expect(screen.getByRole("link", { name: "回首页重新进入" }).getAttribute("href")).toBe("/");
      expect(screen.getByRole("link", { name: "先回房间" }).getAttribute("href")).toBe("/room");
    });
  });
});
