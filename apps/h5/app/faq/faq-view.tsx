"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LaunchTrackingStrip } from "../launch-tracking-strip";
import { readLaunchTracking, withLaunchTracking } from "../lib/launch-tracking";

const faqEntries = [
  {
    question: "这到底是聊天机器人，还是一个会长期连载的私人小说家？",
    answer:
      "对外体验入口是私聊，但真主链是“私聊立项 -> 章节连载 -> 房间/阅读器 -> 反馈与修正”。你不是来玩一句话生成器，而是把一部会持续更新的故事交给她。",
  },
  {
    question: "现在最适合什么样的读者先来？",
    answer:
      "最适合三类人：想看关系拉扯的私人阅读型、喜欢边看边改的共创导演型、以及有意难平想修复的读者。当前也开放升级爽文和悬疑奇幻样本，但会优先保证主承诺成立。",
  },
  {
    question: "为什么现在先用 H5 和私聊入口，而不是直接做原生 App？",
    answer:
      "因为现在要验证的是“被接住 + 被持续追更”的主链，而不是应用商店分发。H5 负责房间、阅读器、账户与导出，私聊入口负责高频催更与关系承接。",
  },
  {
    question: "故事默认公开吗？我的输入和生成内容会被别人看到吗？",
    answer:
      "默认私密。你的故事、章节、房间状态、导出结果都以账户真源隔离；只有你主动导出、分享或提交反馈时，相关对象才会进入相应流程。",
  },
  {
    question: "作品标识会不会被藏起来？",
    answer:
      "不会。导出、说明页和法律页都会明确标注作品标识；风险更高的内容会被额外审核和人工介入拦下来。",
  },
  {
    question: "如果写偏了、催更断了、或者渠道同步出问题怎么办？",
    answer:
      "进入后，你可以从聊天、房间、导出、账户页统一进入反馈与求助入口。高优先级问题会优先响应，复杂问题会进入持续跟进。",
  },
  {
    question: "现在已经支持哪些内容方向？",
    answer:
      "当前已经准备了女频关系驱动、男频升级爽文、意难平修复/同人转译、悬疑奇幻四条示范线，用来帮助你判断自己更适合哪种开坑方式。",
  },
  {
    question: "我怎么知道自己是从哪个渠道、哪位 KOL、哪张邀请码进来的？",
    answer:
      "邀请入口会保留这次来源信息，方便后续回看你是从哪一条邀请线进来的；这些信息只用来对齐入口和服务，不会抢主链体验。",
  },
];

export function FaqView() {
  const searchParams = useSearchParams();
  const trackingItems = readLaunchTracking(searchParams);
  const demoStoriesHref = withLaunchTracking("/demo-stories", searchParams, {
    faq_entry: "seed_user_faq",
  });
  const betaHref = withLaunchTracking("/beta", searchParams, {
    faq_entry: "seed_user_faq",
  });

  return (
    <main className="surface" data-testid="faq-page">
      <section className="page-intro">
        <p className="page-intro__eyebrow">使用说明</p>
        <h1 className="page-intro__title">先把入口规则、私密边界和支持路径讲清楚。</h1>
        <p className="page-intro__lede">
          这页只负责说明，不负责替主链讲故事。默认私密、作品标识、反馈路径和入口来源说明都以这里和法律页为准。
        </p>
        <div className="story-shell-links story-cell-list story-cell-list--two">
          <Link className="story-cell story-cell--link" href={demoStoriesHref}>
            <strong>先看示范故事</strong>
            <span>对自己更适合哪条故事线没有把握时，先从示范故事里挑，作为辅助理解层。</span>
          </Link>
          <Link className="story-cell story-cell--link" href={betaHref}>
            <strong>查看邀请入口说明</strong>
            <span>有邀请码就继续进入，没有也能先看入口和渠道说明，不会打断主链理解。</span>
          </Link>
        </div>
      </section>

      <LaunchTrackingStrip items={trackingItems} title="当前入口来源" />

      <section className="story-section">
        <div className="story-section__header">
          <p className="story-section__eyebrow">常见问题</p>
          <h2 className="story-section__title">把说明讲明白，但不把说明页做成主入口</h2>
        </div>
        <div className="proposal-grid">
          {faqEntries.map((item) => (
            <article key={item.question} className="proposal-card">
              <h2>{item.question}</h2>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="story-section">
        <div className="story-section__header">
          <p className="story-section__eyebrow">延伸阅读</p>
        </div>
        <div className="story-cell-list story-cell-list--three f9-link-grid">
          <Link className="story-cell story-cell--link" href="/legal/privacy">隐私政策</Link>
          <Link className="story-cell story-cell--link" href="/legal/terms">服务协议</Link>
          <Link className="story-cell story-cell--link" href="/legal/aigc">作品标识说明</Link>
        </div>
      </section>
    </main>
  );
}
