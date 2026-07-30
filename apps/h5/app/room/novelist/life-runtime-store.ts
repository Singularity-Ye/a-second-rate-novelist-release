import type { FormalSceneId } from "./scene-manifest";
import type { LifeIntent, LifePropId, LifeRuntimeSnapshot, LifeRuntimeState } from "./life-runtime";

const STORAGE_KEY = "novelist-life-runtime-v1";
const FORMAL_SCENE_IDS: readonly FormalSceneId[] = [
  "study",
  "dining-kitchen",
  "bedroom",
  "entrance",
  "terrace-greenery",
  "attic",
  "bathroom-private",
];
const LIFE_PROP_IDS = ["bowl-full", "bowl-empty"] as const;
let memorySnapshot: LifeRuntimeSnapshot | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isSceneId = (value: unknown): value is FormalSceneId => typeof value === "string" && FORMAL_SCENE_IDS.includes(value as FormalSceneId);
const isLifePropId = (value: unknown): value is LifePropId => typeof value === "string" && LIFE_PROP_IDS.includes(value as LifePropId);

function isLifeIntent(value: unknown): value is LifeIntent {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.reason === "string"
    && isSceneId(value.sourceScene)
    && isSceneId(value.targetScene)
    && typeof value.targetAnchor === "string"
    && typeof value.routeKey === "string"
    && typeof value.interruptible === "boolean"
    && (value.returnPolicy === "resume-schedule" || value.returnPolicy === "return-to-study" || value.returnPolicy === "stay-until-user")
    && (value.status === "queued" || value.status === "moving" || value.status === "arrived" || value.status === "interrupted" || value.status === "complete" || value.status === "cancelled");
}

function readStorage(): unknown {
  if (typeof window === "undefined") return memorySnapshot;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadLifeRuntimeSnapshot(): LifeRuntimeSnapshot | null {
  const raw = readStorage();
  if (!isRecord(raw) || raw.version !== 1 || !isFiniteNumber(raw.savedAt) || !isFiniteNumber(raw.dayIndex) || !isRecord(raw.host)) return null;
  const host = raw.host;
  const dayPhases = ["dawn", "morning", "noon", "afternoon", "evening", "night"] as const;
  if (!dayPhases.includes(host.dayPhase as (typeof dayPhases)[number])) return null;
  const numericKeys = ["hunger", "fatigue", "focus", "inspiration", "emotionalLoad", "caffeineDebt"] as const;
  if (numericKeys.some((key) => !isFiniteNumber(host[key]))) return null;
  const intents = isRecord(raw.intents)
    ? Object.fromEntries(Object.entries(raw.intents).filter(([, intent]) => isLifeIntent(intent))) as Record<string, LifeIntent>
    : {};
  const pendingIntentIds = Array.isArray(raw.pendingIntentIds)
    ? raw.pendingIntentIds.filter((id): id is string => typeof id === "string" && Boolean(intents[id]))
    : [];
  const traceIds = Array.isArray(raw.traceIds)
    ? [...new Set(raw.traceIds.filter((id): id is string => typeof id === "string"))]
    : [];
  const carriedProps = Array.isArray(raw.carriedProps)
    ? [...new Set(raw.carriedProps.filter(isLifePropId))]
    : [];
  return {
    version: 1,
    savedAt: raw.savedAt,
    dayIndex: Math.max(1, Math.floor(raw.dayIndex)),
    host: {
      dayPhase: host.dayPhase as LifeRuntimeSnapshot["host"]["dayPhase"],
      hunger: Number(host.hunger),
      fatigue: Number(host.fatigue),
      focus: Number(host.focus),
      inspiration: Number(host.inspiration),
      emotionalLoad: Number(host.emotionalLoad),
      caffeineDebt: Number(host.caffeineDebt),
    },
    pendingIntentIds,
    intents,
    traceIds,
    carriedProps,
  };
}

export function saveLifeRuntimeSnapshot(state: LifeRuntimeState, savedAt = Date.now()): LifeRuntimeSnapshot {
  const snapshot: LifeRuntimeSnapshot = {
    version: 1,
    savedAt,
    dayIndex: state.dayIndex,
    host: {
      dayPhase: state.host.dayPhase,
      hunger: state.host.hunger,
      fatigue: state.host.fatigue,
      focus: state.host.focus,
      inspiration: state.host.inspiration,
      emotionalLoad: state.host.emotionalLoad,
      caffeineDebt: state.host.caffeineDebt,
    },
    pendingIntentIds: [...state.pendingIntentIds],
    intents: { ...state.intents },
    traceIds: [...state.traceIds],
    carriedProps: [...state.carriedProps],
  };
  memorySnapshot = snapshot;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Private browsing/quota failures should not break the life runtime.
    }
  }
  return snapshot;
}

export function clearLifeRuntimeSnapshot(): void {
  memorySnapshot = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing a best-effort snapshot must remain non-fatal.
  }
}
