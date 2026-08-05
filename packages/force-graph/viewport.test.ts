import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPH_TUNING } from "./types";
import { SmoothGraphViewport, normalizeWheelDelta } from "./viewport";

describe("smooth graph viewport", () => {
  it("normalizes pixel, line, and page wheel delta", () => {
    expect(normalizeWheelDelta(10, 0, 400)).toBe(10);
    expect(normalizeWheelDelta(10, 1, 400)).toBe(160);
    expect(normalizeWheelDelta(2, 2, 400)).toBe(800);
  });

  it("keeps the cursor world anchor stable while accumulating a target scale", () => {
    const viewport = new SmoothGraphViewport(DEFAULT_GRAPH_TUNING);
    const before = viewport.snapshot().target;
    const mouse = { x: 320, y: 180 };
    const worldBefore = { x: (mouse.x - before.x) / before.k, y: (mouse.y - before.y) / before.k };
    viewport.applyWheel({ deltaY: -420, deltaMode: 0, mouseX: mouse.x, mouseY: mouse.y, pageHeight: 430 });
    const after = viewport.snapshot().target;
    const worldAfter = { x: (mouse.x - after.x) / after.k, y: (mouse.y - after.y) / after.k };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
  });

  it("passes through monotonic intermediate frames instead of jumping", () => {
    const viewport = new SmoothGraphViewport(DEFAULT_GRAPH_TUNING);
    viewport.applyWheel({ deltaY: -520, deltaMode: 0, mouseX: 350, mouseY: 215, pageHeight: 430 });
    const target = viewport.snapshot().target.k;
    const samples = Array.from({ length: 8 }, () => viewport.step(16).actual.k);
    expect(samples.every((value, index) => index === 0 || value > samples[index - 1]!)).toBe(true);
    expect(samples.slice(0, 4).every((value) => value > 1 && value < target)).toBe(true);
  });

  it("honors reduced motion and keeps pan target synchronized", () => {
    const viewport = new SmoothGraphViewport(DEFAULT_GRAPH_TUNING);
    viewport.applyWheel({ deltaY: -300, deltaMode: 0, mouseX: 100, mouseY: 80, pageHeight: 430 });
    const reduced = viewport.step(16, true);
    expect(reduced.actual).toEqual(reduced.target);
    const panned = viewport.panTo(42, -18);
    expect(panned.actual).toEqual(panned.target);
  });
});
