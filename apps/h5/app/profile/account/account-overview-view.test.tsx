import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountOverviewView } from "./account-overview-view";
import { exchangeSessionToken } from "../../lib/session-bridge";
import {
  createPrivacyDataRequest,
  fetchAccountOverview,
  guestUpgradeAccount,
} from "../../lib/account-membership-api";

const mockUseSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("../../lib/account-membership-api", () => ({
  fetchAccountOverview: vi.fn().mockResolvedValue({
    account: {
      account_id: "account-ui-001",
      account_status: "active",
      primary_channel: "wechat",
      unread_notification_count: 2,
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
      gates: [
        {
          gate_key: "story_slots",
          status: "ready",
          reason_code: null,
          detail: "仍可新开 4 条故事。",
        },
      ],
      notification: {
        effective_channels: ["in_app", "im"],
        enabled_categories: ["export", "risk", "system"],
        updated_at: "2026-04-03T00:00:00.000Z",
      },
      privacy: {
        open_request_count: 1,
        cooling_off_request_count: 0,
        latest_request_id: "privacy-ui-001",
      },
    },
  }),
  guestUpgradeAccount: vi.fn().mockResolvedValue({
    account_id: "account-ui-001",
    status: "active",
    merged_guest_story_count: 1,
    primary_channel: "wechat",
    session_expires_at: "2099-01-01T00:00:00.000Z",
  }),
  createPrivacyDataRequest: vi.fn().mockResolvedValue({
    data_request_id: "privacy-ui-001",
    status: "queued",
    due_at: "2026-04-01T00:00:00.000Z",
    cooling_off_until: null,
  }),
}));

vi.mock("../../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-profile-overview-token",
    target_route: "/profile/account",
    expires_at: "2026-04-03T01:00:00.000Z",
  }),
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-openid-profile-ui",
    account_id: "account-ui-001",
    expires_at: "2026-04-03T01:00:00.000Z",
    target_route: "/profile/account",
  }),
}));

describe("account overview view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("renders the account control plane, preserves query on links, and supports upgrade/export actions", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("account_token=wx-openid-profile-ui&story_id=story-profile-ui"));
    render(<AccountOverviewView />);

    await waitFor(() => {
      expect(fetchAccountOverview).toHaveBeenCalledWith("wx-openid-profile-ui");
    });

    await waitFor(() => {
      expect(screen.getByTestId("account-overview-page").textContent).toContain("先把这段关系正式留在自己名下");
      expect(screen.getByTestId("account-overview-page").textContent).toContain("故事槽位");
      expect(screen.getByTestId("account-overview-page").textContent).toContain("资料容量");
      expect(screen.getByTestId("account-overview-page").textContent).toContain("保留位明确挂出来");
      expect(screen.getByRole("link", { name: "会员与权益" }).getAttribute("href")).toContain(
        "/profile/account/membership?story_id=story-profile-ui",
      );
      expect(screen.getByRole("link", { name: "订单、发票与退款" }).getAttribute("href")).toContain(
        "/profile/account/orders?story_id=story-profile-ui",
      );
      expect(screen.getByRole("link", { name: "通知中心" }).getAttribute("href")).toContain(
        "/notifications?story_id=story-profile-ui",
      );
    });

    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).toContain("/feedback?surface=account");

    fireEvent.click(screen.getByRole("button", { name: "把游客进度正式保存下来" }));
    await waitFor(() => {
      expect(guestUpgradeAccount).toHaveBeenCalledWith("wx-openid-profile-ui");
      expect(screen.getByTestId("account-action-state").textContent).toContain("已经正式留档");
    });

    fireEvent.click(screen.getByRole("button", { name: "发起数据导出请求" }));
    await waitFor(() => {
      expect(createPrivacyDataRequest).toHaveBeenCalledWith({
        account_token: "wx-openid-profile-ui",
        request_type: "export",
        scope: "account",
        story_id: "story-profile-ui",
      });
    });
  });

  it("can recover account context from token-only deep links", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("token=profile-token-only&story_id=story-profile-ui"));

    render(<AccountOverviewView />);

    await waitFor(() => {
      expect(exchangeSessionToken).toHaveBeenCalledWith("profile-token-only");
      expect(fetchAccountOverview).toHaveBeenCalledWith("wx-openid-profile-ui");
    });

    expect(screen.getByRole("link", { name: "会员与权益" }).getAttribute("href")).toContain(
      "/profile/account/membership?story_id=story-profile-ui",
    );
    expect(screen.getByRole("link", { name: "会员与权益" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).toContain("story_id=story-profile-ui");
    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).not.toContain("account_token=");
  });
});
