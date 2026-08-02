import { describe, expect, it } from "vitest";
import { getFormalSceneAction } from "../novelist/scene-manifest";

describe("published dining visual anchors", () => {
  it("keeps the state composite anchors and asset scale explicit", () => {
    const counter = getFormalSceneAction("dining-kitchen", "eating", "serve-red-bean-soup");
    const table = getFormalSceneAction("dining-kitchen", "eating", "meal-table");

    expect(counter?.preview?.actorAnchor).toEqual({ x: 0.49, y: 0.28 });
    expect(table?.preview?.actorAnchor).toEqual({ x: 0.74, y: 0.45 });
    expect(
      getFormalSceneAction("dining-kitchen", "eating", "carry-bowl")
        ?.actorAsset?.nativeFacing,
    ).toBe("right");
    expect(
      getFormalSceneAction("dining-kitchen", "eating", "carry-bowl-return")
        ?.actorAsset?.nativeFacing,
    ).toBe("left");
    expect(getFormalSceneAction("dining-kitchen", "eating", "carry-bowl-return")?.actorAsset?.assetScale).toBe(1.5);
  });
});
