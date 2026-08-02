import { describe, expect, it } from "vitest";
import { ForceGraphEngine } from "./force-engine";

describe("force graph engine", () => {
  it("rejects duplicate ids and dangling edges", () => {
    expect(() => new ForceGraphEngine({
      nodes: [{ id: "a", label: "A", type: "character" }, { id: "a", label: "Again", type: "character" }],
      edges: [], width: 400, height: 300,
    })).toThrow(/Duplicate graph node id/);
    expect(() => new ForceGraphEngine({
      nodes: [{ id: "a", label: "A", type: "character" }],
      edges: [{ id: "e", source: "a", target: "missing" }], width: 400, height: 300,
    })).toThrow(/unknown node/);
  });

  it("propagates a drag through first and second hop links", () => {
    const engine = new ForceGraphEngine({
      nodes: [
        { id: "a", label: "A", type: "character", x: 100, y: 150 },
        { id: "b", label: "B", type: "character", x: 220, y: 150 },
        { id: "c", label: "C", type: "character", x: 340, y: 150 },
      ],
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
      ],
      width: 440,
      height: 300,
      tuning: { repelForce: 0.15, centerForce: 0, linkDistance: 120, linkStrength: 0.35 },
    });
    engine.stop();
    const before = Object.fromEntries(engine.getNodes().map((node) => [node.id, { x: node.x, y: node.y }]));
    expect(engine.beginDrag("a")).toBe(true);
    engine.stop();
    engine.dragTo("a", 80, 70);
    engine.tick(90);
    const after = Object.fromEntries(engine.getNodes().map((node) => [node.id, { x: node.x, y: node.y }]));
    expect(Math.hypot(after.b!.x - before.b!.x, after.b!.y - before.b!.y)).toBeGreaterThan(1);
    expect(Math.hypot(after.c!.x - before.c!.x, after.c!.y - before.c!.y)).toBeGreaterThan(0.2);
    expect(engine.endDrag("a")).toBe(true);
    expect(engine.getNodes().find((node) => node.id === "a")?.fx).toBeNull();
    engine.dispose();
  });

  it("updates tuning and emits after a deterministic manual tick batch", () => {
    const engine = new ForceGraphEngine({
      nodes: [{ id: "a", label: "A", type: "event" }, { id: "b", label: "B", type: "event" }],
      edges: [{ id: "ab", source: "a", target: "b" }], width: 400, height: 300,
    });
    engine.stop();
    let ticks = 0;
    const unsubscribe = engine.subscribe(() => ticks++);
    engine.setTuning({ linkDistance: 80, repelForce: 0.2 });
    engine.stop();
    engine.tick(4);
    expect(ticks).toBe(1);
    unsubscribe();
    engine.dispose();
  });

  it("keeps a hydrated pinned node fixed while the surrounding layout settles", () => {
    const engine = new ForceGraphEngine({
      nodes: [
        { id: "anchor", label: "Anchor", type: "place", x: 40, y: 60, pinned: true },
        { id: "moving", label: "Moving", type: "character", x: 260, y: 180 },
      ],
      edges: [{ id: "link", source: "anchor", target: "moving" }],
      width: 400,
      height: 300,
    });
    engine.stop();
    engine.tick(80);
    expect(engine.getNodes().find((node) => node.id === "anchor")).toMatchObject({ x: 40, y: 60, fx: 40, fy: 60 });
    engine.dispose();
  });
});
