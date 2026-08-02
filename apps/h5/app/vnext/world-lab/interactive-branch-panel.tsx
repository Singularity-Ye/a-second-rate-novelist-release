"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  activeBranch,
  branchPath,
  composeBranchSparseMemory,
  foldNarrativeLedger,
  preferenceSummary,
  turnById,
  type ActionSelection,
  type InteractiveStoryState,
} from "./interactive-branch";
import styles from "./world-lab.module.css";
import { splitManuscriptAnalysisParagraphs } from "./manuscript-analysis-text";

const MEMORY_KIND_LABEL = {
  character_state: "人物",
  relationship: "关系",
  timeline: "时间线",
  item: "物件",
  foreshadowing: "伏笔",
  promise: "承诺",
} as const;

export interface InteractiveBranchPanelProps {
  state: InteractiveStoryState;
  selectedTurnId: string;
  onAdvance: (selection: ActionSelection) => void;
  onCreateCheckpoint: (turnId: string, title: string) => void;
  onFork: (turnId: string) => void;
  onForkCheckpoint: (checkpointId: string) => void;
  onRenameBranch: (branchId: string, title: string) => void;
  onSelectTurn: (turnId: string) => void;
  onSwitchBranch: (branchId: string) => void;
  pending?: boolean;
  streamingScene?: string;
  runtimeError?: string | null;
  runtimeModel?: string | null;
  showScene?: boolean;
  view?: "write" | "branches";
}

