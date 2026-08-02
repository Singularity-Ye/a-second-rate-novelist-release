/** @deprecated Historical prototype shape. Runtime authority lives in ../route-publish/contract.ts. */
import type {
  EditorFacingDirection,
  EditorLayerModes,
  EditorRouteAccent,
  EditorRouteAssetLibrary,
  EditorRouteForegroundPolicy,
  EditorRouteKind,
  EditorRouteTransition,
  EditorScaleSettings,
} from "./route-editor.model";

/**
 * Versioned boundary between the route editor and the formal room.
 *
 * This is deliberately not the editor's localStorage shape and not the
 * formal room's manifest shape. It is a deterministic, normalized publish
 * artifact that can be validated, diffed, stored, and rolled back.
 */
export const FORMAL_ROUTE_SNAPSHOT_SCHEMA = "erliu.formal-route-snapshot" as const;
export const FORMAL_ROUTE_SNAPSHOT_VERSION = 1 as const;

export type RoutePublishSeverity = "error" | "warning";

export type RoutePublishIssue = {
  severity: RoutePublishSeverity;
  code: string;
  path: string;
  message: string;
};

export type FormalRouteSnapshotPoint = {
  id: string;
  label: string;
  role: string;
  semanticRole?: string;
  x: number;
  y: number;
  pixel: { x: number; y: number };
  scale: number;
  scaleSource: "override" | "depth" | "manual-default";
};

export type FormalRouteSnapshotTransition = EditorRouteTransition & {
  /** Distance-normalized trigger position on the route. */
  progress: number;
};

export type FormalRouteSnapshotRoute = {
  /** Stable published id; initially identical to the editor route key. */
  id: string;
  sourceRouteKey: string;
  label: string;
  kind: EditorRouteKind;
  accent: EditorRouteAccent;
  pointIds: readonly string[];
  startPointId: string | null;
  endPointId: string | null;
  durationMs: number;
  initialFacing: EditorFacingDirection;
  finalFacing: EditorFacingDirection;
  foregroundPolicy: EditorRouteForegroundPolicy;
  transitions: readonly FormalRouteSnapshotTransition[];
  layerModesAtStart: Readonly<EditorLayerModes>;
  layerModesAtEnd: Readonly<EditorLayerModes>;
  assetLibrary?: EditorRouteAssetLibrary;
};

export type FormalRouteSnapshot = {
  schema: typeof FORMAL_ROUTE_SNAPSHOT_SCHEMA;
  version: typeof FORMAL_ROUTE_SNAPSHOT_VERSION;
  sceneId: string;
  canvas: { width: number; height: number };
  scale: EditorScaleSettings;
  source: {
    draftVersion: 1 | 2;
    sourceId?: string;
    sourceHash?: string;
  };
  points: Readonly<Record<string, FormalRouteSnapshotPoint>>;
  routes: Readonly<Record<string, FormalRouteSnapshotRoute>>;
};

export type RoutePublishResult = {
  snapshot: FormalRouteSnapshot | null;
  issues: readonly RoutePublishIssue[];
  ok: boolean;
};

/** Lightweight boundary check for snapshots read back from disk or HTTP. */
export function isFormalRouteSnapshot(value: unknown): value is FormalRouteSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FormalRouteSnapshot>;
  return candidate.schema === FORMAL_ROUTE_SNAPSHOT_SCHEMA
    && candidate.version === FORMAL_ROUTE_SNAPSHOT_VERSION
    && typeof candidate.sceneId === "string"
    && Boolean(candidate.canvas && typeof candidate.canvas.width === "number" && typeof candidate.canvas.height === "number")
    && Boolean(candidate.source && typeof candidate.source.draftVersion === "number")
    && Boolean(candidate.points && typeof candidate.points === "object")
    && Boolean(candidate.routes && typeof candidate.routes === "object");
}
