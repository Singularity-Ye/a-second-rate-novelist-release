import type {
  VnextModelProfileId,
  VnextModelPurpose,
} from "@erliu/shared-contracts";

export interface VnextModelPreferenceRecord {
  readonly ownerPrincipalId: string;
  readonly purpose: VnextModelPurpose;
  readonly profileId: VnextModelProfileId;
  readonly revision: number;
}

export interface SetVnextModelPreferenceRecord {
  readonly ownerPrincipalId: string;
  readonly purpose: VnextModelPurpose;
  readonly profileId: VnextModelProfileId;
  readonly expectedRevision: number;
}

export class VnextModelPreferenceConflictError extends Error {
  override readonly name = "VnextModelPreferenceConflictError";
}

export interface VnextModelPreferenceRepository {
  listOwned(ownerPrincipalId: string): Promise<readonly VnextModelPreferenceRecord[]>;
  setOwned(input: SetVnextModelPreferenceRecord): Promise<VnextModelPreferenceRecord>;
}

export const VNEXT_MODEL_PREFERENCE_REPOSITORY = Symbol(
  "VNEXT_MODEL_PREFERENCE_REPOSITORY",
);
