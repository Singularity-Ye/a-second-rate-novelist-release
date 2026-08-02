import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireLocalPostgresAdminDatabase,
  type DisposablePostgresDatabase,
  type LocalPostgresAdminDatabase,
} from "./disposable-postgres";

const reconciliationMigration = {
  name: "20260717222500_legacy_prisma_drift_reconciliation",
  sha256: "e9d74fde3f5816ddce19666d80ef647c004e1009be49f0337577a1f54abbf2ab",
} as const;
const predecessorMigrations = [
  {
    name: "202604022230_story_intake_shadow_baseline",
    sha256: "0da9cca90fc10f1325996e49ef9779b5f074b020ed487286a5756b59fbcc25e7",
  },
  {
    name: "202604022355_app_state_primary_snapshot",
    sha256: "7b87e05725f92b78a1afb9f35670f77c99d53463894454485a606402926c2389",
  },
  {
    name: "202604030010_core_truth_source_primary_models",
    sha256: "efd62dc9ad39600395cb3962909b7200d329f5c51330250158d6abb264605846",
  },
  {
    name: "20260717130044_vnext_session_foundation",
    sha256: "b30bbfd0dc8178e3805e4ff6143eb77646536a46f6028526397523e9441d3e69",
  },
] as const;
const migrationLockSha256 = "99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900";
const managedDatabasePattern = /^erliu_tc178_(?:fresh|upgrade)_[0-9a-f]{24}$/;

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(toolDir, "../..");
const backendDir = path.join(workspaceDir, "apps/backend");
const prismaDir = path.join(backendDir, "prisma");
const currentSchema = path.join(prismaDir, "schema.prisma");
const migrationsDir = path.join(prismaDir, "migrations");
const fixtureDir = path.join(toolDir, "fixtures");

function fileSha256(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function runPrisma(
  args: string[],
  database: DisposablePostgresDatabase,
  options: {
    acceptedStatuses?: number[];
    capture?: boolean;
    extraEnv?: NodeJS.ProcessEnv;
    input?: string;
  } = {},
) {
  const capture = options.capture ?? false;
  const acceptedStatuses = options.acceptedStatuses ?? [0];
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    cwd: backendDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: database.url,
      ...options.extraEnv,
    },
    input: options.input,
    stdio: capture
      ? ["pipe", "pipe", "pipe"]
      : options.input === undefined
        ? "inherit"
        : ["pipe", "inherit", "inherit"],
  });

  if (result.error) {
    throw result.error;
  }
  const status = result.status ?? 1;
  if (!acceptedStatuses.includes(status)) {
    if (capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`Prisma command failed with exit ${status}: prisma ${args.join(" ")}`);
  }
  return result.stdout ?? "";
}

function postgresClientEnv(admin: LocalPostgresAdminDatabase, databaseName: string) {
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

function runPostgresClient(
  binary: "createdb" | "dropdb" | "psql",
  args: string[],
  admin: LocalPostgresAdminDatabase,
  databaseName: string,
  options: { capture?: boolean } = {},
) {
  const capture = options.capture ?? false;
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    env: postgresClientEnv(admin, databaseName),
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) {
    throw new Error(`${binary} is required for the local TC178 PostgreSQL gate: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${binary} failed with exit ${result.status ?? 1}`);
  }
  return result.stdout ?? "";
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
  kind: "fresh" | "upgrade",
) {
  const name = `erliu_tc178_${kind}_${randomBytes(12).toString("hex")}`;
  runPostgresClient(
    "createdb",
    ["--maintenance-db", "postgres", "--template", "template0", name],
    admin,
    "postgres",
  );
  console.log(`[TC178] created managed disposable database ${name}`);
  return databaseFromAdmin(admin, name);
}

function dropManagedDatabase(
  admin: LocalPostgresAdminDatabase,
  database: DisposablePostgresDatabase,
  createdNames: ReadonlySet<string>,
) {
  if (!managedDatabasePattern.test(database.name) || !createdNames.has(database.name)) {
    throw new Error(`Refusing to drop untracked database ${database.name}`);
  }
  runPostgresClient(
    "dropdb",
    ["--maintenance-db", "postgres", "--if-exists", database.name],
    admin,
    "postgres",
  );
  console.log(`[TC178] dropped managed disposable database ${database.name}`);
}

function deployMigrationRoot(
  database: DisposablePostgresDatabase,
  schema: string,
  label: string,
) {
  console.log(`\n[TC178] ${label}: migrate deploy`);
  runPrisma(["migrate", "deploy", "--schema", schema], database);
  runPrisma(["migrate", "status", "--schema", schema], database);
}

function deployCurrentMigrations(database: DisposablePostgresDatabase, label: string) {
  deployMigrationRoot(database, currentSchema, `${label}: current migrations`);
}

function expectZeroDatamodelDiff(database: DisposablePostgresDatabase, label: string) {
  const output = runPrisma(
    [
      "migrate",
      "diff",
      "--from-schema-datasource",
      currentSchema,
      "--to-schema-datamodel",
      currentSchema,
      "--script",
      "--exit-code",
    ],
    database,
    { capture: true },
  );
  console.log(`[TC178] ${label}: full-schema zero diff${output.trim() ? ` (${output.trim()})` : ""}`);
}

