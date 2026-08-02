import {
  FORMAL_ROUTE_SNAPSHOT_SCHEMA,
  type FormalRouteSnapshot,
  type FormalRouteSnapshotEvent,
  type FormalRouteSnapshotRoute,
  type RoutePublishIssue,
} from "./contract";
import {
  ROUTE_ANCHOR_KINDS,
  resolveRouteAnchorSemantics,
  type RouteAnchorKind,
} from "./route-anchor-semantics";

const ANCHOR_DRIFT_TOLERANCE_PX = 24;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("file://");
}

function isAssetPath(value: string): boolean {
  return value.startsWith("/assets/") || value.startsWith("assets/") || value.startsWith("./") || value.startsWith("../");
}

function addAssetPathIssue(issues: RoutePublishIssue[], path: string, value: string): void {
  if (isWindowsAbsolutePath(value)) {
    issues.push({
      severity: "error",
      code: "absolute-asset-path",
      path,
      message: "资产路径仍是本机绝对路径，发布快照必须使用项目内相对/站点资产路径。",
    });
    return;
  }
  if (!isAssetPath(value)) {
    issues.push({
      severity: "warning",
      code: "unusual-asset-path",
      path,
      message: "资产路径不是常规 /assets/ 项目路径，请确认交接后仍能被正式版加载。",
    });
  }
}

function validateEvent(
  event: FormalRouteSnapshotEvent,
  routePath: string,
  routePointIds: ReadonlySet<string>,
  issues: RoutePublishIssue[],
): void {
  const path = `${routePath}.events[${event.pointId}]`;
  if (!routePointIds.has(event.pointId)) {
    issues.push({ severity: "error", code: "event-point-missing", path: `${path}.pointId`, message: "事件绑定的点位不属于当前路线。" });
  }
  if (!isFiniteNumber(event.progress) || event.progress < 0 || event.progress > 1) {
    issues.push({ severity: "error", code: "event-progress-invalid", path: `${path}.progress`, message: "事件进度必须位于 0 到 1。" });
  }
  if (event.kind === "facing" && !event.facing) {
    issues.push({ severity: "error", code: "facing-event-without-direction", path, message: "镜像事件必须在发布快照中保存明确目标方向。" });
  }
  if (event.kind === "state" && !event.targetStateId) {
    issues.push({ severity: "warning", code: "state-event-without-target", path, message: "状态事件没有目标状态，正式版无法进行明确状态切换。" });
  }
  if (event.kind === "layer" && !event.layerModes) {
    issues.push({ severity: "error", code: "layer-event-without-modes", path, message: "层级事件没有障碍物层级映射。" });
  }
  for (const [field, value] of [
    ["fromAssetFacing", event.fromAssetFacing],
    ["toAssetFacing", event.toAssetFacing],
  ] as const) {
    if (value !== undefined && value !== "left" && value !== "right") {
      issues.push({ severity: "error", code: "asset-facing-invalid", path: `${path}.${field}`, message: "透明角色资产朝向只能是 left 或 right。" });
    }
  }
  for (const [field, value] of [
    ["fromAssetScale", event.fromAssetScale],
    ["toAssetScale", event.toAssetScale],
  ] as const) {
    if (value !== undefined && (!isFiniteNumber(value) || value < 0.01 || value > 8)) {
      issues.push({ severity: "error", code: "asset-scale-invalid", path: `${path}.${field}`, message: "动作资产倍率必须位于 0.01 到 8.00 之间。" });
    }
  }
  if (!isFiniteNumber(event.animation.turns) || event.animation.turns <= 0) {
    issues.push({ severity: "error", code: "animation-invalid", path: `${path}.animation`, message: "过渡动画圈数必须是正数。" });
  }
  for (const [field, value] of [
    ["fromAssetSource", event.fromAssetSource],
    ["toAssetSource", event.toAssetSource],
  ] as const) {
    if (value) addAssetPathIssue(issues, `${path}.${field}`, value);
  }
}

