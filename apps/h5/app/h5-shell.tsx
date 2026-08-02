"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SESSION_CONTEXT_UPDATED_EVENT } from "./lib/account-surface-session";
import { withH5Context } from "./lib/navigation";
import { classifyNonProductSurface } from "./lib/non-product-surfaces";

const tabs = [
  { href: "/room", label: "房间" },
  { href: "/stories", label: "书架" },
  { href: "/profile", label: "我的" },
] as const;

function isActiveTab(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildShellSearchParams(rawSearch: string) {
  void rawSearch;
  return new URLSearchParams();
}

function LegacyH5Shell({
  children,
  pathname,
}: Readonly<{ children: React.ReactNode; pathname: string }>) {
  const searchParams = useSearchParams();
  const [liveSearch, setLiveSearch] = useState(() =>
    typeof window === "undefined" ? searchParams.toString() : window.location.search.replace(/^\?/, ""),
  );
  const isNonProductSurface = Boolean(classifyNonProductSurface(pathname));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncSearch = () => {
      setLiveSearch(window.location.search.replace(/^\?/, ""));
    };

    syncSearch();
    window.addEventListener("popstate", syncSearch);
    window.addEventListener(SESSION_CONTEXT_UPDATED_EVENT, syncSearch);

    return () => {
      window.removeEventListener("popstate", syncSearch);
      window.removeEventListener(SESSION_CONTEXT_UPDATED_EVENT, syncSearch);
    };
  }, []);

  useEffect(() => {
    setLiveSearch((current) => {
      const next = searchParams.toString();
      return current === next ? current : next;
    });
  }, [searchParams]);

  const shellSearchParams = useMemo(() => buildShellSearchParams(liveSearch), [liveSearch]);
  const isImmersiveRoom = pathname === "/room" || pathname === "/room/novelist";

  if (pathname === "/room/reincarnation") {
    return (
      <div className="app-shell app-shell--immersive app-shell--prologue">
        <div className="app-shell__body">{children}</div>
      </div>
    );
  }

  if (isNonProductSurface) {
    return (
      <div className="app-shell" data-shell-mode="isolated">
        <div className="app-shell__body">{children}</div>
      </div>
    );
  }

  return (
    <div className={isImmersiveRoom ? "app-shell app-shell--immersive" : "app-shell"}>
      <div className="app-shell__body">{children}</div>
      <nav aria-label="主导航" className="tab-shell">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            className="tab-shell__link"
            data-active={isActiveTab(pathname, tab.href) ? "true" : "false"}
            href={withH5Context(tab.href, shellSearchParams)}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function H5Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  if (pathname === "/vnext" || pathname.startsWith("/vnext/")) {
    return (
      <div data-shell-mode="vnext-isolated">
        <div>{children}</div>
      </div>
    );
  }

  return <LegacyH5Shell pathname={pathname}>{children}</LegacyH5Shell>;
}
