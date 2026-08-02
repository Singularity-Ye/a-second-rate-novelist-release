"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ReferenceAssetDetailResponse } from "@erliu/shared-contracts";
import {
  attachReferenceAsset,
  extractReferenceAsset,
  fetchReferenceAssetDetail,
  revokeReferenceAsset,
  uploadReferenceAsset,
} from "../../lib/assets-api";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import { AccountRecoveryStateCard } from "../../profile/account/control-plane-kit";

const filePresets = [
  {
    fileName: "station-moodboard.pdf",
    mimeType: "application/pdf",
    title: "风格样张",
    description: "适合整理语气、氛围和视觉想象。",
  },
  {
    fileName: "character-notes.md",
    mimeType: "text/markdown",
    title: "人物小传",
    description: "适合提炼角色设定、关系和冲突模式。",
  },
  {
    fileName: "world-rules.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    title: "世界规则",
    description: "适合提炼地点、规则与时间线背景。",
  },
];

const extractModeCards = [
  {
    value: "character,relationship",
    title: "人物与关系",
  },
  {
    value: "style,theme",
    title: "风格与母题",
  },
  {
    value: "location,conflict_pattern",
    title: "地点与冲突",
  },
];

const usageModeCards = [
  { value: "style", title: "归入风格" },
  { value: "lore", title: "归入世界设定" },
  { value: "character", title: "归入角色设定" },
  { value: "world_rule", title: "归入世界规则" },
  { value: "mood", title: "归入情绪氛围" },
];

function withQuery(path: string, queryString: string) {
  return queryString ? `${path}?${queryString}` : path;
}

function labelScope(value: string) {
  switch (value) {
    case "story":
      return "当前故事";
    case "user_private_library":
      return "私人资料库";
    default:
      return "资料库";
  }
}

function labelExtractStatus(value?: string | null) {
  switch (value) {
    case "ready":
      return "已经整理好";
    case "review_pending":
      return "等你确认";
    case "uploaded":
      return "刚放上书架";
    case "extracting":
      return "还在整理";
    case "failed":
      return "还没整理明白";
    case "attached":
    case "active":
      return "已经挂上";
    case "detached":
    case "revoked":
      return "已经撤下";
    default:
      return "还在整理";
  }
}

function labelAttachmentStatus(value?: string | null) {
  switch (value) {
    case "active":
    case "attached":
      return "已经挂上";
    case "revoked":
    case "detached":
      return "已经撤下";
    case "rejected":
      return "没有选中";
    case "suggested":
      return "建议中";
    case "accepted":
      return "已确认";
    default:
      return "还没定下来";
  }
}

function labelAvailability(value?: string | null) {
  switch (value) {
    case "available":
      return "可以去";
    case "blocked":
      return "暂时不能去";
    default:
      return "待确认";
  }
}

