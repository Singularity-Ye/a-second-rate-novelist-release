import {
  formalEcologySceneManifest,
  getFormalSceneRoute,
  type FormalSceneId,
  type NovelistFormalScene,
  type NovelistResolvedRoute,
} from "../novelist/scene-manifest";
import type { RouteAnchorKind, RouteAnchorPort } from "./route-anchor-semantics";

export type FormalRoutePurpose =
  | "scene-transition"
  | "scene-entry"
  | "scene-exit"
  | "scene-interaction"
  | "waypoint-walk";

export type FormalRouteAnchor = {
  pointId: string;
  kind: RouteAnchorKind;
  key?: string;
  groupKey?: string;
  port?: RouteAnchorPort;
};

export type FormalRouteEdge = {
  sceneId: FormalSceneId;
  route: NovelistResolvedRoute;
  start: FormalRouteAnchor;
  end: FormalRouteAnchor;
  purpose: FormalRoutePurpose;
  /** The physical scene at the start of this directed edge. */
  fromSceneId: FormalSceneId;
  /** The physical scene at the end of this directed edge. */
  toSceneId: FormalSceneId;
  isSceneConnector: boolean;
};

export type FormalRouteGraph = {
  edges: readonly FormalRouteEdge[];
  sceneEdges: (sceneId: FormalSceneId) => readonly FormalRouteEdge[];
  /** Resolve canonical and aliased published route IDs to the same edge. */
  routeEdge: (sceneId: FormalSceneId, routeId: string) => FormalRouteEdge | null;
  connectorEdges: () => readonly FormalRouteEdge[];
  findConnectorPath: (fromSceneId: FormalSceneId, toSceneId: FormalSceneId) => readonly FormalRouteEdge[] | null;
  /** Find a local published route chain between two physical anchors. */
  findLocalPath: (sceneId: FormalSceneId, fromPointId: string, toPointId: string) => readonly FormalRouteEdge[] | null;
};

const formalSceneIds = new Set<FormalSceneId>(Object.keys(formalEcologySceneManifest.scenes) as FormalSceneId[]);

function asFormalSceneId(value: string | undefined): FormalSceneId | null {
  return value && formalSceneIds.has(value as FormalSceneId) ? value as FormalSceneId : null;
}

function sceneIdFromPortalKey(key: string | undefined): FormalSceneId | null {
  if (!key?.startsWith("portal.")) return null;
  return asFormalSceneId(key.slice("portal.".length));
}

function pointAnchor(point: NovelistResolvedRoute["points"][number]): FormalRouteAnchor {
  return {
    pointId: point.id,
    kind: point.anchorKind ?? "waypoint",
    ...(point.anchorKey ? { key: point.anchorKey } : {}),
    ...(point.anchorGroupKey ? { groupKey: point.anchorGroupKey } : {}),
    ...(point.anchorPort ? { port: point.anchorPort } : {}),
  };
}

function routeSignature(route: Pick<NovelistResolvedRoute, "waypointIds" | "transitions">): string {
  return JSON.stringify({
    waypointIds: route.waypointIds,
    transitions: route.transitions ?? [],
  });
}

function classifyEdge(
  sceneId: FormalSceneId,
  route: NovelistResolvedRoute,
  start: FormalRouteAnchor,
  end: FormalRouteAnchor,
): Omit<FormalRouteEdge, "sceneId" | "route" | "start" | "end"> {
  const startPortalScene = sceneIdFromPortalKey(start.key);
  const endPortalScene = sceneIdFromPortalKey(end.key);
  const crossesScene = Boolean(
    (startPortalScene && startPortalScene !== sceneId)
      || (endPortalScene && endPortalScene !== sceneId),
  );

  if (crossesScene) {
    return {
      purpose: "scene-transition",
      fromSceneId: startPortalScene ?? sceneId,
      toSceneId: endPortalScene ?? sceneId,
      isSceneConnector: true,
    };
  }

  if (start.kind === "portal" && end.kind === "interaction") {
    return {
      purpose: "scene-entry",
      fromSceneId: sceneId,
      toSceneId: sceneId,
      isSceneConnector: false,
    };
  }

  if (start.kind === "interaction" && end.kind === "portal") {
    return {
      purpose: "scene-exit",
      fromSceneId: sceneId,
      toSceneId: sceneId,
      isSceneConnector: false,
    };
  }

  if (start.kind === "interaction" || end.kind === "interaction") {
    return {
      purpose: "scene-interaction",
      fromSceneId: sceneId,
      toSceneId: sceneId,
      isSceneConnector: false,
    };
  }

  return {
    purpose: "waypoint-walk",
    fromSceneId: sceneId,
    toSceneId: sceneId,
    isSceneConnector: false,
  };
}

function publishedRoutes(scene: NovelistFormalScene): NovelistResolvedRoute[] {
  const seen = new Set<string>();
  const routes: NovelistResolvedRoute[] = [];
  for (const route of Object.values(scene.routes)) {
    if (!route.publishedFromSnapshot || seen.has(routeSignature(route))) continue;
    const resolved = getFormalSceneRoute(scene.sceneId, route.id);
    if (!resolved) continue;
    seen.add(routeSignature(resolved));
    routes.push(resolved);
  }
  return routes;
}

