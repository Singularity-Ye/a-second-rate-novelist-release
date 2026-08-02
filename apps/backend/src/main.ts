import "reflect-metadata";
import {
  VNEXT_CONTINUOUS_USE_EMITTED_AT_HEADER,
  VNEXT_CONTINUOUS_USE_NEXT_AT_HEADER,
  VNEXT_CONTINUOUS_USE_RECEIPT_ID_HEADER,
  VNEXT_CONTINUOUS_USE_RECEIPT_VERSION_HEADER,
  VNEXT_CONTINUOUS_USE_REMINDER_HEADER,
} from "@erliu/shared-contracts/vnext-experience";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage } from "node:http";
import { AppModule } from "./app.module.js";

export const VNEXT_CORS_EXPOSED_HEADERS = Object.freeze([
  VNEXT_CONTINUOUS_USE_REMINDER_HEADER,
  VNEXT_CONTINUOUS_USE_NEXT_AT_HEADER,
  VNEXT_CONTINUOUS_USE_RECEIPT_ID_HEADER,
  VNEXT_CONTINUOUS_USE_RECEIPT_VERSION_HEADER,
  VNEXT_CONTINUOUS_USE_EMITTED_AT_HEADER,
]);

export const BACKEND_REQUEST_BODY_LIMIT_BYTES = 256_000;

// World Lab image edits still use a bounded data-URL bridge during internal
// development. Parse that larger envelope only on the two guarded image POST
// routes; every other JSON endpoint keeps the ordinary ingress budget above.
export const WORLD_LAB_IMAGE_REQUEST_BODY_LIMIT_BYTES = 32_000_000;
export const WORLD_LAB_IMAGE_JSON_PATHS = Object.freeze([
  "/vnext/world-lab/images/generate",
  "/vnext/world-lab/images/jobs",
] as const);

export function isWorldLabImageJsonRequest(request: IncomingMessage) {
  if (request.method?.toUpperCase() !== "POST") return false;
  const path = request.url?.split("?", 1)[0] ?? "";
  return (WORLD_LAB_IMAGE_JSON_PATHS as readonly string[]).includes(path);
}

export function resolveListenHost(env: Record<string, string | undefined> = process.env) {
  return env.HOST?.trim() || "127.0.0.1";
}

function normalizeOrigin(origin?: string) {
  const trimmed = origin?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export function resolveCorsOrigins(env: Record<string, string | undefined> = process.env) {
  const defaults = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
  ];
  const configured = [
    env.H5_BASE_URL,
    env.OPS_BASE_URL,
    ...(env.ALLOWED_ORIGINS?.split(",") ?? []),
    ...(env.VNEXT_ALLOWED_ORIGINS?.split(",") ?? []),
  ]
    .map((item) => normalizeOrigin(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set([...defaults, ...configured]));
}

export function resolveTrustedProxyHops(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env.VNEXT_TRUST_PROXY_HOPS?.trim();
  if (!raw) {
    return 0;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value === 1 ? value : 0;
}

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"],
  });

  app.useBodyParser("json", {
    limit: WORLD_LAB_IMAGE_REQUEST_BODY_LIMIT_BYTES,
    type: isWorldLabImageJsonRequest,
  });
  app.useBodyParser("json", { limit: BACKEND_REQUEST_BODY_LIMIT_BYTES });
  app.useBodyParser("urlencoded", { extended: true, limit: BACKEND_REQUEST_BODY_LIMIT_BYTES });

  const trustedProxyHops = resolveTrustedProxyHops();
  if (trustedProxyHops > 0) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustedProxyHops);
  }

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: [...VNEXT_CORS_EXPOSED_HEADERS],
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000, resolveListenHost());

  return app;
}

if (process.env.NODE_ENV !== "test") {
  void bootstrap();
}
