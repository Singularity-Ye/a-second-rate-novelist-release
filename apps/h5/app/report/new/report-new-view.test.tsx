import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportNewView } from "./report-new-view";
import { exchangeSessionToken } from "../../lib/session-bridge";
import {
  createReportCase,
  fetchTrustLegalSummary,
  listReportCases,
} from "../../lib/reporting-case-api";

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      "token=report-token-ui&surface=reader&target_type=story_chapter&target_id=chapter-report-ui&target_label=%E7%AC%AC%E4%B8%80%E7%AB%A0",
    ),
}));

vi.mock("../../lib/session-bridge", () => ({
  exchangeSessionToken: vi.fn().mockResolvedValue({
    account_token: "wx-openid-report-ui",
  }),
}));

vi.mock("../../lib/reporting-case-api", () => ({
  fetchTrustLegalSummary: vi.fn().mockResolvedValue({
    documents: [
      { slug: "terms", title: "服务协议", url: "/legal/terms", version: "2026-04-03" },
      { slug: "privacy", title: "隐私政策", url: "/legal/privacy", version: "2026-04-03" },
      { slug: "aigc", title: "作品标识说明", url: "/legal/aigc", version: "2026-04-03" },
    ],
    reporting_entry: {
      new_case_url: "/report/new",
      history_url: "/report/new?tab=history",
      default_privacy_copy: "所有内容默认私密，仅在处理举报时按最小必要范围调阅。",
      sla_copy: "P0 4 小时内受理，P1 24 小时内反馈。",
      contact_copy: "统一举报入口可回看处理进度与通知。",
    },
  }),
  listReportCases: vi.fn().mockResolvedValue({
    items: [
      {
        case_type: "public_report",
        case_id: "report-case-ui-001",
        ops_case_id: "ops-report-case-ui-001",
        status: "pending_user",
        category: "content_safety",
        summary: "需要补充截图",
        latest_status_note: "请补充截图与段落位置。",
        created_at: "2026-04-03T00:00:00.000Z",
        updated_at: "2026-04-03T00:30:00.000Z",
        sla_due_at: "2026-04-03T04:00:00.000Z",
        target_route: "/report/new?tab=history",
        legal_links: {
          terms_url: "/legal/terms",
          privacy_url: "/legal/privacy",
          aigc_url: "/legal/aigc",
        },
      },
      {
        case_type: "export_review",
        case_id: "ops-case-ui-export-review",
        ops_case_id: "ops-case-ui-export-review",
        status: "under_review",
        summary: "导出风险检查需要 reviewer 复核。",
        latest_status_note: "等待 reviewer 决定是否继续投稿导出。",
        created_at: "2026-04-03T00:10:00.000Z",
        updated_at: "2026-04-03T00:40:00.000Z",
        sla_due_at: "2026-04-03T04:10:00.000Z",
        target_route: "/stories/story-report-ui/exports",
        legal_links: {
          terms_url: "/legal/terms",
          privacy_url: "/legal/privacy",
          aigc_url: "/legal/aigc",
        },
      },
    ],
  }),
  createReportCase: vi.fn().mockResolvedValue({
    case_id: "report-case-ui-created",
    ops_case_id: "ops-case-ui-created",
    status: "submitted",
    category: "content_safety",
    surface: "reader",
    summary: "章节内容需要核查",
    description: "担心该章节越界。",
    target_object: {
      object_type: "story_chapter",
      object_id: "chapter-report-ui",
      object_label: "第一章",
    },
    evidence_refs: [],
    created_at: "2026-04-03T01:00:00.000Z",
    updated_at: "2026-04-03T01:00:00.000Z",
    sla_due_at: "2026-04-03T05:00:00.000Z",
    latest_status_note: "已提交，等待受理。",
    legal_links: {
      terms_url: "/legal/terms",
      privacy_url: "/legal/privacy",
      aigc_url: "/legal/aigc",
    },
  }),
}));

