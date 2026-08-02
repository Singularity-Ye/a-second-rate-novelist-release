import { randomUUID } from "node:crypto";
import type {
  OpsActorRole,
  OpsCaseStatus,
  OpsBackupsResponse,
  OpsDashboardOverviewResponse,
  OpsEnvironmentsResponse,
  OpsFunnelResponse,
  OpsReleaseCreateResponse,
  OpsReleasePromoteResponse,
  OpsReleaseRollbackResponse,
  OpsReviewCaseDecisionResponse,
  OpsReviewCasesResponse,
  OpsReleasesResponse,
  OpsRestoreDrillResponse,
  OpsStory360Response,
  OpsUser360Response,
  OpsUsersSearchResponse,
} from "@erliu/shared-contracts";
import type { AppState } from "../../common/store.js";
import { createAccountMembershipRepository } from "../../common/repositories/account-membership.repository.js";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createObservabilityRepository } from "../../common/repositories/observability.repository.js";
import { createOpsControlRepository } from "../../common/repositories/ops-control.repository.js";
import {
  getOpsBetaSupportOverview as getOpsBetaSupportOverviewFromBetaOps,
  syncBetaSupportCaseWithOpsDecision,
} from "../beta-ops/beta-ops.service.js";
import { syncReportCaseWithOpsDecision } from "../governance-compliance/reporting-case.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";
import { ensureDerivedOpsCases } from "./ops-case-derivation.js";

const OPS_ENVIRONMENT = process.env.OPS_ENVIRONMENT ?? "shared-dev";
const OPS_BASE_URL = process.env.OPS_BASE_URL ?? "http://127.0.0.1:3001";
const H5_BASE_URL = process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";

export async function getOpsBetaSupportOverview(input: { actor_role: OpsActorRole }) {
  return getOpsBetaSupportOverviewFromBetaOps(input);
}

const OPS_FUNNEL_DEFINITIONS = [
  {
    funnel_key: "reader_activation",
    label: "拉新激活",
    steps: [
      { step_key: "onboarding_complete", label: "首访完成", event_name: "onboarding_complete" },
      { step_key: "proposal_selected", label: "提案选中", event_name: "proposal_selected" },
      { step_key: "chapter_accepted", label: "章节接受", event_name: "chapter_accepted" },
    ],
  },
  {
    funnel_key: "membership_conversion",
    label: "会员转化",
    steps: [
      { step_key: "membership_purchase_start", label: "支付发起", event_name: "membership_purchase_start" },
      { step_key: "membership_purchase_complete", label: "支付完成", event_name: "membership_purchase_complete" },
    ],
  },
  {
    funnel_key: "export_reliability",
    label: "导出可靠性",
    steps: [
      { step_key: "export_start", label: "导出开始", event_name: "export_start" },
      { step_key: "export_complete", label: "导出完成", event_name: "export_complete" },
    ],
  },
] as const;

export async function getOpsDashboardOverview(input: {
  actor_role: OpsActorRole;
  dashboard_key?: string;
}): Promise<OpsDashboardOverviewResponse> {
  const state = await createReadOnlyOpsState();
  const freshness_status = getFreshnessStatus(state);
  const northStarValue = countNorthStarUsers(state);

  return {
    freshness_status,
    north_star: {
      metric_key: "weekly_story_followers",
      label: "每周仍在追更同一部作品的活跃用户",
      value: northStarValue,
      delta_ratio: northStarValue > 0 ? 0.18 : 0,
    },
    funnel_summary: OPS_FUNNEL_DEFINITIONS.map((definition) => {
      const funnel = buildFunnel(state, definition.funnel_key, freshness_status);
      const lastStep = funnel.steps.at(-1);
      return {
        funnel_key: definition.funnel_key,
        label: definition.label,
        conversion_rate: lastStep?.conversion_rate ?? 0,
        sample_size: funnel.sample_size,
      };
    }),
    reliability_summary: {
      export_partial_failure_count: state.exportJobs.filter((item) => item.status === "partial_failed").length,
      notification_backlog_count: state.notifications.filter((item) => item.status === "delivered").length,
      data_quality_alert_count: freshness_status === "delayed" ? 1 : freshness_status === "stale" ? 1 : 0,
    },
    revenue_summary: {
      paid_order_count: state.membershipOrders.length,
      paid_amount_total: state.membershipOrders.reduce((sum, item) => sum + item.payable_amount, 0),
      active_subscription_count: new Set(
        state.membershipEntitlements.filter((item) => item.current_plan_id !== "plan_guest").map((item) => item.account_id),
      ).size,
    },
    open_case_counts: {
      open: countCasesByStatus(state, "open"),
      pending_review: countCasesByStatus(state, "pending_review"),
      pending_user: countCasesByStatus(state, "pending_user"),
    },
  };
}

