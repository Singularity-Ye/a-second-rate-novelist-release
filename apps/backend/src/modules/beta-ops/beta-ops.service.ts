import { randomUUID } from "node:crypto";
import type {
  BetaIncidentBroadcastView,
  BetaSupportCaseCreateRequest,
  BetaSupportCaseResponse,
  BetaSupportCategory,
  BetaSupportOverviewResponse,
  BetaSupportStatus,
  OpsActorRole,
  OpsBetaIncidentCreateRequest,
  OpsBetaIncidentCreateResponse,
  OpsBetaIncidentResolveResponse,
  OpsBetaSupportOverviewResponse,
} from "@erliu/shared-contracts";
import { createAccountMembershipRepository } from "../../common/repositories/account-membership.repository.js";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createBetaAccessRepository } from "../../common/repositories/beta-access.repository.js";
import {
  createBetaOpsRepository,
  type BetaIncidentBroadcastRecord,
  type BetaSupportCaseRecord,
} from "../../common/repositories/beta-ops.repository.js";
import { createOpsControlRepository } from "../../common/repositories/ops-control.repository.js";
import { readAppState, writeAppState } from "../../common/store.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const H5_BASE_URL = process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";
const DEFAULT_PROGRAM_KEY = "external_beta_phase0";
const FEEDBACK_HISTORY_PATH = "/feedback?tab=history";

export async function createBetaSupportCase(input: BetaSupportCaseCreateRequest): Promise<BetaSupportCaseResponse> {
  const account = await ensureAccount(input.account_token);
  const repository = createBetaOpsRepository();
  const opsRepository = createOpsControlRepository();
  const membershipRepository = createAccountMembershipRepository();
  const now = new Date().toISOString();
  const case_id = randomUUID();

  const supportRecord = {
    id: case_id,
    account_id: account.account_id,
    story_id: input.story_id ?? null,
    ops_case_id: null,
    status: "submitted" as const,
    surface: input.surface,
    category: input.category,
    priority: getSupportPriority(input.category),
    summary: input.summary.trim(),
    description: input.description.trim(),
    target_object: {
      object_type: input.target_object.object_type,
      object_id: input.target_object.object_id,
      object_label: input.target_object.object_label ?? null,
    },
    latest_status_note: "已提交，等待 support 受理。",
    client_request_id: input.client_request_id,
    created_at: now,
    updated_at: now,
    sla_due_at: new Date(Date.now() + getSupportSlaHours(input.category) * 60 * 60 * 1000).toISOString(),
  };

  await repository.saveSupportCase(supportRecord);

  const opsCase = await opsRepository.createOpsCase({
    case_type: "beta_support",
    priority: supportRecord.priority,
    owner_id: null,
    status: "open",
    entity_type: "beta_support_case",
    entity_id: case_id,
    account_id: account.account_id,
    story_id: input.story_id ?? null,
    summary: `[${input.category}] ${supportRecord.summary}`,
    source_ref: {
      ref_type: "beta_support_case",
      ref_id: case_id,
    },
    sla_due_at: supportRecord.sla_due_at,
    created_at: now,
    updated_at: now,
  });

  const saved = await repository.saveSupportCase({
    ...supportRecord,
    ops_case_id: opsCase.id,
  });

  await membershipRepository.createNotification({
    account_id: account.account_id,
    story_id: input.story_id ?? "",
    title: "反馈已收到",
    body: "我们已经接住这个问题，会按 SLA 继续同步处理进度。",
    deep_link: `${H5_BASE_URL}${buildFeedbackHistoryPath()}`,
    status: "delivered",
    category: "system",
    source_type: "beta_support_case",
    source_id: case_id,
    created_at: now,
  });

  await recordDomainEvent({
    event_name: "beta_support_case_created",
    account_id: account.account_id,
    payload: {
      case_id,
      category: input.category,
      surface: input.surface,
    },
  });

  return toSupportCaseResponse(saved);
}

export async function getBetaSupportOverview(input: { account_token: string }): Promise<BetaSupportOverviewResponse> {
  const account = await ensureAccount(input.account_token);
  const repository = createBetaOpsRepository();
  const allCases = await repository.listSupportCases();
  const accountCases = await repository.listSupportCasesByAccount(account.account_id);
  const activeBetaAccounts = await countActiveBetaAccounts();
  const incidents = await listActiveIncidentBroadcasts();

  return {
    entry: {
      sla_copy: "P0 4 小时内响应，P1 24 小时内反馈，复杂问题进入持续同步。",
      support_hours_copy: "Beta 期每日 10:00-22:00 持续值守，停服/降级会第一时间广播。",
      history_url: buildFeedbackHistoryPath(),
    },
    active_incidents: incidents,
    cases: accountCases.map((item) => toSupportCaseResponse(item)),
    daily_digest: {
      active_beta_accounts: activeBetaAccounts,
      open_case_count: allCases.filter((item) => item.status === "submitted" || item.status === "triaged").length,
      pending_user_count: allCases.filter((item) => item.status === "pending_user").length,
      top_categories: topSupportCategories(allCases),
    },
  };
}

