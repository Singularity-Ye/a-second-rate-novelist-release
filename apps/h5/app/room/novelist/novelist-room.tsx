"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { NextDayPlanDraft } from "@erliu/shared-contracts";
import {
  formalEcologySceneManifest,
  getFormalSceneAction,
  getFormalSceneRoute,
  getFormalSceneRouteTransition,
  type FormalSceneId,
  type NovelistActivity,
  type NovelistFormalActorAsset,
  type NovelistSceneActionPreview,
  type NovelistRouteTransition,
} from "./scene-manifest";
import {
  NovelistMotionActor,
  shouldHoldAtArrivalHandoff,
  type NovelistMotionActorTransition,
} from "./novelist-motion-actor";
import { SceneInteractions } from "./scene-interactions";
import styles from "./novelist-room.module.css";
import {
  formalLifeSceneIds,
  getLifeBeatCue,
  getLifeFeedbackCue,
  getAutoplayLifeBeat,
  getCalendarLifeDay,
  getStateLifeCue,
  getNeedLifeCue,
  getSceneInteractionCue,
  getSceneLifeCue,
  getLifeContinuationCue,
  novelistDailyRhythm,
  type LifeBeat,
  type LifeCue,
  type LifeMoment,
  type LifeNeedKey,
  type LifeTendency,
  type LifePlanMode,
} from "./life-rhythm";
import { buildNextDayPlanDraft } from "./life-orchestration";
import {
  commitNextDayPlanDraft,
  loadNextDayPlanDraft,
  resolveLifeDayPlan,
} from "./next-day-plan-store";
import {
  getLifeActivity,
  getLifeContinuationRouteKey,
  resolveLifeActivity,
  type LifeActivityDefinition,
} from "./life-activities";
import {
  findLifeActivityForRoute,
  lifeIntentRouteFields,
  missingLifeProps,
  resolveLifeRouteContract,
} from "./life-route-runtime";
import { projectLifeSystem, resolveLifeSystemRoute } from "./life-system";
import {
  activityIdForNovelistActivity,
  createInitialLifeRuntimeState,
  getActivitySettlement,
  lifeRuntimeReducer,
  materializeLifeTrace,
  type LifeIntent,
  type LifeIntentReason,
  type LifePropId,
  type LifeRuntimeEvent,
  type LifeRuntimeState,
  type LifeStageSnapshot,
  type EnergyBand,
  type VisualBeat,
} from "./life-runtime";
import { expireLifeTraces, listLifeTraces, putLifeTrace } from "./life-trace-store";
import { createFieldworkPostcard, listLifePostcards, putLifePostcard, type LifePostcard } from "./life-postcards";
import { loadLifeRuntimeSnapshot, saveLifeRuntimeSnapshot } from "./life-runtime-store";
import { loadSceneInteractionStates, saveSceneInteractionStates } from "./scene-interaction-store";
import {
  buildPublishedSceneJourney,
  resolveSceneConnectorTarget,
  type SceneConnectorTargetStrategy,
  type PreferredSceneConnector,
  type SceneTravelLeg,
} from "./scene-travel";
import { buildFormalRouteGraph, type FormalRoutePurpose } from "../route-publish/formal-route-graph";
import { SystemLayerPanel } from "../system/system-layer-panel";
import RoomUiPresentationalEditor from "../system/room-ui-presentational-editor";
import RoomUiPresentationalSurface from "../system/room-ui-presentational-surface";
import type { NovelistChatChannel } from "../system/novelist-chat-api";

export type NovelistState = NovelistActivity;

const WHITE_SMOKE_ASSET_SRC = "/assets/ecology/effects/transitions/white-smoke-puff-v1.webp";
const FORMAL_SMOKE_TURNS = 1;
const AUTOPLAY_INTERVAL_MS = 26000;
const AUTOPLAY_WRITING_DURATION_MS = 14000;
const FULL_SCENE_VISUAL_EFFECTS = new Set([
  "terrace-night-glow",
  "terrace-breeze",
  "attic-dust-light",
]);

function clampStagePercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ActiveFormalRouteTransition = NovelistRouteTransition & {
  key: number;
  effectiveDurationMs: number;
  fromPreview: NovelistSceneActionPreview | null;
  toPreview: NovelistSceneActionPreview | null;
  fromMode: "scene" | "actor" | "none";
  toMode: "scene" | "actor" | "none";
  fromActorAsset: NovelistFormalActorAsset | null;
  toActorAsset: NovelistFormalActorAsset | null;
};

type LifeRuntimeEventInput<T extends LifeRuntimeEvent = LifeRuntimeEvent> = T extends { eventId: string }
  ? Omit<T, "eventId">
  : never;

type LifeNeedPlan = {
  reason: LifeIntentReason;
  sceneId: FormalSceneId;
  state: NovelistState;
  routeId: string;
  targetAnchor: string;
};

type ActiveSceneJourney = {
  id: number;
  fromSceneId: FormalSceneId;
  targetSceneId: FormalSceneId;
  targetState: NovelistState;
  legs: readonly SceneTravelLeg[];
  index: number;
};

type RouteCommandOptions = {
  arrivalActivityMode?: "start" | "skip";
  preferredConnector?: PreferredSceneConnector;
};

const lifeNeedPlans: Readonly<Record<LifeNeedKey, LifeNeedPlan>> = {
  hunger: { reason: "hunger", sceneId: "dining-kitchen", state: "eating", routeId: "dining-entry-to-counter", targetAnchor: "kitchen-counter" },
  fatigue: { reason: "fatigue", sceneId: "bedroom", state: "sleeping", routeId: "bedroom-to-bed", targetAnchor: "bed-edge" },
  stuck: { reason: "stuck", sceneId: "terrace-greenery", state: "daydreaming", routeId: "terrace-to-telescope", targetAnchor: "telescope" },
  "emotional-load": { reason: "emotional-load", sceneId: "bedroom", state: "daydreaming", routeId: "door-to-lounge", targetAnchor: "lounge-corner" },
};

const energyBandLabels: Readonly<Record<EnergyBand, string>> = {
  steady: "平稳",
  tired: "有些疲惫",
  exhausted: "精力见底",
  recovering: "正在恢复",
  caffeinated: "咖啡加持",
};

const dayPhaseLabels: Readonly<Record<LifeRuntimeState["host"]["dayPhase"], string>> = {
  dawn: "清晨",
  morning: "上午",
  noon: "午间",
  afternoon: "下午",
  evening: "傍晚",
  night: "夜间",
};

const dayPhaseOrder = ["dawn", "morning", "noon", "afternoon", "evening", "night"] as const;

const dayPhaseStartMinutes: Readonly<Record<LifeRuntimeState["host"]["dayPhase"], number>> = {
  dawn: 0,
  morning: 6 * 60,
  noon: 11 * 60,
  afternoon: 14 * 60,
  evening: 18 * 60,
  night: 22 * 60,
};

function dayPhaseFromClock(hour: number): LifeRuntimeState["host"]["dayPhase"] {
  if (hour < 6) return "dawn";
  if (hour < 11) return "morning";
  if (hour < 14) return "noon";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

const runtimePhaseLabels: Readonly<Record<string, string>> = {
  idle: "待机观察",
  "cue-visible": "念头浮现",
  "intent-queued": "已经决定",
  "route-moving": "正在路上",
  "arrival-settling": "白烟散开",
  "activity-ready": "抵达锚点",
  "activity-running": "正在生活",
  "activity-completing": "留下痕迹",
  interrupted: "被系统打断",
};

const lifeTraceLabels: Readonly<Record<string, string>> = {
  "bowl-empty": "空碗还在等下一段路",
  warmth: "吃过饭的暖意",
  "coffee-pot-warm": "咖啡壶还温着",
  "caffeine-debt": "咖啡留下的加速感",
  "night-note-created": "夜景里记下的一句",
  "turtle-last-seen": "卡文最后看见的位置",
  "archive-book-open": "旧书翻到的那一页",
  "memory-fragment": "一小块旧记忆",
  "vinyl-side": "唱片停在这一面",
  rested: "睡醒后变轻了一点",
  "study-page-progress": "书桌上多了一页",
  "draft-shred": "废稿撕成了一只纸蝶",
  "soup-served": "料理台盛过红豆汤",
  "stuck-window": "卡文时打开过的窗",
  "bench-rested": "长椅替他保管过一会儿风",
};

function routeProgressAtFormalPoint(route: { points: readonly { id: string; x: number; y: number }[] }, pointId: string): number {
  const pointIndex = route.points.findIndex((point) => point.id === pointId);
  if (pointIndex <= 0) return 0;
  const distances = route.points.slice(1).map((point, index) => {
    const previous = route.points[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const total = distances.reduce((sum, distance) => sum + distance, 0);
  if (total === 0) return pointIndex >= route.points.length - 1 ? 1 : 0;
  return distances.slice(0, pointIndex).reduce((sum, distance) => sum + distance, 0) / total;
}

function transitionTriggerProgress(
  route: { points: readonly { id: string; x: number; y: number }[] },
  transition: NovelistRouteTransition,
): number {
  const pointIndex = route.points.findIndex((point) => point.id === transition.pointId);
  if (transition.phase === "arrive" && pointIndex === route.points.length - 1 && pointIndex > 0) {
    return routeProgressAtFormalPoint(route, route.points[pointIndex - 1]!.id);
  }
  return routeProgressAtFormalPoint(route, transition.pointId);
}

function interactionEventTriggerProgress(
  route: { points: readonly { id: string; x: number; y: number }[]; transitions?: readonly NovelistRouteTransition[] },
  event: { pointId: string; progress: number },
): number {
  const pairedTransition = route.transitions?.find((transition) => (
    transition.pointId === event.pointId && transition.phase === "arrive"
  )) ?? route.transitions?.find((transition) => transition.pointId === event.pointId);
  return pairedTransition ? transitionTriggerProgress(route, pairedTransition) : event.progress;
}

function formalActionMode(action: { preview?: NovelistSceneActionPreview; actorAsset?: NovelistFormalActorAsset } | null): "scene" | "actor" {
  return action?.preview && !action.preview.transparentOverlay ? "scene" : "actor";
}

const states: Array<{ code: NovelistState; label: string; note: string }> = [
  { code: "writing", label: "写作", note: "桌上的句子还热着，适合把一个候选稿送进工作台。" },
  { code: "eating", label: "吃饭", note: "先让胃把这一段接住，灵感不会因为一顿饭消失。" },
  { code: "sleeping", label: "睡觉", note: "灯已调暗，房间只保留一条安静的回程。" },
  { code: "daydreaming", label: "发呆", note: "他正在看窗外或听一面旧唱片，暂时不回答复杂的问题。" },
  { code: "away", label: "外出", note: "门口留着便签，回来后会从最近一条线索继续。" },
];

const stableLifeSignalCopy: Readonly<Record<NovelistState, { icon: string; label: string; fallbackMood: string }>> = {
  writing: { icon: "✎", label: "写作中", fallbackMood: "笔尖还热着，先让这一句自己长出来。" },
  eating: { icon: "◒", label: "吃饭中", fallbackMood: "先把这一顿吃完，生活不是写作的暂停键。" },
  sleeping: { icon: "☾", label: "睡觉中", fallbackMood: "灯已经调暗，今天先收在这里。" },
  daydreaming: { icon: "⌁", label: "发呆中", fallbackMood: "他暂时不追赶下一句，给脑子留一块空地。" },
  away: { icon: "↗", label: "外出中", fallbackMood: "他去别的房间走走，回来会带一条新线索。" },
};

function getStableLifeSignal(state: NovelistState, action: { mood?: string | undefined } | null) {
  const copy = stableLifeSignalCopy[state];
  return {
    ...copy,
    mood: action?.mood?.trim() || copy.fallbackMood,
  };
}

const stateHotspotCopy: Record<NovelistState, string> = {
  writing: "他把椅子拉回书桌前。",
  eating: "他在餐厨的饭桌旁停了一会儿。",
  sleeping: "灯光落低，卧室进入安静时段。",
  daydreaming: "他没有消失，只是把注意力放远。",
  away: "门边少了一双鞋，桌上留下了外出便签。",
};

const defaultStateForScene: Record<FormalSceneId, NovelistState> = {
  study: "writing",
  bedroom: "sleeping",
  "dining-kitchen": "eating",
  entrance: "away",
  "terrace-greenery": "daydreaming",
  attic: "daydreaming",
  "bathroom-private": "away",
};

const sceneMapPositions: Record<FormalSceneId, { x: number; y: number }> = {
  attic: { x: 50, y: 12 },
  study: { x: 50, y: 52 },
  bedroom: { x: 20, y: 51 },
  "dining-kitchen": { x: 19, y: 79 },
  entrance: { x: 78, y: 82 },
  "terrace-greenery": { x: 79, y: 30 },
  "bathroom-private": { x: 67, y: 73 },
};

const sceneMapEdges: Array<[FormalSceneId, FormalSceneId]> = [
  ["study", "bedroom"],
  ["study", "dining-kitchen"],
  ["study", "terrace-greenery"],
  ["study", "attic"],
  ["dining-kitchen", "entrance"],
];

function firstRouteId(sceneId: FormalSceneId, activity: NovelistActivity) {
  const scene = formalEcologySceneManifest.scenes[sceneId];
  return scene.defaultRouteByActivity[activity] ?? Object.keys(scene.routes)[0] ?? "";
}

function resolveStableLifeStage(stage: LifeStageSnapshot) {
  const requestedRoute = getFormalSceneRoute(stage.sceneId, stage.routeId);
  const fallbackRouteId = firstRouteId(stage.sceneId, stage.activity);
  const route = requestedRoute ?? (fallbackRouteId ? getFormalSceneRoute(stage.sceneId, fallbackRouteId) : null);
  if (!route) return null;
  const requestedActionId = stage.actionId ?? route.arriveActionId;
  const action = getFormalSceneAction(stage.sceneId, stage.activity, requestedActionId)
    ?? getFormalSceneAction(stage.sceneId, stage.activity, route.arriveActionId);
  const actionId = action?.id ?? route.arriveActionId;
  const canonicalStage: LifeStageSnapshot = {
    sceneId: stage.sceneId,
    routeId: route.id,
    activity: stage.activity,
    ...(actionId ? { actionId } : {}),
  };
  return {
    stage: canonicalStage,
    actionPreview: action?.preview && !action.preview.transparentOverlay ? action.preview : null,
    terminalPoint: route.points.at(-1) ?? null,
  };
}

type FormalRouteOption = {
  sceneId: FormalSceneId;
  targetSceneId: FormalSceneId;
  routeId: string;
  targetRouteId: string;
  label: string;
  activity: NovelistActivity;
  pointCount: number;
  purpose: FormalRoutePurpose;
  targetStrategy?: SceneConnectorTargetStrategy;
  preferredConnector?: PreferredSceneConnector;
};

type FormalRouteOptionGroup = {
  sceneId: FormalSceneId;
  label: string;
  options: FormalRouteOption[];
};

const formalRouteOptionGraph = buildFormalRouteGraph();
/**
 * The daily-life planner intentionally excludes the entrance: it is a
 * boundary scene, not an autonomously scheduled life activity. The route
 * catalog has a different contract and must expose every scene that actually
 * has a published route edge, including the entrance's gear/mail routes.
 */
const formalPublishedRouteSceneIds = [
  ...formalLifeSceneIds,
  ...formalRouteOptionGraph.edges.map((edge) => edge.sceneId),
].filter((sceneId, index, sceneIds) => sceneIds.indexOf(sceneId) === index)
  .filter((sceneId) => formalRouteOptionGraph.sceneEdges(sceneId).length > 0);
const formalRoutePurposeLabels: Readonly<Record<FormalRoutePurpose, string>> = {
  "scene-transition": "场景互通",
  "scene-entry": "进入动作点",
  "scene-exit": "离开动作点",
  "scene-interaction": "场景内互动",
  "waypoint-walk": "途中移动",
};
const lifePropLabels: Readonly<Record<LifePropId, string>> = {
  "bowl-full": "一碗热红豆汤",
  "bowl-empty": "空碗",
};

function getFormalRouteOptions(sceneId: FormalSceneId): FormalRouteOption[] {
  const scene = formalEcologySceneManifest.scenes[sceneId];
  const seen = new Set<string>();
  const options: FormalRouteOption[] = [];

  for (const route of Object.values(scene.routes)) {
    if (!route.publishedFromSnapshot) continue;
    const signature = JSON.stringify({
      waypointIds: route.waypointIds,
      arriveActionId: route.arriveActionId,
      transitions: route.transitions ?? [],
    });
    if (seen.has(signature)) continue;
    seen.add(signature);
    const edge = formalRouteOptionGraph.routeEdge(sceneId, route.id);
    const purpose = edge?.purpose ?? "waypoint-walk";
    const targetSceneId = edge?.toSceneId ?? sceneId;
    const isSceneConnector = Boolean(edge?.isSceneConnector);
    const routeActivity = scene.actions[route.arriveActionId]?.activity ?? "away";
    const connectorTarget = isSceneConnector && edge
      ? resolveSceneConnectorTarget(edge)
      : null;
    // A connector without an explicit destination handoff is not safe to
    // expose: falling back to a scene's generic `away` route recreates the
    // old “arrive, then wander somewhere else” bug.
    if (isSceneConnector && !connectorTarget) continue;
    options.push({
      sceneId,
      targetSceneId,
      routeId: route.id,
      targetRouteId: connectorTarget?.targetRouteId ?? route.id,
      label: route.label,
      activity: connectorTarget?.targetState ?? routeActivity,
      pointCount: route.waypointIds.length,
      purpose,
      ...(connectorTarget ? { targetStrategy: connectorTarget.strategy } : {}),
      ...(isSceneConnector ? { preferredConnector: { sceneId, routeId: route.id } } : {}),
    });
  }

  return options;
}

function PhaseIconSvg({ phase }: { phase: LifeRuntimeState["host"]["dayPhase"] }) {
  if (phase === "dawn") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M2.2 12.4H13.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M4.25 11.15C4.7 8.75 6.05 7.55 8 7.55C9.95 7.55 11.3 8.75 11.75 11.15" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M8 3.2V5.45M4.55 5.2L5.7 6.3M11.45 5.2L10.3 6.3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    );
  }
  if (phase === "morning") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="6.15" cy="7.05" r="2.7" stroke="currentColor" strokeWidth="1.25" />
        <path d="M6.15 2.1V3.25M2.1 7.05H3.25M3.15 4.05L4 4.9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M9.45 5.25L13.5 3.55M9.75 7.75L14 7.2M8.65 10L12.2 12.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    );
  }
  if (phase === "noon") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="8" cy="8" r="2.6" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="1.25" />
        <path d="M8 1.65V3.2M8 12.8V14.35M1.65 8H3.2M12.8 8H14.35" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M3.55 3.55L4.65 4.65M11.35 11.35L12.45 12.45M3.55 12.45L4.65 11.35M11.35 4.65L12.45 3.55" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      </svg>
    );
  }
  if (phase === "afternoon") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="10.9" cy="4.8" r="2.25" stroke="currentColor" strokeWidth="1.25" />
        <path d="M3 12.85H13.55M4.35 11.25L8.15 7.45M7 12.75L10.25 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M10.9 1.45V2M14.2 4.8H13.65M8.55 7.15L8.95 6.75" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      </svg>
    );
  }
  if (phase === "evening") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M2 10.9H14M3.6 13.2H12.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M4.7 10.85C5.1 8.7 6.25 7.65 8 7.65C9.75 7.65 10.9 8.7 11.3 10.85" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M4.45 5.2L5.65 6.25M11.55 5.2L10.35 6.25M8 3.25V5.1" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M11.8 10.3A5.15 5.15 0 1 1 6.3 3.15C5.75 7.05 8.05 9.9 11.8 10.3Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <circle cx="12.45" cy="3.55" r=".8" fill="currentColor" />
      <circle cx="13.6" cy="6.25" r=".45" fill="currentColor" fillOpacity=".72" />
    </svg>
  );
}

