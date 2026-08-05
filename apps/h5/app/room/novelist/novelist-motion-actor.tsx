"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  canRenderFormalActor,
  formalEcologySceneManifest,
  getCharacterReferenceForAction,
  getFormalSceneAction,
  getFormalSceneActionAssembly,
  getFormalSceneRoute,
  getFormalSceneRoutePhase,
  getFormalSceneRuntimeGate,
  type FormalActorMode,
  type FormalFacingDirection,
  type NovelistFormalActorAsset,
  type FormalSceneId,
  type NovelistActivity,
  type NovelistRoutePhase,
  type NovelistRoutePoint,
} from "./scene-manifest";
import {
  SceneForegroundOcclusion,
} from "./scene-foreground";
import type { LifeCue } from "./life-rhythm";
import motionStyles from "./novelist-motion-actor.module.css";

export type NovelistMotionActivity = NovelistActivity;
export type FacingDirection = FormalFacingDirection;

export const MOVE_DURATION_MS = 1200;
export const DIRECTION_TURN_MS = 360;
/** Kept for callers that imported the old constant; study now uses a full-route walk. */
export const WALK_PHASE_RATIO = 0;

export type ActorPoint = Pick<NovelistRoutePoint, "x" | "y">;

export type ActorRouteSample = ActorPoint & {
  pointId: string;
  facing: FacingDirection;
  stableScale: number;
  /** Normalized route progress, exposed so scene-local effects can follow the same clock. */
  progress?: number;
};

export type NovelistMotionArrival = {
  sceneId: FormalSceneId;
  routeId: string;
  pointId: string;
  actionId: string;
};

export type NovelistTransitionPhase = "seat-to-stand" | "stand-to-seat";

export type NovelistMotionPhaseChange = {
  phaseId: string;
  actionId: string;
  progress: number;
  pointId: string;
  holdAtPointId: string | undefined;
};

/**
 * The formal room consumes the same two-card handoff used by the route editor.
 * Scene composites are rendered by the room; actor assets are rendered here so
 * occlusion and the contact shadow continue to use the ordinary actor stack.
 */
export type NovelistMotionActorTransition = {
  key: number;
  phase: "depart" | "arrive";
  durationMs: number;
  turns?: number;
  settleMs?: number;
  fromFacing?: FacingDirection;
  toFacing?: FacingDirection;
  fromMode?: "scene" | "actor" | "none";
  toMode?: "scene" | "actor" | "none";
  fromAsset?: Pick<NovelistFormalActorAsset, "assetId" | "src" | "alt" | "width" | "height" | "nativeFacing" | "alphaBottom" | "assetScale"> | null;
  toAsset?: Pick<NovelistFormalActorAsset, "assetId" | "src" | "alt" | "width" | "height" | "nativeFacing" | "alphaBottom" | "assetScale"> | null;
};

export const DEFAULT_ACTOR_FRAME_WIDTH = 1024;
export const DEFAULT_ACTOR_FRAME_HEIGHT = 1536;
export const DEFAULT_ACTOR_ALPHA_BOTTOM = 0.894;

/**
 * Keep the formal actor frame on the source bitmap's natural aspect ratio.
 * The route editor sizes its actor wrapper from width + height:auto; using a
 * fixed 1024×1536 frame here makes the cropped terrace cards appear at a
 * different visual scale even when the route and asset multipliers match.
 */
export function actorAssetFrameRatio(
  asset: Pick<NovelistFormalActorAsset, "width" | "height"> | null | undefined,
): string {
  const width = Number.isFinite(asset?.width) && (asset?.width ?? 0) > 0
    ? asset!.width
    : DEFAULT_ACTOR_FRAME_WIDTH;
  const height = Number.isFinite(asset?.height) && (asset?.height ?? 0) > 0
    ? asset!.height
    : DEFAULT_ACTOR_FRAME_HEIGHT;
  return `${width} / ${height}`;
}

/**
 * Arrival smoke is intentionally allowed to begin at the last authored bend
 * so the outgoing card has time to disappear before the scene state is shown.
 * Once that handoff is active, later requestAnimationFrame samples must not
 * move the stable actor back through the final segment. Otherwise the incoming
 * state appears at the smoke anchor and then visibly jumps to the terminal
 * waypoint when the handoff finishes.
 */
export function shouldHoldAtArrivalHandoff({
  activeTransitionPhase,
  activeTransitionPointId,
  finalPointId,
  routeId,
  arrivalKey,
  progress,
  triggerProgress,
}: {
  activeTransitionPhase: NovelistMotionActorTransition["phase"] | null | undefined;
  activeTransitionPointId: string | null | undefined;
  finalPointId: string | null | undefined;
  routeId: string | null | undefined;
  arrivalKey: string | null | undefined;
  progress: number | undefined;
  triggerProgress: number;
}): boolean {
  return Boolean(
    finalPointId
    && routeId
    && arrivalKey === `${routeId}:${finalPointId}`
    && activeTransitionPhase === "arrive"
    && activeTransitionPointId === finalPointId
    && progress !== undefined
    && progress >= triggerProgress,
  );
}

