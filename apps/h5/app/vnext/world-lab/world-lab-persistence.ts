import type { InteractiveStoryState } from "./interactive-branch";
import {
  MAX_MANUSCRIPT_BYTES,
  MAX_MANUSCRIPT_TEXT_CHARACTERS,
  type CraftKnowledgeEntry,
  type ImportedManuscript,
} from "./manuscript-import";
import { validateForecastSandboxResult, type ForecastSandboxResult } from "./forecast-sandbox";
import type {
  DirectorCraftCard,
  DirectorJokeCard,
  DirectorKnowledgeCard,
  DirectorLibraryTrace,
  StoryDirectorProposal,
  WorldRecord,
} from "./world-lab-data";

const DATABASE_NAME = "erliu-world-lab";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const CURRENT_DRAFT_ID = "current-browser-draft";
// A manuscript is stored together with its chapter index and reviewable
// analysis cursor. Allow room for that metadata without turning IndexedDB
// into an unbounded cache.
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const SENSITIVE_KEYS = new Set([
  "apikey",
  "authorization",
  "cookie",
  "litellmapikey",
  "localbearertoken",
  "providertoken",
  "token",
  "upstreamapikey",
  "vnextlocalrouteadaptertoken",
  "vnextupstreamapikey",
]);
const GRAPH_DISPLAY_ROLES = ["entity", "context", "evidence"] as const;
const NARRATIVE_LAYERS = ["world", "volume", "arc", "chapter", "scene", "entity", "evidence"] as const;
const GRAPH_TRUTH_STATUSES = ["canon", "candidate", "sandbox", "rejected"] as const;
const GRAPH_SALIENCE = ["active", "supporting", "latent", "archive"] as const;

const LEGACY_WORLD_LAB_DRAFT_VERSION = 1 as const;
const CHECKPOINT_WORLD_LAB_DRAFT_VERSION = 2 as const;
const LEDGER_WORLD_LAB_DRAFT_VERSION = 3 as const;
const MANUSCRIPT_WORLD_LAB_DRAFT_VERSION = 4 as const;
export const WORLD_LAB_DRAFT_VERSION = 6 as const;

export interface WorldLabDraftSnapshot {
  version: typeof WORLD_LAB_DRAFT_VERSION;
  savedAt: string;
  worlds: WorldRecord[];
  manuscripts: ImportedManuscript[];
  /** Optional for backwards compatibility with v1-v5 local drafts. */
  craftLibrary?: CraftKnowledgeEntry[];
  /** These three libraries are director-desk aids, never canon or manuscript text. */
  directorKnowledgeCards?: DirectorKnowledgeCard[];
  directorCraftCards?: DirectorCraftCard[];
  directorJokeCards?: DirectorJokeCard[];
  forecastSandboxes: ForecastSandboxResult[];
  interactiveStories: Record<string, InteractiveStoryState>;
  activeWorldId: string | null;
  activeStoryId: string | null;
  selectedTurnId: string;
  graphScope: "chapter" | "story" | "world" | "focus";
  railView: "graph" | "canon";
  runtimeModel: string | null;
}

