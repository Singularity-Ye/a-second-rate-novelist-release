import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPH_TUNING } from "./types";
import { GraphLayoutCache, graphLayoutCacheKey, hydrateGraphNodesFromLayout } from "./layout-cache";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const identity = {
  worldRevision: "world-7",
  graphScope: "chapter:66",
  tuning: DEFAULT_GRAPH_TUNING,
  nodes: [{ id: "a" }, { id: "b" }],
  edges: [{ source: "a", target: "b" }],
};

describe("graph layout cache", () => {
  it("round-trips converged coordinates and camera state", () => {
    const cache = new GraphLayoutCache(memoryStore());
    cache.save(identity, [{ id: "a", x: 12.12345678, y: 8, pinned: true }], { x: 1, y: 2, k: 1.25 });
    expect(cache.load(identity)).toMatchObject({
      nodes: [{ id: "a", x: 12.123457, y: 8, pinned: true }],
      camera: { x: 1, y: 2, k: 1.25 },
    });
  });

  it("invalidates on world revision, scope, tuning, or topology changes", () => {
    const original = graphLayoutCacheKey(identity);
    expect(graphLayoutCacheKey({ ...identity, worldRevision: "world-8" })).not.toBe(original);
    expect(graphLayoutCacheKey({ ...identity, graphScope: "volume:1" })).not.toBe(original);
    expect(graphLayoutCacheKey({ ...identity, tuning: { ...DEFAULT_GRAPH_TUNING, repelForce: 0.9 } })).not.toBe(original);
    expect(graphLayoutCacheKey({ ...identity, nodes: [...identity.nodes, { id: "c" }] })).not.toBe(original);
  });

  it("hydrates matching nodes while leaving newly added nodes untouched", () => {
    const cache = new GraphLayoutCache(memoryStore());
    const snapshot = cache.save(identity, [{ id: "a", x: 20, y: 30, pinned: true }]);
    expect(hydrateGraphNodesFromLayout([{ id: "a", label: "A", type: "character" }, { id: "c", label: "C", type: "place" }], snapshot)).toEqual([
      { id: "a", label: "A", type: "character", x: 20, y: 30, pinned: true },
      { id: "c", label: "C", type: "place" },
    ]);
  });
});