type NovelistMotionActorProps = {
  activity: NovelistMotionActivity;
  sceneId?: FormalSceneId;
  routeId?: string;
  /** Increment when the same route should be replayed from its first waypoint. */
  requestKey?: number;
  /** Structured life cue; strings remain accepted for older callers. */
  mood?: LifeCue | string | null;
  showManuscriptParticles?: boolean;
  visible?: boolean;
  paused?: boolean;
  onArrival?: (arrival: NovelistMotionArrival) => void;
  onPositionChange?: (sample: ActorRouteSample) => void;
  onTransition?: (phase: NovelistTransitionPhase) => void;
  onPhaseChange?: (phase: NovelistMotionPhaseChange) => void;
  onTap?: () => void;
  onLongPress?: () => void;
  transition?: NovelistMotionActorTransition | null;
};

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress));
}

/**
 * A grounded walk eases only the route progress. The actor's contact point
 * remains on the floor while acceleration and braking happen, so no CSS
 * animation has to lift the paper base away from its shadow.
 */
export function easeGroundedWalkProgress(progress: number) {
  const clamped = clampProgress(progress);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

export function getTravelFacing(start: ActorPoint, end: ActorPoint, fallback: FacingDirection = "left"): FacingDirection {
  const deltaX = end.x - start.x;
  if (Math.abs(deltaX) < 0.01) return fallback;
  return deltaX > 0 ? "right" : "left";
}

/**
 * Interpolate along a polyline rather than teleporting between furniture
 * anchors. Progress is distance based, so a long corridor segment does not
 * consume a different visual speed merely because it has fewer waypoints.
 */
export function interpolateRoute(points: readonly ActorPoint[], progress: number): ActorPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) {
    const point = points[0]!;
    return { x: point.x, y: point.y };
  }

  const distances = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);
  if (totalDistance === 0) return { ...points[points.length - 1]! };

  let remaining = clampProgress(progress) * totalDistance;
  for (let index = 0; index < distances.length; index += 1) {
    const segmentDistance = distances[index]!;
    const start = points[index]!;
    const end = points[index + 1]!;
    if (remaining <= segmentDistance || index === distances.length - 1) {
      const localProgress = segmentDistance === 0 ? 1 : remaining / segmentDistance;
      return {
        x: start.x + (end.x - start.x) * localProgress,
        y: start.y + (end.y - start.y) * localProgress,
      };
    }
    remaining -= segmentDistance;
  }
  return { ...points[points.length - 1]! };
}

/**
 * Sample only the visual contract already registered by the route manifest.
 * Position, stable scale, facing, and the active contact point all come from
 * explicit waypoints; callers never invent a destination from a raw click.
 */
export function interpolateRouteVisual(points: readonly NovelistRoutePoint[], progress: number): ActorRouteSample {
  if (points.length === 0) return { x: 0, y: 0, pointId: "", facing: "left", stableScale: 1 };
  if (points.length === 1) {
    const point = points[0]!;
    return { x: point.x, y: point.y, pointId: point.id, facing: point.facing, stableScale: point.stableScale };
  }

  const distances = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);
  if (totalDistance === 0) {
    const point = points[points.length - 1]!;
    return { x: point.x, y: point.y, pointId: point.id, facing: point.facing, stableScale: point.stableScale };
  }

  let remaining = clampProgress(progress) * totalDistance;
  for (let index = 0; index < distances.length; index += 1) {
    const segmentDistance = distances[index]!;
    const start = points[index]!;
    const end = points[index + 1]!;
    if (remaining <= segmentDistance || index === distances.length - 1) {
      const localProgress = segmentDistance === 0 ? 1 : remaining / segmentDistance;
      return {
        x: start.x + (end.x - start.x) * localProgress,
        y: start.y + (end.y - start.y) * localProgress,
        pointId: localProgress < 0.5 ? start.id : end.id,
        // A shared waypoint cannot define both its incoming and outgoing
        // direction. During travel, the segment geometry is authoritative;
        // the explicit point facing is only the fallback for near-vertical
        // segments and stable one-point routes.
        facing: getTravelFacing(start, end, start.facing),
        stableScale: start.stableScale + (end.stableScale - start.stableScale) * localProgress,
      };
    }
    remaining -= segmentDistance;
  }

  const point = points[points.length - 1]!;
  return { x: point.x, y: point.y, pointId: point.id, facing: point.facing, stableScale: point.stableScale };
}

function phaseRoutePoints(
  points: readonly NovelistRoutePoint[],
  phase: NovelistRoutePhase,
): readonly NovelistRoutePoint[] | null {
  if (!phase.pathStartPointId || !phase.pathEndPointId) return null;

  const startIndex = points.findIndex((point) => point.id === phase.pathStartPointId);
  const endIndex = points.findIndex((point) => point.id === phase.pathEndPointId);

  // A resumed route may begin after the authored phase start. In that case,
  // the live route slice already starts at the correct current position.
  if (startIndex < 0 && endIndex >= 0) return points.slice(0, endIndex + 1);
  if (startIndex >= 0 && endIndex < 0) return points.slice(startIndex);
  if (startIndex < 0 || endIndex < 0) return null;
  if (startIndex <= endIndex) return points.slice(startIndex, endIndex + 1);
  return points.slice(endIndex, startIndex + 1).reverse();
}

/**
 * Sample an explicit business phase. Movement phases name their two anchors;
 * stationary phases name the floor point where the actor must remain. This
 * keeps the serve/stop/settle beats from being mistaken for a teleport.
 */
