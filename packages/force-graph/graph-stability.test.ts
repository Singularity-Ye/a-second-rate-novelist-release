import { describe, expect, it } from "vitest";
import { graphInputSignature, graphTopologySignature } from "./graph-stability";

describe("graph render signatures", () => {
  it("treats identity-only array recreation as the same render data", () => {
    const first = [{ id: "a", label: "A", type: "note" }];
    const firstEdges = [{ id: "ab", source: "a", target: "a" }];
    const second = [{ id: "a", label: "A", type: "note", metadata: { changed: true } }];
    const secondEdges = [{ id: "ab", source: "a", target: "a", metadata: { changed: true } }];
    expect(graphInputSignature(first, firstEdges)).toBe(graphInputSignature(second, secondEdges));
    expect(graphTopologySignature(first, firstEdges)).toBe(graphTopologySignature(second, secondEdges));
  });

  it("changes when a rendered property changes", () => {
    const base = [{ id: "a", label: "A", type: "note" }];
    const changed = [{ id: "a", label: "A+", type: "note" }];
    expect(graphInputSignature(base, [])).not.toBe(graphInputSignature(changed, []));
    expect(graphTopologySignature(base, [])).toBe(graphTopologySignature(changed, []));
  });
});