function sqlStatements(sql: string) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) =>
      statement
        .replaceAll('"public".', "")
        .replace(/" ASC\b/g, '"')
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function assertPreReconciliationDrift(
  database: DisposablePostgresDatabase,
  targetDatabase: DisposablePostgresDatabase,
  targetDatasourceSchema: string,
) {
  const output = runPrisma(
    [
      "migrate",
      "diff",
      "--from-schema-datasource",
      currentSchema,
      "--to-schema-datasource",
      targetDatasourceSchema,
      "--script",
      "--exit-code",
    ],
    database,
    {
      acceptedStatuses: [2],
      capture: true,
      extraEnv: { TC178_TARGET_DATABASE_URL: targetDatabase.url },
    },
  );
  const expected = sqlStatements(
    readFileSync(path.join(fixtureDir, "tc178-pre-reconciliation-diff.sql"), "utf8"),
  );
  const actual = sqlStatements(output);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      [
        "TC178 RED drift classification changed.",
        `Expected (${expected.length}):\n${expected.join("\n")}`,
        `Actual (${actual.length}):\n${actual.join("\n")}`,
      ].join("\n"),
    );
  }
  console.log(
    `[TC178] upgrade RED: non-zero diff reproduced; ${actual.length}/${expected.length} exact classified SQL statements detected`,
  );
}

function executeFixture(database: DisposablePostgresDatabase, fileName: string, label: string) {
  console.log(`[TC178] upgrade: ${label}`);
  runPrisma(
    ["db", "execute", "--schema", currentSchema, "--stdin"],
    database,
    { input: readFileSync(path.join(fixtureDir, fileName), "utf8") },
  );
}

function assertMigrationBoundary() {
  const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const reconciliationIndex = migrationNames.indexOf(reconciliationMigration.name);
  const actualPredecessors = migrationNames.slice(0, reconciliationIndex);
  const expectedPredecessors = predecessorMigrations.map((migration) => migration.name);
  if (
    reconciliationIndex !== expectedPredecessors.length ||
    JSON.stringify(actualPredecessors) !== JSON.stringify(expectedPredecessors)
  ) {
    throw new Error(
      `TC178 predecessor boundary changed: ${JSON.stringify(actualPredecessors)}`,
    );
  }

  const checks = [
    {
      path: path.join(migrationsDir, "migration_lock.toml"),
      sha256: migrationLockSha256,
    },
    ...predecessorMigrations.map((migration) => ({
      path: path.join(migrationsDir, migration.name, "migration.sql"),
      sha256: migration.sha256,
    })),
    {
      path: path.join(migrationsDir, reconciliationMigration.name, "migration.sql"),
      sha256: reconciliationMigration.sha256,
    },
  ];
  for (const check of checks) {
    const actualSha = fileSha256(check.path);
    if (actualSha !== check.sha256) {
      throw new Error(`TC178 immutable migration checksum changed: ${check.path}`);
    }
  }
  console.log("[TC178] fixed predecessor boundary and migration checksums verified");
}

function createMigrationRoot(options: { includeReconciliation: boolean }) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "erliu-tc178-migrations-"));
  try {
    const tempMigrations = path.join(tempRoot, "migrations");
    mkdirSync(tempMigrations);
    copyFileSync(currentSchema, path.join(tempRoot, "schema.prisma"));
    copyFileSync(
      path.join(migrationsDir, "migration_lock.toml"),
      path.join(tempMigrations, "migration_lock.toml"),
    );
    const migrations = options.includeReconciliation
      ? [...predecessorMigrations, reconciliationMigration]
      : predecessorMigrations;
    for (const migration of migrations) {
      cpSync(
        path.join(migrationsDir, migration.name),
        path.join(tempMigrations, migration.name),
        { recursive: true },
      );
    }
    if (options.includeReconciliation) {
      const schemaSource = readFileSync(currentSchema, "utf8");
      const targetDatasourceSource = schemaSource.replace(
        'env("DATABASE_URL")',
        'env("TC178_TARGET_DATABASE_URL")',
      );
      if (targetDatasourceSource === schemaSource) {
        throw new Error("Could not create TC178 target datasource schema");
      }
      writeFileSync(
        path.join(tempRoot, "target-datasource.prisma"),
        targetDatasourceSource,
      );
    }
    return tempRoot;
  } catch (error) {
    rmSync(tempRoot, { force: true, recursive: true });
    throw error;
  }
}

