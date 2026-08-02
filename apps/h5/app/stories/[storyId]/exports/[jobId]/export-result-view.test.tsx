import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportResultView } from "./export-result-view";
import { exchangeSessionToken } from "../../../../lib/session-bridge";

vi.mock("next/navigation", () => ({
  useParams: () => ({
    storyId: "story-export-ui",
    jobId: "job-export-ui",
  }),
  useSearchParams: () => new URLSearchParams("token=export-result-token"),
}));

vi.mock("../../../../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-openid-export-ui",
  }),
}));

vi.mock("../../../../lib/export-rights-api", () => ({
  fetchExportJobDetail: vi.fn().mockResolvedValue({
    job: {
      job_id: "job-export-ui",
      job_type: "export",
      status: "partial_failed",
      progress_stage: "partial_failed",
      progress_percent: 100,
      notification_id: "notification-ui-001",
      error_code: null,
      error_message: null,
      created_at: "2026-03-31T00:00:00.000Z",
      finished_at: "2026-03-31T00:02:00.000Z",
    },
    artifacts: [
      {
        artifact_id: "artifact-docx",
        format: "docx",
        file_name: "glass-sea.docx",
        file_size_mb: 1.2,
        expires_at: "2020-04-01T00:00:00.000Z",
        download_url: "https://example.com/glass-sea.docx",
        status: "ready",
      },
      {
        artifact_id: "artifact-pdf",
        format: "pdf",
        file_name: "glass-sea.pdf",
        file_size_mb: 1.5,
        expires_at: "2026-05-01T00:00:00.000Z",
        download_url: "https://example.com/glass-sea.pdf",
        status: "ready",
      },
    ],
    risk_summary: {
      result: "warn",
      issue_codes: ["CMP-005"],
      warning_count: 1,
      blocked_reason_codes: [],
    },
    label_mode_effective: "embedded_notice",
    control_result: {
      verdict: "warn",
      blocking: false,
      label_mode_effective: "embedded_notice",
      label_decision_state: "waiver_pending",
      required_actions: ["submit_label_waiver"],
      issue_codes: ["CMP-005"],
    },
    risk_report: {
      risk_check_id: "risk-ui-001",
      result: "warn",
      download_url: "https://example.com/risk-report",
    },
    delivery_manifest: {
      manifest_id: "delivery-ui-001",
      manifest_version: "delivery_manifest_v1",
      download_url: "https://example.com/delivery-manifest",
    },
    export_manifest: {
      artifact_type: "export_manifest",
      download_url: "https://example.com/export-manifest",
    },
    evidence_bundle: {
      pack_id: "pack-ui-001",
      download_url: "https://example.com/evidence-pack",
    },
    evidence_pack_id: "pack-ui-001",
    rights_statement_url: "https://example.com/rights-statement",
  }),
}));

describe("export result view", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("renders recovery guidance for partially successful and expired export artifacts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-15T00:00:00.000Z"));

    render(<ExportResultView />);

    await waitFor(() => {
      expect(screen.getByTestId("export-result-page").textContent).toContain("权利服务回执");
      expect(exchangeSessionToken).toHaveBeenCalledWith("export-result-token");
    });

    expect(screen.getByTestId("export-summary").textContent).toContain("部分成功");
    expect(screen.getByTestId("export-artifacts").textContent).toContain("docx");
    expect(screen.getByTestId("export-artifacts").textContent).toContain("pdf");
    expect(screen.getByTestId("export-result-page").textContent).toContain("作品说明与标识");
    expect(screen.getByTestId("export-evidence-link").textContent).toContain("查看证据包");
    expect(screen.getByTestId("export-rights-statement").textContent).toContain("查看作品说明");
    expect(screen.getByTestId("export-recovery-panel").textContent).toContain("重新补齐缺失文件");
    expect(screen.getByTestId("export-recovery-panel").textContent).toContain("部分文件已过期");
    expect(screen.getByTestId("export-recovery-panel").textContent).toContain("查看通知");
    expect(screen.getByTestId("export-result-page").textContent).toContain("风险结论");
    expect(screen.getByTestId("export-result-page").textContent).toContain("实际标识方式");
    expect(screen.getByTestId("export-result-page").textContent).toContain("默认嵌入标识");
    expect(screen.getByTestId("export-result-page").textContent).toContain("风险报告");
    expect(screen.getByTestId("export-result-page").textContent).toContain("交付清单");
    expect(screen.getByTestId("export-result-page").textContent).toContain("留痕清单");
    expect(screen.getByRole("link", { name: "下载 PDF" }).getAttribute("href")).toBe("https://example.com/glass-sea.pdf");
    expect(screen.getByRole("link", { name: "查看留痕清单" }).getAttribute("href")).toBe("https://example.com/export-manifest");
    expect(screen.getByRole("link", { name: "查看通知" }).getAttribute("href")).toBe("/notifications");
    expect(screen.getByRole("link", { name: "查看通知" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "查看通知" }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByTestId("export-result-page").textContent).not.toContain("example.com");
  });
});
