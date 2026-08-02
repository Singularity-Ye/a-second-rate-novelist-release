import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireLocalPostgresAdminDatabase,
  type DisposablePostgresDatabase,
  type LocalPostgresAdminDatabase,
} from "./disposable-postgres";

const MANAGED_DATABASE_PATTERN = /^erliu_tc208_support_[0-9a-f]{24}$/;
const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(toolDir, "../..");
const backendDir = path.join(workspaceDir, "apps/backend");
const prismaDir = path.join(backendDir, "prisma");
const schemaPath = path.join(prismaDir, "schema.prisma");
const migrationsDir = path.join(prismaDir, "migrations");
const tscCli = path.join(workspaceDir, "node_modules/typescript/bin/tsc");
const prismaCli = path.join(backendDir, "node_modules/prisma/build/index.js");
const vitestCli = path.join(backendDir, "node_modules/vitest/vitest.mjs");
const sharedContractsDir = path.join(workspaceDir, "packages/shared-contracts");

function postgresBinary(name: "createdb" | "dropdb" | "psql") {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const configuredDir = process.env.TC208_POSTGRES_BIN?.trim();
  if (configuredDir) {
    const configured = path.join(configuredDir, executable);
    if (!path.isAbsolute(configuredDir) || !existsSync(configured)) {
      throw new Error(
        "TC208_POSTGRES_BIN must be an absolute PostgreSQL bin directory",
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
  const name = `erliu_tc208_support_${randomBytes(12).toString("hex")}`;
  command(
    postgresBinary("createdb"),
    ["--maintenance-db", "postgres", "--template", "template0", name],
    { env: postgresEnv(admin, "postgres") },
  );
  createdNames.add(name);
  console.log(`[TC208] created managed disposable database ${name}`);
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
  console.log(`[TC208] dropped managed disposable database ${database.name}`);
}

function liveEnv(database: DisposablePostgresDatabase) {
  return {
    ...process.env,
    DATABASE_URL: database.url,
    TC208_DATABASE_URL: database.url,
  };
}

function runPrisma(args: string[], database: DisposablePostgresDatabase) {
  return command(process.execPath, [prismaCli, ...args], {
    capture: args.includes("--exit-code"),
    cwd: backendDir,
    env: liveEnv(database),
  });
}

function verifyIsolatedPrismaGenerate(database: DisposablePostgresDatabase) {
  const prefix = path.join(backendDir, ".tc208-prisma-");
  const tempDir = mkdtempSync(prefix);
  try {
    const generatedClientDir = path.join(tempDir, "generated-client");
    const source = readFileSync(schemaPath, "utf8");
    const generatorPattern =
      /generator client \{\r?\n  provider = "prisma-client-js"\r?\n\}/;
    if (!generatorPattern.test(source)) {
      throw new Error("canonical Prisma generator block changed unexpectedly");
    }
    const output = generatedClientDir.replace(/\\/g, "/");
    const isolatedSchema = source.replace(
      generatorPattern,
      `generator client {\n  provider = "prisma-client-js"\n  output = "${output}"\n}`,
    );
    const isolatedSchemaPath = path.join(tempDir, "schema.prisma");
    writeFileSync(isolatedSchemaPath, isolatedSchema, "utf8");
    command(process.execPath, [prismaCli, "generate", "--schema", isolatedSchemaPath], {
      cwd: backendDir,
      env: liveEnv(database),
    });
    if (!existsSync(path.join(generatedClientDir, "index.js"))) {
      throw new Error("isolated Prisma client generation produced no index.js");
    }
    console.log("[TC208] isolated Prisma client generation passed");
  } finally {
    const resolvedTemp = path.resolve(tempDir);
    const resolvedRoot = path.resolve(backendDir);
    if (
      !resolvedTemp.startsWith(`${resolvedRoot}${path.sep}`) ||
      !path.basename(resolvedTemp).startsWith(".tc208-prisma-")
    ) {
      throw new Error(`Refusing to remove untracked temp directory ${tempDir}`);
    }
    rmSync(resolvedTemp, { force: true, recursive: true });
  }
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
      `SELECT migration_name, checksum, (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM "_prisma_migrations" ORDER BY started_at`,
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
    `[TC208] canonical migration history ${canonical.length}/${canonical.length}`,
  );
}

function runGate(database: DisposablePostgresDatabase) {
  const env = liveEnv(database);
  console.log("[TC208] build shared contract and generate Prisma client");
  command(process.execPath, [tscCli, "-p", path.join(sharedContractsDir, "tsconfig.json")]);
  command(process.execPath, [path.join(sharedContractsDir, "scripts/fix-dist-exports.mjs")]);
  verifyIsolatedPrismaGenerate(database);
  runPrisma(["validate", "--schema", schemaPath], database);

  console.log("[TC208] deploy and verify canonical migration status");
  runPrisma(["migrate", "deploy", "--schema", schemaPath], database);
  runPrisma(["migrate", "status", "--schema", schemaPath], database);

  console.log("[TC208] execute domain, HTTP, and PostgreSQL runtime evidence");
  command(
    process.execPath,
    [
      vitestCli,
      "run",
      "../../tests/integration/vnext/system-support-encounter.spec.ts",
      "../../tests/integration/vnext/system-support-http.spec.ts",
      "../../tests/integration/vnext/system-support-postgres.spec.ts",
    ],
    { cwd: backendDir, env },
  );

  console.log("[TC208] build backend against generated persistence contract");
  command(process.execPath, [tscCli, "-p", path.join(backendDir, "tsconfig.json")], {
    env,
  });

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
  console.log(`[TC208] full-schema zero diff (${diff.trim()})`);
}

async function main() {
  const admin = requireLocalPostgresAdminDatabase("TC208_ADMIN_DATABASE_URL");
  const createdNames = new Set<string>();
  let database: DisposablePostgresDatabase | undefined;
  let gateFailure: unknown;
  try {
    database = createManagedDatabase(admin, createdNames);
    runGate(database);
    verifyMigrationHistory(admin, database);
    console.log("[TC208] PASS: managed system-support PostgreSQL gate");
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
            "TC208 gate and exact cleanup both failed",
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
