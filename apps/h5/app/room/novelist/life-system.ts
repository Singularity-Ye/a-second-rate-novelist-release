import { getFormalSceneRoute, type FormalSceneId, type NovelistResolvedRoute } from "./scene-manifest";
import { getLifeActivity, resolveLifeActivity, type LifeActivityDefinition } from "./life-activities";
import {
  getDominantLifeSignal,
  getLifeSignals,
  getStateDrivenLifeTendency,
  type LifeSignal,
  type LifeSignalContext,
  type LifeTendency,
  type LifeTendencyContext,
} from "./life-rhythm";
import {
  findLifeActivityForRoute,
  lifeIntentRouteFields,
  missingLifeProps,
  resolveLifeRouteContract,
  type LifeRouteContractResolution,
} from "./life-route-runtime";
import type { HostLifeState, LifePropId, LifeRuntimePhase } from "./life-runtime";

export const LIFE_SYSTEM_SCHEMA = "novelist-life-system.v1" as const;

export type LifeSystemInput = {
  sceneId: FormalSceneId;
  routeId?: string;
  actionId?: string;
  activityId?: string;
  host: Pick<HostLifeState, "hunger" | "fatigue" | "focus" | "inspiration" | "emotionalLoad">;
  traceIds?: readonly string[];
  runtimePhase?: LifeRuntimePhase;
  carriedProps?: readonly LifePropId[];
};

export type LifeSystemRouteInput = {
  sceneId: FormalSceneId;
  routeId: string;
  actionId?: string;
  activityId?: string;
  carriedProps?: readonly LifePropId[];
};

/**
 * The route decision boundary used by both the room and the life projection.
 * It resolves the physical published route, semantic owner, arrival activity,
 * required props, and contract in one place so the UI never assembles a
 * partially valid intent by hand.
 */
export type LifeSystemRouteResolution = {
  route: NovelistResolvedRoute | null;
  targetActivity: LifeActivityDefinition | null;
  routeOwnerActivity: LifeActivityDefinition | null;
  routeFields: ReturnType<typeof lifeIntentRouteFields>;
  routeContract: LifeRouteContractResolution | null;
  missingProps: readonly LifePropId[];
  ok: boolean;
};

/**
 * The system layer is a read-only projection.  The reducer remains the sole
 * owner of mutable life state; this boundary combines it with the published
 * route, activity contract, needs, and next tendency for the room UI.
 */
export type LifeSystemProjection = {
  schema: typeof LIFE_SYSTEM_SCHEMA;
  sceneId: FormalSceneId;
  routeId?: string;
  route: NovelistResolvedRoute | null;
  activity: LifeActivityDefinition | null;
  routeContract: LifeRouteContractResolution | null;
  signals: readonly LifeSignal[];
  dominantSignal: LifeSignal;
  urgentTendency: LifeTendency | null;
  visibleTendency: LifeTendency | null;
};

export function resolveLifeSystemRoute(input: LifeSystemRouteInput): LifeSystemRouteResolution {
  const route = getFormalSceneRoute(input.sceneId, input.routeId);
  const targetActivity = resolveLifeActivity(input.sceneId, input.actionId)
    ?? getLifeActivity(input.activityId);
  const routeOwnerActivity = findLifeActivityForRoute(input.sceneId, input.routeId) ?? targetActivity;
  const routeFields = lifeIntentRouteFields(routeOwnerActivity, input.routeId);
  const routeContract = routeOwnerActivity
    ? resolveLifeRouteContract(routeOwnerActivity, input.routeId)
    : null;
  const missingProps = missingLifeProps(input.carriedProps ?? [], routeFields.requiredProps);

  return {
    route,
    targetActivity,
    routeOwnerActivity,
    routeFields,
    routeContract,
    missingProps,
    ok: Boolean(route) && (!routeContract || routeContract.ok) && missingProps.length === 0,
  };
}

export function projectLifeSystem(input: LifeSystemInput): LifeSystemProjection {
  const signalContext: LifeSignalContext = {
    ...input.host,
    ...(input.traceIds ? { traceIds: input.traceIds } : {}),
    ...(input.actionId ? { actionId: input.actionId } : {}),
  };
  const tendencyContext: LifeTendencyContext = {
    ...signalContext,
    currentScene: input.sceneId,
    ...(input.actionId ? { currentActionId: input.actionId } : {}),
    ...(input.activityId ? { currentActivityId: input.activityId } : {}),
    ...(input.runtimePhase ? { runtimePhase: input.runtimePhase } : {}),
    ...(input.carriedProps ? { carriedProps: input.carriedProps } : {}),
  };
  const routeResolution = input.routeId
    ? resolveLifeSystemRoute({
      sceneId: input.sceneId,
      routeId: input.routeId,
      ...(input.actionId ? { actionId: input.actionId } : {}),
      ...(input.activityId ? { activityId: input.activityId } : {}),
      ...(input.carriedProps ? { carriedProps: input.carriedProps } : {}),
    })
    : null;
  const route = routeResolution?.route ?? null;
  const activity = routeResolution?.targetActivity
    ?? resolveLifeActivity(input.sceneId, input.actionId)
    ?? getLifeActivity(input.activityId);
  const routeContract = routeResolution?.routeContract ?? null;
  const signals = getLifeSignals(signalContext);

  return {
    schema: LIFE_SYSTEM_SCHEMA,
    sceneId: input.sceneId,
    ...(input.routeId ? { routeId: input.routeId } : {}),
    route,
    activity,
    routeContract,
    signals,
    dominantSignal: getDominantLifeSignal(signalContext),
    urgentTendency: getStateDrivenLifeTendency(tendencyContext, "urgent"),
    visibleTendency: getStateDrivenLifeTendency(tendencyContext, "notice"),
  };
}
