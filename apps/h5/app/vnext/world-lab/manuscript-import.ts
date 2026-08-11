import type { InteractiveChoice, NarrativeMemoryKind, NarrativeMemoryStatus } from "./interactive-branch";
import type { CharacterProfile, GraphDisplayRole, NarrativeLayer, NodeKind, WorldRecord } from "./world-lab-data";

/** A local-only source can be larger than the first prototype's 5 MiB cap,
 * but it still needs a predictable browser-memory ceiling. Keep this limit in
 * bytes so the file gate and the IndexedDB validator share one source of truth. */
export const MAX_MANUSCRIPT_BYTES = 15 * 1024 * 1024;
export const MAX_MANUSCRIPT_TEXT_CHARACTERS = 16_000_000;
export const MAX_ANALYSIS_CHARACTERS = 24_000;
export const MAX_INCREMENTAL_ANALYSIS_CHARACTERS = 18_000;

export interface ImportedChapter {
  id: string;
  title: string;
  start: number;
  end: number;
  text: string;
}

export interface ManuscriptAnalysisBatch {
  id: string;
  chapterIds: string[];
  chapterTitles: string[];
  text: string;
}

export type ManuscriptAnalysisTaskStatus = "running" | "completed" | "failed";
export type ManuscriptAnalysisTaskStage = "overview" | "batch";
export type ManuscriptAnalysisTaskRunMode = "single" | "auto";

/**
 * UI-level task state. The request still runs in this browser tab, but it is
 * deliberately owned by the page rather than the modal so closing the modal
 * does not cancel an in-flight analysis.
 */
export interface ManuscriptAnalysisTask {
  id: string;
  manuscriptId: string;
  filename: string;
  stage: ManuscriptAnalysisTaskStage;
  runMode: ManuscriptAnalysisTaskRunMode;
  status: ManuscriptAnalysisTaskStatus;
  completedBatches: number;
  totalBatches: number;
  startedAt: string;
  /** A graceful stop is observed only after the current model request settles. */
  stopRequested?: boolean;
  completedAt?: string;
  /** User-facing failure detail retained after the dialog is closed. */
  error?: string;
}

export type ImportedChapterSourceQuality = "complete" | "short" | "preview" | "suspicious";

export interface ManuscriptSourceInspection {
  chapterQuality: Array<{ chapterId: string; quality: ImportedChapterSourceQuality; selectable: boolean }>;
  completeChapters: number;
  shortChapters: number;
  previewChapters: number;
  suspiciousChapters: number;
  selectableChapters: number;
  availableCharacters: number;
  isPartial: boolean;
  firstUnavailableChapterId?: string;
  recommendedContinuationChapterId: string;
  noise: {
    urlLines: number;
    htmlLines: number;
    commonReaderAdLines: number;
    replacementCharacters: number;
  };
}

export interface ImportedManuscript {
  id: string;
  title: string;
  filename: string;
  format: "txt" | "markdown";
  encoding: "utf-8" | "gb18030";
  sizeBytes: number;
  sha256: string;
  text: string;
  chapters: ImportedChapter[];
  continuationChapterId: string;
  rightsAttested: true;
  importedAt: string;
  analysis?: ManuscriptAnalysis;
  analysisBatchCursor?: number;
}

export interface ManuscriptAnalysisNode {
  key: string;
  label: string;
  kind: NodeKind;
  summary: string;
  isProtagonist: boolean;
  role: string;
  tagline: string;
  displayRole?: GraphDisplayRole;
  narrativeLayer?: NarrativeLayer;
  parentNodeKey?: string;
  sourceChapterIds?: string[];
}

/** Reusable craft evidence, deliberately separated from world/canon facts. */
export interface ManuscriptStyleTechnique {
  key: string;
  label: string;
  pattern: string;
  evidence: string;
  cadence?: string;
  semanticFit?: string;
  comicContrast?: string;
  useWhen: string;
  risk: string;
  readerEffect?: string;
  evidenceRequired?: string[];
  payoffCondition?: string;
  compatibleGenres?: string[];
  arcStage?: "opening" | "escalation" | "midpoint" | "pre_climax" | "payoff" | "any";
  variants?: string[];
  combinesWith?: string[];
  confidence?: "low" | "medium" | "high";
  truthStatus?: "candidate" | "reference" | "author_decision";
  stableOrAccidental?: "stable" | "recurring_variant" | "isolated" | "unresolved";
  sourceChapterIds?: string[];
}

/** Candidate suspense/reversal structures, not a promise that the source's
 * exact reveal or wording should be copied into a new manuscript. */
export interface ManuscriptTwistSeed {
  key: string;
  setup: string;
  misdirection: string;
  reveal: string;
  payoff: string;
  source: string;
  arcStage?: "opening" | "escalation" | "midpoint" | "pre_climax" | "payoff" | "any";
  confidence?: "low" | "medium" | "high";
  truthStatus?: "candidate" | "reference" | "author_decision";
  stableOrAccidental?: "stable" | "recurring_variant" | "isolated" | "unresolved";
  sourceChapterIds?: string[];
}

export type ManuscriptKnowledgeKind =
  | "world_rule"
  | "domain_reference"
  | "culture_motif"
  | "progression_rule"
  | "institution_rule"
  | "symbol_system";

