import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewsView } from "./reviews-view";
import { fetchOpsReviewCases } from "../../lib/ops-api";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("case_type=export_review&status=open"),
}));

vi.mock("../../lib/ops-api", () => ({
  fetchOpsReviewCases: vi.fn().mockResolvedValue({
    items: [
      {
        case_id: "case-ops-001",
        case_type: "export_review",
        priority: "P1",
        status: "open",
        entity_type: "risk_check",
        entity_id: "risk-001",
        summary: "需要 reviewer 复核导出提醒。",
        owner_id: null,
        sla_due_at: "2026-03-31T04:00:00.000Z",
      },
    ],
    counts: {
      open: 1,
      pending_review: 0,
      pending_user: 0,
      resolved: 0,
    },
  }),
}));

describe("ops reviews view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders queue counts and pending review cases", async () => {
    render(<ReviewsView />);

    await waitFor(() => {
      expect(fetchOpsReviewCases).toHaveBeenCalledWith({
        case_type: "export_review",
        status: "open",
      });
    });

    expect(screen.getByTestId("ops-reviews-page").textContent).toContain("export_review");
    expect(screen.getByTestId("ops-review-counts").textContent).toContain("1");
  });
});
