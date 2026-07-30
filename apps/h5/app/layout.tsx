import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { H5Shell } from "./h5-shell";
import { buildFrontstageSessionBootstrapScript } from "./lib/frontstage-session-storage";

export const metadata: Metadata = {
  title: "二流小说家",
  description: "一个先接住你，再陪你把故事慢慢写出来的私人小说家产品。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function ShellFallback({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell" data-shell-mode="fallback">
      <div className="app-shell__body">{children}</div>
    </div>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const runtimeApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const strictRuntimeApiBase = process.env.NEXT_PUBLIC_STRICT_RUNTIME_API_BASE === "true";

  return (
    <html lang="zh-CN">
      <body>
        <Script id="erliu-runtime-api-base" strategy="beforeInteractive">
          {`window.__ERLIU_RUNTIME_API_BASE_URL__ = ${JSON.stringify(runtimeApiBaseUrl)}; window.__ERLIU_STRICT_RUNTIME_API_BASE__ = ${JSON.stringify(strictRuntimeApiBase)};`}
        </Script>
        <Script id="erliu-frontstage-session-bootstrap" strategy="beforeInteractive">
          {buildFrontstageSessionBootstrapScript()}
        </Script>
        <Suspense fallback={<ShellFallback>{children}</ShellFallback>}>
          <H5Shell>{children}</H5Shell>
        </Suspense>
      </body>
    </html>
  );
}