export function NovelistRoom() {
  const [state, setState] = useState<NovelistState>("writing");
  const [sceneId, setSceneId] = useState<FormalSceneId>("study");
  const [lifeCue, setLifeCue] = useState<LifeCue | null>(null);
  const [lifeMoments, setLifeMoments] = useState<LifeMoment[]>(() => {
    const cue = getSceneLifeCue("study", "thought", { actionId: "writing-seat" });
    return [{ ...cue, momentId: "initial-life-cue", sequence: 0 }];
  });
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });
  const [showParticles, setShowParticles] = useState(false);
  const [actionPreview, setActionPreview] = useState<NovelistSceneActionPreview | null>(
    formalEcologySceneManifest.scenes.study.actions["writing-seat"]?.preview ?? null,
  );
  const [routeCommand, setRouteCommand] = useState({ routeId: "study-desk-stay", token: 0 });
  const [routePaused, setRoutePaused] = useState(false);
  const [sceneInteractionOverrides, setSceneInteractionOverrides] = useState<Record<string, string>>({});
  const [sceneInteractionStateHydrated, setSceneInteractionStateHydrated] = useState(false);
  const currentActorPointRef = useRef("writing-seat");
  const [actorPosition, setActorPosition] = useState({ x: 0.48, y: 0.79 });
  const [actorPerspectiveScale, setActorPerspectiveScale] = useState(1);
  const [routeTransition, setRouteTransition] = useState<ActiveFormalRouteTransition | null>(null);
  const [routeActorHidden, setRouteActorHidden] = useState(false);
  const [sceneJourney, setSceneJourney] = useState<ActiveSceneJourney | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapHoverSceneId, setMapHoverSceneId] = useState<FormalSceneId | null>(null);
  const [lifePlanOpen, setLifePlanOpen] = useState(false);
  const [lifeDetailsOpen, setLifeDetailsOpen] = useState(false);
  const [activeChatChannel, setActiveChatChannel] = useState<NovelistChatChannel | null>(null);
  const [roomUiV6Enabled, setRoomUiV6Enabled] = useState(true);
  const [roomUiEditorEnabled, setRoomUiEditorEnabled] = useState(false);
  const [deskEntryOpen, setDeskEntryOpen] = useState(false);
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [systemHandActive, setSystemHandActive] = useState(false);
  const [postcardOpen, setPostcardOpen] = useState(false);
  const [postcardFlippedId, setPostcardFlippedId] = useState<string | null>(null);
  const [unreadPostcardCount, setUnreadPostcardCount] = useState(0);
  const [lifeAutoplay, setLifeAutoplay] = useState(true);
  const [paperTearPulse, setPaperTearPulse] = useState(0);
  // Browser storage is hydrated after mount. Reading it in a state
  // initializer makes the server tree differ from a returning browser tab.
  const [postcards, setPostcards] = useState<LifePostcard[]>([]);
  const [tapPulse, setTapPulse] = useState(0);
  const [activeActivityStartedAt, setActiveActivityStartedAt] = useState<number | null>(null);
  // Keep the duration actually used by the current activity. This differs
  // from the definition for autoplay writing, which turns until-user into a
  // finite demo duration without changing the authored activity contract.
  const [activeActivityDurationMs, setActiveActivityDurationMs] = useState<number | null>(null);
  const [activityRemainingMs, setActivityRemainingMs] = useState<number | null>(null);
  // The timeline is a view of the user's actual local day. Keep its first
  // render deterministic for SSR, then sync it after mount without touching
  // the life-runtime clock or any route state.
  const [clockNow, setClockNow] = useState<Date | null>(null);
  // Keep the first render deterministic. Traces and the saved runtime are
  // browser-owned state and are restored in the mount effect below.
  const [lifeRuntime, dispatchLifeRuntime] = useReducer(
    lifeRuntimeReducer,
    undefined,
    () => createInitialLifeRuntimeState("study"),
  );
  const [activeVisualBeats, setActiveVisualBeats] = useState<VisualBeat[]>([]);
  const [activeLifeBeatId, setActiveLifeBeatId] = useState(novelistDailyRhythm[0]!.id);
  // Keep the first render stable for SSR, then let the local calendar choose
  // which deterministic day recipe is on stage. The saved runtime day still
  // wins if a later session advances it explicitly.
  const [calendarLifeDay, setCalendarLifeDay] = useState(1);
  // A preview day is intentionally view-only. It never mutates the saved
  // runtime day or the host's clock, so trying another rhythm cannot corrupt
  // the actual life state.
  const [previewLifeDay, setPreviewLifeDay] = useState<number | null>(null);
  const [committedNextDayPlan, setCommittedNextDayPlan] = useState<NextDayPlanDraft | null>(null);
  const particleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifeCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualBeatTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const continuationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paperTearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuationTokenRef = useRef(0);
  const routeTransitionKeyRef = useRef(0);
  const sceneJourneyKeyRef = useRef(0);
  const activeRouteTransitionRef = useRef<ActiveFormalRouteTransition | null>(null);
  const sceneJourneyRef = useRef<ActiveSceneJourney | null>(null);
  const advanceSceneJourneyRef = useRef<(sceneId: FormalSceneId, routeId: string) => boolean>(() => false);
  const arrivalTransitionRouteKeyRef = useRef<string | null>(null);
  const skipArrivalActivityRouteRef = useRef<{ sceneId: FormalSceneId; routeId: string } | null>(null);
  const carriedPropsRef = useRef<LifePropId[]>([]);
  const lifeCueSequenceRef = useRef(0);
  const lastLifeCueKeyRef = useRef<string | null>(null);
  const lastLifeCueVisibleUntilRef = useRef(0);
  const initialLifeCueEmittedRef = useRef(false);
  const ambientCueIndexRef = useRef<Record<string, number>>({});
  const motionCueRouteKeyRef = useRef<string | null>(null);
  const interactionEventRouteKeyRef = useRef<string | null>(null);
  const appliedInteractionEventKeysRef = useRef<Set<string>>(new Set());
  const lifeEventSequenceRef = useRef(0);
  const cueCooldownUntilRef = useRef<Record<string, number>>({});
  const lifeRuntimeHydratedRef = useRef(false);
  const [lifeRuntimeHydrated, setLifeRuntimeHydrated] = useState(false);
  const activeLifeIntentIdRef = useRef<string | null>(null);
  const activeLifeActivityRef = useRef<LifeActivityDefinition | null>(null);
  const suspendedLifeIntentIdRef = useRef<string | null>(null);
  // The room starts with autoplay enabled. Keep the ref in sync from the
  // first activity as well; the initial writing seat can settle on mount
  // before the first post-render synchronization effect runs.
  const lifeAutoplayRef = useRef(true);
  const autoplayBeatIndexRef = useRef(0);
  const autoplayTendencyCooldownUntilRef = useRef<Partial<Record<LifeNeedKey, number>>>({});
  const executeLifeBeatRef = useRef<(beat: LifeBeat) => void>(() => undefined);
  const executeLifeTendencyRef = useRef<(tendency: LifeTendency) => void>(() => undefined);
  const autoplayContextRef = useRef({
    routePaused: false,
    routeTransition: false,
    journey: false,
    lifeCue: false,
    dayPhase: "morning" as LifeRuntimeState["host"]["dayPhase"],
    dayIndex: 1,
    planMode: "steady-draft" as LifePlanMode,
    activeBeatId: "",
    tendency: null as LifeTendency | null,
  });

  const scene = formalEcologySceneManifest.scenes[sceneId];
  const currentRoute = getFormalSceneRoute(sceneId, routeCommand.routeId);
  const currentAction = getFormalSceneAction(sceneId, state, currentRoute?.arriveActionId);
  const activeRuntimeActivity = getLifeActivity(lifeRuntime.activityId);
  const stageAction = activeRuntimeActivity
    ? getFormalSceneAction(sceneId, state, activeRuntimeActivity.actionId) ?? currentAction
    : currentAction;
  const stageLifeSignal = getStableLifeSignal(state, stageAction);
  const observationActivityLabel = sceneId === "study" && state === "writing"
    ? "书房写作"
    : stageLifeSignal.label;
  const activityProgressPercent = activeActivityDurationMs !== null && activityRemainingMs !== null
    ? clampStagePercent(
      ((activeActivityDurationMs - activityRemainingMs) / activeActivityDurationMs) * 100,
      0,
      100,
    )
    : null;
  const activityElapsedMs = activeActivityDurationMs !== null && activityRemainingMs !== null
    ? Math.max(0, activeActivityDurationMs - activityRemainingMs)
    : null;
  const activityProgressLabel = activeRuntimeActivity
    ? activityRemainingMs !== null
      ? activityRemainingMs <= 1000
        ? "这一段快结束了"
        : `还会停留 ${Math.max(1, Math.ceil(activityRemainingMs / 1000))} 秒`
      : "随时可以打断"
    : null;
  const currentLifeDay = Math.max(calendarLifeDay, lifeRuntime.dayIndex);
  const displayedLifeDay = previewLifeDay ?? currentLifeDay;
  const nextDayPlanDraft = useMemo(() => buildNextDayPlanDraft({
    sourceDay: currentLifeDay,
    lifeStateVersion: lifeRuntime.revision,
    observation: {
      sceneLabel: scene.label,
      activityLabel: observationActivityLabel,
      focus: lifeRuntime.host.focus,
      fatigue: lifeRuntime.host.fatigue,
      inspiration: lifeRuntime.host.inspiration,
      emotionalLoad: lifeRuntime.host.emotionalLoad,
    },
  }), [
    currentLifeDay,
    lifeRuntime.host.emotionalLoad,
    lifeRuntime.host.fatigue,
    lifeRuntime.host.focus,
    lifeRuntime.host.inspiration,
    lifeRuntime.revision,
    observationActivityLabel,
    scene.label,
  ]);
  const dailyLifePlanResolution = useMemo(
    () => resolveLifeDayPlan(
      displayedLifeDay,
      previewLifeDay === null ? committedNextDayPlan : null,
    ),
    [committedNextDayPlan, displayedLifeDay, previewLifeDay],
  );
  const dailyLifePlan = dailyLifePlanResolution.plan;
  const sceneInteractionStateById = useMemo(() => Object.fromEntries(
    (scene.interactions ?? []).map((interaction) => [
      interaction.id,
      sceneInteractionOverrides[`${sceneId}:${interaction.id}`] ?? interaction.initialStateId,
    ]),
  ), [scene.interactions, sceneId, sceneInteractionOverrides]);
  useEffect(() => {
    carriedPropsRef.current = [...lifeRuntime.carriedProps];
  }, [lifeRuntime.carriedProps]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRoomUiV6Enabled(params.get("roomUi") !== "legacy");
    setRoomUiEditorEnabled(params.get("roomUiEditor") === "1");
  }, []);
  const current = states.find((item) => item.code === state) ?? states[0]!;
  const routeOptionGroups = useMemo<FormalRouteOptionGroup[]>(() => {
    const orderedSceneIds = [sceneId, ...formalPublishedRouteSceneIds.filter((id) => id !== sceneId)];
    return orderedSceneIds
      .map((id) => ({
        sceneId: id,
        label: formalEcologySceneManifest.scenes[id].label,
        options: getFormalRouteOptions(id),
      }))
      .filter((group) => group.options.length > 0);
  }, [sceneId]);
  const routeOptionCount = routeOptionGroups.reduce((total, group) => total + group.options.length, 0);
  const activeLifeBeat = dailyLifePlan.beats.find((beat) => beat.id === activeLifeBeatId)
    ?? dailyLifePlan.beats[0]
    ?? novelistDailyRhythm[0]!;
  const clockMinutes = clockNow
    ? clockNow.getHours() * 60 + clockNow.getMinutes() + clockNow.getSeconds() / 60
    : 0;
  const clockProgress = clampStagePercent((clockMinutes / (24 * 60)) * 100, 0, 100);
  const clockPhase = clockNow ? dayPhaseFromClock(clockNow.getHours()) : lifeRuntime.host.dayPhase;
  const clockLabel = clockNow
    ? `${String(clockNow.getHours()).padStart(2, "0")}:${String(clockNow.getMinutes()).padStart(2, "0")}`
    : "同步中";
  const lifeSignalContext = useMemo(() => ({
    hunger: lifeRuntime.host.hunger,
    fatigue: lifeRuntime.host.fatigue,
    focus: lifeRuntime.host.focus,
    inspiration: lifeRuntime.host.inspiration,
    emotionalLoad: lifeRuntime.host.emotionalLoad,
    traceIds: lifeRuntime.traceIds,
    actionId: currentAction?.id,
  }), [
    currentAction?.id,
    lifeRuntime.host.emotionalLoad,
    lifeRuntime.host.fatigue,
    lifeRuntime.host.focus,
    lifeRuntime.host.hunger,
    lifeRuntime.host.inspiration,
    lifeRuntime.traceIds,
  ]);
  const lifeSystem = useMemo(() => projectLifeSystem({
    sceneId,
    routeId: routeCommand.routeId,
    host: lifeRuntime.host,
    traceIds: lifeRuntime.traceIds,
    runtimePhase: lifeRuntime.phase,
    carriedProps: lifeRuntime.carriedProps,
    ...(currentAction?.id ? { actionId: currentAction.id } : {}),
    ...(lifeRuntime.activityId ? { activityId: lifeRuntime.activityId } : {}),
  }), [
    currentAction?.id,
    lifeRuntime.activityId,
    lifeRuntime.carriedProps,
    lifeRuntime.host,
    lifeRuntime.phase,
    lifeRuntime.traceIds,
    routeCommand.routeId,
    sceneId,
  ]);
  const stateDrivenLifeTendency = useMemo(
    () => lifeSystem.urgentTendency,
    [lifeSystem.urgentTendency],
  );
  const visibleLifeTendency = useMemo(
    () => lifeSystem.visibleTendency,
    [lifeSystem.visibleTendency],
  );
  const actorCanShow = scene.privacyBoundary === "public"
    && Boolean(scene.masterAsset)
    && !actionPreview
    && !routeActorHidden
    && !(routeTransition?.fromMode === "none" && routeTransition?.toMode === "scene");
  const stageVisualBeats = activeVisualBeats.filter((beat, index, beats) => (
    beats.findIndex((candidate) => candidate.effectId === beat.effectId) === index
  ));
  const routeTransitionActor: NovelistMotionActorTransition | null = routeTransition
    ? {
      key: routeTransition.key,
      phase: routeTransition.phase,
      durationMs: routeTransition.effectiveDurationMs,
      turns: routeTransition.turns ?? FORMAL_SMOKE_TURNS,
      ...(routeTransition.settleMs !== undefined ? { settleMs: routeTransition.settleMs } : {}),
      ...(routeTransition.fromFacing ? { fromFacing: routeTransition.fromFacing } : {}),
      ...(routeTransition.toFacing ? { toFacing: routeTransition.toFacing } : {}),
      fromMode: routeTransition.fromMode,
      toMode: routeTransition.toMode,
      fromAsset: routeTransition.fromActorAsset,
      toAsset: routeTransition.toActorAsset,
    }
    : null;

  useEffect(() => {
    const updateClock = () => setClockNow(new Date());
    updateClock();
    const timer = setInterval(updateClock, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSceneInteractionOverrides(loadSceneInteractionStates());
    setSceneInteractionStateHydrated(true);
  }, []);

  useEffect(() => {
    if (!sceneInteractionStateHydrated) return;
    saveSceneInteractionStates(sceneInteractionOverrides);
  }, [sceneInteractionOverrides, sceneInteractionStateHydrated]);

  useEffect(() => {
    autoplayContextRef.current = {
      routePaused,
      routeTransition: Boolean(routeTransition),
      journey: Boolean(sceneJourney),
      lifeCue: Boolean(lifeCue),
      dayPhase: lifeRuntime.host.dayPhase,
      dayIndex: displayedLifeDay,
      planMode: dailyLifePlan.mode,
      activeBeatId: activeLifeBeatId,
      tendency: stateDrivenLifeTendency,
    };
    lifeAutoplayRef.current = lifeAutoplay;
  }, [activeLifeBeatId, dailyLifePlan.mode, displayedLifeDay, lifeAutoplay, lifeCue, lifeRuntime.host.dayPhase, routePaused, routeTransition, sceneJourney, stateDrivenLifeTendency]);

  useEffect(() => {
    setCalendarLifeDay(getCalendarLifeDay());
    setCommittedNextDayPlan(loadNextDayPlanDraft());
  }, []);

  useEffect(() => {
    if (!lifeRuntimeHydrated || lifeRuntime.host.dayPhase !== "night") return;
    if (committedNextDayPlan?.status === "committed"
      && committedNextDayPlan.sourceDay === currentLifeDay) return;
    const committed = commitNextDayPlanDraft(nextDayPlanDraft);
    if (committed) setCommittedNextDayPlan(committed);
  }, [
    committedNextDayPlan,
    currentLifeDay,
    lifeRuntime.host.dayPhase,
    lifeRuntimeHydrated,
    nextDayPlanDraft,
  ]);

  useEffect(() => {
    if (!dailyLifePlan.beats.some((beat) => beat.id === activeLifeBeatId)) {
      const firstBeat = dailyLifePlan.beats[0];
      if (firstBeat) setActiveLifeBeatId(firstBeat.id);
    }
  }, [activeLifeBeatId, dailyLifePlan]);

  const emitLifeEvent = useCallback((event: LifeRuntimeEventInput) => {
    const sequence = lifeEventSequenceRef.current + 1;
    lifeEventSequenceRef.current = sequence;
    dispatchLifeRuntime({
      ...event,
      eventId: `${event.type}:${sequence}`,
    } as LifeRuntimeEvent);
  }, []);

  const emitLifeCue = useCallback((cue: LifeCue | null) => {
    if (!cue) return;
    const now = Date.now();
    for (const [key, until] of Object.entries(cueCooldownUntilRef.current)) {
      if (until <= now) delete cueCooldownUntilRef.current[key];
    }
    if ((cueCooldownUntilRef.current[cue.id] ?? 0) > now) return;
    const cueKey = `${cue.kind}:${cue.id}:${cue.text}`;
    if (lastLifeCueKeyRef.current === cueKey && lastLifeCueVisibleUntilRef.current > now) return;
    lastLifeCueKeyRef.current = cueKey;
    const visibleForMs = cue.visibleForMs ?? cue.durationMs ?? 2400;
    cueCooldownUntilRef.current[cue.id] = now + (cue.cooldownMs ?? 0);
    lastLifeCueVisibleUntilRef.current = now + visibleForMs;
    const sequence = lifeCueSequenceRef.current + 1;
    lifeCueSequenceRef.current = sequence;
    const moment: LifeMoment = {
      ...cue,
      momentId: `${cue.id}:${sequence}`,
      sequence,
    };
    setLifeCue(cue);
    setLifeMoments((previous) => [moment, ...previous].slice(0, 5));
    emitLifeEvent({ type: "cue-shown", cueId: cue.id });
    if (lifeCueTimerRef.current) clearTimeout(lifeCueTimerRef.current);
    lifeCueTimerRef.current = setTimeout(() => {
      setLifeCue((currentCue) => currentCue?.id === cue.id ? null : currentCue);
      lifeCueTimerRef.current = null;
      if (lastLifeCueKeyRef.current === cueKey) lastLifeCueKeyRef.current = null;
    }, visibleForMs);
  }, [emitLifeEvent]);

  useEffect(() => {
    if (initialLifeCueEmittedRef.current) return;
    initialLifeCueEmittedRef.current = true;
    emitLifeCue(getSceneLifeCue("study", "thought", { actionId: "writing-seat" }));
  }, [emitLifeCue]);

  useEffect(() => {
    const traces = expireLifeTraces();
    const snapshot = loadLifeRuntimeSnapshot();
    if (snapshot) {
      const restoredStage = snapshot.stage ? resolveStableLifeStage(snapshot.stage) : null;
      if (restoredStage) {
        setSceneId(restoredStage.stage.sceneId);
        setState(restoredStage.stage.activity);
        setRouteCommand((previous) => ({ routeId: restoredStage.stage.routeId, token: previous.token + 1 }));
        setActionPreview(restoredStage.actionPreview);
        if (restoredStage.terminalPoint) {
          currentActorPointRef.current = restoredStage.terminalPoint.id;
          setActorPosition({ x: restoredStage.terminalPoint.x, y: restoredStage.terminalPoint.y });
          setActorPerspectiveScale(restoredStage.terminalPoint.stableScale);
        }
        const restoredPlan = resolveLifeDayPlan(
          snapshot.dayIndex,
          loadNextDayPlanDraft(),
        ).plan;
        const restoredBeat = restoredPlan.beats.find((beat) => (
          beat.sceneId === restoredStage.stage.sceneId
          && beat.routeId === restoredStage.stage.routeId
          && beat.activity === restoredStage.stage.activity
        ));
        if (restoredBeat) setActiveLifeBeatId(restoredBeat.id);
        emitLifeCue(getSceneLifeCue(restoredStage.stage.sceneId, "thought", {
          actionId: restoredStage.stage.actionId,
        }));
      }
      emitLifeEvent({
        type: "runtime-restored",
        snapshot: {
          ...snapshot,
          traceIds: [...new Set([...snapshot.traceIds, ...traces.map((trace) => trace.id)])],
        },
      });
    } else {
      for (const trace of traces) {
        emitLifeEvent({ type: "trace-created", traceId: trace.id });
      }
    }
    setPostcards(listLifePostcards());
    lifeRuntimeHydratedRef.current = true;
    setLifeRuntimeHydrated(true);
  }, [emitLifeEvent]);

  useEffect(() => {
    if (!lifeRuntimeHydratedRef.current || !lifeRuntimeHydrated) return;
    if (routeTransition || sceneJourney || ["intent-queued", "route-moving", "arrival-settling", "activity-ready"].includes(lifeRuntime.phase)) return;
    if (!currentRoute) return;
    saveLifeRuntimeSnapshot(lifeRuntime, Date.now(), {
      sceneId,
      routeId: currentRoute.id,
      activity: state,
      ...(currentAction?.id ? { actionId: currentAction.id } : {}),
    });
  }, [currentAction?.id, currentRoute, lifeRuntime, lifeRuntimeHydrated, routeTransition, sceneId, sceneJourney, state]);

  const displayedLifeCue = lifeCue ?? getStateLifeCue(sceneId, lifeSignalContext);
  const displayedNeed: LifeNeedKey | null = displayedLifeCue.id.startsWith("need:")
    ? (displayedLifeCue.id.slice("need:".length) as LifeNeedKey)
    : null;

  const showNeed = useCallback((need: LifeNeedKey) => {
    emitLifeCue(getNeedLifeCue(need, sceneId));
  }, [emitLifeCue, sceneId]);

  useEffect(() => {
    if (lifeCue || lifeRuntime.phase !== "idle" || activeLifeActivityRef.current) return;
    if (visibleLifeTendency) showNeed(visibleLifeTendency.key);
  }, [lifeCue, lifeRuntime.phase, showNeed, visibleLifeTendency]);

  const handleActorTap = useCallback(() => {
    setTapPulse((value) => value + 1);
    if (sceneId === "study" && currentAction?.id === "writing-seat") {
      setMapOpen(false);
      setLifePlanOpen(false);
      setActiveChatChannel(null);
      setDeskEntryOpen(true);
      return;
    }
    const interactionCue = getSceneInteractionCue(sceneId, currentAction?.id);
    emitLifeCue({
      ...interactionCue,
      id: `tap:${sceneId}:${Date.now()}`,
      visibleForMs: 1500,
      cooldownMs: 800,
    });
  }, [currentAction?.id, emitLifeCue, sceneId]);

  const handleActorLongPress = useCallback(() => {
    setSystemHandActive(true);
    setInterventionOpen(true);
    emitLifeCue({
      ...getSceneLifeCue(sceneId, "system", { actionId: currentAction?.id }),
      id: `system-hand:${sceneId}:${Date.now()}`,
      kind: "system",
      tone: "focused",
      icon: "🖐️",
      title: "系统大手已就位",
      text: "可以只观察，也可以把他带回书桌，或者让他先去休息。",
      anchor: "screen",
      priority: 80,
      visibleForMs: 2200,
      cooldownMs: 900,
    });
    window.setTimeout(() => setSystemHandActive(false), 900);
  }, [currentAction?.id, emitLifeCue, sceneId]);

  const triggerManuscriptParticles = () => {
    if (particleTimerRef.current) clearTimeout(particleTimerRef.current);
    setShowParticles(true);
    particleTimerRef.current = setTimeout(() => setShowParticles(false), 1700);
  };

  const triggerPaperTear = () => {
    if (paperTearTimerRef.current) clearTimeout(paperTearTimerRef.current);
    setPaperTearPulse((value) => value + 1);
    paperTearTimerRef.current = setTimeout(() => {
      setPaperTearPulse(0);
      paperTearTimerRef.current = null;
    }, 1500);
    const trace = materializeLifeTrace(
      { id: "draft-shred", kind: "material", expires: "end-of-day", payload: { source: "system-hand" } },
      sceneId,
      "system-draft-shred",
    );
    putLifeTrace(trace);
    emitLifeEvent({ type: "trace-created", traceId: trace.id });
    emitLifeEvent({ type: "needs-drifted", delta: { inspiration: 5, emotionalLoad: -6, focus: -2 } });
    emitLifeCue({
      ...getSceneLifeCue(sceneId, "feedback", { actionId: "draft-shred" }),
      id: `draft-shred:${Date.now()}`,
      kind: "feedback",
      icon: "🦋",
      title: "废稿变成了素材",
      text: "撕掉的不是今天，纸屑里还留着一条可以重写的线索。",
      anchor: "screen",
      visibleForMs: 2300,
      cooldownMs: 900,
    });
  };

  useEffect(() => () => {
    if (particleTimerRef.current) clearTimeout(particleTimerRef.current);
    if (routeTransitionTimerRef.current) clearTimeout(routeTransitionTimerRef.current);
    if (lifeCueTimerRef.current) clearTimeout(lifeCueTimerRef.current);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    if (continuationTimerRef.current) clearTimeout(continuationTimerRef.current);
    if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
    if (paperTearTimerRef.current) clearTimeout(paperTearTimerRef.current);
    for (const timer of visualBeatTimersRef.current.values()) clearTimeout(timer);
    visualBeatTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!activeActivityStartedAt || activeActivityDurationMs === null) {
      return;
    }
    const durationMs = activeActivityDurationMs;
    const updateRemaining = () => {
      const remaining = Math.max(0, durationMs - (Date.now() - activeActivityStartedAt));
      setActivityRemainingMs(remaining);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 250);
    return () => clearInterval(timer);
  }, [activeActivityDurationMs, activeActivityStartedAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      emitLifeEvent({
        type: "needs-drifted",
        delta: { hunger: 2, fatigue: 1, focus: -0.5, caffeineDebt: -0.5 },
        dayPhase: dayPhaseFromClock(new Date().getHours()),
      });
    }, 18000);
    return () => clearInterval(timer);
  }, [emitLifeEvent]);

  const clearRouteTransitionTimer = () => {
    if (routeTransitionTimerRef.current) {
      clearTimeout(routeTransitionTimerRef.current);
      routeTransitionTimerRef.current = null;
    }
  };

  const playVisualBeats = (beats: readonly VisualBeat[]) => {
    for (const timer of visualBeatTimersRef.current.values()) clearTimeout(timer);
    visualBeatTimersRef.current.clear();
    if (!beats.length) {
      setActiveVisualBeats([]);
      return;
    }
    setActiveVisualBeats([...beats]);
    for (const visualBeat of beats) {
      if (visualBeat.repeat) continue;
      const timer = setTimeout(() => {
        setActiveVisualBeats((currentBeats) => currentBeats.filter((item) => item.id !== visualBeat.id));
        visualBeatTimersRef.current.delete(visualBeat.id);
      }, visualBeat.durationMs);
      visualBeatTimersRef.current.set(visualBeat.id, timer);
    }
  };

  const completeLifeActivity = (activity: LifeActivityDefinition) => {
    if (activeLifeActivityRef.current?.id !== activity.id) return;
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = null;
    const completedIntent = activeLifeIntentIdRef.current
      ? lifeRuntime.intents[activeLifeIntentIdRef.current]
      : undefined;
    const settlement = activity.settlement ?? getActivitySettlement(activity.id);
    const traces = settlement.traces.map((trace) => materializeLifeTrace(trace, activity.sceneId, activity.id));
    for (const trace of traces) putLifeTrace(trace);
    emitLifeEvent({
      type: "activity-completed",
      beatId: activity.id,
      settlement,
    });
    activeLifeIntentIdRef.current = null;
    activeLifeActivityRef.current = null;
    setActiveActivityStartedAt(null);
    setActiveActivityDurationMs(null);
    setActivityRemainingMs(null);
    playVisualBeats(activity.visualBeats.filter((visualBeat) => visualBeat.trigger === "activity-complete"));
    if (activity.id === "terrace-city-look") {
      const postcard = createFieldworkPostcard(activity.sceneId, activity.id);
      putLifePostcard(postcard);
      setPostcards((previous) => [postcard, ...previous.filter((item) => item.id !== postcard.id)].slice(0, 12));
      setUnreadPostcardCount((count) => Math.min(3, count + 1));
      emitLifeCue({
        ...getLifeFeedbackCue("night-note-feedback", activity.sceneId),
        id: `postcard:${postcard.id}`,
        icon: "✉️",
        title: "明信片晾干了",
        text: "他从门外带回一小块夜色，背面只写了一句还没舍得删掉的话。",
        anchor: "scene",
        visibleForMs: 3000,
      });
    }
    if (settlement.feedbackCueId) {
      emitLifeCue(getLifeFeedbackCue(settlement.feedbackCueId, activity.sceneId));
    } else if (activity.id === "bedroom-rest") {
      emitLifeCue(getLifeFeedbackCue("rest-feedback", activity.sceneId));
    } else if (activity.id === "terrace-city-look" || activity.id === "attic-archive") {
      emitLifeCue(getLifeFeedbackCue(activity.id === "attic-archive" ? "archive-feedback" : "night-note-feedback", activity.sceneId));
    }

    const nextActivity = activity.nextActivityId ? getLifeActivity(activity.nextActivityId) : null;
    if (nextActivity?.routeKey) {
      if (continuationTimerRef.current) clearTimeout(continuationTimerRef.current);
      const continuationToken = continuationTokenRef.current + 1;
      continuationTokenRef.current = continuationToken;
      continuationTimerRef.current = setTimeout(() => {
        continuationTimerRef.current = null;
        if (continuationTokenRef.current !== continuationToken) return;
        const nextRouteKey = getLifeContinuationRouteKey(activity, nextActivity);
        if (!nextRouteKey) return;
        const nextRoute = getFormalSceneRoute(nextActivity.sceneId, nextRouteKey);
        const nextAction = formalEcologySceneManifest.scenes[nextActivity.sceneId].actions[nextActivity.actionId];
        if (!nextRoute || !nextAction) return;
        const continuationCue = getLifeContinuationCue(nextActivity.id);
        const nextIntent: LifeIntent = {
          id: `intent:continuation:${nextActivity.id}:${Date.now()}`,
          reason: completedIntent?.reason ?? "schedule",
          sourceScene: activity.sceneId,
          targetScene: nextActivity.sceneId,
          targetAnchor: nextRoute.points.at(-1)?.id ?? nextRoute.waypointIds.at(-1) ?? "",
          routeKey: nextRouteKey,
          arrivalActivity: nextActivity.id,
          interruptible: true,
          returnPolicy: completedIntent?.returnPolicy ?? "stay-until-user",
          status: "queued",
        };
        const nextCue: LifeCue = {
          ...getSceneLifeCue(nextActivity.sceneId, "intent", { actionId: nextActivity.actionId }),
          id: `continuation-cue:${nextActivity.id}:${Date.now()}`,
          title: continuationCue.title,
          text: continuationCue.text,
          icon: continuationCue.icon,
          tone: continuationCue.tone,
          anchor: "actor",
          visibleForMs: 1700,
          cooldownMs: 0,
        };
        const routeOwnerActivity = findLifeActivityForRoute(nextActivity.sceneId, nextRouteKey) ?? nextActivity;
        const continuationRouteFields = lifeIntentRouteFields(routeOwnerActivity, nextRouteKey);
        command(
          nextActivity.sceneId,
          nextAction.activity,
          nextRouteKey,
          nextCue,
          {
            ...nextIntent,
            ...continuationRouteFields,
          },
          (activity.continuationMode === "arrive-only" || continuationRouteFields.arrivalPolicy === "arrive-only")
            ? { arrivalActivityMode: "skip" }
            : undefined,
        );
      }, 1100);
    }
  };

  const startLifeActivity = (sceneIdForActivity: FormalSceneId, actionId: string | undefined) => {
    const activity = resolveLifeActivity(sceneIdForActivity, actionId);
    if (!activity || activeLifeActivityRef.current?.id === activity.id) return;
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activeLifeActivityRef.current = activity;
    const startedAt = Date.now();
    setActiveActivityStartedAt(startedAt);
    const effectiveDurationMs = activity.durationMs === "until-user" && lifeAutoplayRef.current
      ? AUTOPLAY_WRITING_DURATION_MS
      : activity.durationMs;
    setActiveActivityDurationMs(effectiveDurationMs === "until-user" ? null : effectiveDurationMs);
    setActivityRemainingMs(effectiveDurationMs === "until-user" ? null : effectiveDurationMs);
    emitLifeEvent({
      type: "activity-entered",
      beatId: activity.id,
      activityId: activity.id,
      sceneId: activity.sceneId,
    });
    emitLifeCue(getSceneLifeCue(activity.sceneId, "activity", { actionId: activity.actionId }));
    const enterBeats = activity.visualBeats.filter((visualBeat) => visualBeat.trigger === "activity-enter" || visualBeat.trigger === "activity-loop");
    playVisualBeats(enterBeats);
    if (activity.id === "study-writing") triggerManuscriptParticles();
    if (effectiveDurationMs !== "until-user") {
      activityTimerRef.current = setTimeout(() => completeLifeActivity(activity), effectiveDurationMs);
    }
  };

  const beginRouteTransition = (
    transition: NovelistRouteTransition,
    transitionSceneId: FormalSceneId,
    route: ReturnType<typeof getFormalSceneRoute>,
  ) => {
    clearRouteTransitionTimer();
    const key = routeTransitionKeyRef.current + 1;
    routeTransitionKeyRef.current = key;
    const transitionScene = formalEcologySceneManifest.scenes[transitionSceneId];
    const sourceAction = transition.fromActionId
      ? transitionScene.actions[transition.fromActionId] ?? null
      : null;
    const targetAction = transition.toActionId
      ? transitionScene.actions[transition.toActionId] ?? null
      : null;
    const sourcePreview = sourceAction?.preview && !sourceAction.preview.transparentOverlay
      ? sourceAction.preview
      : null;
    const targetPreview = targetAction?.preview && !targetAction.preview.transparentOverlay
      ? targetAction.preview
      : null;
    const fromMode: ActiveFormalRouteTransition["fromMode"] = transition.fromMode
      ?? (transition.fromActionId
      ? formalActionMode(sourceAction)
      : transition.phase === "arrive" ? "actor" : "none");
    const toMode: ActiveFormalRouteTransition["toMode"] = transition.toMode
      ?? (transition.toActionId
      ? formalActionMode(targetAction)
      : transition.phase === "depart" ? "actor" : "none");
    const triggerProgress = route ? transitionTriggerProgress(route, transition) : 0;
    const remainingRouteMs = transition.phase === "arrive" && route
      ? Math.max(0, Math.round((1 - triggerProgress) * route.durationMs))
      : 0;
    const transitionDurationMs = transition.durationMs + (transition.settleMs ?? 0);
    const effectiveDurationMs = Math.max(transitionDurationMs, remainingRouteMs, 420);
    const active: ActiveFormalRouteTransition = {
      ...transition,
      key,
      effectiveDurationMs,
      fromPreview: sourcePreview,
      toPreview: targetPreview,
      fromMode,
      toMode,
      fromActorAsset: fromMode === "actor"
        ? sourceAction?.actorAsset ?? null
        : null,
      toActorAsset: toMode === "actor"
        ? targetAction?.actorAsset ?? null
        : null,
    };
    // The arrival smoke owns the final handoff. Lock the stage anchor to the
    // terminal waypoint immediately, then let the smoke hide the last authored
    // bend. The motion actor may still finish its internal clock, but its later
    // samples are ignored until this transition is released.
    if (transition.phase === "arrive") {
      const terminalPoint = route?.points.at(-1);
      if (terminalPoint) {
        currentActorPointRef.current = terminalPoint.id;
        setActorPosition({ x: terminalPoint.x, y: terminalPoint.y });
        setActorPerspectiveScale(terminalPoint.stableScale);
      }
    }
    emitLifeCue(getSceneLifeCue(transitionSceneId, "transition", {
      actionId: transition.toActionId ?? transition.fromActionId,
      index: transition.phase === "depart" ? 0 : 1,
    }));
    setRouteTransition(active);
    activeRouteTransitionRef.current = active;
    if (transition.phase === "arrive") {
      arrivalTransitionRouteKeyRef.current = `${route?.id ?? transitionSceneId}:${transition.pointId}`;
    }
    setRouteActorHidden(false);
    // The first one-point route starts on the already-selected formal scene
    // state. Keep that stable image under the smoke while its incoming layer
    // performs the reveal; movement departures still clear their old state.
    if (!(transition.phase === "depart" && !transition.fromActionId && targetPreview)) {
      setActionPreview(null);
    }
    setRoutePaused(false);

    routeTransitionTimerRef.current = setTimeout(() => {
      const journey = sceneJourneyRef.current;
      const journeyLeg = journey?.legs[journey.index];
      const continuesJourney = Boolean(
        transition.phase === "arrive"
        && route
        && journeyLeg?.sceneId === transitionSceneId
        && journeyLeg.routeId === route.id
        && journey!.index < journey!.legs.length - 1,
      );
      const skipArrivalActivity = Boolean(
        transition.phase === "arrive"
        && route
        && skipArrivalActivityRouteRef.current?.sceneId === transitionSceneId
        && skipArrivalActivityRouteRef.current.routeId === route.id,
      );
      if (activeRouteTransitionRef.current?.key === key) {
        activeRouteTransitionRef.current = null;
      }
      setRouteTransition((current) => current?.key === key ? null : current);
      emitLifeEvent({
        type: "route-transition-finished",
        style: transition.phase === "arrive" ? "smoke-arrive" : "smoke-depart",
      });
      if (transition.phase === "arrive") {
        setActionPreview(targetPreview);
        setRouteActorHidden(Boolean(transition.hideAfter));
        if (skipArrivalActivity && !continuesJourney) {
          skipArrivalActivityRouteRef.current = null;
        }
        if (!transition.hideAfter && !continuesJourney && !skipArrivalActivity) {
          startLifeActivity(transitionSceneId, transition.toActionId ?? route?.arriveActionId);
        }
      } else if (route?.points.length === 1 && targetPreview) {
        // A one-point entry route is the formal room's initial reveal: it has
        // no movement leg, so its departure smoke owns the stable scene handoff.
        setActionPreview(targetPreview);
        startLifeActivity(transitionSceneId, route.arriveActionId);
      }
      setRoutePaused(false);
      routeTransitionTimerRef.current = null;
      if (transition.phase === "arrive" && route) {
        advanceSceneJourneyRef.current(transitionSceneId, route.id);
      }
    }, effectiveDurationMs + 40);
  };

  const startSceneTravelLeg = (leg: SceneTravelLeg, legState: NovelistState, announce: boolean): boolean => {
    const route = getFormalSceneRoute(leg.sceneId, leg.routeId);
    if (!route) return false;
    const departureTransition = getFormalSceneRouteTransition(route, route.waypointIds[0]!, "depart");
    const firstPoint = route.points[0];

    clearRouteTransitionTimer();
    activeRouteTransitionRef.current = null;
    arrivalTransitionRouteKeyRef.current = null;
    setRouteTransition(null);
    setRouteActorHidden(false);
    setActionPreview(null);
    setSceneId(leg.sceneId);
    setState(legState);
    motionCueRouteKeyRef.current = null;
    if (firstPoint) {
      currentActorPointRef.current = firstPoint.id;
      setActorPosition({ x: firstPoint.x, y: firstPoint.y });
      setActorPerspectiveScale(firstPoint.stableScale);
    }
    if (activeLifeIntentIdRef.current) {
      emitLifeEvent({
        type: "route-departed",
        routeKey: route.id,
        intentId: activeLifeIntentIdRef.current,
      });
    }
    if (announce) {
      const cue = getSceneLifeCue(leg.sceneId, "moving", { actionId: route.arriveActionId });
      emitLifeCue({
        ...cue,
        id: `journey-leg:${sceneJourneyRef.current?.id ?? 0}:${sceneJourneyRef.current?.index ?? 0}`,
        icon: leg.role === "connector" ? "↝" : leg.role === "entry" ? "⌂" : "···",
        title: leg.role === "connector" ? "沿屋内联络线继续" : leg.role === "entry" ? "走进目标房间" : "先离开当前角落",
        text: route.label,
        anchor: "actor",
        visibleForMs: 1550,
        cooldownMs: 0,
      });
    }
    if (departureTransition) beginRouteTransition(departureTransition, leg.sceneId, route);
    else setRoutePaused(false);
    setRouteCommand((previous) => ({ routeId: route.id, token: previous.token + 1 }));
    if (legState === "writing") triggerManuscriptParticles();
    return true;
  };

  const advanceSceneJourney = (arrivedSceneId: FormalSceneId, arrivedRouteId: string): boolean => {
    const journey = sceneJourneyRef.current;
    const currentLeg = journey?.legs[journey.index];
    if (!journey || currentLeg?.sceneId !== arrivedSceneId || currentLeg.routeId !== arrivedRouteId) return false;
    const nextIndex = journey.index + 1;
    if (nextIndex >= journey.legs.length) {
      sceneJourneyRef.current = null;
      setSceneJourney(null);
      return false;
    }
    const nextJourney: ActiveSceneJourney = { ...journey, index: nextIndex };
    const nextLeg = nextJourney.legs[nextIndex]!;
    sceneJourneyRef.current = nextJourney;
    setSceneJourney(nextJourney);
    const started = startSceneTravelLeg(
      nextLeg,
      nextIndex === nextJourney.legs.length - 1 ? nextJourney.targetState : "away",
      true,
    );
    if (!started) {
      sceneJourneyRef.current = null;
      setSceneJourney(null);
      emitLifeCue({
        ...getSceneLifeCue(arrivedSceneId, "system", { actionId: "route-missing" }),
        id: `journey-missing:${nextLeg.sceneId}:${nextLeg.routeId}`,
        kind: "system",
        icon: "!",
        title: "下一段路线尚未发布",
        text: `已安全停下，没有用瞬移绕过：${nextLeg.label}`,
        anchor: "screen",
        visibleForMs: 2600,
        cooldownMs: 0,
      });
      return false;
    }
    return true;
  };

  advanceSceneJourneyRef.current = advanceSceneJourney;

  const command = (
    nextSceneId: FormalSceneId,
    nextState: NovelistState,
    nextRouteId?: string,
    message?: string | LifeCue,
    intentOverride?: LifeIntent,
    options?: RouteCommandOptions,
  ) => {
    continuationTokenRef.current += 1;
    const nextRoute = nextRouteId ?? firstRouteId(nextSceneId, nextState);
    const nextFormalRoute = getFormalSceneRoute(nextSceneId, nextRoute);
    if (!nextFormalRoute) {
      emitLifeCue({
        ...getSceneLifeCue(sceneId, "system", { actionId: "route-missing" }),
        id: `route-missing:${nextSceneId}:${nextRoute}`,
        kind: "system",
        icon: "!",
        title: "路线尚未发布",
        text: "这次不会瞬移过去；请先在 3001 发布对应路线。",
        anchor: "screen",
        visibleForMs: 2600,
        cooldownMs: 0,
      });
      return;
    }
    const journeyPlan = buildPublishedSceneJourney({
      fromSceneId: sceneId,
      targetSceneId: nextSceneId,
      currentPointId: currentActorPointRef.current,
      targetRouteId: nextFormalRoute.id,
      ...(options?.preferredConnector ? { preferredConnector: options.preferredConnector } : {}),
    });
    if (!journeyPlan || journeyPlan.legs.length === 0) {
      emitLifeCue({
        ...getSceneLifeCue(sceneId, "system", { actionId: "journey-disconnected" }),
        id: `journey-disconnected:${sceneId}:${nextSceneId}:${nextRoute}`,
        kind: "system",
        icon: "⌁",
        title: "两处锚点还没有接通",
        text: "已拒绝跨场景瞬移。3001 的路线或语义锚点需要补齐后再出发。",
        anchor: "screen",
        visibleForMs: 3000,
        cooldownMs: 0,
      });
      return;
    }
    skipArrivalActivityRouteRef.current = null;
    sceneJourneyRef.current = null;
    setSceneJourney(null);
    const previousIntentId = activeLifeIntentIdRef.current;
    const activeActivityBeforeCommand = activeLifeActivityRef.current;
    if (activeActivityBeforeCommand?.settleOnInterrupt) {
      completeLifeActivity(activeActivityBeforeCommand);
    } else if (previousIntentId && (lifeRuntime.phase === "route-moving" || lifeRuntime.phase === "activity-running" || activeActivityBeforeCommand)) {
      suspendedLifeIntentIdRef.current = previousIntentId;
      emitLifeEvent({
        type: "user-interrupted",
        commandId: `command:${nextSceneId}:${nextRoute}`,
        suspendedIntentId: previousIntentId,
      });
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
      activeLifeActivityRef.current = null;
      setActiveVisualBeats([]);
    }
    const routeResolution = resolveLifeSystemRoute({
      sceneId: nextSceneId,
      routeId: nextRoute,
      ...(nextFormalRoute.arriveActionId ? { actionId: nextFormalRoute.arriveActionId } : {}),
      carriedProps: carriedPropsRef.current,
    });
    const targetActivity = routeResolution.targetActivity;
    const routeOwnerActivity = routeResolution.routeOwnerActivity;
    const routeFields = routeResolution.routeFields;
    const routeContract = routeResolution.routeContract;
    if (routeContract && !routeContract.ok) {
      emitLifeCue({
        ...getSceneLifeCue(sceneId, "system", { actionId: "route-semantic-mismatch" }),
        id: `route-semantic-mismatch:${nextSceneId}:${nextRoute}`,
        kind: "system",
        icon: "!",
        title: "生活意图与路线不匹配",
        text: routeContract.issues[0]?.message ?? "这条路线尚未完成正式语义发布。",
        anchor: "screen",
        visibleForMs: 3000,
        cooldownMs: 0,
      });
      return;
    }
    const missingProps = routeResolution.missingProps;
    if (missingProps.length > 0) {
      emitLifeCue({
        ...getSceneLifeCue(sceneId, "system", { actionId: "route-required-prop" }),
        id: `route-required-prop:${nextSceneId}:${nextRoute}`,
        kind: "system",
        icon: "🍲",
        title: "还没有带上这段生活需要的东西",
        text: `需要：${missingProps.map((prop) => lifePropLabels[prop]).join("、")}。先完成上一段活动，再出发。`,
        anchor: "actor",
        visibleForMs: 2800,
        cooldownMs: 0,
      });
      return;
    }
    skipArrivalActivityRouteRef.current = (options?.arrivalActivityMode === "skip" || routeFields.arrivalPolicy === "arrive-only")
      ? { sceneId: nextSceneId, routeId: nextFormalRoute.id }
      : null;
    const intent: LifeIntent = intentOverride ?? {
      id: `intent:${nextSceneId}:${nextRoute}:${routeCommand.token + 1}`,
      reason: "user",
      sourceScene: sceneId,
      targetScene: nextSceneId,
      targetAnchor: nextFormalRoute?.points.at(-1)?.id ?? nextFormalRoute?.waypointIds.at(-1) ?? "",
      routeKey: nextRoute,
      ...routeFields,
      ...(targetActivity ? { arrivalActivity: targetActivity.id } : {}),
      interruptible: true,
      returnPolicy: nextState === "writing" ? "return-to-study" : "stay-until-user",
      status: "queued",
    };
    activeLifeIntentIdRef.current = intent.id;
    emitLifeEvent({ type: "intent-queued", intent });
    const routeIntentCue = getSceneLifeCue(nextSceneId, "intent", {
      actionId: nextFormalRoute?.arriveActionId,
    });
    emitLifeCue(typeof message === "object"
      ? message
      : message
        ? {
          ...routeIntentCue,
          id: `command:${nextSceneId}:${nextRoute}:${message}`,
          title: nextFormalRoute?.label ?? routeIntentCue.title,
          text: message,
        }
        : routeIntentCue);
    const firstLeg = journeyPlan.legs[0]!;
    if (journeyPlan.legs.length > 1 || sceneId !== nextSceneId) {
      const journey: ActiveSceneJourney = {
        id: sceneJourneyKeyRef.current + 1,
        fromSceneId: sceneId,
        targetSceneId: nextSceneId,
        targetState: nextState,
        legs: journeyPlan.legs,
        index: 0,
      };
      sceneJourneyKeyRef.current = journey.id;
      sceneJourneyRef.current = journey;
      setSceneJourney(journey);
    }
    startSceneTravelLeg(
      firstLeg,
      journeyPlan.legs.length === 1 ? nextState : "away",
      false,
    );
  };

  const confirmNeed = (need: LifeNeedKey) => {
    const plan = lifeNeedPlans[need];
    const route = getFormalSceneRoute(plan.sceneId, plan.routeId);
    const activity = resolveLifeActivity(plan.sceneId, route?.arriveActionId);
    const routeOwnerActivity = findLifeActivityForRoute(plan.sceneId, plan.routeId) ?? activity;
    const needCue = getNeedLifeCue(need, sceneId);
    const intent: LifeIntent = {
      id: `intent.${plan.reason}:${routeCommand.token + 1}:${Date.now()}`,
      reason: plan.reason,
      sourceScene: sceneId,
      targetScene: plan.sceneId,
      targetAnchor: plan.targetAnchor,
      routeKey: plan.routeId,
      ...lifeIntentRouteFields(routeOwnerActivity, plan.routeId),
      ...(activity ? { arrivalActivity: activity.id } : {}),
      interruptible: true,
      returnPolicy: "resume-schedule",
      status: "queued",
    };
    emitLifeEvent({ type: "cue-acknowledged", cueId: `need:${need}`, intentId: intent.id });
    const { action: _needAction, ...needCueWithoutAction } = needCue;
    const departureCue: LifeCue = {
      ...needCueWithoutAction,
      id: `acknowledged:${intent.id}`,
      kind: "intent",
      title: "已经决定出发",
      text: need === "hunger"
        ? "先去料理台，再端着热汤走到饭桌。"
        : need === "fatigue"
          ? "他把今天交给床铺，等身体先说一句。"
        : need === "stuck"
            ? "去露台换一口风，卡住的句子先不必硬拽。"
            : "先把心里的重量放在沙发上几分钟。",
      anchor: "actor",
      visibleForMs: 1700,
      cooldownMs: 0,
    };
    command(
      plan.sceneId,
      plan.state,
      plan.routeId,
      departureCue,
      intent,
    );
    setInterventionOpen(false);
  };

  const resumeSuspendedIntent = () => {
    const suspendedId = suspendedLifeIntentIdRef.current;
    const suspended = suspendedId ? lifeRuntime.intents[suspendedId] : undefined;
    if (!suspended) {
      setInterventionOpen(false);
      return;
    }
    const route = getFormalSceneRoute(suspended.targetScene, suspended.routeKey);
    const action = route ? formalEcologySceneManifest.scenes[suspended.targetScene].actions[route.arriveActionId] : undefined;
    const resumedIntent: LifeIntent = {
      ...suspended,
      id: `${suspended.id}:resume:${routeCommand.token + 1}`,
      sourceScene: sceneId,
      status: "queued",
    };
    command(
      suspended.targetScene,
      action?.activity ?? "away",
      suspended.routeKey,
      {
        ...getSceneLifeCue(suspended.targetScene, "intent", { actionId: route?.arriveActionId }),
        id: `resume:${suspended.id}`,
        title: "把刚才的念头接回来",
        text: "中断没有被删除，他会从原来的意图重新出发。",
      },
      resumedIntent,
    );
    suspendedLifeIntentIdRef.current = null;
    setInterventionOpen(false);
  };

  const executeLifeTendency = (tendency: LifeTendency) => {
    const route = getFormalSceneRoute(tendency.sceneId, tendency.routeId);
    const targetActivity = resolveLifeActivity(tendency.sceneId, route?.arriveActionId)
      ?? getLifeActivity(tendency.activityId);
    const routeOwnerActivity = findLifeActivityForRoute(tendency.sceneId, tendency.routeId) ?? targetActivity;
    const intent: LifeIntent = {
      id: `intent:state:${tendency.key}:${routeCommand.token + 1}:${Date.now()}`,
      reason: tendency.reason,
      sourceScene: sceneId,
      targetScene: tendency.sceneId,
      targetAnchor: tendency.targetAnchor,
      routeKey: tendency.routeId,
      ...lifeIntentRouteFields(routeOwnerActivity, tendency.routeId),
      ...(targetActivity ? { arrivalActivity: targetActivity.id } : {}),
      interruptible: true,
      returnPolicy: "resume-schedule",
      status: "queued",
    };
    const tendencyCue = getNeedLifeCue(tendency.key, sceneId);
    const { action: _tendencyAction, ...cueWithoutAction } = tendencyCue;
    command(
      tendency.sceneId,
      tendency.state,
      tendency.routeId,
      {
        ...cueWithoutAction,
        id: `state-tendency:${tendency.key}:${Date.now()}`,
        kind: "intent",
        title: "身体先替他开口",
        text: tendency.key === "hunger"
          ? "胃已经把门推开一条缝。先去料理台，热汤会替他把下午接住。"
          : tendency.key === "fatigue"
            ? "眼皮正在关门。先去卧室把今天放下，没写完的明天还认得。"
            : tendency.key === "stuck"
              ? "这句不肯动。先去露台借一口风，答案不一定回来，至少人会回来。"
              : "心里压着一页纸。先去沙发坐一会儿，等它不再硌手。",
        visibleForMs: 2100,
        cooldownMs: 120000,
      },
      intent,
    );
  };

  executeLifeTendencyRef.current = executeLifeTendency;

  const executeLifeBeat = (beat: LifeBeat) => {
    setActiveLifeBeatId(beat.id);
    setLifePlanOpen(false);
    command(beat.sceneId, beat.activity, beat.routeId, getLifeBeatCue(beat));
  };

  executeLifeBeatRef.current = executeLifeBeat;

  const lifeDaySwitchLocked = Boolean(
    sceneJourney
    || routeTransition
    || lifeRuntime.phase === "intent-queued"
    || lifeRuntime.phase === "route-moving"
    || lifeRuntime.phase === "arrival-settling",
  );

  const changeLifeDay = (nextDay: number) => {
    if (lifeDaySwitchLocked) {
      emitLifeCue({
        ...getSceneLifeCue(sceneId, "system", { actionId: "life-day-switch" }),
        id: `life-day-switch-locked:${Date.now()}`,
        kind: "system",
        icon: "⌛",
        title: "这一段还没有收束",
        text: "等他走完路线或把手里的活动放下，再翻看另一日的生活。",
        anchor: "screen",
        visibleForMs: 2200,
        cooldownMs: 800,
      });
      return;
    }
    const normalizedDay = Math.max(1, Math.floor(nextDay));
    const returningToToday = normalizedDay === currentLifeDay;
    const nextPlan = resolveLifeDayPlan(
      normalizedDay,
      returningToToday ? committedNextDayPlan : null,
    ).plan;
    setPreviewLifeDay(returningToToday ? null : normalizedDay);
    setActiveLifeBeatId(nextPlan.beats[0]?.id ?? novelistDailyRhythm[0]!.id);
    autoplayBeatIndexRef.current = 0;
    emitLifeCue({
      ...getSceneLifeCue(sceneId, "system", { actionId: "life-day-switch" }),
      id: `life-day-switch:${normalizedDay}:${Date.now()}`,
      kind: "system",
      icon: returningToToday ? "☼" : "↔",
      title: returningToToday ? "回到今天" : `预览第 ${normalizedDay} 日`,
      text: returningToToday
        ? "日历重新接管生活，今天的节奏回到台前。"
        : `${nextPlan.label}。这只是预览，不会改掉已经发生的生活。`,
      anchor: "screen",
      visibleForMs: 2200,
      cooldownMs: 300,
    });
  };

  useEffect(() => {
    if (!lifeAutoplay) {
      if (autoplayTimerRef.current) {
        clearTimeout(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
      return;
    }

    const tick = () => {
      const context = autoplayContextRef.current;
      const blocked = context.routePaused
        || context.routeTransition
        || context.journey
        || context.lifeCue
        || Boolean(activeLifeActivityRef.current);
      if (!blocked) {
        const now = Date.now();
        const tendency = context.tendency;
        const tendencyCooldownUntil = tendency
          ? autoplayTendencyCooldownUntilRef.current[tendency.key] ?? 0
          : 0;
        if (tendency && tendencyCooldownUntil <= now) {
          autoplayTendencyCooldownUntilRef.current[tendency.key] = now + 120000;
          executeLifeTendencyRef.current(tendency);
        } else {
          const nextBeat = getAutoplayLifeBeat(
            context.dayPhase,
            context.activeBeatId,
            autoplayBeatIndexRef.current,
            context.dayIndex,
            context.planMode,
          );
          autoplayBeatIndexRef.current += 1;
          if (nextBeat) executeLifeBeatRef.current(nextBeat);
        }
      }
      autoplayTimerRef.current = setTimeout(tick, AUTOPLAY_INTERVAL_MS);
    };

    autoplayTimerRef.current = setTimeout(tick, 2200);
    return () => {
      if (autoplayTimerRef.current) {
        clearTimeout(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
    };
  }, [lifeAutoplay]);

  const toggleLifeAutoplay = useCallback(() => {
    const enabled = !lifeAutoplay;
    setLifeAutoplay(enabled);
    emitLifeCue({
      ...getSceneLifeCue(sceneId, "system", { actionId: "life-autoplay" }),
      id: `life-autoplay:${enabled ? "on" : "off"}:${Date.now()}`,
      kind: "system",
      tone: enabled ? "warm" : "quiet",
      icon: enabled ? "▶" : "Ⅱ",
      title: enabled ? "生活开始自己走" : "生活先停在这里",
      text: enabled
        ? "他会按当前时段挑一段已经发布的路线；你仍然可以随时打断。"
        : "他不会被系统继续推着走，当前念头会留在原地。",
      anchor: "screen",
      visibleForMs: 2200,
      cooldownMs: 300,
    });
  }, [emitLifeCue, lifeAutoplay, sceneId]);

  const finishActiveActivity = () => {
    if (activeLifeActivityRef.current) completeLifeActivity(activeLifeActivityRef.current);
  };

  const executeRouteOption = (option: FormalRouteOption) => {
    setLifePlanOpen(false);
    command(
      option.targetSceneId,
      option.activity,
      option.targetRouteId,
      undefined,
      undefined,
      option.preferredConnector ? { preferredConnector: option.preferredConnector } : undefined,
    );
  };

  const selectScene = (nextSceneId: FormalSceneId) => {
    const nextState = defaultStateForScene[nextSceneId];
    setMapHoverSceneId(null);
    const nextSceneLabel = formalEcologySceneManifest.scenes[nextSceneId].label;
    command(nextSceneId, nextState, undefined, {
      ...getSceneLifeCue(nextSceneId, "intent", { actionId: "scene-observe" }),
      id: `scene-observe:${nextSceneId}`,
      title: `观察${nextSceneLabel}`,
      text: `切到「${nextSceneLabel}」看看他现在的生活。`,
    });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (routePaused || actionPreview || routeTransition) return;
      const previousIndex = ambientCueIndexRef.current[sceneId] ?? -1;
      const nextIndex = previousIndex + 1;
      ambientCueIndexRef.current[sceneId] = nextIndex;
      emitLifeCue(getSceneLifeCue(sceneId, "thought", {
        actionId: currentAction?.id,
        index: nextIndex,
      }));
    }, 8500);
    return () => clearInterval(timer);
  }, [actionPreview, currentAction?.id, emitLifeCue, routePaused, routeTransition, sceneId]);

  useEffect(() => {
    const handleRoomShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTyping = Boolean(target && (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
        || target.isContentEditable
      ));
      const isPanelContext = Boolean(target?.closest("[data-room-shortcut-scope='system-panel']"));
      const isInteractive = Boolean(target?.closest("button, a, summary, [role='button'], [role='dialog']"));

      if (event.key === "Escape") {
        if (isTyping) (target as HTMLElement).blur();
        if (deskEntryOpen) {
          event.preventDefault();
          setDeskEntryOpen(false);
        } else if (interventionOpen) {
          event.preventDefault();
          setInterventionOpen(false);
        } else if (postcardOpen) {
          event.preventDefault();
          setPostcardOpen(false);
        } else if (activeChatChannel !== null) {
          event.preventDefault();
          setActiveChatChannel(null);
        } else if (lifePlanOpen) {
          event.preventDefault();
          setLifePlanOpen(false);
        } else if (mapOpen) {
          event.preventDefault();
          setMapOpen(false);
        }
        return;
      }
      if (isTyping || isInteractive || isPanelContext || interventionOpen || postcardOpen) return;

      if (event.key === "Enter") {
        event.preventDefault();
        setLifePlanOpen(false);
        setMapOpen(false);
        setActiveChatChannel((channel) => channel === "novelist" ? null : "novelist");
        return;
      }
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        setActiveChatChannel(null);
        setMapOpen(false);
        setLifePlanOpen((open) => !open);
        return;
      }
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        setLifePlanOpen(false);
        setMapOpen(false);
        setActiveChatChannel((channel) => channel === "subsystem" ? null : "subsystem");
        return;
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setActiveChatChannel(null);
        setLifePlanOpen(false);
        setMapOpen((open) => !open);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggleLifeAutoplay();
      }
    };

    window.addEventListener("keydown", handleRoomShortcut);
    return () => window.removeEventListener("keydown", handleRoomShortcut);
  }, [activeChatChannel, deskEntryOpen, interventionOpen, lifePlanOpen, mapOpen, postcardOpen, toggleLifeAutoplay]);

  const sceneButtons = useMemo(() => formalPublishedRouteSceneIds, []);

  return (
    <main
      className={styles.room}
      data-testid="novelist-room"
      data-scene-id={sceneId}
      data-immersive="true"
      data-tap-pulse={tapPulse}
      data-energy-band={lifeRuntime.energyBand}
      data-life-phase={lifeRuntime.host.dayPhase}
      data-runtime-phase={lifeRuntime.phase}
      data-life-autoplay={lifeAutoplay}
      data-life-system={lifeSystem.schema}
      data-life-dominant-signal={lifeSystem.dominantSignal.key}
      data-journey-active={Boolean(sceneJourney)}
      data-journey-step={sceneJourney ? sceneJourney.index + 1 : 0}
    >
      <SystemLayerPanel
        activeChannel={activeChatChannel}
        onRequestChannel={setActiveChatChannel}
        {...(roomUiV6Enabled ? {
          presentationalSurface: roomUiEditorEnabled
            ? RoomUiPresentationalEditor
            : RoomUiPresentationalSurface,
        } : {})}
        observation={{
          sceneLabel: scene.label,
          activityLabel: observationActivityLabel,
          focus: lifeRuntime.host.focus,
          fatigue: lifeRuntime.host.fatigue,
          inspiration: lifeRuntime.host.inspiration,
          emotionalLoad: lifeRuntime.host.emotionalLoad,
          lifeStateVersion: lifeRuntime.revision,
        }}
      />
      {deskEntryOpen && (
        <div
          className={styles.deskEntryOverlay}
          data-testid="desk-entry-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeskEntryOpen(false);
          }}
        >
          <div className={styles.deskEntryBackdrop} data-testid="desk-entry-backdrop" aria-hidden="true" />
          <section className={styles.deskEntryPanel} role="dialog" aria-modal="true" aria-labelledby="desk-entry-title">
            <img
              className={styles.deskEntryPaperFrame}
              src="/assets/ui/system-layer-materials-v3/desk-entry/desk-entry-paper-frame-v1.webp"
              alt=""
              aria-hidden="true"
            />
            <div className={styles.deskEntryPaperContent}>
            <header className={styles.deskEntryHeader}>
              <div>
                <p className={styles.eyebrow}>书桌 · writing-seat</p>
                <h2 id="desk-entry-title">他正在写作</h2>
                <p>从这里选择要进入的工作，不会替他做决定。</p>
              </div>
              <button type="button" className={styles.deskEntryClose} onClick={() => setDeskEntryOpen(false)} aria-label="关闭书桌入口">×</button>
            </header>
            <div className={styles.deskEntryCards}>
              <button
                type="button"
                className={`${styles.deskEntryCard} ${styles.deskEntryCardChat}`}
                onClick={() => {
                  setDeskEntryOpen(false);
                  setActiveChatChannel("novelist");
                }}
              >
                <img src="/assets/ui/system-layer-materials-v3/desk-entry/desk-entry-chat-v1.webp" alt="" />
                <span>
                  <strong>和小说家说话</strong>
                  <small>进入主系统对话</small>
                </span>
              </button>
              <a className={`${styles.deskEntryCard} ${styles.deskEntryCardWorldLab}`} href="/vnext/world-lab">
                <img src="/assets/ui/system-layer-materials-v3/desk-entry/desk-entry-world-lab-v1.webp" alt="" />
                <span>
                  <strong>打开正文工作台</strong>
                  <small>进入 World Lab 看作品</small>
                </span>
              </a>
              <button
                type="button"
                className={`${styles.deskEntryCard} ${styles.deskEntryCardLife}`}
                onClick={() => {
                  setDeskEntryOpen(false);
                  setLifePlanOpen(true);
                }}
              >
                <img src="/assets/ui/system-layer-materials-v3/desk-entry/desk-entry-life-v1.webp" alt="" />
                <span>
                  <strong>看看今日生活</strong>
                  <small>查看他接下来要做什么</small>
                </span>
              </button>
            </div>
            </div>
          </section>
        </div>
      )}
      <section className={styles.mapDock} data-testid="room-map" data-open={mapOpen} aria-label="整屋地图">
        <button
          type="button"
          className={styles.mapToggle}
          aria-expanded={mapOpen}
          aria-controls="room-map-popover"
          aria-label={mapOpen ? "收起整屋地图" : `展开整屋地图，当前：${scene.label}`}
          onClick={() => setMapOpen((open) => !open)}
        >
          <span className={styles.mapToggleAvatar} aria-hidden="true">
            <img src={formalEcologySceneManifest.walkingActorAssets.right.src} alt="" />
          </span>
          <span className={styles.mapToggleGlyph} aria-hidden="true">✦</span>
          <span className={styles.mapToggleText}>
            <strong>整屋地图</strong>
            <small>{mapOpen ? "收起地图" : `当前：${scene.label}`}</small>
          </span>
          <span className={styles.mapToggleCaret} aria-hidden="true">{mapOpen ? "⌃" : "⌄"}</span>
        </button>
        <div
          className={styles.mapPopover}
          id="room-map-popover"
          data-testid="room-map-popover"
          data-open={mapOpen}
          aria-hidden={!mapOpen}
        >
          <div className={styles.mapPopoverInner}>
            <div className={styles.mapImage}>
              <img src="/assets/ecology/home-map-v1.webp" alt="小说家整屋关系小地图" loading="lazy" decoding="async" />
              <svg className={styles.mapAstrolabe} viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="44" />
                <circle cx="50" cy="50" r="33" />
                <circle cx="50" cy="50" r="20" />
                <path d="M50 5v90M5 50h90" />
                <text x="50" y="8" textAnchor="middle">N</text>
                <text x="92" y="52" textAnchor="middle">E</text>
                <text x="50" y="96" textAnchor="middle">S</text>
                <text x="8" y="52" textAnchor="middle">W</text>
                {sceneMapEdges.map(([fromId, toId]) => {
                  const from = sceneMapPositions[fromId];
                  const to = sceneMapPositions[toId];
                  return <line key={`${fromId}-${toId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
                })}
              </svg>
              {sceneButtons.map((id) => {
                const item = formalEcologySceneManifest.scenes[id];
                const position = sceneMapPositions[id];
                return (
                  <button
                    key={id}
                    type="button"
                    className={styles.mapRoomMarker}
                    data-current={id === sceneId}
                    data-hovered={mapHoverSceneId === id}
                    data-scene-id={id}
                    style={{ left: `${position.x}%`, top: `${position.y}%` }}
                    onClick={() => selectScene(id)}
                    onMouseEnter={() => setMapHoverSceneId(id)}
                    onMouseLeave={() => setMapHoverSceneId(null)}
                    onFocus={() => setMapHoverSceneId(id)}
                    onBlur={() => setMapHoverSceneId(null)}
                    aria-current={id === sceneId ? "location" : undefined}
                    aria-label={`前往${item.label}`}
                  >
                    {id === sceneId && (
                      <span className={styles.mapMarkerFloat} aria-hidden="true">
                        <span className={styles.mapMarkerAvatar}>
                          <img src={formalEcologySceneManifest.walkingActorAssets.right.src} alt="" />
                        </span>
                        <span className={styles.mapMarkerPointer}>⌖</span>
                      </span>
                    )}
                    <span className={styles.mapRoomMarkerDot} aria-hidden="true" />
                    <span className={styles.mapRoomMarkerLabel}>{item.label.replace("纯粹", "")}</span>
                    {mapHoverSceneId === id && (
                      <span className={styles.mapNodeTooltip} aria-hidden="true">
                        {id === sceneId ? "CURRENT" : "GO TO"} · {item.label.replace("纯粹", "")}
                      </span>
                    )}
                  </button>
               );
              })}
              <button
                type="button"
                className={styles.mapPendulum}
                aria-label="收起整屋地图"
                onClick={() => setMapOpen(false)}
              >
                <span className={styles.mapPendulumStem} aria-hidden="true" />
                <span className={styles.mapPendulumKey} aria-hidden="true">×</span>
                <span className={styles.mapPendulumTooltip} aria-hidden="true">CLOSE MAP</span>
              </button>
            </div>
            <p className={styles.mapLegend}>浮标会跟着小说家当前所在房间移动 · 点击房间可直接切换</p>
          </div>
        </div>
      </section>

      <section
        className={styles.lifePlanDock}
        data-open={lifePlanOpen}
        data-testid="life-plan"
        data-plan-source={dailyLifePlanResolution.source}
      >
        <button
          type="button"
          className={styles.lifePlanToggle}
          aria-expanded={lifePlanOpen}
          aria-controls="life-plan-panel"
          onClick={() => setLifePlanOpen((open) => !open)}
        >
          <span className={styles.lifePlanIcon} aria-hidden="true">☼</span>
          <span className={styles.lifePlanToggleText}>
            <strong>今日生活</strong>
            <small>{lifePlanOpen ? "收起计划" : `下一段 · ${activeLifeBeat.title}`}</small>
          </span>
          <span className={styles.lifePlanCaret} aria-hidden="true">{lifePlanOpen ? "−" : "+"}</span>
        </button>
        {lifePlanOpen && (
          <div className={styles.lifePlanOverlay} onClick={(event) => { if (event.target === event.currentTarget) setLifePlanOpen(false); }}>
            <div className={styles.lifePlanPanel} id="life-plan-panel" role="dialog" aria-label="小说家今日生活规划">
            <div className={styles.lifePlanHeader}>
              <div className={styles.lifePlanHeaderBrand}>
                <img
                  src="/assets/generated/cartoon_journal_logo.webp"
                  alt="卡通手账徽标"
                  className={styles.journalHeaderEmblem}
                />
                <div>
                  <p className={styles.eyebrow}>小说家 · 今日生活节奏</p>
                  <h2>先把日子过完，再把故事写完</h2>
                </div>
                <a
                  href="/room/reincarnation"
                  className={styles.reincarnationLinkBtn}
                  data-testid="reincarnation-entry-btn"
                >
                  🔄 重选前身 / 转生通道 ➔
                </a>
              </div>
              <button type="button" className={styles.lifePlanClose} onClick={() => setLifePlanOpen(false)} aria-label="收起今日生活规划">×</button>
            </div>
            <p className={styles.lifePlanIntro}>
              第 {dailyLifePlan.dayIndex} 日 · {dailyLifePlan.label}：{dailyLifePlan.intro}
            </p>
            <section
              className={styles.lifePulse}
              data-testid="next-day-plan"
              data-plan-status={committedNextDayPlan?.sourceDay === currentLifeDay ? "committed" : nextDayPlanDraft.status}
              data-plan-provenance={nextDayPlanDraft.provenance}
            >
              <span className={styles.lifePulseIcon} aria-hidden="true">☽</span>
              <div className={styles.lifePulseCopy}>
                <div className={styles.lifePulseMeta}>
                  <strong>明日倾向 · {nextDayPlanDraft.candidates.find((candidate) => candidate.mode === nextDayPlanDraft.selectedPlanMode)?.label}</strong>
                  <small>{committedNextDayPlan?.sourceDay === currentLifeDay ? "今晚已冻结" : "随今天的真实状态更新"}</small>
                </div>
                <p>
                  {committedNextDayPlan?.sourceDay === currentLifeDay
                    ? "已按今晚的生活状态冻结为明日计划；临时变化只记为偏离，不会篡改原计划。"
                    : "规则先守住休息和活动边界，seed 只在相近的正式日程间做可复现选择；入夜后才提交。"}
                </p>
              </div>
            </section>
            <div className={styles.lifePlanGridBody}>
              <div className={styles.lifePlanColLeft}>
                <section className={styles.lifeDaySwitcher} data-testid="life-day-switcher" aria-label="切换每日生活节奏">
                  <button
                    type="button"
                    className={styles.lifeDayArrow}
                    onClick={() => changeLifeDay(displayedLifeDay - 1)}
                    disabled={lifeDaySwitchLocked || displayedLifeDay <= 1}
                    aria-label="预览前一日"
                  >
                    ‹
                  </button>
                  <div className={styles.lifeDayCopy}>
                    <strong>{previewLifeDay === null ? `今日 · 第 ${currentLifeDay} 日` : `预览 · 第 ${displayedLifeDay} 日`}</strong>
                    <small>{previewLifeDay === null ? "按本地日历自动轮换" : "仅预览，不改变真实生活记录"} · {dailyLifePlan.label}</small>
                  </div>
                  <button
                    type="button"
                    className={styles.lifeDayArrow}
                    onClick={() => changeLifeDay(displayedLifeDay + 1)}
                    disabled={lifeDaySwitchLocked}
                    aria-label="预览后一日"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className={styles.lifeDayToday}
                    onClick={() => changeLifeDay(currentLifeDay)}
                    disabled={lifeDaySwitchLocked || previewLifeDay === null}
                  >
                    今天
                  </button>
                </section>
                <section className={styles.lifeAutoplayCard} data-enabled={lifeAutoplay}>
                  <div className={styles.lifeAutoplayOrb} aria-hidden="true"><span>{lifeAutoplay ? "▶" : "·"}</span></div>
                  <div className={styles.lifeAutoplayCopy}>
                    <strong>{lifeAutoplay ? "生活正在自发演出" : "让他自己过一天"}</strong>
                    <small>{lifeAutoplay ? "每段路线都可被你打断，活动仍按完成事件结算。" : "开启后按清晨、午间、傍晚和夜间挑选已发布路线。"}</small>
                  </div>
                  <button type="button" className={styles.lifeAutoplayButton} onClick={toggleLifeAutoplay} aria-pressed={lifeAutoplay}>
                    {lifeAutoplay ? "暂停" : "开始"}
                  </button>
                </section>
                <section
                  className={styles.lifePulse}
                  data-testid="life-current-cue"
                  data-mood-kind={displayedLifeCue.kind}
                  data-mood-tone={displayedLifeCue.tone}
                  aria-live="polite"
                >
                  <span className={styles.lifePulseIcon} aria-hidden="true">{displayedLifeCue.icon}</span>
                  <div className={styles.lifePulseCopy}>
                    <div className={styles.lifePulseMeta}>
                      <strong>此刻的生活信号</strong>
                      <small>{displayedLifeCue.title}</small>
                    </div>
                    <p>{displayedLifeCue.text}</p>
                    {displayedLifeCue.systemAside && <small className={styles.lifePulseAside}>{displayedLifeCue.systemAside}</small>}
                  </div>
                </section>
                <section
                  className={styles.lifeRuntimeCard}
                  data-testid="life-runtime"
                  data-details-open={true}
                  aria-label="生活运行时"
                >
                  <div className={styles.lifeRuntimeHeader}>
                    <strong>生活正在自己运转</strong>
                    <span data-energy-band={lifeRuntime.energyBand}>{energyBandLabels[lifeRuntime.energyBand]}</span>
                  </div>
                  <div className={styles.lifeRuntimePhase}>
                    <span className={styles.lifeRuntimePulse} aria-hidden="true" />
                    <span>{runtimePhaseLabels[lifeRuntime.phase] ?? lifeRuntime.phase}</span>
                    <small>{observationActivityLabel}</small>
                  </div>
                  <div className={styles.lifeNeedBars}>
                    <div><span>饥饿</span><i><b style={{ width: `${lifeRuntime.host.hunger}%` }} /></i><small>{Math.round(lifeRuntime.host.hunger)}</small></div>
                    <div><span>疲劳</span><i><b style={{ width: `${lifeRuntime.host.fatigue}%` }} /></i><small>{Math.round(lifeRuntime.host.fatigue)}</small></div>
                    <div><span>专注</span><i><b style={{ width: `${lifeRuntime.host.focus}%` }} /></i><small>{Math.round(lifeRuntime.host.focus)}</small></div>
                    <div><span>灵感</span><i><b style={{ width: `${lifeRuntime.host.inspiration}%` }} /></i><small>{Math.round(lifeRuntime.host.inspiration)}</small></div>
                  </div>
                </section>
                <section className={styles.lifeNeedDeck} aria-label="需求观察">
                  <div className={styles.lifeNeedDeckHeader}>
                    <strong>他可能正在想什么</strong>
                    <small>点击显示念头，确认后出发</small>
                  </div>
                  <div className={styles.lifeNeedButtons}>
                    {(["hunger", "fatigue", "stuck", "emotional-load"] as const).map((need) => (
                      <button key={need} type="button" data-need={need} onClick={() => showNeed(need)}>
                        <span>{getNeedLifeCue(need, sceneId).icon}</span>
                        <small>{need === "hunger" ? "饿了" : need === "fatigue" ? "累了" : need === "stuck" ? "卡文" : "心里有点重"}</small>
                      </button>
                    ))}
                  </div>
                  {displayedLifeCue.action?.type === "confirm-intent" && (
                    <button
                      type="button"
                      className={styles.needConfirmButton}
                      onClick={() => displayedNeed && confirmNeed(displayedNeed)}
                    >
                      回应这个念头，让他真的出发
                    </button>
                  )}
                </section>
              </div>
              <div className={styles.lifePlanColRight}>
                <ol className={styles.lifePlanList}>
                  {dailyLifePlan.beats.map((beat) => {
                    const isActive = beat.id === activeLifeBeatId;
                    const sceneLabel = formalEcologySceneManifest.scenes[beat.sceneId].label;
                    return (
                      <li key={beat.id} data-active={isActive} data-kind={beat.kind}>
                        <div className={styles.lifePlanTime}>{beat.timeLabel}</div>
                        <div className={styles.lifePlanBeatBody}>
                          <strong>{beat.title}</strong>
                          <small>{sceneLabel} · {beat.outcome}</small>
                        </div>
                        <button type="button" onClick={() => executeLifeBeat(beat)}>{isActive ? "继续这一段" : "执行"}</button>
                      </li>
                    );
                  })}
                </ol>
                <section className={styles.lifeRouteSection} data-testid="life-route-catalog">
                  <div className={styles.lifeRouteHeader}>
                    <strong>全屋 · 已发布路线</strong>
                    <small>{routeOptionCount} 条可执行路线</small>
                  </div>
                  <div className={styles.lifeRouteGroups}>
                    {routeOptionGroups.map((group) => (
                      <section key={group.sceneId} className={styles.lifeRouteGroup} data-scene-id={group.sceneId}>
                        <div className={styles.lifeRouteGroupHeader}>
                          <strong>{group.label}</strong>
                          <small>{group.options.length} 条</small>
                        </div>
                        <div className={styles.lifeRouteList}>
                          {group.options.map((option) => (
                            <button
                              key={`${option.sceneId}:${option.routeId}`}
                              type="button"
                              className={styles.lifeRouteButton}
                              data-route-id={option.routeId}
                              data-target-route-id={option.targetRouteId}
                              data-route-purpose={option.purpose}
                              {...(option.targetStrategy ? { "data-target-strategy": option.targetStrategy } : {})}
                              onClick={() => executeRouteOption(option)}
                            >
                              <span>{option.label}</span>
                              <small>{formalRoutePurposeLabels[option.purpose]} · {option.pointCount} 节点 · 执行</small>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
                <section className={styles.lifeTraceShelf} data-testid="life-traces">
                  <div className={styles.lifeTraceHeader}><strong>生活残留</strong><small>活动完成后才会留下</small></div>
                  {lifeRuntime.traceIds.length > 0 ? (
                    <div className={styles.lifeTraceList}>
                      {lifeRuntime.traceIds.slice(-5).reverse().map((traceId) => (
                        <span key={traceId} data-trace-id={traceId}>✦ {lifeTraceLabels[traceId] ?? traceId}</span>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.lifeTraceEmpty}>他还没有把任何东西留在房间里。</p>
                  )}
                </section>
                <section className={styles.lifeMoments} data-testid="life-moments" aria-label="最近生活片段">
                  <div className={styles.lifeMomentsHeader}>
                    <strong>最近生活片段</strong>
                    <small>{lifeMoments.length} 条记录</small>
                  </div>
                  <ol className={styles.lifeMomentList}>
                    {lifeMoments.slice(0, 4).map((moment) => (
                      <li key={moment.momentId} data-mood-kind={moment.kind}>
                        <span className={styles.lifeMomentIcon} aria-hidden="true">{moment.icon}</span>
                        <span className={styles.lifeMomentCopy}>
                          <strong>{moment.title}</strong>
                          <small>{moment.text}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className={styles.postcardSection} data-testid="postcard-shelf">
                  <div className={styles.postcardHeader}>
                    <div><strong>旅途回信</strong><small>他会把门外的风景寄回来</small></div>
                    <button
                      type="button"
                      data-testid="postcard-toggle"
                      onClick={() => setPostcardOpen((open) => {
                        if (!open) setUnreadPostcardCount(0);
                        return !open;
                      })}
                    >
                      {postcardOpen ? "收起" : `${postcards.length} 张`}
                      {unreadPostcardCount > 0 && <em data-testid="postcard-unread">新</em>}
                    </button>
                  </div>
                  {postcardOpen && (
                    postcards.length > 0 ? (
                      <div className={styles.postcardStack}>
                        {postcards.slice(0, 3).map((postcard) => (
                          <article
                            key={postcard.id}
                            className={styles.postcard}
                            data-postcard-id={postcard.id}
                            data-flipped={postcardFlippedId === postcard.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`${postcard.title}，点击翻面`}
                            onClick={() => setPostcardFlippedId((currentId) => currentId === postcard.id ? null : postcard.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setPostcardFlippedId((currentId) => currentId === postcard.id ? null : postcard.id);
                              }
                            }}
                          >
                            <div className={styles.postcardInner}>
                              <div className={`${styles.postcardFace} ${styles.postcardFront}`}>
                                <div className={styles.postcardImage} style={{ backgroundImage: `url(${postcard.imageSrc})` }} />
                                <div className={styles.postcardCopy}>
                                  <strong>{postcard.title}</strong>
                                  <small>{postcard.caption}</small>
                                  <p>{postcard.routeNote ?? "露台 → 门外 · 采风回信"}</p>
                                  <em>{postcard.sticker ?? "✦"} 点击翻面</em>
                                </div>
                              </div>
                              <div className={`${styles.postcardFace} ${styles.postcardBack}`}>
                                <div className={styles.postcardBackStamp} aria-hidden="true">{postcard.sticker ?? "✦"}</div>
                                <div className={styles.postcardCopy}>
                                  <strong>写在背面</strong>
                                  <small>{postcard.weather ?? "夜色 / 微风"}</small>
                                  <p>{postcard.message}</p>
                                  <em>{postcard.stamp}</em>
                                </div>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.postcardEmpty}><span aria-hidden="true">✉️</span><p>还没有明信片。等他去露台看完夜景，门外的世界会自己寄来一小角。</p></div>
                    )
                  )}
                </section>
              </div>
            </div>
            <div className={styles.lifePlanRule}>
              <span aria-hidden="true">✦</span>
              <p>对白不只是气泡：它会记录启程、移动、白烟转场、抵达和活动，让每条路线都留下自己的生活痕迹。</p>
            </div>
          </div>
        </div>
      )}
    </section>

      <div className={styles.grid}>
        <section
          className={styles.roomCard}
          aria-label={scene.label + "场景"}
          data-testid="formal-scene-stage"
          data-scene-id={sceneId}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const xRatio = (event.clientX - rect.left) / rect.width - 0.5;
            const yRatio = (event.clientY - rect.top) / rect.height - 0.5;
            setParallaxOffset({ x: Math.round(xRatio * 10), y: Math.round(yRatio * 8) });
          }}
        >
          {scene.masterAsset ? (
            <div
              className={styles.sceneBackdrop}
              data-testid="scene-master"
              data-asset-id={scene.masterAsset.assetId}
              style={{
                backgroundImage: "url(" + scene.masterAsset.src + ")",
                "--parallax-x": parallaxOffset.x + "px",
                "--parallax-y": parallaxOffset.y + "px",
              } as React.CSSProperties}
              aria-hidden="true"
            />
          ) : (
            <div className={styles.privateBackdrop} data-testid="scene-master" data-asset-id="privacy-door-only" aria-hidden="true" />
          )}
          {actionPreview && (
            <div
              key={actionPreview.assetId}
              className={styles.sceneActionPreview}
              data-testid="scene-action-preview"
              data-asset-id={actionPreview.assetId}
              style={{ backgroundImage: "url(" + actionPreview.src + ")" }}
              aria-hidden="true"
            />
          )}
          <SceneInteractions
            interactions={scene.interactions ?? []}
            routePoints={scene.routePoints}
            stateByInteractionId={sceneInteractionStateById}
            actorPosition={actorPosition}
          />
          {routeTransition?.fromPreview && (
            <img
              key={`${routeTransition.key}-from-scene`}
              className={`${styles.sceneTransitionLayer} ${styles.sceneTransitionSmokeOutgoing}`}
              src={routeTransition.fromPreview.src}
              style={{ "--formal-transition-total": `${routeTransition.effectiveDurationMs}ms` } as React.CSSProperties}
              data-testid="formal-scene-transition-outgoing"
              data-transition-scene-layer="outgoing"
              data-asset-id={routeTransition.fromPreview.assetId}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}
          {routeTransition?.toPreview && (
            <img
              key={`${routeTransition.key}-to-scene`}
              className={`${styles.sceneTransitionLayer} ${styles.sceneTransitionSmokeIncoming}`}
              src={routeTransition.toPreview.src}
              style={{ "--formal-transition-total": `${routeTransition.effectiveDurationMs}ms` } as React.CSSProperties}
              data-testid="formal-scene-transition-incoming"
              data-transition-scene-layer="incoming"
              data-asset-id={routeTransition.toPreview.assetId}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}
          <div className={styles.sceneTint} data-scene={sceneId} aria-hidden="true" />
          <div className={styles.stageAtmosphere} data-energy-band={lifeRuntime.energyBand} aria-label={`当前时段：${dayPhaseLabels[lifeRuntime.host.dayPhase]}`}>
            <span className={styles.stageAtmosphereDot} aria-hidden="true" />
            <span>{dayPhaseLabels[lifeRuntime.host.dayPhase]}</span>
            <i aria-hidden="true" />
            <span>{energyBandLabels[lifeRuntime.energyBand]}</span>
          </div>
          <div
            className={styles.stageLifeSignal}
            data-testid="stage-life-signal"
            data-scene-id={sceneId}
            data-activity={state}
            data-activity-running={Boolean(activeRuntimeActivity)}
            role="status"
            aria-live="polite"
            aria-label={`生活状态：${stageLifeSignal.label}。${stageLifeSignal.mood}`}
          >
            <span className={styles.stageLifeSignalIcon} aria-hidden="true">{stageLifeSignal.icon}</span>
            <span className={styles.stageLifeSignalCopy}>
              <small>生活状态 · {scene.label}</small>
              <strong>{stageLifeSignal.label}</strong>
              <em>{stageLifeSignal.mood}</em>
            </span>
            {activeRuntimeActivity && (
              <span className={styles.stageLifeSignalMeta} aria-hidden="true">
                <span className={styles.stageLifeSignalProgress}>
                  <i style={{ width: `${activityProgressPercent ?? 0}%` }} />
                </span>
                <small>{activityProgressLabel}</small>
              </span>
            )}
          </div>
          {sceneJourney && (
            <div
              className={styles.journeyRibbon}
              data-testid="scene-journey"
              data-journey-id={sceneJourney.id}
              data-journey-role={sceneJourney.legs[sceneJourney.index]?.role}
              data-from-scene-id={sceneJourney.fromSceneId}
              data-target-scene-id={sceneJourney.targetSceneId}
              aria-live="polite"
            >
              <span className={styles.journeyGlyph} aria-hidden="true">↝</span>
              <span className={styles.journeyCopy}>
                <small>
                  {formalEcologySceneManifest.scenes[sceneJourney.fromSceneId].label}
                  <b aria-hidden="true"> → </b>
                  {formalEcologySceneManifest.scenes[sceneJourney.targetSceneId].label}
                </small>
                <strong>{sceneJourney.legs[sceneJourney.index]?.label}</strong>
              </span>
              <span className={styles.journeyProgress} aria-label={`旅程第 ${sceneJourney.index + 1} 段，共 ${sceneJourney.legs.length} 段`}>
                {sceneJourney.legs.map((leg, index) => (
                  <i key={`${leg.sceneId}:${leg.routeId}:${index}`} data-active={index <= sceneJourney.index} />
                ))}
              </span>
              <em>{sceneJourney.index + 1}/{sceneJourney.legs.length}</em>
            </div>
          )}
          {stageVisualBeats.length > 0 && (
            <div className={styles.sceneAmbientLayer} data-testid="scene-ambient-layer" data-scene-id={sceneId} data-beat-count={stageVisualBeats.length} aria-hidden="true">
              {stageVisualBeats.map((beat) => (
                <span
                  key={beat.id}
                  className={styles.sceneAmbientBeat}
                  data-effect-id={beat.effectId}
                  data-intensity={beat.intensity ?? "subtle"}
                  data-beat-layer={beat.layer}
                  data-beat-scope={FULL_SCENE_VISUAL_EFFECTS.has(beat.effectId) ? "scene" : "local"}
                  style={{
                    "--beat-x": `${clampStagePercent(actorPosition.x * 100, 10, 90)}%`,
                    "--beat-y": `${clampStagePercent(actorPosition.y * 100, 18, 88)}%`,
                  } as React.CSSProperties}
                >
                  <i /><i /><i />
                </span>
              ))}
            </div>
          )}
          {activeRuntimeActivity?.id === "study-writing" && !routeTransition && (
            <div
              className={styles.writingFocusLayer}
              data-testid="writing-focus-layer"
              style={{ left: `${actorPosition.x * 100}%`, top: `${Math.max(16, actorPosition.y * 100 - 15)}%` }}
              aria-hidden="true"
            >
              <span className={styles.writingFocusHalo} />
              <span className={styles.writingFocusSpark}>✦</span>
              <span className={styles.writingFocusSpark}>·</span>
              <span className={styles.writingFocusSpark}>⌁</span>
            </div>
          )}
          {paperTearPulse > 0 && (
            <div key={paperTearPulse} className={styles.paperTearOverlay} data-testid="paper-tear-overlay" aria-hidden="true">
              <span className={styles.paperTearHand}>🖐️</span>
              <span className={styles.paperTearPiece}>▱</span>
              <span className={styles.paperTearPiece}>✧</span>
              <span className={styles.paperTearPiece}>·</span>
              <span className={styles.paperTearButterfly}>🦋</span>
            </div>
          )}
          <NovelistMotionActor
            activity={state}
            sceneId={sceneId}
            routeId={routeCommand.routeId}
            requestKey={routeCommand.token}
            // Speech is rendered once by the stage so it follows the room's
            // live route sample instead of the actor asset's transparent
            // canvas bounds.
            mood={null}
            showManuscriptParticles={showParticles || activeVisualBeats.some((beat) => beat.effectId === "manuscript-paper-burst")}
            paused={routePaused}
            transition={routeTransitionActor}
            onTap={handleActorTap}
            onLongPress={handleActorLongPress}
            visible={actorCanShow}
             onPositionChange={(sample) => {
               const activeRoute = getFormalSceneRoute(sceneId, routeCommand.routeId);
               const finalPointId = activeRoute?.points.at(-1)?.id ?? null;
               const arrivalTransition = activeRoute && finalPointId
                 ? getFormalSceneRouteTransition(activeRoute, finalPointId, "arrive")
                 : null;
               const arrivalKey = arrivalTransition && activeRoute
                 ? `${activeRoute.id}:${arrivalTransition.pointId}`
                 : null;
               const triggerProgress = arrivalTransition && activeRoute
                 ? transitionTriggerProgress(activeRoute, arrivalTransition)
                 : 1;
               const holdAtArrival = shouldHoldAtArrivalHandoff({
                 activeTransitionPhase: activeRouteTransitionRef.current?.phase,
                 activeTransitionPointId: activeRouteTransitionRef.current?.pointId,
                 finalPointId,
                 routeId: activeRoute?.id,
                 arrivalKey: arrivalTransitionRouteKeyRef.current,
                 progress: sample.progress,
                 triggerProgress,
               });
               if (!holdAtArrival) {
                 currentActorPointRef.current = sample.pointId;
                 setActorPosition({ x: sample.x, y: sample.y });
                 setActorPerspectiveScale(sample.stableScale);
                }

                const interactionRouteKey = `${sceneId}:${routeCommand.routeId}:${routeCommand.token}`;
                if (interactionEventRouteKeyRef.current !== interactionRouteKey) {
                  interactionEventRouteKeyRef.current = interactionRouteKey;
                  appliedInteractionEventKeysRef.current = new Set();
                }
                if (sample.progress !== undefined && activeRoute) {
                  for (const interactionEvent of activeRoute.interactionEvents ?? []) {
                    if (sample.progress < interactionEventTriggerProgress(activeRoute, interactionEvent)) continue;
                    const eventKey = `${interactionEvent.interactionId}:${interactionEvent.pointId}:${interactionEvent.stateId}`;
                    if (appliedInteractionEventKeysRef.current.has(eventKey)) continue;
                    appliedInteractionEventKeysRef.current.add(eventKey);
                    setSceneInteractionOverrides((currentOverrides) => ({
                      ...currentOverrides,
                      [`${sceneId}:${interactionEvent.interactionId}`]: interactionEvent.stateId,
                    }));
                  }
                }
              const motionCueKey = `${sceneId}:${routeCommand.routeId}:${routeCommand.token}`;
              if (
                sample.progress !== undefined
                && sample.progress > 0.015
                && motionCueRouteKeyRef.current !== motionCueKey
              ) {
                motionCueRouteKeyRef.current = motionCueKey;
                emitLifeCue(getSceneLifeCue(sceneId, "moving", {
                  actionId: activeRoute?.arriveActionId,
                }));
              }
               if (
                arrivalTransition
                && activeRoute
                && sample.progress !== undefined
                && sample.progress >= triggerProgress
                && arrivalKey !== arrivalTransitionRouteKeyRef.current
                && !activeRouteTransitionRef.current
              ) {
                arrivalTransitionRouteKeyRef.current = arrivalKey;
                beginRouteTransition(arrivalTransition, sceneId, activeRoute);
              }
            }}
            onTransition={(phase) => {
              if (!routePaused) {
                emitLifeCue(getSceneLifeCue(sceneId, "transition", {
                  actionId: currentAction?.id,
                  index: phase === "seat-to-stand" ? 0 : 1,
                }));
              }
            }}
            onPhaseChange={(phase) => {
              emitLifeEvent({
                type: "route-phase-changed",
                phaseId: phase.phaseId,
                actionId: phase.actionId,
                pointId: phase.pointId,
              });
              if (!routePaused) {
                emitLifeCue(getSceneLifeCue(sceneId, phase.holdAtPointId ? "activity" : "moving", {
                  actionId: phase.actionId,
                  index: phase.holdAtPointId ? 0 : 1,
                }));
              }
              if (sceneId !== "dining-kitchen" || routePaused) return;
              const phaseAction = formalEcologySceneManifest.scenes["dining-kitchen"].actions[phase.actionId];
              // Only a stationary milestone may overlay its same-scene
              // transparent actor. Moving phases keep the clean master; they
              // never fall back to a generic cross-scene paper doll.
              setActionPreview(phase.holdAtPointId && phaseAction?.preview?.transparentOverlay
                ? phaseAction.preview
                : null);
            }}
              onArrival={(arrival) => {
                const arrivedScene = formalEcologySceneManifest.scenes[arrival.sceneId];
                const arrivedAction = arrivedScene.actions[arrival.actionId];
                const arrivedRoute = getFormalSceneRoute(arrival.sceneId, arrival.routeId);
                emitLifeEvent({
                  type: "route-arrived",
                  routeKey: arrival.routeId,
                  anchor: arrival.pointId,
                  sceneId: arrival.sceneId,
                  actionId: arrival.actionId,
                  ...(activeLifeIntentIdRef.current ? { intentId: activeLifeIntentIdRef.current } : {}),
                });
                emitLifeCue(getSceneLifeCue(arrival.sceneId, "arrival", {
                 actionId: arrival.actionId,
               }));
                // The arrival smoke is triggered at the penultimate point by
                // onPositionChange. The motion timer can still reach the
                // final point while that smoke is playing, so do not replace
                // the active transition with an immediate stable-state render.
                if (activeRouteTransitionRef.current?.phase === "arrive") return;
                // A one-point initial reveal is owned by its departure smoke;
                // the actor's immediate onArrival must not cancel it.
               if (activeRouteTransitionRef.current?.phase === "depart" && arrivedRoute?.points.length === 1) return;
               const arrivedRouteTransition = getFormalSceneRouteTransition(arrivedRoute, arrival.pointId, "arrive");
               const arrivedTransitionKey = arrivedRouteTransition && arrivedRoute
                 ? `${arrivedRoute.id}:${arrivedRouteTransition.pointId}`
                 : null;
               if (arrivedRouteTransition && arrivedTransitionKey !== arrivalTransitionRouteKeyRef.current) {
                  beginRouteTransition(arrivedRouteTransition, arrival.sceneId, arrivedRoute);
                 return;
               }
               if (advanceSceneJourney(arrival.sceneId, arrival.routeId)) return;
               // The three study states are now formal full-scene composites.
              // They replace the moving transparent actor only after arrival;
              // the actor remains visible during the actual route preview.
               setActionPreview(arrival.sceneId === "study"
                 ? arrivedAction?.preview ?? null
                 : arrivedAction?.actorAsset ? null : arrivedAction?.preview ?? null);
                const skipArrivalActivity = Boolean(
                  arrivedRoute
                  && skipArrivalActivityRouteRef.current?.sceneId === arrival.sceneId
                  && skipArrivalActivityRouteRef.current.routeId === arrivedRoute.id,
                );
                if (skipArrivalActivity) {
                  skipArrivalActivityRouteRef.current = null;
                } else {
                  startLifeActivity(arrival.sceneId, arrival.actionId);
                }
              }}
           />
          {routeTransition && (
            <div
              key={routeTransition.key}
              className={styles.routeSmoke}
              style={{
                left: `${actorPosition.x * 100}%`,
                top: `${actorPosition.y * 100}%`,
                "--route-smoke-duration": `${routeTransition.effectiveDurationMs}ms`,
                "--route-smoke-scale": actorPerspectiveScale,
              } as React.CSSProperties}
              data-testid="formal-route-smoke"
              data-transition-phase={routeTransition.phase}
              data-transition-point={routeTransition.pointId}
              data-transition-scene={sceneId}
              data-transition-anchor="actor"
              aria-hidden="true"
            >
              <span className={styles.routeSmokeGlow} />
              <img src={WHITE_SMOKE_ASSET_SRC} alt="" className={styles.routeSmokePuff} draggable={false} />
            </div>
          )}
          {systemHandActive && (
            <div className={styles.systemHandOverlay} data-testid="system-hand-overlay" aria-hidden="true">
              <span>🖐️</span>
              <small>系统大手</small>
            </div>
          )}
          {!scene.masterAsset && <div className={styles.privateNotice} role="note">浴室只保留门外提示；离场后才允许静态陈设调查。</div>}
          {scene.masterAsset?.status === "candidate" && <div className={styles.assetNotice} role="note">候选场景画布 · 等待统一家居蓝图复核</div>}
          <div
            className={styles.dayTimeline}
            data-testid="day-timeline"
            data-phase={clockPhase}
            aria-label={`今日时间进度：${clockLabel}，${dayPhaseLabels[clockPhase]}`}
          >
            <div className={styles.dayTimelineHeader}>
              <span><i aria-hidden="true" />今日时间</span>
              <strong>{clockLabel}</strong>
              <em>{dayPhaseLabels[clockPhase]}</em>
            </div>
            <div className={styles.dayTimelineTrack}>
              <span className={styles.dayTimelineRail} aria-hidden="true" />
              <span className={styles.dayTimelineProgress} style={{ width: `${clockProgress}%` }} aria-hidden="true" />
              <span className={styles.dayTimelineNow} style={{ left: `${clockProgress}%` }} aria-hidden="true">
                <span className={styles.dayTimelineNowMark} />
              </span>
              {dayPhaseOrder.map((phase) => (
                <span
                  key={phase}
                  className={styles.dayTimelinePhase}
                  data-day-phase-marker=""
                  data-phase={phase}
                  data-current={clockPhase === phase}
                  style={{ left: `${(dayPhaseStartMinutes[phase] / (24 * 60)) * 100}%` }}
                  aria-hidden="true"
                >
                  <PhaseIconSvg phase={phase} />
                  <small>{dayPhaseLabels[phase]}</small>
                </span>
              ))}
            </div>
            <div className={styles.dayTimelineScale} aria-hidden="true"><span>00:00</span><span>24:00</span></div>
          </div>
        </section>

      </div>
      {interventionOpen && (
        <aside className={styles.interventionPanel} data-testid="intervention-panel" role="dialog" aria-label="系统大手干预">
          <div className={styles.interventionHeader}>
            <span className={styles.interventionHand} aria-hidden="true">🖐️</span>
            <div><strong>系统大手 · 只在你伸手时出现</strong><small>当前路线不会被悄悄改写；你明确选择后才会干预。</small></div>
            <button type="button" onClick={() => setInterventionOpen(false)} aria-label="关闭干预面板">×</button>
          </div>
          <div className={styles.interventionActions}>
            <button type="button" onClick={() => confirmNeed("fatigue")}><span>🛏️</span><strong>让他回卧室</strong><small>保留正在写的念头</small></button>
            <button type="button" onClick={() => command("study", "writing", "study-desk-stay", "系统把他轻轻按回书桌。")}><span>✍️</span><strong>抓回书桌</strong><small>优先完成当前句子</small></button>
            <button type="button" onClick={() => showNeed("stuck")}><span>🌙</span><strong>先去透气</strong><small>只提示，不替他做决定</small></button>
            <button type="button" onClick={triggerPaperTear}><span>🦋</span><strong>撕掉一张废稿</strong><small>纸屑会留下灵感</small></button>
          </div>
          {suspendedLifeIntentIdRef.current && (
            <button type="button" className={styles.interventionResume} onClick={resumeSuspendedIntent}>恢复被打断的生活意图</button>
          )}
        </aside>
      )}
    </main>
  );
}
