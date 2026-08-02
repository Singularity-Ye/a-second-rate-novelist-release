import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ForecastSandboxDialog } from "./forecast-sandbox-dialog";
import type { ForecastSandboxResult } from "./forecast-sandbox";
import { createInteractiveStory } from "./interactive-branch";
import { createOpeningWorld } from "./world-lab-data";

function forecast(storyId: string): ForecastSandboxResult {
  return {
    id: "forecast-1",
    sourceStoryId: storyId,
    sourceBranchId: "main",
    sourceTurnId: "turn-0",
    event: "失踪列车突然进站。",
    createdAt: "2026-07-21T02:00:00.000Z",
    actors: [
      { nodeId: "protagonist", name: "陆停舟", objective: "查明真相", moves: [1, 2, 3].map((round) => ({ round: round as 1 | 2 | 3, action: "观察", publicReason: "谨慎", expectedEffect: "获得线索" })), interviewAnswer: "我不能让别人替我决定。" },
      { nodeId: "writer", name: "二流小说家", objective: "记录真相", moves: [1, 2, 3].map((round) => ({ round: round as 1 | 2 | 3, action: "记录", publicReason: "求证", expectedEffect: "保存证据" })), interviewAnswer: "未经证实的东西不能写进正史。" },
      { nodeId: "third-character", name: "黑伞女子", objective: "带走断剑", moves: [1, 2, 3].map((round) => ({ round: round as 1 | 2 | 3, action: "试探", publicReason: "执行命令", expectedEffect: "接近断剑" })), interviewAnswer: "我只知道任务，不知道命令来自谁。" },
    ],
    rounds: [1, 2, 3].map((round) => ({ round: round as 1 | 2 | 3, publicEvent: `第${round}轮`, actions: ["protagonist", "writer", "third-character"].map((actorNodeId) => ({ actorNodeId, action: "行动", outcome: "受到制约" })), resolution: "世界完成裁定。", stateChanges: [] })),
    trajectories: [1, 2, 3].map((index) => ({ id: `trajectory-${index}`, title: `走向${index}`, summary: "一种可能。", causalChain: ["起因", "行动", "后果"], participatingActorNodeIds: ["protagonist"], risk: "medium" as const, branchIntent: `沿走向${index}继续` })),
    trace: { actorTraceIds: ["a", "b", "c"], adjudicatorTraceId: "d", provider: "company-router", model: "gpt-5.5", workflowVersion: "vnext.forecast-sandbox.v1", outputHash: "a".repeat(64) },
    fallbackApplied: false,
  };
}

describe("ForecastSandboxDialog", () => {
  it("selects three character contexts, shows adjudication and converts one trajectory", () => {
    const world = createOpeningWorld("immortal", "secret");
    const protagonist = world.nodes.find((node) => node.id === "protagonist")!;
    world.nodes.push({ ...protagonist, id: "third-character", label: "黑伞女子", x: 700, y: 200 });
    const state = createInteractiveStory(world, world.stories[0]!);
    const onRun = vi.fn();
    const onConvert = vi.fn();
    const view = render(<ForecastSandboxDialog error={null} onClose={vi.fn()} onConvert={onConvert} onRun={onRun} open pending={false} sandboxes={[]} state={state} world={world} />);
    fireEvent.click(screen.getByRole("button", { name: "开始三角色剧情推演" }));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ sourceTurnId: "turn-0", actorNodeIds: ["protagonist", "writer", "third-character"] }));

    view.rerender(<ForecastSandboxDialog error={null} onClose={vi.fn()} onConvert={onConvert} onRun={onRun} open pending={false} sandboxes={[forecast(state.storyId)]} state={state} world={world} />);
    expect(screen.getByText("三条可能走向").textContent).toBe("三条可能走向");
    fireEvent.click(screen.getByText(/陆停舟 · 查明真相/));
    expect(screen.getByText("我不能让别人替我决定。").textContent).toContain("不能让别人");
    fireEvent.click(screen.getAllByRole("button", { name: "把这条可能性变成走线" })[1]!);
    expect(onConvert).toHaveBeenCalledWith("forecast-1", "trajectory-2");
  });
});