function labelUsageMode(value: string) {
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

function labelExtractType(value?: string | null) {
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

function deriveSurfaceStatus(detail: ReferenceAssetDetailResponse | null) {
  if (!detail) {
    return null;
  }

  if (detail.attachments.some((item) => item.status === "active")) {
    return "active";
  }

  if (detail.attachments.some((item) => item.status === "revoked")) {
    return "revoked";
  }

  return detail.asset.extract_status;
}

export function AssetWorkbenchView() {
  const session = useAccountSurfaceSession("/assets/workbench");
  const searchParams = useSearchParams();
  const [accountToken, setAccountToken] = useState("");
  const [targetStoryId, setTargetStoryId] = useState("");
  const [scope, setScope] = useState<"story" | "user_private_library">("story");
  const [fileName, setFileName] = useState("station-moodboard.pdf");
  const [mimeType, setMimeType] = useState("application/pdf");
  const [extractModes, setExtractModes] = useState("character,style");
  const [usageMode, setUsageMode] = useState<"style" | "lore" | "character" | "world_rule" | "mood">("style");
  const [assetId, setAssetId] = useState("");
  const [detail, setDetail] = useState<ReferenceAssetDetailResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const extractResults = detail?.extract_results ?? [];
  const attachments = detail?.attachments ?? [];
  const availableStoryTargets = detail?.available_story_targets ?? [];
  const revokeImpact = detail?.revoke_impact;
  const currentPreset = filePresets.find((item) => item.fileName === fileName) ?? filePresets[0]!;
  const surfaceStatus = status ?? deriveSurfaceStatus(detail);
  const baseContextQuery = useMemo(() => {
    const nextParams = new URLSearchParams(session.queryString);
    nextParams.delete("asset_id");
    return nextParams.toString();
  }, [session.queryString]);
  const reviewHref = assetId ? withQuery(`/assets/${assetId}/review`, baseContextQuery) : null;
  const libraryHref = withQuery("/assets", baseContextQuery);

  useEffect(() => {
    setAccountToken(session.accountToken ?? "");
  }, [session.accountToken]);

  useEffect(() => {
    const nextAssetId = searchParams.get("asset_id");
    if (nextAssetId) {
      setAssetId(nextAssetId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!assetId || detail?.asset.asset_id === assetId) {
      return;
    }

    let cancelled = false;
    setDetail(null);
    setError(null);

    fetchReferenceAssetDetail({
      asset_id: assetId,
    })
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("这份资料暂时打不开，等一下再试就好。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetId, detail?.asset.asset_id]);

  useEffect(() => {
    if (!detail) {
      setTargetStoryId(session.storyId ?? "");
      return;
    }

    const preferredTarget = availableStoryTargets.find(
      (item) => item.story_id === session.storyId && item.availability === "available",
    );
    const firstAvailable = availableStoryTargets.find((item) => item.availability === "available");

    setTargetStoryId(preferredTarget?.story_id ?? firstAvailable?.story_id ?? "");
  }, [availableStoryTargets, detail, session.storyId]);

  async function refreshDetail(nextAssetId: string) {
    const nextDetail = await fetchReferenceAssetDetail({
      asset_id: nextAssetId,
    });
    setDetail(nextDetail);
  }

  async function handleUpload() {
    if (!accountToken || !fileName.trim() || !mimeType.trim()) {
      setError("请先把账号、文件名和文件类型补齐。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await uploadReferenceAsset({
        account_token: accountToken,
        scope,
        file_name: fileName.trim(),
        mime_type: mimeType.trim(),
        ...(scope === "story" && session.storyId ? { story_id: session.storyId } : {}),
      });
      setAssetId(result.asset_id);
      setStatus(result.status);
      await refreshDetail(result.asset_id);
    } catch {
      setError("这份资料没保存下来，等一下再试就好。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExtract() {
    if (!assetId) {
      setError("先把资料保存下来，再开始整理。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await extractReferenceAsset({
        asset_id: assetId,
        extract_modes: extractModes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean) as Array<"character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern">,
      });
      setStatus(result.status);
      await refreshDetail(assetId);
    } catch {
      setError("这份资料还没整理开，等一下再试就好。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttach() {
    if (!assetId || !targetStoryId) {
      setError("先选一条能去的故事线。");
      return;
    }

    if (!detail || detail.asset.extract_status !== "ready") {
      setError("这份资料还没整理好，暂时不能挂上去。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await attachReferenceAsset({
        asset_id: assetId,
        target_type: "story",
        target_id: targetStoryId,
        usage_mode: usageMode,
      });
      setStatus(result.status);
      await refreshDetail(assetId);
    } catch {
      setError("这份资料没挂上去，等一下再试就好。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke() {
    if (!assetId) {
      setError("先把资料保存下来，再谈撤下。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await revokeReferenceAsset({
        asset_id: assetId,
        revoke_mode: "detach_all",
        reason: "资料整理撤下",
      });
      setStatus(result.status);
      await refreshDetail(assetId);
    } catch {
      setError("这份资料没撤下来，等一下再试就好。");
    } finally {
      setSubmitting(false);
    }
  }

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface asset-workbench-surface" data-testid="asset-workbench-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  return (
    <main className="surface asset-workbench-surface" data-testid="asset-workbench-page">
      <section className="page-intro asset-workbench-hero">
        <p className="page-intro__eyebrow">二级整理动作</p>
        <h1 className="page-intro__title">需要整理时，再来这张桌子</h1>
        <p className="page-intro__lede">这里负责保存资料、开始整理和把已确认内容挂回故事，但它只是资料库旁边的整理台，不是主入口。</p>
        <div className="page-intro__actions">
          <Link className="story-cell story-cell--link assets-home-cell" href={libraryHref}>
            <strong>回到资料库</strong>
            <span>先看现有资料，再决定这份材料放哪。</span>
          </Link>
          {reviewHref ? (
            <Link className="story-cell story-cell--link assets-home-cell" href={reviewHref}>
              <strong>查看这份资料的确认层</strong>
              <span>回到整理结果，核对它是什么、能去哪、影响了哪里。</span>
            </Link>
          ) : null}
        </div>
      </section>

      {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}

      <section className="story-section asset-workbench-snapshot">
        <div className="story-section__header">
          <p className="story-section__eyebrow">整理进度</p>
          <h2 className="story-section__title">这份资料现在走到哪一步了</h2>
        </div>
        <div className="story-cell-list story-cell-list--three">
          <div className="story-cell">
            <strong>{currentPreset.title}</strong>
            <span>{currentPreset.description}</span>
          </div>
          <div className="story-cell">
            <strong>{labelScope(scope)}</strong>
            <span>{scope === "story" ? "先跟着当前故事走" : "先放进私人资料库，后面再决定怎么用"}</span>
          </div>
          <div className="story-cell">
            <strong data-testid="asset-workbench-status">{labelExtractStatus(surfaceStatus)}</strong>
            <span>保存、整理、挂回故事和撤下的结果，都会在这里回显。</span>
          </div>
        </div>
      </section>

      <div className="asset-workbench-layout">
        <div className="asset-workbench-main">
          <section className="story-section asset-step-card" data-testid="asset-workbench-form">
            <div className="story-section__header">
              <p className="story-section__eyebrow">先保存资料</p>
              <h2 className="story-section__title">先决定这份资料先放哪</h2>
              <p className="story-section__copy">
                这份资料可以先跟着当前故事，也可以先放进私人资料库；默认不会自己跑去别的地方。
              </p>
            </div>
            <div className="asset-choice-grid">
              {filePresets.map((item) => (
                <button
                  key={item.fileName}
                  className="asset-choice-card"
                  data-selected={fileName === item.fileName}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setFileName(item.fileName);
                    setMimeType(item.mimeType);
                  }}
                >
                  <span>{item.title}</span>
                  <strong>{item.description}</strong>
                </button>
              ))}
            </div>
            <div className="asset-inline-grid">
              <div className="story-cell">
                <strong>当前资料</strong>
                <span>{currentPreset.title}</span>
              </div>
              <div className="story-cell">
                <strong>保存范围</strong>
                <span>{labelScope(scope)}</span>
              </div>
            </div>
            <div className="f9-button-row">
              <button
                type="button"
                className={scope === "story" ? undefined : "secondary-button"}
                disabled={submitting}
                onClick={() => {
                  setScope("story");
                }}
              >
                放进当前故事
              </button>
              <button
                type="button"
                className={scope === "user_private_library" ? undefined : "secondary-button"}
                disabled={submitting}
                onClick={() => {
                  setScope("user_private_library");
                }}
              >
                先放进私人资料库
              </button>
              <button type="button" disabled={submitting} onClick={() => void handleUpload()}>
                先保存这份资料
              </button>
            </div>
          </section>

          <section className="story-section asset-step-card">
            <div className="story-section__header">
              <p className="story-section__eyebrow">整理内容</p>
              <h2 className="story-section__title">把原文变成可复用的卡片</h2>
              <p className="story-section__copy">先整理出卡片，再去资料确认层决定哪些内容留下来。</p>
            </div>
            <div className="asset-choice-grid">
              {extractModeCards.map((item) => (
                <button
                  key={item.value}
                  className="asset-choice-card"
                  data-selected={extractModes === item.value}
                  type="button"
                  disabled={submitting || !assetId}
                  onClick={() => {
                    setExtractModes(item.value);
                  }}
                >
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
            <div className="f9-button-row">
              <button type="button" disabled={submitting || !assetId} onClick={() => void handleExtract()}>
                开始整理这份资料
              </button>
            </div>
            {detail ? (
              extractResults.length > 0 ? (
                <>
                  <ul className="asset-extract-list">
                    {extractResults.map((item) => (
                      <li key={item.extract_ref_id}>
                        <strong>{labelExtractType(item.extract_type)}</strong>
                        <p>{labelAttachmentStatus(item.status)}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="story-section__copy">
                    {detail.asset.extract_status === "review_pending"
                      ? "整理结果已经准备好，下一步去资料确认层勾选要留下的内容。"
                      : "这份资料已经确认过，可以回到下面把它挂回故事。"}
                  </p>
                  {reviewHref ? (
                    <div className="f9-button-row">
                      <Link className="secondary-button" href={reviewHref}>
                        去确认这份资料
                      </Link>
                    </div>
                  ) : null}
                </>
              ) : (
                <p>还没有可确认的内容，先继续整理或回到资料库重新保存。</p>
              )
            ) : null}
          </section>

          <section className="story-section asset-step-card">
            <div className="story-section__header">
              <p className="story-section__eyebrow">挂回故事</p>
              <h2 className="story-section__title">把资料放进真正要用它的故事里</h2>
              <p className="story-section__copy">故事里的资料不会到处乱跑；私人资料库里的内容，可以再选一条故事线挂上去。</p>
            </div>
            {availableStoryTargets.length > 0 ? (
              <div className="asset-choice-grid">
                {availableStoryTargets.map((item) => (
                  <button
                    key={item.story_id}
                    className="asset-choice-card"
                    data-selected={targetStoryId === item.story_id}
                    type="button"
                    disabled={submitting || item.availability !== "available"}
                    onClick={() => {
                      setTargetStoryId(item.story_id);
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{labelAvailability(item.availability)}</strong>
                    <p>{item.reason ?? "点选后会作为这份资料的下一站。"}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="story-microcopy">上传后会在这里显示可去的故事。</p>
            )}
            <div className="asset-choice-grid">
              {usageModeCards.map((item) => (
                <button
                  key={item.value}
                  className="asset-choice-card"
                  data-selected={usageMode === item.value}
                  type="button"
                  disabled={submitting || !assetId}
                  onClick={() => {
                    setUsageMode(item.value as "style" | "lore" | "character" | "world_rule" | "mood");
                  }}
                >
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
            <p>
              当前选择：
              {targetStoryId
                ? availableStoryTargets.find((item) => item.story_id === targetStoryId)?.label ?? targetStoryId
                : "还没选定能去的故事"}
            </p>
            <div className="f9-button-row">
              <button
                type="button"
                disabled={submitting || !assetId || !targetStoryId || detail?.asset.extract_status !== "ready"}
                onClick={() => void handleAttach()}
              >
                挂到这条故事里
              </button>
              <button type="button" disabled={submitting || !assetId} onClick={() => void handleRevoke()}>
                撤下这份引用
              </button>
            </div>
          </section>
        </div>

        <aside className="asset-workbench-sidebar">
          <section className="story-section asset-sidebar-card">
            <div className="story-section__header">
              <p className="story-section__eyebrow">当前情况</p>
              <h2 className="story-section__title">这份资料现在是什么状态</h2>
            </div>
            {detail ? (
              <>
                <div className="story-cell">
                  <strong>整理状态</strong>
                  <span>{labelExtractStatus(detail.asset.extract_status)}</span>
                </div>
                <div className="story-cell">
                  <strong>资料归属</strong>
                  <span>{detail.scope_label ?? labelScope(detail.asset.scope)}</span>
                </div>
                <div className="story-cell">
                  <strong>挂上的位置</strong>
                  <span>
                    {attachments.map((item) => `${item.target_label ?? "未命名故事"} · ${labelAttachmentStatus(item.status)}`).join(" / ") ||
                      "还没有挂上任何故事"}
                  </span>
                </div>
                {revokeImpact ? (
                  <div className="story-cell">
                    <strong>撤下影响</strong>
                    <span>
                      会影响 {revokeImpact.affected_attachment_ids.length} 个引用
                      {revokeImpact.affected_story_targets.length > 0
                        ? `，涉及 ${revokeImpact.affected_story_targets.map((item) => item.label).join("、")}`
                        : ""}
                    </span>
                  </div>
                ) : null}
                {reviewHref ? (
                  <Link className="secondary-button" href={reviewHref}>
                    查看这份资料的确认层
                  </Link>
                ) : null}
              </>
            ) : (
              <p>还没有整理结果，先把资料保存下来。</p>
            )}
          </section>

          <section className="story-section asset-sidebar-card">
            <div className="story-section__header">
              <p className="story-section__eyebrow">使用规则</p>
              <h2 className="story-section__title">这几条规则不会变</h2>
            </div>
            <ul className="room-detail-list">
              <li>
                <strong>默认私有</strong>
                <span>用户上传素材默认只对本人和本人项目可见。</span>
              </li>
              <li>
                <strong>先整理再复用</strong>
                <span>未确认的原文不会直接进入后续写作。</span>
              </li>
              <li>
                <strong>来源可追溯</strong>
                <span>挂上、撤下、复用都要能看见来源和影响范围。</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
