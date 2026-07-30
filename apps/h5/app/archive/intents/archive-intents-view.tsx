"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  ArchiveIntentItem,
  DeepLinkTargetRoute,
  DeepLinkExchangeResponse,
  IntentCorrectionResponse,
} from "@erliu/shared-contracts";
import { correctArchiveIntent, fetchArchiveIntents } from "../../lib/archive-intents-api";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import { FRONTSTAGE_ENTRY_ERROR, FRONTSTAGE_LOADING, toFrontstageErrorCopy } from "../../lib/frontstage-copy";
import { exchangeSessionToken } from "../../lib/session-bridge";

export function ArchiveIntentsView({
  token: forcedToken,
  allowAccountSurfaceFallback = false,
  surfacePath = "/archive/intents",
}: {
  token?: string;
  allowAccountSurfaceFallback?: boolean;
  surfacePath?: DeepLinkTargetRoute;
} = {}) {
  const searchParams = useSearchParams();
  const queryToken = searchParams.get("token");
  const frontstageSession = useAccountSurfaceSession(surfacePath, {
    issueTokenForLegacyAccount: false,
  });
  const fallbackAccountToken = allowAccountSurfaceFallback ? frontstageSession.accountToken : null;
  const fallbackToken =
    allowAccountSurfaceFallback && !fallbackAccountToken ? frontstageSession.token : null;
  const fallbackRecoveryState = allowAccountSurfaceFallback ? frontstageSession.recoveryState : "missing_context";
  const activeToken = forcedToken ?? queryToken ?? fallbackToken;
  const activeContextKey = fallbackAccountToken ?? activeToken ?? null;
  const [session, setSession] = useState<DeepLinkExchangeResponse | null>(null);
  const [items, setItems] = useState<ArchiveIntentItem[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [result, setResult] = useState<IntentCorrectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadedContextKey, setLoadedContextKey] = useState<string | null>(activeContextKey);

  useEffect(() => {
    let active = true;

    setSession(null);
    setItems([]);
    setSelectedIntentId(null);
    setCorrectionText("");
    setResult(null);

    if (!activeToken && !fallbackAccountToken) {
      setLoadedContextKey(null);

      if (fallbackRecoveryState === "recovering") {
        setError(null);
        setLoading(true);
        return () => {
          active = false;
        };
      }

      setError(FRONTSTAGE_ENTRY_ERROR);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);

    const loadIntents = activeToken
      ? exchangeSessionToken(activeToken).then(async (sessionResult) => {
          if (!active) {
            return;
          }

          setSession(sessionResult);
          return fetchArchiveIntents(sessionResult.account_token);
        })
      : fetchArchiveIntents(fallbackAccountToken!);

    loadIntents
      .then((archiveIntents) => {
        if (!active || !archiveIntents) {
          return;
        }

        const normalizedItems = Array.isArray(archiveIntents.items) ? archiveIntents.items : [];
        setItems(normalizedItems);
        setSelectedIntentId(normalizedItems[0]?.intent_id ?? null);
        setLoadedContextKey(activeContextKey);
      })
      .catch((reason) => {
        if (!active) {
          return;
        }

        setSession(null);
        setLoadedContextKey(activeContextKey);
        setError(toFrontstageErrorCopy(reason, "最近记下这会儿还没整理出来。"));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeContextKey, activeToken, fallbackAccountToken, fallbackRecoveryState]);

  const selectedIntent = useMemo(
    () => items.find((item) => item.intent_id === selectedIntentId) ?? null,
    [items, selectedIntentId],
  );

  if (loadedContextKey !== activeContextKey) {
    return <main data-testid="archive-intents-page">{FRONTSTAGE_LOADING.chat}</main>;
  }

  async function handleCorrectionSubmit() {
    if (!selectedIntent || !correctionText.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await correctArchiveIntent({
        intent_id: selectedIntent.intent_id,
        new_target_type: "reader_profile",
        patch_document: {
          base_version: selectedIntent.version_no,
          reading_archive_patch: {
            favorite_books_append: [correctionText.trim()],
          },
        },
        client_request_id: `intent-correction-${Date.now()}`,
      });

      setItems((currentItems) =>
        currentItems.map((item) => (item.intent_id === response.intent.intent_id ? response.intent : item)),
      );
      setSelectedIntentId(response.intent.intent_id);
      setResult(response);
      setCorrectionText("");
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这条纠正我还没记稳，再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  const hasSessionContext = Boolean(session?.account_token ?? fallbackAccountToken);

  return (
    <main data-testid="archive-intents-page">
      <h1>最近记下</h1>
      {loading ? <p>{FRONTSTAGE_LOADING.chat}</p> : null}
      {hasSessionContext ? <p>这几句已经和你的私聊接上，方便你回看和修正。</p> : null}
      {error ? <p data-testid="archive-intents-error">{error}</p> : null}

      {items.length > 0 ? (
        <section data-testid="archive-intents-list">
          <ul>
            {items.map((item) => (
              <li key={item.intent_id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIntentId(item.intent_id);
                    setResult(null);
                  }}
                >
                  {item.message_text || item.ack_copy}
                </button>
                <p>{item.ack_copy}</p>
                <p>{item.target_label}</p>
                <p>{item.target_object.object_label}</p>
                <p>已经记下，随时可修。</p>
              </li>
            ))}
          </ul>
        </section>
      ) : !loading ? (
        <p>暂无最近记下。</p>
      ) : null}

      {selectedIntent ? (
        <section data-testid="archive-intent-detail">
          <h2>最近记下详情</h2>
          <p>{selectedIntent.message_text}</p>
          <p>{selectedIntent.ack_copy}</p>
          <p>{selectedIntent.target_label}</p>
          <p>{selectedIntent.target_object.object_label}</p>
          <p>这句会按你纠正后的方向继续记住。</p>
          <p>当前已修订到第 {selectedIntent.version_no} 版。</p>

          <label>
            纠错补丁输入框
            <textarea
              aria-label="纠错补丁输入框"
              value={correctionText}
              disabled={submitting}
              onChange={(event) => {
                setCorrectionText(event.target.value);
              }}
            />
          </label>

          <button
            type="button"
            disabled={submitting || !correctionText.trim()}
            onClick={() => void handleCorrectionSubmit()}
          >
            纠正到读者档案
          </button>
        </section>
      ) : null}

      {result ? (
        <section data-testid="intent-correction-result">
          <p>{result.replay_preview.summary}</p>
          <p>{result.intent.target_label}</p>
          <p>纠正已经记下。</p>
        </section>
      ) : null}
    </main>
  );
}
