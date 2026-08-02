import { describe, expect, it } from "vitest";

import diningKitchenSource from "./sources/dining-kitchen.route-editor.json";
import studySource from "./sources/study.route-editor.json";
import terraceSource from "./sources/terrace-greenery.route-editor.json";

import {
  createInitialEditorDraft,
  DEFAULT_EDITOR_TRANSITION_ANIMATION,
  deserializeEditorDraft,
} from "../geometry-test/route-editor.model";
import { buildFormalRouteSnapshot, publishEditorDraft } from "./route-draft.adapter";
import { validateFormalRouteSnapshot } from "./route-parity-validator";
import { resolveRouteAnchorSemantics } from "./route-anchor-semantics";

describe("editor route publish boundary", () => {
  it("converts an editor draft into a deterministic formal snapshot without mutating it", () => {
    const draft = createInitialEditorDraft("terrace-greenery");
    const before = JSON.stringify(draft);
    const snapshot = buildFormalRouteSnapshot(draft, {
      publishedAt: "2026-07-27T12:00:00.000Z",
    });

    expect(JSON.stringify(draft)).toBe(before);
    expect(snapshot.schemaVersion).toBe("formal-route-snapshot.v1");
    expect(snapshot.source.sceneId).toBe("terrace-greenery");
    expect(snapshot.source.canvas).toEqual({ width: 1774, height: 887 });
    expect(snapshot.scene.masterSrc).toContain("terrace-greenery-scene-master-paper-diorama-formal-v4-lossless.webp");
    expect(Object.keys(snapshot.routes)).toEqual(Object.keys(draft.routes));
    expect(snapshot.points.every((point) => point.normalized.x >= 0 && point.normalized.x <= 1)).toBe(true);
    expect(snapshot.points.every((point) => point.normalized.y >= 0 && point.normalized.y <= 1)).toBe(true);
  });

  it("preserves explicit mirror events and validates their route-local point IDs", () => {
    const baseDraft = createInitialEditorDraft("terrace-greenery");
    const routeKey = Object.keys(baseDraft.routes)[0]!;
    const routeIds = baseDraft.routes[routeKey]!;
    const mirrorPointId = routeIds[Math.min(2, routeIds.length - 1)]!;
    const baseMeta = baseDraft.routeMeta?.[routeKey]!;
    const draft = {
      ...baseDraft,
      routeMeta: {
        ...baseDraft.routeMeta!,
        [routeKey]: {
          ...baseMeta,
          transitions: [{
            pointId: mirrorPointId,
            kind: "facing" as const,
            facing: "left" as const,
            animation: { ...DEFAULT_EDITOR_TRANSITION_ANIMATION },
          }],
        },
      },
    };
    const snapshot = buildFormalRouteSnapshot(draft, {
      publishedAt: "2026-07-27T12:00:00.000Z",
    });
    const routeWithFacingEvent = Object.values(snapshot.routes).find((route) => (
      route.events.some((event) => event.kind === "facing")
    ));

    expect(routeWithFacingEvent).toBeDefined();
    expect(routeWithFacingEvent?.events.filter((event) => event.kind === "facing").every((event) => Boolean(event.facing))).toBe(true);
    expect(validateFormalRouteSnapshot(snapshot).some((issue) => issue.severity === "error")).toBe(false);
  });

  it("returns a blocking issue instead of allowing a machine-local asset path", () => {
    const snapshot = buildFormalRouteSnapshot(createInitialEditorDraft("study"), {
      publishedAt: "2026-07-27T12:00:00.000Z",
    });
    const broken = {
      ...snapshot,
      scene: { ...snapshot.scene, masterSrc: "D:\\\\work\\\\scene.webp" },
    };
    const issues = validateFormalRouteSnapshot(broken);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "absolute-asset-path", severity: "error" }),
    ]));
  });

  it("exposes a publish result but never writes a localStorage key", () => {
    const result = publishEditorDraft(createInitialEditorDraft("attic"), {
      publishedAt: "2026-07-27T12:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.source.sceneId).toBe("attic");
  });

  it("does not carry legacy attic asset sizing across the 3001 to 3000 boundary", () => {
    const base = createInitialEditorDraft("attic");
    const routeKey = "stair-to-archive";
    const routeMeta = base.routeMeta?.[routeKey]!;
    const draft = {
      ...base,
      routeMeta: {
        ...base.routeMeta,
        [routeKey]: {
          ...routeMeta,
          assetLibrary: {
            ...routeMeta.assetLibrary,
            states: {
              ...(routeMeta.assetLibrary?.states ?? {}),
              "legacy-attic-state": {
                left: "/assets/ecology/formal-scenes/attic/candidates/attic-character-reading-transparent-v1.webp",
                scale: 2.79,
                alphaBottom: 0.4,
              },
            },
          },
        },
      },
    };
    const snapshot = buildFormalRouteSnapshot(draft, { publishedAt: "2026-07-27T12:00:00.000Z" });
    const publishedState = snapshot.routes[routeKey]?.assetLibrary?.states?.["legacy-attic-state"];

    expect(publishedState).toEqual({
      left: "/assets/ecology/formal-scenes/attic/candidates/attic-character-reading-transparent-v1.webp",
    });
  });

  it("publishes explicit actor asset facing without changing route travel facing", () => {
    const snapshot = buildFormalRouteSnapshot(createInitialEditorDraft("attic"), {
      publishedAt: "2026-07-27T12:00:00.000Z",
    });
    const forward = snapshot.routes["stair-to-archive"]!;
    const arrival = forward.events.find((event) => event.targetStateId === "attic-retrieve-archive");
    const reverse = snapshot.routes["archive-to-stair"]!;
    const departure = reverse.events.find((event) => event.fromAssetSource?.includes("attic-character-retrieve-archive"));

    expect(arrival?.toAssetFacing).toBe("right");
    expect(departure?.fromAssetFacing).toBe("right");
    expect(validateFormalRouteSnapshot(snapshot).some((issue) => issue.severity === "error")).toBe(false);
  });

  it("publishes the dining carry assets with their baked directions", () => {
    const draft = deserializeEditorDraft(diningKitchenSource)!;
    const snapshot = buildFormalRouteSnapshot(draft, { publishedAt: "2026-07-27T12:00:00.000Z" });
    const forward = snapshot.routes["counter-to-table"]!;
    const reverse = snapshot.routes["table-to-counter"]!;

    expect(forward.events.find((event) => event.targetStateId === "carry-bowl")?.toAssetFacing).toBe("right");
    expect(reverse.events.find((event) => event.targetStateId === "carry-bowl-return")?.toAssetFacing).toBe("left");
    expect(reverse.events.find((event) => event.fromAssetSource?.includes("carry-empty-bowl"))?.fromAssetFacing).toBe("left");
  });

  it("publishes event-local actor scales without changing the route geometry", () => {
    const baseDraft = deserializeEditorDraft(terraceSource)!;
    const routeKey = "entry-to-bench";
    const routeMeta = baseDraft.routeMeta?.[routeKey]!;
    const targetPointId = baseDraft.routes[routeKey]!.at(-1)!;
    const draft = {
      ...baseDraft,
      routeMeta: {
        ...baseDraft.routeMeta,
        [routeKey]: {
          ...routeMeta,
          transitions: routeMeta.transitions.map((transition) => transition.pointId === targetPointId
            ? { ...transition, toAssetScale: 1.35 }
            : transition),
        },
      },
    };
    const snapshot = buildFormalRouteSnapshot(draft, { publishedAt: "2026-07-27T12:00:00.000Z" });
    const route = snapshot.routes[routeKey]!;
    const arrival = route.events.find((event) => event.pointId === targetPointId && event.kind === "state");

    expect(route.waypointIds).toEqual(baseDraft.routes[routeKey]);
    expect(arrival?.toAssetScale).toBe(1.35);
    expect(validateFormalRouteSnapshot(snapshot).some((issue) => issue.severity === "error")).toBe(false);
  });

  it("assigns one stable interaction key to route-owned dining endpoint clones", () => {
    const draft = deserializeEditorDraft(diningKitchenSource)!;
    const result = publishEditorDraft(draft, { publishedAt: "2026-07-27T12:00:00.000Z" });

    expect(result.ok).toBe(true);
    const points = new Map(result.snapshot!.points.map((point) => [point.id, point]));
    expect(points.get("dining-entry")).toMatchObject({ anchorKind: "portal", anchorKey: "portal.dining-kitchen" });
    expect(points.get("kitchen-counter")).toMatchObject({ anchorKind: "interaction", anchorKey: "dining.counter" });
    expect(points.get("counter-to-table-node-1")).toMatchObject({ anchorKind: "interaction", anchorKey: "dining.counter" });
    expect(points.get("meal-table")).toMatchObject({ anchorKind: "interaction", anchorKey: "dining.table" });
    expect(points.get("table-to-entry-node-1")).toMatchObject({ anchorKind: "interaction", anchorKey: "dining.table" });
    expect(result.issues.some((issue) => issue.code === "anchor-coordinate-drift")).toBe(true);
  });

  it("resolves reversed cross-scene study routes into physical endpoint keys", () => {
    const draft = deserializeEditorDraft(studySource)!;
    const snapshot = buildFormalRouteSnapshot(draft, { publishedAt: "2026-07-27T12:00:00.000Z" });
    const points = new Map(snapshot.points.map((point) => [point.id, point]));
    const reversed = snapshot.routes["custom-12"]!;

    expect(points.get(reversed.startPointId)).toMatchObject({
      anchorKind: "interaction",
      anchorKey: "study.desk.right",
      anchorGroupKey: "study.desk",
      anchorPort: "right",
    });
    expect(points.get(reversed.endPointId)).toMatchObject({ anchorKind: "portal", anchorKey: "portal.bedroom" });
  });

  it("keeps the study desk's left and right route ports semantically distinct", () => {
    const draft = deserializeEditorDraft(studySource)!;
    const snapshot = buildFormalRouteSnapshot(draft, { publishedAt: "2026-07-27T12:00:00.000Z" });
    const points = new Map(snapshot.points.map((point) => [point.id, point]));

    const terraceArrival = snapshot.routes["door-to-seat"]!;
    expect(points.get(terraceArrival.endPointId)).toMatchObject({
      anchorKey: "study.desk.left",
      anchorGroupKey: "study.desk",
      anchorPort: "left",
    });

    for (const routeId of ["kitchen-to-seat", "custom-2", "custom-11"] as const) {
      const route = snapshot.routes[routeId]!;
      expect(points.get(route.endPointId)).toMatchObject({
        anchorKey: "study.desk.right",
        anchorGroupKey: "study.desk",
        anchorPort: "right",
      });
    }
  });

  it("uses bedroom route direction instead of copied endpoint roles", () => {
    const copiedPoint = {
      id: "custom-bed-endpoint",
      label: "复制节点 · 上床 / 唱片机交互点",
      role: "waypoint",
      semanticRole: "bed-edge",
    };

    expect(resolveRouteAnchorSemantics({
      sceneId: "bedroom",
      point: { ...copiedPoint, semanticRole: "bed-edge" },
      routeKey: "custom-door-to-bed",
      routeLabel: "门→床",
      position: "start",
    })).toMatchObject({ anchorKind: "portal", anchorKey: "portal.bedroom" });

    expect(resolveRouteAnchorSemantics({
      sceneId: "bedroom",
      point: { ...copiedPoint, semanticRole: "lounge" },
      routeKey: "custom-door-to-bed",
      routeLabel: "门→床",
      position: "end",
    })).toMatchObject({ anchorKind: "interaction", anchorKey: "bedroom.bed" });

    expect(resolveRouteAnchorSemantics({
      sceneId: "bedroom",
      point: { ...copiedPoint, semanticRole: "bed-edge" },
      routeKey: "custom-door-to-record",
      routeLabel: "门→唱片机",
      position: "end",
    })).toMatchObject({ anchorKind: "interaction", anchorKey: "bedroom.record" });
  });

  it("lets a route-owned left desk endpoint keep its meaning on future entrance routes", () => {
    const routeOwnedLeftEndpoint = {
      id: "custom-entrance-study-node",
      label: "玄关→书房 · 书桌端点",
      role: "waypoint",
      semanticRole: "seat-left",
    };

    expect(resolveRouteAnchorSemantics({
      sceneId: "study",
      point: routeOwnedLeftEndpoint,
      routeKey: "custom-entrance-to-study",
      routeLabel: "玄关→书房",
      position: "end",
    })).toMatchObject({
      anchorKey: "study.desk.left",
      anchorGroupKey: "study.desk",
      anchorPort: "left",
    });

    expect(resolveRouteAnchorSemantics({
      sceneId: "study",
      point: routeOwnedLeftEndpoint,
      routeKey: "custom-study-to-entrance",
      routeLabel: "书房→玄关",
      position: "start",
    })).toMatchObject({
      anchorKey: "study.desk.left",
      anchorGroupKey: "study.desk",
      anchorPort: "left",
    });
  });
});
