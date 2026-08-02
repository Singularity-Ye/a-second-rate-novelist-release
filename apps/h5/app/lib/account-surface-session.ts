"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DeepLinkTargetRoute } from "@erliu/shared-contracts";
import { issueSessionToken, exchangeSessionToken } from "./session-bridge";
import { FRONTSTAGE_SESSION_STORAGE_KEY } from "./frontstage-session-storage";

export type AccountSurfaceRecoveryState = "ready" | "recovering" | "missing_context" | "recovery_failed";
export const SESSION_CONTEXT_UPDATED_EVENT = "session-context-updated";

export type StoredFrontstageSession = {
  token: string | null;
  accountToken: string | null;
};

function trimValue(value: string | null) {
  const nextValue = value?.trim() ?? "";
  return nextValue.length > 0 ? nextValue : null;
}

export function readStoredFrontstageSession(): StoredFrontstageSession {
  if (typeof window === "undefined") {
    return {
      token: null,
      accountToken: null,
    };
  }

  try {
    const rawValue = window.sessionStorage.getItem(FRONTSTAGE_SESSION_STORAGE_KEY);

    if (!rawValue) {
      return {
        token: null,
        accountToken: null,
      };
    }

    const parsed = JSON.parse(rawValue) as {
      token?: unknown;
      accountToken?: unknown;
    };

    return {
      token: trimValue(typeof parsed.token === "string" ? parsed.token : null),
      accountToken: trimValue(typeof parsed.accountToken === "string" ? parsed.accountToken : null),
    };
  } catch {
    return {
      token: null,
      accountToken: null,
    };
  }
}

