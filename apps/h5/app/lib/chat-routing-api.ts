import type {
  ChatMessageResponse,
  ChatContextResolveResponse,
  QuickActionView,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

function createClientMessageId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function resolveChatContext(input: {
  route_decision_id: string;
  selected_story_id?: string;
  fallback_mode?: "new_story" | "recent_notes";
}) {
  const response = await fetch(`${apiBaseUrl()}/chat/context/resolve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to resolve chat context");
  }

  const payload = (await response.json()) as {
    data: ChatContextResolveResponse;
  };

  return payload.data;
}

export async function fetchQuickActions(input: {
  story_id?: string | null;
  chapter_id?: string | null;
  surface: "chat" | "room";
}) {
  const params = new URLSearchParams({
    surface: input.surface,
  });

  if (input.story_id) {
    params.set("story_id", input.story_id);
  }

  if (input.chapter_id) {
    params.set("chapter_id", input.chapter_id);
  }

  const response = await fetch(`${apiBaseUrl()}/chat/quick-actions?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch quick actions");
  }

  const payload = (await response.json()) as {
    data: {
      actions: QuickActionView[];
    };
  };

  return payload.data.actions;
}

export async function sendChatMessage(input: {
  account_token: string;
  text: string;
  active_story_id?: string | null;
}): Promise<ChatMessageResponse> {
  const response = await fetch(`${apiBaseUrl()}/chat/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel_message_id: createClientMessageId("h5-chat"),
      channel: "h5",
      account_token: input.account_token,
      text: input.text,
      client_context: {
        source_surface: "chat",
        active_story_id: input.active_story_id ?? null,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to send chat message");
  }

  const payload = (await response.json()) as {
    data: ChatMessageResponse;
  };

  return payload.data;
}
