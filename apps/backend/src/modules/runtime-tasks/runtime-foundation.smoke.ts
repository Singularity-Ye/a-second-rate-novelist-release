import { readAppState } from "../../common/store.js";
import { getTruthSourceHealthSnapshot } from "../../common/truth-source/truth-source.config.js";
import { getChapterById } from "../chapter-runtime/chapter-runtime.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";
import { drainQueuedRuntimeTasks, getRuntimeTaskById, queueChapterGenerationTask } from "./runtime-tasks.service.js";

async function bootstrapStory() {
  const account = await upsertShadowAccount({
    account_token: `runtime-foundation-smoke-${Date.now()}`,
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "给我一条能证明 runtime foundation 已经接上 context、persona 和 writeback 的故事。",
    },
    client_request_id: "runtime-foundation-smoke-session",
  });
  const proposals = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: "runtime-foundation-smoke-proposals",
  });
  const accepted = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: "runtime-foundation-smoke-accept",
  });

  return {
    story_id: accepted.story_id,
  };
}

async function main() {
  const { story_id } = await bootstrapStory();
  const queued = await queueChapterGenerationTask({
    story_id,
    target: "first_chapter",
    client_request_id: "runtime-foundation-smoke-generate",
  });

  await drainQueuedRuntimeTasks();

  const task = await getRuntimeTaskById(queued.job_id);

  if (!task.result_chapter_id) {
    throw new Error(`runtime task ${queued.job_id} did not write back a chapter id`);
  }

  const chapter = await getChapterById(story_id, task.result_chapter_id);
  const state = await readAppState();
  const taskRecord = state.runtimeTasks.find((item) => item.id === queued.job_id);
  const contextBundle = state.contextBundles.find((item) => item.id === task.context_bundle_id);
  const personaSnapshot = state.personaStateSnapshots.find((item) => item.id === task.persona_snapshot_id);

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        story_id,
        job_id: queued.job_id,
        runtime_task: task,
        runtime_task_record: taskRecord,
        chapter_preview: chapter.body_text.slice(0, 180),
        context_bundle: contextBundle
          ? {
              bundle_id: contextBundle.id,
              included_refs: contextBundle.included_refs.length,
              excluded_refs: contextBundle.excluded_refs.length,
            }
          : null,
        persona_snapshot: personaSnapshot
          ? {
              snapshot_id: personaSnapshot.id,
              state_code: personaSnapshot.state_code,
              reason_refs: personaSnapshot.reason_refs.length,
            }
          : null,
        truth_source: getTruthSourceHealthSnapshot(),
      },
      null,
      2,
    ),
  );
}

void main();
