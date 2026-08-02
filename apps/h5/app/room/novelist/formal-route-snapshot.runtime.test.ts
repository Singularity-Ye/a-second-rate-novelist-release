import { describe, expect, it } from "vitest";
import { projectPublishedSnapshotOntoFormalRoute } from "./formal-route-snapshot.runtime";
import type { FormalRouteSnapshot } from "../geometry-test/route-publish.contract";
import type { NovelistResolvedRoute } from "./scene-manifest";

function snapshot(): FormalRouteSnapshot {
  return {
    schema: "erliu.formal-route-snapshot",
    version: 1,
    sceneId: "study",
    canvas: { width: 1774, height: 887 },
    scale: { mode: "depth", farY: 400, nearY: 800, farScale: 0.8, nearScale: 1.2 },
    source: { draftVersion: 2, sourceId: "test" },
    points: {
      door: { id: "door", label: "door", role: "door", x: 0.8, y: 0.4, pixel: { x: 1419.2, y: 354.8 }, scale: 0.9, scaleSource: "depth" },
      "out-1": { id: "out-1", label: "out-1", role: "waypoint", x: 0.6, y: 0.7, pixel: { x: 1064.4, y: 620.9 }, scale: 1.1, scaleSource: "depth" },
    },
    routes: {
      "seat-to-door": {
        id: "seat-to-door",
        sourceRouteKey: "seat-to-door",
        label: "seat-to-door",
        kind: "walk",
        accent: "cyan",
        pointIds: ["out-1", "door"],
        startPointId: "out-1",
        endPointId: "door",
        durationMs: 1234,
        initialFacing: "right",
        finalFacing: "right",
        foregroundPolicy: "none",
        transitions: [],
        layerModesAtStart: {},
        layerModesAtEnd: {},
      },
    },
  };
}

describe("formal route snapshot projection", () => {
  it("uses published geometry while retaining the formal route identity", () => {
    const base: NovelistResolvedRoute = {
      id: "study-seat-to-door",
      label: "formal",
      waypointIds: ["editor-out-1", "editor-door"],
      durationMs: 900,
      arriveActionId: "terrace-lookout",
      points: [
        { id: "editor-out-1", label: "out", x: 0.1, y: 0.1, depth: "foreground", facing: "right", stableScale: 1, floorPlaneRef: "study" },
        { id: "editor-door", label: "door", x: 0.2, y: 0.2, depth: "midground", facing: "right", stableScale: 1, floorPlaneRef: "study" },
      ],
    };
    const result = projectPublishedSnapshotOntoFormalRoute("study", base, snapshot());

    expect(result.issues).toHaveLength(0);
    expect(result.route?.id).toBe("study-seat-to-door");
    expect(result.route?.durationMs).toBe(1234);
    expect(result.route?.points[0]).toMatchObject({ x: 0.6, y: 0.7, stableScale: 1.1 });
    expect(result.route?.points[1]).toMatchObject({ x: 0.8, y: 0.4, stableScale: 0.9 });
  });
});
