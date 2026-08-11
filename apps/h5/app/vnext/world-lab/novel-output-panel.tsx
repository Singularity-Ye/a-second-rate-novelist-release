"use client";

import React, { useEffect, useMemo, useState } from "react";
import { branchPath, activeBranch, type InteractiveStoryState } from "./interactive-branch";
import type { StoryRecord } from "./world-lab-data";
import { ManuscriptAnalysisText } from "./manuscript-analysis-text";
import styles from "./world-lab.module.css";

export interface NovelOutputPanelProps {
  story: StoryRecord;
  state: InteractiveStoryState;
  selectedTurnId: string;
  pending?: boolean;
  streamingScene?: string;
  onSelectTurn(turnId: string): void;
  onDownload(format: "markdown" | "txt"): void;
}

function manuscriptPath(story: StoryRecord, state: InteractiveStoryState) {
  const path = branchPath(state);
  // An imported manuscript's root turn is the handoff brief, not a new
  // paragraph written in this workspace. Keep it available to the model and
  // the continuation card, but never put it into the novel output or TOC.
  return story.continuationContext ? path.filter((turn) => turn.depth > 0) : path;
}

function turnHeading(turn: { depth: number; selectedAction: string | null }, index: number) {
  return turn.depth === 0 ? "开篇" : `第 ${turn.depth || index} 段`;
}

