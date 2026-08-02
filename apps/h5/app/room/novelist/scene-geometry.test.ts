import { describe, expect, it } from "vitest";

import {
  studySceneGeometry,
  validateCandidatePolyline,
  validateSceneGeometry,
} from "./scene-geometry";

describe("study 2:1 floor and transparent desk depth geometry", () => {
  it("accepts the current study routes when the actor stays on the floor", () => {
    const result = validateSceneGeometry(studySceneGeometry);

    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.checkedRoutes).toBe(6);
    expect(result.checkedWaypoints).toBe(19);
    expect(result.sampledRoutePoints).toBeGreaterThan(400);
  });

  it("keeps the desk alpha range as a depth layer instead of a manual collision polygon", () => {
    expect(studySceneGeometry.obstacles).toEqual([]);
    expect(studySceneGeometry.foregroundOccluders).toEqual([]);
    expect(studySceneGeometry.alphaForeground).toMatchObject({
      source: "/assets/ecology/formal-scenes/study/geometry/foreground/study-desk-table-cutout-2x1-imagegen-v2.webp",
      sourceOfTruth: "transparent-alpha",
      depthPolicy: "route-direction",
      actorMayEnterVisualRange: true,
      opaqueBounds: { minX: 768, minY: 303, maxX: 1204, maxY: 731 },
    });
    expect(studySceneGeometry.layerPolicy.obstacleForegroundOcclusion.source).toContain("chairForegroundRef");
    expect(studySceneGeometry.source?.chairForegroundRef).toContain("study-chair-cutout-2x1-user-v1.webp");
  });

  it("does not turn a visually occluded desk range into a collision block", () => {
    const candidate = validateCandidatePolyline(
      studySceneGeometry,
      "study-main-wood-floor",
      [[603, 745], [1000, 450], [1277, 710]],
    );

    expect(candidate.passed).toBe(true);
  });
});