interface StoredDraft extends WorldLabDraftSnapshot {
  id: typeof CURRENT_DRAFT_ID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDirectorProposal(value: unknown): value is StoryDirectorProposal {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.storyId !== "string" || typeof value.sourceBranchId !== "string" || typeof value.sourceTurnId !== "string" || typeof value.userRequest !== "string" || typeof value.title !== "string" || typeof value.proposal !== "string" || !["next_scene", "near_arc", "later_arc", "conditional"].includes(String(value.timing)) || typeof value.timingReason !== "string" || typeof value.setup !== "string" || typeof value.payoff !== "string" || !isStringArray(value.involvedNodeIds) || !isStringArray(value.guardrails) || !["pending", "fulfilled", "dismissed"].includes(String(value.status)) || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (value.referenceMaterials !== undefined && (!isStringArray(value.referenceMaterials) || value.referenceMaterials.length > 8 || value.referenceMaterials.some((item) => [...item].length > 800))) return false;
  if (value.involvedNodeIds.length > 12 || value.guardrails.length > 8 || [...value.userRequest].length > 2_000 || [...value.proposal].length > 2_000) return false;
  const trace = value.trace;
  if (!isRecord(trace) || typeof trace.traceId !== "string" || typeof trace.provider !== "string" || typeof trace.model !== "string" || trace.workflowVersion !== "vnext.story-director-proposal.v1" || typeof trace.outputHash !== "string") return false;
  return true;
}

function isDirectorLibraryTrace(value: unknown): value is DirectorLibraryTrace {
  return isRecord(value) && typeof value.traceId === "string" && value.traceId.length <= 200 &&
    typeof value.provider === "string" && value.provider.length <= 100 &&
    typeof value.model === "string" && value.model.length <= 100 &&
    value.workflowVersion === "vnext.story-director-library.v1" &&
    typeof value.outputHash === "string" && value.outputHash.length <= 200;
}

function isDirectorKnowledgeCard(value: unknown): value is DirectorKnowledgeCard {
  return isRecord(value) && typeof value.id === "string" && typeof value.storyId === "string" &&
    typeof value.topic === "string" && typeof value.summary === "string" && isStringArray(value.concepts) &&
    typeof value.culturalContext === "string" && typeof value.applicationToStory === "string" &&
    typeof value.sourceNote === "string" && isStringArray(value.caveats) &&
    ["active", "dismissed"].includes(String(value.status)) && typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) && value.notCanon === true && value.notManuscript === true &&
    isDirectorLibraryTrace(value.trace) && value.concepts.length <= 12 && value.caveats.length <= 8 &&
    [...value.topic, ...value.summary, ...value.culturalContext, ...value.applicationToStory, ...value.sourceNote].length <= 12_000;
}

function isDirectorCraftCard(value: unknown): value is DirectorCraftCard {
  return isRecord(value) && typeof value.id === "string" && typeof value.storyId === "string" &&
    typeof value.title === "string" && typeof value.pattern === "string" && isStringArray(value.relatedPatterns) &&
    typeof value.useWhen === "string" && typeof value.cadence === "string" && typeof value.risk === "string" &&
    typeof value.exampleStructure === "string" && ["active", "dismissed"].includes(String(value.status)) &&
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) &&
    value.notCanon === true && value.notManuscript === true && isDirectorLibraryTrace(value.trace) &&
    value.relatedPatterns.length <= 12 && [...value.title, ...value.pattern, ...value.useWhen, ...value.cadence, ...value.risk, ...value.exampleStructure].length <= 12_000;
}

function isDirectorJokeCard(value: unknown): value is DirectorJokeCard {
  return isRecord(value) && typeof value.id === "string" && typeof value.storyId === "string" &&
    typeof value.phrase === "string" && typeof value.meaning === "string" && typeof value.category === "string" &&
    typeof value.suitableWhen === "string" && typeof value.avoidWhen === "string" && typeof value.frequencyBudget === "string" &&
    typeof value.characterFit === "string" && typeof value.plotSeed === "string" &&
    ["library_only", "opportunistic", "plot_seed"].includes(String(value.insertionMode)) &&
    ["active", "dismissed"].includes(String(value.status)) && typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) && value.notCanon === true && value.notManuscript === true &&
    isDirectorLibraryTrace(value.trace) && [...value.phrase, ...value.meaning, ...value.category, ...value.suitableWhen, ...value.avoidWhen, ...value.frequencyBudget, ...value.characterFit, ...value.plotSeed].length <= 12_000;
}

