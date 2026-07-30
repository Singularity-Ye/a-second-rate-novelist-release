"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { ReferenceAssetDetailResponse } from "@erliu/shared-contracts";
import { confirmReferenceAsset, fetchReferenceAssetDetail } from "../../../lib/assets-api";

function scopeLabel(value: string) {
  switch (value) {
    case "story":
      return "当前故事";
    case "user_private_library":
      return "私人资料库";
    default:
      return "资料库";
  }
}

function extractTypeLabel(value: string) {
  switch (value) {
    case "character":
      return "人物";
    case "relationship":
      return "关系";
    case "style":
      return "风格";
    case "theme":
      return "母题";
    case "location":
      return "地点";
    case "conflict_pattern":
      return "冲突模式";
    default:
      return "内容";
  }
}

function assetStatusLabel(value: string) {
  switch (value) {
    case "uploaded":
      return "刚放上书架";
    case "review_pending":
      return "等你确认";
    case "ready":
      return "已经整理好";
    case "failed":
      return "还没整理明白";
    case "revoked":
      return "已经撤下";
    default:
      return "还在整理";
  }
}

function extractResultStatusLabel(value: string) {
  switch (value) {
    case "suggested":
      return "建议中";
    case "accepted":
      return "已确认";
    case "rejected":
      return "已忽略";
    case "pending":
      return "还在整理";
    default:
      return "待确认";
  }
}

function availabilityLabel(value: string) {
  switch (value) {
    case "available":
      return "可以去";
    case "blocked":
      return "暂时不能去";
    default:
      return "待确认";
  }
}

function usageModeLabel(value: string) {
  switch (value) {
    case "style":
      return "风格";
    case "lore":
      return "世界设定";
    case "character":
      return "人物";
    case "world_rule":
      return "规则";
    case "mood":
      return "氛围";
    default:
      return "用途";
  }
}

function attachmentStatusLabel(value: string) {
  switch (value) {
    case "active":
      return "已经挂上";
    case "revoked":
      return "已经撤下";
    default:
      return "还没定下来";
  }
}

function targetTypeLabel(value: string) {
  switch (value) {
    case "story":
      return "故事";
    default:
      return "目标";
  }
}

