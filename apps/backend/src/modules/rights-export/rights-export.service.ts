import { randomUUID } from "node:crypto";
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
import { createBranchRepository } from "../../common/repositories/branch.repository.js";
import {
  createChapterRuntimeRepository,
  type ChapterRecord,
} from "../../common/repositories/chapter-runtime.repository.js";
import {
  createExportRightsRepository,
  type DeliveryManifestRecord,
  type ExportJobRecord,
  type RiskCheckRecord,
  type RiskReportRecord,
} from "../../common/repositories/export-rights.repository.js";
import {
  createObservabilityRepository,
  type AuditLogRecord,
  type EventLogRecord,
} from "../../common/repositories/observability.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import {
  toExportManifestArtifact,
  toExportManifestObjectKey,
} from "../../common/truth-source/creative-artifact.contract.js";
import {
  readCreativeArtifactObjectStorageShadow,
  scheduleCreativeArtifactObjectStorageShadowUpload,
} from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import {
  readExportObjectStorageShadow,
  scheduleExportObjectStorageShadowUpload,
} from "../../common/truth-source/export-object-storage-shadow-mirror.js";
import { evaluatePolicyVerdict } from "../governance-compliance/policy-engine.service.js";
import { assertExportQuotaAvailable, getAccountRuntimeControl } from "../identity-membership/account-control-plane.service.js";
import { buildSystemNotificationCopy } from "../persona-runtime/persona-runtime.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const API_BASE_URL =
  process.env.API_BASE_URL ??
  `http://${process.env.HOST?.trim() || "127.0.0.1"}:${process.env.PORT?.trim() || "4000"}`;
const H5_BASE_URL = process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";
const LABEL_WAIVER_CONSENT_VERSION = "m3-label-waiver-v1";

export async function listStoryExports(input: { story_id: string }): Promise<StoryExportsListResponse> {
  await ensureStory(input.story_id);
  const jobs = (await createExportRightsRepository().listExportJobsByStory(input.story_id)).map((item) => ({
    job_id: item.id,
    story_id: item.story_id,
    export_purpose: item.export_purpose,
    requested_formats: item.requested_formats,
    status: item.status,
    created_at: item.created_at,
    evidence_pack_id: item.evidence_pack_id,
  }));

  return { jobs };
}

export async function getExportCapabilities(input: { story_id: string }): Promise<ExportCapabilitiesResponse> {
  const workspace = await ensureStory(input.story_id);
  const branchRepository = createBranchRepository();
  const exportRightsRepository = createExportRightsRepository();
  const runtimeControl = await getAccountRuntimeControl(workspace.account_id);
  const blocked_branch_ids = (await branchRepository.listBranchesByStory(input.story_id))
    .filter((item) => item.rights_mode === "export_blocked")
    .map((item) => item.id);
  const latestRisk = await exportRightsRepository.getLatestRiskCheckByStory(input.story_id);
  const latestPackId = (await exportRightsRepository.listEvidencePacksByStory(input.story_id))[0]?.id ?? null;

  return {
    story_id: input.story_id,
    workspace_status: workspace.workspace_status,
    export_allowed: blocked_branch_ids.length === 0 && runtimeControl.remaining.export_quota > 0,
    allowed_formats: ["docx", "epub", "pdf", "md", "txt"],
    blocked_branch_ids,
    quota: {
      remaining_exports_this_period: runtimeControl.remaining.export_quota,
      rights_pack_remaining: 1,
    },
    label_options: ["embedded_notice", "label_waiver_requested"],
    latest_risk_summary: latestRisk
      ? {
          result: latestRisk.result,
          issue_codes: latestRisk.issues.map((item) => item.code),
          valid_until: latestRisk.valid_until,
        }
      : null,
    latest_evidence_pack_id: latestPackId,
  };
}