function validateSceneInteractions(
  snapshot: FormalRouteSnapshot,
  issues: RoutePublishIssue[],
): void {
  const pointsById = new Set(snapshot.points.map((point) => point.id));
  const interactions = snapshot.scene.interactions ?? [];
  const interactionIds = new Set<string>();
  for (const [index, interaction] of interactions.entries()) {
    const path = `scene.interactions[${index}]`;
    if (interactionIds.has(interaction.id)) {
      issues.push({ severity: "error", code: "duplicate-interaction-id", path: `${path}.id`, message: "场景互动组件 ID 不能重复。" });
    }
    interactionIds.add(interaction.id);
    if (!pointsById.has(interaction.anchorPointId)) {
      issues.push({ severity: "error", code: "interaction-anchor-missing", path: `${path}.anchorPointId`, message: "场景互动组件绑定了不存在的锚点。" });
    }
    const assetIds = new Set<string>();
    for (const [assetIndex, asset] of interaction.assets.entries()) {
      const assetPath = `${path}.assets[${assetIndex}]`;
      if (assetIds.has(asset.id)) {
        issues.push({ severity: "error", code: "duplicate-interaction-asset-id", path: `${assetPath}.id`, message: "同一场景互动内的组件资产 ID 不能重复。" });
      }
      assetIds.add(asset.id);
      addAssetPathIssue(issues, `${assetPath}.src`, asset.src);
      if (!isFiniteNumber(asset.scale) || asset.scale <= 0) {
        issues.push({ severity: "error", code: "interaction-asset-scale-invalid", path: `${assetPath}.scale`, message: "场景组件倍率必须为正数。" });
      }
      if (!isFiniteNumber(asset.offset.x) || !isFiniteNumber(asset.offset.y)) {
        issues.push({ severity: "error", code: "interaction-asset-offset-invalid", path: `${assetPath}.offset`, message: "场景组件偏移必须是有限数值。" });
      }
    }
    const stateIds = new Set<string>();
    for (const [stateIndex, state] of interaction.states.entries()) {
      const statePath = `${path}.states[${stateIndex}]`;
      if (stateIds.has(state.id)) {
        issues.push({ severity: "error", code: "duplicate-interaction-state-id", path: `${statePath}.id`, message: "同一场景互动内的状态 ID 不能重复。" });
      }
      stateIds.add(state.id);
      for (const assetId of state.visibleAssetIds) {
        const asset = interaction.assets.find((candidate) => candidate.id === assetId);
        if (!asset) {
          issues.push({ severity: "error", code: "interaction-visible-asset-missing", path: `${statePath}.visibleAssetIds`, message: `状态引用了不存在的组件资产 ${assetId}。` });
        }
      }
      if (state.actorAssetId) {
        const actorAsset = interaction.assets.find((candidate) => candidate.id === state.actorAssetId);
        if (!actorAsset || actorAsset.mode !== "actor") {
          issues.push({ severity: "error", code: "interaction-actor-asset-invalid", path: `${statePath}.actorAssetId`, message: "角色附着资产必须存在且 mode 为 actor。" });
        }
      }
    }
    if (!stateIds.has(interaction.initialStateId)) {
      issues.push({ severity: "error", code: "interaction-initial-state-missing", path: `${path}.initialStateId`, message: "场景互动组件的初始状态不存在。" });
    }
  }
}

function validateInteractionEvents(
  route: FormalRouteSnapshotRoute,
  snapshot: FormalRouteSnapshot,
  issues: RoutePublishIssue[],
): void {
  const interactions = new Map((snapshot.scene.interactions ?? []).map((interaction) => [interaction.id, interaction]));
  const pointIds = new Set(route.waypointIds);
  let previousProgress = -1;
  for (const [index, event] of (route.interactionEvents ?? []).entries()) {
    const path = `routes.${route.id}.interactionEvents[${index}]`;
    if (!pointIds.has(event.pointId)) {
      issues.push({ severity: "error", code: "interaction-event-point-missing", path: `${path}.pointId`, message: "场景互动事件绑定的点位不属于当前路线。" });
    }
    if (!isFiniteNumber(event.progress) || event.progress < 0 || event.progress > 1) {
      issues.push({ severity: "error", code: "interaction-event-progress-invalid", path: `${path}.progress`, message: "场景互动事件进度必须位于 0 到 1。" });
    }
    if (event.progress < previousProgress) {
      issues.push({ severity: "error", code: "interaction-events-not-ordered", path, message: "场景互动事件必须按路径进度递增。" });
    }
    previousProgress = event.progress;
    const interaction = interactions.get(event.interactionId);
    if (!interaction) {
      issues.push({ severity: "error", code: "interaction-event-interaction-missing", path: `${path}.interactionId`, message: "场景互动事件引用了不存在的组件。" });
    } else if (!interaction.states.some((state) => state.id === event.stateId)) {
      issues.push({ severity: "error", code: "interaction-event-state-missing", path: `${path}.stateId`, message: "场景互动事件引用了不存在的组件状态。" });
    }
  }
}

