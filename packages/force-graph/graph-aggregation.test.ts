import { describe, expect, it } from "vitest";
import { buildFocusGraph, buildOverviewGraph } from "./graph-aggregation";
import type { GraphEdgeInput, GraphNodeInput } from "./types";

const nodes: Array<GraphNodeInput<{ area: string }>> = [
  { id: "a", label: "知识 A", type: "note", metadata: { area: "knowledge" }, weight: 3 },
  { id: "b", label: "知识 B", type: "note", metadata: { area: "knowledge" }, weight: 1 },
  { id: "c", label: "生活 C", type: "note", metadata: { area: "life" }, weight: 2 },
  { id: "d", label: "生活 D", type: "note", metadata: { area: "life" }, weight: 1 },
  { id: "e", label: "项目 E", type: "note", metadata: { area: "project" }, weight: 1 },
];
const edges: Array<GraphEdgeInput> = [
  { id: "ab", source: "a", target: "b", weight: 1 },
  { id: "ac", source: "a", target: "c", weight: 2 },
  { id: "cd", source: "c", target: "d", weight: 1 },
  { id: "ce", source: "c", target: "e", weight: 1 },
];

describe("graph projections", () => {
  it("builds a compact overview without losing source member IDs", () => {
    const result = buildOverviewGraph(nodes, edges, { maxGroups: 3 });
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.find((node) => node.metadata.groupKey === "knowledge")?.metadata.memberIds).toEqual(["a", "b"]);
    expect(result.edges.find((edge) => edge.source.includes("knowledge"))?.metadata.relationCount).toBe(1);
    expect(result.hiddenNodeCount).toBe(0);
  });

  it("keeps the selected node and only its requested neighborhood", () => {
    const result = buildFocusGraph(nodes, edges, { selectedNodeId: "a", neighborDepth: 1, maxNodes: 10 });
    expect(new Set(result.nodes.map((node) => node.id))).toEqual(new Set(["a", "b", "c"]));
    expect(result.edges.map((edge) => edge.id)).toEqual(["ac", "ab"]);
    expect(result.nodes.some((node) => node.id === "d")).toBe(false);
  });

  it("applies node and edge budgets deterministically", () => {
    const result = buildFocusGraph(nodes, edges, { maxNodes: 2, maxEdges: 1 });
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.hiddenNodeCount).toBe(3);
    expect(result.hiddenEdgeCount).toBe(3);
  });
});
