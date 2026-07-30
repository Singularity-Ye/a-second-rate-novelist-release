import type {
  ChapterAcceptResponse,
  ChapterRevisionResponse,
  ChapterView,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchChapter(story_id: string, chapter_id: string) {
  const response = await fetch(
    `${apiBaseUrl()}/stories/${encodeURIComponent(story_id)}/chapters/${encodeURIComponent(chapter_id)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch chapter");
  }

  const payload = (await response.json()) as {
    data: ChapterView;
  };

  return payload.data;
}

export async function acceptChapter(chapter_id: string) {
  const response = await fetch(`${apiBaseUrl()}/chapters/${encodeURIComponent(chapter_id)}/accept`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_request_id: `accept-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to accept chapter");
  }

  const payload = (await response.json()) as { data: ChapterAcceptResponse };
  return payload.data;
}

export async function createChapterRevision(input: {
  chapter_id: string;
  revision_kind: "rewrite" | "light_edit";
  instruction_text: string;
  anchor_range?: {
    start_paragraph: number;
    end_paragraph: number;
  };
}) {
  const response = await fetch(
    `${apiBaseUrl()}/chapters/${encodeURIComponent(input.chapter_id)}/revisions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        revision_kind: input.revision_kind,
        instruction_text: input.instruction_text,
        anchor_range: input.anchor_range,
        client_request_id: `${input.revision_kind}-${Date.now()}`,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to create chapter revision");
  }

  const payload = (await response.json()) as { data: ChapterRevisionResponse };
  return payload.data;
}
