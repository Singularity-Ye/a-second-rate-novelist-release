import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusView } from "./sync-status-view";
import { createChannelBinding, fetchSyncStatus, resolveSyncConflict } from "../../../lib/account-membership-api";
import { issueSessionToken } from "../../../lib/session-bridge";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("account_token=wx-openid-sync-ui"),
}));

vi.mock("../../../lib/session-bridge", () => ({
  issueSessionToken: vi.fn().mockResolvedValue({
    token: "issued-sync-ui-token",
    expires_at: "2026-04-18T00:30:00.000Z",
    target_route: "/profile/account/sync",
  }),
}));

vi.mock("../../../lib/account-membership-api", () => ({
  fetchSyncStatus: vi
    .fn()
    .mockResolvedValueOnce({
      account_id: "account-sync-ui",
      device_count: 1,
      active_devices: [
        {
          device_id: "wechat-ui",
          device_type: "wechat",
          last_active_at: "2026-03-31T01:00:00.000Z",
        },
      ],
      pending_conflict_count: 0,
      sync_health: "healthy",
      offline_changes_count: 0,
      pending_conflicts: [],
    })
    .mockResolvedValueOnce({
      account_id: "account-sync-ui",
      device_count: 2,
      active_devices: [
        {
          device_id: "wechat-ui",
          device_type: "wechat",
          last_active_at: "2026-03-31T01:00:00.000Z",
        },
        {
          device_id: "web-ui",
          device_type: "web",
          last_active_at: "2026-03-31T01:05:00.000Z",
        },
      ],
      pending_conflict_count: 1,
      sync_health: "degraded",
      offline_changes_count: 0,
      pending_conflicts: [
        {
          conflict_id: "conflict-ui-001",
          object_type: "chapter",
          status: "user_action_required",
        },
      ],
    })
    .mockResolvedValue({
      account_id: "account-sync-ui",
      device_count: 2,
      active_devices: [
        {
          device_id: "wechat-ui",
          device_type: "wechat",
          last_active_at: "2026-03-31T01:00:00.000Z",
        },
        {
          device_id: "web-ui",
          device_type: "web",
          last_active_at: "2026-03-31T01:05:00.000Z",
        },
      ],
      pending_conflict_count: 1,
      sync_health: "degraded",
      offline_changes_count: 0,
      pending_conflicts: [
        {
          conflict_id: "conflict-ui-001",
          object_type: "chapter",
          status: "user_action_required",
        },
      ],
    }),
  createChannelBinding: vi.fn().mockResolvedValue({
    binding_id: "binding-ui-001",
    status: "verified",
    is_primary: false,
    recovery_enabled: true,
  }),
  resolveSyncConflict: vi.fn().mockResolvedValue({
    conflict_id: "conflict-ui-001",
    status: "resolved",
    resulting_branch_id: "branch-ui-001",
    evidence_entry_id: "evidence-ui-001",
  }),
}));

describe("sync status view", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("renders sync health, binds a new device surface, and keeps explicit conflict resolution", async () => {
    render(<SyncStatusView />);

    await waitFor(() => {
      expect(issueSessionToken).toHaveBeenCalledWith({
        account_token: "wx-openid-sync-ui",
        target_route: "/profile/account/sync",
      });
      expect(fetchSyncStatus).toHaveBeenCalledWith("wx-openid-sync-ui");
    });

    await waitFor(() => {
      expect(screen.getByTestId("sync-status-page").textContent).toContain("让设备接力，而不是互相覆盖");
      expect(screen.getByTestId("sync-status-page").textContent).toContain("同步健康");
      expect(screen.getByTestId("sync-status-page").textContent).toContain("微信");
    });

    fireEvent.click(screen.getByRole("button", { name: "接入 Web 续写端" }));
    await waitFor(() => {
      expect(createChannelBinding).toHaveBeenCalledWith({
        account_token: "wx-openid-sync-ui",
        channel: "web",
        provider_user_id: "web-wx-openid-sync-ui-self-serve",
        set_as_primary: false,
      });
      expect(screen.getByTestId("channel-binding-state").textContent).toContain("Web");
      expect(screen.getByTestId("sync-status-page").textContent).toContain("待处理冲突");
    });

    fireEvent.click(screen.getByRole("button", { name: "为这次冲突开分支" }));
    await waitFor(() => {
      expect(resolveSyncConflict).toHaveBeenCalled();
    });
  });
});
