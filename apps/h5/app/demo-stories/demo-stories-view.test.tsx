import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoStoriesView } from "./demo-stories-view";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("utm_source=xiaohongshu&invite_code=PHASE0-XHS-001"),
}));

describe("demo stories view", () => {
  it("renders the launch pack cards and preserves tracking into beta links", () => {
    render(<DemoStoriesView />);

    expect(screen.getByTestId("demo-stories-page").textContent).toContain("雨夜列车");
    expect(screen.getByTestId("demo-stories-page").textContent).toContain("星港拾级");
    expect(screen.getByTestId("demo-stories-page").textContent).toContain("倒带告白");

    expect(screen.getByTestId("launch-tracking-strip").textContent).toContain("PHASE0-XHS-001");
    expect(screen.getByRole("link", { name: /用《雨夜列车》这条线继续/ }).getAttribute("href")).toContain(
      "/beta?invite_code=PHASE0-XHS-001",
    );
    expect(screen.getByRole("link", { name: /用《雨夜列车》这条线继续/ }).getAttribute("href")).toContain(
      "demo_story=rain-night-train",
    );
  });
});