function writeStoredFrontstageSession(input: {
  token?: string | null | undefined;
  accountToken?: string | null | undefined;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const current = readStoredFrontstageSession();
  const nextValue = {
    token: input.token === undefined ? current.token : trimValue(input.token ?? null),
    accountToken:
      input.accountToken === undefined ? current.accountToken : trimValue(input.accountToken ?? null),
  };

  if (!nextValue.token && !nextValue.accountToken) {
    window.sessionStorage.removeItem(FRONTSTAGE_SESSION_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(FRONTSTAGE_SESSION_STORAGE_KEY, JSON.stringify(nextValue));
}

export function primeFrontstageSessionFromHref(target: string) {
  const url = new URL(target, "http://127.0.0.1:3000");
  const token = trimValue(url.searchParams.get("token"));
  const accountToken = trimValue(url.searchParams.get("account_token"));

  if (!token && !accountToken) {
    return;
  }

  writeStoredFrontstageSession({
    token,
    accountToken,
  });
}

function stripSessionParams(searchParamsString: string) {
  const nextParams = new URLSearchParams(searchParamsString);
  nextParams.delete("token");
  nextParams.delete("account_token");
  return nextParams;
}

function appendQuery(path: string, queryString: string) {
  if (!queryString) {
    return path;
  }

  const url = new URL(path, "http://127.0.0.1:3000");
  const queryParams = new URLSearchParams(queryString);

  queryParams.forEach((value, key) => {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  });

  return `${url.pathname}${url.search}${url.hash}`;
}

export function useAccountSurfaceSession(
  surfacePath: DeepLinkTargetRoute,
  options?: {
    issueTokenForLegacyAccount?: boolean;
  },
) {
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const queryAccountToken = trimValue(searchParams.get("account_token"));
  const queryToken = trimValue(searchParams.get("token"));
  const storyId = searchParams.get("story_id");
  const issueTokenForLegacyAccount = options?.issueTokenForLegacyAccount ?? true;
  const [resolvedToken, setResolvedToken] = useState<string | null>(() => queryToken);
  const [resolvedAccountToken, setResolvedAccountToken] = useState<string | null>(() => queryAccountToken);
  const [recoveryState, setRecoveryState] = useState<AccountSurfaceRecoveryState>("recovering");

  const contextSearchParams = useMemo(() => stripSessionParams(searchParamsString), [searchParamsString]);
  const queryString = contextSearchParams.toString();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!queryToken && !queryAccountToken) {
      return;
    }

    writeStoredFrontstageSession({
      token: queryToken,
      accountToken: queryAccountToken,
    });

    const nextSearch = queryString ? `?${queryString}` : "";
    const nextHref = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(window.history.state, "", nextHref);
      window.dispatchEvent(new Event(SESSION_CONTEXT_UPDATED_EVENT));
    }
  }, [queryAccountToken, queryString, queryToken]);

  useEffect(() => {
    let cancelled = false;
    const storedSession = readStoredFrontstageSession();

    if (queryToken) {
      setRecoveryState("recovering");

      void exchangeSessionToken(queryToken)
        .then((session) => {
          if (cancelled) {
            return;
          }

          writeStoredFrontstageSession({
            token: queryToken,
            accountToken: session.account_token,
          });
          setResolvedToken(queryToken);
          setResolvedAccountToken(session.account_token);
          setRecoveryState("ready");
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setResolvedToken(null);
          setResolvedAccountToken(null);
          setRecoveryState("recovery_failed");
        });

      return () => {
        cancelled = true;
      };
    }

    if (queryAccountToken) {
      if (storedSession.accountToken === queryAccountToken && storedSession.token) {
        writeStoredFrontstageSession({
          token: storedSession.token,
          accountToken: queryAccountToken,
        });
        setResolvedToken(storedSession.token);
        setResolvedAccountToken(queryAccountToken);
        setRecoveryState("ready");
        return;
      }

      if (!issueTokenForLegacyAccount) {
        writeStoredFrontstageSession({
          accountToken: queryAccountToken,
        });
        setResolvedToken(storedSession.token);
        setResolvedAccountToken(queryAccountToken);
        setRecoveryState("ready");
        return;
      }

      setRecoveryState("recovering");

      void issueSessionToken({
        account_token: queryAccountToken,
        target_route: surfacePath,
      })
        .then((session) => {
          if (cancelled) {
            return;
          }

          writeStoredFrontstageSession({
            token: session.token,
            accountToken: queryAccountToken,
          });
          setResolvedToken(session.token);
          setResolvedAccountToken(queryAccountToken);
          setRecoveryState("ready");
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setResolvedToken(null);
          setResolvedAccountToken(null);
          setRecoveryState("recovery_failed");
        });

      return () => {
        cancelled = true;
      };
    }

    if (storedSession.accountToken && storedSession.token) {
      setResolvedToken(storedSession.token);
      setResolvedAccountToken(storedSession.accountToken);
      setRecoveryState("ready");
      return;
    }

    if (storedSession.accountToken) {
      if (!issueTokenForLegacyAccount) {
        setResolvedToken(null);
        setResolvedAccountToken(storedSession.accountToken);
        setRecoveryState("ready");
        return;
      }

      setRecoveryState("recovering");

      void issueSessionToken({
        account_token: storedSession.accountToken,
        target_route: surfacePath,
      })
        .then((session) => {
          if (cancelled) {
            return;
          }

          writeStoredFrontstageSession({
            token: session.token,
            accountToken: storedSession.accountToken,
          });
          setResolvedToken(session.token);
          setResolvedAccountToken(storedSession.accountToken);
          setRecoveryState("ready");
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setResolvedToken(null);
          setResolvedAccountToken(null);
          setRecoveryState("recovery_failed");
        });

      return () => {
        cancelled = true;
      };
    }

    if (storedSession.token) {
      setRecoveryState("recovering");

      void exchangeSessionToken(storedSession.token)
        .then((session) => {
          if (cancelled) {
            return;
          }

          writeStoredFrontstageSession({
            token: storedSession.token,
            accountToken: session.account_token,
          });
          setResolvedToken(storedSession.token);
          setResolvedAccountToken(session.account_token);
          setRecoveryState("ready");
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setResolvedToken(null);
          setResolvedAccountToken(null);
          setRecoveryState("recovery_failed");
        });

      return () => {
        cancelled = true;
      };
    }

    setResolvedToken(null);
    setResolvedAccountToken(null);
    setRecoveryState("missing_context");
  }, [issueTokenForLegacyAccount, queryAccountToken, queryToken, surfacePath]);

  return {
    accountToken: resolvedAccountToken,
    contextSearchParams,
    queryString,
    storyId,
    token: resolvedToken,
    recoveryState,
    retryHref: appendQuery(surfacePath, queryString),
    profileHref: appendQuery("/profile", queryString),
    roomHref: appendQuery("/room", queryString),
    homeHref: "/",
  };
}
