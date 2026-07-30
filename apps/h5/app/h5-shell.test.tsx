import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CONTEXT_UPDATED_EVENT } from "./lib/account-surface-session";
import { H5Shell } from "./h5-shell";

let mockPathname = "/room";
let mockSearchParams = new URLSearchParams("token=deep-link-token&account_token=account-001");
const useSearchParamsMock = vi.fn(() => mockSearchParams);

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => useSearchParamsMock(),
}));

describe("h5 shell", () => {
  beforeEach(() => {
    useSearchParamsMock.mockClear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/room");
  });

  afterEach(() => {
    mockPathname = "/room";
    mockSearchParams = new URLSearchParams("token=deep-link-token&account_token=account-001");
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/room");
  });

  it("renders the three-tab shell with clean share-safe links", () => {
    render(
      <H5Shell>
        <div>child</div>
      </H5Shell>,
    );

    expect(screen.getByText("child")).not.toBeNull();
    expect(screen.getByRole("link", { name: "房间" }).getAttribute("href")).toBe("/room");
    expect(screen.getByRole("link", { name: "书架" }).getAttribute("href")).toBe("/stories");
    expect(screen.getByRole("link", { name: "我的" }).getAttribute("href")).toBe("/profile");
    expect(screen.getByRole("link", { name: "房间" }).getAttribute("data-active")).toBe("true");
  });

  it("removes the main tab shell from non-product surfaces", () => {
    mockPathname = "/archive/profile";

    render(
      <H5Shell>
        <div>history-only child</div>
      </H5Shell>,
    );

    expect(screen.getByText("history-only child")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "房间" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
  });

  it("isolates vNext before reading legacy query or session context", () => {
    mockPathname = "/vnext";

    const { rerender } = render(
      <H5Shell>
        <div>vNext room</div>
      </H5Shell>,
    );

    expect(screen.getByText("vNext room")).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
    expect(useSearchParamsMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-shell-mode="vnext-isolated"]')).not.toBeNull();

    mockPathname = "/vnext/draft";
    rerender(
      <H5Shell>
        <div>vNext draft</div>
      </H5Shell>,
    );
    expect(screen.getByText("vNext draft")).not.toBeNull();
    expect(useSearchParamsMock).not.toHaveBeenCalled();
  });

  it("keeps shell links clean after session-context updates", () => {
    mockPathname = "/feedback";
    mockSearchParams = new URLSearchParams("account_token=wx-legacy-account&story_id=story-legacy-001");
    window.history.replaceState({}, "", "/feedback?account_token=wx-legacy-account&story_id=story-legacy-001");

    render(
      <H5Shell>
        <div>feedback child</div>
      </H5Shell>,
    );

    expect(screen.getByRole("link", { name: "房间" }).getAttribute("href")).toBe("/room");
    expect(screen.getByRole("link", { name: "书架" }).getAttribute("href")).toBe("/stories");
    expect(screen.getByRole("link", { name: "我的" }).getAttribute("href")).toBe("/profile");

    act(() => {
      window.history.replaceState({}, "", "/feedback?story_id=story-legacy-001&token=issued-shell-token");
      window.dispatchEvent(new Event(SESSION_CONTEXT_UPDATED_EVENT));
    });

    expect(screen.getByRole("link", { name: "房间" }).getAttribute("href")).toBe("/room");
    expect(screen.getByRole("link", { name: "书架" }).getAttribute("href")).toBe("/stories");
    expect(screen.getByRole("link", { name: "我的" }).getAttribute("href")).toBe("/profile");
  });
});
