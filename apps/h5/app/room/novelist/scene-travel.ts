import {
  formalEcologySceneManifest,
  getFormalScenePortalArrivalRouteId,
  getFormalScenePortalPointId,
  getFormalSceneRoute,
  type FormalSceneId,
  type NovelistActivity,
} from "./scene-manifest";
import { buildFormalRouteGraph, type FormalRouteEdge } from "../route-publish/formal-route-graph";

export type SceneTravelLegRole = "exit" | "connector" | "entry" | "destination";

export type SceneTravelLeg = {
  sceneId: FormalSceneId;
  routeId: string;
  label: string;
  role: SceneTravelLegRole;
  fromSceneId: FormalSceneId;
  toSceneId: FormalSceneId;
};

export type SceneJourneyPlan = {
  fromSceneId: FormalSceneId;
  targetSceneId: FormalSceneId;
  targetRouteId: string;
  legs: readonly SceneTravelLeg[];
};

export type PreferredSceneConnector = {
  sceneId: FormalSceneId;
  routeId: string;
};

type ConnectorEdge = {
  sceneId: FormalSceneId;
  from: FormalSceneId;
  to: FormalSceneId;
  routeId: string;
  label: string;
};

export type SceneConnectorTargetStrategy = "portal-stay" | "interaction-state";

export type SceneConnectorTarget = {
  targetRouteId: string;
  targetState: NovelistActivity;
  strategy: SceneConnectorTargetStrategy;
};

const formalRouteGraph = buildFormalRouteGraph();

function scenePortalPointId(sceneId: FormalSceneId): string | undefined {
  return getFormalScenePortalPointId(sceneId);
}

const roomNameEntries: ReadonlyArray<[string, FormalSceneId]> = [
  ["书房", "study"],
  ["卧室", "bedroom"],
  ["厨房", "dining-kitchen"],
  ["餐厅", "dining-kitchen"],
  ["餐厨", "dining-kitchen"],
  ["露台", "terrace-greenery"],
  ["阁楼", "attic"],
  ["玄关", "entrance"],
];

function sceneIdFromRoomName(value: string): FormalSceneId | null {
  const compact = value.replace(/\s+/g, "");
  return roomNameEntries.find(([name]) => compact.includes(name))?.[1] ?? null;
}

export function parsePublishedConnectorLabel(label: string): Pick<ConnectorEdge, "from" | "to"> | null {
  const trimmed = label.trim();
  const reversed = /^反向[·・:：-]?/.test(trimmed);
  const withoutDirectionPrefix = trimmed.replace(/^反向[·・:：-]?\s*/, "");
  const semanticLabel = withoutDirectionPrefix.replace(/[（(][^）)]*[）)]/g, "").trim();
  const parts = semanticLabel.split(/\s*(?:→|->|＞)\s*/);
  if (parts.length !== 2) return null;
  const declaredFrom = sceneIdFromRoomName(parts[0]!);
  const declaredTo = sceneIdFromRoomName(parts[1]!);
  if (!declaredFrom || !declaredTo || declaredFrom === declaredTo) return null;
  return reversed
    ? { from: declaredTo, to: declaredFrom }
    : { from: declaredFrom, to: declaredTo };
}

function connectorEdges(): ConnectorEdge[] {
  return formalRouteGraph.connectorEdges().map((edge) => ({
    sceneId: edge.sceneId,
    from: edge.fromSceneId,
    to: edge.toSceneId,
    routeId: edge.route.id,
    label: edge.route.label,
  }));
}

function interactionRouteScore(
  edge: FormalRouteEdge,
  startPoint: NonNullable<ReturnType<typeof getFormalSceneRoute>>["points"][number],
): number {
  let score = 0;
  if (edge.end.key && startPoint.anchorKey === edge.end.key) score += 8;
  if (edge.end.groupKey && startPoint.anchorGroupKey === edge.end.groupKey) score += 6;
  if (startPoint.anchorKind === "interaction") score += 1;
  return score;
}

/**
 * Resolve what the destination should do after a cross-scene connector.
 *
 * A portal endpoint means “arrive at the room threshold and stop”. It must
 * never inherit the destination scene's generic `away` route. An interaction
 * endpoint means the connector itself selected a stable state (currently the
 * study desk's writing state), so we look for its one-point state route.
 */
