import { describe, expect, it } from "vitest";
import {
  interpolateRoutePhase,
  interpolateRouteVisual,
  shouldHoldAtArrivalHandoff,
  type ActorRouteSample,
} from "./novelist-motion-actor";
import type { NovelistRoutePhase, NovelistRoutePoint } from "./scene-manifest";

const point = (id: string, x: number, y: number): NovelistRoutePoint => ({
  id,
  label: id,
  x,
  y,
  depth: "midground",
  facing: "right",
  stableScale: 1,
});

const phase: NovelistRoutePhase = {
  id: "bent-walk",
  startProgress: 0,
  endProgress: 1,
  actionId: "walking",
  cameraFacing: "right",
  travelDirection: "toward-door",
  actorMode: "walking",
  foregroundOcclusionPolicy: "none",
  pathStartPointId: "start",
  pathEndPointId: "end",
};

describe("phase route interpolation", () => {
  it("walks through every authored waypoint between phase anchors", () => {
    const result: ActorRouteSample = interpolateRoutePhase([
      point("start", 0, 0),
      point("bend", 0.5, 0.8),
      point("end", 1, 0),
    ], phase, 0.5);

    expect(result.pointId).toBe("bend");
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBeCloseTo(0.8);
  });
});

describe("arrival handoff anchoring", () => {
  it("holds the terminal waypoint once arrival smoke owns the handoff", () => {
    expect(shouldHoldAtArrivalHandoff({
      activeTransitionPhase: "arrive",
      activeTransitionPointId: "end",
      finalPointId: "end",
      routeId: "route-a",
      arrivalKey: "route-a:end",
      progress: 0.98,
      triggerProgress: 0.72,
    })).toBe(true);

    expect(shouldHoldAtArrivalHandoff({
      activeTransitionPhase: "arrive",
      activeTransitionPointId: "end",
      finalPointId: "end",
      routeId: "route-a",
      arrivalKey: "route-a:end",
      progress: 0.7,
      triggerProgress: 0.72,
    })).toBe(false);
  });

  it("does not confuse a departure smoke with an arrival lock", () => {
    expect(shouldHoldAtArrivalHandoff({
      activeTransitionPhase: "depart",
      activeTransitionPointId: "start",
      finalPointId: "end",
      routeId: "route-a",
      arrivalKey: "route-a:end",
      progress: 0.98,
      triggerProgress: 0,
    })).toBe(false);
  });

  it("samples the authored terminal scale instead of inventing a reset point", () => {
    const terminal = interpolateRouteVisual([
      point("start", 0, 0),
      { ...point("end", 1, 0), stableScale: 1.24 },
    ], 1);

    expect(terminal).toMatchObject({
      pointId: "end",
      x: 1,
      y: 0,
      stableScale: 1.24,
    });
  });
});
