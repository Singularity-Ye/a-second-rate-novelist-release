"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReaderProfileView } from "@erliu/shared-contracts";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import { confirmProfile, fetchReaderProfile } from "../../lib/profile-api";
import { withSessionContext } from "../../lib/navigation";
import { FRONTSTAGE_LOADING } from "../../lib/frontstage-copy";
import { ProfileSummary } from "./profile-summary";

export function ProfileConfirmationView() {
  const frontstageSession = useAccountSurfaceSession("/onboarding/confirm");
  const [session, setSession] = useState<{ token: string; account_token: string } | null>(null);
  const [profile, setProfile] = useState<ReaderProfileView | null>(null);

  useEffect(() => {
    if (!frontstageSession.accountToken) {
      setSession(null);
      setProfile(null);
      return;
    }

    const currentSession = {
      token: frontstageSession.token ?? "",
      account_token: frontstageSession.accountToken,
    };

    setSession(currentSession);

    fetchReaderProfile(frontstageSession.accountToken)
      .then((result) => {
        return result;
      })
      .then((result) => {
        setProfile(result);
      })
      .catch(() => {
        setProfile(null);
      });
  }, [frontstageSession.accountToken, frontstageSession.token]);

  async function handleConfirm() {
    if (!session) {
      return;
    }

    const confirmed = await confirmProfile(session.account_token);
    setProfile(confirmed);
  }

  if (!profile || !session) {
    return <main>{FRONTSTAGE_LOADING.profileConfirmation}</main>;
  }

  return (
    <main className="surface profile-confirmation-surface" data-testid="profile-confirmation-page">
      <ProfileSummary profile={profile} onConfirm={() => void handleConfirm()} />
      {profile.completion_status.state === "confirmed" ? (
        <section className="story-section profile-confirmation-next">
          <div className="story-section__header">
            <p className="story-section__eyebrow">下一步</p>
            <h2 className="story-section__title">把这版结果带去故事工坊</h2>
            <p className="story-section__copy">
              这里已经不是单纯的确认页了。读者档案和第一轮故事方向已经收口，下一步是把这版结果带进故事工坊继续往下写。
            </p>
          </div>
          <div className="story-cell-list story-cell-list--three">
            <Link
              className="story-cell story-cell--link"
              href={withSessionContext("/stories/new", {
                token: session.token,
                accountToken: session.account_token,
              })}
            >
              <strong>继续去故事工坊</strong>
              <span>把刚确认的读者档案和第一轮方向带进提案流程，不是重新从空白页开始。</span>
            </Link>
            <Link
              className="story-cell story-cell--link"
              href={withSessionContext("/chat", {
                token: session.token,
                accountToken: session.account_token,
              })}
            >
              <strong>回私聊继续补一句</strong>
              <span>继续往聊天里补偏好、边界和新方向，让后续理解一起变准。</span>
            </Link>
            <Link
              className="story-cell story-cell--link"
              href={withSessionContext("/room", {
                token: session.token,
                accountToken: session.account_token,
              })}
            >
              <strong>先回房间</strong>
              <span>去看房间里的状态、通知和当前故事入口，让下一步动作继续落在同一条主链上。</span>
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