export interface ManuscriptKnowledgeCard {
  key: string;
  label: string;
  kind: ManuscriptKnowledgeKind;
  coreStatement: string;
  sourceUse: string;
  dramaticTranslation: string;
  externalReference?: string;
  requires?: string[];
  causes?: string[];
  costs?: string[];
  exceptions?: string[];
  misuseRisk: string;
  sourceType?: "imported_text" | "research" | "user" | "model_candidate" | "author_decision";
  truthStatus?: "reference" | "candidate" | "canon" | "rejected";
  confidence?: "low" | "medium" | "high";
  stableOrAccidental?: "stable" | "recurring_variant" | "isolated" | "unresolved";
  sourceChapterIds?: string[];
}

export interface ManuscriptExpressionObservation {
  key: string;
  scope: "chapter" | "arc" | "work";
  narrativeDistance: string;
  pointOfViewPattern: string;
  sentenceLengthProfile: string;
  paragraphDensity: string;
  dialogueNarrationRatio: string;
  actionPsychologyRatio: string;
  cadence: string;
  informationReleaseRate: string;
  chapterHookPattern: string;
  toneSwitchPattern: string;
  languageDevices: string[];
  evidence: string;
  misuseRisk: string;
  confidence?: "low" | "medium" | "high";
  truthStatus?: "candidate" | "reference" | "author_decision";
  sourceChapterIds?: string[];
}

export interface ManuscriptDistillationSummary {
  protocol: "manuscript-distillation.v2";
  status: "observations" | "book-reduced";
  observedChapterIds: string[];
  coverageRatio: number;
  localObservationCounts: {
    facts: number;
    knowledgeCards: number;
    techniques: number;
    twists: number;
    expressions: number;
  };
  recurringTechniqueKeys: string[];
  recurringKnowledgeKeys: string[];
  unresolvedTechniqueKeys: string[];
  reducedAt: string;
}

export type CraftKnowledgeKind = "technique" | "twist";
export type CraftKnowledgeStatus = "candidate" | "learned" | "dismissed";

export interface CraftKnowledgeSource {
  manuscriptId: string;
  manuscriptTitle: string;
  filename: string;
  sha256: string;
  genre: string;
  chapterIds: string[];
  firstObservedAt: string;
  lastObservedAt: string;
}

/**
 * A durable local craft-library entry. It is intentionally not part of
 * WorldRecord: a writing technique is reusable evidence, not a fact about the
 * story being written.
 */
export type CraftKnowledgeEntry =
  | {
      kind: "technique";
      id: string;
      key: string;
      status: CraftKnowledgeStatus;
      technique: ManuscriptStyleTechnique;
      sources: CraftKnowledgeSource[];
      firstSeenAt: string;
      lastSeenAt: string;
    }
  | {
      kind: "twist";
      id: string;
      key: string;
      status: CraftKnowledgeStatus;
      twist: ManuscriptTwistSeed;
      sources: CraftKnowledgeSource[];
      firstSeenAt: string;
      lastSeenAt: string;
    };

export interface ManuscriptAnalysis {
  distillationProtocol?: "manuscript-distillation.v2";
  genre: string;
  storyTitle: string;
  continuationBrief: string;
  nodes: ManuscriptAnalysisNode[];
  edges: Array<{
    sourceKey: string;
    targetKey: string;
    label: string;
    relationType?: string;
    eventNodeKey?: string;
    sourceChapterIds?: string[];
  }>;
  facts: Array<{ statement: string; source: string; targetNodeKeys?: string[]; sourceChapterIds?: string[] }>;
  memoryUpdates: Array<{
    kind: NarrativeMemoryKind;
    key: string;
    value: string;
    status: NarrativeMemoryStatus;
    relevantNodeKeys: string[];
  }>;
  choices: Array<{
    label: string;
    hint: string;
    preferenceSignals: string[];
  }>;
  styleTechniques?: ManuscriptStyleTechnique[];
  twistSeeds?: ManuscriptTwistSeed[];
  knowledgeCards?: ManuscriptKnowledgeCard[];
  expressionObservations?: ManuscriptExpressionObservation[];
  distillation?: ManuscriptDistillationSummary;
  integrityWarnings?: string[];
  trace: {
    traceId: string;
    provider: string;
    model: string;
    workflowVersion: "vnext.manuscript-import.v1";
    outputHash: string;
  };
  fallbackApplied: false;
}

const CHAPTER_HEADING = /^(?:#{1,3}[ \t]+(.{1,80})|[ \t]*(第[零〇一二三四五六七八九十百千万两\d]{1,12}[章回卷节部篇])(?:[ \t]*[：:、.．-]?[ \t]*)(.{0,60}))[ \t]*$/u;
const PREVIEW_MAX_CHARACTERS = 300;
const PREVIEW_RUN_LENGTH = 3;
const COMMON_READER_NOISE = /最新网址|手机用户请|请收藏|加入书签|求收藏|求推荐|本章未完|点击下一页|小说网|备用网址|无弹窗|章节错误/iu;

function stripExtension(filename: string) {
  return filename.replace(/\.(?:txt|md|markdown)$/iu, "").trim() || "未命名小说";
}

function fileFormat(filename: string, mimeType: string): ImportedManuscript["format"] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || mimeType === "text/markdown") return "markdown";
  if (lower.endsWith(".txt") || mimeType === "text/plain" || mimeType === "") return "txt";
  throw new Error("unsupported_file_type");
}

function normalizeText(value: string) {
  const normalized = value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  if (!normalized.trim() || normalized.includes("\0")) throw new Error("invalid_manuscript_text");
  return normalized;
}

