import {
  editorRouteMeta,
  editorRouteTransitions,
  getEditorSceneProfile,
  pointScale,
  routeFacingAtProgress,
  routeLayerModesAtProgress,
  routePlaybackDurationMs,
  routeProgressAtPoint,
  routeStateAtProgress,
  type EditorDraft,
  type EditorFacingDirection,
  type EditorRouteMeta,
  type EditorRouteTransition,
  type EditorSceneInteraction,
} from "../geometry-test/route-editor.model";
import type { NovelistRoutePhase } from "../novelist/scene-manifest";
import {
  EDITOR_ROUTE_SOURCE_SCHEMA,
  FORMAL_ROUTE_SNAPSHOT_SCHEMA,
  type FormalRouteSnapshot,
  type FormalRouteSnapshotEvent,
  type FormalRouteSnapshotPhase,
  type FormalRouteSnapshotPoint,
  type FormalRouteSnapshotRoute,
  type FormalRouteSnapshotInteractionEvent,
  type FormalSceneInteraction,
  type RoutePublishResult,
} from "./contract";
import { resolvePointAnchorSemantics } from "./route-anchor-semantics";
import { validateFormalRouteSnapshot } from "./route-parity-validator";

export type RouteDraftAdapterOptions = {
  /** Pass a fixed value in tests or when the editor displays a reproducible export. */
  publishedAt?: string;
  speedMultiplier?: number;
  pixelsPerSecondAtOneX?: number;
};

const DEFAULT_PUBLISH_SPEED_MULTIPLIER = 2;
const DEFAULT_PIXELS_PER_SECOND_AT_ONE_X = 114;

function normalizedCoordinate(value: number, size: number): number {
  return Number((value / size).toFixed(6));
}

function pointDepth(point: { point: readonly [number, number] }, draft: EditorDraft): FormalRouteSnapshotPoint["depth"] {
  const farY = draft.scale.farY;
  const nearY = Math.max(farY + 1, draft.scale.nearY);
  const depth = Math.max(0, Math.min(1, (point.point[1] - farY) / (nearY - farY)));
  if (depth < 0.28) return "background";
  if (depth >= 0.7) return "foreground";
  return "midground";
}

function pointFacing(draft: EditorDraft, pointId: string): EditorFacingDirection {
  for (const [routeKey, routeIds] of Object.entries(draft.routes)) {
    if (!routeIds.includes(pointId)) continue;
    return routeFacingAtProgress(
      routeIds,
      draft.pointsById,
      editorRouteMeta(draft, routeKey),
      routeProgressAtPoint(routeIds, draft.pointsById, pointId),
    );
  }
  return "right";
}

function cloneAssetLibrary(
  meta: EditorRouteMeta,
  options: { stripLegacySizing?: boolean } = {},
): FormalRouteSnapshotRoute["assetLibrary"] {
  if (!meta.assetLibrary) return undefined;
  return {
    ...(meta.assetLibrary.left ? { left: meta.assetLibrary.left } : {}),
    ...(meta.assetLibrary.right ? { right: meta.assetLibrary.right } : {}),
    ...(meta.assetLibrary.states
      ? {
          states: Object.fromEntries(Object.entries(meta.assetLibrary.states).map(([stateId, assets]) => {
            if (!options.stripLegacySizing) return [stateId, { ...assets }];
            const { scale: _legacyScale, alphaBottom: _legacyAlphaBottom, ...withoutLegacySizing } = assets;
            return [stateId, withoutLegacySizing];
          })),
        }
      : {}),
  };
}

function routeStateActorMode(stateId: string | null): FormalRouteSnapshotPhase["actorMode"] {
  if (!stateId || stateId === "walking" || /walk|leave|gone|exit|away/i.test(stateId)) return "walking";
  if (/write|seat|sleep|bed/i.test(stateId)) return "seated";
  return "standing";
}

function semanticRole(point: { role: string; semanticRole?: string }): string {
  return point.semanticRole ?? point.role;
}

