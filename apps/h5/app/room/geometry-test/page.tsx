"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from "react";

import {
  pointInPolygon,
  type SceneGeometryPoint,
} from "../novelist/scene-geometry";
import {
  clamp,
  createInitialEditorDraft,
  addSceneInteractionAsset,
  deserializeEditorDraft,
  ensureStudyTerminalStateTransitions,
  editorForegroundLayersAtProgress,
  editorRouteMeta,
  editorRouteTransitions,
  EDITOR_SCENE_IDS,
  getEditorSceneProfile,
  normalizeEditorDraft,
  normalizeEditorAssetSource,
  pointScale,
  routeLengthPx,
  routePlaybackDurationMs,
  routeProgressAtPoint,
  routeFacingAtProgress,
  reverseRouteFacingContract,
  routeLayerModesAtProgress,
  routeSampleAtProgress,
  routeStateAtProgress,
  setSceneInteractionStateVisibility,
  serializeEditorDraft,
  DEFAULT_EDITOR_TRANSITION_ANIMATION,
  DEFAULT_INITIAL_NODE_TRANSITION_ANIMATION,
  diningKitchenEndpointContractKind,
  studyEndpointContractKind,
  STUDY_EXIT_TRANSPARENT_ACTOR_SRC,
  type EditorFacingDirection,
  type EditorLayerMode,
  type EditorRouteTransition,
  type EditorRouteAssetLibrary,
  type EditorTransitionAnimation,
  type EditorTransitionAnimationStyle,
  type EditorTransitionAssetMode,
  type EditorTransitionEasing,
  type EditorRouteMeta,
  type EditorDraft,
  type EditorSceneId,
  type EditorSceneInteraction,
  type EditorSceneInteractionAsset,
  type EditorSceneInteractionAssetMode,
  type EditorSceneInteractionKind,
  type EditorSceneInteractionState,
  type EditorPoint,
  type EditorRouteKey,
} from "./route-editor.model";
import {
  resolvePointAnchorSemantics,
  routeAnchorLabel,
} from "../route-publish/route-anchor-semantics";

import styles from "./geometry-test.module.css";
import { publishEditorDraft, RoutePublishError } from "../route-publish/route-publish.client";

const DRAFT_STORAGE_KEYS: Record<EditorSceneId, string> = {
  study: "route-editor-draft-v2-study",
  bedroom: "route-editor-draft-v2-bedroom",
  "dining-kitchen": "route-editor-draft-v2-dining-kitchen",
  entrance: "route-editor-draft-v2-entrance",
  // v3 has a new master and a new anchor contract. Older terrace keys are
  // cleanup-only and never participate in automatic restore.
  "terrace-greenery": "route-editor-draft-v3-terrace-greenery",
  attic: "route-editor-draft-v2-attic",
};

const LEGACY_STUDY_STORAGE_KEY = "study-route-editor-draft-v1";
const LEGACY_DRAFT_STORAGE_KEYS: Partial<Record<EditorSceneId, readonly string[]>> = {
  "terrace-greenery": ["route-editor-draft-v2-terrace-greenery"],
};
const INLINE_ASSET_STORAGE_PREFIX = "route-editor-inline-assets-v1-";
const ACTIVE_SCENE_STORAGE_KEY = "route-editor-active-scene-v1";
const ACTIVE_ROUTE_STORAGE_PREFIX = "route-editor-active-route-v1-";

const WHITE_SMOKE_ASSET_SRC = "/assets/ecology/effects/transitions/white-smoke-puff-v1.webp";
const DEFAULT_ROUTE_PLAYBACK_SPEED = 2;

const routeColors: Record<string, string> = {
  cyan: "routeSeatToDoor",
  magenta: "routeDoorToSeat",
  amber: "routeKitchen",
  violet: "routeCustom",
};

function pointToPercent(
  point: SceneGeometryPoint,
  canvas: { width: number; height: number },
): { left: string; top: string } {
  return {
    left: `${(point[0] / canvas.width) * 100}%`,
    top: `${(point[1] / canvas.height) * 100}%`,
  };
}

function pointFromPointer<T extends Element>(
  event: PointerEvent<T>,
  stage: HTMLDivElement | null,
  canvas: { width: number; height: number },
): SceneGeometryPoint {
  const bounds = stage?.getBoundingClientRect();
  if (!bounds || bounds.width === 0 || bounds.height === 0) return [0, 0];
  return [
    clamp(((event.clientX - bounds.left) / bounds.width) * canvas.width, 0, canvas.width),
    clamp(((event.clientY - bounds.top) / bounds.height) * canvas.height, 0, canvas.height),
  ];
}

function actorOcclusionMaskStyle(
  layers: readonly { src: string }[],
): CSSProperties | undefined {
  if (layers.length === 0) return undefined;
  const maskImage = [
    "linear-gradient(#fff, #fff)",
    ...layers.map((layer) => `url("${layer.src}")`),
  ].join(", ");
  return {
    maskImage,
    maskComposite: layers.map(() => "subtract").join(", "),
    maskMode: "alpha",
    WebkitMaskImage: maskImage,
    WebkitMaskMode: "alpha",
  } as CSSProperties;
}

function storageKeyForScene(sceneId: EditorSceneId): string {
  return DRAFT_STORAGE_KEYS[sceneId];
}

/**
 * Automatic restore is intentionally canonical-only. Legacy keys are kept
 * separate so they can be cleaned after a successful canonical save, but
 * they must never compete with the current route draft during refresh or
 * scene switching.
 */
function storageKeysForScene(sceneId: EditorSceneId): readonly string[] {
  return [storageKeyForScene(sceneId)];
}

function legacyStorageKeysForScene(sceneId: EditorSceneId): readonly string[] {
  return [...new Set([
    ...(LEGACY_DRAFT_STORAGE_KEYS[sceneId] ?? []),
    ...(sceneId === "study" ? [LEGACY_STUDY_STORAGE_KEY] : []),
  ])];
}

/**
 * Remove browser-only drafts left by pre-canonical editor builds.  This is a
 * cleanup pass, not a restore path: explicit JSON import remains the only way
 * to intentionally recover an exported historical draft.
 */
function purgeLegacyStorage(sceneId: EditorSceneId): void {
  if (typeof window === "undefined") return;
  for (const key of legacyStorageKeysForScene(sceneId)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // A blocked/disabled storage must not prevent the editor from opening.
    }
  }
}

function activeRouteStorageKey(sceneId: EditorSceneId): string {
  return `${ACTIVE_ROUTE_STORAGE_PREFIX}${sceneId}`;
}

function inlineAssetStorageKey(sceneId: EditorSceneId): string {
  return `${INLINE_ASSET_STORAGE_PREFIX}${sceneId}`;
}

function inlineAssetToken(value: string, serial: number): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `inline-asset-v1:${(hash >>> 0).toString(36)}-${value.length}-${serial}`;
}

/** Keep large uploaded images out of the main draft record. */
function externalizeInlineAssets(draft: EditorDraft): {
  draft: EditorDraft;
  assets: Record<string, string>;
} {
  const assets: Record<string, string> = {};
  const tokenByValue = new Map<string, string>();
  let serial = 0;
  const visit = (value: unknown): unknown => {
    if (typeof value === "string" && value.startsWith("data:")) {
      const existing = tokenByValue.get(value);
      if (existing) return existing;
      const baseToken = inlineAssetToken(value, serial);
      let token = baseToken;
      while (assets[token] && assets[token] !== value) {
        serial += 1;
        token = inlineAssetToken(value, serial);
      }
      assets[token] = value;
      tokenByValue.set(value, token);
      serial += 1;
      return token;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, visit(child)]),
      );
    }
    return value;
  };
  return { draft: visit(draft) as EditorDraft, assets };
}

function restoreInlineAssets(value: unknown, sceneId: EditorSceneId): unknown {
  if (typeof window === "undefined") return value;
  let assets: Record<string, string> = {};
  try {
    const raw = window.localStorage.getItem(inlineAssetStorageKey(sceneId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") assets = parsed as Record<string, string>;
  } catch {
    assets = {};
  }
  const visit = (child: unknown): unknown => {
    if (typeof child === "string" && child.startsWith("inline-asset-v1:")) {
      return assets[child] ?? child;
    }
    if (Array.isArray(child)) return child.map(visit);
    if (child && typeof child === "object") {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>).map(([key, nested]) => [key, visit(nested)]),
      );
    }
    return child;
  };
  return visit(value);
}

function isEditorSceneId(value: string | null): value is EditorSceneId {
  return value !== null && EDITOR_SCENE_IDS.includes(value as EditorSceneId);
}

type StoredDraftCandidate = {
  key: string;
  draft: EditorDraft;
  routeCount: number;
  pointCount: number;
};

function readStoredDraftCandidates(sceneId: EditorSceneId): StoredDraftCandidate[] {
  if (typeof window === "undefined") return [];
  return storageKeysForScene(sceneId)
    .map((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      try {
        const draft = normalizeEditorDraft(restoreInlineAssets(JSON.parse(raw), sceneId));
        if (!draft || draft.sceneId !== sceneId) return null;
        return {
          key,
          draft,
          routeCount: Object.keys(draft.routes).length,
          pointCount: Object.keys(draft.pointsById).length,
        };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is StoredDraftCandidate => Boolean(candidate));
}

function readStoredDraft(sceneId: EditorSceneId): StoredDraftCandidate | undefined {
  purgeLegacyStorage(sceneId);
  const candidates = readStoredDraftCandidates(sceneId);
  return candidates.find((candidate) => candidate.key === storageKeyForScene(sceneId));
}

/**
 * A few early entrance drafts used a flat "component pending" record while
 * the component editor was being prototyped.  Keep the migration deliberately
 * conservative: only map records with an explicit component/anchor shape and
 * never infer or rewrite route geometry.
 */
function migratePendingSceneComponents(draft: EditorDraft): EditorDraft {
  if (draft.sceneInteractions || typeof window === "undefined") return draft;
  const raw = window.localStorage.getItem(`route-editor-components-pending-v1-${draft.sceneId}`);
  if (!raw) return draft;
  try {
    const pending = JSON.parse(raw) as { components?: unknown };
    if (!Array.isArray(pending.components)) return draft;
    const sceneInteractions = Object.fromEntries(pending.components.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const anchorPointId = typeof item.anchorPointId === "string" ? item.anchorPointId : "";
      if (!id || !label || !anchorPointId || !draft.pointsById[anchorPointId]) return [];
      const kind: EditorSceneInteractionKind = item.kind === "pickup-prop" || item.kind === "inspect" || item.kind === "ambient" || item.kind === "portal"
        ? item.kind
        : "ambient";
      const assets: EditorSceneInteractionAsset[] = Array.isArray(item.assets) ? item.assets.flatMap((asset) => {
        if (!asset || typeof asset !== "object") return [];
        const source = asset as Record<string, unknown>;
        const assetId = typeof source.id === "string" ? source.id.trim() : "";
        const normalizedSrc = typeof source.src === "string" ? normalizeEditorAssetSource(source.src) : "";
        const src = normalizedSrc.startsWith("/assets/") ? normalizedSrc : "";
        if (!assetId || !src) return [];
        return [{
          id: assetId,
          label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : assetId,
          src,
          mode: source.mode === "actor" ? "actor" as const : "scene" as const,
          zIndex: typeof source.zIndex === "number" && Number.isFinite(source.zIndex) ? Math.round(source.zIndex) : 10,
          ...(typeof source.scale === "number" && Number.isFinite(source.scale) && source.scale > 0 ? { scale: source.scale } : {}),
        }];
      }) : [];
      const stateId = typeof item.stateId === "string" && item.stateId.trim() ? item.stateId.trim() : "ready";
      return [[id, {
        id,
        label,
        kind,
        anchorPointId,
        initialStateId: stateId,
        assets,
        states: [{ id: stateId, label: "默认状态", visibleAssetIds: assets.map((asset) => asset.id) }],
      }]];
    }));
    if (Object.keys(sceneInteractions).length === 0) return draft;
    window.localStorage.removeItem(`route-editor-components-pending-v1-${draft.sceneId}`);
    return { ...draft, sceneInteractions };
  } catch {
    return draft;
  }
}

function storedRouteKeyForDraft(sceneId: EditorSceneId, draft: EditorDraft): string {
  const stored = window.localStorage.getItem(activeRouteStorageKey(sceneId));
  return stored && draft.routes[stored]
    ? stored
    : Object.keys(draft.routes)[0] ?? getEditorSceneProfile(sceneId).protectedRouteKeys[0] ?? "";
}

function persistEditorDraft(draft: EditorDraft, routeKey: EditorRouteKey): void {
  if (typeof window === "undefined") return;
  const nextRouteKey = draft.routes[routeKey]
    ? routeKey
    : Object.keys(draft.routes)[0] ?? getEditorSceneProfile(draft.sceneId).protectedRouteKeys[0] ?? "";
  const externalized = externalizeInlineAssets(draft);
  const assetKey = inlineAssetStorageKey(draft.sceneId);
  const draftKey = storageKeyForScene(draft.sceneId);
  const compactDraft = JSON.stringify(externalized.draft);
  const compactAssets = JSON.stringify(externalized.assets);

  const writeSmallMetadata = () => {
    try {
      window.localStorage.setItem(ACTIVE_SCENE_STORAGE_KEY, draft.sceneId);
      window.localStorage.setItem(activeRouteStorageKey(draft.sceneId), nextRouteKey);
    } catch {
      // Metadata is optional and can be reconstructed from the draft.
    }
  };

  const writeCompactDraft = (includeAssets: boolean): boolean => {
    try {
      if (includeAssets && Object.keys(externalized.assets).length > 0) {
        window.localStorage.setItem(assetKey, compactAssets);
      } else if (!includeAssets || Object.keys(externalized.assets).length === 0) {
        window.localStorage.removeItem(assetKey);
      }
      // This must always be the externalized draft. Never write `draft` here:
      // it may contain repeated multi-megabyte data URLs.
      window.localStorage.setItem(draftKey, compactDraft);
      return true;
    } catch {
      return false;
    }
  };

  const recoverSceneStorage = () => {
    // Only remove known copies for this scene. Other scenes and explicit
    // exported JSON files are untouched. The current in-memory draft is the
    // source used for the immediate retry below.
    for (const key of [...storageKeysForScene(draft.sceneId), ...legacyStorageKeysForScene(draft.sceneId)]) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore stores that became unavailable while recovering.
      }
    }
    try {
      window.localStorage.removeItem(assetKey);
    } catch {
      // Best-effort cleanup only.
    }
  };

  let compactSaved = writeCompactDraft(true);
  if (!compactSaved) {
    // A previous version could have left the full base64 draft in the
    // canonical key. Remove only this scene's known copies, then retry.
    recoverSceneStorage();
    // If the asset sidecar itself cannot fit, still retain the compact route
    // record. The editor remains usable and its JSON export contains assets.
    compactSaved = writeCompactDraft(true);
    if (!compactSaved) compactSaved = writeCompactDraft(false);
  }

  if (compactSaved) {
    // Once the current canonical copy is safely written, remove only the
    // known legacy browser copies. Explicitly exported JSON files are not
    // touched and remain the recovery path for an intentionally imported old
    // draft.
    for (const key of legacyStorageKeysForScene(draft.sceneId)) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Best-effort cleanup; canonical storage remains authoritative.
      }
    }
  }
  writeSmallMetadata();
}

function distancePointToSegment(point: SceneGeometryPoint, start: SceneGeometryPoint, end: SceneGeometryPoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const progress = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  const projection: SceneGeometryPoint = [start[0] + dx * progress, start[1] + dy * progress];
  return Math.hypot(point[0] - projection[0], point[1] - projection[1]);
}

function nearestSegmentIndex(points: readonly EditorPoint[], point: SceneGeometryPoint): number {
  if (points.length < 2) return 0;
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distancePointToSegment(point, points[index]!.point, points[index + 1]!.point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  }
  return nearest;
}

function makePointId(draft: EditorDraft, routeKey: EditorRouteKey): string {
  let index = 1;
  while (draft.pointsById[`${routeKey}-node-${index}`]) index += 1;
  return `${routeKey}-node-${index}`;
}

function clonePointForRoute(
  draft: EditorDraft,
  routeKey: EditorRouteKey,
  pointId: string,
  alwaysClone = false,
): { draft: EditorDraft; pointId: string } {
  const source = draft.pointsById[pointId];
  if (!source || (!alwaysClone && source.role !== "waypoint")) return { draft, pointId };
  const referencedElsewhere = Object.entries(draft.routes).some(([key, ids]) => key !== routeKey && ids.includes(pointId));
  if (!alwaysClone && !referencedElsewhere) return { draft, pointId };

  const nextId = makePointId(draft, routeKey);
  const nextPoint: EditorPoint = {
    ...source,
    id: nextId,
    label: `${editorRouteMeta(draft, routeKey).label} · ${source.label}`,
    ...(source.role === "waypoint" ? {} : { role: "waypoint" as const }),
    ...(source.role !== "waypoint" ? { semanticRole: source.role } : source.semanticRole ? { semanticRole: source.semanticRole } : {}),
    point: [...source.point] as SceneGeometryPoint,
  };
  const sourceMeta = draft.routeMeta?.[routeKey];
  const nextRouteMeta = sourceMeta
    ? {
        ...sourceMeta,
        ...(sourceMeta.facingSwitchAfterPointId === pointId ? { facingSwitchAfterPointId: nextId } : {}),
        ...(sourceMeta.transitions
          ? {
              transitions: sourceMeta.transitions.map((transition) => ({
                ...transition,
                ...(transition.layerModes ? { layerModes: { ...transition.layerModes } } : {}),
                ...(transition.pointId === pointId ? { pointId: nextId } : {}),
              })),
            }
          : {}),
      }
    : undefined;
  return {
    pointId: nextId,
    draft: {
      ...draft,
      pointsById: { ...draft.pointsById, [nextId]: nextPoint },
      routes: {
        ...draft.routes,
        [routeKey]: (draft.routes[routeKey] ?? []).map((id) => id === pointId ? nextId : id),
      },
      ...(nextRouteMeta
        ? { routeMeta: { ...(draft.routeMeta ?? {}), [routeKey]: nextRouteMeta } }
        : {}),
    },
  };
}

function makeRouteId(draft: EditorDraft): string {
  let index = 1;
  while (draft.routes[`custom-${index}`]) index += 1;
  return `custom-${index}`;
}

function makeRouteMeta(routeKey: string, label: string, kind: EditorRouteMeta["kind"]): EditorRouteMeta {
  return { id: routeKey, label, kind, accent: "violet" };
}

function oppositeFacing(facing: EditorFacingDirection): EditorFacingDirection {
  return facing === "left" ? "right" : "left";
}

function reverseCopiedStateTransition(transition: EditorRouteTransition): EditorRouteTransition {
  if (transition.kind !== "state") return transition;
  const {
    targetStateId: _targetStateId,
    fromAssetSource,
    fromAssetMode,
    fromAssetFacing,
    fromAssetScale,
    toAssetSource,
    toAssetMode,
    toAssetFacing,
    toAssetScale,
    ...withoutDirection
  } = transition;
  return {
    ...withoutDirection,
    targetStateId: "walking",
    ...(toAssetSource ? { fromAssetSource: toAssetSource } : {}),
    ...(toAssetMode ? { fromAssetMode: toAssetMode } : { fromAssetMode: "none" }),
    ...(toAssetFacing ? { fromAssetFacing: toAssetFacing } : {}),
    ...(toAssetScale !== undefined ? { fromAssetScale: toAssetScale } : {}),
    ...(fromAssetSource ? { toAssetSource: fromAssetSource } : {}),
    toAssetMode: fromAssetMode ?? "actor",
    ...(fromAssetFacing ? { toAssetFacing: fromAssetFacing } : {}),
    ...(fromAssetScale !== undefined ? { toAssetScale: fromAssetScale } : {}),
  };
}

function updatePoint(draft: EditorDraft, pointId: string, point: SceneGeometryPoint): EditorDraft {
  const current = draft.pointsById[pointId];
  if (!current) return draft;
  return {
    ...draft,
    pointsById: {
      ...draft.pointsById,
      [pointId]: { ...current, point },
    },
  };
}

function formatPoint(point: SceneGeometryPoint): string {
  return `[${Math.round(point[0])}, ${Math.round(point[1])}]`;
}

function pointRoleDescription(role: EditorPoint["role"]): string {
  if (role === "waypoint") return "当前路线专属中间节点";
  if (role === "door") return "共享门交互锚点";
  if (role === "seat-left") return "共享座位左侧上椅锚点";
  if (role === "seat-right") return "共享座位右侧下椅锚点";
  if (role === "bed-edge") return "共享床 / 唱片机交互锚点";
  if (role === "lounge") return "共享小沙发交互锚点";
  return "共享场景接入锚点";
}

function pointContractLabel(
  sceneId: EditorSceneId,
  routeKey: string,
  meta: EditorRouteMeta,
  point: EditorPoint,
  index: number,
  pointCount: number,
): string {
  const position = index === 0 ? "start" : index === pointCount - 1 ? "end" : "middle";
  if (sceneId === "study") {
    const contract = studyEndpointContractKind(routeKey, meta, point, position);
    if (contract === "scene-interaction") return "场景内互动 · 状态资产";
    if (contract === "scene-boundary") {
      return position === "start"
        ? "场景互通入口 · 不显示 → 透明角色"
        : "场景互通出口 · 透明角色 → 不显示";
    }
    return "动作层 · 路线中间节点";
  }

  if (sceneId === "dining-kitchen") {
    const contract = diningKitchenEndpointContractKind(routeKey, meta, point, position);
    if (contract === "scene-interaction") return "场景内互动 · 状态资产";
    if (contract === "scene-boundary") {
      return position === "start"
        ? "场景互通入口 · 不显示 → 透明角色"
        : "场景互通出口 · 透明角色 → 不显示";
    }
    return "动作层 · 路线中间节点";
  }

  const semanticRole = point.semanticRole ?? point.role;
  if (["seat-left", "seat-right", "bed-edge", "lounge"].includes(semanticRole)) {
    return "场景内互动 · 状态资产";
  }
  if (semanticRole === "door" || semanticRole === "scene-entry") {
    return position === "start"
      ? "场景互通入口 · 不显示 → 透明角色"
      : "场景互通出口 · 透明角色 → 不显示";
  }
  return "动作层 · 路线节点";
}

