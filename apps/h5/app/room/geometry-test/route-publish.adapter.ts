/** @deprecated Historical prototype adapter. Do not connect this to 3000 or the publish API. */
import {
  clamp,
  editorRouteMeta,
  editorRouteTransitions,
  getEditorSceneProfile,
  normalizeEditorDraft,
  pointScale,
  routeFacingAtProgress,
  routeLayerModesAtProgress,
  routePlaybackDurationMs,
  routeProgressAtPoint,
  type EditorDraft,
  type EditorPoint,
} from "./route-editor.model";
import type {
  FormalRouteSnapshot,
  FormalRouteSnapshotPoint,
  FormalRouteSnapshotRoute,
  FormalRouteSnapshotTransition,
  RoutePublishIssue,
  RoutePublishResult,
} from "./route-publish.contract";
import {
  FORMAL_ROUTE_SNAPSHOT_SCHEMA,
  FORMAL_ROUTE_SNAPSHOT_VERSION,
} from "./route-publish.contract";

export type AdaptEditorDraftOptions = {
  /** Optional identity of the selected draft; never inferred from route count. */
  sourceId?: string;
  /** Optional content hash supplied by the caller that selected the draft. */
  sourceHash?: string;
  /** The editor's current default playback multiplier. */
  playbackSpeed?: number;
};

function issue(
  severity: RoutePublishIssue["severity"],
  code: string,
  path: string,
  message: string,
): RoutePublishIssue {
  return { severity, code, path, message };
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function snapshotPoint(
  point: EditorPoint,
  canvas: { width: number; height: number },
  scaleSettings: EditorDraft["scale"],
): FormalRouteSnapshotPoint {
  const scale = pointScale(point, scaleSettings);
  return {
    id: point.id,
    label: point.label,
    role: point.role,
    ...(point.semanticRole ? { semanticRole: point.semanticRole } : {}),
    x: point.point[0] / canvas.width,
    y: point.point[1] / canvas.height,
    pixel: { x: point.point[0], y: point.point[1] },
    scale,
    scaleSource: typeof point.scaleOverride === "number"
      ? "override"
      : scaleSettings.mode === "depth"
        ? "depth"
        : "manual-default",
  };
}

function snapshotTransition(
  transition: Parameters<typeof editorRouteTransitions>[2] extends never ? never : ReturnType<typeof editorRouteTransitions>[number],
  progress: number,
): FormalRouteSnapshotTransition {
  return {
    ...transition,
    progress: clamp(progress, 0, 1),
    animation: { ...transition.animation },
    ...(transition.layerModes ? { layerModes: { ...transition.layerModes } } : {}),
  };
}

function validatePoint(
  point: EditorPoint,
  canvas: { width: number; height: number },
  path: string,
): RoutePublishIssue[] {
  const [x, y] = point.point;
  const issues: RoutePublishIssue[] = [];
  if (!finite(x) || !finite(y)) {
    issues.push(issue("error", "non-finite-point", path, "点位坐标必须是有限数字。"));
  }
  if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
    issues.push(issue("warning", "point-outside-canvas", path, "点位位于母图画布之外，正式版仍会保留但需要人工确认。"));
  }
  return issues;
}

/**
 * Convert one selected editor draft into a deterministic formal publish
 * snapshot. The input is never mutated and no browser storage is touched.
 */
export function adaptEditorDraftToFormalSnapshot(
  input: EditorDraft,
  options: AdaptEditorDraftOptions = {},
): RoutePublishResult {
  const issues: RoutePublishIssue[] = [];
  const normalized = normalizeEditorDraft(input);
  if (!normalized) {
    return {
      snapshot: null,
      issues: [issue("error", "invalid-editor-draft", "$", "编辑器草稿无法通过基础结构校验。")],
      ok: false,
    };
  }

  const profile = getEditorSceneProfile(normalized.sceneId);
  const canvas = normalized.canvas ?? profile.canvas;
  if (!(canvas.width > 0 && canvas.height > 0)) {
    issues.push(issue("error", "invalid-canvas", "canvas", "画布宽高必须为正数。"));
  }

  const points: Record<string, FormalRouteSnapshotPoint> = {};
  for (const [pointId, point] of Object.entries(normalized.pointsById)) {
    issues.push(...validatePoint(point, canvas, `points.${pointId}`));
    points[pointId] = snapshotPoint(point, canvas, normalized.scale);
  }

  const routes: Record<string, FormalRouteSnapshotRoute> = {};
  const playbackSpeed = options.playbackSpeed ?? 2;
  for (const [routeKey, pointIds] of Object.entries(normalized.routes)) {
    const meta = editorRouteMeta(normalized, routeKey);
    const routeIssuesPath = `routes.${routeKey}`;
    const missingPointIds = pointIds.filter((pointId) => !points[pointId]);
    if (pointIds.length === 0) {
      issues.push(issue("error", "empty-route", routeIssuesPath, "路线至少需要一个点位。"));
    }
    if (missingPointIds.length > 0) {
      issues.push(issue("error", "missing-route-point", routeIssuesPath, `路线引用了不存在的点位：${missingPointIds.join(", ")}`));
    }

    const transitions = editorRouteTransitions(pointIds, normalized.pointsById, meta)
      .map((transition) => {
        const transitionProgress = routeProgressAtPoint(pointIds, normalized.pointsById, transition.pointId);
        if (!pointIds.includes(transition.pointId)) {
          issues.push(issue("error", "transition-outside-route", `${routeIssuesPath}.transitions`, `转场点位 ${transition.pointId} 不属于当前路线。`));
        }
        return snapshotTransition(transition, transitionProgress);
      });
    const route = {
      id: routeKey,
      sourceRouteKey: routeKey,
      label: meta.label,
      kind: meta.kind,
      accent: meta.accent,
      pointIds: [...pointIds],
      startPointId: pointIds[0] ?? null,
      endPointId: pointIds.at(-1) ?? null,
      durationMs: routePlaybackDurationMs(pointIds, normalized.pointsById, playbackSpeed),
      initialFacing: routeFacingAtProgress(pointIds, normalized.pointsById, meta, 0),
      finalFacing: routeFacingAtProgress(pointIds, normalized.pointsById, meta, 1),
      foregroundPolicy: meta.foregroundPolicy ?? "none",
      transitions,
      layerModesAtStart: { ...routeLayerModesAtProgress(pointIds, normalized.pointsById, meta, 0) },
      layerModesAtEnd: { ...routeLayerModesAtProgress(pointIds, normalized.pointsById, meta, 1) },
      ...(meta.assetLibrary ? { assetLibrary: meta.assetLibrary } : {}),
    } satisfies FormalRouteSnapshotRoute;
    routes[routeKey] = route;
  }

  const snapshot: FormalRouteSnapshot = {
    schema: FORMAL_ROUTE_SNAPSHOT_SCHEMA,
    version: FORMAL_ROUTE_SNAPSHOT_VERSION,
    sceneId: normalized.sceneId,
    canvas: { ...canvas },
    scale: { ...normalized.scale },
    source: {
      draftVersion: input.version,
      ...(options.sourceId ? { sourceId: options.sourceId } : {}),
      ...(options.sourceHash ? { sourceHash: options.sourceHash } : {}),
    },
    points,
    routes,
  };

  const ok = issues.every((entry) => entry.severity !== "error");
  return { snapshot: ok ? snapshot : null, issues, ok };
}