export function decodeManuscriptBytes(bytes: Uint8Array) {
  try {
    return { text: normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), encoding: "utf-8" as const };
  } catch {
    try {
      return { text: normalizeText(new TextDecoder("gb18030", { fatal: true }).decode(bytes)), encoding: "gb18030" as const };
    } catch {
      throw new Error("unsupported_text_encoding");
    }
  }
}

export function splitManuscriptChapters(text: string): ImportedChapter[] {
  const normalized = normalizeText(text);
  const headings: Array<{ start: number; title: string }> = [];
  let offset = 0;
  for (const line of normalized.split("\n")) {
    const match = line.match(CHAPTER_HEADING);
    if (match) {
      const title = (match[1] ?? `${match[2] ?? ""}${match[3] ? ` ${match[3].trim()}` : ""}`).trim();
      if (title) headings.push({ start: offset, title });
    }
    offset += line.length + 1;
  }
  if (headings.length === 0 || headings.length > 5_000) {
    if (headings.length > 5_000) throw new Error("too_many_chapters");
    return [{ id: "chapter-1", title: "全文（未检测到章节标题）", start: 0, end: normalized.length, text: normalized }];
  }
  const boundaries = [...headings];
  if (headings[0]!.start > 0 && normalized.slice(0, headings[0]!.start).trim()) {
    boundaries.unshift({ start: 0, title: "序章 / 章前内容" });
  }
  return boundaries.map((heading, index) => {
    const end = boundaries[index + 1]?.start ?? normalized.length;
    return {
      id: `chapter-${index + 1}`,
      title: heading.title,
      start: heading.start,
      end,
      text: normalized.slice(heading.start, end).trim(),
    };
  });
}

function hasPreviewEnding(text: string) {
  const value = text.trimEnd();
  return value.endsWith("...") || value.endsWith("…");
}

function looksLikePreview(chapter: ImportedChapter) {
  return chapter.text.length < PREVIEW_MAX_CHARACTERS && hasPreviewEnding(chapter.text);
}

function previewZoneStart(chapters: ImportedChapter[]) {
  for (let index = 0; index <= chapters.length - PREVIEW_RUN_LENGTH; index += 1) {
    if (chapters.slice(index, index + PREVIEW_RUN_LENGTH).every(looksLikePreview)) return index;
  }
  return -1;
}

export function inspectManuscriptSource(manuscript: Pick<ImportedManuscript, "text" | "chapters">): ManuscriptSourceInspection {
  const zoneStart = previewZoneStart(manuscript.chapters);
  const chapterQuality = manuscript.chapters.map((chapter, index) => {
    let quality: ImportedChapterSourceQuality;
    if (zoneStart >= 0 && index >= zoneStart) {
      quality = looksLikePreview(chapter) ? "preview" : chapter.text.length < PREVIEW_MAX_CHARACTERS ? "suspicious" : "complete";
    } else {
      quality = chapter.text.length < PREVIEW_MAX_CHARACTERS ? "short" : "complete";
    }
    return { chapterId: chapter.id, quality, selectable: quality === "complete" || quality === "short" };
  });
  const qualityCount = (quality: ImportedChapterSourceQuality) => chapterQuality.filter((chapter) => chapter.quality === quality).length;
  const selectableIds = new Set(chapterQuality.filter((chapter) => chapter.selectable).map((chapter) => chapter.chapterId));
  const lines = manuscript.text.split("\n");
  const previewChapters = qualityCount("preview");
  const suspiciousChapters = qualityCount("suspicious");
  const firstUnavailableIndex = chapterQuality.findIndex((chapter) => !chapter.selectable);
  const firstUnavailableChapterId = chapterQuality.find((chapter) => !chapter.selectable)?.chapterId;
  const reliablePrefix = chapterQuality.slice(0, firstUnavailableIndex < 0 ? chapterQuality.length : firstUnavailableIndex);
  const recommendedContinuationChapterId = reliablePrefix.filter((chapter) => chapter.quality === "complete").at(-1)?.chapterId
    ?? reliablePrefix.filter((chapter) => chapter.selectable).at(-1)?.chapterId
    ?? chapterQuality.filter((chapter) => chapter.selectable).at(-1)?.chapterId;
  if (!recommendedContinuationChapterId) throw new Error("no_complete_chapters");
  return {
    chapterQuality,
    completeChapters: qualityCount("complete"),
    shortChapters: qualityCount("short"),
    previewChapters,
    suspiciousChapters,
    selectableChapters: selectableIds.size,
    availableCharacters: manuscript.chapters.filter((chapter) => selectableIds.has(chapter.id)).reduce((total, chapter) => total + chapter.text.length, 0),
    isPartial: previewChapters > 0 || suspiciousChapters > 0,
    ...(firstUnavailableChapterId ? { firstUnavailableChapterId } : {}),
    recommendedContinuationChapterId,
    noise: {
      urlLines: lines.filter((line) => /https?:\/\/|www\./iu.test(line)).length,
      htmlLines: lines.filter((line) => /<\/?[a-z][^>]*>/iu.test(line)).length,
      commonReaderAdLines: lines.filter((line) => COMMON_READER_NOISE.test(line)).length,
      replacementCharacters: [...manuscript.text].filter((character) => character === "�").length,
    },
  };
}

