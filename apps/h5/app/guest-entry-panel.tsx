"use client";

import Link from "next/link";
import React from "react";
import { useState } from "react";
import { FRONTSTAGE_ENTRY_ERROR, toFrontstageErrorCopy } from "./lib/frontstage-copy";
import { useRouter, useSearchParams } from "next/navigation";
import { primeFrontstageSessionFromHref } from "./lib/account-surface-session";
import { createGuestRoomSession } from "./lib/guest-session";
import { withH5Context } from "./lib/navigation";

export function GuestEntryPanel({
  title,
  description,
  dataTestId,
}: {
  title: string;
  description: string;
  dataTestId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEnterRoom() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const deepLink = await createGuestRoomSession();
      primeFrontstageSessionFromHref(deepLink);
      const nextHref = new URL(deepLink, "http://127.0.0.1:3000");
      router.push(`${nextHref.pathname}${nextHref.search}${nextHref.hash}`);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, FRONTSTAGE_ENTRY_ERROR));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="guest-entry-panel" data-testid={dataTestId}>
      <p className="guest-entry-panel__eyebrow">第一次来这里</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {error ? <p className="guest-entry-panel__error">{error}</p> : null}
      <div className="guest-entry-panel__actions">
        <button type="button" disabled={submitting} onClick={() => void handleEnterRoom()}>
          {submitting ? "正在进入..." : "先去房间里看看"}
        </button>
        <Link href={withH5Context("/stories", searchParams)}>去书架看看</Link>
        <Link href={withH5Context("/profile", searchParams)}>打开我的</Link>
      </div>
    </section>
  );
}
