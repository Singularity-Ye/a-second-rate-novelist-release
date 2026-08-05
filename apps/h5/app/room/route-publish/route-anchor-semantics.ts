/**
 * Stable semantic identities shared by the route editor, publisher and
 * formal-room journey planner. Geometry remains user-authored; these values
 * only describe what a point means.
 */
export const ROUTE_ANCHOR_KINDS = ["portal", "interaction", "waypoint"] as const;

export type RouteAnchorKind = (typeof ROUTE_ANCHOR_KINDS)[number];
export type RouteAnchorSource = "authored" | "legacy-derived";
export type RouteAnchorPort = "left" | "right" | "state";

export type RouteAnchorPointLike = {
  id: string;
  label: string;
  role: string;
  semanticRole?: string;
  anchorKind?: RouteAnchorKind;
  anchorKey?: string;
  anchorGroupKey?: string;
  anchorPort?: RouteAnchorPort;
};

export type RouteAnchorOccurrence = {
  routeKey: string;
  routeLabel: string;
  pointIds: readonly string[];
};

export type ResolvedRouteAnchorSemantics = {
  anchorKind: RouteAnchorKind;
  anchorSource: RouteAnchorSource;
  anchorKey?: string;
  anchorGroupKey?: string;
  anchorPort?: RouteAnchorPort;
};

type RouteEndpointPosition = "start" | "middle" | "end";

const roomNameEntries: ReadonlyArray<[RegExp, string]> = [
  [/书房|study/i, "study"],
  [/卧室|bedroom/i, "bedroom"],
  [/厨房|餐厅|餐厨|kitchen|dining/i, "dining-kitchen"],
  [/露台|terrace/i, "terrace-greenery"],
  [/阁楼|attic/i, "attic"],
  [/玄关|entrance/i, "entrance"],
  [/浴室|bathroom/i, "bathroom-private"],
];

function sceneIdFromRoomName(value: string): string | null {
  const compact = value.replace(/\s+/g, "");
  return roomNameEntries.find(([pattern]) => pattern.test(compact))?.[1] ?? null;
}

function splitRouteDirection(value: string): [string, string] | null {
  const trimmed = value.trim();
  const reversed = /^反向[·・:：-]?/.test(trimmed);
  const withoutPrefix = trimmed.replace(/^反向[·・:：-]?\s*/, "");
  const semanticLabel = withoutPrefix.replace(/[（(][^）)]*[）)]/g, "").trim();
  const parts = semanticLabel.split(/\s*(?:→|->|＞|到|至)\s*/);
  if (parts.length !== 2) return null;
  return reversed ? [parts[1]!, parts[0]!] : [parts[0]!, parts[1]!];
}

/** Parse a cross-scene route label without importing either runtime's scene types. */
export function parseRouteScenePair(label: string): readonly [string, string] | null {
  const direction = splitRouteDirection(label);
  if (!direction) return null;
  const from = sceneIdFromRoomName(direction[0]);
  const to = sceneIdFromRoomName(direction[1]);
  return from && to && from !== to ? [from, to] : null;
}

function routeSideText(routeKey: string, routeLabel: string, position: RouteEndpointPosition): string {
  const side = position === "start" ? 0 : 1;
  const labelDirection = splitRouteDirection(routeLabel);
  const keyDirection = splitRouteDirection(routeKey);
  return labelDirection?.[side] ?? keyDirection?.[side] ?? "";
}

