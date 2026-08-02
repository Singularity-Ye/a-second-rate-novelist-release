import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  DeepLinkExchangeResponse,
  DeepLinkIssueResponse,
  DeepLinkTargetRoute,
} from "@erliu/shared-contracts";
import { createAccountRepository } from "../../common/repositories/account.repository.js";

const DEFAULT_DEEP_LINK_TTL_MINUTES = 30;

function getSecret() {
  return process.env.SESSION_SIGNING_SECRET ?? "m1-local-secret";
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signToken(encodedPayload: string) {
  return createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

function createDeepLinkToken(payload: DeepLinkExchangeResponse) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signToken(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function buildDeepLinkPayload(input: {
  account_id: string;
  account_token: string;
  target_route: DeepLinkTargetRoute;
}): DeepLinkExchangeResponse {
  return {
    account_id: input.account_id,
    account_token: input.account_token,
    target_route: input.target_route,
    expires_at: new Date(Date.now() + DEFAULT_DEEP_LINK_TTL_MINUTES * 60_000).toISOString(),
  };
}

export async function upsertShadowAccount({
  account_token,
  channel,
  target_route = "/chat",
}: {
  account_token: string;
  channel: string;
  target_route?: DeepLinkTargetRoute;
}) {
  const repository = createAccountRepository();
  const account = await repository.upsertShadowAccount({
    account_token,
    channel,
  });

  const deep_link_token = createDeepLinkToken(
    buildDeepLinkPayload({
      account_id: account.account_id,
      account_token: account.account_token,
      target_route,
    }),
  );
  return {
    ...account,
    deep_link_token,
  };
}

export async function issueDeepLinkToken(input: {
  account_token: string;
  target_route: DeepLinkTargetRoute;
}): Promise<DeepLinkIssueResponse> {
  const repository = createAccountRepository();
  const account =
    (await repository.findAccountByToken(input.account_token)) ??
    (await repository.upsertShadowAccount({
      account_token: input.account_token,
      channel: "h5",
    }));
  const payload = buildDeepLinkPayload({
    account_id: account.account_id,
    account_token: account.account_token,
    target_route: input.target_route,
  });

  return {
    token: createDeepLinkToken(payload),
    target_route: payload.target_route,
    expires_at: payload.expires_at,
  };
}

export function ensureSession(account_id: string) {
  return createAccountRepository().ensureSession({ account_id });
}

export async function exchangeDeepLinkToken(token: string): Promise<DeepLinkExchangeResponse> {
  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    throw new Error("NET-003 invalid session token");
  }

  const expectedSignature = signToken(encodedPayload);

  if (
    !timingSafeEqual(
      Buffer.from(providedSignature, "utf8"),
      Buffer.from(expectedSignature, "utf8"),
    )
  ) {
    throw new Error("NET-003 invalid session token");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as DeepLinkExchangeResponse;

  if (Date.parse(payload.expires_at) <= Date.now()) {
    throw new Error("NET-003 session token expired");
  }

  await ensureSession(payload.account_id);

  return payload;
}
