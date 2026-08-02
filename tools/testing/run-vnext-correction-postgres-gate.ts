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

const MANAGED_DATABASE_PATTERN = /^erliu_tc179_correction_[0-9a-f]{24}$/;
const EXPECTED_CANONICAL_MIGRATION_COUNT = 9;
const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(toolDir, "../..");
const backendDir = path.join(workspaceDir, "apps/backend");
const prismaDir = path.join(backendDir, "prisma");
const schemaPath = path.join(prismaDir, "schema.prisma");
const migrationsDir = path.join(prismaDir, "migrations");
const correctionSpecs = [
  "../../tests/integration/vnext/correct-understanding.spec.ts",
  "../../tests/integration/vnext/vnext-correction-http.spec.ts",
  "../../tests/integration/vnext/vnext-correction-admission-postgres.spec.ts",
  "../../tests/integration/vnext/vnext-correction-completion-postgres.spec.ts",
  "../../tests/integration/vnext/vnext-experience-http.spec.ts",
  "../../tests/integration/vnext/configured-creative-runtime.adapter.spec.ts",
  "../../tests/integration/vnext/creative-task-worker.spec.ts",
  "../../tests/integration/vnext/project-experience.spec.ts",
  "../../tests/integration/vnext/vnext-experience-contract.spec.ts",
] as const;

const managedRegressionGates = [
  ["TC164_ADMIN_DATABASE_URL", "test:vnext:worker:postgres"],
  ["TC165_ADMIN_DATABASE_URL", "test:vnext:orchestration:postgres"],
  ["TC173_ADMIN_DATABASE_URL", "test:vnext:safety:postgres"],
  ["TC174_ADMIN_DATABASE_URL", "test:vnext:story-truth:postgres"],
] as const;

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
  if (result.error) throw result.error;
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
  const name = `erliu_tc179_correction_${randomBytes(12).toString("hex")}`;
  if (!MANAGED_DATABASE_PATTERN.test(name)) {
    throw new Error(`refusing malformed managed database name ${name}`);
  }
  command(
    "createdb",
    ["--maintenance-db", "postgres", "--template", "template0", name],
    { env: postgresEnv(admin, "postgres") },
  );
  createdNames.add(name);
  console.log(`[TC179] created managed disposable database ${name}`);
  return databaseFromAdmin(admin, name);
}

function dropManagedDatabase(
  admin: LocalPostgresAdminDatabase,
  database: DisposablePostgresDatabase,
  createdNames: Set<string>,
) {
  if (
    !MANAGED_DATABASE_PATTERN.test(database.name) ||
    !createdNames.has(database.name)
  ) {
    throw new Error(`refusing to drop untracked database ${database.name}`);
  }
  command("dropdb", ["--maintenance-db", "postgres", database.name], {
    env: postgresEnv(admin, "postgres"),
  });
  const remaining = command(
    "psql",
    [
      "-At",
      "-c",
      `SELECT count(*) FROM pg_database WHERE datname = '${database.name}'`,
    ],
    { capture: true, env: postgresEnv(admin, "postgres") },
  ).trim();
  if (remaining !== "0") {
    throw new Error(`managed database ${database.name} still exists after drop`);
  }
  createdNames.delete(database.name);
  console.log(`[TC179] dropped and verified ${database.name} (count=0)`);
}

function liveEnv(database: DisposablePostgresDatabase) {
  return {
    ...process.env,
    DATABASE_URL: database.url,
    TC179_DATABASE_URL: database.url,
    TC179_POSTGRES_GATE: "1",
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
  const canonical = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      checksum: sha256(path.join(migrationsDir, entry.name, "migration.sql")),
      name: entry.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (canonical.length !== EXPECTED_CANONICAL_MIGRATION_COUNT) {
    throw new Error(
      `canonical migration count mismatch: expected ${EXPECTED_CANONICAL_MIGRATION_COUNT}, got ${canonical.length}`,
    );
  }
  return canonical;
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
      'SELECT migration_name, checksum, (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM "_prisma_migrations" ORDER BY started_at',
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
  console.log(`[TC179] canonical migration history/checksums 9/9`);
}

function runGate(database: DisposablePostgresDatabase) {
  const env = liveEnv(database);
  canonicalMigrations();
  console.log("[TC179] build contract, generate and validate Prisma");
  command("pnpm", ["--filter", "@erliu/shared-contracts", "build"]);
  command("pnpm", ["--filter", "backend", "prisma:generate"], { env });
  runPrisma(["validate", "--schema", schemaPath], database);
  command("pnpm", ["--filter", "backend", "build"], { env });
  command("pnpm", ["verify:vnext-types"], { env });
  command("pnpm", ["verify:vnext-boundaries"], { env });

  console.log("[TC179] deploy all forward-only migrations");
  runPrisma(["migrate", "deploy", "--schema", schemaPath], database);
  runPrisma(["migrate", "status", "--schema", schemaPath], database);

  console.log(
    "[TC179] execute correction contract, runtime, projection, admission and completion evidence serially",
  );
  for (const spec of correctionSpecs) {
    console.log(`[TC179] vitest ${path.basename(spec)}`);
    command(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        spec,
        "--maxWorkers=1",
        "--fileParallelism=false",
      ],
      { cwd: backendDir, env },
    );
  }

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
  console.log(`[TC179] full-schema zero diff (${diff.trim()})`);
}

function runManagedRegressionGates(admin: LocalPostgresAdminDatabase) {
  console.log(
    "[TC179] execute TC164/165/173/174 managed PostgreSQL regressions serially",
  );
  for (const [envName, script] of managedRegressionGates) {
    console.log(`[TC179] pnpm ${script}`);
    command("pnpm", [script], {
      env: { ...process.env, [envName]: admin.url },
    });
  }
}

function main() {
  const admin = requireLocalPostgresAdminDatabase("TC179_ADMIN_DATABASE_URL");
  const createdNames = new Set<string>();
  let database: DisposablePostgresDatabase | undefined;
  let gateFailure: unknown;
  try {
    database = createManagedDatabase(admin, createdNames);
    runGate(database);
    verifyMigrationHistory(admin, database);
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
            "TC179 gate and exact cleanup both failed",
          );
        }
        throw cleanupError;
      }
    }
  }
  if (createdNames.size !== 0) {
    throw new Error(
      `TC179 cleanup left ${createdNames.size} tracked managed database(s)`,
    );
  }
  if (gateFailure) throw gateFailure;
  runManagedRegressionGates(admin);
  console.log(
    "[TC179] PASS: code_audit + local_postgresql (real provider not claimed)",
  );
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
