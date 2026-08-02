import type {
  CanonContinuityBriefView,
  CanonViewResponse,
  ContextBundleResponse,
  ContextContinuityPolicyView,
  ContextPromiseSliceView,
  ContextSceneFocusView,
} from "@erliu/shared-contracts";
import type { CanonPatchRecord, ContinuityIssueRecord } from "../../common/repositories/story-knowledge.repository.js";
import type { ChapterRecord } from "../../common/repositories/chapter-runtime.repository.js";
import { buildPlannedSceneCardSet, toContextSceneFocusView } from "../chapter-runtime/scene-card-planning.js";

type ReadyAssetCandidate = Array<{
  attachment: {
    asset_id: string;
  };
  asset: {
    id: string;
    file_name: string;
  } | null;
}>;

type ContextCandidate = ContextBundleResponse["included_refs"][number];

function parseSceneCardSet(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return null;
  }

  const chapter_goal = typeof raw.chapter_goal === "string" ? raw.chapter_goal : null;
  const chapter_cliffhanger_goal =
    typeof raw.chapter_cliffhanger_goal === "string" ? raw.chapter_cliffhanger_goal : null;
  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes.filter((item): item is {
        scene_no: number;
        scene_goal: string;
        conflict: string;
        turning_point: string;
        must_keep_reveal_state: string;
      } => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.scene_no === "number" &&
          typeof candidate.scene_goal === "string" &&
          typeof candidate.conflict === "string" &&
          typeof candidate.turning_point === "string" &&
          typeof candidate.must_keep_reveal_state === "string"
        );
      })
    : [];

  if (!chapter_goal || !chapter_cliffhanger_goal || scenes.length === 0) {
    return null;
  }

  return {
    chapter_goal,
    chapter_cliffhanger_goal,
    scenes,
  };
}

function parseReaderReview(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return null;
  }

  const summary = typeof raw.summary === "string" ? raw.summary : null;
  const rewrite_targets = Array.isArray(raw.rewrite_targets)
    ? raw.rewrite_targets.filter((item): item is string => typeof item === "string")
    : [];

  if (!summary) {
    return null;
  }

  return {
    summary,
    rewrite_targets,
  };
}

function resolveSceneFocus(input: {
  story_id: string;
  relationship_promise: string;
  front_ten_chapter_promise: string;
  latestChapter: ChapterRecord | null;
}): { scene_focus: ContextSceneFocusView; ref: ContextCandidate } {
  const latestSceneCardSet = parseSceneCardSet(input.latestChapter?.scene_card_set ?? null);

  if (latestSceneCardSet && input.latestChapter) {
    return {
      scene_focus: toContextSceneFocusView(latestSceneCardSet, "scene_card_set"),
      ref: {
        ref_type: "scene_card_set",
        ref_id: input.latestChapter.id,
        title: latestSceneCardSet.chapter_goal,
      },
    };
  }

  const planned = buildPlannedSceneCardSet({
    story_id: input.story_id,
    chapter_id: `planned-${input.story_id}`,
    relationship_promise: input.relationship_promise,
    front_ten_chapter_promise: input.front_ten_chapter_promise,
  });

  return {
    scene_focus: toContextSceneFocusView(planned, "outline_bundle"),
    ref: {
      ref_type: "outline_bundle",
      ref_id: planned.based_on_outline_bundle_id,
      title: planned.chapter_goal,
    },
  };
}

