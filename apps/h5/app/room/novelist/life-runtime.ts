import type { FormalSceneId, NovelistActivity } from "./scene-manifest";

export type EnergyBand = "steady" | "tired" | "exhausted" | "recovering" | "caffeinated";

export type HostLifeState = {
  dayPhase: "dawn" | "morning" | "noon" | "afternoon" | "evening" | "night";
  hunger: number;
  fatigue: number;
  focus: number;
  inspiration: number;
  emotionalLoad: number;
  caffeineDebt: number;
  currentScene: FormalSceneId;
  currentActivity?: string | undefined;
};

export type LifeRuntimePhase =
  | "idle"
  | "cue-visible"
  | "intent-queued"
  | "route-moving"
  | "arrival-settling"
  | "activity-ready"
  | "activity-running"
  | "activity-completing"
  | "interrupted";

export type LifeIntentReason = "hunger" | "fatigue" | "stuck" | "emotional-load" | "curiosity" | "mail" | "schedule" | "user" | "system";
export type LifeIntentStatus = "queued" | "moving" | "arrived" | "interrupted" | "complete" | "cancelled";
/** Semantic purpose of the published route selected by a life intent. */
export type LifeRoutePurpose = "scene-transition" | "scene-entry" | "scene-exit" | "scene-interaction" | "waypoint-walk" | "stable-state";
export type LifePropId = "bowl-full" | "bowl-empty";
export type LifeArrivalPolicy = "start-activity" | "arrive-only" | "hide";

export type LifeIntent = {
  id: string;
  reason: LifeIntentReason;
  sourceScene: FormalSceneId;
  targetScene: FormalSceneId;
  targetAnchor: string;
  routeKey: string;
  /** Copied from the route/activity contract; never inferred from its label. */
  routePurpose?: LifeRoutePurpose | undefined;
  requiredProps?: readonly LifePropId[] | undefined;
  arrivalPolicy?: LifeArrivalPolicy | undefined;
  arrivalActivity?: string | undefined;
  interruptible: boolean;
  returnPolicy: "resume-schedule" | "return-to-study" | "stay-until-user";
  status: LifeIntentStatus;
};

export type LifeTraceKind = "prop" | "mood" | "material" | "schedule";
export type LifeTraceExpiry = "next-visit" | "end-of-day" | "manual" | "never";

export type LifeTraceSpec = {
  id: string;
  kind: LifeTraceKind;
  expires: LifeTraceExpiry;
  payload?: Record<string, string | number | boolean>;
};

export type LifeTrace = LifeTraceSpec & {
  sceneId: FormalSceneId;
  createdByActivity: string;
  createdAt: number;
};

export type LifeStateDelta = {
  hunger?: number;
  fatigue?: number;
  focus?: number;
  inspiration?: number;
  emotionalLoad?: number;
  caffeineDebt?: number;
};

export type ActivitySettlement = {
  activityId: string;
  delta: LifeStateDelta;
  traces: LifeTraceSpec[];
  propChanges?: {
    add?: readonly LifePropId[];
    remove?: readonly LifePropId[];
  };
  feedbackCueId?: string | undefined;
  nextIntentIds?: string[] | undefined;
};

export type VisualBeatLayer = "actor" | "prop" | "scene" | "overlay";
export type VisualBeatTrigger = "activity-enter" | "activity-loop" | "activity-complete" | "energy-change" | "route-depart" | "route-arrive" | "user-tap";

export type VisualBeat = {
  id: string;
  layer: VisualBeatLayer;
  trigger: VisualBeatTrigger;
  effectId: string;
  durationMs: number;
  repeat?: { everyMs: number; maxCount?: number };
  intensity?: "subtle" | "normal" | "strong";
  reducedMotion?: "replace-with-fade" | "hide";
};

export type LifeRuntimeState = {
  phase: LifeRuntimePhase;
  sceneId: FormalSceneId;
  activityId?: string | undefined;
  energyBand: EnergyBand;
  activeCueId?: string | undefined;
  activeIntentId?: string | undefined;
  activeBeatId?: string | undefined;
  pendingIntentIds: string[];
  intents: Record<string, LifeIntent>;
  traceIds: string[];
  carriedProps: LifePropId[];
  dayIndex: number;
  revision: number;
  host: HostLifeState;
  processedEventIds: string[];
};

