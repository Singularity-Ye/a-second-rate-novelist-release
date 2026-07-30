import type {
  BetaAccessChannelBindResponse,
  BetaAccessStatusResponse,
  BetaInviteRedeemErrorCode,
  BetaInviteRedeemErrorResponse,
  BetaInviteRedeemResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export class BetaAccessApiError extends Error {
  readonly status: number;
  readonly errorCode: BetaInviteRedeemErrorCode | undefined;

  constructor(input: {
    message: string;
    status: number;
    errorCode: BetaInviteRedeemErrorCode | undefined;
  }) {
    super(input.message);
    this.name = "BetaAccessApiError";
    this.status = input.status;
    this.errorCode = input.errorCode;
  }
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const payload = await readJson(response);

  if (!response.ok) {
    const typedError = toRedeemBusinessError(payload);
    throw new BetaAccessApiError({
      message: typedError?.message ?? `Beta access API failed: ${response.status}`,
      status: response.status,
      errorCode: typedError?.error_code,
    });
  }

  return (payload as { data: T }).data;
}

export async function fetchBetaAccessStatus(input: {
  account_token?: string;
  invite_code?: string;
}): Promise<BetaAccessStatusResponse> {
  const params = new URLSearchParams();
  if (input.account_token) {
    params.set("account_token", input.account_token);
  }
  if (input.invite_code) {
    params.set("invite_code", input.invite_code);
  }

  const response = await fetch(`${apiBaseUrl()}/beta/access?${params.toString()}`, {
    cache: "no-store",
  });
  return readEnvelope(response);
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toRedeemBusinessError(payload: unknown): BetaInviteRedeemErrorResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<BetaInviteRedeemErrorResponse>;
  if (typeof candidate.error_code !== "string" || typeof candidate.message !== "string") {
    return null;
  }

  return candidate as BetaInviteRedeemErrorResponse;
}

export async function redeemBetaInvite(input: {
  invite_code: string;
  entry_channel: "h5" | "wechat" | "feishu";
}): Promise<BetaInviteRedeemResponse> {
  const response = await fetch(`${apiBaseUrl()}/beta/invites/redeem`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      accepted_policy_version: "beta-policy-v1",
      client_request_id: `h5-beta-redeem-${Date.now()}`,
    }),
  });
  return readEnvelope(response);
}

export async function registerBetaAccessChannel(input: {
  account_token: string;
  channel: "h5" | "wechat" | "feishu";
  provider_user_id: string;
  set_as_primary: boolean;
}): Promise<BetaAccessChannelBindResponse> {
  const response = await fetch(`${apiBaseUrl()}/beta/access/channel-bindings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return readEnvelope(response);
}
