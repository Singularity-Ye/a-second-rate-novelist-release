import { readAppState } from "../../common/store.js";
import { __setCreativeArtifactObjectStorageShadowUploaderForTests } from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { acceptChapter, createChapterRevision } from "./revision/chapter-revision.service.js";
import { getCurrentChapterByStoryId, requestChapterGeneration } from "./chapter-runtime.service.js";
import { getRuntimeTaskById } from "../runtime-tasks/runtime-tasks.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  process.env.S3_BUCKET ??= "chapter-runtime-mainline-smoke";

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
    account_token: "wx-openid-chapter-runtime-mainline-smoke",
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想验证 F4 已经不止是生成一段内容，而是完整章节主链。",
    },
    client_request_id: "req-chapter-runtime-mainline-session",
  });
  const proposals = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: "req-chapter-runtime-mainline-proposals",
  });
  const story = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: "req-chapter-runtime-mainline-accept-story",
  });
  const generated = await requestChapterGeneration({
    story_id: story.story_id,
    target: "first_chapter",
    client_request_id: "req-chapter-runtime-mainline-generate",
  });
  const runtimeTask = await getRuntimeTaskById(generated.job_id);
  const chapterId = runtimeTask.result_chapter_id ?? "";
  const revision = await createChapterRevision({
    chapter_id: chapterId,
    revision_kind: "light_edit",
    instruction_text: "把这一段的暧昧写得更克制一点。",
    anchor_range: {
      start_paragraph: 2,
      end_paragraph: 2,
    },
    client_request_id: "req-chapter-runtime-mainline-light-edit",
  });
  const accepted = await acceptChapter({
    chapter_id: chapterId,
    client_request_id: "req-chapter-runtime-mainline-accept-chapter",
  });

  await flushMicrotasks();

  const currentChapter = await getCurrentChapterByStoryId(story.story_id);
  const state = await readAppState();
  const continuityPatch = state.canonPatches.find(
    (item) =>
      item.story_id === story.story_id &&
      item.source_type === "continuity_fix" &&
      item.client_request_id === "req-chapter-runtime-mainline-accept-chapter",
  );

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        story_id: story.story_id,
        chapter_id: chapterId,
        runtime_task_status: runtimeTask.status,
        runtime_task_artifact_types: runtimeTask.result_artifact_refs.map((item) => item.artifact_type),
        revision: {
          revision_count: revision.revision_count,
          truth_source_effect: revision.truth_source_effect,
          revised_text_preview: revision.revision?.revised_text.slice(0, 80) ?? null,
        },
        accepted: {
          status: accepted.status,
          accepted_object_key: accepted.accepted_object_key,
          truth_source_effect: accepted.truth_source_effect,
          continuity_patch_id: accepted.continuity_patch_id,
          continuity_patch_summary: accepted.continuity_patch_summary,
        },
        current_chapter: currentChapter
          ? {
              chapter_id: currentChapter.chapter_id,
              status: currentChapter.status,
              title: currentChapter.title,
            }
          : null,
        canon_patch: continuityPatch
          ? {
              patch_id: continuityPatch.id,
              reason: continuityPatch.reason,
              source_type: continuityPatch.source_type,
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
