import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomSessionView } from "./room-session-view";
import { fetchRoomOverview } from "../lib/room-api";
import { exchangeSessionToken } from "../lib/session-bridge";

let mockSearchParams = new URLSearchParams("token=fake-token&storyId=story-room-ui&fallback=computer");
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push,
  }),
}));

vi.mock("../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_id: "account-room-ui",
    account_token: "wx-openid-room-ui",
    target_route: "/room",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("../lib/room-api", () => ({
  fetchRoomOverview: vi.fn().mockResolvedValue({
    snapshot_status: "snapshot_ready",
    persona_state: {
      snapshot_id: "snapshot-room-ui",
      label: "电脑上正亮着最新章节",
      state: "writing",
      state_code: "writing",
      mood_tags: ["最新章节", "继续推进"],
      reason_refs: [
        {
          ref_type: "story_workspace",
          ref_id: "story-room-ui",
          label: "当前故事：雨夜列车",
        },
      ],
      generated_at: "2099-01-01T00:00:00.000Z",
    },
    room_visual_tokens: {
      ambience: "focused",
      desk_state: "open_chapter",
      lighting: "bright",
    },
    current_story_card: {
      story_id: "story-room-ui",
      title: "雨夜列车",
      workspace_status: "active",
      current_chapter_id: "chapter-room-ui",
      chapter_deep_link: "/stories/story-room-ui/chapters/chapter-room-ui",
    },
    objects: [
      {
        hotspot_code: "desk",
        label: "书桌",
        description: "回到书架，继续整理当前连载。",
        state: "active",
        target_route: "/stories",
        entry_story_id: null,
      },
      {
        hotspot_code: "computer",
        label: "电脑",
        description: "继续打开当前章节。",
        state: "active",
        target_route: "/stories/story-room-ui/chapters/chapter-room-ui",
        entry_story_id: "story-room-ui",
      },
      {
        hotspot_code: "bookshelf",
        label: "书架",
        description: "Phase 1 启用后承接资产库。",
        state: "disabled",
        target_route: "/assets",
        entry_story_id: "story-room-ui",
      },
      {
        hotspot_code: "archive_profile",
        label: "档案柜",
        description: "查看这本书的作品权利服务、证据包和对外带走入口。",
        state: "active",
        target_route: "/profile?story_id=story-room-ui",
        entry_story_id: null,
      },
      {
        hotspot_code: "sticky_wall",
        label: "便签墙",
        description: "Phase 1 启用后承接伏笔与待办。",
        state: "disabled",
        target_route: "/stories/story-room-ui",
        entry_story_id: "story-room-ui",
      },
      {
        hotspot_code: "mailbox",
        label: "邮箱",
        description: "看提醒。",
        state: "active",
        target_route: "/notifications?story_id=story-room-ui",
        entry_story_id: "story-room-ui",
      },
    ],
    recent_notifications: [
      {
        notification_id: "notification-room-ui",
        title: "雨夜列车 第一章已送达",
        body: "可以直接打开阅读器继续往下看。",
        status: "unread",
        target_route: "/stories/story-room-ui/chapters/chapter-room-ui",
      },
    ],
    pending_actions: [
      {
        action_code: "open_current_chapter",
        label: "继续阅读当前章节",
        route: "/stories/story-room-ui/chapters/chapter-room-ui",
        emphasis: "primary",
      },
      {
        action_code: "open_persona_panel",
        label: "查看作家状态",
        route: "/room/persona?storyId=story-room-ui",
        emphasis: "secondary",
      },
    ],
    fallback_context: {
      reason_code: "ROOM-001",
      title: "电脑上还没有打开的章节",
      message: "先去书桌开个新坑，再回来继续。",
      cta_label: "去书桌",
      target_route: "/stories",
    },
  }),
}));

describe("room session view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    mockSearchParams = new URLSearchParams("token=fake-token&storyId=story-room-ui&fallback=computer");
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the room snapshot with current story, hotspots, notifications, and fallback context", async () => {
    render(<RoomSessionView />);

    await waitFor(() => {
      expect(fetchRoomOverview).toHaveBeenCalledWith({
        account_token: "wx-openid-room-ui",
        story_id: "story-room-ui",
        fallback_target: "computer",
      });
      expect(screen.getByTestId("room-current-story-card").textContent).toContain("雨夜列车");
    });

    expect(screen.getByTestId("room-persona-state").textContent).toContain("电脑上正亮着最新章节");
    expect(screen.getByTestId("room-persona-reasons").textContent).toContain("当前故事");
    expect(screen.getByTestId("room-page").textContent).toContain("他正在主导《雨夜列车》的下一章");
    expect(screen.getByTestId("room-object-panel").textContent).toContain("不用先背房间地图");
    expect(screen.getByTestId("room-secondary-paths").textContent).toContain("回信、最近记下和更多入口");
    expect(screen.getByRole("link", { name: "查看作家状态", hidden: true }).getAttribute("href")).toBe(
      "/room/persona?storyId=story-room-ui",
    );
    expect(screen.getByTestId("room-object-desk").querySelector("a")?.getAttribute("href")).toBe("/stories");
    expect(screen.getByTestId("room-object-computer").querySelector("a")?.getAttribute("href")).toBe(
      "/stories/story-room-ui/chapters/chapter-room-ui",
    );
    expect(screen.getByTestId("room-object-archive_profile").querySelector("a")?.getAttribute("href")).toBe(
      "/profile?story_id=story-room-ui",
    );
    expect(screen.getByTestId("room-object-mailbox").querySelector("a")?.getAttribute("href")).toBe(
      "/notifications?story_id=story-room-ui",
    );
    expect(screen.getByTestId("room-current-story-card").textContent).toContain("打开故事中枢");
    expect(screen.getByTestId("room-story-center-entry").textContent).toContain("我的和最近记下");
    expect(
      within(screen.getByTestId("room-story-center-entry")).getByRole("link", { name: /打开我的/, hidden: true }).getAttribute("href"),
    ).toBe(
      "/profile?story_id=story-room-ui",
    );
    expect(
      within(screen.getByTestId("room-story-center-entry")).getByRole("link", { name: /^最近记下 /, hidden: true }).getAttribute("href"),
    ).toBe("/stories/story-room-ui/intents/recent");
    expect(screen.getByTestId("room-notifications").textContent).toContain("房间邮箱");
    expect(
      within(screen.getByTestId("room-notifications")).getByRole("link", { name: "打开通知中心", hidden: true }).getAttribute("href"),
    ).toBe("/notifications?story_id=story-room-ui");
    expect(screen.getByTestId("room-object-bookshelf").textContent).toContain("去资料库");
    expect(screen.getByTestId("room-object-sticky_wall").textContent).toContain("留给伏笔和待补");
    expect(screen.getByTestId("room-fallback-context").textContent).toContain("去书桌");
    expect(screen.getByRole("link", { name: "举报与求助", hidden: true }).getAttribute("href")).toContain(
      "/report/new?surface=room",
    );
    expect(screen.getByRole("link", { name: "举报与求助", hidden: true }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByRole("link", { name: "举报与求助", hidden: true }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "反馈与求助", hidden: true }).getAttribute("href")).toContain("/feedback?surface=room");
    expect(screen.getByRole("link", { name: "反馈与求助", hidden: true }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByRole("link", { name: "反馈与求助", hidden: true }).getAttribute("href")).not.toContain("account_token=");
  });

  it("deduplicates fallback CTA when pending actions already point to the same desk route", async () => {
    vi.mocked(fetchRoomOverview).mockResolvedValueOnce({
      snapshot_status: "snapshot_ready",
      persona_state: {
        snapshot_id: "snapshot-room-ui-fallback",
        label: "房间已经准备好，随时可以开新坑。",
        state: "welcoming",
        state_code: "welcoming",
        mood_tags: ["待开场"],
        reason_refs: [
          {
            ref_type: "system",
            ref_id: "room-ready",
            label: "当前没有活跃故事，房间保持待命。",
          },
        ],
        generated_at: "2099-01-01T00:00:00.000Z",
      },
      room_visual_tokens: {
        ambience: "welcoming",
        desk_state: "clear",
        lighting: "warm",
      },
      current_story_card: null,
      objects: [
        {
          hotspot_code: "desk",
          label: "书桌",
          description: "回到书架，继续整理当前连载。",
          state: "active",
          target_route: "/stories",
          entry_story_id: null,
        },
      ],
      recent_notifications: [],
      pending_actions: [
        {
          action_code: "start_story",
          label: "去书桌开新坑",
          route: "/stories",
          emphasis: "primary",
        },
        {
          action_code: "open_persona_panel",
          label: "查看作家状态",
          route: "/room/persona",
          emphasis: "secondary",
        },
      ],
      fallback_context: {
        reason_code: "ROOM-001",
        title: "电脑上还没有打开的章节",
        message: "先去书桌开个新坑，再回来继续。",
        cta_label: "去书桌",
        target_route: "/stories",
      },
    });

    render(<RoomSessionView />);

    await waitFor(() => {
      expect(screen.getByTestId("room-fallback-context").textContent).toContain("去书桌");
    });

    expect(screen.queryByRole("link", { name: "去书桌开新坑" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "去书桌" })).toHaveLength(1);
    expect(screen.getByTestId("room-object-panel").textContent).toContain("不用先背房间地图");
    expect(screen.queryByTestId("room-story-center-entry")).toBeNull();
  });

  it("keeps hotspot link accessible names scoped to the hotspot label even when descriptions mention other objects", async () => {
    vi.mocked(fetchRoomOverview).mockResolvedValueOnce({
      snapshot_status: "snapshot_ready",
      persona_state: {
        snapshot_id: "snapshot-room-ui-a11y",
        label: "电脑上正亮着最新章节",
        state: "writing",
        state_code: "writing",
        mood_tags: ["最新章节", "继续推进"],
        reason_refs: [
          {
            ref_type: "story_workspace",
            ref_id: "story-room-ui",
            label: "当前故事：雨夜列车",
          },
        ],
        generated_at: "2099-01-01T00:00:00.000Z",
      },
      room_visual_tokens: {
        ambience: "focused",
        desk_state: "open_chapter",
        lighting: "bright",
      },
      current_story_card: {
        story_id: "story-room-ui",
        title: "雨夜列车",
        workspace_status: "active",
        current_chapter_id: "chapter-room-ui",
        chapter_deep_link: "/stories/story-room-ui/chapters/chapter-room-ui",
      },
      objects: [
        {
          hotspot_code: "desk",
          label: "书桌",
          description: "《雨夜列车》在桌上继续推进，另外还有新提案待你拍板。",
          state: "active",
          target_route: "/stories",
          entry_story_id: "story-room-ui",
        },
        {
          hotspot_code: "computer",
          label: "电脑",
          description: "电脑上亮着当前章节，旁边还压着从书架里抽出来的资料。",
          state: "active",
          target_route: "/stories/story-room-ui/chapters/chapter-room-ui",
          entry_story_id: "story-room-ui",
        },
        {
          hotspot_code: "bookshelf",
          label: "书架",
          description: "书架里还没有参考资产，先从私聊或书桌投喂材料。",
          state: "fallback",
          target_route: "/assets",
          entry_story_id: "story-room-ui",
        },
        {
          hotspot_code: "archive_profile",
          label: "档案柜",
          description: "档案柜里收着读者档案，也能顺手回到电脑和当前故事。",
          state: "active",
          target_route: "/profile",
          entry_story_id: null,
        },
        {
          hotspot_code: "mailbox",
          label: "邮箱",
          description: "邮箱会把送达提醒递进来，就算便签墙还在等你整理。",
          state: "active",
          target_route: "/notifications",
          entry_story_id: "story-room-ui",
        },
      ],
      recent_notifications: [],
      pending_actions: [
        {
          action_code: "open_current_chapter",
          label: "继续阅读当前章节",
          route: "/stories/story-room-ui/chapters/chapter-room-ui",
          emphasis: "primary",
        },
        {
          action_code: "open_persona_panel",
          label: "查看作家状态",
          route: "/room/persona?storyId=story-room-ui",
          emphasis: "secondary",
        },
      ],
      fallback_context: null,
    });

    render(<RoomSessionView />);

    await waitFor(() => {
      expect(screen.getByTestId("room-object-desk")).not.toBeNull();
    });

    expect(screen.getAllByRole("link", { name: "书桌" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "电脑" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "书架" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "档案柜" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "邮箱" })).toHaveLength(1);
    expect(screen.getByTestId("room-notifications").textContent).toContain("这本书最近还没有新的房间回信");
    expect(screen.getByTestId("room-notifications").textContent).not.toContain("暂无提醒");
    expect(
      within(screen.getByTestId("room-notifications")).getByRole("link", { name: "继续当前章节", hidden: true }).getAttribute("href"),
    ).toBe(
      "/stories/story-room-ui/chapters/chapter-room-ui",
    );
  });

  it("renders a guest-safe first visit state when there is no token", async () => {
    mockSearchParams = new URLSearchParams("");

    render(<RoomSessionView />);

    await waitFor(() => {
      expect(screen.getByTestId("room-page").textContent).toContain("先从房间开始");
    });

    expect(screen.queryByText("Missing session token.")).toBeNull();
    expect(exchangeSessionToken).not.toHaveBeenCalled();
    expect(fetchRoomOverview).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "先去房间里看看" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "去书架看看" }).getAttribute("href")).toBe("/stories");
    expect(screen.getByRole("link", { name: "打开我的" }).getAttribute("href")).toBe("/profile");
  });

  it("guides an empty room mailbox back to the desk instead of another empty inbox", async () => {
    vi.mocked(fetchRoomOverview).mockResolvedValueOnce({
      snapshot_status: "snapshot_ready",
      persona_state: {
        snapshot_id: "snapshot-room-ui-empty-mailbox",
        label: "房间已经准备好，等下一本书被摊开。",
        state: "welcoming",
        state_code: "welcoming",
        mood_tags: ["待开场"],
        reason_refs: [
          {
            ref_type: "system",
            ref_id: "room-empty-mailbox",
            label: "当前没有活跃故事，房间保持待命。",
          },
        ],
        generated_at: "2099-01-01T00:00:00.000Z",
      },
      room_visual_tokens: {
        ambience: "welcoming",
        desk_state: "clear",
        lighting: "warm",
      },
      current_story_card: null,
      objects: [
        {
          hotspot_code: "mailbox",
          label: "邮箱",
          description: "房间里暂时还没有正在继续的书，先去书桌把要写的那本摊开。",
          state: "fallback",
          target_route: "/stories",
          entry_story_id: null,
        },
      ],
      recent_notifications: [],
      pending_actions: [],
      fallback_context: {
        reason_code: "ROOM-001",
        title: "邮箱里还没有提醒",
        message: "房间里暂时还没有正在继续的书，先去书桌把要写的那本摊开，新的章节、导出和风险结果会先落在这里。",
        cta_label: "去书桌看看",
        target_route: "/stories",
      },
    });

    render(<RoomSessionView />);

    await waitFor(() => {
      expect(screen.getByTestId("room-notifications").textContent).toContain("先去书桌把要写的那本摊开");
    });

    expect(screen.getByTestId("room-object-mailbox").textContent).toContain("先去书桌把要写的那本摊开");
    expect(screen.getByTestId("room-object-mailbox").textContent).toContain("去书桌看看");
    expect(
      within(screen.getByTestId("room-notifications")).getByRole("link", { name: "去书桌看看", hidden: true }).getAttribute("href"),
    ).toBe("/stories");
    expect(screen.getByTestId("room-fallback-context").textContent).toContain("去书桌看看");
  });
});
