import type {
  OpsBetaIncidentCreateRequest,
  OpsBetaIncidentCreateResponse,
  OpsBetaIncidentResolveResponse,
  OpsBetaSupportOverviewResponse,
  OpsBetaAccessOverviewResponse,
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
import { resolveRuntimeApiBaseUrl } from "@erliu/shared-contracts/runtime-hosts";

const apiBaseUrl = resolveRuntimeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
const defaultActorRole = process.env.NEXT_PUBLIC_OPS_ACTOR_ROLE ?? "ops_support";

function withActorRole(path: string, actorRole = defaultActorRole) {
  const separator = path.includes("?") ? "&" : "?";
  return `${apiBaseUrl}${path}${separator}actor_role=${encodeURIComponent(actorRole)}`;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Ops API failed: ${response.status}`);
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export async function fetchOpsOverview(): Promise<OpsDashboardOverviewResponse> {
  const response = await fetch(withActorRole("/ops/dashboard/overview?dashboard_key=overview"), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsEnvironments(): Promise<OpsEnvironmentsResponse> {
  const response = await fetch(withActorRole("/ops/environments"), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsReleases(): Promise<OpsReleasesResponse> {
  const response = await fetch(withActorRole("/ops/releases"), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsBackups(): Promise<OpsBackupsResponse> {
  const response = await fetch(withActorRole("/ops/backups"), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsBetaAccessOverview(): Promise<OpsBetaAccessOverviewResponse> {
  const response = await fetch(withActorRole("/ops/beta-access"), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsBetaSupportOverview(): Promise<OpsBetaSupportOverviewResponse> {
  const response = await fetch(withActorRole("/ops/beta-support"), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function createOpsBetaIncident(
  input: OpsBetaIncidentCreateRequest,
): Promise<OpsBetaIncidentCreateResponse> {
  const response = await fetch(withActorRole("/ops/beta-support/incidents"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return readEnvelope(response);
}

export async function resolveOpsBetaIncident(incident_id: string): Promise<OpsBetaIncidentResolveResponse> {
  const response = await fetch(withActorRole(`/ops/beta-support/incidents/${encodeURIComponent(incident_id)}/resolve`), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  return readEnvelope(response);
}

export async function fetchOpsFunnel(funnelKey: string): Promise<OpsFunnelResponse> {
  const response = await fetch(withActorRole(`/ops/funnels/${encodeURIComponent(funnelKey)}`), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsUsers(input: {
  q?: string;
  membership_tier?: string;
  has_open_case?: boolean;
}): Promise<OpsUsersSearchResponse> {
  const query = new URLSearchParams();
  if (input.q) {
    query.set("q", input.q);
  }
  if (input.membership_tier) {
    query.set("membership_tier", input.membership_tier);
  }
  if (typeof input.has_open_case === "boolean") {
    query.set("has_open_case", String(input.has_open_case));
  }

  const response = await fetch(withActorRole(`/ops/users/search?${query.toString()}`), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsUser360(accountId: string): Promise<OpsUser360Response> {
  const response = await fetch(withActorRole(`/ops/users/${encodeURIComponent(accountId)}`), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsStory360(storyId: string): Promise<OpsStory360Response> {
  const response = await fetch(withActorRole(`/ops/stories/${encodeURIComponent(storyId)}`), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function fetchOpsReviewCases(input: {
  case_type?: string;
  status?: string;
}): Promise<OpsReviewCasesResponse> {
  const query = new URLSearchParams();
  if (input.case_type) {
    query.set("case_type", input.case_type);
  }
  if (input.status) {
    query.set("status", input.status);
  }

  const response = await fetch(withActorRole(`/ops/review-cases?${query.toString()}`), {
    cache: "no-store",
  });
  return readEnvelope(response);
}

export async function decideOpsReviewCase(input: {
  case_id: string;
  decision: "approve" | "warn" | "block" | "request_info" | "escalate";
  note: string;
  notify_user: boolean;
}): Promise<OpsReviewCaseDecisionResponse> {
  const response = await fetch(withActorRole(`/ops/review-cases/${encodeURIComponent(input.case_id)}/decision`), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      decision: input.decision,
      note: input.note,
      notify_user: input.notify_user,
    }),
  });
  return readEnvelope(response);
}

export async function createOpsRelease(input: {
  source_commit_sha: string;
  artifact_uri: string;
  target_environment: "shared-dev" | "staging" | "live";
  migration_bundle_id: string;
  change_summary: string;
}): Promise<OpsReleaseCreateResponse> {
  const response = await fetch(withActorRole("/ops/releases"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return readEnvelope(response);
}

export async function promoteOpsRelease(input: {
  release_id: string;
  from_environment: "shared-dev" | "staging" | "live";
  to_environment: "shared-dev" | "staging" | "live";
  approval_note: string;
  run_migrations: boolean;
}): Promise<OpsReleasePromoteResponse> {
  const response = await fetch(withActorRole(`/ops/releases/${encodeURIComponent(input.release_id)}/promote`), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from_environment: input.from_environment,
      to_environment: input.to_environment,
      approval_note: input.approval_note,
      run_migrations: input.run_migrations,
    }),
  });
  return readEnvelope(response);
}

export async function rollbackOpsRelease(input: {
  release_id: string;
  target_release_id: string;
  reason: string;
  include_migration_restore: boolean;
}): Promise<OpsReleaseRollbackResponse> {
  const response = await fetch(withActorRole(`/ops/releases/${encodeURIComponent(input.release_id)}/rollback`), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      target_release_id: input.target_release_id,
      reason: input.reason,
      include_migration_restore: input.include_migration_restore,
    }),
  });
  return readEnvelope(response);
}

export async function createOpsRestoreDrill(input: {
  environment_key: "shared-dev" | "staging" | "live";
  snapshot_id: string;
  drill_type: "db_only" | "db_and_object_storage" | "full_stack";
}): Promise<OpsRestoreDrillResponse> {
  const response = await fetch(withActorRole("/ops/restore-drills"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return readEnvelope(response);
}
