"use client";

import React, { useMemo, useState } from "react";
import type {
  DirectorCraftCard,
  DirectorJokeCard,
  DirectorJokeIntent,
  DirectorKnowledgeCard,
  DirectorLibraryCardStatus,
  StoryDirectorProposal,
  WorldNode,
} from "./world-lab-data";
import type { DirectorLibraryKind } from "../../lib/story-director-library-api";
import styles from "./world-lab.module.css";

type DirectorTool = "story" | DirectorLibraryKind;

interface StoryDirectorPanelProps {
  proposals: StoryDirectorProposal[];
  candidateNodes: WorldNode[];
  unresolvedThreads: string[];
  pending: boolean;
  error: string | null;
  knowledgeCards: DirectorKnowledgeCard[];
  craftCards: DirectorCraftCard[];
  jokeCards: DirectorJokeCard[];
  libraryPending: boolean;
  libraryError: string | null;
  onSubmit: (request: string, nodeIds: string[]) => void;
  onStatusChange: (proposalId: string, status: "pending" | "fulfilled" | "dismissed") => void;
  onLibrarySubmit: (kind: DirectorLibraryKind, input: string, nodeIds: string[], jokeIntent?: DirectorJokeIntent) => void;
  onLibraryStatusChange: (kind: DirectorLibraryKind, cardId: string, status: DirectorLibraryCardStatus) => void;
}

const timingLabels: Record<StoryDirectorProposal["timing"], string> = {
  next_scene: "下一场合适",
  near_arc: "近期小 arc",
  later_arc: "后续大 arc",
  conditional: "满足条件后",
};

const toolLabels: Record<DirectorTool, { eyebrow: string; title: string; description: string }> = {
  story: { eyebrow: "剧情导演", title: "安排接下来的戏", description: "判断下一步该推进什么、哪些线索先埋下，以及伏笔何时回收。" },
  knowledge: { eyebrow: "知识考据", title: "整理文化背景支撑", description: "把一个主题整理成可核验的背景卡，不把资料直接写进世界正史。" },
  craft: { eyebrow: "写法蒸馏", title: "把有趣写法变成方法", description: "抽取叙事结构、节奏和适用时机，形成可复用的写法卡，而不是复制原句。" },
  joke: { eyebrow: "梗库管理", title: "记录梗与使用边界", description: "判断什么时候能用、多久用一次，以及是顺手添趣还是专门长出一个剧情种子。" },
};

const jokeIntentLabels: Record<DirectorJokeIntent, string> = {
  library_only: "只存入梗库",
  opportunistic: "合适时机自然带入",
  plot_seed: "为这个梗设计剧情种子",
};

function cardStatusAction(status: DirectorLibraryCardStatus) {
  return status === "active" ? "停用这张卡" : "重新启用";
}

function LibraryBoundary() {
  return <p className={styles.directorLibraryBoundary}>这类产物只进入导演台辅助库，带有“非正文 · 非正史”边界；除非你主动转交，不会生成章节、分支或正史事实。</p>;
}

function NodePicker({ candidateNodes, selectedNodeIds, onToggle }: { candidateNodes: WorldNode[]; selectedNodeIds: string[]; onToggle: (id: string) => void }) {
  return candidateNodes.length > 0 ? (
    <div className={styles.directorTargets}>
      <span>可关联的角色 / 地点 / 势力（可选）</span>
      <div>{candidateNodes.slice(0, 12).map((node) => <button aria-pressed={selectedNodeIds.includes(node.id)} data-active={selectedNodeIds.includes(node.id)} key={node.id} onClick={() => onToggle(node.id)} type="button">{node.label}</button>)}</div>
    </div>
  ) : null;
}

function StatusButton({ status, onClick }: { status: DirectorLibraryCardStatus; onClick: () => void }) {
  return <button className={styles.directorLibraryStatusButton} onClick={onClick} type="button">{cardStatusAction(status)}</button>;
}

