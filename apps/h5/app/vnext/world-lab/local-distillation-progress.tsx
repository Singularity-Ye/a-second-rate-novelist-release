"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  fetchLocalDistillationProgress,
  LocalDistillationProgressRequestError,
  type LocalDistillationProgressSnapshot,
} from "../../lib/local-distillation-progress";
import styles from "./world-lab.module.css";

const POLL_INTERVAL_MS = 30_000;
const RETRY_REASON_LABELS: Record<string, string> = {
  fetch_failed: "连接失败",
  invalid_model_json: "模型 JSON 未闭合",
  provider_timeout: "模型超时",
  stream_ended_early: "响应提前结束",
  upstream_503: "上游 503",
};

function etaLabel(minutes: number | null) {
  if (minutes === null) return "ETA 估算中";
  if (minutes < 1) return "预计不到 1 分钟";
  if (minutes < 60) return `预计 ${Math.ceil(minutes)} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return `预计 ${hours} 小时${remainder ? ` ${remainder} 分` : ""}`;
}

function updatedAtLabel(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function statusLabel(progress: LocalDistillationProgressSnapshot, stale: boolean) {
  if (stale) return "分片停滞";
  if (progress.status === "completed") return "已完成";
  if (progress.status === "failed") return "已失败";
  if (progress.status === "running") return `运行中 ${progress.progressPercent}%`;
  return "状态待确认";
}

function errorLabel(error: unknown) {
  const code = error instanceof LocalDistillationProgressRequestError ? error.code : "progress_request_failed";
  const labels: Record<string, string> = {
    invalid_progress_payload: "返回的进度结构无法识别",
    progress_file_invalid: "进度文件大小或类型异常",
    progress_file_missing: "进度文件暂时不存在",
    progress_file_unavailable: "进度文件暂时不可读",
    progress_payload_invalid: "进度文件内容无法识别",
    progress_request_failed: "无法连接本地进度接口",
  };
  return labels[code] ?? `进度读取失败（${code}）`;
}

export function LocalDistillationProgress({ enabled }: { enabled: boolean }) {
  const [progress, setProgress] = useState<LocalDistillationProgressSnapshot | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let activeController: AbortController | null = null;

    const refresh = async () => {
      if (activeController) return;
      const controller = new AbortController();
      activeController = controller;
      try {
        const next = await fetchLocalDistillationProgress(controller.signal);
        if (disposed) return;
        if (!next) {
          setHidden(true);
          setProgress(null);
          setError(null);
          return;
        }
        setHidden(false);
        setProgress(next);
        setError(null);
      } catch (cause) {
        if (!disposed && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(errorLabel(cause));
        }
      } finally {
        if (activeController === controller) activeController = null;
      }
    };

    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      activeController?.abort();
    };
  }, [enabled]);

  const retryEntries = useMemo(() => progress ? Object.entries(progress.retryReasons).sort((left, right) => right[1] - left[1]) : [], [progress]);
  if (!enabled || hidden) return null;
  if (!progress) return error ? <p className={styles.localDistillationUnavailable} role="status">{error}；后台任务不受影响。</p> : null;

  const stale = progress.shards.some((item) => item.stale);
  const displayStatus = stale ? "stalled" : progress.status;
  const retryCount = retryEntries.reduce((sum, [, amount]) => sum + amount, 0);
  const activeWorkers = progress.shards.reduce((sum, item) => sum + item.activeWorkers, 0);

  return (
    <section aria-label="本地全书精蒸进度" className={styles.localDistillationProgress} data-status={displayStatus}>
      <div className={styles.localDistillationHeader}>
        <span>本地全书精蒸</span>
        <strong>{statusLabel(progress, stale)}</strong>
      </div>
      <div className={styles.localDistillationStats}>
        <span><strong>{progress.completedUnitCount}/{progress.expectedUnitCount}</strong> 分析窗</span>
        <span><strong>{progress.mechanismCount}</strong> 张机制卡</span>
      </div>
      <div
        aria-label="精蒸完成比例"
        aria-valuemax={progress.expectedUnitCount}
        aria-valuemin={0}
        aria-valuenow={progress.completedUnitCount}
        className={styles.localDistillationTrack}
        role="progressbar"
      >
        <span style={{ width: `${progress.progressPercent}%` }} />
      </div>
      <div className={styles.localDistillationMeta}>
        <span>{etaLabel(progress.throughput.etaMinutes)}</span>
        <time dateTime={progress.updatedAt}>更新 {updatedAtLabel(progress.updatedAt)}</time>
      </div>
      {progress.unresolvedFailureCount > 0 ? <p className={styles.localDistillationError}>未解决失败：{progress.unresolvedFailureCount}；请展开诊断。</p> : null}
      {error ? <p className={styles.localDistillationError}>{error}；当前保留上次成功快照。</p> : null}
      <details className={styles.localDistillationDiagnostics}>
        <summary>运行诊断 · {activeWorkers} worker · 已自动重试 {retryCount} 次</summary>
        <ul>
          {retryEntries.length
            ? retryEntries.map(([reason, amount]) => <li key={reason}>{RETRY_REASON_LABELS[reason] ?? reason}：{amount} 次</li>)
            : <li>尚无自动重试</li>}
          {progress.shards.map((item) => (
            <li key={item.shard}>
              {item.shard}：{item.completedUnits}/{item.expectedUnits}，{item.mechanismCount} 卡
              {item.stale ? "（停滞）" : ""}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
