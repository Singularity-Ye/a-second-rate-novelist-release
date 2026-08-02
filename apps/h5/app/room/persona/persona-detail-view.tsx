"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RoomPersonaDetailResponse } from "@erliu/shared-contracts";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import { withSessionContext } from "../../lib/navigation";
import { fetchRoomPersona } from "../../lib/room-api";
import {
  FRONTSTAGE_ENTRY_ERROR,
  FRONTSTAGE_LOADING,
  toFrontstageErrorCopy,
  toPersonaStateLabel,
  toReasonCodeLabel,
  toRoomSnapshotLabel,
} from "../../lib/frontstage-copy";

export function PersonaDetailView() {
  const searchParams = useSearchParams();
  const frontstageSession = useAccountSurfaceSession("/room/persona");
  const [session, setSession] = useState<{ token: string | null; account_token: string } | null>(null);
  const [detail, setDetail] = useState<RoomPersonaDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storyId = searchParams.get("storyId");
  const token = session?.token;

  useEffect(() => {
    if (!frontstageSession.accountToken) {
      setSession(null);
      if (frontstageSession.recoveryState !== "recovering") {
        setError(FRONTSTAGE_ENTRY_ERROR);
      }
      return;
    }

    setSession({
      token: frontstageSession.token,
      account_token: frontstageSession.accountToken,
    });
  }, [frontstageSession.accountToken, frontstageSession.recoveryState, frontstageSession.token]);

  useEffect(() => {
    if (!session) {
      setDetail(null);
      if (!frontstageSession.accountToken && frontstageSession.recoveryState !== "recovering") {
        setError(FRONTSTAGE_ENTRY_ERROR);
      }
      return;
    }

    setError(null);
    setDetail(null);

    fetchRoomPersona({
      account_token: session.account_token,
      ...(storyId ? { story_id: storyId } : {}),
    })
      .then((nextDetail) => {
        setDetail(nextDetail);
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, "我这会儿还没把最近的状态收拢出来。"));
      });
  }, [frontstageSession.recoveryState, session, storyId]);

  return (
    <main className="surface room-persona-surface" data-testid="room-persona-page">
      <section className="page-intro room-persona-hero">
        <p className="page-intro__eyebrow">作家状态</p>
        <h1 className="page-intro__title">我现在为什么这样</h1>
        <p className="page-intro__lede">这是一页房间状态档案：先看我现在是什么样，再看最近怎么变过来，最后决定你现在最适合怎么接我。</p>
        {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
        {!detail && !error ? <p className="story-microcopy">{FRONTSTAGE_LOADING.persona}</p> : null}
      </section>

      {detail ? (
        <div className="story-cell-list">
          <section className="story-section room-persona-summary" data-testid="room-persona-state-code">
            <div className="story-section__header">
              <p className="story-section__eyebrow">当前状态</p>
              <h2 className="story-section__title">{detail.state_snapshot.label}</h2>
            </div>
            <p className="story-section__copy">房间判断：{toRoomSnapshotLabel(detail.snapshot_status)}</p>
            <p className="story-section__copy">他现在更像：{toPersonaStateLabel(detail.state_snapshot.state_code)}</p>
            <ul className="tag-row" data-testid="room-persona-moods">
              {detail.state_snapshot.mood_tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </section>

          <section className="story-section" data-testid="room-persona-reasons">
            <div className="story-section__header">
              <p className="story-section__eyebrow">为什么现在会这样</p>
              <h2 className="story-section__title">我为什么会变成这样</h2>
            </div>
            <ul className="room-detail-list">
              {detail.state_snapshot.reason_refs.map((item) => (
                <li key={`${item.ref_type}-${item.ref_id}`}>
                  <strong>{item.label}</strong>
                  {toReasonCodeLabel(item.reason_code) ? <span> · {toReasonCodeLabel(item.reason_code)}</span> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="story-section" data-testid="room-persona-transitions">
            <div className="story-section__header">
              <p className="story-section__eyebrow">最近怎么变过来</p>
              <h2 className="story-section__title">状态轨迹</h2>
            </div>
            <ul className="room-detail-list">
              {detail.recent_transitions.map((item) => (
                <li key={item.snapshot_id}>
                  <strong>{item.label}</strong>
                  <span> · {toPersonaStateLabel(item.state_code)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="story-section" data-testid="room-persona-actions">
            <div className="story-section__header">
              <p className="story-section__eyebrow">你现在最适合怎么接我</p>
              <h2 className="story-section__title">下一步最顺手的动作</h2>
            </div>
            <ul className="room-action-pills">
              {detail.recommended_actions.map((item) => (
                <li key={item.action_code}>
                  <Link
                    href={withSessionContext(item.route, {
                      token,
                      accountToken: session?.account_token,
                    })}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="story-section room-panel-link">
            <div className="story-section__header">
              <p className="story-section__eyebrow">返回房间</p>
              <h2 className="story-section__title">回到房间里继续看我</h2>
            </div>
            <Link
              href={withSessionContext(storyId ? `/room?storyId=${storyId}` : "/room", {
                token,
                accountToken: session?.account_token,
              })}
            >
              返回房间
            </Link>
          </section>
        </div>
      ) : null}
    </main>
  );
}
