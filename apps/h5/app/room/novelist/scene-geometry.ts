import rawStudyGeometry from "../../../public/assets/ecology/formal-scenes/study/geometry/study-desk-alpha-route-2x1-v1.json";

export type SceneGeometryPoint = readonly [number, number];
export type SceneGeometryPolygon = readonly SceneGeometryPoint[];

export type SceneGeometryFloorPlane = {
  id: string;
  walkable: boolean;
  polygon: SceneGeometryPolygon;
};

export type SceneGeometryObstacle = {
  id: string;
  floorPlaneRef: string;
  polygon: SceneGeometryPolygon;
  clearancePx: number;
};

export type SceneGeometryDepthRule = {
  /** A perspective depth edge. `y` is interpolated at the actor contact x. */
  axis: "y-at-x";
  edge: readonly [SceneGeometryPoint, SceneGeometryPoint];
  actorSide: "above" | "below";
};

export type SceneGeometryForegroundOccluder = {
  id: string;
  floorPlaneRef: string;
  polygon: SceneGeometryPolygon;
  depthRule: SceneGeometryDepthRule;
  sourceObstacleId?: string;
  maskRef?: string;
};

export type SceneGeometryAlphaForeground = {
  id: string;
  source: string;
  sourceOfTruth: "transparent-alpha";
  alphaThreshold: number;
  opaqueBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  depthPolicy: "route-direction";
  actorMayEnterVisualRange: boolean;
};

export type SceneGeometryWaypoint = {
  id: string;
  floorPlaneRef: string;
  contactPoint: SceneGeometryPoint;
  safeZonePolygon: SceneGeometryPolygon;
  actionId?: string;
  targetSceneId?: string;
};

export type SceneGeometryRoute = {
  id: string;
  floorPlaneRef: string;
  waypointIds: readonly string[];
};

export type SceneGeometry = {
  sceneId: string;
  status: string;
  coordinateSpace: string;
  canvas: { width: number; height: number };
  source: {
    sceneMasterRef: string;
    deskForegroundRef: string;
    chairForegroundRef: string;
  };
  actorFootprint: { radiusPx: number };
  layerPolicy: {
    order: readonly string[];
    obstacleForegroundOcclusion: {
      enabled: boolean;
      source: string;
      actorMayEnterOcclusionPolygon: boolean;
    };
    collisionPolicy: string;
  };
  floorPlanes: readonly SceneGeometryFloorPlane[];
  alphaForeground: SceneGeometryAlphaForeground;
  obstacles: readonly SceneGeometryObstacle[];
  foregroundOccluders: readonly SceneGeometryForegroundOccluder[];
  waypoints: readonly SceneGeometryWaypoint[];
  routes: readonly SceneGeometryRoute[];
  qaContract: { sampleStepPx: number };
};

export type SceneGeometryIssue = {
  code:
  | "canvas"
  | "missing-floor-plane"
  | "point-off-floor"
  | "point-in-obstacle"
  | "safe-zone"
  | "route"
  | "obstacle-out-of-bounds"
  | "foreground-occluder-out-of-bounds"
  | "alpha-foreground-out-of-bounds";
  subject: string;
  detail: string;
};

export type SceneGeometryValidation = {
  passed: boolean;
  issues: readonly SceneGeometryIssue[];
  checkedRoutes: number;
  checkedWaypoints: number;
  sampledRoutePoints: number;
};

const EPSILON = 0.0001;

function cross(a: SceneGeometryPoint, b: SceneGeometryPoint, c: SceneGeometryPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: SceneGeometryPoint, start: SceneGeometryPoint, end: SceneGeometryPoint): boolean {
  if (Math.abs(cross(start, end, point)) > EPSILON) return false;
  return (
    point[0] >= Math.min(start[0], end[0]) - EPSILON
    && point[0] <= Math.max(start[0], end[0]) + EPSILON
    && point[1] >= Math.min(start[1], end[1]) - EPSILON
    && point[1] <= Math.max(start[1], end[1]) + EPSILON
  );
}

export function pointInPolygon(point: SceneGeometryPoint, polygon: SceneGeometryPolygon): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  let previous = polygon[polygon.length - 1];
  if (!previous) return false;

  for (const current of polygon) {
    if (pointOnSegment(point, previous, current)) return true;

    const crossesHorizontalRay = (current[1] > point[1]) !== (previous[1] > point[1]);
    if (crossesHorizontalRay) {
      const intersectionX = (
        (previous[0] - current[0]) * (point[1] - current[1])
        / (previous[1] - current[1])
      ) + current[0];
      if (point[0] < intersectionX) inside = !inside;
    }
    previous = current;
  }

  return inside;
}

export function distancePointToSegment(
  point: SceneGeometryPoint,
  start: SceneGeometryPoint,
  end: SceneGeometryPoint,
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);

  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  const projection: SceneGeometryPoint = [start[0] + t * dx, start[1] + t * dy];
  return Math.hypot(point[0] - projection[0], point[1] - projection[1]);
}