function pointAnchorSemantics(draft: EditorDraft, point: EditorPoint) {
  return resolvePointAnchorSemantics({
    sceneId: draft.sceneId,
    point,
    routes: Object.entries(draft.routes).map(([key, pointIds]) => ({
      routeKey: key,
      routeLabel: editorRouteMeta(draft, key).label,
      pointIds,
    })),
  });
}

function transitionEasingCss(easing: EditorTransitionEasing): string {
  if (easing === "linear") return "linear";
  if (easing === "smooth") return "cubic-bezier(.22, .8, .26, 1)";
  return "cubic-bezier(.22, 1.35, .3, 1)";
}

// Terminal smoke is deliberately shorter than the old 1600ms floor. The cloud
// starts before the final waypoint, so the route keeps moving underneath it
// instead of stopping at the destination while the effect grows. Entrance
// smoke has a separate, shorter floor: it is a one-shot scene-entry puff and
// must reveal the walking actor quickly even on a short route at 4× playback.
const MIN_SMOKE_TRANSITION_MS = 1100;
const MIN_ENTRY_SMOKE_TRANSITION_MS = 420;

function transitionTotalMs(
  animation: Pick<EditorTransitionAnimation, "style" | "durationMs" | "settleMs">,
  phase: "default" | "entry" = "default",
): number {
  const requestedTotal = Math.max(0, animation.durationMs + animation.settleMs);
  return animation.style === "smoke"
    ? Math.max(requestedTotal, phase === "entry" ? MIN_ENTRY_SMOKE_TRANSITION_MS : MIN_SMOKE_TRANSITION_MS)
    : requestedTotal;
}

/**
 * A 3-D card must finish on an integer number of full turns.  Editor drafts
 * allow half-turn values for tuning, but feeding 1.5 directly to rotateY
 * leaves the incoming asset at 540deg (its back side), which then snaps to
 * the stable asset when the transition unmounts.  Preserve the user's
 * minimum requested amount of motion while normalizing the visual endpoint.
 */
function transitionRenderTurns(turns: number): number {
  return Math.max(1, Math.ceil(Number.isFinite(turns) ? turns : 1));
}

function isFinalRouteStateTransition(
  routeIds: readonly string[],
  transition: EditorRouteTransition,
): boolean {
  const pointIndex = routeIds.indexOf(transition.pointId);
  return transition.kind === "state"
    && (transition.animation.style === "smoke" || transition.animation.style === "scene-switch")
    && pointIndex > 0
    && pointIndex === routeIds.length - 1;
}

function transitionTriggerProgress(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  transition: EditorRouteTransition,
): number {
  const eventProgress = routeProgressAtPoint(routeIds, pointsById, transition.pointId);
  const pointIndex = routeIds.indexOf(transition.pointId);
  if (!isFinalRouteStateTransition(routeIds, transition)) return eventProgress;

  // A final smoke state owns the last leg of the route: begin the visual
  // transition as the actor leaves the penultimate point, not after it has
  // already arrived and frozen at the endpoint.
  return routeProgressAtPoint(routeIds, pointsById, routeIds[pointIndex - 1]!);
}

function makeEditorTransition(
  pointId: string,
  kind: EditorRouteTransition["kind"],
  isInitialNode = false,
): EditorRouteTransition {
  return {
    pointId,
    kind,
    ...(kind === "state" ? { targetStateId: "next-state" } : {}),
    ...(kind === "layer" ? { layerModes: {} } : {}),
    animation: {
      ...(isInitialNode
        ? DEFAULT_INITIAL_NODE_TRANSITION_ANIMATION
        : DEFAULT_EDITOR_TRANSITION_ANIMATION),
    },
  };
}

function transitionLayerModeFor(
  transition: EditorRouteTransition | undefined,
  layerId: string,
): EditorLayerMode | undefined {
  return transition?.layerModes?.[layerId]
    ?? transition?.layerModes?.["*"]
    ?? transition?.layerMode;
}

type ActivePreviewTransition = EditorRouteTransition & {
  key: string;
  effectiveTotalMs: number;
  fromFacing: EditorFacingDirection;
  toFacing: EditorFacingDirection;
  fromStateId: string | null;
  toStateId: string | null;
  fromAsset: EditorVisualAsset;
  toAsset: EditorVisualAsset;
};

type ActiveTransitionEntry = {
  transition: EditorRouteTransition;
  eventProgress: number;
  progress: number;
};

type AssetLibraryItem = {
  src: string;
  name: string;
  relativePath: string;
  extension: string;
  bytes: number;
};

type DraggingInteractionAsset = {
  interactionId: string;
  assetId: string;
  /** Canvas-space distance from the pointer to the asset's bottom-center anchor. */
  pointerOffset: SceneGeometryPoint;
};

type ResizingInteractionAsset = {
  interactionId: string;
  assetId: string;
  /** Fixed scene-space anchor while the resize gesture is active. */
  anchor: SceneGeometryPoint;
  startDistance: number;
  startScale: number;
};

type EditorVisualAsset = {
  src: string;
  mode: EditorTransitionAssetMode;
  facing: EditorFacingDirection;
  stateId: string | null;
  /** State assets may use a different canvas framing than the walker. */
  assetScale?: number;
  /** Last opaque-pixel position used to keep transparent assets on the floor. */
  alphaBottom: number;
  /** Whether the source bitmap must be mirrored to match `facing`. */
  flipX?: boolean;
};

type InspectorTab = "nodes" | "events" | "assets" | "interactions" | "scale" | "manage";

const inspectorTabs: ReadonlyArray<{ id: InspectorTab; label: string; hint: string }> = [
  { id: "nodes", label: "节点", hint: "拖动 / 坐标" },
  { id: "events", label: "事件", hint: "镜像 / 状态" },
  { id: "assets", label: "素材", hint: "角色图片" },
  { id: "interactions", label: "场景互动", hint: "组件 / 状态" },
  { id: "scale", label: "缩放", hint: "近大远小" },
  { id: "manage", label: "管理", hint: "路线 / JSON" },
];

type ActorAssetPresentation = {
  src: string;
  assetScale: number;
  alphaBottom: number;
  flipX: boolean;
};

function canonicalFacingForAssetSource(source: string): EditorFacingDirection | undefined {
  const normalized = source.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("study-walk-left")) return "left";
  if (normalized.includes("study-walk-right")) return "right";
  if (normalized.includes("carry-empty-bowl-transparent-actor")) return "left";
  if (normalized.includes("carry-bowl-transparent-actor")) return "right";
  // The attic cards are authored in a single, right-facing orientation. Their
  // event-level facing override is what keeps them from inheriting travel
  // direction when a route is reversed.
  if (normalized.includes("/formal-scenes/attic/candidates/attic-character-")) return "right";
  return undefined;
}

function alphaBottomForAssetSource(source: string): number | undefined {
  const normalized = source.replace(/\\/g, "/").toLowerCase();
  // These terrace action cards are tightly cropped around the character and
  // their wooden floor discs reach the bottom edge of the bitmap. They do not
  // use the shared walker's 89.4% padded canvas anchor.
  if (
    normalized.includes("/formal-scenes/terrace-greenery/terrace-seated-relaxed-hands-in-pockets-character-asset-cropped")
    || normalized.includes("/formal-scenes/terrace-greenery/terrace-watering-character-asset-cropped")
    || normalized.includes("/formal-scenes/terrace-greenery/terrace-turtle-character-facing-right-asset-cropped")
  ) return 1;
  return undefined;
}

function orientActorAsset(asset: EditorVisualAsset): EditorVisualAsset {
  if (asset.mode !== "actor" || !asset.src) return asset;
  const canonicalFacing = canonicalFacingForAssetSource(asset.src);
  return canonicalFacing
    ? { ...asset, flipX: canonicalFacing !== asset.facing }
    : asset;
}

function routeActorAssetPresentation(
  meta: EditorRouteMeta,
  facing: EditorFacingDirection,
  stateId: string | null,
  fallback: { left: { src: string }; right: { src: string } },
): ActorAssetPresentation {
  const state = stateId ? meta.assetLibrary?.states?.[stateId] : undefined;
  // A state may intentionally register only one source image. Reuse it for
  // the opposite travel direction and let canonicalFacing provide the
  // automatic mirror, so the user does not need to enter the same path twice.
  const stateSource = state?.[facing] ?? state?.left ?? state?.right;
  const src = stateSource ?? meta.assetLibrary?.[facing] ?? fallback[facing].src;
  const normalizedAtticAsset = src.replace(/\\/g, "/").toLowerCase().includes(
    "/formal-scenes/attic/candidates/attic-character-",
  );
  return {
    src,
    // The attic cards now share the walker canvas. Ignore stale browser-draft
    // corrections for those sources so the route perspective is their only
    // scale/position authority.
    assetScale: normalizedAtticAsset ? 1 : state?.scale ?? 1,
    alphaBottom: normalizedAtticAsset ? 0.894 : state?.alphaBottom ?? alphaBottomForAssetSource(src) ?? 0.894,
    flipX: state?.canonicalFacing !== undefined && state.canonicalFacing !== facing,
  };
}

function stateIdForAssetSource(meta: EditorRouteMeta, source: string | undefined): string | null {
  if (!source) return null;
  const match = Object.entries(meta.assetLibrary?.states ?? {}).find(([, state]) => (
    state.left === source || state.right === source
  ));
  return match?.[0] ?? null;
}

function applyTransitionAssetFacing(
  meta: EditorRouteMeta,
  transition: EditorRouteTransition,
  side: "from" | "to",
  asset: EditorVisualAsset,
): EditorVisualAsset {
  const requestedFacing = side === "from" ? transition.fromAssetFacing : transition.toAssetFacing;
  if (!requestedFacing || asset.mode !== "actor" || !asset.src) return asset;

  const sourceStateId = stateIdForAssetSource(meta, asset.src) ?? asset.stateId;
  const canonicalFacing = (sourceStateId
    ? meta.assetLibrary?.states?.[sourceStateId]?.canonicalFacing
    : undefined) ?? canonicalFacingForAssetSource(asset.src);
  return orientActorAsset({
    ...asset,
    facing: requestedFacing,
    ...(canonicalFacing ? { flipX: canonicalFacing !== requestedFacing } : {}),
  });
}

function applyTransitionAssetFraming(
  transition: EditorRouteTransition,
  side: "from" | "to",
  asset: EditorVisualAsset,
): EditorVisualAsset {
  if (asset.mode !== "actor") return asset;
  const requestedScale = side === "from" ? transition.fromAssetScale : transition.toAssetScale;
  const scaled = typeof requestedScale === "number"
    ? { ...asset, assetScale: requestedScale }
    : asset;
  const alphaBottom = alphaBottomForAssetSource(scaled.src);
  return alphaBottom === undefined ? scaled : { ...scaled, alphaBottom };
}

function routeActorAssetSource(
  meta: EditorRouteMeta,
  facing: EditorFacingDirection,
  stateId: string | null,
  fallback: { left: { src: string }; right: { src: string } },
): string {
  return routeActorAssetPresentation(meta, facing, stateId, fallback).src;
}

function routeVisualAssetAtProgress(
  routeIds: readonly string[],
  pointsById: Readonly<Record<string, EditorPoint>>,
  meta: EditorRouteMeta,
  fallback: { left: { src: string }; right: { src: string } },
  progress: number,
): EditorVisualAsset {
  const clampedProgress = clamp(progress, 0, 1);
  const facing = routeFacingAtProgress(routeIds, pointsById, meta, clampedProgress);
  const stateId = routeStateAtProgress(routeIds, pointsById, meta, clampedProgress);
  const startPointId = routeIds[0];
  const transitions = editorRouteTransitions(routeIds, pointsById, meta);
  const firstStateTransition = transitions.find((transition) => (
    transition.kind === "state" && transition.pointId === startPointId
  ));
  // At the exact origin show the state being left when it is explicitly
  // supplied (for example the full counter scene). Once movement starts,
  // routeStateAtProgress keeps an actor handoff alive unless the destination
  // mode is `none` for a scene exit.
  const visualStateId = clampedProgress === 0 && firstStateTransition
    ? null
    : stateId;
  const visualPresentation = routeActorAssetPresentation(
    meta,
    facing,
    visualStateId,
    fallback,
  );
  let visual: EditorVisualAsset = orientActorAsset({
    src: visualPresentation.src,
    mode: "actor",
    facing,
    stateId: visualStateId,
    assetScale: visualPresentation.assetScale,
    alphaBottom: visualPresentation.alphaBottom,
    flipX: visualPresentation.flipX,
  });

  if (clampedProgress === 0 && firstStateTransition) {
    const fromMode = firstStateTransition.fromAssetMode
      ?? (firstStateTransition.fromAssetSource ? "actor" : undefined);
    if (fromMode === "none") {
      visual = { ...visual, src: "", mode: "none", stateId: null };
    } else if (firstStateTransition.fromAssetSource) {
      const fromStateId = stateIdForAssetSource(meta, firstStateTransition.fromAssetSource);
      const fromPresentation = routeActorAssetPresentation(
        meta,
        facing,
        fromStateId,
        fallback,
      );
      visual = {
        ...visual,
        src: firstStateTransition.fromAssetSource,
        mode: fromMode ?? "actor",
        stateId: fromStateId,
        assetScale: fromPresentation.assetScale,
        alphaBottom: fromPresentation.alphaBottom,
        flipX: fromPresentation.flipX,
      };
      visual = applyTransitionAssetFraming(
        firstStateTransition,
        "from",
        applyTransitionAssetFacing(meta, firstStateTransition, "from", visual),
      );
    }
  }

  for (const transition of transitions) {
    if (transition.kind !== "state") continue;
    const transitionProgress = routeProgressAtPoint(routeIds, pointsById, transition.pointId);
    if (transition.pointId === startPointId) {
      if (clampedProgress <= transitionProgress) continue;
      // The start-state handoff remains active after the smoke transition,
      // but its presentation must follow the route's current facing/state.
      // Sampling just after the origin here re-applied the origin direction
      // on every render and masked any later mirror event.
      const nextFacing = routeFacingAtProgress(
        routeIds,
        pointsById,
        meta,
        clampedProgress,
      );
      const nextStateId = routeStateAtProgress(
        routeIds,
        pointsById,
        meta,
        clampedProgress,
      );
      const nextPresentation = routeActorAssetPresentation(
        meta,
        nextFacing,
        nextStateId,
        fallback,
      );
      visual = applyTransitionAssetFraming(
        transition,
        "to",
        applyTransitionAssetFacing(meta, transition, "to", orientActorAsset({
          src: transition.toAssetMode === "none"
            ? ""
            : transition.toAssetSource ?? nextPresentation.src,
          mode: transition.toAssetMode === "none"
            ? "none"
            : transition.toAssetSource ? transition.toAssetMode ?? "actor" : "actor",
          facing: nextFacing,
          stateId: nextStateId,
          assetScale: nextPresentation.assetScale,
          alphaBottom: nextPresentation.alphaBottom,
          flipX: nextPresentation.flipX,
        })),
      );
      continue;
    }
    if (clampedProgress < transitionProgress) break;
    const nextFacing = routeFacingAtProgress(
      routeIds,
      pointsById,
      meta,
      Math.min(1, transitionProgress + 0.0001),
    );
    const nextStateId = routeStateAtProgress(
      routeIds,
      pointsById,
      meta,
      Math.min(1, transitionProgress + 0.0001),
    );
    const nextPresentation = routeActorAssetPresentation(
      meta,
      nextFacing,
      nextStateId,
      fallback,
    );
    visual = applyTransitionAssetFraming(
      transition,
      "to",
      applyTransitionAssetFacing(meta, transition, "to", orientActorAsset({
        src: transition.toAssetMode === "none"
          ? ""
          : transition.toAssetSource ?? nextPresentation.src,
        mode: transition.toAssetMode === "none"
          ? "none"
          : transition.toAssetSource ? transition.toAssetMode ?? "actor" : "actor",
        facing: nextFacing,
        stateId: nextStateId,
        assetScale: nextPresentation.assetScale,
        alphaBottom: nextPresentation.alphaBottom,
        flipX: nextPresentation.flipX,
      })),
    );
  }
  return visual;
}

function transitionVisualAssets(
  meta: EditorRouteMeta,
  transition: EditorRouteTransition,
  fromAsset: EditorVisualAsset,
  toAsset: EditorVisualAsset,
): { from: EditorVisualAsset; to: EditorVisualAsset } {
  const from = transition.fromAssetMode === "none"
    ? { ...fromAsset, src: "", mode: "none" as const }
    : transition.fromAssetSource
      ? { ...fromAsset, src: transition.fromAssetSource, mode: transition.fromAssetMode ?? "actor" }
      : transition.fromAssetMode
        ? { ...fromAsset, mode: transition.fromAssetMode }
        : fromAsset;
  const to = transition.toAssetMode === "none"
    ? { ...toAsset, src: "", mode: "none" as const }
    : transition.toAssetSource
      ? { ...toAsset, src: transition.toAssetSource, mode: transition.toAssetMode ?? "actor" }
      : transition.toAssetMode
        ? { ...toAsset, mode: transition.toAssetMode }
        : toAsset;
  return {
    from: applyTransitionAssetFraming(
      transition,
      "from",
      applyTransitionAssetFacing(meta, transition, "from", orientActorAsset(from)),
    ),
    to: applyTransitionAssetFraming(
      transition,
      "to",
      applyTransitionAssetFacing(meta, transition, "to", orientActorAsset(to)),
    ),
  };
}

function actorImageStyle(asset: Pick<EditorVisualAsset, "flipX" | "alphaBottom">): CSSProperties {
  return {
    "--editor-asset-flip": asset.flipX ? -1 : 1,
    "--editor-asset-alpha-bottom": asset.alphaBottom ?? 0.894,
  } as CSSProperties;
}

function actorTransitionImageStyle(
  asset: Pick<EditorVisualAsset, "flipX" | "assetScale" | "alphaBottom">,
): CSSProperties {
  return {
    ...actorImageStyle(asset),
    "--editor-transition-asset-scale": asset.assetScale ?? 1,
  } as CSSProperties;
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  return false;
}

