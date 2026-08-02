"use client";

import React, { useEffect, useRef, useState } from "react";
import { analyzeImportedManuscript, analyzeImportedManuscriptBatch } from "../../lib/manuscript-import-api";
import { worldLabErrorCode, worldLabErrorMessage } from "../../lib/world-lab-api";
import {
  buildManuscriptAnalysisBatches,
  buildDirectContinuationAnalysis,
  MAX_MANUSCRIPT_BYTES,
  inspectManuscriptSource,
  mergeManuscriptAnalyses,
  readManuscriptFile,
  withManuscriptDistillationProgress,
  type ImportedManuscript,
  type ManuscriptAnalysis,
  type ManuscriptAnalysisTask,
} from "./manuscript-import";
import styles from "./world-lab.module.css";
import { ManuscriptAnalysisText } from "./manuscript-analysis-text";
import { evaluateManuscriptVerticalSlice } from "./manuscript-vertical-slice";

interface ManuscriptImportDialogProps {
  open: boolean;
  initialManuscript?: ImportedManuscript | null;
  initialAnalysis?: ManuscriptAnalysis | null;
  onClose(): void;
  onManuscriptRead?(manuscript: ImportedManuscript): void;
  onProgress?(manuscript: ImportedManuscript, analysis: ManuscriptAnalysis): void;
  onTaskChange?(task: ManuscriptAnalysisTask): void;
  backgroundTask?: ManuscriptAnalysisTask | null;
  onConfirm(manuscript: ImportedManuscript, analysis: ManuscriptAnalysis): void;
}

function errorMessage(code: string) {
  if (code === "unsupported_file_type") return "目前只接受 .txt、.md 或 .markdown。";
  if (code === "manuscript_size_invalid") return `文件不能超过 ${MAX_MANUSCRIPT_BYTES / 1024 / 1024} MB，且不能是空文件。`;
  if (code === "unsupported_text_encoding") return "暂时无法识别文件编码；请另存为 UTF-8 或 GB18030 后重试。";
  if (code === "no_complete_chapters") return "这份文件只有目录或截断预览，没有可用于接力的完整正文。";
  if (code === "incomplete_continuation_chapter") return "选中的章节只有截断预览，不能据此继续写作。";
  if (code === "manuscript_analysis_too_large") return "分析文本超过本机接口预算，请缩短接力范围后重试。";
  if (code === "provider_timeout") return "模型分析超时，原稿没有丢失，可以直接重试。";
  if (code === "provider_rate_limited") return "模型网关正在限流，原稿没有丢失，也没有写入创作空间；稍等一下再试。";
  if (code === "provider_connection_reset" || code === "provider_unavailable") return "本机模型通道暂时不可用，原稿仍只保存在当前页面。";
  if (code === "invalid_runtime_output") return "本批分层分析失败：模型确实返回了内容，但结构化结果没有通过校验；概览结果已保存，可以重试这一批。";
  if (code.startsWith("invalid_runtime_output:")) return `本批分层分析失败：模型返回的结构化结果没有通过校验（${code.slice("invalid_runtime_output:".length)}）；概览结果已保存，可以重试这一批。`;
  return "这次没有得到可验证的结构化分析结果，未写入创作空间。";
}

function persistedTaskErrorMessage(value: string | undefined) {
  if (!value) return "本批分层分析失败：没有收到可验证的模型结果；概览结果已保存，可以重试这一批。";
  if (value === "invalid_runtime_output" || value.startsWith("invalid_runtime_output:")) return errorMessage(value);
  if (["provider_timeout", "provider_rate_limited", "provider_connection_reset", "provider_unavailable"].includes(value)) return errorMessage(value);
  return value;
}

function integrityWarningMessage(warning: string) {
  const match = warning.match(/^truncated_(nodes|edges|facts|memory|style_techniques|twist_seeds|knowledge_cards|expression_observations):(\d+)$/u);
  if (!match) return warning;
  const labels: Record<string, string> = {
    nodes: "节点",
    edges: "关系",
    facts: "事实",
    memory: "长篇记忆",
    style_techniques: "写法卡",
    twist_seeds: "反转种子",
    knowledge_cards: "知识卡",
    expression_observations: "表达观察",
  };
  return `本批返回的${labels[match[1]!] ?? "候选结果"}超过批次预算，已安全截取预算内结果并丢弃 ${match[2]} 项候选。`;
}

