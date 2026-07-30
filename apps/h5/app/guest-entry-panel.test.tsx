import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestEntryPanel } from "./guest-entry-panel";
import { primeFrontstageSessionFromHref } from "./lib/account-surface-session";
import { createGuestRoomSession } from "./lib/guest-session";

const push = vi.fn();
let mockSearchParams = new URLSearchParams("from=room");

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("./lib/account-surface-session", () => ({
  primeFrontstageSessionFromHref: vi.fn(),
}));

vi.mock("./lib/guest-session", () => ({
  createGuestRoomSession: vi.fn().mockResolvedValue("/room?token=guest-token-ui&routeDecisionId=route-room-ui"),
}));

describe("guest entry panel", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams("from=room");
  });

  it("primes session storage and preserves token-bearing room navigation on guest entry", async () => {
    render(<GuestEntryPanel title="先从房间开始" description="第一次来先从这里进门。" />);

    fireEvent.click(screen.getByRole("button", { name: "先去房间里看看" }));

    await waitFor(() => {
      expect(createGuestRoomSession).toHaveBeenCalled();
      expect(primeFrontstageSessionFromHref).toHaveBeenCalledWith("/room?token=guest-token-ui&routeDecisionId=route-room-ui");
      expect(push).toHaveBeenCalledWith("/room?token=guest-token-ui&routeDecisionId=route-room-ui");
    });
  });

  it("keeps bookshelf and profile fallback links human-readable", () => {
    render(<GuestEntryPanel title="先从房间开始" description="第一次来先从这里进门。" />);

    expect(screen.getByText("第一次来这里")).not.toBeNull();
    expect(screen.getByRole("link", { name: "去书架看看" }).getAttribute("href")).toBe("/stories");
    expect(screen.getByRole("link", { name: "打开我的" }).getAttribute("href")).toBe("/profile");
  });
});
