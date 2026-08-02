"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReferenceAssetLibraryResponse } from "@erliu/shared-contracts";
import { fetchReferenceAssetLibrary } from "../lib/assets-api";
import { useAccountSurfaceSession } from "../lib/account-surface-session";
import {
  FRONTSTAGE_ACCOUNT_ERROR,
  FRONTSTAGE_LOADING,
  toAssetStatusLabel,
  toFrontstageErrorCopy,
} from "../lib/frontstage-copy";
import { AccountRecoveryStateCard } from "../profile/account/control-plane-kit";

type AssetEntry = ReferenceAssetLibraryResponse["shelves"][number]["entries"][number];

function withQuery(path: string, queryString: string) {
  return queryString ? `${path}?${queryString}` : path;
}

function assetCountLabel(count: number) {
  return count === 1 ? "1 份" : `${count} 份`;
}

function getAssetUpdateTime(asset: AssetEntry) {
  const parsed = new Date(asset.last_updated_at).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickMostRecentAsset(library: ReferenceAssetLibraryResponse | null) {
  const entries = library?.shelves.flatMap((shelf) => shelf.entries) ?? [];

  return entries.reduce<AssetEntry | null>((current, candidate) => {
    if (!current) {
      return candidate;
    }

    return getAssetUpdateTime(candidate) > getAssetUpdateTime(current) ? candidate : current;
  }, null);
}

function formatRecentAssetTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "最近更新";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function AssetsHomeView() {
  const session = useAccountSurfaceSession("/assets");
  const queryString = session.queryString;
  const [library, setLibrary] = useState<ReferenceAssetLibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "story" | "user_private_library">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "uploaded" | "review_pending" | "ready" | "failed" | "revoked">(
    "all",
  );

  useEffect(() => {
    if (!session.accountToken) {
      setLibrary(null);
      setError(FRONTSTAGE_ACCOUNT_ERROR);
      return;
    }

    setError(null);
    fetchReferenceAssetLibrary({
      account_token: session.accountToken,
      ...(session.storyId ? { story_id: session.storyId } : {}),
      ...(searchQuery ? { query: searchQuery } : {}),
      scope: scopeFilter,
      status: statusFilter,
    })
      .then((nextLibrary) => {
        setLibrary(nextLibrary);
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, "这页资料库暂时还没整理出来。"));
      });
  }, [scopeFilter, searchQuery, session.accountToken, session.storyId, statusFilter]);

  const storyShelf = library?.shelves.find((shelf) => shelf.shelf_id === "story_live");
  const privateShelf = library?.shelves.find((shelf) => shelf.shelf_id === "private_library");
  const recentAsset = pickMostRecentAsset(library);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface assets-home-surface" data-testid="assets-home-page">
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
    <main className="surface assets-home-surface" data-testid="assets-home-page">
      <section className="page-intro assets-home-intro">
        <p className="page-intro__eyebrow">私人资料库</p>
        <h1 className="page-intro__title">先看最近一份资料，书架会顺着你继续</h1>
        <p className="page-intro__lede">
          这里先放你自己的资料、当前故事正在用的资料，以及最近一份该先看的内容。先读最近的，再去整理。
        </p>
        {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
        {!library && !error ? <p className="story-microcopy">{FRONTSTAGE_LOADING.assets}</p> : null}
        <div className="story-cell assets-home-recent-card" data-testid="assets-home-recent-asset">
          {recentAsset ? (
            <>
              <p className="story-section__eyebrow">最近一份资料</p>
              <strong>{recentAsset.file_name}</strong>
              <p>{recentAsset.lineage_note}</p>
              <small>
                {recentAsset.scope_label} · {toAssetStatusLabel(recentAsset.extract_status)} · 最近更新{" "}
                {formatRecentAssetTime(recentAsset.last_updated_at)}
              </small>
            </>
          ) : (
            <>
              <p className="story-section__eyebrow">最近一份资料</p>
              <strong>你还没有放进第一份资料</strong>
              <p>先把第一份资料挂进书架，之后这里就会先告诉你下一份该看哪一份。</p>
              <small>整理资料会保留，但不会抢在最近资料前面。</small>
            </>
          )}
        </div>
        <div className="page-intro__actions assets-home-actions">
          {recentAsset ? (
            <Link className="primary-cta assets-home-primary-link" href={withQuery(`/assets/${recentAsset.asset_id}/review`, queryString)}>
              继续最近一份资料
            </Link>
          ) : (
            <Link className="primary-cta assets-home-primary-link" href={withQuery("/assets/workbench", queryString)}>
              放进第一份资料
            </Link>
          )}
          {recentAsset ? (
            <Link className="secondary-cta assets-home-secondary-link" href={withQuery("/assets/workbench", queryString)}>
              再放一份资料
            </Link>
          ) : (
            <Link className="secondary-cta assets-home-secondary-link" href="#assets-home-shelves">
              先看书架
            </Link>
          )}
        </div>
        <p className="story-microcopy">整理资料放在后面，先看最近的那一份。</p>
      </section>

      <section className="story-section assets-home-shelf" id="assets-home-shelves">
        <div className="story-section__header">
          <p className="story-section__eyebrow">{storyShelf?.title ?? "当前故事书架"}</p>
          <h2 className="story-section__title">这本故事现在在翻哪几份资料</h2>
          <p className="story-section__copy">
            {storyShelf?.description ?? "进入故事后，这里会显示它正在用的资料。"} 现在有 {assetCountLabel(library?.active_attachment_count ?? 0)} 已经挂进这本书里。
          </p>
        </div>
        <div className="story-cell-list assets-home-library-grid">
          {storyShelf && storyShelf.entries.length > 0 ? (
            storyShelf.entries.map((entry) => (
              <Link
                key={`story-${entry.asset_id}`}
                className="story-cell story-cell--link assets-home-library-card"
                href={withQuery(`/assets/${entry.asset_id}/review`, queryString)}
              >
                <strong>{entry.file_name}</strong>
                <span>{entry.scope_label}</span>
                <p>{entry.lineage_note}</p>
                <small>{`已经整理好 ${entry.extract_count} 条线索，现在挂在 ${entry.active_attachment_count} 处继续生效`}</small>
              </Link>
            ))
          ) : (
            <div className="story-cell assets-home-library-card">
              <strong>这本故事还没有用上资料</strong>
              <span>先把人物小传、风格样张或世界规则放上来，再决定要不要挂进这条故事线。</span>
            </div>
          )}
        </div>
      </section>

      <section className="story-section assets-home-shelf">
        <div className="story-section__header">
          <p className="story-section__eyebrow">{privateShelf?.title ?? "私人资料库"}</p>
          <h2 className="story-section__title">还没挂进故事的私藏</h2>
          <p className="story-section__copy">
            {privateShelf?.description ?? "默认先放在你的资料库里，不会自己跑去别的故事。"} 现在有 {assetCountLabel(library?.reusable_asset_count ?? 0)} 还留在你自己的书架里。
          </p>
        </div>
        <div className="story-cell-list assets-home-library-grid">
          {privateShelf && privateShelf.entries.length > 0 ? (
            privateShelf.entries.map((entry) => (
              <Link
                key={`private-${entry.asset_id}`}
                className="story-cell story-cell--link assets-home-library-card"
                href={withQuery(`/assets/${entry.asset_id}/review`, queryString)}
              >
                <strong>{entry.file_name}</strong>
                <span>{toAssetStatusLabel(entry.extract_status)}</span>
                <p>{entry.lineage_note}</p>
                <small>
                  {entry.active_story_labels.length > 0
                    ? `已复用到 ${entry.active_story_labels.join("、")}`
                    : "还没有挂进任何故事"}
                </small>
              </Link>
            ))
          ) : (
            <div className="story-cell assets-home-library-card">
              <strong>私人资料库还是空的</strong>
              <span>第一份资料可以先放在这里，之后想挂去哪本故事都更自由。</span>
            </div>
          )}
        </div>
      </section>

      <section className="story-section assets-home-filters">
        <div className="story-section__header">
          <p className="story-section__eyebrow">找一份资料</p>
          <h2 className="story-section__title">想精确找时，再把书架收窄</h2>
          <p className="story-section__copy">搜索、范围和整理状态都放在这里，别让筛选器抢在书架前面。</p>
        </div>
        <details
          className="assets-home-filter-details"
          open={Boolean(searchQuery) || scopeFilter !== "all" || statusFilter !== "all"}
        >
          <summary>打开搜索和筛选</summary>
          <div className="assets-home-search-row">
            <label className="assets-home-search-field">
              <span>搜索资料名 / 故事名</span>
              <input
                aria-label="搜索资料"
                type="search"
                value={searchQuery}
                placeholder="例如：风格样张、雨夜列车"
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                }}
              />
            </label>
          </div>
          <div className="story-cell-list story-cell-list--two assets-home-filter-grid">
            <div className="story-cell">
              <strong>作用范围</strong>
              <div className="tag-row">
                <button type="button" className={scopeFilter === "all" ? undefined : "secondary-button"} onClick={() => setScopeFilter("all")}>
                  全部
                </button>
                <button type="button" className={scopeFilter === "story" ? undefined : "secondary-button"} onClick={() => setScopeFilter("story")}>
                  当前故事
                </button>
                <button
                  type="button"
                  className={scopeFilter === "user_private_library" ? undefined : "secondary-button"}
                  onClick={() => setScopeFilter("user_private_library")}
                >
                  私人资料库
                </button>
              </div>
            </div>
            <div className="story-cell">
              <strong>整理状态</strong>
              <div className="tag-row">
                <button type="button" className={statusFilter === "all" ? undefined : "secondary-button"} onClick={() => setStatusFilter("all")}>
                  全部
                </button>
                <button
                  type="button"
                  className={statusFilter === "ready" ? undefined : "secondary-button"}
                  onClick={() => setStatusFilter("ready")}
                >
                  已整理好
                </button>
                <button
                  type="button"
                  className={statusFilter === "review_pending" ? undefined : "secondary-button"}
                  onClick={() => setStatusFilter("review_pending")}
                >
                  等你确认
                </button>
              </div>
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}
