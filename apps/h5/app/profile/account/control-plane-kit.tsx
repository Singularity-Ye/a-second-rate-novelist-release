"use client";

import Link from "next/link";
import React, { type ReactNode } from "react";
import type { AccountSurfaceRecoveryState } from "../../lib/account-surface-session";

export type ControlTone = "live" | "soft" | "reserved" | "alert";

export function withAccountQuery(path: string, queryString: string) {
  return queryString ? `${path}?${queryString}` : path;
}

export function planLabel(planId: string) {
  return planId === "plan_plus" ? "故事 Plus" : "故事会员";
}

export function accountStatusLabel(status: "guest" | "active" | "recovery_pending" | "deletion_pending" | "deleted") {
  switch (status) {
    case "guest":
      return "游客进度尚未正式留档";
    case "active":
      return "已绑定，可在多端接着写";
    case "recovery_pending":
      return "恢复申请处理中";
    case "deletion_pending":
      return "删除申请处理中";
    case "deleted":
      return "账户已删除";
    default:
      return status;
  }
}

export function syncHealthLabel(syncHealth: "healthy" | "degraded" | "offline") {
  switch (syncHealth) {
    case "healthy":
      return "稳定";
    case "degraded":
      return "需要你看一眼";
    case "offline":
      return "当前离线";
    default:
      return syncHealth;
  }
}

export function channelLabel(channel: string) {
  switch (channel) {
    case "wechat":
      return "微信";
    case "web":
      return "Web";
    case "tablet":
      return "平板";
    case "mobile":
      return "手机";
    case "in_app":
      return "房间邮箱";
    case "push":
      return "系统 Push";
    case "im":
      return "外部 IM";
    default:
      return channel;
  }
}

function toneClassName(tone: ControlTone) {
  switch (tone) {
    case "live":
      return "control-pill--live";
    case "reserved":
      return "control-pill--reserved";
    case "alert":
      return "control-pill--alert";
    default:
      return "control-pill--soft";
  }
}

export function ControlPill(props: { tone?: ControlTone; children: ReactNode }) {
  const tone = props.tone ?? "soft";
  return <span className={`control-pill ${toneClassName(tone)}`}>{props.children}</span>;
}

export function ControlSection(props: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="story-section control-section" data-testid={props.testId}>
      <div className="story-section__header control-section__header">
        <p className="story-section__eyebrow">{props.eyebrow}</p>
        <h2 className="story-section__title">{props.title}</h2>
        {props.description ? <p className="story-section__copy">{props.description}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

export function ControlStrip(props: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="control-strip">
      {props.items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="control-strip__item">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ControlCellBody(props: {
  title: string;
  value?: string;
  description: string;
  meta?: string;
  status?: string;
  tone?: ControlTone;
}) {
  return (
    <>
      <div className="control-cell__header">
        <div className="control-cell__title-block">
          <strong>{props.title}</strong>
          {props.value ? <p className="control-cell__value">{props.value}</p> : null}
        </div>
        {props.status ? (
          <ControlPill {...(props.tone === undefined ? {} : { tone: props.tone })}>
            {props.status}
          </ControlPill>
        ) : null}
      </div>
      <p className="control-cell__copy">{props.description}</p>
      {props.meta ? <small className="control-cell__meta">{props.meta}</small> : null}
    </>
  );
}

export function ControlLinkCell(props: {
  href: string;
  title: string;
  value?: string;
  description: string;
  meta?: string;
  status?: string;
  tone?: ControlTone;
}) {
  return (
    <Link aria-label={props.title} className="control-cell control-cell--link" href={props.href}>
      <ControlCellBody {...props} />
    </Link>
  );
}

export function ControlStaticCell(props: {
  title: string;
  value?: string;
  description: string;
  meta?: string;
  status?: string;
  tone?: ControlTone;
}) {
  return (
    <article className="control-cell">
      <ControlCellBody {...props} />
    </article>
  );
}

export function ControlActionRow(props: { children: ReactNode }) {
  return <div className="control-action-row">{props.children}</div>;
}

export function AccountRecoveryStateCard(props: {
  state: AccountSurfaceRecoveryState;
  retryHref: string;
  roomHref: string;
  homeHref: string;
  testId?: string;
}) {
  const testId = props.testId ?? "account-recovery-state";

  if (props.state === "recovering") {
    return (
      <section className="story-section control-section" data-testid={testId}>
        <div className="story-section__header control-section__header">
          <p className="story-section__eyebrow">正在接回</p>
          <h1 className="story-section__title">我先把这页接回你的账号里</h1>
          <p className="story-section__copy">再等一下，刚才的入口信息正在把这页重新接稳，不需要你重新找一次。</p>
        </div>
      </section>
    );
  }

  const title = props.state === "recovery_failed" ? "这页暂时没把账号接回来" : "这页还没接上你的账号信息";
  const description =
    props.state === "recovery_failed"
      ? "刚才的入口信息没有成功接到这页。你可以原路再试一次，或者先回房间继续。"
      : "如果你是从房间、书架或私聊里跳来的，回到刚才的入口再进一次就能接回这里。现在先给你两个安全入口。";

  return (
    <section className="story-section control-section" data-testid={testId}>
      <div className="story-section__header control-section__header">
        <p className="story-section__eyebrow">{props.state === "recovery_failed" ? "这次没接稳" : "需要重新进入"}</p>
        <h1 className="story-section__title">{title}</h1>
        <p className="story-section__copy">{description}</p>
      </div>
      <ControlActionRow>
        {props.state === "recovery_failed" ? (
          <button
            className="control-link-button"
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.assign(props.retryHref);
              }
            }}
          >
            再接一次
          </button>
        ) : (
          <Link className="control-link-button" href={props.homeHref}>
            回首页重新进入
          </Link>
        )}
        <Link className="control-link-button secondary-button" href={props.roomHref}>
          先回房间
        </Link>
      </ControlActionRow>
    </section>
  );
}
