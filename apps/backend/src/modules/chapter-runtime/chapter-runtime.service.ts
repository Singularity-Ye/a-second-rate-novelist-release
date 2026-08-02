import type {
  ChapterGenerateRequest,
  ChapterGenerateResponse,
  ChapterReaderReviewView,
  ChapterSceneCardView,
  ChapterView,
} from "@erliu/shared-contracts";
import { createChapterRuntimeRepository } from "../../common/repositories/chapter-runtime.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import {
  parseCreativeChapterArtifact,
  toAcceptedChapterObjectKey,
  toChapterDraftObjectKey,
  toChapterViewFromArtifact,
} from "../../common/truth-source/creative-artifact.contract.js";
import { readCreativeArtifactObjectStorageShadow } from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { assertAccountAiBudgetAvailable } from "../identity-membership/account-control-plane.service.js";
import { evaluatePolicyVerdict } from "../governance-compliance/policy-engine.service.js";
import {
  drainQueuedRuntimeTasks,
  queueChapterGenerationTask,
} from "../runtime-tasks/runtime-tasks.service.js";

export async function requestChapterGeneration(
  input: { story_id: string } & ChapterGenerateRequest,
): Promise<ChapterGenerateResponse> {
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(input.story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${input.story_id}`);
  }

  const policy_verdict = await evaluatePolicyVerdict({
    scope: "chapter_generation",
    account_id: workspace.account_id,
    story_id: input.story_id,
    source_ref: {
      ref_type: "chapter_request",
      ref_id: `${input.story_id}:${input.client_request_id}`,
    },
    input_text: input.instruction_context ?? null,
  });

  if (policy_verdict.verdict === "block" || policy_verdict.verdict === "human_review") {
    const repository = createChapterRuntimeRepository();
    const task = await repository.createRuntimeTask({
      job_type: "chapter_generate",
      account_id: workspace.account_id,
      story_id: input.story_id,
      session_id: null,
      target: input.target,
      client_request_id: input.client_request_id,
      idempotency_key: `chapter_generate:${input.story_id}:${input.target}:${input.client_request_id}`,
    });
    task.status = policy_verdict.verdict === "human_review" ? "waiting_human" : "failed";
    task.failure_kind = policy_verdict.verdict === "human_review" ? "human_review_required" : "compliance_blocked";
    task.task_result_summary = `Chapter generation held by policy verdict ${policy_verdict.verdict}.`;
    task.updated_at = new Date().toISOString();
    await repository.saveRuntimeTask(task);

    return {
      job_id: task.id,
      status: task.status,
      notification_id: null,
      policy_verdict,
    };
  }

  await assertAccountAiBudgetAvailable(workspace.account_id, "text_generation");

  const queued = await queueChapterGenerationTask({
    story_id: input.story_id,
    target: input.target,
    client_request_id: input.client_request_id,
  });

  // 当前仍保留同步 dispatch 入口，便于现有主链复用；真正的 runtime foundation
  // 已在 runtime-tasks 内部切成 queue -> dispatch -> callback writeback。
  await drainQueuedRuntimeTasks();
  return {
    ...queued,
    policy_verdict,
  };
}

async function resolveChapterViewFromCreativeArtifact(input: {
  account_id: string;
  story_id: string;
  chapter_id: string;
}) {
  const acceptedRaw = await readCreativeArtifactObjectStorageShadow({
    account_id: input.account_id,
    aggregate_key: "accepted_chapter",
    object_key: toAcceptedChapterObjectKey(input.story_id, input.chapter_id),
  });
  const acceptedArtifact = acceptedRaw ? parseCreativeChapterArtifact(acceptedRaw) : null;

  if (acceptedArtifact?.artifact_type === "accepted_chapter") {
    return toChapterViewFromArtifact(acceptedArtifact);
  }

  const draftRaw = await readCreativeArtifactObjectStorageShadow({
    account_id: input.account_id,
    aggregate_key: "chapter_draft",
    object_key: toChapterDraftObjectKey(input.story_id, input.chapter_id),
  });
  const draftArtifact = draftRaw ? parseCreativeChapterArtifact(draftRaw) : null;

  return draftArtifact ? toChapterViewFromArtifact(draftArtifact) : null;
}

export function toChapterSceneCardView(raw: Record<string, unknown> | null | undefined): ChapterSceneCardView | null {
  if (!raw) {
    return null;
  }

  const chapter_goal = typeof raw.chapter_goal === "string" ? raw.chapter_goal : null;
  const chapter_cliffhanger_goal =
    typeof raw.chapter_cliffhanger_goal === "string" ? raw.chapter_cliffhanger_goal : null;
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const firstScene = scenes[0] as Record<string, unknown> | undefined;
  const first_scene_goal = firstScene && typeof firstScene.scene_goal === "string" ? firstScene.scene_goal : null;

  if (!chapter_goal || !chapter_cliffhanger_goal || !first_scene_goal) {
    return null;
  }

  return {
    chapter_goal,
    chapter_cliffhanger_goal,
    scene_count: scenes.length,
    first_scene_goal,
  };
}

export function toChapterReaderReviewView(
  raw: Record<string, unknown> | null | undefined,
): ChapterReaderReviewView | null {
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

function attachChapterWorkflowViews(
  chapterView: ChapterView,
  chapterRecord: Awaited<ReturnType<ReturnType<typeof createChapterRuntimeRepository>["findChapterByStoryAndId"]>>,
): ChapterView {
  return {
    ...chapterView,
    ...(chapterRecord?.scene_card_set
      ? { scene_card_set: toChapterSceneCardView(chapterRecord.scene_card_set) }
      : {}),
    ...(chapterRecord?.reader_review
      ? { reader_review: toChapterReaderReviewView(chapterRecord.reader_review) }
      : {}),
  };
}

export async function getCurrentChapterByStoryId(story_id: string): Promise<ChapterView | null> {
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(story_id);

  if (!workspace?.current_chapter_id) {
    return null;
  }

  return getChapterById(story_id, workspace.current_chapter_id);
}

export async function getLatestReadableChapterByStoryId(story_id: string): Promise<ChapterView | null> {
  const currentChapter = await getCurrentChapterByStoryId(story_id);

  if (currentChapter) {
    return currentChapter;
  }

  const latestChapter = (await createChapterRuntimeRepository().listChaptersByStory(story_id)).sort((left, right) => {
    if (right.chapter_no !== left.chapter_no) {
      return right.chapter_no - left.chapter_no;
    }

    return right.updated_at.localeCompare(left.updated_at);
  })[0];

  return latestChapter ? getChapterById(story_id, latestChapter.id) : null;
}

export async function getChapterById(story_id: string, chapter_id: string): Promise<ChapterView> {
  const repository = createChapterRuntimeRepository();
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(story_id);
  const account_id = workspace?.account_id ?? "system";
  const chapter = await repository.findChapterByStoryAndId(story_id, chapter_id);
  const artifactView = await resolveChapterViewFromCreativeArtifact({
    account_id,
    story_id,
    chapter_id,
  });

  if (artifactView) {
    return attachChapterWorkflowViews(artifactView, chapter);
  }

  if (!chapter) {
    throw new Error(`Chapter not found for id ${chapter_id}`);
  }

  return attachChapterWorkflowViews({
    chapter_id: chapter.id,
    story_id: chapter.story_id,
    chapter_no: chapter.chapter_no,
    title: chapter.title,
    status: chapter.status,
    body_text: chapter.body_text,
    summary: chapter.summary,
  }, chapter);
}
