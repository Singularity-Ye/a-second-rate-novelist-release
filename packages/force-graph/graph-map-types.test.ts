import { describe, expect, it } from "vitest";
import { graphFacetNodeId, graphRelationId } from "./graph-map-types";

describe("semantic graph IDs", () => {
  it("keeps facet IDs stable and separates kinds", () => {
    expect(graphFacetNodeId("platform", "抖音")).toBe(graphFacetNodeId("platform", "抖音"));
    expect(graphFacetNodeId("platform", "抖音")).not.toBe(graphFacetNodeId("area", "抖音"));
  });

  it("makes relation type part of the edge identity", () => {
    expect(graphRelationId("note:a", "facet:x", "captured_from_platform"))
      .not.toBe(graphRelationId("note:a", "facet:x", "belongs_to_folder"));
  });
});
