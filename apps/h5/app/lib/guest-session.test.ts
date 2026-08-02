import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuestChatSession, createGuestRoomSession } from "./guest-session";

describe("guest session helper", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes immediate-start deep links to the chat root", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          deep_link: "http://127.0.0.1:3000/chat?token=guest-chat-token",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("crypto", {
      randomUUID: () => "guest-uuid",
    });

    await expect(createGuestChatSession()).resolves.toBe("/chat?token=guest-chat-token");

    const [, requestInit] = fetchSpy.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(requestInit.body)).toMatchObject({
      channel_message_id: "h5-chat-entry-guest-uuid",
      channel: "h5",
      account_token: "h5-guest-guest-uuid",
      text: "我想马上开始，先带我进入第一轮体验。",
      client_context: {
        source_surface: "chat",
      },
    });
  });

  it("normalizes bootstrap deep links to the room root", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          deep_link: "http://127.0.0.1:3000/chat?token=guest-token",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("crypto", {
      randomUUID: () => "guest-uuid",
    });

    await expect(createGuestRoomSession()).resolves.toBe("/room?token=guest-token");

    const [, requestInit] = fetchSpy.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(requestInit.body)).toMatchObject({
      channel_message_id: "h5-room-entry-guest-uuid",
      client_context: {
        source_surface: "room",
      },
    });
  });
});
