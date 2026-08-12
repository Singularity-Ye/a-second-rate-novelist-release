"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FRONTSTAGE_LOADING } from "./lib/frontstage-copy";
import { loadSystemBinding } from "./room/system/system-layer";

export function HomeEntryView() {
  const router = useRouter();

  useEffect(() => {
    const target = loadSystemBinding() ? "/room" : "/room/reincarnation";
    router.replace(target);
  }, [router]);

  return (
    <main data-entry-state="resolving" data-testid="home-entry-page">
      {FRONTSTAGE_LOADING.profile}
    </main>
  );
}