export async function createRiskCheck(input: {
  story_id: string;
  export_purpose: string;
  branch_ids: string[];
  asset_refs: string[];
  label_mode_requested: "embedded_notice" | "label_waiver_requested";
  include_submission_statement: boolean;
}): Promise<RiskCheckResponse> {
  const workspace = await ensureStory(input.story_id);
  const branchRepository = createBranchRepository();
  const exportRightsRepository = createExportRightsRepository();
  const issues: RiskCheckResponse["issues"] = [];
  const required_actions: string[] = [];

  for (const branchId of input.branch_ids) {
    const branch = await branchRepository.findBranchByStoryAndId(input.story_id, branchId);

    if (branch?.rights_mode === "export_blocked" || branch?.rights_mode === "private_sandbox") {
      issues.push({
        code: "CMP-004",
        severity: "block",
        blocking: true,
        object_ref: {
          ref_type: "branch",
          ref_id: branch.id,
        },
        resolution_hint:
          branch.rights_mode === "private_sandbox"
            ? "私人沙盒分支不可直接导出，请改为原创转译版本或移出导出范围。"
            : "移除不可导出的分支，或改为仅站内留存。",
      });
      required_actions.push("remove_blocked_branch");
    }
  }

  if (input.label_mode_requested === "label_waiver_requested") {
    issues.push({
      code: "CMP-005",
      severity: "warn",
      blocking: false,
      object_ref: {
        ref_type: "story",
        ref_id: input.story_id,
      },
      resolution_hint: "继续前请提交无显式标识申请并留存用户确认。",
    });
    required_actions.push("submit_label_waiver");
  }

  const policy_verdict = await evaluatePolicyVerdict({
    scope: "export",
    account_id: workspace.account_id,
    story_id: input.story_id,
    source_ref: {
      ref_type: "risk_check",
      ref_id: `${input.story_id}:${input.export_purpose}:${input.label_mode_requested}`,
    },
    input_text: input.export_purpose,
    export_context: {
      label_mode_requested: input.label_mode_requested,
      blocked_branch_count: issues.filter((item) => item.blocking).length,
    },
  });

  const result: RiskCheckResponse["result"] = issues.some((item) => item.blocking)
    ? "block"
    : issues.length > 0
      ? "warn"
      : "pass";
  const stored = await exportRightsRepository.createRiskCheck({
    story_id: input.story_id,
    export_purpose: input.export_purpose,
    branch_ids: input.branch_ids,
    asset_refs: input.asset_refs,
    label_mode_requested: input.label_mode_requested,
    result,
    issues,
    required_actions,
    valid_until: new Date(Date.now() + 15 * 60_000).toISOString(),
    evidence_entry_id: randomUUID(),
    created_at: new Date().toISOString(),
  });
  const riskReport = await exportRightsRepository.createRiskReport(
    buildRiskReport({
      risk_check: stored,
    }),
  );

  scheduleExportObjectStorageShadowUpload({
    account_id: workspace.account_id,
    aggregate_key: "risk_report",
    object_key: riskReport.object_key,
    body: riskReport.download_body,
    content_type: "application/json",
  });

  await recordDomainEvent({
    event_name: "export_risk_check_complete",
    account_id: workspace.account_id,
    payload: {
      story_id: input.story_id,
      result,
      warning_count: issues.filter((item) => item.severity === "warn").length,
      blocked_reason_codes: issues.filter((item) => item.blocking).map((item) => item.code).join(",") || null,
    },
  });

  return {
    risk_check_id: stored.id,
    result,
    issues,
    required_actions,
    valid_until: stored.valid_until,
    evidence_entry_id: stored.evidence_entry_id,
    risk_report: toRiskReportView({
      story_id: input.story_id,
      report: riskReport,
    }),
    policy_verdict,
  };
}