export function resolveSceneConnectorTarget(edge: FormalRouteEdge): SceneConnectorTarget | null {
  if (!edge.isSceneConnector) return null;

  if (edge.end.kind === "portal") {
    const targetRouteId = getFormalScenePortalArrivalRouteId(edge.toSceneId, edge.end.key);
    return targetRouteId
      ? { targetRouteId, targetState: "away", strategy: "portal-stay" }
      : null;
  }

  if (edge.end.kind !== "interaction") return null;
  const targetScene = formalEcologySceneManifest.scenes[edge.toSceneId];
  const candidates = Object.values(targetScene.routes)
    .filter((route) => route.waypointIds.length === 1)
    .map((route) => {
      const resolved = getFormalSceneRoute(edge.toSceneId, route.id);
      const startPoint = resolved?.points[0];
      return startPoint && resolved
        ? { route: resolved, startPoint, score: interactionRouteScore(edge, startPoint) }
        : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null && candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.route.id.localeCompare(right.route.id));
  const target = candidates[0];
  if (!target) return null;
  const targetAction = targetScene.actions[target.route.arriveActionId];
  return {
    targetRouteId: target.route.id,
    targetState: targetAction?.activity ?? "away",
    strategy: "interaction-state",
  };
}

function findConnectorPath(from: FormalSceneId, to: FormalSceneId): ConnectorEdge[] | null {
  if (from === to) return [];
  const edges = connectorEdges();
  const queue: Array<{ sceneId: FormalSceneId; path: ConnectorEdge[] }> = [{ sceneId: from, path: [] }];
  const visited = new Set<FormalSceneId>([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges.filter((candidate) => candidate.from === current.sceneId)) {
      const path = [...current.path, edge];
      if (edge.to === to) return path;
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push({ sceneId: edge.to, path });
    }
  }
  return null;
}

function findPreferredConnectorPath(
  from: FormalSceneId,
  to: FormalSceneId,
  preferred: PreferredSceneConnector | undefined,
): ConnectorEdge[] | null {
  if (!preferred) return findConnectorPath(from, to);

  const edge = formalRouteGraph.routeEdge(preferred.sceneId, preferred.routeId);
  if (!edge?.isSceneConnector || edge.toSceneId !== to) return null;

  const leadingPath = findConnectorPath(from, edge.fromSceneId);
  if (!leadingPath) return null;
  return [
    ...leadingPath,
    {
      sceneId: edge.sceneId,
      from: edge.fromSceneId,
      to: edge.toSceneId,
      routeId: edge.route.id,
      label: edge.route.label,
    },
  ];
}
function localLeg(edge: Pick<FormalRouteEdge, "route">, sceneId: FormalSceneId, role: SceneTravelLegRole): SceneTravelLeg {
  return {
    sceneId,
    routeId: edge.route.id,
    label: edge.route.label,
    role,
    fromSceneId: sceneId,
    toSceneId: sceneId,
  };
}

/**
 * A connector can already terminate on the requested interaction's final
 * state. For example, an attic → study connector may end at the study desk's
 * right port while already arriving with the writing scene mounted. In that
 * case appending the one-point state route would replay the writing handoff
 * and produce a visible second twitch.
 *
 * A connector that merely reaches the same interaction group is not enough:
 * the bedroom → study connector intentionally ends as `gone` at the desk
 * port, so it must still be followed by the writing-state handoff.
 */
function routeEndsAtTargetStart(
  sceneId: FormalSceneId,
  leg: SceneTravelLeg,
  targetRoute: NonNullable<ReturnType<typeof getFormalSceneRoute>>,
): boolean {
  // A multi-point route is a real movement/interaction route even when its
  // first anchor shares a physical group with the preceding connector. Only
  // the one-point state handoff is safe to coalesce.
  if (targetRoute.waypointIds.length !== 1) return false;
  const sourceRoute = getFormalSceneRoute(sceneId, leg.routeId);
  const sourceEnd = sourceRoute?.waypointIds.at(-1);
  const targetStart = targetRoute.waypointIds[0];
  if (!sourceRoute || !sourceEnd || !targetStart) return false;
  const sourceArrivalAction = sourceRoute?.arriveActionId
    ? formalEcologySceneManifest.scenes[sceneId].actions[sourceRoute.arriveActionId]
    : undefined;
  const targetArrivalAction = formalEcologySceneManifest.scenes[sceneId].actions[targetRoute.arriveActionId];
  const sourceVisualMode = sourceArrivalAction?.preview && !sourceArrivalAction.preview.transparentOverlay
    ? "scene"
    : sourceArrivalAction?.actorAsset
      ? "actor"
      : "none";
  const targetVisualMode = targetArrivalAction?.preview && !targetArrivalAction.preview.transparentOverlay
    ? "scene"
    : targetArrivalAction?.actorAsset
      ? "actor"
      : "none";
  if (sourceVisualMode !== targetVisualMode || sourceVisualMode === "none") {
    return false;
  }
  if (sourceVisualMode === "actor"
    && sourceArrivalAction?.actorAsset?.src !== targetArrivalAction?.actorAsset?.src) {
    return false;
  }

  const sourceEndPoint = sourceRoute.points.at(-1);
  const targetStartPoint = targetRoute.points[0];
  if (sourceEndPoint?.anchorKey && targetStartPoint?.anchorKey) {
    if (sourceEndPoint.anchorKey === targetStartPoint.anchorKey
      && (sourceEndPoint.anchorPort ?? null) === (targetStartPoint.anchorPort ?? null)) {
      return true;
    }
    return Boolean(
      sourceEndPoint.anchorGroupKey
      && targetStartPoint.anchorGroupKey
      && sourceEndPoint.anchorGroupKey === targetStartPoint.anchorGroupKey,
    );
  }
  return sourceEnd === targetStart
    || formalRouteGraph.findLocalPath(sceneId, sourceEnd, targetStart)?.length === 0;
}

export function buildPublishedSceneJourney(input: {
  fromSceneId: FormalSceneId;
  targetSceneId: FormalSceneId;
  currentPointId: string;
  targetRouteId: string;
  preferredConnector?: PreferredSceneConnector;
}): SceneJourneyPlan | null {
  const targetRoute = getFormalSceneRoute(input.targetSceneId, input.targetRouteId);
  if (!targetRoute) return null;
  if (input.fromSceneId === input.targetSceneId) {
    const targetStart = targetRoute.waypointIds[0];
    if (!targetStart) return null;
    const approachRoutes = formalRouteGraph.findLocalPath(input.targetSceneId, input.currentPointId, targetStart);
    if (!approachRoutes) return null;
    const localEdges = [...approachRoutes];
    return {
      fromSceneId: input.fromSceneId,
      targetSceneId: input.targetSceneId,
      targetRouteId: input.targetRouteId,
      legs: [
        ...localEdges.map((edge) => localLeg(
          edge,
          input.targetSceneId,
          "entry",
        )),
        localLeg(
          { route: targetRoute },
          input.targetSceneId,
          "destination",
        ),
      ],
    };
  }

  const legs: SceneTravelLeg[] = [];
  const sourcePortal = scenePortalPointId(input.fromSceneId);
  if (sourcePortal && input.currentPointId && input.currentPointId !== sourcePortal) {
    const exitRoutes = formalRouteGraph.findLocalPath(input.fromSceneId, input.currentPointId, sourcePortal);
    if (!exitRoutes) return null;
    legs.push(...exitRoutes.map((edge) => localLeg(edge, input.fromSceneId, "exit")));
  }

  const connectors = findPreferredConnectorPath(
    input.fromSceneId,
    input.targetSceneId,
    input.preferredConnector,
  );
  if (!connectors) return null;
  legs.push(...connectors.map((edge) => ({
    sceneId: edge.sceneId,
    routeId: edge.routeId,
    label: edge.label,
    role: "connector" as const,
    fromSceneId: edge.from,
    toSceneId: edge.to,
  })));

  const targetStart = targetRoute.waypointIds[0];
  const targetStartPoint = targetRoute.points[0];
  const targetPortal = targetStartPoint?.anchorKind === "portal"
    ? getFormalScenePortalPointId(input.targetSceneId, targetStartPoint.anchorKey)
    : scenePortalPointId(input.targetSceneId);
  if (targetPortal && targetStart && targetStart !== targetPortal) {
    const entryRoutes = formalRouteGraph.findLocalPath(input.targetSceneId, targetPortal, targetStart);
    if (!entryRoutes) return null;
    legs.push(...entryRoutes.map((edge) => localLeg(edge, input.targetSceneId, "entry")));
  }

  const lastLeg = legs.at(-1);
  const lastLegAlreadyAtTargetStart = Boolean(
    lastLeg
      && lastLeg.sceneId === input.targetSceneId
      && routeEndsAtTargetStart(input.targetSceneId, lastLeg, targetRoute),
  );
  if (!lastLeg || lastLeg.sceneId !== input.targetSceneId || (lastLeg.routeId !== targetRoute.id && !lastLegAlreadyAtTargetStart)) {
    legs.push(localLeg({ route: targetRoute }, input.targetSceneId, "destination"));
  } else {
    // The connector itself owns the arrival transition. Mark it as the
    // destination so the runtime does not schedule a second state handoff.
    lastLeg.role = "destination";
  }

  return {
    fromSceneId: input.fromSceneId,
    targetSceneId: input.targetSceneId,
    targetRouteId: input.targetRouteId,
    legs,
  };
}