export async function getOpsBetaSupportOverview(input: {
  actor_role: OpsActorRole;
}): Promise<OpsBetaSupportOverviewResponse> {
  const repository = createBetaOpsRepository();
  const opsState = await createOpsControlRepository().readOpsViewState();
  const supportCases = await repository.listSupportCases();
  const opsCases = opsState.opsCases
    .filter((item) => item.case_type === "beta_support")
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  const now = Date.now();

  return {
    queue: {
      open: opsCases.filter((item) => item.status === "open" || item.status === "triaged").length,
      pending_user: opsCases.filter((item) => item.status === "pending_user").length,
      resolved_today: opsCases.filter((item) => item.status === "resolved" && isToday(item.updated_at)).length,
      overdue: opsCases.filter((item) => item.status !== "resolved" && new Date(item.sla_due_at).getTime() < now).length,
    },
    daily_digest: {
      active_beta_accounts: await countActiveBetaAccounts(),
      new_cases_today: supportCases.filter((item) => isToday(item.created_at)).length,
      followup_due_today: supportCases.filter(
        (item) => item.status === "pending_user" || (item.status !== "resolved" && isToday(item.sla_due_at)),
      ).length,
      top_categories: topSupportCategories(supportCases),
    },
    active_incidents: await listActiveIncidentBroadcasts(),
    recent_cases: opsCases.slice(0, 5).map((item) => ({
      case_id: item.id,
      case_type: "beta_support",
      status: item.status,
      priority: item.priority,
      summary: item.summary,
      owner_id: item.owner_id,
      sla_due_at: item.sla_due_at,
    })),
  };
}

export async function createBetaIncidentBroadcast(
  input: OpsBetaIncidentCreateRequest,
): Promise<OpsBetaIncidentCreateResponse> {
  const betaAccessRepository = createBetaAccessRepository();
  const repository = createBetaOpsRepository();
  const opsRepository = createOpsControlRepository();
  const membershipRepository = createAccountMembershipRepository();
  const created_at = new Date().toISOString();

  const alertIncident = await opsRepository.createAlertIncident({
    environment_key: "shared-dev",
    service: "beta-support",
    severity: input.severity,
    status: "open",
    release_id: null,
    summary: `${input.status}: ${input.headline}`,
    created_at,
  });

  const readyGrants = (await betaAccessRepository.listGrants()).filter(
    (item) => item.program_key === input.program_key && item.access_state === "ready",
  );
  const notification_ids: string[] = [];

  for (const grant of readyGrants) {
    const notification = await membershipRepository.createNotification({
      account_id: grant.account_id,
      story_id: "",
      title: input.headline,
      body: `${input.summary} ${input.recommended_action}`,
      deep_link: `${H5_BASE_URL}${buildFeedbackHistoryPath()}`,
      status: "delivered",
      category: "system",
      source_type: "beta_incident_broadcast",
      source_id: alertIncident.incident_id,
      created_at,
    });
    notification_ids.push(notification.id);

    await recordDomainEvent({
      event_name: "beta_incident_broadcast_delivered",
      account_id: grant.account_id,
      payload: {
        incident_id: alertIncident.incident_id,
        status: input.status,
      },
    });
  }

  await repository.saveIncidentBroadcast({
    incident_id: alertIncident.incident_id,
    alert_incident_id: alertIncident.incident_id,
    program_key: input.program_key,
    severity: input.severity,
    status: input.status,
    headline: input.headline.trim(),
    summary: input.summary.trim(),
    recommended_action: input.recommended_action.trim(),
    affected_surfaces: input.affected_surfaces,
    notification_ids,
    created_at,
    updated_at: created_at,
    resolved_at: null,
  });

  await opsRepository.createOpsAuditLog({
    actor_role: input.actor_role ?? "ops_support",
    action: "beta_incident_broadcast_create",
    entity_ref: {
      entity_type: "alert_incident",
      entity_id: alertIncident.incident_id,
    },
    payload: {
      incident_status: input.status,
      notified_account_count: readyGrants.length,
    },
    created_at,
  });

  return {
    incident_id: alertIncident.incident_id,
    status: input.status,
    created_at,
    notified_account_count: readyGrants.length,
  };
}

