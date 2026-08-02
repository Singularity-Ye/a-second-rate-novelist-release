import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryExportsView } from "./story-exports-view";
import {
  createExportJob,
  createRiskCheck,
  fetchExportCapabilities,
  fetchStoryExports,
  submitLabelWaiverRequest,
} from "../../../lib/export-rights-api";
import { exchangeSessionToken } from "../../../lib/session-bridge";

vi.mock("next/navigation", () => ({
  useParams: () => ({
    storyId: "story-export-ui",
  }),
  useSearchParams: () => new URLSearchParams("token=export-token-ui"),
}));

vi.mock("../../../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-openid-export-ui",
  }),
}));

vi.mock("../../../lib/export-rights-api", () => ({
  fetchStoryExports: vi.fn().mockResolvedValue({
    jobs: [
      {
        job_id: "job-ui-001",
        story_id: "story-export-ui",
        export_purpose: "submission",
        requested_formats: ["docx"],
        status: "succeeded",
        created_at: "2026-03-31T00:00:00.000Z",
        evidence_pack_id: "pack-ui-001",
      },
    ],
  }),
  fetchExportCapabilities: vi.fn().mockResolvedValue({
    story_id: "story-export-ui",
    workspace_status: "ready",
    export_allowed: true,
    allowed_formats: ["docx", "pdf", "md"],
    blocked_branch_ids: [],
    quota: {
      remaining_exports_this_period: 3,
      rights_pack_remaining: 1,
    },
    label_options: ["embedded_notice", "label_waiver_requested"],
    latest_risk_summary: null,
    latest_evidence_pack_id: "pack-ui-001",
  }),
  createRiskCheck: vi.fn().mockResolvedValue({
    risk_check_id: "risk-ui-001",
    result: "warn",
    issues: [],
    required_actions: ["submit_label_waiver"],
    valid_until: "2026-03-31T01:00:00.000Z",
    evidence_entry_id: "evidence-ui-001",
    risk_report: {
      report_id: "risk-report-ui-001",
      risk_check_id: "risk-ui-001",
      manifest_version: "risk_report_v1",
      result: "warn",
      label_mode_requested: "label_waiver_requested",
      issues: [],
      required_actions: ["submit_label_waiver"],
      valid_until: "2026-03-31T01:00:00.000Z",
      created_at: "2026-03-31T00:00:00.000Z",
      download_url: "https://example.com/risk-report",
    },
  }),
  createExportJob: vi.fn().mockResolvedValue({
    job_id: "job-ui-created",
    status: "partial_failed",
    progress_stage: "partial_failed",
    notification_id: "notification-ui-001",
    next_action: "download_available_artifacts",
    estimated_ready_at: "2026-03-31T01:05:00.000Z",
  }),
  submitLabelWaiverRequest: vi.fn().mockResolvedValue({
    waiver_request_id: "waiver-ui-001",
    status: "pending_user_consent",
    consent_version: "m3-label-waiver-v1",
    retained_until: "2026-09-30T00:00:00.000Z",
    ops_case_id: null,
  }),
}));

describe("story exports view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("requires protocol confirmation before submitting a waiver and shows the retained evidence summary", async () => {
    render(<StoryExportsView />);

    await waitFor(() => {
      expect(fetchExportCapabilities).toHaveBeenCalledWith("story-export-ui");
      expect(fetchStoryExports).toHaveBeenCalledWith("story-export-ui");
      expect(exchangeSessionToken).toHaveBeenCalledWith("export-token-ui");
    });

    expect(screen.getByTestId("story-exports-page").textContent).toContain("作品权利服务");
    expect(screen.getByTestId("story-exports-page").textContent).toContain("风险与标识");
    expect(screen.getByTestId("story-exports-page").textContent).toContain("平台提供的是权利服务，不是版权承诺");
    expect(screen.getByTestId("story-exports-page").textContent).not.toContain("Rights Service Desk");
    expect(screen.getByTestId("story-exports-page").textContent).not.toContain("Wizard");
    expect(screen.getByRole("link", { name: "回到故事中枢" }).getAttribute("href")).toBe("/stories/story-export-ui");
    expect(screen.getByRole("link", { name: "回到故事中枢" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "查看最新证据包" }).getAttribute("href")).toBe(
      "/stories/story-export-ui/evidence-packs/pack-ui-001",
    );
    expect(screen.getByRole("link", { name: "查看最新证据包" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: /已完成/ }).getAttribute("href")).toBe(
      "/stories/story-export-ui/exports/job-ui-001",
    );
    expect(screen.getByRole("link", { name: /已完成/ }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "举报与求助" }).getAttribute("href")).toContain("/report/new?surface=export");
    expect(screen.getByRole("link", { name: "举报与求助" }).getAttribute("href")).toContain("story_id=story-export-ui");
    expect(screen.getByRole("link", { name: "举报与求助" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "举报与求助" }).getAttribute("href")).not.toContain("token=");
    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).toContain("/feedback?surface=export");
    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).toContain("story_id=story-export-ui");
    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "反馈与求助" }).getAttribute("href")).not.toContain("token=");

    fireEvent.click(screen.getByRole("button", { name: /投稿/ }));
    fireEvent.click(screen.getByRole("button", { name: /准备申请无显式标识/ }));
    fireEvent.click(screen.getByRole("button", { name: "先跑风险检查" }));
    await waitFor(() => {
      expect(createRiskCheck).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText("我已理解这些风险"));
    fireEvent.click(screen.getByRole("button", { name: "提交这次导出" }));
    await waitFor(() => {
      expect(createExportJob).toHaveBeenCalledWith(
        expect.objectContaining({
          risk_acknowledged: true,
        }),
      );
    });

    expect(screen.getByTestId("story-exports-page").textContent).toContain("协议版本 m3-label-waiver-v1");
    expect(screen.getByTestId("story-exports-page").textContent).toContain("留存不少于 180 天");
    expect(screen.getByTestId("story-exports-page").textContent).toContain("下载风险回执");
    expect(screen.getByTestId("story-exports-page").textContent).not.toContain("private_workshop");

    const waiverButton = screen.getByRole("button", { name: "申请无显式标识" });
    expect(waiverButton).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("我确认下载、发布或商业使用责任由我承担"));
    fireEvent.click(screen.getByLabelText("我理解平台提供的是作品权利服务，不是版权承诺"));
    fireEvent.click(screen.getByLabelText("我同意按协议版本留痕保存不少于 180 天"));

    expect(waiverButton).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "申请无显式标识" }));
    await waitFor(() => {
      expect(submitLabelWaiverRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          user_acknowledgements: [
            "ack-download-distribution-responsibility",
            "ack-platform-rights-service-only",
            "ack-180-day-retention",
          ],
        }),
      );
    });

    expect(screen.getByTestId("story-exports-waiver-state").textContent).toContain("等待最终确认");
    expect(screen.getByTestId("story-exports-waiver-state").textContent).toContain("m3-label-waiver-v1");
    expect(screen.getByTestId("story-exports-waiver-state").textContent).toContain("waiver-ui-001");
  });

  it("falls back to frontstage copy when the export surface fails to load", async () => {
    vi.mocked(fetchExportCapabilities).mockRejectedValueOnce(new Error("Failed to fetch"));

    render(<StoryExportsView />);

    await waitFor(() => {
      expect(screen.getByText("这次权利服务页还没打开，请稍后再试一次。")).toBeTruthy();
    });

    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });
});
