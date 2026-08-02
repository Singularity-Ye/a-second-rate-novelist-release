import { describe, expect, it } from "vitest";
import { getLifeContinuationCue } from "./life-rhythm";

describe("life continuation cues", () => {
  it("describes the direct meal route from counter to table", () => {
    expect(getLifeContinuationCue("dining-eat-red-bean-soup")).toMatchObject({
      title: "端着热汤去饭桌",
      icon: "♨",
      tone: "warm",
    });
  });

  it("describes the direct empty-bowl return after eating", () => {
    expect(getLifeContinuationCue("dining-serve-red-bean-soup")).toMatchObject({
      title: "带空碗回料理台",
      text: expect.stringContaining("空碗沿着熟悉的路线回到料理台"),
      icon: "○",
      tone: "quiet",
    });
  });
});
