import type { NextConfig } from "next";

const vNextNoReferrerHeaders = [{ key: "Referrer-Policy", value: "no-referrer" }];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/vnext", headers: vNextNoReferrerHeaders },
      { source: "/vnext/:path*", headers: vNextNoReferrerHeaders },
    ];
  },
};

export default nextConfig;
