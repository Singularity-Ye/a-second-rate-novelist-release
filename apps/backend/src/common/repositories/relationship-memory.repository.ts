import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type RelationshipMemoryRecord = AppState["relationshipContextMemories"][number];

export interface RelationshipMemoryRepository {
  createMemory(input: {
    account_id: string;
    story_workspace_id: string | null;
    message_id: string;
    memory_type: RelationshipMemoryRecord["memory_type"];
    summary_text: string;
    expires_at: string;
    visibility_scope: RelationshipMemoryRecord["visibility_scope"];
    created_at?: string;
  }): Promise<RelationshipMemoryRecord>;
  findMemoryByMessageId(message_id: string): Promise<RelationshipMemoryRecord | null>;
  listActiveMemoriesByAccount(
    account_id: string,
    options?: {
      now?: string;
      story_workspace_id?: string | null;
      limit?: number;
    },
  ): Promise<RelationshipMemoryRecord[]>;
}

export function createRelationshipMemoryRepository(): RelationshipMemoryRepository {
  return {
    async createMemory(input) {
      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created: RelationshipMemoryRecord = {
        id: randomUUID(),
        account_id: input.account_id,
        story_workspace_id: input.story_workspace_id,
        message_id: input.message_id,
        memory_type: input.memory_type,
        summary_text: input.summary_text,
        expires_at: input.expires_at,
        visibility_scope: input.visibility_scope,
        created_at: now,
        updated_at: now,
      };

      state.relationshipContextMemories.push(created);
      await writeAppState(state);
      return created;
    },
    async findMemoryByMessageId(message_id) {
      return (await readAppState()).relationshipContextMemories.find((item) => item.message_id === message_id) ?? null;
    },
    async listActiveMemoriesByAccount(account_id, options) {
      const now = options?.now ?? new Date().toISOString();

      return (await readAppState())
        .relationshipContextMemories.filter((item) => {
          if (item.account_id !== account_id) {
            return false;
          }

          if (options?.story_workspace_id !== undefined && item.story_workspace_id !== options.story_workspace_id) {
            return false;
          }

          return item.expires_at > now;
        })
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, options?.limit ?? 20);
    },
  };
}