export function chapterSourceQuality(manuscript: Pick<ImportedManuscript, "text" | "chapters">, chapterId: string) {
  return inspectManuscriptSource(manuscript).chapterQuality.find((chapter) => chapter.chapterId === chapterId);
}

async function sha256(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) throw new Error("hash_unavailable");
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function readManuscriptFile(file: File): Promise<ImportedManuscript> {
  const format = fileFormat(file.name, file.type);
  if (file.size <= 0 || file.size > MAX_MANUSCRIPT_BYTES) throw new Error("manuscript_size_invalid");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = decodeManuscriptBytes(bytes);
  const chapters = splitManuscriptChapters(decoded.text);
  const inspection = inspectManuscriptSource({ text: decoded.text, chapters });
  const continuationChapterId = inspection.recommendedContinuationChapterId;
  const digest = await sha256(bytes);
  return {
    id: `manuscript-${digest.slice(0, 16)}`,
    title: stripExtension(file.name),
    filename: file.name,
    format,
    encoding: decoded.encoding,
    sizeBytes: file.size,
    sha256: digest,
    text: decoded.text,
    chapters,
    continuationChapterId,
    rightsAttested: true,
    importedAt: new Date().toISOString(),
  };
}

export function buildManuscriptAnalysisWindow(
  manuscript: ImportedManuscript,
  continuationChapterId = manuscript.continuationChapterId,
  maximum = MAX_ANALYSIS_CHARACTERS,
) {
  const selectedIndex = manuscript.chapters.findIndex((chapter) => chapter.id === continuationChapterId);
  if (selectedIndex < 0) throw new Error("invalid_continuation_chapter");
  const inspection = inspectManuscriptSource(manuscript);
  const qualityById = new Map(inspection.chapterQuality.map((chapter) => [chapter.chapterId, chapter]));
  if (!qualityById.get(continuationChapterId)?.selectable) throw new Error("incomplete_continuation_chapter");
  const availableChapters = manuscript.chapters
    .slice(0, selectedIndex + 1)
    .filter((chapter) => qualityById.get(chapter.id)?.selectable);
  const excludedCount = selectedIndex + 1 - availableChapters.length;
  const throughSelection = inspection.isPartial
    ? availableChapters.map((chapter) => chapter.text).join("\n\n")
    : manuscript.text.slice(0, manuscript.chapters[selectedIndex]!.end);
  const sourceWarning = excludedCount > 0
    ? `[来源完整性告警：接力点之前有 ${excludedCount} 个截断预览或可疑章节未送入模型；本轮只分析 ${availableChapters.length} 个可用章节，不能据此声称理解整本。]\n\n`
    : "";
  if (sourceWarning.length + throughSelection.length <= maximum) return `${sourceWarning}${throughSelection}`;
  const omission = inspection.isPartial
    ? "\n\n[中间可用正文因本轮分析预算省略；原始文件仍保存在本机草稿]\n\n"
    : "\n\n[中间内容因本轮分析预算省略；续写时仍保存在本机原稿]\n\n";
  const contentBudget = maximum - sourceWarning.length - omission.length;
  if (contentBudget < 400) throw new Error("analysis_budget_too_small");
  const beginningBudget = Math.min(8_000, Math.floor(contentBudget / 4));
  const tailBudget = contentBudget - beginningBudget;
  return `${sourceWarning}${throughSelection.slice(0, beginningBudget)}${omission}${throughSelection.slice(-tailBudget)}`;
}

/**
 * Enter continuation without asking a model to understand the manuscript.
 *
 * This is deliberately a scaffold: it keeps the selected chapter as the
 * writing context, exposes no invented facts, and offers only neutral actions.
 * A later source analysis can replace this local candidate without changing
 * the original imported text.
 */
export function buildDirectContinuationAnalysis(manuscript: ImportedManuscript): ManuscriptAnalysis {
  const selected = manuscript.chapters.find((chapter) => chapter.id === manuscript.continuationChapterId);
  if (!selected) throw new Error("invalid_continuation_chapter");
  const inspection = inspectManuscriptSource(manuscript);
  if (!inspection.chapterQuality.find((chapter) => chapter.chapterId === selected.id)?.selectable) {
    throw new Error("incomplete_continuation_chapter");
  }
  const sourceChapterIds = [selected.id];
  return {
    genre: "待分析",
    storyTitle: manuscript.title,
    continuationBrief: "直接接力模式：以《" + selected.title + "》末尾为当前场景；尚未运行书源分析。",
    nodes: [{
      key: "protagonist",
      label: "主角（待分析）",
      kind: "character",
      summary: "尚未运行书源分析；模型将在接力时以当前章节原文作为上下文。",
      isProtagonist: true,
      role: "接力占位主角",
      tagline: "不预设人物事实，等待书源分析或作者补充。",
      sourceChapterIds,
    }],
    edges: [],
    facts: [],
    memoryUpdates: [],
    choices: [
      { label: "沿当前章节末尾继续", hint: "直接承接已选章节的最后一个动作或情绪。", preferenceSignals: ["保持当前接力点"] },
      { label: "先写主角对当前局面的反应", hint: "不引入新设定，先让当前场景产生回应。", preferenceSignals: ["人物优先"] },
      { label: "先停留在现场观察下一步变化", hint: "暂缓推进，等待更多现场信息出现。", preferenceSignals: ["谨慎观察"] },
    ],
    styleTechniques: [],
    twistSeeds: [],
    knowledgeCards: [],
    expressionObservations: [],
    integrityWarnings: ["当前为直接接力占位结果；未运行书源分析，未提取事实、知识卡或写法卡。"],
    trace: {
      traceId: "local-direct-continuation",
      provider: "local-draft",
      model: "direct-continuation",
      workflowVersion: "vnext.manuscript-import.v1",
      outputHash: "0".repeat(64),
    },
    fallbackApplied: false,
  };
}