export async function resolveBetaIncidentBroadcast(input: {
  incident_id: string;
  actor_role?: OpsActorRole;
  actor_id?: string;
}): Promise<OpsBetaIncidentResolveResponse> {
  const repository = createBetaOpsRepository();
  const incident = await repository.findIncidentBroadcastById(input.incident_id);

  if (!incident) {
    throw new Error(`Beta incident not found for ${input.incident_id}`);
  }

  const resolved_at = new Date().toISOString();
  await repository.saveIncidentBroadcast({
    ...incident,
    status: "resolved",
    updated_at: resolved_at,
    resolved_at,
  });

  const state = await readAppState();
  const alertIndex = state.alertIncidents.findIndex((item) => item.incident_id === input.incident_id);
  if (alertIndex >= 0) {
    state.alertIncidents[alertIndex] = {
      ...state.alertIncidents[alertIndex]!,
      status: "resolved",
    };
  }

  const derivedOpsCaseId = `ops-case:alert_incident:${input.incident_id}`;
  const derivedCaseIndex = state.opsCases.findIndex((item) => item.id === derivedOpsCaseId);
  if (derivedCaseIndex >= 0) {
    state.opsCases[derivedCaseIndex] = {
      ...state.opsCases[derivedCaseIndex]!,
      status: "resolved",
      updated_at: resolved_at,
      owner_id: input.actor_id ?? "ops-beta-incident",
    };
  }
  await writeAppState(state);

  await createOpsControlRepository().createOpsAuditLog({
    actor_role: input.actor_role ?? "ops_support",
    action: "beta_incident_broadcast_resolve",
    entity_ref: {
      entity_type: "alert_incident",
      entity_id: input.incident_id,
    },
    payload: {
      status: "resolved",
    },
    created_at: resolved_at,
  });

  return {
    incident_id: input.incident_id,
    status: "resolved",
    resolved_at,
  };
}

export async function syncBetaSupportCaseWithOpsDecision(input: {
  ops_case_id: string;
  ops_status: "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected";
  note: string;
}) {
  const repository = createBetaOpsRepository();
  const existing = await repository.findSupportCaseByOpsCaseId(input.ops_case_id);

  if (!existing) {
    return null;
  }

  const updated = await repository.saveSupportCase({
    ...existing,
    status: toSupportStatus(input.ops_status),
    latest_status_note: input.note,
    updated_at: new Date().toISOString(),
  });

  return updated;
}

function getSupportPriority(category: BetaSupportCategory) {
  if (category === "delivery_blocker" || category === "onboarding_blocker") {
    return "P0" as const;
  }
  if (category === "channel_sync" || category === "billing_membership") {
    return "P1" as const;
  }
  return "P1" as const;
}

function getSupportSlaHours(category: BetaSupportCategory) {
  if (category === "delivery_blocker" || category === "onboarding_blocker") {
    return 4;
  }
  if (category === "channel_sync") {
    return 12;
  }
  return 24;
}

function toSupportStatus(
  status: "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected",
): BetaSupportStatus {
  switch (status) {
    case "triaged":
    case "pending_review":
      return "triaged";
    case "pending_user":
      return "pending_user";
    case "resolved":
      return "resolved";
    case "rejected":
      return "rejected";
    default:
      return "submitted";
  }
}

function toSupportCaseResponse(
  input: BetaSupportCaseRecord,
): BetaSupportCaseResponse {
  return {
    case_type: "beta_support",
    case_id: input.id,
    ops_case_id: input.ops_case_id ?? "",
    status: input.status,
    surface: input.surface,
    category: input.category,
    priority: input.priority,
    summary: input.summary,
    description: input.description,
    target_object: input.target_object,
    latest_status_note: input.latest_status_note,
    created_at: input.created_at,
    updated_at: input.updated_at,
    sla_due_at: input.sla_due_at,
    target_route: buildFeedbackHistoryPath(),
  };
}

async function listActiveIncidentBroadcasts(): Promise<BetaIncidentBroadcastView[]> {
  const repository = createBetaOpsRepository();
  return (await repository.listIncidentBroadcasts())
    .filter((item) => item.status !== "resolved")
    .map(toIncidentView);
}

function toIncidentView(
  input: BetaIncidentBroadcastRecord,
): BetaIncidentBroadcastView {
  return {
    incident_id: input.incident_id,
    severity: input.severity,
    status: input.status,
    headline: input.headline,
    summary: input.summary,
    recommended_action: input.recommended_action,
    created_at: input.created_at,
    updated_at: input.updated_at,
    resolved_at: input.resolved_at,
  };
}

async function ensureAccount(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);
  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }
  return account;
}

async function countActiveBetaAccounts() {
  return (await createBetaAccessRepository().listGrants()).filter((item) => item.access_state === "ready").length;
}

function topSupportCategories(
  items: Array<{
    category: BetaSupportCategory;
  }>,
): BetaSupportCategory[] {
  const entries = Array.from(
    items.reduce((accumulator, item) => {
      accumulator.set(item.category, (accumulator.get(item.category) ?? 0) + 1);
      return accumulator;
    }, new Map<BetaSupportCategory, number>()),
  );

  return entries
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([category]) => category);
}

function buildFeedbackHistoryPath() {
  return FEEDBACK_HISTORY_PATH;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}
