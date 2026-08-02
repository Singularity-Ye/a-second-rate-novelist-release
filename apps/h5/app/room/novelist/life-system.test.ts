import { describe, expect, it } from "vitest";
import { projectLifeSystem, resolveLifeSystemRoute } from "./life-system";

describe("life system projection", () => {
  it("joins current needs with the published route contract without mutating runtime state", () => {
    const projection = projectLifeSystem({
      sceneId: "dining-kitchen",
      routeId: "dining-counter-to-table",
      activityId: "dining-eat-red-bean-soup",
      host: { hunger: 72, fatigue: 22, focus: 61, inspiration: 48, emotionalLoad: 12 },
      carriedProps: ["bowl-full"],
      runtimePhase: "idle",
    });

    expect(projection.schema).toBe("novelist-life-system.v1");
    expect(projection.route?.id).toBe("dining-counter-to-table");
    expect(projection.activity?.id).toBe("dining-eat-red-bean-soup");
    expect(projection.routeContract?.ok).toBe(true);
    expect(projection.signals).toHaveLength(5);
    expect(projection.dominantSignal.key).toBe("hunger");
  });

  it("does not invent a route when the system is only observing a stable state", () => {
    const projection = projectLifeSystem({
      sceneId: "study",
      actionId: "writing-seat",
      host: { hunger: 20, fatigue: 18, focus: 88, inspiration: 76, emotionalLoad: 8 },
    });

    expect(projection.route).toBeNull();
    expect(projection.activity?.id).toBe("study-writing");
    expect(projection.routeContract).toBeNull();
    expect(projection.urgentTendency).toBeNull();
  });

  it("keeps route semantics and carried props in one decision boundary", () => {
    const ready = resolveLifeSystemRoute({
      sceneId: "dining-kitchen",
      routeId: "dining-counter-to-table",
      actionId: "meal-table",
      carriedProps: ["bowl-full"],
    });
    expect(ready.ok).toBe(true);
    expect(ready.route?.id).toBe("dining-counter-to-table");
    expect(ready.routeOwnerActivity?.id).toBe("dining-eat-red-bean-soup");
    expect(ready.routeFields.requiredProps).toEqual(["bowl-full"]);
    expect(ready.missingProps).toEqual([]);

    const blocked = resolveLifeSystemRoute({
      sceneId: "dining-kitchen",
      routeId: "dining-counter-to-table",
      actionId: "meal-table",
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.missingProps).toEqual(["bowl-full"]);
  });
});
