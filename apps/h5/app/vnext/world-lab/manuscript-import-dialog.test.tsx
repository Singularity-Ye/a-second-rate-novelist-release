import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManuscriptImportDialog } from "./manuscript-import-dialog";
import type { ImportedManuscript, ManuscriptAnalysis } from "./manuscript-import";
import { WorldLabRequestError } from "../../lib/world-lab-api";

const mocks = vi.hoisted(() => ({ read: vi.fn(), analyze: vi.fn(), analyzeBatch: vi.fn() }));

vi.mock("./manuscript-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./manuscript-import")>()),
  readManuscriptFile: mocks.read,
}));

vi.mock("../../lib/manuscript-import-api", () => ({ analyzeImportedManuscript: mocks.analyze, analyzeImportedManuscriptBatch: mocks.analyzeBatch }));

const manuscript: ImportedManuscript = {
  id: "manuscript-aaaaaaaaaaaaaaaa",
  title: "纸灯",
  filename: "纸灯.md",
  format: "markdown",
  encoding: "utf-8",
  sizeBytes: 42,
  sha256: "a".repeat(64),
  text: "第一章 雨夜\n门响了。\n第二章 旧站\n灯亮了。",
  chapters: [
    { id: "chapter-1", title: "第一章 雨夜", start: 0, end: 14, text: "第一章 雨夜\n门响了。" },
    { id: "chapter-2", title: "第二章 旧站", start: 14, end: 28, text: "第二章 旧站\n灯亮了。" },
  ],
  continuationChapterId: "chapter-2",
  rightsAttested: true,
  importedAt: "2026-07-20T12:00:00.000Z",
};

const analysis: ManuscriptAnalysis = {
  genre: "悬疑",
  storyTitle: "纸灯",
  continuationBrief: "林雁已经追到旧站。",
  nodes: [{ key: "linyan", label: "林雁", kind: "character", summary: "追查纸灯的记者。", isProtagonist: true, role: "主角", tagline: "她只相信痕迹。" }],
  edges: [],
  facts: [],
  memoryUpdates: [],
  choices: [
    { label: "熄灯", hint: "破坏规则", preferenceSignals: [] },
    { label: "进站", hint: "接受邀请", preferenceSignals: [] },
    { label: "等待", hint: "观察来者", preferenceSignals: [] },
  ],
  trace: { traceId: "trace-1", provider: "company", model: "gpt-test", workflowVersion: "vnext.manuscript-import.v1", outputHash: "b".repeat(64) },
  fallbackApplied: false,
};