export function interpolateRoutePhase(
  points: readonly NovelistRoutePoint[],
  phase: NovelistRoutePhase,
  progress: number,
): ActorRouteSample {
  const holdPoint = phase.holdAtPointId
    ? points.find((point) => point.id === phase.holdAtPointId)
    : undefined;
  if (holdPoint) {
    return {
      x: holdPoint.x,
      y: holdPoint.y,
      pointId: holdPoint.id,
      facing: holdPoint.facing,
      stableScale: holdPoint.stableScale,
    };
  }

  const pathStart = phase.pathStartPointId
    ? points.find((point) => point.id === phase.pathStartPointId)
    : undefined;
  const pathEnd = phase.pathEndPointId
    ? points.find((point) => point.id === phase.pathEndPointId)
    : undefined;
  if (!pathStart || !pathEnd) return interpolateRouteVisual(points, progress);

  const phaseSpan = Math.max(0.0001, phase.endProgress - phase.startProgress);
  const localProgress = clampProgress((progress - phase.startProgress) / phaseSpan);
  return interpolateRouteVisual(phaseRoutePoints(points, phase) ?? [pathStart, pathEnd], localProgress);
}

function clearTimer(timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timer.current) {
    clearTimeout(timer.current);
    timer.current = null;
  }
}

function clearAnimationFrame(frame: React.MutableRefObject<number | null>) {
  if (frame.current !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(frame.current);
    frame.current = null;
  }
}

