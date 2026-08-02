/** @deprecated Geometry-only prototype. 3000 uses ../route-publish/formal-route-runtime.ts. */
import type {
  FormalSceneId,
  NovelistResolvedRoute,
  NovelistRoutePoint,
} from "./scene-manifest";
import type {
  FormalRouteSnapshot,
  RoutePublishIssue,
} from "../geometry-test/route-publish.contract";

const studyEditorToFormalPoint: Readonly<Record<string, string>> = {
  door: "editor-door",
  "seat-left": "editor-seat-left",
  "seat-right": "editor-seat-right",
  "out-1": "editor-out-1",
  "out-2": "editor-out-2",
  "out-3": "editor-out-3",
  "out-4": "editor-out-4",
  "out-5": "editor-out-5",
  "in-1": "editor-in-1",
  "in-2": "editor-in-2",
  "in-3": "editor-in-3",
  "in-4": "editor-in-4",
  "in-5": "editor-in-5",
  "in-6": "editor-in-6",
  "in-7": "editor-in-7",
  "seat-kitchen-1": "editor-seat-kitchen-1",
  "seat-kitchen-2": "editor-seat-kitchen-2",
  "seat-kitchen-3": "editor-seat-kitchen-3",
  "kitchen-seat-1": "editor-kitchen-seat-1",
  "kitchen-seat-2": "editor-kitchen-seat-2",
  "kitchen-seat-3": "editor-kitchen-seat-3",
  "door-kitchen-1": "editor-door-kitchen-1",
  "door-kitchen-2": "editor-door-kitchen-2",
  "door-kitchen-3": "editor-door-kitchen-3",
  "door-kitchen-4": "editor-door-kitchen-4",
  "kitchen-door-1": "editor-kitchen-door-1",
  "kitchen-door-2": "editor-kitchen-door-2",
  "kitchen-door-3": "editor-kitchen-door-3",
  "kitchen-door-4": "editor-kitchen-door-4",
};

function sourceRouteKey(sceneId: FormalSceneId, formalRouteId: string): string {
  if (sceneId === "study" && formalRouteId.startsWith("study-")) return formalRouteId.slice("study-".length);
  if (sceneId === "dining-kitchen" && formalRouteId.startsWith("dining-")) return formalRouteId.slice("dining-".length);
  return formalRouteId;
}

function sourcePointId(sceneId: FormalSceneId, formalPointId: string): string {
  if (sceneId !== "study") return formalPointId;
  const entry = Object.entries(studyEditorToFormalPoint).find(([, value]) => value === formalPointId);
  return entry?.[0] ?? formalPointId;
}

function issue(path: string, message: string): RoutePublishIssue {
  return { severity: "error", code: "formal-route-projection-failed", path, message };
}

function publishedPoint(
  base: NovelistRoutePoint,
  snapshotPoint: FormalRouteSnapshot["points"][string],
): NovelistRoutePoint {
  return {
    ...base,
    x: snapshotPoint.x,
    y: snapshotPoint.y,
    stableScale: snapshotPoint.scale,
    contactPoint: { x: snapshotPoint.x, y: snapshotPoint.y },
    pixel: { ...snapshotPoint.pixel },
    anchorStatus: "confirmed-pixel",
    anchorNote: `published route snapshot · ${snapshotPoint.id}`,
  };
}

/**
 * Project only geometry/scale from a published editor snapshot onto a route
 * that already exists in the formal manifest. Existing formal phases, action
 * assets, masks, and scene handoff transitions remain authoritative until a
 * later adapter version explicitly promotes those event semantics too.
 */
export function projectPublishedSnapshotOntoFormalRoute(
  sceneId: FormalSceneId,
  baseRoute: NovelistResolvedRoute | null,
  snapshot: FormalRouteSnapshot | null,
): { route: NovelistResolvedRoute | null; issues: readonly RoutePublishIssue[] } {
  if (!baseRoute || !snapshot || snapshot.sceneId !== sceneId) return { route: baseRoute, issues: [] };
  const routeKey = sourceRouteKey(sceneId, baseRoute.id);
  const publishedRoute = snapshot.routes[routeKey];
  if (!publishedRoute) return { route: baseRoute, issues: [] };

  const basePointsById = new Map(baseRoute.points.map((point) => [point.id, point]));
  const points: NovelistRoutePoint[] = [];
  const issues: RoutePublishIssue[] = [];
  const waypointIds: string[] = [];

  for (const basePointId of baseRoute.waypointIds) {
    const editorPointId = sourcePointId(sceneId, basePointId);
    const nextPoint = snapshot.points[editorPointId];
    const basePoint = basePointsById.get(basePointId);
    if (!nextPoint || !basePoint) {
      issues.push(issue(`routes.${routeKey}.points.${basePointId}`, `正式点位 ${basePointId} 无法在已发布快照中完成显式映射。`));
      continue;
    }
    waypointIds.push(basePointId);
    points.push(publishedPoint(basePoint, nextPoint));
  }

  if (issues.length > 0 || points.length !== baseRoute.waypointIds.length) {
    return { route: baseRoute, issues };
  }

  if (publishedRoute.pointIds.length !== baseRoute.waypointIds.length) {
    return {
      route: baseRoute,
      issues: [issue(`routes.${routeKey}.pointIds`, "已发布路线的点位数量与正式路线不同，拒绝静默截断或补点。")],
    };
  }

  return {
    route: {
      ...baseRoute,
      waypointIds,
      durationMs: publishedRoute.durationMs,
      points,
    },
    issues: [],
  };
}