describe("ManuscriptImportDialog", () => {
  beforeEach(() => {
    mocks.read.mockReset().mockResolvedValue(manuscript);
    mocks.analyze.mockReset().mockResolvedValue(analysis);
    mocks.analyzeBatch.mockReset().mockResolvedValue(analysis);
  });

  it("shows the five-position gate as pending instead of treating one batch as a mature book", () => {
    render(
      <ManuscriptImportDialog
        initialAnalysis={analysis}
        initialManuscript={manuscript}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        open
      />,
    );

    const gate = screen.getByTestId("vertical-slice-readiness");
    expect(gate.textContent).toContain("0 / 10");
    expect(gate.textContent).toContain("位置覆盖 0 / 5");
  });

  it("can enter continuation without calling the source-analysis model", async () => {
    const onConfirm = vi.fn();
    render(<ManuscriptImportDialog open onClose={vi.fn()} onConfirm={onConfirm} />);
    const fileInput = screen.getByLabelText("我确认自己有权上传并使用这份内容。").closest("label")?.parentElement?.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.click(screen.getByText("我确认自己有权上传并使用这份内容。"));
    fireEvent.change(fileInput, { target: { files: [new File(["text"], "接力.md", { type: "text/markdown" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "直接进入接力" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(onConfirm.mock.calls[0]?.[1]).toMatchObject({
      trace: { model: "direct-continuation", provider: "local-draft" },
      facts: [],
      knowledgeCards: [],
    });
  });

  it("requires rights attestation, reviews chapters and confirms model candidates", async () => {
    const onConfirm = vi.fn();
    render(<ManuscriptImportDialog open onClose={vi.fn()} onConfirm={onConfirm} />);
    const fileInput = screen.getByLabelText("我确认自己有权上传并使用这份内容。").closest("label")?.parentElement?.querySelector("input[type=file]") as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);
    fireEvent.click(screen.getByText("我确认自己有权上传并使用这份内容。"));
    expect(fileInput.disabled).toBe(false);
    fireEvent.change(fileInput, { target: { files: [new File(["text"], "纸灯.md", { type: "text/markdown" })] } });
    expect((await screen.findByText("2")).textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "分析这份小说" }));
    expect((await screen.findByText("林雁已经追到旧站。")).textContent).toBe("林雁已经追到旧站。");
    fireEvent.click(screen.getByRole("button", { name: "确认迁移并进入故事" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        ...manuscript,
        analysis: expect.objectContaining({
          ...analysis,
          distillation: expect.objectContaining({ protocol: "manuscript-distillation.v2" }),
        }),
        analysisBatchCursor: 0,
      }),
      expect.objectContaining({
        ...analysis,
        distillation: expect.objectContaining({ protocol: "manuscript-distillation.v2" }),
      }),
    ));
  });

  it("shows partial-source truth and disables truncated preview chapters", async () => {
    const partialText = [
      `第一章 完整\n${"甲".repeat(500)}`,
      "第二章 预览\n片段甲...",
      "第三章 预览\n片段乙...",
      "第四章 预览\n片段丙...",
    ].join("\n");
    const partialChapters = (await import("./manuscript-import")).splitManuscriptChapters(partialText);
    mocks.read.mockResolvedValueOnce({ ...manuscript, text: partialText, chapters: partialChapters, continuationChapterId: "chapter-1" });
    render(<ManuscriptImportDialog open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const fileInput = screen.getByLabelText("我确认自己有权上传并使用这份内容。").closest("label")?.parentElement?.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.click(screen.getByText("我确认自己有权上传并使用这份内容。"));
    fireEvent.change(fileInput, { target: { files: [new File(["text"], "残稿.txt", { type: "text/plain" })] } });
    expect(await screen.findByText("这份来源不是完整全本")).toBeTruthy();
    const options = screen.getByRole("combobox").querySelectorAll("option");
    expect(options).toHaveLength(4);
    expect(options[0]?.disabled).toBe(false);
    expect(options[1]?.disabled).toBe(true);
    expect(options[1]?.textContent).toContain("仅预览");
  });

  it("keeps an in-flight analysis alive after the dialog is closed", async () => {
    let resolveAnalysis!: (value: ManuscriptAnalysis) => void;
    mocks.analyze.mockReturnValueOnce(new Promise<ManuscriptAnalysis>((resolve) => { resolveAnalysis = resolve; }));
    const onClose = vi.fn();
    const onProgress = vi.fn();
    const onTaskChange = vi.fn();
    render(<ManuscriptImportDialog onClose={onClose} onProgress={onProgress} onTaskChange={onTaskChange} onConfirm={vi.fn()} open />);
    const fileInput = screen.getByLabelText("我确认自己有权上传并使用这份内容。").closest("label")?.parentElement?.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.click(screen.getByText("我确认自己有权上传并使用这份内容。"));
    fireEvent.change(fileInput, { target: { files: [new File(["text"], "纸灯.md", { type: "text/markdown" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "分析这份小说" }));
    await waitFor(() => expect(onTaskChange).toHaveBeenCalledWith(expect.objectContaining({ status: "running", stage: "overview" })));
    expect((screen.getByRole("button", { name: "关闭导入" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "关闭导入" }));
    expect(onClose).toHaveBeenCalledOnce();
    resolveAnalysis(analysis);
    await waitFor(() => expect(onTaskChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed", stage: "overview" })));
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis: expect.objectContaining({
          ...analysis,
          distillation: expect.objectContaining({ protocol: "manuscript-distillation.v2" }),
        }),
        analysisBatchCursor: 0,
      }),
      expect.objectContaining({
        ...analysis,
        distillation: expect.objectContaining({ protocol: "manuscript-distillation.v2" }),
      }),
    );
  });

  it("runs every remaining chapter batch in the background and persists each cursor", async () => {
    const longManuscript: ImportedManuscript = {
      ...manuscript,
      chapters: [
        { id: "chapter-1", title: "第一章", start: 0, end: 10_000, text: "第一章\n" + "甲".repeat(9_995) },
        { id: "chapter-2", title: "第二章", start: 10_000, end: 20_000, text: "第二章\n" + "乙".repeat(9_995) },
      ],
      text: "第一章\n" + "甲".repeat(9_995) + "\n第二章\n" + "乙".repeat(9_995),
      continuationChapterId: "chapter-2",
    };
    const onProgress = vi.fn();
    const onTaskChange = vi.fn();
    mocks.analyzeBatch.mockImplementation(async (_source: ImportedManuscript, batch: { id: string }) => ({
      ...analysis,
      trace: { ...analysis.trace, traceId: batch.id },
    }));
    render(
      <ManuscriptImportDialog
        initialAnalysis={analysis}
        initialManuscript={longManuscript}
        onClose={vi.fn()}
        onProgress={onProgress}
        onTaskChange={onTaskChange}
        onConfirm={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "自动分析至完成" }));
    await waitFor(() => expect(mocks.analyzeBatch).toHaveBeenCalledTimes(2));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ analysisBatchCursor: 2 }), expect.anything());
    expect(onTaskChange).toHaveBeenLastCalledWith(expect.objectContaining({ runMode: "auto", status: "completed", completedBatches: 2, totalBatches: 2 }));
    expect(screen.getByText(/概览已完成/).textContent).toContain("2");
  });

  it("honors a stop request only after the current batch has been saved", async () => {
    const longManuscript: ImportedManuscript = {
      ...manuscript,
      chapters: [
        { id: "chapter-1", title: "第一章", start: 0, end: 10_000, text: "第一章\n" + "甲".repeat(9_995) },
        { id: "chapter-2", title: "第二章", start: 10_000, end: 20_000, text: "第二章\n" + "乙".repeat(9_995) },
      ],
      text: "第一章\n" + "甲".repeat(9_995) + "\n第二章\n" + "乙".repeat(9_995),
      continuationChapterId: "chapter-2",
    };
    const onTaskChange = vi.fn();
    let stopped = false;
    const view = (backgroundTask: Parameters<typeof ManuscriptImportDialog>[0]["backgroundTask"] = null) => (
      <ManuscriptImportDialog
        backgroundTask={backgroundTask}
        initialAnalysis={analysis}
        initialManuscript={longManuscript}
        onClose={vi.fn()}
        onTaskChange={onTaskChange}
        onConfirm={vi.fn()}
        open
      />
    );
    const { rerender } = render(view());
    onTaskChange.mockImplementation((task) => {
      if (!stopped && task.runMode === "auto" && task.status === "running") {
        stopped = true;
        rerender(view({ ...task, stopRequested: true }));
      }
    });
    mocks.analyzeBatch.mockResolvedValue(analysis);
    fireEvent.click(screen.getByRole("button", { name: "自动分析至完成" }));
    await waitFor(() => expect(mocks.analyzeBatch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onTaskChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed", stopRequested: true, completedBatches: 1, totalBatches: 2 })));
  });

  it("shows the batch failure detail and leaves the cursor ready for retry", async () => {
    const onTaskChange = vi.fn();
    mocks.analyzeBatch.mockRejectedValueOnce(new WorldLabRequestError("invalid_runtime_output", "request-import-error", "nodes_count"));
    render(
      <ManuscriptImportDialog
        initialAnalysis={analysis}
        initialManuscript={manuscript}
        onClose={vi.fn()}
        onTaskChange={onTaskChange}
        onConfirm={vi.fn()}
        open
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "继续分析第 1 批" }));
    await waitFor(() => expect(onTaskChange).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "failed",
      completedBatches: 0,
      error: expect.stringContaining("nodes_count"),
    })));
    expect(screen.getByTestId("manuscript-analysis-error").textContent).toContain("本批分层分析失败");
    expect(screen.getByTestId("manuscript-analysis-error").textContent).toContain("nodes_count");
    expect(screen.getByText(/分层深读 0 \/ 1 批/)).toBeTruthy();
  });
});
