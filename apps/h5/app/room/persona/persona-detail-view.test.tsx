import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonaDetailView } from "./persona-detail-view";
import { fetchRoomPersona } from "../../lib/room-api";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=fake-token&storyId=story-room-ui"),
}));

vi.mock("../../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_id: "account-room-ui",
    account_token: "wx-openid-room-ui",
    target_route: "/room",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("../../lib/room-api", () => ({
  fetchRoomPersona: vi.fn().mockResolvedValue({
    snapshot_status: "snapshot_ready",
    state_snapshot: {
      snapshot_id: "snapshot-room-ui",
      label: "《雨夜列车》的最新章节正摊在灯下。",
      state: "writing",
      state_code: "writing",
      mood_tags: ["最新章节"],
      reason_refs: [
        {
          ref_type: "story_workspace",
          ref_id: "story-room-ui",
          label: "当前故事：雨夜列车",
        },
      ],
      generated_at: "2099-01-01T00:00:00.000Z",
    },
    recent_transitions: [
      {
        snapshot_id: "snapshot-room-ui",
        state_code: "writing",
        label: "《雨夜列车》的最新章节正摊在灯下。",
        generated_at: "2099-01-01T00:00:00.000Z",
      },
    ],
    recommended_actions: [
      {
        action_code: "open_current_chapter",
        label: "继续阅读当前章节",
        route: "/stories/story-room-ui/chapters/chapter-room-ui",
        emphasis: "primary",
      },
    ],
  }),
}));

describe("persona detail view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders persona detail, transitions, and actions", async () => {
    render(<PersonaDetailView />);

    await waitFor(() => {
      expect(fetchRoomPersona).toHaveBeenCalledWith({
        account_token: "wx-openid-room-ui",
        story_id: "story-room-ui",
      });
    });

    expect(screen.getByTestId("room-persona-state-code").textContent).toContain("正在往下写");
    expect(screen.getByTestId("room-persona-page").textContent).toContain("房间状态档案");
    expect(screen.getByTestId("room-persona-page").textContent).not.toContain("这次入口没接稳");
    expect(screen.getByTestId("room-persona-page").textContent).toContain("我为什么会变成这样");
    expect(screen.getByTestId("room-persona-reasons").textContent).toContain("当前故事");
    expect(screen.getByTestId("room-persona-page").textContent).toContain("最近怎么变过来");
    expect(screen.getByTestId("room-persona-transitions").textContent).toContain("正在往下写");
    expect(screen.getByTestId("room-persona-page").textContent).toContain("你现在最适合怎么接我");
    expect(screen.getByTestId("room-persona-actions").textContent).toContain("继续阅读当前章节");
    expect(screen.getByRole("link", { name: "返回房间" }).getAttribute("href")).toBe("/room?storyId=story-room-ui");
  });
});
