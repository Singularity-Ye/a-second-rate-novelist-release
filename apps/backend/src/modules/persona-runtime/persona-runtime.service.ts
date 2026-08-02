import { randomUUID } from "node:crypto";
import type {
  PersonaSnapshotStatus,
  PersonaStateDetailResponse,
  PersonaStateReasonRefView,
  PersonaStateSnapshotView,
  PersonaSurfaceState,
  RoomPendingActionView,
  RoomVisualTokensView,
} from "@erliu/shared-contracts";
import { readAppState } from "../../common/store.js";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import {
  createPersonaStateRepository,
  type PersonaSnapshotRecord,
} from "../../common/repositories/persona-state.repository.js";
import { createReaderProfileRepository } from "../../common/repositories/reader-profile.repository.js";
import { scheduleProjectionObjectStorageShadowUpload } from "../../common/truth-source/projection-object-storage-shadow-mirror.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";
import { resolveActiveStoryChapter, resolveActiveStoryWorkspace } from "../room-projection/active-story-chapter.js";
export { buildChatPersonaCopy, buildSystemNotificationCopy, buildWorkflowPersonaCopy } from "./persona-engine.service.js";

const SNAPSHOT_TTL_MS = 15 * 60_000;

interface PersonaRuntimeResult {
  snapshot_status: PersonaSnapshotStatus;
  state_snapshot: PersonaStateSnapshotView;
  room_visual_tokens: RoomVisualTokensView;
  recommended_actions: RoomPendingActionView[];
}

