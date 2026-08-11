import type { StoryRecord, WorldRecord } from "./world-lab-data";

export type TurnCanonStatus = "sandbox" | "accepted";

export interface InteractiveChoice {
  id: string;
  label: string;
  hint: string;
  resultScene: string;
  preferenceSignals: string[];
  deltas: BranchDelta[];
}

export interface BranchDelta {
  id: string;
  targetNodeId: string;
  label: string;
  before: string;
  after: string;
}

export type NarrativeMemoryKind = "character_state" | "relationship" | "timeline" | "item" | "foreshadowing" | "promise";
export type NarrativeMemoryStatus = "active" | "resolved";

export interface NarrativeMemoryUpdate {
  id: string;
  kind: NarrativeMemoryKind;
  key: string;
  value: string;
  status: NarrativeMemoryStatus;
  relevantNodeIds: string[];
  sourceTurnId: string;
}

export interface NarrativeLedgerEntry extends NarrativeMemoryUpdate {
  updatedAtOrder: number;
}

export interface InteractiveTurn {
  id: string;
  parentId: string | null;
  branchId: string;
  depth: number;
  scene: string;
  offeredChoices: InteractiveChoice[];
  selectedAction: string | null;
  selectedChoiceId: string | null;
  preferenceSignals: string[];
  deltas: BranchDelta[];
  memoryUpdates: NarrativeMemoryUpdate[];
  canonStatus: TurnCanonStatus;
  order: number;
}

export interface StoryBranch {
  id: string;
  title: string;
  fromTurnId: string | null;
  headTurnId: string;
  checkpointId?: string | null;
  forecastSource?: { sandboxId: string; trajectoryId: string };
  forecastIntent?: string;
  order: number;
}

export interface StoryCheckpoint {
  id: string;
  title: string;
  turnId: string;
  branchId: string;
  createdAt: string;
  order: number;
}

export interface BranchSparseMemory {
  branchId: string;
  headTurnId: string;
  checkpointTrail: Array<{ checkpointId: string; title: string; turnId: string }>;
  earlierSummary: string;
  recentScenes: Array<{ turnId: string; action: string; scene: string }>;
  facts: Array<{ targetNodeId: string; label: string; value: string; sourceTurnId: string }>;
  openThreads: string[];
  ledgerStats: Record<NarrativeMemoryKind, number>;
  retrievedLedger: NarrativeLedgerEntry[];
}

export interface InteractiveStoryState {
  storyId: string;
  turns: InteractiveTurn[];
  branches: StoryBranch[];
  checkpoints: StoryCheckpoint[];
  activeBranchId: string;
  nextTurnSequence: number;
  nextBranchSequence: number;
  nextCheckpointSequence: number;
}

export interface ActionSelection {
  choiceId?: string;
  customAction?: string;
}

export interface GeneratedTurnPayload {
  scene: string;
  preferenceSignals: string[];
  deltas: Array<{ targetNodeId: string; label: string; before: string; after: string }>;
  discoveries?: Array<{ label: string; kind: string; summary: string; connectToNodeId: string; relationLabel: string }>;
  memoryUpdates: Array<{
    kind: NarrativeMemoryKind;
    key: string;
    value: string;
    status: NarrativeMemoryStatus;
    relevantNodeIds: string[];
  }>;
  choices: Array<{
    label: string;
    hint: string;
    preferenceSignals: string[];
    predictedDeltas: Array<{ targetNodeId: string; label: string; before: string; after: string }>;
  }>;
}