export async function createExportJob(
  input: { story_id: string } & ExportJobCreateRequest,
): Promise<ExportJobCreateResponse> {
  const workspace = await ensureStory(input.story_id);
  const exportRightsRepository = createExportRightsRepository();
  const riskCheck = await ensureRiskCheck(input.story_id, input.risk_check_id);

  if (riskCheck.result === "block") {
    return {
      job_id: randomUUID(),
      status: "blocked",
      progress_stage: "blocked",
      notification_id: null,
      next_action: "resolve_risk_issues",
      estimated_ready_at: null,
      error_code: "CMP-004",
    };
  }

  if (riskCheck.result === "warn" && input.risk_acknowledged !== true) {
    return {
      job_id: randomUUID(),
      status: "blocked",
      progress_stage: "blocked",
      notification_id: null,
      next_action: "acknowledge_warn_risk",
      estimated_ready_at: null,
      error_code: "CMP-005",
    };
  }

  const quotaVerdict = await assertExportQuotaAvailable(workspace.account_id);

  if (quotaVerdict.status === "blocked") {
    return {
      job_id: randomUUID(),
      status: "blocked",
      progress_stage: "blocked",
      notification_id: null,
      next_action: "upgrade_membership",
      estimated_ready_at: null,
      error_code: "EXP-202",
    };
  }

  const created_at = new Date().toISOString();
  const job = await exportRightsRepository.createExportJob({
    story_id: input.story_id,
    account_id: workspace.account_id,
    export_purpose: input.export_purpose,
    requested_formats: input.formats,
    chapter_range: input.chapter_range,
    branch_ids: input.branch_ids,
    include_evidence: input.include_evidence,
    include_rights_statement: input.include_rights_statement,
    label_mode_preference: input.label_mode_preference,
    risk_check_id: input.risk_check_id,
    risk_acknowledged: input.risk_acknowledged ?? riskCheck.result === "pass",
    client_request_id: input.client_request_id,
    status: "generating",
    progress_stage: "generating_artifacts",
    progress_percent: 40,
    notification_id: null,
    evidence_pack_id: null,
    delivery_manifest_id: null,
    rights_statement_body: null,
    error_code: null,
    error_message: null,
    created_at,
    finished_at: null,
    updated_at: created_at,
  });

  await recordDomainEvent({
    event_name: "export_start",
    account_id: workspace.account_id,
    payload: {
      story_id: input.story_id,
      export_purpose: input.export_purpose,
      export_formats: input.formats.join(","),
      include_evidence: input.include_evidence,
    },
  });

  const artifactInputs = buildExportArtifacts({
    story_id: input.story_id,
    export_job_id: job.id,
    story_title: workspace.title,
    chapters: await createChapterRuntimeRepository().listChaptersByStory(input.story_id),
    requested_formats: input.formats,
  });
  const storedArtifacts = [];
  for (const artifact of artifactInputs) {
    const stored = await exportRightsRepository.createExportArtifact(artifact);
    scheduleExportObjectStorageShadowUpload({
      account_id: workspace.account_id,
      aggregate_key: "export_artifact",
      object_key: stored.object_key,
      body: stored.file_body,
      content_type: resolveArtifactContentType(stored.format),
    });
    storedArtifacts.push(stored);
  }

  const observability = await listStoryObservabilityRecords({
    account_id: workspace.account_id,
    story_id: input.story_id,
  });

  let evidence_pack_id: string | null = null;
  if (input.include_evidence) {
    const pack = await exportRightsRepository.createEvidencePack(
      buildEvidencePack({
        story_id: input.story_id,
        export_job_id: job.id,
        artifact_ids: storedArtifacts.map((item) => item.id),
        risk_check: riskCheck,
        story_events: observability.story_events,
        story_audits: observability.story_audits,
      }),
    );
    evidence_pack_id = pack.id;

    scheduleExportObjectStorageShadowUpload({
      account_id: workspace.account_id,
      aggregate_key: "evidence_pack",
      object_key: pack.object_key,
      body: pack.download_body,
      content_type: "application/json",
    });

    await recordDomainEvent({
      event_name: "rights_pack_generate",
      account_id: workspace.account_id,
      payload: {
        story_id: input.story_id,
        pack_type: "evidence_pack",
        risk_level: riskCheck.result,
      },
    });
  }

  const rightsStatementBody = input.include_rights_statement
    ? buildRightsStatement({
        story_title: workspace.title,
        export_purpose: input.export_purpose,
      })
    : null;
  const exportNotification = await buildSystemNotificationCopy({
    account_id: workspace.account_id,
    story_id: input.story_id,
    story_title: workspace.title,
    notification_kind: "export_ready",
    delivery_status: input.formats.includes("pdf") ? "partial_failed" : "succeeded",
  });
  const notificationId = (
    await exportRightsRepository.createNotification({
      account_id: workspace.account_id,
      story_id: input.story_id,
      title: exportNotification.title,
      body: exportNotification.body,
      deep_link: `${H5_BASE_URL}/stories/${input.story_id}/exports/${job.id}`,
      status: "delivered",
      category: "export",
      source_type: "export_job",
      source_id: job.id,
      created_at: new Date().toISOString(),
    })
  ).id;
  const status: ExportJobRecord["status"] = input.formats.includes("pdf") ? "partial_failed" : "succeeded";
  const error_code = input.formats.includes("pdf") ? "EXP-201" : null;
  const error_message = input.formats.includes("pdf") ? "PDF 工件生成失败，已保留 docx/md 兜底导出。" : null;
  const finished_at = new Date().toISOString();
  const finalizedJob = await exportRightsRepository.saveExportJob({
    ...job,
    status,
    progress_stage: status,
    progress_percent: 100,
    notification_id: notificationId,
    evidence_pack_id,
    delivery_manifest_id: null,
    rights_statement_body: rightsStatementBody,
    error_code,
    error_message,
    finished_at,
    updated_at: finished_at,
  });
  const exportManifestArtifact = toExportManifestArtifact({
    job: finalizedJob,
    risk_check: riskCheck,
    artifacts: storedArtifacts,
  });
  const exportManifestObjectKey = toExportManifestObjectKey(input.story_id, job.id);

  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: workspace.account_id,
    aggregate_key: "export_manifest",
    object_key: exportManifestObjectKey,
    body: JSON.stringify(exportManifestArtifact),
    content_type: "application/json",
  });

  const deliveryManifest = await exportRightsRepository.createDeliveryManifest(
    buildDeliveryManifest({
      story_id: input.story_id,
      job: finalizedJob,
      artifacts: storedArtifacts,
      evidence_pack_id,
      rights_statement_included: Boolean(rightsStatementBody),
      risk_check: riskCheck,
      risk_report: await ensureRiskReportByRiskCheckId(riskCheck.id),
      label_mode_effective: resolveEffectiveLabelMode({
        label_mode_preference: finalizedJob.label_mode_preference,
        waiver_submitted: false,
      }),
      export_manifest_object_key: exportManifestObjectKey,
    }),
  );

  scheduleExportObjectStorageShadowUpload({
    account_id: workspace.account_id,
    aggregate_key: "delivery_manifest",
    object_key: deliveryManifest.object_key,
    body: deliveryManifest.download_body,
    content_type: "application/json",
  });

  await exportRightsRepository.saveExportJob({
    ...finalizedJob,
    delivery_manifest_id: deliveryManifest.id,
    updated_at: finished_at,
  });

  await recordDomainEvent({
    event_name: "export_complete",
    account_id: workspace.account_id,
    payload: {
      story_id: input.story_id,
      export_formats: storedArtifacts.map((item) => item.format).join(","),
      status,
      evidence_pack_id,
    },
  });

  return {
    job_id: job.id,
    status,
    progress_stage: status,
    notification_id: notificationId,
    next_action: status === "partial_failed" ? "download_available_artifacts" : null,
    estimated_ready_at: finished_at,
  };
}