export function AssetReviewView() {
  const params = useParams<{ assetId: string }>();
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<ReferenceAssetDetailResponse | null>(null);
  const [selectedExtractRefs, setSelectedExtractRefs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assetId = typeof params.assetId === "string" ? params.assetId : "";
  const searchParamsString = searchParams.toString();
  const sanitizedSearchParams = useMemo(() => {
    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.delete("token");
    nextParams.delete("account_token");
    return nextParams;
  }, [searchParamsString]);
  const queryString = sanitizedSearchParams.toString();
  const extractResults = detail?.extract_results ?? [];
  const attachments = detail?.attachments ?? [];
  const availableStoryTargets = detail?.available_story_targets ?? [];
  const revokeImpact = detail?.revoke_impact;
  const needsConfirmation = detail?.asset.extract_status === "review_pending";
  const workbenchParams = new URLSearchParams(queryString);

  if (assetId) {
    workbenchParams.set("asset_id", assetId);
  }

  const workbenchHref = workbenchParams.toString() ? `/assets/workbench?${workbenchParams.toString()}` : "/assets/workbench";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (searchParamsString === queryString) {
      return;
    }

    const nextSearch = queryString ? `?${queryString}` : "";
    const nextHref = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
  }, [queryString, searchParamsString]);

  useEffect(() => {
    if (!assetId) {
      setDetail(null);
      setSelectedExtractRefs([]);
      setError("缺少资料编号，暂时还不能打开这一页。");
      return;
    }

    let cancelled = false;
    setDetail(null);
    setSelectedExtractRefs([]);
    setError(null);
    fetchReferenceAssetDetail({
      asset_id: assetId,
    })
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
          setSelectedExtractRefs(
            (nextDetail.extract_results ?? [])
              .filter((item) => item.status === "suggested" || item.status === "accepted")
              .map((item) => item.extract_ref_id),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("这份资料暂时打不开，请稍后再试。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  function toggleExtractRef(extractRefId: string) {
    setSelectedExtractRefs((current) =>
      current.includes(extractRefId) ? current.filter((item) => item !== extractRefId) : [...current, extractRefId],
    );
  }

  async function handleConfirm() {
    if (!assetId || !detail) {
      setError("先把资料打开，再确认整理结果。");
      return;
    }

    if (extractResults.length === 0) {
      setError("这份资料还没有可确认的内容。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await confirmReferenceAsset({
        asset_id: assetId,
        accepted_extract_refs: selectedExtractRefs,
        rejected_extract_refs: detail.extract_results
          .filter((item) => !selectedExtractRefs.includes(item.extract_ref_id))
          .map((item) => item.extract_ref_id),
      });
      const nextDetail = await fetchReferenceAssetDetail({ asset_id: assetId });
      setDetail(nextDetail);
      setSelectedExtractRefs(
        nextDetail.extract_results
          .filter((item) => item.status === "suggested" || item.status === "accepted")
          .map((item) => item.extract_ref_id),
      );
      setError(null);
    } catch {
      setError("这份资料没确认好，等一下再试就好。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface asset-review-surface" data-testid="asset-review-page">
      <section className="page-intro asset-review-hero">
        <p className="page-intro__eyebrow">资料确认层</p>
        <h1 className="page-intro__title">先看这份资料是什么，再决定它往哪去</h1>
        <p className="page-intro__lede">
          这里会讲清它是什么、能去哪里、已经影响了哪里；如果撤下，也能看清会影响什么。
        </p>
        {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
        {!detail && !error ? <p className="story-microcopy">正在查看这份资料的确认信息...</p> : null}
        <div className="page-intro__actions">
          <Link className="secondary-button" href={queryString ? `/assets?${queryString}` : "/assets"}>
            回到资料库
          </Link>
          <Link className="secondary-button" href={workbenchHref}>
            去二级整理台
          </Link>
        </div>
      </section>

      {detail ? (
        <div className="story-cell-list asset-review-layout">
          <div className="asset-review-main">
            <section className="story-section asset-hero" data-testid="asset-review-summary">
              <div className="story-section__header">
                <p className="story-section__eyebrow">{detail.scope_label ?? "资料来源"}</p>
                <h2 className="story-section__title">{detail.asset.file_name}</h2>
              </div>
              <p className="story-section__copy">资料状态：{assetStatusLabel(detail.asset.extract_status)}</p>
              <p className="story-section__copy">资料归属：{scopeLabel(detail.asset.scope)}</p>
              <p className="story-section__copy">
                已经影响了 {attachments.length} 个引用
                {detail.asset.story_id ? `，最早来自 ${scopeLabel(detail.asset.scope)}` : ""}
              </p>
            </section>

            <section className="story-section asset-step-card" data-testid="asset-review-extracts">
              <div className="story-section__header">
                <p className="story-section__eyebrow">这份资料是什么</p>
                <h2 className="story-section__title">它被整理成了哪些可用内容</h2>
              </div>
              {extractResults.length > 0 ? (
                <>
                  <ul className="asset-extract-list">
                    {extractResults.map((item) => (
                      <li key={item.extract_ref_id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedExtractRefs.includes(item.extract_ref_id)}
                            disabled={submitting || !needsConfirmation}
                            onChange={() => {
                              toggleExtractRef(item.extract_ref_id);
                            }}
                          />
                          <span>
                            {extractTypeLabel(item.extract_type)} · {extractResultStatusLabel(item.status)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {needsConfirmation ? (
                    <div className="f9-button-row">
                      <button type="button" disabled={submitting || extractResults.length === 0} onClick={() => void handleConfirm()}>
                        确认这些可用内容
                      </button>
                    </div>
                  ) : (
                    <p className="story-section__copy">这份资料已经确认好了，回二级整理台挂回故事就好。</p>
                  )}
                </>
              ) : (
                <p>这份资料还没有可确认的整理结果。</p>
              )}
            </section>

            <section className="story-section" data-testid="asset-review-library-targets">
              <div className="story-section__header">
                <p className="story-section__eyebrow">它能去哪里</p>
                <h2 className="story-section__title">现在可以往哪些故事里去</h2>
              </div>
              {availableStoryTargets.length > 0 ? (
                <ul className="room-detail-list">
                  {availableStoryTargets.map((item) => (
                    <li key={item.story_id}>
                      <strong>{item.label}</strong>
                      <span> · {availabilityLabel(item.availability)}</span>
                      {item.reason ? <p>{item.reason}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂时没有可以去的故事。</p>
              )}
            </section>
          </div>

          <aside className="asset-review-sidebar">
            <section className="story-section asset-sidebar-card" data-testid="asset-review-attachments">
              <div className="story-section__header">
                <p className="story-section__eyebrow">已经影响了哪里</p>
                <h2 className="story-section__title">现在已经挂上的位置</h2>
              </div>
              {attachments.length > 0 ? (
                <ul className="asset-extract-list">
                  {attachments.map((item) => (
                    <li key={item.attachment_id}>
                      <strong>{item.target_label ?? "未命名故事"}</strong>
                      <p>
                        {targetTypeLabel(item.target_type)} · {usageModeLabel(item.usage_mode)} · {attachmentStatusLabel(item.status)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>当前还没有挂到任何故事里。</p>
              )}
            </section>

            <section className="story-section asset-sidebar-card" data-testid="asset-review-revoke-impact">
              <div className="story-section__header">
                <p className="story-section__eyebrow">撤下会影响什么</p>
                <h2 className="story-section__title">如果撤下，这些地方会一起受影响</h2>
              </div>
              {revokeImpact ? (
                <>
                  <p className="story-section__copy">
                    会影响 {revokeImpact.affected_attachment_ids.length} 个引用。
                    {revokeImpact.affected_story_targets.length > 0
                      ? ` 涉及 ${revokeImpact.affected_story_targets.map((item) => item.label).join("、")}`
                      : ""}
                  </p>
                  {revokeImpact.affected_story_targets.length > 0 ? (
                    <ul className="room-detail-list">
                      {revokeImpact.affected_story_targets.map((item) => (
                        <li key={item.story_id}>
                          <strong>{item.label}</strong>
                          <span> · {item.attachment_count} 个引用</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p>这份资料现在还没有可见的撤下影响。</p>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