function nextChoices(world: WorldRecord, depth: number): InteractiveChoice[] {
  const protagonist = world.nodes.find((node) => node.id === "protagonist")?.label ?? "主角";
  const place = world.nodes.find((node) => node.id === "place")?.label ?? "此地";
  const object = world.nodes.find((node) => node.id === "object")?.label ?? "关键物件";
  const faction = world.nodes.find((node) => node.id === "faction")?.label ?? "暗处势力";

  if (depth > 0) {
    return [
      {
        id: `follow-clue-${depth}`,
        label: `顺着${object}留下的线索追下去`,
        hint: "主动揭开谜底，但会更早暴露自己。",
        resultScene: `${protagonist}没有让线索冷下去。${object}指向的痕迹穿过${place}最暗的一角，也让${faction}第一次意识到：猎物正在反过来寻找猎人。`,
        preferenceSignals: ["偏爱谜团", "主动推进"],
        deltas: [{ id: `delta-clue-${depth}`, targetNodeId: "object", label: "线索状态", before: "来历不明", after: "开始指向暗处势力" }],
      },
      {
        id: `protect-secret-${depth}`,
        label: "先保护秘密，不让任何人知道自己看懂了",
        hint: "压住信息差，换取下一回合的主动权。",
        resultScene: `${protagonist}把已经看懂的部分藏回沉默里。${place}仍旧安静，只有${faction}的人误以为一切还在掌控之中。`,
        preferenceSignals: ["喜欢藏底牌", "谨慎布局"],
        deltas: [{ id: `delta-secret-${depth}`, targetNodeId: "protagonist", label: "信息优势", before: "被动卷入", after: "掌握未公开线索" }],
      },
      {
        id: `force-confrontation-${depth}`,
        label: `逼${faction}现在就表态`,
        hint: "缩短试探，立即制造关系变化。",
        resultScene: `${protagonist}把退路让给了别人，自己站到${place}中央。${faction}若继续沉默，就等于承认他们害怕${object}背后的答案。`,
        preferenceSignals: ["正面对抗", "偏爱关系爆点"],
        deltas: [{ id: `delta-pressure-${depth}`, targetNodeId: "faction", label: "对主角态度", before: "暗中观察", after: "被迫回应" }],
      },
    ];
  }

  return [
    {
      id: "ask-object",
      label: `握住${object}，先问它为什么认识自己`,
      hint: "追问身份之谜，让物件关系先发生变化。",
      resultScene: `${protagonist}握紧${object}。冰冷的触感里传来第二个声音：它没有回答“为什么”，只说出了一个本不该有人知道的旧名字。`,
      preferenceSignals: ["偏爱谜团", "主动追问"],
      deltas: [{ id: "delta-object-trust", targetNodeId: "object", label: "与主角的关系", before: "选中", after: "透露旧名" }],
    },
    {
      id: "hide-and-watch",
      label: `熄掉香火，在${place}里观察来客`,
      hint: "暂不暴露判断，用信息差换主动权。",
      resultScene: `${protagonist}按灭最后一点火光。门外的人果然没有立刻进来，而是先向${faction}的方向做了一个只有同伙才懂的手势。`,
      preferenceSignals: ["喜欢藏底牌", "谨慎布局"],
      deltas: [{ id: "delta-faction-clue", targetNodeId: "faction", label: "暴露程度", before: "立场不明", after: "留下同伙手势" }],
    },
    {
      id: "open-the-door",
      label: "推门出去，让追兵先看见自己",
      hint: "把危险拉到明面，换取正面对抗。",
      resultScene: `${protagonist}推开门时，雨声反而停了一瞬。追来的人没想到猎物会自己走出来，更没想到${object}正在他手里轻轻震动。`,
      preferenceSignals: ["正面对抗", "偏爱逆袭"],
      deltas: [{ id: "delta-protagonist-pressure", targetNodeId: "protagonist", label: "处境", before: "被追赶", after: "主动迎敌" }],
    },
  ];
}

export function createInteractiveStory(
  world: WorldRecord,
  story: StoryRecord,
  seed: {
    openingChoices?: InteractiveChoice[];
    memoryUpdates?: NarrativeMemoryUpdate[];
  } = {},
): InteractiveStoryState {
  const root: InteractiveTurn = {
    id: "turn-0",
    parentId: null,
    branchId: "main",
    depth: 0,
    scene: story.premise,
      offeredChoices: seed.openingChoices ?? nextChoices(world, 0),
    selectedAction: null,
    selectedChoiceId: null,
    preferenceSignals: [],
    deltas: [],
      memoryUpdates: seed.memoryUpdates ?? [],
    canonStatus: "sandbox",
    order: 0,
  };
  return {
    storyId: story.id,
    turns: [root],
    branches: [{ id: "main", title: "当前故事线", fromTurnId: null, headTurnId: root.id, order: 0 }],
    checkpoints: [],
    activeBranchId: "main",
    nextTurnSequence: 1,
    nextBranchSequence: 1,
    nextCheckpointSequence: 1,
  };
}

export function activeBranch(state: InteractiveStoryState) {
  return state.branches.find((branch) => branch.id === state.activeBranchId) ?? state.branches[0]!;
}

export function turnById(state: InteractiveStoryState, turnId: string) {
  return state.turns.find((turn) => turn.id === turnId) ?? null;
}