export async function getExportJobDetail(input: { story_id: string; job_id: string }): Promise<ExportJobDetailResponse> {
  await ensureStory(input.story_id);
  const exportRightsRepository = createExportRightsRepository();
  const job = await exportRightsRepository.findExportJobByStoryAndId(input.story_id, input.job_id);

  if (!job) {
    throw new Error(`Export job not found for id ${input.job_id}`);
  }

  const riskCheck = await ensureRiskCheck(input.story_id, job.risk_check_id);
  const riskReport = await ensureRiskReportByRiskCheckId(riskCheck.id);
  const waiver = await exportRightsRepository.findLabelWaiverRequestByExportJobId(job.id);
  const label_mode_effective = resolveEffectiveLabelMode({
    label_mode_preference: job.label_mode_preference,
    waiver_submitted: Boolean(waiver),
  });
  const controlResult = buildExportControlResult({
    job,
    risk_check: riskCheck,
    waiver_submitted: Boolean(waiver),
  });
  const deliveryManifest = await ensureDeliveryManifestByJobId(job.id);
  const artifacts = (await exportRightsRepository.listExportArtifactsByJob(input.job_id)).map((item) => ({
    artifact_id: item.id,
    format: item.format,
    file_name: item.file_name,
    file_size_mb: item.file_size_mb,
    expires_at: item.expires_at,
    download_url: `${API_BASE_URL}/exports/artifacts/${item.id}/download`,
    status: item.status,
  }));

  return {
    job: {
      job_id: job.id,
      job_type: "export",
      status: job.status,
      progress_stage: job.progress_stage,
      progress_percent: job.progress_percent,
      notification_id: job.notification_id,
      error_code: job.error_code,
      error_message: job.error_message,
      created_at: job.created_at,
      finished_at: job.finished_at,
    },
    artifacts,
    risk_summary: {
      result: riskCheck.result,
      issue_codes: riskCheck.issues.map((item) => item.code),
      warning_count: riskCheck.issues.filter((item) => item.severity === "warn").length,
      blocked_reason_codes: riskCheck.issues.filter((item) => item.blocking).map((item) => item.code),
    },
    label_mode_effective,
    control_result: controlResult,
    risk_report: toRiskReportView({
      story_id: input.story_id,
      report: riskReport,
    }),
    delivery_manifest: toDeliveryManifestView({
      story_id: input.story_id,
      manifest: deliveryManifest,
    }),
    export_manifest: {
      artifact_type: "export_manifest",
      object_key: toExportManifestObjectKey(input.story_id, input.job_id),
      download_url: getExportManifestDownloadUrl(input.story_id, input.job_id),
    },
    evidence_bundle: job.evidence_pack_id
      ? {
          pack_id: job.evidence_pack_id,
          manifest_version:
            (await exportRightsRepository.findEvidencePackByStoryAndId(input.story_id, job.evidence_pack_id))
              ?.manifest_version ?? "manifest_v1",
          download_url: `${API_BASE_URL}/evidence-packs/${job.evidence_pack_id}/download`,
        }
      : null,
    evidence_pack_id: job.evidence_pack_id,
    rights_statement_url: job.rights_statement_body ? `${API_BASE_URL}/exports/jobs/${job.id}/rights-statement` : null,
  };
}

export async function getEvidencePackDetail(
  input: { story_id: string; pack_id: string },
): Promise<EvidencePackDetailResponse> {
  await ensureStory(input.story_id);
  const pack = await createExportRightsRepository().findEvidencePackByStoryAndId(input.story_id, input.pack_id);

  if (!pack) {
    throw new Error(`Evidence pack not found for id ${input.pack_id}`);
  }

  return {
    pack_id: pack.id,
    story_id: pack.story_id,
    manifest_version: pack.manifest_version,
    record_count: pack.record_count,
    records: pack.records,
    download_url: `${API_BASE_URL}/evidence-packs/${pack.id}/download`,
  };
}

