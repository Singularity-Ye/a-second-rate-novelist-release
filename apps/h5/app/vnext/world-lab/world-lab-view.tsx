"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_GRAPH_TUNING,
  chooseGraphQuality,
  ForceGraphSigma,
  ForceGraphSvg,
  GraphLayoutCache,
  GraphQualityController,
  graphQualityProfile,
  hydrateGraphNodesFromLayout,
  type GraphLayoutCacheIdentity,
  type GraphLayoutSnapshot,
  type GraphNodeState,
  type GraphQualityLevel,
  type GraphTransform,
  type GraphTuning,
} from "@erliu/force-graph";
import {
  OPENING_CHOICES,
  TONE_CHOICES,
  buildQuartzNotes,
  type CharacterProfile,
  type CharacterTruthField,
  createOpeningWorld,
  type DirectorCraftCard,
  type DirectorJokeCard,
  type DirectorJokeIntent,
  type DirectorKnowledgeCard,
  type DirectorLibraryCardStatus,
  type FactStatus,
  type OpeningId,
  type QuartzNote,
  type StoryDirectorProposal,
  type StoryRecord,
  type ToneId,
  type WorldNode,
  type WorldRecord,
} from "./world-lab-data";
import { CharacterCard, type CharacterRelation } from "./character-card";
import { InteractiveBranchPanel } from "./interactive-branch-panel";
import { CraftCards, JokeCards, KnowledgeCards, StoryDirectorPanel } from "./story-director-panel";
import { ManuscriptImportDialog } from "./manuscript-import-dialog";
import { ManuscriptAnalysisText } from "./manuscript-analysis-text";
import { buildNovelDraft, NovelOutputPanel } from "./novel-output-panel";
import { ForecastSandboxDialog, type ForecastRunSelection } from "./forecast-sandbox-dialog";
import { LocalDistillationProgress } from "./local-distillation-progress";
import {
  createWorldFromManuscript,
  mergeManuscriptCraftKnowledge,
  type CraftKnowledgeEntry,
  type CraftKnowledgeStatus,
  type ImportedManuscript,
  type ManuscriptAnalysis,
  type ManuscriptAnalysisTask,
} from "./manuscript-import";
import { generateCharacterPortrait, generateWorldLabTurn, generateWorldLabTurnStream, worldLabErrorCode, worldLabErrorMessage } from "../../lib/world-lab-api";
import { runForecastSandbox } from "../../lib/forecast-sandbox-api";
import { proposeStoryDirector } from "../../lib/story-director-api";
import { distillDirectorLibrary, type DirectorLibraryKind } from "../../lib/story-director-library-api";
import { composeForecastMemoryAtTurn, convertForecastTrajectoryToBranch, type ForecastSandboxResult } from "./forecast-sandbox";
import {
  loadWorldLabDraft,
  saveWorldLabDraft,
  WORLD_LAB_DRAFT_VERSION,
} from "./world-lab-persistence";
import {
  appendGeneratedInteractiveTurn,
  branchPath,
  composeBranchSparseMemory,
  createStoryCheckpoint,
  createInteractiveStory,
  foldNarrativeLedger,
  forkFromCheckpoint,
  forkInteractiveBranch,
  renameInteractiveBranch,
  switchInteractiveBranch,
  selectedActionFor,
  type InteractiveTurn,
  type InteractiveStoryState,
} from "./interactive-branch";
import styles from "./world-lab.module.css";

// The local world draft and full graph remain lossless. This cap only protects
// one provider turn from exceeding the backend request contract; ranking below
// keeps current, canon-linked, foreshadowed and recently mentioned nodes.
const MAX_RUNTIME_NODES_PER_TURN = 100;
const MAX_CHAPTER_GRAPH_NODES = 24;

type ChapterTurnContext = Pick<InteractiveTurn, "id" | "selectedAction" | "scene" | "deltas" | "memoryUpdates">;

