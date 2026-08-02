import type { OnboardingStepKey, ReaderProfileView } from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchReaderProfile(account_token: string): Promise<ReaderProfileView> {
  const response = await fetch(
    `${apiBaseUrl()}/profile?account_token=${encodeURIComponent(account_token)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch profile");
  }

  const payload = (await response.json()) as { data: ReaderProfileView };
  return payload.data;
}

export async function submitOnboardingStep(input: {
  account_token: string;
  step_key?: OnboardingStepKey;
  answer_text: string;
}) {
  const response = await fetch(`${apiBaseUrl()}/internal/onboarding/steps`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to submit onboarding step");
  }

  const payload = (await response.json()) as {
    data: {
      ack_copy: string;
      profile: ReaderProfileView;
    };
  };

  return payload.data;
}

export async function confirmProfile(account_token: string): Promise<ReaderProfileView> {
  const response = await fetch(`${apiBaseUrl()}/profile`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token,
      confirm_profile: true,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to confirm profile");
  }

  const payload = (await response.json()) as { data: ReaderProfileView };
  return payload.data;
}
