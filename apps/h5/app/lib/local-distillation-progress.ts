export type LocalDistillationStatus = "running" | "completed" | "failed" | "stalled" | "unknown";

export interface LocalDistillationShardProgress {
  shard: string;
  status: LocalDistillationStatus;
  expectedUnits: number;
  completedUnits: number;
  pendingUnits: number;
  activeWorkers: number;
  mechanismCount: number;
  unresolvedFailures: number;
  lastBatchId: string | null;
  lastActivityAt: string | null;
  inactiveMinutes: number | null;
  stale: boolean;
}

export interface LocalDistillationProgressSnapshot {
  protocol: "narrative-mechanism-progress.v1";
  status: LocalDistillationStatus;
  updatedAt: string;
  expectedUnitCount: number;
  completedUnitCount: number;
  remainingUnitCount: number;
  progressPercent: number;
  mechanismCount: number;
  unresolvedFailureCount: number;
  retryReasons: Record<string, number>;
  throughput: {
    recentWindowMinutes: number | null;
    recentCompletedUnits: number | null;
    recentUnitsPerMinute: number | null;
    etaMinutes: number | null;
  };
  shards: LocalDistillationShardProgress[];
}

const VALID_STATUSES = new Set<LocalDistillationStatus>(["running", "completed", "failed", "stalled", "unknown"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function optionalNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeText(value: unknown, maximumLength = 120): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, maximumLength);
  return text || null;
}

function status(value: unknown): LocalDistillationStatus {
  return typeof value === "string" && VALID_STATUSES.has(value as LocalDistillationStatus)
    ? value as LocalDistillationStatus
    : "unknown";
}

function retryReasons(value: unknown): Record<string, number> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(Object.entries(source)
    .filter(([reason, amount]) => /^[a-z0-9][a-z0-9_:-]{0,63}$/iu.test(reason) && count(amount) > 0)
    .slice(0, 24)
    .map(([reason, amount]) => [reason, count(amount)]));
}

function shard(value: unknown): LocalDistillationShardProgress | null {
  const source = record(value);
  const name = safeText(source?.shard, 40);
  if (!source || !name || !/^shard-\d+$/u.test(name)) return null;
  const lastActivityAt = safeText(source.lastActivityAt, 40);
  return {
    shard: name,
    status: status(source.status),
    expectedUnits: count(source.expectedUnits),
    completedUnits: count(source.completedUnits),
    pendingUnits: count(source.pendingUnits),
    activeWorkers: count(source.activeWorkers),
    mechanismCount: count(source.mechanismCount),
    unresolvedFailures: count(source.unresolvedFailures),
    lastBatchId: safeText(source.lastBatchId, 80),
    lastActivityAt: lastActivityAt && Number.isFinite(Date.parse(lastActivityAt)) ? lastActivityAt : null,
    inactiveMinutes: optionalNumber(source.inactiveMinutes),
    stale: source.stale === true,
  };
}

export function parseLocalDistillationProgress(value: unknown): LocalDistillationProgressSnapshot | null {
  const source = record(value);
  if (!source || source.protocol !== "narrative-mechanism-progress.v1") return null;
  const updatedAt = safeText(source.updatedAt, 40);
  const expectedUnitCount = count(source.expectedUnitCount);
  if (!updatedAt || !Number.isFinite(Date.parse(updatedAt)) || expectedUnitCount === 0) return null;
  const completedUnitCount = Math.min(count(source.completedUnitCount), expectedUnitCount);
  const throughputSource = record(source.throughput);
  const shards = (Array.isArray(source.shards) ? source.shards : []).map(shard).filter((item): item is LocalDistillationShardProgress => item !== null).slice(0, 16);
  return {
    protocol: "narrative-mechanism-progress.v1",
    status: status(source.status),
    updatedAt,
    expectedUnitCount,
    completedUnitCount,
    remainingUnitCount: Math.max(0, expectedUnitCount - completedUnitCount),
    progressPercent: Math.round((completedUnitCount / expectedUnitCount) * 1_000) / 10,
    mechanismCount: count(source.mechanismCount),
    unresolvedFailureCount: count(source.unresolvedFailureCount),
    retryReasons: retryReasons(source.retryReasons),
    throughput: {
      recentWindowMinutes: optionalNumber(throughputSource?.recentWindowMinutes),
      recentCompletedUnits: optionalNumber(throughputSource?.recentCompletedUnits),
      recentUnitsPerMinute: optionalNumber(throughputSource?.recentUnitsPerMinute),
      etaMinutes: optionalNumber(throughputSource?.etaMinutes),
    },
    shards,
  };
}

export class LocalDistillationProgressRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LocalDistillationProgressRequestError";
  }
}

export async function fetchLocalDistillationProgress(signal?: AbortSignal): Promise<LocalDistillationProgressSnapshot | null> {
  const response = await fetch("/api/vnext/world-lab/imports/progress", {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: signal ?? null,
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = safeText(record(payload)?.code, 80) ?? `progress_http_${response.status}`;
    throw new LocalDistillationProgressRequestError(code);
  }
  const parsed = parseLocalDistillationProgress(record(payload)?.progress);
  if (!parsed) throw new LocalDistillationProgressRequestError("invalid_progress_payload");
  return parsed;
}
