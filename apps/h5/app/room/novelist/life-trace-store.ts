import type { FormalSceneId } from "./scene-manifest";
import type { LifeTrace } from "./life-runtime";

const LIFE_TRACE_STORAGE_KEY = "novelist-life-traces-v1";
let memoryTraces: LifeTrace[] = [];

function read(): LifeTrace[] {
  if (typeof window === "undefined") return [...memoryTraces];
  try {
    const raw = window.localStorage.getItem(LIFE_TRACE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as LifeTrace[] : [];
  } catch {
    return [];
  }
}

function write(traces: LifeTrace[]) {
  memoryTraces = [...traces];
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIFE_TRACE_STORAGE_KEY, JSON.stringify(traces));
  } catch {
    // Private browsing/quota failures should not break the life runtime.
  }
}

export function listLifeTraces(filter: { sceneId?: FormalSceneId } = {}): LifeTrace[] {
  const traces = read();
  return filter.sceneId ? traces.filter((trace) => trace.sceneId === filter.sceneId) : traces;
}

export function putLifeTrace(trace: LifeTrace): LifeTrace[] {
  const traces = read().filter((item) => item.id !== trace.id);
  traces.push(trace);
  write(traces);
  return traces;
}

export function removeLifeTrace(traceId: string): LifeTrace[] {
  const traces = read().filter((trace) => trace.id !== traceId);
  write(traces);
  return traces;
}

export function clearLifeTraces(scope: "all" | { sceneId: FormalSceneId }): LifeTrace[] {
  const traces = scope === "all" ? [] : read().filter((trace) => trace.sceneId !== scope.sceneId);
  write(traces);
  return traces;
}

export function expireLifeTraces(now = Date.now(), dayStartedAt?: number): LifeTrace[] {
  const localDayStart = dayStartedAt ?? (() => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  })();
  const traces = read().filter((trace) => {
    if (trace.expires === "never" || trace.expires === "manual") return true;
    if (trace.expires === "next-visit") return true;
    return trace.createdAt >= localDayStart;
  });
  write(traces);
  return traces;
}
