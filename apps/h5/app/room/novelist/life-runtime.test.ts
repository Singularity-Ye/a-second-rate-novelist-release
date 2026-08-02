import { describe, expect, it } from "vitest";
import {
  createInitialLifeRuntimeState,
  lifeRuntimeReducer,
  type LifeIntent,
} from "./life-runtime";

const intent: LifeIntent = {
  id: "intent:test:hunger",
  reason: "hunger",
  sourceScene: "study",
  targetScene: "dining-kitchen",
  targetAnchor: "kitchen-counter",
  routeKey: "dining-entry-to-counter",
  arrivalActivity: "dining-serve-red-bean-soup",
  interruptible: true,
  returnPolicy: "resume-schedule",
  status: "queued",
};

describe("lifeRuntimeReducer", () => {
  it("treats eventId as an idempotency key", () => {
    const state = createInitialLifeRuntimeState();
    const event = { type: "needs-drifted" as const, eventId: "tick:1", delta: { hunger: 5 } };
    const once = lifeRuntimeReducer(state, event);
    const twice = lifeRuntimeReducer(once, event);

    expect(once.host.hunger).toBe(state.host.hunger + 5);
    expect(twice).toBe(once);
  });

  it("does not settle or create traces at route arrival", () => {
    let state = createInitialLifeRuntimeState();
    state = lifeRuntimeReducer(state, { type: "intent-queued", eventId: "intent:1", intent });
    state = lifeRuntimeReducer(state, { type: "route-departed", eventId: "depart:1", routeKey: intent.routeKey, intentId: intent.id });
    state = lifeRuntimeReducer(state, {
      type: "route-arrived",
      eventId: "arrive:1",
      routeKey: intent.routeKey,
      anchor: intent.targetAnchor,
      sceneId: intent.targetScene,
      actionId: "serve-red-bean-soup",
      intentId: intent.id,
    });

    expect(state.phase).toBe("activity-ready");
    expect(state.traceIds).toEqual([]);
    expect(state.host.hunger).toBe(38);

    const earlyCompletion = lifeRuntimeReducer(state, {
      type: "activity-completed",
      eventId: "complete-before-activity:1",
      beatId: "meal",
      settlement: {
        activityId: "dining-eat-red-bean-soup",
        delta: { hunger: -35 },
        traces: [{ id: "bowl-empty", kind: "prop", expires: "next-visit" }],
      },
    });
    expect(earlyCompletion).toBe(state);
  });

  it("settles needs and traces only when activity-completed arrives", () => {
    let state = createInitialLifeRuntimeState("dining-kitchen");
    state = lifeRuntimeReducer(state, { type: "intent-queued", eventId: "intent:2", intent });
    state = lifeRuntimeReducer(state, { type: "route-departed", eventId: "depart:2", routeKey: intent.routeKey, intentId: intent.id });
    state = lifeRuntimeReducer(state, {
      type: "activity-entered",
      eventId: "activity:2",
      beatId: "meal",
      activityId: "dining-eat-red-bean-soup",
      sceneId: "dining-kitchen",
    });
    state = lifeRuntimeReducer(state, {
      type: "activity-completed",
      eventId: "complete:2",
      beatId: "meal",
      settlement: {
        activityId: "dining-eat-red-bean-soup",
        delta: { hunger: -35, emotionalLoad: -5 },
        traces: [{ id: "bowl-empty", kind: "prop", expires: "next-visit" }],
      },
    });

    expect(state.phase).toBe("idle");
    expect(state.host.hunger).toBe(3);
    expect(state.traceIds).toContain("bowl-empty");
    expect(state.intents[intent.id]?.status).toBe("complete");
  });

  it("moves carried props only when the corresponding activity completes", () => {
    let state = createInitialLifeRuntimeState("dining-kitchen");
    state = lifeRuntimeReducer(state, {
      type: "activity-entered",
      eventId: "activity:props:serve",
      beatId: "serve",
      activityId: "dining-serve-red-bean-soup",
      sceneId: "dining-kitchen",
    });
    state = lifeRuntimeReducer(state, {
      type: "activity-completed",
      eventId: "complete:props:serve",
      beatId: "serve",
      settlement: {
        activityId: "dining-serve-red-bean-soup",
        delta: {},
        traces: [],
        propChanges: { add: ["bowl-full"] },
      },
    });
    expect(state.carriedProps).toEqual(["bowl-full"]);

    state = lifeRuntimeReducer(state, {
      type: "activity-entered",
      eventId: "activity:props:eat",
      beatId: "eat",
      activityId: "dining-eat-red-bean-soup",
      sceneId: "dining-kitchen",
    });
    state = lifeRuntimeReducer(state, {
      type: "activity-completed",
      eventId: "complete:props:eat",
      beatId: "eat",
      settlement: {
        activityId: "dining-eat-red-bean-soup",
        delta: {},
        traces: [],
        propChanges: { remove: ["bowl-full"], add: ["bowl-empty"] },
      },
    });
    expect(state.carriedProps).toEqual(["bowl-empty"]);
  });

  it("keeps an interrupted intent available for explicit recovery", () => {
    let state = createInitialLifeRuntimeState();
    state = lifeRuntimeReducer(state, { type: "intent-queued", eventId: "intent:3", intent });
    state = lifeRuntimeReducer(state, { type: "route-departed", eventId: "depart:3", routeKey: intent.routeKey, intentId: intent.id });
    state = lifeRuntimeReducer(state, { type: "user-interrupted", eventId: "interrupt:3", commandId: "hand:3", suspendedIntentId: intent.id });

    expect(state.phase).toBe("interrupted");
    expect(state.pendingIntentIds).toContain(intent.id);
    expect(state.intents[intent.id]?.status).toBe("interrupted");
  });

  it("clears the running activity when an intent is interrupted", () => {
    let state = createInitialLifeRuntimeState("study");
    state = lifeRuntimeReducer(state, { type: "intent-queued", eventId: "intent:4", intent });
    state = lifeRuntimeReducer(state, { type: "route-departed", eventId: "depart:4", routeKey: intent.routeKey, intentId: intent.id });
    state = lifeRuntimeReducer(state, {
      type: "activity-entered",
      eventId: "activity:4",
      beatId: "writing",
      activityId: "study-writing",
      sceneId: "study",
    });
    state = lifeRuntimeReducer(state, { type: "user-interrupted", eventId: "interrupt:4", commandId: "hand:4", suspendedIntentId: intent.id });

    expect(state.phase).toBe("interrupted");
    expect(state.activityId).toBeUndefined();
    expect(state.activeBeatId).toBeUndefined();
    expect(state.host.currentActivity).toBeUndefined();
  });

  it("restores stable needs without pretending a route survived a reload", () => {
    const restored = lifeRuntimeReducer(createInitialLifeRuntimeState("study"), {
      type: "runtime-restored",
      eventId: "restore:1",
      snapshot: {
        version: 1,
        savedAt: 100,
        dayIndex: 3,
        host: {
          dayPhase: "evening",
          hunger: 82,
          fatigue: 41,
          focus: 34,
          inspiration: 67,
          emotionalLoad: 22,
          caffeineDebt: 4,
        },
        pendingIntentIds: [],
        intents: {},
        traceIds: ["night-note-created"],
      },
    });

    expect(restored.dayIndex).toBe(3);
    expect(restored.host.hunger).toBe(82);
    expect(restored.host.currentScene).toBe("study");
    expect(restored.phase).toBe("idle");
    expect(restored.traceIds).toContain("night-note-created");
  });
});