function validateRouteEndpoint(
  snapshot: FormalRouteSnapshot,
  routeId: string,
  route: FormalRouteSnapshot["routes"][string],
  point: FormalRouteSnapshot["points"][number],
  position: "start" | "end",
  issues: RoutePublishIssue[],
): void {
  const path = `routes.${routeId}.${position}PointId`;
  const inferred = resolveRouteAnchorSemantics({
    sceneId: snapshot.scene.sceneId,
    point: {
      id: point.id,
      label: point.label,
      role: point.role,
      ...(point.semanticRole ? { semanticRole: point.semanticRole } : {}),
    },
    routeKey: routeId,
    routeLabel: route.label,
    position,
  });

  if (!point.anchorKind || point.anchorKind === "waypoint" || !point.anchorKey) {
    issues.push({
      severity: "warning",
      code: "route-endpoint-anchor-missing",
      path,
      message: inferred.anchorKey
        ? `路线端点缺少稳定语义锚点；按现有命名可识别为 ${inferred.anchorKey}，请在后续草稿中显式确认。`
        : "路线端点仍被当作普通途中点；正式版无法可靠衔接反向/复用路线。",
    });
    return;
  }

  if (point.anchorSource !== "authored" && inferred.anchorKey && inferred.anchorKey !== point.anchorKey) {
    issues.push({
      severity: "warning",
      code: "route-endpoint-anchor-conflict",
      path,
      message: `同一点位发布为 ${point.anchorKey}，但这条路线端点语义指向 ${inferred.anchorKey}；请拆分点位或显式标注。`,
    });
  }

  const endpointEvent = route.events.find((event) => event.kind === "state" && event.pointId === point.id);
  if (point.anchorKind === "portal") {
    const usesSceneAsset = endpointEvent?.fromAssetMode === "scene"
      || endpointEvent?.toAssetMode === "scene"
      || (position === "end" && route.terminal.assetMode === "scene");
    if (usesSceneAsset) {
      issues.push({
        severity: "warning",
        code: "portal-bound-to-scene-state",
        path,
        message: "场景出入口绑定了整张场景状态图；出入口应只负责不显示与透明移动角色之间的交接。",
      });
    }
  }

  if (point.anchorKind === "interaction" && position === "end") {
    if (route.terminal.hideAfter || endpointEvent?.toAssetMode === "none") {
      issues.push({
        severity: "warning",
        code: "interaction-hidden-at-arrival",
        path,
        message: "场景内互动点抵达后被设为不显示；通常应落到该互动点的角色或场景状态资产。",
      });
    }
  }
}

function validateAnchorDrift(
  snapshot: FormalRouteSnapshot,
  issues: RoutePublishIssue[],
): void {
  const pointsByAnchor = new Map<string, Array<{ point: FormalRouteSnapshot["points"][number]; index: number }>>();
  snapshot.points.forEach((point, index) => {
    if (!point.anchorKey || point.anchorKind === "waypoint") return;
    const group = pointsByAnchor.get(point.anchorKey) ?? [];
    group.push({ point, index });
    pointsByAnchor.set(point.anchorKey, group);
  });

  for (const [anchorKey, group] of pointsByAnchor) {
    if (group.length < 2) continue;
    let furthest: { left: typeof group[number]; right: typeof group[number]; distancePx: number } | null = null;
    for (let leftIndex = 0; leftIndex < group.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]!;
        const right = group[rightIndex]!;
        const distancePx = Math.hypot(
          (left.point.normalized.x - right.point.normalized.x) * snapshot.scene.canvas.width,
          (left.point.normalized.y - right.point.normalized.y) * snapshot.scene.canvas.height,
        );
        if (!furthest || distancePx > furthest.distancePx) furthest = { left, right, distancePx };
      }
    }
    if (!furthest || furthest.distancePx <= ANCHOR_DRIFT_TOLERANCE_PX) continue;
    issues.push({
      severity: "warning",
      code: "anchor-coordinate-drift",
      path: `points[${furthest.left.index}].anchorKey`,
      message: `${anchorKey} 的复用点位相距约 ${Math.round(furthest.distancePx)}px（${furthest.left.point.id} ↔ ${furthest.right.point.id}）；发布不会改坐标，请在编辑器中确认是否应对齐。`,
    });
  }
}

