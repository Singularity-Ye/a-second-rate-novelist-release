import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsView } from "./notifications-view";
import { fetchNotifications, updateNotificationPreferences } from "../lib/account-membership-api";
import { issueSessionToken } from "../lib/session-bridge";

const mockState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("account_token=wx-openid-notifications-ui"),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockState.searchParams,
}));

vi.mock("../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "notifications-issued-token",
    expires_at: "2026-04-18T00:30:00.000Z",
    target_route: "/notifications",
  }),
}));

vi.mock("../lib/account-membership-api", () => ({
  fetchNotifications: vi.fn().mockResolvedValue({
    items: [
      {
        notification_id: "notification-ui-001",
        category: "membership",
        title: "会员已升级",
        body: "权益已经刷新。",
        status: "delivered",
        source_type: "membership_order",
        created_at: "2026-04-17T10:00:00.000Z",
        target_route: "/profile/account/membership",
      },
      {
        notification_id: "notification-ui-002",
        category: "system",
        title: "同步冲突待处理",
        body: "请前往同步页解决。",
        status: "delivered",
        source_type: "sync_conflict",
        created_at: "2026-04-17T10:05:00.000Z",
        target_route: "/profile/account/sync",
      },
    ],
    preference_summary: {
      in_app_enabled: true,
      push_enabled: false,
      im_enabled: false,
      quiet_hours_enabled: true,
      quiet_hours_start_local: "22:00",
      quiet_hours_end_local: "08:00",
    },
  }),
  updateNotificationPreferences: vi.fn().mockResolvedValue({
    preference_version: 1,
    effective_channels: ["in_app"],
    next_quiet_window: null,
  }),
}));

describe("notifications view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockState.searchParams = new URLSearchParams("account_token=wx-openid-notifications-ui");
  });

  it("renders the room inbox cadence controls and keeps unopened channels explicit", async () => {
    render(<NotificationsView />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-openid-notifications-ui",
        target_route: "/notifications",
      });
      expect(fetchNotifications).toHaveBeenCalledWith({
        account_token: "wx-openid-notifications-ui",
        category: null,
        unread_only: false,
        story_id: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("notifications-page").textContent).toContain("通知中心只收可信提醒");
      expect(screen.getByTestId("notifications-page").textContent).toContain("房间邮箱");
      expect(screen.getByTestId("notifications-page").textContent).toContain("站外提醒暂未开放");
      expect(screen.getByTestId("notifications-page").textContent).toContain("固定开启");
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /会员消息 · 会员已升级/ }).getAttribute("href")).toContain(
      "/profile/account/membership",
    );
    expect(screen.getByRole("link", { name: /会员消息 · 会员已升级/ }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByRole("link", { name: /会员消息 · 会员已升级/ }).getAttribute("href")).not.toContain(
      "account_token=",
    );

    fireEvent.click(screen.getByRole("button", { name: "保存房间邮箱节奏" }));
    await waitFor(() => {
      expect(updateNotificationPreferences).toHaveBeenCalledWith({
        account_token: "wx-openid-notifications-ui",
        in_app_enabled: true,
        push_enabled: false,
        im_enabled: false,
        quiet_hours_enabled: true,
        quiet_hours_start_local: "22:00",
        quiet_hours_end_local: "08:00",
        time_zone: "Asia/Shanghai",
        export_enabled: true,
        risk_enabled: true,
        membership_enabled: true,
        system_enabled: true,
      });
    });
  });

  it("renders an honest empty inbox state with a clear next step instead of an empty list shell", async () => {
    mockState.searchParams = new URLSearchParams(
      "account_token=wx-openid-notifications-ui&story_id=story-notification-empty",
    );
    vi.mocked(fetchNotifications).mockResolvedValueOnce({
      items: [],
      preference_summary: {
        in_app_enabled: true,
        push_enabled: false,
        im_enabled: false,
        quiet_hours_enabled: false,
        quiet_hours_start_local: "22:00",
        quiet_hours_end_local: "08:00",
      },
    });

    render(<NotificationsView />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-openid-notifications-ui",
        target_route: "/notifications",
      });
      expect(fetchNotifications).toHaveBeenCalledWith({
        account_token: "wx-openid-notifications-ui",
        category: null,
        unread_only: false,
        story_id: "story-notification-empty",
      });
    });

    expect(screen.getByTestId("notifications-page").textContent).toContain("邮箱暂时还没有新回信");
    expect(screen.getByRole("link", { name: "回到这本书的故事中枢" }).getAttribute("href")).toBe(
      "/stories/story-notification-empty",
    );
    expect(screen.getByRole("link", { name: "回房间看看" }).getAttribute("href")).toBe(
      "/room?story_id=story-notification-empty",
    );
  });

  it("keeps generic bookshelf reminders inside the current story context when story_id is known", async () => {
    mockState.searchParams = new URLSearchParams(
      "account_token=wx-openid-notifications-ui&story_id=story-notification-route",
    );
    vi.mocked(fetchNotifications).mockResolvedValueOnce({
      items: [
        {
          notification_id: "notification-ui-003",
          category: "system",
          title: "提案已备好",
          body: "回故事中枢拍板。",
          status: "delivered",
          source_type: "proposal_ready",
          created_at: "2026-04-17T10:10:00.000Z",
          target_route: "/stories",
        },
      ],
      preference_summary: {
        in_app_enabled: true,
        push_enabled: false,
        im_enabled: false,
        quiet_hours_enabled: false,
        quiet_hours_start_local: "22:00",
        quiet_hours_end_local: "08:00",
      },
    });

    render(<NotificationsView />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /提案已备好/ }).getAttribute("href")).toBe(
        "/stories/story-notification-route",
      );
    });
  });
});