export function distancePointToPolygon(point: SceneGeometryPoint, polygon: SceneGeometryPolygon): number {
  if (polygon.length < 2) return Number.POSITIVE_INFINITY;
  let distance = Number.POSITIVE_INFINITY;
  let previous = polygon[polygon.length - 1];
  if (!previous) return distance;

  for (const current of polygon) {
    distance = Math.min(distance, distancePointToSegment(point, previous, current));
    previous = current;
  }
  return distance;
}

export function pointBlockedByObstacle(
  point: SceneGeometryPoint,
  obstacle: SceneGeometryObstacle,
): boolean {
  return pointInPolygon(point, obstacle.polygon)
    || distancePointToPolygon(point, obstacle.polygon) <= obstacle.clearancePx;
}

/**
 * Rendering depth is separate from collision. A character may be on the
 * floor behind a desk and therefore be partly covered by the desk, while a
 * character on the near side must remain in front of that same desk.
 */
export function foregroundOccluderAppliesAtPoint(
  point: SceneGeometryPoint,
  occluder: SceneGeometryForegroundOccluder,
): boolean {
  const [start, end] = occluder.depthRule.edge;
  if (occluder.depthRule.axis !== "y-at-x" || start[0] === end[0]) return false;

  const minX = Math.min(start[0], end[0]);
  const maxX = Math.max(start[0], end[0]);
  if (point[0] < minX || point[0] > maxX) return false;

  const progress = (point[0] - start[0]) / (end[0] - start[0]);
  const edgeY = start[1] + (end[1] - start[1]) * progress;
  const actorIsAboveEdge = point[1] < edgeY;
  return occluder.depthRule.actorSide === "above"
    ? actorIsAboveEdge
    : !actorIsAboveEdge;
}

export function activeForegroundOccludersAtPoint(
  geometry: SceneGeometry,
  point: SceneGeometryPoint,
  floorPlaneRef: string,
): readonly SceneGeometryForegroundOccluder[] {
  return geometry.foregroundOccluders.filter((occluder) => (
    occluder.floorPlaneRef === floorPlaneRef
      && foregroundOccluderAppliesAtPoint(point, occluder)
  ));
}

function getFloorPlane(geometry: SceneGeometry, floorPlaneRef: string): SceneGeometryFloorPlane | undefined {
  return geometry.floorPlanes.find((floorPlane) => floorPlane.id === floorPlaneRef);
}

function getWaypoint(geometry: SceneGeometry, waypointId: string): SceneGeometryWaypoint | undefined {
  return geometry.waypoints.find((waypoint) => waypoint.id === waypointId);
}

function pointOnDeclaredFloor(
  geometry: SceneGeometry,
  point: SceneGeometryPoint,
  floorPlaneRef: string,
): boolean {
  const floorPlane = getFloorPlane(geometry, floorPlaneRef);
  return Boolean(floorPlane?.walkable && pointInPolygon(point, floorPlane.polygon));
}

function pointBlockedOnFloor(
  geometry: SceneGeometry,
  point: SceneGeometryPoint,
  floorPlaneRef: string,
): SceneGeometryObstacle | undefined {
  return geometry.obstacles.find((obstacle) => (
    obstacle.floorPlaneRef === floorPlaneRef && pointBlockedByObstacle(point, obstacle)
  ));
}

function sampleSegment(
  start: SceneGeometryPoint,
  end: SceneGeometryPoint,
  stepPx: number,
): SceneGeometryPoint[] {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const steps = Math.max(1, Math.ceil(length / Math.max(1, stepPx)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    return [
      start[0] + (end[0] - start[0]) * progress,
      start[1] + (end[1] - start[1]) * progress,
    ] as const;
  });
}