export function InteractiveBranchPanel({
  state,
  selectedTurnId,
  onAdvance,
  onCreateCheckpoint,
  onFork,
  onForkCheckpoint,
  onRenameBranch,
  onSelectTurn,
  onSwitchBranch,
  pending = false,
  streamingScene = "",
  runtimeError = null,
  runtimeModel = null,
  showScene = true,
  view = "branches",
}: InteractiveBranchPanelProps) {
  const [customAction, setCustomAction] = useState("");
  const [checkpointName, setCheckpointName] = useState("");
  const [branchTitle, setBranchTitle] = useState("");
  const latestTimelineButtonRef = React.useRef<HTMLButtonElement>(null);
  const path = useMemo(() => branchPath(state), [state]);
  const branch = activeBranch(state);
  const head = turnById(state, branch.headTurnId) ?? path.at(-1)!;
  const selected = turnById(state, selectedTurnId) ?? head;
  const signals = preferenceSummary(state);
  const memory = useMemo(() => composeBranchSparseMemory(state), [state]);
  const ledger = useMemo(() => foldNarrativeLedger(state), [state]);
  const unresolvedHooks = ledger.filter((entry) => entry.status === "active" && (entry.kind === "foreshadowing" || entry.kind === "promise"));
  const isHead = selected.id === head.id;
  const pathIds = new Set(path.map((turn) => turn.id));
  const selectedCheckpoints = state.checkpoints.filter((checkpoint) => checkpoint.turnId === selected.id);

  useEffect(() => setBranchTitle(branch.title), [branch.id, branch.title]);

  useEffect(() => {
    if (!isHead) return;
    const latestButton = latestTimelineButtonRef.current;
    if (typeof latestButton?.scrollIntoView !== "function") return;
    latestButton.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [head.id, isHead]);

  const advanceCustom = () => {
    const action = customAction.trim();
    if (!action) return;
    onAdvance({ customAction: action });
    setCustomAction("");
  };

  const saveCheckpoint = () => {
    const title = checkpointName.trim();
    if (!title) return;
    onCreateCheckpoint(selected.id, title);
    setCheckpointName("");
  };

  const saveBranchTitle = () => {
    const title = branchTitle.trim();
    if (!title || title === branch.title) return;
    onRenameBranch(branch.id, title);
  };

  return (
    <section className={styles.interactiveStory} aria-labelledby="interactive-story-heading">
      <div className={styles.interactiveHeader}>
        <div>
          <span>互动剧情实验 · {runtimeModel ? "provider-backed turn" : "首轮 synthetic fixture"}</span>
          <h2 id="interactive-story-heading">这次不是问卷，是你走出来的故事</h2>
        </div>
        <div className={styles.runtimeBadge} data-state={runtimeModel ? "ready" : pending ? "pending" : "unavailable"}>
          <b>{pending ? "公司模型正在续写" : runtimeModel ? `公司模型 · ${runtimeModel}` : "首轮选项是体验样例"}</b>
          <small>{pending ? "正在生成新场景与三个新选择" : runtimeModel ? "本回合选项来自真实 strict-schema 响应" : "做出选择后才调用模型；失败不会用模板顶替"}</small>
        </div>
      </div>

      {view === "branches" ? (
        <div className={styles.branchTabs} aria-label="剧情分支">
          {state.branches.map((item) => (
            <button data-active={item.id === state.activeBranchId} key={item.id} onClick={() => onSwitchBranch(item.id)} type="button">
              <span>{item.id === "main" ? "主线" : "如果当时"}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </div>
      ) : null}

      {view === "branches" ? (
        <>
          <section className={styles.branchWorkspace} aria-label="存档与走线">
            <div className={styles.branchNaming}>
              <label htmlFor="active-branch-title">当前走线名称</label>
              <div>
                <input id="active-branch-title" maxLength={60} onChange={(event) => setBranchTitle(event.target.value)} value={branchTitle} />
                <button disabled={!branchTitle.trim() || branchTitle.trim() === branch.title} onClick={saveBranchTitle} type="button">重命名走线</button>
              </div>
            </div>
            <div className={styles.checkpointCreator}>
              <label htmlFor="checkpoint-name">把“{selected.depth === 0 ? "开篇" : `选择 ${selected.depth}`}”存成节点</label>
              <div>
                <input id="checkpoint-name" maxLength={40} onChange={(event) => setCheckpointName(event.target.value)} placeholder="例如：雨夜第一次听见断剑" value={checkpointName} />
                <button disabled={!checkpointName.trim()} onClick={saveCheckpoint} type="button">保存此节点</button>
              </div>
              {selectedCheckpoints.length ? <small>已保存：{selectedCheckpoints.map((checkpoint) => checkpoint.title).join("、")}</small> : null}
            </div>
          </section>

          {state.checkpoints.length ? (
            <section className={styles.checkpointShelf} aria-label="命名存档">
              <header><span>命名存档</span><small>{state.checkpoints.length} 个不可变锚点</small></header>
              <div>
                {state.checkpoints.map((checkpoint) => (
                  <article key={checkpoint.id}>
                    <button onClick={() => onSelectTurn(checkpoint.turnId)} type="button">
                      <small>选择 {turnById(state, checkpoint.turnId)?.depth ?? 0}</small>
                      <strong>{checkpoint.title}</strong>
                    </button>
                    <button onClick={() => onForkCheckpoint(checkpoint.id)} type="button">从此开新走线</button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className={styles.turnTimeline} aria-label="分支轨迹">
            {path.map((turn, index) => (
              <React.Fragment key={turn.id}>
                {index > 0 ? <span aria-hidden="true">→</span> : null}
                <button data-active={turn.id === selected.id} onClick={() => onSelectTurn(turn.id)} ref={turn.id === head.id ? latestTimelineButtonRef : undefined} type="button">
                  <small>{turn.depth === 0 ? "开篇" : `选择 ${turn.depth}`}</small>
                  <strong>{turn.selectedAction ?? "命运开始的地方"}</strong>
                </button>
              </React.Fragment>
            ))}
          </div>
        </>
      ) : null}

      <div className={styles.interactiveBody}>
        <article className={styles.turnScene}>
          <header>
            <span>{selected.id === head.id ? "当前回合" : "历史分叉点"}</span>
            <b>{branch.title}</b>
          </header>
          {showScene ? <div className={styles.turnSceneText}>
            {splitManuscriptAnalysisParagraphs(selected.scene).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 18)}`}>{paragraph}</p>)}
          </div> : null}
          {showScene && pending && streamingScene ? (
            <div aria-live="polite" className={styles.streamingScene}>
              <span>正在写下这一段</span>
              <div className={styles.streamingSceneText}>
                {splitManuscriptAnalysisParagraphs(streamingScene).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 18)}`}>{paragraph}</p>)}
                <i aria-hidden="true" />
              </div>
            </div>
          ) : null}
          {!isHead ? (
            <button className={styles.forkButton} onClick={() => onFork(selected.id)} type="button">从这里另开一条“如果当时……”</button>
          ) : (
            <div className={styles.actionChoices}>
              {head.offeredChoices.map((choice) => (
                <button disabled={pending} key={choice.id} onClick={() => onAdvance({ choiceId: choice.id })} type="button">
                  <strong>{choice.label}</strong>
                  <span>{choice.hint}</span>
                  <small>{choice.preferenceSignals.join(" · ")}</small>
                </button>
              ))}
              <div className={styles.customAction}>
                <label htmlFor="custom-story-action">或者，自己写一句</label>
                <textarea disabled={pending} id="custom-story-action" onChange={(event) => setCustomAction(event.target.value)} placeholder="例如：先救门外受伤的人，再问他为什么追到这里。" value={customAction} />
                <button disabled={pending || !customAction.trim()} onClick={advanceCustom} type="button">{pending ? "正在续写…" : "让故事沿这句走"}</button>
              </div>
              {runtimeError ? <p className={styles.runtimeError} role="alert">{runtimeError}</p> : null}
            </div>
          )}
        </article>

        {view === "branches" ? <aside className={styles.branchEvidence} aria-label="本分支证据">
          <details className={styles.branchEvidenceSection}>
            <summary>从选择中读到的偏好 · {signals.length} 项</summary>
            <div className={styles.preferenceSignals}>
              {signals.length ? signals.map((signal) => <b key={signal.label}>{signal.label}{signal.count > 1 ? ` ×${signal.count}` : ""}</b>) : <small>做出第一个选择后才会出现，不提前给你贴标签。</small>}
            </div>
          </details>
          <details className={styles.branchEvidenceSection}>
            <summary>本路线稀疏记忆 · {memory.recentScenes.length + memory.facts.length + memory.openThreads.length} 项</summary>
            <div className={styles.sparseMemorySummary}>
              <b>{memory.recentScenes.length} 段近期场景</b>
              <b>{memory.facts.length} 条折叠事实</b>
              <b>{memory.openThreads.length} 个未决方向</b>
              <b>{memory.checkpointTrail.length} 个存档锚点</b>
            </div>
            <small>{memory.earlierSummary || "故事还短，暂时无需压缩更早的场景。"}</small>
            <div className={styles.memoryLedgerCounts} aria-label="叙事记忆账本">
              {Object.entries(memory.ledgerStats).map(([kind, count]) => (
                <span key={kind}><b>{MEMORY_KIND_LABEL[kind as keyof typeof MEMORY_KIND_LABEL]}</b>{count}</span>
              ))}
            </div>
            {unresolvedHooks.length ? (
              <div className={styles.unresolvedHooks}>
                <strong>仍需兑现</strong>
                {unresolvedHooks.slice(0, 6).map((entry) => <span key={`${entry.kind}:${entry.key}`}>{entry.key}：{entry.value}</span>)}
              </div>
            ) : <small>AI 回合产生伏笔或承诺后，会在这里持续追踪直到解决。</small>}
            {memory.retrievedLedger.length ? <small>本轮相关检索：{memory.retrievedLedger.map((entry) => entry.key).join("、")}</small> : null}
          </details>
          <details className={styles.branchEvidenceSection}>
            <summary>本分支候选变化 · {path.flatMap((turn) => turn.deltas).length} 项</summary>
            <div className={styles.branchDeltas}>
              {path.flatMap((turn) => turn.deltas).length ? path.flatMap((turn) => turn.deltas).map((delta) => (
                <article key={delta.id}>
                  <strong>{delta.label}</strong>
                  <p><del>{delta.before}</del><span>→</span>{delta.after}</p>
                </article>
              )) : <small>尚未产生变化。</small>}
            </div>
          </details>
          <p className={styles.sandboxNotice}>这些变化只投影到当前分支图谱，仍是沙盒候选，尚未写入正史。</p>
        </aside> : null}
      </div>
      {!pathIds.has(selected.id) ? <span hidden>所选回合不属于当前活动路径</span> : null}
    </section>
  );
}
