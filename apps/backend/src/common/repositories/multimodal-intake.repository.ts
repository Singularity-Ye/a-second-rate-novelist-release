import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type MultimodalArtifactRecord = AppState["multimodalArtifacts"][number];

export interface MultimodalIntakeRepository {
  createArtifact(
    input: Omit<MultimodalArtifactRecord, "id" | "created_at" | "updated_at"> & { created_at?: string },
  ): Promise<MultimodalArtifactRecord>;
  saveArtifact(artifact: MultimodalArtifactRecord): Promise<MultimodalArtifactRecord>;
  listArtifactsByChannelEvent(channel_event_id: string): Promise<MultimodalArtifactRecord[]>;
}

export function createMultimodalIntakeRepository(): MultimodalIntakeRepository {
  return {
    async createArtifact(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: MultimodalArtifactRecord = {
        id: randomUUID(),
        ...input,
        created_at: now,
        updated_at: now,
      };

      state.multimodalArtifacts.push(created);
      await writeAppState(state);
      return created;
    },
    async saveArtifact(artifact) {
      const state = await readAppState();
      const index = state.multimodalArtifacts.findIndex((item) => item.id === artifact.id);

      if (index >= 0) {
        state.multimodalArtifacts[index] = artifact;
      } else {
        state.multimodalArtifacts.push(artifact);
      }

      await writeAppState(state);
      return artifact;
    },
    async listArtifactsByChannelEvent(channel_event_id) {
      return (await readAppState()).multimodalArtifacts.filter((item) => item.channel_event_id === channel_event_id);
    },
  };
}
