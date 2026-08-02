import { __setCreativeArtifactObjectStorageShadowUploaderForTests } from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { getRuntimeTaskById } from "../runtime-tasks/runtime-tasks.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "./story-intake.service.js";

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  process.env.S3_BUCKET ??= "story-intake-mainline-smoke";

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
    account_token: "wx-openid-story-intake-mainline-smoke",
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想验证 F2 已经从提案文案升级成完整立项主链。",
    },
    client_request_id: "req-story-intake-mainline-session",
  });
  const generated = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: "req-story-intake-mainline-proposals",
  });
  const accepted = await acceptStoryProposal({
    proposal_id: generated.proposals[0]!.proposal_id,
    commission_adjustments: {
      tone_hint: "暧昧值更高，但前两章先别确认关系。",
    },
    launch_first_chapter: false,
    client_request_id: "req-story-intake-mainline-accept",
  });

  await flushMicrotasks();

  const proposalTask = await getRuntimeTaskById(generated.job_id ?? "");

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        account_id: account.account_id,
        session_id: session.session_id,
        story_id: accepted.story_id,
        proposal_task_status: proposalTask.status,
        proposal_task_artifact_types: proposalTask.result_artifact_refs.map((item) => item.artifact_type),
        selected_proposal: {
          proposal_id: accepted.selected_proposal.proposal_id,
          title: accepted.selected_proposal.title,
        },
        canon_seed: {
          item_count: accepted.canon_seed.item_count,
          titles: accepted.canon_seed.items.map((item) => item.title),
        },
        outline_bundle: {
          chapter_titles: accepted.outline_bundle.chapters.map((item) => item.title),
          chapter_goals: accepted.outline_bundle.chapters.map((item) => item.goal),
        },
        artifact_writes: artifactWrites,
        deep_link: accepted.deep_link,
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