export function branchPath(state: InteractiveStoryState, branchId = state.activeBranchId): InteractiveTurn[] {
  const branch = state.branches.find((candidate) => candidate.id === branchId);
  if (!branch) return [];
  const byId = new Map(state.turns.map((turn) => [turn.id, turn]));
  const path: InteractiveTurn[] = [];
  let current = byId.get(branch.headTurnId) ?? null;
  while (current) {
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) ?? null : null;
  }
  return path.reverse();
}

function customSignals(action: string) {
  const signals = ["主动定义走向"];
  if (/藏|等|观察|试探/.test(action)) signals.push("谨慎布局");
  if (/问|查|线索|真相/.test(action)) signals.push("偏爱谜团");
  if (/打|冲|杀|迎|逼/.test(action)) signals.push("正面对抗");
  if (/救|护|帮/.test(action)) signals.push("保护欲");
  return signals;
}

export function appendInteractiveTurn(state: InteractiveStoryState, world: WorldRecord, selection: ActionSelection): InteractiveStoryState {
  const branch = activeBranch(state);
  const parent = turnById(state, branch.headTurnId);
  if (!parent) throw new Error("active branch head is missing");
  const customAction = selection.customAction?.trim() ?? "";
  const choice = selection.choiceId ? parent.offeredChoices.find((candidate) => candidate.id === selection.choiceId) : null;
  if (!choice && !customAction) throw new Error("action selection is empty");
  const action = choice?.label ?? customAction;
  const sequence = state.nextTurnSequence;
  const signals = choice?.preferenceSignals ?? customSignals(action);
  const deltas = choice?.deltas ?? [{ id: `delta-custom-${sequence}`, targetNodeId: "protagonist", label: "自主行动", before: "沿预设选择", after: action }];
  const scene = choice?.resultScene ?? `${world.nodes.find((node) => node.id === "protagonist")?.label ?? "主角"}没有选择任何写好的答案，而是说：“${action}”故事因此偏离了原来的预测，新的后果还在暗处生长。`;
  const turn: InteractiveTurn = {
    id: `turn-${sequence}`,
    parentId: parent.id,
    branchId: branch.id,
    depth: parent.depth + 1,
    scene,
    offeredChoices: nextChoices(world, parent.depth + 1),
    selectedAction: action,
    selectedChoiceId: choice?.id ?? null,
    preferenceSignals: signals,
    deltas,
    memoryUpdates: [],
    canonStatus: "sandbox",
    order: sequence,
  };
  return {
    ...state,
    turns: [...state.turns, turn],
    branches: state.branches.map((candidate) => candidate.id === branch.id ? { ...candidate, headTurnId: turn.id } : candidate),
    nextTurnSequence: sequence + 1,
  };
}

export function selectedActionFor(state: InteractiveStoryState, selection: ActionSelection) {
  const parent = turnById(state, activeBranch(state).headTurnId);
  if (!parent) throw new Error("active branch head is missing");
  const custom = selection.customAction?.trim() ?? "";
  const choice = selection.choiceId ? parent.offeredChoices.find((candidate) => candidate.id === selection.choiceId) : null;
  const action = choice?.label ?? custom;
  if (!action) throw new Error("action selection is empty");
  return { action, selectedChoiceId: choice?.id ?? null, parent };
}

export function appendGeneratedInteractiveTurn(
  state: InteractiveStoryState,
  selection: ActionSelection,
  generated: GeneratedTurnPayload,
): InteractiveStoryState {
  const branch = activeBranch(state);
  const { action, selectedChoiceId, parent } = selectedActionFor(state, selection);
  const sequence = state.nextTurnSequence;
  const turn: InteractiveTurn = {
    id: `turn-${sequence}`,
    parentId: parent.id,
    branchId: branch.id,
    depth: parent.depth + 1,
    scene: generated.scene,
    offeredChoices: generated.choices.map((choice, index) => ({
      id: `ai-${sequence}-${index + 1}`,
      label: choice.label,
      hint: choice.hint,
      resultScene: "",
      preferenceSignals: [...choice.preferenceSignals],
      deltas: choice.predictedDeltas.map((delta, deltaIndex) => ({
        ...delta,
        id: `ai-predicted-${sequence}-${index + 1}-${deltaIndex + 1}`,
      })),
    })),
    selectedAction: action,
    selectedChoiceId,
    preferenceSignals: [...generated.preferenceSignals],
    deltas: generated.deltas.map((delta, index) => ({ ...delta, id: `ai-delta-${sequence}-${index + 1}` })),
    memoryUpdates: generated.memoryUpdates.map((update, index) => ({
      ...update,
      id: `memory-${sequence}-${index + 1}`,
      relevantNodeIds: [...update.relevantNodeIds],
      sourceTurnId: `turn-${sequence}`,
    })),
    canonStatus: "sandbox",
    order: sequence,
  };
  return {
    ...state,
    turns: [...state.turns, turn],
    branches: state.branches.map((candidate) => candidate.id === branch.id ? { ...candidate, headTurnId: turn.id } : candidate),
    nextTurnSequence: sequence + 1,
  };
}

