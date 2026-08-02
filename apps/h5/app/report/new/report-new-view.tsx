"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  PublicReportCategory,
  PublicReportSurface,
  ReportCaseListResponse,
  ReportCaseResponse,
  ReportTargetObjectType,
  TrustLegalSummaryResponse,
} from "@erliu/shared-contracts";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import { createReportCase, fetchTrustLegalSummary, listReportCases } from "../../lib/reporting-case-api";
import { withH5Context } from "../../lib/navigation";
import { AccountRecoveryStateCard } from "../../profile/account/control-plane-kit";
import { FRONTSTAGE_ACCOUNT_ERROR, FRONTSTAGE_LOADING, toFrontstageErrorCopy } from "../../lib/frontstage-copy";

const defaultCategoryOption = {
  code: "other",
  title: "其他问题",
  description: "其他需要平台人工介入查看的情况。",
} as const;

const categoryOptions: Array<{ code: PublicReportCategory; title: string; description: string }> = [
  {
    code: "content_safety",
    title: "内容有风险",
    description: "内容可能越界、危险或不适合公开。",
  },
  {
    code: "minor_safety",
    title: "未成年人相关",
    description: "涉及未成年人保护、互动边界或不当引导。",
  },
  {
    code: "privacy",
    title: "隐私和数据",
    description: "涉及默认私密、信息调阅、数据保护或越权查看。",
  },
  {
    code: "harassment_abuse",
    title: "骚扰或滥用",
    description: "涉及骚扰、辱骂、恶意刷流程或反复打扰。",
  },
  {
    code: "rights_labeling",
    title: "标识与权利",
    description: "涉及作品标识、导出说明、权利服务或误导。",
  },
  defaultCategoryOption,
] as const;

