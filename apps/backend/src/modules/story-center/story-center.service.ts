import type {
  StoryCenterChapterSummaryView,
  StoryCenterDetailResponse,
  StoryCenterListItemView,
  StoryCenterListResponse,
  StoryCenterNotificationSummaryView,
} from "@erliu/shared-contracts";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createObservabilityRepository } from "../../common/repositories/observability.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import { getLatestReadableChapterByStoryId } from "../chapter-runtime/chapter-runtime.service.js";
import { listUnifiedNotificationFeed } from "../room-projection/room-event-projection.service.js";
import { getExportCapabilities, listStoryExports } from "../rights-export/rights-export.service.js";

type StoryWorkspaceStatus = StoryCenterListItemView["workspace_status"];

const workspaceSortOrder: Record<StoryWorkspaceStatus, number> = {
  active: 0,
  draft: 1,
  paused: 2,
  archived: 3,
};

export async function listStoryCenter(input: { account_token: string }): Promise<StoryCenterListResponse> {
  const account = await ensureAccount(input.account_token);
  const workspaces = await listVisibleWorkspaces(account.account_id);
  const items = await Promise.all(workspaces.map((workspace) => buildStoryCenterListItem(workspace.id)));
  const active_story_id = await resolveActiveStoryId(account.account_id, workspaces);

  return {
    active_story_id,
    items,
  };
}

export async function getStoryCenterDetail(input: {
  account_token: string;
  story_id: string;
}): Promise<StoryCenterDetailResponse> {
  const account = await ensureAccount(input.account_token);
  const workspace = await ensureWorkspaceForAccount(account.account_id, input.story_id);
  const [listItem, capability, feed] = await Promise.all([
    buildStoryCenterListItem(workspace.id),
    getExportCapabilities({
      story_id: workspace.id,
    }),
    listUnifiedNotificationFeed({
      account_id: account.account_id,
      limit: 20,
      story_id: workspace.id,
    }),
  ]);

  return {
    ...listItem,
    export_capability: {
      export_allowed: capability.export_allowed,
      latest_risk_result: capability.latest_risk_summary?.result ?? null,
      latest_evidence_pack_id: capability.latest_evidence_pack_id,
    },
    recent_notifications: feed.slice(0, 3).map((item) => toStoryCenterNotification(item)),
  };
}

async function buildStoryCenterListItem(story_id: string): Promise<StoryCenterListItemView> {
  const repository = createStoryWorkspaceRepository();
  const workspace = await repository.findWorkspaceById(story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${story_id}`);
  }

  const [currentChapter, exports] = await Promise.all([
    getLatestReadableChapterByStoryId(story_id),
    listStoryExports({
      story_id,
    }),
  ]);
  const latestExport = [...exports.jobs].sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;

  return {
    story_id: workspace.id,
    title: workspace.title,
    keywords: workspace.keywords,
    workspace_status: workspace.workspace_status,
    updated_at: workspace.updated_at,
    continuation_next_step: buildContinuationNextStep({
      workspace_status: workspace.workspace_status,
      currentChapter,
      latestExport,
    }),
    current_chapter: currentChapter ? toStoryCenterChapter(currentChapter) : null,
    latest_export: latestExport
      ? {
          job_id: latestExport.job_id,
          export_purpose: latestExport.export_purpose,
          requested_formats: latestExport.requested_formats,
          status: latestExport.status,
          created_at: latestExport.created_at,
          route: `/stories/${story_id}/exports/${latestExport.job_id}`,
        }
      : null,
  };
}

async function listVisibleWorkspaces(account_id: string) {
  return (await createStoryWorkspaceRepository().listWorkspacesByAccount(account_id))
    .filter((workspace) => workspace.workspace_status !== "archived")
    .sort((left, right) => {
      const statusGap = workspaceSortOrder[left.workspace_status] - workspaceSortOrder[right.workspace_status];
      if (statusGap !== 0) {
        return statusGap;
      }

      return right.updated_at.localeCompare(left.updated_at);
    });
}

async function resolveActiveStoryId(
  account_id: string,
  workspaces: Array<{
    id: string;
  }>,
) {
  const fallback = workspaces[0]?.id ?? null;
  if (!fallback) {
    return null;
  }

  const visibleStoryIds = new Set(workspaces.map((workspace) => workspace.id));
  const events = await createObservabilityRepository().listDomainEvents({
    account_id,
    limit: 120,
  });

  for (const event of events) {
    const fromPayload = readStoryIdFromPayload(event.payload);
    if (fromPayload && visibleStoryIds.has(fromPayload)) {
      return fromPayload;
    }

    const fromRoute = readStoryIdFromRoute(readOptionalString(event.payload.target_route));
    if (fromRoute && visibleStoryIds.has(fromRoute)) {
      return fromRoute;
    }
  }

  return fallback;
}

async function ensureAccount(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);
  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

async function ensureWorkspaceForAccount(account_id: string, story_id: string) {
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(story_id);
  if (!workspace || workspace.account_id !== account_id) {
    throw new Error(`Story workspace not found for id ${story_id}`);
  }

  return workspace;
}

function toStoryCenterChapter(chapter: {
  chapter_id: string;
  chapter_no: number;
  title: string;
  status: StoryCenterChapterSummaryView["status"];
  summary: string;
  story_id: string;
}): StoryCenterChapterSummaryView {
  return {
    chapter_id: chapter.chapter_id,
    chapter_no: chapter.chapter_no,
    title: chapter.title,
    status: chapter.status,
    summary: chapter.summary,
    route: `/stories/${chapter.story_id}/chapters/${chapter.chapter_id}`,
  };
}

function toStoryCenterNotification(item: {
  notification_id: string;
  category: StoryCenterNotificationSummaryView["category"];
  title: string;
  body: string;
  status: StoryCenterNotificationSummaryView["status"];
  source_type: string;
  created_at: string;
  target_route: string;
}): StoryCenterNotificationSummaryView {
  return {
    notification_id: item.notification_id,
    category: item.category,
    title: item.title,
    body: item.body,
    status: item.status,
    source_type: item.source_type,
    created_at: item.created_at,
    target_route: item.target_route,
  };
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

function buildContinuationNextStep(input: {
  workspace_status: StoryWorkspaceStatus;
  currentChapter: Awaited<ReturnType<typeof getLatestReadableChapterByStoryId>>;
  latestExport: Awaited<ReturnType<typeof listStoryExports>>["jobs"][number] | null;
}) {
  if (input.currentChapter) {
    return `继续阅读第 ${input.currentChapter.chapter_no} 章《${input.currentChapter.title}》`;
  }

  if (input.latestExport) {
    return "先去作品权利服务整理导出";
  }

  if (input.workspace_status === "paused") {
    return "先回故事中枢，看从哪一章重新接上";
  }

  return "先回故事中枢，把第一章写出来";
}