export function buildManuscriptAnalysisBatches(
  manuscript: ImportedManuscript,
  maximum = MAX_INCREMENTAL_ANALYSIS_CHARACTERS,
): ManuscriptAnalysisBatch[] {
  if (maximum < 1_000) throw new Error("analysis_budget_too_small");
  const selectedIndex = manuscript.chapters.findIndex((chapter) => chapter.id === manuscript.continuationChapterId);
  if (selectedIndex < 0) throw new Error("invalid_continuation_chapter");
  const inspection = inspectManuscriptSource(manuscript);
  const selectable = new Set(inspection.chapterQuality.filter((chapter) => chapter.selectable).map((chapter) => chapter.chapterId));
  const batches: ManuscriptAnalysisBatch[] = [];
  let texts: string[] = [];
  let chapterIds: string[] = [];
  let chapterTitles: string[] = [];
  let length = 0;
  const flush = () => {
    if (texts.length === 0) return;
    batches.push({
      id: `batch-${batches.length + 1}`,
      chapterIds: [...new Set(chapterIds)],
      chapterTitles: [...new Set(chapterTitles)],
      text: texts.join("\n\n"),
    });
    texts = [];
    chapterIds = [];
    chapterTitles = [];
    length = 0;
  };
  for (const chapter of manuscript.chapters.slice(0, selectedIndex + 1)) {
    if (!selectable.has(chapter.id)) continue;
    const prefix = `[章节：${chapter.title}]\n`;
    const contentMaximum = Math.max(1, maximum - prefix.length);
    for (let offset = 0; offset < chapter.text.length; offset += contentMaximum) {
      const suffix = chapter.text.length > contentMaximum ? `（分片 ${Math.floor(offset / contentMaximum) + 1}）` : "";
      const part = `[章节：${chapter.title}${suffix}]\n${chapter.text.slice(offset, offset + contentMaximum)}`;
      if (length > 0 && length + 2 + part.length > maximum) flush();
      texts.push(part);
      chapterIds.push(chapter.id);
      chapterTitles.push(chapter.title);
      length += (length > 0 ? 2 : 0) + part.length;
      if (length >= maximum) flush();
    }
  }
  flush();
  return batches;
}

function normalizedIdentity(node: Pick<ManuscriptAnalysisNode, "label" | "kind">) {
  return `${node.kind}:${node.label.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("zh-CN")}`;
}

export function mergeManuscriptAnalyses(base: ManuscriptAnalysis, incoming: ManuscriptAnalysis): ManuscriptAnalysis {
  const baseProtagonistKey = base.nodes.find((node) => node.isProtagonist)?.key;
  const nodes = base.nodes.map((node) => ({ ...node }));
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const byIdentity = new Map(nodes.map((node) => [normalizedIdentity(node), node]));
  const keyMap = new Map<string, string>();
  for (const node of incoming.nodes) {
    const matched = byKey.get(node.key) ?? byIdentity.get(normalizedIdentity(node));
    if (matched) {
      keyMap.set(node.key, matched.key);
      if (node.summary.length > matched.summary.length) matched.summary = node.summary;
      if (node.tagline.length > matched.tagline.length) matched.tagline = node.tagline;
      if (node.displayRole) matched.displayRole = node.displayRole;
      if (node.narrativeLayer) matched.narrativeLayer = node.narrativeLayer;
      if (node.parentNodeKey) matched.parentNodeKey = node.parentNodeKey;
      matched.sourceChapterIds = [...new Set([...(matched.sourceChapterIds ?? []), ...(node.sourceChapterIds ?? [])])];
      continue;
    }
    const added = { ...node, isProtagonist: baseProtagonistKey ? false : node.isProtagonist };
    nodes.push(added);
    byKey.set(added.key, added);
    byIdentity.set(normalizedIdentity(added), added);
    keyMap.set(node.key, added.key);
  }
  const remap = (key: string) => keyMap.get(key) ?? key;
  const edgeKey = (edge: ManuscriptAnalysis["edges"][number]) => `${edge.sourceKey}\u0000${edge.targetKey}\u0000${edge.label}\u0000${edge.relationType ?? ""}\u0000${edge.eventNodeKey ?? ""}`;
  const edges = [...base.edges];
  const seenEdges = new Set(edges.map(edgeKey));
  for (const edge of incoming.edges) {
    const mapped = {
      ...edge,
      sourceKey: remap(edge.sourceKey),
      targetKey: remap(edge.targetKey),
      ...(edge.eventNodeKey ? { eventNodeKey: remap(edge.eventNodeKey) } : {}),
      ...(edge.sourceChapterIds?.length ? { sourceChapterIds: [...edge.sourceChapterIds] } : {}),
    };
    if (mapped.sourceKey === mapped.targetKey || seenEdges.has(edgeKey(mapped))) continue;
    if (!byKey.has(mapped.sourceKey) || !byKey.has(mapped.targetKey)) continue;
    seenEdges.add(edgeKey(mapped));
    edges.push(mapped);
  }
  const facts = [...base.facts];
  const factByStatement = new Map(facts.map((fact) => [fact.statement.trim(), fact]));
  for (const fact of incoming.facts) {
    const existing = factByStatement.get(fact.statement.trim());
    if (!existing) {
      facts.push(fact);
      factByStatement.set(fact.statement.trim(), fact);
    } else {
      existing.sourceChapterIds = [...new Set([...(existing.sourceChapterIds ?? []), ...(fact.sourceChapterIds ?? [])])];
      existing.targetNodeKeys = [...new Set([...(existing.targetNodeKeys ?? []), ...(fact.targetNodeKeys ?? [])])];
    }
  }
  const memoryByKey = new Map(base.memoryUpdates.map((memory) => [`${memory.kind}:${memory.key}`, { ...memory }]));
  for (const memory of incoming.memoryUpdates) {
    memoryByKey.set(`${memory.kind}:${memory.key}`, { ...memory, relevantNodeKeys: memory.relevantNodeKeys.map(remap).filter((key) => byKey.has(key)) });
  }
  const normalizedNodes = nodes.map((node) => ({
    ...node,
    ...(node.parentNodeKey ? { parentNodeKey: remap(node.parentNodeKey) } : {}),
  }));
  const normalizedEdges = edges.map((edge) => ({
    ...edge,
    ...(edge.eventNodeKey ? { eventNodeKey: remap(edge.eventNodeKey) } : {}),
    ...(edge.sourceChapterIds?.length ? { sourceChapterIds: [...edge.sourceChapterIds] } : {}),
  }));
  const merged: ManuscriptAnalysis = {
    ...base,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    facts,
    memoryUpdates: [...memoryByKey.values()],
    styleTechniques: mergeUniqueByKey(base.styleTechniques ?? [], incoming.styleTechniques ?? []),
    twistSeeds: mergeUniqueByKey(base.twistSeeds ?? [], incoming.twistSeeds ?? []),
    knowledgeCards: mergeUniqueByKey(base.knowledgeCards ?? [], incoming.knowledgeCards ?? []),
    expressionObservations: mergeUniqueByKey(base.expressionObservations ?? [], incoming.expressionObservations ?? []),
    integrityWarnings: [...new Set([...(base.integrityWarnings ?? []), ...(incoming.integrityWarnings ?? [])])],
    trace: incoming.trace,
  };
  return {
    ...merged,
    distillation: reduceManuscriptDistillation(merged),
  };
}

