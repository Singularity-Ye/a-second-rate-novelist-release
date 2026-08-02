import { randomUUID } from "node:crypto";
import type { ContextBundleResponse } from "@erliu/shared-contracts";
import { createChapterRuntimeRepository } from "../../common/repositories/chapter-runtime.repository.js";
import { createStoryKnowledgeRepository, type ContextBundleRecord } from "../../common/repositories/story-knowledge.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import { scheduleProjectionObjectStorageShadowUpload } from "../../common/truth-source/projection-object-storage-shadow-mirror.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";
import { getCanonView } from "../canon-service/canon-service.service.js";
import { buildSceneFirstContextPolicy } from "./context-composer.policy.js";

const COST_PER_REF = 40;

async function ensureStoryAccountId(story_id: string) {
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${story_id}`);
  }

  return workspace.account_id;
}

function toContextBundleResponse(bundle: ContextBundleRecord): ContextBundleResponse {
  return {
    bundle_id: bundle.id,
    task_type: bundle.task_type,
    status: bundle.status,
    composition_strategy: bundle.composition_strategy,
    included_refs: bundle.included_refs,
    excluded_refs: bundle.excluded_refs,
    token_budget: bundle.token_budget,
    scene_focus: bundle.scene_focus,
    promise_slice: bundle.promise_slice,
    continuity_policy: bundle.continuity_policy,
    ...(bundle.trim_summary ? { trim_summary: bundle.trim_summary } : {}),
  };
}

function readPromiseField(commissionBrief: Record<string, unknown>, key: string, fallback: string) {
  const value = commissionBrief[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

async function buildContextBundle(input: {
  story_id: string;
  task_type: "write" | "revise" | "compare_branch" | "summarize_asset";
  token_budget: number;
}): Promise<ContextBundleResponse> {
  const canonView = await getCanonView({
    story_id: input.story_id,
  });
  const repository = createStoryKnowledgeRepository();
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(input.story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${input.story_id}`);
  }

  const commissionBrief =
    workspace.commission_brief && typeof workspace.commission_brief === "object"
      ? (workspace.commission_brief as Record<string, unknown>)
      : {};
  const publicItems = canonView.items.filter((item) => item.reveal_level === "public_now");
  const guardedItems = canonView.items.filter((item) => item.reveal_level !== "public_now");
  const attachedAssets = await repository.listStoryAssetCandidates(input.story_id);
  const readyAssets = attachedAssets.filter(
    (item) => item.asset?.extract_status === "ready" && item.attachment.status === "active",
  );
  const revokedAssets = attachedAssets.filter(
    (item) => item.asset?.extract_status === "revoked" || item.attachment.status === "revoked",
  );
  const recentPatches = await repository.listCanonPatchesByStory(input.story_id);
  const openIssues = (await repository.listContinuityIssuesByStory(input.story_id)).filter(
    (item) => item.resolution_status === "open",
  );
  const latestChapter =
    (await createChapterRuntimeRepository().listChaptersByStory(input.story_id)).sort((left, right) => {
      if (right.chapter_no !== left.chapter_no) {
        return right.chapter_no - left.chapter_no;
      }

      return right.updated_at.localeCompare(left.updated_at);
    })[0] ?? null;
  const contextPolicy = buildSceneFirstContextPolicy({
    story_id: input.story_id,
    front_ten_chapter_promise: readPromiseField(
      commissionBrief,
      "front_ten_chapter_promise",
      "前十章先把试探、站队与旧债钉住。",
    ),
    relationship_promise: readPromiseField(
      commissionBrief,
      "relationship_promise",
      "每三章至少推进一次信任与风险站队。",
    ),
    latestChapter,
    continuityBrief: canonView.continuity_brief,
    publicItems,
    guardedItems,
    readyAssets,
    recentPatches,
    openIssues,
  });
  const candidates = contextPolicy.candidates;
  const allowedCount = Math.max(0, Math.floor(input.token_budget / COST_PER_REF));
  const includedItems = candidates.slice(0, allowedCount === 0 ? 0 : allowedCount);
  const trimmedItems = candidates.slice(includedItems.length);
  const excluded_refs = [
    ...guardedItems.map((item) => ({
      ref_type: "canon" as const,
      ref_id: item.item_id,
      title: item.title,
      reason_code: "CAN-102" as const,
    })),
    ...revokedAssets.map((item) => ({
      ref_type: "asset" as const,
      ref_id: item.asset?.id ?? item.attachment.asset_id,
      title: item.asset?.file_name ?? item.attachment.asset_id,
      reason_code: "AST-102" as const,
    })),
    ...trimmedItems.map((item) => ({
      ref_type: item.ref_type,
      ref_id: item.ref_id,
      title: item.title,
      reason_code: "CTX-101" as const,
    })),
  ];
  return {
    bundle_id: randomUUID(),
    task_type: input.task_type,
    status: trimmedItems.length > 0 ? "trimmed" : "ready",
    composition_strategy: contextPolicy.composition_strategy,
    included_refs: includedItems,
    excluded_refs,
    token_budget: input.token_budget,
    scene_focus: contextPolicy.scene_focus,
    promise_slice: contextPolicy.promise_slice,
    continuity_policy: contextPolicy.continuity_policy,
    ...(trimmedItems.length > 0
      ? {
          trim_summary: {
            reason_code: "CTX-101" as const,
            trimmed_count: trimmedItems.length,
          },
        }
      : {}),
  };
}

