import { readAppState } from "../../common/store.js";
import { getChapterById, requestChapterGeneration } from "../chapter-runtime/chapter-runtime.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { getRuntimeTaskById } from "../runtime-tasks/runtime-tasks.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";
import { composeContextBundle } from "./context-composer.service.js";

async function bootstrapStory() {
  const account = await upsertShadowAccount({
    account_token: `context-composer-scene-first-${Date.now()}`,
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想确认章节生成前后，context composer 会从 outline fallback 切到 scene-first 主链。",
    },
    client_request_id: "context-composer-scene-first-session",
  });
  const proposals = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: "context-composer-scene-first-proposals",
  });
  const accepted = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: "context-composer-scene-first-accept",
  });

  return accepted.story_id;
}

async function main() {
  const story_id = await bootstrapStory();
  const beforeGeneration = await composeContextBundle({
    story_id,
    task_type: "write",
    token_budget: 1200,
  });
  const queued = await requestChapterGeneration({
    story_id,
    target: "first_chapter",
    client_request_id: "context-composer-scene-first-generate",
  });
  const runtimeTask = await getRuntimeTaskById(queued.job_id);

  if (!runtimeTask.result_chapter_id) {
    throw new Error(`runtime task ${queued.job_id} did not write back a chapter`);
  }

  const afterGeneration = await composeContextBundle({
    story_id,
    task_type: "write",
    token_budget: 1200,
  });
  const chapter = await getChapterById(story_id, runtimeTask.result_chapter_id);
  const state = await readAppState();
  const taskRecord = state.runtimeTasks.find((item) => item.id === queued.job_id) ?? null;
  const latestStoredBundle = state.contextBundles
    .filter((item) => item.story_id === story_id && item.task_type === "write" && item.token_budget === 1200)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        story_id,
        job_id: queued.job_id,
        pre_generation_bundle: {
          bundle_id: beforeGeneration.bundle_id,
          source_artifact_type: beforeGeneration.scene_focus.source_artifact_type,
          scene_goal: beforeGeneration.scene_focus.scene_goal,
          promise_gap: beforeGeneration.promise_slice.promise_gap,
          reveal_policy: beforeGeneration.continuity_policy.reveal_policy,
        },
        post_generation_bundle: {
          bundle_id: afterGeneration.bundle_id,
          source_artifact_type: afterGeneration.scene_focus.source_artifact_type,
          scene_goal: afterGeneration.scene_focus.scene_goal,
          promise_gap: afterGeneration.promise_slice.promise_gap,
          reveal_policy: afterGeneration.continuity_policy.reveal_policy,
          reader_review_summary: afterGeneration.promise_slice.reader_review_summary,
        },
        runtime_task: {
          status: runtimeTask.status,
          callback_status: runtimeTask.callback_status,
          memory_map: taskRecord?.memory_map ?? null,
          tool_scope: taskRecord?.tool_scope ?? [],
        },
        latest_stored_bundle: latestStoredBundle
          ? {
              bundle_id: latestStoredBundle.id,
              source_artifact_type: latestStoredBundle.scene_focus.source_artifact_type,
            }
          : null,
        chapter_preview: {
          chapter_id: chapter.chapter_id,
          title: chapter.title,
          body_excerpt: chapter.body_text.slice(0, 320),
          scene_card_set: chapter.scene_card_set,
          reader_review: chapter.reader_review,
        },
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