export async function submitLabelWaiverRequest(input: {
  story_id: string;
  export_job_id: string;
  justification: string;
  target_channel: string;
  user_acknowledgements: string[];
}): Promise<LabelWaiverRequestResponse> {
  const workspace = await ensureStory(input.story_id);
  const exportRightsRepository = createExportRightsRepository();
  const job = await exportRightsRepository.findExportJobByStoryAndId(input.story_id, input.export_job_id);

  if (!job) {
    throw new Error(`Export job not found for waiver request ${input.export_job_id}`);
  }

  const waiver = await exportRightsRepository.createLabelWaiverRequest({
    story_id: input.story_id,
    export_job_id: input.export_job_id,
    status: "pending_user_consent",
    justification: input.justification,
    target_channel: input.target_channel,
    user_acknowledgements: input.user_acknowledgements,
    consent_version: LABEL_WAIVER_CONSENT_VERSION,
    retained_until: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    ops_case_id: null,
    created_at: new Date().toISOString(),
  });

  await recordDomainEvent({
    event_name: "rights_label_waiver_submit",
    account_id: workspace.account_id,
    payload: {
      story_id: input.story_id,
      export_job_id: input.export_job_id,
      target_channel: input.target_channel,
      consent_version: LABEL_WAIVER_CONSENT_VERSION,
    },
  });

  const deliveryManifest = await exportRightsRepository.findDeliveryManifestByJobId(input.export_job_id);

  if (deliveryManifest) {
    const updatedManifest = syncDeliveryManifestLabelDecision(deliveryManifest, "label_waiver_requested");
    await exportRightsRepository.saveDeliveryManifest(updatedManifest);
    scheduleExportObjectStorageShadowUpload({
      account_id: workspace.account_id,
      aggregate_key: "delivery_manifest",
      object_key: updatedManifest.object_key,
      body: updatedManifest.download_body,
      content_type: "application/json",
    });
  }

  return {
    waiver_request_id: waiver.id,
    status: waiver.status,
    consent_version: waiver.consent_version,
    retained_until: waiver.retained_until,
    ops_case_id: waiver.ops_case_id,
  };
}

export async function getRiskReportDownload(input: { story_id: string; risk_check_id: string }) {
  const story = await ensureStory(input.story_id);
  const report = await ensureRiskReportByRiskCheckId(input.risk_check_id);
  const download_body =
    (await readExportObjectStorageShadow({
      account_id: story.account_id,
      aggregate_key: "risk_report",
      object_key: report.object_key,
    })) ?? report.download_body;

  return {
    ...report,
    download_body,
  };
}

export async function getDeliveryManifestDownload(input: { story_id: string; job_id: string }) {
  const story = await ensureStory(input.story_id);
  const manifest = await ensureDeliveryManifestByJobId(input.job_id);
  const download_body =
    (await readExportObjectStorageShadow({
      account_id: story.account_id,
      aggregate_key: "delivery_manifest",
      object_key: manifest.object_key,
    })) ?? manifest.download_body;

  return {
    ...manifest,
    download_body,
  };
}

export async function getExportManifestDownload(input: { story_id: string; job_id: string }) {
  const story = await ensureStory(input.story_id);
  const exportRightsRepository = createExportRightsRepository();
  const job = await exportRightsRepository.findExportJobByStoryAndId(input.story_id, input.job_id);

  if (!job) {
    throw new Error(`Export job not found for export manifest ${input.job_id}`);
  }

  const riskCheck = await ensureRiskCheck(input.story_id, job.risk_check_id);
  const artifacts = await exportRightsRepository.listExportArtifactsByJob(input.job_id);
  const object_key = toExportManifestObjectKey(input.story_id, input.job_id);
  const shadowBody = await readCreativeArtifactObjectStorageShadow({
    account_id: story.account_id,
    aggregate_key: "export_manifest",
    object_key,
  });
  const file_body =
    shadowBody ??
    JSON.stringify(
      toExportManifestArtifact({
        job,
        risk_check: riskCheck,
        artifacts,
      }),
    );

  return {
    object_key,
    file_body,
  };
}

export async function getExportArtifactDownload(input: { artifact_id: string }) {
  const artifact = await createExportRightsRepository().findExportArtifactById(input.artifact_id);

  if (!artifact) {
    throw new Error(`Export artifact not found for id ${input.artifact_id}`);
  }

  const account_id = (await ensureStory(artifact.story_id)).account_id;
  const file_body =
    (await readExportObjectStorageShadow({
      account_id,
      aggregate_key: "export_artifact",
      object_key: artifact.object_key,
    })) ?? artifact.file_body;

  return {
    ...artifact,
    file_body,
  };
}

export async function getEvidencePackDownload(input: { pack_id: string }) {
  const pack = await createExportRightsRepository().findEvidencePackById(input.pack_id);

  if (!pack) {
    throw new Error(`Evidence pack not found for id ${input.pack_id}`);
  }

  const account_id = (await ensureStory(pack.story_id)).account_id;
  const download_body =
    (await readExportObjectStorageShadow({
      account_id,
      aggregate_key: "evidence_pack",
      object_key: pack.object_key,
    })) ?? pack.download_body;

  return {
    ...pack,
    download_body,
  };
}

export async function getRightsStatementDownload(input: { job_id: string }) {
  const job = await createExportRightsRepository().findExportJobById(input.job_id);

  if (!job || !job.rights_statement_body) {
    throw new Error(`Rights statement not found for export job ${input.job_id}`);
  }

  return job;
}

async function ensureStory(story_id: string) {
  const workspace = await createStoryWorkspaceRepository().findWorkspaceById(story_id);

  if (!workspace) {
    throw new Error(`Story workspace not found for id ${story_id}`);
  }

  return workspace;
}

async function ensureRiskCheck(story_id: string, risk_check_id: string) {
  const riskCheck = await createExportRightsRepository().findRiskCheckByStoryAndId(story_id, risk_check_id);

  if (!riskCheck) {
    throw new Error(`Risk check not found for id ${risk_check_id}`);
  }

  return riskCheck;
}

