import { randomUUID } from "node:crypto";
import { readAppState, writeAppState, type AppState } from "../store.js";

export type CanonItemRecord = AppState["canonItems"][number];
export type CanonPatchRecord = AppState["canonPatches"][number];
export type ContinuityIssueRecord = AppState["continuityIssues"][number];
export type ContextBundleRecord = AppState["contextBundles"][number];

export interface StoryKnowledgeRepository {
  seedCanonItems(input: {
    story_id: string;
    items: Array<{
      item_type: CanonItemRecord["item_type"];
      title: string;
      attributes: CanonItemRecord["attributes"];
      reveal_level: CanonItemRecord["reveal_level"];
      source_refs: CanonItemRecord["source_refs"];
      continuity_status: CanonItemRecord["continuity_status"];
    }>;
    created_at?: string;
  }): Promise<CanonItemRecord[]>;
  listCanonItemsByStory(story_id: string): Promise<CanonItemRecord[]>;
  findCanonItemByStoryAndId(story_id: string, item_id: string): Promise<CanonItemRecord | null>;
  saveCanonItem(item: CanonItemRecord): Promise<CanonItemRecord>;
  createCanonPatch(input: {
    story_id: string;
    target_item_id: string;
    patch_document: CanonPatchRecord["patch_document"];
    reason: string;
    status: CanonPatchRecord["status"];
    source_type: CanonPatchRecord["source_type"];
    client_request_id: string;
    created_at?: string;
  }): Promise<CanonPatchRecord>;
  listCanonPatchesByStory(story_id: string, limit?: number): Promise<CanonPatchRecord[]>;
  createContinuityIssue(input: {
    story_id: string;
    issue_type: ContinuityIssueRecord["issue_type"];
    severity: ContinuityIssueRecord["severity"];
    summary: string;
    object_refs: ContinuityIssueRecord["object_refs"];
    resolution_status: ContinuityIssueRecord["resolution_status"];
    created_at?: string;
  }): Promise<ContinuityIssueRecord>;
  listContinuityIssuesByStory(story_id: string): Promise<ContinuityIssueRecord[]>;
  saveContinuityIssue(issue: ContinuityIssueRecord): Promise<ContinuityIssueRecord>;
  listStoryAssetCandidates(story_id: string): Promise<Array<{
    attachment: AppState["assetAttachments"][number];
    asset: AppState["referenceAssets"][number] | null;
  }>>;
  createContextBundle(input: {
    story_id: string;
    task_type: ContextBundleRecord["task_type"];
    status: ContextBundleRecord["status"];
    composition_strategy: ContextBundleRecord["composition_strategy"];
    included_refs: ContextBundleRecord["included_refs"];
    excluded_refs: ContextBundleRecord["excluded_refs"];
    token_budget: number;
    scene_focus: ContextBundleRecord["scene_focus"];
    promise_slice: ContextBundleRecord["promise_slice"];
    continuity_policy: ContextBundleRecord["continuity_policy"];
    trim_summary: ContextBundleRecord["trim_summary"];
    created_at?: string;
  }): Promise<ContextBundleRecord>;
  getLatestContextBundle(input: {
    story_id: string;
    task_type: ContextBundleRecord["task_type"];
    token_budget: number;
  }): Promise<ContextBundleRecord | null>;
}

export function createStoryKnowledgeRepository(): StoryKnowledgeRepository {
  return {
    async seedCanonItems(input) {
      const existing = (await readAppState()).canonItems.filter((item) => item.story_id === input.story_id);

      if (existing.length > 0) {
        return existing;
      }

      const state = await readAppState();
      const now = input.created_at ?? new Date().toISOString();
      const created = input.items.map<CanonItemRecord>((item) => ({
        id: randomUUID(),
        story_id: input.story_id,
        item_type: item.item_type,
        title: item.title,
        attributes: item.attributes,
        reveal_level: item.reveal_level,
        source_refs: item.source_refs,
        continuity_status: item.continuity_status,
        version_no: 1,
        created_at: now,
        updated_at: now,
      }));

      state.canonItems.push(...created);
      await writeAppState(state);
      return created;
    },
    async listCanonItemsByStory(story_id) {
      return (await readAppState()).canonItems.filter((item) => item.story_id === story_id);
    },
    async findCanonItemByStoryAndId(story_id, item_id) {
      return (await readAppState()).canonItems.find((item) => item.story_id === story_id && item.id === item_id) ?? null;
    },
    async saveCanonItem(item) {
      const state = await readAppState();
      const index = state.canonItems.findIndex((entry) => entry.id === item.id);

      if (index >= 0) {
        state.canonItems[index] = item;
      } else {
        state.canonItems.push(item);
      }

      await writeAppState(state);
      return item;
    },
    async createCanonPatch(input) {
      const state = await readAppState();
      const created: CanonPatchRecord = {
        id: randomUUID(),
        story_id: input.story_id,
        target_item_id: input.target_item_id,
        patch_document: input.patch_document,
        reason: input.reason,
        status: input.status,
        source_type: input.source_type,
        client_request_id: input.client_request_id,
        created_at: input.created_at ?? new Date().toISOString(),
      };

      state.canonPatches.push(created);
      await writeAppState(state);
      return created;
    },
    async listCanonPatchesByStory(story_id, limit = 5) {
      return (await readAppState())
        .canonPatches.filter((item) => item.story_id === story_id)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, limit);
    },
    async createContinuityIssue(input) {
      const state = await readAppState();
      const created: ContinuityIssueRecord = {
        id: randomUUID(),
        story_id: input.story_id,
        issue_type: input.issue_type,
        severity: input.severity,
        summary: input.summary,
        object_refs: input.object_refs,
        resolution_status: input.resolution_status,
        created_at: input.created_at ?? new Date().toISOString(),
      };

      state.continuityIssues.push(created);
      await writeAppState(state);
      return created;
    },
    async listContinuityIssuesByStory(story_id) {
      return (await readAppState()).continuityIssues.filter((item) => item.story_id === story_id);
    },
    async saveContinuityIssue(issue) {
      const state = await readAppState();
      const index = state.continuityIssues.findIndex((entry) => entry.id === issue.id);

      if (index >= 0) {
        state.continuityIssues[index] = issue;
      } else {
        state.continuityIssues.push(issue);
      }

      await writeAppState(state);
      return issue;
    },
    async listStoryAssetCandidates(story_id) {
      const state = await readAppState();

      return state.assetAttachments
        .filter((item) => item.target_type === "story" && item.target_id === story_id)
        .map((attachment) => ({
          attachment,
          asset: state.referenceAssets.find((asset) => asset.id === attachment.asset_id) ?? null,
        }));
    },
    async createContextBundle(input) {
      const state = await readAppState();
      const created: ContextBundleRecord = {
        id: randomUUID(),
        story_id: input.story_id,
        task_type: input.task_type,
        status: input.status,
        composition_strategy: input.composition_strategy,
        included_refs: input.included_refs,
        excluded_refs: input.excluded_refs,
        token_budget: input.token_budget,
        scene_focus: input.scene_focus,
        promise_slice: input.promise_slice,
        continuity_policy: input.continuity_policy,
        trim_summary: input.trim_summary,
        created_at: input.created_at ?? new Date().toISOString(),
      };

      state.contextBundles.push(created);
      await writeAppState(state);
      return created;
    },
    async getLatestContextBundle(input) {
      return (
        (await readAppState())
          .contextBundles.filter((item) => item.story_id === input.story_id)
          .filter((item) => item.task_type === input.task_type)
          .filter((item) => item.token_budget === input.token_budget)
          .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null
      );
    },
  };
}
