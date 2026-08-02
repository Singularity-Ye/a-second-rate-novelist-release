import { createHash, createHmac, randomBytes } from "node:crypto";

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOCAL_COOKIE_NAME = "erliu_vnext_session";
const SECURE_COOKIE_NAME = "__Host-erliu_vnext_session";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashBootstrapRecoverySecret(secret: string) {
  return createHash("sha256")
    .update("vnext-bootstrap-recovery:v1\0", "utf8")
    .update(secret, "utf8")
    .digest("hex");
}

export type ParsedSessionCookie =
  | { status: "missing" | "invalid" }
  | { status: "valid"; token: string };

export class SessionCookieService {
  issue() {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: hashSessionToken(token) };
  }

  issueForClientRequest(
    clientRequestId: string,
    bootstrapRecoverySecret: string,
    tokenSecret: string,
  ) {
    if (!tokenSecret) {
      throw new Error("session token derivation secret is required");
    }
    const token = createHmac("sha256", tokenSecret)
      .update("vnext-guest-session:v1\0", "utf8")
      .update(clientRequestId, "utf8")
      .update("\0", "utf8")
      .update(bootstrapRecoverySecret, "utf8")
      .digest("base64url");
    return { token, tokenHash: hashSessionToken(token) };
  }

  parse(cookieHeader: string | undefined, secure: boolean): ParsedSessionCookie {
    if (!cookieHeader) {
      return { status: "missing" };
    }
    const cookieName = secure ? SECURE_COOKIE_NAME : LOCAL_COOKIE_NAME;
    const matches = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookieName}=`));
    if (matches.length === 0) {
      return { status: "missing" };
    }
    if (matches.length !== 1) {
      return { status: "invalid" };
    }
    const token = matches[0]!.slice(cookieName.length + 1);
    return SESSION_TOKEN_PATTERN.test(token)
      ? { status: "valid", token }
      : { status: "invalid" };
  }

  serialize(token: string, expiresAt: Date, secure: boolean, now = new Date()) {
    if (!SESSION_TOKEN_PATTERN.test(token)) {
      throw new Error("session token must be a 256-bit base64url value");
    }
    if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(now.getTime())) {
      throw new Error("session cookie dates must be valid");
    }
    const cookieName = secure ? SECURE_COOKIE_NAME : LOCAL_COOKIE_NAME;
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1_000));
    const attributes = [
      `${cookieName}=${token}`,
      "Path=/",
      `Max-Age=${maxAge}`,
      `Expires=${expiresAt.toUTCString()}`,
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (secure) {
      attributes.push("Secure");
    }
    return attributes.join("; ");
  }

  serializeClear(secure: boolean) {
    const cookieName = secure ? SECURE_COOKIE_NAME : LOCAL_COOKIE_NAME;
    const attributes = [
      `${cookieName}=`,
      "Path=/",
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (secure) {
      attributes.push("Secure");
    }
    return attributes.join("; ");
  }
}
