"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DeepLinkExchangeResponse, ReaderProfileView } from "@erliu/shared-contracts";
import { FRONTSTAGE_LOADING, toFrontstageErrorCopy } from "../../lib/frontstage-copy";
import { exchangeSessionToken } from "../../lib/session-bridge";
import { fetchReaderProfile } from "../../lib/profile-api";

export function ArchiveProfileView({ token: forcedToken }: { token?: string } = {}) {
  const searchParams = useSearchParams();
  const queryToken = searchParams.get("token");
  const activeToken = forcedToken ?? queryToken;
  const [session, setSession] = useState<DeepLinkExchangeResponse | null>(null);
  const [profile, setProfile] = useState<ReaderProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedToken, setLoadedToken] = useState<string | null>(activeToken);

  useEffect(() => {
    let active = true;

    setSession(null);
    setProfile(null);

    if (!activeToken) {
      setLoadedToken(null);
      setLoading(false);
      setError("这份历史档案还没有拿到入口。");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);

    exchangeSessionToken(activeToken)
      .then((result) => {
        if (!active) {
          return null;
        }

        setSession(result);
        return fetchReaderProfile(result.account_token);
      })
      .then((result) => {
        if (!active || !result) {
          return;
        }

        setProfile(result);
        setLoadedToken(activeToken);
      })
      .catch((reason) => {
        if (!active) {
          return;
        }

        setSession(null);
        setProfile(null);
        setLoadedToken(activeToken);
        setError(toFrontstageErrorCopy(reason, "这份历史档案暂时还没打开。"));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeToken]);

  if (loadedToken !== activeToken) {
    return <main data-testid="archive-profile-page">{FRONTSTAGE_LOADING.profile}</main>;
  }

  if (loading) {
    return <main data-testid="archive-profile-page">{FRONTSTAGE_LOADING.profile}</main>;
  }

  if (error) {
    return (
      <main data-testid="archive-profile-page">
        <p data-testid="archive-profile-error">{error}</p>
      </main>
    );
  }

  if (!session || !profile) {
    return <main data-testid="archive-profile-page">这份历史档案还没准备好。</main>;
  }

  return (
    <main data-testid="archive-profile-page">
      <h1>Archive Profile</h1>
      <p>{session.account_token}</p>
      <p>{profile.profile_status}</p>
      <p>{profile.reading_archive.favorite_books.join(" / ")}</p>
      <p>{profile.boundaries.red_lines.join(" / ")}</p>
    </main>
  );
}
