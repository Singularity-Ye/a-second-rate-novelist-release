"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import type { AccountOverviewResponse } from "@erliu/shared-contracts";
import {
  createPrivacyDataRequest,
  fetchAccountOverview,
  fetchPrivacyDataRequests,
} from "../../../lib/account-membership-api";
import { useAccountSurfaceSession } from "../../../lib/account-surface-session";
import { buildReportHref } from "../../../lib/reporting-case-links";
import {
  FRONTSTAGE_LOADING,
  toPrivacyRequestScopeLabel,
  toPrivacyRequestStatusLabel,
  toPrivacyRequestTypeLabel,
  toFrontstageErrorCopy,
} from "../../../lib/frontstage-copy";
import {
  AccountRecoveryStateCard,
  accountStatusLabel,
  ControlActionRow,
  ControlLinkCell,
  ControlSection,
  ControlStaticCell,
  ControlStrip,
  syncHealthLabel,
} from "../control-plane-kit";

export function PrivacyView() {
  const session = useAccountSurfaceSession("/profile/account/privacy");
  const accountToken = session.accountToken;
  const storyId = session.storyId;
  const [overview, setOverview] = useState<AccountOverviewResponse | null>(null);
  const [requests, setRequests] = useState<Array<{ id: string; request_type: string; status: string; scope: string; story_id?: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<"export" | "delete" | "revoke_consent">("export");
  const [scope, setScope] = useState<"account" | "story" | "asset">("account");
  const [requestState, setRequestState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accountToken) {
      return;
    }

    Promise.all([fetchAccountOverview(accountToken), fetchPrivacyDataRequests(accountToken)])
      .then(([overviewResult, requestResult]) => {
        setOverview(overviewResult);
        setRequests(requestResult.items);
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, "隐私与数据这会儿还没打开。"));
      });
  }, [accountToken]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface privacy-surface" data-testid="privacy-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  async function handleCreateRequest() {
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    if (requestType === "delete" && !storyId) {
      setError("要删除某本故事的数据，需要先从那本书里进入这页。");
      setSubmitting(false);
      return;
    }

    try {
      const result = await createPrivacyDataRequest({
        account_token: accountToken,
        request_type: requestType,
        scope,
        ...(storyId ? { story_id: storyId } : {}),
      });
      setRequestState(result.status);
      const nextRequests = await fetchPrivacyDataRequests(accountToken);
      setRequests(nextRequests.items);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次数据请求还没提交成功。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface privacy-surface" data-testid="privacy-page">
      {error ? <p>{error}</p> : null}
      {!overview && !error ? <p>{FRONTSTAGE_LOADING.profile}</p> : null}
      {overview ? (
        <>
          <section className="story-section control-hero" data-testid="privacy-summary">
            <p className="story-section__eyebrow">隐私与数据</p>
            <h1 className="story-section__title">数据能带走，也能要求删除</h1>
            <p className="story-section__copy">
              账户、故事和资产三个层级的边界都应该说清楚。这里不做含糊的“总开关”，而是明确告诉你每种请求会影响什么。
            </p>
            <ControlStrip
              items={[
                {
                  label: "账户状态",
                  value: accountStatusLabel(overview.account.account_status),
                },
                {
                  label: "同步健康",
                  value: syncHealthLabel(overview.sync_summary.sync_health),
                },
                {
                  label: "处理中请求",
                  value: `${overview.runtime_control.privacy.open_request_count} 个`,
                },
                {
                  label: "冷静期",
                  value: `${overview.runtime_control.privacy.cooling_off_request_count} 个`,
                },
              ]}
            />
          </section>

          <div className="control-layout">
            <div className="control-main">
              <ControlSection
                eyebrow="范围控制"
                title="范围按账户、故事、资产拆开"
                description="隐私强控制不是一句口号，而是让用户知道每类资料会在哪里被看见、能否被带走。"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title="默认分享策略"
                    value="故事默认仅自己可见"
                    description="故事不会因为导出作品就自动公开；必须由你主动决定什么时候离开房间。"
                    meta="范围层级：账户 > 故事 > 分享"
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="资产授权"
                    value="资产可单独撤回同意"
                    description="参考资料单独管理，不会因为作品导出而被一并公开。"
                    meta="范围层级：资产授权独立于作品可见性"
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="数据可带走"
                    value="支持导出 / 删除 / 撤回同意"
                    description="导出、删除和撤回同意走不同请求通道，并保留最近一次申请记录。"
                    meta={`最近请求 ${overview.runtime_control.privacy.latest_request_id ?? "暂无"}`}
                    status="已可用"
                    tone="live"
                  />
                </div>
              </ControlSection>

              <ControlSection
                eyebrow="请求动作"
                title="直接发起数据请求"
                description="所有请求都落到明确的 scope，不再只是一个模糊按钮。"
              >
                <ControlActionRow>
                  <button
                    type="button"
                    className={requestType === "export" ? undefined : "secondary-button"}
                    disabled={submitting}
                    onClick={() => {
                      setRequestType("export");
                      setScope("account");
                    }}
                  >
                    导出我的资料
                  </button>
                  <button
                    type="button"
                    className={requestType === "delete" ? undefined : "secondary-button"}
                    disabled={submitting}
                    onClick={() => {
                      setRequestType("delete");
                      setScope("story");
                    }}
                  >
                    申请删除故事数据
                  </button>
                  <button
                    type="button"
                    className={requestType === "revoke_consent" ? undefined : "secondary-button"}
                    disabled={submitting}
                    onClick={() => {
                      setRequestType("revoke_consent");
                      setScope("asset");
                    }}
                  >
                    撤回资产授权
                  </button>
                </ControlActionRow>
                <div className="control-inline-note">
                  <strong>当前请求</strong>
                  <span>
                    {toPrivacyRequestTypeLabel(requestType)} · {toPrivacyRequestScopeLabel(scope)}
                    {scope === "story" ? ` · ${storyId ? "当前这本故事" : "需要从具体故事里进入"}` : null}
                  </span>
                </div>
                <ControlActionRow>
                  <button type="button" disabled={submitting} onClick={() => void handleCreateRequest()}>
                    提交数据请求
                  </button>
                </ControlActionRow>
                {requestState ? <p data-testid="privacy-request-state">{toPrivacyRequestStatusLabel(requestState)}</p> : null}
              </ControlSection>

              <ControlSection eyebrow="最近请求" title="别让用户重复提交同一件事">
                <ul className="control-list">
                  {requests.map((item) => (
                    <li key={item.id}>
                      <strong>{toPrivacyRequestTypeLabel(item.request_type)}</strong>
                      <span>
                        {toPrivacyRequestScopeLabel(item.scope)}
                        {item.scope === "story" && item.story_id ? ` · ${item.story_id}` : ""} ·{" "}
                        {toPrivacyRequestStatusLabel(item.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </ControlSection>
            </div>

            <aside className="control-sidebar">
              <ControlSection
                eyebrow="信任入口"
                title="协议、标识与求助保持可见"
                description="把需要承担的规则说明和求助入口都放在用户能看见的位置。"
              >
                <div className="control-cell-list">
                  <ControlLinkCell
                    href={buildReportHref({
                      surface: "settings",
                      account_token: accountToken,
                      story_id: storyId,
                      target_type: "account_privacy",
                      target_id: overview.account.account_id,
                      target_label: "隐私与数据设置",
                      token: session.token,
                    })}
                    title="举报与求助"
                    description="需要人工介入时，把当前账户上下文一并带过去。"
                    status="已可用"
                    tone="live"
                  />
                  <ControlLinkCell href="/legal/terms" title="服务协议" description="查看服务条款。" status="已可用" tone="live" />
                  <ControlLinkCell href="/legal/privacy" title="隐私政策" description="查看隐私承诺。" status="已可用" tone="live" />
                  <ControlLinkCell href="/legal/aigc" title="作品标识说明" description="查看作品标识规则。" status="已可用" tone="live" />
                </div>
              </ControlSection>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
