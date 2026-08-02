import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SceneForegroundOcclusion } from "./scene-foreground";

describe("formal scene foreground occlusion", () => {
  afterEach(() => cleanup());

  it("uses the final user chair as an invisible mask while the mother scene owns visible furniture", () => {
    render(
      <SceneForegroundOcclusion
        sceneId="study"
        foregroundOcclusionPolicy="none"
        visible
      >
        <span data-testid="actor-probe" />
      </SceneForegroundOcclusion>,
    );

    const stage = screen.getByTestId("scene-foreground-occlusion");
    expect(stage.getAttribute("data-foreground-policy")).toBe("none");
    expect(stage.getAttribute("data-layer-count")).toBe("1");
    expect(stage.getAttribute("data-mask-enabled")).toBe("true");
    expect(stage.getAttribute("data-visible-foreground")).toBe("false");
    expect(stage.getAttribute("style")).toContain("study-chair-cutout-2x1-user-v1.webp");
    expect(stage.querySelector("img")).toBeNull();
    expect(screen.getByTestId("actor-probe")).toBeTruthy();
  });

  it("composes desk and chair alpha sources without painting either transparent asset", () => {
    render(
      <SceneForegroundOcclusion
        sceneId="study"
        foregroundOcclusionPolicy="desk-foreground"
        visible
      />,
    );

    const stage = screen.getByTestId("scene-foreground-occlusion");
    const style = stage.getAttribute("style") ?? "";
    expect(stage.getAttribute("data-layer-count")).toBe("2");
    expect(style).toContain("study-desk-table-cutout-2x1-imagegen-v2.webp");
    expect(style).toContain("study-chair-cutout-2x1-user-v1.webp");
    expect(style).toContain("subtract");
    expect(style).not.toContain("destination-out");
    expect(stage.querySelector("img")).toBeNull();
  });

  it("does not activate a study mask for another scene or when the actor is hidden", () => {
    const { rerender } = render(
      <SceneForegroundOcclusion
        sceneId="bedroom"
        foregroundOcclusionPolicy="desk-foreground"
        visible
      />,
    );
    expect(screen.getByTestId("scene-foreground-occlusion").getAttribute("data-layer-count")).toBe("0");
    expect(screen.getByTestId("scene-foreground-occlusion").querySelector("img")).toBeNull();

    rerender(
      <SceneForegroundOcclusion
        sceneId="study"
        foregroundOcclusionPolicy="desk-foreground"
        visible={false}
      />,
    );
    const stage = screen.getByTestId("scene-foreground-occlusion");
    expect(stage.getAttribute("data-layer-count")).toBe("0");
    expect(stage.getAttribute("data-mask-enabled")).toBe("false");
    expect(stage.getAttribute("style")).toBeNull();
  });

  it("keeps the bedroom furniture contract mask-only", () => {
    render(
      <SceneForegroundOcclusion
        sceneId="bedroom"
        foregroundOcclusionPolicy="bedroom-foreground"
        visible
      />,
    );

    const stage = screen.getByTestId("scene-foreground-occlusion");
    expect(stage.getAttribute("data-foreground-policy")).toBe("bedroom-foreground");
    expect(stage.getAttribute("data-layer-count")).toBe("1");
    expect(stage.getAttribute("style")).toContain("bedroom-bed-occluder-aligned-v1.webp");
    expect(stage.querySelector("img")).toBeNull();
  });
});
