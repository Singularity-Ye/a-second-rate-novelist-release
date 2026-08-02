import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackView } from "./feedback-view";
import { createBetaSupportCase, fetchBetaSupportOverview } from "../lib/beta-ops-api";
import { exchangeSessionToken } from "../lib/session-bridge";

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      "token=feedback-token-ui&surface=chat&target_type=chat_thread&target_id=thread-ui-001&target_label=%E4%B8%BB%E8%81%8A%E5%A4%A9%E7%BA%BF%E7%A8%8B&story_id=story-feedback-ui",
    ),
}));

vi.mock("../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-beta-feedback-ui",
  }),
}));

vi.mock("../lib/beta-ops-api", () => ({
  fetchBetaSupportOverview: vi.fn().mockResolvedValue({
    entry: {
      sla_copy: "P0 4 小时，P1 24 小时，复杂问题进入持续同步。",
      support_hours_copy: "Beta 期每日 10:00-22:00 持续值守。",
      history_url: "/feedback?tab=history",
    },
    active_incidents: [
      {
        incident_id: "incident-ui-001",
        severity: "warn",
        status: "degraded",
        headline: "微信回流出现积压",
        summary: "当前微信 ClawBot 存在延迟，H5 仍可继续使用。",
        recommended_action: "优先切回 H5 /chat 与 /room。",
        created_at: "2026-04-03T08:00:00.000Z",
        updated_at: "2026-04-03T08:05:00.000Z",
      },
    ],
    cases: [],
    daily_digest: {
      active_beta_accounts: 32,
      open_case_count: 4,
      pending_user_count: 1,
      top_categories: ["story_quality", "delivery_blocker"],
    },
  }),
  createBetaSupportCase: vi.fn().mockResolvedValue({
    case_type: "beta_support",
    case_id: "beta-support-ui-001",
    ops_case_id: "ops-beta-support-ui-001",
    status: "submitted",
    surface: "chat",
    category: "story_quality",
    summary: "主线程承接断了",
    description: "从聊天跳到章节后，剧情没有接上前文。",
    target_object: {
      object_type: "chat_thread",
      object_id: "thread-ui-001",
      object_label: "主聊天线程",
    },
    latest_status_note: "已提交，等待 support 受理。",
    created_at: "2026-04-03T08:10:00.000Z",
    updated_at: "2026-04-03T08:10:00.000Z",
    sla_due_at: "2026-04-03T20:10:00.000Z",
    target_route: "/feedback?tab=history",
  }),
}));

describe("feedback view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("renders active beta incident, SLA copy, and submits a real support case", async () => {
    render(<FeedbackView />);

    await waitFor(() => {
      expect(fetchBetaSupportOverview).toHaveBeenCalledWith("wx-beta-feedback-ui");
      expect(exchangeSessionToken).toHaveBeenCalledWith("feedback-token-ui");
    });

    expect(screen.getByTestId("feedback-page").textContent).toContain("微信回流出现积压");
    expect(screen.getByTestId("feedback-page").textContent).toContain("P0 4 小时");
    expect(screen.getByTestId("feedback-page").textContent).toContain("主聊天线程");
    expect(screen.getByRole("link", { name: "打开历史回看" }).getAttribute("href")).toBe("/feedback?tab=history");
    expect(screen.getByRole("link", { name: "打开历史回看" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "打开历史回看" }).getAttribute("href")).not.toContain("token=");

    fireEvent.click(screen.getByLabelText("story_quality"));
    fireEvent.change(screen.getByLabelText("问题摘要"), {
      target: {
        value: "主线程承接断了",
      },
    });
    fireEvent.change(screen.getByLabelText("详细说明"), {
      target: {
        value: "从聊天跳到章节后，剧情没有接上前文。",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    await waitFor(() => {
      expect(createBetaSupportCase).toHaveBeenCalledWith(
        expect.objectContaining({
          account_token: "wx-beta-feedback-ui",
          surface: "chat",
          category: "story_quality",
        }),
      );
    });

    expect(screen.getByTestId("feedback-submit-state").textContent).toContain("beta-support-ui-001");
  });
});
