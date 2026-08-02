import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipView } from "./membership-view";
import { createMembershipOrder, fetchAccountOverview } from "../../../lib/account-membership-api";
import { issueSessionToken } from "../../../lib/session-bridge";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("account_token=wx-openid-membership-ui&story_id=story-membership-ui"),
}));

vi.mock("../../../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-membership-ui-token",
    expires_at: "2026-04-18T00:30:00.000Z",
    target_route: "/profile/account/membership",
  }),
}));

vi.mock("../../../lib/account-membership-api", () => ({
  fetchAccountOverview: vi.fn().mockResolvedValue({
    account: {
      account_id: "account-membership-ui",
      account_status: "active",
      primary_channel: "wechat",
      unread_notification_count: 1,
    },
    entitlements: {
      current_plan_id: "plan_plus",
      story_slots: 6,
      export_quota: 8,
      branch_quota: 12,
      asset_storage_mb: 1024,
    },
    sync_summary: {
      device_count: 1,
      pending_conflict_count: 0,
      sync_health: "healthy",
    },
    runtime_control: {
      usage: {
        active_story_count: 2,
        branch_count: 1,
        export_job_count: 1,
      },
      remaining: {
        story_slots: 4,
        export_quota: 7,
        branch_quota: 11,
      },
      ai_budget: {
        capability: "text_generation",
        status: "ready",
        metric_key: "capability_budget_text_generation_usd",
        daily_limit_usd: 30,
        estimated_request_cost_usd: 1.5,
        used_today_usd: 3,
        remaining_today_usd: 27,
      },
      gates: [],
      notification: {
        effective_channels: ["in_app", "im"],
        enabled_categories: ["export", "risk", "membership", "system"],
        updated_at: "2026-04-03T00:00:00.000Z",
      },
      privacy: {
        open_request_count: 0,
        cooling_off_request_count: 0,
        latest_request_id: null,
      },
    },
  }),
  createMembershipOrder: vi.fn().mockResolvedValue({
    order_id: "order-ui-001",
    checkout_status: "paid",
    payable_amount: 2900,
    entitlement_preview: {
      current_plan_id: "plan_plus",
      story_slots: 6,
      export_quota: 8,
      branch_quota: 12,
      asset_storage_mb: 1024,
    },
  }),
}));

describe("membership view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("renders story-value membership language and keeps order access share-safe", async () => {
    render(<MembershipView />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-openid-membership-ui",
        target_route: "/profile/account/membership",
      });
      expect(fetchAccountOverview).toHaveBeenCalledWith("wx-openid-membership-ui");
    });

    await waitFor(() => {
      expect(screen.getByTestId("membership-page").textContent).toContain("买的是继续连载的容量，不是技术面板");
      expect(screen.getByTestId("membership-page").textContent).toContain("故事 Plus");
      expect(screen.getByTestId("membership-page").textContent).toContain("资料容量");
      expect(screen.getByTestId("membership-page").textContent).toContain("专业能力扩展");
      expect(screen.getByRole("link", { name: "订单记录" }).getAttribute("href")).toContain(
        "/profile/account/orders?story_id=story-membership-ui",
      );
      expect(screen.getByRole("link", { name: "订单记录" }).getAttribute("href")).not.toContain("account_token=");
    });

    fireEvent.click(screen.getByRole("button", { name: "开通故事 Plus" }));
    await waitFor(() => {
      expect(createMembershipOrder).toHaveBeenCalledWith("wx-openid-membership-ui");
    });
  });
});
