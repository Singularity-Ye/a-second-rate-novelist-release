import { PrismaClient } from "@prisma/client";
import { readTruthSourceConfig } from "./truth-source.config.js";

let prismaClientSingleton: PrismaClient | null = null;
let prismaClientOverride: PrismaClient | null = null;

export function isPostgresTruthSourceConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  return readTruthSourceConfig(env).primary_db.configured;
}

export function __setPrismaClientForTests(override: PrismaClient | null) {
  prismaClientOverride = override;
}

export function getPrismaClient(
  env: Record<string, string | undefined> = process.env,
) {
  if (prismaClientOverride) {
    return prismaClientOverride;
  }

  if (!isPostgresTruthSourceConfigured(env)) {
    throw new Error("PostgreSQL truth source is not configured");
  }

  prismaClientSingleton ??= new PrismaClient();
  return prismaClientSingleton;
}

export async function disconnectPrismaClient() {
  prismaClientOverride = null;

  if (!prismaClientSingleton) {
    return;
  }

  await prismaClientSingleton.$disconnect();
  prismaClientSingleton = null;
}
