import { describe, expect, it } from "vitest";
import { formalEcologySceneManifest, getFormalSceneRoute } from "./scene-manifest";
import {
  formalLifeSceneIds,
  getDominantLifeSignal,
  getLifeSignals,
  getStateDrivenLifeTendency,
  getSceneTraceEcho,
  getSceneLifeCue,
  getSceneInteractionCue,
  getAutoplayLifeBeat,
  getCalendarLifeDay,
  getDailyLifePlan,
  getStateLifeCue,
  novelistDailyRhythm,
  sceneAmbientThoughts,
} from "./life-rhythm";

describe("production life rhythm", () => {
  it("only targets scenes admitted by the published route boundary", () => {
    expect(formalLifeSceneIds).toEqual(["study", "dining-kitchen", "bedroom", "terrace-greenery", "attic"]);
    expect(formalLifeSceneIds.every((sceneId) => formalEcologySceneManifest.runtimeSceneIds.includes(sceneId))).toBe(true);
    expect(novelistDailyRhythm.every((beat) => formalLifeSceneIds.includes(beat.sceneId))).toBe(true);
  });

  it("references existing route contracts instead of inventing route geometry", () => {
    for (const beat of novelistDailyRhythm) {
      expect(getFormalSceneRoute(beat.sceneId, beat.routeId)).toBeDefined();
      expect(beat.cue.length).toBeGreaterThan(0);
      expect(beat.outcome.length).toBeGreaterThan(0);
    }
  });

  it("keeps one small rotating thought set per production scene", () => {
    for (const sceneId of formalLifeSceneIds) {
      expect(sceneAmbientThoughts[sceneId]?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps route language structured across the full life event", () => {
    const intent = getSceneLifeCue("dining-kitchen", "intent", { actionId: "meal-table" });
    const arrival = getSceneLifeCue("dining-kitchen", "arrival", { actionId: "meal-table" });
    const smoke = getSceneLifeCue("dining-kitchen", "transition", { index: 1 });

    expect(intent).toMatchObject({ kind: "intent", sceneId: "dining-kitchen", icon: expect.any(String) });
    expect(arrival.title).toContain("饭桌");
    expect(arrival.systemAside).toContain("回灵丹");
    expect(smoke).toMatchObject({ kind: "transition", title: expect.stringContaining("白烟") });
    expect(new Set([intent.id, arrival.id, smoke.id]).size).toBe(3);
  });

  it("keeps the main cue in the novelist's own sensory voice", () => {
    expect(getSceneLifeCue("study", "thought", { index: 0 })).toMatchObject({
      title: "句号以前",
      text: expect.stringContaining("光标"),
    });
    expect(getSceneLifeCue("dining-kitchen", "activity", { actionId: "meal-table" })).toMatchObject({
      title: "慢慢吃饭",
      text: expect.stringContaining("热气"),
    });
  });

  it("gives each scene a local tap response without creating a route intent", () => {
    const turtle = getSceneInteractionCue("terrace-greenery", "turtle-pond");
    expect(turtle).toMatchObject({
      kind: "system",
      icon: "◉",
      title: "卡文缩了缩壳",
      anchor: "actor",
    });
    expect(turtle.action).toBeUndefined();
  });

  it("chooses a beat from the current day phase and skips the active beat", () => {
    expect(getAutoplayLifeBeat("noon", "dining-serve-soup")?.id).toBe("dining-eat-soup");
    expect(getAutoplayLifeBeat("evening", "terrace-night-fieldwork")?.id).toBe("bedroom-vinyl-break");
  });

  it("rotates only the optional windows while keeping the daily anchors", () => {
    const steady = getDailyLifePlan(1);
    const fieldNotes = getDailyLifePlan(2);
    const oldPages = getDailyLifePlan(3);
    const windWalk = getDailyLifePlan(5);
    const slowSunday = getDailyLifePlan(7);

    expect(steady.beats.map((beat) => beat.id)).toContain("dining-eat-soup");
    expect(fieldNotes.beats.map((beat) => beat.id)).toContain("terrace-turtle-talk");
    expect(oldPages.beats.map((beat) => beat.id)).toContain("attic-archive-hunt");
    expect(windWalk.beats.map((beat) => beat.id)).toContain("terrace-bench-pause");
    expect(slowSunday.beats.map((beat) => beat.id)).not.toContain("study-stuck-window");
    expect(steady.beats.map((beat) => beat.id)).toContain("bedroom-rest");
    expect(new Set(Array.from({ length: 7 }, (_, index) => getDailyLifePlan(index + 1).mode)).size).toBe(7);
    expect(fieldNotes.beats.every((beat) => getFormalSceneRoute(beat.sceneId, beat.routeId))).toBe(true);
  });

  it("uses a stable local-calendar day seed", () => {
    expect(getCalendarLifeDay(new Date(2026, 0, 1))).toBe(1);
    expect(getCalendarLifeDay(new Date(2026, 0, 2))).toBe(2);
    expect(getDailyLifePlan(0).dayIndex).toBe(1);
  });

  it("projects numeric needs into a stable visual signal without creating a route", () => {
    const signals = getLifeSignals({ hunger: 82, fatigue: 24, focus: 58, inspiration: 19, emotionalLoad: 12 });
    expect(signals.find((signal) => signal.key === "hunger")).toMatchObject({ level: "urgent", icon: "♨" });
    expect(signals.find((signal) => signal.key === "inspiration")).toMatchObject({ level: "urgent", icon: "✦" });
    expect(getDominantLifeSignal({ hunger: 82, fatigue: 24, focus: 58, inspiration: 19, emotionalLoad: 12 }).key).toBe("hunger");
  });

  it("turns an urgent state into one published life direction", () => {
    const tendency = getStateDrivenLifeTendency({
      hunger: 82,
      fatigue: 24,
      focus: 58,
      inspiration: 19,
      emotionalLoad: 12,
      currentScene: "study",
      runtimePhase: "idle",
      carriedProps: [],
    });
    expect(tendency).toMatchObject({
      key: "hunger",
      sceneId: "dining-kitchen",
      routeId: "dining-entry-to-counter",
      activityId: "dining-serve-red-bean-soup",
      level: "urgent",
    });
  });

  it("does not restart a dining loop or overwrite an active runtime", () => {
    expect(getStateDrivenLifeTendency({
      hunger: 90,
      fatigue: 20,
      focus: 60,
      inspiration: 60,
      emotionalLoad: 10,
      currentScene: "dining-kitchen",
      currentActionId: "meal-table",
      runtimePhase: "idle",
      carriedProps: ["bowl-empty"],
    })).toBeNull();
    expect(getStateDrivenLifeTendency({
      hunger: 90,
      fatigue: 90,
      focus: 60,
      inspiration: 60,
      emotionalLoad: 10,
      currentScene: "study",
      runtimePhase: "route-moving",
      carriedProps: [],
    })).toBeNull();
  });

  it("allows a notice to be shown without letting autoplay depart", () => {
    const tendency = getStateDrivenLifeTendency({
      hunger: 60,
      fatigue: 20,
      focus: 60,
      inspiration: 60,
      emotionalLoad: 10,
      currentScene: "study",
      runtimePhase: "idle",
      carriedProps: [],
    }, "notice");
    expect(tendency).toMatchObject({ key: "hunger", level: "notice" });
    expect(getStateDrivenLifeTendency({
      hunger: 60,
      fatigue: 20,
      focus: 60,
      inspiration: 60,
      emotionalLoad: 10,
      currentScene: "study",
      runtimePhase: "idle",
      carriedProps: [],
    }, "urgent")).toBeNull();
  });

  it("turns a room-local trace into a quiet echo and keeps it non-actionable", () => {
    const echo = getSceneTraceEcho("terrace-greenery", ["draft-shred", "turtle-last-seen"]);
    expect(echo).toMatchObject({ traceId: "turtle-last-seen", icon: "◉", tone: "playful" });
    const cue = getStateLifeCue("terrace-greenery", {
      hunger: 30,
      fatigue: 30,
      focus: 65,
      inspiration: 70,
      emotionalLoad: 10,
      traceIds: ["turtle-last-seen"],
    });
    expect(cue.id).toBe("trace-whisper:turtle-last-seen");
    expect(cue.action).toBeUndefined();
  });
});