/** Validate the complete editor-to-formal boundary without touching either runtime. */
export function validateFormalRouteSnapshot(snapshot: FormalRouteSnapshot): readonly RoutePublishIssue[] {
  const issues: RoutePublishIssue[] = [];
  if (snapshot.schemaVersion !== FORMAL_ROUTE_SNAPSHOT_SCHEMA) {
    issues.push({ severity: "error", code: "schema-version", path: "schemaVersion", message: "不是当前支持的正式路线快照版本。" });
  }
  if (snapshot.source.sceneId !== snapshot.scene.sceneId) {
    issues.push({ severity: "error", code: "scene-id-mismatch", path: "scene.sceneId", message: "草稿场景与正式场景不一致。" });
  }
  if (snapshot.source.canvas.width !== snapshot.scene.canvas.width || snapshot.source.canvas.height !== snapshot.scene.canvas.height) {
    issues.push({ severity: "error", code: "canvas-mismatch", path: "scene.canvas", message: "坐标源画布与正式场景画布不一致。" });
  }
  if (snapshot.scene.canvas.width <= 0 || snapshot.scene.canvas.height <= 0) {
    issues.push({ severity: "error", code: "canvas-invalid", path: "scene.canvas", message: "场景画布尺寸必须为正数。" });
  }
  addAssetPathIssue(issues, "scene.masterSrc", snapshot.scene.masterSrc);
  for (const [index, layer] of snapshot.scene.foregroundLayers.entries()) {
    addAssetPathIssue(issues, `scene.foregroundLayers[${index}].src`, layer.src);
  }
  validateSceneInteractions(snapshot, issues);

  const pointsById = new Map<string, FormalRouteSnapshot["points"][number]>();
  for (const [index, point] of snapshot.points.entries()) {
    const path = `points[${index}]`;
    if (pointsById.has(point.id)) {
      issues.push({ severity: "error", code: "duplicate-point-id", path: `${path}.id`, message: "正式快照中存在重复点位 ID。" });
    }
    pointsById.set(point.id, point);
    if (!isFiniteNumber(point.pixel[0]) || !isFiniteNumber(point.pixel[1])) {
      issues.push({ severity: "error", code: "pixel-coordinate-invalid", path: `${path}.pixel`, message: "点位像素坐标必须是有限数值。" });
    }
    if (!isFiniteNumber(point.normalized.x) || !isFiniteNumber(point.normalized.y)
      || point.normalized.x < 0 || point.normalized.x > 1
      || point.normalized.y < 0 || point.normalized.y > 1) {
      issues.push({ severity: "error", code: "normalized-coordinate-invalid", path: `${path}.normalized`, message: "点位归一化坐标必须位于 0 到 1。" });
    }
    if (!isFiniteNumber(point.stableScale) || point.stableScale <= 0) {
      issues.push({ severity: "error", code: "stable-scale-invalid", path: `${path}.stableScale`, message: "点位稳定缩放必须为正数。" });
    }
    if (point.anchorKind !== undefined && !ROUTE_ANCHOR_KINDS.includes(point.anchorKind as RouteAnchorKind)) {
      issues.push({ severity: "error", code: "anchor-kind-invalid", path: `${path}.anchorKind`, message: "语义锚点类型只能是 portal、interaction 或 waypoint。" });
    }
    if (point.anchorSource !== undefined && point.anchorSource !== "authored" && point.anchorSource !== "legacy-derived") {
      issues.push({ severity: "error", code: "anchor-source-invalid", path: `${path}.anchorSource`, message: "语义锚点来源无效。" });
    }
    if ((point.anchorKind === "portal" || point.anchorKind === "interaction") && !point.anchorKey?.trim()) {
      issues.push({ severity: "warning", code: "anchor-key-missing", path: `${path}.anchorKey`, message: "出入口/互动点缺少稳定 anchorKey。" });
    }
    if (point.anchorKey && !point.anchorKind) {
      issues.push({ severity: "warning", code: "anchor-kind-missing", path: `${path}.anchorKind`, message: "点位已有 anchorKey，但没有说明它是出入口还是互动点。" });
    }
  }

  validateAnchorDrift(snapshot, issues);

  for (const [routeId, route] of Object.entries(snapshot.routes)) {
    const path = `routes.${routeId}`;
    const routePointIds = new Set(route.waypointIds);
    if (route.id !== routeId) {
      issues.push({ severity: "error", code: "route-id-mismatch", path: `${path}.id`, message: "路线记录键与路线 ID 不一致。" });
    }
    if (route.waypointIds.length === 0) {
      issues.push({ severity: "error", code: "route-without-points", path: `${path}.waypointIds`, message: "路线没有任何点位。" });
    }
    if (route.startPointId !== route.waypointIds[0] || route.endPointId !== route.waypointIds.at(-1)) {
      issues.push({ severity: "error", code: "route-endpoint-mismatch", path, message: "路线起止点没有跟随路线点位数组。" });
    }
    const startPoint = pointsById.get(route.startPointId);
    const endPoint = pointsById.get(route.endPointId);
    if (startPoint) validateRouteEndpoint(snapshot, routeId, route, startPoint, "start", issues);
    if (endPoint) validateRouteEndpoint(snapshot, routeId, route, endPoint, "end", issues);
    for (const pointId of route.waypointIds) {
      if (!pointsById.has(pointId)) {
        issues.push({ severity: "error", code: "route-point-missing", path: `${path}.waypointIds`, message: `路线引用了不存在的点位 ${pointId}。` });
      }
    }
    let previousProgress = -1;
    const seenEvents = new Set<string>();
    for (const [index, event] of route.events.entries()) {
      validateEvent(event, `${path}`, routePointIds, issues);
      if (event.progress < previousProgress) {
        issues.push({ severity: "error", code: "events-not-ordered", path: `${path}.events[${index}]`, message: "路线事件必须按路径进度递增。" });
      }
      previousProgress = event.progress;
      const eventKey = `${event.kind}:${event.pointId}`;
      if (seenEvents.has(eventKey)) {
        issues.push({ severity: "error", code: "duplicate-route-event", path: `${path}.events[${index}]`, message: "同一种事件在同一点位重复配置。" });
      }
      seenEvents.add(eventKey);
    }
    validateInteractionEvents(route, snapshot, issues);
    if (route.terminal.pointId !== route.endPointId) {
      issues.push({ severity: "error", code: "terminal-point-mismatch", path: `${path}.terminal.pointId`, message: "终点状态契约没有绑定路线终点。" });
    }
    if (!isFiniteNumber(route.durationMs) || route.durationMs < 0) {
      issues.push({ severity: "error", code: "duration-invalid", path: `${path}.durationMs`, message: "路线时长必须是非负数。" });
    }
    for (const phase of route.phases) {
      if (phase.startProgress < 0 || phase.endProgress > 1 || phase.startProgress >= phase.endProgress) {
        issues.push({ severity: "error", code: "phase-range-invalid", path: `${path}.phases.${phase.id}`, message: "路线阶段区间必须严格递增并位于 0 到 1。" });
      }
      if (phase.pathStartPointId && !routePointIds.has(phase.pathStartPointId)) {
        issues.push({ severity: "error", code: "phase-start-point-missing", path: `${path}.phases.${phase.id}`, message: "阶段起点不属于当前路线。" });
      }
      if (phase.pathEndPointId && !routePointIds.has(phase.pathEndPointId)) {
        issues.push({ severity: "error", code: "phase-end-point-missing", path: `${path}.phases.${phase.id}`, message: "阶段终点不属于当前路线。" });
      }
    }
    for (const [stateId, assets] of Object.entries(route.assetLibrary?.states ?? {})) {
      for (const [facing, source] of [["left", assets.left], ["right", assets.right]] as const) {
        if (source) addAssetPathIssue(issues, `${path}.assetLibrary.states.${stateId}.${facing}`, source);
      }
    }
    for (const [facing, source] of [["left", route.assetLibrary?.left], ["right", route.assetLibrary?.right]] as const) {
      if (source) addAssetPathIssue(issues, `${path}.assetLibrary.${facing}`, source);
    }
  }

  return issues;
}
