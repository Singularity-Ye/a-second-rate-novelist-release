export type DisposablePostgresDatabase = {
  identity: string;
  name: string;
  url: string;
};

export type LocalPostgresAdminDatabase = DisposablePostgresDatabase & {
  host: string;
  password: string;
  port: string;
  username: string;
};

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function requireDisposablePostgresDatabase(options: {
  databaseNameDescription: string;
  databaseNamePattern: RegExp;
  envName: string;
}): DisposablePostgresDatabase {
  const value = process.env[options.envName]?.trim();
  if (!value) {
    throw new Error(`${options.envName} is required; PostgreSQL runtime tests may not be skipped`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${options.envName} must be a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${options.envName} must use PostgreSQL`);
  }

  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!options.databaseNamePattern.test(name)) {
    throw new Error(
      `${options.envName} must target a disposable database named ${options.databaseNameDescription}`,
    );
  }

  const schema = parsed.searchParams.get("schema") ?? "public";
  if (schema !== "public") {
    throw new Error(`${options.envName} must target the public schema`);
  }

  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error(`${options.envName} must target loopback`);
  }

  return {
    identity: `${parsed.hostname}:${parsed.port || "5432"}/${name}?schema=${schema}`,
    name,
    url: value,
  };
}

export function requireLocalPostgresAdminDatabase(
  envName: string,
): LocalPostgresAdminDatabase {
  const value = process.env[envName]?.trim();
  if (!value) {
    throw new Error(`${envName} is required; migration truth tests may not be skipped`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envName} must be a valid PostgreSQL URL`);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${envName} must use PostgreSQL`);
  }
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error(`${envName} must target loopback`);
  }

  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (name !== "postgres") {
    throw new Error(`${envName} must target the postgres maintenance database`);
  }
  const schema = parsed.searchParams.get("schema") ?? "public";
  if (schema !== "public") {
    throw new Error(`${envName} must target the public schema`);
  }
  const username = decodeURIComponent(parsed.username);
  if (!username) {
    throw new Error(`${envName} must include an explicit PostgreSQL username`);
  }

  return {
    host: parsed.hostname.replace(/^\[|\]$/g, ""),
    identity: `${parsed.hostname}:${parsed.port || "5432"}/postgres?schema=public`,
    name,
    password: decodeURIComponent(parsed.password),
    port: parsed.port || "5432",
    url: value,
    username,
  };
}