export function forkInteractiveBranch(
  state: InteractiveStoryState,
  fromTurnId: string,
  title?: string,
  checkpointId: string | null = null,
): InteractiveStoryState {
  if (!turnById(state, fromTurnId)) throw new Error("branch source turn is missing");
  if (!branchPath(state).some((turn) => turn.id === fromTurnId)) throw new Error("branch source turn is outside active path");
  const sequence = state.nextBranchSequence;
  const branch: StoryBranch = {
    id: `branch-${sequence}`,
    title: title?.trim().slice(0, 60) || `如果当时 · ${sequence}`,
    fromTurnId,
    headTurnId: fromTurnId,
    checkpointId,
    order: sequence,
  };
  return {
    ...state,
    branches: [...state.branches, branch],
    activeBranchId: branch.id,
    nextBranchSequence: sequence + 1,
  };
}

export function createStoryCheckpoint(
  state: InteractiveStoryState,
  turnId: string,
  title: string,
  createdAt = new Date().toISOString(),
): InteractiveStoryState {
  const normalizedTitle = title.trim().replaceAll(/\s+/g, " ").slice(0, 40);
  if (!normalizedTitle) throw new Error("checkpoint title is empty");
  if (!branchPath(state).some((turn) => turn.id === turnId)) throw new Error("checkpoint turn is outside active path");
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("checkpoint timestamp is invalid");
  const sequence = state.nextCheckpointSequence;
  const sameTitleCount = state.checkpoints.filter((checkpoint) => checkpoint.title === normalizedTitle).length;
  const checkpoint: StoryCheckpoint = {
    id: `checkpoint-${sequence}`,
    title: sameTitleCount ? `${normalizedTitle} (${sameTitleCount + 1})`.slice(0, 40) : normalizedTitle,
    turnId,
    branchId: state.activeBranchId,
    createdAt,
    order: sequence,
  };
  return {
    ...state,
    checkpoints: [...state.checkpoints, checkpoint],
    nextCheckpointSequence: sequence + 1,
  };
}

export function forkFromCheckpoint(state: InteractiveStoryState, checkpointId: string): InteractiveStoryState {
  const checkpoint = state.checkpoints.find((item) => item.id === checkpointId);
  if (!checkpoint) throw new Error("checkpoint is missing");
  if (!branchPath(state).some((turn) => turn.id === checkpoint.turnId)) {
    const sourceBranch = state.branches.find((branch) => branch.id === checkpoint.branchId);
    if (!sourceBranch) throw new Error("checkpoint branch is missing");
    state = { ...state, activeBranchId: sourceBranch.id };
  }
  return forkInteractiveBranch(state, checkpoint.turnId, `${checkpoint.title} · 新走线`, checkpoint.id);
}

export function renameInteractiveBranch(state: InteractiveStoryState, branchId: string, title: string): InteractiveStoryState {
  const normalizedTitle = title.trim().replaceAll(/\s+/g, " ").slice(0, 60);
  if (!normalizedTitle) throw new Error("branch title is empty");
  if (!state.branches.some((branch) => branch.id === branchId)) throw new Error("branch is missing");
  return {
    ...state,
    branches: state.branches.map((branch) => branch.id === branchId ? { ...branch, title: normalizedTitle } : branch),
  };
}

export function switchInteractiveBranch(state: InteractiveStoryState, branchId: string): InteractiveStoryState {
  if (!state.branches.some((branch) => branch.id === branchId)) throw new Error("branch is missing");
  return { ...state, activeBranchId: branchId };
}

