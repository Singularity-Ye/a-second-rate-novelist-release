import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRuntimeTaskArtifactRef,
  getRuntimeTaskJobContract,
} from "@erliu/shared-contracts";
import {
  toGenreBriefArtifact,
  toGenreBriefObjectKey,
  toReaderReviewArtifact,
  toReaderReviewObjectKey,
  toSceneCardSetArtifact,
  toSceneCardSetObjectKey,
} from "../../common/truth-source/creative-artifact.contract.js";

async function main() {
  const proposalContract = getRuntimeTaskJobContract("proposal_generate");
  const chapterContract = getRuntimeTaskJobContract("chapter_generate");
  const genreBrief = toGenreBriefArtifact({
    session_id: "session-smoke-v1-1",
    story_id: null,
    target_reader_segment: "想看慢热拉扯与旧债重逢的追更读者",
    genre_lane: "都市情感悬疑",
    core_promise: "旧债与重逢会把关系试探越推越深。",
    core_trope_family: ["重逢", "慢热拉扯"],
    front_ten_chapter_promise: "前十章先把试探、站队与旧债一层层钉住。",
    relationship_promise: "每三章至少推进一次信任与风险站队。",
    risk_flags: ["避免过早确认关系"],
    created_at: "2026-04-03T05:24:00.000Z",
  });
  const sceneCardSet = toSceneCardSetArtifact({
    story_id: "story-smoke-v1-1",
    chapter_id: "chapter-smoke-v1-1",
    based_on_outline_bundle_id: "outline-smoke-v1-1",
    chapter_goal: "把雨夜重逢后的试探立住。",
    chapter_cliffhanger_goal: "章末留下她回来的真正理由。",
    scenes: [
      {
        scene_no: 1,
        scene_goal: "让两人在站台撞见。",
        conflict: "都想装作没事，但先一步失态。",
        turning_point: "她叫出了他不用的旧名字。",
        trope_hook: "重逢失序",
        must_keep_reveal_state: "不能提前揭露她回城的真正原因。",
        expected_after_state: "双方都知道这次重逢不是偶然。",
      },
    ],
    created_at: "2026-04-03T05:24:10.000Z",
  });
  const readerReview = toReaderReviewArtifact({
    story_id: "story-smoke-v1-1",
    chapter_id: "chapter-smoke-v1-1",
    source_artifact_id: "chapter-draft-smoke-v1-1",
    review_dimensions: {
      clarity: 4,
      promise_delivery: 3,
      relationship_tension: 5,
      chapter_progression: 4,
      cliffhanger_strength: 4,
    },
    summary: "关系拉扯够强，但章末 promise 兑现还差一层。",
    rewrite_targets: ["把她回来的站队风险再往前埋一层。"],
    acceptance_recommendation: "tweak",
    created_at: "2026-04-03T05:24:20.000Z",
  });
  const readerReviewRef = buildRuntimeTaskArtifactRef({
    artifact_type: "reader_review",
    story_id: readerReview.story_id,
    chapter_id: readerReview.chapter_id,
    object_key: toReaderReviewObjectKey(readerReview.story_id, readerReview.chapter_id),
    created_at: readerReview.created_at,
  });

  const output = {
    evidence_level: "runtime",
    proposal_stage_chain: proposalContract.stage_chain.map((stage) => ({
      artifact_type: stage.artifact_type,
      writeback_owner: stage.writeback_owner,
    })),
    chapter_stage_chain: chapterContract.stage_chain.map((stage) => ({
      artifact_type: stage.artifact_type,
      writeback_owner: stage.writeback_owner,
      compatibility_aliases: stage.compatibility_aliases,
    })),
    object_keys: {
      genre_brief: toGenreBriefObjectKey(genreBrief.session_id),
      scene_card_set: toSceneCardSetObjectKey(sceneCardSet.story_id, sceneCardSet.chapter_id),
      reader_review: toReaderReviewObjectKey(readerReview.story_id, readerReview.chapter_id),
    },
    artifact_preview: {
      genre_brief: genreBrief,
      scene_card_set: sceneCardSet,
      reader_review: readerReview,
      reader_review_ref: readerReviewRef,
    },
  };
  const outputPath = path.resolve(
    process.cwd(),
    "../.tmp/tc-cdx-108/creative-contract-v1-1-smoke.json",
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