export function KnowledgeCards({ cards, onStatusChange }: { cards: DirectorKnowledgeCard[]; onStatusChange: (id: string, status: DirectorLibraryCardStatus) => void }) {
  const active = cards.filter((card) => card.status === "active").slice().reverse();
  const dismissed = cards.filter((card) => card.status === "dismissed").slice().reverse();
  return (
    <div className={styles.directorLibraryResults}>
      <h3 className={styles.directorLibrarySectionTitle}>世界知识库</h3>
      <div className={styles.directorListTitle}>已整理的背景卡 · {active.length}</div>
      {active.length > 0 ? active.map((card) => (
        <article className={styles.directorLibraryCard} key={card.id}>
          <div className={styles.directorLibraryCardHeader}><strong>{card.topic}</strong><span>背景辅助卡</span></div>
          <p>{card.summary}</p>
          <dl>
            <div><dt>核心概念</dt><dd>{card.concepts.join(" · ")}</dd></div>
            <div><dt>文化脉络</dt><dd>{card.culturalContext}</dd></div>
            <div><dt>可用到本书</dt><dd>{card.applicationToStory}</dd></div>
            <div><dt>来源 / 核验</dt><dd>{card.sourceNote}</dd></div>
          </dl>
          {card.caveats.length > 0 ? <small className={styles.directorLibraryCaveat}>注意：{card.caveats.join("；")}</small> : null}
          <div className={styles.directorLibraryCardFooter}><small>非正文 · 非正史</small><StatusButton status={card.status} onClick={() => onStatusChange(card.id, "dismissed")} /></div>
        </article>
      )) : <div className={styles.emptyDirector}>还没有背景卡。可以从“儒释道、天罡地支、宗门制度、修行资源”等主题开始。</div>}
      {dismissed.length > 0 ? <details className={styles.directorLibraryArchive}><summary>已停用背景卡 · {dismissed.length}</summary>{dismissed.map((card) => <div key={card.id}><strong>{card.topic}</strong><StatusButton status={card.status} onClick={() => onStatusChange(card.id, "active")} /></div>)}</details> : null}
    </div>
  );
}

export function CraftCards({ cards, onStatusChange }: { cards: DirectorCraftCard[]; onStatusChange: (id: string, status: DirectorLibraryCardStatus) => void }) {
  const active = cards.filter((card) => card.status === "active").slice().reverse();
  const dismissed = cards.filter((card) => card.status === "dismissed").slice().reverse();
  return (
    <div className={styles.directorLibraryResults}>
      <h3 className={styles.directorLibrarySectionTitle}>用户蒸馏写法</h3>
      <div className={styles.directorListTitle}>已蒸馏的写法卡 · {active.length}</div>
      {active.length > 0 ? active.map((card) => (
        <article className={styles.directorLibraryCard} key={card.id}>
          <div className={styles.directorLibraryCardHeader}><strong>{card.title}</strong><span>结构方法卡</span></div>
          <p>{card.pattern}</p>
          <dl>
            <div><dt>相近写法</dt><dd>{card.relatedPatterns.join(" · ")}</dd></div>
            <div><dt>适用时机</dt><dd>{card.useWhen}</dd></div>
            <div><dt>节奏要求</dt><dd>{card.cadence}</dd></div>
            <div><dt>示意结构</dt><dd>{card.exampleStructure}</dd></div>
            <div><dt>使用风险</dt><dd>{card.risk}</dd></div>
          </dl>
          <div className={styles.directorLibraryCardFooter}><small>只学习结构，不复制书源原句</small><StatusButton status={card.status} onClick={() => onStatusChange(card.id, "dismissed")} /></div>
        </article>
      )) : <div className={styles.emptyDirector}>还没有用户蒸馏的写法卡。可以把“敌方畅想 → 己方视角截断”这样的结构直接抛进来。</div>}
      {dismissed.length > 0 ? <details className={styles.directorLibraryArchive}><summary>已停用写法卡 · {dismissed.length}</summary>{dismissed.map((card) => <div key={card.id}><strong>{card.title}</strong><StatusButton status={card.status} onClick={() => onStatusChange(card.id, "active")} /></div>)}</details> : null}
    </div>
  );
}

export function JokeCards({ cards, onStatusChange }: { cards: DirectorJokeCard[]; onStatusChange: (id: string, status: DirectorLibraryCardStatus) => void }) {
  const active = cards.filter((card) => card.status === "active").slice().reverse();
  const dismissed = cards.filter((card) => card.status === "dismissed").slice().reverse();
  return (
    <div className={styles.directorLibraryResults}>
      <h3 className={styles.directorLibrarySectionTitle}>梗库</h3>
      <div className={styles.directorListTitle}>已记录的梗 · {active.length}</div>
      {active.length > 0 ? active.map((card) => (
        <article className={styles.directorLibraryCard} key={card.id}>
          <div className={styles.directorLibraryCardHeader}><strong>{card.phrase}</strong><span>{card.category}</span></div>
          <p>{card.meaning}</p>
          <dl>
            <div><dt>使用策略</dt><dd>{jokeIntentLabels[card.insertionMode]}</dd></div>
            <div><dt>适合时机</dt><dd>{card.suitableWhen}</dd></div>
            <div><dt>避免场景</dt><dd>{card.avoidWhen}</dd></div>
            <div><dt>频率预算</dt><dd>{card.frequencyBudget}</dd></div>
            <div><dt>角色适配</dt><dd>{card.characterFit}</dd></div>
            <div><dt>剧情种子</dt><dd>{card.plotSeed}</dd></div>
          </dl>
          <div className={styles.directorLibraryCardFooter}><small>不会自动塞入正文或提案</small><StatusButton status={card.status} onClick={() => onStatusChange(card.id, "dismissed")} /></div>
        </article>
      )) : <div className={styles.emptyDirector}>还没有梗卡。可以输入一个流行梗、自创梗，或描述你想要的反差笑点。</div>}
      {dismissed.length > 0 ? <details className={styles.directorLibraryArchive}><summary>已停用梗卡 · {dismissed.length}</summary>{dismissed.map((card) => <div key={card.id}><strong>{card.phrase}</strong><StatusButton status={card.status} onClick={() => onStatusChange(card.id, "active")} /></div>)}</details> : null}
    </div>
  );
}

