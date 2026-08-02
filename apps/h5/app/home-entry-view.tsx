"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FRONTSTAGE_ENTRY_ERROR, toFrontstageErrorCopy } from "./lib/frontstage-copy";
import { primeFrontstageSessionFromHref } from "./lib/account-surface-session";
import { createGuestChatSession } from "./lib/guest-session";
import { withLaunchTracking } from "./lib/launch-tracking";
import { normalizeInternalHref } from "./lib/navigation";

export function HomeEntryView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [starting, setStarting] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function handleImmediateStart() {
    if (starting) {
      return;
    }

    setStarting(true);
    setStartError(null);

    try {
      const deepLink = await createGuestChatSession();
      primeFrontstageSessionFromHref(deepLink);
      router.push(normalizeInternalHref(deepLink));
    } catch (reason) {
      setStartError(toFrontstageErrorCopy(reason, FRONTSTAGE_ENTRY_ERROR));
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="surface surface--landing landing-surface" data-testid="home-entry-page">
      <section className="page-intro page-intro--home home-entry-hero">
        <p className="page-intro__eyebrow">私人小说家</p>
        <h1 className="page-intro__title">先跟小韩说一句，她会先摸准你的口味，再把第一轮故事方向递到你手里。</h1>
        <p className="page-intro__lede">
          第一次打开，不用先学入口规则，也不用先判断该去哪个页面。先聊一句，她会先理解你，再把这一轮可以继续写下去的方向交给你。
        </p>
        <div className="home-entry-hero__result" data-testid="home-entry-primary-outcome">
          <p className="home-entry-hero__result-label">这一轮她会先交给你</p>
          <p className="home-entry-hero__result-value">你的读者档案 + 一个故事方向</p>
          <p className="home-entry-hero__result-copy">确认这一轮方向之后，再决定要不要继续去房间、阅读器和后续私聊。</p>
        </div>
        <ul className="tag-row">
          <li>默认私密</li>
          <li>先聊再继续</li>
          <li>先给第一轮方向</li>
        </ul>
        {startError ? <p className="story-microcopy story-microcopy--danger">{startError}</p> : null}
        <div className="page-intro__actions">
          <button className="primary-cta" type="button" disabled={starting} onClick={() => void handleImmediateStart()}>
            {starting ? "正在开始..." : "立即开始"}
          </button>
        </div>
        <p className="story-microcopy">第一步只有这一件事：先聊一句，让小韩接住你，而不是先把首页看成使用手册。</p>
      </section>

      <section className="story-section home-entry-support" data-testid="home-entry-support">
        <button
          aria-controls="home-entry-support-panel"
          aria-expanded={supportOpen}
          className="home-entry-support__toggle"
          type="button"
          onClick={() => setSupportOpen((current) => !current)}
        >
          {supportOpen ? "收起说明和其他入口" : "先看看说明和其他入口"}
        </button>
        {supportOpen ? (
          <div className="home-entry-support__panel" id="home-entry-support-panel">
            <p className="story-microcopy">
              这些入口都保留，但只负责辅助理解，不再和“立即开始”争同一层注意力。
            </p>
            <div
              className="story-shell-links story-cell-list story-cell-list--two home-entry-support__links"
              data-testid="home-entry-launch-links"
            >
              <Link className="story-cell story-cell--link" href={withLaunchTracking("/demo-stories", searchParams)}>
                <strong>查看示范故事</strong>
                <span>先判断自己更适合哪条故事线，再决定要不要开始。</span>
              </Link>
              <Link className="story-cell story-cell--link" href={withLaunchTracking("/faq", searchParams)}>
                <strong>查看使用说明</strong>
                <span>把默认私密、作品标识和反馈路径先看明白。</span>
              </Link>
              <Link className="story-cell story-cell--link" href={withLaunchTracking("/beta", searchParams)}>
                <strong>查看邀请入口说明</strong>
                <span>如果你手上有邀请信息，就从这里继续；没有也能先了解当前开放方式。</span>
              </Link>
              <Link className="story-cell story-cell--link" href={withLaunchTracking("/room", searchParams)}>
                <strong>先看游客房间</strong>
                <span>更想先感受房间空间的话，可以先从这里绕进去。</span>
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
