import { describe, expect, it } from "vitest";
import {
  buildManuscriptAnalysisWindow,
  buildManuscriptAnalysisBatches,
  buildDirectContinuationAnalysis,
  createWorldFromManuscript,
  decodeManuscriptBytes,
  inspectManuscriptSource,
  mergeManuscriptAnalyses,
  reduceManuscriptDistillation,
  splitManuscriptChapters,
  type ImportedManuscript,
  type ManuscriptAnalysis,
} from "./manuscript-import";

function manuscript(text: string, chapters = splitManuscriptChapters(text)): ImportedManuscript {
  return {
    id: "manuscript-aaaaaaaaaaaaaaaa",
    title: "纸灯",
    filename: "纸灯.md",
    format: "markdown",
    encoding: "utf-8",
    sizeBytes: new TextEncoder().encode(text).byteLength,
    sha256: "a".repeat(64),
    text,
    chapters,
    continuationChapterId: chapters.at(-1)!.id,
    rightsAttested: true,
    importedAt: "2026-07-20T12:00:00.000Z",
  };
}

const analysis: ManuscriptAnalysis = {
  genre: "悬疑",
  storyTitle: "纸灯",
  continuationBrief: "林雁追到旧站，仍不知道纸灯是谁留下的。",
  nodes: [
    { key: "linyan", label: "林雁", kind: "character", summary: "追查失踪案的记者。", isProtagonist: true, role: "主角", tagline: "她只相信留下痕迹的人。" },
    { key: "station", label: "北岸旧站", kind: "place", summary: "停运十二年的车站。", isProtagonist: false, role: "关键地点", tagline: "每盏灯都比来客早到一步。" },
  ],
  edges: [{ sourceKey: "linyan", targetKey: "station", label: "追查至" }],
  facts: [{ statement: "北岸旧站已经停运十二年。", source: "第二章末尾" }],
  memoryUpdates: [{ kind: "foreshadowing", key: "纸灯来源", value: "纸灯总在林雁到站前出现。", status: "active", relevantNodeKeys: ["linyan", "station"] }],
  choices: [
    { label: "熄灭纸灯", hint: "先破坏引路规则。", preferenceSignals: ["主动破局"] },
    { label: "沿灯走进站台", hint: "接受邀请。", preferenceSignals: ["追逐秘密"] },
    { label: "躲起来等点灯人", hint: "把主动权交给耐心。", preferenceSignals: ["观察博弈"] },
  ],
  trace: { traceId: "trace-1", provider: "company", model: "gpt-test", workflowVersion: "vnext.manuscript-import.v1", outputHash: "b".repeat(64) },
  fallbackApplied: false,
};

