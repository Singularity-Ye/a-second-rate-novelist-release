import { createHmac } from "node:crypto";
import type { AppState } from "../../../apps/backend/src/common/store.js";

function signToken(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function applyFailureInjection(input: {
  scenario: "expired_deeplink";
  state: AppState;
  secret?: string;
}): {
  scenario: "expired_deeplink";
  expired_token: string;
};
export function applyFailureInjection(input: {
  scenario: "stale_intent_patch";
  state: AppState;
}): {
  scenario: "stale_intent_patch";
  intent_id: string;
  current_version_no: number;
  stale_version_no: number;
};
export function applyFailureInjection(input: {
  scenario: "expired_deeplink" | "stale_intent_patch";
  state: AppState;
  secret?: string;
}) {
  if (input.scenario === "expired_deeplink") {
    const account = input.state.accounts.find((item) => item.account_token === "seed_reader_edge");

    if (!account) {
      throw new Error("seed_reader_edge missing from seed state");
    }

    const payload = Buffer.from(
      JSON.stringify({
        account_id: account.account_id,
        account_token: account.account_token,
        target_route: "/room",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      "utf8",
    ).toString("base64url");
    const signature = signToken(payload, input.secret ?? "m1-local-secret");

    return {
      scenario: "expired_deeplink" as const,
      expired_token: `${payload}.${signature}`,
    };
  }

  const intent = input.state.messageIntents.find((item) => item.id === "intent_gamma_wrong_archive");

  if (!intent) {
    throw new Error("intent_gamma_wrong_archive missing from seed state");
  }

  return {
    scenario: "stale_intent_patch" as const,
    intent_id: intent.id,
    current_version_no: intent.version_no,
    stale_version_no: intent.version_no - 1,
  };
}
