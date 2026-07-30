"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BetaSupportCaseResponse, BetaSupportCategory, BetaSupportOverviewResponse } from "@erliu/shared-contracts";
import { useAccountSurfaceSession } from "../lib/account-surface-session";
import { createBetaSupportCase, fetchBetaSupportOverview } from "../lib/beta-ops-api";
import { withH5Context } from "../lib/navigation";
import { AccountRecoveryStateCard } from "../profile/account/control-plane-kit";
import {
  FRONTSTAGE_ACCOUNT_ERROR,
  FRONTSTAGE_LOADING,
  toFeedbackCaseStatusLabel,
  toFeedbackCategoryLabel,
  toFeedbackSurfaceLabel,
  toFeedbackTargetTypeLabel,
  toFrontstageErrorCopy,
} from "../lib/frontstage-copy";

const categoryOptions: Array<{ code: BetaSupportCategory; title: string; description: string }> = [
  {
    code: "story_quality",
    title: "故事质量",
    description: "剧情承接、角色关系、章节推进或 promise 落点有问题。",
  },
  {
    code: "delivery_blocker",
    title: "交付阻断",
    description: "导出、章节送达、关键结果页或下载链路失效。",
  },
  {
    code: "channel_sync",
    title: "渠道同步",
    description: "微信 / 飞书 / H5 之间的状态、入口或绑定不同步。",
  },
  {
    code: "billing_membership",
    title: "会员额度",
    description: "会员、配额、预算或付费权益口径异常。",
  },
  {
    code: "onboarding_blocker",
    title: "首访阻断",
    description: "邀请码、进入主链、游客转正或首访关键步骤被卡住。",
  },
  {
    code: "other",
    title: "其他",
    description: "其他需要人工介入和回看的问题。",
  },
];

export function FeedbackView() {
  const searchParams = useSearchParams();
  const session = useAccountSurfaceSession("/feedback", {
    issueTokenForLegacyAccount: true,
  });
  const accountToken = session.accountToken;
  const surface = readSurface(searchParams.get("surface"));
  const targetType = readTargetType(searchParams.get("target_type"));
  const targetId = searchParams.get("target_id") ?? "feedback-target";
  const targetLabel = searchParams.get("target_label") ?? "当前对象";
  const storyId = session.storyId ?? searchParams.get("story_id");
  const [overview, setOverview] = useState<BetaSupportOverviewResponse | null>(null);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<BetaSupportCategory>("story_quality");
  const [submitState, setSubmitState] = useState<BetaSupportCaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadOverview(nextAccountToken: string) {
    const result = await fetchBetaSupportOverview(nextAccountToken);
    setOverview(result);
    return result;
  }

  useEffect(() => {
    if (!accountToken) {
      return;
    }

    loadOverview(accountToken).catch((reason) => {
      setError(toFrontstageErrorCopy(reason, "反馈概览这会儿还没整理出来。"));
    });
  }, [accountToken]);

  if (session.recoveryState !== "ready") {
    const feedbackRootHref = session.queryString ? `/feedback?${session.queryString}` : "/feedback";

    return (
      <main className="surface" data-testid="feedback-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={feedbackRootHref}
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
      const created = await createBetaSupportCase({
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
        client_request_id: `beta-support-${Date.now()}`,
      });
      setSubmitState(created);
      await loadOverview(accountToken);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这份反馈还没提交成功，再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface" data-testid="feedback-page">
      <section className="hero-card">
        <p className="hero-card__eyebrow">反馈与求助</p>
        <h1>反馈与求助</h1>
        <p>这里不是举报入口，而是处理体验问题、异常链路和人工跟进的帮助入口。问题会进入统一时效、通知和跟进链。</p>
        {error ? <p>{error}</p> : null}
      </section>

      {overview?.active_incidents.length ? (
        <section className="panel-card" data-testid="feedback-incident-banner">
          <p className="panel-card__eyebrow">当前存在服务降级通知</p>
          {overview.active_incidents.map((item) => (
            <article key={item.incident_id}>
              <strong>{item.headline}</strong>
              <p>{item.summary}</p>
              <p>{item.recommended_action}</p>
            </article>
          ))}
        </section>
      ) : null}

      {overview ? (
        <section className="panel-card">
          <p className="panel-card__eyebrow">处理时效</p>
          <p>{overview.entry.sla_copy}</p>
          <p>{overview.entry.support_hours_copy}</p>
          <p>
            当前活跃读者 {overview.daily_digest.active_beta_accounts} 位，待处理求助 {overview.daily_digest.open_case_count} 条，
            等你补充信息 {overview.daily_digest.pending_user_count} 条。
          </p>
        </section>
      ) : null}

      <section className="panel-card">
        <p className="panel-card__eyebrow">当前对象</p>
        <p>
          {toFeedbackSurfaceLabel(surface)} · {targetLabel}
        </p>
        <p>
          {toFeedbackTargetTypeLabel(targetType)} · {targetId}
        </p>
      </section>

      <section className="panel-card">
        <p className="panel-card__eyebrow">提交反馈</p>
        <div className="exports-choice-grid">
          {categoryOptions.map((item) => (
            <label key={item.code} className="exports-choice-card">
              <input
                type="radio"
                name="feedback-category"
                aria-label={item.code}
                checked={category === item.code}
                onChange={() => {
                  setCategory(item.code);
                }}
              />
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </label>
          ))}
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
        <button type="button" disabled={submitting || !accountToken || !summary.trim() || !description.trim()} onClick={() => void handleSubmit()}>
          提交反馈
        </button>
        {!accountToken ? <p>{FRONTSTAGE_ACCOUNT_ERROR}</p> : null}
        {submitState ? (
          <p data-testid="feedback-submit-state">
            已收到你的反馈 · {submitState.case_id}
          </p>
        ) : null}
      </section>

      <section className="panel-card">
        <p className="panel-card__eyebrow">最近记录</p>
        {overview?.entry.history_url ? (
          <p>
            <Link href={withH5Context(overview.entry.history_url, session.contextSearchParams)}>打开历史回看</Link>
          </p>
        ) : null}
        {overview?.cases.length ? (
          <ul className="f9-bullet-list">
            {overview.cases.map((item) => (
              <li key={item.case_id}>
                <strong>{item.summary}</strong>
                <p>
                  {toFeedbackCategoryLabel(item.category)} · {toFeedbackCaseStatusLabel(item.status)} · {item.latest_status_note ?? "等待处理"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>还没有最近记录，第一次提交后会在这里回看。</p>
        )}
      </section>
    </main>
  );
}

function readSurface(value: string | null): "chat" | "room" | "export" | "account" {
  if (value === "room" || value === "export" || value === "account") {
    return value;
  }
  return "chat";
}

function readTargetType(value: string | null): "chat_thread" | "room_session" | "export_job" | "account_overview" {
  if (value === "room_session" || value === "export_job" || value === "account_overview") {
    return value;
  }
  return "chat_thread";
}
