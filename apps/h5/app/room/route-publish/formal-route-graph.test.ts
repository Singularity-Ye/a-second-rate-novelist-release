import { describe, expect, it } from "vitest";
import { buildFormalRouteGraph } from "./formal-route-graph";

describe("formal published route graph", () => {
  it("builds connector direction from published endpoint semantics, not labels", () => {
    const graph = buildFormalRouteGraph();
    const studyToBedroom = graph.edges.find((edge) => edge.route.id === "custom-12");
    const bedroomToStudy = graph.edges.find((edge) => edge.route.id === "custom-11");

    expect(studyToBedroom).toMatchObject({
      fromSceneId: "study",
      toSceneId: "bedroom",
      purpose: "scene-transition",
      isSceneConnector: true,
    });
    expect(bedroomToStudy).toMatchObject({
      fromSceneId: "bedroom",
      toSceneId: "study",
      purpose: "scene-transition",
      isSceneConnector: true,
    });
  });

  it("distinguishes dining entry, interaction, and exit edges", () => {
    const graph = buildFormalRouteGraph();
    const entry = graph.edges.find((edge) => edge.route.id === "entry-to-counter");
    const interaction = graph.edges.find((edge) => edge.route.id === "counter-to-table");
    const exit = graph.edges.find((edge) => edge.route.id === "counter-to-entry");

    expect(entry).toMatchObject({ purpose: "scene-entry", isSceneConnector: false });
    expect(interaction).toMatchObject({ purpose: "scene-interaction", isSceneConnector: false });
    expect(exit).toMatchObject({ purpose: "scene-exit", isSceneConnector: false });
  });

  it("finds a directed connector path through published routes", () => {
    const graph = buildFormalRouteGraph();

    expect(graph.findConnectorPath("study", "bedroom")?.map((edge) => edge.route.id)).toEqual(["custom-12"]);
    expect(graph.findConnectorPath("bedroom", "study")?.map((edge) => edge.route.id)).toEqual(["custom-11"]);
  });

  it("finds local handoff chains from the same published graph", () => {
    const graph = buildFormalRouteGraph();

    expect(graph.findLocalPath("terrace-greenery", "terrace-bench", "turtle-pond")?.map((edge) => edge.route.id)).toEqual([
      "bench-to-entry",
      "entry-to-turtle-pond",
    ]);
  });

  it("does not include stale static routes in the formal graph", () => {
    const graph = buildFormalRouteGraph();

    expect(graph.edges.some((edge) => edge.route.id === "study-desk-stay")).toBe(false);
    expect(graph.edges.every((edge) => edge.route.publishedFromSnapshot)).toBe(true);
  });
});
