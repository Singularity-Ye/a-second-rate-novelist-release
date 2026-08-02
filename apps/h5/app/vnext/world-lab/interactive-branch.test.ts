import { describe, expect, it } from "vitest";
import { createOpeningWorld } from "./world-lab-data";
import {
  appendInteractiveTurn,
  appendGeneratedInteractiveTurn,
  branchPath,
  composeBranchSparseMemory,
  createStoryCheckpoint,
  createInteractiveStory,
  forkFromCheckpoint,
  forkInteractiveBranch,
  foldNarrativeLedger,
  preferenceSummary,
  renameInteractiveBranch,
  retrieveNarrativeLedger,
  switchInteractiveBranch,
} from "./interactive-branch";

function generated(memoryUpdates: Array<{ kind: "foreshadowing" | "promise"; key: string; value: string; status: "active" | "resolved"; relevantNodeIds: string[] }>) {
  return {
    scene: "断剑的回声改变了雨夜里的下一步。",
    preferenceSignals: ["偏爱谜团"],
    deltas: [],
    discoveries: [],
    memoryUpdates,
    choices: [
      { label: "继续追查", hint: "沿线索推进。", preferenceSignals: ["主动推进"], predictedDeltas: [] },
      { label: "暂时隐藏", hint: "保留信息差。", preferenceSignals: ["谨慎布局"], predictedDeltas: [] },
      { label: "当面对质", hint: "制造冲突。", preferenceSignals: ["正面对抗"], predictedDeltas: [] },
    ],
  };
}

