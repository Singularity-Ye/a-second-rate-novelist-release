import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@erliu/shared-contracts/vnext-experience": path.resolve(__dirname, "../../packages/shared-contracts/vnext-experience.ts"),
      "@erliu/shared-contracts/runtime-hosts": path.resolve(__dirname, "../../packages/shared-contracts/runtime-hosts.ts"),
      "@erliu/shared-contracts": path.resolve(__dirname, "../../packages/shared-contracts/index.ts"),
      "@erliu/telemetry": path.resolve(__dirname, "../../packages/telemetry/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Keep the glob relative to Vitest's project root. Resolving it to a
    // Windows absolute path makes Vitest treat the drive-qualified pattern
    // as an unreadable directory in this workspace.
    include: ["**/*.test.ts?(x)"],
  },
});