function mergeUniqueByKey<T extends { key: string }>(base: T[], incoming: T[]) {
  const values = new Map(base.map((item) => [item.key, { ...item }]));
  for (const item of incoming) {
    const existing = values.get(item.key);
    if (!existing) {
      values.set(item.key, { ...item });
      continue;
    }
    const existingWithSources = existing as T & { sourceChapterIds?: string[] };
    const incomingWithSources = item as T & { sourceChapterIds?: string[] };
    values.set(item.key, {
      ...existing,
      ...item,
      ...(existingWithSources.sourceChapterIds || incomingWithSources.sourceChapterIds
        ? { sourceChapterIds: [...new Set([...(existingWithSources.sourceChapterIds ?? []), ...(incomingWithSources.sourceChapterIds ?? [])])] }
        : {}),
    });
  }
  return [...values.values()];
}

function observationChapterIds(analysis: ManuscriptAnalysis) {
  const chapterIds = new Set<string>();
  const collect = (items: Array<{ sourceChapterIds?: string[] }> | undefined) => {
    for (const item of items ?? []) for (const chapterId of item.sourceChapterIds ?? []) chapterIds.add(chapterId);
  };
  collect(analysis.nodes);
  collect(analysis.edges);
  collect(analysis.facts);
  collect(analysis.styleTechniques);
  collect(analysis.twistSeeds);
  collect(analysis.knowledgeCards);
  collect(analysis.expressionObservations);
  return [...chapterIds].sort();
}

function markCraftStability<T extends { sourceChapterIds?: string[]; stableOrAccidental?: ManuscriptStyleTechnique["stableOrAccidental"] }>(items: T[]) {
  return items.map((item) => ({
    ...item,
    stableOrAccidental: (item.sourceChapterIds?.length ?? 0) >= 2 ? "recurring_variant" as const : "isolated" as const,
  }));
}

export function reduceManuscriptDistillation(
  analysis: ManuscriptAnalysis,
  options: {
    totalChapterIds?: string[];
    completedBatches?: number;
    totalBatches?: number;
    now?: string;
  } = {},
): ManuscriptDistillationSummary {
  const observedChapterIds = observationChapterIds(analysis);
  const totalChapterCount = options.totalChapterIds?.length ?? observedChapterIds.length;
  const coverageRatio = totalChapterCount === 0 ? 0 : Math.min(1, observedChapterIds.length / totalChapterCount);
  const techniques = markCraftStability(analysis.styleTechniques ?? []);
  const knowledgeCards = markCraftStability(analysis.knowledgeCards ?? []);
  const isComplete = options.totalBatches !== undefined && options.completedBatches !== undefined && options.completedBatches >= options.totalBatches;
  return {
    protocol: "manuscript-distillation.v2",
    status: isComplete ? "book-reduced" : "observations",
    observedChapterIds,
    coverageRatio,
    localObservationCounts: {
      facts: analysis.facts.length,
      knowledgeCards: knowledgeCards.length,
      techniques: techniques.length,
      twists: analysis.twistSeeds?.length ?? 0,
      expressions: analysis.expressionObservations?.length ?? 0,
    },
    recurringTechniqueKeys: techniques.filter((item) => item.stableOrAccidental === "recurring_variant").map((item) => item.key),
    recurringKnowledgeKeys: knowledgeCards.filter((item) => item.stableOrAccidental === "recurring_variant").map((item) => item.key),
    unresolvedTechniqueKeys: techniques.filter((item) => item.stableOrAccidental === "isolated").map((item) => item.key),
    reducedAt: options.now ?? new Date().toISOString(),
  };
}