export function preferenceSummary(state: InteractiveStoryState) {
  const counts = new Map<string, number>();
  for (const turn of branchPath(state)) {
    for (const signal of turn.preferenceSignals) counts.set(signal, (counts.get(signal) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([label, count]) => ({ label, count }));
}

function compactText(value: string, limit: number) {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

export function composeBranchSparseMemory(
  state: InteractiveStoryState,
  branchId = state.activeBranchId,
  query = "",
  relevantNodeIds: readonly string[] = [],
): BranchSparseMemory {
  const path = branchPath(state, branchId);
  if (path.length === 0) throw new Error("branch is missing");
  const pathIds = new Set(path.map((turn) => turn.id));
  const recent = path.slice(-3);
  const earlier = path.slice(0, Math.max(0, path.length - recent.length));
  const factMap = new Map<string, BranchSparseMemory["facts"][number]>();
  for (const turn of path) {
    for (const delta of turn.deltas) {
      factMap.set(`${delta.targetNodeId}\u0000${delta.label}`, {
        targetNodeId: delta.targetNodeId,
        label: compactText(delta.label, 120),
        value: compactText(delta.after, 500),
        sourceTurnId: turn.id,
      });
    }
  }
  const earlierSummary = earlier
    .filter((turn) => turn.selectedAction)
    .map((turn) => `${turn.selectedAction}：${compactText(turn.scene, 280)}`)
    .join("\n");
  const head = path.at(-1)!;
  const ledger = foldNarrativeLedger(state, branchId);
  const ledgerStats = emptyLedgerStats();
  for (const entry of ledger) ledgerStats[entry.kind] += 1;
  const retrievalQuery = `${query} ${head.scene} ${head.offeredChoices.map((choice) => choice.label).join(" ")}`;
  const selectedBranch = state.branches.find((branch) => branch.id === branchId)!;
  return {
    branchId,
    headTurnId: head.id,
    checkpointTrail: state.checkpoints
      .filter((checkpoint) => pathIds.has(checkpoint.turnId))
      .sort((left, right) => left.order - right.order)
      .slice(-12)
      .map((checkpoint) => ({ checkpointId: checkpoint.id, title: checkpoint.title, turnId: checkpoint.turnId })),
    earlierSummary: compactText(earlierSummary, 2_400),
    recentScenes: recent.map((turn) => ({
      turnId: turn.id,
      action: compactText(turn.selectedAction ?? "故事开篇", 240),
      scene: compactText(turn.scene, 1_200),
    })),
    facts: [...factMap.values()].slice(-24),
    openThreads: [
      ...(selectedBranch.forecastIntent ? [`推演候选方向：${compactText(selectedBranch.forecastIntent, 800)}`] : []),
      ...head.offeredChoices.slice(0, 5).map((choice) => compactText(choice.label, 240)),
    ].slice(0, 5),
    ledgerStats,
    retrievedLedger: retrieveNarrativeLedger(ledger, retrievalQuery, relevantNodeIds),
  };
}

function emptyLedgerStats(): Record<NarrativeMemoryKind, number> {
  return {
    character_state: 0,
    relationship: 0,
    timeline: 0,
    item: 0,
    foreshadowing: 0,
    promise: 0,
  };
}

export function foldNarrativeLedger(state: InteractiveStoryState, branchId = state.activeBranchId): NarrativeLedgerEntry[] {
  const ledger = new Map<string, NarrativeLedgerEntry>();
  for (const turn of branchPath(state, branchId)) {
    for (const update of turn.memoryUpdates) {
      ledger.set(`${update.kind}\u0000${update.key}`, { ...update, relevantNodeIds: [...update.relevantNodeIds], updatedAtOrder: turn.order });
    }
  }
  return [...ledger.values()].sort((left, right) => left.updatedAtOrder - right.updatedAtOrder || left.key.localeCompare(right.key));
}

function retrievalTokens(value: string) {
  const normalized = value.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, " ").trim();
  const tokens = new Set(normalized.split(/\s+/).filter((token) => token.length > 1));
  const compact = normalized.replaceAll(" ", "");
  for (let index = 0; index < compact.length - 1; index += 1) tokens.add(compact.slice(index, index + 2));
  return tokens;
}

export function retrieveNarrativeLedger(
  ledger: readonly NarrativeLedgerEntry[],
  query: string,
  relevantNodeIds: readonly string[] = [],
  limit = 12,
) {
  const queryTokens = retrievalTokens(query);
  const nodeIds = new Set(relevantNodeIds);
  return ledger
    .map((entry) => {
      const tokens = retrievalTokens(`${entry.key} ${entry.value}`);
      let score = entry.status === "active" ? 0.25 : 0;
      for (const token of queryTokens) if (tokens.has(token)) score += token.length > 2 ? 2 : 1;
      for (const nodeId of entry.relevantNodeIds) if (nodeIds.has(nodeId)) score += 5;
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.entry.updatedAtOrder - left.entry.updatedAtOrder || left.entry.key.localeCompare(right.entry.key))
    .slice(0, Math.max(0, Math.min(limit, 12)))
    .map(({ entry }) => entry);
}