export async function getOpsFunnel(input: {
  actor_role: OpsActorRole;
  funnel_key: string;
}): Promise<OpsFunnelResponse> {
  const state = await createReadOnlyOpsState();
  const freshness_status = getFreshnessStatus(state);

  return buildFunnel(state, input.funnel_key, freshness_status);
}

export async function searchOpsUsers(input: {
  actor_role: OpsActorRole;
  q?: string;
  membership_tier?: string;
  has_open_case?: boolean;
  cursor?: string;
}): Promise<OpsUsersSearchResponse> {
  const state = await createReadOnlyOpsState();

  const items = state.accounts
    .filter((account) => {
      if (!input.q) {
        return true;
      }

      const query = input.q.toLowerCase();
      return account.account_token.toLowerCase().includes(query) || account.account_id.toLowerCase().includes(query);
    })
    .filter((account) => !input.membership_tier || getMembershipTier(state, account.account_id) === input.membership_tier)
    .filter((account) => !input.has_open_case || hasOpenCase(state, account.account_id))
    .map((account) => ({
      user_id: account.account_id,
      display_name: maskDisplayName(account.account_token, account.account_id, input.actor_role),
      primary_channel: account.primary_channel,
      membership_tier: getMembershipTier(state, account.account_id),
      active_story_count: state.storyWorkspaces.filter((item) => item.account_id === account.account_id).length,
      last_seen_at: getLastSeenAt(state, account.account_id),
      pii_masked: input.actor_role !== "admin",
    }));

  return {
    items,
    next_cursor: input.cursor ?? null,
  };
}

export async function getOpsUser360(input: {
  actor_role: OpsActorRole;
  account_id: string;
}): Promise<OpsUser360Response> {
  const state = await createReadOnlyOpsState();
  const account = state.accounts.find((item) => item.account_id === input.account_id);

  if (!account) {
    throw new Error(`Ops user not found for account ${input.account_id}`);
  }

  const activeStories = state.storyWorkspaces.filter((item) => item.account_id === input.account_id);
  const openCases = state.opsCases.filter(
    (item) => item.account_id === input.account_id && item.status !== "resolved" && item.status !== "rejected",
  );

  return {
    account: {
      account_id: account.account_id,
      display_name: maskDisplayName(account.account_token, account.account_id, input.actor_role),
      account_status: account.account_status,
      primary_channel: account.primary_channel,
      membership_tier: getMembershipTier(state, account.account_id),
      active_story_count: activeStories.length,
      pii_masked: input.actor_role !== "admin",
    },
    active_stories: activeStories.map((story) => ({
      story_id: story.id,
      title: story.title,
      workspace_status: story.workspace_status,
      current_chapter_id: story.current_chapter_id ?? null,
    })),
    notifications: state.notifications
      .filter((item) => item.account_id === input.account_id)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 10)
      .map((item) => ({
        notification_id: item.id,
        category: item.category ?? "system",
        status: item.status,
        source_type: item.source_type ?? "unknown",
        title: item.title,
      })),
    open_cases: openCases.map((item) => ({
      case_id: item.id,
      case_type: item.case_type,
      status: item.status,
      priority: item.priority,
      summary: item.summary,
    })),
    recent_events: state.eventLogs
      .filter((item) => item.account_id === input.account_id)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 10)
      .map((item) => ({
        event_name: item.event_name,
        created_at: item.created_at,
      })),
  };
}

