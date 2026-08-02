import {
  VNEXT_MODEL_PROFILE_IDS,
  VNEXT_MODEL_PURPOSES,
  isVnextModelProfileId,
  isVnextModelPurpose,
  type VnextModelPreferenceView,
  type VnextModelProfileId,
  type VnextModelProfileSettings,
  type VnextModelPurpose,
  type VnextPublicModelProfile,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "../../lib/runtime-api-base";

export class ModelProfileRequestError extends Error {
  override readonly name = "ModelProfileRequestError";

  constructor(readonly code: string) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalIdentity(value: unknown): string | null | undefined {
  return value === null ||
    (typeof value === "string" && value.trim().length > 0)
    ? value
    : undefined;
}

function profile(value: unknown): VnextPublicModelProfile {
  if (!isRecord(value) || !isVnextModelProfileId(value.id)) {
    throw new ModelProfileRequestError("invalid_runtime_output");
  }
  const provider = optionalIdentity(value.provider);
  const model = optionalIdentity(value.model);
  const status = value.status;
  if (
    typeof value.label !== "string" ||
    !value.label.trim() ||
    provider === undefined ||
    model === undefined ||
    !Array.isArray(value.purposes) ||
    value.purposes.some((purpose) => !isVnextModelPurpose(purpose)) ||
    (status !== "available" &&
      status !== "disabled" &&
      status !== "not_configured") ||
    (provider === null) !== (model === null) ||
    (status === "available" && (provider === null || model === null)) ||
    (status === "not_configured" && (provider !== null || model !== null)) ||
    value.streaming !== true
  ) {
    throw new ModelProfileRequestError("invalid_runtime_output");
  }
  return {
    id: value.id,
    label: value.label,
    provider,
    model,
    purposes: [...new Set(value.purposes as VnextModelPurpose[])],
    status,
    streaming: true,
  };
}

function preference(
  value: unknown,
  expectedPurpose: VnextModelPurpose,
): VnextModelPreferenceView {
  if (
    !isRecord(value) ||
    value.purpose !== expectedPurpose ||
    (value.profileId !== null && !isVnextModelProfileId(value.profileId)) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    (value.source !== "default" &&
      value.source !== "stored" &&
      value.source !== "unavailable") ||
    typeof value.available !== "boolean"
  ) {
    throw new ModelProfileRequestError("invalid_runtime_output");
  }
  return {
    purpose: expectedPurpose,
    profileId: value.profileId,
    revision: value.revision,
    source: value.source,
    available: value.available,
  };
}

function settings(value: unknown): VnextModelProfileSettings {
  if (
    !isRecord(value) ||
    value.catalogVersion !== "v1" ||
    !Array.isArray(value.profiles) ||
    !isRecord(value.preferences)
  ) {
    throw new ModelProfileRequestError("invalid_runtime_output");
  }
  const preferencePayload = value.preferences;
  const profiles = value.profiles.map(profile);
  const ids = new Set(profiles.map((item) => item.id));
  if (
    profiles.length !== VNEXT_MODEL_PROFILE_IDS.length ||
    VNEXT_MODEL_PROFILE_IDS.some((id) => !ids.has(id)) ||
    VNEXT_MODEL_PURPOSES.some(
      (purpose) => !(purpose in preferencePayload),
    )
  ) {
    throw new ModelProfileRequestError("invalid_runtime_output");
  }
  const preferences = {
    conversation: preference(
      preferencePayload.conversation,
      "conversation",
    ),
    analysis: preference(preferencePayload.analysis, "analysis"),
  } as const;
  for (const purpose of VNEXT_MODEL_PURPOSES) {
    const selected = preferences[purpose];
    const selectedProfile = profiles.find(
      (candidate) => candidate.id === selected.profileId,
    );
    const selectionIsAvailable =
      selectedProfile?.status === "available" &&
      selectedProfile.purposes.includes(purpose);
    if (
      (selected.source === "unavailable" &&
        (selected.profileId !== null || selected.revision !== 0 || selected.available)) ||
      (selected.source === "default" &&
        (selected.profileId === null || selected.revision !== 0 || !selected.available)) ||
      (selected.source === "stored" &&
        (selected.profileId === null || selected.revision < 1)) ||
      selected.available !== selectionIsAvailable
    ) {
      throw new ModelProfileRequestError("invalid_runtime_output");
    }
  }
  return {
    catalogVersion: "v1",
    profiles,
    preferences,
  };
}

async function responsePayload(response: Response) {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Stable error below.
  }
  if (!response.ok) {
    throw new ModelProfileRequestError(
      isRecord(payload) && typeof payload.code === "string"
        ? payload.code
        : "provider_unavailable",
    );
  }
  return settings(payload);
}

export async function readModelProfileSettings(signal?: AbortSignal) {
  const response = await fetch(`${resolveH5ApiBaseUrl()}/vnext/model-profiles`, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });
  return responsePayload(response);
}

export async function setModelPreference(input: {
  readonly purpose: VnextModelPurpose;
  readonly profileId: VnextModelProfileId;
  readonly expectedRevision: number;
}) {
  const response = await fetch(
    `${resolveH5ApiBaseUrl()}/vnext/model-profiles/preferences/${input.purpose}`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        profileId: input.profileId,
        expectedRevision: input.expectedRevision,
      }),
    },
  );
  return responsePayload(response);
}