export function ReportNewView() {
  const searchParams = useSearchParams();
  const session = useAccountSurfaceSession("/report/new", {
    issueTokenForLegacyAccount: true,
  });
  const [trust, setTrust] = useState<TrustLegalSummaryResponse | null>(null);
  const [recentCases, setRecentCases] = useState<ReportCaseListResponse["items"]>([]);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PublicReportCategory>("other");
  const [error, setError] = useState<string | null>(null);
  const [trustError, setTrustError] = useState<string | null>(null);
  const [recentCasesError, setRecentCasesError] = useState<string | null>(null);
  const [trustLoading, setTrustLoading] = useState(true);
  const [recentCasesLoading, setRecentCasesLoading] = useState(false);
  const [submitState, setSubmitState] = useState<ReportCaseResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accountToken = session.accountToken;
  const surface = readSurface(searchParams.get("surface"));
  const targetType = readTargetType(searchParams.get("target_type"));
  const targetId = searchParams.get("target_id") ?? "unknown-target";
  const targetLabel = searchParams.get("target_label") ?? "当前对象";
  const storyId = session.storyId ?? searchParams.get("story_id");
  const activeCategory = categoryOptions.find((item) => item.code === category) ?? defaultCategoryOption;

  useEffect(() => {
    setTrustLoading(true);
    setTrustError(null);
    fetchTrustLegalSummary()
      .then(setTrust)
      .catch((reason) => {
        setTrustError(toFrontstageErrorCopy(reason, "求助说明这会儿还没整理出来。"));
      })
      .finally(() => {
        setTrustLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!accountToken) {
      setRecentCases([]);
      setRecentCasesLoading(false);
      setRecentCasesError(null);
      return;
    }

    setRecentCasesLoading(true);
    setRecentCasesError(null);
    listReportCases(accountToken)
      .then((result) => {
        setRecentCases(result.items);
      })
      .catch((reason) => {
        setRecentCasesError(toFrontstageErrorCopy(reason, "最近交给我的事情还没整理出来。"));
        setRecentCases([]);
      })
      .finally(() => {
        setRecentCasesLoading(false);
      });
  }, [accountToken]);

  if (session.recoveryState !== "ready") {
    const reportRootHref = session.queryString ? `/report/new?${session.queryString}` : "/report/new";

    return (
      <main className="surface" data-testid="report-new-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={reportRootHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  async function handleSubmit() {
    if (!accountToken || submitting || !summary.trim() || !description.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await createReportCase({
        account_token: accountToken,
        ...(storyId ? { story_id: storyId } : {}),
        surface,
        category,
        summary: summary.trim(),
        description: description.trim(),
        target_object: {
          object_type: targetType,
          object_id: targetId,
          object_label: targetLabel,
        },
        evidence_refs: [],
        client_request_id: `report-${Date.now()}`,
      });
      setSubmitState(created);
      try {
        const refreshed = await listReportCases(accountToken);
        setRecentCases(refreshed.items);
        setRecentCasesError(null);
      } catch {
        setRecentCasesError("最近交给我的事情还没整理出来。");
      }
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这份求助还没提交成功，再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface report-surface" data-testid="report-new-page">
      <div className="report-layout">
        <div className="report-main">
          <section className="story-cell report-form-card">
            <div className="story-section__header">
              <p className="page-intro__eyebrow">我遇到一个问题</p>
              <h1 className="page-intro__title">先把问题讲出来，我来继续跟</h1>
              <p className="page-intro__lede">不用先判断是不是找对了地方，先把发生了什么讲给我听。</p>
              {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
              <p className="report-target-context">
                我会先从 <strong>{surfaceLabel(surface)} · {targetLabel}</strong> 开始看；如果里面牵到别的对象，我来帮你一起对上。
              </p>
              <p className="story-section__eyebrow">不用先分类型</p>
              <h2 className="story-section__title">先用自己的话把事情讲给我听</h2>
              <p className="story-section__copy">你只需要说发生了什么、卡在哪里、希望我先看什么。是不是找对地方、算哪一类，我来帮你一起校正。</p>
            </div>
            <label className="exports-textarea">
              问题摘要
              <input
                aria-label="问题摘要"
                value={summary}
                disabled={submitting}
                onChange={(event) => {
                  setSummary(event.target.value);
                }}
              />
            </label>
            <label className="exports-textarea">
              详细说明
              <textarea
                aria-label="详细说明"
                value={description}
                disabled={submitting}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
              />
            </label>
            <details className="report-category-details" data-testid="report-category-details">
              <summary>如果你知道大概属于哪一类，再补这一项</summary>
              <label className="report-category-field">
                <span>问题类型</span>
                <select
                  aria-label="问题类型"
                  value={category}
                  disabled={submitting}
                  onChange={(event) => {
                    setCategory(event.target.value as PublicReportCategory);
                  }}
                >
                  {categoryOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="story-microcopy report-category-hint">
                默认先按“{activeCategory.title}”接住。{activeCategory.description} 不确定也没关系，后面会根据你写的内容继续补齐。
              </p>
            </details>
            <button type="button" disabled={submitting || !accountToken || !summary.trim() || !description.trim()} onClick={() => void handleSubmit()}>
              把这件事交给人工处理
            </button>
            {!accountToken ? <p className="story-microcopy story-microcopy--danger">{FRONTSTAGE_ACCOUNT_ERROR}</p> : null}
            {trust ? (
              <p className="story-microcopy report-submit-hint">
                {trust.reporting_entry.default_privacy_copy} {trust.reporting_entry.sla_copy}
              </p>
            ) : null}
            {submitState ? (
              <p className="report-submit-state" data-testid="report-submit-state">
                已收到你的求助 · {submitState.case_id}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="report-side">
          <details className="report-support-details" data-testid="report-trust-rules">
            <summary>受理范围、隐私和处理时效</summary>
            <div className="report-support-details__body">
              {trust ? (
                <>
                  <p>{trust.reporting_entry.default_privacy_copy}</p>
                  <p>{trust.reporting_entry.sla_copy}</p>
                  <p>{trust.reporting_entry.contact_copy}</p>
                  <div className="f9-link-grid">
                    {trust.documents.map((item) => (
                      <Link key={item.slug} href={item.url}>
                        {item.title}
                      </Link>
                    ))}
                  </div>
                </>
              ) : trustError ? (
                <p>{trustError}</p>
              ) : trustLoading ? (
                <p>{FRONTSTAGE_LOADING.report}</p>
              ) : (
                <p>求助说明暂时还没准备好。</p>
              )}
            </div>
          </details>

          <details className="report-support-details" data-testid="report-recent-cases" open={Boolean(submitState)}>
            <summary>最近交给我的事情和进度</summary>
            <div className="report-support-details__body">
              {recentCasesError ? (
                <p>{recentCasesError}</p>
              ) : recentCasesLoading ? (
                <p>正在整理最近交给我的事情……</p>
              ) : recentCases.length > 0 ? (
                <ul className="f9-bullet-list">
                  {recentCases.map((item) => (
                    <li key={item.case_id}>
                      <strong>{reportCaseTypeLabel(item.case_type)}</strong>
                      <p>
                        {item.summary} · {reportCaseStatusLabel(item.status)} · {item.latest_status_note ?? "等待处理"}
                      </p>
                      {item.case_type !== "public_report" && item.target_route ? (
                        <Link href={withH5Context(item.target_route, session.contextSearchParams)}>继续处理这条</Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>这里会慢慢记住你最近交给我的事，方便你回头继续看。现在还空着，说明你这次是第一个把情况讲给我听的人。</p>
              )}
            </div>
          </details>
        </aside>
      </div>
    </main>
  );
}

function readSurface(value: string | null): PublicReportSurface {
  if (value === "room" || value === "reader" || value === "export" || value === "settings") {
    return value;
  }

  return "reader";
}

function readTargetType(value: string | null): ReportTargetObjectType {
  if (value === "room_session" || value === "story_chapter" || value === "export_job" || value === "account_privacy") {
    return value;
  }

  return "story_chapter";
}

function surfaceLabel(value: PublicReportSurface) {
  switch (value) {
    case "room":
      return "房间";
    case "export":
      return "导出与权利服务";
    case "settings":
      return "我的";
    default:
      return "阅读器";
  }
}

function reportCaseTypeLabel(value: string) {
  switch (value) {
    case "public_report":
      return "人工处理记录";
    case "export_review":
      return "导出核查";
    default:
      return "处理记录";
  }
}

function reportCaseStatusLabel(value: string) {
  switch (value) {
    case "triaged":
      return "已交接";
    case "pending_user":
      return "等你补充";
    case "under_review":
      return "正在看";
    case "submitted":
      return "已收到";
    case "resolved":
      return "已处理";
    case "rejected":
      return "暂不受理";
    default:
      return "处理中";
  }
}