export function withManuscriptDistillationProgress(
  analysis: ManuscriptAnalysis,
  completedBatches: number,
  totalBatches: number,
  totalChapterIds: string[],
) {
  return {
    ...analysis,
    distillation: reduceManuscriptDistillation(analysis, {
      completedBatches,
      totalBatches,
      totalChapterIds,
    }),
  };
}

function normalizeCraftIdentity(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("zh-CN");
}

function stableCraftHash(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(36);
}

function craftEntryId(kind: CraftKnowledgeKind, key: string) {
  return `craft-${kind}-${stableCraftHash(`${kind}:${normalizeCraftIdentity(key)}`)}`;
}

function validObservedAt(value: string, fallback: string) {
  return Number.isFinite(Date.parse(value)) ? value : fallback;
}

function mergeCraftSource(existing: CraftKnowledgeSource | undefined, incoming: CraftKnowledgeSource) {
  if (!existing) return incoming;
  const firstObservedAt = Date.parse(existing.firstObservedAt) <= Date.parse(incoming.firstObservedAt)
    ? existing.firstObservedAt
    : incoming.firstObservedAt;
  const lastObservedAt = Date.parse(existing.lastObservedAt) >= Date.parse(incoming.lastObservedAt)
    ? existing.lastObservedAt
    : incoming.lastObservedAt;
  return {
    ...existing,
    ...incoming,
    chapterIds: [...new Set([...existing.chapterIds, ...incoming.chapterIds])],
    firstObservedAt,
    lastObservedAt,
  };
}

/**
 * Promote the latest reviewable analysis into the reusable local craft
 * library. Re-running a batch is idempotent for the same manuscript/key, and
 * observing a structure in another manuscript adds a source rather than
 * polluting the story's canon.
 */
export function mergeManuscriptCraftKnowledge(
  current: CraftKnowledgeEntry[],
  manuscript: ImportedManuscript,
  analysis: ManuscriptAnalysis,
  observedAt = new Date().toISOString(),
) {
  const fallbackObservedAt = validObservedAt(manuscript.importedAt, new Date().toISOString());
  const normalizedObservedAt = validObservedAt(observedAt, fallbackObservedAt);
  const entries = new Map(current.map((entry) => [entry.id, { ...entry, sources: entry.sources.map((source) => ({ ...source, chapterIds: [...source.chapterIds] })) }]));
  const upsert = (
    kind: CraftKnowledgeKind,
    key: string,
    value: ManuscriptStyleTechnique | ManuscriptTwistSeed,
    sourceChapterIds: string[] | undefined,
  ) => {
    const id = craftEntryId(kind, key);
    const chapterIds = [...new Set((sourceChapterIds?.length ? sourceChapterIds : [manuscript.continuationChapterId]).filter(Boolean))];
    const source: CraftKnowledgeSource = {
      manuscriptId: manuscript.id,
      manuscriptTitle: manuscript.title,
      filename: manuscript.filename,
      sha256: manuscript.sha256,
      genre: analysis.genre,
      chapterIds,
      firstObservedAt: normalizedObservedAt,
      lastObservedAt: normalizedObservedAt,
    };
    const existing = entries.get(id);
    if (!existing) {
      entries.set(id, {
        kind,
        id,
        key,
        status: "candidate",
        ...(kind === "technique" ? { technique: { ...(value as ManuscriptStyleTechnique) } } : { twist: { ...(value as ManuscriptTwistSeed) } }),
        sources: [source],
        firstSeenAt: normalizedObservedAt,
        lastSeenAt: normalizedObservedAt,
      } as CraftKnowledgeEntry);
      return;
    }
    const sourceIndex = existing.sources.findIndex((item) => item.manuscriptId === manuscript.id);
    const sources = [...existing.sources];
    sources[sourceIndex < 0 ? sources.length : sourceIndex] = mergeCraftSource(sources[sourceIndex], source);
    const firstSeenAt = Date.parse(existing.firstSeenAt) <= Date.parse(normalizedObservedAt) ? existing.firstSeenAt : normalizedObservedAt;
    const lastSeenAt = Date.parse(existing.lastSeenAt) >= Date.parse(normalizedObservedAt) ? existing.lastSeenAt : normalizedObservedAt;
    if (kind === "technique") {
      if (existing.kind !== "technique") throw new Error("craft_entry_kind_conflict");
      entries.set(id, {
        ...existing,
        key,
        sources,
        firstSeenAt,
        lastSeenAt,
        technique: { ...existing.technique, ...(value as ManuscriptStyleTechnique) },
      });
    } else {
      if (existing.kind !== "twist") throw new Error("craft_entry_kind_conflict");
      entries.set(id, {
        ...existing,
        key,
        sources,
        firstSeenAt,
        lastSeenAt,
        twist: { ...existing.twist, ...(value as ManuscriptTwistSeed) },
      });
    }
  };

  for (const technique of analysis.styleTechniques ?? []) upsert("technique", technique.key, technique, technique.sourceChapterIds);
  for (const twist of analysis.twistSeeds ?? []) upsert("twist", twist.key, twist, twist.sourceChapterIds);
  return [...entries.values()].sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt));
}

