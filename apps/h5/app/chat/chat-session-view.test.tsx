import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSessionView } from "./chat-session-view";
import { fetchReaderProfile } from "../lib/profile-api";
import { fetchArchiveIntents } from "../lib/archive-intents-api";
import { sendChatMessage } from "../lib/chat-routing-api";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=fake-token&storyId=story-chat-test"),
}));

vi.mock("../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_id: "account-chat-test",
    account_token: "wx-openid-chat-test",
    target_route: "/chat",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("../lib/profile-api", () => ({
  fetchReaderProfile: vi.fn().mockResolvedValue({
    profile_id: "profile-chat-test",
    account_id: "account-chat-test",
    reading_archive: { favorite_books: ["房思琪的初恋乐园"] },
    taste_archive: {
      relationship_preference: ["慢热拉扯"],
      pace: "slow-burn",
      emotion: "dense",
      ending: "bittersweet",
    },
    boundaries: { red_lines: ["羞辱桥段"] },
    collaboration_mode: "co_create",
    safety_mode: "default",
    profile_status: "draft",
    last_confirmed_at: null,
    completion_status: {
      state: "collecting",
      captured_dimensions: ["reading_archive"],
      pending_dimensions: ["taste_archive", "boundaries", "collaboration_mode"],
      conversation_cue: "你更想看哪种情绪密度和结局感？",
    },
  }),
  submitOnboardingStep: vi.fn(),
}));

vi.mock("../lib/chat-routing-api", () => ({
  sendChatMessage: vi.fn().mockResolvedValue({
    routing: {
      route_decision_id: "route-chat-send-001",
      status: "auto_resolved",
      route_mode: "auto",
      confidence_score: 0.81,
      confidence_band: "high",
      selected_story_id: "story-chat-test",
      selected_story_title: "玻璃海",
      candidates: [],
    },
    ack: {
      ack_copy: "这句我先替你记到《玻璃海》里。",
    },
    follow_up_actions: [
      {
        action_key: "continue_story",
        label: "继续这条故事线",
        intent_type: "story_context",
        requires_story: true,
        requires_chapter: false,
        tracking_payload: {},
      },
    ],
  }),
  fetchQuickActions: vi.fn().mockResolvedValue([
    {
      action_key: "continue_story",
      label: "继续这条故事线",
      intent_type: "quick_action",
      requires_story: true,
      requires_chapter: false,
      tracking_payload: {},
    },
    {
      action_key: "check_archive",
      label: "去最近记下",
      intent_type: "quick_action",
      requires_story: true,
      requires_chapter: false,
      tracking_payload: {},
    },
  ]),
  resolveChatContext: vi.fn(),
}));

vi.mock("../lib/archive-intents-api", () => ({
  fetchArchiveIntents: vi.fn().mockResolvedValue({
    items: [
      {
        intent_id: "intent-chat-thread-001",
        intent_envelope_id: "envelope-chat-thread-001",
        intent_type: "recent_note",
        message_text: "先把这句放进《玻璃海》。",
        ack_copy: "这句我先替你记到《玻璃海》里。",
        target_type: "story_workspace",
        target_id: "story-chat-test",
        target_label: "《玻璃海》",
        target_object: {
          object_type: "workspace",
          object_id: "story-chat-test",
          object_label: "《玻璃海》",
        },
        proposed_patch: {
          note_text: "先把这句放进《玻璃海》。",
        },
        confidence: {
          score: 0.92,
          band: "high",
        },
        route_hint: "scene_writer",
        correction_state: {
          status: "recorded",
          entry_deep_link: "/chat?token=fake-token",
          last_corrected_at: null,
        },
        status: "acknowledged",
        version_no: 1,
      },
    ],
    next_cursor: null,
  }),
}));

describe("chat session view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders a persona-first onboarding surface with progress, chips, and next-step CTAs", async () => {
    render(<ChatSessionView />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-page").textContent).toContain("先说一句，我边聊边把你认准");
    });

    await waitFor(() => {
      expect(screen.getByTestId("chat-page").textContent).toContain("还差这一两步，我就能更稳地继续接");
    });

    expect(screen.getByTestId("chat-page").textContent).toContain("默认私密");
    expect(screen.getByTestId("chat-page").textContent).not.toContain("这次入口没接稳");
    expect(screen.getByTestId("chat-quick-actions").textContent).toContain("继续这条故事线");
    expect(fetchArchiveIntents).toHaveBeenCalledWith("wx-openid-chat-test");
    expect(screen.getByTestId("chat-thread-panel").textContent).toContain("先把这句放进《玻璃海》。");
    expect(screen.getByTestId("chat-thread-panel").textContent).toContain("《玻璃海》");
    expect(screen.getByTestId("chat-thread-panel").textContent).toContain("已经记下");
    expect(screen.getByRole("link", { name: /看第一轮方向/ }).getAttribute("href")).toContain("/stories/new");
    expect(screen.getByRole("link", { name: /回房间看进度/ }).getAttribute("href")).toContain("/room");
    expect(screen.getByRole("link", { name: /反馈与求助/ }).getAttribute("href")).toContain("/feedback?surface=chat");
    expect(screen.getByRole("link", { name: /反馈与求助/ }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByRole("link", { name: /反馈与求助/ }).getAttribute("href")).not.toContain("account_token=");
  });

  it("falls back to a safe onboarding step when legacy profile payload omits completion_status", async () => {
    vi.mocked(fetchReaderProfile).mockResolvedValueOnce({
      profile_id: "profile-chat-legacy",
      account_id: "account-chat-test",
      reading_archive: { favorite_books: [] },
      taste_archive: {
        relationship_preference: [],
        pace: "",
        emotion: "",
        ending: "",
      },
      boundaries: { red_lines: [] },
      collaboration_mode: "read_only",
      safety_mode: "default",
      profile_status: "draft",
      last_confirmed_at: null,
    } as never);

    render(<ChatSessionView />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-page").textContent).toContain("还差这一两步，我就能更稳地继续接");
    });

    expect(screen.getByTestId("chat-onboarding-progress").textContent).toContain("阅读自传");
  });

  it("submits a real chat message from the h5 thread and refreshes ack/object landing", async () => {
    vi.mocked(fetchReaderProfile).mockResolvedValueOnce({
      profile_id: "profile-chat-confirmed",
      account_id: "account-chat-test",
      reading_archive: { favorite_books: ["房思琪的初恋乐园"] },
      taste_archive: {
        relationship_preference: ["慢热拉扯"],
        pace: "slow-burn",
        emotion: "dense",
        ending: "bittersweet",
      },
      boundaries: { red_lines: ["羞辱桥段"] },
      collaboration_mode: "co_create",
      safety_mode: "default",
      profile_status: "confirmed",
      last_confirmed_at: "2099-01-01T00:00:00.000Z",
      completion_status: {
        state: "confirmed",
        captured_dimensions: ["reading_archive", "taste_archive", "boundaries", "collaboration_mode"],
        pending_dimensions: [],
        conversation_cue: null,
      },
    } as never);

    vi.mocked(fetchArchiveIntents)
      .mockResolvedValueOnce({
        items: [
          {
            intent_id: "intent-chat-thread-001",
            intent_envelope_id: "envelope-chat-thread-001",
            intent_type: "recent_note",
            message_text: "先把这句放进《玻璃海》。",
            ack_copy: "这句我先替你记到《玻璃海》里。",
            target_type: "story_workspace",
            target_id: "story-chat-test",
            target_label: "《玻璃海》",
            target_object: {
              object_type: "workspace",
              object_id: "story-chat-test",
              object_label: "《玻璃海》",
            },
            proposed_patch: {
              note_text: "先把这句放进《玻璃海》。",
            },
            confidence: {
              score: 0.92,
              band: "high",
            },
            route_hint: "scene_writer",
            correction_state: {
              status: "recorded",
              entry_deep_link: "/chat?token=fake-token",
              last_corrected_at: null,
            },
            status: "acknowledged",
            version_no: 1,
          },
        ],
        next_cursor: null,
      } as never)
      .mockResolvedValueOnce({
        items: [
          {
            intent_id: "intent-chat-thread-002",
            intent_envelope_id: "envelope-chat-thread-002",
            intent_type: "story_context",
            message_text: "把这一句再暧昧一点。",
            ack_copy: "这句我先替你记到《玻璃海》里。",
            target_type: "story_workspace",
            target_id: "story-chat-test",
            target_label: "《玻璃海》",
            target_object: {
              object_type: "workspace",
              object_id: "story-chat-test",
              object_label: "《玻璃海》",
            },
            proposed_patch: {
              note_text: "把这一句再暧昧一点。",
            },
            confidence: {
              score: 0.94,
              band: "high",
            },
            route_hint: "scene_writer",
            correction_state: {
              status: "recorded",
              entry_deep_link: "/chat?token=fake-token",
              last_corrected_at: null,
            },
            status: "acknowledged",
            version_no: 1,
          },
        ],
        next_cursor: null,
      } as never);

    render(<ChatSessionView />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-thread-panel").textContent).toContain("先把这句放进《玻璃海》。");
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送这句" })).not.toBeNull();
    });

    fireEvent.change(screen.getByLabelText("聊天输入框"), {
      target: { value: "把这一句再暧昧一点。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送这句" }));

    await waitFor(() => {
      expect(sendChatMessage).toHaveBeenCalledWith({
        account_token: "wx-openid-chat-test",
        text: "把这一句再暧昧一点。",
        active_story_id: "story-chat-test",
      });
      expect(screen.getByTestId("chat-ack-copy").textContent).toContain("《玻璃海》");
      expect(screen.getByTestId("chat-thread-panel").textContent).toContain("把这一句再暧昧一点。");
    });
  });
});
