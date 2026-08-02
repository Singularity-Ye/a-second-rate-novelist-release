import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsCaseDeskView } from "./ops-case-desk-view";
import { fetchOpsReviewCases } from "../../lib/ops-api";

vi.mock("../../lib/ops-api", () => ({
  fetchOpsReviewCases: vi.fn().mockResolvedValue({
    items: [
      {
        case_id: "case-export-001",
        case_type: "export_review",
        priority: "P1",
        status: "open",
        entity_type: "export_job",
        entity_id: "export-job-001",
        summary: "需要人工复核导出提醒与标识方式。",
        owner_id: null,
        sla_due_at: "2026-03-31T16:00:00.000Z",
      },
    ],
    counts: {
      open: 1,
      triaged: 0,
      pending_user: 0,
      pending_review: 0,
      resolved: 0,
      rejected: 0,
    },
  }),
}));

describe("ops case desk view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders queue counts, desk guidance, and review cases for the requested case type", async () => {
    render(
      <OpsCaseDeskView
        testId="ops-case-desk-page"
        title="人工导出复核台"
        eyebrow="Export Desk"
        description="把 warn / block / 无显式标识申请收敛到同一条人工复核带。"
        caseType="export_review"
        queueLabel="导出复核"
        checklist={[
          "核对导出目的、标识方式与证据包是否齐全。",
          "需要时回到故事 360 和通知真源继续追踪。",
        ]}
      />,
    );

    await waitFor(() => {
      expect(fetchOpsReviewCases).toHaveBeenCalledWith({
        case_type: "export_review",
      });
    });

    expect(screen.getByTestId("ops-case-desk-page").textContent).toContain("人工导出复核台");
    expect(screen.getByTestId("ops-case-desk-page").textContent).toContain("导出复核");
    expect(screen.getByTestId("ops-case-desk-page").textContent).toContain("需要人工复核导出提醒与标识方式");
  });
});