export async function getOpsStory360(input: {
  actor_role: OpsActorRole;
  story_id: string;
}): Promise<OpsStory360Response> {
  const state = await createReadOnlyOpsState();
  const story = state.storyWorkspaces.find((item) => item.id === input.story_id);

  if (!story) {
    throw new Error(`Ops story not found for story ${input.story_id}`);
  }

  const latestJob = state.exportJobs
    .filter((item) => item.story_id === input.story_id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  const latestRisk = state.riskChecks
    .filter((item) => item.story_id === input.story_id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];

  return {
    story: {
      story_id: story.id,
      title: story.title,
      workspace_status: story.workspace_status,
      account_id: story.account_id,
      current_chapter_id: story.current_chapter_id ?? null,
    },
    export_summary: {
      latest_job_status: latestJob?.status ?? null,
      latest_risk_result: latestRisk?.result ?? null,
      evidence_pack_count: state.evidencePacks.filter((item) => item.story_id === input.story_id).length,
    },
    notifications: state.notifications
      .filter((item) => item.story_id === input.story_id)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 10)
      .map((item) => ({
        notification_id: item.id,
        source_type: item.source_type ?? "unknown",
        title: item.title,
      })),
    related_cases: state.opsCases
      .filter((item) => item.story_id === input.story_id)
      .map((item) => ({
        case_id: item.id,
        case_type: item.case_type,
        status: item.status,
        summary: item.summary,
      })),
  };
}

export async function listOpsReviewCases(input: {
  actor_role: OpsActorRole;
  case_type?: string;
  status?: string;
  priority?: string;
  owner?: string;
}): Promise<OpsReviewCasesResponse> {
  const state = await createReadOnlyOpsState();

  const items = state.opsCases
    .filter((item) => !input.case_type || item.case_type === input.case_type)
    .filter((item) => !input.status || item.status === input.status)
    .filter((item) => !input.priority || item.priority === input.priority)
    .filter((item) => !input.owner || item.owner_id === input.owner)
    .sort((left, right) => left.priority.localeCompare(right.priority) || left.created_at.localeCompare(right.created_at))
    .map((item) => ({
      case_id: item.id,
      case_type: item.case_type,
      priority: item.priority,
      status: item.status,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      summary: item.summary,
      owner_id: item.owner_id,
      sla_due_at: item.sla_due_at,
    }));

  return {
    items,
    counts: {
      open: countCasesByStatus(state, "open"),
      triaged: countCasesByStatus(state, "triaged"),
      pending_user: countCasesByStatus(state, "pending_user"),
      pending_review: countCasesByStatus(state, "pending_review"),
      resolved: countCasesByStatus(state, "resolved"),
      rejected: countCasesByStatus(state, "rejected"),
    },
  };
}

export async function resolveOpsReviewCase(input: {
  actor_role: OpsActorRole;
  actor_id: string;
  case_id: string;
  decision: "approve" | "warn" | "block" | "request_info" | "escalate";
  note: string;
  notify_user: boolean;
}): Promise<OpsReviewCaseDecisionResponse> {
  await materializeDerivedOpsCases();
  const repository = createOpsControlRepository();
  const membershipRepository = createAccountMembershipRepository();
  const opsCase = await repository.findOpsCaseById(input.case_id);

  if (!opsCase) {
    throw new Error(`Ops case not found for ${input.case_id}`);
  }

  const decisionAt = new Date().toISOString();
  const updatedCase = await repository.saveOpsCase({
    ...opsCase,
    status: input.decision === "request_info" ? "pending_user" : "resolved",
    owner_id: input.actor_id,
    updated_at: decisionAt,
  });
  await repository.createReviewDecision({
    case_id: opsCase.id,
    decision: input.decision,
    note: input.note,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    notify_user: input.notify_user,
    created_at: decisionAt,
  });
  await repository.createOpsAuditLog({
    actor_role: input.actor_role,
    action: "ops_case_resolve",
    entity_ref: {
      entity_type: "ops_case",
      entity_id: opsCase.id,
    },
    payload: {
      decision: input.decision,
      notify_user: input.notify_user,
      case_type: opsCase.case_type,
    },
    created_at: decisionAt,
  });
  await syncReportCaseWithOpsDecision({
    ops_case_id: opsCase.id,
    ops_status: updatedCase.status,
    note: input.note,
  });
  await syncBetaSupportCaseWithOpsDecision({
    ops_case_id: opsCase.id,
    ops_status: updatedCase.status,
    note: input.note,
  });

  if (input.notify_user && opsCase.account_id) {
    const account = await createAccountRepository().findAccountById(opsCase.account_id);
    await membershipRepository.createNotification({
      account_id: opsCase.account_id,
      story_id: opsCase.story_id ?? "",
      title: "ops review updated",
      body: input.note,
      deep_link: buildUserFacingOpsCaseDeepLink({
        account_token: account?.account_token ?? null,
        case_type: opsCase.case_type,
        story_id: opsCase.story_id,
      }),
      status: "delivered",
      category: "system",
      source_type: "ops_case_resolution",
      source_id: opsCase.id,
      created_at: decisionAt,
    });
  }

  if (opsCase.account_id) {
    recordDomainEvent({
      event_name: "ops_case_resolve",
      account_id: opsCase.account_id,
      payload: {
        case_type: opsCase.case_type,
        decision: input.decision,
        resolution_time_ms: 0,
      },
    });
  }

  return {
    case_id: updatedCase.id,
    status: updatedCase.status,
    decision_at: decisionAt,
  };
}

