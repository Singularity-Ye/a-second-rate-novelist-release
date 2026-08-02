import type { AppState } from "../../common/store.js";

export function ensureDerivedOpsCases(state: AppState) {
  for (const riskCheck of state.riskChecks) {
    if (riskCheck.result === "pass") {
      continue;
    }

    const story = state.storyWorkspaces.find((item) => item.id === riskCheck.story_id);
    ensureOpsCase(state, {
      case_type: "export_review",
      priority: riskCheck.result === "block" ? "P0" : "P1",
      entity_type: "risk_check",
      entity_id: riskCheck.id,
      account_id: story?.account_id ?? null,
      story_id: riskCheck.story_id,
      summary: `风险检查结果为 ${riskCheck.result}，需要 reviewer 复核导出与标识策略。`,
      source_ref: {
        ref_type: "risk_check",
        ref_id: riskCheck.id,
      },
    });
  }

  for (const exportJob of state.exportJobs) {
    if (exportJob.status !== "partial_failed") {
      continue;
    }

    ensureOpsCase(state, {
      case_type: "export_review",
      priority: "P1",
      entity_type: "export_job",
      entity_id: exportJob.id,
      account_id: exportJob.account_id,
      story_id: exportJob.story_id,
      summary: "导出出现部分失败，需要确认兜底工件与通知链路。",
      source_ref: {
        ref_type: "export_job",
        ref_id: exportJob.id,
      },
    });
  }

  for (const incident of state.alertIncidents) {
    if (incident.status === "resolved") {
      continue;
    }

    ensureOpsCase(state, {
      case_type: "environment_alert",
      priority: incident.severity === "critical" ? "P0" : "P1",
      entity_type: "alert_incident",
      entity_id: incident.incident_id,
      account_id: null,
      story_id: null,
      summary: incident.summary,
      source_ref: {
        ref_type: "alert_incident",
        ref_id: incident.incident_id,
      },
    });
  }
}

function ensureOpsCase(
  state: AppState,
  input: {
    case_type:
      | "export_review"
      | "risk_review"
      | "membership_exception"
      | "environment_alert"
      | "public_report"
      | "beta_support";
    priority: "P0" | "P1" | "P2";
    entity_type: string;
    entity_id: string;
    account_id: string | null;
    story_id: string | null;
    summary: string;
    source_ref: {
      ref_type: string;
      ref_id: string;
    };
  },
) {
  const existing = state.opsCases.find(
    (item) => item.source_ref.ref_type === input.source_ref.ref_type && item.source_ref.ref_id === input.source_ref.ref_id,
  );
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const created = {
    id: deriveOpsCaseId(input.source_ref.ref_type, input.source_ref.ref_id),
    case_type: input.case_type,
    priority: input.priority,
    owner_id: null,
    status: "open" as const,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    account_id: input.account_id,
    story_id: input.story_id,
    summary: input.summary,
    source_ref: input.source_ref,
    sla_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    created_at: now,
    updated_at: now,
  };
  state.opsCases.push(created);
  return created;
}

function deriveOpsCaseId(ref_type: string, ref_id: string) {
  return `ops-case:${ref_type}:${ref_id}`;
}