export function ManuscriptImportDialog({ open, initialManuscript = null, initialAnalysis = null, onClose, onManuscriptRead, onProgress, onTaskChange, backgroundTask = null, onConfirm }: ManuscriptImportDialogProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rightsAttested, setRightsAttested] = useState(false);
  const [manuscript, setManuscript] = useState<ImportedManuscript | null>(null);
  const [analysis, setAnalysis] = useState<ManuscriptAnalysis | null>(null);
  const [reading, setReading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchCursor, setBatchCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const taskRef = useRef<ManuscriptAnalysisTask | null>(null);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    if (backgroundTask && taskRef.current?.id === backgroundTask.id) {
      stopRequestedRef.current = backgroundTask.stopRequested === true;
      taskRef.current = { ...taskRef.current, stopRequested: stopRequestedRef.current };
    }
  }, [backgroundTask?.id, backgroundTask?.stopRequested]);

  useEffect(() => {
    if (!open || !initialManuscript) return;
    setManuscript(initialManuscript);
    setAnalysis(initialAnalysis ?? initialManuscript.analysis ?? null);
    setBatchCursor(initialManuscript.analysisBatchCursor ?? 0);
  }, [initialAnalysis, initialManuscript, open]);

  if (!open) return null;
  const inspection = manuscript ? inspectManuscriptSource(manuscript) : null;
  const analysisBatches = manuscript ? buildManuscriptAnalysisBatches(manuscript) : [];
  const totalChapterIds = [...new Set(analysisBatches.flatMap((batch) => batch.chapterIds))];
  const qualityById = new Map(inspection?.chapterQuality.map((chapter) => [chapter.chapterId, chapter]) ?? []);
  const backgroundRunning = backgroundTask?.status === "running" && backgroundTask.manuscriptId === manuscript?.id;
  const backgroundTaskFailed = backgroundTask?.status === "failed" && backgroundTask.manuscriptId === manuscript?.id;
  const visibleError = error ?? (backgroundTaskFailed ? persistedTaskErrorMessage(backgroundTask?.error) : null);
  const isDirectContinuationAnalysis = analysis?.trace.model === "direct-continuation";
  const verticalSliceReport = manuscript && analysis
    ? evaluateManuscriptVerticalSlice({
        manuscriptId: manuscript.id,
        genre: analysis.genre,
        chapterIds: manuscript.chapters.map((chapter) => chapter.id),
        analysis,
        positions: [],
        commitments: [],
        jokeUses: [],
        migrationTests: [],
      })
    : null;

  const reset = () => {
    setManuscript(null);
    setAnalysis(null);
    setError(null);
    setReading(false);
    setAnalyzing(false);
    setBatchCursor(0);
    if (fileInput.current) fileInput.current.value = "";
  };

  const close = () => {
    // Reading a file is still modal-local. Network analysis is page-owned and
    // is intentionally allowed to continue after the dialog is dismissed.
    if (reading) return;
    reset();
    onClose();
  };

  const startTask = (stage: ManuscriptAnalysisTask["stage"], completedBatches: number, runMode: ManuscriptAnalysisTask["runMode"] = "single") => {
    if (!manuscript) return;
    stopRequestedRef.current = false;
    const task: ManuscriptAnalysisTask = {
      id: `manuscript-analysis-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      manuscriptId: manuscript.id,
      filename: manuscript.filename,
      stage,
      runMode,
      status: "running",
      completedBatches,
      totalBatches: analysisBatches.length,
      startedAt: new Date().toISOString(),
    };
    taskRef.current = task;
    onTaskChange?.(task);
  };

  const updateTask = (patch: Partial<ManuscriptAnalysisTask>) => {
    const current = taskRef.current;
    if (!current) return;
    const task = { ...current, ...patch };
    taskRef.current = task;
    onTaskChange?.(task);
  };

  const finishTask = (status: ManuscriptAnalysisTask["status"], taskError?: string) => {
    const current = taskRef.current;
    if (!current) return;
    const task: ManuscriptAnalysisTask = {
      ...current,
      status,
      completedAt: new Date().toISOString(),
      ...(taskError ? { error: taskError } : {}),
    };
    taskRef.current = task;
    onTaskChange?.(task);
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file || !rightsAttested) return;
    setReading(true);
    setError(null);
    setAnalysis(null);
    try {
      const nextManuscript = await readManuscriptFile(file);
      setManuscript(nextManuscript);
      onManuscriptRead?.(nextManuscript);
      setBatchCursor(0);
    } catch (caught) {
      setManuscript(null);
      setError(errorMessage(caught instanceof Error ? caught.message : "invalid_manuscript_text"));
    } finally {
      setReading(false);
    }
  };

  const analyze = async () => {
    if (!manuscript || backgroundRunning) return;
    startTask("overview", 0, "single");
    setAnalyzing(true);
    setError(null);
    try {
      const nextAnalysis = withManuscriptDistillationProgress(
        await analyzeImportedManuscript(manuscript),
        0,
        analysisBatches.length,
        totalChapterIds,
      );
      setAnalysis(nextAnalysis);
      setBatchCursor(0);
      onProgress?.({ ...manuscript, analysis: nextAnalysis, analysisBatchCursor: 0 }, nextAnalysis);
      finishTask("completed");
    } catch (caught) {
      setAnalysis(null);
      const code = worldLabErrorCode(caught);
      const failureMessage = worldLabErrorMessage(errorMessage(code), caught);
      setError(failureMessage);
      finishTask("failed", failureMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  const enterDirectContinuation = () => {
    if (!manuscript || analyzing || backgroundRunning) return;
    try {
      const localAnalysis = buildDirectContinuationAnalysis(manuscript);
      onConfirm({ ...manuscript, analysis: localAnalysis, analysisBatchCursor: 0 }, localAnalysis);
      reset();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught instanceof Error ? caught.message : "invalid_continuation_chapter"));
    }
  };

  const analyzeNextBatch = async () => {
    const batch = analysisBatches[batchCursor];
    if (!manuscript || !analysis || !batch || backgroundRunning) return;
    startTask("batch", batchCursor, "single");
    setAnalyzing(true);
    setError(null);
    try {
      const nextCursor = batchCursor + 1;
      const merged = withManuscriptDistillationProgress(
        mergeManuscriptAnalyses(analysis, await analyzeImportedManuscriptBatch(manuscript, batch, analysis)),
        nextCursor,
        analysisBatches.length,
        totalChapterIds,
      );
      setAnalysis(merged);
      setBatchCursor(nextCursor);
      onProgress?.({ ...manuscript, analysis: merged, analysisBatchCursor: nextCursor }, merged);
      finishTask("completed");
    } catch (caught) {
      const code = worldLabErrorCode(caught);
      const failureMessage = worldLabErrorMessage(errorMessage(code), caught);
      setError(failureMessage);
      finishTask("failed", failureMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeAllBatches = async () => {
    if (!manuscript || !analysis || batchCursor >= analysisBatches.length || backgroundRunning) return;
    const sourceManuscript = manuscript;
    let currentAnalysis = analysis;
    let cursor = batchCursor;
    startTask("batch", cursor, "auto");
    setAnalyzing(true);
    setError(null);
    try {
      while (cursor < analysisBatches.length) {
        const batch = analysisBatches[cursor]!;
        const incoming = await analyzeImportedManuscriptBatch(sourceManuscript, batch, currentAnalysis);
        cursor += 1;
        currentAnalysis = withManuscriptDistillationProgress(
          mergeManuscriptAnalyses(currentAnalysis, incoming),
          cursor,
          analysisBatches.length,
          totalChapterIds,
        );
        setAnalysis(currentAnalysis);
        setBatchCursor(cursor);
        onProgress?.({ ...sourceManuscript, analysis: currentAnalysis, analysisBatchCursor: cursor }, currentAnalysis);
        updateTask({ completedBatches: cursor });

        // A stop request is deliberately observed only at this boundary. The
        // model request that produced the current batch is never cancelled.
        if (stopRequestedRef.current) break;
      }
      finishTask("completed");
    } catch (caught) {
      const code = worldLabErrorCode(caught);
      const failureMessage = worldLabErrorMessage(errorMessage(code), caught);
      setError(failureMessage);
      finishTask("failed", failureMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className={styles.importBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section aria-labelledby="manuscript-import-title" aria-modal="true" className={styles.importDialog} role="dialog">
        <header>
          <div>
            <span>已有小说接力</span>
            <h2 id="manuscript-import-title">把你写到一半的故事带进来</h2>
          </div>
          <button aria-label="关闭导入" disabled={reading} onClick={close} type="button">×</button>
        </header>

        {!manuscript ? (
          <div className={styles.importDropzone}>
            <p>本轮只读取 TXT / Markdown。原文与 hash 保存到当前浏览器草稿；不会上传到公开书库，也不会替任何用户搜索盗版书源。</p>
            <label className={styles.rightsCheck}>
              <input checked={rightsAttested} onChange={(event) => setRightsAttested(event.target.checked)} type="checkbox" />
              <span>我确认自己有权上传并使用这份内容。</span>
            </label>
            <input
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              disabled={!rightsAttested || reading}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
              ref={fileInput}
              type="file"
            />
            <small>单文件不超过 15 MB；支持 UTF-8 与 GB18030。原文会留在当前浏览器草稿，章节可按批次继续分析。</small>
            {reading ? <strong>正在识别编码、计算 hash 与章节边界…</strong> : null}
          </div>
        ) : (
          <div className={styles.importReview}>
            <section className={styles.importFileSummary}>
              <div><span>文件</span><strong>{manuscript.filename}</strong></div>
              <div><span>编码</span><strong>{manuscript.encoding.toUpperCase()}</strong></div>
              <div><span>章节</span><strong>{manuscript.chapters.length}</strong></div>
              <div><span>指纹</span><strong>{manuscript.sha256.slice(0, 12)}…</strong></div>
            </section>

            {inspection ? (
              <section className={inspection.isPartial ? styles.importSourceWarning : styles.importSourceHealthy} aria-label="来源完整性体检">
                <strong>{inspection.isPartial ? "这份来源不是完整全本" : "章节正文完整性未发现明显异常"}</strong>
                <p>
                  可用 {inspection.selectableChapters} 章 · 截断预览 {inspection.previewChapters} 章 · 可疑短章 {inspection.suspiciousChapters} 章
                  {inspection.noise.commonReaderAdLines > 0 ? ` · 疑似站点/阅读器杂讯 ${inspection.noise.commonReaderAdLines} 行` : ""}
                </p>
                <small>
                  原文件不会被改写。截断预览不会送入模型；广告和发布平台敏感词先标记、后预览，不做静默批量删除。
                </small>
              </section>
            ) : null}

            {backgroundRunning ? (
              <div className={styles.importBackgroundStatus} role="status">
                <strong>{backgroundTask?.runMode === "auto" ? "自动分析进行中" : "后台分析进行中"}</strong>
                <span>{backgroundTask?.runMode === "auto"
                  ? backgroundTask.stopRequested
                    ? `已收到停止请求；当前第 ${Math.min(backgroundTask.completedBatches + 1, backgroundTask.totalBatches)} 批完成并保存后暂停。`
                    : `已完成 ${backgroundTask.completedBatches} / ${backgroundTask.totalBatches} 批；关闭这个窗口不会中断任务。点击顶部“当前批完成后停止”可优雅暂停。`
                  : "关闭这个窗口不会中断本批任务；请保持当前浏览器标签页打开，完成后会在顶部提醒。"}</span>
              </div>
            ) : null}

            {visibleError ? <p className={styles.importError} data-testid="manuscript-analysis-error" role="alert">{visibleError}</p> : null}

            <label className={styles.chapterSelect}>
              <span>从哪一章结束处继续</span>
              <select
                disabled={analyzing || backgroundRunning}
                onChange={(event) => {
                  setAnalysis(null);
                  setBatchCursor(0);
                  setManuscript((current) => current ? { ...current, continuationChapterId: event.target.value } : current);
                }}
                value={manuscript.continuationChapterId}
              >
                {manuscript.chapters.map((chapter, index) => {
                  const quality = qualityById.get(chapter.id);
                  const suffix = quality?.quality === "preview" ? "（仅预览，不能接力）" : quality?.quality === "suspicious" ? "（正文可疑，不能接力）" : quality?.quality === "short" ? "（短章，请核对）" : "";
                  return <option disabled={!quality?.selectable} key={chapter.id} value={chapter.id}>{index + 1}. {chapter.title}{suffix}</option>;
                })}
              </select>
              <small>章节是自动检测结果；截断预览不会被当成正文。完整的自定义目录规则和手工重切会在下一轮分层导入中补上。</small>
            </label>

            <details className={styles.chapterPreview}>
              <summary>查看接力章节末尾</summary>
              <pre>{manuscript.chapters.find((chapter) => chapter.id === manuscript.continuationChapterId)?.text.slice(-1_600)}</pre>
            </details>

            {!analysis ? (
              <>
                <div className={styles.importEntryActions}>
                  <button className={styles.importPrimary} disabled={analyzing || backgroundRunning} onClick={enterDirectContinuation} type="button">
                    直接进入接力
                  </button>
                  <button className={styles.importSecondary} disabled={analyzing || backgroundRunning} onClick={() => void analyze()} type="button">
                    {analyzing || backgroundRunning ? "正在后台分析…" : "分析这份小说"}
                  </button>
                </div>
                <small>直接接力不会调用模型；之后可重新打开这份书源，再补做四层蒸馏与五位置纵切。</small>
              </>
            ) : (
              <section className={styles.importCandidates}>
                <div className={styles.importCandidateHeading}>
                  <div><span>候选提取 · {analysis.trace.model}</span><strong>{analysis.storyTitle}</strong></div>
                  <button disabled={analyzing || backgroundRunning} onClick={() => void analyze()} type="button">{isDirectContinuationAnalysis ? "开始书源分析" : "重新分析"}</button>
                </div>
                <ManuscriptAnalysisText text={analysis.continuationBrief} />
                {analysis.integrityWarnings?.length ? (
                  <div className={styles.importIntegrityWarning} role="status">
                    {analysis.integrityWarnings.map((warning) => <p key={warning} title={warning}>{integrityWarningMessage(warning)}</p>)}
                  </div>
                ) : null}
                <div className={styles.importCandidateStats}>
                  <span>{analysis.nodes.length} 个节点</span>
                  <span>{analysis.edges.length} 条关系</span>
                  <span>{analysis.facts.length} 条事实</span>
                  <span>{analysis.memoryUpdates.length} 条长篇记忆</span>
                  <span>{analysis.styleTechniques?.length ?? 0} 张写法卡</span>
                  <span>{analysis.twistSeeds?.length ?? 0} 个反转种子</span>
                  <span>{analysis.knowledgeCards?.length ?? 0} 张知识卡</span>
                  <span>{analysis.expressionObservations?.length ?? 0} 份表达观察</span>
                </div>
                <div className={styles.importLayeredProgress}>
                  <div>
                    <strong>概览已完成 · 分层深读 {batchCursor} / {analysisBatches.length} 批</strong>
                    <span>{batchCursor === analysisBatches.length ? "接力点之前的可用正文已按批扫描，并完成书级归纳" : `下一批：${analysisBatches[batchCursor]?.chapterTitles.join("、") ?? "待定章节"}；会在现有节点基础上增量补充四层蒸馏观察`}</span>
                  </div>
                  {batchCursor < analysisBatches.length ? (
                    <div className={styles.importBatchActions}>
                      <button disabled={analyzing || backgroundRunning} onClick={() => void analyzeNextBatch()} type="button">
                        {analyzing || backgroundRunning ? "正在后台分析…" : `继续分析第 ${batchCursor + 1} 批`}
                      </button>
                      <button disabled={analyzing || backgroundRunning} onClick={() => void analyzeAllBatches()} type="button">
                        自动分析至完成
                      </button>
                    </div>
                  ) : null}
                </div>
                {verticalSliceReport ? (
                  <section aria-label="五位置纵切验收" className={styles.importCraftEvidence} data-testid="vertical-slice-readiness">
                    <header>
                      <div><span>五位置纵切验收 · {verticalSliceReport.pass ? "通过" : "尚未通过"}</span><strong>{verticalSliceReport.score.passed} / {verticalSliceReport.score.total} 项门槛</strong></div>
                      <small>只验证候选证据，不自动写入正史或独立知识库</small>
                    </header>
                    <p>位置覆盖 {verticalSliceReport.checks.positionCoverage.observed} / 5 · 表达观察覆盖 {verticalSliceReport.checks.expressionReport.observed} / 5 · 已回收承诺 {verticalSliceReport.checks.payoffRecall.observed}</p>
                    <small>{verticalSliceReport.pass ? "五个位置的证据可以进入作者复核。" : "当前仍是局部四层观察；需要五个位置的来源、选择因果、伏笔回收、笑法用途和原创迁移证据。"}</small>
                  </section>
                ) : null}
                {analysis.distillation ? (
                  <section aria-label="四层蒸馏状态" className={styles.importCraftEvidence}>
                    <header>
                      <div><span>四层蒸馏 · {analysis.distillation.status === "book-reduced" ? "书级归纳" : "本批观察"}</span><strong>协议 manuscript-distillation.v2</strong></div>
                      <small>覆盖 {Math.round(analysis.distillation.coverageRatio * 100)}% · 候选结果不进入正史</small>
                    </header>
                    <p>事实 {analysis.distillation.localObservationCounts.facts} · 知识 {analysis.distillation.localObservationCounts.knowledgeCards} · 技法 {analysis.distillation.localObservationCounts.techniques} · 反转 {analysis.distillation.localObservationCounts.twists} · 表达 {analysis.distillation.localObservationCounts.expressions}</p>
                    {analysis.distillation.recurringTechniqueKeys.length ? <small>跨章节重复出现的技法候选：{analysis.distillation.recurringTechniqueKeys.join("、")}</small> : <small>当前尚未有足够跨章节证据把技法标记为稳定习惯。</small>}
                  </section>
                ) : null}
                {(analysis.styleTechniques?.length || analysis.twistSeeds?.length || analysis.knowledgeCards?.length || analysis.expressionObservations?.length) ? (
                  <section aria-label="文风与叙事技法候选" className={styles.importCraftEvidence}>
                    <header>
                      <div><span>创作证据 · 候选层</span><strong>只学习结构与规则，不复制原句</strong></div>
                      <small>知识、技法和表达观察均不进入世界正史</small>
                    </header>
                    {analysis.styleTechniques?.length ? (
                      <div className={styles.importTechniqueGrid}>
                        {analysis.styleTechniques.map((technique) => (
                          <article key={technique.key}>
                            <strong>{technique.label}</strong>
                            <p>{technique.pattern}</p>
                            <small>适用：{technique.useWhen} · 风险：{technique.risk}</small>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    {analysis.twistSeeds?.length ? (
                      <div className={styles.importTwistList}>
                        {analysis.twistSeeds.map((seed) => (
                          <article key={seed.key}>
                            <strong>{seed.setup}</strong>
                            <p>误导：{seed.misdirection} → 揭示：{seed.reveal}</p>
                            <small>回收条件：{seed.payoff} · 来源：{seed.source}</small>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    {analysis.knowledgeCards?.length ? (
                      <div className={styles.importTechniqueGrid}>
                        {analysis.knowledgeCards.map((card) => (
                          <article key={card.key}>
                            <strong>{card.label}</strong>
                            <p>{card.coreStatement}</p>
                            <small>原作用法：{card.sourceUse} · 戏剧转译：{card.dramaticTranslation} · 风险：{card.misuseRisk}</small>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    {analysis.expressionObservations?.length ? (
                      <div className={styles.importTwistList}>
                        {analysis.expressionObservations.map((observation) => (
                          <article key={observation.key}>
                            <strong>{observation.key}</strong>
                            <p>{observation.evidence}</p>
                            <small>视角：{observation.pointOfViewPattern} · 节奏：{observation.cadence} · 信息释放：{observation.informationReleaseRate}</small>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <ul>
                  {analysis.nodes.slice(0, 8).map((node) => <li key={node.key}><strong>{node.label}</strong><span>{node.role}</span><ManuscriptAnalysisText compact text={node.summary} /></li>)}
                </ul>
                <small>这些内容仍是候选。确认迁移后，事实会进入“等待确认”，而不是直接冒充正史。</small>
                <button className={styles.importPrimary} onClick={() => { onConfirm({ ...manuscript, analysis, analysisBatchCursor: batchCursor }, analysis); reset(); onClose(); }} type="button">{initialManuscript ? "保存深读结果并返回故事" : "确认迁移并进入故事"}</button>
              </section>
            )}
          </div>
        )}
        {!manuscript && error ? <p className={styles.importError} role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
