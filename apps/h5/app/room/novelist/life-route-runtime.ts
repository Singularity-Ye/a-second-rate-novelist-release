import { getFormalSceneRoute, type FormalSceneId } from "./scene-manifest";
import {
  formalLifeActivities,
  type LifeActivityDefinition,
  type LifeActivityId,
  type LifeRouteIntent,
} from "./life-activities";
import {
  buildFormalRouteGraph,
  type FormalRouteEdge,
} from "../route-publish/formal-route-graph";
import type { LifeIntent, LifePropId } from "./life-runtime";

export type LifeRouteContractIssue = {
  activityId: LifeActivityId;
  routeKey: string;
  code: "route-missing" | "route-not-published" | "purpose-mismatch";
  message: string;
};

export type LifeRouteContractResolution = {
  activityId: LifeActivityId;
  sceneId: FormalSceneId;
  routeKey: string;
  intent?: LifeRouteIntent;
  edge: FormalRouteEdge | null;
  ok: boolean;
  issues: readonly LifeRouteContractIssue[];
};

/** Select the semantic contract owned by the activity for a specific route. */
export function getLifeRouteIntentForRoute(
  activity: LifeActivityDefinition,
  routeKey: string,
): LifeRouteIntent | undefined {
  if (activity.routeKey === routeKey) return activity.routeIntent;
  if (activity.continuationRouteKey === routeKey) return activity.continuationRouteIntent;
  return undefined;
}

/** Find the activity that owns a route's semantic contract, including handoff routes. */
export function findLifeActivityForRoute(
  sceneId: FormalSceneId,
  routeKey: string,
): LifeActivityDefinition | null {
  return Object.values(formalLifeActivities).find((activity) => (
    activity.sceneId === sceneId
    && Boolean(getLifeRouteIntentForRoute(activity, routeKey))
  )) ?? null;
}

/**
 * Resolve a life activity's route against the published graph. This is the
 * boundary between “what he wants to do” and “which physical edge can carry
 * him there”. Aliased route IDs are resolved by geometry/signature, never by
 * a human-readable route label.
 */
export function resolveLifeRouteContract(
  activity: LifeActivityDefinition,
  routeKey = activity.routeKey,
): LifeRouteContractResolution {
  const issues: LifeRouteContractIssue[] = [];
  if (!routeKey) {
    return {
      activityId: activity.id,
      sceneId: activity.sceneId,
      routeKey: "",
      edge: null,
      ok: true,
      issues,
    };
  }

  const route = getFormalSceneRoute(activity.sceneId, routeKey);
  const graph = buildFormalRouteGraph();
  const edge = graph.routeEdge(activity.sceneId, routeKey);
  const intent = getLifeRouteIntentForRoute(activity, routeKey);

  if (!route) {
    issues.push({
      activityId: activity.id,
      routeKey,
      code: "route-missing",
      message: `生活活动 ${activity.id} 引用了不存在的正式路线 ${activity.sceneId}/${routeKey}。`,
    });
  } else if (intent && intent.purpose !== "stable-state" && !edge) {
    issues.push({
      activityId: activity.id,
      routeKey,
      code: "route-not-published",
      message: `生活活动 ${activity.id} 的路线 ${activity.sceneId}/${routeKey} 尚未进入已发布路网。`,
    });
  } else if (intent && intent.purpose !== "stable-state" && edge && edge.purpose !== intent.purpose) {
    issues.push({
      activityId: activity.id,
      routeKey,
      code: "purpose-mismatch",
      message: `生活活动 ${activity.id} 期望 ${intent.purpose}，但正式路网将 ${routeKey} 识别为 ${edge.purpose}。`,
    });
  }

  return {
    activityId: activity.id,
    sceneId: activity.sceneId,
    routeKey,
    ...(intent ? { intent } : {}),
    edge,
    ok: issues.length === 0,
    issues,
  };
}

/** Validate every explicitly semantic activity route without mutating runtime data. */
export function validateFormalLifeRouteContracts(): readonly LifeRouteContractIssue[] {
  const issues: LifeRouteContractIssue[] = [];
  for (const activity of Object.values(formalLifeActivities)) {
    const routeKeys = [
      activity.routeIntent ? activity.routeKey : undefined,
      activity.continuationRouteIntent ? activity.continuationRouteKey : undefined,
    ].filter((routeKey): routeKey is string => Boolean(routeKey));
    for (const routeKey of routeKeys) {
      issues.push(...resolveLifeRouteContract(activity, routeKey).issues);
    }
  }
  return issues;
}

/** Copy route meaning into a persisted intent so the reducer never has to guess it later. */
export function lifeIntentRouteFields(
  activity: LifeActivityDefinition | null | undefined,
  routeKey: string | undefined,
): Pick<LifeIntent, "routePurpose" | "requiredProps" | "arrivalPolicy"> {
  if (!activity || !routeKey) return {};
  const intent = getLifeRouteIntentForRoute(activity, routeKey);
  if (!intent) return {};
  return {
    routePurpose: intent.purpose,
    ...(intent.requiredProps ? { requiredProps: intent.requiredProps } : {}),
    arrivalPolicy: intent.arrivalPolicy,
  };
}

export function missingLifeProps(
  carriedProps: readonly LifePropId[],
  requiredProps: readonly LifePropId[] | undefined,
): readonly LifePropId[] {
  if (!requiredProps || requiredProps.length === 0) return [];
  return [...new Set(requiredProps)].filter((prop) => !carriedProps.includes(prop));
}
