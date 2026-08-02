import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@erliu/shared-contracts/runtime-hosts": path.resolve(__dirname, "../../packages/shared-contracts/runtime-hosts.ts"),
      "@erliu/shared-contracts": path.resolve(__dirname, "../../packages/shared-contracts/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [path.resolve(__dirname, "./**/*.test.ts?(x)")],
  },
});
