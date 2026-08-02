import { describe, expect, it } from "vitest";
import { appendInteractiveTurn, composeBranchSparseMemory, createInteractiveStory } from "./interactive-branch";
import { composeForecastMemoryAtTurn, convertForecastTrajectoryToBranch, validateForecastSandboxResult, type ForecastSandboxResult } from "./forecast-sandbox";
import { createOpeningWorld } from "./world-lab-data";

function result(storyId: string): ForecastSandboxResult {
  return {
    id: "forecast-1234567890abcdef",
    sourceStoryId: storyId,
    sourceBranchId: "main",
    sourceTurnId: "turn-0",
    event: "旧车站突然进站一辆没有编号的列车。",
    createdAt: "2026-07-21T02:00:00.000Z",
    actors: ["hero", "rival", "ally"].map((nodeId, actorIndex) => ({
      nodeId,
      name: ["林雁", "周伯", "林渡"][actorIndex]!,
      objective: "完成自己的当前目标",
      moves: [1, 2, 3].map((round) => ({ round: round as 1 | 2 | 3, action: `第${round}轮行动`, publicReason: "公开理由", expectedEffect: "预期效果" })),
      interviewAnswer: "因为这是我根据有限认知作出的选择。",
    })),
    rounds: [1, 2, 3].map((round) => ({
      round: round as 1 | 2 | 3,
      publicEvent: `第${round}轮公共变化`,
      actions: ["hero", "rival", "ally"].map((actorNodeId) => ({ actorNodeId, action: "行动", outcome: "结果" })),
      resolution: "世界完成裁定。",
      stateChanges: [{ targetNodeId: "place", label: "状态", before: "封闭", after: "开启" }],
    })),
    trajectories: [1, 2, 3].map((index) => ({ id: `trajectory-${index}`, title: `走向${index}`, summary: "可能剧情走向。", causalChain: ["起因", "行动", "后果"], participatingActorNodeIds: ["hero"], risk: index === 1 ? "low" as const : index === 2 ? "medium" as const : "high" as const, branchIntent: `沿走向${index}继续` })),
    trace: { actorTraceIds: ["trace-1", "trace-2", "trace-3"], adjudicatorTraceId: "trace-4", provider: "company-router", model: "gpt-5.5", workflowVersion: "vnext.forecast-sandbox.v1", outputHash: "a".repeat(64) },
    fallbackApplied: false,
  };
}

describe("forecast sandbox state", () => {
  it("truncates memory at a checkpoint so later turns cannot leak backwards", () => {
    const world = createOpeningWorld("immortal", "secret");
    const initial = createInteractiveStory(world, world.stories[0]!);
    const advanced = appendInteractiveTurn(initial, world, { choiceId: initial.turns[0]!.offeredChoices[0]!.id });
    const memory = composeForecastMemoryAtTurn(advanced, "main", "turn-0", "检查过去", ["protagonist"]);
    expect(memory.headTurnId).toBe("turn-0");
    expect(memory.recentScenes).toHaveLength(1);
    expect(JSON.stringify(memory)).not.toContain(advanced.turns[1]!.scene);
  });

  it("turns one trajectory into an intent-only branch without changing the source head", () => {
    const world = createOpeningWorld("immortal", "secret");
    const state = createInteractiveStory(world, world.stories[0]!);
    const sandbox = result(state.storyId);
    const converted = convertForecastTrajectoryToBranch(state, sandbox, "trajectory-2");
    expect(converted.branches.find((branch) => branch.id === "main")?.headTurnId).toBe("turn-0");
    const branch = converted.branches.find((candidate) => candidate.id === converted.activeBranchId)!;
    expect(branch).toMatchObject({ title: "推演 · 走向2", headTurnId: "turn-0", forecastSource: { sandboxId: sandbox.id, trajectoryId: "trajectory-2" }, forecastIntent: "沿走向2继续" });
    expect(converted.turns).toEqual(state.turns);
    expect(composeBranchSparseMemory(converted).openThreads[0]).toContain("推演候选方向");
  });

  it("validates complete three-actor results and rejects half-written simulations", () => {
    const valid = result("story-1");
    expect(validateForecastSandboxResult(valid)).toEqual(valid);
    expect(validateForecastSandboxResult({ ...valid, rounds: valid.rounds.slice(0, 2) })).toBeNull();
    expect(validateForecastSandboxResult({ ...valid, fallbackApplied: true })).toBeNull();
  });
});
