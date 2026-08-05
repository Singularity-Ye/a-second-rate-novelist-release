import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
  ...(process.env.NEXT_STANDALONE_BUILD === "1" ? { output: "standalone" as const } : {}),
  outputFileTracingRoot: workspaceRoot,
  distDir: process.env.NEXT_DIST_DIR?.trim() || (process.env.NODE_ENV === "development" ? developmentDistDir : ".next"),
  webpack(config) {
    // shared-contracts is authored as NodeNext-safe TypeScript with explicit
    // `.js` specifiers. Next consumes the workspace source directly, so teach
    // webpack to resolve that emitted-runtime suffix back to the TS source.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
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