function isWorld(value: unknown): value is WorldRecord {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.genre !== "string") return false;
  if (value.sourceManuscriptId !== undefined && typeof value.sourceManuscriptId !== "string") return false;
  if (!Array.isArray(value.stories) || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || !Array.isArray(value.facts)) return false;
  if (value.stories.length > 1_000 || value.nodes.length > 20_000 || value.edges.length > 50_000 || value.facts.length > 50_000) return false;
  if (value.directorProposals !== undefined && (!Array.isArray(value.directorProposals) || value.directorProposals.length > 5_000 || !value.directorProposals.every(isDirectorProposal))) return false;
  return value.stories.every((story) => isRecord(story) && typeof story.id === "string" && typeof story.title === "string" && typeof story.premise === "string") &&
    value.nodes.every((node) => isRecord(node) && typeof node.id === "string" && typeof node.label === "string" && typeof node.summary === "string" && ["character", "place", "faction", "object", "event"].includes(String(node.kind)) && typeof node.x === "number" && typeof node.y === "number" && isStringArray(node.storyIds) && (node.displayRole === undefined || GRAPH_DISPLAY_ROLES.includes(String(node.displayRole) as typeof GRAPH_DISPLAY_ROLES[number])) && (node.narrativeLayer === undefined || NARRATIVE_LAYERS.includes(String(node.narrativeLayer) as typeof NARRATIVE_LAYERS[number])) && (node.truthStatus === undefined || GRAPH_TRUTH_STATUSES.includes(String(node.truthStatus) as typeof GRAPH_TRUTH_STATUSES[number])) && (node.salience === undefined || GRAPH_SALIENCE.includes(String(node.salience) as typeof GRAPH_SALIENCE[number])) && (node.parentNodeId === undefined || typeof node.parentNodeId === "string") && (node.volumeId === undefined || typeof node.volumeId === "string") && (node.arcId === undefined || typeof node.arcId === "string") && (node.chapterIds === undefined || isStringArray(node.chapterIds)) && (node.sourceChapterIds === undefined || isStringArray(node.sourceChapterIds)) && (node.sourceTurnId === undefined || typeof node.sourceTurnId === "string") && (node.sourceStoryId === undefined || typeof node.sourceStoryId === "string") && (node.sourceTurnId === undefined) === (node.sourceStoryId === undefined)) &&
    value.edges.every((edge) => isRecord(edge) && typeof edge.id === "string" && typeof edge.source === "string" && typeof edge.target === "string" && typeof edge.label === "string" && isStringArray(edge.storyIds) && (edge.relationType === undefined || typeof edge.relationType === "string") && (edge.truthStatus === undefined || GRAPH_TRUTH_STATUSES.includes(String(edge.truthStatus) as typeof GRAPH_TRUTH_STATUSES[number])) && (edge.sourceChapterIds === undefined || isStringArray(edge.sourceChapterIds)) && (edge.eventNodeId === undefined || typeof edge.eventNodeId === "string") && (edge.sourceTurnId === undefined || typeof edge.sourceTurnId === "string") && (edge.sourceStoryId === undefined || typeof edge.sourceStoryId === "string") && (edge.sourceTurnId === undefined) === (edge.sourceStoryId === undefined)) &&
    value.facts.every((fact) => isRecord(fact) && typeof fact.id === "string" && typeof fact.statement === "string" && typeof fact.source === "string" && ["candidate", "accepted", "rejected"].includes(String(fact.status)) && isStringArray(fact.storyIds) && (fact.targetNodeIds === undefined || (isStringArray(fact.targetNodeIds) && fact.targetNodeIds.length <= 8)));
}

function isImportedManuscript(value: unknown): value is ImportedManuscript {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.filename !== "string") return false;
  if (!["txt", "markdown"].includes(String(value.format)) || !["utf-8", "gb18030"].includes(String(value.encoding))) return false;
  if (!Number.isSafeInteger(value.sizeBytes) || (value.sizeBytes as number) <= 0 || (value.sizeBytes as number) > MAX_MANUSCRIPT_BYTES) return false;
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256) || typeof value.text !== "string" || value.text.length === 0 || value.text.length > MAX_MANUSCRIPT_TEXT_CHARACTERS) return false;
  if (value.rightsAttested !== true || typeof value.importedAt !== "string" || !Number.isFinite(Date.parse(value.importedAt))) return false;
  if (!Array.isArray(value.chapters) || value.chapters.length < 1 || value.chapters.length > 5_000 || typeof value.continuationChapterId !== "string") return false;
  const chapters = value.chapters as unknown[];
  if (!chapters.every((chapter, index) => {
    if (!isRecord(chapter) || typeof chapter.id !== "string" || typeof chapter.title !== "string" || typeof chapter.text !== "string") return false;
    if (!Number.isSafeInteger(chapter.start) || !Number.isSafeInteger(chapter.end) || (chapter.start as number) < 0 || (chapter.end as number) <= (chapter.start as number) || (chapter.end as number) > (value.text as string).length) return false;
    if (index > 0 && (chapter.start as number) !== ((chapters[index - 1] as Record<string, unknown>).end as number)) return false;
    return (value.text as string).slice(chapter.start as number, chapter.end as number).trim() === chapter.text;
  })) return false;
  return chapters.some((chapter) => (chapter as Record<string, unknown>).id === value.continuationChapterId);
}

function isCraftSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value.manuscriptId !== "string" || typeof value.manuscriptTitle !== "string" || typeof value.filename !== "string" || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256) || typeof value.genre !== "string" || !isStringArray(value.chapterIds) || value.chapterIds.length > 100 || typeof value.firstObservedAt !== "string" || !Number.isFinite(Date.parse(value.firstObservedAt)) || typeof value.lastObservedAt !== "string" || !Number.isFinite(Date.parse(value.lastObservedAt))) return false;
  return value.manuscriptId.length <= 200 && value.manuscriptTitle.length <= 500 && value.filename.length <= 500 && value.genre.length <= 200;
}

function isCraftTechnique(value: unknown): boolean {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.label !== "string" || typeof value.pattern !== "string" || typeof value.evidence !== "string" || typeof value.useWhen !== "string" || typeof value.risk !== "string") return false;
  return ["cadence", "semanticFit", "comicContrast"].every((key) => value[key] === undefined || typeof value[key] === "string") &&
    (value.sourceChapterIds === undefined || isStringArray(value.sourceChapterIds));
}

function isCraftTwist(value: unknown): boolean {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.setup !== "string" || typeof value.misdirection !== "string" || typeof value.reveal !== "string" || typeof value.payoff !== "string" || typeof value.source !== "string") return false;
  return value.sourceChapterIds === undefined || isStringArray(value.sourceChapterIds);
}

function isCraftKnowledgeEntry(value: unknown): value is CraftKnowledgeEntry {
  if (!isRecord(value) || !["technique", "twist"].includes(String(value.kind)) || typeof value.id !== "string" || typeof value.key !== "string" || !["candidate", "learned", "dismissed"].includes(String(value.status)) || !Array.isArray(value.sources) || value.sources.length > 100 || !value.sources.every(isCraftSource) || typeof value.firstSeenAt !== "string" || !Number.isFinite(Date.parse(value.firstSeenAt)) || typeof value.lastSeenAt !== "string" || !Number.isFinite(Date.parse(value.lastSeenAt))) return false;
  if (value.kind === "technique") return isCraftTechnique(value.technique);
  return isCraftTwist(value.twist);
}