describe("interactive branch state", () => {
  it("keeps the offered choice snapshot, action, signals and sandbox deltas", () => {
    const world = createOpeningWorld("immortal", "secret");
    const initial = createInteractiveStory(world, world.stories[0]!);
    const next = appendInteractiveTurn(initial, world, { choiceId: "hide-and-watch" });
    const path = branchPath(next);

    expect(path[0]?.offeredChoices.map((choice) => choice.id)).toEqual(["ask-object", "hide-and-watch", "open-the-door"]);
    expect(path[1]).toMatchObject({ selectedChoiceId: "hide-and-watch", canonStatus: "sandbox" });
    expect(new Set(preferenceSummary(next).map((signal) => `${signal.label}:${signal.count}`))).toEqual(new Set(["喜欢藏底牌:1", "谨慎布局:1"]));
  });

  it("supports a custom action without pretending it came from a preset", () => {
    const world = createOpeningWorld("immortal", "secret");
    const state = appendInteractiveTurn(createInteractiveStory(world, world.stories[0]!), world, { customAction: "先救门外受伤的人，再查他为何来这里" });
    expect(branchPath(state)[1]).toMatchObject({ selectedChoiceId: null, selectedAction: "先救门外受伤的人，再查他为何来这里" });
    expect(new Set(preferenceSummary(state).map((signal) => signal.label))).toEqual(new Set(["主动定义走向", "保护欲", "偏爱谜团"]));
  });

  it("forks from an old turn and preserves the original branch head", () => {
    const world = createOpeningWorld("immortal", "secret");
    const initial = createInteractiveStory(world, world.stories[0]!);
    const mainAdvanced = appendInteractiveTurn(initial, world, { choiceId: "ask-object" });
    const forked = forkInteractiveBranch(mainAdvanced, "turn-0");
    const alternate = appendInteractiveTurn(forked, world, { choiceId: "open-the-door" });

    expect(alternate.branches.find((branch) => branch.id === "main")?.headTurnId).toBe("turn-1");
    expect(branchPath(alternate, "branch-1").map((turn) => turn.id)).toEqual(["turn-0", "turn-2"]);
    expect(branchPath(switchInteractiveBranch(alternate, "main")).map((turn) => turn.id)).toEqual(["turn-0", "turn-1"]);
  });

  it("creates immutable named checkpoints and human-readable branch titles", () => {
    const world = createOpeningWorld("immortal", "secret");
    const advanced = appendInteractiveTurn(createInteractiveStory(world, world.stories[0]!), world, { choiceId: "ask-object" });
    const saved = createStoryCheckpoint(advanced, "turn-0", "雨夜起点", "2026-07-20T12:00:00.000Z");
    const duplicate = createStoryCheckpoint(saved, "turn-1", "雨夜起点", "2026-07-20T12:01:00.000Z");
    const forked = forkFromCheckpoint(duplicate, "checkpoint-1");
    const renamed = renameInteractiveBranch(forked, forked.activeBranchId, "断剑沉默线");

    expect(duplicate.checkpoints.map((checkpoint) => checkpoint.title)).toEqual(["雨夜起点", "雨夜起点 (2)"]);
    expect(renamed.branches.find((branch) => branch.id === "branch-1")).toMatchObject({
      title: "断剑沉默线",
      checkpointId: "checkpoint-1",
      headTurnId: "turn-0",
    });
  });

  it("composes sparse memory only from the active branch path", () => {
    const world = createOpeningWorld("immortal", "secret");
    const main = appendInteractiveTurn(createInteractiveStory(world, world.stories[0]!), world, { choiceId: "ask-object" });
    const saved = createStoryCheckpoint(main, "turn-0", "共同起点", "2026-07-20T12:00:00.000Z");
    const forked = forkFromCheckpoint(saved, "checkpoint-1");
    const alternate = appendInteractiveTurn(forked, world, { choiceId: "open-the-door" });
    const alternateMemory = composeBranchSparseMemory(alternate);
    const mainMemory = composeBranchSparseMemory(switchInteractiveBranch(alternate, "main"));

    expect(alternateMemory.recentScenes.map((scene) => scene.action)).toContain("推门出去，让追兵先看见自己");
    expect(alternateMemory.recentScenes.map((scene) => scene.action)).not.toContain("握住无名断剑，先问它为什么认识自己");
    expect(mainMemory.recentScenes.map((scene) => scene.action)).toContain("握住无名断剑，先问它为什么认识自己");
    expect(mainMemory.recentScenes.map((scene) => scene.action)).not.toContain("推门出去，让追兵先看见自己");
    expect(alternateMemory.checkpointTrail.map((checkpoint) => checkpoint.title)).toEqual(["共同起点"]);
  });

  it("folds stable ledger keys and keeps resolved hooks auditable", () => {
    const world = createOpeningWorld("immortal", "secret");
    const initial = createInteractiveStory(world, world.stories[0]!);
    const planted = appendGeneratedInteractiveTurn(initial, { choiceId: "ask-object" }, generated([
      { kind: "foreshadowing", key: "断剑旧名", value: "断剑知道主角旧名，来源未明。", status: "active", relevantNodeIds: ["protagonist", "object"] },
    ]));
    const resolved = appendGeneratedInteractiveTurn(planted, { customAction: "追查旧名并找到答案" }, generated([
      { kind: "foreshadowing", key: "断剑旧名", value: "旧名来自主角被删除的宗门名册。", status: "resolved", relevantNodeIds: ["protagonist", "object"] },
    ]));
    const ledger = foldNarrativeLedger(resolved);

    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ key: "断剑旧名", status: "resolved", sourceTurnId: "turn-2" });
    expect(retrieveNarrativeLedger(ledger, "宗门名册与断剑旧名")[0]?.key).toBe("断剑旧名");
  });

  it("does not retrieve a sibling branch ledger update", () => {
    const world = createOpeningWorld("immortal", "secret");
    const initial = createInteractiveStory(world, world.stories[0]!);
    const main = appendGeneratedInteractiveTurn(initial, { choiceId: "ask-object" }, generated([
      { kind: "foreshadowing", key: "断剑旧名", value: "只在握剑线出现。", status: "active", relevantNodeIds: ["object"] },
    ]));
    const alternateRoot = forkInteractiveBranch(main, "turn-0");
    const alternate = appendGeneratedInteractiveTurn(alternateRoot, { choiceId: "open-the-door" }, generated([
      { kind: "promise", key: "追兵交易", value: "只在推门线成立。", status: "active", relevantNodeIds: ["faction"] },
    ]));

    expect(foldNarrativeLedger(alternate).map((entry) => entry.key)).toEqual(["追兵交易"]);
    expect(composeBranchSparseMemory(alternate, alternate.activeBranchId, "断剑旧名", ["object"]).retrievedLedger.map((entry) => entry.key)).not.toContain("断剑旧名");
    expect(foldNarrativeLedger(switchInteractiveBranch(alternate, "main")).map((entry) => entry.key)).toEqual(["断剑旧名"]);
  });
});
