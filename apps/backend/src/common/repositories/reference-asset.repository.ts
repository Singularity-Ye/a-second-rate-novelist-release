import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type ReferenceAssetRecord = AppState["referenceAssets"][number];
export type AssetExtractResultRecord = AppState["assetExtractResults"][number];
export type AssetAttachmentRecord = AppState["assetAttachments"][number];

export interface ReferenceAssetRepository {
  createAsset(input: Omit<ReferenceAssetRecord, "id">): Promise<ReferenceAssetRecord>;
  findAssetById(asset_id: string): Promise<ReferenceAssetRecord | null>;
  listAssetsByAccount(account_id: string): Promise<ReferenceAssetRecord[]>;
  saveAsset(asset: ReferenceAssetRecord): Promise<ReferenceAssetRecord>;
  createExtractResults(input: Array<Omit<AssetExtractResultRecord, "id">>): Promise<AssetExtractResultRecord[]>;
  listExtractResultsByAsset(asset_id: string): Promise<AssetExtractResultRecord[]>;
  confirmExtractResults(input: {
    asset_id: string;
    accepted_extract_refs: string[];
    rejected_extract_refs: string[];
  }): Promise<AssetExtractResultRecord[]>;
  createAttachment(input: Omit<AssetAttachmentRecord, "id">): Promise<AssetAttachmentRecord>;
  listAttachmentsByAsset(asset_id: string): Promise<AssetAttachmentRecord[]>;
  revokeAttachmentsByAsset(asset_id: string): Promise<AssetAttachmentRecord[]>;
}

export function createReferenceAssetRepository(): ReferenceAssetRepository {
  return {
    async createAsset(input) {
      const state = await readAppState();
      const created: ReferenceAssetRecord = {
        id: randomUUID(),
        ...input,
      };

      state.referenceAssets.push(created);
      await writeAppState(state);
      return created;
    },
    async findAssetById(asset_id) {
      return (await readAppState()).referenceAssets.find((item) => item.id === asset_id) ?? null;
    },
    async listAssetsByAccount(account_id) {
      return (await readAppState()).referenceAssets.filter((item) => item.account_id === account_id);
    },
    async saveAsset(asset) {
      const state = await readAppState();
      const index = state.referenceAssets.findIndex((item) => item.id === asset.id);

      if (index >= 0) {
        state.referenceAssets[index] = asset;
      } else {
        state.referenceAssets.push(asset);
      }

      await writeAppState(state);
      return asset;
    },
    async createExtractResults(input) {
      const state = await readAppState();
      const created = input.map<AssetExtractResultRecord>((item) => ({
        id: randomUUID(),
        ...item,
      }));

      state.assetExtractResults.push(...created);
      await writeAppState(state);
      return created;
    },
    async listExtractResultsByAsset(asset_id) {
      return (await readAppState()).assetExtractResults.filter((item) => item.asset_id === asset_id);
    },
    async confirmExtractResults(input) {
      const state = await readAppState();
      const updated = state.assetExtractResults.filter((item) => item.asset_id === input.asset_id);

      updated.forEach((item) => {
        if (input.accepted_extract_refs.includes(item.id)) {
          item.status = "accepted";
        } else if (input.rejected_extract_refs.includes(item.id)) {
          item.status = "rejected";
        }
      });

      await writeAppState(state);
      return updated;
    },
    async createAttachment(input) {
      const state = await readAppState();
      const created: AssetAttachmentRecord = {
        id: randomUUID(),
        ...input,
      };

      state.assetAttachments.push(created);
      await writeAppState(state);
      return created;
    },
    async listAttachmentsByAsset(asset_id) {
      return (await readAppState()).assetAttachments.filter((item) => item.asset_id === asset_id);
    },
    async revokeAttachmentsByAsset(asset_id) {
      const state = await readAppState();
      const updated = state.assetAttachments.filter((item) => item.asset_id === asset_id);

      updated.forEach((item) => {
        item.status = "revoked";
      });

      await writeAppState(state);
      return updated;
    },
  };
}