async function ensureRiskReportByRiskCheckId(risk_check_id: string) {
  const repository = createExportRightsRepository();
  const existing = await repository.findRiskReportByRiskCheckId(risk_check_id);

  if (existing) {
    return existing;
  }

  const riskCheck = await repository.findRiskCheckById(risk_check_id);

  if (!riskCheck) {
    throw new Error(`Risk check not found for risk report ${risk_check_id}`);
  }

  const report = await repository.createRiskReport(
    buildRiskReport({
      risk_check: riskCheck,
    }),
  );
  const story = await ensureStory(riskCheck.story_id);
  scheduleExportObjectStorageShadowUpload({
    account_id: story.account_id,
    aggregate_key: "risk_report",
    object_key: report.object_key,
    body: report.download_body,
    content_type: "application/json",
  });

  return report;
}

async function ensureDeliveryManifestByJobId(export_job_id: string) {
  const repository = createExportRightsRepository();
  const existing = await repository.findDeliveryManifestByJobId(export_job_id);

  if (existing) {
    return existing;
  }

  const job = await repository.findExportJobById(export_job_id);

  if (!job) {
    throw new Error(`Export job not found for delivery manifest ${export_job_id}`);
  }

  const riskCheck = await ensureRiskCheck(job.story_id, job.risk_check_id);
  const riskReport = await ensureRiskReportByRiskCheckId(job.risk_check_id);
  const waiver = await repository.findLabelWaiverRequestByExportJobId(export_job_id);
  const artifacts = await repository.listExportArtifactsByJob(export_job_id);
  const manifest = await repository.createDeliveryManifest(
    buildDeliveryManifest({
      story_id: job.story_id,
      job,
      artifacts,
      evidence_pack_id: job.evidence_pack_id,
      rights_statement_included: Boolean(job.rights_statement_body),
      risk_check: riskCheck,
      risk_report: riskReport,
      label_mode_effective: resolveEffectiveLabelMode({
        label_mode_preference: job.label_mode_preference,
        waiver_submitted: Boolean(waiver),
      }),
      export_manifest_object_key: toExportManifestObjectKey(job.story_id, export_job_id),
    }),
  );
  const story = await ensureStory(job.story_id);
  scheduleExportObjectStorageShadowUpload({
    account_id: story.account_id,
    aggregate_key: "delivery_manifest",
    object_key: manifest.object_key,
    body: manifest.download_body,
    content_type: "application/json",
  });
  await repository.saveExportJob({
    ...job,
    delivery_manifest_id: manifest.id,
    updated_at: new Date().toISOString(),
  });

  return manifest;
}

function getRiskReportDownloadUrl(story_id: string, risk_check_id: string) {
  return `${API_BASE_URL}/stories/${story_id}/rights/risk-reports/${risk_check_id}/download`;
}

function getDeliveryManifestDownloadUrl(story_id: string, job_id: string) {
  return `${API_BASE_URL}/stories/${story_id}/exports/${job_id}/delivery-manifest`;
}

function getExportManifestDownloadUrl(story_id: string, job_id: string) {
  return `${API_BASE_URL}/stories/${story_id}/exports/${job_id}/export-manifest`;
}

function resolveEffectiveLabelMode(input: {
  label_mode_preference: ExportJobRecord["label_mode_preference"];
  waiver_submitted: boolean;
}): ExportJobRecord["label_mode_preference"] {
  if (input.label_mode_preference === "label_waiver_requested" && input.waiver_submitted) {
    return "label_waiver_requested";
  }

  return "embedded_notice";
}

function buildExportControlResult(input: {
  job: ExportJobRecord;
  risk_check: RiskCheckRecord;
  waiver_submitted: boolean;
}) {
  const label_decision_state =
    input.job.label_mode_preference === "label_waiver_requested"
      ? input.waiver_submitted
        ? "waiver_submitted"
        : "waiver_pending"
      : "default_embedded";
  const required_actions = [...input.risk_check.required_actions];

  if (label_decision_state === "waiver_pending" && !required_actions.includes("submit_label_waiver")) {
    required_actions.push("submit_label_waiver");
  }

  return {
    verdict: input.risk_check.result,
    blocking: input.risk_check.result === "block",
    label_mode_effective: resolveEffectiveLabelMode({
      label_mode_preference: input.job.label_mode_preference,
      waiver_submitted: input.waiver_submitted,
    }),
    label_decision_state,
    required_actions,
    issue_codes: input.risk_check.issues.map((item) => item.code),
  } satisfies ExportJobDetailResponse["control_result"];
}

function toRiskReportView(input: {
  story_id: string;
  report: RiskReportRecord;
}) {
  return {
    report_id: input.report.id,
    risk_check_id: input.report.risk_check_id,
    manifest_version: input.report.manifest_version,
    result: input.report.result,
    label_mode_requested: input.report.label_mode_requested,
    issues: input.report.issues,
    required_actions: input.report.required_actions,
    valid_until: input.report.valid_until,
    created_at: input.report.created_at,
    download_url: getRiskReportDownloadUrl(input.story_id, input.report.risk_check_id),
  } satisfies RiskCheckResponse["risk_report"];
}

