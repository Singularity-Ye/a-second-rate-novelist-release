import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeEntryView } from "./home-entry-view";
import { createGuestChatSession } from "./lib/guest-session";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
  useSearchParams: () => new URLSearchParams("invite_code=PHASE0-XHS-001&utm_source=xiaohongshu"),
}));

vi.mock("./lib/guest-session", () => ({
  createGuestChatSession: vi.fn().mockResolvedValue("http://127.0.0.1:3000/chat?token=guest-chat-token"),
}));

describe("home entry view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("starts an immediate guest chat session from the first-visit landing page", async () => {
    window.sessionStorage.clear();
    render(<HomeEntryView />);
    const supportSection = screen.getByTestId("home-entry-support");

    expect(screen.getByRole("button", { name: "立即开始" })).toBeTruthy();
    expect(screen.queryByTestId("home-entry-launch-links")).toBeNull();
    expect(within(supportSection).getByRole("button").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("home-entry-primary-outcome").textContent).toContain("读者档案");
    expect(screen.getByTestId("home-entry-primary-outcome").textContent).toContain("故事方向");

    fireEvent.click(within(supportSection).getByRole("button"));

    expect(within(supportSection).getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("home-entry-launch-links").textContent).toContain("邀请入口说明");
    expect(screen.getByRole("link", { name: /查看示范故事/ }).getAttribute("href")).toContain(
      "/demo-stories?invite_code=PHASE0-XHS-001&utm_source=xiaohongshu",
    );
    expect(screen.getByRole("link", { name: /查看使用说明/ }).getAttribute("href")).toContain(
      "/faq?invite_code=PHASE0-XHS-001&utm_source=xiaohongshu",
    );

    fireEvent.click(screen.getByRole("button", { name: "立即开始" }));

    await waitFor(() => {
      expect(createGuestChatSession).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/chat");
    });

    expect(window.sessionStorage.getItem("erliu.frontstage.session")).toContain("guest-chat-token");

    expect(screen.queryByRole("button", { name: "进入游客房间" })).toBeNull();
    expect(screen.getByRole("link", { name: /先看游客房间/ }).getAttribute("href")).toContain(
      "/room?invite_code=PHASE0-XHS-001&utm_source=xiaohongshu",
    );
  });

  it("falls back to frontstage copy when immediate-start fails with a raw network error", async () => {
    vi.mocked(createGuestChatSession).mockRejectedValueOnce(new Error("Failed to fetch"));

    render(<HomeEntryView />);

    fireEvent.click(screen.getByRole("button", { name: "立即开始" }));

    await waitFor(() => {
      expect(screen.getByText("这次入口没接稳，回到上一页再进一次就好。")).toBeTruthy();
    });

    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });

  it("keeps support links folded until the reader explicitly expands them", () => {
    render(<HomeEntryView />);
    const supportSection = screen.getByTestId("home-entry-support");

    expect(screen.queryByRole("link", { name: "查看示范故事" })).toBeNull();
    expect(screen.queryByRole("link", { name: "查看邀请入口说明" })).toBeNull();
    expect(screen.queryByRole("link", { name: "先看游客房间" })).toBeNull();

    fireEvent.click(within(supportSection).getByRole("button"));

    expect(screen.getByRole("link", { name: /查看示范故事/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /查看邀请入口说明/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /先看游客房间/ })).toBeTruthy();
  });
});
