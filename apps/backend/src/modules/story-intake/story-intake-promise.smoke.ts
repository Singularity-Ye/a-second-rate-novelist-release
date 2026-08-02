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
  process.env.S3_BUCKET ??= "story-intake-promise-smoke";

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
    account_token: "wx-openid-story-intake-promise-smoke",
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想看雨夜重逢、暧昧拉扯、前十章别太快在一起。",
    },
    client_request_id: "req-story-intake-promise-session",
  });
  const generated = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: "req-story-intake-promise-proposals",
  });
  const accepted = await acceptStoryProposal({
    proposal_id: generated.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: "req-story-intake-promise-accept",
  });

  await flushMicrotasks();

  const proposalTask = await getRuntimeTaskById(generated.job_id ?? "");

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        session_id: session.session_id,
        story_id: accepted.story_id,
        genre_brief: generated.genre_brief,
        proposal_task_artifact_types: proposalTask.result_artifact_refs.map((item) => item.artifact_type),
        proposal_payload_summary: generated.proposals.map((proposal) => ({
          proposal_id: proposal.proposal_id,
          genre_lane: proposal.payload.genre_lane,
          front_ten_chapter_promise: proposal.payload.front_ten_chapter_promise,
        })),
        accepted_commission_brief: {
          genre_lane: accepted.commission_brief.genre_lane,
          front_ten_chapter_promise: accepted.commission_brief.front_ten_chapter_promise,
        },
        accepted_outline_bundle: {
          front_ten_chapter_promise: accepted.outline_bundle.front_ten_chapter_promise,
          chapter_titles: accepted.outline_bundle.chapters.map((chapter) => chapter.title),
        },
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
