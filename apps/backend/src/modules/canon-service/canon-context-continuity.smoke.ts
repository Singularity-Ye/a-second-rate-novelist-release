import { readAppState } from "../../common/store.js";
import { composeContextBundle } from "../context-composer/context-composer.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { getRuntimeTaskById } from "../runtime-tasks/runtime-tasks.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";
import { requestChapterGeneration } from "../chapter-runtime/chapter-runtime.service.js";
import { acceptChapter } from "../chapter-runtime/revision/chapter-revision.service.js";
import { applyCanonPatch, getCanonView, getContinuityIssues } from "./canon-service.service.js";

async function bootstrapStory() {
  const account = await upsertShadowAccount({
    account_token: `canon-context-continuity-${Date.now()}`,
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想确认 continuity brief、patch suggestion 和 accepted writeback 已经成为同一条主链。",
    },
    client_request_id: "canon-context-continuity-session",
  });
  const proposals = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: "canon-context-continuity-proposals",
  });
  const accepted = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: "canon-context-continuity-accept-story",
  });

  return accepted.story_id;
}

async function main() {
  const story_id = await bootstrapStory();
  const queued = await requestChapterGeneration({
    story_id,
    target: "first_chapter",
    client_request_id: "canon-context-continuity-generate",
  });
  const runtimeTask = await getRuntimeTaskById(queued.job_id);

  if (!runtimeTask.result_chapter_id) {
    throw new Error(`runtime task ${queued.job_id} did not return a chapter id`);
  }

  const canonBeforeAccept = await getCanonView({
    story_id,
  });
  const relationshipItem = canonBeforeAccept.items.find((item) => item.item_type === "relationship");

  if (!relationshipItem) {
    throw new Error(`story ${story_id} has no relationship item for continuity smoke`);
  }

  await applyCanonPatch({
    story_id,
    target_item_id: relationshipItem.item_id,
    patch_document: {
      attributes: {
        relationship_status: "旧识复燃",
      },
    },
    reason: "为 accepted_chapter writeback 制造一条需要收口的 continuity issue。",
    client_request_id: "canon-context-continuity-open-issue",
  });

  const issuesBeforeAccept = await getContinuityIssues({
    story_id,
  });
  const accepted = await acceptChapter({
    chapter_id: runtimeTask.result_chapter_id,
    client_request_id: "canon-context-continuity-accept-chapter",
  });
  const canonAfterAccept = await getCanonView({
    story_id,
  });
  const issuesAfterAccept = await getContinuityIssues({
    story_id,
  });
  const postAcceptBundle = await composeContextBundle({
    story_id,
    task_type: "write",
    token_budget: 1200,
  });
  const state = await readAppState();
  const continuityPatch = state.canonPatches.find(
    (item) =>
      item.story_id === story_id &&
      item.source_type === "continuity_fix" &&
      item.client_request_id === "canon-context-continuity-accept-chapter",
  );

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        story_id,
        job_id: queued.job_id,
        chapter_id: runtimeTask.result_chapter_id,
        canon_before_accept: canonBeforeAccept.continuity_brief,
        issues_before_accept: issuesBeforeAccept,
        accepted,
        continuity_patch: continuityPatch
          ? {
              patch_id: continuityPatch.id,
              reason: continuityPatch.reason,
              status: continuityPatch.status,
            }
          : null,
        canon_after_accept: canonAfterAccept.continuity_brief,
        issues_after_accept: issuesAfterAccept,
        post_accept_context_policy: postAcceptBundle.continuity_policy,
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
