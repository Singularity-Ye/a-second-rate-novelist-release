import type { FormalSceneId } from "./scene-manifest";
import {
  getActivitySettlement,
  type ActivitySettlement,
  type LifeArrivalPolicy,
  type LifePropId,
  type LifeRoutePurpose,
  type VisualBeat,
} from "./life-runtime";

export type LifeActivityId =
  | "study-writing"
  | "study-stuck"
  | "bedroom-rest"
  | "bedroom-vinyl"
  | "dining-serve-red-bean-soup"
  | "dining-eat-red-bean-soup"
  | "dining-brew-coffee"
  | "terrace-city-look"
  | "terrace-turtle-corner"
  | "terrace-bench-rest"
  | "attic-archive";

export type LifeContinuationMode = "start-activity" | "arrive-only";

export type LifeRouteIntent = {
  purpose: LifeRoutePurpose;
  requiredProps?: readonly LifePropId[];
  arrivalPolicy: LifeArrivalPolicy;
};

export type LifeActivityDefinition = {
  id: LifeActivityId;
  sceneId: FormalSceneId;
  actionId: string;
  routeKey?: string;
  /** Route used when this activity continues into the next activity. */
  continuationRouteKey?: string;
  durationMs: number | "until-user";
  settleOnInterrupt?: boolean;
  nextActivityId?: LifeActivityId;
  /** Whether the next activity begins automatically after the continuation route arrives. */
  continuationMode?: LifeContinuationMode;
  /** Meaning of this activity's primary route in the published route graph. */
  routeIntent?: LifeRouteIntent;
  /** Meaning of an explicit handoff route owned by this activity. */
  continuationRouteIntent?: LifeRouteIntent;
  settlement: ActivitySettlement;
  visualBeats: readonly VisualBeat[];
};

const beat = (
  id: string,
  layer: VisualBeat["layer"],
  trigger: VisualBeat["trigger"],
  effectId: string,
  durationMs: number,
  intensity: VisualBeat["intensity"] = "subtle",
): VisualBeat => {
  const base: VisualBeat = {
    id,
    layer,
    trigger,
    effectId,
    durationMs,
    intensity,
    reducedMotion: "replace-with-fade",
  };
  return trigger === "activity-loop"
    ? { ...base, repeat: { everyMs: durationMs } }
    : base;
};

