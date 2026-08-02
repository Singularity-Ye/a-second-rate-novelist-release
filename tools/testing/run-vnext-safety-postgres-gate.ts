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

const MANAGED_DATABASE_PATTERN = /^erliu_tc173_safety_[0-9a-f]{24}$/;
const EXPECTED_CANONICAL_MIGRATION_COUNT = 9;
const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(toolDir, "../..");
const backendDir = path.join(workspaceDir, "apps/backend");
const prismaDir = path.join(backendDir, "prisma");
const schemaPath = path.join(prismaDir, "schema.prisma");
const migrationsDir = path.join(prismaDir, "migrations");

const tc173Specs = [
  "../../tests/integration/vnext/vnext-safety-policy.spec.ts",
  "../../tests/integration/vnext/vnext-safety-disposition-uow.spec.ts",
  "../../tests/integration/vnext/vnext-safety-disposition-postgres.spec.ts",
  "../../tests/integration/vnext/vnext-safety-outbox-dispatch.spec.ts",
  "../../tests/integration/vnext/vnext-readiness.spec.ts",
  "../../tests/integration/vnext/vnext-consent-withdrawal.spec.ts",
  "../../tests/integration/vnext/vnext-continuous-use.spec.ts",
  "../../tests/integration/vnext/vnext-crisis-escalation.spec.ts",
  "../../tests/integration/vnext/vnext-safety-dispatch-postgres.spec.ts",
] as const;

const regressionSpecs = [
  "../../tests/integration/vnext/create-guest-session.spec.ts",
  "../../tests/integration/vnext/vnext-session-authz.spec.ts",
  "../../tests/integration/vnext/creative-task-worker.spec.ts",
  "../../tests/integration/vnext/creative-orchestration.spec.ts",
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
  const name = `erliu_tc173_safety_${randomBytes(12).toString("hex")}`;
  if (!MANAGED_DATABASE_PATTERN.test(name)) {
    throw new Error(`refusing malformed managed database name ${name}`);
  }
  command(
    "createdb",
    ["--maintenance-db", "postgres", "--template", "template0", name],
    { env: postgresEnv(admin, "postgres") },
  );
  createdNames.add(name);
  console.log(`[TC173] created managed disposable database ${name}`);
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
  command(
    "dropdb",
    ["--maintenance-db", "postgres", "--force", database.name],
    { env: postgresEnv(admin, "postgres") },
  );
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
  console.log(
    `[TC173] dropped and verified managed database ${database.name} (count=0)`,
  );
}

function liveEnv(database: DisposablePostgresDatabase) {
  return {
    ...process.env,
    DATABASE_URL: database.url,
    TC173_DATABASE_URL: database.url,
    TC173_POSTGRES_GATE: "1",
    VNEXT_CRISIS_ESCALATION_MODE: "sandbox",
    VNEXT_REAL_PERSON_INPUT_ENABLED: "false",
    VNEXT_SAFETY_POLICY_MODE: "synthetic_sandbox",
    VNEXT_SAFETY_POLICY_VERSION: "tc173-synthetic-sandbox-v1",
    VNEXT_SAFETY_CONTACT_REF: "sandbox-contact:tc173",
    VNEXT_SAFETY_SUPPORTED_INPUT_DIGESTS: "a".repeat(64),
    VNEXT_SAFETY_BLOCKED_INPUT_DIGESTS: "b".repeat(64),
    VNEXT_SAFETY_CRISIS_INPUT_DIGESTS: "c".repeat(64),
    VNEXT_SAFETY_SUPPORTED_OUTPUT_DIGESTS: "d".repeat(64),
    VNEXT_SAFETY_BLOCKED_OUTPUT_DIGESTS: "e".repeat(64),
    VNEXT_SAFETY_CRISIS_OUTPUT_DIGESTS: "f".repeat(64),
    VNEXT_SYNTHETIC_FIXTURE_MODE: "internal_sandbox",
    VNEXT_SYNTHETIC_FIXTURE_CATALOG_VERSION: "tc173-sandbox-v1",
    VNEXT_APPROVED_SYNTHETIC_FIXTURE_DIGESTS: [
      "a".repeat(64),
      "b".repeat(64),
      "c".repeat(64),
    ].join(","),
    VNEXT_PROCESSING_BASIS_CONTROL_ACTOR: "system_policy",
    VNEXT_PROCESSING_BASIS_CONTROL_AUTHORIZATION_REF:
      "tc173:sandbox-control",
    VNEXT_CONTINUOUS_USE_IDLE_RESET_SECONDS: "1800",
    VNEXT_SAFETY_APPEAL_SEALING_KEY: "A".repeat(43),
    VNEXT_SAFETY_APPEAL_DIGEST_KEY: "B".repeat(43),
    VNEXT_SAFETY_APPEAL_SEALING_KEY_VERSION: "tc173-appeal-key-v1",
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
  console.log(
    `[TC173] canonical migration history/checksums ${canonical.length}/${canonical.length}`,
  );
}

function runSpec(spec: string, env: NodeJS.ProcessEnv) {
  console.log(`[TC173] vitest ${path.basename(spec)}`);
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

function runGate(database: DisposablePostgresDatabase) {
  const env = liveEnv(database);
  canonicalMigrations();

  console.log("[TC173] build shared contract, generate and validate Prisma");
  command("pnpm", ["--filter", "@erliu/shared-contracts", "build"]);
  command("pnpm", ["--filter", "backend", "prisma:generate"], { env });
  runPrisma(["validate", "--schema", schemaPath], database);

  console.log("[TC173] deploy and verify all canonical migrations");
  runPrisma(["migrate", "deploy", "--schema", schemaPath], database);
  runPrisma(["migrate", "status", "--schema", schemaPath], database);

  console.log(
    "[TC173] execute safety, compliance, readiness, dispatcher, and regression evidence serially",
  );
  for (const spec of [...tc173Specs, ...regressionSpecs]) {
    runSpec(spec, env);
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
  console.log(`[TC173] full-schema zero diff (${diff.trim()})`);
}

function main() {
  const admin = requireLocalPostgresAdminDatabase("TC173_ADMIN_DATABASE_URL");
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
            "TC173 gate and exact cleanup both failed",
          );
        }
        throw cleanupError;
      }
    }
  }
  if (createdNames.size !== 0) {
    throw new Error(
      `TC173 cleanup left ${createdNames.size} tracked managed database(s)`,
    );
  }
  if (gateFailure) {
    throw gateFailure;
  }
  console.log(
    "[TC173] PASS: code_audit + local_postgresql + runtime_safety_sandbox (real-person/provider runtime not claimed)",
  );
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
