import { randomUUID } from "node:crypto";
import type {
  ChapterAcceptResponse,
  ChapterRevisionRequest,
  ChapterRevisionResponse,
  ChapterRevisionView,
} from "@erliu/shared-contracts";
import { createChapterRuntimeRepository } from "../../../common/repositories/chapter-runtime.repository.js";
import { createStoryWorkspaceRepository } from "../../../common/repositories/story-workspace.repository.js";
import { toChapterReaderReviewView } from "../chapter-runtime.service.js";
import { applyAcceptedChapterContinuityWriteback } from "../../canon-service/canon-service.service.js";
import {
  parseCreativeChapterArtifact,
  toAcceptedChapterArtifact,
  toAcceptedChapterObjectKey,
  toChapterDraftObjectKey,
  toChapterRevisionArtifact,
  toChapterRevisionObjectKey,
} from "../../../common/truth-source/creative-artifact.contract.js";
import {
  readCreativeArtifactObjectStorageShadow,
  scheduleCreativeArtifactObjectStorageShadowUpload,
} from "../../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { recordDomainEvent } from "../../telemetry-intake/telemetry-intake.service.js";

async function emitEvent(
  event_name: string,
  account_id: string,
  payload: Record<string, string | number | boolean | null>,
) {
  await recordDomainEvent({
    event_name,
    account_id,
    payload,
  });
}

export async function acceptChapter(input: {
  chapter_id: string;
  client_request_id: string;
}): Promise<ChapterAcceptResponse> {
  const repository = createChapterRuntimeRepository();
  const chapter = await repository.findChapterById(input.chapter_id);

  if (!chapter) {
    throw new Error(`Chapter not found for id ${input.chapter_id}`);
  }

  chapter.status = "accepted";
  chapter.updated_at = new Date().toISOString();
  await repository.saveChapter(chapter);

  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(chapter.story_id);

  if (workspace) {
    workspace.current_chapter_id = chapter.id;
    workspace.updated_at = chapter.updated_at;
    workspace.updated_by = "chapter-revision";
    await createStoryWorkspaceRepository().saveWorkspace(workspace);

    scheduleCreativeArtifactObjectStorageShadowUpload({
      account_id: workspace.account_id,
      aggregate_key: "accepted_chapter",
      object_key: toAcceptedChapterObjectKey(chapter.story_id, chapter.id),
      body: JSON.stringify(toAcceptedChapterArtifact(chapter)),
      content_type: "application/json",
    });

    await emitEvent("chapter_accepted", workspace.account_id, {
      story_id: chapter.story_id,
      chapter_id: chapter.id,
    });

    const continuityPatch = await applyAcceptedChapterContinuityWriteback({
      account_id: workspace.account_id,
      chapter,
      client_request_id: input.client_request_id,
    });

    return {
      chapter_id: chapter.id,
      status: "accepted",
      room_snapshot_hint: {
        highlight: "computer",
      },
      accepted_object_key: toAcceptedChapterObjectKey(chapter.story_id, chapter.id),
      continuity_patch_id: continuityPatch.continuity_patch_id,
      continuity_patch_summary: continuityPatch.continuity_patch_summary,
      truth_source_effect: "accepted_to_mainline",
      reader_review: toChapterReaderReviewView(chapter.reader_review ?? null),
    };
  }

  return {
    chapter_id: chapter.id,
    status: "accepted",
    room_snapshot_hint: {
      highlight: "computer",
    },
    accepted_object_key: toAcceptedChapterObjectKey(chapter.story_id, chapter.id),
    continuity_patch_id: null,
    continuity_patch_summary: null,
    truth_source_effect: "accepted_to_mainline",
    reader_review: toChapterReaderReviewView(chapter.reader_review ?? null),
  };
}

async function resolveBaseChapterBodyText(input: {
  account_id: string;
  story_id: string;
  chapter_id: string;
  fallback_body_text: string;
}) {
  const acceptedRaw = await readCreativeArtifactObjectStorageShadow({
    account_id: input.account_id,
    aggregate_key: "accepted_chapter",
    object_key: toAcceptedChapterObjectKey(input.story_id, input.chapter_id),
  });
  const acceptedArtifact = acceptedRaw ? parseCreativeChapterArtifact(acceptedRaw) : null;

  if (acceptedArtifact?.artifact_type === "accepted_chapter") {
    return acceptedArtifact.body_text;
  }

  const draftRaw = await readCreativeArtifactObjectStorageShadow({
    account_id: input.account_id,
    aggregate_key: "chapter_draft",
    object_key: toChapterDraftObjectKey(input.story_id, input.chapter_id),
  });
  const draftArtifact = draftRaw ? parseCreativeChapterArtifact(draftRaw) : null;

  return draftArtifact?.body_text ?? input.fallback_body_text;
}