function toDeliveryManifestView(input: {
  story_id: string;
  manifest: DeliveryManifestRecord;
}) {
  return {
    manifest_id: input.manifest.id,
    manifest_version: input.manifest.manifest_version,
    label_mode_effective: input.manifest.label_mode_effective,
    entry_count: input.manifest.entry_count,
    download_url: getDeliveryManifestDownloadUrl(input.story_id, input.manifest.export_job_id),
  } satisfies ExportJobDetailResponse["delivery_manifest"];
}

async function listStoryObservabilityRecords(input: { account_id: string; story_id: string }) {
  const repository = createObservabilityRepository();
  const story_events = (await repository.listDomainEvents({
    account_id: input.account_id,
    limit: 1000,
  })).filter((item) => item.payload.story_id === input.story_id);
  const story_audits = (await repository.listAuditLogs({
    account_id: input.account_id,
    limit: 1000,
  })).filter((item) => item.payload.story_id === input.story_id);

  return {
    story_events,
    story_audits,
  };
}

function buildExportArtifacts(input: {
  story_id: string;
  export_job_id: string;
  story_title: string;
  chapters: ChapterRecord[];
  requested_formats: Array<"docx" | "epub" | "pdf" | "md" | "txt">;
}) {
  const storyBody = [...input.chapters]
    .sort((left, right) => left.chapter_no - right.chapter_no)
    .map((item) => `# ${item.title}\n\n${item.body_text}`)
    .join("\n\n");
  const now = new Date().toISOString();
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const formats = input.requested_formats.filter((item) => item !== "pdf");

  if (input.requested_formats.includes("pdf") && !formats.includes("md")) {
    formats.push("md");
  }

  return formats.map((format) => {
    const fileBody = buildArtifactBody({
      story_title: input.story_title,
      format,
      story_body: storyBody,
    });

    return {
      export_job_id: input.export_job_id,
      story_id: input.story_id,
      format,
      file_name: `${input.story_title}-${input.export_job_id}.${format}`,
      file_body: fileBody,
      file_size_mb: Number((Buffer.byteLength(fileBody, "utf8") / 1024 / 1024).toFixed(3)),
      object_key: `exports/${input.export_job_id}/${format}`,
      expires_at,
      status: "ready" as const,
      created_at: now,
    };
  });
}

function buildArtifactBody(input: {
  story_title: string;
  format: "docx" | "epub" | "md" | "txt";
  story_body: string;
}) {
  return `EXPORT FORMAT: ${input.format}\nTITLE: ${input.story_title}\n\n${input.story_body}`;
}

function resolveArtifactContentType(format: "docx" | "epub" | "pdf" | "md" | "txt") {
  switch (format) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "epub":
      return "application/epub+zip";
    case "pdf":
      return "application/pdf";
    case "md":
      return "text/markdown; charset=utf-8";
    case "txt":
      return "text/plain; charset=utf-8";
  }
}

function buildEvidencePack(input: {
  story_id: string;
  export_job_id: string;
  artifact_ids: string[];
  risk_check: RiskCheckRecord;
  story_events: EventLogRecord[];
  story_audits: AuditLogRecord[];
}) {
  const storyEvents = input.story_events.map((item, index) => ({
    record_id: `event-${index}-${item.created_at}`,
    record_type: "event_log" as const,
    label: item.event_name,
    created_at: item.created_at,
  }));
  const storyAudits = input.story_audits.map((item, index) => ({
    record_id: `audit-${index}-${item.created_at}`,
    record_type: "audit_log" as const,
    label: item.event_name,
    created_at: item.created_at,
  }));
  const riskRecord = [
    {
      record_id: `risk-${input.risk_check.id}`,
      record_type: "risk_check" as const,
      label: `risk:${input.risk_check.result}`,
      created_at: input.risk_check.created_at,
    },
  ];
  const artifactRecords = input.artifact_ids.map((artifactId, index) => ({
    record_id: `artifact-${index}-${artifactId}`,
    record_type: "artifact" as const,
    label: `artifact:${artifactId}`,
    created_at: new Date().toISOString(),
  }));
  const records = [...storyAudits, ...storyEvents, ...riskRecord, ...artifactRecords];
  const manifestBody = JSON.stringify(
    {
      manifest_version: "manifest_v1",
      story_id: input.story_id,
      export_job_id: input.export_job_id,
      records,
    },
    null,
    2,
  );

  return {
    export_job_id: input.export_job_id,
    story_id: input.story_id,
    manifest_version: "manifest_v1",
    record_count: records.length,
    object_key: `evidence-packs/${input.export_job_id}.json`,
    download_body: manifestBody,
    status: "ready" as const,
    records,
    created_at: new Date().toISOString(),
  };
}

