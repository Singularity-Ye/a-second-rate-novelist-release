import type { FormalSceneId } from "./scene-manifest";

export const SCENE_INTERACTION_STORAGE_KEY = "novelist-scene-interactions-v1";
const SNAPSHOT_VERSION = 1 as const;

export type SceneInteractionStateMap = Readonly<Record<string, string>>;

export type SceneInteractionSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  states: Record<string, string>;
};

const FORMAL_SCENE_IDS: readonly FormalSceneId[] = [
  "study",
  "dining-kitchen",
  "bedroom",
  "entrance",
  "terrace-greenery",
  "attic",
  "bathroom-private",
];

let memorySnapshot: SceneInteractionSnapshot | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isSceneId = (value: unknown): value is FormalSceneId => typeof value === "string" && FORMAL_SCENE_IDS.includes(value as FormalSceneId);

function isSceneInteractionKey(value: string): boolean {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return false;
  return isSceneId(value.slice(0, separator)) && isNonEmptyString(value.slice(separator + 1));
}

function readStorage(): unknown {
  if (typeof window === "undefined") return memorySnapshot;
  try {
    const raw = window.localStorage.getItem(SCENE_INTERACTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeStates(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const states: Record<string, string> = {};
  for (const [key, stateId] of Object.entries(value)) {
    if (isSceneInteractionKey(key) && isNonEmptyString(stateId)) states[key] = stateId;
  }
  return states;
}

/** Read only state transitions that were produced by published scene routes. */
export function loadSceneInteractionStates(): Record<string, string> {
  const raw = readStorage();
  if (!isRecord(raw) || raw.version !== SNAPSHOT_VERSION) return {};
  return normalizeStates(raw.states);
}

/** Persist the latest stable state of every scene-owned interaction. */
export function saveSceneInteractionStates(states: SceneInteractionStateMap): SceneInteractionSnapshot {
  const snapshot: SceneInteractionSnapshot = {
    version: SNAPSHOT_VERSION,
    states: normalizeStates(states),
  };
  memorySnapshot = snapshot;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SCENE_INTERACTION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // A storage/quota failure must not interrupt route playback.
    }
  }
  return snapshot;
}

export function clearSceneInteractionStates(): void {
  memorySnapshot = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SCENE_INTERACTION_STORAGE_KEY);
  } catch {
    // Clearing a best-effort visual snapshot must remain non-fatal.
  }
}