function resolvePromiseSlice(input: {
  story_id: string;
  front_ten_chapter_promise: string;
  relationship_promise: string;
  latestChapter: ChapterRecord | null;
}): { promise_slice: ContextPromiseSliceView; refs: ContextCandidate[] } {
  const readerReview = parseReaderReview(input.latestChapter?.reader_review ?? null);
  const refs: ContextCandidate[] = [
    {
      ref_type: "promise",
      ref_id: `front_ten_chapter_promise:${input.story_id}`,
      title: input.front_ten_chapter_promise,
    },
    {
      ref_type: "promise",
      ref_id: `relationship_promise:${input.story_id}`,
      title: input.relationship_promise,
    },
  ];

  if (readerReview && input.latestChapter) {
    refs.push({
      ref_type: "reader_review",
      ref_id: input.latestChapter.id,
      title: readerReview.summary,
    });
  }

  return {
    promise_slice: {
      front_ten_chapter_promise: input.front_ten_chapter_promise,
      relationship_promise: input.relationship_promise,
      reader_review_summary: readerReview?.summary ?? null,
      rewrite_targets: readerReview?.rewrite_targets ?? [],
      promise_gap:
        readerReview?.summary ??
        `${input.front_ten_chapter_promise} 还需要继续在本章里兑现，不要让 promise 只停留在委托文案。`,
    },
    refs,
  };
}

function resolveContinuityPolicy(input: {
  continuityBrief: CanonContinuityBriefView;
  guardedItems: CanonViewResponse["items"];
  recentPatches: CanonPatchRecord[];
  openIssues: ContinuityIssueRecord[];
  readerReviewInformed: boolean;
}): ContextContinuityPolicyView {
  return {
    reveal_policy: "reveal_safe",
    reveal_safe_summary: input.continuityBrief.reveal_safe_summary,
    compact_summary: input.continuityBrief.compact_summary,
    suggested_patch: input.continuityBrief.suggested_patch,
    guarded_canon_ids: input.guardedItems.map((item) => item.item_id),
    guarded_titles: input.guardedItems.map((item) => item.title),
    recent_patch_ids: input.recentPatches.map((item) => item.id),
    open_issue_ids: input.openIssues.map((item) => item.id),
    reader_review_informed: input.readerReviewInformed,
  };
}

export function buildSceneFirstContextPolicy(input: {
  story_id: string;
  front_ten_chapter_promise: string;
  relationship_promise: string;
  latestChapter: ChapterRecord | null;
  continuityBrief: CanonContinuityBriefView;
  publicItems: CanonViewResponse["items"];
  guardedItems: CanonViewResponse["items"];
  readyAssets: ReadyAssetCandidate;
  recentPatches: CanonPatchRecord[];
  openIssues: ContinuityIssueRecord[];
}): {
  composition_strategy: "scene_first";
  scene_focus: ContextSceneFocusView;
  promise_slice: ContextPromiseSliceView;
  continuity_policy: ContextContinuityPolicyView;
  candidates: ContextCandidate[];
} {
  const { scene_focus, ref: sceneRef } = resolveSceneFocus({
    story_id: input.story_id,
    relationship_promise: input.relationship_promise,
    front_ten_chapter_promise: input.front_ten_chapter_promise,
    latestChapter: input.latestChapter,
  });
  const { promise_slice, refs: promiseRefs } = resolvePromiseSlice({
    story_id: input.story_id,
    front_ten_chapter_promise: input.front_ten_chapter_promise,
    relationship_promise: input.relationship_promise,
    latestChapter: input.latestChapter,
  });
  const continuity_policy = resolveContinuityPolicy({
    continuityBrief: input.continuityBrief,
    guardedItems: input.guardedItems,
    recentPatches: input.recentPatches,
    openIssues: input.openIssues,
    readerReviewInformed: Boolean(promise_slice.reader_review_summary),
  });

  return {
    composition_strategy: "scene_first",
    scene_focus,
    promise_slice,
    continuity_policy,
    candidates: [
      sceneRef,
      ...promiseRefs,
      // User-confirmed assets should outrank generic public canon when budget is tight.
      ...input.readyAssets.map((item) => ({
        ref_type: "asset" as const,
        ref_id: item.asset?.id ?? item.attachment.asset_id,
        title: item.asset?.file_name ?? item.attachment.asset_id,
      })),
      ...input.publicItems.map((item) => ({
        ref_type: "canon" as const,
        ref_id: item.item_id,
        title: item.title,
      })),
    ],
  };
}