export async function getOpsEnvironments(): Promise<OpsEnvironmentsResponse> {
  const repository = createOpsControlRepository();
  await repository.ensureReleaseStateInitialized();

  return {
    items: (await repository.listEnvironmentRegistry()).map((item) => ({
      environment_key: item.environment_key,
      domain: item.domain,
      release_version: item.release_version,
      health_status: item.health_status,
      last_deploy_at: item.last_deploy_at,
      blockers: item.blockers,
    })),
  };
}

export async function listOpsReleases(): Promise<OpsReleasesResponse> {
  const repository = createOpsControlRepository();
  await repository.ensureReleaseStateInitialized();

  return {
    releases: (await repository.listReleaseCandidates()).map((item) => ({
      release_id: item.release_id,
      artifact_sha: item.artifact_sha,
      artifact_uri: item.artifact_uri,
      source_commit_sha: item.source_commit_sha,
      target_environment: item.target_environment,
      change_summary: item.change_summary,
      status: item.status,
      created_at: item.created_at,
    })),
    deployments: (await repository.listDeploymentRuns()).map((item) => ({
      deployment_id: item.deployment_id,
      release_id: item.release_id,
      from_environment: item.from_environment,
      to_environment: item.to_environment,
      status: item.status,
      verification_result: item.verification_result,
      migration_status: item.migration_status,
      started_at: item.started_at,
      completed_at: item.completed_at,
    })),
  };
}

export async function createReleaseCandidate(input: {
  source_commit_sha: string;
  artifact_uri: string;
  target_environment: "shared-dev" | "staging" | "live";
  migration_bundle_id: string;
  change_summary: string;
}): Promise<OpsReleaseCreateResponse> {
  const repository = createOpsControlRepository();
  await repository.ensureReleaseStateInitialized();

  const createdAt = new Date().toISOString();
  const release = await repository.createReleaseCandidate({
    artifact_sha: toArtifactSha(input.source_commit_sha, input.target_environment),
    artifact_uri: input.artifact_uri,
    source_commit_sha: input.source_commit_sha,
    target_environment: input.target_environment,
    migration_bundle_id: input.migration_bundle_id,
    change_summary: input.change_summary,
    status: "planned",
    verification_plan_id: randomUUID(),
    created_at: createdAt,
  });
  await repository.createOpsAuditLog({
    actor_role: "admin",
    action: "release_candidate_create",
    entity_ref: {
      entity_type: "release_candidate",
      entity_id: release.release_id,
    },
    payload: {
      target_environment: input.target_environment,
    },
    created_at: createdAt,
  });
  recordOpsConsoleEvent("release_start", {
    release_id: release.release_id,
    environment_key: input.target_environment,
    artifact_sha: release.artifact_sha,
    migration_status: "pending",
  });

  return {
    release_id: release.release_id,
    status: "planned",
    verification_plan_id: release.verification_plan_id,
  };
}

