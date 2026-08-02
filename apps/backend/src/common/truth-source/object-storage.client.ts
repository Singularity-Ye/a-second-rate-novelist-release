import { GetObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { readTruthSourceConfig } from "./truth-source.config.js";

let objectStorageClientSingleton: S3Client | null = null;

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isObjectStorageConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  return readTruthSourceConfig(env).object_storage.configured;
}

export function getObjectStorageBucket(
  env: Record<string, string | undefined> = process.env,
) {
  const bucket = readTruthSourceConfig(env).object_storage.bucket;

  if (!bucket) {
    throw new Error("Object storage bucket is not configured");
  }

  return bucket;
}

export function getObjectStorageClient(
  env: Record<string, string | undefined> = process.env,
) {
  if (!isObjectStorageConfigured(env)) {
    throw new Error("Object storage is not configured");
  }

  if (objectStorageClientSingleton) {
    return objectStorageClientSingleton;
  }

  const endpoint =
    readTruthSourceConfig(env).object_storage.endpoint ??
    normalizeOptional(env.AWS_ENDPOINT_URL_S3);
  const accessKeyId =
    normalizeOptional(env.AWS_ACCESS_KEY_ID) ??
    normalizeOptional(env.S3_ACCESS_KEY_ID) ??
    normalizeOptional(env.MINIO_ROOT_USER);
  const secretAccessKey =
    normalizeOptional(env.AWS_SECRET_ACCESS_KEY) ??
    normalizeOptional(env.S3_SECRET_ACCESS_KEY) ??
    normalizeOptional(env.MINIO_ROOT_PASSWORD);

  const clientConfig: S3ClientConfig = {
    region: env.AWS_REGION ?? "us-east-1",
    forcePathStyle: Boolean(endpoint),
  };

  if (endpoint) {
    clientConfig.endpoint = endpoint;
  }

  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
    };
  }

  objectStorageClientSingleton = new S3Client(clientConfig);

  return objectStorageClientSingleton;
}

async function bodyToString(body: unknown) {
  if (!body) {
    return null;
  }

  if (typeof (body as { transformToString?: unknown }).transformToString === "function") {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }

  if (typeof (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];

    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString("utf8");
  }

  return null;
}

export async function getObjectStorageText(
  input: {
    object_key: string;
    bucket?: string;
  },
  env: Record<string, string | undefined> = process.env,
) {
  const client = getObjectStorageClient(env);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: input.bucket ?? getObjectStorageBucket(env),
      Key: input.object_key,
    }),
  );

  return bodyToString(response.Body);
}

export function disconnectObjectStorageClient() {
  if (!objectStorageClientSingleton) {
    return;
  }

  objectStorageClientSingleton.destroy();
  objectStorageClientSingleton = null;
}
