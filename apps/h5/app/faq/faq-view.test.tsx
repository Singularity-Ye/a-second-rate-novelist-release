import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FaqView } from "./faq-view";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("utm_campaign=phase0_xiaohongshu_kol&invite_code=PHASE0-XHS-001"),
}));

describe("faq view", () => {
  it("renders the public faq and keeps launch tracking on the beta CTA", () => {
    render(<FaqView />);

    expect(screen.getByTestId("faq-page").textContent).toContain("默认私密");
    expect(screen.getByTestId("faq-page").textContent).toContain("作品标识");
    expect(screen.getByTestId("launch-tracking-strip").textContent).toContain("phase0_xiaohongshu_kol");
    expect(screen.getByRole("link", { name: /查看邀请入口说明/ }).getAttribute("href")).toContain(
      "/beta?invite_code=PHASE0-XHS-001",
    );
  });
});