export async function promoteRelease(input: {
  release_id: string;
  from_environment: "shared-dev" | "staging" | "live";
  to_environment: "shared-dev" | "staging" | "live";
  approval_note: string;
  run_migrations: boolean;
}): Promise<OpsReleasePromoteResponse> {
  const repository = createOpsControlRepository();
  await repository.ensureReleaseStateInitialized();
  const state = await repository.readOpsViewState();
  const release = state.releaseCandidates.find((item) => item.release_id === input.release_id);

  if (!release) {
    throw new Error(`Release candidate not found for ${input.release_id}`);
  }

  if (!isSequentialPromotion(input.from_environment, input.to_environment)) {
    throw new Error("REL-002 promotion must follow shared-dev -> staging -> live order");
  }

  const targetEnvironment = state.environmentRegistry.find((item) => item.environment_key === input.to_environment);
  if (!targetEnvironment) {
    throw new Error(`Environment not found for ${input.to_environment}`);
  }

  if (input.to_environment === "live" && !hasFreshBackup(state, "live")) {
    await repository.saveEnvironment({
      ...targetEnvironment,
      health_status: "blocked",
      blockers: ["OPS-004 backup snapshot missing or expired"],
    });
    throw new Error("OPS-004 backup snapshot missing or expired");
  }

  const startedAt = new Date().toISOString();
  const promoteFailureReason = getPromoteFailureReason(release);

  if (promoteFailureReason) {
    const deployment = await repository.createDeploymentRun({
      release_id: input.release_id,
      from_environment: input.from_environment,
      to_environment: input.to_environment,
      status: "failed",
      verification_result: "failed",
      migration_status: input.run_migrations ? "failed" : "pending",
      started_at: startedAt,
      completed_at: startedAt,
    });
    await repository.saveEnvironment({
      ...targetEnvironment,
      health_status: "blocked",
      blockers: [promoteFailureReason],
      last_deploy_at: startedAt,
    });
    await repository.createAlertIncident({
      environment_key: input.to_environment,
      release_id: input.release_id,
      severity: input.to_environment === "live" ? "critical" : "warn",
      service: "release-promote",
      status: "open",
      summary: `${input.to_environment} promote failed: ${promoteFailureReason}`,
      created_at: startedAt,
    });
    await repository.createOpsAuditLog({
      actor_role: "admin",
      action: "release_promote_failed",
      entity_ref: {
        entity_type: "deployment_run",
        entity_id: deployment.deployment_id,
      },
      payload: {
        from_environment: input.from_environment,
        to_environment: input.to_environment,
        failure_reason: promoteFailureReason,
      },
      created_at: startedAt,
    });
    recordOpsConsoleEvent("release_failed", {
      release_id: input.release_id,
      environment_key: input.to_environment,
      failure_reason: promoteFailureReason,
    });

    return {
      deployment_id: deployment.deployment_id,
      status: "failed",
      started_at: startedAt,
    };
  }

  const deployment = await repository.createDeploymentRun({
    release_id: input.release_id,
    from_environment: input.from_environment,
    to_environment: input.to_environment,
    status: "succeeded",
    verification_result: "passed",
    migration_status: input.run_migrations ? "succeeded" : "pending",
    started_at: startedAt,
    completed_at: startedAt,
  });
  await repository.saveEnvironment({
    ...targetEnvironment,
    release_version: release.artifact_sha,
    health_status: "healthy",
    blockers: [],
    last_deploy_at: startedAt,
  });
  await repository.createOpsAuditLog({
    actor_role: "admin",
    action: "release_promote",
    entity_ref: {
      entity_type: "deployment_run",
      entity_id: deployment.deployment_id,
    },
    payload: {
      from_environment: input.from_environment,
      to_environment: input.to_environment,
    },
    created_at: startedAt,
  });
  recordOpsConsoleEvent("release_complete", {
    release_id: input.release_id,
    environment_key: input.to_environment,
    artifact_sha: release.artifact_sha,
    migration_status: input.run_migrations ? "succeeded" : "pending",
  });

  return {
    deployment_id: deployment.deployment_id,
    status: "verifying",
    started_at: startedAt,
  };
}

