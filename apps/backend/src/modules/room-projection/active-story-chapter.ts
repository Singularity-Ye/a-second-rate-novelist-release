import type { AppState } from "../../common/store.js";

type ChapterRecord = Pick<
  AppState["chapters"][number],
  "id" | "story_id" | "chapter_no" | "title" | "status" | "updated_at"
>;

type StoryWorkspaceRecord = AppState["storyWorkspaces"][number];
type StoryEventRecord = AppState["eventLogs"][number];

export interface ActiveStoryChapter {
  chapter_id: string;
  title: string;
  route: string;
  status: ChapterRecord["status"];
  source: "workspace_current" | "latest_readable";
}

function isReadableChapter(chapter: ChapterRecord) {
  return chapter.status === "generated" || chapter.status === "accepted";
}

function sortLatestChapter(left: ChapterRecord, right: ChapterRecord) {
  if (right.chapter_no !== left.chapter_no) {
    return right.chapter_no - left.chapter_no;
  }

  return right.updated_at.localeCompare(left.updated_at);
}

const workspaceSortOrder: Record<StoryWorkspaceRecord["workspace_status"], number> = {
  active: 0,
  draft: 1,
  paused: 2,
  archived: 3,
};

function sortVisibleWorkspaces(left: StoryWorkspaceRecord, right: StoryWorkspaceRecord) {
  const statusGap = workspaceSortOrder[left.workspace_status] - workspaceSortOrder[right.workspace_status];
  if (statusGap !== 0) {
    return statusGap;
  }

  return right.updated_at.localeCompare(left.updated_at);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStoryIdFromPayload(payload: Record<string, unknown>) {
  return (
    readOptionalString(payload.story_id) ??
    readOptionalString(payload.entry_story_id) ??
    readOptionalString(payload.active_story_id)
  );
}

function readStoryIdFromRoute(targetRoute: string | null) {
  if (!targetRoute) {
    return null;
  }

  const storyPathMatch = targetRoute.match(/\/stories\/([^/?#]+)/);
  if (storyPathMatch?.[1]) {
    return decodeURIComponent(storyPathMatch[1]);
  }

  try {
    const url = new URL(targetRoute, "http://127.0.0.1");
    return url.searchParams.get("story_id") ?? url.searchParams.get("storyId");
  } catch {
    return null;
  }
}

export function resolveActiveStoryWorkspace(input: {
  account_id: string;
  story_id?: string | null;
  workspaces: StoryWorkspaceRecord[];
  event_logs: StoryEventRecord[];
}): StoryWorkspaceRecord | null {
  const accountWorkspaces = input.workspaces.filter((item) => item.account_id === input.account_id);

  if (input.story_id) {
    const explicitWorkspace = accountWorkspaces.find((item) => item.id === input.story_id) ?? null;
    if (explicitWorkspace) {
      return explicitWorkspace;
    }
  }

  const visibleWorkspaces = accountWorkspaces
    .filter((item) => item.workspace_status !== "archived")
    .sort(sortVisibleWorkspaces);

  if (visibleWorkspaces.length === 0) {
    return null;
  }

  if (visibleWorkspaces.length === 1) {
    return visibleWorkspaces[0] ?? null;
  }

  const visibleStoryIds = new Set(visibleWorkspaces.map((item) => item.id));
  const events = [...input.event_logs]
    .filter((item) => item.account_id === input.account_id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));

  for (const event of events) {
    const fromPayload = readStoryIdFromPayload(event.payload);
    if (fromPayload && visibleStoryIds.has(fromPayload)) {
      return accountWorkspaces.find((item) => item.id === fromPayload) ?? null;
    }

    const fromRoute = readStoryIdFromRoute(readOptionalString(event.payload.target_route));
    if (fromRoute && visibleStoryIds.has(fromRoute)) {
      return accountWorkspaces.find((item) => item.id === fromRoute) ?? null;
    }
  }

  return null;
}

export function resolveActiveStoryChapter(input: {
  story_id: string;
  current_chapter_id?: string | null;
  chapters: ChapterRecord[];
}): ActiveStoryChapter | null {
  const storyChapters = input.chapters.filter(
    (item) => item.story_id === input.story_id && isReadableChapter(item),
  );

  const currentChapter =
    (input.current_chapter_id
      ? storyChapters.find((item) => item.id === input.current_chapter_id) ?? null
      : null) ?? null;

  if (currentChapter) {
    return {
      chapter_id: currentChapter.id,
      title: currentChapter.title,
      route: `/stories/${input.story_id}/chapters/${currentChapter.id}`,
      status: currentChapter.status,
      source: "workspace_current",
    };
  }

  if (input.current_chapter_id) {
    return {
      chapter_id: input.current_chapter_id,
      title: "当前章节",
      route: `/stories/${input.story_id}/chapters/${input.current_chapter_id}`,
      status: "accepted",
      source: "workspace_current",
    };
  }

  if (storyChapters.length === 0) {
    return null;
  }

  const latestChapter = [...storyChapters].sort(sortLatestChapter)[0] ?? null;

  if (!latestChapter) {
    return null;
  }

  return {
    chapter_id: latestChapter.id,
    title: latestChapter.title,
    route: `/stories/${input.story_id}/chapters/${latestChapter.id}`,
    status: latestChapter.status,
    source: "latest_readable",
  };
}
