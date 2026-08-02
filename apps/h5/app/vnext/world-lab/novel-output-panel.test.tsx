import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildNovelDirectory, buildNovelDraft, NovelOutputPanel } from "./novel-output-panel";
import type { InteractiveStoryState } from "./interactive-branch";

const state: InteractiveStoryState = {
  storyId: "story-1",
  turns: [
    { id: "turn-0", parentId: null, branchId: "main", depth: 0, scene: "雨落在门外。", offeredChoices: [], selectedAction: null, selectedChoiceId: null, preferenceSignals: [], deltas: [], memoryUpdates: [], canonStatus: "sandbox", order: 0 },
    { id: "turn-1", parentId: "turn-0", branchId: "main", depth: 1, scene: "他推门而出。", offeredChoices: [], selectedAction: "推门", selectedChoiceId: "choice-1", preferenceSignals: [], deltas: [], memoryUpdates: [], canonStatus: "sandbox", order: 1 },
  ],
  branches: [{ id: "main", title: "当前故事线", fromTurnId: null, headTurnId: "turn-1", order: 0 }],
  checkpoints: [],
  activeBranchId: "main",
  nextTurnSequence: 2,
  nextBranchSequence: 1,
  nextCheckpointSequence: 1,
};

describe("novel output", () => {
  it("exports the current branch scenes as Markdown and TXT", () => {
    const story = { id: "story-1", title: "门后的雨", premise: "雨落在门外。" };
    const markdown = buildNovelDraft(story, state, "markdown");
    expect(markdown).toContain("## 第 1 段");
    expect(markdown).toContain("> 选择：推门");
    expect(markdown).toContain("他推门而出。");
    expect(buildNovelDraft(story, state, "txt")).toContain("第 1 段｜推门\n他推门而出。");
  });

  it("exports only the selected directory entries", () => {
    const story = { id: "story-1", title: "门后的雨", premise: "雨落在门外。" };
    const directory = buildNovelDirectory(story, state, ["turn-1"], "markdown");

    expect(directory).toContain("# 门后的雨 · 正文目录");
    expect(directory).toContain("## 第 1 段");
    expect(directory).toContain("摘要：他推门而出。");
    expect(directory).not.toContain("雨落在门外");
    expect(buildNovelDirectory(story, state, ["turn-1"], "txt")).toContain("正文目录（1 段）");
  });

  it("keeps an imported continuation handoff out of the novel draft and directory", () => {
    const story = {
      id: "story-imported",
      title: "接续之书",
      premise: "这是接力摘要，不是正文。",
      continuationContext: { chapterTitle: "第一章", brief: "接力摘要。", excerpt: "续写点原文不应进入正文。" },
    };

    expect(buildNovelDraft(story, state, "markdown")).not.toContain("这是接力摘要");
    expect(buildNovelDirectory(story, state, ["turn-0", "turn-1"], "txt")).not.toContain("续写点原文");
    expect(buildNovelDirectory(story, state, ["turn-0", "turn-1"], "txt")).toContain("他推门而出。");
  });

  it("lets the author choose a batch from the directory dialog", () => {
    render(
      <NovelOutputPanel
        onDownload={vi.fn()}
        onSelectTurn={vi.fn()}
        selectedTurnId="turn-1"
        state={state}
        story={{ id: "story-1", title: "门后的雨", premise: "雨落在门外。" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开正文目录" }));
    expect(screen.getByText("2 / 2 段已选择")).toBeTruthy();
    const firstEntry = screen.getByRole("checkbox", { name: "选择开篇" }) as HTMLInputElement;
    fireEvent.click(firstEntry);
    expect(firstEntry.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
    expect(screen.getByRole("button", { name: "导出所选 Markdown" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "全选目录" }));
    expect(screen.getByRole("button", { name: "导出所选 Markdown" })).toHaveProperty("disabled", false);
  });
});
