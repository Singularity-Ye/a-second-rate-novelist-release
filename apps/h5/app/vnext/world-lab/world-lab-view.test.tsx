import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectChapterGraphNodes, WorldLabView } from "./world-lab-view";
import { buildQuartzNotes, createOpeningWorld, OPENING_CHOICES } from "./world-lab-data";
import type { ImportedManuscript, ManuscriptAnalysis } from "./manuscript-import";

const generateWorldLabTurnMock = vi.hoisted(() => vi.fn(async ({ selectedAction }: { selectedAction: string }) => {
    const hidden = selectedAction.includes("熄掉");
    const object = selectedAction.includes("握住");
    const open = selectedAction.includes("推门");
    return {
      scene: hidden
        ? "门外的人果然没有立刻进来，而是先做了一个只有同伙才懂的手势。"
        : object
          ? "冰冷的触感里传来第二个声音，它说出了一个不该有人知道的旧名字。"
          : "追兵没想到门会从里面打开，雨水把双方的退路同时切断。",
      preferenceSignals: hidden ? ["喜欢藏底牌", "谨慎布局"] : object ? ["偏爱谜团", "主动追问"] : open ? ["正面对抗", "偏爱逆袭"] : ["主动推进"],
      deltas: [{ targetNodeId: "protagonist", label: "本回合处境", before: "等待", after: selectedAction }],
      discoveries: object ? [{ label: "只属于断剑线的影子", kind: "event", summary: "该事件只在握剑分支发生。", connectToNodeId: "protagonist", relationLabel: "看见" }] : [],
      memoryUpdates: object
        ? [{ kind: "foreshadowing", key: "断剑知道主角旧名", value: "断剑说出了无人应知的旧名，来源仍未揭晓。", status: "active", relevantNodeIds: ["protagonist", "object"] }]
        : hidden
          ? [{ kind: "promise", key: "查明门外手势", value: "主角需要查明来客与暗处势力的联络手势。", status: "active", relevantNodeIds: ["protagonist", "faction"] }]
          : [],
      choices: [
        { label: "追问刚刚暴露的名字", hint: "沿新线索深入。", preferenceSignals: ["偏爱谜团"], predictedDeltas: [] },
        { label: "先观察谁在说谎", hint: "保留信息优势。", preferenceSignals: ["谨慎布局"], predictedDeltas: [] },
        { label: "立刻改变双方的位置", hint: "让冲突进入下一阶段。", preferenceSignals: ["主动推进"], predictedDeltas: [] },
      ],
      trace: { traceId: "trace-test", provider: "company-router", model: "gpt-5.5", workflowVersion: "vnext.world-lab-turn.v3", outputHash: "a".repeat(64) },
      fallbackApplied: false,
    };
  }));

const manuscriptImportMocks = vi.hoisted(() => ({
  read: vi.fn(),
  analyze: vi.fn(),
  analyzeBatch: vi.fn(),
}));

vi.mock("./manuscript-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./manuscript-import")>()),
  readManuscriptFile: manuscriptImportMocks.read,
}));

vi.mock("../../lib/manuscript-import-api", () => ({
  analyzeImportedManuscript: manuscriptImportMocks.analyze,
  analyzeImportedManuscriptBatch: manuscriptImportMocks.analyzeBatch,
}));

const importedManuscriptFixture: ImportedManuscript = {
  id: "manuscript-craft-crafttest",
  title: "天门旧闻",
  filename: "天门旧闻.md",
  format: "markdown",
  encoding: "utf-8",
  sizeBytes: 64,
  sha256: "c".repeat(64),
  text: "# 第一章 断剑\n雨落在山门前。",
  chapters: [{ id: "chapter-1", title: "第一章 断剑", start: 0, end: 20, text: "# 第一章 断剑\n雨落在山门前。" }],
  continuationChapterId: "chapter-1",
  rightsAttested: true,
  importedAt: "2026-07-20T12:00:00.000Z",
};

