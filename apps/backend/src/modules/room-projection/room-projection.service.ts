import type {
  RoomFallbackContextView,
  RoomHotspotCode,
  RoomHotspotView,
  RoomOverviewRequest,
  RoomOverviewResponse,
  RoomStoryCardView,
} from "@erliu/shared-contracts";
import { readAppState } from "../../common/store.js";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { getRoomPersona, resolvePersonaRuntime } from "../persona-runtime/persona-runtime.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";
import { resolveActiveStoryChapter, resolveActiveStoryWorkspace } from "./active-story-chapter.js";
import { getLatestProjectedEvent, listProjectedRoomNotifications } from "./room-event-projection.service.js";

function emitEvent(
  event_name: string,
  account_id: string,
  payload: Record<string, string | number | boolean | null>,
) {
  void recordDomainEvent({
    event_name,
    account_id,
    payload,
  });
}

async function findAccountByToken(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

async function buildCurrentStoryCard(input: {
  account_id: string;
  story_id?: string | null;
  chapters: Awaited<ReturnType<typeof readAppState>>["chapters"];
  workspaces: Awaited<ReturnType<typeof readAppState>>["storyWorkspaces"];
  event_logs: Awaited<ReturnType<typeof readAppState>>["eventLogs"];
}): Promise<RoomStoryCardView | null> {
  const workspace = resolveActiveStoryWorkspace({
    account_id: input.account_id,
    story_id: input.story_id ?? null,
    workspaces: input.workspaces,
    event_logs: input.event_logs,
  });

  if (!workspace) {
    return null;
  }

  const activeChapter = resolveActiveStoryChapter({
    story_id: workspace.id,
    current_chapter_id: workspace.current_chapter_id ?? null,
    chapters: input.chapters,
  });

  return {
    story_id: workspace.id,
    title: workspace.title,
    workspace_status: workspace.workspace_status,
    current_chapter_id: activeChapter?.chapter_id ?? workspace.current_chapter_id ?? null,
    chapter_deep_link: activeChapter?.route ?? null,
  };
}

function buildFallbackContext(input: {
  fallback_target?: RoomHotspotCode | null;
  current_story_card: RoomStoryCardView | null;
  recent_notifications: RoomOverviewResponse["recent_notifications"];
}): RoomFallbackContextView | null {
  if (input.fallback_target === "computer" && !input.current_story_card?.chapter_deep_link) {
    return {
      reason_code: "ROOM-001",
      title: "电脑上还没有打开的章节",
      message: "电脑上现在还没有可继续的章节，先回书桌把这本书的中枢重新摊开，再回来继续。",
      cta_label: "去书桌",
      target_route: input.current_story_card ? `/stories/${input.current_story_card.story_id}` : "/stories",
    };
  }

  if (input.fallback_target === "mailbox" && input.recent_notifications.length === 0) {
    return buildMailboxRecoveryStep(input.current_story_card);
  }

  return null;
}

function buildMailboxRecoveryStep(current_story_card: RoomStoryCardView | null): RoomFallbackContextView {
  if (current_story_card?.chapter_deep_link) {
    return {
      reason_code: "ROOM-001",
      title: "邮箱里还没有新回信",
      message: "这本书最近还没有新的房间回信。先去当前章节继续，新的章节、导出和风险结果会先落在这里。",
      cta_label: "继续当前章节",
      target_route: current_story_card.chapter_deep_link,
    };
  }

  if (current_story_card) {
    return {
      reason_code: "ROOM-001",
      title: "邮箱里还没有新回信",
      message: "这本书最近还没有新的房间回信。先回故事中枢，把第一章写出来或把下一步接上，新的章节、导出和风险结果会先落在这里。",
      cta_label: "回故事中枢",
      target_route: `/stories/${current_story_card.story_id}`,
    };
  }

  return {
    reason_code: "ROOM-001",
    title: "邮箱里还没有提醒",
    message: "房间里暂时还没有正在继续的书，先去书桌把要写的那本摊开，新的章节、导出和风险结果会先落在这里。",
    cta_label: "去书桌看看",
    target_route: "/stories",
  };
}

export async function getRoomOverview(input: RoomOverviewRequest): Promise<RoomOverviewResponse> {
  const account = await findAccountByToken(input.account_token);
  const state = await readAppState();
  const current_story_card = await buildCurrentStoryCard({
    account_id: account.account_id,
    chapters: state.chapters,
    workspaces: state.storyWorkspaces,
    event_logs: state.eventLogs,
    ...(input.story_id !== undefined ? { story_id: input.story_id } : {}),
  });
  const story_id = current_story_card?.story_id ?? input.story_id ?? null;
  const personaRuntime = await resolvePersonaRuntime({
    account_token: input.account_token,
    ...(story_id !== null ? { story_id } : {}),
  });
  const recent_notifications = await listProjectedRoomNotifications({
    account_id: account.account_id,
    limit: 5,
    ...(story_id ? { story_id } : {}),
  });
  const latestProposal = await getLatestProjectedEvent({
    account_id: account.account_id,
    source_type: "proposal_ready",
  });
  const latestChapterAccepted = await getLatestProjectedEvent({
    account_id: account.account_id,
    source_type: "chapter_accepted",
    ...(story_id ? { story_id } : {}),
  });
  const latestCanonPatched = await getLatestProjectedEvent({
    account_id: account.account_id,
    source_type: "canon_patched",
    ...(story_id ? { story_id } : {}),
  });
  const latestTaskFailed = await getLatestProjectedEvent({
    account_id: account.account_id,
    source_type: "task_failed",
    ...(story_id ? { story_id } : {}),
  });
  const assetCount = state.referenceAssets.filter((item) =>
    item.account_id === account.account_id && (!story_id || item.story_id === story_id || item.story_id === null),
  ).length;
  const openIssueCount = story_id
    ? state.continuityIssues.filter((item) => item.story_id === story_id && item.resolution_status === "open").length
    : 0;
  const storyHubRoute = current_story_card ? `/stories/${current_story_card.story_id}` : "/stories";
  const mailboxRecoveryStep = buildMailboxRecoveryStep(current_story_card);
  const fallback_context = buildFallbackContext({
    current_story_card,
    recent_notifications,
    ...(input.fallback_target !== undefined ? { fallback_target: input.fallback_target } : {}),
  });
  const objects: RoomHotspotView[] = [
    {
      hotspot_code: "desk",
      label: "书桌",
      description: current_story_card
        ? latestProposal
          ? `《${current_story_card.title}》是现在这张桌面的主角，另外还有新提案待你拍板。`
          : `《${current_story_card.title}》正摊在书桌上，书桌会把当前故事中心先替你留住。`
        : latestProposal
          ? latestProposal.body
          : "回到书桌，先把当前故事中心打开。",
      state: current_story_card ? "active" : latestProposal ? "attention" : "fallback",
      target_route: "/stories",
      entry_story_id: current_story_card?.story_id ?? null,
    },
    {
      hotspot_code: "computer",
      label: "电脑",
      description: current_story_card?.chapter_deep_link
        ? latestChapterAccepted?.body ?? "继续打开当前章节。"
        : current_story_card
          ? "当前故事还没有可继续的章节，先回故事中枢看看。"
          : latestTaskFailed?.body ?? "电脑上暂时还没有打开的章节。",
      state: current_story_card?.chapter_deep_link ? "active" : current_story_card ? "fallback" : latestTaskFailed ? "attention" : "fallback",
      target_route: current_story_card?.chapter_deep_link ?? storyHubRoute,
      entry_story_id: current_story_card?.story_id ?? null,
    },
    {
      hotspot_code: "bookshelf",
      label: "书架",
      description:
        assetCount > 0
          ? `${assetCount} 份参考资产已归档，书架现在会真实映射投喂结果。`
          : "资料库还空着，先从私聊或书桌投喂材料。",
      state: assetCount > 0 ? "active" : "disabled",
      target_route: "/assets",
      entry_story_id: current_story_card?.story_id ?? null,
    },
    {
      hotspot_code: "archive_profile",
      label: "档案柜",
      description: current_story_card
        ? `去我的里看这本书留下来的最近记下和读者档案。`
        : "去我的里看最近记下、读者档案和账户设置。",
      state: "active",
      target_route: current_story_card ? `/profile?story_id=${current_story_card.story_id}` : "/profile",
      entry_story_id: null,
    },
    {
      hotspot_code: "sticky_wall",
      label: "便签墙",
      description: latestTaskFailed
        ? `有任务失败待处理：${latestTaskFailed.body}`
        : openIssueCount > 0
          ? `${openIssueCount} 处前后还没接上的地方待处理，便签墙会先把诚实的未完成项保留住。`
          : latestCanonPatched?.body ?? "便签墙暂时还没有新的伏笔和待办，先保留在这儿。",
      state: latestTaskFailed ? "attention" : openIssueCount > 0 || latestCanonPatched ? "active" : "disabled",
      target_route: storyHubRoute,
      entry_story_id: current_story_card?.story_id ?? null,
    },
    {
      hotspot_code: "mailbox",
      label: "邮箱",
      description:
        recent_notifications.length > 0
          ? `${recent_notifications.length} 条通知与导出提醒待查看。`
          : mailboxRecoveryStep.message,
      state: recent_notifications.length > 0 ? "active" : "fallback",
      target_route:
        recent_notifications.length > 0
          ? current_story_card
            ? `/notifications?story_id=${current_story_card.story_id}`
            : "/notifications"
          : mailboxRecoveryStep.target_route,
      entry_story_id: current_story_card?.story_id ?? null,
    },
  ];

  emitEvent("deep_link_opened", account.account_id, {
    target_route: "/room",
    fallback_used: Boolean(fallback_context),
  });

  return {
    snapshot_status: personaRuntime.snapshot_status,
    persona_state: personaRuntime.state_snapshot,
    room_visual_tokens: personaRuntime.room_visual_tokens,
    current_story_card,
    objects,
    pending_actions: personaRuntime.recommended_actions,
    recent_notifications,
    fallback_context,
  };
}

export { getRoomPersona };
