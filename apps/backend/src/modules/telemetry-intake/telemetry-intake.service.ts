import { AUDIT_REQUIRED_EVENTS, M1_FUNNEL_STEPS, type TelemetryPayload } from "@erliu/telemetry";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createObservabilityRepository } from "../../common/repositories/observability.repository.js";

const EXTRA_AUDIT_REQUIRED_EVENTS = new Set([
  "account_channel_bind_complete",
  "export_risk_check_complete",
  "export_start",
  "export_complete",
  "membership_purchase_start",
  "membership_purchase_complete",
  "sync_conflict_detected",
  "notification_preference_update",
  "policy_verdict_recorded",
  "privacy_data_request_submit",
  "rights_pack_generate",
  "rights_label_waiver_submit",
  "human_review_triggered",
  "beta_invite_redeemed",
  "beta_share_invites_issued",
  "beta_channel_bound",
]);

async function findAccountByToken(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

async function resolveAccountId(account_token?: string) {
  if (!account_token) {
    return null;
  }

  return (await findAccountByToken(account_token)).account_id;
}

export async function recordDomainEvent(input: {
  event_name: string;
  account_id: string;
  payload: TelemetryPayload;
}) {
  const repository = createObservabilityRepository();
  const recorded = await repository.appendDomainEvent({
    event_name: input.event_name,
    account_id: input.account_id,
    payload: input.payload,
    mirror_to_audit:
      AUDIT_REQUIRED_EVENTS.has(input.event_name) || EXTRA_AUDIT_REQUIRED_EVENTS.has(input.event_name),
  });

  return recorded.event_log;
}

export async function recordClientTelemetryEvent(input: {
  account_token: string;
  event_name: string;
  payload: TelemetryPayload;
}) {
  const account = await findAccountByToken(input.account_token);
  return recordDomainEvent({
    event_name: input.event_name,
    account_id: account.account_id,
    payload: input.payload,
  });
}

export async function listTelemetryFeed(input: {
  account_token?: string;
} = {}) {
  const account_id = await resolveAccountId(input.account_token);
  const repository = createObservabilityRepository();

  return {
    events: await repository.listDomainEvents({ account_id }),
    audit_logs: await repository.listAuditLogs({ account_id }),
  };
}

export async function getTelemetryFunnel(input: {
  account_token?: string;
} = {}) {
  const { events, audit_logs } = await listTelemetryFeed(input);
  const steps = M1_FUNNEL_STEPS.map((step) => {
    const matchingEvents = events.filter((item) => item.event_name === step.event_name);
    const matchingAuditLogs = audit_logs.filter((item) => item.event_name === step.event_name);

    return {
      step_key: step.step_key,
      label: step.label,
      event_name: step.event_name,
      count: matchingEvents.length,
      completed: matchingEvents.length > 0,
      audit_required: step.audit_required,
      audit_count: matchingAuditLogs.length,
    };
  });

  return {
    steps,
    totals: {
      event_count: events.length,
      audit_log_count: audit_logs.length,
      completed_step_count: steps.filter((item) => item.completed).length,
    },
  };
}