export default function GeometryTestPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toolWorkspaceRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<EditorDraft>(() => createInitialEditorDraft("study"));
  const [routeKey, setRouteKey] = useState<EditorRouteKey>("seat-to-door");
  const [selectedPointId, setSelectedPointId] = useState("seat-right");
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_ROUTE_PLAYBACK_SPEED);
  const [addMode, setAddMode] = useState(false);
  // Keep the editor preview readable by default. The obstacle switch controls
  // only the visible guide; the actor still uses the invisible alpha mask so
  // hiding the guide cannot change the actual depth result being previewed.
  const [showObstacleLayer, setShowObstacleLayer] = useState(false);
  const [notice, setNotice] = useState("草稿未导出");
  const [publishing, setPublishing] = useState(false);
  const [showAllRoutes, setShowAllRoutes] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("nodes");
  const [selectedInteractionId, setSelectedInteractionId] = useState("");
  const [selectedInteractionStateId, setSelectedInteractionStateId] = useState("");
  const [selectedInteractionAssetId, setSelectedInteractionAssetId] = useState("");
  const [draggingInteractionAsset, setDraggingInteractionAsset] = useState<DraggingInteractionAsset | null>(null);
  const [resizingInteractionAsset, setResizingInteractionAsset] = useState<ResizingInteractionAsset | null>(null);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [assetLibraryQuery, setAssetLibraryQuery] = useState("");
  const [assetLibraryItems, setAssetLibraryItems] = useState<AssetLibraryItem[]>([]);
  const [assetLibraryTotal, setAssetLibraryTotal] = useState(0);
  const [assetLibraryLoading, setAssetLibraryLoading] = useState(false);
  const [assetSlot, setAssetSlot] = useState<EditorFacingDirection>("left");
  const [assetStateId, setAssetStateId] = useState("");
  const [assetScaleInput, setAssetScaleInput] = useState("1");
  const [transitionAssetScaleInputs, setTransitionAssetScaleInputs] = useState({ from: "", to: "" });
  const [assetSourceInput, setAssetSourceInput] = useState("");
  const [previewTransition, setPreviewTransition] = useState<ActivePreviewTransition | null>(null);
  const transitionSequenceRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const pendingTransitionRef = useRef<ActiveTransitionEntry | null>(null);
  const previousFacingRef = useRef<EditorFacingDirection>("right");
  const previousProgressRef = useRef(0);
  const previousRouteKeyRef = useRef(routeKey);
  const hasHydratedDraftRef = useRef(false);
  const skipNextDraftPersistenceRef = useRef(false);

  const profile = getEditorSceneProfile(draft.sceneId);
  const canvas = profile.canvas;
  const activeRouteIds = draft.routes[routeKey] ?? [];
  const activeRouteLengthPx = useMemo(
    () => routeLengthPx(activeRouteIds, draft.pointsById),
    [activeRouteIds, draft.pointsById],
  );
  const activeRouteDurationMs = useMemo(
    () => routePlaybackDurationMs(activeRouteIds, draft.pointsById, playbackSpeed),
    [activeRouteIds, draft.pointsById, playbackSpeed],
  );
  const activePoints = useMemo(
    () => activeRouteIds.map((id) => draft.pointsById[id]).filter((point): point is EditorPoint => Boolean(point)),
    [activeRouteIds, draft.pointsById],
  );
  const selectedPoint = draft.pointsById[selectedPointId] ?? activePoints[0];
  const sceneInteractions = useMemo(
    () => Object.values(draft.sceneInteractions ?? {}),
    [draft.sceneInteractions],
  );
  const selectedInteraction = draft.sceneInteractions?.[selectedInteractionId]
    ?? sceneInteractions[0];
  const selectedInteractionState = selectedInteraction?.states.find((state) => state.id === selectedInteractionStateId)
    ?? selectedInteraction?.states[0];
  const selectedInteractionAsset = selectedInteraction?.assets.find((asset) => asset.id === selectedInteractionAssetId)
    ?? selectedInteraction?.assets[0];
  const interactionAnchorPoints = useMemo(
    () => Object.values(draft.pointsById).filter((point) => point.anchorKind === "interaction" || point.anchorKind === "portal"),
    [draft.pointsById],
  );
  const activeRouteMeta = editorRouteMeta(draft, routeKey);
  const selectedPointInteractionEvent = selectedPoint
    ? activeRouteMeta.interactionEvents?.find((event) => event.pointId === selectedPoint.id)
    : undefined;
  const selectedPointEventInteraction = selectedPointInteractionEvent
    ? draft.sceneInteractions?.[selectedPointInteractionEvent.interactionId]
    : undefined;
  const selectedAnchor = selectedPoint ? pointAnchorSemantics(draft, selectedPoint) : null;
  const activeSample = useMemo(
    () => routeSampleAtProgress(activeRouteIds, draft.pointsById, draft.scale, progress),
    [activeRouteIds, draft.pointsById, draft.scale, progress],
  );
  const interactionStateById = useMemo(() => {
    const states: Record<string, string> = {};
    for (const interaction of sceneInteractions) states[interaction.id] = interaction.initialStateId;
    for (const event of activeRouteMeta.interactionEvents ?? []) {
      if (!activeRouteIds.includes(event.pointId)) continue;
      const interaction = draft.sceneInteractions?.[event.interactionId];
      if (!interaction || !interaction.states.some((state) => state.id === event.stateId)) continue;
      const eventProgress = routeProgressAtPoint(activeRouteIds, draft.pointsById, event.pointId);
      if (eventProgress <= progress + 0.000001) states[event.interactionId] = event.stateId;
    }
    return states;
  }, [activeRouteIds, activeRouteMeta.interactionEvents, draft.pointsById, draft.sceneInteractions, progress, sceneInteractions]);
  const renderedSceneInteractionAssets = useMemo(() => sceneInteractions.flatMap((interaction) => {
    const stateId = interactionStateById[interaction.id] ?? interaction.initialStateId;
    const state = interaction.states.find((candidate) => candidate.id === stateId) ?? interaction.states[0];
    if (!state) return [];
    const anchor = draft.pointsById[interaction.anchorPointId]?.point;
    return state.visibleAssetIds.flatMap((assetId) => {
      const asset = interaction.assets.find((candidate) => candidate.id === assetId);
      if (!asset) return [];
      const attachedToActor = asset.mode === "actor" || state.actorAssetId === asset.id;
      const point = attachedToActor ? activeSample.point : anchor;
      if (!point) return [];
      return [{ interaction, state, asset, point, attachedToActor }];
    });
  }), [activeSample.point, draft.pointsById, interactionStateById, sceneInteractions]);
  const actorFacing = routeFacingAtProgress(activeRouteIds, draft.pointsById, activeRouteMeta, progress);
  const activeRouteTransitions = useMemo(
    () => editorRouteTransitions(activeRouteIds, draft.pointsById, activeRouteMeta),
    [activeRouteIds, draft.pointsById, activeRouteMeta],
  );
  const activeVisualAsset = useMemo(
    () => routeVisualAssetAtProgress(
      activeRouteIds,
      draft.pointsById,
      activeRouteMeta,
      profile.actorAssets,
      progress,
    ),
    [activeRouteIds, activeRouteMeta, draft.pointsById, profile.actorAssets, progress],
  );
  const routeTurnPointId = activeRouteTransitions.find((transition) => (
    transition.kind === "facing" && activeRouteIds.indexOf(transition.pointId) > 0
  ))?.pointId
    ?? (activeRouteMeta.facingSwitchAfterPointId
      && activeRouteIds.includes(activeRouteMeta.facingSwitchAfterPointId)
      && activeRouteIds.indexOf(activeRouteMeta.facingSwitchAfterPointId) > 0
      ? activeRouteMeta.facingSwitchAfterPointId
      : null);
  const routeTurnProgress = routeTurnPointId
    ? routeProgressAtPoint(activeRouteIds, draft.pointsById, routeTurnPointId)
    : null;
  const activeTransitionEntries = useMemo(
    () => activeRouteTransitions
      .filter((transition) => transition.kind !== "layer")
      .map((transition) => ({
        transition,
        eventProgress: routeProgressAtPoint(activeRouteIds, draft.pointsById, transition.pointId),
        progress: transitionTriggerProgress(activeRouteIds, draft.pointsById, transition),
      })),
    [activeRouteTransitions, activeRouteIds, draft.pointsById],
  );
  const previewActorAsset = previewTransition
    ? (previewTransition.toAsset.mode === "actor"
      ? previewTransition.toAsset
      : previewTransition.fromAsset.mode === "actor" ? previewTransition.fromAsset : null)
    : activeVisualAsset.mode === "actor" ? activeVisualAsset : null;
  const actor = activeRouteMeta.kind === "walk" && previewActorAsset
    ? { src: previewActorAsset.src, facing: previewActorAsset.facing }
    : null;
  const actorIsVisuallyEmpty = Boolean(
    actor && (
      activeVisualAsset.stateId === "leaving-study"
      || actor.src === STUDY_EXIT_TRANSPARENT_ACTOR_SRC
    ),
  );
  const stableSceneStateAsset = !previewTransition && activeVisualAsset.mode === "scene"
    ? activeVisualAsset
    : null;
  const previewSceneAssets = previewTransition
    ? {
        from: previewTransition.fromAsset.mode === "scene" ? previewTransition.fromAsset : null,
        to: previewTransition.toAsset.mode === "scene" ? previewTransition.toAsset : null,
      }
    : { from: null, to: null };
  const sceneCompositeActive = Boolean(stableSceneStateAsset || previewSceneAssets.from || previewSceneAssets.to);
  // Keep every actor-local effect on the same moving foot anchor. The smoke
  // transition can outlive the actor sprite or switch into a scene asset, so
  // this position must be available even when `actor` is temporarily null.
  const actorAnchorStyle = {
    ...pointToPercent(activeSample.point, canvas),
    "--editor-scale": activeSample.scale,
  } as CSSProperties;
  const actorStyle = actor ? actorAnchorStyle : undefined;
  const actorAssetScale = previewActorAsset?.assetScale ?? (
    activeVisualAsset.mode === "actor" ? activeVisualAsset.assetScale : undefined
  ) ?? 1;
  const actorRenderStyle = actorStyle
    ? ({
        ...actorStyle,
        // During a two-card handoff each image owns its own asset framing.
        // Keeping the outer wrapper at the route scale prevents the outgoing
        // state asset from shrinking or enlarging the incoming walking asset.
        "--editor-asset-scale": previewTransition ? 1 : actorAssetScale,
        "--editor-asset-flip": previewActorAsset?.flipX ? -1 : 1,
        ...(previewTransition
          ? {
              "--editor-transition-total": `${previewTransition.effectiveTotalMs}ms`,
              "--editor-transition-easing": transitionEasingCss(previewTransition.animation.easing),
              "--editor-turns": transitionRenderTurns(previewTransition.animation.turns),
            }
          : {}),
      } as CSSProperties)
    : undefined;
  const activeFloorStatus = selectedPoint && profile.floorPolygon
    ? pointInPolygon(selectedPoint.point, profile.floorPolygon)
    : null;
  const visibleForegroundLayers = sceneCompositeActive
    ? []
    : editorForegroundLayersAtProgress(
        activeRouteMeta,
        progress,
        routeTurnProgress,
        showObstacleLayer,
        profile.foregroundLayers,
        activeRouteIds,
        draft.pointsById,
      );
  const occlusionLayers = editorForegroundLayersAtProgress(
    activeRouteMeta,
    progress,
    routeTurnProgress,
    true,
    profile.foregroundLayers,
    activeRouteIds,
    draft.pointsById,
  );
  const actorMaskStyle = actorOcclusionMaskStyle(occlusionLayers);
  const routeEntries = Object.keys(draft.routes).map((key) => ({ key, meta: editorRouteMeta(draft, key) }));
  const selectedPointEvents = selectedPoint
    ? activeRouteTransitions.filter((transition) => transition.pointId === selectedPoint.id)
    : [];
  const selectedFacingTransition = selectedPointEvents.find((transition) => transition.kind === "facing");
  const selectedStateTransition = selectedPointEvents.find((transition) => transition.kind === "state");
  const selectedLayerTransition = selectedPointEvents.find((transition) => transition.kind === "layer");
  const selectedPointProgress = selectedPoint
    ? routeProgressAtPoint(activeRouteIds, draft.pointsById, selectedPoint.id)
    : 0;
  const inheritedLayerModes = selectedPoint
    ? routeLayerModesAtProgress(
        activeRouteIds,
        draft.pointsById,
        activeRouteMeta,
        selectedPointProgress > 0 ? selectedPointProgress - 0.000001 : 0,
      )
    : {};
  const selectedPointRouteCount = selectedPoint
    ? Object.values(draft.routes).filter((ids) => ids.includes(selectedPoint.id)).length
    : 0;
  const selectedAssetStateId = assetStateId.trim() || null;
  const selectedAssetSource = routeActorAssetSource(activeRouteMeta, assetSlot, selectedAssetStateId, profile.actorAssets);
  const assetStateOptions = Object.keys(activeRouteMeta.assetLibrary?.states ?? {}).sort();
  const selectedAssetState = selectedAssetStateId
    ? activeRouteMeta.assetLibrary?.states?.[selectedAssetStateId]
    : undefined;
  const selectedAssetCanonicalFacing = selectedAssetState?.canonicalFacing ?? "right";
  const selectedAssetScale = selectedAssetStateId
    ? (draft.sceneId === "attic"
      ? 1
      : activeRouteMeta.assetLibrary?.states?.[selectedAssetStateId]?.scale ?? 1)
    : 1;
  const selectedTransitionAssetScaleHint = (side: "from" | "to") => {
    if (!selectedStateTransition) return 1;
    const explicitScale = side === "from"
      ? selectedStateTransition.fromAssetScale
      : selectedStateTransition.toAssetScale;
    if (typeof explicitScale === "number") return explicitScale;
    const source = side === "from"
      ? selectedStateTransition.fromAssetSource
      : selectedStateTransition.toAssetSource;
    const sourceStateId = stateIdForAssetSource(activeRouteMeta, source)
      ?? (side === "to" ? selectedStateTransition.targetStateId ?? null : null);
    const stateScale = sourceStateId
      ? activeRouteMeta.assetLibrary?.states?.[sourceStateId]?.scale
      : undefined;
    if (typeof stateScale === "number") return stateScale;
    if (selectedPoint && activeRouteIds.length > 0) {
      const eventProgress = routeProgressAtPoint(activeRouteIds, draft.pointsById, selectedStateTransition.pointId);
      const fallbackAsset = routeVisualAssetAtProgress(
        activeRouteIds,
        draft.pointsById,
        activeRouteMeta,
        profile.actorAssets,
        side === "from" ? Math.max(0, eventProgress - 0.0001) : Math.min(1, eventProgress + 0.0001),
      );
      if (typeof fallbackAsset.assetScale === "number") return fallbackAsset.assetScale;
    }
    return 1;
  };

  const startPreviewTransition = (
    transition: EditorRouteTransition,
    fromAsset: EditorVisualAsset,
    toAsset: EditorVisualAsset,
  ) => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    const key = `${routeKey}:${transition.kind}:${transition.pointId}:${transitionSequenceRef.current + 1}`;
    const eventProgress = routeProgressAtPoint(activeRouteIds, draft.pointsById, transition.pointId);
    const triggerProgress = transitionTriggerProgress(activeRouteIds, draft.pointsById, transition);
    const isEntrySmoke = transition.kind === "state"
      && transition.pointId === activeRouteIds[0]
      && transition.animation.style === "smoke";
    const baseTotalMs = transitionTotalMs(transition.animation, isEntrySmoke ? "entry" : "default");
    const isFinalRouteState = isFinalRouteStateTransition(activeRouteIds, transition)
      && eventProgress >= 0.999999;
    const remainingRouteMs = isFinalRouteState
      ? Math.max(0, (1 - triggerProgress) * activeRouteDurationMs)
      : 0;
    const effectiveTotalMs = Math.max(baseTotalMs, Math.round(remainingRouteMs));
    transitionSequenceRef.current += 1;
    setPreviewTransition({
      ...transition,
      key,
      effectiveTotalMs,
      fromFacing: fromAsset.facing,
      toFacing: toAsset.facing,
      fromStateId: fromAsset.stateId,
      toStateId: toAsset.stateId,
      fromAsset,
      toAsset,
    });
    transitionTimerRef.current = window.setTimeout(() => {
      setPreviewTransition((current) => current?.key === key ? null : current);
      transitionTimerRef.current = null;
    }, effectiveTotalMs + 40);
  };

  const startTransitionEntry = (entry: ActiveTransitionEntry) => {
    const baseAssets = {
      from: routeVisualAssetAtProgress(
        activeRouteIds,
        draft.pointsById,
        activeRouteMeta,
        profile.actorAssets,
        Math.max(0, entry.eventProgress - 0.0001),
      ),
      to: routeVisualAssetAtProgress(
        activeRouteIds,
        draft.pointsById,
        activeRouteMeta,
        profile.actorAssets,
        Math.min(1, entry.eventProgress + 0.0001),
      ),
    };
    const visualAssets = transitionVisualAssets(activeRouteMeta, entry.transition, baseAssets.from, baseAssets.to);
    startPreviewTransition(entry.transition, visualAssets.from, visualAssets.to);
  };

  useEffect(() => {
    setAssetSourceInput(selectedAssetSource);
  }, [selectedAssetSource]);

  useEffect(() => {
    setAssetScaleInput(String(selectedAssetScale));
  }, [activeRouteMeta, assetSlot, selectedAssetStateId, selectedAssetScale]);

  useEffect(() => {
    setTransitionAssetScaleInputs({
      from: selectedStateTransition?.fromAssetScale === undefined ? "" : String(selectedStateTransition.fromAssetScale),
      to: selectedStateTransition?.toAssetScale === undefined ? "" : String(selectedStateTransition.toAssetScale),
    });
  }, [routeKey, selectedPoint?.id, selectedStateTransition?.pointId, selectedStateTransition?.fromAssetScale, selectedStateTransition?.toAssetScale]);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let previousTime: number | null = null;
    const animate = (time: number) => {
      if (previousTime === null) previousTime = time;
      const delta = time - previousTime;
      previousTime = time;
      setProgress((current) => {
        const next = current + delta / Math.max(1, activeRouteDurationMs);
        return Math.min(1, next);
      });
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [activeRouteDurationMs, playing]);

  useEffect(() => {
    if (playing && progress >= 1) setPlaying(false);
  }, [playing, progress]);

  useEffect(() => {
    try {
      const storedScene = window.localStorage.getItem(ACTIVE_SCENE_STORAGE_KEY);
      const sceneId = isEditorSceneId(storedScene) ? storedScene : "study";
      const selected = readStoredDraft(sceneId);
      const restored = migratePendingSceneComponents(selected?.draft ?? createInitialEditorDraft(sceneId));
      const nextRouteKey = storedRouteKeyForDraft(sceneId, restored);

      // Every restored draft is written back through the compact serializer.
      // This migrates old records that still contain inline base64 images and
      // keeps refresh/scene switching on the same canonical representation.
      if (selected) persistEditorDraft(restored, nextRouteKey);
      setDraft(restored);
      setRouteKey(nextRouteKey);
      setSelectedPointId(restored.routes[nextRouteKey]?.[0] ?? "");
      setShowObstacleLayer(getEditorSceneProfile(sceneId).foregroundLayers.length > 0);
      hasHydratedDraftRef.current = true;
      // The first effect pass still closes over the placeholder study draft.
      // Skip that pass so it cannot overwrite the draft we just restored.
      skipNextDraftPersistenceRef.current = true;
      setNotice(selected
        ? "已恢复浏览器中的上次草稿"
        : `已打开${getEditorSceneProfile(sceneId).label}场景初始草稿`);
    } catch {
      // A malformed local draft must not prevent the editor from opening.
      hasHydratedDraftRef.current = true;
      skipNextDraftPersistenceRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return undefined;
    if (skipNextDraftPersistenceRef.current) {
      skipNextDraftPersistenceRef.current = false;
      return undefined;
    }

    // Keep localStorage current while dragging/editing, but debounce writes so
    // pointer-move events do not turn every pixel into a synchronous storage
    // write. Scene changes still save synchronously in changeScene below.
    const timer = window.setTimeout(() => {
      try {
        persistEditorDraft(draft, routeKey);
      } catch {
        // A quota or browser-storage failure must not break the editor. The
        // explicit JSON export remains available as a recovery path.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draft, routeKey]);

  useEffect(() => {
    const nextRoute = draft.routes[routeKey] ?? [];
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
    pendingTransitionRef.current = null;
    setPreviewTransition(null);
    setSelectedPointId(nextRoute[0] ?? "");
    setProgress(0);
    setAddMode(false);
    setInspectorTab("nodes");
    setAssetStateId("");
    setAssetSlot("left");
    // A new route owns its initial facing. Carrying the previous route's
    // cached facing into this frame makes the direction effect synthesize a
    // phantom mirror animation before the actor has even started moving.
    previousFacingRef.current = routeFacingAtProgress(
      nextRoute,
      draft.pointsById,
      editorRouteMeta(draft, routeKey),
      0,
    );
    previousProgressRef.current = 0;
    previousRouteKeyRef.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
    const firstInteraction = sceneInteractions[0];
    setSelectedInteractionId((current) => (
      current && draft.sceneInteractions?.[current] ? current : firstInteraction?.id ?? ""
    ));
    setSelectedInteractionStateId((current) => (
      selectedInteraction?.states.some((state) => state.id === current)
        ? current
        : selectedInteraction?.states[0]?.id ?? ""
    ));
    setSelectedInteractionAssetId((current) => (
      selectedInteraction?.assets.some((asset) => asset.id === current)
        ? current
        : selectedInteraction?.assets[0]?.id ?? ""
    ));
  }, [draft.sceneId, draft.sceneInteractions, sceneInteractions, selectedInteraction]);

  useEffect(() => {
    // A scene-composite state intentionally has no actor sprite. Do not treat
    // that absence as a direction change to the default right-facing asset;
    // doing so re-entered the mirror preview after a smoke reveal completed.
    if (previewTransition || !actor) {
      previousFacingRef.current = actor ? actorFacing : "right";
      return;
    }
    const nextFacing = actorFacing;
    const previousFacing = previousFacingRef.current;
    previousFacingRef.current = nextFacing;
    if (previousFacing === nextFacing) return;
    const fromStateId = routeStateAtProgress(
      activeRouteIds,
      draft.pointsById,
      activeRouteMeta,
      Math.max(0, progress - 0.0001),
    );
    const toStateId = routeStateAtProgress(
      activeRouteIds,
      draft.pointsById,
      activeRouteMeta,
      Math.min(1, progress + 0.0001),
    );
    const fromPresentation = routeActorAssetPresentation(
      activeRouteMeta,
      previousFacing,
      fromStateId,
      profile.actorAssets,
    );
    const toPresentation = routeActorAssetPresentation(
      activeRouteMeta,
      nextFacing,
      toStateId,
      profile.actorAssets,
    );
    startPreviewTransition(
      {
        pointId: activeRouteTransitions.find((transition) => transition.kind === "facing")?.pointId ?? "auto-facing",
        kind: "facing",
        facing: nextFacing,
        animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
      },
      {
        src: fromPresentation.src,
        mode: "actor",
        facing: previousFacing,
        stateId: fromStateId,
        assetScale: fromPresentation.assetScale,
        alphaBottom: fromPresentation.alphaBottom,
        flipX: fromPresentation.flipX,
      },
      {
        src: toPresentation.src,
        mode: "actor",
        facing: nextFacing,
        stateId: toStateId,
        assetScale: toPresentation.assetScale,
        alphaBottom: toPresentation.alphaBottom,
        flipX: toPresentation.flipX,
      },
    );
  }, [actor, actorFacing, activeRouteIds, activeRouteMeta, activeRouteTransitions, draft.pointsById, previewTransition, progress, profile.actorAssets]);

  useEffect(() => {
    if (previousRouteKeyRef.current !== routeKey) {
      previousRouteKeyRef.current = routeKey;
      previousProgressRef.current = progress;
      pendingTransitionRef.current = null;
      return;
    }
    const previousProgress = previousProgressRef.current;
    const wrapped = progress < previousProgress;
    const crossedEntries = activeTransitionEntries.filter(({ progress: transitionProgress, transition }) => {
      const isCurrentTransition = previewTransition
        && transition.kind === previewTransition.kind
        && transition.pointId === previewTransition.pointId;
      if (isCurrentTransition) return false;
      const isStartSmoke = transitionProgress === 0
        && previousProgress === 0
        && progress > 0
        && transition.kind === "state"
        && (transition.animation.style === "smoke" || transition.animation.style === "scene-switch");
      return wrapped
        ? transitionProgress > previousProgress || transitionProgress <= progress
        : isStartSmoke || (transitionProgress > previousProgress && transitionProgress <= progress);
    });
    // A slider jump or a slow frame can cross more than one event at once.
    // Pick the event nearest the new position instead of the first event in
    // route order; otherwise a terminal smoke event is easily hidden behind
    // an earlier mirror event. When scrubbing backwards, the lowest crossed
    // event is the one nearest the new position.
    const crossed = wrapped ? crossedEntries[0] : crossedEntries.at(-1);

    if (wrapped) {
      // Scrubbing backwards should not leave a forward transition queued for
      // a position the actor has already left.
      pendingTransitionRef.current = null;
    }

    // A facing animation can still be active when the final smoke trigger is
    // crossed. Let the final smoke state take over immediately; otherwise the
    // current animation finishes before the next crossed event is replayed.
    if (previewTransition) {
      if (crossed && isFinalRouteStateTransition(activeRouteIds, crossed.transition)) {
        pendingTransitionRef.current = null;
        startTransitionEntry(crossed);
      } else if (crossed) {
        pendingTransitionRef.current = crossed;
      }
      previousProgressRef.current = progress;
      return;
    }
    // If the previous animation ended after the route had already crossed a
    // later event, replay that event now. This makes autoplay and large slider
    // jumps deterministic without requiring the user to hit every node.
    const pending = pendingTransitionRef.current;
    if (pending && !wrapped && progress >= pending.progress) {
      pendingTransitionRef.current = null;
      startTransitionEntry(pending);
      previousProgressRef.current = progress;
      return;
    }
    pendingTransitionRef.current = null;
    // Start-point smoke/scene-switch events fire on the first movement frame;
    // endpoint events remain valid and fire when the route reaches its final
    // state. A static frame at progress 0 is kept free of the destination
    // scene, so the smoke is the visible entrance from an outside scene.
    if (!wrapped && crossed && crossed.progress <= 1) {
      startTransitionEntry(crossed);
    }
    previousProgressRef.current = progress;
  }, [
    activeTransitionEntries,
    activeRouteIds,
    activeRouteMeta,
    draft.pointsById,
    profile.actorAssets,
    progress,
    previewTransition,
    routeKey,
    activeRouteDurationMs,
  ]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
  }, []);

  const changeScene = (sceneId: EditorSceneId) => {
    if (sceneId === draft.sceneId) return;
    try {
      persistEditorDraft(draft, routeKey);
      const selected = readStoredDraft(sceneId);
      const restored = selected?.draft ?? null;
      if (restored) {
        // Re-save every restored draft through the compact serializer. This
        // also migrates old canonical records that still contain inline
        // base64 images before the next scene switch can hit the quota.
        persistEditorDraft(restored, storedRouteKeyForDraft(sceneId, restored));
      }
      const nextDraft = restored?.sceneId === sceneId ? restored : createInitialEditorDraft(sceneId);
      const nextProfile = getEditorSceneProfile(sceneId);
      const nextRouteKey = restored
        ? storedRouteKeyForDraft(sceneId, nextDraft)
        : Object.keys(nextDraft.routes)[0] ?? nextProfile.protectedRouteKeys[0] ?? "";
      try {
        window.localStorage.setItem(ACTIVE_SCENE_STORAGE_KEY, sceneId);
        window.localStorage.setItem(activeRouteStorageKey(sceneId), nextRouteKey);
      } catch {
        // The next hydration can infer both values from the selected draft.
      }
      setDraft(nextDraft);
      setRouteKey(nextRouteKey);
      setSelectedPointId(nextDraft.routes[nextRouteKey]?.[0] ?? "");
      setProgress(0);
      setShowObstacleLayer(nextProfile.foregroundLayers.length > 0);
      setNotice(`${nextProfile.label}场景已切换`);
    } catch {
      const nextDraft = createInitialEditorDraft(sceneId);
      const nextRouteKey = Object.keys(nextDraft.routes)[0] ?? "";
      try {
        window.localStorage.setItem(ACTIVE_SCENE_STORAGE_KEY, sceneId);
        window.localStorage.setItem(activeRouteStorageKey(sceneId), nextRouteKey);
      } catch {
        // Keep the fallback scene usable even if browser storage is full.
      }
      setDraft(nextDraft);
      setRouteKey(nextRouteKey);
      setSelectedPointId(nextDraft.routes[nextRouteKey]?.[0] ?? "");
      const nextProfile = getEditorSceneProfile(sceneId);
      setShowObstacleLayer(nextProfile.foregroundLayers.length > 0);
      setNotice(`${nextProfile.label}场景已切换，未能读取本地草稿`);
    }
  };

  const updateScale = (key: keyof EditorDraft["scale"], value: number | string) => {
    setDraft((current) => ({
      ...current,
      scale: {
        ...current.scale,
        [key]: key === "mode" ? value : Number(value),
      },
    }));
  };

  const handleSceneAssetScalePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    interactionId: string,
    assetId: string,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const interaction = draft.sceneInteractions?.[interactionId];
    const asset = interaction?.assets.find((candidate) => candidate.id === assetId);
    const anchor = asset
      ? asset.mode === "actor"
        ? activeSample.point
        : draft.pointsById[interaction?.anchorPointId ?? ""]?.point
      : undefined;
    if (!asset || !anchor) return;
    const pointerPoint = pointFromPointer(event, stageRef.current, canvas);
    const assetOffset = asset.offset ?? [0, 0];
    const renderedAnchor: SceneGeometryPoint = [
      anchor[0] + assetOffset[0],
      anchor[1] + assetOffset[1],
    ];
    const startDistance = Math.max(
      24,
      Math.hypot(pointerPoint[0] - renderedAnchor[0], pointerPoint[1] - renderedAnchor[1]),
    );
    stageRef.current?.setPointerCapture(event.pointerId);
    setSelectedInteractionId(interactionId);
    setSelectedInteractionAssetId(assetId);
    setResizingInteractionAsset({
      interactionId,
      assetId,
      anchor: [...anchor] as SceneGeometryPoint,
      startDistance,
      startScale: clamp(asset.scale ?? 1, 0.01, 8),
    });
    setInspectorTab("interactions");
    setNotice("正在调整素材倍率；拖动右下角手柄，锚点位置不会改变");
  };

  const handleSceneAssetPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    interactionId: string,
    assetId: string,
    stateId: string,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const interaction = draft.sceneInteractions?.[interactionId];
    const asset = interaction?.assets.find((candidate) => candidate.id === assetId);
    const anchor = asset
      ? asset.mode === "actor"
        ? activeSample.point
        : draft.pointsById[interaction?.anchorPointId ?? ""]?.point
      : undefined;
    const pointerPoint = pointFromPointer(event, stageRef.current, canvas);
    const assetOffset = asset?.offset ?? [0, 0];
    const pointerOffset: SceneGeometryPoint = anchor
      ? [
          pointerPoint[0] - anchor[0] - assetOffset[0],
          pointerPoint[1] - anchor[1] - assetOffset[1],
        ]
      : [0, 0];
    setSelectedInteractionId(interactionId);
    setSelectedInteractionStateId(stateId);
    setSelectedInteractionAssetId(assetId);
    stageRef.current?.setPointerCapture(event.pointerId);
    setDraggingInteractionAsset({ interactionId, assetId, pointerOffset });
    setInspectorTab("interactions");
    setNotice("正在拖动场景素材；松开鼠标后会保存它相对锚点的偏移");
  };

  const handleStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!addMode) return;
    const point = pointFromPointer(event, stageRef.current, canvas);
    const id = makePointId(draft, routeKey);
    const newPoint: EditorPoint = {
      id,
      label: `${editorRouteMeta(draft, routeKey).label}节点 ${activePoints.length + 1}`,
      role: "waypoint",
      point,
    };
    setDraft((current) => {
      const currentPoints = (current.routes[routeKey] ?? [])
        .map((pointId) => current.pointsById[pointId])
        .filter((candidate): candidate is EditorPoint => Boolean(candidate));
      const segment = nearestSegmentIndex(currentPoints, point);
      const nextIds = [...(current.routes[routeKey] ?? [])];
      nextIds.splice(segment + 1, 0, id);
      return {
        ...current,
        pointsById: { ...current.pointsById, [id]: newPoint },
        routes: { ...current.routes, [routeKey]: nextIds },
      };
    });
    setSelectedPointId(id);
    setAddMode(false);
    setNotice(`已插入节点 ${formatPoint(point)}`);
  };

  const handlePointPointerDown = (event: PointerEvent<SVGCircleElement>, pointId: string) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedPointId(pointId);
    const point = draft.pointsById[pointId];
    if (!point) {
      setDraggingPointId(null);
      setNotice("找不到这个路线点位");
      return;
    }
    const prepared = point.role === "waypoint"
      ? clonePointForRoute(draft, routeKey, pointId)
      : { draft, pointId };
    if (prepared.pointId !== pointId) {
      setDraft(prepared.draft);
      setSelectedPointId(prepared.pointId);
    }
    stageRef.current?.setPointerCapture(event.pointerId);
    setDraggingPointId(prepared.pointId);
    const referencedRouteCount = Object.values(draft.routes).filter((ids) => ids.includes(pointId)).length;
    setNotice(point.role === "waypoint"
      ? "正在拖动当前路线专属节点"
      : `正在拖动共享语义锚点：${point.label}（会同步影响 ${referencedRouteCount} 条路线）`);
  };

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (resizingInteractionAsset) {
      event.preventDefault();
      const point = pointFromPointer(event, stageRef.current, canvas);
      setDraft((current) => {
        const interaction = current.sceneInteractions?.[resizingInteractionAsset.interactionId];
        const asset = interaction?.assets.find((candidate) => candidate.id === resizingInteractionAsset.assetId);
        if (!interaction || !asset) return current;
        const distance = Math.hypot(
          point[0] - resizingInteractionAsset.anchor[0] - (asset.offset?.[0] ?? 0),
          point[1] - resizingInteractionAsset.anchor[1] - (asset.offset?.[1] ?? 0),
        );
        const nextScale = clamp(
          resizingInteractionAsset.startScale * distance / resizingInteractionAsset.startDistance,
          0.01,
          8,
        );
        return {
          ...current,
          sceneInteractions: {
            ...(current.sceneInteractions ?? {}),
            [interaction.id]: {
              ...interaction,
              assets: interaction.assets.map((candidate) => candidate.id === asset.id
                ? { ...candidate, scale: Number(nextScale.toFixed(3)) }
                : candidate),
            },
          },
        };
      });
      return;
    }
    if (draggingInteractionAsset) {
      event.preventDefault();
      const point = pointFromPointer(event, stageRef.current, canvas);
      setDraft((current) => {
        const interaction = current.sceneInteractions?.[draggingInteractionAsset.interactionId];
        const asset = interaction?.assets.find((candidate) => candidate.id === draggingInteractionAsset.assetId);
        if (!interaction || !asset) return current;
        const anchor = asset.mode === "actor"
          ? activeSample.point
          : current.pointsById[interaction.anchorPointId]?.point;
        if (!anchor) return current;
        const nextAsset = {
          ...asset,
          offset: [
            Math.round(point[0] - draggingInteractionAsset.pointerOffset[0] - anchor[0]),
            Math.round(point[1] - draggingInteractionAsset.pointerOffset[1] - anchor[1]),
          ] as [number, number],
        };
        return {
          ...current,
          sceneInteractions: {
            ...(current.sceneInteractions ?? {}),
            [interaction.id]: {
              ...interaction,
              assets: interaction.assets.map((candidate) => candidate.id === asset.id ? nextAsset : candidate),
            },
          },
        };
      });
      return;
    }
    if (!draggingPointId) return;
    event.preventDefault();
    setDraft((current) => updatePoint(current, draggingPointId, pointFromPointer(event, stageRef.current, canvas)));
  };

  const handleStagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (resizingInteractionAsset) {
      stageRef.current?.releasePointerCapture(event.pointerId);
      setResizingInteractionAsset(null);
      setNotice("素材倍率已更新，可继续拖动右下角手柄微调");
      return;
    }
    if (draggingInteractionAsset) {
      stageRef.current?.releasePointerCapture(event.pointerId);
      setDraggingInteractionAsset(null);
      setNotice("场景素材位置已更新，可继续拖动或在右侧用像素偏移微调");
      return;
    }
    if (draggingPointId) {
      stageRef.current?.releasePointerCapture(event.pointerId);
      setNotice("点位已更新，可继续拖动或导出");
    }
    setDraggingPointId(null);
  };

  const removeSelectedPoint = () => {
    if (!selectedPoint || selectedPoint.role !== "waypoint") return;
    setDraft((current) => {
      const nextRoutes = {
        ...current.routes,
        [routeKey]: (current.routes[routeKey] ?? []).filter((id) => id !== selectedPoint.id),
      };
      const stillReferenced = Object.values(nextRoutes).some((ids) => ids.includes(selectedPoint.id));
      const nextPoints = stillReferenced ? current.pointsById : { ...current.pointsById };
      if (!stillReferenced) delete nextPoints[selectedPoint.id];
      const currentMeta = current.routeMeta?.[routeKey];
      const nextRouteMeta = currentMeta
        ? {
            ...currentMeta,
            ...(currentMeta.facingSwitchAfterPointId === selectedPoint.id
              ? (() => { const { facingSwitchAfterPointId: _removed, ...withoutFacingPoint } = currentMeta; return withoutFacingPoint; })()
              : {}),
            ...(currentMeta.transitions
              ? { transitions: currentMeta.transitions.filter((transition) => transition.pointId !== selectedPoint.id) }
              : {}),
          }
        : undefined;
      return {
        ...current,
        pointsById: nextPoints,
        routes: nextRoutes,
        ...(nextRouteMeta ? { routeMeta: { ...(current.routeMeta ?? {}), [routeKey]: nextRouteMeta } } : {}),
      };
    });
    setSelectedPointId(activeRouteIds.find((id) => id !== selectedPoint.id) ?? "");
    setNotice("已删除当前路线节点");
  };

  const insertPointBetweenSelected = () => {
    if (!selectedPoint || activePoints.length < 2) return;
    const selectedIndex = activeRouteIds.indexOf(selectedPoint.id);
    const nextPoint = activeRouteIds[selectedIndex + 1]
      ? draft.pointsById[activeRouteIds[selectedIndex + 1]!]
      : undefined;
    if (selectedIndex < 0 || !nextPoint) {
      setNotice("请先选中一个不是终点的节点");
      return;
    }
    const id = makePointId(draft, routeKey);
    const point: SceneGeometryPoint = [
      (selectedPoint.point[0] + nextPoint.point[0]) / 2,
      (selectedPoint.point[1] + nextPoint.point[1]) / 2,
    ];
    const newPoint: EditorPoint = {
      id,
      label: `${editorRouteMeta(draft, routeKey).label}中间节点`,
      role: "waypoint",
      point,
    };
    setDraft((current) => {
      const index = current.routes[routeKey]?.indexOf(selectedPoint.id) ?? -1;
      if (index < 0) return current;
      const nextIds = [...(current.routes[routeKey] ?? [])];
      nextIds.splice(index + 1, 0, id);
      return {
        ...current,
        pointsById: { ...current.pointsById, [id]: newPoint },
        routes: { ...current.routes, [routeKey]: nextIds },
      };
    });
    setSelectedPointId(id);
    setNotice(`已在 ${selectedPoint.label} 与 ${nextPoint.label} 之间插入节点`);
  };

  const createRoute = () => {
    const nextRouteKey = makeRouteId(draft);
    const firstPoint = activePoints.find((point) => point.id === selectedPoint?.id) ?? activePoints[0];
    const secondPoint = activePoints.find((point) => point.id !== firstPoint?.id) ?? firstPoint;
    if (!firstPoint || !secondPoint) return;
    const label = `新路线 ${Object.keys(draft.routes).length - 2}`;
    let nextDraft = draft;
    const copiedPointIds: string[] = [];
    for (const point of [firstPoint, secondPoint]) {
      // A newly created route owns both endpoints. This prevents moving its
      // starting point from silently moving the built-in seat/door routes.
      const prepared = clonePointForRoute(nextDraft, nextRouteKey, point.id, true);
      nextDraft = prepared.draft;
      copiedPointIds.push(prepared.pointId);
    }
    setDraft({
      ...nextDraft,
      routes: { ...nextDraft.routes, [nextRouteKey]: copiedPointIds },
      routeMeta: {
        ...nextDraft.routeMeta,
        [nextRouteKey]: makeRouteMeta(nextRouteKey, label, "walk"),
      },
    });
    setRouteKey(nextRouteKey);
    setSelectedPointId(copiedPointIds[0] ?? firstPoint.id);
    setNotice(`已创建${label}，可插入或拖动节点`);
  };

  const createRouteFromSource = (reverse: boolean) => {
    const sourceRouteIds = draft.routes[routeKey] ?? [];
    if (sourceRouteIds.length < 2) {
      setNotice("褰撳墠璺嚎鑷冲皯闇€瑕佷袱涓妭鐐规墠鑳藉鐢ㄣ€?");
      return;
    }

    const sourceMeta = editorRouteMeta(draft, routeKey);
    const {
      startPointId: _sourceStartPointId,
      endPointId: _sourceEndPointId,
      facingSwitchAfterPointId: sourceFacingSwitchAfterPointId,
      facingAfterSwitch: sourceFacingAfterSwitch,
      initialFacing: sourceInitialFacing,
      transitions: sourceMetaTransitions,
      ...sourceMetaWithoutRouteFacing
    } = sourceMeta;
    const sourceTransitions = editorRouteTransitions(sourceRouteIds, draft.pointsById, sourceMeta);
    const reversedFacingContract = reverse
      ? reverseRouteFacingContract(sourceRouteIds, draft.pointsById, sourceMeta)
      : null;
    const nextRouteKey = makeRouteId(draft);
    const pointIdMap = new Map<string, string>();
    let nextDraft = draft;

    // Every copied point gets a new owner, including semantic endpoints. This
    // keeps later bedroom/entrance edits from leaking into the source route.
    for (const sourcePointId of sourceRouteIds) {
      const prepared = clonePointForRoute(nextDraft, nextRouteKey, sourcePointId, true);
      nextDraft = prepared.draft;
      pointIdMap.set(sourcePointId, prepared.pointId);
    }

    const orderedSourceIds = reverse ? [...sourceRouteIds].reverse() : [...sourceRouteIds];
    const copiedPointIds = orderedSourceIds
      .map((pointId) => pointIdMap.get(pointId))
      .filter((pointId): pointId is string => Boolean(pointId));
    const remapPointId = (pointId: string | undefined) => (
      pointId ? pointIdMap.get(pointId) ?? pointId : undefined
    );
    const copiedTransitions = !reverse && sourceMetaTransitions === undefined
      ? undefined
      : sourceTransitions
        .map((transition) => {
          const copiedTransition = reverse ? reverseCopiedStateTransition(transition) : transition;
          const reversedFacing = reverse && transition.kind === "facing"
            ? reversedFacingContract?.facingBySourcePointId.get(transition.pointId)
            : undefined;
          return {
            ...copiedTransition,
            pointId: remapPointId(transition.pointId) ?? transition.pointId,
            animation: { ...copiedTransition.animation },
            ...(copiedTransition.layerModes ? { layerModes: { ...copiedTransition.layerModes } } : {}),
            ...(reverse && transition.kind === "facing"
              ? { facing: reversedFacing ?? oppositeFacing(transition.facing ?? sourceInitialFacing ?? "right") }
              : {}),
          };
        })
        .sort((left, right) => copiedPointIds.indexOf(left.pointId) - copiedPointIds.indexOf(right.pointId));
    const nextRouteMeta: EditorRouteMeta = {
      ...sourceMetaWithoutRouteFacing,
      id: nextRouteKey,
      label: `${reverse ? "反向·" : "复用·"}${sourceMeta.label}`.slice(0, 80),
      ...(copiedPointIds[0] ? { startPointId: copiedPointIds[0]! } : {}),
      ...(copiedPointIds.at(-1) ? { endPointId: copiedPointIds.at(-1)! } : {}),
      ...(reverse
        ? { initialFacing: reversedFacingContract?.initialFacing ?? oppositeFacing(sourceInitialFacing ?? "right") }
        : {
            ...(sourceInitialFacing ? { initialFacing: sourceInitialFacing } : {}),
            ...(sourceFacingAfterSwitch ? { facingAfterSwitch: sourceFacingAfterSwitch } : {}),
            ...(sourceFacingSwitchAfterPointId
              ? { facingSwitchAfterPointId: remapPointId(sourceFacingSwitchAfterPointId) ?? sourceFacingSwitchAfterPointId }
              : {}),
          }),
      ...(copiedTransitions !== undefined ? { transitions: copiedTransitions } : {}),
      ...(sourceMeta.assetLibrary
        ? {
            assetLibrary: {
              ...sourceMeta.assetLibrary,
              ...(sourceMeta.assetLibrary.states
                ? {
                    states: Object.fromEntries(Object.entries(sourceMeta.assetLibrary.states).map(([stateId, assets]) => [
                      stateId,
                      { ...assets },
                    ])),
                  }
                : {}),
            },
          }
        : {}),
    };

    const createdDraft = ensureStudyTerminalStateTransitions({
      ...nextDraft,
      routes: { ...nextDraft.routes, [nextRouteKey]: copiedPointIds },
      routeMeta: { ...(nextDraft.routeMeta ?? {}), [nextRouteKey]: nextRouteMeta },
    });
    setDraft(createdDraft);
    setRouteKey(nextRouteKey);
    setSelectedPointId(copiedPointIds[0] ?? "");
    setNotice(`${reverse ? "已反向复制" : "已复用"}「${sourceMeta.label}」，新路线节点已完全独立`);
  };

  const updateRouteLabel = (label: string) => {
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      return {
        ...current,
        routeMeta: {
          ...(current.routeMeta ?? {}),
          [routeKey]: {
            ...baseMeta,
            id: routeKey,
            label: label.slice(0, 80),
          },
        },
      };
    });
  };

  const deleteCurrentRoute = () => {
    if (profile.protectedRouteKeys.includes(routeKey)) {
      setNotice("当前场景的内置路线不能删除；如需新路线请先创建副本");
      return;
    }
    setDraft((current) => {
      const nextRoutes = { ...current.routes };
      delete nextRoutes[routeKey];
      const nextMeta = { ...(current.routeMeta ?? {}) };
      delete nextMeta[routeKey];
      return { ...current, routes: nextRoutes, routeMeta: nextMeta };
    });
    setRouteKey(profile.protectedRouteKeys[0] ?? Object.keys(draft.routes)[0] ?? "");
    setNotice("已删除当前自定义路线");
  };

  const importDraft = () => {
    const raw = window.prompt("粘贴 route-editor.v2.json 或 study-route-editor.v1.json 内容");
    if (!raw) return;
    try {
      const imported = deserializeEditorDraft(JSON.parse(raw));
      if (!imported) {
        setNotice("JSON 无法识别：请确认来自本编辑器的导出文件");
        return;
      }
      setDraft(imported);
      const importedRouteKey = Object.keys(imported.routes)[0] ?? "";
      setRouteKey(importedRouteKey);
      setSelectedPointId(imported.routes[importedRouteKey]?.[0] ?? "");
      setNotice("已导入路线 JSON");
    } catch {
      setNotice("JSON 格式错误，未导入");
    }
  };

  const setSelectedCoordinate = (axis: 0 | 1, value: string) => {
    if (!selectedPoint) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const selectedId = selectedPoint.id;
    const prepared = selectedPoint.role === "waypoint"
      ? clonePointForRoute(draft, routeKey, selectedId)
      : { draft, pointId: selectedId };
    if (prepared.pointId !== selectedId) setSelectedPointId(prepared.pointId);
    const nextPointValue = clamp(numeric, 0, axis === 0 ? canvas.width : canvas.height);
    setDraft(() => updatePoint(
      prepared.draft,
      prepared.pointId,
      axis === 0
        ? [nextPointValue, prepared.draft.pointsById[prepared.pointId]?.point[1] ?? 0]
        : [prepared.draft.pointsById[prepared.pointId]?.point[0] ?? 0, nextPointValue],
    ));
  };

  const setTransitionEnabled = (kind: EditorRouteTransition["kind"], enabled: boolean) => {
    if (!selectedPoint) return;
    const selectedId = selectedPoint.id;
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      const explicitTransitions = baseMeta.transitions ?? [];
      const currentTransition = editorRouteTransitions(
        current.routes[routeKey] ?? [],
        current.pointsById,
        baseMeta,
      ).find((transition) => transition.pointId === selectedId && transition.kind === kind);
      const nextTransitions = explicitTransitions.filter((transition) => (
        transition.pointId !== selectedId || transition.kind !== kind
      ));
      if (enabled) {
        let nextTransition = currentTransition ?? makeEditorTransition(
          selectedId,
          kind,
          selectedId === current.routes[routeKey]?.[0],
        );
        if (kind === "layer") {
          const { layerMode: _legacyLayerMode, ...withoutLegacyLayerMode } = nextTransition;
          nextTransition = {
            ...withoutLegacyLayerMode,
            layerModes: nextTransition.layerModes
              ?? (nextTransition.layerMode ? { "*": nextTransition.layerMode } : {}),
          };
        }
        nextTransitions.push(nextTransition);
      }
      const { facingSwitchAfterPointId: _legacyFacingPointId, ...withoutLegacyFacing } = baseMeta;
      const nextMeta: EditorRouteMeta = {
        ...withoutLegacyFacing,
        transitions: nextTransitions,
        ...(kind === "facing" && enabled ? { facingSwitchAfterPointId: selectedId } : {}),
      };
      return {
        ...current,
        routeMeta: { ...(current.routeMeta ?? {}), [routeKey]: nextMeta },
      };
    });
    const kindLabel = kind === "facing" ? "镜像切换" : kind === "state" ? "状态过渡" : "层级切换";
    setNotice(enabled ? `已为${selectedPoint.label}启用${kindLabel}` : `已清除${selectedPoint.label}的${kindLabel}`);
  };

  const updateSelectedTransition = (
    kind: EditorRouteTransition["kind"],
    update: (transition: EditorRouteTransition) => EditorRouteTransition,
  ) => {
    if (!selectedPoint) return;
    const selectedId = selectedPoint.id;
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      const existing = editorRouteTransitions(
        current.routes[routeKey] ?? [],
        current.pointsById,
        baseMeta,
      ).find((transition) => transition.pointId === selectedId && transition.kind === kind);
      const nextTransition = update(existing ?? makeEditorTransition(
        selectedId,
        kind,
        selectedId === current.routes[routeKey]?.[0],
      ));
      const explicitTransitions = (baseMeta.transitions ?? []).filter((transition) => (
        transition.pointId !== selectedId || transition.kind !== kind
      ));
      explicitTransitions.push({
        ...nextTransition,
        pointId: selectedId,
        kind,
      });
      const nextMeta: EditorRouteMeta = {
        ...baseMeta,
        transitions: explicitTransitions,
        ...(kind === "facing" ? { facingSwitchAfterPointId: selectedId } : {}),
      };
      return {
        ...current,
        routeMeta: { ...(current.routeMeta ?? {}), [routeKey]: nextMeta },
      };
    });
  };

  const updateSelectedLayerMode = (layerId: string, layerMode: EditorLayerMode) => {
    updateSelectedTransition("layer", (transition) => {
      const { layerMode: _legacyLayerMode, ...withoutLegacyLayerMode } = transition;
      return {
        ...withoutLegacyLayerMode,
        layerModes: {
          ...(transition.layerModes ?? (transition.layerMode ? { "*": transition.layerMode } : {})),
          [layerId]: layerMode,
        },
      };
    });
  };

  const setAllSelectedLayerModes = (layerMode: EditorLayerMode) => {
    updateSelectedTransition("layer", (transition) => {
      const { layerMode: _legacyLayerMode, ...withoutLegacyLayerMode } = transition;
      return {
        ...withoutLegacyLayerMode,
        layerModes: Object.fromEntries(profile.foregroundLayers.map((layer) => [layer.id, layerMode])),
      };
    });
  };

  const updateSelectedTransitionAnimation = (
    kind: EditorRouteTransition["kind"],
    update: Partial<EditorTransitionAnimation>,
  ) => {
    updateSelectedTransition(kind, (transition) => {
      const animation = { ...transition.animation, ...update };
      return {
        ...transition,
        animation: {
          ...animation,
          turns: Number.isFinite(animation.turns) ? clamp(animation.turns, 0.5, 8) : transition.animation.turns,
          durationMs: Number.isFinite(animation.durationMs) ? clamp(Math.round(animation.durationMs), 80, 5000) : transition.animation.durationMs,
          settleMs: Number.isFinite(animation.settleMs) ? clamp(Math.round(animation.settleMs), 0, 3000) : transition.animation.settleMs,
        },
      };
    });
  };

  const updateSelectedTransitionAssetSource = (side: "from" | "to", source: string) => {
    const normalizedSource = normalizeEditorAssetSource(source);
    updateSelectedTransition("state", (transition) => {
      const nextTransition = { ...transition };
      if (side === "from") {
        if (normalizedSource) nextTransition.fromAssetSource = normalizedSource;
        else {
          delete nextTransition.fromAssetSource;
          delete nextTransition.fromAssetMode;
          delete nextTransition.fromAssetFacing;
        }
      } else if (normalizedSource) nextTransition.toAssetSource = normalizedSource;
      else {
        delete nextTransition.toAssetSource;
        delete nextTransition.toAssetMode;
        delete nextTransition.toAssetFacing;
      }
      return nextTransition;
    });
  };

  const updateSelectedTransitionAssetMode = (side: "from" | "to", mode: EditorTransitionAssetMode) => {
    updateSelectedTransition("state", (transition) => (
      side === "from"
        ? { ...transition, fromAssetMode: mode }
        : { ...transition, toAssetMode: mode }
    ));
  };

  const updateSelectedTransitionAssetFacing = (
    side: "from" | "to",
    facing: EditorFacingDirection | "route",
  ) => {
    updateSelectedTransition("state", (transition) => {
      const nextTransition = { ...transition };
      const key = side === "from" ? "fromAssetFacing" : "toAssetFacing";
      if (facing === "route") delete nextTransition[key];
      else nextTransition[key] = facing;
      return nextTransition;
    });
  };

  const updateTransitionAssetScaleInput = (side: "from" | "to", value: string) => {
    setTransitionAssetScaleInputs((current) => ({ ...current, [side]: value }));
  };

  const commitSelectedTransitionAssetScale = (side: "from" | "to", value: string) => {
    const key = side === "from" ? "fromAssetScale" : "toAssetScale";
    if (!value.trim()) {
      updateSelectedTransition("state", (transition) => {
        const nextTransition = { ...transition };
        delete nextTransition[key];
        return nextTransition;
      });
      return;
    }
    const parsedScale = Number(value);
    if (!Number.isFinite(parsedScale) || parsedScale <= 0 || parsedScale > 8) {
      setNotice("动作资产倍率需在 0.01～8.00 之间；留空可恢复跟随状态倍率");
      setTransitionAssetScaleInputs((current) => ({
        ...current,
        [side]: String(selectedStateTransition?.[key] ?? ""),
      }));
      return;
    }
    const normalizedScale = clamp(parsedScale, 0.01, 8);
    setTransitionAssetScaleInputs((current) => ({ ...current, [side]: String(normalizedScale) }));
    updateSelectedTransition("state", (transition) => ({
      ...transition,
      [key]: normalizedScale,
    }));
  };

  const handleTransitionAssetFile = (event: ChangeEvent<HTMLInputElement>, side: "from" | "to") => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("请为烟雾过渡选择 PNG / WebP 图片文件");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      updateSelectedTransitionAssetSource(side, reader.result);
      setNotice(`${side === "from" ? "起始" : "结束"}烟雾过渡资产已接入当前点位`);
    });
    reader.readAsDataURL(file);
  };

  const previewSelectedTransition = (kind: EditorRouteTransition["kind"]) => {
    if (!selectedPoint) return;
    const transition = selectedPointEvents.find((candidate) => candidate.kind === kind);
    if (!transition) return;
    const transitionProgress = routeProgressAtPoint(activeRouteIds, draft.pointsById, transition.pointId);
    const previewProgress = transitionTriggerProgress(activeRouteIds, draft.pointsById, transition);
    setPlaying(false);
    // Align the route progress baseline before setting the preview position so
    // the progress effect does not detect the manual preview jump as a second
    // crossing of the same event and restart the animation.
    pendingTransitionRef.current = null;
    previousProgressRef.current = previewProgress;
    setProgress(previewProgress);
    const baseAssets = {
      from: routeVisualAssetAtProgress(
        activeRouteIds,
        draft.pointsById,
        activeRouteMeta,
        profile.actorAssets,
        Math.max(0, transitionProgress - 0.0001),
      ),
      to: routeVisualAssetAtProgress(
        activeRouteIds,
        draft.pointsById,
        activeRouteMeta,
        profile.actorAssets,
        Math.min(1, transitionProgress + 0.0001),
      ),
    };
    const visualAssets = transitionVisualAssets(activeRouteMeta, transition, baseAssets.from, baseAssets.to);
    startPreviewTransition(
      transition,
      visualAssets.from,
      visualAssets.to,
    );
  };

  const saveRouteAssetSource = (source: string) => {
    const normalizedSource = normalizeEditorAssetSource(source);
    if (!normalizedSource) {
      setNotice("素材路径为空：请粘贴路径或选择一个 PNG/WebP 文件");
      return;
    }
    const stateId = assetStateId.trim();
    const parsedScale = Number(assetScaleInput);
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      const nextLibrary: EditorRouteAssetLibrary = {
        ...(baseMeta.assetLibrary ?? {}),
      };
      if (stateId) {
        const existingState = nextLibrary.states?.[stateId] ?? {};
        const nextState = current.sceneId === "attic"
          ? (() => {
              const { scale: _legacyScale, alphaBottom: _legacyAlphaBottom, ...withoutLegacySizing } = existingState;
              return {
                ...withoutLegacySizing,
                [assetSlot]: normalizedSource,
              };
            })()
          : {
              ...existingState,
              [assetSlot]: normalizedSource,
              ...(Number.isFinite(parsedScale) && parsedScale > 0 && parsedScale <= 8 ? { scale: parsedScale } : {}),
            };
        nextLibrary.states = {
          ...(nextLibrary.states ?? {}),
          [stateId]: nextState,
        };
      } else {
        nextLibrary[assetSlot] = normalizedSource;
      }
      return {
        ...current,
        routeMeta: {
          ...(current.routeMeta ?? {}),
          [routeKey]: { ...baseMeta, assetLibrary: nextLibrary },
        },
      };
    });
    setAssetSourceInput(normalizedSource);
    setNotice(`${assetSlot === "left" ? "左向" : "右向"}${stateId ? `「${stateId}」状态` : "基础"}透明角色素材已接入当前路线`);
  };

  const saveRouteAssetScale = () => {
    const stateId = assetStateId.trim();
    if (draft.sceneId === "attic") {
      setNotice("阁楼角色图已统一为 1024×1536 透明画布；只使用路线透视倍率，不保存单图倍率");
      return;
    }
    const parsedScale = Number(assetScaleInput);
    if (!stateId) {
      setNotice("请先填写状态 ID；资产自身倍率只作用于状态动作图");
      return;
    }
    if (!Number.isFinite(parsedScale) || parsedScale <= 0 || parsedScale > 8) {
      setNotice("资产自身倍率需在 0.01～8.00 之间");
      return;
    }
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      const nextLibrary: EditorRouteAssetLibrary = {
        ...(baseMeta.assetLibrary ?? {}),
        states: {
          ...(baseMeta.assetLibrary?.states ?? {}),
          [stateId]: {
            ...(baseMeta.assetLibrary?.states?.[stateId] ?? {}),
            scale: parsedScale,
          },
        },
      };
      return {
        ...current,
        routeMeta: {
          ...(current.routeMeta ?? {}),
          [routeKey]: { ...baseMeta, assetLibrary: nextLibrary },
        },
      };
    });
    setNotice("已保存状态资产自身倍率");
  };

  const saveRouteAssetFacing = (facing: EditorFacingDirection) => {
    const stateId = assetStateId.trim();
    if (!stateId) {
      setNotice("请先选择或填写一个动作状态；原图朝向只作用于状态资产");
      return;
    }
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      return {
        ...current,
        routeMeta: {
          ...(current.routeMeta ?? {}),
          [routeKey]: {
            ...baseMeta,
            assetLibrary: {
              ...(baseMeta.assetLibrary ?? {}),
              states: {
                ...(baseMeta.assetLibrary?.states ?? {}),
                [stateId]: {
                  ...(current.sceneId === "attic"
                    ? (() => {
                        const { scale: _legacyScale, alphaBottom: _legacyAlphaBottom, ...withoutLegacySizing } = baseMeta.assetLibrary?.states?.[stateId] ?? {};
                        return withoutLegacySizing;
                      })()
                    : baseMeta.assetLibrary?.states?.[stateId] ?? {}),
                  canonicalFacing: facing,
                },
              },
            },
          },
        },
      };
    });
    setNotice(`${stateId} 已设为原图朝向${facing === "left" ? "左" : "右"}，反向路线会自动镜像`);
  };

  const clearRouteAssetSource = () => {
    const stateId = assetStateId.trim();
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      const nextLibrary: EditorRouteAssetLibrary = { ...(baseMeta.assetLibrary ?? {}) };
      if (stateId && nextLibrary.states?.[stateId]) {
        const nextState = { ...nextLibrary.states[stateId] };
        if (current.sceneId === "attic") {
          delete nextState.scale;
          delete nextState.alphaBottom;
        }
        delete nextState[assetSlot];
        const nextStates = { ...nextLibrary.states };
        if (nextState.left || nextState.right) nextStates[stateId] = nextState;
        else delete nextStates[stateId];
        if (Object.keys(nextStates).length > 0) nextLibrary.states = nextStates;
        else delete nextLibrary.states;
      } else if (!stateId) {
        delete nextLibrary[assetSlot];
      }
      const nextMeta = { ...baseMeta };
      if (Object.keys(nextLibrary).length > 0) nextMeta.assetLibrary = nextLibrary;
      else delete nextMeta.assetLibrary;
      return {
        ...current,
        routeMeta: { ...(current.routeMeta ?? {}), [routeKey]: nextMeta },
      };
    });
    setAssetSourceInput("");
    setNotice("已清除当前路线的这项素材覆盖，将回退到默认角色资产");
  };

  const updateSceneInteraction = (
    interactionId: string,
    update: (interaction: EditorSceneInteraction) => EditorSceneInteraction,
  ) => {
    setDraft((current) => {
      const interaction = current.sceneInteractions?.[interactionId];
      if (!interaction) return current;
      return {
        ...current,
        sceneInteractions: {
          ...(current.sceneInteractions ?? {}),
          [interactionId]: update(interaction),
        },
      };
    });
  };

  const addSceneInteraction = () => {
    const anchor = (selectedPoint?.anchorKind === "interaction" || selectedPoint?.anchorKind === "portal")
      ? selectedPoint
      : interactionAnchorPoints[0];
    if (!anchor) {
      setNotice("请先创建或选择一个场景锚点，再添加组件");
      return;
    }
    let interactionId = `${draft.sceneId}-component`;
    let serial = 2;
    while (draft.sceneInteractions?.[interactionId]) interactionId = `${draft.sceneId}-component-${serial++}`;
    const interaction: EditorSceneInteraction = {
      id: interactionId,
      label: `新场景组件 ${serial - 1}`,
      kind: "pickup-prop",
      anchorPointId: anchor.id,
      initialStateId: "ready",
      assets: [],
      states: [
        { id: "ready", label: "在场｜素材都挂在背景上", visibleAssetIds: [] },
        { id: "empty", label: "取走｜背景不显示素材", visibleAssetIds: [] },
      ],
    };
    setDraft((current) => ({
      ...current,
      sceneInteractions: {
        ...(current.sceneInteractions ?? {}),
        [interactionId]: interaction,
      },
    }));
    setSelectedInteractionId(interactionId);
    setSelectedInteractionStateId("ready");
    setSelectedInteractionAssetId("");
    setInspectorTab("interactions");
    setNotice(`已添加组件「${interaction.label}」，请配置资产路径和状态`);
  };

  const removeSelectedSceneInteraction = () => {
    if (!selectedInteraction) return;
    const interactionId = selectedInteraction.id;
    setDraft((current) => {
      const nextInteractions = { ...(current.sceneInteractions ?? {}) };
      delete nextInteractions[interactionId];
      const nextRouteMeta = Object.fromEntries(Object.entries(current.routeMeta ?? {}).map(([key, meta]) => [
        key,
        meta.interactionEvents
          ? { ...meta, interactionEvents: meta.interactionEvents.filter((event) => event.interactionId !== interactionId) }
          : meta,
      ]));
      return {
        ...current,
        ...(Object.keys(nextInteractions).length > 0 ? { sceneInteractions: nextInteractions } : { sceneInteractions: {} }),
        routeMeta: nextRouteMeta,
      };
    });
    setSelectedInteractionId("");
    setSelectedInteractionStateId("");
    setSelectedInteractionAssetId("");
    setNotice(`已删除场景组件「${selectedInteraction.label}」及其路线事件`);
  };

  const updateSelectedInteractionAsset = (
    assetId: string,
    update: (asset: EditorSceneInteractionAsset) => EditorSceneInteractionAsset,
  ) => {
    if (!selectedInteraction) return;
    updateSceneInteraction(selectedInteraction.id, (interaction) => ({
      ...interaction,
      assets: interaction.assets.map((asset) => asset.id === assetId ? update(asset) : asset),
    }));
  };

  const setSelectedInteractionAssetSource = (source: string) => {
    if (!selectedInteraction || !selectedInteractionAsset) return;
    const normalized = normalizeEditorAssetSource(source);
    updateSelectedInteractionAsset(selectedInteractionAsset.id, (asset) => ({ ...asset, src: normalized }));
    if (normalized !== source.trim()) {
      setNotice("已自动转换为项目相对路径：/assets/…");
    }
  };

  const searchAssetLibrary = async (query = assetLibraryQuery) => {
    setAssetLibraryLoading(true);
    try {
      const response = await fetch(`/api/room/asset-library?q=${encodeURIComponent(query.trim())}&limit=120`, {
        cache: "no-store",
      });
      const payload = await response.json() as { items?: AssetLibraryItem[]; total?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "资源目录读取失败");
      setAssetLibraryItems(Array.isArray(payload.items) ? payload.items : []);
      setAssetLibraryTotal(typeof payload.total === "number" ? payload.total : 0);
      setNotice(query.trim() ? `资源管理器已找到 ${payload.total ?? 0} 项匹配资源` : `资源管理器已载入 ${payload.total ?? 0} 项图片`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "资源目录读取失败，请确认 3001 正在运行");
    } finally {
      setAssetLibraryLoading(false);
    }
  };

  const openAssetLibrary = () => {
    const nextOpen = !assetLibraryOpen;
    setAssetLibraryOpen(nextOpen);
    if (nextOpen && assetLibraryItems.length === 0) void searchAssetLibrary();
  };

  const chooseAssetLibraryItem = (item: AssetLibraryItem) => {
    if (!selectedInteractionAsset) return;
    setSelectedInteractionAssetSource(item.src);
    setNotice(`已挂载「${item.name}」，路径已保存为项目相对路径`);
  };

  const setSelectedInteractionStateVisibility = (visible: boolean, assetId?: string) => {
    if (!selectedInteraction || !selectedInteractionState) return;
    const interactionId = selectedInteraction.id;
    const stateId = selectedInteractionState.id;
    updateSceneInteraction(interactionId, (interaction) => (
      setSceneInteractionStateVisibility(interaction, stateId, visible, assetId)
    ));
  };

  const addInteractionAsset = () => {
    if (!selectedInteraction) return;
    let assetId = "asset-1";
    let serial = 2;
    while (selectedInteraction.assets.some((asset) => asset.id === assetId)) assetId = `asset-${serial++}`;
    const asset: EditorSceneInteractionAsset = {
      id: assetId,
      label: "新组件图片（待填路径）",
      src: "",
      mode: "scene",
      zIndex: 10,
      scale: 1,
      offset: [0, 0],
    };
    updateSceneInteraction(selectedInteraction.id, (interaction) => (
      addSceneInteractionAsset(interaction, asset)
    ));
    setSelectedInteractionAssetId(assetId);
    setNotice("已添加资产，并自动放入初始“在场”状态；填好 /assets/ 相对路径后即可用于取放");
  };

  const removeInteractionAsset = (assetId: string) => {
    if (!selectedInteraction) return;
    updateSceneInteraction(selectedInteraction.id, (interaction) => ({
      ...interaction,
      assets: interaction.assets.filter((asset) => asset.id !== assetId),
      states: interaction.states.map((state) => {
        const visibleAssetIds = state.visibleAssetIds.filter((id) => id !== assetId);
        if (state.actorAssetId === assetId) {
          const { actorAssetId: _removedActorAssetId, ...withoutActorAsset } = state;
          return { ...withoutActorAsset, visibleAssetIds };
        }
        return { ...state, visibleAssetIds };
      }),
    }));
    setSelectedInteractionAssetId("");
  };

  const addInteractionState = () => {
    if (!selectedInteraction) return;
    let stateId = "state-2";
    let serial = 3;
    while (selectedInteraction.states.some((state) => state.id === stateId)) stateId = `state-${serial++}`;
    const state: EditorSceneInteractionState = { id: stateId, label: `状态 ${serial - 1}`, visibleAssetIds: [] };
    updateSceneInteraction(selectedInteraction.id, (interaction) => ({
      ...interaction,
      states: [...interaction.states, state],
    }));
    setSelectedInteractionStateId(stateId);
  };

  const removeInteractionState = (stateId: string) => {
    if (!selectedInteraction || selectedInteraction.states.length <= 1) return;
    const fallbackState = selectedInteraction.states.find((state) => state.id !== stateId);
    updateSceneInteraction(selectedInteraction.id, (interaction) => ({
      ...interaction,
      states: interaction.states.filter((state) => state.id !== stateId),
      initialStateId: interaction.initialStateId === stateId ? fallbackState?.id ?? interaction.initialStateId : interaction.initialStateId,
    }));
    setSelectedInteractionStateId(fallbackState?.id ?? "");
  };

  const setSelectedPointInteractionEvent = (interactionId: string) => {
    if (!selectedPoint) return;
    const eventInteraction = interactionId ? draft.sceneInteractions?.[interactionId] : undefined;
    const stateId = eventInteraction?.initialStateId ?? eventInteraction?.states[0]?.id;
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      const events = (baseMeta.interactionEvents ?? []).filter((event) => (
        event.pointId !== selectedPoint.id || event.interactionId !== interactionId
      ));
      const withoutPoint = events.filter((event) => event.pointId !== selectedPoint.id);
      const nextEvents = eventInteraction && stateId
        ? [...withoutPoint, { pointId: selectedPoint.id, interactionId, stateId }]
        : withoutPoint;
      return {
        ...current,
        routeMeta: {
          ...(current.routeMeta ?? {}),
          [routeKey]: { ...baseMeta, interactionEvents: nextEvents },
        },
      };
    });
  };

  const setSelectedPointInteractionState = (interactionId: string, stateId: string) => {
    if (!selectedPoint || !draft.sceneInteractions?.[interactionId]) return;
    setDraft((current) => {
      const baseMeta = editorRouteMeta(current, routeKey);
      const nextEvents = (baseMeta.interactionEvents ?? []).map((event) => (
        event.pointId === selectedPoint.id && event.interactionId === interactionId
          ? { ...event, stateId }
          : event
      ));
      return {
        ...current,
        routeMeta: { ...(current.routeMeta ?? {}), [routeKey]: { ...baseMeta, interactionEvents: nextEvents } },
      };
    });
  };

  const handleAssetFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("请选择图片文件；透明角色素材建议使用 WebP 或 PNG");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      saveRouteAssetSource(reader.result);
    });
    reader.readAsDataURL(file);
  };

  const setSelectedScaleOverride = (value: string) => {
    if (!selectedPoint) return;
    const selectedId = selectedPoint.id;
    const prepared = selectedPoint.role === "waypoint"
      ? clonePointForRoute(draft, routeKey, selectedId)
      : { draft, pointId: selectedId };
    if (prepared.pointId !== selectedId) setSelectedPointId(prepared.pointId);
    setDraft(() => {
      const currentPoint = prepared.draft.pointsById[prepared.pointId];
      if (!currentPoint) return prepared.draft;
      const nextPoint = value === "auto"
        ? (({ scaleOverride: _ignored, ...rest }) => rest)(currentPoint)
        : { ...currentPoint, scaleOverride: Number(value) };
      return {
        ...prepared.draft,
        pointsById: { ...prepared.draft.pointsById, [prepared.pointId]: nextPoint },
      };
    });
  };

  const saveDraft = () => {
    persistEditorDraft(draft, routeKey);
    setNotice(`已保存${profile.label}场景本地草稿`);
  };

  const publishDraft = async () => {
    if (publishing) return;
    if (!window.confirm(`确认将当前 ${profile.label} 草稿设为唯一正式路线？\n\n这会覆盖该场景的当前正式源与 3000 快照，但不会生成或恢复任何旧版草稿。`)) return;
    setPublishing(true);
    setNotice("正在校验并发布正式路线快照……");
    try {
      const result = await publishEditorDraft(draft, {
        playbackSpeed,
      });
      const warningCount = result.issues.filter((issue) => issue.severity === "warning").length;
      setNotice(`已发布 ${profile.label} 当前正式路线：${result.revision.revisionId}${warningCount ? `（${warningCount} 条非阻断提示）` : ""}；3000 将消费这份唯一快照。`);
    } catch (error) {
      if (error instanceof RoutePublishError && error.issues.length > 0) {
        setNotice(`发布被阻止：${error.issues[0]?.message ?? "路线校验失败"}`);
      } else {
        setNotice(`发布失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    } finally {
      setPublishing(false);
    }
  };

  const exportDraft = async () => {
    const payload = JSON.stringify(serializeEditorDraft(draft), null, 2);
    const copied = await copyText(payload).catch(() => false);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.sceneId}-route-editor-v2.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(copied ? "JSON 已复制并下载" : "JSON 已下载");
  };

  const resetDraft = () => {
    const nextDraft = createInitialEditorDraft(draft.sceneId);
    setDraft(nextDraft);
    setRouteKey(Object.keys(nextDraft.routes)[0] ?? "");
    setSelectedPointId(nextDraft.routes[Object.keys(nextDraft.routes)[0] ?? ""]?.[0] ?? "");
    setProgress(0);
    setNotice(`已恢复${profile.label}场景初始草稿`);
  };

  const focusInspectorTab = (nextTab: InspectorTab) => {
    setInspectorTab(nextTab);
    window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const workspace = toolWorkspaceRef.current;
      if (!panel || !workspace) return;
      if (getComputedStyle(panel).overflowY === "visible") {
        workspace.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      panel.scrollTo({ top: Math.max(0, workspace.offsetTop - 8), behavior: "smooth" });
    });
  };

  const routePointsForRender = (key: EditorRouteKey) => (draft.routes[key] ?? [])
    .map((id) => draft.pointsById[id]?.point)
    .filter((point): point is SceneGeometryPoint => Boolean(point));

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{profile.label.toUpperCase()} / MOTHER IMAGE ROUTE EDITOR</p>
          <h1>{profile.label}母图路线编辑器</h1>
          <p className={styles.lede}>
            {profile.description} 直接在母图上拖动点位；共享起点/终点可以移动，普通 waypoint 仍只属于当前路线。
          </p>
        </div>
        <div className={styles.meta}>
          <span>{canvas.width} × {canvas.height}</span>
          <span>{profile.foregroundLabel}</span>
          <span>{profile.floorStatus === "frozen" ? "行走面已冻结" : "行走面待配置"}</span>
          <span className={styles.noticePill}>{notice}</span>
        </div>
      </section>

      <section className={styles.workspace}>
        <div
          ref={stageRef}
          className={`${styles.stage} ${draggingPointId || draggingInteractionAsset || resizingInteractionAsset ? styles.dragging : ""} ${addMode ? styles.addMode : ""}`}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerUp}
          style={{
            "--stage-aspect-ratio": `${canvas.width} / ${canvas.height}`,
            ...(previewTransition
              ? {
                  "--editor-transition-total": `${previewTransition.effectiveTotalMs}ms`,
                  "--editor-transition-easing": transitionEasingCss(previewTransition.animation.easing),
                }
              : {}),
          } as CSSProperties}
          role="application"
          aria-label={`直接在${profile.label}母图上编辑路线点位`}
        >
          <img
            className={styles.background}
            src={profile.masterSrc}
            alt={profile.masterAlt}
            draggable={false}
          />
          <svg className={styles.overlay} viewBox={`0 0 ${canvas.width} ${canvas.height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="editor-kitchen-arrow" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 14 7 L 0 14 z" className={styles.kitchenArrowHead} />
              </marker>
            </defs>
            <polygon
              points={profile.floorPolygon?.map(([x, y]) => `${x},${y}`).join(" ")}
              className={styles.floorPolygon}
            />
            {(showAllRoutes ? Object.keys(draft.routes) : [routeKey]).map((key) => {
              const points = routePointsForRender(key);
              const meta = editorRouteMeta(draft, key);
              const className = `${styles.routeLine} ${styles[routeColors[meta.accent] ?? "routeCustom"]} ${key !== routeKey ? styles.routeLineMuted : ""}`;
              if (meta.kind === "arrow") {
                return points.length >= 2
                  ? <polyline key={key} points={points.map(([x, y]) => `${x},${y}`).join(" ")} className={className} markerEnd="url(#editor-kitchen-arrow)" />
                  : null;
              }
              return points.length >= 2
                ? <polyline key={key} points={points.map(([x, y]) => `${x},${y}`).join(" ")} className={className} />
                : null;
            })}
            {activePoints.map((point, index) => {
              const selected = selectedPoint?.id === point.id;
              const roleClass = point.role === "door"
                ? styles.routePointDoor
                : point.role === "seat-left"
                  ? styles.routePointSeatLeft
                  : point.role === "seat-right"
                    ? styles.routePointSeatRight
                    : styles.routePointWaypoint;
              return (
                <g key={point.id}>
                  <circle
                    cx={point.point[0]}
                    cy={point.point[1]}
                    r={selected ? 16 : 11}
                    className={`${styles.routePointHandle} ${roleClass} ${selected ? styles.routePointSelected : ""}`}
                    onPointerDown={(event) => handlePointPointerDown(event, point.id)}
                  />
                  {activeRouteTransitions
                    .filter((transition) => transition.pointId === point.id)
                    .map((transition) => (
                      <g key={`${point.id}-${transition.kind}`} className={styles.routeEventMarkerGroup}>
                        <circle
                          cx={point.point[0]}
                          cy={point.point[1]}
                          r={selected ? 24 : 20}
                          className={`${styles.routeEventMarker} ${transition.kind === "facing" ? styles.routeEventFacing : transition.kind === "layer" ? styles.routeEventLayer : styles.routeEventState}`}
                        />
                        <text x={point.point[0] + 24} y={point.point[1] + 29} className={styles.routeEventLabel}>
                          {transition.kind === "facing" ? "镜像" : transition.kind === "layer" ? "层级" : "状态"}
                        </text>
                      </g>
                    ))}
                  <text x={point.point[0] + 18} y={point.point[1] - 13} className={styles.routePointLabel}>
                      {point.role === "waypoint"
                        ? `${index + 1}`
                        : point.role === "door"
                          ? "D"
                          : point.role === "seat-left"
                            ? "L"
                            : point.role === "seat-right"
                              ? "R"
                              : point.role === "scene-entry"
                                ? "E"
                                : "A"}
                  </text>
                </g>
              );
            })}
            {interactionAnchorPoints
              .filter((point) => !activePoints.some((activePoint) => activePoint.id === point.id))
              .map((point) => {
                const selected = selectedPoint?.id === point.id;
                const anchoredInteractions = sceneInteractions.filter((interaction) => interaction.anchorPointId === point.id);
                return (
                  <g key={`scene-anchor-${point.id}`}>
                    <circle
                      cx={point.point[0]}
                      cy={point.point[1]}
                      r={selected ? 17 : 12}
                      className={`${styles.routePointHandle} ${styles.sceneInteractionAnchor} ${selected ? styles.routePointSelected : ""}`}
                      onPointerDown={(event) => handlePointPointerDown(event, point.id)}
                    />
                    <text x={point.point[0] + 18} y={point.point[1] - 12} className={styles.routePointLabel}>
                      {anchoredInteractions.length > 0 ? `◇ ${anchoredInteractions[0]!.label}` : "◇ 场景锚点"}
                    </text>
                  </g>
                );
              })}
          </svg>
          {stableSceneStateAsset ? (
            <img
              className={styles.sceneStateLayer}
              src={stableSceneStateAsset.src}
              data-render-role="editor-scene-state"
              data-asset-mode="scene"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}
          {previewSceneAssets.from && previewTransition ? (
            <img
               className={`${styles.sceneTransitionLayer} ${previewTransition.animation.style === "smoke" ? styles.sceneTransitionSmokeOutgoing : previewTransition.animation.style === "scene-switch" ? styles.sceneTransitionSceneSwitchOutgoing : styles.sceneTransitionOutgoing}`}
              src={previewSceneAssets.from.src}
              style={{
                "--editor-transition-total": `${previewTransition.effectiveTotalMs}ms`,
                "--editor-transition-easing": transitionEasingCss(previewTransition.animation.easing),
              } as CSSProperties}
              data-transition-scene-layer="outgoing"
              data-asset-mode="scene"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}
          {previewSceneAssets.to && previewTransition ? (
            <img
               className={`${styles.sceneTransitionLayer} ${previewTransition.animation.style === "smoke" ? styles.sceneTransitionSmokeIncoming : previewTransition.animation.style === "scene-switch" ? styles.sceneTransitionSceneSwitchIncoming : styles.sceneTransitionIncoming}`}
              src={previewSceneAssets.to.src}
              style={{
                "--editor-transition-total": `${previewTransition.effectiveTotalMs}ms`,
                "--editor-transition-easing": transitionEasingCss(previewTransition.animation.easing),
              } as CSSProperties}
              data-transition-scene-layer="incoming"
              data-asset-mode="scene"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}
          {renderedSceneInteractionAssets.length > 0 ? (
            <div
              className={styles.editorSceneInteractionsLayer}
              data-render-role="editor-scene-interactions"
              data-hidden={Boolean(previewTransition)}
            >
              {renderedSceneInteractionAssets.map(({ interaction, state, asset, point, attachedToActor }) => {
                const selected = selectedInteraction?.id === interaction.id && selectedInteractionAsset?.id === asset.id;
                const offset = asset.offset ?? [0, 0];
                return (
                  <div
                    key={`${interaction.id}:${state.id}:${asset.id}`}
                    className={`${styles.editorSceneInteractionAsset} ${attachedToActor ? styles.editorSceneInteractionAssetActor : styles.editorSceneInteractionAssetScene} ${selected ? styles.editorSceneInteractionAssetSelected : ""}`}
                    data-interaction-id={interaction.id}
                    data-state-id={state.id}
                    data-asset-id={asset.id}
                    data-asset-mode={asset.mode}
                    data-empty={!asset.src}
                    role="button"
                    tabIndex={0}
                    aria-label={`拖动场景素材：${asset.label}`}
                    style={{
                      ...pointToPercent(point, canvas),
                      zIndex: asset.zIndex,
                      "--editor-interaction-scale": asset.scale ?? 1,
                      "--editor-interaction-offset-x": `${offset[0]}px`,
                      "--editor-interaction-offset-y": `${offset[1]}px`,
                    } as CSSProperties}
                    onPointerDown={(event) => handleSceneAssetPointerDown(event, interaction.id, asset.id, state.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedInteractionId(interaction.id);
                        setSelectedInteractionStateId(state.id);
                        setSelectedInteractionAssetId(asset.id);
                        setInspectorTab("interactions");
                      }
                    }}
                  >
                    {asset.src ? <img src={asset.src} alt="" draggable={false} onError={() => setNotice(`找不到素材：${asset.src}`)} /> : <span>{asset.label || "待配置素材"}</span>}
                    {selected ? (
                      <>
                        <i aria-hidden="true" />
                        <button
                          type="button"
                          className={styles.editorSceneInteractionScaleHandle}
                          aria-label={`拖动调整${asset.label}的倍率`}
                          title="拖动调整倍率"
                          onPointerDown={(event) => handleSceneAssetScalePointerDown(event, interaction.id, asset.id)}
                        >
                          ↘
                        </button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {actor ? (
            <div
              className={styles.actorOcclusionMask}
              data-testid="editor-actor-occlusion-mask"
              data-mask-source-count={occlusionLayers.length}
              data-mask-enabled={Boolean(actorMaskStyle)}
              data-render-role="actor-preview-mask-only"
              data-occlusion-sources={occlusionLayers.map((layer) => layer.src).join("|")}
              style={actorMaskStyle}
            >
              {!actorIsVisuallyEmpty ? (
                <span
                  className={styles.actorGroundShadow}
                  data-render-role="actor-ground-shadow"
                  aria-hidden="true"
                  style={actorStyle}
                />
              ) : null}
              <div
                key={previewTransition?.key ?? "actor-stable"}
                 className={`${styles.actorSpriteWrap} ${previewTransition ? styles.actorTransitionActive : ""} ${previewTransition?.animation.style === "spin" ? styles.actorTransitionSpin : previewTransition?.animation.style === "smoke" ? styles.actorTransitionSmoke : previewTransition?.animation.style === "scene-switch" ? styles.actorTransitionSceneSwitch : styles.actorTransitionMirror}`}
                data-facing={actorFacing}
                data-render-role="editor-actor-preview"
                data-asset-src={actor.src}
                data-transition-kind={previewTransition?.kind ?? "none"}
                data-target-state={previewTransition?.targetStateId ?? ""}
                style={actorRenderStyle}
              >
                <div className={`${styles.actorWobbleLayer} ${playing && !previewTransition ? styles.actorWobbleActive : ""}`}>
                  {previewTransition ? (
                    <>
                      {previewTransition.fromAsset.mode === "actor" ? (
                        <div className={`${styles.actorTurnLayer} ${styles.actorTurnOutgoing}`} data-turn-layer="outgoing">
                          <img
                            className={styles.actorSprite}
                            src={previewTransition.fromAsset.src}
                            style={actorTransitionImageStyle(previewTransition.fromAsset)}
                            data-asset-scale={previewTransition.fromAsset.assetScale ?? 1}
                            alt=""
                            draggable={false}
                          />
                        </div>
                      ) : null}
                      {previewTransition.toAsset.mode === "actor" ? (
                        <div className={`${styles.actorTurnLayer} ${styles.actorTurnIncoming}`} data-turn-layer="incoming">
                          <img
                            className={styles.actorSprite}
                            src={previewTransition.toAsset.src}
                            style={actorTransitionImageStyle(previewTransition.toAsset)}
                            data-asset-scale={previewTransition.toAsset.assetScale ?? 1}
                            alt=""
                            draggable={false}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <img
                      className={styles.actorSprite}
                      src={actor.src}
                      style={actorImageStyle(previewActorAsset ?? activeVisualAsset)}
                      alt="可拖动调试角色"
                      draggable={false}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {previewTransition?.animation.style === "smoke" ? (
            <div
              key={previewTransition.key}
              className={`${styles.actorSmokeVeil} ${styles.actorSmokeFollowActor}`}
              style={{
                ...actorAnchorStyle,
                "--editor-transition-total": `${previewTransition.effectiveTotalMs}ms`,
              } as CSSProperties}
              data-transition-layer="white-smoke"
              data-transition-anchor="actor"
              aria-hidden="true"
            >
              <span className={styles.actorSmokeGlow} />
              <img className={`${styles.actorSmokePuff} ${styles.actorSmokePuffMain}`} src={WHITE_SMOKE_ASSET_SRC} alt="" draggable={false} />
            </div>
          ) : null}
          {visibleForegroundLayers.map((layer) => (
            <img
              key={layer.id}
              className={styles.occlusionOverlay}
              src={layer.src}
              data-testid={`${draft.sceneId}-foreground-${layer.id}`}
              data-foreground-layer={layer.id}
              data-foreground-policy={layer.policy}
              data-render-role="editor-guide-only"
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{ zIndex: layer.zIndex }}
            />
          ))}
          <div className={styles.stageBadge}>
            {addMode ? "点击母图插入节点" : resizingInteractionAsset ? "正在调整素材倍率" : draggingInteractionAsset ? "正在拖动场景素材" : draggingPointId ? `正在拖动：${draft.pointsById[draggingPointId]?.label ?? draggingPointId}` : "拖动彩色节点调整路线（共享锚点也可动）"}
          </div>
        </div>

        <aside ref={panelRef} className={styles.panel}>
          <div className={styles.sceneTabs} role="tablist" aria-label="场景选择">
            {EDITOR_SCENE_IDS.map((sceneId) => {
              const scene = getEditorSceneProfile(sceneId);
              return (
                <button
                  key={sceneId}
                  type="button"
                  className={`${styles.sceneTab} ${draft.sceneId === sceneId ? styles.sceneTabActive : ""}`}
                  aria-selected={draft.sceneId === sceneId}
                  onClick={() => changeScene(sceneId)}
                >
                  {scene.label}
                </button>
              );
            })}
          </div>
          <div className={styles.panelIntro}>
            <strong>路线工作台</strong>
            <span>①选路线 → ②选节点 → ③设事件/素材 → ④调缩放 → ⑤保存</span>
          </div>

          <div className={styles.routeControlCard}>
            <div className={styles.workflowHeading}>
              <div>
                <strong>① 选择路线</strong>
                <small>先选一条要调整的路线，再在画布上拖动节点。</small>
              </div>
              <span>{activeRouteMeta.label}</span>
            </div>
          <div className={styles.routeTabs} role="tablist" aria-label="路线选择">
            {routeEntries.map(({ key, meta }) => (
              <button
                key={key}
                type="button"
                className={`${styles.routeTab} ${routeKey === key ? styles.routeTabActive : ""}`}
                aria-selected={routeKey === key}
                onClick={() => setRouteKey(key)}
              >
                {meta.label}
              </button>
            ))}
          </div>

           <label className={styles.routeNameField}>
             <span>当前路径名称</span>
             <input
               aria-label="当前路径名称"
               type="text"
               value={activeRouteMeta.label}
               maxLength={80}
               onChange={(event) => updateRouteLabel(event.currentTarget.value)}
             />
           </label>

           <div className={styles.routeOptions}>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={showAllRoutes} onChange={(event) => setShowAllRoutes(event.currentTarget.checked)} />
              <span>同时显示其它路线</span>
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={showObstacleLayer}
                onChange={(event) => setShowObstacleLayer(event.currentTarget.checked)}
                disabled={profile.foregroundLayers.length === 0}
              />
              <span>{profile.foregroundLayers.length > 0 ? `显示障碍物参考（${profile.foregroundLabel}）` : "显示障碍物参考（当前场景尚未配置透明层）"}</span>
            </label>
          </div>

          {activeRouteMeta.kind !== "arrow" ? (
            <>
              <label className={styles.speedControl} htmlFor="editor-playback-speed">
                <span>自动播放速度倍率（当前路线约 {(activeRouteDurationMs / 1000).toFixed(1)} 秒）</span>
                <select id="editor-playback-speed" value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))}>
                  <option value="0.75">0.75×</option>
                  <option value="1">1.0×</option>
                  <option value="1.5">1.5×</option>
                  <option value="2">2.0×（默认）</option>
                  <option value="3">3.0×</option>
                  <option value="4">4.0×</option>
                </select>
              </label>
              <div className={styles.previewControls}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    if (playing) {
                      setPlaying(false);
                      return;
                    }
                    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
                    transitionTimerRef.current = null;
                    setPreviewTransition(null);
                    previousFacingRef.current = routeFacingAtProgress(activeRouteIds, draft.pointsById, activeRouteMeta, 0);
                    previousProgressRef.current = 0;
                    setProgress(0);
                    setPlaying(true);
                  }}
                >
                  {playing ? "暂停自动播放" : "自动播放路线"}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
                    transitionTimerRef.current = null;
                    setPreviewTransition(null);
                    previousFacingRef.current = routeFacingAtProgress(activeRouteIds, draft.pointsById, activeRouteMeta, 0);
                    previousProgressRef.current = 0;
                    setPlaying(false);
                    setProgress(0);
                  }}
                >回到起点</button>
              </div>
              <p className={styles.previewHint}>自动播放按路径实际长度匀速移动；当前路线约 {Math.round(activeRouteLengthPx)}px，状态节点的转场会自动执行。</p>
              <p className={styles.previewHint}>终点烟雾状态会从倒数第二个节点提前接管，角色会继续移动并完成转身，不会停在终点等待烟雾。</p>
              <label className={styles.sliderLabel} htmlFor="editor-progress">
                <span>预览进度</span>
                <output>{Math.round(progress * 100)}%</output>
              </label>
              <input id="editor-progress" className={styles.slider} type="range" min="0" max="1" step="0.001" value={progress} onChange={(event) => { setPlaying(false); setProgress(Number(event.currentTarget.value)); }} />
              <button type="button" className={`${styles.occlusionToggle} ${showObstacleLayer ? styles.toggleOn : ""}`} onClick={() => setShowObstacleLayer((value) => !value)} aria-pressed={showObstacleLayer} disabled={profile.foregroundLayers.length === 0}>
                {profile.foregroundLayers.length === 0 ? "障碍物参考：尚未配置透明层" : showObstacleLayer ? "障碍物参考：开（点击隐藏）" : "障碍物参考：关（点击显示）"}
              </button>
            </>
          ) : (
            <p className={styles.routeNotice}>本路线已改为角色行走链路；插入的 waypoint 只属于当前路线，不会联动其它路线。</p>
          )}

            </div>

          <div className={styles.toolTabs} role="tablist" aria-label="编辑工具">
            {inspectorTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={inspectorTab === tab.id}
                className={`${styles.toolTab} ${inspectorTab === tab.id ? styles.toolTabActive : ""}`}
                onClick={() => focusInspectorTab(tab.id)}
              >
                <strong>{tab.label}</strong>
                <small>{tab.hint}</small>
              </button>
            ))}
          </div>

          <div ref={toolWorkspaceRef} className={styles.toolWorkspace}>
          <div className={`${styles.toolPanel} ${inspectorTab === "nodes" ? "" : styles.toolPanelHidden}`}>
            <div className={styles.workflowHeading}>
              <div>
                <strong>② 选择并调整节点</strong>
                <small>先点一个节点，再拖动它或输入精确坐标。</small>
              </div>
              <span>{activePoints.length} 个节点</span>
            </div>
            <div className={styles.pointList}>
              <span className={styles.controlLabel}>当前路线节点</span>
              {activePoints.map((point) => (
                <button key={point.id} type="button" className={`${styles.pointListItem} ${selectedPoint?.id === point.id ? styles.pointListItemActive : ""}`} onClick={() => setSelectedPointId(point.id)}>
                  <span className={`${styles.pointDot} ${point.role === "door" ? styles.pointDotDoor : point.role === "seat-left" ? styles.pointDotSeatLeft : point.role === "seat-right" ? styles.pointDotSeatRight : styles.pointDotWaypoint}`} />
                  <span className={styles.pointListText}>
                    <span>{point.label}</span>
                    <small>{pointContractLabel(draft.sceneId, routeKey, activeRouteMeta, point, activePoints.indexOf(point), activePoints.length)}</small>
                  </span>
                  <code>{formatPoint(point.point)}</code>
                </button>
              ))}
            </div>
          </div>

          {selectedPoint && (inspectorTab === "nodes" || inspectorTab === "events" || inspectorTab === "assets") ? (
            <div className={styles.toolPanel}>
              <div className={styles.workflowHeading}>
                <div>
                  <strong>{inspectorTab === "nodes" ? "② 节点属性" : inspectorTab === "events" ? "③ 设置路线事件" : "③ 配置透明角色素材"}</strong>
                  <small>{inspectorTab === "nodes" ? "调整点位位置和当前节点的缩放覆盖。" : inspectorTab === "events" ? "在选中节点设置镜像或状态过渡。" : "为当前路线接入左右朝向或状态动作图片。"}</small>
                </div>
                <span>{selectedPoint.label}</span>
              </div>
            <div
              className={`${styles.selectedCard} ${activeFloorStatus === false ? styles.selectedCardInvalid : ""}`}
              data-tool-tab={inspectorTab}
            >
              <div className={styles.selectedHeader}>
                <strong>{selectedPoint.label}</strong>
                <code>{formatPoint(selectedPoint.point)}</code>
              </div>
              <span>
                {activeFloorStatus === null
                  ? "行走面尚未配置：当前只编辑路线参考点，不作可行走性判定"
                  : activeFloorStatus
                    ? `位于${profile.label}可行走地面`
                    : `警告：点位离开${profile.label}可行走地面`}
              </span>
              <div className={styles.pointOwnershipNote}>
                <strong>{pointRoleDescription(selectedPoint.role)}</strong>
                <small>{pointContractLabel(
                  draft.sceneId,
                  routeKey,
                  activeRouteMeta,
                  selectedPoint,
                  Math.max(0, activeRouteIds.indexOf(selectedPoint.id)),
                  activeRouteIds.length,
                )}</small>
                <small>
                  {selectedPoint.role === "waypoint"
                    ? "拖动或改坐标只改变当前路线。"
                    : `这是共享锚点，当前被 ${selectedPointRouteCount} 条路线引用；移动会同步更新这些路线。`}
                </small>
                {selectedAnchor ? (
                  <small>
                    语义锚点：{routeAnchorLabel(selectedAnchor.anchorKind)}
                    {selectedAnchor.anchorKey ? ` · ${selectedAnchor.anchorKey}` : " · 不参与端点衔接"}
                    {selectedAnchor.anchorSource === "authored" ? " · 已显式确认" : " · 由现有路线兼容识别"}
                  </small>
                ) : null}
                <small>正式版优先按语义锚点衔接；发布器只提示坐标漂移，不会自动挪动你的节点。</small>
              </div>
              <div className={styles.coordinateGrid}>
                <label>
                  <span>X</span>
                  <input
                    aria-label="选中点 X 坐标"
                    type="number"
                    min="0"
                    max={canvas.width}
                    step="1"
                    value={Math.round(selectedPoint.point[0])}
                    onChange={(event) => setSelectedCoordinate(0, event.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>Y</span>
                  <input
                    aria-label="选中点 Y 坐标"
                    type="number"
                    min="0"
                    max={canvas.height}
                    step="1"
                    value={Math.round(selectedPoint.point[1])}
                    onChange={(event) => setSelectedCoordinate(1, event.currentTarget.value)}
                  />
                </label>
              </div>
              <small className={styles.inlineHint}>拖动红/彩色节点，或直接输入坐标，起点终点都可以调整。</small>
              <details className={`${styles.transitionCard} ${styles.inspectorSubsection}`} open>
                <summary className={styles.transitionHeader}>
                  <div>
                    <strong>路线事件</strong>
                    <small>事件属于当前路线，不属于共享锚点本身。</small>
                  </div>
                  <span>{selectedPointEvents.length} 个事件</span>
                </summary>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedFacingTransition)}
                    onChange={(event) => setTransitionEnabled("facing", event.currentTarget.checked)}
                  />
                  <span>在此处切换左右朝向 / 镜像</span>
                </label>
                {selectedFacingTransition ? (
                  <div className={styles.transitionSettings}>
                    <label className={styles.numberLabel}>
                      <span>切换后朝向</span>
                      <select
                        value={selectedFacingTransition.facing ?? "auto"}
                        onChange={(event) => {
                          const nextFacing = event.currentTarget.value;
                          updateSelectedTransition("facing", (transition) => ({
                            ...transition,
                            ...(nextFacing === "auto"
                              ? (() => { const { facing: _facing, ...withoutFacing } = transition; return withoutFacing; })()
                              : { facing: nextFacing as EditorFacingDirection }),
                          }));
                        }}
                      >
                        <option value="auto">自动反向</option>
                        <option value="left">向左</option>
                        <option value="right">向右</option>
                      </select>
                    </label>
                    <label className={styles.numberLabel}>
                      <span>动画</span>
                      <select
                        value={selectedFacingTransition.animation.style}
                        onChange={(event) => updateSelectedTransitionAnimation("facing", { style: event.currentTarget.value as EditorTransitionAnimationStyle })}
                      >
                        <option value="mirror">压扁 → 镜像展开</option>
                        <option value="spin">多圈旋转 → 展开</option>
                      </select>
                    </label>
                    <div className={styles.transitionGrid}>
                      <label><span>圈数</span><input type="number" min="0.5" max="8" step="0.5" value={selectedFacingTransition.animation.turns} onChange={(event) => updateSelectedTransitionAnimation("facing", { turns: Number(event.currentTarget.value) })} /></label>
                      <label><span>快转 ms</span><input type="number" min="80" max="5000" step="20" value={selectedFacingTransition.animation.durationMs} onChange={(event) => updateSelectedTransitionAnimation("facing", { durationMs: Number(event.currentTarget.value) })} /></label>
                      <label><span>收尾 ms</span><input type="number" min="0" max="3000" step="20" value={selectedFacingTransition.animation.settleMs} onChange={(event) => updateSelectedTransitionAnimation("facing", { settleMs: Number(event.currentTarget.value) })} /></label>
                      <label><span>缓冲</span><select value={selectedFacingTransition.animation.easing} onChange={(event) => updateSelectedTransitionAnimation("facing", { easing: event.currentTarget.value as EditorTransitionEasing })}><option value="elastic">弹性</option><option value="smooth">平滑</option><option value="linear">线性</option></select></label>
                    </div>
                    <button type="button" className={styles.transitionPreviewButton} onClick={() => previewSelectedTransition("facing")}>预览此镜像事件</button>
                  </div>
                ) : null}
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedLayerTransition)}
                    onChange={(event) => setTransitionEnabled("layer", event.currentTarget.checked)}
                  />
                  <span>角色 / 遮挡物层级</span>
                </label>
                {selectedLayerTransition ? (
                  <div className={styles.transitionSettings}>
                    <div className={styles.layerModeActions}>
                      <button type="button" className={styles.secondaryButton} onClick={() => setAllSelectedLayerModes("actor-front")}>全部由角色覆盖</button>
                      <button type="button" className={styles.secondaryButton} onClick={() => setAllSelectedLayerModes("obstacle-front")}>全部由障碍物覆盖</button>
                    </div>
                    <div className={styles.layerModeList}>
                      {profile.foregroundLayers.length > 0 ? profile.foregroundLayers.map((layer) => {
                        const layerMode = transitionLayerModeFor(selectedLayerTransition, layer.id)
                          ?? inheritedLayerModes[layer.id]
                          ?? inheritedLayerModes["*"]
                          ?? "obstacle-front";
                        return (
                          <label key={layer.id} className={styles.numberLabel}>
                            <span>{layer.label}</span>
                            <select
                              value={layerMode}
                              onChange={(event) => {
                                const nextLayerMode = event.currentTarget.value as EditorLayerMode;
                                updateSelectedLayerMode(layer.id, nextLayerMode);
                              }}
                            >
                              <option value="actor-front">角色在前</option>
                              <option value="obstacle-front">障碍物在前</option>
                            </select>
                          </label>
                        );
                      }) : (
                        <small className={styles.inlineHint}>当前场景还没有注册透明障碍物层。</small>
                      )}
                    </div>
                    <small className={styles.inlineHint}>本节点设置会沿路线向后继承；后面的层级事件只覆盖它自己改动的障碍物。每个障碍物独立控制，因此可以形成“椅子 → 角色 → 桌子”。</small>
                  </div>
                ) : null}
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedStateTransition)}
                    onChange={(event) => setTransitionEnabled("state", event.currentTarget.checked)}
                  />
                  <span>在此处准备状态 / 动作过渡</span>
                </label>
                {selectedStateTransition ? (
                  <div className={styles.transitionSettings}>
                    <label className={styles.numberLabel}>
                      <span>目标状态 ID</span>
                      <input id="editor-target-state" type="text" value={selectedStateTransition.targetStateId ?? "next-state"} onChange={(event) => {
                        const targetStateId = event.currentTarget.value;
                        updateSelectedTransition("state", (transition) => ({ ...transition, targetStateId }));
                      }} />
                    </label>
                    <div className={styles.transitionGrid}>
                      <label><span>动画</span><select value={selectedStateTransition.animation.style} onChange={(event) => updateSelectedTransitionAnimation("state", { style: event.currentTarget.value as EditorTransitionAnimationStyle })}><option value="mirror">镜像切换</option><option value="spin">多圈旋转</option><option value="smoke">白烟散开 → 场景状态显现</option><option value="scene-switch">场景切换：旋转压缩 → 新场景展开</option></select></label>
                      <label><span>圈数</span><input type="number" min="0.5" max="8" step="0.5" value={selectedStateTransition.animation.turns} onChange={(event) => updateSelectedTransitionAnimation("state", { turns: Number(event.currentTarget.value) })} /></label>
                      <label><span>快转 ms</span><input type="number" min="80" max="5000" step="20" value={selectedStateTransition.animation.durationMs} onChange={(event) => updateSelectedTransitionAnimation("state", { durationMs: Number(event.currentTarget.value) })} /></label>
                      <label><span>收尾 ms</span><input type="number" min="0" max="3000" step="20" value={selectedStateTransition.animation.settleMs} onChange={(event) => updateSelectedTransitionAnimation("state", { settleMs: Number(event.currentTarget.value) })} /></label>
                    </div>
                    <label className={styles.numberLabel}>
                      <span>缓冲</span>
                      <select value={selectedStateTransition.animation.easing} onChange={(event) => updateSelectedTransitionAnimation("state", { easing: event.currentTarget.value as EditorTransitionEasing })}><option value="elastic">弹性</option><option value="smooth">平滑</option><option value="linear">线性</option></select>
                    </label>
                    {selectedStateTransition.animation.style === "smoke" || selectedStateTransition.animation.style === "scene-switch" ? (
                      <div className={styles.transitionAssetSettings}>
                        <div className={styles.transitionAssetHeading}>
                          <strong>烟雾过渡资产</strong>
                          <small>起始图默认读取前一状态；结束图可接入透明角色或已嵌入场景的状态图。</small>
                        </div>
                        <div className={styles.transitionAssetPair}>
                          <div className={styles.transitionAssetField}>
                            <label className={styles.numberLabel}>
                              <span>切换前：上一状态</span>
                              <select value={selectedStateTransition.fromAssetMode ?? "actor"} onChange={(event) => updateSelectedTransitionAssetMode("from", event.currentTarget.value as EditorTransitionAssetMode)}>
                                <option value="none">不显示（场景外 / 烟雾前）</option>
                                <option value="actor">透明角色资产</option>
                                <option value="scene">场景合成资产</option>
                              </select>
                            </label>
                            {selectedStateTransition.fromAssetMode !== "none" && selectedStateTransition.fromAssetMode !== "scene" ? (
                              <>
                                <label className={styles.numberLabel}>
                                  <span>透明资产朝向</span>
                                  <select
                                    value={selectedStateTransition.fromAssetFacing ?? "route"}
                                    onChange={(event) => updateSelectedTransitionAssetFacing("from", event.currentTarget.value as EditorFacingDirection | "route")}
                                  >
                                    <option value="route">跟随路线</option>
                                    <option value="left">固定朝左</option>
                                    <option value="right">固定朝右</option>
                                  </select>
                                </label>
                                <label className={styles.numberLabel}>
                                  <span>动作资产倍率</span>
                                  <input
                                    type="number"
                                    min="0.01"
                                    max="8"
                                    step="0.01"
                                    value={transitionAssetScaleInputs.from}
                                    placeholder={`${selectedTransitionAssetScaleHint("from").toFixed(2)}×（默认）`}
                                    onChange={(event) => updateTransitionAssetScaleInput("from", event.currentTarget.value)}
                                    onBlur={(event) => commitSelectedTransitionAssetScale("from", event.currentTarget.value)}
                                  />
                                </label>
                              </>
                            ) : null}
                            <input className={styles.transitionAssetInput} type="text" value={selectedStateTransition.fromAssetSource ?? ""} onChange={(event) => updateSelectedTransitionAssetSource("from", event.currentTarget.value)} placeholder="留空：自动沿用前一状态" />
                            <label className={styles.fileButton}>
                              选择起始 PNG / WebP
                              <input type="file" accept="image/png,image/webp,image/*" onChange={(event) => handleTransitionAssetFile(event, "from")} />
                            </label>
                          </div>
                          <div className={styles.transitionAssetField}>
                            <label className={styles.numberLabel}>
                              <span>切换后：当前状态</span>
                              <select value={selectedStateTransition.toAssetMode ?? "actor"} onChange={(event) => updateSelectedTransitionAssetMode("to", event.currentTarget.value as EditorTransitionAssetMode)}>
                                <option value="none">不显示（前往下一场景）</option>
                                <option value="actor">透明角色资产</option>
                                <option value="scene">场景合成资产</option>
                              </select>
                            </label>
                            {selectedStateTransition.toAssetMode !== "none" && selectedStateTransition.toAssetMode !== "scene" ? (
                              <>
                                <label className={styles.numberLabel}>
                                  <span>透明资产朝向</span>
                                  <select
                                    value={selectedStateTransition.toAssetFacing ?? "route"}
                                    onChange={(event) => updateSelectedTransitionAssetFacing("to", event.currentTarget.value as EditorFacingDirection | "route")}
                                  >
                                    <option value="route">跟随路线</option>
                                    <option value="left">固定朝左</option>
                                    <option value="right">固定朝右</option>
                                  </select>
                                </label>
                                <label className={styles.numberLabel}>
                                  <span>动作资产倍率</span>
                                  <input
                                    type="number"
                                    min="0.01"
                                    max="8"
                                    step="0.01"
                                    value={transitionAssetScaleInputs.to}
                                    placeholder={`${selectedTransitionAssetScaleHint("to").toFixed(2)}×（默认）`}
                                    onChange={(event) => updateTransitionAssetScaleInput("to", event.currentTarget.value)}
                                    onBlur={(event) => commitSelectedTransitionAssetScale("to", event.currentTarget.value)}
                                  />
                                </label>
                              </>
                            ) : null}
                            <input className={styles.transitionAssetInput} type="text" value={selectedStateTransition.toAssetSource ?? ""} onChange={(event) => updateSelectedTransitionAssetSource("to", event.currentTarget.value)} placeholder="留空：按目标状态 ID 读取" />
                            <label className={styles.fileButton}>
                              选择结束 PNG / WebP
                              <input type="file" accept="image/png,image/webp,image/*" onChange={(event) => handleTransitionAssetFile(event, "to")} />
                            </label>
                          </div>
                        </div>
                        <small className={styles.inlineHint}>场景合成资产会覆盖母图并暂时隐藏旧遮挡层；透明角色资产则继续使用当前点位、缩放和障碍物遮挡逻辑。倍率留空时沿用状态资产倍率，填写后只作用于这次切换的这一侧。</small>
                      </div>
                    ) : null}
                    <small className={styles.inlineHint}>普通角色状态可用镜像/旋转；若 targetStateId 对应的是已经融入场景的角色状态，选择“白烟散开”会先遮住切换，再显现场景动作资产。</small>
                    <button type="button" className={styles.transitionPreviewButton} onClick={() => previewSelectedTransition("state")}>预览此状态过渡</button>
                  </div>
                ) : null}
              </details>
              <details className={`${styles.assetCard} ${styles.inspectorSubsection}`} open>
                <summary className={styles.transitionHeader}>
                  <div>
                    <strong>透明角色资产入口</strong>
                    <small>当前路线独立覆盖；状态 ID 与上面的状态过渡对应。</small>
                  </div>
                  <span>{selectedAssetSource.startsWith("data:") ? "本地文件" : "路径 / URL"}</span>
                </summary>
                {assetStateOptions.length > 0 ? (
                  <div className={styles.assetStatePresets}>
                    <span>本路线已有动作状态（点击即可载入）</span>
                    <div>
                      {assetStateOptions.map((stateId) => (
                        <button
                          key={stateId}
                          type="button"
                          className={assetStateId.trim() === stateId ? styles.assetStatePresetActive : styles.assetStatePreset}
                          onClick={() => setAssetStateId(stateId)}
                        >
                          {stateId}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className={styles.assetGrid}>
                  <label className={styles.numberLabel}>
                    <span>朝向槽</span>
                    <select id="editor-asset-slot" value={assetSlot} onChange={(event) => setAssetSlot(event.currentTarget.value as EditorFacingDirection)}>
                      <option value="left">左向素材</option>
                      <option value="right">右向素材</option>
                    </select>
                  </label>
                  <label className={styles.numberLabel}>
                    <span>状态 ID（可空）</span>
                    <input id="editor-asset-state" type="text" value={assetStateId} placeholder="基础行走资产" onChange={(event) => setAssetStateId(event.currentTarget.value)} />
                  </label>
                  <label className={styles.numberLabel}>
                    <span>原图朝向（自动镜像）</span>
                    <select
                      value={selectedAssetCanonicalFacing}
                      disabled={!selectedAssetStateId}
                      onChange={(event) => saveRouteAssetFacing(event.currentTarget.value as EditorFacingDirection)}
                    >
                      <option value="left">素材本身朝左</option>
                      <option value="right">素材本身朝右</option>
                    </select>
                  </label>
                  <label className={styles.numberLabel}>
                    <span>资产自身倍率（状态）</span>
                    <input
                      id="editor-asset-scale"
                      type="number"
                      min="0.01"
                      max="8"
                      step="0.01"
                      value={assetScaleInput}
                      disabled={!assetStateId.trim() || draft.sceneId === "attic"}
                      onChange={(event) => setAssetScaleInput(event.currentTarget.value)}
                    />
                  </label>
                </div>
                <label className={styles.numberLabel}>
                  <span>素材路径 / data URL</span>
                  <input id="editor-asset-source" type="text" value={assetSourceInput} onChange={(event) => setAssetSourceInput(event.currentTarget.value)} placeholder="/assets/.../character.webp" />
                </label>
                <div className={styles.assetActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => saveRouteAssetSource(assetSourceInput)}>保存路径</button>
                  <label className={styles.fileButton}>
                    选择 PNG / WebP
                    <input type="file" accept="image/png,image/webp,image/*" onChange={handleAssetFile} />
                  </label>
                  <button type="button" className={styles.resetButton} onClick={clearRouteAssetSource}>清除覆盖</button>
                  <button type="button" className={styles.secondaryButton} onClick={saveRouteAssetScale} disabled={!assetStateId.trim() || draft.sceneId === "attic"}>保存倍率</button>
                </div>
                <small className={styles.inlineHint}>
                  当前生效：{selectedAssetSource.startsWith("data:") ? "已载入本地透明图片" : selectedAssetSource === profile.actorAssets[assetSlot].src ? "默认角色资产" : selectedAssetSource}
                </small>
                {selectedAssetSource ? (
                  <div className={styles.assetPreview}>
                    <img src={selectedAssetSource} alt="当前动作资产预览" draggable={false} />
                    <small>同一动作资产可只保存一张图；反向路线会按上面的原图朝向自动镜像。</small>
                  </div>
                ) : null}
                <small className={styles.inlineHint}>
                  透明动作图如果是 2:1 / 全画布素材，优先在这里设置资产自身倍率；它会叠加当前节点的近大远小缩放，避免把节点位置当成尺寸修正。
                </small>
              </details>
              <label className={styles.numberLabel}>
                <span>手动缩放覆盖</span>
                <select value={selectedPoint.scaleOverride === undefined ? "auto" : String(selectedPoint.scaleOverride)} onChange={(event) => setSelectedScaleOverride(event.currentTarget.value)}>
                  <option value="auto">自动：按地面深度</option>
                  <option value="0.82">0.82</option>
                  <option value="0.90">0.90</option>
                  <option value="1.00">1.00</option>
                  <option value="1.10">1.10</option>
                </select>
              </label>
              <small>当前预览缩放：{pointScale(selectedPoint, draft.scale).toFixed(2)}</small>
            </div>
              {inspectorTab === "nodes" ? (
                <div className={styles.editorActions}>
                  <button type="button" className={styles.addButton} onClick={() => setAddMode((value) => !value)}>
                    {addMode ? "取消插入节点" : "在图上插入节点"}
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={insertPointBetweenSelected} disabled={activeRouteIds.indexOf(selectedPoint.id) >= activeRouteIds.length - 1}>
                    在当前节点后插入
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={removeSelectedPoint} disabled={selectedPoint.role !== "waypoint"}>
                    删除当前节点
                  </button>
                </div>
              ) : null}
            </div>
          ) : inspectorTab !== "interactions" ? (
            <div className={styles.emptyInspector}>先在图上或节点列表中选择一个节点</div>
          ) : null}

          <div className={`${styles.toolPanel} ${inspectorTab === "interactions" ? "" : styles.toolPanelHidden}`}>
            <div className={styles.workflowHeading}>
              <div>
                <strong>④ 场景组件</strong>
                <small>先选组件，再编辑状态，最后把状态绑定到当前路线节点。</small>
              </div>
              <span>{sceneInteractions.length} 个组件</span>
            </div>
            <div className={styles.interactionToolbar}>
              <div className={styles.interactionSelectorGroup}>
                <span className={styles.interactionStepBadge}>1</span>
                <select
                  aria-label="选择场景互动组件"
                  value={selectedInteraction?.id ?? ""}
                  onChange={(event) => {
                    const nextId = event.currentTarget.value;
                    setSelectedInteractionId(nextId);
                    setSelectedInteractionStateId(draft.sceneInteractions?.[nextId]?.states[0]?.id ?? "");
                    setSelectedInteractionAssetId(draft.sceneInteractions?.[nextId]?.assets[0]?.id ?? "");
                  }}
                >
                  <option value="">选择组件…</option>
                  {sceneInteractions.map((interaction) => <option key={interaction.id} value={interaction.id}>{interaction.label}</option>)}
                </select>
              </div>
              <div className={styles.interactionToolbarActions}>
                <button type="button" className={styles.secondaryButton} onClick={addSceneInteraction}>添加组件</button>
                <button type="button" className={styles.resetButton} onClick={removeSelectedSceneInteraction} disabled={!selectedInteraction}>删除组件</button>
              </div>
            </div>
            {selectedInteraction ? (
              <div className={styles.interactionEditor}>
                <div className={styles.interactionSummaryCard}>
                  <div>
                    <strong>{selectedInteraction.label}</strong>
                    <small>{selectedInteraction.kind === "pickup-prop" ? "可拿取物件" : selectedInteraction.kind === "inspect" ? "可观察物件" : selectedInteraction.kind === "ambient" ? "环境组件" : "场景通道组件"} · 锚点：{interactionAnchorPoints.find((point) => point.id === selectedInteraction.anchorPointId)?.label ?? "未绑定"}</small>
                  </div>
                  <span>{selectedInteraction.states.length} 状态 · {selectedInteraction.assets.length} 资产</span>
                </div>
                <div className={styles.interactionRuleCard}>
                  <strong>推荐方式：背景先挂好，路线只切换状态</strong>
                  <span>伞、外套等物件各添加一个「固定在场景」资产；“在场”状态勾选它们，“取走”状态取消勾选。出门绑定取走状态，回来绑定在场状态；想只拿其中一个，就新建一个中间状态。</span>
                </div>
                <label className={styles.textLabel}>
                  <span>组件名称</span>
                  <input
                    type="text"
                    value={selectedInteraction.label}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateSceneInteraction(selectedInteraction.id, (interaction) => ({ ...interaction, label: value }));
                    }}
                  />
                </label>
                <div className={styles.coordinateGrid}>
                  <label>
                    <span>组件类型</span>
                    <select
                      value={selectedInteraction.kind}
                      onChange={(event) => {
                        const value = event.currentTarget.value as EditorSceneInteractionKind;
                        updateSceneInteraction(selectedInteraction.id, (interaction) => ({ ...interaction, kind: value }));
                      }}
                    >
                      <option value="pickup-prop">可拿取物件</option>
                      <option value="inspect">可观察物件</option>
                      <option value="ambient">环境组件</option>
                      <option value="portal">场景通道组件</option>
                    </select>
                  </label>
                  <label>
                    <span>锚点</span>
                    <select
                      value={selectedInteraction.anchorPointId}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateSceneInteraction(selectedInteraction.id, (interaction) => ({ ...interaction, anchorPointId: value }));
                      }}
                    >
                      {interactionAnchorPoints.map((point) => <option key={point.id} value={point.id}>{point.label}</option>)}
                    </select>
                  </label>
                </div>
                <details className={styles.interactionSection} open>
                  <summary className={styles.interactionSectionSummary}><span><b>2</b> 编辑组件状态</span><small>默认：{selectedInteraction.states.find((state) => state.id === selectedInteraction.initialStateId)?.label ?? selectedInteraction.initialStateId}</small></summary>
                  <div className={styles.interactionSectionBody}>
                  <label className={styles.numberLabel}>
                    <span>进入场景时显示</span>
                    <select
                      value={selectedInteraction.initialStateId}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateSceneInteraction(selectedInteraction.id, (interaction) => ({ ...interaction, initialStateId: value }));
                      }}
                    >
                      {selectedInteraction.states.map((state) => <option key={state.id} value={state.id}>{state.label} · {state.id}</option>)}
                    </select>
                  </label>
                  <div className={styles.interactionSubsectionHeader}>
                    <strong>状态列表</strong>
                    <button type="button" className={styles.secondaryButton} onClick={addInteractionState}>添加状态</button>
                  </div>
                  <div className={styles.interactionStateList}>
                    {selectedInteraction.states.map((state) => (
                      <button
                        key={state.id}
                        type="button"
                        className={`${styles.interactionStateButton} ${selectedInteractionState?.id === state.id ? styles.interactionStateButtonActive : ""}`}
                        onClick={() => setSelectedInteractionStateId(state.id)}
                      >
                        <span>{state.label}</span><code>{state.id}</code>
                      </button>
                    ))}
                  </div>
                  {selectedInteractionState ? (
                    <div className={styles.interactionStateEditor}>
                      <label className={styles.textLabel}>
                        <span>状态名称</span>
                        <input
                          type="text"
                          value={selectedInteractionState.label}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            updateSceneInteraction(selectedInteraction.id, (interaction) => ({
                              ...interaction,
                              states: interaction.states.map((state) => state.id === selectedInteractionState.id ? { ...state, label: value } : state),
                            }));
                          }}
                        />
                      </label>
                      <div className={styles.interactionAssetChecks}>
                        <div className={styles.interactionAssetChecksHeader}>
                          <div>
                            <small>该状态显示哪些资产</small>
                            <span>{selectedInteractionState.visibleAssetIds.length}/{selectedInteraction.assets.length} 个在场</span>
                          </div>
                          <div className={styles.interactionQuickActions}>
                            <button type="button" className={styles.interactionQuickAction} onClick={() => setSelectedInteractionStateVisibility(true)}>全部在场</button>
                            <button type="button" className={styles.interactionQuickAction} onClick={() => setSelectedInteractionStateVisibility(false)}>全部取走</button>
                          </div>
                        </div>
                        {selectedInteraction.assets.length === 0
                          ? <em>还没有组件图片，请先添加资产</em>
                          : selectedInteraction.assets.map((asset) => (
                              <label key={asset.id} className={styles.checkboxRow}>
                                <input
                                  type="checkbox"
                                  checked={selectedInteractionState.visibleAssetIds.includes(asset.id)}
                                  onChange={(event) => {
                                    // Read the DOM value before entering React's
                                    // functional state updater. The synthetic
                                    // event target is not stable inside it.
                                    const checked = event.currentTarget.checked;
                                    setSelectedInteractionStateVisibility(checked, asset.id);
                                  }}
                                />
                                <span>{asset.label || asset.id}</span>
                              </label>
                            ))}
                      </div>
                      <button type="button" className={styles.resetButton} onClick={() => removeInteractionState(selectedInteractionState.id)} disabled={selectedInteraction.states.length <= 1}>删除当前状态</button>
                    </div>
                  ) : null}
                  </div>
                </details>

                <details className={styles.interactionSection}>
                  <summary className={styles.interactionSectionSummary}><span><b>3</b> 管理组件图片</span><small>图片、挂载、倍率与偏移</small></summary>
                  <div className={styles.interactionSectionBody}>
                  <div className={styles.interactionSubsectionHeader}>
                    <strong>图片资产</strong>
                    <button type="button" className={styles.secondaryButton} onClick={addInteractionAsset}>添加资产</button>
                  </div>
                  <small className={styles.inlineHint}>先把素材挂到母图：scene 固定在背景，actor 才跟随角色。一个状态可以同时勾选多个素材，路线节点只负责切换状态。</small>
                  <div className={styles.interactionAssetList}>
                    {selectedInteraction.assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className={`${styles.interactionAssetButton} ${selectedInteractionAsset?.id === asset.id ? styles.interactionAssetButtonActive : ""}`}
                        onClick={() => setSelectedInteractionAssetId(asset.id)}
                      >
                        <span>{asset.label || asset.id}</span><code>{asset.mode}</code>
                      </button>
                    ))}
                  </div>
                  {selectedInteractionAsset ? (
                    <div className={styles.interactionAssetEditor}>
                      <label className={styles.textLabel}>
                        <span>资产名称</span>
                        <input
                          type="text"
                          value={selectedInteractionAsset.label}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            updateSelectedInteractionAsset(selectedInteractionAsset.id, (asset) => ({ ...asset, label: value }));
                          }}
                        />
                      </label>
                      <label className={styles.textLabel}>
                        <span>相对路径</span>
                        <input
                          type="text"
                          placeholder="/assets/ecology/formal-scenes/entrance/...webp"
                          value={selectedInteractionAsset.src}
                          onChange={(event) => setSelectedInteractionAssetSource(event.currentTarget.value)}
                          onBlur={(event) => setSelectedInteractionAssetSource(event.currentTarget.value)}
                        />
                      </label>
                      <div className={`${styles.interactionAssetPathStatus} ${selectedInteractionAsset.src.trim() ? styles.interactionAssetPathReady : styles.interactionAssetPathPending}`}>
                        {selectedInteractionAsset.src.trim()
                          ? selectedInteractionAsset.src.startsWith("/assets/")
                            ? "项目相对路径：刷新、换电脑、提交 GitHub 都可复用"
                            : "已填写自定义来源：建议改成 /assets/ 开头的项目资源"
                          : "待配置：可直接粘贴 D 盘绝对路径，编辑器会自动转换为 /assets/…"}
                      </div>
                      <div className={styles.assetLibraryToolbar}>
                        <div>
                          <strong>项目资源管理器</strong>
                          <small>搜索 public/assets，不用手填路径</small>
                        </div>
                        <button type="button" className={styles.secondaryButton} onClick={openAssetLibrary}>
                          {assetLibraryOpen ? "收起资源" : "定位项目资源"}
                        </button>
                      </div>
                      {assetLibraryOpen ? (
                        <div className={styles.assetLibraryPanel}>
                          <div className={styles.assetLibrarySearch}>
                            <input
                              type="search"
                              value={assetLibraryQuery}
                              placeholder="搜索 umbrella / entrance / v4…"
                              onChange={(event) => setAssetLibraryQuery(event.currentTarget.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void searchAssetLibrary();
                                }
                              }}
                            />
                            <button type="button" className={styles.secondaryButton} onClick={() => void searchAssetLibrary()} disabled={assetLibraryLoading}>
                              {assetLibraryLoading ? "扫描中…" : "搜索"}
                            </button>
                          </div>
                          <small className={styles.inlineHint}>
                            {assetLibraryLoading ? "正在扫描项目图片…" : `显示 ${assetLibraryItems.length} / ${assetLibraryTotal} 项；点击结果即可挂载`}
                          </small>
                          <div className={styles.assetLibraryList}>
                            {assetLibraryItems.length === 0 && !assetLibraryLoading
                              ? <em>没有匹配图片，换个关键词试试</em>
                              : assetLibraryItems.map((item) => (
                                <button
                                  key={item.src}
                                  type="button"
                                  className={styles.assetLibraryItem}
                                  onClick={() => chooseAssetLibraryItem(item)}
                                  title={item.src}
                                >
                                  <span className={styles.assetLibraryThumb}>
                                    <img src={item.src} alt="" loading="lazy" draggable={false} />
                                  </span>
                                  <span className={styles.assetLibraryItemText}>
                                    <strong>{item.name}</strong>
                                    <small>/assets/{item.relativePath}</small>
                                  </span>
                                  <code>{item.extension}</code>
                                </button>
                              ))}
                          </div>
                        </div>
                      ) : null}
                      <div className={styles.coordinateGrid}>
                        <label>
                          <span>挂载方式</span>
                          <select
                            value={selectedInteractionAsset.mode}
                            onChange={(event) => {
                              const value = event.currentTarget.value as EditorSceneInteractionAssetMode;
                              updateSelectedInteractionAsset(selectedInteractionAsset.id, (asset) => ({ ...asset, mode: value }));
                            }}
                          >
                            <option value="scene">固定在场景</option>
                            <option value="actor">跟随角色</option>
                          </select>
                        </label>
                        <label>
                          <span>Z 层级</span>
                          <input
                            type="number"
                            value={selectedInteractionAsset.zIndex}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value) || 0;
                              updateSelectedInteractionAsset(selectedInteractionAsset.id, (asset) => ({ ...asset, zIndex: value }));
                            }}
                          />
                        </label>
                        <label>
                          <span>倍率</span>
                          <input
                            type="number"
                            min="0.01"
                            max="8"
                            step="0.01"
                            value={selectedInteractionAsset.scale ?? 1}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value) || 1;
                              updateSelectedInteractionAsset(selectedInteractionAsset.id, (asset) => ({ ...asset, scale: value }));
                            }}
                          />
                        </label>
                        <label>
                          <span>偏移 X（px）</span>
                          <input
                            type="number"
                            value={selectedInteractionAsset.offset?.[0] ?? 0}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value) || 0;
                              updateSelectedInteractionAsset(selectedInteractionAsset.id, (asset) => ({ ...asset, offset: [value, asset.offset?.[1] ?? 0] }));
                            }}
                          />
                        </label>
                        <label>
                          <span>偏移 Y（px）</span>
                          <input
                            type="number"
                            value={selectedInteractionAsset.offset?.[1] ?? 0}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value) || 0;
                              updateSelectedInteractionAsset(selectedInteractionAsset.id, (asset) => ({ ...asset, offset: [asset.offset?.[0] ?? 0, value] }));
                            }}
                          />
                        </label>
                      </div>
                      <small className={styles.interactionAssetCanvasHint}>
                        画布操作：拖图片本体调整位置；拖选中框右下角的 ↘ 手柄调整倍率；锚点不会移动。
                      </small>
                      <button type="button" className={styles.resetButton} onClick={() => removeInteractionAsset(selectedInteractionAsset.id)}>删除当前资产</button>
                    </div>
                  ) : null}
                  </div>
                </details>

                <details className={styles.interactionSection} open>
                  <summary className={styles.interactionSectionSummary}><span><b>4</b> 绑定当前节点事件</span><small>{selectedPoint ? `当前节点：${selectedPoint.label}` : "先选择路线节点"}</small></summary>
                  <div className={styles.interactionSectionBody}>
                    <small className={styles.inlineHint}>组件状态不会自动改变路线；只有绑定到节点，抵达该节点时才会触发。</small>
                    <label className={styles.numberLabel}>
                      <span>当前节点触发组件</span>
                      <select
                        value={selectedPointInteractionEvent?.interactionId ?? ""}
                        disabled={!selectedPoint}
                        onChange={(event) => {
                          const nextId = event.currentTarget.value;
                          setSelectedInteractionId(nextId);
                          setSelectedPointInteractionEvent(nextId);
                        }}
                      >
                        <option value="">不触发组件事件</option>
                        {sceneInteractions.map((interaction) => <option key={interaction.id} value={interaction.id}>{interaction.label}</option>)}
                      </select>
                    </label>
                    {selectedPointInteractionEvent && selectedPointEventInteraction ? (
                      <label className={styles.numberLabel}>
                        <span>抵达后切换为</span>
                        <select value={selectedPointInteractionEvent.stateId} onChange={(event) => setSelectedPointInteractionState(selectedPointEventInteraction.id, event.currentTarget.value)}>
                          {selectedPointEventInteraction.states.map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}
                        </select>
                      </label>
                    ) : null}
                  </div>
                </details>
              </div>
            ) : (
              <div className={styles.emptyInspector}>当前场景还没有组件。先点击“添加组件”，再把它绑定到已有语义锚点。</div>
            )}
          </div>

          <div className={`${styles.toolPanel} ${inspectorTab === "scale" ? "" : styles.toolPanelHidden}`}>
            <div className={styles.workflowHeading}>
              <div>
                <strong>④ 设置近大远小</strong>
                <small>统一调整这张场景图上的角色深度缩放。</small>
              </div>
              <span>{draft.scale.mode === "depth" ? "自动模式" : "手动模式"}</span>
            </div>
          <div className={styles.scaleCard}>
            <div className={styles.selectedHeader}>
              <strong>近大远小模型</strong>
              <span>{draft.scale.mode === "depth" ? "按接地点 Y 自动计算" : "手动模式"}</span>
            </div>
            <label className={styles.numberLabel}>
              <span>模式</span>
              <select value={draft.scale.mode} onChange={(event) => updateScale("mode", event.currentTarget.value)}>
                <option value="depth">统一深度曲线</option>
                <option value="manual">仅使用点位覆盖</option>
              </select>
            </label>
            <div className={styles.scaleGrid}>
              <label><span>远端 Y</span><input type="number" value={draft.scale.farY} onChange={(event) => updateScale("farY", event.currentTarget.value)} /></label>
              <label><span>远端缩放</span><input type="number" min="0.5" max="1.5" step="0.01" value={draft.scale.farScale} onChange={(event) => updateScale("farScale", event.currentTarget.value)} /></label>
              <label><span>近端 Y</span><input type="number" value={draft.scale.nearY} onChange={(event) => updateScale("nearY", event.currentTarget.value)} /></label>
              <label><span>近端缩放</span><input type="number" min="0.5" max="1.5" step="0.01" value={draft.scale.nearScale} onChange={(event) => updateScale("nearScale", event.currentTarget.value)} /></label>
            </div>
          </div>
          </div>

          <div className={`${styles.toolPanel} ${inspectorTab === "manage" ? "" : styles.toolPanelHidden}`}>
            <div className={styles.workflowHeading}>
              <div>
                <strong>⑤ 管理路线与保存</strong>
                <small>新建、导入、导出或恢复这张场景的路线草稿。</small>
              </div>
              <span>不会改变母图</span>
            </div>
            <div className={styles.routeManagement}>
              <div className={styles.routeManagementBody}>
                <button type="button" className={styles.secondaryButton} onClick={createRoute}>添加新路线</button>
                <button type="button" className={styles.secondaryButton} onClick={() => createRouteFromSource(false)}>复用当前路线</button>
                <button type="button" className={styles.secondaryButton} onClick={() => createRouteFromSource(true)}>复用并反转</button>
                <button type="button" className={styles.secondaryButton} onClick={importDraft}>导入 JSON</button>
                <button type="button" className={styles.resetButton} onClick={deleteCurrentRoute}>删除当前自定义路线</button>
                <small>“复用”会复制当前路线的全部节点、事件和角色资产；“复用并反转”会倒置节点顺序并自动反转朝向。复制后的节点完全独立，不会再牵连原路线。</small>
              </div>
            </div>
            <div className={styles.exportActions}>
              <button type="button" className={styles.primaryButton} onClick={exportDraft}>复制并下载 JSON</button>
              <button type="button" className={styles.secondaryButton} onClick={saveDraft}>保存本地草稿</button>
              <button type="button" className={styles.secondaryButton} onClick={publishDraft} disabled={publishing}>{publishing ? "发布中…" : "发布到正式版"}</button>
              <button type="button" className={styles.resetButton} onClick={resetDraft}>恢复初始点位</button>
            </div>
          </div>
          </div>
        </aside>
      </section>

      <p className={styles.footerNote}>
        编辑器的点位坐标始终以母图左上角为原点，导出同时保留像素坐标和归一化坐标。透明 alpha 才是前景遮挡真相；没有 floor polygon 的场景仍可编辑路线，但不会冒充运行时可行走面。
      </p>
    </main>
  );
}