function buildEdges(): FormalRouteEdge[] {
  const edges: FormalRouteEdge[] = [];
  for (const scene of Object.values(formalEcologySceneManifest.scenes)) {
    const sceneId = scene.sceneId as FormalSceneId;
    for (const route of publishedRoutes(scene)) {
      const firstPoint = route.points[0];
      const lastPoint = route.points.at(-1);
      if (!firstPoint || !lastPoint) continue;
      const start = pointAnchor(firstPoint);
      const end = pointAnchor(lastPoint);
      edges.push({
        sceneId,
        route,
        start,
        end,
        ...classifyEdge(sceneId, route, start, end),
      });
    }
  }
  return edges;
}

const semanticHandoffAnchors = [
  "料理台交互点",
  "餐桌交互点",
  "生活通道入口",
  "卧室门",
  "床边",
  "小沙发",
  "梯口",
  "旧书架",
  "旧稿桌",
  "长椅",
  "小龟池",
  "盆栽",
  "望远镜",
] as const;

/**
 * Decide whether two published point IDs represent one physical handoff.
 * Exact anchor keys are authoritative; group keys support stateful ports such
 * as the study desk's left/right arrival points. The text/coordinate fallbacks
 * keep older published snapshots readable without changing their geometry.
 */
function pointsCanHandoff(sceneId: FormalSceneId, leftId: string, rightId: string): boolean {
  if (leftId === rightId) return true;
  const points = formalEcologySceneManifest.scenes[sceneId].routePoints;
  const left = points.find((point) => point.id === leftId);
  const right = points.find((point) => point.id === rightId);
  if (!left || !right) return false;
  if (left.anchorKey && right.anchorKey) {
    const exactPhysicalAnchor = left.anchorKind !== "waypoint"
      && right.anchorKind !== "waypoint"
      && left.anchorKey === right.anchorKey;
    if (exactPhysicalAnchor) return true;
  }
  if (left.anchorGroupKey && right.anchorGroupKey) {
    const sharedStatefulInteraction = left.anchorKind === "interaction"
      && right.anchorKind === "interaction"
      && left.anchorGroupKey === right.anchorGroupKey;
    if (sharedStatefulInteraction) return true;
  }
  const semanticMatch = semanticHandoffAnchors.some((anchor) => (
    left.label.includes(anchor) && right.label.includes(anchor)
  ));
  if (semanticMatch) return true;
  return Math.hypot(left.x - right.x, left.y - right.y) <= 0.015;
}

function findLocalPath(
  edges: readonly FormalRouteEdge[],
  sceneId: FormalSceneId,
  fromPointId: string,
  toPointId: string,
): readonly FormalRouteEdge[] | null {
  if (pointsCanHandoff(sceneId, fromPointId, toPointId)) return [];
  const routes = edges.filter((edge) => !edge.isSceneConnector && edge.sceneId === sceneId);
  const queue: Array<{ pointId: string; path: FormalRouteEdge[] }> = [{ pointId: fromPointId, path: [] }];
  const visited = new Set<string>([fromPointId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of routes) {
      const routeStart = edge.route.waypointIds[0];
      const routeEnd = edge.route.waypointIds.at(-1);
      if (!routeStart || !routeEnd || !pointsCanHandoff(sceneId, routeStart, current.pointId)) continue;
      const path = [...current.path, edge];
      if (pointsCanHandoff(sceneId, routeEnd, toPointId)) return path;
      if (visited.has(routeEnd)) continue;
      visited.add(routeEnd);
      queue.push({ pointId: routeEnd, path });
    }
  }
  return null;
}

function findConnectorPath(edges: readonly FormalRouteEdge[], fromSceneId: FormalSceneId, toSceneId: FormalSceneId): readonly FormalRouteEdge[] | null {
  if (fromSceneId === toSceneId) return [];
  const queue: Array<{ sceneId: FormalSceneId; path: FormalRouteEdge[] }> = [{ sceneId: fromSceneId, path: [] }];
  const visited = new Set<FormalSceneId>([fromSceneId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (!edge.isSceneConnector || edge.fromSceneId !== current.sceneId) continue;
      const path = [...current.path, edge];
      if (edge.toSceneId === toSceneId) return path;
      if (visited.has(edge.toSceneId)) continue;
      visited.add(edge.toSceneId);
      queue.push({ sceneId: edge.toSceneId, path });
    }
  }
  return null;
}

/**
 * Build the live physical route graph from the already-published formal
 * manifest. Labels are deliberately ignored for graph topology; anchor keys
 * are the stable identity shared by forward, reverse, and cloned endpoints.
 */
export function buildFormalRouteGraph(): FormalRouteGraph {
  const edges = buildEdges();
  return {
    edges,
    sceneEdges: (sceneId) => edges.filter((edge) => edge.sceneId === sceneId),
    routeEdge: (sceneId, routeId) => {
      const resolved = getFormalSceneRoute(sceneId, routeId);
      if (!resolved) return null;
      const edge = edges.find((candidate) => (
        candidate.sceneId === sceneId
        && routeSignature(candidate.route) === routeSignature(resolved)
      ));
      return edge ? { ...edge, route: resolved } : null;
    },
    connectorEdges: () => edges.filter((edge) => edge.isSceneConnector),
    findConnectorPath: (fromSceneId, toSceneId) => findConnectorPath(edges, fromSceneId, toSceneId),
    findLocalPath: (sceneId, fromPointId, toPointId) => findLocalPath(edges, sceneId, fromPointId, toPointId),
  };
}