async function findAccountByToken(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

function normalizeReasonRefs(reason_refs: PersonaStateReasonRefView[]) {
  return reason_refs.filter((item) => item.visibility !== "hidden");
}

function buildFallbackActions(story_id?: string | null): RoomPendingActionView[] {
  return [
    {
      action_code: "open_desk",
      label: "去书桌继续整理",
      route: story_id ? `/stories/${story_id}` : "/stories",
      emphasis: "primary",
    },
  ];
}

function buildFallbackResult(input: {
  story_id?: string | null;
  generated_at: string;
}): PersonaRuntimeResult {
  const fallbackRef: PersonaStateReasonRefView = {
    ref_type: "system",
    ref_id: "ROOM-101",
    label: "ROOM-101 · 房间正在整理线索",
    reason_code: "ROOM-101",
  };

  return {
    snapshot_status: "snapshot_degraded",
    state_snapshot: {
      snapshot_id: `fallback-${input.generated_at}`,
      label: "房间正在整理线索，马上把状态重新补齐。",
      state: "resting",
      state_code: "resting",
      mood_tags: ["整理中"],
      reason_refs: [fallbackRef],
      generated_at: input.generated_at,
    },
    room_visual_tokens: {
      ambience: "muted",
      desk_state: "rebuilding",
      lighting: "soft",
    },
    recommended_actions: buildFallbackActions(input.story_id),
  };
}

function buildPendingActions(input: {
  story_id?: string | null;
  chapter_route?: string | null;
}): RoomPendingActionView[] {
  const actions: RoomPendingActionView[] = [
    {
      action_code: "open_persona_panel",
      label: "查看作家状态",
      route: input.story_id ? `/room/persona?storyId=${input.story_id}` : "/room/persona",
      emphasis: "secondary",
    },
  ];

  if (input.chapter_route) {
    actions.unshift({
      action_code: "open_current_chapter",
      label: "继续阅读当前章节",
      route: input.chapter_route,
      emphasis: "primary",
    });
  } else if (input.story_id) {
    actions.unshift({
      action_code: "open_story_workspace",
      label: "回到当前故事中枢",
      route: `/stories/${input.story_id}`,
      emphasis: "primary",
    });
  } else {
    actions.unshift({
      action_code: "start_story",
      label: "去书桌开新坑",
      route: "/stories",
      emphasis: "primary",
    });
  }

  return actions;
}

async function buildSnapshotFromState(state: Awaited<ReturnType<typeof readAppState>>, input: {
  account_id: string;
  story_id?: string | null;
  generated_at: string;
}): Promise<PersonaRuntimeResult> {
  const workspace = resolveActiveStoryWorkspace({
    account_id: input.account_id,
    story_id: input.story_id ?? null,
    workspaces: state.storyWorkspaces,
    event_logs: state.eventLogs,
  });
  const latestNotification = state.notifications
    .filter((item) => item.account_id === input.account_id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];

  if (!workspace) {
    return {
      snapshot_status: "snapshot_ready",
      state_snapshot: {
        snapshot_id: `derived-${input.generated_at}`,
        label: "房间已经准备好，随时可以开新坑。",
        state: "welcoming",
        state_code: "welcoming",
        mood_tags: ["待开场"],
        reason_refs: [
          {
            ref_type: "system",
            ref_id: "room-ready",
            label: "当前没有活跃故事，房间保持待命。",
          },
        ],
        generated_at: input.generated_at,
      },
      room_visual_tokens: {
        ambience: "welcoming",
        desk_state: "clear",
        lighting: "warm",
      },
      recommended_actions: buildPendingActions({}),
    };
  }

  const activeChapter = resolveActiveStoryChapter({
    story_id: workspace.id,
    current_chapter_id: workspace.current_chapter_id ?? null,
    chapters: state.chapters,
  });
  const chapter = activeChapter
    ? state.chapters.find((item) => item.id === activeChapter.chapter_id && item.story_id === workspace.id) ?? null
    : null;
  const latestRevision = chapter
    ? state.chapterRevisions
        .filter((item) => item.chapter_id === chapter.id)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null
    : null;
  const chapterRoute = activeChapter?.route ?? null;
  const notification = latestNotification?.story_id === workspace.id ? latestNotification : null;

  let state_code: PersonaSurfaceState = "waiting_for_user";
  let label = `《${workspace.title}》还在桌上等你继续。`;
  let mood_tags = ["待确认"];
  let room_visual_tokens: RoomVisualTokensView = {
    ambience: "holding",
    desk_state: "story_boarded",
    lighting: "warm",
  };

  if (workspace.workspace_status === "paused") {
    state_code = "resting";
    label = `《${workspace.title}》先被收进抽屉里，等你下一次回来。`;
    mood_tags = ["休整中"];
    room_visual_tokens = {
      ambience: "quiet",
      desk_state: "paused",
      lighting: "amber",
    };
  } else if (latestRevision) {
    state_code = "revising";
    label = `《${workspace.title}》的最新章节正在返修。`;
    mood_tags = ["返修中", "对齐节奏"];
    room_visual_tokens = {
      ambience: "focused",
      desk_state: "annotated",
      lighting: "cool",
    };
  } else if (chapter) {
    state_code = "writing";
    label = `《${workspace.title}》的最新章节正摊在灯下。`;
    mood_tags = ["最新章节", "继续推进"];
    room_visual_tokens = {
      ambience: "focused",
      desk_state: "open_chapter",
      lighting: "bright",
    };
  }

  const reason_refs: PersonaStateReasonRefView[] = [
    {
      ref_type: "story_workspace",
      ref_id: workspace.id,
      label: `当前故事：《${workspace.title}》`,
    },
  ];

  if (chapter) {
    reason_refs.push({
      ref_type: "chapter",
      ref_id: chapter.id,
      label: `当前章节：${chapter.title}`,
    });
  }

  if (notification) {
    reason_refs.push({
      ref_type: "notification",
      ref_id: notification.id,
      label: `最近提醒：${notification.title}`,
    });
  }

  const profile = await createReaderProfileRepository().findLatestActiveProfileByAccount(input.account_id);

  if (profile) {
    reason_refs.push({
      ref_type: "profile",
      ref_id: profile.id,
      label: `读者偏好：${profile.taste_archive.pace || "正在继续学习你的节奏"}`,
    });
  }

  return {
    snapshot_status: "snapshot_ready",
    state_snapshot: {
      snapshot_id: `derived-${input.generated_at}`,
      label,
      state: state_code,
      state_code,
      mood_tags,
      reason_refs,
      generated_at: input.generated_at,
    },
    room_visual_tokens,
    recommended_actions: buildPendingActions({
      story_id: workspace.id,
      chapter_route: chapterRoute,
    }),
  };
}

async function persistSnapshot(input: {
  account_id: string;
  story_id?: string | null;
  snapshot: PersonaStateSnapshotView;
  room_visual_tokens: RoomVisualTokensView;
}) {
  const record: PersonaSnapshotRecord = {
    id: input.snapshot.snapshot_id,
    account_id: input.account_id,
    story_workspace_id: input.story_id ?? null,
    state_code: input.snapshot.state_code,
    label: input.snapshot.label,
    mood_tags: input.snapshot.mood_tags,
    reason_refs: input.snapshot.reason_refs,
    room_visual_tokens: input.room_visual_tokens,
    generated_at: input.snapshot.generated_at,
    visible_until: new Date(Date.parse(input.snapshot.generated_at) + SNAPSHOT_TTL_MS).toISOString(),
  };

  await createPersonaStateRepository().createSnapshot(record);

  scheduleProjectionObjectStorageShadowUpload({
    account_id: input.account_id,
    aggregate_key: "persona_snapshot",
    object_key: `projection-snapshots/accounts/${input.account_id}/persona/${record.id}.json`,
    body: JSON.stringify({
      snapshot_type: "persona_snapshot",
      account_id: input.account_id,
      story_id: input.story_id ?? null,
      snapshot_id: record.id,
      state_code: record.state_code,
      label: record.label,
      mood_tags: record.mood_tags,
      reason_refs: record.reason_refs,
      room_visual_tokens: record.room_visual_tokens,
      generated_at: record.generated_at,
      visible_until: record.visible_until,
    }),
    content_type: "application/json",
  });

  void recordDomainEvent({
    event_name: "persona_state_snapshot_created",
    account_id: input.account_id,
    payload: {
      snapshot_id: record.id,
      state_code: record.state_code,
      story_id: record.story_workspace_id,
    },
  });
}

function toSnapshotView(record: PersonaSnapshotRecord): PersonaStateSnapshotView {
  return {
    snapshot_id: record.id,
    label: record.label,
    state: record.state_code,
    state_code: record.state_code,
    mood_tags: record.mood_tags,
    reason_refs: normalizeReasonRefs(record.reason_refs),
    generated_at: record.generated_at,
  };
}

function isExpired(snapshot: PersonaSnapshotRecord, now: string) {
  return Date.parse(snapshot.visible_until) <= Date.parse(now);
}

export async function resolvePersonaRuntime(input: {
  account_token: string;
  story_id?: string | null;
  force_refresh?: boolean;
}): Promise<PersonaRuntimeResult> {
  const account = await findAccountByToken(input.account_token);
  const repository = createPersonaStateRepository();
  const state = await readAppState();
  const now = new Date().toISOString();
  const latest = (await repository.listSnapshotsByAccount(account.account_id, input.story_id)).at(0);

  if (!input.force_refresh && latest && !isExpired(latest, now)) {
    const visibleRefs = normalizeReasonRefs(latest.reason_refs);

    if (visibleRefs.length > 0) {
      return {
        snapshot_status: "snapshot_ready",
        state_snapshot: toSnapshotView(latest),
        room_visual_tokens: latest.room_visual_tokens,
        recommended_actions: buildPendingActions({
          story_id: latest.story_workspace_id,
          chapter_route: latest.story_workspace_id ? await repository.getChapterRoute(latest.story_workspace_id) : null,
        }),
      };
    }
  }

  const derived = await buildSnapshotFromState(state, {
    account_id: account.account_id,
    generated_at: now,
    ...(input.story_id !== undefined ? { story_id: input.story_id } : {}),
  });

  if (
    latest &&
    (isExpired(latest, now) || normalizeReasonRefs(latest.reason_refs).length === 0) &&
    derived.state_snapshot.state_code === "welcoming"
  ) {
    return buildFallbackResult({
      generated_at: now,
      ...(input.story_id !== undefined ? { story_id: input.story_id } : {}),
    });
  }

  await persistSnapshot({
    account_id: account.account_id,
    snapshot: derived.state_snapshot,
    room_visual_tokens: derived.room_visual_tokens,
    ...(input.story_id !== undefined ? { story_id: input.story_id } : {}),
  });

  if (latest && latest.state_code !== derived.state_snapshot.state_code) {
    void recordDomainEvent({
      event_name: "persona_state_changed",
      account_id: account.account_id,
      payload: {
        from: latest.state_code,
        to: derived.state_snapshot.state_code,
        story_id: input.story_id ?? null,
      },
    });
  }

  return derived;
}

export async function getRoomPersona(input: {
  account_token: string;
  story_id?: string | null;
  force_refresh?: boolean;
}): Promise<PersonaStateDetailResponse> {
  const account = await findAccountByToken(input.account_token);
  const repository = createPersonaStateRepository();
  const resolved = await resolvePersonaRuntime(input);
  const transitions = (await repository
    .listSnapshotsByAccount(account.account_id, input.story_id))
    .slice(0, 5)
    .map((item) => ({
      snapshot_id: item.id,
      state_code: item.state_code,
      label: item.label,
      generated_at: item.generated_at,
    }));

  return {
    snapshot_status: resolved.snapshot_status,
    state_snapshot: resolved.state_snapshot,
    recent_transitions:
      transitions.length > 0
        ? transitions
        : [
            {
              snapshot_id: resolved.state_snapshot.snapshot_id,
              state_code: resolved.state_snapshot.state_code,
              label: resolved.state_snapshot.label,
              generated_at: resolved.state_snapshot.generated_at,
            },
          ],
    recommended_actions: resolved.recommended_actions,
  };
}