function verifyMigrationHistory(database: DisposablePostgresDatabase) {
  const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedValues = migrationNames
    .map((name) => {
      const sha = fileSha256(path.join(migrationsDir, name, "migration.sql"));
      return `('${name.replaceAll("'", "''")}','${sha}')`;
    })
    .join(",");
  const sql = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES ${expectedValues}) AS expected(migration_name, checksum)
    FULL JOIN _prisma_migrations AS actual USING (migration_name)
    WHERE expected.migration_name IS NULL
       OR actual.migration_name IS NULL
       OR actual.checksum <> expected.checksum
       OR actual.finished_at IS NULL
       OR actual.rolled_back_at IS NOT NULL
       OR actual.applied_steps_count <> 1
  ) THEN
    RAISE EXCEPTION 'TC178 migration history differs from canonical files';
  END IF;

  IF EXISTS (
    SELECT migration_name
    FROM _prisma_migrations
    GROUP BY migration_name
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION 'TC178 migration history contains duplicate names';
  END IF;
END
$$;
`;
  runPrisma(
    ["db", "execute", "--schema", currentSchema, "--stdin"],
    database,
    { input: sql },
  );
  console.log(`[TC178] ${database.name}: canonical migration history/checksums verified`);
}

function captureUpgradeSnapshot(
  admin: LocalPostgresAdminDatabase,
  database: DisposablePostgresDatabase,
) {
  return runPostgresClient(
    "psql",
    [
      "--no-psqlrc",
      "--no-align",
      "--tuples-only",
      "--set",
      "ON_ERROR_STOP=1",
      "--file",
      path.join(fixtureDir, "tc178-upgrade-snapshot.sql"),
    ],
    admin,
    database.name,
    { capture: true },
  ).trim();
}

function runGate(
  admin: LocalPostgresAdminDatabase,
  freshDatabase: DisposablePostgresDatabase,
  upgradeDatabase: DisposablePostgresDatabase,
  tempRoots: string[],
) {
  console.log("[TC178] validating current Prisma datamodel");
  runPrisma(["validate", "--schema", currentSchema], freshDatabase);
  assertMigrationBoundary();

  const preReconciliationRoot = createMigrationRoot({ includeReconciliation: false });
  tempRoots.push(preReconciliationRoot);
  const reconciliationBoundaryRoot = createMigrationRoot({ includeReconciliation: true });
  tempRoots.push(reconciliationBoundaryRoot);
  const preReconciliationSchema = path.join(preReconciliationRoot, "schema.prisma");
  const reconciliationBoundarySchema = path.join(
    reconciliationBoundaryRoot,
    "schema.prisma",
  );
  const targetDatasourceSchema = path.join(
    reconciliationBoundaryRoot,
    "target-datasource.prisma",
  );

  deployMigrationRoot(
    freshDatabase,
    reconciliationBoundarySchema,
    "fresh database through reconciliation boundary",
  );
  deployMigrationRoot(
    upgradeDatabase,
    preReconciliationSchema,
    "representative upgrade database before reconciliation",
  );
  executeFixture(upgradeDatabase, "tc178-upgrade-seed.sql", "seed representative legacy data");
  const preUpgradeSnapshot = captureUpgradeSnapshot(admin, upgradeDatabase);
  assertPreReconciliationDrift(upgradeDatabase, freshDatabase, targetDatasourceSchema);

  deployCurrentMigrations(upgradeDatabase, "representative upgrade database");
  const postUpgradeSnapshot = captureUpgradeSnapshot(admin, upgradeDatabase);
  if (postUpgradeSnapshot !== preUpgradeSnapshot) {
    throw new Error("TC178 reconciliation changed the complete representative data snapshot");
  }
  console.log("[TC178] upgrade: complete pre/post data snapshot is byte-identical");

  executeFixture(
    upgradeDatabase,
    "tc178-upgrade-verify.sql",
    "verify data/default/index/FK catalog and rollback-safe cascade behavior",
  );
  if (captureUpgradeSnapshot(admin, upgradeDatabase) !== postUpgradeSnapshot) {
    throw new Error("TC178 cascade verification did not roll back cleanly");
  }

  deployCurrentMigrations(freshDatabase, "fresh database");
  verifyMigrationHistory(freshDatabase);
  verifyMigrationHistory(upgradeDatabase);
  expectZeroDatamodelDiff(freshDatabase, "fresh database");
  expectZeroDatamodelDiff(upgradeDatabase, "representative upgrade database");
}

function main() {
  const admin = requireLocalPostgresAdminDatabase("TC178_ADMIN_DATABASE_URL");
  const createdDatabases: DisposablePostgresDatabase[] = [];
  const createdNames = new Set<string>();
  const tempRoots: string[] = [];
  const errors: unknown[] = [];

  try {
    const freshDatabase = createManagedDatabase(admin, "fresh");
    createdDatabases.push(freshDatabase);
    createdNames.add(freshDatabase.name);
    const upgradeDatabase = createManagedDatabase(admin, "upgrade");
    createdDatabases.push(upgradeDatabase);
    createdNames.add(upgradeDatabase.name);
    runGate(admin, freshDatabase, upgradeDatabase, tempRoots);
  } catch (error) {
    errors.push(error);
  } finally {
    for (const tempRoot of tempRoots.reverse()) {
      try {
        rmSync(tempRoot, { force: true, recursive: true });
      } catch (error) {
        errors.push(error);
      }
    }
    for (const database of createdDatabases.reverse()) {
      try {
        dropManagedDatabase(admin, database, createdNames);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "TC178 migration truth gate failed");
  }
  console.log(
    "\n[TC178] PASS: managed fresh and representative upgrade databases match the current datamodel",
  );
}

main();