function travelDirectionForRoute(
  routeKey: string,
  routeIds: readonly string[],
  draft: EditorDraft,
): NovelistRoutePhase["travelDirection"] {
  const endPoint = routeIds.at(-1) ? draft.pointsById[routeIds.at(-1)!] : undefined;
  const endRole = endPoint ? semanticRole(endPoint) : "";
  if (endRole === "seat-left" || endRole === "seat-right") return "toward-chair";
  if (endRole === "bed-edge") return "toward-bed";
  if (endRole === "lounge") return "toward-lounge";
  if (endRole === "door") return "toward-door";
  if (endRole === "scene-entry") return "toward-entry";

  const key = routeKey.toLowerCase();
  if (/counter|kitchen/.test(key)) return "toward-counter";
  if (/table|meal/.test(key)) return "toward-table";
  if (/bathroom/.test(key)) return "toward-bathroom";
  if (/desk|study/.test(key)) return "toward-desk";
  if (/attic|stand/.test(key)) return "toward-stand";
  if (/lookout|terrace/.test(key)) return "toward-lookout";
  return routeIds.length < 2 ? "stationary" : "toward-entry";
}

function pointIdAtProgress(routeIds: readonly string[], pointsById: EditorDraft["pointsById"], progress: number): string | undefined {
  if (routeIds.length === 0) return undefined;
  let closest = routeIds[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const pointId of routeIds) {
    const distance = Math.abs(routeProgressAtPoint(routeIds, pointsById, pointId) - progress);
    if (distance < closestDistance) {
      closest = pointId;
      closestDistance = distance;
    }
  }
  return closest;
}

function transitionLayerModes(transition: EditorRouteTransition): Readonly<Record<string, "actor-front" | "obstacle-front">> | undefined {
  if (transition.layerModes) return { ...transition.layerModes };
  return transition.layerMode ? { "*": transition.layerMode } : undefined;
}

/**
 * Resolve the direction baked into a transparent asset before publishing it.
 * A reversed route is allowed to reuse one bitmap, but the formal snapshot
 * must still say which way that bitmap is meant to face so 3000 can mirror it
 * deterministically.  This is deliberately based on the asset contract first
 * and on the filename only as a legacy-export fallback.
 */
function assetFacingForSource(
  meta: EditorRouteMeta,
  source: string | undefined,
  stateId?: string,
): EditorFacingDirection | undefined {
  const states = meta.assetLibrary?.states ?? {};
  const sourceState = source
    ? Object.values(states).find((state) => state.left === source || state.right === source)
    : undefined;
  const state = (stateId ? states[stateId] : undefined) ?? sourceState;
  if (sourceState?.canonicalFacing) return sourceState.canonicalFacing;
  if (state?.canonicalFacing) return state.canonicalFacing;
  if (!source) return undefined;
  const normalized = source.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("carry-empty-bowl") || normalized.includes("empty-bowl")) return "left";
  if (normalized.includes("carry-bowl")) return "right";
  if (normalized.includes("walk-left") || /(?:^|[-_/])left(?:[-_.]|$)/.test(normalized)) return "left";
  if (normalized.includes("walk-right") || /(?:^|[-_/])right(?:[-_.]|$)/.test(normalized)) return "right";
  return undefined;
}

function snapshotEvent(
  transition: EditorRouteTransition,
  routeIds: readonly string[],
  pointsById: EditorDraft["pointsById"],
  meta: EditorRouteMeta,
): FormalRouteSnapshotEvent {
  const layerModes = transitionLayerModes(transition);
  const progress = routeProgressAtPoint(routeIds, pointsById, transition.pointId);
  // A legacy editor export can encode a mirror as a toggle-only event. The
  // formal boundary must never carry that ambiguity: resolve the direction at
  // the event's route progress and publish the resulting target explicitly.
  const resolvedFacing = transition.kind === "facing"
    ? transition.facing ?? routeFacingAtProgress(routeIds, pointsById, meta, progress)
    : undefined;
  const fromAssetFacing = transition.fromAssetFacing
    ?? assetFacingForSource(meta, transition.fromAssetSource);
  const toAssetFacing = transition.toAssetFacing
    ?? assetFacingForSource(meta, transition.toAssetSource, transition.targetStateId);
  return {
    pointId: transition.pointId,
    progress,
    kind: transition.kind,
    ...(resolvedFacing ? { facing: resolvedFacing } : {}),
    ...(transition.targetStateId ? { targetStateId: transition.targetStateId } : {}),
    ...(layerModes ? { layerModes } : {}),
    ...(transition.fromAssetSource ? { fromAssetSource: transition.fromAssetSource } : {}),
    ...(transition.fromAssetMode ? { fromAssetMode: transition.fromAssetMode } : {}),
    ...(fromAssetFacing ? { fromAssetFacing } : {}),
    ...(transition.fromAssetScale !== undefined ? { fromAssetScale: transition.fromAssetScale } : {}),
    ...(transition.toAssetSource ? { toAssetSource: transition.toAssetSource } : {}),
    ...(transition.toAssetMode ? { toAssetMode: transition.toAssetMode } : {}),
    ...(toAssetFacing ? { toAssetFacing } : {}),
    ...(transition.toAssetScale !== undefined ? { toAssetScale: transition.toAssetScale } : {}),
    animation: { ...transition.animation },
  };
}

