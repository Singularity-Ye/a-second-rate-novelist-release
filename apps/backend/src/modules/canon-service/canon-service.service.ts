import { randomUUID } from "node:crypto";
import type {
  CanonContinuityBriefView,
  CanonPatchRequest,
  CanonPatchResponse,
  CanonViewResponse,
  ContinuityIssuesResponse,
  ContinuityIssueView,
  ContinuitySuggestedPatchView,
} from "@erliu/shared-contracts";
import { createChapterRuntimeRepository, type ChapterRecord } from "../../common/repositories/chapter-runtime.repository.js";
import { createStoryKnowledgeRepository } from "../../common/repositories/story-knowledge.repository.js";
import { createStoryWorkspaceRepository, type StoryWorkspaceRecord } from "../../common/repositories/story-workspace.repository.js";
import { type AppState } from "../../common/store.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

async function ensureStoryExists(story_id: string) {
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${story_id}`);
  }

  return workspace;
}

export function bootstrapCanonSeedForWorkspace(workspace: Pick<StoryWorkspaceRecord, "id" | "title">) {
  return createStoryKnowledgeRepository().seedCanonItems({
    story_id: workspace.id,
    items: [
      {
        item_type: "relationship",
        title: `${workspace.title} 当前关系张力`,
        attributes: {
          relationship_status: "旧识试探",
          tension_level: "high",
        },
        reveal_level: "public_now",
        source_refs: [
          {
            ref_type: "story_workspace",
            ref_id: workspace.id,
            title: workspace.title,
          },
        ],
        continuity_status: "stable",
      },
      {
        item_type: "location",
        title: `${workspace.title} 旧城站台`,
        attributes: {
          weather: "雨夜",
          mood: "潮湿克制",
        },
        reveal_level: "public_now",
        source_refs: [
          {
            ref_type: "story_workspace",
            ref_id: workspace.id,
            title: workspace.title,
          },
        ],
        continuity_status: "stable",
      },
      {
        item_type: "world_rule",
        title: `${workspace.title} 隐藏真相`,
        attributes: {
          hidden_truth: "当年离开的理由并未真正说出口。",
        },
        reveal_level: "guarded",
        source_refs: [
          {
            ref_type: "story_workspace",
            ref_id: workspace.id,
            title: workspace.title,
          },
        ],
        continuity_status: "stable",
      },
    ],
  });
}

function toIssueView(issue: AppState["continuityIssues"][number]): ContinuityIssueView {
  return {
    issue_id: issue.id,
    issue_type: issue.issue_type,
    severity: issue.severity,
    summary: issue.summary,
    object_refs: issue.object_refs,
    resolution_status: issue.resolution_status,
  };
}

function parseReaderReview(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return null;
  }

  const summary = typeof raw.summary === "string" ? raw.summary : null;
  const acceptance_recommendation =
    raw.acceptance_recommendation === "accept" ||
    raw.acceptance_recommendation === "rewrite" ||
    raw.acceptance_recommendation === "tweak" ||
    raw.acceptance_recommendation === "continuity_patch"
      ? raw.acceptance_recommendation
      : null;
  const rewrite_targets = Array.isArray(raw.rewrite_targets)
    ? raw.rewrite_targets.filter((item): item is string => typeof item === "string")
    : [];

  if (!summary || !acceptance_recommendation) {
    return null;
  }

  return {
    summary,
    acceptance_recommendation,
    rewrite_targets,
  };
}

function pickContinuityTarget(input: {
  items: AppState["canonItems"];
  openIssues: AppState["continuityIssues"];
}) {
  const relationship = input.items.find((item) => item.item_type === "relationship");

  if (relationship) {
    return relationship;
  }

  const issueTargetId =
    input.openIssues[0]?.object_refs.find((ref) => ref.ref_type === "canon_item")?.ref_id ?? null;

  return input.items.find((item) => item.id === issueTargetId) ?? input.items[0] ?? null;
}

function buildContinuityBrief(input: {
  items: AppState["canonItems"];
  recentPatches: AppState["canonPatches"];
  openIssues: AppState["continuityIssues"];
  latestChapter: ChapterRecord | null;
}): CanonContinuityBriefView {
  const guardedItems = input.items.filter((item) => item.reveal_level !== "public_now");
  const latestReaderReview = parseReaderReview(input.latestChapter?.reader_review ?? null);
  const targetItem = pickContinuityTarget({
    items: input.items,
    openIssues: input.openIssues,
  });
  const reveal_safe_summary =
    guardedItems.length > 0
      ? `当前只允许暗示 ${guardedItems.map((item) => item.title).join("、")}，不要正面揭露。`
      : "当前没有额外 reveal guard。";
  const compact_summary = [
    input.openIssues.length > 0
      ? `有 ${input.openIssues.length} 条 continuity issue 待处理`
      : "当前没有 open continuity issue",
    input.recentPatches[0]?.reason ? `最近 patch：${input.recentPatches[0].reason}` : "最近没有新的 canon patch",
    latestReaderReview ? `最新 reader review：${latestReaderReview.summary}` : "尚无 reader review 写回",
  ].join("；");
  const suggested_patch: ContinuitySuggestedPatchView | null = targetItem
    ? latestReaderReview
      ? {
          target_item_id: targetItem.id,
          target_title: targetItem.title,
          reason: `reader_review:${latestReaderReview.acceptance_recommendation}`,
          summary: `下一次写回前先同步 ${targetItem.title} 的最新章节状态，并优先处理 ${latestReaderReview.rewrite_targets[0] ?? latestReaderReview.summary}。`,
        }
      : input.openIssues[0]
        ? {
            target_item_id: targetItem.id,
            target_title: targetItem.title,
            reason: `open_issue:${input.openIssues[0].id}`,
            summary: `优先收口 ${targetItem.title} 与「${input.openIssues[0].summary}」之间的连续性落差。`,
          }
        : null
    : null;

  return {
    reveal_safe_summary,
    compact_summary,
    latest_reader_review_summary: latestReaderReview?.summary ?? null,
    open_issue_ids: input.openIssues.map((item) => item.id),
    recent_patch_ids: input.recentPatches.map((item) => item.id),
    suggested_patch,
  };
}

export async function getCanonView(input: { story_id: string }): Promise<CanonViewResponse> {
  await ensureStoryExists(input.story_id);
  const repository = createStoryKnowledgeRepository();
  const items = await repository.listCanonItemsByStory(input.story_id);
  const recentPatches = await repository.listCanonPatchesByStory(input.story_id);
  const recent_patches = recentPatches.map((item) => ({
      patch_id: item.id,
      target_item_id: item.target_item_id,
      reason: item.reason,
      status: item.status,
      created_at: item.created_at,
    }));
  const openIssues = (await repository.listContinuityIssuesByStory(input.story_id)).filter(
    (item) => item.resolution_status === "open",
  );
  const latestChapter =
    (await createChapterRuntimeRepository().listChaptersByStory(input.story_id)).sort((left, right) => {
      if (right.chapter_no !== left.chapter_no) {
        return right.chapter_no - left.chapter_no;
      }

      return right.updated_at.localeCompare(left.updated_at);
    })[0] ?? null;

  return {
    items: items.map((item) => ({
      item_id: item.id,
      story_id: item.story_id,
      item_type: item.item_type,
      title: item.title,
      attributes: item.attributes,
      reveal_level: item.reveal_level,
      source_refs: item.source_refs,
      continuity_status: item.continuity_status,
      version_no: item.version_no,
    })),
    relations: items
      .filter((item) => item.item_type === "relationship")
      .map((item) => ({
        item_id: item.id,
        story_id: item.story_id,
        item_type: item.item_type,
        title: item.title,
        attributes: item.attributes,
        reveal_level: item.reveal_level,
        source_refs: item.source_refs,
        continuity_status: item.continuity_status,
        version_no: item.version_no,
      })),
    recent_patches,
    continuity_brief: buildContinuityBrief({
      items,
      recentPatches,
      openIssues,
      latestChapter,
    }),
    reveal_summary: {
      public_count: items.filter((item) => item.reveal_level === "public_now").length,
      guarded_count: items.filter((item) => item.reveal_level === "guarded").length,
      hidden_count: items.filter((item) => item.reveal_level === "hidden").length,
    },
  };
}

export async function applyCanonPatch(input: { story_id: string } & CanonPatchRequest): Promise<CanonPatchResponse> {
  const workspace = await ensureStoryExists(input.story_id);
  const repository = createStoryKnowledgeRepository();
  const item = await repository.findCanonItemByStoryAndId(input.story_id, input.target_item_id);

  if (!item) {
    throw new Error(`Canon item not found for id ${input.target_item_id}`);
  }

  if (input.expected_version_no && input.expected_version_no !== item.version_no) {
    return {
      patch_id: randomUUID(),
      item_version: item.version_no,
      status: "conflicted",
      error_code: "CAN-101",
      continuity_issues: [],
    };
  }

  const now = new Date().toISOString();
  const before = JSON.stringify(item.attributes);
  const patchAttributes =
    typeof input.patch_document.attributes === "object" && input.patch_document.attributes
      ? (input.patch_document.attributes as Record<string, unknown>)
      : {};
  item.attributes = {
    ...item.attributes,
    ...patchAttributes,
  };
  item.version_no += 1;
  item.updated_at = now;
  await repository.saveCanonItem(item);

  const patch = await repository.createCanonPatch({
    story_id: input.story_id,
    target_item_id: item.id,
    patch_document: input.patch_document,
    reason: input.reason,
    status: "applied",
    source_type: "user_action",
    client_request_id: input.client_request_id,
    created_at: now,
  });

  const continuityIssues: ContinuityIssueView[] = [];

  if (before !== JSON.stringify(item.attributes)) {
    item.continuity_status = "conflicted";
    await repository.saveCanonItem(item);
    const issue = await repository.createContinuityIssue({
      story_id: input.story_id,
      issue_type: item.item_type === "relationship" ? "relationship" : "character_trait",
      severity: "warn" as const,
      summary: `${item.title} 的设定被更新，需要重新确认上下文一致性。`,
      object_refs: [
        {
          ref_type: "canon_item",
          ref_id: item.id,
        },
      ],
      resolution_status: "open" as const,
      created_at: now,
    });
    continuityIssues.push(toIssueView(issue));
  } else {
    item.continuity_status = "stable";
    await repository.saveCanonItem(item);
  }

  await Promise.all(
    continuityIssues.map((issue) =>
      recordDomainEvent({
        event_name: "continuity_issue_created",
        account_id: workspace.account_id,
        payload: {
          story_id: input.story_id,
          issue_id: issue.issue_id,
          severity: issue.severity,
        },
      }),
    ),
  );

  await recordDomainEvent({
    event_name: "canon_patch_applied",
    account_id: workspace.account_id,
    payload: {
      story_id: input.story_id,
      patch_id: patch.id,
      item_id: item.id,
    },
  });

  return {
    patch_id: patch.id,
    item_version: item.version_no,
    status: "applied",
    continuity_issues: continuityIssues,
  };
}

export async function getContinuityIssues(input: { story_id: string }): Promise<ContinuityIssuesResponse> {
  await ensureStoryExists(input.story_id);
  const issues = await createStoryKnowledgeRepository().listContinuityIssuesByStory(input.story_id);

  return {
    issues: issues.map(toIssueView),
    summary: {
      open_count: issues.filter((item) => item.resolution_status === "open").length,
      block_count: issues.filter((item) => item.severity === "block").length,
    },
  };
}

export async function applyAcceptedChapterContinuityWriteback(input: {
  account_id: string;
  chapter: {
    id: string;
    story_id: string;
    chapter_no: number;
    title: string;
    summary: string;
    updated_at: string;
    reader_review?: Record<string, unknown> | null;
  };
  client_request_id: string;
}) {
  const repository = createStoryKnowledgeRepository();
  const items = await repository.listCanonItemsByStory(input.chapter.story_id);
  const openIssues = (await repository.listContinuityIssuesByStory(input.chapter.story_id)).filter(
    (item) => item.resolution_status === "open",
  );
  const recentPatches = await repository.listCanonPatchesByStory(input.chapter.story_id);
  const continuityBrief = buildContinuityBrief({
    items,
    recentPatches,
    openIssues,
    latestChapter: {
      id: input.chapter.id,
      story_id: input.chapter.story_id,
      chapter_no: input.chapter.chapter_no,
      status: "accepted",
      title: input.chapter.title,
      body_text: "",
      summary: input.chapter.summary,
      scene_card_set: null,
      reader_review: input.chapter.reader_review ?? null,
      generation_job_id: null,
      created_at: input.chapter.updated_at,
      updated_at: input.chapter.updated_at,
    },
  });
  const targetItem =
    items.find((item) => item.id === continuityBrief.suggested_patch?.target_item_id) ??
    items.find((item) => item.item_type === "relationship") ??
    null;

  if (!targetItem) {
    return {
      continuity_patch_id: null,
      continuity_patch_summary: null,
    };
  }

  const readerReview = parseReaderReview(input.chapter.reader_review ?? null);
  const patchAttributes = {
    last_accepted_chapter_id: input.chapter.id,
    last_accepted_chapter_title: input.chapter.title,
    last_accepted_chapter_summary: input.chapter.summary,
    last_acceptance_decision: "accept",
    last_acceptance_at: input.chapter.updated_at,
    last_continuity_digest: continuityBrief.compact_summary,
  };

  targetItem.attributes = {
    ...targetItem.attributes,
    ...patchAttributes,
  };
  targetItem.version_no += 1;
  targetItem.updated_at = input.chapter.updated_at;
  targetItem.continuity_status = "stable";
  await repository.saveCanonItem(targetItem);

  const patch = await repository.createCanonPatch({
    story_id: input.chapter.story_id,
    target_item_id: targetItem.id,
    patch_document: {
      attributes: patchAttributes,
      ...(readerReview
        ? {
            reader_review: {
              summary: readerReview.summary,
              acceptance_recommendation: readerReview.acceptance_recommendation,
              rewrite_targets: readerReview.rewrite_targets,
            },
          }
        : {}),
      continuity_brief: continuityBrief,
    },
    reason: continuityBrief.suggested_patch?.reason ?? `accepted_chapter:${input.chapter.id}`,
    status: "applied",
    source_type: "continuity_fix",
    client_request_id: input.client_request_id,
    created_at: input.chapter.updated_at,
  });
  const resolvedIssues = openIssues.filter((issue) =>
    issue.object_refs.some((ref) => ref.ref_type === "canon_item" && ref.ref_id === targetItem.id),
  );

  await Promise.all(
    resolvedIssues.map((issue) =>
      repository.saveContinuityIssue({
        ...issue,
        resolution_status: "fixed",
      }),
    ),
  );

  await recordDomainEvent({
    event_name: "continuity_patch_applied",
    account_id: input.account_id,
    payload: {
      story_id: input.chapter.story_id,
      chapter_id: input.chapter.id,
      patch_id: patch.id,
      resolved_issue_count: resolvedIssues.length,
    },
  });

  return {
    continuity_patch_id: patch.id,
    continuity_patch_summary:
      resolvedIssues.length > 0
        ? `第${input.chapter.chapter_no}章已写回 continuity，并收口 ${resolvedIssues.length} 条 open issue。`
        : `第${input.chapter.chapter_no}章已写回 continuity。`,
  };
}
