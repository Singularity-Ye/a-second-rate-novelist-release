import { describe, expect, it } from "vitest";
import { collapseParallelEdges, layoutEdgeLabels } from "./edge-label-layout";
import type { ResolvedGraphEdge } from "./types";

function edge(id: string, source: string, target: string, label: string, sourceX: number, sourceY: number, targetX: number, targetY: number): ResolvedGraphEdge {
  return {
    id,
    source: { id: source, label: source, type: "character", radius: 28, weight: 1, x: sourceX, y: sourceY, vx: 0, vy: 0 },
    target: { id: target, label: target, type: "character", radius: 28, weight: 1, x: targetX, y: targetY, vx: 0, vy: 0 },
    label,
    weight: 1,
  };
}

describe("narrative edge label projection", () => {
  it("collapses parallel evidence without deleting the first edge identity", () => {
    const collapsed = collapseParallelEdges([
      { id: "a-b-1", source: "a", target: "b", label: "师徒" },
      { id: "a-b-2", source: "b", target: "a", label: "救命恩人" },
      { id: "a-c", source: "a", target: "c", label: "追踪" },
    ]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0]).toMatchObject({ id: "a-b-1", label: "师徒 +1" });
    expect(collapsed[0]?.metadata).toMatchObject({ parallelLabels: ["师徒", "救命恩人"] });
    expect(collapsed[1]).toMatchObject({ id: "a-c", label: "追踪" });
  });

  it("uses different lanes for labels that converge on a central node", () => {
    const placements = layoutEdgeLabels([
      edge("e1", "center", "one", "曾经救过", 0, 0, 200, -40),
      edge("e2", "center", "two", "共同追查旧案", 0, 0, 200, 0),
      edge("e3", "center", "three", "暂时敌对", 0, 0, 200, 40),
    ]);
    const points = [...placements.values()].map((item) => `${item.x.toFixed(1)}:${item.y.toFixed(1)}`);
    expect(new Set(points).size).toBe(points.length);
    expect([...placements.values()].every((item) => item.visible)).toBe(true);
  });

  it("truncates long labels but keeps the complete relationship in the title", () => {
    const placement = layoutEdgeLabels([edge("long", "a", "b", "这是一个非常非常长的关系说明用于验证避让是否会截断", 0, 0, 260, 0)]).get("long");
    expect(placement?.label.length).toBeLessThan(21);
    expect(placement?.label.endsWith("…")).toBe(true);
    expect(placement?.fullLabel).toContain("关系说明");
  });

  it("does not spend label space on tiny inactive edges", () => {
    expect(layoutEdgeLabels([edge("tiny", "a", "b", "短边", 0, 0, 20, 0)])).not.toHaveProperty("tiny");
    expect(layoutEdgeLabels([edge("tiny", "a", "b", "短边", 0, 0, 20, 0)], "a").get("tiny")?.visible).toBe(true);
  });
});