function routeBreakpoints(events: readonly FormalRouteSnapshotEvent[]): number[] {
  return [
    0,
    ...events
      .map((event) => event.progress)
      .filter((progress) => progress > 0 && progress < 1),
    1,
  ].filter((progress, index, values) => values.indexOf(progress) === index)
    .sort((left, right) => left - right);
}

function snapshotPhases(
  routeKey: string,
  routeIds: readonly string[],
  draft: EditorDraft,
  meta: EditorRouteMeta,
  events: readonly FormalRouteSnapshotEvent[],
): readonly FormalRouteSnapshotPhase[] {
  const breakpoints = routeBreakpoints(events);
  const travelDirection = travelDirectionForRoute(routeKey, routeIds, draft);
  const phases: FormalRouteSnapshotPhase[] = [];
  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const startProgress = breakpoints[index]!;
    const endProgress = breakpoints[index + 1]!;
    const sampleProgress = startProgress === 0 ? 0 : Math.min(1, startProgress + 0.000001);
    const stateId = routeStateAtProgress(routeIds, draft.pointsById, meta, sampleProgress);
    const pathStartPointId = pointIdAtProgress(routeIds, draft.pointsById, startProgress);
    const pathEndPointId = pointIdAtProgress(routeIds, draft.pointsById, endProgress);
    phases.push({
      id: `${routeKey}-phase-${index + 1}`,
      startProgress,
      endProgress,
      actionId: stateId ?? "walking",
      cameraFacing: routeFacingAtProgress(routeIds, draft.pointsById, meta, sampleProgress),
      travelDirection,
      actorMode: routeStateActorMode(stateId),
      foregroundPolicy: meta.foregroundPolicy ?? "none",
      layerModes: routeLayerModesAtProgress(routeIds, draft.pointsById, meta, sampleProgress),
      ...(pathStartPointId ? { pathStartPointId } : {}),
      ...(pathEndPointId ? { pathEndPointId } : {}),
      ...(stateId ? { stateId } : {}),
    });
  }
  return phases;
}

function terminalForRoute(
  routeIds: readonly string[],
  events: readonly FormalRouteSnapshotEvent[],
): FormalRouteSnapshotRoute["terminal"] {
  const terminalPointId = routeIds.at(-1) ?? "";
  const terminalEvent = [...events].reverse().find((event) => event.pointId === terminalPointId && event.kind === "state");
  const stateId = terminalEvent?.targetStateId;
  const hideAfter = terminalEvent?.toAssetMode === "none"
    || Boolean(stateId && /leave|gone|away|exit/i.test(stateId));
  return {
    pointId: terminalPointId,
    ...(stateId ? { stateId } : {}),
    ...(terminalEvent?.toAssetMode ? { assetMode: terminalEvent.toAssetMode } : {}),
    hideAfter,
  };
}