export type LifeRuntimeSnapshot = {
  version: 1;
  savedAt: number;
  dayIndex: number;
  host: Omit<HostLifeState, "currentScene" | "currentActivity">;
  pendingIntentIds: string[];
  intents: Record<string, LifeIntent>;
  traceIds: string[];
  carriedProps?: readonly LifePropId[];
};

export type LifeRuntimeEvent =
  | { type: "runtime-restored"; eventId: string; snapshot: LifeRuntimeSnapshot }
  | { type: "intent-queued"; eventId: string; intent: LifeIntent }
  | { type: "route-departed"; eventId: string; routeKey: string; intentId: string }
  | { type: "route-phase-changed"; eventId: string; phaseId: string; actionId: string; pointId: string }
  | { type: "route-transition-finished"; eventId: string; style: string }
  | { type: "route-arrived"; eventId: string; routeKey: string; anchor: string; sceneId: FormalSceneId; actionId: string; intentId?: string }
  | { type: "activity-entered"; eventId: string; beatId: string; activityId: string; sceneId: FormalSceneId }
  | { type: "activity-completed"; eventId: string; beatId: string; settlement: ActivitySettlement }
  | { type: "needs-drifted"; eventId: string; delta: LifeStateDelta; dayPhase?: HostLifeState["dayPhase"] }
  | { type: "cue-shown"; eventId: string; cueId: string }
  | { type: "cue-acknowledged"; eventId: string; cueId: string; intentId?: string }
  | { type: "user-interrupted"; eventId: string; commandId: string; suspendedIntentId?: string }
  | { type: "trace-created"; eventId: string; traceId: string };

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export function resolveEnergyBand(state: Pick<HostLifeState, "caffeineDebt" | "focus" | "fatigue">): EnergyBand {
  if (state.caffeineDebt >= 60 && state.focus >= 55) return "caffeinated";
  if (state.fatigue >= 85) return "exhausted";
  if (state.fatigue >= 60) return "tired";
  if (state.fatigue <= 28 && state.focus >= 42) return "recovering";
  return "steady";
}

export function createInitialLifeRuntimeState(sceneId: FormalSceneId = "study"): LifeRuntimeState {
  const host: HostLifeState = {
    dayPhase: "morning",
    hunger: 38,
    fatigue: 28,
    focus: 62,
    inspiration: 48,
    emotionalLoad: 12,
    caffeineDebt: 0,
    currentScene: sceneId,
  };
  return {
    phase: "idle",
    sceneId,
    energyBand: resolveEnergyBand(host),
    pendingIntentIds: [],
    intents: {},
    traceIds: [],
    carriedProps: [],
    dayIndex: 1,
    revision: 0,
    host,
    processedEventIds: [],
  };
}

export function materializeLifeTrace(
  spec: LifeTraceSpec,
  sceneId: FormalSceneId,
  activityId: string,
  createdAt = Date.now(),
): LifeTrace {
  return { ...spec, sceneId, createdByActivity: activityId, createdAt };
}

function markProcessed(state: LifeRuntimeState, eventId: string): LifeRuntimeState | null {
  if (state.processedEventIds.includes(eventId)) return null;
  return {
    ...state,
    revision: state.revision + 1,
    processedEventIds: [...state.processedEventIds.slice(-79), eventId],
  };
}

function updateHost(state: LifeRuntimeState, delta: LifeStateDelta): HostLifeState {
  const host = state.host;
  return {
    ...host,
    hunger: clamp(host.hunger + (delta.hunger ?? 0)),
    fatigue: clamp(host.fatigue + (delta.fatigue ?? 0)),
    focus: clamp(host.focus + (delta.focus ?? 0)),
    inspiration: clamp(host.inspiration + (delta.inspiration ?? 0)),
    emotionalLoad: clamp(host.emotionalLoad + (delta.emotionalLoad ?? 0)),
    caffeineDebt: clamp(host.caffeineDebt + (delta.caffeineDebt ?? 0)),
  };
}

function updateIntent(state: LifeRuntimeState, intentId: string | undefined, status: LifeIntentStatus): Record<string, LifeIntent> {
  if (!intentId || !state.intents[intentId]) return state.intents;
  return { ...state.intents, [intentId]: { ...state.intents[intentId]!, status } };
}

function applyPropChanges(
  carriedProps: readonly LifePropId[],
  changes: ActivitySettlement["propChanges"],
): LifePropId[] {
  if (!changes) return [...carriedProps];
  const removed = new Set(changes.remove ?? []);
  const next = carriedProps.filter((prop) => !removed.has(prop));
  for (const prop of changes.add ?? []) {
    if (!next.includes(prop)) next.push(prop);
  }
  return next;
}