function sceneSummary(scene: string, maxLength = 160) {
  const compact = scene.replace(/\s+/gu, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
}

export function buildNovelDraft(story: StoryRecord, state: InteractiveStoryState, format: "markdown" | "txt") {
  const path = manuscriptPath(story, state);
  const branch = activeBranch(state);
  if (format === "txt") {
    return [
      story.title,
      `走线：${branch.title}`,
      "",
      ...path.flatMap((turn, index) => [
        `${turnHeading(turn, index)}${turn.selectedAction ? `｜${turn.selectedAction}` : ""}`,
        turn.scene,
        "",
      ]),
    ].join("\n");
  }
  return [
    `# ${story.title}`,
    "",
    `> 当前走线：${branch.title}`,
    "> 由二流小说家本机草稿导出。",
    "",
    ...path.flatMap((turn, index) => [
      `## ${turnHeading(turn, index)}`,
      turn.selectedAction ? `\n> 选择：${turn.selectedAction}` : "",
      "",
      turn.scene,
      "",
    ]),
  ].join("\n");
}

/** Build a portable table of contents from the turns the user selected. */
export function buildNovelDirectory(
  story: StoryRecord,
  state: InteractiveStoryState,
  selectedTurnIds: readonly string[],
  format: "markdown" | "txt",
) {
  const selected = new Set(selectedTurnIds);
  const turns = manuscriptPath(story, state).filter((turn) => selected.has(turn.id));
  const branch = activeBranch(state);
  const entries = turns.flatMap((turn, index) => [
    turnHeading(turn, index),
    ...(turn.selectedAction ? [`选择：${turn.selectedAction}`] : []),
    `摘要：${sceneSummary(turn.scene) || "（暂无正文摘要）"}`,
    "",
  ]);

  if (format === "txt") {
    return [
      story.title,
      `走线：${branch.title}`,
      `正文目录（${turns.length} 段）`,
      "",
      ...entries,
    ].join("\n");
  }

  return [
    `# ${story.title} · 正文目录`,
    "",
    `> 当前走线：${branch.title}`,
    `> 已选择：${turns.length} 段`,
    "",
    ...turns.flatMap((turn, index) => [
      `## ${turnHeading(turn, index)}`,
      turn.selectedAction ? `> 选择：${turn.selectedAction}` : "",
      `> 摘要：${sceneSummary(turn.scene) || "（暂无正文摘要）"}`,
      "",
    ]),
  ].join("\n");
}

function downloadDirectory(story: StoryRecord, state: InteractiveStoryState, selectedTurnIds: readonly string[], format: "markdown" | "txt") {
  const payload = buildNovelDirectory(story, state, selectedTurnIds, format);
  const blob = new Blob([payload], { type: format === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${story.id}-${state.activeBranchId}-directory.${format === "markdown" ? "md" : "txt"}`;
  link.click();
  URL.revokeObjectURL(href);
}

/** A reader-first view of the current branch. The graph and choices remain
 * available, but the generated scenes are also treated as a manuscript. */
export function NovelOutputPanel({ story, state, selectedTurnId, pending = false, streamingScene = "", onSelectTurn, onDownload }: NovelOutputPanelProps) {
  const directoryPath = useMemo(() => manuscriptPath(story, state), [state, story]);
  const branch = activeBranch(state);
  const generatedCount = story.continuationContext
    ? directoryPath.length
    : Math.max(0, directoryPath.length - 1);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [selectedDirectoryTurnIds, setSelectedDirectoryTurnIds] = useState<string[]>([]);
  const [readingTurnId, setReadingTurnId] = useState(selectedTurnId);
  const readingTurn = directoryPath.find((turn) => turn.id === readingTurnId) ?? directoryPath.at(-1) ?? null;

  useEffect(() => {
    setSelectedDirectoryTurnIds((current) => current.filter((turnId) => directoryPath.some((turn) => turn.id === turnId)));
  }, [directoryPath]);

  useEffect(() => setReadingTurnId(selectedTurnId), [selectedTurnId]);

  const openDirectory = () => {
    setSelectedDirectoryTurnIds(directoryPath.map((turn) => turn.id));
    setDirectoryOpen(true);
  };

  const selectAllDirectory = () => setSelectedDirectoryTurnIds(directoryPath.map((turn) => turn.id));
  const clearDirectorySelection = () => setSelectedDirectoryTurnIds([]);
  const toggleDirectoryTurn = (turnId: string) => {
    setSelectedDirectoryTurnIds((current) => current.includes(turnId)
      ? current.filter((id) => id !== turnId)
      : [...current, turnId]);
  };

  const locateTurn = (turnId: string) => {
    setReadingTurnId(turnId);
    onSelectTurn(turnId);
  };

  return (
    <section aria-labelledby="novel-output-heading" className={styles.novelOutput}>
      <header className={styles.novelOutputHeader}>
        <div>
          <span>小说正文 · 当前走线草稿</span>
          <h2 id="novel-output-heading">正文稿</h2>
          <small>{story.title} · {branch.title} · 已写 {generatedCount} 段 · 本机草稿自动保存</small>
        </div>
        <div className={styles.novelOutputActions}>
          <button onClick={openDirectory} type="button">打开正文目录</button>
          <button onClick={() => onDownload("markdown")} type="button">下载 Markdown</button>
          <button onClick={() => onDownload("txt")} type="button">下载 TXT</button>
        </div>
      </header>

      {directoryOpen ? (
        <div className={styles.novelDirectoryBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setDirectoryOpen(false); }}>
          <section aria-labelledby="novel-directory-heading" aria-modal="true" className={styles.novelDirectoryDialog} role="dialog">
            <header className={styles.novelDirectoryHeader}>
              <div>
                <span>正文目录 · {branch.title}</span>
                <h2 id="novel-directory-heading">{story.title}</h2>
              </div>
              <button aria-label="关闭正文目录" onClick={() => setDirectoryOpen(false)} type="button">×</button>
            </header>
            <div className={styles.novelDirectoryBody}>
              <nav aria-label="正文目录列表" className={styles.novelDirectoryList}>
                <div className={styles.novelDirectoryTools}>
                  <div>
                    <strong>选择要导出的目录</strong>
                    <span>{selectedDirectoryTurnIds.length} / {directoryPath.length} 段已选择</span>
                  </div>
                  <div className={styles.novelDirectoryToolButtons}>
                    <button onClick={selectAllDirectory} type="button">全选目录</button>
                    <button onClick={clearDirectorySelection} type="button">清空选择</button>
                  </div>
                  <div className={styles.novelDirectoryToolButtons}>
                    <button disabled={selectedDirectoryTurnIds.length === 0} onClick={() => downloadDirectory(story, state, selectedDirectoryTurnIds, "markdown")} type="button">导出所选 Markdown</button>
                    <button disabled={selectedDirectoryTurnIds.length === 0} onClick={() => downloadDirectory(story, state, selectedDirectoryTurnIds, "txt")} type="button">导出所选 TXT</button>
                  </div>
                </div>
                {directoryPath.length === 0 ? <div className={styles.novelDirectoryEmpty}>当前还没有可导出的正文段落。</div> : null}
                {directoryPath.map((turn, index) => (
                  <div className={styles.novelDirectoryListItem} data-active={turn.id === readingTurn?.id} data-selected={selectedDirectoryTurnIds.includes(turn.id)} key={turn.id}>
                    <label>
                      <input aria-label={`选择${turnHeading(turn, index)}`} checked={selectedDirectoryTurnIds.includes(turn.id)} onChange={() => toggleDirectoryTurn(turn.id)} type="checkbox" />
                      <span><small>{turnHeading(turn, index)}</small><strong>{turn.selectedAction ?? "命运开始的地方"}</strong></span>
                    </label>
                    <button aria-label={`阅读${turnHeading(turn, index)}`} onClick={() => locateTurn(turn.id)} type="button">阅读</button>
                  </div>
                ))}
              </nav>
              <article className={styles.novelDirectoryReader}>
                {pending ? (
                  <section aria-live="polite" className={styles.streamingOutput} role="status">
                    <strong>正在写下下一段</strong>
                    {streamingScene ? <ManuscriptAnalysisText text={streamingScene} /> : <p>模型正在组织场景、人物动作和下一步选择……首段返回后会在这里逐字出现。</p>}
                  </section>
                ) : null}
                {readingTurn ? (
                  <>
                    <header>
                      <span>{turnHeading(readingTurn, 0)}</span>
                      {readingTurn.selectedAction ? <strong>{readingTurn.selectedAction}</strong> : null}
                    </header>
                    <ManuscriptAnalysisText text={readingTurn.scene} />
                  </>
                ) : <div className={styles.novelDirectoryEmpty}>选择正文段落后，这里会显示阅读内容。</div>}
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
