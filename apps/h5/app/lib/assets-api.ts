import type { ReferenceAssetDetailResponse, ReferenceAssetLibraryResponse } from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function uploadReferenceAsset(input: {
  account_token: string;
  story_id?: string;
  scope: "story" | "user_private_library";
  file_name: string;
  mime_type: string;
}) {
  const response = await fetch(`${apiBaseUrl()}/assets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_token: input.account_token,
      story_id: input.story_id,
      scope: input.scope,
      file_name: input.file_name,
      mime_type: input.mime_type,
      client_request_id: `asset-upload-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to upload reference asset");
  }

  const payload = (await response.json()) as {
    data: {
      asset_id: string;
      status: "uploaded";
    };
  };
  return payload.data;
}

export async function extractReferenceAsset(input: {
  asset_id: string;
  extract_modes: Array<"character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern">;
}) {
  const response = await fetch(`${apiBaseUrl()}/assets/${input.asset_id}/extract`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      extract_modes: input.extract_modes,
      client_request_id: `asset-extract-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to extract reference asset");
  }

  const payload = (await response.json()) as {
    data: {
      status: "review_pending" | "failed";
      extract_results: Array<{ extract_ref_id: string; extract_type: string }>;
      error_code?: "AST-101";
    };
  };
  return payload.data;
}

export async function confirmReferenceAsset(input: {
  asset_id: string;
  accepted_extract_refs: string[];
  rejected_extract_refs: string[];
}) {
  const response = await fetch(`${apiBaseUrl()}/assets/${input.asset_id}/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      accepted_extract_refs: input.accepted_extract_refs,
      rejected_extract_refs: input.rejected_extract_refs,
      client_request_id: `asset-confirm-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to confirm reference asset");
  }

  const payload = (await response.json()) as {
    data: {
      asset_id: string;
      status: "ready";
    };
  };
  return payload.data;
}

export async function attachReferenceAsset(input: {
  asset_id: string;
  target_type: "story" | "canon_item";
  target_id: string;
  usage_mode: "style" | "lore" | "character" | "world_rule" | "mood";
}) {
  const response = await fetch(`${apiBaseUrl()}/assets/${input.asset_id}/attachments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      target_type: input.target_type,
      target_id: input.target_id,
      usage_mode: input.usage_mode,
      client_request_id: `asset-attach-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to attach reference asset");
  }

  const payload = (await response.json()) as {
    data: {
      attachment_id: string;
      status: "active";
    };
  };
  return payload.data;
}

export async function revokeReferenceAsset(input: {
  asset_id: string;
  revoke_mode: string;
  reason: string;
}) {
  const response = await fetch(`${apiBaseUrl()}/assets/${input.asset_id}/revoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      revoke_mode: input.revoke_mode,
      reason: input.reason,
      client_request_id: `asset-revoke-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to revoke reference asset");
  }

  const payload = (await response.json()) as {
    data: {
      status: "revoked";
      affected_attachment_ids: string[];
    };
  };
  return payload.data;
}

export async function fetchReferenceAssetDetail(input: { asset_id: string }): Promise<ReferenceAssetDetailResponse> {
  const response = await fetch(`${apiBaseUrl()}/assets/${input.asset_id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch reference asset detail");
  }

  const payload = (await response.json()) as { data: ReferenceAssetDetailResponse };
  return payload.data;
}

export async function fetchReferenceAssetLibrary(input: {
  account_token: string;
  story_id?: string;
  query?: string;
  scope?: "all" | "story" | "user_private_library";
  status?: "all" | "uploaded" | "review_pending" | "ready" | "failed" | "revoked";
}): Promise<ReferenceAssetLibraryResponse> {
  const query = new URLSearchParams({
    account_token: input.account_token,
  });

  if (input.story_id) {
    query.set("story_id", input.story_id);
  }

  if (input.query) {
    query.set("query", input.query);
  }

  if (input.scope && input.scope !== "all") {
    query.set("scope", input.scope);
  }

  if (input.status && input.status !== "all") {
    query.set("status", input.status);
  }

  const response = await fetch(`${apiBaseUrl()}/assets/library?${query.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch reference asset library");
  }

  const payload = (await response.json()) as { data: ReferenceAssetLibraryResponse };
  return payload.data;
}