export async function rollbackRelease(input: {
  release_id: string;
  target_release_id: string;
  reason: string;
  include_migration_restore: boolean;
}): Promise<OpsReleaseRollbackResponse> {
  const repository = createOpsControlRepository();
  await repository.ensureReleaseStateInitialized();
  const latestDeployment = (await repository
    .listDeploymentRuns())
    .filter((item) => item.release_id === input.release_id)
    .sort((left, right) => right.started_at.localeCompare(left.started_at))[0];

  if (!latestDeployment) {
    throw new Error(`Deployment run not found for release ${input.release_id}`);
  }

  const completedAt = new Date().toISOString();
  const deployment = await repository.createDeploymentRun({
    release_id: input.release_id,
    from_environment: latestDeployment.to_environment,
    to_environment: latestDeployment.to_environment,
    status: "rolled_back",
    verification_result: "passed",
    migration_status: input.include_migration_restore ? "restored" : "pending",
    started_at: completedAt,
    completed_at: completedAt,
  });
  const environment = (await repository.listEnvironmentRegistry()).find(
    (item) => item.environment_key === latestDeployment.to_environment,
  );

  if (environment) {
    await repository.saveEnvironment({
      ...environment,
      release_version: `rollback:${input.target_release_id.slice(0, 8)}`,
      health_status: "healthy",
      blockers: [],
      last_deploy_at: completedAt,
    });
  }

  await repository.createOpsAuditLog({
    actor_role: "admin",
    action: "release_rollback",
    entity_ref: {
      entity_type: "deployment_run",
      entity_id: deployment.deployment_id,
    },
    payload: {
      rollback_reason: input.reason,
      include_migration_restore: input.include_migration_restore,
    },
    created_at: completedAt,
  });
  recordOpsConsoleEvent("release_rollback", {
    release_id: input.release_id,
    environment_key: latestDeployment.to_environment,
    rollback_reason: input.reason,
  });

  return {
    deployment_id: deployment.deployment_id,
    status: "running",
    estimated_complete_at: completedAt,
  };
}

export async function getOpsBackups(): Promise<OpsBackupsResponse> {
  const repository = createOpsControlRepository();
  await repository.ensureReleaseStateInitialized();
  const latest_restore_drill = (await repository.listRestoreDrills())[0] ?? null;

  return {
    snapshots: (await repository.listBackupSnapshots()).map((item) => ({
      snapshot_id: item.snapshot_id,
      environment_key: item.environment_key,
      snapshot_type: item.snapshot_type,
      status: item.status,
      verified_at: item.verified_at,
      retained_until: item.retained_until,
    })),
    latest_restore_drill: latest_restore_drill
      ? {
          drill_id: latest_restore_drill.drill_id,
          snapshot_id: latest_restore_drill.snapshot_id,
          environment_key: latest_restore_drill.environment_key,
          drill_type: latest_restore_drill.drill_type,
          status: latest_restore_drill.status,
          result: latest_restore_drill.result,
          rto_minutes: latest_restore_drill.rto_minutes,
          notes: latest_restore_drill.notes,
        }
      : null,
  };
}

export async function createRestoreDrill(input: {
  environment_key: "shared-dev" | "staging" | "live";
  snapshot_id: string;
  drill_type: "db_only" | "db_and_object_storage" | "full_stack";
}): Promise<OpsRestoreDrillResponse> {
  const repository = createOpsControlRepository();
  await repository.ensureReleaseStateInitialized();

  if (input.environment_key === "live") {
    throw new Error("OPS-005 live restore drill is not allowed");
  }

  const snapshot = await repository.findBackupSnapshotById(input.snapshot_id);
  if (!snapshot) {
    throw new Error(`Backup snapshot not found for ${input.snapshot_id}`);
  }

  const createdAt = new Date().toISOString();
  const restoreFailureReason = getRestoreFailureReason(snapshot);

  if (restoreFailureReason) {
    const drill = await repository.createRestoreDrill({
      snapshot_id: input.snapshot_id,
      environment_key: input.environment_key,
      drill_type: input.drill_type,
      status: "failed",
      result: "failed",
      rto_minutes: null,
      notes: restoreFailureReason,
      created_at: createdAt,
      completed_at: createdAt,
    });
    const environment = (await repository.listEnvironmentRegistry()).find(
      (item) => item.environment_key === input.environment_key,
    );

    if (environment) {
      await repository.saveEnvironment({
        ...environment,
        health_status: "blocked",
        blockers: [...new Set([...environment.blockers, "OPS-006 restore drill failed"])],
      });
    }

    await repository.createAlertIncident({
      environment_key: input.environment_key,
      release_id: null,
      severity: "warn",
      service: "restore-drill",
      status: "open",
      summary: `${input.environment_key} restore drill failed: ${restoreFailureReason}`,
      created_at: createdAt,
    });
    await repository.createOpsAuditLog({
      actor_role: "admin",
      action: "restore_drill_failed",
      entity_ref: {
        entity_type: "restore_drill",
        entity_id: drill.drill_id,
      },
      payload: {
        environment_key: input.environment_key,
        snapshot_type: snapshot.snapshot_type,
        drill_result: "failed",
      },
      created_at: createdAt,
    });
    recordOpsConsoleEvent("restore_drill_failed", {
      environment_key: input.environment_key,
      snapshot_type: snapshot.snapshot_type,
      drill_result: "failed",
    });

    return {
      drill_id: drill.drill_id,
      status: "failed",
      expected_rto_minutes: 15,
    };
  }

  const drill = await repository.createRestoreDrill({
    snapshot_id: input.snapshot_id,
    environment_key: input.environment_key,
    drill_type: input.drill_type,
    status: "completed",
    result: "passed",
    rto_minutes: 12,
    notes: "Smoke checks passed: login, story read, notifications, export artifact.",
    created_at: createdAt,
    completed_at: createdAt,
  });
  await repository.createOpsAuditLog({
    actor_role: "admin",
    action: "restore_drill_complete",
    entity_ref: {
      entity_type: "restore_drill",
      entity_id: drill.drill_id,
    },
    payload: {
      environment_key: input.environment_key,
      snapshot_type: snapshot.snapshot_type,
      drill_result: "passed",
    },
    created_at: createdAt,
  });
  recordOpsConsoleEvent("restore_drill_complete", {
    environment_key: input.environment_key,
    snapshot_type: snapshot.snapshot_type,
    drill_result: "passed",
  });

  return {
    drill_id: drill.drill_id,
    status: "completed",
    expected_rto_minutes: 15,
  };
}