export function StoryDirectorPanel({ proposals, candidateNodes, unresolvedThreads, pending, error, knowledgeCards, craftCards, jokeCards, libraryPending, libraryError, onSubmit, onStatusChange, onLibrarySubmit, onLibraryStatusChange }: StoryDirectorPanelProps) {
  const [tool, setTool] = useState<DirectorTool>("story");
  const [request, setRequest] = useState("");
  const [libraryInput, setLibraryInput] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [jokeIntent, setJokeIntent] = useState<DirectorJokeIntent>("opportunistic");
  const activeProposals = useMemo(() => proposals.filter((proposal) => proposal.status === "pending").slice().reverse(), [proposals]);
  const currentTool = toolLabels[tool];

  const toggleNode = (id: string) => {
    setSelectedNodeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 8 ? current : [...current, id]);
  };

  const submitLibrary = () => {
    if (libraryInput.trim().length < 2) return;
    onLibrarySubmit(tool as DirectorLibraryKind, libraryInput.trim(), selectedNodeIds, tool === "joke" ? jokeIntent : undefined);
    setLibraryInput("");
  };

  return (
    <section aria-label="作者导演台" className={styles.directorPanel}>
      <div className={styles.directorHeader}>
        <div><span>作者导演台</span><strong>先分工，再让 AI 出手</strong></div>
        <small>剧情计划、背景资料、写法方法与梗库，各自落在各自的抽屉里。</small>
      </div>
      <p className={styles.directorIntro}>导演台的辅助产物默认不改变正文、走线或正史。只有你在剧情导演页明确提交的提案，才会进入“待定计划”供后续回收。</p>

      <section aria-label="知识库与梗库投喂" className={styles.directorToolNavigation}>
        <div className={styles.directorToolTabs} role="tablist" aria-label="导演台功能">
          {(["story", "knowledge", "craft", "joke"] as const).map((item) => <button aria-selected={tool === item} data-active={tool === item} id={`director-tool-tab-${item}`} key={item} onClick={() => setTool(item)} role="tab" type="button">{item === "story" ? "剧情导演" : item === "knowledge" ? "知识考据" : item === "craft" ? "写法蒸馏" : "梗库"}</button>)}
        </div>
        <div className={styles.directorToolSummary}><span>{currentTool.eyebrow}</span><strong>{currentTool.title}</strong><small>{currentTool.description}</small></div>

      {tool === "story" ? (
        <section aria-label="剧情导演功能" className={styles.directorToolPanel}>
          {unresolvedThreads.length > 0 ? <div className={styles.directorThreads}><span>当前未决线索 · 点击可带入提案</span><div>{unresolvedThreads.slice(-6).map((thread) => <button aria-label={`引用未决线索 ${thread}`} key={thread} onClick={() => setRequest((current) => current ? `${current}\n${thread}` : thread)} type="button">{thread}</button>)}</div></div> : null}
          <label className={styles.directorRequest}><span>你要导演什么</span><textarea maxLength={2_000} onChange={(event) => setRequest(event.target.value)} placeholder="例如：让这个角色在不暴露身份的前提下帮主角一次，并请 AI 判断铺垫与回收时机。" rows={4} value={request} /></label>
          <NodePicker candidateNodes={candidateNodes} selectedNodeIds={selectedNodeIds} onToggle={toggleNode} />
          <div className={styles.directorActions}><button disabled={pending || request.trim().length < 2} onClick={() => { onSubmit(request.trim(), selectedNodeIds); setRequest(""); }} type="button">{pending ? "AI 正在判断时机…" : "整理成待定剧情计划"}</button>{error ? <span role="alert">{error}</span> : null}</div>
          <div className={styles.directorBoundaryNote}>剧情提案也只是计划，不会立刻写正文；你可以等走线发展到合适位置后再标记回收。</div>
          <ProposalList proposals={activeProposals} allProposals={proposals} onStatusChange={onStatusChange} />
        </section>
      ) : (
        <section aria-label={`${currentTool.eyebrow}功能`} className={styles.directorToolPanel}>
          <label className={styles.directorLibraryInput}><span>{tool === "knowledge" ? "抛入一个知识主题" : tool === "craft" ? "抛入一段写法、结构或你的观察" : "抛入一个梗、流行语或反差想法"}</span><textarea maxLength={2_000} onChange={(event) => setLibraryInput(event.target.value)} placeholder={tool === "knowledge" ? "例如：天罡地支如何与修行果位结合？道教的斋醮、箓牒能给宗门制度什么质感？" : tool === "craft" ? "例如：敌方畅想 → 己方视角截断。请记录这种结构，并联想相近的叙事机关。" : "例如：严肃谈判中突然插入一句冷梗，但不要破坏人物的危险感。"} rows={5} value={libraryInput} /></label>
          {tool === "joke" ? <fieldset className={styles.directorJokeIntent}><legend>希望它怎样参与创作？</legend>{(Object.keys(jokeIntentLabels) as DirectorJokeIntent[]).map((intent) => <label data-active={jokeIntent === intent} key={intent}><input checked={jokeIntent === intent} name="director-joke-intent" onChange={() => setJokeIntent(intent)} type="radio" value={intent} /><span><strong>{jokeIntentLabels[intent]}</strong><small>{intent === "library_only" ? "先观察，不主动召唤" : intent === "opportunistic" ? "剧情自然合适时再使用" : "只生成剧情种子，仍需你确认"}</small></span></label>)}</fieldset> : null}
          <NodePicker candidateNodes={candidateNodes} selectedNodeIds={selectedNodeIds} onToggle={toggleNode} />
          <LibraryBoundary />
          <div className={styles.directorActions}><button disabled={libraryPending || libraryInput.trim().length < 2} onClick={submitLibrary} type="button">{libraryPending ? "AI 正在整理…" : tool === "knowledge" ? "生成背景考据卡" : tool === "craft" ? "蒸馏成写法卡" : "记录并分析这个梗"}</button>{libraryError ? <span role="alert">{libraryError}</span> : null}</div>
          {tool === "knowledge" ? <KnowledgeCards cards={knowledgeCards} onStatusChange={(id, status) => onLibraryStatusChange("knowledge", id, status)} /> : tool === "craft" ? <CraftCards cards={craftCards} onStatusChange={(id, status) => onLibraryStatusChange("craft", id, status)} /> : <JokeCards cards={jokeCards} onStatusChange={(id, status) => onLibraryStatusChange("joke", id, status)} />}
        </section>
      )}
      </section>
    </section>
  );
}

