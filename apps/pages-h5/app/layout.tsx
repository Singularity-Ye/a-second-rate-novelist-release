import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../../h5/app/globals.css";

export const metadata: Metadata = {
  title: "二流小说家的房间",
  description: "一个会自己生活、写作、卡文，也愿意和你慢慢说话的小说家房间。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const runtimeApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  return (
    <html lang="zh-CN">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ERLIU_RUNTIME_API_BASE_URL__=${JSON.stringify(runtimeApiBaseUrl)};window.__ERLIU_STRICT_RUNTIME_API_BASE__=true;`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