export function selectChapterGraphNodes(
  nodes: readonly WorldNode[],
  storyId: string,
  turn: ChapterTurnContext,
) {
  const chapterText = `${turn.selectedAction ?? ""} ${turn.scene}`;
  const chapterDeltaIds = new Set(turn.deltas.map((delta) => delta.targetNodeId));
  const chapterMemoryIds = new Set(turn.memoryUpdates.flatMap((update) => update.relevantNodeIds));
  return nodes
    .map((node, index) => {
      const mentioned = node.label.length >= 2 && chapterText.includes(node.label);
      const sourcedHere = node.sourceTurnId === turn.id && node.sourceStoryId === storyId;
      const score = (node.id === "protagonist" ? 1_000 : 0)
        + (chapterDeltaIds.has(node.id) ? 950 : 0)
        + (sourcedHere ? 900 : 0)
        + (chapterMemoryIds.has(node.id) ? 850 : 0)
        + (mentioned ? 700 : 0)
        - index / 10;
      return { node, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CHAPTER_GRAPH_NODES)
    .map(({ node }) => node);
}

type Phase = "scene" | "tone" | "workspace";
type GraphScope = "chapter" | "story" | "world" | "focus";
type RailView = "graph" | "canon";
type WorkspaceMode = "write" | "branches" | "director" | "graph" | "canon";

const KIND_LABEL: Record<WorldNode["kind"], string> = {
  character: "人物",
  place: "地点",
  faction: "势力",
  object: "物件",
  event: "事件",
};

const GRAPH_COLORS = {
  character: "#a84f36",
  place: "#287469",
  faction: "#5d6589",
  object: "#d8ad42",
  event: "#a74f68",
} as const;

function isCharacterNode(node: WorldNode | null | undefined): node is WorldNode & { character: CharacterProfile } {
  return node?.kind === "character" && node.character !== undefined;
}

function currentHeadId(state: InteractiveStoryState | undefined) {
  if (!state) return "turn-0";
  return state.branches.find((branch) => branch.id === state.activeBranchId)?.headTurnId ?? "turn-0";
}

function factTargetNodeIds(world: WorldRecord, fact: WorldRecord["facts"][number]) {
  const explicit = (fact.targetNodeIds ?? []).filter((id) => world.nodes.some((node) => node.id === id));
  if (explicit.length > 0) return explicit;
  return world.nodes.filter((node) => node.kind === "character" && fact.statement.includes(node.label)).map((node) => node.id);
}

function promoteFactToCharacterCards(world: WorldRecord, fact: WorldRecord["facts"][number]): WorldRecord {
  const targetIds = factTargetNodeIds(world, fact);
  if (targetIds.length === 0) return world;
  const fieldId = `canon-fact-${fact.id}`;
  const field: CharacterTruthField = {
    id: fieldId,
    label: "正史经历",
    value: fact.statement,
    status: "canon",
    source: `${fact.source} · 正史确认`,
  };
  return {
    ...world,
    nodes: world.nodes.map((node) => {
      if (!targetIds.includes(node.id) || node.kind !== "character" || !node.character) return node;
      return { ...node, character: { ...node.character, fields: [...node.character.fields.filter((item) => item.id !== fieldId), field] } };
    }),
  };
}

function removeFactFromCharacterCards(world: WorldRecord, factId: string): WorldRecord {
  const fieldId = `canon-fact-${factId}`;
  return {
    ...world,
    nodes: world.nodes.map((node) => node.character
      ? { ...node, character: { ...node.character, fields: node.character.fields.filter((field) => field.id !== fieldId) } }
      : node),
  };
}

function updateFact(world: WorldRecord, factId: string, status: FactStatus): WorldRecord {
  const fact = world.facts.find((item) => item.id === factId);
  if (!fact) return world;
  const updated = { ...world, facts: world.facts.map((item) => (item.id === factId ? { ...item, status } : item)) };
  if (status === "accepted") return promoteFactToCharacterCards(updated, { ...fact, status });
  if (status === "rejected") return removeFactFromCharacterCards(updated, factId);
  return updated;
}

function createSiblingStory(world: WorldRecord): StoryRecord {
  const sequence = world.stories.length + 1;
  return {
    id: `${world.id}-story-${sequence}`,
    title: `${world.title}·新书 ${sequence}`,
    premise: "同一世界的另一扇门刚刚打开，人物与正史仍然共享。",
  };
}

function createBlankWorld(sequence: number): WorldRecord {
  const storyId = `world-custom-${sequence}-story-1`;
  return {
    id: `world-custom-${sequence}`,
    title: `未命名世界 ${sequence}`,
    genre: "待选择",
    stories: [{ id: storyId, title: `新小说 ${sequence}`, premise: "这个世界还没有写下第一句。" }],
    nodes: [],
    edges: [],
    facts: [],
  };
}

function migrateImportedContinuationWorld(world: WorldRecord, manuscripts: ImportedManuscript[]) {
  const manuscript = world.sourceManuscriptId
    ? manuscripts.find((item) => item.id === world.sourceManuscriptId)
    : undefined;
  const briefFor = (storyId: string) => world.facts.find((fact) => fact.id === "import-continuation-brief" && fact.storyIds.includes(storyId))?.statement
    ?? manuscript?.analysis?.continuationBrief
    ?? "续写点已导入，等待继续分层分析。";

  return {
    ...world,
    stories: world.stories.map((story) => {
      if (story.continuationContext) return story;
      const selected = manuscript?.chapters.find((chapter) => chapter.id === manuscript.continuationChapterId);
      const legacy = /^【导入稿续写点：([^】]+)】\s*\n?([\s\S]*)$/u.exec(story.premise);
      if (!selected && !legacy) return story;
      const chapterTitle = selected?.title ?? legacy?.[1] ?? "导入稿续写点";
      const excerpt = selected?.text.slice(-2_600) ?? legacy?.[2]?.trim() ?? "";
      const brief = briefFor(story.id);
      return {
        ...story,
        premise: brief,
        continuationContext: { chapterTitle, brief, excerpt },
      };
    }),
  };
}

function makeOpeningWorldIdUnique(world: WorldRecord, existingWorlds: WorldRecord[]): WorldRecord {
  if (!existingWorlds.some((item) => item.id === world.id)) return world;
  const suffix = `${Date.now().toString(36)}-${existingWorlds.length + 1}`;
  const originalStoryId = world.stories[0]!.id;
  const storyId = `${originalStoryId}-${suffix}`;
  return {
    ...world,
    id: `${world.id}-${suffix}`,
    stories: world.stories.map((story) => ({ ...story, id: story.id === originalStoryId ? storyId : `${story.id}-${suffix}` })),
    nodes: world.nodes.map((node) => ({ ...node, storyIds: node.storyIds.map((id) => id === originalStoryId ? storyId : id) })),
    edges: world.edges.map((edge) => ({ ...edge, storyIds: edge.storyIds.map((id) => id === originalStoryId ? storyId : id) })),
    facts: world.facts.map((fact) => ({ ...fact, storyIds: fact.storyIds.map((id) => id === originalStoryId ? storyId : id) })),
  };
}

function appendDiscoveries(
  world: WorldRecord,
  storyId: string,
  turnSequence: number,
  sourceTurnId: string,
  discoveries: Array<{ label: string; kind: string; summary: string; connectToNodeId: string; relationLabel: string }>,
): WorldRecord {
  if (discoveries.length === 0) return world;
  const createdNodes: WorldNode[] = [];
  const createdEdges = [] as WorldRecord["edges"];
  discoveries.forEach((discovery, index) => {
    const anchor = [...world.nodes, ...createdNodes].find((node) => node.id === discovery.connectToNodeId) ?? world.nodes[0];
    if (!anchor) return;
    const angle = ((turnSequence * 2 + index) * Math.PI) / 3.7;
    const id = `discovery-${storyId}-${turnSequence}-${index + 1}`;
    createdNodes.push({
      id,
      label: discovery.label,
      kind: discovery.kind as WorldNode["kind"],
      summary: discovery.summary,
      x: anchor.x + Math.cos(angle) * 118,
      y: anchor.y + Math.sin(angle) * 92,
      storyIds: [storyId],
      sourceTurnId,
      sourceStoryId: storyId,
    });
    createdEdges.push({
      id: `discovery-edge-${storyId}-${turnSequence}-${index + 1}`,
      source: discovery.connectToNodeId,
      target: id,
      label: discovery.relationLabel,
      storyIds: [storyId],
      sourceTurnId,
      sourceStoryId: storyId,
    });
  });
  return { ...world, nodes: [...world.nodes, ...createdNodes], edges: [...world.edges, ...createdEdges] };
}

function downloadQuartzBundle(world: WorldRecord, notes: QuartzNote[]) {
  const payload = JSON.stringify(
    {
      format: "quartz-markdown-bundle.v1",
      generatedAt: new Date().toISOString(),
      worldId: world.id,
      notes,
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${world.id}-quartz-bundle.json`;
  link.click();
  URL.revokeObjectURL(href);
}

function downloadNovelDraft(story: StoryRecord, state: InteractiveStoryState, format: "markdown" | "txt") {
  const payload = buildNovelDraft(story, state, format);
  const blob = new Blob([payload], { type: format === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${story.id}-${state.activeBranchId}-draft.${format === "markdown" ? "md" : "txt"}`;
  link.click();
  URL.revokeObjectURL(href);
}

function analysisFromImportedWorld(world: WorldRecord): ManuscriptAnalysis {
  return {
    genre: world.genre,
    storyTitle: world.stories[0]?.title ?? world.title,
    continuationBrief: world.facts.find((fact) => fact.id === "import-continuation-brief")?.statement ?? "已迁移故事等待继续分层分析。",
    nodes: world.nodes.filter((node) => !node.sourceTurnId).map((node) => ({
      key: node.id,
      label: node.label,
      kind: node.kind,
      summary: node.summary,
      isProtagonist: node.id === "protagonist",
      role: node.character?.role ?? KIND_LABEL[node.kind],
      tagline: node.character?.tagline ?? node.summary,
      ...(node.displayRole ? { displayRole: node.displayRole } : {}),
      ...(node.narrativeLayer ? { narrativeLayer: node.narrativeLayer } : {}),
      ...(node.parentNodeId ? { parentNodeKey: node.parentNodeId } : {}),
      ...(node.sourceChapterIds?.length ? { sourceChapterIds: [...node.sourceChapterIds] } : {}),
    })),
    edges: world.edges.filter((edge) => !edge.sourceTurnId).map((edge) => ({
      sourceKey: edge.source,
      targetKey: edge.target,
      label: edge.label,
      ...(edge.relationType ? { relationType: edge.relationType } : {}),
      ...(edge.eventNodeId ? { eventNodeKey: edge.eventNodeId } : {}),
      ...(edge.sourceChapterIds?.length ? { sourceChapterIds: [...edge.sourceChapterIds] } : {}),
    })),
    facts: world.facts.filter((fact) => fact.id !== "import-continuation-brief").map((fact) => ({ statement: fact.statement, source: fact.source })),
    memoryUpdates: [],
    choices: [
      { label: "沿当前线索继续", hint: "保留现有接力方向。", preferenceSignals: [] },
      { label: "先补全人物关系", hint: "优先检查关系真值。", preferenceSignals: [] },
      { label: "先梳理世界势力", hint: "优先检查世界结构。", preferenceSignals: [] },
    ],
    trace: { traceId: "local-resume", provider: "local-draft", model: "已迁移图谱", workflowVersion: "vnext.manuscript-import.v1", outputHash: "0".repeat(64) },
    fallbackApplied: false,
  };
}

function refreshImportedWorld(current: WorldRecord, manuscript: ImportedManuscript, analysis: ManuscriptAnalysis) {
  const seed = createWorldFromManuscript(manuscript, analysis).world;
  const existingByIdentity = new Map(current.nodes.map((node) => [`${node.kind}:${node.label}`, node]));
  const seedNodeIds = new Set(seed.nodes.map((node) => node.id));
  const seedEdgeIds = new Set(seed.edges.map((edge) => edge.id));
  const factStatus = new Map(current.facts.map((fact) => [fact.statement, fact.status]));
  return {
    ...current,
    genre: seed.genre,
    nodes: [
      ...seed.nodes.map((node) => {
        const existing = existingByIdentity.get(`${node.kind}:${node.label}`);
        return existing ? { ...node, x: existing.x, y: existing.y, ...(existing.character ? { character: existing.character } : {}) } : node;
      }),
      ...current.nodes.filter((node) => node.sourceTurnId && !seedNodeIds.has(node.id)),
    ],
    edges: [...seed.edges, ...current.edges.filter((edge) => edge.sourceTurnId && !seedEdgeIds.has(edge.id))],
    facts: seed.facts.map((fact) => ({ ...fact, status: factStatus.get(fact.statement) ?? fact.status })),
  } satisfies WorldRecord;
}

function craftStatusLabel(status: CraftKnowledgeStatus) {
  return status === "learned" ? "已学会" : status === "dismissed" ? "已隐藏" : "候选";
}

function CraftKnowledgePanel({
  activeManuscriptId,
  entries,
  onStatusChange,
}: {
  activeManuscriptId: string | null;
  entries: CraftKnowledgeEntry[];
  onStatusChange: (entryId: string, status: CraftKnowledgeStatus) => void;
}) {
  const [kindFilter, setKindFilter] = useState<"all" | CraftKnowledgeEntry["kind"]>("all");
  const [onlyActiveSource, setOnlyActiveSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const techniques = entries.filter((entry) => entry.kind === "technique");
  const twists = entries.filter((entry) => entry.kind === "twist");
  const activeCount = activeManuscriptId
    ? entries.filter((entry) => entry.sources.some((source) => source.manuscriptId === activeManuscriptId)).length
    : 0;
  const filteredEntries = entries.filter((entry) => {
    if (kindFilter !== "all" && entry.kind !== kindFilter) return false;
    if (onlyActiveSource && (!activeManuscriptId || !entry.sources.some((source) => source.manuscriptId === activeManuscriptId))) return false;
    return true;
  });
  const visibleEntries = expanded ? filteredEntries : filteredEntries.slice(0, 12);
  const hasHiddenEntries = filteredEntries.length > visibleEntries.length;
  const renderEntry = (entry: CraftKnowledgeEntry) => {
    const sourceNames = [...new Set(entry.sources.map((source) => source.manuscriptTitle))].join("、");
    const isActive = activeManuscriptId !== null && entry.sources.some((source) => source.manuscriptId === activeManuscriptId);
    return (
      <article className={styles.craftKnowledgeCard} data-active-source={isActive} data-status={entry.status} key={entry.id}>
        <header>
          <div>
            <strong>{entry.kind === "technique" ? entry.technique.label : entry.twist.setup}</strong>
            <small>{craftStatusLabel(entry.status)} · {entry.sources.length} 个书源观察</small>
          </div>
          {entry.status === "learned" ? (
            <button onClick={() => onStatusChange(entry.id, "candidate")} type="button">退回候选</button>
          ) : (
            <button onClick={() => onStatusChange(entry.id, "learned")} type="button">标记已学</button>
          )}
        </header>
        {entry.kind === "technique" ? (
          <>
            <p>{entry.technique.pattern}</p>
            <small className={styles.craftKnowledgeMeta}>证据：{entry.technique.evidence}</small>
            {entry.technique.cadence ? <small className={styles.craftKnowledgeMeta}>节奏：{entry.technique.cadence}</small> : null}
            {entry.technique.semanticFit ? <small className={styles.craftKnowledgeMeta}>语义适配：{entry.technique.semanticFit}</small> : null}
            {entry.technique.comicContrast ? <small className={styles.craftKnowledgeMeta}>喜剧反差：{entry.technique.comicContrast}</small> : null}
            <small className={styles.craftKnowledgeMeta}>适用：{entry.technique.useWhen} · 风险：{entry.technique.risk}</small>
          </>
        ) : (
          <>
            <p>误导：{entry.twist.misdirection} → 揭示：{entry.twist.reveal}</p>
            <small className={styles.craftKnowledgeMeta}>回收：{entry.twist.payoff}</small>
            <small className={styles.craftKnowledgeMeta}>证据位置：{entry.twist.source}</small>
          </>
        )}
        <footer>
          <span>{isActive ? "当前作品 · " : ""}{sourceNames || "未知书源"}</span>
          <button onClick={() => onStatusChange(entry.id, entry.status === "dismissed" ? "candidate" : "dismissed")} type="button">
            {entry.status === "dismissed" ? "恢复显示" : "暂时隐藏"}
          </button>
        </footer>
      </article>
    );
  };

  return (
    <section aria-label="写法知识库" className={styles.craftLibraryPanel} data-testid="craft-knowledge-panel">
      <div className={styles.craftLibraryHeading}>
        <div><span>可复用创作知识</span><strong>写法库 · 反转库</strong></div>
        <b>{entries.length}</b>
      </div>
      <p className={styles.craftLibraryExplain}>只学习结构、节奏与回收逻辑，不进入小说正史，也不复制书源原句。</p>
      <div className={styles.craftLibraryStats}>
        <span>写法 {techniques.length}</span>
        <span>反转 {twists.length}</span>
        <span>本书 {activeCount}</span>
      </div>
      <div aria-label="写法库筛选" className={styles.craftLibraryFilters}>
        <button aria-pressed={kindFilter === "all"} data-active={kindFilter === "all"} onClick={() => { setKindFilter("all"); setExpanded(false); }} type="button">全部</button>
        <button aria-pressed={kindFilter === "technique"} data-active={kindFilter === "technique"} onClick={() => { setKindFilter("technique"); setExpanded(false); }} type="button">写法</button>
        <button aria-pressed={kindFilter === "twist"} data-active={kindFilter === "twist"} onClick={() => { setKindFilter("twist"); setExpanded(false); }} type="button">反转</button>
        <button aria-pressed={onlyActiveSource} data-active={onlyActiveSource} disabled={!activeManuscriptId} onClick={() => { setOnlyActiveSource((current) => !current); setExpanded(false); }} type="button">本书</button>
      </div>
      {entries.length === 0 ? (
        <div className={styles.emptyCraftKnowledge}><strong>还没有写法证据</strong><p>导入一部拥有使用权的 TXT / Markdown 小说，完成概览或分段分析后，这里会自动积累。</p></div>
      ) : filteredEntries.length === 0 ? (
        <div className={styles.emptyCraftKnowledge}><strong>当前筛选没有条目</strong><p>可以切换类型，或取消“本书”筛选查看全部书源的观察。</p></div>
      ) : (
        <>
          <div className={styles.craftKnowledgeList}>
            {visibleEntries.map(renderEntry)}
          </div>
          {filteredEntries.length > 12 ? (
            <button className={styles.craftLibraryMore} onClick={() => setExpanded((current) => !current)} type="button">
              {expanded ? "收起条目" : `展开全部（${filteredEntries.length}）`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

interface CanonPanelProps {
  world: WorldRecord;
  activeStoryId: string | null;
  candidateFactCount: number;
  canonApprovalNotice: string | null;
  approveAllCandidateFacts(): void;
  setFactStatus(factId: string, status: FactStatus): void;
}

function CanonPanel({ world, activeStoryId, candidateFactCount, canonApprovalNotice, approveAllCandidateFacts, setFactStatus }: CanonPanelProps) {
  const facts = activeStoryId ? world.facts.filter((fact) => fact.storyIds.includes(activeStoryId)) : world.facts;

  return (
    <section className={styles.canonPanel} aria-label="事实候选">
      <p className={styles.canonExplain}>正史候选是 AI 从正文中提取的“已经发生过的事实”，确认后才成为世界真值；作者导演台里的提案只是未来方向，不会自动写入这里。</p>
      <div className={styles.canonActionBar}>
        <div>
          <strong>当前故事候选事实</strong>
          <small>一键审批后写入正史，并同步相关角色卡</small>
        </div>
        <button
          aria-label="一键审批并写入正史"
          disabled={candidateFactCount === 0}
          onClick={approveAllCandidateFacts}
          title="只处理当前故事中等待确认的候选事实"
          type="button"
        >一键审批并写入正史{candidateFactCount > 0 ? `（${candidateFactCount}）` : ""}</button>
      </div>
      {canonApprovalNotice ? <p aria-live="polite" className={styles.canonApprovalNotice} role="status">{canonApprovalNotice}</p> : null}
      <div className={styles.sectionHeading}>
        <div><span>正史候选</span><strong>让 AI 先提议，由你拍板</strong></div>
      </div>
      {facts.length ? (
        <div className={styles.factList}>
          {facts.map((fact) => (
            <article key={fact.id} data-status={fact.status}>
              <span>{fact.status === "candidate" ? "等待确认" : fact.status === "accepted" ? "已入正史" : "已忽略"}</span>
              <p>{fact.statement}</p><small>{fact.source}</small>
              {fact.status === "candidate" ? <div><button onClick={() => setFactStatus(fact.id, "accepted")} type="button">写入正史</button><button onClick={() => setFactStatus(fact.id, "rejected")} type="button">忽略</button></div> : <button onClick={() => setFactStatus(fact.id, "candidate")} type="button">重新审阅</button>}
            </article>
          ))}
        </div>
      ) : <div className={styles.emptyFacts}>这本书还没有产生事实候选。</div>}
    </section>
  );
}

export function WorldLabView({ localDistillationProgressEnabled = false }: { localDistillationProgressEnabled?: boolean } = {}) {
  const [phase, setPhase] = useState<Phase>("scene");
  const [openingId, setOpeningId] = useState<OpeningId | null>(null);
  const [worlds, setWorlds] = useState<WorldRecord[]>([]);
  const [manuscripts, setManuscripts] = useState<ImportedManuscript[]>([]);
  const [craftLibrary, setCraftLibrary] = useState<CraftKnowledgeEntry[]>([]);
  const [directorKnowledgeCards, setDirectorKnowledgeCards] = useState<DirectorKnowledgeCard[]>([]);
  const [directorCraftCards, setDirectorCraftCards] = useState<DirectorCraftCard[]>([]);
  const [directorJokeCards, setDirectorJokeCards] = useState<DirectorJokeCard[]>([]);
  const [forecastSandboxes, setForecastSandboxes] = useState<ForecastSandboxResult[]>([]);
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphScope, setGraphScope] = useState<GraphScope>("world");
  const [showContextNodes, setShowContextNodes] = useState(false);
  const [railView, setRailView] = useState<RailView>("graph");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("write");
  const [showExport, setShowExport] = useState(false);
  const [graphTuning, setGraphTuning] = useState<GraphTuning>(() => ({ ...DEFAULT_GRAPH_TUNING }));
  const [graphResetToken, setGraphResetToken] = useState(0);
  const [graphQualityPreference, setGraphQualityPreference] = useState<"auto" | "quality" | "performance">("auto");
  const [graphP95FrameMs, setGraphP95FrameMs] = useState<number | undefined>(undefined);
  const graphQualityControllerRef = useRef(new GraphQualityController({ recoverySamples: 3 }));
  const previousGraphQualityPreferenceRef = useRef(graphQualityPreference);
  const graphLayoutCacheRef = useRef<GraphLayoutCache | null>(null);
  const [graphLayoutCacheReady, setGraphLayoutCacheReady] = useState(false);
  const [graphLayoutSnapshot, setGraphLayoutSnapshot] = useState<GraphLayoutSnapshot | undefined>(undefined);
  const sideGraphLayoutRef = useRef<Array<{ id: string; x: number; y: number }>>([]);
  const [fullGraphQualityLevel, setFullGraphQualityLevel] = useState<GraphQualityLevel | null>(null);
  const [graphBenchmarkNodeCount, setGraphBenchmarkNodeCount] = useState(0);
  const [characterCardNodeId, setCharacterCardNodeId] = useState<string | null>(null);
  const [interactiveStories, setInteractiveStories] = useState<Record<string, InteractiveStoryState>>({});
  const [selectedTurnId, setSelectedTurnId] = useState("turn-0");
  const [turnPending, setTurnPending] = useState(false);
  const [streamingScene, setStreamingScene] = useState("");
  const [turnRuntimeError, setTurnRuntimeError] = useState<string | null>(null);
  const [turnRuntimeModel, setTurnRuntimeModel] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"loading" | "saved" | "saving" | "unavailable">("loading");
  const [showManuscriptImport, setShowManuscriptImport] = useState(false);
  const [resumeManuscriptId, setResumeManuscriptId] = useState<string | null>(null);
  const [manuscriptTask, setManuscriptTask] = useState<ManuscriptAnalysisTask | null>(null);
  const [manuscriptTaskNotice, setManuscriptTaskNotice] = useState<string | null>(null);
  const previousManuscriptTaskRef = useRef<ManuscriptAnalysisTask | null>(null);
  const [showForecastSandbox, setShowForecastSandbox] = useState(false);
  const [showFullGraph, setShowFullGraph] = useState(false);
  const [showKnowledgeLibrary, setShowKnowledgeLibrary] = useState(false);
  const [knowledgeLibrarySection, setKnowledgeLibrarySection] = useState<"craft" | "world" | "jokes">("craft");
  const [forecastPending, setForecastPending] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [directorPending, setDirectorPending] = useState(false);
  const [directorError, setDirectorError] = useState<string | null>(null);
  const [directorLibraryPending, setDirectorLibraryPending] = useState(false);
  const [directorLibraryError, setDirectorLibraryError] = useState<string | null>(null);
  const [canonApprovalNotice, setCanonApprovalNotice] = useState<string | null>(null);
  // Each creative surface owns its own request lock. A failed forecast or
  // director request must never disable the independent turn workflow.
  const turnRequestLockRef = useRef(false);
  const forecastRequestLockRef = useRef(false);
  const directorRequestLockRef = useRef(false);
  const directorLibraryRequestLockRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadWorldLabDraft().then((draft) => {
      if (!active) return;
      if (draft) {
        setManuscripts(draft.manuscripts);
        const restoredWorlds = draft.worlds.map((world) => migrateImportedContinuationWorld(world, draft.manuscripts));
        setWorlds(restoredWorlds);
        const restoredCraftLibrary = draft.manuscripts.reduce(
          (current, manuscript) => manuscript.analysis
            ? mergeManuscriptCraftKnowledge(current, manuscript, manuscript.analysis, manuscript.importedAt)
            : current,
          draft.craftLibrary ?? [],
        );
        setCraftLibrary(restoredCraftLibrary);
        setDirectorKnowledgeCards(draft.directorKnowledgeCards ?? []);
        setDirectorCraftCards(draft.directorCraftCards ?? []);
        setDirectorJokeCards(draft.directorJokeCards ?? []);
        setResumeManuscriptId(draft.manuscripts[0]?.id ?? null);
        setForecastSandboxes(draft.forecastSandboxes);
        setInteractiveStories(draft.interactiveStories);
        if (restoredWorlds.length > 0) {
          setActiveWorldId(draft.activeWorldId ?? restoredWorlds[0]?.id ?? null);
          setActiveStoryId(draft.activeStoryId ?? restoredWorlds[0]?.stories[0]?.id ?? null);
          setSelectedTurnId(draft.selectedTurnId);
          setGraphScope(draft.graphScope);
          setRailView(draft.railView);
          setTurnRuntimeModel(draft.runtimeModel);
          setSelectedNodeId(null);
          setCharacterCardNodeId(null);
          setPhase("workspace");
        }
        setDraftStatus("saved");
      } else {
        setDraftStatus(typeof indexedDB === "undefined" ? "unavailable" : "saved");
      }
      setDraftHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      void saveWorldLabDraft({
        version: WORLD_LAB_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
        worlds,
        manuscripts,
        craftLibrary,
        directorKnowledgeCards,
        directorCraftCards,
        directorJokeCards,
        forecastSandboxes,
        interactiveStories,
        activeWorldId,
        activeStoryId,
        selectedTurnId,
        graphScope,
        railView,
        runtimeModel: turnRuntimeModel,
      }).then(
        () => setDraftStatus("saved"),
        () => setDraftStatus("unavailable"),
      );
    }, 320);
    return () => window.clearTimeout(timer);
  }, [activeStoryId, activeWorldId, craftLibrary, directorCraftCards, directorJokeCards, directorKnowledgeCards, draftHydrated, forecastSandboxes, graphScope, interactiveStories, manuscripts, railView, selectedTurnId, turnRuntimeModel, worlds]);

  useEffect(() => {
    setCanonApprovalNotice(null);
  }, [activeStoryId, activeWorldId]);

  useEffect(() => {
    if (!showFullGraph) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowFullGraph(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFullGraph]);

  useEffect(() => {
    if (!showKnowledgeLibrary) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowKnowledgeLibrary(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showKnowledgeLibrary]);

  const activeWorld = worlds.find((world) => world.id === activeWorldId) ?? null;
  const activeManuscript = manuscripts.find((manuscript) => manuscript.id === activeWorld?.sourceManuscriptId) ?? null;
  const resumeManuscript = manuscripts.find((manuscript) => manuscript.id === resumeManuscriptId) ?? null;
  const resumeAnalysis = resumeManuscript?.analysis ?? (resumeManuscript && activeWorld?.sourceManuscriptId === resumeManuscript.id ? analysisFromImportedWorld(activeWorld) : null);
  const activeStory = activeWorld?.stories.find((story) => story.id === activeStoryId) ?? null;
  const candidateFactCount = activeWorld && activeStoryId
    ? activeWorld.facts.filter((fact) => fact.status === "candidate" && fact.storyIds.includes(activeStoryId)).length
    : 0;
  const activeInteractiveState = activeStoryId ? interactiveStories[activeStoryId] : undefined;
  const selectedInteractiveTurn = activeInteractiveState?.turns.find((turn) => turn.id === selectedTurnId) ?? null;
  const activeBranch = activeInteractiveState?.branches.find((branch) => branch.id === activeInteractiveState.activeBranchId) ?? null;
  const currentTurn = selectedInteractiveTurn
    ?? activeInteractiveState?.turns.find((turn) => turn.id === activeBranch?.headTurnId)
    ?? null;
  const activeBranchTurnIds = useMemo(
    () => new Set(activeInteractiveState ? branchPath(activeInteractiveState).map((turn) => turn.id) : []),
    [activeInteractiveState],
  );
  const isVisibleOnActiveBranch = useCallback(
    (item: { sourceTurnId?: string; sourceStoryId?: string }) =>
      !item.sourceTurnId || (item.sourceStoryId === activeStoryId && activeBranchTurnIds.has(item.sourceTurnId)),
    [activeBranchTurnIds, activeStoryId],
  );
  const visibleNodes = useMemo(() => {
    if (!activeWorld) return [];
    const storyNodes = graphScope === "world" || !activeStoryId
      ? activeWorld.nodes.filter(isVisibleOnActiveBranch)
      : activeWorld.nodes.filter((item) => item.storyIds.includes(activeStoryId) && isVisibleOnActiveBranch(item));
    const narrativeNodes = showContextNodes ? storyNodes : storyNodes.filter((item) => item.displayRole !== "context");
    if (graphScope === "focus" && selectedNodeId) {
      const neighborIds = new Set([selectedNodeId]);
      for (const edge of activeWorld.edges) {
        if (edge.source === selectedNodeId) neighborIds.add(edge.target);
        if (edge.target === selectedNodeId) neighborIds.add(edge.source);
      }
      return narrativeNodes.filter((item) => neighborIds.has(item.id));
    }
    if (graphScope === "chapter" && selectedInteractiveTurn) {
      const chapterNodes = selectChapterGraphNodes(storyNodes, activeStoryId ?? "", selectedInteractiveTurn);
      const chapterIds = new Set(chapterNodes.map((node) => node.id));
      return chapterNodes.filter((item) => chapterIds.has(item.id));
    }
    return narrativeNodes;
  }, [activeStoryId, activeWorld, graphScope, isVisibleOnActiveBranch, selectedInteractiveTurn, selectedNodeId, showContextNodes]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((item) => item.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () =>
      activeWorld?.edges.filter(
        (edge) =>
          visibleNodeIds.has(edge.source) &&
          visibleNodeIds.has(edge.target) &&
          isVisibleOnActiveBranch(edge) &&
          (graphScope === "world" || !activeStoryId || edge.storyIds.includes(activeStoryId)),
      ) ?? [],
    [activeStoryId, activeWorld, graphScope, isVisibleOnActiveBranch, visibleNodeIds],
  );
  const storyGraphNodes = useMemo(
    () => {
      const worldNodes = visibleNodes.map((item) => ({
        id: item.id,
        label: item.label,
        type: item.kind,
        x: item.x,
        y: item.y,
        radius: 32,
        metadata: {
          displayRole: item.displayRole ?? "entity",
          narrativeLayer: item.narrativeLayer ?? "entity",
          truthStatus: item.truthStatus ?? "candidate",
          salience: item.salience ?? "supporting",
          ...(item.parentNodeId ? { parentNodeId: item.parentNodeId } : {}),
        },
        ...(item.character?.portrait?.url ? { imageUrl: item.character.portrait.url } : {}),
      }));
      const state = activeStoryId ? interactiveStories[activeStoryId] : undefined;
      const projectedTurns = state ? branchPath(state).filter((turn) =>
        turn.selectedAction && (graphScope !== "chapter" || turn.id === selectedInteractiveTurn?.id),
      ) : [];
      return [...worldNodes, ...projectedTurns.map((turn, index) => ({
        id: `branch-turn:${turn.id}`,
        label: `选择${turn.depth}`,
        type: "event",
        x: 300 + index * 65,
        y: 395 + index * 18,
        radius: 26,
      }))];
    },
    [activeStoryId, graphScope, interactiveStories, selectedInteractiveTurn?.id, visibleNodes],
  );
  const storyGraphEdges = useMemo(
    () => {
      const worldEdges = visibleEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
      }));
      const state = activeStoryId ? interactiveStories[activeStoryId] : undefined;
      const projectedTurns = state ? branchPath(state).filter((turn) =>
        turn.selectedAction && (graphScope !== "chapter" || turn.id === selectedInteractiveTurn?.id),
      ) : [];
      return [...worldEdges, ...projectedTurns.map((turn, index) => ({
        id: `branch-edge:${turn.id}`,
        source: `branch-turn:${turn.id}`,
        target: index === 0 ? "protagonist" : `branch-turn:${projectedTurns[index - 1]!.id}`,
        label: index === 0 ? "作出选择" : "沿此发生",
      }))];
    },
    [activeStoryId, graphScope, interactiveStories, selectedInteractiveTurn?.id, visibleEdges],
  );
  const benchmarkGraph = useMemo(() => {
    if (!graphBenchmarkNodeCount) return undefined;
    const nodes = Array.from({ length: graphBenchmarkNodeCount }, (_, index) => {
      const angle = index * 2.399963229728653;
      const orbit = 40 + Math.sqrt(index + 1) * 8;
      return {
        id: `benchmark-node-${index}`,
        label: `节点${index + 1}`,
        type: index % 11 === 0 ? "character" : index % 7 === 0 ? "faction" : index % 5 === 0 ? "place" : "event",
        x: Math.cos(angle) * orbit,
        y: Math.sin(angle) * orbit,
        radius: index % 23 === 0 ? 32 : 22,
      };
    });
    const edges = nodes.flatMap((node, index) => {
      if (index === 0) return [];
      const result = [{
        id: `benchmark-edge-${index}-parent`,
        source: node.id,
        target: nodes[Math.floor((index - 1) / 2)]!.id,
        label: "关联",
      }];
      if (index > 4 && index % 3 === 0) result.push({
        id: `benchmark-edge-${index}-cross`,
        source: node.id,
        target: nodes[index - 4]!.id,
        label: "旁支",
      });
      return result;
    });
    return { nodes, edges };
  }, [graphBenchmarkNodeCount]);
  const graphNodes = benchmarkGraph?.nodes ?? storyGraphNodes;
  const graphEdges = benchmarkGraph?.edges ?? storyGraphEdges;
  const sidebarGraphNodes = useMemo(
    () => graphNodes.map((node) => ({ ...node, id: `sidebar:${node.id}` })),
    [graphNodes],
  );
  const sidebarGraphEdges = useMemo(
    () => graphEdges.map((edge) => ({
      ...edge,
      id: `sidebar:${edge.id}`,
      source: `sidebar:${edge.source}`,
      target: `sidebar:${edge.target}`,
    })),
    [graphEdges],
  );
  const graphLayoutIdentity = useMemo<GraphLayoutCacheIdentity>(() => ({
    worldRevision: activeWorld?.id ?? "unbound-world",
    graphScope: `fullscreen:${graphScope}:${activeStoryId ?? "all-stories"}`,
    tuning: graphTuning,
    nodes: graphNodes,
    edges: graphEdges,
  }), [activeStoryId, activeWorld?.id, graphEdges, graphNodes, graphScope, graphTuning]);
  useEffect(() => {
    graphLayoutCacheRef.current = new GraphLayoutCache(window.localStorage);
    setGraphLayoutCacheReady(true);
    if (process.env.NODE_ENV !== "production") {
      const requested = Number(new URLSearchParams(window.location.search).get("graphBenchmarkNodes"));
      if ([100, 300, 1_000, 5_000].includes(requested)) setGraphBenchmarkNodeCount(requested);
    }
  }, []);
  useEffect(() => {
    if (!graphLayoutCacheReady) return;
    setGraphLayoutSnapshot(graphLayoutCacheRef.current?.load(graphLayoutIdentity));
  }, [graphLayoutCacheReady, graphLayoutIdentity]);
  const captureSideGraphLayout = useCallback((nodes: ReadonlyArray<GraphNodeState>) => {
    sideGraphLayoutRef.current = nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
  }, []);
  const inheritedSideLayout = showFullGraph && !graphLayoutSnapshot && sideGraphLayoutRef.current.length > 0;
  const hydratedFullGraphNodes = useMemo(() => {
    if (graphLayoutSnapshot) return hydrateGraphNodesFromLayout<Record<string, unknown>>(graphNodes, graphLayoutSnapshot);
    if (!showFullGraph || sideGraphLayoutRef.current.length === 0) return graphNodes;
    const sidePositions = new Map(sideGraphLayoutRef.current.map((node) => [node.id, node]));
    const matched = graphNodes.flatMap((node) => {
      const position = sidePositions.get(node.id);
      return position ? [position] : [];
    });
    if (matched.length === 0) return graphNodes;
    const minX = Math.min(...matched.map((node) => node.x));
    const maxX = Math.max(...matched.map((node) => node.x));
    const minY = Math.min(...matched.map((node) => node.y));
    const maxY = Math.max(...matched.map((node) => node.y));
    const maxScale = graphNodes.length <= 12 ? 4 : 2.4;
    const scale = Math.min(maxScale, 1_200 / Math.max(1, maxX - minX), 640 / Math.max(1, maxY - minY));
    const offsetX = 700 - ((minX + maxX) / 2) * scale;
    const offsetY = 400 - ((minY + maxY) / 2) * scale;
    return graphNodes.map((node) => {
      const position = sidePositions.get(node.id);
      return position ? { ...node, x: position.x * scale + offsetX, y: position.y * scale + offsetY } : node;
    });
  }, [graphLayoutSnapshot, graphNodes, showFullGraph]);
  const saveFullGraphLayout = useCallback((nodes: ReadonlyArray<GraphNodeState>, camera: GraphTransform) => {
    const cache = graphLayoutCacheRef.current;
    if (!cache) return;
    cache.save(
      graphLayoutIdentity,
      nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, pinned: node.fx != null && node.fy != null })),
      camera,
    );
  }, [graphLayoutIdentity]);
  const graphQuality = useMemo(() => {
    if (previousGraphQualityPreferenceRef.current !== graphQualityPreference) {
      graphQualityControllerRef.current.reset();
      previousGraphQualityPreferenceRef.current = graphQualityPreference;
    }
    const signals = {
      nodeCount: graphNodes.length,
      edgeCount: graphEdges.length,
      visibleAvatarCount: visibleNodes.filter((node) => node.character?.portrait?.url).length,
      devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio,
      deviceMemoryGiB: typeof navigator === "undefined" ? 8 : Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8),
      ...(graphP95FrameMs === undefined ? {} : { p95FrameMs: graphP95FrameMs }),
      preference: graphQualityPreference,
    } as const;
    return graphQualityPreference === "auto"
      ? graphQualityControllerRef.current.sample(signals)
      : chooseGraphQuality(signals);
  }, [graphEdges.length, graphNodes.length, graphP95FrameMs, graphQualityPreference, visibleNodes]);
  const fullGraphQuality = useMemo(() => {
    if (graphQualityPreference !== "auto" || !fullGraphQualityLevel) return graphQuality;
    const locked = graphQualityProfile(fullGraphQualityLevel);
    return locked.renderer === "svg" && graphNodes.length > 150 ? graphQuality : locked;
  }, [fullGraphQualityLevel, graphNodes.length, graphQuality, graphQualityPreference]);
  useEffect(() => {
    if (showFullGraph) return;
    setGraphP95FrameMs(undefined);
    setFullGraphQualityLevel(null);
    graphQualityControllerRef.current.reset();
  }, [showFullGraph]);
  useEffect(() => {
    if (!showFullGraph || typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    let raf = 0;
    let previous = performance.now();
    const samples: number[] = [];
    const sample = (now: number) => {
      if (frame > 4) samples.push(now - previous);
      previous = now;
      frame += 1;
      if (frame < 90) {
        raf = requestAnimationFrame(sample);
        return;
      }
      const ordered = samples.sort((left, right) => left - right);
      setGraphP95FrameMs(Number((ordered[Math.ceil(ordered.length * 0.95) - 1] ?? 0).toFixed(2)));
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, [graphEdges.length, graphNodes.length, showFullGraph]);
  const selectedNode = activeWorld?.nodes.find((item) => item.id === selectedNodeId) ?? null;
  const characterCardNode = activeWorld?.nodes.find((item) => item.id === characterCardNodeId) ?? null;
  const characterRelations = useMemo<CharacterRelation[]>(() => {
    if (!activeWorld || !characterCardNode) return [];
    return activeWorld.edges.flatMap((edge) => {
      if (edge.source !== characterCardNode.id && edge.target !== characterCardNode.id) return [];
      const targetId = edge.source === characterCardNode.id ? edge.target : edge.source;
      const target = activeWorld.nodes.find((node) => node.id === targetId);
      if (!target) return [];
      return [{
        id: edge.id,
        label: edge.label,
        direction: edge.source === characterCardNode.id ? "outgoing" as const : "incoming" as const,
        target,
      }];
    });
  }, [activeWorld, characterCardNode]);
  const quartzNotes = useMemo(() => (activeWorld ? buildQuartzNotes(activeWorld) : []), [activeWorld]);
  const interactiveState = activeStoryId ? interactiveStories[activeStoryId] ?? null : null;
  const quartzExportNotes = useMemo(() => {
    if (!activeStory || !interactiveState || branchPath(interactiveState).length <= 1) return quartzNotes;
    return [
      ...quartzNotes,
      {
        path: `content/stories/${activeStory.id}-${interactiveState.activeBranchId}-draft.md`,
        content: buildNovelDraft(activeStory, interactiveState, "markdown"),
      },
    ];
  }, [activeStory, interactiveState, quartzNotes]);
  const activeForecastSandboxes = useMemo(
    () => activeStoryId ? forecastSandboxes.filter((sandbox) => sandbox.sourceStoryId === activeStoryId) : [],
    [activeStoryId, forecastSandboxes],
  );
  const activeDirectorProposals = useMemo(
    () => activeWorld && activeStoryId
      ? (activeWorld.directorProposals ?? []).filter((proposal) => proposal.storyId === activeStoryId)
      : [],
    [activeStoryId, activeWorld],
  );
  const activeDirectorKnowledgeCards = useMemo(
    () => activeStoryId ? directorKnowledgeCards.filter((card) => card.storyId === activeStoryId) : [],
    [activeStoryId, directorKnowledgeCards],
  );
  const activeDirectorCraftCards = useMemo(
    () => activeStoryId ? directorCraftCards.filter((card) => card.storyId === activeStoryId) : [],
    [activeStoryId, directorCraftCards],
  );
  const activeDirectorJokeCards = useMemo(
    () => activeStoryId ? directorJokeCards.filter((card) => card.storyId === activeStoryId) : [],
    [activeStoryId, directorJokeCards],
  );
  const directorCandidateNodes = useMemo(
    () => activeWorld
      ? activeWorld.nodes.filter(isVisibleOnActiveBranch).slice(0, 12)
      : [],
    [activeWorld, isVisibleOnActiveBranch],
  );
  const directorUnresolvedThreads = useMemo(() => {
    if (!activeInteractiveState) return [];
    const memory = composeBranchSparseMemory(activeInteractiveState);
    const ledgerThreads = foldNarrativeLedger(activeInteractiveState)
      .filter((entry) => entry.status === "active" && (entry.kind === "foreshadowing" || entry.kind === "promise"))
      .slice(-8)
      .map((entry) => `${entry.kind === "foreshadowing" ? "伏笔" : "承诺"}：${entry.key} · ${entry.value}`);
    return [...new Set([...ledgerThreads, ...memory.openThreads])].slice(-10);
  }, [activeInteractiveState]);

  const chooseOpening = (id: OpeningId) => {
    setOpeningId(id);
    setPhase("tone");
  };

  const finishOpening = (id: ToneId) => {
    if (!openingId) return;
    const world = makeOpeningWorldIdUnique(createOpeningWorld(openingId, id), worlds);
    setWorlds((current) => [...current, world]);
    setActiveWorldId(world.id);
    setActiveStoryId(world.stories[0]?.id ?? null);
    setSelectedNodeId(null);
    setCharacterCardNodeId(null);
    setInteractiveStories((current) => ({ ...current, [world.stories[0]!.id]: createInteractiveStory(world, world.stories[0]!) }));
    setSelectedTurnId("turn-0");
    setPhase("workspace");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  };

  const confirmManuscriptImport = (manuscript: ImportedManuscript, analysis: ManuscriptAnalysis) => {
    setCraftLibrary((current) => mergeManuscriptCraftKnowledge(current, manuscript, analysis));
    const existingWorld = worlds.find((world) => world.sourceManuscriptId === manuscript.id);
    if (existingWorld) {
      const refreshed = refreshImportedWorld(existingWorld, manuscript, analysis);
      setManuscripts((current) => [...current.filter((item) => item.id !== manuscript.id), manuscript]);
      setWorlds((current) => current.map((world) => world.id === existingWorld.id ? refreshed : world));
      setActiveWorldId(existingWorld.id);
      setActiveStoryId(existingWorld.stories[0]?.id ?? null);
      setTurnRuntimeModel(analysis.trace.model);
      setGraphScope("story");
      setRailView("graph");
      setResumeManuscriptId(null);
      return;
    }
    const imported = createWorldFromManuscript(manuscript, analysis);
    const world = makeOpeningWorldIdUnique(imported.world, worlds);
    const story = world.stories[0]!;
    const state = createInteractiveStory(world, story, {
      openingChoices: imported.initialChoices,
      memoryUpdates: imported.memoryUpdates,
    });
    setManuscripts((current) => [...current.filter((item) => item.id !== manuscript.id), manuscript]);
    setWorlds((current) => [...current, world]);
    setInteractiveStories((current) => ({ ...current, [story.id]: state }));
    setActiveWorldId(world.id);
    setActiveStoryId(story.id);
    setSelectedNodeId(null);
    setCharacterCardNodeId(null);
    setSelectedTurnId("turn-0");
    setTurnRuntimeModel(analysis.trace.model);
    setGraphScope("story");
    setRailView("graph");
    setPhase("workspace");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  };

  const persistManuscriptProgress = (manuscript: ImportedManuscript) => {
    setManuscripts((current) => [...current.filter((item) => item.id !== manuscript.id), manuscript]);
    if (manuscript.analysis) {
      setCraftLibrary((current) => mergeManuscriptCraftKnowledge(current, manuscript, manuscript.analysis!));
    }
    setResumeManuscriptId((current) => current ?? manuscript.id);
  };

  const updateCraftEntryStatus = (entryId: string, status: CraftKnowledgeStatus) => {
    setCraftLibrary((current) => current.map((entry) => entry.id === entryId ? { ...entry, status } : entry));
  };

  const handleManuscriptTaskChange = useCallback((task: ManuscriptAnalysisTask) => {
    const previous = previousManuscriptTaskRef.current;
    setManuscriptTask(task);
    previousManuscriptTaskRef.current = task;
    if (previous?.id === task.id && previous.status === "running" && task.status !== "running") {
      const message = task.status === "completed"
        ? task.stopRequested && task.completedBatches < task.totalBatches
          ? `${task.filename} 已完成当前第 ${task.completedBatches} 批，已按请求暂停；之前的结果已经保存。`
          : `${task.filename} 的${task.stage === "overview" ? "概览" : `第 ${task.completedBatches} 批分层分析`}已完成，可以继续阅读。`
        : `${task.filename} 的分析暂未完成：${task.error ?? "请重新打开书源重试"}。`;
      setManuscriptTaskNotice(message);
      window.setTimeout(() => setManuscriptTaskNotice(null), 8_000);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("二流小说家 · 书源分析", { body: message });
      }
    }
  }, []);

  const requestManuscriptStop = useCallback(() => {
    setManuscriptTask((current) => current && current.status === "running" && current.runMode === "auto"
      ? { ...current, stopRequested: true }
      : current);
  }, []);

  const runForecast = async (selection: ForecastRunSelection) => {
    if (forecastRequestLockRef.current || !activeWorld || !activeStory || !interactiveState) return;
    const sourceBranchId = interactiveState.activeBranchId;
    const sourceTurn = interactiveState.turns.find((turn) => turn.id === selection.sourceTurnId);
    if (!sourceTurn) {
      setForecastError("invalid_request");
      return;
    }
    const sourceLineageIds = new Set<string>();
    let lineageTurn: typeof sourceTurn | undefined = sourceTurn;
    while (lineageTurn && !sourceLineageIds.has(lineageTurn.id)) {
      sourceLineageIds.add(lineageTurn.id);
      lineageTurn = lineageTurn.parentId ? interactiveState.turns.find((turn) => turn.id === lineageTurn!.parentId) : undefined;
    }
    const visibleAtSource = (item: { sourceTurnId?: string; sourceStoryId?: string }) =>
      !item.sourceTurnId || (item.sourceStoryId === activeStory.id && sourceLineageIds.has(item.sourceTurnId));
    const actorNodes = selection.actorNodeIds.map((nodeId) => activeWorld.nodes.find((node) => node.id === nodeId && visibleAtSource(node)));
    if (actorNodes.some((node) => !isCharacterNode(node))) {
      setForecastError("invalid_request");
      return;
    }
    forecastRequestLockRef.current = true;
    setForecastPending(true);
    setForecastError(null);
    try {
      const memory = composeForecastMemoryAtTurn(
        interactiveState,
        sourceBranchId,
        selection.sourceTurnId,
        selection.event,
        selection.actorNodeIds,
      );
      const visibleWorldNodes = activeWorld.nodes.filter(visibleAtSource);
      const generated = await runForecastSandbox({
        storyId: activeStory.id,
        storyTitle: activeStory.title,
        genre: activeWorld.genre,
        sourceBranchId,
        sourceTurnId: selection.sourceTurnId,
        sourceScene: sourceTurn.scene,
        event: selection.event,
        publicFacts: activeWorld.facts.filter((fact) => fact.status === "accepted").slice(-20).map((fact) => fact.statement),
        worldNodes: visibleWorldNodes.map((node) => ({ id: node.id, label: node.label, kind: node.kind })),
        actors: actorNodes.map((node) => {
          const characterNode = node as WorldNode & { character: CharacterProfile };
          const visibleRelations = activeWorld.edges.filter((edge) => visibleAtSource(edge) && (edge.source === characterNode.id || edge.target === characterNode.id)).slice(0, 12).map((edge) => {
            const targetId = edge.source === characterNode.id ? edge.target : edge.source;
            const target = activeWorld.nodes.find((candidate) => candidate.id === targetId);
            return `${edge.source === characterNode.id ? "主动" : "被动"}${edge.label}${target?.label ?? targetId}`;
          });
          const knownMemories = memory.retrievedLedger.filter((entry) => entry.relevantNodeIds.includes(characterNode.id)).slice(-12).map((entry) => `${entry.kind}/${entry.key}：${entry.value}（${entry.status}）`);
          return {
            nodeId: characterNode.id,
            name: characterNode.label,
            role: characterNode.character.role,
            profileSummary: [characterNode.character.tagline, ...characterNode.character.fields.map((field) => `${field.label}：${field.value}`)].join("\n"),
            visibleRelations,
            knownMemories,
          };
        }),
      });
      setForecastSandboxes((current) => [...current, generated]);
      setTurnRuntimeModel(generated.trace.model);
    } catch (caught) {
      setForecastError(worldLabErrorMessage(worldLabErrorCode(caught), caught));
    } finally {
      setForecastPending(false);
      forecastRequestLockRef.current = false;
    }
  };

  const convertForecast = (sandboxId: string, trajectoryId: string) => {
    if (!activeStoryId || !interactiveState) return;
    const sandbox = forecastSandboxes.find((item) => item.id === sandboxId);
    if (!sandbox) return;
    const next = convertForecastTrajectoryToBranch(interactiveState, sandbox, trajectoryId);
    setInteractiveStories((current) => ({ ...current, [activeStoryId]: next }));
    setSelectedTurnId(next.branches.find((branch) => branch.id === next.activeBranchId)!.headTurnId);
  };

  const runDirectorProposal = async (userRequest: string, selectedNodeIds: string[], referenceMaterials: string[] = []) => {
    if (directorRequestLockRef.current || !activeWorld || !activeStory || !activeInteractiveState || !userRequest.trim()) return;
    const sourceBranchId = activeInteractiveState.activeBranchId;
    const sourceTurnId = currentHeadId(activeInteractiveState);
    const sourceTurn = activeInteractiveState.turns.find((turn) => turn.id === sourceTurnId);
    if (!sourceTurn) return;
    const sparseMemory = composeBranchSparseMemory(activeInteractiveState, sourceBranchId, userRequest, selectedNodeIds);
    const selected = selectedNodeIds.length > 0
      ? directorCandidateNodes.filter((node) => selectedNodeIds.includes(node.id))
      : directorCandidateNodes;
    const nodesForProposal = selected.length > 0 ? selected : directorCandidateNodes;
    directorRequestLockRef.current = true;
    setDirectorPending(true);
    setDirectorError(null);
    try {
      const generated = await proposeStoryDirector({
        storyId: activeStory.id,
        storyTitle: activeStory.title,
        genre: activeWorld.genre,
        sourceBranchId,
        sourceTurnId,
        currentScene: sourceTurn.scene,
        userRequest: userRequest.trim(),
        candidateNodes: nodesForProposal.map((node) => ({ id: node.id, label: node.label, kind: node.kind, summary: node.summary })),
        unresolvedThreads: directorUnresolvedThreads,
        recentScenes: sparseMemory.recentScenes.map((scene) => `${scene.action}：${scene.scene}`),
        activeProposals: activeDirectorProposals.filter((proposal) => proposal.status === "pending").slice(-8).map((proposal) => `${proposal.title}：${proposal.proposal}`),
        referenceMaterials,
      });
      const proposal: StoryDirectorProposal = {
        id: `director-${activeStory.id}-${Date.now().toString(36)}`,
        storyId: activeStory.id,
        sourceBranchId,
        sourceTurnId,
        userRequest: userRequest.trim(),
        ...generated,
        involvedNodeIds: [...generated.involvedNodeIds],
        guardrails: [...generated.guardrails],
        ...(referenceMaterials.length > 0 ? { referenceMaterials: [...referenceMaterials] } : {}),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      setWorlds((current) => current.map((world) => world.id === activeWorld.id
        ? { ...world, directorProposals: [...(world.directorProposals ?? []), proposal].slice(-5_000) }
        : world));
      setTurnRuntimeModel(generated.trace.model);
    } catch (error) {
      const code = worldLabErrorCode(error);
      setDirectorError(worldLabErrorMessage(
        code === "provider_timeout"
          ? "导演台本回合超时了，提案没有写入；可以稍后重试。"
          : code === "provider_rate_limited"
            ? "模型网关正在限流，提案没有写入；稍等一下再试。"
          : code === "invalid_runtime_output"
            ? "模型没有返回可验收的提案，正文和正史都没有改变。"
            : "导演台暂时无法连接模型，提案没有写入。",
        error));
    } finally {
      setDirectorPending(false);
      directorRequestLockRef.current = false;
    }
  };

  const runDirectorLibrary = async (kind: DirectorLibraryKind, userInput: string, selectedNodeIds: string[], jokeIntent?: DirectorJokeIntent) => {
    if (directorLibraryRequestLockRef.current || !activeWorld || !activeStory || !activeInteractiveState || !userInput.trim()) return;
    const sourceBranchId = activeInteractiveState.activeBranchId;
    const sourceTurnId = currentHeadId(activeInteractiveState);
    const sourceTurn = activeInteractiveState.turns.find((turn) => turn.id === sourceTurnId);
    if (!sourceTurn) return;
    const sparseMemory = composeBranchSparseMemory(activeInteractiveState, sourceBranchId, userInput, selectedNodeIds);
    const selected = selectedNodeIds.length > 0
      ? directorCandidateNodes.filter((node) => selectedNodeIds.includes(node.id))
      : directorCandidateNodes;
    const nodesForLibrary = selected.length > 0 ? selected : directorCandidateNodes;
    directorLibraryRequestLockRef.current = true;
    setDirectorLibraryPending(true);
    setDirectorLibraryError(null);
    try {
      const generated = await distillDirectorLibrary({
        kind,
        storyId: activeStory.id,
        storyTitle: activeStory.title,
        genre: activeWorld.genre,
        sourceBranchId,
        sourceTurnId,
        currentScene: sourceTurn.scene,
        userInput: userInput.trim(),
        selectedNodeIds,
        candidateNodes: nodesForLibrary.map((node) => ({ id: node.id, label: node.label, kind: node.kind, summary: node.summary })),
        recentScenes: sparseMemory.recentScenes.map((scene) => `${scene.action}：${scene.scene}`),
        ...(kind === "joke" ? { jokeIntent: jokeIntent ?? "library_only" } : {}),
      });
      const createdAt = new Date().toISOString();
      const id = `director-${kind}-${activeStory.id}-${Date.now().toString(36)}`;
      if (generated.kind === "knowledge") {
        const card: DirectorKnowledgeCard = { id, storyId: activeStory.id, ...generated, status: "active", createdAt };
        setDirectorKnowledgeCards((current) => [...current, card].slice(-5_000));
      } else if (generated.kind === "craft") {
        const card: DirectorCraftCard = { id, storyId: activeStory.id, ...generated, status: "active", createdAt };
        setDirectorCraftCards((current) => [...current, card].slice(-5_000));
      } else {
        const card: DirectorJokeCard = { id, storyId: activeStory.id, ...generated, status: "active", createdAt };
        setDirectorJokeCards((current) => [...current, card].slice(-5_000));
      }
      setTurnRuntimeModel(generated.trace.model);
    } catch (error) {
      const code = worldLabErrorCode(error);
      setDirectorLibraryError(worldLabErrorMessage(
        code === "provider_timeout"
          ? "资料整理超时了，辅助库没有写入；可以稍后重试。"
          : code === "provider_rate_limited"
            ? "模型网关正在限流，辅助库没有写入；稍等一下再试。"
          : code === "invalid_runtime_output"
            ? "模型没有返回可验收的资料卡，正文和正史都没有改变。"
            : "导演台暂时无法连接模型，辅助库没有写入。",
        error));
    } finally {
      setDirectorLibraryPending(false);
      directorLibraryRequestLockRef.current = false;
    }
  };

  const updateDirectorProposalStatus = (proposalId: string, status: StoryDirectorProposal["status"]) => {
    if (!activeWorld) return;
    setWorlds((current) => current.map((world) => world.id === activeWorld.id
      ? { ...world, directorProposals: (world.directorProposals ?? []).map((proposal) => proposal.id === proposalId ? { ...proposal, status } : proposal) }
      : world));
  };

  const updateDirectorLibraryCardStatus = (kind: DirectorLibraryKind, cardId: string, status: DirectorLibraryCardStatus) => {
    if (kind === "knowledge") setDirectorKnowledgeCards((current) => current.map((card) => card.id === cardId ? { ...card, status } : card));
    if (kind === "craft") setDirectorCraftCards((current) => current.map((card) => card.id === cardId ? { ...card, status } : card));
    if (kind === "joke") setDirectorJokeCards((current) => current.map((card) => card.id === cardId ? { ...card, status } : card));
  };

  const addStory = () => {
    if (!activeWorld) return;
    const story = createSiblingStory(activeWorld);
    setWorlds((current) =>
      current.map((world) => (world.id === activeWorld.id ? { ...world, stories: [...world.stories, story] } : world)),
    );
    setActiveStoryId(story.id);
    setInteractiveStories((current) => ({ ...current, [story.id]: createInteractiveStory(activeWorld, story) }));
    setSelectedTurnId("turn-0");
    setWorkspaceMode("write");
  };

  const deleteStory = (world: WorldRecord, story: StoryRecord) => {
    const confirmed = window.confirm(`确定删除“${story.title}”吗？只会删除这本书及其分支，不会删除同世界的其他书。`);
    if (!confirmed) return;
    const remainingStories = world.stories.filter((item) => item.id !== story.id);
    const remainingStoryIds = new Set(remainingStories.map((item) => item.id));
    const nextWorld: WorldRecord = {
      ...world,
      stories: remainingStories,
      nodes: world.nodes
        .map((node) => ({ ...node, storyIds: node.storyIds.filter((storyId) => storyId !== story.id) }))
        .filter((node) => node.storyIds.length > 0),
      edges: world.edges
        .map((edge) => ({ ...edge, storyIds: edge.storyIds.filter((storyId) => storyId !== story.id) }))
        .filter((edge) => edge.storyIds.length > 0),
      facts: world.facts
        .map((fact) => ({ ...fact, storyIds: fact.storyIds.filter((storyId) => remainingStoryIds.has(storyId)) }))
        .filter((fact) => fact.storyIds.length > 0),
      directorProposals: (world.directorProposals ?? []).filter((proposal) => proposal.storyId !== story.id),
    };
    setWorlds((current) => current.map((item) => item.id === world.id ? nextWorld : item));
    setInteractiveStories((current) => {
      const next = { ...current };
      delete next[story.id];
      return next;
    });
    setForecastSandboxes((current) => current.filter((sandbox) => sandbox.sourceStoryId !== story.id));
    if (story.id !== activeStoryId) return;
    const nextStory = remainingStories[0] ?? null;
    setActiveStoryId(nextStory?.id ?? null);
    setSelectedTurnId(nextStory ? currentHeadId(interactiveStories[nextStory.id]) : "turn-0");
    setSelectedNodeId(null);
    setCharacterCardNodeId(null);
    setShowExport(false);
    setWorkspaceMode("write");
  };

  const addWorld = () => {
    const world = createBlankWorld(worlds.length + 1);
    setWorlds((current) => [...current, world]);
    setActiveWorldId(world.id);
    setActiveStoryId(world.stories[0]?.id ?? null);
    setSelectedNodeId(null);
    setCharacterCardNodeId(null);
    setSelectedTurnId("turn-0");
    setWorkspaceMode("write");
  };

  const deleteWorld = (world: WorldRecord) => {
    const confirmed = window.confirm(`确定删除“${world.title}”吗？其中的小说、关系图谱和相关本机草稿会被移除；原始书源不会删除。`);
    if (!confirmed) return;
    const storyIds = new Set(world.stories.map((story) => story.id));
    setWorlds((current) => current.filter((item) => item.id !== world.id));
    setInteractiveStories((current) => Object.fromEntries(Object.entries(current).filter(([storyId]) => !storyIds.has(storyId))));
    setForecastSandboxes((current) => current.filter((sandbox) => !storyIds.has(sandbox.sourceStoryId)));

    if (world.id !== activeWorldId) return;
    const remaining = worlds.filter((item) => item.id !== world.id);
    const nextWorld = remaining[0] ?? null;
    setActiveWorldId(nextWorld?.id ?? null);
    setActiveStoryId(nextWorld?.stories[0]?.id ?? null);
    setSelectedNodeId(null);
    setCharacterCardNodeId(null);
    setSelectedTurnId(nextWorld?.stories[0] ? currentHeadId(interactiveStories[nextWorld.stories[0].id]) : "turn-0");
    setShowExport(false);
    if (!nextWorld) setPhase("scene");
  };

  const selectWorld = (world: WorldRecord) => {
    setActiveWorldId(world.id);
    setActiveStoryId(world.stories[0]?.id ?? null);
    setSelectedNodeId(null);
    setShowExport(false);
    setCharacterCardNodeId(null);
    setWorkspaceMode("write");
    const story = world.stories[0];
    if (story && world.nodes.length > 0) {
      setInteractiveStories((current) => current[story.id] ? current : { ...current, [story.id]: createInteractiveStory(world, story) });
      setSelectedTurnId(currentHeadId(interactiveStories[story.id]));
    }
  };

  const setFactStatus = (factId: string, status: FactStatus) => {
    if (!activeWorld) return;
    setWorlds((current) => current.map((world) => (world.id === activeWorld.id ? updateFact(world, factId, status) : world)));
  };

  const approveAllCandidateFacts = () => {
    if (!activeWorld || !activeStoryId) return;
    const candidateFacts = activeWorld.facts.filter((fact) => fact.status === "candidate" && fact.storyIds.includes(activeStoryId));
    if (candidateFacts.length === 0) return;
    setWorlds((current) => current.map((world) => {
      if (world.id !== activeWorld.id) return world;
      return world.facts
        .filter((fact) => fact.status === "candidate" && fact.storyIds.includes(activeStoryId))
        .reduce((next, fact) => updateFact(next, fact.id, "accepted"), world);
    }));
    setCanonApprovalNotice(`已将 ${candidateFacts.length} 条候选事实写入正史，并同步角色卡。`);
  };

  const updateGraphTuning = (key: keyof GraphTuning, value: number) => {
    setGraphTuning((current) => ({ ...current, [key]: value }));
  };

  const resetGraph = () => {
    setGraphTuning({ ...DEFAULT_GRAPH_TUNING });
    setGraphResetToken((value) => value + 1);
  };

  const selectGraphNode = (nodeId: string) => {
    if (nodeId.startsWith("branch-turn:")) {
      setSelectedNodeId(null);
      setCharacterCardNodeId(null);
      setSelectedTurnId(nodeId.slice("branch-turn:".length));
      return;
    }
    const node = activeWorld?.nodes.find((item) => item.id === nodeId);
    setSelectedNodeId(nodeId);
    setCharacterCardNodeId(isCharacterNode(node) ? nodeId : null);
  };

  const selectStory = (world: WorldRecord, story: StoryRecord) => {
    setActiveStoryId(story.id);
    setWorkspaceMode("write");
    const existing = interactiveStories[story.id];
    if (existing) {
      setSelectedTurnId(currentHeadId(existing));
      return;
    }
    if (world.nodes.length > 0) {
      const state = createInteractiveStory(world, story);
      setInteractiveStories((current) => ({ ...current, [story.id]: state }));
      setSelectedTurnId("turn-0");
    }
  };

  const advanceInteractive = async (selection: Parameters<typeof selectedActionFor>[1]) => {
    if (turnRequestLockRef.current || !activeStoryId || !interactiveState || !activeWorld || !activeStory) return;
    const { action, parent } = selectedActionFor(interactiveState, selection);
    turnRequestLockRef.current = true;
    setTurnPending(true);
    setStreamingScene("");
    setTurnRuntimeError(null);
    try {
      const visibleRuntimeWorldNodes = activeWorld.nodes.filter(isVisibleOnActiveBranch);
      const branchText = branchPath(interactiveState).slice(-12).map((turn) => `${turn.selectedAction ?? ""} ${turn.scene}`).join(" ");
      const acceptedCanonNodeIds = new Set(
        activeWorld.facts
          .filter((fact) => fact.status === "accepted" && fact.storyIds.includes(activeStoryId))
          .flatMap((fact) => factTargetNodeIds(activeWorld, fact)),
      );
      const pendingProposalNodeIds = new Set(
        (activeWorld.directorProposals ?? [])
          .filter((proposal) => proposal.storyId === activeStoryId && proposal.status === "pending" && activeBranchTurnIds.has(proposal.sourceTurnId))
          .flatMap((proposal) => proposal.involvedNodeIds),
      );
      const activeThreadNodeIds = new Set(
        foldNarrativeLedger(interactiveState, interactiveState.activeBranchId)
          .filter((entry) => entry.status === "active" && (entry.kind === "foreshadowing" || entry.kind === "promise"))
          .flatMap((entry) => entry.relevantNodeIds),
      );
      const rankedRuntimeNodes = visibleRuntimeWorldNodes
        .map((node, index) => {
          const mentionedNow = action.includes(node.label) || parent.scene.includes(node.label);
          const mentionedRecently = branchText.includes(node.label);
          const score = (mentionedNow ? 1_000 : 0)
            + (mentionedRecently ? 120 : 0)
            + (acceptedCanonNodeIds.has(node.id) ? 90 : 0)
            + (pendingProposalNodeIds.has(node.id) ? 85 : 0)
            + (activeThreadNodeIds.has(node.id) ? 100 : 0)
            + (node.storyIds.includes(activeStoryId) ? 35 : 0)
            + (node.id === "protagonist" || node.id === "writer" ? 70 : 0)
            + (node.kind === "character" ? 25 : 0)
            - index / 10;
          return { node, score };
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_RUNTIME_NODES_PER_TURN)
        .map(({ node }) => ({ id: node.id, label: node.label, kind: node.kind }));
      const runtimeNodeIds = new Set(rankedRuntimeNodes.map((node) => node.id));
      const relevantNodeIds = rankedRuntimeNodes
        .filter((node) => action.includes(node.label) || parent.scene.includes(node.label))
        .map((node) => node.id);
      const turnInput = {
        storyTitle: activeStory?.title ?? "未命名故事",
        genre: activeWorld.genre,
        currentScene: `${parent.scene}${activeStory.continuationContext ? `\n\n续写参考原文（仅作上下文，不进入正文）：\n${activeStory.continuationContext.excerpt}` : ""}`.slice(0, 9_000),
        selectedAction: action,
        depth: parent.depth,
        nodes: rankedRuntimeNodes,
        accumulatedPreferences: branchPath(interactiveState).flatMap((turn) => turn.preferenceSignals),
        branchMemory: (() => {
          const memory = composeBranchSparseMemory(interactiveState, interactiveState.activeBranchId, `${parent.scene} ${action}`, relevantNodeIds);
          const acceptedCanonFacts = activeWorld.facts
            .filter((fact) => fact.status === "accepted" && fact.storyIds.includes(activeStoryId))
            .flatMap((fact) => factTargetNodeIds(activeWorld, fact)
              .filter((nodeId) => runtimeNodeIds.has(nodeId))
              .map((nodeId) => ({ targetNodeId: nodeId, label: "正史事实", value: fact.statement, sourceTurnId: `canon-${fact.id}` })));
          const worldCanonThreads = activeWorld.facts
            .filter((fact) => fact.status === "accepted" && fact.storyIds.includes(activeStoryId) && factTargetNodeIds(activeWorld, fact).length === 0)
            .slice(-3)
            .map((fact) => `正史事实：${fact.statement}`);
          const directorPlans = (activeWorld.directorProposals ?? [])
            .filter((proposal) => proposal.storyId === activeStoryId && activeBranchTurnIds.has(proposal.sourceTurnId) && proposal.status === "pending")
            .slice(-8)
            .map((proposal) => `作者导演待定提案：${proposal.title}；时机：${proposal.timing}；铺垫：${proposal.setup}；回收：${proposal.payoff}`);
          return {
            ...memory,
            facts: [...memory.facts.filter((fact) => runtimeNodeIds.has(fact.targetNodeId)), ...acceptedCanonFacts].slice(-24),
            retrievedLedger: memory.retrievedLedger.map((entry) => ({ ...entry, relevantNodeIds: entry.relevantNodeIds.filter((nodeId) => runtimeNodeIds.has(nodeId)) })),
            openThreads: [...worldCanonThreads, ...memory.openThreads, ...directorPlans].slice(0, 5),
          };
        })(),
      };
      const generated = typeof generateWorldLabTurnStream === "function"
        ? await generateWorldLabTurnStream(turnInput, (chunk) => setStreamingScene((current) => current + chunk))
        : await generateWorldLabTurn(turnInput);
      const next = appendGeneratedInteractiveTurn(interactiveState, selection, generated);
      const worldWithDiscoveries = appendDiscoveries(
        activeWorld,
        activeStoryId,
        interactiveState.nextTurnSequence,
        `turn-${interactiveState.nextTurnSequence}`,
        generated.discoveries,
      );
      setWorlds((current) => current.map((world) => world.id === activeWorld.id ? worldWithDiscoveries : world));
      setInteractiveStories((current) => ({ ...current, [activeStoryId]: next }));
      setSelectedTurnId(next.branches.find((branch) => branch.id === next.activeBranchId)!.headTurnId);
      setTurnRuntimeModel(generated.trace.model);
    } catch (error) {
      const code = worldLabErrorCode(error);
      setTurnRuntimeError(worldLabErrorMessage(
        code === "authentication_required" || code === "compliance_blocked"
          ? "请先点击页面顶部的“真实委托”，完成本机体验准入后再回来生成。"
          : code === "provider_timeout"
            ? "公司模型本回合超时，故事没有前进；可以原样重试。"
            : code === "provider_rate_limited"
              ? "模型网关限流了，本回合没有写入；稍等一下再试，其他功能不会被锁死。"
            : code === "invalid_request"
              ? "推进请求未通过字段校验，模型尚未调用"
            : code === "provider_connection_reset" || code === "provider_unavailable"
              ? "本机模型连接刚刚中断，故事没有前进；原选择仍在，可以直接重试。"
            : "公司模型本回合没有返回可验证结果，故事没有前进，也没有使用固定模板顶替。",
        error));
    } finally {
      setTurnPending(false);
      setStreamingScene("");
      turnRequestLockRef.current = false;
    }
  };

  const forkInteractive = (turnId: string) => {
    if (!activeStoryId || !interactiveState) return;
    const next = forkInteractiveBranch(interactiveState, turnId);
    setInteractiveStories((current) => ({ ...current, [activeStoryId]: next }));
    setSelectedTurnId(turnId);
  };

  const switchBranch = (branchId: string) => {
    if (!activeStoryId || !interactiveState) return;
    const next = switchInteractiveBranch(interactiveState, branchId);
    setInteractiveStories((current) => ({ ...current, [activeStoryId]: next }));
    setSelectedTurnId(next.branches.find((branch) => branch.id === branchId)!.headTurnId);
  };

  const createCheckpoint = (turnId: string, title: string) => {
    if (!activeStoryId || !interactiveState) return;
    const next = createStoryCheckpoint(interactiveState, turnId, title);
    setInteractiveStories((current) => ({ ...current, [activeStoryId]: next }));
  };

  const forkCheckpoint = (checkpointId: string) => {
    if (!activeStoryId || !interactiveState) return;
    const next = forkFromCheckpoint(interactiveState, checkpointId);
    setInteractiveStories((current) => ({ ...current, [activeStoryId]: next }));
    setSelectedTurnId(next.branches.find((branch) => branch.id === next.activeBranchId)!.headTurnId);
  };

  const renameBranch = (branchId: string, title: string) => {
    if (!activeStoryId || !interactiveState) return;
    const next = renameInteractiveBranch(interactiveState, branchId, title);
    setInteractiveStories((current) => ({ ...current, [activeStoryId]: next }));
  };

  const uploadCharacterPortrait = async (file: File): Promise<string | null> => {
    if (!isCharacterNode(characterCardNode) || !activeWorld) return "当前没有可写入的角色卡。";
    if (!file.type.startsWith("image/")) return "请选择图片文件。";
    if (file.size > 5 * 1024 * 1024) return "图片超过 5 MB，请压缩后再试。";
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid image"));
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) return "图片读取失败，请换一张再试。";
    setWorlds((current) => current.map((world) => world.id !== activeWorld.id ? world : {
      ...world,
      nodes: world.nodes.map((node) => node.id !== characterCardNode.id || !node.character ? node : {
        ...node,
        character: {
          ...node.character,
          portrait: { url: dataUrl, alt: `${node.label}的角色形象`, source: "upload", filename: file.name },
        },
      }),
    }));
    return null;
  };

  const generateCharacterPortraitImage = async (prompt: string): Promise<string | null> => {
    if (!isCharacterNode(characterCardNode) || !activeWorld) return "当前没有可写入的角色卡。";
    try {
      const generated = await generateCharacterPortrait(prompt);
      setWorlds((current) => current.map((world) => world.id !== activeWorld.id ? world : {
        ...world,
        nodes: world.nodes.map((node) => node.id !== characterCardNode.id || !node.character ? node : {
          ...node,
          character: {
            ...node.character,
            portrait: { url: generated.imageUrl, alt: `${node.label}的角色形象`, source: "generated" },
          },
        }),
      }));
      return null;
    } catch (error) {
      const code = error instanceof Error ? error.message : "provider_unavailable";
      return code === "provider_timeout" || code === "image_job_poll_timeout"
        ? "图像生成仍在后台处理或已超时，角色卡没有改变，可以稍后查看或重试；你不需要切换模型。"
        : "图像生成暂时不可用，角色卡没有改变；你不需要切换模型。";
    }
  };

  const renderGraphViewport = (
    ariaLabel: string,
    className: string | undefined,
    onLayoutFrame?: (nodes: ReadonlyArray<GraphNodeState>) => void,
    viewportNodes = graphNodes,
    viewportEdges = graphEdges,
    onViewportNodeSelect = selectGraphNode,
  ) => graphQuality.renderer === "sigma" ? (
    <ForceGraphSigma ariaLabel={ariaLabel} className={className} colors={GRAPH_COLORS} edges={viewportEdges} nodes={viewportNodes} onNodeSelect={onViewportNodeSelect} quality={graphQuality} selectedNodeId={selectedNodeId} theme="light" />
  ) : (
    <ForceGraphSvg {...(onLayoutFrame ? { onLayoutFrame } : {})} ariaLabel={ariaLabel} className={className} colors={GRAPH_COLORS} edges={viewportEdges} nodes={viewportNodes} onNodeSelect={onViewportNodeSelect} resetToken={graphResetToken} selectedNodeId={selectedNodeId} theme="light" tuning={graphTuning} typeLabels={KIND_LABEL} />
  );

  if (phase !== "workspace") {
    return (
      <main className={styles.opening} data-testid="world-lab-page">
        <div className={styles.openingBackdrop} aria-hidden="true">
          <span className={styles.windowFrame} />
          <span className={styles.desk} />
          <span className={styles.paperStack} />
        </div>
        <header className={styles.openingHeader}>
          <Link href="/vnext">二流小说家</Link>
          {worlds.length > 0 ? <button onClick={() => setPhase("workspace")} type="button">返回当前故事</button> : null}
          <span>真实委托入口 · 世界生长实验</span>
        </header>
        <section className={styles.openingStage}>
          <p className={styles.kicker}>{phase === "scene" ? "深夜 01:17" : "他把稿纸翻到背面"}</p>
          <h1>{phase === "scene" ? "今晚想从哪一种命运醒来？" : "第一章，你想先得到什么？"}</h1>
          <p className={styles.writerLine}>
            {phase === "scene"
              ? "“我写得可能一般。但你选中的东西，我会认真记住。”"
              : `“${OPENING_CHOICES.find((item) => item.id === openingId)?.scene ?? "好。"} 接下来别按套路答。”`}
          </p>
          {phase === "scene" ? (
            <section className={styles.realCommissionCard} aria-labelledby="real-commission-heading">
              <div>
                <span>公司模型 · 真实生成</span>
                <h2 id="real-commission-heading">先把你真正想看的故事交给小说家</h2>
                <p>从一句模糊念头开始，经过理解与写作，真稿会保存到当前会话；这里不收 API Key。</p>
              </div>
              <Link href="/vnext">开始一次真实委托 <span aria-hidden="true">→</span></Link>
            </section>
          ) : null}
          {phase === "scene" ? (
            <button className={styles.manuscriptEntry} onClick={() => { setResumeManuscriptId(null); setShowManuscriptImport(true); }} type="button">
              <span>已经写了一部分？</span>
              <strong>导入 TXT / Markdown，让模型接着分析与续写 <span aria-hidden="true">→</span></strong>
            </button>
          ) : null}
          {phase === "scene" ? (
            <div className={styles.experimentDivider} role="separator">
              <span>或者先用样例体验图谱与分支</span>
            </div>
          ) : null}
          <div className={styles.choiceGrid}>
            {(phase === "scene" ? OPENING_CHOICES : TONE_CHOICES).map((choice, index) => (
              <button
                key={choice.id}
                className={styles.sceneChoice}
                onClick={() =>
                  phase === "scene" ? chooseOpening(choice.id as OpeningId) : finishOpening(choice.id as ToneId)
                }
                type="button"
              >
                <span>0{index + 1}</span>
                <strong>{choice.title}</strong>
                <p>{"scene" in choice ? choice.scene : choice.copy}</p>
              </button>
            ))}
          </div>
          {phase === "tone" ? (
            <button className={styles.backButton} onClick={() => setPhase("scene")} type="button">
              返回上一幕
            </button>
          ) : null}
        </section>
        <ManuscriptImportDialog backgroundTask={manuscriptTask} initialAnalysis={resumeAnalysis} initialManuscript={resumeManuscript} onManuscriptRead={persistManuscriptProgress} onProgress={persistManuscriptProgress} onTaskChange={handleManuscriptTaskChange} open={showManuscriptImport} onClose={() => { setShowManuscriptImport(false); }} onConfirm={confirmManuscriptImport} />
      </main>
    );
  }

  return (
    <main className={styles.workspace} data-mode={workspaceMode} data-testid="world-lab-page">
      <div className={styles.workspaceGrid} data-mode={workspaceMode}>
        <aside className={styles.library} aria-label="小说与世界">
          <div className={styles.libraryIdentity}>
            <div><Link href="/vnext" className={styles.brand}>二流小说家</Link><span className={styles.prototypeBadge}>交互原型</span></div>
            <small>写作台 · 正文优先</small>
          </div>
          <div className={styles.libraryActions}>
            <span className={styles.draftStatus}>
              {draftStatus === "saving" ? "正在保存本机草稿…" : draftStatus === "saved" ? "本机草稿已自动保存" : draftStatus === "loading" ? "正在恢复本机草稿…" : "本机草稿暂不可用"}
            </span>
            <div className={styles.libraryActionGrid}>
              <button className={styles.libraryActionPrimary} onClick={() => { setResumeManuscriptId(null); setShowManuscriptImport(true); }} title="导入 TXT / Markdown 小说，提取世界、人物与写法证据" type="button">分析书源内容</button>
              <button aria-haspopup="dialog" className={styles.libraryActionKnowledge} onClick={() => setShowKnowledgeLibrary(true)} title="打开写法库、世界知识库与梗库" type="button">知识库</button>
              <button onClick={() => setShowExport((current) => !current)} type="button">Quartz 导出</button>
              <button onClick={() => { setForecastError(null); setShowForecastSandbox(true); }} type="button">剧情推演</button>
              <button className={styles.newStoryButton} onClick={() => { setOpeningId(null); setPhase("scene"); }} type="button">新故事</button>
            </div>
            {manuscriptTask ? (
              <div className={styles.manuscriptTaskDock}>
                <button
                  className={styles.manuscriptTaskButton}
                  data-state={manuscriptTask.status}
                  onClick={() => { setResumeManuscriptId(manuscriptTask.manuscriptId); setShowManuscriptImport(true); }}
                  title={manuscriptTask.status === "failed" ? manuscriptTask.error ?? "书源分析失败，打开查看详情" : undefined}
                  type="button"
                >
                  {manuscriptTask.status === "running"
                    ? `${manuscriptTask.runMode === "auto" ? "自动分析中" : "书源分析中"} · ${manuscriptTask.stage === "overview" ? "概览" : `${manuscriptTask.completedBatches}/${manuscriptTask.totalBatches} 批`}`
                    : manuscriptTask.status === "completed"
                      ? manuscriptTask.stopRequested && manuscriptTask.completedBatches < manuscriptTask.totalBatches
                        ? `已按请求暂停 · ${manuscriptTask.completedBatches}/${manuscriptTask.totalBatches} 批`
                        : "书源分析已完成 · 查看"
                      : "书源分析失败 · 查看"}
                </button>
                {manuscriptTask.status === "running" && manuscriptTask.runMode === "auto" ? (
                  <button
                    className={styles.manuscriptStopButton}
                    disabled={manuscriptTask.stopRequested === true}
                    onClick={requestManuscriptStop}
                    type="button"
                  >
                    {manuscriptTask.stopRequested ? "等待当前批完成" : "当前批完成后停止"}
                  </button>
                ) : null}
              </div>
            ) : null}
            <LocalDistillationProgress enabled={localDistillationProgressEnabled} />
          </div>
          {manuscriptTaskNotice ? <div aria-live="polite" className={styles.manuscriptTaskNotice} role="status">{manuscriptTaskNotice}</div> : null}
          <nav aria-label="工作区模式" className={styles.workspaceNavigation}>
            <div className={styles.workspaceNavigationLabel}>当前工作区</div>
            <div className={styles.workspaceNavigationTabs}>
              {([
                ["write", "正文", "看当前场景并继续写"],
                ["branches", "走线", "管理分支与存档"],
                ["director", "导演台", "安排未来剧情"],
                ["graph", "知识图谱", "探索人物与世界"],
                ["canon", "正史", "审核已经发生的事实"],
              ] as const).map(([mode, label, hint]) => (
                <button
                  aria-current={workspaceMode === mode ? "page" : undefined}
                  data-active={workspaceMode === mode}
                  key={mode}
                  onClick={() => {
                    setWorkspaceMode(mode);
                    if (mode === "graph") setRailView("graph");
                    if (mode === "canon") setRailView("canon");
                    setSelectedNodeId(null);
                    setCharacterCardNodeId(null);
                  }}
                  title={hint}
                  type="button"
                >
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
            <span className={styles.workspaceModeHint}>
              {workspaceMode === "write" ? "当前任务：继续正文" : workspaceMode === "branches" ? "当前任务：整理走线" : workspaceMode === "director" ? "当前任务：安排后续" : workspaceMode === "graph" ? "当前任务：探索世界" : "当前任务：确认正史"}
            </span>
          </nav>
          <div className={styles.sectionHeading}>
            <div>
              <span>创作空间</span>
              <strong>{worlds.length} 个世界</strong>
            </div>
            <button onClick={addWorld} type="button" aria-label="新建世界">＋</button>
          </div>
          <div className={styles.worldList}>
            {worlds.map((world) => (
              <section key={world.id} className={styles.worldGroup} data-active={world.id === activeWorldId}>
                <button className={styles.worldButton} onClick={() => selectWorld(world)} type="button">
                  <span>{world.genre}</span>
                  <strong>{world.title}</strong>
                </button>
                <button
                  aria-label={`删除世界 ${world.title}`}
                  className={styles.deleteWorldButton}
                  onClick={(event) => { event.stopPropagation(); deleteWorld(world); }}
                  title="删除这个世界"
                  type="button"
                >
                  ×
                </button>
                {world.id === activeWorldId ? (
                  <div className={styles.storyList}>
                    {world.stories.map((story) => (
                      <div className={styles.storyListItem} key={story.id}>
                        <button
                          data-active={story.id === activeStoryId}
                          onClick={() => selectStory(world, story)}
                          type="button"
                        >
                          {story.title}
                        </button>
                        <button
                          aria-label={`删除小说 ${story.title}`}
                          className={styles.deleteStoryButton}
                          onClick={(event) => { event.stopPropagation(); deleteStory(world, story); }}
                          title="删除这本书"
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button className={styles.addStory} onClick={addStory} type="button">＋ 同世界开新书</button>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          {workspaceMode === "graph" ? (
            <section aria-label="图谱工具" className={styles.graphFocusTools}>
              <header>
                <span>当前视图</span>
                <strong>图谱工具</strong>
              </header>
              <div className={styles.graphFocusScope} aria-label="图谱范围">
                <button data-active={graphScope === "chapter"} onClick={() => setGraphScope("chapter")} type="button">当前章节</button>
                <button data-active={graphScope === "story"} onClick={() => setGraphScope("story")} type="button">本书 / 本卷</button>
                <button data-active={graphScope === "world"} onClick={() => setGraphScope("world")} type="button">全世界</button>
                <button data-active={graphScope === "focus"} disabled={!selectedNodeId} onClick={() => setGraphScope("focus")} type="button">聚焦所选</button>
                <button aria-pressed={showContextNodes} className={styles.graphFocusWideButton} data-active={showContextNodes} onClick={() => setShowContextNodes((current) => !current)} type="button">显示世界容器</button>
              </div>
              <details className={styles.graphControls}>
                <summary>调教图谱</summary>
                <div>
                  <label><span>排斥力</span><input aria-label="图谱排斥力" max="1.6" min="0.1" onChange={(event) => updateGraphTuning("repelForce", Number(event.target.value))} step="0.05" type="range" value={graphTuning.repelForce} /></label>
                  <label><span>关系距离</span><input aria-label="图谱关系距离" max="240" min="60" onChange={(event) => updateGraphTuning("linkDistance", Number(event.target.value))} step="4" type="range" value={graphTuning.linkDistance} /></label>
                  <label><span>关系吸引</span><input aria-label="图谱关系吸引" max="0.8" min="0.05" onChange={(event) => updateGraphTuning("linkStrength", Number(event.target.value))} step="0.05" type="range" value={graphTuning.linkStrength} /></label>
                  <label><span>中心力</span><input aria-label="图谱中心力" max="0.5" min="0" onChange={(event) => updateGraphTuning("centerForce", Number(event.target.value))} step="0.02" type="range" value={graphTuning.centerForce} /></label>
                  <button onClick={resetGraph} type="button">恢复推荐值与视图</button>
                </div>
              </details>
            </section>
          ) : null}

        </aside>

        <section className={styles.mainStage} data-surface={workspaceMode === "graph" ? "graph" : "story"}>
          {activeWorld ? (
            workspaceMode === "graph" ? (
              <section aria-labelledby="graph-workspace-heading" className={styles.graphWorkspace} data-testid="central-graph-workspace">
                <header className={styles.graphWorkspaceHeader}>
                  <div>
                    <span>中央关系视图 · {activeWorld.genre}</span>
                    <h1 id="graph-workspace-heading">{activeStory?.title ?? activeWorld.title} · 知识图谱</h1>
                    <p>把正文里的角色、地点、势力与事件放到同一张可探索的关系图上。</p>
                  </div>
                  <div className={styles.graphWorkspaceMeta}>
                    <strong>节点数 {graphNodes.length}</strong>
                    <strong>关系数 {graphEdges.length}</strong>
                    <small>知识库由左栏按钮独立展开；右侧栏保留缩略图与节点辅助信息</small>
                  </div>
                </header>
                {visibleNodes.length > 0 ? (
                  <div className={styles.graphWorkspaceCanvas} data-testid="central-graph-canvas">
                    {!showFullGraph ? renderGraphViewport("小说世界关系图", styles.forceGraph, captureSideGraphLayout) : null}
                  </div>
                ) : (
                  <div className={styles.graphWorkspaceEmpty}>
                    <strong>这个世界还是空白的。</strong>
                    <p>推进当前章节后，关系会从正文里长出来。</p>
                  </div>
                )}
              </section>
            ) : (
            <>
              {workspaceMode === "write" ? (
                <>
              <div className={styles.storyHeader}>
                <div>
                  <p>{activeWorld.genre} · {activeWorld.title}</p>
                  <h1>{activeStory?.title ?? "这个世界还没有书名"}</h1>
                </div>
              </div>

              {activeStory?.continuationContext ? (
                <section aria-label="续写上下文" className={styles.continuationContext}>
                  <div className={styles.continuationContextHeader}>
                    <div>
                      <span>续写上下文 · 不进入正文</span>
                      <strong>从《{activeStory.continuationContext.chapterTitle}》之后接续</strong>
                    </div>
                    <small>原文仅供 AI 参考</small>
                  </div>
                  <ManuscriptAnalysisText compact text={activeStory.continuationContext.brief} />
                  <details className={styles.continuationSource}>
                    <summary>查看续写点原文参考</summary>
                    <ManuscriptAnalysisText compact text={activeStory.continuationContext.excerpt} />
                  </details>
                </section>
              ) : activeStory?.premise ? (
                <blockquote className={styles.openingCopy}>
                  <ManuscriptAnalysisText text={activeStory.premise} />
                </blockquote>
              ) : null}
                </>
              ) : (
                <header className={styles.workspacePageHeader} data-page={workspaceMode}>
                  <div>
                    <span>{workspaceMode === "branches" ? "分支与存档" : workspaceMode === "director" ? "作者导演台" : "正史审核"}</span>
                    <h1>{activeStory?.title ?? activeWorld.title}</h1>
                    <p>{workspaceMode === "branches" ? "管理不同走线、命名存档，并从任意节点另开一条可能性。" : workspaceMode === "director" ? "把未来剧情、写法证据与梗库参考交给 AI，先形成计划，再决定是否回收。" : "只审核已经发生的事实，不把未来提案直接写进正史。"}</p>
                  </div>
                  <div className={styles.workspacePageMeta}>
                    <strong>{graphNodes.length} 个图谱节点</strong>
                    <strong>{candidateFactCount} 条待审事实</strong>
                    <small>当前世界：{activeWorld.title}</small>
                  </div>
                </header>
              )}

              {workspaceMode === "write" && activeStory && interactiveState ? (
                <NovelOutputPanel
                  onDownload={(format) => downloadNovelDraft(activeStory, interactiveState, format)}
                  onSelectTurn={setSelectedTurnId}
                  pending={turnPending}
                  selectedTurnId={selectedTurnId}
                  state={interactiveState}
                  story={activeStory}
                  streamingScene={streamingScene}
                />
              ) : null}

              {workspaceMode === "canon" ? (
                <section aria-label="正史审核页面" className={styles.workspacePage} data-testid="canon-workspace-page">
                  <CanonPanel
                    activeStoryId={activeStoryId}
                    approveAllCandidateFacts={approveAllCandidateFacts}
                    candidateFactCount={candidateFactCount}
                    canonApprovalNotice={canonApprovalNotice}
                    setFactStatus={setFactStatus}
                    world={activeWorld}
                  />
                </section>
              ) : null}

              {workspaceMode === "director" && interactiveState && activeStory ? (
                <section aria-label="作者导演台页面" className={styles.workspacePage} data-testid="director-workspace-page">
                  <StoryDirectorPanel
                    candidateNodes={directorCandidateNodes}
                    craftCards={activeDirectorCraftCards}
                    jokeCards={activeDirectorJokeCards}
                    knowledgeCards={activeDirectorKnowledgeCards}
                    error={directorError}
                    libraryError={directorLibraryError}
                    libraryPending={directorLibraryPending}
                    onStatusChange={updateDirectorProposalStatus}
                    onLibraryStatusChange={updateDirectorLibraryCardStatus}
                    onLibrarySubmit={(kind, input, nodeIds, jokeIntent) => void runDirectorLibrary(kind, input, nodeIds, jokeIntent)}
                    onSubmit={(request, nodeIds) => void runDirectorProposal(request, nodeIds)}
                    pending={directorPending}
                    proposals={activeDirectorProposals}
                    unresolvedThreads={directorUnresolvedThreads}
                  />
                </section>
              ) : null}

              {workspaceMode === "branches" && interactiveState ? (
                <section aria-label="走线与存档页面" className={styles.workspacePage} data-testid="branches-workspace-page">
                  <InteractiveBranchPanel
                    onAdvance={advanceInteractive}
                    onCreateCheckpoint={createCheckpoint}
                    onFork={forkInteractive}
                    onForkCheckpoint={forkCheckpoint}
                    onRenameBranch={renameBranch}
                    onSelectTurn={setSelectedTurnId}
                    onSwitchBranch={switchBranch}
                    selectedTurnId={selectedTurnId}
                    state={interactiveState}
                    pending={turnPending}
                    streamingScene={streamingScene}
                    runtimeError={turnRuntimeError}
                    runtimeModel={turnRuntimeModel}
                    view="branches"
                    showScene
                  />
                </section>
              ) : null}
              {workspaceMode === "write" && interactiveState ? (
                <InteractiveBranchPanel
                  onAdvance={advanceInteractive}
                  onCreateCheckpoint={createCheckpoint}
                  onFork={forkInteractive}
                  onForkCheckpoint={forkCheckpoint}
                  onRenameBranch={renameBranch}
                  onSelectTurn={setSelectedTurnId}
                  onSwitchBranch={switchBranch}
                  selectedTurnId={selectedTurnId}
                  state={interactiveState}
                  pending={turnPending}
                  streamingScene={streamingScene}
                  runtimeError={turnRuntimeError}
                  runtimeModel={turnRuntimeModel}
                  view="write"
                  showScene
                />
              ) : null}

              {workspaceMode === "write" && showExport ? (
                <section className={styles.exportPanel} data-testid="quartz-export-panel">
                  <div>
                    <span>Quartz 兼容导出</span>
                    <strong>{quartzExportNotes.length} 个 Markdown 节点已经就绪</strong>
                    <p>包含世界节点、角色卡和当前走线正文。这是可检查的实验包，不代表已经为每位用户部署 Quartz 服务。</p>
                  </div>
                  <button onClick={() => downloadQuartzBundle(activeWorld, quartzExportNotes)} type="button">下载实验包</button>
                  <ul>
                    {quartzExportNotes.slice(0, 6).map((note) => <li key={note.path}>{note.path}</li>)}
                  </ul>
                </section>
              ) : null}
              </>
            )
          ) : null}
        </section>

        <aside className={styles.rightRail} aria-label="世界侧舱" data-view={workspaceMode === "canon" ? "canon" : "graph"}>
          <section className={styles.graphSection} aria-labelledby="graph-heading">
            <div className={styles.sectionHeading}>
              <div><span>实时知识图谱</span><strong id="graph-heading">{graphNodes.length} 个节点 · {graphEdges.length} 条关系</strong></div>
              <button aria-label="展开完整关系图谱" className={styles.graphExpandButton} disabled={graphNodes.length === 0} onClick={() => { setFullGraphQualityLevel(graphQuality.level); setShowFullGraph(true); }} title="展开完整关系图谱" type="button">展开大图</button>
            </div>
            {visibleNodes.length > 0 ? (
              <div className={styles.graphCanvas}>
                {!showFullGraph ? <div aria-hidden={workspaceMode === "graph" ? true : undefined} className={styles.graphPreviewViewport} data-testid="side-graph-preview">{renderGraphViewport("侧栏知识图谱预览", styles.forceGraph, undefined, sidebarGraphNodes, sidebarGraphEdges, (nodeId) => selectGraphNode(nodeId.replace(/^sidebar:/, "")))}</div> : null}
                {selectedNode ? (
                  <aside className={styles.nodeInspector}>
                    <button aria-label="关闭节点详情" className={styles.closeNodeInspector} onClick={() => setSelectedNodeId(null)} type="button">×</button>
                    <span>{KIND_LABEL[selectedNode.kind]}</span><strong>{selectedNode.label}</strong><p>{selectedNode.summary}</p>
                    {isCharacterNode(selectedNode) ? <button onClick={() => setCharacterCardNodeId(selectedNode.id)} type="button">打开完整角色卡</button> : null}
                  </aside>
                ) : null}
              </div>
            ) : <div className={styles.emptyWorld}><strong>{workspaceMode === "graph" ? "右栏图谱预览" : "这个世界还是空白的。"}</strong><p>{workspaceMode === "graph" ? "中央图谱出现节点后，这里会同步显示缩略视图。" : "推进当前章节后，关系会从正文里长出来。"}</p></div>}
          </section>

          <section aria-labelledby="workspace-context-heading" className={styles.contextPanel}>
            <div className={styles.contextPanelHeader}>
              <div>
                <span>当前工作上下文</span>
                <strong id="workspace-context-heading">
                  {workspaceMode === "write"
                    ? "正文工作台"
                    : workspaceMode === "branches"
                      ? "走线工作台"
                      : workspaceMode === "director"
                        ? "剧情导演台"
                        : workspaceMode === "graph"
                          ? "知识图谱"
                          : "正史审核"}
                </strong>
              </div>
              <span className={styles.contextLive}>实时</span>
            </div>
            <dl className={styles.contextStats}>
              <div><dt>世界</dt><dd>《{activeWorld?.title ?? "未选择"}》</dd></div>
              <div><dt>当前小说</dt><dd>《{activeStory?.title ?? "未选择"}》</dd></div>
              <div><dt>当前走线</dt><dd>{activeBranch?.title ?? "尚未建立"}</dd></div>
              <div><dt>推进深度</dt><dd>第 {currentTurn?.depth ?? 0} 段</dd></div>
            </dl>
            <div className={styles.contextCurrentTurn}>
              <span>最近一次选择</span>
              <strong>{currentTurn?.selectedAction ?? "等待第一次选择"}</strong>
              <small>{currentTurn ? `当前节点：${currentTurn.id}` : "选择行动后，这里会同步显示走线位置"}</small>
            </div>
            <div className={styles.contextTodo}>
              <span>待处理事项</span>
              <ul>
                <li><b>{candidateFactCount}</b><span>条正史候选</span></li>
                <li><b>{activeDirectorProposals.filter((proposal) => proposal.status === "pending").length}</b><span>个导演提案</span></li>
                <li><b>{directorUnresolvedThreads.length}</b><span>条未闭合线索</span></li>
              </ul>
            </div>
          </section>

        </aside>
      </div>
      {showKnowledgeLibrary ? (
        <div className={styles.knowledgeLibraryBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowKnowledgeLibrary(false);
        }}>
          <section aria-labelledby="knowledge-library-heading" aria-modal="true" className={styles.knowledgeLibraryDialog} data-testid="knowledge-library-dialog" role="dialog">
            <header className={styles.knowledgeLibraryHeader}>
              <div>
                <span>独立资料空间</span>
                <h2 id="knowledge-library-heading">知识库</h2>
                <p>写法、世界知识与梗库单独展开，不再挤占正文、图谱或正史侧栏。</p>
              </div>
              <button aria-label="关闭知识库" onClick={() => setShowKnowledgeLibrary(false)} type="button">×</button>
            </header>
            <div className={styles.knowledgeLibraryBody}>
              <nav aria-label="知识库分类" className={styles.knowledgeLibraryTabs} role="tablist">
                <button aria-controls="knowledge-library-panel" aria-label="写法库与反转库" aria-selected={knowledgeLibrarySection === "craft"} data-active={knowledgeLibrarySection === "craft"} id="knowledge-library-tab-craft" onClick={() => setKnowledgeLibrarySection("craft")} role="tab" type="button">
                  <strong>写法库 · 反转库</strong>
                  <small>从书源提取的叙事结构</small>
                </button>
                <button aria-controls="knowledge-library-panel" aria-label="世界知识库" aria-selected={knowledgeLibrarySection === "world"} data-active={knowledgeLibrarySection === "world"} id="knowledge-library-tab-world" onClick={() => setKnowledgeLibrarySection("world")} role="tab" type="button">
                  <strong>世界知识库</strong>
                  <small>文化底蕴与运转逻辑</small>
                </button>
                <button aria-controls="knowledge-library-panel" aria-label="梗库" aria-selected={knowledgeLibrarySection === "jokes"} data-active={knowledgeLibrarySection === "jokes"} id="knowledge-library-tab-jokes" onClick={() => setKnowledgeLibrarySection("jokes")} role="tab" type="button">
                  <strong>梗库</strong>
                  <small>流行语与反差共鸣</small>
                </button>
              </nav>
              <div className={styles.knowledgeLibraryContent} id="knowledge-library-panel" role="tabpanel" tabIndex={0}>
                {knowledgeLibrarySection === "craft" ? (
                  <div className={styles.knowledgeLibraryStack}>
                    <CraftKnowledgePanel activeManuscriptId={activeManuscript?.id ?? null} entries={craftLibrary} onStatusChange={updateCraftEntryStatus} />
                    <CraftCards cards={activeDirectorCraftCards} onStatusChange={(id, status) => updateDirectorLibraryCardStatus("craft", id, status)} />
                  </div>
                ) : knowledgeLibrarySection === "world" ? (
                  <KnowledgeCards cards={activeDirectorKnowledgeCards} onStatusChange={(id, status) => updateDirectorLibraryCardStatus("knowledge", id, status)} />
                ) : (
                  <JokeCards cards={activeDirectorJokeCards} onStatusChange={(id, status) => updateDirectorLibraryCardStatus("joke", id, status)} />
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {showFullGraph ? (
        <div className={styles.fullGraphBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowFullGraph(false);
        }}>
          <section aria-labelledby="full-graph-heading" aria-modal="true" className={styles.fullGraphDialog} role="dialog">
            <header className={styles.fullGraphHeader}>
              <div>
                <span>小说世界导航</span>
                <h2 id="full-graph-heading">完整关系图谱</h2>
                <p>{graphNodes.length} 个节点 · {graphEdges.length} 条关系 · {fullGraphQuality.level} · {fullGraphQuality.renderer.toUpperCase()}{graphP95FrameMs === undefined ? "" : ` · p95 ${graphP95FrameMs}ms`}</p>
              </div>
              <button aria-label="关闭完整关系图谱" onClick={() => setShowFullGraph(false)} type="button">×</button>
            </header>
            <div className={styles.fullGraphBody}>
              <aside className={styles.fullGraphToolbar} aria-label="完整图谱工具">
                <div className={styles.graphScopeBar} aria-label="完整图谱范围">
                <button data-active={graphScope === "chapter"} onClick={() => setGraphScope("chapter")} type="button">当前章节</button>
                <button data-active={graphScope === "story"} onClick={() => setGraphScope("story")} type="button">本书 / 本卷</button>
                <button data-active={graphScope === "world"} onClick={() => setGraphScope("world")} type="button">全世界</button>
                <button data-active={graphScope === "focus"} disabled={!selectedNodeId} onClick={() => setGraphScope("focus")} type="button">聚焦所选</button>
                <button aria-pressed={showContextNodes} data-active={showContextNodes} onClick={() => setShowContextNodes((current) => !current)} type="button">显示世界容器</button>
                </div>
                <div className={styles.graphQualitySwitch} aria-label="图谱性能偏好">
                  <button data-active={graphQualityPreference === "auto"} onClick={() => { setGraphQualityPreference("auto"); setFullGraphQualityLevel(graphQuality.level); }} type="button">自动</button>
                  <button data-active={graphQualityPreference === "quality"} onClick={() => setGraphQualityPreference("quality")} type="button">画质优先</button>
                  <button data-active={graphQualityPreference === "performance"} onClick={() => setGraphQualityPreference("performance")} type="button">性能优先</button>
                </div>
                <details className={styles.graphControls}>
                <summary>调教图谱</summary>
                <div>
                  <label><span>排斥力</span><input aria-label="完整图谱排斥力" max="1.6" min="0.1" onChange={(event) => updateGraphTuning("repelForce", Number(event.target.value))} step="0.05" type="range" value={graphTuning.repelForce} /></label>
                  <label><span>关系距离</span><input aria-label="完整图谱关系距离" max="240" min="60" onChange={(event) => updateGraphTuning("linkDistance", Number(event.target.value))} step="4" type="range" value={graphTuning.linkDistance} /></label>
                  <label><span>关系吸引</span><input aria-label="完整图谱关系吸引" max="0.8" min="0.05" onChange={(event) => updateGraphTuning("linkStrength", Number(event.target.value))} step="0.05" type="range" value={graphTuning.linkStrength} /></label>
                  <label><span>中心力</span><input aria-label="完整图谱中心力" max="0.5" min="0" onChange={(event) => updateGraphTuning("centerForce", Number(event.target.value))} step="0.02" type="range" value={graphTuning.centerForce} /></label>
                  <button onClick={resetGraph} type="button">恢复推荐值与视图</button>
                </div>
                </details>
              </aside>
              <div className={styles.fullGraphCanvas}>
              {fullGraphQuality.renderer === "sigma" ? (
                <ForceGraphSigma ariaLabel="完整小说世界关系图" className={styles.fullForceGraph} colors={GRAPH_COLORS} edges={graphEdges} nodes={hydratedFullGraphNodes} onNodeSelect={selectGraphNode} quality={fullGraphQuality} selectedNodeId={selectedNodeId} theme="light" />
              ) : (
                <ForceGraphSvg ariaLabel="完整小说世界关系图" className={styles.fullForceGraph} colors={GRAPH_COLORS} edges={graphEdges} height={800} initialAlpha={graphLayoutSnapshot ? 0.12 : inheritedSideLayout ? 0.03 : 1} nodes={hydratedFullGraphNodes} onLayoutSnapshot={saveFullGraphLayout} onNodeSelect={selectGraphNode} resetToken={graphResetToken} selectedNodeId={selectedNodeId} theme="light" tuning={graphTuning} typeLabels={KIND_LABEL} width={1400} />
              )}
              {selectedNode ? (
                <aside className={styles.nodeInspector}>
                  <button aria-label="关闭完整图谱节点详情" className={styles.closeNodeInspector} onClick={() => setSelectedNodeId(null)} type="button">×</button>
                  <span>{KIND_LABEL[selectedNode.kind]}</span><strong>{selectedNode.label}</strong><p>{selectedNode.summary}</p>
                  {isCharacterNode(selectedNode) ? <button onClick={() => { setShowFullGraph(false); setCharacterCardNodeId(selectedNode.id); }} type="button">打开完整角色卡</button> : null}
                </aside>
              ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {isCharacterNode(characterCardNode) ? (
        <CharacterCard
          node={characterCardNode}
          onClose={() => setCharacterCardNodeId(null)}
          onPortraitUpload={uploadCharacterPortrait}
          onPortraitGenerate={generateCharacterPortraitImage}
          onSelectRelation={selectGraphNode}
          relations={characterRelations}
        />
      ) : null}
      <ManuscriptImportDialog backgroundTask={manuscriptTask} initialAnalysis={resumeAnalysis} initialManuscript={resumeManuscript} onManuscriptRead={persistManuscriptProgress} onProgress={persistManuscriptProgress} onTaskChange={handleManuscriptTaskChange} open={showManuscriptImport} onClose={() => { setShowManuscriptImport(false); }} onConfirm={confirmManuscriptImport} />
      <ForecastSandboxDialog
        error={forecastError}
        onClose={() => setShowForecastSandbox(false)}
        onConvert={convertForecast}
        onRun={(selection) => void runForecast(selection)}
        open={showForecastSandbox}
        pending={forecastPending}
        sandboxes={activeForecastSandboxes}
        state={interactiveState}
        world={activeWorld}
      />
    </main>
  );
}
