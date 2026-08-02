export const VNEXT_MODEL_PROFILE_IDS = [
  "deepseek",
  "gpt",
  "gemini",
  "grok",
] as const;

export type VnextModelProfileId = (typeof VNEXT_MODEL_PROFILE_IDS)[number];

export const VNEXT_MODEL_PURPOSES = ["conversation", "analysis"] as const;

export type VnextModelPurpose = (typeof VNEXT_MODEL_PURPOSES)[number];

export type VnextModelProfileStatus =
  | "available"
  | "disabled"
  | "not_configured";

export interface VnextPublicModelProfile {
  readonly id: VnextModelProfileId;
  readonly label: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly purposes: readonly VnextModelPurpose[];
  readonly status: VnextModelProfileStatus;
  readonly streaming: true;
}

export interface VnextModelPreferenceView {
  readonly purpose: VnextModelPurpose;
  readonly profileId: VnextModelProfileId | null;
  readonly revision: number;
  readonly source: "default" | "stored" | "unavailable";
  readonly available: boolean;
}

export interface VnextModelProfileSettings {
  readonly catalogVersion: "v1";
  readonly profiles: readonly VnextPublicModelProfile[];
  readonly preferences: Readonly<
    Record<VnextModelPurpose, VnextModelPreferenceView>
  >;
}

export interface VnextSetModelPreferenceRequest {
  readonly profileId: VnextModelProfileId;
  readonly expectedRevision: number;
}

export function isVnextModelProfileId(
  value: unknown,
): value is VnextModelProfileId {
  return (
    typeof value === "string" &&
    (VNEXT_MODEL_PROFILE_IDS as readonly string[]).includes(value)
  );
}

export function isVnextModelPurpose(
  value: unknown,
): value is VnextModelPurpose {
  return (
    typeof value === "string" &&
    (VNEXT_MODEL_PURPOSES as readonly string[]).includes(value)
  );
}