function snapshotPoint(
  pointId: string,
  draft: EditorDraft,
  canvas: { width: number; height: number },
): FormalRouteSnapshotPoint | null {
  const point = draft.pointsById[pointId];
  if (!point) return null;
  const anchor = resolvePointAnchorSemantics({
    sceneId: draft.sceneId,
    point,
    routes: Object.entries(draft.routes).map(([routeKey, pointIds]) => ({
      routeKey,
      routeLabel: editorRouteMeta(draft, routeKey).label,
      pointIds,
    })),
  });
  return {
    id: point.id,
    label: point.label,
    role: point.role,
    ...(point.semanticRole ? { semanticRole: point.semanticRole } : {}),
    anchorKind: anchor.anchorKind,
    ...(anchor.anchorKey ? { anchorKey: anchor.anchorKey } : {}),
    ...(anchor.anchorGroupKey ? { anchorGroupKey: anchor.anchorGroupKey } : {}),
    ...(anchor.anchorPort ? { anchorPort: anchor.anchorPort } : {}),
    anchorSource: anchor.anchorSource,
    pixel: [point.point[0], point.point[1]],
    normalized: { x: normalizedCoordinate(point.point[0], canvas.width), y: normalizedCoordinate(point.point[1], canvas.height) },
    depth: pointDepth(point, draft),
    facing: pointFacing(draft, point.id),
    stableScale: pointScale(point, draft.scale),
    ...(typeof point.scaleOverride === "number" ? { scaleOverride: point.scaleOverride } : {}),
  };
}

function snapshotSceneInteraction(
  interaction: EditorSceneInteraction,
  draft: EditorDraft,
  canvas: { width: number; height: number },
): FormalSceneInteraction | null {
  if (!draft.pointsById[interaction.anchorPointId]) return null;
  return {
    id: interaction.id,
    label: interaction.label,
    kind: interaction.kind,
    anchorPointId: interaction.anchorPointId,
    initialStateId: interaction.initialStateId,
    assets: interaction.assets.map((asset) => ({
      id: asset.id,
      label: asset.label,
      src: asset.src,
      mode: asset.mode,
      zIndex: asset.zIndex,
      scale: asset.scale ?? 1,
      offset: {
        x: normalizedCoordinate(asset.offset?.[0] ?? 0, canvas.width),
        y: normalizedCoordinate(asset.offset?.[1] ?? 0, canvas.height),
      },
    })),
    states: interaction.states.map((state) => ({
      id: state.id,
      label: state.label,
      visibleAssetIds: [...state.visibleAssetIds],
      ...(state.actorAssetId ? { actorAssetId: state.actorAssetId } : {}),
    })),
  };
}

function snapshotInteractionEvents(
  routeIds: readonly string[],
  draft: EditorDraft,
  meta: EditorRouteMeta,
): readonly FormalRouteSnapshotInteractionEvent[] | undefined {
  if (!meta.interactionEvents?.length || !draft.sceneInteractions) return undefined;
  return meta.interactionEvents.flatMap((event) => {
    const interaction = draft.sceneInteractions?.[event.interactionId];
    if (!interaction || !routeIds.includes(event.pointId)) return [];
    if (!interaction.states.some((state) => state.id === event.stateId)) return [];
    return [{
      pointId: event.pointId,
      progress: routeProgressAtPoint(routeIds, draft.pointsById, event.pointId),
      interactionId: event.interactionId,
      stateId: event.stateId,
    }];
  });
}

function snapshotRoute(
  routeKey: string,
  routeIds: readonly string[],
  draft: EditorDraft,
  options: Required<Pick<RouteDraftAdapterOptions, "speedMultiplier" | "pixelsPerSecondAtOneX">>,
): FormalRouteSnapshotRoute {
  const meta = editorRouteMeta(draft, routeKey);
  const events = editorRouteTransitions(routeIds, draft.pointsById, meta)
    .map((transition) => snapshotEvent(transition, routeIds, draft.pointsById, meta));
  const assetLibrary = cloneAssetLibrary(meta, {
    // Attic action cards are normalized to the shared transparent actor
    // canvas. Do not publish old padded-canvas corrections into 3000 even if
    // an imported browser draft predates the cleanup pass.
    stripLegacySizing: draft.sceneId === "attic",
  });
  const durationMs = routePlaybackDurationMs(routeIds, draft.pointsById, options.speedMultiplier, options.pixelsPerSecondAtOneX);
  const interactionEvents = snapshotInteractionEvents(routeIds, draft, meta);
  return {
    id: routeKey,
    label: meta.label,
    kind: meta.kind,
    accent: meta.accent,
    startPointId: routeIds[0] ?? "",
    endPointId: routeIds.at(-1) ?? "",
    waypointIds: [...routeIds],
    durationMs,
    playback: {
      speedMultiplier: options.speedMultiplier,
      pixelsPerSecondAtOneX: options.pixelsPerSecondAtOneX,
      lengthPx: routeIds.length > 1 ? Math.round((durationMs / 1000) * options.pixelsPerSecondAtOneX * options.speedMultiplier) : 0,
    },
    initialFacing: routeFacingAtProgress(routeIds, draft.pointsById, meta, 0),
    foregroundPolicy: meta.foregroundPolicy ?? "none",
    ...(assetLibrary ? { assetLibrary } : {}),
    phases: snapshotPhases(routeKey, routeIds, draft, meta, events),
    events,
    ...(interactionEvents ? { interactionEvents } : {}),
    terminal: terminalForRoute(routeIds, events),
  };
}