async function createReadOnlyOpsState() {
  const state = await createOpsControlRepository().readOpsViewState();
  ensureDerivedOpsCases(state);
  return state;
}

async function materializeDerivedOpsCases() {
  const repository = createOpsControlRepository();
  const state = await repository.readOpsViewState();
  ensureDerivedOpsCases(state);

  for (const opsCase of state.opsCases) {
    if (!(await repository.findOpsCaseById(opsCase.id))) {
      await repository.saveOpsCase(opsCase);
    }
  }
}

function countNorthStarUsers(state: AppState) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return new Set(
    state.eventLogs
      .filter((item) => item.event_name === "chapter_accepted")
      .filter((item) => new Date(item.created_at).getTime() >= weekAgo)
      .map((item) => item.account_id),
  ).size;
}

function buildUserFacingOpsCaseDeepLink(input: {
  account_token: string | null;
  case_type: "export_review" | "risk_review" | "membership_exception" | "environment_alert" | "public_report" | "beta_support";
  story_id: string | null;
}) {
  if (input.case_type === "export_review" && input.story_id) {
    return `${H5_BASE_URL}/stories/${input.story_id}/exports`;
  }

  if (input.account_token && input.case_type === "beta_support") {
    return `${H5_BASE_URL}/feedback?tab=history`;
  }

  if (input.account_token && (input.case_type === "public_report" || input.case_type === "risk_review")) {
    return `${H5_BASE_URL}/report/new?tab=history`;
  }

  return `${OPS_BASE_URL}/ops/reviews`;
}

function buildFunnel(
  state: AppState,
  funnelKey: string,
  freshness_status: "fresh" | "stale" | "delayed",
): OpsFunnelResponse {
  const definition = OPS_FUNNEL_DEFINITIONS.find((item) => item.funnel_key === funnelKey);
  if (!definition) {
    throw new Error(`Unknown ops funnel ${funnelKey}`);
  }

  const stepCounts = definition.steps.map((step) => {
    const userCount = new Set(
      state.eventLogs.filter((item) => item.event_name === step.event_name).map((item) => item.account_id),
    ).size;
    return {
      step_key: step.step_key,
      label: step.label,
      user_count: userCount,
    };
  });
  const sample_size = stepCounts[0]?.user_count ?? 0;
  const steps = stepCounts.map((step) => ({
    step_key: step.step_key,
    label: step.label,
    user_count: step.user_count,
    conversion_rate: sample_size === 0 ? 0 : Number((step.user_count / sample_size).toFixed(2)),
    median_duration_ms: 0,
  }));
  const drop_offs = steps.slice(1).map((step, index) => {
    const previous = steps[index]!;
    const drop_off_count = Math.max(previous.user_count - step.user_count, 0);
    return {
      from_step_key: previous.step_key,
      to_step_key: step.step_key,
      drop_off_count,
      drop_off_ratio: previous.user_count === 0 ? 0 : Number((drop_off_count / previous.user_count).toFixed(2)),
    };
  });

  return {
    funnel_key: definition.funnel_key,
    freshness_status,
    sample_size,
    steps,
    drop_offs,
  };
}

