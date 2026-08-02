import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyView } from "./privacy-view";
import {
  createPrivacyDataRequest,
  fetchAccountOverview,
  fetchPrivacyDataRequests,
} from "../../../lib/account-membership-api";
import { issueSessionToken } from "../../../lib/session-bridge";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("account_token=wx-openid-privacy-ui&story_id=story-privacy-ui"),
}));

vi.mock("../../../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-privacy-ui-token",
    expires_at: "2026-04-18T00:30:00.000Z",
    target_route: "/profile/account/privacy",
  }),
}));

vi.mock("../../../lib/account-membership-api", () => ({
  fetchAccountOverview: vi.fn().mockResolvedValue({
    account: {
      account_id: "account-privacy-ui",
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
      device_count: 2,
      pending_conflict_count: 0,
      sync_health: "healthy",
    },
    runtime_control: {
      usage: {
        active_story_count: 1,
        branch_count: 0,
        export_job_count: 0,
      },
      remaining: {
        story_slots: 5,
        export_quota: 8,
        branch_quota: 12,
      },
      ai_budget: {
        capability: "text_generation",
        status: "ready",
        metric_key: "capability_budget_text_generation_usd",
        daily_limit_usd: 30,
        estimated_request_cost_usd: 1.5,
        used_today_usd: 1.5,
        remaining_today_usd: 28.5,
      },
      gates: [],
      notification: {
        effective_channels: ["in_app", "im"],
        enabled_categories: ["export", "risk", "membership", "system"],
        updated_at: "2026-04-03T00:00:00.000Z",
      },
      privacy: {
        open_request_count: 1,
        cooling_off_request_count: 0,
        latest_request_id: "privacy-request-ui-001",
      },
    },
  }),
  fetchPrivacyDataRequests: vi.fn().mockResolvedValue({
    items: [
      {
        id: "privacy-request-ui-001",
        request_type: "export",
        status: "queued",
        cooling_off_until: null,
      },
    ],
  }),
  createPrivacyDataRequest: vi.fn().mockResolvedValue({
    data_request_id: "privacy-ui-001",
    status: "queued",
    due_at: "2026-04-01T00:00:00.000Z",
    cooling_off_until: null,
  }),
}));

describe("privacy view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("renders privacy scopes, trust links, and supports creating scoped requests", async () => {
    render(<PrivacyView />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-openid-privacy-ui",
        target_route: "/profile/account/privacy",
      });
      expect(fetchAccountOverview).toHaveBeenCalledWith("wx-openid-privacy-ui");
      expect(fetchPrivacyDataRequests).toHaveBeenCalledWith("wx-openid-privacy-ui");
    });

    await waitFor(() => {
      expect(screen.getByTestId("privacy-page").textContent).toContain("数据能带走，也能要求删除");
      expect(screen.getByTestId("privacy-page").textContent).toContain("范围按账户、故事、资产拆开");
      expect(screen.getByTestId("privacy-page").textContent).toContain("别让用户重复提交同一件事");
    });

    expect(screen.getByRole("link", { name: "举报与求助" }).getAttribute("href")).toContain(
      "/report/new?surface=settings",
    );
    expect(screen.getByRole("link", { name: "服务协议" }).getAttribute("href")).toContain("/legal/terms");
    expect(screen.getByRole("link", { name: "隐私政策" }).getAttribute("href")).toContain("/legal/privacy");
    expect(screen.getByRole("link", { name: "作品标识说明" }).getAttribute("href")).toContain("/legal/aigc");

    fireEvent.click(screen.getByRole("button", { name: "导出我的资料" }));
    fireEvent.click(screen.getByRole("button", { name: "提交数据请求" }));

    await waitFor(() => {
      expect(createPrivacyDataRequest).toHaveBeenCalledWith({
        account_token: "wx-openid-privacy-ui",
        request_type: "export",
        scope: "account",
        story_id: "story-privacy-ui",
      });
      expect(screen.getByTestId("privacy-request-state").textContent).toContain("已收到，正在排队处理中");
    });
  });

  it("uses story-scoped delete requests when the reader asks to remove one story", async () => {
    window.sessionStorage.clear();
    vi.mocked(createPrivacyDataRequest).mockResolvedValueOnce({
      data_request_id: "privacy-ui-delete-001",
      status: "cooling_off",
      due_at: "2026-04-01T00:00:00.000Z",
      cooling_off_until: "2026-04-04T00:00:00.000Z",
    });

    render(<PrivacyView />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-openid-privacy-ui",
        target_route: "/profile/account/privacy",
      });
      expect(fetchAccountOverview).toHaveBeenCalledWith("wx-openid-privacy-ui");
    });

    fireEvent.click(screen.getByRole("button", { name: "申请删除故事数据" }));
    expect(screen.getByTestId("privacy-page").textContent).toContain("当前这本故事");

    fireEvent.click(screen.getByRole("button", { name: "提交数据请求" }));

    await waitFor(() => {
      expect(createPrivacyDataRequest).toHaveBeenCalledWith({
        account_token: "wx-openid-privacy-ui",
        request_type: "delete",
        scope: "story",
        story_id: "story-privacy-ui",
      });
      expect(screen.getByTestId("privacy-request-state").textContent).toContain("冷静期内，仍可撤回");
    });
  });
});