export function lifeRuntimeReducer(state: LifeRuntimeState, event: LifeRuntimeEvent): LifeRuntimeState {
  if (event.type === "activity-completed" && (state.phase !== "activity-running" || (state.activityId && state.activityId !== event.settlement.activityId))) {
    return state;
  }
  const marked = markProcessed(state, event.eventId);
  if (!marked) return state;
  const next = marked;

  switch (event.type) {
    case "runtime-restored": {
      const restoredIntents = Object.fromEntries(
        Object.entries(event.snapshot.intents).map(([id, intent]) => {
          const needsRecovery = intent.status === "queued" || intent.status === "moving" || intent.status === "arrived";
          return [id, needsRecovery ? { ...intent, status: "interrupted" as const } : intent];
        }),
      );
      const recoveredIntentIds = Object.values(restoredIntents)
        .filter((intent) => intent.status === "interrupted")
        .map((intent) => intent.id);
      const pendingIntentIds = [...new Set([...event.snapshot.pendingIntentIds, ...recoveredIntentIds])]
        .filter((id) => Boolean(restoredIntents[id]));
      const host: HostLifeState = {
        ...next.host,
        ...event.snapshot.host,
        currentScene: next.sceneId,
        currentActivity: undefined,
      };
      return {
        ...next,
        phase: pendingIntentIds.length > 0 ? "interrupted" : "idle",
        activityId: undefined,
        activeCueId: undefined,
        activeIntentId: undefined,
        activeBeatId: undefined,
        pendingIntentIds,
        intents: restoredIntents,
        traceIds: [...new Set([...next.traceIds, ...event.snapshot.traceIds])],
        carriedProps: [...new Set(event.snapshot.carriedProps ?? [])],
        dayIndex: Math.max(1, Math.floor(event.snapshot.dayIndex)),
        energyBand: resolveEnergyBand(host),
        host,
      };
    }
    case "intent-queued":
      return {
        ...next,
        phase: "intent-queued",
        activeIntentId: event.intent.id,
        pendingIntentIds: [...next.pendingIntentIds.filter((id) => id !== event.intent.id), event.intent.id],
        intents: { ...next.intents, [event.intent.id]: event.intent },
      };
    case "route-departed":
      return {
        ...next,
        phase: "route-moving",
        activeIntentId: event.intentId,
        pendingIntentIds: next.pendingIntentIds.filter((id) => id !== event.intentId),
        intents: updateIntent(next, event.intentId, "moving"),
      };
    case "route-phase-changed":
      return { ...next, phase: next.phase === "route-moving" ? "route-moving" : next.phase };
    case "route-transition-finished":
      return { ...next, phase: "arrival-settling" };
    case "route-arrived": {
      const intentId = event.intentId ?? next.activeIntentId;
      return {
        ...next,
        phase: "activity-ready",
        sceneId: event.sceneId,
        activeIntentId: intentId,
        intents: updateIntent(next, intentId, "arrived"),
        host: { ...next.host, currentScene: event.sceneId },
      };
    }
    case "activity-entered":
      return {
        ...next,
        phase: "activity-running",
        sceneId: event.sceneId,
        activityId: event.activityId,
        activeBeatId: event.beatId,
        host: { ...next.host, currentScene: event.sceneId, currentActivity: event.activityId },
      };
    case "activity-completed": {
      const host = updateHost(next, event.settlement.delta);
      const traceIds = [...next.traceIds];
      for (const trace of event.settlement.traces) {
        if (!traceIds.includes(trace.id)) traceIds.push(trace.id);
      }
      const completedIntent = next.activeIntentId;
      const carriedProps = applyPropChanges(next.carriedProps, event.settlement.propChanges);
      return {
        ...next,
        phase: "idle",
        activityId: undefined,
        activeBeatId: undefined,
        activeIntentId: undefined,
        activeCueId: undefined,
        intents: updateIntent(next, completedIntent, "complete"),
        traceIds,
        carriedProps,
        energyBand: resolveEnergyBand(host),
        host: { ...host, currentActivity: undefined },
      };
    }
    case "needs-drifted": {
      const host = updateHost(next, event.delta);
      const nextHost = event.dayPhase ? { ...host, dayPhase: event.dayPhase } : host;
      return {
        ...next,
        energyBand: resolveEnergyBand(nextHost),
        host: nextHost,
      };
    }
    case "cue-shown":
      return { ...next, phase: next.phase === "idle" ? "cue-visible" : next.phase, activeCueId: event.cueId };
    case "cue-acknowledged":
      return {
        ...next,
        phase: event.intentId ? "intent-queued" : next.phase,
        activeCueId: next.activeCueId === event.cueId ? undefined : next.activeCueId,
        activeIntentId: event.intentId ?? next.activeIntentId,
      };
    case "user-interrupted":
      {
        const suspendedIntentId = event.suspendedIntentId ?? next.activeIntentId;
        const pendingIntentIds = suspendedIntentId && !next.pendingIntentIds.includes(suspendedIntentId)
          ? [...next.pendingIntentIds, suspendedIntentId]
          : next.pendingIntentIds;
      return {
        ...next,
        phase: "interrupted",
        activityId: undefined,
        activeIntentId: undefined,
        activeBeatId: undefined,
        activeCueId: undefined,
        pendingIntentIds,
        intents: updateIntent(next, suspendedIntentId, "interrupted"),
        host: { ...next.host, currentActivity: undefined },
      };
      }
    case "trace-created":
      return { ...next, traceIds: next.traceIds.includes(event.traceId) ? next.traceIds : [...next.traceIds, event.traceId] };
  }
}

