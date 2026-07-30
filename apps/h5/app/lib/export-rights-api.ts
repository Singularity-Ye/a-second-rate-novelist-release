import type {
  EvidencePackDetailResponse,
  ExportCapabilitiesResponse,
  ExportJobCreateRequest,
  ExportJobCreateResponse,
  ExportJobDetailResponse,
  LabelWaiverRequestResponse,
  RiskCheckResponse,
  StoryExportsListResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "./runtime-api-base";

const apiBaseUrl = () => resolveH5ApiBaseUrl();

export async function fetchStoryExports(story_id: string): Promise<StoryExportsListResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${story_id}/exports`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch story exports");
  }

  const payload = (await response.json()) as { data: StoryExportsListResponse };
  return payload.data;
}

export async function createRiskCheck(input: {
  story_id: string;
  export_purpose: string;
  branch_ids: string[];
  asset_refs: string[];
  label_mode_requested: "embedded_notice" | "label_waiver_requested";
  include_submission_statement: boolean;
}): Promise<RiskCheckResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${input.story_id}/rights/risk-checks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      export_purpose: input.export_purpose,
      branch_ids: input.branch_ids,
      asset_refs: input.asset_refs,
      label_mode_requested: input.label_mode_requested,
      include_submission_statement: input.include_submission_statement,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create risk check");
  }

  const payload = (await response.json()) as { data: RiskCheckResponse };
  return payload.data;
}

export async function fetchExportCapabilities(story_id: string): Promise<ExportCapabilitiesResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${story_id}/exports/capabilities`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch export capabilities");
  }

  const payload = (await response.json()) as { data: ExportCapabilitiesResponse };
  return payload.data;
}

export async function fetchExportJobDetail(input: {
  story_id: string;
  job_id: string;
}): Promise<ExportJobDetailResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${input.story_id}/exports/${input.job_id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch export job detail");
  }

  const payload = (await response.json()) as { data: ExportJobDetailResponse };
  return payload.data;
}

export async function createExportJob(input: {
  story_id: string;
} & ExportJobCreateRequest): Promise<ExportJobCreateResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${input.story_id}/exports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      export_purpose: input.export_purpose,
      formats: input.formats,
      chapter_range: input.chapter_range,
      branch_ids: input.branch_ids,
      include_evidence: input.include_evidence,
      include_rights_statement: input.include_rights_statement,
      label_mode_preference: input.label_mode_preference,
      risk_check_id: input.risk_check_id,
      risk_acknowledged: input.risk_acknowledged,
      client_request_id: input.client_request_id,
    }),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error("Failed to create export job");
  }

  const payload = (await response.json()) as { data: ExportJobCreateResponse };
  return payload.data;
}

export async function submitLabelWaiverRequest(input: {
  story_id: string;
  export_job_id: string;
  justification: string;
  target_channel: string;
  user_acknowledgements: string[];
}): Promise<LabelWaiverRequestResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${input.story_id}/label-waiver-requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      export_job_id: input.export_job_id,
      justification: input.justification,
      target_channel: input.target_channel,
      user_acknowledgements: input.user_acknowledgements,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit label waiver request");
  }

  const payload = (await response.json()) as { data: LabelWaiverRequestResponse };
  return payload.data;
}

export async function fetchEvidencePackDetail(input: {
  story_id: string;
  pack_id: string;
}): Promise<EvidencePackDetailResponse> {
  const response = await fetch(`${apiBaseUrl()}/stories/${input.story_id}/evidence-packs/${input.pack_id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch evidence pack detail");
  }

  const payload = (await response.json()) as { data: EvidencePackDetailResponse };
  return payload.data;
}
