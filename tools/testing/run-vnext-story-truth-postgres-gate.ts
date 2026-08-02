import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireLocalPostgresAdminDatabase,
  type DisposablePostgresDatabase,
  type LocalPostgresAdminDatabase,
} from "./disposable-postgres";

const MANAGED_DATABASE_PATTERN = /^erliu_tc174_story_[0-9a-f]{24}$/;
const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(toolDir, "../..");
const backendDir = path.join(workspaceDir, "apps/backend");
const prismaDir = path.join(backendDir, "prisma");
const schemaPath = path.join(prismaDir, "schema.prisma");
const migrationsDir = path.join(prismaDir, "migrations");

function command(
  binary: string,
  args: string[],
  options: {
    capture?: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const capture = options.capture ?? false;
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? workspaceDir,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(
      `${binary} ${args.join(" ")} failed with exit ${result.status ?? 1}`,
    );
  }
  return result.stdout ?? "";
}

function postgresEnv(
  admin: LocalPostgresAdminDatabase,
  databaseName: string,
) {
  return {
    ...process.env,
    PGCONNECT_TIMEOUT: "5",
    PGDATABASE: databaseName,
    PGHOST: admin.host,
    PGPASSWORD: admin.password,
    PGPORT: admin.port,
    PGUSER: admin.username,
  };
}

function databaseFromAdmin(
  admin: LocalPostgresAdminDatabase,
  name: string,
): DisposablePostgresDatabase {
  const url = new URL(admin.url);
  url.pathname = `/${name}`;
  url.searchParams.set("schema", "public");
  return {
    identity: `${admin.host}:${admin.port}/${name}?schema=public`,
    name,
    url: url.toString(),
  };
}

function createManagedDatabase(
  admin: LocalPostgresAdminDatabase,
  createdNames: Set<string>,
) {
  const name = `erliu_tc174_story_${randomBytes(12).toString("hex")}`;
  command(
    "createdb",
    ["--maintenance-db", "postgres", "--template", "template0", name],
    { env: postgresEnv(admin, "postgres") },
  );
  createdNames.add(name);
  console.log(`[TC174] created managed disposable database ${name}`);
  return databaseFromAdmin(admin, name);
}

function dropManagedDatabase(
  admin: LocalPostgresAdminDatabase,
  database: DisposablePostgresDatabase,
  createdNames: ReadonlySet<string>,
) {
  if (
    !MANAGED_DATABASE_PATTERN.test(database.name) ||
    !createdNames.has(database.name)
  ) {
    throw new Error(`Refusing to drop untracked database ${database.name}`);
  }
  command("dropdb", ["--maintenance-db", "postgres", database.name], {
    env: postgresEnv(admin, "postgres"),
  });
  console.log(`[TC174] dropped managed disposable database ${database.name}`);
}

function liveEnv(database: DisposablePostgresDatabase) {
  return {
    ...process.env,
    DATABASE_URL: database.url,
    TC174_DATABASE_URL: database.url,
  };
}

function runPrisma(args: string[], database: DisposablePostgresDatabase) {
  return command("pnpm", ["exec", "prisma", ...args], {
    capture: args.includes("--exit-code"),
    cwd: backendDir,
    env: liveEnv(database),
  });
}

function sha256(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function canonicalMigrations() {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      checksum: sha256(path.join(migrationsDir, entry.name, "migration.sql")),
      name: entry.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function verifyMigrationHistory(
  admin: LocalPostgresAdminDatabase,
  database: DisposablePostgresDatabase,
) {
  const output = command(
    "psql",
    [
      "-At",
      "-F",
      "\t",
      "-c",
      `SELECT migration_name, checksum, (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM "_prisma_migrations" ORDER BY started_at`,
    ],
    { capture: true, env: postgresEnv(admin, database.name) },
  );
  const applied = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, checksum, complete] = line.split("\t");
      return { checksum, complete, name };
    });
  const canonical = canonicalMigrations();
  if (applied.length !== canonical.length) {
    throw new Error(
      `migration history count mismatch: expected ${canonical.length}, got ${applied.length}`,
    );
  }
  canonical.forEach((migration, index) => {
    const row = applied[index];
    if (
      row?.name !== migration.name ||
      row.checksum !== migration.checksum ||
      row.complete !== "true"
    ) {
      throw new Error(`migration history mismatch at ${migration.name}`);
    }
  });
  console.log(`[TC174] canonical migration history ${canonical.length}/${canonical.length}`);
}

function runGate(database: DisposablePostgresDatabase) {
  const env = liveEnv(database);
  console.log("[TC174] build shared contract and generate Prisma client");
  command("pnpm", ["--filter", "@erliu/shared-contracts", "build"]);
  command("pnpm", ["--filter", "backend", "prisma:generate"], { env });
  runPrisma(["validate", "--schema", schemaPath], database);

  console.log("[TC174] deploy and verify migration status");
  runPrisma(["migrate", "deploy", "--schema", schemaPath], database);
  runPrisma(["migrate", "status", "--schema", schemaPath], database);

  console.log("[TC174] execute domain and PostgreSQL runtime evidence");
  command(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "../../tests/integration/vnext/vnext-story-truth.repository.spec.ts",
      "../../tests/integration/vnext/vnext-story-truth-postgres.spec.ts",
    ],
    { cwd: backendDir, env },
  );

  runPrisma(["migrate", "status", "--schema", schemaPath], database);
  const diff = runPrisma(
    [
      "migrate",
      "diff",
      "--from-schema-datasource",
      schemaPath,
      "--to-schema-datamodel",
      schemaPath,
      "--script",
      "--exit-code",
    ],
    database,
  );
  console.log(`[TC174] full-schema zero diff (${diff.trim()})`);
}

async function main() {
  const admin = requireLocalPostgresAdminDatabase("TC174_ADMIN_DATABASE_URL");
  const createdNames = new Set<string>();
  let database: DisposablePostgresDatabase | undefined;
  let gateFailure: unknown;
  try {
    database = createManagedDatabase(admin, createdNames);
    runGate(database);
    verifyMigrationHistory(admin, database);
    console.log("[TC174] PASS: managed story-truth PostgreSQL gate");
  } catch (error) {
    gateFailure = error;
  } finally {
    if (database) {
      try {
        dropManagedDatabase(admin, database, createdNames);
      } catch (cleanupError) {
        if (gateFailure) {
          throw new AggregateError(
            [gateFailure, cleanupError],
            "TC174 gate and exact cleanup both failed",
          );
        }
        throw cleanupError;
      }
    }
  }
  if (gateFailure) {
    throw gateFailure;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
