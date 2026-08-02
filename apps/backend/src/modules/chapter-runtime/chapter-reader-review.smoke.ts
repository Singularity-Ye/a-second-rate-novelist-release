import { readAppState } from "../../common/store.js";
import { __setCreativeArtifactObjectStorageShadowUploaderForTests } from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { getRuntimeTaskById } from "../runtime-tasks/runtime-tasks.service.js";
import { acceptChapter, createChapterRevision } from "./revision/chapter-revision.service.js";
import { getLatestReadableChapterByStoryId, requestChapterGeneration } from "./chapter-runtime.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  process.env.S3_BUCKET ??= "chapter-reader-review-smoke";

  const artifactWrites: Array<{
    aggregate_key: string;
    object_key: string;
  }> = [];

  __setCreativeArtifactObjectStorageShadowUploaderForTests({
    async putObject(input) {
      artifactWrites.push({
        aggregate_key: input.aggregate_key,
        object_key: input.object_key,
      });
    },
  });

  const account = await upsertShadowAccount({
    account_token: "wx-openid-chapter-reader-review-smoke",
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想确认 scene card、reader review 和 acceptance gate 已经是 F4 主链真源。",
    },
    client_request_id: "req-chapter-reader-review-smoke-session",
  });
  const proposals = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: "req-chapter-reader-review-smoke-proposals",
  });
  const story = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: "req-chapter-reader-review-smoke-accept-story",
  });
  const generated = await requestChapterGeneration({
    story_id: story.story_id,
    target: "first_chapter",
    client_request_id: "req-chapter-reader-review-smoke-generate",
  });
  const runtimeTask = await getRuntimeTaskById(generated.job_id);
  const chapterId = runtimeTask.result_chapter_id ?? "";
  const latestReadable = await getLatestReadableChapterByStoryId(story.story_id);
  const revision = await createChapterRevision({
    chapter_id: chapterId,
    revision_kind: "light_edit",
    instruction_text: "把章末追更钩子再压深一点。",
    anchor_range: {
      start_paragraph: 2,
      end_paragraph: 3,
    },
    client_request_id: "req-chapter-reader-review-smoke-light-edit",
  });
  const accepted = await acceptChapter({
    chapter_id: chapterId,
    client_request_id: "req-chapter-reader-review-smoke-accept-chapter",
  });

  await flushMicrotasks();

  const state = await readAppState();
  const storedChapter = state.chapters.find((item) => item.id === chapterId) ?? null;
  const continuityPatch = state.canonPatches.find(
    (item) =>
      item.story_id === story.story_id &&
      item.source_type === "continuity_fix" &&
      item.client_request_id === "req-chapter-reader-review-smoke-accept-chapter",
  );

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        story_id: story.story_id,
        chapter_id: chapterId,
        runtime_task: {
          status: runtimeTask.status,
          artifact_types: runtimeTask.result_artifact_refs.map((item) => item.artifact_type),
          summary: runtimeTask.task_result_summary,
        },
        latest_readable_chapter: latestReadable
          ? {
              chapter_id: latestReadable.chapter_id,
              status: latestReadable.status,
              scene_card_set: latestReadable.scene_card_set,
              reader_review: latestReadable.reader_review,
            }
          : null,
        stored_chapter: storedChapter
          ? {
              status: storedChapter.status,
              scene_card_set: storedChapter.scene_card_set,
              reader_review: storedChapter.reader_review,
            }
          : null,
        revision: {
          status: revision.status,
          revision_count: revision.revision_count,
          truth_source_effect: revision.truth_source_effect,
          reader_review: revision.reader_review,
        },
        accepted: {
          status: accepted.status,
          accepted_object_key: accepted.accepted_object_key,
          truth_source_effect: accepted.truth_source_effect,
          continuity_patch_id: accepted.continuity_patch_id,
          continuity_patch_summary: accepted.continuity_patch_summary,
          reader_review: accepted.reader_review,
        },
        continuity_patch: continuityPatch
          ? {
              patch_id: continuityPatch.id,
              reason: continuityPatch.reason,
              status: continuityPatch.status,
            }
          : null,
        artifact_writes: artifactWrites,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