const importedAnalysisFixture: ManuscriptAnalysis = {
  genre: "修仙",
  storyTitle: "天门旧闻",
  continuationBrief: "断剑在山门前留下了新的线索。",
  nodes: [{
    key: "protagonist",
    label: "陆停舟",
    kind: "character",
    summary: "在山门前寻找旧名的修士。",
    isProtagonist: true,
    role: "主角",
    tagline: "不肯承认自己已经死过一次。",
    sourceChapterIds: ["chapter-1"],
  }],
  edges: [],
  facts: [],
  memoryUpdates: [],
  choices: [
    { label: "追问断剑", hint: "沿线索深入。", preferenceSignals: [] },
    { label: "先看山门", hint: "保留信息优势。", preferenceSignals: [] },
    { label: "暂时离开", hint: "把风险留到下一回合。", preferenceSignals: [] },
  ],
  styleTechniques: [{
    key: "adversary-reframe",
    label: "敌方畅想后被己方截断",
    pattern: "先让读者相信对手已经完成推演，再切换视角揭示这份推演早已成为己方的复盘对象。",
    evidence: "敌方的希望保留到视角切换前，随后由另一方重新命名。",
    cadence: "完整铺陈后用短句截断，再落到新的旁白。",
    semanticFit: "适合表现信息差反转。",
    comicContrast: "可在严肃布局后接一句冷静吐槽。",
    useWhen: "对手自以为掌控局势时",
    risk: "己方不能无依据地全知。",
    sourceChapterIds: ["chapter-1"],
  }],
  twistSeeds: [{
    key: "reframe-the-plan",
    setup: "对手准备借一次试探保留退路。",
    misdirection: "读者先把这份盘算当成有效策略。",
    reveal: "换视角后发现策略本身已经被记录。",
    payoff: "己方用低成本动作验证此前的记录。",
    source: "第一章",
    sourceChapterIds: ["chapter-1"],
  }],
  trace: { traceId: "trace-import", provider: "company-router", model: "gpt-test", workflowVersion: "vnext.manuscript-import.v1", outputHash: "d".repeat(64) },
  fallbackApplied: false,
};

vi.mock("../../lib/world-lab-api", () => ({
  generateWorldLabTurn: generateWorldLabTurnMock,
  generateWorldLabTurnStream: async (input: { selectedAction: string }, onSceneChunk?: (chunk: string) => void) => {
    const result = await generateWorldLabTurnMock(input);
    onSceneChunk?.(result.scene);
    return result;
  },
}));

vi.mock("./world-lab-persistence", () => ({
  WORLD_LAB_DRAFT_VERSION: 5,
  loadWorldLabDraft: vi.fn(() => new Promise(() => {})),
  saveWorldLabDraft: vi.fn(async () => undefined),
}));

