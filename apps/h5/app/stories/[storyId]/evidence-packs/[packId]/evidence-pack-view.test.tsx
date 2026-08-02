import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidencePackView } from "./evidence-pack-view";

vi.mock("next/navigation", () => ({
  useParams: () => ({
    storyId: "story-evidence-ui",
    packId: "pack-evidence-ui",
  }),
}));

vi.mock("../../../../lib/export-rights-api", () => ({
  fetchEvidencePackDetail: vi.fn().mockResolvedValue({
    pack_id: "pack-evidence-ui",
    story_id: "story-evidence-ui",
    manifest_version: "manifest_v1",
    record_count: 3,
    download_url: "https://example.com/evidence-pack.json",
    records: [
      {
        record_id: "record-001",
        record_type: "audit_log",
        label: "首次风险检查通过",
        created_at: "2026-03-31T00:00:00.000Z",
      },
      {
        record_id: "record-002",
        record_type: "artifact",
        label: "生成 glass-sea.docx",
        created_at: "2026-03-31T00:01:00.000Z",
      },
      {
        record_id: "record-003",
        record_type: "event_log",
        label: "用户确认投稿版导出",
        created_at: "2026-03-31T00:02:00.000Z",
      },
    ],
  }),
}));

describe("evidence pack view", () => {
  it("renders a timeline-style evidence detail surface", async () => {
    render(<EvidencePackView />);

    await waitFor(() => {
      expect(screen.getByTestId("evidence-pack-page").textContent).toContain("证据材料");
    });

    expect(screen.getByTestId("evidence-pack-page").textContent).toContain("证据包详情");
    expect(screen.getByTestId("evidence-pack-page").textContent).toContain("版本");
    expect(screen.getByTestId("evidence-pack-page").textContent).toContain("manifest_v1");
    expect(screen.getByTestId("evidence-pack-page").textContent).toContain("把这次导出的时间线摆出来");
    expect(screen.getByTestId("evidence-records").textContent).toContain("首次风险检查通过");
    expect(screen.getByTestId("evidence-pack-summary").textContent).toContain("留痕清单下载");
  });
});
