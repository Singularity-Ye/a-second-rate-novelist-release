import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersSearchView } from "./users-search-view";
import { fetchOpsUsers } from "../../lib/ops-api";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=wx-openid-ops-001&membership_tier=plus&has_open_case=true"),
}));

vi.mock("../../lib/ops-api", () => ({
  fetchOpsUsers: vi.fn().mockResolvedValue({
    items: [
      {
        user_id: "account-ops-001",
        display_name: "wx-openid-ops-001",
        primary_channel: "wechat",
        membership_tier: "plus",
        active_story_count: 1,
        last_seen_at: "2026-03-31T01:00:00.000Z",
        pii_masked: true,
      },
    ],
    next_cursor: null,
  }),
}));

describe("ops users search view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders masked user results and drill-down links", async () => {
    render(<UsersSearchView />);

    await waitFor(() => {
      expect(fetchOpsUsers).toHaveBeenCalledWith({
        q: "wx-openid-ops-001",
        membership_tier: "plus",
        has_open_case: true,
      });
    });

    expect(screen.getByTestId("ops-users-page").textContent).toContain("wx-openid-ops-001");
    expect(screen.getByTestId("ops-users-page").textContent).toContain("true");
  });
});
