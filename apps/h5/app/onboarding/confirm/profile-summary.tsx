import React from "react";
import type { ReaderProfileView } from "@erliu/shared-contracts";

export function ProfileSummary({
  profile,
  onConfirm,
}: {
  profile: Pick<
    ReaderProfileView,
    "reading_archive" | "taste_archive" | "boundaries" | "collaboration_mode" | "completion_status"
  >;
  onConfirm?: () => void;
}) {
  const storyDirection = deriveStoryDirection(profile);

  return (
    <section className="story-section profile-summary-card">
      <div className="story-section__header">
        <p className="story-section__eyebrow">读者档案</p>
        <h1 className="story-section__title">这一版，我先这样接住你</h1>
        <p className="story-section__copy">你不用先把自己讲得很完整，我会先把现在听懂的部分整理成一版，再陪你继续修。</p>
      </div>
      <article className="story-cell profile-summary-section">
        <h2>阅读档案</h2>
        <p>你容易被这些书和关系语气打动，我会先按这个方向给你故事建议。</p>
        {profile.reading_archive.favorite_books.map((book) => (
          <p key={book}>{book}</p>
        ))}
      </article>
      <article className="story-cell profile-summary-section">
        <h2>口味与边界</h2>
        <p>你的边界我会先替你守住，后面也可以继续改。</p>
        <p>{profile.taste_archive.relationship_preference.join(" / ")}</p>
        <p>{profile.boundaries.red_lines.join(" / ") || "暂无额外红线"}</p>
      </article>
      <article className="story-cell profile-summary-section">
        <h2>参与方式</h2>
        <p>{collaborationModeLabels[profile.collaboration_mode]}</p>
        <p>{completionStateLabels[profile.completion_status.state]}</p>
      </article>
      <article className="story-cell profile-summary-section">
        <h2>第一轮故事方向</h2>
        <p>不是重新开一张空白页，而是把刚确认的读者档案收口成一个能继续往下写的方向。</p>
        <div className="proposal-card">
          <p className="proposal-card__eyebrow">收口建议</p>
          <strong>{storyDirection.title}</strong>
          <p>{storyDirection.summary}</p>
          <p>{storyDirection.anchor}</p>
          <p>{storyDirection.boundary}</p>
        </div>
      </article>
      <button className="primary-cta" type="button" onClick={onConfirm}>
        就按这个写我
      </button>
    </section>
  );
}

const collaborationModeLabels = {
  read_only: "你现在更想安心追故事，不想被流程打断。",
  co_create: "你想一起共创，但希望关键节点再来问你。",
  director: "你想更主动地导演人物、走向和情绪节奏。",
} as const;

const completionStateLabels = {
  collecting: "还在采集中",
  resumable: "可以从上次继续",
  confirm_pending: "等你点头就开始按这版理解你",
  confirmed: "已经确认",
} as const;

function deriveStoryDirection(
  profile: Pick<
    ReaderProfileView,
    "reading_archive" | "taste_archive" | "boundaries" | "collaboration_mode" | "completion_status"
  >,
) {
  const firstPreference = profile.taste_archive.relationship_preference[0] ?? "先从最想被接住的关系感写起";
  const paceText = profile.taste_archive.pace === "slow-burn" ? "慢热推进" : "稳一点推进";
  const endingText = profile.taste_archive.ending === "bittersweet" ? "保留一点余韵" : "把收口写得更明晰";
  const firstBook = profile.reading_archive.favorite_books[0];
  const redLines = profile.boundaries.red_lines;

  return {
    title: firstPreference,
    summary: `这一轮会按“${paceText}、${endingText}”的节奏往下走，先把你最在意的关系张力立住。`,
    boundary: redLines.length > 0 ? `先避开这些红线：${redLines.join(" / ")}` : "当前没有额外红线，先按默认私密和安全边界写。",
    anchor: firstBook ? `可以先把《${firstBook}》这类气质当作起点。` : "我会先从你最容易代入的气质起笔。",
  };
}
