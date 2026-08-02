import { afterEach, describe, expect, it } from "vitest";
import { createInitialLifeRuntimeState, lifeRuntimeReducer } from "./life-runtime";
import { clearLifeRuntimeSnapshot, loadLifeRuntimeSnapshot, saveLifeRuntimeSnapshot } from "./life-runtime-store";

describe("life runtime persistence", () => {
  afterEach(() => {
    clearLifeRuntimeSnapshot();
  });

  it("round-trips stable needs and omits transient route activity", () => {
    let state = createInitialLifeRuntimeState("study");
    state = lifeRuntimeReducer(state, { type: "needs-drifted", eventId: "persist:1", delta: { hunger: 20, inspiration: -8 } });
    state = { ...state, carriedProps: ["bowl-empty"] };
    const saved = saveLifeRuntimeSnapshot(state, 1234);
    const loaded = loadLifeRuntimeSnapshot();

    expect(saved.savedAt).toBe(1234);
    expect(loaded?.host.hunger).toBe(58);
    expect(loaded?.host.inspiration).toBe(40);
    expect(loaded?.carriedProps).toEqual(["bowl-empty"]);
    expect(loaded?.host).not.toHaveProperty("currentScene");
  });
});