function compact(value: string, maximum: number) {
  const text = value.trim();
  return text.length <= maximum ? text : `…${text.slice(-(maximum - 1))}`;
}

function characterProfile(node: ManuscriptAnalysisNode): CharacterProfile {
  return {
    role: node.role,
    tagline: node.tagline,
    fields: [
      { id: "identity", label: "身份", value: node.role, status: "candidate", source: "导入稿 AI 提取，等待正史确认" },
      { id: "state", label: "当前状态", value: node.summary, status: "candidate", source: "导入稿 AI 提取，等待正史确认" },
    ],
  };
}

export function createWorldFromManuscript(manuscript: ImportedManuscript, analysis: ManuscriptAnalysis) {
  const storyId = `story-import-${manuscript.sha256.slice(0, 12)}`;
  const worldId = `world-import-${manuscript.sha256.slice(0, 12)}`;
  const protagonist = analysis.nodes.find((node) => node.isProtagonist)!;
  const nodeIdByKey = new Map<string, string>();
  nodeIdByKey.set(protagonist.key, "protagonist");
  let sequence = 1;
  for (const node of analysis.nodes) {
    if (!nodeIdByKey.has(node.key)) nodeIdByKey.set(node.key, `import-node-${sequence++}`);
  }
  const radius = Math.max(150, analysis.nodes.length * 15);
  const nodes = analysis.nodes.map((node, index) => {
    const angle = (index * Math.PI * 2) / Math.max(analysis.nodes.length, 1) - Math.PI / 2;
    return {
      id: nodeIdByKey.get(node.key)!,
      label: node.label,
      kind: node.kind,
      summary: node.summary,
      x: 350 + Math.cos(angle) * radius,
      y: 235 + Math.sin(angle) * Math.min(radius, 180),
      storyIds: [storyId],
      displayRole: node.displayRole ?? "entity",
      narrativeLayer: node.narrativeLayer ?? "entity",
      truthStatus: "candidate" as const,
      salience: node.isProtagonist ? "active" as const : node.displayRole === "context" ? "latent" as const : "supporting" as const,
      ...(node.parentNodeKey && nodeIdByKey.has(node.parentNodeKey) ? { parentNodeId: nodeIdByKey.get(node.parentNodeKey)! } : {}),
      sourceChapterIds: node.sourceChapterIds?.length ? [...node.sourceChapterIds] : [manuscript.continuationChapterId],
      ...(node.kind === "character" ? { character: characterProfile(node) } : {}),
    };
  });
  const selected = manuscript.chapters.find((chapter) => chapter.id === manuscript.continuationChapterId)!;
  const world: WorldRecord = {
    id: worldId,
    title: `${analysis.storyTitle}世界`,
    genre: analysis.genre,
    sourceManuscriptId: manuscript.id,
    stories: [{
      id: storyId,
      title: analysis.storyTitle,
      premise: `【导入稿续写点：${selected.title}】\n${compact(selected.text, 2_600)}`,
    }],
    nodes,
    edges: analysis.edges.map((edge, index) => ({
      id: `import-edge-${index + 1}`,
      source: nodeIdByKey.get(edge.sourceKey)!,
      target: nodeIdByKey.get(edge.targetKey)!,
      label: edge.label,
      storyIds: [storyId],
      ...(edge.relationType ? { relationType: edge.relationType } : {}),
      ...(edge.eventNodeKey && nodeIdByKey.has(edge.eventNodeKey) ? { eventNodeId: nodeIdByKey.get(edge.eventNodeKey)! } : {}),
      ...(edge.sourceChapterIds?.length ? { sourceChapterIds: [...edge.sourceChapterIds] } : {}),
    })),
    facts: [
      { id: "import-continuation-brief", statement: analysis.continuationBrief, source: "导入稿 AI 接力摘要，等待确认", status: "candidate", storyIds: [storyId] },
      ...analysis.facts.map((fact, index) => ({
        id: `import-fact-${index + 1}`,
        statement: fact.statement,
        source: fact.source,
        status: "candidate" as const,
        storyIds: [storyId],
        ...(fact.targetNodeKeys ? { targetNodeIds: fact.targetNodeKeys.map((key) => nodeIdByKey.get(key)).filter((id): id is string => id !== undefined) } : {}),
      })),
    ],
  };
  const initialChoices: InteractiveChoice[] = analysis.choices.map((choice, index) => ({
    id: `import-choice-${index + 1}`,
    label: choice.label,
    hint: choice.hint,
    resultScene: choice.hint,
    preferenceSignals: choice.preferenceSignals,
    deltas: [],
  }));
  const memoryUpdates = analysis.memoryUpdates.map((update, index) => ({
    id: `memory-turn-0-${index + 1}`,
    kind: update.kind,
    key: update.key,
    value: update.value,
    status: update.status,
    relevantNodeIds: update.relevantNodeKeys.map((key) => nodeIdByKey.get(key)!),
    sourceTurnId: "turn-0",
  }));
  return { world, story: world.stories[0]!, initialChoices, memoryUpdates };
}
