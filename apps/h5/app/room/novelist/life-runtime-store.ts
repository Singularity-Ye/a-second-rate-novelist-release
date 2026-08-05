import type { FormalSceneId } from "./scene-manifest";
import type { NovelistActivity } from "./scene-manifest";
import type {
  LifeArrivalPolicy,
  LifeIntent,
  LifeIntentReason,
  LifePropId,
  LifeRoutePurpose,
  LifeRuntimeSnapshot,
  LifeRuntimeState,
  LifeStageSnapshot,
} from "./life-runtime";

const STORAGE_KEY = "novelist-life-runtime-v1";
const SNAPSHOT_VERSION = 1 as const;
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
const NOVELIST_ACTIVITIES: readonly NovelistActivity[] = ["writing", "eating", "sleeping", "daydreaming", "away"];
const LIFE_INTENT_REASONS: readonly LifeIntentReason[] = ["hunger", "fatigue", "stuck", "emotional-load", "curiosity", "mail", "schedule", "user", "system"];
const LIFE_ROUTE_PURPOSES: readonly LifeRoutePurpose[] = ["scene-transition", "scene-entry", "scene-exit", "scene-interaction", "waypoint-walk", "stable-state"];
const LIFE_ARRIVAL_POLICIES: readonly LifeArrivalPolicy[] = ["start-activity", "arrive-only", "hide"];
let memorySnapshot: LifeRuntimeSnapshot | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isSceneId = (value: unknown): value is FormalSceneId => typeof value === "string" && FORMAL_SCENE_IDS.includes(value as FormalSceneId);
const isLifePropId = (value: unknown): value is LifePropId => typeof value === "string" && LIFE_PROP_IDS.includes(value as LifePropId);
const isNovelistActivity = (value: unknown): value is NovelistActivity => typeof value === "string" && NOVELIST_ACTIVITIES.includes(value as NovelistActivity);
const clampPersistedNumber = (value: number) => Math.min(100, Math.max(0, value));

function isLifeIntent(value: unknown): value is LifeIntent {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && typeof value.reason === "string"
    && LIFE_INTENT_REASONS.includes(value.reason as LifeIntentReason)
    && isSceneId(value.sourceScene)
    && isSceneId(value.targetScene)
    && isNonEmptyString(value.targetAnchor)
    && isNonEmptyString(value.routeKey)
    && (value.routePurpose === undefined || (typeof value.routePurpose === "string" && LIFE_ROUTE_PURPOSES.includes(value.routePurpose as LifeRoutePurpose)))
    && (value.requiredProps === undefined || (Array.isArray(value.requiredProps) && value.requiredProps.every(isLifePropId)))
    && (value.arrivalPolicy === undefined || (typeof value.arrivalPolicy === "string" && LIFE_ARRIVAL_POLICIES.includes(value.arrivalPolicy as LifeArrivalPolicy)))
    && (value.arrivalActivity === undefined || isNonEmptyString(value.arrivalActivity))
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
  if (!isRecord(raw) || raw.version !== SNAPSHOT_VERSION || !isFiniteNumber(raw.savedAt) || raw.savedAt < 0 || !isFiniteNumber(raw.dayIndex) || !isRecord(raw.host)) return null;
  const host = raw.host;
  const dayPhases = ["dawn", "morning", "noon", "afternoon", "evening", "night"] as const;
  if (!dayPhases.includes(host.dayPhase as (typeof dayPhases)[number])) return null;
  const numericKeys = ["hunger", "fatigue", "focus", "inspiration", "emotionalLoad", "caffeineDebt"] as const;
  if (numericKeys.some((key) => !isFiniteNumber(host[key]))) return null;
  const intents = isRecord(raw.intents)
    ? Object.fromEntries(Object.entries(raw.intents).filter(([, intent]) => isLifeIntent(intent))) as Record<string, LifeIntent>
    : {};
  const pendingIntentIds = Array.isArray(raw.pendingIntentIds)
    ? [...new Set(raw.pendingIntentIds.filter((id): id is string => isNonEmptyString(id) && Boolean(intents[id])))]
    : [];
  const traceIds = Array.isArray(raw.traceIds)
    ? [...new Set(raw.traceIds.filter((id): id is string => isNonEmptyString(id)))]
    : [];
  const carriedProps = Array.isArray(raw.carriedProps)
    ? [...new Set(raw.carriedProps.filter(isLifePropId))]
    : [];
  const rawStage = isRecord(raw.stage) ? raw.stage : null;
  const stage: LifeStageSnapshot | null = rawStage
    && isSceneId(rawStage.sceneId)
    && typeof rawStage.routeId === "string"
    && isNovelistActivity(rawStage.activity)
    ? {
      sceneId: rawStage.sceneId,
      routeId: rawStage.routeId,
      activity: rawStage.activity,
      ...(typeof rawStage.actionId === "string" ? { actionId: rawStage.actionId } : {}),
    }
    : null;
  return {
    version: SNAPSHOT_VERSION,
    savedAt: raw.savedAt,
    dayIndex: Math.max(1, Math.floor(raw.dayIndex)),
    host: {
      dayPhase: host.dayPhase as LifeRuntimeSnapshot["host"]["dayPhase"],
      hunger: clampPersistedNumber(Number(host.hunger)),
      fatigue: clampPersistedNumber(Number(host.fatigue)),
      focus: clampPersistedNumber(Number(host.focus)),
      inspiration: clampPersistedNumber(Number(host.inspiration)),
      emotionalLoad: clampPersistedNumber(Number(host.emotionalLoad)),
      caffeineDebt: clampPersistedNumber(Number(host.caffeineDebt)),
    },
    pendingIntentIds,
    intents,
    traceIds,
    carriedProps,
    ...(stage ? { stage } : {}),
  };
}

export function saveLifeRuntimeSnapshot(
  state: LifeRuntimeState,
  savedAt = Date.now(),
  stage?: LifeStageSnapshot,
): LifeRuntimeSnapshot {
  const snapshot: LifeRuntimeSnapshot = {
    version: SNAPSHOT_VERSION,
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
    ...(stage ? { stage } : {}),
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
