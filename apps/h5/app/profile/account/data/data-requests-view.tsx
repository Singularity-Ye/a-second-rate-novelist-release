"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchPrivacyDataRequests } from "../../../lib/account-membership-api";
import { useAccountSurfaceSession } from "../../../lib/account-surface-session";
import {
  FRONTSTAGE_LOADING,
  toFrontstageErrorCopy,
  toPrivacyRequestScopeLabel,
  toPrivacyRequestStatusLabel,
  toPrivacyRequestTypeLabel,
} from "../../../lib/frontstage-copy";
import { AccountRecoveryStateCard, ControlActionRow } from "../control-plane-kit";
import Link from "next/link";

export function DataRequestsView() {
  const session = useAccountSurfaceSession("/profile/account/data");
  const [requests, setRequests] = useState<Array<{ id: string; request_type: string; status: string; scope: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session.accountToken) {
      return;
    }

    fetchPrivacyDataRequests(session.accountToken)
      .then((result) => {
        setRequests(result.items);
        setLoaded(true);
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, "数据请求记录这会儿还没整理出来。"));
        setLoaded(true);
      });
  }, [session.accountToken]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface" data-testid="data-requests-page">
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
    <main className="surface" data-testid="data-requests-page">
      {error ? <p>{error}</p> : null}
      {!error && !loaded ? <p>{FRONTSTAGE_LOADING.profile}</p> : null}
      {!error && loaded ? (
        <section className="story-section">
          <div className="story-section__header">
            <p className="story-section__eyebrow">数据请求记录</p>
            <h1 className="story-section__title">这里回看你发起过的资料请求</h1>
          </div>
          {requests.length > 0 ? (
            <ul className="control-list">
              {requests.map((item) => (
                <li key={item.id}>
                  <strong>{toPrivacyRequestTypeLabel(item.request_type)}</strong>
                  <span>
                    {toPrivacyRequestScopeLabel(item.scope)} · {toPrivacyRequestStatusLabel(item.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>暂时还没有数据请求记录。</p>
          )}
          <ControlActionRow>
            <Link className="control-link-button" href={session.profileHref}>
              回到账户总面
            </Link>
          </ControlActionRow>
        </section>
      ) : null}
    </main>
  );
}
