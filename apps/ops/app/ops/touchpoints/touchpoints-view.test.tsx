import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TouchpointsView } from "./touchpoints-view";
import { fetchOpsBetaAccessOverview, fetchOpsBetaSupportOverview, fetchOpsOverview } from "../../lib/ops-api";

vi.mock("../../lib/ops-api", () => ({
  fetchOpsOverview: vi.fn().mockResolvedValue({
    freshness_status: "fresh",
    north_star: {
      metric_key: "weekly_story_followers",
      label: "追更用户",
      value: 42,
      delta_ratio: 0.18,
    },
    funnel_summary: [],
    reliability_summary: {
      export_partial_failure_count: 1,
      notification_backlog_count: 3,
      data_quality_alert_count: 1,
    },
    revenue_summary: {
      paid_order_count: 3,
      paid_amount_total: 8700,
      active_subscription_count: 2,
    },
    open_case_counts: {
      open: 2,
      pending_review: 1,
      pending_user: 0,
    },
  }),
  fetchOpsBetaAccessOverview: vi.fn().mockResolvedValue({
    program: {
      program_key: "external_beta_phase0",
      status: "active",
      seat_limit: 500,
      seats_used: 12,
      waitlist_open: true,
      invite_only: true,
    },
    invites: {
      issued: 20,
      redeemed: 12,
      available: 8,
      waitlisted: 1,
      shared: 6,
    },
    source_breakdown: [
      {
        source_channel: "xiaohongshu",
        source_label: "小红书 KOL 招募",
        campaign_key: "phase0_xiaohongshu_kol",
        redeemed_count: 7,
        approved_count: 7,
      },
    ],
    channel_breakdown: [
      {
        channel: "wechat",
        bound_count: 5,
      },
    ],
    recent_accounts: [],
  }),
  fetchOpsBetaSupportOverview: vi.fn().mockResolvedValue({
    queue: {
      open: 4,
      pending_user: 1,
      resolved_today: 3,
      overdue: 1,
    },
    daily_digest: {
      active_beta_accounts: 12,
      new_cases_today: 5,
      followup_due_today: 2,
      top_categories: ["story_quality", "delivery_blocker"],
    },
    active_incidents: [
      {
        incident_id: "incident-touchpoints-ui-001",
        severity: "warn",
        status: "degraded",
        headline: "微信回流出现积压",
        summary: "当前微信 ClawBot 存在延迟，H5 仍可继续使用。",
        recommended_action: "优先引导回 H5。",
        created_at: "2026-04-03T08:00:00.000Z",
        updated_at: "2026-04-03T08:05:00.000Z",
        resolved_at: null,
      },
    ],
    recent_cases: [],
  }),
}));

describe("ops touchpoints view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders notifications truth-source controls and delivery backlog context", async () => {
    render(<TouchpointsView />);

    await waitFor(() => {
      expect(fetchOpsOverview).toHaveBeenCalled();
      expect(fetchOpsBetaAccessOverview).toHaveBeenCalled();
      expect(fetchOpsBetaSupportOverview).toHaveBeenCalled();
    });

    expect(screen.getByTestId("ops-touchpoints-page").textContent).toContain("Push 与触达后台");
    expect(screen.getByTestId("ops-touchpoints-page").textContent).toContain("/notifications");
    expect(screen.getByTestId("ops-touchpoints-page").textContent).toContain("3");
    expect(screen.getByTestId("ops-touchpoints-page").textContent).toContain("小红书 KOL 招募");
    expect(screen.getByTestId("ops-touchpoints-page").textContent).toContain("Open Support Desk");
    expect(screen.getByTestId("ops-touchpoints-page").textContent).toContain("微信回流出现积压");
  });
});
