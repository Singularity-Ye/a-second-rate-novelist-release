import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelemetryDevView } from "./telemetry-dev-view";
import { fetchTelemetryFeed, fetchTelemetryFunnel } from "../../lib/telemetry-api";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("../../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_id: "account-telemetry-ui",
    account_token: "wx-openid-telemetry-ui",
    target_route: "/room",
    expires_at: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("../../lib/telemetry-api", () => ({
  fetchTelemetryFunnel: vi.fn().mockResolvedValue({
    steps: [
      {
        step_key: "proposal_selected",
        label: "提案被选中",
        event_name: "proposal_selected",
        count: 1,
        completed: true,
        audit_required: true,
        audit_count: 1,
      },
      {
        step_key: "room_hotspot_clicked",
        label: "房间热点点击",
        event_name: "room_hotspot_clicked",
        count: 2,
        completed: true,
        audit_required: false,
        audit_count: 0,
      },
    ],
    totals: {
      event_count: 8,
      audit_log_count: 2,
      completed_step_count: 2,
    },
  }),
  fetchTelemetryFeed: vi.fn().mockResolvedValue({
    events: [
      {
        event_name: "room_hotspot_clicked",
        payload: {
          hotspot_code: "computer",
        },
        created_at: "2026-03-30T14:00:00.000Z",
      },
      {
        event_name: "chapter_accepted",
        payload: {
          story_id: "story-telemetry-ui",
        },
        created_at: "2026-03-30T13:59:00.000Z",
      },
    ],
    audit_logs: [
      {
        event_name: "proposal_selected",
        payload: {
          proposal_no: 1,
        },
        created_at: "2026-03-30T13:58:00.000Z",
      },
      {
        event_name: "chapter_accepted",
        payload: {
          chapter_id: "chapter-telemetry-ui",
        },
        created_at: "2026-03-30T13:57:00.000Z",
      },
    ],
  }),
}));

describe("telemetry dev view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders funnel rollups and recent audit/event feeds for the current account", async () => {
    render(<TelemetryDevView token="fake-token" />);

    await waitFor(() => {
      expect(fetchTelemetryFunnel).toHaveBeenCalledWith("wx-openid-telemetry-ui");
      expect(fetchTelemetryFeed).toHaveBeenCalledWith("wx-openid-telemetry-ui");
      expect(screen.getByTestId("telemetry-funnel-panel").textContent).toContain("proposal_selected");
    });

    expect(screen.getByTestId("telemetry-funnel-panel").textContent).toContain("room_hotspot_clicked");
    expect(screen.getByTestId("telemetry-events-panel").textContent).toContain("computer");
    expect(screen.getByTestId("telemetry-audit-panel").textContent).toContain("chapter_accepted");
  });
});