export async function createChapterRevision(input: {
  chapter_id: string;
} & ChapterRevisionRequest): Promise<ChapterRevisionResponse> {
  const repository = createChapterRuntimeRepository();
  const chapter = await repository.findChapterById(input.chapter_id);

  if (!chapter) {
    throw new Error(`Chapter not found for id ${input.chapter_id}`);
  }

  if (input.revision_kind === "light_edit" && !input.anchor_range) {
    throw new Error("STR-005 revision anchor invalid");
  }

  const readerReview = toChapterReaderReviewView(chapter.reader_review ?? null);

  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(chapter.story_id);
  const baseBodyText = workspace
    ? await resolveBaseChapterBodyText({
        account_id: workspace.account_id,
        story_id: chapter.story_id,
        chapter_id: chapter.id,
        fallback_body_text: chapter.body_text,
      })
    : chapter.body_text;
  const now = new Date().toISOString();
  const revision = await repository.createChapterRevision({
    chapter_id: chapter.id,
    revision_kind: input.revision_kind,
    instruction_text: input.instruction_text,
    anchor_range:
      input.revision_kind === "light_edit"
        ? {
            start_paragraph: input.anchor_range!.start_paragraph,
            end_paragraph: input.anchor_range!.end_paragraph,
          }
        : null,
    revised_text:
      input.revision_kind === "light_edit"
        ? `轻改结果：${input.instruction_text}\n\n${readerReview ? `读者回看建议：${readerReview.summary}\n优先处理：${readerReview.rewrite_targets[0] ?? "保持章末钩子"}\n\n` : ""}${baseBodyText}\n\n[已按指定段落轻改，更克制一点。]`
        : `整章重写结果：${input.instruction_text}\n\n${readerReview ? `读者回看建议：${readerReview.summary}\n优先处理：${readerReview.rewrite_targets[0] ?? "保持章末钩子"}\n\n` : ""}${baseBodyText}\n\n[rewrite pass completed]`,
    source_intent_id: `intent_${input.client_request_id}`,
    created_at: now,
  });

  if (workspace) {
    scheduleCreativeArtifactObjectStorageShadowUpload({
      account_id: workspace.account_id,
      aggregate_key: "chapter_revision",
      object_key: toChapterRevisionObjectKey(chapter.story_id, chapter.id, revision.id),
      body: JSON.stringify(toChapterRevisionArtifact(chapter.story_id, revision)),
      content_type: "application/json",
    });

    await emitEvent("chapter_revision_requested", workspace.account_id, {
      revision_kind: input.revision_kind,
      anchor_range_count: input.anchor_range ? 1 : 0,
    });
  }

  if (input.revision_kind === "rewrite") {
    const revisionCount = (await repository.listRevisionsByChapterId(chapter.id)).length;

    return {
      job_id: randomUUID(),
      revision: null,
      revision_count: revisionCount,
      truth_source_effect: "revision_pending",
      status: "queued",
      reader_review: readerReview,
    };
  }

  const revisionCount = (await repository.listRevisionsByChapterId(chapter.id)).length;

  return {
    job_id: null,
    revision: toRevisionView(revision),
    revision_count: revisionCount,
    truth_source_effect: "draft_only",
    status: "succeeded",
    reader_review: readerReview,
  };
}

export async function getLatestRevisionByChapterId(chapter_id: string): Promise<ChapterRevisionView | null> {
  const revisions = await createChapterRuntimeRepository().listRevisionsByChapterId(chapter_id);
  const latest = revisions.at(-1);
  return latest ? toRevisionView(latest) : null;
}

export async function getRevisionCountByChapterId(chapter_id: string): Promise<number> {
  return (await createChapterRuntimeRepository().listRevisionsByChapterId(chapter_id)).length;
}

function toRevisionView(revision: {
  id: string;
  chapter_id: string;
  revision_kind: "rewrite" | "light_edit";
  revised_text: string;
}) {
  return {
    revision_id: revision.id,
    chapter_id: revision.chapter_id,
    revision_kind: revision.revision_kind,
    revised_text: revision.revised_text,
  };
}