function normalizeInteractiveStory(value: unknown): InteractiveStoryState | null {
  if (!isRecord(value) || typeof value.storyId !== "string" || !Array.isArray(value.turns) || !Array.isArray(value.branches)) return null;
  if (typeof value.activeBranchId !== "string" || !Number.isSafeInteger(value.nextTurnSequence) || !Number.isSafeInteger(value.nextBranchSequence)) return null;
  if (value.turns.length > 100_000 || value.branches.length > 10_000) return null;
  if (!value.turns.every((turn) => isRecord(turn) && typeof turn.id === "string" && (turn.parentId === null || typeof turn.parentId === "string") && typeof turn.branchId === "string" && typeof turn.scene === "string" && typeof turn.depth === "number" && Array.isArray(turn.offeredChoices) && isStringArray(turn.preferenceSignals) && Array.isArray(turn.deltas) && (turn.memoryUpdates === undefined || (Array.isArray(turn.memoryUpdates) && turn.memoryUpdates.length <= 12 && turn.memoryUpdates.every((update) => isRecord(update) && typeof update.id === "string" && ["character_state", "relationship", "timeline", "item", "foreshadowing", "promise"].includes(String(update.kind)) && typeof update.key === "string" && typeof update.value === "string" && ["active", "resolved"].includes(String(update.status)) && isStringArray(update.relevantNodeIds) && typeof update.sourceTurnId === "string")))) ||
    !value.branches.every((branch) => isRecord(branch) && typeof branch.id === "string" && typeof branch.title === "string" && typeof branch.headTurnId === "string" && (branch.checkpointId === undefined || branch.checkpointId === null || typeof branch.checkpointId === "string") && (branch.forecastIntent === undefined || typeof branch.forecastIntent === "string") && (branch.forecastSource === undefined || (isRecord(branch.forecastSource) && typeof branch.forecastSource.sandboxId === "string" && typeof branch.forecastSource.trajectoryId === "string")))) return null;
  const turns = value.turns.map((turn) => ({
    ...(turn as Record<string, unknown>),
    memoryUpdates: Array.isArray((turn as Record<string, unknown>).memoryUpdates) ? (turn as Record<string, unknown>).memoryUpdates : [],
  })) as unknown as InteractiveStoryState["turns"];
  const branches = value.branches as unknown as InteractiveStoryState["branches"];
  const turnIds = new Set(turns.map((turn) => turn.id));
  const branchIds = new Set(branches.map((branch) => branch.id));
  if (turnIds.size !== turns.length || branchIds.size !== branches.length || !branchIds.has(value.activeBranchId) || branches.some((branch) => !turnIds.has(branch.headTurnId)) || turns.some((turn) => turn.parentId !== null && !turnIds.has(turn.parentId)) || turns.some((turn) => turn.memoryUpdates.some((update) => update.sourceTurnId !== turn.id))) return null;
  const rawCheckpoints = value.checkpoints === undefined ? [] : value.checkpoints;
  if (!Array.isArray(rawCheckpoints) || rawCheckpoints.length > 20_000 || !rawCheckpoints.every((checkpoint) => isRecord(checkpoint) && typeof checkpoint.id === "string" && typeof checkpoint.title === "string" && typeof checkpoint.turnId === "string" && typeof checkpoint.branchId === "string" && typeof checkpoint.createdAt === "string" && Number.isFinite(Date.parse(checkpoint.createdAt)) && Number.isSafeInteger(checkpoint.order))) return null;
  const checkpoints = rawCheckpoints as unknown as InteractiveStoryState["checkpoints"];
  const checkpointIds = new Set(checkpoints.map((checkpoint) => checkpoint.id));
  if (checkpointIds.size !== checkpoints.length || checkpoints.some((checkpoint) => !turnIds.has(checkpoint.turnId) || !branchIds.has(checkpoint.branchId)) || branches.some((branch) => branch.checkpointId && !checkpointIds.has(branch.checkpointId))) return null;
  for (const checkpoint of checkpoints) {
    const branch = branches.find((candidate) => candidate.id === checkpoint.branchId)!;
    let turnId: string | null = branch.headTurnId;
    const visited = new Set<string>();
    while (turnId && !visited.has(turnId) && turnId !== checkpoint.turnId) {
      visited.add(turnId);
      turnId = turns.find((turn) => turn.id === turnId)?.parentId ?? null;
    }
    if (turnId !== checkpoint.turnId) return null;
  }
  const nextCheckpointSequence = value.nextCheckpointSequence === undefined ? 1 : value.nextCheckpointSequence;
  if (!Number.isSafeInteger(nextCheckpointSequence) || (nextCheckpointSequence as number) < 1) return null;
  return {
    storyId: value.storyId,
    turns,
    branches,
    checkpoints,
    activeBranchId: value.activeBranchId,
    nextTurnSequence: value.nextTurnSequence as number,
    nextBranchSequence: value.nextBranchSequence as number,
    nextCheckpointSequence: Math.max(nextCheckpointSequence as number, ...checkpoints.map((checkpoint) => checkpoint.order + 1), 1),
  };
}

