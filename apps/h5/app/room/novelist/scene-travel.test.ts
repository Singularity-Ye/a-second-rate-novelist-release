import { describe, expect, it } from "vitest";
import { buildPublishedSceneJourney, parsePublishedConnectorLabel, resolveSceneConnectorTarget } from "./scene-travel";
import { buildFormalRouteGraph } from "../route-publish/formal-route-graph";

describe("published scene travel", () => {
  it("understands normal and reversed connector labels", () => {
    expect(parsePublishedConnectorLabel("书房 → 露台（椅子右侧下椅）")).toEqual({
      from: "study",
      to: "terrace-greenery",
    });
    expect(parsePublishedConnectorLabel("反向·卧室→书房")).toEqual({
      from: "study",
      to: "bedroom",
    });
  });

  it("plans a study to bedroom trip through the published connector and bedroom entry route", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "study",
      targetSceneId: "bedroom",
      currentPointId: "writing-seat",
      targetRouteId: "door-to-bed",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.map((leg) => [leg.sceneId, leg.routeId, leg.role])).toEqual([
      ["study", "custom-12", "connector"],
      ["bedroom", "door-to-bed", "destination"],
    ]);
  });

  it("leaves a bedroom action point before taking the bedroom to kitchen connector", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "bedroom",
      targetSceneId: "dining-kitchen",
      currentPointId: "bed-edge",
      targetRouteId: "dining-entry-to-counter",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.map((leg) => [leg.sceneId, leg.routeId, leg.role])).toEqual([
      ["bedroom", "bed-to-door", "exit"],
      ["study", "custom-9", "connector"],
      ["dining-kitchen", "dining-entry-to-counter", "destination"],
    ]);
  });

  it("walks from an entry to a requested interior route instead of teleporting to its start", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "study",
      targetSceneId: "dining-kitchen",
      currentPointId: "writing-seat",
      targetRouteId: "dining-counter-to-table",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.at(-2)?.routeId).toBe("entry-to-counter");
    expect(journey!.legs.at(-1)?.routeId).toBe("dining-counter-to-table");
  });

  it("uses the published kitchen-to-attic connector without detouring through the study seat", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "dining-kitchen",
      targetSceneId: "attic",
      currentPointId: "kitchen-counter",
      targetRouteId: "stair-to-archive",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.map((leg) => [leg.sceneId, leg.routeId, leg.role])).toEqual([
      ["dining-kitchen", "counter-to-entry", "exit"],
      ["study", "custom-3", "connector"],
      ["attic", "stair-to-archive", "destination"],
    ]);
    expect(journey!.legs.some((leg) => leg.routeId === "door-to-seat")).toBe(false);
  });

  it("keeps a route-catalog connector directed to its formal destination scene", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "study",
      targetSceneId: "attic",
      currentPointId: "writing-seat",
      targetRouteId: "attic-stair-stay",
      preferredConnector: { sceneId: "study", routeId: "custom-1" },
    });

    expect(journey?.legs.map((leg) => [leg.sceneId, leg.routeId, leg.role])).toEqual([
      ["study", "custom-1", "connector"],
      ["attic", "attic-stair-stay", "destination"],
    ]);
  });

  it("stops at the destination portal instead of inheriting the destination away route", () => {
    const graph = buildFormalRouteGraph();
    const connector = graph.routeEdge("study", "custom-17");
    expect(connector).toBeTruthy();
    expect(resolveSceneConnectorTarget(connector!)).toMatchObject({
      strategy: "portal-stay",
      targetRouteId: "__formal-portal-arrival__:dining-kitchen:dining-entry",
      targetState: "away",
    });

    const journey = buildPublishedSceneJourney({
      fromSceneId: "study",
      targetSceneId: "dining-kitchen",
      currentPointId: "writing-seat",
      targetRouteId: "__formal-portal-arrival__:dining-kitchen:dining-entry",
      preferredConnector: { sceneId: "study", routeId: "custom-17" },
    });

    expect(journey?.legs.at(-1)).toMatchObject({
      sceneId: "dining-kitchen",
      routeId: "__formal-portal-arrival__:dining-kitchen:dining-entry",
      role: "destination",
    });
    expect(journey?.legs.some((leg) => leg.routeId === "dining-table-to-entry")).toBe(false);
  });

  it("gives every published scene connector an explicit destination strategy", () => {
    const connectors = buildFormalRouteGraph().connectorEdges();
    expect(connectors.length).toBeGreaterThan(0);

    for (const connector of connectors) {
      const target = resolveSceneConnectorTarget(connector);
      expect(target, `${connector.sceneId}:${connector.route.id}`).not.toBeNull();
      expect(target?.strategy).toBe(
        connector.end.kind === "portal" ? "portal-stay" : "interaction-state",
      );
    }
  });

  it("anchors bedroom connector arrival to the authored bedroom door point", () => {
    const graph = buildFormalRouteGraph();
    const connector = graph.routeEdge("study", "custom-12");
    expect(connector).toBeTruthy();
    expect(resolveSceneConnectorTarget(connector!)).toMatchObject({
      strategy: "portal-stay",
      targetRouteId: "__formal-portal-arrival__:bedroom:bedroom-door",
    });
  });

  it("maps a connector that ends at the desk to the writing state", () => {
    const graph = buildFormalRouteGraph();
    const connector = graph.routeEdge("study", "custom-2");
    expect(connector).toBeTruthy();
    expect(resolveSceneConnectorTarget(connector!)).toEqual({
      strategy: "interaction-state",
      targetRouteId: "study-desk-stay",
      targetState: "writing",
    });
  });

  it("does not replay the study writing handoff after the attic connector reaches the desk", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "attic",
      targetSceneId: "study",
      currentPointId: "attic-stair-entry",
      targetRouteId: "study-desk-stay",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.map((leg) => [leg.sceneId, leg.routeId, leg.role])).toEqual([
      ["study", "custom-2", "destination"],
    ]);
  });

  it("keeps the writing handoff after the bedroom connector hides at the desk", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "bedroom",
      targetSceneId: "study",
      currentPointId: "bed-edge",
      targetRouteId: "study-desk-stay",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.map((leg) => [leg.sceneId, leg.routeId, leg.role])).toEqual([
      ["bedroom", "bed-to-door", "exit"],
      ["study", "custom-11", "connector"],
      ["study", "study-desk-stay", "destination"],
    ]);
  });

  it("does not append a second writing route when the terrace connector uses the desk's left port", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "terrace-greenery",
      targetSceneId: "study",
      currentPointId: "terrace-entry",
      targetRouteId: "study-desk-stay",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.map((leg) => [leg.sceneId, leg.routeId, leg.role])).toEqual([
      ["study", "door-to-seat", "destination"],
    ]);
  });

  it("keeps same-scene commands as one direct published route", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "terrace-greenery",
      targetSceneId: "terrace-greenery",
      currentPointId: "terrace-entry",
      targetRouteId: "terrace-to-turtle",
    });
    expect(journey?.legs).toHaveLength(1);
    expect(journey?.legs[0]).toMatchObject({ routeId: "terrace-to-turtle", role: "destination" });
  });

  it("walks back to the required anchor before starting another route in the same scene", () => {
    const journey = buildPublishedSceneJourney({
      fromSceneId: "terrace-greenery",
      targetSceneId: "terrace-greenery",
      currentPointId: "terrace-bench",
      targetRouteId: "terrace-to-turtle",
    });

    expect(journey).toBeTruthy();
    expect(journey!.legs.map((leg) => [leg.routeId, leg.role])).toEqual([
      ["bench-to-entry", "entry"],
      ["terrace-to-turtle", "destination"],
    ]);
  });
});