export function NovelistMotionActor({
  activity,
  sceneId = "study",
  routeId,
  requestKey = 0,
  mood = null,
  showManuscriptParticles = false,
  visible = true,
  paused = false,
  onArrival,
  onPositionChange,
  onTransition,
  onPhaseChange,
  onTap,
  onLongPress,
  transition = null,
}: NovelistMotionActorProps) {
  const scene = formalEcologySceneManifest.scenes[sceneId];
  const initialPoint = scene.routePoints.find((point) => point.id === scene.playerStart) ?? scene.routePoints[0]!;
  const initialPointFacing = initialPoint?.facing ?? "left";
  const [mode, setMode] = useState<FormalActorMode>(activity === "writing" ? "seated" : "standing");
  const [currentPointId, setCurrentPointId] = useState(initialPoint?.id ?? "");
  const [actorPos, setActorPos] = useState<ActorPoint>({ x: initialPoint?.x ?? 0.5, y: initialPoint?.y ?? 0.75 });
  const [facing, setFacing] = useState<FacingDirection>(initialPointFacing);
  const [actorScale, setActorScale] = useState(initialPoint?.stableScale ?? 1);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipFromFacing, setFlipFromFacing] = useState<FacingDirection>(initialPointFacing);
  const [flipToFacing, setFlipToFacing] = useState<FacingDirection>(initialPointFacing);
  const [isMoving, setIsMoving] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | undefined>();
  const [activePhaseId, setActivePhaseId] = useState<string | undefined>();

  const actorPositionRef = useRef(actorPos);
  const moveFrameRef = useRef<number | null>(null);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopWobbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<FormalActorMode>(mode);
  const facingRef = useRef<FacingDirection>(initialPointFacing);
  const phaseRef = useRef<string | undefined>(undefined);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onPositionChangeRef = useRef(onPositionChange);
  const mountedRouteRef = useRef(false);
  const mountedSceneRef = useRef<FormalSceneId | undefined>(undefined);
  const currentPointRef = useRef(initialPoint?.id ?? "");
  onPhaseChangeRef.current = onPhaseChange;
  onPositionChangeRef.current = onPositionChange;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onTap && !onLongPress) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress?.();
      longPressTimerRef.current = null;
    }, 560);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!longPressTriggeredRef.current) onTap?.();
  };

  const handlePointerCancel = () => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
  };

  const setPosition = (next: ActorPoint) => {
    actorPositionRef.current = next;
    setActorPos(next);
  };

  useEffect(() => {
    clearTimer(moveTimerRef);
    clearTimer(stopWobbleTimerRef);
    clearTimer(flipTimerRef);
    clearAnimationFrame(moveFrameRef);
    setIsFlipping(false);

    const route = getFormalSceneRoute(sceneId, routeId);
    if (!route || route.points.length === 0) return;

    const firstPoint = route.points[0]!;
    const lastPoint = route.points[route.points.length - 1]!;
    const hadMountedRoute = mountedRouteRef.current;
    const preserveCurrentPosition = mountedRouteRef.current && mountedSceneRef.current === sceneId;
    const currentPosition = actorPositionRef.current;
    const currentPointId = currentPointRef.current;
    const routePointIndex = route.points.findIndex((point) => point.id === currentPointId);
    const routePointsFromCurrent = preserveCurrentPosition && routePointIndex > 0
      ? route.points.slice(routePointIndex)
      : route.points;
    const motionRouteStartPoint = routePointsFromCurrent[0]!;
    const currentPointIsSynthetic = currentPointId === "current-position";
    const needsLiveCoordinate = preserveCurrentPosition
      && !currentPointIsSynthetic
      && (currentPosition.x !== motionRouteStartPoint.x || currentPosition.y !== motionRouteStartPoint.y);
    const motionPoints = needsLiveCoordinate
      ? [{ ...motionRouteStartPoint, id: currentPointId, x: currentPosition.x, y: currentPosition.y, contactPoint: currentPosition }, ...routePointsFromCurrent]
      : routePointsFromCurrent;
    const motionStartPoint = motionPoints[0]!;
    mountedRouteRef.current = true;
    mountedSceneRef.current = sceneId;
    const arrivalAction = getFormalSceneAction(sceneId, activity, route.arriveActionId);
    const initialPhase = getFormalSceneRoutePhase(route, 0);
    const firstTravelFacing = motionPoints.length > 1
      ? getTravelFacing(motionStartPoint, motionPoints[1]!, firstPoint.facing)
      : firstPoint.facing;
    const initialFacing = initialPhase?.cameraFacing ?? arrivalAction?.cameraFacing ?? firstTravelFacing;
    const previousFacing = facingRef.current;
    if (hadMountedRoute && previousFacing !== initialFacing) {
      setFlipFromFacing(previousFacing);
      setFlipToFacing(initialFacing);
      setIsFlipping(true);
      flipTimerRef.current = setTimeout(() => setIsFlipping(false), DIRECTION_TURN_MS);
    }
    setFacing(initialFacing);
    facingRef.current = initialFacing;
    setCurrentPointId(motionStartPoint.id);
    currentPointRef.current = motionStartPoint.id;
    setActorScale(motionStartPoint.stableScale);
    setActiveActionId(initialPhase?.actionId ?? arrivalAction?.id ?? route.arriveActionId);
    setActivePhaseId(initialPhase?.id);
    phaseRef.current = initialPhase?.id;
    setPosition(motionStartPoint);
    onPositionChangeRef.current?.({
      x: motionStartPoint.x,
      y: motionStartPoint.y,
      pointId: motionStartPoint.id,
      facing: motionStartPoint.facing,
      stableScale: motionStartPoint.stableScale,
      progress: 0,
    });

    if (paused) {
      setIsMoving(false);
      setIsSettling(false);
      setMode(initialPhase?.actorMode ?? arrivalAction?.actorMode ?? "standing");
      modeRef.current = initialPhase?.actorMode ?? arrivalAction?.actorMode ?? "standing";
      return;
    }

    if (initialPhase) {
      onPhaseChangeRef.current?.({
        phaseId: initialPhase.id,
        actionId: initialPhase.actionId,
        progress: 0,
        pointId: motionStartPoint.id,
        holdAtPointId: initialPhase.holdAtPointId,
      });
    }

    if (motionPoints.length < 2) {
      setIsMoving(false);
      setIsSettling(false);
      const nextMode = arrivalAction?.actorMode ?? (activity === "writing" ? "seated" : "standing");
      if (modeRef.current !== "seated" && nextMode === "seated") onTransition?.("stand-to-seat");
      setMode(nextMode);
      modeRef.current = nextMode;
      setActiveActionId(arrivalAction?.id ?? route.arriveActionId);
      setActivePhaseId(undefined);
      onArrival?.({ sceneId, routeId: route.id, pointId: firstPoint.id, actionId: arrivalAction?.id ?? route.arriveActionId });
      return;
    }

    if (modeRef.current === "seated") onTransition?.("seat-to-stand");
    setMode("walking");
    modeRef.current = "walking";
    setIsMoving(true);
    setIsSettling(false);

    const duration = route.durationMs || MOVE_DURATION_MS;

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const animate = (now: number) => {
      const elapsed = now - startedAt;
      const progress = clampProgress(elapsed / duration);
      const routeProgress = route.motion?.profile === "grounded-walk"
        ? easeGroundedWalkProgress(progress)
        : progress;
      const phase = getFormalSceneRoutePhase(route, routeProgress);
      const sample = phase
        ? interpolateRoutePhase(motionPoints, phase, routeProgress)
        : interpolateRouteVisual(motionPoints, routeProgress);
      const sampleWithProgress = { ...sample, progress };
      setPosition(sampleWithProgress);
      setActorScale(sampleWithProgress.stableScale);
      setCurrentPointId(sampleWithProgress.pointId);
      currentPointRef.current = sampleWithProgress.pointId;
      onPositionChangeRef.current?.(sampleWithProgress);
      setActiveActionId(phase?.actionId ?? arrivalAction?.id ?? route.arriveActionId);
      setActivePhaseId(phase?.id);
      if (phase && phase.id !== phaseRef.current) {
        phaseRef.current = phase.id;
        onPhaseChangeRef.current?.({
          phaseId: phase.id,
          actionId: phase.actionId,
          progress: routeProgress,
          pointId: sample.pointId,
          holdAtPointId: phase.holdAtPointId,
        });
      }
      const visualFacing = phase?.cameraFacing ?? sample.facing;
      if (visualFacing !== facingRef.current) {
        const previousFacing = facingRef.current;
        setFlipFromFacing(previousFacing);
        setFlipToFacing(visualFacing);
        facingRef.current = visualFacing;
        setFacing(visualFacing);
        clearTimer(flipTimerRef);
        setIsFlipping(true);
        flipTimerRef.current = setTimeout(() => setIsFlipping(false), DIRECTION_TURN_MS);
      }
      if (progress < 1 && typeof window !== "undefined") {
        moveFrameRef.current = window.requestAnimationFrame(animate);
      }
    };
    if (typeof window !== "undefined") {
      moveFrameRef.current = window.requestAnimationFrame(animate);
    }

    moveTimerRef.current = setTimeout(() => {
      clearAnimationFrame(moveFrameRef);
      setPosition(lastPoint);
      setActorScale(lastPoint.stableScale);
      setCurrentPointId(lastPoint.id);
      currentPointRef.current = lastPoint.id;
      onPositionChangeRef.current?.({
        x: lastPoint.x,
        y: lastPoint.y,
        pointId: lastPoint.id,
        facing: lastPoint.facing,
        stableScale: lastPoint.stableScale,
        progress: 1,
      });
      const arrivalFacing = arrivalAction?.cameraFacing ?? (motionPoints.length > 1
        ? getTravelFacing(motionPoints[motionPoints.length - 2]!, lastPoint, lastPoint.facing)
        : lastPoint.facing);
      if (arrivalFacing !== facingRef.current) {
        const previousFacing = facingRef.current;
        setFlipFromFacing(previousFacing);
        setFlipToFacing(arrivalFacing);
        clearTimer(flipTimerRef);
        setIsFlipping(true);
        flipTimerRef.current = setTimeout(() => setIsFlipping(false), DIRECTION_TURN_MS);
      }
      facingRef.current = arrivalFacing;
      setFacing(arrivalFacing);
      setIsMoving(false);
      setIsSettling(true);
      const nextMode = arrivalAction?.actorMode ?? "standing";
      if (modeRef.current !== "seated" && nextMode === "seated") onTransition?.("stand-to-seat");
      setMode(nextMode);
      modeRef.current = nextMode;
      setActiveActionId(arrivalAction?.id ?? route.arriveActionId);
      setActivePhaseId(undefined);
      onArrival?.({ sceneId, routeId: route.id, pointId: lastPoint.id, actionId: arrivalAction?.id ?? route.arriveActionId });
      stopWobbleTimerRef.current = setTimeout(() => setIsSettling(false), route.motion?.settleMs ?? 220);
    }, duration);

    return () => {
      clearTimer(moveTimerRef);
      clearTimer(stopWobbleTimerRef);
      clearTimer(flipTimerRef);
      clearAnimationFrame(moveFrameRef);
    };
  }, [activity, paused, sceneId, routeId, requestKey]);

  useEffect(() => () => {
    clearLongPressTimer();
    clearTimer(moveTimerRef);
    clearTimer(stopWobbleTimerRef);
    clearTimer(flipTimerRef);
    clearAnimationFrame(moveFrameRef);
  }, []);

  const route = getFormalSceneRoute(sceneId, routeId);
  const activePhase = route?.phases?.find((phase) => phase.id === activePhaseId);
  const activeAction = getFormalSceneAction(sceneId, activity, activeActionId ?? route?.arriveActionId);
  const actorMode = activePhase?.actorMode ?? (isMoving ? "walking" : mode);
  // Manuscript particles belong to the study writing state. Keep this final
  // guard at the actor boundary because the room caller derives the flag from
  // short-lived visual beats; a stale beat must not leak writing glyphs into a
  // dining route or its carry-bowl handoff.
  const renderManuscriptParticles = showManuscriptParticles
    && sceneId === "study"
    && activity === "writing";
  // Dining uses scene-local action assets when a route phase has one (for
  // example the full-bowl carry asset). Ordinary entry/exit travel is still a
  // normal walking actor; it must not inherit a full-scene composite or the
  // previous action's prop. This keeps the hot-soup prop exclusive to the
  // counter ↔ table handoff.
  const actorAssetCandidate = sceneId === "dining-kitchen"
    ? activeAction?.actorAsset ?? (actorMode === "walking" ? formalEcologySceneManifest.walkingActorAssets[facing] : null)
    : actorMode === "walking"
      ? formalEcologySceneManifest.walkingActorAssets[facing]
      : activeAction?.actorAsset ?? formalEcologySceneManifest.actorAssets[actorMode];
  const sceneGate = getFormalSceneRuntimeGate(sceneId);
  const actionAssembly = getFormalSceneActionAssembly(sceneId, activeAction?.id);
  const runtimeActorReady = canRenderFormalActor(sceneId, activeAction?.id)
    && Boolean(actorAssetCandidate?.runtimeAsset)
    && actorAssetCandidate?.visualContractStatus === "approved";
  // Study now has approved 2:1 arrival composites plus audited transparent
  // action PNGs for the path preview. Keep the scene gate honest while still
  // allowing the actor to travel between the three formal state images; the
  // independent shadow-alpha gate remains visible in data-runtime-gate.
  const studyPreviewActorReady = sceneId === "study"
    && actionAssembly?.status === "ready"
    && Boolean(actorAssetCandidate?.runtimeAsset)
    && actorAssetCandidate?.visualContractStatus === "approved";
  // Dining's explicit carry asset is scene-local; the generic walking asset is
  // allowed only for ordinary empty-handed travel phases.
  const diningPreviewActorReady = sceneId === "dining-kitchen" && Boolean(actorAssetCandidate?.src);
  // Bedroom route geometry is now available in the 3000 preview, but its
  // scene-state composites and alpha package are not promoted to runtime yet.
  // Keep the ordinary walking actor visible between bedroom anchors without
  // pretending that the state assets are transparent runtime actors.
  const bedroomPreviewActorReady = sceneId === "bedroom"
    && actorMode === "walking"
    && Boolean(actorAssetCandidate?.src);
  // Published snapshots are the formal runtime boundary for all five route
  // editor scenes. Their transparent actor cards are allowed to render even
  // when the older alpha-package contract is still marked preview-only.
  const publishedRouteActorReady = Boolean(route?.publishedFromSnapshot && actorAssetCandidate?.src);
  const previewActorReady = studyPreviewActorReady || diningPreviewActorReady || bedroomPreviewActorReady || publishedRouteActorReady;
  const actorAsset = runtimeActorReady
    ? actorAssetCandidate
    : studyPreviewActorReady
      ? actorAssetCandidate
      : diningPreviewActorReady
        ? actorAssetCandidate
          : bedroomPreviewActorReady
          ? actorAssetCandidate
          : publishedRouteActorReady
            ? actorAssetCandidate
          : null;
  const transitionFromAsset = transition?.fromAsset ?? ((transition?.fromMode === "actor" || (!transition?.fromMode && transition?.phase === "arrive")) && actorAsset ? {
    assetId: actorAsset.assetId,
    src: actorAsset.src,
    alt: actorAsset.alt,
    width: actorAsset.width,
    height: actorAsset.height,
    nativeFacing: actorAsset.nativeFacing,
    alphaBottom: actorAsset.alphaBottom,
    assetScale: actorAsset.assetScale,
  } : null);
  const transitionToAsset = transition?.toAsset ?? ((transition?.toMode === "actor" || (!transition?.toMode && transition?.phase === "depart")) && actorAsset ? {
    assetId: actorAsset.assetId,
    src: actorAsset.src,
    alt: actorAsset.alt,
    width: actorAsset.width,
    height: actorAsset.height,
    nativeFacing: actorAsset.nativeFacing,
    alphaBottom: actorAsset.alphaBottom,
    assetScale: actorAsset.assetScale,
  } : null);
  const transitionActorActive = Boolean(transition && (transitionFromAsset || transitionToAsset));
  const actorRenderRole = runtimeActorReady ? "runtime" : previewActorReady ? "preview-only" : "none";
  const activeAssetSource = actorAsset?.src ?? actorAssetCandidate?.src;
  const precomposedWalkingSources = [
    formalEcologySceneManifest.walkingActorAssets.left.src,
    formalEcologySceneManifest.walkingActorAssets.right.src,
  ];
  // Only the two pre-rendered walking views bypass CSS mirroring. A
  // scene-local transparent action asset (carry bowl, attic card, etc.) is one
  // bitmap with a canonical nativeFacing and must remain mirrorable.
  const usesDirectionalAsset = actorMode === "walking"
    && Boolean(activeAssetSource && precomposedWalkingSources.includes(activeAssetSource));
  const directionalTurnActive = usesDirectionalAsset && isFlipping && flipFromFacing !== flipToFacing;
  const flipOutgoingAsset = directionalTurnActive
    ? formalEcologySceneManifest.walkingActorAssets[flipFromFacing]
    : null;
  const flipIncomingAsset = directionalTurnActive
    ? formalEcologySceneManifest.walkingActorAssets[flipToFacing]
    : null;
  const actorFrameAsset = transitionToAsset
    ?? flipIncomingAsset
    ?? actorAsset
    ?? actorAssetCandidate;
  const referenceId = getCharacterReferenceForAction(activity, facing);
  const characterReference = sceneId === "dining-kitchen"
    ? {
      ...formalEcologySceneManifest.characterReferences[referenceId],
      assetId: "dining-kitchen-serve-red-bean-soup-actor-reference",
      src: "/assets/ecology/formal-scenes/dining-kitchen/kitchen-counter/carry-bowl-transparent-actor-v1.png",
      purpose: "餐厨专属角色资产锚点；禁止回退到 study/global 纸人",
    }
    : formalEcologySceneManifest.characterReferences[referenceId];
  const prop = runtimeActorReady && actionAssembly?.actionPropAlpha?.approvedForRuntime
    ? activeAction?.prop
    : null;
  const foregroundOcclusionPolicy = activePhase?.foregroundOcclusionPolicy ?? "none";
  // Transparent scene-local assets declare their own native direction. The
  // wrapper keeps a left-facing source unmirrored, so only assets whose
  // declared native direction differs from the route-facing direction are
  // mirrored into the requested view.
  const assetFacing: FacingDirection = actorAsset?.nativeFacing
    ? actorAsset.nativeFacing === facing ? "left" : "right"
    : facing;
  const visibleLifeCue: LifeCue | null = typeof mood === "string"
    ? {
      id: "legacy-mood",
      kind: "thought",
      tone: "quiet",
      icon: "…",
      title: "心里话",
      text: mood,
    }
    : mood;

  return (
    <SceneForegroundOcclusion
      sceneId={sceneId}
      foregroundOcclusionPolicy={foregroundOcclusionPolicy}
      {...(activePhase?.layerModes ? { layerModes: activePhase.layerModes } : {})}
      visible={visible}
    >
    <div
      className={motionStyles.actorAnchor}
      data-testid="novelist-motion-actor"
      data-visible={visible}
      data-interactive={Boolean(onTap || onLongPress)}
      data-mode={actorMode}
      data-scene-id={sceneId}
      data-zone={currentPointId}
      data-action-id={activeAction?.id ?? ""}
      data-mask-src={activeAction?.maskSrc ?? ""}
      data-mask-status={activeAction?.maskStatus ?? "unknown"}
      data-route-id={route?.id ?? ""}
      data-route-status={route?.contract?.status ?? "uncontracted"}
      data-phase-id={activePhaseId ?? ""}
      data-phase-camera-facing={activePhase?.cameraFacing ?? ""}
      data-travel-direction={activePhase?.travelDirection ?? "stationary"}
      data-phase-actor-mode={activePhase?.actorMode ?? actorMode}
      data-foreground-policy={foregroundOcclusionPolicy}
      data-waypoint-count={route?.points.length ?? 0}
      data-route-complete={!isMoving && !isSettling}
      data-stable-scale={actorScale.toFixed(2)}
      data-scale-x={actorScale.toFixed(4)}
      data-scale-y={actorScale.toFixed(4)}
      data-point-facing={facing}
      data-asset-scale={(actorAsset?.assetScale ?? 1).toFixed(4)}
      data-frame-width={actorFrameAsset?.width ?? DEFAULT_ACTOR_FRAME_WIDTH}
      data-frame-height={actorFrameAsset?.height ?? DEFAULT_ACTOR_FRAME_HEIGHT}
      data-native-facing={actorAsset?.nativeFacing ?? ""}
       data-direction-turning={directionalTurnActive}
       data-route-transition={transitionActorActive ? "smoke" : "none"}
       data-route-transition-key={transition?.key ?? ""}
      data-character-reference={referenceId}
      data-character-reference-src={characterReference.src}
      data-runtime-gate={sceneGate.status}
      data-runtime-actor-ready={runtimeActorReady}
      data-preview-actor-ready={previewActorReady}
      data-actor-render-role={actorRenderRole}
      data-shadow-mode={(runtimeActorReady || studyPreviewActorReady || publishedRouteActorReady) ? "css-contact-proxy" : "blocked"}
      data-actor-body-alpha={actionAssembly?.actorBodyAlpha?.src ?? ""}
      data-action-prop-alpha={actionAssembly?.actionPropAlpha?.src ?? ""}
      data-actor-shadow-alpha={actionAssembly?.actorShadowAlpha?.src ?? ""}
      data-bounds={actionAssembly?.bounds ? JSON.stringify(actionAssembly.bounds) : ""}
      data-contact-point={actionAssembly?.contactPoint ? JSON.stringify(actionAssembly.contactPoint) : ""}
      data-safe-zone={actionAssembly?.safeZone?.ref ?? ""}
      data-floor-plane-ref={actionAssembly?.floorPlaneRef ?? route?.contract?.floorPlaneRef ?? (sceneGate.status === "ready" ? "" : "pending")}
      style={{
        left: `${actorPos.x * 100}%`,
        top: `${actorPos.y * 100}%`,
        "--move-duration": `${route?.durationMs ?? MOVE_DURATION_MS}ms`,
        "--perspective-scale": actorScale,
        "--perspective-scale-x": actorScale,
        "--perspective-scale-y": actorScale,
        "--actor-frame-ratio": actorAssetFrameRatio(actorFrameAsset),
        // A smoke handoff contains two independently framed assets. Apply
        // their asset-specific correction on each card below and leave this
        // anchor responsible only for route perspective while transitioning.
        "--actor-asset-scale": (transitionActorActive || directionalTurnActive)
          ? 1
          : actorAsset?.assetScale
            ?? transitionFromAsset?.assetScale
            ?? transitionToAsset?.assetScale
            ?? 1,
        "--asset-alpha-bottom": actorAsset?.alphaBottom ?? DEFAULT_ACTOR_ALPHA_BOTTOM,
        "--actor-transition-total": `${transition?.durationMs ?? 1100}ms`,
        "--actor-transition-turns": transition?.turns ?? 1,
      } as React.CSSProperties}
      aria-hidden={!visible}
      aria-label={onTap || onLongPress ? "观察小说家或打开系统大手" : undefined}
      tabIndex={onTap || onLongPress ? 0 : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onTap) {
          event.preventDefault();
          onTap();
        }
      }}
    >
      {visibleLifeCue && (
        <div
          className={motionStyles.idleMoodBubble}
          data-testid="actor-mood"
          data-mood-kind={visibleLifeCue.kind}
          data-mood-tone={visibleLifeCue.tone}
          data-mood-id={visibleLifeCue.id}
          data-bubble-align={actorPos.x < 0.28 ? "start" : actorPos.x > 0.72 ? "end" : "center"}
        >
          <span className={motionStyles.moodIcon} aria-hidden="true">{visibleLifeCue.icon}</span>
          <span className={motionStyles.moodCopy}>
            <strong>{visibleLifeCue.title}</strong>
            <span>{visibleLifeCue.text}</span>
            {visibleLifeCue.systemAside && <em className={motionStyles.moodAside}>{visibleLifeCue.systemAside}</em>}
          </span>
        </div>
      )}
      {renderManuscriptParticles && (
        <div className={motionStyles.manuscriptContainer} data-testid="manuscript-particles" aria-hidden="true">
          <span className={motionStyles.paperParticle}>✧</span>
          <span className={motionStyles.paperParticle}>▱</span>
          <span className={motionStyles.paperParticle}>·</span>
          <span className={motionStyles.paperParticle}>✦</span>
          <span className={motionStyles.paperParticle}>⌁</span>
          <span className={motionStyles.paperParticle}>✎</span>
        </div>
      )}
      {(runtimeActorReady || studyPreviewActorReady || publishedRouteActorReady) && <div className={motionStyles.actorShadow} data-moving={isMoving} data-shadow-role="contact-proxy" />}
      <div
        className={`${motionStyles.actorFlipWrapper} ${transitionActorActive ? motionStyles.actorTransitionActive : ""} ${transitionActorActive ? motionStyles.actorTransitionSmoke : ""}`}
          data-facing={assetFacing}
          data-flipping={isFlipping}
          data-directional-asset={usesDirectionalAsset}
      >
        <div
          className={motionStyles.actorWobbleWrapper}
          data-zone={currentPointId}
          data-scene-id={sceneId}
          data-moving={isMoving}
          data-settling={isSettling}
          data-wobble-intensity="normal"
        >
          {visible && transitionActorActive ? (
            <>
              {transitionFromAsset && (
                <div
                  className={motionStyles.actorTurnLayer}
                  data-turn-layer="outgoing"
                  data-transition-layer="outgoing"
                  style={{ "--actor-transition-ratio": actorAssetFrameRatio(transitionFromAsset) } as React.CSSProperties}
                  aria-hidden="true"
                >
                  <img
                    className={motionStyles.paperActorImage}
                    src={transitionFromAsset.src}
                    alt=""
                    data-asset-id={transitionFromAsset.assetId}
                    data-asset-scale={transitionFromAsset.assetScale ?? 1}
                    style={{
                      "--asset-alpha-bottom": transitionFromAsset.alphaBottom ?? actorAsset?.alphaBottom ?? DEFAULT_ACTOR_ALPHA_BOTTOM,
                      "--actor-transition-asset-scale": transitionFromAsset.assetScale ?? 1,
                      "--actor-transition-flip": transitionFromAsset.nativeFacing && transition?.fromFacing && transitionFromAsset.nativeFacing !== transition.fromFacing ? -1 : 1,
                    } as React.CSSProperties}
                    decoding="async"
                    loading="eager"
                  />
                </div>
              )}
              {transitionToAsset && (
                <div
                  className={motionStyles.actorTurnLayer}
                  data-turn-layer="incoming"
                  data-transition-layer="incoming"
                  style={{ "--actor-transition-ratio": actorAssetFrameRatio(transitionToAsset) } as React.CSSProperties}
                >
                  <img
                    className={motionStyles.paperActorImage}
                    src={transitionToAsset.src}
                    alt={transitionToAsset.alt}
                    data-asset-id={transitionToAsset.assetId}
                    data-asset-scale={transitionToAsset.assetScale ?? 1}
                    style={{
                      "--asset-alpha-bottom": transitionToAsset.alphaBottom ?? actorAsset?.alphaBottom ?? DEFAULT_ACTOR_ALPHA_BOTTOM,
                      "--actor-transition-asset-scale": transitionToAsset.assetScale ?? 1,
                      "--actor-transition-flip": transitionToAsset.nativeFacing && transition?.toFacing && transitionToAsset.nativeFacing !== transition.toFacing ? -1 : 1,
                    } as React.CSSProperties}
                    decoding="async"
                    loading="eager"
                  />
                </div>
              )}
            </>
          ) : visible && actorAsset && directionalTurnActive && flipOutgoingAsset && flipIncomingAsset ? (
            <>
              <div
                className={motionStyles.actorTurnLayer}
                data-turn-layer="outgoing"
                style={{ "--actor-transition-ratio": actorAssetFrameRatio(flipOutgoingAsset) } as React.CSSProperties}
                aria-hidden="true"
              >
                <img className={motionStyles.paperActorImage} src={flipOutgoingAsset.src} alt="" data-asset-id={flipOutgoingAsset.assetId} data-asset-scale={flipOutgoingAsset.assetScale ?? 1} style={{ "--actor-transition-asset-scale": flipOutgoingAsset.assetScale ?? 1 } as React.CSSProperties} decoding="async" loading="eager" />
              </div>
              <div
                className={motionStyles.actorTurnLayer}
                data-turn-layer="incoming"
                style={{ "--actor-transition-ratio": actorAssetFrameRatio(flipIncomingAsset) } as React.CSSProperties}
              >
                <img className={motionStyles.paperActorImage} src={flipIncomingAsset.src} alt={flipIncomingAsset.alt} data-asset-id={flipIncomingAsset.assetId} data-asset-scale={flipIncomingAsset.assetScale ?? 1} style={{ "--actor-transition-asset-scale": flipIncomingAsset.assetScale ?? 1 } as React.CSSProperties} decoding="async" loading="eager" />
              </div>
            </>
          ) : visible && actorAsset && !transition ? (
            <img className={motionStyles.paperActorImage} src={actorAsset.src} alt={actorAsset.alt} data-asset-id={actorAsset.assetId} data-asset-scale={actorAsset.assetScale ?? 1} data-native-facing={actorAsset.nativeFacing ?? ""} decoding="async" loading="eager" />
          ) : null}
          {prop && (
            <span className={motionStyles.handheldPropBadge} title={prop.name} aria-label={prop.name}>
              {prop.steam && <span className={motionStyles.steamEffect}>♨️</span>}
              {prop.icon}
            </span>
          )}
        </div>
      </div>
    </div>
    </SceneForegroundOcclusion>
  );
}