export async function composeContextBundle(input: {
  story_id: string;
  task_type: "write" | "revise" | "compare_branch" | "summarize_asset";
  token_budget: number;
}): Promise<ContextBundleResponse> {
  const repository = createStoryKnowledgeRepository();
  const now = new Date().toISOString();
  const bundle = await buildContextBundle(input);
  const stored = await repository.createContextBundle({
    story_id: input.story_id,
    task_type: input.task_type,
    status: bundle.status,
    composition_strategy: bundle.composition_strategy,
    included_refs: bundle.included_refs,
    excluded_refs: bundle.excluded_refs,
    token_budget: bundle.token_budget,
    scene_focus: bundle.scene_focus,
    promise_slice: bundle.promise_slice,
    continuity_policy: bundle.continuity_policy,
    trim_summary: bundle.trim_summary ?? null,
    created_at: now,
  });
  const account_id = await ensureStoryAccountId(input.story_id);

  scheduleProjectionObjectStorageShadowUpload({
    account_id,
    aggregate_key: "context_bundle",
    object_key: `projection-snapshots/stories/${input.story_id}/context-bundles/${stored.id}.json`,
    body: JSON.stringify({
      snapshot_type: "context_bundle",
      story_id: input.story_id,
      bundle_id: stored.id,
      task_type: stored.task_type,
      status: stored.status,
      composition_strategy: stored.composition_strategy,
      included_refs: stored.included_refs,
      excluded_refs: stored.excluded_refs,
      token_budget: stored.token_budget,
      scene_focus: stored.scene_focus,
      promise_slice: stored.promise_slice,
      continuity_policy: stored.continuity_policy,
      trim_summary: stored.trim_summary,
      created_at: stored.created_at,
    }),
    content_type: "application/json",
  });

  void recordDomainEvent({
    event_name: "context_bundle_composed",
    account_id,
    payload: {
      story_id: input.story_id,
      bundle_id: stored.id,
      status: stored.status,
    },
  });

  return toContextBundleResponse(stored);
}

export async function getLatestContextBundle(input: {
  story_id: string;
  task_type: "write" | "revise" | "compare_branch" | "summarize_asset";
  token_budget: number;
}): Promise<ContextBundleResponse> {
  const existing = await createStoryKnowledgeRepository().getLatestContextBundle(input);
  return existing ? toContextBundleResponse(existing) : buildContextBundle(input);
}