export const defaultActivitySettlements: Readonly<Record<string, ActivitySettlement>> = {
  "study-writing": {
    activityId: "study-writing",
    delta: { fatigue: 6, focus: 8, inspiration: 2, emotionalLoad: 1 },
    traces: [{ id: "study-page-progress", kind: "material", expires: "end-of-day" }],
  },
  "dining-eat-red-bean-soup": {
    activityId: "dining-eat-red-bean-soup",
    delta: { hunger: -35, fatigue: -2, focus: 4, emotionalLoad: -5 },
    traces: [
      { id: "bowl-empty", kind: "prop", expires: "next-visit" },
      { id: "warmth", kind: "mood", expires: "end-of-day" },
    ],
    propChanges: { remove: ["bowl-full"], add: ["bowl-empty"] },
    feedbackCueId: "meal-feedback",
    nextIntentIds: ["resume-writing"],
  },
  "dining-brew-coffee": {
    activityId: "dining-brew-coffee",
    delta: { fatigue: 4, focus: 18, inspiration: 8, caffeineDebt: 24 },
    traces: [{ id: "coffee-pot-warm", kind: "prop", expires: "next-visit" }],
    nextIntentIds: ["resume-writing"],
  },
  "bedroom-rest": {
    activityId: "bedroom-rest",
    delta: { fatigue: -28, focus: 5, emotionalLoad: -8 },
    traces: [{ id: "rested", kind: "mood", expires: "end-of-day" }],
    nextIntentIds: ["resume-writing"],
  },
  "bedroom-vinyl": {
    activityId: "bedroom-vinyl",
    delta: { fatigue: -12, focus: 2, inspiration: 3, emotionalLoad: -10 },
    traces: [{ id: "vinyl-side", kind: "prop", expires: "next-visit" }],
  },
  "terrace-city-look": {
    activityId: "terrace-city-look",
    delta: { fatigue: 2, focus: 1, inspiration: 12, emotionalLoad: -9 },
    traces: [{ id: "night-note-created", kind: "material", expires: "end-of-day" }],
    nextIntentIds: ["resume-writing"],
  },
  "terrace-turtle-corner": {
    activityId: "terrace-turtle-corner",
    delta: { fatigue: 1, inspiration: 5, emotionalLoad: -6 },
    traces: [{ id: "turtle-last-seen", kind: "prop", expires: "next-visit" }],
  },
  "attic-archive": {
    activityId: "attic-archive",
    delta: { fatigue: 3, focus: 2, inspiration: 10, emotionalLoad: 1 },
    traces: [
      { id: "archive-book-open", kind: "prop", expires: "next-visit" },
      { id: "memory-fragment", kind: "material", expires: "end-of-day" },
    ],
    nextIntentIds: ["resume-writing"],
  },
};

export function getActivitySettlement(activityId: string): ActivitySettlement {
  return defaultActivitySettlements[activityId] ?? { activityId, delta: {}, traces: [] };
}

export function activityIdForNovelistActivity(activity: NovelistActivity): string {
  return activity === "writing"
    ? "study-writing"
    : activity === "eating"
      ? "dining-eat-red-bean-soup"
      : activity === "sleeping"
        ? "bedroom-rest"
        : activity === "daydreaming"
          ? "terrace-city-look"
          : "away";
}
