import type {
  EditorFacingDirection,
  EditorForegroundLayer,
  EditorLayerModes,
  EditorRouteAccent,
  EditorRouteAssetLibrary,
  EditorRouteForegroundPolicy,
  EditorRouteKind,
  EditorTransitionAnimation,
  EditorTransitionAssetMode,
  EditorTransitionKind,
  EditorSceneInteractionAssetMode,
  EditorSceneInteractionKind,
} from "../geometry-test/route-editor.model";
import type { NovelistRoutePhase } from "../novelist/scene-manifest";
import type { RouteAnchorKind, RouteAnchorPort, RouteAnchorSource } from "./route-anchor-semantics";

/** The only file format that is allowed to cross from the editor into 3000. */
export const FORMAL_ROUTE_SNAPSHOT_SCHEMA = "formal-route-snapshot.v1" as const;
export const EDITOR_ROUTE_SOURCE_SCHEMA = "route-editor.v2" as const;

export type FormalRouteSnapshotPoint = {
  id: string;
  label: string;
  role: string;
  semanticRole?: string;
  /** Physical meaning of the point; optional so existing v1 snapshots remain readable. */
  anchorKind?: RouteAnchorKind;
  /** Stable identity shared by cloned/reversed route endpoints. */
  anchorKey?: string;
  /** Shared interaction identity for distinct ports such as the study desk's left/right chair points. */
  anchorGroupKey?: string;
  anchorPort?: RouteAnchorPort;
  /** Authored explicitly in 3001 or inferred while upgrading a legacy draft. */
  anchorSource?: RouteAnchorSource;
  pixel: readonly [number, number];
  normalized: { x: number; y: number };
  depth: "foreground" | "midground" | "background";
  facing: EditorFacingDirection;
  stableScale: number;
  scaleOverride?: number;
};

export type FormalRouteSnapshotEvent = {
  pointId: string;
  progress: number;
  kind: EditorTransitionKind;
  facing?: EditorFacingDirection;
  targetStateId?: string;
  layerModes?: EditorLayerModes;
  fromAssetSource?: string;
  fromAssetMode?: EditorTransitionAssetMode;
  fromAssetFacing?: EditorFacingDirection;
  fromAssetScale?: number;
  toAssetSource?: string;
  toAssetMode?: EditorTransitionAssetMode;
  toAssetFacing?: EditorFacingDirection;
  toAssetScale?: number;
  animation: EditorTransitionAnimation;
};

export type FormalSceneInteractionAsset = {
  id: string;
  label: string;
  src: string;
  mode: EditorSceneInteractionAssetMode;
  zIndex: number;
  scale: number;
  /** Optional normalized scene position for fixed scene props. */
  position?: { x: number; y: number };
  /** Normalized offset in the published scene canvas. */
  offset: { x: number; y: number };
};

export type FormalSceneInteractionState = {
  id: string;
  label: string;
  visibleAssetIds: readonly string[];
  actorAssetId?: string;
};

export type FormalSceneInteraction = {
  id: string;
  label: string;
  kind: EditorSceneInteractionKind;
  anchorPointId: string;
  initialStateId: string;
  assets: readonly FormalSceneInteractionAsset[];
  states: readonly FormalSceneInteractionState[];
};

export type FormalRouteSnapshotInteractionEvent = {
  pointId: string;
  progress: number;
  interactionId: string;
  stateId: string;
};

export type FormalRouteSnapshotPhase = {
  id: string;
  startProgress: number;
  endProgress: number;
  actionId: string;
  cameraFacing: EditorFacingDirection;
  travelDirection: NovelistRoutePhase["travelDirection"];
  actorMode: "seated" | "standing" | "walking";
  foregroundPolicy: EditorRouteForegroundPolicy;
  layerModes: EditorLayerModes;
  pathStartPointId?: string;
  pathEndPointId?: string;
  holdAtPointId?: string;
  stateId?: string;
};

export type FormalRouteSnapshotRoute = {
  id: string;
  label: string;
  kind: EditorRouteKind;
  accent: EditorRouteAccent;
  startPointId: string;
  endPointId: string;
  waypointIds: readonly string[];
  durationMs: number;
  playback: {
    speedMultiplier: number;
    pixelsPerSecondAtOneX: number;
    lengthPx: number;
  };
  initialFacing: EditorFacingDirection;
  foregroundPolicy: EditorRouteForegroundPolicy;
  assetLibrary?: EditorRouteAssetLibrary;
  phases: readonly FormalRouteSnapshotPhase[];
  events: readonly FormalRouteSnapshotEvent[];
  interactionEvents?: readonly FormalRouteSnapshotInteractionEvent[];
  terminal: {
    pointId: string;
    stateId?: string;
    assetMode?: EditorTransitionAssetMode;
    hideAfter: boolean;
  };
};

export type FormalRouteSnapshot = {
  schemaVersion: typeof FORMAL_ROUTE_SNAPSHOT_SCHEMA;
  publishedAt: string;
  source: {
    schemaVersion: typeof EDITOR_ROUTE_SOURCE_SCHEMA;
    draftVersion: 1 | 2;
    sceneId: string;
    canvas: { width: number; height: number };
    coordinateSpace: "pixel-top-left-origin";
  };
  scene: {
    sceneId: string;
    label: string;
    masterSrc: string;
    canvas: { width: number; height: number };
    foregroundLayers: readonly Pick<EditorForegroundLayer, "id" | "src" | "label" | "policy" | "zIndex">[];
    /** Persistent scene components; empty assets are valid during planning. */
    interactions?: readonly FormalSceneInteraction[];
    floorStatus: "frozen" | "pending";
    anchorSemantics: Readonly<Record<string, string>>;
  };
  scale: {
    mode: "depth" | "manual";
    farY: number;
    nearY: number;
    farScale: number;
    nearScale: number;
  };
  points: readonly FormalRouteSnapshotPoint[];
  routes: Readonly<Record<string, FormalRouteSnapshotRoute>>;
};

export type RoutePublishIssue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

export type CanonicalRouteRevision = {
  sceneId: string;
  revisionId: string;
  contentHash: string;
  sourceHash: string;
  publishedAt: string;
};

export type RoutePublishResult =
  | {
      ok: true;
      snapshot: FormalRouteSnapshot;
      issues: readonly RoutePublishIssue[];
    }
  | {
      ok: false;
      snapshot: null;
      issues: readonly RoutePublishIssue[];
    };

/** Lightweight guard for snapshots read back by the explicit publish API. */
export function isFormalRouteSnapshot(value: unknown): value is FormalRouteSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FormalRouteSnapshot>;
  return candidate.schemaVersion === FORMAL_ROUTE_SNAPSHOT_SCHEMA
    && candidate.source?.schemaVersion === EDITOR_ROUTE_SOURCE_SCHEMA
    && typeof candidate.source?.sceneId === "string"
    && typeof candidate.scene?.sceneId === "string"
    && candidate.source.sceneId === candidate.scene.sceneId
    && Array.isArray(candidate.points)
    && Boolean(candidate.routes && typeof candidate.routes === "object");
}
