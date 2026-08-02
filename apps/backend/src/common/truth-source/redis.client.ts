import { createClient } from "redis";
import { readTruthSourceConfig } from "./truth-source.config.js";

type InternalRedisClient = ReturnType<typeof createClient>;

export interface RedisQueueClient {
  rPush(key: string, element: string): Promise<unknown>;
}

let redisClientSingleton: RedisQueueClient | null = null;
let redisConnectPromise: Promise<RedisQueueClient> | null = null;
let rawRedisClientSingleton: InternalRedisClient | null = null;

export function isRedisConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  return readTruthSourceConfig(env).cache.configured;
}

export async function getRedisClient(
  env: Record<string, string | undefined> = process.env,
): Promise<RedisQueueClient> {
  if (!isRedisConfigured(env)) {
    throw new Error("Redis is not configured");
  }

  if (redisClientSingleton) {
    return redisClientSingleton;
  }

  if (redisConnectPromise) {
    return redisConnectPromise;
  }

  const url = readTruthSourceConfig(env).cache.url;

  if (!url) {
    throw new Error("Redis URL is not configured");
  }

  const client: InternalRedisClient = createClient({
    url,
  });
  rawRedisClientSingleton = client;

  redisConnectPromise = client.connect().then(() => {
    redisClientSingleton = {
      rPush(key, element) {
        return client.rPush(key, element);
      },
    };
    redisConnectPromise = null;
    return redisClientSingleton;
  }).catch((error) => {
    redisConnectPromise = null;
    throw error;
  });

  return redisConnectPromise;
}

export async function disconnectRedisClient() {
  redisConnectPromise = null;
  redisClientSingleton = null;

  if (!rawRedisClientSingleton) {
    return;
  }

  const client = rawRedisClientSingleton;
  rawRedisClientSingleton = null;

  try {
    await client.quit();
  } catch {
    client.destroy();
  }
}
