import { describe, expect, it } from "vitest";
import { chooseGraphQuality, GraphQualityController } from "./adaptive-quality";

describe("adaptive graph quality", () => {
  it("keeps a small healthy graph on the cinematic SVG renderer", () => {
    expect(chooseGraphQuality({ nodeCount: 50, edgeCount: 60, visibleAvatarCount: 8 })).toMatchObject({ level: "cinematic", renderer: "svg", avatarResolution: 96 });
  });

  it("moves medium and large graphs to Sigma with progressively cheaper labels and avatars", () => {
    expect(chooseGraphQuality({ nodeCount: 300, edgeCount: 420, visibleAvatarCount: 80 })).toMatchObject({ level: "balanced", renderer: "sigma", avatarMode: "visible" });
    expect(chooseGraphQuality({ nodeCount: 1_000, edgeCount: 1_600, visibleAvatarCount: 300 })).toMatchObject({ level: "dense", renderer: "sigma", pixelRatioCap: 1 });
    expect(chooseGraphQuality({ nodeCount: 5_000, edgeCount: 7_000, visibleAvatarCount: 1_000 })).toMatchObject({ level: "atlas", renderer: "sigma", propagationDepth: 0 });
  });

  it("degrades on measured frame pressure or constrained devices and does not let quality preference ignore a bad frame budget", () => {
    expect(chooseGraphQuality({ nodeCount: 50, edgeCount: 60, visibleAvatarCount: 8, deviceMemoryGiB: 4, devicePixelRatio: 3 })).toMatchObject({ level: "balanced" });
    expect(chooseGraphQuality({ nodeCount: 300, edgeCount: 420, visibleAvatarCount: 80, p95FrameMs: 38, preference: "quality" })).toMatchObject({ level: "atlas" });
  });

  it("degrades immediately but waits for sustained healthy samples before recovering", () => {
    const controller = new GraphQualityController({ recoverySamples: 3 });
    const base = { nodeCount: 300, edgeCount: 420, visibleAvatarCount: 80 };
    expect(controller.sample(base).level).toBe("balanced");
    expect(controller.sample({ ...base, p95FrameMs: 38 }).level).toBe("atlas");
    expect(controller.sample(base).level).toBe("atlas");
    expect(controller.sample(base).level).toBe("atlas");
    expect(controller.sample(base).level).toBe("balanced");
  });

  it("cancels recovery when pressure returns", () => {
    const controller = new GraphQualityController({ recoverySamples: 2 });
    const base = { nodeCount: 300, edgeCount: 420, visibleAvatarCount: 80 };
    controller.sample({ ...base, p95FrameMs: 38 });
    expect(controller.sample(base).level).toBe("atlas");
    expect(controller.sample({ ...base, p95FrameMs: 38 }).level).toBe("atlas");
    expect(controller.sample(base).level).toBe("atlas");
  });
});