describe("owned manuscript import", () => {
  it("decodes UTF-8 and GB18030 text without guessing binary files", () => {
    expect(decodeManuscriptBytes(new TextEncoder().encode("你好\n世界"))).toEqual({ text: "你好\n世界", encoding: "utf-8" });
    expect(decodeManuscriptBytes(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]))).toEqual({ text: "你好", encoding: "gb18030" });
    expect(() => decodeManuscriptBytes(new Uint8Array([0, 1, 2]))).toThrow("unsupported_text_encoding");
  });

  it("finds Markdown and Chinese chapter headings while preserving a preface", () => {
    const chapters = splitManuscriptChapters("题记\n不要回头。\n# 第一章 雨夜\n门响了。\n第二章 旧站\n灯亮了。");
    expect(chapters.map((chapter) => chapter.title)).toEqual(["序章 / 章前内容", "第一章 雨夜", "第二章 旧站"]);
    expect(chapters[1]?.text).toContain("门响了");
    expect(chapters[2]?.start).toBe(chapters[1]?.end);
  });

  it("falls back to one reviewable chapter when no heading exists", () => {
    expect(splitManuscriptChapters("只有一段正文。" )).toMatchObject([{ id: "chapter-1", title: "全文（未检测到章节标题）" }]);
  });

  it("keeps the opening and selected tail inside a bounded analysis window", () => {
    const text = `# 第一章\n${"甲".repeat(9_000)}\n# 第二章\n${"乙".repeat(45_000)}`;
    const source = manuscript(text);
    const window = buildManuscriptAnalysisWindow(source, source.continuationChapterId, 12_000);
    expect(window.length).toBeLessThanOrEqual(12_000);
    expect(window).toContain("第一章");
    expect(window).toContain("中间内容因本轮分析预算省略");
    expect(window.endsWith("乙".repeat(100))).toBe(true);
  });

  it("packs every selectable chapter through the continuation point into bounded sequential batches", () => {
    const source = manuscript(`第一章 起点\n${"甲".repeat(1_200)}\n第二章 转折\n${"乙".repeat(1_200)}\n第三章 接力\n${"丙".repeat(1_200)}`);
    const batches = buildManuscriptAnalysisBatches(source, 1_500);
    expect(batches.length).toBeGreaterThan(2);
    expect(batches.every((batch) => batch.text.length <= 1_500)).toBe(true);
    expect(new Set(batches.flatMap((batch) => batch.chapterIds))).toEqual(new Set(source.chapters.map((chapter) => chapter.id)));
  });

  it("builds a transparent local continuation scaffold without inventing source facts", () => {
    const source = manuscript("绗竴绔?闆ㄥ\n闂ㄥ搷浜嗐€俓n绗簩绔?鏃х珯\n鐏寒浜嗐€?");
    const direct = buildDirectContinuationAnalysis(source);

    expect(direct.trace.model).toBe("direct-continuation");
    expect(direct.nodes).toHaveLength(1);
    expect(direct.nodes[0]).toMatchObject({ key: "protagonist", isProtagonist: true, sourceChapterIds: [source.continuationChapterId] });
    expect(direct.facts).toEqual([]);
    expect(direct.knowledgeCards).toEqual([]);
    expect(direct.styleTechniques).toEqual([]);
    expect(direct.integrityWarnings?.[0]).toContain("未运行书源分析");
  });

  it("merges later batch entities into known nodes while preserving the original protagonist and choices", () => {
    const incoming: ManuscriptAnalysis = {
      ...analysis,
      nodes: [
        { ...analysis.nodes[0]!, key: "lin-yan", summary: "追到码头的记者。" },
        { key: "dock", label: "旧码头", kind: "place", summary: "第三章交易地点。", isProtagonist: false, role: "地点", tagline: "潮水抹去脚印。" },
      ],
      edges: [{ sourceKey: "lin-yan", targetKey: "dock", label: "追查至" }],
      facts: [{ statement: "交易发生在退潮前。", source: "第三章" }],
      memoryUpdates: [],
    };
    const merged = mergeManuscriptAnalyses(analysis, incoming);
    expect(merged.nodes.filter((node) => node.label === "林雁")).toHaveLength(1);
    expect(merged.nodes.filter((node) => node.isProtagonist)).toHaveLength(1);
    expect(merged.edges).toContainEqual({ sourceKey: "linyan", targetKey: "dock", label: "追查至" });
    expect(merged.choices).toEqual(analysis.choices);
  });

  it("keeps four-layer observations separate and only marks repeated evidence as recurring", () => {
    const enriched = {
      ...analysis,
      facts: [{ statement: "北岸旧站已经停运十二年。", source: "第二章末尾", sourceChapterIds: ["chapter-2"] }],
      styleTechniques: [{
        key: "viewpoint-reframe",
        label: "敌方畅想后视角重构",
        pattern: "先给出对手的完整希望，再由另一视角重新定义它。",
        evidence: "对手的计划先被完整呈现，随后被己方掌握的信息截断。",
        useWhen: "战略对峙",
        risk: "没有情报铺垫时会像作者替主角读心。",
        sourceChapterIds: ["chapter-1", "chapter-2"],
      }],
      knowledgeCards: [{
        key: "lamp-rule",
        label: "纸灯引路规则",
        kind: "world_rule" as const,
        coreStatement: "纸灯总在林雁到站前出现。",
        sourceUse: "原作用它制造追逐方向和时间压力。",
        dramaticTranslation: "是否跟随灯光会改变林雁承担的风险。",
        misuseRisk: "只当神秘名词而不改变选择。",
        sourceChapterIds: ["chapter-2"],
      }],
      expressionObservations: [{
        key: "chapter-2-expression",
        scope: "chapter" as const,
        narrativeDistance: "近距离跟随林雁的判断。",
        pointOfViewPattern: "行动后立即补充有限心理解释。",
        sentenceLengthProfile: "短句推进，关键线索处拉长。",
        paragraphDensity: "对白与动作段落交替。",
        dialogueNarrationRatio: "对白约三成。",
        actionPsychologyRatio: "动作优先，心理解释克制。",
        cadence: "短促句收束场景。",
        informationReleaseRate: "每个场景只释放一条新线索。",
        chapterHookPattern: "章末保留点灯人的身份问题。",
        toneSwitchPattern: "紧张中保留轻微冷幽默。",
        languageDevices: ["短句收束"],
        evidence: "章节末尾以未回答的问题推动接力。",
        misuseRisk: "每段都用悬停句会削弱真正钩子。",
        sourceChapterIds: ["chapter-2"],
      }],
    } satisfies ManuscriptAnalysis;
    const summary = reduceManuscriptDistillation(enriched, {
      totalChapterIds: ["chapter-1", "chapter-2"],
      completedBatches: 1,
      totalBatches: 2,
    });
    expect(summary.protocol).toBe("manuscript-distillation.v2");
    expect(summary.status).toBe("observations");
    expect(summary.localObservationCounts).toMatchObject({ knowledgeCards: 1, techniques: 1, expressions: 1 });
    expect(summary.recurringTechniqueKeys).toEqual(["viewpoint-reframe"]);
    expect(summary.recurringKnowledgeKeys).toEqual([]);
    expect(summary.coverageRatio).toBe(1);
  });

  it("does not mistake one naturally short ellipsis ending for a truncated source", () => {
    const source = manuscript("第一章 雨夜\n他没有回答...\n第二章 旧站\n灯亮了。");
    const inspection = inspectManuscriptSource(source);
    expect(inspection).toMatchObject({ isPartial: false, previewChapters: 0, suspiciousChapters: 0, selectableChapters: 2 });
    expect(inspection.chapterQuality.map((chapter) => chapter.quality)).toEqual(["short", "short"]);
  });

  it("classifies a repeated preview tail without hiding a later complete chapter", () => {
    const text = [
      `第一章 完整\n${"甲".repeat(600)}`,
      "第二章 预览\n只有一小段...",
      "第三章 预览\n仍然只有一小段...",
      "第四章 预览\n继续只有一小段...",
      "第五章 异常\n没有省略标记",
      `第六章 插入全文\n${"乙".repeat(700)}`,
    ].join("\n");
    const source = manuscript(text);
    const inspection = inspectManuscriptSource(source);
    expect(inspection.chapterQuality.map((chapter) => chapter.quality)).toEqual(["complete", "preview", "preview", "preview", "suspicious", "complete"]);
    expect(inspection).toMatchObject({ isPartial: true, completeChapters: 2, previewChapters: 3, suspiciousChapters: 1, selectableChapters: 2 });
    expect(inspection.recommendedContinuationChapterId).toBe("chapter-1");
  });

  it("excludes previews from the analysis window and rejects them as continuation points", () => {
    const text = [
      `第一章 完整\n${"甲".repeat(700)}`,
      "第二章 预览\n预览甲...",
      "第三章 预览\n预览乙...",
      "第四章 预览\n预览丙...",
      `第五章 可用正文\n${"戊".repeat(800)}`,
    ].join("\n");
    const source = manuscript(text);
    const selected = { ...source, continuationChapterId: "chapter-5" };
    const window = buildManuscriptAnalysisWindow(selected, selected.continuationChapterId, 4_000);
    expect(window).toContain("来源完整性告警");
    expect(window).toContain("可用正文");
    expect(window).not.toContain("预览甲");
    expect(() => buildManuscriptAnalysisWindow(source, "chapter-3", 4_000)).toThrow("incomplete_continuation_chapter");
  });

  it("maps confirmed candidates into a source-linked world and seed ledger", () => {
    const source = manuscript("第一章 雨夜\n门响了。\n第二章 旧站\n灯亮了。");
    const result = createWorldFromManuscript(source, analysis);
    expect(result.world.sourceManuscriptId).toBe(source.id);
    expect(result.world.nodes.find((node) => node.id === "protagonist")?.label).toBe("林雁");
    expect(result.world.facts.every((fact) => fact.status === "candidate")).toBe(true);
    expect(result.initialChoices).toHaveLength(3);
    expect(result.memoryUpdates[0]).toMatchObject({ key: "纸灯来源", sourceTurnId: "turn-0", relevantNodeIds: ["protagonist", "import-node-1"] });
  });
});