describe("world lab view", () => {
  beforeEach(() => {
    generateWorldLabTurnMock.mockClear();
    manuscriptImportMocks.read.mockReset().mockResolvedValue(importedManuscriptFixture);
    manuscriptImportMocks.analyze.mockReset().mockResolvedValue(importedAnalysisFixture);
    manuscriptImportMocks.analyzeBatch.mockReset().mockResolvedValue(importedAnalysisFixture);
  });

  it("exposes only the two formal opening works and preserves their stable story metadata", () => {
    expect(OPENING_CHOICES.map((choice) => choice.title)).toEqual(["因果放行", "血影成真"]);
    expect(OPENING_CHOICES.map((choice) => choice.scene)).toEqual([
      "你替宿敌查一笔因果，查到第四层时，先被自己的真名叫醒。",
      "你明明不会血影遁，却在濒死时喊了出来；下一息，系统替你把谎话写进现实。",
    ]);

    const zifuWorld = createOpeningWorld("zifu", "secret");
    const zifu = zifuWorld.stories[0]!;
    expect(zifu).toMatchObject({
      id: "story-zifu-zhangwairen-001",
      branchId: "branch-zifu-main-r1",
      checkpointId: "checkpoint-zifu-c1-c3-accepted",
      premise: "",
      summaryLedger: "你替宿敌查一笔因果，查到第四层时，先被自己的真名叫醒。",
      formalAvailability: {
        contentRegistration: "registered",
        runtime: "disconnected",
        manuscriptImport: "blocked",
        body: "unavailable",
        canon: "unavailable",
        reason: "missing_verified_manuscript_artifact",
      },
    });
    expect(zifuWorld.nodes.every((node) => node.truthStatus !== "canon")).toBe(true);
    expect(zifuWorld.edges.every((edge) => edge.truthStatus !== "canon")).toBe(true);
    expect(zifuWorld.facts.every((fact) => fact.status !== "accepted")).toBe(true);
    const xueyingWorld = createOpeningWorld("xueying", "secret");
    const xueying = xueyingWorld.stories[0]!;
    expect(xueying).toMatchObject({
      id: "story-xueying-chengzhen-001",
      branchId: "branch-xueying-main-r1",
      checkpointId: "checkpoint-xueying-c1-c3-accepted",
      premise: "",
      formalAvailability: {
        contentRegistration: "registered",
        runtime: "disconnected",
        manuscriptImport: "pending",
        body: "unavailable",
        canon: "unavailable",
        reason: "immutable_manuscript_artifact_backend_persistence_pending",
      },
    });
    expect(xueyingWorld.nodes.every((node) => node.truthStatus !== "canon")).toBe(true);
    expect(xueyingWorld.facts.every((fact) => fact.status !== "accepted")).toBe(true);

    render(<WorldLabView />);
    const openingReturnLink = screen.getByRole("link", { name: "← 返回小说家房间" });
    expect(openingReturnLink.getAttribute("href")).toBe("/room/novelist");
    expect(screen.getByRole("button", { name: /因果放行/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /血影成真/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /破庙残剑|擂台倒计时|封锁线内|空白密诏/ })).toBeNull();
  });

  it("shows formal registration, disconnected runtime, and import blocking without opening a manuscript body", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));

    const gate = screen.getByTestId("formal-story-gate");
    expect(gate.textContent).toContain("已登记");
    expect(gate.textContent).toContain("未接通");
    expect(gate.textContent).toContain("正文导入阻塞：missing_verified_manuscript_artifact");
    expect(gate.textContent).toContain("登记摘要（非正文）");
    expect(screen.queryByRole("heading", { name: "正文稿" })).toBeNull();
    expect(screen.queryByText("当前内容尚未完成不可变正文导入，候选事实只能观察，不能写入 Canon")).toBeNull();
  });

  it("keeps the room return link at the top of the formal workspace library", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));

    const workspace = screen.getByTestId("world-lab-page");
    const returnLink = screen.getByRole("link", { name: "← 返回小说家房间" });
    expect(returnLink.getAttribute("href")).toBe("/room/novelist");
    expect(returnLink.closest("aside")?.getAttribute("aria-label")).toBe("小说与世界");
    expect(returnLink.compareDocumentPosition(screen.getByRole("link", { name: "二流小说家" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(workspace.querySelector("aside[aria-label='小说与世界']")?.contains(returnLink)).toBe(true);
  });

  const enterMode = (label: string) => {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
  };

  it("keeps a chapter graph bounded and retains only chapter evidence", () => {
    const seed = createOpeningWorld("mystery", "secret");
    const nodes = Array.from({ length: 173 }, (_, index) => ({
      ...seed.nodes[0]!,
      id: index === 0 ? "protagonist" : `background-${index}`,
      label: index === 0 ? "主角" : index === 1 ? "章节人物" : index === 2 ? "章节新发现" : `背景节点${index}`,
      storyIds: [seed.stories[0]!.id],
      ...(index === 2 ? { sourceTurnId: "turn-3", sourceStoryId: seed.stories[0]!.id } : {}),
    }));
    const selected = selectChapterGraphNodes(nodes, seed.stories[0]!.id, {
      id: "turn-3",
      selectedAction: "追踪章节人物",
      scene: "章节人物在门外留下了痕迹。",
      deltas: [{ id: "delta", targetNodeId: "background-1", label: "出现", before: "未知", after: "现身" }],
      memoryUpdates: [{ id: "memory", kind: "foreshadowing", key: "新发现", value: "待回收", status: "active", relevantNodeIds: ["background-2"], sourceTurnId: "turn-3" }],
    });

    expect(selected).toHaveLength(24);
    expect(selected.map((node) => node.id)).toEqual(expect.arrayContaining(["protagonist", "background-1", "background-2"]));
    expect(selected.map((node) => node.id)).not.toContain("background-172");
  });

  it("separates the real commission entrance from the synthetic graph experiment", () => {
    render(<WorldLabView />);

    const realCommission = screen.getByRole("link", { name: /开始一次真实委托/ });
    expect(realCommission.getAttribute("href")).toBe("/vnext");
    expect(screen.getByText("公司模型 · 真实生成")).toBeTruthy();
    expect(screen.getByText("或者先用样例体验图谱与分支")).toBeTruthy();
    expect(screen.getByText(/这里不收 API Key/)).toBeTruthy();
  });

  it("opens analyzed craft evidence in the standalone knowledge library without writing it into canon", async () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    fireEvent.click(screen.getByRole("button", { name: "分析书源内容" }));

    const rightsLabel = "我确认自己有权上传并使用这份内容。";
    const fileInput = screen.getByLabelText(rightsLabel).closest("label")?.parentElement?.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.click(screen.getByText(rightsLabel));
    fireEvent.change(fileInput, { target: { files: [new File(["text"], "天门旧闻.md", { type: "text/markdown" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "分析这份小说" }));

    const confirmButton = await screen.findByRole("button", { name: /确认迁移并进入故事|保存深读结果并返回故事/ });
    fireEvent.click(confirmButton);

    expect(screen.queryByTestId("craft-knowledge-panel")).toBeNull();
    expect(screen.getByTestId("side-graph-preview")).toBeTruthy();
    expect(screen.getByRole("region", { name: "正文工作台" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "知识库" }));
    expect(screen.getByRole("dialog", { name: "知识库" })).toBeTruthy();
    const panel = await screen.findByTestId("craft-knowledge-panel");
    await waitFor(() => expect(panel.textContent).toContain("敌方畅想后被己方截断"));
    expect(panel.textContent).toContain("本书 2");
    expect(panel.textContent).toContain("天门旧闻");
    expect(screen.getByRole("button", { name: "本书" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "反转" }));
    expect(panel.textContent).toContain("对手准备借一次试探保留退路");
    expect(panel.textContent).not.toContain("敌方畅想后被己方截断");
    expect(screen.getByRole("button", { name: "反转" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "梗库" }));
    expect(screen.getByRole("heading", { name: "梗库" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭知识库" }));
    expect(screen.queryByRole("dialog", { name: "知识库" })).toBeNull();

    enterMode("正史");
    expect(screen.getByTestId("canon-workspace-page")).toBeTruthy();
    expect(screen.getByTestId("canon-workspace-page").querySelector('[aria-label="事实候选"]')).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "世界侧舱" }).querySelector('[aria-label="事实候选"]')).toBeNull();
    expect(screen.getByRole("region", { name: "事实候选" }).textContent).not.toContain("敌方畅想后被己方截断");
  });

  it("turns two scene choices into an opening and an inspectable world graph", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    enterMode("知识图谱");

    expect(screen.getByTestId("world-lab-page").textContent).toContain("因果放行：第一夜");
    expect(screen.getByRole("heading", { name: "因果放行：第一夜 · 知识图谱" })).toBeTruthy();
    expect(screen.getByTestId("central-graph-workspace")).toBeTruthy();
    expect(screen.getByTestId("side-graph-preview")).toBeTruthy();
    expect(screen.getByRole("img", { name: "小说世界关系图" })).toBeTruthy();
    expect(screen.getByText(/6 个节点/)).toBeTruthy();
    const rail = screen.getByRole("complementary", { name: "世界侧舱" });
    expect(rail.getAttribute("data-view")).toBe("graph");
    expect(screen.getByRole("button", { name: /^知识图谱/ }).getAttribute("data-active")).toBe("true");
    expect(screen.queryByRole("button", { name: "分屏" })).toBeNull();
    expect(screen.queryByRole("button", { name: "关闭节点详情" })).toBeNull();
    expect(screen.getByRole("button", { name: "当前章节" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "本书 / 本卷" })).toBeTruthy();
    const graph = screen.getByLabelText("小说世界关系图");
    const controls = screen.getByText("调教图谱").closest("details");
    expect(graph.parentElement?.contains(controls)).toBe(false);
    expect(screen.getByRole("button", { name: "聚焦所选" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(screen.getByRole("button", { name: "无名断剑，物件" }), { key: "Enter" });
    expect(screen.getByRole("button", { name: "关闭节点详情" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "聚焦所选" }));
    expect(screen.getByText(/2 个节点/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "全世界" }));
    expect(screen.getByText(/6 个节点/)).toBeTruthy();
    expect(screen.getByText("开篇中改变命运走向的关键物。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "展开完整关系图谱" }));
    expect(screen.getByRole("dialog", { name: "完整关系图谱" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "完整小说世界关系图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "自动" }).getAttribute("data-active")).toBe("true");
    expect(screen.getByRole("button", { name: "性能优先" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "小说世界关系图" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭完整关系图谱" }));
    expect(screen.queryByRole("dialog", { name: "完整关系图谱" })).toBeNull();
    expect(screen.getByRole("img", { name: "小说世界关系图" })).toBeTruthy();
  });

  it("gives正文、走线、导演台 independent pages and exposes joke feeding on the director desk", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    expect(screen.getByTestId("formal-story-gate")).toBeTruthy();
    enterMode("导演台");
    expect(screen.queryByTestId("director-workspace-page")).toBeNull();
    expect(screen.getByTestId("formal-story-gate").textContent).toContain("运行时");
  });

  it("allows free multi-story and multi-world structure without pretending to generate content", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /血影成真/ }));
    fireEvent.click(screen.getByRole("button", { name: /先输到谷底/ }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 同世界开新书" }));

    expect(screen.getByRole("heading", { name: "血影成真世界·新书 2" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "新建世界" }));
    expect(screen.getByText("未命名世界 2")).toBeTruthy();
    enterMode("知识图谱");
    expect(screen.getByText("这个世界还是空白的。")).toBeTruthy();
  });

  it("deletes only the selected book and keeps the world with its other books", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /血影成真/ }));
    fireEvent.click(screen.getByRole("button", { name: /先输到谷底/ }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 同世界开新书" }));
    expect(screen.getByRole("heading", { name: "血影成真世界·新书 2" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "删除小说 血影成真世界·新书 2" }));

    expect(screen.getByText("血影成真世界")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "血影成真：第一夜" })).toBeTruthy();
    expect(screen.queryByText("血影成真世界·新书 2")).toBeNull();
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("deletes a world from the library and keeps the remaining world selected", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    fireEvent.click(screen.getByRole("button", { name: "新故事" }));
    fireEvent.click(screen.getByRole("button", { name: /血影成真/ }));
    fireEvent.click(screen.getByRole("button", { name: /先输到谷底/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除世界 血影成真世界" }));

    await waitFor(() => expect(screen.getByText("1 个世界")).toBeTruthy());
    expect(screen.queryByText("血影成真世界")).toBeNull();
    expect(screen.getByRole("button", { name: /修仙.*因果放行世界/ })).toBeTruthy();
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("starts another opening without overwriting the existing story", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    fireEvent.click(screen.getByRole("button", { name: "新故事" }));
    expect(screen.getByRole("button", { name: "返回当前故事" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /血影成真/ }));
    fireEvent.click(screen.getByRole("button", { name: /先输到谷底/ }));

    expect(screen.getByText("2 个世界")).toBeTruthy();
    expect(screen.getByRole("button", { name: /修仙.*因果放行世界/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /搞笑系统修仙.*血影成真世界/ })).toBeTruthy();
  });

  it("keeps extracted facts as candidates until the user accepts them", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /血影成真/ }));
    fireEvent.click(screen.getByRole("button", { name: /先赢一口气/ }));
    enterMode("正史");
    expect(screen.getAllByRole("button", { name: "写入正史" })[0]).toBeDisabled();
    expect(screen.getByRole("status").textContent).toContain("只能观察");
  });

  it("approves every candidate fact for the active story and reports the canon write", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /血影成真/ }));
    fireEvent.click(screen.getByRole("button", { name: /先赢一口气/ }));
    enterMode("正史");

    const approve = screen.getByRole("button", { name: /一键审批并写入正史/ });
    expect(approve.textContent).toContain("3");
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(screen.getAllByText("等待确认").length).toBeGreaterThanOrEqual(3);
    expect((approve as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a Quartz-compatible note bundle from the same world truth", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /血影成真/ }));
    fireEvent.click(screen.getByRole("button", { name: /先赢一口气/ }));
    fireEvent.click(screen.getByRole("button", { name: "Quartz 导出" }));

    expect(screen.getByTestId("quartz-export-panel").textContent).toContain("8 个 Markdown 节点");
    expect(screen.getByTestId("quartz-export-panel").textContent).toContain("content/nodes/沈照微.md");
  });

  it("opens node content and exposes Obsidian-style force controls", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    enterMode("知识图谱");

    const place = screen.getByRole("button", { name: "听雨破庙，地点" });
    fireEvent.keyDown(place, { key: "Enter" });
    expect(screen.getByText("你替宿敌查一笔因果，查到第四层时，先被自己的真名叫醒。")).toBeTruthy();

    const repel = screen.getByRole("slider", { name: "图谱排斥力" }) as HTMLInputElement;
    fireEvent.change(repel, { target: { value: "1.2" } });
    expect(repel.value).toBe("1.2");
    expect(screen.getByRole("button", { name: "恢复推荐值与视图" })).toBeTruthy();
  });

  it("opens a source-aware character card and follows semantic relations", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    enterMode("知识图谱");
    fireEvent.keyDown(screen.getByRole("button", { name: "陆停舟，人物" }), { key: "Enter" });

    const card = screen.getByRole("dialog", { name: "陆停舟" });
    expect(card.textContent).toContain("人物真值");
    expect(card.textContent).not.toContain("正文确认");
    expect(card.textContent).toContain("AI 候选");
    expect(card.textContent).toContain("来源：开篇钩子");
    expect(card.textContent).toContain("关系不是一条无名的线");

    fireEvent.click(screen.getByRole("button", { name: /二流小说家.*陆停舟.*记得/ }));
    expect(screen.getByRole("dialog", { name: "二流小说家" })).toBeTruthy();
    expect(screen.getByText(/人物档案.*世界记录者/)).toBeTruthy();
  });

  it("previews a local portrait without pretending image generation is connected", async () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    enterMode("知识图谱");
    fireEvent.keyDown(screen.getByRole("button", { name: "陆停舟，人物" }), { key: "Enter" });

    const image = new File([new Uint8Array([137, 80, 78, 71])], "lu-tingzhou.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("上传角色形象"), { target: { files: [image] } });
    await waitFor(() => expect(screen.getByRole("img", { name: "陆停舟的角色形象" })).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("没有上传到服务器");
    expect(screen.getByText("本地上传")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "生成角色形象" }));
    await waitFor(() => expect(screen.getByText(/图像生成暂时不可用/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "查看模型连接" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "陆停舟" })).toBeTruthy();
  });

  it("turns a story-language choice into preference evidence and graph projection", async () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    expect(screen.getByTestId("formal-story-gate").textContent).toContain("不能进入正文");
    await waitFor(() => expect(generateWorldLabTurnMock).not.toHaveBeenCalled());
  });

  it("forks from the opening and restores each branch head independently", async () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    expect(screen.getByTestId("formal-story-gate")).toBeTruthy();
    await waitFor(() => expect(generateWorldLabTurnMock).not.toHaveBeenCalled());
  });

  it("names checkpoints, forks from a saved node and renames the active route", () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    expect(screen.getByTestId("formal-story-gate").textContent).toContain("续写");
    expect(screen.queryByRole("region", { name: "命名存档" })).toBeNull();
  });

  it("does not send a sibling branch discovery or memory to the next provider turn", async () => {
    render(<WorldLabView />);

    fireEvent.click(screen.getByRole("button", { name: /因果放行/ }));
    fireEvent.click(screen.getByRole("button", { name: /先藏一个秘密/ }));
    expect(screen.getByTestId("formal-story-gate")).toBeTruthy();
    await waitFor(() => expect(generateWorldLabTurnMock).not.toHaveBeenCalled());
  });
});

describe("Quartz note builder", () => {
  it("preserves wikilinks and accepted canon in exported Markdown", () => {
    const world = createOpeningWorld("mystery", "secret");
    world.facts[0] = { ...world.facts[0]!, status: "accepted" };

    const notes = buildQuartzNotes(world);
    const index = notes[0]?.content ?? "";

    expect(index).toContain("[[周既明]]");
    expect(index).toContain("周既明第一次听见明日车票说话。");
    expect(notes.some((note) => note.path === "content/nodes/明日车票.md")).toBe(true);
    const character = notes.find((note) => note.path === "content/nodes/周既明.md")?.content ?? "";
    expect(character).toContain("## 角色档案");
    expect(character).toContain("**身份**：悬疑故事的主角（正史；来源：创作空间）");
  });
});
