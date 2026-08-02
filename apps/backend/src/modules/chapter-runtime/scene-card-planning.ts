import type { ContextSceneFocusView } from "@erliu/shared-contracts";
import {
  toSceneCardSetArtifact,
  type SceneCardSetArtifact,
} from "../../common/truth-source/creative-artifact.contract.js";

function defaultSceneBlueprint() {
  return [
    {
      scene_no: 1,
      scene_goal: "让两人在当前场景里先撞见，重新点燃旧张力。",
      conflict: "都想装作平静，却先一步暴露出还没放下。",
      turning_point: "其中一人先叫出了另一个人的旧称呼。",
      trope_hook: "重逢失序",
      must_keep_reveal_state: "先别把真正站队和旧债底牌摊开。",
      expected_after_state: "双方都知道这次重逢不会轻易结束。",
    },
    {
      scene_no: 2,
      scene_goal: "把章末钩子压到下一次选择上。",
      conflict: "说出口会暴露代价，不说又会继续误解。",
      turning_point: "有人抛出一个只说半句的承诺。",
      trope_hook: "半句承诺",
      must_keep_reveal_state: "保留她为什么回来的核心秘密。",
      expected_after_state: "读者知道下一章必须看他们如何站队。",
    },
  ] as const;
}

export function resolveChapterGoalFromPromise(relationshipPromise: string) {
  if (relationshipPromise.includes("主角位置变化") || relationshipPromise.includes("压迫升级")) {
    return "把主角位置变化与压迫升级先兑现成一个必须追更的阶段战果。";
  }

  if (relationshipPromise.includes("修复尝试") || relationshipPromise.includes("情绪代价")) {
    return "把修复尝试与新的情绪代价先压进同一场对峙。";
  }

  return "把重逢后的试探、关系拉扯与站队风险先推到不可回头的一步。";
}

export function buildPlannedSceneCardSet(input: {
  story_id: string;
  chapter_id: string;
  relationship_promise: string;
  front_ten_chapter_promise: string;
  based_on_outline_bundle_id?: string;
}): SceneCardSetArtifact {
  return toSceneCardSetArtifact({
    story_id: input.story_id,
    chapter_id: input.chapter_id,
    based_on_outline_bundle_id: input.based_on_outline_bundle_id ?? `outline_bundle:${input.story_id}`,
    chapter_goal: resolveChapterGoalFromPromise(input.relationship_promise),
    chapter_cliffhanger_goal: input.front_ten_chapter_promise,
    scenes: [...defaultSceneBlueprint()],
  });
}

export function toContextSceneFocusView(
  sceneCardSet: {
    chapter_goal: string;
    chapter_cliffhanger_goal: string;
    scenes: Array<{
      scene_no: number;
      scene_goal: string;
      conflict: string;
      turning_point: string;
      must_keep_reveal_state: string;
    }>;
  },
  source_artifact_type: "scene_card_set" | "outline_bundle",
): ContextSceneFocusView {
  const selectedScene = sceneCardSet.scenes[0] ?? {
    scene_no: 1,
    scene_goal: "让两人在当前场景里先撞见，重新点燃旧张力。",
    conflict: "都想装作平静，却先一步暴露出还没放下。",
    turning_point: "其中一人先叫出了另一个人的旧称呼。",
    must_keep_reveal_state: "先别把真正站队和旧债底牌摊开。",
  };

  return {
    source_artifact_type,
    selected_scene_no: selectedScene.scene_no,
    chapter_goal: sceneCardSet.chapter_goal,
    chapter_cliffhanger_goal: sceneCardSet.chapter_cliffhanger_goal,
    scene_goal: selectedScene.scene_goal,
    scene_conflict: selectedScene.conflict,
    scene_turning_point: selectedScene.turning_point,
    reveal_guard: selectedScene.must_keep_reveal_state,
  };
}
