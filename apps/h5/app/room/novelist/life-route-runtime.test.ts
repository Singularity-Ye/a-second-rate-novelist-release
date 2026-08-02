import { describe, expect, it } from "vitest";
import { formalLifeActivities } from "./life-activities";
import {
  lifeIntentRouteFields,
  missingLifeProps,
  resolveLifeRouteContract,
  validateFormalLifeRouteContracts,
} from "./life-route-runtime";

describe("life route contracts", () => {
  it("keeps every explicitly semantic activity aligned with the published graph", () => {
    expect(validateFormalLifeRouteContracts()).toEqual([]);
  });

  it("keeps the meal handoff directional and carries the prop contract", () => {
    const eating = formalLifeActivities["dining-eat-red-bean-soup"];
    const toTable = resolveLifeRouteContract(eating, "dining-counter-to-table");
    const backToCounter = resolveLifeRouteContract(eating, "dining-table-to-counter");

    expect(toTable).toMatchObject({
      ok: true,
      edge: { purpose: "scene-interaction" },
      intent: { requiredProps: ["bowl-full"], arrivalPolicy: "start-activity" },
    });
    expect(backToCounter).toMatchObject({
      ok: true,
      edge: { purpose: "scene-interaction" },
      intent: { requiredProps: ["bowl-empty"], arrivalPolicy: "arrive-only" },
    });
  });

  it("serializes route meaning into an intent without changing the route ID", () => {
    const serving = formalLifeActivities["dining-serve-red-bean-soup"];

    expect(lifeIntentRouteFields(serving, "dining-entry-to-counter")).toEqual({
      routePurpose: "scene-entry",
      arrivalPolicy: "start-activity",
    });
  });

  it("rejects a life contract whose purpose disagrees with the published edge", () => {
    const serving = formalLifeActivities["dining-serve-red-bean-soup"];
    const mismatch = resolveLifeRouteContract({
      ...serving,
      routeIntent: { purpose: "scene-exit", arrivalPolicy: "hide" },
    }, "dining-entry-to-counter");

    expect(mismatch.ok).toBe(false);
    expect(mismatch.issues[0]?.code).toBe("purpose-mismatch");
  });

  it("blocks an interaction route until its carried prop exists", () => {
    expect(missingLifeProps([], ["bowl-full"])).toEqual(["bowl-full"]);
    expect(missingLifeProps(["bowl-full"], ["bowl-full"])).toEqual([]);
    expect(missingLifeProps(["bowl-empty"], ["bowl-full"])).toEqual(["bowl-full"]);
  });
});