/** Convert an editor draft without mutating it or writing to localStorage. */
export function buildFormalRouteSnapshot(
  draft: EditorDraft,
  options: RouteDraftAdapterOptions = {},
): FormalRouteSnapshot {
  const profile = getEditorSceneProfile(draft.sceneId);
  const canvas = draft.canvas ?? profile.canvas;
  const speedMultiplier = Math.max(0.1, options.speedMultiplier ?? DEFAULT_PUBLISH_SPEED_MULTIPLIER);
  const pixelsPerSecondAtOneX = Math.max(1, options.pixelsPerSecondAtOneX ?? DEFAULT_PIXELS_PER_SECOND_AT_ONE_X);
  const pointIds = new Set(Object.values(draft.routes).flat());
  // A scene component may be authored before its first route is drawn.
  // Publish its anchor as part of the formal point registry so the runtime
  // can place the component and the validator can verify the binding.
  for (const interaction of Object.values(draft.sceneInteractions ?? {})) {
    pointIds.add(interaction.anchorPointId);
  }
  const points = [...pointIds]
    .map((pointId) => snapshotPoint(pointId, draft, canvas))
    .filter((point): point is FormalRouteSnapshotPoint => Boolean(point));
  const routes = Object.fromEntries(Object.entries(draft.routes).map(([routeKey, routeIds]) => [
    routeKey,
    snapshotRoute(routeKey, routeIds, draft, { speedMultiplier, pixelsPerSecondAtOneX }),
  ]));

  return {
    schemaVersion: FORMAL_ROUTE_SNAPSHOT_SCHEMA,
    publishedAt: options.publishedAt ?? new Date().toISOString(),
    source: {
      schemaVersion: EDITOR_ROUTE_SOURCE_SCHEMA,
      draftVersion: draft.version,
      sceneId: draft.sceneId,
      canvas: { ...canvas },
      coordinateSpace: "pixel-top-left-origin",
    },
    scene: {
      sceneId: draft.sceneId,
      label: profile.label,
      masterSrc: profile.masterSrc,
      canvas: { ...canvas },
      foregroundLayers: profile.foregroundLayers.map((layer) => ({
        id: layer.id,
        src: layer.src,
        label: layer.label,
        policy: layer.policy,
        zIndex: layer.zIndex,
      })),
      ...(draft.sceneInteractions
        ? {
            interactions: Object.values(draft.sceneInteractions)
              .map((interaction) => snapshotSceneInteraction(interaction, draft, canvas))
              .filter((interaction): interaction is FormalSceneInteraction => Boolean(interaction)),
          }
        : {}),
      floorStatus: profile.floorStatus,
      anchorSemantics: { ...profile.anchorSemantics },
    },
    scale: { ...draft.scale },
    points,
    routes,
  };
}

/** Build and validate a snapshot; this function never publishes it implicitly. */
export function publishEditorDraft(
  draft: EditorDraft,
  options: RouteDraftAdapterOptions = {},
): RoutePublishResult {
  const snapshot = buildFormalRouteSnapshot(draft, options);
  const issues = validateFormalRouteSnapshot(snapshot);
  const hasErrors = issues.some((issue) => issue.severity === "error");
  return hasErrors
    ? { ok: false, snapshot: null, issues }
    : { ok: true, snapshot, issues };
}