export function validateSceneGeometry(geometry: SceneGeometry): SceneGeometryValidation {
  const issues: SceneGeometryIssue[] = [];
  let sampledRoutePoints = 0;

  if (geometry.canvas.width !== 1774 || geometry.canvas.height !== 887) {
    issues.push({
      code: "canvas",
      subject: geometry.sceneId,
      detail: "Formal scene geometry must use the 1774x887 2:1 canvas.",
    });
  }

  const inCanvas = (point: SceneGeometryPoint) => (
    point[0] >= 0 && point[0] <= geometry.canvas.width
    && point[1] >= 0 && point[1] <= geometry.canvas.height
  );

  for (const obstacle of geometry.obstacles) {
    if (obstacle.polygon.some((point) => !inCanvas(point))) {
      issues.push({
        code: "obstacle-out-of-bounds",
        subject: obstacle.id,
        detail: "Obstacle polygon leaves the scene canvas.",
      });
    }
  }

  for (const occluder of geometry.foregroundOccluders) {
    const edgePoints = occluder.depthRule.edge;
    if (
      occluder.polygon.some((point) => !inCanvas(point))
      || edgePoints.some((point) => !inCanvas(point))
    ) {
      issues.push({
        code: "foreground-occluder-out-of-bounds",
        subject: occluder.id,
        detail: "Foreground occluder polygon or depth edge leaves the scene canvas.",
      });
    }
  }

  const alphaBounds = geometry.alphaForeground.opaqueBounds;
  if (
    !inCanvas([alphaBounds.minX, alphaBounds.minY])
    || !inCanvas([alphaBounds.maxX, alphaBounds.maxY])
    || alphaBounds.minX > alphaBounds.maxX
    || alphaBounds.minY > alphaBounds.maxY
  ) {
    issues.push({
      code: "alpha-foreground-out-of-bounds",
      subject: geometry.alphaForeground.id,
      detail: "The transparent foreground alpha bounds leave the scene canvas or are inverted.",
    });
  }

  for (const waypoint of geometry.waypoints) {
    const floorPlane = getFloorPlane(geometry, waypoint.floorPlaneRef);
    if (!floorPlane) {
      issues.push({
        code: "missing-floor-plane",
        subject: waypoint.id,
        detail: `Unknown floor plane: ${waypoint.floorPlaneRef}`,
      });
      continue;
    }

    if (!pointOnDeclaredFloor(geometry, waypoint.contactPoint, waypoint.floorPlaneRef)) {
      issues.push({
        code: "point-off-floor",
        subject: waypoint.id,
        detail: "Waypoint contact point is outside its declared walkable floor plane.",
      });
    }
    if (!pointInPolygon(waypoint.contactPoint, waypoint.safeZonePolygon)) {
      issues.push({
        code: "safe-zone",
        subject: waypoint.id,
        detail: "Waypoint contact point is outside its safe-zone polygon.",
      });
    }
    const blockingObstacle = pointBlockedOnFloor(geometry, waypoint.contactPoint, waypoint.floorPlaneRef);
    if (blockingObstacle) {
      issues.push({
        code: "point-in-obstacle",
        subject: waypoint.id,
        detail: `Waypoint is inside the clearance of obstacle ${blockingObstacle.id}.`,
      });
    }
  }

  for (const route of geometry.routes) {
    const waypoints = route.waypointIds.map((waypointId) => getWaypoint(geometry, waypointId));
    if (waypoints.some((waypoint) => !waypoint)) {
      issues.push({
        code: "route",
        subject: route.id,
        detail: "Route references an unknown waypoint.",
      });
      continue;
    }

    const resolvedWaypoints = waypoints as SceneGeometryWaypoint[];
    for (let index = 0; index < resolvedWaypoints.length; index += 1) {
      const waypoint = resolvedWaypoints[index];
      if (!waypoint) continue;
      if (waypoint.floorPlaneRef !== route.floorPlaneRef) {
        issues.push({
          code: "route",
          subject: route.id,
          detail: `Waypoint ${waypoint.id} is on ${waypoint.floorPlaneRef}, not ${route.floorPlaneRef}.`,
        });
      }

      const nextWaypoint = resolvedWaypoints[index + 1];
      const samples = nextWaypoint
        ? sampleSegment(waypoint.contactPoint, nextWaypoint.contactPoint, geometry.qaContract.sampleStepPx)
        : [waypoint.contactPoint];
      sampledRoutePoints += samples.length;

      for (const sample of samples) {
        if (!pointOnDeclaredFloor(geometry, sample, route.floorPlaneRef)) {
          issues.push({
            code: "route",
            subject: route.id,
            detail: `Route leaves floor at (${Math.round(sample[0])}, ${Math.round(sample[1])}).`,
          });
          break;
        }
        const blockingObstacle = pointBlockedOnFloor(geometry, sample, route.floorPlaneRef);
        if (blockingObstacle) {
          issues.push({
            code: "route",
            subject: route.id,
            detail: `Route enters ${blockingObstacle.id} near (${Math.round(sample[0])}, ${Math.round(sample[1])}).`,
          });
          break;
        }
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    checkedRoutes: geometry.routes.length,
    checkedWaypoints: geometry.waypoints.length,
    sampledRoutePoints,
  };
}

export function validateCandidatePolyline(
  geometry: SceneGeometry,
  floorPlaneRef: string,
  polyline: readonly SceneGeometryPoint[],
): SceneGeometryValidation {
  const candidate: SceneGeometry = {
    ...geometry,
    waypoints: polyline.map((contactPoint, index) => ({
      id: `candidate-${index}`,
      floorPlaneRef,
      contactPoint,
      safeZonePolygon: [
        [contactPoint[0] - 1, contactPoint[1] - 1],
        [contactPoint[0] + 1, contactPoint[1] - 1],
        [contactPoint[0] + 1, contactPoint[1] + 1],
        [contactPoint[0] - 1, contactPoint[1] + 1],
      ],
    })),
    routes: [{
      id: "candidate-polyline",
      floorPlaneRef,
      waypointIds: polyline.map((_, index) => `candidate-${index}`),
    }],
  };
  return validateSceneGeometry(candidate);
}

export const studySceneGeometry = rawStudyGeometry as unknown as SceneGeometry;