function ProposalList({ proposals, allProposals, onStatusChange }: { proposals: StoryDirectorProposal[]; allProposals: StoryDirectorProposal[]; onStatusChange: (proposalId: string, status: "pending" | "fulfilled" | "dismissed") => void }) {
  return proposals.length > 0 ? (
    <div className={styles.directorProposalList}>
      <div className={styles.directorListTitle}>待定剧情计划 · {proposals.length}</div>
      {proposals.map((proposal) => <article className={styles.directorProposal} key={proposal.id}>
        <div className={styles.directorProposalTitle}><strong>{proposal.title}</strong><span>{timingLabels[proposal.timing]}</span></div>
        <small>你的导演意图：{proposal.userRequest}</small>
        <p>{proposal.proposal}</p>
        <dl><div><dt>为什么是现在</dt><dd>{proposal.timingReason}</dd></div><div><dt>先埋什么</dt><dd>{proposal.setup}</dd></div><div><dt>将来怎么收</dt><dd>{proposal.payoff}</dd></div></dl>
        {proposal.guardrails.length > 0 ? <small>约束：{proposal.guardrails.join("；")}</small> : null}
        <div className={styles.directorProposalActions}><button onClick={() => onStatusChange(proposal.id, "fulfilled")} type="button">标记已回收</button><button onClick={() => onStatusChange(proposal.id, "dismissed")} type="button">停用提案</button></div>
      </article>)}
      {allProposals.some((proposal) => proposal.status !== "pending") ? <details className={styles.directorArchive}><summary>已处理提案 · {allProposals.filter((proposal) => proposal.status !== "pending").length}</summary>{allProposals.filter((proposal) => proposal.status !== "pending").slice().reverse().map((proposal) => <div key={proposal.id}><span>{proposal.status === "fulfilled" ? "已回收" : "已停用"}</span><strong>{proposal.title}</strong><button onClick={() => onStatusChange(proposal.id, "pending")} type="button">重新启用</button></div>)}</details> : null}
    </div>
  ) : <div className={styles.emptyDirector}>还没有待定剧情计划。先提出一个未来可能发生的方向，AI 会帮你看铺垫、时机和回收。</div>;
}
