import { describe, expect, it } from "vitest";
import { formalLifeActivities, getLifeContinuationRouteKey } from "./life-activities";

describe("formal life activity contracts", () => {
  it("keeps the meal routine directional and stops the empty-bowl return", () => {
    const serving = formalLifeActivities["dining-serve-red-bean-soup"];
    expect(serving.nextActivityId).toBe("dining-eat-red-bean-soup");
    expect(serving.routeKey).toBe("dining-entry-to-counter");
    expect(serving.visualBeats.some((beat) => beat.effectId === "serve-finish" && beat.trigger === "activity-complete")).toBe(true);

    const eating = formalLifeActivities["dining-eat-red-bean-soup"];
    expect(eating.nextActivityId).toBe("dining-serve-red-bean-soup");
    expect(eating.continuationRouteKey).toBe("dining-table-to-counter");
    expect(eating.continuationMode).toBe("arrive-only");
    expect(getLifeContinuationRouteKey(serving, eating)).toBe("dining-counter-to-table");
    expect(getLifeContinuationRouteKey(eating, serving)).toBe("dining-table-to-counter");
  });

  it("settles writing when the user leaves so the desk keeps a page trace", () => {
    expect(formalLifeActivities["study-writing"].settleOnInterrupt).toBe(true);
    expect(formalLifeActivities["study-writing"].durationMs).toBe("until-user");
    expect(formalLifeActivities["study-writing"].visualBeats.some((beat) => beat.layer === "overlay")).toBe(true);
  });
});
