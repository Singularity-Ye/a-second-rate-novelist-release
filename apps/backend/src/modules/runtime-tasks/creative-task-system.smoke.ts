import { readAppState } from "../../common/store.js";
import { __setCreativeArtifactObjectStorageShadowUploaderForTests } from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { toExportManifestObjectKey } from "../../common/truth-source/creative-artifact.contract.js";
import { requestChapterGeneration } from "../chapter-runtime/chapter-runtime.service.js";
import { acceptChapter } from "../chapter-runtime/revision/chapter-revision.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { createExportJob, createRiskCheck } from "../rights-export/rights-export.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";
import { getRuntimeTaskById, queueChapterGenerationTask } from "./runtime-tasks.service.js";

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  process.env.S3_BUCKET ??= "creative-task-system-smoke";

  const creativeArtifactWrites: Array<{
    aggregate_key: string;
    object_key: string;
  }> = [];

  __setCreativeArtifactObjectStorageShadowUploaderForTests({
    async putObject(input) {
      creativeArtifactWrites.push({
        aggregate_key: input.aggregate_key,
        object_key: input.object_key,
      });
    },
  });

  const account = await upsertShadowAccount({
    account_token: "wx-openid-creative-task-smoke",
    channel: "wechat",
  });
  const intake = await createStoryIntakeSession({
    account_token: account.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想验证 creative artifact 和 task system 已经成链。",
    },
    client_request_id: "req-creative-task-smoke-session",
  });
  const proposals = await generateStoryProposals({
    session_id: intake.session_id,
    client_request_id: "req-creative-task-smoke-proposals",
  });
  const accepted = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: true,
    client_request_id: "req-creative-task-smoke-accept",
  });

  const replayBeforeDrain = await queueChapterGenerationTask({
    story_id: accepted.story_id,
    target: "first_chapter",
    client_request_id: "req-creative-task-smoke-accept",
  });
  const queuedChapterTaskId = accepted.current_chapter_job?.job_id ?? replayBeforeDrain.job_id;

  const queuedChapter = await requestChapterGeneration({
    story_id: accepted.story_id,
    target: "next_chapter",
    client_request_id: "req-creative-task-smoke-next-chapter",
  });
  const generatedChapter = (await readAppState()).chapters.find((item) => item.generation_job_id === queuedChapter.job_id);

  if (!generatedChapter) {
    throw new Error("Expected generated chapter for creative task smoke");
  }

  await acceptChapter({
    chapter_id: generatedChapter.id,
    client_request_id: "req-creative-task-smoke-accept-generated",
  });

  const riskCheck = await createRiskCheck({
    story_id: accepted.story_id,
    export_purpose: "submission",
    branch_ids: [],
    asset_refs: [],
    label_mode_requested: "embedded_notice",
    include_submission_statement: false,
  });
  const exportJob = await createExportJob({
    story_id: accepted.story_id,
    export_purpose: "submission",
    formats: ["docx", "md"],
    chapter_range: {
      mode: "all",
    },
    branch_ids: [],
    include_evidence: true,
    include_rights_statement: true,
    label_mode_preference: "embedded_notice",
    risk_check_id: riskCheck.risk_check_id,
    client_request_id: "req-creative-task-smoke-export",
  });

  await flushMicrotasks();

  const proposalTask = await getRuntimeTaskById(proposals.job_id ?? "");
  const chapterReplayAfterDrain = await queueChapterGenerationTask({
    story_id: accepted.story_id,
    target: "first_chapter",
    client_request_id: "req-creative-task-smoke-accept",
  });
  const chapterTask = await getRuntimeTaskById(queuedChapterTaskId);

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        proposal_job_id: proposals.job_id,
        proposal_task_status: proposalTask.status,
        proposal_artifact_types: proposalTask.result_artifact_refs.map((item) => item.artifact_type),
        chapter_replay_same_job_before_drain: replayBeforeDrain.job_id === queuedChapterTaskId,
        chapter_replay_same_job_after_drain: chapterReplayAfterDrain.job_id === queuedChapterTaskId,
        chapter_task_status: chapterTask.status,
        chapter_task_artifact_types: chapterTask.result_artifact_refs.map((item) => item.artifact_type),
        export_job_id: exportJob.job_id,
        expected_export_manifest_key: toExportManifestObjectKey(accepted.story_id, exportJob.job_id),
        creative_artifact_writes: creativeArtifactWrites,
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
