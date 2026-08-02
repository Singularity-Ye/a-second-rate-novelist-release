import type { ChatSessionResponse } from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

function createGuestId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toRoomDeepLink(target: string) {
  const url = new URL(target, "http://127.0.0.1:3000");
  url.pathname = "/room";
  return `${url.pathname}${url.search}${url.hash}`;
}

function toChatDeepLink(target: string) {
  const url = new URL(target, "http://127.0.0.1:3000");
  url.pathname = "/chat";
  return `${url.pathname}${url.search}${url.hash}`;
}

async function createGuestSession(input: {
  channelMessageIdPrefix: string;
  text: string;
  sourceSurface: "chat" | "room";
}) {
  const response = await fetch(`${apiBaseUrl()}/chat/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel_message_id: createGuestId(input.channelMessageIdPrefix),
      channel: "h5",
      account_token: createGuestId("h5-guest"),
      text: input.text,
      client_context: {
        source_surface: input.sourceSurface,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      input.sourceSurface === "chat" ? "Failed to create guest chat session" : "Failed to create guest room session",
    );
  }

  const payload = (await response.json()) as {
    data: ChatSessionResponse;
  };

  return payload.data.deep_link;
}

export async function createGuestChatSession(): Promise<string> {
  const deepLink = await createGuestSession({
    channelMessageIdPrefix: "h5-chat-entry",
    text: "我想马上开始，先带我进入第一轮体验。",
    sourceSurface: "chat",
  });

  return toChatDeepLink(deepLink);
}

export async function createGuestRoomSession(): Promise<string> {
  const deepLink = await createGuestSession({
    channelMessageIdPrefix: "h5-room-entry",
    text: "先带我进入房间看看。",
    sourceSurface: "room",
  });

  return toRoomDeepLink(deepLink);
}
