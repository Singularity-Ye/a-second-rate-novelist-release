import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDisposablePostgresDatabase } from "./disposable-postgres";

const database = requireDisposablePostgresDatabase({
  databaseNameDescription: "erliu_tc163_<test|regression>_<24 lowercase hex>",
  databaseNamePattern: /^erliu_tc163_(?:test|regression)_[0-9a-f]{24}$/,
  envName: "TC163_DATABASE_URL",
});

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(toolDir, "../../apps/backend");

function run(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync("pnpm", args, {
    cwd: backendDir,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const liveEnv = {
  ...process.env,
  DATABASE_URL: database.url,
  TC163_DATABASE_URL: database.url,
};

run(["exec", "prisma", "migrate", "deploy"], liveEnv);
run(
  [
    "exec",
    "vitest",
    "run",
    "../../tests/integration/vnext/create-guest-session.spec.ts",
    "../../tests/integration/vnext/vnext-session-authz.spec.ts",
  ],
  liveEnv,
);