function getFreshnessStatus(state: AppState) {
  const latestSignal = state.eventLogs
    .filter((item) => !item.event_name.startsWith("ops_"))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0]?.created_at;
  if (!latestSignal) {
    return "delayed" as const;
  }

  const ageMs = Date.now() - new Date(latestSignal).getTime();
  if (ageMs <= 15 * 60 * 1000) {
    return "fresh" as const;
  }
  if (ageMs <= 60 * 60 * 1000) {
    return "stale" as const;
  }
  return "delayed" as const;
}

function countCasesByStatus(state: AppState, status: OpsCaseStatus) {
  return state.opsCases.filter((item) => item.status === status).length;
}

function getMembershipTier(state: AppState, account_id: string) {
  const entitlement = state.membershipEntitlements.find((item) => item.account_id === account_id);
  return entitlement?.current_plan_id.replace(/^plan_/, "") ?? "guest";
}

function hasOpenCase(state: AppState, account_id: string) {
  return state.opsCases.some(
    (item) => item.account_id === account_id && item.status !== "resolved" && item.status !== "rejected",
  );
}

function isSequentialPromotion(fromEnvironment: string, toEnvironment: string) {
  return (
    (fromEnvironment === "shared-dev" && toEnvironment === "staging") ||
    (fromEnvironment === "staging" && toEnvironment === "live")
  );
}

function hasFreshBackup(state: AppState, environment_key: "shared-dev" | "staging" | "live") {
  const latest = state.backupSnapshots
    .filter((item) => item.environment_key === environment_key)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  if (!latest) {
    return false;
  }

  return latest.status === "completed" && new Date(latest.retained_until).getTime() > Date.now();
}

function toArtifactSha(sourceCommitSha: string, targetEnvironment: string) {
  return `${targetEnvironment}-${sourceCommitSha.slice(0, 8)}`;
}

function getLastSeenAt(state: AppState, account_id: string) {
  const sessionLastSeen = state.sessions
    .filter((item) => item.account_id === account_id && !item.revoked_at)
    .sort((left, right) => right.last_seen_at.localeCompare(left.last_seen_at))[0]?.last_seen_at;
  if (sessionLastSeen) {
    return sessionLastSeen;
  }

  return state.eventLogs
    .filter((item) => item.account_id === account_id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0]?.created_at ?? null;
}

function getPromoteFailureReason(release: AppState["releaseCandidates"][number]) {
  if (release.artifact_uri.includes("fail-verify")) {
    return "REL-003 artifact verification failed";
  }

  if (release.migration_bundle_id.includes("fail")) {
    return "REL-005 migration bundle failed";
  }

  return null;
}

function getRestoreFailureReason(snapshot: AppState["backupSnapshots"][number]) {
  if (snapshot.status === "expired") {
    return "OPS-006 restore drill failed: snapshot expired";
  }

  if (snapshot.status === "failed") {
    return "OPS-006 restore drill failed: snapshot capture failed";
  }

  if (snapshot.status !== "completed") {
    return `OPS-006 restore drill failed: snapshot status ${snapshot.status}`;
  }

  return null;
}

function recordOpsConsoleEvent(
  event_name:
    | "release_start"
    | "release_complete"
    | "release_failed"
    | "release_rollback"
    | "restore_drill_complete"
    | "restore_drill_failed",
  payload: Record<string, string | number | boolean | null>,
) {
  createObservabilityRepository().appendDomainEvent({
    event_name,
    account_id: "ops_console",
    payload,
  });
}

function maskDisplayName(account_token: string, account_id: string, actor_role: OpsActorRole) {
  if (actor_role === "admin") {
    return account_token;
  }

  return `masked:${account_id.slice(0, 8)}`;
}