function endpointText(
  point: RouteAnchorPointLike,
  routeKey: string,
  routeLabel: string,
  position: RouteEndpointPosition,
): string {
  const side = routeSideText(routeKey, routeLabel, position).trim();
  // Reused/reversed point ids often contain both endpoints (for example
  // `table-to-entry-node-1`). When the directed route side is available it is
  // the authoritative semantic text; scanning the whole id would classify
  // the source as its destination.
  const value = side
    ? `${side} ${point.role} ${point.semanticRole ?? ""}`
    : `${point.id} ${point.label} ${point.role} ${point.semanticRole ?? ""}`;
  return value
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function authoredSemantics(point: RouteAnchorPointLike): ResolvedRouteAnchorSemantics | null {
  const key = point.anchorKey?.trim();
  if (!point.anchorKind || !ROUTE_ANCHOR_KINDS.includes(point.anchorKind)) return null;
  if (point.anchorKind !== "waypoint" && !key) return null;
  return {
    anchorKind: point.anchorKind,
    anchorSource: "authored",
    ...(key ? { anchorKey: key } : {}),
    ...(point.anchorGroupKey?.trim() ? { anchorGroupKey: point.anchorGroupKey.trim() } : {}),
    ...(point.anchorPort ? { anchorPort: point.anchorPort } : {}),
  };
}

function semanticRole(point: RouteAnchorPointLike): string {
  return point.semanticRole && point.semanticRole !== "waypoint"
    ? point.semanticRole
    : point.role;
}

function portal(sceneId: string): ResolvedRouteAnchorSemantics {
  return { anchorKind: "portal", anchorKey: `portal.${sceneId}`, anchorSource: "legacy-derived" };
}

function portalAt(anchorKey: string): ResolvedRouteAnchorSemantics {
  return { anchorKind: "portal", anchorKey, anchorSource: "legacy-derived" };
}

function interaction(
  anchorKey: string,
  options: { anchorGroupKey?: string; anchorPort?: RouteAnchorPort } = {},
): ResolvedRouteAnchorSemantics {
  return {
    anchorKind: "interaction",
    anchorKey,
    anchorSource: "legacy-derived",
    ...options,
  };
}

function studyDesk(port: RouteAnchorPort): ResolvedRouteAnchorSemantics {
  return interaction(`study.desk.${port}`, { anchorGroupKey: "study.desk", anchorPort: port });
}

const waypointSemantics: ResolvedRouteAnchorSemantics = {
  anchorKind: "waypoint",
  anchorSource: "legacy-derived",
};

/** Resolve one point occurrence. This never changes its coordinates or events. */
export function resolveRouteAnchorSemantics(input: {
  sceneId: string;
  point: RouteAnchorPointLike;
  routeKey: string;
  routeLabel: string;
  position: RouteEndpointPosition;
}): ResolvedRouteAnchorSemantics {
  const explicit = authoredSemantics(input.point);
  if (explicit) return explicit;
  if (input.position === "middle") return waypointSemantics;

  const role = semanticRole(input.point);
  const text = endpointText(input.point, input.routeKey, input.routeLabel, input.position);

  if (input.sceneId === "study") {
    const pair = parseRouteScenePair(input.routeLabel) ?? parseRouteScenePair(input.routeKey);
    if (pair) {
      const endpointScene = pair[input.position === "start" ? 0 : 1]!;
      return endpointScene === "study"
        ? studyDesk(role === "seat-left" || /左侧上椅|left/.test(`${input.routeLabel} ${text}`) ? "left" : "right")
        : portal(endpointScene);
    }
    if (role === "seat-left") return studyDesk("left");
    if (role === "seat-right") return studyDesk("right");
    if (/书桌|座位|desk|seat/.test(text)) {
      return studyDesk(/左侧上椅|left/.test(`${input.routeLabel} ${text}`) ? "left" : "right");
    }
    if (role === "door" || /露台|terrace/.test(text)) return portal("terrace-greenery");
  }

  if (input.sceneId === "bedroom") {
    const bedroomSide = routeSideText(input.routeKey, input.routeLabel, input.position);
    const bedroomSideText = bedroomSide.toLowerCase();
    // Route-owned bedroom endpoints can retain the source point's stale
    // semanticRole after a path is copied. The directed route side is the
    // authoritative physical anchor: the current layout has distinct bed
    // and record-player positions, even though legacy `bed-edge` routes may
    // still use one shared point.
    if (bedroomSideText && /门|入口|出口|door|entry/.test(bedroomSideText)) return portal("bedroom");
    if (bedroomSideText && /床.*唱片|唱片.*床|bed.*record|record.*bed/.test(bedroomSideText)) {
      return interaction("bedroom.bed-record");
    }
    if (bedroomSideText && /唱片|黑胶|record|vinyl/.test(bedroomSideText)) {
      return interaction("bedroom.record");
    }
    if (bedroomSideText && /床|睡|bed|sleep/.test(bedroomSideText)) {
      return interaction("bedroom.bed");
    }
    if (bedroomSideText && /沙发|懒人椅|lounge|sofa/.test(bedroomSideText)) {
      return interaction("bedroom.lounge");
    }
    if (role === "door" || /卧室门|门固定|入口|door|entry/.test(text)) return portal("bedroom");
    if (role === "bed-edge" || /唱片|床|record|bed/.test(text)) return interaction("bedroom.bed-record");
    if (role === "lounge" || /沙发|lounge|sofa/.test(text)) return interaction("bedroom.lounge");
  }

  if (input.sceneId === "dining-kitchen") {
    if (role === "scene-entry" || /门口|生活通道|入口|entry|door/.test(text)) return portal("dining-kitchen");
    if (/料理台|烹饪台|counter|kitchen/.test(text)) return interaction("dining.counter");
    if (/餐桌|饭桌|table|meal/.test(text)) return interaction("dining.table");
  }

  if (input.sceneId === "terrace-greenery") {
    if (role === "scene-entry" || /梯口|入口|entry|stair/.test(text)) return portal("terrace-greenery");
    if (role === "lounge" || /长椅|bench/.test(text)) return interaction("terrace.bench");
    if (/小龟|乌龟|龟池|turtle/.test(text)) return interaction("terrace.turtle-pond");
    if (/盆栽|浇花|plant/.test(text)) return interaction("terrace.plant");
    if (/望远镜|telescope/.test(text)) return interaction("terrace.telescope");
  }

  if (input.sceneId === "attic") {
    if (role === "scene-entry" || /梯口|入口|entry|stair/.test(text)) return portal("attic");
    if (/旧书架|档案|archive|shelf/.test(text)) return interaction("attic.archive-shelf");
    if (/旧稿桌|稿桌|阅读|draft|reading/.test(text)) return interaction("attic.draft-desk");
  }

  if (input.sceneId === "entrance") {
    if (/家门|生活通道|室内|home.?door|entry|door/.test(text)) return portalAt("portal.entrance.home-door");
    if (/楼梯|外出|门槛|outside|stair|exit/.test(text)) return portalAt("portal.entrance.outside");
    if (/信箱|信件|来信|邮件|mailbox|mail|letter/.test(text)) return interaction("entrance.mailbox");
    if (/衣帽|外套|coat|rack/.test(text)) return interaction("entrance.coat-rack");
    if (/雨伞|伞|umbrella/.test(text)) return interaction("entrance.umbrella-rack");
    if (/电梯|elevator/.test(text)) return interaction("entrance.elevator");
    if (/夜景|栏杆|night.?view|railing/.test(text)) return interaction("entrance.night-view");
  }

  if (role === "door" || role === "scene-entry") return portal(input.sceneId);
  return waypointSemantics;
}

/** Resolve one physical point across every route that references it. */
export function resolvePointAnchorSemantics(input: {
  sceneId: string;
  point: RouteAnchorPointLike;
  routes: readonly RouteAnchorOccurrence[];
}): ResolvedRouteAnchorSemantics {
  const explicit = authoredSemantics(input.point);
  if (explicit) return explicit;

  const candidates: ResolvedRouteAnchorSemantics[] = [];
  for (const route of input.routes) {
    const indices = route.pointIds.flatMap((pointId, index) => pointId === input.point.id ? [index] : []);
    for (const index of indices) {
      const position: RouteEndpointPosition = index === 0
        ? "start"
        : index === route.pointIds.length - 1
          ? "end"
          : "middle";
      const resolved = resolveRouteAnchorSemantics({
        sceneId: input.sceneId,
        point: input.point,
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        position,
      });
      if (resolved.anchorKind !== "waypoint" && resolved.anchorKey) candidates.push(resolved);
    }
  }

  return candidates[0] ?? waypointSemantics;
}

export function routeAnchorLabel(kind: RouteAnchorKind): string {
  if (kind === "portal") return "场景互通出入口";
  if (kind === "interaction") return "场景内互动点";
  return "动作层途中点";
}
