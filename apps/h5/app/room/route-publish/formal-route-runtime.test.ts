import { describe, expect, it } from "vitest";

import {
  formalEcologySceneManifest,
  getFormalSceneAction,
  getFormalSceneRoute,
} from "../novelist/scene-manifest";

describe("published route runtime overlay", () => {
  it("exposes all six published scenes to the formal room", () => {
    expect(formalEcologySceneManifest.runtimeSceneIds).toEqual(expect.arrayContaining([
      "study",
      "bedroom",
      "dining-kitchen",
      "entrance",
      "terrace-greenery",
      "attic",
    ]));
    expect(formalEcologySceneManifest.pausedSceneIds).not.toEqual(expect.arrayContaining([
      "entrance",
      "terrace-greenery",
      "attic",
    ]));
  });

  it("uses published geometry and state handoffs for dining", () => {
    const route = getFormalSceneRoute("dining-kitchen", "dining-counter-to-table");
    expect(route?.publishedFromSnapshot).toBe(true);
    expect(route?.points.length).toBeGreaterThan(4);
    expect(route?.phases?.[0]?.actionId).toBe("carry-bowl");
    expect(route?.transitions?.map((transition) => [transition.fromActionId, transition.toActionId])).toEqual([
      ["serve-red-bean-soup", "carry-bowl"],
      ["carry-bowl", "meal-table"],
    ]);
  });

  it("keeps the empty-bowl return asset left-facing in the formal room", () => {
    const route = getFormalSceneRoute("dining-kitchen", "dining-table-to-counter");
    const action = route?.transitions?.[0]?.toActionId
      ? getFormalSceneAction("dining-kitchen", "eating", route.transitions[0].toActionId)
      : null;
    expect(route?.phases?.[0]?.cameraFacing).toBe("left");
    expect(route?.transitions?.[0]?.toFacing).toBe("left");
    expect(action?.actorAsset?.nativeFacing).toBe("left");
    expect(action?.actorAsset?.assetScale).toBe(1.5);
  });

  it("keeps attic transparent state assets fixed to their published facing", () => {
    const route = getFormalSceneRoute("attic", "stair-to-archive");
    const action = route?.arriveActionId
      ? getFormalSceneAction("attic", "daydreaming", route.arriveActionId)
      : null;
    expect(action?.actorAsset?.src).toContain("attic-character-retrieve-archive-transparent-v1.webp");
    expect(action?.actorAsset?.nativeFacing).toBe("right");
    expect(action?.actorMode).toBe("standing");
    expect(action?.cameraFacing).toBe("right");
  });

  it("keeps embedded terrace action cards as local actors instead of full-scene previews", () => {
    const wateringRoute = getFormalSceneRoute("terrace-greenery", "entry-to-telescope");
    const wateringAction = wateringRoute?.arriveActionId
      ? getFormalSceneAction("terrace-greenery", "daydreaming", wateringRoute.arriveActionId)
      : null;
    expect(wateringAction?.preview).toBeUndefined();
    expect(wateringAction?.actorAsset?.width).toBe(208);
    expect(wateringAction?.actorAsset?.height).toBe(330);
    expect(wateringAction?.actorAsset?.alphaBottom).toBe(1);
    expect(wateringAction?.actorMode).toBe("standing");

    const turtleRoute = getFormalSceneRoute("terrace-greenery", "entry-to-turtle-pond");
    const turtleAction = turtleRoute?.arriveActionId
      ? getFormalSceneAction("terrace-greenery", "daydreaming", turtleRoute.arriveActionId)
      : null;
    expect(turtleAction?.preview).toBeUndefined();
    expect(turtleAction?.actorAsset?.width).toBe(177);
    expect(turtleAction?.actorAsset?.height).toBe(272);
    expect(turtleAction?.actorAsset?.alphaBottom).toBe(1);
    expect(turtleAction?.actorMode).toBe("standing");
  });

  it("publishes the terrace night-view state as the independent seated actor asset", () => {
    const nightRoute = getFormalSceneRoute("terrace-greenery", "entry-to-bench");
    const nightAction = nightRoute?.arriveActionId
      ? getFormalSceneAction("terrace-greenery", "daydreaming", nightRoute.arriveActionId)
      : null;
    expect(nightAction?.preview).toBeUndefined();
    expect(nightAction?.actorAsset?.src).toContain("terrace-seated-relaxed-hands-in-pockets-character-asset-cropped-lossless.webp");
    expect(nightAction?.actorAsset?.width).toBe(186);
    expect(nightAction?.actorAsset?.height).toBe(330);
    expect(nightAction?.actorAsset?.alphaBottom).toBe(1);
    expect(nightAction?.actorMode).toBe("standing");
  });

  it("publishes study obstacle layer modes instead of discarding them", () => {
    const route = getFormalSceneRoute("study", "custom-12");
    expect(route?.publishedFromSnapshot).toBe(true);
    expect(route?.phases?.some((phase) => phase.layerModes?.chair === "obstacle-front")).toBe(true);
  });

  it("keeps the formal study directory sourced only from the 3001 snapshot", () => {
    const studyRoutes = formalEcologySceneManifest.scenes.study.routes;
    const publishedRoutes = Object.values(studyRoutes).filter((route) => route.publishedFromSnapshot);

    expect(publishedRoutes).toHaveLength(27);
    expect(studyRoutes["study-writing-to-stand-by-desk"]?.publishedFromSnapshot).not.toBe(true);
    expect(studyRoutes["study-writing-to-terrace-lookout"]?.publishedFromSnapshot).not.toBe(true);
  });

  it("applies the left desk depth contract after the approach turn", () => {
    const route = getFormalSceneRoute("study", "door-to-seat");
    expect(route?.publishedFromSnapshot).toBe(true);
    expect(route?.phases?.[0]?.layerModes).toBeUndefined();
    expect(route?.phases?.[1]?.layerModes).toEqual({
      chair: "obstacle-front",
      "desk-table": "actor-front",
    });
  });

  it("keeps the published writing scene as the final door-to-seat handoff", () => {
    const route = getFormalSceneRoute("study", "door-to-seat");
    const finalTransition = route?.transitions?.find((transition) => transition.pointId === "seat-left");
    const finalAction = finalTransition?.toActionId
      ? getFormalSceneAction("study", "writing", finalTransition.toActionId)
      : null;
    expect(finalTransition?.phase).toBe("arrive");
    expect(finalTransition?.toMode).toBe("scene");
    expect(finalAction?.preview?.src).toBeTruthy();
    expect(route?.arriveActionId).toBe(finalTransition?.toActionId);
  });

  it("does not silently replace an unknown route with the first published route", () => {
    expect(getFormalSceneRoute("study", "route-that-was-not-published")).toBeNull();
  });

  it("does not silently replace an unknown action with another scene state", () => {
    expect(getFormalSceneAction("bedroom", "sleeping", "action-that-was-not-published")).toBeNull();
  });

  it("keeps the seated writing state separate from the study desk route ports", () => {
    const writingState = formalEcologySceneManifest.scenes.study.routePoints.find((point) => point.id === "writing-seat");
    expect(writingState).toMatchObject({
      anchorKind: "interaction",
      anchorKey: "study.desk.state",
      anchorGroupKey: "study.desk",
      anchorPort: "state",
    });
  });

  it("replaces legacy foreground aliases instead of mounting duplicate masks", () => {
    const studyLayers = formalEcologySceneManifest.scenes.study.foregroundLayers ?? [];
    expect(studyLayers.map((layer) => layer.src)).toEqual([
      "/assets/ecology/formal-scenes/study/geometry/foreground/study-desk-table-cutout-2x1-imagegen-v2.webp",
      "/assets/ecology/formal-scenes/study/geometry/foreground/study-chair-cutout-2x1-user-v1.webp",
    ]);
    expect(new Set(studyLayers.map((layer) => layer.src)).size).toBe(studyLayers.length);

    const bedroomLayers = formalEcologySceneManifest.scenes.bedroom.foregroundLayers ?? [];
    expect(bedroomLayers.map((layer) => layer.src)).toEqual([
      "/assets/ecology/formal-scenes/bedroom/geometry/foreground/bedroom-bed-occluder-aligned-v1.webp",
    ]);
  });
});
