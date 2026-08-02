import {
  type VnextModelPreferenceView,
  type VnextModelProfileId,
  type VnextModelProfileSettings,
  type VnextModelPurpose,
} from "@erliu/shared-contracts";
import {
  VnextModelPreferenceConflictError,
  type VnextModelPreferenceRecord,
  type VnextModelPreferenceRepository,
} from "../domain/model-preference.repository.js";
import {
  findConfiguredModelProfile,
  publicModelProfile,
  type ConfiguredModelProfile,
  type ConfiguredModelProfileCatalog,
} from "../infrastructure/configured-model-profile-catalog.js";

export class ModelProfileSelectionError extends Error {
  override readonly name = "ModelProfileSelectionError";

  constructor(
    readonly code:
      | "invalid_model_profile"
      | "model_profile_unavailable"
      | "model_preference_conflict"
      | "provider_unconfigured",
    readonly status: number,
  ) {
    super(code);
  }
}

export interface ResolvedModelProfile {
  readonly purpose: VnextModelPurpose;
  readonly profile: ConfiguredModelProfile;
  readonly revision: number;
  readonly source: "default" | "stored";
}

function storedForPurpose(
  records: readonly VnextModelPreferenceRecord[],
  purpose: VnextModelPurpose,
) {
  return records.find((record) => record.purpose === purpose) ?? null;
}

export class ModelProfileSelectionService {
  constructor(
    private readonly repository: VnextModelPreferenceRepository,
    private readonly catalog: ConfiguredModelProfileCatalog,
  ) {}

  private preferenceView(
    records: readonly VnextModelPreferenceRecord[],
    purpose: VnextModelPurpose,
  ): VnextModelPreferenceView {
    const stored = storedForPurpose(records, purpose);
    if (stored !== null) {
      return {
        purpose,
        profileId: stored.profileId,
        revision: stored.revision,
        source: "stored",
        available:
          findConfiguredModelProfile(
            this.catalog,
            stored.profileId,
            purpose,
          ) !== null,
      };
    }
    const profileId = this.catalog.defaults[purpose];
    return {
      purpose,
      profileId,
      revision: 0,
      source: profileId === null ? "unavailable" : "default",
      available: profileId !== null,
    };
  }

  async readSettings(ownerPrincipalId: string): Promise<VnextModelProfileSettings> {
    const records = await this.repository.listOwned(ownerPrincipalId);
    return {
      catalogVersion: "v1",
      profiles: this.catalog.profiles.map(publicModelProfile),
      preferences: {
        conversation: this.preferenceView(records, "conversation"),
        analysis: this.preferenceView(records, "analysis"),
      },
    };
  }

  async resolve(
    ownerPrincipalId: string,
    purpose: VnextModelPurpose,
  ): Promise<ResolvedModelProfile> {
    const records = await this.repository.listOwned(ownerPrincipalId);
    const stored = storedForPurpose(records, purpose);
    const profileId = stored?.profileId ?? this.catalog.defaults[purpose];
    if (profileId === null) {
      throw new ModelProfileSelectionError("provider_unconfigured", 503);
    }
    const profile = findConfiguredModelProfile(this.catalog, profileId, purpose);
    if (profile === null) {
      throw new ModelProfileSelectionError("model_profile_unavailable", 409);
    }
    return {
      purpose,
      profile,
      revision: stored?.revision ?? 0,
      source: stored === null ? "default" : "stored",
    };
  }

  async setPreference(input: {
    readonly ownerPrincipalId: string;
    readonly purpose: VnextModelPurpose;
    readonly profileId: VnextModelProfileId;
    readonly expectedRevision: number;
  }) {
    if (
      findConfiguredModelProfile(
        this.catalog,
        input.profileId,
        input.purpose,
      ) === null
    ) {
      throw new ModelProfileSelectionError("invalid_model_profile", 400);
    }
    try {
      await this.repository.setOwned(input);
    } catch (error) {
      if (error instanceof VnextModelPreferenceConflictError) {
        throw new ModelProfileSelectionError("model_preference_conflict", 409);
      }
      throw error;
    }
    return this.readSettings(input.ownerPrincipalId);
  }
}
