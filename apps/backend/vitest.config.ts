import path from "node:path";
import { defineConfig } from "vitest/config";

const integrationTests = path
  .resolve(__dirname, "../../tests/integration/**/*.spec.ts")
  .replaceAll(path.sep, "/");

export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
      },
    },
  },
  resolve: {
    alias: {
      "@backend": path.resolve(__dirname, "src"),
      "@erliu/shared-contracts/vnext-experience": path.resolve(
        __dirname,
        "../../packages/shared-contracts/vnext-experience.ts",
      ),
      "@erliu/shared-contracts": path.resolve(__dirname, "../../packages/shared-contracts/index.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: [integrationTests],
    setupFiles: [path.resolve(__dirname, "../../tests/integration/setup.ts")],
    fileParallelism: false,
    maxWorkers: 1,
    server: {
      deps: {
        external: [/^@nestjs\//, /^@prisma\/client$/, /^supertest$/],
      },
    },
  },
});
