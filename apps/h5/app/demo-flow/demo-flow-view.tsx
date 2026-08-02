"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LaunchTrackingStrip } from "../launch-tracking-strip";
import { buildFeedbackHref } from "../lib/beta-ops-links";
import { readLaunchTracking, withLaunchTracking } from "../lib/launch-tracking";
import { withSessionContext } from "../lib/navigation";

const INTERNAL_ORIGIN = "http://127.0.0.1:3000";

type DemoFlowSearchParams = Pick<URLSearchParams, "get">;

interface DemoFlowContext {
  token: string | null;
  accountToken: string | null;
  storyIdSnake: string | null;
  storyIdCamel: string | null;
  chapterIdSnake: string | null;
  chapterIdCamel: string | null;
}

function readDemoFlowContext(
  searchParams: DemoFlowSearchParams,
  forcedContext?: {
    token?: string | null;
    accountToken?: string | null;
  },
): DemoFlowContext {
  return {
    token: searchParams.get("token") ?? forcedContext?.token ?? null,
    accountToken: searchParams.get("account_token") ?? forcedContext?.accountToken ?? null,
    storyIdSnake: searchParams.get("story_id"),
    storyIdCamel: searchParams.get("storyId"),
    chapterIdSnake: searchParams.get("chapter_id"),
    chapterIdCamel: searchParams.get("chapterId"),
  };
}

function readTargetStoryId(
  context: DemoFlowContext,
  targetKey: "story_id" | "storyId",
) {
  return targetKey === "storyId" ? context.storyIdCamel ?? context.storyIdSnake : context.storyIdSnake ?? context.storyIdCamel;
}

function readTargetChapterId(
  context: DemoFlowContext,
  targetKey: "chapter_id" | "chapterId",
) {
  return targetKey === "chapterId"
    ? context.chapterIdCamel ?? context.chapterIdSnake
    : context.chapterIdSnake ?? context.chapterIdCamel;
}

function hasContextConflict(left: string | null, right: string | null) {
  return Boolean(left && right && left !== right);
}

