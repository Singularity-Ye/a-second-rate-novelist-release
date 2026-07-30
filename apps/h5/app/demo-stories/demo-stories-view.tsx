"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LaunchTrackingStrip } from "../launch-tracking-strip";
import { readLaunchTracking, withLaunchTracking } from "../lib/launch-tracking";
import { demoStoryPack } from "./demo-story-pack";

export function DemoStoriesView() {
  const searchParams = useSearchParams();
  const trackingItems = readLaunchTracking(searchParams);
  const faqHref = withLaunchTracking("/faq", searchParams, {
    ref: "demo_story_pack",
  });
  const betaHref = withLaunchTracking("/beta", searchParams, {
    ref: "demo_story_pack",
  });

  return (
    <main className="surface" data-testid="demo-stories-page">
      <section className="hero-card">
        <p className="hero-card__eyebrow">示范故事</p>
        <h1>先看四条示范故事，再决定要不要把你的坑交给她。</h1>
        <p>
          这不是临时拼的截图墙，而是一组不同题材、不同承诺、不同触发词的示范故事，帮你快速判断自己适不适合把故事交给她。
        </p>
        <div className="action-grid">
          <Link className="action-card" href={betaHref}>
            <strong>看邀请入口</strong>
            <span>有邀请信息就继续进入，没有也能先看入口说明。</span>
          </Link>
          <Link className="action-card" href={faqHref}>
            <strong>看使用说明</strong>
            <span>先把默认私密、作品标识、渠道与反馈规则看清楚。</span>
          </Link>
        </div>
      </section>

      <LaunchTrackingStrip items={trackingItems} title="当前入口来源" />

      <section className="panel-card">
        <p className="panel-card__eyebrow">示范故事</p>
        <div className="proposal-grid">
          {demoStoryPack.map((item) => {
            const storyBetaHref = withLaunchTracking("/beta", searchParams, {
              invite_code: item.invite_code,
              source_channel: item.source_channel,
              source_label: item.source_label,
              campaign_key: item.campaign_key,
              demo_story: item.slug,
            });

            return (
              <article
                key={item.slug}
                id={item.slug}
                className="proposal-card"
                data-testid={`demo-story-card-${item.slug}`}
              >
                <p className="proposal-card__eyebrow">{item.lane}</p>
                <h2>{item.title}</h2>
                <p>{item.hook}</p>
                <p>{item.promise}</p>
                <p>
                  <strong>适合谁：</strong>
                  {item.audience}
                </p>
                <p>
                  <strong>为什么把它放进示范故事：</strong>
                  {item.why_it_works}
                </p>
                <blockquote>{item.excerpt}</blockquote>
                <ul className="tag-row">
                  {item.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
                <div className="f9-link-grid">
                  <Link href={storyBetaHref}>用《{item.title}》这条线继续</Link>
                  <Link href={faqHref}>先看使用说明</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
