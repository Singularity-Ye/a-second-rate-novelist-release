import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="ops-shell">
          <header className="ops-header">
            <div>
              <p className="ops-muted">Erliu Ops Console</p>
              <h1>运营后台</h1>
            </div>
            <nav className="ops-nav">
              <div className="ops-nav-group">
                <span className="ops-nav-group__label">Core</span>
                <a href="/ops/overview">Overview</a>
                <a href="/ops/funnels/reader_activation">Funnels</a>
                <a href="/ops/users">Users</a>
                <a href="/ops/reviews">Reviews</a>
                <a href="/ops/reviews?case_type=public_report&status=open">Trust Cases</a>
                <a href="/ops/support">Support</a>
              </div>
              <div className="ops-nav-group">
                <span className="ops-nav-group__label">Revenue & Rights</span>
                <a href="/ops/memberships">Memberships</a>
                <a href="/ops/exports">Export Desk</a>
                <a href="/ops/rights">Rights Service</a>
                <a href="/ops/assets">Asset Packs</a>
                <a href="/ops/touchpoints">Touchpoints</a>
              </div>
              <div className="ops-nav-group">
                <span className="ops-nav-group__label">Release</span>
                <a href="/ops/environments">Environments</a>
                <a href="/ops/releases">Releases</a>
                <a href="/ops/backups">Backups</a>
              </div>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