function containsSensitiveKey(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item, seen));
  return Object.entries(value).some(([key, item]) =>
    SENSITIVE_KEYS.has(key.replaceAll(/[_-]/g, "").toLowerCase()) || containsSensitiveKey(item, seen),
  );
}

export function validateWorldLabDraft(value: unknown): WorldLabDraftSnapshot | null {
  if (!isRecord(value) || ![LEGACY_WORLD_LAB_DRAFT_VERSION, CHECKPOINT_WORLD_LAB_DRAFT_VERSION, LEDGER_WORLD_LAB_DRAFT_VERSION, MANUSCRIPT_WORLD_LAB_DRAFT_VERSION, 5, WORLD_LAB_DRAFT_VERSION].includes(value.version as 1 | 2 | 3 | 4 | 5 | 6) || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) return null;
  if (!Array.isArray(value.worlds) || value.worlds.length > 100 || !value.worlds.every(isWorld) || !isRecord(value.interactiveStories)) return null;
  const manuscripts = value.manuscripts === undefined ? [] : value.manuscripts;
  if (!Array.isArray(manuscripts) || manuscripts.length > 100 || !manuscripts.every(isImportedManuscript)) return null;
  const manuscriptIds = new Set((manuscripts as ImportedManuscript[]).map((manuscript) => manuscript.id));
  if ((value.worlds as WorldRecord[]).some((world) => world.sourceManuscriptId && !manuscriptIds.has(world.sourceManuscriptId))) return null;
  const rawCraftLibrary = value.craftLibrary;
  if (rawCraftLibrary !== undefined && (!Array.isArray(rawCraftLibrary) || rawCraftLibrary.length > 5_000 || !rawCraftLibrary.every(isCraftKnowledgeEntry))) return null;
  const craftLibrary = rawCraftLibrary as CraftKnowledgeEntry[] | undefined;
  const rawDirectorKnowledgeCards = value.directorKnowledgeCards;
  const rawDirectorCraftCards = value.directorCraftCards;
  const rawDirectorJokeCards = value.directorJokeCards;
  if (rawDirectorKnowledgeCards !== undefined && (!Array.isArray(rawDirectorKnowledgeCards) || rawDirectorKnowledgeCards.length > 5_000 || !rawDirectorKnowledgeCards.every(isDirectorKnowledgeCard))) return null;
  if (rawDirectorCraftCards !== undefined && (!Array.isArray(rawDirectorCraftCards) || rawDirectorCraftCards.length > 5_000 || !rawDirectorCraftCards.every(isDirectorCraftCard))) return null;
  if (rawDirectorJokeCards !== undefined && (!Array.isArray(rawDirectorJokeCards) || rawDirectorJokeCards.length > 5_000 || !rawDirectorJokeCards.every(isDirectorJokeCard))) return null;
  const directorKnowledgeCards = rawDirectorKnowledgeCards as DirectorKnowledgeCard[] | undefined;
  const directorCraftCards = rawDirectorCraftCards as DirectorCraftCard[] | undefined;
  const directorJokeCards = rawDirectorJokeCards as DirectorJokeCard[] | undefined;
  const rawForecasts = value.forecastSandboxes === undefined ? [] : value.forecastSandboxes;
  if (!Array.isArray(rawForecasts) || rawForecasts.length > 100) return null;
  const forecastSandboxes = rawForecasts.map(validateForecastSandboxResult);
  if (forecastSandboxes.some((forecast) => forecast === null)) return null;
  if (Object.keys(value.interactiveStories).length > 10_000) return null;
  const interactiveStories = Object.fromEntries(Object.entries(value.interactiveStories).map(([storyId, story]) => [storyId, normalizeInteractiveStory(story)]));
  if (Object.values(interactiveStories).some((story) => story === null)) return null;
  for (const forecast of forecastSandboxes as ForecastSandboxResult[]) {
    const state = interactiveStories[forecast.sourceStoryId];
    const world = (value.worlds as WorldRecord[]).find((item) => item.stories.some((story) => story.id === forecast.sourceStoryId));
    const sourceBranch = state?.branches.find((branch) => branch.id === forecast.sourceBranchId);
    if (!state || !world || !sourceBranch || forecast.actors.some((actor) => !world.nodes.some((node) => node.id === actor.nodeId && node.kind === "character"))) return null;
    let lineageTurnId: string | null = sourceBranch.headTurnId;
    const visited = new Set<string>();
    while (lineageTurnId && !visited.has(lineageTurnId) && lineageTurnId !== forecast.sourceTurnId) {
      visited.add(lineageTurnId);
      lineageTurnId = state.turns.find((turn) => turn.id === lineageTurnId)?.parentId ?? null;
    }
    if (lineageTurnId !== forecast.sourceTurnId) return null;
  }
  const forecastById = new Map((forecastSandboxes as ForecastSandboxResult[]).map((forecast) => [forecast.id, forecast]));
  for (const state of Object.values(interactiveStories) as InteractiveStoryState[]) {
    for (const branch of state.branches) {
      if (!branch.forecastSource) continue;
      const forecast = forecastById.get(branch.forecastSource.sandboxId);
      if (!forecast || forecast.sourceStoryId !== state.storyId || !forecast.trajectories.some((trajectory) => trajectory.id === branch.forecastSource!.trajectoryId) || !branch.forecastIntent?.trim()) return null;
    }
  }
  if (value.activeWorldId !== null && typeof value.activeWorldId !== "string") return null;
  if (value.activeStoryId !== null && typeof value.activeStoryId !== "string") return null;
  if (typeof value.selectedTurnId !== "string") return null;
  if (!["chapter", "story", "world", "focus"].includes(String(value.graphScope))) return null;
  if (!["graph", "canon"].includes(String(value.railView))) return null;
  if (value.runtimeModel !== null && typeof value.runtimeModel !== "string") return null;
  if (value.activeWorldId && !value.worlds.some((world) => world.id === value.activeWorldId)) return null;
  if (value.activeStoryId && !value.worlds.some((world) => world.stories.some((story) => story.id === value.activeStoryId))) return null;
  if (containsSensitiveKey(value)) return null;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SNAPSHOT_BYTES) return null;
  } catch {
    return null;
  }
  return {
    version: WORLD_LAB_DRAFT_VERSION,
    savedAt: value.savedAt,
    worlds: value.worlds as WorldRecord[],
    manuscripts: manuscripts as ImportedManuscript[],
    ...(craftLibrary ? { craftLibrary } : {}),
    ...(directorKnowledgeCards ? { directorKnowledgeCards } : {}),
    ...(directorCraftCards ? { directorCraftCards } : {}),
    ...(directorJokeCards ? { directorJokeCards } : {}),
    forecastSandboxes: forecastSandboxes as ForecastSandboxResult[],
    interactiveStories: interactiveStories as Record<string, InteractiveStoryState>,
    activeWorldId: value.activeWorldId as string | null,
    activeStoryId: value.activeStoryId as string | null,
    selectedTurnId: value.selectedTurnId,
    graphScope: value.graphScope as WorldLabDraftSnapshot["graphScope"],
    railView: value.railView as WorldLabDraftSnapshot["railView"],
    runtimeModel: value.runtimeModel as string | null,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
    request.onblocked = () => reject(new Error("indexeddb_blocked"));
  });
}

export async function loadWorldLabDraft(): Promise<WorldLabDraftSnapshot | null> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database!.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_DRAFT_ID);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("indexeddb_read_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_read_aborted"));
    });
    return validateWorldLabDraft(value);
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function saveWorldLabDraft(snapshot: WorldLabDraftSnapshot): Promise<void> {
  const validated = validateWorldLabDraft(snapshot);
  if (!validated) throw new Error("invalid_local_draft");
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ ...validated, id: CURRENT_DRAFT_ID } satisfies StoredDraft);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_write_aborted"));
    });
  } finally {
    database.close();
  }
}

export async function clearWorldLabDraft(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(CURRENT_DRAFT_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_delete_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_delete_aborted"));
    });
  } finally {
    database.close();
  }
}