function buildDemoFlowHref(
  target: string,
  searchParams: DemoFlowSearchParams,
  forcedContext: {
    token?: string | null;
    accountToken?: string | null;
  } = {},
  options: {
    mirrorStoryQueryKey?: "story_id" | "storyId";
    mirrorChapterQueryKey?: "chapter_id" | "chapterId";
    sessionStrategy?: "token_first" | "account_only";
  } = {},
) {
  const context = readDemoFlowContext(searchParams, forcedContext);
  const trackedHref = withLaunchTracking(target, searchParams);
  const sessionInput =
    options.sessionStrategy === "account_only"
      ? {
          token: null,
          accountToken: context.accountToken,
        }
      : {
          token: context.token,
          accountToken: context.accountToken,
        };
  const sessionHref = withSessionContext(trackedHref, {
    token: sessionInput.token,
    accountToken: sessionInput.accountToken,
  }, { preserveSessionQuery: true });
  const url = new URL(sessionHref, INTERNAL_ORIGIN);

  for (const [key, value] of [
    ["story_id", context.storyIdSnake],
    ["storyId", context.storyIdCamel],
    ["chapter_id", context.chapterIdSnake],
    ["chapterId", context.chapterIdCamel],
  ] as const) {
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  if (options.mirrorStoryQueryKey) {
    const storyId = readTargetStoryId(context, options.mirrorStoryQueryKey);
    if (storyId && !url.searchParams.has(options.mirrorStoryQueryKey)) {
      url.searchParams.set(options.mirrorStoryQueryKey, storyId);
    }
  }

  if (options.mirrorChapterQueryKey) {
    const chapterId = readTargetChapterId(context, options.mirrorChapterQueryKey);
    if (chapterId && !url.searchParams.has(options.mirrorChapterQueryKey)) {
      url.searchParams.set(options.mirrorChapterQueryKey, chapterId);
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function buildReaderHref(
  searchParams: DemoFlowSearchParams,
  forcedContext: {
    token?: string | null;
    accountToken?: string | null;
  } = {},
) {
  const context = readDemoFlowContext(searchParams, forcedContext);

  if (
    hasContextConflict(context.storyIdSnake, context.storyIdCamel) ||
    hasContextConflict(context.chapterIdSnake, context.chapterIdCamel)
  ) {
    return null;
  }

  const storyId = readTargetStoryId(context, "story_id");
  const chapterId = readTargetChapterId(context, "chapter_id");

  if (!storyId || !chapterId) {
    return null;
  }

  return buildDemoFlowHref(
    `/stories/${encodeURIComponent(storyId)}/chapters/${encodeURIComponent(chapterId)}`,
    searchParams,
    forcedContext,
  );
}

export function DemoFlowView({
  forcedToken,
  forcedAccountToken,
}: {
  forcedToken?: string | null;
  forcedAccountToken?: string | null;
} = {}) {
  const searchParams = useSearchParams();
  const forcedContext = {
    ...(forcedAccountToken === undefined ? {} : { accountToken: forcedAccountToken }),
    ...(forcedToken === undefined ? {} : { token: forcedToken }),
  };
  const context = readDemoFlowContext(searchParams, forcedContext);
  const trackingItems = readLaunchTracking(searchParams);
  const readerHref = buildReaderHref(searchParams, forcedContext);
  const hasStoryConflict = hasContextConflict(context.storyIdSnake, context.storyIdCamel);
  const hasChapterConflict = hasContextConflict(context.chapterIdSnake, context.chapterIdCamel);
  const homeHref = buildDemoFlowHref("/", searchParams, forcedContext);
  const demoStoriesHref = buildDemoFlowHref("/demo-stories", searchParams, forcedContext);
  const faqHref = buildDemoFlowHref("/faq", searchParams, forcedContext);
  const betaHref = buildDemoFlowHref("/beta", searchParams, forcedContext);
  const chatHref = buildDemoFlowHref("/chat", searchParams, forcedContext, {
    mirrorStoryQueryKey: "storyId",
  });
  const roomHref = buildDemoFlowHref("/room", searchParams, forcedContext, {
    mirrorStoryQueryKey: "storyId",
  });
  const accountHref = buildDemoFlowHref("/profile/account", searchParams, forcedContext, {
    mirrorStoryQueryKey: "story_id",
    sessionStrategy: "account_only",
  });
  const feedbackHref = buildDemoFlowHref(
    buildFeedbackHref({
      surface: "account",
      account_token: context.accountToken,
      story_id: readTargetStoryId(context, "story_id"),
      target_type: "account_overview",
      target_id: "demo-flow-self-serve",
      target_label: "demo-flow 验收链",
    }),
    searchParams,
    forcedContext,
    {
      sessionStrategy: "account_only",
    },
  );
  const notificationsHref = buildDemoFlowHref("/notifications", searchParams, forcedContext, {
    sessionStrategy: "account_only",
  });

  const guideCards = [
    {
      eyebrow: "Step 1",
      title: "首页先确认首访主链",
      body: "先看“立即开始”是否仍是主动作，确认首页在讲关系主链，而不是把你丢回说明页。",
      passCopy: "通过标准：你一眼就知道先点哪里，示范故事 / FAQ / Beta 只是 support layer。",
      href: homeHref,
      cta: "回首页看首访主链",
      faqCta: "首页配套看 FAQ",
    },
    {
      eyebrow: "Step 2",
      title: "示范故事和 FAQ 只做辅助判断",
      body: "再看示范故事与 FAQ 是否仍服务于题材判断、规则解释和默认私密，而不是抢首页主任务。",
      passCopy: "通过标准：support 页面能解释题材、AIGC 与反馈规则，但不会替代主链。",
      href: demoStoriesHref,
      cta: "看示范故事",
      faqCta: "示范故事配套看 FAQ",
    },
    {
      eyebrow: "Step 3",
      title: "Beta 负责把人接进真实继续动作",
      body: "最后看 Beta 是否把 invite、chat、room 和后续动作串起来，而不是让你手工记一串 scattered deep links。",
      passCopy: "通过标准：你知道下一步该去聊天、房间、反馈还是通知，不需要自己拼 query。",
      href: betaHref,
      cta: "进 Beta 面板",
      faqCta: "Beta 配套看 FAQ",
    },
  ];

  const checklist = [
    "首页：`立即开始` 仍然是首访第一步，support links 退居辅助层。",
    "Demo / FAQ：你能快速判断题材、默认私密、AIGC 标识和 support 规则。",
    "Beta：`available / exhausted / invalid` 状态清楚，不再靠 500 或口头解释。",
    "继续动作：能从 rail 直接跳进聊天、房间或阅读器，不需要补手工 deep link。",
    "收口：知道去哪里看账号总览、提反馈、收通知；导出结果仍按 export deep link fallback 进入。",
  ];

  return (
    <main className="surface" data-testid="demo-flow-page">
      <section className="hero-card">
        <p className="hero-card__eyebrow">shared-dev self-serve acceptance rail</p>
        <h1>把 scattered 页面重新串成一条你自己能点完的 demo flow。</h1>
        <p>
          这个 `/demo-flow` 不是新 onboarding 产品，而是 shared-dev 的 self-serve 验收入口。上半区告诉你先点哪里、每一步看什么，
          下半区把聊天、房间、阅读器、反馈和通知入口收成一条可回跳的 acceptance rail。
        </p>
        <ul className="tag-row">
          <li>不改首页主 CTA</li>
          <li>围绕真实页面编排</li>
          <li>首访主链 + Support 收口</li>
        </ul>
      </section>

      <LaunchTrackingStrip items={trackingItems} title="当前 demo flow 命中的 launch / attribution 标签" />

      <section className="panel-card">
        <p className="panel-card__eyebrow">当前 URL 已捕获上下文</p>
        <ul className="tag-row">
          <li>{context.token ? `token=${context.token}` : "缺少 token"}</li>
          <li>{context.accountToken ? `account_token=${context.accountToken}` : "缺少 account_token"}</li>
          <li>
            {context.storyIdSnake
              ? `story_id=${context.storyIdSnake}`
              : context.storyIdCamel
                ? `storyId=${context.storyIdCamel}`
                : "缺少 story_id/storyId"}
          </li>
          <li>
            {context.chapterIdSnake
              ? `chapter_id=${context.chapterIdSnake}`
              : context.chapterIdCamel
                ? `chapterId=${context.chapterIdCamel}`
                : "缺少 chapter_id/chapterId"}
          </li>
        </ul>
        <p>
          这一区只负责把你当前 URL 已有的上下文继续透传下去。缺少的 token / account_token 仍然建议先去首页或 Beta 拿真实会话，再回来继续点。
        </p>
      </section>

      {hasStoryConflict || hasChapterConflict ? (
        <section className="panel-card" data-testid="demo-flow-context-warning">
          <p className="panel-card__eyebrow">上下文冲突</p>
          <p>
            检测到 `story_id/storyId` 或 `chapter_id/chapterId` 的值不一致。rail 会原样保留现有 query；聊天/房间优先沿用
            `storyId`，反馈/账号优先沿用 `story_id`，阅读器直达入口会先隐藏，建议回到上一跳确认真实上下文。
          </p>
        </section>
      ) : null}

      <section className="panel-card">
        <p className="panel-card__eyebrow">流程导览</p>
        <div className="proposal-grid">
          {guideCards.map((item) => (
            <article key={item.title} className="proposal-card">
              <p className="proposal-card__eyebrow">{item.eyebrow}</p>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              <p>{item.passCopy}</p>
              <div className="f9-link-grid">
                <Link aria-label={item.cta} href={item.href}>
                  {item.cta}
                </Link>
                {item.href !== faqHref ? (
                  <Link aria-label={item.faqCta} href={faqHref}>
                    看 FAQ
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <p className="panel-card__eyebrow">验收清单</p>
        <div className="proposal-grid">
          {checklist.map((item) => (
            <article key={item} className="proposal-card">
              <h2>检查点</h2>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <p className="panel-card__eyebrow">快速入口 / 深链</p>
        <div className="action-grid">
          <Link aria-label="继续去聊天" className="action-card" href={chatHref}>
            <strong>继续去聊天</strong>
            <span>适合继续验证“被理解”之后的主线程承接。</span>
          </Link>
          <Link aria-label="继续去房间" className="action-card" href={roomHref}>
            <strong>继续去房间</strong>
            <span>查看书桌、电脑、邮箱这些真实继续动作是否已经接上。</span>
          </Link>
          <Link aria-label="打开账号总览" className="action-card" href={accountHref}>
            <strong>打开账号总览</strong>
            <span>回看保存与账号、故事槽位、通知与恢复动作是否已经接通。</span>
          </Link>
          {readerHref ? (
            <Link aria-label="打开阅读器" className="action-card" href={readerHref}>
              <strong>打开阅读器</strong>
              <span>如果 URL 已带 `story_id / chapter_id`，直接跳到章节阅读面。</span>
            </Link>
          ) : null}
          <Link aria-label="去反馈页留问题" className="action-card" href={feedbackHref}>
            <strong>去反馈页留问题</strong>
            <span>把这轮 demo flow 里发现的产品或体验问题直接落到 support 流程。</span>
          </Link>
          <Link aria-label="打开通知中心" className="action-card" href={notificationsHref}>
            <strong>打开通知中心</strong>
            <span>确认房间邮箱 / 通知中心是否能承接后续提醒与回流。</span>
          </Link>
        </div>
      </section>

      <section className="panel-card">
        <p className="panel-card__eyebrow">回跳说明</p>
        <ul className="f9-bullet-list">
          <li>support 页面验完后，直接浏览器后退就能回到 `/demo-flow`，当前 tracking / session / story 上下文会继续保留。</li>
          <li>聊天 / 房间使用 `token` 和 `storyId`；反馈 / 账号使用 `account_token` 和 `story_id`；阅读器需要同时拿到故事与章节上下文。</li>
          <li>导出结果页还需要具体 export job deep link；如果这轮 URL 没有 job 上下文，继续从验收包或故事导出页进入。</li>
        </ul>
      </section>
    </main>
  );
}
