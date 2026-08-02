import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverviewView } from "./overview-view";
import { fetchOpsOverview } from "../../lib/ops-api";

vi.mock("../../lib/ops-api", () => ({
  fetchOpsOverview: vi.fn().mockResolvedValue({
    freshness_status: "fresh",
    north_star: {
      metric_key: "weekly_story_followers",
      label: "追更用户",
      value: 42,
      delta_ratio: 0.18,
    },
    funnel_summary: [
      {
        funnel_key: "reader_activation",
        label: "拉新激活",
        conversion_rate: 0.62,
        sample_size: 120,
      },
    ],
    reliability_summary: {
      export_partial_failure_count: 1,
      notification_backlog_count: 0,
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
}));

describe("ops overview view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders north-star, funnel summary, and open case cards", async () => {
    render(<OverviewView />);

    await screen.findByTestId("ops-overview-open-cases");
    await waitFor(() => {
      expect(fetchOpsOverview).toHaveBeenCalled();
    });

    expect(screen.getByTestId("ops-overview-page").textContent).toContain("weekly_story_followers");
    expect(screen.getByTestId("ops-overview-funnel-summary").textContent).toContain("reader_activation");
    expect(screen.getByTestId("ops-overview-open-cases").textContent).toContain("2");
  });
});
