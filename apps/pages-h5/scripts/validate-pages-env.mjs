const requireRemoteApi = process.env.PAGES_REQUIRE_REMOTE_API === "true";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";

if (requireRemoteApi && !apiBaseUrl) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL must be configured for a deployable Pages build");
}

if (apiBaseUrl) {
  const parsed = new URL(apiBaseUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be a credential-free HTTPS origin/base path");
  }
}

if (process.env.NEXT_PUBLIC_PUBLIC_ROOM_DEMO !== "true") {
  throw new Error("Pages builds must explicitly set NEXT_PUBLIC_PUBLIC_ROOM_DEMO=true");
}
