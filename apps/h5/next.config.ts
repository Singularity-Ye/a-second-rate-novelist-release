import type { NextConfig } from "next";

const vNextNoReferrerHeaders = [{ key: "Referrer-Policy", value: "no-referrer" }];

function requestedDevPort(): string | undefined {
  const args = process.argv.slice(2);
  const inlinePort = args.find((arg) => arg.startsWith("--port=") || arg.startsWith("-p="))?.split("=", 2)[1];
  const separatePortIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
  const separatePort = separatePortIndex >= 0 ? args[separatePortIndex + 1] : undefined;
  const candidate = inlinePort ?? separatePort ?? process.env.PORT;

  return candidate && /^\d{1,5}$/.test(candidate) && Number(candidate) > 0 && Number(candidate) <= 65535
    ? candidate
    : undefined;
}

const developmentDistDir = requestedDevPort() ? `.next-dev-${requestedDevPort()}` : ".next-dev";

// Codex/PowerShell edits can arrive as external filesystem writes on Windows.
// Watchpack's native events occasionally miss those writes, leaving the browser
// on an old module graph until the dev server is restarted. Polling keeps the
// local H5 loop reliable without changing production builds.
if (process.env.NODE_ENV === "development" && process.platform === "win32") {
  process.env.WATCHPACK_POLLING ??= "true";
  process.env.WATCHPACK_POLLING_INTERVAL ??= "1000";
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || (process.env.NODE_ENV === "development" ? developmentDistDir : ".next"),
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/:path*",
      },
    ];
  },
  async headers() {
    return [
      { source: "/vnext", headers: vNextNoReferrerHeaders },
      { source: "/vnext/:path*", headers: vNextNoReferrerHeaders },
    ];
  },
};

export default nextConfig;
