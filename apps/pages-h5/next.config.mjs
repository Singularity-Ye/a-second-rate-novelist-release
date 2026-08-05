const requestedBasePath = process.env.PAGES_BASE_PATH?.trim() ?? "";
const basePath = requestedBasePath && requestedBasePath !== "/"
  ? `/${requestedBasePath.replace(/^\/+|\/+$/gu, "")}`
  : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  transpilePackages: [
    "@erliu/force-graph",
    "@erliu/shared-contracts",
    "@erliu/telemetry",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
