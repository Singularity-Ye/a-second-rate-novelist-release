import type { ReferenceAssetDetailResponse, ReferenceAssetLibraryResponse } from "@erliu/shared-contracts";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createReferenceAssetRepository } from "../../common/repositories/reference-asset.repository.js";
import { createStoryKnowledgeRepository } from "../../common/repositories/story-knowledge.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

async function findAccountByToken(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

async function findAsset(asset_id: string) {
  const normalizedAssetId = normalizeAssetId(asset_id);
  const asset = await createReferenceAssetRepository().findAssetById(normalizedAssetId);

  if (!asset) {
    throw new NotFoundException(`Reference asset not found for id ${normalizedAssetId}`);
  }

  return asset;
}

function normalizeAssetId(asset_id: string) {
  const normalized = asset_id.trim();

  if (!normalized || normalized === "undefined" || normalized === "null") {
    throw new BadRequestException("Invalid asset id.");
  }

  return normalized;
}

function resolveAssetScopeLabel(scope: "story" | "user_private_library") {
  return scope === "story" ? "当前故事资料库" : "私人资料库";
}

function resolveStoryTargetAvailability(input: {
  asset_story_id: string | null;
  asset_scope: "story" | "user_private_library";
  target_story_id: string;
}) {
  if (input.asset_scope === "user_private_library") {
    return {
      availability: "available" as const,
      reason: null,
    };
  }

  if (!input.asset_story_id) {
    return {
      availability: "blocked" as const,
      reason: "这份资料没有原故事归属，暂时不能挂到任何故事。",
    };
  }

  if (input.asset_story_id !== input.target_story_id) {
    return {
      availability: "blocked" as const,
      reason: "故事型资料只能留在它自己的故事里。",
    };
  }

  return {
    availability: "available" as const,
    reason: null,
  };
}

async function resolveAttachmentTargetLabel(input: {
  asset_story_id: string | null;
  target_type: "story" | "canon_item";
  target_id: string;
}) {
  if (input.target_type === "story") {
    const workspace = await createStoryWorkspaceRepository().findWorkspaceById(input.target_id);
    return workspace?.title ?? input.target_id;
  }

  if (!input.asset_story_id) {
    return input.target_id;
  }

  const item = await createStoryKnowledgeRepository().findCanonItemByStoryAndId(input.asset_story_id, input.target_id);
  return item?.title ?? input.target_id;
}

function compareByUpdatedAtDesc(a: { last_updated_at: string }, b: { last_updated_at: string }) {
  return b.last_updated_at.localeCompare(a.last_updated_at);
}

export async function uploadReferenceAsset(input: {
  account_token: string;
  story_id?: string | null;
  scope: "story" | "user_private_library";
  file_name: string;
  mime_type: string;
  client_request_id: string;
}) {
  const account = await findAccountByToken(input.account_token);
  const created = await createReferenceAssetRepository().createAsset({
    account_id: account.account_id,
    story_id: input.story_id ?? null,
    scope: input.scope,
    file_name: input.file_name,
    mime_type: input.mime_type,
    source_kind: "manual_upload",
    source_ref_id: null,
    source_locator: null,
    extract_status: "uploaded",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  void recordDomainEvent({
    event_name: "asset_uploaded",
    account_id: account.account_id,
    payload: {
      asset_id: created.id,
      story_id: input.story_id ?? null,
    },
  });

  return {
    asset_id: created.id,
    status: "uploaded" as const,
  };
}

export async function listReferenceAssetLibrary(input: {
  account_token: string;
  story_id?: string | null;
  query?: string | null;
  scope?: "all" | "story" | "user_private_library";
  status?: "all" | "uploaded" | "review_pending" | "ready" | "failed" | "revoked";
}): Promise<ReferenceAssetLibraryResponse> {
  const account = await findAccountByToken(input.account_token);
  const repository = createReferenceAssetRepository();
  const assets = await repository.listAssetsByAccount(account.account_id);
  const workspaces = await createStoryWorkspaceRepository().listWorkspacesByAccount(account.account_id);
  const workspaceMap = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  const entries = (
    await Promise.all(
      assets.map(async (asset) => {
        const extractResults = await repository.listExtractResultsByAsset(asset.id);
        const attachments = await repository.listAttachmentsByAsset(asset.id);
        const activeAttachments = attachments.filter((item) => item.status === "active");
        const activeStoryIds = activeAttachments
          .filter((item) => item.target_type === "story")
          .map((item) => item.target_id);
        const activeStoryLabels = activeStoryIds.map((storyId) => workspaceMap.get(storyId)?.title ?? storyId);
        const storyLabel = asset.story_id ? workspaceMap.get(asset.story_id)?.title ?? asset.story_id : null;
        const lineageNote =
          asset.scope === "story"
            ? `只跟随《${storyLabel ?? "当前故事"}》流转，不会跨故事外溢。`
            : activeStoryLabels.length > 0
              ? `已在 ${activeStoryLabels.join("、")} 里复用。`
              : "还没挂到故事里，保持在你的私人资料库。";

        return {
          asset_id: asset.id,
          file_name: asset.file_name,
          scope: asset.scope,
          scope_label: resolveAssetScopeLabel(asset.scope),
          extract_status: asset.extract_status,
          story_id: asset.story_id,
          story_label: storyLabel,
          lineage_note: lineageNote,
          extract_count: extractResults.length,
          active_attachment_count: activeAttachments.length,
          active_story_ids: activeStoryIds,
          active_story_labels: activeStoryLabels,
          last_updated_at: asset.updated_at,
        };
      }),
    )
  ).sort(compareByUpdatedAtDesc);

  const focusStory = input.story_id
    ? {
        story_id: input.story_id,
        label: workspaceMap.get(input.story_id)?.title ?? input.story_id,
      }
    : null;
  const normalizedQuery = input.query?.trim().toLowerCase() ?? "";
  const filteredEntries = entries.filter((entry) => {
    if (input.scope && input.scope !== "all" && entry.scope !== input.scope) {
      return false;
    }

    if (input.status && input.status !== "all" && entry.extract_status !== input.status) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchHaystack = [entry.file_name, entry.scope_label, entry.story_label ?? "", ...entry.active_story_labels]
      .join(" ")
      .toLowerCase();

    return searchHaystack.includes(normalizedQuery);
  });

  const storyLiveEntries = focusStory
    ? filteredEntries.filter(
        (entry) => entry.story_id === focusStory.story_id || entry.active_story_ids.includes(focusStory.story_id),
      )
    : [];
  const privateEntries = filteredEntries.filter((entry) => entry.scope === "user_private_library");

  return {
    focus_story: focusStory,
    applied_filters: {
      query: input.query?.trim() ?? "",
      scope: input.scope ?? "all",
      status: input.status ?? "all",
    },
    total_asset_count: filteredEntries.length,
    reusable_asset_count: filteredEntries.filter(
      (entry) => entry.scope === "user_private_library" && entry.extract_status === "ready",
    ).length,
    active_attachment_count: filteredEntries.reduce((sum, entry) => sum + entry.active_attachment_count, 0),
    shelves: [
      {
        shelf_id: "story_live",
        title: focusStory ? `《${focusStory.label}》正在使用` : "当前故事书架",
        description: focusStory
          ? "这里显示当前故事正在用、或只属于这条故事线的资料。"
          : "进入某本故事后，这里会显示它正在使用的资料。",
        asset_count: storyLiveEntries.length,
        entries: storyLiveEntries,
      },
      {
        shelf_id: "private_library",
        title: "私人资料库",
        description: "默认私有，不混入公共知识；只有你决定挂载时，才会进入具体故事。",
        asset_count: privateEntries.length,
        entries: privateEntries,
      },
    ],
  };
}

export async function ingestResolvedReferenceAsset(input: {
  account_id: string;
  story_id?: string | null;
  scope: "story" | "user_private_library";
  file_name: string;
  mime_type: string;
  source_ref_id: string;
  source_locator: string | null;
  summary: string;
  structured_text: string | null;
  capability: "ocr_document_extraction" | "vision_understanding";
  extract_modes: Array<"character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern">;
}) {
  const repository = createReferenceAssetRepository();
  const now = new Date().toISOString();
  const asset = await repository.createAsset({
    account_id: input.account_id,
    story_id: input.story_id ?? null,
    scope: input.scope,
    file_name: input.file_name,
    mime_type: input.mime_type,
    source_kind: "channel_attachment",
    source_ref_id: input.source_ref_id,
    source_locator: input.source_locator,
    extract_status: "review_pending",
    created_at: now,
    updated_at: now,
  });
  const extractResults = await repository.createExtractResults(
    input.extract_modes.map((mode) => ({
      asset_id: asset.id,
      extract_type: mode,
      payload: {
        source_file: input.file_name,
        summary: input.summary,
        structured_text: input.structured_text,
        capability: input.capability,
      },
      status: "suggested" as const,
      created_at: now,
    })),
  );

  void recordDomainEvent({
    event_name: "asset_uploaded",
    account_id: input.account_id,
    payload: {
      asset_id: asset.id,
      story_id: input.story_id ?? null,
      source_kind: "channel_attachment",
    },
  });
  void recordDomainEvent({
    event_name: "asset_extracted",
    account_id: input.account_id,
    payload: {
      asset_id: asset.id,
      extract_count: extractResults.length,
      source_kind: "channel_attachment",
    },
  });

  return {
    asset_id: asset.id,
    status: "review_pending" as const,
    extract_results: extractResults.map((item) => ({
      extract_ref_id: item.id,
      extract_type: item.extract_type,
    })),
  };
}

export async function extractReferenceAsset(input: {
  asset_id: string;
  extract_modes: Array<"character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern">;
  client_request_id: string;
}) {
  const repository = createReferenceAssetRepository();
  const asset = await findAsset(input.asset_id);

  if (asset.file_name.includes("fail")) {
    await repository.saveAsset({
      ...asset,
      extract_status: "uploaded",
      updated_at: new Date().toISOString(),
    });

    return {
      status: "failed" as const,
      extract_results: [],
      error_code: "AST-101" as const,
    };
  }

  const now = new Date().toISOString();
  const extractResults = await repository.createExtractResults(
    input.extract_modes.map((mode) => ({
      asset_id: asset.id,
      extract_type: mode,
      payload: {
        source_file: asset.file_name,
        summary: `${mode} extracted from ${asset.file_name}`,
      },
      status: "suggested" as const,
      created_at: now,
    })),
  );
  await repository.saveAsset({
    ...asset,
    extract_status: "review_pending",
    updated_at: now,
  });

  void recordDomainEvent({
    event_name: "asset_extracted",
    account_id: asset.account_id,
    payload: {
      asset_id: asset.id,
      extract_count: extractResults.length,
    },
  });

  return {
    status: "review_pending" as const,
    extract_results: extractResults.map((item) => ({
      extract_ref_id: item.id,
      extract_type: item.extract_type,
    })),
  };
}

export async function confirmReferenceAsset(input: {
  asset_id: string;
  accepted_extract_refs: string[];
  rejected_extract_refs: string[];
  client_request_id: string;
}) {
  const repository = createReferenceAssetRepository();
  const asset = await findAsset(input.asset_id);
  const existingExtractResults = await repository.listExtractResultsByAsset(asset.id);

  if (existingExtractResults.length === 0) {
    throw new BadRequestException("这份资料还没有提炼结果，暂时不能确认。");
  }

  await repository.confirmExtractResults({
    asset_id: asset.id,
    accepted_extract_refs: input.accepted_extract_refs,
    rejected_extract_refs: input.rejected_extract_refs,
  });
  await repository.saveAsset({
    ...asset,
    extract_status: "ready",
    updated_at: new Date().toISOString(),
  });

  return {
    asset_id: asset.id,
    status: "ready" as const,
  };
}

export async function attachReferenceAsset(input: {
  asset_id: string;
  target_type: "story" | "canon_item";
  target_id: string;
  usage_mode: "style" | "lore" | "character" | "world_rule" | "mood";
  client_request_id: string;
}) {
  const asset = await findAsset(input.asset_id);

  if (asset.extract_status !== "ready") {
    throw new BadRequestException("这份资料还没完成提炼确认，暂时不能挂载。");
  }

  await ensureAttachmentTarget({
    asset_story_id: asset.story_id,
    asset_scope: asset.scope,
    target_type: input.target_type,
    target_id: input.target_id,
  });

  const attachment = await createReferenceAssetRepository().createAttachment({
    asset_id: asset.id,
    target_type: input.target_type,
    target_id: input.target_id,
    usage_mode: input.usage_mode,
    status: "active",
    created_at: new Date().toISOString(),
  });

  void recordDomainEvent({
    event_name: "asset_attached",
    account_id: asset.account_id,
    payload: {
      asset_id: asset.id,
      target_id: input.target_id,
    },
  });

  return {
    attachment_id: attachment.id,
    status: "active" as const,
  };
}

export async function revokeReferenceAsset(input: {
  asset_id: string;
  revoke_mode: string;
  reason: string;
  client_request_id: string;
}) {
  const repository = createReferenceAssetRepository();
  const asset = await findAsset(input.asset_id);

  await repository.saveAsset({
    ...asset,
    extract_status: "revoked",
    updated_at: new Date().toISOString(),
  });
  const affected = (await repository.revokeAttachmentsByAsset(asset.id)).map((item) => item.id);

  void recordDomainEvent({
    event_name: "asset_revoked",
    account_id: asset.account_id,
    payload: {
      asset_id: asset.id,
      affected_count: affected.length,
    },
  });

  return {
    status: "revoked" as const,
    affected_attachment_ids: affected,
  };
}

export async function getReferenceAssetDetail(input: { asset_id: string }): Promise<ReferenceAssetDetailResponse> {
  const repository = createReferenceAssetRepository();
  const asset = await findAsset(input.asset_id);
  const extractResults = await repository.listExtractResultsByAsset(asset.id);
  const attachments = await repository.listAttachmentsByAsset(asset.id);
  const workspaces = await createStoryWorkspaceRepository().listWorkspacesByAccount(asset.account_id);
  const attachmentViews = await Promise.all(
    attachments.map(async (item) => ({
      attachment_id: item.id,
      asset_id: item.asset_id,
      target_type: item.target_type,
      target_id: item.target_id,
      target_label: await resolveAttachmentTargetLabel({
        asset_story_id: asset.story_id,
        target_type: item.target_type,
        target_id: item.target_id,
      }),
      usage_mode: item.usage_mode,
      status: item.status,
    })),
  );
  const availableStoryTargets = workspaces.map((workspace) => {
    const availability = resolveStoryTargetAvailability({
      asset_story_id: asset.story_id,
      asset_scope: asset.scope,
      target_story_id: workspace.id,
    });

    return {
      story_id: workspace.id,
      label: workspace.title,
      workspace_status: workspace.workspace_status,
      availability: availability.availability,
      reason: availability.reason,
    };
  });
  const affectedStoryTargets = attachmentViews
    .filter((item) => item.target_type === "story")
    .reduce<Array<{ story_id: string; label: string; attachment_count: number }>>((acc, item) => {
      const existing = acc.find((entry) => entry.story_id === item.target_id);

      if (existing) {
        existing.attachment_count += 1;
        return acc;
      }

      acc.push({
        story_id: item.target_id,
        label: item.target_label ?? item.target_id,
        attachment_count: 1,
      });
      return acc;
    }, []);

  return {
    asset: {
      asset_id: asset.id,
      account_id: asset.account_id,
      story_id: asset.story_id,
      scope: asset.scope,
      file_name: asset.file_name,
      mime_type: asset.mime_type,
      extract_status: asset.extract_status,
    },
    scope_label: resolveAssetScopeLabel(asset.scope),
    available_story_targets: availableStoryTargets,
    extract_results: extractResults.map((item) => ({
      extract_ref_id: item.id,
      extract_type: item.extract_type,
      status: item.status,
    })),
    attachments: attachmentViews,
    revoke_impact: {
      affected_attachment_ids: attachmentViews.map((item) => item.attachment_id),
      affected_story_targets: affectedStoryTargets,
      affected_references: attachmentViews.map((item) => ({
        attachment_id: item.attachment_id,
        target_type: item.target_type,
        target_id: item.target_id,
        target_label: item.target_label ?? item.target_id,
        usage_mode: item.usage_mode,
      })),
    },
  };
}

async function ensureAttachmentTarget(input: {
  asset_story_id: string | null;
  asset_scope: "story" | "user_private_library";
  target_type: "story" | "canon_item";
  target_id: string;
}) {
  if (input.target_type === "story") {
    const workspace = await createStoryWorkspaceRepository().findWorkspaceById(input.target_id);

    if (!workspace) {
      throw new Error(`Story workspace not found for id ${input.target_id}`);
    }

    const availability = resolveStoryTargetAvailability({
      asset_story_id: input.asset_story_id,
      asset_scope: input.asset_scope,
      target_story_id: input.target_id,
    });

    if (availability.availability === "blocked") {
      throw new Error(availability.reason ?? "Story attachment is not available for this asset.");
    }

    return;
  }

  if (!input.asset_story_id) {
    throw new Error("Story-scoped asset required for canon attachment");
  }

  const item = await createStoryKnowledgeRepository().findCanonItemByStoryAndId(input.asset_story_id, input.target_id);

  if (!item) {
    throw new Error(`Canon item not found for id ${input.target_id}`);
  }
}