function buildRiskReport(input: { risk_check: RiskCheckRecord }) {
  const download_body = JSON.stringify(
    {
      manifest_version: "risk_report_v1",
      story_id: input.risk_check.story_id,
      risk_check_id: input.risk_check.id,
      result: input.risk_check.result,
      label_mode_requested: input.risk_check.label_mode_requested,
      valid_until: input.risk_check.valid_until,
      required_actions: input.risk_check.required_actions,
      issues: input.risk_check.issues,
      created_at: input.risk_check.created_at,
    },
    null,
    2,
  );

  return {
    risk_check_id: input.risk_check.id,
    story_id: input.risk_check.story_id,
    manifest_version: "risk_report_v1" as const,
    object_key: `risk-reports/${input.risk_check.id}.json`,
    download_body,
    status: "ready" as const,
    result: input.risk_check.result,
    label_mode_requested: input.risk_check.label_mode_requested,
    issues: input.risk_check.issues,
    required_actions: input.risk_check.required_actions,
    valid_until: input.risk_check.valid_until,
    created_at: input.risk_check.created_at,
  };
}

function buildDeliveryManifest(input: {
  story_id: string;
  job: ExportJobRecord;
  artifacts: Array<{
    id: string;
    format: "docx" | "epub" | "pdf" | "md" | "txt";
    object_key: string;
  }>;
  evidence_pack_id: string | null;
  rights_statement_included: boolean;
  risk_check: RiskCheckRecord;
  risk_report: RiskReportRecord;
  label_mode_effective: "embedded_notice" | "label_waiver_requested";
  export_manifest_object_key: string;
}) {
  const entries: DeliveryManifestRecord["entries"] = [
    ...input.artifacts.map((artifact) => ({
      entry_type: "artifact" as const,
      label: `artifact:${artifact.format}`,
      ref_id: artifact.id,
      download_url: `${API_BASE_URL}/exports/artifacts/${artifact.id}/download`,
      object_key: artifact.object_key,
    })),
    {
      entry_type: "risk_report" as const,
      label: "risk_report",
      ref_id: input.risk_report.id,
      download_url: getRiskReportDownloadUrl(input.story_id, input.risk_check.id),
      object_key: input.risk_report.object_key,
    },
    {
      entry_type: "export_manifest" as const,
      label: "export_manifest",
      ref_id: input.job.id,
      download_url: getExportManifestDownloadUrl(input.story_id, input.job.id),
      object_key: input.export_manifest_object_key,
    },
  ];

  if (input.evidence_pack_id) {
    entries.push({
      entry_type: "evidence_bundle",
      label: "evidence_bundle",
      ref_id: input.evidence_pack_id,
      download_url: `${API_BASE_URL}/evidence-packs/${input.evidence_pack_id}/download`,
      object_key: `evidence-packs/${input.job.id}.json`,
    });
  }

  if (input.rights_statement_included) {
    entries.push({
      entry_type: "rights_statement",
      label: "rights_statement",
      ref_id: input.job.id,
      download_url: `${API_BASE_URL}/exports/jobs/${input.job.id}/rights-statement`,
      object_key: null,
    });
  }

  const download_body = JSON.stringify(
    {
      manifest_version: "delivery_manifest_v1",
      story_id: input.story_id,
      export_job_id: input.job.id,
      label_mode_effective: input.label_mode_effective,
      control_result: buildExportControlResult({
        job: input.job,
        risk_check: input.risk_check,
        waiver_submitted: input.label_mode_effective === "label_waiver_requested",
      }),
      entries,
    },
    null,
    2,
  );

  return {
    export_job_id: input.job.id,
    story_id: input.story_id,
    manifest_version: "delivery_manifest_v1" as const,
    label_mode_effective: input.label_mode_effective,
    entry_count: entries.length,
    object_key: `delivery-manifests/${input.job.id}.json`,
    download_body,
    status: "ready" as const,
    entries,
    created_at: new Date().toISOString(),
  };
}

function syncDeliveryManifestLabelDecision(
  manifest: DeliveryManifestRecord,
  nextLabelMode: "embedded_notice" | "label_waiver_requested",
) {
  let parsed: Record<string, unknown> = {};

  try {
    parsed = JSON.parse(manifest.download_body) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const nextBody = JSON.stringify(
    {
      ...parsed,
      manifest_version: "delivery_manifest_v1",
      export_job_id: manifest.export_job_id,
      label_mode_effective: nextLabelMode,
      control_result:
        parsed.control_result && typeof parsed.control_result === "object"
          ? {
              ...(parsed.control_result as Record<string, unknown>),
              label_mode_effective: nextLabelMode,
              label_decision_state: nextLabelMode === "label_waiver_requested" ? "waiver_submitted" : "default_embedded",
            }
          : undefined,
      entries: manifest.entries,
    },
    null,
    2,
  );

  return {
    ...manifest,
    label_mode_effective: nextLabelMode,
    download_body: nextBody,
  };
}

function buildRightsStatement(input: { story_title: string; export_purpose: string }) {
  return [
    `作品：${input.story_title}`,
    `用途：${input.export_purpose}`,
    "说明：本平台提供权利服务与留证辅助，不构成版权归属承诺。",
    "AIGC 标识：默认随工件附带 embedded notice。",
  ].join("\n");
}
