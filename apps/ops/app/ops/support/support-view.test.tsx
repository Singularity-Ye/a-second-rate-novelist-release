import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportView } from "./support-view";
import {
  createOpsBetaIncident,
  fetchOpsBetaSupportOverview,
  resolveOpsBetaIncident,
} from "../../lib/ops-api";

vi.mock("../../lib/ops-api", () => ({
  fetchOpsBetaSupportOverview: vi.fn().mockResolvedValue({
    queue: {
      open: 4,
      pending_user: 1,
      resolved_today: 3,
      overdue: 1,
    },
    daily_digest: {
      active_beta_accounts: 57,
      new_cases_today: 6,
      followup_due_today: 4,
      top_categories: ["story_quality", "delivery_blocker"],
    },
    active_incidents: [
      {
        incident_id: "incident-ops-ui-001",
        severity: "warn",
        status: "degraded",
        headline: "微信回流出现积压",
        summary: "当前微信 ClawBot 存在延迟，H5 仍可继续使用。",
        recommended_action: "优先引导回 H5。",
        created_at: "2026-04-03T08:00:00.000Z",
        updated_at: "2026-04-03T08:05:00.000Z",
      },
    ],
    recent_cases: [
      {
        case_id: "beta-support-ops-ui-001",
        case_type: "beta_support",
        status: "open",
        priority: "P1",
        summary: "主线程承接断了",
        owner_id: null,
        sla_due_at: "2026-04-03T20:00:00.000Z",
      },
    ],
  }),
  createOpsBetaIncident: vi.fn().mockResolvedValue({
    incident_id: "incident-ops-ui-002",
    status: "stop_service",
    created_at: "2026-04-03T09:00:00.000Z",
    notified_account_count: 57,
  }),
  resolveOpsBetaIncident: vi.fn().mockResolvedValue({
    incident_id: "incident-ops-ui-001",
    status: "resolved",
    resolved_at: "2026-04-03T10:00:00.000Z",
  }),
}));

describe("ops support view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows beta support queue, daily digest, and lets ops broadcast and resolve incidents", async () => {
    render(<SupportView />);

    await waitFor(() => {
      expect(fetchOpsBetaSupportOverview).toHaveBeenCalled();
    });

    expect(screen.getByTestId("ops-support-page").textContent).toContain("57");
    expect(screen.getByTestId("ops-support-page").textContent).toContain("story_quality");
    expect(screen.getByTestId("ops-support-page").textContent).toContain("微信回流出现积压");

    fireEvent.click(screen.getByRole("button", { name: "发布停服通知" }));
    await waitFor(() => {
      expect(createOpsBetaIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "stop_service",
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "标记已恢复" }));
    await waitFor(() => {
      expect(resolveOpsBetaIncident).toHaveBeenCalledWith("incident-ops-ui-001");
    });
  });
});
