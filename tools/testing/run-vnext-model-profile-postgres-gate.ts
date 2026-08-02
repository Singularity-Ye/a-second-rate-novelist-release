import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireLocalPostgresAdminDatabase,
  type DisposablePostgresDatabase,
  type LocalPostgresAdminDatabase,
} from "./disposable-postgres";

const MANAGED_DATABASE_PATTERN = /^erliu_tc215_model_profile_[0-9a-f]{24}$/;
const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(toolDir, "../..");
const backendDir = path.join(workspaceDir, "apps/backend");
const prismaDir = path.join(backendDir, "prisma");
const schemaPath = path.join(prismaDir, "schema.prisma");
const migrationsDir = path.join(prismaDir, "migrations");
const prismaCli = path.join(backendDir, "node_modules/prisma/build/index.js");
const vitestCli = path.join(backendDir, "node_modules/vitest/vitest.mjs");

function postgresBinary(name: "createdb" | "dropdb" | "psql") {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const configuredDir = process.env.TC215_POSTGRES_BIN?.trim();
  if (configuredDir) {
    const configured = path.join(configuredDir, executable);
    if (!path.isAbsolute(configuredDir) || !existsSync(configured)) {
      throw new Error(
        "TC215_POSTGRES_BIN must be an absolute PostgreSQL bin directory",
      );
    }
    return configured;
  }
  if (process.platform === "win32") {
    const installations = path.join(
      process.env.ProgramFiles ?? "C:\\Program Files",
      "PostgreSQL",
    );
    if (existsSync(installations)) {
      const versions = readdirSync(installations, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) =>
          right.localeCompare(left, undefined, { numeric: true }),
        );
      for (const version of versions) {
        const candidate = path.join(installations, version, "bin", executable);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return executable;
}

function command(
  binary: string,
  args: string[],
  options: { capture?: boolean; cwd?: string; env?: NodeJS.ProcessEnv } = {},
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
  const name = `erliu_tc215_model_profile_${randomBytes(12).toString("hex")}`;
  command(
    postgresBinary("createdb"),
    ["--maintenance-db", "postgres", "--template", "template0", name],
    { env: postgresEnv(admin, "postgres") },
  );
  createdNames.add(name);
  console.log(`[TC215] created managed disposable database ${name}`);
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
  command(
    postgresBinary("dropdb"),
    ["--maintenance-db", "postgres", database.name],
    { env: postgresEnv(admin, "postgres") },
  );
  console.log(`[TC215] dropped managed disposable database ${database.name}`);
}

function liveEnv(database: DisposablePostgresDatabase) {
  return {
    ...process.env,
    DATABASE_URL: database.url,
    TC215_DATABASE_URL: database.url,
  };
}

function runPrisma(args: string[], database: DisposablePostgresDatabase) {
  return command(process.execPath, [prismaCli, ...args], {
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
    postgresBinary("psql"),
    [
      "-At",
      "-F",
      "\t",
      "-c",
      'SELECT migration_name, checksum, (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM "_prisma_migrations" ORDER BY started_at',
    ],
    { capture: true, env: postgresEnv(admin, database.name) },
  );
  const applied = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, checksum, complete] = line
        .split("\t")
        .map((field) => field.trim());
      return { checksum, complete, name };
    });
  const canonical = canonicalMigrations();
  expectMigrationHistory(applied, canonical);
  console.log(
    `[TC215] canonical migration history ${canonical.length}/${canonical.length}`,
  );
}

function expectMigrationHistory(
  applied: readonly { checksum?: string; complete?: string; name?: string }[],
  canonical: readonly { checksum: string; name: string }[],
) {
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
}

function runGate(database: DisposablePostgresDatabase) {
  console.log(
    "[TC215] validate schema and deploy every migration into a clean database",
  );
  runPrisma(["validate", "--schema", schemaPath], database);
  runPrisma(["migrate", "deploy", "--schema", schemaPath], database);
  runPrisma(["migrate", "status", "--schema", schemaPath], database);

  console.log("[TC215] execute model preference PostgreSQL acceptance");
  command(
    process.execPath,
    [
      vitestCli,
      "run",
      "../../tests/integration/vnext/model-profile-postgres.spec.ts",
    ],
    { cwd: backendDir, env: liveEnv(database) },
  );

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
  console.log(`[TC215] full-schema zero diff (${diff.trim()})`);
}

async function main() {
  const admin = requireLocalPostgresAdminDatabase("TC215_ADMIN_DATABASE_URL");
  const createdNames = new Set<string>();
  let database: DisposablePostgresDatabase | undefined;
  let gateFailure: unknown;
  try {
    database = createManagedDatabase(admin, createdNames);
    runGate(database);
    verifyMigrationHistory(admin, database);
    console.log("[TC215] PASS: fresh model-profile PostgreSQL truth gate");
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
            "TC215 gate and exact cleanup both failed",
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