export const formalLifeActivities: Readonly<Record<LifeActivityId, LifeActivityDefinition>> = {
  "study-writing": {
    id: "study-writing",
    sceneId: "study",
    actionId: "writing-seat",
    routeKey: "study-desk-stay",
    routeIntent: { purpose: "stable-state", arrivalPolicy: "start-activity" },
    durationMs: "until-user",
    settleOnInterrupt: true,
    settlement: getActivitySettlement("study-writing"),
    visualBeats: [
      beat("manuscript-enter", "actor", "activity-enter", "manuscript-paper-burst", 1600, "normal"),
      beat("manuscript-stage-burst", "overlay", "activity-enter", "manuscript-paper-burst", 1600, "normal"),
      beat("writing-inspiration-drift", "overlay", "activity-loop", "inspiration-drift", 2800, "subtle"),
    ],
  },
  "study-stuck": {
    id: "study-stuck",
    sceneId: "study",
    actionId: "stand-by-desk",
    routeKey: "study-writing-to-stand-by-desk",
    durationMs: 6500,
    settlement: { activityId: "study-stuck", delta: { focus: -2, inspiration: 2 }, traces: [{ id: "stuck-window", kind: "mood", expires: "end-of-day" }] },
    visualBeats: [beat("stuck-pause", "actor", "activity-enter", "writing-pause", 900)],
  },
  "dining-serve-red-bean-soup": {
    id: "dining-serve-red-bean-soup",
    sceneId: "dining-kitchen",
    actionId: "serve-red-bean-soup",
    routeKey: "dining-entry-to-counter",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 5200,
    nextActivityId: "dining-eat-red-bean-soup",
    settlement: {
      activityId: "dining-serve-red-bean-soup",
      delta: {},
      traces: [{ id: "soup-served", kind: "prop", expires: "next-visit" }],
      propChanges: { remove: ["bowl-empty"], add: ["bowl-full"] },
      feedbackCueId: "serve-feedback",
    },
    visualBeats: [
      beat("serve-steam", "scene", "activity-loop", "warm-steam", 1200),
      beat("serve-finish", "overlay", "activity-complete", "serve-finish", 900),
    ],
  },
  "dining-eat-red-bean-soup": {
    id: "dining-eat-red-bean-soup",
    sceneId: "dining-kitchen",
    actionId: "meal-table",
    routeKey: "dining-counter-to-table",
    routeIntent: {
      purpose: "scene-interaction",
      requiredProps: ["bowl-full"],
      arrivalPolicy: "start-activity",
    },
    nextActivityId: "dining-serve-red-bean-soup",
    continuationRouteKey: "dining-table-to-counter",
    continuationRouteIntent: {
      purpose: "scene-interaction",
      requiredProps: ["bowl-empty"],
      arrivalPolicy: "arrive-only",
    },
    // Returning the empty bowl is a one-shot handoff. The character stops at
    // the counter; starting another serving activity here would create an
    // automatic counter -> table -> counter loop.
    continuationMode: "arrive-only",
    durationMs: 9000,
    settlement: getActivitySettlement("dining-eat-red-bean-soup"),
    visualBeats: [
      beat("meal-steam", "scene", "activity-loop", "warm-steam", 1200),
      beat("meal-satisfaction", "overlay", "activity-complete", "meal-satisfaction", 1300, "strong"),
    ],
  },
  "dining-brew-coffee": {
    id: "dining-brew-coffee",
    sceneId: "dining-kitchen",
    actionId: "kitchen-counter",
    routeKey: "dining-entry-to-counter",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 7500,
    settlement: getActivitySettlement("dining-brew-coffee"),
    visualBeats: [
      beat("coffee-steam", "scene", "activity-loop", "coffee-steam", 1200),
      beat("coffee-focus", "overlay", "activity-complete", "coffee-focus", 1000),
    ],
  },
  "bedroom-rest": {
    id: "bedroom-rest",
    sceneId: "bedroom",
    actionId: "bed-sleep",
    routeKey: "bedroom-to-bed",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 10000,
    settlement: getActivitySettlement("bedroom-rest"),
    visualBeats: [
      beat("rest-recovery", "overlay", "activity-complete", "recovery-settle", 1000),
      beat("rest-stars", "overlay", "activity-complete", "rest-stars", 1300),
    ],
  },
  "bedroom-vinyl": {
    id: "bedroom-vinyl",
    sceneId: "bedroom",
    actionId: "record-place",
    routeKey: "bedroom-to-record",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 8000,
    settlement: getActivitySettlement("bedroom-vinyl"),
    visualBeats: [
      beat("vinyl-notes", "scene", "activity-enter", "record-note-particles", 1400),
      beat("vinyl-tail", "overlay", "activity-complete", "vinyl-tail", 1000),
    ],
  },
  "terrace-city-look": {
    id: "terrace-city-look",
    sceneId: "terrace-greenery",
    actionId: "telescope",
    routeKey: "terrace-to-telescope",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 7000,
    settlement: getActivitySettlement("terrace-city-look"),
    visualBeats: [
      beat("city-look-glow", "scene", "activity-enter", "terrace-night-glow", 1400),
      beat("inspiration-spark", "overlay", "activity-complete", "inspiration-spark", 1400, "strong"),
    ],
  },
  "terrace-turtle-corner": {
    id: "terrace-turtle-corner",
    sceneId: "terrace-greenery",
    actionId: "turtle-pond",
    routeKey: "terrace-to-turtle",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 6500,
    settlement: getActivitySettlement("terrace-turtle-corner"),
    visualBeats: [
      beat("turtle-peek", "scene", "activity-enter", "turtle-peek", 900),
      beat("turtle-heart", "overlay", "activity-complete", "turtle-heart", 900),
    ],
  },
  "terrace-bench-rest": {
    id: "terrace-bench-rest",
    sceneId: "terrace-greenery",
    actionId: "bench",
    routeKey: "terrace-to-bench",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 7000,
    settlement: { activityId: "terrace-bench-rest", delta: { fatigue: -6, inspiration: 4, emotionalLoad: -5 }, traces: [{ id: "bench-rested", kind: "mood", expires: "end-of-day" }] },
    visualBeats: [
      beat("bench-breeze", "scene", "activity-loop", "terrace-breeze", 1400),
      beat("bench-soften", "overlay", "activity-complete", "bench-soften", 900),
    ],
  },
  "attic-archive": {
    id: "attic-archive",
    sceneId: "attic",
    actionId: "archive-shelf",
    routeKey: "attic-to-archive",
    routeIntent: { purpose: "scene-entry", arrivalPolicy: "start-activity" },
    durationMs: 8500,
    settlement: getActivitySettlement("attic-archive"),
    visualBeats: [
      beat("archive-dust", "scene", "activity-enter", "attic-dust-light", 1500),
      beat("memory-shard", "overlay", "activity-complete", "memory-shard", 1200, "normal"),
    ],
  },
};

export function getLifeActivity(activityId: string | undefined): LifeActivityDefinition | null {
  if (!activityId) return null;
  return formalLifeActivities[activityId as LifeActivityId] ?? null;
}

export function resolveLifeActivity(sceneId: FormalSceneId, actionId: string | undefined): LifeActivityDefinition | null {
  return Object.values(formalLifeActivities).find((activity) => activity.sceneId === sceneId && activity.actionId === actionId) ?? null;
}

/**
 * A continuation belongs to the activity that just finished. This matters
 * for the meal chain: serving continues to counter -> table, while eating
 * continues to table -> counter. Reading the next activity's continuation
 * route would reverse those two handoffs and can make the chain self-loop.
 */
export function getLifeContinuationRouteKey(
  activity: Pick<LifeActivityDefinition, "continuationRouteKey">,
  nextActivity: Pick<LifeActivityDefinition, "routeKey">,
): string | undefined {
  return activity.continuationRouteKey ?? nextActivity.routeKey;
}
