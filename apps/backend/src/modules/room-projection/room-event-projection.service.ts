import type { NotificationListResponse, RoomNotificationView } from "@erliu/shared-contracts";
import { readAppState, type AppState } from "../../common/store.js";

type ProjectedSourceType =
  | "proposal_ready"
  | "chapter_accepted"
  | "canon_patched"
  | "task_failed"
  | "export_ready";

interface ProjectedNotificationRecord {
  notification_id: string;
  category: NotificationListResponse["items"][number]["category"];
  title: string;
  body: string;
  status: "unread" | "read" | "delivered" | "seen" | "acted" | "expired";
  source_type: string;
  target_route: string;
  created_at: string;
  story_id: string | null;
}

function normalizeTargetRoute(target_route: string) {
  try {
    const parsed = new URL(target_route);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return target_route;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildChapterRoute(story_id: string | null, chapter_id: string | null) {
  if (story_id && chapter_id) {
    return `/stories/${story_id}/chapters/${chapter_id}`;
  }

  if (story_id) {
    return `/stories/${story_id}`;
  }

  return "/stories";
}

function findStoryTitle(state: AppState, story_id: string | null) {
  if (!story_id) {
    return "当前故事";
  }

  return state.storyWorkspaces.find((item) => item.id === story_id)?.title ?? "当前故事";
}

function toProjectedNotification(
  state: AppState,
  event: AppState["eventLogs"][number],
): ProjectedNotificationRecord | null {
  const payload = event.payload as Record<string, unknown>;
  const story_id = readString(payload.story_id);

  switch (event.event_name) {
    case "proposal_generated": {
      const proposal_count = readNumber(payload.proposal_count) ?? 0;
      return {
        notification_id: `event:${event.event_name}:${event.created_at}`,
        category: "system",
        title: "提案已备好",
        body: proposal_count > 0 ? `新的提案集已生成，共 ${proposal_count} 份，回书桌拍板。` : "新的提案集已生成，回书桌拍板。",
        status: "delivered",
        source_type: "proposal_ready",
        target_route: "/stories",
        created_at: event.created_at,
        story_id: null,
      };
    }
    case "chapter_accepted": {
      const chapter_id = readString(payload.chapter_id);
      const story_title = findStoryTitle(state, story_id);
      const chapter_title =
        (story_id && chapter_id
          ? state.chapters.find((item) => item.story_id === story_id && item.id === chapter_id)?.title
          : null) ?? "最新章节";

      return {
        notification_id: `event:${event.event_name}:${chapter_id ?? event.created_at}`,
        category: "chapter_update",
        title: `${story_title} 已推进`,
        body: `${chapter_title} 已被接受并写回主线，可以直接打开阅读器继续。`,
        status: "delivered",
        source_type: "chapter_accepted",
        target_route: buildChapterRoute(story_id, chapter_id),
        created_at: event.created_at,
        story_id,
      };
    }
    case "continuity_patch_applied": {
      const resolved_issue_count = readNumber(payload.resolved_issue_count) ?? 0;
      const story_title = findStoryTitle(state, story_id);
      return {
        notification_id: `event:${event.event_name}:${readString(payload.patch_id) ?? event.created_at}`,
        category: "system",
        title: `${story_title} 设定已补齐`,
        body:
          resolved_issue_count > 0
            ? `已收口 ${resolved_issue_count} 条待修问题，便签墙上的状态已经同步。`
            : "这次设定修补已经完成，便签墙上的状态已经同步。",
        status: "delivered",
        source_type: "canon_patched",
        target_route: story_id ? `/stories/${story_id}` : "/stories",
        created_at: event.created_at,
        story_id,
      };
    }
    case "runtime_task_failed": {
      const story_title = findStoryTitle(state, story_id);
      return {
        notification_id: `event:${event.event_name}:${event.created_at}`,
        category: "risk",
        title: `${story_title} 有一步暂时卡住了`,
        body: "有一条继续任务暂时卡住了，便签墙已先帮你记下。",
        status: "delivered",
        source_type: "task_failed",
        target_route: story_id ? `/stories/${story_id}` : "/stories",
        created_at: event.created_at,
        story_id,
      };
    }
    case "export_complete": {
      const exportJob = story_id
        ? state.exportJobs
            .filter((item) => item.story_id === story_id)
            .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null
        : null;

      return {
        notification_id: `event:${event.event_name}:${exportJob?.id ?? event.created_at}`,
        category: "export",
        title: "导出结果已回流",
        body:
          readString(payload.status) === "partial_failed"
            ? "导出主体已经备好，还有一小部分文件我会继续补齐。"
            : "导出与证据包已准备好。",
        status: "delivered",
        source_type: "export_ready",
        target_route: exportJob ? `/stories/${exportJob.story_id}/exports/${exportJob.id}` : story_id ? `/stories/${story_id}` : "/profile",
        created_at: event.created_at,
        story_id,
      };
    }
    default:
      return null;
  }
}

function toStoredNotification(
  item: AppState["notifications"][number],
): ProjectedNotificationRecord {
  return {
    notification_id: item.id,
    category: item.category ?? "system",
    title: item.title,
    body: item.body,
    status: item.status,
    source_type: item.source_type ?? "notification_record",
    target_route: normalizeTargetRoute(item.deep_link),
    created_at: item.created_at,
    story_id: item.story_id,
  };
}

function sortNewestFirst<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function listProjectedRoomNotifications(input: {
  account_id: string;
  limit?: number;
  story_id?: string | null;
}): Promise<RoomNotificationView[]> {
  const state = await readAppState();
  const projected = sortNewestFirst(
    state.eventLogs
      .filter((item) => item.account_id === input.account_id)
      .map((item) => toProjectedNotification(state, item))
      .filter((item): item is ProjectedNotificationRecord => Boolean(item)),
  )
    .filter((item) => !input.story_id || item.story_id === input.story_id)
    .slice(0, input.limit ?? 10);

  return projected.map((item) => ({
    notification_id: item.notification_id,
    title: item.title,
    body: item.body,
    status: item.status,
    source_type: item.source_type,
    target_route: item.target_route,
  }));
}

export async function listUnifiedNotificationFeed(input: {
  account_id: string;
  category?: NotificationListResponse["items"][number]["category"] | null;
  unread_only?: boolean;
  limit?: number;
  story_id?: string | null;
}): Promise<Array<NotificationListResponse["items"][number] & { created_at: string; target_route: string }>> {
  const state = await readAppState();
  const projected = state.eventLogs
    .filter((item) => item.account_id === input.account_id)
    .map((item) => toProjectedNotification(state, item))
    .filter((item): item is ProjectedNotificationRecord => Boolean(item));
  const stored = state.notifications
    .filter((item) => item.account_id === input.account_id)
    .map((item) => toStoredNotification(item));

  return sortNewestFirst([...projected, ...stored])
    .filter((item) => !input.story_id || item.story_id === input.story_id)
    .filter((item) => !input.category || item.category === input.category)
    .filter((item) => !input.unread_only || item.status === "unread" || item.status === "delivered")
    .slice(0, input.limit ?? 50)
    .map((item) => ({
      notification_id: item.notification_id,
      category: item.category,
      title: item.title,
      body: item.body,
      status: item.status,
      source_type: item.source_type,
      created_at: item.created_at,
      target_route: item.target_route,
    }));
}

export async function getLatestProjectedEvent(input: {
  account_id: string;
  source_type: ProjectedSourceType;
  story_id?: string | null;
}) {
  const events = await listProjectedRoomNotifications({
    account_id: input.account_id,
    limit: 50,
  });

  if (input.source_type === "proposal_ready") {
    return events.find((item) => item.source_type === input.source_type) ?? null;
  }

  if (input.story_id) {
    return events.find(
      (item) => item.source_type === input.source_type && item.target_route.includes(`/stories/${input.story_id}`),
    ) ?? null;
  }

  return events.find((item) => item.source_type === input.source_type) ?? null;
}