describe("report new view", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("loads trust legal copy, recent cases, and lets the user submit a report against the current target", async () => {
    render(<ReportNewView />);

    await waitFor(() => {
      expect(fetchTrustLegalSummary).toHaveBeenCalled();
      expect(listReportCases).toHaveBeenCalledWith("wx-openid-report-ui");
      expect(exchangeSessionToken).toHaveBeenCalledWith("report-token-ui");
    }, { timeout: 10000 });

    expect(screen.getByTestId("report-new-page").textContent).toContain("先把问题讲出来，我来继续跟");
    expect(screen.getByTestId("report-new-page").textContent).toContain("默认私密");
    expect(screen.getByTestId("report-new-page").textContent).toContain("P0 4 小时内受理");
    expect(screen.getByTestId("report-new-page").textContent).toContain("第一章");
    expect(screen.getByTestId("report-new-page").textContent).toContain("我会先从 阅读器 · 第一章 开始看");
    expect(screen.getByTestId("report-category-details")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("report-recent-cases").textContent).toContain("请补充截图与段落位置");
    }, { timeout: 10000 });
    expect(screen.getByTestId("report-recent-cases").textContent).toContain("导出核查");
    expect(screen.getByRole("link", { name: "继续处理这条", hidden: true }).getAttribute("href")).toContain(
      "/stories/story-report-ui/exports",
    );
    expect(screen.getByRole("link", { name: "继续处理这条", hidden: true }).getAttribute("href")).not.toContain("account_token=");
    expect(screen.getByRole("link", { name: "继续处理这条", hidden: true }).getAttribute("href")).not.toContain("token=");

    fireEvent.change(screen.getByLabelText("问题摘要"), {
      target: { value: "章节内容需要核查" },
    });
    fireEvent.change(screen.getByLabelText("详细说明"), {
      target: { value: "担心该章节越过了平台当前的安全边界。" },
    });
    fireEvent.click(screen.getByText("如果你知道大概属于哪一类，再补这一项"));
    fireEvent.change(screen.getByLabelText("问题类型"), {
      target: { value: "content_safety" },
    });
    fireEvent.click(screen.getByRole("button", { name: "把这件事交给人工处理" }));

    await waitFor(() => {
      expect(createReportCase).toHaveBeenCalledWith(
        expect.objectContaining({
          account_token: "wx-openid-report-ui",
          surface: "reader",
          category: "content_safety",
          target_object: {
            object_type: "story_chapter",
            object_id: "chapter-report-ui",
            object_label: "第一章",
          },
        }),
      );
    });

    expect(screen.getByTestId("report-submit-state").textContent).toContain("已收到你的求助");
    expect(screen.getByTestId("report-submit-state").textContent).toContain("report-case-ui-created");
  }, 15000);

  it("keeps the submitted success state even if refreshing recent cases fails after submit", async () => {
    vi.mocked(listReportCases)
      .mockResolvedValueOnce({
        items: [
          {
            case_type: "public_report",
            case_id: "report-case-ui-001",
            ops_case_id: "ops-report-case-ui-001",
            status: "pending_user",
            category: "content_safety",
            summary: "需要补充截图",
            latest_status_note: "请补充截图与段落位置。",
            created_at: "2026-04-03T00:00:00.000Z",
            updated_at: "2026-04-03T00:30:00.000Z",
            sla_due_at: "2026-04-03T04:00:00.000Z",
            target_route: "/report/new?tab=history",
            legal_links: {
              terms_url: "/legal/terms",
              privacy_url: "/legal/privacy",
              aigc_url: "/legal/aigc",
            },
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<ReportNewView />);

    await waitFor(() => {
      expect(screen.getByTestId("report-new-page").textContent).toContain("先把问题讲出来，我来继续跟");
    }, { timeout: 10000 });

    fireEvent.change(screen.getByLabelText("问题摘要"), {
      target: { value: "章节内容需要核查" },
    });
    fireEvent.change(screen.getByLabelText("详细说明"), {
      target: { value: "担心该章节越过了平台当前的安全边界。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "把这件事交给人工处理" }));

    await waitFor(() => {
      expect(createReportCase).toHaveBeenCalled();
    }, { timeout: 10000 });

    await waitFor(() => {
      expect(screen.getByTestId("report-submit-state").textContent).toContain("已收到你的求助");
    }, { timeout: 10000 });

    expect(screen.getByTestId("report-recent-cases").textContent).toContain("最近交给我的事情还没整理出来");
    expect(screen.getByTestId("report-new-page").textContent).not.toContain("这份求助还没提交成功，再试一次。");
  }, 15000);

  it("renders independent recent-case errors and maps closed statuses with user-facing copy", async () => {
    vi.mocked(listReportCases).mockResolvedValueOnce({
      items: [
        {
          case_type: "public_report",
          case_id: "report-case-ui-resolved",
          ops_case_id: "ops-report-case-ui-resolved",
          status: "resolved",
          summary: "这条已经处理完",
          latest_status_note: "已完成核查。",
          created_at: "2026-04-03T00:00:00.000Z",
          updated_at: "2026-04-03T00:30:00.000Z",
          sla_due_at: "2026-04-03T04:00:00.000Z",
          target_route: null,
          legal_links: {
            terms_url: "/legal/terms",
            privacy_url: "/legal/privacy",
            aigc_url: "/legal/aigc",
          },
        },
        {
          case_type: "public_report",
          case_id: "report-case-ui-rejected",
          ops_case_id: "ops-report-case-ui-rejected",
          status: "rejected",
          summary: "这条不进入处理",
          latest_status_note: "不在当前受理范围。",
          created_at: "2026-04-03T00:10:00.000Z",
          updated_at: "2026-04-03T00:40:00.000Z",
          sla_due_at: "2026-04-03T04:10:00.000Z",
          target_route: null,
          legal_links: {
            terms_url: "/legal/terms",
            privacy_url: "/legal/privacy",
            aigc_url: "/legal/aigc",
          },
        },
      ],
    });

    render(<ReportNewView />);

    await waitFor(() => {
      expect(screen.getByTestId("report-recent-cases").textContent).toContain("已处理");
      expect(screen.getByTestId("report-recent-cases").textContent).toContain("暂不受理");
    }, { timeout: 10000 });
  }, 15000);

  it("keeps trust rules available even when recent-case loading fails", async () => {
    vi.mocked(listReportCases).mockRejectedValueOnce(new Error("history failed"));

    render(<ReportNewView />);

    await waitFor(() => {
      expect(screen.getByTestId("report-trust-rules").textContent).toContain("所有内容默认私密");
      expect(screen.getByTestId("report-recent-cases").textContent).toContain("最近交给我的事情还没整理出来");
    });
  });
});
